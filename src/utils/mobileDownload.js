/**
 * Mobile Download Utilities
 * Provides mobile-optimized download functionality for saving photos to camera roll
 */

import { isIOS, isMobile } from './index';
import { TWITTER_SHARE_CONFIG } from '../constants/settings';
import { trackDownloadWithStyle } from '../services/analyticsService';

/**
 * Detect if device is Android
 */
export const isAndroid = () => {
  return /Android/i.test(navigator.userAgent);
};

/**
 * Create an optimized image element for mobile downloads
 * This enables native context menu and long press functionality
 */
export const createMobileOptimizedImage = (imageUrl, alt = 'Photo') => {
  const img = document.createElement('img');
  
  // Set image source and attributes
  img.src = imageUrl;
  img.alt = alt;
  img.crossOrigin = 'anonymous';
  
  // Enable native mobile context menu and long press
  img.style.cssText = `
    -webkit-user-select: auto !important;
    user-select: auto !important;
    -webkit-touch-callout: default !important;
    touch-action: auto !important;
    -webkit-user-drag: auto !important;
    user-drag: auto !important;
    pointer-events: auto !important;
    max-width: 100%;
    height: auto;
    display: block;
  `;
  
  return img;
};

/**
 * Enhanced download function for mobile devices
 * Attempts to trigger native photo saving behavior
 * @param {string} imageUrl - The image URL to download/share
 * @param {string} filename - The filename for the download
 * @param {Object} analyticsOptions - Optional analytics tracking options
 */
export const downloadImageMobile = async (imageUrl, filename, analyticsOptions = {}) => {
  try {
    if (isMobile()) {
      // Method 1: Try native Web Share API first (works on modern iOS and Android)
      if (navigator.share && navigator.canShare) {
        try {
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          const file = new File([blob], filename, { type: blob.type });
          
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: 'Save Photo',
              text: TWITTER_SHARE_CONFIG.DEFAULT_MESSAGE
            });
            
            // Track analytics for successful mobile download
            if (analyticsOptions.selectedStyle && analyticsOptions.stylePrompts) {
              await trackDownloadWithStyle(
                analyticsOptions.selectedStyle, 
                analyticsOptions.stylePrompts, 
                {
                  filename,
                  platform: 'mobile',
                  method: 'web-share-api',
                  ...analyticsOptions.metadata
                }
              );
            }
            
            return true;
          }
        } catch (shareError) {
          // Check if the error is due to user cancellation
          if (shareError.name === 'AbortError' || 
              shareError.message.includes('abort') || 
              shareError.message.includes('cancel') ||
              shareError.message.includes('dismissed') ||
              shareError.name === 'NotAllowedError') {
            // User cancelled the share dialog - this is expected behavior, don't fallback
            console.log('User cancelled share dialog');
            return true; // Return true to indicate the operation completed (user chose to cancel)
          }
          
          // Only fallback if it's a real error (not user cancellation)
          console.log('Native share not supported, trying fallback methods:', shareError.message);
        }
      }
      
      // Method 2: For Android Chrome, use enhanced download
      if (isAndroid()) {
        return await downloadImageAndroid(imageUrl, filename);
      }
      
      // Method 3: For iOS devices, use standard download (as a fallback)
      if (isIOS()) {
        return await downloadImageStandard(imageUrl, filename);
      }
    }
    
    // Fallback to standard download for all other cases
    return await downloadImageStandard(imageUrl, filename);
    
  } catch (error) {
    console.error('Mobile download failed:', error);
    // Return false to indicate failure - let the calling code decide on fallback behavior
    return false;
  }
};

/**
 * iOS-specific download implementation
 * Creates a popup with optimized image for long press to save
 */
const downloadImageIOS = async (imageUrl, filename) => {
  try {
    // Create popup window with proper dimensions for mobile
    const popup = window.open('', '_blank', 'width=400,height=600,scrollbars=yes,resizable=yes');
    
    if (!popup) {
      // Popup blocked, fallback to standard download
      return await downloadImageStandard(imageUrl, filename);
    }
    
    // Create the HTML content for the popup
    const popupContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
          <title>Save Photo - ${filename}</title>
          <style>
            body {
              margin: 0;
              padding: 20px;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: #000;
              color: #fff;
              text-align: center;
              min-height: 100vh;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
            }
            .container {
              max-width: 100%;
              padding: 20px;
            }
            .instructions {
              margin-bottom: 20px;
              font-size: 16px;
              line-height: 1.4;
            }
            .photo {
              max-width: 100%;
              max-height: 70vh;
              border-radius: 8px;
              box-shadow: 0 4px 20px rgba(255,255,255,0.1);
              -webkit-user-select: auto !important;
              user-select: auto !important;
              -webkit-touch-callout: default !important;
              touch-action: auto !important;
              -webkit-user-drag: auto !important;
              user-drag: auto !important;
              pointer-events: auto !important;
            }
            .close-btn {
              position: fixed;
              top: 20px;
              right: 20px;
              background: rgba(255,255,255,0.2);
              border: none;
              color: white;
              font-size: 24px;
              width: 40px;
              height: 40px;
              border-radius: 20px;
              cursor: pointer;
              z-index: 1000;
            }
            .close-btn:hover {
              background: rgba(255,255,255,0.3);
            }
            @media (max-width: 480px) {
              .instructions {
                font-size: 14px;
              }
              .container {
                padding: 10px;
              }
            }
          </style>
        </head>
        <body>
          <button class="close-btn" onclick="window.close()">&times;</button>
          <div class="container">
            <div class="instructions">
              <strong>📱 Tap and hold the image below</strong><br>
              Then select "Save to Photos" or "Add to Photos"
            </div>
            <img 
              class="photo" 
              src="${imageUrl}" 
              alt="${filename}"
              crossorigin="anonymous"
              onload="console.log('Image loaded successfully')"
              onerror="console.error('Failed to load image'); this.style.display='none'; document.querySelector('.instructions').innerHTML='❌ Failed to load image. Please try again.';"
            >
          </div>
        </body>
      </html>
    `;
    
    // Write content to popup
    popup.document.open();
    popup.document.write(popupContent);
    popup.document.close();
    
    // Focus the popup
    popup.focus();
    
    return true;
    
  } catch (error) {
    console.error('iOS download popup failed:', error);
    return await downloadImageStandard(imageUrl, filename);
  }
};

/**
 * Android-specific download implementation
 * Uses enhanced download with proper MIME type for photo apps
 */
const downloadImageAndroid = async (imageUrl, filename) => {
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    
    // Ensure proper MIME type for photo recognition
    const imageBlob = new Blob([blob], { type: 'image/png' });
    const blobUrl = URL.createObjectURL(imageBlob);
    
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    
    // Add attributes that help with photo app recognition
    link.setAttribute('type', 'image/png');
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 1000);
    
    return true;
    
  } catch (error) {
    console.error('Android download failed:', error);
    return await downloadImageStandard(imageUrl, filename);
  }
};

/**
 * Standard download implementation (fallback)
 */
const downloadImageStandard = async (imageUrl, filename) => {
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 100);
    
    return true;
  } catch (error) {
    console.error('Standard download failed:', error);
    window.open(imageUrl, '_blank');
    return false;
  }
};

/**
 * Apply mobile-optimized CSS to existing images
 */
export const enableMobileImageDownload = (imgElement) => {
  if (!imgElement || !isMobile()) return;
  
  // Apply mobile-optimized styles
  imgElement.style.cssText += `
    -webkit-user-select: auto !important;
    user-select: auto !important;
    -webkit-touch-callout: default !important;
    touch-action: auto !important;
    -webkit-user-drag: auto !important;
    user-drag: auto !important;
    pointer-events: auto !important;
  `;
  
  // Only set crossOrigin if the image hasn't loaded yet to avoid triggering a reload
  // Setting crossOrigin after load can cause mobile Chrome to re-evaluate and fail
  if (!imgElement.crossOrigin && !imgElement.complete) {
    imgElement.crossOrigin = 'anonymous';
  }
};

export default {
  downloadImageMobile,
  createMobileOptimizedImage,
  enableMobileImageDownload,
  isAndroid
}; 