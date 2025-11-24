import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import '../../styles/WinterEventNotification.css';

const WinterEventNotification = ({ onNavigate }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has visited the winter page this session
    const hasVisitedWinter = sessionStorage.getItem('winter-page-visited');
    if (hasVisitedWinter) {
      return; // Don't show if they've already visited this session
    }

    // Check if user has dismissed today
    const lastDismissed = localStorage.getItem('winter-event-dismissed');
    const now = Date.now();

    if (lastDismissed) {
      const lastDismissedTime = parseInt(lastDismissed, 10);
      const hoursSinceDismissal = (now - lastDismissedTime) / (1000 * 60 * 60);

      // Don't show if dismissed within the last 24 hours
      if (hoursSinceDismissal < 24) {
        return;
      }
    }

    // Show notification after 10 seconds
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 10000);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = (e) => {
    e.stopPropagation();
    localStorage.setItem('winter-event-dismissed', Date.now().toString());
    setIsVisible(false);
  };

  const handleClick = () => {
    localStorage.setItem('winter-event-dismissed', Date.now().toString());
    sessionStorage.setItem('winter-page-visited', 'true'); // Mark as visited this session
    setIsVisible(false);
    onNavigate();
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="winter-event-notification" onClick={handleClick}>
      <button
        className="winter-notification-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss notification"
      >
        ×
      </button>
      <div className="winter-notification-image-container">
        <img
          src="/events/winter-preview.jpg"
          alt="Sogni Winter Event - 35+ instant winter-themed PFPs"
          className="winter-notification-image"
        />
      </div>
    </div>
  );
};

WinterEventNotification.propTypes = {
  onNavigate: PropTypes.func.isRequired
};

export default WinterEventNotification;

