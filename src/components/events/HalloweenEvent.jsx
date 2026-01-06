import React, { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import HalloweenPromptPopup from './HalloweenPromptPopup';
import { AuthStatus } from '../auth/AuthStatus';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import { useApp } from '../../context/AppContext';
import { useNavigation } from '../AppRouter';
import { styleIdToDisplay } from '../../utils';
import { getAttributionText, hasPromptAttribution } from '../../config/ugcAttributions';
import { generateGalleryFilename } from '../../utils/galleryLoader';
import urls from '../../config/urls';
import promptsDataRaw from '../../prompts.json';
import '../../styles/film-strip.css'; // Reuse existing film-strip styles
import '../../styles/events/HalloweenEvent.css';

const HalloweenEvent = () => {
  const [showPromptPopup, setShowPromptPopup] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false); // Start minimized (pumpkin button only)
  const [selectedStyleKey, setSelectedStyleKey] = useState(null); // Track selected style for mobile two-click
  const [pumpkinDismissed, setPumpkinDismissed] = useState(false);
  const [showPumpkinButton, setShowPumpkinButton] = useState(false); // Delayed appearance
  const [portraitType, setPortraitType] = useState('medium'); // 'headshot' or 'medium'
  const { isEnabled, enable: enableMusic } = useMusicPlayer();
  const { updateSetting, stylePrompts } = useApp();
  const { navigateToCamera, navigateToContestVote } = useNavigation();

  const handleDismissOverlay = () => {
    setShowOverlay(false);
  };

  const handleDismissPumpkin = (e) => {
    e.stopPropagation(); // Prevent expanding the overlay
    setPumpkinDismissed(true);
  };

  // Dynamically generate Halloween styles from prompts.json
  // Sort: UGC-attributed prompts first, then alphabetically
  // Update image paths based on selected portrait type
  const halloweenStyles = useMemo(() => {
    const halloweenPrompts = promptsDataRaw.halloween?.prompts || {};
    // Portrait type is used directly as the subdirectory name
    const folder = portraitType || 'medium';

    return Object.keys(halloweenPrompts)
      .sort((a, b) => {
        // Check if either has attribution
        const aHasAttribution = hasPromptAttribution(a);
        const bHasAttribution = hasPromptAttribution(b);
        
        // Prioritize attributed prompts
        if (aHasAttribution && !bHasAttribution) return -1;
        if (!aHasAttribution && bHasAttribution) return 1;
        
        // If both have attribution or both don't, sort alphabetically
        return styleIdToDisplay(a).localeCompare(styleIdToDisplay(b));
      })
      .map(key => ({
        key,
        img: `${urls.assetUrl}/gallery/prompts/${folder}/${generateGalleryFilename(key)}`,
        title: styleIdToDisplay(key),
        hasAttribution: hasPromptAttribution(key)
      }));
  }, [portraitType]);

  // Enable music player when component mounts (but not expanded)
  React.useEffect(() => {
    if (!isEnabled) {
      enableMusic();
    }
  }, [isEnabled, enableMusic]);

  // Mark Halloween notification as dismissed when visiting the Halloween event page
  React.useEffect(() => {
    sessionStorage.setItem('halloween-contest-dismissed', 'true');
  }, []);

  // Delay pumpkin button appearance by 5 seconds
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setShowPumpkinButton(true);
    }, 5000); // 5 seconds

    return () => clearTimeout(timer);
  }, []);

  const handlePromptSubmit = (prompt) => {
    // Store the prompt in app settings (synchronously saved to cookies)
    console.log('🎃 Halloween prompt submitted:', prompt);
    updateSetting('positivePrompt', prompt);
    updateSetting('selectedStyle', 'custom');
    // Contest is over - no longer setting halloweenContext flag
    
    // Mark that user has explicitly selected a style (for checkmark in CameraStartMenu)
    localStorage.setItem('sogni_style_explicitly_selected', 'true');

    // Navigate to main app (skip splash screen, go directly to start menu)
    console.log('🎃 Navigating to camera start menu');
    navigateToCamera();
  };

  const handleStyleSelect = (styleKey) => {
    // Check if we're on mobile (screen width <= 768px)
    const isMobile = window.innerWidth <= 768;

    // On mobile: first click shows overlay, second click confirms
    if (isMobile) {
      if (selectedStyleKey === styleKey) {
        // Second click - proceed with selection
        console.log('🎃 Halloween style confirmed:', styleKey);
        proceedWithStyleSelection(styleKey);
      } else {
        // First click - show overlay
        console.log('🎃 Halloween style preview:', styleKey);
        setSelectedStyleKey(styleKey);
      }
    } else {
      // Desktop - proceed immediately
      console.log('🎃 Halloween style selected:', styleKey);
      proceedWithStyleSelection(styleKey);
    }
  };

  const proceedWithStyleSelection = (styleKey) => {
    // Get the prompt for this style from Halloween prompts
    const halloweenPrompts = promptsDataRaw.halloween?.prompts || {};
    const prompt = halloweenPrompts[styleKey] || stylePrompts[styleKey] || '';
    
    console.log('🎃 Selected prompt:', prompt);
    
    // Set the style and prompt
    updateSetting('selectedStyle', styleKey);
    updateSetting('positivePrompt', prompt);
    // Contest is over - no longer setting halloweenContext flag
    
    // Mark that user has explicitly selected a style (for checkmark in CameraStartMenu)
    localStorage.setItem('sogni_style_explicitly_selected', 'true');

    // Navigate to main app (skip splash screen, go directly to start menu)
    console.log('🎃 Navigating to camera start menu');
    navigateToCamera();
  };

  return (
    <div className="halloween-event">
      <Helmet>
        <title>🎃 Sogni Halloween Photobooth Costume Party 👻</title>
        <meta name="description" content="Create the perfect Halloween costume using AI! Win 40,000 Premium Sparks. Share your creation and enter the contest. Deadline: Oct 27" />
        
        {/* Open Graph / Facebook */}
        <meta property="og:title" content="🎃 Sogni Halloween Photobooth Costume Party 👻" />
        <meta property="og:description" content="Create the perfect Halloween costume using AI! Win 40,000 Premium Sparks. Share your creation and enter the contest. Deadline: Oct 27" />
        <meta property="og:image" content="https://photobooth.sogni.ai/halloween_bg.jpg" />
        <meta property="og:url" content="https://photobooth.sogni.ai/event/halloween" />
        <meta property="og:type" content="website" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="🎃 Sogni Halloween Photobooth Costume Party 👻" />
        <meta name="twitter:description" content="Create the perfect Halloween costume using AI! Win 40,000 Premium Sparks. Share your creation and enter the contest. Deadline: Oct 27" />
        <meta name="twitter:image" content="https://photobooth.sogni.ai/halloween_bg.jpg" />
        <meta property="twitter:url" content="https://photobooth.sogni.ai/event/halloween" />
      </Helmet>

      {/* Authentication Status - top-left */}
      <div className="halloween-auth-status">
        <AuthStatus />
      </div>


      {/* Full Halloween Style Grid - takes up full page */}
      <div className="film-strip-container visible halloween-film-strip">
        {/* Floating Halloween decorations - inside scrolling container */}
        <div className="halloween-decorations">
          <div className="floating-ghost ghost-1">👻</div>
          <div className="floating-ghost ghost-2">👻</div>
          <div className="floating-pumpkin pumpkin-1">🎃</div>
          <div className="floating-pumpkin pumpkin-2">🎃</div>
          <div className="floating-bat bat-1">🦇</div>
          <div className="floating-bat bat-2">🦇</div>
          <div className="floating-bat bat-3">🦇</div>
          <div className="floating-spider spider-1">🕷️</div>
          <div className="floating-spider spider-2">🕷️</div>
        </div>

        {/* Collapsed pumpkin button - scrolls with page, appears after 5 seconds */}
        {!showOverlay && !pumpkinDismissed && showPumpkinButton && (
          <button 
            className="halloween-pumpkin-button"
            onClick={() => setShowPromptPopup(true)}
            aria-label="Create your own costume"
          >
            <button
              className="pumpkin-dismiss-btn"
              onClick={handleDismissPumpkin}
              aria-label="Dismiss pumpkin notification"
            >
              ✕
            </button>
            <span className="pumpkin-emoji">🎃</span>
            <span className="compete-bubble">
              <span className="compete-text">Create your own costume?</span>
              <span className="compete-emoji">✨</span>
            </span>
          </button>
        )}

        {/* Header - positioned absolutely at top */}
        <header className="halloween-header">
          <h1 className="halloween-title">
            <span className="pumpkin-icon">🎃</span>
            Sogni Halloween Photobooth
            <span className="ghost-icon">👻</span>
          </h1>

          {/* Portrait Type Selector - 3 circular buttons */}
          <div className="halloween-portrait-selector">
            <div 
              style={{ position: 'relative' }} 
              className="portrait-type-button-container"
              onMouseEnter={(e) => {
                if (portraitType !== 'headshot') {
                  const label = e.currentTarget.querySelector('.portrait-type-label');
                  if (label) label.style.opacity = '1';
                }
              }}
              onMouseLeave={(e) => {
                const label = e.currentTarget.querySelector('.portrait-type-label');
                if (label) label.style.opacity = '0';
              }}
            >
              <button 
                onClick={() => setPortraitType('headshot')}
                className="halloween-portrait-btn"
                style={{
                  border: portraitType === 'headshot' ? '3px solid #ff6b00' : '3px solid rgba(45, 24, 16, 0.3)',
                  boxShadow: portraitType === 'headshot' ? '0 0 12px rgba(255, 107, 0, 0.6)' : '0 2px 8px rgba(0,0,0,0.2)'
                }}
                title="Up Close"
              >
                <img 
                  src="/gallery/sample-gallery-headshot-einstein.jpg"
                  alt="Up Close"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block'
                  }}
                />
              </button>
              <span className="portrait-type-label halloween-label">
                NEAR
              </span>
            </div>
            
            <button 
              onClick={() => setPortraitType('medium')}
              className="halloween-portrait-btn"
              style={{
                border: portraitType === 'medium' ? '3px solid #ff6b00' : '3px solid rgba(45, 24, 16, 0.3)',
                boxShadow: portraitType === 'medium' ? '0 0 12px rgba(255, 107, 0, 0.6)' : '0 2px 8px rgba(0,0,0,0.2)'
              }}
              title="Waist-Up"
            >
              <img 
                src="/gallery/sample-gallery-medium-body-jen.jpg"
                alt="Waist-Up"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block'
                }}
              />
            </button>
          </div>
        </header>

        {/* Photo grid using film-strip-content for consistent styling */}
        <div className="film-strip-content prompt-selector-mode">
          {halloweenStyles.map((style) => (
            <div
              key={style.key}
              className={`film-frame loaded halloween-style-frame ${selectedStyleKey === style.key ? 'mobile-selected' : ''}`}
              onClick={() => handleStyleSelect(style.key)}
              style={{
                width: '100%',
                margin: '0 auto',
                backgroundColor: 'white',
                position: 'relative',
                borderRadius: '2px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                display: 'flex',
                flexDirection: 'column',
                cursor: 'pointer'
              }}
            >
              <div style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '832/1216', // Always 2:3 ratio for display
                overflow: 'hidden'
              }}>
                <img
                  src={style.img}
                  alt={style.title}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    objectPosition: 'center'
                  }}
                />
                
                {/* Community Badge - Only show for UGC attributed prompts */}
                {style.hasAttribution && (
                  <div className="halloween-community-badge" title="Community Created">
                    <span className="community-icon">🏅</span>
                  </div>
                )}

                {/* Hover overlay with "Use this costume" */}
                <div className="halloween-hover-overlay">
                  <div className="use-costume-text">Use this costume</div>
                  {/* UGC Attribution - Only show when there's an attribution */}
                  {getAttributionText(style.key) && (
                    <span className="halloween-attribution">
                      {getAttributionText(style.key)}
                    </span>
                  )}
                </div>
              </div>
              <div className="photo-label" style={{
                position: 'absolute',
                bottom: '8px',
                left: '5px',
                right: '5px',
                height: '40px',
                display: 'block',
                lineHeight: '40px',
                textAlign: 'center',
                fontFamily: '"Permanent Marker", cursive',
                fontSize: '24px',
                color: '#333',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                fontWeight: '500'
              }}>
                {style.title}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Contest Information Overlay (dismissable) - OUTSIDE scrolling container */}
      {showOverlay && (
        <div className="halloween-overlay">
          <button
            className="overlay-dismiss-btn"
            onClick={handleDismissOverlay}
            aria-label="Close contest information"
          >
            ✕
          </button>

          <div className="halloween-contest">
            <div className="contest-card">
              <h2 className="contest-title">
                🎃 <span className="photobooth-prefix">Photobooth </span>Costume Party Challenge 🕸️✨
              </h2>

              <div className="contest-description">
                <p>
                  <span className="mission-prefix">Your mission? </span>Create the perfect Halloween costume look.<br/>
                  Winning entries will be added to our <a href="/?page=prompts&themes=halloween" className="style-library-link">style library</a>.
                </p>
              </div>

              <div className="how-to-win">
                <h3>🎨✨ How to Win ✨🎨</h3>
                <ul>
                  <li>1️⃣ Create a photobooth image using your own creative prompt (must log in)</li>
                  <li>2️⃣ Share your creation on Twitter with the in-app share by Oct 27.</li>
                  <li>
                  🏆 Prize Pool: <span className="highlight">40,000 Premium Sparks</span> between winners
                  </li>
                </ul>
              </div>

              <div className="halloween-inspiration">
                <div className="halloween-gallery">
                  <div className="halloween-polaroid">
                    <img src={`${urls.assetUrl}/gallery/prompts/medium/sogni-photobooth-dream-stalker-raw.jpg`} alt="Dream Stalker" />
                  </div>
                  <div className="halloween-polaroid">
                    <img src={`${urls.assetUrl}/gallery/prompts/medium/sogni-photobooth-clown-from-hell-raw.jpg`} alt="Clown from Hell" />
                  </div>
                  <div className="halloween-polaroid">
                    <img src={`${urls.assetUrl}/gallery/prompts/medium/sogni-photobooth-corpse-bride-raw.jpg`} alt="Corpse Bride" />
                  </div>
                  <div className="halloween-polaroid">
                    <img src={`${urls.assetUrl}/gallery/prompts/medium/sogni-photobooth-haunted-prom-queen-raw.jpg`} alt="Haunted Prom Queen" />
                  </div>
                  <div className="halloween-polaroid">
                    <img src={`${urls.assetUrl}/gallery/prompts/medium/sogni-photobooth-midsommar-bloom-raw.jpg`} alt="Midsommar Bloom" />
                  </div>
                </div>
              </div>

              <button
                className="start-creating-btn"
                onClick={() => setShowPromptPopup(true)}
              >
                <span className="btn-icon">🎨</span>
                Creating A New Costume
                <span className="btn-icon">✨</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Background Images */}
      <div className="halloween-background-image halloween-background-left" />
      <div className="halloween-background-image halloween-background-right" />

      {/* Prompt Popup */}
      <HalloweenPromptPopup
        isOpen={showPromptPopup}
        onClose={() => setShowPromptPopup(false)}
        onApply={handlePromptSubmit}
      />
    </div>
  );
};

export default HalloweenEvent;

