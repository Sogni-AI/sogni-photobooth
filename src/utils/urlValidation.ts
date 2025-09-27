/**
 * URL validation utilities for QR code URLs
 */

/**
 * Validates if a URL is a valid HTTPS URL
 * @param url - The URL to validate
 * @returns true if the URL is valid HTTPS, false otherwise
 */
export const isValidHttpsUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const urlObj = new URL(url);
    
    // Must be HTTPS protocol
    if (urlObj.protocol !== 'https:') {
      return false;
    }
    
    // Must have a valid hostname
    if (!urlObj.hostname || urlObj.hostname.length === 0) {
      return false;
    }
    
    // Basic hostname validation - no spaces, must contain at least one dot
    if (urlObj.hostname.includes(' ') || !urlObj.hostname.includes('.')) {
      return false;
    }
    
    return true;
  } catch (error) {
    // Invalid URL format
    return false;
  }
};

/**
 * Sanitizes a URL by trimming whitespace and ensuring proper format
 * @param url - The URL to sanitize
 * @returns The sanitized URL or empty string if invalid
 */
export const sanitizeUrl = (url: string): string => {
  if (!url || typeof url !== 'string') {
    return '';
  }
  
  // Trim whitespace
  const trimmed = url.trim();
  
  // If empty after trimming, return empty
  if (!trimmed) {
    return '';
  }
  
  // If it doesn't start with https://, add it
  if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) {
    const withHttps = `https://${trimmed}`;
    return isValidHttpsUrl(withHttps) ? withHttps : '';
  }
  
  // If it starts with http://, convert to https://
  if (trimmed.startsWith('http://')) {
    const withHttps = trimmed.replace('http://', 'https://');
    return isValidHttpsUrl(withHttps) ? withHttps : '';
  }
  
  // Validate as-is
  return isValidHttpsUrl(trimmed) ? trimmed : '';
};

/**
 * Gets a user-friendly error message for invalid URLs
 * @param url - The URL that failed validation
 * @returns A descriptive error message
 */
export const getUrlValidationError = (url: string): string => {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return 'URL is required';
  }
  
  const trimmed = url.trim();
  
  try {
    const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    
    if (urlObj.protocol !== 'https:') {
      return 'URL must use HTTPS protocol for security';
    }
    
    if (!urlObj.hostname || urlObj.hostname.length === 0) {
      return 'URL must have a valid domain name';
    }
    
    if (urlObj.hostname.includes(' ')) {
      return 'Domain name cannot contain spaces';
    }
    
    if (!urlObj.hostname.includes('.')) {
      return 'Domain name must contain at least one dot';
    }
    
    return '';
  } catch (error) {
    return 'Invalid URL format';
  }
};
