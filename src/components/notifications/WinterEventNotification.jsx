import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import '../../styles/WinterEventNotification.css';

const WinterEventNotification = ({ onNavigate }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

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

    // Show snowflake after 10 seconds
    const showTimer = setTimeout(() => {
      setIsVisible(true);
    }, 10000);

    return () => clearTimeout(showTimer);
  }, []);

  // Auto-expand after 3 seconds of showing snowflake
  useEffect(() => {
    if (!isVisible || isExpanded) return;

    const expandTimer = setTimeout(() => {
      setIsExpanded(true);
    }, 3000);

    return () => clearTimeout(expandTimer);
  }, [isVisible, isExpanded]);

  const handleDismiss = (e) => {
    e.stopPropagation();
    localStorage.setItem('winter-event-dismissed', Date.now().toString());
    setIsVisible(false);
  };

  const handleExpand = (e) => {
    e.stopPropagation();
    setIsExpanded(true);
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

  // Snowflake stage
  if (!isExpanded) {
    return (
      <button 
        className="winter-snowflake-notification"
        onClick={handleExpand}
        aria-label="View Winter event information"
      >
        <button
          className="snowflake-notification-dismiss-btn"
          onClick={handleDismiss}
          aria-label="Dismiss snowflake notification"
        >
          ✕
        </button>
        <div className="snowflake-notification-face">
          <span className="snowflake-notification-emoji">❄️</span>
          <span className="snowflake-notification-eyes">👀</span>
          <span className="snowflake-notification-mouth">◡</span>
        </div>
        <span className="winter-bubble">
          <span className="winter-bubble-text">Feeling festive?</span>
          <span className="winter-bubble-emoji">🎄</span>
        </span>
      </button>
    );
  }

  // Expanded banner stage
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

