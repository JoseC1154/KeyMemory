(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KeyMemoryPhraseAudition = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const MAX_VOICES = 64, MAX_SECONDS = .6, ATTACK = .006, RELEASE = .024, CANCEL = .018;

  function create({ getContext, canPlay = () => true } = {}) {
    let generation = 0;
    const voices = new Set();
    const allowed = () => { try { return !!canPlay(); } catch (_) { return false; } };
    function dispose(v) {
      voices.delete(v);
      try { v.osc.disconnect(); } catch (_) {}
      try { v.gain.disconnect(); } catch (_) {}
    }
    function valueAt(v, t) {
      if (t <= v.start || t >= v.end) return 0;
      if (t < v.attackEnd) return v.level * (t - v.start) / (v.attackEnd - v.start);
      if (t <= v.releaseStart) return v.level;
      return v.level * (v.end - t) / (v.end - v.releaseStart);
    }
    function silence() {
      for (const v of voices) {
        const now = v.context.currentTime;
        if (now >= v.stopAt) { dispose(v); continue; }
        // Repeated cancellation must never restart or prolong a fade.
        if (v.cancelled) continue;
        v.cancelled = true;
        const value = valueAt(v, now), param = v.gain.gain;
        const end = Math.min(v.end, now + CANCEL);
        try {
          if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
          else {
            param.cancelScheduledValues(now);
            // A ramp endpoint preserves the already-rendered part of a ramp.
            if (now > v.start && (now <= v.attackEnd || now > v.releaseStart)) param.linearRampToValueAtTime(value, now);
            else param.setValueAtTime(value, now);
          }
          param.linearRampToValueAtTime(0, Math.max(now, end));
          v.stopAt = value > 0 ? Math.max(now, end) : now;
          v.cancelValue = value; v.cancelAt = now;
          v.osc.stop(v.stopAt);
          if (value === 0) dispose(v);
        } catch (_) { try { v.osc.stop(now); } catch (_) {} dispose(v); }
      }
    }
    function stop() { generation++; silence(); }
    async function play(notes) {
      const token = ++generation;
      silence();
      if (!allowed() || !Array.isArray(notes) || !notes.length || typeof getContext !== 'function') return 0;
      // Snapshot caller-owned data before any asynchronous context/resume work.
      const batch = notes.filter(n => n && Number.isInteger(n.note) && n.note >= 0 && n.note <= 127 && Number.isFinite(n.duration) && n.duration >= 0 && (n.velocity === undefined || (Number.isFinite(n.velocity) && n.velocity > 0)) && (n.offset === undefined || Number.isFinite(n.offset))).slice(0, MAX_VOICES).map(n => ({ ...n }));
      if (!batch.length) return 0;
      let context;
      try {
        context = await getContext();
        if (token !== generation || !allowed() || !context || context.state === 'closed') return 0;
        if (context.state === 'suspended' && typeof context.resume === 'function') await context.resume();
      } catch (_) { return 0; }
      if (token !== generation || !allowed() || !context || context.state === 'closed' || context.state === 'suspended') return 0;
      for (const v of voices) if (v.context.currentTime >= v.stopAt) dispose(v);
      const base = context.currentTime;
      const retiringLevel = [...voices].reduce((sum, v) => sum + (v.cancelled && v.stopAt > v.cancelAt ? v.cancelValue * Math.max(0, (v.stopAt - v.context.currentTime) / (v.stopAt - v.cancelAt)) : v.level), 0);
      const voiceLevel = Math.min(.12, Math.max(0, .3 - retiringLevel) / batch.length);
      let count = 0;
      for (const n of batch) {
        // Retiring voices count too, bounding rapid scrub traffic, not only chords.
        if (voices.size >= MAX_VOICES) break;
        const offset = Math.max(0, (n.offset || 0) / 1000);
        if (offset > MAX_SECONDS - ATTACK - RELEASE) continue;
        const start = base + offset;
        const attackEnd = start + ATTACK;
        const releaseStart = Math.min(base + MAX_SECONDS - RELEASE, start + Math.max(ATTACK, n.duration / 1000));
        const end = releaseStart + RELEASE;
        const level = Math.min(127, n.velocity === undefined ? 100 : n.velocity) / 127 * voiceLevel;
        let osc, gain, v;
        try {
          osc = context.createOscillator(); gain = context.createGain();
          osc.type = 'triangle'; osc.frequency.value = 440 * Math.pow(2, (n.note - 69) / 12);
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(level, attackEnd);
          gain.gain.setValueAtTime(level, releaseStart);
          gain.gain.linearRampToValueAtTime(0, end);
          osc.connect(gain); gain.connect(context.destination);
          v = { osc, gain, context, start, attackEnd, releaseStart, end, level, stopAt: end, cancelled: false };
          voices.add(v); osc.onended = () => dispose(v);
          osc.start(start); osc.stop(end); count++;
        } catch (_) {
          if (osc) { try { osc.stop(context.currentTime); } catch (_) {} try { osc.disconnect(); } catch (_) {} }
          if (gain) { try { gain.disconnect(); } catch (_) {} }
          if (v) voices.delete(v);
        }
      }
      return count;
    }
    return { play, stop };
  }
  return { create };
});
