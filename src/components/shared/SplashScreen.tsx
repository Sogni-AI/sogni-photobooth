import React, { useState, useEffect } from 'react';
import urls from '../../config/urls';
import './SplashScreen.css';

// Updated key for splash screen visibility to force existing users to see it
const SPLASH_HIDDEN_KEY = 'sogni_splash_v2_hidden';
const AUDIO_ENABLED_KEY = 'sogni_splash_audio_enabled';

interface SplashScreenProps {
  onDismiss: () => void;
  bypassLocalStorage?: boolean; // When true, ignores localStorage dismissal preference
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onDismiss, bypassLocalStorage = false }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isHiding, setIsHiding] = useState(false);
  const [hasCheckedStorage, setHasCheckedStorage] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(() => {
    // Initialize with saved preference immediately
    const savedAudioState = localStorage.getItem(AUDIO_ENABLED_KEY);
    return savedAudioState === 'true';
  });
  const [videoRef, setVideoRef] = useState<HTMLVideoElement | null>(null);

  // Check localStorage on component mount
  useEffect(() => {
    console.log('🎬 SplashScreen component mounted', { bypassLocalStorage });
    const splashHidden = localStorage.getItem(SPLASH_HIDDEN_KEY);
    console.log('🎬 Splash hidden in localStorage:', splashHidden);
    
    if (splashHidden === 'true' && !isHiding && !bypassLocalStorage) {
      console.log('🎬 Auto-dismissing splash screen due to localStorage');
      onDismiss(); // Immediately dismiss if previously hidden
    } else if (bypassLocalStorage) {
      console.log('🎬 Bypassing localStorage check - showing splash screen for inactivity');
    }
    
    setHasCheckedStorage(true);
    console.log('🎬 SplashScreen ready to render');
  }, [bypassLocalStorage]); // Add bypassLocalStorage to dependency array

  // Handle dismissing the splash screen
  const handleDismiss = () => {
    setIsHiding(true);
    // Save preference to localStorage
    localStorage.setItem(SPLASH_HIDDEN_KEY, 'true');
    
    // Wait for animation to complete before calling onDismiss
    // Add extra time to ensure animations complete fully
    setTimeout(() => {
      setIsVisible(false);
      onDismiss();
    }, 2000);
  };

  // Handle audio toggle
  const handleAudioToggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent splash screen dismissal
    if (videoRef) {
      const newAudioState = !isAudioEnabled;
      setIsAudioEnabled(newAudioState);
      videoRef.muted = !newAudioState;
      
      // Save audio preference to localStorage immediately
      localStorage.setItem(AUDIO_ENABLED_KEY, newAudioState.toString());
      console.log('🔊 Audio setting saved to localStorage:', newAudioState);
    }
  };

  // Don't render anything until we've checked localStorage
  if (!hasCheckedStorage || !isVisible) {
    console.log('🎬 SplashScreen not rendering:', { hasCheckedStorage, isVisible });
    return null;
  }
  
  console.log('🎬 SplashScreen rendering with state:', { hasCheckedStorage, isVisible, isHiding });

  return (
    <div 
      className={`splash-screen ${isHiding ? 'hiding' : ''}`}
      onClick={handleDismiss}
    >
      {/* Audio Toggle Button */}
      <button 
        className="audio-toggle-btn"
        onClick={handleAudioToggle}
        aria-label={isAudioEnabled ? "Mute audio" : "Unmute audio"}
      >
        {isAudioEnabled ? (
          // Audio ON icon
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" fill="currentColor"/>
          </svg>
        ) : (
          // Audio OFF icon
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" fill="currentColor"/>
          </svg>
        )}
      </button>
      
      <div className="splash-content">
        
        <div className="splash-layout">
          <div className="polaroid-splash-container">
            <img 
              src="/polaroid-camera.png" 
              alt="Polaroid Camera" 
              className="polaroid-image" 
            />
            <div className="camera-bubble">ready 2 create magic? 📸</div>
          </div>
          
          <div className="video-container">
            <video 
              ref={(el) => setVideoRef(el)}
              src={`${urls.assetUrl}/videos/photobooth-small-yellow-40kbps.mp4`}
              autoPlay
              loop
              playsInline
              muted={!isAudioEnabled}
              disableRemotePlayback
              className="splash-video"
              onLoadedData={(e) => {
                const video = e.target as HTMLVideoElement;
                
                // Re-read from localStorage in case it changed since component initialization
                const currentAudioSetting = localStorage.getItem(AUDIO_ENABLED_KEY) === 'true';
                if (currentAudioSetting !== isAudioEnabled) {
                  setIsAudioEnabled(currentAudioSetting);
                }
                
                // Set initial muted state based on current preference
                video.muted = !currentAudioSetting;
                console.log('🔊 Video loaded with audio setting:', currentAudioSetting ? 'ON' : 'OFF');
                
                // Try to play with current audio setting
                video.play().catch(() => {
                  // If autoplay fails (likely due to audio), mute and try again
                  console.log('🔊 Autoplay failed, falling back to muted');
                  video.muted = true;
                  setIsAudioEnabled(false);
                  localStorage.setItem(AUDIO_ENABLED_KEY, 'false');
                  video.play();
                });
              }}
            />
          </div>
        </div>
        
        <div className="splash-cta-section">
          <h2 className="splash-tagline" onClick={handleDismiss}>
            Let&apos;s Gooo! 🚀
          </h2>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen; 