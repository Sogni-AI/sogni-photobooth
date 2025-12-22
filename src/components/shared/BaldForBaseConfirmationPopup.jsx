import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { getTokenLabel } from '../../services/walletService';
import urls from '../../config/urls';

/**
 * BaldForBaseConfirmationPopup
 * Confirmation popup for Bald for Base video generation with cost display and Base.org branding
 */
const BaldForBaseConfirmationPopup = ({ 
  visible, 
  onConfirm, 
  onClose,
  loading,
  costRaw,
  costUSD,
  videoResolution,
  tokenType = 'spark',
  isBatch = false,
  itemCount = 1
}) => {
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const videoRef = useRef(null);
  const [videoError, setVideoError] = useState(null);
  const [isWideScreen, setIsWideScreen] = useState(false);

  // Video URLs for the teaser videos
  const videoUrls = [
    `${urls.assetUrl}/bold-4-base/bold-4-base-1.mp4`,
    `${urls.assetUrl}/bold-4-base/bold-4-base-2.mp4`,
    `${urls.assetUrl}/bold-4-base/bold-4-base-3.mp4`,
    `${urls.assetUrl}/bold-4-base/bold-4-base-4.mp4`
  ];

  // Check screen width for responsive layout
  useEffect(() => {
    const checkScreenWidth = () => {
      setIsWideScreen(window.innerWidth >= 900);
    };
    checkScreenWidth();
    window.addEventListener('resize', checkScreenWidth);
    return () => window.removeEventListener('resize', checkScreenWidth);
  }, []);

  // Reset video index when popup becomes visible
  useEffect(() => {
    if (visible) {
      setCurrentVideoIndex(0);
      setVideoError(null);
      // Reset and prepare the first video when popup opens
      if (videoRef.current) {
        const video = videoRef.current;
        video.src = videoUrls[0];
        video.currentTime = 0;
        video.load();
        // Let autoPlay handle the initial play to avoid conflicts
      }
    }
  }, [visible]);

  // Update video source when index changes - optimized for iOS caching
  useEffect(() => {
    if (videoRef.current && videoUrls[currentVideoIndex]) {
      const video = videoRef.current;
      const newSrc = videoUrls[currentVideoIndex];
      
      // Only update if the source is different to avoid unnecessary reloads
      if (video.src !== newSrc) {
        // Pause and reset before changing source
        video.pause();
        video.currentTime = 0;
        
        // Set new source
        video.src = newSrc;
        
        // On iOS, avoid calling load() if possible to prevent cache invalidation
        // Use requestAnimationFrame to allow browser to process src change
        requestAnimationFrame(() => {
          if (videoRef.current && videoRef.current.src === newSrc) {
            const videoEl = videoRef.current;
            // If video is already ready (cached), play immediately
            if (videoEl.readyState >= 3) {
              videoEl.play().catch(err => {
                console.log('Video autoplay prevented:', err);
                setVideoError(err.message);
              });
            } else {
              // Only call load() if not ready - this will trigger loading
              videoEl.load();
              const playWhenReady = () => {
                if (videoRef.current && videoRef.current.src === newSrc) {
                  videoRef.current.play().catch(err => {
                    console.log('Video autoplay prevented:', err);
                    setVideoError(err.message);
                  });
                }
              };
              videoEl.addEventListener('canplay', playWhenReady, { once: true });
            }
          }
        });
      }
    }
  }, [currentVideoIndex]);

  // Handle video end event - move to next video
  const handleVideoEnd = () => {
    if (!videoRef.current) return;
    
    const nextIndex = (currentVideoIndex + 1) % videoUrls.length;
    
    // Just update the state - useEffect will handle the src change
    setCurrentVideoIndex(nextIndex);
  };

  // Handle video errors
  const handleVideoError = (e) => {
    const error = e.target.error;
    const currentUrl = videoUrls[currentVideoIndex];
    let errorMsg = 'Failed to load video';
    if (error) {
      switch (error.code) {
        case error.MEDIA_ERR_ABORTED:
          errorMsg = 'Video loading aborted';
          break;
        case error.MEDIA_ERR_NETWORK:
          errorMsg = 'Network error loading video';
          break;
        case error.MEDIA_ERR_DECODE:
          errorMsg = 'Video decode error';
          break;
        case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
          errorMsg = 'Video format not supported';
          break;
        default:
          errorMsg = `Video error: ${error.message || 'Unknown error'}`;
      }
    }
    console.error('Video error:', errorMsg, 'URL:', currentUrl, 'Error details:', error);
    setVideoError(`${errorMsg} (check console for URL)`);
  };

  // Handle video loaded
  const handleVideoLoaded = () => {
    setVideoError(null);
    // Don't auto-play here - let the video element's autoPlay attribute handle it
    // This prevents multiple play() calls that can cause issues
  };

  // Handle video click to go fullscreen
  const handleVideoClick = () => {
    if (videoRef.current) {
      // Set objectFit to 'contain' to maintain aspect ratio in fullscreen
      videoRef.current.style.objectFit = 'contain';
      
      // Request fullscreen
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen().catch(err => {
          console.log('Error attempting to enable fullscreen:', err);
        });
      } else if (videoRef.current.webkitRequestFullscreen) {
        videoRef.current.webkitRequestFullscreen();
      } else if (videoRef.current.mozRequestFullScreen) {
        videoRef.current.mozRequestFullScreen();
      } else if (videoRef.current.msRequestFullscreen) {
        videoRef.current.msRequestFullscreen();
      }
    }
  };

  const formatCost = (tokenCost, usdCost) => {
    if (!tokenCost || !usdCost) return null;
    // Format token cost to reasonable precision (max 2 decimal places)
    const formattedTokenCost = typeof tokenCost === 'number' ? tokenCost.toFixed(2) : parseFloat(tokenCost).toFixed(2);
    return `${formattedTokenCost} (≈ $${usdCost.toFixed(2)} USD)`;
  };

  if (!visible) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

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
        padding: isWideScreen ? '20px' : '0',
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.2s ease'
      }}
      onClick={handleBackdropClick}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #0052FF 0%, #0039CC 100%)',
          borderRadius: isWideScreen ? '24px' : '0',
          padding: isWideScreen ? '60px' : '0',
          maxWidth: isWideScreen ? '1000px' : '100%',
          width: '100%',
          height: isWideScreen ? 'auto' : '100%',
          maxHeight: isWideScreen ? '95vh' : '100vh',
          overflow: isWideScreen ? 'hidden' : 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: isWideScreen ? 'flex-start' : 'flex-start',
          boxShadow: isWideScreen ? '0 24px 64px rgba(0, 82, 255, 0.5)' : 'none',
          animation: 'slideUp 0.3s ease',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Giant Pink Sloth Background */}
        <img
          src="/sloth_cam_hop_trnsparent.png"
          alt="Sloth mascot with camera"
          style={{
            position: 'absolute',
            left: isWideScreen ? '-12%' : '-8%',
            top: isWideScreen ? '1%' : '-16%',
            height: isWideScreen ? '230%' : '160%',
            opacity: 0.85,
            zIndex: 1,
            pointerEvents: 'none',
            filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.2))',
            maxWidth: isWideScreen ? '100%' : '200%'
          }}
        />
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: isWideScreen ? '16px' : '12px',
            right: isWideScreen ? '16px' : '12px',
            width: isWideScreen ? '36px' : '32px',
            height: isWideScreen ? '36px' : '32px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255, 255, 255, 0.25)',
            color: 'white',
            fontSize: isWideScreen ? '22px' : '20px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            zIndex: 20,
            backdropFilter: 'blur(8px)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.35)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          ×
        </button>

        {/* Main Content Container - Single column for mobile, 2-column for desktop */}
        <div style={{
          display: 'flex',
          flexDirection: isWideScreen ? 'row' : 'column',
          gap: isWideScreen ? '32px' : '16px',
          flex: 1,
          minHeight: 0,
          overflow: isWideScreen ? 'visible' : 'hidden',
          alignItems: isWideScreen ? 'center' : 'stretch',
          justifyContent: isWideScreen ? 'flex-start' : 'flex-start',
          padding: isWideScreen ? '0' : '0 45px',
          paddingTop: isWideScreen ? '0' : '32px',
          paddingBottom: isWideScreen ? '0' : (formatCost(costRaw, costUSD) && !loading ? '80px' : '100px'),
          position: 'relative',
          zIndex: 2
        }}>
          {/* Popup Title - Mobile only */}
          {!isWideScreen && (
            <div style={{
              fontSize: '36px',
              fontWeight: '800',
              color: 'white',
              marginBottom: '8px',
              marginTop: '0',
              lineHeight: '1.2',
              letterSpacing: '-0.02em',
              textAlign: 'center',
              textShadow: '0 2px 12px rgba(0, 0, 0, 0.5), 0 1px 4px rgba(0, 0, 0, 0.4)',
              flexShrink: 0,
              width: '100%'
            }}>
              SOGNI + BASE App
            </div>
          )}

          {/* Base App Preview Image - Mobile only */}
          {!isWideScreen && (
            <div style={{
              width: '100%',
              margin: '0',
              position: 'relative',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
              background: 'rgba(0, 0, 0, 0.2)',
              flexShrink: 0
            }}>
              <img
                src="/base-hero-wallet-metadata.png"
                alt="Base App Preview"
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  objectFit: 'contain',
                  borderRadius: '16px'
                }}
              />
              <a
                href="https://blog.base.org/baseapp"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  display: 'inline-block',
                  padding: '8px 14px',
                  background: 'rgba(0, 0, 0, 0.85)',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: '600',
                  textDecoration: 'none',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  transition: 'all 0.2s ease',
                  backdropFilter: 'blur(8px)'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.95)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.85)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Learn More ↗
              </a>
            </div>
          )}

          {/* Desktop: Marketing Content */}
          {isWideScreen && (
            <div 
              className="bald-for-base-popup-content"
              style={{
                flex: '1 1 auto',
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                position: 'relative',
                gap: '20px',
                padding: '0 20px',
                overflow: 'visible',
                maxHeight: 'none'
              }}
            >
              {/* Popup Title - Desktop */}
              <div style={{
                fontSize: '42px',
                fontWeight: '800',
                color: 'white',
                marginBottom: '8px',
                marginTop: '0',
                lineHeight: '1.2',
                letterSpacing: '-0.02em',
                textAlign: 'left',
                textShadow: '0 2px 12px rgba(0, 0, 0, 0.5), 0 1px 4px rgba(0, 0, 0, 0.4)'
              }}>
                SOGNI + BASE App
              </div>

              {/* Main Content Section */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                flex: 1,
                minHeight: 0
              }}>
                {/* Text Content */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}>
                  <p style={{
                    margin: 0,
                    color: 'rgba(255, 255, 255, 0.98)',
                    fontSize: '16px',
                    lineHeight: '1.6',
                    textAlign: 'left',
                    fontWeight: '400',
                    textShadow: '0 1px 6px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)'
                  }}>
                    Coinbase's Base App is now live and <a href="https://www.sogni.ai/super-apps" target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'underline', fontWeight: '700' }}>Sogni.ai SuperApps</a> will be available in Base App soon.
                    Share a Bald for Base video on X or Base, tag <a href="https://x.com/Sogni_Protocol" target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'underline', fontWeight: '700' }}>@Sogni_Protocol</a> for a chance at your share of 100,000 SOGNI tokens!
                  </p>
                </div>

                {/* Base App Preview Image - Desktop only */}
                <div style={{
                  marginTop: '8px',
                  position: 'relative',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                  background: 'rgba(0, 0, 0, 0.2)',
                  width: '80%',
                  filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4))'
                }}>
                  <img
                    src="/base-hero-wallet-metadata.png"
                    alt="Base App Preview"
                    style={{
                      width: '100%',
                      height: 'auto',
                      display: 'block',
                      maxHeight: '300px',
                      objectFit: 'contain',
                    }}
                  />
                  <a
                    href="https://blog.base.org/baseapp"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      position: 'absolute',
                      bottom: '12px',
                      left: '12px',
                      display: 'inline-block',
                      padding: '8px 14px',
                      background: 'rgba(0, 0, 0, 0.85)',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: '600',
                      textDecoration: 'none',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      transition: 'all 0.2s ease',
                      backdropFilter: 'blur(8px)'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(0, 0, 0, 0.95)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'rgba(0, 0, 0, 0.85)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    Learn More ↗
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Mobile: Text Content */}
          {!isWideScreen && (
            <p style={{
              margin: 0,
              color: 'rgba(255, 255, 255, 0.98)',
              fontSize: '13px',
              lineHeight: '1.4',
              textAlign: 'left',
              fontWeight: '400',
              textShadow: '0 1px 6px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)',
              flexShrink: 0
            }}>
              Coinbase's Base App is now live and <a href="https://www.sogni.ai/super-apps" target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'underline', fontWeight: '700' }}>Sogni.ai SuperApps</a> will be available in Base App soon.
              Share a Bald for Base video on X or Base, tag <a href="https://x.com/Sogni_Protocol" target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'underline', fontWeight: '700' }}>@Sogni_Protocol</a> for a chance at your share of 100,000 SOGNI tokens!
            </p>
          )}

          {/* Video Teaser - Mobile: Centered, smaller */}
          {!isWideScreen && (
            <div style={{
              width: '160px',
              margin: '0 auto',
              aspectRatio: '2 / 3',
              borderRadius: '16px',
              overflow: 'hidden',
              background: 'rgba(0, 0, 0, 0.4)',
              boxShadow: '0 8px 8px rgba(0, 0, 0, 0.4)',
              position: 'relative',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 3,
              border: '2px solid rgba(255, 255, 255, 0.15)'
            }}>
              <video
                ref={videoRef}
                src={videoUrls[currentVideoIndex]}
                autoPlay
                muted
                playsInline
                loop={false}
                preload="auto"
                onEnded={handleVideoEnd}
                onError={handleVideoError}
                onLoadedData={handleVideoLoaded}
                onClick={handleVideoClick}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  objectFit: 'cover',
                  objectPosition: 'center center',
                  cursor: 'pointer',
                  aspectRatio: '2 / 3'
                }}
              />
              {videoError && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  color: 'white',
                  fontSize: '12px',
                  textAlign: 'center',
                  padding: '12px',
                  background: 'rgba(255, 0, 0, 0.8)',
                  borderRadius: '8px',
                  zIndex: 10
                }}>
                  {videoError}
                </div>
              )}
              {/* Contest info overlay at bottom */}
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                padding: isWideScreen ? '12px 14px' : '10px 12px',
                background: 'linear-gradient(to top, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.7) 70%, transparent 100%)',
                color: 'white',
                fontSize: isWideScreen ? '12px' : '11px',
                textAlign: 'center',
                zIndex: 5,
                pointerEvents: 'none'
              }}>
                <div style={{ fontWeight: '700', marginBottom: '2px' }}>5 winners on Jan 15</div>
                <div style={{ fontSize: isWideScreen ? '11px' : '10px', opacity: 0.9 }}>Tag and follow for updates</div>
              </div>
            </div>
          )}

          {/* Video Teaser - Desktop */}
          {isWideScreen && (
            <div style={{
              flex: '0 0 auto',
              width: '360px',
              aspectRatio: '2 / 3',
              borderRadius: '16px',
              overflow: 'hidden',
              background: 'rgba(0, 0, 0, 0.4)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
              position: 'relative',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              alignSelf: 'center',
              zIndex: 3,
              border: '2px solid rgba(255, 255, 255, 0.15)'
            }}>
              <video
                ref={videoRef}
                src={videoUrls[currentVideoIndex]}
                autoPlay
                muted
                playsInline
                loop={false}
                preload="auto"
                onEnded={handleVideoEnd}
                onError={handleVideoError}
                onLoadedData={handleVideoLoaded}
                onClick={handleVideoClick}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  objectFit: 'cover',
                  objectPosition: 'center center',
                  cursor: 'pointer',
                  aspectRatio: '2 / 3'
                }}
              />
              {videoError && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  color: 'white',
                  fontSize: '12px',
                  textAlign: 'center',
                  padding: '12px',
                  background: 'rgba(255, 0, 0, 0.8)',
                  borderRadius: '8px',
                  zIndex: 10
                }}>
                  {videoError}
                </div>
              )}
              {/* Contest info overlay at bottom */}
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                padding: '12px 14px',
                background: 'linear-gradient(to top, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.7) 70%, transparent 100%)',
                color: 'white',
                fontSize: '12px',
                textAlign: 'center',
                zIndex: 5,
                pointerEvents: 'none'
              }}>
                <div style={{ fontWeight: '700', marginBottom: '2px' }}>5 winners on Jan 15</div>
                <div style={{ fontSize: '11px', opacity: 0.9 }}>Tag and follow for updates</div>
              </div>
            </div>
          )}

          {/* Generate Button - Mobile only */}
          {!isWideScreen && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px 20px',
                borderRadius: '14px',
                border: 'none',
                background: loading ? 'rgba(0, 82, 255, 0.5)' : '#0052FF',
                color: 'white',
                fontSize: '14px',
                fontWeight: '700',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.25s ease',
                boxShadow: loading ? 'none' : '0 6px 24px rgba(0, 82, 255, 0.4)',
                touchAction: 'manipulation',
                letterSpacing: '-0.01em',
                lineHeight: '1.4',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flexShrink: 0
              }}
              onMouseOver={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = '#0039CC';
                  e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 82, 255, 0.5)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseOut={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = '#0052FF';
                  e.currentTarget.style.boxShadow = '0 6px 24px rgba(0, 82, 255, 0.4)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
            >
              {loading 
                ? '⏳ Calculating...' 
                : isBatch && itemCount > 1
                  ? `Generate ${itemCount} Videos ⚡️`
                  : 'Generate Video ⚡️'
              }
            </button>
          )}
        </div>

        {/* Action Buttons - Desktop only */}
        {isWideScreen && (
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            gap: '32px',
            marginTop: '24px',
            marginBottom: formatCost(costRaw, costUSD) && !loading ? '70px' : '20px',
            padding: '0',
            flexShrink: 0,
            justifyContent: 'flex-end',
            alignItems: 'flex-end',
            position: 'relative',
            zIndex: 3
          }}>
            <div style={{ flex: '1 1 auto' }} />
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              style={{
                flex: '0 0 auto',
                width: '360px',
                maxWidth: '360px',
                padding: '16px 32px',
                borderRadius: '14px',
                border: 'none',
                background: loading ? 'rgba(255, 20, 147, 0.5)' : '#FF1493',
                color: loading ? 'rgba(255, 255, 255, 0.7)' : 'white',
                fontSize: '16px',
                fontWeight: '700',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.25s ease',
                boxShadow: loading ? 'none' : '0 6px 24px rgba(255, 20, 147, 0.4)',
                touchAction: 'manipulation',
                letterSpacing: '-0.01em',
                lineHeight: '1.4'
              }}
              onMouseOver={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = '#FF10F0';
                  e.currentTarget.style.boxShadow = '0 8px 32px rgba(255, 20, 147, 0.5)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseOut={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = '#FF1493';
                  e.currentTarget.style.boxShadow = '0 6px 24px rgba(255, 20, 147, 0.4)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
            >
              {loading 
                ? '⏳ Calculating...' 
                : isBatch && itemCount > 1
                  ? `Generate ${itemCount} Bald for Base Videos ⚡️`
                  : 'Generate a Bald for Base Video ⚡️'
              }
            </button>
          </div>
        )}

        {/* Cost Footer */}
        {!loading && formatCost(costRaw, costUSD) ? (
          <div style={{
            padding: isWideScreen ? '14px 20px' : '14px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.2)',
            background: 'rgba(0, 0, 0, 0.15)',
            color: 'rgba(255, 255, 255, 0.95)',
            fontSize: '12px',
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 3
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              <div style={{ 
                display: 'flex', 
                gap: '8px', 
                alignItems: 'center',
                fontSize: '11px',
                fontWeight: '500',
                opacity: 0.9
              }}>
                {isBatch && itemCount > 1 && (
                  <span>📹 {itemCount} videos</span>
                )}
                <span>📐 {videoResolution || '480p'}</span>
                <span>⏱️ 5s</span>
              </div>
              <div style={{ 
                display: 'flex', 
                gap: '6px', 
                alignItems: 'center',
                fontWeight: '600'
              }}>
                {costRaw && (
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'white' }}>
                    {(() => {
                      const costValue = typeof costRaw === 'number' ? costRaw : parseFloat(costRaw);
                      if (isNaN(costValue)) return null;
                      const tokenLabel = getTokenLabel(tokenType);
                      return `${costValue.toFixed(2)} ${tokenLabel}`;
                    })()}
                  </span>
                )}
                {costUSD && (
                  <span style={{ 
                    fontWeight: '500', 
                    opacity: 0.85, 
                    fontSize: '12px', 
                    color: 'rgba(255, 255, 255, 0.9)' 
                  }}>
                    ≈ ${costUSD.toFixed(2)} USD
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : loading ? (
          <div style={{
            padding: isWideScreen ? '14px 20px' : '14px 20px',
            fontSize: '12px',
            fontWeight: '600',
            textAlign: 'center',
            borderTop: '1px solid rgba(255, 255, 255, 0.2)',
            background: 'rgba(0, 0, 0, 0.15)',
            color: 'rgba(255, 255, 255, 0.95)',
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 3
          }}>
            Calculating cost...
          </div>
        ) : null}
      </div>

      {/* CSS animations and scrollbar fixes */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        /* Hide scrollbar but allow scrolling */
        .bald-for-base-popup-content::-webkit-scrollbar {
          width: 4px;
        }
        .bald-for-base-popup-content::-webkit-scrollbar-track {
          background: transparent;
        }
        .bald-for-base-popup-content::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 2px;
        }
        .bald-for-base-popup-content::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }
      `}</style>
    </div>,
    document.body
  );
};

BaldForBaseConfirmationPopup.propTypes = {
  visible: PropTypes.bool.isRequired,
  onConfirm: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  costRaw: PropTypes.number,
  costUSD: PropTypes.number,
  videoResolution: PropTypes.string,
  tokenType: PropTypes.oneOf(['spark', 'sogni']),
  isBatch: PropTypes.bool,
  itemCount: PropTypes.number
};

export default BaldForBaseConfirmationPopup;

