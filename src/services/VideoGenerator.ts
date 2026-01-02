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
  calculateVideoFrames,
  VideoQualityPreset,
  VideoResolution
} from '../constants/videoSettings';
import { Photo } from '../types/index';
import { trackVideoGeneration } from './frontendAnalytics';
import { fetchWithRetry } from '../utils/index';

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
  on?: (event: string, listener: (...args: any[]) => void) => void;
  off?: (event: string, listener: (...args: any[]) => void) => void;
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
  duration?: 3 | 5 | 7;
  positivePrompt?: string;
  negativePrompt?: string;
  motionEmoji?: string;
  tokenType?: 'spark' | 'sogni';
  referenceImage?: Uint8Array;
  referenceImageEnd?: Uint8Array;
  onComplete?: (videoUrl: string) => void;
  onError?: (error: Error) => void;
  onCancel?: () => void;
  onOutOfCredits?: () => void;
}

interface ActiveVideoProject {
  projectId: string;
  photoIndex: number;
  project: SogniProject;
  progressInterval?: ReturnType<typeof setInterval>;
  timeoutId?: ReturnType<typeof setTimeout>;
  activityCheckInterval?: ReturnType<typeof setInterval>;
  jobEventHandler?: (event: any) => void;
  sogniClient?: SogniClient;
  cleanup?: () => void;
  startTime?: number;
  lastETA?: number;
  lastActivityTime?: number; // Track last time we received a jobETA update
  isCompleted?: boolean; // Prevent duplicate completion/error handling
}

const activeVideoProjects = new Map<string, ActiveVideoProject>();

/**
 * Scale dimensions for video generation:
 * - Scale so shortest side = target resolution (480, 576, or 720)
 * - Round to nearest 16 (video encoding requirement)
 * - Ensure shortest dimension is at least the target after rounding
 * 
 * For 480p: shortest side = 480, longest scales proportionally
 * For 580p: shortest side = 576 (rounded to 16), longest scales proportionally
 * For 720p: shortest side = 720, longest scales proportionally
 */
function scaleToResolution(
  width: number,
  height: number,
  resolution: VideoResolution
): { width: number; height: number } {
  const targetShortSide = VIDEO_RESOLUTIONS[resolution].maxDimension;
  
  // Round target to nearest 16 to ensure valid dimensions
  const roundedTarget = Math.round(targetShortSide / 16) * 16;
  
  // Determine which dimension is shortest
  const isWidthShorter = width <= height;
  
  if (isWidthShorter) {
    // Width is shorter - set it to target, scale height proportionally
    const scaledWidth = roundedTarget;
    const scaledHeight = Math.round((height * roundedTarget / width) / 16) * 16;
    return { width: scaledWidth, height: scaledHeight };
  } else {
    // Height is shorter - set it to target, scale width proportionally
    const scaledHeight = roundedTarget;
    const scaledWidth = Math.round((width * roundedTarget / height) / 16) * 16;
    return { width: scaledWidth, height: scaledHeight };
  }
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
    duration = 5,
    positivePrompt = '',
    negativePrompt = '',
    motionEmoji,
    tokenType = 'spark',
    referenceImage: customReferenceImage,
    referenceImageEnd,
    onComplete,
    onError,
    onOutOfCredits
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
  
  // CRITICAL DEBUG: Log EVERYTHING about the client to diagnose the issue
  console.group('🎬 VIDEO GENERATION STARTING');
  console.log(`❗ CLIENT TYPE: ${clientType}`);
  console.log(`❗ supportsVideo flag: ${sogniClient?.supportsVideo}`);
  console.log(`❗ Client is null: ${sogniClient === null}`);
  console.log(`❗ Client is undefined: ${sogniClient === undefined}`);
  console.log(`❗ Client constructor name: ${sogniClient?.constructor?.name}`);
  console.log(`❗ Client details:`, {
    supportsVideo: sogniClient?.supportsVideo,
    hasProjects: !!sogniClient?.projects,
    hasCreate: !!sogniClient?.projects?.create,
    hasOn: !!sogniClient?.projects?.on,
    hasOff: !!sogniClient?.projects?.off,
    hasAccount: !!(sogniClient as any)?.account,
    hasApiClient: !!(sogniClient as any)?.apiClient
  });
  console.groupEnd();
  
  // CRITICAL: If backend client is being used for video, throw a clear error
  if (sogniClient?.supportsVideo === false) {
    const error = new Error('CRITICAL BUG: Backend client cannot generate videos. Only frontend SDK supports video generation. Check client initialization in App.jsx');
    console.error('❌❌❌ VIDEO GENERATION BLOCKED:', error.message);
    onError?.(error);
    return;
  }

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
    // Use custom reference image if provided, otherwise fetch from photo
    let imageBuffer: Uint8Array;
    
    if (customReferenceImage) {
      imageBuffer = customReferenceImage;
    } else {
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
      imageBuffer = new Uint8Array(arrayBuffer);
    }

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
        videoStatus: 'Generating'
      };
      return updated;
    });

    // Create project - pass SCALED dimensions with sizePreset: 'custom' like image generation
    const seed = Math.floor(Math.random() * 2147483647);
    
    // Calculate frames based on duration (fps only affects playback, not frame count)
    const frames = calculateVideoFrames(duration);
    
    console.log('🎬 VIDEO SETTINGS RECEIVED:');
    console.log(`   Duration setting: ${duration}s`);
    console.log(`   FPS setting: ${fps}`);
    console.log(`   Calculated frames: ${frames} (BASE_FPS 16 * ${duration}s + 1)`);
    console.log(`   Resolution: ${resolution}`);
    console.log(`   Quality: ${quality}`);
    
    const createParams = {
      type: 'video',
      modelId: qualityConfig.model,
      positivePrompt: positivePrompt || '',
      negativePrompt: negativePrompt || '',
      stylePrompt: '',
      numberOfMedia: 1,
      steps: qualityConfig.steps,
      seed: seed,
      sizePreset: 'custom',
      width: scaled.width,
      height: scaled.height,
      referenceImage: imageBuffer,
      ...(referenceImageEnd && { referenceImageEnd }),
      // Frame count calculated from duration and fps
      frames: frames,
      fps: fps,
      tokenType: tokenType
    };

    // Log video job submission for debugging
    console.group('🎬 VIDEO JOB SUBMITTED');
    console.log('📐 DIMENSIONS BEING SENT TO SDK:');
    console.log(`   WIDTH: ${scaled.width}px`);
    console.log(`   HEIGHT: ${scaled.height}px`);
    console.log('');
    console.log('📋 Job Settings:');
    console.log(`   Resolution Setting: ${resolution} (${VIDEO_RESOLUTIONS[resolution].label})`);
    console.log(`   Quality: ${quality} (${qualityConfig.label})`);
    console.log(`   Model: ${qualityConfig.model}`);
    console.log(`   Steps: ${qualityConfig.steps}`);
    console.log(`   Original Image Dimensions: ${WIDTH}x${HEIGHT}px`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Frames: ${frames}`);
    console.log(`   FPS: ${fps}`);
    console.log(`   Seed: ${seed}`);
    console.log('');
    console.log('📝 Prompts:');
    console.log(`   Positive: ${positivePrompt || '(none)'}`);
    console.log(`   Negative: ${negativePrompt || '(none)'}`);
    if (referenceImageEnd) {
      console.log('');
      console.log('🔀 Transition Mode:');
      console.log(`   Using referenceImageEnd (size: ${referenceImageEnd.length} bytes)`);
    }
    console.groupEnd();
    
    // Create project with proper error handling
    let project;
    try {
      project = await sogniClient.projects.create(createParams);
    } catch (createError) {
      console.error(`[VIDEO] Project creation failed:`, createError);
      
      // Check for insufficient funds error
      const isInsufficientFunds = createError && typeof createError === 'object' && (
        (createError as any).code === 4024 ||
        ((createError as any).message && (
          (createError as any).message.toLowerCase().includes('insufficient funds') ||
          ((createError as any).message.toLowerCase().includes('insufficient') && (createError as any).message.toLowerCase().includes('credits'))
        ))
      );
      
      if (isInsufficientFunds) {
        console.error('[VIDEO] ❌ Insufficient funds - triggering out of credits popup');
        
        // Update photo state with out of credits error
        setPhotos(prev => {
          const updated = [...prev];
          if (!updated[photoIndex]) return prev;
          
          updated[photoIndex] = {
            ...updated[photoIndex],
            generatingVideo: false,
            videoETA: undefined,
            videoError: 'Insufficient credits. Please replenish your account.'
          };
          return updated;
        });
        
        // Trigger out of credits popup
        if (onOutOfCredits) {
          onOutOfCredits();
        }
        return;
      }
      
      // Extract error message from various error formats
      let errorMessage = 'Failed to create video project';
      if (createError instanceof Error) {
        errorMessage = createError.message;
      } else if (typeof createError === 'object' && createError !== null) {
        if ('message' in createError && typeof createError.message === 'string') {
          errorMessage = createError.message;
        } else if ('error' in createError && typeof createError.error === 'string') {
          errorMessage = createError.error;
        } else if ('payload' in createError && createError.payload) {
          const payload = createError.payload as any;
          if (payload.message) {
            errorMessage = payload.message;
          } else if (payload.error) {
            errorMessage = payload.error;
          }
        }
      }
      
      // Log the full error for debugging
      console.error(`[VIDEO] Full error details:`, {
        error: createError,
        message: errorMessage,
        type: typeof createError,
        keys: createError && typeof createError === 'object' ? Object.keys(createError) : []
      });
      
      // Update UI to show error
      setPhotos(prev => {
        const updated = [...prev];
        if (!updated[photoIndex]) return prev;
        updated[photoIndex] = {
          ...updated[photoIndex],
          generatingVideo: false,
          videoETA: undefined,
          videoError: errorMessage
        };
        return updated;
      });
      
      onError?.(createError instanceof Error ? createError : new Error(errorMessage));
      return; // Exit early - don't continue with the rest of the function
    }

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
      if (activeProject.activityCheckInterval) {
        clearInterval(activeProject.activityCheckInterval);
        activeProject.activityCheckInterval = undefined;
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

    // Centralized error handler to avoid duplicate error messages
    const handleProjectError = (error: any, source: string) => {
      // Prevent duplicate handling
      if (activeProject.isCompleted) return;
      activeProject.isCompleted = true;
      
      // Check for insufficient funds error
      const isInsufficientFunds = error && typeof error === 'object' && (
        error.code === 4024 ||
        (error.message && (
          error.message.toLowerCase().includes('insufficient funds') ||
          (error.message.toLowerCase().includes('insufficient') && error.message.toLowerCase().includes('credits'))
        ))
      );
      
      if (isInsufficientFunds) {
        console.error('[VIDEO] ❌ Insufficient funds - triggering out of credits popup');
        
        cleanup();
        
        // Update photo state with out of credits error
        setPhotos(prev => {
          const updated = [...prev];
          if (!updated[photoIndex]) return prev;
          
          updated[photoIndex] = {
            ...updated[photoIndex],
            generatingVideo: false,
            videoETA: undefined,
            videoError: 'Insufficient credits. Please replenish your account.'
          };
          return updated;
        });
        
        // Trigger out of credits popup
        if (onOutOfCredits) {
          onOutOfCredits();
        }
        return;
      }
      
      // Log detailed timing information for timeout debugging
      if (source === 'timeout' || source === 'inactivity timeout') {
        const now = Date.now();
        const totalElapsed = Math.floor((now - (photo.videoStartTime || now)) / 1000);
        const timeSinceLastETA = activeProject.lastActivityTime 
          ? Math.floor((now - activeProject.lastActivityTime) / 1000)
          : 0;
        const lastETAValue = activeProject.lastETA || 'unknown';
        
        console.group(`[VIDEO] ⏱️  TIMEOUT DIAGNOSTICS - Project ${project.id}`);
        console.log(`Timeout Source: ${source}`);
        console.log(`Quality Setting: ${quality}`);
        console.log(`Total Elapsed Time: ${totalElapsed}s (${Math.floor(totalElapsed / 60)}m ${totalElapsed % 60}s)`);
        console.log(`Last jobETA Event: ${timeSinceLastETA}s ago`);
        console.log(`Last ETA Value: ${lastETAValue}s`);
        console.log(`Timestamp: ${new Date().toISOString()}`);
        console.groupEnd();
      }
      
      // Extract error message
      let errorMessage = 'Video generation failed';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        if (error.message) {
          errorMessage = error.message;
        } else if (error.error) {
          errorMessage = error.error;
        } else if (error.payload?.message) {
          errorMessage = error.payload.message;
        }
      }
      
      console.error(`[VIDEO] Project ${project.id} ${source}: ${errorMessage}`);
      
      cleanup();
      
      setPhotos(prev => {
        const updated = [...prev];
        if (!updated[photoIndex]) return prev;
        updated[photoIndex] = {
          ...updated[photoIndex],
          generatingVideo: false,
          videoETA: undefined,
          videoError: errorMessage
        };
        return updated;
      });
      
      onError?.(new Error(errorMessage));
    };

    // Listen for project-level 'failed' event (if project supports event emitter)
    project.on?.('failed', (error: any) => {
      handleProjectError(error, 'failed');
    });

    // Listen for project-level 'error' event (if project supports event emitter)
    project.on?.('error', (error: any) => {
      handleProjectError(error, 'error');
    });

    // Activity-aware timeout system:
    // - Use quality-based timeout as the initial baseline
    // - If job is still sending jobETA updates, extend timeout
    // - Only timeout if 120 seconds pass without any jobETA update
    const timeoutMinutes: Record<VideoQualityPreset, number> = {
      fast: 3,      // ~12-20s generation + large buffer
      balanced: 5,  // ~25-40s generation + large buffer
      quality: 8,   // ~3-4 min at 480p, up to ~6 min at 720p + buffer
      pro: 15       // ~6-9 min at 480p, up to ~14 min at 720p + buffer
    };
    const baseTimeoutMs = timeoutMinutes[quality] * 60 * 1000;
    const inactivityTimeoutMs = 120 * 1000; // 120 seconds of no activity

    // Initialize last activity time
    activeProject.lastActivityTime = Date.now();

    // Base timeout - triggers if job exceeds the quality-based timeout
    activeProject.timeoutId = setTimeout(() => {
      if (activeProject.isCompleted) return;
      
      // Check if we've received recent activity
      const timeSinceLastActivity = Date.now() - (activeProject.lastActivityTime || 0);
      if (timeSinceLastActivity < inactivityTimeoutMs) return;
      
      handleProjectError(new Error('Video generation timed out'), 'timeout');
    }, baseTimeoutMs);

    // Activity check interval - runs every 30 seconds to check for inactivity
    activeProject.activityCheckInterval = setInterval(() => {
      if (activeProject.isCompleted) return;
      
      const timeSinceLastActivity = Date.now() - (activeProject.lastActivityTime || Date.now());
      
      // If no activity for 120 seconds and we're past the base timeout, trigger timeout
      if (timeSinceLastActivity > inactivityTimeoutMs && Date.now() - (activeProject.startTime || Date.now()) > baseTimeoutMs) {
        handleProjectError(new Error('Video generation timed out - no activity'), 'inactivity timeout');
      }
    }, 30000); // Check every 30 seconds

    // Job event handler
    const jobEventHandler = (event: any) => {
      if (event.projectId !== project.id) return;

      switch (event.type) {
        case 'initiating':
          // Worker assigned, model being initialized - show clear status to user
          setPhotos(prev => {
            const updated = [...prev];
            if (!updated[photoIndex]) return prev;
            updated[photoIndex] = {
              ...updated[photoIndex],
              videoWorkerName: event.workerName || updated[photoIndex].videoWorkerName,
              videoStatus: 'Initializing Model'
            };
            return updated;
          });
          // Update activity time to prevent timeout during model initialization
          activeProject.lastActivityTime = Date.now();
          break;

        case 'queued':
          // Job is queued - always show queue position to keep users informed
          if (event.queuePosition !== undefined) {
            setPhotos(prev => {
              const updated = [...prev];
              if (!updated[photoIndex]) return prev;
              // Show position for all queue positions (1 = next in line, 2+ = position in queue)
              const statusText = event.queuePosition === 1
                ? 'Next in line'
                : `Queue #${event.queuePosition}`;
              updated[photoIndex] = {
                ...updated[photoIndex],
                videoStatus: statusText
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

        case 'progress':
          // Handle step/stepCount progress events (if video model sends them)
          if (event.step !== undefined && event.stepCount !== undefined) {
            const progressPercent = Math.round((event.step / event.stepCount) * 100);

            // Update last activity time
            activeProject.lastActivityTime = Date.now();

            setPhotos(prev => {
              const updated = [...prev];
              if (!updated[photoIndex]?.generatingVideo) return prev;
              updated[photoIndex] = {
                ...updated[photoIndex],
                videoProgress: progressPercent,
                videoStatus: 'Processing',
                videoWorkerName: event.workerName || updated[photoIndex].videoWorkerName
              };
              return updated;
            });
          }
          break;

        case 'jobETA':
          // Update last activity time to prevent inactivity timeout
          activeProject.lastActivityTime = Date.now();
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
          handleError(errorMsg, event.error);
          break;
      }
    };

    const handleComplete = (videoUrl: string) => {
      // Prevent duplicate handling
      if (activeProject.isCompleted) return;
      activeProject.isCompleted = true;

      // Calculate total generation time
      const endTime = Date.now();
      const startTime = photo.videoStartTime || activeProject.startTime || endTime;
      const totalDurationMs = endTime - startTime;
      const totalDurationSec = (totalDurationMs / 1000).toFixed(2);

      // Log comprehensive performance analytics
      console.group('🎬 VIDEO GENERATION COMPLETE');
      console.log('⏱️  Performance Metrics:');
      console.log(`   Total Duration: ${totalDurationSec}s (${totalDurationMs}ms)`);
      console.log(`   Start Time: ${new Date(startTime).toISOString()}`);
      console.log(`   End Time: ${new Date(endTime).toISOString()}`);
      console.log('');
      console.log('⚙️  Generation Settings:');
      console.log(`   Resolution: ${resolution} (${VIDEO_RESOLUTIONS[resolution].label})`);
      console.log(`   Quality Preset: ${quality} (${VIDEO_QUALITY_PRESETS[quality].label})`);
      console.log(`   Model: ${qualityConfig.model}`);
      console.log(`   Steps: ${qualityConfig.steps}`);
      console.log(`   Dimensions: ${scaled.width}x${scaled.height}px`);
      console.log(`   Frames: 81 (5 seconds)`);
      console.log(`   FPS: ${fps}`);
      console.log('');
      console.log('📊 Additional Info:');
      console.log(`   Project ID: ${project.id}`);
      console.log(`   Photo Index: ${photoIndex}`);
      console.log(`   Video URL: ${videoUrl}`);
      console.log(`   Positive Prompt: ${positivePrompt || '(none)'}`);
      console.log(`   Negative Prompt: ${negativePrompt || '(none)'}`);
      console.groupEnd();

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
          videoError: undefined,
          // Store video generation metadata for download filename and gallery submissions
          videoResolution: resolution,
          videoFramerate: fps,
          videoDuration: duration,
          videoMotionPrompt: positivePrompt || '', // Store the motion prompt used
          videoMotionEmoji: motionEmoji || '' // Store the emoji used for video generation
        };
        return updated;
      });

      onComplete?.(videoUrl);
    };

    const handleError = (errorMsg: string, errorObject?: any) => {
      // Prevent duplicate handling
      if (activeProject.isCompleted) return;
      activeProject.isCompleted = true;
      
      // Check for insufficient funds error
      const isInsufficientFunds = errorObject && typeof errorObject === 'object' && (
        errorObject.code === 4024 ||
        (errorObject.message && (
          errorObject.message.toLowerCase().includes('insufficient funds') ||
          (errorObject.message.toLowerCase().includes('insufficient') && errorObject.message.toLowerCase().includes('credits'))
        ))
      ) || (
        errorMsg && (
          errorMsg.toLowerCase().includes('insufficient funds') ||
          (errorMsg.toLowerCase().includes('insufficient') && errorMsg.toLowerCase().includes('credits'))
        )
      );
      
      if (isInsufficientFunds) {
        console.error('[VIDEO] ❌ Insufficient funds - triggering out of credits popup');
        
        cleanup();
        
        // Update photo state with out of credits error
        setPhotos(prev => {
          const updated = [...prev];
          if (!updated[photoIndex]) return prev;
          
          updated[photoIndex] = {
            ...updated[photoIndex],
            generatingVideo: false,
            videoETA: undefined,
            videoError: 'Insufficient credits. Please replenish your account.'
          };
          return updated;
        });
        
        // Trigger out of credits popup
        if (onOutOfCredits) {
          onOutOfCredits();
        }
        return;
      }
      
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

  const response = await fetchWithRetry(videoUrl, undefined, {
    context: 'Video Download',
    maxRetries: 2,
    initialDelay: 1000
  });
  if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);

  const blob = await response.blob();

  // On mobile, try to use the native Share API for better UX (allows saving to camera roll)
  if (isMobile() && navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], finalFilename, { type: 'video/mp4' });

      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'My Sogni Photobooth Creation',
          text: 'Check out my video from Sogni AI Photobooth!'
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
