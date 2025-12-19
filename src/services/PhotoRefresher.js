/**
 * Handles photo refresh using Sogni API - regenerates a single photo with its original prompt
 */

import { styleIdToDisplay } from '../utils';

/**
 * Refreshes a photo using Sogni API
 * 
 * @param {Object} options
 * @param {Object} options.photo - Current photo object
 * @param {number} options.photoIndex - Index of the photo in the photos array
 * @param {Object} options.sogniClient - Sogni client instance
 * @param {(updater: (prev: any[]) => any[]) => void} options.setPhotos - React setState function for photos
 * @param {Object} options.settings - Current settings from context
 * @param {Object} options.lastPhotoData - Last photo data with blob and dataUrl
 * @param {Object} options.stylePrompts - Style prompts mapping for finding style display text
 * @param {() => void} options.onOutOfCredits - Callback to trigger out of credits popup
 * @returns {Promise<void>}
 */
export const refreshPhoto = async (options) => {
  const {
    photo,
    photoIndex,
    sogniClient,
    setPhotos,
    settings,
    lastPhotoData,
    stylePrompts,
    tokenType, // Payment method (for frontend auth)
    isPremiumSpark, // Premium status (for frontend auth)
    onOutOfCredits // Callback to show out of credits popup
  } = options;

  // Input validation
  if (typeof photoIndex !== 'number' || photoIndex < 0) {
    console.error(`[REFRESH] Invalid photoIndex: ${photoIndex}`);
    return;
  }
  
  if (!photo) {
    console.error(`[REFRESH] No photo provided for refresh at index ${photoIndex}`);
    return;
  }
  
  if (!setPhotos || typeof setPhotos !== 'function') {
    console.error(`[REFRESH] Invalid setPhotos function provided`);
    return;
  }

  // Check if photo has a prompt
  const promptToUse = photo.positivePrompt || photo.stylePrompt;
  if (!promptToUse) {
    console.error(`[REFRESH] No prompt found for photo at index ${photoIndex}`);
    return;
  }

  // Preserve the original promptKey from the photo being refreshed
  const originalPromptKey = photo.promptKey;
  console.log(`[REFRESH] Original promptKey from photo: ${originalPromptKey}`);

  // Get the original data URL for the reference image
  const originalDataUrl = photo.originalDataUrl || lastPhotoData?.dataUrl;
  if (!originalDataUrl || !lastPhotoData?.blob) {
    console.error(`[REFRESH] No source data available for refresh`);
    return;
  }

  let timeoutId; // Declare timeoutId in outer scope

  try {
    console.log(`[REFRESH] Starting refresh for photo #${photoIndex} with prompt:`, promptToUse);
    
    // Set loading state
    setPhotos(prev => {
      console.log(`[REFRESH] Setting loading state for photo #${photoIndex}`);
      const updated = [...prev];
      
      if (!updated[photoIndex]) {
        console.error(`[REFRESH] Photo at index ${photoIndex} does not exist`);
        return prev;
      }

      updated[photoIndex] = {
        ...updated[photoIndex],
        generating: true,
        loading: true,
        progress: 0,
        error: null,
        statusText: 'Calling Art Robot',
        refreshTimeoutId: null,
        currentRefreshJobId: null,
      };
      return updated;
    });

    // Set a timeout fallback
    timeoutId = setTimeout(() => {
      console.warn(`[REFRESH] Refresh timeout reached for photo #${photoIndex}, resetting state`);
      setPhotos(prev => {
        const updated = [...prev];
        const current = updated[photoIndex];
        if (!current) return prev;
        
        if (current.refreshTimeoutId && current.refreshTimeoutId !== timeoutId) {
          return prev;
        }
        
        if (current.generating) {
          updated[photoIndex] = {
            ...current,
            loading: false,
            generating: false,
            error: 'GENERATION TIMEOUT: Job took too long',
            permanentError: true,
            statusText: 'Timed Out',
            refreshTimeoutId: null
          };
        }
        return updated;
      });
    }, 120000); // 2 minute timeout
    
    // Store timeout ID in photo state
    setPhotos(prev => {
      const updated = [...prev];
      if (updated[photoIndex]) {
        updated[photoIndex] = {
          ...updated[photoIndex],
          refreshTimeoutId: timeoutId
        };
      }
      return updated;
    });
    
    // Get source image blob
    const response = await fetch(originalDataUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    const imageBlob = await response.blob();
    console.log(`[REFRESH] Image blob size: ${imageBlob.size} bytes`);
    
    // Get the actual dimensions from the original source image
    const imageDimensions = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = reject;
      img.src = originalDataUrl;
    });
    
    console.log(`[REFRESH] Original image dimensions: ${imageDimensions.width}x${imageDimensions.height}`);
    
    const arrayBuffer = await imageBlob.arrayBuffer();
    console.log(`[REFRESH] Creating refresh project with Sogni API`, { 
      photoIndex, 
      arrayBufferSize: arrayBuffer.byteLength,
      dimensions: imageDimensions 
    });
    
    if (!sogniClient || !sogniClient.projects || !sogniClient.projects.create) {
      throw new Error('Sogni client is not properly initialized');
    }
    
    // Check WebSocket connection for frontend clients before creating project
    if (sogniClient.apiClient && sogniClient.apiClient.websocket) {
      const wsState = sogniClient.apiClient.websocket.readyState;
      if (wsState !== 1) { // 1 = WebSocket.OPEN
        console.error(`[REFRESH] WebSocket not connected (readyState: ${wsState})`);
        throw new Error('WebSocket not connected - please verify your email at app.sogni.ai');
      }
      console.log('[REFRESH] WebSocket connection verified');
    }
    
    // Get settings
    const { 
      selectedModel, 
      controlNetStrength, 
      controlNetGuidanceEnd,
      inferenceSteps, 
      scheduler, 
      timeStepSpacing,
      guidance,
      promptGuidance,
      stylePrompt,
      negativePrompt,
      seed,
      outputFormat,
      sensitiveContentFilter,
      aspectRatio
    } = settings;

    // Check if model is Flux Kontext
    const isFluxKontext = selectedModel && selectedModel.includes('kontext');
    
    // Parse seed if provided
    let seedParam = undefined;
    if (seed && seed.trim() !== '') {
      const parsed = parseInt(seed.trim(), 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 4294967295) {
        seedParam = parsed;
      }
    }

    // Import getCustomDimensions to get proper dimensions based on aspect ratio
    const { getCustomDimensions } = await import('../utils/imageProcessing.js');
    
    // Use the aspect ratio settings to get proper dimensions (stays within 2048 limit)
    // This ensures we don't exceed API limits while maintaining the correct aspect ratio
    const targetDimensions = getCustomDimensions(aspectRatio);
    const { width, height } = targetDimensions;
    
    console.log(`[REFRESH] Using dimensions from aspect ratio '${aspectRatio}': ${width}x${height} (original was ${imageDimensions.width}x${imageDimensions.height})`);

    // Create project configuration for a single image refresh
    const projectConfig = {
      type: 'image', // Required in SDK v4.x.x
      testnet: false,
      tokenType, // Use selected payment method from wallet (for frontend auth)
      isPremiumSpark, // Pass premium status (for frontend auth)
      modelId: selectedModel,
      positivePrompt: promptToUse, // Use the photo's original prompt
      negativePrompt: negativePrompt?.trim() || 'lowres, worst quality, low quality',
      stylePrompt: stylePrompt?.trim() || '',
      sizePreset: 'custom',
      width,
      height,
      steps: inferenceSteps,
      guidance: isFluxKontext ? guidance : promptGuidance,
      numberOfMedia: 1, // Single image refresh
      scheduler,
      timeStepSpacing,
      outputFormat: outputFormat || 'png',
      sensitiveContentFilter, // Adapters will convert to disableNSFWFilter for SDK
      sourceType: 'refresh', // Track refresh operations
      ...(seedParam !== undefined ? { seed: seedParam } : {})
    };

    // Add image configuration based on model type
    if (isFluxKontext) {
      projectConfig.contextImages = [new Uint8Array(arrayBuffer)];
    } else {
      projectConfig.controlNet = {
        name: 'instantid',
        image: new Uint8Array(arrayBuffer),
        strength: controlNetStrength,
        mode: 'balanced',
        guidanceStart: 0,
        guidanceEnd: controlNetGuidanceEnd,
      };
    }
    
    let project;
    try {
      project = await sogniClient.projects.create(projectConfig);
    console.log(`[REFRESH] Refresh project created with ID: ${project.id}`);
    } catch (createError) {
      console.error(`[REFRESH] Project creation failed:`, createError);
      
      // Extract error message from various error formats
      let errorMessage = 'Failed to create refresh project';
      if (createError instanceof Error) {
        errorMessage = createError.message;
      } else if (typeof createError === 'object' && createError !== null) {
        if (createError.message) {
          errorMessage = createError.message;
        } else if (createError.error) {
          errorMessage = createError.error;
        } else if (createError.payload?.message) {
          errorMessage = createError.payload.message;
        } else if (createError.payload?.error) {
          errorMessage = createError.payload.error;
        }
      }
      
      // Log the full error for debugging
      console.error(`[REFRESH] Full error details:`, {
        error: createError,
        message: errorMessage,
        type: typeof createError,
        keys: createError && typeof createError === 'object' ? Object.keys(createError) : []
      });
      
      // Clear timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // Update UI to show error
      setPhotos(prev => {
        const updated = [...prev];
        if (!updated[photoIndex]) return prev;
        updated[photoIndex] = {
          ...updated[photoIndex],
          generating: false,
          loading: false,
          error: errorMessage,
          refreshError: errorMessage,
          refreshTimeoutId: null
        };
        return updated;
      });
      
      return; // Exit early - don't continue with the rest of the function
    }
    
    // Update with project ID
    setPhotos(prev => {
      const updated = [...prev];
      if (!updated[photoIndex]) return prev;
      
      updated[photoIndex] = {
        ...updated[photoIndex],
        projectId: project.id
      };
      return updated;
    });
    
    // Set up event listeners
    project.on('job', (event) => {
      const { type, jobId, progress, workerName, queuePosition } = event;
      
      console.log(`[REFRESH] Job event received:`, { type, jobId, progress, workerName });
      
      // Store job ID when we first see it
      if (jobId && ['started', 'progress'].includes(type)) {
        setPhotos(prev => {
          const updated = [...prev];
          const current = updated[photoIndex];
          if (!current || !current.generating) return prev;
          
          if (!current.currentRefreshJobId || current.projectId === project.id) {
            console.log(`[REFRESH] Setting job ID for photo #${photoIndex}: ${jobId}`);
            updated[photoIndex] = {
              ...current,
              currentRefreshJobId: jobId
            };
            return updated;
          }
          return prev;
        });
      }
      
      // Handle queued status
      if (type === 'queued' && queuePosition !== undefined) {
        setPhotos(prev => {
          const updated = [...prev];
          const current = updated[photoIndex];
          if (!current || !current.generating) return prev;
          
          // Only update with queue position if it's greater than 1
          if (queuePosition > 1) {
            updated[photoIndex] = {
              ...current,
              statusText: `Queue position ${queuePosition}`,
              queuePosition
            };
          }
          return updated;
        });
      }
      
      // Handle initiating/started status
      if (type === 'initiating' || type === 'started') {
        setPhotos(prev => {
          const updated = [...prev];
          const current = updated[photoIndex];
          if (!current || !current.generating) return prev;
          
          updated[photoIndex] = {
            ...current,
            statusText: workerName ? `${workerName} starting...` : 'Worker starting...',
            workerName: workerName || 'Worker'
          };
          return updated;
        });
      }
      
      // Handle progress events
      if (type === 'progress' && progress !== undefined && jobId) {
        const progressValue = typeof progress === 'number' ? progress : 0;
        const progressPercent = Math.floor(progressValue * 100);
        console.log(`[REFRESH] Job progress: ${progressPercent}%`);
        
        setPhotos(prev => {
          const updated = [...prev];
          const current = updated[photoIndex];
          if (!current) return prev;
          
          if (!current.generating || (current.currentRefreshJobId && current.currentRefreshJobId !== jobId)) {
            return prev;
          }
          
          // Use cached worker name if available
          const cachedWorkerName = current.workerName || 'Worker';
          const currentWorkerName = (workerName && workerName !== 'Worker') ? workerName : cachedWorkerName;
          
          updated[photoIndex] = {
            ...current,
            progress: progressPercent,
            statusText: progressPercent > 0 
              ? `${currentWorkerName} makin art ${progressPercent}%`
              : `${currentWorkerName} makin art`,
            workerName: currentWorkerName
          };
          return updated;
        });
      }
    });
    
    // Listen for jobCompleted event
    project.on('jobCompleted', (job) => {
      console.log('[REFRESH] jobCompleted full payload:', job);
      console.log(`[REFRESH] Job completion check: job.id=${job.id}, photoIndex=${photoIndex}`);
      
      if (job.resultUrl) {
        // Clear timeout
        clearTimeout(timeoutId);
        
        // Convert S3 URL to blob URL to avoid CORS issues with video generation
        const convertToBlobUrl = async (url) => {
          try {
            const response = await fetch(url);
            if (response.ok) {
              const blob = await response.blob();
              return URL.createObjectURL(blob);
            }
          } catch (e) {
            console.warn('[REFRESH] Could not convert to blob URL, using original:', e.message);
          }
          return url; // Fallback to original URL
        };
        
        // Preload the refreshed image and convert to blob URL
        const preloadImage = new Image();
        preloadImage.crossOrigin = 'anonymous';
        preloadImage.onload = async () => {
          console.log(`[REFRESH] Refreshed image preloaded successfully`);
          
          // Try to convert S3 URL to blob URL for better CORS compatibility
          let finalImageUrl = job.resultUrl;
          if (job.resultUrl.startsWith('http') && !job.resultUrl.startsWith('blob:')) {
            console.log('[REFRESH] Converting S3 URL to blob URL...');
            finalImageUrl = await convertToBlobUrl(job.resultUrl);
            if (finalImageUrl !== job.resultUrl) {
              console.log('[REFRESH] Successfully converted to blob URL');
            }
          }
          
          setPhotos(prev => {
            const updated = [...prev];
            const current = updated[photoIndex];
            if (!current) return prev;
            
            if (current.currentRefreshJobId && current.currentRefreshJobId !== job.id) {
              console.log(`[REFRESH] Ignoring completion - wrong job ID`);
              return prev;
            }
            
            // Find the style display name for statusText (same logic as main generation)
            // Use the preserved originalPromptKey first, or try to find from prompt
            const finalPromptKey = originalPromptKey || 
              Object.entries(stylePrompts || {}).find(([, value]) => value === promptToUse)?.[0];
            
            let statusText = '#SogniPhotobooth'; // Default fallback
            if (finalPromptKey && finalPromptKey !== 'custom' && finalPromptKey !== 'random' && finalPromptKey !== 'randomMix') {
              statusText = styleIdToDisplay(finalPromptKey);
            }
            
            console.log(`[REFRESH] Setting statusText to: ${statusText}, promptKey to: ${finalPromptKey}`);
            
            updated[photoIndex] = {
              ...current,
              loading: false,
              generating: false,
              images: [finalImageUrl], // Use blob URL for better CORS compatibility
              newlyArrived: true,
              progress: 100,
              statusText, // Set statusText to style name (like "SUMI DRAGON")
              refreshTimeoutId: null,
              currentRefreshJobId: null,
              positivePrompt: promptToUse, // Keep the prompt for future refreshes
              stylePrompt: promptToUse, // Also set stylePrompt for label display via getStyleDisplayText
              promptKey: finalPromptKey // Preserve promptKey for proper label display
            };
            return updated;
          });
        };
        
        preloadImage.onerror = () => {
          console.error(`[REFRESH] Failed to preload refreshed image`);
          // Still update the state
          
          // Find the style display name for statusText (same logic as main generation)
          // Use the preserved originalPromptKey first, or try to find from prompt
          const finalPromptKey = originalPromptKey || 
            Object.entries(stylePrompts || {}).find(([, value]) => value === promptToUse)?.[0];
          
          let statusText = '#SogniPhotobooth'; // Default fallback
          if (finalPromptKey && finalPromptKey !== 'custom' && finalPromptKey !== 'random' && finalPromptKey !== 'randomMix') {
            statusText = styleIdToDisplay(finalPromptKey);
          }
          
          console.log(`[REFRESH] (error path) Setting statusText to: ${statusText}, promptKey to: ${finalPromptKey}`);
          
          setPhotos(prev => {
            const updated = [...prev];
            const current = updated[photoIndex];
            if (!current) return prev;
            if (current.projectId && current.projectId !== project.id) return prev;
            
            updated[photoIndex] = {
              ...current,
              loading: false,
              generating: false,
              images: [job.resultUrl],
              newlyArrived: true,
              progress: 100,
              statusText, // Set statusText to style name (like "SUMI DRAGON")
              refreshTimeoutId: null,
              currentRefreshJobId: null,
              positivePrompt: promptToUse,
              stylePrompt: promptToUse, // Also set stylePrompt for label display via getStyleDisplayText
              promptKey: finalPromptKey // Preserve promptKey for proper label display
            };
            return updated;
          });
        };
        
        preloadImage.src = job.resultUrl;
      } else {
        clearTimeout(timeoutId);
        
        setPhotos(prev => {
          const updated = [...prev];
          const current = updated[photoIndex];
          if (!current) return prev;
          if (current.projectId && current.projectId !== project.id) return prev;
          
          updated[photoIndex] = {
            ...current,
            loading: false,
            generating: false,
            error: 'GENERATION FAILED: result missing',
            permanentError: true,
            statusText: 'Failed',
            refreshTimeoutId: null
          };
          return updated;
        });
      }
    });

    // Listen for jobFailed event
    project.on('jobFailed', (job) => {
      console.error('[REFRESH] jobFailed full payload:', job);
      clearTimeout(timeoutId);
      
      setPhotos(prev => {
        const updated = [...prev];
        const current = updated[photoIndex];
        if (!current) return prev;
        if (current.projectId && current.projectId !== project.id) return prev;
        
        updated[photoIndex] = {
          ...current,
          loading: false,
          generating: false,
          error: 'GENERATION FAILED: processing error',
          permanentError: true,
          statusText: 'Failed',
          refreshTimeoutId: null
        };
        return updated;
      });
    });

    // Listen for project-level failure (SDK errors, auth errors, etc.)
    project.on('failed', (error) => {
      console.error('[REFRESH] Project failed event received:', error);
      clearTimeout(timeoutId);
      
      // Check for insufficient funds error (code 4024 or message containing "insufficient funds")
      const isInsufficientFunds = error && typeof error === 'object' &&
        (error.code === 4024 || 
         (error.message && (
           error.message.toLowerCase().includes('insufficient funds') ||
           error.message.toLowerCase().includes('insufficient') && error.message.toLowerCase().includes('credits')
         )));
      
      if (isInsufficientFunds) {
        console.error('[REFRESH] ❌ Insufficient funds - triggering out of credits popup');
        
        // Update photo state with out of credits error
        setPhotos(prev => {
          const updated = [...prev];
          const current = updated[photoIndex];
          if (!current) return prev;
          if (current.projectId && current.projectId !== project.id) return prev;
          
          updated[photoIndex] = {
            ...current,
            loading: false,
            generating: false,
            error: 'INSUFFICIENT CREDITS',
            permanentError: true,
            statusText: 'Out of Credits',
            refreshTimeoutId: null,
            currentRefreshJobId: null
          };
          return updated;
        });
        
        // Trigger out of credits popup
        if (onOutOfCredits) {
          onOutOfCredits();
        }
        return;
      }
      
      setPhotos(prev => {
        const updated = [...prev];
        const current = updated[photoIndex];
        if (!current) return prev;
        if (current.projectId && current.projectId !== project.id) return prev;
        
        // Determine error message based on error type
        let errorMessage = 'GENERATION FAILED: processing error';
        if (error?.message) {
          if (error.message.includes('not found') || error.message.includes('404')) {
            errorMessage = 'GENERATION FAILED: project not found';
          } else if (error.message.includes('Insufficient') || error.message.includes('credits') || error.message.includes('funds')) {
            errorMessage = 'GENERATION FAILED: replenish tokens';
          } else if (error.message.includes('network') || error.message.includes('connection') || error.message.includes('WebSocket')) {
            errorMessage = 'GENERATION FAILED: connection error';
          } else if (error.message.includes('timeout')) {
            errorMessage = 'GENERATION FAILED: timeout error';
          } else if (error.message.includes('verify') || error.message.includes('verification')) {
            errorMessage = 'GENERATION FAILED: verify email';
          }
        }
        
        updated[photoIndex] = {
          ...current,
          loading: false,
          generating: false,
          error: errorMessage,
          permanentError: true,
          statusText: 'Failed',
          refreshTimeoutId: null,
          currentRefreshJobId: null
        };
        return updated;
      });
    });

    // Listen for general project errors (e.g., 404, API errors, sync failures)
    project.on('error', (error) => {
      console.error('[REFRESH] Project error event received:', error);
      clearTimeout(timeoutId);
      
      // Check for insufficient funds error (code 4024 or message containing "insufficient funds")
      const isInsufficientFunds = error && typeof error === 'object' &&
        (error.code === 4024 || 
         (error.message && (
           error.message.toLowerCase().includes('insufficient funds') ||
           error.message.toLowerCase().includes('insufficient') && error.message.toLowerCase().includes('credits')
         )));
      
      if (isInsufficientFunds) {
        console.error('[REFRESH] ❌ Insufficient funds - triggering out of credits popup');
        
        // Update photo state with out of credits error
        setPhotos(prev => {
          const updated = [...prev];
          const current = updated[photoIndex];
          if (!current) return prev;
          if (current.projectId && current.projectId !== project.id) return prev;
          
          updated[photoIndex] = {
            ...current,
            loading: false,
            generating: false,
            error: 'INSUFFICIENT CREDITS',
            permanentError: true,
            statusText: 'Out of Credits',
            refreshTimeoutId: null,
            currentRefreshJobId: null
          };
          return updated;
        });
        
        // Trigger out of credits popup
        if (onOutOfCredits) {
          onOutOfCredits();
        }
        return;
      }
      
      setPhotos(prev => {
        const updated = [...prev];
        const current = updated[photoIndex];
        if (!current) return prev;
        if (current.projectId && current.projectId !== project.id) return prev;
        
        // Determine error message based on error type
        let errorMessage = 'GENERATION FAILED: processing error';
        if (error?.message) {
          if (error.message.includes('not found') || error.message.includes('404')) {
            errorMessage = 'GENERATION FAILED: project not found';
          } else if (error.message.includes('Insufficient') || error.message.includes('credits') || error.message.includes('funds')) {
            errorMessage = 'GENERATION FAILED: replenish tokens';
          } else if (error.message.includes('network') || error.message.includes('connection')) {
            errorMessage = 'GENERATION FAILED: connection error';
          } else if (error.message.includes('timeout')) {
            errorMessage = 'GENERATION FAILED: timeout error';
          }
        }
        
        updated[photoIndex] = {
          ...current,
          loading: false,
          generating: false,
          error: errorMessage,
          permanentError: true,
          statusText: 'Failed',
          refreshTimeoutId: null,
          currentRefreshJobId: null
        };
        return updated;
      });
    });
      
  } catch (error) {
    console.error(`[REFRESH] Error refreshing image:`, error);
    clearTimeout(timeoutId);
    
    // Check for insufficient funds error
    const isInsufficientFunds = error?.message && (
      error.message.toLowerCase().includes('insufficient funds') ||
      (error.message.toLowerCase().includes('insufficient') && error.message.toLowerCase().includes('credits'))
    );
    
    if (isInsufficientFunds) {
      console.error('[REFRESH] ❌ Insufficient funds - triggering out of credits popup');
      
      // Update photo state with out of credits error
      setPhotos(prev => {
        const updated = [...prev];
        if (!updated[photoIndex]) return prev;
        
        updated[photoIndex] = {
          ...updated[photoIndex],
          loading: false,
          generating: false,
          error: 'INSUFFICIENT CREDITS',
          permanentError: true,
          statusText: 'Out of Credits',
          refreshTimeoutId: null
        };
        return updated;
      });
      
      // Trigger out of credits popup
      if (onOutOfCredits) {
        onOutOfCredits();
      }
      return;
    }
    
    setPhotos(prev => {
      const updated = [...prev];
      if (!updated[photoIndex]) return prev;
      
      // Determine error message based on error type
      let errorMessage = 'GENERATION FAILED: processing error';
      if (error?.message) {
        if (error.message.includes('WebSocket not connected')) {
          errorMessage = 'GENERATION FAILED: verify email';
        } else if (error.message.includes('Insufficient') || error.message.includes('credits') || error.message.includes('funds')) {
          errorMessage = 'GENERATION FAILED: replenish tokens';
        } else if (error.message.includes('network') || error.message.includes('connection')) {
          errorMessage = 'GENERATION FAILED: connection error';
        } else if (error.message.includes('timeout')) {
          errorMessage = 'GENERATION FAILED: timeout error';
        } else if (error.message.includes('verify') || error.message.includes('verification')) {
          errorMessage = 'GENERATION FAILED: verify email';
        }
      }
      
      updated[photoIndex] = {
        ...updated[photoIndex],
        loading: false,
        generating: false,
        error: errorMessage,
        permanentError: true,
        statusText: 'Failed',
        refreshTimeoutId: null
      };
      return updated;
    });
  }
};

