/**
 * Frontend Analytics Service
 * Handles tracking of download and share events for prompt popularity
 */

/**
 * Get the API base URL based on environment
 */
const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    
    // Local development
    if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
      return 'http://localhost:3001';
    }
    
    // Local SSL development (photobooth-local.sogni.ai)
    if (hostname.includes('photobooth-local.sogni.ai')) {
      return 'https://photobooth-api-local.sogni.ai';
    }
    
    // Production
    return 'https://photobooth-api.sogni.ai';
  }
  return 'http://localhost:3001';
};

/**
 * Extract prompt ID from current style settings
 * @param {string} selectedStyle - The currently selected style key
 * @param {Object} stylePrompts - The style prompts object
 * @returns {string|null} - The prompt ID or null if not trackable
 */
export const extractPromptId = (selectedStyle, stylePrompts = {}, actualPrompt = null) => {
  // Don't track certain special styles
  const nonTrackableStyles = [
    'custom',
    'browseGallery',
    'random',
    'randomMix',
    'RANDOM_SINGLE_STYLE'
  ];
  
  if (!selectedStyle || nonTrackableStyles.includes(selectedStyle)) {
    return null;
  }
  
  // For randomMix, we need to extract the actual prompt that was used
  if (selectedStyle === 'randomMix' && actualPrompt) {
    // Find which style key matches this exact prompt text
    for (const [styleKey, promptText] of Object.entries(stylePrompts)) {
      if (promptText === actualPrompt && !nonTrackableStyles.includes(styleKey)) {
        return styleKey;
      }
    }
    // If no exact match found, don't track anything (return null instead of randomMix)
    return null;
  }
  
  // For regular styles, use the selectedStyle as the prompt ID
  return selectedStyle;
};

/**
 * Track a download event
 * @param {string} promptId - The prompt ID to track
 * @param {Object} metadata - Optional metadata about the download
 */
export const trackDownload = async (promptId, metadata = {}) => {
  if (!promptId) {
    return;
  }
  
  try {
    const apiUrl = `${getApiBaseUrl()}/api/analytics/track/download`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        promptId,
        metadata: {
          ...metadata,
          source: 'frontend',
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
          url: window.location.href
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    console.error('[Analytics] Failed to track download:', error);
    // Don't throw - analytics failures shouldn't break the user experience
  }
};

/**
 * Track a share event
 * @param {string} promptId - The prompt ID to track
 * @param {string} shareType - Type of share (e.g., 'twitter', 'web-share', 'copy-link')
 * @param {Object} metadata - Optional metadata about the share
 */
export const trackShare = async (promptId, shareType = 'unknown', metadata = {}) => {
  if (!promptId) {
    console.log('[Analytics] No prompt ID provided for share tracking');
    return;
  }
  
  try {
    const apiUrl = `${getApiBaseUrl()}/api/analytics/track/share`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        promptId,
        shareType,
        metadata: {
          ...metadata,
          source: 'frontend',
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
          url: window.location.href
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.status}`);
    }
    
    const result = await response.json();
    console.log(`[Analytics] Share tracked for prompt: ${promptId} (${shareType})`, result);
  } catch (error) {
    console.error('[Analytics] Failed to track share:', error);
    // Don't throw - analytics failures shouldn't break the user experience
  }
};

/**
 * Track download with automatic prompt ID extraction
 * @param {string} selectedStyle - Current selected style
 * @param {Object} stylePrompts - Style prompts object
 * @param {Object} metadata - Optional metadata
 */
export const trackDownloadWithStyle = async (selectedStyle, stylePrompts, metadata = {}) => {
  const promptId = extractPromptId(selectedStyle, stylePrompts, metadata.actualPrompt);
  
  if (promptId) {
    await trackDownload(promptId, {
      ...metadata,
      selectedStyle,
      extractedPromptId: promptId
    });
  }
};

/**
 * Track share with automatic prompt ID extraction
 * @param {string} selectedStyle - Current selected style
 * @param {Object} stylePrompts - Style prompts object
 * @param {string} shareType - Type of share
 * @param {Object} metadata - Optional metadata
 */
export const trackShareWithStyle = async (selectedStyle, stylePrompts, shareType = 'unknown', metadata = {}) => {
  const promptId = extractPromptId(selectedStyle, stylePrompts);
  if (promptId) {
    await trackShare(promptId, shareType, {
      ...metadata,
      selectedStyle,
      extractedPromptId: promptId
    });
  }
};

/**
 * Get analytics data for a specific prompt
 * @param {string} promptId - The prompt ID
 * @param {string} date - Optional date (YYYY-MM-DD)
 */
export const getPromptAnalytics = async (promptId, date = null) => {
  try {
    const apiUrl = `${getApiBaseUrl()}/api/analytics/prompt/${promptId}${date ? `?date=${date}` : ''}`;
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('[Analytics] Failed to get prompt analytics:', error);
    return null;
  }
};

/**
 * Get top prompts leaderboard
 * @param {string} type - 'downloads', 'shares', or 'combined'
 * @param {string} period - 'daily' or 'lifetime'
 * @param {string} date - Required for daily (YYYY-MM-DD)
 * @param {number} limit - Number of results
 */
export const getTopPrompts = async (type = 'combined', period = 'lifetime', date = null, limit = 50) => {
  try {
    const params = new URLSearchParams({
      type,
      period,
      limit: limit.toString()
    });
    
    if (date) {
      params.set('date', date);
    }
    
    const apiUrl = `${getApiBaseUrl()}/api/analytics/top?${params}`;
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('[Analytics] Failed to get top prompts:', error);
    return null;
  }
};

/**
 * Get analytics dashboard data
 */
export const getAnalyticsDashboard = async () => {
  try {
    const apiUrl = `${getApiBaseUrl()}/api/analytics/dashboard`;
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('[Analytics] Failed to get analytics dashboard:', error);
    return null;
  }
};

/**
 * Get historical analytics data
 * @param {number} days - Number of days to retrieve (default 30)
 */
export const getHistoricalAnalytics = async (days = 30) => {
  try {
    const apiUrl = `${getApiBaseUrl()}/api/analytics/historical?days=${days}`;
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('[Analytics] Failed to get historical analytics:', error);
    return null;
  }
};

/**
 * Utility function to get current UTC date in YYYY-MM-DD format
 */
export const getCurrentUTCDate = () => {
  return new Date().toISOString().split('T')[0];
};

// Export for debugging in browser console
if (typeof window !== 'undefined') {
  window.analyticsService = {
    trackDownload,
    trackShare,
    trackDownloadWithStyle,
    trackShareWithStyle,
    getPromptAnalytics,
    getTopPrompts,
    getAnalyticsDashboard,
    extractPromptId,
    getCurrentUTCDate
  };
}
