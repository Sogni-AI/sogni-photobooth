import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';

/**
 * Helper function to format video duration in mm:ss format
 */
const formatDuration = (seconds) => {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Workflow configuration for display labels and styling
 * Bright yellow Starface photobooth theme
 */
const WORKFLOW_CONFIG = {
  'infinite-loop': {
    icon: '♾️',
    creatingTitle: 'making ur infinite loop ✨',
    reviewTitle: 'ur transitions are ready!',
    itemLabel: 'Transition',
    creatingSubtitle: 'generating transitions • click to preview when ready',
    reviewSubtitle: 'preview • regenerate • stitch when ur happy',
    accentColor: '#a855f7',
    showFromTo: true // Show "A → B" for transitions
  },
  'batch-transition': {
    icon: '🔀',
    creatingTitle: 'creating ur transitions ✨',
    reviewTitle: 'ur transitions look amazing!',
    itemLabel: 'Transition',
    creatingSubtitle: 'making transition magic • preview when ready',
    reviewSubtitle: 'preview • regenerate • stitch em all together',
    accentColor: '#a855f7',
    showFromTo: false
  },
  's2v': {
    icon: '🎵',
    creatingTitle: 'vibing to ur music ✨',
    reviewTitle: 'ur sound-to-video is ready!',
    itemLabel: 'Segment',
    creatingSubtitle: 'turning sound into video magic',
    reviewSubtitle: 'preview • regenerate • make it perfect',
    accentColor: '#ff3366',
    showFromTo: false
  },
  'animate-move': {
    icon: '🎬',
    creatingTitle: 'adding motion magic ✨',
    reviewTitle: 'ur motion video is ready!',
    itemLabel: 'Segment',
    creatingSubtitle: 'making things move in cool ways',
    reviewSubtitle: 'preview • tweak • make it yours',
    accentColor: '#06b6d4',
    showFromTo: false
  },
  'animate-replace': {
    icon: '🔄',
    creatingTitle: 'swapping subjects ✨',
    reviewTitle: 'ur replacement vid is ready!',
    itemLabel: 'Segment',
    creatingSubtitle: 'doing some subject swap magic',
    reviewSubtitle: 'check it out • regenerate if u want',
    accentColor: '#f59e0b',
    showFromTo: false
  }
};

/**
 * VideoReviewPopup
 * 
 * Unified component for reviewing, previewing, and regenerating video segments/transitions
 * before final stitching. Works for all 5 workflows:
 * - Infinite Loop (transitions between videos)
 * - Batch Transition (image-to-image transitions)
 * - Sound to Video Montage (S2V segments)
 * - Animate Move Montage (motion transfer segments)
 * - Animate Replace Montage (subject replacement segments)
 */
const VideoReviewPopup = ({
  visible,
  onClose,
  onStitchAll,
  onRegenerateItem,
  onCancelGeneration,
  onCancelItem, // Cancel a single item (segment/transition)
  onPlayItem, // Play a finished item in fullscreen
  items = [],
  workflowType = 's2v',
  regeneratingIndex = null,
  regenerationProgress = null,
  // Per-item progress arrays (for initial generation)
  itemETAs = [],
  itemProgress = [],
  itemWorkers = [],
  itemStatuses = [],
  itemElapsed = []
}) => {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [isMuted, setIsMuted] = useState(true); // Start muted for mobile autoplay
  const previewVideoRef = useRef(null);
  
  // Cache last known ETAs to prevent flickering between ETA and "Starting..."
  const lastKnownETAsRef = useRef({});

  // Get workflow config
  const config = WORKFLOW_CONFIG[workflowType] || WORKFLOW_CONFIG['s2v'];

  // Clear cached ETAs when popup closes
  useEffect(() => {
    if (!visible) {
      lastKnownETAsRef.current = {};
    }
  }, [visible]);

  // Reset selection when popup opens
  useEffect(() => {
    if (visible) {
      setSelectedIndex(null);
      setIsPlaying(false);
      setShowCancelConfirmation(false);
      setIsMuted(true); // Reset to muted when opening
    }
  }, [visible]);

  // Auto-play preview when selected
  useEffect(() => {
    if (selectedIndex !== null && previewVideoRef.current) {
      previewVideoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [selectedIndex]);

  const handleItemClick = useCallback((index) => {
    // Don't allow clicking on generating or regenerating items
    if (items[index]?.status === 'regenerating' || items[index]?.status === 'generating') return;
    if (!items[index]?.url) return; // Don't allow clicking if no video URL
    
    // If onPlayItem is provided, use fullscreen playback instead of inline preview
    if (onPlayItem) {
      onPlayItem(index);
    } else {
      setSelectedIndex(index);
    }
  }, [items, onPlayItem]);

  const handleRegenerateClick = useCallback((index, e) => {
    e.stopPropagation();
    if (items[index]?.status === 'regenerating') return;
    onRegenerateItem?.(index);
  }, [items, onRegenerateItem]);

  // Handle per-item cancel (for stuck/slow items)
  const handleCancelItemClick = useCallback((index, e) => {
    e.stopPropagation();
    const item = items[index];
    if (item?.status !== 'generating' && item?.status !== 'regenerating') return;
    onCancelItem?.(index);
  }, [items, onCancelItem]);

  const handleClosePreview = useCallback(() => {
    setSelectedIndex(null);
    setIsPlaying(false);
    if (previewVideoRef.current) {
      previewVideoRef.current.pause();
    }
  }, []);

  // Handle close with confirmation if regenerating or generating
  const handleCloseRequest = useCallback(() => {
    const anyGeneratingNow = items?.some(t => t.status === 'generating') ?? false;
    const anyRegeneratingNow = items?.some(t => t.status === 'regenerating') ?? false;
    
    if (anyGeneratingNow && onCancelGeneration) {
      // During initial generation, use the proper cancellation flow with refund popup
      onCancelGeneration();
    } else if (anyRegeneratingNow) {
      // During regeneration, show simple confirmation
      setShowCancelConfirmation(true);
    } else {
      onClose();
    }
  }, [items, onClose, onCancelGeneration]);

  // Confirm cancel and close
  const handleConfirmCancel = useCallback(() => {
    setShowCancelConfirmation(false);
    onClose();
  }, [onClose]);

  // Computed states
  const allItemsReady = items?.every(t => t.status === 'ready') ?? false;
  const anyRegenerating = items?.some(t => t.status === 'regenerating') ?? false;
  const anyGenerating = items?.some(t => t.status === 'generating') ?? false;
  const anyFailed = items?.some(t => t.status === 'failed') ?? false;
  const isInitialGeneration = anyGenerating && !anyRegenerating;
  const readyCount = items?.filter(t => t.status === 'ready').length || 0;
  const generatingCount = items?.filter(t => t.status === 'generating').length || 0;
  const failedCount = items?.filter(t => t.status === 'failed').length || 0;
  // Allow stitching if all items are done processing (ready or failed) and at least one is ready
  const allItemsDone = items?.every(t => t.status === 'ready' || t.status === 'failed') ?? false;
  const canStitch = allItemsDone && readyCount > 0 && !anyRegenerating && !anyGenerating;

  // Get item label (e.g., "Transition 1" or "Segment 1")
  const getItemLabel = (index) => {
    const item = items[index];
    if (config.showFromTo && item?.fromIndex !== undefined && item?.toIndex !== undefined) {
      return `${config.itemLabel} ${index + 1}: ${item.fromIndex + 1} → ${item.toIndex + 1}`;
    }
    return `${config.itemLabel} ${index + 1}`;
  };

  if (!visible) return null;

  return createPortal(
    <div
      className="video-review-popup"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#FFED4E',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '24px',
        animation: 'videoReviewPopupFadeIn 0.3s ease-out'
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '28px',
          maxWidth: '900px',
          width: '100%',
          maxHeight: '92vh',
          height: selectedIndex !== null ? '92vh' : 'auto',
          overflow: 'hidden',
          boxShadow: '6px 6px 0 #1a1a1a',
          animation: 'videoReviewPopIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
          display: 'flex',
          flexDirection: 'column',
          border: `4px solid #1a1a1a`
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '24px 28px',
          background: '#ffffff',
          borderBottom: `3px solid #FFED4E`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
          gap: '16px'
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{
              margin: 0,
              color: '#1a1a1a',
              fontSize: '1.75rem',
              fontWeight: '700',
              fontFamily: '"Permanent Marker", cursive',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              lineHeight: 1.2,
              letterSpacing: '0.02em'
            }}>
              <span style={{ fontSize: '2rem' }}>{config.icon}</span>
              {isInitialGeneration ? config.creatingTitle : config.reviewTitle}
            </h3>
            <p style={{
              margin: '8px 0 0 0',
              color: '#666',
              fontSize: '0.9rem',
              lineHeight: '1.6',
              fontWeight: '600'
            }}>
              {isInitialGeneration ? config.creatingSubtitle : config.reviewSubtitle}
            </p>
          </div>
          <button
            onClick={handleCloseRequest}
            style={{
              background: '#ffffff',
              border: '3px solid #1a1a1a',
              borderRadius: '50%',
              width: '50px',
              height: '50px',
              minWidth: '50px',
              cursor: 'pointer',
              color: '#1a1a1a',
              fontSize: '1.5rem',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.25s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
              flexShrink: 0,
              boxShadow: '4px 4px 0 #1a1a1a',
              lineHeight: 1
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translate(-2px, -2px) rotate(90deg)';
              e.currentTarget.style.background = '#ff3366';
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.boxShadow = '6px 6px 0 #1a1a1a';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translate(0, 0) rotate(0deg)';
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.color = '#1a1a1a';
              e.currentTarget.style.boxShadow = '4px 4px 0 #1a1a1a';
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'translate(2px, 2px)';
              e.currentTarget.style.boxShadow = '2px 2px 0 #1a1a1a';
            }}
            title={isInitialGeneration ? 'cancel' : 'close'}
          >
            ✕
          </button>
        </div>

        {/* Items Grid / Preview */}
        <div style={{
          flex: 1,
          overflow: selectedIndex !== null ? 'hidden' : 'auto',
          padding: selectedIndex !== null ? '16px 24px' : '24px',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          background: '#fff'
        }}>
          {selectedIndex !== null ? (
            /* Preview Mode */
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              height: '100%',
              minHeight: 0
            }}>
              {/* Header Row */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                flexShrink: 0
              }}>
                <button
                  onClick={handleClosePreview}
                  style={{
                    background: '#ffffff',
                    border: `3px solid #1a1a1a`,
                    borderRadius: '50px',
                    padding: '12px 20px',
                    color: '#1a1a1a',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '800',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    minHeight: '48px',
                    transition: 'all 0.25s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                    boxShadow: '3px 3px 0 #1a1a1a',
                    textTransform: 'lowercase'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = '#FFED4E';
                    e.currentTarget.style.transform = 'translate(-2px, -2px)';
                    e.currentTarget.style.boxShadow = '5px 5px 0 #1a1a1a';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = '#ffffff';
                    e.currentTarget.style.transform = 'translate(0, 0)';
                    e.currentTarget.style.boxShadow = '3px 3px 0 #1a1a1a';
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.transform = 'translate(1px, 1px)';
                    e.currentTarget.style.boxShadow = '2px 2px 0 #1a1a1a';
                  }}
                >
                  ← back
                </button>
                <span style={{
                  color: '#1a1a1a',
                  fontSize: '1rem',
                  fontWeight: '700',
                  fontFamily: '"Permanent Marker", cursive',
                  textAlign: 'center',
                  flex: '1 1 auto',
                  minWidth: '120px'
                }}>
                  {getItemLabel(selectedIndex)}
                </span>
                <button
                  onClick={(e) => handleRegenerateClick(selectedIndex, e)}
                  disabled={items[selectedIndex]?.status === 'regenerating'}
                  style={{
                    background: items[selectedIndex]?.status === 'regenerating'
                      ? '#e5e5e5'
                      : config.accentColor,
                    border: '3px solid #1a1a1a',
                    borderRadius: '50px',
                    padding: '12px 24px',
                    color: '#fff',
                    cursor: items[selectedIndex]?.status === 'regenerating' ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '800',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    opacity: items[selectedIndex]?.status === 'regenerating' ? 0.6 : 1,
                    minHeight: '48px',
                    boxShadow: items[selectedIndex]?.status === 'regenerating' ? 'none' : `3px 3px 0 #1a1a1a`,
                    transition: 'all 0.25s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                    textTransform: 'lowercase'
                  }}
                  onMouseOver={(e) => {
                    if (items[selectedIndex]?.status !== 'regenerating') {
                      e.currentTarget.style.transform = 'translate(-2px, -2px)';
                      e.currentTarget.style.boxShadow = `5px 5px 0 #1a1a1a`;
                    }
                  }}
                  onMouseOut={(e) => {
                    if (items[selectedIndex]?.status !== 'regenerating') {
                      e.currentTarget.style.transform = 'translate(0, 0)';
                      e.currentTarget.style.boxShadow = `3px 3px 0 #1a1a1a`;
                    }
                  }}
                  onMouseDown={(e) => {
                    if (items[selectedIndex]?.status !== 'regenerating') {
                      e.currentTarget.style.transform = 'translate(1px, 1px)';
                      e.currentTarget.style.boxShadow = `2px 2px 0 #1a1a1a`;
                    }
                  }}
                >
                  {items[selectedIndex]?.status === 'regenerating' ? (
                    <>
                      <span style={{
                        width: '14px',
                        height: '14px',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: '#fff',
                        borderRadius: '50%',
                        animation: 'videoReviewSpin 1s linear infinite'
                      }} />
                      Regenerating...
                    </>
                  ) : (
                    <>🔄 Regenerate</>
                  )}
                </button>
              </div>

              {/* Video Preview */}
              <div style={{
                width: '100%',
                flex: '1 1 auto',
                minHeight: 0,
                backgroundColor: '#000',
                borderRadius: '12px',
                overflow: 'hidden',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {items[selectedIndex]?.status === 'regenerating' ? (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(0, 0, 0, 0.85)'
                  }}>
                    {/* Generation status card */}
                    <div style={{
                      background: '#fff',
                      borderRadius: '20px',
                      padding: '28px 36px',
                      boxShadow: `0 8px 32px ${config.accentColor}40`,
                      textAlign: 'center',
                      minWidth: '240px',
                      position: 'relative',
                      border: `3px solid ${config.accentColor}`
                    }}>
                      {/* Header */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px',
                        marginBottom: '16px',
                        position: 'relative'
                      }}>
                        <span style={{
                          fontSize: '28px'
                        }}>🎥</span>
                        <span style={{
                          fontSize: '16px',
                          fontWeight: '700',
                          color: '#1a1a1a',
                          letterSpacing: '0.5px'
                        }}>regenerating...</span>
                      </div>

                      {/* ETA countdown */}
                      <div style={{
                        fontSize: '1.75rem',
                        fontWeight: '700',
                        color: config.accentColor,
                        marginBottom: '12px',
                        fontFamily: '"Permanent Marker", cursive',
                        position: 'relative'
                      }}>
                        {regenerationProgress?.eta !== undefined && regenerationProgress?.eta > 0 ? (
                          <>
                            <span style={{ fontSize: '1.25rem', marginRight: '6px' }}>⏱️</span>
                            {formatDuration(regenerationProgress.eta)}
                          </>
                        ) : regenerationProgress?.status?.startsWith('Queue') || regenerationProgress?.status?.startsWith('In line') ? (
                          <span style={{ fontSize: '1.125rem' }}>in line...</span>
                        ) : (
                          <span style={{ fontSize: '1.125rem' }}>starting...</span>
                        )}
                      </div>

                      {/* Worker info and elapsed time */}
                      <div style={{
                        fontSize: '0.8rem',
                        color: '#666',
                        marginBottom: '6px',
                        position: 'relative',
                        fontWeight: '600'
                      }}>
                        {regenerationProgress?.status === 'Initializing Model' ? (
                          'initializing...'
                        ) : regenerationProgress?.workerName ? (
                          <>
                            <span style={{ color: config.accentColor, fontWeight: '700' }}>{regenerationProgress.workerName}</span>
                            {regenerationProgress?.elapsed !== undefined && (
                              <span> • {formatDuration(regenerationProgress.elapsed)} elapsed</span>
                            )}
                          </>
                        ) : regenerationProgress?.status?.startsWith('Queue') || regenerationProgress?.status?.startsWith('In line') ? (
                          regenerationProgress.status
                        ) : (
                          `${formatDuration(regenerationProgress?.elapsed || 0)} elapsed`
                        )}
                      </div>

                      {/* Progress bar */}
                      {regenerationProgress?.progress > 0 && (
                        <div style={{
                          width: '100%',
                          height: '6px',
                          backgroundColor: 'rgba(255, 237, 78, 0.3)',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          marginTop: '12px',
                          position: 'relative'
                        }}>
                          <div style={{
                            width: `${regenerationProgress.progress}%`,
                            height: '100%',
                            background: `linear-gradient(90deg, ${config.accentColor}, ${config.accentColor}dd)`,
                            borderRadius: '2px',
                            transition: 'width 0.3s ease'
                          }} />
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <video
                      ref={previewVideoRef}
                      src={items[selectedIndex]?.url}
                      style={{ 
                        maxWidth: '100%',
                        maxHeight: '100%',
                        width: 'auto',
                        height: 'auto',
                        objectFit: 'contain'
                      }}
                      controls
                      loop
                      autoPlay
                      muted={isMuted}
                      playsInline
                    />
                    {/* Unmute button for mobile */}
                    {isMuted && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsMuted(false);
                          if (previewVideoRef.current) {
                            previewVideoRef.current.muted = false;
                          }
                        }}
                        style={{
                          position: 'absolute',
                          bottom: '70px',
                          right: '12px',
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background: 'rgba(0, 0, 0, 0.7)',
                          border: '2px solid #fff',
                          color: '#fff',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '16px',
                          zIndex: 10,
                          boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.9)';
                          e.currentTarget.style.color = '#000';
                          e.currentTarget.style.transform = 'scale(1.1)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                          e.currentTarget.style.color = '#fff';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                        title="Unmute"
                      >
                        🔊
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Context info */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                padding: '12px 20px',
                backgroundColor: 'rgba(255, 237, 78, 0.2)',
                borderRadius: '20px',
                fontSize: '0.8rem',
                color: '#666',
                fontWeight: '700',
                flexShrink: 0,
                flexWrap: 'wrap',
                border: `2px solid rgba(26, 26, 26, 0.1)`
              }}>
                {config.showFromTo && items[selectedIndex]?.fromIndex !== undefined ? (
                  <>
                    <span>From: Video {items[selectedIndex]?.fromIndex + 1}</span>
                    <span style={{ color: config.accentColor, fontSize: '14px' }}>→</span>
                    <span>To: Video {items[selectedIndex]?.toIndex + 1}</span>
                  </>
                ) : items[selectedIndex]?.thumbnail ? (
                  <>
                    <span>Source Image:</span>
                    <img
                      src={items[selectedIndex].thumbnail}
                      alt="Source"
                      style={{
                        width: '40px',
                        height: '40px',
                        objectFit: 'cover',
                        borderRadius: '4px'
                      }}
                    />
                  </>
                ) : (
                  <span>{config.itemLabel} {selectedIndex + 1} of {items.length}</span>
                )}
              </div>
            </div>
          ) : (
            /* Grid Mode */
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '16px'
            }}>
              {items?.map((item, index) => {
                const isInProgress = item.status === 'regenerating' || item.status === 'generating';
                const isThisRegenerating = item.status === 'regenerating' && regeneratingIndex === index;
                
                return (
                  <div
                    key={item.photoId || index}
                    onClick={() => handleItemClick(index)}
                    style={{
                      backgroundColor: isInProgress 
                        ? 'rgba(255, 237, 78, 0.2)'
                        : item.status === 'ready'
                        ? '#f0fdf4'
                        : '#fafafa',
                      borderRadius: '24px',
                      cursor: isInProgress ? 'wait' : 'pointer',
                      border: '3px solid',
                      borderColor: isInProgress
                        ? '#FFED4E'
                        : item.status === 'failed'
                        ? '#ff3366'
                        : item.status === 'ready'
                        ? '#22c55e'
                        : 'rgba(26, 26, 26, 0.15)',
                      transition: 'all 0.25s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                      opacity: isInProgress ? 0.9 : 1,
                      display: 'flex',
                      flexDirection: 'column',
                      boxShadow: isInProgress 
                        ? '0 0 0 rgba(0,0,0,0)'
                        : item.status === 'ready'
                        ? '4px 4px 0 #1a1a1a'
                        : '3px 3px 0 rgba(26, 26, 26, 0.2)',
                      overflow: 'hidden'
                    }}
                    onMouseOver={(e) => {
                      if (!isInProgress) {
                        e.currentTarget.style.borderColor = config.accentColor;
                        e.currentTarget.style.transform = 'translate(-3px, -3px)';
                        e.currentTarget.style.boxShadow = `6px 6px 0 #1a1a1a`;
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!isInProgress) {
                        e.currentTarget.style.borderColor = item.status === 'failed' ? '#ff3366' : item.status === 'ready' ? '#22c55e' : 'rgba(26, 26, 26, 0.15)';
                        e.currentTarget.style.transform = 'translate(0, 0)';
                        e.currentTarget.style.boxShadow = item.status === 'ready' 
                          ? '4px 4px 0 #1a1a1a'
                          : '3px 3px 0 rgba(26, 26, 26, 0.2)';
                      }
                    }}
                  >
                    {/* Ready checkmark badge */}
                    {item.status === 'ready' && (
                      <div style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        background: '#22c55e',
                        border: '2px solid #1a1a1a',
                        borderRadius: '50%',
                        width: '36px',
                        height: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        zIndex: 2,
                        boxShadow: '2px 2px 0 #1a1a1a',
                        animation: 'videoReviewPop 0.3s ease-out',
                        color: '#fff',
                        fontWeight: 'bold'
                      }}>
                        ✓
                      </div>
                    )}
                    {/* Failed X badge */}
                    {item.status === 'failed' && (
                      <div style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        background: '#ff3366',
                        border: '2px solid #1a1a1a',
                        borderRadius: '50%',
                        width: '36px',
                        height: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        zIndex: 2,
                        boxShadow: '2px 2px 0 #1a1a1a',
                        animation: 'videoReviewPop 0.3s ease-out',
                        color: '#fff',
                        fontWeight: 'bold'
                      }}>
                        ✕
                      </div>
                    )}
                    {/* Cancel button for generating/regenerating items */}
                    {isInProgress && onCancelItem && (
                      <button
                        onClick={(e) => handleCancelItemClick(index, e)}
                        style={{
                          position: 'absolute',
                          top: '10px',
                          left: '10px',
                          background: '#ff3366',
                          border: '2px solid #1a1a1a',
                          borderRadius: '50%',
                          width: '32px',
                          height: '32px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '14px',
                          zIndex: 3,
                          boxShadow: '2px 2px 0 #1a1a1a',
                          color: '#fff',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.transform = 'scale(1.1)';
                          e.currentTarget.style.background = '#ff1744';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.background = '#ff3366';
                        }}
                        title={`Cancel this ${config.itemLabel.toLowerCase()}`}
                      >
                        ✕
                      </button>
                    )}
                    {/* Video Thumbnail */}
                    <div style={{
                      minHeight: '120px',
                      backgroundColor: '#000',
                      position: 'relative',
                      borderTopLeftRadius: '10px',
                      borderTopRightRadius: '10px',
                      overflow: 'hidden'
                    }}>
                      {isInProgress ? (
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: (item.startThumbnail || item.thumbnail) ? 'transparent' : 'rgba(0, 0, 0, 0.85)',
                          padding: '8px'
                        }}>
                          {/* Show preview thumbnails if available */}
                          {item.startThumbnail && item.endThumbnail ? (
                            <>
                              {/* Dual image preview showing start → end (for infinite loop) */}
                              <div style={{
                                position: 'absolute',
                                inset: 0,
                                display: 'flex'
                              }}>
                                <img 
                                  src={item.startThumbnail}
                                  alt="Start frame"
                                  style={{
                                    width: '50%',
                                    height: '100%',
                                    objectFit: 'contain',
                                    borderRight: `1px solid ${config.accentColor}80`,
                                    backgroundColor: '#000'
                                  }}
                                />
                                <img 
                                  src={item.endThumbnail}
                                  alt="End frame"
                                  style={{
                                    width: '50%',
                                    height: '100%',
                                    objectFit: 'contain',
                                    backgroundColor: '#000'
                                  }}
                                />
                              </div>
                              {/* Arrow indicator */}
                              <div style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                background: `${config.accentColor}e6`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
                                zIndex: 1
                              }}>
                                <span style={{ fontSize: '16px', color: '#fff' }}>→</span>
                              </div>
                            </>
                          ) : item.thumbnail ? (
                            /* Single thumbnail - show it without dimming */
                            <img 
                              src={item.thumbnail}
                              alt="Source"
                              style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain'
                              }}
                            />
                          ) : (
                            /* Fallback: Compact generation card when no thumbnails available */
                            <div style={{
                              background: '#ffffff',
                              border: `3px solid ${config.accentColor}`,
                              borderRadius: '12px',
                              padding: '10px 14px',
                              textAlign: 'center',
                              boxShadow: `3px 3px 0 #1a1a1a`,
                              minWidth: '110px'
                            }}>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                marginBottom: '6px'
                              }}>
                                <span style={{ fontSize: '14px' }}>🎥</span>
                                <span style={{
                                  fontSize: '0.7rem',
                                  fontWeight: '800',
                                  color: '#1a1a1a'
                                }}>{item.status === 'generating' ? 'creating' : 'regenerating'}</span>
                              </div>

                              {/* ETA display */}
                              <div style={{
                                fontSize: '0.875rem',
                                fontWeight: '700',
                                color: config.accentColor,
                                marginBottom: '4px',
                                fontFamily: '"Permanent Marker", cursive'
                              }}>
                                {isThisRegenerating && regenerationProgress?.eta > 0 ? (
                                  <>⏱️ {formatDuration(regenerationProgress.eta)}</>
                                ) : isThisRegenerating && regenerationProgress?.status?.startsWith('Queue') ? (
                                  <span style={{ fontSize: '0.7rem' }}>in line...</span>
                                ) : item.status === 'generating' ? (
                                  <div style={{
                                    width: '24px',
                                    height: '24px',
                                    margin: '0 auto',
                                    border: `3px solid ${config.accentColor}40`,
                                    borderTopColor: config.accentColor,
                                    borderRadius: '50%',
                                    animation: 'videoReviewSpin 1s linear infinite'
                                  }} />
                                ) : (
                                  <span style={{ fontSize: '0.7rem' }}>starting...</span>
                                )}
                              </div>

                              {/* Worker info */}
                              {isThisRegenerating && regenerationProgress?.workerName && (
                                <div style={{
                                  fontSize: '0.65rem',
                                  color: '#666',
                                  fontWeight: '600',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {regenerationProgress.workerName}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : item.url ? (
                        <video
                          src={item.url}
                          style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }}
                          loop
                          muted
                          playsInline
                          autoPlay
                          onMouseOver={(e) => e.target.play().catch(() => {})}
                          onMouseOut={(e) => { e.target.pause(); e.target.currentTime = 0; }}
                        />
                      ) : item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt=""
                          style={{
                            width: '100%',
                            height: 'auto',
                            display: 'block',
                            objectFit: 'contain'
                          }}
                        />
                      ) : null}
                      
                      {/* Play icon overlay */}
                      {!isInProgress && item.url && (
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'rgba(0, 0, 0, 0.3)',
                          opacity: 0,
                          transition: 'opacity 0.2s ease',
                          pointerEvents: 'none'
                        }}
                        className="video-play-overlay"
                        >
                          <span style={{ fontSize: '32px' }}>▶️</span>
                        </div>
                      )}
                    </div>

                    {/* Info Bar */}
                    <div style={{
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}>
                      {/* Title row */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {/* Source thumbnail (small) */}
                          {item.thumbnail && !item.startThumbnail && (
                            <img
                              src={item.thumbnail}
                              alt=""
                              style={{
                                width: '28px',
                                height: '28px',
                                objectFit: 'cover',
                                borderRadius: '4px'
                              }}
                            />
                          )}
                          <div>
                            <div style={{
                              fontSize: '0.8rem',
                              fontWeight: '700',
                              color: '#1a1a1a'
                            }}>
                              {config.itemLabel} {index + 1}
                            </div>
                            {config.showFromTo && item.fromIndex !== undefined && (
                              <div style={{
                                fontSize: '0.7rem',
                                color: '#666',
                                fontWeight: '600'
                              }}>
                                {item.fromIndex + 1} → {item.toIndex + 1}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Status indicators */}
                        {(item.status === 'ready' || item.status === 'failed') && (
                          <button
                            onClick={(e) => handleRegenerateClick(index, e)}
                            style={{
                              background: config.accentColor,
                              border: '2px solid #1a1a1a',
                              borderRadius: '50px',
                              padding: '8px 14px',
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: '800',
                              transition: 'all 0.25s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                              boxShadow: `2px 2px 0 #1a1a1a`,
                              textTransform: 'lowercase'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.transform = 'translate(-1px, -1px)';
                              e.currentTarget.style.boxShadow = `3px 3px 0 #1a1a1a`;
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.transform = 'translate(0, 0)';
                              e.currentTarget.style.boxShadow = `2px 2px 0 #1a1a1a`;
                            }}
                            onMouseDown={(e) => {
                              e.currentTarget.style.transform = 'translate(1px, 1px)';
                              e.currentTarget.style.boxShadow = `1px 1px 0 #1a1a1a`;
                            }}
                            title={`regenerate this ${config.itemLabel.toLowerCase()}`}
                          >
                            🔄 redo
                          </button>
                        )}
                        {item.status === 'generating' && (
                          <span style={{
                            fontSize: '11px',
                            color: config.accentColor,
                            fontWeight: '600'
                          }}>
                            ⏳
                          </span>
                        )}
                        {item.status === 'ready' && (
                          <span style={{
                            fontSize: '14px',
                            color: '#4ade80'
                          }}>
                            ✓
                          </span>
                        )}
                        {item.status === 'failed' && (
                          <span style={{
                            fontSize: '14px',
                            color: '#ff3366'
                          }}>
                            ✕
                          </span>
                        )}
                      </div>

                      {/* Error message for failed items */}
                      {item.status === 'failed' && item.error && (
                        <div style={{
                          fontSize: '0.65rem',
                          color: '#ff3366',
                          padding: '6px 0 0 0',
                          borderTop: '2px solid rgba(255, 51, 102, 0.2)',
                          fontWeight: '600',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={item.error}
                        >
                          ⚠️ {item.error.length > 30 ? item.error.slice(0, 30) + '...' : item.error}
                        </div>
                      )}

                      {/* Generation metadata */}
                      {isInProgress && (
                        <div style={{
                          fontSize: '0.65rem',
                          color: '#666',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '3px',
                          paddingTop: '6px',
                          borderTop: '2px solid rgba(255, 237, 78, 0.3)',
                          fontWeight: '600'
                        }}>
                          {isThisRegenerating && regenerationProgress ? (
                            <>
                              {/* ETA with caching */}
                              {(() => {
                                const eta = regenerationProgress.eta;
                                if (eta > 0) {
                                  lastKnownETAsRef.current[index] = eta;
                                }
                                const displayETA = lastKnownETAsRef.current[index] || eta;
                                
                                return displayETA > 0 ? (
                                  <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.875rem' }}>⏱️</span>
                                    <span style={{ 
                                      fontWeight: '700', 
                                      color: config.accentColor, 
                                      fontFamily: '"Permanent Marker", cursive', 
                                      fontSize: '0.75rem',
                                      // Add blink animation when ETA is at 1 second or less
                                      ...(displayETA <= 1 ? {
                                        animationName: 'blink',
                                        animationDuration: '2s',
                                        animationTimingFunction: 'ease-in-out',
                                        animationIterationCount: 'infinite',
                                        WebkitAnimationName: 'blink',
                                        WebkitAnimationDuration: '2s',
                                        WebkitAnimationTimingFunction: 'ease-in-out',
                                        WebkitAnimationIterationCount: 'infinite'
                                      } : {})
                                    }}>{formatDuration(displayETA)}</span>
                                  </div>
                                ) : regenerationProgress.status?.startsWith('Queue') ? (
                                  <div style={{ color: config.accentColor }}>⏳ queued...</div>
                                ) : null;
                              })()}
                              
                              {/* Worker name */}
                              {regenerationProgress.workerName && (
                                <div style={{ 
                                  display: 'flex', 
                                  gap: '5px', 
                                  alignItems: 'center',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  <span style={{ fontSize: '0.75rem' }}>🖥️</span>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: config.accentColor, fontWeight: '700' }}>{regenerationProgress.workerName}</span>
                                </div>
                              )}
                              
                              {/* Elapsed time */}
                              {regenerationProgress.elapsed > 0 && (
                                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                  <span style={{ fontSize: '0.75rem' }}>⏲️</span>
                                  <span>{formatDuration(regenerationProgress.elapsed)}</span>
                                </div>
                              )}
                              
                              {/* Status message */}
                              {regenerationProgress.status && !regenerationProgress.status.startsWith('Queue') && (
                                <div style={{ 
                                  color: '#999',
                                  fontStyle: 'italic',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {regenerationProgress.status}
                                </div>
                              )}
                            </>
                          ) : item.status === 'generating' ? (
                            /* For initial generation, show from arrays */
                            <>
                              {/* ETA with caching */}
                              {(() => {
                                const eta = itemETAs[index];
                                if (eta > 0) {
                                  lastKnownETAsRef.current[index] = eta;
                                }
                                const displayETA = lastKnownETAsRef.current[index] || eta;
                                
                                return displayETA > 0 ? (
                                  <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.875rem' }}>⏱️</span>
                                    <span style={{ 
                                      fontWeight: '700', 
                                      color: config.accentColor, 
                                      fontFamily: '"Permanent Marker", cursive', 
                                      fontSize: '0.75rem',
                                      // Add blink animation when ETA is at 1 second or less
                                      ...(displayETA <= 1 ? {
                                        animationName: 'blink',
                                        animationDuration: '2s',
                                        animationTimingFunction: 'ease-in-out',
                                        animationIterationCount: 'infinite',
                                        WebkitAnimationName: 'blink',
                                        WebkitAnimationDuration: '2s',
                                        WebkitAnimationTimingFunction: 'ease-in-out',
                                        WebkitAnimationIterationCount: 'infinite'
                                      } : {})
                                    }}>{formatDuration(displayETA)}</span>
                                  </div>
                                ) : itemStatuses[index]?.startsWith('Queue') ? (
                                  <div style={{ color: config.accentColor }}>⏳ queued...</div>
                                ) : (
                                  <div style={{ color: config.accentColor }}>⏳ starting...</div>
                                );
                              })()}
                              
                              {/* Worker name */}
                              {item.status === 'generating' && itemWorkers[index] && (
                                <div style={{ 
                                  display: 'flex', 
                                  gap: '5px', 
                                  alignItems: 'center',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  <span style={{ fontSize: '0.75rem' }}>🖥️</span>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: config.accentColor, fontWeight: '700' }}>{itemWorkers[index]}</span>
                                </div>
                              )}
                              
                              {/* Progress percentage */}
                              {item.status === 'generating' && itemProgress[index] > 0 && (
                                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                  <span style={{ fontSize: '0.75rem' }}>📊</span>
                                  <span>{Math.round(itemProgress[index])}%</span>
                                </div>
                              )}
                              
                              {/* Elapsed time */}
                              {item.status === 'generating' && itemElapsed[index] > 0 && (
                                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                  <span style={{ fontSize: '0.75rem' }}>⏲️</span>
                                  <span>{formatDuration(itemElapsed[index])}</span>
                                </div>
                              )}
                              
                              {/* Status message */}
                              {item.status === 'generating' && itemStatuses[index] && !itemStatuses[index].startsWith('Queue') && (
                                <div style={{ 
                                  color: '#999',
                                  fontStyle: 'italic',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {itemStatuses[index]}
                                </div>
                              )}
                            </>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer with Stitch Button */}
        <div style={{
          padding: '20px 28px',
          background: '#ffffff',
          borderTop: `3px solid #FFED4E`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
          gap: '16px',
          flexWrap: 'wrap'
        }}>
          <div style={{
            fontSize: '0.9rem',
            color: '#666',
            flex: '1 1 auto',
            minWidth: '150px',
            fontWeight: '800'
          }}>
            {anyGenerating ? (
              <span style={{ color: config.accentColor }}>⏳ Creating {generatingCount} {config.itemLabel.toLowerCase()}(s)... ({readyCount}/{items?.length} done)</span>
            ) : anyRegenerating ? (
              <span style={{ color: config.accentColor }}>⏳ Regenerating...</span>
            ) : allItemsReady ? (
              <span style={{ color: '#4ade80' }}>✓ All {items?.length} ready</span>
            ) : allItemsDone && readyCount > 0 ? (
              <span style={{ color: '#4ade80' }}>✓ {readyCount} ready, {failedCount} failed - can stitch</span>
            ) : anyFailed ? (
              <span style={{ color: '#ff3366' }}>⚠️ {failedCount} failed - click 🔄 redo to retry</span>
            ) : (
              <span style={{ color: '#f59e0b' }}>⚠️ Needs attention</span>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: '12px', flexShrink: 0 }}>
            <button
              onClick={handleCloseRequest}
              style={{
                padding: '16px 24px',
                background: '#ffffff',
                border: `3px solid #666`,
                borderRadius: '50px',
                color: '#666',
                fontSize: '0.875rem',
                fontWeight: '800',
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                minHeight: '52px',
                boxShadow: '3px 3px 0 #1a1a1a',
                textTransform: 'lowercase'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#FFED4E';
                e.currentTarget.style.color = '#1a1a1a';
                e.currentTarget.style.borderColor = '#1a1a1a';
                e.currentTarget.style.transform = 'translate(-2px, -2px)';
                e.currentTarget.style.boxShadow = '5px 5px 0 #1a1a1a';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = '#ffffff';
                e.currentTarget.style.color = '#666';
                e.currentTarget.style.borderColor = '#666';
                e.currentTarget.style.transform = 'translate(0, 0)';
                e.currentTarget.style.boxShadow = '3px 3px 0 #1a1a1a';
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = 'translate(1px, 1px)';
                e.currentTarget.style.boxShadow = '2px 2px 0 #1a1a1a';
              }}
            >
              cancel
            </button>
            
            <button
              onClick={onStitchAll}
              disabled={!canStitch}
              style={{
                padding: '16px 36px',
                background: canStitch
                  ? '#ff3366'
                  : '#e5e5e5',
                border: '3px solid #1a1a1a',
                borderRadius: '50px',
                color: '#fff',
                fontSize: '1rem',
                fontWeight: '800',
                fontFamily: '"Permanent Marker", cursive',
                cursor: canStitch ? 'pointer' : 'not-allowed',
                transition: 'all 0.25s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                minHeight: '52px',
                boxShadow: canStitch
                  ? `4px 4px 0 #1a1a1a`
                  : 'none',
                opacity: canStitch ? 1 : 0.6,
                textTransform: 'lowercase',
                letterSpacing: '0.02em'
              }}
              onMouseOver={(e) => {
                if (canStitch) {
                  e.currentTarget.style.transform = 'translate(-2px, -2px)';
                  e.currentTarget.style.boxShadow = `6px 6px 0 #1a1a1a`;
                }
              }}
              onMouseOut={(e) => {
                if (canStitch) {
                  e.currentTarget.style.transform = 'translate(0, 0)';
                  e.currentTarget.style.boxShadow = `4px 4px 0 #1a1a1a`;
                }
              }}
              onMouseDown={(e) => {
                if (canStitch) {
                  e.currentTarget.style.transform = 'translate(2px, 2px)';
                  e.currentTarget.style.boxShadow = `2px 2px 0 #1a1a1a`;
                }
              }}
            >
              🎬 stitch all videos
            </button>
          </div>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelConfirmation && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100001
          }}
          onClick={() => setShowCancelConfirmation(false)}
        >
          <div
            style={{
              backgroundColor: '#1a1a2e',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
              animation: 'videoReviewPopupFadeIn 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '48px' }}>⚠️</span>
            </div>

            <h3 style={{
              margin: '0 0 12px 0',
              color: '#fff',
              fontSize: '20px',
              fontWeight: '700',
              fontFamily: '"Permanent Marker", cursive',
              textAlign: 'center'
            }}>
              Cancel Regeneration?
            </h3>

            <p style={{
              margin: '0 0 16px 0',
              color: 'rgba(255, 255, 255, 0.8)',
              fontSize: '14px',
              textAlign: 'center',
              lineHeight: '1.5'
            }}>
              You have a {config.itemLabel.toLowerCase()} being regenerated.
              Closing now will cancel it.
            </p>

            <div style={{
              backgroundColor: 'rgba(74, 222, 128, 0.1)',
              border: '1px solid rgba(74, 222, 128, 0.3)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '20px' }}>💰</span>
              <span style={{
                color: '#4ade80',
                fontSize: '13px',
                fontWeight: '500'
              }}>
                Credits for in-progress work will be refunded
              </span>
            </div>

            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center'
            }}>
              <button
                onClick={handleConfirmCancel}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.4)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                Yes, Cancel
              </button>
              <button
                onClick={() => setShowCancelConfirmation(false)}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  backgroundColor: 'transparent',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '10px',
                  color: 'rgba(255, 255, 255, 0.9)',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Keep Generating
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes videoReviewPopupFadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes videoReviewPopIn {
          0% {
            opacity: 0;
            transform: scale(0.85) translateY(20px);
          }
          70% {
            transform: scale(1.03) translateY(-5px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes videoReviewSpin {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes videoReviewPulse {
          0%, 100% {
            opacity: 0.6;
          }
          50% {
            opacity: 1;
          }
        }
        @keyframes videoReviewPop {
          0% {
            transform: scale(0);
          }
          50% {
            transform: scale(1.2);
          }
          100% {
            transform: scale(1);
          }
        }
        @keyframes blink {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.2;
          }
        }
        @-webkit-keyframes blink {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.2;
          }
        }
        
        /* Mobile responsive adjustments */
        @media (max-width: 640px) {
          .video-review-popup {
            padding: 16px !important;
          }
        }
      `}</style>
    </div>,
    document.body
  );
};

VideoReviewPopup.propTypes = {
  visible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onStitchAll: PropTypes.func.isRequired,
  onRegenerateItem: PropTypes.func.isRequired,
  onCancelGeneration: PropTypes.func,
  items: PropTypes.arrayOf(PropTypes.shape({
    url: PropTypes.string,
    index: PropTypes.number,
    status: PropTypes.oneOf(['ready', 'regenerating', 'failed', 'generating']),
    thumbnail: PropTypes.string,
    startThumbnail: PropTypes.string,
    endThumbnail: PropTypes.string,
    fromIndex: PropTypes.number,
    toIndex: PropTypes.number,
    photoId: PropTypes.string
  })),
  workflowType: PropTypes.oneOf(['infinite-loop', 'batch-transition', 's2v', 'animate-move', 'animate-replace']),
  regeneratingIndex: PropTypes.number,
  regenerationProgress: PropTypes.shape({
    progress: PropTypes.number,
    eta: PropTypes.number,
    message: PropTypes.string,
    workerName: PropTypes.string,
    status: PropTypes.string,
    elapsed: PropTypes.number
  }),
  itemETAs: PropTypes.arrayOf(PropTypes.number),
  itemProgress: PropTypes.arrayOf(PropTypes.number),
  itemWorkers: PropTypes.arrayOf(PropTypes.string),
  itemStatuses: PropTypes.arrayOf(PropTypes.string),
  itemElapsed: PropTypes.arrayOf(PropTypes.number)
};

export default VideoReviewPopup;
