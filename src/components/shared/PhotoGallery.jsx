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
import { trackDownloadWithStyle } from '../../services/analyticsService';
import { downloadImagesAsZip } from '../../utils/bulkDownload';

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
  onRegisterFrameCacheClear, // New prop to register frame cache clearing function
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
  initialThemeGroupState = null,
  onSearchChange = null,
  initialSearchTerm = '',
  portraitType = 'medium',
  onPortraitTypeChange = null,
  numImages = 1,
  authState = null,
  handleRefreshPhoto = null
}) => {
  // Get settings from context
  const { settings } = useApp();

  
  // State to track when to show the "more" button during generation
  const [showMoreButtonDuringGeneration, setShowMoreButtonDuringGeneration] = useState(false);

  // State to track concurrent refresh operations
  const [refreshingPhotos, setRefreshingPhotos] = useState(new Set());
  
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
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  
  // State for video overlay
  const [showVideo, setShowVideo] = useState(false);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  
  // Helper function to check if a prompt has a video easter egg
  const hasVideoEasterEgg = useCallback((promptKey) => {
    return ['jazzSaxophonist', 'kittySwarm', 'stoneMoss', 'dapperVictorian', 'prismKaleidoscope', 'apocalypseRooftop', 'anime1990s', 'nftBoredApe', 'clownPastel'].includes(promptKey);
  }, []);
  
  // Cleanup video when leaving the view
  useEffect(() => {
    if (selectedPhotoIndex === null) {
      setShowVideo(false);
      setCurrentVideoIndex(0);
    }
  }, [selectedPhotoIndex]);

  // Reset video index when video is hidden or photo changes
  useEffect(() => {
    if (!showVideo) {
      setCurrentVideoIndex(0);
    }
  }, [showVideo, selectedPhotoIndex]);

  // Update theme group state when initialThemeGroupState prop changes
  useEffect(() => {
    if (isPromptSelectorMode && initialThemeGroupState) {
      setThemeGroupState(initialThemeGroupState);
    }
  }, [isPromptSelectorMode, initialThemeGroupState]);

  // Update search term when initialSearchTerm prop changes (only from URL/parent, not local changes)
  useEffect(() => {
    if (isPromptSelectorMode) {
      setSearchTerm(initialSearchTerm);
      if (initialSearchTerm) {
        setShowSearchInput(true);
      }
    }
  }, [isPromptSelectorMode, initialSearchTerm]);

  // Keep track of the previous photos array length to detect new batches (for legacy compatibility)
  const [, setPreviousPhotosLength] = useState(0);
  
  // State for enhancement options dropdown and prompt modal
  const [showEnhanceDropdown, setShowEnhanceDropdown] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');

  // State for bulk download functionality
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [bulkDownloadProgress, setBulkDownloadProgress] = useState({ current: 0, total: 0, message: '' });

  // State for Download All button dropdown
  const [showMoreDropdown, setShowMoreDropdown] = useState(false);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showMoreDropdown && !e.target.closest('.download-all-circular-btn') && !e.target.closest('.more-dropdown-menu')) {
        setShowMoreDropdown(false);
      }
    };
    
    if (showMoreDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showMoreDropdown]);
  
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

  // Clear framed image cache when QR watermark settings change
  useEffect(() => {
    // Clean up existing blob URLs
    Object.values(framedImageUrls).forEach(url => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    setFramedImageUrls({});
  }, [settings.sogniWatermark, settings.sogniWatermarkSize, settings.sogniWatermarkMargin, settings.qrCodeUrl]);
  
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

  // Helper function to generate consistent frame keys that include QR settings
  const generateFrameKey = useCallback((photoIndex, subIndex, taipeiFrameNumber) => {
    const qrSettings = settings.sogniWatermark 
      ? `-qr${settings.sogniWatermarkSize || 94}-${settings.sogniWatermarkMargin || 16}-${encodeURIComponent(settings.qrCodeUrl || 'https://qr.sogni.ai')}`
      : '';
    return `${photoIndex}-${subIndex}-${tezdevTheme}-${taipeiFrameNumber}-${outputFormat}-${aspectRatio}${qrSettings}`;
  }, [tezdevTheme, outputFormat, aspectRatio, settings.sogniWatermark, settings.sogniWatermarkSize, settings.sogniWatermarkMargin, settings.qrCodeUrl]);

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
  
  // Function to clear all frame cache
  const clearAllFrameCache = useCallback(() => {
    console.log('Clearing all frame cache');
    setFramedImageUrls(prev => {
      // Revoke all blob URLs
      Object.values(prev).forEach(url => {
        if (url && typeof url === 'string' && url.startsWith('blob:')) {
          try { URL.revokeObjectURL(url); } catch (e) { /* no-op */ }
        }
      });
      return {};
    });
  }, []);

  // Handler to refresh a single photo - wrapper for the prop function
  const onRefreshPhoto = useCallback(async (photoIndex) => {
    if (!handleRefreshPhoto) {
      console.error('handleRefreshPhoto prop not provided');
      return;
    }

    // Mark this photo as refreshing
    setRefreshingPhotos(prev => new Set(prev).add(photoIndex));

    try {
      await handleRefreshPhoto(photoIndex, authState, refreshingPhotos);
    } finally {
      // Remove from refreshing set after completion (or failure)
      setTimeout(() => {
        setRefreshingPhotos(prev => {
          const newSet = new Set(prev);
          newSet.delete(photoIndex);
          return newSet;
        });
      }, 1000); // Delay to allow state updates to complete
    }
  }, [handleRefreshPhoto, authState, refreshingPhotos]);
  
  // Register frame cache clearing function with parent
  useEffect(() => {
    if (onRegisterFrameCacheClear) {
      onRegisterFrameCacheClear(clearAllFrameCache);
    }
  }, [onRegisterFrameCacheClear, clearAllFrameCache]);

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
    
    // Check if we can enhance
    if (selectedPhotoIndex === null) return;
    
    const photo = photos[selectedPhotoIndex];
    if (!photo || photo.enhancing) {
      console.log('[ENHANCE] Already enhancing or no photo, ignoring click');
      return;
    }
    
    // Call enhancePhoto directly without setTimeout - it will handle all state management
    enhancePhoto({
      photo: photo,
      photoIndex: selectedPhotoIndex,
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
  }, [selectedPhotoIndex, selectedSubIndex, desiredWidth, desiredHeight, sogniClient, setPhotos, outputFormat, clearFrameCacheForPhoto, activeProjectReference, enhancePhoto, photos, onClearQrCode]);

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

    // Check if we can enhance
    if (selectedPhotoIndex === null) return;
    
    const photo = photos[selectedPhotoIndex];
    if (!photo || photo.enhancing) {
      console.log('[ENHANCE] Already enhancing or no photo, ignoring Kontext enhance');
      return;
    }

    // Call enhancePhoto directly without setTimeout - it will handle all state management
    enhancePhoto({
      photo: photo,
      photoIndex: selectedPhotoIndex,
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
  }, [selectedPhotoIndex, selectedSubIndex, desiredWidth, desiredHeight, sogniClient, setPhotos, outputFormat, clearFrameCacheForPhoto, activeProjectReference, enhancePhoto, onClearQrCode, photos]);

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

  // Handle download all photos as ZIP - uses exact same logic as individual downloads
  const handleDownloadAll = useCallback(async (includeFrames = false) => {
    if (isBulkDownloading) {
      console.log('Bulk download already in progress');
      return;
    }

    try {
      setIsBulkDownloading(true);
      setBulkDownloadProgress({ current: 0, total: 0, message: 'Preparing images...' });

      // Get the correct photos array based on mode
      const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;

      // Count loaded photos
      const loadedPhotos = currentPhotosArray.filter(
        photo => !photo.loading && !photo.generating && !photo.error && photo.images && photo.images.length > 0
      );

      if (loadedPhotos.length === 0) {
        console.warn('No loaded photos to download');
        setBulkDownloadProgress({ current: 0, total: 0, message: 'No images available to download' });
        setTimeout(() => {
          setIsBulkDownloading(false);
        }, 2000);
        return;
      }

      // Ensure fonts are loaded for framed images
      if (includeFrames && !document.querySelector('link[href*="Permanent+Marker"]')) {
        const fontLink = document.createElement('link');
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);
        await document.fonts.ready;
      }

      // Prepare images array with proper processing
      const imagesToDownload = [];
      const filenameCount = {}; // Track how many times each base filename is used

      for (let i = 0; i < currentPhotosArray.length; i++) {
        const photo = currentPhotosArray[i];

        // Skip photos that are still loading or have errors
        if (photo.loading || photo.generating || photo.error || !photo.images || photo.images.length === 0) {
          continue;
        }

        setBulkDownloadProgress({ current: i, total: loadedPhotos.length, message: `Processing image ${i + 1} of ${loadedPhotos.length}...` });

        // Get the image URL (handle enhanced images) - SAME AS INDIVIDUAL
        const currentSubIndex = photo.enhanced && photo.enhancedImageUrl
          ? -1
          : (selectedSubIndex || 0);

        const imageUrl = currentSubIndex === -1
          ? photo.enhancedImageUrl
          : photo.images[currentSubIndex];

        if (!imageUrl) continue;

        // Get style display text - SAME AS INDIVIDUAL
        const styleDisplayText = getStyleDisplayText(photo);
        const cleanStyleName = styleDisplayText ? styleDisplayText.toLowerCase().replace(/\s+/g, '-') : 'sogni';

        // Process image based on frame type
        let processedImageUrl = imageUrl;
        let actualExtension = outputFormat === 'png' ? '.png' : '.jpg';

        if (includeFrames) {
          // FRAMED DOWNLOAD - USE EXACT SAME LOGIC AS handleDownloadPhoto
          try {
            const photoNumberLabel = photo?.statusText?.split('#')[0]?.trim() || '';
            const photoLabel = photoNumberLabel || styleDisplayText || '';
            
            // Check if theme is supported - SAME AS INDIVIDUAL
            const useTheme = isThemeSupported();
            const isGalleryImage = photo.isGalleryImage;
            const shouldUseTheme = useTheme && !isGalleryImage;
            
            // Truncate label for QR code space - SAME AS INDIVIDUAL
            const maxLabelLength = 20;
            const truncatedLabel = !shouldUseTheme && photoLabel.length > maxLabelLength 
              ? photoLabel.substring(0, maxLabelLength) + '...' 
              : photoLabel;

            // Create polaroid image with EXACT same options as individual download
            const polaroidUrl = await createPolaroidImage(imageUrl, !shouldUseTheme ? truncatedLabel : '', {
              tezdevTheme: shouldUseTheme ? tezdevTheme : 'off',
              aspectRatio,
              frameWidth: !shouldUseTheme ? 56 : 0,
              frameTopWidth: !shouldUseTheme ? 56 : 0,
              frameBottomWidth: !shouldUseTheme ? 150 : 0,
              frameColor: !shouldUseTheme ? 'white' : 'transparent',
              outputFormat: outputFormat,
              taipeiFrameNumber: shouldUseTheme && tezdevTheme === 'taipeiblockchain' ? photo.taipeiFrameNumber : undefined,
              watermarkOptions: settings.sogniWatermark ? getQRWatermarkConfig(settings) : null
            });

            processedImageUrl = polaroidUrl;
          } catch (error) {
            console.error(`Error creating framed image for photo ${i}:`, error);
            // Fall back to raw image if framing fails
          }
        } else {
          // RAW DOWNLOAD - USE EXACT SAME LOGIC AS handleDownloadRawPhoto
          try {
            // Detect actual format from image - SAME AS INDIVIDUAL
            if (imageUrl.startsWith('blob:') || imageUrl.startsWith('http')) {
              const response = await fetch(imageUrl);
              const contentType = response.headers.get('content-type');
              if (contentType) {
                if (contentType.includes('image/png')) {
                  actualExtension = '.png';
                } else if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) {
                  actualExtension = '.jpg';
                }
              }
            }

            // Process raw image with QR watermark if enabled - SAME AS INDIVIDUAL
            if (settings.sogniWatermark) {
              processedImageUrl = await new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                
                img.onload = async () => {
                  try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0);
                    
                    // Add QR watermark - SAME AS INDIVIDUAL
                    const { addQRWatermark } = await import('../../utils/imageProcessing.js');
                    await addQRWatermark(ctx, canvas.width, canvas.height, getQRWatermarkConfig(settings));
                    
                    const dataUrl = canvas.toDataURL(actualExtension === '.png' ? 'image/png' : 'image/jpeg', 0.95);
                    resolve(dataUrl);
                  } catch (error) {
                    console.error('Error processing raw image with watermark:', error);
                    resolve(imageUrl);
                  }
                };
                
                img.onerror = () => {
                  console.error('Error loading image for raw download processing');
                  resolve(imageUrl);
                };
                
                img.src = imageUrl;
              });
            }
          } catch (error) {
            console.error(`Error processing raw image for photo ${i}:`, error);
            // Continue with unprocessed image
          }
        }

        // Generate filename
        const frameType = includeFrames ? '-framed' : '-raw';
        const baseFilename = `sogni-photobooth-${cleanStyleName}${frameType}`;
        
        // Track duplicate filenames and append counter if needed
        if (!filenameCount[baseFilename]) {
          filenameCount[baseFilename] = 1;
        } else {
          filenameCount[baseFilename]++;
        }
        
        // Only add counter if there are duplicates
        const filename = filenameCount[baseFilename] > 1
          ? `${baseFilename}-${filenameCount[baseFilename]}${actualExtension}`
          : `${baseFilename}${actualExtension}`;

        imagesToDownload.push({
          url: processedImageUrl,
          filename: filename,
          photoIndex: i,
          styleId: photo.styleId
        });
      }

      if (imagesToDownload.length === 0) {
        console.warn('No images prepared for download');
        setBulkDownloadProgress({ current: 0, total: 0, message: 'No images prepared for download' });
        setTimeout(() => {
          setIsBulkDownloading(false);
        }, 2000);
        return;
      }

      // Generate ZIP filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const frameTypeLabel = includeFrames ? 'framed' : 'raw';
      const zipFilename = `sogni-photobooth-${frameTypeLabel}-${timestamp}.zip`;

      // Download as ZIP with progress callback
      const success = await downloadImagesAsZip(
        imagesToDownload,
        zipFilename,
        (current, total, message) => {
          setBulkDownloadProgress({ current, total, message });
        }
      );

      if (success) {
        setBulkDownloadProgress({
          current: imagesToDownload.length,
          total: imagesToDownload.length,
          message: 'Download complete!'
        });

        console.log(`Successfully downloaded ${imagesToDownload.length} images as ${zipFilename}`);
      } else {
        setBulkDownloadProgress({
          current: 0,
          total: 0,
          message: 'Download failed. Please try again.'
        });
      }

      // Reset after a delay
      setTimeout(() => {
        setIsBulkDownloading(false);
        setBulkDownloadProgress({ current: 0, total: 0, message: '' });
      }, 3000);

    } catch (error) {
      console.error('Error in bulk download:', error);
      setBulkDownloadProgress({
        current: 0,
        total: 0,
        message: `Error: ${error.message}`
      });

      setTimeout(() => {
        setIsBulkDownloading(false);
        setBulkDownloadProgress({ current: 0, total: 0, message: '' });
      }, 3000);
    }
  }, [isBulkDownloading, isPromptSelectorMode, filteredPhotos, photos, selectedSubIndex, getStyleDisplayText, outputFormat, settings, tezdevTheme, aspectRatio, isThemeSupported]);

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
                nextFramePadding = { top: 0, left: 0, right: 0, bottom: 0 };
              }
            } else {
              nextFramePadding = { top: 0, left: 0, right: 0, bottom: 0 };
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
    const frameKey = generateFrameKey(photoIndex, currentSubIndex, currentTaipeiFrameNumber);
    
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
  }, [isThemeSupported, photos, selectedSubIndex, generateFrameKey]);

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
      if (selectedPhotoIndex === null || (!isThemeSupported() && !settings.sogniWatermark)) {
        return;
      }

      // Get the correct photo from the appropriate array (filtered or original)
      const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
      const photo = currentPhotosArray[selectedPhotoIndex];
      
      if (!photo) {
        return;
      }
      const currentSubIndex = photo.enhanced && photo.enhancedImageUrl 
        ? -1 // Special case for enhanced images
        : (selectedSubIndex || 0);
        
      const imageUrl = currentSubIndex === -1
        ? photo.enhancedImageUrl
        : photo.images[currentSubIndex];
      
      if (!imageUrl) return;

      // Get the current Taipei frame number for this photo
      const currentTaipeiFrameNumber = photo.taipeiFrameNumber || 1;
      const frameKey = generateFrameKey(selectedPhotoIndex, currentSubIndex, currentTaipeiFrameNumber);
      
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
  }, [selectedPhotoIndex, selectedSubIndex, photos, filteredPhotos, isPromptSelectorMode, isThemeSupported, preGenerateAdjacentFrames, generateFrameKey]);

  // Track photo selection changes to manage smooth transitions
  useEffect(() => {
    if (selectedPhotoIndex !== previousSelectedIndex && isThemeSupported()) {
      // Store the current framed image before switching
      if (previousSelectedIndex !== null) {
        const prevPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
        const prevPhoto = prevPhotosArray[previousSelectedIndex];
        
        if (prevPhoto) {
        const prevSubIndex = prevPhoto.enhanced && prevPhoto.enhancedImageUrl ? -1 : (selectedSubIndex || 0);
        const prevTaipeiFrameNumber = prevPhoto.taipeiFrameNumber || 1;
        const prevFrameKey = `${previousSelectedIndex}-${prevSubIndex}-${tezdevTheme}-${prevTaipeiFrameNumber}-${outputFormat}-${aspectRatio}`;
        const prevFramedImageUrl = framedImageUrls[prevFrameKey];
        
        if (prevFramedImageUrl) {
          setPreviousFramedImage(prevFramedImageUrl);
        }
        }
      }
      
      // Update the previous selected index
      setPreviousSelectedIndex(selectedPhotoIndex);
    }
  }, [selectedPhotoIndex, previousSelectedIndex, photos, filteredPhotos, isPromptSelectorMode, selectedSubIndex, tezdevTheme, outputFormat, aspectRatio, framedImageUrls, isThemeSupported]);

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
  const downloadImage = async (imageUrl, filename, analyticsOptions = {}) => {
    try {
      // Use mobile-optimized download for mobile devices
      if (isMobile()) {
        const result = await downloadImageMobile(imageUrl, filename, analyticsOptions);
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
    // Get the correct photo from the appropriate array (filtered or original)
    const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
    const targetPhoto = currentPhotosArray[photoIndex];
    
    if (!targetPhoto || !targetPhoto.images || targetPhoto.images.length === 0) {
      return;
    }

    // Get the current image URL (handle enhanced images)
    const currentSubIndex = targetPhoto.enhanced && targetPhoto.enhancedImageUrl 
      ? -1 // Special case for enhanced images
      : (selectedSubIndex || 0);
      
    const imageUrl = currentSubIndex === -1
      ? targetPhoto.enhancedImageUrl
      : targetPhoto.images[currentSubIndex];
    
    if (!imageUrl) return;
    
    try {
      // Get style display text (spaced format, no hashtags)
      const styleDisplayText = getStyleDisplayText(targetPhoto);
      
      // Determine photo label (only used for default polaroid frame)
      // Fix duplicate label issue by using statusText directly or just the style
      const photoNumberLabel = targetPhoto?.statusText?.split('#')[0]?.trim() || '';
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
      const isGalleryImage = targetPhoto.isGalleryImage;
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
        taipeiFrameNumber: shouldUseTheme && tezdevTheme === 'taipeiblockchain' ? targetPhoto.taipeiFrameNumber : undefined,
        // Add QR watermark for downloads with improved settings (if enabled)
        watermarkOptions: settings.sogniWatermark ? getQRWatermarkConfig(settings) : null
      });
      
      // Prepare analytics options for mobile sharing
      const analyticsOptions = {
        selectedStyle,
        stylePrompts,
        metadata: {
          downloadType: 'framed',
          filename,
          photoIndex,
          styleDisplayText,
          outputFormat,
          tezdevTheme,
          aspectRatio
        }
      };
      
      // Handle download
      const downloadSuccess = await downloadImage(polaroidUrl, filename, analyticsOptions);
      
      // Track analytics if download was successful (for all platforms)
      if (downloadSuccess) {
        // Get the actual prompt that was used for this photo
        const actualPrompt = targetPhoto.positivePrompt || targetPhoto.stylePrompt;
        await trackDownloadWithStyle(selectedStyle, stylePrompts, {
          downloadType: 'framed',
          filename,
          photoIndex,
          styleDisplayText,
          outputFormat,
          tezdevTheme,
          aspectRatio,
          platform: isMobile() ? 'mobile' : 'desktop',
          actualPrompt
        });
      }
    } catch (error) {
      console.error('Error downloading photo:', error);
    }
  };

  // Handle download raw photo WITHOUT any frame theme (pure original image)
  const handleDownloadRawPhoto = async (photoIndex) => {
    // Get the correct photo from the appropriate array (filtered or original)
    const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
    const targetPhoto = currentPhotosArray[photoIndex];
    
    if (!targetPhoto || !targetPhoto.images || targetPhoto.images.length === 0) {
      return;
    }

    // Get the current image URL (handle enhanced images)
    const currentSubIndex = targetPhoto.enhanced && targetPhoto.enhancedImageUrl 
      ? -1 // Special case for enhanced images
      : (selectedSubIndex || 0);
      
    const imageUrl = currentSubIndex === -1
      ? targetPhoto.enhancedImageUrl
      : targetPhoto.images[currentSubIndex];
    
    if (!imageUrl) return;
    
    try {
      // Generate filename with correct extension based on outputFormat
      const styleDisplayText = getStyleDisplayText(targetPhoto);
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
      
      // Prepare analytics options for mobile sharing
      const analyticsOptions = {
        selectedStyle,
        stylePrompts,
        metadata: {
          downloadType: 'raw',
          filename,
          photoIndex,
          styleDisplayText,
          actualExtension,
          hasWatermark: settings.sogniWatermark
        }
      };
      
      // Handle download and track analytics
      const downloadSuccess = await downloadImage(processedImageUrl, filename, analyticsOptions);
      
      // Track analytics if download was successful (for all platforms)
      if (downloadSuccess) {
        // Get the actual prompt that was used for this photo
        const actualPrompt = targetPhoto.positivePrompt || targetPhoto.stylePrompt;
        await trackDownloadWithStyle(selectedStyle, stylePrompts, {
          downloadType: 'raw',
          filename,
          photoIndex,
          styleDisplayText,
          actualExtension,
          hasWatermark: settings.sogniWatermark,
          platform: isMobile() ? 'mobile' : 'desktop',
          actualPrompt
        });
      }
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
      {/* Download All button - circular button to the left of More button */}
      {!isPromptSelectorMode && selectedPhotoIndex === null && photos && photos.length > 0 && photos.every(p => !p.loading && !p.generating) && photos.filter(p => !p.error && p.images && p.images.length > 0).length > 0 && (
        <div style={{ position: 'fixed', right: '145px', bottom: '22px', zIndex: 9999 }}>
          <button
            className="download-all-circular-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowMoreDropdown(!showMoreDropdown);
            }}
            disabled={isBulkDownloading}
            style={{
              background: '#ff5252',
              border: 'none',
              color: 'white',
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              cursor: isBulkDownloading ? 'not-allowed' : 'pointer',
              opacity: isBulkDownloading ? 0.6 : 1,
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              transition: 'all 0.2s ease'
            }}
            title="Download all images"
            onMouseOver={(e) => {
              if (!isBulkDownloading) {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
              }
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
            }}
          >
            ⬇️
          </button>
              
              {/* Dropdown menu as popup */}
              {showMoreDropdown && !isBulkDownloading && (
                <div
                  className="more-dropdown-menu"
                  style={{
                    position: 'absolute',
                    bottom: '60px',
                    right: '0',
                    background: 'rgba(255, 255, 255, 0.98)',
                    borderRadius: '8px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                    overflow: 'hidden',
                    minWidth: '200px',
                    animation: 'fadeIn 0.2s ease-out'
                  }}
                >
                  <button
                    className="more-dropdown-option"
                    onClick={() => {
                      handleDownloadAll(false);
                      setShowMoreDropdown(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: 'none',
                      background: 'transparent',
                      color: '#333',
                      fontSize: '14px',
                      fontWeight: 'normal',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'background 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 82, 82, 0.1)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <span>⬇️</span> Download All Raw
                  </button>
                  <button
                    className="more-dropdown-option"
                    onClick={() => {
                      handleDownloadAll(true);
                      setShowMoreDropdown(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: 'none',
                      background: 'transparent',
                      color: '#333',
                      fontSize: '14px',
                      fontWeight: 'normal',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'background 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 82, 82, 0.1)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <span>🖼️</span> Download All Framed
                  </button>
                </div>
              )}
              
          {/* Progress indicator for downloads */}
          {isBulkDownloading && bulkDownloadProgress.message && (
            <div
              className="bulk-download-progress"
              style={{
                position: 'absolute',
                bottom: '60px',
                right: '0',
                background: 'rgba(0, 0, 0, 0.85)',
                color: 'white',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                minWidth: '150px',
                textAlign: 'right',
                whiteSpace: 'nowrap'
              }}
            >
              <div>{bulkDownloadProgress.message}</div>
              {bulkDownloadProgress.total > 0 && (
                <div style={{ marginTop: '4px', fontSize: '11px', opacity: 0.9 }}>
                  {bulkDownloadProgress.current} / {bulkDownloadProgress.total}
                </div>
              )}
            </div>
          )}
        </div>
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
            backgroundColor: isGenerating ? '#ff6b6b' : undefined,
            borderColor: isGenerating ? '#ff6b6b' : undefined,
          }}
          title={isGenerating ? 'Cancel current generation and start new batch' : 'Generate more photos'}
        >
          {isGenerating ? `CANCEL + NEXT ${numImages}x` : `NEXT ${numImages}x`}
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
          <span className="view-photos-label">IMAGINE {numImages}x</span>
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
              <>
                <button
                  className="action-button use-prompt-btn"
                  onClick={(e) => {
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
                
                {/* Video Button - Only show for styles with video easter eggs */}
                {hasVideoEasterEgg(selectedPhoto.promptKey) && (
                  <button
                    className="action-button video-btn"
                    onClick={(e) => {
                      setShowVideo(!showVideo);
                      e.stopPropagation();
                    }}
                  >
                    <svg fill="currentColor" width="16" height="16" viewBox="0 0 24 24">
                      {showVideo ? (
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                      ) : (
                        <path d="M8 5v14l11-7z"/>
                      )}
                    </svg>
                    {showVideo ? 'Hide Video' : 'Video'}
                  </button>
                )}
              </>
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
              selectedPhoto.loading || 
              selectedPhoto.enhancing ||
              selectedPhoto.error ||
              !selectedPhoto.images ||
              selectedPhoto.images.length === 0
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
              selectedPhoto.loading || 
              selectedPhoto.enhancing ||
              selectedPhoto.error ||
              !selectedPhoto.images ||
              selectedPhoto.images.length === 0
            }
          >
            <span>💾</span>
            Raw
          </button>

          {/* Enhanced Enhance Button with Undo/Redo functionality */}
          <div className="enhance-button-container">
            {selectedPhoto.enhanced ? (
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
                  disabled={selectedPhoto.loading || selectedPhoto.enhancing || selectedPhoto.error}
                >
                  ↩️ Undo
                </button>
                <button
                  className={`action-button enhance-btn ${selectedPhoto.enhancing ? 'loading' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    
                    if (selectedPhoto.enhancing) return;
                    // Show the enhance options dropdown (Krea/Kontext)
                    setShowEnhanceDropdown(prev => !prev);
                  }}
                  disabled={selectedPhoto.loading || selectedPhoto.enhancing}
                >
                  <span>✨ {selectedPhoto.enhancing ? 
                    (selectedPhoto.enhancementProgress !== undefined ? 
                      `Enhancing ${Math.round((selectedPhoto.enhancementProgress || 0) * 100)}%` : 
                      'Enhancing') : 
                    'Enhance'}</span>
                </button>
              </div>
            ) : selectedPhoto.canRedo ? (
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
                  disabled={selectedPhoto.loading || selectedPhoto.enhancing}
                >
                  ↪️ Redo
                </button>
                <button
                  className={`action-button enhance-btn ${selectedPhoto.enhancing ? 'loading' : ''}`}
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
                  disabled={selectedPhoto.loading || selectedPhoto.enhancing}
                >
                  <span>✨ {selectedPhoto.enhancing ? 
                    (selectedPhoto.enhancementProgress !== undefined ? 
                      `Enhancing ${Math.round((selectedPhoto.enhancementProgress || 0) * 100)}%` : 
                      'Enhancing') : 
                    'Enhance'}</span>
                </button>
              </div>
            ) : (
              <button
                className={`action-button enhance-btn ${selectedPhoto.enhancing ? 'loading' : ''}`}
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
            {showEnhanceDropdown && !selectedPhoto.enhancing && createPortal(
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
            {selectedPhoto.enhancementError && (
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

          {/* Portrait Type Selector */}
          <div style={{
            marginBottom: '16px'
          }}>
            <h2 style={{
              fontFamily: '"Permanent Marker", cursive',
              fontSize: '20px',
              margin: '0 0 12px 0',
              textAlign: 'center'
            }}>
              Pick your photo layout
            </h2>
            
            {/* Portrait Type Buttons */}
            <div style={{
              display: 'flex',
              gap: '16px',
              marginBottom: '20px',
              flexWrap: 'wrap',
              justifyContent: 'center'
            }}>
              <button 
                onClick={() => onPortraitTypeChange && onPortraitTypeChange('headshot')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                {/* Mini polaroid frame - 2:3 aspect ratio */}
                <div style={{
                  width: '32px',
                  height: '48px',
                  background: 'white',
                  padding: '3px 3px 8px 3px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  borderRadius: '2px',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <img 
                    src="/gallery/sample-gallery-headshot-einstein.jpg"
                    alt="Headshot example"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block'
                    }}
                  />
                </div>
                <span style={{
                  fontSize: '12px',
                  fontFamily: '"Permanent Marker", cursive',
                  color: '#333',
                  textDecoration: portraitType === 'headshot' ? 'underline' : 'none',
                  textDecorationColor: '#a855f7',
                  textDecorationThickness: '2px',
                  textUnderlineOffset: '3px'
                }}>Up Close</span>
              </button>
              
              <button 
                onClick={() => onPortraitTypeChange && onPortraitTypeChange('medium')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                {/* Mini polaroid frame - 2:3 aspect ratio */}
                <div style={{
                  width: '32px',
                  height: '48px',
                  background: 'white',
                  padding: '3px 3px 8px 3px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  borderRadius: '2px',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <img 
                    src="/gallery/sample-gallery-medium-body-jen.jpg"
                    alt="Medium portrait example"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block'
                    }}
                  />
                </div>
                <span style={{
                  fontSize: '12px',
                  fontFamily: '"Permanent Marker", cursive',
                  color: '#333',
                  textDecoration: portraitType === 'medium' ? 'underline' : 'none',
                  textDecorationColor: '#a855f7',
                  textDecorationThickness: '2px',
                  textUnderlineOffset: '3px'
                }}>Half Body</span>
              </button>
              
              <button 
                onClick={() => onPortraitTypeChange && onPortraitTypeChange('fullbody')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                {/* Mini polaroid frame - 2:3 aspect ratio */}
                <div style={{
                  width: '32px',
                  height: '48px',
                  background: 'white',
                  padding: '3px 3px 8px 3px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  borderRadius: '2px',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <img 
                    src="/gallery/sample-gallery-full-body-mark.jpg"
                    alt="Wide portrait example"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block'
                    }}
                  />
                </div>
                <span style={{
                  fontSize: '12px',
                  fontFamily: '"Permanent Marker", cursive',
                  color: '#333',
                  textDecoration: portraitType === 'fullbody' ? 'underline' : 'none',
                  textDecorationColor: '#a855f7',
                  textDecorationThickness: '2px',
                  textUnderlineOffset: '3px'
                }}>Full Body</span>
              </button>
            </div>
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
              Pick a style preset
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
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setSearchTerm(newValue);
                    if (onSearchChange) {
                      onSearchChange(newValue);
                    }
                  }}
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
                    onClick={() => {
                      setSearchTerm('');
                      if (onSearchChange) {
                        onSearchChange('');
                      }
                    }}
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
                // Add touch event handlers for swipe navigation when photo is selected
                onTouchStart={isSelected && photos.length > 1 ? (e) => {
                  const touch = e.touches[0];
                  const touchStartData = {
                    x: touch.clientX,
                    y: touch.clientY,
                    time: Date.now()
                  };
                  e.currentTarget.touchStartData = touchStartData;
                } : undefined}
                onTouchMove={isSelected && photos.length > 1 ? (e) => {
                  // Prevent default scrolling behavior during swipe
                  if (e.currentTarget.touchStartData) {
                    const touch = e.touches[0];
                    const deltaX = Math.abs(touch.clientX - e.currentTarget.touchStartData.x);
                    const deltaY = Math.abs(touch.clientY - e.currentTarget.touchStartData.y);
                    
                    // If horizontal movement is greater than vertical, prevent scrolling
                    if (deltaX > deltaY && deltaX > 10) {
                      e.preventDefault();
                    }
                  }
                } : undefined}
                onTouchEnd={isSelected && photos.length > 1 ? (e) => {
                  const touchStartData = e.currentTarget.touchStartData;
                  if (!touchStartData) return;
                  
                  const touch = e.changedTouches[0];
                  const deltaX = touch.clientX - touchStartData.x;
                  const deltaY = touch.clientY - touchStartData.y;
                  const deltaTime = Date.now() - touchStartData.time;
                  
                  // Swipe thresholds
                  const minSwipeDistance = 50; // Minimum distance for a swipe
                  const maxSwipeTime = 500; // Maximum time for a swipe (ms)
                  const maxVerticalDistance = 100; // Maximum vertical movement allowed
                  
                  // Check if this is a valid horizontal swipe
                  if (Math.abs(deltaX) > minSwipeDistance && 
                      Math.abs(deltaY) < maxVerticalDistance && 
                      deltaTime < maxSwipeTime) {
                    
                    // Prevent the click event from firing
                    e.preventDefault();
                    e.stopPropagation();
                    
                    if (deltaX > 0) {
                      // Swipe right - go to previous photo
                      handlePreviousPhoto();
                    } else {
                      // Swipe left - go to next photo
                      handleNextPhoto();
                    }
                  }
                  
                  // Clean up touch data
                  delete e.currentTarget.touchStartData;
                } : undefined}
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
                    <>
                      {/* Refresh button - only show if not already refreshing or generating */}
                      {!photo.generating && !photo.loading && (photo.positivePrompt || photo.stylePrompt) && (
                        <button
                          className="photo-refresh-btn"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            onRefreshPhoto(index);
                          }}
                          style={{
                            position: 'absolute',
                            top: '4px',
                            right: '28px',
                            background: 'rgba(0, 0, 0, 0.7)',
                            color: 'white',
                            border: 'none',
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            fontSize: '11px',
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
                            e.currentTarget.style.background = 'rgba(52, 152, 219, 0.9)';
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                            e.currentTarget.style.transform = 'scale(0.8)';
                          }}
                          title="Refresh this image"
                        >
                          🔄
                        </button>
                      )}
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
                    </>
                  )}
                </div>
                <div className="photo-label">
                  {photo.error ? 
                    <div>
                      <div style={{ marginBottom: '8px' }}>
                        {(() => {
                          if (typeof photo.error === 'object') {
                            return 'GENERATION FAILED';
                          }
                          // Extract just the title part (before colon if present)
                          const errorStr = String(photo.error);
                          const colonIndex = errorStr.indexOf(':');
                          return colonIndex > 0 ? errorStr.substring(0, colonIndex).trim() : errorStr;
                        })()}
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
              // Add touch event handlers for swipe navigation when photo is selected
              onTouchStart={isSelected && photos.length > 1 ? (e) => {
                const touch = e.touches[0];
                const touchStartData = {
                  x: touch.clientX,
                  y: touch.clientY,
                  time: Date.now()
                };
                e.currentTarget.touchStartData = touchStartData;
              } : undefined}
              onTouchMove={isSelected && photos.length > 1 ? (e) => {
                // Prevent default scrolling behavior during swipe
                if (e.currentTarget.touchStartData) {
                  const touch = e.touches[0];
                  const deltaX = Math.abs(touch.clientX - e.currentTarget.touchStartData.x);
                  const deltaY = Math.abs(touch.clientY - e.currentTarget.touchStartData.y);
                  
                  // If horizontal movement is greater than vertical, prevent scrolling
                  if (deltaX > deltaY && deltaX > 10) {
                    e.preventDefault();
                  }
                }
              } : undefined}
              onTouchEnd={isSelected && photos.length > 1 ? (e) => {
                const touchStartData = e.currentTarget.touchStartData;
                if (!touchStartData) return;
                
                const touch = e.changedTouches[0];
                const deltaX = touch.clientX - touchStartData.x;
                const deltaY = touch.clientY - touchStartData.y;
                const deltaTime = Date.now() - touchStartData.time;
                
                // Swipe thresholds
                const minSwipeDistance = 50; // Minimum distance for a swipe
                const maxSwipeTime = 500; // Maximum time for a swipe (ms)
                const maxVerticalDistance = 100; // Maximum vertical movement allowed
                
                // Check if this is a valid horizontal swipe
                if (Math.abs(deltaX) > minSwipeDistance && 
                    Math.abs(deltaY) < maxVerticalDistance && 
                    deltaTime < maxSwipeTime) {
                  
                  // Prevent the click event from firing
                  e.preventDefault();
                  e.stopPropagation();
                  
                  if (deltaX > 0) {
                    // Swipe right - go to previous photo
                    handlePreviousPhoto();
                  } else {
                    // Swipe left - go to next photo
                    handleNextPhoto();
                  }
                }
                
                // Clean up touch data
                delete e.currentTarget.touchStartData;
              } : undefined}

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
                      const frameKey = generateFrameKey(index, currentSubIndex, photoTaipeiFrameNumber);
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
                      const frameKey = generateFrameKey(index, currentSubIndex, photoTaipeiFrameNumber);
                      const hasFramedImage = framedImageUrls[frameKey];
                      const isGeneratingFrame = generatingFrames.has(frameKey);
                      
                      if (!hasFramedImage) {
                        // No composite image yet, so check for frame padding and adjust
                        // Use cached frame padding from photo data or get it dynamically
                        const framePadding = photo.framePadding || { top: 0, left: 0, right: 0, bottom: 0 };
                        
                        // Handle both old number format and new object format
                        let paddingObj;
                        if (typeof framePadding === 'number') {
                          paddingObj = { top: framePadding, left: framePadding, right: framePadding, bottom: framePadding };
                        } else {
                          paddingObj = framePadding;
                        }
                        
                        // Check if we have any padding
                        const hasPadding = paddingObj.top > 0 || paddingObj.left > 0 || paddingObj.right > 0 || paddingObj.bottom > 0;
                        
                        if (hasPadding) {
                          // CRITICAL: Use object-fit: cover to ensure image fills entire available space
                          // This ensures NO white space appears in the frame area
                          return {
                            ...baseStyle,
                            width: `calc(100% - ${paddingObj.left + paddingObj.right}px)`,
                            height: `calc(100% - ${paddingObj.top + paddingObj.bottom}px)`,
                            top: `${paddingObj.top}px`,
                            left: `${paddingObj.left}px`,
                            objectFit: 'cover', // Fill entire space, crop if necessary to avoid white space
                            objectPosition: 'center', // Center the image within the available space
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
                
                {/* Video Overlay - Only show for styles with video easter eggs when video is enabled */}
                {isSelected && hasVideoEasterEgg(photo.promptKey) && showVideo && (
                  <video
                    src={(() => {
                      if (photo.promptKey === 'jazzSaxophonist') {
                        return "https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/videos/sogni-photobooth-video-demo_832x1216.mp4";
                      } else if (photo.promptKey === 'kittySwarm') {
                        return "https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/videos/sogni-photobooth-kittyswarm-raw.mp4";
                      } else if (photo.promptKey === 'stoneMoss') {
                        return "https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/videos/sogni-photobooth-stonemoss-raw.mp4";
                      } else if (photo.promptKey === 'dapperVictorian') {
                        return "https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/videos/sogni-photobooth-dappervictorian-raw.mp4";
                      } else if (photo.promptKey === 'prismKaleidoscope') {
                        return "https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/videos/sogni-photobooth-prism-kaleidoscope-raw.mp4";
                      } else if (photo.promptKey === 'apocalypseRooftop') {
                        return "https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/videos/sogni-photobooth-apocalypserooftop-raw.mp4";
                      } else if (photo.promptKey === 'anime1990s') {
                        const animeVideos = [
                          "https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/videos/sogni-photobooth-anime1990s-raw.mp4",
                          "https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/videos/sogni-photobooth-anime1990s-raw2.mp4"
                        ];
                        return animeVideos[currentVideoIndex] || animeVideos[0];
                      } else if (photo.promptKey === 'nftBoredApe') {
                        return "https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/videos/sogni-photobooth-nft-bored-ape-raw.mp4";
                      } else if (photo.promptKey === 'clownPastel') {
                        return "https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/videos/sogni-photobooth-clown-pastel-raw.mp4";
                      }
                      return "";
                    })()}
                    autoPlay
                    loop={photo.promptKey !== 'anime1990s'}
                    playsInline
                    onEnded={() => {
                      if (photo.promptKey === 'anime1990s') {
                        const animeVideos = [
                          "https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/videos/sogni-photobooth-anime1990s-raw.mp4",
                          "https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/videos/sogni-photobooth-anime1990s-raw2.mp4"
                        ];
                        const nextIndex = (currentVideoIndex + 1) % animeVideos.length;
                        setCurrentVideoIndex(nextIndex);
                      }
                    }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: photo.promptKey === 'kittySwarm' ? 'contain' : 'cover', // Use contain for kittySwarm to show black bars, cover for others
                      objectPosition: 'center',
                      backgroundColor: photo.promptKey === 'kittySwarm' ? '#000' : 'transparent', // Black background for letterboxing on kittySwarm
                      zIndex: 3, // Above theme overlays
                      borderRadius: 'inherit'
                    }}
                    onLoadedData={() => {
                      console.log(`${photo.promptKey} video loaded and ready to play`);
                    }}
                    onError={(e) => {
                      console.error(`${photo.promptKey} video failed to load:`, e);
                      setShowVideo(false); // Hide video on error
                    }}
                  />
                )}
                
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
                  const frameKey = generateFrameKey(index, currentSubIndex, photoTaipeiFrameNumber);
                  
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

                {/* Hide button and refresh button - only show on hover for grid photos (not popup) and when image is loaded */}
                {!isSelected && isLoaded && !photo.isOriginal && !photo.isGalleryImage && (
                  <>
                    {/* Refresh button - only show if photo has a prompt */}
                    {(photo.positivePrompt || photo.stylePrompt) && (
                      <button
                        className="photo-refresh-btn"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          onRefreshPhoto(index);
                        }}
                        style={{
                          position: 'absolute',
                          top: '4px',
                          right: '28px',
                          background: 'rgba(0, 0, 0, 0.7)',
                          color: 'white',
                          border: 'none',
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          fontSize: '11px',
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
                          e.currentTarget.style.background = 'rgba(52, 152, 219, 0.9)';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                          e.currentTarget.style.transform = 'scale(0.8)';
                        }}
                        title="Refresh this image"
                      >
                        🔄
                      </button>
                    )}
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
                  </>
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
  onRegisterFrameCacheClear: PropTypes.func, // New prop to register frame cache clearing function
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
  onBackToPhotos: PropTypes.func,
  initialThemeGroupState: PropTypes.object,
  onSearchChange: PropTypes.func,
  initialSearchTerm: PropTypes.string,
  portraitType: PropTypes.string,
  onPortraitTypeChange: PropTypes.func,
  numImages: PropTypes.number,
  authState: PropTypes.object,
  handleRefreshPhoto: PropTypes.func
};

export default PhotoGallery; 