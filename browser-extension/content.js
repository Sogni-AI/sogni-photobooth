// Content Script for Sogni Photobooth Extension
console.log('🚀 Sogni Photobooth Extension: Content script loaded - VERSION 2.0 WITH MULTIPLE LOGOS & DIRECT STYLE EXPLORER');
console.log('Content script initialization starting...');

// Initialize components
let api = null;
let progressOverlay = null;
let settingsService = null;
let styleCacheService = null;
// Production mode by default
let isProcessing = false;
let processingQueue = []; // Queue of images waiting to be processed
window.processingQueue = processingQueue; // Make it globally accessible
let MAX_CONCURRENT_CONVERSIONS = 8; // Configurable concurrency
let MAX_IMAGES_PER_PAGE = 32; // Configurable limit for images processed per page

// User settings that can be saved/loaded per page
let userSettings = {
  lastUsedStyle: null,
  lastUsedStylePrompt: null,
  preferredMaxImages: null,
  preferredMaxConcurrent: null,
  autoProcessOnStyleSelect: true,
  rememberLastStyle: true
};

// Lazy API initialization - only when needed for image processing
async function ensureApiInitialized() {
  if (!api) {
    console.log('Initializing API for image processing...');
    try {
      api = new PhotoboothAPI();
      await api.initializeSession();
      console.log('API initialized successfully');
    } catch (error) {
      console.error('Failed to initialize API:', error);
      throw error;
    }
  }
  return api;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

async function initialize() {
  console.log('Initializing Sogni Photobooth Extension');
  
  try {
    // Check if required classes are available
    if (typeof ProgressOverlay === 'undefined') {
      console.error('ProgressOverlay class not found. Retrying in 50ms...');
      setTimeout(initialize, 50);
      return;
    }
    
    if (typeof SettingsService === 'undefined') {
      console.error('SettingsService class not found. Retrying in 50ms...');
      setTimeout(initialize, 50);
      return;
    }
    
    if (typeof StyleCacheService === 'undefined') {
      console.error('StyleCacheService class not found. Retrying in 50ms...');
      setTimeout(initialize, 50);
      return;
    }
    
    // Initialize settings service
    settingsService = new SettingsService();
    
    // Initialize cache service
    styleCacheService = new StyleCacheService();
    
    // Load user settings for this page
    await loadUserSettings();
    
    // Load debug settings (with user preference override)
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(['debugSettings'], resolve);
      });
      
      if (result.debugSettings) {
        // Use user preferences if available, otherwise use debug settings
        MAX_CONCURRENT_CONVERSIONS = userSettings.preferredMaxConcurrent || result.debugSettings.maxConcurrent;
        MAX_IMAGES_PER_PAGE = userSettings.preferredMaxImages || result.debugSettings.maxImages;
        console.log('Debug settings loaded with user overrides:', { MAX_CONCURRENT_CONVERSIONS, MAX_IMAGES_PER_PAGE });
      }
    } catch (error) {
      console.log('Could not load debug settings, using defaults');
    }
    
    // Initialize progress overlay (lightweight, no API calls)
    progressOverlay = new ProgressOverlay();
    progressOverlay.updateMaxConcurrentSlots(MAX_CONCURRENT_CONVERSIONS);
    
    // Listen for scroll and resize to update overlay positions
    window.addEventListener('scroll', () => progressOverlay.updatePositions());
    window.addEventListener('resize', () => progressOverlay.updatePositions());
    
    console.log('Extension initialized successfully - waiting for activation');
    console.log('API will be initialized lazily when needed for image processing');
    
  } catch (error) {
    console.error('Failed to initialize extension:', error);
    // Retry initialization after a delay
    setTimeout(initialize, 100);
  }
}

// Load user settings for the current page
async function loadUserSettings() {
  try {
    const savedSettings = await settingsService.loadBestSettings();
    if (savedSettings && savedSettings.source !== 'default') {
      // Merge saved settings with defaults
      userSettings = { ...userSettings, ...savedSettings };
      console.log('User settings loaded:', userSettings);
      
      // Apply loaded settings
      if (userSettings.preferredMaxConcurrent) {
        MAX_CONCURRENT_CONVERSIONS = userSettings.preferredMaxConcurrent;
      }
      if (userSettings.preferredMaxImages) {
        MAX_IMAGES_PER_PAGE = userSettings.preferredMaxImages;
      }
    } else {
      console.log('No saved settings found, using defaults');
    }
  } catch (error) {
    console.error('Error loading user settings:', error);
  }
}

// Save user settings for the current page
async function saveUserSettings() {
  try {
    const success = await settingsService.savePageSettings(userSettings);
    if (success) {
      console.log('User settings saved successfully');
    } else {
      console.error('Failed to save user settings');
    }
  } catch (error) {
    console.error('Error saving user settings:', error);
  }
}

// Update a specific setting and save
async function updateUserSetting(key, value) {
  try {
    userSettings[key] = value;
    await saveUserSettings();
    console.log(`Setting updated: ${key} = ${value}`);
  } catch (error) {
    console.error(`Error updating setting ${key}:`, error);
  }
}

// Content script initialization
console.log('🎯 Sogni Content Script: Loading and initializing...');

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only log important messages
  if (!['updateDevMode', 'ping'].includes(message.action)) {
    console.log('🎯 Content script received message:', message);
  }
  
  if (message.action === 'ping') {
    // Respond to ping test from popup
    console.log('🎯 Content script responding to ping');
    sendResponse({ success: true, message: 'Content script is ready' });
    return true;
  } else if (message.action === 'scanPageForProfiles') {
    // Add the style selector icon when extension is activated
    addStyleSelectorIcon();
    
    handleScanPageForProfiles()
      .then(result => {
        console.log('Scan completed:', result);
        sendResponse({ success: true, result });
      })
      .catch(error => {
        console.error('Scan failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }
  
  if (message.action === 'activateExtension') {
    console.log('Extension activation requested');
    // Add the style selector icon when extension is activated
    addStyleSelectorIcon();
    
    // Make logo visible immediately
    setTimeout(() => {
      const logo = document.getElementById('sogni-style-selector-icon');
      if (logo) {
        logo.style.opacity = '1';
        logo.style.transform = 'scale(1)';
      }
    }, 100);
    
    sendResponse({ success: true, message: 'Extension activated, logo added' });
    return false;
  }
  
  if (message.action === 'openStyleExplorerDirect') {
    console.log('🎯 Content script received openStyleExplorerDirect message');
    // Toggle Style Explorer directly
    // Use toggle functionality to prevent multiple instances
    try {
      toggleStyleExplorer();
      const isOpen = document.getElementById('sogni-style-explorer-overlay') !== null;
      console.log('Style Explorer toggle completed, isOpen:', isOpen);
      
      // Send immediate response, but the popup will get the final confirmation via runtime message
      sendResponse({ success: true, message: isOpen ? 'Vibe Explorer opening...' : 'Vibe Explorer closed' });
    } catch (error) {
      console.error('Error toggling Style Explorer:', error);
      
      // Notify popup about the error
      try {
        chrome.runtime.sendMessage({ action: 'styleExplorerFailed', error: error.message });
      } catch (notifyError) {
        console.error('Failed to notify popup about error:', notifyError);
      }
      
      sendResponse({ success: false, error: error.message });
    }
    return false;
  }
  
  if (message.action === 'updateDevMode') {
    // Dev mode updated (no longer storing in variable)
    sendResponse({ success: true, message: 'Dev mode updated' });
    return false;
  }
  
  if (message.action === 'updateDebugSettings') {
    const { debugSettings } = message;
    // Update user preferences if they want to override debug settings
    if (userSettings.preferredMaxConcurrent !== null && userSettings.preferredMaxConcurrent !== undefined) {
      MAX_CONCURRENT_CONVERSIONS = userSettings.preferredMaxConcurrent;
      console.log('Using user preference for concurrent workers:', MAX_CONCURRENT_CONVERSIONS);
    } else {
      MAX_CONCURRENT_CONVERSIONS = debugSettings.maxConcurrent;
      console.log('Using debug setting for concurrent workers:', MAX_CONCURRENT_CONVERSIONS);
    }
    
    if (userSettings.preferredMaxImages !== null && userSettings.preferredMaxImages !== undefined) {
      MAX_IMAGES_PER_PAGE = userSettings.preferredMaxImages;
      console.log('Using user preference for max images:', MAX_IMAGES_PER_PAGE);
    } else {
      MAX_IMAGES_PER_PAGE = debugSettings.maxImages;
      console.log('Using debug setting for max images:', MAX_IMAGES_PER_PAGE);
    }
    
    console.log('Debug settings updated with user overrides:', { MAX_CONCURRENT_CONVERSIONS, MAX_IMAGES_PER_PAGE });
    sendResponse({ success: true, message: 'Debug settings updated' });
    return false;
  } else if (message.action === 'convertSingleImage') {
    handleConvertSingleImage(message.imageUrl)
      .then(result => {
        sendResponse({ success: true, result });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  } else if (message.action === 'updateProgress') {
    // Update progress overlay for the specific image
    updateImageProgress(message.imageUrl, message.progress, message.step, message.stepCount);
  } else if (message.action === 'updateUserSettings') {
    // Update user settings from popup or other sources
    const { settings } = message;
    userSettings = { ...userSettings, ...settings };
    
    // Immediately apply settings that affect processing
    if (settings.preferredMaxConcurrent !== undefined) {
      MAX_CONCURRENT_CONVERSIONS = settings.preferredMaxConcurrent;
      console.log('Updated MAX_CONCURRENT_CONVERSIONS to:', MAX_CONCURRENT_CONVERSIONS);
      
      // Update progress overlay if it exists
      if (window.progressOverlay) {
        window.progressOverlay.updateMaxConcurrentSlots(MAX_CONCURRENT_CONVERSIONS);
      }
    }
    if (settings.preferredMaxImages !== undefined) {
      MAX_IMAGES_PER_PAGE = settings.preferredMaxImages;
      console.log('Updated MAX_IMAGES_PER_PAGE to:', MAX_IMAGES_PER_PAGE);
    }
    
    saveUserSettings().then(() => {
      sendResponse({ success: true, message: 'User settings updated' });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (message.action === 'saveUserSettings') {
    // Save current user settings to persistent storage
    saveUserSettings().then(() => {
      console.log('User settings saved to persistent storage');
      sendResponse({ success: true, message: 'User settings saved' });
    }).catch(error => {
      console.error('Error saving user settings to persistent storage:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (message.action === 'getUserSettings') {
    // Return current user settings
    sendResponse({ success: true, settings: userSettings });
    return false;
  } else if (message.action === 'useLastStyle') {
    // Use the last used style for processing
    if (userSettings.lastUsedStyle && userSettings.lastUsedStylePrompt) {
      processImagesWithStyle(userSettings.lastUsedStyle, userSettings.lastUsedStylePrompt);
      sendResponse({ success: true, message: 'Using last style' });
    } else {
      sendResponse({ success: false, error: 'No last style found' });
    }
    return false;
  } else if (message.action === 'getCachedStyles') {
    // Get cached styles for current site
    if (styleCacheService) {
      styleCacheService.getCachedStyleNames()
        .then(cachedStyles => {
          sendResponse({ success: true, cachedStyles });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
    } else {
      sendResponse({ success: false, error: 'Cache service not initialized' });
    }
    return true; // Keep message channel open for async response
  } else if (message.action === 'applyCachedStyle') {
    // Apply a cached style to current page
    if (styleCacheService && message.styleKey) {
      styleCacheService.applyCachedStyle(message.styleKey)
        .then(result => {
          sendResponse({ success: result.success, message: result.message, result });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
    } else {
      sendResponse({ success: false, error: 'Cache service not initialized or missing styleKey' });
    }
    return true; // Keep message channel open for async response
  } else if (message.action === 'clearStyleCache') {
    // Clear all cached styles for current site
    if (styleCacheService) {
      styleCacheService.clearCache()
        .then(success => {
          sendResponse({ success, message: success ? 'Cache cleared' : 'Failed to clear cache' });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
    } else {
      sendResponse({ success: false, error: 'Cache service not initialized' });
    }
    return true; // Keep message channel open for async response
  } else if (message.action === 'getCacheStats') {
    // Get cache statistics
    if (styleCacheService) {
      const stats = styleCacheService.getCacheStats();
      sendResponse({ success: true, stats });
    } else {
      sendResponse({ success: false, error: 'Cache service not initialized' });
    }
    return false;
  } else if (message.action === 'autoRestoreCachedImages') {
    // Auto-restore cached images for current page
    if (styleCacheService) {
      styleCacheService.autoRestoreCachedImages()
        .then(result => {
          sendResponse({ success: result.success, message: result.message, result });
          
          // Show notification if images were restored
          if (result.restoredCount > 0) {
            showRestoreNotification(result.restoredCount);
          }
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
    } else {
      sendResponse({ success: false, error: 'Cache service not initialized' });
    }
    return true; // Keep message channel open for async response
  } else if (message.action === 'checkForRestorableImages') {
    // Check if there are cached images that can be restored on this page
    if (styleCacheService) {
      styleCacheService.checkForRestorableImages()
        .then(restorableImages => {
          sendResponse({ 
            success: true, 
            hasRestorableImages: restorableImages.length > 0,
            restorableCount: restorableImages.length
          });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
    } else {
      sendResponse({ success: false, error: 'Cache service not initialized' });
    }
    return true; // Keep message channel open for async response
  }
  
  return false;
});

// Update progress overlay for a specific image
function updateImageProgress(imageUrl, progress, step, stepCount) {
  try {
    // Find the image element by original URL stored in data attribute
    const imageElement = document.querySelector(`img[data-original-url="${imageUrl}"]`);
    if (!imageElement) {
      console.warn('Could not find image element for progress update:', imageUrl);
      return;
    }
    
    // Find progress overlay
    let overlay = imageElement.parentElement?.querySelector('.sogni-progress-overlay');
    if (!overlay) {
      // Try looking in different locations
      overlay = imageElement.nextElementSibling?.classList?.contains('sogni-progress-overlay') ? imageElement.nextElementSibling : null;
      if (!overlay) {
        overlay = document.querySelector('.sogni-progress-overlay'); // Look anywhere on page
      }
      
      if (!overlay) {
        console.warn('Could not find progress overlay for image:', imageUrl);
        return;
      }
    }
    
    // Update progress using the progressOverlay utility
    if (progressOverlay) {
      progressOverlay.updateProgress(imageElement, Math.round(progress * 100), `Step ${step}/${stepCount}`);
    } else {
      // Fallback: update manually
      const progressBar = overlay.querySelector('.sogni-progress-bar');
      const progressText = overlay.querySelector('.sogni-progress-text');
      
      if (progressBar) {
        progressBar.style.width = `${Math.round(progress * 100)}%`;
      }
      
      if (progressText) {
        progressText.textContent = `Step ${step}/${stepCount} (${Math.round(progress * 100)}%)`;
      }
    }
    
    console.log(`Updated progress for image: ${Math.round(progress * 100)}% (${step}/${stepCount})`);
  } catch (error) {
    console.error('Error updating image progress:', error);
  }
}

// Scan page for profile photos
async function handleScanPageForProfiles() {
  console.log('Scanning page for profile photos...');
  
  // Show scan indicator
  const scanIndicator = showScanIndicator('Scanning for profile photos...');
  
  try {
    if (isProcessing) {
      throw new Error('Already processing images. Please wait for current conversion to complete.');
    }
    
    // Ensure API is initialized for image processing
    await ensureApiInitialized();
    
    // Check if progress overlay is initialized
    if (!progressOverlay) {
      console.log('ProgressOverlay not initialized, initializing now...');
      
      if (typeof ProgressOverlay === 'undefined') {
        throw new Error('ProgressOverlay class not available. Extension may not have loaded properly.');
      }
      
      progressOverlay = new ProgressOverlay();
      progressOverlay.updateMaxConcurrentSlots(MAX_CONCURRENT_CONVERSIONS);
    }
    
    const profileImages = findProfileImages();
    console.log(`Found ${profileImages.length} potential profile images`);
    
    // Update scan indicator
    updateScanIndicator(scanIndicator, `Found ${profileImages.length} images`);
    
    if (profileImages.length < 2) {
      updateScanIndicator(scanIndicator, 'No profile photos found', 'error');
      setTimeout(() => removeScanIndicator(scanIndicator), 3000);
      throw new Error('No profile photos found. This extension looks for speaker/profile photo grids on pages.');
    }
    
    // Highlight detected images briefly
    profileImages.forEach(img => {
      img.classList.add('sogni-detected-image');
      setTimeout(() => img.classList.remove('sogni-detected-image'), 2000);
    });
    
    // Update scan indicator with limit info
    if (profileImages.length > MAX_IMAGES_PER_PAGE) {
      updateScanIndicator(scanIndicator, `Converting ${MAX_IMAGES_PER_PAGE} of ${profileImages.length} images...`, 'success');
    } else {
      updateScanIndicator(scanIndicator, `Converting ${profileImages.length} images...`, 'success');
    }
    
    // Process all found images
    // Limit the number of images processed per page
    const imagesToProcess = profileImages.slice(0, MAX_IMAGES_PER_PAGE);
    if (profileImages.length > MAX_IMAGES_PER_PAGE) {
      console.log(`Found ${profileImages.length} images, limiting to ${MAX_IMAGES_PER_PAGE} for performance`);
    } else {
      console.log(`Found ${profileImages.length} images, processing all images`);
    }
    
    // Process images with continuous assignment
    await processImagesBatch(imagesToProcess);
    
    // Remove scan indicator after completion
    removeScanIndicator(scanIndicator);
    
    return { 
      success: true, 
      imagesFound: imagesToProcess.length,
      message: `Attempted to convert ${imagesToProcess.length} images!`
    };
    
  } catch (error) {
    console.error('Error scanning page:', error);
    updateScanIndicator(scanIndicator, `Error: ${error.message}`, 'error');
    setTimeout(() => removeScanIndicator(scanIndicator), 5000);
    throw error;
  }
}

// Find profile images on the page
function findProfileImages() {
  const profileImages = [];
  const seenUrls = new Set(); // Track URLs to prevent duplicates
  const seenElements = new Set(); // Track DOM elements to prevent duplicates
  
  
  // Check for Netflix-specific patterns first
  const netflixHeadshotImages = document.querySelectorAll('img[class*="headshot" i], img[class*="Headshot" i]');
  console.log(`🔍 Found ${netflixHeadshotImages.length} images with "headshot" in class name`);
  netflixHeadshotImages.forEach((img, index) => {
    console.log(`   ${index + 1}. Class: "${img.className}" | Src: ${img.src}`);
  });
  
  // Look for containers with profile-related keywords in class/id
  const profileContainers = document.querySelectorAll([
    '[class*="speaker" i]',
    '[id*="speaker" i]',
    '[class*="profile" i]',
    '[id*="profile" i]',
    '[class*="team" i]',
    '[id*="team" i]',
    '[class*="member" i]',
    '[id*="member" i]',
    '[class*="management" i]',
    '[id*="management" i]',
    '[class*="leadership" i]',
    '[id*="leadership" i]',
    '[class*="headshot" i]',
    '[id*="headshot" i]'
  ].join(', '));
  
  for (const container of profileContainers) {
    const images = container.querySelectorAll('img');
    
    for (const img of images) {
      // Skip if we've already seen this exact element
      if (seenElements.has(img)) {
        continue;
      }
      
      // Skip if we've already seen this URL
      if (seenUrls.has(img.src)) {
        continue;
      }

      // Skip if this image has already been converted by our extension (extra check)
      if (isAlreadyConvertedImage(img)) {
        continue;
      }
      
      if (isProfileImage(img)) {
        profileImages.push(img);
        seenUrls.add(img.src);
        seenElements.add(img);
        console.log(`✅ Added unique profile image: ${img.src}`);
      }
    }
  }
  
  // If no profile containers found, look for direct headshot images (Netflix-style)
  if (profileImages.length === 0) {
    console.log('🔍 No profile containers found, looking for direct headshot images...');
    const directHeadshotImages = document.querySelectorAll('img[class*="headshot" i], img[class*="Headshot" i]');
    console.log(`🔍 Found ${directHeadshotImages.length} direct headshot images`);
    
    for (const img of directHeadshotImages) {
      if (seenElements.has(img) || seenUrls.has(img.src)) {
        continue;
      }
      
      if (isAlreadyConvertedImage(img)) {
        continue;
      }
      
      // For headshot images, be more lenient with validation
      const rect = img.getBoundingClientRect();
      if (rect.width >= 50 && rect.height >= 50 && rect.width <= 800 && rect.height <= 800) {
        const aspectRatio = rect.width / rect.height;
        if (aspectRatio >= 0.5 && aspectRatio <= 2.0) { // More lenient aspect ratio for headshots
          profileImages.push(img);
          seenUrls.add(img.src);
          seenElements.add(img);
          console.log(`✅ Added direct headshot image: ${img.src}`);
        } else {
          console.log(`❌ Headshot aspect ratio rejected: ${aspectRatio.toFixed(2)}`);
        }
      } else {
        console.log(`❌ Headshot size rejected: ${rect.width}x${rect.height}`);
      }
    }
  }
  
  // If still no images found, look for grid patterns
  if (profileImages.length === 0) {
    console.log('🔍 No direct headshots found, looking for image grids...');
    profileImages.push(...findImageGrids());
  }
  
  console.log(`🎯 FINAL RESULTS: Found ${profileImages.length} profile images`);
  profileImages.forEach((img, index) => {
    const rect = img.getBoundingClientRect();
    console.log(`   ${index + 1}. ${img.src} (${rect.width}x${rect.height}) at (${rect.x}, ${rect.y})`);
  });
  return profileImages;
}

// Check if an image has already been converted by our extension
function isAlreadyConvertedImage(img) {
  // Method 1: Check if the image element has our conversion markers
  if (img.dataset.originalUrl || img.dataset.transformedUrl) {
    return true;
  }

  // Method 2: Check if the image is part of our comparison container
  const parent = img.parentElement;
  if (parent && parent.classList.contains('sogni-before-after-container')) {
    return true;
  }

  // Method 3: Check if the image has our specific classes
  if (img.classList.contains('sogni-before-image') || img.classList.contains('sogni-after-image')) {
    return true;
  }

  // Method 4: Check if the image source contains our API domain patterns (converted images)
  const src = img.src.toLowerCase();
  if (src.includes('photobooth-api.sogni.ai') || 
      src.includes('photobooth-api-local.sogni.ai') ||
      src.includes('storage.googleapis.com') && src.includes('sogni')) {
    return true;
  }

  // Method 5: Check if there's a comparison container nearby (sibling or parent)
  let element = img;
  for (let i = 0; i < 3; i++) { // Check up to 3 levels
    if (element.parentElement) {
      element = element.parentElement;
      const comparisonContainer = element.querySelector('.sogni-before-after-container');
      if (comparisonContainer) {
        // Check if this image is related to the comparison container
        const containerImages = comparisonContainer.querySelectorAll('img');
        for (const containerImg of containerImages) {
          if (containerImg === img) {
            return true;
          }
        }
      }
    } else {
      break;
    }
  }

  // Method 6: Check if the image is hidden (our original images are hidden after conversion)
  const computedStyle = window.getComputedStyle(img);
  if (computedStyle.display === 'none' && img.dataset.originalUrl) {
    return true;
  }

  return false;
}

// Check if an image looks like a profile photo
function isProfileImage(img) {
  console.log(`🔍 Checking image: ${img.src}`);
  console.log(`🔍 Image class: "${img.className}"`);
  
  // Skip if this image has already been converted by our extension
  if (isAlreadyConvertedImage(img)) {
    console.log(`❌ Skipping already converted image: ${img.src}`);
    return false;
  }

  // Skip if image is too small or too large (flexible sizing)
  const rect = img.getBoundingClientRect();
  console.log(`🔍 Image dimensions: ${rect.width}x${rect.height}`);
  if (rect.width < 50 || rect.height < 50) {
    console.log(`❌ Image too small: ${rect.width}x${rect.height}`);
    return false;
  }
  if (rect.width > 800 || rect.height > 800) {
    console.log(`❌ Image too large: ${rect.width}x${rect.height}`);
    return false;
  }
  
  // Skip if image is not visible
  if (rect.width === 0 || rect.height === 0) return false;
  
  // Skip if image is hidden
  const style = window.getComputedStyle(img);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  
  // Flexible aspect ratio check (allow more variation for different sites)
  const aspectRatio = rect.width / rect.height;
  console.log(`🔍 Image aspect ratio: ${aspectRatio.toFixed(2)}`);
  if (aspectRatio < 0.5 || aspectRatio > 2.0) {
    console.log(`❌ Aspect ratio rejected: ${aspectRatio.toFixed(2)} (must be between 0.5 and 2.0)`);
    return false; // More flexible for different sites
  }
  
  // Check if image source looks like a profile photo
  const src = img.src.toLowerCase();
  if (src.includes('logo') || src.includes('icon') || src.includes('banner')) {
    return false;
  }
  
  // Check alt text
  const alt = img.alt.toLowerCase();
  if (alt.includes('logo') || alt.includes('icon') || alt.includes('banner')) {
    return false;
  }
  
  // Additional checks for common non-profile image patterns
  if (src.includes('background') || src.includes('bg-') || src.includes('decoration')) {
    return false;
  }
  
  // Check for backdrop images (Token2049 fix)
  if (src.includes('backdrop')) {
    return false;
  }
  
  // Check for background images and other decorative elements
  if (alt.includes('background') || alt.includes('decoration') || alt.includes('hero')) {
    return false;
  }
  
  // Check if image is used as CSS background (common pattern)
  const computedStyle = window.getComputedStyle(img);
  if (computedStyle.position === 'absolute' && (computedStyle.zIndex === '-1' || parseInt(computedStyle.zIndex) < 0)) {
    return false; // Likely a background image
  }
  
  // Check parent elements for background/hero/decoration classes
  let parent = img.parentElement;
  let depth = 0;
  while (parent && depth < 3) { // Check up to 3 levels up
    const parentClass = parent.className.toLowerCase();
    if (parentClass.includes('background') || parentClass.includes('hero') || 
        parentClass.includes('banner') || parentClass.includes('decoration')) {
      return false;
    }
    parent = parent.parentElement;
    depth++;
  }
  
  // Check if the image itself has profile-related classes (Netflix-style)
  const imgClass = img.className.toLowerCase();
  const imgId = img.id.toLowerCase();
  const directProfilePatterns = ['headshot', 'profile', 'avatar', 'portrait'];
  
  console.log(`🔍 Checking direct profile patterns in: "${imgClass}" "${imgId}"`);
  const matchedPattern = directProfilePatterns.find(pattern => 
    imgClass.includes(pattern) || imgId.includes(pattern)
  );
  
  if (matchedPattern) {
    console.log(`✅ Image has direct profile class (${matchedPattern}): ${imgClass} ${imgId}`);
    return true;
  } else {
    console.log(`🔍 No direct profile patterns found in image class/id`);
  }
  
  // Check for profile context but be more flexible
  let profileContext = false;
  parent = img.parentElement;
  depth = 0;
  while (parent && depth < 5) {
    const parentClass = parent.className.toLowerCase();
    const parentId = parent.id.toLowerCase();
    
    const profileContextPatterns = [
      'speaker', 'profile', 'team', 'member', 'person', 'people',
      'staff', 'employee', 'founder', 'executive', 'bio', 'about',
      'management', 'leadership', 'headshot', 'leader', 'director'
    ];
    
    if (profileContextPatterns.some(pattern => 
      parentClass.includes(pattern) || parentId.includes(pattern)
    )) {
      profileContext = true;
      console.log(`✅ Image found in profile context: ${parentClass} ${parentId}`);
      break;
    }
    parent = parent.parentElement;
    depth++;
  }
  
  if (profileContext) {
    return true;
  }
  
  // If no explicit profile context found, check if this looks like a profile image grid
  // by looking for multiple similar-sized images in the same container or nearby containers
  const parentContainer = img.parentElement;
  if (parentContainer) {
    const siblingImages = Array.from(parentContainer.querySelectorAll('img')).filter(siblingImg => {
      if (siblingImg === img || isAlreadyConvertedImage(siblingImg)) return false;
      
      const siblingRect = siblingImg.getBoundingClientRect();
      const sizeDiff = Math.abs(siblingRect.width - rect.width) + Math.abs(siblingRect.height - rect.height);
      
      // Consider images similar if they're within 100px of each other in total size difference
      return sizeDiff < 200 && siblingRect.width > 0 && siblingRect.height > 0;
    });
    
    console.log(`🔍 Found ${siblingImages.length} similar-sized sibling images in container`);
    
    // If there are similar-sized images, likely a profile grid
    if (siblingImages.length >= 1) {
      console.log(`✅ Image appears to be in a grid of ${siblingImages.length + 1} similar images`);
      return true;
    }
    
    // Also check parent's parent for a broader search (sometimes images are in nested containers)
    const grandparentContainer = parentContainer.parentElement;
    if (grandparentContainer) {
      const cousinImages = Array.from(grandparentContainer.querySelectorAll('img')).filter(cousinImg => {
        if (cousinImg === img || isAlreadyConvertedImage(cousinImg)) return false;
        
        const cousinRect = cousinImg.getBoundingClientRect();
        const sizeDiff = Math.abs(cousinRect.width - rect.width) + Math.abs(cousinRect.height - rect.height);
        
        return sizeDiff < 200 && cousinRect.width > 0 && cousinRect.height > 0;
      });
      
      console.log(`🔍 Found ${cousinImages.length} similar-sized images in grandparent container`);
      
      if (cousinImages.length >= 2) {
        console.log(`✅ Image appears to be in a broader grid of ${cousinImages.length + 1} similar images`);
        return true;
      }
    }
  }
  
  console.log(`❌ No profile context or image grid detected`);
  return false;
}

// Find image grids (fallback method)
function findImageGrids() {
  const allImages = document.querySelectorAll('img');
  
  // Group images by similar size and position using basic validation
  const imageGroups = new Map();
  
  for (const img of allImages) {
    // Use basic validation to avoid circular dependency
    if (isAlreadyConvertedImage(img)) continue;
    
    const rect = img.getBoundingClientRect();
    
    // Basic size and visibility checks
    if (rect.width < 50 || rect.height < 50) continue;
    if (rect.width > 800 || rect.height > 800) continue;
    if (rect.width === 0 || rect.height === 0) continue;
    
    // Basic aspect ratio check
    const aspectRatio = rect.width / rect.height;
    if (aspectRatio < 0.5 || aspectRatio > 2.0) continue;
    
    // Check if image is hidden
    const style = window.getComputedStyle(img);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
    
    // Skip obvious non-profile images
    const src = img.src.toLowerCase();
    if (src.includes('logo') || src.includes('icon') || src.includes('banner')) continue;
    
    const alt = img.alt.toLowerCase();
    if (alt.includes('logo') || alt.includes('icon') || alt.includes('banner')) continue;
    
    const sizeKey = `${Math.round(rect.width / 50) * 50}x${Math.round(rect.height / 50) * 50}`;
    
    if (!imageGroups.has(sizeKey)) {
      imageGroups.set(sizeKey, []);
    }
    imageGroups.get(sizeKey).push(img);
  }
  
  // Find the largest group (likely to be profile photos)
  let largestGroup = [];
  for (const group of imageGroups.values()) {
    if (group.length > largestGroup.length && group.length >= 2) {
      largestGroup = group;
    }
  }
  
  console.log(`🔍 Grid detection found ${largestGroup.length} images in largest group`);
  return largestGroup;
}

// Process images with continuous job assignment
async function processImagesBatch(images) {
  isProcessing = true;
  processingQueue = [...images];
  window.processingQueue = processingQueue; // Update global reference
  
  console.log(`Processing ${images.length} images with ${MAX_CONCURRENT_CONVERSIONS} concurrent workers`);
  
  // Track success/failure counts
  let successCount = 0;
  let failureCount = 0;
  let completedCount = 0;
  
  // Multiple bouncing Sogni logos are handled automatically by the progress overlay system
  
  try {
    // Process images continuously - assign next image to available slot
    await new Promise((resolve) => {
      const processNextImage = async () => {
        while (processingQueue.length > 0) {
          const img = processingQueue.shift(); // Remove from queue as we start processing
          const imageIndex = images.indexOf(img);
          
          // Processing image ${imageIndex + 1}/${images.length}
          
          try {
            await convertImageWithDefaultStyle(img);
            successCount++;
            // Image converted successfully
          } catch (error) {
            failureCount++;
            console.error(`❌ Image ${imageIndex + 1} conversion failed:`, error.message);
          }
          
          completedCount++;
          
          // Check if all images are done
          if (completedCount >= images.length) {
            resolve();
            return;
          }
        }
        
        // No more images for this slot
          // No more images to process
      };
      
      // Start processing in all slots
      for (let i = 0; i < MAX_CONCURRENT_CONVERSIONS; i++) {
        processNextImage();
      }
    });
    
    console.log(`Continuous processing completed: ${successCount} succeeded, ${failureCount} failed`);
    
    // Log results without showing alerts for successful conversions
    if (successCount > 0 && failureCount === 0) {
      console.log(`✅ All ${successCount} profile photos converted successfully! 🏴‍☠️`);
    } else if (successCount > 0 && failureCount > 0) {
      console.log(`⚠️ ${successCount} images converted successfully, ${failureCount} failed. Check console for errors.`);
      alert(`${successCount} images converted successfully, ${failureCount} failed. Check console for errors.`);
    } else {
      console.log(`❌ All ${failureCount} conversions failed. Check console for errors.`);
      alert(`All ${failureCount} conversions failed. Check console for errors.`);
    }
    
  } catch (error) {
    console.error('Continuous processing error:', error);
    alert(`Processing failed: ${error.message}`);
  } finally {
    // Clean up all bouncing logos and overlays
    if (progressOverlay) {
      progressOverlay.removeAllOverlays();
      progressOverlay.hideAllBouncers();
    }
    isProcessing = false;
  }
}

// Convert single image with style
async function handleConvertSingleImage(imageUrl) {
  if (isProcessing) {
    alert('Already processing images. Please wait for current conversion to complete.');
    return;
  }
  
  // Find the image element
  const img = document.querySelector(`img[src="${imageUrl}"]`);
  if (!img) {
    alert('Could not find the image on the page.');
    return;
  }
  
  await convertImageWithDefaultStyle(img);
}

// Convert individual image with style
async function convertImageWithDefaultStyle(imageElement) {
  console.log('Converting image:', imageElement.src);
  
  try {
    // Store original URL for progress tracking and hover comparison
    const originalUrl = imageElement.src;
    imageElement.dataset.originalUrl = originalUrl;
    
    // Create progress overlay (without black background)
    progressOverlay.createOverlay(imageElement);
    progressOverlay.updateProgress(imageElement, 10, 'Processing image...');
    
    // Use background script to handle the conversion (avoids CORS issues)
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Background script timeout (5 minutes)'));
      }, 300000); // 5 minute timeout
      
      chrome.runtime.sendMessage({
        action: 'convertImage',
        imageUrl: imageElement.src,
        imageSize: {
          width: imageElement.naturalWidth || imageElement.width,
          height: imageElement.naturalHeight || imageElement.height
        }
      }, (response) => {
        clearTimeout(timeout);
        
        if (chrome.runtime.lastError) {
          console.error('Chrome runtime error:', chrome.runtime.lastError);
          reject(new Error(`Runtime error: ${chrome.runtime.lastError.message}`));
        } else if (response && response.success) {
          console.log('Background script success:', response.result);
          resolve(response.result);
        } else {
          console.error('Background script error:', response);
          reject(new Error(response?.error || 'Unknown error from background script'));
        }
      });
    });
    
    progressOverlay.updateProgress(imageElement, 95, 'Replacing image...');
    
    // Replace the original image and add hover functionality
    await replaceImageWithHoverComparison(imageElement, result.transformedImageUrl);
    
    // Cache the result with default pirate style
    if (styleCacheService) {
      try {
        await styleCacheService.cacheStyledImage(
          originalUrl,
          result.transformedImageUrl,
          'pirateClassic', // Default pirate style key
          'Attractive, friendly storybook pirate portrait, watercolor-ink blend, weathered tricorn hat, eye patch, flowing beard, nautical background',
          'Pirate Classic'
        );
        console.log('Cached pirate transformation for:', originalUrl);
      } catch (cacheError) {
        console.error('Failed to cache pirate transformation:', cacheError);
      }
    }
    
    // Show success
    progressOverlay.showSuccess(imageElement);
    
    console.log('Image conversion completed successfully');
    
  } catch (error) {
    console.error('Image conversion failed:', error);
    progressOverlay.showError(imageElement, error.message);
    throw error; // Re-throw so Promise.allSettled can catch it
  }
}

// Detect if image should use responsive/percentage sizing vs fixed pixel sizing
function detectResponsiveImageSizing(originalImage, computedStyle) {
  // Check if the image uses percentage-based width/height
  const widthIsPercentage = computedStyle.width.includes('%');
  const heightIsPercentage = computedStyle.height.includes('%');
  
  // Check if the image is in a flex container
  const parentStyle = window.getComputedStyle(originalImage.parentElement);
  const isInFlexContainer = parentStyle.display === 'flex' || 
                           parentStyle.display === 'inline-flex' ||
                           computedStyle.flex !== 'none';
  
  // Check if the image is in a grid container
  const isInGridContainer = parentStyle.display === 'grid' || 
                           parentStyle.display === 'inline-grid' ||
                           computedStyle.gridArea !== 'auto / auto / auto / auto';
  
  // Check if the image has responsive CSS properties
  const hasResponsiveProps = computedStyle.maxWidth !== 'none' ||
                            computedStyle.maxHeight !== 'none' ||
                            computedStyle.minWidth !== '0px' ||
                            computedStyle.minHeight !== '0px';
  
  // Check if the image's container has responsive characteristics
  let container = originalImage.parentElement;
  let hasResponsiveContainer = false;
  let depth = 0;
  while (container && depth < 3) {
    const containerStyle = window.getComputedStyle(container);
    if (containerStyle.width.includes('%') || 
        containerStyle.maxWidth !== 'none' ||
        containerStyle.display === 'flex' ||
        containerStyle.display === 'grid') {
      hasResponsiveContainer = true;
      break;
    }
    container = container.parentElement;
    depth++;
  }
  
  // Check for common responsive image patterns in class names
  const className = originalImage.className.toLowerCase();
  const parentClassName = originalImage.parentElement?.className?.toLowerCase() || '';
  const hasResponsiveClasses = className.includes('responsive') ||
                              className.includes('fluid') ||
                              className.includes('flexible') ||
                              parentClassName.includes('responsive') ||
                              parentClassName.includes('fluid') ||
                              parentClassName.includes('grid') ||
                              parentClassName.includes('flex');
  
  // Token2049-specific patterns (speakers page layout)
  const isToken2049Pattern = className.includes('speaker') ||
                            parentClassName.includes('speaker') ||
                            parentClassName.includes('grid') ||
                            (computedStyle.width === '100%' && computedStyle.height === '100%');
  
  console.log('Responsive sizing analysis:', {
    widthIsPercentage,
    heightIsPercentage,
    isInFlexContainer,
    isInGridContainer,
    hasResponsiveProps,
    hasResponsiveContainer,
    hasResponsiveClasses,
    isToken2049Pattern,
    computedWidth: computedStyle.width,
    computedHeight: computedStyle.height,
    parentDisplay: parentStyle.display
  });
  
  // Use responsive sizing if any of these conditions are met
  return widthIsPercentage || 
         heightIsPercentage || 
         isInFlexContainer || 
         isInGridContainer || 
         hasResponsiveProps || 
         hasResponsiveContainer ||
         hasResponsiveClasses ||
         isToken2049Pattern;
}

// Replace image with Before/After scrubber comparison functionality
async function replaceImageWithHoverComparison(originalImage, pirateImageUrl) {
  return new Promise((resolve, reject) => {
    // Create new image to preload
    const newImg = new Image();
    
    newImg.onload = () => {
      // Store both URLs for comparison
      const originalUrl = originalImage.dataset.originalUrl;
      originalImage.dataset.transformedUrl = pirateImageUrl;
      
      // Get original dimensions
      const originalRect = originalImage.getBoundingClientRect();
      
      // Create Before/After comparison container
      const comparisonContainer = document.createElement('div');
      // Copy original image's class and add our own
      comparisonContainer.className = `sogni-before-after-container ${originalImage.className}`;
      console.log('🎯 Container classes:', comparisonContainer.className);
      
      // Create two image elements for comparison
      const beforeImg = document.createElement('img');
      const afterImg = document.createElement('img');
      
      beforeImg.src = originalUrl;
      afterImg.src = pirateImageUrl;
      
      // Copy original image's classes and add Sogni-specific classes
      beforeImg.className = originalImage.className + ' sogni-before-image';
      afterImg.className = originalImage.className + ' sogni-after-image';
      
      // Copy other important attributes for consistent rendering
      if (originalImage.alt) {
        beforeImg.alt = originalImage.alt;
        afterImg.alt = originalImage.alt + ' (AI Enhanced)';
      }
      if (originalImage.title) {
        beforeImg.title = originalImage.title;
        afterImg.title = originalImage.title + ' (AI Enhanced)';
      }
      if (originalImage.loading) {
        beforeImg.loading = originalImage.loading;
        afterImg.loading = originalImage.loading;
      }
      
      // Create scrubber line (hidden by default)
      const scrubberLine = document.createElement('div');
      scrubberLine.className = 'sogni-scrubber-line';
      
      // Analyze original image sizing to determine best approach
      const originalComputedStyle = window.getComputedStyle(originalImage);
      const shouldUsePercentageSizing = detectResponsiveImageSizing(originalImage, originalComputedStyle);
      
      console.log('🎯 Image replacement analysis:', {
        shouldUsePercentageSizing,
        originalClass: originalImage.className,
        parentClass: originalImage.parentElement?.className,
        originalDimensions: `${originalRect.width}x${originalRect.height}`,
        computedWidth: originalComputedStyle.width,
        computedHeight: originalComputedStyle.height
      });
      
      // Style the container to match original image
      let containerStyle;
      if (shouldUsePercentageSizing) {
        // Use responsive sizing that matches the original image's layout
        console.log('🎯 Using responsive sizing - original styles:', {
          width: originalComputedStyle.width,
          height: originalComputedStyle.height,
          display: originalComputedStyle.display,
          position: originalComputedStyle.position
        });
        
        containerStyle = `
          position: ${originalComputedStyle.position === 'static' ? 'relative' : originalComputedStyle.position};
          width: ${originalComputedStyle.width};
          height: ${originalComputedStyle.height};
          max-width: ${originalComputedStyle.maxWidth || 'none'};
          max-height: ${originalComputedStyle.maxHeight || 'none'};
          min-width: ${originalComputedStyle.minWidth || '0'};
          min-height: ${originalComputedStyle.minHeight || '0'};
          overflow: hidden;
          cursor: ew-resize;
          border-radius: ${originalComputedStyle.borderRadius || '0'};
          display: ${originalComputedStyle.display};
          flex: ${originalComputedStyle.flex || 'none'};
          flex-grow: ${originalComputedStyle.flexGrow || '0'};
          flex-shrink: ${originalComputedStyle.flexShrink || '1'};
          flex-basis: ${originalComputedStyle.flexBasis || 'auto'};
          box-sizing: ${originalComputedStyle.boxSizing || 'content-box'};
        `;
      } else {
        // Use fixed pixel sizing for traditional layouts
        containerStyle = `
          position: relative;
          width: ${originalRect.width}px;
          height: ${originalRect.height}px;
          overflow: hidden;
          cursor: ew-resize;
          border-radius: ${originalComputedStyle.borderRadius || '0'};
          display: ${originalComputedStyle.display || 'block'};
          margin: ${originalComputedStyle.margin || '0'};
          padding: ${originalComputedStyle.padding || '0'};
          box-sizing: ${originalComputedStyle.boxSizing || 'content-box'};
          vertical-align: ${originalComputedStyle.verticalAlign || 'baseline'};
        `;
      }
      comparisonContainer.style.cssText = containerStyle;
      
      // Style the images
      const imageStyle = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        user-select: none;
        pointer-events: none;
      `;
      beforeImg.style.cssText = imageStyle;
      afterImg.style.cssText = imageStyle; // Show full transformed image by default
      
      // Style the scrubber line (hidden by default)
      scrubberLine.style.cssText = `
        position: absolute;
        top: 0;
        left: 50%;
        width: 2px;
        height: 100%;
        background: white;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.3);
        z-index: 10;
        pointer-events: none;
        transform: translateX(-50%);
        opacity: 0;
        transition: opacity 0.3s ease;
      `;
      
      // Create download icon positioned outside of any masks
      const downloadIcon = document.createElement('div');
      downloadIcon.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M7 10L12 15L17 10" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M12 15V3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
      downloadIcon.className = 'sogni-download-icon';

      // Create regenerate icon positioned next to download icon
      const regenerateIcon = document.createElement('div');
      regenerateIcon.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 4V10H7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M23 20V14H17" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14L18.36 18.36A9 9 0 0 1 3.51 15" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
      regenerateIcon.className = 'sogni-regenerate-icon';
      regenerateIcon.title = 'Regenerate this image';
      
      // Position icons relative to viewport to avoid mask clipping
      const updateIconPositions = () => {
        const containerRect = comparisonContainer.getBoundingClientRect();
        // const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        // const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        
        // Position download icon (rightmost)
        downloadIcon.style.position = 'fixed';
        downloadIcon.style.top = `${containerRect.top + 10}px`;
        downloadIcon.style.left = `${containerRect.right - 42}px`; // 32px width + 10px margin
        
        // Position regenerate icon (left of download icon)
        regenerateIcon.style.position = 'fixed';
        regenerateIcon.style.top = `${containerRect.top + 10}px`;
        regenerateIcon.style.left = `${containerRect.right - 84}px`; // 32px width + 10px margin + 32px for download + 10px spacing
      };
      
      downloadIcon.style.cssText = `
        position: fixed;
        width: 32px;
        height: 32px;
        background: rgba(0, 0, 0, 0.7);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0.8;
        transition: opacity 0.3s ease, background-color 0.2s ease;
        z-index: 999999;
        pointer-events: auto;
      `;

      regenerateIcon.style.cssText = `
        position: fixed;
        width: 32px;
        height: 32px;
        background: rgba(0, 0, 0, 0.7);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0.8;
        transition: opacity 0.3s ease, background-color 0.2s ease;
        z-index: 999999;
        pointer-events: auto;
      `;
      
      // Set initial positions
      updateIconPositions();
      
      // Assemble the comparison widget (icons added to body separately)
      comparisonContainer.appendChild(beforeImg);
      comparisonContainer.appendChild(afterImg);
      comparisonContainer.appendChild(scrubberLine);
      
      // Add icons to body to avoid mask clipping
      document.body.appendChild(downloadIcon);
      document.body.appendChild(regenerateIcon);
      
      // Copy additional important styles from original image to container
      const additionalStyles = [
        'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
        'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'transform', 'transformOrigin', 'transition',
        'zIndex', 'opacity', 'visibility',
        'gridColumn', 'gridRow', 'gridArea',
        'alignSelf', 'justifySelf',
        'float', 'clear'
      ];
      
      additionalStyles.forEach(prop => {
        const value = originalComputedStyle[prop];
        if (value && value !== 'auto' && value !== 'none' && value !== 'normal') {
          comparisonContainer.style[prop] = value;
        }
      });
      
      // Ensure container is visible and has proper display
      comparisonContainer.style.visibility = 'visible';
      comparisonContainer.style.opacity = '1';
      
      console.log('🎯 Replacement container styles applied:', {
        width: comparisonContainer.style.width,
        height: comparisonContainer.style.height,
        display: comparisonContainer.style.display,
        position: comparisonContainer.style.position,
        visibility: comparisonContainer.style.visibility,
        opacity: comparisonContainer.style.opacity
      });
      
      // Replace original image with comparison container
      originalImage.parentNode.insertBefore(comparisonContainer, originalImage);
      originalImage.style.display = 'none';
      
      // Double-check that container is visible after insertion
      setTimeout(() => {
        const containerRect = comparisonContainer.getBoundingClientRect();
        console.log('🎯 Container after insertion:', {
          visible: containerRect.width > 0 && containerRect.height > 0,
          dimensions: `${containerRect.width}x${containerRect.height}`,
          position: `${containerRect.x}, ${containerRect.y}`,
          computedDisplay: window.getComputedStyle(comparisonContainer).display,
          computedVisibility: window.getComputedStyle(comparisonContainer).visibility,
          computedOpacity: window.getComputedStyle(comparisonContainer).opacity
        });
        
        if (containerRect.width === 0 || containerRect.height === 0) {
          console.error('❌ Container has zero dimensions after insertion!');
          console.error('❌ Attempting emergency fixes...');
          
          // Emergency fix: Force dimensions and display
          comparisonContainer.style.cssText = `
            position: relative !important;
            width: ${originalRect.width}px !important;
            height: ${originalRect.height}px !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            overflow: hidden !important;
            cursor: ew-resize !important;
            min-width: ${originalRect.width}px !important;
            min-height: ${originalRect.height}px !important;
            max-width: none !important;
            max-height: none !important;
            margin: ${originalComputedStyle.margin} !important;
            padding: ${originalComputedStyle.padding} !important;
            border-radius: ${originalComputedStyle.borderRadius || '0'} !important;
          `;
          
          // Also ensure the images inside are properly sized
          beforeImg.style.cssText = `
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
          `;
          
          afterImg.style.cssText = `
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
          `;
          
          console.log('🎯 Emergency fixes applied');
        }
      }, 100);
      
      // Mouse interaction for scrubber
      let isActive = false;
      
      const updateScrubber = (e) => {
        const rect = comparisonContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
        
        // Update clip path for after image
        afterImg.style.clipPath = `inset(0 ${100 - percentage}% 0 0)`;
        
        // Update scrubber line position
        scrubberLine.style.left = `${percentage}%`;
      };
      
      // Add scroll and resize listeners to keep icons positioned correctly
      const updatePositionHandler = () => updateIconPositions();
      window.addEventListener('scroll', updatePositionHandler);
      window.addEventListener('resize', updatePositionHandler);
      
      // Event listeners for scrubber interaction
      comparisonContainer.addEventListener('mouseenter', () => {
        isActive = true;
        scrubberLine.style.opacity = '1';
        downloadIcon.style.opacity = '1';
        regenerateIcon.style.opacity = '1';
        comparisonContainer.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.5)';
        // Start with 50/50 split when entering
        afterImg.style.clipPath = 'inset(0 50% 0 0)';
        scrubberLine.style.left = '50%';
        // Update icon positions when hovering
        updateIconPositions();
      });
      
      comparisonContainer.addEventListener('mouseleave', () => {
        isActive = false;
        scrubberLine.style.opacity = '0';
        downloadIcon.style.opacity = '0.8'; // Keep icons visible but dimmed
        regenerateIcon.style.opacity = '0.8';
        comparisonContainer.style.boxShadow = 'none';
        // Show full transformed image when not hovering
        afterImg.style.clipPath = 'inset(0 0% 0 0)';
      });
      
      comparisonContainer.addEventListener('mousemove', (e) => {
        if (isActive) {
          updateScrubber(e);
        }
      });
      
      // Download functionality
      downloadIcon.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const filename = `sogni-transformed-${Date.now()}.jpg`;
          await downloadImageFromUrl(pirateImageUrl, filename);
        } catch (error) {
          console.error('Download failed:', error);
        }
      });
      
      downloadIcon.addEventListener('mouseenter', () => {
        downloadIcon.style.background = 'rgba(0, 0, 0, 0.9)';
      });
      
      downloadIcon.addEventListener('mouseleave', () => {
        downloadIcon.style.background = 'rgba(0, 0, 0, 0.7)';
      });

      // Regenerate functionality
      regenerateIcon.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          // Get the original image element and its stored data
          const originalImageElement = originalImage;
          const originalUrl = originalImageElement.dataset.originalUrl;
          
          if (!originalUrl) {
            console.error('No original URL found for regeneration');
            return;
          }

          // Determine which style to use for regeneration
          let styleKey = null;
          let stylePrompt = null;
          
          // Check if we have stored style information from the last conversion
          if (userSettings.lastUsedStyle && userSettings.lastUsedStylePrompt) {
            styleKey = userSettings.lastUsedStyle;
            stylePrompt = userSettings.lastUsedStylePrompt;
          }

          console.log('Regenerating image with style:', styleKey || 'default pirate');
          
          // Show loading state on regenerate icon
          regenerateIcon.style.background = 'rgba(59, 130, 246, 0.9)';
          regenerateIcon.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="white" stroke-width="2" stroke-dasharray="31.416" stroke-dashoffset="31.416">
                <animate attributeName="stroke-dashoffset" dur="2s" values="31.416;0" repeatCount="indefinite"/>
              </circle>
            </svg>
          `;

          // Perform the regeneration
          let result;
          if (styleKey && stylePrompt) {
            // Use custom style
            result = await new Promise((resolve, reject) => {
              chrome.runtime.sendMessage({
                action: 'convertImageWithStyle',
                imageUrl: originalUrl,
                styleKey: styleKey,
                stylePrompt: stylePrompt,
                imageSize: {
                  width: originalImageElement.naturalWidth || originalImageElement.width,
                  height: originalImageElement.naturalHeight || originalImageElement.height
                }
              }, (response) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(`Runtime error: ${chrome.runtime.lastError.message}`));
                } else if (response && response.success) {
                  resolve(response.result);
                } else {
                  reject(new Error(response?.error || 'Unknown error from background script'));
                }
              });
            });
          } else {
            // Use default pirate style
            result = await new Promise((resolve, reject) => {
              chrome.runtime.sendMessage({
                action: 'convertImage',
                imageUrl: originalUrl,
                imageSize: {
                  width: originalImageElement.naturalWidth || originalImageElement.width,
                  height: originalImageElement.naturalHeight || originalImageElement.height
                }
              }, (response) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(`Runtime error: ${chrome.runtime.lastError.message}`));
                } else if (response && response.success) {
                  resolve(response.result);
                } else {
                  reject(new Error(response?.error || 'Unknown error from background script'));
                }
              });
            });
          }

          // Update the after image with the new result
          const newImageUrl = result.convertedImageUrl || result.transformedImageUrl || result.pirateImageUrl;
          if (newImageUrl) {
            afterImg.src = newImageUrl;
            // Update stored transformed URL
            originalImageElement.dataset.transformedUrl = newImageUrl;
            console.log('Image regenerated successfully');
          }

          // Reset regenerate icon
          regenerateIcon.style.background = 'rgba(0, 0, 0, 0.7)';
          regenerateIcon.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 4V10H7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M23 20V14H17" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14L18.36 18.36A9 9 0 0 1 3.51 15" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          `;

        } catch (error) {
          console.error('Regeneration failed:', error);
          
          // Reset regenerate icon to error state briefly
          regenerateIcon.style.background = 'rgba(220, 38, 38, 0.9)';
          regenerateIcon.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="white" stroke-width="2"/>
              <line x1="15" y1="9" x2="9" y2="15" stroke="white" stroke-width="2"/>
              <line x1="9" y1="9" x2="15" y2="15" stroke="white" stroke-width="2"/>
            </svg>
          `;
          
          setTimeout(() => {
            regenerateIcon.style.background = 'rgba(0, 0, 0, 0.7)';
            regenerateIcon.innerHTML = `
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 4V10H7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M23 20V14H17" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14L18.36 18.36A9 9 0 0 1 3.51 15" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            `;
          }, 2000);
        }
      });
      
      regenerateIcon.addEventListener('mouseenter', () => {
        regenerateIcon.style.background = 'rgba(0, 0, 0, 0.9)';
      });
      
      regenerateIcon.addEventListener('mouseleave', () => {
        regenerateIcon.style.background = 'rgba(0, 0, 0, 0.7)';
      });
      
      // Clean up existing elements if they exist
      if (originalImage._downloadIcon && originalImage._downloadIcon.parentNode) {
        originalImage._downloadIcon.parentNode.removeChild(originalImage._downloadIcon);
      }
      if (originalImage._regenerateIcon && originalImage._regenerateIcon.parentNode) {
        originalImage._regenerateIcon.parentNode.removeChild(originalImage._regenerateIcon);
      }
      if (originalImage._updatePositionHandler) {
        window.removeEventListener('scroll', originalImage._updatePositionHandler);
        window.removeEventListener('resize', originalImage._updatePositionHandler);
      }
      
      // Store references for cleanup
      originalImage._comparisonContainer = comparisonContainer;
      originalImage._downloadIcon = downloadIcon;
      originalImage._regenerateIcon = regenerateIcon;
      originalImage._updatePositionHandler = updatePositionHandler;
      
      resolve();
    };
    
    newImg.onerror = () => {
      reject(new Error('Failed to load converted image'));
    };
    
    newImg.src = pirateImageUrl;
  });
}

// Legacy function for compatibility (if needed elsewhere)
// async function replaceImageOnPage(originalImage, newImageUrl) {
//   return replaceImageWithHoverComparison(originalImage, newImageUrl);
// }

// Add style selector icon to the page
// Animation variables removed - no longer needed

// Format style key to display name (replicated from photobooth)
function styleIdToDisplay(styleId) {
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

// Download functionality (replicated from photobooth)
async function downloadImageFromUrl(imageUrl, filename) {
  try {
    // Detect if mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
      return await downloadImageMobile(imageUrl, filename);
    } else {
      return await downloadImageStandard(imageUrl, filename);
    }
  } catch (error) {
    console.error('Download failed:', error);
    return false;
  }
}

// Mobile download with share sheet
async function downloadImageMobile(imageUrl, filename) {
  try {
    // Method 1: Try native Web Share API first (works on modern iOS and Android)
    if (navigator.share && navigator.canShare) {
      try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], filename, { type: blob.type });
        
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Sogni Transformed Image',
            text: 'Check out this AI-transformed image!'
          });
          return true;
        }
      } catch (shareError) {
        console.log('Web Share API failed, trying fallback:', shareError);
      }
    }
    
    // Fallback to standard download
    return await downloadImageStandard(imageUrl, filename);
    
  } catch (error) {
    console.error('Mobile download failed:', error);
    return false;
  }
}

// Standard download implementation
async function downloadImageStandard(imageUrl, filename) {
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the blob URL
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    
    return true;
  } catch (error) {
    console.error('Standard download failed:', error);
    return false;
  }
}


// Show interactive animations (sloth only)
// Removed showInteractiveAnimations function - no longer needed

// Removed hideInteractiveAnimations function - no longer needed

// Static slot indicators removed - using dynamic bouncing Sogni logos instead

// Removed showSlothAnimation function - no longer needed

// Removed speech bubble functions - no longer needed




function addStyleSelectorIcon() {
  // Check if icon already exists
  if (document.getElementById('sogni-style-selector-icon')) {
    return;
  }
  
  const icon = document.createElement('div');
  icon.id = 'sogni-style-selector-icon';
  icon.className = 'sogni-style-selector-icon';
  icon.title = 'Open Sogni Vibe Explorer';
  
  // Create image element for the Sogni logo
  const logoImg = document.createElement('img');
  logoImg.src = chrome.runtime.getURL('icons/logo.png');
  logoImg.alt = 'Sogni Logo';
  logoImg.className = 'sogni-logo-img';
  
  // Add error handling - no fallbacks, just log the error
  logoImg.onerror = function() {
    console.error('❌ Logo failed to load from:', this.src);
  };
  
  icon.appendChild(logoImg);
  
  // Add click handler to toggle style explorer
  icon.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Extension icon clicked - toggle Style Explorer
    toggleStyleExplorer();
  });
  
  document.body.appendChild(icon);
  console.log('Style selector icon added to page');
}

// Get base URL based on dev mode setting
async function getBaseUrl() {
  try {
    // Check dev mode from storage
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['devMode'], resolve);
    });
    
    const isDevMode = result.devMode || false;
    console.log('Dev mode setting:', isDevMode);
    
    if (isDevMode) {
      // In dev mode, try local development server first
      const localUrl = 'https://photobooth-local.sogni.ai'; // Local development URL
      console.log('Dev mode enabled, attempting to use local URL:', localUrl);
      
      try {
        // Simple connectivity check - just try to create the URL
        // If localhost is not available, the iframe will handle the error
        // and we can fall back in the iframe's onerror handler
        console.log('Using local development URL:', localUrl);
        return localUrl;
      } catch (error) {
        console.log('Error with local URL, falling back to production:', error);
      }
    }
    
    // Use production URL
    const productionUrl = 'https://photobooth.sogni.ai';
    console.log('Using production URL:', productionUrl);
    return productionUrl;
  } catch (error) {
    console.log('Error checking dev mode, defaulting to production:', error);
    return 'https://photobooth.sogni.ai';
  }
}

// Toggle the Sogni Style Explorer overlay
function toggleStyleExplorer() {
  console.log('toggleStyleExplorer called');
  const existingOverlay = document.getElementById('sogni-style-explorer-overlay');
  
  if (existingOverlay) {
    console.log('Style Explorer already open, closing it...');
    closeStyleExplorer();
  } else {
    console.log('Opening Style Explorer...');
    openStyleExplorer().catch(error => {
      console.error('Error opening Style Explorer:', error);
    });
  }
}

// Open the Sogni Style Explorer overlay
async function openStyleExplorer() {
  // Check if overlay already exists
  const existingOverlay = document.getElementById('sogni-style-explorer-overlay');
  if (existingOverlay) {
    console.log('Style Explorer already open, ignoring request to open another');
    return;
  }
  
  console.log('Opening Sogni Style Explorer...');
  
  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'sogni-style-explorer-overlay';
  overlay.className = 'sogni-style-explorer-overlay';
  
  // Create iframe to load the main Sogni app directly to Style Explorer
  const iframe = document.createElement('iframe');
  
  // Get the correct base URL based on dev mode
  console.log('Getting base URL for Style Explorer...');
  const baseUrl = await getBaseUrl();
  console.log('Base URL resolved to:', baseUrl);
  
  const params = new URLSearchParams({
    page: 'prompts',
    extension: 'true',
    skipWelcome: 'true',
    t: Date.now().toString()
  });
  
  const fullUrl = `${baseUrl}/?${params.toString()}`;
  console.log('Loading Style Explorer at URL:', fullUrl);
  
  iframe.src = fullUrl;
  iframe.className = 'sogni-style-explorer-iframe';
  iframe.allow = 'camera; microphone';
  
  // Add error handling for iframe loading
  iframe.onerror = function() {
    console.error('Failed to load Style Explorer iframe');
    // NEVER fallback to production in dev mode - fail explicitly
    if (baseUrl.includes('localhost') || baseUrl.includes('local')) {
      console.error('❌ LOCAL DEVELOPMENT SERVER FAILED - NOT FALLING BACK TO PRODUCTION');
      console.error('Please ensure your local development server is running');
      
      // Notify popup about the error
      try {
        chrome.runtime.sendMessage({ action: 'styleExplorerFailed', error: 'Local development server not available' });
      } catch (notifyError) {
        console.error('Failed to notify popup about local server error:', notifyError);
      }
    }
  };
  
  // Create close button (floating over iframe)
  const closeButton = document.createElement('button');
  closeButton.className = 'sogni-style-explorer-close';
  closeButton.innerHTML = '✕';
  closeButton.title = 'Close Vibe Explorer';
  closeButton.addEventListener('click', closeStyleExplorer);
  
  // Assemble overlay - just iframe and floating close button
  overlay.appendChild(iframe);
  overlay.appendChild(closeButton);
  
  // Add to page
  document.body.appendChild(overlay);
  
  // Listen for messages from the iframe
  window.addEventListener('message', handleStyleExplorerMessage);
  
  // Send initialization message once iframe loads
  let messagesSent = false;
  iframe.onload = function() {
    if (messagesSent) return; // Prevent duplicate messages
    messagesSent = true;
    
    console.log('Style Explorer loaded');
    
    // Notify popup that Style Explorer opened successfully
    try {
      chrome.runtime.sendMessage({ action: 'styleExplorerOpened' });
      console.log('Notified popup that Style Explorer opened');
    } catch (error) {
      console.error('Failed to notify popup:', error);
    }
    
    // No message needed - React app should navigate to prompts page automatically
    // The extension URL already includes page=prompts parameter
  };
  
  iframe.onerror = function(error) {
    console.error('❌ Iframe failed to load:', error);
    
    // Notify popup that Style Explorer failed to open
    try {
      chrome.runtime.sendMessage({ action: 'styleExplorerFailed', error: error.toString() });
      console.log('Notified popup that Style Explorer failed');
    } catch (notifyError) {
      console.error('Failed to notify popup about error:', notifyError);
    }
  };
  
  // Prevent body scrolling
  document.body.style.overflow = 'hidden';
}

// Close the style explorer
function closeStyleExplorer() {
  const overlay = document.getElementById('sogni-style-explorer-overlay');
  if (overlay) {
    // Add closing animation
    overlay.style.animation = 'sogni-slide-out 0.3s cubic-bezier(0.55, 0.055, 0.675, 0.19)';
    
    // Remove after animation completes
    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.remove();
      }
    }, 300);
  }
  
  // Remove message listener
  window.removeEventListener('message', handleStyleExplorerMessage);
  
  // Restore body scrolling
  document.body.style.overflow = '';
  
  console.log('Style explorer closing...');
}

// Handle messages from the style explorer iframe
function handleStyleExplorerMessage(event) {
  // Only accept messages from our domain (including localhost for dev)
  const isValidOrigin = event.origin.includes('sogni.ai') || 
                       event.origin.includes('localhost') ||
                       event.origin.includes('127.0.0.1');
  
  // Only log important messages, not all the noise
  if (['styleSelected', 'useThisStyle'].includes(event.data?.type)) {
    console.log('Style Explorer message:', event.data?.type);
  }
  
  if (!isValidOrigin && !['styleSelected', 'useThisStyle'].includes(event.data?.type)) {
    return; // Silently reject unimportant messages from invalid origins
  }
  
  if (event.data.type === 'styleSelected') {
    const { styleKey, stylePrompt } = event.data;
    console.log(`🎨 Style selected: ${styleKey}`);
    console.log(`📝 Style prompt: ${stylePrompt}`);
    
    // Save the selected style as user's last used style
    if (userSettings.rememberLastStyle) {
      updateUserSetting('lastUsedStyle', styleKey);
      updateUserSetting('lastUsedStylePrompt', stylePrompt);
    }
    
    // Close the style explorer
    closeStyleExplorer();
    
    // Start processing images with the selected style
    processImagesWithStyle(styleKey, stylePrompt);
  } else if (event.data.type === 'useThisStyle') {
    // Handle "Use This Style" button clicks from the gallery
    const { promptKey, stylePrompt } = event.data;
    // Style selected from explorer
    console.log(`📝 Style prompt: ${stylePrompt}`);
    
    // Use the provided stylePrompt or get it from our lookup
    const finalStylePrompt = stylePrompt || getStylePromptForKey(promptKey);
    // Using style prompt for processing
    
    // Save the selected style as user's last used style
    if (userSettings.rememberLastStyle) {
      updateUserSetting('lastUsedStyle', promptKey);
      updateUserSetting('lastUsedStylePrompt', finalStylePrompt);
    }
    
    // Close the style explorer
    closeStyleExplorer();
    
    // Start processing images with the selected style
    processImagesWithStyle(promptKey, finalStylePrompt);
  } else {
    console.log('❓ Unknown message type:', event.data.type);
    console.log('🔍 Available message types: styleSelected, useThisStyle');
  }
}

// Helper function to get style prompt for a given key
function getStylePromptForKey(promptKey) {
  // This is a simplified version - in a real implementation, you'd want to 
  // load the actual prompts.json data or get it from the iframe
  const commonPrompts = {
    'pirateClassic': 'Attractive, friendly storybook pirate portrait, watercolor-ink blend, weathered tricorn hat, eye patch, flowing beard, nautical background',
    'animeKawaii': 'Attractive, anime-style cute portrait, large expressive eyes, floating heart symbols, cute cat ears, kawaii style, vibrant, psychedlic',
    'vintageSepia': 'Attractive, antique daguerreotype portrait, subtle silvering, believable plate blur',
    'comicManga': 'Attractive, color manga portrait, dramatic shōnen eyes, action panels, comic strip',
    // Add more as needed, or implement a proper lookup
  };
  
  return commonPrompts[promptKey] || `Transform into ${promptKey} style`;
}

// Process images with selected style
async function processImagesWithStyle(styleKey, stylePrompt) {
  console.log(`Processing images with style: ${styleKey}`);
  
  // Show scan indicator
  const styleDisplayName = styleIdToDisplay(styleKey);
  const scanIndicator = showScanIndicator(`Finding profile photos for ${styleDisplayName} conversion...`);
  
  try {
    // Find profile images
    const profileImages = findProfileImages();
    
    if (profileImages.length === 0) {
      updateScanIndicator(scanIndicator, 'No profile photos found on this page', 'error');
      setTimeout(() => removeScanIndicator(scanIndicator), 3000);
      return;
    }
    
    // Limit the number of images processed per page
    const imagesToProcess = profileImages.slice(0, MAX_IMAGES_PER_PAGE);
    if (profileImages.length > MAX_IMAGES_PER_PAGE) {
      console.log(`Found ${profileImages.length} profile images, limiting to ${MAX_IMAGES_PER_PAGE} for performance`);
      updateScanIndicator(scanIndicator, `Converting ${MAX_IMAGES_PER_PAGE} of ${profileImages.length} images with ${styleDisplayName}...`, 'success');
    } else {
      console.log(`Found ${profileImages.length} profile images`);
      updateScanIndicator(scanIndicator, `Converting ${profileImages.length} images with ${styleDisplayName}...`, 'success');
    }
    
    // Process images with the selected style
    await processImagesBatchWithStyle(imagesToProcess, styleKey, stylePrompt);
    
    // Remove scan indicator after completion
    removeScanIndicator(scanIndicator);
    
    console.log(`Completed ${styleKey} conversion for ${imagesToProcess.length} images`);
    
  } catch (error) {
    console.error('Error processing images with style:', error);
    updateScanIndicator(scanIndicator, `Error: ${error.message}`, 'error');
    setTimeout(() => removeScanIndicator(scanIndicator), 5000);
  }
}

// Process images with custom style using continuous assignment
async function processImagesBatchWithStyle(images, styleKey, stylePrompt) {
  isProcessing = true;
  processingQueue = [...images];
  window.processingQueue = processingQueue; // Update global reference
  
  console.log(`Processing ${images.length} images with ${styleKey} using ${MAX_CONCURRENT_CONVERSIONS} concurrent workers`);
  
  // Track success/failure counts
  let successCount = 0;
  let failureCount = 0;
  let completedCount = 0;
  // Multiple bouncing Sogni logos are handled automatically by the progress overlay system
  
  try {
    // Process images continuously - assign next image to available slot
    await new Promise((resolve) => {
      const processNextImage = async () => {
        while (processingQueue.length > 0) {
          const img = processingQueue.shift(); // Remove from queue as we start processing
          const imageIndex = images.indexOf(img);
          
          // Processing image with style
          
          try {
            await convertImageWithStyle(img, styleKey, stylePrompt);
            successCount++;
            // Image converted successfully
          } catch (error) {
            failureCount++;
            console.error(`❌ Image ${imageIndex + 1} conversion failed:`, error.message);
          }
          
          completedCount++;
          
          // Check if all images are done
          if (completedCount >= images.length) {
            resolve();
            return;
          }
        }
        
        // No more images for this slot
      };
      
      // Start processing in all slots
      for (let i = 0; i < MAX_CONCURRENT_CONVERSIONS; i++) {
        processNextImage();
      }
    });
    
    console.log(`Continuous processing completed with ${styleKey}: ${successCount} succeeded, ${failureCount} failed`);
    
  } catch (error) {
    console.error('Error in continuous processing with style:', error);
  } finally {
    // Clean up all bouncing logos and overlays
    if (progressOverlay) {
      progressOverlay.removeAllOverlays();
      progressOverlay.hideAllBouncers();
    }
    isProcessing = false;
  }
}

// Convert individual image with custom style
async function convertImageWithStyle(imageElement, styleKey, stylePrompt) {
  console.log(`Converting image with style: ${styleKey}`, imageElement.src);
  
  try {
    // Store original URL for progress tracking and hover comparison
    const originalUrl = imageElement.src;
    imageElement.dataset.originalUrl = originalUrl;
    
    // Create progress overlay
    progressOverlay.createOverlay(imageElement);
    const styleDisplayName = styleIdToDisplay(styleKey);
    progressOverlay.updateProgress(imageElement, 10, `Processing with ${styleDisplayName}...`);
    
    // Use background script to handle the conversion with custom style
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Background script timeout (5 minutes)'));
      }, 300000); // 5 minute timeout
      
      chrome.runtime.sendMessage({
        action: 'convertImageWithStyle',
        imageUrl: imageElement.src,
        styleKey: styleKey,
        stylePrompt: stylePrompt,
        imageSize: {
          width: imageElement.naturalWidth || imageElement.width,
          height: imageElement.naturalHeight || imageElement.height
        }
      }, (response) => {
        clearTimeout(timeout);
        
        if (chrome.runtime.lastError) {
          console.error('Chrome runtime error:', chrome.runtime.lastError);
          reject(new Error(`Runtime error: ${chrome.runtime.lastError.message}`));
        } else if (response && response.success) {
          console.log('Background script success:', response.result);
          resolve(response.result);
        } else {
          console.error('Background script error:', response);
          reject(new Error(response?.error || 'Unknown error from background script'));
        }
      });
    });
    
    progressOverlay.updateProgress(imageElement, 95, 'Replacing image...');
    
    // Replace the original image and add hover functionality
    await replaceImageWithHoverComparison(imageElement, result.convertedImageUrl);
    
    // Cache the result with custom style
    if (styleCacheService) {
      try {
        const styleDisplayName = styleIdToDisplay(styleKey);
        await styleCacheService.cacheStyledImage(
          originalUrl,
          result.convertedImageUrl,
          styleKey,
          stylePrompt,
          styleDisplayName
        );
        console.log(`Cached ${styleKey} transformation for:`, originalUrl);
      } catch (cacheError) {
        console.error(`Failed to cache ${styleKey} transformation:`, cacheError);
      }
    }
    
    // Show success
    progressOverlay.showSuccess(imageElement);
    
    console.log(`Image conversion completed successfully with ${styleKey}`);
    
  } catch (error) {
    console.error(`Image conversion failed with ${styleKey}:`, error);
    progressOverlay.showError(imageElement, error.message);
    throw error; // Re-throw so Promise.allSettled can catch it
  }
}

// Scan indicator functions
function showScanIndicator(message) {
  const indicator = document.createElement('div');
  indicator.className = 'sogni-scan-indicator';
  indicator.innerHTML = `
    <span>🔍</span>
    <span class="message">${message}</span>
  `;
  document.body.appendChild(indicator);
  return indicator;
}

function updateScanIndicator(indicator, message, type = 'processing') {
  if (!indicator) return;
  
  const messageEl = indicator.querySelector('.message');
  if (messageEl) {
    messageEl.textContent = message;
  }
  
  // Update icon based on type
  const iconEl = indicator.querySelector('span:first-child');
  if (iconEl) {
    switch (type) {
      case 'success':
        iconEl.textContent = '✅';
        indicator.classList.add('success');
        break;
      case 'error':
        iconEl.textContent = '❌';
        indicator.classList.add('error');
        break;
      default:
        iconEl.textContent = '🔍';
        break;
    }
  }
}

function removeScanIndicator(indicator) {
  if (indicator && indicator.parentNode) {
    indicator.style.opacity = '0';
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    }, 300);
  }
}

// Restore cached images on page load
async function restoreCachedImagesOnPageLoad() {
  if (!styleCacheService) return;
  
  try {
    console.log('Checking for cached images to restore on page load...');
    const cachedStyles = styleCacheService.getCachedStyles();
    
    if (cachedStyles.length === 0) {
      console.log('No cached images found for this site');
      return;
    }
    
    console.log(`Found ${cachedStyles.length} cached images for this site`);
    let restoredCount = 0;
    
    // Try to find and restore cached images
    for (const cachedImage of cachedStyles) {
      // Look for the original image on the current page
      const originalImg = document.querySelector(`img[src="${cachedImage.originalUrl}"]`);
      
      if (originalImg && !originalImg.dataset.transformedUrl) {
        try {
          // Store the cached URLs in dataset
          originalImg.dataset.originalUrl = cachedImage.originalUrl;
          originalImg.dataset.transformedUrl = cachedImage.transformedUrl;
          
          // Replace with hover comparison (reuse existing function)
          await replaceImageWithHoverComparison(originalImg, cachedImage.transformedUrl);
          restoredCount++;
          
          console.log(`Restored cached image: ${cachedImage.styleDisplayName} for ${cachedImage.originalUrl}`);
        } catch (error) {
          console.error('Error restoring cached image:', error);
        }
      }
    }
    
    if (restoredCount > 0) {
      console.log(`✅ Restored ${restoredCount} cached images on page load`);
      
      // Show a brief notification to user
      showRestoreNotification(restoredCount);
    }
  } catch (error) {
    console.error('Error restoring cached images on page load:', error);
  }
}

// Show notification that cached images were restored
function showRestoreNotification(count) {
  const notification = document.createElement('div');
  notification.className = 'sogni-restore-notification';
  notification.innerHTML = `
    <span class="icon">💾</span>
    <span class="message">Restored ${count} cached image${count > 1 ? 's' : ''}</span>
  `;
  
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(33, 150, 243, 0.95);
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: 999999;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    animation: sogni-slide-in-right 0.3s ease-out;
    pointer-events: none;
  `;
  
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'sogni-slide-out-right 0.3s ease-in';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// Add some basic styles
const style = document.createElement('style');
style.textContent = `
  .sogni-converting {
    filter: brightness(0.7) saturate(0.8);
    transition: filter 0.3s ease;
  }
  
  @keyframes sogni-slide-in-right {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes sogni-slide-out-right {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);
