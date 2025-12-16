/**
 * Sonic Logos - Sogni Brand Sounds
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

// ============================================
// SOGNI SIGNATURE HD
// For: Daily boost collection, Stripe payment success
// ============================================
export const playSogniSignature = (): void => {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.connect(ctx.destination);
  master.gain.setValueAtTime(0.3, now);

  // Sub bass
  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(55, now + 0.05);
  subGain.gain.setValueAtTime(0, now + 0.05);
  subGain.gain.linearRampToValueAtTime(0.6, now + 0.13);
  subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
  sub.connect(subGain);
  subGain.connect(master);
  sub.start(now + 0.05);
  sub.stop(now + 0.65);

  // Whoosh
  const whoosh = ctx.createOscillator();
  const whooshGain = ctx.createGain();
  const whooshFilter = ctx.createBiquadFilter();
  whoosh.type = 'sawtooth';
  whoosh.frequency.setValueAtTime(80, now);
  whoosh.frequency.exponentialRampToValueAtTime(400, now + 0.15);
  whooshFilter.type = 'bandpass';
  whooshFilter.frequency.setValueAtTime(200, now);
  whooshFilter.frequency.exponentialRampToValueAtTime(1000, now + 0.15);
  whooshFilter.Q.setValueAtTime(0.5, now);
  whooshGain.gain.setValueAtTime(0, now);
  whooshGain.gain.linearRampToValueAtTime(0.2, now + 0.08);
  whooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  whoosh.connect(whooshFilter);
  whooshFilter.connect(whooshGain);
  whooshGain.connect(master);
  whoosh.start(now);
  whoosh.stop(now + 0.2);

  // Stereo arpeggio with harmonics
  const notes = [349, 440, 523, 659];
  const pans = [-0.5, -0.15, 0.15, 0.5];

  notes.forEach((freq, i) => {
    const start = now + 0.1 + (i * 0.07);
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(pans[i], start);
    panner.connect(master);

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

    // Harmonic
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

  // SOG-NI tag
  const endTime = now + 0.1 + (3 * 0.07) + 0.12;
  const pattern = [
    { freq: 784, start: 0, dur: 0.12, pan: -0.5 },
    { freq: 880, start: 0.1, dur: 0.12, pan: 0.5 },
    { freq: 1047, start: 0.2, dur: 0.4, pan: 0 }
  ];

  pattern.forEach(({ freq, start, dur, pan }) => {
    const t = endTime + start;
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(pan, t);
    panner.connect(master);

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

// ============================================
// SPARKLE CROWN HD
// For: Video generation complete
// ============================================
export const playVideoComplete = (): void => {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.connect(ctx.destination);
  master.gain.setValueAtTime(0.28, now);

  // Warm bass bed
  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(87, now + 0.05);
  subGain.gain.setValueAtTime(0, now + 0.05);
  subGain.gain.linearRampToValueAtTime(0.5, now + 0.12);
  subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
  sub.connect(subGain);
  subGain.connect(master);
  sub.start(now + 0.05);
  sub.stop(now + 0.65);

  // Whoosh
  const whoosh = ctx.createOscillator();
  const whooshGain = ctx.createGain();
  const whooshFilter = ctx.createBiquadFilter();
  whoosh.type = 'sawtooth';
  whoosh.frequency.setValueAtTime(80, now);
  whoosh.frequency.exponentialRampToValueAtTime(400, now + 0.15);
  whooshFilter.type = 'bandpass';
  whooshFilter.frequency.setValueAtTime(200, now);
  whooshFilter.frequency.exponentialRampToValueAtTime(1000, now + 0.15);
  whooshFilter.Q.setValueAtTime(0.5, now);
  whooshGain.gain.setValueAtTime(0, now);
  whooshGain.gain.linearRampToValueAtTime(0.2, now + 0.08);
  whooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  whoosh.connect(whooshFilter);
  whooshFilter.connect(whooshGain);
  whooshGain.connect(master);
  whoosh.start(now);
  whoosh.stop(now + 0.2);

  // Stereo arpeggio
  const notes = [349, 440, 523, 659];
  const pans = [-0.4, -0.12, 0.12, 0.4];

  notes.forEach((freq, i) => {
    const start = now + 0.1 + (i * 0.07);
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(pans[i], start);
    panner.connect(master);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.5, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
    osc.connect(gain);
    gain.connect(panner);
    osc.start(start);
    osc.stop(start + 0.5);
  });

  // Sparkles dancing across stereo
  const sparkles = [1319, 1568, 1760, 1568, 2093];
  const sparklePans = [-0.7, 0.5, -0.3, 0.7, 0];

  sparkles.forEach((freq, i) => {
    const start = now + 0.18 + (i * 0.07);
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(sparklePans[i], start);
    panner.connect(master);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.2, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
    osc.connect(gain);
    gain.connect(panner);
    osc.start(start);
    osc.stop(start + 0.25);
  });
};

// Wrapper functions that respect soundEnabled setting
export const playSonicLogo = (soundEnabled = true): void => {
  if (soundEnabled) playVideoComplete();
};

export const playSogniSignatureIfEnabled = (soundEnabled = true): void => {
  if (soundEnabled) playSogniSignature();
};

export default playVideoComplete;
