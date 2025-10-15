// Background script for Sogni Photobooth Extension
console.log('Sogni Photobooth Extension: Background script loaded');

// Generate a stable client app ID for the extension
let extensionClientAppId = `photobooth-extension-fallback-${Date.now()}`;

// Initialize client app ID using chrome.storage.local (async)
chrome.storage.local.get(['sogni_extension_app_id'], (result) => {
  if (result.sogni_extension_app_id) {
    extensionClientAppId = result.sogni_extension_app_id;
  } else {
    extensionClientAppId = `photobooth-extension-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    chrome.storage.local.set({ 'sogni_extension_app_id': extensionClientAppId });
  }
  console.log('Extension client app ID initialized:', extensionClientAppId);
});
console.log('Extension client app ID:', extensionClientAppId);

// Shared SSE Connection Manager for multiple concurrent projects
class SSEConnectionManager {
  constructor() {
    this.eventSource = null;
    this.activeProjects = new Map(); // projectId -> { resolve, reject, imageUrl }
    this.isConnected = false;
    this.apiBaseUrl = null;
  }

  // Connect to client-based SSE stream (one connection for all projects)
  connect(apiBaseUrl) {
    if (this.eventSource && this.isConnected) {
      console.log('Background: SSE already connected, reusing connection');
      return;
    }

    this.apiBaseUrl = apiBaseUrl;
    const progressUrl = `${apiBaseUrl}/api/sogni/progress/client?clientAppId=${encodeURIComponent(extensionClientAppId)}&_t=${Date.now()}`;
    console.log('Background: Connecting to shared SSE stream:', progressUrl);

    this.eventSource = new EventSource(progressUrl, { withCredentials: true });

    this.eventSource.onopen = () => {
      console.log('Background: Shared SSE connection established');
      this.isConnected = true;
    };

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`Background: SSE message received:`, data);
        
        // Route event to correct project
        if (data.projectId && this.activeProjects.has(data.projectId)) {
          this.handleProjectEvent(data.projectId, data);
        }
      } catch (error) {
        console.error('Background: Error parsing SSE message:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('Background: SSE connection error:', error);
      this.isConnected = false;
    };
  }

  // Register a project for tracking
  trackProject(projectId, imageUrl, resolve, reject) {
    this.activeProjects.set(projectId, { resolve, reject, imageUrl });
    console.log(`Background: Tracking project ${projectId} for image: ${imageUrl}`);
  }

  // Handle events for a specific project
  handleProjectEvent(projectId, data) {
    const project = this.activeProjects.get(projectId);
    if (!project) return;

    const { resolve, reject, imageUrl } = project;

    switch (data.type) {
      case 'connected':
      case 'queued':
        console.log(`Background: Project ${projectId} ${data.type.toUpperCase()} for image: ${imageUrl}`);
        break;

      case 'started':
        console.log(`Background: Project ${projectId} STARTED for image: ${imageUrl}`);
        break;

      case 'progress':
        const progressPercent = Math.round(data.progress * 100);
        console.log(`Background: Project ${projectId} progress: ${progressPercent}% for image: ${imageUrl}`);
        
        // Send progress to content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'updateProgress',
              imageUrl: imageUrl,
              progress: data.progress,
              step: data.step,
              stepCount: data.stepCount
            });
          }
        });
        break;

      case 'jobCompleted':
        console.log(`Background: ✅ Job completed! Final result: ${data.resultUrl} for image: ${imageUrl}`);
        
        // Clean up and resolve
        this.activeProjects.delete(projectId);
        resolve({
          pirateImageUrl: data.resultUrl,
          originalUrl: imageUrl
        });
        break;

      case 'completed':
        console.log(`Background: Project ${projectId} completed for image: ${imageUrl}`);
        break;

      case 'failed':
      case 'error':
        console.error(`Background: Project ${projectId} failed:`, data.error);
        this.activeProjects.delete(projectId);
        reject(new Error(data.error || 'Generation failed'));
        break;
    }
  }

  // Clean up connection
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.isConnected = false;
    }
    this.activeProjects.clear();
  }
}

// Global SSE connection manager instance
const sseManager = new SSEConnectionManager();

// Create context menu when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  console.log('Sogni Photobooth Extension: Creating context menu');
  
  chrome.contextMenus.create({
    id: "convert-single-image",
    title: "Convert to Pirate",
    contexts: ["image"]
  });
  
  chrome.contextMenus.create({
    id: "scan-page-for-profiles",
    title: "Scan Page for Profile Photos",
    contexts: ["page"]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "convert-single-image") {
    // Convert single image
    chrome.tabs.sendMessage(tab.id, {
      action: 'convertSingleImage',
      imageUrl: info.srcUrl
    });
  } else if (info.menuItemId === "scan-page-for-profiles") {
    // Scan page for profiles
    chrome.tabs.sendMessage(tab.id, {
      action: 'scanPageForProfiles'
    });
  }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request.action, 'from:', sender.tab ? 'content script' : 'popup');
  
  if (request.action === 'checkApiHealth') {
    console.log('Background: Handling API health check request');
    
    // Handle API health check asynchronously
    handleApiHealthCheck()
      .then(result => {
        console.log('Background: API health check completed, sending response:', result);
        sendResponse(result);
      })
      .catch(error => {
        console.error('Background: API health check failed:', error);
        sendResponse({ connected: false, error: error.message });
      });
    
    return true; // Keep the message channel open for async response
  } else if (request.action === 'convertImage') {
    // Handle image conversion asynchronously
    handleImageConversion(request.imageUrl, request.imageSize)
      .then(result => {
        sendResponse({ success: true, ...result });
      })
      .catch(error => {
        console.error('Background: Image conversion failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Keep the message channel open for async response
  }
});

// Handle API health check
async function handleApiHealthCheck() {
  return await checkApiHealthInBackground();
}

// Check API health in background script
async function checkApiHealthInBackground() {
  try {
    // Use correct local API domain
    const apiBaseUrl = 'https://photobooth-api-local.sogni.ai';
    console.log('Background: Checking API health at:', apiBaseUrl);
    
    const response = await fetch(`${apiBaseUrl}/api/health`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'X-Client-App-ID': extensionClientAppId
      },
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('Background: API health check successful:', data);
      return { connected: true, endpoint: apiBaseUrl, data };
    } else {
      console.error('Background: API health check failed:', response.status, response.statusText);
      return { connected: false, error: `HTTP ${response.status} ${response.statusText}` };
    }
  } catch (error) {
    console.error('Background: API health check error:', error);
    return { connected: false, error: error.message };
  }
}

// Handle image conversion in background (avoids CORS issues)
async function handleImageConversion(imageUrl, imageSize) {
  console.log('Background: Converting image:', imageUrl);
  
  // Use the SAME client app ID for all conversions (like main photobooth frontend)
  // This allows the server to handle multiple concurrent projects from the same client
  console.log('Background: Using shared client app ID for this conversion:', extensionClientAppId);
  
  try {
    // Use correct local API domain
    const apiBaseUrl = 'https://photobooth-api-local.sogni.ai';
    console.log('Background: Using local API domain for image conversion:', apiBaseUrl);
    
    // Fetch the image (background script can bypass CORS)
    console.log('Background: Fetching image...');
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
    }
    
    const imageBlob = await imageResponse.blob();
    const imageArrayBuffer = await imageBlob.arrayBuffer();
    const imageData = new Uint8Array(imageArrayBuffer);
    console.log('Background: Image fetched, size:', imageData.length);
    
    // Step 1: Send conversion request
    console.log('Background: Starting pirate conversion with:', `${apiBaseUrl}/api/sogni/generate`);
    
    // Add default preferred workers to positive prompt (matching main app behavior)
    const basePrompt = 'Attractive, friendly storybook pirate portrait, watercolor-ink blend, weathered treasure map frame, parrot sidekick.';
    const workerPreferences = '--preferred-workers=SPICE.MUST.FLOW';
    const finalPositivePrompt = `${basePrompt} ${workerPreferences}`;

    const conversionParams = {
      testnet: false,
      tokenType: 'spark',
      isPremiumSpark: false, // Extension uses non-premium Spark
      selectedModel: 'coreml-sogniXLturbo_alpha1_ad',
      positivePrompt: finalPositivePrompt,
      negativePrompt: 'lowres, worst quality, low quality',
      stylePrompt: '',
      sizePreset: 'custom',
      width: 768,
      height: 768,
      inferenceSteps: 7,
      promptGuidance: 2,
      numberImages: 1,
      scheduler: 'DPM++ SDE',
      timeStepSpacing: 'Karras',
      outputFormat: 'jpg',
      sensitiveContentFilter: false,
      sourceType: 'upload',
      imageData: Array.from(imageData),
      controlNetStrength: 0.7,
      controlNetGuidanceEnd: 0.6
    };
    
    console.log('Background: Sending conversion params:', {
      ...conversionParams,
      imageData: `[${imageData.length} bytes]`
    });
    console.log('Background: Sending project request for image:', imageUrl);
    
    const conversionResponse = await fetch(`${apiBaseUrl}/api/sogni/generate`, {
      method: 'POST',
      credentials: 'include', // Include cookies like the main app
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Client-App-ID': extensionClientAppId,
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify(conversionParams)
    });
    
    if (!conversionResponse.ok) {
      const errorText = await conversionResponse.text();
      console.error('Background: Conversion request failed:', conversionResponse.status, conversionResponse.statusText, errorText);
      throw new Error(`Conversion failed: ${conversionResponse.status} ${conversionResponse.statusText} - ${errorText}`);
    }
    
    const conversionData = await conversionResponse.json();
    console.log('Background: Conversion started, got projectId:', conversionData.projectId);
    
    // Step 2: Use shared SSE manager for progress updates (supports multiple concurrent projects)
    sseManager.connect(apiBaseUrl);
    
    const finalResult = await new Promise((resolve, reject) => {
      // Register this project with the shared SSE manager
      sseManager.trackProject(conversionData.projectId, imageUrl, (result) => {
        resolve(result.pirateImageUrl);
      }, reject);
      
      // Set up timeout for the entire process (2 minutes)
      setTimeout(() => {
        console.error(`Background: ⏰ Conversion timeout reached for project ${conversionData.projectId}`);
        sseManager.activeProjects.delete(conversionData.projectId);
        reject(new Error('Conversion timeout (2 minutes)'));
      }, 120000);
    });
    
    console.log('Background: Stream processing complete. Final result:', finalResult);
    
    if (!finalResult) {
      throw new Error('No final result received from conversion');
    }
    
    return {
      pirateImageUrl: finalResult,
      originalUrl: imageUrl
    };
    
  } catch (error) {
    console.error('Background: Image conversion error:', error);
    throw error;
  }
}
