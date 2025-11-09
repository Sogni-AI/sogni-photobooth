import React, { useState, useEffect } from 'react';
import '../../styles/shared/GimiChallengeNotification.css';

const GimiChallengeNotification = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    // Check if notification was dismissed recently (within 24 hours)
    const dismissedTime = getCookie('gimi-challenge-dismissed');
    if (dismissedTime) {
      const timeSinceDismissal = Date.now() - parseInt(dismissedTime, 10);
      const twentyFourHours = 24 * 60 * 60 * 1000;
      
      if (timeSinceDismissal < twentyFourHours) {
        // Don't show if dismissed within last 24 hours
        return;
      }
    }

    // Show notification after 5 seconds
    setShouldRender(true);
    const showTimer = setTimeout(() => {
      setIsVisible(true);
    }, 5000);

    return () => clearTimeout(showTimer);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    // Set cookie with current timestamp
    setCookie('gimi-challenge-dismissed', Date.now().toString(), 1);
    
    // Remove from DOM after animation
    setTimeout(() => {
      setShouldRender(false);
    }, 300);
  };

  const handleClick = () => {
    window.location.href = '/challenge/gimi';
  };

  if (!shouldRender) {
    return null;
  }

  return (
    <div className={`gimi-notification ${isVisible ? 'gimi-notification-visible' : ''}`}>
      <button 
        className="gimi-notification-close" 
        onClick={handleDismiss}
        aria-label="Close notification"
      >
        ×
      </button>
      <div className="gimi-notification-content" onClick={handleClick}>
        <img 
          src="/promo/gimi/Photobooth_gimi-1920x400.jpg" 
          alt="Gimi Challenge - Turn one photo into 8 viral posts and win $2,000" 
          className="gimi-notification-image"
        />
      </div>
    </div>
  );
};

// Cookie helper functions
function setCookie(name, value, days) {
  let expires = '';
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = '; expires=' + date.toUTCString();
  }
  document.cookie = name + '=' + (value || '') + expires + '; path=/';
}

function getCookie(name) {
  const nameEQ = name + '=';
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

export default GimiChallengeNotification;

