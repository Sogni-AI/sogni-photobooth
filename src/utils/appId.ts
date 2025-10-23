/**
 * Generate and persist a UUID for this browser/app installation
 * This appId represents the Photobooth app installation, not the user
 * It persists across user logins/logouts
 * 
 * Uses different localStorage keys per environment to avoid conflicts
 */

/**
 * Get the environment-specific app ID key
 */
function getAppIdKey(): string {
  const hostname = window.location.hostname;
  
  if (hostname === 'photobooth.sogni.ai') {
    return 'sogni-appId-production';
  } else if (hostname.includes('staging')) {
    return 'sogni-appId-staging';
  } else if (hostname === 'photobooth-local.sogni.ai') {
    return 'sogni-appId-local';
  } else {
    // localhost or other development
    return 'sogni-appId-dev';
  }
}

/**
 * Get or create the persistent app ID for this browser
 * This MUST be a valid UUID v4 format
 */
export function getOrCreateAppId(): string {
  const APP_ID_KEY = getAppIdKey();
  
  // Check localStorage first
  let appId = localStorage.getItem(APP_ID_KEY);
  
  if (!appId) {
    // Generate new UUID v4 (must be valid UUID format for Sogni API)
    appId = window.crypto.randomUUID();
    localStorage.setItem(APP_ID_KEY, appId);
    console.log('🆔 Generated new app ID:', appId, 'for', APP_ID_KEY);
  } else {
    console.log('🆔 Using existing app ID:', appId);
  }
  
  return appId;
}

/**
 * Clear the app ID (only use for testing/debugging)
 */
export function clearAppId(): void {
  const APP_ID_KEY = getAppIdKey();
  localStorage.removeItem(APP_ID_KEY);
  console.log('🆔 Cleared app ID for', APP_ID_KEY);
}

