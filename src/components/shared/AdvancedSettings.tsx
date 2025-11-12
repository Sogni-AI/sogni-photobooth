import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { AspectRatioOption, TezDevTheme, OutputFormat, Settings } from '../../types/index';
import { isFluxKontextModel, getModelRanges, getModelDefaults } from '../../constants/settings';
import { themeConfigService } from '../../services/themeConfig';
import { sanitizeUrl, getUrlValidationError } from '../../utils/urlValidation';
import { useSogniAuth } from '../../services/sogniAuth';
import { isMobile } from '../../utils/index';
import TagInput from './TagInput';

interface AdvancedSettingsProps {
  /** Whether the settings overlay is visible */
  visible: boolean;
  /** Handler for closing the settings overlay */
  onClose: () => void;
  /** Whether to auto-focus the positive prompt field when opened */
  autoFocusPositivePrompt?: boolean;
  /** Current style selection */
  selectedStyle?: string;
  /** Positive prompt text */
  positivePrompt?: string;
  /** Handler for positive prompt changes */
  onPositivePromptChange?: (prompt: string) => void;
  /** Style prompt text */
  stylePrompt?: string;
  /** Handler for style prompt changes */
  onStylePromptChange?: (prompt: string) => void;
  /** Negative prompt text */
  negativePrompt?: string;
  /** Handler for negative prompt changes */
  onNegativePromptChange?: (prompt: string) => void;
  /** Seed value */
  seed?: string;
  /** Handler for seed change */
  onSeedChange?: (seed: string) => void;
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
  /** Handler for guidance change */
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
  /** Sound enabled state */
  soundEnabled?: boolean;
  /** Handler for sound enabled change */
  onSoundEnabledChange?: (enabled: boolean) => void;
  /** Slothicorn animation enabled state */
  slothicornAnimationEnabled?: boolean;
  /** Handler for slothicorn animation enabled change */
  onSlothicornAnimationEnabledChange?: (enabled: boolean) => void;
  /** Background animations enabled state */
  backgroundAnimationsEnabled?: boolean;
  /** Handler for background animations enabled change */
  onBackgroundAnimationsEnabledChange?: (enabled: boolean) => void;
  /** Handler for settings reset */
  onResetSettings?: () => void;
  /** Current aspect ratio */
  aspectRatio?: AspectRatioOption;
  /** Handler for aspect ratio change */
  onAspectRatioChange?: (aspectRatio: AspectRatioOption) => void;
  /** Current TezDev theme */
  tezdevTheme?: TezDevTheme;
  /** Handler for TezDev theme change */
  onTezDevThemeChange?: (theme: TezDevTheme) => void;
  /** Current output format */
  outputFormat?: OutputFormat;
  /** Handler for output format change */
  onOutputFormatChange?: (format: OutputFormat) => void;
  /** Sensitive content filter enabled state */
  sensitiveContentFilter?: boolean;
  /** Handler for sensitive content filter change */
  onSensitiveContentFilterChange?: (enabled: boolean) => void;
  /** Show splash on inactivity state */
  showSplashOnInactivity?: boolean;
  /** Handler for show splash on inactivity change */
  onShowSplashOnInactivityChange?: (enabled: boolean) => void;
}

/**
 * AdvancedSettings component - reusable settings overlay for camera controls
 */
export const AdvancedSettings: React.FC<AdvancedSettingsProps> = (props) => {
  // Get current settings from context if not provided via props
  const appContext = useApp();
  const { settings, updateSetting: baseUpdateSetting, clearImageCaches } = appContext;
  
  // Get authentication state to check if user is logged in with frontend auth
  const authState = useSogniAuth();
  
  // Wrap updateSetting to pass auth state
  const updateSetting = React.useCallback((key: keyof Settings, value: any) => {
    baseUpdateSetting(key, value, authState.isAuthenticated);
  }, [baseUpdateSetting, authState.isAuthenticated]);
  
  // Ref for positive prompt textarea
  const positivePromptRef = useRef<HTMLTextAreaElement>(null);
  
  // State for dynamic themes
  const [availableThemes, setAvailableThemes] = useState<Array<{value: string, label: string, defaultAspectRatio?: string}>>([]);
  const [themesLoading, setThemesLoading] = useState(false);
  const [themesError, setThemesError] = useState<string | null>(null);
  
  // State for collapsible sections
  const [showPromptsSection, setShowPromptsSection] = useState(true); // Open by default
  const [showQRSection, setShowQRSection] = useState(false);
  const [showUISection, setShowUISection] = useState(false);
  const [showAdvancedSection, setShowAdvancedSection] = useState(false);
  
  // Debounced setting updates for QR settings
  const debouncedSizeUpdate = useRef<NodeJS.Timeout | null>(null);
  const debouncedMarginUpdate = useRef<NodeJS.Timeout | null>(null);
  const debouncedUrlUpdate = useRef<NodeJS.Timeout | null>(null);
  
  // Local state for real-time slider display and URL input
  const [localQRSize, setLocalQRSize] = useState(settings.sogniWatermarkSize ?? 100);
  const [localQRMargin, setLocalQRMargin] = useState(settings.sogniWatermarkMargin ?? 28);
  const [localQRUrl, setLocalQRUrl] = useState(settings.qrCodeUrl || 'https://qr.sogni.ai');
  const [qrUrlError, setQrUrlError] = useState<string>('');
  
  // Update local state when settings change from external sources
  useEffect(() => {
    setLocalQRSize(settings.sogniWatermarkSize ?? 100);
  }, [settings.sogniWatermarkSize]);
  
  useEffect(() => {
    setLocalQRMargin(settings.sogniWatermarkMargin ?? 26);
  }, [settings.sogniWatermarkMargin]);
  
  useEffect(() => {
    setLocalQRUrl(settings.qrCodeUrl || 'https://qr.sogni.ai');
  }, [settings.qrCodeUrl]);
  
  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (debouncedSizeUpdate.current) {
        clearTimeout(debouncedSizeUpdate.current);
      }
      if (debouncedMarginUpdate.current) {
        clearTimeout(debouncedMarginUpdate.current);
      }
      if (debouncedUrlUpdate.current) {
        clearTimeout(debouncedUrlUpdate.current);
      }
    };
  }, []);
  
  // Custom handlers for QR code settings that trigger cache clearing
  const handleSogniWatermarkChange = useCallback((enabled: boolean) => {
    updateSetting('sogniWatermark', enabled);
    // Note: updateSetting now automatically marks this as user-set
    
    // Clear caches immediately when toggling QR code overlay on/off
    clearImageCaches();
  }, [updateSetting, clearImageCaches]);
  
  const handleSogniWatermarkSizeChange = useCallback((size: number) => {
    // Update local state immediately for responsive UI
    setLocalQRSize(size);
    
    // Clear any existing timeout
    if (debouncedSizeUpdate.current) {
      clearTimeout(debouncedSizeUpdate.current);
    }
    
    // Debounce the actual setting update
    debouncedSizeUpdate.current = setTimeout(() => {
      updateSetting('sogniWatermarkSize', size);
      console.log('Debounced QR size update applied:', size);
    }, 300); // 300ms debounce for smooth slider interaction
  }, [updateSetting]);
  
  const handleSogniWatermarkMarginChange = useCallback((margin: number) => {
    // Update local state immediately for responsive UI
    setLocalQRMargin(margin);
    
    // Clear any existing timeout
    if (debouncedMarginUpdate.current) {
      clearTimeout(debouncedMarginUpdate.current);
    }
    
    // Debounce the actual setting update
    debouncedMarginUpdate.current = setTimeout(() => {
      updateSetting('sogniWatermarkMargin', margin);
      console.log('Debounced QR margin update applied:', margin);
    }, 300); // 300ms debounce for smooth slider interaction
  }, [updateSetting]);
  
  const handleQRUrlChange = useCallback((url: string) => {
    // Update local state immediately for responsive UI
    setLocalQRUrl(url);
    
    // Validate URL and show error if invalid
    const error = getUrlValidationError(url);
    setQrUrlError(error);
    
    // Clear any existing timeout
    if (debouncedUrlUpdate.current) {
      clearTimeout(debouncedUrlUpdate.current);
    }
    
    // Only update setting if URL is valid
    if (!error) {
      // Debounce the actual setting update
      debouncedUrlUpdate.current = setTimeout(() => {
        const sanitized = sanitizeUrl(url);
        if (sanitized) {
          updateSetting('qrCodeUrl', sanitized);
          // Clear caches when URL changes to regenerate QR code
           
          clearImageCaches();
          console.log('Debounced QR URL update applied:', sanitized);
        }
      }, 500); // 500ms debounce for URL input
    }
  }, [updateSetting, clearImageCaches]);

  const {
    visible,
    onClose,
    autoFocusPositivePrompt = false,
    positivePrompt = '',
    onPositivePromptChange,
    stylePrompt = '',
    onStylePromptChange,
    negativePrompt = '',
    onNegativePromptChange,
    seed = '',
    onSeedChange,
    modelOptions = [],
    selectedModel = '',
    onModelSelect,
    numImages,
    onNumImagesChange,
    promptGuidance,
    onPromptGuidanceChange,
    guidance,
    onGuidanceChange,
    controlNetStrength,
    onControlNetStrengthChange,
    controlNetGuidanceEnd,
    onControlNetGuidanceEndChange,
    inferenceSteps,
    onInferenceStepsChange,
    scheduler,
    onSchedulerChange,
    timeStepSpacing,
    onTimeStepSpacingChange,
    flashEnabled = true,
    onFlashEnabledChange,
    keepOriginalPhoto = false,
    onKeepOriginalPhotoChange,
    soundEnabled = true,
    onSoundEnabledChange,
    slothicornAnimationEnabled = true,
    onSlothicornAnimationEnabledChange,
    backgroundAnimationsEnabled = false,
    onBackgroundAnimationsEnabledChange,
    onResetSettings,
    aspectRatio,
    onAspectRatioChange,
    tezdevTheme,
    onTezDevThemeChange,
    outputFormat = 'jpg',
    onOutputFormatChange,
    sensitiveContentFilter = false,
    onSensitiveContentFilterChange,
    showSplashOnInactivity = false,
    onShowSplashOnInactivityChange,
  } = props;

  // Determine the current model for getting defaults and ranges
  const currentModel = selectedModel || settings.selectedModel || '';

  // Check if user is logged in with frontend auth to allow higher image limits and different defaults
  const isLoggedInWithFrontendAuth = authState.isAuthenticated && authState.authMode === 'frontend';
  const modelDefaults = getModelDefaults(currentModel, isLoggedInWithFrontendAuth);
  const modelRanges = getModelRanges(currentModel, isLoggedInWithFrontendAuth);

  // Auto-focus positive prompt when requested
  useEffect(() => {
    if (visible && autoFocusPositivePrompt && positivePromptRef.current) {
      // Small delay to ensure the overlay is fully rendered
      setTimeout(() => {
        positivePromptRef.current?.focus();
        positivePromptRef.current?.select();
      }, 150);
    }
  }, [visible, autoFocusPositivePrompt]);

  // Apply defaults to props that weren't provided
  const finalNumImages = numImages ?? modelDefaults.numImages ?? 8;
  
  // Effect to clamp numImages when auth state changes and limits change
  useEffect(() => {
    const maxImages = modelRanges.numImages?.max || 16;
    if (finalNumImages > maxImages) {
      onNumImagesChange?.(maxImages);
    }
  }, [isLoggedInWithFrontendAuth, currentModel, finalNumImages, modelRanges.numImages?.max, onNumImagesChange]);
  const finalPromptGuidance = promptGuidance ?? modelDefaults.promptGuidance ?? 2;
  const finalGuidance = guidance ?? modelDefaults.guidance ?? 3;
  const finalControlNetStrength = controlNetStrength ?? modelDefaults.controlNetStrength ?? 0.7;
  const finalControlNetGuidanceEnd = controlNetGuidanceEnd ?? modelDefaults.controlNetGuidanceEnd ?? 0.6;
  const finalInferenceSteps = inferenceSteps ?? modelDefaults.inferenceSteps ?? 7;
  const finalScheduler = scheduler ?? modelDefaults.scheduler ?? 'DPM++ SDE';
  const finalTimeStepSpacing = timeStepSpacing ?? modelDefaults.timeStepSpacing ?? 'Karras';

  // Check if current model is Flux.1 Kontext
  const isFluxKontext = isFluxKontextModel(currentModel);
  


  const currentAspectRatio = aspectRatio || settings.aspectRatio;
  const currentTezDevTheme = tezdevTheme || settings.tezdevTheme;
  const currentOutputFormat = outputFormat || settings.outputFormat;
  const currentSensitiveContentFilter = sensitiveContentFilter !== undefined ? sensitiveContentFilter : settings.sensitiveContentFilter;
  
  // State for collapsible Advanced Model Settings section
  const [showAdvancedModelSettings, setShowAdvancedModelSettings] = React.useState(false);

  const handleAspectRatioChange = (newAspectRatio: AspectRatioOption) => {
    // Use the provided handler or fallback to context
    if (onAspectRatioChange) {
      onAspectRatioChange(newAspectRatio);
    } else {
      updateSetting('aspectRatio', newAspectRatio);
    }
    
    // Update CSS variables to match the new aspect ratio
    switch (newAspectRatio) {
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
        break;
    }
  };

  const handleTezDevThemeChange = async (newTheme: TezDevTheme) => {
    // Use the provided handler or fallback to context
    if (onTezDevThemeChange) {
      onTezDevThemeChange(newTheme);
    } else {
      updateSetting('tezdevTheme', newTheme);
    }
    
    // For dynamic themes, switch to their default aspect ratio
    if (newTheme !== 'off') {
      try {
        const theme = await themeConfigService.getTheme(newTheme);
        if (theme && 'defaultAspectRatio' in theme && theme.defaultAspectRatio) {
          handleAspectRatioChange(theme.defaultAspectRatio as AspectRatioOption);
        }
      } catch (error) {
        console.warn('Could not load theme default aspect ratio:', error);
      }
    }
  };

  // Load themes when component mounts or when visible changes
  useEffect(() => {
    const loadThemes = async () => {
      if (!visible) return; // Only load when settings panel is open
      
      setThemesLoading(true);
      setThemesError(null);
      
      try {
        const themeOptions = await themeConfigService.getThemeOptions();
        setAvailableThemes(themeOptions);
        
        // Check if we should set a default theme on first load
        const defaultTheme = await themeConfigService.getDefaultTheme();
        if (defaultTheme && currentTezDevTheme === 'off') {
          void handleTezDevThemeChange(defaultTheme as TezDevTheme);
        }
      } catch (error) {
        console.error('Failed to load themes:', error);
        setThemesError('Failed to load themes');
        setAvailableThemes([]);
      } finally {
        setThemesLoading(false);
      }
    };

    void loadThemes();
  }, [visible, currentTezDevTheme]); // Reload when settings panel opens or theme changes


  const handleOutputFormatChange = (newFormat: OutputFormat) => {
    // Use the provided handler or fallback to context
    if (onOutputFormatChange) {
      onOutputFormatChange(newFormat);
    } else {
      updateSetting('outputFormat', newFormat);
    }
  };

  const handleSensitiveContentFilterChange = (enabled: boolean) => {
    // Use the provided handler or fallback to context
    if (onSensitiveContentFilterChange) {
      onSensitiveContentFilterChange(enabled);
    } else {
      updateSetting('sensitiveContentFilter', enabled);
    }
  };


  const handleShowSplashOnInactivityChange = (enabled: boolean) => {
    // Use the provided handler or fallback to context
    if (onShowSplashOnInactivityChange) {
      onShowSplashOnInactivityChange(enabled);
    } else {
      updateSetting('showSplashOnInactivity', enabled);
    }
  };

  return (
    <div className={`control-overlay ${visible ? 'visible' : ''}`} style={{ position: 'fixed', zIndex: 99999 }}>
      <div className="control-overlay-content">
        <h2 className="settings-title" data-text="Photobooth Settings">Photobooth Settings</h2>
        
        <button 
          className="dismiss-overlay-btn"
          onClick={onClose}
        >
          ×
        </button>

        {/* Aspect Ratio selector */}
        <div className="control-option">
          <label className="control-label">Aspect Ratio:</label>
          <div className="aspect-ratio-controls">
            <button 
              className={`aspect-ratio-button ${currentAspectRatio === 'ultranarrow' ? 'active' : ''}`}
              onClick={() => handleAspectRatioChange('ultranarrow')}
              title="Ultra Narrow (9:16)"
              aria-label="Set ultra narrow aspect ratio"
            >
              <svg viewBox="0 0 24 24" width="29" height="29" fill="none">
                <rect x="5.7" y="0" width="12.7" height="24" rx="0" fill="white" className="polaroid-frame" />
                <rect x="7.4" y="1.7" width="9.3" height="16.2" fill="black" />
                <text x="12" y="10" fill="white" fontSize="4.8" textAnchor="middle" dominantBaseline="middle">9:16</text>
              </svg>
            </button>
            <button 
              className={`aspect-ratio-button ${currentAspectRatio === 'narrow' ? 'active' : ''}`}
              onClick={() => handleAspectRatioChange('narrow')}
              title="Narrow (2:3)"
              aria-label="Set narrow aspect ratio"
            >
              <svg viewBox="0 0 24 24" width="29" height="29" fill="none">
                <rect x="4.7" y="0" width="14.6" height="24" rx="0" fill="white" className="polaroid-frame" />
                <rect x="6.4" y="1.7" width="11.3" height="16.5" fill="black" />
                <text x="12" y="10" fill="white" fontSize="4.8" textAnchor="middle" dominantBaseline="middle">2:3</text>
              </svg>
            </button>
            <button 
              className={`aspect-ratio-button ${currentAspectRatio === 'portrait' ? 'active' : ''}`}
              onClick={() => handleAspectRatioChange('portrait')}
              title="Portrait (3:4)"
              aria-label="Set portrait aspect ratio"
            >
              <svg viewBox="0 0 24 24" width="29" height="29" fill="none">
                <rect x="4.12" y="0" width="15.77" height="23.59" rx="0" fill="white" className="polaroid-frame" />
                <rect x="5.83" y="1.71" width="12.35" height="15.88" fill="black" />
                <text x="12" y="10" fill="white" fontSize="6" textAnchor="middle" dominantBaseline="middle">3:4</text>
              </svg>
            </button>
            <button 
              className={`aspect-ratio-button ${currentAspectRatio === 'square' ? 'active' : ''}`}
              onClick={() => handleAspectRatioChange('square')}
              title="Square (1:1)"
              aria-label="Set square aspect ratio"
            >
              <svg viewBox="0 0 24 24" width="29" height="29" fill="none">
                <rect x="3.29" y="1" width="17.42" height="21.71" rx="0" fill="white" className="polaroid-frame" />
                <rect x="5" y="2.71" width="14" height="14" fill="black" />
                <text x="12" y="10.5" fill="white" fontSize="6" textAnchor="middle" dominantBaseline="middle">1:1</text>
              </svg>
            </button>
            <button 
              className={`aspect-ratio-button ${currentAspectRatio === 'landscape' ? 'active' : ''}`}
              onClick={() => handleAspectRatioChange('landscape')}
              title="Landscape (4:3)"
              aria-label="Set landscape aspect ratio"
            >
              <svg viewBox="0 0 24 24" width="29" height="29" fill="none">
                <rect x="2.35" y="1.97" width="19.3" height="20.06" rx="0" fill="white" className="polaroid-frame" />
                <rect x="4.06" y="3.68" width="15.88" height="12.35" fill="black" />
                <text x="12" y="10" fill="white" fontSize="6" textAnchor="middle" dominantBaseline="middle">4:3</text>
              </svg>
            </button>
            <button 
              className={`aspect-ratio-button ${currentAspectRatio === 'wide' ? 'active' : ''}`}
              onClick={() => handleAspectRatioChange('wide')}
              title="Wide (3:2)"
              aria-label="Set wide aspect ratio"
            >
              <svg viewBox="0 0 24 24" width="29" height="29" fill="none">
                <rect x="1.8" y="2.4" width="20.4" height="19.3" rx="0" fill="white" className="polaroid-frame" />
                <rect x="3.5" y="4.1" width="16.9" height="11.6" fill="black" />
                <text x="12" y="10" fill="white" fontSize="4.8" textAnchor="middle" dominantBaseline="middle">3:2</text>
              </svg>
            </button>
            <button 
              className={`aspect-ratio-button ${currentAspectRatio === 'ultrawide' ? 'active' : ''}`}
              onClick={() => handleAspectRatioChange('ultrawide')}
              title="Ultra Wide (16:9)"
              aria-label="Set ultra wide aspect ratio"
            >
              <svg viewBox="0 0 24 24" width="29" height="29" fill="none">
                <rect x="2.2" y="3.5" width="19.6" height="17" rx="0" fill="white" className="polaroid-frame" />
                <rect x="3.9" y="5.2" width="16.2" height="9.3" fill="black" />
                <text x="12" y="10" fill="white" fontSize="4.8" textAnchor="middle" dominantBaseline="middle">16:9</text>
              </svg>
            </button>
          </div>
        </div>


        {/* Model selector with integrated advanced settings */}
        {modelOptions.length > 0 && (
          <div className="model-group">
            {/* Main Image Model selector */}
            <div className="control-option model-main">
              <label className="control-label">Image Model:</label>
              <select
                className="model-select"
                onChange={(e) => {
                  console.log(`AdvancedSettings: Model dropdown changed to ${e.target.value}`);
                  console.log(`AdvancedSettings: onModelSelect function exists:`, !!onModelSelect);
                  if (onModelSelect) {
                    console.log(`AdvancedSettings: Calling onModelSelect with ${e.target.value}`);
                    onModelSelect(e.target.value);
                  } else {
                    console.log(`AdvancedSettings: onModelSelect is null, using updateSetting instead`);
                    updateSetting('selectedModel', e.target.value);
                  }
                }}
                value={selectedModel}
              >
                {modelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Advanced toggle - seamlessly integrated */}
            <div className="advanced-toggle-wrapper">
              <button 
                className="advanced-toggle-subtle"
                onClick={() => setShowAdvancedModelSettings(!showAdvancedModelSettings)}
                type="button"
              >
                <span className="toggle-text">Advanced Settings</span>
                <span className={`toggle-chevron ${showAdvancedModelSettings ? 'expanded' : ''}`}>
                  ›
                </span>
              </button>
            </div>
            
            {/* Advanced settings - seamless subsection */}
            {showAdvancedModelSettings && (
              <div className="advanced-subsection">
                {/* Prompt Guidance slider - different ranges for different models */}
                {isFluxKontext ? (
                  <div className="advanced-control">
                    <label className="advanced-label">Prompt Guidance:</label>
                    <div className="advanced-input-group">
                      <input
                        type="range"
                        min={modelRanges.guidance?.min || 1}
                        max={modelRanges.guidance?.max || 5}
                        step={modelRanges.guidance?.step || 0.1}
                        value={finalGuidance}
                        onChange={(e) => onGuidanceChange?.(Number(e.target.value))}
                        className="advanced-slider"
                      />
                      <span className="advanced-value">{finalGuidance}</span>
                    </div>
                  </div>
                ) : (
                  <div className="advanced-control">
                    <label className="advanced-label">Prompt Guidance:</label>
                    <div className="advanced-input-group">
                      <input
                        type="range"
                        min={modelRanges.promptGuidance?.min || 1.8}
                        max={modelRanges.promptGuidance?.max || 3}
                        step={modelRanges.promptGuidance?.step || 0.1}
                        value={finalPromptGuidance}
                        onChange={(e) => onPromptGuidanceChange?.(Number(e.target.value))}
                        className="advanced-slider"
                      />
                      <span className="advanced-value">{finalPromptGuidance.toFixed(1)}</span>
                    </div>
                  </div>
                )}

                {/* ControlNet settings - only show for non-Flux models */}
                {!isFluxKontext && (
                  <>
                    {/* ControlNet Strength slider */}
                    <div className="advanced-control">
                      <label className="advanced-label">Instant ID Strength:</label>
                      <div className="advanced-input-group">
                        <input
                          type="range"
                          min={modelRanges.controlNetStrength?.min || 0.4}
                          max={modelRanges.controlNetStrength?.max || 1}
                          step={modelRanges.controlNetStrength?.step || 0.1}
                          value={finalControlNetStrength}
                          onChange={(e) => onControlNetStrengthChange?.(Number(e.target.value))}
                          className="advanced-slider"
                        />
                        <span className="advanced-value">{finalControlNetStrength.toFixed(1)}</span>
                      </div>
                    </div>

                    {/* ControlNet Guidance End slider */}
                    <div className="advanced-control">
                      <label className="advanced-label">Instant ID Impact Stop:</label>
                      <div className="advanced-input-group">
                        <input
                          type="range"
                          min={modelRanges.controlNetGuidanceEnd?.min || 0.2}
                          max={modelRanges.controlNetGuidanceEnd?.max || 0.8}
                          step={modelRanges.controlNetGuidanceEnd?.step || 0.1}
                          value={finalControlNetGuidanceEnd}
                          onChange={(e) => onControlNetGuidanceEndChange?.(Number(e.target.value))}
                          className="advanced-slider"
                        />
                        <span className="advanced-value">{finalControlNetGuidanceEnd.toFixed(1)}</span>
                      </div>
                    </div>
                  </>
                )}

                {/* Inference Steps slider - different ranges for different models */}
                <div className="advanced-control">
                  <label className="advanced-label">Inference Steps:</label>
                  <div className="advanced-input-group">
                    <input
                      type="range"
                      min={modelRanges.inferenceSteps?.min || (isFluxKontext ? 18 : 4)}
                      max={modelRanges.inferenceSteps?.max || (isFluxKontext ? 40 : 10)}
                      step={modelRanges.inferenceSteps?.step || 1}
                      value={finalInferenceSteps}
                      onChange={(e) => onInferenceStepsChange?.(Number(e.target.value))}
                      className="advanced-slider"
                    />
                    <span className="advanced-value">{finalInferenceSteps}</span>
                  </div>
                </div>

                {/* Scheduler selector */}
                <div className="advanced-control">
                  <label className="advanced-label">Scheduler:</label>
                  <select
                    className="advanced-select"
                    onChange={(e) => onSchedulerChange?.(e.target.value)}
                    value={finalScheduler}
                  >
                    {(modelRanges.schedulerOptions || []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Time Step Spacing selector */}
                <div className="advanced-control">
                  <label className="advanced-label">Time Step Spacing:</label>
                  <select
                    className="advanced-select"
                    onChange={(e) => onTimeStepSpacingChange?.(e.target.value)}
                    value={finalTimeStepSpacing}
                  >
                    {(modelRanges.timeStepSpacingOptions || []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Number of images slider */}
        <div className="control-option">
          <label className="control-label">Number of Images:</label>
          <input
            type="range"
            min={modelRanges.numImages?.min || 1}
            max={modelRanges.numImages?.max || (isFluxKontext ? 8 : (isMobile() ? 16 : 32))}
            step={modelRanges.numImages?.step || 1}
            value={finalNumImages}
            onChange={(e) => onNumImagesChange?.(Number(e.target.value))}
            className="slider-input"
          />
          <span className="slider-value">{finalNumImages}</span>
        </div>
      
        {/* Prompts & Creativity Section - Collapsible */}
        <div className="settings-section-group">
          <div className="advanced-toggle-wrapper">
            <button 
              className="advanced-toggle-subtle"
              onClick={() => setShowPromptsSection(!showPromptsSection)}
              type="button"
            >
              <span className="toggle-text">Prompts & Creativity</span>
              <span className={`toggle-chevron ${showPromptsSection ? 'expanded' : ''}`}>
                ›
              </span>
            </button>
          </div>
          
          {showPromptsSection && (
            <div className="advanced-subsection">
              {/* Positive Prompt */}
              <div className="control-option">
                <label className="control-label" style={{
                  color: autoFocusPositivePrompt ? '#3b82f6' : undefined,
                  fontWeight: autoFocusPositivePrompt ? '600' : undefined
                }}>
                  Positive Prompt: {autoFocusPositivePrompt && <span style={{ color: '#3b82f6', fontSize: '12px' }}>✨ Ready to edit</span>}
                </label>
                <textarea
                  ref={positivePromptRef}
                  className="custom-style-input"
                  placeholder="Describe what you want to see..."
                  value={positivePrompt}
                  onChange={(e) => onPositivePromptChange?.(e.target.value)}
                  rows={3}
                  style={{
                    border: autoFocusPositivePrompt ? '2px solid #3b82f6' : undefined,
                    boxShadow: autoFocusPositivePrompt ? '0 0 0 3px rgba(59, 130, 246, 0.1)' : undefined,
                    transition: 'all 0.2s ease'
                  }}
                  autoComplete="off"
                  autoCapitalize="off"
                  data-form-type="other"
                />
              </div>

              {/* Style Prompt */}
              <div className="control-option">
                <label className="control-label">Style Prompt:</label>
                <textarea
                  className="custom-style-input"
                  placeholder="Additional style modifier (optional, appended to positive prompt)"
                  value={stylePrompt}
                  onChange={(e) => onStylePromptChange?.(e.target.value)}
                  rows={2}
                  autoComplete="off"
                  autoCapitalize="off"
                  data-form-type="other"
                />
              </div>

              {/* Negative Prompt */}
              <div className="control-option">
                <label className="control-label">Negative Prompt:</label>
                <textarea
                  className="custom-style-input"
                  placeholder="lowres, worst quality, low quality"
                  value={negativePrompt}
                  onChange={(e) => onNegativePromptChange?.(e.target.value)}
                  rows={2}
                  autoComplete="off"
                  autoCapitalize="off"
                  data-form-type="other"
                />
              </div>

              {/* Seed */}
              <div className="control-option">
                <label className="control-label">Seed (leave blank for random):</label>
                <input
                  type="number"
                  min={0}
                  max={4294967295}
                  className="custom-style-input"
                  placeholder="Random"
                  value={seed}
                  onChange={(e) => onSeedChange?.(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>


        {/* Sensitive Content Filter toggle */}
        <div className="control-option checkbox">
          <input
            type="checkbox"
            id="sensitive-content-filter-toggle"
            checked={currentSensitiveContentFilter}
            onChange={(e) => handleSensitiveContentFilterChange(e.target.checked)}
          />
          <label htmlFor="sensitive-content-filter-toggle" className="control-label">Sensitive Content Filter</label>
        </div>

        {/* QR Code & Watermark Section - Collapsible */}
        <div className="settings-section-group">
          <div className="advanced-toggle-wrapper">
            <button 
              className="advanced-toggle-subtle"
              onClick={() => setShowQRSection(!showQRSection)}
              type="button"
            >
              <span className="toggle-text">QR Code & Watermark</span>
              <span className={`toggle-chevron ${showQRSection ? 'expanded' : ''}`}>
                ›
              </span>
            </button>
          </div>
          
          {showQRSection && (
            <div className="advanced-subsection">
              {/* QR Code Watermark toggle */}
              <div className="control-option checkbox">
                <input
                  type="checkbox"
                  id="sogni-watermark-toggle"
                  checked={settings.sogniWatermark}
                  onChange={(e) => handleSogniWatermarkChange(e.target.checked)}
                />
                <label htmlFor="sogni-watermark-toggle" className="control-label">Overlay QR Code</label>
              </div>

              {/* QR Code Size - only show when watermark is enabled */}
              {settings.sogniWatermark && (
                <div className="control-option">
                  <label htmlFor="qr-size-slider" className="control-label">QR Code Size: {localQRSize}px</label>
                  <input
                    type="range"
                    id="qr-size-slider"
                    min="50"
                    max="150"
                    step="5"
                    value={localQRSize}
                    onChange={(e) => handleSogniWatermarkSizeChange(parseInt(e.target.value) || 94)}
                    className="slider"
                  />
                </div>
              )}

              {/* QR Code Margin - only show when watermark is enabled */}
              {settings.sogniWatermark && (
                <div className="control-option">
                  <label htmlFor="qr-margin-slider" className="control-label">QR Code Margin: {localQRMargin}px</label>
                  <input
                    type="range"
                    id="qr-margin-slider"
                    min="0"
                    max="100"
                    step="1"
                    value={localQRMargin}
                    onChange={(e) => handleSogniWatermarkMarginChange(parseInt(e.target.value) || 16)}
                    className="slider"
                  />
                </div>
              )}

              {/* QR Code Margin Starts Inside Frame toggle - only show when watermark is enabled */}
              {settings.sogniWatermark && (
                <div className="control-option checkbox">
                  <input
                    type="checkbox"
                    id="qr-margin-inside-frame-toggle"
                    checked={settings.qrCodeMarginStartsInsideFrame ?? false}
                    onChange={(e) => {
                      updateSetting('qrCodeMarginStartsInsideFrame', e.target.checked);
                      // Clear caches when positioning logic changes to regenerate QR code
                      clearImageCaches();
                    }}
                  />
                  <label htmlFor="qr-margin-inside-frame-toggle" className="control-label">QR Code Margin Starts Inside Frame</label>
                </div>
              )}

              {/* QR Code URL - only show when watermark is enabled */}
              {settings.sogniWatermark && (
                <div className="control-option">
                  <label htmlFor="qr-url-input" className="control-label">QR Code URL</label>
                  <input
                    type="url"
                    id="qr-url-input"
                    value={localQRUrl}
                    onChange={(e) => handleQRUrlChange(e.target.value)}
                    placeholder="https://example.com"
                    className={`url-input ${qrUrlError ? 'error' : ''}`}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: qrUrlError ? '2px solid #ff4444' : '2px solid #333',
                      borderRadius: '6px',
                      backgroundColor: '#1a1a1a',
                      color: '#fff',
                      fontSize: '14px',
                      fontFamily: 'monospace'
                    }}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    data-form-type="other"
                  />
                  {qrUrlError && (
                    <div className="error-message" style={{
                      color: '#ff4444',
                      fontSize: '12px',
                      marginTop: '4px',
                      fontStyle: 'italic'
                    }}>
                      {qrUrlError}
                    </div>
                  )}
                </div>
              )}

              {/* QR Code Position - only show when watermark is enabled */}
              {settings.sogniWatermark && (
                <div className="control-option">
                  <label className="control-label">QR Code Position:</label>
                  <select
                    className="model-select"
                    onChange={(e) => {
                      const position = e.target.value as 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
                      updateSetting('sogniWatermarkPosition', position);
                      // Clear caches when position changes to regenerate QR code
                      clearImageCaches();
                    }}
                    value={settings.sogniWatermarkPosition || 'top-right'}
                  >
                    <option value="top-right">Top Right</option>
                    <option value="top-left">Top Left</option>
                    <option value="bottom-right">Bottom Right</option>
                    <option value="bottom-left">Bottom Left</option>
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* UI & Effects Section - Collapsible */}
        <div className="settings-section-group">
          <div className="advanced-toggle-wrapper">
            <button 
              className="advanced-toggle-subtle"
              onClick={() => setShowUISection(!showUISection)}
              type="button"
            >
              <span className="toggle-text">UI & Effects</span>
              <span className={`toggle-chevron ${showUISection ? 'expanded' : ''}`}>
                ›
              </span>
            </button>
          </div>
          
          {showUISection && (
            <div className="advanced-subsection">
              {/* Flash toggle */}
              <div className="control-option checkbox">
                <input
                  type="checkbox"
                  id="flash-toggle"
                  checked={flashEnabled}
                  onChange={(e) => onFlashEnabledChange?.(e.target.checked)}
                />
                <label htmlFor="flash-toggle" className="control-label">Flash</label>
              </div>

              {/* Keep original photo toggle */}
              <div className="control-option checkbox">
                <input
                  type="checkbox"
                  id="keep-original-toggle"
                  checked={keepOriginalPhoto}
                  onChange={(e) => onKeepOriginalPhotoChange?.(e.target.checked)}
                />
                <label htmlFor="keep-original-toggle" className="control-label">Show Original Image In Gallery</label>
              </div>
              
              {/* Sound toggle */}
              <div className="control-option checkbox">
                <input
                  type="checkbox"
                  id="sound-toggle"
                  checked={soundEnabled}
                  onChange={(e) => onSoundEnabledChange?.(e.target.checked)}
                />
                <label htmlFor="sound-toggle" className="control-label">Sound Effects</label>
              </div>
              
              {/* Slothicorn Animation toggle */}
              <div className="control-option checkbox">
                <input
                  type="checkbox"
                  id="slothicorn-toggle"
                  checked={slothicornAnimationEnabled}
                  onChange={(e) => onSlothicornAnimationEnabledChange?.(e.target.checked)}
                />
                <label htmlFor="slothicorn-toggle" className="control-label">Slothicorn Animation</label>
              </div>
              
              {/* Background Animations toggle */}
              <div className="control-option checkbox">
                <input
                  type="checkbox"
                  id="background-animations-toggle"
                  checked={backgroundAnimationsEnabled}
                  onChange={(e) => onBackgroundAnimationsEnabledChange?.(e.target.checked)}
                />
                <label htmlFor="background-animations-toggle" className="control-label">Background Animations</label>
              </div>
            </div>
          )}
        </div>
        
        {/* Advanced Features Section - Collapsible */}
        <div className="settings-section-group">
          <div className="advanced-toggle-wrapper">
            <button 
              className="advanced-toggle-subtle"
              onClick={() => setShowAdvancedSection(!showAdvancedSection)}
              type="button"
            >
              <span className="toggle-text">Advanced Features</span>
              <span className={`toggle-chevron ${showAdvancedSection ? 'expanded' : ''}`}>
                ›
              </span>
            </button>
          </div>
          
          {showAdvancedSection && (
            <div className="advanced-subsection">
              {/* Event Theme selector */}
              <div className="control-option">
                <label className="control-label">Event Theme:</label>
                {themesLoading ? (
                  <div className="model-select" style={{ color: '#666', fontStyle: 'italic' }}>
                    Loading themes...
                  </div>
                ) : themesError ? (
                  <div className="model-select" style={{ color: '#666', fontStyle: 'italic' }}>
                    No themes available
                  </div>
                ) : (
                  <select
                    className="model-select"
                    onChange={(e) => void handleTezDevThemeChange(e.target.value as TezDevTheme)}
                    value={currentTezDevTheme}
                  >
                    {availableThemes.map(theme => (
                      <option key={theme.value} value={theme.value}>
                        {theme.label}
                      </option>
                    ))}
                    <option value="off">Off</option>
                  </select>
                )}
              </div>

              {/* Output Type selector */}
              <div className="control-option">
                <label className="control-label">Output Type:</label>
                <select
                  className="model-select"
                  onChange={(e) => handleOutputFormatChange(e.target.value as OutputFormat)}
                  value={currentOutputFormat}
                >
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                </select>
              </div>

              {/* Worker Preferences - Show all options when user is logged in with frontend auth (spending own credits) */}
              {authState.isAuthenticated && authState.authMode === 'frontend' && (
                <>
                  <div className="control-option worker-preference-section">
                    <label className="control-label">Required Workers</label>
                    <TagInput
                      tags={settings.requiredWorkers}
                      onTagsChange={(tags) => updateSetting('requiredWorkers', tags)}
                      placeholder="Type worker name and press Enter..."
                    />
                    <div className="control-description">
                      Only these workers will be used for processing your images
                    </div>
                  </div>

                  <div className="control-option worker-preference-section">
                    <label className="control-label">Preferred Workers</label>
                    <TagInput
                      tags={settings.preferWorkers}
                      onTagsChange={(tags) => updateSetting('preferWorkers', tags)}
                      placeholder="Type worker name and press Enter..."
                    />
                    <div className="control-description">
                      These workers will be prioritized when processing your images
                    </div>
                  </div>
                </>
              )}

              <div className="control-option worker-preference-section">
                <label className="control-label">Skip Workers</label>
                <TagInput
                  tags={settings.skipWorkers}
                  onTagsChange={(tags) => updateSetting('skipWorkers', tags)}
                  placeholder="Type worker name and press Enter..."
                />
                <div className="control-description">
                  These workers will be avoided when processing your images
                </div>
              </div>

              {/* Show Splash on Inactivity toggle */}
              <div className="control-option checkbox">
                <input
                  type="checkbox"
                  id="splash-inactivity-toggle"
                  checked={showSplashOnInactivity || settings.showSplashOnInactivity}
                  onChange={(e) => handleShowSplashOnInactivityChange(e.target.checked)}
                />
                <label htmlFor="splash-inactivity-toggle" className="control-label">Show Splash Screen on Inactivity</label>
              </div>
            </div>
          )}
        </div>
        
        {/* Reset settings button */}
        <div className="control-option reset-option">
          <button 
            className="reset-settings-btn"
            onClick={onResetSettings}
          >
            Reset to Defaults
          </button>
        </div>
        
        {/* Version information and Analytics button */}
        <div className="version-info">
          <span>Sogni Photobooth v{import.meta.env.APP_VERSION || '1.0.1'}</span>
          <button 
            className="view-analytics-btn"
            onClick={() => window.location.hash = '#analytics'}
            title="View Analytics Dashboard"
          >
            📊 View Analytics
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdvancedSettings; 