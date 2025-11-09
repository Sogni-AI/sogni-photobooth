// Theme groups for organizing style prompts - now sourced from consolidated prompts.json
import promptsData from '../prompts.json';

// Convert the new structure to the old THEME_GROUPS format for compatibility
export const THEME_GROUPS = {};

// Build THEME_GROUPS from the new structure
Object.entries(promptsData).forEach(([groupId, group]) => {
  THEME_GROUPS[groupId] = {
    name: group.name,
    prompts: Object.keys(group.prompts)
  };
});

// Default state - favorites and horror start unchecked, all other groups enabled
export const getDefaultThemeGroupState = () => {
  const defaultState = {};
  Object.keys(THEME_GROUPS).forEach(groupId => {
    // Favorites and horror start unchecked, all other groups start enabled
    defaultState[groupId] = (groupId === 'favorites' || groupId === 'horror') ? false : true;
  });
  return defaultState;
};

// Get all prompts that are enabled based on theme group selections
// Note: Favorites are stored as promptKeys (e.g., 'animeKawaii') for gallery images,
// allowing them to be used with Random: All and One of Each generation
export const getEnabledPrompts = (themeGroupState, allPrompts) => {
  const enabledPromptNames = [];
  
  // Get blocked prompts from localStorage
  let blockedPrompts = [];
  try {
    const blocked = localStorage.getItem('sogni_blocked_prompts');
    if (blocked) {
      blockedPrompts = JSON.parse(blocked);
    }
  } catch (e) {
    console.warn('Error reading blocked prompts:', e);
  }
  
  Object.entries(THEME_GROUPS).forEach(([groupId, group]) => {
    if (themeGroupState[groupId]) {
      if (groupId === 'favorites') {
        // For favorites, get the prompt keys from localStorage
        try {
          const favorites = localStorage.getItem('sogni_favorite_images');
          if (favorites) {
            const favoriteIds = JSON.parse(favorites);
            enabledPromptNames.push(...favoriteIds);
          }
        } catch (e) {
          console.warn('Error reading favorite images:', e);
        }
      } else {
        enabledPromptNames.push(...group.prompts);
      }
    }
  });
  
  // Filter the allPrompts object to only include enabled prompts (and exclude blocked prompts)
  const enabledPrompts = {};
  Object.entries(allPrompts).forEach(([key, value]) => {
    // Always include custom and random workflow options if they exist
    if (key === 'custom' || key === 'random') {
      enabledPrompts[key] = value;
    }
    // Include other prompts only if they're in the enabled list AND not blocked
    else if (enabledPromptNames.includes(key) && !blockedPrompts.includes(key)) {
      enabledPrompts[key] = value;
    }
  });
  
  return enabledPrompts;
};

// Get prompts in sequential order for "One of each plz" mode
// Note: Favorites in localStorage are stored as promptKeys (e.g., 'animeKawaii'),
// which allows them to be looked up in allPrompts for generation
export const getOneOfEachPrompts = (themeGroupState, allPrompts, count) => {
  const enabledGroups = [];
  
  // Get blocked prompts from localStorage
  let blockedPrompts = [];
  try {
    const blocked = localStorage.getItem('sogni_blocked_prompts');
    if (blocked) {
      blockedPrompts = JSON.parse(blocked);
    }
  } catch (e) {
    console.warn('Error reading blocked prompts:', e);
  }
  
  // Get enabled groups in their defined order
  Object.entries(THEME_GROUPS).forEach(([groupId, group]) => {
    if (themeGroupState[groupId]) {
      if (groupId === 'favorites') {
        // For favorites, get the prompt keys from localStorage dynamically
        try {
          const favorites = localStorage.getItem('sogni_favorite_images');
          if (favorites) {
            const favoriteIds = JSON.parse(favorites);
            // Filter out blocked prompts from favorites
            const unblocked = favoriteIds.filter(id => !blockedPrompts.includes(id));
            if (unblocked.length > 0) {
              enabledGroups.push({
                name: group.name,
                prompts: unblocked
              });
            }
          }
        } catch (e) {
          console.warn('Error reading favorite images for oneOfEach:', e);
        }
      } else {
        // Filter out blocked prompts from group prompts
        const unblockedPrompts = group.prompts.filter(p => !blockedPrompts.includes(p));
        if (unblockedPrompts.length > 0) {
          enabledGroups.push({
            name: group.name,
            prompts: unblockedPrompts
          });
        }
      }
    }
  });
  
  // If no themes are checked, use alphabetical order from full list
  if (enabledGroups.length === 0) {
    const allPromptKeys = Object.keys(allPrompts)
      .filter(key => key !== 'custom' && key !== 'random' && key !== 'randomMix' && key !== 'oneOfEach' && key !== 'copyImageStyle')
      .filter(key => !blockedPrompts.includes(key)) // Filter out blocked prompts
      .sort();
    
    const selectedPrompts = [];
    for (let i = 0; i < count && i < allPromptKeys.length; i++) {
      const promptKey = allPromptKeys[i];
      if (allPrompts[promptKey]) {
        selectedPrompts.push(allPrompts[promptKey]);
      }
    }
    
    // Return pipe-separated format for batch generation
    return selectedPrompts.length > 0 ? `{${selectedPrompts.join('|')}}` : '';
  }
  
  // Use one prompt from each enabled group in order
  const selectedPrompts = [];
  let groupIndex = 0;
  
  for (let i = 0; i < count; i++) {
    if (enabledGroups.length === 0) break;
    
    const currentGroup = enabledGroups[groupIndex];
    const promptIndex = Math.floor(i / enabledGroups.length) % currentGroup.prompts.length;
    const promptKey = currentGroup.prompts[promptIndex];
    
    if (allPrompts[promptKey]) {
      selectedPrompts.push(allPrompts[promptKey]);
    } else {
      console.warn(`Prompt key "${promptKey}" not found in allPrompts`);
    }
    
    groupIndex = (groupIndex + 1) % enabledGroups.length;
  }
  
  // Return pipe-separated format for batch generation
  return selectedPrompts.length > 0 ? `{${selectedPrompts.join('|')}}` : '';
};