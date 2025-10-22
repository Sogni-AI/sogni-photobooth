import React, { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import HalloweenPromptPopup from './HalloweenPromptPopup';
import { AuthStatus } from '../auth/AuthStatus';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import { useApp } from '../../context/AppContext';
import { useNavigation } from '../AppRouter';
import { styleIdToDisplay } from '../../utils';
import promptsDataRaw from '../../prompts.json';
import '../../styles/film-strip.css'; // Reuse existing film-strip styles
import '../../styles/events/HalloweenEvent.css';

const HalloweenEvent = () => {
  const [showPromptPopup, setShowPromptPopup] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false); // Start minimized (pumpkin button only)
  const { isEnabled, enable: enableMusic } = useMusicPlayer();
  const { updateSetting, stylePrompts } = useApp();
  const { navigateToCamera } = useNavigation();

  const handleDismissOverlay = () => {
    setShowOverlay(false);
  };

  const handleExpandOverlay = () => {
    setShowOverlay(true);
  };

  // Dynamically generate Halloween styles from prompts.json (sorted alphabetically)
  const halloweenStyles = useMemo(() => {
    const halloweenPrompts = promptsDataRaw.halloween?.prompts || {};
    return Object.keys(halloweenPrompts)
      .sort((a, b) => styleIdToDisplay(a).localeCompare(styleIdToDisplay(b)))
      .map(key => ({
        key,
        img: `/gallery/prompts/medium/sogni-photobooth-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}-raw.jpg`,
        title: styleIdToDisplay(key)
      }));
  }, []);

  // Enable music player when component mounts (but not expanded)
  React.useEffect(() => {
    if (!isEnabled) {
      enableMusic();
    }
  }, [isEnabled, enableMusic]);

  const handlePromptSubmit = (prompt) => {
    // Store the prompt in app settings (synchronously saved to cookies)
    console.log('🎃 Halloween prompt submitted:', prompt);
    updateSetting('positivePrompt', prompt);
    updateSetting('selectedStyle', 'custom');
    updateSetting('halloweenContext', true); // Flag to enable Halloween-specific Twitter share message

    // Navigate to camera view WITHOUT page reload
    navigateToCamera();
  };

  const handleStyleSelect = (styleKey) => {
    console.log('🎃 Halloween style selected:', styleKey);
    // Get the prompt for this style from Halloween prompts
    const halloweenPrompts = promptsDataRaw.halloween?.prompts || {};
    const prompt = halloweenPrompts[styleKey] || stylePrompts[styleKey] || '';
    
    console.log('🎃 Selected prompt:', prompt);
    
    // Set the style and prompt
    updateSetting('selectedStyle', styleKey);
    updateSetting('positivePrompt', prompt);
    updateSetting('halloweenContext', true); // Flag to enable Halloween-specific Twitter share message

    // Navigate to camera view WITHOUT page reload
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

        {/* Header - positioned absolutely at top */}
        <header className="halloween-header">
          <h1 className="halloween-title">
            <span className="pumpkin-icon">🎃</span>
            Sogni Halloween Photobooth
            <span className="ghost-icon">👻</span>
          </h1>
        </header>

        {/* Photo grid using film-strip-content for consistent styling */}
        <div className="film-strip-content prompt-selector-mode">
          {halloweenStyles.map((style) => (
            <div
              key={style.key}
              className="film-frame loaded halloween-style-frame"
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
                aspectRatio: '832/1216', // 2:3 aspect ratio like Style Explorer
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
                {/* Hover overlay with "Use this costume" */}
                <div className="halloween-hover-overlay">
                  <div className="use-costume-text">Use this costume</div>
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
                    <img src="/gallery/prompts/medium/sogni-photobooth-dream-stalker-raw.jpg" alt="Dream Stalker" />
                  </div>
                  <div className="halloween-polaroid">
                    <img src="/gallery/prompts/medium/sogni-photobooth-clown-from-hell-raw.jpg" alt="Clown from Hell" />
                  </div>
                  <div className="halloween-polaroid">
                    <img src="/gallery/prompts/medium/sogni-photobooth-corpse-bride-raw.jpg" alt="Corpse Bride" />
                  </div>
                  <div className="halloween-polaroid">
                    <img src="/gallery/prompts/medium/sogni-photobooth-haunted-prom-queen-raw.jpg" alt="Haunted Prom Queen" />
                  </div>
                  <div className="halloween-polaroid">
                    <img src="/gallery/prompts/medium/sogni-photobooth-midsommar-bloom-raw.jpg" alt="Midsommar Bloom" />
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

      {/* Collapsed pumpkin button */}
      {!showOverlay && (
        <button 
          className="halloween-pumpkin-button"
          onClick={handleExpandOverlay}
          aria-label="View contest information"
        >
          <span className="pumpkin-emoji">🎃</span>
          <span className="compete-bubble">Create your own costume and win!</span>
        </button>
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

