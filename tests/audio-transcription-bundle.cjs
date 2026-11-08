// Runs the exact generated browser worker in a browser-like VM with real WASM.
// Asset fetches are served from disk, never the network. This is NOT a browser
// compatibility test; it catches bundling/URL/model/protocol regressions.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const {synthesize, melody} = require('./audio-fixtures.cjs');
const root = path.resolve(__dirname, '..');
const prefix = 'https://keymemory.invalid/subdirectory/assets/audio/';
async function run(samples, failModel = false) {
  const requests = [];
  const messages = [];
  let closed = false;
  let complete;
  const done = new Promise(resolve => {complete = resolve;});
  const globals = {
    console, URL, Request, Response, Headers, TextEncoder, TextDecoder, atob, btoa,
    Float32Array, Int32Array, Uint8Array, Uint32Array, Uint16Array, Int8Array, Int16Array, Float64Array, ArrayBuffer,
    WebAssembly, performance, setTimeout, clearTimeout,
    location: {href: prefix + 'audio-transcription-worker.js'},
    WorkerGlobalScope: class WorkerGlobalScope {},
    importScripts: () => {throw new Error('Unexpected external script load');},
    fetch: async (input, options = {}) => {
      const url = typeof input === 'string' ? input : input.url || input.href;
      assert(url.startsWith(prefix), `same-origin asset only: ${url}`);
      assert.equal(options.method || 'GET', 'GET');
      assert(!options.body, 'audio is never uploaded');
      const filename = new URL(url).pathname.split('/').at(-1);
      assert(['model.json', 'group1-shard1of1.bin', 'tfjs-backend-wasm.wasm', 'tfjs-backend-wasm-simd.wasm'].includes(filename));
      requests.push(filename);
      if (failModel && filename === 'model.json') return new Response('Unavailable', {status: 503});
      const data = await fs.readFile(path.join(root, 'assets/audio', filename));
      return new Response(data, {headers: {'Content-Type': filename.endsWith('.wasm') ? 'application/wasm' : filename.endsWith('.json') ? 'application/json' : 'application/octet-stream', 'Content-Length': String(data.length)}});
    },
    postMessage: message => {messages.push(message);},
    close: () => {closed = true; complete();}
  };
  globals.self = globals;
  const context = vm.createContext(globals);
  vm.runInContext(await fs.readFile(path.join(root, 'assets/audio/audio-transcription-worker.js'), 'utf8'), context);
  await context.onmessage({data: {samples, includeAttackEvidence: true}});
  await done;
  assert(closed);
  return {requests, messages};
}
(async () => {
  const samples = synthesize(melody, 7);
  const {requests, messages} = await run(samples);
  assert(!messages.some(message => message.type === 'error'), JSON.stringify(messages.at(-1)));
  const result = messages.find(message => message.type === 'result');
  assert(result, 'compiled worker returns a result');
  for (const expected of melody) {
    assert(result.notes.some(note => note.pitchMidi === expected.pitch && Math.abs(note.startTimeSeconds - expected.start) < 0.12));
  }
  assert(result.notes.every(note => ['onset','rise','before'].every(key => Number.isFinite(note.attackEvidence?.[key]))), 'worker returns compact attack evidence');
  assert(requests.includes('model.json') && requests.includes('group1-shard1of1.bin'));
  assert(requests.some(name => name.endsWith('.wasm')));
  assert(!requests.some(name => name.includes('threaded')));
  const failed = await run(samples, true);
  assert(failed.messages.some(message => message.type === 'error'), 'asset failure is reported and closes worker');
  console.log(`Generated browser bundle VM: real WASM recognized all 7 expected notes; ${requests.join(', ')} fetched locally via GET only; failure cleanup passed. Native browser remains separate.`);
})().catch(error => {console.error(error); process.exitCode = 1;});
