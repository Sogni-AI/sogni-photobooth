import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import '../../styles/events/WinterPromptPopup.css';

/**
 * WinterPromptPopup - Winter-themed version of CustomPromptPopup for style submissions
 */
const WinterPromptPopup = ({ 
  isOpen, 
  onClose, 
  onApply,
  currentPrompt = ''
}) => {
  const [promptText, setPromptText] = useState(currentPrompt);
  const [showSparkles, setShowSparkles] = useState(false);
  const textareaRef = useRef(null);
  const popupRef = useRef(null);

  // Winter-themed placeholder examples
  const winterPlaceholders = [
    "wearing elegant white fur coat in a snowy alpine landscape ❄️🏔️",
    "dressed in cozy winter sweater with falling snowflakes all around ☃️❄️",
    "as an ice queen with glittering frozen crown in palace ✨👑",
    "wearing festive holiday outfit with warm golden lights 🎄✨",
    "in a frosted winter forest with magical aurora lights 🌲💫",
    "dressed as elegant snow fairy with iridescent wings ❄️🧚",
    "wearing luxurious winter fashion with autumn leaves transitioning to snow 🍂❄️",
    "in a cozy cabin scene with warm firelight and snowfall outside 🔥❄️"
  ];
  const [currentPlaceholder, setCurrentPlaceholder] = useState(winterPlaceholders[0]);

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
          const currentIndex = winterPlaceholders.indexOf(prev);
          const nextIndex = (currentIndex + 1) % winterPlaceholders.length;
          return winterPlaceholders[nextIndex];
        });
      }, 4000);
      return () => clearInterval(placeholderInterval);
    }
  }, [isOpen]);

  // Update local state when currentPrompt prop changes
  useEffect(() => {
    setPromptText(currentPrompt);
  }, [currentPrompt]);

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
    onApply(promptText);
    onClose();
  };

  const handleCancel = () => {
    setPromptText(currentPrompt); // Reset to original
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
    if (length === 0) return "❄️ Let your creativity flow!";
    if (length < 20) return "🍂 Keep going, getting interesting!";
    if (length < 50) return "✨ Nice! Add more magical details!";
    if (length < 100) return "⛄ Wow! This is getting beautifully detailed!";
    if (length < 200) return "🎄 Amazing detail! This will be stunning!";
    return "❄️ You're a winter wizard! ✨";
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="winter-prompt-overlay">
      <div className="winter-prompt-popup" ref={popupRef}>
        {/* Floating Winter decorations */}
        <div className="winter-sparkles-container">
          <span className="winter-sparkle sparkle-1">❄️</span>
          <span className="winter-sparkle sparkle-2">🍂</span>
          <span className="winter-sparkle sparkle-3">✨</span>
          <span className="winter-sparkle sparkle-4">🧊</span>
        </div>

        <div className="winter-prompt-header">
          <h3>
            <span className="header-emoji">❄️</span>
            Create Your Winter Style!
            <span className="header-emoji">✨</span>
          </h3>
          <button 
            className="winter-prompt-close"
            onClick={handleCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="winter-prompt-body">
          <label className="winter-prompt-label">
            🎨 Describe your winter vision:
          </label>
          <div className="textarea-wrapper">
            <textarea
              ref={textareaRef}
              className={`winter-prompt-textarea ${showSparkles ? 'typing-sparkle' : ''}`}
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
        </div>

        <div className="winter-prompt-footer">
          <button 
            className="winter-prompt-btn winter-prompt-btn-cancel"
            onClick={handleCancel}
          >
            Not Yet ❄️
          </button>
          <button 
            className="winter-prompt-btn winter-prompt-btn-apply"
            onClick={handleApply}
            disabled={!promptText.trim()}
          >
            Create Magic ✨
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

WinterPromptPopup.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onApply: PropTypes.func.isRequired,
  currentPrompt: PropTypes.string
};

export default WinterPromptPopup;

