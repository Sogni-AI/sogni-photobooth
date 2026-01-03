import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';

/**
 * StitchOptionsPopup
 * Allows user to choose between Simple Stitch and Infinite Loop stitch options
 */
const StitchOptionsPopup = ({
  visible,
  onClose,
  onSimpleStitch,
  onInfiniteLoop,
  onDownloadCached,
  videoCount = 0,
  isGenerating = false,
  generationProgress = null, // { phase, current, total, message, transitionStatus }
  hasCachedVideo = false
}) => {
  const [selectedDuration, setSelectedDuration] = useState(3);

  // Reset duration when popup opens
  useEffect(() => {
    if (visible) {
      setSelectedDuration(3);
    }
  }, [visible]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !isGenerating) {
      onClose();
    }
  };

  // Calculate estimated time for infinite loop
  const estimatedTime = useMemo(() => {
    if (videoCount < 2) return null;
    // Each transition takes ~15-30 seconds depending on quality
    // Plus concatenation time
    const transitionCount = videoCount; // N transitions (including loop back)
    const avgGenerationTime = 20; // seconds per transition (rough estimate)
    const totalSeconds = transitionCount * avgGenerationTime + 10; // +10 for stitching
    const minutes = Math.ceil(totalSeconds / 60);
    return minutes;
  }, [videoCount]);

  const durationOptions = [
    { value: 3, label: '3 seconds', description: 'Quick transitions' },
    { value: 5, label: '5 seconds', description: 'Balanced' },
    { value: 7, label: '7 seconds', description: 'Smooth & cinematic' }
  ];

  if (!visible) return null;

  return createPortal(
    <div
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
        backdropFilter: 'blur(8px)'
      }}
      onClick={handleBackdropClick}
    >
      <div
        style={{
          backgroundColor: '#ffeb3b',
          borderRadius: '16px',
          maxWidth: '480px',
          width: '100%',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
          animation: 'popupFadeIn 0.25s ease-out',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}>
          <div>
            <h3 style={{
              margin: 0,
              color: '#000',
              fontSize: '20px',
              fontWeight: '700',
              fontFamily: '"Permanent Marker", cursive',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              🎞️ Stitch Options
            </h3>
            <p style={{
              margin: '4px 0 0 0',
              color: 'rgba(0, 0, 0, 0.6)',
              fontSize: '13px',
              fontWeight: '400'
            }}>
              Choose how to combine your {videoCount} video{videoCount !== 1 ? 's' : ''}
            </p>
          </div>
          {!isGenerating && (
            <button
              onClick={onClose}
              style={{
                background: 'rgba(0, 0, 0, 0.6)',
                border: 'none',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                cursor: 'pointer',
                color: '#fff',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* Content */}
        <div style={{ padding: '16px 20px' }}>
          {/* Generation Progress Overlay */}
          {isGenerating && generationProgress && (
            <div style={{
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '16px',
              color: '#fff',
              textAlign: 'center'
            }}>
              {/* Animated spinner */}
              <div style={{
                width: '48px',
                height: '48px',
                margin: '0 auto 16px',
                border: '4px solid rgba(255, 235, 59, 0.3)',
                borderTopColor: '#ffeb3b',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />

              <div style={{
                fontSize: '16px',
                fontWeight: '600',
                marginBottom: '8px',
                fontFamily: '"Permanent Marker", cursive'
              }}>
                {generationProgress.phase === 'extracting' && '🎬 Extracting Frames...'}
                {generationProgress.phase === 'generating' && '♾️ Generating Transitions...'}
                {generationProgress.phase === 'stitching' && '🎞️ Stitching Videos...'}
                {generationProgress.phase === 'complete' && '✅ Complete!'}
              </div>

              <div style={{
                fontSize: '14px',
                color: 'rgba(255, 255, 255, 0.8)',
                marginBottom: '12px'
              }}>
                {generationProgress.message}
              </div>

              {/* Individual transition status indicators */}
              {generationProgress.phase === 'generating' && generationProgress.transitionStatus && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '8px',
                  marginBottom: '16px',
                  flexWrap: 'wrap'
                }}>
                  {generationProgress.transitionStatus.map((status, i) => (
                    <div
                      key={i}
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: '600',
                        background: status === 'complete'
                          ? 'linear-gradient(135deg, #4CAF50, #45a049)'
                          : status === 'generating'
                          ? 'linear-gradient(135deg, #9333ea, #7c3aed)'
                          : status === 'failed'
                          ? 'linear-gradient(135deg, #f44336, #d32f2f)'
                          : 'rgba(255, 255, 255, 0.15)',
                        color: '#fff',
                        transition: 'all 0.3s ease',
                        boxShadow: status === 'generating'
                          ? '0 0 12px rgba(147, 51, 234, 0.6)'
                          : 'none'
                      }}
                      title={`Transition ${i + 1}: ${status}`}
                    >
                      {status === 'complete' && '✓'}
                      {status === 'generating' && (
                        <div style={{
                          width: '16px',
                          height: '16px',
                          border: '2px solid rgba(255, 255, 255, 0.3)',
                          borderTopColor: '#fff',
                          borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite'
                        }} />
                      )}
                      {status === 'failed' && '✕'}
                      {status === 'pending' && (i + 1)}
                    </div>
                  ))}
                </div>
              )}

              {/* Progress bar */}
              {generationProgress.total > 0 && (
                <div style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  height: '8px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    background: 'linear-gradient(90deg, #ffeb3b, #ffc107)',
                    height: '100%',
                    width: `${(generationProgress.current / generationProgress.total) * 100}%`,
                    transition: 'width 0.3s ease',
                    borderRadius: '8px'
                  }} />
                </div>
              )}

              <div style={{
                fontSize: '12px',
                color: 'rgba(255, 255, 255, 0.6)',
                marginTop: '8px'
              }}>
                {generationProgress.current}/{generationProgress.total}
              </div>
            </div>
          )}

          {/* Options */}
          {!isGenerating && (
            <>
              {/* Previously Generated Option (when cached) */}
              {hasCachedVideo && (
                <button
                  onClick={onDownloadCached}
                  style={{
                    width: '100%',
                    padding: '16px',
                    backgroundColor: 'rgba(76, 175, 80, 0.15)',
                    border: '2px solid rgba(76, 175, 80, 0.4)',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    marginBottom: '12px',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(76, 175, 80, 0.7)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.2)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(76, 175, 80, 0.4)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <span style={{ fontSize: '28px' }}>✅</span>
                    <div>
                      <div style={{
                        fontSize: '16px',
                        fontWeight: '700',
                        color: '#2e7d32',
                        fontFamily: '"Permanent Marker", cursive',
                        marginBottom: '4px'
                      }}>
                        Use Previously Generated
                      </div>
                      <div style={{
                        fontSize: '13px',
                        color: 'rgba(0, 0, 0, 0.6)'
                      }}>
                        Your infinite loop video is ready! View or download it.
                      </div>
                    </div>
                  </div>
                </button>
              )}

              {/* Simple Stitch Option */}
              <button
                onClick={onSimpleStitch}
                style={{
                  width: '100%',
                  padding: '16px',
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  border: '2px solid rgba(0, 0, 0, 0.1)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  marginBottom: '12px',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.3)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.1)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <span style={{ fontSize: '28px' }}>🎬</span>
                  <div>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: '700',
                      color: '#000',
                      fontFamily: '"Permanent Marker", cursive',
                      marginBottom: '4px'
                    }}>
                      Simple Stitch
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: 'rgba(0, 0, 0, 0.6)'
                    }}>
                      Concatenate videos end-to-end. Fast, no AI processing.
                    </div>
                  </div>
                </div>
              </button>

              {/* Infinite Loop Option */}
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                border: '2px solid rgba(147, 51, 234, 0.3)',
                borderRadius: '12px',
                overflow: 'hidden'
              }}>
                <div style={{
                  padding: '16px',
                  borderBottom: '1px solid rgba(0, 0, 0, 0.08)'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <span style={{ fontSize: '28px' }}>♾️</span>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '4px'
                      }}>
                        <span style={{
                          fontSize: '16px',
                          fontWeight: '700',
                          color: '#000',
                          fontFamily: '"Permanent Marker", cursive'
                        }}>
                          Infinite Loop
                        </span>
                        <span style={{
                          fontSize: '9px',
                          backgroundColor: '#9333ea',
                          color: '#fff',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: '700',
                          textTransform: 'uppercase'
                        }}>
                          NEW
                        </span>
                      </div>
                      <div style={{
                        fontSize: '13px',
                        color: 'rgba(0, 0, 0, 0.6)'
                      }}>
                        Generate AI transitions between videos for seamless looping.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Duration Selector */}
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: 'rgba(147, 51, 234, 0.05)'
                }}>
                  <label style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: 'rgba(0, 0, 0, 0.7)',
                    marginBottom: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    ⏱️ Transition Duration
                  </label>
                  <select
                    value={selectedDuration}
                    onChange={(e) => setSelectedDuration(parseInt(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#fff',
                      border: '1px solid rgba(0, 0, 0, 0.15)',
                      borderRadius: '8px',
                      color: '#000',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      appearance: 'none',
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23000' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 12px center',
                      paddingRight: '36px'
                    }}
                  >
                    {durationOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} — {opt.description}
                      </option>
                    ))}
                  </select>

                  {/* Estimated time info */}
                  <div style={{
                    marginTop: '10px',
                    padding: '8px 10px',
                    backgroundColor: 'rgba(0, 0, 0, 0.05)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: 'rgba(0, 0, 0, 0.65)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>📊 {videoCount} transition{videoCount !== 1 ? 's' : ''} to generate</span>
                      {estimatedTime && (
                        <span>⏱️ ~{estimatedTime} min{estimatedTime !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>

                  {/* Generate Button */}
                  <button
                    onClick={() => onInfiniteLoop(selectedDuration)}
                    style={{
                      width: '100%',
                      marginTop: '12px',
                      padding: '14px 20px',
                      background: 'linear-gradient(135deg, #9333ea 0%, #7c3aed 100%)',
                      border: 'none',
                      borderRadius: '10px',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '15px',
                      fontWeight: '600',
                      fontFamily: '"Permanent Marker", cursive',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 4px 12px rgba(147, 51, 234, 0.3)'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 6px 20px rgba(147, 51, 234, 0.4)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(147, 51, 234, 0.3)';
                    }}
                  >
                    ♾️ Generate Infinite Loop
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes popupFadeIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>,
    document.body
  );
};

StitchOptionsPopup.propTypes = {
  visible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSimpleStitch: PropTypes.func.isRequired,
  onInfiniteLoop: PropTypes.func.isRequired,
  onDownloadCached: PropTypes.func,
  videoCount: PropTypes.number,
  isGenerating: PropTypes.bool,
  generationProgress: PropTypes.shape({
    phase: PropTypes.string,
    current: PropTypes.number,
    total: PropTypes.number,
    message: PropTypes.string,
    transitionStatus: PropTypes.arrayOf(PropTypes.string)
  }),
  hasCachedVideo: PropTypes.bool
};

export default StitchOptionsPopup;

