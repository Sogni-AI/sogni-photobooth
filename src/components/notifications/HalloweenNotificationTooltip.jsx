import React, { useState, useEffect } from 'react';
import '../../styles/HalloweenNotificationTooltip.css';

const HalloweenNotificationTooltip = ({ onNavigate }) => {
  const [isVisible, setIsVisible] = useState(false);

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
        <span className="halloween-notification-icon">🎃</span>
        <div className="halloween-notification-text">
          <strong>Halloween Contest Running!</strong>
          <p>Click to enter the spooky photo contest</p>
        </div>
      </div>
    </div>
  );
};

export default HalloweenNotificationTooltip;

