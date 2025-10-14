import React, { useEffect, useRef, useState, useMemo } from 'react';
import styles from '../../styles/components/camera.module.css';
import AdvancedSettings from '../shared/AdvancedSettings';
import AspectRatioDropdown from '../shared/AspectRatioDropdown';
import { getCustomDimensions } from '../../utils/imageProcessing';
import { AspectRatioOption } from '../../types/index';
import { getModelDefaults } from '../../constants/settings';

interface CameraViewProps {
  /** Video ref for the webcam stream */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Whether the camera is ready to take photos */
  isReady: boolean;
  /** Whether the shutter button is disabled */
  isDisabled?: boolean;
  /** Label to show on the shutter button */
  buttonLabel?: string;
  /** Handler for when the shutter button is clicked */
  onTakePhoto: () => void;
  /** Whether to show the photo grid */
  showPhotoGrid?: boolean;
  /** Current style selection */
  selectedStyle?: string;
  /** Handler for style selection */
  onStyleSelect?: (style: string) => void;
  /** Whether the settings overlay is visible */
  showSettings?: boolean;
  /** Handler for toggling settings */
  onToggleSettings?: () => void;
  /** Optional test ID for testing */
  testId?: string;
  /** Handler for toggling between front and rear cameras */
  onToggleCamera?: () => void;
  /** Model options */
  modelOptions?: Array<{ label: string; value: string; }>;
  /** Selected model */
  selectedModel?: string;
  /** Handler for model selection */
  onModelSelect?: (model: string) => void;
  /** Number of images */
  numImages?: number;
  /** Handler for number of images change */
  onNumImagesChange?: (num: number) => void;
  /** Prompt guidance value */
  promptGuidance?: number;
  /** Handler for prompt guidance change */
  onPromptGuidanceChange?: (value: number) => void;
  /** Guidance value (Flux.1 Kontext specific) */
  guidance?: number;
  /** Handler for guidance change (Flux.1 Kontext specific) */
  onGuidanceChange?: (value: number) => void;
  /** ControlNet strength value */
  controlNetStrength?: number;
  /** Handler for ControlNet strength change */
  onControlNetStrengthChange?: (value: number) => void;
  /** ControlNet guidance end value */
  controlNetGuidanceEnd?: number;
  /** Handler for ControlNet guidance end change */
  onControlNetGuidanceEndChange?: (value: number) => void;
  /** Inference steps value */
  inferenceSteps?: number;
  /** Handler for inference steps change */
  onInferenceStepsChange?: (value: number) => void;
  /** Scheduler value */
  scheduler?: string;
  /** Handler for scheduler change */
  onSchedulerChange?: (value: string) => void;
  /** Time step spacing value */
  timeStepSpacing?: string;
  /** Handler for time step spacing change */
  onTimeStepSpacingChange?: (value: string) => void;
  /** Flash enabled state */
  flashEnabled?: boolean;
  /** Handler for flash enabled change */
  onFlashEnabledChange?: (enabled: boolean) => void;
  /** Keep original photo state */
  keepOriginalPhoto?: boolean;
  /** Handler for keep original photo change */
  onKeepOriginalPhotoChange?: (keep: boolean) => void;
  /** Handler for settings reset */
  onResetSettings?: () => void;
  /** Whether the front camera is active */
  isFrontCamera?: boolean;
  /** Handler for navigating back to main menu */
  onBackToMenu?: () => void;
  /** Current aspect ratio setting */
  aspectRatio?: AspectRatioOption;
  /** Whether iOS dimension quirk has been detected */
  iosQuirkDetected?: boolean;
  /** Actual camera dimensions when iOS quirk is detected */
  actualCameraDimensions?: { width: number; height: number } | null;
  /** Whether iOS quirk detection has completed */
  quirkDetectionComplete?: boolean;
  /** Last photo data for thumbnail display */
  lastPhotoData?: { blob?: Blob; dataUrl?: string; adjustments?: unknown } | null;
  /** Handler for when thumbnail is clicked */
  onThumbnailClick?: () => void;
  /** Style prompts data */
  stylePrompts?: unknown;
  /** Available camera devices */
  cameraDevices?: MediaDeviceInfo[];
  /** Selected camera device ID */
  selectedCameraDeviceId?: string;
  /** Handler for camera selection */
  onCameraSelect?: (deviceId: string) => void;
  /** TezDev theme setting */
  tezdevTheme?: unknown;
}

export const CameraView: React.FC<CameraViewProps> = (props) => {
  // Get model defaults for the current model
  const modelDefaults = getModelDefaults(props.selectedModel || '');

  const {
    videoRef,
    isReady,
    isDisabled = false,
    buttonLabel = 'Take Photo',
    onTakePhoto,
    showPhotoGrid = false,
    selectedStyle = '',
    showSettings = false,
    onToggleSettings = () => {},
    testId,
    modelOptions = [],
    selectedModel = '',
    onModelSelect,
    numImages = modelDefaults.numImages || 8,
    onNumImagesChange,
    promptGuidance = modelDefaults.promptGuidance || 2,
    onPromptGuidanceChange,
    guidance = modelDefaults.guidance || 3,
    onGuidanceChange,
    controlNetStrength = modelDefaults.controlNetStrength || 0.7,
    onControlNetStrengthChange,
    controlNetGuidanceEnd = modelDefaults.controlNetGuidanceEnd || 0.6,
    onControlNetGuidanceEndChange,
    inferenceSteps = modelDefaults.inferenceSteps || 7,
    onInferenceStepsChange,
    scheduler = modelDefaults.scheduler || 'DPM++ SDE',
    onSchedulerChange,
    timeStepSpacing = modelDefaults.timeStepSpacing || 'Karras',
    onTimeStepSpacingChange,
    flashEnabled = true,
    onFlashEnabledChange,
    keepOriginalPhoto = false,
    onKeepOriginalPhotoChange,
    onResetSettings,
    isFrontCamera = true,
    aspectRatio = 'square' as AspectRatioOption,
    iosQuirkDetected = false,
    actualCameraDimensions = null,
    quirkDetectionComplete = false,
    lastPhotoData = null,
    onThumbnailClick,
    // Camera device selection
    cameraDevices = [],
    selectedCameraDeviceId,
    onCameraSelect,
  } = props;


  // Use aspectRatio prop instead of context
  
  // Add state for responsive container sizing
  const [containerStyle, setContainerStyle] = useState({
    width: 'auto',
    height: 'auto',
    aspectRatio: '1'
  });
  
  // Memoize aspect ratio class calculation
  const aspectRatioClass = useMemo(() => {
    switch (aspectRatio) {
      case 'ultranarrow':
        return styles['aspect-ultranarrow'];
      case 'narrow':
        return styles['aspect-narrow'];
      case 'portrait':
        return styles['aspect-portrait'];
      case 'square':
        return styles['aspect-square'];
      case 'landscape':
        return styles['aspect-landscape'];
      case 'wide':
        return styles['aspect-wide'];
      case 'ultrawide':
        return styles['aspect-ultrawide'];
      default:
        return styles['aspect-square'];
    }
  }, [aspectRatio]);
  
  // Note: Removed getWebcamClass helper since we now use simple CSS masking
  
  // Check if device is mobile
  const [isMobile, setIsMobile] = useState(false);
  
  // Add state to track video loading
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  
  useEffect((): void => {
    const checkIfMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as { opera?: string }).opera || '';
      // Exclude iPad from mobile detection - treat it as desktop for camera picker UI
      return /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(String(userAgent).toLowerCase());
    };
    setIsMobile(checkIfMobile());
  }, []);

  // Calculate container dimensions that fit the viewport while maintaining aspect ratio
  useEffect(() => {
    // Only calculate container dimensions after quirk detection is complete
    if (!quirkDetectionComplete) {
      return;
    }

    const calculateContainerDimensions = () => {      
      // Always use the requested aspect ratio for container dimensions
      // CSS object-fit: cover will handle cropping from the actual camera feed
      const currentDimensions = getCustomDimensions(aspectRatio);
      const currentAspectRatio = currentDimensions.width / currentDimensions.height;
      
      // Note: iOS quirk handling is automatic via CSS object-fit: cover
      // Get viewport dimensions - use same approach as ImageAdjuster for consistent scaling
      const viewportWidth = window.innerWidth * 0.9; 
      const viewportHeight = window.innerHeight * 0.9; 
      
      let containerWidth, containerHeight;
      
      // Determine sizing based on aspect ratio dynamically
      const isPortraitLike = currentAspectRatio < 1;
      const isSquareLike = Math.abs(currentAspectRatio - 1) < 0.1;
      
      if (isPortraitLike) {
        // Portrait-like modes (ultranarrow, narrow, portrait) - prioritize height
        // Use ImageAdjuster approach: no hardcoded pixel limits, use actual dimensions
        containerHeight = Math.min(viewportHeight * 0.8, currentDimensions.height);
        containerWidth = containerHeight * currentAspectRatio;
        // Check if width exceeds viewport width
        if (containerWidth > viewportWidth) {
          containerWidth = viewportWidth;
          containerHeight = containerWidth / currentAspectRatio;
        }
      } 
      else if (isSquareLike) {
        // Square mode - try to fit within viewport (match ImageAdjuster)
        const size = Math.min(viewportWidth, viewportHeight * 0.9);
        containerWidth = size;
        containerHeight = size;
      }
      else {
        // Landscape-like modes (landscape, wide, ultrawide) - prioritize width
        containerWidth = Math.min(viewportWidth, currentDimensions.width);
        containerHeight = containerWidth / currentAspectRatio;
      }
      
      // Final common constraints for all modes - match ImageAdjuster exactly
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
    
    calculateContainerDimensions();
    
    // Recalculate on window resize
    window.addEventListener('resize', calculateContainerDimensions);
    
    return () => {
      window.removeEventListener('resize', calculateContainerDimensions);
    };
  }, [aspectRatio, iosQuirkDetected, actualCameraDimensions, quirkDetectionComplete]); // Add all quirk detection dependencies

  // Note: Removed complex video sizing logic since we now use simple CSS aspect ratio masking
  // The video container automatically handles the aspect ratio using CSS, video always stays at max resolution

  // Add effect to track video loading events
  useEffect(() => {
    const handleVideoLoadedMetadata = () => {
      console.log('Video metadata loaded, video is ready for display');
      setIsVideoLoaded(true);
    };

    if (videoRef.current) {
      videoRef.current.addEventListener('loadedmetadata', handleVideoLoadedMetadata);
      
      // If already loaded, set it now
      if (videoRef.current.videoWidth && videoRef.current.videoHeight) {
        handleVideoLoadedMetadata();
      }
    }

    return () => {
      if (videoRef.current) {
        videoRef.current.removeEventListener('loadedmetadata', handleVideoLoadedMetadata);
      }
    };
  }, [videoRef, aspectRatio]);

  // Note: Removed complex object-fit logic since we now use simple CSS masking
  // Video stays at max resolution and we just crop the display using container overflow

  // Memoize animation class calculation
  const animationClass = useMemo(() => {
    if (!isVideoLoaded) {
      // If video isn't loaded yet, hide the container completely
      return styles.loading;
    }
    return showPhotoGrid ? styles.slideOut : styles.slideIn;
  }, [isVideoLoaded, showPhotoGrid]);

  // Camera device menu state
  const [isDeviceMenuOpen, setIsDeviceMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ bottom: '64px', left: '50%', transform: 'translateX(-50%)' });
  const [clickedButton, setClickedButton] = useState<HTMLButtonElement | null>(null);
  const deviceMenuRef = useRef<HTMLDivElement | null>(null);

  // Close device menu on outside click or Escape
  useEffect(() => {
    if (!isDeviceMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (
        deviceMenuRef.current &&
        !deviceMenuRef.current.contains(target as Node) &&
        clickedButton &&
        !clickedButton.contains(target as Node)
      ) {
        setIsDeviceMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDeviceMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isDeviceMenuOpen, clickedButton]);

  const hasMultipleCameras = Array.isArray(cameraDevices) && cameraDevices.filter((d: MediaDeviceInfo) => d && d.kind === 'videoinput').length > 1;
  
  // Memoize expensive conditional calculations to prevent unnecessary re-renders
  const shouldShowDesktopButtonNextToThumbnail = useMemo(() => {
    return !isMobile && hasMultipleCameras && lastPhotoData && (lastPhotoData.blob || lastPhotoData.dataUrl) && onThumbnailClick;
  }, [isMobile, hasMultipleCameras, lastPhotoData, onThumbnailClick]);
  
  const shouldShowDesktopButtonNoThumbnail = useMemo(() => {
    return !isMobile && hasMultipleCameras && !(lastPhotoData && (lastPhotoData.blob || lastPhotoData.dataUrl) && onThumbnailClick);
  }, [isMobile, hasMultipleCameras, lastPhotoData, onThumbnailClick]);
  
  // Camera detection logic (debug logging removed to prevent console spam)

  const handleCameraButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    console.log('📱 Camera button clicked!', { hasMultipleCameras, isMobile });
    
    const button = event.currentTarget;
    setClickedButton(button);
    
    if (hasMultipleCameras) {
      console.log('🎯 Multiple cameras detected, processing click...');
      
      // Calculate menu position based on button position (desktop only)
      if (button && !isMobile) {
        console.log('🖥️ Desktop positioning logic starting...');
        const buttonRect = button.getBoundingClientRect();
        const containerElement = button.closest('.polaroidFrame');
        const containerRect = containerElement?.getBoundingClientRect();
        
        console.log('🔍 Element search results:', {
          hasButton: !!button,
          containerElement: !!containerElement,
          containerClass: containerElement?.className,
          hasContainerRect: !!containerRect
        });
        
        if (containerRect) {
          // Desktop positioning - center above the actual button that was clicked
          const relativeLeft = buttonRect.left - containerRect.left + (buttonRect.width / 2);
          // Calculate distance from container bottom to button top, then add gap
          const buttonTopFromContainerBottom = containerRect.bottom - buttonRect.top;
          const relativeBottom = buttonTopFromContainerBottom + buttonRect.height + 8; // 8px gap above button
          
          const newPosition = {
            bottom: `${relativeBottom}px`,
            left: `${relativeLeft}px`,
            transform: 'translateX(-50%)'
          };
          console.log('📍 Setting menu position:', newPosition);
          setMenuPosition(newPosition);
        } else {
          console.warn('⚠️ Could not find .polaroidFrame container for positioning');
        }
      }
      // Mobile uses CSS positioning, no need to calculate
      console.log('🔄 Toggling menu state from', isDeviceMenuOpen, 'to', !isDeviceMenuOpen);
      setIsDeviceMenuOpen((prev) => !prev);
      return;
    }
    // Fallback to simple toggle when only one camera is available
    if (props.onToggleCamera) props.onToggleCamera();
  };

  const handleSelectDevice = (deviceId: string) => {
    if (onCameraSelect) onCameraSelect(deviceId);
    setIsDeviceMenuOpen(false);
  };

  const renderBottomControls = () => (
    <div className={styles.bottomControls}>
      {isMobile ? (
        <>
          {/* Camera flip button for mobile devices - only show when thumbnail is NOT present */}
          {!(lastPhotoData && (lastPhotoData.blob || lastPhotoData.dataUrl) && onThumbnailClick) && (
            <button
              className={styles.cameraFlipButton}
              onClick={handleCameraButtonClick}
              aria-label={isFrontCamera ? "Switch to back camera" : "Switch to front camera"}
              data-testid="camera-flip-button"
            >
              <span className={styles.cameraFlipIcon} role="img" aria-label="Flip camera">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 5H16.83L15 3H9L7.17 5H4C2.9 5 2 5.9 2 7V19C2 20.1 2.9 21 4 21H20C21.1 21 22 20.1 22 19V7C22 5.9 21.1 5 20 5ZM12 18C9.24 18 7 15.76 7 13C7 10.24 9.24 8 12 8C14.76 8 17 10.24 17 13C17 15.76 14.76 18 12 18Z" fill="#333333"/>
                  <path d="M8 7l2 2M16 7l-2 2" stroke="#333333" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </span>
            </button>
          )}
          
          {/* Shutter button - no label on mobile */}
          <button
            className={`${styles.shutterButton} ${isDisabled ? styles.cooldown : ''}`}
            onClick={onTakePhoto}
            disabled={!isReady || isDisabled}
            data-testid="shutter-button"
          >
            <span className={styles.shutterDot} />
          </button>
          
          {/* Empty space to balance the layout */}
          <div style={{ width: '24px' }} />
        </>
      ) : (
        <>
          <div className={styles.endSpacer} />

          {/* Shutter button */}
          <button
            className={`${styles.shutterButton} ${isDisabled ? styles.cooldown : ''}`}
            onClick={onTakePhoto}
            disabled={!isReady || isDisabled}
            data-testid="shutter-button"
          >
            <span className={styles.shutterDot} />
            <span className={styles.shutterLabel}>{buttonLabel}</span>
          </button>

          <div className={styles.endSpacer} />
        </>
      )}
    </div>
  );

  return (
    <div 
      className={`${styles.cameraContainer} ${animationClass}`}
      data-testid={testId || 'camera-container'}
    >
      <div className={styles.polaroidFrame} style={{ position: 'relative' }}>
        {/* Title and settings in the polaroid top border */}
        <div className={styles.polaroidHeader}>
          <div className={styles.title}>
            SOGNI PHOTOBOOTH
          </div>
        </div>
        
        {/* Camera view with custom aspect ratio */}
        <div className={styles.cameraView}>
                  <div 
          className={`${styles.cameraViewInner} ${aspectRatioClass}`}
          id="camera-container"
          style={{
            // Use calculated responsive dimensions
            ...containerStyle,
            overflow: 'hidden', // Hide any parts of the video outside the aspect ratio
            position: 'relative',
            margin: '0 auto' // Center the container
          }}
        >
            <video
              id="webcam"
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={styles.webcam}
              data-testid="webcam-video"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover', // Always cover to maintain max resolution from the center
                position: 'absolute',
                top: 0,
                left: 0,
                zIndex: 1
              }}
            />
            

          </div>
        </div>

        {/* Bottom controls */}
        {renderBottomControls()}

        {/* Aspect Ratio Dropdown - positioned inside polaroid frame */}
        <AspectRatioDropdown 
          visible={!showSettings}
          position="bottom-right"
        />

        {/* Thumbnail button - positioned in bottom left corner, aligned with aspect ratio picker */}
        {lastPhotoData && (lastPhotoData.blob || lastPhotoData.dataUrl) && onThumbnailClick && (
          <button
            className={styles.thumbnailButtonCorner}
            onClick={onThumbnailClick}
            aria-label="Edit last photo"
            data-testid="thumbnail-button"
          >
            <img
              src={lastPhotoData.blob ? URL.createObjectURL(lastPhotoData.blob) : lastPhotoData.dataUrl}
              alt="Last photo thumbnail"
              className={styles.thumbnailImage}
            />
          </button>
        )}

        {/* Camera flip button - positioned next to thumbnail when present, or in original mobile location */}
        {isMobile && lastPhotoData && (lastPhotoData.blob || lastPhotoData.dataUrl) && onThumbnailClick && (
          <button
            className={`${styles.cameraFlipButton} ${styles.cameraFlipButtonWithThumbnail}`}
            onClick={handleCameraButtonClick}
            aria-label={isFrontCamera ? "Switch to back camera" : "Switch to front camera"}
            data-testid="camera-flip-button-corner"
          >
            <span className={styles.cameraFlipIcon} role="img" aria-label="Flip camera">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 5H16.83L15 3H9L7.17 5H4C2.9 5 2 5.9 2 7V19C2 20.1 2.9 21 4 21H20C21.1 21 22 20.1 22 19V7C22 5.9 21.1 5 20 5ZM12 18C9.24 18 7 15.76 7 13C7 10.24 9.24 8 12 8C14.76 8 17 10.24 17 13C17 15.76 14.76 18 12 18Z" fill="#333333"/>
                <path d="M8 7l2 2M16 7l-2 2" stroke="#333333" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </span>
          </button>
        )}

        {/* Desktop camera device button - positioned next to thumbnail */}
        {shouldShowDesktopButtonNextToThumbnail && (
          <button
            className={styles.cameraDeviceButtonNextToThumbnail}
            onClick={handleCameraButtonClick}
            aria-label="Select camera device"
            data-testid="camera-device-button-desktop"
          >
            <span className={styles.cameraFlipIcon} role="img" aria-label="Select camera">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 5H16.83L15 3H9L7.17 5H4C2.9 5 2 5.9 2 7V19C2 20.1 2.9 21 4 21H20C21.1 21 22 20.1 22 19V7C22 5.9 21.1 5 20 5ZM12 18C9.24 18 7 15.76 7 13C7 10.24 9.24 8 12 8C14.76 8 17 10.24 17 13C17 15.76 14.76 18 12 18Z" fill="#333333"/>
                <path d="M7 21h10" stroke="#333333" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </span>
          </button>
        )}

        {/* Desktop camera device button - positioned on right when no thumbnail */}
        {shouldShowDesktopButtonNoThumbnail && (
          <button
            className={styles.cameraDeviceButtonDesktop}
            onClick={handleCameraButtonClick}
            aria-label="Select camera device"
            data-testid="camera-device-button-desktop-no-thumb"
          >
            <span className={styles.cameraFlipIcon} role="img" aria-label="Select camera">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 5H16.83L15 3H9L7.17 5H4C2.9 5 2 5.9 2 7V19C2 20.1 2.9 21 4 21H20C21.1 21 22 20.1 22 19V7C22 5.9 21.1 5 20 5ZM12 18C9.24 18 7 15.76 7 13C7 10.24 9.24 8 12 8C14.76 8 17 10.24 17 13C17 15.76 14.76 18 12 18Z" fill="#333333"/>
                <path d="M7 21h10" stroke="#333333" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </span>
          </button>
        )}

        {/* Camera device dropdown menu */}
        {hasMultipleCameras && isDeviceMenuOpen && (
          <div 
            className={styles.cameraDeviceMenu} 
            ref={deviceMenuRef} 
            role="menu" 
            aria-label="Select camera"
            style={!isMobile ? menuPosition : undefined}
          >
            <div className={styles.cameraDeviceMenuHeader}>Choose Camera</div>
            <ul className={styles.cameraDeviceMenuList}>
              {cameraDevices.filter((d: MediaDeviceInfo) => d && d.kind === 'videoinput').map((device: MediaDeviceInfo, index: number) => {
                const isActive = device.deviceId === selectedCameraDeviceId;
                const label = device.label || `Camera ${index + 1}`;
                return (
                  <li key={device.deviceId || index}>
                    <button
                      className={`${styles.cameraDeviceMenuItem} ${isActive ? styles.cameraDeviceMenuItemActive : ''}`}
                      onClick={() => handleSelectDevice(device.deviceId)}
                      role="menuitemradio"
                      aria-checked={isActive}
                    >
                      <span className={styles.cameraDeviceMenuItemLabel}>{label}</span>
                      {isActive && <span className={styles.cameraDeviceMenuCheck} aria-hidden>✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Advanced Settings Overlay - Use the reusable component */}
      <AdvancedSettings 
        visible={showSettings || false}
        onClose={onToggleSettings || (() => {})}
        selectedStyle={selectedStyle}
        modelOptions={modelOptions}
        selectedModel={selectedModel}
        onModelSelect={onModelSelect}
        numImages={numImages}
        onNumImagesChange={onNumImagesChange}
        promptGuidance={promptGuidance}
        onPromptGuidanceChange={onPromptGuidanceChange}
        guidance={guidance}
        onGuidanceChange={onGuidanceChange}
        controlNetStrength={controlNetStrength}
        onControlNetStrengthChange={onControlNetStrengthChange}
        controlNetGuidanceEnd={controlNetGuidanceEnd}
        onControlNetGuidanceEndChange={onControlNetGuidanceEndChange}
        inferenceSteps={inferenceSteps}
        onInferenceStepsChange={onInferenceStepsChange}
        scheduler={scheduler}
        onSchedulerChange={onSchedulerChange}
        timeStepSpacing={timeStepSpacing}
        onTimeStepSpacingChange={onTimeStepSpacingChange}
        flashEnabled={flashEnabled}
        onFlashEnabledChange={onFlashEnabledChange}
        keepOriginalPhoto={keepOriginalPhoto}
        onKeepOriginalPhotoChange={onKeepOriginalPhotoChange}
        onResetSettings={onResetSettings}
        aspectRatio={aspectRatio}
      />
    </div>
  );
};

export default CameraView; 