/**
 * Video Generation Settings Constants
 *
 * Contains model IDs, quality presets, resolution options, and helper functions
 * for the Wan 2.2 14B FP8 image-to-video generation feature.
 */

// Video model variants
export const VIDEO_MODELS = {
  // LightX2V - 4-step LoRA version (faster, good quality)
  speed: 'wan_v2.2-14b-fp8_i2v_lightx2v',
  // Full quality version (slower, best quality)
  quality: 'wan_v2.2-14b-fp8_i2v'
} as const;

export type VideoModelType = keyof typeof VIDEO_MODELS;

// Quality presets mapping to model + steps configuration
export const VIDEO_QUALITY_PRESETS = {
  fast: {
    model: VIDEO_MODELS.speed,
    steps: 4,
    label: 'Fast',
    description: 'Quick generation (~12-20s)'
  },
  balanced: {
    model: VIDEO_MODELS.speed,
    steps: 8,
    label: 'Balanced',
    description: 'Good balance of speed and quality (~25-40s)'
  },
  quality: {
    model: VIDEO_MODELS.quality,
    steps: 20,
    label: 'High Quality',
    description: 'Higher quality, slower (~3-4 min)'
  },
  pro: {
    model: VIDEO_MODELS.quality,
    steps: 30,
    label: 'Pro',
    description: 'Maximum quality (~6-9 min)'
  }
} as const;

export type VideoQualityPreset = keyof typeof VIDEO_QUALITY_PRESETS;

// Resolution presets
// Dimensions will be rounded to nearest 16 for video encoding compatibility
export const VIDEO_RESOLUTIONS = {
  '480p': {
    maxDimension: 480,
    label: '480p',
    description: ''
  },
  '580p': {
    maxDimension: 580,
    label: '580p',
    description: ''
  },
  '720p': {
    maxDimension: 720,
    label: '720p',
    description: ''
  }
} as const;

export type VideoResolution = keyof typeof VIDEO_RESOLUTIONS;

// Default video settings
export const DEFAULT_VIDEO_SETTINGS = {
  resolution: '480p' as VideoResolution,
  quality: 'fast' as VideoQualityPreset,
  frames: 81, // 5 seconds at 16fps
  fps: 16,
  duration: 5 // 5 seconds
};

// Video generation config
export const VIDEO_CONFIG = {
  // Default frames for 5-second video at 16fps
  defaultFrames: 81,
  // Frames per second options
  fpsOptions: [16, 32] as const,
  defaultFps: 16,
  // Duration options in seconds
  durationOptions: [3, 5, 7] as const,
  defaultDuration: 5,
  // Frame range limits
  minFrames: 17,
  maxFrames: 161,
  // Dimension must be divisible by this value
  dimensionDivisor: 16
};

/**
 * Calculate video dimensions that are divisible by 16 while maintaining aspect ratio.
 * The shortest dimension will be set to the target resolution, and the longest will scale proportionally.
 *
 * @param imageWidth - Original image width
 * @param imageHeight - Original image height
 * @param resolution - Target resolution preset ('480p', '580p', or '720p')
 * @returns Object with width and height divisible by 16
 */
export function calculateVideoDimensions(
  imageWidth: number,
  imageHeight: number,
  resolution: VideoResolution = '480p'
): { width: number; height: number } {
  const targetShortSide = VIDEO_RESOLUTIONS[resolution].maxDimension;
  const divisor = VIDEO_CONFIG.dimensionDivisor;

  // Round target to nearest 16 to ensure valid dimensions
  const roundedTarget = Math.round(targetShortSide / divisor) * divisor;

  // Determine which dimension is shortest
  const isWidthShorter = imageWidth <= imageHeight;
  
  if (isWidthShorter) {
    // Width is shorter - set it to target, scale height proportionally
    const width = roundedTarget;
    const height = Math.round((imageHeight * roundedTarget / imageWidth) / divisor) * divisor;
    return { width, height };
  } else {
    // Height is shorter - set it to target, scale width proportionally
    const height = roundedTarget;
    const width = Math.round((imageWidth * roundedTarget / imageHeight) / divisor) * divisor;
  return { width, height };
  }
}

/**
 * Get the quality preset configuration for a given quality level
 */
export function getVideoQualityConfig(quality: VideoQualityPreset) {
  return VIDEO_QUALITY_PRESETS[quality];
}

/**
 * Calculate video duration in seconds based on frames and fps
 */
export function calculateVideoDuration(frames: number = VIDEO_CONFIG.defaultFrames, fps: number = VIDEO_CONFIG.defaultFps): number {
  return Math.round((frames - 1) / fps);
}

/**
 * Calculate frames based on duration (fps is NOT used - it's for playback interpolation only)
 * Formula: 16 * duration + 1 (16fps is the base generation rate)
 * The fps parameter passed to the API only affects playback smoothness, not frame count
 */
export function calculateVideoFrames(duration: number = VIDEO_CONFIG.defaultDuration): number {
  // Use constant 16fps base for frame calculation regardless of playback fps setting
  const BASE_FPS = 16;
  return BASE_FPS * duration + 1;
}

/**
 * Format duration as MM:SS string
 */
export function formatVideoDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Example videos for the intro popup
 * These are existing videos from the asset server
 */
export const VIDEO_INTRO_EXAMPLES = [
  {
    id: 'penguin',
    filename: 'kiki-ssogni-photobooth-my-baby-penguin-raw.mp4',
    label: 'My Baby Penguin'
  },
  {
    id: 'kitty',
    filename: 'sogni-photobooth-kittyswarm-raw.mp4',
    label: 'Kitty Swarm'
  },
  {
    id: 'iced',
    filename: 'kiki-sogni-photobooth-iced-up-raw.mp4',
    label: 'Iced Up'
  },
  {
    id: 'victorian',
    filename: 'sogni-photobooth-dappervictorian-raw.mp4',
    label: 'Dapper Victorian'
  },
  {
    id: 'bear',
    filename: 'kiki-ssogni-photobooth-my-baby-bear-raw.mp4',
    label: 'My Baby Bear'
  }
];

/**
 * LocalStorage key for tracking if user has seen the video intro popup
 */
export const VIDEO_INTRO_SEEN_KEY = 'sogni_video_intro_seen';

/**
 * LocalStorage key for tracking if user has generated at least one video
 */
export const VIDEO_GENERATED_KEY = 'sogni_video_generated';

/**
 * LocalStorage key for tracking if user has seen the concurrent video tip toast
 */
export const VIDEO_TIP_SHOWN_KEY = 'sogni_video_tip_shown';

// Bald for Base video prompt - partnership with Base.org
export const BASE_HERO_PROMPT = "the subject casts off their clothes revealing a tight black tshirt and headworn earset Shure wireless microphone near mouth. Their wig falls off and they raise their hands in triumphant affirmative approval. A movie style title appears. Professional dolly zoom in witih shallow depth of field. Add a thin headset microphone wrapping to the cheek. The subject raises both hands into expressive, slightly over-dramatic keynote gestures (palms open, fingers natural). Their bald head gleams and they smile confidently. Keep face identity and features through transformation. Stage lighting: soft spotlight on face, subtle rim light, dark background with faint blue accents and bokeh. Include clean on-screen typography that appears near the end: BALD FOR BASE in bold modern sans-serif. Camera: gentle push-in, stable, crisp detail, high-end event look.";

/**
 * Check if the user has seen the video intro popup
 */
export function hasSeenVideoIntro(): boolean {
  try {
    return localStorage.getItem(VIDEO_INTRO_SEEN_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark the video intro popup as seen
 */
export function markVideoIntroSeen(): void {
  try {
    localStorage.setItem(VIDEO_INTRO_SEEN_KEY, 'true');
  } catch {
    // Ignore storage errors
  }
}

/**
 * Check if the user has generated at least one video (for hiding NEW badge)
 */
export function hasGeneratedVideo(): boolean {
  try {
    return localStorage.getItem(VIDEO_GENERATED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark that user has generated a video (hides NEW badge)
 */
export function markVideoGenerated(): void {
  try {
    localStorage.setItem(VIDEO_GENERATED_KEY, 'true');
  } catch {
    // Ignore storage errors
  }
}

/**
 * Check if the user has seen the video tip about concurrent generation
 */
export function hasSeenVideoTip(): boolean {
  try {
    return localStorage.getItem(VIDEO_TIP_SHOWN_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark that user has seen the video tip about concurrent generation
 */
export function markVideoTipShown(): void {
  try {
    localStorage.setItem(VIDEO_TIP_SHOWN_KEY, 'true');
  } catch {
    // Ignore storage errors
  }
}

