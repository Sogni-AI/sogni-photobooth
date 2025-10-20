import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import '../../styles/custom-prompt-popup.css';

/**
 * CustomPromptPopup - A popup dialog for entering custom prompts directly in Style Explorer
 */
const CustomPromptPopup = ({ 
  isOpen, 
  onClose, 
  onApply,
  currentPrompt = ''
}) => {
  const [promptText, setPromptText] = useState(currentPrompt);
  const textareaRef = useRef(null);
  const popupRef = useRef(null);

  // Auto-focus the textarea when the popup opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      }, 100);
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

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="custom-prompt-overlay">
      <div className="custom-prompt-popup" ref={popupRef}>
        <div className="custom-prompt-header">
          <h3>Custom Prompt</h3>
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
            Describe what you want to see:
          </label>
          <textarea
            ref={textareaRef}
            className="custom-prompt-textarea"
            placeholder="Enter your custom prompt here... (e.g., 'in bubble bath submerged to face, white bubbles, pink bathtub, 35mm cinematic film')"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            rows={5}
          />
          <div className="custom-prompt-hint">
            💡 Tip: Press Ctrl+Enter (or Cmd+Enter) to apply quickly
          </div>
        </div>

        <div className="custom-prompt-footer">
          <button 
            className="custom-prompt-btn custom-prompt-btn-cancel"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button 
            className="custom-prompt-btn custom-prompt-btn-apply"
            onClick={handleApply}
          >
            Apply Custom Prompt
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
  currentPrompt: PropTypes.string
};

export default CustomPromptPopup;

