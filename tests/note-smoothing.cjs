'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { smooth } = require('../note-smoothing.js');
const browser = { window: {} };
vm.runInNewContext(fs.readFileSync(require.resolve('../note-smoothing.js'), 'utf8'), browser);
assert.equal(typeof browser.window.KeyMemoryNoteSmoothing.smooth, 'function');
const note = (start, duration, extra = {}) => ({ note: 60, channel: 0, velocity: 65, start, duration,
  attackEvidence: { onset: .06, rise: .01, before: .6 }, ...extra });
const pair = (gap = 30, extra = {}) => [note(10.125, 400), note(410.125 + gap, 400, extra)];
const unchanged = (notes, strength = 100) => assert.deepEqual(smooth(notes, strength), { notes, joined: 0 });

// Off is an exact fresh clone, including fractional timing and optional fields.
const source = pair(20); source[0].id = 'first'; source[1].id = 'second';
const original = structuredClone(source);
for (const value of [0, -10, undefined, NaN, Infinity, '100'])
  assert.deepEqual(smooth(source, value), { notes: source, joined: 0 });
const off = smooth(source, 0);
assert.notEqual(off.notes, source); assert.notEqual(off.notes[0], source[0]);
assert.notEqual(off.notes[0].attackEvidence, source[0].attackEvidence);
const held = smooth(source, 100);
assert.equal(held.joined, 1); assert.equal(held.notes[0].duration, 820);
assert.deepEqual(held.notes[0], { ...source[0], duration: 820 });
assert.deepEqual(source, original);
unchanged(source, 0); // Changing back to Off uses the untouched source.
assert.deepEqual(smooth(source, 150), held);
unchanged([], 100);

// Adjacent false onset split and short confidence dropout are both eligible.
assert.equal(smooth(pair(0), 20).joined, 1);
const dropout = pair(60, { attackEvidence: { onset: .06, rise: .02, before: .16 } });
unchanged(dropout, 50); assert.equal(smooth(dropout, 100).joined, 1);
unchanged(pair(160), 50); assert.equal(smooth(pair(160), 100).joined, 1);
const weakSplit = pair(0, { attackEvidence: { onset: .27, rise: .01, before: .6 } });
unchanged(weakSplit, 50); assert.equal(smooth(weakSplit, 100).joined, 1);
const directSplit = pair(0, { attackEvidence: { onset: .55, rise: .01, before: .8 } });
for (const strength of [1, 25, 50, 75, 90]) unchanged(directSplit, strength);
assert.equal(smooth(directSplit, 100).joined, 1);
// Moderate direct onsets need strong continuity, not just an absolute low rise.
unchanged(pair(0, { attackEvidence: { onset: .55, rise: .03, before: .8 } }));
unchanged(pair(0, { attackEvidence: { onset: .55, rise: .01, before: .69 } }));
unchanged(pair(0, { attackEvidence: { onset: .65, rise: 0, before: 1 } }));
for (const strength of [1, 25, 50, 75, 100]) {
  // Strong onset, frame-only attack, and quiet relative-onset attack survive.
  unchanged(pair(0, { attackEvidence: { onset: .7, rise: 0, before: .7 } }), strength);
  unchanged(pair(0, { attackEvidence: { onset: .02, rise: .12, before: .7 } }), strength);
  unchanged(pair(20, { velocity: 20, attackEvidence: { onset: .12, rise: .01, before: .16 } }), strength);
  unchanged(pair(20, { attackEvidence: { onset: .02, rise: .06, before: .15 } }), strength);
}
// Staccato, actual rests, short taps, overlaps (including nested voices).
unchanged([note(0, 80), note(150, 80)]);
unchanged([note(0, 60), note(60, 60)]);
unchanged(pair(201)); assert.equal(smooth(pair(200), 100).joined, 1);
unchanged(pair(-1));
unchanged([note(0, 1000), note(100, 100), note(200, 100), note(1000, 400)]);

// Chord pitches and channels are independent; a clean boundary joins only its pitch.
const chord = [note(0, 400), note(0, 400, { note: 64 }), note(420, 400),
  note(420, 400, { note: 64, attackEvidence: { onset: .9, rise: .1, before: .5 } })];
assert.equal(smooth(chord, 100).joined, 1);
assert.deepEqual(smooth(chord, 100).notes.map(n => [n.note, n.start, n.duration]),
  [[60, 0, 820], [64, 0, 400], [64, 420, 400]]);
unchanged([note(0, 400), note(400, 400, { channel: 1 })]);
for (const attackEvidence of [undefined, {}, { onset: .01, rise: .01 },
  { onset: NaN, rise: 0, before: .6 }, { onset: -.1, rise: 0, before: .6 },
  { onset: 0, rise: 0, before: 1.1 }]) {
  unchanged(pair(0, { attackEvidence }));
  unchanged([note(0, 400, { attackEvidence }), note(400, 400)]);
}
for (const extra of [{ duration: 0 }, { start: -1 }, { note: 128 }, { channel: 16 }, { duration: Infinity }])
  unchanged([note(0, 400, extra), note(400, 400)]);

// A chain uses each ORIGINAL fragment's duration for gap guards, not its growing
// joined span. Frozen sources also prove the algorithm does not mutate input.
const chain = [note(0, 200), note(220, 80), note(380, 400)];
assert.equal(smooth(chain, 100).joined, 1);
const frozen = pair(20).map(n => Object.freeze({ ...n, attackEvidence: Object.freeze(n.attackEvidence) }));
Object.freeze(frozen); assert.equal(smooth(frozen, 100).joined, 1);
const unsorted = [note(420, 400, { id: 'later' }), note(0, 400, { id: 'earlier' }), note(0, 400, { note: 64 })];
assert.deepEqual(smooth(unsorted, 100).notes.map(n => n.id), ['earlier', undefined]);
// Dense input exercises grouping and nonquadratic overlap protection.
const dense = Array.from({ length: 20000 }, (_, i) => note(Math.floor(i / 20) * 420, 400, { note: 40 + i % 20 }));
const snapshot = structuredClone(dense), merged = smooth(dense, 100);
assert.equal(merged.notes.length, 20); assert.equal(merged.joined, 19980);
assert.deepEqual(dense, snapshot);
assert.equal(smooth(Array.from({ length: 20000 }, (_, i) => note(i, 30000)), 100).joined, 0);
console.log('PASS note smoothing: reversible Off, attack-aware joins, variable strength, quiet repeats, staccato, chords, overlaps, evidence/bounds, immutable dense input. Synthetic fixtures do not establish recording accuracy.');
