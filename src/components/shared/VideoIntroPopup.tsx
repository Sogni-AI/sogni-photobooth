/**
 * Video Intro Popup
 *
 * Shows on first click of the Video button to introduce the feature
 * with example videos and explanation.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import urls from '../../config/urls';
import {
  VIDEO_INTRO_EXAMPLES,
  markVideoIntroSeen
} from '../../constants/videoSettings';

interface VideoIntroPopupProps {
  /** Whether the popup is visible */
  visible: boolean;
  /** Callback when popup is dismissed */
  onDismiss: () => void;
  /** Callback when user wants to proceed to video generation */
  onProceed: () => void;
}

export const VideoIntroPopup: React.FC<VideoIntroPopupProps> = ({
  visible,
  onDismiss,
  onProceed
}) => {
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  // Track viewport size for responsive layout
  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-advance carousel every 5 seconds
  useEffect(() => {
    if (!visible) return;

    const interval = setInterval(() => {
      setCurrentVideoIndex(prev =>
        (prev + 1) % VIDEO_INTRO_EXAMPLES.length
      );
    }, 5000);

    return () => clearInterval(interval);
  }, [visible]);

  // Handle dismiss and mark as seen
  const handleDismiss = () => {
    markVideoIntroSeen();
    onDismiss();
  };

  // Handle proceed (go to video generation)
  const handleProceed = () => {
    markVideoIntroSeen();
    onProceed();
  };

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleDismiss();
    }
  };

  if (!visible) return null;

  const features = [
    { icon: '⚡', text: 'Fast: ~16 seconds' },
    { icon: '🎨', text: 'AI Motion Magic' },
    { icon: '✨', text: 'No Watermarks' },
    { icon: '💰', text: 'From $0.10 USD' }
  ];

  const content = (
    <div
      className="video-intro-popup-backdrop"
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000000,
        padding: '20px',
        animation: 'fadeIn 0.3s ease-out'
      }}
    >
      <div
        className="video-intro-popup-content"
        style={{
          backgroundColor: '#1a1a2e',
          borderRadius: isDesktop ? '20px' : '16px',
          maxWidth: isDesktop ? '900px' : '100%',
          width: '100%',
          maxHeight: isDesktop ? '90vh' : 'calc(100vh - 60px)',
          overflow: isDesktop ? 'auto' : 'hidden',
          padding: isDesktop ? '24px' : '14px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          animation: 'slideUp 0.3s ease-out',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          margin: isDesktop ? '0' : '0 8px'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Desktop: Side-by-side layout | Mobile: Compact stacked */}
        <div style={{
          display: 'flex',
          flexDirection: isDesktop ? 'row' : 'column',
          gap: isDesktop ? '24px' : '8px'
        }}>
          {/* Video Section - Left on desktop, TOP on mobile */}
          <div style={{
            flex: isDesktop ? '0 0 320px' : 'none',
            order: 0,
            display: 'flex',
            justifyContent: 'center'
          }}>
            {/* Video Carousel - portrait aspect ratio */}
            <div style={{
              position: 'relative',
              borderRadius: '12px',
              overflow: 'hidden',
              aspectRatio: '2 / 3',
              height: isDesktop ? '500px' : '55vh',
              backgroundColor: '#000'
            }}>
              {VIDEO_INTRO_EXAMPLES.map((example, index) => (
                <video
                  key={example.id}
                  ref={el => { videoRefs.current[index] = el; }}
                  src={`${urls.assetUrl}/videos/${example.filename}`}
                  autoPlay
                  loop
                  muted
                  playsInline
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    opacity: index === currentVideoIndex ? 1 : 0,
                    transition: 'opacity 0.5s ease-in-out'
                  }}
                />
              ))}

              {/* Video label */}
              <div style={{
                position: 'absolute',
                bottom: '12px',
                left: '12px',
                right: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{
                  background: 'rgba(0, 0, 0, 0.6)',
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  color: 'white',
                  backdropFilter: 'blur(10px)'
                }}>
                  {VIDEO_INTRO_EXAMPLES[currentVideoIndex].label}
                </span>

                {/* Carousel dots */}
                <div style={{
                  display: 'flex',
                  gap: '6px'
                }}>
                  {VIDEO_INTRO_EXAMPLES.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentVideoIndex(index)}
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        border: 'none',
                        background: index === currentVideoIndex
                          ? '#ff6b6b'
                          : 'rgba(255, 255, 255, 0.3)',
                        cursor: 'pointer',
                        transition: 'background 0.2s ease'
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Content Section - Right on desktop, below video on mobile */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            order: 1
          }}>
            {/* Header */}
            <div style={{
              textAlign: isDesktop ? 'left' : 'center',
              marginBottom: isDesktop ? '20px' : '8px'
            }}>
              <h2 style={{
                fontSize: isDesktop ? '32px' : '20px',
                fontWeight: 'bold',
                background: 'linear-gradient(135deg, #ff6b6b, #ffa502, #ff6b6b)',
                backgroundSize: '200% auto',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                animation: 'shimmer 3s linear infinite',
                margin: '0 0 6px 0'
              }}>
                🎥 Introducing AI Video!
              </h2>
              <p style={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: isDesktop ? '16px' : '12px',
                margin: 0,
                lineHeight: 1.3
              }}>
                Transform your photos into 5-second motion videos with AI.
              </p>
            </div>

            {/* Features list */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: isDesktop ? '12px' : '6px',
              marginBottom: isDesktop ? '24px' : '8px'
            }}>
              {features.map((feature, index) => (
                <div
                  key={index}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: isDesktop ? '10px' : '6px',
                    padding: isDesktop ? '14px' : '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: isDesktop ? '10px' : '5px'
                  }}
                >
                  <span style={{ fontSize: isDesktop ? '22px' : '14px' }}>{feature.icon}</span>
                  <span style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: isDesktop ? '14px' : '10px' }}>
                    {feature.text}
                  </span>
                </div>
              ))}
            </div>

            {/* Pricing info - desktop only */}
            {isDesktop && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2))',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '24px',
                border: '1px solid rgba(102, 126, 234, 0.3)'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '6px'
                }}>
                  <span style={{ fontSize: '18px' }}>💎</span>
                  <span style={{ color: 'white', fontWeight: '600', fontSize: '15px' }}>
                    Affordable Pricing
                  </span>
                </div>
                <div style={{
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: '13px',
                  lineHeight: 1.4
                }}>
                  <div>• High Quality 480p: ~<strong style={{ color: '#4CAF50' }}>10¢</strong> (20 Spark Points)</div>
                  <div>• High Quality 720p: ~<strong style={{ color: '#4CAF50' }}>21¢</strong> (42 Spark Points)</div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{
              display: 'flex',
              gap: isDesktop ? '12px' : '6px',
              flexDirection: 'row'
            }}>
              <button
                onClick={handleDismiss}
                style={{
                  flex: 1,
                  padding: isDesktop ? '14px 24px' : '10px 12px',
                  borderRadius: isDesktop ? '12px' : '8px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'transparent',
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: isDesktop ? '15px' : '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                Maybe Later
              </button>
              <button
                onClick={handleProceed}
                style={{
                  flex: isDesktop ? 1.5 : 1.5,
                  padding: isDesktop ? '14px 24px' : '10px 12px',
                  borderRadius: isDesktop ? '12px' : '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #ff6b6b, #ffa502)',
                  color: 'white',
                  fontSize: isDesktop ? '15px' : '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 15px rgba(255, 107, 107, 0.3)'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 107, 107, 0.4)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 15px rgba(255, 107, 107, 0.3)';
                }}
              >
                🎥 Create Video!
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CSS animations */}
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
        @keyframes shimmer {
          0% { background-position: 0% center; }
          100% { background-position: 200% center; }
        }
      `}</style>
    </div>
  );

  // Render in portal to escape any stacking context
  return createPortal(content, document.body);
};

export default VideoIntroPopup;
