import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import WinterPromptPopup from './WinterPromptPopup';
import { AuthStatus } from '../auth/AuthStatus';
import { useWinterMusicPlayer } from '../../context/WinterMusicPlayerContext';
import { useApp } from '../../context/AppContext';
import { useNavigation } from '../AppRouter';
import { styleIdToDisplay } from '../../utils';
import { getAttributionText, hasPromptAttribution } from '../../config/ugcAttributions';
import { generateGalleryFilename } from '../../utils/galleryLoader';
import { saveThemeGroupPreferences } from '../../utils/cookies';
import urls from '../../config/urls';
import promptsDataRaw from '../../prompts.json';
import '../../styles/film-strip.css'; // Reuse existing film-strip styles
import '../../styles/events/WinterEvent.css';

const WinterEvent = () => {
  const [showPromptPopup, setShowPromptPopup] = useState(false);
  const [selectedStyleKey, setSelectedStyleKey] = useState(null); // Track selected style for mobile two-click
  const [snowflakeDismissed, setSnowflakeDismissed] = useState(false);
  const [showSnowflakeButton, setShowSnowflakeButton] = useState(false); // Delayed appearance
  const [portraitType, setPortraitType] = useState('headshot2'); // 'headshot2', 'medium', or 'fullbody'
  const [activeVideoStyleKeys, setActiveVideoStyleKeys] = useState([]); // Track which videos are playing (array for multiple)
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true); // Track if auto-play is active
  const [userInitiatedVideos, setUserInitiatedVideos] = useState(new Set()); // Track which videos were started by user
  const { isEnabled, enable: enableMusic } = useWinterMusicPlayer();
  const { updateSetting, stylePrompts } = useApp();
  const { navigateToCamera } = useNavigation();
  const videoRefs = useRef({}); // Store refs to video elements
  const visibleStylesRef = useRef(new Set()); // Track which styles are visible in viewport
  const autoPlayTimeoutRef = useRef(null); // Track auto-play timeout

  const handleRandomStyle = () => {
    console.log('❄️ Random Style button clicked - selecting Random: Mix for winter category');
    
    // Dynamically build theme state from promptsDataRaw to ensure all categories are covered
    // Set ONLY christmas-winter to true, all others to false
    const allThemeGroups = Object.keys(promptsDataRaw);
    const winterOnlyThemes = {};
    allThemeGroups.forEach(group => {
      winterOnlyThemes[group] = (group === 'christmas-winter');
    });
    
    console.log('❄️ Setting themes to winter-only:', winterOnlyThemes);
    
    // Save theme preferences to localStorage (this is how themes persist)
    saveThemeGroupPreferences(winterOnlyThemes);
    
    // Set the style to 'randomMix' which will pick different random styles for each image
    updateSetting('selectedStyle', 'randomMix');
    updateSetting('winterContext', true);
    updateSetting('portraitType', portraitType);
    
    // Clear manual overrides when explicitly selecting a style
    updateSetting('seed', '');
    updateSetting('negativePrompt', '');
    updateSetting('stylePrompt', '');
    
    // Model must be set LAST because switchToModel reads current state
    updateSetting('selectedModel', 'coreml-dreamshaperXL_v21TurboDPMSDE');
    
    // Mark that user has explicitly selected a style
    localStorage.setItem('sogni_style_explicitly_selected', 'true');
    
    console.log('❄️ Random: Mix selected with christmas-winter category filter saved to localStorage, navigating to camera');
    
    // Small delay to ensure localStorage writes have completed
    setTimeout(() => {
      navigateToCamera();
    }, 0);
  };

  // Helper function to check if a style has a video (only for headshot2/NEAR portrait type)
  const hasVideoForStyle = (styleKey) => {
    // NEAR (headshot2) portrait type - kiki videos
    if (portraitType === 'headshot2') {
      const nearStylesWithVideos = [
        'babyBlueWrap',
        'blackOpulentFur',
        'christmasWrap',
        'IHateChristmas',
        'myBabyBear',
        'myBabyDeer',
        'myBabyPenguin',
        'myBabyWolf',
        'myPantherBaby',
        'polarHat',
        'forestElf',
        'alone4Christmas',
        'defrostMode',
        'icedUp'
      ];
      return nearStylesWithVideos.includes(styleKey);
    }
    
    // MED (medium) portrait type - jen videos
    if (portraitType === 'medium') {
      const mediumStylesWithVideos = [
        'babyBlueWrap',
        'myPolarBearBaby',
        'pinkWrap',
        'redWrap'
      ];
      return mediumStylesWithVideos.includes(styleKey);
    }
    
    return false;
  };

  // Get random visible video style that isn't currently playing
  const getRandomVisibleVideoStyle = () => {
    const visibleWithVideos = Array.from(visibleStylesRef.current).filter(
      styleKey => hasVideoForStyle(styleKey) && !activeVideoStyleKeys.includes(styleKey)
    );
    if (visibleWithVideos.length === 0) return null;
    return visibleWithVideos[Math.floor(Math.random() * visibleWithVideos.length)];
  };

  // Auto-play a random video
  const autoPlayRandomVideo = () => {
    if (!autoPlayEnabled) return;
    
    const randomStyle = getRandomVisibleVideoStyle();
    if (randomStyle) {
      console.log('Auto-playing video:', randomStyle);
      setActiveVideoStyleKeys(prev => [...prev, randomStyle]);
      // Do NOT add to userInitiatedVideos - this is auto-play
    }
  };

  // Handle video end - auto-play next if enabled and no videos playing
  const handleVideoEnd = (styleKey) => {
    const wasUserInitiated = userInitiatedVideos.has(styleKey);
    
    // Remove ended video from active list
    setActiveVideoStyleKeys(prev => prev.filter(key => key !== styleKey));
    
    // Remove from user-initiated set if it was there
    if (wasUserInitiated) {
      setUserInitiatedVideos(prev => {
        const newSet = new Set(prev);
        newSet.delete(styleKey);
        return newSet;
      });
    }
    
    // If this was an auto-play video (not user-initiated), play another
    if (!wasUserInitiated && autoPlayEnabled) {
      autoPlayTimeoutRef.current = setTimeout(() => {
        // Check again if no videos are playing (user might have started one)
        setActiveVideoStyleKeys(current => {
          if (current.length === 0) {
            const randomStyle = getRandomVisibleVideoStyle();
            if (randomStyle) {
              console.log('Auto-playing next video:', randomStyle);
              return [randomStyle];
            }
          }
          return current;
        });
      }, 1000); // 1 second delay between videos
    }
  };

  // Intersection Observer to track visible styles
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const styleKey = entry.target.getAttribute('data-style-key');
          if (entry.isIntersecting) {
            visibleStylesRef.current.add(styleKey);
          } else {
            visibleStylesRef.current.delete(styleKey);
          }
        });
      },
      {
        threshold: 0.5, // At least 50% visible
        rootMargin: '0px'
      }
    );

    // Observe all film frames after a short delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      const frames = document.querySelectorAll('.winter-style-frame');
      frames.forEach(frame => observer.observe(frame));
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [portraitType]); // Re-run when portrait type changes

  // Reset video states when portrait type changes
  useEffect(() => {
    // Clear existing videos and states
    setActiveVideoStyleKeys([]);
    setUserInitiatedVideos(new Set());
    setAutoPlayEnabled(true);
    if (autoPlayTimeoutRef.current) {
      clearTimeout(autoPlayTimeoutRef.current);
      autoPlayTimeoutRef.current = null;
    }
    
    // Wait for intersection observer to populate visible styles, then trigger auto-play
    const timer = setTimeout(() => {
      const hasVisibleVideos = Array.from(visibleStylesRef.current).some(styleKey => hasVideoForStyle(styleKey));
      console.log(`Portrait type: ${portraitType}, Visible styles:`, Array.from(visibleStylesRef.current), 'Has videos:', hasVisibleVideos);
      
      if (hasVisibleVideos) {
        autoPlayRandomVideo();
      }
    }, 5500); // 5.5 seconds to ensure DOM and intersection observer are ready

    return () => clearTimeout(timer);
  }, [portraitType]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autoPlayTimeoutRef.current) {
        clearTimeout(autoPlayTimeoutRef.current);
      }
    };
  }, []);

  const handleDismissSnowflake = (e) => {
    e.stopPropagation(); // Prevent expanding
    setSnowflakeDismissed(true);
  };

  // Dynamically generate Winter styles from prompts.json
  // Sort: UGC-attributed prompts first, then alphabetically
  // Update image paths based on selected portrait type
  const winterStyles = useMemo(() => {
    const winterPrompts = promptsDataRaw['christmas-winter']?.prompts || {};
    // Portrait type mapping to folder name
    const folder = portraitType === 'headshot2' ? 'headshot2' : (portraitType || 'medium');

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

  // Enable music player when component mounts
  React.useEffect(() => {
    if (!isEnabled) {
      enableMusic();
    }
  }, [isEnabled, enableMusic]);

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
    console.log('❄️ Selected style key:', styleKey);
    
    // Use updateSetting to properly update AppContext's React state
    // The order matters: set non-model settings first, then model last
    updateSetting('winterContext', true);
    updateSetting('portraitType', portraitType);
    updateSetting('selectedStyle', styleKey);
    updateSetting('positivePrompt', prompt);
    
    // Clear manual overrides when explicitly selecting a style
    // This ensures fresh generation with the new style's defaults
    updateSetting('seed', '');
    updateSetting('negativePrompt', '');
    updateSetting('stylePrompt', '');
    
    // Model must be set LAST because switchToModel reads current state
    updateSetting('selectedModel', 'coreml-dreamshaperXL_v21TurboDPMSDE');
    
    // Mark that user has explicitly selected a style (for checkmark in CameraStartMenu)
    localStorage.setItem('sogni_style_explicitly_selected', 'true');
    
    console.log('❄️ Settings updated, navigating to camera start menu');
    
    // Small delay to ensure React state updates have propagated
    setTimeout(() => {
      navigateToCamera();
    }, 0);
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
        <meta property="og:image" content="https://photobooth.sogni.ai/events/winter-preview.jpg" />
        <meta property="og:url" content="https://photobooth.sogni.ai/event/winter" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Sogni Photobooth" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="🍂 Sogni Winter Photobooth ❄️ | AI Christmas & Holiday Photos" />
        <meta name="twitter:description" content="Create magical winter and Christmas AI portraits! Transform your photos with festive holiday styles, snowy scenes, and seasonal magic. Perfect for Christmas cards! 🎄✨" />
        <meta name="twitter:image" content="https://photobooth.sogni.ai/events/winter-preview.jpg" />
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
            <div
              className="snowflake-dismiss-btn"
              onClick={handleDismissSnowflake}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleDismissSnowflake(e);
                }
              }}
              aria-label="Dismiss snowflake notification"
            >
              ✕
            </div>
            <div className="snowflake-face">
              <span className="snowflake-emoji">❄️</span>
              <span className="snowflake-eyes">👀</span>
              <span className="snowflake-mouth">◡</span>
            </div>
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
                if (portraitType !== 'headshot2') {
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
                onClick={() => setPortraitType('headshot2')}
                className="winter-portrait-btn"
                style={{
                  border: portraitType === 'headshot2' ? '3px solid #4a9eff' : '3px solid rgba(74, 158, 255, 0.3)',
                  boxShadow: portraitType === 'headshot2' ? '0 0 12px rgba(74, 158, 255, 0.6)' : '0 2px 8px rgba(0,0,0,0.2)'
                }}
                title="Up Close"
              >
                <img 
                  src="/gallery/sample-gallery-headshot-kiki.jpg"
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
            
            <div 
              style={{ position: 'relative' }} 
              className="portrait-type-button-container"
              onMouseEnter={(e) => {
                if (portraitType !== 'medium') {
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
              <span className="portrait-type-label winter-label">
                MED
              </span>
            </div>
            
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
              data-style-key={style.key}
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

                {/* Video Button - Show for styles with videos */}
                {hasVideoForStyle(style.key) && (
                  <div
                    className="photo-video-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Disable auto-play when user manually interacts
                      setAutoPlayEnabled(false);
                      // Clear any pending auto-play timeout
                      if (autoPlayTimeoutRef.current) {
                        clearTimeout(autoPlayTimeoutRef.current);
                        autoPlayTimeoutRef.current = null;
                      }
                      // Toggle video in array - allow multiple videos to play
                      setActiveVideoStyleKeys(prev => {
                        const isCurrentlyPlaying = prev.includes(style.key);
                        if (isCurrentlyPlaying) {
                          // Stopping video - remove from user-initiated set
                          setUserInitiatedVideos(prevSet => {
                            const newSet = new Set(prevSet);
                            newSet.delete(style.key);
                            return newSet;
                          });
                          return prev.filter(key => key !== style.key);
                        } else {
                          // Starting video - add to user-initiated set
                          setUserInitiatedVideos(prevSet => new Set([...prevSet, style.key]));
                          return [...prev, style.key];
                        }
                      });
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    title="Play video"
                  >
                    <div>
                      <svg fill="currentColor" width="16" height="16" viewBox="0 0 24 24">
                        {activeVideoStyleKeys.includes(style.key) ? (
                          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                        ) : (
                          <path d="M8 5v14l11-7z"/>
                        )}
                      </svg>
                    </div>
                  </div>
                )}

                {/* Video Overlay - Show when video is active */}
                {activeVideoStyleKeys.includes(style.key) && hasVideoForStyle(style.key) && (
                  <video
                    ref={(el) => {
                      if (el) {
                        videoRefs.current[style.key] = el;
                      }
                    }}
                    src={(() => {
                      // MED (medium) portrait type - jen videos
                      if (portraitType === 'medium') {
                        if (style.key === 'babyBlueWrap') {
                          return `${urls.assetUrl}/videos/jen-sogni-photobooth-baby-blue-wrap-raw.mp4`;
                        } else if (style.key === 'myPolarBearBaby') {
                          return `${urls.assetUrl}/videos/jen-sogni-photobooth-my-polar-bear-baby-raw.mp4`;
                        } else if (style.key === 'pinkWrap') {
                          return `${urls.assetUrl}/videos/jen-sogni-photobooth-pink-wrap-raw.mp4`;
                        } else if (style.key === 'redWrap') {
                          return `${urls.assetUrl}/videos/jen-sogni-photobooth-red-wrap-raw.mp4`;
                        }
                      }
                      
                      // NEAR (headshot2) portrait type - kiki videos
                      if (portraitType === 'headshot2') {
                        if (style.key === 'babyBlueWrap') {
                          return `${urls.assetUrl}/videos/kiki-sogni-photobooth-baby-blue-wrap-raw.mp4`;
                        } else if (style.key === 'blackOpulentFur') {
                          return `${urls.assetUrl}/videos/kiki-ssogni-photobooth-black-opulent-fur-raw.mp4`;
                        } else if (style.key === 'christmasWrap') {
                          return `${urls.assetUrl}/videos/kiki-ssogni-photobooth-christmas-wrap-raw.mp4`;
                        } else if (style.key === 'IHateChristmas') {
                          return `${urls.assetUrl}/videos/kiki-ssogni-photobooth-i-hate-christmas-raw.mp4`;
                        } else if (style.key === 'myBabyBear') {
                          return `${urls.assetUrl}/videos/kiki-ssogni-photobooth-my-baby-bear-raw.mp4`;
                        } else if (style.key === 'myBabyDeer') {
                          return `${urls.assetUrl}/videos/kiki-ssogni-photobooth-my-baby-deer-raw.mp4`;
                        } else if (style.key === 'myBabyPenguin') {
                          return `${urls.assetUrl}/videos/kiki-ssogni-photobooth-my-baby-penguin-raw.mp4`;
                        } else if (style.key === 'myBabyWolf') {
                          return `${urls.assetUrl}/videos/kiki-ssogni-photobooth-my-baby-wolf-raw.mp4`;
                        } else if (style.key === 'myPantherBaby') {
                          return `${urls.assetUrl}/videos/kiki-ssogni-photobooth-my-panther-baby-raw.mp4`;
                        } else if (style.key === 'polarHat') {
                          return `${urls.assetUrl}/videos/kiki-ssogni-photobooth-polar-hat-raw.mp4`;
                        } else if (style.key === 'forestElf') {
                          return `${urls.assetUrl}/videos/kiki-sogni-photobooth-forest-elf-raw.mp4`;
                        } else if (style.key === 'alone4Christmas') {
                          return `${urls.assetUrl}/videos/kiki-sogni-photobooth-alone-4-christmas-raw.mp4`;
                        } else if (style.key === 'defrostMode') {
                          return `${urls.assetUrl}/videos/kiki-sogni-photobooth-defrost-mode-raw.mp4`;
                        } else if (style.key === 'icedUp') {
                          return `${urls.assetUrl}/videos/kiki-sogni-photobooth-iced-up-raw.mp4`;
                        }
                      }
                      
                      return "";
                    })()}
                    autoPlay
                    loop={userInitiatedVideos.has(style.key)}
                    muted
                    playsInline
                    onEnded={() => handleVideoEnd(style.key)}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      zIndex: 5
                    }}
                  />
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
          
          {/* Random Style Button */}
          <div className="winter-random-button-container">
            <button 
              className="winter-random-style-btn"
              onClick={handleRandomStyle}
            >
              <span className="random-icon">🎲</span>
              <span className="random-text">Random Style</span>
              <span className="random-sparkle">✨</span>
            </button>
          </div>
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

