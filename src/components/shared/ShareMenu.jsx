import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import '../../styles/components/ShareMenu.css';

/**
 * ShareMenu - A dropdown menu for sharing options
 * Shows "Share to Twitter", "Share..." (Web Share API), "Share QR Code", "Submit to Gallery", and "Submit to Prompt Contest" options
 */
const ShareMenu = ({
  onShareToTwitter,
  onShareViaWebShare,
  onSubmitToGallery,
  onShareQRCode,
  onSubmitToPromptContest,
  onOpen,
  disabled = false,
  hasPromptKey = false,
  isCustomPromptWithWinterContext = false,
  tezdevTheme = 'off',
  showWebShare = false,
  isMobileDevice = false
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
    if (!isOpen && onOpen) {
      onOpen(); // Call onOpen when opening the menu
    }
    setIsOpen(!isOpen);
  };

  const handleShareToTwitter = (e) => {
    e.stopPropagation();
    setIsOpen(false);
    onShareToTwitter();
  };

  const handleShareViaWebShare = (e) => {
    e.stopPropagation();
    setIsOpen(false);
    if (onShareViaWebShare) {
      onShareViaWebShare();
    }
  };

  const handleSubmitToGallery = (e) => {
    e.stopPropagation();
    setIsOpen(false);
    onSubmitToGallery();
  };

  const handleShareQRCode = (e) => {
    e.stopPropagation();
    setIsOpen(false);
    if (onShareQRCode) {
      onShareQRCode();
    }
  };

  const handleSubmitToPromptContest = (e) => {
    e.stopPropagation();
    setIsOpen(false);
    if (onSubmitToPromptContest) {
      onSubmitToPromptContest();
    }
  };

  return (
    <div className="share-menu-container" ref={menuRef}>
      <button
        className="action-button twitter-btn"
        onClick={handleMenuToggle}
        disabled={disabled}
      >
        <svg fill="currentColor" width="16" height="16" viewBox="0 0 24 24">
          <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92zM18 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM6 13c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm12 7.02c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>
        </svg>
        {tezdevTheme !== 'off' ? 'Share' : 'Share'}
      </button>

      {isOpen && (
        <div className="share-menu-dropdown">
          {!isMobileDevice && (
            <button
              className="share-menu-option"
              onClick={handleShareToTwitter}
            >
              <svg fill="currentColor" width="16" height="16" viewBox="0 0 24 24">
                <path d="M22.46 6c-.77.35-1.6.58-2.46.67.9-.53 1.59-1.37 1.92-2.38-.84.5-1.78.86-2.79 1.07C18.27 4.49 17.01 4 15.63 4c-2.38 0-4.31 1.94-4.31 4.31 0 .34.04.67.11.99C7.83 9.09 4.16 7.19 1.69 4.23-.07 6.29.63 8.43 2.49 9.58c-.71-.02-1.38-.22-1.97-.54v.05c0 2.09 1.49 3.83 3.45 4.23-.36.1-.74.15-1.14.15-.28 0-.55-.03-.81-.08.55 1.71 2.14 2.96 4.03 3-1.48 1.16-3.35 1.85-5.37 1.85-.35 0-.69-.02-1.03-.06 1.92 1.23 4.2 1.95 6.67 1.95 8.01 0 12.38-6.63 12.38-12.38 0-.19 0-.38-.01-.56.85-.61 1.58-1.37 2.16-2.24z"/>
              </svg>
              Share to Twitter
            </button>
          )}

          {showWebShare && onShareViaWebShare && (
            <button
              className="share-menu-option webshare-option"
              onClick={handleShareViaWebShare}
            >
              <svg fill="currentColor" width="16" height="16" viewBox="0 0 24 24">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92zM18 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM6 13c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm12 7.02c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>
              </svg>
              Share...
            </button>
          )}

          {onShareQRCode && (
            <button
              className="share-menu-option qr-option"
              onClick={handleShareQRCode}
            >
              <svg fill="currentColor" width="16" height="16" viewBox="0 0 24 24">
                <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4zM13 13h2v2h-2zM15 15h2v2h-2zM13 17h2v2h-2zM15 19h2v2h-2zM17 17h2v2h-2zM17 13h2v2h-2zM19 15h2v2h-2z"/>
              </svg>
              Share QR Code
            </button>
          )}

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

          {isCustomPromptWithWinterContext && onSubmitToPromptContest && (
            <button
              className="share-menu-option contest-option"
              onClick={handleSubmitToPromptContest}
            >
              <svg fill="currentColor" width="16" height="16" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              Submit to Prompt Contest
            </button>
          )}
        </div>
      )}
    </div>
  );
};

ShareMenu.propTypes = {
  onShareToTwitter: PropTypes.func.isRequired,
  onShareViaWebShare: PropTypes.func,
  onSubmitToGallery: PropTypes.func.isRequired,
  onShareQRCode: PropTypes.func,
  onSubmitToPromptContest: PropTypes.func,
  onOpen: PropTypes.func,
  disabled: PropTypes.bool,
  hasPromptKey: PropTypes.bool,
  isCustomPromptWithWinterContext: PropTypes.bool,
  tezdevTheme: PropTypes.string,
  showWebShare: PropTypes.bool,
  isMobileDevice: PropTypes.bool
};

export default ShareMenu;

