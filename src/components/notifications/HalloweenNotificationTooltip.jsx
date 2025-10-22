import React, { useState, useEffect } from 'react';
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
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

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

  // Rotate through images
  useEffect(() => {
    if (!isVisible) return;

    const imageInterval = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % HALLOWEEN_IMAGES.length);
    }, 2000); // Change image every 2 seconds

    return () => clearInterval(imageInterval);
  }, [isVisible]);

  const handleDismiss = (e) => {
    e.stopPropagation();
    sessionStorage.setItem('halloween-contest-dismissed', 'true');
    setIsVisible(false);
  };

  const handleClick = () => {
    sessionStorage.setItem('halloween-contest-dismissed', 'true');
    setIsVisible(false);
    onNavigate();
  };

  if (!isVisible) {
    return null;
  }

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
          <strong>Halloween Contest Submissions Open</strong>
          <p>40,000 render credits up for grabs! 🎁</p>
        </div>
        <span className="halloween-notification-icon">🎃</span>
      </div>
    </div>
  );
};

export default HalloweenNotificationTooltip;

