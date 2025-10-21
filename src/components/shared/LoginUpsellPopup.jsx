import React, { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { redirectToAuth } from '../../config/auth';
import '../../styles/components/OutOfCreditsPopup.css';

const LoginUpsellPopup = ({ isOpen, onClose }) => {
  const modalRef = useRef(null);
  const overlayRef = useRef(null);

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

  const handleGetStartedClick = () => {
    // app.sogni.ai automatically shows signup for new users, login for existing users
    redirectToAuth('login');
    onClose();
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
          <h2>Ready for more?</h2>
        </div>

        <div className="out-of-credits-modal-content">
          <div className="out-of-credits-message">
            <p className="message-main">
              You&apos;ve used your free demo render! Create an account to unlock unlimited creativity.
            </p>
            <div className="credits-info">
              <div className="info-item">
                <span className="info-icon">🎁</span>
                <span className="info-text">Get <strong>100 free credits</strong> on signup</span>
              </div>
              <div className="info-item">
                <span className="info-icon">✨</span>
                <span className="info-text">Access to all styles and models</span>
              </div>
              <div className="info-item">
                <span className="info-icon">💎</span>
                <span className="info-text">Daily free credits</span>
              </div>
            </div>
          </div>
        </div>

        <div className="out-of-credits-modal-footer">
          <button
            className="out-of-credits-get-credits-btn"
            onClick={handleGetStartedClick}
          >
            <span className="get-credits-text">Get Started Free</span>
            <span className="get-credits-arrow">→</span>
          </button>

          <button
            className="out-of-credits-close-btn"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

LoginUpsellPopup.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default LoginUpsellPopup;

