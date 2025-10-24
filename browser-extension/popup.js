// Popup Script for Sogni Photobooth Extension
console.log('Sogni Photobooth Extension: Popup script loaded');

let api = null;
let sessionStats = {
  imagesFound: 0,
  imagesConverted: 0,
  startTime: null
};

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Extension popup opened - loading settings');
  
  // Load dev mode setting
  await loadDevModeSettings();
  
  // Load debug settings
  await loadDebugSettings();
  
  // Load user settings from current page
  await loadUserSettings();
  
  // Load cached styles for current site
  await loadCachedStyles();
  
  // Check for restorable cached images
  await checkForRestorableImages();
  
  // Setup event listeners
  setupEventListeners();
  
  console.log('Extension popup ready - waiting for user to click "Open Style Explorer"');
});

// Inject content scripts and activate extension (only when user clicks extension icon)
async function injectContentScriptsAndActivate() {
  console.log('Injecting content scripts with user permission...');
  
  try {
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      throw new Error('No active tab found');
    }
    
    console.log('Active tab found:', tab.url);
    
    // Inject content scripts using scripting API (requires user permission via activeTab)
    console.log('Injecting content scripts...');
    
    // Inject CSS first
    try {
      console.log('Injecting CSS...');
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css']
      });
      console.log('CSS injected successfully');
    } catch (cssError) {
      console.error('Failed to inject CSS:', cssError);
      throw new Error(`CSS injection failed: ${cssError.message}`);
    }
    
    // Inject JavaScript files in order
    try {
      console.log('Injecting settings-service.js...');
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['settings-service.js']
      });
      console.log('settings-service.js injected successfully');
    } catch (settingsError) {
      console.error('Failed to inject settings-service.js:', settingsError);
      throw new Error(`Settings service injection failed: ${settingsError.message}`);
    }
    
    try {
      console.log('Injecting cache-service.js...');
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['cache-service.js']
      });
      console.log('cache-service.js injected successfully');
    } catch (cacheError) {
      console.error('Failed to inject cache-service.js:', cacheError);
      throw new Error(`Cache service injection failed: ${cacheError.message}`);
    }
    
    try {
      console.log('Injecting api-service.js...');
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['api-service.js']
      });
      console.log('api-service.js injected successfully');
    } catch (apiError) {
      console.error('Failed to inject api-service.js:', apiError);
      throw new Error(`API service injection failed: ${apiError.message}`);
    }
    
    try {
      console.log('Injecting progress-overlay.js...');
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['progress-overlay.js']
      });
      console.log('progress-overlay.js injected successfully');
    } catch (overlayError) {
      console.error('Failed to inject progress-overlay.js:', overlayError);
      throw new Error(`Progress overlay injection failed: ${overlayError.message}`);
    }
    
    try {
      console.log('Injecting content.js...');
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      console.log('content.js injected successfully');
      
      // Also inject a simple test script to verify execution
      console.log('Injecting test script to verify execution...');
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          console.log('🎯 TEST SCRIPT: Extension script execution verified on page');
          // Add a global flag to indicate scripts are loaded
          window.sogniExtensionLoaded = true;
        }
      });
      console.log('Test script injected successfully');
      
    } catch (contentError) {
      console.error('Failed to inject content.js:', contentError);
      throw new Error(`Content script injection failed: ${contentError.message}`);
    }
    
    console.log('Content scripts injected successfully');
    
    // Wait briefly for scripts to initialize
    console.log('Waiting for content scripts to initialize...');
    await new Promise(resolve => setTimeout(resolve, 200)); // Reduced from 2000ms to 200ms
    
    // First check if our test script executed
    try {
      console.log('Checking if test script executed...');
      const scriptCheckResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return {
            testScriptLoaded: window.sogniExtensionLoaded === true,
            userAgent: navigator.userAgent,
            url: window.location.href
          };
        }
      });
      console.log('Script execution check result:', scriptCheckResult[0].result);
      
      if (!scriptCheckResult[0].result.testScriptLoaded) {
        throw new Error('Test script did not execute - possible CSP or script blocking issue');
      }
    } catch (scriptCheckError) {
      console.error('Script execution check failed:', scriptCheckError);
    }
    
    // Test if content script is responsive before proceeding
    try {
      console.log('Testing content script communication...');
      const testResponse = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
      console.log('Content script responded:', testResponse);
    } catch (testError) {
      console.error('Content script not responding, will retry injection...');
      // Wait a bit more and try again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Now try to open Style Explorer
    await activateExtensionAndOpenStyleExplorer();
    
  } catch (error) {
    console.error('Failed to inject content scripts:', error);
    throw error;
  }
}

// Load debug settings
async function loadDebugSettings() {
  try {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['debugSettings'], resolve);
    });
    
    const debugSettings = result.debugSettings || {
      maxImages: 32,
      maxConcurrent: 8
    };
    
    const maxImagesInput = document.getElementById('max-images');
    const maxConcurrentInput = document.getElementById('max-concurrent');
    
    if (maxImagesInput) {
      maxImagesInput.value = debugSettings.maxImages;
    }
    if (maxConcurrentInput) {
      maxConcurrentInput.value = debugSettings.maxConcurrent;
    }
    
    console.log('Debug settings loaded:', debugSettings);
  } catch (error) {
    console.error('Error loading debug settings:', error);
  }
}

// Load user settings from content script
async function loadUserSettings() {
  try {
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // Request user settings from content script
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getUserSettings' });
      if (response && response.success) {
        const userSettings = response.settings;
        console.log('User settings loaded from content script:', userSettings);
        
        // Update UI with user settings
        updateUserSettingsUI(userSettings);
      }
    } catch (error) {
      console.log('Content script not ready yet, user settings will load when available');
    }
  } catch (error) {
    console.error('Error loading user settings:', error);
  }
}

// Load cached styles directly from chrome.storage.local (doesn't require content script)
async function loadCachedStyles() {
  try {
    // Get current active tab to determine hostname
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const hostname = new URL(tab.url).hostname;
    
    // Create a cache service instance for popup context
    // We can't use the full cache service here since it expects DOM context
    // So we'll just read the data directly
    const cacheKey = `sogni_style_cache_${hostname}`;
    
    // Get cached styles directly from chrome.storage.local
    const result = await new Promise((resolve) => {
      chrome.storage.local.get([cacheKey], resolve);
    });
    
    const cached = result[cacheKey];
    if (!cached || !Array.isArray(cached)) {
      console.log('No cached styles found for', hostname);
      return;
    }

    const maxCacheAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    const now = Date.now();
    
    // Filter out expired entries
    const validStyles = cached.filter(style => {
      return (now - style.timestamp) < maxCacheAge;
    });

    if (validStyles.length === 0) {
      console.log('No valid cached styles found for', hostname);
      return;
    }

    // Group styles by style key and count images
    const grouped = {};
    validStyles.forEach(style => {
      const styleName = style.styleDisplayName;
      if (!grouped[styleName]) {
        grouped[styleName] = {
          styleKey: style.styleKey,
          styleDisplayName: styleName,
          imageCount: 0,
          lastUsed: style.timestamp
        };
      }
      grouped[styleName].imageCount++;
      grouped[styleName].lastUsed = Math.max(grouped[styleName].lastUsed, style.timestamp);
    });

    // Convert to array and sort by last used
    const cachedStyles = Object.values(grouped).sort((a, b) => b.lastUsed - a.lastUsed);
    
    console.log('Cached styles loaded directly from chrome.storage.local:', cachedStyles);
    
    // Update UI with cached styles
    updateCachedStylesUI(cachedStyles);
    
    // Also check for restorable images
    checkForRestorableImagesFromCache(validStyles, tab);
    
  } catch (error) {
    console.error('Error loading cached styles from chrome.storage.local:', error);
  }
}

// Check for restorable cached images from cache data (doesn't require content script)
async function checkForRestorableImagesFromCache(cachedStyles, tab) {
  try {
    // We can't directly check the DOM from popup, but we can show the restore option
    // if there are cached images for this site. The actual check will happen when
    // content script is injected and user clicks restore.
    
    if (cachedStyles && cachedStyles.length > 0) {
      const totalImages = cachedStyles.reduce((sum, style) => sum + style.imageCount, 0);
      console.log(`Found ${totalImages} cached images that might be restorable`);
      
      // Show restore section - the actual restoration will inject content script if needed
      updateRestoreCacheUI(true, totalImages);
    } else {
      updateRestoreCacheUI(false, 0);
    }
  } catch (error) {
    console.error('Error checking for restorable images from cache:', error);
  }
}

// Check for restorable cached images (fallback for when content script is available)
async function checkForRestorableImages() {
  try {
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // Request check for restorable images from content script
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'checkForRestorableImages' });
      if (response && response.success) {
        console.log('Restorable images check:', response);
        
        // Update UI with restorable images info
        updateRestoreCacheUI(response.hasRestorableImages, response.restorableCount);
      }
    } catch (error) {
      console.log('Content script not ready yet, will check from cache instead');
      // This is expected when content script isn't injected yet
    }
  } catch (error) {
    console.error('Error checking for restorable images:', error);
  }
}

// Update UI with user settings
function updateUserSettingsUI(userSettings) {
  // Show last used style if available
  const lastStyleSection = document.getElementById('last-style-section');
  const lastStyleName = document.getElementById('last-style-name');
  const useLastStyleBtn = document.getElementById('use-last-style-btn');
  
  if (userSettings.lastUsedStyle && lastStyleSection && lastStyleName && useLastStyleBtn) {
    const styleDisplayName = styleIdToDisplay(userSettings.lastUsedStyle);
    lastStyleName.textContent = styleDisplayName;
    lastStyleSection.style.display = 'block';
  } else if (lastStyleSection) {
    lastStyleSection.style.display = 'none';
  }
  
  // Update debug settings with user preferences
  const maxImagesInput = document.getElementById('max-images');
  const maxConcurrentInput = document.getElementById('max-concurrent');
  
  if (userSettings.preferredMaxImages && maxImagesInput) {
    maxImagesInput.value = userSettings.preferredMaxImages;
  }
  if (userSettings.preferredMaxConcurrent && maxConcurrentInput) {
    maxConcurrentInput.value = userSettings.preferredMaxConcurrent;
  }
}

// Update UI with cached styles
function updateCachedStylesUI(cachedStyles) {
  const cachedStylesSection = document.getElementById('cached-styles-section');
  const cachedStylesCount = document.getElementById('cached-styles-count');
  const cachedStylesSelect = document.getElementById('cached-styles-select');
  const applyCachedStyleBtn = document.getElementById('apply-cached-style-btn');
  
  if (!cachedStylesSection || !cachedStylesCount || !cachedStylesSelect || !applyCachedStyleBtn) {
    console.error('Cached styles UI elements not found');
    return;
  }
  
  if (cachedStyles && cachedStyles.length > 0) {
    // Show cached styles section
    cachedStylesSection.style.display = 'block';
    
    // Update count
    const totalImages = cachedStyles.reduce((sum, style) => sum + style.imageCount, 0);
    cachedStylesCount.textContent = `${cachedStyles.length} styles saved (${totalImages} images)`;
    
    // Clear and populate dropdown
    cachedStylesSelect.innerHTML = '<option value="">Select a saved style...</option>';
    
    cachedStyles.forEach(style => {
      const option = document.createElement('option');
      option.value = style.styleKey;
      option.textContent = `${style.styleDisplayName} (${style.imageCount} images)`;
      cachedStylesSelect.appendChild(option);
    });
    
    console.log(`Updated cached styles UI with ${cachedStyles.length} styles`);
  } else {
    // Hide cached styles section if no styles
    cachedStylesSection.style.display = 'none';
  }
}

// Update UI with restorable cache info
function updateRestoreCacheUI(hasRestorableImages, restorableCount) {
  const restoreCacheSection = document.getElementById('restore-cache-section');
  const restoreCacheCount = document.getElementById('restore-cache-count');
  
  if (!restoreCacheSection || !restoreCacheCount) {
    console.error('Restore cache UI elements not found');
    return;
  }
  
  if (hasRestorableImages && restorableCount > 0) {
    // Show restore cache section
    restoreCacheSection.style.display = 'block';
    
    // Update count
    restoreCacheCount.textContent = `${restorableCount} cached image${restorableCount > 1 ? 's' : ''} can be restored`;
    
    console.log(`Updated restore cache UI with ${restorableCount} restorable images`);
  } else {
    // Hide restore cache section if no restorable images
    restoreCacheSection.style.display = 'none';
  }
}

// Format style key to display name (replicated from content script)
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

// Load dev mode settings
async function loadDevModeSettings() {
  try {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['devMode'], resolve);
    });
    
    const isDevMode = result.devMode || false;
    const toggle = document.getElementById('dev-mode-toggle');
    if (toggle) {
      toggle.checked = isDevMode;
    }
    
    console.log('Dev mode loaded:', isDevMode);
  } catch (error) {
    console.error('Error loading dev mode settings:', error);
  }
}

// Activate extension and directly open Style Explorer
async function activateExtensionAndOpenStyleExplorer() {
  console.log('Activating extension and opening Style Explorer directly...');
  
  try {
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      throw new Error('No active tab found');
    }
    
    console.log('Active tab found:', tab.url);
    
    // Send message to content script to open Style Explorer directly
    console.log('Sending message to open Style Explorer directly...');
    
    try {
      // Try multiple times with delays to allow content script to load
      let response = null;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts && !response) {
        try {
          if (attempts > 0) {
            console.log(`Retry attempt ${attempts} to open Style Explorer...`);
            await new Promise(resolve => setTimeout(resolve, 300)); // Wait 300ms between attempts
          }
          response = await chrome.tabs.sendMessage(tab.id, { action: 'openStyleExplorerDirect' });
          console.log('Style Explorer opened successfully:', response);
          break;
        } catch (retryError) {
          attempts++;
          if (attempts >= maxAttempts) {
            throw retryError;
          }
          console.log(`Attempt ${attempts} failed, retrying...`);
        }
      }
    } catch (messageError) {
      console.error('Failed to open Style Explorer after retries:', messageError);
      console.log('This might be because the content script is not yet loaded on this page.');
      
      // Fallback 1 - try to activate extension first, then open Style Explorer
      try {
        console.log('Attempting to activate extension first...');
        await chrome.tabs.sendMessage(tab.id, { action: 'activateExtension' });
        console.log('Extension activated, now trying to open Style Explorer...');
        
        // Wait a moment for activation to complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Try again to open Style Explorer
        const secondAttempt = await chrome.tabs.sendMessage(tab.id, { action: 'openStyleExplorerDirect' });
        console.log('Style Explorer opened on second attempt:', secondAttempt);
        
      } catch (fallbackError) {
        console.error('Fallback activation also failed:', fallbackError);
        console.log('The page might not support the extension or content script failed to load.');
        
        // Final fallback - try to inject and execute script directly
        try {
          console.log('Attempting direct script injection...');
          
          // Get dev mode setting to pass to injected script
          const result = await new Promise((resolve) => {
            chrome.storage.local.get(['devMode'], resolve);
          });
          const isDevMode = result.devMode || false;
          
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (devMode) => {
              // Direct inline Style Explorer creation
              console.log('Direct script execution - creating Style Explorer overlay');
              
              // Check if overlay already exists
              if (document.getElementById('sogni-style-explorer-overlay')) {
                console.log('Style Explorer overlay already exists');
                return;
              }
              
              // Determine the correct URL based on dev mode
              let baseUrl;
              if (devMode) {
                baseUrl = 'https://photobooth-local.sogni.ai';
                console.error('❌ LOCAL DEVELOPMENT MODE - DIRECT INJECTION SHOULD NOT BE USED');
                console.error('Please ensure your local development server is running');
                // In dev mode, we should NOT create the overlay - fail explicitly
                alert('Local development mode is enabled but local server is not available. Please start your local development server.');
                return;
              } else {
                baseUrl = 'https://photobooth.sogni.ai';
              }
              
              // Create overlay
              const overlay = document.createElement('div');
              overlay.id = 'sogni-style-explorer-overlay';
              overlay.style.cssText = `
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                background: transparent !important;
                z-index: 999999 !important;
              `;
              
              // Create iframe
              const iframe = document.createElement('iframe');
              iframe.src = `${baseUrl}/?page=prompts&extension=true&skipWelcome=true&t=${Date.now()}`;
              iframe.style.cssText = `
                width: 100% !important;
                height: 100% !important;
                border: none !important;
                background: transparent !important;
              `;
              
              // Create close button
              const closeButton = document.createElement('button');
              closeButton.innerHTML = '✕';
              closeButton.style.cssText = `
                position: absolute !important;
                top: 20px !important;
                right: 20px !important;
                background: rgba(0, 0, 0, 0.7) !important;
                border: 1px solid rgba(255, 255, 255, 0.2) !important;
                color: white !important;
                font-size: 24px !important;
                cursor: pointer !important;
                padding: 8px 12px !important;
                border-radius: 50% !important;
                width: 44px !important;
                height: 44px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                z-index: 1000000 !important;
              `;
              
              closeButton.onclick = () => {
                overlay.remove();
              };
              
              overlay.appendChild(iframe);
              overlay.appendChild(closeButton);
              document.body.appendChild(overlay);
              
              console.log('Style Explorer overlay created via direct injection');
            },
            args: [isDevMode]
          });
          console.log('Direct script injection completed');
        } catch (scriptError) {
          console.error('Direct script injection failed:', scriptError);
        }
      }
    }
    
  } catch (error) {
    console.error('Failed to activate extension and open Style Explorer:', error);
  }
}

// Activate extension on current page (legacy function)
async function activateExtension() {
  console.log('Activating extension on current page...');
  
  try {
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      throw new Error('No active tab found');
    }
    
    console.log('Active tab found:', tab.url);
    
    // Send activation message to content script
    console.log('Sending activation message to content script...');
    
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'activateExtension' });
      console.log('Extension activated successfully:', response);
    } catch (messageError) {
      console.error('Failed to send activation message to content script:', messageError);
      // This is not critical - the user can still use the extension
    }
    
  } catch (error) {
    console.error('Failed to activate extension:', error);
  }
}

// Setup event listeners
function setupEventListeners() {
  // Open Style Explorer button
  const openStyleExplorerBtn = document.getElementById('open-style-explorer-btn');
  if (openStyleExplorerBtn) {
    openStyleExplorerBtn.addEventListener('click', async () => {
      console.log('Open Style Explorer button clicked');
      
      // Show loading state
      const loadingSection = document.querySelector('.loading-section');
      const mainActionSection = document.querySelector('.main-action-section');
      
      mainActionSection.style.display = 'none';
      loadingSection.style.display = 'flex';
      
      // Inject content scripts and activate extension
      try {
        await injectContentScriptsAndActivate();
        console.log('Extension activation completed');
      } catch (error) {
        console.error('Error activating extension:', error);
        
        // Show error and restore button
        mainActionSection.style.display = 'block';
        loadingSection.style.display = 'none';
        
        openStyleExplorerBtn.innerHTML = `
          <span class="btn-icon">❌</span>
          <span class="btn-text">Error - Try Again</span>
        `;
        
        setTimeout(() => {
          openStyleExplorerBtn.innerHTML = `
            <span class="btn-icon">🎨</span>
            <span class="btn-text">Open Vibe Explorer</span>
          `;
        }, 3000);
      }
    });
  }
  
  // Help and about links (only if they exist)
  const helpLink = document.getElementById('help-link');
  if (helpLink) {
    helpLink.addEventListener('click', (e) => {
      e.preventDefault();
      showHelp();
    });
  }
  
  const aboutLink = document.getElementById('about-link');
  if (aboutLink) {
    aboutLink.addEventListener('click', (e) => {
      e.preventDefault();
      showAbout();
    });
  }
  
  // Debug settings save button
  const saveDebugButton = document.getElementById('save-debug-settings');
  if (saveDebugButton) {
    saveDebugButton.addEventListener('click', () => {
      const maxImages = parseInt(document.getElementById('max-images').value) || 32;
      const maxConcurrent = parseInt(document.getElementById('max-concurrent').value) || 8;
      
      const debugSettings = {
        maxImages: Math.max(1, Math.min(100, maxImages)),
        maxConcurrent: Math.max(1, Math.min(16, maxConcurrent))
      };
      
      // Save as user preferences (not debug settings)
      const userSettings = {
        preferredMaxImages: debugSettings.maxImages,
        preferredMaxConcurrent: debugSettings.maxConcurrent
      };
      
      // Save both debug settings (for UI) and user settings (for actual use)
      chrome.storage.local.set({ debugSettings }, async () => {
        console.log('Debug settings saved:', debugSettings);
        console.log('User preferences to save:', userSettings);
        
        // Send message to content script to save user settings and update variables
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
          if (tabs[0]) {
            try {
              // First, send the settings update message
              await chrome.tabs.sendMessage(tabs[0].id, { 
                action: 'updateUserSettings', 
                settings: userSettings 
              });
              console.log('User settings message sent successfully');
              
              // Also send a message to save the settings persistently
              await chrome.tabs.sendMessage(tabs[0].id, { 
                action: 'saveUserSettings'
              });
              console.log('Save user settings message sent successfully');
              
            } catch (error) {
              console.error('Error sending settings messages:', error);
            }
          }
        });
        
        // Visual feedback
        saveDebugButton.textContent = 'Saved!';
        setTimeout(() => {
          saveDebugButton.textContent = 'Save Settings';
        }, 1000);
      });
    });
  }

  // Dev mode toggle
  const devModeToggle = document.getElementById('dev-mode-toggle');
  if (devModeToggle) {
    devModeToggle.addEventListener('change', (e) => {
      const isDevMode = e.target.checked;
      console.log('Dev mode toggled:', isDevMode);
      
      // Save dev mode setting
      chrome.storage.local.set({ devMode: isDevMode }, () => {
        console.log('Dev mode setting saved:', isDevMode);
      });
      
      // Send message to content script about dev mode change
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: 'updateDevMode', 
            devMode: isDevMode 
          });
        }
      });
    });
  }

  // Use Last Style button
  const useLastStyleBtn = document.getElementById('use-last-style-btn');
  if (useLastStyleBtn) {
    useLastStyleBtn.addEventListener('click', async () => {
      console.log('Use Last Style button clicked');
      
      try {
        // Get current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
          throw new Error('No active tab found');
        }
        
        // Send message to content script to use last style
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'useLastStyle' });
        if (response && response.success) {
          console.log('Last style applied successfully');
          // Close popup after successful application
          setTimeout(() => window.close(), 500);
        } else {
          console.error('Failed to apply last style:', response?.error);
          alert('Failed to apply last style: ' + (response?.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('Error applying last style:', error);
        alert('Error applying last style: ' + error.message);
      }
    });
  }

  // Cached styles dropdown change
  const cachedStylesSelect = document.getElementById('cached-styles-select');
  const applyCachedStyleBtn = document.getElementById('apply-cached-style-btn');
  
  if (cachedStylesSelect && applyCachedStyleBtn) {
    cachedStylesSelect.addEventListener('change', () => {
      const selectedStyle = cachedStylesSelect.value;
      applyCachedStyleBtn.disabled = !selectedStyle;
    });
  }

  // Apply Cached Style button
  if (applyCachedStyleBtn) {
    applyCachedStyleBtn.addEventListener('click', async () => {
      const selectedStyle = cachedStylesSelect?.value;
      if (!selectedStyle) {
        alert('Please select a style to apply');
        return;
      }

      console.log('Apply Cached Style button clicked:', selectedStyle);
      
      try {
        // Get current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
          throw new Error('No active tab found');
        }
        
        // Show loading state
        applyCachedStyleBtn.disabled = true;
        applyCachedStyleBtn.innerHTML = `
          <span class="btn-icon">⏳</span>
          <span class="btn-text">Applying...</span>
        `;
        
        // Try to send message to content script, inject if needed
        let response;
        try {
          response = await chrome.tabs.sendMessage(tab.id, { 
            action: 'applyCachedStyle', 
            styleKey: selectedStyle 
          });
        } catch (error) {
          console.log('Content script not loaded, injecting scripts...');
          
          // Inject content scripts first
          try {
            await chrome.scripting.insertCSS({
              target: { tabId: tab.id },
              files: ['content.css']
            });
            
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['settings-service.js']
            });
            
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['cache-service.js']
            });
            
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['api-service.js']
            });
            
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['progress-overlay.js']
            });
            
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js']
            });
            
            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Try the request again
            response = await chrome.tabs.sendMessage(tab.id, { 
              action: 'applyCachedStyle', 
              styleKey: selectedStyle 
            });
            
          } catch (injectionError) {
            throw new Error(`Failed to inject content scripts: ${injectionError.message}`);
          }
        }
        
        if (response && response.success) {
          console.log('Cached style applied successfully:', response.result);
          
          // Show success state
          applyCachedStyleBtn.innerHTML = `
            <span class="btn-icon">✅</span>
            <span class="btn-text">Applied!</span>
          `;
          
          // Close popup after successful application
          setTimeout(() => window.close(), 1000);
        } else {
          console.error('Failed to apply cached style:', response?.error);
          alert('Failed to apply cached style: ' + (response?.error || 'Unknown error'));
          
          // Reset button
          applyCachedStyleBtn.disabled = false;
          applyCachedStyleBtn.innerHTML = `
            <span class="btn-icon">🎨</span>
            <span class="btn-text">Apply Style</span>
          `;
        }
      } catch (error) {
        console.error('Error applying cached style:', error);
        alert('Error applying cached style: ' + error.message);
        
        // Reset button
        applyCachedStyleBtn.disabled = false;
        applyCachedStyleBtn.innerHTML = `
          <span class="btn-icon">🎨</span>
          <span class="btn-text">Apply Style</span>
        `;
      }
    });
  }

  // Restore Cached Images button
  const restoreCachedImagesBtn = document.getElementById('restore-cached-images-btn');
  if (restoreCachedImagesBtn) {
    restoreCachedImagesBtn.addEventListener('click', async () => {
      console.log('Restore Cached Images button clicked');
      
      try {
        // Get current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
          throw new Error('No active tab found');
        }
        
        // Show loading state
        restoreCachedImagesBtn.disabled = true;
        restoreCachedImagesBtn.innerHTML = `
          <span class="btn-icon">⏳</span>
          <span class="btn-text">Restoring...</span>
        `;
        
        // Try to send message to content script, inject if needed
        let response;
        try {
          response = await chrome.tabs.sendMessage(tab.id, { action: 'autoRestoreCachedImages' });
        } catch (error) {
          console.log('Content script not loaded, injecting scripts...');
          
          // Inject content scripts (same as in injectContentScriptsAndActivate)
          try {
            // Inject CSS first
            await chrome.scripting.insertCSS({
              target: { tabId: tab.id },
              files: ['content.css']
            });
            
            // Inject JavaScript files in order
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['settings-service.js']
            });
            
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['cache-service.js']
            });
            
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['api-service.js']
            });
            
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['progress-overlay.js']
            });
            
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js']
            });
            
            console.log('Content scripts injected successfully');
            
            // Wait a moment for initialization
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Try the restore request again
            response = await chrome.tabs.sendMessage(tab.id, { action: 'autoRestoreCachedImages' });
            
          } catch (injectionError) {
            throw new Error(`Failed to inject content scripts: ${injectionError.message}`);
          }
        }
        
        if (response && response.success) {
          console.log('Cached images restored successfully:', response.result);
          
          // Show success state
          restoreCachedImagesBtn.innerHTML = `
            <span class="btn-icon">✅</span>
            <span class="btn-text">Restored ${response.result.restoredCount} images!</span>
          `;
          
          // Hide the restore section since images are now restored
          updateRestoreCacheUI(false, 0);
          
          // Refresh cached styles UI
          await loadCachedStyles();
          
          // Close popup after successful restoration
          setTimeout(() => window.close(), 2000);
        } else {
          console.error('Failed to restore cached images:', response?.error);
          alert('Failed to restore cached images: ' + (response?.error || 'Unknown error'));
          
          // Reset button
          restoreCachedImagesBtn.disabled = false;
          restoreCachedImagesBtn.innerHTML = `
            <span class="btn-icon">🔄</span>
            <span class="btn-text">Restore Cached Images</span>
          `;
        }
      } catch (error) {
        console.error('Error restoring cached images:', error);
        alert('Error restoring cached images: ' + error.message);
        
        // Reset button
        restoreCachedImagesBtn.disabled = false;
        restoreCachedImagesBtn.innerHTML = `
          <span class="btn-icon">🔄</span>
          <span class="btn-text">Restore Cached Images</span>
        `;
      }
    });
  }

  // Clear Cache button
  const clearCacheBtn = document.getElementById('clear-cache-btn');
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', async () => {
      const confirmed = confirm('Are you sure you want to clear all saved styles for this site? This action cannot be undone.');
      if (!confirmed) return;

      console.log('Clear Cache button clicked');
      
      try {
        // Get current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
          throw new Error('No active tab found');
        }
        
        // Show loading state
        clearCacheBtn.disabled = true;
        clearCacheBtn.innerHTML = `
          <span class="btn-icon">⏳</span>
          <span class="btn-text">Clearing...</span>
        `;
        
        // Send message to content script to clear cache
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'clearStyleCache' });
        
        if (response && response.success) {
          console.log('Cache cleared successfully');
          
          // Update UI to reflect cleared cache
          updateCachedStylesUI([]);
          updateRestoreCacheUI(false, 0);
          
          // Show success state briefly
          clearCacheBtn.innerHTML = `
            <span class="btn-icon">✅</span>
            <span class="btn-text">Cleared!</span>
          `;
          
          setTimeout(() => {
            clearCacheBtn.disabled = false;
            clearCacheBtn.innerHTML = `
              <span class="btn-icon">🗑️</span>
              <span class="btn-text">Clear All</span>
            `;
          }, 2000);
        } else {
          console.error('Failed to clear cache:', response?.error);
          alert('Failed to clear cache: ' + (response?.error || 'Unknown error'));
          
          // Reset button
          clearCacheBtn.disabled = false;
          clearCacheBtn.innerHTML = `
            <span class="btn-icon">🗑️</span>
            <span class="btn-text">Clear All</span>
          `;
        }
      } catch (error) {
        console.error('Error clearing cache:', error);
        alert('Error clearing cache: ' + error.message);
        
        // Reset button
        clearCacheBtn.disabled = false;
        clearCacheBtn.innerHTML = `
          <span class="btn-icon">🗑️</span>
          <span class="btn-text">Clear All</span>
        `;
      }
    });
  }
}

// Check API status
async function checkApiStatus() {
  const statusElement = document.getElementById('api-status');
  
  try {
    console.log('Checking API status via background script...');
    statusElement.innerHTML = `
      <span class="status-indicator checking"></span>
      Checking...
    `;
    
    // Check API status through background script
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'checkApiHealth' }, (response) => {
        resolve(response || { connected: false, error: 'No response from background script' });
      });
    });
    
    console.log('API status response:', response);
    
    if (response.connected) {
      statusElement.innerHTML = `
        <span class="status-indicator connected"></span>
        Connected
      `;
      console.log('API is connected');
    } else {
      throw new Error(response.error || 'Connection failed');
    }
    
  } catch (error) {
    console.error('API status check failed:', error);
    statusElement.innerHTML = `
      <span class="status-indicator error"></span>
      Offline
    `;
  }
}

// Handle scan page button click
async function handleScanPage() {
  console.log('Scan page button clicked');
  
  try {
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      throw new Error('No active tab found');
    }
    
    console.log('Active tab found:', tab.url);
    
    // Update UI to processing state
    updateUIState('processing');
    
    // Send message to content script and wait for response
    console.log('Sending message to content script...');
    
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'scanPageForProfiles' });
      console.log('Content script response:', response);
      
      if (response && response.success) {
        // Success - update UI and show results
        updateUIState('success');
        sessionStats.imagesFound = response.result.imagesFound || 0;
        updateSessionStats();
        
        const scanBtn = document.getElementById('scan-page-btn');
        scanBtn.innerHTML = `
          <span class="btn-icon">🏴‍☠️</span>
          <span class="btn-text">Converting ${response.result.imagesFound} Images...</span>
        `;
        
        // Keep popup open to show progress
        console.log('Conversion started successfully');
        
      } else {
        // Handle error response from content script
        throw new Error(response?.error || 'Unknown error from content script');
      }
      
    } catch (messageError) {
      console.error('Failed to send message to content script:', messageError);
      
      // Show user-friendly error
      updateUIState('error');
      
      // Don't close popup, show error message
      const scanBtn = document.getElementById('scan-page-btn');
      scanBtn.innerHTML = `
        <span class="btn-icon">❌</span>
        <span class="btn-text">Content Script Error</span>
      `;
      
      // Show detailed error in console and alert
      alert(`Extension Error: ${messageError.message}\n\nThis usually means:\n1. The page hasn't fully loaded yet\n2. The content script failed to inject\n3. The page blocks extensions\n\nTry refreshing the page and try again.`);
      
      setTimeout(() => {
        resetUIState();
      }, 3000);
      
      return; // Don't close popup on error
    }
    
    // Start session timer
    sessionStats.startTime = Date.now();
    updateSessionStats();
    
    // Don't close popup immediately - let user see what's happening
    console.log('Message sent successfully, keeping popup open for feedback');
    
  } catch (error) {
    console.error('Failed to scan page:', error);
    updateUIState('error');
    alert(`Failed to scan page: ${error.message}`);
  }
}

// Update UI state
function updateUIState(state) {
  const container = document.querySelector('.popup-container');
  const scanBtn = document.getElementById('scan-page-btn');
  
  // Remove existing state classes
  container.classList.remove('processing', 'success', 'error');
  
  // Add new state class
  container.classList.add(state);
  
  switch (state) {
    case 'processing':
      scanBtn.innerHTML = `
        <span class="btn-icon">⚙️</span>
        <span class="btn-text">Processing...</span>
      `;
      scanBtn.disabled = true;
      break;
      
    case 'success':
      scanBtn.innerHTML = `
        <span class="btn-icon">✅</span>
        <span class="btn-text">Conversion Complete!</span>
      `;
      setTimeout(() => {
        resetUIState();
      }, 3000);
      break;
      
    case 'error':
      scanBtn.innerHTML = `
        <span class="btn-icon">❌</span>
        <span class="btn-text">Error Occurred</span>
      `;
      setTimeout(() => {
        resetUIState();
      }, 3000);
      break;
  }
}

// Reset UI to default state
function resetUIState() {
  const container = document.querySelector('.popup-container');
  const scanBtn = document.getElementById('scan-page-btn');
  
  container.classList.remove('processing', 'success', 'error');
  scanBtn.innerHTML = `
    <span class="btn-icon">🔍</span>
    <span class="btn-text">Scan Page for Profiles</span>
  `;
  scanBtn.disabled = false;
}

// Production mode - dev mode settings removed

// Load session stats from storage
async function loadSessionStats() {
  try {
    const result = await chrome.storage.local.get(['sessionStats']);
    if (result.sessionStats) {
      sessionStats = { ...sessionStats, ...result.sessionStats };
      updateSessionStatsDisplay();
      
      // Show stats section if there are stats to show
      if (sessionStats.imagesFound > 0 || sessionStats.imagesConverted > 0) {
        document.getElementById('stats-section').style.display = 'block';
      }
    }
  } catch (error) {
    console.error('Failed to load session stats:', error);
  }
}

// Update session stats
function updateSessionStats() {
  // Save to storage
  chrome.storage.local.set({ sessionStats });
  updateSessionStatsDisplay();
  
  // Show stats section
  document.getElementById('stats-section').style.display = 'block';
}

// Update session stats display
function updateSessionStatsDisplay() {
  document.getElementById('images-found').textContent = sessionStats.imagesFound;
  document.getElementById('images-converted').textContent = sessionStats.imagesConverted;
  
  // Calculate elapsed time
  if (sessionStats.startTime) {
    const elapsed = Math.floor((Date.now() - sessionStats.startTime) / 1000);
    document.getElementById('conversion-time').textContent = `${elapsed}s`;
  }
}

// Show help dialog
function showHelp() {
  const helpText = `
Sogni Vibe Explorer Help

HOW TO USE:
1. Navigate to a webpage with profile photos (like speaker listings, team pages, etc.)
2. Click the Sogni logo in the top-left corner to open the Vibe Explorer
3. Browse hundreds of AI styles and click "Use This Style" on any photo
4. Watch as all profile photos on the page transform with your chosen style!

WHAT IT LOOKS FOR:
- Images in containers with "speaker", "profile", "team", or "member" in their class/id
- Square-ish images between 50x50 and 800x800 pixels
- Images arranged in grid patterns

FEATURES:
- Hundreds of AI transformation styles
- Real-time progress tracking
- Hover to compare original vs transformed
- Powered by Sogni.XLT SDXL Turbo AI

TROUBLESHOOTING:
- If "API Unavailable" appears, check your internet connection
- If no profiles found, try right-clicking individual images
- Processing may take 1-2 minutes per image depending on server load
  `;
  
  alert(helpText);
}

// Show about dialog
function showAbout() {
  const aboutText = `
Sogni Vibe Explorer v1.0.0

This browser extension brings the full power of Sogni Photobooth's AI style transformation to any webpage. Browse hundreds of artistic styles and transform profile photos with cutting-edge AI technology.

Created for automatically transforming speaker photos, team member photos, and other profile image grids with your choice of artistic styles.

Technology:
- Sogni.XLT SDXL Turbo AI Model
- Hundreds of curated artistic styles
- Chrome Extension Manifest V3
- Real-time progress tracking
- Advanced image processing pipeline

© 2024 Sogni AI
  `;
  
  alert(aboutText);
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Popup received message:', message);
  
  if (message.action === 'updateStats') {
    sessionStats.imagesFound = message.imagesFound || sessionStats.imagesFound;
    sessionStats.imagesConverted = message.imagesConverted || sessionStats.imagesConverted;
    updateSessionStats();
  } else if (message.action === 'conversionComplete') {
    updateUIState('success');
  } else if (message.action === 'conversionError') {
    updateUIState('error');
  } else if (message.action === 'styleExplorerOpened') {
    console.log('Style Explorer opened successfully, closing popup');
    // Close popup after a short delay to allow user to see success
    setTimeout(() => {
      window.close();
    }, 500);
  } else if (message.action === 'styleExplorerFailed') {
    console.log('Style Explorer failed to open, restoring popup UI');
    
    // Restore the main action button
    const loadingSection = document.querySelector('.loading-section');
    const mainActionSection = document.querySelector('.main-action-section');
    const openStyleExplorerBtn = document.getElementById('open-style-explorer-btn');
    
    if (loadingSection && mainActionSection && openStyleExplorerBtn) {
      loadingSection.style.display = 'none';
      mainActionSection.style.display = 'block';
      
      openStyleExplorerBtn.innerHTML = `
        <span class="btn-icon">❌</span>
        <span class="btn-text">Failed - Try Again</span>
      `;
      
      setTimeout(() => {
        openStyleExplorerBtn.innerHTML = `
          <span class="btn-icon">🎨</span>
          <span class="btn-text">Open Style Explorer</span>
        `;
      }, 3000);
    }
  }
});

// Update stats display every second if processing
setInterval(() => {
  if (sessionStats.startTime && document.querySelector('.popup-container').classList.contains('processing')) {
    updateSessionStatsDisplay();
  }
}, 1000);
