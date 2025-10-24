// Cache Service for Sogni Vibe Explorer Extension
// Manages caching of styled images per site with localStorage

class StyleCacheService {
  constructor() {
    this.cachePrefix = 'sogni_style_cache_';
    this.maxCacheAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    this.maxCacheSize = 50; // Maximum number of cached styles per site
  }

  // Get cache key for current site
  getCacheKey(hostname = null) {
    // Use provided hostname or try to get from window.location
    const siteHostname = hostname || (typeof window !== 'undefined' ? window.location.hostname : 'unknown');
    return `${this.cachePrefix}${siteHostname}`;
  }

  // Get all cached styles for current site
  getCachedStyles() {
    try {
      const cacheKey = this.getCacheKey();
      
      // Use chrome.storage.local instead of localStorage for cross-context access
      return new Promise((resolve) => {
        chrome.storage.local.get([cacheKey], (result) => {
          try {
            const cached = result[cacheKey];
            
            if (!cached) {
              resolve([]);
              return;
            }

            const styles = Array.isArray(cached) ? cached : JSON.parse(cached);
            
            // Filter out expired entries
            const now = Date.now();
            const validStyles = styles.filter(style => {
              return (now - style.timestamp) < this.maxCacheAge;
            });

            // If we filtered out expired entries, save the cleaned cache
            if (validStyles.length !== styles.length) {
              this.saveCachedStyles(validStyles);
            }

            resolve(validStyles);
          } catch (error) {
            console.error('Error parsing cached styles:', error);
            resolve([]);
          }
        });
      });
    } catch (error) {
      console.error('Error getting cached styles:', error);
      return Promise.resolve([]);
    }
  }

  // Save cached styles for current site
  saveCachedStyles(styles) {
    try {
      const cacheKey = this.getCacheKey();
      
      // Limit cache size
      const limitedStyles = styles.slice(-this.maxCacheSize);
      
      // Use chrome.storage.local instead of localStorage
      chrome.storage.local.set({ [cacheKey]: limitedStyles }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving cached styles:', chrome.runtime.lastError);
        } else {
          console.log(`Saved ${limitedStyles.length} cached styles for ${window.location.hostname}`);
        }
      });
    } catch (error) {
      console.error('Error saving cached styles:', error);
    }
  }

  // Add a new styled image to cache
  async cacheStyledImage(originalUrl, transformedUrl, styleKey, stylePrompt, styleDisplayName) {
    try {
      const styles = await this.getCachedStyles();
      
      // Create cache entry
      const cacheEntry = {
        id: this.generateCacheId(originalUrl, styleKey),
        originalUrl,
        transformedUrl,
        styleKey,
        stylePrompt,
        styleDisplayName: styleDisplayName || this.styleIdToDisplay(styleKey),
        timestamp: Date.now(),
        hostname: window.location.hostname,
        pageUrl: window.location.href
      };

      // Check if this exact combination already exists
      const existingIndex = styles.findIndex(style => 
        style.originalUrl === originalUrl && style.styleKey === styleKey
      );

      if (existingIndex >= 0) {
        // Update existing entry
        styles[existingIndex] = cacheEntry;
        console.log('Updated existing cache entry:', cacheEntry.id);
      } else {
        // Add new entry
        styles.push(cacheEntry);
        console.log('Added new cache entry:', cacheEntry.id);
      }

      this.saveCachedStyles(styles);
      return cacheEntry;
    } catch (error) {
      console.error('Error caching styled image:', error);
      return null;
    }
  }

  // Generate unique cache ID
  generateCacheId(originalUrl, styleKey) {
    const urlHash = this.hashString(originalUrl);
    return `${styleKey}_${urlHash}_${Date.now()}`;
  }

  // Simple string hash function
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  // Get cached styles grouped by style name
  async getCachedStylesGrouped() {
    const styles = await this.getCachedStyles();
    const grouped = {};

    styles.forEach(style => {
      const styleName = style.styleDisplayName;
      if (!grouped[styleName]) {
        grouped[styleName] = {
          styleKey: style.styleKey,
          stylePrompt: style.stylePrompt,
          styleDisplayName: styleName,
          images: [],
          lastUsed: style.timestamp
        };
      }
      
      grouped[styleName].images.push(style);
      grouped[styleName].lastUsed = Math.max(grouped[styleName].lastUsed, style.timestamp);
    });

    // Convert to array and sort by last used
    return Object.values(grouped).sort((a, b) => b.lastUsed - a.lastUsed);
  }

  // Get unique style names that have been cached
  async getCachedStyleNames() {
    const grouped = await this.getCachedStylesGrouped();
    return grouped.map(group => ({
      styleKey: group.styleKey,
      styleDisplayName: group.styleDisplayName,
      imageCount: group.images.length,
      lastUsed: group.lastUsed
    }));
  }

  // Find cached image for original URL and style
  async findCachedImage(originalUrl, styleKey) {
    const styles = await this.getCachedStyles();
    return styles.find(style => 
      style.originalUrl === originalUrl && style.styleKey === styleKey
    );
  }

  // Get all cached images for a specific style
  async getCachedImagesForStyle(styleKey) {
    const styles = await this.getCachedStyles();
    return styles.filter(style => style.styleKey === styleKey);
  }

  // Clear all cached styles for current site
  clearCache() {
    try {
      const cacheKey = this.getCacheKey();
      return new Promise((resolve) => {
        chrome.storage.local.remove([cacheKey], () => {
          if (chrome.runtime.lastError) {
            console.error('Error clearing cache:', chrome.runtime.lastError);
            resolve(false);
          } else {
            console.log(`Cleared cache for ${window.location.hostname}`);
            resolve(true);
          }
        });
      });
    } catch (error) {
      console.error('Error clearing cache:', error);
      return Promise.resolve(false);
    }
  }

  // Clear old cache entries across all sites
  clearOldCache() {
    try {
      const keysToRemove = [];
      const now = Date.now();

      // Find all cache keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.cachePrefix)) {
          try {
            const cached = JSON.parse(localStorage.getItem(key));
            if (Array.isArray(cached)) {
              // Check if all entries are old
              const hasValidEntries = cached.some(style => 
                (now - style.timestamp) < this.maxCacheAge
              );
              
              if (!hasValidEntries) {
                keysToRemove.push(key);
              }
            }
          } catch (parseError) {
            // Invalid cache entry, mark for removal
            keysToRemove.push(key);
          }
        }
      }

      // Remove old cache keys
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        console.log('Removed old cache key:', key);
      });

      console.log(`Cleared ${keysToRemove.length} old cache entries`);
    } catch (error) {
      console.error('Error clearing old cache:', error);
    }
  }

  // Get cache statistics
  getCacheStats() {
    const styles = this.getCachedStyles();
    const grouped = this.getCachedStylesGrouped();
    
    return {
      totalImages: styles.length,
      uniqueStyles: grouped.length,
      oldestEntry: styles.length > 0 ? Math.min(...styles.map(s => s.timestamp)) : null,
      newestEntry: styles.length > 0 ? Math.max(...styles.map(s => s.timestamp)) : null,
      cacheSize: this.getCacheSizeEstimate()
    };
  }

  // Estimate cache size in bytes
  getCacheSizeEstimate() {
    try {
      const cacheKey = this.getCacheKey();
      const cached = localStorage.getItem(cacheKey);
      return cached ? cached.length * 2 : 0; // Rough estimate (UTF-16)
    } catch (error) {
      return 0;
    }
  }

  // Format style key to display name (same as content script)
  styleIdToDisplay(styleId) {
    if (!styleId) return '';
    
    // Handle special case
    if (styleId === 'y2kRaverKid') {
      return 'Y2K Raver Kid';
    }
    
    return styleId
      .replace(/([a-z])([A-Z])/g, '$1 $2')  // Add space between lowercase and uppercase
      .replace(/([a-zA-Z])(\d)/g, '$1 $2')  // Add space between letters and numbers
      .replace(/(\d+)([a-zA-Z])/g, (match, numbers, letters) => {
        // Don't separate common patterns like F1, 1990s, 90s, 3D, etc.
        const commonPatterns = /^(f1|1990s|90s|3d|2d|8k|4k|24x24|128x112)$/i;
        if (commonPatterns.test(numbers + letters)) {
          return match; // Keep as-is
        }
        return `${numbers} ${letters}`; // Add space after numbers
      })
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }

  // Apply cached style to current page images
  async applyCachedStyle(styleKey) {
    try {
      const cachedImages = await this.getCachedImagesForStyle(styleKey);
      
      if (cachedImages.length === 0) {
        console.log('No cached images found for style:', styleKey);
        return { success: false, message: 'No cached images found for this style' };
      }

      let appliedCount = 0;
      let notFoundCount = 0;

      // Find current page images and apply cached transformations
      for (const cachedImage of cachedImages) {
        // Try to find the original image on the current page
        const originalImg = document.querySelector(`img[src="${cachedImage.originalUrl}"]`);
        
        if (originalImg) {
          // Check if this image is already transformed
          if (originalImg.dataset.transformedUrl) {
            // Update the transformed URL to the cached one
            originalImg.dataset.transformedUrl = cachedImage.transformedUrl;
            
            // If there's a comparison container, update it
            const comparisonContainer = originalImg._comparisonContainer;
            if (comparisonContainer) {
              const afterImg = comparisonContainer.querySelector('.sogni-after-image');
              if (afterImg) {
                afterImg.src = cachedImage.transformedUrl;
                appliedCount++;
              }
            }
          } else {
            // Apply the cached transformation
            try {
              // Store the cached URLs in dataset
              originalImg.dataset.originalUrl = cachedImage.originalUrl;
              originalImg.dataset.transformedUrl = cachedImage.transformedUrl;
              
              // Replace with hover comparison (reuse existing function)
              if (typeof replaceImageWithHoverComparison === 'function') {
                await replaceImageWithHoverComparison(originalImg, cachedImage.transformedUrl);
                appliedCount++;
              }
            } catch (error) {
              console.error('Error applying cached transformation:', error);
            }
          }
        } else {
          notFoundCount++;
        }
      }

      console.log(`Applied cached style "${styleKey}": ${appliedCount} images applied, ${notFoundCount} not found on current page`);
      
      return {
        success: true,
        appliedCount,
        notFoundCount,
        totalCached: cachedImages.length,
        message: `Applied ${appliedCount} cached transformations`
      };
    } catch (error) {
      console.error('Error applying cached style:', error);
      return { success: false, message: error.message };
    }
  }

  // Check if there are cached images that could be restored on this page
  async checkForRestorableImages() {
    const cachedStyles = await this.getCachedStyles();
    const restorableImages = [];
    
    for (const cachedImage of cachedStyles) {
      // Try to find the original image on the current page
      const originalImg = document.querySelector(`img[src="${cachedImage.originalUrl}"]`);
      
      if (originalImg && !originalImg.dataset.transformedUrl && !this.isAlreadyConverted(originalImg)) {
        restorableImages.push({
          element: originalImg,
          cachedImage: cachedImage
        });
      }
    }
    
    return restorableImages;
  }

  // Check if an image is already converted (similar to content script function)
  isAlreadyConverted(img) {
    // Check if the image element has our conversion markers
    if (img.dataset.originalUrl || img.dataset.transformedUrl) {
      return true;
    }

    // Check if the image is part of our comparison container
    const parent = img.parentElement;
    if (parent && parent.classList.contains('sogni-before-after-container')) {
      return true;
    }

    // Check if the image has our specific classes
    if (img.classList.contains('sogni-before-image') || img.classList.contains('sogni-after-image')) {
      return true;
    }

    return false;
  }

  // Auto-restore cached images (can be called from popup or content script)
  async autoRestoreCachedImages() {
    try {
      console.log('Auto-restoring cached images...');
      const restorableImages = await this.checkForRestorableImages();
      
      if (restorableImages.length === 0) {
        console.log('No restorable cached images found');
        return { success: true, restoredCount: 0, message: 'No cached images to restore' };
      }
      
      console.log(`Found ${restorableImages.length} restorable cached images`);
      let restoredCount = 0;
      
      for (const { element: originalImg, cachedImage } of restorableImages) {
        try {
          // Store the cached URLs in dataset
          originalImg.dataset.originalUrl = cachedImage.originalUrl;
          originalImg.dataset.transformedUrl = cachedImage.transformedUrl;
          
          // Replace with hover comparison (reuse existing function)
          if (typeof replaceImageWithHoverComparison === 'function') {
            await replaceImageWithHoverComparison(originalImg, cachedImage.transformedUrl);
            restoredCount++;
            console.log(`Restored cached image: ${cachedImage.styleDisplayName} for ${cachedImage.originalUrl}`);
          }
        } catch (error) {
          console.error('Error restoring cached image:', error);
        }
      }
      
      return {
        success: true,
        restoredCount,
        totalFound: restorableImages.length,
        message: `Restored ${restoredCount} cached images`
      };
    } catch (error) {
      console.error('Error auto-restoring cached images:', error);
      return { success: false, message: error.message };
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StyleCacheService;
} else {
  window.StyleCacheService = StyleCacheService;
}
