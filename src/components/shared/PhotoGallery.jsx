import React, { useMemo, useCallback, useEffect, useState, memo, useRef } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';

import PropTypes from 'prop-types';
import '../../styles/film-strip.css'; // Using film-strip.css which contains the gallery styles
import '../../styles/components/PhotoGallery.css';
import { createPolaroidImage } from '../../utils/imageProcessing';
import { downloadImageMobile, enableMobileImageDownload } from '../../utils/mobileDownload';
import { isMobile, styleIdToDisplay } from '../../utils/index';
import { THEME_GROUPS, getDefaultThemeGroupState, getEnabledPrompts } from '../../constants/themeGroups';
import { getThemeGroupPreferences, saveThemeGroupPreferences } from '../../utils/cookies';
import { isFluxKontextModel, SAMPLE_GALLERY_CONFIG, getQRWatermarkConfig } from '../../constants/settings';
import { themeConfigService } from '../../services/themeConfig';
import { useApp } from '../../context/AppContext';

// Memoized placeholder image component to prevent blob reloading
const PlaceholderImage = memo(({ placeholderUrl }) => {

  
  if (!placeholderUrl) return null;
  
  return (
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
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        position: 'relative',
        top: 0,
        left: 0,
        opacity: 0.25,
        zIndex: 1
      }}
    />
  );
}, (prevProps, nextProps) => {
  // Only re-render if the actual URL changes
  return prevProps.placeholderUrl === nextProps.placeholderUrl;
});

PlaceholderImage.displayName = 'PlaceholderImage';

PlaceholderImage.propTypes = {
  placeholderUrl: PropTypes.string
};

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
  redoEnhancement,
  sogniClient,
  desiredWidth,
  desiredHeight,
  selectedSubIndex = 0,
  outputFormat = 'png',
  handleShareToX,
  slothicornAnimationEnabled,
  backgroundAnimationsEnabled = false,
  tezdevTheme = 'off',
  aspectRatio = null,
  handleRetryPhoto,
  onPreGenerateFrame, // New prop to handle frame pre-generation from parent
  onFramedImageCacheUpdate, // New prop to expose framed image cache to parent
  onClearQrCode, // New prop to clear QR codes when images change
  onClearMobileShareCache, // New prop to clear mobile share cache when images change
  qrCodeData,
  onCloseQR,
  onUseGalleryPrompt, // New prop to handle using a gallery prompt
  // New props for prompt selector mode
  isPromptSelectorMode = false,
  selectedModel = null,
  onPromptSelect = null,
  onRandomMixSelect = null,
  onRandomSingleSelect = null,
  onOneOfEachSelect = null,
  onCustomSelect = null,
  onThemeChange = null,
  onBackToPhotos = null,
  initialThemeGroupState = null
}) => {
  // Get settings from context
  const { settings } = useApp();

  
  // State to track when to show the "more" button during generation
  const [showMoreButtonDuringGeneration, setShowMoreButtonDuringGeneration] = useState(false);
  
  // State to track composite framed images for right-click save compatibility
  const [framedImageUrls, setFramedImageUrls] = useState({});
  
  // State to track which photos are currently generating frames to prevent flicker
  const [generatingFrames, setGeneratingFrames] = useState(new Set());
  
  // State to hold the previous framed image during transitions to prevent flicker
  const [previousFramedImage, setPreviousFramedImage] = useState(null);
  const [previousSelectedIndex, setPreviousSelectedIndex] = useState(null);
  
  // State for QR code overlay
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  
  // State for prompt selector mode
  const [themeGroupState, setThemeGroupState] = useState(() => {
    if (isPromptSelectorMode) {
      // Use initialThemeGroupState prop if provided (for auto-reselect functionality)
      if (initialThemeGroupState) {
        return initialThemeGroupState;
      }
      const saved = getThemeGroupPreferences();
      const defaultState = getDefaultThemeGroupState();
      // If no saved preferences exist (empty object), use default state (all enabled)
      return Object.keys(saved).length === 0 ? defaultState : { ...defaultState, ...saved };
    }
    return getDefaultThemeGroupState();
  });
  const [showThemeFilters, setShowThemeFilters] = useState(false);
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Update theme group state when initialThemeGroupState prop changes
  useEffect(() => {
    if (isPromptSelectorMode && initialThemeGroupState) {
      setThemeGroupState(initialThemeGroupState);
    }
  }, [isPromptSelectorMode, initialThemeGroupState]);

  // Keep track of the previous photos array length to detect new batches (for legacy compatibility)
  const [, setPreviousPhotosLength] = useState(0);
  
  // State for enhancement options dropdown and prompt modal
  const [showEnhanceDropdown, setShowEnhanceDropdown] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  
  // Refs for dropdown animation buttons to prevent re-triggering animations
  const enhanceButton1Ref = useRef(null);
  const enhanceButton2Ref = useRef(null);
  const animationTriggeredRef = useRef(false);
  
  // Auto-dismiss enhancement errors - moved to PhotoEnhancer service to avoid re-renders

  // Handle dropdown animation triggering - only trigger once per dropdown open
  useEffect(() => {
    if (showEnhanceDropdown && !animationTriggeredRef.current) {
      // Trigger animations for both buttons with staggered timing
      const timer1 = setTimeout(() => {
        if (enhanceButton1Ref.current && !enhanceButton1Ref.current.classList.contains('slide-in')) {
          enhanceButton1Ref.current.classList.add('slide-in');
        }
      }, 100);
      
      const timer2 = setTimeout(() => {
        if (enhanceButton2Ref.current && !enhanceButton2Ref.current.classList.contains('slide-in')) {
          enhanceButton2Ref.current.classList.add('slide-in');
        }
      }, 300);
      
      animationTriggeredRef.current = true;
      
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    } else if (!showEnhanceDropdown) {
      // Reset animation state when dropdown is closed
      animationTriggeredRef.current = false;
    }
  }, [showEnhanceDropdown]);
  
  // Clear framed image cache when new photos are generated or theme changes
  // Use a ref to track previous length to avoid effect dependency on photos.length
  const previousPhotosLengthRef = useRef(0);
  
  useEffect(() => {
    const currentLength = photos.length;
    const prevLength = previousPhotosLengthRef.current;
    
    const shouldClearCache = 
      // New batch detected (photos array got smaller, indicating a reset)
      currentLength < prevLength ||
      // Or if we have a significant change in photos (new batch)
      (currentLength > 0 && prevLength > 0 && Math.abs(currentLength - prevLength) >= 3);
    
    if (shouldClearCache) {
      console.log('Clearing framed image cache due to new photo batch');
      // Clean up existing blob URLs
      Object.values(framedImageUrls).forEach(url => {
        if (url && url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
      setFramedImageUrls({});
    }
    
    // Update the previous length ref
    previousPhotosLengthRef.current = currentLength;
    setPreviousPhotosLength(currentLength);
  }, [photos.length]); // Only depend on photos.length, not previousPhotosLength state

  // Clear framed image cache when theme changes
  useEffect(() => {
    // Clean up existing blob URLs
    Object.values(framedImageUrls).forEach(url => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    setFramedImageUrls({});
  }, [tezdevTheme]);

  // Clear framed image cache when aspect ratio changes
  useEffect(() => {
    // Clean up existing blob URLs
    Object.values(framedImageUrls).forEach(url => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    setFramedImageUrls({});
  }, [aspectRatio]);
  
  // Effect to handle the 10-second timeout for showing the "more" button during generation
  useEffect(() => {
    if (isGenerating && selectedPhotoIndex === null) {
      // Start the 10-second timeout when generation begins
      setShowMoreButtonDuringGeneration(false);
      const timeoutId = setTimeout(() => {
        setShowMoreButtonDuringGeneration(true);
      }, 20000); // 20 seconds

      return () => {
        clearTimeout(timeoutId);
      };
    } else {
      // Reset the state when not generating or when a photo is selected
      setShowMoreButtonDuringGeneration(false);
    }
  }, [isGenerating, selectedPhotoIndex]);

  // Handler for the "more" button that can either generate more or cancel current generation
  const handleMoreButtonClick = useCallback(async () => {
    if (onClearQrCode) {
      onClearQrCode();
    }
    
    // Clear framed image cache when generating more photos
    console.log('Clearing framed image cache due to "More" button click');
    Object.values(framedImageUrls).forEach(url => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    setFramedImageUrls({});
    
    // Clear mobile share cache since photo indices will change
    if (onClearMobileShareCache) {
      console.log('Clearing mobile share cache due to "More" button click');
      onClearMobileShareCache();
    }
    
    if (isGenerating && activeProjectReference.current) {
      // Cancel current project and immediately start new batch
      console.log('Cancelling current project from more button:', activeProjectReference.current);
      try {
        if (sogniClient && sogniClient.cancelProject) {
          await sogniClient.cancelProject(activeProjectReference.current);
        }
        activeProjectReference.current = null;
        // Reset the timeout state
        setShowMoreButtonDuringGeneration(false);
        // Immediately start new batch after canceling
        handleGenerateMorePhotos();
      } catch (error) {
        console.warn('Error cancelling project from more button:', error);
        // Even if cancellation fails, try to start new batch
        handleGenerateMorePhotos();
      }
    } else {
      // Normal "generate more photos" behavior
      handleGenerateMorePhotos();
    }
  }, [isGenerating, activeProjectReference, sogniClient, handleGenerateMorePhotos, framedImageUrls, onClearQrCode]);

  // Generate QR code when qrCodeData changes
  useEffect(() => {
    const generateQRCode = async () => {
      if (!qrCodeData || !qrCodeData.shareUrl) {
        setQrCodeDataUrl('');
        return;
      }

      // Handle loading state - don't generate QR for loading placeholder
      if (qrCodeData.shareUrl === 'loading' || qrCodeData.isLoading) {
        setQrCodeDataUrl('loading');
        return;
      }

      try {
        const qrDataUrl = await QRCode.toDataURL(qrCodeData.shareUrl, {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
        setQrCodeDataUrl(qrDataUrl);
      } catch (error) {
        console.error('Error generating QR code:', error);
        setQrCodeDataUrl('');
      }
    };

    generateQRCode();
  }, [qrCodeData]);

  // Utility function to clear frame cache for a specific photo
  const clearFrameCacheForPhoto = useCallback((photoIndex) => {
    console.log(`Clearing frame cache for photo #${photoIndex}`);
    setFramedImageUrls(prev => {
      const keysToRemove = Object.keys(prev).filter(key => key.startsWith(`${photoIndex}-`));
      if (keysToRemove.length === 0) return prev;
      // Revoke any blob URLs
      keysToRemove.forEach(key => {
        const url = prev[key];
        if (url && typeof url === 'string' && url.startsWith('blob:')) {
          try { URL.revokeObjectURL(url); } catch (e) { /* no-op */ }
        }
      });
      const cleaned = { ...prev };
      keysToRemove.forEach(key => delete cleaned[key]);
      return cleaned;
    });
  }, []);

  // Cleanup old framed image cache entries to prevent memory leaks
  const cleanupFramedImageCache = useCallback(() => {
    const minEntries = 16; // Always keep at least 16 framed images for smooth navigation
    const maxEntries = 32; // Start cleanup when we exceed 32 entries
    
    setFramedImageUrls(prev => {
      const entries = Object.entries(prev);
      
      if (entries.length <= maxEntries) {
        return prev; // No cleanup needed
      }
      
      // Create a priority scoring system for cache entries
      const scoredEntries = entries.map(([key, url]) => {
        const [photoIndexStr, subIndexStr] = key.split('-');
        const photoIndex = parseInt(photoIndexStr);
        const subIndex = parseInt(subIndexStr);
        
        let score = 0;
        
        // Higher score for recently viewed photos (closer to current selection)
        if (selectedPhotoIndex !== null) {
          const distance = Math.abs(photoIndex - selectedPhotoIndex);
          score += Math.max(0, 20 - distance); // Photos within 20 indices get higher scores
        }
        
        // Higher score for main images (subIndex 0) vs enhanced images (subIndex -1)
        if (subIndex === 0) {
          score += 5;
        } else if (subIndex === -1) {
          score += 3; // Enhanced images are also important
        }
        
        // Higher score for more recent photos (higher indices)
        score += photoIndex * 0.1;
        
        return { key, url, score, photoIndex };
      });
      
      // Sort by score (descending) to keep highest priority entries
      scoredEntries.sort((a, b) => b.score - a.score);
      
      // Keep at least minEntries, but prioritize by score
      const entriesToKeep = scoredEntries.slice(0, Math.max(minEntries, maxEntries - 8));
      const entriesToRemove = scoredEntries.slice(entriesToKeep.length);
      
      // Revoke blob URLs for removed entries
      entriesToRemove.forEach(({ url }) => {
        if (url && typeof url === 'string' && url.startsWith('blob:')) {
          try { URL.revokeObjectURL(url); } catch (e) { /* no-op */ }
        }
      });
      
      console.log(`Cache cleanup: keeping ${entriesToKeep.length} entries, removing ${entriesToRemove.length} entries`);
      
      return Object.fromEntries(entriesToKeep.map(({ key, url }) => [key, url]));
    });
  }, [selectedPhotoIndex]);
  
  // Run framed image cleanup when cache gets large
  useEffect(() => {
    const entries = Object.keys(framedImageUrls).length;
    if (entries > 32) { // Trigger cleanup when we have more than 32 entries
      cleanupFramedImageCache();
    }
  }, [framedImageUrls]); // Removed cleanupFramedImageCache function from dependencies

  // Handle enhancement with Krea (default behavior)
  const handleEnhanceWithKrea = useCallback(() => {
    setShowEnhanceDropdown(false);
    
    // Use the functional form of setPhotos to get the latest state
    setPhotos(currentPhotos => {
      const currentPhotoIndex = selectedPhotoIndex;
      if (currentPhotoIndex !== null && currentPhotos[currentPhotoIndex] && !currentPhotos[currentPhotoIndex].enhancing) {
        // Call enhance photo in the next tick to ensure we have the latest state
        setTimeout(() => {
          enhancePhoto({
            photo: currentPhotos[currentPhotoIndex],
            photoIndex: currentPhotoIndex,
            subIndex: selectedSubIndex || 0,
            width: desiredWidth,
            height: desiredHeight,
            sogniClient,
            setPhotos,
            outputFormat: outputFormat,
            clearFrameCache: clearFrameCacheForPhoto,
            clearQrCode: onClearQrCode, // Pass QR clearing function
            onSetActiveProject: (projectId) => {
              activeProjectReference.current = projectId;
            }
          });
        }, 0);
      }
      return currentPhotos; // Don't modify photos array here
    });
  }, [selectedPhotoIndex, selectedSubIndex, desiredWidth, desiredHeight, sogniClient, setPhotos, outputFormat, clearFrameCacheForPhoto, activeProjectReference, enhancePhoto]);

  // Handle enhancement with Kontext (with custom prompt)
  const handleEnhanceWithKontext = useCallback(() => {
    setShowEnhanceDropdown(false);
    setShowPromptModal(true);
    setCustomPrompt('');
  }, []);

  // Unified submit handler that supports direct text submission (used by chips)
  const submitPrompt = useCallback((promptText) => {
    const trimmed = (promptText || '').trim();
    if (!trimmed) return;

    setShowPromptModal(false);

    // Use the functional form of setPhotos to get the latest state
    setPhotos(currentPhotos => {
      const currentPhotoIndex = selectedPhotoIndex;
      if (currentPhotoIndex !== null && currentPhotos[currentPhotoIndex] && !currentPhotos[currentPhotoIndex].enhancing) {
        // Call enhance photo with Kontext in the next tick to ensure we have the latest state
        setTimeout(() => {
          enhancePhoto({
            photo: currentPhotos[currentPhotoIndex],
            photoIndex: currentPhotoIndex,
            subIndex: selectedSubIndex || 0,
            width: desiredWidth,
            height: desiredHeight,
            sogniClient,
            setPhotos,
            outputFormat: outputFormat,
            clearFrameCache: clearFrameCacheForPhoto,
            clearQrCode: onClearQrCode, // Pass QR clearing function
            onSetActiveProject: (projectId) => {
              activeProjectReference.current = projectId;
            },
            // Kontext-specific parameters
            useKontext: true,
            customPrompt: trimmed
          });
        }, 0);
      }
      return currentPhotos; // Don't modify photos array here
    });
  }, [selectedPhotoIndex, selectedSubIndex, desiredWidth, desiredHeight, sogniClient, setPhotos, outputFormat, clearFrameCacheForPhoto, activeProjectReference, enhancePhoto]);

  // Handle prompt modal submission
  const handlePromptSubmit = useCallback(() => {
    submitPrompt(customPrompt);
  }, [submitPrompt, customPrompt]);

  // Handle prompt modal cancel
  const handlePromptCancel = useCallback(() => {
    setShowPromptModal(false);
    setCustomPrompt('');
  }, []);

  // Handle theme group toggle for prompt selector mode
  const handleThemeGroupToggle = useCallback((groupId) => {
    if (!isPromptSelectorMode) return;
    
    const newState = {
      ...themeGroupState,
      [groupId]: !themeGroupState[groupId]
    };
    setThemeGroupState(newState);
    saveThemeGroupPreferences(newState);
    
    // Notify parent component about theme changes
    if (onThemeChange) {
      onThemeChange(newState);
    }
  }, [isPromptSelectorMode, themeGroupState, onThemeChange]);

  // Filter photos based on enabled theme groups and search term in prompt selector mode
  const filteredPhotos = useMemo(() => {
    if (!isPromptSelectorMode || !photos) return photos;
    
    const isFluxKontext = selectedModel && isFluxKontextModel(selectedModel);
    let filtered = photos;
    
    // Apply theme group filtering for non-Flux models
    if (!isFluxKontext) {
      const enabledPrompts = getEnabledPrompts(themeGroupState, stylePrompts || {});
      filtered = photos.filter(photo => {
        if (!photo.promptKey) return false;
        return Object.prototype.hasOwnProperty.call(enabledPrompts, photo.promptKey);
      });
    }
    
    // Apply search term filtering if search term exists
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(photo => {
        // Search in the display text (styleIdToDisplay of promptKey)
        const displayText = photo.promptKey ? styleIdToDisplay(photo.promptKey).toLowerCase() : '';
        return displayText.includes(searchLower);
      });
    }
    
    return filtered;
  }, [isPromptSelectorMode, photos, themeGroupState, stylePrompts, selectedModel, searchTerm]);

  // Close dropdown when clicking outside (but allow clicks inside the portal dropdown)
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!showEnhanceDropdown) return;
      const target = event.target;
      const inButtonContainer = !!target.closest('.enhance-button-container');
      const inDropdown = !!target.closest('.enhance-dropdown');
      if (!inButtonContainer && !inDropdown) {
        setShowEnhanceDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showEnhanceDropdown]);

  // Close search input when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!showSearchInput) return;
      const target = event.target;
      const inSearchContainer = !!target.closest('.style-selector-text-container');
      const inSearchInput = !!target.closest('input[placeholder="Search styles..."]');
      const inClearButton = target.textContent === '✕';
      if (!inSearchContainer && !inSearchInput && !inClearButton) {
        setShowSearchInput(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showSearchInput]);

  // Helper function to check if current theme supports the current aspect ratio
  // MUST be called before any early returns to maintain hook order
  const isThemeSupported = useCallback(() => {
    if (tezdevTheme === 'off') return false;
    
    // Check hardcoded theme aspect ratio requirements
    switch (tezdevTheme) {
      case 'supercasual':
      case 'tezoswebx':
      case 'taipeiblockchain':
      case 'showup': {
        return aspectRatio === 'narrow';
      }
      default:
        // For dynamic themes, assume they support all aspect ratios
        // The actual validation happens in applyTezDevFrame() which checks
        // themeConfigService.getFrameUrls() and gracefully handles unsupported combinations
        return true;
    }
  }, [tezdevTheme, aspectRatio]);

  // Ensure all photos have a Taipei frame number and frame padding assigned (migration for existing photos)
  // Use a ref to track if migration has been done to avoid repeated migrations
  // MUST be called before any early returns to maintain hook order
  const migrationDoneRef = useRef(new Set());
  
  useEffect(() => {
    const photosNeedingMigration = photos.filter(photo => 
      (!photo.taipeiFrameNumber || photo.framePadding === undefined) &&
      !migrationDoneRef.current.has(photo.id)
    );
    
    if (photosNeedingMigration.length === 0) {
      return;
    }
    
    const migratePhotos = async () => {
      // Build minimal per-photo updates to avoid overwriting concurrent changes (e.g., enhancement)
      const updates = await Promise.all(
        photos.map(async (photo, index) => {
          if (migrationDoneRef.current.has(photo.id)) {
            return null;
          }
          const needsFrameNumber = !photo.taipeiFrameNumber;
          const needsPadding = photo.framePadding === undefined;
          if (!needsFrameNumber && !needsPadding) {
            return null;
          }
          const nextTaipeiFrameNumber = needsFrameNumber ? ((index % 6) + 1) : photo.taipeiFrameNumber;
          let nextFramePadding = photo.framePadding;
          if (needsPadding) {
            if (tezdevTheme !== 'off') {
              try {
                nextFramePadding = await themeConfigService.getFramePadding(tezdevTheme);
              } catch (error) {
                console.warn('Could not get frame padding for photo migration:', error);
                nextFramePadding = 0;
              }
            } else {
              nextFramePadding = 0;
            }
          }
          migrationDoneRef.current.add(photo.id);
          return { id: photo.id, index, taipeiFrameNumber: nextTaipeiFrameNumber, framePadding: nextFramePadding };
        })
      );
      
      const effectiveUpdates = updates.filter(Boolean);
      if (effectiveUpdates.length === 0) {
        return;
      }
      
      // Apply only the migrated fields to the latest state to prevent stale overwrites
      setPhotos(prev => {
        const idToUpdate = new Map(effectiveUpdates.map(u => [u.id, u]));
        return prev.map(photo => {
          const u = idToUpdate.get(photo.id);
          if (!u) return photo;
          return {
            ...photo,
            taipeiFrameNumber: u.taipeiFrameNumber,
            framePadding: u.framePadding
          };
        });
      });
    };
    
    migratePhotos();
  }, [photos, tezdevTheme, setPhotos]);


  // Helper function to pre-generate framed image for a specific photo index
  const preGenerateFrameForPhoto = useCallback(async (photoIndex) => {
    if (!isThemeSupported() || !photos[photoIndex]) {
      return;
    }

    const photo = photos[photoIndex];
    const currentSubIndex = photo.enhanced && photo.enhancedImageUrl 
      ? -1 // Special case for enhanced images
      : (selectedSubIndex || 0);
      
    const imageUrl = currentSubIndex === -1
      ? photo.enhancedImageUrl
      : photo.images[currentSubIndex];
    
    if (!imageUrl) return;

    const currentTaipeiFrameNumber = photo.taipeiFrameNumber || ((photoIndex % 6) + 1);
    const frameKey = `${photoIndex}-${currentSubIndex}-${tezdevTheme}-${currentTaipeiFrameNumber}-${outputFormat}-${aspectRatio}`;
    
    // Check current state to avoid stale closures
    setFramedImageUrls(currentFramedUrls => {
      setGeneratingFrames(currentGeneratingFrames => {
        // Only generate if we don't already have this framed image and it's not already being generated
        if (!currentFramedUrls[frameKey] && !currentGeneratingFrames.has(frameKey)) {
          console.log(`Pre-generating frame for photo ${photoIndex} with key: ${frameKey}`);
          
          // Mark this frame as generating to prevent duplicate generation
          const newGeneratingFrames = new Set(currentGeneratingFrames);
          newGeneratingFrames.add(frameKey);
          
          // Generate the frame asynchronously
          (async () => {
            try {
              // Wait for fonts to load
              await document.fonts.ready;
              
              // Create composite framed image
              // Gallery images should always use default polaroid styling, not theme frames
              const isGalleryImage = photo.isGalleryImage;
              const framedImageUrl = await createPolaroidImage(imageUrl, '', {
                tezdevTheme: isGalleryImage ? 'off' : tezdevTheme,
                aspectRatio,
                // Gallery images get default polaroid frame, theme images get no polaroid frame
                frameWidth: isGalleryImage ? 56 : 0,
                frameTopWidth: isGalleryImage ? 56 : 0,
                frameBottomWidth: isGalleryImage ? 150 : 0,
                frameColor: isGalleryImage ? 'white' : 'transparent',
                outputFormat: outputFormat,
                // For Taipei theme, pass the current frame number to ensure consistency (but not for gallery images)
                taipeiFrameNumber: (!isGalleryImage && tezdevTheme === 'taipeiblockchain') ? currentTaipeiFrameNumber : undefined,
                // Add QR watermark to preview frames (if enabled)
                watermarkOptions: settings.sogniWatermark ? getQRWatermarkConfig(settings) : null
              });
              
              // Store the framed image URL
              setFramedImageUrls(prev => ({
                ...prev,
                [frameKey]: framedImageUrl
              }));
              
              console.log(`Successfully generated frame for photo ${photoIndex}`);
              
            } catch (error) {
              console.error('Error pre-generating framed image:', error);
            } finally {
              // Always remove from generating set
              setGeneratingFrames(prev => {
                const newSet = new Set(prev);
                newSet.delete(frameKey);
                return newSet;
              });
            }
          })();
          
          return newGeneratingFrames;
        }
        return currentGeneratingFrames;
      });
      return currentFramedUrls;
    });
  }, [isThemeSupported, photos, selectedSubIndex, tezdevTheme, outputFormat, aspectRatio]);

  // Helper function to pre-generate frames for adjacent photos to improve navigation smoothness
  const preGenerateAdjacentFrames = useCallback(async (currentIndex) => {
    if (!isThemeSupported() || currentIndex === null) {
      return;
    }

    // Pre-generate frames for the next 2 and previous 2 photos for smooth navigation
    // Reduced from 3 to prevent overwhelming the system
    const adjacentIndices = [];
    
    // Add previous photos (up to 2)
    for (let i = 1; i <= 2; i++) {
      const prevIndex = currentIndex - i;
      if (prevIndex >= 0 && photos[prevIndex]) {
        adjacentIndices.push(prevIndex);
      }
    }
    
    // Add next photos (up to 2)
    for (let i = 1; i <= 2; i++) {
      const nextIndex = currentIndex + i;
      if (nextIndex < photos.length && photos[nextIndex]) {
        adjacentIndices.push(nextIndex);
      }
    }

    // Pre-generate frames for adjacent photos with staggered timing to avoid overwhelming
    adjacentIndices.forEach((index, i) => {
      // Use setTimeout to avoid blocking the main thread, with longer delays
      setTimeout(() => preGenerateFrameForPhoto(index), 200 * (i + 1));
    });
  }, [isThemeSupported, photos, preGenerateFrameForPhoto]);

  // Expose the pre-generation function to parent component
  useEffect(() => {
    if (onPreGenerateFrame) {
      onPreGenerateFrame(preGenerateFrameForPhoto);
    }
  }, [onPreGenerateFrame, preGenerateFrameForPhoto]);

  // Expose framed image cache to parent component
  useEffect(() => {
    if (onFramedImageCacheUpdate) {
      onFramedImageCacheUpdate(framedImageUrls);
    }
  }, [onFramedImageCacheUpdate, framedImageUrls]);

  const handlePhotoSelect = useCallback(async (index, e) => {
    const element = e.currentTarget;
    
    // In prompt selector mode, just show selected state - don't immediately set style
    // The "Use this Style" button will handle the actual style selection
    
    console.log('🚨 PHOTO CLICKED - DEBUGGING START');
    console.log('🔍 isExtensionMode:', isExtensionMode);
    console.log('🔍 window.extensionMode:', window.extensionMode);
    console.log('🔍 isPromptSelectorMode:', isPromptSelectorMode);
    
    // Reset scroll position to top in extension mode to prevent CSS layout issues
    if (isExtensionMode) {
      console.log('✅ EXTENSION MODE DETECTED - EXECUTING SCROLL RESET');
      
      // Direct approach - just scroll the film strip container to top
      const filmStripContainer = document.querySelector('.film-strip-container');
      if (filmStripContainer) {
        console.log('📍 Found .film-strip-container, scrollTop before:', filmStripContainer.scrollTop);
        filmStripContainer.scrollTop = 0;
        console.log('📍 Set scrollTop to 0, scrollTop after:', filmStripContainer.scrollTop);
        filmStripContainer.scrollTo({ top: 0, behavior: 'instant' });
        console.log('📍 Called scrollTo({top: 0, behavior: instant})');
      } else {
        console.log('❌ .film-strip-container NOT FOUND');
      }
    }
    
    if (selectedPhotoIndex === index) {
      // Capture current position before removing selected state
      const first = element.getBoundingClientRect();
      setSelectedPhotoIndex(null);
      
      // Animate back to grid position
      requestAnimationFrame(() => {
        const last = element.getBoundingClientRect();
        const deltaX = first.left - last.left;
        const deltaY = first.top - last.top;
        
        element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        element.style.transition = 'none';
        
        requestAnimationFrame(() => {
          element.style.transform = '';
          element.style.transition = 'transform 0.3s ease-out';
        });
      });
    } else {
      // Capture current position before selecting
      const first = element.getBoundingClientRect();
      setSelectedPhotoIndex(index);
      
      // Pre-generate frames for adjacent photos to improve navigation smoothness
      await preGenerateAdjacentFrames(index);
      
      // Animate to selected position
      requestAnimationFrame(() => {
        const last = element.getBoundingClientRect();
        const deltaX = first.left - last.left;
        const deltaY = first.top - last.top;
        
        element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        element.style.transition = 'none';
        
        requestAnimationFrame(() => {
          element.style.transform = '';
          element.style.transition = 'transform 0.3s ease-out';
        });
      });
    }
  }, [selectedPhotoIndex, setSelectedPhotoIndex, preGenerateAdjacentFrames]);


  // Detect if running as PWA - MUST be called before any early returns to maintain hook order
  const isPWA = useMemo(() => {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone ||
           document.referrer.includes('android-app://');
  }, []);

  // Get readable style display text for photo labels (no hashtags)
  const getStyleDisplayText = useCallback((photo) => {
    // Gallery images already have promptDisplay
    if (photo.isGalleryImage && photo.promptDisplay) {
      return photo.promptDisplay;
    }
    
    // Skip for loading photos
    if (photo.loading || photo.generating) {
      return '';
    }
    
    // Try stylePrompt first
    if (photo.stylePrompt) {
      const foundStyleKey = Object.entries(stylePrompts).find(
        ([, value]) => value === photo.stylePrompt
      )?.[0];
      
      if (foundStyleKey && foundStyleKey !== 'custom' && foundStyleKey !== 'random' && foundStyleKey !== 'randomMix' && foundStyleKey !== 'browseGallery') {
        return styleIdToDisplay(foundStyleKey);
      }
    }
    
    // Try positivePrompt next
    if (photo.positivePrompt) {
      const foundStyleKey = Object.entries(stylePrompts).find(
        ([, value]) => value === photo.positivePrompt
      )?.[0];
      
      if (foundStyleKey && foundStyleKey !== 'custom' && foundStyleKey !== 'random' && foundStyleKey !== 'randomMix' && foundStyleKey !== 'browseGallery') {
        return styleIdToDisplay(foundStyleKey);
      }
    }
    
    // Try selectedStyle as fallback
    if (selectedStyle && selectedStyle !== 'custom' && selectedStyle !== 'random' && selectedStyle !== 'randomMix' && selectedStyle !== 'browseGallery') {
      return styleIdToDisplay(selectedStyle);
    }
    
    // Default empty
    return '';
  }, [photos, stylePrompts, selectedStyle]);

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

  // Generate composite framed image when photo is selected with decorative theme
  useEffect(() => {
    const generateFramedImage = async () => {
      // Generate for selected photos with supported themes OR when QR watermark is enabled
      if (selectedPhotoIndex === null || (!isThemeSupported() && !settings.sogniWatermark) || !photos[selectedPhotoIndex]) {
        return;
      }

      const photo = photos[selectedPhotoIndex];
      const currentSubIndex = photo.enhanced && photo.enhancedImageUrl 
        ? -1 // Special case for enhanced images
        : (selectedSubIndex || 0);
        
      const imageUrl = currentSubIndex === -1
        ? photo.enhancedImageUrl
        : photo.images[currentSubIndex];
      
      if (!imageUrl) return;

      // Get the current Taipei frame number for this photo
      const currentTaipeiFrameNumber = photo.taipeiFrameNumber || 1;
      const frameKey = `${selectedPhotoIndex}-${currentSubIndex}-${tezdevTheme}-${currentTaipeiFrameNumber}-${outputFormat}-${aspectRatio}`;
      
      // Check if we already have this framed image
      if (framedImageUrls[frameKey]) {
        return;
      }

      try {
        // Wait for fonts to load
        await document.fonts.ready;
        
        // Create composite framed image
        // Gallery images should always use default polaroid styling, not theme frames
        // For QR-only cases (no theme but QR enabled), don't add polaroid frame since CSS handles the frame
        const isGalleryImage = photo.isGalleryImage;
        const isQROnly = !isThemeSupported() && settings.sogniWatermark;
        const framedImageUrl = await createPolaroidImage(imageUrl, '', {
          tezdevTheme: isGalleryImage ? 'off' : tezdevTheme,
          aspectRatio,
          // Gallery images get default polaroid frame, theme images and QR-only get no polaroid frame
          frameWidth: isGalleryImage ? 56 : 0,
          frameTopWidth: isGalleryImage ? 56 : 0,
          frameBottomWidth: isGalleryImage ? 196 : 0,
          frameColor: isGalleryImage ? 'white' : 'transparent',
          outputFormat: outputFormat,
          // For Taipei theme, pass the current frame number to ensure consistency (but not for gallery images or QR-only)
          taipeiFrameNumber: (!isGalleryImage && !isQROnly && tezdevTheme === 'taipeiblockchain') ? currentTaipeiFrameNumber : undefined,
          // Add QR watermark to selected photo frames (if enabled) - match download size
          watermarkOptions: settings.sogniWatermark ? getQRWatermarkConfig(settings) : null
        });
        
        // Store the framed image URL
        setFramedImageUrls(prev => ({
          ...prev,
          [frameKey]: framedImageUrl
        }));
        
        console.log(`Generated framed image for selected photo ${selectedPhotoIndex}`);
        
      } catch (error) {
        console.error('Error generating framed image:', error);
      }
    };

    generateFramedImage();
  }, [selectedPhotoIndex, selectedSubIndex, photos, aspectRatio, outputFormat, isThemeSupported, preGenerateAdjacentFrames]);

  // Track photo selection changes to manage smooth transitions
  useEffect(() => {
    if (selectedPhotoIndex !== previousSelectedIndex && isThemeSupported()) {
      // Store the current framed image before switching
      if (previousSelectedIndex !== null && photos[previousSelectedIndex]) {
        const prevPhoto = photos[previousSelectedIndex];
        const prevSubIndex = prevPhoto.enhanced && prevPhoto.enhancedImageUrl ? -1 : (selectedSubIndex || 0);
        const prevTaipeiFrameNumber = prevPhoto.taipeiFrameNumber || 1;
        const prevFrameKey = `${previousSelectedIndex}-${prevSubIndex}-${tezdevTheme}-${prevTaipeiFrameNumber}-${outputFormat}-${aspectRatio}`;
        const prevFramedImageUrl = framedImageUrls[prevFrameKey];
        
        if (prevFramedImageUrl) {
          setPreviousFramedImage(prevFramedImageUrl);
        }
      }
      
      // Update the previous selected index
      setPreviousSelectedIndex(selectedPhotoIndex);
    }
  }, [selectedPhotoIndex, previousSelectedIndex, photos, selectedSubIndex, tezdevTheme, outputFormat, aspectRatio, framedImageUrls, isThemeSupported]);

  // Skip rendering if there are no photos or the grid is hidden
  // Exception: In prompt selector mode, we need to render even with empty photos while they're loading
  // This MUST come after all hooks to maintain hook order
  if ((photos.length === 0 && !isPromptSelectorMode) || !showPhotoGrid) return null;
  
  // Check if we're in extension mode for transparent overlay
  const isExtensionMode = window.extensionMode;
  
  // Calculate proper aspect ratio style based on the selected aspect ratio
  const getAspectRatioStyle = () => {
    // In prompt selector mode, always use hard-coded 2:3 aspect ratio for sample gallery
    if (isPromptSelectorMode) {
    return {
      width: '100%',
      aspectRatio: SAMPLE_GALLERY_CONFIG.CSS_ASPECT_RATIO,
      margin: '0 auto',
      backgroundColor: isExtensionMode ? 'transparent' : 'white',
    };
    }
    
    // For regular mode, use user's selected aspect ratio
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
      backgroundColor: isExtensionMode ? 'transparent' : 'white',
    };
  };
  
  const dynamicStyle = getAspectRatioStyle();
  



  // Note: Hashtag generation for Twitter sharing is now handled by the Twitter service


  // Cleanup old framed image URLs to prevent memory leaks - removed automatic cleanup to avoid continuous re-renders
  // Manual cleanup can be added if needed in specific scenarios

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
      // Get style display text (spaced format, no hashtags)
      const styleDisplayText = getStyleDisplayText(photos[photoIndex]);
      
      // Determine photo label (only used for default polaroid frame)
      // Fix duplicate label issue by using statusText directly or just the style
      const photoNumberLabel = photos[photoIndex]?.statusText?.split('#')[0]?.trim() || '';
      const photoLabel = photoNumberLabel || styleDisplayText || '';
      
      // Generate filename based on outputFormat setting
      const cleanStyleName = styleDisplayText ? styleDisplayText.toLowerCase().replace(/\s+/g, '-') : 'sogni';
      const fileExtension = outputFormat === 'png' ? '.png' : '.jpg';
      const filename = `sogni-photobooth-${cleanStyleName}-framed${fileExtension}`;
      
      // Ensure font is loaded
      if (!document.querySelector('link[href*="Permanent+Marker"]')) {
        const fontLink = document.createElement('link');
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);
      }
      
      // Wait for fonts to load
      await document.fonts.ready;
      
      // Create framed image: supported custom theme frame OR default polaroid frame
      // Use the outputFormat setting for framed downloads (unlike Twitter which always uses JPG)
      const useTheme = isThemeSupported();
      const isGalleryImage = photos[photoIndex].isGalleryImage;
      // Gallery images should always use default polaroid styling, regardless of theme
      const shouldUseTheme = useTheme && !isGalleryImage;
      // Truncate label earlier to make room for QR code
      const maxLabelLength = 20; // Shorter to make room for QR
      const truncatedLabel = !shouldUseTheme && photoLabel.length > maxLabelLength 
        ? photoLabel.substring(0, maxLabelLength) + '...' 
        : photoLabel;

      const polaroidUrl = await createPolaroidImage(imageUrl, !shouldUseTheme ? truncatedLabel : '', {
        tezdevTheme: shouldUseTheme ? tezdevTheme : 'off',
        aspectRatio,
        // If theme is not supported or it's a gallery image, use default polaroid frame; otherwise no polaroid frame
        frameWidth: !shouldUseTheme ? 56 : 0,
        frameTopWidth: !shouldUseTheme ? 56 : 0,
        frameBottomWidth: !shouldUseTheme ? 150 : 0,
        frameColor: !shouldUseTheme ? 'white' : 'transparent',
        outputFormat: outputFormat, // Use the actual outputFormat setting for framed downloads
        // For Taipei theme, pass the current frame number to ensure consistency (but not for gallery images)
        taipeiFrameNumber: shouldUseTheme && tezdevTheme === 'taipeiblockchain' ? photos[photoIndex].taipeiFrameNumber : undefined,
        // Add QR watermark for downloads with improved settings (if enabled)
        watermarkOptions: settings.sogniWatermark ? getQRWatermarkConfig(settings) : null
      });
      
             // Handle download
       downloadImage(polaroidUrl, filename);
    } catch (error) {
      console.error('Error downloading photo:', error);
    }
  };

  // Handle download raw photo WITHOUT any frame theme (pure original image)
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
      // Generate filename with correct extension based on outputFormat
      const styleDisplayText = getStyleDisplayText(photos[photoIndex]);
      const cleanStyleName = styleDisplayText ? styleDisplayText.toLowerCase().replace(/\s+/g, '-') : 'sogni';
      
      // For raw downloads, ensure we preserve the original format from the server
      // First, try to detect the actual format from the image URL or by fetching it
      let actualExtension = outputFormat === 'jpg' ? '.jpg' : '.png';
      
      try {
        // If this is a blob URL, we can fetch it to check the MIME type
        if (imageUrl.startsWith('blob:') || imageUrl.startsWith('http')) {
          const response = await fetch(imageUrl);
          const contentType = response.headers.get('content-type');
          if (contentType) {
            if (contentType.includes('image/png')) {
              actualExtension = '.png';
            } else if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) {
              actualExtension = '.jpg';
            }
            console.log(`[RAW DOWNLOAD] Detected image format: ${contentType}, using extension: ${actualExtension}`);
          }
          // Don't consume the response body, just use the headers
        }
      } catch (formatDetectionError) {
        console.warn('Could not detect image format, using outputFormat setting:', formatDetectionError);
        // Fall back to outputFormat setting
      }
      
      const filename = `sogni-photobooth-${cleanStyleName}-raw${actualExtension}`;
      
      // For raw downloads, add QR watermark to the original image without frames (if enabled)
      console.log(`[RAW DOWNLOAD] Processing original image${settings.sogniWatermark ? ' with QR watermark' : ''}: ${filename}`);
      
      // Load the original image and optionally add QR watermark
      const processedImageUrl = await new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = async () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            
            // Enable high-quality image resampling
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            // Draw the original image
            ctx.drawImage(img, 0, 0);
            
            // Add QR watermark to raw image (if enabled)
            if (settings.sogniWatermark) {
              const { addQRWatermark } = await import('../../utils/imageProcessing.js');
              await addQRWatermark(ctx, canvas.width, canvas.height, getQRWatermarkConfig(settings));
            }
            
            // Convert to data URL
            const dataUrl = canvas.toDataURL(actualExtension === '.png' ? 'image/png' : 'image/jpeg', 0.95);
            resolve(dataUrl);
          } catch (error) {
            console.error('Error processing raw image with watermark:', error);
            // Fallback to original image if watermark fails
            resolve(imageUrl);
          }
        };
        
        img.onerror = () => {
          console.error('Error loading image for raw download processing');
          // Fallback to original image if loading fails
          resolve(imageUrl);
        };
        
        img.src = imageUrl;
      });
      
      downloadImage(processedImageUrl, filename);
    } catch (error) {
      console.error('Error downloading raw photo:', error);
    }
  };


  return (
    <div className={`film-strip-container ${showPhotoGrid ? 'visible' : 'hiding'} ${selectedPhotoIndex === null ? '' : 'has-selected'} ${isPWA ? 'pwa-mode' : ''} ${isExtensionMode ? 'extension-mode' : ''} ${isPromptSelectorMode ? 'prompt-selector-mode' : ''}`}
      style={{
        background: isExtensionMode ? 'transparent' : 'rgba(248, 248, 248, 0.85)',
        backgroundImage: isExtensionMode ? 'none' : `
          linear-gradient(125deg, rgba(255,138,0,0.8), rgba(229,46,113,0.8), rgba(185,54,238,0.8), rgba(58,134,255,0.8)),
          repeating-linear-gradient(45deg, rgba(255,255,255,0.15) 0px, rgba(255,255,255,0.15) 2px, transparent 2px, transparent 4px),
          repeating-linear-gradient(-45deg, rgba(255,255,255,0.15) 0px, rgba(255,255,255,0.15) 2px, transparent 2px, transparent 4px)
        `,
        backgroundSize: isExtensionMode ? 'auto' : '400% 400%, 20px 20px, 20px 20px',
        animation: (backgroundAnimationsEnabled && !isPWA && !isExtensionMode) ? 'psychedelic-shift 15s ease infinite' : 'none',
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
      {/* More button - positioned on the right side - hidden in Sample Gallery mode */}
      {!isPromptSelectorMode && ((!isGenerating && selectedPhotoIndex === null) || (isGenerating && showMoreButtonDuringGeneration && selectedPhotoIndex === null)) && (
        <button
          className="more-photos-btn corner-btn"
          onClick={handleMoreButtonClick}
          disabled={!isGenerating && (activeProjectReference.current !== null || !isSogniReady || !lastPhotoData.blob)}
          style={{
            position: 'fixed',
            right: '20px',
            bottom: '20px',
            left: 'auto',
            cursor: (!isGenerating && (activeProjectReference.current !== null || !isSogniReady || !lastPhotoData.blob)) ? 'not-allowed' : 'pointer',
            zIndex: 9999,
            opacity: (!isGenerating && (activeProjectReference.current !== null || !isSogniReady || !lastPhotoData.blob)) ? 0.6 : 1,
            backgroundColor: isGenerating ? '#ff6b6b' : undefined, // Red background when in cancel mode
            borderColor: isGenerating ? '#ff6b6b' : undefined,
          }}
          title={isGenerating ? 'Cancel current generation and start new batch' : 'Generate more photos'}
        >
          {isGenerating ? 'Cancel & More ✨' : 'More ✨'}
        </button>
      )}
      {/* Generate button - only show in prompt selector mode when reference photo exists */}
      {isPromptSelectorMode && onBackToPhotos && lastPhotoData && lastPhotoData.blob && selectedPhotoIndex === null && (
        <button
          className="view-photos-btn corner-btn"
          onClick={() => {
            // Switch back to regular Photos Grid view and generate fresh batch
            onBackToPhotos();
            // Small delay to ensure state updates properly, then generate
            setTimeout(() => {
              handleGenerateMorePhotos();
            }, 100);
          }}
          style={{
            position: 'fixed',
            right: '20px',
            bottom: '20px',
            left: 'auto',
            zIndex: 9999,
          }}
          title="Generate fresh batch with current settings"
        >
          <span className="view-photos-label">Generate ✨</span>
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
      {(() => {
        if (selectedPhotoIndex === null) return null;
        
        // Get the correct photo from the appropriate array (filtered or original)
        const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
        const selectedPhoto = currentPhotosArray[selectedPhotoIndex];
        
        if (!selectedPhoto) return null;
        
        return (
          <div className="photo-action-buttons" style={{
            display: 'flex',
            justifyContent: 'center',
            position: 'fixed',
            left: '50%',
            transform: 'translateX(-50%)',
            // Ensure this toolbar and its popups are above sloth mascot
            zIndex: 999999,
          }}>
            {/* Share to X Button or Use this Prompt Button for Gallery Images */}
            {selectedPhoto.isGalleryImage ? (
              <button
                className="action-button use-prompt-btn"
                onClick={(e) => {
                  console.log('🚨 USE THIS STYLE CLICKED - DEBUGGING START');
                  console.log('🔍 isExtensionMode:', isExtensionMode);
                  console.log('🔍 window.extensionMode:', window.extensionMode);
                  console.log('🔍 isPromptSelectorMode:', isPromptSelectorMode);
                  
                  // Reset scroll position to top in extension mode before style selection
                  if (isExtensionMode) {
                    console.log('✅ EXTENSION MODE DETECTED - EXECUTING SCROLL RESET (Use This Style)');
                    
                    // Direct approach - just scroll the film strip container to top
                    const filmStripContainer = document.querySelector('.film-strip-container');
                    if (filmStripContainer) {
                      console.log('📍 Found .film-strip-container, scrollTop before:', filmStripContainer.scrollTop);
                      filmStripContainer.scrollTop = 0;
                      console.log('📍 Set scrollTop to 0, scrollTop after:', filmStripContainer.scrollTop);
                      filmStripContainer.scrollTo({ top: 0, behavior: 'instant' });
                      console.log('📍 Called scrollTo({top: 0, behavior: instant})');
                    } else {
                      console.log('❌ .film-strip-container NOT FOUND');
                    }
                  }
                  
                  if (isPromptSelectorMode && onPromptSelect && selectedPhoto.promptKey) {
                    onPromptSelect(selectedPhoto.promptKey);
                  } else if (onUseGalleryPrompt && selectedPhoto.promptKey) {
                    onUseGalleryPrompt(selectedPhoto.promptKey);
                  }
                  e.stopPropagation();
                }}
                disabled={
                  !selectedPhoto.promptKey ||
                  (!onUseGalleryPrompt && !onPromptSelect)
                }
              >
                <svg fill="currentColor" width="16" height="16" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                Use this Style
              </button>
            ) : (
              <button
                className="action-button twitter-btn"
                onClick={(e) => {
                  handleShareToX(selectedPhotoIndex);
                  e.stopPropagation();
                }}
                disabled={
                  selectedPhoto.loading || 
                  selectedPhoto.enhancing ||
                  selectedPhoto.error ||
                  !selectedPhoto.images ||
                  selectedPhoto.images.length === 0
                }
              >
                <svg fill="currentColor" width="16" height="16" viewBox="0 0 24 24"><path d="M22.46 6c-.77.35-1.6.58-2.46.67.9-.53 1.59-1.37 1.92-2.38-.84.5-1.78.86-2.79 1.07C18.27 4.49 17.01 4 15.63 4c-2.38 0-4.31 1.94-4.31 4.31 0 .34.04.67.11.99C7.83 9.09 4.16 7.19 1.69 4.23-.07 6.29.63 8.43 2.49 9.58c-.71-.02-1.38-.22-1.97-.54v.05c0 2.09 1.49 3.83 3.45 4.23-.36.1-.74.15-1.14.15-.28 0-.55-.03-.81-.08.55 1.71 2.14 2.96 4.03 3-1.48 1.16-3.35 1.85-5.37 1.85-.35 0-.69-.02-1.03-.06 1.92 1.23 4.2 1.95 6.67 1.95 8.01 0 12.38-6.63 12.38-12.38 0-.19 0-.38-.01-.56.85-.61 1.58-1.37 2.16-2.24z"/></svg>
                {tezdevTheme !== 'off' ? 'Get your print!' : 'Share'}
              </button>
            )}

          {/* Download Framed Button - Always show */}
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
            Framed
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

          {/* Enhanced Enhance Button with Undo/Redo functionality */}
          <div className="enhance-button-container">
            {photos[selectedPhotoIndex].enhanced ? (
              <div className="enhance-buttons-group">
                <button
                  className="action-button enhance-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    
                    if (selectedPhotoIndex !== null) {
                      undoEnhancement({
                        photoIndex: selectedPhotoIndex,
                        subIndex: selectedSubIndex || 0,
                        setPhotos,
                        clearFrameCache: clearFrameCacheForPhoto
                      });
                    }
                  }}
                  disabled={photos[selectedPhotoIndex].loading || photos[selectedPhotoIndex].enhancing || photos[selectedPhotoIndex].error}
                >
                  ↩️ Undo
                </button>
                <button
                  className={`action-button enhance-btn ${photos[selectedPhotoIndex].enhancing ? 'loading' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    
                    if (photos[selectedPhotoIndex].enhancing) return;
                    // Show the enhance options dropdown (Krea/Kontext)
                    setShowEnhanceDropdown(prev => !prev);
                  }}
                  disabled={photos[selectedPhotoIndex].loading || photos[selectedPhotoIndex].enhancing}
                >
                  <span>✨ {photos[selectedPhotoIndex].enhancing ? 
                    (photos[selectedPhotoIndex].enhancementProgress !== undefined ? 
                      `Enhancing ${Math.round((photos[selectedPhotoIndex].enhancementProgress || 0) * 100)}%` : 
                      'Enhancing') : 
                    'Enhance'}</span>
                </button>
              </div>
            ) : photos[selectedPhotoIndex].canRedo ? (
              // Show both Redo and Enhance buttons when redo is available
              <div className="enhance-buttons-group">
                <button
                  className="action-button enhance-btn redo-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    
                    if (selectedPhotoIndex !== null) {
                      redoEnhancement({
                        photoIndex: selectedPhotoIndex,
                        subIndex: selectedSubIndex || 0,
                        setPhotos,
                        clearFrameCache: clearFrameCacheForPhoto
                      });
                    }
                  }}
                  disabled={photos[selectedPhotoIndex].loading || photos[selectedPhotoIndex].enhancing}
                >
                  ↪️ Redo
                </button>
                <button
                  className={`action-button enhance-btn ${photos[selectedPhotoIndex].enhancing ? 'loading' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    
                    // Prevent double-clicking by checking if already enhancing
                    if (photos[selectedPhotoIndex].enhancing) {
                      console.log('[ENHANCE] Already enhancing, ignoring click');
                      return;
                    }
                    
                    // Show dropdown menu (same as single enhance button)
                    setShowEnhanceDropdown(prev => !prev);
                  }}
                  disabled={photos[selectedPhotoIndex].loading || photos[selectedPhotoIndex].enhancing}
                >
                  <span>✨ {photos[selectedPhotoIndex].enhancing ? 
                    (photos[selectedPhotoIndex].enhancementProgress !== undefined ? 
                      `Enhancing ${Math.round((photos[selectedPhotoIndex].enhancementProgress || 0) * 100)}%` : 
                      'Enhancing') : 
                    'Enhance'}</span>
                </button>
              </div>
            ) : (
              <button
                className={`action-button enhance-btn ${photos[selectedPhotoIndex].enhancing ? 'loading' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  
                  // Prevent double-clicking by checking if already enhancing
                  if (photos[selectedPhotoIndex].enhancing) {
                    console.log('[ENHANCE] Already enhancing, ignoring click');
                    return;
                  }
                  
                  // Show dropdown menu
                  setShowEnhanceDropdown(prev => !prev);
                }}
                disabled={photos[selectedPhotoIndex].loading || photos[selectedPhotoIndex].enhancing}
              >
                <span>✨ {photos[selectedPhotoIndex].enhancing ? 
                  (photos[selectedPhotoIndex].enhancementProgress !== undefined ? 
                    `Enhancing ${Math.round((photos[selectedPhotoIndex].enhancementProgress || 0) * 100)}%` : 
                    'Enhancing') : 
                  'Enhance'}</span>
              </button>
            )}

            {/* Enhancement Options Dropdown rendered in a portal to escape any stacking context */}
            {showEnhanceDropdown && !photos[selectedPhotoIndex].enhancing && createPortal(
              (
                <div 
                  key="enhance-dropdown-stable"
                  className="enhance-dropdown rainbow-popup"
                  style={{
                    position: 'fixed',
                    bottom: (() => {
                      // Position dropdown above the enhance button
                      const enhanceButton = document.querySelector('.enhance-button-container');
                      if (enhanceButton) {
                        const rect = enhanceButton.getBoundingClientRect();
                        return window.innerHeight - rect.top + 10; // 10px gap above the button
                      }
                      return 88; // fallback
                    })(),
                    left: (() => {
                      // Position dropdown aligned with the enhance button
                      const enhanceButton = document.querySelector('.enhance-button-container');
                      if (enhanceButton) {
                        const rect = enhanceButton.getBoundingClientRect();
                        const dropdownWidth = 310;
                        let leftPos = rect.left + (rect.width / 2) - (dropdownWidth / 2);
                        
                        // Ensure dropdown doesn't go off-screen
                        if (leftPos < 10) leftPos = 10;
                        if (leftPos + dropdownWidth > window.innerWidth - 10) {
                          leftPos = window.innerWidth - dropdownWidth - 10;
                        }
                        
                        return leftPos;
                      }
                      return '50%'; // fallback
                    })(),
                    transform: (() => {
                      const enhanceButton = document.querySelector('.enhance-button-container');
                      return enhanceButton ? 'none' : 'translateX(-50%)'; // Only center if no button found
                    })(),
                    background: 'transparent',
                    animation: 'none',
                    boxShadow: 'none',
                    overflow: 'visible',
                    zIndex: 9999999,
                    minWidth: '280px',
                    borderRadius: '0',
                    border: 'none',
                    backdropFilter: 'none',
                    color: 'white',
                    fontWeight: 'bold',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  <button
                    className="dropdown-option rainbow-option"
                    ref={enhanceButton1Ref}
                    onClick={(e) => { e.stopPropagation(); setShowEnhanceDropdown(false); handleEnhanceWithKrea(); }}
                    style={{
                      width: 'calc(100% + 60px)',
                      padding: '16px 20px 16px 20px',
                      paddingRight: '80px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #ff0080, #ff8c00, #40e0d0, #9370db, #ff69b4, #00ff7f)',
                      backgroundSize: '300% 300%',
                      animation: 'rainbow-shift 3s ease-in-out infinite',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '15px',
                      fontWeight: '600',
                      transition: 'all 0.3s ease',
                      borderRadius: '20px 0 0 20px',
                      margin: '12px 8px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                      color: 'white',
                      textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
                      position: 'relative',
                      overflow: 'hidden',
                      backdropFilter: 'blur(5px)',
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #ff0080, #ff8c00, #40e0d0, #9370db, #ff69b4, #00ff7f)';
                      e.currentTarget.style.backgroundSize = '200% 200%';
                      e.currentTarget.style.animation = 'rainbow-shift 1.5s ease-in-out infinite';
                      e.currentTarget.style.transform = 'translateY(-6px) translateX(8px) scale(1.08) rotate(1deg)';
                      e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
                      e.currentTarget.style.fontSize = '16px';
                      e.currentTarget.style.fontWeight = '700';
                      e.currentTarget.style.letterSpacing = '0.5px';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #ff0080, #ff8c00, #40e0d0, #9370db, #ff69b4, #00ff7f)';
                      e.currentTarget.style.backgroundSize = '300% 300%';
                      e.currentTarget.style.animation = 'rainbow-shift 3s ease-in-out infinite';
                      e.currentTarget.style.transform = 'translateY(0) translateX(0) scale(1) rotate(0deg)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
                      e.currentTarget.style.fontSize = '15px';
                      e.currentTarget.style.fontWeight = '600';
                      e.currentTarget.style.letterSpacing = '0px';
                    }}
                  >
                    ✨ One-click image enhance
                  </button>
                  <button
                    className="dropdown-option rainbow-option"
                    ref={enhanceButton2Ref}
                    onClick={(e) => { e.stopPropagation(); setShowEnhanceDropdown(false); handleEnhanceWithKontext(); }}
                    style={{
                      width: 'calc(100% + 60px)',
                      padding: '16px 20px 16px 20px',
                      paddingRight: '80px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #ff0080, #ff8c00, #40e0d0, #9370db, #ff69b4, #00ff7f)',
                      backgroundSize: '300% 300%',
                      animation: 'rainbow-shift 3s ease-in-out infinite',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '15px',
                      fontWeight: '600',
                      transition: 'all 0.3s ease',
                      borderRadius: '20px 0 0 20px',
                      margin: '12px 8px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                      color: 'white',
                      textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
                      position: 'relative',
                      overflow: 'hidden',
                      backdropFilter: 'blur(5px)',
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #ff0080, #ff8c00, #40e0d0, #9370db, #ff69b4, #00ff7f)';
                      e.currentTarget.style.backgroundSize = '200% 200%';
                      e.currentTarget.style.animation = 'rainbow-shift 1.5s ease-in-out infinite';
                      e.currentTarget.style.transform = 'translateY(-6px) translateX(8px) scale(1.08) rotate(1deg)';
                      e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
                      e.currentTarget.style.fontSize = '16px';
                      e.currentTarget.style.fontWeight = '700';
                      e.currentTarget.style.letterSpacing = '0.5px';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #ff0080, #ff8c00, #40e0d0, #9370db, #ff69b4, #00ff7f)';
                      e.currentTarget.style.backgroundSize = '300% 300%';
                      e.currentTarget.style.animation = 'rainbow-shift 3s ease-in-out infinite';
                      e.currentTarget.style.transform = 'translateY(0) translateX(0) scale(1) rotate(0deg)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
                      e.currentTarget.style.fontSize = '15px';
                      e.currentTarget.style.fontWeight = '600';
                      e.currentTarget.style.letterSpacing = '0px';
                    }}
                  >
                    🎨 Transform image with words
                  </button>
                </div>
              ),
              document.body
            )}
            
            {/* Error message */}
            {photos[selectedPhotoIndex].enhancementError && (
              <div 
                className="enhancement-error" 
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '0',
                  right: '0',
                  marginBottom: '4px',
                  background: 'rgba(255, 0, 0, 0.9)',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  textAlign: 'center',
                  zIndex: 10,
                  maxWidth: '200px',
                  wordWrap: 'break-word',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  // Allow users to dismiss error by clicking
                  setPhotos(prev => {
                    const updated = [...prev];
                    if (updated[selectedPhotoIndex]) {
                      updated[selectedPhotoIndex] = {
                        ...updated[selectedPhotoIndex],
                        enhancementError: null
                      };
                    }
                    return updated;
                  });
                }}
                title="Click to dismiss"
              >
                {selectedPhoto.enhancementError}
              </div>
            )}
          </div>
        </div>
        );
      })()}
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

      {/* Prompt Selector Mode Header */}
      {isPromptSelectorMode && (
        <div className="prompt-selector-header" style={{
          padding: '24px 20px 0px',
          background: 'transparent',
          position: 'relative'
        }}>

          {/* PHOTOBOOTH STYLE EXPLORER Title */}
          <div style={{
            position: 'absolute',
            top: '0px',
            left: '20px',
            zIndex: 1000
          }}>
            <h1 
              className="settings-title"
              data-text="STYLE EXPLORER"
              style={{
                margin: '0',
                textAlign: 'left',
                transform: 'translateY(0)',
                opacity: 1
              }}
            >
              STYLE EXPLORER
            </h1>
          </div>

          {/* Workflow Options */}
          <div style={{
            marginBottom: '16px',
            marginTop: '20px'
          }}>
            <h2 style={{
              fontFamily: '"Permanent Marker", cursive',
              fontSize: '20px',
              margin: '0 0 12px 0',
              textAlign: 'center'
            }}>
              Choose a Random Style Mode
            </h2>
            
            {/* Random Style Buttons */}
            <div style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '30px',
              flexWrap: 'wrap',
              justifyContent: 'center'
            }}>
              <button 
                onClick={onRandomMixSelect}
                style={{
                  background: selectedStyle === 'randomMix' ? 'rgba(114, 227, 242, 0.9)' : (isExtensionMode ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.9)'),
                  border: selectedStyle === 'randomMix' ? '3px solid #72e3f2' : '3px solid transparent',
                  borderRadius: '20px',
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: selectedStyle === 'randomMix' ? '0 4px 12px rgba(114, 227, 242, 0.4)' : '0 2px 8px rgba(0, 0, 0, 0.1)',
                  color: selectedStyle === 'randomMix' ? 'white' : '#333',
                  fontSize: '12px',
                  fontFamily: '"Permanent Marker", cursive'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
                }}
              >
                <span>🎲</span>
                <span>Random Mix</span>
              </button>
              
              {!isFluxKontextModel(selectedModel) && (
                <button 
                  onClick={onRandomSingleSelect}
                  style={{
                    background: selectedStyle === 'random' ? 'rgba(114, 227, 242, 0.9)' : (isExtensionMode ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.9)'),
                    border: selectedStyle === 'random' ? '3px solid #72e3f2' : '3px solid transparent',
                    borderRadius: '20px',
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: selectedStyle === 'random' ? '0 4px 12px rgba(114, 227, 242, 0.4)' : '0 2px 8px rgba(0, 0, 0, 0.1)',
                    color: selectedStyle === 'random' ? 'white' : '#333',
                    fontSize: '12px',
                    fontFamily: '"Permanent Marker", cursive'
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
                  }}
                >
                  <span>🔀</span>
                  <span>Random Single</span>
                </button>
              )}
              
              <button 
                onClick={onOneOfEachSelect}
                style={{
                  background: selectedStyle === 'oneOfEach' ? 'rgba(114, 227, 242, 0.9)' : (isExtensionMode ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.9)'),
                  border: selectedStyle === 'oneOfEach' ? '3px solid #72e3f2' : '3px solid transparent',
                  borderRadius: '20px',
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: selectedStyle === 'oneOfEach' ? '0 4px 12px rgba(114, 227, 242, 0.4)' : '0 2px 8px rgba(0, 0, 0, 0.1)',
                  color: selectedStyle === 'oneOfEach' ? 'white' : '#333',
                  fontSize: '12px',
                  fontFamily: '"Permanent Marker", cursive'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
                }}
              >
                <span>🙏</span>
                <span>One of Each</span>
              </button>
              
              <button 
                onClick={onCustomSelect}
                style={{
                  background: selectedStyle === 'custom' ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' : 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
                  border: selectedStyle === 'custom' ? '3px solid #3b82f6' : '3px solid transparent',
                  borderRadius: '20px',
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: selectedStyle === 'custom' ? '0 4px 15px rgba(59, 130, 246, 0.5)' : '0 3px 10px rgba(59, 130, 246, 0.3)',
                  color: 'white',
                  fontSize: '12px',
                  fontFamily: '"Permanent Marker", cursive',
                  fontWeight: '600'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 5px 15px rgba(59, 130, 246, 0.4)';
                  e.currentTarget.style.background = 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 3px 10px rgba(59, 130, 246, 0.3)';
                  e.currentTarget.style.background = selectedStyle === 'custom' ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' : 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)';
                }}
              >
                <span>✏️</span>
                <span>Custom...</span>
              </button>
            </div>
          </div>

          {/* Theme Filters - Only show for non-Flux models */}
          {!isFluxKontextModel(selectedModel) && showThemeFilters && (
            <div style={{
              background: 'transparent',
              borderRadius: '12px',
              overflow: 'hidden',
              marginBottom: '8px',
              padding: '0 8px'
            }}>
              {/* Theme filter content - only show when expanded */}
              {showThemeFilters && (
                <div style={{
                  padding: '8px 0',
                  borderTop: 'none'
                }}>                 
                  {/* Select All/Deselect All buttons */}
                  <div style={{
                    display: 'flex',
                    gap: '8px',
                    marginTop: '4px',
                    marginBottom: '8px'
                  }}>
                    <button
                      onClick={() => {
                        const allSelected = Object.fromEntries(
                          Object.keys(THEME_GROUPS).map(groupId => [groupId, true])
                        );
                        setThemeGroupState(allSelected);
                        saveThemeGroupPreferences(allSelected);
                        if (onThemeChange) {
                          onThemeChange(allSelected);
                        }
                      }}
                      style={{
                        border: 'none',
                        borderRadius: '8px',
                        padding: '6px 10px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'white',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => {
                        const allDeselected = Object.fromEntries(
                          Object.keys(THEME_GROUPS).map(groupId => [groupId, false])
                        );
                        setThemeGroupState(allDeselected);
                        saveThemeGroupPreferences(allDeselected);
                        if (onThemeChange) {
                          onThemeChange(allDeselected);
                        }
                      }}
                      style={{
                        borderRadius: '8px',
                        padding: '6px 10px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'white',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      Deselect All
                    </button>
                  </div>
                  
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '8px'
                  }}>
                    {Object.entries(THEME_GROUPS).map(([groupId, group]) => (
                      <label key={groupId} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        background: isExtensionMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.2)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        color: 'white'
                      }}>
                        <input
                          type="checkbox"
                          checked={themeGroupState[groupId]}
                          onChange={() => handleThemeGroupToggle(groupId)}
                          style={{
                            width: '16px',
                            height: '16px',
                            accentColor: '#72e3f2'
                          }}
                        />
                        <span style={{ flex: 1, fontWeight: 600, fontSize: '12px' }}>{group.name}</span>
                        <span style={{ fontSize: '10px', opacity: 0.7 }}>({group.prompts.length})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}


      {/* Filter Styles Button and text - aligned on same line for prompt selector mode */}
      {isPromptSelectorMode && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          paddingRight: '32px',
          paddingLeft: '32px',
          paddingBottom: '8px',
          marginBottom: '0px',
          position: 'relative',
          gap: '12px'
        }} className="style-selector-text-container">
          {/* Search icon and inline input on the left */}
          <div style={{
            position: 'absolute',
            left: '22px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <button 
              onClick={() => setShowSearchInput(!showSearchInput)}
              style={{
                paddingTop: '8px',
                fontSize: '16px',
                fontWeight: 500,
                display: 'inline-block',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                background: 'none',
                border: 'none',
                color: showSearchInput ? '#72e3f2' : 'white',
                opacity: showSearchInput ? 1 : 0.8
              }}
              title="Search styles"
            >
              🔍
            </button>
            
            {/* Inline search input */}
            {showSearchInput && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="text"
                  placeholder="Search styles..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '180px',
                    padding: '6px 10px',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    background: isExtensionMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '6px',
                    color: 'white',
                    outline: 'none',
                    transition: 'all 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.target.style.background = 'rgba(255, 255, 255, 0.15)';
                    e.target.style.borderColor = '#72e3f2';
                  }}
                  onBlur={(e) => {
                    e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                    e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                  }}
                  autoFocus
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    style={{
                      padding: '4px 6px',
                      fontSize: '11px',
                      background: isExtensionMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.2)',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      borderRadius: '3px',
                      color: 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      lineHeight: 1
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'rgba(255, 255, 255, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'rgba(255, 255, 255, 0.2)';
                    }}
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>
          
          <span style={{
            fontSize: '20px',
            fontFamily: '"Permanent Marker", cursive',
            opacity: showSearchInput ? 0 : 1,
            visibility: showSearchInput ? 'hidden' : 'visible',
            transition: 'opacity 0.2s ease, visibility 0.2s ease'
          }}>
            Or select a style ↓
          </span>
          <button 
            onClick={() => setShowThemeFilters(!showThemeFilters)}
            style={{
              position: 'absolute',
              right: '22px',
              paddingTop: '8px',
              fontSize: '14px',
              fontWeight: 500,
              display: 'inline-block',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              background: 'none',
              border: 'none',
              fontFamily: '"Permanent Marker", cursive',
              color: 'white'
            }}
          >
            Filter ({filteredPhotos.length})
          </button>
        </div>
      )}

      {/* Photo Grid - full width for both modes */}
      <div 
        className={`film-strip-content ${selectedPhotoIndex === null ? '' : 'has-selected'} ${isPromptSelectorMode ? 'prompt-selector-mode' : ''}`} 
        style={{
          display: 'grid',
          // Remove inline gridTemplateColumns to let CSS media queries work
          gap: '32px',
          justifyItems: 'center',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          maxWidth: 'none',
          margin: '0 auto',
          padding: isPromptSelectorMode ? '4px 32px 32px' : '32px',
          paddingTop: isPromptSelectorMode ? '4px' : undefined,
          // Force override the CSS !important rule
          ...(isPromptSelectorMode && {
            paddingTop: '4px !important'
          })
        }}
      >
        {(isPromptSelectorMode ? filteredPhotos : photos).map((photo, index) => {
          const isSelected = index === selectedPhotoIndex;
          const isReference = photo.isOriginal;
          const placeholderUrl = photo.originalDataUrl;
          const progress = Math.floor(photo.progress || 0);
          const loadingLabel = progress > 0 ? `${progress}%` : "";
          const labelText = isReference ? "Reference" : 
            photo.isGalleryImage && photo.promptDisplay ? photo.promptDisplay : 
            (getStyleDisplayText(photo) ? `#${index-keepOriginalPhoto+1}` : '#SogniPhotobooth');
          // Check if this photo represents the currently selected style
          const isCurrentStyle = isPromptSelectorMode && photo.promptKey && photo.promptKey === selectedStyle;
          // Loading or error state
          if ((photo.loading && photo.images.length === 0) || (photo.error && photo.images.length === 0)) {
            return (
              <div
                key={photo.id}
                className={`film-frame loading ${isSelected ? 'selected' : ''} ${isCurrentStyle ? 'current-style' : ''} ${photo.newlyArrived ? 'newly-arrived' : ''} ${photo.hidden ? 'hidden' : ''} ${isSelected && isThemeSupported() && !photo.isGalleryImage && tezdevTheme === 'supercasual' ? 'super-casual-theme' : ''} ${isSelected && isThemeSupported() && !photo.isGalleryImage && tezdevTheme === 'tezoswebx' ? 'tezos-webx-theme' : ''} ${isSelected && isThemeSupported() && !photo.isGalleryImage && tezdevTheme === 'showup' ? 'showup-theme' : ''} ${isSelected && isThemeSupported() && !photo.isGalleryImage ? `${tezdevTheme}-theme` : ''}`}
                data-enhancing={photo.enhancing ? 'true' : undefined}
                data-error={photo.error ? 'true' : undefined}
                data-enhanced={photo.enhanced ? 'true' : undefined}
  
                onClick={() => {
                  // In prompt selector mode, just show selected state - don't immediately set style
                  isSelected ? setSelectedPhotoIndex(null) : setSelectedPhotoIndex(index);
                }}
                style={{
                  width: '100%',
                  margin: '0 auto',
                  backgroundColor: 'white', // Keep polaroid frames white even in extension mode
                  position: 'relative',
                  borderRadius: '2px',
                  boxShadow: isExtensionMode ? '0 4px 12px rgba(0, 0, 0, 0.5)' : '0 4px 12px rgba(0, 0, 0, 0.3)',
                  display: photo.hidden ? 'none' : 'flex',
                  flexDirection: 'column',
                  '--stagger-delay': `${index * 1}s` // Add staggered delay based on index
                }}
              >
                <div style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: dynamicStyle.aspectRatio,
                  overflow: 'hidden'
                }}>
                  <PlaceholderImage placeholderUrl={placeholderUrl} />
                  
                  {/* Hide button for loading/error state - only show on hover for grid photos */}
                  {!isSelected && !photo.isOriginal && !photo.isGalleryImage && (
                    <button
                      className="photo-hide-btn"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setPhotos(prev => {
                          const updated = [...prev];
                          if (updated[index]) {
                            updated[index] = {
                              ...updated[index],
                              hidden: true
                            };
                          }
                          return updated;
                        });
                      }}
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        background: 'rgba(0, 0, 0, 0.7)',
                        color: 'white',
                        border: 'none',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 999,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                        transition: 'all 0.2s ease',
                        opacity: '0',
                        transform: 'scale(0.8)'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 0, 0, 0.9)';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                        e.currentTarget.style.transform = 'scale(0.8)';
                      }}
                      title="Hide this image"
                    >
                      ×
                    </button>
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
                      : photo.isGalleryImage ? labelText : (photo.statusText || (labelText + (getStyleDisplayText(photo) ? ` ${getStyleDisplayText(photo)}` : '')))}
                </div>
              </div>
            );
          }
          // Show completed image - prefer enhanced image if available
          const thumbUrl = (photo.enhanced && photo.enhancedImageUrl) ? photo.enhancedImageUrl : (photo.images[0] || '');
          // Determine if photo is fully loaded - simplified condition for better theme switching  
          const isLoaded = (!photo.loading && !photo.generating && photo.images.length > 0 && thumbUrl);
          
          return (
            <div 
              key={photo.id}
              className={`film-frame ${isSelected ? 'selected' : ''} ${isCurrentStyle ? 'current-style' : ''} ${photo.loading ? 'loading' : ''} ${isLoaded ? 'loaded' : ''} ${photo.newlyArrived ? 'newly-arrived' : ''} ${photo.hidden ? 'hidden' : ''} ${isSelected && isThemeSupported() && !photo.isGalleryImage && tezdevTheme === 'supercasual' ? 'super-casual-theme' : ''} ${isSelected && isThemeSupported() && !photo.isGalleryImage && tezdevTheme === 'tezoswebx' ? 'tezos-webx-theme' : ''} ${isSelected && isThemeSupported() && !photo.isGalleryImage && tezdevTheme === 'taipeiblockchain' ? 'taipei-blockchain-theme' : ''} ${isSelected && isThemeSupported() && !photo.isGalleryImage && tezdevTheme === 'showup' ? 'showup-theme' : ''} ${isSelected && isThemeSupported() && !photo.isGalleryImage ? `${tezdevTheme}-theme` : ''}`}
              onClick={e => isSelected ? handlePhotoViewerClick(e) : handlePhotoSelect(index, e)}
              data-enhancing={photo.enhancing ? 'true' : undefined}
              data-error={photo.error ? 'true' : undefined}
              data-enhanced={photo.enhanced ? 'true' : undefined}

              style={{
                width: '100%',
                margin: '0 auto',
                backgroundColor: 'white', // Keep polaroid frames white even in extension mode
                position: 'relative',
                borderRadius: '2px',
                boxShadow: isExtensionMode ? '0 4px 12px rgba(0, 0, 0, 0.5)' : '0 4px 12px rgba(0, 0, 0, 0.3)',
                display: photo.hidden ? 'none' : 'flex',
                flexDirection: 'column'
              }}
            >
              <div style={{
                position: 'relative',
                width: '100%',
                aspectRatio: dynamicStyle.aspectRatio,
                overflow: 'hidden'
              }}>
                <img 
                  key={`${photo.id}-${photo.isPreview ? 'preview' : 'final'}`} // Force re-render when preview state changes
                  className={`${isSelected && photo.enhancing && photo.isPreview ? 'enhancement-preview-selected' : ''}`}
                  src={(() => {
                    // For selected photos with supported themes OR QR watermark enabled, use composite framed image if available
                    // Skip custom theme framing for gallery images, but allow basic polaroid frames
                    if (isSelected && (isThemeSupported() || settings.sogniWatermark) && !photo.isGalleryImage) {
                      const currentSubIndex = photo.enhanced && photo.enhancedImageUrl 
                        ? -1 // Special case for enhanced images
                        : (selectedSubIndex || 0);
                      const photoTaipeiFrameNumber = photo.taipeiFrameNumber || 1;
                      const frameKey = `${index}-${currentSubIndex}-${tezdevTheme}-${photoTaipeiFrameNumber}-${outputFormat}-${aspectRatio}`;
                      const framedImageUrl = framedImageUrls[frameKey];
                      const isGeneratingFrame = generatingFrames.has(frameKey);
                      
                      if (framedImageUrl) {
                        // Clear previous framed image since we have the new one
                        if (previousFramedImage) {
                          setPreviousFramedImage(null);
                        }
                        return framedImageUrl;
                      }
                      
                      // If we're generating a frame and have a previous framed image, use that to prevent flicker
                      if (isGeneratingFrame && previousFramedImage) {
                        return previousFramedImage;
                      }
                      
                      // Fall back to original image
                      return thumbUrl;
                    }
                    // Default to original image
                    return thumbUrl;
                  })()}
                  alt={`Generated #${index}`}
                  onLoad={e => {
                    // Enable mobile-optimized download functionality when image loads
                    enableMobileImageDownload(e.target);
                    
                    // Remove fade-in animation to prevent post-load pulse
                    const img = e.target;
                    if (!img.classList.contains('fade-in-complete')) {
                      img.classList.add('fade-in-complete');
                      
                      // For newly arrived photos, delay opacity setting to allow transition
                      // BUT: Don't set inline opacity on placeholder images during loading - let CSS animation control it
                      if (img.classList.contains('placeholder') && photo.loading) {
                        // Skip opacity setting for loading placeholders - CSS animation controls this
                        console.log('Skipping inline opacity for loading placeholder - CSS animation controls it');
                      } else if (photo.newlyArrived) {
                        // For preview images, use a faster transition to handle rapid updates
                        const transitionDelay = photo.isPreview ? 5 : 10;
                        // Start with opacity 0.01 (almost invisible but not completely transparent)
                        // This prevents white background from showing while keeping transition smooth
                        img.style.opacity = '0.01';
                        setTimeout(() => {
                          img.style.opacity = photo.isPreview ? '0.25' : '1';
                          // Add smooth transition for preview updates
                          if (photo.isPreview) {
                            img.style.transition = 'opacity 0.2s ease-in-out';
                          }
                        }, transitionDelay);
                      } else {
                        // Set opacity immediately without animation to prevent pulse
                        const targetOpacity = photo.isPreview ? '0.25' : '1';
                        img.style.opacity = targetOpacity;
                        

                        
                        // Add smooth transition for preview updates
                        if (photo.isPreview) {
                          img.style.transition = 'opacity 0.2s ease-in-out';
                        } else {
                          // Remove transition for final images to ensure immediate full opacity
                          img.style.transition = 'none';
                        }
                      }
                    }
                  }}
                  onError={e => {
                    // Prevent infinite reload loops for gallery images
                    if (photo.isGalleryImage) {
                      // For gallery images, use placeholder instead of retrying
                      e.target.src = '/placeholder-no-preview.svg';
                      e.target.style.opacity = '0.7';
                      e.target.classList.add('fallback', 'gallery-fallback');
                      console.log(`Gallery image failed to load: ${photo.expectedFilename || 'unknown'}`);
                      return;
                    }
                    
                    // For regular photos, try fallback to originalDataUrl if different
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
                  style={(() => {
                    const baseStyle = {
                      objectFit: 'cover',
                      position: 'relative',
                      display: 'block',
                      opacity: 0, // Start invisible, will be set to 1 immediately via onLoad without transition
                      // Add strong anti-aliasing for crisp thumbnail rendering
                      imageRendering: 'high-quality',
                      WebkitImageSmoothing: true,
                      MozImageSmoothing: true,
                      msImageSmoothing: true,
                      imageSmoothing: true
                    };

                    // For selected photos during enhancement, maintain original dimensions to prevent Polaroid frame shrinking
                    if (isSelected && photo.enhancing && photo.isPreview) {
                      return {
                        ...baseStyle,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        // Override the CSS that sets width/height to auto for selected images
                        minWidth: '100%',
                        minHeight: '100%'
                      };
                    }
                    
                    // For supported themes with frame padding, account for the border
                    // Skip custom theme framing for gallery images, but allow basic polaroid frames
                    if (isSelected && isThemeSupported() && !photo.isGalleryImage) {
                      // Check if we have a composite framed image - if so, use full size
                      const currentSubIndex = photo.enhanced && photo.enhancedImageUrl 
                        ? -1 // Special case for enhanced images
                        : (selectedSubIndex || 0);
                      const photoTaipeiFrameNumber = photo.taipeiFrameNumber || 1;
                      const frameKey = `${index}-${currentSubIndex}-${tezdevTheme}-${photoTaipeiFrameNumber}-${outputFormat}-${aspectRatio}`;
                      const hasFramedImage = framedImageUrls[frameKey];
                      const isGeneratingFrame = generatingFrames.has(frameKey);
                      
                      if (!hasFramedImage) {
                        // No composite image yet, so check for frame padding and adjust
                        // Use cached frame padding from photo data or get it dynamically
                        const framePadding = photo.framePadding || 0;
                        if (framePadding > 0) {
                          const borderPercent = `${framePadding}px`;
                          return {
                            ...baseStyle,
                            width: `calc(100% - ${framePadding * 2}px)`,
                            height: `calc(100% - ${framePadding * 2}px)`,
                            top: borderPercent,
                            left: borderPercent,
                            // Add a subtle loading state when framed image is not ready
                            filter: isGeneratingFrame ? 'brightness(0.8) saturate(0.8)' : 'brightness(0.9) saturate(0.9)',
                            transition: 'filter 0.3s ease'
                          };
                        } else {
                          // No frame padding but still loading framed image
                          return {
                            ...baseStyle,
                            filter: isGeneratingFrame ? 'brightness(0.8) saturate(0.8)' : 'brightness(0.9) saturate(0.9)',
                            transition: 'filter 0.3s ease'
                          };
                        }
                      } else {
                        // Framed image is ready, remove any loading effects
                        return {
                          ...baseStyle,
                          filter: 'none',
                          transition: 'filter 0.3s ease'
                        };
                      }
                    }
                    
                    // Default styling for all other cases
                    return {
                      ...baseStyle,
                      width: '100%',
                      top: 0,
                      left: 0
                    };
                  })()}
                />
                
                {/* Event Theme Overlays - Only show on selected (popup) view when theme is supported and not using composite framed image */}
                {(() => {
                  // Only show theme overlays if we don't have a composite framed image
                  // Skip custom theme overlays for gallery images, but allow basic polaroid frames
                  if (!thumbUrl || !isLoaded || !isSelected || !isThemeSupported() || photo.isGalleryImage) {
                    return null;
                  }
                  
                  // Check if we have a composite framed image for this photo
                  const currentSubIndex = photo.enhanced && photo.enhancedImageUrl 
                    ? -1 // Special case for enhanced images
                    : (selectedSubIndex || 0);
                  const photoTaipeiFrameNumber = photo.taipeiFrameNumber || 1;
                  const frameKey = `${index}-${currentSubIndex}-${tezdevTheme}-${photoTaipeiFrameNumber}-${outputFormat}-${aspectRatio}`;
                  
                  // If we have a composite framed image, don't show theme overlays
                  if (framedImageUrls[frameKey]) {
                    return null;
                  }
                  
                  // Show theme overlays
                  return (
                  <>

                    {/* Super Casual Full Frame Overlay - only for narrow (2:3) aspect ratio */}
                    {tezdevTheme === 'supercasual' && aspectRatio === 'narrow' && (
                      <img
                        src="/events/super-casual.png"
                        alt="Super Casual Frame"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          objectPosition: 'center',
                          pointerEvents: 'none',
                          zIndex: 2
                        }}
                      />
                    )}
                    
                    {/* Tezos WebX Full Frame Overlay - only for narrow (2:3) aspect ratio */}
                    {tezdevTheme === 'tezoswebx' && aspectRatio === 'narrow' && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          backgroundImage: `url(/events/tz_webx.png)`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          backgroundRepeat: 'no-repeat',
                          pointerEvents: 'none',
                          zIndex: 2
                        }}
                      />
                    )}
                    
                    {/* Taipei Blockchain Week Full Frame Overlay - only for narrow (2:3) aspect ratio */}
                    {tezdevTheme === 'taipeiblockchain' && aspectRatio === 'narrow' && (
                      <img
                        src={`/events/taipei-blockchain-2025/narrow_${photo.taipeiFrameNumber || 1}.png`}
                        alt="Taipei Blockchain Week Frame"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          objectPosition: 'center',
                          pointerEvents: 'none',
                          zIndex: 2
                        }}
                      />
                    )}
                    

                  </>
                  );
                })()}
                
                {/* QR Code Overlay for Kiosk Mode */}
                {qrCodeData && qrCodeData.photoIndex === index && qrCodeDataUrl && isSelected && (
                  <div 
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 9999,
                      cursor: 'pointer'
                    }}
                    onClick={onCloseQR}
                  >
                    <div 
                      style={{
                        backgroundColor: isExtensionMode ? 'rgba(255, 255, 255, 0.95)' : 'white',
                        padding: '20px',
                        borderRadius: '12px',
                        textAlign: 'center',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      <h3 style={{ 
                        margin: '0 0 16px 0', 
                        color: '#333',
                        fontSize: '18px',
                        fontWeight: '600'
                      }}>
                        Scan to Share on Your Phone
                      </h3>
                      
                      {qrCodeDataUrl === 'loading' ? (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          margin: '0 auto 16px auto',
                          width: '200px',
                          height: '200px',
                          border: '2px solid #eee',
                          borderRadius: '8px',
                          justifyContent: 'center',
                          backgroundColor: '#f9f9f9'
                        }}>
                          <div style={{
                            width: '40px',
                            height: '40px',
                            border: '4px solid #e3e3e3',
                            borderTop: '4px solid #1DA1F2',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            marginBottom: '12px'
                          }}></div>
                          <div style={{
                            color: '#666',
                            fontSize: '14px',
                            fontWeight: '500'
                          }}>
                            Generating QR Code...
                          </div>
                        </div>
                      ) : (
                        <img 
                          src={qrCodeDataUrl} 
                          alt="QR Code for sharing" 
                          style={{ 
                            display: 'block',
                            margin: '0 auto 16px auto',
                            border: '2px solid #eee',
                            borderRadius: '8px'
                          }} 
                        />
                      )}

                      <button
                        onClick={onCloseQR}
                        style={{
                          background: '#1DA1F2',
                          color: 'white',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: '500'
                        }}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}

                {/* Hide button - only show on hover for grid photos (not popup) and when image is loaded */}
                {!isSelected && isLoaded && !photo.isOriginal && !photo.isGalleryImage && (
                  <button
                    className="photo-hide-btn"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setPhotos(prev => {
                        const updated = [...prev];
                        if (updated[index]) {
                          updated[index] = {
                            ...updated[index],
                            hidden: true
                          };
                        }
                        return updated;
                      });
                    }}
                    style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      background: 'rgba(0, 0, 0, 0.7)',
                      color: 'white',
                      border: 'none',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 999,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                      transition: 'all 0.2s ease',
                      opacity: '0',
                      transform: 'scale(0.8)'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(0, 0, 0, 0.9)';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                      e.currentTarget.style.transform = 'scale(0.8)';
                    }}
                    title="Hide this image"
                  >
                    ×
                  </button>
                )}
              </div>
              {/* No special label for selected view - use standard grid label below */}
              <div className="photo-label">
                {photo.loading || photo.generating ? 
                  (photo.statusText || labelText) 
                  : photo.isGalleryImage ? labelText : (photo.statusText || (labelText + (getStyleDisplayText(photo) ? ` ${getStyleDisplayText(photo)}` : '')))}
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

      {/* Custom Prompt Modal for Kontext Enhancement */}
      {showPromptModal && (
        <div 
          className="prompt-modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999999,
            padding: '20px'
          }}
          onClick={handlePromptCancel}
        >
          <div 
            className="prompt-modal"
            style={{
              background: isExtensionMode ? 'rgba(255, 255, 255, 0.95)' : 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '100%',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              position: 'relative',
              color: '#222'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{
              margin: '0 0 16px 0',
              fontSize: '18px',
              fontWeight: '600',
              color: '#333',
              textAlign: 'center'
            }}>
              Modify your image with natural language 🤗
            </h3>
            
            <textarea
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              placeholder="Type what you want to change in the picture"
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '12px',
                border: '2px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
                transition: 'border-color 0.2s ease',
                color: '#222',
                backgroundColor: '#fff'
              }}
              onFocus={e => e.target.style.borderColor = '#4bbbd3'}
              onBlur={e => e.target.style.borderColor = '#e0e0e0'}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (customPrompt.trim()) {
                    handlePromptSubmit();
                  }
                }
              }}
            />

            {/* Quick-action suggestion chips */}
            {(() => {
              const samplePrompts = [
                'Zoom way out',
                'Recreate the scene in legos',
                'Make it night time',
                'Change background to a beach',
                'Add rainbow lens flare',
                'Turn into pixel art',
                'Add hats and sunglasses',
                'Add cats and match style',
                'Add more people',
                'Make into Time Magazine cover with "The Year of AI" and "with SOGNI AI"'
              ];
              const chipBackgrounds = [
                'linear-gradient(135deg, #72e3f2, #4bbbd3)',
                'linear-gradient(135deg, #ffb6e6, #ff5e8a)',
                'linear-gradient(135deg, #ffd86f, #fc6262)',
                'linear-gradient(135deg, #a8e063, #56ab2f)',
                'linear-gradient(135deg, #f093fb, #f5576c)',
                'linear-gradient(135deg, #5ee7df, #b490ca)'
              ];
              return (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  marginTop: '12px',
                  justifyContent: 'center'
                }}>
                  {samplePrompts.map((text, idx) => (
                    <button
                      key={text}
                      onClick={() => { setCustomPrompt(text); submitPrompt(text); }}
                      style={{
                        padding: '8px 12px',
                        border: 'none',
                        borderRadius: '999px',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        background: chipBackgrounds[idx % chipBackgrounds.length],
                        boxShadow: '0 2px 6px rgba(0,0,0,0.45)'
                      }}
                      title={text}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              );
            })()}
            
            <div style={{
              display: 'flex',
              gap: '12px',
              marginTop: '20px',
              justifyContent: 'center'
            }}>
              <button
                onClick={handlePromptCancel}
                style={{
                  padding: '10px 20px',
                  border: '2px solid #ddd',
                  background: isExtensionMode ? 'rgba(255, 255, 255, 0.9)' : 'white',
                  color: '#666',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={e => {
                  e.target.style.backgroundColor = '#f5f5f5';
                  e.target.style.borderColor = '#ccc';
                }}
                onMouseOut={e => {
                  e.target.style.backgroundColor = isExtensionMode ? 'rgba(255, 255, 255, 0.9)' : 'white';
                  e.target.style.borderColor = '#ddd';
                }}
              >
                Cancel
              </button>
              
              <button
                onClick={handlePromptSubmit}
                disabled={!customPrompt.trim()}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  background: customPrompt.trim() ? 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)' : '#ccc',
                  color: 'white',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: customPrompt.trim() ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s ease',
                  opacity: customPrompt.trim() ? 1 : 0.6
                }}
                onMouseOver={e => {
                  if (customPrompt.trim()) {
                    e.target.style.transform = 'translateY(-1px)';
                    e.target.style.boxShadow = '0 4px 12px rgba(255, 107, 107, 0.3)';
                  }
                }}
                onMouseOut={e => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = 'none';
                }}
              >
                🎨 Change It!
              </button>
            </div>
          </div>
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
  redoEnhancement: PropTypes.func.isRequired,
  sogniClient: PropTypes.object.isRequired,
  desiredWidth: PropTypes.number.isRequired,
  desiredHeight: PropTypes.number.isRequired,
  selectedSubIndex: PropTypes.number,
  handleShareToX: PropTypes.func.isRequired,
  slothicornAnimationEnabled: PropTypes.bool.isRequired,
  backgroundAnimationsEnabled: PropTypes.bool,
  tezdevTheme: PropTypes.string,
  aspectRatio: PropTypes.string,
  handleRetryPhoto: PropTypes.func,
  outputFormat: PropTypes.string,
  onPreGenerateFrame: PropTypes.func, // New prop for frame pre-generation callback
  onFramedImageCacheUpdate: PropTypes.func, // New prop for framed image cache updates
  onClearQrCode: PropTypes.func, // New prop to clear QR codes when images change
  onClearMobileShareCache: PropTypes.func, // New prop to clear mobile share cache when images change
  qrCodeData: PropTypes.object,
  onCloseQR: PropTypes.func,
  onUseGalleryPrompt: PropTypes.func, // New prop to handle using a gallery prompt
  // New props for prompt selector mode
  isPromptSelectorMode: PropTypes.bool,
  selectedModel: PropTypes.string,
  onPromptSelect: PropTypes.func,
  onRandomMixSelect: PropTypes.func,
  onRandomSingleSelect: PropTypes.func,
  onOneOfEachSelect: PropTypes.func,
  onCustomSelect: PropTypes.func,
  onThemeChange: PropTypes.func,
  onBackToPhotos: PropTypes.func
};

export default PhotoGallery; 