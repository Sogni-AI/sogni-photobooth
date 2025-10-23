/**
 * Utility functions for tracking visitor status using cookies
 */

const VISITOR_COOKIE_NAME = 'sogni_has_visited';
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

