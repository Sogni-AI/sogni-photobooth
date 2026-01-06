export interface Photo {
  id: string;
  generating: boolean;
  images: string[];
  error?: string;
  originalDataUrl?: string;
  newlyArrived?: boolean;
  generationCountdown?: number;
  isOriginal?: boolean;
  loading?: boolean;
  progress?: number;
  permanentError?: boolean;

  // Timeout tracking fields
  jobStartTime?: number;
  lastProgressTime?: number;
  timedOut?: boolean;
  
  // Taipei Blockchain Week frame number (1-6) - assigned once per photo
  taipeiFrameNumber?: number;

  // Enhancement-specific fields
  enhancing?: boolean;
  enhanced?: boolean;
  enhancementProgress?: number;
  enhancementError?: string;
  canRedo?: boolean;
  originalEnhancedImage?: string;
  enhancedImageUrl?: string;

  // Hide functionality for NSFW content during batch generation
  hidden?: boolean;

  // Video generation fields
  videoUrl?: string;
  generatingVideo?: boolean;
  videoProgress?: number;
  videoETA?: number; // Remaining time in seconds from jobETA event
  videoElapsed?: number; // Elapsed time in seconds since job started
  videoStartTime?: number;
  videoProjectId?: string;
  videoError?: string;
  videoWorkerName?: string; // Worker processing the video job
  videoStatus?: string; // Current status text (e.g., "Queued", "Processing")
  // Video generation settings metadata
  videoResolution?: '480p' | '580p' | '720p';
  videoFramerate?: 16 | 32;
  videoDuration?: number; // Duration in seconds (1-8 in 0.5 increments)
  videoMotionPrompt?: string; // The motion prompt used for video generation
  videoMotionEmoji?: string; // The emoji used for video generation (e.g., '🔥', '😂')
}

export interface ProjectState {
  currentPhotoIndex: number;
  jobs: Map<string, JobState>;
  startedJobs: Set<string>;
  completedJobs: Map<string, unknown>;
  pendingCompletions: Map<string, unknown>;
}

export interface JobState {
  index: number;
  status: string;
  resultUrl?: string;
  progress?: number;
  error?: string;
}

export interface StylePrompt {
  [key: string]: string;
}

export interface ModelOption {
  label: string;
  value: string;
}

export type AspectRatioOption = 'portrait' | 'landscape' | 'square' | 'narrow' | 'wide' | 'ultrawide' | 'ultranarrow';

export type TezDevTheme = 'supercasual' | 'tezoswebx' | 'taipeiblockchain' | 'showup' | 'nodesamongus' | 'off';

export type OutputFormat = 'png' | 'jpg';

export interface Settings {
  selectedStyle: string;
  selectedModel: string;
  numImages: number;
  promptGuidance: number;
  controlNetStrength: number;
  controlNetGuidanceEnd: number;
  inferenceSteps: number;
  sampler: string;
  scheduler: string;
  // Qwen Image Edit specific settings
  guidance: number;
  flashEnabled: boolean;
  keepOriginalPhoto: boolean;
  positivePrompt?: string;
  customSceneName?: string;
  stylePrompt?: string;
  negativePrompt?: string;
  seed?: string;
  soundEnabled: boolean;
  slothicornAnimationEnabled: boolean;
  backgroundAnimationsEnabled: boolean;
  aspectRatio: AspectRatioOption;
  tezdevTheme: TezDevTheme;
  outputFormat: OutputFormat;
  sensitiveContentFilter: boolean;
  preferredCameraDeviceId?: string;
  kioskMode: boolean;
  sogniWatermark: boolean;
  sogniWatermarkSize?: number;
  sogniWatermarkMargin?: number;
  sogniWatermarkPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  qrCodeMarginStartsInsideFrame?: boolean;
  qrCodeUrl?: string;
  portraitType?: string; // 'headshot', 'headshot2', or 'medium'
  // Worker preferences
  requiredWorkers: string[];
  preferWorkers: string[];
  skipWorkers: string[];
  // Inactivity splash screen settings
  showSplashOnInactivity: boolean;
  inactivityTimeout: number; // in seconds
  // Event context flags
  halloweenContext?: boolean; // Flag to indicate user started from Halloween event
  winterContext?: boolean; // Flag to indicate user started from Winter event

  // Video generation settings
  videoResolution?: '480p' | '720p';
  videoQuality?: 'fast' | 'balanced' | 'quality' | 'pro';
  videoFramerate?: 16 | 32;
  videoDuration?: number; // Duration in seconds (1-8 in 0.5 increments)
  videoPositivePrompt?: string;
  videoNegativePrompt?: string;
  videoTransitionPrompt?: string;
} 