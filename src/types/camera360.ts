/**
 * Camera 360 Workflow Types
 *
 * Types and interfaces for the 360 Camera video generation workflow.
 * The workflow generates multiple camera angles from a single photo,
 * creates transition videos between them, and stitches into a seamless loop.
 */

import type { AngleSlot, AngleGenerationItem } from './cameraAngle';
import type { VideoQualityPreset, VideoResolution } from '../constants/videoSettings';

/**
 * Workflow phases for the 360 Camera feature
 */
export type Camera360Step =
  | 'configure-angles'
  | 'review-angles'
  | 'review-transitions'
  | 'final-video';

/**
 * Angle item within the 360 workflow (extends AngleGenerationItem with workflow context)
 */
export type Camera360AngleItem = AngleGenerationItem;

/**
 * Settings for transition video generation
 */
export interface Camera360TransitionSettings {
  resolution: VideoResolution;
  quality: VideoQualityPreset;
  duration: number;
  prompt: string;
  negativePrompt: string;
  musicPresetId: string | null;
  musicStartOffset: number;
}

/**
 * A single transition between two angles
 */
export interface Camera360TransitionItem {
  /** Unique ID for this transition */
  id: string;
  /** Index of the "from" angle in the angles array */
  fromIndex: number;
  /** Index of the "to" angle in the angles array */
  toIndex: number;
  /** URL of the generated video (when ready) */
  videoUrl: string | null;
  /** Current generation status */
  status: 'pending' | 'generating' | 'ready' | 'failed';
  /** Generation progress (0-100) */
  progress: number;
  /** Error message if failed */
  error: string | null;
  /** Worker name processing this transition */
  workerName: string | null;
  /** History of generated versions */
  versionHistory: Array<{
    id: string;
    videoUrl: string;
    createdAt: number;
  }>;
  /** Currently selected version index */
  selectedVersion: number;
}

/**
 * Complete workflow state for the 360 Camera feature
 */
export interface Camera360WorkflowState {
  /** Current workflow step */
  step: Camera360Step;
  /** Selected angle preset key */
  presetKey: string;
  /** Configured angle slots */
  angles: AngleSlot[];
  /** Angle generation items (populated during/after angle generation) */
  angleItems: Camera360AngleItem[];
  /** Transition settings */
  transitionSettings: Camera360TransitionSettings;
  /** Transition items (populated during/after transition generation) */
  transitions: Camera360TransitionItem[];
  /** Final stitched video URL */
  finalVideoUrl: string | null;
  /** Final stitched video blob (for download/share) */
  finalVideoBlob: Blob | null;
  /** Whether generation is in progress */
  isGenerating: boolean;
  /** Stitching progress (0-100) */
  stitchingProgress: number;
}
