import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

import PropTypes from 'prop-types';
import urls from '../../config/urls';
import { getCustomDimensions } from '../../utils/imageProcessing';
import { useApp } from '../../context/AppContext.tsx';
import { themeConfigService } from '../../services/themeConfig';
import { useSogniAuth } from '../../services/sogniAuth';
import { useWallet } from '../../hooks/useWallet';
import { useCostEstimation } from '../../hooks/useCostEstimation.ts';
import { getTokenLabel } from '../../services/walletService';
import { styleIdToDisplay } from '../../utils';
import { generateGalleryFilename, getPortraitFolderWithFallback } from '../../utils/galleryLoader';
import promptsDataRaw from '../../prompts.json';
import StyleDropdown from './StyleDropdown';
import '../../styles/components/ImageAdjuster.css';

/**
 * A component that allows users to adjust the size and position of an uploaded image
 * within the desired aspect ratio frame before processing
 */
const ImageAdjuster = ({ 
  imageUrl,
  onConfirm,
  onCancel,
  initialPosition = { x: 0, y: 0 },
  defaultScale = 1,
  numImages = 1,
  stylePrompts = {},
  headerText = 'Adjust Your Image',
  onUploadNew = null,
  onNavigateToVibeExplorer = null,
  photoSource = 'upload', // 'camera' or 'upload'
  onTakeNewPhoto = null,
  isCameraActive = false // Whether camera is currently running in the background
}) => {
  // Guard against invalid props that could cause render crashes
  if (!imageUrl) {
    console.error('[IMAGE_ADJUSTER] CRITICAL: imageUrl is missing!');
    return null;
  }

  
  const { settings, updateSetting, switchToModel } = useApp();
  const { aspectRatio, tezdevTheme, selectedModel, inferenceSteps, promptGuidance, scheduler, numImages: contextNumImages, selectedStyle, portraitType } = settings;
  const { isAuthenticated } = useSogniAuth();
  const { tokenType } = useWallet();
  const tokenLabel = getTokenLabel(tokenType);
  
  // Style dropdown state
  const [showStyleDropdown, setShowStyleDropdown] = useState(false);
  
  // Generate preview image path for selected style
  const stylePreviewImage = useMemo(() => {
    // Check if it's an individual style (not a prompt sampler mode)
    const isIndividualStyle = selectedStyle && 
      !['custom', 'random', 'randomMix', 'oneOfEach', 'browseGallery', 'copyImageStyle'].includes(selectedStyle);
    
    if (isIndividualStyle) {
      try {
        const expectedFilename = generateGalleryFilename(selectedStyle);
        const folder = getPortraitFolderWithFallback(portraitType, selectedStyle, promptsDataRaw);
        return `${urls.assetUrl}/gallery/prompts/${folder}/${expectedFilename}`;
      } catch (error) {
        console.warn('Error generating style preview image:', error);
        return null;
      }
    }
    
    return null;
  }, [selectedStyle, portraitType]);
  
  // Batch count selection state
  const batchOptions = [1, 2, 4, 8, 16];
  const [selectedBatchCount, setSelectedBatchCount] = useState(numImages || contextNumImages);
  const [isBatchDropdownOpen, setIsBatchDropdownOpen] = useState(false);

  // Estimate cost for this generation
  // ImageAdjuster uses InstantID ControlNet, not Flux Kontext
  const { loading: costLoading, cost, costInUSD } = useCostEstimation({
    model: selectedModel,
    imageCount: selectedBatchCount,
    stepCount: inferenceSteps,
    guidance: promptGuidance,
    scheduler: scheduler,
    network: 'fast',
    previewCount: 10,
    contextImages: 0, // Not using Flux Kontext reference images
    cnEnabled: true // Using InstantID ControlNet
  });
  
  
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  const dropdownRef = useRef(null);
  
  // Track image position and scale - initialize directly with props
  const [position, setPosition] = useState(initialPosition);
  const [scale, setScale] = useState(defaultScale);
  
  // Track processing state to prevent unmounting during async operations
  const [isProcessing, setIsProcessing] = useState(false);

  // Update position and scale when props change (for restoration)
  useEffect(() => {

    setPosition(initialPosition);
    setScale(defaultScale);
    // Update slider DOM value directly without triggering re-render
    if (sliderRef.current) {
      sliderRef.current.value = defaultScale;
    }
  }, [initialPosition.x, initialPosition.y, defaultScale]);

  // Reset imageLoaded when imageUrl changes (new image uploaded/selected)
  // Also check if image is already loaded (cached images may load instantly)
  useEffect(() => {
    console.log('[IMAGE_ADJUSTER] ========== IMAGE URL CHANGED ==========');
    console.log('[IMAGE_ADJUSTER] New imageUrl:', imageUrl?.substring(0, 50) + '...');
    console.log('[IMAGE_ADJUSTER] Timestamp:', new Date().toISOString());
    setImageLoaded(false);
    
    // Check if image is already loaded (cached images may load instantly)
    // Use multiple checks with increasing delays to catch both cached and loading images
    let checkCount = 0;
    const maxChecks = 50; // Check for up to 5 seconds (50 * 100ms)
    let timeoutId = null;
    let isCleanedUp = false;
    
    const checkImageLoaded = () => {
      if (isCleanedUp) return;
      
      checkCount++;
      if (imageRef.current) {
        const img = imageRef.current;
        // Check if image is complete and has valid dimensions
        // Don't check src match as blob URLs might be different objects
        if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
          setImageLoaded(true);
          return; // Stop checking
        }
      }
      
      // Continue checking if not loaded yet and haven't exceeded max checks
      if (checkCount < maxChecks) {
        timeoutId = setTimeout(checkImageLoaded, 100);
      } else {
        // After max checks, if image still not loaded, show it anyway to prevent stuck state
        // This handles edge cases where onLoad never fires
        // Show the image anyway - better to show a potentially broken image than stuck loading state
        if (imageRef.current) {
          setImageLoaded(true);
        }
      }
    };
    
    // Start checking after a short delay to allow DOM to update
    timeoutId = setTimeout(checkImageLoaded, 50);
    
    // Cleanup function to cancel pending checks
    return () => {
      isCleanedUp = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [imageUrl]);

  // Load theme frame URLs and padding when theme or aspect ratio changes
  useEffect(() => {
    const loadThemeFrames = async () => {
      if (tezdevTheme !== 'off') {
        try {
          const urls = await themeConfigService.getFrameUrls(tezdevTheme, aspectRatio);
          const padding = await themeConfigService.getFramePadding(tezdevTheme);
          setFrameUrls(urls);
          setFramePadding(padding);
        } catch (error) {
          console.warn('Could not load theme frame URLs:', error);
          setFrameUrls([]);
          setFramePadding({ top: 0, left: 0, right: 0, bottom: 0 });
        }
      } else {
        setFrameUrls([]);
        setFramePadding({ top: 0, left: 0, right: 0, bottom: 0 });
      }
    };

    loadThemeFrames();
  }, [tezdevTheme, aspectRatio]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  
  // For dynamic theme frame URLs
  const [frameUrls, setFrameUrls] = useState([]);
  const [framePadding, setFramePadding] = useState({ top: 0, left: 0, right: 0, bottom: 0 });
  
  // For pinch zoom gesture
  const [isPinching, setIsPinching] = useState(false);
  const [initialDistance, setInitialDistance] = useState(null);
  const [initialScale, setInitialScale] = useState(1);
  
  // For responsive layout - use the selected aspect ratio from context
  const [dimensions, setDimensions] = useState(getCustomDimensions(aspectRatio));
  
  // Add state for container dimensions that fit the viewport
  const [containerStyle, setContainerStyle] = useState({
    width: 'auto',
    height: 'auto',
    aspectRatio: '1'
  });
  
  // Check if device has touch capability
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  
  // Scale throttling for performance optimization (position uses direct DOM updates)
  const lastScaleUpdate = useRef(0);
  const scaleUpdateThrottle = 100; // ~10fps for slider - less frequent updates needed
  
  // Ref to store the slider element for direct DOM manipulation
  const sliderRef = useRef(null);
  
  // Track if user is currently dragging the slider
  const [isSliderDragging, setIsSliderDragging] = useState(false);
  
  // Debounce timer for final state update
  const sliderDebounceTimer = useRef(null);
  
  // Debounce timer for position updates
  const positionDebounceTimer = useRef(null);
  
  // Check for touch device on component mount
  useEffect(() => {
    const checkTouchDevice = () => {
      return 'ontouchstart' in window || 
             navigator.maxTouchPoints > 0 || 
             navigator.msMaxTouchPoints > 0;
    };
    
    setIsTouchDevice(checkTouchDevice());
  }, []);
  
  // Combined effect to handle dimensions and container calculations
  useEffect(() => {

    
    // Update dimensions when aspectRatio changes
    const newDimensions = getCustomDimensions(aspectRatio);
    setDimensions(newDimensions);
    
    const calculateContainerDimensions = (currentDimensions = newDimensions) => {      
      // Get aspect ratio based on current dimensions (which come from selected aspectRatio)
      const currentAspectRatio = currentDimensions.width / currentDimensions.height;
      // Get viewport dimensions (accounting for padding/margins)
      const viewportWidth = window.innerWidth * 0.8; // 90% of viewport width
      const viewportHeight = window.innerHeight * 0.75; // 80% of viewport height to account for header/buttons
      
      let containerWidth, containerHeight;
      
      // Determine sizing based on aspect ratio dynamically
      const isPortraitLike = currentAspectRatio < 1;
      const isSquareLike = Math.abs(currentAspectRatio - 1) < 0.1;
      
      if (isPortraitLike) {
        // Portrait-like modes (ultranarrow, narrow, portrait) - prioritize height
        containerHeight = Math.min(viewportHeight * 0.8, currentDimensions.height);
        containerWidth = containerHeight * currentAspectRatio;
        // Check if width exceeds viewport width
        if (containerWidth > viewportWidth) {
          containerWidth = viewportWidth;
          containerHeight = containerWidth / currentAspectRatio;
        }
      } 
      else if (isSquareLike) {
        // Square mode - try to fit within viewport
        const size = Math.min(viewportWidth, viewportHeight * 0.9);
        containerWidth = size;
        containerHeight = size;
      }
      else {
        // Landscape-like modes (landscape, wide, ultrawide) - prioritize width
        containerWidth = Math.min(viewportWidth, currentDimensions.width);
        containerHeight = containerWidth / currentAspectRatio;
      }
      
      // Final common constraints for all modes
      if (containerWidth > viewportWidth) {
        containerWidth = viewportWidth;
        containerHeight = containerWidth / currentAspectRatio;
      }
      
      if (containerHeight > viewportHeight * 0.75) {
        containerHeight = viewportHeight * 0.75;
        containerWidth = containerHeight * currentAspectRatio;
      }
      
      setContainerStyle({
        width: `${Math.round(containerWidth)}px`,
        height: `${Math.round(containerHeight)}px`,
        aspectRatio: `${currentDimensions.width}/${currentDimensions.height}`
      });
    };
    
    // Initial calculation with new dimensions
    calculateContainerDimensions(newDimensions);
    
    const handleResize = () => {
      calculateContainerDimensions(newDimensions);
    };
    
    // Set up resize listeners
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [aspectRatio]);
  
  // Keep slider value in sync with scale changes from other sources (pinch, etc.)
  useEffect(() => {
    // Only update slider DOM if not currently being dragged by user
    if (!isSliderDragging && sliderRef.current) {
      sliderRef.current.value = scale;
    }
  }, [scale, isSliderDragging]);
  
  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      if (sliderDebounceTimer.current) {
        clearTimeout(sliderDebounceTimer.current);
      }
      if (positionDebounceTimer.current) {
        clearTimeout(positionDebounceTimer.current);
      }
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsBatchDropdownOpen(false);
      }
    };

    if (isBatchDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isBatchDropdownOpen]);
  
  // Update position via DOM manipulation only (no React state updates during drag)
  const updatePositionDirect = useCallback((newPosition) => {
    // Apply position change immediately to image transform (visual only)
    if (imageRef.current) {
      imageRef.current.style.transform = `translate(${newPosition.x}px, ${newPosition.y}px) scale(${scale})`;
    }
    
    // Clear any existing debounce timer
    if (positionDebounceTimer.current) {
      clearTimeout(positionDebounceTimer.current);
    }
    
    // Debounce the actual state update
    positionDebounceTimer.current = setTimeout(() => {
      setPosition(newPosition);
    }, 150); // Wait 150ms after user stops dragging
  }, [scale]);

  const updateScaleThrottled = useCallback((newScale) => {
    const now = Date.now();
    if (now - lastScaleUpdate.current >= scaleUpdateThrottle) {
      // Use requestAnimationFrame for smooth visual updates
      requestAnimationFrame(() => {
        setScale(newScale);
      });
      lastScaleUpdate.current = now;
    }
  }, [scaleUpdateThrottle]);

  // Calculate distance between two touch points
  const getDistance = (touch1, touch2) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };
  
  // Handle image load
  const handleImageLoad = useCallback(() => {
    // Double-check that image is actually loaded before setting state
    if (imageRef.current && imageRef.current.complete && 
        imageRef.current.naturalWidth > 0 && imageRef.current.naturalHeight > 0) {
      setImageLoaded(true);
    } else {
      // Retry after a short delay in case dimensions aren't ready yet
      setTimeout(() => {
        if (imageRef.current && imageRef.current.complete && 
            imageRef.current.naturalWidth > 0 && imageRef.current.naturalHeight > 0) {
          setImageLoaded(true);
        }
      }, 100);
    }
    // Don't reset position - keep the initial position from props
  }, []);
  
  // Add document-level event listeners for mouse drag operations
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      const clientX = e.clientX;
      const clientY = e.clientY;
      
      // Calculate new position without any restrictions
      const newX = clientX - dragStart.x;
      const newY = clientY - dragStart.y;
      
      updatePositionDirect({ x: newX, y: newY });
    };
    
    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        
        // Ensure final position state is updated immediately
        if (positionDebounceTimer.current) {
          clearTimeout(positionDebounceTimer.current);
          // Get current position from transform and update state
          const currentTransform = imageRef.current?.style.transform || '';
          const translateMatch = currentTransform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
          if (translateMatch) {
            const finalPosition = {
              x: parseFloat(translateMatch[1]),
              y: parseFloat(translateMatch[2])
            };
            setPosition(finalPosition);
          }
        }
        
        // Check if image is completely off-screen after drag
        if (imageRef.current && containerRef.current) {
          const image = imageRef.current.getBoundingClientRect();
          const container = containerRef.current.getBoundingClientRect();
          
          // Check if image is completely outside the container
          const isCompletelyOffScreen = 
            image.right < container.left ||
            image.left > container.right ||
            image.bottom < container.top ||
            image.top > container.bottom;
          
          // Reset position if completely off-screen
          if (isCompletelyOffScreen) {
            setPosition({ x: 0, y: 0 });
          }
        }
      }
    };
    
    // Add document-level event listeners when dragging starts
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    // Clean up event listeners
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, updatePositionDirect]);
  
  // Handle mouse/touch down
  const handleDragStart = (e) => {
    if (e.type === 'touchstart') {
      // Handle pinch zoom with two fingers
      if (e.touches.length === 2) {
        e.preventDefault(); // Prevent browser's default pinch zoom
        setIsPinching(true);
        setInitialDistance(getDistance(e.touches[0], e.touches[1]));
        setInitialScale(scale);
        return;
      }
      
      // Handle drag with single finger
      const clientX = e.touches[0].clientX;
      const clientY = e.touches[0].clientY;
      
      setIsDragging(true);
      setDragStart({ 
        x: clientX - position.x, 
        y: clientY - position.y 
      });
    } else {
      // Handle mouse events
      const clientX = e.clientX;
      const clientY = e.clientY;
      e.preventDefault();
      
      setIsDragging(true);
      setDragStart({ 
        x: clientX - position.x, 
        y: clientY - position.y 
      });
    }
  };
  
  // Handle touch move - used only for touch events
  const handleDrag = (e) => {
    if (e.type === 'touchmove') {
      // Handle pinch gesture
      if (e.touches.length === 2 && isPinching) {
        e.preventDefault(); // Prevent browser's default behavior
        const currentDistance = getDistance(e.touches[0], e.touches[1]);
        const scaleFactor = currentDistance / initialDistance;
        
        // Calculate new scale value with limits
        const newScale = Math.min(Math.max(initialScale * scaleFactor, 0.25), 3);
        updateScaleThrottled(newScale);
        return;
      }
      
      // Handle single finger drag
      if (!isDragging) return;
      
      const clientX = e.touches[0].clientX;
      const clientY = e.touches[0].clientY;
      
      // Calculate new position without any restrictions
      const newX = clientX - dragStart.x;
      const newY = clientY - dragStart.y;
      
      updatePositionDirect({ x: newX, y: newY });
    }
    // Mouse move is now handled by the document-level event listener
  };
  
  // Handle touch end - used only for touch events
  const handleTouchEnd = () => {
    setIsDragging(false);
    setIsPinching(false);
    
    // Ensure final position state is updated immediately
    if (positionDebounceTimer.current) {
      clearTimeout(positionDebounceTimer.current);
      // Get current position from transform and update state
      const currentTransform = imageRef.current?.style.transform || '';
      const translateMatch = currentTransform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
      if (translateMatch) {
        const finalPosition = {
          x: parseFloat(translateMatch[1]),
          y: parseFloat(translateMatch[2])
        };
        setPosition(finalPosition);
      }
    }
    
    // Check if image is completely off-screen after drag
    if (imageRef.current && containerRef.current) {
      const image = imageRef.current.getBoundingClientRect();
      const container = containerRef.current.getBoundingClientRect();
      
      // Check if image is completely outside the container
      const isCompletelyOffScreen = 
        image.right < container.left ||
        image.left > container.right ||
        image.bottom < container.top ||
        image.top > container.bottom;
      
      // Reset position if completely off-screen
      if (isCompletelyOffScreen) {
        setPosition({ x: 0, y: 0 });
      }
    }
  };
  
  // Handle slider input events - no state updates during dragging
  const handleSliderInput = useCallback((e) => {
    const newScale = parseFloat(e.target.value);
    
    // Apply scale change immediately to image transform (visual only)
    if (imageRef.current) {
      imageRef.current.style.transform = `translate(${position.x}px, ${position.y}px) scale(${newScale})`;
    }
    
    // Clear any existing debounce timer
    if (sliderDebounceTimer.current) {
      clearTimeout(sliderDebounceTimer.current);
    }
    
    // Debounce the actual state update
    sliderDebounceTimer.current = setTimeout(() => {
      setScale(newScale);
    }, 150); // Wait 150ms after user stops dragging
  }, [position.x, position.y]);
  
  // Handle slider mouse/touch events for drag state tracking
  const handleSliderStart = useCallback(() => {
    setIsSliderDragging(true);
  }, []);
  
  const handleSliderEnd = useCallback(() => {
    setIsSliderDragging(false);
    // Ensure final state update happens
    if (sliderRef.current) {
      const finalScale = parseFloat(sliderRef.current.value);
      setScale(finalScale);
    }
  }, []);
  
  // Handle confirm button click
  const handleConfirm = useCallback(() => {
    if (!containerRef.current || !imageRef.current) {
      return;
    }
    
    // Prevent multiple clicks while processing
    if (isProcessing) {
      return;
    }
    
    // Check if image is loaded - critical for mobile to prevent crashes
    const image = imageRef.current;
    
    // Validate image dimensions - prevent division by zero or invalid calculations
    // This check must happen before any calculations to prevent React error #310
    if (!image.complete || !image.naturalWidth || !image.naturalHeight || 
        image.naturalWidth === 0 || image.naturalHeight === 0) {
      alert('Image is not ready yet. Please wait a moment for the image to fully load, then try again.');
      return;
    }
    
    // Set processing state to prevent unmounting
    setIsProcessing(true);
    
    const container = containerRef.current;
    
    // Create a canvas to render the adjusted image
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const ctx = canvas.getContext('2d');
    
    // Enable high-quality image resampling for best results when resizing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Fill with black background to ensure proper borders
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);
    
    // Calculate the image dimensions and fit it within the canvas maintaining aspect ratio (contain)
    const imageAspect = image.naturalWidth / image.naturalHeight;
    const canvasAspect = dimensions.width / dimensions.height;
    
    let drawWidth, drawHeight;
    
    if (imageAspect > canvasAspect) {
      // Image is wider than canvas relative to height
      drawWidth = dimensions.width;
      drawHeight = dimensions.width / imageAspect;
    } else {
      // Image is taller than canvas relative to width
      drawHeight = dimensions.height;
      drawWidth = dimensions.height * imageAspect;
    }
    
    // Calculate how user adjustments affect the drawing
    // Convert from screen coordinates to canvas coordinates
    const containerRect = container.getBoundingClientRect();
    const screenToCanvasX = dimensions.width / containerRect.width;
    const screenToCanvasY = dimensions.height / containerRect.height;
    
    // Apply the scale adjustment
    drawWidth *= scale;
    drawHeight *= scale;
    
    // Recalculate center offset after scaling
    const scaledOffsetX = (dimensions.width - drawWidth) / 2;
    const scaledOffsetY = (dimensions.height - drawHeight) / 2;
    
    // Apply position adjustments, converting from screen pixels to canvas pixels
    const adjustedX = scaledOffsetX + (position.x * screenToCanvasX);
    const adjustedY = scaledOffsetY + (position.y * screenToCanvasY);
    
    // Draw the image with all adjustments applied
    // Wrap in try-catch to catch any drawImage failures
    try {
      ctx.drawImage(
        image,
        adjustedX,
        adjustedY,
        drawWidth,
        drawHeight
      );
    } catch (drawError) {
      console.error('[IMAGE_ADJUSTER] CRITICAL: ctx.drawImage() failed:', drawError);
      console.error('[IMAGE_ADJUSTER] Image state at failure:', {
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        readyState: image.readyState,
        src: image.src?.substring(0, 50) + '...'
      });
      setIsProcessing(false);
      alert('Failed to process image. The image may not be fully loaded. Please try again.');
      return;
    }
    
    // Convert to PNG blob first with maximum quality to preserve details
    // Wrap in try-catch to catch synchronous errors
    try {
      canvas.toBlob(async (pngBlob) => {
        // Validate that blob was created successfully (can fail on mobile Safari)
        if (!pngBlob) {
          console.error('[IMAGE_ADJUSTER] ❌❌❌ CANVAS.TOBLOB() FAILED - BLOB IS NULL/UNDEFINED ❌❌❌');
          console.error('[IMAGE_ADJUSTER] This is the race condition! Image was not ready when toBlob was called.');
          console.error('[IMAGE_ADJUSTER] Image state at failure:', {
            complete: image.complete,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
            readyState: image.readyState,
            src: image.src?.substring(0, 50) + '...'
          });
          console.error('[IMAGE_ADJUSTER] Canvas state:', {
            width: canvas.width,
            height: canvas.height
          });
          setIsProcessing(false);
          alert('Failed to process image. This can happen on mobile with large images. Please try with a smaller zoom or take a new photo.');
          return;
        }

        console.log('[IMAGE_ADJUSTER] ✅ Canvas blob created successfully:', {
          size: pngBlob.size,
          type: pngBlob.type
        });

        // Convert PNG to high-quality JPEG for efficient upload
        let finalBlob;
        try {
          const { convertPngToHighQualityJpeg } = await import('../../utils/imageProcessing.js');
          // Don't add watermarks to adjusted images - they're used as placeholders
          // Watermarks should only be applied to final outputs (downloads, shares)
          finalBlob = await convertPngToHighQualityJpeg(pngBlob, 0.92, null);
          console.log(`📊 ImageAdjuster: JPEG format selected for upload (no watermark - used as placeholder)`);
        } catch (conversionError) {
          console.warn('ImageAdjuster: JPEG conversion failed, using PNG:', conversionError);
          finalBlob = pngBlob;
          console.log(`📊 ImageAdjuster: PNG format (fallback)`);
        }

        // Validate final blob before confirming
        if (!finalBlob) {
          console.error('❌ Final blob is null after conversion');
          setIsProcessing(false);
          alert('Failed to process image. Please try again.');
          return;
        }

        // Log final file size being transmitted
        const finalSizeMB = (finalBlob.size / 1024 / 1024).toFixed(2);
        console.log(`📤 ImageAdjuster transmission size: ${finalSizeMB}MB`);

        // ALWAYS call onConfirm with the blob - let the parent handle it
        // The parent (App.jsx) expects this callback and will handle cleanup
        // Don't check mounted state here - we want the operation to complete even if component unmounts
        try {
          onConfirm(finalBlob, { position, scale, batchCount: selectedBatchCount });
        } catch (confirmError) {
          console.error('[IMAGE_ADJUSTER] CRITICAL: onConfirm callback failed:', confirmError);
          setIsProcessing(false);
        }
      }, 'image/png', 1.0);
    } catch (toBlobError) {
      console.error('[IMAGE_ADJUSTER] CRITICAL: canvas.toBlob() threw synchronous error:', toBlobError);
      setIsProcessing(false);
      alert('Failed to process image. Please try again.');
    }
  }, [isProcessing, imageLoaded, dimensions, scale, position, selectedBatchCount, onConfirm]);
  
  
  return (
    <div className="image-adjuster-overlay">
      <div className="image-adjuster-wrapper">
        <div className="image-adjuster-container">
          {/* Pinned Style Widget - Top Left */}
          <button 
          className="image-adjuster-style-selector-button"
          onClick={() => setShowStyleDropdown(prev => !prev)}
          title="Your selected vibe - Click to change"
        >
          <div className="image-adjuster-style-selector-content">
            {stylePreviewImage ? (
              <img 
                src={stylePreviewImage} 
                alt={selectedStyle ? styleIdToDisplay(selectedStyle) : 'Style preview'}
                className="image-adjuster-style-preview-image"
                onError={(e) => {
                  // Fallback to emoji icon if image fails to load
                  e.currentTarget.style.display = 'none';
                  const fallbackIcon = e.currentTarget.nextElementSibling;
                  if (fallbackIcon && fallbackIcon.classList.contains('image-adjuster-style-icon-fallback')) {
                    fallbackIcon.style.display = 'block';
                  }
                }}
              />
            ) : null}
            <span className={`image-adjuster-style-icon ${stylePreviewImage ? 'image-adjuster-style-icon-fallback' : ''}`} style={stylePreviewImage ? { display: 'none' } : {}}>
              🎨
            </span>
            <div className="image-adjuster-style-info">
              <div className="image-adjuster-style-label">Selected vibe</div>
              <div className="image-adjuster-style-text">
                {selectedStyle === 'custom' ? 'Custom...' : selectedStyle ? styleIdToDisplay(selectedStyle) : 'Select Style'}
              </div>
            </div>
          </div>
        </button>
        
        {/* Close button in top right */}
        <button 
          className="image-adjuster-close-btn"
          onClick={onCancel}
          title="Close"
        >
          ×
        </button>
        
        <h2>{headerText}</h2>
        <p className="image-adjuster-subtitle">
          {headerText === 'Adjust Your Style Reference' 
            ? 'Crop and position your style reference image.' 
            : 'Smaller faces can give more room for creativity.'}
        </p>
        
        <div 
          className="image-frame"
          ref={containerRef}
          style={{
            ...containerStyle,
            maxWidth: '100%',
            maxHeight: '100%'
          }}
          onTouchMove={handleDrag}
          onTouchEnd={handleTouchEnd}
        >
          <div className="image-container">
            <img
              key={imageUrl} // Force re-render when URL changes to ensure onLoad fires
              ref={imageRef}
              src={imageUrl}
              alt="Adjust this image"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transformOrigin: 'center',
                cursor: isDragging ? 'grabbing' : 'grab',
                opacity: imageLoaded ? 1 : 0, // Hide until loaded
                transition: 'opacity 0.3s ease',
                // Use contain to show the full source image without clipping
                // This ensures the entire image is visible when resizing the widget
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                objectPosition: 'center'
              }}
              onLoad={() => {
                console.log('[IMAGE_ADJUSTER] <img> onLoad event fired');
                console.log('[IMAGE_ADJUSTER] Position:', position, 'Scale:', scale);
                console.log('[IMAGE_ADJUSTER] Frame padding:', framePadding);
                console.log('[IMAGE_ADJUSTER] Theme:', tezdevTheme);
                handleImageLoad();
              }}
              onError={(e) => {
                console.error('Image failed to load:', e);
                // Show image anyway after error to prevent stuck loading state
                // User will see broken image rather than infinite loading
                setTimeout(() => {
                  console.warn('Setting imageLoaded to true despite error to prevent stuck state');
                  setImageLoaded(true);
                }, 500);
              }}
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
              draggable="false"
            />
          </div>
          <div className="image-frame-overlay">
            {/* Dynamic Theme Frame Overlay */}
            {frameUrls.length > 0 && (
              <div
                className="dynamic-theme-frame-overlay"
                style={{
                  position: 'absolute',
                  top: '-1px',
                  left: '-1px',
                  height: 'calc(100% + 2px)',
                  width: 'calc(100% + 2px)',
                  backgroundImage: `url(${frameUrls[0]})`, // Use first frame for preview
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  pointerEvents: 'none',
                  zIndex: 2,
                  borderRadius: '0',
                  transform: 'translateZ(0)' // Force GPU acceleration for crisp rendering
                }}
              />
            )}
            
            {/* Default frame corners - only show when no theme is active */}
            {tezdevTheme === 'off' && (
              <>
                <div className="frame-corner top-left"></div>
                <div className="frame-corner top-right"></div>
                <div className="frame-corner bottom-left"></div>
                <div className="frame-corner bottom-right"></div>
              </>
            )}
            
          </div>

        </div>
        
        <div className="image-adjustment-controls">
          {!isTouchDevice && (
            <div className="zoom-control">
              <label htmlFor="zoom-slider">
                <span role="img" aria-label="zoom">🔍</span> Size:
              </label>
              <input
                ref={sliderRef}
                id="zoom-slider"
                type="range"
                min="0.10"
                max="3"
                step="0.01"
                defaultValue={scale}
                onInput={handleSliderInput}
                onMouseDown={handleSliderStart}
                onMouseUp={handleSliderEnd}
                onTouchStart={handleSliderStart}
                onTouchEnd={handleSliderEnd}
              />
            </div>
          )}
          <div className="instruction-text">
            {isTouchDevice ? 
              "Drag to position • Pinch to zoom" : 
              "Drag to position • Use slider to resize"}
          </div>
        </div>
        
        <div className="image-adjustment-buttons">
          {/* Replace/Swap image button - now in button bar */}
          {(onUploadNew || onTakeNewPhoto) && (
            <button
              className="swap-image-button"
              onClick={photoSource === 'camera' && onTakeNewPhoto ? onTakeNewPhoto : onUploadNew}
              title={photoSource === 'camera' ? (isCameraActive ? "Close and take new photo" : "Take a new photo") : "Upload a different image"}
            >
              {photoSource === 'camera' ? '📷' : '⬆️'}
              <span className="button-label">
                New
              </span>
            </button>
          )}

          <div className="batch-dropdown-container" ref={dropdownRef}>
            <button 
              className="confirm-button confirm-button-main" 
              onClick={handleConfirm}
              disabled={isProcessing || !imageLoaded}
              style={{
                ...(headerText === 'Adjust Your Style Reference' ? { borderRadius: '12px' } : {}),
                ...(isProcessing || !imageLoaded ? { opacity: 0.6, cursor: 'not-allowed' } : {})
              }}
            >
              {headerText === 'Adjust Your Style Reference' ? (
                'Continue'
              ) : (
                <div className="confirm-button-content">
                  <div className="confirm-button-label">
                    {isProcessing ? '⏳ Processing...' : !imageLoaded ? '⏳ Loading image...' : `Imagine ${selectedBatchCount}x`}
                  </div>
                  <div className="confirm-button-details">
                    {!isProcessing && isAuthenticated && !costLoading && cost !== null && (
                      <>
                        <span className="price-token">{cost.toFixed(2)} {tokenLabel.split(' ')[0]}</span>
                        {costInUSD !== null && (
                          <span className="price-usd">≈ ${(Math.round(costInUSD * 100) / 100).toFixed(2)}</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </button>
            {headerText !== 'Adjust Your Style Reference' && (
              <button
                className="confirm-button confirm-button-dropdown"
                onClick={() => setIsBatchDropdownOpen(!isBatchDropdownOpen)}
                disabled={isProcessing}
                aria-label="Select batch count"
                style={{
                  ...(isProcessing ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
                  borderLeft: '1px solid rgba(255, 255, 255, 0.15)'
                }}
              >
                <span className="dropdown-caret">▼</span>
              </button>
            )}
            {isBatchDropdownOpen && (
              <div className="batch-dropdown-menu">
                {batchOptions.map(count => (
                  <button
                    key={count}
                    className={`batch-dropdown-item ${count === selectedBatchCount ? 'selected' : ''}`}
                    onClick={() => {
                      console.log(`🔢 Batch count changed to ${count}`);
                      setSelectedBatchCount(count);
                      updateSetting('numImages', count); // Save to settings immediately
                      setIsBatchDropdownOpen(false);
                    }}
                  >
                    {count}x
                    {count === selectedBatchCount && <span className="checkmark">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Style Dropdown */}
        {showStyleDropdown && (
          <StyleDropdown
            isOpen={showStyleDropdown}
            onClose={() => setShowStyleDropdown(false)}
            selectedStyle={selectedStyle}
            updateStyle={(style) => updateSetting('selectedStyle', style)}
            defaultStylePrompts={stylePrompts}
            setShowControlOverlay={() => {}}
            dropdownPosition="top"
            triggerButtonClass=".image-adjuster-style-selector-button"
            selectedModel={selectedModel}
            onModelSelect={(model) => {
              console.log('ImageAdjuster: Switching model to', model);
              if (switchToModel) {
                switchToModel(model);
              }
            }}
            portraitType={portraitType}
            onNavigateToVibeExplorer={onNavigateToVibeExplorer}
            slideInPanel={true}
          />
        )}
        </div>
      </div>
    </div>
  );
};

ImageAdjuster.propTypes = {
  imageUrl: PropTypes.string.isRequired,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  initialPosition: PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number
  }),
  defaultScale: PropTypes.number,
  numImages: PropTypes.number,
  stylePrompts: PropTypes.object,
  headerText: PropTypes.string,
  onUploadNew: PropTypes.func,
  onNavigateToVibeExplorer: PropTypes.func,
  photoSource: PropTypes.oneOf(['camera', 'upload']),
  onTakeNewPhoto: PropTypes.func,
  isCameraActive: PropTypes.bool
};

export default ImageAdjuster; 