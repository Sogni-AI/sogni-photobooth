import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { getTokenLabel } from '../../services/walletService';
import urls from '../../config/urls';

/**
 * BaseHeroConfirmationPopup
 * Confirmation popup for BASE Hero video generation with cost display and Base.org branding
 */
const BaseHeroConfirmationPopup = ({ 
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

  // Reset video index and source when popup becomes visible
  useEffect(() => {
    if (visible) {
      setCurrentVideoIndex(0);
      setVideoError(null);
      // Reset video source and auto-play the first video when popup opens
      if (videoRef.current) {
        const video = videoRef.current;
        const firstVideoUrl = videoUrls[0];
        console.log('Loading first video:', firstVideoUrl);
        video.src = firstVideoUrl;
        video.load(); // Force reload
        video.currentTime = 0;
        // Small delay to ensure video is ready
        setTimeout(() => {
          video.play().catch(err => {
            console.log('Video autoplay prevented:', err);
            setVideoError(err.message);
          });
        }, 100);
      }
    }
  }, [visible]);

  // Handle video end event - move to next video
  const handleVideoEnd = () => {
    const nextIndex = (currentVideoIndex + 1) % videoUrls.length;
    setCurrentVideoIndex(nextIndex);
    if (videoRef.current) {
      const video = videoRef.current;
      video.src = videoUrls[nextIndex];
      video.load(); // Force reload
      // Small delay to ensure video is ready
      setTimeout(() => {
        video.play().catch(err => {
          console.log('Video autoplay prevented:', err);
          setVideoError(err.message);
        });
      }, 100);
    }
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
    console.log('Video loaded successfully:', videoUrls[currentVideoIndex]);
    if (videoRef.current) {
      videoRef.current.play().catch(err => {
        console.log('Video autoplay prevented after load:', err);
      });
    }
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
          overflow: isWideScreen ? 'auto' : 'hidden',
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
            left: isWideScreen ? '-17%' : '-21%',
            top: isWideScreen ? '3%' : '-16%',
            height: isWideScreen ? '240%' : '160%',
            opacity: 0.85,
            zIndex: 1,
            pointerEvents: 'none',
            animation: 'float 6s ease-in-out infinite',
            filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.2))',
            maxWidth: isWideScreen ? '100%' : '200%',
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

        {/* Main Content Container */}
        <div style={{
          display: 'flex',
          flexDirection: isWideScreen ? 'row' : 'column',
          gap: isWideScreen ? '32px' : '0',
          flex: 1,
          minHeight: 0,
          overflow: isWideScreen ? 'visible' : 'auto',
          alignItems: isWideScreen ? 'center' : 'stretch',
          justifyContent: isWideScreen ? 'flex-start' : 'flex-start',
          padding: isWideScreen ? '0' : '0 20px',
          position: 'relative',
          zIndex: 2
        }}>
          {/* Marketing Content */}
          <div 
            className="base-hero-popup-content"
            style={{
              flex: isWideScreen ? '1 1 auto' : '1 1 auto',
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
              position: 'relative',
              gap: isWideScreen ? '20px' : '20px',
              padding: isWideScreen ? '0 20px' : '30px',
              paddingTop: isWideScreen ? '0' : '24px',
              paddingBottom: isWideScreen ? '0' : '0'
            }}
          >
            {/* Popup Title */}
            <div style={{
              fontSize: isWideScreen ? '42px' : '36px',
              fontWeight: '800',
              color: 'white',
              marginBottom: isWideScreen ? '8px' : '4px',
              marginTop: isWideScreen ? '0' : '25px',
              lineHeight: '1.2',
              letterSpacing: '-0.02em',
              textAlign: isWideScreen ? 'left' : 'center',
              textShadow: isWideScreen ? '0 2px 12px rgba(0, 0, 0, 0.5), 0 1px 4px rgba(0, 0, 0, 0.4)' : '0 2px 12px rgba(0, 0, 0, 0.5), 0 1px 4px rgba(0, 0, 0, 0.4)'
            }}>
              SOGNI + BASE App
            </div>

            {/* Main Content Section */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: isWideScreen ? '20px' : '20px',
              flex: 1,
              minHeight: 0
            }}>
              {/* Text Content */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}>
                {/* Base App Preview Image - Mobile: Full width, prominent */}
                {!isWideScreen && (
                  <div style={{
                    width: '100%',
                    margin: '0 0 12px 0',
                    position: 'relative',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                    background: 'rgba(0, 0, 0, 0.2)'
                  }}>
                    <img
                      src="/base-hero-wallet-metadata.png"
                      alt="Base App Preview"
                      style={{
                        width: '100%',
                        height: 'auto',
                        display: 'block',
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
                )}

                <p style={{
                  margin: 0,
                  color: 'rgba(255, 255, 255, 0.98)',
                  fontSize: isWideScreen ? '16px' : '15px',
                  lineHeight: '1.6',
                  textAlign: 'left',
                  fontWeight: '400',
                  textShadow: isWideScreen ? '0 1px 6px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)' : '0 1px 6px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)'
                }}>
                  Coinbase's Base App is now live and <a href="https://www.sogni.ai/super-apps" target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'underline', fontWeight: '700' }}>Sogni.ai SuperApps</a> will be available in Base App soon.
                  Share a BASE Hero video on X or Base <a href="https://x.com/Sogni_Protocol" target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'underline', fontWeight: '700' }}>@Sogni_Protocol</a> for a chance at 100,000 SOGNI tokens!
                </p>
              </div>

              {/* Base App Preview Image - Desktop only */}
              {isWideScreen && (
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
              )}

              {/* Video Teaser - Mobile: Larger, more prominent */}
              {!isWideScreen && (
                <div style={{
                  width: '100%',
                  maxWidth: '250px',
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
                  margin: '8px auto 0',
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
                    crossOrigin="anonymous"
                    onEnded={handleVideoEnd}
                    onError={handleVideoError}
                    onLoadedData={handleVideoLoaded}
                    onCanPlay={handleVideoLoaded}
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
                      Video Error
                    </div>
                  )}
                  {/* Contest info overlay at bottom */}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '10px 12px',
                    background: 'linear-gradient(to top, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.7) 70%, transparent 100%)',
                    color: 'white',
                    fontSize: '11px',
                    textAlign: 'center',
                    zIndex: 5,
                    pointerEvents: 'none'
                  }}>
                    <div style={{ fontWeight: '700', marginBottom: '2px' }}>5 winners on Jan 15</div>
                    <div style={{ fontSize: '10px', opacity: 0.9 }}>Tag and follow for updates</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Video Teaser - Desktop only */}
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
                crossOrigin="anonymous"
                onEnded={handleVideoEnd}
                onError={handleVideoError}
                onLoadedData={handleVideoLoaded}
                onCanPlay={handleVideoLoaded}
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
        </div>

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          flexDirection: isWideScreen ? 'row' : 'column',
          gap: isWideScreen ? '32px' : '12px',
          marginTop: isWideScreen ? '24px' : '20px',
          marginBottom: isWideScreen ? '20px' : '38px',
          padding: isWideScreen ? '0' : '0 20px',
          flexShrink: 0,
          justifyContent: isWideScreen ? 'flex-end' : 'center',
          position: 'relative',
          zIndex: 3
        }}>
          {isWideScreen && <div style={{ flex: '1 1 auto' }} />}
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              flex: isWideScreen ? '0 0 auto' : 1,
              width: isWideScreen ? '360px' : 'auto',
              maxWidth: isWideScreen ? '360px' : '300px',
              padding: isWideScreen ? '16px 32px' : '16px 24px',
              borderRadius: '14px',
              border: 'none',
              background: loading 
                ? (isWideScreen ? 'rgba(255, 20, 147, 0.5)' : 'rgba(0, 82, 255, 0.5)')
                : (isWideScreen ? '#FF1493' : '#0052FF'),
              color: loading 
                ? (isWideScreen ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.7)')
                : (isWideScreen ? 'white' : 'white'),
              fontSize: isWideScreen ? '16px' : '15px',
              fontWeight: '700',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.25s ease',
              boxShadow: loading 
                ? 'none' 
                : (isWideScreen ? '0 6px 24px rgba(255, 20, 147, 0.4)' : '0 6px 24px rgba(0, 82, 255, 0.4)'),
              touchAction: 'manipulation',
              letterSpacing: '-0.01em',
              lineHeight: '1.4'
            }}
            onMouseOver={(e) => {
              if (!loading) {
                if (isWideScreen) {
                  e.currentTarget.style.background = '#FF10F0';
                  e.currentTarget.style.boxShadow = '0 8px 32px rgba(255, 20, 147, 0.5)';
                } else {
                  e.currentTarget.style.background = '#0039CC';
                  e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 82, 255, 0.5)';
                }
                e.currentTarget.style.transform = 'translateY(-2px)';
              }
            }}
            onMouseOut={(e) => {
              if (!loading) {
                if (isWideScreen) {
                  e.currentTarget.style.background = '#FF1493';
                  e.currentTarget.style.boxShadow = '0 6px 24px rgba(255, 20, 147, 0.4)';
                } else {
                  e.currentTarget.style.background = '#0052FF';
                  e.currentTarget.style.boxShadow = '0 6px 24px rgba(0, 82, 255, 0.4)';
                }
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            {loading 
              ? '⏳ Calculating...' 
              : isBatch && itemCount > 1
                ? `Generate ${itemCount} BASE Hero Videos ⚡️`
                : 'Generate a BASE Hero Video ⚡️'
            }
          </button>
        </div>

        {/* Cost Footer */}
        {!loading && formatCost(costRaw, costUSD) ? (
          <div style={{
            padding: isWideScreen ? '14px 20px' : '14px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.2)',
            background: 'rgba(0, 0, 0, 0.15)',
            color: 'rgba(255, 255, 255, 0.95)',
            fontSize: '12px',
            position: 'relative',
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
            position: 'relative',
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
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-20px);
          }
        }
        /* Hide scrollbar but allow scrolling */
        .base-hero-popup-content::-webkit-scrollbar {
          width: 4px;
        }
        .base-hero-popup-content::-webkit-scrollbar-track {
          background: transparent;
        }
        .base-hero-popup-content::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 2px;
        }
        .base-hero-popup-content::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }
      `}</style>
    </div>,
    document.body
  );
};

BaseHeroConfirmationPopup.propTypes = {
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

export default BaseHeroConfirmationPopup;

