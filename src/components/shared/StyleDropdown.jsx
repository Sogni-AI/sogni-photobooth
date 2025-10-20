import React, { useRef, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { styleIdToDisplay } from '../../utils';
import { THEME_GROUPS, getDefaultThemeGroupState, getEnabledPrompts } from '../../constants/themeGroups';
import { getThemeGroupPreferences, saveThemeGroupPreferences } from '../../utils/cookies';
import { isFluxKontextModel } from '../../constants/settings';
import CustomPromptPopup from './CustomPromptPopup';
import '../../styles/style-dropdown.css';
import PropTypes from 'prop-types';

// StyleDropdown component that uses portals to render outside the DOM hierarchy
const StyleDropdown = ({ 
  isOpen, 
  onClose, 
  selectedStyle, 
  updateStyle, 
  defaultStylePrompts, 
  setShowControlOverlay, 
  dropdownPosition = 'top', // Default value
  triggerButtonClass = '.bottom-style-select', // Default class for the main toolbar
  onThemeChange = null, // Callback when theme preferences change
  selectedModel = null, // Current selected model to determine UI behavior
  onGallerySelect = null, // Callback for gallery selection
  onCustomPromptChange = null, // Callback for custom prompt changes
  currentCustomPrompt = '' // Current custom prompt value
}) => {
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);
  const [actualPosition, setActualPosition] = useState(dropdownPosition);
  const dropdownReference = useRef(null);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  const [themeGroupState, setThemeGroupState] = useState(() => {
    const saved = getThemeGroupPreferences();
    const defaultState = getDefaultThemeGroupState();
    return { ...defaultState, ...saved };
  });
  const [showCustomPromptPopup, setShowCustomPromptPopup] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      // Find the style button in the DOM to position the dropdown
      const styleButton = document.querySelector(triggerButtonClass) || document.querySelector('.grid-style-btn');
      if (styleButton) {
        const rect = styleButton.getBoundingClientRect();
        
        // Check if we're in mobile portrait mode
        const isMobilePortrait = window.innerWidth <= 480 && window.innerHeight > window.innerWidth;
        
        const dropdownWidth = isMobilePortrait ? window.innerWidth - 20 : 300; // Full width minus margins on mobile
        const dropdownHeight = 450; // Increased to accommodate theme section
        
        // Calculate safe left position to prevent off-screen rendering
        let leftPosition = isMobilePortrait ? window.innerWidth / 2 : rect.left + rect.width / 2;
        
        if (!isMobilePortrait) {
          // Check if dropdown would go off left edge of screen
          if (leftPosition - (dropdownWidth / 2) < 10) {
            leftPosition = 10 + (dropdownWidth / 2);
          }
          
          // Check if dropdown would go off right edge of screen
          if (leftPosition + (dropdownWidth / 2) > window.innerWidth - 10) {
            leftPosition = window.innerWidth - 10 - (dropdownWidth / 2);
          }
        }
        
        // Determine if dropdown should appear above or below the button
        // based on available space and preferred position
        let calculatedPosition;
        
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;
        
        if (dropdownPosition === 'top') {
          // Check if there's enough space above
          if (spaceAbove >= dropdownHeight) {
            // Position above the button
            calculatedPosition = 'top';
            setPosition({
              bottom: window.innerHeight - rect.top + 10,
              left: leftPosition,
              width: dropdownWidth,
              isMobilePortrait
            });
          } else if (spaceBelow >= dropdownHeight) {
            // Not enough space above, but enough below
            calculatedPosition = 'bottom';
            setPosition({
              top: rect.bottom + 10,
              left: leftPosition,
              width: dropdownWidth,
              isMobilePortrait
            });
          } else {
            // Not enough space anywhere - center it as best we can
            calculatedPosition = 'bottom';
            setPosition({
              top: Math.max(10, rect.bottom - (rect.bottom + dropdownHeight - window.innerHeight + 10)),
              left: leftPosition,
              width: dropdownWidth,
              isMobilePortrait
            });
          }
        } else {
          // Default to bottom positioning first
          if (spaceBelow >= dropdownHeight) {
            // Position below the button
            calculatedPosition = 'bottom';
            setPosition({
              top: rect.bottom + 10,
              left: leftPosition,
              width: dropdownWidth,
              isMobilePortrait
            });
          } else if (spaceAbove >= dropdownHeight) {
            // Not enough space below, but enough above
            calculatedPosition = 'top';
            setPosition({
              bottom: window.innerHeight - rect.top + 10,
              left: leftPosition,
              width: dropdownWidth,
              isMobilePortrait
            });
          } else {
            // Not enough space anywhere - center it
            calculatedPosition = 'bottom';
            setPosition({
              top: Math.max(10, rect.bottom - (rect.bottom + dropdownHeight - window.innerHeight + 10)),
              left: leftPosition,
              width: dropdownWidth,
              isMobilePortrait
            });
          }
        }
        
        setActualPosition(calculatedPosition);
        setMounted(true);
        setInitialScrollDone(false); // Reset scroll state when dropdown opens
      }
    } else {
      setMounted(false);
    }
  }, [isOpen, dropdownPosition, triggerButtonClass]);

  useEffect(() => {
    if (isOpen) {
      const handleClickOutside = (e) => {
        if (dropdownReference.current && !dropdownReference.current.contains(e.target)) {
          // Check if the click was on any style button
          const styleButton = document.querySelector(triggerButtonClass) || document.querySelector('.grid-style-btn');
          if (!styleButton || !styleButton.contains(e.target)) {
            onClose();
          }
        }
      };
      
      document.addEventListener('click', handleClickOutside);
      
      // Only scroll to the selected option when dropdown initially opens, not after user scrolling
      if (!initialScrollDone) {
        setTimeout(() => {
          const selectedOption = document.querySelector('.style-option.selected');
          if (selectedOption && dropdownReference.current) {
            selectedOption.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setInitialScrollDone(true); // Mark initial scroll as done
          }
        }, 100);
      }
      
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isOpen, onClose, triggerButtonClass, initialScrollDone]);

  // Add event listener to prevent auto-scrolling after user interaction
  useEffect(() => {
    if (isOpen && dropdownReference.current) {
      const handleUserScroll = () => {
        if (!initialScrollDone) {
          setInitialScrollDone(true);
        }
      };
      
      const dropdown = dropdownReference.current;
      dropdown.addEventListener('scroll', handleUserScroll, { passive: true });
      
      return () => {
        dropdown.removeEventListener('scroll', handleUserScroll);
      };
    }
  }, [isOpen, initialScrollDone]);

  // Handle theme group toggle
  const handleThemeGroupToggle = (groupId) => {
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
  };

  // Handle custom prompt application
  const handleApplyCustomPrompt = (promptText) => {
    // First update the style to custom
    updateStyle('custom');
    
    // Then update the custom prompt if callback is provided
    if (onCustomPromptChange) {
      onCustomPromptChange(promptText);
    }
  };

  // Check if we're using Flux.1 Kontext
  const isFluxKontext = selectedModel && isFluxKontextModel(selectedModel);
  
  // Filter prompts based on enabled theme groups (only for non-Flux models)
  const enabledPrompts = isFluxKontext 
    ? defaultStylePrompts 
    : getEnabledPrompts(themeGroupState, defaultStylePrompts);

  // If not mounted or not open, don't render anything
  if (!mounted || !isOpen) return (
    <>
      {/* Still render the CustomPromptPopup even when dropdown is closed */}
      <CustomPromptPopup
        isOpen={showCustomPromptPopup}
        onClose={() => setShowCustomPromptPopup(false)}
        onApply={handleApplyCustomPrompt}
        currentPrompt={currentCustomPrompt}
      />
    </>
  );

  // Create portal to render the dropdown at the document root
  return (
    <>
      {ReactDOM.createPortal(
        <div 
          ref={dropdownReference}
          className={`style-dropdown ${actualPosition}-position ${position.isMobilePortrait ? 'mobile-portrait' : ''}`}
          style={{
            ...(actualPosition === 'top' 
              ? { bottom: position.bottom } 
              : { top: position.top }),
            left: position.isMobilePortrait ? 10 : position.left,
            width: position.width,
          }}
        >
      <div className="style-section featured">      
        {/* Featured options */}
        {/* Browse Gallery option - only show for non-Flux models */}
        {!isFluxKontext && onGallerySelect && (
          <div 
            className={`style-option ${selectedStyle === 'browseGallery' ? 'selected' : ''}`}
            onClick={() => { 
              updateStyle('browseGallery');
              onGallerySelect();
              onClose();
            }}
          >
            <span>🖼️</span>
            <span>Browse Gallery</span>
          </div>
        )}
        
        <div 
          className={`style-option ${selectedStyle === 'randomMix' ? 'selected' : ''}`} 
          onClick={() => { 
            updateStyle('randomMix');
            onClose();
          }}
        >
          <span>🎲</span>
          <span>Random Mix</span>
        </div>
        
        {/* Random Single option - available for all models */}
        <div 
          className={`style-option ${selectedStyle === 'random' ? 'selected' : ''}`} 
          onClick={() => { 
            updateStyle('random');
            onClose();
          }}
        >
          <span>🔀</span>
          <span>Random Single</span>
        </div>
        
        <div 
          className={`style-option ${selectedStyle === 'oneOfEach' ? 'selected' : ''}`} 
          onClick={() => { 
            updateStyle('oneOfEach');
            onClose();
          }}
        >
          <span>🙏</span>
          <span>One of each plz</span>
        </div>
        
        <div 
          className={`style-option ${selectedStyle === 'custom' ? 'selected' : ''}`} 
          onClick={() => { 
            setShowCustomPromptPopup(true);
          }}
        >
          <span>✏️</span>
          <span>Custom...</span>
        </div>
      </div>
      
      {/* Themes Section - only show for non-Flux models */}
      {!isFluxKontext && (
        <>
          <div className="style-section themes">
            <div className="section-header">
              <span>🎨 Themes</span>
            </div>
            <div className="theme-groups">
              {Object.entries(THEME_GROUPS).map(([groupId, group]) => (
                <div key={groupId} className="theme-group">
                  <label className="theme-group-label">
                    <input
                      type="checkbox"
                      checked={themeGroupState[groupId]}
                      onChange={() => handleThemeGroupToggle(groupId)}
                      className="theme-group-checkbox"
                    />
                    <span className="theme-group-name">{group.name}</span>
                    <span className="theme-group-count">({group.prompts.length})</span>
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="style-section-divider"></div>
        </>
      )}

      <div className="style-section regular">
        {Object.keys(enabledPrompts)
          .filter(key => key !== 'random' && key !== 'custom' && key !== 'randomMix' && key !== 'oneOfEach')
          .sort((a, b) => {
            const displayA = styleIdToDisplay(a);
            const displayB = styleIdToDisplay(b);
            
            // Check if the first character of each display label is alphanumeric
            const isAlphanumericA = /^[a-zA-Z0-9]/.test(displayA);
            const isAlphanumericB = /^[a-zA-Z0-9]/.test(displayB);
            
            // If one starts with non-alphanumeric and the other doesn't, prioritize the non-alphanumeric
            if (!isAlphanumericA && isAlphanumericB) return -1;
            if (isAlphanumericA && !isAlphanumericB) return 1;
            
            // If both are the same type (both alphanumeric or both non-alphanumeric), sort alphabetically
            return displayA.localeCompare(displayB);
          })
          .map(styleKey => (
            <div 
              key={styleKey}
              className={`style-option ${selectedStyle === styleKey ? 'selected' : ''}`} 
              onClick={() => { 
                updateStyle(styleKey);
                onClose();
              }}
            >
              <span>{styleIdToDisplay(styleKey)}</span>
            </div>
          ))}
      </div>
    </div>,
        document.body
      )}
      
      {/* Custom Prompt Popup */}
      <CustomPromptPopup
        isOpen={showCustomPromptPopup}
        onClose={() => {
          setShowCustomPromptPopup(false);
          onClose(); // Also close the dropdown when custom prompt popup closes
        }}
        onApply={handleApplyCustomPrompt}
        currentPrompt={currentCustomPrompt}
      />
    </>
  );
};

StyleDropdown.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  selectedStyle: PropTypes.string.isRequired,
  updateStyle: PropTypes.func.isRequired,
  defaultStylePrompts: PropTypes.object.isRequired,
  setShowControlOverlay: PropTypes.func,
  dropdownPosition: PropTypes.string,
  triggerButtonClass: PropTypes.string,
  onThemeChange: PropTypes.func,
  selectedModel: PropTypes.string,
  onGallerySelect: PropTypes.func,
  onCustomPromptChange: PropTypes.func,
  currentCustomPrompt: PropTypes.string,
};

export default StyleDropdown; 