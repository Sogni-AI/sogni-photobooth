/**
 * Referral Tracking System for Gimi Challenge
 * Manages cookies for tracking Gimi Challenge visits and user referrals
 */

const GIMI_VISIT_COOKIE = 'sogni_gimi_visit';
const GIMI_DISMISS_COOKIE = 'sogni_gimi_dismissed';
const REFERRAL_SOURCE_COOKIE = 'sogni_referral_source';
const REFERRAL_TIMESTAMP_COOKIE = 'sogni_referral_timestamp';
const ATTRIBUTION_EXPIRY_DAYS = 30; // 30-day attribution window

/**
 * Mark that user visited the Gimi Challenge page
 */
export function markGimiChallengeVisit() {
  try {
    localStorage.setItem(GIMI_VISIT_COOKIE, Date.now().toString());
    console.log('[Referral] Gimi Challenge visit tracked');
  } catch (error) {
    console.error('[Referral] Failed to mark Gimi visit:', error);
  }
}

/**
 * Check if user has visited the Gimi Challenge page
 * @returns {boolean}
 */
export function hasVisitedGimiChallenge() {
  try {
    return localStorage.getItem(GIMI_VISIT_COOKIE) !== null;
  } catch (error) {
    console.error('[Referral] Failed to check Gimi visit:', error);
    return false;
  }
}

/**
 * Mark that user dismissed the Gimi referral popup
 */
export function markGimiPopupDismissed() {
  try {
    localStorage.setItem(GIMI_DISMISS_COOKIE, Date.now().toString());
    console.log('[Referral] Gimi popup dismissal tracked');
  } catch (error) {
    console.error('[Referral] Failed to mark popup dismissed:', error);
  }
}

/**
 * Check if user has dismissed the Gimi referral popup
 * @returns {boolean}
 */
export function hasGimiPopupBeenDismissed() {
  try {
    return localStorage.getItem(GIMI_DISMISS_COOKIE) !== null;
  } catch (error) {
    console.error('[Referral] Failed to check popup dismissal:', error);
    return false;
  }
}

/**
 * Clear the Gimi visit cookie (used after showing popup)
 */
export function clearGimiVisitCookie() {
  try {
    localStorage.removeItem(GIMI_VISIT_COOKIE);
    console.log('[Referral] Gimi visit cookie cleared');
  } catch (error) {
    console.error('[Referral] Failed to clear Gimi visit cookie:', error);
  }
}

/**
 * Set referral source when user arrives with referral parameter
 * @param {string} referralUsername - Username of the referring user
 */
export function setReferralSource(referralUsername) {
  try {
    localStorage.setItem(REFERRAL_SOURCE_COOKIE, referralUsername);
    localStorage.setItem(REFERRAL_TIMESTAMP_COOKIE, Date.now().toString());
    console.log(`[Referral] Referral source set: ${referralUsername}`);
  } catch (error) {
    console.error('[Referral] Failed to set referral source:', error);
  }
}

/**
 * Get current referral source if within attribution window
 * @returns {string|null} Referring username or null if expired/not set
 */
export function getReferralSource() {
  try {
    const source = localStorage.getItem(REFERRAL_SOURCE_COOKIE);
    const timestamp = localStorage.getItem(REFERRAL_TIMESTAMP_COOKIE);
    
    if (!source || !timestamp) {
      return null;
    }
    
    // Check if attribution has expired
    const timeSinceAttribution = Date.now() - parseInt(timestamp, 10);
    const expiryMs = ATTRIBUTION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    
    if (timeSinceAttribution > expiryMs) {
      // Attribution expired, clear it
      clearReferralSource();
      return null;
    }
    
    return source;
  } catch (error) {
    console.error('[Referral] Failed to get referral source:', error);
    return null;
  }
}

/**
 * Clear referral source (used after conversion)
 */
export function clearReferralSource() {
  try {
    localStorage.removeItem(REFERRAL_SOURCE_COOKIE);
    localStorage.removeItem(REFERRAL_TIMESTAMP_COOKIE);
    console.log('[Referral] Referral source cleared');
  } catch (error) {
    console.error('[Referral] Failed to clear referral source:', error);
  }
}

/**
 * Check if user should see the Gimi referral popup
 * @returns {boolean}
 */
export function shouldShowGimiReferralPopup() {
  // First check basic conditions
  if (!hasVisitedGimiChallenge() || hasGimiPopupBeenDismissed()) {
    return false;
  }

  // Check if any Gimi popup was dismissed this session
  try {
    const dismissedThisSession = sessionStorage.getItem('gimi-popup-dismissed-session');
    if (dismissedThisSession === 'true') {
      console.log('[Referral] Popup blocked - dismissed this session');
      return false;
    }
  } catch (error) {
    console.error('[Referral] Failed to check session dismissal:', error);
  }

  // Check 60-second cooldown for ANY Gimi popup (notification or referral)
  try {
    const lastGimiPopupTime = localStorage.getItem('gimi-last-popup-time');
    if (lastGimiPopupTime) {
      const timeSinceLastPopup = Date.now() - parseInt(lastGimiPopupTime, 10);
      const sixtySeconds = 60 * 1000;
      
      if (timeSinceLastPopup < sixtySeconds) {
        console.log('[Referral] Popup blocked - 60s cooldown active');
        return false;
      }
    }
  } catch (error) {
    console.error('[Referral] Failed to check popup cooldown:', error);
  }

  return true;
}

