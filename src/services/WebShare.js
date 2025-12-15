/**
 * WebShare.js
 * Service for handling Web Share API functionality
 */
import { createPolaroidImage } from '../utils/imageProcessing';

/**
 * Generic share using Web Share API
 * Works on mobile and some desktop browsers (like Safari on Mac)
 * 
 * @param {Object} params - Parameters for sharing
 * @param {number} params.photoIndex - Index of the photo to share
 * @param {Array} params.photos - Array of photo objects
 * @param {Function} params.setBackendError - Function to update backend error state
 * @param {string} [params.tezdevTheme='off'] - TezDev theme or 'off'
 * @param {string} [params.aspectRatio] - Aspect ratio of the image
 * @param {string} [params.outputFormat='png'] - Output format ('png' or 'jpg')
 * @param {boolean} [params.sogniWatermark=true] - Whether to include Sogni watermark
 * @param {number} [params.sogniWatermarkSize=100] - Size of the QR watermark
 * @param {number} [params.sogniWatermarkMargin=26] - Margin of the QR watermark from edge
 * @returns {Promise<void>}
 */
export const shareViaWebShare = async ({
  photoIndex,
  photos,
  setBackendError,
  tezdevTheme = 'off',
  aspectRatio = null,
  outputFormat = 'png',
  sogniWatermark = true,
  sogniWatermarkSize = 100,
  sogniWatermarkMargin = 26,
}) => {
  if (photoIndex === null || !photos[photoIndex] || !photos[photoIndex].images || !photos[photoIndex].images[0]) {
    console.error('No image selected or image URL is missing for sharing.');
    setBackendError({
      type: 'no_image',
      title: '📷 No Image Selected',
      message: 'Please select a photo from your gallery before sharing.',
      canRetry: false
    });
    return;
  }

  const photo = photos[photoIndex];
  
  // Prioritize video over image if available
  const mediaUrl = photo.videoUrl || photo.images[0];
  const isVideo = !!photo.videoUrl;
  const photoUrl = photo.images[0]; // Keep for fallback/frame generation

  try {
    console.log(`Starting Web Share API process for ${isVideo ? 'video' : 'image'}...`);

    let shareFile;
    
    // If we have a video, share it directly
    if (isVideo) {
      console.log('Preparing video for Web Share');
      
      // Fetch the video and convert to blob
      const response = await fetch(mediaUrl);
      const blob = await response.blob();
      
      // Create a file from the blob
      const filename = `sogni-video-${Date.now()}.mp4`;
      shareFile = new File([blob], filename, { type: 'video/mp4' });
    } else {
      // Process image with frames/watermarks as before

      // Process image with frames/watermarks as before
      let framedImageUrl;

      // Web Share: Only use frame if custom theme is enabled
      if (tezdevTheme !== 'off') {
        // Custom theme - include the frame
        console.log('Creating Web Share image with custom theme frame');
        framedImageUrl = await createPolaroidImage(photoUrl, '', {
          tezdevTheme,
          aspectRatio,
          outputFormat,
          // Add QR watermark for sharing (if enabled)
          watermarkOptions: sogniWatermark ? {
            size: sogniWatermarkSize,
            margin: sogniWatermarkMargin,
            position: 'top-right',
            opacity: 1.0
          } : null
        });
      } else {
        // No custom theme - share raw image without polaroid frame
        console.log('Creating Web Share image without polaroid frame (raw image)');
        framedImageUrl = await createPolaroidImage(photoUrl, '', {
          tezdevTheme: 'off',
          aspectRatio,
          frameWidth: 0,      // No polaroid frame
          frameTopWidth: 0,   // No polaroid frame
          frameBottomWidth: 0, // No polaroid frame
          frameColor: 'transparent', // No polaroid background
          outputFormat,
          // Add QR watermark for sharing (if enabled)
          watermarkOptions: sogniWatermark ? {
            size: sogniWatermarkSize,
            margin: sogniWatermarkMargin,
            position: 'top-right',
            opacity: 1.0
          } : null
        });
      }

      // Convert data URL to blob
      const response = await fetch(framedImageUrl);
      const blob = await response.blob();
      
      // Create a file from the blob
      const filename = `sogni-photo-${Date.now()}.${outputFormat === 'jpg' ? 'jpg' : 'png'}`;
      shareFile = new File([blob], filename, { type: blob.type });
    }

    // Check if Web Share API is available and supports files
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [shareFile] })) {
      try {
        await navigator.share({
          files: [shareFile],
          title: isVideo ? 'Check out my Sogni AI video!' : 'Check out my Sogni AI photo!',
          text: 'Made with Sogni AI Photobooth ✨'
        });
        console.log('Successfully shared via Web Share API');
        // Note: Some apps (like Telegram) may not properly handle file sharing through Web Share API
        // In those cases, users should use the download button instead
        return;
      } catch (shareError) {
        // User cancelled or share failed
        if (shareError.name === 'AbortError') {
          console.log('User cancelled share');
          return;
        }
        // For other errors, log and continue silently
        // (some share targets report success even when they fail)
        console.log('Web Share completed with potential error:', shareError);
        return; // Don't show error popup - user may have successfully shared
      }
    } else {
      // Web Share API not supported
      setBackendError({
        type: 'share_not_supported',
        title: 'ℹ️ Share Not Available',
        message: 'Native sharing is not supported on this browser. Please use the download button instead.',
        canRetry: false
      });
    }
  } catch (error) {
    console.error('Error in Web Share:', error);
    setBackendError({
      type: 'share_error',
      title: '❌ Share Failed',
      message: 'Failed to share your photo. Please try downloading it instead.',
      canRetry: true
    });
  }
};

/**
 * Check if Web Share API is supported on this device
 * @returns {boolean}
 */
export const isWebShareSupported = () => {
  return typeof navigator !== 'undefined' && 
         navigator.share !== undefined && 
         navigator.canShare !== undefined;
};


