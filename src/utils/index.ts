/**
 * Helper: resize dataURL so original matches the Sogni dimension
 * for easy side-by-side comparison (no skew).
 */
export async function resizeDataUrl(dataUrl: string, width: number, height: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      
      // Enable high-quality image resampling for best results
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      // fill black to avoid any transparent edges
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/png", 1.0)); // Use maximum quality
    };
    img.src = dataUrl;
  });
}

/**
 * Generate a UUID
 */
export const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * Get custom dimensions for camera based on device and orientation
 */
export const getCustomDimensions = () => {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const isPortrait = window.innerHeight > window.innerWidth;

  if (isMobile) {
    return {
      width: isPortrait ? 896 : 1152,
      height: isPortrait ? 1152 : 896
    };
  }

  // Desktop dimensions
  return {
    width: 1280,
    height: 720
  };
};

/**
 * Format a number as a percentage
 */
export const formatPercentage = (value: number): string => {
  return `${Math.round(value * 100)}%`;
};

/**
 * Delay execution for a specified time
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Options for fetchWithRetry
 */
export interface FetchWithRetryOptions {
  /** Maximum number of retry attempts (default: 2, meaning 3 total attempts) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000ms) */
  initialDelay?: number;
  /** Multiplier for exponential backoff (default: 1.5) */
  backoffMultiplier?: number;
  /** Optional context string for logging */
  context?: string;
}

/**
 * Fetch with automatic retry for transient CORS/network errors
 * S3 presigned URLs can occasionally fail with CORS errors even when valid.
 * Retrying after a short delay typically resolves these transient issues.
 *
 * @param url - The URL to fetch
 * @param options - Fetch options (same as native fetch)
 * @param retryOptions - Retry configuration
 * @returns Promise<Response> - The fetch response
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retryOptions: FetchWithRetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 2,
    initialDelay = 2000, // Start with 2 seconds
    backoffMultiplier = 2, // Double the delay each retry (2s, 4s, 8s)
    context = 'fetch'
  } = retryOptions;

  let lastError: Error | null = null;
  let currentDelay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      // If we got a response (even non-2xx), return it - let caller handle HTTP errors
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if this is a retryable error (network/CORS issues)
      const isRetryable = isRetryableError(lastError);

      if (!isRetryable || attempt >= maxRetries) {
        // Not retryable or exhausted retries
        if (attempt > 0) {
          console.warn(
            `[${context}] Failed after ${attempt + 1} attempts: ${lastError.message}`
          );
        }
        throw lastError;
      }

      // Log retry attempt
      console.log(
        `[${context}] Attempt ${attempt + 1} failed (${lastError.message}), ` +
        `retrying in ${currentDelay}ms...`
      );

      await delay(currentDelay);
      currentDelay = Math.round(currentDelay * backoffMultiplier);
    }
  }

  // Should not reach here, but TypeScript needs this
  throw lastError || new Error('Fetch failed with unknown error');
}

/**
 * Check if an error is likely a transient network/CORS error that can be retried
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Network errors that are typically transient
  const retryablePatterns = [
    'failed to fetch',
    'network',
    'cors',
    'net::err_failed',
    'load failed',
    'networkerror',
    'typeerror: failed to fetch',
    'the operation was aborted'
  ];

  return retryablePatterns.some(pattern => message.includes(pattern));
}

/**
 * Check if device is iOS
 */
export const isIOS = (): boolean => {
  const ua = navigator.userAgent;
  const isClassicIOS = /iPhone|iPad|iPod/i.test(ua);
  // iPadOS 13+ can report as Mac; detect via touch support
  const isIPadOSDesktopUA = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isClassicIOS || isIPadOSDesktopUA;
};

/**
 * Check if device is mobile
 */
export const isMobile = (): boolean => {
  const ua = navigator.userAgent;
  const classicMobile = /iPhone|iPad|iPod|Android/i.test(ua);
  const isIPadOSDesktopUA = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return classicMobile || isIPadOSDesktopUA;
};

/**
 * Get device orientation
 */
export const getOrientation = (): 'portrait' | 'landscape' => {
  // Check for iOS devices first
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  
  // Use both window.matchMedia and dimension comparison to ensure reliability on iOS
  const isPortraitByMedia = window.matchMedia("(orientation: portrait)").matches;
  const isPortraitByDimension = window.innerHeight > window.innerWidth;
  
  // On iOS, we prioritize the media query result as it's more reliable
  if (isIOS) {
    return isPortraitByMedia ? 'portrait' : 'landscape';
  }
  
  // For other devices, use dimension comparison as a fallback
  return isPortraitByDimension ? 'portrait' : 'landscape';
};

/**
 * Calculate aspect ratio
 */
export const calculateAspectRatio = (): number => {
  const orientation = getOrientation();
  // Use more extreme ratio for portrait to ensure proper display on iPhones
  return orientation === 'portrait' ? 7/9 : 9/7;
};

/**
 * Convert style ID to display text
 */
export function styleIdToDisplay(styleId: string): string {
  // Handle special cases
  if (styleId === 'browseGallery') {
    return 'Browse Gallery';
  }
  if (styleId === 'random') {
    return 'Random: Single';
  }
  if (styleId === 'randomMix') {
    return 'Random: All';
  }
  if (styleId === 'rnBSoulSinger') {
    return 'R&B Soul Singer';
  }
  if (styleId === 'makeMeABoxer') {
    return 'Make Me A Boxer';
  }
  if (styleId === 'nftAzuki') {
    return 'NFT Azuki';
  }
  if (styleId === 'nftBoredApe') {
    return 'NFT Bored Ape';
  }
  if (styleId === 'nftCryptoPunk') {
    return 'NFT Crypto Punk';
  }
  if (styleId === 'nftDoodles') {
    return 'NFT Doodles';
  }
  if (styleId === 'y2kRaverKid') {
    return 'Y2K Raver Kid';
  }
  
  return styleId
    // Split ALL consecutive uppercase letters (VHS -> V H S, DJ -> D J, BW -> B W, TV -> T V, etc.)
    .replace(/([A-Z])(?=[A-Z])/g, '$1 ')
    // Add space between lowercase and uppercase
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Add space between letters and numbers
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d+)([a-zA-Z])/g, (match: string, numbers: string, letters: string) => {
      // Don't separate common patterns like F1, 1990s, 90s, 70s, 3D, etc.
      const commonPatterns = /^(f1|1990s|90s|80s|70s|60s|50s|3d|2d|8k|4k|24x24|128x112)$/i;
      if (commonPatterns.test(numbers + letters)) {
        return match; // Keep as-is
      }
      return `${numbers} ${letters}`; // Add space after numbers
    })
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/**
 * Get a random style from available styles
 */
export function getRandomStyle(availableStyles: string[]): string {
  const filteredStyles = availableStyles.filter(
    (key) => key !== 'custom' && key !== 'random' && key !== 'randomMix' && key !== 'oneOfEach'
  );
  return filteredStyles[Math.floor(Math.random() * filteredStyles.length)];
}

/**
 * Get random mix of prompts
 */
export function getRandomMixPrompts(availableStyles: string[], prompts: Record<string, string>, count: number): string {
  const filteredStyles = availableStyles.filter(
    (key) => key !== 'custom' && key !== 'random' && key !== 'randomMix' && key !== 'oneOfEach'
  );

  // Shuffle the available styles to ensure good distribution
  const shuffledStyles = [...filteredStyles];
  for (let i = shuffledStyles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledStyles[i], shuffledStyles[j]] = [shuffledStyles[j], shuffledStyles[i]];
  }

  const selectedPrompts = [];
  for (let i = 0; i < count; i++) {
    // Cycle through shuffled styles to ensure good distribution
    const styleIndex = i % shuffledStyles.length;
    const selectedStyle = shuffledStyles[styleIndex];
    if (prompts[selectedStyle]) {
      selectedPrompts.push(prompts[selectedStyle]);
    }
  }

  return `{${selectedPrompts.join('|')}}`;
}

// Valid backend sampler values (for validation)
const VALID_BACKEND_SAMPLERS = [
  'euler', 'euler_ancestral', 'heun', 'dpmpp_2m', 'dpmpp_2m_sde', 'dpmpp_sde',
  'dpmpp_3m_sde', 'uni_pc', 'lcm', 'lms', 'dpm_2', 'dpm_2_ancestral', 'dpm_fast',
  'dpm_adaptive', 'dpmpp_2s_ancestral', 'ddpm', 'ddim', 'uni_pc_bh2',
  'res_multistep', 'res_multistep_cfg_pp'
];

// Valid backend scheduler values (for validation)
const VALID_BACKEND_SCHEDULERS = [
  'simple', 'normal', 'karras', 'exponential', 'sgm_uniform', 'ddim_uniform',
  'beta', 'linear_quadratic', 'kl_optimal', 'ddim', 'leading', 'linear'
];

/**
 * Normalize sampler name from UI format to backend format
 * UI format: "DPM++ SDE" -> Backend format: "dpmpp_sde"
 */
export function normalizeSampler(sampler: string | undefined): string | undefined {
  if (!sampler) return undefined;

  const samplerMap: Record<string, string> = {
    'Euler': 'euler',
    'Euler a': 'euler_ancestral',
    'Heun': 'heun',
    'DPM++ 2M': 'dpmpp_2m',
    'DPM++ 2M SDE': 'dpmpp_2m_sde',
    'DPM++ SDE': 'dpmpp_sde',
    'DPM++ 3M SDE': 'dpmpp_3m_sde',
    'UniPC': 'uni_pc',
    'LCM': 'lcm',
    'LMS': 'lms',
    'DPM 2': 'dpm_2',
    'DPM 2 Ancestral': 'dpm_2_ancestral',
    'DPM Fast': 'dpm_fast',
    'DPM Adaptive': 'dpm_adaptive',
    'DPM++ 2S Ancestral': 'dpmpp_2s_ancestral',
    'DDPM': 'ddpm',
    'DDIM': 'ddim',
    'UniPC BH2': 'uni_pc_bh2',
    'Res Multistep': 'res_multistep',
    'Res Multistep CFG++': 'res_multistep_cfg_pp',
  };

  // Try exact match first
  if (samplerMap[sampler]) {
    return samplerMap[sampler];
  }

  // If already in valid backend format, return as-is
  if (VALID_BACKEND_SAMPLERS.includes(sampler)) {
    return sampler;
  }

  // Fallback: warn and return safe default
  console.warn(`[NORMALIZE] Unknown sampler format: "${sampler}", falling back to 'dpmpp_sde'`);
  return 'dpmpp_sde';
}

/**
 * Normalize scheduler name from UI format to backend format
 * UI format: "SGM Uniform" -> Backend format: "sgm_uniform"
 */
export function normalizeScheduler(scheduler: string | undefined): string | undefined {
  if (!scheduler) return undefined;

  const schedulerMap: Record<string, string> = {
    'Karras': 'karras',
    'Simple': 'simple',
    'Normal': 'normal',
    'SGM Uniform': 'sgm_uniform',
    'Beta': 'beta',
    'Linear': 'linear',
    'Exponential': 'exponential',
    'Linear Quadratic': 'linear_quadratic',
    'Leading': 'leading',
    'DDIM': 'ddim',
    'DDIM Uniform': 'ddim_uniform',
    'KL Optimal': 'kl_optimal',
  };

  // Try exact match first
  if (schedulerMap[scheduler]) {
    return schedulerMap[scheduler];
  }

  // If already in valid backend format, return as-is
  if (VALID_BACKEND_SCHEDULERS.includes(scheduler)) {
    return scheduler;
  }

  // Fallback: warn and return safe default
  console.warn(`[NORMALIZE] Unknown scheduler format: "${scheduler}", falling back to 'karras'`);
  return 'karras';
} 