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
    allowed: [
      'ar', 'az', 'bg', 'bn', 'ca', 'cs', 'da', 'de', 'el', 'en',
      'es', 'fa', 'fi', 'fr', 'he', 'hi', 'hr', 'ht', 'hu', 'id',
      'is', 'it', 'ja', 'ko', 'la', 'lt', 'ms', 'ne', 'nl', 'no',
      'pa', 'pl', 'pt', 'ro', 'ru', 'sa', 'sk', 'sr', 'sv', 'sw',
      'ta', 'te', 'th', 'tl', 'tr', 'uk', 'ur', 'vi', 'yue', 'zh',
      'unknown'
    ],
    default: 'unknown',
    labels: {
      ar: 'Arabic', az: 'Azerbaijani', bg: 'Bulgarian', bn: 'Bengali',
      ca: 'Catalan', cs: 'Czech', da: 'Danish', de: 'German',
      el: 'Greek', en: 'English', es: 'Spanish', fa: 'Persian',
      fi: 'Finnish', fr: 'French', he: 'Hebrew', hi: 'Hindi',
      hr: 'Croatian', ht: 'Haitian Creole', hu: 'Hungarian', id: 'Indonesian',
      is: 'Icelandic', it: 'Italian', ja: 'Japanese', ko: 'Korean',
      la: 'Latin', lt: 'Lithuanian', ms: 'Malay', ne: 'Nepali',
      nl: 'Dutch', no: 'Norwegian', pa: 'Punjabi', pl: 'Polish',
      pt: 'Portuguese', ro: 'Romanian', ru: 'Russian', sa: 'Sanskrit',
      sk: 'Slovak', sr: 'Serbian', sv: 'Swedish', sw: 'Swahili',
      ta: 'Tamil', te: 'Telugu', th: 'Thai', tl: 'Tagalog',
      tr: 'Turkish', uk: 'Ukrainian', ur: 'Urdu', vi: 'Vietnamese',
      yue: 'Cantonese', zh: 'Chinese', unknown: 'Auto-detect'
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
  language: 'unknown',
  steps: 8,
  composerMode: true,
  promptStrength: 2.0,
  creativity: 0.85
};
