/**
 * S3 Fetch with CORS Fallback
 *
 * Fetches S3 URLs directly first, then falls back to backend proxy if CORS errors occur.
 *
 * Problem: AWS S3 signed URLs work individually but randomly fail with CORS errors
 * when multiple requests are made concurrently from the browser.
 *
 * Solution:
 * 1. Try direct fetch first (faster, no backend load)
 * 2. On CORS failure, retry with 1-3 second random jitter (breaks lockstep retries)
 * 3. After 2-3 direct failures, fall back to backend proxy (100% reliable)
 */

import urls from '../config/urls';

// S3 domains that may have CORS issues with concurrent requests
const S3_DOMAINS = [
  'complete-images-production.s3-accelerate.amazonaws.com',
  'complete-images-staging.s3-accelerate.amazonaws.com',
  'complete-images-production.s3.amazonaws.com',
  'complete-images-staging.s3.amazonaws.com',
];

// Configuration
const MAX_DIRECT_ATTEMPTS = 2;
const MIN_JITTER_MS = 1000;
const MAX_JITTER_MS = 3000;

/**
 * Check if a URL is an S3 URL that might have CORS issues
 */
export function isS3Url(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return S3_DOMAINS.some(domain => urlObj.hostname.includes(domain));
  } catch {
    return false;
  }
}

/**
 * Get the proxied URL for S3 resources
 */
export function getProxiedUrl(url: string): string {
  return `${urls.apiUrl}/api/sogni/proxy-image?url=${encodeURIComponent(url)}`;
}

/**
 * Check if an error is a CORS error
 */
function isCorsError(error: unknown): boolean {
  if (error instanceof TypeError) {
    // "Failed to fetch" typically indicates CORS or network error
    return error.message.includes('Failed to fetch') ||
           error.message.includes('NetworkError') ||
           error.message.includes('CORS');
  }
  return false;
}

/**
 * Generate random jitter between MIN and MAX milliseconds
 */
function getRandomJitter(): number {
  return MIN_JITTER_MS + Math.random() * (MAX_JITTER_MS - MIN_JITTER_MS);
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch an S3 URL with automatic CORS fallback to proxy
 *
 * @param url - The S3 URL to fetch
 * @param options - Optional fetch options
 * @returns Response from either direct fetch or proxy
 */
export async function fetchS3WithFallback(
  url: string,
  options?: RequestInit
): Promise<Response> {
  // If not an S3 URL, just fetch directly
  if (!isS3Url(url)) {
    return fetch(url, options);
  }

  let lastError: unknown;

  // Try direct fetch with retries
  for (let attempt = 1; attempt <= MAX_DIRECT_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      // Non-OK response but not CORS - throw to handle below
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error;

      if (isCorsError(error)) {
        console.warn(
          `[S3Fetch] CORS error on attempt ${attempt}/${MAX_DIRECT_ATTEMPTS} for ${url.slice(0, 80)}...`
        );

        // If more attempts remain, wait with jitter before retrying
        if (attempt < MAX_DIRECT_ATTEMPTS) {
          const jitter = getRandomJitter();
          console.log(`[S3Fetch] Waiting ${Math.round(jitter)}ms before retry...`);
          await sleep(jitter);
        }
      } else {
        // Non-CORS error - don't retry, throw immediately
        throw error;
      }
    }
  }

  // All direct attempts failed with CORS - fall back to proxy
  console.log(`[S3Fetch] Falling back to proxy after ${MAX_DIRECT_ATTEMPTS} CORS failures`);

  try {
    const proxyUrl = getProxiedUrl(url);
    const response = await fetch(proxyUrl, options);
    if (!response.ok) {
      throw new Error(`Proxy fetch failed: ${response.status} ${response.statusText}`);
    }
    return response;
  } catch (proxyError) {
    console.error(`[S3Fetch] Proxy also failed:`, proxyError);
    // Throw the original error if proxy also fails
    throw lastError;
  }
}

/**
 * Fetch an S3 URL and return as Blob with automatic CORS fallback
 *
 * @param url - The S3 URL to fetch
 * @returns Blob of the fetched content
 */
export async function fetchS3AsBlob(url: string): Promise<Blob> {
  const response = await fetchS3WithFallback(url);
  return response.blob();
}

/**
 * Fetch an S3 URL and return as ArrayBuffer with automatic CORS fallback
 *
 * @param url - The S3 URL to fetch
 * @returns ArrayBuffer of the fetched content
 */
export async function fetchS3AsArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetchS3WithFallback(url);
  return response.arrayBuffer();
}
