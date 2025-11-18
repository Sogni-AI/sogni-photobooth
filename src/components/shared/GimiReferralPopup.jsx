import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import '../../styles/components/GimiReferralPopup.css';

/**
 * GimiReferralPopup
 * Shows after login/signup for users who visited the Gimi Challenge page
 * Provides their personalized referral URL
 */
const GimiReferralPopup = ({ username, onClose }) => {
  const [dontRemindMe, setDontRemindMe] = useState(false); // Not checked by default
  const [copied, setCopied] = useState(false);

  const referralUrl = `https://photobooth.sogni.ai/?referral=${username}&utm_campaign=Photobooth+Gimi`;

  // Set the popup timestamp when component mounts (when it's shown)
  useEffect(() => {
    // Set the last popup time to prevent other popups for 60 seconds
    localStorage.setItem('gimi-last-popup-time', Date.now().toString());
    console.log('[Gimi Referral] Popup shown - 60s cooldown activated');
  }, []);

  const handleClose = () => {
    // Mark as dismissed for this session (prevents THIS popup from showing again)
    sessionStorage.setItem('gimi-referral-dismissed-session', 'true');
    console.log('[Gimi Referral] Referral popup dismissed - blocked for rest of session');
    // Pass back whether user wants to be reminded or not
    onClose(dontRemindMe);
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const modalContent = (
    <div className="gimi-referral-overlay" onClick={handleOverlayClick}>
      <div className="gimi-referral-container">
        {/* Banner Image */}
        <div className="gimi-referral-banner">
          <img 
            src="/promo/gimi/Sogni Gimi Photobooth Banner.jpg" 
            alt="Gimi Challenge Banner" 
            className="gimi-referral-banner-image"
          />
          <div className="gimi-referral-banner-moneybag">💰</div>
          <div className="gimi-referral-banner-prize">$1,000</div>
        </div>

        {/* Content */}
        <div className="gimi-referral-content">
          <h2 className="gimi-referral-title">
            Completing the Gimi Photobooth Challenge?
          </h2>
          
          <p className="gimi-referral-message">
            Share this version of the Photobooth URL in your content to help ensure you get referral credit for your work!
          </p>

          <div className="gimi-referral-url-section">
            <label className="gimi-referral-label">Your URL is:</label>
            <div className="gimi-referral-url-container">
              <input 
                type="text" 
                value={referralUrl} 
                readOnly 
                className="gimi-referral-url-input"
                onClick={(e) => e.target.select()}
              />
              <button 
                className="gimi-referral-copy-button"
                onClick={handleCopyUrl}
              >
                {copied ? '✓ Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Checkbox */}
          <div className="gimi-referral-checkbox-container">
            <label className="gimi-referral-checkbox-label">
              <input 
                type="checkbox" 
                checked={dontRemindMe}
                onChange={(e) => setDontRemindMe(e.target.checked)}
                className="gimi-referral-checkbox"
              />
              <span>Dats cool, don't remind me again</span>
            </label>
          </div>

          {/* Close Button */}
          <button 
            className="gimi-referral-close-button"
            onClick={handleClose}
          >
            Got it!
          </button>
        </div>

        {/* X button in corner */}
        <button 
          className="gimi-referral-x-button"
          onClick={handleClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default GimiReferralPopup;

