import { Settings } from '../types/index';
import { getModelDefaults, isFluxKontextModel } from '../constants/settings';

export function getSettingFromCookie<T>(name: string, defaultValue: T): T {
  try {
    const value = localStorage.getItem(`sogni_${name}`);
    if (!value || value === 'undefined' || value === 'null') {
      return defaultValue;
    }
    return JSON.parse(value) as T;
  } catch (e) {
    console.warn(`Error reading cookie ${name}:`, e);
    // Clear the corrupted value
    try {
      localStorage.removeItem(`sogni_${name}`);
      console.log(`Cleared corrupted setting: ${name}`);
    } catch (clearError) {
      console.warn(`Could not clear corrupted setting ${name}:`, clearError);
    }
    return defaultValue;
  }
}

export function saveSettingsToCookies(settings: Partial<Settings>): void {
  console.log('🍪 saveSettingsToCookies called with:', settings);
  Object.entries(settings).forEach(([key, value]) => {
    try {
      if (value === undefined) {
        // Remove the setting if value is undefined
        console.log(`🗑️ Removing setting ${key} from localStorage`);
        localStorage.removeItem(`sogni_${key}`);
      } else {
        console.log(`💾 Saving setting ${key} = ${value} to localStorage as sogni_${key}`);
        localStorage.setItem(`sogni_${key}`, JSON.stringify(value));
        
        // Verify it was saved
        const saved = localStorage.getItem(`sogni_${key}`);
        console.log(`✅ Verification: sogni_${key} = ${saved}`);
      }
    } catch (e) {
      console.warn(`❌ Error saving setting ${key}:`, e);
    }
  });
}

// Model-specific settings management
const MODEL_SPECIFIC_SETTINGS = ['inferenceSteps', 'scheduler', 'timeStepSpacing', 'promptGuidance', 'guidance', 'numImages'];

export function getModelSpecificSetting<T>(modelId: string, settingName: string, defaultValue: T): T {
  try {
    const modelSettings = localStorage.getItem(`sogni_model_${modelId}`);
    if (modelSettings) {
      const parsed = JSON.parse(modelSettings);
      if (settingName in parsed) {
        return parsed[settingName] as T;
      }
    }
    return defaultValue;
  } catch (e) {
    console.warn(`Error reading model-specific setting ${settingName} for ${modelId}:`, e);
    return defaultValue;
  }
}

export function saveModelSpecificSettings(modelId: string, settings: Partial<Settings>): void {
  try {
    const existingSettings = localStorage.getItem(`sogni_model_${modelId}`);
    const modelSettings = existingSettings ? JSON.parse(existingSettings) : {};
    
    // Only save model-specific settings
    MODEL_SPECIFIC_SETTINGS.forEach(key => {
      if (key in settings) {
        modelSettings[key] = settings[key as keyof Settings];
      }
    });
    
    localStorage.setItem(`sogni_model_${modelId}`, JSON.stringify(modelSettings));
    console.log(`Saved model-specific settings for ${modelId}:`, modelSettings);
  } catch (e) {
    console.warn(`Error saving model-specific settings for ${modelId}:`, e);
  }
}

export function getSettingsForModel(modelId: string): Partial<Settings> {
  const modelDefaults = getModelDefaults(modelId);
  const isFluxKontext = isFluxKontextModel(modelId);
  
  return {
    inferenceSteps: getModelSpecificSetting(modelId, 'inferenceSteps', modelDefaults.inferenceSteps),
    scheduler: getModelSpecificSetting(modelId, 'scheduler', modelDefaults.scheduler),
    timeStepSpacing: getModelSpecificSetting(modelId, 'timeStepSpacing', modelDefaults.timeStepSpacing),
    promptGuidance: isFluxKontext 
      ? getSettingFromCookie('promptGuidance', 2) // Use global for non-Flux setting
      : getModelSpecificSetting(modelId, 'promptGuidance', modelDefaults.promptGuidance || 2),
    guidance: isFluxKontext 
      ? getModelSpecificSetting(modelId, 'guidance', modelDefaults.guidance)
      : getSettingFromCookie('guidance', 3), // Use global for non-Flux setting
    numImages: getModelSpecificSetting(modelId, 'numImages', modelDefaults.numImages),
  };
}

// Promotional popup utilities
export function shouldShowPromoPopup(): boolean {
  try {
    const lastShown = localStorage.getItem('sogni_promo_last_shown');
    if (!lastShown) {
      return true; // Never shown before
    }
    
    const lastShownDate = new Date(lastShown);
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    return lastShownDate < oneDayAgo;
  } catch (e) {
    console.warn('Error checking promo popup status:', e);
    return true; // Default to showing if there's an error
  }
}

export function markPromoPopupShown(): void {
  try {
    localStorage.setItem('sogni_promo_last_shown', new Date().toISOString());
  } catch (e) {
    console.warn('Error marking promo popup as shown:', e);
  }
}

// Theme group preferences utilities
export function getThemeGroupPreferences(): Record<string, boolean> {
  try {
    const preferences = localStorage.getItem('sogni_theme_groups');
    if (preferences) {
      return JSON.parse(preferences) as Record<string, boolean>;
    }
  } catch (e) {
    console.warn('Error reading theme group preferences:', e);
  }
  return {}; // Return empty object if not found or error
}

export function saveThemeGroupPreferences(preferences: Record<string, boolean>): void {
  try {
    localStorage.setItem('sogni_theme_groups', JSON.stringify(preferences));
  } catch (e) {
    console.warn('Error saving theme group preferences:', e);
  }
}

// Favorite images utilities
export function getFavoriteImages(): string[] {
  try {
    const favorites = localStorage.getItem('sogni_favorite_images');
    if (favorites) {
      return JSON.parse(favorites) as string[];
    }
  } catch (e) {
    console.warn('Error reading favorite images:', e);
  }
  return [];
}

export function saveFavoriteImages(favorites: string[]): void {
  try {
    localStorage.setItem('sogni_favorite_images', JSON.stringify(favorites));
  } catch (e) {
    console.warn('Error saving favorite images:', e);
  }
}

export function toggleFavoriteImage(photoId: string): boolean {
  try {
    console.log('🍪 COOKIE toggleFavoriteImage - photoId:', photoId);
    const favorites = getFavoriteImages();
    console.log('🍪 Current favorites from localStorage:', favorites);
    const index = favorites.indexOf(photoId);
    let newFavorites: string[];
    
    if (index > -1) {
      // Remove from favorites
      console.log('🍪 Removing from favorites at index:', index);
      newFavorites = favorites.filter(id => id !== photoId);
      saveFavoriteImages(newFavorites);
      console.log('🍪 After removal:', newFavorites);
      return false;
    } else {
      // Add to favorites
      console.log('🍪 Adding to favorites');
      newFavorites = [...favorites, photoId];
      saveFavoriteImages(newFavorites);
      console.log('🍪 After adding:', newFavorites);
      return true;
    }
  } catch (e) {
    console.warn('Error toggling favorite image:', e);
    return false;
  }
}

export function isFavoriteImage(photoId: string): boolean {
  const favorites = getFavoriteImages();
  return favorites.includes(photoId);
}

// Utility function to clean up corrupted localStorage values
export function cleanupCorruptedSettings(): void {
  try {
    const keysToCheck = [];
    
    // Get all localStorage keys that start with 'sogni_'
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sogni_')) {
        keysToCheck.push(key);
      }
    }
    
    let cleanedCount = 0;
    keysToCheck.forEach(key => {
      try {
        const value = localStorage.getItem(key);
        if (value === 'undefined' || value === 'null') {
          localStorage.removeItem(key);
          cleanedCount++;
          console.log(`Cleaned corrupted setting: ${key}`);
        } else if (value) {
          // Try to parse the value to see if it's valid JSON
          JSON.parse(value);
        }
      } catch (parseError) {
        // If parsing fails, remove the corrupted value
        localStorage.removeItem(key);
        cleanedCount++;
        console.log(`Cleaned corrupted setting: ${key}`);
      }
    });
    
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} corrupted localStorage settings`);
    }
  } catch (e) {
    console.warn('Error during localStorage cleanup:', e);
  }
} 