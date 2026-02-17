/**
 * Audio generation constants for ACE-Step 1.5 models
 *
 * AUDIO_CONSTRAINTS serves as a fallback when the API config hasn't loaded yet.
 * At runtime, the useAudioModelConfig hook fetches authoritative values from:
 *   GET /api/v1/models/tiers/{modelId}
 */

export const AUDIO_MODEL_ID_TURBO = 'ace_step_1.5_turbo';
export const AUDIO_MODEL_ID_SFT = 'ace_step_1.5_sft';

/** @deprecated Use AUDIO_MODEL_ID_TURBO instead */
export const AUDIO_MODEL_ID = AUDIO_MODEL_ID_TURBO;

export const AUDIO_MODELS = [
  {
    id: AUDIO_MODEL_ID_TURBO,
    label: 'Fast & Catchy',
    description: 'Quick generation, best quality sound',
  },
  {
    id: AUDIO_MODEL_ID_SFT,
    label: 'More Control',
    description: 'More accurate lyrics, less stable',
  },
] as const;

export const AUDIO_CONSTRAINTS = {
  duration: { min: 10, max: 600, default: 30 },
  bpm: { min: 30, max: 300, default: 120 },
  keyscale: {
    allowed: [
      'C major', 'C minor', 'C# major', 'C# minor',
      'Db major', 'Db minor', 'D major', 'D minor',
      'D# major', 'D# minor', 'Eb major', 'Eb minor',
      'E major', 'E minor', 'F major', 'F minor',
      'F# major', 'F# minor', 'Gb major', 'Gb minor',
      'G major', 'G minor', 'G# major', 'G# minor',
      'Ab major', 'Ab minor', 'A major', 'A minor',
      'A# major', 'A# minor', 'Bb major', 'Bb minor',
      'B major', 'B minor'
    ],
    default: 'C major'
  },
  timesignature: {
    allowed: ['2', '3', '4', '6'],
    default: '4',
    labels: {
      '2': '2/4 time (marches, polka)',
      '3': '3/4 time (waltzes, ballads)',
      '4': '4/4 time (most pop, rock, hip-hop)',
      '6': '6/8 time (compound time, folk dances)'
    }
  },
  language: {
    allowed: ['en', 'ja', 'zh', 'es', 'de', 'fr', 'pt', 'ru', 'it', 'nl',
      'pl', 'tr', 'vi', 'cs', 'fa', 'id', 'ko', 'uk', 'hu', 'ar', 'sv', 'ro', 'el'],
    default: 'en',
    labels: {
      en: 'English', ja: 'Japanese', zh: 'Chinese', es: 'Spanish',
      de: 'German', fr: 'French', pt: 'Portuguese', ru: 'Russian',
      it: 'Italian', nl: 'Dutch', pl: 'Polish', tr: 'Turkish',
      vi: 'Vietnamese', cs: 'Czech', fa: 'Persian', id: 'Indonesian',
      ko: 'Korean', uk: 'Ukrainian', hu: 'Hungarian', ar: 'Arabic',
      sv: 'Swedish', ro: 'Romanian', el: 'Greek', unknown: 'Auto-detect'
    }
  },
  steps: { min: 4, max: 16, default: 8 },
  composerMode: { default: true },
  promptStrength: { min: 0, max: 10, default: 2.0 },
  creativity: { min: 0, max: 2, default: 0.85 },
  comfySampler: { default: 'euler' },
  comfyScheduler: { default: 'simple' },
  outputFormat: { allowed: ['mp3', 'wav', 'flac'], default: 'mp3' },
  numberOfMedia: { min: 1, max: 4, default: 1 }
} as const;

/** Flat default values for useState initializers */
export const AUDIO_DEFAULTS = {
  duration: 30,
  bpm: 120,
  keyscale: 'C major',
  timesig: '4',
  language: 'en',
  steps: 8,
  composerMode: true,
  promptStrength: 2.0,
  creativity: 0.85
};
