import React, { useMemo, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import '../../styles/film-strip.css'; // Using film-strip.css which contains the gallery styles
import '../../styles/components/PhotoGallery.css';
import { createPolaroidImage } from '../../utils/imageProcessing';
import { getPhotoHashtag } from '../../services/TwitterShare';
import { downloadImageMobile, enableMobileImageDownload } from '../../utils/mobileDownload';
import { isMobile } from '../../utils/index';

const PhotoGallery = ({
  photos,
  selectedPhotoIndex,
  setSelectedPhotoIndex,
  showPhotoGrid,
  handleBackToCamera,
  handlePreviousPhoto,
  handleNextPhoto,
  handlePhotoViewerClick,
  handleGenerateMorePhotos,
  handleShowControlOverlay,
  isGenerating,
  keepOriginalPhoto,
  lastPhotoData,
  activeProjectReference,
  isSogniReady,
  toggleNotesModal,
  setPhotos,
  selectedStyle,
  stylePrompts,
  enhancePhoto,
  undoEnhancement,
  sogniClient,
  desiredWidth,
  desiredHeight,
  selectedSubIndex = 0,
  handleShareToX,
  slothicornAnimationEnabled,
  tezdevTheme = 'off',
  aspectRatio = null,
  handleRetryPhoto,
}) => {
  // Skip rendering if there are no photos or the grid is hidden
  if (photos.length === 0 || !showPhotoGrid) return null;
  
  // Calculate proper aspect ratio style based on the selected aspect ratio
  const getAspectRatioStyle = () => {
    let aspectRatioValue = '1/1'; // Default to square
    
    switch (aspectRatio) {
      case 'ultranarrow':
        aspectRatioValue = '768/1344';
        break;
      case 'narrow':
        aspectRatioValue = '832/1216';
        break;
      case 'portrait':
        aspectRatioValue = '896/1152';
        break;
      case 'square':
        aspectRatioValue = '1024/1024';
        break;
      case 'landscape':
        aspectRatioValue = '1152/896';
        break;
      case 'wide':
        aspectRatioValue = '1216/832';
        break;
      case 'ultrawide':
        aspectRatioValue = '1344/768';
        break;
      default:
        aspectRatioValue = '1024/1024';
        break;
    }
    
    return {
      width: '100%',
      aspectRatio: aspectRatioValue,
      margin: '0 auto',
      backgroundColor: 'white',
    };
  };
  
  const dynamicStyle = getAspectRatioStyle();
  
  // Calculate GMVN frame size based on aspect ratio
  // Use 50% for 1:1 or wider ratios, 100% for portrait ratios
  const getGMVNFrameSize = () => {
    const wideAspectRatios = ['square', 'landscape', 'wide', 'ultrawide'];
    return wideAspectRatios.includes(aspectRatio) ? '50%' : '100%';
  };
  
  const gmvnFrameSize = getGMVNFrameSize();
  
  const handlePhotoSelect = useCallback((index, e) => {
    const element = e.currentTarget;
    
    if (selectedPhotoIndex === index) {
      // Capture current position before removing selected state
      const first = element.getBoundingClientRect();
      setSelectedPhotoIndex(null);
      
      // Animate back to grid position
      requestAnimationFrame(() => {
        const last = element.getBoundingClientRect();
        const deltaX = first.left - last.left;
        const deltaY = first.top - last.top;
        const deltaScale = first.width / last.width;

        // Apply starting transform
        element.style.transition = 'none';
        element.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${deltaScale})`;
        
        // Force reflow
        element.offsetHeight;
        
        // Animate to final position
        element.style.transition = 'transform 0.5s cubic-bezier(0.2, 0, 0.2, 1)';
        
        // Clean up after animation
        setTimeout(() => {
          element.style.transition = '';
          element.style.transform = '';
        }, 500);
      });
      return;
    }

    // When selecting a photo
    // Scroll to top first to ensure proper positioning
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Capture starting position
    const first = element.getBoundingClientRect();
    
    // Update state to mark as selected
    setSelectedPhotoIndex(index);
    
    // After state update, calculate and animate
    requestAnimationFrame(() => {
      const last = element.getBoundingClientRect();
      const deltaX = first.left - last.left;
      const deltaY = first.top - last.top;
      const deltaScale = first.width / last.width;
      
      // Apply starting transform
      element.style.transition = 'none';
      element.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${deltaScale})`;
      
      // Force reflow
      element.offsetHeight;
      
      // Animate to final position
      element.style.transition = 'transform 0.5s cubic-bezier(0.2, 0, 0.2, 1)';
    });
  }, [selectedPhotoIndex, setSelectedPhotoIndex]);

  // Create memoized hashtags for all photos
  const photoHashtags = useMemo(() => {
    if (!photos || !stylePrompts) return {};
    
    return photos.reduce((hashtags, photo) => {
      // Skip computing hashtag for loading photos
      if (photo.loading || photo.generating) {
        hashtags[photo.id] = '';
        return hashtags;
      }
      
      // Use existing hashtag if present
      if (photo.hashtag) {
        hashtags[photo.id] = photo.hashtag;
        return hashtags;
      }
      
      // If statusText already contains a hashtag, don't add another
      if (photo.statusText && photo.statusText.includes('#')) {
        hashtags[photo.id] = '';
        return hashtags;
      }
      
      // Try stylePrompt first
      if (photo.stylePrompt) {
        const foundStyleKey = Object.entries(stylePrompts).find(
          ([, value]) => value === photo.stylePrompt
        )?.[0];
        
        if (foundStyleKey && foundStyleKey !== 'custom' && foundStyleKey !== 'random' && foundStyleKey !== 'randomMix') {
          hashtags[photo.id] = `#${foundStyleKey}`;
          return hashtags;
        }
      }
      
      // Try positivePrompt next
      if (photo.positivePrompt) {
        const foundStyleKey = Object.entries(stylePrompts).find(
          ([, value]) => value === photo.positivePrompt
        )?.[0];
        
        if (foundStyleKey && foundStyleKey !== 'custom' && foundStyleKey !== 'random' && foundStyleKey !== 'randomMix') {
          hashtags[photo.id] = `#${foundStyleKey}`;
          return hashtags;
        }
      }
      
      // Fall back to selectedStyle
      if (selectedStyle && selectedStyle !== 'custom' && selectedStyle !== 'random' && selectedStyle !== 'randomMix') {
        hashtags[photo.id] = `#${selectedStyle}`;
        return hashtags;
      }
      
      // Default empty hashtag
      hashtags[photo.id] = '';
      return hashtags;
    }, {});
  }, [photos, stylePrompts, selectedStyle]);

  // Get hashtag for a specific photo (memoized lookup)
  const getStyleHashtag = useCallback((photo) => {
    return photoHashtags[photo.id] || '';
  }, [photoHashtags]);

  useEffect(() => {
    if (selectedPhotoIndex !== null) {
      document.body.classList.add('has-selected-photo');
    } else {
      document.body.classList.remove('has-selected-photo');
    }
    return () => {
      document.body.classList.remove('has-selected-photo');
    };
  }, [selectedPhotoIndex]);

  // Universal download function that works on all devices
  const downloadImage = async (imageUrl, filename) => {
    try {
      // Use mobile-optimized download for mobile devices
      if (isMobile()) {
        const result = await downloadImageMobile(imageUrl, filename);
        // If mobile download returns true (success or user cancellation), don't fallback
        if (result) {
          return true;
        }
        // Only fallback if mobile download explicitly failed (returned false)
      }
      
      // Standard desktop download
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      // Create a temporary link element
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.style.display = 'none';
      
      // Add to DOM, click, and remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the blob URL
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 100);
      
      return true;
    } catch (error) {
      console.error('Download failed:', error);
      // Only fallback to opening in new tab for non-mobile or when mobile explicitly fails
      if (!isMobile()) {
        window.open(imageUrl, '_blank');
      }
      return false;
    }
  };

  // Handle download photo with polaroid frame
  const handleDownloadPhoto = async (photoIndex) => {
    if (!photos[photoIndex] || !photos[photoIndex].images || photos[photoIndex].images.length === 0) {
      return;
    }

    // Get the current image URL (handle enhanced images)
    const currentSubIndex = photos[photoIndex].enhanced && photos[photoIndex].enhancedImageUrl 
      ? -1 // Special case for enhanced images
      : (selectedSubIndex || 0);
      
    const imageUrl = currentSubIndex === -1
      ? photos[photoIndex].enhancedImageUrl
      : photos[photoIndex].images[currentSubIndex];
    
    if (!imageUrl) return;
    
    try {
      // Get hashtag from photo data
      const styleHashtag = getPhotoHashtag(photos[photoIndex]);
      
      // Determine photo label
      const photoNumberLabel = photos[photoIndex]?.statusText?.split('#')[0]?.trim() || photos[photoIndex]?.label || '';
      const photoLabel = photoNumberLabel + (styleHashtag ? ` ${styleHashtag}` : '');
      
      // Generate filename
      const cleanHashtag = styleHashtag ? styleHashtag.replace('#', '') : 'sogni';
      const timestamp = new Date().getTime();
      const filename = `${cleanHashtag}_photo_${timestamp}.png`;
      
      // Ensure font is loaded
      if (!document.querySelector('link[href*="Permanent+Marker"]')) {
        const fontLink = document.createElement('link');
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);
      }
      
      // Wait for fonts to load
      await document.fonts.ready;
      
      // Create polaroid image
      const polaroidUrl = await createPolaroidImage(imageUrl, photoLabel, {
        tezdevTheme,
        aspectRatio
      });
      
             // Handle download
       downloadImage(polaroidUrl, filename);
    } catch (error) {
      console.error('Error downloading photo:', error);
    }
  };

  // Handle download raw photo with optional TezDev frame
  const handleDownloadRawPhoto = async (photoIndex) => {
    if (!photos[photoIndex] || !photos[photoIndex].images || photos[photoIndex].images.length === 0) {
      return;
    }

    // Get the current image URL (handle enhanced images)
    const currentSubIndex = photos[photoIndex].enhanced && photos[photoIndex].enhancedImageUrl 
      ? -1 // Special case for enhanced images
      : (selectedSubIndex || 0);
      
    const imageUrl = currentSubIndex === -1
      ? photos[photoIndex].enhancedImageUrl
      : photos[photoIndex].images[currentSubIndex];
    
    if (!imageUrl) return;
    
    try {
      // Generate filename
      const styleHashtag = getPhotoHashtag(photos[photoIndex]);
      const cleanHashtag = styleHashtag ? styleHashtag.replace('#', '') : 'sogni';
      const timestamp = new Date().getTime();
      const filename = `${cleanHashtag}_raw_${timestamp}.png`;
      
      // Apply TezDev frame if theme is enabled (works on all aspect ratios now)
      if (tezdevTheme !== 'off') {
        // Ensure font is loaded
        if (!document.querySelector('link[href*="Permanent+Marker"]')) {
          const fontLink = document.createElement('link');
          fontLink.href = 'https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap';
          fontLink.rel = 'stylesheet';
          document.head.appendChild(fontLink);
        }
        
        // Wait for fonts to load
        await document.fonts.ready;
        
        // Create image with TezDev frame (no polaroid frame, just the TezDev overlay)
        const framedImageUrl = await createPolaroidImage(imageUrl, '', {
          tezdevTheme,
          aspectRatio,
          frameWidth: 0,      // No polaroid frame
          frameTopWidth: 0,   // No polaroid frame
          frameBottomWidth: 0, // No polaroid frame
          frameColor: 'transparent' // No polaroid background
        });
      
             // Handle download
        downloadImage(framedImageUrl, filename);
      } else {
        // Handle download without frame
       downloadImage(imageUrl, filename);
      }
    } catch (error) {
      console.error('Error downloading raw photo:', error);
    }
  };

  return (
    <div className={`film-strip-container ${showPhotoGrid ? 'visible' : 'hiding'} ${selectedPhotoIndex === null ? '' : 'has-selected'}`}
      style={{
        background: 'rgba(248, 248, 248, 0.85)',
        backgroundImage: `
          linear-gradient(125deg, rgba(255,138,0,0.8), rgba(229,46,113,0.8), rgba(185,54,238,0.8), rgba(58,134,255,0.8)),
          repeating-linear-gradient(45deg, rgba(255,255,255,0.15) 0px, rgba(255,255,255,0.15) 2px, transparent 2px, transparent 4px),
          repeating-linear-gradient(-45deg, rgba(255,255,255,0.15) 0px, rgba(255,255,255,0.15) 2px, transparent 2px, transparent 4px)
        `,
        backgroundSize: '400% 400%, 20px 20px, 20px 20px',
        animation: 'psychedelic-shift 15s ease infinite',
      }}
    >
      <button
        className="corner-btn"
        onClick={handleBackToCamera}
      >
        ← 📸
      </button>
      {/* Settings button - always show in photo grid */}
      {selectedPhotoIndex === null && (
        <button
          className="header-settings-btn"
          onClick={handleShowControlOverlay}
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            background: 'linear-gradient(135deg, #72e3f2 0%, #4bbbd3 100%)',
            border: 'none',
            color: '#fff',
            fontSize: 20,
            width: 38,
            height: 38,
            borderRadius: '50%',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            cursor: 'pointer',
            fontWeight: 900,
            lineHeight: 1,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            zIndex: 1000,
          }}
          onMouseOver={e => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
          }}
          title="Settings"
        >
          ⚙️
        </button>
      )}
      {/* More button - positioned on the right side */}
      {!isGenerating && selectedPhotoIndex === null && (
        <button
          className="more-photos-btn corner-btn"
          onClick={handleGenerateMorePhotos}
          disabled={activeProjectReference.current !== null || !isSogniReady || !lastPhotoData.blob}
          style={{
            position: 'fixed',
            right: '20px',
            bottom: '20px',
            left: 'auto',
            cursor: activeProjectReference.current !== null || !isSogniReady || !lastPhotoData.blob ? 'not-allowed' : 'pointer',
            zIndex: 9999,
            opacity: activeProjectReference.current !== null || !isSogniReady || !lastPhotoData.blob ? 0.6 : 1,
          }}
        >
          More ✨
        </button>
      )}
      {/* Navigation buttons - only show when a photo is selected */}
      {selectedPhotoIndex !== null && photos.length > 1 && (
        <>
          <button className="photo-nav-btn prev" onClick={handlePreviousPhoto}>
            &#8249;
          </button>
          <button className="photo-nav-btn next" onClick={handleNextPhoto}>
            &#8250;
          </button>
          <button 
            className="photo-close-btn" 
            onClick={() => setSelectedPhotoIndex(null)}
            style={{
              position: 'fixed',
              top: '20px',
              right: '20px',
              background: 'rgba(0, 0, 0, 0.6)',
              color: 'white',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: 'none',
              fontSize: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 99999,
              boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(255, 83, 83, 0.8)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            onMouseDown={e => {
              e.currentTarget.style.transform = 'scale(0.95)';
            }}
            onMouseUp={e => {
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
          >
            ×
          </button>
        </>
      )}
      {/* Also add a close button when there's only one photo */}
      {selectedPhotoIndex !== null && photos.length === 1 && (
        <button 
          className="photo-close-btn" 
          onClick={() => setSelectedPhotoIndex(null)}
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: 'rgba(0, 0, 0, 0.6)',
            color: 'white',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: 'none',
            fontSize: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 99999,
            boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
            transition: 'all 0.2s ease',
          }}
          onMouseOver={e => {
            e.currentTarget.style.background = 'rgba(255, 83, 83, 0.8)';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          ×
        </button>
      )}
      {/* Add these buttons when a photo is selected */}
      {selectedPhotoIndex !== null && photos[selectedPhotoIndex] && (
        <div className="photo-action-buttons" style={{
          display: 'flex',
          justifyContent: 'center',
          position: 'fixed',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 99999,
        }}>
          {/* Share to X Button */}
          <button
            className="action-button twitter-btn"
            onClick={(e) => {
              handleShareToX(selectedPhotoIndex);
              e.stopPropagation();
            }}
            disabled={
              photos[selectedPhotoIndex].loading || 
              photos[selectedPhotoIndex].enhancing ||
              photos[selectedPhotoIndex].error ||
              !photos[selectedPhotoIndex].images ||
              photos[selectedPhotoIndex].images.length === 0
            }
          >
            <svg fill="currentColor" width="16" height="16" viewBox="0 0 24 24"><path d="M22.46 6c-.77.35-1.6.58-2.46.67.9-.53 1.59-1.37 1.92-2.38-.84.5-1.78.86-2.79 1.07C18.27 4.49 17.01 4 15.63 4c-2.38 0-4.31 1.94-4.31 4.31 0 .34.04.67.11.99C7.83 9.09 4.16 7.19 1.69 4.23-.07 6.29.63 8.43 2.49 9.58c-.71-.02-1.38-.22-1.97-.54v.05c0 2.09 1.49 3.83 3.45 4.23-.36.1-.74.15-1.14.15-.28 0-.55-.03-.81-.08.55 1.71 2.14 2.96 4.03 3-1.48 1.16-3.35 1.85-5.37 1.85-.35 0-.69-.02-1.03-.06 1.92 1.23 4.2 1.95 6.67 1.95 8.01 0 12.38-6.63 12.38-12.38 0-.19 0-.38-.01-.56.85-.61 1.58-1.37 2.16-2.24z"/></svg>
            {tezdevTheme !== 'off' ? 'Get your print!' : 'Share'}
          </button>

          {/* Download Polaroid Button - Always show */}
          <button
            className="action-button download-btn"
            onClick={(e) => {
              handleDownloadPhoto(selectedPhotoIndex);
              e.stopPropagation();
            }}
            disabled={
              photos[selectedPhotoIndex].loading || 
              photos[selectedPhotoIndex].enhancing ||
              photos[selectedPhotoIndex].error ||
              !photos[selectedPhotoIndex].images ||
              photos[selectedPhotoIndex].images.length === 0
            }
          >
            <span>💾</span>
            Polaroid
          </button>

          {/* Download Raw Button - Always show */}
          <button
            className="action-button download-raw-btn"
            onClick={(e) => {
              handleDownloadRawPhoto(selectedPhotoIndex);
              e.stopPropagation();
            }}
            disabled={
              photos[selectedPhotoIndex].loading || 
              photos[selectedPhotoIndex].enhancing ||
              photos[selectedPhotoIndex].error ||
              !photos[selectedPhotoIndex].images ||
              photos[selectedPhotoIndex].images.length === 0
            }
          >
            <span>💾</span>
            Raw
          </button>

          {/* Enhance Button - only show if canEnhance is true */}
          {photos[selectedPhotoIndex].enhanced ? (
            <button
              className="action-button enhance-btn"
              onClick={(e) => {
                undoEnhancement({
                  photoIndex: selectedPhotoIndex,
                  subIndex: selectedSubIndex || 0,
                  setPhotos
                });
                e.stopPropagation();
              }}
              disabled={photos[selectedPhotoIndex].loading || photos[selectedPhotoIndex].enhancing || photos[selectedPhotoIndex].error}
            >
              ↩️ Undo
            </button>
          ) : (
            <button
              className="action-button enhance-btn"
              onClick={(e) => {
                enhancePhoto({
                  photo: photos[selectedPhotoIndex],
                  photoIndex: selectedPhotoIndex,
                  subIndex: selectedSubIndex || 0,
                  width: desiredWidth,
                  height: desiredHeight,
                  sogniClient,
                  setPhotos,
                  onSetActiveProject: (projectId) => {
                    activeProjectReference.current = projectId;
                  }
                });
                e.stopPropagation();
              }}
              disabled={photos[selectedPhotoIndex].loading || photos[selectedPhotoIndex].enhancing || photos[selectedPhotoIndex].error}
            >
              ✨ Enhance
            </button>
          )}
        </div>
      )}
      {/* Settings button when viewing a photo */}
      {selectedPhotoIndex !== null && (
        <button
          className="header-settings-btn"
          onClick={handleShowControlOverlay}
          style={{
            position: 'fixed',
            top: 24,
            right: 72,
            background: 'linear-gradient(135deg, #72e3f2 0%, #4bbbd3 100%)',
            border: 'none',
            color: '#fff',
            fontSize: 20,
            width: 38,
            height: 38,
            borderRadius: '50%',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            cursor: 'pointer',
            fontWeight: 900,
            lineHeight: 1,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            zIndex: 99999,
          }}
          onMouseOver={e => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
          }}
          title="Settings"
        >
          ⚙️
        </button>
      )}
      {/* Help button in photo grid view */}
      <button
        className="header-info-btn"
        onClick={toggleNotesModal}
        style={{
          position: 'fixed',
          top: 24,
          right: selectedPhotoIndex !== null ? 120 : 72,
          background: 'linear-gradient(135deg, #ffb6e6 0%, #ff5e8a 100%)',
          border: 'none',
          color: '#fff',
          fontSize: 22,
          width: 38,
          height: 38,
          borderRadius: '50%',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          cursor: 'pointer',
          fontWeight: 900,
          lineHeight: 1,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
          zIndex: 1000,
        }}
        onMouseOver={e => {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
        }}
        onMouseOut={e => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
        }}
        title="Photobooth Tips"
      >
        ?
      </button>
      <div className={`film-strip-content ${selectedPhotoIndex === null ? '' : 'has-selected'}`} style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: '32px',
        justifyItems: 'center',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        maxWidth: '1600px',
        margin: '0 auto',
        padding: '32px'
      }}>
        {photos.map((photo, index) => {
          const isSelected = index === selectedPhotoIndex;
          const isReference = photo.isOriginal;
          const placeholderUrl = photo.originalDataUrl;
          const progress = Math.floor(photo.progress || 0);
          const loadingLabel = progress > 0 ? `${progress}%` : "";
          const labelText = isReference ? "Reference" : `#${index-keepOriginalPhoto+1}`;
          // Loading or error state
          if ((photo.loading && photo.images.length === 0) || (photo.error && photo.images.length === 0)) {
            return (
              <div
                key={photo.id}
                className={`film-frame loading ${isSelected ? 'selected' : ''} ${isSelected && tezdevTheme === 'gmvietnam' ? 'gm-vietnam-theme' : ''}`}
                data-enhancing={photo.enhancing ? 'true' : undefined}
                data-error={photo.error ? 'true' : undefined}
                data-enhanced={photo.enhanced ? 'true' : undefined}
  
                onClick={() => isSelected ? setSelectedPhotoIndex(null) : setSelectedPhotoIndex(index)}
                                style={{
                ...dynamicStyle,
                  position: 'relative',
                  borderRadius: '2px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <div>
                  {placeholderUrl && (
                    <img
                      src={placeholderUrl}
                      alt="Original reference"
                      className="placeholder"
                      onLoad={e => {
                        // Enable mobile-optimized download functionality when image loads
                        enableMobileImageDownload(e.target);
                      }}
                      onContextMenu={e => {
                        // Allow native context menu for image downloads
                        e.stopPropagation();
                      }}
                      style={{
                        objectFit: 'cover',
                        position: 'relative',
                        top: 0,
                        left: 0,
                        opacity: 0.25,
                        zIndex: 1
                      }}
                    />
                  )}
                </div>
                <div className="photo-label">
                  {photo.error ? 
                    <div>
                      <div style={{ marginBottom: '8px' }}>
                        {typeof photo.error === 'object' ? 'GENERATION FAILED: unknown error' : photo.error}
                      </div>
                      {photo.retryable && handleRetryPhoto && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRetryPhoto(index);
                          }}
                          style={{
                            background: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)',
                            border: 'none',
                            color: 'white',
                            padding: '4px 12px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.transform = 'scale(1.05)';
                            e.currentTarget.style.boxShadow = '0 3px 6px rgba(0,0,0,0.15)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                          }}
                        >
                          🔄 Retry
                        </button>
                      )}
                    </div>
                    : photo.loading || photo.generating ? 
                      (photo.statusText || loadingLabel || labelText) 
                      : (photo.statusText || labelText) + (photo.hashtag ? ` ${photo.hashtag}` : getStyleHashtag(photo) ? ` ${getStyleHashtag(photo)}` : '')}
                </div>
              </div>
            );
          }
          // Show completed image
          const thumbUrl = photo.images[0] || '';
          // Determine if photo is fully loaded - simplified condition for better theme switching
          const isLoaded = (!photo.loading && !photo.generating && photo.images.length > 0 && thumbUrl);
          
          return (
            <div 
              key={photo.id}
              className={`film-frame ${isSelected ? 'selected' : ''} ${photo.loading ? 'loading' : ''} ${isLoaded ? 'loaded' : ''} ${isSelected && tezdevTheme === 'gmvietnam' ? 'gm-vietnam-theme' : ''}`}
              onClick={e => isSelected ? handlePhotoViewerClick(e) : handlePhotoSelect(index, e)}
              data-enhancing={photo.enhancing ? 'true' : undefined}
              data-error={photo.error ? 'true' : undefined}
              data-enhanced={photo.enhanced ? 'true' : undefined}

              style={{
                ...dynamicStyle,
                position: 'relative',
                borderRadius: '2px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div style={{
                position: 'relative',
                width: '100%',
              }}>
                <img 
                  src={thumbUrl}
                  alt={`Generated #${index}`}
                  onLoad={e => {
                    // Enable mobile-optimized download functionality when image loads
                    enableMobileImageDownload(e.target);
                  }}
                  onError={e => {
                    if (photo.originalDataUrl && e.target.src !== photo.originalDataUrl) {
                      e.target.src = photo.originalDataUrl;
                      e.target.style.opacity = '0.7';
                      e.target.classList.add('fallback');
                      setPhotos(prev => {
                        const updated = [...prev];
                        if (updated[index]) {
                          updated[index] = {
                            ...updated[index],
                            loadError: true,
                            statusText: `${updated[index].statusText || 'Whoops, image failed to load'}`
                          };
                        }
                        return updated;
                      });
                    }
                  }}
                  onContextMenu={e => {
                    // Allow native context menu for image downloads
                    e.stopPropagation();
                  }}
                  style={{
                    width: '100%',
                    objectFit: 'cover',
                    position: 'relative',
                    top: 0,
                    left: 0,
                    display: 'block'
                  }}
                />
                {/* TezDev Theme Overlays - Only show on selected (popup) view */}
                {thumbUrl && isLoaded && isSelected && tezdevTheme !== 'off' && (
                  <>
                    {/* GM Vietnam Corner Frame Overlay */}
                    {tezdevTheme === 'gmvietnam' && (
                      <>
                        {/* Top-Left Corner */}
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: gmvnFrameSize,
                            height: gmvnFrameSize,
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
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            width: gmvnFrameSize,
                            height: gmvnFrameSize,
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
                    
                    {/* Blue/Pink Corner Frame Overlays */}
                    {(tezdevTheme === 'blue' || tezdevTheme === 'pink') && (
                      <>
                        {/* Top-Right Corner */}
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            width: '75%',
                            height: '75%',
                            backgroundImage: `url(/tezos/tz_${tezdevTheme}_photoframe-TR.png)`,
                            backgroundSize: 'contain',
                            backgroundPosition: 'top right',
                            backgroundRepeat: 'no-repeat',
                            pointerEvents: 'none',
                            zIndex: 2
                          }}
                        />
                        {/* Bottom-Left Corner */}
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            width: '75%',
                            height: '80%',
                            backgroundImage: `url(/tezos/tz_${tezdevTheme}_photoframe-BL.png)`,
                            backgroundSize: 'contain',
                            backgroundPosition: 'bottom left',
                            backgroundRepeat: 'no-repeat',
                            pointerEvents: 'none',
                            zIndex: 2
                          }}
                        />
                      </>
                    )}
                  </>
                )}
              </div>
              <div className="photo-label">
                {photo.loading || photo.generating ? 
                  (photo.statusText || labelText) 
                  : (photo.statusText || labelText) + (photo.hashtag ? ` ${photo.hashtag}` : getStyleHashtag(photo) ? ` ${getStyleHashtag(photo)}` : '')}
              </div>
            </div>
          );
        })}
      </div>
      {/* Only render slothicorn if animation is enabled */}
      {slothicornAnimationEnabled && (
        <div className="slothicorn-container">
          {/* Slothicorn content */}
        </div>
      )}
    </div>
  );
};

PhotoGallery.propTypes = {
  photos: PropTypes.array.isRequired,
  selectedPhotoIndex: PropTypes.number,
  setSelectedPhotoIndex: PropTypes.func.isRequired,
  showPhotoGrid: PropTypes.bool.isRequired,
  handleBackToCamera: PropTypes.func.isRequired,
  handlePreviousPhoto: PropTypes.func.isRequired,
  handleNextPhoto: PropTypes.func.isRequired,
  handlePhotoViewerClick: PropTypes.func.isRequired,
  handleGenerateMorePhotos: PropTypes.func.isRequired,
  handleShowControlOverlay: PropTypes.func.isRequired,
  isGenerating: PropTypes.bool.isRequired,
  keepOriginalPhoto: PropTypes.bool.isRequired,
  lastPhotoData: PropTypes.object.isRequired,
  activeProjectReference: PropTypes.object.isRequired,
  isSogniReady: PropTypes.bool.isRequired,
  toggleNotesModal: PropTypes.func.isRequired,
  setPhotos: PropTypes.func.isRequired,
  selectedStyle: PropTypes.string,
  stylePrompts: PropTypes.object,
  enhancePhoto: PropTypes.func.isRequired,
  undoEnhancement: PropTypes.func.isRequired,
  sogniClient: PropTypes.object.isRequired,
  desiredWidth: PropTypes.number.isRequired,
  desiredHeight: PropTypes.number.isRequired,
  selectedSubIndex: PropTypes.number,
  handleShareToX: PropTypes.func.isRequired,
  slothicornAnimationEnabled: PropTypes.bool.isRequired,
  tezdevTheme: PropTypes.string,
  aspectRatio: PropTypes.string,
  handleRetryPhoto: PropTypes.func,
};

export default React.memo(PhotoGallery); 