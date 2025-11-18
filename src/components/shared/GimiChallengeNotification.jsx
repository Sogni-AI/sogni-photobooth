import React, { useState, useEffect } from 'react';
import { trackEvent } from '../../utils/analytics';
import { setCampaignSource } from '../../utils/campaignAttribution';
import '../../styles/shared/GimiChallengeNotification.css';

// MANUAL CONTROL: Set to true when you want to enable the campaign notification
const ENABLE_GIMI_NOTIFICATION = true;

const GimiChallengeNotification = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    // Manual control check - campaign notification disabled until manually enabled
    if (!ENABLE_GIMI_NOTIFICATION) {
      console.log('[Gimi Challenge] Campaign notification manually disabled');
      return;
    }

    // Check if campaign has started (Nov 10, 2025 12:00 PM PDT)
    const campaignStartTime = new Date('2025-11-10T12:00:00-08:00').getTime();
    const now = Date.now();

    if (now < campaignStartTime) {
      console.log('[Gimi Challenge] Campaign has not started yet');
      return;
    }

    // Check if NOTIFICATION was dismissed this session
    const notificationDismissedThisSession = sessionStorage.getItem('gimi-notification-dismissed-session');
    if (notificationDismissedThisSession === 'true') {
      console.log('[Gimi Challenge] Notification blocked - dismissed this session');
      return;
    }

    // Check 60-second cooldown for ANY Gimi popup (notification or referral)
    const lastGimiPopupTime = localStorage.getItem('gimi-last-popup-time');
    if (lastGimiPopupTime) {
      const timeSinceLastPopup = Date.now() - parseInt(lastGimiPopupTime, 10);
      const sixtySeconds = 60 * 1000;
      
      if (timeSinceLastPopup < sixtySeconds) {
        console.log('[Gimi Challenge] Notification blocked - 60s cooldown active');
        return;
      }
    }

    // Don't show notification if user has visited the challenge page
    // (they should see the referral popup on login instead)
    const hasVisited = localStorage.getItem('sogni_gimi_visit');
    if (hasVisited) {
      console.log('[Gimi Challenge] User visited challenge page - referral popup takes priority');
      return;
    }

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
      // Set the last popup time to prevent other popups for 60 seconds
      localStorage.setItem('gimi-last-popup-time', Date.now().toString());
      trackEvent('Gimi Challenge', 'notification_shown', 'Popup Notification');
    }, 5000);

    return () => clearTimeout(showTimer);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    trackEvent('Gimi Challenge', 'notification_dismissed', 'Popup Dismissed');
    // Set cookie with current timestamp
    setCookie('gimi-challenge-dismissed', Date.now().toString(), 1);
    // Mark as dismissed for this session (notification-specific)
    sessionStorage.setItem('gimi-notification-dismissed-session', 'true');
    console.log('[Gimi Challenge] Notification dismissed - blocked for rest of session');
    
    // Remove from DOM after animation
    setTimeout(() => {
      setShouldRender(false);
    }, 300);
  };

  const handleClick = () => {
    trackEvent('Gimi Challenge', 'notification_clicked', 'Popup Clicked');
    setCampaignSource('gimi-notification');
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
        {/* Rectangular version for desktop */}
        <img 
          src="/promo/gimi/Sogni Gimi Photobooth Banner.jpg" 
          alt="Gimi Challenge - Turn one photo into 8 viral posts and win $1,000" 
          className="gimi-notification-image"
        />
        <div className="gimi-notification-overlay">
          <div className="gimi-notification-moneybag">💰</div>
          <div className="gimi-notification-prize">$1,000</div>
        </div>
        
        {/* Circular version for mobile portrait */}
        <div className="gimi-notification-circle-container">
          <img 
            src="/promo/gimi/Sogni_Photobooth_gimi-800x800_v2f_green.png" 
            alt="Gimi Challenge - Turn one photo into 8 viral posts and win $1,000" 
            className="gimi-notification-circle-image"
          />
        </div>
        <div className="gimi-notification-badge">
          <div className="gimi-notification-badge-moneybag">💰</div>
          <div className="gimi-notification-badge-amount">$1K</div>
        </div>
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

