import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import '../../styles/HalloweenNotificationTooltip.css';

const HALLOWEEN_IMAGES = [
  '/gallery/prompts/medium/sogni-photobooth-dream-stalker-raw.jpg',
  '/gallery/prompts/medium/sogni-photobooth-clown-from-hell-raw.jpg',
  '/gallery/prompts/medium/sogni-photobooth-corpse-bride-raw.jpg',
  '/gallery/prompts/medium/sogni-photobooth-haunted-prom-queen-raw.jpg',
  '/gallery/prompts/medium/sogni-photobooth-midsommar-bloom-raw.jpg'
];

const HalloweenNotificationTooltip = ({ onNavigate }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const { enable: enableMusic } = useMusicPlayer();

  useEffect(() => {
    // Check if we're past November 1, 2025
    const now = new Date();
    const cutoffDate = new Date('2025-11-01T00:00:00');

    if (now >= cutoffDate) {
      return; // Don't show after Nov 1
    }

    // Check if user has dismissed in this session
    const isDismissed = sessionStorage.getItem('halloween-contest-dismissed');

    if (!isDismissed) {
      // Small delay before showing for better UX
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, []);

  // Rotate through images only when expanded
  useEffect(() => {
    if (!isVisible || !isExpanded) return;

    const imageInterval = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % HALLOWEEN_IMAGES.length);
    }, 2000); // Change image every 2 seconds

    return () => clearInterval(imageInterval);
  }, [isVisible, isExpanded]);

  const handleDismiss = (e) => {
    e.stopPropagation();
    sessionStorage.setItem('halloween-contest-dismissed', 'true');
    setIsVisible(false);
  };

  const handleExpand = (e) => {
    e.stopPropagation();
    setIsExpanded(true);
    // Enable music player when expanding - start in open and playing state
    enableMusic({ autoPlay: true, expand: true });
  };

  const handleClick = () => {
    sessionStorage.setItem('halloween-contest-dismissed', 'true');
    setIsVisible(false);
    onNavigate();
  };

  if (!isVisible) {
    return null;
  }

  // Minimized pumpkin state
  if (!isExpanded) {
    return (
      <button 
        className="halloween-pumpkin-notification"
        onClick={handleExpand}
        aria-label="View Halloween contest information"
      >
        <button
          className="pumpkin-dismiss-btn"
          onClick={handleDismiss}
          aria-label="Dismiss pumpkin notification"
        >
          ✕
        </button>
        <span className="pumpkin-emoji">🎃</span>
        <span className="compete-bubble">
          <span className="compete-text">In the Halloween spirit?</span>
          <span className="compete-emoji">🎁</span>
        </span>
      </button>
    );
  }

  // Expanded state
  return (
    <div className="halloween-notification-tooltip" onClick={handleClick}>
      <button
        className="halloween-notification-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss notification"
      >
        ×
      </button>
      <div className="halloween-notification-content">
        <div className="halloween-notification-polaroid">
          <img
            src={HALLOWEEN_IMAGES[currentImageIndex]}
            alt="Halloween Contest"
            className="halloween-notification-preview"
          />
        </div>
        <div className="halloween-notification-text">
          <strong>Click here to view Halloween vibes!</strong>
          <p>More styles added each day.</p>
        </div>
        <span className="halloween-notification-icon">🎃</span>
      </div>
    </div>
  );
};

HalloweenNotificationTooltip.propTypes = {
  onNavigate: PropTypes.func.isRequired
};

export default HalloweenNotificationTooltip;

