/**
 * Camera Angle Generator Service
 *
 * Follows the same pattern as PhotoEnhancer.js
 * Uses the Multiple Angles LoRA to generate images from different camera angles.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  CAMERA_ANGLE_MODEL,
  CAMERA_ANGLE_DEFAULTS,
  CAMERA_ANGLE_LORA,
  getAzimuthConfig,
  getElevationConfig,
  getDistanceConfig,
  type AzimuthKey,
  type ElevationKey,
  type DistanceKey
} from '../constants/cameraAngleSettings';
import { Photo } from '../types/index';

type SogniClient = {
  projects: {
    create: (params: Record<string, unknown>) => Promise<any>;
  };
};

interface GenerateCameraAngleOptions {
  photo: Photo;
  photoIndex: number;
  subIndex: number;
  imageWidth: number;
  imageHeight: number;
  sogniClient: SogniClient;
  setPhotos: (updater: (prev: Photo[]) => Photo[]) => void;
  azimuth: AzimuthKey;
  elevation: ElevationKey;
  distance: DistanceKey;
  loraStrength?: number;
  tokenType?: 'spark' | 'sogni';
  onComplete?: (imageUrl: string) => void;
  onError?: (error: Error) => void;
  onOutOfCredits?: () => void;
}

/**
 * Generates an image from a different camera angle using the Multiple Angles LoRA
 * Pattern copied directly from PhotoEnhancer.js
 */
export async function generateCameraAngle(options: GenerateCameraAngleOptions): Promise<void> {
  const {
    photo,
    photoIndex,
    subIndex,
    imageWidth,
    imageHeight,
    sogniClient,
    setPhotos,
    azimuth,
    elevation,
    distance,
    loraStrength = CAMERA_ANGLE_LORA.defaultStrength,
    tokenType = 'spark',
    onComplete,
    onError,
    onOutOfCredits
  } = options;

  if (typeof photoIndex !== 'number' || photoIndex < 0 || !photo) {
    onError?.(new Error('Invalid photo or index'));
    return;
  }

  if (photo.generatingCameraAngle) {
    return;
  }

  // Get prompt configs
  const azimuthConfig = getAzimuthConfig(azimuth);
  const elevationConfig = getElevationConfig(elevation);
  const distanceConfig = getDistanceConfig(distance);

  // Build the full prompt with activation keyword
  const fullPrompt = `<sks> ${azimuthConfig.prompt} ${elevationConfig.prompt} ${distanceConfig.prompt}`;

  // Set up timeout
  const timeoutMs = 2 * 60 * 1000; // 2 minutes
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    // Use the stored original source if available, otherwise use current image
    // This ensures we always generate from the original, not a previous camera angle result
    const imageUrl = photo.cameraAngleSourceUrl || photo.enhancedImageUrl || photo.images?.[subIndex] || photo.originalDataUrl;
    if (!imageUrl) {
      throw new Error('No image URL found');
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const imageBlob = await response.blob();
    const arrayBuffer = await imageBlob.arrayBuffer();

    // Set initial state - mark as generating and store original source if not already stored
    setPhotos(prev => {
      const updated = [...prev];
      if (!updated[photoIndex]) return prev;

      // Store the original source URL on first camera angle generation
      const sourceUrl = updated[photoIndex].cameraAngleSourceUrl ||
                       updated[photoIndex].enhancedImageUrl ||
                       updated[photoIndex].images?.[subIndex] ||
                       updated[photoIndex].originalDataUrl;

      updated[photoIndex] = {
        ...updated[photoIndex],
        generatingCameraAngle: true,
        cameraAngleProgress: 0,
        cameraAngleStatus: 'Starting',
        cameraAngleETA: undefined,
        cameraAngleWorkerName: undefined,
        cameraAngleError: undefined,
        cameraAngleStartTime: Date.now(),
        cameraAngleSourceUrl: sourceUrl, // Store for subsequent generations
        cameraAngleRegenerateParams: {
          azimuth,
          elevation,
          distance,
          loraStrength
        }
      };
      return updated;
    });

    // Set timeout
    timeoutId = setTimeout(() => {
      setPhotos(prev => {
        const updated = [...prev];
        if (!updated[photoIndex]) return prev;
        updated[photoIndex] = {
          ...updated[photoIndex],
          generatingCameraAngle: false,
          cameraAngleError: 'Generation timed out'
        };
        return updated;
      });
      onError?.(new Error('Camera angle generation timed out'));
    }, timeoutMs);

    // Create project params
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
      width: imageWidth,
      height: imageHeight,
      contextImages: [new Uint8Array(arrayBuffer)],
      tokenType: tokenType,
      loraId: CAMERA_ANGLE_LORA.loraId,
      loras: CAMERA_ANGLE_LORA.loras,
      loraStrengths: [loraStrength],
      sampler: 'euler',
      scheduler: 'simple'
    };

    // Create project
    let project: any;
    try {
      project = await sogniClient.projects.create(projectConfig);
    } catch (createError: any) {
      if (timeoutId) clearTimeout(timeoutId);

      // Check for insufficient funds
      const isInsufficientFunds = createError?.code === 4024 ||
        createError?.message?.toLowerCase().includes('insufficient');

      if (isInsufficientFunds) {
        setPhotos(prev => {
          const updated = [...prev];
          if (!updated[photoIndex]) return prev;
          updated[photoIndex] = {
            ...updated[photoIndex],
            generatingCameraAngle: false,
            cameraAngleError: 'Insufficient credits'
          };
          return updated;
        });
        onOutOfCredits?.();
        return;
      }

      throw createError;
    }

    // Update state with project ID
    setPhotos(prev => {
      const updated = [...prev];
      if (!updated[photoIndex]) return prev;
      updated[photoIndex] = {
        ...updated[photoIndex],
        cameraAngleProjectId: project.id
      };
      return updated;
    });

    // Store our project ID and job ID for filtering
    const ourProjectId = project.id;
    let ourJobId: string | null = null;

    // Listen for job events on the PROJECT (same pattern as PhotoEnhancer)
    project.on('job', (event: any) => {
      // Filter to only handle events for OUR project
      if (event.projectId && event.projectId !== ourProjectId) {
        return;
      }

      const { type, jobId, progress, workerName } = event;

      if (type === 'started' && jobId) {
        ourJobId = jobId;
        setPhotos(prev => {
          const updated = [...prev];
          if (!updated[photoIndex]?.generatingCameraAngle) return prev;
          updated[photoIndex] = {
            ...updated[photoIndex],
            cameraAngleStatus: 'Processing',
            cameraAngleWorkerName: workerName || undefined
          };
          return updated;
        });
      }

      if (type === 'progress' && progress !== undefined) {
        const progressPercent = Math.floor((typeof progress === 'number' ? progress : 0) * 100);
        setPhotos(prev => {
          const updated = [...prev];
          if (!updated[photoIndex]?.generatingCameraAngle) return prev;
          updated[photoIndex] = {
            ...updated[photoIndex],
            cameraAngleProgress: progressPercent,
            cameraAngleStatus: 'Processing'
          };
          return updated;
        });
      }

      if (type === 'eta' && event.eta !== undefined) {
        setPhotos(prev => {
          const updated = [...prev];
          if (!updated[photoIndex]?.generatingCameraAngle) return prev;
          updated[photoIndex] = {
            ...updated[photoIndex],
            cameraAngleETA: event.eta
          };
          return updated;
        });
      }

      if (type === 'queued' && event.queuePosition !== undefined) {
        const statusText = event.queuePosition === 1 ? 'Next in line' : `Queue #${event.queuePosition}`;
        setPhotos(prev => {
          const updated = [...prev];
          if (!updated[photoIndex]?.generatingCameraAngle) return prev;
          updated[photoIndex] = {
            ...updated[photoIndex],
            cameraAngleStatus: statusText
          };
          return updated;
        });
      }
    });

    // Listen for jobCompleted event on the PROJECT (same pattern as PhotoEnhancer)
    project.on('jobCompleted', (job: any) => {
      // Extract project ID from result URL to filter
      const urlProjectId = job.resultUrl?.match(/\/([A-F0-9-]{36})\/complete-/i)?.[1];

      if (urlProjectId && urlProjectId !== ourProjectId) {
        return;
      }

      // Also check job ID if we have it
      if (ourJobId && job.id !== ourJobId) {
        return;
      }

      if (job.resultUrl) {
        // Clear timeout
        if (timeoutId) clearTimeout(timeoutId);

        // Preload the image before updating state
        const preloadImage = new Image();
        preloadImage.onload = () => {
          setPhotos(prev => {
            const updated = [...prev];
            if (!updated[photoIndex]) return prev;

            // Don't update if no longer generating
            if (!updated[photoIndex].generatingCameraAngle) {
              return prev;
            }

            const existingImages = updated[photoIndex].images || [];

            // Replace the image at the current subIndex (like enhancement does)
            const updatedImages = [...existingImages];
            if (subIndex < updatedImages.length) {
              updatedImages[subIndex] = job.resultUrl;
            } else {
              updatedImages.push(job.resultUrl);
            }

            updated[photoIndex] = {
              ...updated[photoIndex],
              generatingCameraAngle: false,
              cameraAngleProgress: 100,
              cameraAngleStatus: undefined,
              cameraAngleETA: undefined,
              cameraAngleError: undefined,
              images: updatedImages
            };

            return updated;
          });

          onComplete?.(job.resultUrl);
        };

        preloadImage.onerror = () => {
          setPhotos(prev => {
            const updated = [...prev];
            if (!updated[photoIndex]) return prev;
            if (!updated[photoIndex].generatingCameraAngle) return prev;

            const existingImages = updated[photoIndex].images || [];
            // Replace the image at the current subIndex (like enhancement does)
            const updatedImages = [...existingImages];
            if (subIndex < updatedImages.length) {
              updatedImages[subIndex] = job.resultUrl;
            } else {
              updatedImages.push(job.resultUrl);
            }

            updated[photoIndex] = {
              ...updated[photoIndex],
              generatingCameraAngle: false,
              cameraAngleProgress: 100,
              cameraAngleStatus: undefined,
              cameraAngleETA: undefined,
              cameraAngleError: undefined,
              images: updatedImages
            };
            return updated;
          });

          onComplete?.(job.resultUrl);
        };

        preloadImage.src = job.resultUrl;
      }
    });

    // Listen for jobFailed event
    project.on('jobFailed', (error: any) => {
      if (timeoutId) clearTimeout(timeoutId);

      const errorMsg = error?.message || error?.error || 'Generation failed';

      // Check for insufficient funds
      const isInsufficientFunds = error?.code === 4024 ||
        errorMsg?.toLowerCase().includes('insufficient');

      setPhotos(prev => {
        const updated = [...prev];
        if (!updated[photoIndex]) return prev;
        updated[photoIndex] = {
          ...updated[photoIndex],
          generatingCameraAngle: false,
          cameraAngleError: isInsufficientFunds ? 'Insufficient credits' : errorMsg
        };
        return updated;
      });

      if (isInsufficientFunds) {
        onOutOfCredits?.();
      } else {
        onError?.(new Error(errorMsg));
      }
    });

    // Listen for error event
    project.on('error', (error: any) => {
      if (timeoutId) clearTimeout(timeoutId);

      const errorMsg = error?.message || 'Generation error';

      setPhotos(prev => {
        const updated = [...prev];
        if (!updated[photoIndex]) return prev;
        updated[photoIndex] = {
          ...updated[photoIndex],
          generatingCameraAngle: false,
          cameraAngleError: errorMsg
        };
        return updated;
      });

      onError?.(new Error(errorMsg));
    });

  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);

    setPhotos(prev => {
      const updated = [...prev];
      if (!updated[photoIndex]) return prev;
      updated[photoIndex] = {
        ...updated[photoIndex],
        generatingCameraAngle: false,
        cameraAngleError: error instanceof Error ? error.message : 'Generation failed'
      };
      return updated;
    });

    onError?.(error instanceof Error ? error : new Error('Camera angle generation failed'));
  }
}

/**
 * Cancel camera angle generation - simplified since we don't track active projects anymore
 */
export async function cancelCameraAngleGeneration(
  projectId: string,
  setPhotos: (updater: (prev: Photo[]) => Photo[]) => void
): Promise<boolean> {
  // Just clear the generating state - the project will timeout on its own
  setPhotos(prev => {
    const updated = prev.map(photo => {
      if (photo.cameraAngleProjectId === projectId) {
        return {
          ...photo,
          generatingCameraAngle: false,
          cameraAngleError: undefined,
          cameraAngleStatus: undefined
        };
      }
      return photo;
    });
    return updated;
  });
  return true;
}

export default {
  generateCameraAngle,
  cancelCameraAngleGeneration
};
