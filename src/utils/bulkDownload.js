import JSZip from 'jszip';
import { isMobile, fetchWithRetry } from './index';

/**
 * Downloads multiple images as a ZIP file
 * @param {Array} images - Array of image objects with {url, filename} properties
 * @param {string} zipFilename - Name for the output ZIP file
 * @param {Function} onProgress - Callback for progress updates (current, total, message)
 * @returns {Promise<boolean>} - Success status
 */
export async function downloadImagesAsZip(images, zipFilename = 'sogni-photobooth-images.zip', onProgress = null) {
  try {
    if (!images || images.length === 0) {
      console.warn('No images to download');
      return false;
    }

    const zip = new JSZip();
    const totalImages = images.length;

    // Report initial progress
    if (onProgress) {
      onProgress(0, totalImages, 'Starting download preparation...');
    }

    // Add each image to the ZIP
    for (let i = 0; i < images.length; i++) {
      const image = images[i];

      try {
        if (onProgress) {
          onProgress(i, totalImages, `Adding image ${i + 1} of ${totalImages}...`);
        }

        // Fetch the image as a blob with retry for transient CORS errors
        const response = await fetchWithRetry(image.url, undefined, {
          context: `Image ${i + 1} Download`,
          maxRetries: 2,
          initialDelay: 1000
        });
        if (!response.ok) {
          console.warn(`Failed to fetch image ${i + 1}: ${image.filename}`);
          continue;
        }

        const blob = await response.blob();

        // Add to ZIP with the specified filename
        zip.file(image.filename, blob);

      } catch (error) {
        console.error(`Error adding image ${i + 1} to ZIP:`, error);
        // Continue with other images even if one fails
      }
    }

    // Generate the ZIP file
    if (onProgress) {
      onProgress(totalImages, totalImages, 'Generating ZIP file...');
    }

    const zipBlob = await zip.generateAsync(
      {
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
          level: 6 // Balance between size and speed (1-9)
        }
      },
      (metadata) => {
        // Report compression progress
        if (onProgress && metadata.percent) {
          onProgress(
            totalImages,
            totalImages,
            `Compressing... ${Math.round(metadata.percent)}%`
          );
        }
      }
    );

    // Download the ZIP file
    if (onProgress) {
      onProgress(totalImages, totalImages, 'Downloading ZIP file...');
    }

    const blobUrl = URL.createObjectURL(zipBlob);

    if (isMobile()) {
      // For mobile, open the ZIP file in a new tab/window
      // This allows the user to use the browser's native download functionality
      window.open(blobUrl, '_blank');
    } else {
      // For desktop, trigger automatic download
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = zipFilename;
      link.style.display = 'none';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    // Clean up blob URL after a delay
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 1000);

    if (onProgress) {
      onProgress(totalImages, totalImages, 'Download complete!');
    }

    return true;

  } catch (error) {
    console.error('Error creating ZIP file:', error);
    if (onProgress) {
      onProgress(0, 0, `Error: ${error.message}`);
    }
    return false;
  }
}

/**
 * Prepares image data from photos array for bulk download
 * @param {Array} photos - Array of photo objects from PhotoGallery
 * @param {number} selectedSubIndex - Currently selected sub-image index
 * @param {boolean} includeFrames - Whether to include framed versions (if available)
 * @param {Object} framedImageUrls - Map of framed image URLs
 * @param {Function} getStyleDisplayText - Function to get style display text
 * @param {string} outputFormat - Output format preference ('jpg' or 'png')
 * @returns {Array} - Array of {url, filename} objects
 */
export function preparePhotosForBulkDownload(
  photos,
  selectedSubIndex = 0,
  includeFrames = false,
  framedImageUrls = {},
  getStyleDisplayText = null,
  outputFormat = 'jpg'
) {
  const images = [];
  const filenameCount = {}; // Track how many times each base filename is used

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];

    // Skip photos that are still loading or have errors
    if (photo.loading || photo.generating || photo.error || !photo.images || photo.images.length === 0) {
      continue;
    }

    // Get the image URL (handle enhanced images)
    const currentSubIndex = photo.enhanced && photo.enhancedImageUrl
      ? -1 // Special case for enhanced images
      : selectedSubIndex;

    let imageUrl = currentSubIndex === -1
      ? photo.enhancedImageUrl
      : photo.images[currentSubIndex];

    // If frames are requested and available, use framed version
    if (includeFrames && framedImageUrls) {
      const frameKey = `${i}-${currentSubIndex}`;
      if (framedImageUrls[frameKey]) {
        imageUrl = framedImageUrls[frameKey];
      }
    }

    if (!imageUrl) continue;

    // Generate filename
    const styleDisplayText = getStyleDisplayText ? getStyleDisplayText(photo) : '';
    const cleanStyleName = styleDisplayText
      ? styleDisplayText.toLowerCase().replace(/\s+/g, '-')
      : 'sogni';

    const fileExtension = outputFormat === 'png' ? '.png' : '.jpg';
    const frameType = includeFrames ? '-framed' : '';
    const baseFilename = `sogni-photobooth-${cleanStyleName}${frameType}`;
    
    // Track duplicate filenames and append counter if needed
    if (!filenameCount[baseFilename]) {
      filenameCount[baseFilename] = 1;
    } else {
      filenameCount[baseFilename]++;
    }
    
    // Only add counter if there are duplicates
    const filename = filenameCount[baseFilename] > 1
      ? `${baseFilename}-${filenameCount[baseFilename]}${fileExtension}`
      : `${baseFilename}${fileExtension}`;

    images.push({
      url: imageUrl,
      filename: filename,
      photoIndex: i,
      styleId: photo.styleId
    });
  }

  return images;
}

/**
 * Downloads multiple videos as a ZIP file
 * @param {Array} videos - Array of video objects with {url, filename} properties
 * @param {string} zipFilename - Name for the output ZIP file
 * @param {Function} onProgress - Callback for progress updates (current, total, message)
 * @returns {Promise<boolean>} - Success status
 */
export async function downloadVideosAsZip(videos, zipFilename = 'sogni-photobooth-videos.zip', onProgress = null) {
  try {
    if (!videos || videos.length === 0) {
      console.warn('No videos to download');
      return false;
    }

    const zip = new JSZip();
    const totalVideos = videos.length;

    // Report initial progress
    if (onProgress) {
      onProgress(0, totalVideos, 'Starting video download preparation...');
    }

    // Add each video to the ZIP
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];

      try {
        if (onProgress) {
          onProgress(i, totalVideos, `Adding video ${i + 1} of ${totalVideos}...`);
        }

        // Fetch the video as a blob with retry for transient CORS errors
        const response = await fetchWithRetry(video.url, undefined, {
          context: `Video ${i + 1} Download`,
          maxRetries: 2,
          initialDelay: 1000
        });
        if (!response.ok) {
          console.warn(`Failed to fetch video ${i + 1}: ${video.filename}`);
          continue;
        }

        const blob = await response.blob();

        // Add to ZIP with the specified filename
        zip.file(video.filename, blob);

      } catch (error) {
        console.error(`Error adding video ${i + 1} to ZIP:`, error);
        // Continue with other videos even if one fails
      }
    }

    // Generate the ZIP file
    if (onProgress) {
      onProgress(totalVideos, totalVideos, 'Generating ZIP file...');
    }

    const zipBlob = await zip.generateAsync(
      {
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
          level: 6 // Balance between size and speed (1-9)
        }
      },
      (metadata) => {
        // Report compression progress
        if (onProgress && metadata.percent) {
          onProgress(
            totalVideos,
            totalVideos,
            `Compressing... ${Math.round(metadata.percent)}%`
          );
        }
      }
    );

    // Download the ZIP file
    if (onProgress) {
      onProgress(totalVideos, totalVideos, 'Downloading ZIP file...');
    }

    const blobUrl = URL.createObjectURL(zipBlob);

    if (isMobile()) {
      // For mobile, open the ZIP file in a new tab/window
      window.open(blobUrl, '_blank');
    } else {
      // For desktop, trigger automatic download
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = zipFilename;
      link.style.display = 'none';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    // Clean up blob URL after a delay
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 1000);

    if (onProgress) {
      onProgress(totalVideos, totalVideos, 'Download complete!');
    }

    return true;

  } catch (error) {
    console.error('Error creating video ZIP file:', error);
    if (onProgress) {
      onProgress(0, 0, `Error: ${error.message}`);
    }
    return false;
  }
}

