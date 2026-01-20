/**
 * Camera Angle Settings Constants
 *
 * Contains model IDs, LoRA configuration, camera pose options, and helper functions
 * for the Multiple Angles LoRA feature (re-render portraits from different camera angles).
 *
 * Supports 96 camera pose combinations:
 * - 8 Azimuths: front, front-right, right, back-right, back, back-left, left, front-left
 * - 4 Elevations: low-angle (-30°), eye-level (0°), elevated (30°), high-angle (60°)
 * - 3 Distances: close-up, medium, wide
 */

// Model configuration for camera angle generation
export const CAMERA_ANGLE_MODEL = 'qwen_image_edit_2511_fp8_lightning';

// LoRA configuration
export const CAMERA_ANGLE_LORA = {
  loraId: 'multiple_angles',
  loras: ['qwen-image-edit-2511-multiple-angles-lora.safetensors'],
  defaultStrength: 0.9
} as const;

// Default generation parameters
export const CAMERA_ANGLE_DEFAULTS = {
  steps: 5,
  guidance: 1,
  sampler: 'euler',
  scheduler: 'simple',
  outputFormat: 'png'
} as const;

// Azimuth options (8 horizontal camera positions)
export const AZIMUTHS = [
  { key: 'front', label: 'Front', prompt: 'front view', angle: 0 },
  { key: 'front-right', label: 'Front Right', prompt: 'front-right quarter view', angle: 45 },
  { key: 'right', label: 'Right', prompt: 'right side view', angle: 90 },
  { key: 'back-right', label: 'Back Right', prompt: 'back-right quarter view', angle: 135 },
  { key: 'back', label: 'Back', prompt: 'back view', angle: 180 },
  { key: 'back-left', label: 'Back Left', prompt: 'back-left quarter view', angle: 225 },
  { key: 'left', label: 'Left', prompt: 'left side view', angle: 270 },
  { key: 'front-left', label: 'Front Left', prompt: 'front-left quarter view', angle: 315 }
] as const;

// Elevation options (4 vertical camera positions)
export const ELEVATIONS = [
  { key: 'low-angle', label: 'Low Angle', prompt: 'low-angle shot', angle: -30, icon: '⬇️' },
  { key: 'eye-level', label: 'Eye Level', prompt: 'eye-level shot', angle: 0, icon: '👁️' },
  { key: 'elevated', label: 'Elevated', prompt: 'elevated shot', angle: 30, icon: '⬆️' },
  { key: 'high-angle', label: 'High Angle', prompt: 'high-angle shot', angle: 60, icon: '🔝' }
] as const;

// Distance options (3 shot types)
export const DISTANCES = [
  { key: 'close-up', label: 'Close-up', prompt: 'close-up', scale: 0.6, icon: '🔍' },
  { key: 'medium', label: 'Medium', prompt: 'medium shot', scale: 1.0, icon: '📷' },
  { key: 'wide', label: 'Wide', prompt: 'wide shot', scale: 1.8, icon: '🌐' }
] as const;

// Quick presets for common camera angles
export const CAMERA_PRESETS = [
  {
    key: 'portrait-34',
    label: '3/4 Portrait',
    description: 'Classic portrait angle',
    azimuth: 'front-right',
    elevation: 'eye-level',
    distance: 'medium'
  },
  {
    key: 'profile',
    label: 'Profile',
    description: 'Side profile view',
    azimuth: 'right',
    elevation: 'eye-level',
    distance: 'medium'
  },
  {
    key: 'hero',
    label: 'Hero Shot',
    description: 'Low angle, powerful pose',
    azimuth: 'front',
    elevation: 'low-angle',
    distance: 'medium'
  },
  {
    key: 'overhead',
    label: 'Overhead',
    description: 'Bird\'s eye view',
    azimuth: 'front',
    elevation: 'high-angle',
    distance: 'wide'
  },
  {
    key: 'closeup',
    label: 'Close-up',
    description: 'Intimate detail shot',
    azimuth: 'front',
    elevation: 'eye-level',
    distance: 'close-up'
  },
  {
    key: 'back-34',
    label: 'Over Shoulder',
    description: 'Back quarter view',
    azimuth: 'back-right',
    elevation: 'elevated',
    distance: 'medium'
  }
] as const;

// Types
export type AzimuthKey = typeof AZIMUTHS[number]['key'];
export type ElevationKey = typeof ELEVATIONS[number]['key'];
export type DistanceKey = typeof DISTANCES[number]['key'];
export type CameraPresetKey = typeof CAMERA_PRESETS[number]['key'];

export interface CameraAngleConfig {
  azimuth: AzimuthKey;
  elevation: ElevationKey;
  distance: DistanceKey;
}

export interface CameraAngleGenerationParams {
  contextImage: string; // Base64 or URL of the source image
  azimuth: AzimuthKey;
  elevation: ElevationKey;
  distance: DistanceKey;
  width: number;
  height: number;
  loraStrength?: number;
  tokenType: 'spark' | 'sogni';
}

/**
 * Build the camera angle prompt with activation keyword
 * Format: <sks> [azimuth_prompt] [elevation_prompt] [distance_prompt]
 */
export function buildCameraAnglePrompt(
  azimuth: AzimuthKey,
  elevation: ElevationKey,
  distance: DistanceKey
): string {
  const azimuthConfig = AZIMUTHS.find(a => a.key === azimuth) || AZIMUTHS[0];
  const elevationConfig = ELEVATIONS.find(e => e.key === elevation) || ELEVATIONS[1];
  const distanceConfig = DISTANCES.find(d => d.key === distance) || DISTANCES[1];

  return `<sks> ${azimuthConfig.prompt} ${elevationConfig.prompt} ${distanceConfig.prompt}`;
}

/**
 * Get a camera preset configuration
 */
export function getCameraPreset(presetKey: CameraPresetKey): CameraAngleConfig | null {
  const preset = CAMERA_PRESETS.find(p => p.key === presetKey);
  if (!preset) return null;

  return {
    azimuth: preset.azimuth as AzimuthKey,
    elevation: preset.elevation as ElevationKey,
    distance: preset.distance as DistanceKey
  };
}

/**
 * Get azimuth configuration by key
 */
export function getAzimuthConfig(key: AzimuthKey) {
  return AZIMUTHS.find(a => a.key === key) || AZIMUTHS[0];
}

/**
 * Get elevation configuration by key
 */
export function getElevationConfig(key: ElevationKey) {
  return ELEVATIONS.find(e => e.key === key) || ELEVATIONS[1];
}

/**
 * Get distance configuration by key
 */
export function getDistanceConfig(key: DistanceKey) {
  return DISTANCES.find(d => d.key === key) || DISTANCES[1];
}

/**
 * Calculate the total number of camera angle combinations
 */
export function getTotalCameraAngleCombinations(): number {
  return AZIMUTHS.length * ELEVATIONS.length * DISTANCES.length; // 8 × 4 × 3 = 96
}

/**
 * Validate camera angle configuration
 */
export function isValidCameraAngleConfig(config: CameraAngleConfig): boolean {
  const validAzimuth = AZIMUTHS.some(a => a.key === config.azimuth);
  const validElevation = ELEVATIONS.some(e => e.key === config.elevation);
  const validDistance = DISTANCES.some(d => d.key === config.distance);

  return validAzimuth && validElevation && validDistance;
}

/**
 * Get descriptive label for a camera angle combination
 */
export function getCameraAngleLabel(config: CameraAngleConfig): string {
  const azimuth = getAzimuthConfig(config.azimuth);
  const elevation = getElevationConfig(config.elevation);
  const distance = getDistanceConfig(config.distance);

  return `${azimuth.label}, ${elevation.label}, ${distance.label}`;
}

/**
 * LocalStorage key for tracking if user has seen the camera angle intro
 */
export const CAMERA_ANGLE_INTRO_SEEN_KEY = 'sogni_camera_angle_intro_seen';

/**
 * Check if the user has seen the camera angle intro
 */
export function hasSeenCameraAngleIntro(): boolean {
  try {
    return localStorage.getItem(CAMERA_ANGLE_INTRO_SEEN_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark the camera angle intro as seen
 */
export function markCameraAngleIntroSeen(): void {
  try {
    localStorage.setItem(CAMERA_ANGLE_INTRO_SEEN_KEY, 'true');
  } catch {
    // Ignore storage errors
  }
}
