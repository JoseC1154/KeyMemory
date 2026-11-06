// Pure controller lifecycle checks. No model/audio uploads or browser required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'audio-transcription.js'), 'utf8');
function fixture(overrides = {}) {
  const workers = [];
  class Worker {
    constructor(url, options) { this.url = url; this.options = options; this.terminations = 0; workers.push(this); }
    postMessage(message, transfers) { this.sent = message; this.transfers = transfers; }
    terminate() { this.terminations++; }
    emit(data) { if (this.onmessage) this.onmessage({data}); }
  }
  const window = {Worker, WebAssembly, ...overrides};
  vm.runInNewContext(source, {window, Float32Array, URL, Error, TypeError, RangeError,
    document: {currentScript: {src: 'https://example.test/KeyMemory/audio-transcription.js'}, baseURI: 'https://example.test/KeyMemory/'}});
  return {api: window.KeyMemoryAudio, workers};
}
(async () => {
  let {api, workers} = fixture();
  const samples = new Float32Array([0, 0.1, -0.1]);
  assert.equal(api.SAMPLE_RATE, 22050);
  assert.equal(api.MAX_SECONDS, 30);
  assert.equal(workers.length, 0, 'runtime stays lazy');
  const updates = [];
  let promise = api.transcribe(samples, {onProgress: value => updates.push(value)});
  let worker = workers[0];
  assert.equal(worker.url, 'https://example.test/KeyMemory/assets/audio/audio-transcription-worker.js');
  assert.notEqual(worker.sent.samples.buffer, samples.buffer, 'caller retains samples');
  assert.deepEqual(worker.sent.samples, samples);
  assert.equal(worker.transfers[0], worker.sent.samples.buffer);
  worker.emit({type: 'progress', stage: 'loading', progress: 0.5});
  assert.equal(updates[0].progress, 0.5);
  const notes = [{pitchMidi: 60, startTimeSeconds: 0, durationSeconds: 1, amplitude: 0.7}];
  const stale = worker.onmessage;
  worker.emit({type: 'result', notes});
  assert.deepEqual(await promise, notes);
  assert.equal(worker.terminations, 1);
  assert.equal(worker.onmessage, null);
  stale({data: {type: 'progress', stage: 'processing', progress: 1}});
  assert.equal(updates.length, 1, 'late callbacks ignored');

  for (const invalid of [[], new Float32Array(), new Float32Array(22050 * 30 + 1), new Float32Array([NaN]), new Float32Array([Infinity])]) {
    await assert.rejects(api.transcribe(invalid));
  }
  assert.equal(workers.length, 1, 'invalid input never starts a worker');
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(api.transcribe(samples, {signal: aborted.signal}), {name: 'AbortError'});
  assert.equal(workers.length, 1);

  for (const stage of ['loading', 'transcribing', 'processing']) {
    const aborter = new AbortController();
    promise = api.transcribe(samples, {signal: aborter.signal});
    worker = workers.at(-1);
    worker.emit({type: 'progress', stage, progress: 0});
    aborter.abort();
    await assert.rejects(promise, {name: 'AbortError'});
    assert.equal(worker.terminations, 1, `abort during ${stage} terminates`);
  }
  const first = api.transcribe(samples);
  const firstRejected = assert.rejects(first, {name: 'AbortError'});
  const older = workers.at(-1);
  const second = api.transcribe(samples);
  assert.equal(older.terminations, 1, 'new call cancels old call');
  workers.at(-1).emit({type: 'result', notes: []});
  await firstRejected;
  assert.deepEqual(await second, []);

  for (const kind of ['onerror', 'onmessageerror', 'error', 'invalid-result']) {
    promise = api.transcribe(samples);
    worker = workers.at(-1);
    if (kind === 'error') worker.emit({type: 'error', message: 'Model fetch failed', name: 'NetworkError'});
    else if (kind === 'invalid-result') worker.emit({type: 'result', notes: {}});
    else worker[kind]({});
    await assert.rejects(promise);
    assert.equal(worker.terminations, 1, `${kind} cleans up`);
  }
  promise = api.transcribe(samples, {onProgress: () => { throw new Error('callback failed'); }});
  worker = workers.at(-1);
  worker.emit({type: 'progress', stage: 'loading', progress: 0});
  await assert.rejects(promise, /callback failed/);
  assert.equal(worker.terminations, 1);
  ({api, workers} = fixture({Worker: undefined}));
  await assert.rejects(api.transcribe(samples), /Web Workers and WebAssembly/);
  assert.equal(workers.length, 0);
  ({api} = fixture({Worker: class {constructor() {throw new Error('worker blocked');}}}));
  await assert.rejects(api.transcribe(samples), /worker blocked/);
  console.log('Audio transcription controller: lazy load, validation, cancellation in every stage, superseding, stale callbacks and failure cleanup passed.');
})().catch(error => {console.error(error); process.exitCode = 1;});
