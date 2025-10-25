import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

import PropTypes from 'prop-types';
import { getCustomDimensions } from '../../utils/imageProcessing';
import { useApp } from '../../context/AppContext.tsx';
import { themeConfigService } from '../../services/themeConfig';
import { useSogniAuth } from '../../services/sogniAuth';
import { useWallet } from '../../hooks/useWallet';
import { useCostEstimation } from '../../hooks/useCostEstimation.ts';
import { getTokenLabel } from '../../services/walletService';
import { styleIdToDisplay } from '../../utils';
import { generateGalleryFilename } from '../../utils/galleryLoader';
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
  stylePrompts = {}
}) => {

  
  const { settings, updateSetting } = useApp();
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
      !['custom', 'random', 'randomMix', 'oneOfEach', 'browseGallery'].includes(selectedStyle);
    
    if (isIndividualStyle) {
      try {
        const expectedFilename = generateGalleryFilename(selectedStyle);
        return `/gallery/prompts/${portraitType || 'medium'}/${expectedFilename}`;
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
  const { loading: costLoading, formattedCost } = useCostEstimation({
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

  // Update position and scale when props change (for restoration)
  useEffect(() => {

    setPosition(initialPosition);
    setScale(defaultScale);
    // Update slider DOM value directly without triggering re-render
    if (sliderRef.current) {
      sliderRef.current.value = defaultScale;
    }
  }, [initialPosition.x, initialPosition.y, defaultScale]);

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
  const handleImageLoad = () => {
    setImageLoaded(true);
    // Don't reset position - keep the initial position from props
  };
  
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
  const handleConfirm = () => {
    if (!containerRef.current || !imageRef.current) return;
    
    const container = containerRef.current;
    const image = imageRef.current;
    
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
    ctx.drawImage(
      image,
      adjustedX,
      adjustedY,
      drawWidth,
      drawHeight
    );
    
    // Convert to PNG blob first with maximum quality to preserve details
    canvas.toBlob(async (pngBlob) => {
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

      // Log final file size being transmitted
      const finalSizeMB = (finalBlob.size / 1024 / 1024).toFixed(2);
      console.log(`📤 ImageAdjuster transmission size: ${finalSizeMB}MB`);

      onConfirm(finalBlob, { position, scale, batchCount: selectedBatchCount });
    }, 'image/png', 1.0);
  };
  
  
  return (
    <div className="image-adjuster-overlay">
      <div className="image-adjuster-container">
        {/* Pinned Style Widget - Top Left */}
        <div className="image-adjuster-style-pinned">
          <div 
            className="style-label-text"
            onClick={() => setShowStyleDropdown(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowStyleDropdown(true);
              }
            }}
          >
            Your selected vibe
          </div>
          <button 
            className="image-adjuster-style-selector-button"
            onClick={() => setShowStyleDropdown(true)}
            title="Change style"
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
              <span className="image-adjuster-style-text">
                {selectedStyle === 'custom' ? 'Custom...' : selectedStyle ? styleIdToDisplay(selectedStyle) : 'Select Style'}
              </span>
            </div>
          </button>
        </div>
        
        <h2>Adjust Your Image</h2>
        <p className="image-adjuster-subtitle">Smaller faces can give more room for creativity.</p>
        
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
              ref={imageRef}
              src={imageUrl}
              alt="Adjust this image"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transformOrigin: 'center',
                cursor: isDragging ? 'grabbing' : 'grab',
                opacity: imageLoaded ? 1 : 0, // Hide until loaded
                transition: 'opacity 0.3s ease',
                // Make image fill the container like the final result (object-fit: cover behavior)
                // This ensures the preview matches how the image will appear in the final framed result
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center'
              }}
              onLoad={() => {
                console.log('Image loaded with position:', position, 'scale:', scale);
                console.log('Frame padding for aethir2:', framePadding);
                console.log('Theme:', tezdevTheme);
                handleImageLoad();
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
                  borderRadius: '5px',
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
          <button 
            className="cancel-button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <div className="batch-dropdown-container" ref={dropdownRef}>
            <button 
              className="confirm-button confirm-button-main" 
              onClick={handleConfirm}
            >
              Imagine ({selectedBatchCount}x)
              {isAuthenticated && !costLoading && formattedCost && formattedCost !== '—' && (
                <span className="cost-estimate"> {formattedCost} {tokenLabel}</span>
              )}
            </button>
            <button
              className="confirm-button confirm-button-dropdown"
              onClick={() => setIsBatchDropdownOpen(!isBatchDropdownOpen)}
              aria-label="Select batch count"
            >
              <span className="dropdown-caret">▼</span>
            </button>
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
            portraitType={portraitType}
          />
        )}
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
  stylePrompts: PropTypes.object
};

export default ImageAdjuster; 