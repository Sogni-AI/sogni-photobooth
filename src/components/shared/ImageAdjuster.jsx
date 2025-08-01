import React, { useState, useRef, useEffect } from 'react';
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
  onCancel
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
  
  // Track image position and scale
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
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
  
  // Check for touch device on component mount
  useEffect(() => {
    const checkTouchDevice = () => {
      return 'ontouchstart' in window || 
             navigator.maxTouchPoints > 0 || 
             navigator.msMaxTouchPoints > 0;
    };
    
    setIsTouchDevice(checkTouchDevice());
  }, []);
  
  // Calculate container dimensions that fit the viewport while maintaining aspect ratio
  useEffect(() => {
    const calculateContainerDimensions = () => {      
      // Get aspect ratio based on current dimensions (which come from selected aspectRatio)
      const currentAspectRatio = dimensions.width / dimensions.height;
      // Get viewport dimensions (accounting for padding/margins)
      const viewportWidth = window.innerWidth * 0.8; // 90% of viewport width
      const viewportHeight = window.innerHeight * 0.75; // 80% of viewport height to account for header/buttons
      
      let containerWidth, containerHeight;
      
      // Determine sizing based on aspect ratio dynamically
      const isPortraitLike = currentAspectRatio < 1;
      const isSquareLike = Math.abs(currentAspectRatio - 1) < 0.1;
      
      if (isPortraitLike) {
        // Portrait-like modes (ultranarrow, narrow, portrait) - prioritize height
        containerHeight = Math.min(viewportHeight * 0.8, dimensions.height);
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
        containerWidth = Math.min(viewportWidth, dimensions.width);
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
        aspectRatio: `${dimensions.width}/${dimensions.height}`
      });
    };
    
    calculateContainerDimensions();
    
    // Recalculate on window resize
    window.addEventListener('resize', calculateContainerDimensions);
    
    return () => {
      window.removeEventListener('resize', calculateContainerDimensions);
    };
  }, [dimensions, aspectRatio]); // Add aspectRatio as dependency
  
  // Handle window resize to update dimensions and orientation
  useEffect(() => {
    const handleResize = () => {
      const newDimensions = getCustomDimensions(aspectRatio);
      setDimensions(newDimensions);
    };
    
    // Initial setup with current aspectRatio
    handleResize();
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [aspectRatio]); // Re-run when aspectRatio changes
  
  // Calculate distance between two touch points
  const getDistance = (touch1, touch2) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };
  
  // Handle image load
  const handleImageLoad = () => {
    setImageLoaded(true);
    // Reset position to center when the image loads
    setPosition({ x: 0, y: 0 });
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
      
      setPosition({ x: newX, y: newY });
    };
    
    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        
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
  }, [isDragging, dragStart]);
  
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
        setScale(newScale);
        return;
      }
      
      // Handle single finger drag
      if (!isDragging) return;
      
      const clientX = e.touches[0].clientX;
      const clientY = e.touches[0].clientY;
      
      // Calculate new position without any restrictions
      const newX = clientX - dragStart.x;
      const newY = clientY - dragStart.y;
      
      setPosition({ x: newX, y: newY });
    }
    // Mouse move is now handled by the document-level event listener
  };
  
  // Handle touch end - used only for touch events
  const handleTouchEnd = () => {
    setIsDragging(false);
    setIsPinching(false);
    
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
  
  // Handle zoom level change via slider
  const handleZoomChange = (e) => {
    const newScale = parseFloat(e.target.value);
    setScale(newScale);
  };
  
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
    
    // Convert to blob using maximum quality (1.0) to preserve details for Sogni SDK
    canvas.toBlob((blob) => {
      onConfirm(blob);
    }, 'image/png', 1.0);
  };
  
  // Initialize image position to center
  useEffect(() => {
    if (imageRef.current) {
      setPosition({ x: 0, y: 0 });
      // Reset scale when loading a new image
      setScale(1);
    }
  }, [imageUrl]);
  
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
              onLoad={handleImageLoad}
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
            
            {/* Default frame corners - only show when not using GMVN theme */}
            {tezdevTheme !== 'gmvietnam' && (
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
                id="zoom-slider"
                type="range"
                min="0.10"
                max="3"
                step="0.01"
                value={scale}
                onChange={handleZoomChange}
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
  onCancel: PropTypes.func.isRequired
};

export default ImageAdjuster; 