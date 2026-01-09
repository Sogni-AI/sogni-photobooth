/**
 * Video Frame Extraction Utility
 *
 * Extracts frames from videos using HTML5 Canvas
 * Works entirely client-side without backend dependencies
 */

/**
 * Extract a frame from a video at a specific time
 * @param {string} videoUrl - URL of the video (can be blob: or https:)
 * @param {number|'first'|'last'} targetTime - Time in seconds, or 'first'/'last' for convenience
 * @returns {Promise<{buffer: Uint8Array, width: number, height: number}>}
 */
export async function extractFrameAtTime(videoUrl, targetTime = 'last') {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    let resolved = false;

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onMetadataLoaded);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      video.src = '';
      video.load();
    };

    const onError = (e) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(new Error(`Failed to load video: ${e.message || 'Unknown error'}`));
    };

    const onSeeked = () => {
      if (resolved) return;
      resolved = true;

      try {
        const canvas = document.createElement('canvas');
        const width = video.videoWidth;
        const height = video.videoHeight;

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, width, height);

        // Convert canvas to PNG blob
        canvas.toBlob((blob) => {
          cleanup();

          if (!blob) {
            reject(new Error('Failed to convert frame to blob'));
            return;
          }

          blob.arrayBuffer().then(arrayBuffer => {
            const buffer = new Uint8Array(arrayBuffer);
            resolve({ buffer, width, height });
          }).catch(err => {
            reject(new Error(`Failed to read frame buffer: ${err.message}`));
          });
        }, 'image/png');
      } catch (err) {
        cleanup();
        reject(new Error(`Failed to capture frame: ${err.message}`));
      }
    };

    const onMetadataLoaded = () => {
      let seekTime;
      if (targetTime === 'first') {
        // First frame - seek to very beginning
        seekTime = 0.001; // Small offset to ensure frame is rendered
      } else if (targetTime === 'last') {
        // Last frame - seek to end minus small delta
        seekTime = Math.max(0, video.duration - 0.001);
      } else {
        // Specific time
        seekTime = Math.max(0, Math.min(targetTime, video.duration - 0.001));
      }
      video.currentTime = seekTime;
    };

    video.addEventListener('loadedmetadata', onMetadataLoaded);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);

    // Set a timeout in case video never loads
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error('Video load timeout'));
      }
    }, 30000); // 30 second timeout

    video.src = videoUrl;
    video.load();
  });
}

/**
 * Extract the last frame from a video URL
 * @param {string} videoUrl - URL of the video (can be blob: or https:)
 * @returns {Promise<{buffer: Uint8Array, width: number, height: number}>}
 */
export async function extractLastFrame(videoUrl) {
  return extractFrameAtTime(videoUrl, 'last');
}

/**
 * Extract the first frame from a video URL
 * @param {string} videoUrl - URL of the video (can be blob: or https:)
 * @returns {Promise<{buffer: Uint8Array, width: number, height: number}>}
 */
export async function extractFirstFrame(videoUrl) {
  return extractFrameAtTime(videoUrl, 'first');
}

/**
 * Extract frames from multiple videos in parallel (with concurrency limit)
 * @param {string[]} videoUrls - Array of video URLs
 * @param {Function} onProgress - Progress callback (current, total)
 * @param {number} concurrency - Max concurrent extractions
 * @returns {Promise<Array<{buffer: Uint8Array, width: number, height: number}>>}
 */
export async function extractFramesFromVideos(videoUrls, onProgress = null, concurrency = 2) {
  const results = new Array(videoUrls.length);
  let completed = 0;

  // Process in batches with limited concurrency
  const processQueue = async () => {
    const queue = [...videoUrls.map((url, index) => ({ url, index }))];

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
      workers.push((async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (!item) break;

          try {
            const frame = await extractLastFrame(item.url);
            results[item.index] = frame;
          } catch (error) {
            console.error(`Failed to extract frame from video ${item.index + 1}:`, error);
            results[item.index] = null;
          }

          completed++;
          if (onProgress) {
            onProgress(completed, videoUrls.length);
          }
        }
      })());
    }

    await Promise.all(workers);
  };

  await processQueue();
  return results;
}

