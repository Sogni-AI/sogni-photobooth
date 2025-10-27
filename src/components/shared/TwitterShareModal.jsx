import React, { useState, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import '../../styles/components/TwitterShareModal.css';
import { createPolaroidImage } from '../../utils/imageProcessing';
// import { getPhotoHashtag } from '../../services/TwitterShare'; // Unused import
import { themeConfigService } from '../../services/themeConfig';
import { styleIdToDisplay } from '../../utils';
import { TWITTER_SHARE_CONFIG, getQRWatermarkConfig } from '../../constants/settings';
import { useApp } from '../../context/AppContext';
import { useSogniAuth } from '../../services/sogniAuth';

// Helper to ensure Permanent Marker font is loaded
const ensureFontLoaded = () => {
  if (!document.querySelector('link[href*="Permanent+Marker"]')) {
    const fontLink = document.createElement('link');
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);
  }
};

const TwitterShareModal = ({ 
  isOpen, 
  onClose, 
  onShare, 
  imageUrl, 
  defaultMessage = TWITTER_SHARE_CONFIG.DEFAULT_MESSAGE,
  photoData,
  stylePrompts = {},
  maxLength = 280,
  tezdevTheme = 'off',
  aspectRatio = null,
  outputFormat = 'png' // Note: Twitter always uses JPG regardless of this setting
}) => {
  const [message, setMessage] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [polaroidImageUrl, setPolaroidImageUrl] = useState(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(true);
  const [submitToContest, setSubmitToContest] = useState(false);
  const textareaRef = useRef(null);
  const modalRef = useRef(null);
  
  // Get settings from context
  const { settings } = useApp();
  
  // Get authentication state
  const { isAuthenticated } = useSogniAuth();
  
  // Get style display text (spaced format, no hashtags) from photo data if available
  const styleDisplayText = photoData?.promptDisplay || 
    (photoData?.stylePrompt && styleIdToDisplay(
      Object.entries(stylePrompts || {}).find(([, value]) => value === photoData.stylePrompt)?.[0] || ''
    )) || '';
  
  // Use statusText directly if it's a hashtag (like #SogniPhotobooth), otherwise use styleDisplayText
  const photoLabel = (photoData?.statusText && photoData.statusText.includes('#')) 
    ? photoData.statusText 
    : styleDisplayText || '';
  
  
  // Helper function to generate message based on contest submission status
  const generateMessage = useCallback(async (isContestEntry) => {
    if (isContestEntry && settings.positivePrompt) {
      // Use Halloween-specific message format
      return `My @sogni_protocol Halloween Costume Party Challenge entry! My prompt: "${settings.positivePrompt}"`;
    } else if (tezdevTheme !== 'off') {
      // Use dynamic theme-specific message format
      try {
        const styleTag = styleDisplayText ? styleDisplayText.toLowerCase().replace(/\s+/g, '') : '';
        const themeTemplate = await themeConfigService.getTweetTemplate(tezdevTheme, styleTag);
        return themeTemplate;
      } catch (error) {
        console.warn('Could not load theme tweet template, using default:', error);
        return defaultMessage;
      }
    } else {
      // Original behavior for non-TezDev themes
      const currentUrl = window.location.href;
      const initialMessage = styleDisplayText 
        ? `${defaultMessage} #${styleDisplayText.toLowerCase().replace(/\s+/g, '')} ${currentUrl.split('?')[0]}?prompt=${styleDisplayText.toLowerCase().replace(/\s+/g, '')}`
        : defaultMessage;
      return initialMessage;
    }
  }, [settings.positivePrompt, tezdevTheme, styleDisplayText, defaultMessage]);

  // Initialize message and contest checkbox when modal opens
  useEffect(() => {
    const loadMessage = async () => {
      if (isOpen) {
        // Check if user came from Halloween event and set contest checkbox accordingly
        // But only if user is authenticated - otherwise force it to false
        const shouldSubmitToContest = isAuthenticated && (settings.halloweenContext || false);
        setSubmitToContest(shouldSubmitToContest);
        
        // Generate appropriate message
        const initialMessage = await generateMessage(shouldSubmitToContest);
        setMessage(initialMessage);
        
        // Focus the textarea
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.select();
          }
        }, 100);
      }
    };

    loadMessage();
  }, [isOpen, settings.halloweenContext, isAuthenticated, generateMessage]);

  // Handle contest checkbox toggle - update message template
  const handleContestToggle = async (checked) => {
    setSubmitToContest(checked);
    const newMessage = await generateMessage(checked);
    setMessage(newMessage);
  };

  // Ensure font is loaded when component mounts
  useEffect(() => {
    ensureFontLoaded();
  }, []);
  
  // Create preview when modal opens and imageUrl changes
  useEffect(() => {
    if (isOpen && imageUrl) {
      setIsLoadingPreview(true);
      
      const generatePreview = async () => {
        try {
          // Make sure the font is loaded before generating the preview
          await document.fonts.ready;
          
          let previewImageUrl;
          
          // Determine label based on contest submission
          const labelToUse = submitToContest ? 'Sogni Halloween 2025' : photoLabel;
          
          if (tezdevTheme !== 'off') {
            // For TezDev themes, create full frame version (no polaroid frame, just TezDev overlay)
            // Custom frames should not include labels - they have their own styling
            console.log('Creating TezDev full frame preview (always JPG for Twitter)');
            previewImageUrl = await createPolaroidImage(imageUrl, '', {
              tezdevTheme,
              aspectRatio,
              frameWidth: 0,      // No polaroid frame
              frameTopWidth: 0,   // No polaroid frame
              frameBottomWidth: 0, // No polaroid frame
              frameColor: 'transparent', // No polaroid background
              outputFormat: 'jpg', // Always use JPG for Twitter sharing
              // Add QR watermark for Twitter sharing (if enabled)
              watermarkOptions: settings.sogniWatermark ? getQRWatermarkConfig(settings) : null
            });
          } else {
            // For non-TezDev themes, use traditional polaroid frame
            console.log(`Creating polaroid preview with label: "${labelToUse}" (always JPG for Twitter)`);
            previewImageUrl = await createPolaroidImage(imageUrl, labelToUse, {
              tezdevTheme,
              aspectRatio,
              outputFormat: 'jpg', // Always use JPG for Twitter sharing
              // Add QR watermark for Twitter sharing - positioned to not overlap label (if enabled)
              watermarkOptions: settings.sogniWatermark ? getQRWatermarkConfig(settings) : null
            });
          }
          
          setPolaroidImageUrl(previewImageUrl);
        } catch (error) {
          console.error('Error creating preview:', error);
          setPolaroidImageUrl(imageUrl); // Fallback to original image
        } finally {
          setIsLoadingPreview(false);
        }
      };
      
      generatePreview();
    }
    
    return () => {
      // Cleanup function
      setPolaroidImageUrl(null);
    };
  }, [isOpen, imageUrl, photoLabel, tezdevTheme, aspectRatio, submitToContest, settings.sogniWatermark]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleShare = async () => {
    if (!message.trim()) return;
    
    setIsSharing(true);
    try {
      await onShare(message, submitToContest);
      onClose();
    } catch (error) {
      console.error('Error sharing:', error);
    } finally {
      setIsSharing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="twitter-modal-overlay">
      <div className="twitter-modal" ref={modalRef}>
        <button className="twitter-modal-close" onClick={onClose}>×</button>
        
        <div className="twitter-modal-header">
          <svg className="twitter-logo" fill="#1DA1F2" viewBox="0 0 24 24">
            <path d="M22.46 6c-.77.35-1.6.58-2.46.67.9-.53 1.59-1.37 1.92-2.38-.84.5-1.78.86-2.79 1.07C18.27 4.49 17.01 4 15.63 4c-2.38 0-4.31 1.94-4.31 4.31 0 .34.04.67.11.99C7.83 9.09 4.16 7.19 1.69 4.23-.07 6.29.63 8.43 2.49 9.58c-.71-.02-1.38-.22-1.97-.54v.05c0 2.09 1.49 3.83 3.45 4.23-.36.1-.74.15-1.14.15-.28 0-.55-.03-.81-.08.55 1.71 2.14 2.96 4.03 3-1.48 1.16-3.35 1.85-5.37 1.85-.35 0-.69-.02-1.03-.06 1.92 1.23 4.2 1.95 6.67 1.95 8.01 0 12.38-6.63 12.38-12.38 0-.19 0-.38-.01-.56.85-.61 1.58-1.37 2.16-2.24z"/>
          </svg>
          <h2>Share to X</h2>
        </div>
        
        <div className="twitter-modal-content">
          <div className="twitter-message-container">
            <textarea
              ref={textareaRef}
              className="twitter-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What would you like to say about this photo?"
              maxLength={maxLength}
            />
            <div className="twitter-char-counter">
              {message.length}/{maxLength}
            </div>
          </div>
          
          <div className="twitter-image-preview">
            {isLoadingPreview ? (
              <div className="twitter-image-loading">
                <span className="loading-spinner"></span>
                <p>Preparing image...</p>
              </div>
            ) : polaroidImageUrl ? (
              <div className="preview-container">
                <img src={polaroidImageUrl} alt="Preview" />
                {!tezdevTheme || tezdevTheme === 'off' ? (
                  photoLabel && (
                    <div className="preview-label-debug">
                      Using label: {photoLabel}
                    </div>
                  )
                ) : (
                  <div className="preview-label-debug">
                    TezDev {tezdevTheme} frame (full version)
                  </div>
                )}
              </div>
            ) : imageUrl ? (
              <img src={imageUrl} alt="Preview" />
            ) : (
              <div className="twitter-no-image">No image selected</div>
            )}
          </div>
        </div>
        
        <div className="twitter-modal-footer">
          <div className="halloween-contest-checkbox">
            <label>
              <input
                type="checkbox"
                checked={submitToContest}
                onChange={(e) => handleContestToggle(e.target.checked)}
                disabled={!isAuthenticated}
              />
              <span className="checkbox-label">
                <span className="pumpkin-icon">🎃</span>Submit to Halloween Contest{!isAuthenticated && ' (must be logged in)'}
              </span>
            </label>
          </div>
          <button 
            className="twitter-share-btn" 
            onClick={handleShare}
            disabled={isSharing || !message.trim() || isLoadingPreview}
          >
            {isSharing ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="twitter-loading">
                  <span className="dot"></span>
                  <span className="dot"></span>
                  <span className="dot"></span>
                </span>
                <span>Sharing your masterpiece...</span>
              </span>
            ) : (
              <>
                <svg className="twitter-icon" fill="white" viewBox="0 0 24 24">
                  <path d="M22.46 6c-.77.35-1.6.58-2.46.67.9-.53 1.59-1.37 1.92-2.38-.84.5-1.78.86-2.79 1.07C18.27 4.49 17.01 4 15.63 4c-2.38 0-4.31 1.94-4.31 4.31 0 .34.04.67.11.99C7.83 9.09 4.16 7.19 1.69 4.23-.07 6.29.63 8.43 2.49 9.58c-.71-.02-1.38-.22-1.97-.54v.05c0 2.09 1.49 3.83 3.45 4.23-.36.1-.74.15-1.14.15-.28 0-.55-.03-.81-.08.55 1.71 2.14 2.96 4.03 3-1.48 1.16-3.35 1.85-5.37 1.85-.35 0-.69-.02-1.03-.06 1.92 1.23 4.2 1.95 6.67 1.95 8.01 0 12.38-6.63 12.38-12.38 0-.19 0-.38-.01-.56.85-.61 1.58-1.37 2.16-2.24z"/>
                </svg>
                Post
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

TwitterShareModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onShare: PropTypes.func.isRequired,
  imageUrl: PropTypes.string,
  defaultMessage: PropTypes.string,
  photoData: PropTypes.object,
  stylePrompts: PropTypes.object,
  maxLength: PropTypes.number,
  tezdevTheme: PropTypes.string,
  aspectRatio: PropTypes.string,
  outputFormat: PropTypes.string
};

export default TwitterShareModal; 