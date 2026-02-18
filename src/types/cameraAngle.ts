/**
 * Camera Angle Types
 *
 * Types and interfaces for the multi-angle camera feature.
 * Supports multiple camera angles with review/regeneration workflow.
 */

import type { AzimuthKey, ElevationKey, DistanceKey } from '../constants/cameraAngleSettings';

/**
 * Represents a single camera angle slot configuration
 */
export interface AngleSlot {
  id: string;
  /** If true, this slot represents the original image (no generation needed) */
  isOriginal?: boolean;
  azimuth: AzimuthKey;
  elevation: ElevationKey;
  distance: DistanceKey;
}

/**
 * Status of an individual angle generation item
 */
export type AngleGenerationStatus = 'pending' | 'generating' | 'ready' | 'failed';

/**
 * Represents a single angle generation item in the review popup
 */
export interface AngleGenerationItem {
  /** Index of this item in the generation batch */
  index: number;
  /** ID of the associated AngleSlot */
  slotId: string;
  /** URL of the source image */
  sourceImageUrl: string;
  /** URL of the generated result (when ready) */
  resultUrl?: string;
  /** Current generation status */
  status: AngleGenerationStatus;
  /** Generation progress (0-100) */
  progress?: number;
  /** Estimated time remaining in seconds */
  eta?: number;
  /** Error message if failed */
  error?: string;
  /** History of generated versions (URLs) */
  versionHistory: string[];
  /** Currently selected version index */
  selectedVersion: number;
  /** Worker name processing this item */
  workerName?: string;
  /** Camera angle configuration for this item */
  angleConfig: {
    azimuth: AzimuthKey;
    elevation: ElevationKey;
    distance: DistanceKey;
  };
}

/**
 * Multi-angle preset template
 */
export interface MultiAnglePreset {
  /** Unique key identifier */
  key: string;
  /** Display label */
  label: string;
  /** Short description */
  description: string;
  /** Emoji icon */
  icon: string;
  /** Array of angle configurations */
  angles: Array<{
    azimuth: AzimuthKey;
    elevation: ElevationKey;
    distance: DistanceKey;
    /** If true, this angle represents the original image (no generation) */
    isOriginal?: boolean;
  }>;
}

/**
 * Mode for angle selection
 * - 'same': Same angle for all images (batch mode default)
 * - 'per-image': Different angles per image (batch mode with checkbox unchecked)
 * - 'multiple': Generate multiple angles from single image
 */
export type AngleSelectionMode = 'same' | 'per-image' | 'multiple';

/**
 * Props for the CameraAngleReviewPopup component
 */
export interface CameraAngleReviewPopupProps {
  /** Whether the popup is visible */
  visible: boolean;
  /** Items being generated/reviewed */
  items: AngleGenerationItem[];
  /** The source photo for generation */
  sourcePhoto: {
    id: string;
    images?: string[];
    originalDataUrl?: string;
  };
  /** Whether to keep the original image first in gallery */
  keepOriginal: boolean;
  /** Callback when closing the popup */
  onClose: () => void;
  /** Callback to regenerate a specific item */
  onRegenerateItem: (index: number) => void;
  /** Callback when applying results to gallery */
  onApply: (finalUrls: string[]) => void;
  /** Callback when changing version selection */
  onVersionChange: (index: number, version: number) => void;
  /** Callback when canceling during generation */
  onCancelGeneration?: () => void;
  /** Callback when canceling a single item */
  onCancelItem?: (index: number) => void;
}

/**
 * Parameters for multi-angle generation
 */
export interface MultiAngleGenerationParams {
  /** Source image URL or data URL */
  sourceImageUrl: string;
  /** Per-slot source image URLs (when different images per angle, e.g. gallery mode) */
  sourceImageUrls?: string[];
  /** Source photo ID (for reference) */
  sourcePhotoId: string;
  /** Array of angle configurations to generate */
  angles: AngleSlot[];
  /** Token type for payment */
  tokenType: 'spark' | 'sogni';
  /** Output image width */
  imageWidth: number;
  /** Output image height */
  imageHeight: number;
  /** LoRA strength (default: 0.9) */
  loraStrength?: number;
  /** Output image format (default: 'jpg') */
  outputFormat?: 'png' | 'jpg';
}

/**
 * Callbacks for multi-angle generation progress
 */
export interface MultiAngleGenerationCallbacks {
  /** Called when an item starts generating */
  onItemStart?: (index: number, slotId: string) => void;
  /** Called when an item's progress updates */
  onItemProgress?: (index: number, progress: number, eta?: number, workerName?: string) => void;
  /** Called when an item completes successfully */
  onItemComplete?: (index: number, resultUrl: string) => void;
  /** Called when an item fails */
  onItemError?: (index: number, error: string) => void;
  /** Called when user is out of credits */
  onOutOfCredits?: () => void;
  /** Called when all items are done (success or failure) */
  onAllComplete?: (results: Array<{ index: number; success: boolean; url?: string; error?: string }>) => void;
}

/**
 * Result from multi-angle generation
 */
export interface MultiAngleGenerationResult {
  /** Whether all generations succeeded */
  success: boolean;
  /** Array of result URLs (in order) */
  urls: string[];
  /** Array of failed indices */
  failedIndices: number[];
  /** Errors by index */
  errors: Map<number, string>;
}
