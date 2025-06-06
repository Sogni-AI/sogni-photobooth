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
 * Check if device is iOS
 */
export const isIOS = (): boolean => {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
};

/**
 * Check if device is mobile
 */
export const isMobile = (): boolean => {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
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
  return styleId
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/**
 * Get a random style from available styles
 */
export function getRandomStyle(availableStyles: string[]): string {
  const filteredStyles = availableStyles.filter(
    (key) => key !== 'custom' && key !== 'random' && key !== 'randomMix'
  );
  return filteredStyles[Math.floor(Math.random() * filteredStyles.length)];
}

/**
 * Get random mix of prompts
 */
export function getRandomMixPrompts(availableStyles: string[], prompts: Record<string, string>, count: number): string {
  const filteredStyles = availableStyles.filter(
    (key) => key !== 'custom' && key !== 'random' && key !== 'randomMix'
  );

  const selectedPrompts = [];
  for (let i = 0; i < count; i++) {
    const randomStyle = filteredStyles[Math.floor(Math.random() * filteredStyles.length)];
    selectedPrompts.push(prompts[randomStyle]);
  }

  return `{${selectedPrompts.join('|')}}`;
} 