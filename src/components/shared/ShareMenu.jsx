import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import '../../styles/components/ShareMenu.css';

/**
 * ShareMenu - A dropdown menu for sharing options
 * Shows "Share to Twitter" and "Submit to Gallery" options
 */
const ShareMenu = ({ 
  onShareToTwitter, 
  onSubmitToGallery,
  disabled = false,
  hasPromptKey = false,
  tezdevTheme = 'off'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMenuToggle = (e) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleShareToTwitter = (e) => {
    e.stopPropagation();
    setIsOpen(false);
    onShareToTwitter();
  };

  const handleSubmitToGallery = (e) => {
    e.stopPropagation();
    setIsOpen(false);
    onSubmitToGallery();
  };

  return (
    <div className="share-menu-container" ref={menuRef}>
      <button
        className="action-button twitter-btn"
        onClick={handleMenuToggle}
        disabled={disabled}
      >
        <svg fill="currentColor" width="16" height="16" viewBox="0 0 24 24">
          <path d="M22.46 6c-.77.35-1.6.58-2.46.67.9-.53 1.59-1.37 1.92-2.38-.84.5-1.78.86-2.79 1.07C18.27 4.49 17.01 4 15.63 4c-2.38 0-4.31 1.94-4.31 4.31 0 .34.04.67.11.99C7.83 9.09 4.16 7.19 1.69 4.23-.07 6.29.63 8.43 2.49 9.58c-.71-.02-1.38-.22-1.97-.54v.05c0 2.09 1.49 3.83 3.45 4.23-.36.1-.74.15-1.14.15-.28 0-.55-.03-.81-.08.55 1.71 2.14 2.96 4.03 3-1.48 1.16-3.35 1.85-5.37 1.85-.35 0-.69-.02-1.03-.06 1.92 1.23 4.2 1.95 6.67 1.95 8.01 0 12.38-6.63 12.38-12.38 0-.19 0-.38-.01-.56.85-.61 1.58-1.37 2.16-2.24z"/>
        </svg>
        {tezdevTheme !== 'off' ? 'Share' : 'Share'}
      </button>

      {isOpen && (
        <div className="share-menu-dropdown">
          <button
            className="share-menu-option"
            onClick={handleShareToTwitter}
          >
            <svg fill="currentColor" width="16" height="16" viewBox="0 0 24 24">
              <path d="M22.46 6c-.77.35-1.6.58-2.46.67.9-.53 1.59-1.37 1.92-2.38-.84.5-1.78.86-2.79 1.07C18.27 4.49 17.01 4 15.63 4c-2.38 0-4.31 1.94-4.31 4.31 0 .34.04.67.11.99C7.83 9.09 4.16 7.19 1.69 4.23-.07 6.29.63 8.43 2.49 9.58c-.71-.02-1.38-.22-1.97-.54v.05c0 2.09 1.49 3.83 3.45 4.23-.36.1-.74.15-1.14.15-.28 0-.55-.03-.81-.08.55 1.71 2.14 2.96 4.03 3-1.48 1.16-3.35 1.85-5.37 1.85-.35 0-.69-.02-1.03-.06 1.92 1.23 4.2 1.95 6.67 1.95 8.01 0 12.38-6.63 12.38-12.38 0-.19 0-.38-.01-.56.85-.61 1.58-1.37 2.16-2.24z"/>
            </svg>
            Share to Twitter
          </button>
          
          {hasPromptKey && (
            <button
              className="share-menu-option gallery-option"
              onClick={handleSubmitToGallery}
            >
              <svg fill="currentColor" width="16" height="16" viewBox="0 0 24 24">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
              </svg>
              Submit to Gallery
            </button>
          )}
        </div>
      )}
    </div>
  );
};

ShareMenu.propTypes = {
  onShareToTwitter: PropTypes.func.isRequired,
  onSubmitToGallery: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  hasPromptKey: PropTypes.bool,
  tezdevTheme: PropTypes.string
};

export default ShareMenu;

