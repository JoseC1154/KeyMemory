// Deterministic, self-generated audio only. No recordings or downloaded songs.
const SAMPLE_RATE = 22050;
function synthesize(notes, duration) {
  const samples = new Float32Array(Math.ceil(duration * SAMPLE_RATE));
  for (const {pitch, start, duration: length, gain = 0.25} of notes) {
    const frequency = 440 * 2 ** ((pitch - 69) / 12);
    for (let i = Math.floor(start * SAMPLE_RATE); i < Math.min(samples.length, Math.floor((start + length) * SAMPLE_RATE)); i++) {
      const t = i / SAMPLE_RATE - start;
      const attack = Math.min(1, t / 0.012);
      const release = Math.min(1, (length - t) / 0.06);
      const decay = 0.5 + 0.5 * Math.exp(-3 * t);
      samples[i] += gain * attack * release * decay * (
        Math.sin(2 * Math.PI * frequency * t) +
        0.35 * Math.sin(2 * Math.PI * frequency * 2 * t) +
        0.15 * Math.sin(2 * Math.PI * frequency * 3 * t)
      );
    }
  }
  return samples;
}
const melody = [
  {pitch: 60, start: 0.25, duration: 0.65},
  {pitch: 64, start: 1.0, duration: 0.65},
  {pitch: 67, start: 1.75, duration: 0.65},
  {pitch: 60, start: 2.75, duration: 1.0, gain: 0.16},
  {pitch: 64, start: 2.75, duration: 1.0, gain: 0.16},
  {pitch: 67, start: 2.75, duration: 1.0, gain: 0.16},
  {pitch: 72, start: 4.1, duration: 2.6}
];
module.exports = {SAMPLE_RATE, synthesize, melody};
