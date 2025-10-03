import { Settings, AspectRatioOption, OutputFormat } from '../types/index';

// Helper function to safely get model options
export const getModelOptions = () => {
  return [
    {
      label: "🅂 Sogni.XLT 𝛂1 (SDXL Turbo)",
      value: "coreml-sogniXLturbo_alpha1_ad",
    },
    {
      label: "DreamShaper v2.1 (SDXL Turbo)",
      value: "coreml-dreamshaperXL_v21TurboDPMSDE",
    },
    {
      label: "JuggernautXL 9 + RD Photo2 (SDXL Lightning)",
      value: "coreml-juggernautXL_v9Rdphoto2Lightning",
    },
    {
      label: "wildcardx XL (SDXL Lightning)",
      value: "coreml-wildcardxXLLIGHTNING_wildcardxXL",
    },
    {
      label: "RealVisXL v4 (SDXL Lightning)",
      value: "coreml-realvisxlV40_v40LightningBakedvae",
    },
    {
      label: "RealDream (SDXL Lightning)",
      value: "coreml-realDream_sdxlLightning1",
    },
    {
      label: "FenrisXL (SDXL Lightning)",
      value: "coreml-fenrisxl_SDXLLightning",
    },
    {
      label: "epiCRealism XL VXI (SDXL Lightning)",
      value: "coreml-epicrealismXL_VXIAbeast4SLightning",
    },
    {
      label: "Flux.1 Kontext",
      value: "flux1-dev-kontext_fp8_scaled",
    },
  ];
};

// Helper function to get a valid model option value
export const getValidModelValue = (selectedValue: string) => {
  const options = getModelOptions();
  const defaultValue = options[0].value;
  
  // If the selected value exists in options, use it
  if (selectedValue && options.some(option => option.value === selectedValue)) {
    return selectedValue;
  }
  
  // Otherwise use the first option as default
  return defaultValue;
};

// Helper function to check if the current model is Flux.1 Kontext
export const isFluxKontextModel = (modelValue: string): boolean => {
  return modelValue === "flux1-dev-kontext_fp8_scaled";
};

// Model parameter ranges and constraints
export const getModelRanges = (modelValue: string) => {
  if (isFluxKontextModel(modelValue)) {
    return {
      guidance: { min: 1, max: 5, step: 0.1, default: 2.8 },
      inferenceSteps: { min: 18, max: 40, step: 1, default: 24 },
      numImages: { min: 1, max: 8, step: 1, default: 4 },
      schedulerOptions: ['Euler', 'Euler a', 'DPM++ 2M'],
      timeStepSpacingOptions: ['Simple', 'SGM Uniform', 'Beta', 'Normal', 'DDIM'],
    };
  }
  
  // Ranges for other models (SDXL-based)
  return {
    promptGuidance: { min: 1.8, max: 3, step: 0.1, default: 2 },
    guidance: { min: 1, max: 5, step: 0.1, default: 3 }, // Not used but kept for consistency
    controlNetStrength: { min: 0.4, max: 1, step: 0.1, default: 0.7 },
    controlNetGuidanceEnd: { min: 0.2, max: 0.8, step: 0.1, default: 0.6 },
    inferenceSteps: { min: 4, max: 10, step: 1, default: 7 },
    numImages: { min: 1, max: 16, step: 1, default: 8 },
    schedulerOptions: ['DPM++ SDE', 'DPM++ 2M SDE'],
    timeStepSpacingOptions: ['Karras', 'SGM Uniform'],
  };
};

// Get model-specific default settings
export const getModelDefaults = (modelValue: string) => {
  const ranges = getModelRanges(modelValue);
  
  if (isFluxKontextModel(modelValue)) {
    return {
      guidance: ranges.guidance.default,
      inferenceSteps: ranges.inferenceSteps.default,
      scheduler: 'DPM++ 2M', // Default scheduler
      timeStepSpacing: 'Beta', // Default time step spacing
      numImages: ranges.numImages.default,
    };
  }
  
  // Default settings for other models
  return {
    promptGuidance: ranges.promptGuidance?.default || 2,
    guidance: ranges.guidance?.default || 3,
    controlNetStrength: ranges.controlNetStrength?.default || 0.7,
    controlNetGuidanceEnd: ranges.controlNetGuidanceEnd?.default || 0.6,
    inferenceSteps: ranges.inferenceSteps?.default || 7,
    scheduler: 'DPM++ SDE',
    timeStepSpacing: 'Karras',
    numImages: ranges.numImages?.default || 8,
  };
};

// Helper function to determine default aspect ratio - defaults to narrow (2:3) for new users
export const getDefaultAspectRatio = (): AspectRatioOption => {
  // Check if user has an existing aspect ratio preference in cookies
  const savedAspectRatio = document.cookie
    .split('; ')
    .find(row => row.startsWith('aspectRatio='))
    ?.split('=')[1];
    
  // If user has a saved preference, respect it
  if (savedAspectRatio && ['ultranarrow', 'narrow', 'portrait', 'square', 'landscape', 'wide', 'ultrawide'].includes(savedAspectRatio)) {
    return savedAspectRatio as AspectRatioOption;
  }
  
  // For new users, default to narrow (2:3) 
  return 'narrow';
};

// Create DEFAULT_SETTINGS using centralized defaults
const createDefaultSettings = (): Settings => {
  const defaultModel = "coreml-sogniXLturbo_alpha1_ad";
  const modelDefaults = getModelDefaults(defaultModel);
  
  return {
    selectedModel: defaultModel,
    numImages: modelDefaults.numImages,
    promptGuidance: modelDefaults.promptGuidance || 2,
    controlNetStrength: modelDefaults.controlNetStrength || 0.7,
    controlNetGuidanceEnd: modelDefaults.controlNetGuidanceEnd || 0.6,
    inferenceSteps: modelDefaults.inferenceSteps,
    scheduler: modelDefaults.scheduler,
    timeStepSpacing: modelDefaults.timeStepSpacing,
    // Flux.1 Kontext specific settings
    guidance: modelDefaults.guidance || 3,
    flashEnabled: true,
    keepOriginalPhoto: false,
    selectedStyle: "randomMix",
    positivePrompt: '',
    stylePrompt: '',
    negativePrompt: '',
    seed: '',
    soundEnabled: true,
    slothicornAnimationEnabled: true,
    backgroundAnimationsEnabled: true,
    aspectRatio: getDefaultAspectRatio(),
    tezdevTheme: 'off' as const,
    outputFormat: 'jpg' as OutputFormat,
    sensitiveContentFilter: false,
    preferredCameraDeviceId: undefined,
    kioskMode: false,
    sogniWatermark: true, // Default to enabled
    sogniWatermarkSize: 100, // Default QR code size
    sogniWatermarkMargin: 26, // Default margin from edge
    sogniWatermarkPosition: 'top-right' as const, // Default position
    qrCodeMarginStartsInsideFrame: false, // Default to margin from corner regardless of frame
    qrCodeUrl: 'https://qr.sogni.ai', // Default QR code URL
    // Worker preferences
    requiredWorkers: [],
    preferWorkers: ['SPICE.MUST.FLOW'],
    skipWorkers: ['freeman123'],
  };
};

export const DEFAULT_SETTINGS: Settings = createDefaultSettings();

// Backend now handles all Sogni API communication, so we don't need these URLs in the frontend
export const SOGNI_URLS = {
  api: "/api/sogni",  // Local API endpoint that proxies to Sogni
  socket: "", // We don't use WebSockets directly anymore
};

// Timeout configurations
export const TIMEOUT_CONFIG = {
  // Per-job timeout - how long to wait for a single job to complete after it starts progressing
  PER_JOB_TIMEOUT: 4 * 60 * 1000, // 4 minutes
  
  // Project watchdog timeout - how long to wait for progress on ANY job before considering project stuck  
  PROJECT_WATCHDOG_TIMEOUT: 2 * 60 * 1000, // 2 minutes
  
  // Initial connection timeout - how long to wait for first event from backend
  INITIAL_CONNECTION_TIMEOUT: 30 * 1000, // 30 seconds
  
  // Overall project timeout - maximum time for entire batch (matches backend)
  OVERALL_PROJECT_TIMEOUT: 5 * 60 * 1000, // 5 minutes
  
  // Progress stall timeout - how long without progress updates before considering a job stuck
  PROGRESS_STALL_TIMEOUT: 90 * 1000, // 90 seconds
} as const;

export const defaultStylePrompts: { [key: string]: string } = {
  custom: "",
  photorealistic: "photorealistic, highly detailed, 8k uhd, high quality",
  anime: "anime style, manga style, japanese animation",
  watercolor: "watercolor painting, artistic, soft colors",
  oilPainting: "oil painting, textured, artistic, masterpiece",
  pencilSketch: "pencil sketch, black and white, detailed drawing",
  popArt: "pop art style, bold colors, comic book style",
  cyberpunk: "cyberpunk style, neon colors, futuristic",
  steampunk: "steampunk style, victorian, brass and copper",
  fantasy: "fantasy art style, magical, ethereal",
  random: "{photorealistic|anime|watercolor|oilPainting|pencilSketch|popArt|cyberpunk|steampunk|fantasy}",
};

// Twitter share configuration
export const TWITTER_SHARE_CONFIG = {
  // Default fallback message for Twitter sharing
  DEFAULT_MESSAGE: "Just took my photo with the free @sogni_protocol AI photobooth https://photobooth.sogni.ai",
} as const;

// QR Code watermark configuration - centralized settings for all QR watermark usage
export const getQRWatermarkConfig = (settings: Settings) => ({
  size: settings.sogniWatermarkSize ?? 100,
  margin: settings.sogniWatermarkMargin ?? 26,
  position: settings.sogniWatermarkPosition ?? 'top-right',
  opacity: 1.0, // Always 100% for maximum legibility
  url: settings.qrCodeUrl || 'https://qr.sogni.ai', // URL to encode in QR code
  marginStartsInsideFrame: settings.qrCodeMarginStartsInsideFrame ?? false, // Whether margin starts inside frame or from corner
});

// Legacy static config for backward compatibility (deprecated - use getQRWatermarkConfig instead)
export const QR_WATERMARK_CONFIG = {
  SIZE: 96,
  MARGIN: 16,
  POSITION: 'top-right' as const,
} as const;

// Sample Gallery constants - hard-coded values that cannot be changed by user settings
export const SAMPLE_GALLERY_CONFIG = {
  // Force 2:3 aspect ratio for sample gallery (matches hosted sample images)
  ASPECT_RATIO: 'narrow' as AspectRatioOption,
  // Dimensions for 2:3 aspect ratio
  WIDTH: 832,
  HEIGHT: 1216,
  // CSS aspect ratio value
  CSS_ASPECT_RATIO: '832/1216',
} as const; 