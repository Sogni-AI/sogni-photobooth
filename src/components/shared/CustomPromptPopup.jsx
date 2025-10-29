import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import '../../styles/custom-prompt-popup.css';

/**
 * CustomPromptPopup - A popup dialog for entering custom prompts directly in Vibe Explorer
 */
const CUSTOM_PROMPT_STORAGE_KEY = 'sogni_last_custom_prompt';
const CUSTOM_SCENE_NAME_STORAGE_KEY = 'sogni_last_custom_scene_name';

const CustomPromptPopup = ({ 
  isOpen, 
  onClose, 
  onApply,
  currentPrompt = '',
  currentSceneName = ''
}) => {
  // Initialize state from localStorage if available, otherwise use props
  const [promptText, setPromptText] = useState(() => {
    try {
      const stored = localStorage.getItem(CUSTOM_PROMPT_STORAGE_KEY);
      return stored || currentPrompt;
    } catch (e) {
      return currentPrompt;
    }
  });
  const [sceneName, setSceneName] = useState(() => {
    try {
      const stored = localStorage.getItem(CUSTOM_SCENE_NAME_STORAGE_KEY);
      return stored || currentSceneName;
    } catch (e) {
      return currentSceneName;
    }
  });
  const [showSparkles, setShowSparkles] = useState(false);
  const textareaRef = useRef(null);
  const popupRef = useRef(null);
  const initialValuesRef = useRef({ prompt: '', sceneName: '' });

  // Fun placeholder examples that rotate
  const funPlaceholders = [
    "riding a rainbow unicorn through cotton candy clouds ✨🦄",
    "as a superhero saving the day in a comic book style 💥",
    "having a tea party with woodland creatures 🍵🦊",
    "exploring a magical underwater city 🐠🏰",
    "dancing in a field of glowing fireflies at sunset 🌅✨",
    "as a space explorer discovering alien planets 🚀👽",
    "painting a masterpiece in a cozy art studio 🎨",
    "having a picnic in a field of sunflowers 🌻"
  ];
  const [currentPlaceholder, setCurrentPlaceholder] = useState(funPlaceholders[0]);

  // Auto-focus the textarea when the popup opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      }, 100);
      // Rotate placeholder examples
      const placeholderInterval = setInterval(() => {
        setCurrentPlaceholder(prev => {
          const currentIndex = funPlaceholders.indexOf(prev);
          const nextIndex = (currentIndex + 1) % funPlaceholders.length;
          return funPlaceholders[nextIndex];
        });
      }, 4000);
      return () => clearInterval(placeholderInterval);
    }
  }, [isOpen]);

  // When popup opens, load from localStorage (takes precedence over props)
  useEffect(() => {
    if (isOpen) {
      try {
        const storedPrompt = localStorage.getItem(CUSTOM_PROMPT_STORAGE_KEY);
        const storedSceneName = localStorage.getItem(CUSTOM_SCENE_NAME_STORAGE_KEY);
        
        // Use localStorage values if they exist, otherwise use props
        const finalPrompt = storedPrompt !== null ? storedPrompt : (currentPrompt || '');
        const finalSceneName = storedSceneName !== null ? storedSceneName : (currentSceneName || '');
        
        setPromptText(finalPrompt);
        setSceneName(finalSceneName);
        
        // Store initial values for cancel functionality
        initialValuesRef.current = { prompt: finalPrompt, sceneName: finalSceneName };
      } catch (e) {
        console.warn('Failed to load custom prompt from localStorage:', e);
        setPromptText(currentPrompt);
        setSceneName(currentSceneName);
        initialValuesRef.current = { prompt: currentPrompt, sceneName: currentSceneName };
      }
    }
  }, [isOpen, currentPrompt, currentSceneName]);

  // Handle click outside to close
  useEffect(() => {
    if (isOpen) {
      const handleClickOutside = (e) => {
        if (popupRef.current && !popupRef.current.contains(e.target)) {
          onClose();
        }
      };
      
      // Add a small delay to prevent immediate closing when opening
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen, onClose]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          onClose();
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          // Ctrl+Enter or Cmd+Enter to apply
          handleApply();
        }
      };
      
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, promptText, onClose]);

  const handleApply = () => {
    // Save to localStorage for future sessions
    try {
      localStorage.setItem(CUSTOM_PROMPT_STORAGE_KEY, promptText);
      localStorage.setItem(CUSTOM_SCENE_NAME_STORAGE_KEY, sceneName);
    } catch (e) {
      console.warn('Failed to save custom prompt to localStorage:', e);
    }
    onApply(promptText, sceneName);
    onClose();
  };

  const handleCancel = () => {
    // Reset to the values that were loaded when popup opened
    setPromptText(initialValuesRef.current.prompt);
    setSceneName(initialValuesRef.current.sceneName);
    onClose();
  };

  const handleTextChange = (e) => {
    setPromptText(e.target.value);
    // Show sparkles when typing
    setShowSparkles(true);
    setTimeout(() => setShowSparkles(false), 500);
  };

  // Get encouraging message based on character count
  const getEncouragingMessage = () => {
    const length = promptText.length;
    if (length === 0) return "🌟 Let your imagination run wild!";
    if (length < 20) return "✨ Keep going, you're doing great!";
    if (length < 50) return "🎨 Love it! Add more details if you'd like!";
    if (length < 100) return "🚀 Wow! That sounds amazing!";
    if (length < 200) return "🌈 Incredible detail! This will be epic!";
    return "💫 You're a prompt wizard Harry! ✨";
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="custom-prompt-overlay">
      <div className="custom-prompt-popup" ref={popupRef}>
        {/* Floating sparkles decoration */}
        <div className="sparkles-container">
          <span className="sparkle sparkle-1">✨</span>
          <span className="sparkle sparkle-2">⭐</span>
          <span className="sparkle sparkle-3">💫</span>
          <span className="sparkle sparkle-4">🌟</span>
        </div>

        <div className="custom-prompt-header">
          <h3>
            <span className="header-emoji">🎨</span>
            Dream It Up!
            <span className="header-emoji">✨</span>
          </h3>
          <button 
            className="custom-prompt-close"
            onClick={handleCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="custom-prompt-body">
          <label className="custom-prompt-label">
            ✏️ What magical scene do you want to create?
          </label>
          <div className="textarea-wrapper">
            <textarea
              ref={textareaRef}
              className={`custom-prompt-textarea ${showSparkles ? 'typing-sparkle' : ''}`}
              placeholder={currentPlaceholder}
              value={promptText}
              onChange={handleTextChange}
              rows={5}
              autoComplete="off"
              autoCapitalize="off"
              data-form-type="other"
            />
            {showSparkles && <div className="typing-sparkles">✨</div>}
          </div>

          <div className="prompt-stats">
            <div className="encouraging-message">
              {getEncouragingMessage()}
            </div>
            <div className="character-count">
              {promptText.length} characters
            </div>
          </div>

          <div className="scene-name-section">
            <label className="custom-prompt-label" style={{ marginTop: '12px' }}>
              🏷️ Give your scene a name
            </label>
            <input
              type="text"
              className="scene-name-input"
              placeholder="e.g., My Magical Adventure"
              value={sceneName}
              onChange={(e) => setSceneName(e.target.value.slice(0, 24))}
              maxLength={24}
              autoComplete="off"
              autoCapitalize="off"
              data-form-type="other"
              required
            />
            <div className="scene-name-hint">
              {sceneName.length}/24 characters
            </div>
          </div>
        </div>

        <div className="custom-prompt-footer">
          <button 
            className="custom-prompt-btn custom-prompt-btn-cancel"
            onClick={handleCancel}
          >
            Maybe Later 🤔
          </button>
          <button 
            className="custom-prompt-btn custom-prompt-btn-apply"
            onClick={handleApply}
            disabled={!promptText.trim() || !sceneName.trim()}
          >
            Let&apos;s Create Magic! ✨
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

CustomPromptPopup.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onApply: PropTypes.func.isRequired,
  currentPrompt: PropTypes.string,
  currentSceneName: PropTypes.string
};

export default CustomPromptPopup;

