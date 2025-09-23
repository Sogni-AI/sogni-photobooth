/**
 * Theme Configuration Service
 * Handles loading and managing external event theme configurations
 */
import { TWITTER_SHARE_CONFIG } from '../constants/settings';

class ThemeConfigService {
  constructor() {
    this.config = null;
    this.loading = false;
    this.error = null;
    // Add caches for frequently accessed data
    this.themeCache = new Map();
    this.frameUrlsCache = new Map();
    this.framePaddingCache = new Map();
  }

  /**
   * Load theme configuration from external JSON file
   * @returns {Promise<Object>} Theme configuration object
   */
  async loadConfig() {
    // Return cached config if already loaded
    if (this.config) {
      return this.config;
    }

    if (this.loading) {
      // Wait for existing load to complete
      while (this.loading) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return this.config;
    }

    this.loading = true;
    this.error = null;

    try {
      console.log('Loading theme configuration...');
      const response = await fetch('/events/config.json');
      
      if (!response.ok) {
        throw new Error(`Failed to load theme config: ${response.status} ${response.statusText}`);
      }

      const config = await response.json();
      
      // Validate config structure
      if (!config.themes || typeof config.themes !== 'object') {
        throw new Error('Invalid theme configuration: missing themes object');
      }

      this.config = config;
      console.log('Theme configuration loaded successfully:', Object.keys(config.themes).length, 'themes');
      return config;

    } catch (error) {
      console.error('Error loading theme configuration:', error);
      this.error = error.message;
      this.config = { themes: {}, defaultTheme: null }; // Fallback empty config
      return this.config;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Get all available themes
   * @returns {Promise<Object>} Themes object
   */
  async getThemes() {
    const config = await this.loadConfig();
    return config.themes || {};
  }

  /**
   * Get a specific theme by ID
   * @param {string} themeId - Theme identifier
   * @returns {Promise<Object|null>} Theme configuration or null if not found
   */
  async getTheme(themeId) {
    // Check cache first
    if (this.themeCache.has(themeId)) {
      return this.themeCache.get(themeId);
    }

    const themes = await this.getThemes();
    const theme = themes[themeId] || null;
    
    // Cache the result
    this.themeCache.set(themeId, theme);
    return theme;
  }

  /**
   * Get the default theme ID if any
   * @returns {Promise<string|null>} Default theme ID or null
   */
  async getDefaultTheme() {
    const config = await this.loadConfig();
    return config.defaultTheme || null;
  }

  /**
   * Get theme options for settings dropdown
   * @returns {Promise<Array>} Array of theme options for UI
   */
  async getThemeOptions() {
    const themes = await this.getThemes();
    
    return Object.entries(themes).map(([id, theme]) => ({
      value: id,
      label: theme.label,
      defaultAspectRatio: theme.defaultAspectRatio
    }));
  }

  /**
   * Get tweet template for a theme
   * @param {string} themeId - Theme identifier
   * @param {string} styleTag - Style hashtag to replace in template
   * @returns {Promise<string>} Formatted tweet message
   */
  async getTweetTemplate(themeId, styleTag = '') {
    const theme = await this.getTheme(themeId);
    if (!theme || !theme.tweetTemplate) {
      return TWITTER_SHARE_CONFIG.DEFAULT_MESSAGE;
    }

    // Support both "{styleTag}" and "#{styleTag}" placeholder patterns
    // "#{styleTag}" becomes a hashtag like "#vaporwave"
    return theme.tweetTemplate
      .replace(/#\{styleTag\}/g, `#${styleTag}`)
      .replace(/\{styleTag\}/g, styleTag);
  }

  /**
   * Get frame URLs for a theme and aspect ratio
   * @param {string} themeId - Theme identifier  
   * @param {string} aspectRatio - Aspect ratio (narrow, square, etc.)
   * @returns {Promise<Array>} Array of frame URLs
   */
  async getFrameUrls(themeId, aspectRatio) {
    const cacheKey = `${themeId}-${aspectRatio}`;
    
    // Check cache first
    if (this.frameUrlsCache.has(cacheKey)) {
      return this.frameUrlsCache.get(cacheKey);
    }

    const theme = await this.getTheme(themeId);
    const frameUrls = (theme && theme.frames && theme.frames[aspectRatio]) ? theme.frames[aspectRatio] : [];
    
    // Cache the result
    this.frameUrlsCache.set(cacheKey, frameUrls);
    return frameUrls;
  }

  /**
   * Get frame padding for a theme
   * @param {string} themeId - Theme identifier
   * @returns {Promise<Object|number>} Frame padding object {top, left, right, bottom} or legacy number
   */
  async getFramePadding(themeId) {
    // Check cache first
    if (this.framePaddingCache.has(themeId)) {
      return this.framePaddingCache.get(themeId);
    }

    const theme = await this.getTheme(themeId);
    let padding = theme?.framePadding;
    
    // Handle backward compatibility - convert number to object
    if (typeof padding === 'number') {
      padding = {
        top: padding,
        left: padding,
        right: padding,
        bottom: padding
      };
    } else if (!padding || typeof padding !== 'object') {
      // Default padding object
      padding = { top: 0, left: 0, right: 0, bottom: 0 };
    } else {
      // Ensure all required properties exist with defaults
      padding = {
        top: padding.top || 0,
        left: padding.left || 0,
        right: padding.right || 0,
        bottom: padding.bottom || 0
      };
    }
    
    // Cache the result
    this.framePaddingCache.set(themeId, padding);
    return padding;
  }

  /**
   * Check if themes are available
   * @returns {Promise<boolean>} True if themes loaded successfully
   */
  async hasThemes() {
    const themes = await this.getThemes();
    return Object.keys(themes).length > 0;
  }

  /**
   * Reload configuration (useful for refreshing themes without restart)
   * @returns {Promise<Object>} Reloaded configuration
   */
  async reload() {
    this.config = null;
    this.error = null;
    // Clear all caches
    this.themeCache.clear();
    this.frameUrlsCache.clear();
    this.framePaddingCache.clear();
    return await this.loadConfig();
  }
}

// Export singleton instance
export const themeConfigService = new ThemeConfigService();

// Export class for testing
export { ThemeConfigService };
