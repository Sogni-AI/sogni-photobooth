import React, { useRef, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import '../../styles/components/OutOfCreditsPopup.css';

const OutOfCreditsPopup = ({ isOpen, onClose, onPurchase, balances, currentTokenType, estimatedCost, onSwitchPaymentMethod }) => {
  const modalRef = useRef(null);
  const overlayRef = useRef(null);
  const [showSwitchSuggestion, setShowSwitchSuggestion] = useState(false);
  const [alternativeTokenType, setAlternativeTokenType] = useState(null);

  // Check if switching to the alternative payment method would solve the problem
  useEffect(() => {
    if (!isOpen || !balances || !currentTokenType || !estimatedCost || !onSwitchPaymentMethod) {
      setShowSwitchSuggestion(false);
      setAlternativeTokenType(null);
      return;
    }

    // Determine the alternative token type
    const altTokenType = currentTokenType === 'spark' ? 'sogni' : 'spark';
    
    // Get current and alternative balances
    const currentBalance = parseFloat(balances[currentTokenType]?.net || '0');
    const alternativeBalance = parseFloat(balances[altTokenType]?.net || '0');

    // Check if current wallet is insufficient but alternative has enough
    if (currentBalance < estimatedCost && alternativeBalance >= estimatedCost) {
      setShowSwitchSuggestion(true);
      setAlternativeTokenType(altTokenType);
    } else {
      setShowSwitchSuggestion(false);
      setAlternativeTokenType(null);
    }
  }, [isOpen, balances, currentTokenType, estimatedCost, onSwitchPaymentMethod]);

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

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  // Fix viewport height for incognito mode and ensure popup is visible
  useEffect(() => {
    if (isOpen && overlayRef.current) {
      // Update CSS custom property for accurate viewport height
      const updateViewportHeight = () => {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
      };

      // Set initial viewport height
      updateViewportHeight();

      // Ensure popup is scrolled into view if it's positioned off-screen
      const ensureVisibility = () => {
        if (overlayRef.current) {
          const rect = overlayRef.current.getBoundingClientRect();
          if (rect.top < 0 || rect.bottom > window.innerHeight) {
            overlayRef.current.scrollIntoView({
              behavior: 'smooth',
              block: 'center'
            });
          }
        }
      };

      // Small delay to ensure DOM is updated
      const timer = setTimeout(() => {
        ensureVisibility();
      }, 100);

      // Listen for resize events while popup is open
      window.addEventListener('resize', updateViewportHeight);
      window.addEventListener('orientationchange', updateViewportHeight);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', updateViewportHeight);
        window.removeEventListener('orientationchange', updateViewportHeight);
      };
    }
  }, [isOpen]);

  const handleGetCreditsClick = () => {
    // If onPurchase is provided, use it to open the Stripe modal
    if (onPurchase) {
      onPurchase();
      onClose();
    } else {
      // Fallback to external link
      window.open('https://app.sogni.ai/wallet', '_blank');
      onClose();
    }
  };

  const handleInfoItemClick = () => {
    // If onPurchase is provided, use it for the purchase option
    if (onPurchase) {
      onPurchase();
      onClose();
    } else {
      window.open('https://app.sogni.ai/wallet', '_blank');
    }
  };

  const handleSwitchWallet = () => {
    if (onSwitchPaymentMethod && alternativeTokenType) {
      onSwitchPaymentMethod(alternativeTokenType);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="out-of-credits-modal-overlay" ref={overlayRef}>
      <div className="out-of-credits-modal" ref={modalRef}>
        <button className="out-of-credits-modal-close" onClick={onClose}>×</button>

        <div className="out-of-credits-modal-header">
          <div className="out-of-credits-mascot">
            <img
              src="/sloth_cam_hop_trnsparent.png"
              alt="Sogni Sloth Camera"
              className="sloth-mascot"
            />
          </div>
          <h2>Uh oh! You&apos;re out of credits!</h2>
        </div>

        <div className="out-of-credits-modal-content">
          <div className="out-of-credits-message">
            {showSwitchSuggestion ? (
              <>
                <p className="message-main">
                  Good news! You have enough {alternativeTokenType === 'spark' ? 'Spark Points' : 'SOGNI'} in your other wallet.
                </p>
                <div className="credits-info">
                  <div className="info-item switch-wallet-item" onClick={handleSwitchWallet}>
                    <span className="info-icon">🔄</span>
                    <span className="info-text">
                      Switch to <strong>{alternativeTokenType === 'spark' ? 'Spark Points' : 'SOGNI'}</strong> wallet
                    </span>
                  </div>
                  <div className="info-item" onClick={handleInfoItemClick}>
                    <span className="info-icon">🎁</span>
                    <span className="info-text">Check for <strong>free daily credits</strong></span>
                  </div>
                  <div className="info-item" onClick={handleInfoItemClick}>
                    <span className="info-icon">💳</span>
                    <span className="info-text">Buy more render credits</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="message-main">
                  You can get back to creating in no time.
                </p>
                <div className="credits-info">
                  <div className="info-item" onClick={handleInfoItemClick}>
                    <span className="info-icon">🎁</span>
                    <span className="info-text">Check for <strong>free daily credits</strong></span>
                  </div>
                  <div className="info-item" onClick={handleInfoItemClick}>
                    <span className="info-icon">💳</span>
                    <span className="info-text">Buy more render credits</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="out-of-credits-modal-footer">
          {showSwitchSuggestion ? (
            <>
              <button
                className="out-of-credits-get-credits-btn out-of-credits-switch-btn"
                onClick={handleSwitchWallet}
              >
                <span className="get-credits-text">Switch Wallet & Continue</span>
                <span className="get-credits-arrow">→</span>
              </button>
              <button
                className="out-of-credits-close-btn"
                onClick={onClose}
              >
                Close
              </button>
            </>
          ) : (
            <>
              <button
                className="out-of-credits-get-credits-btn"
                onClick={handleGetCreditsClick}
              >
                <span className="get-credits-text">Get More Credits</span>
                <span className="get-credits-arrow">→</span>
              </button>
              <button
                className="out-of-credits-close-btn"
                onClick={onClose}
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

OutOfCreditsPopup.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onPurchase: PropTypes.func,
  balances: PropTypes.object,
  currentTokenType: PropTypes.oneOf(['spark', 'sogni']),
  estimatedCost: PropTypes.number,
  onSwitchPaymentMethod: PropTypes.func,
};

export default OutOfCreditsPopup;

