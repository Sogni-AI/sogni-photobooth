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
  scheduler: string;
  timeStepSpacing: string;
  // Flux.1 Kontext specific settings
  guidance: number;
  flashEnabled: boolean;
  keepOriginalPhoto: boolean;
  positivePrompt?: string;
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
  sogniWatermarkPosition?: 'top-left' | 'top-right';
  qrCodeUrl?: string;
  // Worker preferences
  requiredWorkers: string[];
  preferWorkers: string[];
  skipWorkers: string[];
} 