/**
 * Image Enhancer Service
 *
 * Stateless enhancement function using Z-Image Turbo (img2img).
 * Takes sogniClient as a parameter — works with both the backend proxy client
 * and the direct frontend SDK adapter.
 *
 * Unlike PhotoEnhancer.js (tightly coupled to photo gallery state), this is a
 * clean function that returns a Promise and reports progress via callbacks,
 * letting the caller manage state however it wants.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { fetchS3AsBlob } from '../utils/s3FetchWithFallback';

export interface EnhanceImageOptions {
  /** URL of the image to enhance */
  imageUrl: string;
  /** Output width */
  width: number;
  /** Output height */
  height: number;
  /** Sogni client instance (backend proxy or frontend SDK) */
  sogniClient: any;
  /** Payment token type */
  tokenType?: 'spark' | 'sogni';
  /** Enhancement prompt */
  prompt?: string;
  /** Z-Image Turbo inference steps (4-10, default 6) */
  steps?: number;
  /** Progress callback (0-100, optional worker name) */
  onProgress?: (progress: number, workerName?: string) => void;
  /** Completion callback with result URL */
  onComplete?: (imageUrl: string) => void;
  /** Error callback */
  onError?: (error: Error) => void;
}

const DEFAULT_ENHANCE_PROMPT = '(Extra detailed and contrasty portrait) Portrait masterpiece';

/**
 * Convert an image URL to a Uint8Array for the SDK.
 * Handles S3 URLs (with CORS fallback), data URLs, and blob URLs.
 */
async function imageUrlToBuffer(url: string): Promise<Uint8Array> {
  let blob: Blob;

  if (url.startsWith('data:')) {
    const [header, base64Data] = url.split(',');
    const mimeMatch = header.match(/data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    blob = new Blob([bytes], { type: mimeType });
  } else if (url.startsWith('blob:')) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch blob: ${response.statusText}`);
    blob = await response.blob();
  } else {
    // HTTP/HTTPS — use S3 fetch with CORS fallback
    blob = await fetchS3AsBlob(url);
  }

  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * Enhance a single image using Z-Image Turbo.
 *
 * Creates a project on the sogniClient, listens for progress/completion/failure
 * events, and resolves with the enhanced image URL (or null on failure).
 */
export async function enhanceImage(options: EnhanceImageOptions): Promise<string | null> {
  const {
    imageUrl,
    width,
    height,
    sogniClient,
    tokenType = 'spark',
    prompt = DEFAULT_ENHANCE_PROMPT,
    steps = 6,
    onProgress,
    onComplete,
    onError
  } = options;

  if (!sogniClient?.projects?.create) {
    const err = new Error('Sogni client is not properly initialized');
    onError?.(err);
    return null;
  }

  console.log(`[ImageEnhancer] Enhancing image at ${width}x${height}`);

  // Convert source image to buffer
  const imageBuffer = await imageUrlToBuffer(imageUrl);

  const projectConfig = {
    type: 'image' as const,
    testnet: false,
    tokenType,
    modelId: 'z_image_turbo_bf16',
    positivePrompt: prompt,
    sizePreset: 'custom' as const,
    width,
    height,
    steps: Math.max(4, Math.min(10, steps)),
    guidance: 3.5,
    numberOfMedia: 1,
    outputFormat: 'jpg' as const,
    sensitiveContentFilter: false,
    startingImage: imageBuffer,
    startingImageStrength: 0.75,
    sourceType: 'enhancement-360-angle'
  };

  let project: any;
  try {
    project = await sogniClient.projects.create(projectConfig);
    console.log(`[ImageEnhancer] Project created: ${project.id}`);
  } catch (createError: any) {
    const msg = createError?.message || createError?.payload?.message || 'Failed to create enhancement project';
    console.error(`[ImageEnhancer] Project creation failed:`, msg);
    const err = new Error(msg);
    onError?.(err);
    return null;
  }

  return new Promise<string | null>((resolve) => {
    let finished = false;
    let resultUrl: string | null = null;
    let cachedWorkerName: string | undefined;

    const finish = (url: string | null, error?: Error) => {
      if (finished) return;
      finished = true;
      if (error) onError?.(error);
      resolve(url);
    };

    // Job event handler
    project.on('job', (event: any) => {
      const { type } = event;

      if (type === 'started' || type === 'initiating') {
        if (event.workerName) cachedWorkerName = event.workerName;
        onProgress?.(0, cachedWorkerName);
      }

      if (type === 'eta' && event.workerName) {
        cachedWorkerName = event.workerName;
      }

      if (type === 'progress' && event.progress !== undefined) {
        const pct = typeof event.progress === 'number' && event.progress <= 1
          ? event.progress * 100
          : event.progress;
        onProgress?.(pct, cachedWorkerName);
      }
    });

    // Completion
    project.on('jobCompleted', (job: any) => {
      if (job.resultUrl) {
        resultUrl = job.resultUrl;
        console.log(`[ImageEnhancer] Job completed:`, resultUrl);
        onComplete?.(job.resultUrl as string);
        finish(resultUrl);
      }
    });

    // Failure
    project.on('jobFailed', (job: any) => {
      const isInsufficientFunds = job?.error?.code === 4024 ||
        job?.error?.message?.toLowerCase().includes('insufficient');

      const msg = isInsufficientFunds
        ? 'Insufficient credits'
        : (job?.error?.message || 'Enhancement failed');

      console.error(`[ImageEnhancer] Job failed:`, msg);
      finish(null, new Error(msg));
    });

    // Project-level completed (fallback — some clients emit this instead of jobCompleted)
    project.on('completed', (imageUrls: string[]) => {
      if (!resultUrl && imageUrls?.length > 0) {
        resultUrl = imageUrls[0];
        onComplete?.(resultUrl);
      }
      finish(resultUrl);
    });

    // Project-level failed
    project.on('failed', (errorData: any) => {
      const msg = errorData?.message || 'Enhancement failed';
      console.error(`[ImageEnhancer] Project failed:`, msg);
      finish(null, new Error(msg));
    });

    // Timeout — 2 minutes
    setTimeout(() => {
      if (!finished) {
        console.warn(`[ImageEnhancer] Enhancement timeout after 2 minutes`);
        finish(null, new Error('Enhancement timed out'));
      }
    }, 2 * 60 * 1000);
  });
}

export { DEFAULT_ENHANCE_PROMPT };
