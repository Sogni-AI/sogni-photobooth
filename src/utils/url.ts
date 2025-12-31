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

    // Check if the response status is NOT 404
    return response.status !== 404;
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

