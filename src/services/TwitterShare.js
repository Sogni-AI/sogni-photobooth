/**
 * TwitterShare.js
 * Service for handling Twitter sharing functionality
 */
import config from '../config';
import { createPolaroidImage } from '../utils/imageProcessing';
import { themeConfigService } from './themeConfig';
import { TWITTER_SHARE_CONFIG, getQRWatermarkConfig } from '../constants/settings';

/**
 * Extract hashtag from photo data
 * @param {Object} photo - Photo object containing style information
 * @returns {string|null} - Hashtag or null if not found
 */
export const getPhotoHashtag = (photo) => {
  if (!photo) return null;
  let foundLabel = null;
  // If statusText contains a hashtag, use that
  if (photo.statusText && photo.statusText.length > 4 && photo.statusText.includes('#')) {
    foundLabel = photo.statusText;
  }

  if (!foundLabel || foundLabel.length < 3) {
    foundLabel = '#SogniPhotobooth';
  }
  return foundLabel;
};

/**
 * Share a photo to Twitter (X) using the popup approach
 * @param {Object} params - Parameters for sharing
 * @param {number} params.photoIndex - Index of the photo to share
 * @param {Array} params.photos - Array of photo objects
 * @param {Function} params.setBackendError - Function to update backend error state
 * @param {string} [params.customMessage] - Optional custom message to include in the tweet
 * @param {string} [params.shareUrl] - Optional URL to include in the tweet
 * @param {number} [params.maxRetries=2] - Maximum number of retries for network errors
 * @param {Function} [params.onSuccess] - Callback function for direct share success
 * @param {string} [params.tezdevTheme='off'] - TezDev theme or 'off'
 * @param {string} [params.aspectRatio] - Aspect ratio of the image
 * @param {string} [params.outputFormat='png'] - Output format ('png' or 'jpg') - Note: Twitter always uses JPG regardless of this setting
 * @param {boolean} [params.sogniWatermark=true] - Whether to include Sogni watermark
 * @param {number} [params.sogniWatermarkSize=90] - Size of the QR watermark
 * @param {number} [params.sogniWatermarkMargin=10] - Margin of the QR watermark from edge
 * @returns {Promise<void>}
 */
export const shareToTwitter = async ({
  photoIndex,
  photos,
  setBackendError,
  customMessage,
  shareUrl,
  maxRetries = 2,
  onSuccess = null,
  tezdevTheme = 'off',
  aspectRatio = null,
  outputFormat = 'png',
  sogniWatermark = true,
  sogniWatermarkSize = 90,
  sogniWatermarkMargin = 10,
}) => {
  if (photoIndex === null || !photos[photoIndex] || !photos[photoIndex].images || !photos[photoIndex].images[0]) {
    console.error('No image selected or image URL is missing for sharing.');
    setBackendError({
      type: 'no_image',
      title: '📷 No Image Selected',
      message: 'Please select a photo from your gallery before sharing to X/Twitter.',
      canRetry: false
    });
    return;
  }

  // Pre-open popup synchronously on user gesture to avoid blockers
  const popupWidth = 600;
  const popupHeight = 700;
  const popupLeft = window.innerWidth / 2 - popupWidth / 2 + window.screenX;
  const popupTop = window.innerHeight / 2 - popupHeight / 2 + window.screenY;
  let popup = null;
  try {
    popup = window.open(
      '',
      'twitter-auth-popup',
      `width=${popupWidth},height=${popupHeight},left=${popupLeft},top=${popupTop},location=yes,resizable=yes,scrollbars=yes`
    );
  } catch (e) {
    popup = null;
  }

  if (!popup || popup.closed || typeof popup.closed === 'undefined') {
    const fallbackUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      customMessage || TWITTER_SHARE_CONFIG.DEFAULT_MESSAGE
    )}`;
    setBackendError({
      type: 'popup_blocked',
      title: '🚫 Pop-up Blocked',
      message:
        'Your browser blocked the sharing window. No worries! You can still share your photo manually. Click the button below to open X/Twitter, then save and attach your photo from the gallery.',
      fallbackUrl,
      fallbackText: 'Open X/Twitter'
    });
    return;
  }

  // Lightweight waiting UI inside the pre-opened popup
  try {
    popup.document.write(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Preparing share…</title><style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f8f9fa;color:#333}.card{background:#fff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);padding:1.5rem;max-width:90%;width:420px;text-align:center}.spinner{width:28px;height:28px;border:3px solid #e5e7eb;border-top-color:#1DA1F2;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 12px}@keyframes spin{to{transform:rotate(360deg)}}</style></head><body><div class="card"><div class="spinner"></div><div>Preparing your image and opening X…</div></div></body></html>`
    );
    popup.document.close();
  } catch (e) {
    // Ignore if we cannot write (rare cross-origin timing); continue
  }

  // Ensure Permanent Marker font is loaded for consistent styling
  if (!document.querySelector('link[href*="Permanent+Marker"]')) {
    const fontLink = document.createElement('link');
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);
    
    // Wait for font to load to ensure consistent text rendering
    try {
      await document.fonts.ready;
      console.log('Permanent Marker font loaded for styling');
    } catch (err) {
      console.warn('Could not confirm font loading, continuing anyway:', err);
    }
  }

  const photo = photos[photoIndex];
  const originalImageUrl = photo.images[0];
  
  // Determine the appropriate message format based on TezDev theme
  let twitterMessage = customMessage;
  
  if (tezdevTheme !== 'off') {
    // Use dynamic theme-specific message format
    try {
      const hashtag = getPhotoHashtag(photo);
      const styleTag = hashtag ? hashtag.replace('#', '') : 'vaporwave';
      
      const themeTemplate = await themeConfigService.getTweetTemplate(tezdevTheme, styleTag);
      twitterMessage = themeTemplate;
    } catch (error) {
      console.warn('Could not load theme tweet template, using fallback:', error);
      // Fallback to default message
      twitterMessage = TWITTER_SHARE_CONFIG.DEFAULT_MESSAGE;
    }
  } else if (!twitterMessage) {
    // Use default message for no theme
    twitterMessage = TWITTER_SHARE_CONFIG.DEFAULT_MESSAGE;
  }

  console.log(`Creating image for sharing to X with TezDev theme: ${tezdevTheme}`);
  
  try {
    // Attempt to manually load the Permanent Marker font to ensure it's available
    try {
      const testFont = new FontFace('Permanent Marker', 'url(https://fonts.gstatic.com/s/permanentmarker/v16/Fh4uPib9Iyv2ucM6pGQMWimMp004La2Cfw.woff2)');
      await testFont.load();
      document.fonts.add(testFont);
      console.log('Manually loaded Permanent Marker font');
    } catch (fontError) {
      console.warn('Could not manually load font, using system fallback:', fontError);
    }
    
    let imageDataUrl;
    
    if (tezdevTheme !== 'off') {
      // For TezDev themes, create full frame version (no polaroid frame, just TezDev overlay)
      // Custom frames should not include labels - they have their own styling
      console.log('Creating TezDev full frame version for sharing (always JPG for Twitter)');
      imageDataUrl = await createPolaroidImage(originalImageUrl, '', {
        tezdevTheme,
        aspectRatio,
        frameWidth: 0,      // No polaroid frame
        frameTopWidth: 0,   // No polaroid frame
        frameBottomWidth: 0, // No polaroid frame
        frameColor: 'transparent', // No polaroid background
        outputFormat: 'jpg', // Always use JPG for Twitter sharing
        // Add QR watermark for Twitter sharing (if enabled)
        watermarkOptions: sogniWatermark ? {
          size: sogniWatermarkSize,
          margin: sogniWatermarkMargin,
          position: 'top-right',
          opacity: 1.0
        } : null
      });
    } else {
      // For non-TezDev themes, use traditional polaroid frame
      const hashtag = getPhotoHashtag(photo);
      const label = hashtag || photo.label || photo.style || '';
      
      console.log('Creating polaroid image for sharing (always JPG for Twitter)');
      imageDataUrl = await createPolaroidImage(originalImageUrl, label, {
        tezdevTheme,
        aspectRatio,
        outputFormat: 'jpg', // Always use JPG for Twitter sharing
        // Add QR watermark for Twitter sharing (if enabled)
        watermarkOptions: sogniWatermark ? {
          size: sogniWatermarkSize,
          margin: sogniWatermarkMargin,
          position: 'top-right',
          opacity: 1.0
        } : null
      });
    }
    
    // Use the data URL directly instead of creating a blob URL
    // This ensures the server can access the image data directly
    console.log('Successfully created image for X sharing');
    console.log('Attempting to share image to X');

    let retries = 0;
    const attemptShare = async () => {
      try {
        setBackendError(null);

        // Use config for API endpoint
        const apiUrl = `${config.API.baseUrl}${config.API.endpoints.twitter.start}`;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Important! Ensures cookies are sent
          body: JSON.stringify({ 
            imageUrl: imageDataUrl, // Send the data URL directly instead of blob URL
            message: twitterMessage, // Use the appropriate message format
            shareUrl: shareUrl // Include the share URL if provided
          }),
        });

        if (!response.ok) {
          // Try to get error message from response
          let errorMessage = 'Failed to start Twitter share process.';
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } catch (e) {
            // If we can't parse response body, use status text
            errorMessage = response.statusText || errorMessage;
          }

          console.error('Failed to initiate Twitter share:', response.status, errorMessage);
          
          // For specific status codes that might be transient, retry
          if ((response.status >= 500 || response.status === 429) && retries < maxRetries) {
            retries++;
            console.log(`Retrying Twitter share (${retries}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retrying
            return attemptShare();
          }
          
          setBackendError({
            type: 'connection_error',
            title: '🌐 Connection Issue',
            message: 'Having trouble connecting to our sharing service. Please check your internet connection and try again.',
            details: errorMessage,
            canRetry: true
          });
          return;
        }

        const responseData = await response.json();
        
        // Handle direct share - backend used an existing token without requiring auth
        if (responseData.success === true && !responseData.authUrl) {
          console.log('Image shared directly using existing token');
          
          // Close the pre-opened popup immediately; show success only in-app
          if (popup && !popup.closed) {
            try { popup.close(); } catch (_) {}
          }
          
          // Still call the onSuccess callback if provided
          if (onSuccess && typeof onSuccess === 'function') {
            onSuccess();
          }
          return;
        }
        
        if (!responseData.authUrl) {
          console.error('No authUrl received from backend.');
          setBackendError({
            type: 'auth_error',
            title: '🔐 Authorization Issue',
            message: 'Unable to set up sharing with X/Twitter. Please try again in a moment.',
            canRetry: true
          });
          return;
        }

        // Navigate the already-opened popup to begin OAuth
        try {
          popup.location.href = responseData.authUrl;
        } catch (e) {
          console.error('Could not navigate pre-opened popup to auth URL');
          const fallbackUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterMessage)}`;
          setBackendError({
            type: 'popup_blocked',
            title: '🚫 Pop-up Blocked',
            message: 'Your browser blocked the sharing window. No worries! You can still share your photo manually. Click the button below to open X/Twitter, then save and attach your photo from the gallery.',
            fallbackUrl,
            fallbackText: 'Open X/Twitter'
          });
          return;
        }
        
        // Setup message listener for communication from the popup
        let authCompleted = false;
        const messageHandler = (event) => {
          // Accept messages from any origin since we're using a wildcard in the callback
          console.log('Received message from popup:', event.data);
          
          if (event.data && event.data.type === 'twitter-auth-success') {
            // Auth succeeded
            authCompleted = true;
            window.removeEventListener('message', messageHandler);
            // Close the popup immediately; in-app toast will handle UX
            try { if (popup && !popup.closed) popup.close(); } catch (_) {}
            if (onSuccess && typeof onSuccess === 'function') {
              onSuccess();
            }
          } else if (event.data && event.data.type === 'twitter-auth-error') {
            // Auth failed
            window.removeEventListener('message', messageHandler);
            
            const errorMessage = event.data.message || 'Error sharing to Twitter';
            console.error('Twitter share error:', errorMessage);
            setBackendError(`Twitter share failed: ${errorMessage}`);
          }
        };
        
        window.addEventListener('message', messageHandler);
        
        // Also handle the case where user closes the popup without completing auth
        const checkPopupClosed = setInterval(() => {
          if (!popup || popup.closed) {
            clearInterval(checkPopupClosed);
            window.removeEventListener('message', messageHandler);
            if (!authCompleted) {
              setBackendError({
                type: 'auth_cancelled',
                title: 'Twitter Authorization Cancelled',
                message: 'The Twitter authorization window was closed before completion.',
                canRetry: true
              });
            }
          }
        }, 1000);

      } catch (error) {
        console.error('Error in shareToTwitter:', error);
        
        // For network errors, retry if possible
        if ((error.name === 'TypeError' || error.message.includes('Failed to fetch')) && retries < maxRetries) {
          retries++;
          console.log(`Network error, retrying Twitter share (${retries}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retrying
          return attemptShare();
        }
        
        setBackendError(`Client-side error initiating share: ${error.message}`);
      }
    };
    
    // Start the share process
    await attemptShare();
  } catch (error) {
    console.error('Failed to create image for sharing:', error);
    setBackendError(`Failed to prepare image for sharing: ${error.message}`);
  }
};

export default {
  shareToTwitter,
  getPhotoHashtag
}; 