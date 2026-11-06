import {initializeBackend, loadModel, transcribeWithModel, validateSamples} from './runtime.mjs';

let started = false;
self.onmessage = async event => {
  // A controller uses exactly one job per worker, then terminates it. A second
  // message cannot create a parallel model or leave competing inference jobs.
  if (started) return;
  started = true;
  let model;
  try {
    const samples = event.data && event.data.samples;
    validateSamples(samples);
    const onProgress = progress => self.postMessage({type: 'progress', ...progress});
    onProgress({stage: 'loading', progress: 0});
    await initializeBackend(new URL('./', self.location.href).href);
    model = await loadModel(new URL('model.json', self.location.href).href, {
      onProgress: progress => onProgress({stage: 'loading', progress})
    });
    const notes = await transcribeWithModel(model, samples, {onProgress});
    self.postMessage({type: 'result', notes});
  } catch (error) {
    self.postMessage({type: 'error', name: error && error.name || 'Error',
      message: error && error.message || 'Local audio transcription failed.'});
  } finally {
    if (model) model.dispose();
    self.close();
  }
};
