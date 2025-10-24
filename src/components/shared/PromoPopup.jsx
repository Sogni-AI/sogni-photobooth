import React, { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import '../../styles/components/PromoPopup.css';

const PromoPopup = ({ isOpen, onClose }) => {
  const modalRef = useRef(null);
  const overlayRef = useRef(null);

  // Handle overlay click to close (more reliable on iOS/touch devices)
  const handleOverlayClick = (e) => {
    // Only close if clicking directly on the overlay, not on modal content
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Prevent modal content clicks from bubbling to overlay
  const handleModalClick = (e) => {
    e.stopPropagation();
  };

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

  const handleSignupClick = () => {
    window.open('https://app.sogni.ai/create?code=PHOTOBOOTH', '_blank');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="promo-modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="promo-modal" ref={modalRef} onClick={handleModalClick}>
        <button className="promo-modal-close" onClick={onClose}>×</button>
        
        <div className="promo-modal-header">
          <div className="promo-mascot">
            <img 
              src="/sloth_cam_hop_trnsparent.png" 
              alt="Sogni Sloth Camera" 
              className="sloth-mascot"
            />
          </div>
          <h2>Enjoying Photobooth?</h2>
        </div>
        
        <div className="promo-modal-content">
          <div className="promo-message">
            <h3>Unlock the Full Power of Sogni!</h3>
            <p>
              Take your creativity to the next level with our complete AI art platform.
              Get <strong>100 FREE render credits</strong> now.
            </p>            
          </div>
        </div>
        
        <div className="promo-modal-footer">
          <button 
            className="promo-signup-btn" 
            onClick={handleSignupClick}
          >
            <span className="signup-text">Get 100 Free Credits</span>
            <span className="signup-arrow">→</span>
          </button>
          
          <button 
            className="promo-maybe-later" 
            onClick={onClose}
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
};

PromoPopup.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default PromoPopup; 