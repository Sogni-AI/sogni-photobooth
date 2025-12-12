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
    description: 'Quick generation (~12-20s)',
    costMultiplier: 1
  },
  balanced: {
    model: VIDEO_MODELS.speed,
    steps: 8,
    label: 'Balanced',
    description: 'Good balance of speed and quality (~25-40s)',
    costMultiplier: 1.5
  },
  quality: {
    model: VIDEO_MODELS.quality,
    steps: 20,
    label: 'High Quality',
    description: 'Higher quality, slower (~1-2 min)',
    costMultiplier: 2.5
  },
  pro: {
    model: VIDEO_MODELS.quality,
    steps: 40,
    label: 'Pro',
    description: 'Maximum quality (~2-4 min)',
    costMultiplier: 4
  }
} as const;

export type VideoQualityPreset = keyof typeof VIDEO_QUALITY_PRESETS;

// Resolution presets
// Note: SDK requires minimum 512px dimension
export const VIDEO_RESOLUTIONS = {
  '480p': {
    maxDimension: 512,
    label: '512p',
    description: 'Standard (faster, lower cost)'
  },
  '720p': {
    maxDimension: 720,
    label: '720p',
    description: 'HD (slower, higher cost)'
  }
} as const;

export type VideoResolution = keyof typeof VIDEO_RESOLUTIONS;

// Default video settings
export const DEFAULT_VIDEO_SETTINGS = {
  resolution: '480p' as VideoResolution,
  quality: 'fast' as VideoQualityPreset,
  frames: 81, // 5 seconds at 16fps
  fps: 16
};

// Video generation config
export const VIDEO_CONFIG = {
  // Default frames for 5-second video at 16fps
  defaultFrames: 81,
  // Frames per second options
  fpsOptions: [16, 32] as const,
  defaultFps: 16,
  // Frame range limits
  minFrames: 17,
  maxFrames: 161,
  // Dimension must be divisible by this value
  dimensionDivisor: 16
};

/**
 * Calculate video dimensions that are divisible by 16 while maintaining aspect ratio.
 * The dimensions will be scaled down to fit within the resolution's max dimension.
 *
 * @param imageWidth - Original image width
 * @param imageHeight - Original image height
 * @param resolution - Target resolution preset ('480p' or '720p')
 * @returns Object with width and height divisible by 16
 */
export function calculateVideoDimensions(
  imageWidth: number,
  imageHeight: number,
  resolution: VideoResolution = '480p'
): { width: number; height: number } {
  const targetShortSide = VIDEO_RESOLUTIONS[resolution].maxDimension;
  const divisor = VIDEO_CONFIG.dimensionDivisor;

  const smallestDim = Math.min(imageWidth, imageHeight);
  
  // Scale so the shortest dimension equals the target
  const scaleFactor = targetShortSide / smallestDim;

  // Scale and round down to nearest 16
  let width = Math.floor((imageWidth * scaleFactor) / divisor) * divisor;
  let height = Math.floor((imageHeight * scaleFactor) / divisor) * divisor;

  // Ensure minimum 512 after rounding (SDK requirement)
  width = Math.max(width, 512);
  height = Math.max(height, 512);

  return { width, height };
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
    id: 'jazz',
    filename: 'sogni-photobooth-video-demo_832x1216.mp4',
    label: 'Jazz Saxophonist'
  },
  {
    id: 'kitty',
    filename: 'sogni-photobooth-kittyswarm-raw.mp4',
    label: 'Kitty Swarm'
  },
  {
    id: 'victorian',
    filename: 'sogni-photobooth-dappervictorian-raw.mp4',
    label: 'Dapper Victorian'
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

