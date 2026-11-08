// Real official model + pinned WASM, no network or user audio required.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as tf from '@tensorflow/tfjs-core';
import {BasicPitch} from '@spotify/basic-pitch';
import {initializeBackend, loadModel, transcribeWithModel, evaluateFrames, SAMPLE_RATE} from '../audio-runtime/runtime.mjs';
import fixtures from './audio-fixtures.cjs';
import smoothing from '../note-smoothing.js';
import importer from '../audio-import.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const asset = name => path.join(root, 'assets/audio', name);
const manifest = JSON.parse(await readFile(asset('manifest.json'), 'utf8'));
for (const [name, info] of Object.entries(manifest.files)) {
  const bytes = await readFile(asset(name));
  assert.equal(bytes.length, info.bytes, `${name}: size`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), info.sha256, `${name}: checksum`);
}
if (process.env.KEYMEMORY_DISABLE_SIMD === '1') tf.env().set('WASM_HAS_SIMD_SUPPORT', false);
await initializeBackend(path.join(root, 'assets/audio/'));
assert.equal(tf.getBackend(), 'wasm');
assert.equal(tf.env().get('WASM_HAS_MULTITHREAD_SUPPORT'), false);
const json = JSON.parse(await readFile(asset('model.json'), 'utf8'));
const bytes = await readFile(asset('group1-shard1of1.bin'));
const model = await loadModel(tf.io.fromMemory({modelTopology: json.modelTopology,
  weightSpecs: json.weightsManifest.flatMap(group => group.weights),
  weightData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)}));
const baseline = tf.memory();
const checkMemory = (value = tf.memory()) => {
  assert.equal(value.numTensors, baseline.numTensors, 'no retained inference tensors');
  assert.equal(value.numBytes, baseline.numBytes, 'only model weight bytes remain');
};
const started = Date.now();
try {
  const samples = fixtures.synthesize(fixtures.melody, 7);
  const notes = await transcribeWithModel(model, samples, {afterWindow: checkMemory});
  for (const expected of fixtures.melody) {
    const found = notes.find(note => note.pitchMidi === expected.pitch && Math.abs(note.startTimeSeconds - expected.start) < 0.12);
    assert(found, `model recognizes MIDI ${expected.pitch} at ${expected.start}s`);
    assert(Math.abs(found.durationSeconds - expected.duration) < 0.2, 'bounded duration error including cross-window sustain');
  }
  assert(notes.every(note => note.startTimeSeconds >= 0 && note.startTimeSeconds + note.durationSeconds <= 7));
  const repeated = await transcribeWithModel(model, samples, {afterWindow: checkMemory});
  const detailed = await transcribeWithModel(model, samples, {includeAttackEvidence:true,afterWindow:checkMemory});
  assert.deepEqual(detailed.map(({attackEvidence,...n})=>n),notes,'evidence preserves exact original model notes');
  assert(detailed.every(n=>Object.values(n.attackEvidence).every(v=>Number.isFinite(v)&&v>=0&&v<=1)));
  const articulated = [
    {pitch:60,start:.2,duration:.35}, {pitch:60,start:.6,duration:.35}, {pitch:60,start:1,duration:.35,gain:.12},
    {pitch:64,start:1.6,duration:.15}, {pitch:64,start:1.85,duration:.15},
    {pitch:67,start:2.5,duration:2.6}, {pitch:72,start:2.5,duration:2.6}
  ];
  const articulatedOutput=await transcribeWithModel(model,fixtures.synthesize(articulated,5.5),{includeAttackEvidence:true,afterWindow:checkMemory});
  const smoothed=smoothing.smooth(importer.normalizeNotes(articulatedOutput,5500),100).notes;
  for(const expected of articulated) assert(smoothed.some(n=>n.note===expected.pitch&&Math.abs(n.start-expected.start*1000)<120),'maximum smoothing preserves synthetic reattacks, quiet repeat, staccato, and cross-window chord');
  assert(smoothed.every(n=>n.start>=0&&n.start+n.duration<=5500));
  console.log('Maximum smoothing real-model smoke: repeated and quiet strikes, staccato, cross-window sustained chord retained; evidence output matches unmodified notes.');
  assert.deepEqual(repeated, notes, 'repeat inference is deterministic');
  checkMemory();

  // Exact parity with official prepareData/window/unwrap semantics. Put the
  // upstream reference's leaking helper in one outer scope solely for this test.
  const referenceSamples = samples.slice(0, SAMPLE_RATE * 3);
  const actual = await evaluateFrames(model, referenceSamples, {afterWindow: checkMemory});
  const reference = {frames: [], onsets: []};
  tf.engine().startScope();
  try {
    const basic = new BasicPitch(Promise.resolve(model));
    await basic.evaluateModel(referenceSamples, (frames, onsets) => {
      reference.frames.push(...frames); reference.onsets.push(...onsets);
    }, () => {});
  } finally { tf.engine().endScope(); }
  assert.deepEqual(actual, reference, 'same frame/onset output as official Basic Pitch');
  checkMemory();

  let cancel = false;
  await assert.rejects(transcribeWithModel(model, samples, {
    shouldCancel: () => cancel,
    afterWindow: state => {checkMemory(state); cancel = true;}
  }), {name: 'AbortError'});
  checkMemory();
  await assert.rejects(transcribeWithModel(model, samples, {afterWindow: () => {throw new Error('injected failure');}}), /injected failure/);
  checkMemory();
  const badModel = {execute() {tf.zeros([64]); throw new Error('inference failed');}};
  await assert.rejects(transcribeWithModel(badModel, samples), /inference failed/);
  checkMemory();
  assert.deepEqual(await transcribeWithModel(model, new Float32Array(1)), []);
  assert.deepEqual(await transcribeWithModel(model, new Float32Array(SAMPLE_RATE)), [], 'silence has no notes');
  // Full duration is real inference across all 19 windows, not a mock.
  assert.deepEqual(await transcribeWithModel(model, new Float32Array(SAMPLE_RATE * 30), {afterWindow: checkMemory}), []);
  checkMemory();
  console.log(`Real Basic Pitch/WASM: ${notes.length} events, all 7 intended notes recovered; reference parity, repeat, silence, 30-second limit, abort/error memory checks passed in ${Date.now() - started}ms.`);
  console.log(`Retained model memory: ${baseline.numTensors} tensors / ${baseline.numBytes} bytes. Synthetic audio is a smoke test, not an accuracy benchmark.`);
} finally { model.dispose(); }
assert.equal(tf.memory().numTensors, 0);
assert.equal(tf.memory().numBytes, 0);
console.log('Model disposal: 0 tensors / 0 bytes.');
