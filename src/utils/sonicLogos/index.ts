/**
 * Sonic Logo - Whoosh Dreamy Arpeggio
 * Soft whoosh into Fmaj7 arpeggio with pitch drift
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
 * Plays the sonic logo - dreamy Fmaj7 arpeggio with whoosh
 * Safe to call anytime - will silently fail if audio unavailable
 */
export const playSonicLogo = (): void => {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.connect(ctx.destination);
  master.gain.setValueAtTime(0.25, now);

  // Soft breath whoosh
  const whoosh = ctx.createOscillator();
  const whooshGain = ctx.createGain();
  const whooshFilter = ctx.createBiquadFilter();
  whoosh.type = 'triangle';
  whoosh.frequency.setValueAtTime(100, now);
  whoosh.frequency.exponentialRampToValueAtTime(350, now + 0.15);
  whooshFilter.type = 'lowpass';
  whooshFilter.frequency.setValueAtTime(800, now);
  whooshGain.gain.setValueAtTime(0, now);
  whooshGain.gain.linearRampToValueAtTime(0.15, now + 0.08);
  whooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  whoosh.connect(whooshFilter);
  whooshFilter.connect(whooshGain);
  whooshGain.connect(master);
  whoosh.start(now);
  whoosh.stop(now + 0.18);

  // Dreamy Fmaj7 arpeggio: F4 A4 C5 E5
  const notes = [349, 440, 523, 659];
  const noteGap = 0.07;
  notes.forEach((freq, i) => {
    const start = now + 0.1 + (i * noteGap);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    // Slight pitch rise for dreamy feel
    osc.frequency.linearRampToValueAtTime(freq * 1.01, start + 0.3);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.5, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + 0.45);
  });
};

export default playSonicLogo;
