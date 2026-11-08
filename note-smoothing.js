(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KeyMemoryNoteSmoothing = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function clone(note) {
    const copy = { ...note };
    if (note.attackEvidence) copy.attackEvidence = { ...note.attackEvidence };
    return copy;
  }
  function evidence(note) {
    const e = note.attackEvidence;
    return e && ['onset', 'rise', 'before'].every(key =>
      Number.isFinite(e[key]) && e[key] >= 0 && e[key] <= 1) ? e : null;
  }
  function valid(note) {
    return Number.isInteger(note.note) && note.note >= 0 && note.note <= 127 &&
      Number.isInteger(note.channel) && note.channel >= 0 && note.channel <= 15 &&
      Number.isFinite(note.start) && note.start >= 0 &&
      Number.isFinite(note.duration) && note.duration > 0 &&
      Number.isFinite(note.start + note.duration);
  }

  // Heuristic for model fragments, not quantization or attack detection. Always
  // recompute from the original detection when changing strength (including Off).
  function smooth(notes, strength) {
    const result = notes.map(clone);
    const amount = Number.isFinite(strength) ? Math.max(0, Math.min(100, strength)) / 100 : 0;
    if (!amount) return { notes: result, joined: 0 };
    const groups = new Map();
    result.forEach((note, index) => {
      if (!valid(note)) return;
      const key = note.channel + ':' + note.note;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ note, index, end: note.start + note.duration, blocked: false });
    });
    const removed = new Set();
    let joined = 0;
    for (const group of groups.values()) {
      group.sort((a, b) => a.note.start - b.note.start || a.index - b.index);
      // Protect every member of an overlapping component, including contained
      // voices. Sorting and a running maximum avoid a quadratic overlap scan.
      let component = [], maxEnd = -Infinity;
      function finishComponent() {
        if (component.length > 1) for (const item of component) item.blocked = true;
      }
      for (const item of group) {
        if (item.note.start >= maxEnd) {
          finishComponent(); component = []; maxEnd = -Infinity;
        }
        component.push(item); maxEnd = Math.max(maxEnd, item.end);
      }
      finishComponent();
      let previous = null, anchor = null;
      for (const current of group) {
        const a = previous && previous.note, b = current.note;
        const e = evidence(b);
        const gap = previous ? b.start - previous.end : Infinity;
        // Strength widens the gap tolerance (20–200 ms). The curved onset
        // ceiling (.12–.60) keeps low settings conservative while allowing a
        // doubtful direct model onset (> .50) near maximum strength. These are
        // heuristics, not calibrated probabilities: a weak real reattack can
        // still be indistinguishable from a false split.
        // Moderate onsets need strong preceding energy with almost no rise.
        // Only that strong continuity permits the looser relative onset guard;
        // quiet notes retain the stricter ratio to protect quiet reattacks.
        const continuous = e && e.before >= .70 && e.rise < .025;
        const canJoin = previous && !previous.blocked && !current.blocked &&
          evidence(a) && e && a.duration >= 70 && b.duration >= 70 &&
          gap >= 0 && gap <= 20 + 180 * amount &&
          gap <= Math.min(a.duration, b.duration) * .5 &&
          e.before >= .30 - .18 * amount &&
          e.onset < .12 + .48 * amount * amount &&
          (e.onset < .30 || continuous) &&
          e.onset < (continuous ? .80 : .65) * e.before &&
          e.rise < .025 + .055 * amount && e.rise < .35 * e.before;
        if (canJoin) {
          // Keep the first fragment's identity, velocity and attack evidence;
          // only its duration changes. No pitch, channel, or other timing edits.
          anchor.note.duration = current.end - anchor.note.start;
          removed.add(current.index); joined++;
        } else {
          anchor = current;
        }
        previous = current;
      }
    }
    // Preserve source order, even for unsorted detections. No in-place sorting.
    return { notes: result.filter((_, index) => !removed.has(index)), joined };
  }
  return { smooth };
});
