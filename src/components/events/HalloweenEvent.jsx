import React, { useState } from 'react';
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
    
    // Navigate to camera view WITHOUT page reload
    navigateToCamera();
  };

  return (
    <div className="halloween-event">
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
                Your mission? Create the perfect Halloween costume look. 
                Winning entries will be added to our style library, all credited to the winners.
              </p>
            </div>

            <div className="how-to-win">
              <h3>🎨✨ How to Win ✨🎨</h3>
              <ul>
                <li>Create a photobooth image using your own creative prompt (must log in to Photobooth with your Sogni account)</li>
                <li>Share your creation on Twitter with the in-app share button</li>
                <li>Your post will automatically include your prompt and tag @sogni_protocol</li>
                <li>This will automatically submit your work to the contest under the Sogni account</li>
              </ul>
            </div>

            <div className="prize-info">
              <div className="prize-pool">
                🏆 Prize Pool: <span className="highlight">40,000 Premium Sparks</span> to share between winners
              </div>
              <div className="feature-info">
                💡 Winning entries could be featured on Sogni platforms with full credit
              </div>
              <div className="deadline">
                📅 Deadline: <span className="highlight">Oct 27</span> (end of UTC day)
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

