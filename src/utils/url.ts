/**
 * Check if a URL exists (returns true if status is NOT 404)
 * Similar to sogni-web implementation
 */
export async function checkIfUrlExists(url: string): Promise<boolean> {
  try {
    // Use GET request to check if URL is accessible
    // HEAD might not work due to CORS, so we use GET
    const response = await fetch(url, {
      method: 'GET'
    });

    // Only treat 2xx responses as valid (not 403, 500, etc.)
    return response.ok;
  } catch (error) {
    // A network error or CORS issue might land here
    console.error('Fetch failed or CORS issue:', error);
    return false;
  }
}

/**
 * Check if an image URL is accessible
 */
export function checkImageURL(url: string): Promise<boolean> {
  return checkIfUrlExists(url);
}

/**
 * Check if a video URL is accessible
 */
export function checkVideoURL(url: string): Promise<boolean> {
  return checkIfUrlExists(url);
}

/**
 * Extract file extension from a presigned S3 URL's path.
 * E.g. "https://bucket.s3.amazonaws.com/video/2026-02-16/ID/complete-ID.mp3?X-Amz-..." → "mp3"
 */
export function getExtensionFromUrl(url: string, fallback = 'bin'): string {
  try {
    const pathname = new URL(url).pathname;
    const lastDot = pathname.lastIndexOf('.');
    if (lastDot === -1) return fallback;
    return pathname.substring(lastDot + 1);
  } catch {
    return fallback;
  }
}

