/**
 * Utility functions for tracking visitor status using cookies
 */

const VISITOR_COOKIE_NAME = 'sogni_has_visited';
const LOGGED_IN_VISIT_COUNT_KEY = 'sogni_logged_in_visit_count';
const SHOWN_PROJECTS_TOOLTIP_KEY = 'sogni_shown_projects_tooltip';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

/**
 * Check if the user has visited before by looking for the visitor cookie
 */
export function hasVisitedBefore(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  const cookies = document.cookie.split(';');
  return cookies.some(cookie => {
    const [name] = cookie.trim().split('=');
    return name === VISITOR_COOKIE_NAME;
  });
}

/**
 * Mark the current user as having visited by setting a cookie
 */
export function markAsVisited(): void {
  if (typeof document === 'undefined') {
    return;
  }

  // Set cookie with 1 year expiration
  document.cookie = `${VISITOR_COOKIE_NAME}=true; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
}

/**
 * Get the appropriate button text based on visitor status
 * Returns "Signup" for first-time visitors, "Login" for returning visitors
 */
export function getAuthButtonText(): string {
  return hasVisitedBefore() ? 'Login' : 'Signup';
}

/**
 * Get the appropriate modal mode based on visitor status
 * Returns "signup" for first-time visitors, "login" for returning visitors
 */
export function getDefaultModalMode(): 'login' | 'signup' {
  return hasVisitedBefore() ? 'login' : 'signup';
}

/**
 * Increment the logged-in visit count and return the new count
 * This tracks how many times a user has visited while authenticated
 */
export function incrementLoggedInVisitCount(): number {
  if (typeof localStorage === 'undefined') {
    return 1;
  }

  const currentCount = parseInt(localStorage.getItem(LOGGED_IN_VISIT_COUNT_KEY) || '0', 10);
  const newCount = currentCount + 1;
  localStorage.setItem(LOGGED_IN_VISIT_COUNT_KEY, newCount.toString());
  
  return newCount;
}

/**
 * Get the current logged-in visit count
 */
export function getLoggedInVisitCount(): number {
  if (typeof localStorage === 'undefined') {
    return 0;
  }

  return parseInt(localStorage.getItem(LOGGED_IN_VISIT_COUNT_KEY) || '0', 10);
}

/**
 * Check if we've already shown the Recent Projects tooltip
 */
export function hasShownProjectsTooltip(): boolean {
  if (typeof localStorage === 'undefined') {
    return false;
  }

  return localStorage.getItem(SHOWN_PROJECTS_TOOLTIP_KEY) === 'true';
}

/**
 * Mark that we've shown the Recent Projects tooltip
 */
export function markProjectsTooltipShown(): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(SHOWN_PROJECTS_TOOLTIP_KEY, 'true');
}

/**
 * Reset the Projects tooltip tracking (for testing/debugging)
 */
export function resetProjectsTooltipTracking(): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.removeItem(LOGGED_IN_VISIT_COUNT_KEY);
  localStorage.removeItem(SHOWN_PROJECTS_TOOLTIP_KEY);
  console.log('✅ Projects tooltip tracking reset. Visit count and tooltip flag cleared.');
}

/**
 * Get debug info about the current tooltip tracking state
 */
export function getTooltipTrackingInfo(): void {
  if (typeof localStorage === 'undefined') {
    console.log('❌ localStorage not available');
    return;
  }

  const visitCount = localStorage.getItem(LOGGED_IN_VISIT_COUNT_KEY) || '0';
  const tooltipShown = localStorage.getItem(SHOWN_PROJECTS_TOOLTIP_KEY) || 'false';
  
  console.log('📊 Current Tooltip Tracking State:');
  console.log('  - Visit Count:', visitCount);
  console.log('  - Tooltip Shown:', tooltipShown);
  console.log('  - Will Show Tooltip:', parseInt(visitCount) >= 2 && tooltipShown !== 'true');
}

/**
 * Force trigger the tooltip (for testing)
 */
export function forceShowTooltip(): void {
  if (typeof localStorage === 'undefined') {
    console.log('❌ localStorage not available');
    return;
  }

  // Set visit count to 2 (or higher) and clear the shown flag
  localStorage.setItem(LOGGED_IN_VISIT_COUNT_KEY, '2');
  localStorage.removeItem(SHOWN_PROJECTS_TOOLTIP_KEY);
  console.log('✅ Tooltip tracking prepared. Refresh the page to trigger tooltip.');
}

// Expose helper functions globally for debugging
if (typeof window !== 'undefined') {
  (window as any).resetProjectsTooltipTracking = resetProjectsTooltipTracking;
  (window as any).getTooltipTrackingInfo = getTooltipTrackingInfo;
  (window as any).forceShowTooltip = forceShowTooltip;
  console.log('🛠️ Debug helpers available:');
  console.log('  - window.getTooltipTrackingInfo() - Check current state');
  console.log('  - window.forceShowTooltip() - Force tooltip on next refresh');
  console.log('  - window.resetProjectsTooltipTracking() - Clear all tracking');
}

