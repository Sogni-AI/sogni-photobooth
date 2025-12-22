import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import '../../styles/shared/TransitionVideoCompleteNotification.css';

const TransitionVideoCompleteNotification = ({ 
  isVisible, 
  videoCount, 
  onViewVideo, 
  onDismiss 
}) => {
  const [shouldRender, setShouldRender] = useState(false);
  const [animationStage, setAnimationStage] = useState('entering'); // entering, visible, exiting

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      // Start entrance animation
      setTimeout(() => {
        setAnimationStage('visible');
      }, 50);
    } else if (shouldRender) {
      // Start exit animation
      setAnimationStage('exiting');
      setTimeout(() => {
        setShouldRender(false);
        setAnimationStage('entering');
      }, 400);
    }
  }, [isVisible, shouldRender]);

  if (!shouldRender) {
    return null;
  }

  const handleViewClick = () => {
    if (onViewVideo) {
      onViewVideo();
    }
    if (onDismiss) {
      onDismiss();
    }
  };

  const handleDismiss = (e) => {
    e.stopPropagation();
    if (onDismiss) {
      onDismiss();
    }
  };

  return (
    <div 
      className={`transition-video-notification ${animationStage}`}
      onClick={handleViewClick}
    >
      <button 
        className="transition-video-notification-close" 
        onClick={handleDismiss}
        aria-label="Close notification"
      >
        ×
      </button>
      
      <div className="transition-video-notification-content">
        {/* Animated emoji icons */}
        <div className="transition-video-notification-icons">
          <div className="transition-video-notification-icon transition-video-notification-icon-1">🎬</div>
          <div className="transition-video-notification-icon transition-video-notification-icon-2">✨</div>
          <div className="transition-video-notification-icon transition-video-notification-icon-3">🎉</div>
        </div>

        {/* Main message */}
        <div className="transition-video-notification-title">
          <span className="transition-video-notification-title-text">
            Your Video is Ready!
          </span>
          <div className="transition-video-notification-sparkle">✨</div>
        </div>

        {/* Call to action button */}
        <div className="transition-video-notification-cta">
          <span className="transition-video-notification-cta-text">
            Tap to View Your Masterpiece
          </span>
          <div className="transition-video-notification-arrow">→</div>
        </div>

        {/* Decorative elements */}
        <div className="transition-video-notification-particles">
          {[...Array(12)].map((_, i) => (
            <div 
              key={i} 
              className="transition-video-notification-particle"
              style={{
                '--particle-delay': `${i * 0.1}s`,
                '--particle-index': i
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

TransitionVideoCompleteNotification.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  videoCount: PropTypes.number.isRequired,
  onViewVideo: PropTypes.func.isRequired,
  onDismiss: PropTypes.func
};

export default TransitionVideoCompleteNotification;

