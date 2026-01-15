/**
 * Video Converter Utility
 * 
 * Uses ffmpeg.wasm to convert WebM videos to MP4 format for better compatibility
 * with backend video processing (ComfyUI animate-move/replace workflows).
 * 
 * Works on:
 * - Desktop browsers (Chrome, Firefox, Safari, Edge)
 * - Mobile browsers (iOS Safari, Android Chrome)
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// Singleton FFmpeg instance
let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;
let isLoaded = false;

// Base URL for ffmpeg core files (using unpkg CDN for reliability)
const FFMPEG_CORE_VERSION = '0.12.10';
const FFMPEG_BASE_URL = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

/**
 * Check if the browser supports SharedArrayBuffer (needed for multi-threaded ffmpeg)
 * iOS Safari and some other browsers don't support it
 */
function supportsSharedArrayBuffer(): boolean {
  try {
    return typeof SharedArrayBuffer !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Initialize and load FFmpeg
 * Uses single-threaded version for maximum compatibility (especially iOS)
 */
async function loadFFmpeg(): Promise<void> {
  if (isLoaded && ffmpeg) {
    return;
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    try {
      ffmpeg = new FFmpeg();

      // Set up progress logging
      ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg]', message);
      });

      ffmpeg.on('progress', ({ progress, time }) => {
        console.log(`[FFmpeg] Progress: ${Math.round(progress * 100)}% (time: ${time})`);
      });

      // Load the core - use single-threaded for maximum compatibility
      // Multi-threaded requires SharedArrayBuffer which isn't available on iOS Safari
      const useMultiThread = supportsSharedArrayBuffer();
      
      console.log(`[FFmpeg] Loading ${useMultiThread ? 'multi-threaded' : 'single-threaded'} core...`);
      
      // Add timeout to load operation
      const loadTimeout = 30000; // 30 second timeout for loading FFmpeg
      const loadWithTimeout = new Promise<void>(async (resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('FFmpeg load timeout after 30 seconds'));
        }, loadTimeout);

        try {
          if (!ffmpeg) {
            throw new Error('FFmpeg instance not initialized');
          }
          
          if (useMultiThread) {
            // Multi-threaded (faster, but not available on iOS)
            await ffmpeg.load({
              coreURL: await toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
              wasmURL: await toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
              workerURL: await toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.worker.js`, 'text/javascript'),
            });
          } else {
            // Single-threaded (works everywhere including iOS)
            await ffmpeg.load({
              coreURL: await toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
              wasmURL: await toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
            });
          }
          clearTimeout(timeout);
          resolve();
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      });

      await loadWithTimeout;

      isLoaded = true;
      console.log('[FFmpeg] Core loaded successfully');
    } catch (error) {
      console.error('[FFmpeg] Failed to load:', error);
      ffmpeg = null;
      loadPromise = null;
      isLoaded = false;
      throw error;
    }
  })();

  return loadPromise;
}

/**
 * Convert a WebM video blob to MP4 format
 * 
 * @param webmBlob - The WebM video blob from MediaRecorder
 * @param onProgress - Optional callback for progress updates (0-100)
 * @returns Promise<Blob> - The converted MP4 blob
 */
export async function convertWebMToMP4(
  webmBlob: Blob,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  console.log(`[VideoConverter] Converting WebM (${(webmBlob.size / 1024 / 1024).toFixed(2)} MB) to MP4...`);
  const startTime = Date.now();

  try {
    // Load FFmpeg if not already loaded
    await loadFFmpeg();

    if (!ffmpeg) {
      throw new Error('FFmpeg failed to initialize');
    }

    // Set up progress callback
    if (onProgress) {
      ffmpeg.on('progress', ({ progress }) => {
        onProgress(Math.round(progress * 100));
      });
    }

    // Write the WebM file to FFmpeg's virtual filesystem
    const inputFileName = 'input.webm';
    const outputFileName = 'output.mp4';

    await ffmpeg.writeFile(inputFileName, await fetchFile(webmBlob));

    // Convert WebM to MP4 with settings optimized for:
    // 1. Maximum compatibility (H.264 baseline profile)
    // 2. Reasonable quality
    // 3. Fast encoding
    // 4. Proper frame timing (crucial for animate-move/replace)
    await ffmpeg.exec([
      '-i', inputFileName,
      // Video codec: H.264 with baseline profile for max compatibility
      '-c:v', 'libx264',
      '-profile:v', 'baseline',
      '-level', '3.0',
      // Preset: fast encoding (ultrafast would be faster but larger file)
      '-preset', 'fast',
      // CRF: Quality setting (18-28 is good, lower = better quality)
      '-crf', '23',
      // Pixel format: yuv420p for maximum compatibility
      '-pix_fmt', 'yuv420p',
      // Audio codec: AAC for compatibility
      '-c:a', 'aac',
      '-b:a', '128k',
      // Force constant frame rate (important for animate workflows!)
      '-r', '30',
      // Ensure proper timestamps
      '-vsync', 'cfr',
      // Movflags for web playback
      '-movflags', '+faststart',
      // Output
      outputFileName
    ]);

    // Read the converted file
    const data = await ffmpeg.readFile(outputFileName);
    // Convert FileData to ArrayBuffer for Blob constructor (handles SharedArrayBuffer case)
    const arrayBuffer = data instanceof Uint8Array 
      ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      : data;
    const mp4Blob = new Blob([new Uint8Array(arrayBuffer as ArrayBuffer)], { type: 'video/mp4' });

    // Clean up
    await ffmpeg.deleteFile(inputFileName);
    await ffmpeg.deleteFile(outputFileName);

    const elapsed = Date.now() - startTime;
    console.log(`[VideoConverter] Conversion complete in ${(elapsed / 1000).toFixed(1)}s - MP4 size: ${(mp4Blob.size / 1024 / 1024).toFixed(2)} MB`);

    return mp4Blob;
  } catch (error) {
    console.error('[VideoConverter] Conversion failed:', error);
    throw error;
  }
}

/**
 * Check if a blob is a WebM video
 */
export function isWebMBlob(blob: Blob): boolean {
  return blob.type.includes('webm');
}

/**
 * Check if video conversion is supported in this browser
 */
export function isConversionSupported(): boolean {
  // WebAssembly is required
  if (typeof WebAssembly !== 'object') {
    return false;
  }
  // Check for basic APIs needed
  if (typeof Blob !== 'function' || typeof URL !== 'function') {
    return false;
  }
  return true;
}

/**
 * Preload FFmpeg core (call early to reduce wait time during recording)
 */
export async function preloadFFmpeg(): Promise<boolean> {
  try {
    await loadFFmpeg();
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert video if needed (WebM to MP4) or return original if already MP4
 */
export async function ensureMP4Format(
  blob: Blob,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  // If already MP4, return as-is
  if (blob.type.includes('mp4')) {
    console.log('[VideoConverter] Already MP4, no conversion needed');
    return blob;
  }

  // If WebM, convert to MP4
  if (isWebMBlob(blob)) {
    return convertWebMToMP4(blob, onProgress);
  }

  // For other formats, try to convert
  console.log(`[VideoConverter] Unknown format (${blob.type}), attempting conversion...`);
  return convertWebMToMP4(blob, onProgress);
}
