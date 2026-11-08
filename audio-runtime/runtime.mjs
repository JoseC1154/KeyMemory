/*
 * Audio windowing is adapted from @spotify/basic-pitch 1.0.1 inference.ts
 * Copyright 2022 Spotify AB, Apache-2.0. See assets/audio/THIRD_PARTY_NOTICES.txt.
 * Unlike the upstream helper, each inference window has an explicit tidy scope.
 */
import * as tf from '@tensorflow/tfjs-core';
import {loadGraphModel} from '@tensorflow/tfjs-converter';
import {setWasmPaths, setThreadsCount} from '@tensorflow/tfjs-backend-wasm';
import {outputToNotesPoly, noteFramesToTime} from '@spotify/basic-pitch/cjs/toMidi.js';

export const SAMPLE_RATE = 22050;
export const MAX_SECONDS = 30;
export const WINDOW_SAMPLES = 43844;
export const HOP_SAMPLES = 36164;
export const OVERLAP_HALF = 3840;
export const FRAMES_PER_SECOND = 86;
export const OUTPUT_FRAMES = 142;

export function validateSamples(samples) {
  if (!(samples instanceof Float32Array)) throw new TypeError('Audio must be mono Float32Array samples at 22050 Hz.');
  if (!samples.length) throw new RangeError('The selected audio is empty.');
  if (samples.length > SAMPLE_RATE * MAX_SECONDS) throw new RangeError('Choose an audio section of 30 seconds or less.');
  for (let i = 0; i < samples.length; i++) {
    if (!Number.isFinite(samples[i])) throw new TypeError('Audio contains invalid samples.');
  }
}

export async function initializeBackend(wasmPath) {
  // Never requires SharedArrayBuffer, COOP/COEP, or third-party resources.
  tf.env().set('WASM_HAS_MULTITHREAD_SUPPORT', false);
  setThreadsCount(1);
  setWasmPaths(wasmPath);
  if (!await tf.setBackend('wasm')) throw new Error('This browser could not start local audio transcription.');
  await tf.ready();
}

export async function loadModel(source, options) {
  return loadGraphModel(source, options);
}

function cancelled(shouldCancel) {
  if (shouldCancel && shouldCancel()) {
    const error = new Error('Audio transcription was cancelled.');
    error.name = 'AbortError';
    throw error;
  }
}

// Exported for deterministic real-model parity/memory tests. Only frames and
// onsets are retained: pitch bends are intentionally outside this piano feature.
export async function evaluateFrames(model, samples, {onProgress, shouldCancel, afterWindow} = {}) {
  validateSamples(samples);
  const targetFrames = Math.floor(samples.length * FRAMES_PER_SECOND / SAMPLE_RATE);
  const frames = [];
  const onsets = [];
  const window = new Float32Array(WINDOW_SAMPLES);
  const windows = Math.ceil(targetFrames / OUTPUT_FRAMES);
  for (let batch = 0; batch < windows; batch++) {
    cancelled(shouldCancel);
    window.fill(0);
    const sourceStart = batch * HOP_SAMPLES - OVERLAP_HALF;
    const from = Math.max(0, sourceStart);
    const to = Math.min(samples.length, sourceStart + WINDOW_SAMPLES);
    if (to > from) window.set(samples.subarray(from, to), from - sourceStart);
    const count = Math.min(OUTPUT_FRAMES, targetFrames - frames.length);
    const [frameRows, onsetRows] = tf.tidy(() => {
      const input = tf.tensor3d(window, [1, WINDOW_SAMPLES, 1]);
      const outputs = model.execute(input, ['Identity_1', 'Identity_2']);
      return outputs.map(output => tf.reshape(
        tf.slice(output, [0, 15, 0], [1, count, 88]), [count, 88]
      ).arraySync());
    });
    frames.push(...frameRows);
    onsets.push(...onsetRows);
    if (afterWindow) afterWindow({batch, ...tf.memory()});
    if (onProgress) onProgress({stage: 'transcribing', progress: (batch + 1) / windows});
    // Yield between windows for test cancellation and cooperative worker tasks.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  cancelled(shouldCancel);
  return {frames, onsets};
}

// Keep only compact, pitch-specific attack evidence in the disposable review.
// Raw model onsets are deliberately separate from Basic Pitch's inferred onsets:
// a confidence rebound may split a held note without a fresh physical strike.
export function attackEvidenceAt(frames, onsets, startFrame, pitchMidi) {
  const pitch = pitchMidi - 21;
  const value = (rows, frame) => Math.max(0, Math.min(1, rows[frame]?.[pitch] || 0));
  let onset = 0, before = 0, after = 0, count = 0;
  for (let i = Math.max(0, startFrame - 2); i <= Math.min(onsets.length - 1, startFrame + 2); i++) onset = Math.max(onset, value(onsets, i));
  // Look behind a short confidence dip rather than treating its rebound as an
  // attack. This is supporting evidence, not proof that two notes are one hold.
  for (let i = Math.max(0, startFrame - 10); i <= startFrame - 3; i++) before = Math.max(before, value(frames, i));
  for (let i = startFrame; i <= Math.min(frames.length - 1, startFrame + 3); i++) {after += value(frames, i); count++;}
  return {onset, before, rise: Math.max(0, (count ? after / count : 0) - before)};
}

export function notesFromFrames(frames, onsets, duration, {includeAttackEvidence = false} = {}) {
  if (frames.length < 2) return [];
  // Official polyphonic postprocessor and time conversion, including its
  // window-offset correction. Never quantize, invent tempo, or add pedal data.
  const events = outputToNotesPoly(frames, onsets, 0.5, 0.3, 5);
  return noteFramesToTime(events)
    .map((note, index) => {
      const start = Math.max(0, note.startTimeSeconds);
      const end = Math.min(duration, note.startTimeSeconds + note.durationSeconds);
      return {
        pitchMidi: note.pitchMidi,
        startTimeSeconds: start,
        durationSeconds: end - start,
        amplitude: Math.max(0, Math.min(1, note.amplitude)),
        ...(includeAttackEvidence ? {attackEvidence: attackEvidenceAt(frames, onsets, events[index].startFrame, note.pitchMidi)} : {})
      };
    })
    .filter(note => Number.isInteger(note.pitchMidi) && note.pitchMidi >= 21 && note.pitchMidi <= 108 &&
      Number.isFinite(note.startTimeSeconds) && Number.isFinite(note.durationSeconds) &&
      Number.isFinite(note.amplitude) && note.durationSeconds > 0)
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds || a.pitchMidi - b.pitchMidi);
}

export async function transcribeWithModel(model, samples, options = {}) {
  const {frames, onsets} = await evaluateFrames(model, samples, options);
  cancelled(options.shouldCancel);
  if (options.onProgress) options.onProgress({stage: 'processing', progress: 0});
  const notes = notesFromFrames(frames, onsets, samples.length / SAMPLE_RATE, options);
  cancelled(options.shouldCancel);
  if (options.onProgress) options.onProgress({stage: 'processing', progress: 1});
  return notes;
}
