import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
    'https://cdn.sogni.ai/videos/emojis/einstein-money-bougie-black-video_5s_480p_32fps.mp4',
    'https://cdn.sogni.ai/videos/emojis/einstein-money-dapper-victorian-video_5s_480p_32fps.mp4',
    'https://cdn.sogni.ai/videos/emojis/einstein-money-bride-of-frankenstein-video_5s_480p_32fps.mp4'
  ];

  const [promptVideoIndex, setPromptVideoIndex] = useState(0);
  const [emojiVideoIndex, setEmojiVideoIndex] = useState(0);
  const [baldForBaseVideoIndex, setBaldForBaseVideoIndex] = useState(0);
  const [s2vMuted, setS2vMuted] = useState(true); // S2V video muted by default
  const [animateMoveMuted, setAnimateMoveMuted] = useState(true); // Animate Move video muted by default
  const [animateReplaceMuted, setAnimateReplaceMuted] = useState(true); // Animate Replace video muted by default
  const [transitionMuted, setTransitionMuted] = useState(true); // Transition videos muted by default
  const [cameraMuted, setCameraMuted] = useState(true); // 360 Camera video muted by default
  const [videoLoadedStates, setVideoLoadedStates] = useState({
    'prompt': false,
    'emoji': false,
    'bald-for-base': false,
    'transition': false,
    'animate-move': false,
    'batch-animate-move': false,
    'animate-replace': false,
    'batch-animate-replace': false,
    's2v': false,
    'batch-s2v': false
  });
  const promptVideoRefs = useRef({});
  const emojiVideoRefs = useRef({});
  const baldForBaseVideoRefs = useRef({});
  const gridContainerRef = useRef(null);
  const videoContainerRefs = useRef({});
  const [visibleVideos, setVisibleVideos] = useState({});


  // Update video source when index changes - simple approach with preloaded cache
  useEffect(() => {
    const promptVideoEl = promptVideoRefs.current['prompt'];
    if (promptVideoEl && promptVideos[promptVideoIndex]) {
      const video = promptVideoEl;
      const newSrc = promptVideos[promptVideoIndex];
      
      if (video.src !== newSrc && !video.src.endsWith(newSrc.split('/').pop())) {
        video.pause();
        video.currentTime = 0;
        video.src = newSrc;
        video.load();
        
        // Play when ready - videos should be cached from preload
        const playWhenReady = () => {
          if (promptVideoRefs.current['prompt'] && promptVideoRefs.current['prompt'].src === newSrc) {
            promptVideoRefs.current['prompt'].play().catch(() => {});
          }
        };
        
        video.addEventListener('canplay', playWhenReady, { once: true });
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
        video.currentTime = 0;
        video.src = newSrc;
        video.load();
        
        const playWhenReady = () => {
          if (emojiVideoRefs.current['emoji'] && emojiVideoRefs.current['emoji'].src === newSrc) {
            emojiVideoRefs.current['emoji'].play().catch(() => {});
          }
        };
        
        video.addEventListener('canplay', playWhenReady, { once: true });
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
        video.currentTime = 0;
        video.src = newSrc;
        video.load();
        
        const playWhenReady = () => {
          if (baldForBaseVideoRefs.current['bald-for-base'] && baldForBaseVideoRefs.current['bald-for-base'].src === newSrc) {
            baldForBaseVideoRefs.current['bald-for-base'].play().catch(() => {});
          }
        };
        
        video.addEventListener('canplay', playWhenReady, { once: true });
      }
    }
  }, [baldForBaseVideoIndex]);

  // Memoize videoOptions to prevent unnecessary re-renders
  const videoOptions = useMemo(() => {
    // Example video URLs
    const animateMoveVideo = 'https://cdn.sogni.ai/videos/transitions/wan-animate-move-medly.mp4';
    const animateReplaceVideo = 'https://cdn.sogni.ai/videos/transitions/wan-animate-replace-medly.mp4';
    const soundToVideoVideo = 'https://cdn.sogni.ai/videos/sogni-photobooth-video-demo_832x1216.mp4';
    const transitionVideo = 'https://cdn.sogni.ai/videos/transitions/jen.mp4';

    const options = [
      // Emoji Video first
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
      },
      // Motion Transfer
      {
        id: isBatch ? 'batch-animate-move' : 'animate-move',
        icon: '🎬',
        title: 'Motion Transfer',
        description: 'Transfer character movement from a source video to your image.',
        gradient: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
        exampleVideo: animateMoveVideo,
        isNew: true
      },
      // 360 Camera
      {
        id: '360-camera',
        icon: '📷',
        title: '360 Camera',
        description: 'Generate smooth 360 rotation videos from multiple camera angles.',
        gradient: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
        exampleVideo: 'https://cdn.sogni.ai/videos/360-camera-demo.mp4',
        isNew: true
      },
      // Replace Subject second
      {
        id: isBatch ? 'batch-animate-replace' : 'animate-replace',
        icon: '🔄',
        title: 'Replace Subject',
        description: 'Replace the main subject in a video with your character.',
        gradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
        exampleVideo: animateReplaceVideo,
        isNew: true
      },
      // Sound to Video third
      {
        id: isBatch ? 'batch-s2v' : 's2v',
        icon: '🎤',
        title: 'Sound to Video',
        description: 'Generate lip-synced video from audio. Perfect for making your image speak or sing.',
        gradient: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
        exampleVideo: soundToVideoVideo,
        isNew: true
      },
      // Batch Transition fourth
      {
        id: isBatch ? 'batch-transition' : 'transition',
        icon: '🔀',
        title: isBatch ? 'Batch Transition' : 'Transition Video',
        description: isBatch
          ? 'Create looping videos that connect multiple images together with seamless transitions.'
          : 'Create looping videos that connect multiple images together with seamless transitions. Requires 2 or more images.',
        gradient: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
        exampleVideo: transitionVideo,
        disabled: !isBatch && photoCount < 2
      },
      // Prompt Video
      {
        id: 'prompt',
        icon: '✨',
        title: 'Prompt Video',
        description: 'Create videos using a text prompt describing what should happen in the video.',
        gradient: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
        exampleVideo: promptVideos[promptVideoIndex],
        exampleVideos: promptVideos,
        videoIndex: promptVideoIndex,
        setVideoIndex: setPromptVideoIndex
      },
      // Bald for Base last
      {
        id: 'bald-for-base',
        icon: '🟦',
        title: 'Bald for Base',
        description: 'Create videos for the Bald for Base challenge. Make Brian Armstrong proud.',
        gradient: 'linear-gradient(135deg, #0052FF 0%, #0039CC 100%)',
        exampleVideo: baldForBaseVideos[baldForBaseVideoIndex],
        exampleVideos: baldForBaseVideos,
        videoIndex: baldForBaseVideoIndex,
        setVideoIndex: setBaldForBaseVideoIndex
      }
    ];

    return options;
  }, [promptVideoIndex, emojiVideoIndex, baldForBaseVideoIndex, isBatch, photoCount]);

  // Preload all videos when popup opens to ensure they're cached on iOS
  useEffect(() => {
    if (!visible) return;

    setPromptVideoIndex(0);
    setEmojiVideoIndex(0);
    setBaldForBaseVideoIndex(0);
    setS2vMuted(true); // Reset mute state when popup opens
    setAnimateMoveMuted(true); // Reset animate move mute state when popup opens
    setAnimateReplaceMuted(true); // Reset animate replace mute state when popup opens
    setTransitionMuted(true); // Reset transition mute state when popup opens
    setCameraMuted(true); // Reset 360 camera mute state when popup opens
    // Reset loading states when popup opens
    setVideoLoadedStates({
      'prompt': false,
      'emoji': false,
      'bald-for-base': false,
      'transition': false,
      'animate-move': false,
      'batch-animate-move': false,
      'animate-replace': false,
      'batch-animate-replace': false,
      's2v': false,
      'batch-s2v': false
    });

    // Reset visible videos when popup opens
    setVisibleVideos({});

    // Cleanup function
    return () => {};
  }, [visible]);

  // Intersection Observer to track which video tiles are in view
  useEffect(() => {
    if (!visible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const videoId = entry.target.dataset.videoId;
          if (videoId) {
            setVisibleVideos((prev) => ({
              ...prev,
              [videoId]: entry.isIntersecting
            }));
          }
        });
      },
      {
        root: gridContainerRef.current,
        rootMargin: '50px', // Start loading slightly before the tile is visible
        threshold: 0.1
      }
    );

    // Observe all video container elements
    Object.values(videoContainerRefs.current).forEach((container) => {
      if (container) {
        observer.observe(container);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [visible, videoOptions.length]);

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);

  useEffect(() => {
    let timeoutId;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setWindowWidth(window.innerWidth);
        setWindowHeight(window.innerHeight);
      }, 150);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  // No mobile-specific overrides — tablet styles work well at all widths
  const isMobile = false;
  const isTablet = windowWidth < 1024;
  const isDesktop = windowWidth >= 1024;

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
        overflow: 'hidden',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      {/* Close button - positioned on the backdrop, outside the panel */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: isTablet ? '10px' : '16px',
          right: isTablet ? '10px' : '16px',
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          border: 'none',
          background: 'rgba(255, 255, 255, 0.2)',
          color: '#fff',
          fontSize: '24px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
          lineHeight: '1',
          fontWeight: '300',
          zIndex: 10001,
          backdropFilter: 'blur(10px)'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.35)';
          e.currentTarget.style.transform = 'scale(1.1) rotate(90deg)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
        }}
      >
        ×
      </button>

      <div
        style={{
          background: isMobile ? 'rgba(255, 255, 255, 0.98)' : 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(250, 250, 255, 0.98) 100%)',
          borderRadius: isMobile ? '16px' : '32px',
          padding: isMobile ? '16px 0 24px 0' : isTablet ? '24px 0' : '32px 0',
          maxWidth: '100%',
          width: isMobile ? '100%' : 'auto',
          height: 'auto',
          maxHeight: isMobile ? `${windowHeight - 20}px` : 'calc(100vh - 40px)',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.05)',
          animation: 'slideUp 0.3s ease',
          position: 'relative',
          margin: 'auto',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          WebkitOverflowScrolling: 'touch'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
          marginBottom: isMobile ? '16px' : '24px',
          textAlign: 'center',
          flexShrink: 0,
          padding: '0 24px'
        }}>
          <h2 style={{
            margin: '0 0 6px 0',
            color: '#1a1a1a',
            fontSize: 'clamp(22px, 5vw, 36px)',
            fontWeight: '800',
            fontFamily: '"Permanent Marker", cursive',
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            lineHeight: '1.2'
          }}>
            Choose Your Video Style
          </h2>
          <p style={{
            margin: 0,
            color: '#666',
            fontSize: isMobile ? '12px' : '15px',
            fontWeight: '400',
            letterSpacing: '0.01em'
          }}>
            Select a video type to bring your images to life
          </p>
        </div>

        {/* Video Options Carousel - Horizontal Scroll */}
        <div
          ref={gridContainerRef}
          className="video-selection-carousel"
          style={{
            display: 'flex',
            gap: isMobile ? '12px' : '16px',
            overflowX: 'auto',
            overflowY: 'hidden',
            flex: 'none',
            padding: '8px 24px 24px 24px',
            margin: 0,
            minHeight: 0,
            width: '100%',
            boxSizing: 'border-box',
            WebkitOverflowScrolling: 'touch',
            scrollSnapType: 'x mandatory',
            scrollPaddingLeft: isMobile ? '20px' : '24px',
            scrollPaddingRight: isMobile ? '20px' : '24px',
            touchAction: 'pan-x',
            overscrollBehavior: 'contain',
            transform: 'translateZ(0)',
            willChange: 'scroll-position',
            alignItems: 'flex-start'
          }}
        >
          {videoOptions.map((option) => {
            const isDisabled = option.disabled;
            const isComingSoon = option.comingSoon;
            return (
              <div
                key={option.id}
                role="button"
                tabIndex={(isDisabled || isComingSoon) ? -1 : 0}
                onClick={() => !isDisabled && !isComingSoon && onSelectVideoType(option.id)}
                onKeyDown={(e) => {
                  if (!isDisabled && !isComingSoon && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onSelectVideoType(option.id);
                  }
                }}
                aria-disabled={isDisabled || isComingSoon}
                style={{
                  background: isDisabled
                    ? 'linear-gradient(135deg, #E5E7EB 0%, #D1D5DB 100%)'
                    : 'linear-gradient(135deg, #ffffff 0%, #fafafa 100%)',
                  borderRadius: isMobile ? '16px' : '20px',
                  padding: 0,
                  border: isDisabled
                    ? '2px solid #D1D5DB'
                    : '2px solid rgba(0, 0, 0, 0.08)',
                  cursor: (isDisabled || isComingSoon) ? 'not-allowed' : 'pointer',
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
                  flexShrink: 0,
                  width: isMobile ? 'calc(100vw - 100px)' : isTablet ? '280px' : '340px',
                  minWidth: isMobile ? 'calc(100vw - 100px)' : isTablet ? '280px' : '340px',
                  scrollSnapAlign: 'start',
                  boxSizing: 'border-box'
                }}
                onMouseOver={(e) => {
                  if (!isDisabled && !isComingSoon) {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.08)';
                    e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.15)';
                  }
                }}
                onMouseOut={(e) => {
                  if (!isDisabled && !isComingSoon) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = isDisabled
                      ? '0 2px 8px rgba(0, 0, 0, 0.08)'
                      : '0 4px 20px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)';
                    e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.08)';
                  }
                }}
              >
                {/* Video Container - Hero Element - Always 2:3 Aspect Ratio */}
                <div
                  ref={(el) => {
                    if (el) {
                      videoContainerRefs.current[option.id] = el;
                    }
                  }}
                  data-video-id={option.id}
                  style={{
                  width: '100%',
                  aspectRatio: '2 / 3',
                  borderRadius: isMobile ? '14px 14px 0 0' : '18px 18px 0 0',
                  background: isDisabled 
                    ? 'linear-gradient(135deg, #E5E7EB 0%, #D1D5DB 100%)'
                    : option.gradient,
                  overflow: 'hidden',
                  position: 'relative',
                  isolation: 'isolate',
                  flexShrink: 0,
                  minHeight: 0,
                  margin: '0 auto'
                }}>
                  {/* Placeholder icon - shown while video is loading or if no video */}
                  {(!option.exampleVideo || !videoLoadedStates[
                    option.id === 'batch-transition' ? 'transition' :
                    option.id === 'batch-animate-move' ? 'animate-move' :
                    option.id === 'batch-animate-replace' ? 'animate-replace' :
                    option.id === 'batch-s2v' ? 's2v' :
                    option.id
                  ]) && (
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      fontSize: isMobile ? '64px' : '80px',
                      opacity: isDisabled ? 0.3 : 0.5,
                      filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3))',
                      zIndex: 1,
                      transition: 'opacity 0.3s ease'
                    }}>
                      {option.icon}
                    </div>
                  )}
                  
                  {option.exampleVideo && visibleVideos[option.id] ? (
                    <>
                      {/* Subtle gradient overlay for depth */}
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.15) 100%)',
                        zIndex: 2,
                        pointerEvents: 'none',
                        opacity: videoLoadedStates[
                          option.id === 'batch-transition' ? 'transition' :
                          option.id === 'batch-animate-move' ? 'animate-move' :
                          option.id === 'batch-animate-replace' ? 'animate-replace' :
                          option.id === 'batch-s2v' ? 's2v' :
                          option.id
                        ] ? 1 : 0,
                        transition: 'opacity 0.3s ease'
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
                        muted={
                          (option.id === 's2v' || option.id === 'batch-s2v') ? s2vMuted :
                          (option.id === 'animate-move' || option.id === 'batch-animate-move') ? animateMoveMuted :
                          (option.id === 'animate-replace' || option.id === 'batch-animate-replace') ? animateReplaceMuted :
                          (option.id === 'transition' || option.id === 'batch-transition') ? transitionMuted :
                          option.id === '360-camera' ? cameraMuted :
                          true
                        }
                        playsInline
                        preload="auto"
                        loop={!option.exampleVideos}
                        onLoadedData={() => {
                          // Handle batch variants - map to base key
                          const stateKey = option.id === 'batch-transition' ? 'transition' :
                                          option.id === 'batch-animate-move' ? 'animate-move' :
                                          option.id === 'batch-animate-replace' ? 'animate-replace' :
                                          option.id === 'batch-s2v' ? 's2v' :
                                          option.id;
                          setVideoLoadedStates(prev => ({ ...prev, [stateKey]: true }));
                        }}
                        onCanPlay={() => {
                          // Also mark as loaded on canplay for faster feedback
                          const stateKey = option.id === 'batch-transition' ? 'transition' :
                                          option.id === 'batch-animate-move' ? 'animate-move' :
                                          option.id === 'batch-animate-replace' ? 'animate-replace' :
                                          option.id === 'batch-s2v' ? 's2v' :
                                          option.id;
                          setVideoLoadedStates(prev => ({ ...prev, [stateKey]: true }));
                        }}
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
                          zIndex: 0,
                          opacity: videoLoadedStates[
                            option.id === 'batch-transition' ? 'transition' :
                            option.id === 'batch-animate-move' ? 'animate-move' :
                            option.id === 'batch-animate-replace' ? 'animate-replace' :
                            option.id === 'batch-s2v' ? 's2v' :
                            option.id
                          ] ? 1 : 0,
                          transition: 'opacity 0.3s ease'
                        }}
                      />
                      {/* Mute/Unmute button - only show one per video type */}
                      {((option.id === 's2v' || option.id === 'batch-s2v') && 
                        videoLoadedStates[option.id === 'batch-s2v' ? 's2v' : option.id]) ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // When unmuting S2V, mute other video types
                            if (s2vMuted) {
                              setAnimateMoveMuted(true);
                              setAnimateReplaceMuted(true);
                              setTransitionMuted(true);
                              setCameraMuted(true);
                            }
                            setS2vMuted(!s2vMuted);
                          }}
                          style={{
                            position: 'absolute',
                            bottom: '12px',
                            right: '12px',
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            border: 'none',
                            background: 'rgba(0, 0, 0, 0.7)',
                            color: 'white',
                            fontSize: '18px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease',
                            zIndex: 10,
                            backdropFilter: 'blur(10px)',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.85)';
                            e.currentTarget.style.transform = 'scale(1.1)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                        >
                          {s2vMuted ? '🔇' : '🔊'}
                        </button>
                      ) : ((option.id === 'animate-move' || option.id === 'batch-animate-move') && 
                            videoLoadedStates[option.id === 'batch-animate-move' ? 'animate-move' : option.id]) ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // When unmuting animate move, mute other video types
                            if (animateMoveMuted) {
                              setS2vMuted(true);
                              setAnimateReplaceMuted(true);
                              setTransitionMuted(true);
                              setCameraMuted(true);
                            }
                            setAnimateMoveMuted(!animateMoveMuted);
                          }}
                          style={{
                            position: 'absolute',
                            bottom: '12px',
                            right: '12px',
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            border: 'none',
                            background: 'rgba(0, 0, 0, 0.7)',
                            color: 'white',
                            fontSize: '18px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease',
                            zIndex: 10,
                            backdropFilter: 'blur(10px)',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.85)';
                            e.currentTarget.style.transform = 'scale(1.1)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                        >
                          {animateMoveMuted ? '🔇' : '🔊'}
                        </button>
                      ) : ((option.id === 'animate-replace' || option.id === 'batch-animate-replace') && 
                            videoLoadedStates[option.id === 'batch-animate-replace' ? 'animate-replace' : option.id]) ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // When unmuting animate replace, mute other video types
                            if (animateReplaceMuted) {
                              setS2vMuted(true);
                              setAnimateMoveMuted(true);
                              setTransitionMuted(true);
                              setCameraMuted(true);
                            }
                            setAnimateReplaceMuted(!animateReplaceMuted);
                          }}
                          style={{
                            position: 'absolute',
                            bottom: '12px',
                            right: '12px',
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            border: 'none',
                            background: 'rgba(0, 0, 0, 0.7)',
                            color: 'white',
                            fontSize: '18px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease',
                            zIndex: 10,
                            backdropFilter: 'blur(10px)',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.85)';
                            e.currentTarget.style.transform = 'scale(1.1)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                        >
                          {animateReplaceMuted ? '🔇' : '🔊'}
                        </button>
                      ) : ((option.id === 'transition' || option.id === 'batch-transition') && 
                            videoLoadedStates['transition']) ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // When unmuting transition videos, mute other video types
                            if (transitionMuted) {
                              setS2vMuted(true);
                              setAnimateMoveMuted(true);
                              setAnimateReplaceMuted(true);
                              setCameraMuted(true);
                            }
                            setTransitionMuted(!transitionMuted);
                          }}
                          style={{
                            position: 'absolute',
                            bottom: '12px',
                            right: '12px',
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            border: 'none',
                            background: 'rgba(0, 0, 0, 0.7)',
                            color: 'white',
                            fontSize: '18px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease',
                            zIndex: 10,
                            backdropFilter: 'blur(10px)',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.85)';
                            e.currentTarget.style.transform = 'scale(1.1)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                        >
                          {transitionMuted ? '🔇' : '🔊'}
                        </button>
                      ) : (option.id === '360-camera' && videoLoadedStates['360-camera']) ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (cameraMuted) {
                              setS2vMuted(true);
                              setAnimateMoveMuted(true);
                              setAnimateReplaceMuted(true);
                              setTransitionMuted(true);
                            }
                            setCameraMuted(!cameraMuted);
                          }}
                          style={{
                            position: 'absolute',
                            bottom: '12px',
                            right: '12px',
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            border: 'none',
                            background: 'rgba(0, 0, 0, 0.7)',
                            color: 'white',
                            fontSize: '18px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease',
                            zIndex: 10,
                            backdropFilter: 'blur(10px)',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.85)';
                            e.currentTarget.style.transform = 'scale(1.1)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                        >
                          {cameraMuted ? '🔇' : '🔊'}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  
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
                  padding: isMobile ? '14px 12px' : isTablet ? '16px 14px' : '18px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: isMobile ? '8px' : isTablet ? '10px' : '12px',
                  flex: '0 0 auto',
                  background: 'transparent',
                  minHeight: 0
                }}>
                  {/* Title and Icon */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: isMobile ? '8px' : '10px',
                    marginBottom: 0
                  }}>
                    <span style={{
                      fontSize: isMobile ? '22px' : isTablet ? '26px' : '28px',
                      filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))',
                      flexShrink: 0
                    }}>
                      {option.icon}
                    </span>
                    <h3 style={{
                      margin: 0,
                      color: (isDisabled || isComingSoon) ? '#9CA3AF' : '#1a1a1a',
                      fontSize: isMobile ? '16px' : isTablet ? '18px' : '20px',
                      fontWeight: '700',
                      fontFamily: '"Permanent Marker", cursive',
                      letterSpacing: '-0.01em',
                      lineHeight: '1.2',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      flexWrap: 'nowrap'
                    }}>
                      {option.title}
                      {option.isNew && (
                        <span style={{
                          fontSize: isMobile ? '8px' : '9px',
                          fontWeight: '700',
                          fontFamily: 'system-ui, sans-serif',
                          background: 'linear-gradient(135deg, #10b981, #059669)',
                          color: 'white',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          flexShrink: 0,
                          animation: 'newBadgePulse 2s ease-in-out infinite'
                        }}>
                          NEW
                        </span>
                      )}
                    </h3>
                  </div>

                  {/* Description */}
                  <p style={{
                    margin: 0,
                    color: (isDisabled || isComingSoon) ? '#9CA3AF' : '#666',
                    fontSize: isMobile ? '13px' : isTablet ? '14px' : '13px',
                    lineHeight: '1.4',
                    fontWeight: '400',
                    letterSpacing: '0.01em',
                    display: '-webkit-box',
                    WebkitLineClamp: isMobile ? 4 : isTablet ? 4 : 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {option.description}
                  </p>

                  {/* Disabled message */}
                  {isDisabled && (
                    <div style={{
                      marginTop: '4px',
                      padding: isMobile ? '6px 8px' : '8px 10px',
                      background: 'rgba(156, 163, 175, 0.15)',
                      borderRadius: '6px',
                      color: '#6B7280',
                      fontSize: isMobile ? '11px' : '12px',
                      fontWeight: '600',
                      textAlign: 'center',
                      border: '1px solid rgba(156, 163, 175, 0.2)'
                    }}>
                      {option.disabledMessage || 'Requires 2+ images'}
                    </div>
                  )}

                  {/* Subtle gradient accent at bottom */}
                  {!isDisabled && (
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: '4px',
                      background: option.gradient,
                      opacity: 0.7
                    }} />
                  )}
                </div>
              </div>
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
        @keyframes newBadgePulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.85;
            transform: scale(1.05);
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

