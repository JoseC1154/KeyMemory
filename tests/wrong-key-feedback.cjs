// Shared feedback through actual app click handlers and simulated raw MIDI.
// Deterministic DOM tests do not establish animation pixels or physical MIDI latency.
const { JSDOM } = require('jsdom');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const savedPhrase = { version: 1, sourceBpm: 120, duration: 1000, notes: [
  { note: 60, velocity: 90, channel: 0, start: 0, duration: 400 },
  { note: 64, velocity: 90, channel: 0, start: 600, duration: 400 }
] };
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const w = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    pretendToBeVisual: true, runScripts: 'outside-only', url: 'https://keymemory.test/'
  }).window;
  const d = w.document;
  w.localStorage.setItem('keymemory.phrase.v1', JSON.stringify(savedPhrase));
  w.matchMedia = () => ({ matches: false });
  w.ResizeObserver = class { observe() {} };
  Object.defineProperty(w, 'isSecureContext', { value: true });
  let now = 1000, id = 0;
  const timers = new Map();
  w.Date.now = w.performance.now = () => now;
  w.setTimeout = (fn, delay) => { timers.set(++id, { fn, time: now + delay }); return id; };
  w.setInterval = (fn, delay) => { timers.set(++id, { fn, time: now + delay, repeat: delay }); return id; };
  w.clearTimeout = w.clearInterval = id => timers.delete(id);
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      const next = [...timers].filter(([, t]) => t.time <= end).sort((a, b) => a[1].time - b[1].time)[0];
      if (!next) break;
      const [id, timer] = next;
      now = timer.time;
      if (timer.repeat) timer.time += timer.repeat; else timers.delete(id);
      timer.fn();
    }
    now = end;
  }
  const port = { id: 'yc', name: 'YC Series Port 1', state: 'connected', open: () => Promise.resolve(), close: () => Promise.resolve() };
  w.navigator.requestMIDIAccess = () => Promise.resolve({ inputs: new Map([['yc', port]]) });
  for (const file of ['midi.js', 'phrase.js']) w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  w.eval(fs.readFileSync(path.join(root, 'app.js'), 'utf8') + `\nwindow.feedbackTest = {
    mode: activateMode, render: renderPiano, clear: clearWrongKeyFeedback, flash: flashWrongKey,
    phrase: phraseEngine,
    scaleDegrees: () => {
      clearScaleDelay(); stopCountdown(); scalePhase='degrees'; scaleIndex=2;
      scaleTarget=scaleNotes[2]; targetMidi=scaleTarget; scaleDegreeDeadline=performance.now()+2000;
      selected.clear(); renderPiano(); updatePracticeChrome();
    },
    get: () => ({ target:targetMidi, chordAnswer, deadline, countdown, selected:[...selected],
      builderNotes:[...builderNotes], builderStep, dictionaryVoicing:[...dictionaryVoicing],
      scalePhase, scaleLives, scaleRuns, scaleStreak, scaleCorrection, feedback:[...wrongKeyFeedback.keys()] })
  };`);
  const api = w.feedbackTest, el = id => d.getElementById(id), key = note => d.querySelector(`[data-midi="${note}"]`);
  const send = (note, velocity = 100) => port.onmidimessage?.({ data: new Uint8Array([0x90, note, velocity]), timeStamp: now });
  function begin(mode) {
    api.mode(mode.startsWith('scale') ? 'scale' : mode);
    if (mode === 'remember') advance(1800);
    if (mode === 'dictionary') el('toggleChordNotes').click();
    if (mode === 'scale-race') { el('scaleStart').click(); el('confirmScaleRun').click(); }
    if (mode === 'scale-degrees') api.scaleDegrees();
    if (mode === 'phrase') { api.phrase.practice(); advance(2000); }
    const state = api.get();
    return [...d.querySelectorAll('.key')].map(k => +k.dataset.midi).find(note =>
      mode === 'dictionary' ? !state.dictionaryVoicing.includes(note) :
      mode === 'phrase' ? !api.phrase.snapshot().target.includes(note) :
      mode === 'degrees' ? note % 12 !== state.chordAnswer : note % 12 !== state.target % 12);
  }
  return { w, d, api, el, key, advance, begin, send, get: api.get,
    connect: async () => { el('connectMidi').click(); await flush(); },
    press: (note, source) => source === 'midi' ? send(note) : key(note).click(), close: () => w.close() };
}
(async () => {
  const modes = ['find', 'remember', 'semitones', 'degrees', 'builder', 'dictionary', 'scale-race', 'scale-degrees', 'phrase'];
  for (const source of ['screen', 'midi']) {
    const h = setup();
    if (source === 'midi') await h.connect();
    for (const mode of modes) {
      const wrong = h.begin(mode), before = h.get(), phraseBefore = JSON.stringify(h.api.phrase.snapshot().notes);
      h.press(wrong, source);
      assert(h.key(wrong).classList.contains('wrongAnswer'), `${mode}/${source}: wrong note uses shared feedback`);
      assert(!h.key(wrong).classList.contains('selected'), `${mode}/${source}: not selected as correct`);
      const retained=h.key(wrong);
      h.advance(300); h.api.render();
      assert.equal(h.key(wrong),retained,`${mode}: rerender retains the live animation element`);
      assert.equal(h.key(wrong).style.getPropertyValue('--wrong-key-delay'), '0ms', `${mode}: retained animation does not double-count elapsed time`);
      retained.remove();h.api.render();
      assert.equal(h.key(wrong).style.getPropertyValue('--wrong-key-delay'), '-300ms', `${mode}: a newly visible key resumes at elapsed time`);
      h.advance(649); assert(h.key(wrong).classList.contains('wrongAnswer'), `${mode}: remains through 949ms`);
      h.advance(1); assert(!h.key(wrong).classList.contains('wrongAnswer'), `${mode}: clears at 950ms`);
      assert.equal(h.key(wrong).style.getPropertyValue('--wrong-key-delay'), '');
      assert.equal(h.get().feedback.length, 0);
      if (mode.startsWith('scale')) {
        assert.equal(h.get().scalePhase, 'correction');
        assert.equal(h.get().scaleLives, before.scaleLives - 1);
        assert.equal(h.get().scaleRuns, before.scaleRuns);
        assert.equal(h.get().scaleStreak, before.scaleStreak);
        assert(h.key(before.target).classList.contains('correctionTarget'));
        h.advance(60000);
        assert(h.key(before.target).classList.contains('correctionTarget'), 'correct answer remains until Continue');
        const stable = h.get(); h.press(wrong, source); assert.deepEqual(h.get(), stable, 'correction input cannot spend another life');
        h.el('continueScaleCorrection').click();
        assert.notEqual(h.get().scalePhase, 'correction');
      } else if (mode === 'phrase') {
        assert.equal(JSON.stringify(h.api.phrase.snapshot().notes), phraseBefore, 'phrase remains unchanged');
        assert.equal(h.api.phrase.snapshot().state, source === 'midi' ? 'wait-release' : 'countin');
      } else {
        assert.equal(h.get().target, before.target);
        assert.equal(h.get().deadline, before.deadline);
        assert.equal(h.get().countdown, before.countdown);
        assert.deepEqual(h.get().builderNotes, before.builderNotes);
        assert.equal(h.get().builderStep, before.builderStep);
      }
      if (source === 'midi') h.send(wrong, 0);
    }
    // Exploration and non-answer phases must not invent wrong answers.
    for (const mode of ['free', 'dictionary', 'remember', 'scale', 'phrase']) {
      h.api.mode(mode); h.press(49, source);
      assert.equal(h.d.querySelectorAll('.wrongAnswer').length, 0, `${mode}/${source}: ungraded input stays ungraded`);
      if (source === 'midi') h.send(49, 0);
    }
    h.close();
  }
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  assert.match(css, /wrongKeyFade 950ms linear forwards/);
  assert(!/scaleCorrectionMode[^{}]*wrongAnswer/.test(css), 'Scale must not override the global wrong-key colors or animation');
  const h = setup();
  const wrong = h.begin('semitones');
  h.press(wrong); h.advance(600); h.press(wrong); h.advance(350);
  assert(h.key(wrong).classList.contains('wrongAnswer'), 'original timer cannot clear repeat flash');
  h.advance(600); assert(!h.key(wrong).classList.contains('wrongAnswer'));
  h.press(wrong); h.api.clear();
  assert.equal(h.d.querySelectorAll('.wrongAnswer').length, 0, 'explicit clear updates current DOM immediately');
  h.api.mode('free'); h.key(wrong).click(); h.advance(1000);
  assert(h.key(wrong).classList.contains('selected'), 'stale feedback cannot erase free selection');
  for (const invalid of [null, undefined, NaN, -1, 128, '60']) h.api.flash(invalid);
  assert.equal(h.get().feedback.length, 0, 'missing notes/timeouts never invent a red key');
  // Keep a true off-screen MIDI note, never substitute an incorrect octave.
  await h.connect(); h.begin('builder'); h.send(120);
  assert(!h.key(120)); assert(h.get().feedback.includes(120));
  h.advance(950); assert.equal(h.get().feedback.length, 0); h.send(120, 0);
  h.close();
  console.log('PASS: shared 950ms feedback in all graded modes through screen and raw MIDI; rerenders; repeated mistakes; Scale correction/progress preserved; Phrase retained; exploration ignored; immediate cleanup; invalid/off-screen notes.');
})().catch(error => { console.error(error); process.exitCode = 1; });
