import { themeConfigService } from '../services/themeConfig';

/**
 * Returns dimensions based on the selected aspect ratio or device orientation.
 * @param {string} aspectRatio - 'portrait', 'narrow', 'ultranarrow', 'landscape', 'wide', 'ultrawide', or 'square'
 */
export function getCustomDimensions(aspectRatio) {
  // If no aspectRatio is provided, determine based on screen orientation
  const isPortrait = window.innerHeight > window.innerWidth;
  
  // If no aspectRatio is provided, determine based on screen orientation
  if (!aspectRatio) {
    return isPortrait ? 
      { width: 896, height: 1152 } : // Portrait: 896:1152 (ratio ~0.778)
      { width: 1152, height: 896 }; // Landscape: 1152:896 (ratio ~1.286)
  }
  
  // Otherwise use the explicitly provided aspectRatio
  switch (aspectRatio) {
    case 'portrait':
      return { width: 896, height: 1152 }; // Portrait: 896:1152 (3:4 ratio ~0.778)
    case 'narrow':
      return { width: 832, height: 1216 }; // Narrow: 832:1216 (2:3 ratio ~0.684)
    case 'ultranarrow':
      return { width: 768, height: 1344 }; // Ultra Narrow: 768:1344 (9:16 ratio ~0.571)
    case 'landscape':
      return { width: 1152, height: 896 }; // Landscape: 1152:896 (4:3 ratio ~1.286)
    case 'wide':
      return { width: 1216, height: 832 }; // Wide: 1216:832 (3:2 ratio ~1.462)
    case 'ultrawide':
      return { width: 1344, height: 768 }; // Ultra Wide: 1344:768 (16:9 ratio ~1.75)
    case 'square':
      return { width: 1024, height: 1024 }; // Square: 1024x1024 (ratio 1:1)
    default:
      // Fallback to orientation-based default if invalid option provided
      return isPortrait ? 
        { width: 896, height: 1152 } : 
        { width: 1152, height: 896 };
  }
}

/** 
 * Helper: resize dataURL so original matches the Sogni dimension 
 * for easy side-by-side comparison (no skew).
 */
export async function resizeDataUrl(dataUrl, width, height) {
  return new Promise((resolve) => {
    const img = new Image();
    img.addEventListener('load', () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      
      // Enable high-quality image resampling for best results
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      
      // fill black to avoid any transparent edges
      context.fillStyle = 'black';
      context.fillRect(0, 0, width, height);
      context.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/png', 1.0));
    });
    img.src = dataUrl;
  });
}

/**
 * Creates a polaroid framed version of an image for social sharing
 * @param {string} imageUrl - URL or data URL of the image to frame
 * @param {string} label - Optional label to display at the bottom of the polaroid
 * @param {Object} options - Additional options
 * @param {number} options.frameWidth - Width of the polaroid border sides (default: 24px)
 * @param {number} options.frameTopWidth - Width of the polaroid border top (default: 24px)
 * @param {number} options.frameBottomWidth - Width of the polaroid border bottom (default: 64px)
 * @param {string} options.frameColor - Color of the polaroid frame (default: white)
 * @param {string} options.labelFont - Font for the label (default: 16px "Permanent Marker", cursive)
 * @param {string} options.labelColor - Color for the label text (default: #333)
 * @param {string} options.tezdevTheme - TezDev theme or 'off'
 * @param {string} options.aspectRatio - Aspect ratio of the original image
 * @param {string} options.outputFormat - Output format ('png' or 'jpg', default: 'png')
 * @param {Object} options.watermarkOptions - Options for QR watermark (optional)
 * @returns {Promise<string>} Data URL of the generated polaroid image
 */
export async function createPolaroidImage(imageUrl, label, options = {}) {
  const {
    frameWidth = 56,
    frameTopWidth = 56,
    frameBottomWidth = 150, // Reduced to match on-screen display better
    frameColor = 'white',
    labelFont = '70px "Permanent Marker", cursive',
    labelColor = '#333',
    tezdevTheme = 'off',
    aspectRatio = 'portrait',
    outputFormat = 'png',
    watermarkOptions = null
  } = options;

  return new Promise((resolve, reject) => {

    // Load the Permanent Marker font if it's not already loaded
    if (!document.querySelector('link[href*="Permanent+Marker"]')) {
      // Create a link element for the Google Font
      const fontLink = document.createElement('link');
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap';
      fontLink.rel = 'stylesheet';
      document.head.appendChild(fontLink);
      
      console.log('Loaded Permanent Marker font for polaroid label');
    }

    const img = new Image();
    img.crossOrigin = 'anonymous'; // Handle CORS for image loading
    
    img.onload = async () => {
      // Ensure any text to draw exists
      const textToDraw = label ? label.trim() : '';
      console.log(`Drawing polaroid with label: "${textToDraw}"`);
      
      // Create a canvas for the polaroid
      const canvas = document.createElement('canvas');
      
      // Calculate dimensions to maintain aspect ratio
      const aspectRatioValue = img.width / img.height;
      
      // Set a reasonable max size for the polaroid
      const maxImageWidth = 1600;
      const maxImageHeight = 1600;
      
      let imageWidth, imageHeight;
      
      if (img.width > img.height) {
        // Landscape orientation
        imageWidth = Math.min(img.width, maxImageWidth);
        imageHeight = imageWidth / aspectRatioValue;
      } else {
        // Portrait or square orientation
        imageHeight = Math.min(img.height, maxImageHeight);
        imageWidth = imageHeight * aspectRatioValue;
      }
      
      // Calculate full polaroid dimensions including frame
      const polaroidWidth = imageWidth + (frameWidth * 2);
      const polaroidHeight = imageHeight + frameTopWidth + frameBottomWidth;
      
      // Set canvas size to the polaroid dimensions
      canvas.width = polaroidWidth;
      canvas.height = polaroidHeight;
      
      const ctx = canvas.getContext('2d');
      
      // Enable high-quality image resampling for best results
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      // Draw polaroid frame (white background)
      // For JPG format, ensure we have an opaque background
      const actualFrameColor = (outputFormat === 'jpg' && frameColor === 'transparent') ? 'white' : frameColor;
      ctx.fillStyle = actualFrameColor;
      ctx.fillRect(0, 0, polaroidWidth, polaroidHeight);
      
      // Draw the image centered in the frame
      // For themes with frame padding, account for the border baked into the frame
      if (tezdevTheme !== 'off') {
        try {
          const framePadding = await themeConfigService.getFramePadding(tezdevTheme);
          
          // Check if we have any padding (either old number format or new object format)
          const hasPadding = (typeof framePadding === 'number' && framePadding > 0) ||
                           (typeof framePadding === 'object' && 
                            (framePadding.top > 0 || framePadding.left > 0 || framePadding.right > 0 || framePadding.bottom > 0));
          
          if (hasPadding) {
            // Handle both old number format and new object format
            let paddingObj;
            if (typeof framePadding === 'number') {
              // Legacy format - convert to object
              paddingObj = { top: framePadding, left: framePadding, right: framePadding, bottom: framePadding };
            } else {
              paddingObj = framePadding;
            }
            
            // Intelligent positioning: image must COVER the entire available space
            // CRITICAL: Preserve aspect ratio but ensure NO white space in frame
            
            // Calculate available space after accounting for frame padding
            const availableWidth = imageWidth - (paddingObj.left + paddingObj.right);
            const availableHeight = imageHeight - (paddingObj.top + paddingObj.bottom);
            
            // Calculate scale factor needed to COVER the available space (like object-fit: cover)
            const originalAspectRatio = img.width / img.height;
            const availableAspectRatio = availableWidth / availableHeight;
            
            let adjustedImageWidth, adjustedImageHeight;
            
            if (originalAspectRatio > availableAspectRatio) {
              // Image is wider - scale by HEIGHT to ensure full coverage (image will be cropped horizontally)
              adjustedImageHeight = availableHeight;
              adjustedImageWidth = availableHeight * originalAspectRatio;
            } else {
              // Image is taller - scale by WIDTH to ensure full coverage (image will be cropped vertically)
              adjustedImageWidth = availableWidth;
              adjustedImageHeight = availableWidth / originalAspectRatio;
            }
            
            // Center the scaled image within the available space (some parts may extend beyond bounds)
            const adjustedX = frameWidth + paddingObj.left + (availableWidth - adjustedImageWidth) / 2;
            const adjustedY = frameTopWidth + paddingObj.top + (availableHeight - adjustedImageHeight) / 2;
            
            ctx.drawImage(img, adjustedX, adjustedY, adjustedImageWidth, adjustedImageHeight);
            console.log(`Drew image with ${tezdevTheme} frame padding adjustment:`, paddingObj, 
                       `Image: ${adjustedImageWidth}x${adjustedImageHeight} at (${adjustedX}, ${adjustedY})`);
          } else {
            // No padding needed for this theme
            ctx.drawImage(img, frameWidth, frameTopWidth, imageWidth, imageHeight);
          }
        } catch (error) {
          console.warn('Could not load theme frame padding, using standard image drawing:', error);
          ctx.drawImage(img, frameWidth, frameTopWidth, imageWidth, imageHeight);
        }
      } else {
        // Standard image drawing for no theme
        ctx.drawImage(img, frameWidth, frameTopWidth, imageWidth, imageHeight);
      }
      
      // Apply TezDev frame if enabled (works on all aspect ratios now)
      if (tezdevTheme !== 'off') {
        applyTezDevFrame(ctx, imageWidth, imageHeight, frameWidth, frameTopWidth, tezdevTheme, aspectRatio, options)
          .then(async () => {
            await finalizePolaroid();
          })
          .catch(async (err) => {
            console.warn('Failed to apply TezDev frame, continuing without it:', err);
            await finalizePolaroid();
          });
      } else {
        await finalizePolaroid();
      }
      
      async function finalizePolaroid() {
      // Add subtle inner shadow to make it look more realistic
      ctx.shadowColor = 'rgba(0,0,0,0.1)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 1;
      ctx.shadowOffsetX = 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.strokeRect(frameWidth, frameTopWidth, imageWidth, imageHeight);
      
      // Reset shadow for text
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      
      // Add label if provided and not empty
      if (textToDraw) {
        // Set font with Permanent Marker
        ctx.font = labelFont;
        ctx.fillStyle = labelColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Position label in the bottom white area, a bit higher from the bottom for better visual balance
        const labelY = polaroidHeight - (frameBottomWidth / 2);
        
        // Constrain label length if too long
        const maxLabelWidth = polaroidWidth - 20; // Increased padding
        let displayLabel = textToDraw;
        
        if (ctx.measureText(textToDraw).width > maxLabelWidth) {
          // Truncate and add ellipsis if too long
          for (let i = textToDraw.length; i > 0; i--) {
            const truncated = textToDraw.substring(0, i) + '...';
            if (ctx.measureText(truncated).width <= maxLabelWidth) {
              displayLabel = truncated;
              break;
            }
          }
        }
        
        ctx.fillText(displayLabel, polaroidWidth / 2, labelY);
        
        console.log(`Drew label: "${displayLabel}" at y=${labelY} with bottom width ${frameBottomWidth}`);
      }
      
      // Add QR watermark if options provided - position within image area, not full polaroid
      if (watermarkOptions) {
        try {
          // Get frame padding for custom themes to position QR correctly
          let framePadding = 0;
          if (tezdevTheme !== 'off') {
            try {
              framePadding = await themeConfigService.getFramePadding(tezdevTheme);
            } catch (error) {
              console.warn('Could not get frame padding for QR positioning, using default:', error);
            }
          }
          
          // Position QR watermark within the image area to avoid overlapping with label
          const imageAreaWatermarkOptions = {
            ...watermarkOptions,
            position: 'top-right', // Always use top-right for polaroid frames
            // Adjust positioning to be within the image area
            imageAreaOnly: true,
            imageWidth,
            imageHeight,
            frameOffsetX: frameWidth,
            frameOffsetY: frameTopWidth,
            // Add frame padding for custom themes
            framePadding
          };
          await addQRWatermark(ctx, polaroidWidth, polaroidHeight, imageAreaWatermarkOptions);
        } catch (watermarkError) {
          console.warn('Failed to add QR watermark to polaroid, continuing without it:', watermarkError);
        }
      }
      
      // Convert to data URL using the specified format with appropriate quality
      const mimeType = outputFormat === 'jpg' ? 'image/jpeg' : 'image/png';
      // Use reasonable JPEG quality for smaller file sizes, PNG ignores quality parameter
      const quality = outputFormat === 'jpg' ? 0.92 : 1.0;
      const dataUrl = canvas.toDataURL(mimeType, quality);
      
      // For debugging: display the image in the console and file size
      const fileSizeKB = Math.round(dataUrl.length * 0.75 / 1024); // Rough estimate of base64 to binary size
      console.log(`Generated polaroid with dimensions: ${polaroidWidth}x${polaroidHeight}, format: ${outputFormat}, quality: ${quality}, estimated size: ${fileSizeKB}KB`);
      
      resolve(dataUrl);
      }
    };
    
    img.onerror = (err) => {
      console.error('Error creating polaroid image:', err);
      reject(new Error('Failed to load image for polaroid frame'));
    };
    
    img.src = imageUrl;
  });
}

/**
 * Applies TezDev corner frame overlays to a canvas context
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {number} imageWidth - Width of the image area
 * @param {number} imageHeight - Height of the image area  
 * @param {number} frameOffsetX - X offset of the image from canvas edge
 * @param {number} frameOffsetY - Y offset of the image from canvas edge
 * @param {string} theme - TezDev theme (dynamic themes supported)
 */
async function applyTezDevFrame(ctx, imageWidth, imageHeight, frameOffsetX, frameOffsetY, theme, aspectRatio, options = {}) {
  // Handle dynamic themes
  try {
    const frameUrls = await themeConfigService.getFrameUrls(theme, aspectRatio);
    if (frameUrls.length === 0) {
      console.log(`No frame URLs found for theme ${theme} with aspect ratio ${aspectRatio}`);
      return;
    }

    return new Promise((resolve, reject) => {

      // Determine which frame to use
      let frameUrl;
      if (frameUrls.length === 1) {
        frameUrl = frameUrls[0];
      } else {
        // Multiple frames available, use provided frame number or calculate one
        const frameIndex = options.taipeiFrameNumber ? (options.taipeiFrameNumber - 1) : ((imageWidth + imageHeight) % frameUrls.length);
        frameUrl = frameUrls[frameIndex] || frameUrls[0];
      }

      const themeFrame = new Image();
      themeFrame.crossOrigin = 'anonymous';
      
      themeFrame.onload = () => {
        // Scale the frame to match the full image area
        const scaleX = imageWidth / themeFrame.naturalWidth;
        const scaleY = imageHeight / themeFrame.naturalHeight;
        const scale = Math.min(scaleX, scaleY);
        
        const scaledFrameWidth = themeFrame.naturalWidth * scale;
        const scaledFrameHeight = themeFrame.naturalHeight * scale;
        
        // Position the frame to cover the entire image area
        const frameX = frameOffsetX + (imageWidth - scaledFrameWidth) / 2;
        const frameY = frameOffsetY + (imageHeight - scaledFrameHeight) / 2;
        
        // Draw the frame
        ctx.drawImage(themeFrame, frameX, frameY, scaledFrameWidth, scaledFrameHeight);
        console.log(`Applied ${theme} theme frame: ${frameUrl}`);
        resolve();
      };
      
      themeFrame.onerror = (err) => {
        console.error(`Failed to load ${theme} theme frame: ${frameUrl}`, err);
        reject(err);
      };
      
      themeFrame.src = frameUrl;
    });
      
  } catch (error) {
    console.error(`Error loading theme configuration for ${theme}:`, error);
    return; // Continue without frame
  }
}

/** 
 * Center crop an image to match portrait aspect ratio on mobile
 * This is specifically for photos selected from the camera roll
 * @param {Blob} imageBlob - The image blob to crop
 * @param {number} targetWidth - Target width for the cropped image
 * @param {number} targetHeight - Target height for the cropped image
 * @param {Object} watermarkOptions - Options for QR watermark (optional)
 */
export async function centerCropImage(imageBlob, targetWidth, targetHeight, watermarkOptions = null) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      
      // Enable high-quality image resampling for best results
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      // Fill with black background to avoid transparency
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      
      // Calculate dimensions for center crop
      const imageAspect = img.width / img.height;
      const targetAspect = targetWidth / targetHeight;
      
      let sourceX = 0;
      let sourceY = 0;
      let sourceWidth = img.width;
      let sourceHeight = img.height;
      
      // If image is wider than target, crop width
      if (imageAspect > targetAspect) {
        sourceWidth = img.height * targetAspect;
        sourceX = (img.width - sourceWidth) / 2;
      } 
      // If image is taller than target, crop height
      else if (imageAspect < targetAspect) {
        sourceHeight = img.width / targetAspect;
        sourceY = (img.height - sourceHeight) / 2;
      }
      
      // Draw the cropped image onto the canvas
      ctx.drawImage(
        img, 
        sourceX, sourceY, sourceWidth, sourceHeight,
        0, 0, targetWidth, targetHeight
      );
      
      // Add QR watermark if options provided
      if (watermarkOptions) {
        try {
          await addQRWatermark(ctx, targetWidth, targetHeight, watermarkOptions);
        } catch (watermarkError) {
          console.warn('Failed to add QR watermark to cropped image, continuing without it:', watermarkError);
        }
      }
      
      // Convert to blob with maximum quality
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png', 1.0);
    };
    
    img.src = URL.createObjectURL(imageBlob);
  });
}

/**
 * Convert a blob to a data URL
 */
export const blobToDataURL = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Add QR code watermark to an image
 * @param {CanvasRenderingContext2D} ctx - Canvas context to draw on
 * @param {number} canvasWidth - Width of the canvas
 * @param {number} canvasHeight - Height of the canvas
 * @param {Object} options - Watermark options
 * @param {number} options.size - Size of the QR code (default: 80)
 * @param {number} options.margin - Margin from edges (default: 20)
 * @param {string} options.position - Position ('bottom-right', 'bottom-left', 'top-right', 'top-left')
 * @param {number} options.opacity - Opacity of the watermark (0-1, default: 1.0)
 * @param {string} options.url - URL to encode in QR code (default: 'https://qr.sogni.ai')
 */
export async function addQRWatermark(ctx, canvasWidth, canvasHeight, options = {}) {
  const {
    size = 80,
    margin = 20,
    position = 'bottom-right',
    opacity = 1.0,
    url = 'https://qr.sogni.ai'
  } = options;

  try {
    // Import QR code service dynamically
    const { qrCodeService } = await import('../services/qrCodeService');
    
    // Generate QR code data URL
    const qrDataUrl = await qrCodeService.generateQRCode(url, {
      width: size * 2, // Generate at higher resolution for better quality
      margin: 1, // Minimal margin since we control positioning
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    return new Promise((resolve) => {
    const qrImage = new Image();
    qrImage.crossOrigin = 'anonymous';
    
    qrImage.onload = () => {
      // Save current context state
      ctx.save();
      
      // Set opacity for watermark
      ctx.globalAlpha = opacity;
      
      // Calculate position based on preference
      let x, y;
      
      // If imageAreaOnly is specified, position within the image area, not the full canvas
      if (options.imageAreaOnly && options.imageWidth && options.imageHeight) {
        const imageWidth = options.imageWidth;
        const imageHeight = options.imageHeight;
        const offsetX = options.frameOffsetX || 0;
        const offsetY = options.frameOffsetY || 0;
        const framePadding = options.framePadding || { top: 0, left: 0, right: 0, bottom: 0 };
        
        // Handle both old number format and new object format for frame padding
        let paddingObj;
        if (typeof framePadding === 'number') {
          paddingObj = { top: framePadding, left: framePadding, right: framePadding, bottom: framePadding };
        } else {
          paddingObj = framePadding;
        }
        
        // Account for frame padding in positioning - QR should be inside the frame border
        const adjustedOffsetX = offsetX + paddingObj.left;
        const adjustedOffsetY = offsetY + paddingObj.top;
        const adjustedImageWidth = imageWidth - (paddingObj.left + paddingObj.right);
        const adjustedImageHeight = imageHeight - (paddingObj.top + paddingObj.bottom);
        
        switch (position) {
          case 'bottom-left':
            x = adjustedOffsetX + margin;
            y = adjustedOffsetY + adjustedImageHeight - size - margin;
            break;
          case 'top-right':
            x = adjustedOffsetX + adjustedImageWidth - size - margin;
            y = adjustedOffsetY + margin;
            break;
          case 'top-left':
            x = adjustedOffsetX + margin;
            y = adjustedOffsetY + margin;
            break;
          case 'bottom-right':
          default:
            // Position in bottom-right of image area
            x = adjustedOffsetX + adjustedImageWidth - size - margin;
            y = adjustedOffsetY + adjustedImageHeight - size - margin;
            break;
        }
        
        const hasPadding = paddingObj.top > 0 || paddingObj.left > 0 || paddingObj.right > 0 || paddingObj.bottom > 0;
        if (hasPadding) {
          console.log(`QR positioned with frame padding:`, paddingObj, `adjusted position: (${x}, ${y})`);
        }
      } else {
        // Original positioning for full canvas
        switch (position) {
          case 'bottom-left':
            x = margin;
            y = canvasHeight - size - margin;
            break;
          case 'top-right':
            x = canvasWidth - size - margin;
            y = margin;
            break;
          case 'top-left':
            x = margin;
            y = margin;
            break;
          case 'bottom-right':
          default:
            // For bottom-right, position exactly in corner without margin
            x = canvasWidth - size;
            y = canvasHeight - size;
            break;
        }
      }
      
      // No drop shadow for cleaner appearance
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      
      // Draw the QR code
      ctx.drawImage(qrImage, x, y, size, size);
      
      // Restore context state
      ctx.restore();
      
      console.log(`✅ QR watermark applied at ${position} (${x}, ${y}) with size ${size}px for URL: ${url}`);
      resolve();
      };
      
      qrImage.onerror = (error) => {
        console.warn('Failed to load generated QR code watermark, continuing without it:', error);
        resolve(); // Don't reject, just continue without watermark
      };
      
      // Use the generated QR code data URL
      qrImage.src = qrDataUrl;
    });
  } catch (error) {
    console.warn('Failed to generate QR code watermark, continuing without it:', error);
    return Promise.resolve(); // Don't reject, just continue without watermark
  }
}

/**
 * Convert a PNG blob to high-quality JPEG blob for efficient upload
 * Maintains high quality while reducing file size for faster uploads
 * @param {Blob} pngBlob - The PNG blob to convert
 * @param {number} quality - JPEG quality (0.1-1.0), default 0.92 for high quality
 * @param {Object} watermarkOptions - Options for QR watermark (optional)
 * @returns {Promise<Blob>} High-quality JPEG blob
 */
export async function convertPngToHighQualityJpeg(pngBlob, quality = 0.92, watermarkOptions = null) {
  return new Promise((resolve, reject) => {
    // Log original file size
    const originalSizeMB = (pngBlob.size / 1024 / 1024).toFixed(2);
    console.log(`🖼️ Converting PNG to JPEG - Original size: ${originalSizeMB}MB`);

    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      
      // Enable high-quality image resampling for best results
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      // Fill with white background to avoid black background in JPEG
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw the image
      ctx.drawImage(img, 0, 0);
      
      // Add QR watermark if options provided
      if (watermarkOptions) {
        try {
          await addQRWatermark(ctx, canvas.width, canvas.height, watermarkOptions);
        } catch (watermarkError) {
          console.warn('Failed to add QR watermark, continuing without it:', watermarkError);
        }
      }
      
      // Convert to high-quality JPEG blob
      canvas.toBlob((jpegBlob) => {
        if (!jpegBlob) {
          reject(new Error('Failed to create JPEG blob'));
          return;
        }
        
        // Log conversion results
        const newSizeMB = (jpegBlob.size / 1024 / 1024).toFixed(2);
        const compressionRatio = ((1 - jpegBlob.size / pngBlob.size) * 100).toFixed(1);
        console.log(`📦 JPEG conversion complete - New size: ${newSizeMB}MB (${compressionRatio}% smaller)`);
        
        resolve(jpegBlob);
      }, 'image/jpeg', quality);
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load PNG image for conversion'));
    };
    
    // Create object URL to load the PNG blob
    const url = URL.createObjectURL(pngBlob);
    
    // Store the original onload handler
    const originalOnload = img.onload;
    
    // Override onload to clean up URL and call original handler
    img.onload = () => {
      URL.revokeObjectURL(url);
      originalOnload();
    };
    
    img.src = url;
  });
} 