/**
 * Sonic Logo - Sogni Signature HD
 * Whoosh + stereo Fmaj7 arpeggio + "SOG-NI" rhythm tag
 * Enhanced with sub bass, stereo imaging, and harmonics
 * Uses Web Audio API for cross-browser/device compatibility
 */

let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (!audioContext) {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        audioContext = new AudioContextClass();
      }
    } catch {
      return null;
    }
  }
  if (audioContext?.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
};

/**
 * Pre-warms the AudioContext for iOS compatibility.
 * Call this during a user interaction (click/tap) BEFORE the async
 * callback that will play the sonic logo.
 */
export const warmUpAudio = (): void => {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // Silently fail
  }
};

/**
 * Creates sub bass
 */
const createSubBass = (
  ctx: AudioContext,
  destination: AudioNode,
  time: number,
  freq: number,
  duration: number
): void => {
  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(freq, time);
  subGain.gain.setValueAtTime(0, time);
  subGain.gain.linearRampToValueAtTime(0.6, time + 0.08);
  subGain.gain.exponentialRampToValueAtTime(0.01, time + duration);
  sub.connect(subGain);
  subGain.connect(destination);
  sub.start(time);
  sub.stop(time + duration);
};

/**
 * Creates whoosh sound
 */
const createWhoosh = (
  ctx: AudioContext,
  destination: AudioNode,
  time: number
): void => {
  const whoosh = ctx.createOscillator();
  const whooshGain = ctx.createGain();
  const whooshFilter = ctx.createBiquadFilter();

  whoosh.type = 'sawtooth';
  whoosh.frequency.setValueAtTime(80, time);
  whoosh.frequency.exponentialRampToValueAtTime(400, time + 0.15);

  whooshFilter.type = 'bandpass';
  whooshFilter.frequency.setValueAtTime(200, time);
  whooshFilter.frequency.exponentialRampToValueAtTime(1000, time + 0.15);
  whooshFilter.Q.setValueAtTime(0.5, time);

  whooshGain.gain.setValueAtTime(0, time);
  whooshGain.gain.linearRampToValueAtTime(0.2, time + 0.08);
  whooshGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

  whoosh.connect(whooshFilter);
  whooshFilter.connect(whooshGain);
  whooshGain.connect(destination);

  whoosh.start(time);
  whoosh.stop(time + 0.2);
};

/**
 * Plays the sonic logo - Sogni Signature HD
 * Safe to call anytime - will silently fail if audio unavailable
 */
export const playSonicLogo = (): void => {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Master gain
  const master = ctx.createGain();
  master.connect(ctx.destination);
  master.gain.setValueAtTime(0.3, now);

  // Punchy sub bass
  createSubBass(ctx, master, now + 0.05, 55, 0.55);

  // Whoosh
  createWhoosh(ctx, master, now);

  // Stereo arpeggio - Fmaj7: F4 A4 C5 E5
  const notes = [349, 440, 523, 659];
  const pans = [-0.5, -0.15, 0.15, 0.5];

  notes.forEach((freq, i) => {
    const start = now + 0.1 + (i * 0.07);

    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(pans[i], start);
    panner.connect(master);

    // Main tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.5, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
    osc.connect(gain);
    gain.connect(panner);
    osc.start(start);
    osc.stop(start + 0.45);

    // Harmonic shimmer (octave)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, start);
    gain2.gain.setValueAtTime(0, start);
    gain2.gain.linearRampToValueAtTime(0.12, start + 0.01);
    gain2.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
    osc2.connect(gain2);
    gain2.connect(panner);
    osc2.start(start);
    osc2.stop(start + 0.3);
  });

  // SOG-NI tag with stereo movement: L -> R -> Center
  const endTime = now + 0.1 + (3 * 0.07) + 0.12;
  const pattern: Array<{ freq: number; start: number; dur: number; pan: number }> = [
    { freq: 784, start: 0, dur: 0.12, pan: -0.5 },      // SOG (G5) - Left
    { freq: 880, start: 0.1, dur: 0.12, pan: 0.5 },     // - (A5) - Right
    { freq: 1047, start: 0.2, dur: 0.4, pan: 0 }        // NI (C6) - Center
  ];

  pattern.forEach(({ freq, start, dur, pan }) => {
    const t = endTime + start;

    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(pan, t);
    panner.connect(master);

    // Main tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.6, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(panner);
    osc.start(t);
    osc.stop(t + dur + 0.05);

    // Harmonic on final note
    if (freq === 1047) {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 2, t);
      gain2.gain.setValueAtTime(0, t);
      gain2.gain.linearRampToValueAtTime(0.15, t + 0.01);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.6);
      osc2.connect(gain2);
      gain2.connect(panner);
      osc2.start(t);
      osc2.stop(t + dur * 0.7);
    }
  });
};

export default playSonicLogo;
