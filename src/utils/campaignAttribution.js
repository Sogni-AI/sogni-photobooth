/**
 * Campaign Attribution System
 * Tracks user source (Gimi Challenge, etc.) for conversion analytics
 */

const CAMPAIGN_SOURCE_KEY = 'sogni_campaign_source';
const CAMPAIGN_TIMESTAMP_KEY = 'sogni_campaign_timestamp';
const ATTRIBUTION_EXPIRY_DAYS = 30; // 30-day attribution window

/**
 * Set campaign source when user arrives from a campaign
 * @param {string} source - Campaign source (e.g., 'gimi-challenge', 'gimi-notification')
 */
export function setCampaignSource(source) {
  try {
    localStorage.setItem(CAMPAIGN_SOURCE_KEY, source);
    localStorage.setItem(CAMPAIGN_TIMESTAMP_KEY, Date.now().toString());
    console.log(`[Campaign] Source set: ${source}`);
  } catch (error) {
    console.error('[Campaign] Failed to set source:', error);
  }
}

/**
 * Get current campaign source if within attribution window
 * @returns {string|null} Campaign source or null if expired/not set
 */
export function getCampaignSource() {
  try {
    const source = localStorage.getItem(CAMPAIGN_SOURCE_KEY);
    const timestamp = localStorage.getItem(CAMPAIGN_TIMESTAMP_KEY);
    
    if (!source || !timestamp) {
      return null;
    }
    
    // Check if attribution has expired
    const timeSinceAttribution = Date.now() - parseInt(timestamp, 10);
    const expiryMs = ATTRIBUTION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    
    if (timeSinceAttribution > expiryMs) {
      // Attribution expired, clear it
      clearCampaignSource();
      return null;
    }
    
    return source;
  } catch (error) {
    console.error('[Campaign] Failed to get source:', error);
    return null;
  }
}

/**
 * Clear campaign source
 */
export function clearCampaignSource() {
  try {
    localStorage.removeItem(CAMPAIGN_SOURCE_KEY);
    localStorage.removeItem(CAMPAIGN_TIMESTAMP_KEY);
  } catch (error) {
    console.error('[Campaign] Failed to clear source:', error);
  }
}

/**
 * Check if user came from Gimi Challenge
 * @returns {boolean}
 */
export function isFromGimiChallenge() {
  const source = getCampaignSource();
  return source === 'gimi-challenge' || source === 'gimi-notification';
}

