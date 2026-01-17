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
  VideoResolution,
  S2V_QUALITY_PRESETS,
  ANIMATE_MOVE_QUALITY_PRESETS,
  ANIMATE_REPLACE_QUALITY_PRESETS,
  S2V_MODELS,
  ANIMATE_MOVE_MODELS,
  ANIMATE_REPLACE_MODELS
} from '../constants/videoSettings';
import {
  getCancellationState,
  recordCancelAttempt,
  notifyCancelStateChange,
  estimateRefund
} from './cancellationService';

// Workflow types for different video generation modes
export type VideoWorkflowType = 'i2v' | 's2v' | 'animate-move' | 'animate-replace' | 'batch-transition';
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
  duration?: number; // Duration in seconds (1-8 in 0.5 increments)
  frames?: number; // Explicit frame count - takes precedence over duration
  positivePrompt?: string;
  negativePrompt?: string;
  motionEmoji?: string;
  tokenType?: 'spark' | 'sogni';
  referenceImage?: Uint8Array;
  referenceImageEnd?: Uint8Array;
  // New workflow parameters
  workflowType?: VideoWorkflowType;
  referenceVideo?: Uint8Array; // For animate-move and animate-replace
  referenceAudio?: Uint8Array; // For S2V
  audioStart?: number; // For S2V - start offset in seconds
  audioDuration?: number; // For S2V - duration to use from audio
  videoStart?: number; // For animate-move and animate-replace - start offset in seconds
  sam2Coordinates?: string; // For animate-replace - JSON string of [{x, y}]
  modelVariant?: 'speed' | 'quality'; // Model variant for new workflows (lightx2v vs full)
  onComplete?: (videoUrl: string) => void;
  onError?: (error: Error) => void;
  onCancel?: () => void;
  onOutOfCredits?: () => void;

  // Regeneration metadata - URLs to reference files for later regeneration
  referenceAudioUrl?: string; // URL to audio file (for S2V regeneration)
  referenceVideoUrl?: string; // URL to video file (for animate-move/replace regeneration)
  isMontageSegment?: boolean; // Whether this is part of a montage batch
  segmentIndex?: number; // Index within the montage batch (0-based)
  nextPhotoId?: string; // For batch-transition - ID of the next photo in sequence (for end frame)
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
    frames: explicitFrames, // Explicit frame count (takes precedence over duration)
    positivePrompt = '',
    negativePrompt = '',
    motionEmoji,
    tokenType = 'spark',
    referenceImage: customReferenceImage,
    referenceImageEnd,
    // New workflow parameters
    workflowType = 'i2v',
    referenceVideo,
    referenceAudio,
    audioStart,
    audioDuration,
    videoStart,
    sam2Coordinates,
    modelVariant, // Model variant for new workflows (speed/quality)
    onComplete,
    onError,
    onOutOfCredits,
    // Regeneration metadata
    referenceAudioUrl,
    referenceVideoUrl,
    isMontageSegment,
    segmentIndex,
    nextPhotoId
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

    // Select quality config based on workflow type
    let qualityConfig: {
      model: string;
      steps: number;
      label: string;
      description: string;
      guidance?: number;
      shift?: number;
      sampler?: string;
      scheduler?: string;
    };

    switch (workflowType) {
      case 's2v':
        // Use modelVariant if provided, otherwise fall back to quality preset
        if (modelVariant) {
          const baseConfig = modelVariant === 'speed' 
            ? S2V_QUALITY_PRESETS.fast 
            : S2V_QUALITY_PRESETS.quality;
          qualityConfig = {
            ...baseConfig,
            model: S2V_MODELS[modelVariant]
          };
        } else {
          qualityConfig = S2V_QUALITY_PRESETS[quality];
        }
        break;
      case 'animate-move':
        // Use modelVariant if provided, otherwise fall back to quality preset
        if (modelVariant) {
          const baseConfig = ANIMATE_MOVE_QUALITY_PRESETS.fast;
          qualityConfig = {
            ...baseConfig,
            model: ANIMATE_MOVE_MODELS.speed // Only 'speed' model available
          };
        } else {
          // Map quality to available presets (only fast and balanced available)
          const mappedQuality = quality === 'fast' ? 'fast' : 'balanced';
          qualityConfig = ANIMATE_MOVE_QUALITY_PRESETS[mappedQuality];
        }
        break;
      case 'animate-replace':
        // Use modelVariant if provided, otherwise fall back to quality preset
        if (modelVariant) {
          const baseConfig = ANIMATE_REPLACE_QUALITY_PRESETS.fast;
          qualityConfig = {
            ...baseConfig,
            model: ANIMATE_REPLACE_MODELS.speed // Only 'speed' model available
          };
        } else {
          // Map quality to available presets (only fast and balanced available)
          const mappedQuality = quality === 'fast' ? 'fast' : 'balanced';
          qualityConfig = ANIMATE_REPLACE_QUALITY_PRESETS[mappedQuality];
        }
        break;
      case 'i2v':
      default:
        qualityConfig = VIDEO_QUALITY_PRESETS[quality];
        break;
    }

    if (!qualityConfig) {
      throw new Error(`Invalid quality preset: ${quality} for workflow: ${workflowType}`);
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
    
    // Use explicit frames if provided, otherwise calculate from duration
    // Explicit frames take precedence for workflows like Infinite Loop that need exact frame matching
    const frames = explicitFrames !== undefined ? explicitFrames : calculateVideoFrames(duration);
    
    console.log('🎬 VIDEO SETTINGS RECEIVED:');
    if (explicitFrames !== undefined) {
      console.log(`   Explicit frames: ${frames}`);
      console.log(`   Calculated duration: ${((frames - 1) / 16).toFixed(2)}s (at BASE_FPS 16)`);
    } else {
      console.log(`   Duration setting: ${duration}s`);
      console.log(`   Calculated frames: ${frames} (BASE_FPS 16 * ${duration}s + 1)`);
    }
    console.log(`   FPS setting: ${fps}`);
    console.log(`   Resolution: ${resolution}`);
    console.log(`   Quality: ${quality}`);
    
    // Build base createParams
    const createParams: Record<string, unknown> = {
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
      frames: frames,
      fps: fps,
      tokenType: tokenType
    };

    // Add workflow-specific parameters
    if (workflowType === 'i2v' || workflowType === 'batch-transition') {
      // Standard I2V or Batch Transition - add referenceImageEnd if provided (for transitions)
      if (referenceImageEnd) {
        createParams.referenceImageEnd = referenceImageEnd;
      }
    } else if (workflowType === 's2v') {
      // Sound to Video - add audio reference and S2V-specific settings
      if (referenceAudio) {
        createParams.referenceAudio = referenceAudio;
      }
      // Add audio timing parameters
      if (audioStart !== undefined) {
        createParams.audioStart = audioStart;
      }
      if (audioDuration !== undefined) {
        createParams.audioDuration = audioDuration;
      }
      // S2V uses specific sampler/scheduler
      if (qualityConfig.sampler) {
        createParams.sampler = qualityConfig.sampler;
      }
      if (qualityConfig.scheduler) {
        createParams.scheduler = qualityConfig.scheduler;
      }
      if (qualityConfig.shift !== undefined) {
        createParams.shift = qualityConfig.shift;
      }
      if (qualityConfig.guidance !== undefined) {
        createParams.guidance = qualityConfig.guidance;
      }
    } else if (workflowType === 'animate-move' || workflowType === 'animate-replace') {
      // Animate workflows - add video reference
      if (referenceVideo) {
        createParams.referenceVideo = referenceVideo;
      }
      // Add video start offset for trimming
      if (videoStart !== undefined) {
        createParams.videoStart = videoStart;
      }
      // Add animate-specific settings
      if (qualityConfig.sampler) {
        createParams.sampler = qualityConfig.sampler;
      }
      if (qualityConfig.scheduler) {
        createParams.scheduler = qualityConfig.scheduler;
      }
      if (qualityConfig.shift !== undefined) {
        createParams.shift = qualityConfig.shift;
      }
      if (qualityConfig.guidance !== undefined) {
        createParams.guidance = qualityConfig.guidance;
      }
      // Animate-Replace specific: SAM2 coordinates for subject selection
      if (workflowType === 'animate-replace' && sam2Coordinates) {
        createParams.sam2Coordinates = sam2Coordinates;
      }
    }

    // Log video job submission for debugging
    console.group('🎬 VIDEO JOB SUBMITTED');
    console.log('📐 DIMENSIONS BEING SENT TO SDK:');
    console.log(`   WIDTH: ${scaled.width}px`);
    console.log(`   HEIGHT: ${scaled.height}px`);
    console.log('');
    console.log('📋 Job Settings:');
    console.log(`   Workflow Type: ${workflowType}`);
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
    if (referenceVideo) {
      console.log('');
      console.log('🎬 Animate Mode:');
      console.log(`   Using referenceVideo (size: ${referenceVideo.length} bytes)`);
      console.log(`   videoStart: ${videoStart !== undefined ? videoStart + 's' : 'not set'}`);
    }
    if (referenceAudio) {
      console.log('');
      console.log('🎤 S2V Mode:');
      console.log(`   Using referenceAudio (size: ${referenceAudio.length} bytes)`);
      console.log(`   audioStart: ${audioStart}`);
      console.log(`   audioDuration: ${audioDuration}`);
    }
    if (sam2Coordinates) {
      console.log('');
      console.log('🎯 SAM2 Coordinates:');
      console.log(`   ${sam2Coordinates}`);
    }
    console.groupEnd();

    // Log the actual createParams being sent to SDK for debugging
    console.log('📦 FULL createParams being sent to SDK:', JSON.stringify({
      ...createParams,
      referenceImage: createParams.referenceImage ? `[Buffer ${(createParams.referenceImage as Uint8Array).length} bytes]` : undefined,
      referenceVideo: createParams.referenceVideo ? `[Buffer ${(createParams.referenceVideo as Uint8Array).length} bytes]` : undefined,
      referenceAudio: createParams.referenceAudio ? `[Buffer ${(createParams.referenceAudio as Uint8Array).length} bytes]` : undefined,
      referenceImageEnd: createParams.referenceImageEnd ? `[Buffer ${(createParams.referenceImageEnd as Uint8Array).length} bytes]` : undefined,
    }, null, 2));
    
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
    // - If job is still sending jobETA updates, extend timeout indefinitely
    // - Only timeout if 120 seconds pass without any jobETA update
    const timeoutMinutes: Record<VideoQualityPreset, number> = {
      fast: 3,      // ~12-20s generation + large buffer
      balanced: 5,  // ~25-40s generation + large buffer
      quality: 8,   // ~3-4 min at 480p, up to ~6 min at 720p + buffer
      pro: 15       // ~6-9 min at 480p, up to ~14 min at 720p + buffer
    };
    const baseTimeoutMs = timeoutMinutes[quality] * 60 * 1000;
    const inactivityTimeoutMs = 240 * 1000; // 240 seconds of no activity

    // Initialize last activity time
    activeProject.lastActivityTime = Date.now();

    // Base timeout - only used as fallback, activity checks take precedence
    activeProject.timeoutId = setTimeout(() => {
      if (activeProject.isCompleted) return;
      
      // Check if we've received recent activity
      const timeSinceLastActivity = Date.now() - (activeProject.lastActivityTime || 0);
      // If we have recent activity, don't timeout even if base timeout is exceeded
      if (timeSinceLastActivity < inactivityTimeoutMs) {
        console.log(`[VIDEO] Base timeout reached but job is still active (last activity ${Math.floor(timeSinceLastActivity / 1000)}s ago). Continuing...`);
        return;
      }
      
      handleProjectError(new Error('Video generation timed out'), 'timeout');
    }, baseTimeoutMs);

    // Activity check interval - runs every 30 seconds to check for inactivity
    activeProject.activityCheckInterval = setInterval(() => {
      if (activeProject.isCompleted) return;
      
      const timeSinceLastActivity = Date.now() - (activeProject.lastActivityTime || Date.now());
      
      // CRITICAL FIX: Only timeout based on inactivity, not base timeout
      // If we're receiving jobETA events, keep the job alive regardless of how long it takes
      if (timeSinceLastActivity > inactivityTimeoutMs) {
        console.log(`[VIDEO] No activity for ${Math.floor(timeSinceLastActivity / 1000)}s. Timing out...`);
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
            // Cap at 100% to prevent display issues when step exceeds stepCount
            // (can happen during video encoding/post-processing phases)
            const progressPercent = Math.min(100, Math.round((event.step / event.stepCount) * 100));

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

        // Build regeneration params object for workflows that need it
        const regenerateParams: Photo['videoRegenerateParams'] = {};
        if (workflowType === 's2v') {
          regenerateParams.referenceAudioUrl = referenceAudioUrl;
          regenerateParams.audioStart = audioStart;
          regenerateParams.audioDuration = audioDuration;
        } else if (workflowType === 'animate-move' || workflowType === 'animate-replace') {
          regenerateParams.referenceVideoUrl = referenceVideoUrl;
          regenerateParams.videoStart = videoStart;
          if (workflowType === 'animate-replace') {
            regenerateParams.sam2Coordinates = sam2Coordinates;
          }
        } else if (workflowType === 'batch-transition') {
          // Batch transition needs the next photo ID to load the end frame for regeneration
          regenerateParams.nextPhotoId = nextPhotoId;
        }
        if (isMontageSegment) {
          regenerateParams.isMontageSegment = true;
          regenerateParams.segmentIndex = segmentIndex;
        }

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
          videoNegativePrompt: negativePrompt || '', // Store the negative prompt used
          videoMotionEmoji: motionEmoji || '', // Store the emoji used for video generation
          videoWorkflowType: workflowType || 'default', // Store workflow type (s2v, animate-move, etc.)
          videoModelVariant: modelVariant, // Store model variant for regeneration
          // Store regeneration params for re-running failed/bad videos
          videoRegenerateParams: Object.keys(regenerateParams).length > 0 ? regenerateParams : undefined
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
 * Result of video cancellation attempt
 */
export interface VideoCancelResult {
  success: boolean;
  didCancel: boolean;
  projectId: string;
  rateLimited?: boolean;
  cooldownRemaining?: number;
  errorMessage?: string;
  refundEstimate?: {
    estimatedRefundPercent: number;
    message: string;
  };
}

/**
 * Cancel video generation with rate limiting
 */
export async function cancelVideoGeneration(
  projectId: string,
  _sogniClient: SogniClient,
  setPhotos: (updater: (prev: Photo[]) => Photo[]) => void,
  onCancel?: () => void,
  onRateLimited?: (cooldownSeconds: number) => void
): Promise<VideoCancelResult> {
  const activeProject = activeVideoProjects.get(projectId);

  if (!activeProject) {
    return {
      success: false,
      didCancel: false,
      projectId,
      errorMessage: 'Project not found'
    };
  }

  // Check rate limit before attempting cancel
  const cancelState = getCancellationState();
  if (!cancelState.canCancel) {
    console.log(`Rate limited: cannot cancel video for ${cancelState.cooldownRemaining} more seconds`);
    onRateLimited?.(cancelState.cooldownRemaining);
    return {
      success: false,
      didCancel: false,
      projectId,
      rateLimited: true,
      cooldownRemaining: cancelState.cooldownRemaining,
      errorMessage: `Please wait ${cancelState.cooldownRemaining} seconds before cancelling again`
    };
  }

  try {
    // Calculate refund estimate based on current progress
    const photos = await new Promise<Photo[]>((resolve) => {
      setPhotos(prev => {
        resolve(prev);
        return prev;
      });
    });

    const photo = photos[activeProject.photoIndex];
    const progress = photo?.videoProgress || 0;
    const refund = estimateRefund(progress);

    // Cleanup timers and handlers first
    if (activeProject.cleanup) {
      activeProject.cleanup();
    }

    // Call SDK cancel if available
    if (activeProject.project?.cancel) {
      await activeProject.project.cancel();
    }

    // Record the cancel attempt for rate limiting
    recordCancelAttempt();
    notifyCancelStateChange();

    // Update photo state
    setPhotos(prev => {
      const updated = [...prev];
      const idx = activeProject.photoIndex;
      if (!updated[idx]) return prev;
      updated[idx] = {
        ...updated[idx],
        generatingVideo: false,
        videoETA: undefined,
        videoProjectId: undefined,
        videoError: undefined, // Clear error - user cancelled intentionally
        videoStatus: undefined
      };
      return updated;
    });

    // Remove from active projects
    activeVideoProjects.delete(projectId);

    onCancel?.();

    return {
      success: true,
      didCancel: true,
      projectId,
      refundEstimate: {
        estimatedRefundPercent: refund.estimatedRefundPercent,
        message: refund.message
      }
    };
  } catch (error) {
    console.error(`Error cancelling video ${projectId}:`, error);
    activeVideoProjects.delete(projectId);

    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      didCancel: false,
      projectId,
      errorMessage: errorMsg
    };
  }
}

/**
 * Check if video cancellation is rate limited
 */
export function canCancelVideo(): { canCancel: boolean; cooldownRemaining: number } {
  const state = getCancellationState();
  return {
    canCancel: state.canCancel,
    cooldownRemaining: state.cooldownRemaining
  };
}

/**
 * Get all active video project IDs
 * Optionally filter by a prefix pattern (e.g., 'infinite-loop-transition')
 */
export function getActiveVideoProjectIds(filterPrefix?: string): string[] {
  const allIds = Array.from(activeVideoProjects.keys());
  if (!filterPrefix) {
    return allIds;
  }
  // For filtering, we need to check the associated photo IDs, not project IDs
  // Since project IDs are from SDK and not controllable
  return allIds;
}

/**
 * Cancel all active video projects
 * Returns the number of projects cancelled
 */
export async function cancelAllActiveVideoProjects(
  setPhotos: (updater: (prev: Photo[]) => Photo[]) => void
): Promise<{ cancelled: number; failed: number; projectIds: string[] }> {
  const projectIds = Array.from(activeVideoProjects.keys());
  
  if (projectIds.length === 0) {
    return { cancelled: 0, failed: 0, projectIds: [] };
  }
  
  console.log(`[VideoGenerator] Cancelling all ${projectIds.length} active video projects`);
  
  let cancelled = 0;
  let failed = 0;
  const cancelledIds: string[] = [];
  
  // Cancel all projects - we skip rate limiting for bulk cancel since user explicitly requested
  for (const projectId of projectIds) {
    const activeProject = activeVideoProjects.get(projectId);
    if (!activeProject) continue;
    
    try {
      // Cleanup timers and handlers first
      if (activeProject.cleanup) {
        activeProject.cleanup();
      }
      
      // Call SDK cancel if available
      if (activeProject.project?.cancel) {
        await activeProject.project.cancel();
      }
      
      // Remove from active projects
      activeVideoProjects.delete(projectId);
      cancelledIds.push(projectId);
      cancelled++;
      
      console.log(`[VideoGenerator] Cancelled project ${projectId}`);
    } catch (error) {
      console.error(`[VideoGenerator] Failed to cancel project ${projectId}:`, error);
      activeVideoProjects.delete(projectId);
      failed++;
    }
  }
  
  // Record single cancel attempt for rate limiting (bulk cancel counts as one)
  if (cancelled > 0) {
    recordCancelAttempt();
    notifyCancelStateChange();
  }
  
  // Update photo states to clear video generation flags
  setPhotos(prev => {
    return prev.map(photo => {
      if (photo.generatingVideo) {
        return {
          ...photo,
          generatingVideo: false,
          videoETA: undefined,
          videoProjectId: undefined,
          videoError: undefined,
          videoStatus: undefined
        };
      }
      return photo;
    });
  });
  
  console.log(`[VideoGenerator] Bulk cancel complete: ${cancelled} cancelled, ${failed} failed`);
  
  return { cancelled, failed, projectIds: cancelledIds };
}

/**
 * Check if there are any active video projects
 */
export function hasActiveVideoProjects(): boolean {
  return activeVideoProjects.size > 0;
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
  canCancelVideo,
  isGeneratingVideo,
  getActiveVideoProjectId,
  downloadVideo,
  formatVideoDuration
};
