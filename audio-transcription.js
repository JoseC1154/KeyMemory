/* Lazy, browser-local Basic Pitch controller. No model or audio is loaded until
 * transcribe() is called. All model/runtime fetches stay on this site's origin. */
(function (global) {
  'use strict';
  const SAMPLE_RATE = 22050;
  const MAX_SECONDS = 30;
  const script = typeof document !== 'undefined' && document.currentScript;
  const base = script && script.src || (typeof document !== 'undefined' && document.baseURI);
  const workerURL = new URL('assets/audio/audio-transcription-worker.js', base);
  // Match the controller's release query so new review metadata cannot receive
  // an older cached worker after a static-site update.
  if (base) workerURL.search = new URL(base).search;
  let active = null;

  function abortError() {
    const error = new Error('Audio transcription was cancelled.');
    error.name = 'AbortError';
    return error;
  }

  function transcribe(samples, options) {
    options = options || {};
    return new Promise((resolve, reject) => {
      let worker = null;
      let settled = false;
      const signal = options.signal;
      const job = {cancel: () => finish(abortError())};
      function finish(error, notes) {
        if (settled) return;
        settled = true;
        if (signal) signal.removeEventListener('abort', job.cancel);
        if (worker) {
          worker.onmessage = worker.onerror = worker.onmessageerror = null;
          worker.terminate();
          worker = null;
        }
        if (active === job) active = null;
        if (error) reject(error); else resolve(notes);
      }
      try {
        if (signal && signal.aborted) throw abortError();
        if (!(samples instanceof Float32Array)) throw new TypeError('Audio must be mono Float32Array samples at 22050 Hz.');
        if (!samples.length) throw new RangeError('The selected audio is empty.');
        if (samples.length > SAMPLE_RATE * MAX_SECONDS) throw new RangeError('Choose an audio section of 30 seconds or less.');
        for (let i = 0; i < samples.length; i++) {
          if (!Number.isFinite(samples[i])) throw new TypeError('Audio contains invalid samples.');
        }
        if (typeof global.Worker !== 'function' || typeof global.WebAssembly !== 'object') {
          throw new Error('Local audio transcription needs a browser with Web Workers and WebAssembly.');
        }
        if (active) active.cancel();
        active = job;
        if (signal) signal.addEventListener('abort', job.cancel, {once: true});
        worker = new global.Worker(workerURL.href, {name: 'keymemory-audio-transcription'});
        worker.onerror = () => finish(new Error('Local audio transcription could not start. Reload the app and try again.'));
        worker.onmessageerror = () => finish(new Error('The local audio result could not be read.'));
        worker.onmessage = event => {
          if (settled) return;
          const message = event.data || {};
          if (message.type === 'progress') {
            if (typeof options.onProgress === 'function') {
              try { options.onProgress({stage: message.stage, progress: message.progress}); }
              catch (error) { finish(error); }
            }
          } else if (message.type === 'result') {
            if (!Array.isArray(message.notes)) finish(new Error('The local audio result was invalid.'));
            else finish(null, message.notes);
          } else if (message.type === 'error') {
            const error = new Error(message.message || 'Local audio transcription failed.');
            error.name = message.name || 'Error';
            finish(error);
          }
        };
        // Transfer a copy so callers retain their samples for preview or retry.
        const copy = new Float32Array(samples);
        worker.postMessage({samples: copy, includeAttackEvidence: options.includeAttackEvidence === true}, [copy.buffer]);
      } catch (error) {
        finish(error);
      }
    });
  }

  global.KeyMemoryAudio = Object.freeze({SAMPLE_RATE, MAX_SECONDS, transcribe});
})(typeof window !== 'undefined' ? window : globalThis);
