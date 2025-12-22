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
          borderRadius: isWideScreen ? '20px' : '0',
          padding: isWideScreen ? '40px' : '20px', // More padding around panel edge
          maxWidth: isWideScreen ? '1000px' : '100%',
          width: '100%',
          height: isWideScreen ? 'auto' : '100%',
          maxHeight: isWideScreen ? '95vh' : '100vh', // Increased max height to allow more expansion
          overflow: isWideScreen ? 'auto' : 'hidden', // Allow scrolling on desktop if content exceeds viewport
          display: 'flex',
          flexDirection: 'column',
          justifyContent: isWideScreen ? 'flex-start' : 'center', // Allow content to expand from top on desktop
          boxShadow: isWideScreen ? '0 20px 60px rgba(0, 82, 255, 0.5)' : 'none',
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
            left: isWideScreen ? '16%' : '3%',
            top: isWideScreen ? '0%' : '-10%',
            height: isWideScreen ? '104%' : '132%',
            opacity: 1,
            zIndex: 1,
            pointerEvents: 'none',
            animation: 'float 6s ease-in-out infinite'
          }}
        />
        {/* Close button - overlaps image content */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: isWideScreen ? '15px' : '8px',
            right: isWideScreen ? '15px' : '8px',
            width: isWideScreen ? '32px' : '28px',
            height: isWideScreen ? '32px' : '28px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255, 255, 255, 0.2)',
            color: 'white',
            fontSize: isWideScreen ? '20px' : '18px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            zIndex: 20 // Higher z-index to overlap image
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          ×
        </button>

        {/* Single Column Layout - Text flows around video on mobile, side-by-side on desktop */}
        <div style={{
          display: 'flex',
          flexDirection: isWideScreen ? 'row' : 'column',
          gap: isWideScreen ? '24px' : '0',
          flex: 1,
          minHeight: 0,
          overflow: isWideScreen ? 'visible' : 'hidden', // Allow content to expand on desktop
          alignItems: isWideScreen ? 'center' : 'center', // Center video vertically on desktop, center on mobile
          justifyContent: isWideScreen ? 'flex-start' : 'center' // Center vertically on mobile
        }}>
          {/* Marketing Content - flows around video on mobile */}
          <div 
            className="base-hero-popup-content"
            style={{
              background: 'rgba(0, 0, 0, 0.4)', // Black background at 0.3 opacity
              padding: isWideScreen ? '32px' : '18px', // Padding around content
              flex: isWideScreen ? '1 1 auto' : '0 0 auto', // Allow content to grow on desktop
              display: 'flex',
              flexDirection: 'column',
              overflow: isWideScreen ? 'visible' : 'hidden', // Don't clip content on desktop
              minHeight: isWideScreen ? 'auto' : 0, // Allow natural height on desktop
              minWidth: 0,
              position: 'relative',
              borderRadius: '12px', // Rounded corners for the content area
              gap: isWideScreen ? '16px' : '16px', // Add gap between title and content on desktop
              alignSelf: isWideScreen ? 'stretch' : 'auto', // Stretch to fill available space on desktop
              zIndex: 2 // Ensure content appears above sloth background
            }}
          >
            {/* Popup Title - inside blue content area */}
            <div style={{
              fontSize: isWideScreen ? '28px' : '22px',
              fontWeight: '700',
              color: 'white',
              marginBottom: isWideScreen ? '24px' : '10px',
              lineHeight: '1.3',
              letterSpacing: '-0.01em',
              textAlign: 'center',
              paddingTop: isWideScreen ? '0' : '8px'
            }}>
              🎉 SOGNI + Photobooth in Base App
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              flex: isWideScreen ? 1 : '0 0 auto',
              minHeight: 0,
              gap: isWideScreen ? '0' : '12px',
              justifyContent: isWideScreen ? 'flex-start' : 'center' // Start from top on desktop to avoid collision
            }}>
              {/* Text content with Base image floating on mobile */}
              <div style={{
                display: 'block',
                marginLeft: isWideScreen ? '0' : '0',
                marginRight: isWideScreen ? '0' : '0',
                marginTop: isWideScreen ? '0' : '0',
                position: 'relative'
              }}>
                {/* First paragraph - full width on mobile */}
                <div style={{
                  minWidth: 0,
                  paddingLeft: isWideScreen ? '12px' : '0',
                  paddingRight: isWideScreen ? '0' : '0',
                  paddingTop: isWideScreen ? '0' : '0',
                  marginTop: isWideScreen ? '0' : '0',
                  marginBottom: isWideScreen ? '0' : '12px'
                }}>
                  <p style={{
                    margin: 0,
                    marginBottom: '12px',
                    color: 'rgba(255, 255, 255, 0.95)',
                    fontSize: isWideScreen ? '15px' : '13px',
                    lineHeight: '1.55',
                    textAlign: 'left',
                    wordSpacing: '0.05em'
                  }}>
                    Coinbase's Base App is now live and <a href="https://www.sogni.ai/super-apps" target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'underline', fontWeight: '700' }}>Sogni.ai SuperApps</a> will be available in Base App soon!
                  </p>
                </div>

                {/* Container for image float and remaining paragraphs */}
                <div style={{
                  display: 'block',
                  position: 'relative'
                }}>
                  {/* Base App Preview Image - Mobile only, floats right so text flows around */}
                  {!isWideScreen && (
                    <div style={{
                      float: 'right',
                      marginLeft: '10px',
                      marginBottom: '5px',
                      marginTop: '0',
                      position: 'relative',
                      width: '220px',
                      flexShrink: 0,
                      zIndex: 3
                    }}>
                      <img
                        src="/base-hero-wallet-metadata.png"
                        alt="Base App Preview"
                        style={{
                          width: '220px',
                          height: 'auto',
                          display: 'block',
                          maxHeight: '160px',
                          objectFit: 'contain',
                        }}
                      />
                      {/* Learn More button - tiny overlay on bottom left of image */}
                      <a
                        href="https://blog.base.org/baseapp"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          position: 'absolute',
                          bottom: '4px',
                          left: '4px',
                          display: 'inline-block',
                          padding: '4px 8px',
                          background: 'rgba(0, 0, 0, 0.7)',
                          borderRadius: '4px',
                          color: 'white',
                          fontSize: '9px',
                          fontWeight: '600',
                          textDecoration: 'none',
                          border: '1px solid rgba(255, 255, 255, 0.3)',
                          transition: 'all 0.2s ease',
                          whiteSpace: 'nowrap',
                          lineHeight: '1.2'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.9)';
                          e.currentTarget.style.transform = 'scale(1.05)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                      >
                        Learn More ↗
                      </a>
                    </div>
                  )}
                  
                  {/* Remaining text paragraphs - will flow around the float */}
                  <div style={{
                    minWidth: 0,
                    paddingLeft: isWideScreen ? '12px' : '0',
                    paddingRight: isWideScreen ? '0' : '0',
                    paddingTop: isWideScreen ? '0' : '0',
                    marginTop: isWideScreen ? '0' : '0'
                  }}>
                    <p style={{
                      margin: 0,
                      marginBottom: '12px',
                      color: 'rgba(255, 255, 255, 0.9)',
                      fontSize: isWideScreen ? '14px' : '13px',
                      lineHeight: '1.55',
                      textAlign: 'left',
                      wordSpacing: '0.05em'
                    }}>
                      To celebrate, share your own fun BASE Hero video on X or Base App and tag <a href="https://x.com/Sogni_Protocol" target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'underline', fontWeight: '700' }}>@Sogni_Protocol</a> for a chance at 100,000 SOGNI tokens!
                    </p>
                    <p style={{
                      margin: 0,
                      marginBottom: isWideScreen ? '0' : '12px',
                      color: 'rgba(255, 255, 255, 0.9)',
                      fontSize: isWideScreen ? '14px' : '13px',
                      lineHeight: '1.55',
                      textAlign: 'left',
                      wordSpacing: '0.05em'
                    }}>
                      We'll be selecting <strong style={{ color: 'white' }}>5 winners on Jan 15.</strong> Tag and follow for updates.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Base App Preview Image - Desktop only */}
            {isWideScreen && (
              <div style={{
                marginTop: '24px',
                marginLeft: '0',
                marginRight: '0',
                flexShrink: 0,
                position: 'relative'
              }}>
                <img
                  src="/base-hero-wallet-metadata.png"
                  alt="Base App Preview"
                  style={{
                    width: '66%',
                    height: 'auto',
                    display: 'block',
                    maxHeight: '300px',
                    objectFit: 'contain',
                    borderRadius: '12px'
                  }}
                />
                {/* Learn More button - tiny overlay on bottom left of image (Desktop) */}
                <a
                  href="https://blog.base.org/baseapp"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '8px',
                    display: 'inline-block',
                    padding: '6px 12px',
                    background: 'rgba(0, 0, 0, 0.7)',
                    borderRadius: '4px',
                    color: 'white',
                    fontSize: '11px',
                    fontWeight: '600',
                    textDecoration: 'none',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                    lineHeight: '1.2'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 0, 0, 0.9)';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  Learn More ↗
                </a>
              </div>
            )}

            {/* Video Teaser - Mobile only, below content, smaller size */}
            {!isWideScreen && (
              <div style={{
                width: '200px',
                aspectRatio: '2/3',
                borderRadius: '0',
                overflow: 'hidden',
                background: 'rgba(0, 0, 0, 0.3)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                position: 'relative',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: 'auto',
                marginRight: 'auto',
                zIndex: 4, // Higher z-index so it can overlap image
                clear: 'both' // Clear the float
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
                    borderRadius: '12px',
                    cursor: 'pointer'
                  }}
                />
                {videoError && (
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    color: 'white',
                    fontSize: '10px',
                    textAlign: 'center',
                    padding: '8px',
                    background: 'rgba(255, 0, 0, 0.7)',
                    borderRadius: '6px',
                    zIndex: 10
                  }}>
                    Video Error
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Video Teaser - Desktop only (mobile version is inline above) */}
          {isWideScreen && (
          <div style={{
            flex: '0 0 auto',
            width: '340px', // 10% smaller than before (was 380px)
            aspectRatio: '2/3',
            borderRadius: '0', // No rounded corners
            overflow: 'hidden',
            background: 'rgba(0, 0, 0, 0.3)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            position: 'relative',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: isWideScreen ? 'center' : 'center', // Center vertically on desktop
            zIndex: 3 // Ensure video appears above sloth
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
                objectFit: 'cover', // Fill container completely
                objectPosition: 'center center', // Center the video content
                cursor: 'pointer',
                borderRadius: '12px'
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
                padding: '10px',
                background: 'rgba(255, 0, 0, 0.7)',
                borderRadius: '8px',
                zIndex: 10
              }}>
                {videoError}
              </div>
            )}
          </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: isWideScreen ? '12px' : '8px',
          marginTop: isWideScreen ? '20px' : '12px',
          marginBottom: isWideScreen ? '16px' : '12px', // Padding between button and footer
          flexShrink: 0,
          justifyContent: isWideScreen ? 'flex-end' : 'stretch', // Right align button on desktop
          position: 'relative',
          zIndex: 3 // Ensure buttons appear above sloth
        }}>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              flex: isWideScreen ? '0 0 auto' : 1, // Don't stretch on desktop
              maxWidth: isWideScreen ? '400px' : 'none', // Max width on desktop
              padding: isWideScreen ? '14px' : '12px',
              borderRadius: '12px',
              border: 'none',
              background: loading ? 'rgba(255, 255, 255, 0.3)' : 'white',
              color: loading ? 'rgba(255, 255, 255, 0.7)' : '#0052FF',
              fontSize: isWideScreen ? '15px' : '14px',
              fontWeight: '700',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: loading ? 'none' : '0 4px 15px rgba(255, 255, 255, 0.3)',
              touchAction: 'manipulation'
            }}
            onMouseOver={(e) => {
              if (!loading) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.95)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 255, 255, 0.4)';
              }
            }}
            onMouseOut={(e) => {
              if (!loading) {
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(255, 255, 255, 0.3)';
              }
            }}
          >
            {loading 
              ? '⏳ Calculating...' 
              : isBatch && itemCount > 1
                ? `🟦 Generate ${itemCount} BASE Hero Videos ⚡️`
                : '🟦 Generate a BASE Hero Video ⚡️'
            }
          </button>
        </div>

        {/* Cost Footer - Small footer like other video popups */}
        {!loading && formatCost(costRaw, costUSD) ? (
          <div style={{
            padding: '8px 16px 6px 16px', // Reduced bottom padding
            borderTop: '1px solid rgba(255, 255, 255, 0.15)',
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: '11px',
            textAlign: 'center',
            position: 'relative',
            zIndex: 3 // Ensure footer appears above sloth
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '4px'
            }}>
              <span style={{ fontSize: '10px', fontWeight: '500', opacity: 0.8 }}>
                {`${isBatch ? `📹 ${itemCount} videos • ` : ''}📐 ${videoResolution || '480p'} • ⏱️ 5s (fixed)`}
              </span>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {costRaw && (
                  <span style={{ fontSize: '11px', fontWeight: '700', color: 'white' }}>
                    {(() => {
                      const costValue = typeof costRaw === 'number' ? costRaw : parseFloat(costRaw);
                      if (isNaN(costValue)) return null;
                      const tokenLabel = getTokenLabel(tokenType);
                      return `${costValue.toFixed(2)} ${tokenLabel}`;
                    })()}
                  </span>
                )}
                {costUSD && (
                  <span style={{ fontWeight: '400', opacity: 0.75, fontSize: '10px', color: 'rgba(255, 255, 255, 0.8)' }}>
                    ≈ ${costUSD.toFixed(2)} USD
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : loading ? (
          <div style={{
            padding: '8px 16px 12px 16px',
            fontSize: '11px',
            fontWeight: '700',
            textAlign: 'center',
            borderTop: '1px solid rgba(255, 255, 255, 0.15)',
            color: 'rgba(255, 255, 255, 0.9)',
            position: 'relative',
            zIndex: 3 // Ensure footer appears above sloth
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

