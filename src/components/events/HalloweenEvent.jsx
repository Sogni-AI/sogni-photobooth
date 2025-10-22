import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import HalloweenPromptPopup from './HalloweenPromptPopup';
import { AuthStatus } from '../auth/AuthStatus';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import { useApp } from '../../context/AppContext';
import { useNavigation } from '../AppRouter';
import '../../styles/events/HalloweenEvent.css';

const HalloweenEvent = () => {
  const [showPromptPopup, setShowPromptPopup] = useState(false);
  const { isEnabled, enable: enableMusic } = useMusicPlayer();
  const { updateSetting } = useApp();
  const { navigateToCamera } = useNavigation();

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

      {/* Floating Halloween decorations */}
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

      {/* Main content container */}
      <div className="halloween-content">
        {/* Header */}
        <header className="halloween-header">
          <h1 className="halloween-title">
            <span className="pumpkin-icon">🎃</span>
            Sogni Halloween Photobooth
            <span className="ghost-icon">👻</span>
          </h1>
        </header>

        {/* Contest Information */}
        <div className="halloween-contest">
          <div className="contest-card">
            <h2 className="contest-title">
              🎃 Photobooth Costume Party Challenge 🕸️✨
            </h2>
            
            <div className="contest-description">
              <p>
                Your mission? Create the perfect Halloween costume look.<br/>
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
              Start Creating Your Costume
              <span className="btn-icon">✨</span>
            </button>
          </div>
        </div>
      </div>

      {/* Background Image */}
      <div className="halloween-background-image" />

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

