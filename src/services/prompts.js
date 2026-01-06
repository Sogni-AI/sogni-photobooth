import promptsDataRaw from '../prompts.json';
import { IMAGE_EDIT_PROMPTS_CATEGORY } from '../constants/editPrompts';
import { isContextImageModel } from '../constants/settings';

// Extract prompts from the new nested structure
const promptsData = {};
Object.values(promptsDataRaw).forEach(themeGroup => {
  Object.assign(promptsData, themeGroup.prompts);
});

// Get edit prompts from the image-edit-prompts category
const editPromptsData = promptsDataRaw[IMAGE_EDIT_PROMPTS_CATEGORY]?.prompts || {};

/**
 * Loads style prompts from various sources.
 * First tries the imported JSON, then fallbacks to fetching from different paths.
 */
export const loadPrompts = () => {
  // Always try import first, but with better error handling
  if (typeof promptsData !== 'undefined' && promptsData && Object.keys(promptsData).length > 0) {
    console.log('Prompts loaded from import:', Object.keys(promptsData).length);
    return Promise.resolve(promptsData);
  }
  
  console.warn('Prompts data not available from import, attempting to fetch...');
  
  // Try multiple locations in order
  const tryFetchFromPath = (path) => {
    return fetch(path)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to fetch from ${path}: ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        console.log(`Successfully loaded prompts from ${path}:`, Object.keys(data).length);
        return data;
      });
  };
  
  // Try the src path first (for dev), then fallback paths
  return tryFetchFromPath('/src/prompts.json')
    .catch(error => {
      console.warn(error.message);
      return tryFetchFromPath('/photobooth/prompts.json');
    })
    .catch(error => {
      console.warn(error.message);
      return tryFetchFromPath('/prompts.json');
    })
    .catch(error => {
      console.warn(error.message);
      return tryFetchFromPath('./prompts.json');
    })
    .catch(error => {
      console.error('All attempts to fetch prompts failed:', error);
      return {}; // Return empty object as last resort
    });
};

/**
 * Initializes and returns an object with all available style prompts.
 * Now returns all prompts (including edit prompts) for all models.
 * UI components handle filtering based on model type.
 * @param {string} modelId - The current model ID (optional, kept for backwards compatibility)
 */
export const initializeStylePrompts = async (modelId = null) => {
  try {
    // Load all prompts (includes edit prompts now)
    const prompts = await loadPrompts();
    
    if (Object.keys(prompts).length === 0) {
      console.warn('No prompts loaded, using default empty prompt');
      return { custom: '' };
    }
    
    // Create sorted object with custom first
    const stylePrompts = {
      custom: '', // Always include custom option
      ...Object.fromEntries(
        Object.entries(prompts)
          .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      )
    };
    
    // Add random style that will be resolved at generation time (for all models)
    stylePrompts.random = 'RANDOM_SINGLE_STYLE';
    
    console.log('Prompts loaded successfully:', Object.keys(stylePrompts).length);
    if (modelId && isContextImageModel(modelId)) {
      console.log('Context image model detected - edit prompts available');
    }
    
    // Expose to window for debugging
    if (typeof window !== 'undefined') {
      window.stylePrompts = stylePrompts;
      window.initializeStylePrompts = initializeStylePrompts;
    }
    
    return stylePrompts;
  } catch (error) {
    console.error('Error initializing prompts:', error);
    return { custom: '' };
  }
};

/**
 * Generates random prompts for multiple images
 */
export const generateRandomPrompts = (count, stylePrompts) => {
  // Get all prompts except 'custom' and 'random'
  const availablePrompts = Object.entries(stylePrompts)
    .filter(([key]) => key !== 'custom' && key !== 'random' && key !== 'copyImageStyle')
    .map(([key, value]) => ({ key, value }));
  
  // Shuffle array using Fisher-Yates algorithm
  for (let index = availablePrompts.length - 1; index > 0; index--) {
    const index_ = Math.floor(Math.random() * (index + 1));
    [availablePrompts[index], availablePrompts[index_]] = [availablePrompts[index_], availablePrompts[index]];
  }
  
  // Take first 'count' items and join their prompts
  const selectedPrompts = availablePrompts.slice(0, count);
  return `{${selectedPrompts.map(p => p.value).join('|')}}`;
};

/**
 * Gets a random style from the available styles
 */
export const getRandomStyle = (stylePrompts) => {
  const availableStyles = Object.keys(stylePrompts)
    .filter(key => key !== 'custom' && key !== 'random' && key !== 'randomMix' && key !== 'oneOfEach' && key !== 'copyImageStyle');
  
  if (availableStyles.length === 0) {
    console.warn('No styles available for random selection');
    return 'custom'; // Fallback to custom if no styles are available
  }
  
  return availableStyles[Math.floor(Math.random() * availableStyles.length)];
};

/**
 * Creates a mix of random prompts for multiple images
 */
export const getRandomMixPrompts = (count, stylePrompts) => {
  const availableStyles = Object.keys(stylePrompts)
    .filter(key => key !== 'custom' && key !== 'random' && key !== 'randomMix' && key !== 'oneOfEach' && key !== 'copyImageStyle');
  
  if (availableStyles.length === 0) {
    console.warn('No styles available for random mix');
    return 'A creative portrait style'; // Fallback if no styles are available
  }
  
  // Shuffle the available styles to ensure good distribution
  const shuffledStyles = [...availableStyles];
  for (let i = shuffledStyles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledStyles[i], shuffledStyles[j]] = [shuffledStyles[j], shuffledStyles[i]];
  }
  
  const selectedPrompts = [];
  for (let index = 0; index < count; index++) {
    // Cycle through shuffled styles to ensure good distribution
    const styleIndex = index % shuffledStyles.length;
    const selectedStyle = shuffledStyles[styleIndex];
    const prompt = stylePrompts[selectedStyle];
    if (prompt) {
      selectedPrompts.push(prompt);
    }
  }
  
  if (selectedPrompts.length === 0) {
    return 'A creative portrait style'; // Fallback if no valid prompts
  }
  
  return `{${selectedPrompts.join('|')}}`;
};

/**
 * Get the list of edit prompt keys from the image-edit-prompts category
 */
export const getEditPromptKeys = () => {
  return Object.keys(editPromptsData);
};

/**
 * Check if a prompt key is an edit prompt
 */
export const isEditPrompt = (promptKey) => {
  return promptKey in editPromptsData;
};

/**
 * Get all edit prompts as an object
 */
export const getEditPrompts = () => {
  return { ...editPromptsData };
}; 