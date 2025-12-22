import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import urls from '../../config/urls';

/**
 * VideoSelectionPopup
 * Shows video type selection with examples and descriptions
 */
const VideoSelectionPopup = ({ 
  visible, 
  onSelectVideoType,
  onClose,
  isBatch = false,
  photoCount = 0
}) => {
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Bald for Base video URLs (2:3 aspect ratio)
  const baldForBaseVideos = [
    `${urls.assetUrl}/bold-4-base/bold-4-base-1.mp4`,
    `${urls.assetUrl}/bold-4-base/bold-4-base-2.mp4`,
    `${urls.assetUrl}/bold-4-base/bold-4-base-3.mp4`,
    `${urls.assetUrl}/bold-4-base/bold-4-base-4.mp4`
  ];

  // Prompt Video example videos (2:3 aspect ratio)
  const promptVideos = [
    `${urls.assetUrl}/videos/sogni-photobooth-anime1990s-raw2.mp4`,
    `${urls.assetUrl}/videos/sogni-photobooth-apocalypserooftop-raw.mp4`
  ];

  // Emoji Video example videos (2:3 aspect ratio)
  const emojiVideos = [
    'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/videos/emojis/einstein-money-bougie-black-video_5s_480p_32fps.mp4',
    'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/videos/emojis/einstein-money-dapper-victorian-video_5s_480p_32fps.mp4',
    'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/videos/emojis/einstein-money-bride-of-frankenstein-video_5s_480p_32fps.mp4'
  ];

  const [promptVideoIndex, setPromptVideoIndex] = useState(0);
  const [emojiVideoIndex, setEmojiVideoIndex] = useState(0);
  const [baldForBaseVideoIndex, setBaldForBaseVideoIndex] = useState(0);
  const promptVideoRefs = React.useRef({});
  const emojiVideoRefs = React.useRef({});
  const baldForBaseVideoRefs = React.useRef({});
  const headerRef = React.useRef(null);
  const gridContainerRef = React.useRef(null);


  // Update video source when index changes - iOS optimized approach
  useEffect(() => {
    const promptVideoEl = promptVideoRefs.current['prompt'];
    if (promptVideoEl && promptVideos[promptVideoIndex]) {
      const video = promptVideoEl;
      const newSrc = promptVideos[promptVideoIndex];
      
      // Only update if the source is different to avoid unnecessary reloads
      if (video.src !== newSrc && !video.src.endsWith(newSrc.split('/').pop())) {
        // Pause before changing source
        video.pause();
        
        // On iOS, append fragment identifier to prompt immediate frame display
        // Don't call load() - let browser handle it naturally to use cache
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const srcWithFragment = isIOS ? `${newSrc}#t=0.001` : newSrc;
        video.src = srcWithFragment;
        video.currentTime = 0;
        
        // Try to play immediately - if cached, this should work
        // Use loadeddata event which fires faster than canplay on cached videos
        const tryPlay = () => {
          if (promptVideoRefs.current['prompt'] && promptVideoRefs.current['prompt'].src.includes(newSrc)) {
            promptVideoRefs.current['prompt'].play().catch(() => {});
          }
        };
        
        // If already loaded (cached), play immediately
        if (video.readyState >= 2) {
          requestAnimationFrame(tryPlay);
        } else {
          // Wait for loadeddata which fires quickly for cached videos
          video.addEventListener('loadeddata', tryPlay, { once: true });
          // Fallback to canplay if loadeddata doesn't fire
          video.addEventListener('canplay', tryPlay, { once: true });
        }
      }
    }
  }, [promptVideoIndex]);

  useEffect(() => {
    const emojiVideoEl = emojiVideoRefs.current['emoji'];
    if (emojiVideoEl && emojiVideos[emojiVideoIndex]) {
      const video = emojiVideoEl;
      const newSrc = emojiVideos[emojiVideoIndex];
      
      if (video.src !== newSrc && !video.src.endsWith(newSrc.split('/').pop())) {
        video.pause();
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const srcWithFragment = isIOS ? `${newSrc}#t=0.001` : newSrc;
        video.src = srcWithFragment;
        video.currentTime = 0;
        
        const tryPlay = () => {
          if (emojiVideoRefs.current['emoji'] && emojiVideoRefs.current['emoji'].src.includes(newSrc)) {
            emojiVideoRefs.current['emoji'].play().catch(() => {});
          }
        };
        
        if (video.readyState >= 2) {
          requestAnimationFrame(tryPlay);
        } else {
          video.addEventListener('loadeddata', tryPlay, { once: true });
          video.addEventListener('canplay', tryPlay, { once: true });
        }
      }
    }
  }, [emojiVideoIndex]);

  useEffect(() => {
    const baldForBaseVideoEl = baldForBaseVideoRefs.current['bald-for-base'];
    if (baldForBaseVideoEl && baldForBaseVideos[baldForBaseVideoIndex]) {
      const video = baldForBaseVideoEl;
      const newSrc = baldForBaseVideos[baldForBaseVideoIndex];
      
      if (video.src !== newSrc && !video.src.endsWith(newSrc.split('/').pop())) {
        video.pause();
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const srcWithFragment = isIOS ? `${newSrc}#t=0.001` : newSrc;
        video.src = srcWithFragment;
        video.currentTime = 0;
        
        const tryPlay = () => {
          if (baldForBaseVideoRefs.current['bald-for-base'] && baldForBaseVideoRefs.current['bald-for-base'].src.includes(newSrc)) {
            baldForBaseVideoRefs.current['bald-for-base'].play().catch(() => {});
          }
        };
        
        if (video.readyState >= 2) {
          requestAnimationFrame(tryPlay);
        } else {
          video.addEventListener('loadeddata', tryPlay, { once: true });
          video.addEventListener('canplay', tryPlay, { once: true });
        }
      }
    }
  }, [baldForBaseVideoIndex]);

  // Reset video indices when popup becomes visible
  useEffect(() => {
    if (visible) {
      setPromptVideoIndex(0);
      setEmojiVideoIndex(0);
      setBaldForBaseVideoIndex(0);
      // Reset prompt video source
      const promptVideoEl = promptVideoRefs.current['prompt'];
      if (promptVideoEl) {
        promptVideoEl.src = promptVideos[0];
        promptVideoEl.load();
        promptVideoEl.play().catch(err => {
          console.log('Video autoplay prevented:', err);
        });
      }
      // Reset emoji video source
      const emojiVideoEl = emojiVideoRefs.current['emoji'];
      if (emojiVideoEl) {
        emojiVideoEl.src = emojiVideos[0];
        emojiVideoEl.load();
        emojiVideoEl.play().catch(err => {
          console.log('Video autoplay prevented:', err);
        });
      }
      // Reset Bald for Base video source
      const baldForBaseVideoEl = baldForBaseVideoRefs.current['bald-for-base'];
      if (baldForBaseVideoEl) {
        baldForBaseVideoEl.src = baldForBaseVideos[0];
        baldForBaseVideoEl.load();
        baldForBaseVideoEl.play().catch(err => {
          console.log('Video autoplay prevented:', err);
        });
      }
    }
  }, [visible]);

  // Memoize videoOptions to prevent unnecessary re-renders
  const videoOptions = useMemo(() => {
    const options = [
      {
        id: 'prompt',
        icon: '✨',
        title: 'Prompt Video',
        description: 'Create custom motion videos using your own text prompts describing what should happen in the video.',
        gradient: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
        exampleVideo: promptVideos[promptVideoIndex],
        exampleVideos: promptVideos,
        videoIndex: promptVideoIndex,
        setVideoIndex: setPromptVideoIndex
      },
      {
        id: 'emoji',
        icon: '🎥',
        title: 'Emoji Video',
        description: 'Generate videos using one of 160 emoji-based motion styles. The example is 🤑',
        gradient: 'linear-gradient(135deg, #ffeb3b 0%, #fbc02d 100%)',
        exampleVideo: emojiVideos[emojiVideoIndex],
        exampleVideos: emojiVideos,
        videoIndex: emojiVideoIndex,
        setVideoIndex: setEmojiVideoIndex
      }
    ];

    // Transition Video example (2:3 aspect ratio)
    const transitionVideo = 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/videos/transitions/jen.mp4';

    // Add Transition Video option (always show, but disable if < 2 images in single mode)
    options.push({
      id: isBatch ? 'batch-transition' : 'transition',
      icon: '🔀',
      title: isBatch ? 'Batch Transition' : 'Transition Video',
      description: isBatch 
        ? 'Create looping videos that connect multiple images together with seamless transitions.'
        : 'Create looping videos that connect multiple images together with seamless transitions. Requires 2 or more images.',
      gradient: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
      exampleVideo: transitionVideo,
      disabled: !isBatch && photoCount < 2
    });

    // Add Bald for Base option last
    options.push({
      id: 'bald-for-base',
      icon: '🟦',
      title: 'Bald for Base',
      description: 'Create videos for the Bald for Base challenge. Make Brian Armstrong proud with your clever antics.',
      gradient: 'linear-gradient(135deg, #0052FF 0%, #0039CC 100%)',
      exampleVideo: baldForBaseVideos[baldForBaseVideoIndex],
      exampleVideos: baldForBaseVideos,
      videoIndex: baldForBaseVideoIndex,
      setVideoIndex: setBaldForBaseVideoIndex
    });

    return options;
  }, [promptVideoIndex, emojiVideoIndex, baldForBaseVideoIndex, isBatch, photoCount]);

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    let timeoutId;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setWindowWidth(window.innerWidth);
      }, 150);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;
  const isDesktop = windowWidth >= 1024;

  // Calculate grid height explicitly for iOS scrolling
  useEffect(() => {
    if (visible && headerRef.current && gridContainerRef.current) {
      const updateGridHeight = () => {
        const container = gridContainerRef.current?.parentElement;
        const header = headerRef.current;
        if (container && header) {
          const containerHeight = container.clientHeight;
          const headerHeight = header.offsetHeight;
          const padding = isMobile ? 32 : 48; // Top + bottom padding
          const availableHeight = containerHeight - headerHeight - padding;
          if (gridContainerRef.current) {
            gridContainerRef.current.style.maxHeight = `${availableHeight}px`;
            gridContainerRef.current.style.height = `${availableHeight}px`;
          }
        }
      };
      updateGridHeight();
      window.addEventListener('resize', updateGridHeight);
      return () => window.removeEventListener('resize', updateGridHeight);
    }
  }, [visible, isMobile, windowWidth]);

  if (!visible) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: isMobile ? '10px' : '20px',
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.2s ease',
        overflow: 'scroll',
        WebkitOverflowScrolling: 'touch'
      }}
      onClick={handleBackdropClick}
    >
      <div
        style={{
          background: isMobile ? 'rgba(255, 255, 255, 0.98)' : 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(250, 250, 255, 0.98) 100%)',
          borderRadius: isMobile ? '16px' : '32px',
          padding: isMobile ? '16px' : isTablet ? '20px' : '24px',
          maxWidth: isMobile ? '100%' : '100%',
          width: '100%',
          height: isMobile ? 'calc(100vh - 20px)' : 'calc(100vh - 40px)',
          maxHeight: isMobile ? 'calc(100vh - 20px)' : 'calc(100vh - 40px)',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.05)',
          animation: 'slideUp 0.3s ease',
          position: 'relative',
          margin: 'auto',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'scroll',
          WebkitOverflowScrolling: 'touch'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: isMobile ? '12px' : '20px',
            right: isMobile ? '12px' : '20px',
            width: isMobile ? '32px' : '40px',
            height: isMobile ? '32px' : '40px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(0, 0, 0, 0.08)',
            color: '#333',
            fontSize: isMobile ? '20px' : '24px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            lineHeight: '1',
            fontWeight: '300',
            zIndex: 10,
            backdropFilter: 'blur(10px)'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.15)';
            e.currentTarget.style.transform = 'scale(1.1) rotate(90deg)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.08)';
            e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
          }}
        >
          ×
        </button>

        {/* Header */}
        <div 
          ref={headerRef}
          style={{ 
          marginBottom: isMobile ? '16px' : '20px', 
          textAlign: 'center',
          flexShrink: 0,
          paddingTop: isMobile ? '4px' : '8px'
        }}>
          <h2 style={{
            margin: '0 0 4px 0',
            color: '#1a1a1a',
            fontSize: isMobile ? '28px' : '36px',
            fontWeight: '800',
            fontFamily: '"Permanent Marker", cursive',
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            Choose Your Video Style
          </h2>
          <p style={{
            margin: 0,
            color: '#666',
            fontSize: isMobile ? '14px' : '15px',
            fontWeight: '400',
            letterSpacing: '0.01em'
          }}>
            Select a video type to bring your images to life
          </p>
        </div>

        {/* Video Options Grid - Artistic Gallery Layout */}
        <div 
          ref={gridContainerRef}
          className="video-selection-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile 
              ? 'repeat(2, minmax(0, 1fr))' 
              : 'repeat(4, minmax(0, 1fr))',
            gridAutoRows: 'min-content',
            gap: isMobile ? '12px' : '20px',
            overflowY: 'scroll',
            overflowX: 'hidden',
            flex: 1,
            padding: isMobile ? '0 4px 4px 4px' : '0 4px 4px 4px',
            minHeight: 0,
            alignItems: 'start',
            justifyContent: 'stretch',
            width: '100%',
            boxSizing: 'border-box',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            overscrollBehavior: 'contain',
            // Force hardware acceleration for smooth scrolling on iOS
            transform: 'translateZ(0)',
            willChange: 'scroll-position'
          }}
        >
          {videoOptions.map((option, index) => {
            const isDisabled = option.disabled;
            return (
              <button
                key={option.id}
                onClick={() => !isDisabled && onSelectVideoType(option.id)}
                disabled={isDisabled}
                style={{
                  background: isDisabled 
                    ? 'linear-gradient(135deg, #E5E7EB 0%, #D1D5DB 100%)' 
                    : 'linear-gradient(135deg, #ffffff 0%, #fafafa 100%)',
                  borderRadius: isMobile ? '20px' : '24px',
                  padding: 0,
                  border: isDisabled 
                    ? '2px solid #D1D5DB' 
                    : '2px solid rgba(0, 0, 0, 0.08)',
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  textAlign: 'left',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: isDisabled 
                    ? '0 2px 8px rgba(0, 0, 0, 0.08)' 
                    : '0 4px 20px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  opacity: isDisabled ? 0.5 : 1,
                  width: '100%',
                  minWidth: 0,
                  maxWidth: '100%',
                  backdropFilter: 'blur(10px)',
                  boxSizing: 'border-box'
                }}
                onMouseOver={(e) => {
                  if (!isDisabled) {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.08)';
                    e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.15)';
                  }
                }}
                onMouseOut={(e) => {
                  if (!isDisabled) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = isDisabled 
                      ? '0 2px 8px rgba(0, 0, 0, 0.08)' 
                      : '0 4px 20px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)';
                    e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.08)';
                  }
                }}
              >
                {/* Video Container - Hero Element - Always 2:3 Aspect Ratio */}
                <div style={{
                  width: '100%',
                  aspectRatio: '2 / 3',
                  borderRadius: isMobile ? '18px 18px 0 0' : '22px 22px 0 0',
                  background: option.exampleVideo 
                    ? '#000' 
                    : isDisabled 
                      ? 'linear-gradient(135deg, #E5E7EB 0%, #D1D5DB 100%)'
                      : option.gradient,
                  overflow: 'hidden',
                  position: 'relative',
                  isolation: 'isolate',
                  flexShrink: 0,
                  minHeight: 0,
                  maxHeight: '100%'
                }}>
                  {option.exampleVideo ? (
                    <>
                      {/* Subtle gradient overlay for depth */}
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.15) 100%)',
                        zIndex: 1,
                        pointerEvents: 'none'
                      }} />
                      {/* Single video element - simple approach matching Bald For Base popup */}
                      <video
                        key={option.id}
                        ref={(el) => {
                          if (option.id === 'prompt' && el) {
                            promptVideoRefs.current[option.id] = el;
                          } else if (option.id === 'emoji' && el) {
                            emojiVideoRefs.current[option.id] = el;
                          } else if (option.id === 'bald-for-base' && el) {
                            baldForBaseVideoRefs.current[option.id] = el;
                          }
                        }}
                        src={option.exampleVideo}
                        autoPlay
                        muted
                        playsInline
                        preload="auto"
                        loop={!option.exampleVideos}
                        onEnded={() => {
                          if (option.exampleVideos && option.setVideoIndex) {
                            const nextIndex = (option.videoIndex + 1) % option.exampleVideos.length;
                            // Just update state - useEffect will handle the src change seamlessly
                            option.setVideoIndex(nextIndex);
                          }
                        }}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          zIndex: 0
                        }}
                      />
                    </>
                  ) : (
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      fontSize: isMobile ? '64px' : '80px',
                      opacity: isDisabled ? 0.3 : 0.4,
                      filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.2))'
                    }}>
                      {option.icon}
                    </div>
                  )}
                  
                  {/* Subtle corner accent */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: '80px',
                    height: '80px',
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, transparent 70%)',
                    borderRadius: '0 22px 0 100%',
                    opacity: 0.4,
                    zIndex: 2,
                    pointerEvents: 'none'
                  }} />
                </div>

                {/* Content Section */}
                <div style={{
                  padding: isMobile ? '12px' : '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: isMobile ? '6px' : '8px',
                  flex: '0 0 auto',
                  background: 'transparent',
                  minHeight: 0
                }}>
                  {/* Title and Icon */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: isMobile ? '6px' : '10px',
                    marginBottom: '2px'
                  }}>
                    <span style={{ 
                      fontSize: isMobile ? '20px' : '28px',
                      filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))',
                      flexShrink: 0
                    }}>
                      {option.icon}
                    </span>
                    <h3 style={{
                      margin: 0,
                      color: isDisabled ? '#9CA3AF' : '#1a1a1a',
                      fontSize: isMobile ? '16px' : '22px',
                      fontWeight: '700',
                      fontFamily: '"Permanent Marker", cursive',
                      letterSpacing: '-0.01em',
                      lineHeight: '1.2',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {option.title}
                    </h3>
                  </div>

                  {/* Description */}
                  <p style={{
                    margin: 0,
                    color: isDisabled ? '#9CA3AF' : '#666',
                    fontSize: isMobile ? '11px' : '14px',
                    lineHeight: '1.4',
                    fontWeight: '400',
                    letterSpacing: '0.01em',
                    display: 'block',
                    overflow: 'visible',
                    textOverflow: 'clip'
                  }}>
                    {option.description}
                  </p>

                  {/* Disabled message */}
                  {isDisabled && (
                    <div style={{
                      marginTop: '8px',
                      padding: '8px 12px',
                      background: 'rgba(156, 163, 175, 0.15)',
                      borderRadius: '8px',
                      color: '#6B7280',
                      fontSize: '12px',
                      fontWeight: '600',
                      textAlign: 'center',
                      border: '1px solid rgba(156, 163, 175, 0.2)'
                    }}>
                      Requires 2+ images
                    </div>
                  )}

                  {/* Subtle gradient accent at bottom */}
                  {!isDisabled && (
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: '3px',
                      background: option.gradient,
                      opacity: 0.6
                    }} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* CSS animations and scrollbar styling */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        /* Scrollbar styling - visible on iOS for better UX */
        .video-selection-grid::-webkit-scrollbar {
          width: 6px;
        }
        .video-selection-grid::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.05);
          border-radius: 3px;
        }
        .video-selection-grid::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 3px;
        }
        .video-selection-grid::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.4);
        }
        /* Ensure scrolling works on iOS */
        @supports (-webkit-overflow-scrolling: touch) {
          .video-selection-grid {
            -webkit-overflow-scrolling: touch;
          }
        }
      `}</style>
    </div>,
    document.body
  );
};

VideoSelectionPopup.propTypes = {
  visible: PropTypes.bool.isRequired,
  onSelectVideoType: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  isBatch: PropTypes.bool,
  photoCount: PropTypes.number
};

export default VideoSelectionPopup;

