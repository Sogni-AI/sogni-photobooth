/**
 * Camera 360 Transition Generator Service
 *
 * Generates video transitions between camera angle images for the 360 Camera workflow.
 * Adapted from sogni-360's TransitionGenerator.ts but simplified for the photobooth:
 * - Frontend SDK only (no backend proxy - video requires supportsVideo)
 * - Callback-based for integration with the workflow hook
 * - Independent from gallery state (doesn't use setPhotos, etc.)
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Camera360TransitionItem } from '../types/camera360';
import type { VideoQualityPreset, VideoResolution } from '../constants/videoSettings';
import { calculateVideoFrames, calculateVideoDimensions } from '../constants/videoSettings';
import {
  TRANSITION_QUALITY_PRESETS,
  TRANSITION_OUTPUT_FPS,
  DEFAULT_360_NEGATIVE_PROMPT
} from '../constants/camera360Settings';
import { fetchS3AsBlob } from '../utils/s3FetchWithFallback';

// Retry configuration
const MAX_ATTEMPTS = 3;

type SogniClient = {
  supportsVideo?: boolean;
  projects: {
    create: (params: Record<string, unknown>) => Promise<any>;
    on: (event: string, handler: (...args: any[]) => void) => void;
    off: (event: string, handler: (...args: any[]) => void) => void;
  };
};

export interface GenerateTransitionResult {
  videoUrl: string;
  sdkProjectId?: string;
  sdkJobId?: string;
}

export interface GenerateTransitionOptions {
  transitionId: string;
  fromImageUrl: string;
  toImageUrl: string;
  prompt: string;
  negativePrompt?: string;
  resolution?: VideoResolution;
  quality?: VideoQualityPreset;
  duration?: number;
  tokenType?: 'spark' | 'sogni';
  sourceWidth?: number;
  sourceHeight?: number;
  sogniClient: SogniClient;
  abortRef?: React.MutableRefObject<boolean>;
  onProgress?: (progress: number, workerName?: string) => void;
  onComplete?: (result: GenerateTransitionResult) => void;
  onError?: (error: Error) => void;
}

/**
 * Check if an error is an insufficient funds error
 */
function isInsufficientFundsError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('insufficient') ||
    message.includes('debit error') ||
    (message.includes('funds') && !message.includes('refund'))
  );
}

/**
 * Check if an error is non-retryable
 */
function isNonRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    isInsufficientFundsError(error) ||
    message.includes('credits') ||
    message.includes('balance') ||
    message.includes('unauthorized') ||
    message.includes('forbidden')
  );
}

/**
 * Convert image URL to Blob for SDK
 */
async function imageUrlToBlob(url: string): Promise<Blob> {
  if (!url) throw new Error('Image URL is required');
  if (url.startsWith('data:')) {
    const [header, base64Data] = url.split(',');
    const mimeMatch = header.match(/data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  } else if (url.startsWith('http')) {
    return fetchS3AsBlob(url);
  } else if (url.startsWith('blob:')) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch blob: ${response.statusText}`);
    }
    return response.blob();
  } else {
    const binaryString = atob(url);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: 'image/jpeg' });
  }
}

/**
 * Generate a single transition video between two images using the frontend SDK.
 */
async function generateTransitionSDK(
  options: GenerateTransitionOptions
): Promise<GenerateTransitionResult | null> {
  const {
    transitionId,
    fromImageUrl,
    toImageUrl,
    prompt,
    negativePrompt = DEFAULT_360_NEGATIVE_PROMPT,
    resolution = '480p',
    quality = 'balanced',
    duration = 1.5,
    tokenType = 'spark',
    sourceWidth = 1024,
    sourceHeight = 1024,
    sogniClient,
    abortRef,
    onProgress,
    onComplete,
    onError
  } = options;

  if (!sogniClient || sogniClient.supportsVideo === false) {
    throw new Error('Frontend SDK client required for video generation');
  }

  const qualityConfig = TRANSITION_QUALITY_PRESETS[quality];
  const videoDimensions = calculateVideoDimensions(sourceWidth, sourceHeight, resolution);
  const frames = calculateVideoFrames(duration);

  console.log(`[360-Transition] ${transitionId}: ${videoDimensions.width}x${videoDimensions.height}, ${frames} frames`);

  // Convert images to blobs
  const [fromBlob, toBlob] = await Promise.all([
    imageUrlToBlob(fromImageUrl),
    imageUrlToBlob(toImageUrl)
  ]);

  if (abortRef?.current) return null;

  const projectOptions: Record<string, any> = {
    type: 'video' as const,
    modelId: qualityConfig.model,
    positivePrompt: prompt,
    negativePrompt: negativePrompt,
    stylePrompt: '',
    sizePreset: 'custom' as const,
    width: videoDimensions.width,
    height: videoDimensions.height,
    steps: qualityConfig.steps,
    shift: qualityConfig.shift,
    guidance: qualityConfig.guidance,
    frames: frames,
    fps: TRANSITION_OUTPUT_FPS,
    numberOfMedia: 1,
    numberOfPreviews: 3,
    sampler: 'euler' as const,
    scheduler: 'simple' as const,
    disableNSFWFilter: true,
    outputFormat: 'mp4' as const,
    tokenType: tokenType,
    referenceImage: fromBlob,
    referenceImageEnd: toBlob
  };

  const project = await sogniClient.projects.create(projectOptions as any);
  if (!project?.id) {
    throw new Error('Failed to create SDK project');
  }
  console.log(`[360-Transition] ${transitionId}: project created ${project.id}`);

  return new Promise((resolve) => {
    let projectFinished = false;
    let result: GenerateTransitionResult | null = null;
    const sentJobCompletions = new Set<string>();
    let cachedWorkerName: string | undefined;

    const jobHandler = (event: any) => {
      if (event.projectId !== project.id) return;
      if (abortRef?.current) {
        cleanup();
        resolve(null);
        return;
      }

      switch (event.type) {
        case 'started':
        case 'initiating':
          if (event.workerName) cachedWorkerName = event.workerName;
          onProgress?.(0, cachedWorkerName);
          break;

        case 'progress':
          if (event.step && event.stepCount) {
            const progress = (event.step / event.stepCount) * 100;
            onProgress?.(progress, cachedWorkerName);
          }
          break;

        case 'completed':
        case 'jobCompleted': {
          // Match VideoGenerator.ts pattern: check both resultUrl and result
          const completedResultUrl = event.resultUrl || event.result;
          if (completedResultUrl && !sentJobCompletions.has(event.jobId || 'default')) {
            sentJobCompletions.add(event.jobId || 'default');
            result = {
              videoUrl: completedResultUrl,
              sdkProjectId: event.projectId || project.id,
              sdkJobId: event.jobId
            };
            onComplete?.(result);
          }
          break;
        }
      }
    };

    const cleanup = () => {
      if (projectFinished) return;
      projectFinished = true;
      sogniClient.projects.off('job', jobHandler);
    };

    sogniClient.projects.on('job', jobHandler);

    // FrontendProjectAdapter emits 'completed' with NO arguments (unlike raw SDK).
    // The video URL should have been captured by the job handler above.
    project.on('completed', () => {
      if (projectFinished) return;
      cleanup();

      if (!result) {
        onError?.(new Error('Generation completed but no video URL received'));
      }
      resolve(result);
    });

    // Also listen for 'jobCompleted' on the project adapter (where it emits resultUrl)
    project.on('jobCompleted', (event: any) => {
      if (projectFinished) return;
      const completedUrl = event?.resultUrl || event?.result;
      if (completedUrl && !result) {
        result = {
          videoUrl: completedUrl,
          sdkProjectId: project.id,
          sdkJobId: event?.id || event?.jobId
        };
        onComplete?.(result);
      }
    });

    project.on('failed', (errorData: { message?: string; code?: number }) => {
      const errorMessage = errorData?.message || 'Generation failed';
      if (projectFinished) return;
      cleanup();
      onError?.(new Error(errorMessage));
      resolve(null);
    });

    // 15 minute timeout
    setTimeout(() => {
      if (!projectFinished) {
        cleanup();
        onError?.(new Error('Video project timeout after 15 minutes'));
        resolve(null);
      }
    }, 15 * 60 * 1000);
  });
}

/**
 * Generate a single transition with retry logic.
 */
export async function generateTransition(
  options: GenerateTransitionOptions
): Promise<GenerateTransitionResult | null> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (options.abortRef?.current) return null;

    try {
      console.log(`[360-Transition] ${options.transitionId} attempt ${attempt}/${MAX_ATTEMPTS}`);

      if (attempt > 1) {
        options.onProgress?.(0);
      }

      const result = await generateTransitionSDK(options);

      if (result) {
        if (attempt > 1) {
          console.log(`[360-Transition] ${options.transitionId} succeeded on attempt ${attempt}`);
        }
        return result;
      }

      if (options.abortRef?.current) return null;

      if (!lastError) {
        lastError = new Error('Generation returned no video');
      }
      throw lastError;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (isNonRetryableError(lastError)) {
        console.error(`[360-Transition] ${options.transitionId} non-retryable:`, lastError.message);
        break;
      }

      if (attempt >= MAX_ATTEMPTS) {
        console.error(`[360-Transition] ${options.transitionId} failed after ${MAX_ATTEMPTS} attempts`);
      }
    }
  }

  if (lastError) {
    const userFriendlyError = isInsufficientFundsError(lastError)
      ? new Error('Insufficient credits')
      : lastError;
    options.onError?.(userFriendlyError);
  }
  return null;
}

/**
 * Generate multiple transitions in parallel.
 * All transitions are submitted simultaneously for maximum throughput.
 */
export async function generateMultipleTransitions(
  transitions: Camera360TransitionItem[],
  angleImageUrls: string[],
  options: {
    prompt: string;
    negativePrompt?: string;
    resolution?: VideoResolution;
    quality?: VideoQualityPreset;
    duration?: number;
    tokenType?: 'spark' | 'sogni';
    sourceWidth?: number;
    sourceHeight?: number;
    sogniClient: SogniClient;
    abortRef?: React.MutableRefObject<boolean>;
    onTransitionStart?: (transitionId: string) => void;
    onTransitionProgress?: (transitionId: string, progress: number, workerName?: string) => void;
    onTransitionComplete?: (transitionId: string, result: GenerateTransitionResult) => void;
    onTransitionError?: (transitionId: string, error: Error) => void;
    onOutOfCredits?: () => void;
    onAllComplete?: () => void;
  }
): Promise<Map<string, GenerateTransitionResult | null>> {
  const {
    prompt,
    negativePrompt = DEFAULT_360_NEGATIVE_PROMPT,
    resolution = '480p',
    quality = 'balanced',
    duration = 1.5,
    tokenType = 'spark',
    sourceWidth = 1024,
    sourceHeight = 1024,
    sogniClient,
    abortRef,
    onTransitionStart,
    onTransitionProgress,
    onTransitionComplete,
    onTransitionError,
    onOutOfCredits,
    onAllComplete
  } = options;

  console.log(`[360-Transition] Starting ${transitions.length} transitions`);

  let hasCalledOutOfCredits = false;
  const results = new Map<string, GenerateTransitionResult | null>();

  const processTransition = async (transition: Camera360TransitionItem): Promise<void> => {
    if (abortRef?.current) return;

    onTransitionStart?.(transition.id);

    const fromImageUrl = angleImageUrls[transition.fromIndex];
    const toImageUrl = angleImageUrls[transition.toIndex];

    if (!fromImageUrl || !toImageUrl) {
      const error = new Error('Missing angle images for transition');
      results.set(transition.id, null);
      onTransitionError?.(transition.id, error);
      return;
    }

    const result = await generateTransition({
      transitionId: transition.id,
      fromImageUrl,
      toImageUrl,
      prompt,
      negativePrompt,
      resolution,
      quality,
      duration,
      tokenType,
      sourceWidth,
      sourceHeight,
      sogniClient,
      abortRef,
      onProgress: (progress, workerName) => {
        onTransitionProgress?.(transition.id, progress, workerName);
      },
      onComplete: (r) => {
        onTransitionComplete?.(transition.id, r);
      },
      onError: (error) => {
        if (isInsufficientFundsError(error) && !hasCalledOutOfCredits) {
          hasCalledOutOfCredits = true;
          onOutOfCredits?.();
        }
        results.set(transition.id, null);
        onTransitionError?.(transition.id, error);
      }
    });

    if (result) {
      results.set(transition.id, result);
    }
  };

  await Promise.all(transitions.map(processTransition));
  onAllComplete?.();

  return results;
}
