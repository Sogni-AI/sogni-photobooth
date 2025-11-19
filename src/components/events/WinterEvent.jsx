import React, { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import WinterPromptPopup from './WinterPromptPopup';
import { AuthStatus } from '../auth/AuthStatus';
import { useApp } from '../../context/AppContext';
import { useNavigation } from '../AppRouter';
import { styleIdToDisplay } from '../../utils';
import { getAttributionText, hasPromptAttribution } from '../../config/ugcAttributions';
import { generateGalleryFilename } from '../../utils/galleryLoader';
import urls from '../../config/urls';
import promptsDataRaw from '../../prompts.json';
import '../../styles/film-strip.css'; // Reuse existing film-strip styles
import '../../styles/events/WinterEvent.css';

const WinterEvent = () => {
  const [showPromptPopup, setShowPromptPopup] = useState(false);
  const [selectedStyleKey, setSelectedStyleKey] = useState(null); // Track selected style for mobile two-click
  const [snowflakeDismissed, setSnowflakeDismissed] = useState(false);
  const [showSnowflakeButton, setShowSnowflakeButton] = useState(false); // Delayed appearance
  const [portraitType, setPortraitType] = useState('medium'); // 'headshot', 'medium', or 'fullbody'
  const { updateSetting, stylePrompts } = useApp();
  const { navigateToCamera } = useNavigation();

  const handleDismissSnowflake = (e) => {
    e.stopPropagation(); // Prevent expanding
    setSnowflakeDismissed(true);
  };

  // Dynamically generate Winter styles from prompts.json
  // Sort: UGC-attributed prompts first, then alphabetically
  // Update image paths based on selected portrait type
  const winterStyles = useMemo(() => {
    const winterPrompts = promptsDataRaw['christmas-winter']?.prompts || {};
    // Portrait type is used directly as the subdirectory name
    const folder = portraitType || 'medium';

    return Object.keys(winterPrompts)
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

  // Mark Winter notification as dismissed when visiting the Winter event page
  React.useEffect(() => {
    sessionStorage.setItem('winter-event-visited', 'true');
  }, []);

  // Delay snowflake button appearance by 5 seconds
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setShowSnowflakeButton(true);
    }, 5000); // 5 seconds

    return () => clearTimeout(timer);
  }, []);

  const handlePromptSubmit = (prompt) => {
    // Store the prompt in app settings (synchronously saved to cookies)
    console.log('❄️ Winter prompt submitted:', prompt);
    updateSetting('positivePrompt', prompt);
    updateSetting('selectedStyle', 'custom');
    updateSetting('winterContext', true); // Flag for winter event context
    
    // Automatically switch to DreamShaper model for winter custom prompts
    console.log('❄️ Auto-switching to DreamShaper model for winter theme');
    updateSetting('selectedModel', 'coreml-dreamshaperXL_v21TurboDPMSDE');
    
    // Mark that user has explicitly selected a style (for checkmark in CameraStartMenu)
    localStorage.setItem('sogni_style_explicitly_selected', 'true');

    // Navigate to main app (skip splash screen, go directly to start menu)
    console.log('❄️ Navigating to camera start menu');
    navigateToCamera();
  };

  const handleStyleSelect = (styleKey) => {
    // Check if we're on mobile (screen width <= 768px)
    const isMobile = window.innerWidth <= 768;

    // On mobile: first click shows overlay, second click confirms
    if (isMobile) {
      if (selectedStyleKey === styleKey) {
        // Second click - proceed with selection
        console.log('❄️ Winter style confirmed:', styleKey);
        proceedWithStyleSelection(styleKey);
      } else {
        // First click - show overlay
        console.log('❄️ Winter style preview:', styleKey);
        setSelectedStyleKey(styleKey);
      }
    } else {
      // Desktop - proceed immediately
      console.log('❄️ Winter style selected:', styleKey);
      proceedWithStyleSelection(styleKey);
    }
  };

  const proceedWithStyleSelection = (styleKey) => {
    // Get the prompt for this style from Winter prompts
    const winterPrompts = promptsDataRaw['christmas-winter']?.prompts || {};
    const prompt = winterPrompts[styleKey] || stylePrompts[styleKey] || '';
    
    console.log('❄️ Selected prompt:', prompt);
    
    // Set the style and prompt
    updateSetting('selectedStyle', styleKey);
    updateSetting('positivePrompt', prompt);
    updateSetting('winterContext', true); // Flag for winter event context
    
    // Automatically switch to DreamShaper model for winter styles
    console.log('❄️ Auto-switching to DreamShaper model for winter theme');
    updateSetting('selectedModel', 'coreml-dreamshaperXL_v21TurboDPMSDE');
    
    // Mark that user has explicitly selected a style (for checkmark in CameraStartMenu)
    localStorage.setItem('sogni_style_explicitly_selected', 'true');

    // Navigate to main app (skip splash screen, go directly to start menu)
    console.log('❄️ Navigating to camera start menu');
    navigateToCamera();
  };

  return (
    <div className="winter-event">
      <Helmet>
        <title>🍂 Sogni Winter Photobooth ❄️ | AI Christmas & Holiday Photo Generator</title>
        <meta name="description" content="Create magical winter and Christmas AI portraits with Sogni's free photobooth! Transform your photos with festive holiday styles, snowy scenes, cozy winter fashion, and seasonal magic. Perfect for Christmas cards, holiday greetings, and winter wonderland photos." />
        
        {/* Keywords for SEO */}
        <meta name="keywords" content="Christmas photobooth, holiday photo generator, winter AI photos, Christmas AI portraits, holiday card maker, festive photo booth, winter wonderland photos, Christmas photo effects, AI Christmas photos, holiday picture generator, winter portrait maker, Christmas selfie booth, AI holiday photos, festive portrait generator, winter photo booth online, Christmas card photos, holiday AI photobooth, snowy photo effects, Christmas portrait studio, winter fashion photos" />
        
        {/* Open Graph / Facebook */}
        <meta property="og:title" content="🍂 Sogni Winter Photobooth ❄️ | AI Christmas & Holiday Photo Generator" />
        <meta property="og:description" content="Create magical winter and Christmas AI portraits! Transform your photos with festive holiday styles, snowy scenes, and seasonal magic. Perfect for Christmas cards and holiday greetings." />
        <meta property="og:image" content="https://photobooth.sogni.ai/events/winter-preview.png" />
        <meta property="og:url" content="https://photobooth.sogni.ai/event/winter" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Sogni Photobooth" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="🍂 Sogni Winter Photobooth ❄️ | AI Christmas & Holiday Photos" />
        <meta name="twitter:description" content="Create magical winter and Christmas AI portraits! Transform your photos with festive holiday styles, snowy scenes, and seasonal magic. Perfect for Christmas cards! 🎄✨" />
        <meta name="twitter:image" content="https://photobooth.sogni.ai/events/winter-preview.png" />
        <meta name="twitter:site" content="@sogni_protocol" />
        <meta property="twitter:url" content="https://photobooth.sogni.ai/event/winter" />
        
        {/* Additional SEO tags */}
        <meta name="robots" content="index, follow" />
        <meta name="author" content="Sogni AI" />
        <link rel="canonical" href="https://photobooth.sogni.ai/event/winter" />
      </Helmet>

      {/* Authentication Status - top-left */}
      <div className="winter-auth-status">
        <AuthStatus />
      </div>

      {/* Full Winter Style Grid - takes up full page */}
      <div className="film-strip-container visible winter-film-strip">
        {/* Floating Winter decorations - inside scrolling container */}
        <div className="winter-decorations">
          <div className="floating-leaf leaf-1">🍂</div>
          <div className="floating-leaf leaf-2">🍂</div>
          <div className="floating-leaf leaf-3">🍁</div>
          <div className="floating-snowflake snowflake-1">❄️</div>
          <div className="floating-snowflake snowflake-2">❄️</div>
          <div className="floating-snowflake snowflake-3">❄️</div>
          <div className="floating-snowflake snowflake-4">❄️</div>
          <div className="floating-icicle icicle-1">🧊</div>
          <div className="floating-sparkle sparkle-1">✨</div>
          <div className="floating-sparkle sparkle-2">✨</div>
        </div>

        {/* Collapsed snowflake button - scrolls with page, appears after 5 seconds */}
        {!snowflakeDismissed && showSnowflakeButton && (
          <button 
            className="winter-snowflake-button"
            onClick={() => setShowPromptPopup(true)}
            aria-label="Create your own winter style"
          >
            <button
              className="snowflake-dismiss-btn"
              onClick={handleDismissSnowflake}
              aria-label="Dismiss snowflake notification"
            >
              ✕
            </button>
            <span className="snowflake-emoji">❄️</span>
            <span className="create-bubble">
              <span className="create-text">Create your own style?</span>
              <span className="create-emoji">✨</span>
            </span>
          </button>
        )}

        {/* Header - positioned absolutely at top */}
        <header className="winter-header">
          <h1 className="winter-title">
            <span className="leaf-icon">🍂</span>
            Sogni Winter Photobooth
            <span className="snowflake-icon">❄️</span>
          </h1>

          {/* Portrait Type Selector - 3 circular buttons */}
          <div className="winter-portrait-selector">
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
                className="winter-portrait-btn"
                style={{
                  border: portraitType === 'headshot' ? '3px solid #4a9eff' : '3px solid rgba(74, 158, 255, 0.3)',
                  boxShadow: portraitType === 'headshot' ? '0 0 12px rgba(74, 158, 255, 0.6)' : '0 2px 8px rgba(0,0,0,0.2)'
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
              <span className="portrait-type-label winter-label">
                NEAR
              </span>
            </div>
            
            <button 
              onClick={() => setPortraitType('medium')}
              className="winter-portrait-btn"
              style={{
                border: portraitType === 'medium' ? '3px solid #4a9eff' : '3px solid rgba(74, 158, 255, 0.3)',
                boxShadow: portraitType === 'medium' ? '0 0 12px rgba(74, 158, 255, 0.6)' : '0 2px 8px rgba(0,0,0,0.2)'
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
            
            <div 
              style={{ position: 'relative' }} 
              className="portrait-type-button-container"
              onMouseEnter={(e) => {
                if (portraitType !== 'fullbody') {
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
                onClick={() => setPortraitType('fullbody')}
                className="winter-portrait-btn"
                style={{
                  border: portraitType === 'fullbody' ? '3px solid #4a9eff' : '3px solid rgba(74, 158, 255, 0.3)',
                  boxShadow: portraitType === 'fullbody' ? '0 0 12px rgba(74, 158, 255, 0.6)' : '0 2px 8px rgba(0,0,0,0.2)'
                }}
                title="Full Body"
              >
                <img 
                  src="/gallery/sample-gallery-full-body-mark.jpg"
                  alt="Full Body"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block'
                  }}
                />
              </button>
              <span className="portrait-type-label winter-label">
                FAR
              </span>
            </div>
          </div>
        </header>

        {/* Photo grid using film-strip-content for consistent styling */}
        <div className="film-strip-content prompt-selector-mode">
          {winterStyles.map((style) => (
            <div
              key={style.key}
              className={`film-frame loaded winter-style-frame ${selectedStyleKey === style.key ? 'mobile-selected' : ''}`}
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
                  <div className="winter-community-badge" title="Community Created">
                    <span className="community-icon">🏅</span>
                  </div>
                )}

                {/* Hover overlay with "Use this style" */}
                <div className="winter-hover-overlay">
                  <div className="use-style-text">Use this style</div>
                  {/* UGC Attribution - Only show when there's an attribution */}
                  {getAttributionText(style.key) && (
                    <span className="winter-attribution">
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

      {/* Prompt Popup */}
      <WinterPromptPopup
        isOpen={showPromptPopup}
        onClose={() => setShowPromptPopup(false)}
        onApply={handlePromptSubmit}
      />
    </div>
  );
};

export default WinterEvent;

