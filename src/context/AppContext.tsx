import React, { createContext, useContext, useState, useRef, useMemo } from 'react';

import { Photo, ProjectState, Settings } from '../types/index';
import { DEFAULT_SETTINGS, getModelDefaults, isFluxKontextModel, DEFAULT_MODEL_ID } from '../constants/settings';
import { getSettingFromCookie, saveSettingsToCookies, getSettingsForModel, saveModelSpecificSettings } from '../utils/cookies';

// Helper function to handle TezDev theme cookie migration
const getTezDevThemeFromCookie = () => {
  const savedTheme = getSettingFromCookie('tezdevTheme', DEFAULT_SETTINGS.tezdevTheme);
  
  // Check if we've already performed the one-time migration
  const migrationCompleted = localStorage.getItem('sogni_theme_migration_v2');
  
  if (!migrationCompleted) {
    // This is the one-time migration - reset any existing theme to 'off'
    if (savedTheme === 'supercasual') {
      // Save the new default and mark migration as completed
      saveSettingsToCookies({ tezdevTheme: 'off' });
      localStorage.setItem('sogni_theme_migration_v2', 'completed');
      return 'off';
    }
    // Even if they had 'off' already, mark migration as completed so we don't check again
    localStorage.setItem('sogni_theme_migration_v2', 'completed');
  }
  
  return savedTheme;
};

interface LoadedImagesState {
  [key: string]: {
    ref?: boolean;
    gen?: boolean;
  };
}

interface AppContextType {
  // Photos
  photos: Photo[];
  setPhotos: React.Dispatch<React.SetStateAction<Photo[]>>;
  selectedPhotoIndex: number | null;
  setSelectedPhotoIndex: React.Dispatch<React.SetStateAction<number | null>>;
  
  // Image Loading State
  loadedImages: LoadedImagesState;
  setLoadedImages: React.Dispatch<React.SetStateAction<LoadedImagesState>>;
  
  // Settings
  settings: Settings;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  switchToModel: (modelId: string) => void;
  resetSettings: () => void;
  
  // Style Dropdown
  showStyleDropdown: boolean;
  setShowStyleDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Project State
  projectState: ProjectState;
  
  // UI State
  showInfoModal: boolean;
  setShowInfoModal: React.Dispatch<React.SetStateAction<boolean>>;
  showPhotoGrid: boolean;
  setShowPhotoGrid: React.Dispatch<React.SetStateAction<boolean>>;
  dragActive: boolean;
  setDragActive: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Cache clearing functions
  clearImageCaches: () => void;
  registerCacheClearingCallback: (callback: () => void) => () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {

  
  // Photos state
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  
  // Image loading state
  const [loadedImages, setLoadedImages] = useState<LoadedImagesState>({});
  
  // Style dropdown state
  const [showStyleDropdown, setShowStyleDropdown] = useState(false);
  
  // Settings state
  const [settings, setSettings] = useState<Settings>(() => {
    const theme = getTezDevThemeFromCookie();
    const aspectRatio = getSettingFromCookie('aspectRatio', DEFAULT_SETTINGS.aspectRatio);
    let selectedModel = getSettingFromCookie('selectedModel', DEFAULT_SETTINGS.selectedModel);
    let selectedStyle = getSettingFromCookie('selectedStyle', DEFAULT_SETTINGS.selectedStyle);
    let positivePrompt = getSettingFromCookie('positivePrompt', DEFAULT_SETTINGS.positivePrompt);
    
    // Always reset to default model on page reload
    // Users must explicitly select a different model in each session
    if (selectedModel !== DEFAULT_MODEL_ID) {
      console.log(`🔄 [INIT] Resetting model from ${selectedModel} to default (${DEFAULT_MODEL_ID})`);
      selectedModel = DEFAULT_MODEL_ID;
      
      // Save to cookies and also ensure model-specific settings are loaded for default model
      saveSettingsToCookies({ selectedModel: DEFAULT_MODEL_ID });
      const defaultModelSettings = getSettingsForModel(DEFAULT_MODEL_ID);
      saveModelSpecificSettings(DEFAULT_MODEL_ID, defaultModelSettings);
      console.log('🔄 [INIT] Saved default model settings:', defaultModelSettings);
      
      // Clear any cached Flux Kontext model-specific settings to prevent conflicts
      try {
        localStorage.removeItem('sogni_model_flux1-dev-kontext_fp8_scaled');
        console.log('🔄 [INIT] Cleared Flux Kontext model cache');
      } catch (e) {
        console.warn('Failed to clear Flux Kontext cache:', e);
      }
      
      // Also reset copyImageStyle to randomMix when resetting the model
      // This ensures they're in sync
      if (selectedStyle === 'copyImageStyle') {
        console.log('🔄 [INIT] Also resetting style from Copy Image Style to Random: All (model was reset)');
        selectedStyle = 'randomMix';
        saveSettingsToCookies({ selectedStyle });
      }
    }
    
    // Reset custom prompt to blank on page load (but preserve if style is 'custom')
    if (positivePrompt && positivePrompt.trim() !== '' && selectedStyle !== 'custom') {
      console.log('🔄 [INIT] Resetting custom prompt to blank');
      positivePrompt = '';
      saveSettingsToCookies({ positivePrompt });
    }
    
    // Always load customSceneName from cookies (don't reset it)
    // This allows users to reuse their previous scene name when creating new custom prompts
    let customSceneName = getSettingFromCookie('customSceneName', DEFAULT_SETTINGS.customSceneName) as string;
    
    // Get model-specific settings for the (possibly reset) model
    const modelSettings = getSettingsForModel(selectedModel);
    
    return {
      selectedStyle,
      selectedModel,
      positivePrompt,
      customSceneName,
      numImages: modelSettings.numImages || DEFAULT_SETTINGS.numImages,
      promptGuidance: modelSettings.promptGuidance || DEFAULT_SETTINGS.promptGuidance,
      controlNetStrength: getSettingFromCookie('controlNetStrength', DEFAULT_SETTINGS.controlNetStrength),
      controlNetGuidanceEnd: getSettingFromCookie('controlNetGuidanceEnd', DEFAULT_SETTINGS.controlNetGuidanceEnd),
      inferenceSteps: modelSettings.inferenceSteps || DEFAULT_SETTINGS.inferenceSteps,
      scheduler: modelSettings.scheduler || DEFAULT_SETTINGS.scheduler,
      timeStepSpacing: modelSettings.timeStepSpacing || DEFAULT_SETTINGS.timeStepSpacing,
      guidance: modelSettings.guidance || DEFAULT_SETTINGS.guidance,
      flashEnabled: getSettingFromCookie('flashEnabled', DEFAULT_SETTINGS.flashEnabled),
      keepOriginalPhoto: getSettingFromCookie('keepOriginalPhoto', DEFAULT_SETTINGS.keepOriginalPhoto),
      stylePrompt: getSettingFromCookie('stylePrompt', DEFAULT_SETTINGS.stylePrompt),
      negativePrompt: getSettingFromCookie('negativePrompt', DEFAULT_SETTINGS.negativePrompt),
      seed: getSettingFromCookie('seed', DEFAULT_SETTINGS.seed),
      soundEnabled: getSettingFromCookie('soundEnabled', DEFAULT_SETTINGS.soundEnabled || true),
      slothicornAnimationEnabled: getSettingFromCookie('slothicornAnimationEnabled', DEFAULT_SETTINGS.slothicornAnimationEnabled || true),
      backgroundAnimationsEnabled: getSettingFromCookie('backgroundAnimationsEnabled', DEFAULT_SETTINGS.backgroundAnimationsEnabled || false),
      aspectRatio,
      tezdevTheme: theme,
      outputFormat: getSettingFromCookie('outputFormat', DEFAULT_SETTINGS.outputFormat),
      sensitiveContentFilter: getSettingFromCookie('sensitiveContentFilter', DEFAULT_SETTINGS.sensitiveContentFilter),
      preferredCameraDeviceId: getSettingFromCookie('preferredCameraDeviceId', DEFAULT_SETTINGS.preferredCameraDeviceId),
      kioskMode: getSettingFromCookie('kioskMode', DEFAULT_SETTINGS.kioskMode),
      sogniWatermark: getSettingFromCookie('sogniWatermark', DEFAULT_SETTINGS.sogniWatermark),
      sogniWatermarkSize: getSettingFromCookie('sogniWatermarkSize', DEFAULT_SETTINGS.sogniWatermarkSize),
      sogniWatermarkMargin: getSettingFromCookie('sogniWatermarkMargin', DEFAULT_SETTINGS.sogniWatermarkMargin),
      sogniWatermarkPosition: getSettingFromCookie('sogniWatermarkPosition', DEFAULT_SETTINGS.sogniWatermarkPosition),
      // Worker preferences
      requiredWorkers: getSettingFromCookie('requiredWorkers', DEFAULT_SETTINGS.requiredWorkers),
      preferWorkers: getSettingFromCookie('preferWorkers', DEFAULT_SETTINGS.preferWorkers),
      skipWorkers: getSettingFromCookie('skipWorkers', DEFAULT_SETTINGS.skipWorkers),
      // Inactivity splash screen settings
      showSplashOnInactivity: getSettingFromCookie('showSplashOnInactivity', DEFAULT_SETTINGS.showSplashOnInactivity),
      inactivityTimeout: getSettingFromCookie('inactivityTimeout', DEFAULT_SETTINGS.inactivityTimeout),
      // Event context flags
      halloweenContext: getSettingFromCookie('halloweenContext', DEFAULT_SETTINGS.halloweenContext)
    };
  });
  
  
  // Project state
  const projectState = useRef<ProjectState>({
    currentPhotoIndex: 0,
    jobs: new Map(),
    startedJobs: new Set(),
    completedJobs: new Map(),
    pendingCompletions: new Map(),
  }).current;
  
  // UI state
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showPhotoGrid, setShowPhotoGrid] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  
  // Cache clearing callbacks
  const cacheClearingCallbacks = useRef<(() => void)[]>([]);
  
  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    // Special handling for model changes
    if (key === 'selectedModel') {
      console.log(`updateSetting: Model change detected, calling switchToModel with ${String(value)}`);
      switchToModel(value as string);
      return;
    }
    
    setSettings(prev => {
      const newSettings = { ...prev, [key]: value };
      
      // Save model-specific settings separately
      const modelSpecificSettings = ['inferenceSteps', 'scheduler', 'timeStepSpacing', 'promptGuidance', 'guidance', 'numImages'];
      if (modelSpecificSettings.includes(key)) {
        console.log(`📦 Saving model-specific setting ${String(key)}`);
        saveModelSpecificSettings(newSettings.selectedModel, { [key]: value });
      } else {
        console.log(`🌐 Saving global setting ${String(key)} via saveSettingsToCookies`);
        saveSettingsToCookies({ [key]: value });
      }
      
      return newSettings;
    });
  };
  
  // Function to switch to a different model and load its settings
  const switchToModel = (modelId: string) => {
    const currentModel = settings.selectedModel;
    const isCurrentFlux = isFluxKontextModel(currentModel);
    const isNewFlux = isFluxKontextModel(modelId);
    
    // Check if we're switching between different model types
    const switchingModelTypes = isCurrentFlux !== isNewFlux;
    
    let modelSettings;
    if (switchingModelTypes) {
      // When switching between model types, use defaults instead of saved settings
      modelSettings = getModelDefaults(modelId);
      console.log(`Switching between model types (${isCurrentFlux ? 'Flux.1 Kontext' : 'Other'} -> ${isNewFlux ? 'Flux.1 Kontext' : 'Other'}), restoring defaults for ${modelId}:`, modelSettings);
    } else {
      // When switching within the same model type, use saved settings
      modelSettings = getSettingsForModel(modelId);
      console.log(`Switching within same model type, loading saved settings for ${modelId}:`, modelSettings);
    }
    
    const newSettings = {
      ...settings,
      selectedModel: modelId,
      inferenceSteps: modelSettings.inferenceSteps ?? DEFAULT_SETTINGS.inferenceSteps,
      scheduler: modelSettings.scheduler ?? DEFAULT_SETTINGS.scheduler,
      timeStepSpacing: modelSettings.timeStepSpacing ?? DEFAULT_SETTINGS.timeStepSpacing,
      promptGuidance: modelSettings.promptGuidance ?? DEFAULT_SETTINGS.promptGuidance,
      guidance: modelSettings.guidance ?? DEFAULT_SETTINGS.guidance,
      numImages: modelSettings.numImages ?? DEFAULT_SETTINGS.numImages,
    };
    
    console.log(`Final settings being applied:`, {
      inferenceSteps: newSettings.inferenceSteps,
      scheduler: newSettings.scheduler,
      timeStepSpacing: newSettings.timeStepSpacing,
      promptGuidance: newSettings.promptGuidance,
      guidance: newSettings.guidance,
      numImages: newSettings.numImages,
      selectedStyle: newSettings.selectedStyle, // LOG THIS
    });
    
    console.log(`🔍 [switchToModel] selectedStyle before: ${settings.selectedStyle}, after: ${newSettings.selectedStyle}`);
    
    setSettings(newSettings);
    
    // Save the model selection
    saveSettingsToCookies({ selectedModel: modelId });
    
    // If we switched model types and restored defaults, save them as the new settings for this model
    if (switchingModelTypes) {
      saveModelSpecificSettings(modelId, {
        inferenceSteps: modelSettings.inferenceSteps,
        scheduler: modelSettings.scheduler,
        timeStepSpacing: modelSettings.timeStepSpacing,
        promptGuidance: modelSettings.promptGuidance,
        guidance: modelSettings.guidance,
        numImages: modelSettings.numImages,
      });
    }
    
    console.log(`Switched to model ${modelId} with settings:`, modelSettings);
  };
  
  const resetSettings = () => {
    console.log('🔄 RESET SETTINGS CALLED - This will reset showSplashOnInactivity to false');
    console.trace('Reset settings call stack');
    
    // Get the current model
    const currentModel = settings.selectedModel;
    
    // Get the ACTUAL defaults for the current model (not saved settings)
    const modelDefaults = getModelDefaults(currentModel);
    
    // Reset to defaults for the current model
    const resetToDefaults = {
      ...DEFAULT_SETTINGS,
      selectedModel: currentModel, // Keep the current model
      inferenceSteps: modelDefaults.inferenceSteps,
      scheduler: modelDefaults.scheduler,
      timeStepSpacing: modelDefaults.timeStepSpacing,
      promptGuidance: modelDefaults.promptGuidance || DEFAULT_SETTINGS.promptGuidance,
      guidance: modelDefaults.guidance,
      numImages: modelDefaults.numImages,
    };
    
    setSettings(resetToDefaults);
    
    // Save model-specific settings to their separate storage
    saveModelSpecificSettings(currentModel, {
      inferenceSteps: resetToDefaults.inferenceSteps,
      scheduler: resetToDefaults.scheduler,
      timeStepSpacing: resetToDefaults.timeStepSpacing,
      promptGuidance: resetToDefaults.promptGuidance,
      guidance: resetToDefaults.guidance,
      numImages: resetToDefaults.numImages,
    });
    
    // Save non-model-specific settings to global storage
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { inferenceSteps, scheduler, timeStepSpacing, promptGuidance, guidance, numImages, ...nonModelSettings } = resetToDefaults;
    saveSettingsToCookies(nonModelSettings);
    
    console.log(`Reset settings for model ${currentModel} to defaults:`, modelDefaults);
  };
  
  // Cache clearing functions
  const clearImageCaches = () => {
    console.log('Clearing all image caches due to QR settings change');
    cacheClearingCallbacks.current.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.warn('Error executing cache clearing callback:', error);
      }
    });
  };
  
  const registerCacheClearingCallback = (callback: () => void) => {
    cacheClearingCallbacks.current.push(callback);
    // Return cleanup function
    return () => {
      const index = cacheClearingCallbacks.current.indexOf(callback);
      if (index > -1) {
        cacheClearingCallbacks.current.splice(index, 1);
      }
    };
  };
  
  const contextValue = useMemo(() => ({
    photos,
    setPhotos,
    selectedPhotoIndex,
    setSelectedPhotoIndex,
    loadedImages,
    setLoadedImages,
    settings,
    updateSetting,
    switchToModel,
    resetSettings,
    showStyleDropdown,
    setShowStyleDropdown,
    projectState,
    showInfoModal,
    setShowInfoModal,
    showPhotoGrid,
    setShowPhotoGrid,
    dragActive,
    setDragActive,
    clearImageCaches,
    registerCacheClearingCallback,
  }), [
    photos,
    selectedPhotoIndex,
    loadedImages,
    settings,
    showStyleDropdown,
    showInfoModal,
    showPhotoGrid,
    dragActive,
  ]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}; 