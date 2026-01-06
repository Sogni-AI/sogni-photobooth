/**
 * API service for communicating with the backend
 */
import urls from '../config/urls';
import { getOrCreateAppId as getAppId } from '../utils/appId';

// Add network connectivity detection utilities at the top of the file after the imports
let isOnline = navigator.onLine;
let lastConnectionCheck = 0;
let connectivityCheckInProgress = false;

// Connection state management for UI feedback
type ConnectionState = 'online' | 'offline' | 'connecting' | 'timeout';
let currentConnectionState: ConnectionState = navigator.onLine ? 'online' : 'offline';
const connectionStateListeners: Array<(state: ConnectionState) => void> = [];

// Export function to subscribe to connection state changes
export function subscribeToConnectionState(listener: (state: ConnectionState) => void): () => void {
  connectionStateListeners.push(listener);
  // Return unsubscribe function
  return () => {
    const index = connectionStateListeners.indexOf(listener);
    if (index > -1) {
      connectionStateListeners.splice(index, 1);
    }
  };
}

// Notify all listeners of connection state change
function notifyConnectionStateChange(newState: ConnectionState) {
  if (currentConnectionState !== newState) {
    currentConnectionState = newState;
    console.log(`Connection state changed to: ${newState}`);
    connectionStateListeners.forEach(listener => {
      try {
        listener(newState);
      } catch (error) {
        console.warn('Error in connection state listener:', error);
      }
    });
  }
}

// Get current connection state
export function getCurrentConnectionState(): ConnectionState {
  return currentConnectionState;
}

/**
 * Check if the device is currently online by testing connectivity
 */
async function checkConnectivity(): Promise<boolean> {
  // Avoid rapid successive checks
  const now = Date.now();
  if (connectivityCheckInProgress || (now - lastConnectionCheck < 2000)) {
    return isOnline;
  }
  
  connectivityCheckInProgress = true;
  lastConnectionCheck = now;
  
  try {
    // Test connectivity with a lightweight request
    const response = await fetch(`${API_BASE_URL}/sogni/status`, {
      method: 'HEAD',
      cache: 'no-cache',
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });
    
    isOnline = response.ok;
    console.log(`Connectivity check: ${isOnline ? 'online' : 'offline'}`);
  } catch (error) {
    console.warn('Connectivity check failed:', error);
    isOnline = false;
  } finally {
    connectivityCheckInProgress = false;
  }
  
  return isOnline;
}

/**
 * Network error with additional context for better user feedback
 */
class NetworkError extends Error {
  constructor(
    message: string, 
    public isTimeout: boolean = false, 
    public isOffline: boolean = false,
    public retryable: boolean = true
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

// Listen for online/offline events
window.addEventListener('online', () => {
  console.log('Device came online');
  isOnline = true;
});

window.addEventListener('offline', () => {
  console.log('Device went offline');
  isOnline = false;
});

// Use the configured API URL from the urls config
const API_BASE_URL = urls.apiUrl;

// Get the app ID on module load using the centralized utility
// This ensures consistency with auth service
export const clientAppId = typeof window !== 'undefined' ? getAppId() : '';

// Keep track of last status check to avoid duplicate calls
let lastStatusCheckTime = 0;
const STATUS_CHECK_THROTTLE_MS = 2000; // 2 seconds

// Track if we've connected to Sogni at least once in this session
let hasConnectedToSogni = false;

// Use a pending promise mechanism to avoid duplicate status checks
let pendingStatusCheck: Promise<unknown> | null = null;

// Simplified connection tracking - no complex disconnect logic needed
// The backend should handle cleanup automatically for short-lived sessions

// Utility type guard for Record<string, unknown>
function isObjectRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Simplified disconnect function - only used for explicit cleanup
 * Most of the time, letting sessions expire naturally is fine
 */
export async function disconnectSession(): Promise<boolean> {
  try {
    // Skip if we never connected
    if (!hasConnectedToSogni) {
      return true;
    }
    
    // Simple disconnect attempt - don't overcomplicate it
    const response = await fetch(`${API_BASE_URL}/sogni/disconnect`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Client-App-ID': clientAppId
      },
      body: JSON.stringify({ clientAppId })
    });
    
    return response.ok;
  } catch (error) {
    // Don't log errors - disconnection failures are not critical for a photobooth app
    return false;
  }
}

/**
 * Check Sogni connection status
 */
export async function checkSogniStatus() {
  const now = Date.now();
  
  // If there's already a pending check, return that promise
  if (pendingStatusCheck) {
    console.log('Using existing pending status check');
    return pendingStatusCheck;
  }
  
  // Throttle frequent calls - use cached result if within threshold
  if (now - lastStatusCheckTime < STATUS_CHECK_THROTTLE_MS) {
    console.log(`Status check throttled - last check was ${Math.floor((now - lastStatusCheckTime)/1000)}s ago`);
    // Instead of throwing, return a rejected promise with a specific error
    return Promise.reject(new Error('Status check throttled'));
  }
  
  // Mark the time of this check attempt
  lastStatusCheckTime = now;
  
  // Create a new promise for this check
  pendingStatusCheck = (async () => {
    try {
      console.log('Checking Sogni status...');
      const response = await fetch(`${API_BASE_URL}/sogni/status`, {
        credentials: 'include', // Include credentials for cross-origin requests
        headers: {
          'Accept': 'application/json',
          'X-Client-App-ID': clientAppId, // Add client app ID as header
        }
      });
      
      // Handle error responses
      if (!response.ok) {
        // Try to get the error details from the response
        let errorDetails = '';
        try {
          const errorData: unknown = await response.json();
          if (isObjectRecord(errorData)) {
            errorDetails = (errorData as { message?: string }).message || (errorData as { error?: string }).error || 'Unknown error';
          } else {
            errorDetails = response.statusText;
          }
          console.error('Status check failed:', errorData);
        } catch (err: unknown) {
          errorDetails = response.statusText;
          console.error('Error parsing response:', err);
        }
        
        // Throw an error with status code and message
        throw new Error(`${response.status} ${String(errorDetails)}`);
      }
      
      const dataRaw: unknown = await response.json();
      const data: Record<string, unknown> = isObjectRecord(dataRaw) ? dataRaw : {};
      console.log('Sogni status check successful:', data);
      
      // Mark that we have successfully connected at least once
      hasConnectedToSogni = true;
      
      return data;
    } catch (error) {
      console.error('Error checking Sogni status:', error);
      throw error;
    } finally {
      // Clear the pending promise after a short delay
      // This prevents immediate retries but allows future checks
      setTimeout(() => {
        pendingStatusCheck = null;
      }, 500);
    }
  })();
  
  return pendingStatusCheck;
}

/**
 * Create a project directly through the backend service
 * 
 * @param params All the parameters needed to create a Sogni project
 * @param progressCallback Optional callback for progress updates
 * @returns Promise that resolves with the complete project data
 */
export async function createProject(params: Record<string, unknown>, progressCallback?: (data: unknown) => void): Promise<unknown> {
  try {
    // Debug log to track sourceType
    console.log(`createProject called with sourceType: ${typeof params.sourceType === 'string' ? params.sourceType : 'undefined'}`);
    
    // Process the image data based on the request type (enhancement, generation with controlNet, or generation with contextImage1)
    let imageData: unknown;
    let isEnhancement = false;
    let isContextImage = false;
    
    // Check if this is an enhancement request (has startingImage), contextImage1 request, or generation (has controlNet)
    if (params.startingImage) {
      isEnhancement = true;
      
      // For enhancement, the image is already in Array form
      if (Array.isArray(params.startingImage)) {
        imageData = params.startingImage;
        const enhancementSizeMB = (params.startingImage.length / 1024 / 1024).toFixed(2);
        console.log(`📤 Enhancement image transmitting to Sogni API: ${enhancementSizeMB}MB`);
        console.log(`📊 Enhancement image format: Array (${params.startingImage.length} bytes)`);
      } else if (params.startingImage instanceof Uint8Array) {
        // Convert Uint8Array to regular array
        imageData = Array.from(params.startingImage);
        const enhancementSizeMB = (params.startingImage.length / 1024 / 1024).toFixed(2);
        console.log(`📤 Enhancement image transmitting to Sogni API: ${enhancementSizeMB}MB`);
        console.log(`📊 Enhancement image format: Uint8Array converted to Array (${params.startingImage.length} bytes)`);
      } else {
        throw new Error('Enhancement requires startingImage as Array or Uint8Array');
      }
    }
    // Process contextImages for Qwen Image Edit model
    else if (params.contextImages && Array.isArray(params.contextImages)) {
      isContextImage = true;
      
      // Process the first context image (we only support one for now)
      const contextImage = (params.contextImages as unknown[])[0];
      if (Array.isArray(contextImage)) {
        imageData = contextImage;
        const contextSizeMB = (contextImage.length / 1024 / 1024).toFixed(2);
        console.log(`📤 Context image transmitting to Sogni API: ${contextSizeMB}MB`);
        console.log(`📊 Context image format: Array (${contextImage.length} bytes)`);
      } else if (contextImage instanceof Uint8Array) {
        // Convert Uint8Array to regular array
        imageData = Array.from(contextImage);
        const contextSizeMB = (contextImage.length / 1024 / 1024).toFixed(2);
        console.log(`📤 Context image transmitting to Sogni API: ${contextSizeMB}MB`);
        console.log(`📊 Context image format: Uint8Array converted to Array (${contextImage.length} bytes)`);
      } else {
        throw new Error('contextImages requires images as Array or Uint8Array');
      }
    } 
    // Process controlNet image for normal generation
    else if (
      typeof params.controlNet === 'object' && params.controlNet !== null &&
      'image' in params.controlNet &&
      (Array.isArray((params.controlNet as { image: unknown }).image) || (params.controlNet as { image: unknown }).image instanceof Uint8Array)
    ) {
      const controlNet = params.controlNet as { image: unknown };
      if (controlNet.image instanceof Uint8Array) {
        // Check image size and log transmission details
        const originalSize = controlNet.image.length;
        const originalSizeMB = (originalSize / 1024 / 1024).toFixed(2);
        console.log(`📤 Transmitting to Sogni API: ${originalSizeMB}MB`);
        console.log(`📊 Image data format: Uint8Array (${originalSize} bytes)`);
        
        // For large images, send chunks or downsize
        if (originalSize > 10 * 1024 * 1024) { // If over 10MB
          console.log('Image is large, optimizing size...');
          // Option 1: Just use the array directly without Array.from
          // This is more memory efficient
          imageData = [...controlNet.image]; 
          // Log the compressed size
          if (Array.isArray(imageData)) {
            console.log(`Optimized image size: ${imageData.length / 1024 / 1024} MB`);
          }
        } else {
          // For smaller images, use standard approach
          imageData = Array.from(controlNet.image);
        }
      } else if (Array.isArray(controlNet.image)) {
        // Already in array form
        imageData = controlNet.image;
      } else {
        throw new Error('ControlNet requires image as Array or Uint8Array');
      }
    } else {
      throw new Error('Invalid image data format - missing controlNet.image, contextImages, or startingImage');
    }
    
    // Format the parameters for the backend based on request type
    let projectParams: Record<string, unknown>;
    if (isEnhancement) {
      // Enhancement parameters
      projectParams = {
        selectedModel: params.modelId,
        positivePrompt: params.positivePrompt || '',
        negativePrompt: params.negativePrompt || '',
        stylePrompt: params.stylePrompt || '',
        width: params.width,
        height: params.height,
        promptGuidance: params.guidance,
        numberImages: params.numberOfMedia,
        inferenceSteps: params.steps,
        scheduler: params.scheduler,
        timeStepSpacing: params.timeStepSpacing,
        outputFormat: params.outputFormat || 'jpg',
        sensitiveContentFilter: params.sensitiveContentFilter || false,
        startingImage: Array.isArray(imageData) || imageData instanceof Uint8Array ? imageData : [],
        startingImageStrength: params.startingImageStrength || 0.85,
        sourceType: params.sourceType, // Pass sourceType through for enhancement
        tokenType: params.tokenType, // Pass tokenType for payment method
        isPremiumSpark: params.isPremiumSpark // Pass premium status
      };
    } else if (isContextImage) {
      // Generation parameters with contextImages (Qwen Image Edit)
      projectParams = {
        selectedModel: params.modelId,
        positivePrompt: params.positivePrompt || '',
        negativePrompt: params.negativePrompt || '',
        stylePrompt: params.stylePrompt || '',
        width: params.width,
        height: params.height,
        promptGuidance: params.guidance,
        numberImages: params.numberOfMedia,
        inferenceSteps: params.steps,
        scheduler: params.scheduler,
        timeStepSpacing: params.timeStepSpacing,
        outputFormat: params.outputFormat || 'jpg',
        sensitiveContentFilter: params.sensitiveContentFilter || false,
        contextImages: [Array.isArray(imageData) || imageData instanceof Uint8Array ? imageData : []],
        seed: params.seed || undefined,
        sourceType: params.sourceType, // Pass sourceType through for generation
        tokenType: params.tokenType, // Pass tokenType for payment method
        isPremiumSpark: params.isPremiumSpark // Pass premium status
      };
    } else {
      // Generation parameters with controlNet
      let controlNetStrength = undefined;
      let controlNetGuidanceEnd = undefined;
      if (typeof params.controlNet === 'object' && params.controlNet !== null) {
        controlNetStrength = (params.controlNet as { strength?: number }).strength;
        controlNetGuidanceEnd = (params.controlNet as { guidanceEnd?: number }).guidanceEnd;
      }
      projectParams = {
        selectedModel: params.modelId,
        positivePrompt: params.positivePrompt || '',
        negativePrompt: params.negativePrompt || '',
        stylePrompt: params.stylePrompt || '',
        width: params.width,
        height: params.height,
        promptGuidance: params.guidance,
        numberImages: params.numberOfMedia,
        inferenceSteps: params.steps,
        scheduler: params.scheduler,
        timeStepSpacing: params.timeStepSpacing,
        outputFormat: params.outputFormat || 'jpg',
        sensitiveContentFilter: params.sensitiveContentFilter || false,
        controlNetStrength,
        controlNetGuidanceEnd,
        imageData: Array.isArray(imageData) || imageData instanceof Uint8Array ? imageData : [],
        seed: params.seed || undefined,
        sourceType: params.sourceType, // Pass sourceType through for generation
        tokenType: params.tokenType, // Pass tokenType for payment method
        isPremiumSpark: params.isPremiumSpark // Pass premium status
      };
    }
    
    return generateImage(projectParams, progressCallback);
  } catch (error: unknown) {
    console.error('Error creating project:', error);
    throw error;
  }
}

/**
 * Cancel an ongoing project
 * 
 * @param projectId The ID of the project to cancel
 * @returns Promise that resolves to the cancellation status
 */
export async function cancelProject(projectId: string): Promise<unknown> {
  try {
    const response = await fetch(`${API_BASE_URL}/sogni/cancel/${projectId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include', // Include credentials for cross-origin requests
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const resultRaw: unknown = await response.json();
    const result: Record<string, unknown> = isObjectRecord(resultRaw) ? resultRaw : {};
    console.log('Project cancellation result:', result);
    return result;
  } catch (error: unknown) {
    console.error('Error cancelling project:', error);
    throw error;
  }
}

/**
 * Generate image using Sogni with progress tracking
 * 
 * @param params Image generation parameters
 * @param progressCallback Callback function for progress updates
 * @returns Promise that resolves with the generated image URLs
 */
export async function generateImage(params: Record<string, unknown>, progressCallback?: (progress: unknown) => void): Promise<unknown> {
  try {
    console.log(`Making request to: ${API_BASE_URL}/sogni/generate`);
    // Debug log to track sourceType
    console.log(`generateImage received sourceType: ${typeof params.sourceType === 'string' ? params.sourceType : 'undefined'}`);
    
    // Check network connectivity before starting
    const isConnected = await checkConnectivity();
    if (!isConnected) {
      throw new NetworkError(
        'No internet connection. Please check your network and try again.',
        false,
        true,
        true
      );
    }
    
    // Include client app ID in the params
    const requestParams = {
      ...params,
      clientAppId, // Add the client app ID
      sourceType: params.sourceType || ''
    };
    
    // Debug log the final sourceType being sent to API
    console.log(`Final sourceType being sent to API: ${typeof requestParams.sourceType === 'string' ? requestParams.sourceType : 'unknown type'}`);
    
    // Use XMLHttpRequest for real upload progress tracking
    const { projectId, status, responseData } = await new Promise<{ projectId: string | undefined; status: string | undefined; responseData: Record<string, unknown> }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      // Set timeout for the initial request (30 seconds for mobile)
      const REQUEST_TIMEOUT = 30000; // 30 seconds
      let requestTimer: NodeJS.Timeout | undefined;
      
      const cleanup = () => {
        if (requestTimer) {
          clearTimeout(requestTimer);
          requestTimer = undefined;
        }
      };
      
      // Set up timeout
      requestTimer = setTimeout(() => {
        cleanup();
        xhr.abort();
        reject(new NetworkError(
          'Request timed out. Please check your internet connection and try again.',
          true,
          false,
          true
        ));
      }, REQUEST_TIMEOUT);
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && progressCallback) {
          const uploadProgress = (event.loaded / event.total) * 100;
          // console.log(`Real upload progress: ${uploadProgress.toFixed(1)}%`);
          progressCallback({
            type: 'uploadProgress',
            progress: uploadProgress
          });
        }
      });
      
      // Handle upload completion
      xhr.upload.addEventListener('load', () => {
        console.log('Upload completed, processing on server...');
        if (progressCallback) {
          progressCallback({
            type: 'uploadComplete'
          });
        }
      });
      
      // Handle response
      xhr.addEventListener('load', () => {
        cleanup();
        try {
          if (xhr.status >= 200 && xhr.status < 300) {
            const jsonRaw: unknown = JSON.parse(xhr.responseText);
            const json: Record<string, unknown> = isObjectRecord(jsonRaw) ? jsonRaw : {};
            resolve({
              projectId: json.projectId as string | undefined,
              status: json.status as string | undefined,
              responseData: json
            });
          } else {
            const errorMessage = xhr.status === 0 
              ? 'Network connection lost. Please check your internet and try again.'
              : `Server error (${xhr.status}). Please try again.`;
            
            reject(new NetworkError(
              errorMessage,
              false,
              xhr.status === 0,
              true
            ));
          }
        } catch (error) {
          reject(new NetworkError(
            `Network error: ${error instanceof Error ? error.message : String(error)}`,
            false,
            false,
            true
          ));
        }
      });
      
      // Handle errors
      xhr.addEventListener('error', () => {
        cleanup();
        // Check connectivity and handle appropriately
        checkConnectivity().then(isConnected => {
          reject(new NetworkError(
            isConnected 
              ? 'Network error during upload. Please try again.'
              : 'Internet connection lost. Please check your network and try again.',
            false,
            !isConnected,
            true
          ));
        }).catch(() => {
          // If connectivity check fails, assume network error
          reject(new NetworkError(
            'Network error during upload. Please check your connection and try again.',
            false,
            true,
            true
          ));
        });
      });
      
      xhr.addEventListener('abort', () => {
        cleanup();
        reject(new NetworkError('Request was cancelled', false, false, false));
      });
      
      // Configure and send request
      xhr.open('POST', `${API_BASE_URL}/sogni/generate`);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.setRequestHeader('X-Client-App-ID', clientAppId);
      xhr.withCredentials = true; // Include credentials for cross-origin requests
      
      xhr.send(JSON.stringify(requestParams));
    });
    
    // Mark that we have successfully connected
    hasConnectedToSogni = true;
    
    if (status !== 'processing' || !projectId) {
      throw new Error('Failed to start image generation');
    }
    
    // Extract clientAppId from response if provided for better session tracking
    let responseClientAppId = clientAppId;
    if (responseData && typeof responseData === 'object' && 'clientAppId' in responseData && typeof responseData.clientAppId === 'string') {
      responseClientAppId = responseData.clientAppId;
      console.log(`Using backend-provided clientAppId: ${responseClientAppId}`);
    }
    
    // If no progress callback is provided, just return the project ID
    if (!progressCallback) {
      return { projectId, clientAppId: responseClientAppId };
    }
    
    // Set up SSE for progress tracking
    return new Promise((_resolve, reject) => {
      // Include connection retry logic for more robustness
      let retryCount = 0;
      const maxRetries = 5; // Increase from 3 to 5
      let eventSource: EventSource | null = null;
      let connectionTimeout: NodeJS.Timeout | undefined = undefined;
      let overallTimeout: NodeJS.Timeout | undefined = undefined;
      
      // Keep track of reconnection timers
      let reconnectionTimer: NodeJS.Timeout | undefined = undefined;
      
      // Function to clear all timers
      const clearAllTimers = () => {
        if (connectionTimeout !== undefined) {
          clearTimeout(connectionTimeout);
          connectionTimeout = undefined;
        }
        if (reconnectionTimer !== undefined) {
          clearTimeout(reconnectionTimer);
          reconnectionTimer = undefined;
        }
        if (overallTimeout !== undefined) {
          clearTimeout(overallTimeout);
          overallTimeout = undefined;
        }
      };
      
      // Function to safely close EventSource
      const safelyCloseEventSource = () => {
        if (eventSource) {
          try {
            eventSource.close();
          } catch (err) {
            console.warn('Error closing EventSource:', err);
          }
          eventSource = null;
        }
      };
      
      // Start connecting immediately without delay
      const connectSSE = () => {
        // Clean up any existing connection first
        clearAllTimers();
        safelyCloseEventSource();
        
        // Add client app ID to the URL as a query parameter for more reliable passing 
        // through proxies and better debugging
        const progressUrl = `${API_BASE_URL}/sogni/progress/${projectId}?clientAppId=${encodeURIComponent(responseClientAppId)}&_t=${Date.now()}`;
        console.log(`Connecting to progress stream: ${progressUrl} (attempt ${retryCount + 1})`);
        
        // Create the EventSource with the with-credentials flag for CORS
        try {
          eventSource = new EventSource(progressUrl, { 
            withCredentials: true 
          });
          
          // Set a shorter initial connection timeout
          connectionTimeout = setTimeout(() => {
            console.error('EventSource connection timeout');
            safelyCloseEventSource();
            
            if (retryCount < maxRetries) {
              retryCount++;
              console.log(`Retrying connection (${retryCount}/${maxRetries})...`);
              // Use exponential backoff
              reconnectionTimer = setTimeout(connectSSE, 1000 * Math.pow(1.5, retryCount));
            } else {
              clearAllTimers();
              reject(new NetworkError(
                'Connection timeout. Please check your internet connection and try again.',
                true,
                false,
                true
              ));
            }
          }, 7000); // Reduced from 15s to 7s for initial connection
          
          // Successfully connected
          eventSource.onopen = () => {
            console.log('EventSource connection established, clearing connection timeout.');
            clearTimeout(connectionTimeout);
            connectionTimeout = undefined;
            // Reset retry count on successful connection
            retryCount = 0;
          };
          
          eventSource.onmessage = (event) => {
            try {
              const parsed: unknown = typeof event.data === 'string' ? JSON.parse(event.data) : {};
              const data: Record<string, unknown> = isObjectRecord(parsed) ? parsed : {};
              const projectIdStr = typeof data.projectId === 'string' ? data.projectId : 'N/A';
              console.log(`SSE message received: Type=${String(data.type)}, ProjectID=${projectIdStr}`);

              // For any message type, extend the connection timeout as we're getting data
              if (connectionTimeout !== undefined) {
                clearTimeout(connectionTimeout);
                connectionTimeout = undefined;
              }

              // Only handle connection/heartbeat events internally
              if (data.type === 'connected' || data.type === 'heartbeat') {
                // Optionally log or handle connection events
                return;
              }

              // For all other events, just forward to the callback
              if (progressCallback) {
                progressCallback(data);
              }
              
              // Clear overall timeout if we receive a completion or error event
                        if (data.type === 'completed' || data.type === 'failed' || data.type === 'error') {
            console.log(`Project completion/error event received for ${projectId}, clearing overall timeout`);
            clearAllTimers();
            
            // Check for missing jobs and only delay if needed
            if (data.type === 'completed') {
              // Check if the completion event includes information about missing jobs
              const missingJobs = data.missingJobs as { expected: number; completed: number } | undefined;
              const hasMissingJobs = missingJobs && missingJobs.expected > missingJobs.completed;
              
              if (hasMissingJobs) {
                const missingCount = missingJobs.expected - missingJobs.completed;
                console.log(`Project ${projectId} completed but ${missingCount} jobs still incomplete - delaying EventSource close up to 5 seconds`);
                
                // Set up monitoring for missing jobs with 5 second timeout
                const startTime = Date.now();
                let jobsReceived = 0;
                
                const checkInterval = setInterval(() => {
                  const elapsed = Date.now() - startTime;
                  
                  // Check if we've received the missing jobs by counting jobCompleted events
                  // This is a simple heuristic - if we started with a deficit and now see more activity,
                  // we assume the missing jobs arrived
                  if (jobsReceived >= missingCount) {
                    console.log(`Missing jobs received after ${elapsed}ms, closing EventSource`);
                    clearInterval(checkInterval);
                    safelyCloseEventSource();
                    return;
                  }
                  
                  if (elapsed >= 5000) {
                    console.log(`Timeout reached (${elapsed}ms), closing EventSource anyway`);
                    clearInterval(checkInterval);
                    safelyCloseEventSource();
                  }
                }, 200); // Check every 200ms
                
                // Listen for job completion events during the wait period
                const originalCallback = progressCallback;
                if (originalCallback) {
                  progressCallback = (event: unknown) => {
                    originalCallback(event);
                    
                    // Count job completion events during wait period
                    const eventObj = event as Record<string, unknown>;
                    if (event && typeof event === 'object' && eventObj.type === 'jobCompleted') {
                      jobsReceived++;
                    }
                  };
                }
              } else {
                console.log(`All jobs completed for project ${projectId}, closing EventSource immediately`);
                safelyCloseEventSource();
              }
            } else {
              // For failed/error events, close immediately - don't wait for remaining jobs
              console.log(`Project ${projectId} failed/errored, closing EventSource immediately`);
              safelyCloseEventSource();
            }
          }
            } catch (error) {
              console.error('Error parsing SSE message:', error, 'Original data:', event.data);
              // Continue listening, don't fail on a single parse error
            }
          };
          
          eventSource.onerror = (err) => {
            // Log the specific error event if possible
            console.error('EventSource onerror event triggered:', err);
            
            // Clear any pending timeouts
            clearAllTimers();
            
            if (retryCount < maxRetries) {
              safelyCloseEventSource();
              retryCount++;
              
              // For ECONNRESET errors, we want to retry more quickly
              const isNetworkError = err instanceof Event && 
                (err.target && typeof ((err.target as unknown) as { readyState?: unknown }).readyState === 'number' && ((err.target as unknown) as { readyState: number }).readyState === EventSource.CLOSED);
              
              console.log(`EventSource connection error. Retrying (${retryCount}/${maxRetries})...`);
              
              // Check network connectivity before retrying
              checkConnectivity().then(isConnected => {
                if (!isConnected) {
                  console.log('Device is offline, will retry when connection is restored');
                  // Longer delay when offline
                  const delay = 5000; // 5 seconds when offline
                  reconnectionTimer = setTimeout(connectSSE, delay);
                } else {
                  // Use shorter delay for network errors when online
                  const delay = isNetworkError ? 500 : 1000 * Math.pow(1.5, retryCount);
                  console.log(`Will retry in ${delay}ms`);
                  reconnectionTimer = setTimeout(connectSSE, delay);
                }
              }).catch(() => {
                // If connectivity check fails, use default retry logic
                const delay = isNetworkError ? 500 : 1000 * Math.pow(1.5, retryCount);
                console.log(`Will retry in ${delay}ms (connectivity check failed)`);
                reconnectionTimer = setTimeout(connectSSE, delay);
              });
            } else {
              console.error('EventSource connection failed permanently after retries.');
              if (typeof window !== 'undefined') {
                notifyConnectionStateChange('offline');
              }
              clearAllTimers();
              safelyCloseEventSource();
              
              // Check connectivity to provide appropriate error message
              checkConnectivity().then(isConnected => {
                reject(new NetworkError(
                  isConnected 
                    ? 'Unable to connect to processing server. Please try again.'
                    : 'Internet connection lost. Please check your network and try again.',
                  false,
                  !isConnected,
                  true
                ));
              }).catch(() => {
                reject(new NetworkError(
                  'Connection failed. Please check your internet and try again.',
                  false,
                  true,
                  true
                ));
              });
            }
          };
          
          // Add a timeout for the entire process
          overallTimeout = setTimeout(() => {
            console.log(`Overall timeout reached for project ${projectId} after 5 minutes`);
            clearAllTimers();
            safelyCloseEventSource();
            reject(new NetworkError(
              'Generation timed out. Please try again.',
              true,
              false,
              true
            ));
          }, 300000); // 5 minute timeout for the entire process
        } catch (error) {
          console.error('Error creating EventSource:', error);
          clearAllTimers();
          safelyCloseEventSource();
          reject(new NetworkError(
            'Failed to establish connection. Please check your network and try again.',
            false,
            false,
            true
          ));
        }
      };
      
      // Start connection process
      connectSSE();
    });
  } catch (error: unknown) {
    console.error('Error generating image:', error);
    
    // Re-throw NetworkErrors as-is for proper handling
    if (error instanceof NetworkError) {
      throw error;
    }
    
    // Convert other errors to NetworkError for consistent handling
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new NetworkError(
      `Unexpected error: ${errorMessage}. Please try again.`,
      false,
      false,
      true
    );
  }
}

/**
 * Check if an error is a network-related error that can be retried
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
} 