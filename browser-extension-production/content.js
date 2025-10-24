// Content Script for Sogni Photobooth Extension
console.log('🚀 Sogni Photobooth Extension: Content script loaded - VERSION 2.0 WITH MULTIPLE LOGOS & DIRECT STYLE EXPLORER');
console.log('Content script initialization starting...');

// Initialize components
let api = null;
let progressOverlay = null;
let isDevMode = false; // Production mode
let isProcessing = false;
let MAX_CONCURRENT_CONVERSIONS = 8; // Configurable concurrency
let MAX_IMAGES_PER_PAGE = 32; // Configurable limit for images processed per page

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
    // Check if ProgressOverlay class is available (PhotoboothAPI will be loaded lazily)
    if (typeof ProgressOverlay === 'undefined') {
      console.error('ProgressOverlay class not found. Retrying in 50ms...');
      setTimeout(initialize, 50);
      return;
    }
    
    // Load debug settings
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(['debugSettings'], resolve);
      });
      
      if (result.debugSettings) {
        MAX_CONCURRENT_CONVERSIONS = result.debugSettings.maxConcurrent;
        MAX_IMAGES_PER_PAGE = result.debugSettings.maxImages;
        console.log('Debug settings loaded:', { MAX_CONCURRENT_CONVERSIONS, MAX_IMAGES_PER_PAGE });
      }
    } catch (error) {
      console.log('Could not load debug settings, using defaults');
    }
    
    // Initialize progress overlay (lightweight, no API calls)
    progressOverlay = new ProgressOverlay();
    
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
    isDevMode = message.devMode;
    sendResponse({ success: true, message: 'Dev mode updated' });
    return false;
  }
  
  if (message.action === 'updateDebugSettings') {
    const { debugSettings } = message;
    MAX_CONCURRENT_CONVERSIONS = debugSettings.maxConcurrent;
    MAX_IMAGES_PER_PAGE = debugSettings.maxImages;
    console.log('Debug settings updated:', { MAX_CONCURRENT_CONVERSIONS, MAX_IMAGES_PER_PAGE });
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
  
  // Look for containers with "speakers" or "speaker" in class/id
  const speakerContainers = document.querySelectorAll([
    '[class*="speaker" i]',
    '[id*="speaker" i]',
    '[class*="profile" i]',
    '[id*="profile" i]',
    '[class*="team" i]',
    '[id*="team" i]',
    '[class*="member" i]',
    '[id*="member" i]'
  ].join(', '));
  
  console.log(`Found ${speakerContainers.length} potential speaker containers`);
  
  for (const container of speakerContainers) {
    const images = container.querySelectorAll('img');
    console.log(`Container has ${images.length} images`);
    
    for (const img of images) {
      // Skip if we've already seen this exact element
      if (seenElements.has(img)) {
        console.log(`❌ Skipping duplicate DOM element: ${img.src}`);
        continue;
      }
      
      // Skip if we've already seen this URL
      if (seenUrls.has(img.src)) {
        console.log(`❌ Skipping duplicate URL: ${img.src}`);
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
  
  // If no speaker containers found, look for grid patterns
  if (profileImages.length === 0) {
    console.log('No speaker containers found, looking for image grids...');
    profileImages.push(...findImageGrids());
  }
  
  console.log(`🎯 FINAL RESULTS: Found ${profileImages.length} profile images`);
  profileImages.forEach((img, index) => {
    const rect = img.getBoundingClientRect();
    console.log(`   ${index + 1}. ${img.src} (${rect.width}x${rect.height}) at (${rect.x}, ${rect.y})`);
  });
  return profileImages;
}


// Check if an image looks like a profile photo
function isProfileImage(img) {
  // Skip if image is too small or too large (more restrictive)
  const rect = img.getBoundingClientRect();
  if (rect.width < 80 || rect.height < 80) return false; // Increased minimum size
  if (rect.width > 400 || rect.height > 400) return false; // Decreased maximum size
  
  // Skip if image is not visible
  if (rect.width === 0 || rect.height === 0) return false;
  
  // Skip if image is hidden
  const style = window.getComputedStyle(img);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  
  // STRICT aspect ratio check (profile photos should be more square)
  const aspectRatio = rect.width / rect.height;
  if (aspectRatio < 0.7 || aspectRatio > 1.4) return false; // Much more restrictive
  
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
  
  // REQUIRE that the image is in a container that suggests it's a profile
  // This is very restrictive - only accept images in likely profile contexts
  let profileContext = false;
  parent = img.parentElement;
  depth = 0;
  while (parent && depth < 5) {
    const parentClass = parent.className.toLowerCase();
    const parentId = parent.id.toLowerCase();
    
    const profileContextPatterns = [
      'speaker', 'profile', 'team', 'member', 'person', 'people',
      'staff', 'employee', 'founder', 'executive', 'bio', 'about'
    ];
    
    if (profileContextPatterns.some(pattern => 
      parentClass.includes(pattern) || parentId.includes(pattern)
    )) {
      profileContext = true;
      console.log(`Image found in profile context: ${parentClass} ${parentId}`);
      break;
    }
    parent = parent.parentElement;
    depth++;
  }
  
  // Only return true if we found a profile context
  return profileContext;
}

// Find image grids (fallback method)
function findImageGrids() {
  const gridImages = [];
  const allImages = document.querySelectorAll('img');
  
  // Group images by similar size and position
  const imageGroups = new Map();
  
  for (const img of allImages) {
    if (!isProfileImage(img)) continue;
    
    const rect = img.getBoundingClientRect();
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
  
  return largestGroup;
}

// Process images with continuous job assignment
async function processImagesBatch(images) {
  isProcessing = true;
  processingQueue = [...images];
  
  console.log(`Processing ${images.length} images`);
  
  // Track success/failure counts
  let successCount = 0;
  let failureCount = 0;
  let completedCount = 0;
  
  let nextImageIndex = 0;
  
  // Multiple bouncing Sogni logos are handled automatically by the progress overlay system
  
  try {
    // Process images continuously - assign next image to available slot
    await new Promise((resolve) => {
      const processNextImage = async (slotIndex) => {
        while (nextImageIndex < images.length) {
          const imageIndex = nextImageIndex++;
          const img = images[imageIndex];
          
          // Processing image ${imageIndex + 1}/${images.length}
          
          try {
            const result = await convertImageWithDefaultStyle(img);
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
        processNextImage(i);
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
      comparisonContainer.className = 'sogni-before-after-container';
      
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
      
      // Position download icon relative to viewport to avoid mask clipping
      const updateDownloadPosition = () => {
        const containerRect = comparisonContainer.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        
        downloadIcon.style.position = 'fixed';
        downloadIcon.style.top = `${containerRect.top + 10}px`;
        downloadIcon.style.left = `${containerRect.right - 42}px`; // 32px width + 10px margin
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
      
      // Set initial position
      updateDownloadPosition();
      
      // Assemble the comparison widget (download icon added to body separately)
      comparisonContainer.appendChild(beforeImg);
      comparisonContainer.appendChild(afterImg);
      comparisonContainer.appendChild(scrubberLine);
      
      // Add download icon to body to avoid mask clipping
      document.body.appendChild(downloadIcon);
      
      // Replace original image with comparison container
      originalImage.parentNode.insertBefore(comparisonContainer, originalImage);
      originalImage.style.display = 'none';
      
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
      
      // Add scroll and resize listeners to keep download button positioned correctly
      const updatePositionHandler = () => updateDownloadPosition();
      window.addEventListener('scroll', updatePositionHandler);
      window.addEventListener('resize', updatePositionHandler);
      
      // Event listeners for scrubber interaction
      comparisonContainer.addEventListener('mouseenter', () => {
        isActive = true;
        scrubberLine.style.opacity = '1';
        downloadIcon.style.opacity = '1';
        comparisonContainer.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.5)';
        // Start with 50/50 split when entering
        afterImg.style.clipPath = 'inset(0 50% 0 0)';
        scrubberLine.style.left = '50%';
        // Update download position when hovering
        updateDownloadPosition();
      });
      
      comparisonContainer.addEventListener('mouseleave', () => {
        isActive = false;
        scrubberLine.style.opacity = '0';
        downloadIcon.style.opacity = '0.8'; // Keep download button visible but dimmed
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
      
      // Clean up existing elements if they exist
      if (originalImage._downloadIcon && originalImage._downloadIcon.parentNode) {
        originalImage._downloadIcon.parentNode.removeChild(originalImage._downloadIcon);
      }
      if (originalImage._updatePositionHandler) {
        window.removeEventListener('scroll', originalImage._updatePositionHandler);
        window.removeEventListener('resize', originalImage._updatePositionHandler);
      }
      
      // Store references for cleanup
      originalImage._comparisonContainer = comparisonContainer;
      originalImage._downloadIcon = downloadIcon;
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
async function replaceImageOnPage(originalImage, newImageUrl) {
  return replaceImageWithHoverComparison(originalImage, newImageUrl);
}

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
  
  console.log(`Processing ${images.length} images with ${styleKey}`);
  
  // Track success/failure counts
  let successCount = 0;
  let failureCount = 0;
  let completedCount = 0;
  let nextImageIndex = 0;
  
  // Multiple bouncing Sogni logos are handled automatically by the progress overlay system
  
  try {
    // Process images continuously - assign next image to available slot
    await new Promise((resolve) => {
      const processNextImage = async (slotIndex) => {
        while (nextImageIndex < images.length) {
          const imageIndex = nextImageIndex++;
          const img = images[imageIndex];
          
          // Processing image with style
          
          try {
            const result = await convertImageWithStyle(img, styleKey, stylePrompt);
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
        processNextImage(i);
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

// Add some basic styles
const style = document.createElement('style');
style.textContent = `
  .sogni-converting {
    filter: brightness(0.7) saturate(0.8);
    transition: filter 0.3s ease;
  }
`;
document.head.appendChild(style);
