/**
 * Multi-Angle Generator Service
 *
 * Orchestrates batch generation of multiple camera angles from a single source image.
 * Uses the same underlying generation logic as CameraAngleGenerator but manages
 * concurrent jobs and provides aggregate progress callbacks.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  AngleSlot,
  AngleGenerationItem,
  MultiAngleGenerationParams,
  MultiAngleGenerationCallbacks,
  MultiAngleGenerationResult
} from '../types/cameraAngle';
import {
  CAMERA_ANGLE_MODEL,
  CAMERA_ANGLE_DEFAULTS,
  CAMERA_ANGLE_LORA,
  getAzimuthConfig,
  getElevationConfig,
  getDistanceConfig
} from '../constants/cameraAngleSettings';

type SogniClient = {
  projects: {
    create: (params: Record<string, unknown>) => Promise<any>;
  };
};

/**
 * Load an image URL as a Uint8Array buffer
 * Handles both blob URLs and HTTPS URLs
 */
async function loadImageAsBuffer(url: string): Promise<Uint8Array> {
  // For blob URLs, fetch directly
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  // For HTTPS URLs, use Image + Canvas to handle CORS
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to convert canvas to blob'));
          return;
        }
        blob.arrayBuffer().then(arrayBuffer => {
          resolve(new Uint8Array(arrayBuffer));
        }).catch(reject);
      }, 'image/png');
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Generate a single angle from a source image
 * Returns a promise that resolves with the result URL or rejects with an error
 */
async function generateSingleAngle(
  sogniClient: SogniClient,
  imageBuffer: Uint8Array,
  slot: AngleSlot,
  params: MultiAngleGenerationParams,
  callbacks: MultiAngleGenerationCallbacks,
  index: number
): Promise<string> {
  const azimuthConfig = getAzimuthConfig(slot.azimuth);
  const elevationConfig = getElevationConfig(slot.elevation);
  const distanceConfig = getDistanceConfig(slot.distance);

  // Build the full prompt with activation keyword
  const fullPrompt = `<sks> ${azimuthConfig.prompt} ${elevationConfig.prompt} ${distanceConfig.prompt}`;

  // Notify start
  callbacks.onItemStart?.(index, slot.id);

  return new Promise((resolve, reject) => {
    const timeoutMs = 2 * 60 * 1000; // 2 minutes
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    // Set timeout
    timeoutId = setTimeout(() => {
      cleanup();
      callbacks.onItemError?.(index, 'Generation timed out');
      reject(new Error('Generation timed out'));
    }, timeoutMs);

    // Create project
    const seed = Math.floor(Math.random() * 2147483647);

    const projectConfig = {
      type: 'image',
      modelId: CAMERA_ANGLE_MODEL,
      positivePrompt: fullPrompt,
      negativePrompt: '',
      numberOfMedia: 1,
      steps: CAMERA_ANGLE_DEFAULTS.steps,
      guidance: CAMERA_ANGLE_DEFAULTS.guidance,
      seed: seed,
      sizePreset: 'custom',
      width: params.imageWidth,
      height: params.imageHeight,
      contextImages: [imageBuffer],
      tokenType: params.tokenType,
      loraId: CAMERA_ANGLE_LORA.loraId,
      loras: CAMERA_ANGLE_LORA.loras,
      loraStrengths: [params.loraStrength || CAMERA_ANGLE_LORA.defaultStrength],
      sampler: 'euler',
      scheduler: 'simple'
    };

    sogniClient.projects.create(projectConfig)
      .then((project: any) => {
        // Track our project/job IDs for filtering events
        const ourProjectId = project.id;
        let ourJobId: string | null = null;

        // Listen for job events
        project.on('job', (event: any) => {
          // Filter to only handle events for our project
          if (event.projectId && event.projectId !== ourProjectId) {
            return;
          }

          const { type, jobId, progress, workerName } = event;

          if (type === 'started' && jobId) {
            ourJobId = jobId;
          }

          if (type === 'progress' && progress !== undefined) {
            const progressPercent = Math.floor((typeof progress === 'number' ? progress : 0) * 100);
            callbacks.onItemProgress?.(index, progressPercent, undefined, workerName);
          }

          if (type === 'eta' && event.eta !== undefined) {
            callbacks.onItemProgress?.(index, undefined as any, event.eta, workerName);
          }

          if (type === 'queued' && event.queuePosition !== undefined) {
            // We could expose queue position if needed
          }
        });

        // Listen for completion
        project.on('jobCompleted', (job: any) => {
          // Filter by project ID in URL
          const urlProjectId = job.resultUrl?.match(/\/([A-F0-9-]{36})\/complete-/i)?.[1];
          if (urlProjectId && urlProjectId !== ourProjectId) {
            return;
          }

          // Also check job ID if we have it
          if (ourJobId && job.id !== ourJobId) {
            return;
          }

          if (job.resultUrl) {
            cleanup();
            callbacks.onItemComplete?.(index, job.resultUrl);
            resolve(job.resultUrl);
          }
        });

        // Listen for failure
        project.on('jobFailed', (error: any) => {
          cleanup();
          const errorMsg = error?.message || error?.error || 'Generation failed';

          // Check for insufficient funds
          const isInsufficientFunds = error?.code === 4024 ||
            errorMsg?.toLowerCase().includes('insufficient');

          if (isInsufficientFunds) {
            callbacks.onOutOfCredits?.();
            callbacks.onItemError?.(index, 'Insufficient credits');
            reject(new Error('Insufficient credits'));
          } else {
            callbacks.onItemError?.(index, errorMsg);
            reject(new Error(errorMsg));
          }
        });

        // Listen for errors
        project.on('error', (error: any) => {
          cleanup();
          const errorMsg = error?.message || 'Generation error';
          callbacks.onItemError?.(index, errorMsg);
          reject(new Error(errorMsg));
        });
      })
      .catch((createError: any) => {
        cleanup();

        // Check for insufficient funds
        const isInsufficientFunds = createError?.code === 4024 ||
          createError?.message?.toLowerCase().includes('insufficient');

        if (isInsufficientFunds) {
          callbacks.onOutOfCredits?.();
          callbacks.onItemError?.(index, 'Insufficient credits');
          reject(new Error('Insufficient credits'));
        } else {
          const errorMsg = createError?.message || 'Failed to create project';
          callbacks.onItemError?.(index, errorMsg);
          reject(new Error(errorMsg));
        }
      });
  });
}

/**
 * Generate multiple camera angles from a single source image
 *
 * Runs all angles concurrently (the SDK supports concurrent projects).
 * Progress is reported via callbacks for each individual item.
 */
export async function generateMultipleAngles(
  sogniClient: SogniClient,
  params: MultiAngleGenerationParams,
  callbacks: MultiAngleGenerationCallbacks = {}
): Promise<MultiAngleGenerationResult> {
  const { angles, sourceImageUrl } = params;

  // Load source image once
  let imageBuffer: Uint8Array;
  try {
    imageBuffer = await loadImageAsBuffer(sourceImageUrl);
  } catch (error) {
    // Fail all items if we can't load the source
    const errorMsg = error instanceof Error ? error.message : 'Failed to load source image';
    for (let i = 0; i < angles.length; i++) {
      callbacks.onItemError?.(i, errorMsg);
    }

    const errorMap = new Map<number, string>();
    angles.forEach((_, i) => errorMap.set(i, errorMsg));

    callbacks.onAllComplete?.(
      angles.map((_, i) => ({ index: i, success: false, error: errorMsg }))
    );

    return {
      success: false,
      urls: [],
      failedIndices: angles.map((_, i) => i),
      errors: errorMap
    };
  }

  // Track results
  const results: Array<{ index: number; success: boolean; url?: string; error?: string }> = [];
  const urls: string[] = new Array(angles.length).fill('');
  const errors = new Map<number, string>();

  // Enhanced callbacks that forward to user callbacks
  const enhancedCallbacks: MultiAngleGenerationCallbacks = {
    ...callbacks,
    onOutOfCredits: () => {
      callbacks.onOutOfCredits?.();
    }
  };

  // Generate all angles concurrently
  // Note: isOriginal slots are filtered out by createAngleGenerationItems before reaching here
  const promises = angles.map((slot, index) =>
    generateSingleAngle(sogniClient, imageBuffer, slot, params, enhancedCallbacks, index)
      .then(url => {
        urls[index] = url;
        results.push({ index, success: true, url });
      })
      .catch(err => {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        errors.set(index, errorMsg);
        results.push({ index, success: false, error: errorMsg });
      })
  );

  // Wait for all to complete
  await Promise.all(promises);

  // Sort results by index for consistent ordering
  results.sort((a, b) => a.index - b.index);

  // Notify completion
  callbacks.onAllComplete?.(results);

  // Determine overall success
  const failedIndices = results.filter(r => !r.success).map(r => r.index);
  const success = failedIndices.length === 0;

  return {
    success,
    urls: urls.filter(u => u), // Filter out empty strings
    failedIndices,
    errors
  };
}

/**
 * Create initial AngleGenerationItem array from angle slots
 */
export function createAngleGenerationItems(
  angles: AngleSlot[],
  sourceImageUrl: string
): AngleGenerationItem[] {
  // Filter out isOriginal slots - they use the source image directly and are
  // displayed separately in the review popup as the "original" card
  const generatableAngles = angles.filter(slot => !slot.isOriginal);

  return generatableAngles.map((slot, index) => ({
    index,
    slotId: slot.id,
    sourceImageUrl,
    resultUrl: undefined,
    status: 'pending' as const,
    progress: 0,
    eta: undefined,
    error: undefined,
    versionHistory: [],
    selectedVersion: 0,
    workerName: undefined,
    angleConfig: {
      azimuth: slot.azimuth,
      elevation: slot.elevation,
      distance: slot.distance
    }
  }));
}

/**
 * Update a single item in the items array
 */
export function updateAngleItem(
  items: AngleGenerationItem[],
  index: number,
  updates: Partial<AngleGenerationItem>
): AngleGenerationItem[] {
  return items.map((item, i) =>
    i === index ? { ...item, ...updates } : item
  );
}

/**
 * Mark an item as started
 */
export function markItemStarted(
  items: AngleGenerationItem[],
  index: number
): AngleGenerationItem[] {
  return updateAngleItem(items, index, {
    status: 'generating',
    progress: 0,
    error: undefined
  });
}

/**
 * Update item progress
 */
export function updateItemProgress(
  items: AngleGenerationItem[],
  index: number,
  progress: number,
  eta?: number,
  workerName?: string
): AngleGenerationItem[] {
  const updates: Partial<AngleGenerationItem> = { status: 'generating' };
  if (progress !== undefined) updates.progress = progress;
  if (eta !== undefined) updates.eta = eta;
  if (workerName !== undefined) updates.workerName = workerName;
  return updateAngleItem(items, index, updates);
}

/**
 * Mark an item as complete
 */
export function markItemComplete(
  items: AngleGenerationItem[],
  index: number,
  resultUrl: string
): AngleGenerationItem[] {
  const item = items[index];
  const versionHistory = [...item.versionHistory, resultUrl];

  return updateAngleItem(items, index, {
    status: 'ready',
    resultUrl,
    progress: 100,
    error: undefined,
    versionHistory,
    selectedVersion: versionHistory.length - 1
  });
}

/**
 * Mark an item as failed
 */
export function markItemFailed(
  items: AngleGenerationItem[],
  index: number,
  error: string
): AngleGenerationItem[] {
  return updateAngleItem(items, index, {
    status: 'failed',
    error,
    progress: 0
  });
}

/**
 * Reset an item for regeneration
 */
export function resetItemForRegeneration(
  items: AngleGenerationItem[],
  index: number
): AngleGenerationItem[] {
  return updateAngleItem(items, index, {
    status: 'pending',
    progress: 0,
    eta: undefined,
    error: undefined,
    workerName: undefined
    // Keep resultUrl, versionHistory, and selectedVersion
  });
}

export default {
  generateMultipleAngles,
  createAngleGenerationItems,
  updateAngleItem,
  markItemStarted,
  updateItemProgress,
  markItemComplete,
  markItemFailed,
  resetItemForRegeneration
};
