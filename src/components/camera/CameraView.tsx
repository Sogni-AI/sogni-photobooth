import React, { useEffect, useState } from 'react';
import styles from '../../styles/components/camera.module.css';
import AdvancedSettings from '../shared/AdvancedSettings';
import { useApp } from '../../context/AppContext';
import { getCustomDimensions } from '../../utils/imageProcessing';

interface CameraViewProps {
  /** Video ref for the webcam stream */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Whether the camera is ready to take photos */
  isReady: boolean;
  /** Current countdown value (0 means no countdown) */
  countdown: number;
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
  /** ControlNet strength value */
  controlNetStrength?: number;
  /** Handler for ControlNet strength change */
  onControlNetStrengthChange?: (value: number) => void;
  /** ControlNet guidance end value */
  controlNetGuidanceEnd?: number;
  /** Handler for ControlNet guidance end change */
  onControlNetGuidanceEndChange?: (value: number) => void;
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
}

export const CameraView: React.FC<CameraViewProps> = ({
  videoRef,
  isReady,
  countdown,
  isDisabled = false,
  buttonLabel = 'Take Photo',
  onTakePhoto,
  showPhotoGrid = false,
  selectedStyle = '',
  showSettings = false,
  onToggleSettings = () => {},
  testId,
  onToggleCamera,
  modelOptions = [],
  selectedModel = '',
  onModelSelect,
  numImages = 8,
  onNumImagesChange,
  promptGuidance = 2,
  onPromptGuidanceChange,
  controlNetStrength = 0.8,
  onControlNetStrengthChange,
  controlNetGuidanceEnd = 0.6,
  onControlNetGuidanceEndChange,
  flashEnabled = true,
  onFlashEnabledChange,
  keepOriginalPhoto = false,
  onKeepOriginalPhotoChange,
  onResetSettings,
  isFrontCamera = true,
}) => {
  // Get aspectRatio from context
  const { settings } = useApp();
  const aspectRatio = settings.aspectRatio;
  
  // Get dimensions based on selected aspect ratio
  const dimensions = getCustomDimensions(aspectRatio);
  
  // Check if device is mobile
  const [isMobile, setIsMobile] = useState(false);
  
  // Add state to track video loading
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  
  useEffect(() => {
    const checkIfMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as { opera?: string }).opera || '';
      return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(String(userAgent).toLowerCase());
    };
    setIsMobile(checkIfMobile());
  }, []);

  // Set the camera view dimensions based on the selected aspect ratio
  useEffect(() => {
    if (videoRef.current) {
      // Reset video loaded state when aspect ratio changes
      setIsVideoLoaded(false);
      
      // Get both the video container and the polaroid frame
      const videoContainer = videoRef.current.parentElement;
      const polaroidFrame = document.querySelector(`.${styles.polaroidFrame}`) as HTMLElement;
      
      if (videoContainer && polaroidFrame) {
        // Reset any previously set styles
        videoContainer.style.width = '';
        videoContainer.style.height = '';
        
        // Calculate appropriate dimensions based on the viewport
        const viewportWidth = window.innerWidth * 0.8;
        const viewportHeight = window.innerHeight * 0.7;
        let containerWidth = viewportWidth;
        let containerHeight: number = viewportHeight;
        
        // Apply the selected aspect ratio
        if (aspectRatio === 'portrait') {
          // Portrait mode: 896:1152
          const aspectRatioValue = 896 / 1152;
          // Calculate the ideal width for a portrait view
          containerWidth = Math.min(viewportHeight * aspectRatioValue, viewportWidth * 0.7);
          containerHeight = containerWidth / aspectRatioValue;
          
          // Adjust the polaroid frame width to match the content
          polaroidFrame.style.width = `${containerWidth + 64}px`; // Add border padding (32px each side)
          polaroidFrame.style.maxWidth = `${containerWidth + 64}px`;
          
          // Set portrait-specific dimensions
          videoContainer.style.width = `${containerWidth}px`;
          videoContainer.style.height = `${containerHeight}px`;
          
        } else if (aspectRatio === 'landscape') {
          // Landscape mode: 1152:896
          
          // For landscape, calculate dimensions based on aspect ratio
          containerWidth = Math.min(viewportWidth, 700); // Max width 700px
          
          // For landscape, set reasonable width
          polaroidFrame.style.width = '100%';
          polaroidFrame.style.maxWidth = 'min(98vw, 700px)';
          
          // For landscape mode, set width but use auto height
          videoContainer.style.width = `${containerWidth}px`;
          videoContainer.style.height = 'auto';
          
        } else if (aspectRatio === 'square') {
          // Square mode: 1024:1024
          containerWidth = Math.min(viewportWidth * 0.7, viewportHeight);
          containerHeight = containerWidth;
          
          // Adjust the polaroid frame width to match the square content
          polaroidFrame.style.width = `${containerWidth + 64}px`; // Add border padding
          polaroidFrame.style.maxWidth = `${containerWidth + 64}px`;
          
          // Set square-specific dimensions
          videoContainer.style.width = `${containerWidth}px`;
          videoContainer.style.height = `${containerHeight}px`;
        }
        
        // Only apply these general settings for non-landscape aspects
        if (aspectRatio !== 'landscape') {
          // Constrain height if needed
          const maxHeight = window.innerHeight * 0.7;
          if (containerHeight > maxHeight) {
            const ratio = maxHeight / containerHeight;
            containerHeight = maxHeight;
            containerWidth = containerWidth * ratio;
            
            videoContainer.style.width = `${containerWidth}px`;
            videoContainer.style.height = `${containerHeight}px`;
            
            // Adjust the polaroid frame width again if needed
            polaroidFrame.style.width = `${containerWidth + 64}px`;
            polaroidFrame.style.maxWidth = `${containerWidth + 64}px`;
          }
        }
      }
      
      // Force the video to refresh its dimensions
      if (videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject;
        videoRef.current.srcObject = null;
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        }, 50);
      }
    }
  }, [aspectRatio, videoRef, styles.polaroidFrame]);

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

  // Calculate the best object-fit for the video based on aspect ratio
  const [videoObjectFit, setVideoObjectFit] = useState<'cover' | 'contain'>('cover');
  
  useEffect(() => {
    const updateObjectFit = () => {
      if (videoRef.current && videoRef.current.videoWidth && videoRef.current.videoHeight) {
        const videoAspect = videoRef.current.videoWidth / videoRef.current.videoHeight;
        const targetAspect = dimensions.width / dimensions.height;
        
        // Use 'contain' if the aspects are very different to avoid extreme cropping
        if (Math.abs(videoAspect - targetAspect) > 0.3) {
          setVideoObjectFit('contain');
        } else {
          setVideoObjectFit('cover');
        }
      }
    };
    
    if (videoRef.current) {
      videoRef.current.addEventListener('loadedmetadata', updateObjectFit);
    }
    
    return () => {
      if (videoRef.current) {
        videoRef.current.removeEventListener('loadedmetadata', updateObjectFit);
      }
    };
  }, [videoRef, dimensions]);

  // Determine animation class based on video loading state and showPhotoGrid
  const getAnimationClass = () => {
    if (!isVideoLoaded) {
      // If video isn't loaded yet, hide the container completely
      return styles.loading;
    }
    return showPhotoGrid ? styles.slideOut : styles.slideIn;
  };

  const renderBottomControls = () => (
    <div className={styles.bottomControls}>
      {isMobile ? (
        <>
          {/* Camera flip button for mobile devices */}
          <button
            className={styles.cameraFlipButton}
            onClick={onToggleCamera}
            aria-label={isFrontCamera ? "Switch to back camera" : "Switch to front camera"}
            data-testid="camera-flip-button"
          >
            <span className={styles.cameraFlipIcon} role="img" aria-label="Flip camera">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 5H16.83L15 3H9L7.17 5H4C2.9 5 2 5.9 2 7V19C2 20.1 2.9 21 4 21H20C21.1 21 22 20.1 22 19V7C22 5.9 21.1 5 20 5ZM12 18C9.24 18 7 15.76 7 13C7 10.24 9.24 8 12 8C14.76 8 17 10.24 17 13C17 15.76 14.76 18 12 18Z" fill="#333333"/>
                <path d="M15 13L13 10V12H9V14H13V16L15 13Z" fill="#333333"/>
              </svg>
            </span>
          </button>
          
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
      className={`${styles.cameraContainer} ${getAnimationClass()}`}
      data-testid={testId || 'camera-container'}
    >
      <div className={styles.polaroidFrame}>
        {/* Title and settings in the polaroid top border */}
        <div className={styles.polaroidHeader}>
          <div className={styles.title}>
            SOGNI PHOTOBOOTH
          </div>
        </div>
        
        {/* Camera view with custom aspect ratio */}
        <div className={styles.cameraView}>
          <div 
            className={`${styles.cameraViewInner} ${aspectRatio === 'landscape' ? styles['aspect-landscape'] : aspectRatio === 'portrait' ? styles['aspect-portrait'] : styles['aspect-square']}`}
            id="camera-container"
            style={{
              // Apply direct aspect ratio for landscape mode
              aspectRatio: aspectRatio === 'landscape' ? '1152/896' : undefined
            }}
          >
            <video
              id="webcam"
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`${styles.webcam} ${aspectRatio === 'landscape' ? 'landscape-webcam' : ''}`}
              data-testid="webcam-video"
              style={{
                width: '100%',
                height: aspectRatio === 'landscape' ? 'auto' : '100%',
                objectFit: aspectRatio === 'landscape' ? 'contain' : videoObjectFit
              }}
            />
            
            {countdown > 0 && (
              <div className={styles.countdownOverlay} data-testid="countdown">
                {countdown}
              </div>
            )}
          </div>
        </div>

        {/* Bottom controls */}
        {renderBottomControls()}
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
        controlNetStrength={controlNetStrength}
        onControlNetStrengthChange={onControlNetStrengthChange}
        controlNetGuidanceEnd={controlNetGuidanceEnd}
        onControlNetGuidanceEndChange={onControlNetGuidanceEndChange}
        flashEnabled={flashEnabled}
        onFlashEnabledChange={onFlashEnabledChange}
        keepOriginalPhoto={keepOriginalPhoto}
        onKeepOriginalPhotoChange={onKeepOriginalPhotoChange}
        onResetSettings={onResetSettings}
      />
    </div>
  );
};

export default CameraView; 