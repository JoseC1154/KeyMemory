# Browser-local audio transcription

`audio-transcription.js` is a small classic script. Loading it does not fetch a
model or start a worker. The first `window.KeyMemoryAudio.transcribe()` call
starts a dedicated worker and loads only same-origin static files under
`assets/audio/`. The audio samples are never sent in a request.

## API

```js
const controller = new AbortController();
const notes = await KeyMemoryAudio.transcribe(monoFloat32Samples, {
  signal: controller.signal,
  onProgress: ({stage, progress}) => {
    // stage: 'loading', 'transcribing', or 'processing'. progress: 0..1 per stage.
  }
});
// [{pitchMidi, startTimeSeconds, durationSeconds, amplitude}, ...]
```

Input must be a finite, nonempty `Float32Array`, mono at **22050 Hz**, and at most
**30 seconds**. The caller decodes, downmixes, trims and resamples first. There is
no automatic tempo estimate, quantization, pedal/controller data or pitch bends.
`KeyMemoryAudio.SAMPLE_RATE` and `.MAX_SECONDS` expose those limits.

The caller retains its original sample buffer. A newer valid call aborts the
older call. Aborting rejects with `name === 'AbortError'`. Success, abort, model
failure, worker failure and a throwing progress callback all terminate the worker
and release its complete JS/WASM/model allocation. Retry starts a fresh worker.

## Model and assets

- Official `@spotify/basic-pitch` **1.0.1**, model files copied unchanged.
- TFJS, TFJS core/converter and WASM backend **4.22.0**, one dependency registry.
- npm override replaces Basic Pitch's upstream TFJS `^3.2.0` dependency. Real-model
  parity tests cover this deliberate compatibility choice.
- Single-thread WASM, SIMD when available, baseline WASM otherwise. No GPU and no
  SharedArrayBuffer/cross-origin-isolation headers are required.
- The dedicated worker executes one 43,844-sample model window at a time. The
  official 30-frame overlap and frame-to-time conversion are preserved. Every
  inference window has a synchronous `tf.tidy` scope, including error paths.
- MIDI notes are clipped to the input duration and sorted by onset then pitch.
- Models can miss notes or create harmonic false positives. These results need
  a review/preview step and are not claimed to recover a recording perfectly.

## Rebuild

Normal static serving needs **no build step**. Keep the generated assets in the
repository. To reproduce them after a source/dependency change:

```sh
npm ci
npm run build:audio
```

The lockfile pins registry packages and integrity. The build copies model/WASM
files, bundles the worker, emits license notices and writes SHA-256 hashes into
`assets/audio/manifest.json`. Native-library license snapshots in
`scripts/licenses/` are from the pinned dependencies in TensorFlow.js
`tfjs-v4.22.0/WORKSPACE`, with their exact source URLs embedded. Rebuilding does
not download models or licenses separately.

## Verification

```sh
npm run test:audio-runtime
KEYMEMORY_DISABLE_SIMD=1 node tests/audio-transcription-model.mjs
npm run test:audio-browser # optional; requires Playwright and working Chromium
```

The default suite checks controller validation/cancellation/retry/failure cleanup,
real model inference, exact frame/onset parity with the upstream implementation,
repeat determinism, silence, 30-second inference and tensor disposal. The exact
browser bundle is also executed with real WASM in a browser-like VM using disk
responses. It checks same-origin asset-only GETs and failed-load shutdown.

Fixtures are self-generated harmonic tones, chords and a sustained note spanning
window boundaries. They are smoke tests, not an accuracy benchmark or a test of
real instrument recordings. All seven intended events are found, with one extra
harmonic in that fixture. In the checked environment each window returns to just
245 model tensors / 742,392 bytes and model disposal returns to zero tensors.

Native Chromium execution was blocked by the execution environment's socket
restriction, even with a temporary HOME and permitted escalation. The native
browser test is provided but was **not run successfully**. Real-browser/mobile
performance and compatibility, real recording accuracy, and audible playback
remain separate checks.
