/**
 * Environment detection and configuration utilities
 */

// Possible environments
export enum Environment {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production'
}

/**
 * Determine the current environment
 */
export const getCurrentEnvironment = (): Environment => {
  const mode = import.meta.env.MODE;
  
  if (mode === 'production') return Environment.PRODUCTION;
  if (mode === 'staging') return Environment.STAGING;
  return Environment.DEVELOPMENT;
};

/**
 * Check if we're in a specific environment
 */
export const isEnvironment = (env: Environment): boolean => {
  return getCurrentEnvironment() === env;
};

/**
 * Shorthand environment check functions
 */
export const isDevelopment = (): boolean => isEnvironment(Environment.DEVELOPMENT);
export const isStaging = (): boolean => isEnvironment(Environment.STAGING);
export const isProduction = (): boolean => isEnvironment(Environment.PRODUCTION);

/**
 * Get app title with environment indicator
 */
export const getAppTitle = (): string => {
  const env = import.meta.env as Record<string, unknown>;
  const rawTitle = env['VITE_APP_TITLE'];
  const baseTitle = typeof rawTitle === 'string' ? rawTitle : 'Sogni Photobooth';
  if (isDevelopment()) return `${baseTitle} (Dev)`;
  if (isStaging()) return `${baseTitle} (Staging)`;
  return baseTitle;
};

/**
 * Get Turnstile site key for bot protection
 */
export const getTurnstileKey = (): string => {
  const env = import.meta.env as Record<string, unknown>;
  const key = env['VITE_TURNSTILE_KEY'];
  return typeof key === 'string' ? key : '';
};

/**
 * Check if moderation is enabled
 * - Enabled by default in production and staging
 * - Disabled by default in development/local
 * - Can be explicitly controlled via VITE_MODERATION_ENABLED env variable
 */
export const isModerationEnabled = (): boolean => {
  const env = import.meta.env as Record<string, unknown>;
  const explicitFlag = env['VITE_MODERATION_ENABLED'];
  
  // If explicitly set, use that value
  if (explicitFlag !== undefined) {
    return explicitFlag === 'true' || explicitFlag === true;
  }
  
  // Otherwise, enable for production/staging, disable for development
  return !isDevelopment();
}; 