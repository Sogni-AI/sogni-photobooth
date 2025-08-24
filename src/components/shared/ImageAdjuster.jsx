import React, { useState, useRef, useEffect, useCallback } from 'react';

import PropTypes from 'prop-types';
import { getCustomDimensions } from '../../utils/imageProcessing';
import { useApp } from '../../context/AppContext.tsx';
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
  defaultScale = 1
}) => {

  
  const { settings } = useApp();
  const { aspectRatio, tezdevTheme } = settings;
  
  // Calculate frame size based on aspect ratio
  // Use 75% for 1:1 or wider ratios, 100% for portrait ratios
  const getFrameSize = () => {
    const wideAspectRatios = ['square', 'landscape', 'wide', 'ultrawide'];
    return wideAspectRatios.includes(aspectRatio) ? '50%' : '100%';
  };
  
  const frameSize = getFrameSize();
  
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  
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
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  
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
        width: `${containerWidth}px`,
        height: `${containerHeight}px`,
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
  
  // Update position via DOM manipulation only (no React state updates during drag)
  const updatePositionDirect = useCallback((newPosition) => {
    // Apply position change immediately to image transform (visual only)
    if (imageRef.current) {
      imageRef.current.style.transform = `scale(${scale}) translate(${newPosition.x}px, ${newPosition.y}px)`;
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
      imageRef.current.style.transform = `scale(${newScale}) translate(${position.x}px, ${position.y}px)`;
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
        finalBlob = await convertPngToHighQualityJpeg(pngBlob);
        console.log(`📊 ImageAdjuster: JPEG format selected for upload`);
      } catch (conversionError) {
        console.warn('ImageAdjuster: JPEG conversion failed, using PNG:', conversionError);
        finalBlob = pngBlob;
        console.log(`📊 ImageAdjuster: PNG format (fallback)`);
      }

      // Log final file size being transmitted
      const finalSizeMB = (finalBlob.size / 1024 / 1024).toFixed(2);
      console.log(`📤 ImageAdjuster transmission size: ${finalSizeMB}MB`);

      onConfirm(finalBlob, { position, scale });
    }, 'image/png', 1.0);
  };
  
  
  return (
    <div className="image-adjuster-overlay">
      <div className="image-adjuster-container">
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
                transition: 'opacity 0.3s ease'
              }}
              onLoad={() => {
                console.log('Image loaded with position:', position, 'scale:', scale);
                handleImageLoad();
              }}
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
              draggable="false"
            />
          </div>
          <div className="image-frame-overlay">
            {/* GM Vietnam Frame Overlay */}
            {tezdevTheme === 'gmvietnam' && (
              <>
                {/* Top-Left Corner */}
                <div
                  className="gmvn-frame-corner gmvn-frame-top-left"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: frameSize,
                    height: frameSize,
                    backgroundImage: `url(/tezos/GMVN-FRAME-TL.png)`,
                    backgroundSize: 'contain',
                    backgroundPosition: 'top left',
                    backgroundRepeat: 'no-repeat',
                    pointerEvents: 'none',
                    zIndex: 2
                  }}
                />
                {/* Bottom-Left Corner */}
                <div
                  className="gmvn-frame-corner gmvn-frame-bottom-left"
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: frameSize,
                    height: frameSize,
                    backgroundImage: `url(/tezos/GMVN-FRAME-BL.png)`,
                    backgroundSize: 'contain',
                    backgroundPosition: 'bottom left',
                    backgroundRepeat: 'no-repeat',
                    pointerEvents: 'none',
                    zIndex: 2
                  }}
                />
              </>
            )}
            
            {/* Super Casual Full Frame Overlay - only for narrow (2:3) aspect ratio */}
            {tezdevTheme === 'supercasual' && aspectRatio === 'narrow' && (
              <div
                className="super-casual-frame-overlay"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  backgroundImage: `url(/events/super-casual.png)`,
                  backgroundSize: 'contain',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  pointerEvents: 'none',
                  zIndex: 2
                }}
              />
            )}
            
            {/* Tezos WebX Full Frame Overlay - only for narrow (2:3) aspect ratio */}
            {tezdevTheme === 'tezoswebx' && aspectRatio === 'narrow' && (
              <div
                className="tezos-webx-frame-overlay"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  backgroundImage: `url(/events/tz_webx.png)`,
                  backgroundSize: 'contain',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  pointerEvents: 'none',
                  zIndex: 2
                }}
              />
            )}
            
            {/* Default frame corners - only show when not using GMVN, Super Casual, or Tezos WebX themes */}
            {tezdevTheme !== 'gmvietnam' && tezdevTheme !== 'supercasual' && tezdevTheme !== 'tezoswebx' && (
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
          <button 
            className="confirm-button" 
            onClick={handleConfirm}
          >
            Confirm
          </button>
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
  defaultScale: PropTypes.number
};

export default ImageAdjuster; 