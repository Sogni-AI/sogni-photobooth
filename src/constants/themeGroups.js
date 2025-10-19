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

// Default state - favorites starts unchecked, all other groups enabled
export const getDefaultThemeGroupState = () => {
  const defaultState = {};
  Object.keys(THEME_GROUPS).forEach(groupId => {
    // Favorites starts unchecked, all other groups start enabled
    defaultState[groupId] = groupId === 'favorites' ? false : true;
  });
  return defaultState;
};

// Get all prompts that are enabled based on theme group selections
export const getEnabledPrompts = (themeGroupState, allPrompts) => {
  const enabledPromptNames = [];
  
  Object.entries(THEME_GROUPS).forEach(([groupId, group]) => {
    if (themeGroupState[groupId]) {
      enabledPromptNames.push(...group.prompts);
    }
  });
  
  // Filter the allPrompts object to only include enabled prompts
  const enabledPrompts = {};
  Object.entries(allPrompts).forEach(([key, value]) => {
    if (key === 'custom' || key === 'random' || key === 'randomMix' || key === 'oneOfEach' || enabledPromptNames.includes(key)) {
      enabledPrompts[key] = value;
    }
  });
  
  return enabledPrompts;
};

// Get prompts in sequential order for "One of each plz" mode
export const getOneOfEachPrompts = (themeGroupState, allPrompts, count) => {
  const enabledGroups = [];
  
  // Get enabled groups in their defined order
  Object.entries(THEME_GROUPS).forEach(([groupId, group]) => {
    if (themeGroupState[groupId]) {
      enabledGroups.push(group);
    }
  });
  
  // If no themes are checked or all themes are checked, use alphabetical order from full list
  if (enabledGroups.length === 0 || enabledGroups.length === Object.keys(THEME_GROUPS).length) {
    const allPromptKeys = Object.keys(allPrompts)
      .filter(key => key !== 'custom' && key !== 'random' && key !== 'randomMix' && key !== 'oneOfEach')
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
    }
    
    groupIndex = (groupIndex + 1) % enabledGroups.length;
  }
  
  // Return pipe-separated format for batch generation
  return selectedPrompts.length > 0 ? `{${selectedPrompts.join('|')}}` : '';
};