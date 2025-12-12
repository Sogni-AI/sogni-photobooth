/**
 * Video Generator Service
 * 
 * Follows SDK example: sogni-client/examples/video_image_to_video.mjs
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  VIDEO_QUALITY_PRESETS,
  VIDEO_RESOLUTIONS,
  formatVideoDuration,
  markVideoGenerated,
  VideoQualityPreset,
  VideoResolution
} from '../constants/videoSettings';
import { Photo } from '../types/index';
import { trackVideoGeneration } from './frontendAnalytics';

type SogniClient = {
  projects: {
    create: (params: Record<string, unknown>) => Promise<SogniProject>;
    on: (event: string, handler: (event: any) => void) => void;
    off?: (event: string, handler: (event: any) => void) => void;
  };
  // supportsVideo is true for FrontendSogniClientAdapter (direct SDK), false for BackendSogniClient
  supportsVideo?: boolean;
};

type SogniProject = {
  id: string;
  cancel?: () => Promise<void>;
};

interface GenerateVideoOptions {
  photo: Photo;
  photoIndex: number;
  subIndex: number;
  imageWidth: number;
  imageHeight: number;
  sogniClient: SogniClient;
  setPhotos: (updater: (prev: Photo[]) => Photo[]) => void;
  resolution?: VideoResolution;
  quality?: VideoQualityPreset;
  fps?: 16 | 32;
  positivePrompt?: string;
  negativePrompt?: string;
  onComplete?: (videoUrl: string) => void;
  onError?: (error: Error) => void;
  onCancel?: () => void;
}

interface ActiveVideoProject {
  projectId: string;
  photoIndex: number;
  project: SogniProject;
  progressInterval?: ReturnType<typeof setInterval>;
  timeoutId?: ReturnType<typeof setTimeout>;
  jobEventHandler?: (event: any) => void;
  sogniClient?: SogniClient;
  cleanup?: () => void;
  startTime?: number;
  lastETA?: number;
  isCompleted?: boolean; // Prevent duplicate completion/error handling
}

const activeVideoProjects = new Map<string, ActiveVideoProject>();

/**
 * Scale dimensions for video generation:
 * - Minimum dimension must be 512 (SDK requirement)
 * - Scale so shortest side = target resolution (512 or 720)
 * - Round down to nearest 16 (video encoding requirement)
 * 
 * For 512p: shortest side = 512, longest scales proportionally
 * For 720p: shortest side = 720, longest scales proportionally
 */
function scaleToResolution(
  width: number,
  height: number,
  resolution: VideoResolution
): { width: number; height: number } {
  const targetShortSide = VIDEO_RESOLUTIONS[resolution].maxDimension;
  
  const smallestDim = Math.min(width, height);
  
  // Scale so the shortest dimension equals the target
  const scale = targetShortSide / smallestDim;
  
  // Scale and round down to nearest 16
  let scaledWidth = Math.floor((width * scale) / 16) * 16;
  let scaledHeight = Math.floor((height * scale) / 16) * 16;
  
  // Ensure minimum 512 after rounding (SDK requirement)
  scaledWidth = Math.max(scaledWidth, 512);
  scaledHeight = Math.max(scaledHeight, 512);
  
  return { width: scaledWidth, height: scaledHeight };
}

/**
 * Generates a video from an image
 */
export async function generateVideo(options: GenerateVideoOptions): Promise<void> {
  const {
    photo,
    photoIndex,
    subIndex,
    imageWidth,
    imageHeight,
    sogniClient,
    setPhotos,
    resolution = '480p',
    quality = 'fast',
    fps = 16,
    positivePrompt = '',
    negativePrompt = '',
    onComplete,
    onError
  } = options;

  if (typeof photoIndex !== 'number' || photoIndex < 0 || !photo) {
    onError?.(new Error('Invalid photo or index'));
    return;
  }

  if (photo.generatingVideo) {
    return;
  }

  // Log client type for debugging video generation issues
  const clientType = sogniClient?.supportsVideo === true ? 'FrontendSogniClientAdapter' : 
                     sogniClient?.supportsVideo === false ? 'BackendSogniClient' : 'Unknown';
  console.log(`[VIDEO] Starting video generation with client type: ${clientType}`);
  console.log(`[VIDEO] Client details:`, {
    supportsVideo: sogniClient?.supportsVideo,
    hasProjects: !!sogniClient?.projects,
    hasCreate: !!sogniClient?.projects?.create,
    hasOn: !!sogniClient?.projects?.on,
    hasOff: !!sogniClient?.projects?.off
  });

  // Validate and scale dimensions
  let WIDTH = imageWidth;
  let HEIGHT = imageHeight;
  
  if (!WIDTH || !HEIGHT || WIDTH <= 0 || HEIGHT <= 0) {
    WIDTH = 512;
    HEIGHT = 512;
  }

  // Scale to resolution
  const scaled = scaleToResolution(WIDTH, HEIGHT, resolution);

  try {
    const imageUrl = photo.enhancedImageUrl || photo.images?.[subIndex] || photo.originalDataUrl;
    if (!imageUrl) {
      throw new Error('No image URL found');
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const imageBlob = await response.blob();
    const arrayBuffer = await imageBlob.arrayBuffer();
    const imageBuffer = new Uint8Array(arrayBuffer);

    const qualityConfig = VIDEO_QUALITY_PRESETS[quality];
    if (!qualityConfig) {
      throw new Error(`Invalid quality preset: ${quality}`);
    }

    // Set initial state
    setPhotos(prev => {
      const updated = [...prev];
      if (!updated[photoIndex]) return prev;
      updated[photoIndex] = {
        ...updated[photoIndex],
        generatingVideo: true,
        videoETA: undefined,
        videoElapsed: 0,
        videoStartTime: Date.now(),
        videoProjectId: undefined,
        videoError: undefined,
        videoWorkerName: undefined,
        videoStatus: 'Queued'
      };
      return updated;
    });

    // Create project - pass SCALED dimensions with sizePreset: 'custom' like image generation
    const createParams = {
      type: 'video',
      modelId: qualityConfig.model,
      positivePrompt: positivePrompt || '',
      negativePrompt: negativePrompt || '',
      stylePrompt: '',
      numberOfMedia: 1,
      steps: qualityConfig.steps,
      seed: Math.floor(Math.random() * 2147483647),
      sizePreset: 'custom',
      width: scaled.width,
      height: scaled.height,
      referenceImage: imageBuffer,
      // Calculate frames for 5-second video based on fps
      // 16 fps = 81 frames, 32 fps = 161 frames
      frames: fps === 32 ? 161 : 81,
      fps: fps,
      tokenType: 'spark'
    };
    
    const project = await sogniClient.projects.create(createParams);

    // Update state with project ID
    setPhotos(prev => {
      const updated = [...prev];
      if (!updated[photoIndex]) return prev;
      updated[photoIndex] = {
        ...updated[photoIndex],
        videoProjectId: project.id
      };
      return updated;
    });

    // Track project
    const activeProject: ActiveVideoProject = {
      projectId: project.id,
      photoIndex,
      project,
      sogniClient,
      startTime: undefined,
      lastETA: undefined
    };
    activeVideoProjects.set(project.id, activeProject);

    // Cleanup function - safely handle missing off method
    const cleanup = () => {
      if (activeProject.progressInterval) {
        clearInterval(activeProject.progressInterval);
        activeProject.progressInterval = undefined;
      }
      if (activeProject.timeoutId) {
        clearTimeout(activeProject.timeoutId);
        activeProject.timeoutId = undefined;
      }
      // Safely remove event handler if off method exists
      if (activeProject.jobEventHandler && activeProject.sogniClient?.projects?.off) {
        try {
          activeProject.sogniClient.projects.off('job', activeProject.jobEventHandler);
        } catch {
          // Ignore cleanup errors
        }
      }
      activeVideoProjects.delete(project.id);
    };
    activeProject.cleanup = cleanup;

    // Timeout (10 min)
    activeProject.timeoutId = setTimeout(() => {
      cleanup();
      setPhotos(prev => {
        const updated = [...prev];
        if (!updated[photoIndex]) return prev;
        updated[photoIndex] = {
          ...updated[photoIndex],
          generatingVideo: false,
          videoError: 'Video generation timed out'
        };
        return updated;
      });
      onError?.(new Error('Video generation timed out'));
    }, 10 * 60 * 1000);

    // Job event handler
    const jobEventHandler = (event: any) => {
      if (event.projectId !== project.id) return;

      switch (event.type) {
        case 'initiating':
          // Worker assigned but not yet started - capture worker name early
          if (event.workerName) {
            setPhotos(prev => {
              const updated = [...prev];
              if (!updated[photoIndex]) return prev;
              updated[photoIndex] = {
                ...updated[photoIndex],
                videoWorkerName: event.workerName,
                videoStatus: 'Initiating'
              };
              return updated;
            });
          }
          break;

        case 'queued':
          // Job is queued - show queue position if greater than 1
          if (event.queuePosition !== undefined && event.queuePosition > 1) {
            setPhotos(prev => {
              const updated = [...prev];
              if (!updated[photoIndex]) return prev;
              updated[photoIndex] = {
                ...updated[photoIndex],
                videoStatus: `Queue #${event.queuePosition}`
              };
              return updated;
            });
          }
          break;
          
        case 'started':
          if (!activeProject.startTime) {
            activeProject.startTime = Date.now();
            
            // Capture worker name from started event
            const workerName = event.workerName;
            
            setPhotos(prev => {
              const updated = [...prev];
              if (!updated[photoIndex]) return prev;
              updated[photoIndex] = {
                ...updated[photoIndex],
                videoWorkerName: workerName || undefined,
                videoStatus: 'Processing'
              };
              return updated;
            });
            
            // Progress interval - update elapsed every second
            activeProject.progressInterval = setInterval(() => {
              if (activeProject.startTime) {
                const elapsed = Math.floor((Date.now() - activeProject.startTime) / 1000);
                
                setPhotos(prev => {
                  const updated = [...prev];
                  if (!updated[photoIndex]?.generatingVideo) return prev;
                  
                  updated[photoIndex] = {
                    ...updated[photoIndex],
                    videoElapsed: elapsed,
                    videoETA: activeProject.lastETA
                  };
                  return updated;
                });
              }
            }, 1000);
          }
          break;

        case 'jobETA':
          activeProject.lastETA = event.etaSeconds;
          setPhotos(prev => {
            const updated = [...prev];
            if (!updated[photoIndex]) return prev;
            updated[photoIndex] = {
              ...updated[photoIndex],
              videoETA: event.etaSeconds
            };
            return updated;
          });
          break;

        case 'completed':
          const resultUrl = event.resultUrl || event.result;
          if (resultUrl) {
            handleComplete(resultUrl);
          }
          break;

        case 'error':
        case 'failed':
          // Ensure we get a proper error string, not [object Object]
          let errorMsg = 'Video generation failed';
          if (event.error) {
            if (typeof event.error === 'string') {
              errorMsg = event.error;
            } else if (event.error.message) {
              errorMsg = event.error.message;
            } else {
              try {
                errorMsg = JSON.stringify(event.error);
              } catch {
                errorMsg = 'Video generation failed (unknown error)';
              }
            }
          } else if (event.message) {
            errorMsg = typeof event.message === 'string' ? event.message : 'Video generation failed';
          }
          handleError(errorMsg);
          break;
      }
    };

    const handleComplete = (videoUrl: string) => {
      // Prevent duplicate handling
      if (activeProject.isCompleted) return;
      activeProject.isCompleted = true;
      
      cleanup();
      markVideoGenerated();

      // Track successful video generation analytics
      trackVideoGeneration({
        resolution,
        quality,
        modelId: qualityConfig.model,
        width: scaled.width,
        height: scaled.height,
        success: true
      }).catch(() => {}); // Ignore analytics errors

      setPhotos(prev => {
        const updated = [...prev];
        if (!updated[photoIndex]) return prev;
        updated[photoIndex] = {
          ...updated[photoIndex],
          generatingVideo: false,
          videoUrl,
          videoETA: 0,
          videoError: undefined
        };
        return updated;
      });

      onComplete?.(videoUrl);
    };

    const handleError = (errorMsg: string) => {
      // Prevent duplicate handling
      if (activeProject.isCompleted) return;
      activeProject.isCompleted = true;
      
      cleanup();
      console.error(`[VIDEO] Error: ${errorMsg}`);

      // Track failed video generation analytics
      trackVideoGeneration({
        resolution,
        quality,
        modelId: qualityConfig.model,
        width: scaled.width,
        height: scaled.height,
        success: false,
        errorMessage: errorMsg
      }).catch(() => {}); // Ignore analytics errors

      setPhotos(prev => {
        const updated = [...prev];
        if (!updated[photoIndex]) return prev;
        updated[photoIndex] = {
          ...updated[photoIndex],
          generatingVideo: false,
          videoETA: undefined,
          videoError: errorMsg
        };
        return updated;
      });

      onError?.(new Error(errorMsg));
    };

    activeProject.jobEventHandler = jobEventHandler;

    // Register on sogni.projects (like SDK does)
    sogniClient.projects.on('job', jobEventHandler);

  } catch (error) {
    console.error(`[VIDEO] Failed:`, error);

    setPhotos(prev => {
      const updated = [...prev];
      if (!updated[photoIndex]) return prev;
      updated[photoIndex] = {
        ...updated[photoIndex],
        generatingVideo: false,
        videoETA: undefined,
        videoError: error instanceof Error ? error.message : 'Video generation failed'
      };
      return updated;
    });

    onError?.(error instanceof Error ? error : new Error('Video generation failed'));
  }
}

/**
 * Cancel video generation
 */
export async function cancelVideoGeneration(
  projectId: string,
  _sogniClient: SogniClient,
  setPhotos: (updater: (prev: Photo[]) => Photo[]) => void,
  onCancel?: () => void
): Promise<void> {
  const activeProject = activeVideoProjects.get(projectId);
  if (!activeProject) return;

  try {
    if (activeProject.cleanup) {
      activeProject.cleanup();
    }
    if (activeProject.project?.cancel) {
      await activeProject.project.cancel();
    }

    setPhotos(prev => {
      const updated = [...prev];
      const idx = activeProject.photoIndex;
      if (!updated[idx]) return prev;
      updated[idx] = {
        ...updated[idx],
        generatingVideo: false,
        videoETA: undefined,
        videoProjectId: undefined,
        videoError: undefined
      };
      return updated;
    });

    onCancel?.();
  } catch {
    activeVideoProjects.delete(projectId);
  }
}

export function isGeneratingVideo(photo: Photo): boolean {
  return photo.generatingVideo === true;
}

export function getActiveVideoProjectId(photo: Photo): string | undefined {
  return photo.videoProjectId;
}

/**
 * Check if we're on a mobile device
 */
function isMobile(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export async function downloadVideo(videoUrl: string, filename?: string): Promise<void> {
  const finalFilename = filename || `sogni-video-${Date.now()}.mp4`;

  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);

  const blob = await response.blob();

  // On mobile, try to use the native Share API for better UX (allows saving to camera roll)
  if (isMobile() && navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], finalFilename, { type: 'video/mp4' });

      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Save Video',
          text: 'Your AI-generated video from Sogni Photobooth'
        });
        return; // Success - user can save via share sheet
      }
    } catch (shareError: unknown) {
      // If user cancelled, don't fall back to download
      if (shareError instanceof Error &&
          (shareError.name === 'AbortError' ||
           shareError.message.includes('abort') ||
           shareError.message.includes('cancel') ||
           shareError.message.includes('dismissed'))) {
        return; // User cancelled - that's fine
      }
      // For other errors, fall through to standard download
      console.log('Share API not available, using standard download');
    }
  }

  // Standard download for desktop or if share failed
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = finalFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

export { formatVideoDuration };

export default {
  generateVideo,
  cancelVideoGeneration,
  isGeneratingVideo,
  getActiveVideoProjectId,
  downloadVideo,
  formatVideoDuration
};
