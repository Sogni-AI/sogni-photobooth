/**
 * Camera 360 Settings Constants
 *
 * Default settings and configuration for the 360 Camera video generation workflow.
 */

import type { Camera360TransitionSettings } from '../types/camera360';
import type { VideoQualityPreset } from './videoSettings';
import { VIDEO_MODELS } from './videoSettings';

/**
 * Default transition prompt for camera orbit videos.
 * Emphasizes smooth camera rotation.
 */
export const DEFAULT_360_TRANSITION_PROMPT =
  'smooth camera orbit around subject, consistent lighting, cinematic motion';

/**
 * Default negative prompt for video generation (WAN 2.1/2.2 I2V)
 * Keep in Chinese as the model was trained with Chinese negative prompts
 */
export const DEFAULT_360_NEGATIVE_PROMPT =
  '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走';

/**
 * Default transition settings for the 360 workflow
 */
export const DEFAULT_360_TRANSITION_SETTINGS: Camera360TransitionSettings = {
  resolution: '480p',
  quality: 'balanced',
  duration: 1.5,
  prompt: DEFAULT_360_TRANSITION_PROMPT,
  negativePrompt: DEFAULT_360_NEGATIVE_PROMPT,
  musicPresetId: null,
  musicStartOffset: 0,
  customMusicUrl: null,
  customMusicTitle: null
};

/**
 * Quality presets with shift/guidance values for transition video generation.
 * These extend the base VIDEO_QUALITY_PRESETS with model-specific parameters
 * needed by the SDK for video generation.
 *
 * Shift and guidance values based on SDK defaults:
 * - LightX2V (speed): shift 5.0, guidance 1.0
 * - Full quality: shift 8.0, guidance 4.0
 */
export const TRANSITION_QUALITY_PRESETS: Record<VideoQualityPreset, {
  model: string;
  steps: number;
  shift: number;
  guidance: number;
  label: string;
  description: string;
}> = {
  fast: {
    model: VIDEO_MODELS.speed,
    steps: 4,
    shift: 5.0,
    guidance: 1.0,
    label: 'Fast',
    description: 'Quick generation (~12-20s)'
  },
  balanced: {
    model: VIDEO_MODELS.speed,
    steps: 8,
    shift: 5.0,
    guidance: 1.0,
    label: 'Balanced',
    description: 'Good balance (~25-40s)'
  },
  quality: {
    model: VIDEO_MODELS.quality,
    steps: 20,
    shift: 8.0,
    guidance: 4.0,
    label: 'High Quality',
    description: 'Higher quality (~3-4 min)'
  },
  pro: {
    model: VIDEO_MODELS.quality,
    steps: 30,
    shift: 8.0,
    guidance: 4.0,
    label: 'Pro',
    description: 'Maximum quality (~6-9 min)'
  }
};

/**
 * Default FPS for transition video output (post-processing interpolation)
 */
export const TRANSITION_OUTPUT_FPS = 32;

/**
 * Color palette for 360 Camera UI components
 */
export const COLORS = {
  accent: '#FDFF00',
  accentSoft: 'rgba(253, 255, 0, 0.15)',
  black: '#000000',
  white: '#FFFFFF',
  textPrimary: 'rgba(255, 255, 255, 0.9)',
  textSecondary: 'rgba(255, 255, 255, 0.6)',
  textMuted: 'rgba(255, 255, 255, 0.4)',
  surface: '#1c1c1e',
  surfaceLight: 'rgba(255, 255, 255, 0.06)',
  border: 'rgba(255, 255, 255, 0.1)',
  borderLight: 'rgba(255, 255, 255, 0.06)',
  success: '#4ade80',
  error: '#f87171',
  warning: '#fbbf24'
} as const;
