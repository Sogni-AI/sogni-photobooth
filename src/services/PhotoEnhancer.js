/**
 * Handles photo enhancement using Sogni API
 */

/**
 * Enhances a photo using Sogni API
 * 
 * @param {Object} options
 * @param {Object} options.photo - Current photo object
 * @param {number} options.photoIndex - Index of the photo in the photos array
 * @param {number} options.subIndex - Sub-index of the image within the photo
 * @param {number} options.width - Target width for enhancement
 * @param {number} options.height - Target height for enhancement
 * @param {Object} options.sogniClient - Sogni client instance
 * @param {(updater: (prev: any[]) => any[]) => void} options.setPhotos - React setState function for photos
 * @param {(projectId: string | null) => void} options.onSetActiveProject - Callback to set active project reference
 * @returns {Promise<void>}
 */
export const enhancePhoto = async (options) => {
  const {
    photo,
    photoIndex,
    subIndex,
    width,
    height,
    sogniClient,
    setPhotos,
    outputFormat,
    clearFrameCache,
    clearQrCode, // New option to clear QR codes when enhancement starts
    // onSetActiveProject - not used for enhancement to avoid interfering with main generation
    useKontext = false,
    customPrompt = ''
  } = options;

  // Input validation
  if (typeof photoIndex !== 'number' || photoIndex < 0) {
    console.error(`[ENHANCE] Invalid photoIndex: ${photoIndex}`);
    return;
  }
  
  if (!photo) {
    console.error(`[ENHANCE] No photo provided for enhancement at index ${photoIndex}`);
    return;
  }
  
  if (!setPhotos || typeof setPhotos !== 'function') {
    console.error(`[ENHANCE] Invalid setPhotos function provided`);
    return;
  }

  // CRITICAL: Check if photo is already enhancing to prevent duplicate calls
  if (photo.enhancing) {
    console.warn(`[ENHANCE] Photo #${photoIndex} is already enhancing, ignoring duplicate call`);
    return;
  }

  let timeoutId; // Declare timeoutId in outer scope

  try {
    console.log(`[ENHANCE] Photo state:`, {
      enhanced: photo.enhanced,
      hasOriginalEnhancedImage: !!photo.originalEnhancedImage,
      imagesLength: photo.images?.length,
      hasOriginalDataUrl: !!photo.originalDataUrl,
      enhancing: photo.enhancing
    });
    
    // Clear QR codes when enhancement starts since the image will change
    if (clearQrCode) {
      console.log(`[ENHANCE] Clearing QR code due to enhancement of photo #${photoIndex}`);
      clearQrCode();
    }
    
    // Choose the source image for enhancement.
    // IMPORTANT: When enhancing again without undo, we want to enhance the LATEST version (the currently enhanced image),
    // not the originally generated image. Priority:
    // 1) enhancedImageUrl if present (latest enhanced)
    // 2) current grid image at subIndex
    // 3) fallback to camera original
    const latestEnhanced = photo.enhanced ? photo.enhancedImageUrl : null; // Only prefer enhanced when it's the current view
    const currentGridImage = photo.images?.[subIndex];
    const imageUrl = latestEnhanced || currentGridImage || photo.originalDataUrl;
    console.log(`[ENHANCE] Using image URL: ${imageUrl?.substring(0, 100)}...`);
    console.log(`[ENHANCE] Image source priority: usingEnhanced=${!!latestEnhanced}, images[${subIndex}]=${!!currentGridImage}, originalDataUrl=${!!photo.originalDataUrl}`);
    
    if (!imageUrl) {
      throw new Error(`No image URL found for enhancement. Photo #${photoIndex}, subIndex: ${subIndex}`);
    }
    
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    const imageBlob = await response.blob();
    console.log(`[ENHANCE] Image blob size: ${imageBlob.size} bytes`);
    
    // Set loading state
    setPhotos(prev => {
      console.log(`[ENHANCE] Setting loading state for photo #${photoIndex}`);
      const updated = [...prev];
      
      // Check if the photo exists at the given index
      if (!updated[photoIndex]) {
        console.error(`[ENHANCE] Photo at index ${photoIndex} does not exist`);
        return prev; // Return unchanged if photo doesn't exist
      }
      
      // Persist the very first generated/original image ONCE so Undo can return to it reliably.
      let originalImage = null;
      if (!updated[photoIndex].originalEnhancedImage) {
        originalImage = updated[photoIndex].images?.[subIndex] || updated[photoIndex].originalDataUrl;
        console.log(`[ENHANCE] Capturing original baseline for undo: ${originalImage?.substring(0, 100)}...`);
      }

      updated[photoIndex] = {
        ...updated[photoIndex],
        loading: true,
        enhancing: true,
        progress: 0,
        enhancementProgress: 0,
        error: null, // Clear any previous errors
        enhancementError: null, // Clear any previous enhancement errors
        originalEnhancedImage: originalImage || updated[photoIndex].originalEnhancedImage, // Store original for undo
        enhanceTimeoutId: null, // Will be set after timeout is created
        currentEnhancementJobId: null, // Will be set when we get the job ID
      };
      return updated;
    });

    // Set a timeout fallback to reset enhancing state if something goes wrong
    timeoutId = setTimeout(() => {
      console.warn(`[ENHANCE] Enhancement timeout reached for photo #${photoIndex}, resetting state`);
      setPhotos(prev => {
        const updated = [...prev];
        const current = updated[photoIndex];
        if (!current) return prev;
        // Ignore stale timers that don't match the active enhance timeout
        if (current.enhanceTimeoutId && current.enhanceTimeoutId !== timeoutId) {
          return prev;
        }
        // Only show timeout error if the photo is still enhancing (not undone)
        if (current.enhancing) {
          updated[photoIndex] = {
            ...current,
            loading: false,
            enhancing: false,
            error: 'ENHANCEMENT TIMEOUT',
            enhancementError: 'Enhancement timed out. Please try again.',
            enhanceTimeoutId: null
          };
        }
        return updated;
      });
    }, 120000); // 2 minute timeout
    
    // Store timeout ID in photo state for cleanup
    setPhotos(prev => {
      const updated = [...prev];
      if (updated[photoIndex]) {
        updated[photoIndex] = {
          ...updated[photoIndex],
          enhanceTimeoutId: timeoutId
        };
      }
      return updated;
    });
    
    // Start enhancement
    const arrayBuffer = await imageBlob.arrayBuffer();
    console.log(`[ENHANCE] Creating enhancement project with Sogni API`, { photoIndex, width, height, arrayBufferSize: arrayBuffer.byteLength });
    
    if (!sogniClient || !sogniClient.projects || !sogniClient.projects.create) {
      throw new Error('Sogni client is not properly initialized');
    }
    
    // Configure project parameters based on model type
    let projectConfig;
    
    if (useKontext) {
      // Use Flux.1 Kontext for custom modifications
      projectConfig = {
        testnet: false,
        tokenType: 'spark',
        modelId: "flux1-dev-kontext_fp8_scaled",
        positivePrompt: customPrompt || 'Enhance the image',
        sizePreset: 'custom',
        width,
        height,
        steps: 24,
        guidance: 5.5,
        numberOfImages: 1,
        outputFormat: outputFormat || 'jpg',
        sensitiveContentFilter: false,
        contextImages: [new Uint8Array(arrayBuffer)], // Kontext uses contextImages array
        sourceType: 'enhancement-kontext', // Track Kontext enhancements separately
      };
    } else {
      // Use Flux.1 Krea for standard enhancement
      projectConfig = {
        testnet: false,
        tokenType: 'spark',
        modelId: "flux1-krea-dev_fp8_scaled",
        positivePrompt: `(Extra detailed and contrasty portrait) ${photo.positivePrompt || 'Portrait masterpiece'}`,
        sizePreset: 'custom',
        width,
        height,
        steps: 24,
        guidance: 5.5,
        numberOfImages: 1,
        outputFormat: outputFormat || 'jpg',
        sensitiveContentFilter: false,
        startingImage: new Uint8Array(arrayBuffer),
        startingImageStrength: 0.75,
        sourceType: 'enhancement', // Add sourceType for backend tracking
      };
    }
    
    // Use the same API path as regular generation to get proper upload handling
    const project = await sogniClient.projects.create(projectConfig);
      
      // Wait for upload completion like regular generation does
      await new Promise((resolve) => {
        let uploadCompleted = false;
        
        const uploadCompleteHandler = () => {
          if (!uploadCompleted) {
            uploadCompleted = true;
            console.log(`[ENHANCE] Starting image upload completed, enhancement can proceed`);
            project.off('uploadComplete', uploadCompleteHandler);
            resolve();
          }
        };
        
        // Listen for upload completion
        project.on('uploadComplete', uploadCompleteHandler);
        
        // Fallback timeout in case upload complete event doesn't fire
        setTimeout(() => {
          if (!uploadCompleted) {
            uploadCompleted = true;
            console.log(`[ENHANCE] Upload timeout reached, proceeding with enhancement`);
            project.off('uploadComplete', uploadCompleteHandler);
            resolve();
          }
        }, 5000); // 5 second timeout
      });
      
      // Don't set activeProjectReference for enhancement to avoid interfering with main generation
      // onSetActiveProject(project.id); // Commented out to prevent interference
      console.log(`[ENHANCE] Enhancement project created with ID: ${project.id} (not setting as active to avoid interference)`);
      
      // Now update with project ID after creation
      setPhotos(prev => {
        const updated = [...prev];
        if (!updated[photoIndex]) return prev;
        
        updated[photoIndex] = {
          ...updated[photoIndex],
          projectId: project.id // Store the project ID for proper failure handling
        };
        return updated;
      });
      
      // Set up listeners for the backend proxy client - listen to job events like main generation
      project.on('job', (event) => {
        const { type, jobId, progress } = event;
        
        console.log(`[ENHANCE] Job event received:`, { type, jobId, progress, projectId: project.id });
        
        // Single state update for started events (store job ID)
        if (type === 'started' && jobId) {
          setPhotos(prev => {
            const current = prev[photoIndex];
            if (!current || !current.enhancing || current.currentEnhancementJobId) return prev;
            
            console.log(`[ENHANCE] Setting job ID for photo #${photoIndex}: ${jobId}`);
            const updated = [...prev];
            updated[photoIndex] = {
              ...current,
              currentEnhancementJobId: jobId
            };
            return updated;
          });
        }
        
        // Handle progress events
        if (type === 'progress' && progress !== undefined && jobId) {
          const progressValue = typeof progress === 'number' ? progress : 0;
          const progressPercent = Math.floor(progressValue * 100);
          console.log(`[ENHANCE] Job progress: ${progressPercent}%`);
          
          setPhotos(prev => {
            const current = prev[photoIndex];
            if (!current || !current.enhancing) return prev;
            
            // Only accept progress updates for the correct job ID
            if (current.currentEnhancementJobId && current.currentEnhancementJobId !== jobId) {
              return prev;
            }
            
            // Check if progress actually changed to avoid unnecessary updates
            if (current.enhancementProgress === progressValue) {
              return prev;
            }
            
            const updated = [...prev];
            updated[photoIndex] = {
              ...current,
              progress: progressValue,
              enhancementProgress: progressValue
            };
            return updated;
          });
        }
      });
      
      // Also listen to project-level progress events as fallback (when job ID is not available)
      project.on('progress', (progress) => {
        // Ensure progress is a number between 0-1
        const progressValue = typeof progress === 'number' ? progress : 
          (typeof progress === 'object' && progress.progress !== undefined) ? progress.progress : 0;
        
        const progressPercent = Math.floor(progressValue * 100);
        console.log(`[ENHANCE] Project progress: ${progressPercent}%`);
        
        setPhotos(prev => {
          const current = prev[photoIndex];
          if (!current || !current.enhancing) return prev;
          
          // Only use project-level progress if we don't have a job ID yet (fallback)
          if (current.currentEnhancementJobId) return prev;
          
          // Check if progress actually changed to avoid unnecessary updates
          if (current.enhancementProgress === progressValue) {
            return prev;
          }
          
          // Only accept project-level progress if project ID matches
          if (current.projectId && current.projectId !== project.id) {
            return prev;
          }
          
          const updated = [...prev];
          updated[photoIndex] = {
            ...current,
            progress: progressValue,
            enhancementProgress: progressValue
          };
          return updated;
        });
      });
      
      // Listen for jobCompleted event (not completed)
      project.on('jobCompleted', (job) => {
        console.log('Enhance jobCompleted full payload:', job);
        console.log(`[ENHANCE] Job completion check: job.id=${job.id}, photoIndex=${photoIndex}`);
        
        // Don't clear activeProjectReference since we didn't set it for enhancement
        // onSetActiveProject(null); // Commented out since we don't set it
        if (job.resultUrl) {
          // Clear timeout since enhancement is completing
          clearTimeout(timeoutId);
          
          // Preload the enhanced image to prevent pixelation during loading
          const preloadImage = new Image();
          preloadImage.onload = () => {
            console.log(`[ENHANCE] Enhanced image preloaded successfully: ${job.resultUrl.substring(0, 100)}...`);
            
            // Clear frame cache for this photo since the image has changed
            if (clearFrameCache) {
              clearFrameCache(photoIndex);
            }
            
            setPhotos(prev => {
              const current = prev[photoIndex];
              if (!current) return prev;
              
              // Check if this completion is for the current enhancement job
              if (current.currentEnhancementJobId && current.currentEnhancementJobId !== job.id) {
                console.log(`[ENHANCE] Ignoring completion - wrong job ID (current: ${current.currentEnhancementJobId}, event: ${job.id})`);
                return prev;
              }
              
              // Prevent duplicate completion updates
              if (!current.enhancing) {
                console.log(`[ENHANCE] Ignoring completion - photo is not enhancing anymore`);
                return prev;
              }
              
              const updated = [...prev];
              const updatedImages = [...current.images];
              const indexToReplace = subIndex < updatedImages.length ? subIndex : updatedImages.length - 1;
              if (indexToReplace >= 0) {
                updatedImages[indexToReplace] = job.resultUrl;
              } else {
                updatedImages.push(job.resultUrl);
              }
              updated[photoIndex] = {
                ...current,
                loading: false,
                enhancing: false,
                images: updatedImages,
                newlyArrived: true,
                enhanced: true,
                enhancementProgress: 1,
                enhancementError: null,
                enhancedImageUrl: job.resultUrl, // Store enhanced image URL for redo functionality
                canRedo: false, // Reset redo state when new enhancement completes
                enhanceTimeoutId: null, // Clear timeout ID since enhancement completed successfully
                currentEnhancementJobId: null // Clear job ID since enhancement is complete
              };
              return updated;
            });
          };
          
          preloadImage.onerror = () => {
            console.error(`[ENHANCE] Failed to preload enhanced image: ${job.resultUrl}`);
            // Still update the state even if preload fails
            if (clearFrameCache) {
              clearFrameCache(photoIndex);
            }
            
            setPhotos(prev => {
              const current = prev[photoIndex];
              if (!current) return prev;
              
              // Ignore completion from stale projects
              if (current.projectId && current.projectId !== project.id) return prev;
              
              // Prevent duplicate completion updates
              if (!current.enhancing) return prev;
              
              const updated = [...prev];
              const updatedImages = [...current.images];
              const indexToReplace = subIndex < updatedImages.length ? subIndex : updatedImages.length - 1;
              if (indexToReplace >= 0) {
                updatedImages[indexToReplace] = job.resultUrl;
              } else {
                updatedImages.push(job.resultUrl);
              }
              updated[photoIndex] = {
                ...current,
                loading: false,
                enhancing: false,
                images: updatedImages,
                newlyArrived: true,
                enhanced: true,
                enhancementProgress: 1,
                enhancementError: null,
                enhancedImageUrl: job.resultUrl, // Store enhanced image URL for redo functionality
                canRedo: false, // Reset redo state when new enhancement completes
                enhanceTimeoutId: null, // Clear timeout ID since enhancement completed successfully
                currentEnhancementJobId: null // Clear job ID since enhancement is complete
              };
              return updated;
            });
          };
          
          // Start preloading the image
          preloadImage.src = job.resultUrl;
        } else {
          // Clear timeout since enhancement is completing (even with error)
          clearTimeout(timeoutId);
          
          setPhotos(prev => {
            const current = prev[photoIndex];
            if (!current) return prev;
            
            // Ignore completion from stale projects
            if (current.projectId && current.projectId !== project.id) return prev;
            
            // Prevent duplicate error updates
            if (!current.enhancing) return prev;
            
            const updated = [...prev];
            updated[photoIndex] = {
              ...current,
              loading: false,
              enhancing: false,
              error: 'No enhanced image generated',
              enhanceTimeoutId: null
            };
            return updated;
          });
        }
      });

      // Listen for jobFailed event (not failed)
      project.on('jobFailed', (job) => {
        console.error('Enhance jobFailed full payload:', job);
        // Clear timeout since enhancement is failing
        clearTimeout(timeoutId);
        // Don't clear activeProjectReference since we didn't set it for enhancement
        // onSetActiveProject(null); // Commented out since we don't set it
        setPhotos(prev => {
          const current = prev[photoIndex];
          if (!current) return prev;
          
          // Ignore failures from stale projects
          if (current.projectId && current.projectId !== project.id) return prev;
          
          // Prevent duplicate failure updates
          if (!current.enhancing) return prev;
          
          const updated = [...prev];
          updated[photoIndex] = {
            ...current,
            loading: false,
            enhancing: false,
            error: 'ENHANCEMENT FAILED',
            enhancementError: 'Enhancement failed during processing. Please try again.',
            enhanceTimeoutId: null
          };
          return updated;
        });
      });
      
  } catch (error) {
    console.error(`[ENHANCE] Error enhancing image:`, error);
    // Clear timeout since enhancement is failing
    clearTimeout(timeoutId);
    
    setPhotos(prev => {
      const updated = [...prev];
      if (!updated[photoIndex]) return prev;
      
      updated[photoIndex] = {
        ...updated[photoIndex],
        loading: false,
        enhancing: false,
        error: error?.message && error.message.includes('Insufficient') ? 'INSUFFICIENT TOKENS' : 'ENHANCEMENT FAILED',
        enhancementError: error?.message && error.message.includes('Insufficient') ? 'Insufficient tokens. Please replenish your account.' : `Enhancement failed: ${error?.message || 'Unknown error'}`
      };
      return updated;
    });
    
    // Error message is now displayed inline in the UI instead of alert
  }
};

/**
 * Undoes enhancement by restoring the original image
 * 
 * @param {Object} options
 * @param {number} options.photoIndex - Index of the photo in the photos array
 * @param {number} options.subIndex - Sub-index of the image within the photo
 * @param {(updater: (prev: any[]) => any[]) => void} options.setPhotos - React setState function for photos
 * @returns {void}
 */
export const undoEnhancement = ({ photoIndex, subIndex, setPhotos, clearFrameCache }) => {
  console.log(`[ENHANCE] ✅ STARTED undo operation for photo #${photoIndex}`);
  
  console.log(`[ENHANCE] Undoing enhancement for photo #${photoIndex}`);
  
  // Clear frame cache for this photo since the image is changing back
  if (clearFrameCache) {
    clearFrameCache(photoIndex);
  }

  // Single state update: clear timeout and apply undo atomically
  setPhotos(prev => {
    const updated = [...prev];
    const photo = updated[photoIndex];
    
    if (!photo) return prev;

    // Idempotence guard: if already undone for this sub-index, do nothing
    const idxForCheck = subIndex < (photo.images?.length || 0) ? subIndex : (photo.images?.length || 1) - 1;
    if (!photo.enhanced && idxForCheck >= 0 && photo.images && photo.originalEnhancedImage && photo.images[idxForCheck] === photo.originalEnhancedImage) {
      return prev;
    }

    // Clear any pending enhancement timeout to prevent false timeout errors
    if (photo.enhanceTimeoutId) {
      try {
        clearTimeout(photo.enhanceTimeoutId);
      } catch (e) { /* no-op */ }
    }

    // Restore the original image if we have it
    if (photo.originalEnhancedImage) {
      console.log(`[ENHANCE] Restoring original image: ${photo.originalEnhancedImage.substring(0, 100)}...`);
      const updatedImages = [...photo.images];
      console.log(`[ENHANCE] Current enhanced image being replaced: ${updatedImages[subIndex]?.substring(0, 100)}...`);
      
      // Make sure we have a valid subIndex
      const indexToRestore = subIndex < updatedImages.length 
        ? subIndex 
        : updatedImages.length - 1;
      
      // If image is already original at target index, no-op
      if (indexToRestore >= 0 && updatedImages[indexToRestore] === photo.originalEnhancedImage) {
        return prev;
      }

      // Store the enhanced image URL for redo functionality BEFORE restoring
      // Prioritize existing enhancedImageUrl, fallback to current image in array
      const enhancedImageUrl = photo.enhancedImageUrl || (indexToRestore >= 0 ? updatedImages[indexToRestore] : null);
      console.log(`[ENHANCE] Storing enhanced image URL for redo: ${enhancedImageUrl?.substring(0, 100)}...`);
      console.log(`[ENHANCE] Source: ${photo.enhancedImageUrl ? 'existing enhancedImageUrl' : 'current image in array'}`);
      
      if (indexToRestore >= 0) {
        updatedImages[indexToRestore] = photo.originalEnhancedImage;
        console.log(`[ENHANCE] Restored image at index ${indexToRestore}`);
      }
      
      updated[photoIndex] = {
        ...photo,
        enhanced: false,
        images: updatedImages,
        canRedo: true,
        enhancedImageUrl: enhancedImageUrl, // Store for redo
        enhancementError: null,
        enhanceTimeoutId: null
      };
    } else {
      // If we don't have the original, just remove the enhanced flag
      updated[photoIndex] = {
        ...photo,
        enhanced: false,
        canRedo: false,
        enhancementError: null,
        enhanceTimeoutId: null // Clear timeout ID when undoing
      };
    }

    return updated;
  });
};

/**
 * Redoes enhancement by restoring the previously enhanced image
 * 
 * @param {Object} options
 * @param {number} options.photoIndex - Index of the photo in the photos array
 * @param {number} options.subIndex - Sub-index of the image within the photo
 * @param {(updater: (prev: any[]) => any[]) => void} options.setPhotos - React setState function for photos
 * @returns {void}
 */
export const redoEnhancement = ({ photoIndex, subIndex, setPhotos, clearFrameCache }) => {
  console.log(`[ENHANCE] ✅ STARTED redo operation for photo #${photoIndex}`);
  
  console.log(`[ENHANCE] Redoing enhancement for photo #${photoIndex}`);
  
  // Clear frame cache for this photo since the image is changing
  if (clearFrameCache) {
    clearFrameCache(photoIndex);
  }
  
  setPhotos(prev => {
    const updated = [...prev];
    const photo = updated[photoIndex];
    
    if (!photo) return prev;

    // Restore the enhanced image if we have it
    console.log(`[ENHANCE] Redo check: enhancedImageUrl=${!!photo.enhancedImageUrl}, canRedo=${photo.canRedo}`);
    if (photo.enhancedImageUrl && photo.canRedo) {
      console.log(`[ENHANCE] Restoring enhanced image: ${photo.enhancedImageUrl.substring(0, 100)}...`);
      const updatedImages = [...photo.images];
      
      // Make sure we have a valid subIndex
      const indexToRestore = subIndex < updatedImages.length 
        ? subIndex 
        : updatedImages.length - 1;
      
      // Idempotence guard: if already enhanced at index, no-op
      if (indexToRestore >= 0 && updatedImages[indexToRestore] === photo.enhancedImageUrl) {
        return prev;
      }

      if (indexToRestore >= 0) {
        updatedImages[indexToRestore] = photo.enhancedImageUrl;
        console.log(`[ENHANCE] Restored enhanced image at index ${indexToRestore}`);
      }
      
      // Clear any pending enhancement timeout to prevent false timeout errors during redo
      if (photo.enhanceTimeoutId) {
        try {
          clearTimeout(photo.enhanceTimeoutId);
        } catch (e) { /* no-op */ }
      }

      const next = {
        ...photo,
        enhanced: true,
        images: updatedImages,
        canRedo: false, // Can't redo again until next undo
        enhancementError: null,
        enhanceTimeoutId: null
      };
      updated[photoIndex] = next;
      console.log('[ENHANCE] ✅ REDO applied state:', {
        enhanced: next.enhanced,
        canRedo: next.canRedo,
        imageAtIndex: updatedImages[indexToRestore]?.substring(0, 100),
        enhancedImageUrl: next.enhancedImageUrl?.substring(0, 100)
      });
    }
    return updated;
  });
}; 