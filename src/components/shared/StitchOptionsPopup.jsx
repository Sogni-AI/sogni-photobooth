import React, { useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { getTokenLabel } from '../../services/walletService';

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
  onEditTransitionPrompt, // NEW: callback to edit transition prompt
  onCancel, // NEW: callback to cancel generation
  videoCount = 0,
  isGenerating = false,
  generationProgress = null, // { phase, current, total, message, transitionStatus }
  hasCachedVideo = false,
  costLoading = false,
  costRaw = null,
  costUSD = null,
  videoResolution = '480p',
  videoDuration = 5,
  tokenType = 'spark'
}) => {
  // Keep track of last known ETAs to avoid flickering back to spinner
  const lastKnownETAsRef = useRef({});
  
  // Reset cached ETAs when starting a new generation
  if (!isGenerating && Object.keys(lastKnownETAsRef.current).length > 0) {
    lastKnownETAsRef.current = {};
  }

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

  // Calculate weighted progress percentage (accounts for partial progress of each transition)
  // This mirrors the robust approach from PhotoGallery's video progress tracking
  const weightedProgressPercent = useMemo(() => {
    if (!generationProgress || !generationProgress.total || generationProgress.total <= 0) {
      return 0;
    }

    const { transitionStatus, transitionProgress, current, total, phase } = generationProgress;

    // For non-generating phases, use simple current/total
    if (phase !== 'generating' || !transitionStatus || !transitionProgress) {
      return (current / total) * 100;
    }

    // Calculate weighted progress:
    // - Each complete transition contributes 100%
    // - Each generating transition contributes its actual progress (0-100%)
    // - Each pending/failed transition contributes 0%
    let totalProgress = 0;
    transitionStatus.forEach((status, i) => {
      if (status === 'complete') {
        totalProgress += 100;
      } else if (status === 'generating') {
        totalProgress += (transitionProgress[i] || 0);
      }
      // 'pending' and 'failed' contribute 0
    });

    // Average across all transitions
    const weightedAverage = total > 0 ? totalProgress / total : 0;
    return Math.min(100, Math.max(0, weightedAverage));
  }, [generationProgress]);


  if (!visible) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: isGenerating ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999, // Below toast (100000) so toasts are visible during generation
        padding: '20px',
        backdropFilter: isGenerating ? 'blur(4px)' : 'blur(8px)',
        transition: 'background-color 0.3s ease, backdrop-filter 0.3s ease'
      }}
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
          <button
            onClick={isGenerating ? onCancel : onClose}
            style={{
              background: isGenerating ? 'rgba(255, 100, 100, 0.7)' : 'rgba(0, 0, 0, 0.6)',
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
              flexShrink: 0,
              transition: 'background 0.2s ease'
            }}
            title={isGenerating ? 'Cancel generation' : 'Close'}
          >
            ×
          </button>
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
                fontSize: '18px',
                fontWeight: '700',
                marginBottom: '8px',
                fontFamily: '"Permanent Marker", cursive'
              }}>
                {generationProgress.phase === 'extracting' && '🎬 Preparing Video Frames...'}
                {generationProgress.phase === 'generating' && '♾️ Creating Infinite Loop'}
                {generationProgress.phase === 'stitching' && '🎞️ Stitching Final Video...'}
                {generationProgress.phase === 'complete' && '✅ Your Infinite Loop is Ready!'}
              </div>

              <div style={{
                fontSize: '14px',
                color: 'rgba(255, 255, 255, 0.8)',
                marginBottom: '12px'
              }}>
                {generationProgress.message}
              </div>

              {/* Transition Generation Grid - VideoReviewPopup style */}
              {generationProgress.phase === 'generating' && generationProgress.transitionStatus && (
                <div style={{
                  marginBottom: '16px'
                }}>
                  {/* Header with count */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                    padding: '0 4px'
                  }}>
                    <span style={{
                      fontSize: '12px',
                      color: 'rgba(255, 255, 255, 0.7)'
                    }}>
                      Creating {videoCount} seamless transitions...
                    </span>
                    <span style={{
                      fontSize: '12px',
                      color: '#4ade80',
                      fontWeight: '600'
                    }}>
                      {generationProgress.transitionStatus.filter(s => s === 'complete').length}/{generationProgress.total} complete
                    </span>
                  </div>

                  {/* Transition cards grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                    gap: '10px'
                  }}>
                    {generationProgress.transitionStatus.map((status, i) => {
                      const eta = generationProgress.transitionETAs?.[i];
                      const hasETA = eta != null && eta > 0;

                      // Cache ETA while generating
                      let displayETA = null;
                      if (status === 'generating') {
                        if (hasETA) {
                          lastKnownETAsRef.current[i] = eta;
                          displayETA = eta;
                        } else {
                          displayETA = lastKnownETAsRef.current[i];
                        }
                      } else if (status === 'complete' || status === 'failed') {
                        if (lastKnownETAsRef.current[i] !== undefined) {
                          delete lastKnownETAsRef.current[i];
                        }
                      }

                      // Format duration
                      const formatTime = (seconds) => {
                        if (!seconds || seconds <= 0) return '0:00';
                        const mins = Math.floor(seconds / 60);
                        const secs = Math.floor(seconds % 60);
                        return `${mins}:${secs.toString().padStart(2, '0')}`;
                      };

                      return (
                        <div
                          key={i}
                          style={{
                            backgroundColor: status === 'complete'
                              ? 'rgba(74, 222, 128, 0.15)'
                              : status === 'generating'
                              ? 'rgba(147, 51, 234, 0.15)'
                              : status === 'failed'
                              ? 'rgba(239, 68, 68, 0.15)'
                              : 'rgba(255, 255, 255, 0.05)',
                            borderRadius: '10px',
                            padding: '10px',
                            border: '1px solid',
                            borderColor: status === 'complete'
                              ? 'rgba(74, 222, 128, 0.4)'
                              : status === 'generating'
                              ? 'rgba(147, 51, 234, 0.5)'
                              : status === 'failed'
                              ? 'rgba(239, 68, 68, 0.4)'
                              : 'rgba(255, 255, 255, 0.1)',
                            transition: 'all 0.3s ease',
                            boxShadow: status === 'generating'
                              ? '0 0 15px rgba(147, 51, 234, 0.3)'
                              : 'none'
                          }}
                        >
                          {/* Header row */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '6px'
                          }}>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: '600',
                              color: status === 'complete'
                                ? '#4ade80'
                                : status === 'generating'
                                ? '#9333ea'
                                : status === 'failed'
                                ? '#ef4444'
                                : 'rgba(255, 255, 255, 0.5)'
                            }}>
                              Transition {i + 1}
                            </span>
                            {status === 'complete' && (
                              <span style={{ fontSize: '14px' }}>✓</span>
                            )}
                            {status === 'failed' && (
                              <span style={{ fontSize: '14px' }}>✕</span>
                            )}
                          </div>

                          {/* Status content */}
                          <div style={{
                            textAlign: 'center',
                            minHeight: '36px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            {status === 'generating' ? (
                              <>
                                {/* ETA countdown */}
                                <div style={{
                                  fontSize: '18px',
                                  fontWeight: '700',
                                  color: '#fff',
                                  marginBottom: '2px'
                                }}>
                                  {displayETA != null && displayETA > 0 ? (
                                    <>⏱️ {formatTime(displayETA)}</>
                                  ) : (
                                    <div style={{
                                      width: '20px',
                                      height: '20px',
                                      border: '2px solid rgba(147, 51, 234, 0.3)',
                                      borderTopColor: '#9333ea',
                                      borderRadius: '50%',
                                      animation: 'spin 1s linear infinite',
                                      margin: '0 auto'
                                    }} />
                                  )}
                                </div>
                                {/* Status text */}
                                <span style={{
                                  fontSize: '9px',
                                  color: 'rgba(255, 255, 255, 0.6)'
                                }}>
                                  Generating...
                                </span>
                              </>
                            ) : status === 'complete' ? (
                              <span style={{
                                fontSize: '12px',
                                color: '#4ade80',
                                fontWeight: '500'
                              }}>
                                Complete
                              </span>
                            ) : status === 'failed' ? (
                              <span style={{
                                fontSize: '12px',
                                color: '#ef4444',
                                fontWeight: '500'
                              }}>
                                Failed
                              </span>
                            ) : (
                              <span style={{
                                fontSize: '12px',
                                color: 'rgba(255, 255, 255, 0.4)'
                              }}>
                                Queued
                              </span>
                            )}
                          </div>

                          {/* Video flow indicator */}
                          <div style={{
                            marginTop: '6px',
                            fontSize: '9px',
                            color: 'rgba(255, 255, 255, 0.5)',
                            textAlign: 'center'
                          }}>
                            {i + 1} → {i === videoCount - 1 ? 1 : i + 2}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Progress bar - uses weighted progress for smooth, accurate tracking */}
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
                    width: `${weightedProgressPercent}%`,
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
                {generationProgress.current}/{generationProgress.total} ({Math.round(weightedProgressPercent)}%)
              </div>

              {/* Cancel button */}
              {onCancel && generationProgress.phase !== 'complete' && (
                <button
                  onClick={onCancel}
                  style={{
                    marginTop: '16px',
                    padding: '10px 24px',
                    backgroundColor: 'transparent',
                    border: '2px solid rgba(255, 255, 255, 0.4)',
                    borderRadius: '8px',
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 100, 100, 0.3)';
                    e.currentTarget.style.borderColor = 'rgba(255, 100, 100, 0.6)';
                    e.currentTarget.style.color = '#fff';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
                  }}
                >
                  Cancel Generation
                </button>
              )}
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
                        Generate AI transitions between videos for seamless looping. Duration matches your original videos.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Info and Generate Button */}
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: 'rgba(147, 51, 234, 0.05)'
                }}>
                  {/* Estimated time info */}
                  <div style={{
                    padding: '8px 10px',
                    backgroundColor: 'rgba(0, 0, 0, 0.05)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: 'rgba(0, 0, 0, 0.65)',
                    marginBottom: '12px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>📊 {videoCount} transition{videoCount !== 1 ? 's' : ''} to generate</span>
                      {estimatedTime && (
                        <span>⏱️ ~{estimatedTime} min{estimatedTime !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>

                  {/* Generate Button */}
                  <div style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'stretch'
                  }}>
                    <button
                      onClick={() => onInfiniteLoop()}
                      style={{
                        flex: 1,
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
                    
                    {/* Edit Transition Prompt Button */}
                    {onEditTransitionPrompt && (
                      <button
                        onClick={() => onEditTransitionPrompt()}
                        style={{
                          padding: '14px 16px',
                          background: 'rgba(147, 51, 234, 0.15)',
                          border: '2px solid rgba(147, 51, 234, 0.4)',
                          borderRadius: '10px',
                          color: '#7c3aed',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: '700',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                          transition: 'all 0.2s ease',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = 'rgba(147, 51, 234, 0.25)';
                          e.currentTarget.style.borderColor = 'rgba(147, 51, 234, 0.6)';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = 'rgba(147, 51, 234, 0.15)';
                          e.currentTarget.style.borderColor = 'rgba(147, 51, 234, 0.4)';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                        title="Edit transition prompt"
                      >
                        ✏️ Edit
                      </button>
                    )}
                  </div>
                </div>

                {/* Cost Footer for Infinite Loop */}
                {!costLoading && costRaw && costUSD ? (
                  <div style={{
                    marginTop: '16px',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.05)',
                    border: '1px solid rgba(0, 0, 0, 0.1)'
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '4px'
                    }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: 'rgba(0, 0, 0, 0.7)' }}>
                        📹 {videoCount} transitions • 📐 {videoResolution} • ⏱️ {videoDuration}s
                      </span>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#000' }}>
                          {(() => {
                            const costValue = typeof costRaw === 'number' ? costRaw : parseFloat(costRaw);
                            if (isNaN(costValue)) return null;
                            const tokenLabel = getTokenLabel(tokenType);
                            return `${costValue.toFixed(2)} ${tokenLabel}`;
                          })()}
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: '400', color: 'rgba(0, 0, 0, 0.6)' }}>
                          ≈ ${costUSD.toFixed(2)} USD
                        </span>
                      </div>
                    </div>
                    <div style={{
                      fontSize: '10px',
                      color: 'rgba(0, 0, 0, 0.6)',
                      fontStyle: 'italic',
                      marginTop: '4px'
                    }}>
                      Cost is for generating AI transitions between videos
                    </div>
                  </div>
                ) : costLoading ? (
                  <div style={{
                    marginTop: '16px',
                    padding: '12px 16px',
                    fontSize: '12px',
                    fontWeight: '600',
                    textAlign: 'center',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.05)',
                    color: 'rgba(0, 0, 0, 0.7)'
                  }}>
                    Calculating cost...
                  </div>
                ) : null}
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
  onEditTransitionPrompt: PropTypes.func, // Optional callback to edit transition prompt
  onCancel: PropTypes.func, // Optional callback to cancel generation
  videoCount: PropTypes.number,
  isGenerating: PropTypes.bool,
  generationProgress: PropTypes.shape({
    phase: PropTypes.string,
    current: PropTypes.number,
    total: PropTypes.number,
    message: PropTypes.string,
    transitionStatus: PropTypes.arrayOf(PropTypes.string),
    transitionETAs: PropTypes.arrayOf(PropTypes.number),
    transitionProgress: PropTypes.arrayOf(PropTypes.number), // Per-transition progress (0-100)
    maxETA: PropTypes.number
  }),
  hasCachedVideo: PropTypes.bool,
  costLoading: PropTypes.bool,
  costRaw: PropTypes.number,
  costUSD: PropTypes.number,
  videoResolution: PropTypes.string,
  videoDuration: PropTypes.number,
  tokenType: PropTypes.oneOf(['spark', 'sogni'])
};

export default StitchOptionsPopup;

