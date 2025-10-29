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
    .replace(/(\d+)([a-zA-Z])/g, (match, numbers, letters) => {
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