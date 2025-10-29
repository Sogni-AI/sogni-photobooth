import React, { useRef, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { styleIdToDisplay } from '../../utils';
import { THEME_GROUPS, getDefaultThemeGroupState } from '../../constants/themeGroups';
import { getThemeGroupPreferences, saveThemeGroupPreferences } from '../../utils/cookies';
import { isFluxKontextModel } from '../../constants/settings';
import { generateGalleryFilename } from '../../utils/galleryLoader';
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
  setShowControlOverlay: _setShowControlOverlay, // eslint-disable-line no-unused-vars
  dropdownPosition = 'top', // Default value
  triggerButtonClass = '.bottom-style-select', // Default class for the main toolbar
  onThemeChange = null, // Callback when theme preferences change
  selectedModel = null, // Current selected model to determine UI behavior
  onModelSelect = null, // Callback for model selection
  onGallerySelect = null, // Callback for gallery selection
  onCustomPromptChange = null, // Callback for custom prompt changes
  currentCustomPrompt = '', // Current custom prompt value
  currentCustomSceneName = '', // Current custom scene name value
  portraitType = 'medium', // Portrait type for gallery preview images
  styleReferenceImage = null, // Style reference image for Copy Image Style mode
  onEditStyleReference = null, // Callback to edit existing style reference
  onNavigateToVibeExplorer = null, // Callback to navigate to full Vibe Explorer
  slideInPanel = false // Whether to render as a full-height slide-in panel
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
  const [searchQuery, setSearchQuery] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [isModelSectionOpen, setIsModelSectionOpen] = useState(false);
  // Collapse Style Mode by default if an individual style is preselected
  const [isStyleModeOpen, setIsStyleModeOpen] = useState(() => {
    // Check if selectedStyle is an individual style (not a preset mode)
    const isIndividualStyle = selectedStyle && 
      !['custom', 'random', 'randomMix', 'oneOfEach', 'browseGallery', 'copyImageStyle'].includes(selectedStyle);
    return !isIndividualStyle; // Collapse if individual style is selected
  });
  const [isThemesSectionOpen, setIsThemesSectionOpen] = useState(false);
  const [isIndividualStylesOpen, setIsIndividualStylesOpen] = useState(true); // Open by default
  const [showSearchInput, setShowSearchInput] = useState(false);
  
  // Handle slide-in panel closing animation
  const handleClose = () => {
    if (slideInPanel) {
      setIsClosing(true);
      // Wait for animation to complete before actually closing
      setTimeout(() => {
        setIsClosing(false);
        onClose();
      }, 300); // Match animation duration
    } else {
      onClose();
    }
  };
  
  // Handle style selection with animation
  const handleStyleSelect = (styleKey, callback = null) => {
    if (slideInPanel) {
      // For slide-in panel: close with animation first, then update style
      handleClose();
      setTimeout(() => {
        updateStyle(styleKey);
        if (callback) callback();
      }, 300); // Match the slide-out animation duration
    } else {
      // For regular dropdown: immediate update
      updateStyle(styleKey);
      if (callback) callback();
      handleClose();
    }
  };
  
  useEffect(() => {
    if (isOpen) {
      // Skip positioning logic if we're in slide-in panel mode
      if (slideInPanel) {
        setMounted(true);
        return;
      }
      
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
      setIsClosing(false); // Reset closing state when dropdown closes
    }
  }, [isOpen, dropdownPosition, triggerButtonClass, slideInPanel]);

  useEffect(() => {
    if (isOpen) {
      // Skip click outside handling for slide-in panel (backdrop handles it)
      if (slideInPanel) {
        return;
      }
      
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
    } else {
      // Reset search when dropdown closes
      setSearchQuery('');
    }
  }, [isOpen, onClose, triggerButtonClass, initialScrollDone, slideInPanel]);

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

  // Handle Select All themes
  const handleSelectAllThemes = () => {
    const allSelected = Object.fromEntries(
      Object.keys(THEME_GROUPS).map(groupId => [groupId, true])
    );
    setThemeGroupState(allSelected);
    saveThemeGroupPreferences(allSelected);
    if (onThemeChange) {
      onThemeChange(allSelected);
    }
  };

  // Handle Deselect All themes
  const handleDeselectAllThemes = () => {
    const allDeselected = Object.fromEntries(
      Object.keys(THEME_GROUPS).map(groupId => [groupId, false])
    );
    setThemeGroupState(allDeselected);
    saveThemeGroupPreferences(allDeselected);
    if (onThemeChange) {
      onThemeChange(allDeselected);
    }
  };

  // Handle custom prompt application
  const handleApplyCustomPrompt = (promptText, sceneName) => {
    // First update the style to custom
    updateStyle('custom');
    
    // Then update the custom prompt if callback is provided
    if (onCustomPromptChange) {
      onCustomPromptChange(promptText, sceneName);
    }
  };

  // Check if we're using Flux.1 Kontext
  const isFluxKontext = selectedModel && isFluxKontextModel(selectedModel);

  // If not mounted or not open, don't render anything
  if (!mounted || !isOpen) return (
    <>
      {/* Still render the CustomPromptPopup even when dropdown is closed */}
      <CustomPromptPopup
        isOpen={showCustomPromptPopup}
        onClose={() => setShowCustomPromptPopup(false)}
        onApply={handleApplyCustomPrompt}
        currentPrompt={currentCustomPrompt}
        currentSceneName={currentCustomSceneName}
      />
    </>
  );

  // Create portal to render the dropdown at the document root
  return (
    <>
      {ReactDOM.createPortal(
        <>
          {/* Backdrop for slide-in panel */}
          {slideInPanel && (
            <div 
              className={`style-dropdown-backdrop ${isClosing ? 'closing' : ''}`}
              onClick={handleClose}
            />
          )}
          <div 
            ref={dropdownReference}
            className={`style-dropdown ${slideInPanel ? `slide-in-panel ${isClosing ? 'closing' : ''}` : `${actualPosition}-position`} ${position.isMobilePortrait && !slideInPanel ? 'mobile-portrait' : ''}`}
            style={slideInPanel ? {} : {
              ...(actualPosition === 'top' 
                ? { bottom: position.bottom } 
                : { top: position.top }),
              left: position.isMobilePortrait ? 10 : position.left,
              width: position.width,
            }}
          >
      {/* Close button for slide-in panel - mobile only */}
      {slideInPanel && (
        <button 
          className="slide-panel-close-btn mobile-only"
          onClick={handleClose}
          aria-label="Close"
        >
          Close
        </button>
      )}
      
      {/* Browse Vibe Explorer - First item */}
      {onNavigateToVibeExplorer && !isFluxKontext && (
        <div className="style-section featured">
          <div 
            className="style-option browse-vibe-explorer"
            onClick={() => { 
              if (slideInPanel) {
                // For slide-in panel: close with animation first, then navigate
                handleClose();
                setTimeout(() => {
                  onNavigateToVibeExplorer();
                }, 300); // Match the slide-out animation duration
              } else {
                // For regular dropdown: immediate navigation
                onNavigateToVibeExplorer();
                handleClose();
              }
            }}
          >
            <span>🌟</span>
            <span>Browse in Vibe Explorer</span>
            <span className="browse-arrow">→</span>
          </div>
        </div>
      )}

      {/* Model Selector - Collapsible */}
      {onModelSelect && selectedModel && (
        <div className="style-section model-selector">
            <div 
              className="section-header collapsible" 
              style={{ color: '#333' }}
              onClick={() => setIsModelSectionOpen(!isModelSectionOpen)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsModelSectionOpen(!isModelSectionOpen);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <span>🤖 Current model</span>
              <span className="collapse-arrow">{isModelSectionOpen ? '▼' : '▶'}</span>
            </div>
            {isModelSectionOpen && (
              <div className="collapsible-content">
                <div className="model-button-bar">
                  <button
                    className={`model-btn ${selectedModel === 'coreml-sogniXLturbo_alpha1_ad' ? 'active' : ''}`}
                    onClick={() => {
                      console.log('StyleDropdown: Model changed to SOGNI.XLT');
                      onModelSelect('coreml-sogniXLturbo_alpha1_ad');
                    }}
                  >
                    Default (Fast)
                  </button>
                  <button
                    className={`model-btn ${selectedModel === 'flux1-dev-kontext_fp8_scaled' ? 'active' : ''}`}
                    onClick={() => {
                      console.log('StyleDropdown: Model changed to Flux Kontext');
                      onModelSelect('flux1-dev-kontext_fp8_scaled');
                    }}
                  >
                    Flux Kontext
                  </button>
                </div>
              </div>
            )}
          </div>
      )}
      
      {/* Only show separator if Model Selector was shown OR Browse Vibe Explorer was shown */}
      {((onModelSelect && selectedModel) || (onNavigateToVibeExplorer && !isFluxKontext)) && (
        <div className="style-section-divider"></div>
      )}
      
      {/* Style Mode Section */}
      <div className="style-section style-mode">
        <div 
          className="section-header collapsible"
          onClick={() => setIsStyleModeOpen(!isStyleModeOpen)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsStyleModeOpen(!isStyleModeOpen);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <span>🎯 Style Picker</span>
          <span className="collapse-arrow">{isStyleModeOpen ? '▼' : '▶'}</span>
        </div>
        
        {isStyleModeOpen && (
          <div className="style-mode-content">
            <div 
              className={`style-option ${selectedStyle === 'randomMix' ? 'selected' : ''}`} 
              onClick={() => handleStyleSelect('randomMix')}
            >
              <span>🎲</span>
              <span>Random: All</span>
            </div>
            
            <div 
              className={`style-option ${selectedStyle === 'random' ? 'selected' : ''}`} 
              onClick={() => handleStyleSelect('random')}
            >
              <span>🔀</span>
              <span>Random: Single</span>
            </div>
            
            <div 
              className={`style-option ${selectedStyle === 'oneOfEach' ? 'selected' : ''}`} 
              onClick={() => handleStyleSelect('oneOfEach')}
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
              <span>Custom Prompt</span>
            </div>
          </div>
        )}
      </div>

      {/* Browse Gallery and Copy Image Style */}
      {((!isFluxKontext && onGallerySelect) || isFluxKontext) && (
        <>
          <div className="style-section-divider"></div>
          <div className="style-section other-options">
            {/* Browse Gallery option - only show for non-Flux models */}
            {!isFluxKontext && onGallerySelect && (
              <div 
                className={`style-option ${selectedStyle === 'browseGallery' ? 'selected' : ''}`}
                onClick={() => handleStyleSelect('browseGallery', onGallerySelect)}
              >
                <span>🖼️</span>
                <span>Browse Gallery</span>
              </div>
            )}
            
            {/* Copy Image Style option - only show when Flux Kontext is selected (disabled/coming soon) */}
            {isFluxKontext && (
              <div 
                className="style-option disabled" 
                title="Coming soon"
              >
                <span>🎨</span>
                <span>Copy Image Style</span>
                <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: 'auto' }}>(Coming soon)</span>
              </div>
            )}
          </div>
        </>
      )}
      
      {/* Themes Section - Collapsible, only show for non-Flux models */}
      {!isFluxKontext && (
        <>
          <div className="style-section-divider"></div>
          <div className="style-section themes">
            <div 
              className="section-header collapsible"
              onClick={() => setIsThemesSectionOpen(!isThemesSectionOpen)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsThemesSectionOpen(!isThemesSectionOpen);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <span>🎨 Theme Packs</span>
              <div className="section-header-controls">
                {isThemesSectionOpen && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectAllThemes();
                      }}
                      className="header-control-btn"
                      title="Select all themes"
                    >
                      ALL
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeselectAllThemes();
                      }}
                      className="header-control-btn"
                      title="Deselect all themes"
                    >
                      NONE
                    </button>
                  </>
                )}
                <span className="collapse-arrow">{isThemesSectionOpen ? '▼' : '▶'}</span>
              </div>
            </div>
            
            {isThemesSectionOpen && (
              <div className="collapsible-content">
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
            )}
          </div>

          <div className="style-section-divider"></div>
        </>
      )}

      {/* Individual Styles Section - Collapsible */}
      <div className="style-section individual-styles">
        <div 
          className="section-header collapsible"
          onClick={() => setIsIndividualStylesOpen(!isIndividualStylesOpen)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsIndividualStylesOpen(!isIndividualStylesOpen);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <span>👤 Individual styles</span>
          <div className="section-header-controls">
            {isIndividualStylesOpen && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (showSearchInput) {
                    // Clear search when closing
                    setSearchQuery('');
                  }
                  setShowSearchInput(!showSearchInput);
                }}
                className="header-control-btn"
                title="Search styles"
              >
                🔍
              </button>
            )}
            <span className="collapse-arrow">{isIndividualStylesOpen ? '▼' : '▶'}</span>
          </div>
        </div>

        {isIndividualStylesOpen && (
          <div className="collapsible-content">
            {/* Search Section */}
            {showSearchInput && (
              <div className="style-section search-section">
                <div className="search-input-wrapper">
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    placeholder="Search styles..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="style-search-input"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    data-form-type="other"
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      className="search-clear-btn"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="style-list">
              {Object.keys(defaultStylePrompts)
          .filter(key => key !== 'random' && key !== 'custom' && key !== 'randomMix' && key !== 'oneOfEach' && key !== 'copyImageStyle')
          .filter(key => {
            // Apply search filter
            if (!searchQuery) return true;
            const displayName = styleIdToDisplay(key).toLowerCase();
            return displayName.includes(searchQuery.toLowerCase());
          })
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
          .map(styleKey => {
            // Generate preview image path for this style
            let previewImagePath = null;
            
            // Special handling for Copy Image Style - use uploaded reference image
            if (styleKey === 'copyImageStyle' && styleReferenceImage?.dataUrl) {
              previewImagePath = styleReferenceImage.dataUrl;
            } else {
              try {
                const expectedFilename = generateGalleryFilename(styleKey);
                previewImagePath = `/gallery/prompts/${portraitType}/${expectedFilename}`;
              } catch (error) {
                // If filename generation fails, we'll just show no preview
                previewImagePath = null;
              }
            }
            
            return (
              <div 
                key={styleKey}
                className={`style-option ${selectedStyle === styleKey ? 'selected' : ''}`} 
                onClick={() => {
                  // Special handling for copyImageStyle - allow clicking when selected to edit
                  if (styleKey === 'copyImageStyle' && selectedStyle === 'copyImageStyle' && onEditStyleReference) {
                    handleStyleSelect(styleKey, onEditStyleReference);
                  } else {
                    handleStyleSelect(styleKey);
                  }
                }}
              >
                {previewImagePath && (
                  <img 
                    src={previewImagePath} 
                    alt={styleIdToDisplay(styleKey)}
                    className="style-option-preview"
                    onError={(e) => {
                      // Hide image if it fails to load
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                <span>{styleIdToDisplay(styleKey)}</span>
              </div>
            );
          })}
            </div>
          </div>
        )}
      </div>
    </div>
        </>,
        document.body
      )}
      
      {/* Custom Prompt Popup */}
      <CustomPromptPopup
        isOpen={showCustomPromptPopup}
        onClose={() => {
          setShowCustomPromptPopup(false);
          handleClose(); // Also close the dropdown when custom prompt popup closes
        }}
        onApply={handleApplyCustomPrompt}
        currentPrompt={currentCustomPrompt}
        currentSceneName={currentCustomSceneName}
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
  onModelSelect: PropTypes.func,
  onGallerySelect: PropTypes.func,
  onCustomPromptChange: PropTypes.func,
  currentCustomPrompt: PropTypes.string,
  currentCustomSceneName: PropTypes.string,
  portraitType: PropTypes.oneOf(['headshot', 'medium', 'fullbody']),
  styleReferenceImage: PropTypes.object,
  onEditStyleReference: PropTypes.func,
  onNavigateToVibeExplorer: PropTypes.func,
  slideInPanel: PropTypes.bool
};

export default StyleDropdown; 