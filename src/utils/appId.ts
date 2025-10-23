/**
 * Generate and persist a UUID for this browser/app installation
 * This appId represents the Photobooth app installation, not the user
 * It persists across user logins/logouts
 * 
 * Matches the pattern used in sogni-web for consistency
 */

const APP_ID_KEY = 'sogni-appId'; // Use same key as sogni-web

/**
 * Get or create the persistent app ID for this browser
 * This MUST be a valid UUID v4 format
 */
export function getOrCreateAppId(): string {
  // Check localStorage first
  let appId = localStorage.getItem(APP_ID_KEY);
  
  if (!appId) {
    // Generate new UUID v4 (must be valid UUID format for Sogni API)
    appId = window.crypto.randomUUID();
    localStorage.setItem(APP_ID_KEY, appId);
    console.log('🆔 Generated new app ID:', appId);
  } else {
    console.log('🆔 Using existing app ID:', appId);
  }
  
  return appId;
}

/**
 * Clear the app ID (only use for testing/debugging)
 */
export function clearAppId(): void {
  localStorage.removeItem(APP_ID_KEY);
  console.log('🆔 Cleared app ID');
}

