/**
 * Shared audio waveform utilities.
 *
 * Generate a deterministic pseudo-random waveform seeded from a string.
 * Used by AudioTrimPreview, WaveformPlaybackBar, and PhotoGallery for
 * preset/AI tracks where actual audio data can't be decoded due to CORS
 * restrictions on CDN URLs.
 */

export const WAVEFORM_SAMPLES = 200;

export function generatePlaceholderWaveform(seed: string, samples: number = WAVEFORM_SAMPLES): number[] {
  const result: number[] = [];
  for (let i = 0; i < samples; i++) {
    const charCode = seed.charCodeAt(i % Math.max(seed.length, 1));
    const noise = Math.sin(i * 0.1 + charCode) * 0.3 + 0.5;
    const envelope = Math.sin((i / samples) * Math.PI) * 0.3 + 0.7;
    result.push(noise * envelope);
  }
  return result;
}
