import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';

import { getModelOptions, defaultStylePrompts as initialStylePrompts, TIMEOUT_CONFIG, isFluxKontextModel, TWITTER_SHARE_CONFIG, getQRWatermarkConfig, DEFAULT_MODEL_ID, FLUX_KONTEXT_MODEL_ID } from './constants/settings';
import { photoThoughts, randomThoughts } from './constants/thoughts';
import { saveSettingsToCookies, shouldShowPromoPopup, markPromoPopupShown, hasDoneDemoRender, markDemoRenderDone, clearSessionSettings } from './utils/cookies';
import { styleIdToDisplay } from './utils';
import { getCustomDimensions } from './utils/imageProcessing';
import { generateGalleryFilename, getPortraitFolderWithFallback } from './utils/galleryLoader';
import { goToPreviousPhoto, goToNextPhoto } from './utils/photoNavigation';
import { initializeStylePrompts, getRandomStyle, getRandomMixPrompts } from './services/prompts';
import { getDefaultThemeGroupState, getEnabledPrompts, getOneOfEachPrompts } from './constants/themeGroups';
import { getThemeGroupPreferences, saveThemeGroupPreferences } from './utils/cookies';
import { initializeSogniClient } from './services/sogni';
import { isNetworkError } from './services/api';
import { AuthStatus } from './components/auth/AuthStatus';
import { useSogniAuth } from './services/sogniAuth';
import { createFrontendClientAdapter } from './services/frontendSogniAdapter';
import { enhancePhoto, undoEnhancement, redoEnhancement } from './services/PhotoEnhancer';
import { refreshPhoto } from './services/PhotoRefresher';
import { shareToTwitter } from './services/TwitterShare';
import { shareViaWebShare, isWebShareSupported } from './services/WebShare';
import { themeConfigService } from './services/themeConfig';
import { trackPageView, initializeGA, trackEvent, trackBatchGeneration } from './utils/analytics';
import { getCampaignSource } from './utils/campaignAttribution';
import { setReferralSource, getReferralSource } from './utils/referralTracking';
import { ensurePermanentUrl } from './utils/imageUpload.js';
import { createPolaroidImage } from './utils/imageProcessing.js';
import { getPhotoHashtag } from './services/TwitterShare.js';
import { trackShareWithStyle } from './services/analyticsService';
import { CUSTOM_PROMPT_IMAGE_KEY } from './components/shared/CustomPromptPopup';
import urls from './config/urls';
import clickSound from './click.mp3';
import cameraWindSound from './camera-wind.mp3';
// import helloSound from './hello.mp3';
import light1Image from './light1.png';
import light2Image from './light2.png';
import './App.css';
import './styles/style-dropdown.css';
import './styles/ios-chrome-fixes.css';
import './styles/mobile-portrait-fixes.css'; // New critical mobile portrait fixes
import './styles/mobile-chrome-fixes.css'; // Chrome mobile context menu fixes
import './styles/pwa-standalone-fixes.css'; // PWA standalone mode fixes

import CameraView from './components/camera/CameraView';
import CameraStartMenu from './components/camera/CameraStartMenu';
import AdvancedSettings from './components/shared/AdvancedSettings';
import PWAInstallPrompt from './components/shared/PWAInstallPrompt';
import './services/pwaInstaller'; // Initialize PWA installer service
import promptsDataRaw from './prompts.json';

// Extract prompts from the new nested structure
const promptsData = {};
Object.values(promptsDataRaw).forEach(themeGroup => {
  Object.assign(promptsData, themeGroup.prompts);
});
import PhotoGallery from './components/shared/PhotoGallery';
import StyleDropdown from './components/shared/StyleDropdown';
import { useApp } from './context/AppContext.tsx';
import { useWallet } from './hooks/useWallet';
import { isPremiumBoosted } from './services/walletService';
import { estimateJobCost } from './hooks/useCostEstimation.ts';
import TwitterShareModal from './components/shared/TwitterShareModal';

import FriendlyErrorModal from './components/shared/FriendlyErrorModal';
import { useToastContext } from './context/ToastContext';
import { setupWebSocketErrorHandler, handleSpecificErrors } from './utils/websocketErrorHandler';
import webSocketErrorTester from './utils/testWebSocketErrors';

import SplashScreen from './components/shared/SplashScreen';
// Import the ImageAdjuster component
import ImageAdjuster from './components/shared/ImageAdjuster';
// Import the UploadProgress component
import UploadProgress from './components/shared/UploadProgress';
import PromoPopup from './components/shared/PromoPopup';
import OutOfCreditsPopup from './components/shared/OutOfCreditsPopup';
import LoginUpsellPopup from './components/shared/LoginUpsellPopup';
import NetworkStatus from './components/shared/NetworkStatus';
import ConfettiCelebration from './components/shared/ConfettiCelebration';
// import AnalyticsDashboard from './components/admin/AnalyticsDashboard';
import { subscribeToConnectionState, getCurrentConnectionState } from './services/api';
import StripePurchase from './components/stripe/StripePurchase.tsx';
import { ApiProvider } from './hooks/useSogniApi.ts';



// Enhanced URL management for deep linking
const updateUrlParams = (updates, options = {}) => {
  const { usePushState = false, navigationContext = {} } = options;
  const url = new URL(window.location.href);

  // Apply all updates
  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  });

  // Use pushState for navigation actions (adds to history), replaceState for state updates
  if (usePushState) {
    window.history.pushState({ navigationContext }, '', url);
  } else {
    window.history.replaceState({ navigationContext }, '', url);
  }
};

// Helper function to update URL with prompt parameter (backward compatibility)
const updateUrlWithPrompt = (promptKey) => {
  updateUrlParams({ 
    prompt: (!promptKey || ['randomMix', 'random', 'custom', 'oneOfEach', 'copyImageStyle'].includes(promptKey)) ? null : promptKey 
  });
};

// Helper function to get the hashtag for a style
const getHashtagForStyle = (styleKey) => {
  if (!styleKey || styleKey === 'random' || styleKey === 'randomMix' || styleKey === 'oneOfEach' || styleKey === 'copyImageStyle') {
    return null;
  }
  // For custom prompts, use #SogniPhotobooth
  if (styleKey === 'custom') {
    return 'SogniPhotobooth';
  }
  return styleKey;
};


const App = () => {
  // --- Authentication Hook ---
  const authState = useSogniAuth();
  
  // --- Toast Context ---
  const { showToast } = useToastContext();
  
  // Initialize WebSocket error tester for development/testing
  useEffect(() => {
    webSocketErrorTester.init(showToast);
  }, [showToast]);
  
  // --- Immediate URL Check (runs before any useEffect) ---
  const immediateUrl = new URL(window.location.href);
  const immediatePageParam = immediateUrl.searchParams.get('page');
  const immediateExtensionParam = immediateUrl.searchParams.get('extension');
  
  // Set up extension mode immediately if detected
  if (immediateExtensionParam === 'true') {
    window.extensionMode = true;
    document.body.classList.add('extension-mode'); // Add CSS class for styling
    
    // Add message listener immediately for extension communication
    const handleExtensionMessage = (event) => {
      // Only log important extension messages, not all the noise
      if (event.data.type === 'styleSelected' || event.data.type === 'useThisStyle') {
        console.log('Extension message:', event.data.type);
      }
    };
    window.addEventListener('message', handleExtensionMessage);
  }

  
  const videoReference = useRef(null);
  const canvasReference = useRef(null);
  const shutterSoundReference = useRef(null);
  const cameraWindSoundReference = useRef(null);
  // const helloSoundReference = useRef(null);
  const slothicornReference = useRef(null);
  const soundPlayedForPhotos = useRef(new Set()); // Track which photo IDs have already played sound
  const prevWinterContextRef = useRef(false); // Track previous winter context state (initialized to false)
  const prevModelRef = useRef(null); // Track previous model to detect actual model changes
  const prevStyleRef = useRef(null); // Track previous style to detect style changes
  const dreamShaperAutoSelectedRef = useRef(false); // Track if DreamShaper was auto-selected (vs manually selected)
  const isInitialRenderRef = useRef(true); // Track if this is the initial render
  const userExplicitlySelectedModelRef = useRef(false); // Track if user explicitly chose a model (disables auto-switching)

  useEffect(() => {
    const unlockAudio = () => {
      if (shutterSoundReference.current) {
        const audio = shutterSoundReference.current;
        audio.muted = true;
        audio.play().then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false; // Unmute for future real plays
        }).catch(err => {
          console.warn('Failed to unlock shutter sound:', err);
        });
      }
    
      if (cameraWindSoundReference.current) {
        const audio = cameraWindSoundReference.current;
        audio.muted = true;
        audio.play().then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        }).catch(err => {
          console.warn('Failed to unlock wind sound:', err);
        });
      }
      /*
      if (helloSoundReference.current) {
        const audio = helloSoundReference.current;
        audio.muted = true;
        audio.play().then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        }).catch(err => {
          console.warn('Failed to unlock hello sound:', err);
        });
      }
      */
  
      window.removeEventListener("touchstart", unlockAudio);
      window.removeEventListener("click", unlockAudio);
    };
  
    window.addEventListener("touchstart", unlockAudio, { once: true });
    window.addEventListener("click", unlockAudio, { once: true });
  }, []);

  // --- Use AppContext for settings ---
  const { settings, updateSetting: baseUpdateSetting, switchToModel, resetSettings: contextResetSettings, registerCacheClearingCallback } = useApp();
  
  // Track auth state in a ref so we always get the current value
  const authStateRef = useRef(authState);
  useEffect(() => {
    authStateRef.current = authState;
  }, [authState.isAuthenticated, authState.authMode]); // Only primitive dependencies
  
  // Wrap updateSetting to pass CURRENT auth state (not captured in closure)
  const updateSetting = useCallback((key, value) => {
    // Get current auth state from ref, not closure
    const isAuth = authStateRef.current.isAuthenticated;
    baseUpdateSetting(key, value, isAuth);
  }, [baseUpdateSetting]); // Only depends on baseUpdateSetting, not authState
  const { 
    selectedStyle, 
    selectedModel, 
    numImages,
    promptGuidance, 
    controlNetStrength, 
    controlNetGuidanceEnd, 
    inferenceSteps,
    scheduler,
    timeStepSpacing,
    guidance,
    flashEnabled, 
    keepOriginalPhoto,
    positivePrompt,
    customSceneName,
    stylePrompt,
    negativePrompt,
    seed,
    soundEnabled,
    slothicornAnimationEnabled,
    backgroundAnimationsEnabled,
    aspectRatio,
    tezdevTheme,
    outputFormat,
    sensitiveContentFilter,
    kioskMode,
    showSplashOnInactivity,
    inactivityTimeout
  } = settings;

  // Add state to store the last used photo blob and data URL for "More" button
  const [lastPhotoData, setLastPhotoData] = useState({ blob: null, dataUrl: null }); // Keep this

  // Add state for style reference image (for "Copy image style" mode)
  const [styleReferenceImage, setStyleReferenceImage] = useState(null); // { blob, dataUrl, croppedBlob }
  const [showStyleReferenceAdjuster, setShowStyleReferenceAdjuster] = useState(false); // Show adjuster for style reference

  // No longer loading Einstein as state - UI handles fallback display directly

  // --- Use wallet for payment method ---
  const { tokenType: walletTokenType, balances, switchPaymentMethod, onBalanceIncrease } = useWallet();
  
  // Track app initialization time to prevent balance update toasts during initial load
  const appInitTimeRef = useRef(Date.now());
  
  // Reset the initialization time when authentication changes
  useEffect(() => {
    if (authState.isAuthenticated) {
      console.log('🔐 Authentication detected, resetting balance notification grace period');
      appInitTimeRef.current = Date.now();
    }
  }, [authState.isAuthenticated]);
  
  // Log when payment method changes
  useEffect(() => {
    console.log('💳 Payment method updated:', walletTokenType);
  }, [walletTokenType]);

  // Handle balance increases - show toast and auto-switch to Spark if needed
  useEffect(() => {
    if (!onBalanceIncrease) return;

    onBalanceIncrease((tokenType, oldBalance, newBalance) => {
      const increase = newBalance - oldBalance;
      console.log(`💰 Balance increased for ${tokenType}: ${oldBalance} -> ${newBalance} (+${increase.toFixed(2)})`);

      // Check if we're within the grace period after app load/login (5 seconds)
      const timeSinceInit = Date.now() - appInitTimeRef.current;
      const isWithinGracePeriod = timeSinceInit < 5000;
      
      if (isWithinGracePeriod) {
        console.log(`💰 Skipping balance notification - within grace period (${(timeSinceInit / 1000).toFixed(1)}s since init)`);
        return;
      }

      // Only show toast for significant balance increases (minimum credit card purchase is 275)
      if (increase < 275) {
        console.log(`💰 Skipping balance notification - increase too small (${increase.toFixed(2)} < 275)`);
        return;
      }

      // Show toast notification
      showToast({
        type: 'success',
        title: `${tokenType === 'spark' ? 'Spark' : 'SOGNI'} Credits Added!`,
        message: `+${increase.toFixed(2)} ${tokenType === 'spark' ? 'Spark Points' : 'SOGNI'} added to your wallet`,
        timeout: 5000
      });

      // Auto-switch to Spark if Spark balance increased and current payment method is Sogni
      // This handles Stripe purchases automatically
      if (tokenType === 'spark' && walletTokenType === 'sogni') {
        console.log('💳 Auto-switching payment method from sogni to spark after Spark balance increase');
        switchPaymentMethod('spark');
        showToast({
          type: 'info',
          title: 'Payment Method Updated',
          message: 'Switched to Spark Points as your payment method',
          timeout: 4000
        });
      }
    });
  }, [onBalanceIncrease, showToast, walletTokenType, switchPaymentMethod]);

  // Extract preferredCameraDeviceId for easier access
  const { preferredCameraDeviceId } = settings;
  // --- End context usage ---

  // Add state for style prompts instead of modifying the imported constant
  const [stylePrompts, setStylePrompts] = useState(initialStylePrompts);
  
  // Add state to track the current hashtag for sharing
  const [currentHashtag, setCurrentHashtag] = useState(null);
  
  // Track current theme state for real-time filtering
  const [currentThemeState, setCurrentThemeState] = useState(() => {
    const saved = getThemeGroupPreferences();
    const defaultState = getDefaultThemeGroupState();
    return { ...defaultState, ...saved };
  });


  // Info modal state - adding back the missing state
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showCameraStyleDropdown, setShowCameraStyleDropdown] = useState(false);
  const [showPhotoGrid, setShowPhotoGrid] = useState(
    immediatePageParam === 'prompts' && immediateExtensionParam === 'true'
  );
  
  // State for tracking gallery prompt application
  const [pendingGalleryPrompt, setPendingGalleryPrompt] = useState(null);

  // State for portrait type in Style Explorer - read from settings if available
  const [portraitType, setPortraitType] = useState(() => {
    return settings.portraitType || 'medium'; // Use saved portrait type or default to 'medium'
  });

  // State for current page routing
  const [currentPage, setCurrentPage] = useState(() => {
    return immediatePageParam === 'prompts' ? 'prompts' : 'camera';
  });

  // Re-read theme preferences when navigating between pages
  // This ensures theme changes from WinterEvent are reflected
  useEffect(() => {
    const saved = getThemeGroupPreferences();
    if (saved && Object.keys(saved).length > 0) {
      const defaultState = getDefaultThemeGroupState();
      const newThemeState = { ...defaultState, ...saved };
      setCurrentThemeState(newThemeState);
      console.log('🎨 Re-read theme preferences from localStorage:', newThemeState);
    }
  }, [currentPage]); // Re-read when navigating between pages

  // Callback to handle theme changes from PromptSelectorPage
  const handleThemeChange = useCallback((newThemeState) => {
    setCurrentThemeState(newThemeState);
    
    // Update URL with theme filters for deep linking
    if (currentPage === 'prompts') {
      const enabledThemes = Object.entries(newThemeState)
        .filter(([, enabled]) => enabled)
        .map(([groupId]) => groupId);
      
      // Only add themes parameter if not all themes are selected
      const allThemes = Object.keys(getDefaultThemeGroupState());
      const themesParam = enabledThemes.length === allThemes.length ? null : enabledThemes.join(',');
      
      updateUrlParams({ themes: themesParam });
    }
  }, [currentPage]);

  // Handler for search term changes
  const handleSearchChange = useCallback((searchTerm) => {
    // Update URL with search term for deep linking
    if (currentPage === 'prompts') {
      updateUrlParams({ search: searchTerm || null });
    }
  }, [currentPage]);

  // Handler for portrait type changes
  const handlePortraitTypeChange = useCallback((newPortraitType) => {
    // Only change if it's actually different
    if (newPortraitType === portraitType) {
      console.log(`Portrait type ${newPortraitType} already selected, ignoring`);
      return;
    }
    
    console.log(`Changing portrait type from ${portraitType} to ${newPortraitType}`);
    setPortraitType(newPortraitType);
    // Persist portrait type to settings so it's maintained across navigation
    updateSetting('portraitType', newPortraitType);
    // Clear gallery photos to force reload with new portrait type
    setGalleryPhotos([]);
    // Reset gallery loaded flag to force reload with new portrait type
    galleryImagesLoadedThisSession.current = false;
  }, [portraitType, updateSetting]);
  
  // PWA install prompt state - for manual testing only
  const [showPWAPromptManually, setShowPWAPromptManually] = useState(false);

  // Set up global PWA prompt trigger for testing
  useEffect(() => {
    window.showPWAPrompt = () => {
      console.log('Manually triggering PWA install prompt');
      setShowPWAPromptManually(true);
    };
    
    // Cleanup
    return () => {
      delete window.showPWAPrompt;
    };
  }, []);
  
  // Add state for image adjustment
  const [showImageAdjuster, setShowImageAdjuster] = useState(false);
  const [currentUploadedImageUrl, setCurrentUploadedImageUrl] = useState('');
  
  // Add state for mobile share caching to avoid regenerating the same framed images
  const [mobileShareCache, setMobileShareCache] = useState({});
  
  // Add state to store framed image cache from PhotoGallery
  const [photoGalleryFramedImageCache, setPhotoGalleryFramedImageCache] = useState({});
  
  // Store reference to PhotoGallery's frame cache clearing function
  const photoGalleryFrameClearRef = useRef(null);
  
  // Register cache clearing callbacks with AppContext
  useEffect(() => {
    // Register callbacks for clearing various caches
    const unregisterCallbacks = [
      // Clear QR code data
      registerCacheClearingCallback(() => {
        console.log('Clearing QR code data due to QR settings change');
        setQrCodeData(null);
      }),
      
      // Clear mobile share cache
      registerCacheClearingCallback(() => {
        console.log('Clearing mobile share cache due to QR settings change');
        setMobileShareCache({});
      }),
      
      // Clear PhotoGallery frame cache if available
      registerCacheClearingCallback(() => {
        if (photoGalleryFrameClearRef.current) {
          console.log('Clearing PhotoGallery frame cache due to QR settings change');
          photoGalleryFrameClearRef.current();
        }
      })
    ];
    
    // Cleanup function
    return () => {
      unregisterCallbacks.forEach(unregister => unregister());
    };
  }, []);
  
  // Cleanup old mobile share cache entries to prevent memory leaks
  const cleanupMobileShareCache = useCallback(() => {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    const maxEntries = 50; // Maximum number of cached entries
    
    setMobileShareCache(prev => {
      const entries = Object.entries(prev);
      
      // Filter out old entries
      const freshEntries = entries.filter(([, data]) => {
        return (now - data.timestamp) < maxAge;
      });
      
      // If still too many entries, keep only the most recent ones
      if (freshEntries.length > maxEntries) {
        freshEntries.sort((a, b) => b[1].timestamp - a[1].timestamp);
        freshEntries.splice(maxEntries);
      }
      
      return Object.fromEntries(freshEntries);
    });
  }, []);
  
  // Run cleanup periodically
  useEffect(() => {
    const interval = setInterval(cleanupMobileShareCache, 10 * 60 * 1000); // Every 10 minutes
    return () => clearInterval(interval);
  }, []); // Empty dependency array - cleanupMobileShareCache is stable
  const [currentUploadedSource, setCurrentUploadedSource] = useState('');
  


  // Helper function to clear old photo data from localStorage to prevent quota issues
  const clearOldPhotoStorage = () => {
    try {
      // Clear all photo-related storage items
      localStorage.removeItem('sogni-lastAdjustedPhoto');
      localStorage.removeItem('sogni-lastCameraPhoto');
      localStorage.removeItem('sogni-lastUploadedPhoto');
      localStorage.removeItem('sogni_styleReferenceImage');
      localStorage.removeItem(CUSTOM_PROMPT_IMAGE_KEY);
      console.log('📦 Cleared old photo storage to free up space');
    } catch (error) {
      console.warn('Failed to clear old photo storage:', error);
    }
  };

  // Helper function to safely store data with quota management
  const safeLocalStorageSetItem = (key, value, retryWithCleanup = true) => {
    try {
      // Check if the value is too large (> 3MB when stringified)
      // This prevents storing huge images that will likely cause quota issues
      const sizeInBytes = new Blob([value]).size;
      const sizeInMB = sizeInBytes / (1024 * 1024);

      if (sizeInMB > 3) {
        console.warn(`⚠️  Skipping localStorage save for ${key} - size (${sizeInMB.toFixed(2)}MB) exceeds safe limit (3MB)`);
        return false;
      }

      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      // Check if it's a quota exceeded error
      const isQuotaError = error.name === 'QuotaExceededError' ||
                           error.code === 22 ||
                           error.code === 1014 ||
                           error.message?.toLowerCase().includes('quota');

      if (isQuotaError) {
        console.warn('📦 localStorage quota exceeded');

        // Try to recover by clearing old data
        if (retryWithCleanup) {
          console.log('🔄 Clearing old photo data and retrying...');
          clearOldPhotoStorage();

          // Retry once without cleanup option to prevent infinite loop
          return safeLocalStorageSetItem(key, value, false);
        } else {
          console.warn('⚠️  Still cannot save after cleanup - photo will not persist across sessions');
          return false;
        }
      } else {
        console.warn(`Failed to save to localStorage (${key}):`, error);
        return false;
      }
    }
  };

  // Helper functions for localStorage persistence
  const saveLastAdjustedPhotoToStorage = async (photoData) => {
    try {
      if (photoData.blob) {
        // Convert blob to base64 data URL for storage
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          const dataToStore = {
            ...photoData,
            dataUrl: dataUrl,
            // Remove blob since we have dataUrl now
            blob: null
          };
          safeLocalStorageSetItem('sogni-lastAdjustedPhoto', JSON.stringify(dataToStore));
        };
        reader.readAsDataURL(photoData.blob);
      } else {
        // No blob, just store what we have
        // eslint-disable-next-line no-unused-vars
        const { blob, ...photoDataWithoutBlob } = photoData;
        safeLocalStorageSetItem('sogni-lastAdjustedPhoto', JSON.stringify(photoDataWithoutBlob));
      }
    } catch (error) {
      console.warn('Failed to save lastAdjustedPhoto to localStorage:', error);
    }
  };

  const loadLastAdjustedPhotoFromStorage = () => {
    try {
      const stored = localStorage.getItem('sogni-lastAdjustedPhoto');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.warn('Failed to load lastAdjustedPhoto from localStorage:', error);
      return null;
    }
  };

  // Helper functions for lastCameraPhoto persistence
  const saveLastCameraPhotoToStorage = async (photoData) => {
    try {
      if (photoData.blob) {
        // Convert blob to base64 data URL for storage
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          const dataToStore = {
            ...photoData,
            dataUrl: dataUrl,
            blob: null // Remove blob since we have dataUrl now
          };
          safeLocalStorageSetItem('sogni-lastCameraPhoto', JSON.stringify(dataToStore));
        };
        reader.readAsDataURL(photoData.blob);
      } else {
        // No blob, just store what we have
        // eslint-disable-next-line no-unused-vars
        const { blob, ...photoDataWithoutBlob } = photoData;
        safeLocalStorageSetItem('sogni-lastCameraPhoto', JSON.stringify(photoDataWithoutBlob));
      }
    } catch (error) {
      console.warn('Failed to save lastCameraPhoto to localStorage:', error);
    }
  };

  const loadLastCameraPhotoFromStorage = () => {
    try {
      const stored = localStorage.getItem('sogni-lastCameraPhoto');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.warn('Failed to load lastCameraPhoto from localStorage:', error);
      return null;
    }
  };

  // Helper functions for lastUploadedPhoto persistence
  const saveLastUploadedPhotoToStorage = async (photoData) => {
    try {
      if (photoData.blob) {
        // Convert blob to base64 data URL for storage
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          const dataToStore = {
            ...photoData,
            dataUrl: dataUrl,
            blob: null // Remove blob since we have dataUrl now
          };
          safeLocalStorageSetItem('sogni-lastUploadedPhoto', JSON.stringify(dataToStore));
        };
        reader.readAsDataURL(photoData.blob);
      } else {
        // No blob, just store what we have
        // eslint-disable-next-line no-unused-vars
        const { blob, ...photoDataWithoutBlob } = photoData;
        safeLocalStorageSetItem('sogni-lastUploadedPhoto', JSON.stringify(photoDataWithoutBlob));
      }
    } catch (error) {
      console.warn('Failed to save lastUploadedPhoto to localStorage:', error);
    }
  };

  const loadLastUploadedPhotoFromStorage = () => {
    try {
      const stored = localStorage.getItem('sogni-lastUploadedPhoto');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.warn('Failed to load lastUploadedPhoto from localStorage:', error);
      return null;
    }
  };

  // Add state to store the last adjusted photo data for re-editing
  const [lastAdjustedPhoto, setLastAdjustedPhotoState] = useState(null);
  
  // Add separate state for uploaded photos (separate from camera photos)
  const [lastUploadedPhoto, setLastUploadedPhotoState] = useState(null);
  
  // Add separate state for camera photos (separate from uploaded photos)
  const [lastCameraPhoto, setLastCameraPhotoState] = useState(null);
  
  // Custom setter that also saves to localStorage
  const setLastAdjustedPhoto = (photoData) => {
    setLastAdjustedPhotoState(photoData);
    if (photoData) {
      saveLastAdjustedPhotoToStorage(photoData);
    } else {
      localStorage.removeItem('sogni-lastAdjustedPhoto');
    }
  };

  // Custom setter for lastCameraPhoto that also saves to localStorage
  const setLastCameraPhoto = (photoData) => {
    setLastCameraPhotoState(photoData);
    if (photoData) {
      saveLastCameraPhotoToStorage(photoData);
    } else {
      localStorage.removeItem('sogni-lastCameraPhoto');
    }
  };

  // Custom setter for lastUploadedPhoto that also saves to localStorage
  const setLastUploadedPhoto = (photoData) => {
    setLastUploadedPhotoState(photoData);
    if (photoData) {
      saveLastUploadedPhotoToStorage(photoData);
    } else {
      localStorage.removeItem('sogni-lastUploadedPhoto');
    }
  };

  // No longer loading Einstein as state - UI handles fallback display directly

  // No longer loading Einstein as state - UI handles fallback display directly

  // Wrapper function to reset settings and lastPhotoData
  const resetSettings = useCallback(async () => {
    console.log('🔄 Resetting all settings to defaults');
    
    // Mark this as a manual model change to prevent automatic switching
    manualModelChangeRef.current = true;
    
    // Reset user explicit model selection flag - allow auto-switching after reset
    userExplicitlySelectedModelRef.current = false;
    
    // First reset the context settings
    contextResetSettings();
    
    // Explicitly clear winter context
    updateSetting('winterContext', false);

    // Clear any saved photo data from localStorage to ensure clean reset
    localStorage.removeItem('sogni-lastAdjustedPhoto');
    localStorage.removeItem('sogni-lastCameraPhoto');
    console.log('🗑️ Cleared saved photo data from localStorage');

    // Clear blocked prompts
    localStorage.removeItem('sogni_blocked_prompts');
    console.log('🗑️ Cleared blocked prompts from localStorage');

    // Clear all photo states - UI will show Einstein fallback automatically
    setLastPhotoData({ blob: null, dataUrl: null });
    setLastAdjustedPhotoState(null);
    setLastCameraPhotoState(null);
    
    // Reset the manual change flag after effects run
    setTimeout(() => {
      manualModelChangeRef.current = false;
    }, 100);
  }, [contextResetSettings, updateSetting]);



  // Load lastAdjustedPhoto from localStorage on app mount
  useEffect(() => {
    const loadAdjustedPhoto = () => {
      const storedPhotoData = loadLastAdjustedPhotoFromStorage();

      // Only use stored photo if it's a real user photo (has imageUrl or valid source + data)
      // Einstein fallback photos lack imageUrl and should never be persisted
      const isRealUserPhoto = storedPhotoData && (
        storedPhotoData.imageUrl || // Real photos have imageUrl
        (storedPhotoData.source && storedPhotoData.dataUrl && storedPhotoData.dataUrl.startsWith('data:image'))
      );

      if (isRealUserPhoto) {
        // We don't have the blob anymore, but we have the adjustments
        setLastAdjustedPhotoState(storedPhotoData);
      } else {
        // Clear any invalid/Einstein photos from localStorage
        if (storedPhotoData) {
          console.log('🗑️ Clearing Einstein fallback photo from localStorage (not a real user photo)');
          localStorage.removeItem('sogni-lastAdjustedPhoto');
        }
        // Don't set any state - UI will show Einstein fallback automatically when null
      }
    };

    loadAdjustedPhoto();
  }, []);

  // Load lastCameraPhoto from localStorage on app mount
  useEffect(() => {
    const loadCameraPhoto = () => {
      const storedCameraPhoto = loadLastCameraPhotoFromStorage();
      // Only use stored photo if it's a real user photo (has imageUrl or has valid source + data)
      // Einstein fallback photos lack imageUrl and should never be persisted
      const isRealUserPhoto = storedCameraPhoto && (
        storedCameraPhoto.imageUrl || // Real camera photos have imageUrl
        (storedCameraPhoto.source === 'camera' && storedCameraPhoto.dataUrl && storedCameraPhoto.dataUrl.startsWith('data:image'))
      );
      
      if (isRealUserPhoto) {
        setLastCameraPhotoState(storedCameraPhoto);
        console.log('✅ Loaded lastCameraPhoto from localStorage');
      } else {
        // Clear any invalid/Einstein photos from localStorage
        if (storedCameraPhoto) {
          console.log('🗑️ Clearing Einstein fallback photo from localStorage (not a real user photo)');
          localStorage.removeItem('sogni-lastCameraPhoto');
        }
        // Don't set any state - UI will show Einstein fallback automatically when null
      }
    };
    loadCameraPhoto();
  }, []);

  // Load lastUploadedPhoto from localStorage on app mount
  useEffect(() => {
    const loadUploadedPhoto = () => {
      const storedUploadedPhoto = loadLastUploadedPhotoFromStorage();
      if (storedUploadedPhoto) {
        setLastUploadedPhotoState(storedUploadedPhoto);
        console.log('✅ Loaded lastUploadedPhoto from localStorage');
      }
    };
    loadUploadedPhoto();
  }, []);

  
  
  // Add state for upload progress
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState('Uploading image...');
  
  // Add the start menu state here
  const [showStartMenu, setShowStartMenu] = useState(true);
  
  // Add state for promotional popup
  const [showPromoPopup, setShowPromoPopup] = useState(false);

  // Add state for out of credits popup
  const [showOutOfCreditsPopup, setShowOutOfCreditsPopup] = useState(false);
  const [lastJobCostEstimate, setLastJobCostEstimate] = useState(null);

  // Stripe purchase modal state
  const [showStripePurchase, setShowStripePurchase] = useState(false);

  // Add state for login upsell popup (for non-authenticated users who've used their demo render)
  const [showLoginUpsellPopup, setShowLoginUpsellPopup] = useState(false);

  // Connection state management
  const [connectionState, setConnectionState] = useState(getCurrentConnectionState());
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Add state for confetti celebration
  const [showConfetti, setShowConfetti] = useState(false);
  
  // Track if confetti has been shown this session (using useRef to persist across renders)
  const confettiShownThisSession = useRef(false);
  const galleryImagesLoadedThisSession = useRef(false);
  
  // Hide confetti immediately when background animations are disabled
  useEffect(() => {
    if (!backgroundAnimationsEnabled && showConfetti) {
      setShowConfetti(false);
    }
  }, [backgroundAnimationsEnabled, showConfetti]);
  
  // Helper function to trigger promotional popup after batch completion
  const triggerPromoPopupIfNeeded = () => {
    // Don't show promo popup if user is already logged in
    if (authState.isAuthenticated) {
      return;
    }
    
    if (shouldShowPromoPopup()) {
      // Add a small delay to let the UI settle after batch completion
      setTimeout(() => {
        setShowPromoPopup(true);
      }, 20000);
    }
  };

  // Helper function to track demo render completion for non-authenticated users
  const trackDemoRenderCompletion = () => {
    // Only track for non-authenticated users
    if (!authState.isAuthenticated && !hasDoneDemoRender()) {
      console.log('✅ Marking demo render as complete for non-authenticated user');
      markDemoRenderDone();
    }
  };

  // Helper function to trigger confetti celebration when batch completes
  const triggerBatchCelebration = () => {
    // Only show confetti if background animations are enabled AND it hasn't been shown this session
    if (backgroundAnimationsEnabled && !confettiShownThisSession.current) {
      // Mark confetti as shown for this session
      confettiShownThisSession.current = true;
      
      // Reset confetti state first, then trigger new animation
      setShowConfetti(false);
      // Small delay to let the final photos settle in and ensure state reset
      setTimeout(() => {
        setShowConfetti(true);
      }, 600);
    }
  };

  // Helper function to trigger confetti celebration when account is created
  const triggerSignupCelebration = () => {
    // Show confetti if background animations are enabled (no session limit for signup)
    if (backgroundAnimationsEnabled) {
      // Reset confetti state first, then trigger new animation
      setShowConfetti(false);
      // Small delay to ensure state reset
      setTimeout(() => {
        setShowConfetti(true);
      }, 600);
    }
  };

  // Add this for testing - you can call this from browser console
  window.showPromoPopupNow = () => {
    setShowPromoPopup(true);
  };
  
  // Add testing function for confetti celebration
  window.testConfettiCelebration = () => {
    if (!backgroundAnimationsEnabled) {
      console.log('🎊 Confetti is disabled. Enable "Background Animations" in settings to see confetti.');
      return;
    }
    
    if (confettiShownThisSession.current) {
      console.log('🎊 Confetti has already been shown this session. It only shows on the first batch completion.');
      console.log('💡 Tip: Refresh the page to reset the session and see confetti again.');
      return;
    }
    
    triggerBatchCelebration();
  };
  
  // Add function to reset confetti session (for testing)
  window.resetConfettiSession = () => {
    confettiShownThisSession.current = false;
    console.log('🎊 Confetti session reset! Next batch completion will show confetti.');
  };
  
  // Add testing function for signup confetti celebration
  window.testSignupConfetti = () => {
    if (!backgroundAnimationsEnabled) {
      console.log('🎊 Confetti is disabled. Enable "Background Animations" in settings to see confetti.');
      return;
    }
    
    console.log('🎉 Testing signup confetti celebration!');
    triggerSignupCelebration();
  };
  
  // Handle promotional popup close
  const handlePromoPopupClose = () => {
    setShowPromoPopup(false);
    markPromoPopupShown();
  };

  const handleOutOfCreditsPopupClose = () => {
    setShowOutOfCreditsPopup(false);
  };

  // Photos array - this will hold either regular photos or gallery photos depending on mode
  const [photos, setPhotos] = useState([]);
  
  // Separate state for regular photos (so they can continue loading in background)
  const [regularPhotos, setRegularPhotos] = useState([]);

  // Separate state for gallery photos
  const [galleryPhotos, setGalleryPhotos] = useState([]);

  // Ensure updates from enhancement write to the appropriate source-of-truth and the displayed list
  const setPhotosProxy = useCallback((updater) => {
    try {
      // Determine source-of-truth based on current page
      const updateSource = currentPage === 'prompts' ? setGalleryPhotos : setRegularPhotos;

      // Update the underlying source-of-truth (regularPhotos or galleryPhotos)
      updateSource(prev => {
        try {
          const next = typeof updater === 'function' ? updater(prev) : updater;
          return next;
        } catch (error) {
          console.error('[APP] Error in setPhotosProxy source updater:', error);
          return prev; // Return unchanged state on error
        }
      });

      // Also update the currently displayed photos for immediate UI response
      setPhotos(prev => {
        try {
          const next = typeof updater === 'function' ? updater(prev) : updater;
          return next;
        } catch (error) {
          console.error('[APP] Error in setPhotosProxy photos updater:', error);
          return prev; // Return unchanged state on error
        }
      });
    } catch (error) {
      console.error('[APP] Error in setPhotosProxy:', error);
    }
  }, [currentPage, setGalleryPhotos, setRegularPhotos, setPhotos]);
  
  
  
  // Effect to sync photos state based on current page
  useEffect(() => {
    if (currentPage === 'prompts') {
      // In gallery mode - show gallery photos
      setPhotos(galleryPhotos);
    } else {
      // In regular mode - show regular photos
      setPhotos(regularPhotos);
    }
  }, [currentPage, regularPhotos, galleryPhotos]);

  // Index of currently selected photo (null => show webcam)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);
  // Which sub-image are we showing from that photo?
  const [selectedSubIndex, setSelectedSubIndex] = useState(0);

  // Countdown 3..2..1 for shutter
  const [countdown, setCountdown] = useState(0);
  // Show flash overlay
  const [showFlash, setShowFlash] = useState(false);

  // Sogni
  const [sogniClient, setSogniClient] = useState(null);
  const [isSogniReady, setIsSogniReady] = useState(false);

  // Camera devices
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedCameraDeviceId, setSelectedCameraDeviceId] = useState(preferredCameraDeviceId || null); // Initialize from settings
  const [isFrontCamera, setIsFrontCamera] = useState(true); // Keep this local state
  const [waitingForCameraPermission, setWaitingForCameraPermission] = useState(false); // Track camera permission request
  const [showPermissionMessage, setShowPermissionMessage] = useState(false); // Show message after delay
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false); // Track if permission was denied

  // State for orientation handler cleanup
  const [orientationHandler, setOrientationHandler] = useState(null);

  // Determine the desired dimensions for Sogni (and camera constraints)
  const { width: desiredWidth, height: desiredHeight } = getCustomDimensions(aspectRatio); // Pass aspectRatio here

  // Drag-and-drop state
  const [dragActive, setDragActive] = useState(false); // Keep this

  // No longer loading Einstein into state - UI handles fallback display directly

  // Add cleanup for orientation handler when component unmounts
  useEffect(() => {
    return () => {
      if (orientationHandler) {
        window.removeEventListener('orientationchange', orientationHandler);
      }
    };
  }, [orientationHandler]);

  // Handle delayed display of camera permission message (2 second delay)
  useEffect(() => {
    let timer;
    
    if (waitingForCameraPermission) {
      // Start a timer to show the message after 2 seconds
      timer = setTimeout(() => {
        setShowPermissionMessage(true);
      }, 2000);
    } else {
      // Clear the message immediately when permission is no longer being waited on
      setShowPermissionMessage(false);
    }
    
    // Cleanup timer on unmount or when waitingForCameraPermission changes
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [waitingForCameraPermission]);

  // When entering Style Explorer (prompt selector), ensure we have a usable
  // reference photo in lastPhotoData by hydrating it from lastAdjustedPhoto
  // if needed. This enables showing the Generate button based on prior photos.
  useEffect(() => {
    let isCancelled = false;
    const ensureReferencePhotoForStyleExplorer = async () => {
      if (currentPage !== 'prompts') return;
      if (lastPhotoData && lastPhotoData.blob) return;
      const editable = lastAdjustedPhoto;
      if (!editable) return;
      try {
        const sourceType = editable.source === 'camera' ? 'camera' : 'upload';
        if (editable.blob) {
          if (editable.dataUrl) {
            if (!isCancelled) setLastPhotoData({ blob: editable.blob, dataUrl: editable.dataUrl, sourceType });
          } else {
            const dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(editable.blob);
            });
            if (!isCancelled) setLastPhotoData({ blob: editable.blob, dataUrl, sourceType });
          }
          return;
        }
        if (editable.dataUrl) {
          const response = await fetch(editable.dataUrl);
          const blob = await response.blob();
          if (!isCancelled) setLastPhotoData({ blob, dataUrl: editable.dataUrl, sourceType });
        }
      } catch (err) {
        console.warn('Failed to hydrate reference photo for Style Explorer:', err);
      }
    };
    ensureReferencePhotoForStyleExplorer();
    return () => { isCancelled = true; };
  }, [currentPage, lastAdjustedPhoto, lastPhotoData]);

  // State for URL-based search parameters
  const [urlSearchTerm, setUrlSearchTerm] = useState('');

  // --- Handle URL parameters for deeplinks ---
  useEffect(() => {
    // Check for all URL parameters
    const url = new URL(window.location.href);
    const promptParam = url.searchParams.get('prompt');
    const pageParam = url.searchParams.get('page');
    const extensionParam = url.searchParams.get('extension');
    const skipWelcomeParam = url.searchParams.get('skipWelcome');
    const themesParam = url.searchParams.get('themes');
    const searchParam = url.searchParams.get('search');
    const referralParam = url.searchParams.get('referral');
    const galleryParam = url.searchParams.get('gallery');
    
    // Handle referral parameter - track the referring user
    if (referralParam) {
      console.log(`[Referral] Referral parameter detected: ${referralParam}`);
      setReferralSource(referralParam);
      trackEvent('Referral', 'visit', `Referred by: ${referralParam}`);
    }
    
    // Skip welcome screen if requested (e.g., from browser extension)
    if (skipWelcomeParam === 'true') {
      setShowSplashScreen(false);
      
      // Remove skipWelcome parameter from URL to prevent it from persisting
      url.searchParams.delete('skipWelcome');
      const newUrl = url.pathname + url.search;
      const currentState = window.history.state || {};
      window.history.replaceState(currentState, '', newUrl);
    }
    
    // Handle page=camera parameter to skip start menu and go to camera
    if (pageParam === 'camera') {
      console.log('🎃 Halloween: page=camera detected, skipping start menu');
      setShowStartMenu(false);
      setCurrentPage('camera');
      setShowPhotoGrid(false); // Ensure we're not showing photo grid
      
      // Start camera immediately
      const initCamera = async () => {
        await listCameras();
        const preferredDeviceId = preferredCameraDeviceId || selectedCameraDeviceId;
        console.log('📹 Starting camera from Halloween redirect:', preferredDeviceId || 'auto-select');
        await startCamera(preferredDeviceId);
        setCameraManuallyStarted(true);
      };
      initCamera();
    }
    
    // Initialize history state on first load if not already set
    if (!window.history.state || !window.history.state.navigationContext) {
      const initialContext = { from: 'initial', timestamp: Date.now() };
      window.history.replaceState({ navigationContext: initialContext }, '', window.location.href);
    }

    // Handle page parameter for direct navigation
    if (pageParam === 'prompts') {
      setCurrentPage('prompts');
      setShowPhotoGrid(true);
      
      // If this is from the extension, set up extension mode
      if (extensionParam === 'true') {
        window.extensionMode = true;
        document.body.classList.add('extension-mode'); // Add CSS class for styling
        
        // Set up message listener for extension communication
        const handleExtensionMessage = (event) => {
          // Only log important extension messages
          if (event.data.type === 'styleSelected' || event.data.type === 'useThisStyle') {
            console.log('Extension message:', event.data.type);
          }
        };
        
        window.addEventListener('message', handleExtensionMessage);
      }
    }
    
    // Handle theme filters parameter
    if (themesParam && currentPage === 'prompts') {
      try {
        const themeIds = themesParam.split(',');
        const defaultState = getDefaultThemeGroupState();
        const newThemeState = Object.fromEntries(
          Object.keys(defaultState).map(groupId => [
            groupId, 
            themeIds.includes(groupId)
          ])
        );
        setCurrentThemeState(newThemeState);
        saveThemeGroupPreferences(newThemeState);
      } catch (error) {
        console.warn('Invalid themes parameter:', themesParam);
      }
    }
    
    // Handle search parameter
    if (searchParam && currentPage === 'prompts') {
      setUrlSearchTerm(searchParam);
    }
    
    // IMPORTANT: Only apply URL prompt parameter on initial load or when navigating via URL
    // Don't override user's explicit style selections
    const userHasExplicitlySelectedStyle = localStorage.getItem('sogni_style_explicitly_selected') === 'true';
    
    // Only process URL prompt parameter if:
    // 1. User hasn't explicitly selected a style yet (first visit or fresh session)
    // 2. There's a prompt parameter in the URL
    // 3. We're not in copyImageStyle mode (which should never be overridden)
    if (promptParam && stylePrompts && !userHasExplicitlySelectedStyle && selectedStyle !== 'copyImageStyle') {
        // If the prompt exists in our style prompts, select it
        if (stylePrompts[promptParam] || Object.keys(promptsData).includes(promptParam)) {
        console.log(`Setting style from URL parameter (initial load): ${promptParam}`);
          updateSetting('selectedStyle', promptParam);
          // If we have the prompt value, set it too
          if (stylePrompts[promptParam]) {
            updateSetting('positivePrompt', stylePrompts[promptParam]);
          }
          // Update current hashtag
          setCurrentHashtag(promptParam);
        }
    } else if (selectedStyle === 'copyImageStyle' && promptParam) {
      // We're in copyImageStyle mode - clear any URL prompt parameters
      console.log(`⚠️ selectedStyle is copyImageStyle - ensuring URL prompt parameter is cleared`);
        updateUrlWithPrompt('copyImageStyle');
      }
  }, [stylePrompts, promptsData, currentPage]); // Removed selectedStyle from dependencies to prevent circular loop
  
  // Handle browser navigation (back/forward) - allow URL prompt parameter to apply
  useEffect(() => {
    const handlePopState = () => {
      const url = new URL(window.location.href);
      const promptParam = url.searchParams.get('prompt');
      
      // When user navigates back/forward, clear the explicit selection flag
      // so URL parameter can take effect
      if (promptParam && stylePrompts) {
        console.log(`📍 Navigation detected, allowing URL parameter to apply: ${promptParam}`);
        localStorage.removeItem('sogni_style_explicitly_selected');
        
        // Apply the URL parameter
        if (stylePrompts[promptParam] || Object.keys(promptsData).includes(promptParam)) {
          updateSetting('selectedStyle', promptParam);
          if (stylePrompts[promptParam]) {
            updateSetting('positivePrompt', stylePrompts[promptParam]);
          }
          setCurrentHashtag(promptParam);
        }
      }
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [stylePrompts, promptsData]);
  
  // Handle gallery URL parameter for deep linking to Community Gallery
  useEffect(() => {
    const url = new URL(window.location.href);
    const galleryParam = url.searchParams.get('gallery');
    
    if (galleryParam && currentPage === 'prompts' && galleryPhotos.length > 0) {
      console.log('🖼️ Gallery deep link detected:', galleryParam);
      
      // Find the photo with this promptKey in galleryPhotos
      const photoIndex = galleryPhotos.findIndex(p => 
        p.promptKey === galleryParam || p.selectedStyle === galleryParam
      );
      
      if (photoIndex !== -1) {
        console.log('🖼️ Found gallery photo at index:', photoIndex);
        // Small delay to ensure everything is rendered
        setTimeout(() => {
          setSelectedPhotoIndex(photoIndex);
          // Note: wantsFullscreen state is managed by PhotoGallery component
          // We just need to navigate to the photo
        }, 300);
      } else {
        console.warn('🖼️ Gallery prompt not found:', galleryParam);
      }
    }
  }, [currentPage, galleryPhotos]);




  // Load gallery images when entering prompt selector mode
  useEffect(() => {
    const loadGalleryForPromptSelector = async () => {
      if (currentPage === 'prompts' && stylePrompts && Object.keys(stylePrompts).length > 0) {
        const promptCount = Object.keys(stylePrompts).length;
        
        // Validate that stylePrompts is fully loaded (should have 200+ styles)
        // If we have fewer than 50 prompts, it's likely still loading/filtering
        if (promptCount < 50) {
          console.log(`StylePrompts not fully loaded yet (${promptCount} prompts), waiting...`);
          return;
        }
        
        // Prevent loading more than once per session - check this FIRST before any async operations
        if (galleryImagesLoadedThisSession.current) {
          console.log('Gallery images already loaded this session (ref check), skipping reload');
          return;
        }
        
        // Set the flag immediately to prevent race conditions from multiple renders
        console.log(`Setting galleryImagesLoadedThisSession flag with ${promptCount} prompts loaded`);
        galleryImagesLoadedThisSession.current = true;
        
        // Check if all theme groups are deselected and auto-reselect them
        const currentThemePrefs = getThemeGroupPreferences();
        const allDeselected = Object.keys(currentThemePrefs).length > 0 && 
          Object.values(currentThemePrefs).every(value => value === false);
        
        if (allDeselected) {
          console.log('All theme groups are deselected, auto-reselecting all styles for Style Explorer');
          const allSelected = getDefaultThemeGroupState();
          saveThemeGroupPreferences(allSelected);
          // Update the current theme state to reflect the change
          setCurrentThemeState(allSelected);
        }
        
        try {
          console.log(`Loading gallery images for prompt selector with ${promptCount} prompts...`);

          // Import the loadGalleryImages function
          const { loadGalleryImages } = await import('./utils/galleryLoader');
          const loadedGalleryPhotos = await loadGalleryImages(stylePrompts, portraitType, promptsDataRaw);

          if (loadedGalleryPhotos.length > 0) {
            console.log(`Loaded ${loadedGalleryPhotos.length} gallery images for prompt selector`);
            setGalleryPhotos(loadedGalleryPhotos);
            // Also immediately update the photos state since we're in prompt selector mode
            // This prevents a race condition where photos might be empty when PhotoGallery renders
            setPhotos(loadedGalleryPhotos);
            console.log(`Updated photos state with ${loadedGalleryPhotos.length} gallery images to prevent race condition`);
          } else {
            console.warn('No gallery images found for prompt selector');
            // Reset the flag if loading failed so it can be retried
            galleryImagesLoadedThisSession.current = false;
          }
        } catch (error) {
          console.error('Error loading gallery images for prompt selector:', error);
          // Reset the flag if loading failed so it can be retried
          galleryImagesLoadedThisSession.current = false;
        }
      }
    };

    loadGalleryForPromptSelector();
  }, [currentPage, stylePrompts, portraitType]);

  // Manage polaroid border CSS variables for sample gallery mode
  useEffect(() => {
    const root = document.documentElement;
    
    if (currentPage === 'prompts') {
      // Entering sample gallery mode - save current values and set to default
      const currentSideBorder = getComputedStyle(root).getPropertyValue('--polaroid-side-border').trim();
      const currentBottomBorder = getComputedStyle(root).getPropertyValue('--polaroid-bottom-border').trim();
      
      // Save original values to restore later
      root.style.setProperty('--original-side-border', currentSideBorder);
      root.style.setProperty('--original-bottom-border', currentBottomBorder);
      
      // Set to default "no theme selected" values for sample gallery
      root.style.setProperty('--polaroid-side-border', '24px');
      root.style.setProperty('--polaroid-bottom-border', '84px');
      
      console.log('Sample gallery: Set polaroid borders to default values');
    } else {
      // Exiting sample gallery mode - restore original values
      const originalSideBorder = getComputedStyle(root).getPropertyValue('--original-side-border').trim();
      const originalBottomBorder = getComputedStyle(root).getPropertyValue('--original-bottom-border').trim();
      
      if (originalSideBorder) {
        root.style.setProperty('--polaroid-side-border', originalSideBorder);
        root.style.removeProperty('--original-side-border');
      }
      if (originalBottomBorder) {
        root.style.setProperty('--polaroid-bottom-border', originalBottomBorder);
        root.style.removeProperty('--original-bottom-border');
      }
      
      console.log('Sample gallery: Restored original polaroid border values');
    }
  }, [currentPage]);

  // Function to load prompts based on current model
  const loadPromptsForModel = async (modelId) => {
    try {
      const prompts = await initializeStylePrompts(modelId);
      setStylePrompts(prompts);
      console.log(`Loaded prompts for model ${modelId}:`, Object.keys(prompts).length);
    } catch (error) {
      console.error('Error loading prompts:', error);
    }
  };

  // Load prompts on component mount and when model changes
  useEffect(() => {
    loadPromptsForModel(selectedModel);
  }, [selectedModel]);

  // Load themes on startup and set default theme if needed
  useEffect(() => {
    const loadDefaultTheme = async () => {
      try {
        // Pre-load theme configuration
        await themeConfigService.loadConfig();
        
        // Validate that the current theme exists in the config
        if (tezdevTheme !== 'off') {
          const theme = await themeConfigService.getTheme(tezdevTheme);
          if (!theme) {
            // Theme no longer exists - reset to 'off' and clear from storage
            console.warn(`Theme '${tezdevTheme}' not found in config, resetting to 'off'`);
            updateSetting('tezdevTheme', 'off');
            saveSettingsToCookies({ tezdevTheme: 'off' });
            // Note: No need to return here, we'll check for default theme below
          } else {
            // Theme exists and is valid, no action needed
            return;
          }
        }
        
        // Set default theme if current theme is 'off' and there's a default configured
        if (tezdevTheme === 'off') {
          const defaultTheme = await themeConfigService.getDefaultTheme();
          if (defaultTheme) {
            console.log('Setting default theme:', defaultTheme);
            updateSetting('tezdevTheme', defaultTheme);
            saveSettingsToCookies({ tezdevTheme: defaultTheme });
            
            // Set default aspect ratio for the theme
            const theme = await themeConfigService.getTheme(defaultTheme);
            if (theme?.defaultAspectRatio) {
              updateSetting('aspectRatio', theme.defaultAspectRatio);
              saveSettingsToCookies({ aspectRatio: theme.defaultAspectRatio });
            }
          }
        }
      } catch (error) {
        console.warn('Could not load default theme:', error);
      }
    };

    loadDefaultTheme();
  }, []); // Only run on mount

  // Note: Model/style/prompt resets now happen in AppContext initialization
  // This ensures they happen before any useEffect runs, preventing race conditions

  // Load style reference image from localStorage on app initialization
  useEffect(() => {
    const loadStyleReference = async () => {
      try {
        const savedStyleRef = localStorage.getItem('sogni_styleReferenceImage');
        if (savedStyleRef) {
          const { croppedDataUrl, originalDataUrl } = JSON.parse(savedStyleRef);
          console.log('💾 Loading style reference from localStorage');
          
          // Convert data URLs back to blobs
          const croppedResponse = await fetch(croppedDataUrl);
          const croppedBlob = await croppedResponse.blob();
          
          const originalResponse = await fetch(originalDataUrl);
          const originalBlob = await originalResponse.blob();
          
          // Recreate the style reference object
          // Use the croppedDataUrl for display since it's a persistent data URL
          setStyleReferenceImage({
            blob: originalBlob,
            dataUrl: croppedDataUrl, // Use croppedDataUrl for display (it's a persistent data URL)
            croppedBlob: croppedBlob,
            croppedDataUrl: croppedDataUrl
          });
          
          // Note: We don't auto-restore copyImageStyle mode on page refresh
          // The user needs to manually select it again after refresh
          // This is because we reset the model to Sogni Turbo on refresh
          console.log('💾 Style reference loaded from localStorage (mode not auto-restored)');
        }
      } catch (error) {
        console.warn('Failed to load style reference from localStorage:', error);
        // Clear corrupted data
        localStorage.removeItem('sogni_styleReferenceImage');
      }
    };

    loadStyleReference();
  }, []); // Only run on mount

  // Update CSS variables when theme changes
  useEffect(() => {
    const updatePolaroidBorders = () => {
      const root = document.documentElement;
      
      // In Style Explorer (prompts mode), always show default polaroid borders regardless of theme
      if (currentPage === 'prompts') {
        // Don't modify borders here - let the prompts mode effect handle it
        return;
      }
      
      if (tezdevTheme !== 'off') {
        // Theme frame is active - remove polaroid borders since theme provides its own
        root.style.setProperty('--polaroid-side-border', '0px');
        root.style.setProperty('--polaroid-bottom-border', '0px');
      } else {
        // No theme frame - remove any inline styles to let CSS media queries control the borders
        root.style.removeProperty('--polaroid-side-border');
        root.style.removeProperty('--polaroid-bottom-border');
      }
    };

    updatePolaroidBorders();
  }, [tezdevTheme, currentPage]);

  // At the top of App component, add a new ref for tracking project state
  const projectStateReference = useRef({
    currentPhotoIndex: 0,
    jobs: new Map(), // Map<jobId, {index: number, status: string, resultUrl?: string}>
    startedJobs: new Set(), // Track which indices have started jobs
    completedJobs: new Map(), // Store completed jobs that arrive before start
    pendingCompletions: new Map() // Store completions that arrive before we have the mapping
  });

  // Add a state to control the visibility of the overlay panel
  const [showControlOverlay, setShowControlOverlay] = useState(false); // Keep this
  // Add a state to control auto-focus of positive prompt
  const [autoFocusPositivePrompt, setAutoFocusPositivePrompt] = useState(false);
  // Add a state to control the custom dropdown visibility

  // Add new state for button cooldown
  const [isPhotoButtonCooldown, setIsPhotoButtonCooldown] = useState(false); // Keep this
  // Ref to track current project
  const activeProjectReference = useRef(null);
  const activeProjectObjectReference = useRef(null); // Keep this
  
  // Ref to track project timeouts and job state
  const projectTimeoutRef = useRef({
    overallTimer: null,
    watchdogTimer: null,
    jobTimers: new Map(),
    projectStartTime: null,
    lastProgressTime: null
  });

  // Add state for current thought
  const [currentThought, setCurrentThought] = useState(null); // Keep this

  // Add state to track if camera has been manually started by the user
  const [cameraManuallyStarted, setCameraManuallyStarted] = useState(false);

  // Add state for Twitter share modal
  const [showTwitterModal, setShowTwitterModal] = useState(false);
  const [twitterPhotoIndex, setTwitterPhotoIndex] = useState(null);
  const [lastTwitterMessage, setLastTwitterMessage] = useState(null);

  // Add state for QR code modal (Kiosk Mode)
  const [qrCodeData, setQrCodeData] = useState(null);

  // Add state for splash screen (DISABLED - CameraStartMenu is now the splash screen)
  const [showSplashScreen, setShowSplashScreen] = useState(false);
  const [splashTriggeredByInactivity, setSplashTriggeredByInactivity] = useState(false);
  
  // Debug: Log when splash screen state changes
  useEffect(() => {
    console.log('🎬 Splash screen state changed:', showSplashScreen ? 'SHOWING' : 'HIDDEN');
  }, [showSplashScreen]);

  // Debug: Log current inactivity settings
  // Effect: Debug logging for inactivity settings
  useEffect(() => {
    console.log('⚙️ Inactivity settings:', {
      showSplashOnInactivity,
      inactivityTimeout,
      settingsObject: settings // OK to use whole object in logging, not in logic
    });
    
    // Check what's actually in localStorage
    const storedValue = localStorage.getItem('sogni_showSplashOnInactivity');
    console.log('💾 Value in localStorage:', storedValue);
  }, [showSplashOnInactivity, inactivityTimeout]); // Removed settings - it's only for logging, not logic
  
  // Inactivity timer for splash screen
  const inactivityTimerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());

  // Cleanup timeouts when component unmounts
  useEffect(() => {
    return () => {
      clearAllTimeouts();
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, []);

  // Function to reset inactivity timer
  const resetInactivityTimer = useCallback(() => {
    console.log('🔄 Resetting inactivity timer', {
      showSplashOnInactivity,
      showSplashScreen,
      inactivityTimeout,
      timestamp: new Date().toLocaleTimeString()
    });
    
    lastActivityRef.current = Date.now();
    
    if (inactivityTimerRef.current) {
      console.log('⏹️ Clearing existing timer');
      clearTimeout(inactivityTimerRef.current);
    }
    
    // DISABLED: Old splash screen inactivity trigger (CameraStartMenu is now the splash screen)
    // if (showSplashOnInactivity && !showSplashScreen) {
    //   console.log(`⏰ Setting new timer for ${inactivityTimeout} seconds`);
    //   inactivityTimerRef.current = setTimeout(() => {
    //     console.log('🚀 Inactivity timeout reached - showing splash screen');
    //     setSplashTriggeredByInactivity(true);
    //     setShowSplashScreen(true);
    //   }, inactivityTimeout * 1000);
    // } else {
    //   console.log('❌ Not setting timer:', {
    //     showSplashOnInactivity: showSplashOnInactivity ? 'enabled' : 'disabled',
    //     showSplashScreen: showSplashScreen ? 'already showing' : 'hidden'
    //   });
    // }
  }, [showSplashOnInactivity, inactivityTimeout, showSplashScreen]);

  // Set up inactivity detection
  useEffect(() => {

    if (!showSplashOnInactivity) {
      console.log('🚫 Inactivity detection disabled - clearing timer');
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return;
    }

    const events = ['mousedown', 'keypress', 'scroll', 'touchstart', 'click'];
    
    // Throttle mousemove to avoid excessive logging and timer resets
    let mouseMoveThrottle = null;
    const handleMouseMove = () => {
      if (mouseMoveThrottle) return;
      console.log('👆 User activity detected: mousemove (throttled)');
      resetInactivityTimer();
      mouseMoveThrottle = setTimeout(() => {
        mouseMoveThrottle = null;
      }, 1000); // Throttle to once per second
    };
    
    const handleActivity = (event) => {
      console.log('👆 User activity detected:', event.type);
      resetInactivityTimer();
    };

    console.log('📡 Adding event listeners for:', [...events, 'mousemove (throttled)']);
    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, handleActivity, true);
    });
    // Add throttled mousemove listener
    document.addEventListener('mousemove', handleMouseMove, true);

    // Start the timer if splash screen is not currently showing
    if (!showSplashScreen) {
      console.log('🎬 Splash screen not showing - starting inactivity timer');
      resetInactivityTimer();
    } else {
      console.log('🎬 Splash screen already showing - not starting timer');
    }

    return () => {
      console.log('🧹 Cleaning up inactivity detection');
      // Cleanup event listeners
      events.forEach(event => {
        document.removeEventListener(event, handleActivity, true);
      });
      document.removeEventListener('mousemove', handleMouseMove, true);
      if (mouseMoveThrottle) {
        clearTimeout(mouseMoveThrottle);
      }
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [showSplashOnInactivity, inactivityTimeout, showSplashScreen, resetInactivityTimer]);

  // Track page views when view changes
  useEffect(() => {
    // Get current view state based on app state
    let currentView = 'start-menu';
    
    if (selectedPhotoIndex !== null) {
      // Track individual photo view
      currentView = `photo/${selectedPhotoIndex}`;
    } else if (showPhotoGrid) {
      currentView = 'gallery';
    } else if (!showStartMenu) {
      currentView = 'camera';
    }
    
    // Send page view to Google Analytics
    trackPageView(currentView);
    
    // Track view change events
    if (currentView !== 'start-menu') {
      trackEvent('Navigation', 'view_change', currentView);
    }
  }, [selectedPhotoIndex, showPhotoGrid, showStartMenu]);

  // --- Ensure handlers are defined here, before any JSX or usage ---
  // Helper function to check if a style is from the Christmas/Winter category
  const isWinterStyle = (styleKey) => {
    if (!styleKey || styleKey === 'custom' || styleKey === 'random' || styleKey === 'randomMix' || styleKey === 'oneOfEach' || styleKey === 'browseGallery') {
      return false;
    }
    const winterPrompts = promptsDataRaw['christmas-winter']?.prompts || {};
    return styleKey in winterPrompts;
  };

  // Update handleUpdateStyle to use updateSetting and update URL
  const handleUpdateStyle = (style) => {
    // Handle special case for browseGallery
    if (style === 'browseGallery') {
      updateSetting('selectedStyle', style);
      updateSetting('positivePrompt', ''); // No prompt for gallery browsing
      updateUrlWithPrompt(null); // Clear URL parameter
      setCurrentHashtag(null); // Clear hashtag
      updateSetting('halloweenContext', false); // Clear Halloween context
      updateSetting('winterContext', false); // Clear Winter context
      // Clear manual overrides when explicitly selecting a style
      updateSetting('seed', '');
      updateSetting('negativePrompt', '');
      updateSetting('stylePrompt', '');
      // Mark that user has explicitly selected a style
      localStorage.setItem('sogni_style_explicitly_selected', 'true');
      return;
    }
    
    // Determine if this is a winter style (for model switching)
    const shouldSwitchToWinterModel = isWinterStyle(style);
    
    // Set non-model settings first
    updateSetting('selectedStyle', style); 
    if (style === 'custom') {
      updateSetting('positivePrompt', ''); 
    } else {
      const prompt = stylePrompts[style] || '';
      updateSetting('positivePrompt', prompt); 
      // Clear Halloween context when switching away from custom style
      updateSetting('halloweenContext', false);
    }
    
    // Set winter context
    if (shouldSwitchToWinterModel) {
      updateSetting('winterContext', true);
    } else {
      updateSetting('winterContext', false);
    }
    
    // Clear manual overrides when explicitly selecting a style
    // This ensures fresh generation with the new style's defaults
    updateSetting('seed', '');
    updateSetting('negativePrompt', '');
    updateSetting('stylePrompt', '');
    
    // Update the URL with the prompt parameter
    updateUrlWithPrompt(style);
    
    // Update current hashtag for sharing
    setCurrentHashtag(getHashtagForStyle(style));
    
    // Mark that user has explicitly selected a style
    localStorage.setItem('sogni_style_explicitly_selected', 'true');
    
    // Set model LAST so all pending settings are captured
    if (shouldSwitchToWinterModel) {
      console.log('❄️ Christmas/Winter style detected, auto-switching to DreamShaper model');
      dreamShaperAutoSelectedRef.current = true; // Mark as auto-selected
      const wasAlreadyDreamShaper = selectedModel === 'coreml-dreamshaperXL_v21TurboDPMSDE';
      updateSetting('selectedModel', 'coreml-dreamshaperXL_v21TurboDPMSDE');
      
      // Show toast notification ONLY if model is actually changing
      if (!wasAlreadyDreamShaper) {
        showToast({
          type: 'info',
          title: 'Model Changed',
          message: 'Switched to DreamShaper for winter theme',
          timeout: 4000
        });
      }
    }
  };


  // Handle using a gallery prompt - switches to that prompt and generates new images
  const handleUseGalleryPrompt = async (promptKey) => {
    try {
      console.log(`Using gallery prompt: ${promptKey}`);
      
      // Check if we're in extension mode
      console.log('🔍 Extension mode check:');
      console.log('  - window.extensionMode:', window.extensionMode);
      console.log('  - window.parent !== window:', window.parent !== window);
      console.log('  - Both conditions:', window.extensionMode && window.parent !== window);
      
      if (window.extensionMode && window.parent !== window) {
        console.log('🚀 Extension mode: posting useThisStyle message to parent window');
        console.log('🎯 PromptKey:', promptKey);
        // Get the style prompt for this key
        const stylePrompt = stylePrompts[promptKey] || promptsData[promptKey] || `Transform into ${promptKey} style`;
        console.log('📝 Style prompt:', stylePrompt);
        console.log('📚 Available stylePrompts keys:', Object.keys(stylePrompts).slice(0, 10));
        console.log('📚 Available promptsData keys:', Object.keys(promptsData).slice(0, 10));
        
        const message = {
          type: 'useThisStyle',
          promptKey: promptKey,
          stylePrompt: stylePrompt
        };
        console.log('📤 Sending message:', JSON.stringify(message, null, 2));
        
        try {
          // Post message to parent window (the extension)
          window.parent.postMessage(message, '*');
          console.log('✅ Message sent to parent window successfully');
        } catch (error) {
          console.error('❌ Error sending message to parent:', error);
        }
        return;
      } else {
        console.log('❌ Extension mode conditions not met - proceeding with normal flow');
      }
      
      // First, close the photo detail view and return to grid
      setSelectedPhotoIndex(null);
      
      // Check if we have lastPhotoData to use for generation
      if (!lastPhotoData || !lastPhotoData.blob) {
        console.log('No reference photo available - switching prompt and returning to camera');
        // Switch to the selected prompt
        handleUpdateStyle(promptKey);
        // Return to camera view so user can take a new photo with the selected prompt
        handleBackToCamera();
        return;
      }
      
      // Transition from Sample Gallery mode back to regular photo grid mode
      console.log('Transitioning from Sample Gallery mode to regular photo grid mode');
      setCurrentPage('camera'); // Exit Sample Gallery mode
      setShowPhotoGrid(true);   // Show regular photo grid
      
      // Set up pending gallery prompt to trigger generation when state updates
      console.log(`Setting pending gallery prompt: ${promptKey}`);
      setPendingGalleryPrompt(promptKey);
      
      // Switch to the selected prompt - the useEffect will handle generation when state updates
      handleUpdateStyle(promptKey);
      
      console.log(`Prompt switch initiated for: ${promptKey}, transitioning to regular photo grid`);
    } catch (error) {
      console.error('Error using gallery prompt:', error);
    }
  };


  // Track navigation source for proper back button behavior
  const navigationSourceRef = useRef('startMenu');

  // Navigation handlers for prompt selector page
  const handleNavigateToPromptSelector = () => {
    // Clear selected photo state when entering Sample Gallery mode
    setSelectedPhotoIndex(null);

    // Close ImageAdjuster if it's open
    setShowImageAdjuster(false);
    setShowStyleReferenceAdjuster(false);
    if (currentUploadedImageUrl) {
      URL.revokeObjectURL(currentUploadedImageUrl);
      setCurrentUploadedImageUrl('');
    }

    // Stop camera when entering Sample Gallery mode
    stopCamera();

    // Store where we're coming from for back button navigation
    navigationSourceRef.current = showPhotoGrid && photos.length > 0 ? 'photoGrid' : 'startMenu';
    
    // Store navigation context to know where we came from
    const navigationContext = {
      from: navigationSourceRef.current,
      timestamp: Date.now()
    };

    // Set page to prompts (Sample Gallery mode)
    setCurrentPage('prompts');

    // Update URL to reflect prompts page (use pushState to add to history)
    updateUrlParams({ page: 'prompts' }, { usePushState: true, navigationContext });

    // Ensure photo grid is shown in Sample Gallery mode
    setShowPhotoGrid(true);
  };

  const handleBackToCameraFromPromptSelector = (fromPopStateOrEvent = false) => {
    // Check if first argument is a React event object (has nativeEvent property)
    // If so, treat as false; otherwise use the actual boolean value
    const fromPopState = fromPopStateOrEvent?.nativeEvent !== undefined ? false : fromPopStateOrEvent;
    
    console.log('📸 Navigating from Style Explorer to start menu, fromPopState:', fromPopState);
    console.log('📸 Current selectedStyle:', selectedStyle);
    console.log('📸 Has styleReferenceImage:', !!styleReferenceImage?.croppedBlob);
    console.log('📸 Current model:', selectedModel);
    
    // FAILSAFE: If we have a style reference image and model is Flux Kontext, ensure copyImageStyle is set
    if (styleReferenceImage?.croppedBlob && isFluxKontextModel(selectedModel) && selectedStyle !== 'copyImageStyle') {
      console.warn('🚨 FAILSAFE: Style reference exists and model is Flux Kontext but style is not copyImageStyle!');
      console.warn('🚨 Forcing selectedStyle to copyImageStyle');
      updateSetting('selectedStyle', 'copyImageStyle');
      saveSettingsToCookies({ selectedStyle: 'copyImageStyle' });
    }
    
    // Update URL FIRST before changing state
    // Use replaceState (not pushState) to avoid creating redundant history entries
    if (!fromPopState) {
      // Clear page, prompt, and gallery parameters
      updateUrlParams({ page: null, prompt: null, gallery: null }, { usePushState: false });
      console.log('📸 URL updated, removed page, prompt, and gallery params. New URL:', window.location.href);
    }

    // Clear selected photo state when leaving Sample Gallery mode
    setSelectedPhotoIndex(null);

    // Close any open overlays to prevent white overlay bug
    setShowControlOverlay(false);
    setAutoFocusPositivePrompt(false);

    // Hide photo grid to prevent film-strip-container from rendering
    setShowPhotoGrid(false);

    // Set page back to camera
    setCurrentPage('camera');
    console.log('📸 Set currentPage to camera');

    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Hide slothicorn if visible
    if (slothicornReference.current) {
      slothicornReference.current.style.setProperty('bottom', '-360px', 'important');
      slothicornReference.current.classList.remove('animating');
    }

    // Show the start menu so user can choose camera or upload
    setShowStartMenu(true);
  };

  const handleBackToPhotosFromPromptSelector = (fromPopStateOrEvent = false) => {
    // Check if first argument is a React event object (has nativeEvent property)
    // If so, treat as false; otherwise use the actual boolean value
    const fromPopState = fromPopStateOrEvent?.nativeEvent !== undefined ? false : fromPopStateOrEvent;
    
    // Clear selected photo state when leaving Sample Gallery mode
    setSelectedPhotoIndex(null);

    // Close any open overlays to prevent white overlay bug
    setShowControlOverlay(false);
    setAutoFocusPositivePrompt(false);

    // Set page back to camera (this exits Sample Gallery mode)
    setCurrentPage('camera');

    // Update URL to reflect camera page and clear gallery param
    // Use replaceState (not pushState) to avoid creating redundant history entries
    if (!fromPopState) {
      updateUrlParams({ page: null, gallery: null }, { usePushState: false });
    }

    // Show photo grid to display user's photos
    setShowPhotoGrid(true);

    // Don't restart camera - user wants to see their photos, not take new ones
    console.log('📸 Navigating from Style Explorer to user photo grid');

    // Small delay to ensure state updates properly
    setTimeout(() => {
      // Scroll to top for smooth transition
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 50);
  };

  // Prompt selection handlers for the new page
  const handlePromptSelectFromPage = (promptKey, gallerySeed = undefined, galleryMetadata = undefined) => {
    // Check if we're in extension mode
    if (window.extensionMode && window.parent !== window) {
      console.log('🚀 Extension mode: posting styleSelected message to parent window');
      console.log('🎯 PromptKey:', promptKey);
      // Get the style prompt for this key
      const stylePrompt = stylePrompts[promptKey] || promptsData[promptKey] || `Transform into ${promptKey} style`;
      console.log('📝 Style prompt:', stylePrompt);
      
      const message = {
        type: 'styleSelected',
        styleKey: promptKey,
        stylePrompt: stylePrompt
      };
      console.log('📤 Sending message:', message);
      
      // Post message to parent window (the extension)
      window.parent.postMessage(message, '*');
      console.log('✅ Message sent to parent window');
      return;
    }
    
    console.log('🎨 [handlePromptSelectFromPage] Selecting style:', promptKey);
    console.log('🎨 [handlePromptSelectFromPage] Current selectedStyle before update:', selectedStyle);
    
    // Track if we need to switch models (do this LAST to capture all pending settings)
    const shouldSwitchModel = galleryMetadata?.model || (isWinterStyle(promptKey) && 'coreml-dreamshaperXL_v21TurboDPMSDE');
    
    // Update style and URL for deep linking
    updateSetting('selectedStyle', promptKey);
    if (promptKey === 'custom') {
      updateSetting('positivePrompt', ''); 
    } else {
      const prompt = stylePrompts[promptKey] || '';
      updateSetting('positivePrompt', prompt);
      // Clear Halloween context when switching to a preset style
      updateSetting('halloweenContext', false);
      // Set winter context if it's a winter style
      if (isWinterStyle(promptKey)) {
        updateSetting('winterContext', true);
      } else {
        updateSetting('winterContext', false);
      }
    }
    
    // If a gallery variation is selected, use its seed
    if (gallerySeed !== undefined) {
      console.log('🎲 Using gallery variation seed:', gallerySeed);
      updateSetting('seed', String(gallerySeed));
    } else {
      // Clear manual overrides when explicitly selecting a fresh style
      // (but not when selecting a gallery variation with a specific seed)
      updateSetting('seed', '');
      updateSetting('negativePrompt', '');
      updateSetting('stylePrompt', '');
    }
    
    // Update current hashtag for sharing
    setCurrentHashtag(getHashtagForStyle(promptKey));
    // Update URL with selected prompt for deep linking
    updateUrlWithPrompt(promptKey);
    
    // Mark that user has explicitly selected a style
    localStorage.setItem('sogni_style_explicitly_selected', 'true');
    
    // Switch model LAST so all pending settings are captured
    if (shouldSwitchModel) {
      if (galleryMetadata?.model) {
        console.log('🤖 [App] Switching to gallery entry model:', galleryMetadata.model);
        switchToModel(galleryMetadata.model);
      } else if (isWinterStyle(promptKey)) {
        console.log('❄️ Christmas/Winter style detected from gallery, auto-switching to DreamShaper model');
        dreamShaperAutoSelectedRef.current = true; // Mark as auto-selected
        const wasAlreadyDreamShaper = selectedModel === 'coreml-dreamshaperXL_v21TurboDPMSDE';
        updateSetting('selectedModel', 'coreml-dreamshaperXL_v21TurboDPMSDE');
        
        // Show toast notification ONLY if model is actually changing
        if (!wasAlreadyDreamShaper) {
          showToast({
            type: 'info',
            title: 'Model Changed',
            message: 'Switched to DreamShaper for winter theme',
            timeout: 4000
          });
        }
      }
    }
    
    // Close the photo popup to provide visual feedback that the style was selected
    setSelectedPhotoIndex(null);
    
    console.log('🎨 [handlePromptSelectFromPage] Style selection complete, promptKey:', promptKey);
  };

  const handleRandomMixFromPage = () => {
    // Update style and URL for deep linking
    updateSetting('selectedStyle', 'randomMix');
    updateSetting('positivePrompt', '');
    setCurrentHashtag(null);
    updateSetting('halloweenContext', false); // Clear Halloween context
    // Update URL (randomMix will clear the prompt parameter)
    updateUrlWithPrompt('randomMix');
    // Mark that user has explicitly selected a style
    localStorage.setItem('sogni_style_explicitly_selected', 'true');
    // Don't automatically redirect - let user choose to navigate with camera/photos buttons
  };

  const handleRandomSingleFromPage = () => {
    // Update style and URL for deep linking
    updateSetting('selectedStyle', 'random');
    updateSetting('positivePrompt', '');
    setCurrentHashtag(null);
    updateSetting('halloweenContext', false); // Clear Halloween context
    // Update URL (random will clear the prompt parameter)
    updateUrlWithPrompt('random');
    // Mark that user has explicitly selected a style
    localStorage.setItem('sogni_style_explicitly_selected', 'true');
    // Don't automatically redirect - let user choose to navigate with camera/photos buttons
  };

  const handleOneOfEachFromPage = () => {
    // Update style and URL for deep linking
    updateSetting('selectedStyle', 'oneOfEach');
    updateSetting('positivePrompt', '');
    setCurrentHashtag(null);
    updateSetting('halloweenContext', false); // Clear Halloween context
    // Update URL (oneOfEach will clear the prompt parameter)
    updateUrlWithPrompt('oneOfEach');
    // Mark that user has explicitly selected a style
    localStorage.setItem('sogni_style_explicitly_selected', 'true');
    // Don't automatically redirect - let user choose to navigate with camera/photos buttons
  };

  const handleCustomFromSampleGallery = () => {
    // For Sample Gallery mode - just switch to custom style
    updateSetting('selectedStyle', 'custom');
    updateSetting('positivePrompt', '');
    setCurrentHashtag('SogniPhotobooth'); // Use #SogniPhotobooth for custom prompts
    updateSetting('halloweenContext', false); // Clear Halloween context (user is manually entering custom mode)
    // Update URL (custom will clear the prompt parameter)
    updateUrlWithPrompt('custom');
    // Note: User can now edit custom prompt via the popup in StyleDropdown
    // or through the settings overlay if they choose to open it manually
  };

  // Update handlePositivePromptChange to use updateSetting
  const handlePositivePromptChange = (value) => {
    updateSetting('positivePrompt', value); 
    if (selectedStyle !== 'custom') {
      const currentPrompt = stylePrompts[selectedStyle] || '';
      if (value !== currentPrompt) {
        updateSetting('selectedStyle', 'custom'); 
        // Clear the URL parameter when switching to custom
        updateUrlWithPrompt(null);
        setCurrentHashtag('SogniPhotobooth'); // Use #SogniPhotobooth for custom prompts
      }
    }
  };

  // Optimized thought system - only schedules next thought when conditions are met
  const thoughtInProgress = useRef(false);
  const thoughtTimeoutRef = useRef(null);
  
  // Create refs for condition checking to avoid useCallback recreation
  const conditionsRef = useRef();
  conditionsRef.current = {
    selectedPhotoIndex,
    showSplashScreen,
    showStartMenu,
    slothicornAnimationEnabled
  };

  // Check if thoughts should be shown
  const shouldShowThoughts = useCallback(() => {
    const { selectedPhotoIndex, showSplashScreen, showStartMenu, slothicornAnimationEnabled } = conditionsRef.current;
    return slothicornAnimationEnabled && 
           !showSplashScreen && 
           !showStartMenu && 
           selectedPhotoIndex === null &&
           !thoughtInProgress.current;
  }, []);

  // Schedule the next thought only when conditions are met
  const scheduleNextThought = useCallback(() => {
    if (thoughtTimeoutRef.current) {
      clearTimeout(thoughtTimeoutRef.current);
    }
    
    if (!shouldShowThoughts()) {
      // Check again in 5 seconds if conditions aren't met
      thoughtTimeoutRef.current = setTimeout(scheduleNextThought, 5000);
      return;
    }
    
    const delay = 18000 + Math.random() * 5000; // 18-23 seconds
    thoughtTimeoutRef.current = setTimeout(() => {
      showThought();
      scheduleNextThought(); // Schedule the next one
    }, delay);
  }, [shouldShowThoughts]);

  const showThought = useCallback(() => {
    if (!shouldShowThoughts()) {
      return;
    }
    
    thoughtInProgress.current = true;
    // Select thoughts based on whether there's an active project
    const thoughts = activeProjectReference.current ? photoThoughts : randomThoughts;
    const randomThought = thoughts[Math.floor(Math.random() * thoughts.length)];
    const isLeftSide = Math.random() < 0.5;
    
    setCurrentThought({
      text: randomThought,
      position: isLeftSide 
        ? { left: 'calc(50% - 70px)', transform: 'translateX(-100%)', textAlign: 'right' }  // Left side: position + transform for right alignment
        : { left: 'calc(50% + 70px)', textAlign: 'left' }  // Right side: direct positioning
    });

    setTimeout(() => {
      setCurrentThought(null);
      thoughtInProgress.current = false;
    }, 4500);
  }, [shouldShowThoughts]);

  // Optimized thought system setup
  useEffect(() => {
    // Initial delay between 5-15 seconds
    const initialDelay = 5000 + Math.random() * 10000;
    
    const firstThought = setTimeout(() => {
      scheduleNextThought();
    }, initialDelay);

    return () => {
      clearTimeout(firstThought);
      if (thoughtTimeoutRef.current) {
        clearTimeout(thoughtTimeoutRef.current);
      }
    };
  }, [scheduleNextThought]); // Only depend on scheduleNextThought

  // Camera aspect ratio useEffect
  useEffect(() => {
    const handleVideoLoaded = () => {
      if (videoReference.current) {
        const { videoWidth, videoHeight } = videoReference.current;
        if (videoWidth && videoHeight) {
          // Set CSS variable for camera aspect ratio
          document.documentElement.style.setProperty(
            '--camera-aspect-ratio', 
            `${videoWidth}/${videoHeight}`
          );
          console.log(`🎥 Camera resolution achieved: ${videoWidth}x${videoHeight} (aspect ratio: ${(videoWidth/videoHeight).toFixed(3)})`);
          
          // Check for iOS quirk during video loading (using last known request dimensions)
          if (aspectRatio === 'square') {
            detectIOSQuirk(2048, 2048, videoWidth, videoHeight, 'during video load');
          } else if (['ultranarrow', 'narrow', 'portrait'].includes(aspectRatio)) {
            detectIOSQuirk(1080, 1920, videoWidth, videoHeight, 'during video load');
          } else {
            detectIOSQuirk(1920, 1080, videoWidth, videoHeight, 'during video load');
          }
          
          // Apply mirror effect for front camera
          videoReference.current.style.transform = isFrontCamera ? 'scaleX(-1)' : 'scaleX(1)';
        }
      }
    };

    // Add event listener for when video metadata is loaded
    const videoElement = videoReference.current;
    if (videoElement) {
      videoElement.addEventListener('loadedmetadata', handleVideoLoaded);
      // If already loaded, set it now
      if (videoElement.videoWidth) {
        handleVideoLoaded();
      }
      
      // Always update mirror effect when front/back camera changes, regardless of video load state
      videoElement.style.transform = isFrontCamera ? 'scaleX(-1)' : 'scaleX(1)';
    }

    // Cleanup
    return () => {
      if (videoElement) {
        videoElement.removeEventListener('loadedmetadata', handleVideoLoaded);
      }
    };
  }, [videoReference.current, isFrontCamera, aspectRatio]);

  // Fix for iOS viewport height issues
  useEffect(() => {
    // First, set the value to the actual viewport height
    const setVh = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    // Set it initially
    setVh();
    
    // Update on orientation change or resize
    const handleResize = () => {
      setVh();
    };
    const handleOrientationChange = () => {
      // Small delay to ensure new dimensions are available
      setTimeout(setVh, 100);
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);
    
    // On iOS, add a class to handle content safely with notches
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      
      // When showing the photo viewer, prevent background scrolling
      if (selectedPhotoIndex === null) {
        document.body.classList.remove('prevent-scroll');
      } else {
        document.body.classList.add('prevent-scroll');
      }
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, [selectedPhotoIndex]);

  // Initialize the slothicorn
  useEffect(() => {
    // Ensure slothicorn is properly initialized
    if (slothicornReference.current) {
      // Just initialize the transition property to prevent abrupt changes
      slothicornReference.current.style.transition = 'none';
      
      // Force a reflow to ensure style is applied
      void slothicornReference.current.offsetHeight;
    }
  }, []);

  // Hide slothicorn when photo is selected to prevent overlap with action buttons
  useEffect(() => {
    if (slothicornReference.current) {
      if (selectedPhotoIndex !== null) {
        // Photo is selected - hide sloth completely
        slothicornReference.current.style.display = 'none';
      } else {
        // No photo selected - show sloth
        slothicornReference.current.style.display = 'block';
      }
    }
  }, [selectedPhotoIndex]);

  // Add state for backend connection errors
  const [backendError, setBackendError] = useState(null);

  // Update the handler for initiating Twitter share
  const handleShareToX = async (photoIndex) => {
    // Set the photo index and open the modal
    setTwitterPhotoIndex(photoIndex);
    setShowTwitterModal(true);
  };

  // Handle generic Web Share API share
  const handleShareViaWebShare = async (photoIndex) => {
    console.log('📤 Web Share - Starting share process');
    
    if (!photos[photoIndex] || !photos[photoIndex].images || !photos[photoIndex].images[0]) {
      console.error('No image selected for Web Share');
      setBackendError({
        type: 'no_image',
        title: '📷 No Image Selected',
        message: 'Please select a photo from your gallery before sharing.',
        canRetry: false
      });
      return;
    }

    // Call the Web Share service
    await shareViaWebShare({
      photoIndex,
      photos,
      setBackendError,
      tezdevTheme,
      aspectRatio,
      outputFormat,
      sogniWatermark: settings.sogniWatermark,
      sogniWatermarkSize: settings.sogniWatermarkSize,
      sogniWatermarkMargin: settings.sogniWatermarkMargin,
    });

    // Track analytics for Web Share
    await trackShareWithStyle(selectedStyle, stylePrompts, 'webshare', {
      photoIndex,
      tezdevTheme,
      aspectRatio,
      outputFormat,
      hasWatermark: settings.sogniWatermark,
    });
  };

  // Handle Kiosk Mode sharing with QR code
  const handleKioskModeShare = async (photoIndex) => {
    console.log('🔗 Kiosk Mode Share - Starting QR code generation');
    console.log('🔗 Photo Index:', photoIndex);
    console.log('🔗 Photo Data:', photos[photoIndex]);
    console.log('🔗 Settings - kioskMode:', kioskMode);
    console.log('🔗 Settings - tezdevTheme:', tezdevTheme);
    console.log('🔗 Settings - outputFormat:', outputFormat);
    
    if (!photos[photoIndex] || !photos[photoIndex].images || !photos[photoIndex].images[0]) {
      console.error('No image selected for QR sharing');
      return;
    }

    // Check if we already have a QR code for this exact photo
    if (qrCodeData && qrCodeData.photoIndex === photoIndex) {
      console.log('QR code already exists for this photo, reusing existing QR code');
      return; // Don't regenerate, just keep the existing QR code
    }

    // Set the photo index immediately so the modal can show the image
    setTwitterPhotoIndex(photoIndex);

    // Show QR code immediately with loading state for better UX
    setQrCodeData({
      shareUrl: 'loading', // Special loading state
      photoIndex: photoIndex,
      isLoading: true
    });

    try {
      console.log('🔗 Starting mobile share creation process...');
      // Utilities are now pre-imported at the top of the file for better performance
      
      // Get the original image URL (handle enhanced images like Twitter sharing does)
      const photo = photos[photoIndex];
      const currentSubIndex = photo.enhanced && photo.enhancedImageUrl 
        ? -1 // Special case for enhanced images
        : (selectedSubIndex || 0);
        
      const originalImageUrl = currentSubIndex === -1
        ? photo.enhancedImageUrl
        : photo.images[currentSubIndex];
      
      console.log('Original image URL type:', originalImageUrl?.startsWith('blob:') ? 'blob' : originalImageUrl?.startsWith('data:') ? 'data' : 'http');
      
      // Create cache keys for this specific image configuration
      const currentTaipeiFrameNumber = photo.taipeiFrameNumber || 1;
      const mobileShareCacheKey = `${photoIndex}-${currentSubIndex}-${tezdevTheme}-${currentTaipeiFrameNumber}-${outputFormat}-${aspectRatio}`;
      const photoGalleryCacheKey = `${photoIndex}-${currentSubIndex}-${tezdevTheme}-${currentTaipeiFrameNumber}-${outputFormat}-${aspectRatio}`;
      
      // First, check if we already have a cached mobile share for this exact configuration
      const cachedMobileShare = mobileShareCache[mobileShareCacheKey];
      if (cachedMobileShare && cachedMobileShare.permanentImageUrl) {
        console.log('Using cached mobile share, creating fresh share link:', mobileShareCacheKey);
        try {
          // Generate a unique sharing ID (do not reuse prior shareId)
          const shareId = `share-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const currentUrl = new URL(window.location.href);
          const baseUrl = currentUrl.origin;
          const mobileShareUrl = `${baseUrl}/mobile-share/${shareId}`;

          const shareData = {
            shareId,
            photoIndex,
            imageUrl: cachedMobileShare.permanentImageUrl,
            tezdevTheme,
            aspectRatio,
            outputFormat: 'jpg',
            timestamp: Date.now(),
            isFramed: true,
            twitterMessage: cachedMobileShare.twitterMessage || TWITTER_SHARE_CONFIG.DEFAULT_MESSAGE
          };

          console.log('🔗 Sending cached mobile share data to backend...');
          const response = await fetch('/api/mobile-share/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(shareData),
          });

          if (!response.ok) {
            console.error('🔗 Backend response not OK:', response.status, response.statusText);
            throw new Error(`Failed to create mobile share from cache: ${response.status} ${response.statusText}`);
          }
          console.log('🔗 Cached mobile share created successfully');

          // Present the fresh link in the QR overlay
          setQrCodeData({
            shareUrl: mobileShareUrl,
            photoIndex: photoIndex,
            isLoading: false
          });

          // Do not return cached shareUrl to avoid reusing links across users
          return;
        } catch (e) {
          console.warn('Cached flow failed, falling back to regenerate framed image:', e);
          // Continue to regenerate below
        }
      }
      
      // Second, check if PhotoGallery has a framed image we can reuse
      const photoGalleryFramedImage = photoGalleryFramedImageCache[photoGalleryCacheKey];
      if (photoGalleryFramedImage && tezdevTheme !== 'off') {
        console.log('Found PhotoGallery framed image, using directly for mobile share:', photoGalleryCacheKey);
        try {
          // Use the PhotoGallery framed image directly without conversion
          const permanentImageUrl = await ensurePermanentUrl(photoGalleryFramedImage);
          console.log('PhotoGallery framed image uploaded directly without conversion');
          
          // Generate Twitter message
          let twitterMessage;
          if (tezdevTheme !== 'off') {
            try {
              const hashtag = getPhotoHashtag(photo);
              const themeTemplate = await themeConfigService.getTweetTemplate(tezdevTheme, hashtag || '');
              twitterMessage = themeTemplate;
            } catch (error) {
              console.warn('Could not load theme tweet template, using fallback:', error);
              twitterMessage = TWITTER_SHARE_CONFIG.DEFAULT_MESSAGE;
            }
          } else {
            twitterMessage = TWITTER_SHARE_CONFIG.DEFAULT_MESSAGE;
          }
          
          // Generate a unique sharing ID
          const shareId = `share-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const currentUrl = new URL(window.location.href);
          const baseUrl = currentUrl.origin;
          const mobileShareUrl = `${baseUrl}/mobile-share/${shareId}`;
          
          // Create share data
          const shareData = {
            shareId,
            photoIndex,
            imageUrl: permanentImageUrl,
            tezdevTheme,
            aspectRatio,
            outputFormat: outputFormat, // Use original format instead of forcing JPG
            timestamp: Date.now(),
            isFramed: true,
            twitterMessage: twitterMessage
          };
          
          // Send to backend
          const response = await fetch('/api/mobile-share/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(shareData),
          });
          
          if (!response.ok) {
            throw new Error('Failed to create mobile share from PhotoGallery cache');
          }
          
          // Cache the result using the same key format
          setMobileShareCache(prev => ({
            ...prev,
            [mobileShareCacheKey]: {
              shareUrl: mobileShareUrl,
              permanentImageUrl,
              twitterMessage,
              timestamp: Date.now()
            }
          }));
          
          // Set QR code data
          setQrCodeData({
            shareUrl: mobileShareUrl,
            photoIndex: photoIndex,
            isLoading: false
          });
          
          return; // Success, exit early
        } catch (error) {
          console.warn('Failed to reuse PhotoGallery framed image, falling back to regenerate:', error);
          // Continue to regenerate below
        }
      }
      
      console.log('Creating new framed image for mobile sharing...');
      
      // Ensure font is loaded (same as Twitter sharing) - check if already loaded first
      try {
        const fontAlreadyLoaded = document.fonts.check('80px "Permanent Marker"');
        if (!fontAlreadyLoaded) {
          const testFont = new FontFace('Permanent Marker', 'url(https://fonts.gstatic.com/s/permanentmarker/v16/Fh4uPib9Iyv2ucM6pGQMWimMp004La2Cfw.woff2)');
          await testFont.load();
          document.fonts.add(testFont);
          console.log('Manually loaded Permanent Marker font');
        } else {
          console.log('Permanent Marker font already loaded');
        }
      } catch (fontError) {
        console.warn('Could not manually load font, using system fallback:', fontError);
      }
      
      let framedImageDataUrl;
      
      if (tezdevTheme !== 'off') {
        // For TezDev themes, create full frame version (no polaroid frame, just TezDev overlay)
        // Custom frames should not include labels - they have their own styling
        console.log('Creating TezDev full frame version for mobile sharing');
        framedImageDataUrl = await createPolaroidImage(originalImageUrl, '', {
          tezdevTheme,
          aspectRatio,
          frameWidth: 0,      // No polaroid frame
          frameTopWidth: 0,   // No polaroid frame
          frameBottomWidth: 0, // No polaroid frame
          frameColor: 'transparent', // No polaroid background
          outputFormat: 'jpg', // Use JPG for mobile sharing
          // For Taipei theme, pass the current frame number to ensure consistency
          taipeiFrameNumber: tezdevTheme === 'taipeiblockchain' ? currentTaipeiFrameNumber : undefined,
          // Add QR watermark for mobile sharing (if enabled)
          watermarkOptions: settings.sogniWatermark ? getQRWatermarkConfig(settings) : null
        });
      } else {
        // For non-TezDev themes, use traditional polaroid frame
        const hashtag = getPhotoHashtag(photo);
        const label = hashtag || photo.label || photo.style || '';
        
        console.log('Creating polaroid image for mobile sharing', {
          photoStatusText: photo.statusText,
          extractedHashtag: hashtag,
          finalLabel: label,
          photoStyle: photo.style,
          photoLabel: photo.label
        });
        framedImageDataUrl = await createPolaroidImage(originalImageUrl, label, {
          tezdevTheme,
          aspectRatio,
          outputFormat: 'jpg', // Use JPG for mobile sharing
          // Add QR watermark for mobile sharing (if enabled)
          watermarkOptions: settings.sogniWatermark ? getQRWatermarkConfig(settings) : null
        });
      }
      
      console.log('Framed image created, uploading to server...');
      
      // Convert the framed image data URL to a permanent URL
      const permanentImageUrl = await ensurePermanentUrl(framedImageDataUrl);
      console.log('Permanent framed image uploaded successfully');
      
      // Generate Twitter message using the same logic as Twitter sharing
      let twitterMessage;
      if (tezdevTheme !== 'off') {
        // Use dynamic theme-specific message format
        try {
          // Extract style hashtag using the same logic as PhotoGallery component
          let styleTag = 'vaporwave'; // Default fallback
          
          // Try stylePrompt first
          if (photo.stylePrompt && stylePrompts) {
            const foundStyleKey = Object.entries(stylePrompts).find(
              ([, value]) => value === photo.stylePrompt
            )?.[0];
            
            if (foundStyleKey && foundStyleKey !== 'custom' && foundStyleKey !== 'random' && foundStyleKey !== 'randomMix') {
              styleTag = foundStyleKey;
            }
          }
          
          // Try positivePrompt next if stylePrompt didn't work
          if (styleTag === 'vaporwave' && photo.positivePrompt && stylePrompts) {
            const foundStyleKey = Object.entries(stylePrompts).find(
              ([, value]) => value === photo.positivePrompt
            )?.[0];
            
            if (foundStyleKey && foundStyleKey !== 'custom' && foundStyleKey !== 'random' && foundStyleKey !== 'randomMix') {
              styleTag = foundStyleKey;
            }
          }
          
          // Fall back to selectedStyle if available
          if (styleTag === 'vaporwave' && selectedStyle && selectedStyle !== 'custom' && selectedStyle !== 'random' && selectedStyle !== 'randomMix') {
            styleTag = selectedStyle;
          }
          
          console.log('Using styleTag for Twitter message:', styleTag);
          
          const themeTemplate = await themeConfigService.getTweetTemplate(tezdevTheme, styleTag);
          twitterMessage = themeTemplate;
        } catch (error) {
          console.warn('Could not load theme tweet template, using fallback:', error);
          // Fallback to default message
          twitterMessage = TWITTER_SHARE_CONFIG.DEFAULT_MESSAGE;
        }
      } else {
        // Use default message for no theme
        twitterMessage = TWITTER_SHARE_CONFIG.DEFAULT_MESSAGE;
      }
      
      console.log('Generated Twitter message:', twitterMessage);
      
      // Generate a unique sharing ID
      const shareId = `share-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Get the current URL configuration
      const currentUrl = new URL(window.location.href);
      const baseUrl = currentUrl.origin;
      
      // Create the mobile sharing URL
      const mobileShareUrl = `${baseUrl}/mobile-share/${shareId}`;
      
      // Store the sharing data with permanent framed image URL
      const shareData = {
        shareId,
        photoIndex,
        imageUrl: permanentImageUrl, // Use permanent framed image URL
        tezdevTheme,
        aspectRatio,
        outputFormat,
        timestamp: Date.now(),
        isFramed: true, // Flag to indicate this image already includes the frame
        twitterMessage: twitterMessage // Include the generated Twitter message
      };

      console.log('Creating mobile share with framed data:', shareData);

      // Send the share data to the backend for storage
      console.log('🔗 Sending new mobile share data to backend...');
      const response = await fetch('/api/mobile-share/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(shareData),
      });

      if (!response.ok) {
        console.error('🔗 Backend response not OK:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('🔗 Backend error response:', errorText);
        throw new Error(`Failed to create mobile share: ${response.status} ${response.statusText}`);
      }
      console.log('🔗 New mobile share created successfully');

      // Cache the mobile share data for future use
      setMobileShareCache(prev => ({
        ...prev,
        [mobileShareCacheKey]: {
          shareUrl: mobileShareUrl,
          permanentImageUrl,
          twitterMessage,
          timestamp: Date.now()
        }
      }));

      // Set QR code data for overlay
      setQrCodeData({
        shareUrl: mobileShareUrl,
        photoIndex: photoIndex,
        isLoading: false
      });

    } catch (error) {
      console.error('Error creating mobile share:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      // Clear loading state on error
      setQrCodeData(null);
      
      // Show a more informative error message with fallback option
      setBackendError({
        type: 'kiosk_mode_error',
        title: '🔗 QR Code Generation Failed',
        message: 'Unable to generate QR code for sharing. You can try again or use regular Twitter sharing instead.',
        details: error.message,
        canRetry: true,
        fallbackAction: () => {
          // Clear the error and show Twitter modal as fallback
          setBackendError(null);
          setTwitterPhotoIndex(photoIndex);
          setShowTwitterModal(true);
        },
        fallbackLabel: 'Use Twitter Sharing'
      });
    }
  };
  
  // Add a handler for the actual sharing with custom message
  const handleTwitterShare = async (customMessage, submitToContest = false) => {
    // Store the message for potential retry
    setLastTwitterMessage(customMessage);
    
    // Create a clean URL - use /event path if user came from an event
    const shareUrl = new URL(window.location.origin);
    if (settings.halloweenContext) {
      shareUrl.pathname = '/event/halloween';
    } else if (settings.winterContext) {
      shareUrl.pathname = '/event/winter';
    }
    
    // Only add the prompt parameter if we have a hashtag and it's not from a custom prompt
    if (currentHashtag && selectedStyle !== 'custom') {
      shareUrl.searchParams.set('prompt', currentHashtag);
    }
    
    // Call the extracted Twitter sharing service with custom message and URL
    await shareToTwitter({
      photoIndex: twitterPhotoIndex,
      photos,
      setBackendError,
      customMessage,
      shareUrl: shareUrl.toString(), // Pass the full URL with parameters
      tezdevTheme,
      aspectRatio,
      outputFormat,
      sogniWatermark: settings.sogniWatermark,
      sogniWatermarkSize: settings.sogniWatermarkSize,
      sogniWatermarkMargin: settings.sogniWatermarkMargin,
      halloweenContext: settings.halloweenContext || false,
      submitToContest, // Pass the explicit contest submission flag
      prompt: settings.positivePrompt || null,
      username: authState.user?.username || null,
      address: authState.user?.email || null, // Using email as identifier for now
      metadata: {
        model: selectedModel,
        inferenceSteps,
        seed: photos[twitterPhotoIndex]?.seed || null,
        guidance: isFluxKontextModel(selectedModel) ? guidance : promptGuidance,
        aspectRatio
      },
      onSuccess: async () => {
        // Show success toast using the new toast system - special message for Halloween contest
        if (submitToContest) {
          showToast({
            title: '🎃 Contest Entry Submitted!',
            message: 'Your Halloween creation has been shared and entered into the contest!',
            type: 'success',
            timeout: 5000
          });
        } else {
          showToast({
            title: 'Success!',
            message: 'Your photo has been shared to X/Twitter!',
            type: 'success',
            timeout: 4000
          });
        }
        setShowTwitterModal(false);
        
        // Track analytics for successful Twitter share
        await trackShareWithStyle(selectedStyle, stylePrompts, 'twitter', {
          photoIndex: twitterPhotoIndex,
          customMessage,
          shareUrl: shareUrl.toString(),
          tezdevTheme,
          aspectRatio,
          outputFormat,
          hasWatermark: settings.sogniWatermark,
          halloweenContext: settings.halloweenContext || false,
          submitToContest
        });
      }
    });
  };

  // -------------------------
  //   Connection State Management
  // -------------------------
  useEffect(() => {
    // Subscribe to connection state changes
    const unsubscribe = subscribeToConnectionState((newState) => {
      setConnectionState(newState);
    });
    
    return () => {
      unsubscribe();
    };
  }, []);
  
  // Track if we're currently generating to show appropriate connection status - optimized
  useEffect(() => {
    const hasGeneratingPhotos = photos.some(photo => photo.generating || photo.loading);
    const currentlyGenerating = isGenerating;
    
    // Only update if the generating status actually changed
    if (hasGeneratingPhotos !== currentlyGenerating) {
      setIsGenerating(hasGeneratingPhotos);
    }
    
    // Set up timeout detection for stuck generation states (only when starting generation)
    if (hasGeneratingPhotos && !currentlyGenerating && !activeProjectReference.current) {
      const timeoutId = setTimeout(() => {
        // Check if photos are still generating and no active project
        setRegularPhotos(prev => {
          const stillGenerating = prev.some(photo => photo.generating || photo.loading);
          if (stillGenerating && !activeProjectReference.current) {
            console.warn('Generation appears stuck after 2 minutes with no active project, notifying user');
            setConnectionState('timeout');
          }
          return prev;
        });
      }, 120000); // 2 minutes
      
      return () => clearTimeout(timeoutId);
    }
  }, [photos, isGenerating]); // Include isGenerating to compare previous state

  // -------------------------
  //   Monitor winter context changes (backup/safety check only)
  // -------------------------
  useEffect(() => {
    // Just track winter context state - the style-based effect handles model switching
    const winterContextActive = settings.winterContext;
    prevWinterContextRef.current = winterContextActive;
  }, [settings.winterContext]);

  // -------------------------
  //   Auto-switch model based on style selection
  // -------------------------
  useEffect(() => {
    const currentStyle = settings.selectedStyle;
    const currentModel = settings.selectedModel;
    
    // Initialize refs on first run
    if (prevModelRef.current === null) {
      prevModelRef.current = currentModel;
    }
    if (prevStyleRef.current === null) {
      prevStyleRef.current = currentStyle;
      return; // Skip on first render
    }
    
    // CRITICAL: Only auto-switch when STYLE changes, not when model changes manually
    const styleChanged = prevStyleRef.current !== currentStyle;
    
    if (!styleChanged) {
      console.log('⏭️ Style unchanged, skipping automatic model switch');
      prevModelRef.current = currentModel;
      return;
    }
    
    console.log(`🎨 Style changed: ${prevStyleRef.current} → ${currentStyle}`);
    
    // If user explicitly selected a model, respect their choice and don't auto-switch
    if (userExplicitlySelectedModelRef.current) {
      console.log('🙋 User explicitly selected a model, respecting choice - no auto-switching');
      prevStyleRef.current = currentStyle;
      prevModelRef.current = currentModel;
      return;
    }
    
    // Check if previous and current styles are winter styles
    const wasPreviousStyleWinter = isWinterStyle(prevStyleRef.current);
    const isCurrentStyleWinter = isWinterStyle(currentStyle);
    
    prevStyleRef.current = currentStyle;
    
    // Skip special styles that don't need model switching
    if (['random', 'randomMix', 'oneOfEach', 'browseGallery', 'copyImageStyle'].includes(currentStyle)) {
      return;
    }
    
    // If switching TO a winter style and NOT on DreamShaper, switch to it
    if (isCurrentStyleWinter && currentModel !== 'coreml-dreamshaperXL_v21TurboDPMSDE') {
      console.log('❄️ Winter style selected, auto-switching to DreamShaper model');
      dreamShaperAutoSelectedRef.current = true; // Mark as auto-selected
      updateSetting('winterContext', true);
      switchToModel('coreml-dreamshaperXL_v21TurboDPMSDE');
      
      // Show toast notification ONLY if model is actually changing
      if (prevModelRef.current !== 'coreml-dreamshaperXL_v21TurboDPMSDE') {
        showToast({
          type: 'info',
          title: 'Model Changed',
          message: 'Switched to DreamShaper for winter theme',
          timeout: 4000
        });
      }
      
      prevModelRef.current = 'coreml-dreamshaperXL_v21TurboDPMSDE';
      
      // Reset the explicit selection flag since we auto-switched
      // This allows future auto-switches to work
      userExplicitlySelectedModelRef.current = false;
    }
    // ONLY switch away from DreamShaper if:
    // 1. Transitioning FROM winter TO non-winter style
    // 2. Currently on DreamShaper
    // 3. DreamShaper was AUTO-selected (not manually selected by user)
    else if (wasPreviousStyleWinter && !isCurrentStyleWinter && 
             currentModel === 'coreml-dreamshaperXL_v21TurboDPMSDE' &&
             dreamShaperAutoSelectedRef.current === true) {
      console.log('❄️ Leaving winter style, auto-switching from DreamShaper to default model');
      console.log('❄️ About to show toast and switch model');
      dreamShaperAutoSelectedRef.current = false; // Reset flag
      updateSetting('winterContext', false);
      
      // Show toast BEFORE switching model
      showToast({
        type: 'info',
        title: 'Model Changed',
        message: 'Switched back to Sogni Turbo (default model)',
        timeout: 4000
      });
      console.log('❄️ Toast shown');
      
      switchToModel(DEFAULT_MODEL_ID);
      prevModelRef.current = DEFAULT_MODEL_ID;
      
      // Reset the explicit selection flag since we auto-switched
      // This allows future auto-switches to work
      userExplicitlySelectedModelRef.current = false;
    } else {
      // Log why we're not switching
      if (wasPreviousStyleWinter && !isCurrentStyleWinter && currentModel === 'coreml-dreamshaperXL_v21TurboDPMSDE') {
        console.log(`❄️ Not switching away from DreamShaper: dreamShaperAutoSelected=${dreamShaperAutoSelectedRef.current}`);
      }
      // Update prevModelRef if we're not switching
      prevModelRef.current = currentModel;
    }
  }, [settings.selectedStyle, settings.selectedModel, updateSetting, switchToModel, showToast]);

  // -------------------------
  //   Sogni initialization
  // -------------------------
  const [isInitializingSogni, setIsInitializingSogni] = useState(false);
  
  const initializeSogni = useCallback(async () => {
    // Prevent multiple simultaneous initialization attempts
    if (isInitializingSogni) {
      console.log('Sogni initialization already in progress, skipping');
      return;
    }
    
    // CRITICAL FIX: If we already have a working client, don't reinitialize
    // This prevents the backend client from overwriting the frontend client
    // that was set by the auth state change effect
    if (sogniClient && isSogniReady) {
      console.log('✅ Sogni client already initialized and ready, skipping reinitialization');
      return;
    }
    
    setIsInitializingSogni(true);
    
    console.log('🔵🔵🔵 INITIALIZING SOGNI CLIENT - START');
    console.log('Current auth state:', {
      isAuthenticated: authState.isAuthenticated,
      authMode: authState.authMode,
      isLoading: authState.isLoading,
      hasGetSogniClient: typeof authState.getSogniClient === 'function'
    });
    
    try {
      // Reset any previous errors
      setBackendError(null);
      
      let client;
      
      if (authState.isAuthenticated && authState.authMode === 'frontend') {
        // Use the frontend Sogni client with adapter for personal account credits
        console.log('🟢 Using frontend authentication mode - direct SDK connection for personal credits');

        // Use ensureClient() to recreate the SDK client if it's temporarily unavailable
        // This is important for recovery after WebSocket errors (4015)
        let realClient = authState.getSogniClient();

        if (!realClient) {
          // Try to recreate the client instead of falling back to backend
          console.warn('⚠️ Frontend client temporarily unavailable, attempting to recreate...');
          try {
            realClient = await authState.ensureClient();
            console.log('✅ Frontend client recreated successfully');
          } catch (ensureError) {
            console.error('❌ Failed to recreate frontend client:', ensureError);
            // Only fall back to backend if we truly can't get a frontend client
            console.warn('⚠️ Falling back to backend mode after frontend client recreation failed');
            client = await initializeSogniClient();
            setSogniClient(client);
            setIsSogniReady(true);
            console.log('✅ Backend Sogni client initialized successfully (fallback from frontend)');
          }
        }

        if (realClient) {
          // Wrap the real client with our adapter to ensure compatibility with photobooth UI
          client = createFrontendClientAdapter(realClient);

          setSogniClient(client);
          setIsSogniReady(true);

          console.log('✅✅✅ Frontend Sogni client initialized successfully with adapter - using personal account credits');
          console.log('Client supportsVideo:', client.supportsVideo);
        }
        
      } else {
        // Use the backend client (demo mode - shared demo account credits)
        console.log('🔴 Using backend authentication (demo mode - shared demo credits)');
        console.log('Why backend? isAuthenticated:', authState.isAuthenticated, 'authMode:', authState.authMode);
        client = await initializeSogniClient();
        setSogniClient(client);
        setIsSogniReady(true);
        
        console.log('✅ Backend Sogni client initialized successfully - using demo credits');
        console.log('Client supportsVideo:', client.supportsVideo);
      }

      // Set up event listeners if we have a client
      if (client && client.projects) {
        client.projects.on('swarmModels', () => {
          //console.log('Swarm models event payload:', event);
        });

        client.projects.on('project', () => {
          // console.log('Project event full payload:', event);
        });

        client.projects.on('job', (event) => {
          //console.log('Job event full payload:', event);
          
          // For frontend clients, capture individual job prompts and pass them to the active project adapter
          if (authState.authMode === 'frontend' && activeProjectObjectReference.current && event.positivePrompt) {
            const project = activeProjectObjectReference.current;
            
            // If the project is our adapter, store the individual job prompt
            if (project && typeof project.setJobPrompt === 'function') {
              project.setJobPrompt(event.jobId, event.positivePrompt);
            }
          }
        });
      }


      // Set up socket error handling for frontend clients
      if (client && authState.authMode === 'frontend' && client.apiClient) {
        client.apiClient.on('error', (error) => {
          console.error('Socket error:', error);
          
          // Check for email verification error (code 4052)
          if (error && typeof error === 'object' && 
              (error.code === 4052 || (error.reason && error.reason.includes('verify your email')))) {
            console.error('❌ Email verification required from socket error');
            
            // Show toast notification for email verification
            handleSpecificErrors.emailVerification(showToast);
            
            setBackendError({
              type: 'auth_error',
              title: '📧 Email Verification Required',
              message: 'Your Sogni account email needs to be verified to generate images.',
              details: 'Please check your email and click the verification link, then try again. You can also verify your email at app.sogni.ai.',
              canRetry: true,
              fallbackUrl: 'https://app.sogni.ai/profile',
              fallbackText: 'Verify Email',
              fallbackLabel: 'Go to Profile'
            });
            
            // Clear any active generation
            clearAllTimeouts();
            activeProjectReference.current = null;
            
            // Mark all generating photos as failed
            const markEmailVerificationRequired = (prevPhotos) => {
              return prevPhotos.map(photo => {
                if (photo.generating) {
                  return {
                    ...photo,
                    generating: false,
                    loading: false,
                    error: 'EMAIL VERIFICATION REQUIRED',
                    permanentError: true,
                    statusText: 'Verify Email'
                  };
                }
                return photo;
              });
            };
            
            setRegularPhotos(markEmailVerificationRequired);
            setPhotos(markEmailVerificationRequired);
          }
        });
      }
      
      // WebSocket error handling is now set up in a separate useEffect
      
    } catch (error) {
      console.error('Failed initializing Sogni client:', error);
      
      // Don't show an error for throttling, it's expected during initialization
      if (error.message === 'Status check throttled') {
        console.log('Status check throttled, will use cached status');
        // If we have a previous client, keep using it
        if (sogniClient) {
          console.log('Using existing Sogni client');
          setIsSogniReady(true);
          setIsInitializingSogni(false);
          return;
        }
        // Otherwise retry after a short delay, but don't create a loop
        console.log('Will retry Sogni initialization after throttle delay');
        setTimeout(() => {
          setIsInitializingSogni(false);
          // Only retry if we still don't have a client
          if (!sogniClient) {
            console.log('Retrying Sogni initialization after throttle');
            initializeSogni();
          }
        }, 2000); // Increased delay to 2 seconds to reduce throttling
        return;
      }
      
      // Set a user-friendly error message for real issues
      if (error.message && error.message.includes('Failed to fetch')) {
        setBackendError('The backend server is not running. Please start it using "npm run server:dev" in a separate terminal.');
      } else if (error.message && error.message.includes('401')) {
        setBackendError('AUTHENTICATION FAILED: Invalid Sogni credentials. Please update the server/.env file with valid credentials.');
      } else {
        setBackendError(`Error connecting to the Sogni service: ${error.message}`);
      }
    } finally {
      setIsInitializingSogni(false);
    }
  }, []); // Removed dependencies to prevent loops

  /**
   * Stop the camera stream and clean up resources
   */
  const stopCamera = useCallback(() => {
    if (videoReference.current && videoReference.current.srcObject) {
      console.log('🛑 Stopping camera stream');
      const stream = videoReference.current.srcObject;
      const tracks = stream.getTracks();
      tracks.forEach(track => {
        console.log(`🛑 Stopping track: ${track.kind} (${track.label})`);
        track.stop();
      });
      
      // Clear the video source
      videoReference.current.srcObject = null;
      
      // Clean up orientation handler if it exists
      if (orientationHandler) {
        window.removeEventListener('orientationchange', orientationHandler);
        setOrientationHandler(null);
      }
    }
  }, [videoReference, orientationHandler, setOrientationHandler]);

  /**
   * Start the camera stream for a given deviceId or fallback.
   * Request specific resolution based on desired aspect ratio.
   */
  const startCamera = useCallback(async (deviceId) => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    
    // Reset iOS quirk detection state for new camera session
    setIosQuirkDetected(false);
    setActualCameraDimensions(null);
    setQuirkDetectionComplete(false);
    
    // Determine resolution based on aspect ratio
    let requestWidth, requestHeight;
    
    if (aspectRatio === 'square') {
      // For 1:1 aspect ratio - request 2048×2048
      requestWidth = 2048;
      requestHeight = 2048;
    } else if (['ultranarrow', 'narrow', 'portrait'].includes(aspectRatio)) {
      // For portrait ratios - request 1080×1920 (but swap on iOS)
      requestWidth = isIOS ? 1920 : 1080;
      requestHeight = isIOS ? 1080 : 1920;
    } else {
      // For landscape ratios - request 1920×1080 (but swap on iOS)
      requestWidth = isIOS ? 1080 : 1920;
      requestHeight = isIOS ? 1920 : 1080;
    }
    
    if (isIOS) {
      console.log(`🍎 iOS detected: Swapping dimensions to compensate for iOS behavior`);
      console.log(`🍎 Portrait modes: requesting ${requestWidth}×${requestHeight} to get portrait feed`);
    }
    
    console.log('📹 Camera request details:', {
      deviceId: deviceId || 'auto-select',
      facingMode: deviceId ? 'not used (specific device)' : (isFrontCamera ? 'user' : 'environment'),
      requestedResolution: `${requestWidth}x${requestHeight}`,
      aspectRatio
    });
    
    const constraints = deviceId
      ? {
          video: {
            deviceId: { exact: deviceId },
            width: { ideal: requestWidth },
            height: { ideal: requestHeight }
          }
        }
      : {
          video: {
            facingMode: isFrontCamera ? 'user' : 'environment',
            width: { ideal: requestWidth },
            height: { ideal: requestHeight }
          }
        };
    
    try {
      // Stop any existing stream first
      if (videoReference.current && videoReference.current.srcObject) {
        const existingStream = videoReference.current.srcObject;
        const tracks = existingStream.getTracks();
        tracks.forEach(track => track.stop());
        
        // On mobile devices, clear the srcObject and add a small delay for cleanup
        const isMobileDevice = /iphone|ipad|ipod|android/i.test(navigator.userAgent);
        if (isMobileDevice) {
          videoReference.current.srcObject = null;
          // Small delay to ensure stream is fully released on mobile
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      // Set waiting state before requesting camera access
      setWaitingForCameraPermission(true);

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Clear waiting and denied states after successful access
      setWaitingForCameraPermission(false);
      setCameraPermissionDenied(false);
      
      console.log(`✅ Camera stream acquired - requested ${requestWidth}×${requestHeight} for ${aspectRatio} aspect ratio`);
      
      // Get actual resolution for logging and iOS quirk detection
      if (stream.getVideoTracks().length > 0) {
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        
        // Log which camera device was actually selected
        console.log('📹 Actual camera device selected:', {
          deviceId: settings.deviceId || 'unknown',
          label: track.label || 'unknown',
          facingMode: settings.facingMode || 'unknown'
        });
        
        if (settings.width && settings.height) {
          console.log(`📐 Actual camera resolution: ${settings.width}x${settings.height}`);
          
          // Check for iOS dimension swap quirk using helper function
          detectIOSQuirk(requestWidth, requestHeight, settings.width, settings.height, 'in startCamera');
        }
      }
      
      // Add iOS-specific class if needed
      if (isIOS) {
        document.body.classList.add('ios-device');
        
        // Add a slight delay to ensure video element is ready
        setTimeout(() => {
          if (videoReference.current) {
            // Set proper classes for iOS orientation handling
            const currentIsPortrait = window.matchMedia("(orientation: portrait)").matches || window.innerHeight > window.innerWidth;
            if (currentIsPortrait) {
              videoReference.current.classList.add('ios-fix');
            } else {
              videoReference.current.classList.remove('ios-fix');
            }
          }
        }, 100);
      }
      
      // Set the stream and autoplay
      if (videoReference.current) {
        videoReference.current.srcObject = stream;
        videoReference.current.muted = true;
        
        // Apply mirror effect immediately for front camera
        videoReference.current.style.transform = isFrontCamera ? 'scaleX(-1)' : 'scaleX(1)';
        
        // Force play on video to ensure it starts on iOS
        const playPromise = videoReference.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.error('Error playing video:', error);
            // Try again after user interaction
            setTimeout(() => {
              if (videoReference.current) {
                videoReference.current.play().catch(e => console.error('Still cannot play video', e));
              }
            }, 1000);
          });
        }
        
        // Re-enumerate cameras after successful stream start to get proper device labels
        // This is especially important on mobile Safari and iPad
        const userAgent = navigator.userAgent;
        const isMobileOrTablet = /iphone|ipad|ipod|android/i.test(userAgent) || 
                                (navigator.maxTouchPoints > 1 && /safari/i.test(userAgent) && !/chrome/i.test(userAgent));
        if (isMobileOrTablet && cameraDevices.length <= 1) {
          setTimeout(async () => {
            try {
              const devices = await navigator.mediaDevices.enumerateDevices();
              const videoDevices = devices.filter(d => d.kind === 'videoinput');
              if (videoDevices.length > cameraDevices.length) {
                setCameraDevices(videoDevices);
              }
            } catch (err) {
              console.warn('📱 Re-enumeration failed:', err);
            }
          }, 1000); // Wait 1 second for stream to fully initialize
        }
      }
      
      // Listen for orientation changes
      const handleOrientationChange = () => {
        const isPortrait = window.matchMedia("(orientation: portrait)").matches;
        
        if (videoReference.current) {
          if (isIOS) {
            if (isPortrait) {
              videoReference.current.classList.add('ios-fix');
            } else {
              videoReference.current.classList.remove('ios-fix');
            }
          }
        }
      };
      
      window.addEventListener('orientationchange', handleOrientationChange);
      // Store function for cleanup
      setOrientationHandler(() => handleOrientationChange);
      
    } catch (error) {
      console.error('Failed to get camera access:', error);
      
      // Clear waiting state on error
      setWaitingForCameraPermission(false);
      
      // Check if permission was denied by the user
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        console.error('Camera permission denied by user');
        setCameraPermissionDenied(true);
        return; // Don't try fallback for permission errors
      }
      
      // If we failed with a specific device ID, try falling back to auto-select
      if (deviceId && (error.name === 'OverconstrainedError' || error.name === 'NotFoundError')) {
        console.warn('📹 Specific camera device failed, trying auto-select fallback...');
        try {
          // Clear the invalid device preference
          updateSetting('preferredCameraDeviceId', undefined);
          setSelectedCameraDeviceId(null);
          
          // Try again without device constraint
          const fallbackConstraints = {
            video: {
              facingMode: isFrontCamera ? 'user' : 'environment',
              width: { ideal: requestWidth },
              height: { ideal: requestHeight }
            }
          };
          
          const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
          console.log('✅ Fallback camera stream acquired');
          
          // Clear waiting and denied states after successful fallback
          setWaitingForCameraPermission(false);
          setCameraPermissionDenied(false);
          
          if (videoReference.current) {
            videoReference.current.srcObject = fallbackStream;
            await videoReference.current.play();
          }
          
          return; // Success with fallback
        } catch (fallbackError) {
          console.error('❌ Fallback camera access also failed:', fallbackError);
        }
      }
      
      throw error;
    }
  }, [desiredWidth, desiredHeight, isFrontCamera, videoReference, setOrientationHandler, aspectRatio]); // Add aspectRatio to dependencies

  /**
   * Enumerate devices and store them in state.
   */
  const listCameras = useCallback(async () => {
    try {
      console.log('📹 Enumerating camera devices...');
      
      // Check if mediaDevices is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn('📹 MediaDevices not supported');
        setCameraDevices([]);
        return;
      }
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      
      console.log(`📹 Found ${videoDevices.length} camera device(s):`, videoDevices.map(d => ({ 
        id: d.deviceId, 
        label: d.label || 'Unnamed Camera' 
      })));
      
      // Mobile specific logging
      const isMobileDevice = /iphone|ipad|ipod|android/i.test(navigator.userAgent);
      if (isMobileDevice) {
        console.log('📱 MOBILE - Setting camera devices:', videoDevices);
      }
      
      setCameraDevices(videoDevices);
    } catch (error) {
      console.warn('📹 Error enumerating camera devices:', error);
      // Set empty array on error to prevent undefined state
      setCameraDevices([]);
      
      // Don't throw the error - let the app continue without cameras
      // The camera functionality will gracefully degrade
    }
  }, []); // Removed dependencies to prevent callback recreation loops

  // Separate effect to handle camera device validation when cameras or settings change
  useEffect(() => {
    if (cameraDevices.length === 0) return; // Wait for cameras to be loaded
    
    const currentPreferred = settings.preferredCameraDeviceId;
    
    // Debounce to prevent rapid updates
    const timeoutId = setTimeout(() => {
    
    // Validate preferred camera device and fallback if needed
    if (currentPreferred && currentPreferred.trim() !== '') {
      const isPreferredCameraAvailable = cameraDevices.some(device => 
        device.deviceId === currentPreferred && device.deviceId.trim() !== ''
      );
      
      if (!isPreferredCameraAvailable) {
        console.warn('📹 Preferred camera device not found:', currentPreferred);
        console.log('📹 Available cameras:', cameraDevices.map(d => ({ id: d.deviceId, label: d.label })));
        
        // Clear the invalid preference
        updateSetting('preferredCameraDeviceId', undefined);
        console.log('📹 Cleared invalid camera preference, will use auto-select');
      } else {
        console.log('📹 Preferred camera device is available:', currentPreferred);
      }
    } else if (currentPreferred === '') {
      // If we have an empty string as preferred camera, clear it
      console.warn('📹 Empty string found as preferred camera, clearing it');
      updateSetting('preferredCameraDeviceId', undefined);
    } else if (cameraDevices.length > 0) {
      // No preferred camera set - use smart default selection
      const setDefaultCamera = async () => {
        try {
          // Check if we have any cameras with valid device IDs
          const validCameras = cameraDevices.filter(d => d.deviceId && d.deviceId.trim() !== '');
          
          if (validCameras.length === 0) {
            console.warn('📹 No cameras with valid device IDs found. This is normal on mobile Safari without camera permission.');
            console.log('📹 Available cameras:', cameraDevices.map(d => ({ id: d.deviceId, label: d.label })));
            // Don't set any default - wait for user to grant permission
            return;
          }
          
          const { getDefaultCameraDevice } = await import('./services/cameraService');
          const defaultCamera = getDefaultCameraDevice(validCameras);
          
          if (defaultCamera && defaultCamera.deviceId && defaultCamera.deviceId.trim() !== '') {
            console.log('📹 Setting default camera device:', defaultCamera.label || defaultCamera.deviceId);
            updateSetting('preferredCameraDeviceId', defaultCamera.deviceId);
          } else {
            console.warn('📹 No valid default camera found');
            console.log('📹 Available cameras:', validCameras.map(d => ({ id: d.deviceId, label: d.label })));
          }
        } catch (error) {
          console.warn('📹 Error setting default camera:', error);
        }
      };
      
      void setDefaultCamera();
    }
    }, 100); // 100ms debounce
    
    return () => clearTimeout(timeoutId);
  }, [cameraDevices, settings.preferredCameraDeviceId]); // updateSetting is stable, doesn't need to be a dependency

  // Modified useEffect for app initialization - no camera enumeration on startup
  useEffect(() => {
    const initializeAppOnMount = async () => {
      // Initialize Google Analytics first
      initializeGA();
      
      // Add a small delay for mobile Safari to ensure DOM is fully ready
      const isMobileSafari = /iPhone|iPad|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
      if (isMobileSafari) {
        console.log('📱 Mobile Safari detected, adding initialization delay');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // CRITICAL FIX: ALWAYS wait for auth state initialization to complete before initializing Sogni
      // This prevents race condition where initializeSogni() runs before checkExistingSession() completes,
      // causing it to incorrectly initialize backend client instead of frontend client
      console.log('⏳ Waiting for auth state initialization to complete before initializing Sogni...');
      // Always wait - don't check isLoading flag as it may have already completed
      await authState.waitForInitialization?.();
      console.log('✅ Auth state initialization complete:', {
        isAuthenticated: authState.isAuthenticated,
        authMode: authState.authMode,
        isLoading: authState.isLoading
      });
      
      // Initialize Sogni (restored original behavior)
      try {
        await initializeSogni();
        console.log('✅ App initialization completed');
      } catch (error) {
        console.warn('🔗 Sogni initialization failed:', error);
      }
    };
    
    initializeAppOnMount();
  }, []); // Empty dependency array - only run on mount

  // Track previous auth state to detect actual logout transitions
  const prevAuthRef = useRef({ isAuthenticated: false, authMode: null });
  
  // Effect: Handle auth state changes (login/logout)
  // Triggers when: User authentication status or auth mode changes
  useEffect(() => {
    const wasAuthenticated = prevAuthRef.current.isAuthenticated;
    const isNowAuthenticated = authState.isAuthenticated;
    
    // DEBUG: Log auth state changes
    console.log('🔍 Auth state change detected:', {
      wasAuthenticated,
      isNowAuthenticated,
      authMode: authState.authMode,
      sessionTransferred: authState.sessionTransferred,
      authStateKeys: Object.keys(authState)
    });
    
    // Update the ref for next time
    prevAuthRef.current = { isAuthenticated: authState.isAuthenticated, authMode: authState.authMode };
    
    if (isNowAuthenticated && authState.authMode === 'frontend' && authState.getSogniClient()) {
      console.log(`🔐 User logged in with frontend auth, switching to direct SDK connection for personal credits`);
      const realClient = authState.getSogniClient();
      
      // CRITICAL FIX: Use the adapter instead of raw client
      const adapterClient = createFrontendClientAdapter(realClient);
      
      setSogniClient(adapterClient);
      setIsSogniReady(true);
      
      console.log('✅ Switched to frontend client with adapter - now using personal account credits');
      
      // Note: We do NOT clear demo render status on login
      // The free demo render is a one-time offer that should persist across login/logout
      
      // DO NOT SET DEFAULTS HERE!
      // Settings are already loaded from localStorage during AppContext initialization
      // Changing them here would override user preferences on every page refresh
    } else if (!isNowAuthenticated && authState.authMode === null && wasAuthenticated) {
      // User logged out - ONLY trigger if they were previously authenticated
      console.log('🔐 User logged out, switching back to demo mode (backend client)');
      
      // Clear the current client
      setSogniClient(null);
      setIsSogniReady(false);
      
      // Reinitialize with backend client (called directly, not in dependencies)
      initializeSogni();
      
      // Clear session storage on logout
      clearSessionSettings();
      
      // DO NOT SET DEFAULTS HERE!
      // Let AppContext initialization handle loading defaults
      // Settings will be loaded from defaults on next page refresh when logged out
    }
  }, [authState.isAuthenticated, authState.authMode]); // Only auth-related primitives - no functions!

  // Create batch cancellation function for WebSocket errors
  const cancelBatchOnError = useCallback((error) => {
    if (!activeProjectReference.current) {
      return; // No active project to cancel
    }

    console.log('Cancelling batch due to WebSocket error:', error);
    
    // Clear all timeouts
    clearAllTimeouts();
    
    // Try to cancel the project on the backend
    if (sogniClient && activeProjectReference.current) {
      sogniClient.cancelProject?.(activeProjectReference.current)
        .catch(err => console.warn('Failed to cancel project on backend:', err));
    }
    
    // Mark all generating photos as failed due to the error
    setRegularPhotos(prev => {
      const updated = [...prev];
      
      updated.forEach((photo, index) => {
        if (photo.generating) {
          updated[index] = {
            ...photo,
            generating: false,
            loading: false,
            error: 'BATCH CANCELLED',
            permanentError: true,
            statusText: 'Cancelled',
            cancelled: true
          };
        }
      });
      
      return updated;
    });
    
    // Clear the active project reference
    activeProjectReference.current = null;
  }, [sogniClient]);

  // Set up WebSocket error handling when sogniClient changes
  useEffect(() => {
    if (!sogniClient || !showToast) {
      return;
    }
    
    const cleanupWebSocketHandler = setupWebSocketErrorHandler(
      sogniClient, 
      showToast, 
      {
        showDisconnectionToasts: true,
        showReconnectionToasts: true,
        showGeneralErrors: true,
        autoCloseTimeout: 5000
      },
      cancelBatchOnError // Pass the batch cancellation function
    );

    // Return cleanup function
    return cleanupWebSocketHandler;
  }, [sogniClient, showToast, cancelBatchOnError]);

  // Listen for email verification errors from frontend client
  useEffect(() => {
    const handleEmailVerificationRequired = () => {
      console.error('❌ Email verification required event received');
      setBackendError({
        type: 'auth_error',
        title: '📧 Email Verification Required',
        message: 'Your Sogni account email needs to be verified to generate images.',
        details: 'Please check your email and click the verification link, then try again. You can also verify your email at app.sogni.ai.',
        canRetry: true,
        fallbackUrl: 'https://app.sogni.ai/profile',
        fallbackText: 'Verify Email',
        fallbackLabel: 'Go to Profile'
      });
      
      // Clear any active generation
      clearAllTimeouts();
      activeProjectReference.current = null;
      
      // Mark all generating photos as failed
      setRegularPhotos(prevPhotos => {
        return prevPhotos.map(photo => {
          if (photo.generating) {
            return {
              ...photo,
              generating: false,
              loading: false,
              error: 'EMAIL VERIFICATION REQUIRED',
              permanentError: true,
              statusText: 'Verify Email'
            };
          }
          return photo;
        });
      });
    };

    window.addEventListener('sogni-email-verification-required', handleEmailVerificationRequired);
    
    return () => {
      window.removeEventListener('sogni-email-verification-required', handleEmailVerificationRequired);
    };
  }, []);

  // Sync selectedCameraDeviceId with settings - ONLY when preferredCameraDeviceId changes
  useEffect(() => {
    console.log('📹 Syncing camera device ID from settings:', preferredCameraDeviceId);
    setSelectedCameraDeviceId(preferredCameraDeviceId || null);
  }, [preferredCameraDeviceId]); // REMOVED selectedCameraDeviceId to prevent loops

  // Helper function to determine the resolution category for an aspect ratio
  const getResolutionCategory = (aspectRatio) => {
    if (aspectRatio === 'square') {
      return 'square';
    } else if (['ultranarrow', 'narrow', 'portrait'].includes(aspectRatio)) {
      return 'portrait';
    } else {
      return 'landscape';
    }
  };

  // State to track iOS dimension quirks
  const [iosQuirkDetected, setIosQuirkDetected] = useState(false);
  const [actualCameraDimensions, setActualCameraDimensions] = useState(null);
  const [quirkDetectionComplete, setQuirkDetectionComplete] = useState(false);
  // Track previous category to avoid unnecessary restarts
  const [previousCategory, setPreviousCategory] = useState(null);

  // Helper function to detect and log iOS dimension swap quirks
  const detectIOSQuirk = (requestWidth, requestHeight, actualWidth, actualHeight, context = '') => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    
    if (!isIOS || !actualWidth || !actualHeight) {
      // Set detection complete for non-iOS devices
      if (!isIOS) {
        setQuirkDetectionComplete(true);
        setIosQuirkDetected(false);
        setActualCameraDimensions({ width: actualWidth || 1920, height: actualHeight || 1080 });
      }
      return false;
    }
    
    const requestedLandscape = requestWidth > requestHeight;
    const actualLandscape = actualWidth > actualHeight;
    const isSquareRequest = requestWidth === requestHeight;
    const isSquareActual = Math.abs(actualWidth - actualHeight) <= Math.max(actualWidth, actualHeight) * 0.1;
    
    // Skip detection for square requests/responses as they don't have orientation issues
    if (isSquareRequest || isSquareActual) {
      console.log(`✅ iOS square dimensions ${context}: ${actualWidth}x${actualHeight}`);
      setIosQuirkDetected(false);
      setActualCameraDimensions({ width: actualWidth, height: actualHeight });
      setQuirkDetectionComplete(true);
      return false;
    }
    
    if (requestedLandscape !== actualLandscape) {
      console.log(`🍎 iOS quirk detected ${context}: Requested ${requestedLandscape ? 'landscape' : 'portrait'} (${requestWidth}x${requestHeight}) but got ${actualLandscape ? 'landscape' : 'portrait'} (${actualWidth}x${actualHeight})`);
      console.log(`🔄 This is normal iOS behavior - device orientation overrides requested dimensions`);
      console.log(`📐 Updating display logic to use actual dimensions: ${actualWidth}x${actualHeight}`);
      setIosQuirkDetected(true);
      setActualCameraDimensions({ width: actualWidth, height: actualHeight });
      setQuirkDetectionComplete(true);
      return true;
    } else {
      console.log(`✅ iOS dimensions match request ${context}: ${requestedLandscape ? 'landscape' : 'portrait'} orientation (${actualWidth}x${actualHeight})`);
      setIosQuirkDetected(false);
      setActualCameraDimensions({ width: actualWidth, height: actualHeight });
      setQuirkDetectionComplete(true);
      return false;
    }
  };

  // Restart camera when aspect ratio category changes (portrait/square/landscape)
  useEffect(() => {
    // Only restart if camera has been manually started and we're not showing start menu
    if (cameraManuallyStarted && !showStartMenu && !showPhotoGrid && selectedPhotoIndex === null) {
      console.log(`📐 Aspect ratio changed to ${aspectRatio}, checking if camera restart needed`);
      
      // Get current category
      const currentCategory = getResolutionCategory(aspectRatio);
      
      // Only restart if the category actually changed
      if (previousCategory !== null && previousCategory === currentCategory) {
        console.log(`✅ Same resolution category (${currentCategory}), skipping camera restart`);
        setPreviousCategory(currentCategory); // Update the previous category
        return;
      }
      
      console.log(`🔄 Category changed from ${previousCategory || 'none'} to ${currentCategory}, restarting camera`);
      setPreviousCategory(currentCategory);
      
      // Restart camera to get optimal resolution for the new category
      if (videoReference.current && videoReference.current.srcObject) {
        console.log(`🔄 Restarting camera for ${currentCategory} category (${aspectRatio})`);
        
        // Detect mobile devices for special handling
        const isMobileDevice = /iphone|ipad|ipod|android/i.test(navigator.userAgent);
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        
        if (isMobileDevice) {
          console.log(`📱 Mobile device detected (${isIOS ? 'iOS' : 'Android'}), using mobile-optimized restart`);
          
          // For mobile devices, add a small delay to ensure smooth transition
          setTimeout(() => {
            if (videoReference.current && videoReference.current.srcObject) {
              startCamera(selectedCameraDeviceId);
            }
          }, isIOS ? 200 : 100); // iOS needs slightly more time
        } else {
          // Desktop can restart immediately
          console.log(`💻 Desktop device detected, restarting camera immediately`);
          startCamera(selectedCameraDeviceId);
        }
      }
    }
  }, [aspectRatio, cameraManuallyStarted, showStartMenu, showPhotoGrid, selectedPhotoIndex, selectedCameraDeviceId, previousCategory]); // Removed startCamera function from dependencies
  
  // Simple cleanup effect - just stop camera on unmount
  useEffect(() => {
    return () => {
      // Stop camera stream when component unmounts
      if (videoReference.current && videoReference.current.srcObject) {
        const stream = videoReference.current.srcObject;
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
        videoReference.current.srcObject = null;
      }
    };
  }, []);

  // If we return to camera, ensure the video is playing
  useEffect(() => {
    if (cameraManuallyStarted && selectedPhotoIndex === null && !showPhotoGrid && videoReference.current) {
      console.log("Restarting video playback");
      // Add a small delay to ensure DOM updates before attempting to play
      setTimeout(() => {
        if (videoReference.current && videoReference.current.srcObject) {
          videoReference.current.play().catch(error => {
            console.warn("Video re-play error:", error);
            // On iOS, sometimes we need to restart the camera completely
            if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
              console.log("iOS device detected, restarting camera completely");
              startCamera(selectedCameraDeviceId);
            }
          });
        } else {
          console.log("Video ref or srcObject not available, restarting camera");
          // If for some reason the video stream is lost, restart it
          startCamera(selectedCameraDeviceId);
        }
      }, 100);
    }
  }, [selectedPhotoIndex, selectedCameraDeviceId, cameraManuallyStarted, showPhotoGrid]); // Removed startCamera function from dependencies

  // Preload images for the selected photo
  useEffect(() => {
    if (selectedPhotoIndex !== null && photos[selectedPhotoIndex]) {
      for (const url of photos[selectedPhotoIndex].images) {
        const img = new Image();
        img.src = url;
      }
    }
  }, [selectedPhotoIndex, photos]);

  // Create a ref to store the current photos array
  const photosRef = useRef(photos);
  photosRef.current = photos;

  // Ref to store the frame pre-generation function from PhotoGallery
  const preGenerateFrameRef = useRef(null);

  // Callback to receive the frame pre-generation function from PhotoGallery
  const handlePreGenerateFrameCallback = useCallback((preGenerateFunction) => {
    preGenerateFrameRef.current = preGenerateFunction;
  }, []);

  // Callback to receive framed image cache updates from PhotoGallery
  const handleFramedImageCacheUpdate = useCallback((framedImageCache) => {
    setPhotoGalleryFramedImageCache(framedImageCache);
  }, []);

  // Clear QR code when navigating between photos
  useEffect(() => {
    if (qrCodeData && qrCodeData.photoIndex !== selectedPhotoIndex) {
      console.log('Clearing QR code due to photo navigation');
      setQrCodeData(null);
    }
  }, [selectedPhotoIndex, qrCodeData]);

  // Updated to use the utility function - using refs to avoid dependencies
  const handlePreviousPhoto = useCallback(async () => {
    const newIndex = goToPreviousPhoto(photosRef.current, selectedPhotoIndex);
    if (newIndex !== selectedPhotoIndex) {
      // Pre-generate frame for new photo if needed
      if (preGenerateFrameRef.current) {
        await preGenerateFrameRef.current(newIndex);
        
        // Also pre-generate frame for the next photo in the backward direction
        // to ensure smooth navigation when user continues pressing previous
        const photos = photosRef.current;
        const futureIndex = newIndex - 1;
        if (futureIndex >= 0 && photos[futureIndex]) {
          // Use setTimeout to avoid blocking the UI
          setTimeout(() => preGenerateFrameRef.current?.(futureIndex), 100);
        }
      }
      setSelectedPhotoIndex(newIndex);
      setSelectedSubIndex(0);
    }
  }, [selectedPhotoIndex]);

  // Updated to use the utility function - using refs to avoid dependencies  
  const handleNextPhoto = useCallback(async () => {
    const newIndex = goToNextPhoto(photosRef.current, selectedPhotoIndex);
    if (newIndex !== selectedPhotoIndex) {
      // Pre-generate frame for new photo if needed
      if (preGenerateFrameRef.current) {
        await preGenerateFrameRef.current(newIndex);
        
        // Also pre-generate frame for the next photo in the forward direction
        // to ensure smooth navigation when user continues pressing next
        const photos = photosRef.current;
        const futureIndex = newIndex + 1;
        if (futureIndex < photos.length && photos[futureIndex]) {
          // Use setTimeout to avoid blocking the UI
          setTimeout(() => preGenerateFrameRef.current?.(futureIndex), 100);
        }
      }
      setSelectedPhotoIndex(newIndex);
      setSelectedSubIndex(0);
    }
  }, [selectedPhotoIndex]);

  // Now update the keyboard handler to use these functions
  const handleKeyDown = useCallback((e) => {
    // Close settings with ESC if they're open
    if (e.key === 'Escape' && showControlOverlay) {
      e.preventDefault();
      setShowControlOverlay(false);
      return;
    }

    // Handle photo navigation
    if (selectedPhotoIndex !== null) {
      if (e.key === 'Escape') {
        setSelectedPhotoIndex(null);
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePreviousPhoto();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextPhoto();
      }
    }
  }, [selectedPhotoIndex, showControlOverlay, handlePreviousPhoto, handleNextPhoto]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Smart timer for generation countdown - only runs when there are active countdowns
  // Use a ref to track the interval to avoid restarting on every photos change
  const countdownIntervalRef = useRef(null);
  
  useEffect(() => {
    const hasActiveCountdowns = photos.some(p => p.generating && p.generationCountdown > 0);
    
    // If we already have an interval running and still have countdowns, don't restart
    if (countdownIntervalRef.current && hasActiveCountdowns) {
      return;
    }
    
    // Clear existing interval if no countdowns or if we need to restart
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    
    // Only start new interval if we have active countdowns
    if (!hasActiveCountdowns) {
      return;
    }
    
    countdownIntervalRef.current = setInterval(() => {
      setRegularPhotos((previousPhotos) => {
        const stillHasActiveCountdowns = previousPhotos.some(p => p.generating && p.generationCountdown > 0);
        
        if (!stillHasActiveCountdowns) {
          // Clear the interval when no more countdowns
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return previousPhotos; // Return unchanged
        }
        // Only update photos that actually have countdowns
        return previousPhotos.map((p) => {
          if (p.generating && p.generationCountdown > 0) {
            return { ...p, generationCountdown: p.generationCountdown - 1 };
          }
          return p;
        });
      });
    }, 1000);
    
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [photos]); // Depend on photos array but use internal logic to prevent unnecessary re-runs

  // -------------------------
  //   Load image with download progress
  // -------------------------
  const loadImageWithProgress = (imageUrl, photoIndex, onComplete) => {
    
    // First, set loading status
    setRegularPhotos(previous => {
      const updated = [...previous];
      if (updated[photoIndex]) {
        updated[photoIndex] = {
          ...updated[photoIndex],
          loading: true,
          statusText: 'Loading artwork...'
        };
      }
      return updated;
    });

    // Use XMLHttpRequest to track download progress
    const xhr = new XMLHttpRequest();
    xhr.open('GET', imageUrl);
    xhr.responseType = 'blob';
    
    // Throttle download progress updates - use ref for scope access
    let downloadProgressTimeout = null;
    
    // Function to clear pending progress updates
    const clearPendingProgressUpdate = () => {
      if (downloadProgressTimeout) {
        clearTimeout(downloadProgressTimeout);
        downloadProgressTimeout = null;
      }
    };
    
    // Track download progress
    xhr.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const downloadProgress = (event.loaded / event.total) * 100;

        
        // For completion (100%), update immediately. Otherwise throttle.
        if (downloadProgress >= 100) {
          // Clear any pending throttled update
          clearPendingProgressUpdate();
          // Update immediately for completion
          setRegularPhotos(previous => {
            const updated = [...previous];
            if (updated[photoIndex]) {
              updated[photoIndex] = {
                ...updated[photoIndex],
                loading: true,
                statusText: 'Loading artwork... 100%'
              };
            }
            return updated;
          });
        } else {
          // Throttle intermediate progress updates to reduce re-renders
          clearPendingProgressUpdate();
          
          downloadProgressTimeout = setTimeout(() => {
            setRegularPhotos(previous => {
              const updated = [...previous];
              if (updated[photoIndex]) {
                updated[photoIndex] = {
                  ...updated[photoIndex],
                  loading: true,
                  statusText: Math.round(downloadProgress) > 0 
                    ? `Loading artwork... ${Math.round(downloadProgress)}%` 
                    : 'Loading artwork...'
                };
              }
              return updated;
            });
          }, 300); // Slightly longer throttle for intermediate updates
        }
      }
    });
    
    // Handle download completion
    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        // Create object URL from blob for optimal performance
        const blob = xhr.response;
        const objectUrl = URL.createObjectURL(blob);
        
        // Create image to verify it loads
        const img = new Image();
        img.addEventListener('load', () => {
          // Clear any pending throttled download progress updates
          clearPendingProgressUpdate();
          onComplete(objectUrl);
          // Don't immediately revoke blob URLs as they're needed for downloads
          // The blob URLs will be cleaned up when the page unloads or photos are replaced
        });
        
        img.addEventListener('error', () => {
          console.error(`Image load failed for photo ${photoIndex}`);
          // Fallback to original URL
          onComplete(imageUrl);
          URL.revokeObjectURL(objectUrl);
        });
        
        img.src = objectUrl;
      } else {
        console.error(`Download failed for photo ${photoIndex}: ${xhr.status}`);
        // Update status to show error and fallback to simple image loading
        setRegularPhotos(previous => {
          const updated = [...previous];
          if (updated[photoIndex]) {
            updated[photoIndex] = {
              ...updated[photoIndex],
              loading: false,
              statusText: 'Loading artwork...'
            };
          }
          return updated;
        });
        // Fallback to simple image loading
        onComplete(imageUrl);
      }
    });
    
    // Handle download errors
    xhr.addEventListener('error', () => {
      console.error(`Download error for photo ${photoIndex}`);
      // Update status to show error and fallback to simple image loading
      setRegularPhotos(previous => {
        const updated = [...previous];
        if (updated[photoIndex]) {
          updated[photoIndex] = {
            ...updated[photoIndex],
            loading: false,
            statusText: 'Loading artwork...'
          };
        }
        return updated;
      });
      // Fallback to simple image loading
      onComplete(imageUrl);
    });
    
    xhr.send();
  };

  // -------------------------
  //   Timeout Management Helper Functions
  // -------------------------
  
  const clearAllTimeouts = () => {
    const timeouts = projectTimeoutRef.current;
    
    // Clear overall project timeout
    if (timeouts.overallTimer) {
      clearTimeout(timeouts.overallTimer);
      timeouts.overallTimer = null;
    }
    
    // Clear watchdog timeout
    if (timeouts.watchdogTimer) {
      clearTimeout(timeouts.watchdogTimer);
      timeouts.watchdogTimer = null;
    }
    
    // Clear all job-specific timeouts
    timeouts.jobTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    timeouts.jobTimers.clear();
    
    // Reset timing data
    timeouts.projectStartTime = null;
    timeouts.lastProgressTime = null;
  };

  const startProjectTimeouts = () => {
    const timeouts = projectTimeoutRef.current;
    const now = Date.now();
    
    timeouts.projectStartTime = now;
    timeouts.lastProgressTime = now;

    // Overall project timeout (5 minutes)
    timeouts.overallTimer = setTimeout(() => {
      console.error('Overall project timeout reached - canceling all jobs');
      handleProjectTimeout('Overall project timeout reached');
    }, TIMEOUT_CONFIG.OVERALL_PROJECT_TIMEOUT);

    // Project watchdog timeout (2 minutes of no progress)
    timeouts.watchdogTimer = setTimeout(() => {
      console.error('Project watchdog timeout - no progress detected');
      handleProjectTimeout('No progress detected for extended period');
    }, TIMEOUT_CONFIG.PROJECT_WATCHDOG_TIMEOUT);
  };

  const updateWatchdogTimer = () => {
    const timeouts = projectTimeoutRef.current;
    
    // Clear existing watchdog timer
    if (timeouts.watchdogTimer) {
      clearTimeout(timeouts.watchdogTimer);
    }
    
    // Update last progress time
    timeouts.lastProgressTime = Date.now();
    
    // Start new watchdog timer
    timeouts.watchdogTimer = setTimeout(() => {
      console.error('Project watchdog timeout - no progress detected');
      handleProjectTimeout('No progress detected for extended period');
    }, TIMEOUT_CONFIG.PROJECT_WATCHDOG_TIMEOUT);
  };

  const startJobTimeout = (jobId, photoIndex) => {
    const timeouts = projectTimeoutRef.current;
    
    // Clear existing timer for this job if any
    if (timeouts.jobTimers.has(jobId)) {
      clearTimeout(timeouts.jobTimers.get(jobId));
    }
    
    // Start new timer for this job
    const timer = setTimeout(() => {
      console.error(`Job timeout for jobId: ${jobId}, photoIndex: ${photoIndex}`);
      handleJobTimeout(jobId, photoIndex);
    }, TIMEOUT_CONFIG.PER_JOB_TIMEOUT);
    
    timeouts.jobTimers.set(jobId, timer);
    
    // Update photo with job start time
    const updateJobStartTime = (prev) => {
      const updated = [...prev];
      if (updated[photoIndex]) {
        updated[photoIndex] = {
          ...updated[photoIndex],
          jobStartTime: Date.now(),
          lastProgressTime: Date.now()
        };
      }
      return updated;
    };
    
    // Update BOTH state arrays
    setRegularPhotos(updateJobStartTime);
    setPhotos(updateJobStartTime);
  };

  const clearJobTimeout = (jobId) => {
    const timeouts = projectTimeoutRef.current;
    
    if (timeouts.jobTimers.has(jobId)) {
      clearTimeout(timeouts.jobTimers.get(jobId));
      timeouts.jobTimers.delete(jobId);
    }
  };

  const handleJobTimeout = (jobId, photoIndex) => {
    console.error(`Job ${jobId} at photo index ${photoIndex} timed out`);
    
    // Clear the specific job timeout
    clearJobTimeout(jobId);
    
    // Mark the photo as timed out
    const markPhotoTimedOut = (prev) => {
      const updated = [...prev];
      if (updated[photoIndex]) {
        updated[photoIndex] = {
          ...updated[photoIndex],
          generating: false,
          loading: false,
          error: 'GENERATION TIMEOUT: Job took too long',
          permanentError: true,
          statusText: 'Timed Out',
          timedOut: true
        };
      }
      return updated;
    };
    
    // Update BOTH state arrays
    setRegularPhotos(markPhotoTimedOut);
    setPhotos(markPhotoTimedOut);
    
    // Check if all jobs are done (completed, failed, or timed out)
    setTimeout(() => {
      const checkAllJobsDone = (prev) => {
        const stillGenerating = prev.some(photo => photo.generating);
        if (!stillGenerating && activeProjectReference.current) {
          console.log('All jobs finished (including timeouts), clearing active project');
          activeProjectReference.current = null;
          clearAllTimeouts();
        }
        return prev;
      };
      
      setRegularPhotos(checkAllJobsDone);
      setPhotos(checkAllJobsDone);
    }, 100);
  };

  const handleProjectTimeout = (reason) => {
    console.error(`Project timeout: ${reason}`);
    
    // Clear all timeouts
    clearAllTimeouts();
    
    // Mark all generating photos as timed out
    const markAllTimedOut = (prev) => {
      const updated = [...prev];
      let hasChanges = false;
      
      updated.forEach((photo, index) => {
        if (photo.generating) {
          updated[index] = {
            ...photo,
            generating: false,
            loading: false,
            error: `PROJECT TIMEOUT`,
            permanentError: false, // Make timeout errors retryable
            retryable: true, // Allow retry for timeout errors
            statusText: 'Timed Out',
            timedOut: true
          };
          hasChanges = true;
        }
      });
      
      if (hasChanges && activeProjectReference.current) {
        // Try to cancel the project on the backend
        if (sogniClient && activeProjectReference.current) {
          sogniClient.cancelProject?.(activeProjectReference.current)
            .catch(err => console.warn('Failed to cancel project on backend:', err));
        }
        
        activeProjectReference.current = null;
      }
      
      return updated;
    };
    
    // Update BOTH state arrays
    setRegularPhotos(markAllTimedOut);
    setPhotos(markAllTimedOut);
  };

  // -------------------------
  //   Shared logic for generating images from a Blob
  // -------------------------
  const generateFromBlob = async (photoBlob, newPhotoIndex, dataUrl, isMoreOperation = false, sourceType = 'upload') => {
    try {
      // Check if user has Premium Spark (used multiple times in this function)
      const hasPremiumSpark = isPremiumBoosted(balances, walletTokenType);
      
      // Ensure we have a working client (should already be initialized)
      if (!sogniClient) {
        console.error('🔐 No Sogni client available for generation');
        setBackendError('Sogni client not initialized. Please refresh the page.');
        return;
      }

      // Clear any existing timeouts before starting new generation
      if (!isMoreOperation) {
        clearAllTimeouts();
        
        // Clear QR codes and mobile share cache when starting a new batch since photo indices will change
        if (qrCodeData) {
          console.log('Clearing QR code due to new batch generation from fresh photo');
          setQrCodeData(null);
        }
        
        // Clear mobile share cache since photo indices will point to different images
        console.log('Clearing mobile share cache due to new batch generation from fresh photo');
        setMobileShareCache({});
      }
      
      setLastPhotoData({ blob: photoBlob, dataUrl, sourceType });
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      // Get theme-filtered prompts for random selection
      const getFilteredPromptsForRandom = () => {
        // For Flux models, use all available prompts without theme filtering
        const isFluxKontext = isFluxKontextModel(selectedModel);
        return isFluxKontext ? stylePrompts : getEnabledPrompts(currentThemeState, stylePrompts);
      };

      // Get blocked prompts from localStorage to filter them out
      let blockedPrompts = [];
      try {
        const blocked = localStorage.getItem('sogni_blocked_prompts');
        if (blocked) {
          blockedPrompts = JSON.parse(blocked);
        }
      } catch (e) {
        console.warn('Error reading blocked prompts:', e);
      }

      // Prompt logic: use context state
      let finalPositivePrompt = positivePrompt.trim();
      
      // Handle special style modes (these override any existing prompt text)
      if (selectedStyle === 'copyImageStyle') {
        // Validate that we have a style reference image
        if (!styleReferenceImage?.croppedBlob) {
          console.error('❌ copyImageStyle mode is active but no style reference image is available');
          setBackendError('No style reference image found. Please upload a style reference by clicking "Copy Image Style".');
          return;
        }
        
        // Special prompt for style reference mode
        finalPositivePrompt = "identify the two images in the scene and transform the main person image into the style of the second image, the result must be the transformed person image only, generate a dramatically transformed image";
        console.log('🎨 Using Copy Image Style mode with special prompt');
      } else if (selectedStyle === 'custom') {
        finalPositivePrompt = finalPositivePrompt || '';
      } else if (selectedStyle === 'random') {
        // Pick one random style and use it for all images in the batch
        const filteredPrompts = getFilteredPromptsForRandom();
        const randomStyle = getRandomStyle(filteredPrompts);
        finalPositivePrompt = filteredPrompts[randomStyle] || '';
      } else if (selectedStyle === 'randomMix') {
        // Use different random prompts for each image - creates {prompt1|prompt2|...} syntax
        const filteredPrompts = getFilteredPromptsForRandom();
        finalPositivePrompt = getRandomMixPrompts(numImages, filteredPrompts); 
      } else if (selectedStyle === 'oneOfEach') {
        // Use one prompt from each enabled theme group in order
        finalPositivePrompt = getOneOfEachPrompts(currentThemeState, stylePrompts, numImages);
      } else {
        // Use the selected style prompt, but skip if it's blocked
        if (blockedPrompts.includes(selectedStyle)) {
          console.log(`🚫 Selected style "${selectedStyle}" is blocked, falling back to random style`);
          // Fall back to random style from enabled prompts
          const filteredPrompts = getFilteredPromptsForRandom();
          const randomStyle = getRandomStyle(filteredPrompts);
          finalPositivePrompt = filteredPrompts[randomStyle] || finalPositivePrompt || '';
        } else {
          // Use the selected style prompt, or fallback to user's custom text
          finalPositivePrompt = stylePrompts[selectedStyle] || finalPositivePrompt || '';
        }
      }

      // Inject worker preferences into the prompt
      // Worker preferences are a Premium Spark feature - only add them if:
      // 1. Using SOGNI tokens, OR
      // 2. Using Spark with Premium status
      // For backend/demo mode: server will enforce its own preferences
      // For frontend auth mode: use user-configured preferences (if premium)
      const workerPreferences = [];
      
      // Check if user has Premium Spark to determine if worker preferences are allowed
      const canUseWorkerPreferences = walletTokenType !== 'spark' || hasPremiumSpark;
      
      if (canUseWorkerPreferences) {
        if (authState.authMode !== 'frontend') {
          // Backend/demo mode - use hardcoded server preferences (kept for backward compatibility)
          if (settings.requiredWorkers && Array.isArray(settings.requiredWorkers) && settings.requiredWorkers.length > 0) {
            workerPreferences.push(`--workers=${settings.requiredWorkers.join(',')}`);
          }
          if (settings.preferWorkers && settings.preferWorkers.length > 0) {
            workerPreferences.push(`--preferred-workers=${settings.preferWorkers.join(',')}`);
          }
          if (settings.skipWorkers && settings.skipWorkers.length > 0) {
            workerPreferences.push(`--skip-workers=${settings.skipWorkers.join(',')}`);
          }
        } else {
          // Frontend auth mode - use user-configured preferences
          if (settings.requiredWorkers && Array.isArray(settings.requiredWorkers) && settings.requiredWorkers.length > 0) {
            workerPreferences.push(`--workers=${settings.requiredWorkers.join(',')}`);
          }
          if (settings.preferWorkers && settings.preferWorkers.length > 0) {
            workerPreferences.push(`--preferred-workers=${settings.preferWorkers.join(',')}`);
          }
          if (settings.skipWorkers && settings.skipWorkers.length > 0) {
            workerPreferences.push(`--skip-workers=${settings.skipWorkers.join(',')}`);
          }
        }
        if (workerPreferences.length > 0) {
          finalPositivePrompt = `${finalPositivePrompt}${workerPreferences.join(' ')}`;
        }
      } else {
        console.log('⚠️ Worker preferences SKIPPED in frontend - Premium Spark required');
      }

      // Style prompt logic: use context state
      let finalStylePrompt = stylePrompt.trim() || ''; 
      // Negative prompt logic: use context state
      let finalNegativePrompt = negativePrompt.trim() || 'lowres, worst quality, low quality'; 
      // Seed logic: use context state
      let seedValue = seed.trim();
      let seedParam = undefined;
      if (seedValue !== '') {
        const parsed = parseInt(seedValue, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 4294967295) {
          seedParam = parsed;
        }
      }
      
      console.log('Style prompt:', finalPositivePrompt);
      console.log('Prompt length:', finalPositivePrompt.length);
      console.log('Worker preferences applied:', workerPreferences);
      console.log('Source type:', sourceType);
      projectStateReference.current = {
        currentPhotoIndex: newPhotoIndex,
        pendingCompletions: new Map(),
        jobMap: new Map() // Store jobMap in projectState
      };

      // Skip setting up photos state if this is a "more" operation
      if (!isMoreOperation) {
        setRegularPhotos(previous => {
          // Clean up blob URLs from previous photos to prevent memory leaks
          previous.forEach(photo => {
            if (photo.images) {
              photo.images.forEach(imageUrl => {
                if (imageUrl && imageUrl.startsWith('blob:')) {
                  URL.revokeObjectURL(imageUrl);
                }
              });
            }
          });
          
          const existingProcessingPhotos = previous.filter(photo => 
            photo.generating && photo.jobId && photo.progress
          );
          
          const newPhotos = [];
          if (keepOriginalPhoto) { // Use context state
            newPhotos.push({
              id: Date.now(),
              generating: false,
              loading: false,
              images: [dataUrl],
              originalDataUrl: dataUrl,
              newlyArrived: false,
              isOriginal: true,
              sourceType // Include sourceType in original photo
            });
          }
          
          // Use numImages from context state
          for (let index = 0; index < numImages; index++) { 
            const existingPhoto = existingProcessingPhotos[index];
            
            if (existingPhoto && existingPhoto.jobId) {
              newPhotos.push({
                ...existingPhoto,
                originalDataUrl: existingPhoto.originalDataUrl || dataUrl
              });
            } else {
              // Calculate the global photo index for frame assignment
              const globalPhotoIndex = (keepOriginalPhoto ? 1 : 0) + index;
              
              newPhotos.push({
                id: Date.now() + index + 1,
                generating: true,
                loading: true,
                progress: 0,
                images: [],
                error: null,
                originalDataUrl: dataUrl, // Use reference photo as placeholder
                newlyArrived: false,
                statusText: 'Calling Art Robot',
                sourceType, // Include sourceType in generated photos
                promptKey: (selectedStyle && selectedStyle !== 'custom' && selectedStyle !== 'random' && selectedStyle !== 'randomMix' && selectedStyle !== 'oneOfEach') ? selectedStyle : undefined, // Track which style is being used
                customSceneName: selectedStyle === 'custom' && customSceneName ? customSceneName : undefined, // Store custom scene name at creation time
                // Assign Taipei frame number based on photo index for equal distribution (1-6)
                taipeiFrameNumber: (globalPhotoIndex % 6) + 1,
                framePadding: 0 // Will be updated by migration effect in PhotoGallery
              });
            }
          }
          return newPhotos;
        });
      }

      if (!isMoreOperation) {
        // Stop camera when showing photo grid
        stopCamera();
        setShowPhotoGrid(true);
        setShowStartMenu(false);
      }

      let processedBlob = photoBlob;
      if (isIOS) {
        // ... (blob processing remains the same)
      }
      
      const blobArrayBuffer = await processedBlob.arrayBuffer();
      
      // Show upload progress (only for backend clients)
      if (authState.authMode !== 'frontend') {
        setShowUploadProgress(true);
        setUploadProgress(0);
        setUploadStatusText('Uploading your image...');
      }
      
      // Create project using context state for settings
      const isFluxKontext = isFluxKontextModel(selectedModel);
      
      const projectConfig = { 
        type: 'image', // Required in SDK v4.x.x
        testnet: false,
        tokenType: walletTokenType, // Use selected payment method from wallet
        isPremiumSpark: hasPremiumSpark, // Pass premium status to backend
        modelId: selectedModel,
        positivePrompt: finalPositivePrompt,
        negativePrompt: finalNegativePrompt,
        stylePrompt: finalStylePrompt,
        sizePreset: 'custom',
        width: getCustomDimensions(aspectRatio).width,  // Use aspectRatio here
        height: getCustomDimensions(aspectRatio).height, // Use aspectRatio here
        steps: inferenceSteps,
        guidance: isFluxKontext ? guidance : promptGuidance, // Use guidance for Flux.1 Kontext, promptGuidance for others
        numberOfMedia: numImages, // Use context state
        numberOfPreviews: authState.authMode === 'frontend' && isFluxKontext ? 5 : 10, // Frontend Flux gets 5 previews, backend gets 10
        scheduler: scheduler,
        timeStepSpacing: timeStepSpacing,
        outputFormat: outputFormat, // Add output format setting
        sensitiveContentFilter: sensitiveContentFilter, // Adapters will convert to disableNSFWFilter for SDK
        sourceType: sourceType, // Add sourceType for analytics tracking
        ...(seedParam !== undefined ? { seed: seedParam } : {})
      };
      
      // Add image configuration based on model type
      if (isFluxKontext) {
        // For Flux.1 Kontext, use contextImages array (SDK expects array)
        // Check if we're in Copy Image Style mode
        if (selectedStyle === 'copyImageStyle') {
          if (!styleReferenceImage?.croppedBlob) {
            console.error('❌ Copy Image Style mode active but no style reference blob available');
            throw new Error('Please select a style reference image first by clicking "Copy Image Style"');
          }
          
          // In style reference mode, use both images: [userPhoto, styleReference]
          const styleRefArrayBuffer = await styleReferenceImage.croppedBlob.arrayBuffer();
          projectConfig.contextImages = [
            new Uint8Array(blobArrayBuffer),      // First image: user's photo (subject)
            new Uint8Array(styleRefArrayBuffer)   // Second image: style reference
          ];
          console.log('🎨 Using both user photo and style reference for Flux Kontext');
          console.log(`📊 Context images: User photo (${blobArrayBuffer.byteLength} bytes) + Style ref (${styleRefArrayBuffer.byteLength} bytes)`);
        } else {
          // Normal Flux Kontext mode - just use the user's photo
          projectConfig.contextImages = [new Uint8Array(blobArrayBuffer)];
        }
      } else {
        // For other models, use controlNet
        projectConfig.controlNet = {
          name: 'instantid',
          image: new Uint8Array(blobArrayBuffer),
          strength: controlNetStrength,
          mode: 'balanced',
          guidanceStart: 0,
          guidanceEnd: controlNetGuidanceEnd,
        };
      }

      // Estimate job cost before creating project (for smart wallet switching)
      // Only do cost estimation for authenticated users - demo mode doesn't need it
      let estimatedCost = null;
      if (authState.isAuthenticated) {
        try {
          estimatedCost = await estimateJobCost(sogniClient, {
            model: selectedModel,
            imageCount: numImages,
            stepCount: inferenceSteps,
            guidance: isFluxKontext ? guidance : promptGuidance,
            scheduler: scheduler,
            network: 'fast',
            previewCount: authState.authMode === 'frontend' && isFluxKontext ? 5 : 10, // Frontend Flux gets 5 previews
            contextImages: isFluxKontext ? (selectedStyle === 'copyImageStyle' && styleReferenceImage ? 2 : 1) : 0,
            cnEnabled: !isFluxKontext,
            tokenType: walletTokenType
          });
          if (estimatedCost !== null) {
            setLastJobCostEstimate(estimatedCost);
            console.log('💰 Estimated job cost:', estimatedCost, walletTokenType);
          }
        } catch (costError) {
          console.warn('Failed to estimate cost:', costError);
          // Continue even if cost estimation fails
        }
      } else {
        console.log('⏭️ Skipping cost estimation for demo mode (not authenticated)');
      }

      // Check if current wallet has sufficient balance before submitting
      if (balances && estimatedCost !== null) {
        const currentBalance = parseFloat(balances[walletTokenType]?.net || '0');
        if (currentBalance < estimatedCost) {
          console.log(`❌ Insufficient ${walletTokenType} balance: ${currentBalance} < ${estimatedCost}`);
          
          // Check if alternative wallet has enough balance
          const alternativeTokenType = walletTokenType === 'spark' ? 'sogni' : 'spark';
          const alternativeBalance = parseFloat(balances[alternativeTokenType]?.net || '0');
          
          if (alternativeBalance >= estimatedCost) {
            // Alternative wallet has enough - auto-switch with notification
            console.log(`✅ Switching to ${alternativeTokenType} wallet (has ${alternativeBalance}, need ${estimatedCost})`);
            
            showToast({
              type: 'warning',
              title: 'Insufficient Balance - Auto-Switching',
              message: `Not enough ${walletTokenType === 'spark' ? 'Spark Points' : 'SOGNI'}. Switching to ${alternativeTokenType === 'spark' ? 'Spark Points' : 'SOGNI'} wallet (${alternativeBalance.toFixed(2)} available)`,
              timeout: 6000
            });
            
            // Switch the payment method
            switchPaymentMethod(alternativeTokenType);
            
            // Update the projectConfig with the new tokenType
            projectConfig.tokenType = alternativeTokenType;
            
            // Continue with project creation using the alternative wallet
          } else {
            // Neither wallet has enough balance
            console.log(`❌ Neither wallet has sufficient balance. ${walletTokenType}: ${currentBalance}, ${alternativeTokenType}: ${alternativeBalance}, need: ${estimatedCost}`);
            
            // Clear all timeouts when preventing submission
            clearAllTimeouts();
            activeProjectReference.current = null;

            // Mark all generating photos as cancelled with insufficient credits error
            setRegularPhotos(prevPhotos => {
              return prevPhotos.map(photo => {
                if (photo.generating) {
                  return {
                    ...photo,
                    generating: false,
                    loading: false,
                    error: 'INSUFFICIENT CREDITS',
                    permanentError: true,
                    statusText: 'Out of Credits',
                    cancelled: true
                  };
                }
                return photo;
              });
            });

            // Show the out of credits popup
            setShowOutOfCreditsPopup(true);

            return;
          }
        }
      }
      
      let project;
      try {
        project = await sogniClient.projects.create(projectConfig);
        console.log('Project created:', project.id, 'with jobs:', project.jobs);
      } catch (createError) {
        console.error(`[GENERATE] Project creation failed:`, createError);
        
        // Extract error message from various error formats
        let errorMessage = 'Failed to create project';
        if (createError instanceof Error) {
          errorMessage = createError.message;
        } else if (typeof createError === 'object' && createError !== null) {
          if (createError.message) {
            errorMessage = createError.message;
          } else if (createError.error) {
            errorMessage = createError.error;
          } else if (createError.payload?.message) {
            errorMessage = createError.payload.message;
          } else if (createError.payload?.error) {
            errorMessage = createError.payload.error;
          }
        }
        
        // Log the full error for debugging
        console.error(`[GENERATE] Full error details:`, {
          error: createError,
          message: errorMessage,
          type: typeof createError,
          keys: createError && typeof createError === 'object' ? Object.keys(createError) : []
        });
        
        // Clear all timeouts when project creation fails
        clearAllTimeouts();
        activeProjectReference.current = null;
        
        // Mark all generating photos as failed
        setRegularPhotos(prevPhotos => {
          return prevPhotos.map(photo => {
            if (photo.generating) {
              return {
                ...photo,
                generating: false,
                loading: false,
                error: errorMessage,
                permanentError: true,
                statusText: 'Creation Failed'
              };
            }
            return photo;
          });
        });
        
        return; // Exit early - don't continue with event setup
      }

      activeProjectReference.current = project.id;
      activeProjectObjectReference.current = project;
      
      // Track batch generation in Google Analytics
      try {
        trackBatchGeneration({
          batch_size: numImages,
          style_id: selectedStyle || 'unknown',
          model: selectedModel,
          source: sourceType,
          is_regeneration: isMoreOperation
        });
      } catch (analyticsError) {
        console.warn('Analytics tracking failed:', analyticsError);
        // Don't block generation if analytics fails
      }
      
      // Start project timeout management
      clearAllTimeouts(); // Clear any existing timeouts
      startProjectTimeouts();
      
      // Track image generation event
      trackEvent('Generation', 'start', selectedStyle, numImages);

      // Set up upload progress listeners with throttling to reduce flickering
      let uploadProgressTimeout = null;
      project.on('uploadProgress', (progress) => {
        // Throttle upload progress updates to reduce flickering on high-res displays
        if (uploadProgressTimeout) {
          clearTimeout(uploadProgressTimeout);
        }
        
        uploadProgressTimeout = setTimeout(() => {
          setUploadProgress(progress);
          if (progress < 100) {
            setUploadStatusText(`Uploading your image... ${Math.round(progress)}%`);
          } else {
            setUploadStatusText('Processing on server...');
          }
        }, 100); // Throttle to max 10 updates per second
      });

      project.on('uploadComplete', () => {
        setShowUploadProgress(false);
        setUploadProgress(0);
      });

      // Set up handlers for any jobs that exist immediately
      if (project.jobs && project.jobs.length > 0) {
        project.jobs.forEach((job, index) => {
          projectStateReference.current.jobMap.set(job.id, index);
        });
      }

      // For frontend clients, jobs are created dynamically - map them when they start
      project.on('jobStarted', (job) => {
        if (!projectStateReference.current.jobMap.has(job.id)) {
          const nextIndex = projectStateReference.current.jobMap.size;
          projectStateReference.current.jobMap.set(job.id, nextIndex);
          // console.log(`Mapped frontend job ${job.id} to index ${nextIndex}`);
        }
      });
      


      // Attach a single project-level job event handler with throttling
      let progressUpdateTimeout = null;
      let nonProgressUpdateTimeout = null;
      
      project.on('job', (event) => {
        const { type, jobId, workerName, queuePosition, jobIndex, positivePrompt, progress } = event;
        

        
        // Find the photo associated with this job
        const photoIndex = projectStateReference.current.jobMap.has(jobId)
          ? projectStateReference.current.jobMap.get(jobId) + (keepOriginalPhoto ? 1 : 0)
          : -1; // Handle cases where job ID might not be in the map yet
          
        if (photoIndex === -1) {
            console.warn(`Job event received for unknown job ID: ${jobId}. Event type: ${type}. Skipping update.`);
            return;
        }

        // Throttle progress updates to reduce excessive re-renders
        if (type === 'progress') {
          // Update watchdog timer for progress events (but throttled)
          if (progressUpdateTimeout) {
            clearTimeout(progressUpdateTimeout);
          }
          progressUpdateTimeout = setTimeout(() => {
            // Update watchdog timer along with progress to batch the operations
            updateWatchdogTimer();
            
            const updateProgress = (prev) => {
              const updated = [...prev];
              if (updated[photoIndex] && !updated[photoIndex].permanentError) {
                // Use workerName from current event if available and not "Worker", otherwise fall back to cached value
                const cachedWorkerName = updated[photoIndex].workerName || 'Worker';
                const currentWorkerName = (workerName && workerName !== 'Worker') ? workerName : cachedWorkerName;
                const displayProgress = Math.round((progress ?? 0) * 100);
                
                updated[photoIndex] = {
                  ...updated[photoIndex],
                  generating: true,
                  loading: true,
                  progress: displayProgress,
                  statusText: displayProgress > 0 
                    ? `${currentWorkerName} makin' art ${displayProgress}%`
                    : `${currentWorkerName} makin' art`,
                  workerName: currentWorkerName, // Update the cached worker name
                  jobId,
                  lastProgressTime: Date.now()
                };
              }
              return updated;
            };
            
            // Update BOTH state arrays
            setRegularPhotos(updateProgress);
            setPhotos(updateProgress);
          }, 200); // Throttle to max 5 updates per second (reduced from 10 to minimize flickering on high-res displays)
          return; // Don't process immediately
        }

        // Update project watchdog timer for non-progress events
        if (['initiating', 'started'].includes(type)) {
          updateWatchdogTimer();
        }

        // Throttle non-progress events to reduce cascade renders
        if (['queued', 'initiating', 'started'].includes(type)) {
          if (nonProgressUpdateTimeout) {
            clearTimeout(nonProgressUpdateTimeout);
          }
          nonProgressUpdateTimeout = setTimeout(() => {
            const updateNonProgress = (prev) => {
              const updated = [...prev];
              if (photoIndex >= updated.length) return prev;
              // Process the event type
              if (type === 'initiating' || type === 'started') {
                // Try to find a hashtag for the style prompt
                let hashtag = '';
                const stylePromptValue = updated[photoIndex].stylePrompt;
                if (stylePromptValue) {
                  const foundKey = Object.entries(stylePrompts).find(([, value]) => value === stylePromptValue)?.[0];
                  if (foundKey) {
                    hashtag = `#${foundKey}`;
                  }
                }
                
                updated[photoIndex] = {
                  ...updated[photoIndex],
                  generating: true,
                  loading: true,
                  statusText: workerName ? `${workerName} starting` : 'Worker starting',
                  workerName: workerName || 'Worker',
                  jobId,
                  jobIndex,
                  positivePrompt,
                  stylePrompt: stylePromptValue?.trim() || '',
                  hashtag
                };
              } else if (type === 'queued') {
                const currentStatusText = updated[photoIndex].statusText || 'Calling Art Robot...';
                // Only update with queue position if it's greater than 1
                // Queue position 1 means it's next/being processed, so keep the worker assignment label
                if ((currentStatusText.includes('Calling Art Robot') || currentStatusText.includes('In queue')) && queuePosition > 1) {
                  updated[photoIndex] = {
                    ...updated[photoIndex],
                    generating: true,
                    loading: true,
                    statusText: `Queue position ${queuePosition}`,
                    jobId,
                  };
                }
              }
              return updated;
            };
            
            // Update BOTH state arrays
            setRegularPhotos(updateNonProgress);
            setPhotos(updateNonProgress);
          }, 50); // Very short throttle for non-progress events
          return; // Don't process immediately
        }

        // Handle job timeout for started events
        if (type === 'started') {
          startJobTimeout(jobId, photoIndex);
        }

        // All other events are now handled by throttling above
      });

      // Project level events
      project.on('progress', (progressEvent) => {
        console.log(`Progress event for project ${project.id}:`, progressEvent);
        
        // Note: Individual job progress is now handled by the adapter for frontend clients
        // The adapter converts project-level progress to individual job events
        
        // Check if there's a mismatch between event project ID and current project ID
        if (progressEvent.projectId && progressEvent.projectId !== project.id) {
          console.warn(`Project ID mismatch! Event: ${progressEvent.projectId}, Current: ${project.id}`);
        }
      });

      project.on('completed', () => {
        console.log('Project completed');
        
        // Note: Event processing is now handled by the adapter for frontend clients
        // The adapter ensures all necessary events are emitted properly
        
        // Check if there are any outstanding jobs still generating (check both photos state and project jobs)
        const outstandingPhotoJobs = photos.filter(photo => 
          photo.generating && 
          photo.projectId === project.id
        );
        
        // Also check if there are any jobs in the project that haven't completed yet
        const outstandingProjectJobs = project.jobs ? project.jobs.filter(job => !job.resultUrl && !job.error) : [];
        
        const totalOutstanding = Math.max(outstandingPhotoJobs.length, outstandingProjectJobs.length);
        
        if (totalOutstanding > 0) {
          console.log(`Project completion received but ${totalOutstanding} jobs still outstanding (${outstandingPhotoJobs.length} in photos state, ${outstandingProjectJobs.length} in project state). Waiting 3 seconds for final job events...`);
          console.log('Outstanding photo jobs:', outstandingPhotoJobs.map(p => ({ id: p.id, progress: p.progress })));
          console.log('Outstanding project jobs:', outstandingProjectJobs.map(j => ({ id: j.id, realJobId: j.realJobId, hasResult: !!j.resultUrl, hasError: !!j.error })));
          
          // Debug: Log all project jobs to see their state
          console.log('ALL project jobs state:', project.jobs ? project.jobs.map(j => ({
            id: j.id,
            realJobId: j.realJobId,
            hasResultUrl: !!j.resultUrl,
            hasError: !!j.error,
            resultUrl: j.resultUrl ? `${j.resultUrl.substring(0, 50)}...` : 'none'
          })) : 'no jobs');
          
          // Wait a short time for any final job completion events to arrive
          setTimeout(() => {
            const stillOutstandingPhotos = photos.filter(photo => 
              photo.generating && 
              photo.projectId === project.id
            );
            
            const stillOutstandingProjects = project.jobs ? project.jobs.filter(job => !job.resultUrl && !job.error) : [];
            const stillTotalOutstanding = Math.max(stillOutstandingPhotos.length, stillOutstandingProjects.length);
            
            if (stillTotalOutstanding > 0) {
              console.log(`After 3 second delay, ${stillTotalOutstanding} jobs still outstanding (${stillOutstandingPhotos.length} photos, ${stillOutstandingProjects.length} project jobs). Trying longer delay...`);
              console.log('Still outstanding photo jobs:', stillOutstandingPhotos.map(p => ({ id: p.id, progress: p.progress })));
              console.log('Still outstanding project jobs:', stillOutstandingProjects.map(j => ({ id: j.id, realJobId: j.realJobId, hasResult: !!j.resultUrl, hasError: !!j.error })));
              
              // Debug: Log all project jobs after delay to see their state
              console.log('ALL project jobs state after delay:', project.jobs ? project.jobs.map(j => ({
                id: j.id,
                realJobId: j.realJobId,
                hasResultUrl: !!j.resultUrl,
                hasError: !!j.error,
                resultUrl: j.resultUrl ? `${j.resultUrl.substring(0, 50)}...` : 'none'
              })) : 'no jobs');
              
              // Try waiting longer for very delayed job completion events
              setTimeout(() => {
                const finalOutstandingProjects = project.jobs ? project.jobs.filter(job => !job.resultUrl && !job.error) : [];
                
                if (finalOutstandingProjects.length > 0) {
                  console.log(`After 10 second total delay, ${finalOutstandingProjects.length} jobs still outstanding. Proceeding with project completion anyway.`);
                  console.log('Final outstanding project jobs:', finalOutstandingProjects.map(j => ({ 
                    id: j.id, 
                    realJobId: j.realJobId, 
                    hasResult: !!j.resultUrl, 
                    hasError: !!j.error 
                  })));
                } else {
                  console.log('All jobs finally completed after extended delay.');
                }
                
                // Proceed with completion regardless
                clearAllTimeouts();
                activeProjectReference.current = null;
                
                // Safety net: Force-clear any photos still marked as generating despite having errors
                const clearGeneratingFlagsExtended = (prevPhotos) => {
                  const generatingWithErrors = prevPhotos.filter(photo => 
                    photo.generating && photo.error && 
                    (photo.projectId === project.id || photo.projectId === undefined));
                  
                  if (generatingWithErrors.length > 0) {
                    return prevPhotos.map(photo => {
                      if (photo.generating && photo.error && 
                          (photo.projectId === project.id || photo.projectId === undefined)) {
                        return { ...photo, generating: false, loading: false };
                      }
                      return photo;
                    });
                  }
                  return prevPhotos;
                };
                
                setRegularPhotos(clearGeneratingFlagsExtended);
                setPhotos(clearGeneratingFlagsExtended);
                
                // Track demo render completion for non-authenticated users
                trackDemoRenderCompletion();
                
                // Track generation with campaign attribution
                const campaignSource = getCampaignSource();
                trackEvent('Generation', 'complete', selectedStyle);
                if (campaignSource) {
                  trackEvent('Gimi Challenge', 'conversion_batch_complete', `Source: ${campaignSource}`);
                }
                
                triggerBatchCelebration();
              }, 7000); // Additional 7 second delay (10 total)
            } else {
              console.log('All jobs completed after delay, proceeding with project completion.');
              clearAllTimeouts();
              activeProjectReference.current = null;
              
              // Safety net: Force-clear any photos still marked as generating despite having errors
              const clearGeneratingFlagsDelayed = (prevPhotos) => {
                const generatingWithErrors = prevPhotos.filter(photo => 
                  photo.generating && photo.error && 
                  (photo.projectId === project.id || photo.projectId === undefined));
                
                if (generatingWithErrors.length > 0) {
                  return prevPhotos.map(photo => {
                    if (photo.generating && photo.error && 
                        (photo.projectId === project.id || photo.projectId === undefined)) {
                      return { ...photo, generating: false, loading: false };
                    }
                    return photo;
                  });
                }
                return prevPhotos;
              };
              
              setRegularPhotos(clearGeneratingFlagsDelayed);
              setPhotos(clearGeneratingFlagsDelayed);
              
              // Track demo render completion for non-authenticated users
              trackDemoRenderCompletion();
              
              // Track generation with campaign attribution
              const campaignSource = getCampaignSource();
              trackEvent('Generation', 'complete', selectedStyle);
              if (campaignSource) {
                trackEvent('Gimi Challenge', 'conversion_batch_complete', `Source: ${campaignSource}`);
              }
              
              triggerBatchCelebration();
            }
          }, 3000); // Initial 3 second delay
        } else {
          console.log('All jobs completed, proceeding immediately with project completion');
          
          // Clear all timeouts when project completes
          clearAllTimeouts();
          
          activeProjectReference.current = null; // Clear active project reference when complete
          
          // Safety net: Force-clear any photos still marked as generating despite having errors
          // This handles edge case race conditions in React state updates
          const clearGeneratingFlags = (prevPhotos) => {
            const generatingWithErrors = prevPhotos.filter(photo => 
              photo.generating && photo.error && 
              (photo.projectId === project.id || photo.projectId === undefined));
            
            if (generatingWithErrors.length > 0) {
              return prevPhotos.map(photo => {
                if (photo.generating && photo.error && 
                    (photo.projectId === project.id || photo.projectId === undefined)) {
                  return {
                    ...photo,
                    generating: false,
                    loading: false
                  };
                }
                return photo;
              });
            }
            return prevPhotos;
          };
          
          // Update both state arrays
          setRegularPhotos(clearGeneratingFlags);
          setPhotos(clearGeneratingFlags);
          
          // Track demo render completion for non-authenticated users
          trackDemoRenderCompletion();
          
          // Track successful generation completion with campaign attribution
          const campaignSource = getCampaignSource();
          trackEvent('Generation', 'complete', selectedStyle);
          if (campaignSource) {
            trackEvent('Gimi Challenge', 'conversion_batch_complete', `Source: ${campaignSource}`);
          }
          
          // Trigger celebration for successful batch completion
          triggerBatchCelebration();
        }
      });

      project.on('failed', (error) => {
        console.error('Project failed:', error);
        
        // Check for email verification error (code 4052)
        if (error && typeof error === 'object' && 
            (error.code === 4052 || (error.message && error.message.includes('verify your email')))) {
          console.error('❌ Email verification required');
          setBackendError({
            type: 'auth_error',
            title: '📧 Email Verification Required',
            message: 'Your Sogni account email needs to be verified to generate images.',
            details: 'Please check your email and click the verification link, then try again. You can also verify your email at app.sogni.ai.',
            canRetry: true,
            fallbackUrl: 'https://app.sogni.ai/profile',
            fallbackText: 'Verify Email',
            fallbackLabel: 'Go to Profile'
          });
          
          // Clear all timeouts when project fails
          clearAllTimeouts();
          activeProjectReference.current = null;
          
          // Mark all generating photos as failed
          setRegularPhotos(prevPhotos => {
            return prevPhotos.map(photo => {
              if (photo.generating) {
                return {
                  ...photo,
                  generating: false,
                  loading: false,
                  error: 'EMAIL VERIFICATION REQUIRED',
                  permanentError: true,
                  statusText: 'Verify Email'
                };
              }
              return photo;
            });
          });
          
          return;
        }

        // Check for insufficient funds error (code 4024)
        if (error && typeof error === 'object' &&
            (error.code === 4024 || (error.message && error.message.toLowerCase().includes('insufficient funds')))) {
          console.error('❌ Insufficient funds - user is out of credits');

          // Clear all timeouts when project fails
          clearAllTimeouts();
          activeProjectReference.current = null;

          // Mark all generating photos as cancelled
          setRegularPhotos(prevPhotos => {
            return prevPhotos.map(photo => {
              if (photo.generating) {
                return {
                  ...photo,
                  generating: false,
                  loading: false,
                  error: 'INSUFFICIENT CREDITS',
                  permanentError: true,
                  statusText: 'Out of Credits',
                  cancelled: true
                };
              }
              return photo;
            });
          });

          // Show the out of credits popup
          setShowOutOfCreditsPopup(true);

          return;
        }

        // Check if this is a batch-cancelling error (like code 4007)
        if (error && typeof error === 'object') {
          // Import the shouldCancelBatchForError function logic here
          const shouldCancel = (
            (error.code && [4007, 4008, 4009, 4010, 4011, 4012, 4013, 4014, 4016, 4017, 4018, 4019, 4020].includes(error.code)) ||
            (error.message && (
              error.message.toLowerCase().includes('internal error') ||
              error.message.toLowerCase().includes('service unavailable') ||
              error.message.toLowerCase().includes('processing failed') ||
              error.message.toLowerCase().includes('system error') ||
              error.message.toLowerCase().includes('server error') ||
              error.message.toLowerCase().includes('failed due to an internal error')
            ))
          );

          if (shouldCancel) {
            console.log('Project failed with batch-cancelling error, showing toast and cancelling batch');
            
            // Show appropriate toast notification
            const errorMessage = error.code === 4007 ? 
              'Image generation failed due to an internal error. Your batch has been cancelled.' :
              `Processing failed: ${error.message || 'Unknown error'}. Your batch has been cancelled.`;
            
            showToast({
              title: 'Processing Failed',
              message: errorMessage,
              type: 'error',
              timeout: 8000
            });
            
            // Cancel the batch using the same logic as cancelBatchOnError
            clearAllTimeouts();
            activeProjectReference.current = null;
            
            // Mark all generating photos as cancelled
            setRegularPhotos(prevPhotos => {
              return prevPhotos.map(photo => {
                if (photo.generating) {
                  return {
                    ...photo,
                    generating: false,
                    loading: false,
                    error: 'BATCH CANCELLED',
                    permanentError: true,
                    statusText: 'Cancelled',
                    cancelled: true
                  };
                }
                return photo;
              });
            });
            
            return; // Exit early for batch-cancelling errors
          }
        }
        
        // Clear all timeouts when project fails
        clearAllTimeouts();
        
        // Get the failed project's ID from the project or error object
        const failedProjectId = project.id;
        // Check if error has a projectId property that might override the project.id
        const errorProjectId = error && typeof error === 'object' && 'projectId' in error ? 
          error.projectId : null;
        
        // Use error's projectId if available, otherwise fallback to project.id
        const effectiveProjectId = errorProjectId || failedProjectId;
        
        // Only clear active project reference if it matches the failed project
        if (activeProjectReference.current && activeProjectReference.current.id === effectiveProjectId) {
          console.log(`Project failed with ID ${effectiveProjectId}`);
          console.log(`Clearing active project reference for failed project ${effectiveProjectId}`);
          activeProjectReference.current = null;
        } else {
          // This is an old project timing out, suppress the noisy error messages
          console.log(`Old project ${effectiveProjectId} cleanup (not active project)`);
          // Early return to avoid updating photos or showing error messages for old projects
          return;
        }
        
        // Update the state for photos that belong to this failed project only
        setRegularPhotos(prevPhotos => {
          return prevPhotos.map(photo => {
            // Only mark photos as failed if they belong to this specific project
            // and are still in generating state
            if (photo.generating && photo.projectId === effectiveProjectId) {
              console.log(`Marking photo ${photo.id} as failed due to project ${effectiveProjectId} failure`);
              // Extract specific error information for better user feedback
              let errorMessage = 'GENERATION FAILED: unknown error';
              
              if (error && typeof error === 'object') {
                if (error.isInsufficientFunds || error.errorCode === 'insufficient_funds') {
                  errorMessage = 'GENERATION FAILED: replenish tokens';
                } else if (error.isAuthError || error.errorCode === 'auth_error') {
                  errorMessage = 'GENERATION FAILED: authentication failed';
                } else if (error.isOffline || error.name === 'NetworkError' || 
                          (error.message && (error.message.includes('network') || 
                           error.message.includes('connection') || 
                           error.message.includes('internet') || 
                           error.message.includes('CORS') ||
                           error.message.includes('Failed to fetch')))) {
                  errorMessage = 'GENERATION FAILED: check internet connection';
                } else if (error.message) {
                  // Extract key info from error message
                  if (error.message.includes('Insufficient') || error.message.includes('credits')) {
                    errorMessage = 'GENERATION FAILED: replenish tokens';
                  } else if (error.message.includes('auth') || error.message.includes('token')) {
                    errorMessage = 'GENERATION FAILED: authentication failed';
                  } else {
                    errorMessage = 'GENERATION FAILED: request failed';
                  }
                }
              } else if (typeof error === 'string') {
                if (error.includes('Insufficient') || error.includes('credits')) {
                  errorMessage = 'GENERATION FAILED: replenish tokens';
                } else if (error.includes('auth') || error.includes('token')) {
                  errorMessage = 'GENERATION FAILED: authentication failed';
                } else if (error.includes('network') || error.includes('connection') || 
                          error.includes('internet') || error.includes('CORS') ||
                          error.includes('Failed to fetch')) {
                  errorMessage = 'GENERATION FAILED: check internet connection';
                } else {
                  errorMessage = 'GENERATION FAILED: request failed';
                }
              }
              
              return {
                ...photo,
                generating: false,
                loading: false,
                error: errorMessage,
                permanentError: true, // Mark as permanent error
                statusText: 'Failed' // Update status text
              };
            }
            return photo;
          });
        });
      });

      // Listen to project updates to get job progress and preview images
      


      // Handle job completion for cleanup and final processing
      project.on('jobCompleted', (job) => {
        const isPreview = job.isPreview === true;
        
        // Clear job timeout when it completes (only for final, not previews)
        if (!isPreview) {
          clearJobTimeout(job.id);
        }
        
        // FAILSAFE ERROR HANDLING: Check for missing resultUrl
        // Note: The frontend adapter should now emit jobFailed for these cases,
        // but we keep this as a defensive failsafe for edge cases
        if (!job.resultUrl) {
          console.error('Missing resultUrl for job (failsafe handler):', job.id);
          
          // Get job index for error handling
          const jobIndex = projectStateReference.current.jobMap.get(job.id);
          if (jobIndex === undefined) {
            console.error('Unknown job completed with missing resultUrl:', job.id);
            console.error('jobMap contents:', Array.from(projectStateReference.current.jobMap.entries()));
            console.error('Job details:', job);
            return;
          }
          
          const offset = keepOriginalPhoto ? 1 : 0;
          const photoIndex = jobIndex + offset;
          
          // Determine error type
          let errorMessage = 'GENERATION FAILED: result missing';
          let errorType = 'missing_result';
          
          // Check for NSFW filtering (should be handled by jobFailed now, but keep as failsafe)
          if (job.isNSFW === true) {
            console.warn(`Job ${job.id} was flagged as NSFW (failsafe handler)`);
            errorMessage = 'CONTENT FILTERED: NSFW detected';
            errorType = 'nsfw_filtered';
          }
          
          // Update photo state with error (update BOTH state arrays)
          const markJobMissingResult = (previous) => {
            const updated = [...previous];
            if (!updated[photoIndex]) {
              console.error(`No photo box found at index ${photoIndex}`);
              return previous;
            }
            
            updated[photoIndex] = {
              ...updated[photoIndex],
              generating: false,
              loading: false,
              error: errorMessage,
              permanentError: true,
              statusText: 'Failed',
              errorType: errorType
            };
            
            // Check if all photos are done generating
            const stillGenerating = updated.some(photo => photo.generating);
            const successfulPhotos = updated.filter(p => !p.error && p.images && p.images.length > 0).length;
            const allDone = updated.every(p => !p.loading && !p.generating);
            
            console.log(`Failsafe: Updated photo ${photoIndex} with error. AllDone: ${allDone}, Successful: ${successfulPhotos}/${updated.length}`);
            
            if (!stillGenerating && activeProjectReference.current) {
              clearAllTimeouts();
              activeProjectReference.current = null;
              trackDemoRenderCompletion();
              triggerPromoPopupIfNeeded();
            }
            
            return updated;
          };
          
          setRegularPhotos(markJobMissingResult);
          setPhotos(markJobMissingResult);
          
          return; // Don't process further
        }
        
        const jobIndex = projectStateReference.current.jobMap.get(job.id);
        const offset = keepOriginalPhoto ? 1 : 0;
        const photoIndex = jobIndex + offset;
        const positivePrompt = job.positivePrompt;
        
        // Handle preview vs final image loading
        if (isPreview) {
          
          // PREVIEW IMAGE - load immediately without affecting status text
          fetch(job.resultUrl)
            .then(response => {
              
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }
              
              return response.blob();
            })
            .then(blob => {
              const objectUrl = URL.createObjectURL(blob);
              
              setRegularPhotos(previous => {
                const updated = [...previous];
                if (updated[photoIndex] && !updated[photoIndex].permanentError) {
                  // Clean up previous preview image URL to prevent memory leaks with frequent previews
                  const currentImages = updated[photoIndex].images;
                  if (currentImages && currentImages.length > 0 && updated[photoIndex].isPreview) {
                    currentImages.forEach(imageUrl => {
                      if (imageUrl && imageUrl.startsWith('blob:')) {
                        URL.revokeObjectURL(imageUrl);
                      }
                    });
                  }
                  
                  const newPreviewCount = (updated[photoIndex].previewUpdateCount || 0) + 1;
                  
                  updated[photoIndex] = {
                    ...updated[photoIndex],
                    images: [objectUrl], // Show preview
                    newlyArrived: true,
                    isPreview: true, // Mark as preview for styling
                    previewUpdateCount: newPreviewCount // Track preview updates
                    // Keep existing generating: true and progress from generation events
                    // Don't override loading or statusText
                  };
                  

                }
                return updated;
              });
            })
            .catch(() => {
              // Don't update the photo state on preview load failure
            });
          
          return; // Don't process hashtags for previews
        }
        
        // FINAL IMAGE - handle hashtags and completion
        // Handle hashtag generation for final jobs
        let hashtag = '';
        
        
        // Strategy 1: Try to match positivePrompt from job
        if (positivePrompt && !hashtag) {
          // First check current stylePrompts (which includes Flux prompts when appropriate)
          const foundKey = Object.entries(stylePrompts).find(([, value]) => value === positivePrompt)?.[0];
          if (foundKey && foundKey !== 'custom' && foundKey !== 'random' && foundKey !== 'randomMix') {
            hashtag = `#${foundKey}`;
            console.log('📸 Found hashtag for completed job via positivePrompt:', { positivePrompt, hashtag, foundKey });
          }
          
          // Fallback to promptsData for backward compatibility
          if (!hashtag) {
            const fallbackKey = Object.entries(promptsData).find(([, value]) => value === positivePrompt)?.[0];
            if (fallbackKey && fallbackKey !== 'custom' && fallbackKey !== 'random' && fallbackKey !== 'randomMix') {
              hashtag = `#${fallbackKey}`;
              console.log('📸 Found hashtag from promptsData fallback via positivePrompt:', { positivePrompt, hashtag, fallbackKey });
            }
          }
        }
        
        // Strategy 2: If we have a valid stylePrompt, use that to help with hashtag lookup
        if (!hashtag && stylePrompt && stylePrompt.trim()) {
          const trimmedStylePrompt = stylePrompt.trim();
          // First check current stylePrompts
          const styleKey = Object.entries(stylePrompts).find(([, value]) => value === trimmedStylePrompt)?.[0];
          if (styleKey && styleKey !== 'custom' && styleKey !== 'random' && styleKey !== 'randomMix') {
            console.log('📸 Found hashtag from stylePrompt:', styleKey);
            hashtag = `#${styleKey}`;
          }
          
          // Fallback to promptsData
          if (!hashtag) {
            const fallbackStyleKey = Object.entries(promptsData).find(([, value]) => value === trimmedStylePrompt)?.[0];
            if (fallbackStyleKey && fallbackStyleKey !== 'custom' && fallbackStyleKey !== 'random' && fallbackStyleKey !== 'randomMix') {
              console.log('📸 Found hashtag from stylePrompt fallback:', fallbackStyleKey);
              hashtag = `#${fallbackStyleKey}`;
            }
          }
        }
        
        // Strategy 3: Fall back to selectedStyle if it's a valid style
        if (!hashtag && selectedStyle && selectedStyle !== 'custom' && selectedStyle !== 'random' && selectedStyle !== 'randomMix' && selectedStyle !== 'oneOfEach') {
          console.log('📸 Using selectedStyle for hashtag:', selectedStyle);
          hashtag = `#${selectedStyle}`;
        }
        
        // Strategy 3.5: For custom prompts, use custom scene name if available, otherwise #SogniPhotobooth
        if (!hashtag && selectedStyle === 'custom') {
          if (customSceneName && customSceneName.trim()) {
            console.log('📸 Using custom scene name for hashtag:', customSceneName);
            hashtag = customSceneName; // Use scene name directly without # for custom prompts
          } else {
            console.log('📸 Using #SogniPhotobooth for custom prompt');
            hashtag = '#SogniPhotobooth';
          }
        }
        
        // Strategy 4: Final fallback - try to find ANY matching prompt in our style library
        if (!hashtag && positivePrompt) {
          // Check if the positive prompt contains any known style keywords
          const allStyleKeys = [...Object.keys(stylePrompts), ...Object.keys(promptsData)];
          const matchingKey = allStyleKeys.find(key => {
            const promptValue = stylePrompts[key] || promptsData[key];
            return promptValue && (
              promptValue === positivePrompt ||
              positivePrompt.includes(promptValue) ||
              promptValue.includes(positivePrompt)
            );
          });
          
          if (matchingKey && matchingKey !== 'custom' && matchingKey !== 'random' && matchingKey !== 'randomMix') {
            hashtag = `#${matchingKey}`;
            console.log('📸 Found hashtag via fuzzy matching:', { matchingKey, hashtag });
          }
        }
        
        // Load final image and update with completion status
        loadImageWithProgress(job.resultUrl, photoIndex, (loadedImageUrl) => {
          setRegularPhotos(previous => {
            const updated = [...previous];
            if (updated[photoIndex] && !updated[photoIndex].permanentError) {
              const photoId = updated[photoIndex].id;
              
              // Play camera wind sound for this final image if we haven't already
              if (soundEnabled && !soundPlayedForPhotos.current.has(photoId) && cameraWindSoundReference.current) {
                soundPlayedForPhotos.current.add(photoId);
                
                // Reset to beginning to ensure sound plays every time
                cameraWindSoundReference.current.currentTime = 0;
                
                try {
                  cameraWindSoundReference.current.play();
                } catch (error) {
                  console.warn("Initial camera wind play attempt failed, trying promise-based approach:", error);
                  cameraWindSoundReference.current.play().catch(error => {
                    console.warn("Error playing camera wind sound:", error);
                  });
                }
              }
              
              // Extract promptKey from hashtag or selectedStyle
              const extractedPromptKey = hashtag ? hashtag.replace('#', '') : 
                (selectedStyle && selectedStyle !== 'custom' && selectedStyle !== 'random' && selectedStyle !== 'randomMix' && selectedStyle !== 'oneOfEach') ? selectedStyle : undefined;
              
              // Determine statusText - preserve #SogniPhotobooth for custom prompts
              let statusText;
              if (hashtag === '#SogniPhotobooth') {
                statusText = '#SogniPhotobooth';
              } else if (hashtag) {
                statusText = styleIdToDisplay(hashtag.replace('#', ''));
              } else if (selectedStyle && selectedStyle !== 'custom' && selectedStyle !== 'random' && selectedStyle !== 'randomMix') {
                statusText = styleIdToDisplay(selectedStyle);
              } else {
                statusText = '#SogniPhotobooth';
              }
              
              // Save first custom prompt image to localStorage for display in UI
              if (selectedStyle === 'custom' && positivePrompt) {
                try {
                  const existingImage = localStorage.getItem(CUSTOM_PROMPT_IMAGE_KEY);
                  if (!existingImage) {
                    // Only save the first image for this custom prompt
                    const imageData = {
                      url: loadedImageUrl,
                      prompt: positivePrompt,
                      timestamp: Date.now()
                    };
                    safeLocalStorageSetItem(CUSTOM_PROMPT_IMAGE_KEY, JSON.stringify(imageData));
                    console.log('Saved custom prompt image:', imageData);
                  }
                } catch (e) {
                  console.warn('Failed to save custom prompt image:', e);
                }
              }
              
              updated[photoIndex] = {
                ...updated[photoIndex],
                images: [loadedImageUrl], // Replace preview with final image
                loading: false,
                generating: false, // Mark as complete
                progress: 100,
                newlyArrived: true,
                isPreview: false, // Clear preview flag so final image shows at full opacity
                positivePrompt,
                // customSceneName is already set when photo is created, preserve it
                customSceneName: updated[photoIndex].customSceneName,
                stylePrompt: positivePrompt, // Use the actual prompt that was used for generation
                promptKey: extractedPromptKey, // Track which style was used for favoriting
                statusText,
                seed: job.seed, // Capture the actual seed used for generation
                model: job.model || selectedModel, // Capture model used
                steps: job.steps || inferenceSteps // Capture steps used
              };
            }
            return updated;
          });
        });
        
        // Check if all photos are done generating  
        setTimeout(() => {
          setRegularPhotos(current => {
            const stillGenerating = current.some(photo => photo.generating);
            if (!stillGenerating && activeProjectReference.current) {
              // All jobs are done, clear the active project and timeouts
              console.log('All jobs completed, clearing active project');
              clearAllTimeouts();
              activeProjectReference.current = null;
              
              // Track demo render completion for non-authenticated users
              trackDemoRenderCompletion();
              
              // Trigger promotional popup after batch completion
              triggerPromoPopupIfNeeded();
            }
            return current;
          });
        }, 100);
      });

      project.on('jobFailed', (job) => {
        // CRITICAL: Clear ALL pending throttled progress updates for this job
        // Otherwise they'll re-set generating: true after we clear it
        if (progressUpdateTimeout) {
          clearTimeout(progressUpdateTimeout);
          progressUpdateTimeout = null;
        }
        if (nonProgressUpdateTimeout) {
          clearTimeout(nonProgressUpdateTimeout);
          nonProgressUpdateTimeout = null;
        }
        
        // Clear job timeout when it fails
        clearJobTimeout(job.id);
        
        console.error('Job failed:', job.id, job.error);
        
        const jobIndex = projectStateReference.current.jobMap.get(job.id);
        if (jobIndex === undefined) {
          console.error('Unknown job failed:', job.id);
          return;
        }
        
        const offset = keepOriginalPhoto ? 1 : 0;
        const photoIndex = jobIndex + offset;
        
        // Update function that we'll use for both regularPhotos and photos
        const updatePhotoWithError = (previous) => {
          const updated = [...previous];
          if (!updated[photoIndex]) {
            console.error(`No photo box found at index ${photoIndex}`);
            return previous;
          }
          
          // Extract specific error information for individual job failures
          let errorMessage = 'GENERATION FAILED: unknown error';
          
          if (job.error) {
            if (typeof job.error === 'object') {
              // Handle error object case
              // Check for NSFW filtering first (new error scenario)
              if (job.error.isNSFW || job.error.nsfwFiltered) {
                errorMessage = 'CONTENT FILTERED: NSFW detected';
              } else if (job.error.missingResult) {
                errorMessage = 'GENERATION FAILED: result missing';
              } else if (job.error.isInsufficientFunds || job.error.errorCode === 'insufficient_funds') {
                errorMessage = 'INSUFFICIENT FUNDS: replenish tokens';
              } else if (job.error.isAuthError || job.error.errorCode === 'auth_error') {
                errorMessage = 'AUTH FAILED: login required';
              } else if (job.error.message) {
                // Extract key info from error message
                if (job.error.message.includes('Insufficient') || job.error.message.includes('credits') || job.error.message.includes('funds')) {
                  errorMessage = 'INSUFFICIENT FUNDS: replenish tokens';
                } else if (job.error.message.includes('NSFW') || job.error.message.includes('filtered') || job.error.message.includes('CONTENT FILTERED')) {
                  errorMessage = 'CONTENT FILTERED: NSFW detected';
                } else if (job.error.message.includes('missing') || job.error.message.includes('result')) {
                  errorMessage = 'GENERATION FAILED: result missing';
                } else if (job.error.message.includes('timeout') || job.error.message.includes('worker')) {
                  errorMessage = 'GENERATION FAILED: timeout';
                } else if (job.error.message.includes('network') || job.error.message.includes('connection')) {
                  errorMessage = 'NETWORK ERROR: check connection';
                } else {
                  errorMessage = 'GENERATION FAILED: unknown error';
                }
              } else {
                errorMessage = 'GENERATION FAILED: unknown error';
              }
            } else if (typeof job.error === 'string') {
              // Handle string error case
              if (job.error.includes('Insufficient') || job.error.includes('credits') || job.error.includes('funds')) {
                errorMessage = 'INSUFFICIENT FUNDS: replenish tokens';
              } else if (job.error.includes('NSFW') || job.error.includes('filtered') || job.error.includes('CONTENT FILTERED')) {
                errorMessage = 'CONTENT FILTERED: NSFW detected';
              } else if (job.error.includes('missing') || job.error.includes('result')) {
                errorMessage = 'GENERATION FAILED: result missing';
              } else if (job.error.includes('timeout') || job.error.includes('worker')) {
                errorMessage = 'GENERATION FAILED: timeout';
              } else if (job.error.includes('network') || job.error.includes('connection')) {
                errorMessage = 'NETWORK ERROR: check connection';
              } else {
                errorMessage = 'GENERATION FAILED: processing error';
              }
            }
          }
          
          updated[photoIndex] = {
            ...updated[photoIndex],
            generating: false,
            loading: false,
            error: errorMessage,
            permanentError: true, // Mark as permanent so it won't be overwritten
            statusText: 'Failed'
          };
          
          // Check if all photos are done generating
          const stillGenerating = updated.some(photo => photo.generating);
          if (!stillGenerating && activeProjectReference.current) {
            // All photos are done, clear the active project and timeouts
            console.log('All jobs failed or completed, clearing active project');
            clearAllTimeouts();
            activeProjectReference.current = null;
            
            // Track demo render completion for non-authenticated users
            trackDemoRenderCompletion();
            
          // Trigger promotional popup after batch completion
          triggerPromoPopupIfNeeded();
          }
          
          return updated;
        };
        
        // Update BOTH regularPhotos and photos so isGenerating recalculates correctly
        setRegularPhotos(updatePhotoWithError);
        setPhotos(updatePhotoWithError);
      });

    } catch (error) {
      console.error('Generation failed:', error);
      
      // Hide upload progress on error
      setShowUploadProgress(false);
      setUploadProgress(0);
      
      // Handle WebSocket connection errors for frontend clients
      if (error && error.message && error.message.includes('WebSocket not connected') && authState.authMode === 'frontend') {
        console.error('Frontend client WebSocket disconnected - likely email verification required');
        
        // Show toast notification for WebSocket disconnection
        handleSpecificErrors.emailVerification(showToast);
        
        setBackendError({
          type: 'auth_error',
          title: '📧 Email Verification Required',
          message: 'Your Sogni account email needs to be verified to generate images.',
          details: 'Please check your email and click the verification link, then try again. You can also verify your email at app.sogni.ai.',
          canRetry: true,
          fallbackUrl: 'https://app.sogni.ai/profile',
          fallbackText: 'Verify Email',
          fallbackLabel: 'Go to Profile'
        });
      }
      
      if (error && error.code === 4015) {
        console.warn("Socket error (4015). Re-initializing Sogni.");
        
        // Show toast notification for connection switch
        handleSpecificErrors.connectionSwitched(showToast);
        
        setIsSogniReady(false);
        initializeSogni();
      }

      setRegularPhotos(previous => {
        const updated = [];
        if (keepOriginalPhoto) { // Use context state
          const originalPhoto = previous.find(p => p.isOriginal);
          if (originalPhoto) {
            updated.push(originalPhoto);
          }
        }
        
        // Use numImages from context state
        for (let index = 0; index < numImages; index++) { 
          // Extract specific error information for generation startup failures
          let errorMessage = 'GENERATION FAILED: startup error';
          let retryable = false;
          
          if (isNetworkError(error)) {
            // Handle NetworkError instances with better user messaging
            if (error.isOffline) {
              errorMessage = 'NETWORK OFFLINE: Check connection';
              retryable = true;
            } else if (error.isTimeout) {
              errorMessage = 'CONNECTION TIMEOUT: Try again';
              retryable = true;
            } else if (error.retryable) {
              errorMessage = 'NETWORK ERROR: Retry available';
              retryable = true;
            } else {
              errorMessage = 'NETWORK ERROR: Connection failed';
              retryable = false;
            }
          } else if (error) {
            const errorText = error.message || error.toString();
            if (errorText.includes('Insufficient') || errorText.includes('credits') || errorText.includes('funds')) {
              errorMessage = 'GENERATION FAILED: replenish tokens';
            } else if (errorText.includes('auth') || errorText.includes('token') || errorText.includes('401')) {
              errorMessage = 'GENERATION FAILED: authentication failed';
            } else if (errorText.includes('network') || errorText.includes('connection') || errorText.includes('fetch')) {
              errorMessage = 'GENERATION FAILED: connection error';
              retryable = true;
            } else if (errorText.includes('timeout')) {
              errorMessage = 'GENERATION FAILED: timeout error';
              retryable = true;
            } else {
              errorMessage = 'GENERATION FAILED: startup error';
            }
          }
          
          updated.push({
            id: Date.now() + index,
            generating: false,
            loading: false,
            images: [],
            error: errorMessage,
            originalDataUrl: dataUrl, // Use reference photo as placeholder
            permanentError: !retryable, // Allow retry for network errors
            retryable: retryable, // Add retryable flag
            sourceType // Include sourceType for retry context
          });
        }
        return updated;
      });
      
      // Stop camera when showing photo grid
      stopCamera();
      setShowPhotoGrid(true);
      setShowStartMenu(false);
    }
  };

  // -------------------------
  //   Drag and Drop handling
  // -------------------------
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);

    // Don't accept files if we're already processing another one
    if (activeProjectReference.current || isPhotoButtonCooldown) {
      alert('Please wait for the current image to finish processing.');
      return;
    }

    if (!isSogniReady) {
      alert('Sogni is not ready yet.');
      return;
    }

    // If user dropped multiple files, just take the first
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;

    // Hide the start menu if it's visible
    setShowStartMenu(false);

    // Create a temporary URL for the file
    const tempUrl = URL.createObjectURL(file);
    setCurrentUploadedImageUrl(tempUrl);
    setCurrentUploadedSource('upload');
    
    // Store photo data immediately with tempUrl
    const initialPhotoData = {
      imageUrl: tempUrl,
      source: 'upload',
      blob: file
    };
    
    setLastAdjustedPhoto(initialPhotoData);
    setLastUploadedPhoto(initialPhotoData); // Set immediately so preview works
    
    // Convert blob to data URL for persistent storage (asynchronously)
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      
      // Update with data URL when ready
      const updatedPhotoData = {
        ...initialPhotoData,
        dataUrl: dataUrl // Add persistent data URL
      };

      setLastAdjustedPhoto(updatedPhotoData);
      setLastUploadedPhoto(updatedPhotoData);
    };
    reader.readAsDataURL(file);
    
    // Show the image adjuster
    setShowImageAdjuster(true);
  };

  // -------------------------
  //   Capture (webcam)
  // -------------------------
  const handleTakePhoto = async (e) => {
    if (!isSogniReady || isPhotoButtonCooldown) {
      return;
    }

    // Cancel any existing project
    if (activeProjectReference.current) {
      console.log('Cancelling existing project:', activeProjectReference.current);
      if (sogniClient) {
        try {
          await sogniClient.cancelProject(activeProjectReference.current);
        } catch (error) {
          console.warn('Error cancelling previous project:', error);
        }
      }
      activeProjectReference.current = null;
    }

    // Start cooldown
    setIsPhotoButtonCooldown(true);
    setTimeout(() => {
      setIsPhotoButtonCooldown(false);
    }, 5000);

    console.log('handleTakePhoto called - device type:', /iphone|ipad|ipod|android/i.test(navigator.userAgent) ? 'mobile' : 'desktop');
    
    // Check if we should skip countdown (back camera on mobile)
    const isMobileDevice = /iphone|ipad|ipod|android/i.test(navigator.userAgent);
    const shouldSkipCountdown = isMobileDevice && !isFrontCamera;
    
    if (shouldSkipCountdown) {
      console.log('Skipping countdown for back camera on mobile device');
    } else {
      // Start countdown without slothicorn initially
      for (let index = 3; index > 0; index--) {
        setCountdown(index);
        
        // Show slothicorn when countdown reaches 2, but only for front-facing camera
        if (index === 2 && slothicornReference.current && isFrontCamera) {
          // Force the slothicorn to be visible and animated
          slothicornReference.current.style.position = 'fixed'; // Ensure it's fixed positioning
          slothicornReference.current.style.zIndex = '5000'; // Above photo grid but below action buttons
          slothicornReference.current.style.setProperty('bottom', '-360px', 'important');
          slothicornReference.current.style.transition = 'none';
          slothicornReference.current.classList.add('animating');
          
          // Force reflow
          void slothicornReference.current.offsetHeight;
          
          // After a small delay, start the upward animation
          setTimeout(() => {
            if (slothicornReference.current) {
              slothicornReference.current.style.transition = 'bottom 0.8s cubic-bezier(0.34, 1.2, 0.64, 1)';
              slothicornReference.current.style.setProperty('bottom', '0px', 'important');
            }
          }, 50);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    setCountdown(0);
    triggerFlashAndCapture(e);
    
    // Make slothicorn return more gradually, but only if front camera is active
    if (isFrontCamera) {
      setTimeout(() => {
        if (slothicornReference.current) {
          slothicornReference.current.style.transition = 'bottom 1.5s cubic-bezier(0.25, 0.1, 0.25, 1)';
          slothicornReference.current.style.setProperty('bottom', '-340px', 'important');
          
          // Wait for animation to complete, then clean up
          setTimeout(() => {
            // Re-check ref since this is a delayed callback
            if (slothicornReference.current) {
              slothicornReference.current.style.transition = 'none';
              slothicornReference.current.classList.remove('animating');
              // Reset z-index after animation completes
              slothicornReference.current.style.zIndex = '5000';
            }
          }, 1500);
        }
      }, 1200);
    }

    // Custom canvas size and aspect ratio to match the model's expectations
    const { width: canvasWidth, height: canvasHeight } = getCustomDimensions(aspectRatio);
    console.log(`Capturing at ${canvasWidth}x${canvasHeight}`);
    
    // Create a canvas for the capture
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext('2d');
    
    // Enable high-quality image resampling for best results when resizing
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    
    // Get the video dimensions
    const video = videoReference.current;
    const videoAspect = video.videoWidth / video.videoHeight;
    const canvasAspect = canvasWidth / canvasHeight;
    
    // If front camera is active, apply mirroring
    if (isFrontCamera) {
      context.save();
      context.scale(-1, 1);
      context.translate(-canvas.width, 0);
    }
    
    // Calculate the maximum crop area that maintains the target aspect ratio
    let sourceWidth, sourceHeight, sourceX, sourceY;
    
    console.log(`📐 Crop calculation - Video: ${video.videoWidth}x${video.videoHeight} (${videoAspect.toFixed(3)}), Canvas: ${canvas.width}x${canvas.height} (${canvasAspect.toFixed(3)})`);
    
    if (videoAspect > canvasAspect) {
      // Video is wider than target - use full height, crop width to maximize resolution
      sourceHeight = video.videoHeight;
      sourceWidth = sourceHeight * canvasAspect;
      sourceX = (video.videoWidth - sourceWidth) / 2;
      sourceY = 0;
      console.log(`📐 Video wider than target: Using full height ${sourceHeight}px, cropping width to ${sourceWidth.toFixed(1)}px, offset X: ${sourceX.toFixed(1)}px`);
    } else {
      // Video is taller than target - use full width, crop height to maximize resolution
      sourceWidth = video.videoWidth;
      sourceHeight = sourceWidth / canvasAspect;
      sourceX = 0;
      sourceY = (video.videoHeight - sourceHeight) / 2;
      console.log(`📐 Video taller than target: Using full width ${sourceWidth}px, cropping height to ${sourceHeight.toFixed(1)}px, offset Y: ${sourceY.toFixed(1)}px`);
    }
    
    // Draw the optimally cropped video frame
    context.drawImage(video, 
      sourceX, sourceY, sourceWidth, sourceHeight,
      0, 0, canvas.width, canvas.height
    );
    
    // Restore canvas state if we applied mirroring
    if (isFrontCamera) {
      context.restore();
    }

    // For iOS, ensure we capture a good frame by drawing again after a small delay
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS) {
      // Small delay to ensure the frame is fully captured before processing
      await new Promise(resolve => setTimeout(resolve, 100));
      // Redraw the frame with mirroring if needed
      if (isFrontCamera) {
        context.save();
        context.scale(-1, 1);
        context.translate(-canvas.width, 0);
      }
      
      // Redraw the frame using the same optimized crop calculation
      if (videoAspect > canvasAspect) {
        sourceHeight = video.videoHeight;
        sourceWidth = sourceHeight * canvasAspect;
        sourceX = (video.videoWidth - sourceWidth) / 2;
        sourceY = 0;
      } else {
        sourceWidth = video.videoWidth;
        sourceHeight = sourceWidth / canvasAspect;
        sourceX = 0;
        sourceY = (video.videoHeight - sourceHeight) / 2;
      }
      
      context.drawImage(video, 
        sourceX, sourceY, sourceWidth, sourceHeight,
        0, 0, canvas.width, canvas.height
      );
      
      if (isFrontCamera) {
        context.restore();
      }
    }

    // Generate initial data URL and blob
    // const dataUrl = canvas.toDataURL('image/png', 1.0);
    
    // Create initial PNG blob with maximum quality
    const pngBlob = await new Promise(resolve => {
      canvas.toBlob(resolve, 'image/png', 1.0);
    });
    
    if (!pngBlob) {
      console.error('Failed to create blob from canvas');
      return;
    }

    // Convert PNG to high-quality JPEG for efficient upload
    let finalBlob;
    try {
      const { convertPngToHighQualityJpeg } = await import('./utils/imageProcessing.js');
      // Don't add watermarks to camera captures - they'll be processed further
      // Watermarks should only be applied to final outputs (downloads, shares)
      finalBlob = await convertPngToHighQualityJpeg(pngBlob, 0.92, null);
      console.log(`📊 Upload format: JPEG (converted from PNG, no watermark - will be processed further)`);
    } catch (conversionError) {
      console.warn('JPEG conversion failed, using original PNG:', conversionError);
      finalBlob = pngBlob;
      console.log(`📊 Upload format: PNG (fallback)`);
    }

    // Log final file size being transmitted
    const finalSizeMB = (finalBlob.size / 1024 / 1024).toFixed(2);
    console.log(`📤 Final transmission size: ${finalSizeMB}MB`);

    // Create a temporary URL for the blob and show the image adjuster
    const tempUrl = URL.createObjectURL(finalBlob);
    setCurrentUploadedImageUrl(tempUrl);
    setCurrentUploadedSource('camera');
    
    // Store this photo data for potential re-editing
    const photoData = {
      imageUrl: tempUrl,
      source: 'camera',
      blob: finalBlob
    };

    setLastAdjustedPhoto(photoData);
    
    // Show the image adjuster
    setShowImageAdjuster(true);
  };

  const triggerFlashAndCapture = (e) => {
    // Check if we're in countdown mode, and if so, abort
    if (countdown > 0) return;
    
    // Play camera shutter sound if enabled - immediate playback for iOS
    if (soundEnabled && shutterSoundReference.current && e) {
      // Reset to beginning to ensure sound plays every time
      shutterSoundReference.current.currentTime = 0;
      
      // Use the same pattern for both browsers
      try {
        // Use a synchronous play attempt first for Safari
        shutterSoundReference.current.play();
      } catch (error) {
        console.warn("Initial play attempt failed, trying promise-based approach:", error);
        // Fallback to promise for Chrome
        shutterSoundReference.current.play().catch(error => {
          console.warn("Error playing shutter sound:", error);
        });
      }
    }
    
    // Rest of the function remains the same
    if (flashEnabled) {
      setShowFlash(true);
      setTimeout(() => {
        setShowFlash(false);
      }, 700); 
    }
    // Process the capture
    captureAndSend();
    
    // Track photo capture event
    trackEvent('Photo', 'capture', selectedStyle, 1);
  };

  const captureAndSend = async () => {
    const canvas = canvasReference.current;
    const video = videoReference.current;
    
    // Get the dimensions based on the selected aspect ratio
    const { width, height } = getCustomDimensions(aspectRatio);
    
    // Set canvas dimensions to match the selected aspect ratio
    canvas.width = width;
    canvas.height = height;
    
    const context = canvas.getContext('2d');
    
    // Enable high-quality image resampling for best results when resizing
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    
    // Fill with black to prevent transparency
    context.fillStyle = 'black';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Calculate dimensions to maximize use of available video resolution
    const videoAspect = video.videoWidth / video.videoHeight;
    const canvasAspect = canvas.width / canvas.height;
    
    // Calculate the maximum crop area that maintains the target aspect ratio
    let sourceWidth, sourceHeight, sourceX, sourceY;
    
    if (videoAspect > canvasAspect) {
      // Video is wider than target - use full height, crop width to maximize resolution
      sourceHeight = video.videoHeight;
      sourceWidth = sourceHeight * canvasAspect;
      sourceX = (video.videoWidth - sourceWidth) / 2;
      sourceY = 0;
    } else {
      // Video is taller than target - use full width, crop height to maximize resolution
      sourceWidth = video.videoWidth;
      sourceHeight = sourceWidth / canvasAspect;
      sourceX = 0;
      sourceY = (video.videoHeight - sourceHeight) / 2;
    }
    
    // Apply the mirror effect for front camera
    if (isFrontCamera) {
      context.save();
      context.scale(-1, 1);
      context.translate(-canvas.width, 0);
    }
    
    // Draw the optimally cropped video frame
    context.drawImage(video, 
      sourceX, sourceY, sourceWidth, sourceHeight,
      0, 0, canvas.width, canvas.height
    );
    
    // Restore canvas state if we applied mirroring
    if (isFrontCamera) {
      context.restore();
    }

    // For iOS, ensure we capture a good frame by drawing again after a small delay
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS) {
      // Small delay to ensure the frame is fully captured before processing
      await new Promise(resolve => setTimeout(resolve, 100));
      // Redraw the frame with mirroring if needed
      if (isFrontCamera) {
        context.save();
        context.scale(-1, 1);
        context.translate(-canvas.width, 0);
      }
      
      // Redraw the frame using optimized crop calculation
      let sourceX, sourceY;
      if (videoAspect > canvasAspect) {
        sourceHeight = video.videoHeight;
        sourceWidth = sourceHeight * canvasAspect;
        sourceX = (video.videoWidth - sourceWidth) / 2;
        sourceY = 0;
      } else {
        sourceWidth = video.videoWidth;
        sourceHeight = sourceWidth / canvasAspect;
        sourceX = 0;
        sourceY = (video.videoHeight - sourceHeight) / 2;
      }
      
      context.drawImage(video, 
        sourceX, sourceY, sourceWidth, sourceHeight,
        0, 0, canvas.width, canvas.height
      );
      
      if (isFrontCamera) {
        context.restore();
      }
    }

    // Generate initial data URL and blob
    // const dataUrl = canvas.toDataURL('image/png', 1.0);
    
    // Create initial PNG blob with maximum quality
    const pngBlob = await new Promise(resolve => {
      canvas.toBlob(resolve, 'image/png', 1.0);
    });
    
    if (!pngBlob) {
      console.error('Failed to create blob from canvas');
      return;
    }

    // Convert PNG to high-quality JPEG for efficient upload
    let finalBlob;
    try {
      const { convertPngToHighQualityJpeg } = await import('./utils/imageProcessing.js');
      // Don't add watermarks to camera captures - they'll be processed further
      // Watermarks should only be applied to final outputs (downloads, shares)
      finalBlob = await convertPngToHighQualityJpeg(pngBlob, 0.92, null);
      console.log(`📊 Upload format: JPEG (converted from PNG, no watermark - will be processed further)`);
    } catch (conversionError) {
      console.warn('JPEG conversion failed, using original PNG:', conversionError);
      finalBlob = pngBlob;
      console.log(`📊 Upload format: PNG (fallback)`);
    }

    // Log final file size being transmitted
    const finalSizeMB = (finalBlob.size / 1024 / 1024).toFixed(2);
    console.log(`📤 Final transmission size: ${finalSizeMB}MB`);

    // Stop the camera stream after capturing the photo
    stopCamera();

    // Create a temporary URL for the blob and show the image adjuster
    const tempUrl = URL.createObjectURL(finalBlob);
    setCurrentUploadedImageUrl(tempUrl);
    setCurrentUploadedSource('camera');
    
    // Store photo data immediately with tempUrl
    const initialPhotoData = {
      imageUrl: tempUrl,
      source: 'camera',
      blob: finalBlob
    };
    
    setLastAdjustedPhoto(initialPhotoData);
    setLastCameraPhoto(initialPhotoData); // Set immediately so preview works
    
    // Convert blob to data URL for persistent storage (asynchronously)
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      
      // Update with data URL when ready
      const updatedPhotoData = {
        ...initialPhotoData,
        dataUrl: dataUrl // Add persistent data URL
      };

      setLastAdjustedPhoto(updatedPhotoData);
      setLastCameraPhoto(updatedPhotoData);
    };
    reader.readAsDataURL(finalBlob);
    
    // Show the image adjuster after a 1s delay to allow flash and sloth animations to finish
    setTimeout(() => {
      setShowImageAdjuster(true);
    }, 1000);
  };

  /**
   * Handle user selection of a different camera device.
   */
  const handleCameraSelection = async (e) => {
    const deviceId = typeof e === 'string' ? e : e.target.value;
    const normalizedDeviceId = deviceId === '' ? null : deviceId;
    console.log('📹 Camera selection changed to:', normalizedDeviceId || 'auto-select');
    
    // Update local state
    setSelectedCameraDeviceId(normalizedDeviceId);
    
    // Save preference to settings
    updateSetting('preferredCameraDeviceId', normalizedDeviceId || undefined);
    
    // Infer front/back from device label and id to ensure correct mirroring
    if (normalizedDeviceId) {
      try {
        // Try to find the selected device from current list first
        let selectedDevice = (cameraDevices || []).find(d => d.deviceId === normalizedDeviceId);
        
        // If not found or label is empty, re-enumerate devices to get labels
        if (!selectedDevice || !selectedDevice.label) {
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            selectedDevice = devices.find(d => d.kind === 'videoinput' && d.deviceId === normalizedDeviceId) || selectedDevice;
          } catch (enumErr) {
            console.warn('Could not re-enumerate devices for label inference:', enumErr);
          }
        }
        
        const label = (selectedDevice?.label || '').toLowerCase();
        const idFragment = (selectedDevice?.deviceId || normalizedDeviceId || '').toLowerCase();
        const hint = `${label} ${idFragment}`;
        
        const indicatesBack = /(\bback\b|\brear\b|environment|telephoto)/i.test(hint);
        const indicatesFront = /(\bfront\b|\buser\b|face)/i.test(hint);
        
        // Natural panning: back cameras NOT mirrored, front cameras mirrored
        if (indicatesBack) {
          if (isFrontCamera) setIsFrontCamera(false);
        } else if (indicatesFront) {
          if (!isFrontCamera) setIsFrontCamera(true);
        }
      } catch (err) {
        console.warn('Unable to infer facing from selected camera:', err);
      }
    }
    
    // Switch to the new camera if one is active
    if (videoReference.current && videoReference.current.srcObject) {
      console.log('📹 Switching active camera to:', normalizedDeviceId || 'auto-select');
      await startCamera(normalizedDeviceId);
    }
    
    setCameraManuallyStarted(true); // User explicitly selected a camera
  };

  // Handle browser back/forward button navigation
  useEffect(() => {
    const handlePopState = () => {
      const url = new URL(window.location.href);
      const pageParam = url.searchParams.get('page');

      console.log('🔙 Browser back/forward button pressed, page param:', pageParam, 'navigationSource:', navigationSourceRef.current);

      if (pageParam === 'prompts') {
        // Navigating forward to prompts page (or direct access)
        setCurrentPage('prompts');
        setShowPhotoGrid(true);
        setSelectedPhotoIndex(null);
        stopCamera();
      } else {
        // Navigating back from prompts to camera/start menu
        // Use the stored navigation source to determine where to go
        if (navigationSourceRef.current === 'photoGrid') {
          // User came from photo grid, so go back to photo grid
          handleBackToPhotosFromPromptSelector(true);
        } else {
          // User came from start menu, so go back to start menu
          handleBackToCameraFromPromptSelector(true);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [stopCamera, handleBackToPhotosFromPromptSelector, handleBackToCameraFromPromptSelector]);

  // -------------------------
  //   Main area (video)
  // -------------------------
  const renderMainArea = () => (
    <div className="main-content-area" style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      background: window.extensionMode ? 'transparent' : undefined, // Make transparent in extension mode
    }}>
      {/* Auth Status is now rendered globally below - removed duplicate */}

      {/* Upload Progress Modal */}
      <UploadProgress
        progress={uploadProgress}
        isVisible={showUploadProgress}
        statusText={uploadStatusText}
      />

      {/* Friendly Error Modal */}
      <FriendlyErrorModal 
        error={backendError}
        onClose={() => setBackendError(null)}
        onRetry={() => {
          // If there's a retry context, re-trigger the Twitter share
          if (twitterPhotoIndex !== null && lastTwitterMessage) {
            handleTwitterShare(lastTwitterMessage);
          }
        }}
      />

      {/* Session Transfer Modal - Non-dismissable full-screen overlay */}
      {authState.sessionTransferred && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999,
          padding: '20px',
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
            borderRadius: '16px',
            maxWidth: '90%',
            width: '500px',
            padding: '0',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.2)',
            overflow: 'hidden'
          }}>
            {/* Header with orange accent for session transfer */}
            <div style={{
              background: 'linear-gradient(135deg, #ff9800 0%, #ff9800dd 100%)',
              padding: '24px 32px 20px 32px',
              color: 'white',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '8px' }}>
                🔄
              </div>
              <h3 style={{ 
                margin: '0', 
                fontSize: '1.4rem',
                fontWeight: '600',
                textShadow: '0 1px 2px rgba(0,0,0,0.1)'
              }}>
                Session Transferred
              </h3>
            </div>

            {/* Content */}
            <div style={{ padding: '24px 32px' }}>
              <p style={{
                fontSize: '1rem',
                color: '#2c3e50',
                lineHeight: '1.6',
                margin: '0 0 24px 0'
              }}>
                {authState.error}
              </p>

              <div style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'center'
              }}>
                <button
                  onClick={() => window.location.reload()}
                  style={{
                    flex: 1,
                    background: 'linear-gradient(135deg, #2196f3 0%, #1976d2 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px 24px',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 12px rgba(33, 150, 243, 0.3)'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(33, 150, 243, 0.4)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.3)';
                  }}
                >
                  🔄 Refresh Browser
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast notifications are now handled by ToastProvider */}

      {currentPage === 'prompts' ? (
        <>
          {/* Conditionally render photo grid in prompt selector mode */}
          {isSogniReady && sogniClient && (
            <div className={`film-strip-container visible prompt-selector-mode ${window.extensionMode ? 'extension-mode' : ''}`} style={{
              background: window.extensionMode ? 'transparent' : undefined
            }}>
              <PhotoGallery
                photos={photos}
                selectedPhotoIndex={selectedPhotoIndex}
                setSelectedPhotoIndex={setSelectedPhotoIndex}
                showPhotoGrid={true}
          handleBackToCamera={handleBackToCameraFromPromptSelector}
          handlePhotoViewerClick={handlePhotoViewerClick}
                handleGenerateMorePhotos={handleGenerateMorePhotos}
                handleOpenImageAdjusterForNextBatch={handleOpenImageAdjusterForNextBatch}
                handleShowControlOverlay={() => setShowControlOverlay(!showControlOverlay)}
                numImages={numImages}
                isGenerating={photos.some(photo => photo.generating)}
                keepOriginalPhoto={keepOriginalPhoto}
                lastPhotoData={lastPhotoData}
                activeProjectReference={activeProjectReference}
                isSogniReady={isSogniReady}
                toggleNotesModal={toggleNotesModal}
                setPhotos={setPhotosProxy}
                selectedStyle={selectedStyle}
                stylePrompts={stylePrompts}
                enhancePhoto={enhancePhoto}
                undoEnhancement={undoEnhancement}
                redoEnhancement={redoEnhancement}
                sogniClient={sogniClient}
                desiredWidth={desiredWidth}
                desiredHeight={desiredHeight}
                selectedSubIndex={selectedSubIndex}
                outputFormat={outputFormat}
                sensitiveContentFilter={sensitiveContentFilter}
                handleShareToX={handleShareToX}
                handleShareViaWebShare={handleShareViaWebShare}
                handleShareQRCode={handleKioskModeShare}
                slothicornAnimationEnabled={slothicornAnimationEnabled}
                backgroundAnimationsEnabled={backgroundAnimationsEnabled}
                tezdevTheme={tezdevTheme}
                aspectRatio={aspectRatio}
                handleRetryPhoto={handleRetryPhoto}
                handleRefreshPhoto={handleRefreshPhoto}
                onUseGalleryPrompt={handleUseGalleryPrompt}
                onPreGenerateFrame={handlePreGenerateFrameCallback}
                onFramedImageCacheUpdate={handleFramedImageCacheUpdate}
                onClearQrCode={() => {
                  if (qrCodeData) {
                    console.log('Clearing QR code due to image enhancement');
                  }
                  setQrCodeData(null);
                }}
                onClearMobileShareCache={() => {
                  console.log('Clearing mobile share cache due to PhotoGallery request');
                  setMobileShareCache({});
                }}
                onRegisterFrameCacheClear={(clearFunction) => {
                  photoGalleryFrameClearRef.current = clearFunction;
                }}
                onCopyImageStyleSelect={handleStyleReferenceUpload}
                styleReferenceImage={styleReferenceImage}
                onRemoveStyleReference={handleRemoveStyleReference}
                onEditStyleReference={handleEditStyleReference}
                qrCodeData={qrCodeData}
                onCloseQR={() => setQrCodeData(null)}
                onOutOfCredits={() => {
                  console.log('[ENHANCE] Triggering out of credits popup from PhotoGallery (prompt selector)');
                  setShowOutOfCreditsPopup(true);
                }}
                // New props for prompt selector mode
                isPromptSelectorMode={true}
                selectedModel={selectedModel}
                onPromptSelect={handlePromptSelectFromPage}
                onRandomMixSelect={handleRandomMixFromPage}
                onRandomSingleSelect={handleRandomSingleFromPage}
                onOneOfEachSelect={handleOneOfEachFromPage}
                onCustomSelect={handleCustomFromSampleGallery}
                onThemeChange={handleThemeChange}
                initialThemeGroupState={currentThemeState}
                onSearchChange={handleSearchChange}
                initialSearchTerm={urlSearchTerm}
                portraitType={portraitType}
                onPortraitTypeChange={handlePortraitTypeChange}
                authState={authState}
              />
            </div>
          )}
        </>
      ) : showStartMenu ? (
        <>
          <CameraStartMenu
            onTakePhoto={handleShowExistingCameraPhoto}
            onBrowsePhoto={handleBrowsePhotoOption}
            onDragPhoto={handleDragPhotoOption}
            isProcessing={!!activeProjectReference.current || isPhotoButtonCooldown}
            onViewPhotos={null} // Remove the onViewPhotos prop as we're moving the button out
            // Style selector props
            selectedStyle={selectedStyle}
            onStyleSelect={handleUpdateStyle}
            stylePrompts={stylePrompts}
            selectedModel={selectedModel}
            onModelSelect={switchToModel}
            onNavigateToGallery={handleNavigateToPromptSelector}
            onShowControlOverlay={() => setShowControlOverlay(true)}
            onThemeChange={handleThemeChange}
            currentThemes={currentThemeState}
            onCustomPromptChange={(prompt, sceneName) => {
              updateSetting('positivePrompt', prompt);
              updateSetting('customSceneName', sceneName || '');
            }}
            currentCustomPrompt={positivePrompt}
            currentCustomSceneName={customSceneName}
            portraitType={portraitType}
            styleReferenceImage={styleReferenceImage}
            onEditStyleReference={handleEditStyleReference}
            // Photo tracking props
            originalPhotoUrl={
              // Show lastCameraPhoto for camera preview
              (lastCameraPhoto?.dataUrl || lastCameraPhoto?.imageUrl)
                ? (lastCameraPhoto.dataUrl || lastCameraPhoto.imageUrl)
                : photos.find(p => p.isOriginal)?.originalDataUrl || null
            }
            photoSourceType={
              // Show camera source type if we have a camera photo
              (lastCameraPhoto?.dataUrl || lastCameraPhoto?.imageUrl)
                ? 'camera'
                : photos.find(p => p.isOriginal)?.sourceType || null
            }
            reusablePhotoUrl={
              // Show lastUploadedPhoto for upload preview - ONLY use lastUploadedPhoto
              (lastUploadedPhoto?.dataUrl || lastUploadedPhoto?.imageUrl)
                ? (lastUploadedPhoto.dataUrl || lastUploadedPhoto.imageUrl)
                : null
            }
            reusablePhotoSourceType={
              // Check lastUploadedPhoto - ONLY use lastUploadedPhoto
              (lastUploadedPhoto?.dataUrl || lastUploadedPhoto?.imageUrl)
                ? 'upload'
                : null
            }
            // Handler to show existing upload in adjuster
            onShowExistingUpload={handleShowExistingUpload}
            hasExistingUpload={
              // Check if there's a stored upload - ONLY check lastUploadedPhoto
              !!(lastUploadedPhoto && (lastUploadedPhoto.blob || lastUploadedPhoto.dataUrl))
            }
            // Reset handlers for camera and upload photos
            onResetCameraPhoto={handleResetCameraPhoto}
            onResetUploadedPhoto={handleResetUploadedPhoto}
          />
          

          
          {/* Photos button - show when user has photos */}
          {showStartMenu && photos.length > 0 && !showPhotoGrid && (
            <button 
              className="corner-btn photos-corner-btn"
              onClick={() => {
                // Pre-scroll to top for smooth transition
                window.scrollTo({ top: 0, behavior: 'smooth' });
                // Stop camera when showing photo grid
                stopCamera();
                // Show photo grid
                setShowPhotoGrid(true);
                setShowStartMenu(false);
              }}
            >
              Photos →
            </button>
          )}
        </>
      ) : (
        <>
          {/* Show camera view only when start menu is not shown */}
          <CameraView
            videoRef={videoReference}
            isReady={isSogniReady && !isPhotoButtonCooldown}
            countdown={countdown}
            isDisabled={isPhotoButtonCooldown}
            buttonLabel={isPhotoButtonCooldown ? "Get Ready!" : "Take Photo"}
            onTakePhoto={handleTakePhoto}
            showPhotoGrid={showPhotoGrid}
            selectedStyle={selectedStyle}
            onStyleSelect={handleUpdateStyle}
            showSettings={showControlOverlay}
            onToggleSettings={() => setShowControlOverlay(!showControlOverlay)}
            testId="camera-view"
            stylePrompts={stylePrompts}
            cameraDevices={cameraDevices}
            selectedCameraDeviceId={selectedCameraDeviceId}
            onCameraSelect={handleCameraSelection}
            onToggleCamera={handleToggleCamera}
            isFrontCamera={isFrontCamera}
            aspectRatio={aspectRatio}
            iosQuirkDetected={iosQuirkDetected}
            actualCameraDimensions={actualCameraDimensions}
            quirkDetectionComplete={quirkDetectionComplete}
            tezdevTheme={tezdevTheme}
            modelOptions={getModelOptions()}
            selectedModel={selectedModel}
            onModelSelect={(value) => {
              console.log(`🔧 Manual model change: ${selectedModel} → ${value}`);
              
              // Mark that user explicitly selected a model - disable auto-switching
              userExplicitlySelectedModelRef.current = true;
              console.log('🙋 User explicitly selected a model - auto-switching disabled');
              
              // Track if user manually selected DreamShaper
              if (value === 'coreml-dreamshaperXL_v21TurboDPMSDE') {
                dreamShaperAutoSelectedRef.current = false; // User manually selected it
                console.log('🔧 User manually selected DreamShaper - will not auto-switch away');
              }
              
              // If switching away from DreamShaper, clear winter context
              if (selectedModel === 'coreml-dreamshaperXL_v21TurboDPMSDE' && value !== 'coreml-dreamshaperXL_v21TurboDPMSDE') {
                console.log('🔧 Clearing winter context (leaving DreamShaper)');
                updateSetting('winterContext', false);
                dreamShaperAutoSelectedRef.current = false; // Reset the flag
              }
              
              switchToModel(value);
            }}
            numImages={numImages}
            onNumImagesChange={(value) => {
              updateSetting('numImages', value);
            }}
            promptGuidance={promptGuidance}
            onPromptGuidanceChange={(value) => {
              updateSetting('promptGuidance', value);
            }}
            guidance={guidance}
            onGuidanceChange={(value) => {
              updateSetting('guidance', value);
            }}
            controlNetStrength={controlNetStrength}
            onControlNetStrengthChange={(value) => {
              updateSetting('controlNetStrength', value);
              saveSettingsToCookies({ controlNetStrength: value });
            }}
            controlNetGuidanceEnd={controlNetGuidanceEnd}
            onControlNetGuidanceEndChange={(value) => {
              updateSetting('controlNetGuidanceEnd', value);
              saveSettingsToCookies({ controlNetGuidanceEnd: value });
            }}
            inferenceSteps={inferenceSteps}
            onInferenceStepsChange={(value) => {
              updateSetting('inferenceSteps', value);
            }}
            scheduler={scheduler}
            onSchedulerChange={(value) => {
              updateSetting('scheduler', value);
            }}
            timeStepSpacing={timeStepSpacing}
            onTimeStepSpacingChange={(value) => {
              updateSetting('timeStepSpacing', value);
            }}
            flashEnabled={flashEnabled}
            onFlashEnabledChange={(value) => {
              updateSetting('flashEnabled', value);
              saveSettingsToCookies({ flashEnabled: value });
            }}
            keepOriginalPhoto={keepOriginalPhoto}
            onKeepOriginalPhotoChange={(value) => {
              updateSetting('keepOriginalPhoto', value);
              saveSettingsToCookies({ keepOriginalPhoto: value });
            }}
            soundEnabled={soundEnabled}
            onSoundEnabledChange={(value) => {
              updateSetting('soundEnabled', value);
              saveSettingsToCookies({ soundEnabled: value });
            }}
            slothicornAnimationEnabled={slothicornAnimationEnabled}
            onSlothicornAnimationEnabledChange={(value) => {
              updateSetting('slothicornAnimationEnabled', value);
              saveSettingsToCookies({ slothicornAnimationEnabled: value });
            }}
            backgroundAnimationsEnabled={backgroundAnimationsEnabled}
            onBackgroundAnimationsEnabledChange={(value) => {
              updateSetting('backgroundAnimationsEnabled', value);
              saveSettingsToCookies({ backgroundAnimationsEnabled: value });
            }}
            onResetSettings={resetSettings}
            onBackToMenu={handleBackToMenu}
            lastPhotoData={lastCameraPhoto}
            onThumbnailClick={handleThumbnailClick}
          />
          
          {/* Other UI elements like canvas, flash effect, etc. */}
          <canvas ref={canvasReference} style={{ display: 'none' }} />
          
          {/* Back to Menu Button - moved outside of CameraView */}
          {!showStartMenu && !showPhotoGrid && (
            <button 
              className="corner-btn back-to-menu-btn"
              onClick={handleBackToMenu}
              aria-label="Back to Main Menu"
              data-testid="back-to-menu-button"
            >
              ← Menu
            </button>
          )}


        </>
      )}
    </div>
  );

  // -------------------------
  //   Drag overlay
  // -------------------------
  const handleBackToCamera = async () => {
    // Always go directly back to camera from photo grid
    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Clear QR code when going back to camera
    if (qrCodeData) {
      console.log('Clearing QR code when returning to camera');
      setQrCodeData(null);
    }
    
    // UI handles Einstein fallback automatically when lastCameraPhoto is null/empty
    
    // Mark the photo grid as hiding with a clean fade-out
    const filmStrip = document.querySelector('.film-strip-container');
    if (filmStrip) {
      filmStrip.classList.remove('visible');
      filmStrip.classList.add('hiding');
    }
    
    // Use a shorter timeout for a snappier UI feel
    setTimeout(async () => {
      // Hide photo grid and reset states
      setShowPhotoGrid(false);
      setSelectedPhotoIndex(null);
      
      // Hide slothicorn to prevent double appearance
      if (slothicornReference.current) {
        slothicornReference.current.style.setProperty('bottom', '-360px', 'important');
        slothicornReference.current.classList.remove('animating');
      }
      
      // Go directly back to camera view instead of start menu
      setShowStartMenu(false);
      
      // Restart camera since it was stopped when photo grid was shown
      const preferredDeviceId = preferredCameraDeviceId || selectedCameraDeviceId;
      console.log('📹 Restarting camera from photo grid with preferred device:', preferredDeviceId || 'auto-select');
      
      // Enumerate camera devices if not already done
      if (cameraDevices.length === 0) {
        await listCameras();
      }
      
      if (cameraManuallyStarted && videoReference.current) {
        // Always restart the camera since we stop it when showing photo grid
        startCamera(preferredDeviceId);
      } else {
        // Camera hasn't been manually started yet, start it now
        startCamera(preferredDeviceId);
        setCameraManuallyStarted(true);
      }
      
      setTimeout(() => {
        // Remove the setStudioLightsHidden line - no studio lights animation needed
      }, 300);
    }, 450); // Reduced time to match our new animation duration
  };

  // Add effect to reset newlyArrived status after animation completes
  useEffect(() => {
    const newPhotos = photos.filter(photo => photo.newlyArrived);
    if (newPhotos.length > 0) {
      const timer = setTimeout(() => {
        setRegularPhotos(previous => 
          previous.map(photo => 
            photo.newlyArrived ? { ...photo, newlyArrived: false } : photo
          )
        );
      }, 1500); // Slightly longer than animation duration (1.3s + buffer)
      
      return () => clearTimeout(timer);
    }
  }, [photos]);

  // Clean up sound tracking when photos are cleared/reset
  useEffect(() => {
    if (photos.length === 0) {
      soundPlayedForPhotos.current.clear();
    }
  }, [photos.length]);

  // Handle clicks in the photo viewer
  const handlePhotoViewerClick = (e) => {
    if (selectedPhotoIndex === null) return;
    
    // If the target is the film-frame, close the photo viewer
    const target = e.target;
    
    if (target.classList.contains('film-frame') && target.classList.contains('selected')) {
      // Close the photo viewer when clicking anywhere except on controls
      setSelectedPhotoIndex(null);
    }
  };

  // Add toggle function for notes modal
  const toggleNotesModal = () => {
    setShowInfoModal(!showInfoModal);
  };


  // The start menu state was moved to the top
  // Handler for the "Take Photo" option in start menu
  const handleTakePhotoOption = async () => {
    // Clear any previous permission denied state
    setCameraPermissionDenied(false);
    
    // Set waiting state before starting the camera permission flow
    setWaitingForCameraPermission(true);
    
    // UI handles Einstein fallback automatically when lastCameraPhoto is null/empty
    
    // Add exit animation class
    const startMenuElement = document.querySelector('.camera-start-menu');
    if (startMenuElement) {
      startMenuElement.classList.add('exiting');
      
      // Wait for animation to complete before hiding
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setShowStartMenu(false);
    
    // Enumerate camera devices first
    await listCameras();
    
    // Start camera after user selects the option - use preferred camera if available
    const preferredDeviceId = preferredCameraDeviceId || selectedCameraDeviceId;
    console.log('📹 Starting camera with preferred device:', preferredDeviceId || 'auto-select');
    await startCamera(preferredDeviceId);
    setCameraManuallyStarted(true); // User explicitly chose to take a photo
  };

  // Handler to show existing camera photo in ImageAdjuster
  const handleShowExistingCameraPhoto = async () => {
    if (!lastCameraPhoto) {
      console.warn('No lastCameraPhoto available to show');
      // No existing camera photo, go to camera
      await handleTakePhotoOption();
      return;
    }

    // Add exit animation class
    const startMenuElement = document.querySelector('.camera-start-menu');
    if (startMenuElement) {
      startMenuElement.classList.add('exiting');
      
      // Wait for animation to complete before hiding
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setShowStartMenu(false);

    // Check if Sogni is ready
    if (!isSogniReady) {
      alert('Sogni is not ready yet. Please try again in a moment.');
      setShowStartMenu(true);
      return;
    }

    if (lastCameraPhoto.blob) {
      // We have the blob - can reopen the adjuster
      const newTempUrl = URL.createObjectURL(lastCameraPhoto.blob);
      setCurrentUploadedImageUrl(newTempUrl);
      setCurrentUploadedSource('camera');
      setLastAdjustedPhoto(lastCameraPhoto); // Also update lastAdjustedPhoto
      setShowImageAdjuster(true);
    } else if (lastCameraPhoto.dataUrl || lastCameraPhoto.imageUrl) {
      // We have the dataUrl/imageUrl from state - convert back to blob
      try {
        const urlToFetch = lastCameraPhoto.dataUrl || lastCameraPhoto.imageUrl;
        const response = await fetch(urlToFetch);
        const blob = await response.blob();
        const newTempUrl = URL.createObjectURL(blob);
        
        // Update both camera states with the new blob for future use
        const updatedPhotoData = {
          ...lastCameraPhoto,
          blob: blob,
          imageUrl: newTempUrl
        };
        
        setLastCameraPhoto(updatedPhotoData);
        setLastAdjustedPhoto(updatedPhotoData);
        
        setCurrentUploadedImageUrl(newTempUrl);
        setCurrentUploadedSource('camera');
        setShowImageAdjuster(true);
      } catch (error) {
        console.error('Failed to restore camera photo from dataUrl:', error);
        alert('Failed to restore previous camera photo. Taking a new photo...');
        setLastCameraPhoto(null);
        await handleTakePhotoOption();
      }
    } else {
      // No usable image data, go to camera
      console.warn('No usable camera photo data found');
      setLastCameraPhoto(null);
      await handleTakePhotoOption();
    }
  };

  // Handler to show existing upload in ImageAdjuster
  const handleShowExistingUpload = async () => {
    // ONLY use lastUploadedPhoto - do not mix with camera photos or adjusted photos
    if (!lastUploadedPhoto || (!lastUploadedPhoto.blob && !lastUploadedPhoto.dataUrl)) {
      console.warn('No lastUploadedPhoto available to show');
      return;
    }

    // Add exit animation class
    const startMenuElement = document.querySelector('.camera-start-menu');
    if (startMenuElement) {
      startMenuElement.classList.add('exiting');
      
      // Wait for animation to complete before hiding
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setShowStartMenu(false);

    // Check if Sogni is ready
    if (!isSogniReady) {
      alert('Sogni is not ready yet. Please try again in a moment.');
      setShowStartMenu(true);
      return;
    }

    if (lastUploadedPhoto.blob) {
      // We have the blob - can reopen the adjuster
      const newTempUrl = URL.createObjectURL(lastUploadedPhoto.blob);
      setCurrentUploadedImageUrl(newTempUrl);
      setCurrentUploadedSource('upload');
      setLastAdjustedPhoto(lastUploadedPhoto); // Also update lastAdjustedPhoto with current adjustments
      setShowImageAdjuster(true);
    } else if (lastUploadedPhoto.dataUrl) {
      // We have the dataUrl from localStorage - convert back to blob
      try {
        const response = await fetch(lastUploadedPhoto.dataUrl);
        const blob = await response.blob();
        const newTempUrl = URL.createObjectURL(blob);
        
        // Update both upload states with the new blob for future use
        const updatedPhotoData = {
          ...lastUploadedPhoto,
          blob: blob,
          imageUrl: newTempUrl
        };
        
        setLastUploadedPhoto(updatedPhotoData);
        setLastAdjustedPhoto(updatedPhotoData);
        
        setCurrentUploadedImageUrl(newTempUrl);
        setCurrentUploadedSource('upload');
        setShowImageAdjuster(true);
      } catch (error) {
        console.error('Failed to restore image from dataUrl:', error);
        alert('Failed to restore previous photo. Please upload a new photo.');
        setLastUploadedPhoto(null);
        setShowStartMenu(true);
      }
    } else {
      // No usable image data
      console.warn('No usable image data found');
      setLastUploadedPhoto(null);
      setShowStartMenu(true);
    }
  };

  // Handler to reset camera photo
  const handleResetCameraPhoto = () => {
    setLastCameraPhoto(null);
    console.log('🗑️ Reset camera photo');
  };

  // Handler to reset uploaded photo
  const handleResetUploadedPhoto = () => {
    setLastUploadedPhoto(null);
    console.log('🗑️ Reset uploaded photo');
  };

  // Handler for the "Browse Photo" option in start menu
  const handleBrowsePhotoOption = async (file) => {
    // Add exit animation class
    const startMenuElement = document.querySelector('.camera-start-menu');
    if (startMenuElement) {
      startMenuElement.classList.add('exiting');
      
      // Wait for animation to complete before hiding
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setShowStartMenu(false);
    
    // Make sure we have a valid file
    if (!file) return;
    
    // Check if Sogni is ready
    if (!isSogniReady) {
      alert('Sogni is not ready yet. Please try again in a moment.');
      setShowStartMenu(true);
      return;
    }
    
    // Create a temporary URL for the file
    const tempUrl = URL.createObjectURL(file);
    setCurrentUploadedImageUrl(tempUrl);
    setCurrentUploadedSource('upload');
    
    // Store photo data immediately with tempUrl
    const initialPhotoData = {
      imageUrl: tempUrl,
      source: 'upload',
      blob: file
    };
    
    setLastAdjustedPhoto(initialPhotoData);
    setLastUploadedPhoto(initialPhotoData); // Set immediately so preview works
    
    // Convert blob to data URL for persistent storage (asynchronously)
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      
      // Update with data URL when ready
      const updatedPhotoData = {
        ...initialPhotoData,
        dataUrl: dataUrl // Add persistent data URL
      };

      setLastAdjustedPhoto(updatedPhotoData);
      setLastUploadedPhoto(updatedPhotoData);
    };
    reader.readAsDataURL(file);
    
    // Show the image adjuster
    setShowImageAdjuster(true);
  };

  // Handler for the "Drag Photo" option in start menu
  const handleDragPhotoOption = async () => {
    // Add exit animation class
    const startMenuElement = document.querySelector('.camera-start-menu');
    if (startMenuElement) {
      startMenuElement.classList.add('exiting');
      
      // Wait for animation to complete before hiding
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setShowStartMenu(false);
    // Show an overlay or instructions for drag and drop
    setDragActive(true);
    // This will use the existing drag and drop handlers which now use the image adjuster
  };

  // Handler for uploading a style reference image (for "Copy image style" mode)
  const handleStyleReferenceUpload = async (file) => {
    console.log('📸 Style reference image upload started');
    
    // Make sure we have a valid file
    if (!file) return;
    
    // Create a temporary URL for the file
    const tempUrl = URL.createObjectURL(file);
    
    // Store the original file
    setStyleReferenceImage({
      blob: file,
      dataUrl: tempUrl,
      croppedBlob: null // Will be set after cropping
    });
    
    // Set the uploaded image URL for the adjuster
    setCurrentUploadedImageUrl(tempUrl);
    setCurrentUploadedSource('style-reference');
    
    // Show the style reference adjuster
    setShowStyleReferenceAdjuster(true);
  };

  // Handler for when style reference image is cropped and confirmed in ImageAdjuster
  const handleStyleReferenceConfirm = async (croppedBlob) => {
    console.log('✅ Style reference image cropped and confirmed');
    
    // Convert both original and cropped blobs to data URLs for persistent storage
    const croppedReader = new FileReader();
    const originalReader = new FileReader();
    
    // Wait for both conversions to complete
    const croppedDataUrlPromise = new Promise((resolve) => {
      croppedReader.onloadend = () => resolve(croppedReader.result);
      croppedReader.readAsDataURL(croppedBlob);
    });
    
    const originalDataUrlPromise = new Promise((resolve) => {
      originalReader.onloadend = () => resolve(originalReader.result);
      originalReader.readAsDataURL(styleReferenceImage.blob);
    });
    
    const [croppedDataUrl, originalDataUrl] = await Promise.all([
      croppedDataUrlPromise,
      originalDataUrlPromise
    ]);
    
    // Update the style reference with the cropped version
    const updatedStyleRef = {
      blob: styleReferenceImage.blob,
      dataUrl: croppedDataUrl, // Use cropped data URL for display
      croppedBlob: croppedBlob,
      croppedDataUrl: croppedDataUrl
    };
    
    setStyleReferenceImage(updatedStyleRef);
    
    // Save to localStorage for persistence (both as data URLs, not blob URLs)
    try {
      const success = safeLocalStorageSetItem('sogni_styleReferenceImage', JSON.stringify({
        croppedDataUrl: croppedDataUrl,
        originalDataUrl: originalDataUrl // Now saving as data URL, not blob URL
      }));
      if (success) {
        console.log('💾 Saved style reference to localStorage');
      }
    } catch (e) {
      console.warn('Failed to save style reference to localStorage:', e);
    }
    
    // Hide the adjuster
    setShowStyleReferenceAdjuster(false);
    
    // IMPORTANT: Switch model FIRST, then set style
    // This prevents race conditions where switchToModel might use old settings
    console.log('🔄 Switching to Flux Kontext for image style copy mode');
    switchToModel(FLUX_KONTEXT_MODEL_ID);
    
    // Then set the selected style to 'copyImageStyle' 
    // Use setTimeout to ensure model switch state update completes first
    setTimeout(() => {
      updateSetting('selectedStyle', 'copyImageStyle');
      saveSettingsToCookies({ selectedStyle: 'copyImageStyle' });
      console.log('💾 Explicitly saved copyImageStyle to cookies');
      
      // Clear any URL prompt parameter that might override our selection
      updateUrlWithPrompt('copyImageStyle');
      console.log('🔗 Cleared URL prompt parameter');
      
      // Inform user about the model switch
      showToast({
        type: 'info',
        title: 'Model Switched',
        message: 'Automatically switched to Flux Kontext for Copy Image Style. You can change the model in Photobooth Settings.',
        timeout: 5000
      });
    }, 0);
  };

  // Handler to remove style reference image
  const handleRemoveStyleReference = () => {
    console.log('🗑️ Removing style reference image');
    
    // Clean up blob URLs
    if (styleReferenceImage?.dataUrl) {
      URL.revokeObjectURL(styleReferenceImage.dataUrl);
    }
    
    // Clear the style reference
    setStyleReferenceImage(null);
    
    // Clear from localStorage
    try {
      localStorage.removeItem('sogni_styleReferenceImage');
      console.log('💾 Removed style reference from localStorage');
    } catch (e) {
      console.warn('Failed to remove style reference from localStorage:', e);
    }
    
    // Reset to default style
    updateSetting('selectedStyle', 'randomMix');
    
    // Switch back to Sogni Turbo
    console.log('🔄 Switching back to Sogni Turbo');
    switchToModel(DEFAULT_MODEL_ID);
  };

  // Handler to open existing style reference in adjuster for editing
  const handleEditStyleReference = () => {
    if (!styleReferenceImage?.dataUrl) {
      console.warn('No style reference image to edit');
      return;
    }
    
    console.log('📝 Opening style reference in adjuster for editing');
    
    // Make sure regular image adjuster is closed
    setShowImageAdjuster(false);
    
    // Set the uploaded image URL for the adjuster
    setCurrentUploadedImageUrl(styleReferenceImage.dataUrl);
    setCurrentUploadedSource('style-reference');
    
    // Show the style reference adjuster
    setShowStyleReferenceAdjuster(true);
  };

  // Handle toggling between front and rear camera
  const handleToggleCamera = () => {
    setIsFrontCamera(prev => !prev);
    
    // Need to restart the camera with the new facing mode
    // No need to pass deviceId when toggling
    startCamera();
    setCameraManuallyStarted(true); // User explicitly toggled camera
    
    // Also update the mirror effect immediately
    if (videoReference.current) {
      videoReference.current.style.transform = !isFrontCamera ? 'scaleX(-1)' : 'scaleX(1)';
    }
  };

  // Function to handle going back from camera to start menu
  const handleBackToMenu = () => {
    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Clear QR code when going back to menu
    if (qrCodeData) {
      console.log('Clearing QR code when returning to menu');
      setQrCodeData(null);
    }
    
    // Hide photo grid if it's visible
    if (showPhotoGrid) {
      const filmStrip = document.querySelector('.film-strip-container');
      if (filmStrip) {
        filmStrip.classList.remove('visible');
        filmStrip.classList.add('hiding');
      }
      
      setTimeout(() => {
        setShowPhotoGrid(false);
        setSelectedPhotoIndex(null);
      }, 300);
    }
    
    // Hide slothicorn if visible
    if (slothicornReference.current) {
      slothicornReference.current.style.setProperty('bottom', '-360px', 'important');
      slothicornReference.current.classList.remove('animating');
    }
    
    // Show the start menu
    setShowStartMenu(true);
  };

  // -------------------------
  //   Generate more photos with the same settings
  // -------------------------
  const handleGenerateMorePhotos = async () => {
    // Check if user is not authenticated and has already used their demo render
    if (!authState.isAuthenticated && hasDoneDemoRender()) {
      console.log('🚫 Non-authenticated user has already used their demo render - showing login upsell');
      setShowLoginUpsellPopup(true);
      setShowStartMenu(true); // Return to main yellow screen
      return;
    }

    // Scroll the film-strip-content element to the top first thing
    const filmStripContent = document.querySelector('.film-strip-container div');
    if (filmStripContent) {
      filmStripContent.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }

    if (!lastPhotoData.blob) {
      return;
    }

    // Cancel any existing project first
    if (activeProjectReference.current) {
      console.log('Cancelling existing project:', activeProjectReference.current);
      if (sogniClient) {
        try {
          await sogniClient.cancelProject(activeProjectReference.current);
        } catch (error) {
          console.warn('Error cancelling previous project:', error);
        }
      }
      activeProjectReference.current = null;
    }

    console.log('Generating more photos with the same settings');
    
    // Clear QR codes and mobile share cache when generating new batch since photo indices will change
    if (qrCodeData) {
      console.log('Clearing QR code due to new batch generation');
      setQrCodeData(null);
    }
    
    // Clear mobile share cache since photo indices will point to different images
    console.log('Clearing mobile share cache due to new batch generation');
    setMobileShareCache({});
    
    // Use numImages from context state
    const numToGenerate = numImages; 
    
    // Use keepOriginalPhoto from context state
    const existingOriginalPhoto = keepOriginalPhoto ? photos.find(p => p.isOriginal) : null; 
    
    // Determine sourceType - prefer using the sourceType of the original photo we're generating from
    let sourceType = 'upload'; // Default to upload if we can't determine
    
    // If we have an existing original photo with sourceType, use that
    if (existingOriginalPhoto && existingOriginalPhoto.sourceType) {
      sourceType = existingOriginalPhoto.sourceType;
    } 
    // Otherwise check the lastPhotoData (the photo being used for generation)
    else if (lastPhotoData.sourceType) {
      sourceType = lastPhotoData.sourceType;
    }
    
    console.log(`Using sourceType '${sourceType}' for generating more photos`);
    
    setRegularPhotos(() => {
      const newPhotos = existingOriginalPhoto ? [existingOriginalPhoto] : [];
      
      for (let i = 0; i < numToGenerate; i++) {
        // Calculate the global photo index for frame assignment based on existing photos
        const globalPhotoIndex = (existingOriginalPhoto ? 1 : 0) + i;
        
        newPhotos.push({
          id: Date.now() + i,
          generating: true,
          loading: true,
          progress: 0,
          images: [],
          error: null,
          originalDataUrl: lastPhotoData.dataUrl,
          newlyArrived: false,
          statusText: 'Calling Art Robot',
          stylePrompt: '', // Use context stylePrompt here? Or keep empty?
          customSceneName: selectedStyle === 'custom' && customSceneName ? customSceneName : undefined, // Store custom scene name for "More" photos
          sourceType: sourceType, // Store sourceType in photo object for reference
          // Assign Taipei frame number based on photo index for equal distribution (1-6)
          taipeiFrameNumber: (globalPhotoIndex % 6) + 1,
          framePadding: 0 // Will be updated by migration effect in PhotoGallery
        });
      }
      
      return newPhotos;
    });
    
    try {
      const { blob, dataUrl } = lastPhotoData;
      const blobCopy = blob.slice(0, blob.size, blob.type);
      await new Promise(resolve => setTimeout(resolve, 50));
      const newPhotoIndex = existingOriginalPhoto ? 1 : 0;
      // Pass sourceType to generateFromBlob
      await generateFromBlob(blobCopy, newPhotoIndex, dataUrl, true, sourceType);
    } catch (error) {
      console.error('Error generating more photos:', error);
      setRegularPhotos(() => {
        const newPhotos = existingOriginalPhoto ? [existingOriginalPhoto] : [];
        for (let i = 0; i < numToGenerate; i++) {
          // Handle NetworkError instances with better messaging
          let errorMessage = `Error: ${error.message || error}`;
          let retryable = false;
          
          if (isNetworkError(error)) {
            if (error.isOffline) {
              errorMessage = 'NETWORK OFFLINE: Check connection';
              retryable = true;
            } else if (error.isTimeout) {
              errorMessage = 'CONNECTION TIMEOUT: Try again';  
              retryable = true;
            } else if (error.retryable) {
              errorMessage = 'NETWORK ERROR: Retry available';
              retryable = true;
            } else {
              errorMessage = 'NETWORK ERROR: Connection failed';
              retryable = false;
            }
          } else if (error && error.message) {
            const errorText = error.message;
            if (errorText.includes('network') || errorText.includes('connection') || errorText.includes('timeout')) {
              retryable = true;
            }
          }
          
          newPhotos.push({
            id: Date.now() + i,
            generating: false,
            loading: false,
            error: errorMessage,
            originalDataUrl: lastPhotoData.dataUrl,
            permanentError: !retryable,
            retryable: retryable,
            sourceType: sourceType // Store sourceType in photo object
          });
        }
        return newPhotos;
      });
    }
  };

  // Add retry mechanism for failed photos
  const handleRetryPhoto = async (photoIndex) => {
    console.log(`Retrying photo at index ${photoIndex}`);
    
    const photo = photos[photoIndex];
    if (!photo || !photo.retryable || !lastPhotoData.blob) {
      console.error('Cannot retry: photo not retryable or no source data available');
      return;
    }
    
    // Reset photo to generating state
    setRegularPhotos(prev => {
      const updated = [...prev];
      if (updated[photoIndex]) {
        updated[photoIndex] = {
          ...updated[photoIndex],
          generating: true,
          loading: true,
          progress: 0,
          error: null,
          permanentError: false,
          retryable: false,
          statusText: 'Retrying...'
        };
      }
      return updated;
    });
    
    try {
      // Use the same source data to retry generation
      const { blob, dataUrl } = lastPhotoData;
      const blobCopy = blob.slice(0, blob.size, blob.type);
      
      // Wait a bit before retrying to avoid hammering the server
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Retry the generation using the same approach as generateFromBlob 
      const sourceType = photo.sourceType || 'upload';
      await generateFromBlob(blobCopy, photoIndex, dataUrl, true, sourceType);
      
    } catch (error) {
      console.error('Retry failed:', error);
      
      // Update photo with retry failure
      setRegularPhotos(prev => {
        const updated = [...prev];
        if (updated[photoIndex]) {
          let errorMessage = 'RETRY FAILED: Try again later';
          let retryable = false;
          
          if (isNetworkError(error)) {
            if (error.isOffline) {
              errorMessage = 'STILL OFFLINE: Check connection';
              retryable = true;
            } else if (error.retryable) {
              errorMessage = 'RETRY FAILED: Network issue';
              retryable = true;
            }
          } else if (error && error.message && 
                     (error.message.includes('network') || 
                      error.message.includes('connection') || 
                      error.message.includes('timeout'))) {
            retryable = true;
          }
          
          updated[photoIndex] = {
            ...updated[photoIndex],
            generating: false,
            loading: false,
            error: errorMessage,
            permanentError: !retryable,
            retryable: retryable,
            statusText: 'Retry Failed'
          };
        }
        return updated;
      });
    }
  };

  // Handle refreshing a photo - regenerate a single photo with its original prompt
  const handleRefreshPhoto = async (photoIndex, authState, refreshingPhotos) => {
    console.log(`Refreshing photo at index ${photoIndex}`);
    
    const photo = photos[photoIndex];
    if (!photo || photo.isOriginal || photo.isGalleryImage) {
      console.error('Cannot refresh: invalid photo type');
      return;
    }
    
    // Check if user is manually logged in
    const isManualAuth = authState && authState.authMode === 'frontend';
    
    // Check concurrent refresh limit for manual auth users
    if (isManualAuth && refreshingPhotos.size >= 2) {
      console.log('Maximum concurrent refreshes reached (2 for manual auth users)');
      return;
    }
    
    // Check if user has Premium Spark (for frontend auth payment)
    const hasPremiumSpark = isPremiumBoosted(balances, walletTokenType);
    
    try {
      // Use the refreshPhoto service (similar to enhancePhoto)
      await refreshPhoto({
        photo,
        photoIndex,
        sogniClient,
        setPhotos: setRegularPhotos,
        settings,
        lastPhotoData,
        stylePrompts,
        tokenType: walletTokenType, // Pass payment method for frontend auth
        isPremiumSpark: hasPremiumSpark, // Pass premium status for frontend auth
        onOutOfCredits: () => {
          console.log('[REFRESH] Triggering out of credits popup from handleRefreshPhoto');
          setShowOutOfCreditsPopup(true);
        }
      });
    } catch (error) {
      console.error('Refresh failed:', error);
      // Error handling is done inside refreshPhoto service
    }
  };

  // Handle gallery prompt application - trigger generation when selectedStyle updates
  useEffect(() => {
    if (pendingGalleryPrompt && selectedStyle === pendingGalleryPrompt) {
      console.log(`Gallery prompt ${pendingGalleryPrompt} has been applied, starting generation`);
      setPendingGalleryPrompt(null);
      
      // Small delay to ensure UI is updated
      setTimeout(() => {
        handleGenerateMorePhotos();
      }, 100);
    }
  }, [selectedStyle, pendingGalleryPrompt, handleGenerateMorePhotos]);

  // Add a dedicated useEffect for the aspect ratio CSS
  useEffect(() => {
    // Add our CSS fixes (all 5 issues at once)
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      /* ------- FIX 1: Style dropdown ------- */
      .style-dropdown {
        animation: dropdownAppear 0.3s cubic-bezier(0.17, 0.67, 0.25, 1.2) forwards;
      }
      
      /* Position variations */
      .style-dropdown.top-position {
        bottom: 100%;
        top: auto !important;
        margin-bottom: 10px;
        transform-origin: center bottom !important;
        animation: dropdownAppearTop 0.3s cubic-bezier(0.17, 0.67, 0.25, 1.2) forwards;
      }
      
      .style-dropdown.bottom-position {
        top: 100%;
        bottom: auto !important;
        margin-top: 10px;
        transform-origin: center top !important;
        animation: dropdownAppearBottom 0.3s cubic-bezier(0.17, 0.67, 0.25, 1.2) forwards;
      }
      
      @keyframes dropdownAppearTop {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(10px);
        }
        to {
          opacity: 1; 
          transform: translateX(-50%) translateY(0);
        }
      }
      
      @keyframes dropdownAppearBottom {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(-10px);
        }
        to {
          opacity: 1; 
          transform: translateX(-50%) translateY(0);
        }
      }
      
      .style-section.featured {
        border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        padding-bottom: 8px;
        margin-bottom: 8px;
      }
      
      .style-option {
        display: flex;
        align-items: center;
        padding: 10px 12px;
        margin: 2px 0;
        border-radius: 4px;
        cursor: pointer;
        color: #333;
        transition: background-color 0.2s;
      }
      
      .style-option:hover {
        background-color: #f5f5f5;
      }
      
      .style-option:hover:before {
        display: none !important; /* Remove the carat */
      }
      
      .style-option.selected {
        background-color: transparent !important;
        position: relative;
      }
      
      .style-option.selected span:last-of-type {
        text-decoration: underline;
        text-decoration-color: #000;
      }
      
      .style-option.selected::after {
        content: '✓';
        margin-left: auto;
        font-size: 18px;
        font-weight: bold;
        color: #ff5252;
      }
      
      .style-icon {
        margin-right: 10px;
        z-index: 2;
      }
      
      /* ------- FIX 2: Camera widget Polaroid style ------- */
      .photobooth-frame {
        background: white;
        box-shadow: 0 8px 30px rgba(0,0,0,0.2);
        border-radius: 4px;
        width: auto;
        max-width: 70%;
        margin: 20px auto;
        padding: 8px 8px 60px 8px;
        position: relative;
      }
      
      .photobooth-header {
        margin-bottom: 8px;
      }
      
      /* Move Take Photo button to bottom */
      .header-take-photo-btn {
        position: absolute !important;
        bottom: 15px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        background: #ff5252 !important;
        color: white !important;
        font-weight: bold !important;
        padding: 10px 20px !important;
        border-radius: 25px !important;
        border: none !important;
        cursor: pointer !important;
        z-index: 10 !important;
      }
      
      .header-take-photo-btn:hover {
        background: #ff7272 !important;
      }

      /* ------- FIX 4: Loading image fade effect ------- */
      .film-frame.loading {
        position: relative;
      }
      
      .film-frame.loading img {
        transition: opacity 5s;
      }
                
      /* Fallback image styling */
      .film-frame[data-error="true"] img,
      .film-frame img.fallback {
        filter: grayscale(20%) !important;
      }
      
      /* Set aspect ratio CSS variable based on selected aspect ratio */
      :root {
        --current-aspect-ratio: ${
          aspectRatio === 'ultranarrow' ? '768/1344' :
          aspectRatio === 'narrow' ? '832/1216' :
          aspectRatio === 'portrait' ? '896/1152' : 
          aspectRatio === 'square' ? '1024/1024' : 
          aspectRatio === 'landscape' ? '1152/896' :
          aspectRatio === 'wide' ? '1216/832' :
          aspectRatio === 'ultrawide' ? '1344/768' :
          window.innerHeight > window.innerWidth ? '896/1152' : '1152/896'
        };
      }
      
      /* Ensure images display properly */
      #webcam {
        object-fit: cover;
        width: 100%;
        height: auto;
        border-radius: 0 !important;
      }
      
      /* Update film frame images */
      .film-frame img {
        object-fit: cover;
        width: 100%;
      }
      .fade-in {
        transition: opacity 0.5s !important;
      }

      /* ------- UPDATED: Improve Film Frame Hover Effects ------- */
      .film-frame:not(.loading) {
        transform-origin: center center !important;
        transform: scale(1) translateZ(0) !important;
        will-change: transform, box-shadow !important;
        /* Remove the default transition to prevent background animations */
      }
      
      /* Allow loading animations to work - but not in selected/popup view */
      .film-frame.loading:not(.selected) {
        transform-origin: center center !important;
        will-change: transform, box-shadow !important;
        /* Don't override transform for loading frames - let animation handle it */
      }
      
      /* Only apply transitions on hover/active for deliberate interaction, but not on loading frames */
      /* Only apply hover effects on devices that support hover (not touch devices) */
      @media (hover: hover) and (pointer: fine) {
        .film-frame:not(.selected):not(.loading):hover {
          transform: scale(1.05) translateZ(0) !important;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.25) !important;
          transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), 
                      box-shadow 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
        }
        
        .film-frame:not(.selected):not(.loading):active {
          transform: scale(0.98) translateZ(0) !important;
          box-shadow: 0 6px 15px rgba(0, 0, 0, 0.2) !important;
          transition: all 0.1s ease-out !important;
        }
      }
      
      /* Ensure only the deliberately selected photo animates */
      .film-frame.selected {
        transform: scale(1) !important;
      }
      
      /* Add transition only for the specific photo being selected/deselected */
      .film-frame.animating-selection {
        transition: transform 0.5s cubic-bezier(0.2, 0, 0.2, 1) !important;
      }
            
      /* ------- ADD: Psychedelic animation ------- */
      @keyframes psychedelic-shift {
        0% {
          background-position: 0% 0%, 0 0, 0 0;
        }
        25% {
          background-position: 100% 0%, 10px 10px, -10px -10px;
        }
        50% {
          background-position: 100% 100%, 20px 20px, -20px -20px;
        }
        75% {
          background-position: 0% 100%, 10px 30px, -10px -30px;
        }
        100% {
          background-position: 0% 0%, 0 0, 0 0;
        }
      }
    `;
    
    document.head.append(styleElement);
    
    // Update aspect ratio when orientation changes
    const updateAspectRatio = () => {
      // Only update if aspect ratio is not explicitly set by user
      if (!aspectRatio || aspectRatio === 'auto') {
        const isPortrait = window.innerHeight > window.innerWidth;
        document.documentElement.style.setProperty(
          '--current-aspect-ratio', 
          isPortrait ? '896/1152' : '1152/896'
        );
      }
    };
    
    // Set initial aspect ratio based on user selection or orientation
    switch (aspectRatio) {
      case 'ultranarrow':
        document.documentElement.style.setProperty('--current-aspect-ratio', '768/1344');
        break;
      case 'narrow':
        document.documentElement.style.setProperty('--current-aspect-ratio', '832/1216');
        break;
      case 'portrait':
        document.documentElement.style.setProperty('--current-aspect-ratio', '896/1152');
        break;
      case 'square':
        document.documentElement.style.setProperty('--current-aspect-ratio', '1024/1024');
        break;
      case 'landscape':
        document.documentElement.style.setProperty('--current-aspect-ratio', '1152/896');
        break;
      case 'wide':
        document.documentElement.style.setProperty('--current-aspect-ratio', '1216/832');
        break;
      case 'ultrawide':
        document.documentElement.style.setProperty('--current-aspect-ratio', '1344/768');
        break;
      default:
        // Default to orientation-based
        updateAspectRatio();
        break;
    }
    
    // Update on resize only if not using explicit aspect ratio
    window.addEventListener('resize', updateAspectRatio);
    
    return () => {
      window.removeEventListener('resize', updateAspectRatio);
      if (styleElement && document.head.contains(styleElement)) {
        styleElement.remove();
      }
    };
  }, [aspectRatio]);

  // -------------------------
  //   Early Returns (after all hooks)
  // -------------------------
  
  // Note: Analytics dashboard routing is now handled by AppRouter component

  // Add retry all function for network issues
  const handleRetryAllPhotos = async () => {
    console.log('Retrying all failed retryable photos');
    
    // Reset connection state when user manually retries
    setConnectionState('online');
    
    // Cancel any active project first to prevent conflicts
    if (activeProjectReference.current) {
      console.log('Cancelling active project before retry:', activeProjectReference.current);
      if (sogniClient) {
        try {
          await sogniClient.cancelProject(activeProjectReference.current);
        } catch (error) {
          console.warn('Error cancelling active project during retry:', error);
        }
      }
      activeProjectReference.current = null;
      clearAllTimeouts(); // Clear any existing timeouts
    }
    
    // Find all photos that can be retried
    const retryablePhotos = photos
      .map((photo, index) => ({ photo, index }))
      .filter(({ photo }) => photo.error && photo.retryable && !photo.generating);
    
    // Also handle stuck generating photos (force retry them)
    const stuckPhotos = photos
      .map((photo, index) => ({ photo, index }))
      .filter(({ photo }) => (photo.generating || photo.loading) && !photo.error);
    
    if (retryablePhotos.length === 0 && stuckPhotos.length === 0) {
      console.log('No retryable or stuck photos found');
      return;
    }
    
    // First, reset stuck photos to error state so they can be retried
    if (stuckPhotos.length > 0) {
      console.log(`Found ${stuckPhotos.length} stuck photos, converting to retryable errors`);
      setRegularPhotos(prev => {
        const updated = [...prev];
        stuckPhotos.forEach(({ index }) => {
          if (updated[index]) {
            updated[index] = {
              ...updated[index],
              generating: false,
              loading: false,
              error: 'GENERATION STUCK: Connection timeout',
              retryable: true,
              permanentError: false,
              statusText: 'Stuck - Retry Available'
            };
          }
        });
        return updated;
      });
      
      // Wait a moment for state to update
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Get the updated photos list after state changes using a callback to ensure fresh state
    let allRetryablePhotos = [];
    setRegularPhotos(prev => {
      allRetryablePhotos = prev
        .map((photo, index) => ({ photo, index }))
        .filter(({ photo }) => photo.error && photo.retryable && !photo.generating);
      return prev; // Don't actually change the state here
    });
    
    // Retry each photo with a small delay between retries
    for (let i = 0; i < allRetryablePhotos.length; i++) {
      const { index } = allRetryablePhotos[i];
      
      // Add a delay between retries to avoid overwhelming the server
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      try {
        await handleRetryPhoto(index);
      } catch (error) {
        console.error(`Failed to retry photo ${index}:`, error);
      }
    }
  };

  // Add this new function to handle the adjusted image after confirmation
  const handleAdjustedImage = (adjustedBlob, adjustments) => {
    // Check if user is not authenticated and has already used their demo render
    if (!authState.isAuthenticated && hasDoneDemoRender()) {
      console.log('🚫 Non-authenticated user has already used their demo render - showing login upsell');
      setShowLoginUpsellPopup(true);
      // Hide the adjuster and clean up
      setShowImageAdjuster(false);
      if (currentUploadedImageUrl) {
        URL.revokeObjectURL(currentUploadedImageUrl);
      }
      setCurrentUploadedImageUrl('');
      setShowStartMenu(true); // Return to main yellow screen
      return;
    }

    // Hide the adjuster first
    setShowImageAdjuster(false);

    // If we're in Style Explorer mode, navigate back to photo gallery view
    if (currentPage === 'prompts') {
      console.log('🔄 Navigating from Style Explorer to photo gallery for batch generation');
      handleBackToPhotosFromPromptSelector();
    }
    
    // Clean up the URL object to prevent memory leaks
    if (currentUploadedImageUrl) {
      URL.revokeObjectURL(currentUploadedImageUrl);
    }
    
    // Reset the current image state
    setCurrentUploadedImageUrl('');
    
    // Update lastAdjustedPhoto with the adjustments so user can return to resizer from photo gallery
    if (lastAdjustedPhoto && adjustments) {
  
      setLastAdjustedPhoto({
        ...lastAdjustedPhoto,
        adjustments: adjustments
      });
    }
    
    // Validate adjustedBlob before proceeding
    if (!adjustedBlob || !(adjustedBlob instanceof Blob)) {
      console.error('❌ Invalid blob received from ImageAdjuster:', adjustedBlob);
      alert('Failed to process image. Please try again.');
      setShowStartMenu(true);
      return;
    }

    console.log('📸 Processing adjusted blob:', {
      size: adjustedBlob.size,
      type: adjustedBlob.type,
      source: currentUploadedSource
    });

    // Create a new photo item with temporary placeholder
    const newPhoto = {
      id: Date.now().toString(),
      generating: true,
      images: [],
      error: null,
      originalDataUrl: null, // Will be updated with adjusted version
      newlyArrived: false,
      generationCountdown: 10,
      sourceType: currentUploadedSource === 'camera' ? 'camera' : 'upload', // Set source type based on current mode
      // Assign Taipei frame number based on current photo count for equal distribution (1-6)
      taipeiFrameNumber: (regularPhotos.length % 6) + 1,
      framePadding: 0 // Will be updated by migration effect in PhotoGallery
    };
    
    setRegularPhotos((previous) => [...previous, newPhoto]);
    const newPhotoIndex = regularPhotos.length;

    // Create data URL from the adjusted blob with error handling
    const reader = new FileReader();
    
    reader.addEventListener('error', (error) => {
      console.error('❌ FileReader error when processing adjusted blob:', error);
      setRegularPhotos(prev => {
        const updated = [...prev];
        if (updated[newPhotoIndex]) {
          updated[newPhotoIndex] = {
            ...updated[newPhotoIndex],
            generating: false,
            error: 'Failed to process image'
          };
        }
        return updated;
      });
    });
    
    reader.addEventListener('load', async (event) => {
      const adjustedDataUrl = event.target.result;
      
      if (!adjustedDataUrl) {
        console.error('❌ FileReader produced empty dataUrl');
        setRegularPhotos(prev => {
          const updated = [...prev];
          if (updated[newPhotoIndex]) {
            updated[newPhotoIndex] = {
              ...updated[newPhotoIndex],
              generating: false,
              error: 'Failed to process image'
            };
          }
          return updated;
        });
        return;
      }
      
      console.log('✅ Successfully created dataUrl from adjusted blob');
      
      // Update the photo with the adjusted data URL as placeholder
      setRegularPhotos(prev => {
        const updated = [...prev];
        if (updated[newPhotoIndex]) {
          updated[newPhotoIndex] = {
            ...updated[newPhotoIndex],
            originalDataUrl: adjustedDataUrl // Use adjusted version as placeholder
          };
        }
        return updated;
      });
      
      // Use the adjusted blob for generation
      generateFromBlob(adjustedBlob, newPhotoIndex, adjustedDataUrl, false, currentUploadedSource === 'camera' ? 'camera' : 'upload');
    });
    
    reader.readAsDataURL(adjustedBlob);
  };

  // Add this new function to handle cancellation of image adjusting
  const handleCancelAdjusting = () => {
    setShowImageAdjuster(false);
    
    // Clean up the URL object to prevent memory leaks
    if (currentUploadedImageUrl) {
      URL.revokeObjectURL(currentUploadedImageUrl);
    }
    
    // Reset the current image state
    setCurrentUploadedImageUrl('');
    
    // Show the start menu again
    setShowStartMenu(true);
  };

  // Add this to the component state declarations at the top

  // Handle thumbnail click to reopen the image adjuster
  const handleThumbnailClick = async () => {
    // If no lastCameraPhoto, load Einstein fallback
    if (!lastCameraPhoto || (!lastCameraPhoto.blob && !lastCameraPhoto.dataUrl)) {
      try {
        console.log('📷 Loading Einstein fallback for thumbnail click');
        const response = await fetch('/albert-einstein-sticks-out-his-tongue.jpg');
        if (!response.ok) throw new Error('Failed to load Einstein fallback');
        
        const blob = await response.blob();
        
        // Create the blob URL first - we'll reuse it for both pre-load and adjuster
        const tempUrl = URL.createObjectURL(blob);
        
        // Pre-load the image into browser cache before showing adjuster
        // This prevents race conditions on mobile Safari where canvas.toBlob() 
        // is called before the image fully decodes
        // IMPORTANT: We reuse the same blob URL to avoid memory leaks and ensure
        // the image data stays alive on mobile browsers
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            console.log('✅ Einstein image pre-loaded successfully');
            // Keep the image reference alive until adjuster is shown
            // by attaching it to window temporarily (mobile Safari workaround)
            window.__einsteinPreloadImg = img;
            resolve();
          };
          img.onerror = (error) => {
            console.error('❌ Einstein image pre-load failed:', error);
            URL.revokeObjectURL(tempUrl); // Clean up on error
            reject(error);
          };
          img.src = tempUrl;
        });
        
        // Einstein is just a fallback - don't save it to state
        // Only the adjusted version will be saved when user confirms
        setCurrentUploadedImageUrl(tempUrl);
        setCurrentUploadedSource('camera'); // Treat as camera source for UI
        setShowImageAdjuster(true);
        
        // Clean up the preload reference after a short delay
        // (enough time for ImageAdjuster to load the image)
        setTimeout(() => {
          delete window.__einsteinPreloadImg;
        }, 2000);
        
        return;
      } catch (error) {
        console.error('Failed to load Einstein fallback:', error);
        return;
      }
    }
    
    if (lastCameraPhoto.blob) {
      // We have the blob - can reopen the adjuster
      const newTempUrl = URL.createObjectURL(lastCameraPhoto.blob);
      setCurrentUploadedImageUrl(newTempUrl);
      setCurrentUploadedSource(lastCameraPhoto.source);
      setShowImageAdjuster(true);
    } else if (lastCameraPhoto.dataUrl) {
      // We have the dataUrl from localStorage - convert back to blob
      try {
        const response = await fetch(lastCameraPhoto.dataUrl);
        const blob = await response.blob();
        const newTempUrl = URL.createObjectURL(blob);
        
        // Update the lastCameraPhoto with the new blob for future use
        setLastCameraPhoto({
          ...lastCameraPhoto,
          blob: blob,
          imageUrl: newTempUrl
        });
        
        setCurrentUploadedImageUrl(newTempUrl);
        setCurrentUploadedSource(lastCameraPhoto.source);
        setShowImageAdjuster(true);
      } catch (error) {
        console.error('Failed to restore image from dataUrl:', error);
        alert('Failed to restore previous photo. Please take a new photo.');
        setLastCameraPhoto(null);
      }
    } else {
      // No usable image data
      console.warn('No usable image data found');
      setLastCameraPhoto(null);
    }
  };

  // Handle opening ImageAdjuster for next batch generation from PhotoGallery
  const handleOpenImageAdjusterForNextBatch = async () => {
    if (!lastAdjustedPhoto) {
      console.warn('No lastAdjustedPhoto available for next batch - loading Einstein fallback');
      // Load Einstein fallback just like handleThumbnailClick does
      try {
        console.log('📷 Loading Einstein fallback for next batch');
        const response = await fetch('/albert-einstein-sticks-out-his-tongue.jpg');
        if (!response.ok) throw new Error('Failed to load Einstein fallback');
        
        const blob = await response.blob();
        
        // Create the blob URL first - we'll reuse it for both pre-load and adjuster
        const tempUrl = URL.createObjectURL(blob);
        
        // Pre-load the image into browser cache before showing adjuster
        // This prevents race conditions on mobile Safari where canvas.toBlob() 
        // is called before the image fully decodes
        // IMPORTANT: We reuse the same blob URL to avoid memory leaks and ensure
        // the image data stays alive on mobile browsers
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            console.log('✅ Einstein image pre-loaded successfully');
            // Keep the image reference alive until adjuster is shown
            // by attaching it to window temporarily (mobile Safari workaround)
            window.__einsteinPreloadImg = img;
            resolve();
          };
          img.onerror = (error) => {
            console.error('❌ Einstein image pre-load failed:', error);
            URL.revokeObjectURL(tempUrl); // Clean up on error
            reject(error);
          };
          img.src = tempUrl;
        });
        
        // Einstein is just a fallback - don't save it to state
        // Only the adjusted version will be saved when user confirms
        setCurrentUploadedImageUrl(tempUrl);
        setCurrentUploadedSource('camera'); // Treat as camera source for UI
        setShowImageAdjuster(true);
        
        // Clean up the preload reference after a short delay
        // (enough time for ImageAdjuster to load the image)
        setTimeout(() => {
          delete window.__einsteinPreloadImg;
        }, 2000);
        
        return;
      } catch (error) {
        console.error('Failed to load Einstein fallback:', error);
        alert('Failed to load photo. Please take a new photo.');
        return;
      }
    }
    
    if (lastAdjustedPhoto.blob) {
      // We have the blob - can reopen the adjuster
      const newTempUrl = URL.createObjectURL(lastAdjustedPhoto.blob);
      setCurrentUploadedImageUrl(newTempUrl);
      setCurrentUploadedSource(lastAdjustedPhoto.source);
      setShowImageAdjuster(true);
    } else if (lastAdjustedPhoto.dataUrl) {
      // We have the dataUrl from localStorage - convert back to blob
      try {
        const response = await fetch(lastAdjustedPhoto.dataUrl);
        const blob = await response.blob();
        const newTempUrl = URL.createObjectURL(blob);
        
        // Update the lastAdjustedPhoto with the new blob for future use
        setLastAdjustedPhoto({
          ...lastAdjustedPhoto,
          blob: blob,
          imageUrl: newTempUrl
        });
        
        setCurrentUploadedImageUrl(newTempUrl);
        setCurrentUploadedSource(lastAdjustedPhoto.source);
        setShowImageAdjuster(true);
      } catch (error) {
        console.error('Failed to restore image from dataUrl:', error);
        alert('Failed to restore previous photo. Please take a new photo.');
        setLastAdjustedPhoto(null);
      }
    } else {
      // No usable image data
      console.warn('No usable image data found');
      setLastAdjustedPhoto(null);
    }
  };

  // Create stable references using useMemo to ensure they don't change
  const defaultPosition = useMemo(() => ({ x: 0, y: 0 }), []);
  const defaultScaleValue = 1;

  // -------------------------
  //   Render
  // -------------------------

  return (
    <>
      {/* Splash Screen */}
      {showSplashScreen ? (
        <>
          {console.log('🎬 RENDERING SplashScreen component')}
          <SplashScreen 
            bypassLocalStorage={splashTriggeredByInactivity}
            onDismiss={() => {
              console.log('🎬 Splash screen dismissed - will restart inactivity timer if enabled');
              setShowSplashScreen(false);
              setSplashTriggeredByInactivity(false); // Reset the flag
            }} 
          />
        </>
      ) : null}
      
      {/* PWA Install Prompt - Always rendered, handles its own timing and visibility */}
      <PWAInstallPrompt 
        onClose={() => setShowPWAPromptManually(false)}
        forceShow={showPWAPromptManually}
      />

      {/* Twitter Share Modal */}
      <TwitterShareModal 
        isOpen={showTwitterModal}
        onClose={() => setShowTwitterModal(false)}
        onShare={handleTwitterShare}
        imageUrl={twitterPhotoIndex !== null && photos[twitterPhotoIndex] ? photos[twitterPhotoIndex].images[0] : null}
        photoData={twitterPhotoIndex !== null ? photos[twitterPhotoIndex] : null}
        stylePrompts={stylePrompts}
        tezdevTheme={tezdevTheme}
        aspectRatio={aspectRatio}
        outputFormat={outputFormat}
      />




      {/* Global Countdown Overlay - always above mascot and all UI */}
      {countdown > 0 && (
        <div className="global-countdown-overlay" data-testid="global-countdown">
          {countdown}
        </div>
      )}
      
      {currentThought && 
        (/iphone|ipad|ipod|android/i.test(navigator.userAgent) === false) && 
        !showSplashScreen && 
        !showStartMenu && (
        <div style={{ 
          position: 'fixed', 
          bottom: '5px',
          ...currentThought.position,
          color: 'black', 
          fontWeight: 'bold',
          fontSize: '16px',
          padding: '5px', 
          zIndex: 99999,
          whiteSpace: 'nowrap'
        }}>
          {currentThought.text}
        </div>
      )}

      <div className="w-full h-screen photobooth-app"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ position: 'relative', zIndex: 1 }}
      >
        {/* Control overlay panel - Use context state/handlers */}
        <AdvancedSettings 
          visible={showControlOverlay}
          onClose={() => {
            setShowControlOverlay(false);
            setAutoFocusPositivePrompt(false);
          }}
          autoFocusPositivePrompt={autoFocusPositivePrompt}
          // Values from context settings
          positivePrompt={positivePrompt}
          stylePrompt={stylePrompt}
          negativePrompt={negativePrompt}
          seed={seed}
          selectedModel={selectedModel}
          numImages={numImages}
          promptGuidance={promptGuidance}
          guidance={guidance}
          controlNetStrength={controlNetStrength}
          controlNetGuidanceEnd={controlNetGuidanceEnd}
          inferenceSteps={inferenceSteps}
          scheduler={scheduler}
          timeStepSpacing={timeStepSpacing}
          flashEnabled={flashEnabled}
          keepOriginalPhoto={keepOriginalPhoto}
          aspectRatio={aspectRatio}
          tezdevTheme={tezdevTheme}
          // Handlers using updateSetting
          onPositivePromptChange={handlePositivePromptChange} 
          onStylePromptChange={(value) => updateSetting('stylePrompt', value)}
          onNegativePromptChange={(value) => updateSetting('negativePrompt', value)}
          onSeedChange={(value) => updateSetting('seed', value)}
          onModelSelect={(value) => updateSetting('selectedModel', value)}
          onNumImagesChange={(value) => updateSetting('numImages', value)}
          onPromptGuidanceChange={(value) => updateSetting('promptGuidance', value)}
          onGuidanceChange={(value) => updateSetting('guidance', value)}
          onControlNetStrengthChange={(value) => updateSetting('controlNetStrength', value)}
          // Remove incorrect setters, use updateSetting instead
          onControlNetGuidanceEndChange={(value) => updateSetting('controlNetGuidanceEnd', value)}
          onInferenceStepsChange={(value) => updateSetting('inferenceSteps', value)}
          onSchedulerChange={(value) => updateSetting('scheduler', value)}
          onTimeStepSpacingChange={(value) => updateSetting('timeStepSpacing', value)}
          onFlashEnabledChange={(value) => updateSetting('flashEnabled', value)}
          onKeepOriginalPhotoChange={(value) => updateSetting('keepOriginalPhoto', value)}
          onAspectRatioChange={(value) => {
            updateSetting('aspectRatio', value);
            saveSettingsToCookies({ aspectRatio: value });
          }}
          onTezDevThemeChange={async (value) => {
            updateSetting('tezdevTheme', value);
            saveSettingsToCookies({ tezdevTheme: value });
            
            // For dynamic themes, switch to their default aspect ratio
            if (value !== 'off') {
              try {
                const theme = await themeConfigService.getTheme(value);
                if (theme?.defaultAspectRatio) {
                  updateSetting('aspectRatio', theme.defaultAspectRatio);
                  saveSettingsToCookies({ aspectRatio: theme.defaultAspectRatio });
                  
                  // Update CSS variables to match the new aspect ratio
                  const aspectRatioMap = {
                    'ultranarrow': '768/1344',
                    'narrow': '832/1216',
                    'portrait': '896/1152',
                    'square': '1024/1024',
                    'landscape': '1152/896',
                    'wide': '1216/832',
                    'ultrawide': '1344/768'
                  };
                  const cssRatio = aspectRatioMap[theme.defaultAspectRatio] || '1024/1024';
                  document.documentElement.style.setProperty('--current-aspect-ratio', cssRatio);
                }
              } catch (error) {
                console.warn('Could not load theme default aspect ratio:', error);
              }
            }
          }}
          soundEnabled={soundEnabled}
          onSoundEnabledChange={(value) => {
            updateSetting('soundEnabled', value);
            saveSettingsToCookies({ soundEnabled: value });
          }}
          slothicornAnimationEnabled={slothicornAnimationEnabled}
          onSlothicornAnimationEnabledChange={(value) => {
            updateSetting('slothicornAnimationEnabled', value);
            saveSettingsToCookies({ slothicornAnimationEnabled: value });
          }}
          backgroundAnimationsEnabled={backgroundAnimationsEnabled}
          onBackgroundAnimationsEnabledChange={(value) => {
            updateSetting('backgroundAnimationsEnabled', value);
            saveSettingsToCookies({ backgroundAnimationsEnabled: value });
          }}
          outputFormat={outputFormat}
          onOutputFormatChange={(value) => {
            updateSetting('outputFormat', value);
            saveSettingsToCookies({ outputFormat: value });
          }}
          sensitiveContentFilter={sensitiveContentFilter}
          onSensitiveContentFilterChange={(value) => {
            updateSetting('sensitiveContentFilter', value);
            saveSettingsToCookies({ sensitiveContentFilter: value });
          }}
          showSplashOnInactivity={showSplashOnInactivity}
          onShowSplashOnInactivityChange={(value) => {
            updateSetting('showSplashOnInactivity', value);
            saveSettingsToCookies({ showSplashOnInactivity: value });
          }}
          onResetSettings={resetSettings} // Pass context reset function
          modelOptions={getModelOptions()} 
        />

        {/* Authentication Status - top-left corner */}
        {!showSplashScreen && currentPage !== 'prompts' && (
          <div 
            className="auth-status-wrapper"
            style={{
              position: 'fixed',
              top: 24,
              left: 24,
              zIndex: 1002,
              filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15))',
              transition: 'left 0.3s ease',
              display: 'flex',
              alignItems: 'center',
            }}>
            <AuthStatus 
              onPurchaseClick={authState.isAuthenticated && authState.authMode === 'frontend' ? () => setShowStripePurchase(true) : undefined}
              onSignupComplete={triggerSignupCelebration}
              textColor={showStartMenu ? "#000000" : "#ffffff"}
            />
          </div>
        )}

        {/* Settings and Tips buttons - show on start menu */}
        {!showPhotoGrid && !selectedPhotoIndex && showStartMenu && (
          <>
            <button
              className="header-settings-btn"
              onClick={() => setShowControlOverlay(!showControlOverlay)}
              style={{
                position: 'fixed',
                top: 24,
                right: 72, // Position it to the left of the help button
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
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
              }}
              title="Settings"
            >
              ⚙️
            </button>
            <button
              className="header-info-btn"
              onClick={toggleNotesModal}
              style={{
                position: 'fixed',
                top: 24,
                right: 24,
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
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
              }}
              title="Photobooth Tips"
            >
              ?
            </button>
          </>
        )}

        {/* Settings and Style Selector buttons - only show in live camera view (not splash or start menu) */}
        {!showPhotoGrid && !selectedPhotoIndex && !showStartMenu && (
          <>
            <button
              className="header-settings-btn"
              onClick={() => setShowControlOverlay(!showControlOverlay)}
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
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
              }}
              title="Settings"
            >
              ⚙️
            </button>
            {/* Camera View Style Selector Button */}
            <button
              className="camera-view-style-selector-button"
              onClick={() => setShowCameraStyleDropdown(prev => !prev)}
              title="Your selected vibe - Click to change"
            >
              <div className="camera-view-style-selector-content">
                {(() => {
                  // Generate the full gallery image path with fallback logic
                  // Skip special styles that don't have preview images
                  const isIndividualStyle = selectedStyle && 
                    !['custom', 'random', 'randomMix', 'oneOfEach', 'browseGallery', 'copyImageStyle'].includes(selectedStyle);
                  const folder = isIndividualStyle ? getPortraitFolderWithFallback(portraitType, selectedStyle, promptsDataRaw) : null;
                  const stylePreviewImage = isIndividualStyle && folder
                    ? `${urls.assetUrl}/gallery/prompts/${folder}/${generateGalleryFilename(selectedStyle)}`
                    : null;
                  return stylePreviewImage ? (
                    <img
                      src={stylePreviewImage}
                      alt={selectedStyle ? styleIdToDisplay(selectedStyle) : 'Style preview'}
                      className="camera-view-style-preview-image"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const fallbackIcon = e.currentTarget.nextElementSibling;
                        if (fallbackIcon && fallbackIcon.classList.contains('camera-view-style-icon-fallback')) {
                          fallbackIcon.style.display = 'block';
                        }
                      }}
                    />
                  ) : null;
                })()}
                <span className={`camera-view-style-icon ${selectedStyle && selectedStyle !== 'custom' ? 'camera-view-style-icon-fallback' : ''}`} style={selectedStyle && selectedStyle !== 'custom' ? { display: 'none' } : {}}>
                  🎨
                </span>
                <div className="camera-view-style-info">
                  <div className="camera-view-style-label">Selected vibe</div>
                  <div className="camera-view-style-text">
                    {selectedStyle === 'custom' ? 'Custom...' : selectedStyle ? styleIdToDisplay(selectedStyle) : 'Select Style'}
                  </div>
                </div>
              </div>
            </button>
          </>
        )}

        {/* Camera View Style Dropdown */}
        {!showPhotoGrid && !selectedPhotoIndex && !showStartMenu && showCameraStyleDropdown && (
          <StyleDropdown
            isOpen={showCameraStyleDropdown}
            onClose={() => setShowCameraStyleDropdown(false)}
            selectedStyle={selectedStyle}
            updateStyle={(style) => {
              updateSetting('selectedStyle', style);
            }}
            defaultStylePrompts={stylePrompts}
            setShowControlOverlay={() => {}}
            dropdownPosition="top"
            triggerButtonClass=".camera-view-style-selector-button"
            selectedModel={selectedModel}
            onModelSelect={(model) => {
              console.log('Camera View: Switching model to', model);
              if (switchToModel) {
                switchToModel(model);
              }
            }}
            portraitType={portraitType}
            onNavigateToVibeExplorer={() => {
              setShowPhotoGrid(true);
              setShowCameraStyleDropdown(false);
            }}
            slideInPanel={true}
          />
        )}
        
        {/* Studio lights - permanent background elements */}
        <div className="studio-lights-container">
          <img 
            src={light1Image} 
            alt="Studio Light" 
            className="studio-light left" 
          />
          <img 
            src={light2Image} 
            alt="Studio Light" 
            className="studio-light right" 
          />
        </div>
        
        {/* Drag overlay */}
        {dragActive && (
          <div className="drag-overlay">
            <p>Drop your image here to generate!</p>
          </div>
        )}

        {/* Info Modal */}
        {showInfoModal && (
          <div className="notes-modal-overlay" style={{zIndex: 30_000}} onClick={() => setShowInfoModal(false)}>
            <div className="notes-modal" onClick={e => e.stopPropagation()}>
              <div className="sticky-note">
                <button className="note-close" onClick={() => setShowInfoModal(false)}>×</button>
                <h2 className="marker-font">Photobooth Tips</h2>
                <ul className="marker-font">
                  <li>Generated compositions reuses the same face size, position, and orientation as the camera snapshot so step back and get creative!</li>
                  <li>Only one face at a time unless using Flux.1 Kontext! If multiple faces the biggest one in frame is used.</li>
                  <li>The more light / dark depth on your face the better, flat even light results can be subpar.</li>
                  <li>Try using the Custom Prompt feature and providing your own prompt!</li>
                  <li>You can even drag a photo into the camera window to use as a reference!</li>
                </ul>
                <div className="note-footer">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <a href="https://www.sogni.ai/sdk" target="_blank" rel="noopener noreferrer">
                      Vibe Coded with Sogni Client SDK<br/>Powered by Sogni Supernet ❤️
                    </a>
                    {/* Only show signup button if user is not logged in */}
                    {!authState.isAuthenticated && (
                      <button
                        onClick={() => {
                          setShowInfoModal(false);
                          setShowPromoPopup(true);
                        }}
                        className="signup-tip-button"
                        style={{
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          border: 'none',
                          color: 'white',
                          padding: '6px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                          textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                          whiteSpace: 'nowrap',
                          flexShrink: 0
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.transform = 'scale(1.05)';
                          e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                        }}
                        title="Get 125 free credits with Sogni!"
                      >
                        Signup? ✨
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main area with video - conditional rendering based on showPhotoGrid */}
        {renderMainArea()}

        {/* Conditionally render photo grid only if Sogni client is ready and NOT in Sample Gallery mode */}
        {showPhotoGrid && isSogniReady && sogniClient && currentPage !== 'prompts' && (
          <div className={`film-strip-container ${showPhotoGrid ? 'visible' : ''} ${window.extensionMode ? 'extension-mode' : ''}`} style={{
            background: window.extensionMode ? 'transparent' : undefined
          }}>
        <PhotoGallery
          photos={photos}
          selectedPhotoIndex={selectedPhotoIndex}
          setSelectedPhotoIndex={setSelectedPhotoIndex}
          showPhotoGrid={showPhotoGrid}
          handleBackToCamera={handleBackToMenu}
          handlePhotoViewerClick={handlePhotoViewerClick}
          handleGenerateMorePhotos={handleGenerateMorePhotos}
          handleOpenImageAdjusterForNextBatch={handleOpenImageAdjusterForNextBatch}
          handleShowControlOverlay={() => setShowControlOverlay(!showControlOverlay)}
          isGenerating={photos.some(photo => photo.generating)}
          keepOriginalPhoto={keepOriginalPhoto}
          lastPhotoData={lastPhotoData}
          activeProjectReference={activeProjectReference}
          isSogniReady={isSogniReady}
          toggleNotesModal={toggleNotesModal}
          setPhotos={setPhotosProxy}
          selectedStyle={selectedStyle}
          stylePrompts={stylePrompts}
          enhancePhoto={enhancePhoto}
          undoEnhancement={undoEnhancement}
          redoEnhancement={redoEnhancement}
          sogniClient={sogniClient}
          desiredWidth={desiredWidth}
          desiredHeight={desiredHeight}
          selectedSubIndex={selectedSubIndex}
          outputFormat={outputFormat}
          sensitiveContentFilter={sensitiveContentFilter}
          handleShareToX={handleShareToX}
          handleShareViaWebShare={handleShareViaWebShare}
          handleShareQRCode={handleKioskModeShare}
          slothicornAnimationEnabled={slothicornAnimationEnabled}
          backgroundAnimationsEnabled={backgroundAnimationsEnabled}
          tezdevTheme={tezdevTheme}
          aspectRatio={aspectRatio}
          handleRetryPhoto={handleRetryPhoto}
          handleRefreshPhoto={handleRefreshPhoto}
          onUseGalleryPrompt={handleUseGalleryPrompt}
          onPreGenerateFrame={handlePreGenerateFrameCallback}
          onFramedImageCacheUpdate={handleFramedImageCacheUpdate}
          onClearQrCode={() => {
            if (qrCodeData) {
              console.log('Clearing QR code due to image enhancement');
            }
            setQrCodeData(null);
          }}
          onClearMobileShareCache={() => {
            console.log('Clearing mobile share cache due to PhotoGallery request');
            setMobileShareCache({});
          }}
          onRegisterFrameCacheClear={(clearFunction) => {
            photoGalleryFrameClearRef.current = clearFunction;
          }}
          qrCodeData={qrCodeData}
          onCloseQR={() => setQrCodeData(null)}
          onOutOfCredits={() => {
            console.log('[ENHANCE] Triggering out of credits popup from PhotoGallery (main)');
            setShowOutOfCreditsPopup(true);
          }}
          numImages={numImages}
          authState={authState}
          onCopyImageStyleSelect={handleStyleReferenceUpload}
          styleReferenceImage={styleReferenceImage}
          onRemoveStyleReference={handleRemoveStyleReference}
          onEditStyleReference={handleEditStyleReference}
          updateStyle={handleUpdateStyle}
          switchToModel={switchToModel}
          onNavigateToVibeExplorer={handleNavigateToPromptSelector}
          selectedModel={selectedModel}
          portraitType={portraitType}
        />
          </div>
        )}

        <canvas ref={canvasReference} className="hidden" />

        {/* Slothicorn mascot with direct DOM manipulation */}
        {!showStartMenu && slothicornAnimationEnabled && (
          <div 
            ref={slothicornReference}
            className="slothicorn-container"
            style={{
              position: 'fixed',
              bottom: '-340px',
              left: '50%',
              transform: 'translateX(-50%) scale(1.5)',
              width: '200px',
              height: 'auto',
              zIndex: 5000,
              pointerEvents: 'none'
            }}
          >
            <img 
              src="/slothicorn-camera.png" 
              alt="Slothicorn mascot" 
              className="slothicorn-image" 
            />
          </div>
        )}

        {/* Camera shutter sound */}
        <audio ref={shutterSoundReference} preload="auto">
          <source src={clickSound} type="audio/mpeg" />
          Your browser does not support the audio element.
        </audio>

        {/* Camera wind sound */}
        <audio ref={cameraWindSoundReference} preload="auto">
          <source src={cameraWindSound} type="audio/mpeg" />
          Your browser does not support the audio element.
        </audio>

        {/* Hello sound */}
        {/*
        <audio ref={helloSoundReference} preload="auto">
          <source src={helloSound} type="audio/mpeg" />
          Your browser does not support the audio element.
        </audio>
        */}

        {/* Show photos button - only visible when we have photos and camera is shown */}
        {selectedPhotoIndex === null && !showPhotoGrid && photos.length > 0 && !showStartMenu && (
          <button
            onClick={() => {
              // Pre-scroll to top for smooth transition
              window.scrollTo(0, 0);
              // Stop camera when showing photo grid
              stopCamera();
              // Clean transition - explicitly ensure camera is hidden first
              setShowPhotoGrid(true);
              setShowStartMenu(false);
            }}
            className="view-photos-btn corner-btn"
          >
            <span className="view-photos-label">View Photos ({photos.length})</span>
          </button>
        )}
      </div>
      
      {/* Global flash overlay - covers the entire screen */}
      {showFlash && (
        <div 
          className="global-flash-overlay" 
            style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'white',
            zIndex: 99999,
            animation: 'fullScreenFlash 700ms ease-out' // Longer flash duration
          }}
        />
      )}


      {/* Promotional Popup */}
      <PromoPopup
        isOpen={showPromoPopup}
        onClose={handlePromoPopupClose}
      />

      {/* Out of Credits Popup */}
      <OutOfCreditsPopup
        isOpen={showOutOfCreditsPopup}
        onClose={handleOutOfCreditsPopupClose}
        onPurchase={authState.isAuthenticated && authState.authMode === 'frontend' ? () => setShowStripePurchase(true) : undefined}
        balances={balances}
        currentTokenType={walletTokenType}
        estimatedCost={lastJobCostEstimate}
        onSwitchPaymentMethod={switchPaymentMethod}
      />

      {/* Login Upsell Popup for non-authenticated users who've used their demo render */}
      <LoginUpsellPopup
        isOpen={showLoginUpsellPopup && currentPage !== 'prompts'}
        onClose={() => setShowLoginUpsellPopup(false)}
      />

      {/* Network Status Notification */}
      <NetworkStatus 
        onRetryAll={handleRetryAllPhotos} 
        connectionState={connectionState}
        isGenerating={isGenerating}
      />
      
      {/* Add this section at the end, right before the closing tag */}
      {showImageAdjuster && currentUploadedImageUrl && (
        <ImageAdjuster
          key={currentUploadedImageUrl}
          imageUrl={currentUploadedImageUrl}
          onConfirm={handleAdjustedImage}
          onCancel={handleCancelAdjusting}
          initialPosition={
            lastAdjustedPhoto?.adjustments?.position || defaultPosition
          }
          defaultScale={
            lastAdjustedPhoto?.adjustments?.scale || defaultScaleValue
          }
          numImages={numImages}
          stylePrompts={stylePrompts}
          onNavigateToVibeExplorer={handleNavigateToPromptSelector}
          photoSource={currentUploadedSource || lastAdjustedPhoto?.source || 'upload'}
          isCameraActive={!!(videoReference.current && videoReference.current.srcObject)}
          onTakeNewPhoto={async () => {
            // Close the current adjuster
            setShowImageAdjuster(false);
            if (currentUploadedImageUrl) {
              URL.revokeObjectURL(currentUploadedImageUrl);
            }
            setCurrentUploadedImageUrl('');
            
            // Check if we're currently viewing the photo grid
            // If we are, navigate to camera. Otherwise, just close adjuster (already in camera mode)
            if (showPhotoGrid) {
              // We're on the photo grid page, need to navigate to camera
              console.log('📷 Navigating from photo grid to camera to take new photo');
              
              // UI handles Einstein fallback automatically when lastCameraPhoto is null/empty
              
              // Hide photo gallery
              setShowPhotoGrid(false);
              setSelectedPhotoIndex(null);
              
              // Don't show start menu, just directly start the camera
              // Enumerate camera devices first
              await listCameras();
              
              // Start camera directly
              const preferredDeviceId = preferredCameraDeviceId || selectedCameraDeviceId;
              console.log('📹 Starting camera with preferred device:', preferredDeviceId || 'auto-select');
              await startCamera(preferredDeviceId);
              setCameraManuallyStarted(true);
            } else {
              // We're already in camera mode (adjuster was overlay on camera view)
              // Just close the adjuster and restart the camera for a new photo
              console.log('📷 Already in camera mode, restarting camera to take new photo');
              
              // Restart the camera (it was stopped after capture)
              setTimeout(async () => {
                const preferredDeviceId = preferredCameraDeviceId || selectedCameraDeviceId;
                await startCamera(preferredDeviceId);
              }, 100);
            }
          }}
          onUploadNew={() => {
            // Trigger file input to upload a new image
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.style.display = 'none';
            
            // Append to body for mobile compatibility
            document.body.appendChild(input);
            
            input.onchange = async (e) => {
              const file = e.target.files?.[0];
              
              // Clean up the input element
              document.body.removeChild(input);
              
              if (file) {
                // Check file size (17MB limit)
                if (file.size > 17 * 1024 * 1024) {
                  alert("Image must be less than 17MB.");
                  return;
                }
                
                // Close the current adjuster
                setShowImageAdjuster(false);
                if (currentUploadedImageUrl) {
                  URL.revokeObjectURL(currentUploadedImageUrl);
                }
                
                // Upload the new file (will reopen adjuster with new image)
                await handleBrowsePhotoOption(file);
              }
            };
            
            // Also handle cancel/close of file picker
            input.oncancel = () => {
              document.body.removeChild(input);
            };
            
            // Trigger click
            input.click();
          }}
        />
      )}

      {/* Style Reference Image Adjuster */}
      {showStyleReferenceAdjuster && currentUploadedImageUrl && (
        <ImageAdjuster
          key={`style-ref-${currentUploadedImageUrl}`}
          imageUrl={currentUploadedImageUrl}
          onConfirm={handleStyleReferenceConfirm}
          onCancel={() => {
            setShowStyleReferenceAdjuster(false);
            if (currentUploadedImageUrl) {
              URL.revokeObjectURL(currentUploadedImageUrl);
            }
            setCurrentUploadedImageUrl('');
          }}
          initialPosition={{ x: 0, y: 0 }}
          defaultScale={1}
          numImages={1}
          stylePrompts={stylePrompts}
          headerText="Adjust Your Style Reference"
          onNavigateToVibeExplorer={handleNavigateToPromptSelector}
          onUploadNew={() => {
            // Trigger file input to upload a new style reference image
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.style.display = 'none';
            
            // Append to body for mobile compatibility
            document.body.appendChild(input);
            
            input.onchange = async (e) => {
              const file = e.target.files?.[0];
              
              // Clean up the input element
              document.body.removeChild(input);
              
              if (file) {
                // Close the current adjuster
                setShowStyleReferenceAdjuster(false);
                // Upload the new file (will reopen adjuster with new image)
                await handleStyleReferenceUpload(file);
              }
            };
            
            // Also handle cancel/close of file picker
            input.oncancel = () => {
              document.body.removeChild(input);
            };
            
            // Trigger click
            input.click();
          }}
        />
      )}

      {/* Confetti Celebration */}
      <ConfettiCelebration 
        isVisible={showConfetti && backgroundAnimationsEnabled}
        onComplete={() => setShowConfetti(false)}
      />

      {/* Camera Permission Waiting Message */}
      {showPermissionMessage && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 10000,
            textAlign: 'center',
          }}
          data-testid="camera-permission-waiting"
        >
          {/* Slothicorn above message */}
          <div
            style={{
              marginBottom: '20px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
            }}
          >
            <img 
              src="/sloth_cam_hop_trnsparent.png" 
              alt="Sogni Sloth Camera" 
              style={{
                width: '180px',
                height: 'auto',
                objectFit: 'contain',
                filter: 'drop-shadow(0 6px 20px rgba(0, 0, 0, 0.2))',
                animation: 'sadFloat 3s ease-in-out infinite',
                pointerEvents: 'none',
              }}
            />
          </div>
          
          <div
            style={{
              color: 'white',
              fontSize: '24px',
              lineHeight: '1.6',
              fontFamily: 'Arial, sans-serif',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)',
            }}
          >
            <div>Allow Photobooth to access</div>
            <div>your camera to start</div>
            <div>your shoot!</div>
          </div>
        </div>
      )}

      {/* Camera Permission Denied Overlay */}
      {cameraPermissionDenied && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            zIndex: 10000,
            padding: '20px',
          }}
          data-testid="camera-permission-denied"
        >
          <div
            style={{
              color: 'white',
              fontSize: '20px',
              textAlign: 'center',
              maxWidth: '600px',
              lineHeight: '1.6',
              fontFamily: 'Arial, sans-serif',
            }}
          >
            <div style={{ fontSize: '24px', marginBottom: '20px', fontWeight: 'bold' }}>
              Camera Access Denied
            </div>
            <div style={{ marginBottom: '30px' }}>
              Photobooth needs camera access to take photos. Please allow camera access in your browser settings and refresh the page.
            </div>
            <button
              onClick={() => {
                setCameraPermissionDenied(false);
                setShowStartMenu(true);
              }}
              style={{
                backgroundColor: '#ff6b9d',
                color: 'white',
                border: 'none',
                padding: '12px 30px',
                fontSize: '16px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Back to Menu
            </button>
          </div>
        </div>
      )}

      {/* Stripe Purchase Modal */}
      {showStripePurchase && sogniClient && (
        <ApiProvider value={sogniClient}>
          <StripePurchase
            onClose={() => setShowStripePurchase(false)}
            showAlert={({ variant, title, text }) => {
              console.log(`${variant}: ${title} - ${text}`);
              // You can integrate with existing toast/notification system if available
              if (showToast) {
                showToast(text, variant === 'error' ? 'error' : 'success');
              }
            }}
          />
        </ApiProvider>
      )}
    </>
  );
};

export default App;

