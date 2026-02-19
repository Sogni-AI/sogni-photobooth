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
 * Helper function to clean up error messages by removing long URLs and debug info
 */
const cleanErrorMessage = (error) => {
  if (!error) return '';
  
  // Remove long URLs (anything starting with http/https and containing query params)
  let cleaned = error.replace(/https?:\/\/[^\s)]+\?[^\s)]+/g, '[URL]');
  
  // If the error starts with a known prefix, extract just the meaningful part
  if (cleaned.startsWith('Error downloading video')) {
    // Extract just "Error downloading video X" without the URL
    const match = cleaned.match(/Error downloading video (\d+)/);
    if (match) {
      return `Error downloading video ${match[1]}: Failed to fetch`;
    }
  }
  
  // Truncate to reasonable length
  if (cleaned.length > 80) {
    cleaned = cleaned.substring(0, 80) + '...';
  }
  
  return cleaned;
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
  // Per-item prompt data for prompt editor
  itemPrompts = [], // Array of { positivePrompt, negativePrompt } per item
  // Legacy single-segment props (for backward compatibility with transitions)
  regeneratingIndex = null,
  regenerationProgress = null,
  // New multi-segment props (for segments that support multiple simultaneous regenerations)
  regeneratingIndices = null, // Set of segment indices being regenerated
  regenerationProgresses = null, // Map of segment index -> progress object
  // Per-item progress arrays (for initial generation)
  itemETAs = [],
  itemProgress = [],
  itemWorkers = [],
  itemStatuses = [],
  itemElapsed = [],
  // Version navigation props (for cycling through successful generations)
  itemVersionHistories = null, // Map<segmentIndex, string[]> - array of successful video URLs per segment
  selectedVersions = null, // Map<segmentIndex, number> - currently selected version index per segment
  onVersionChange = null // (segmentIndex, newVersionIndex) => void - callback to change selected version
}) => {
  // Helper to get regeneration progress for a specific index
  // Supports both legacy single-segment and new multi-segment props
  const getRegenerationProgress = (index) => {
    // First try new multi-segment props
    if (regenerationProgresses instanceof Map && regenerationProgresses.has(index)) {
      return regenerationProgresses.get(index);
    }
    // Fall back to legacy single-segment prop
    if (regeneratingIndex === index && regenerationProgress) {
      return regenerationProgress;
    }
    return null;
  };

  // Helper to check if a segment is being regenerated
  const isRegeneratingIndex = (index) => {
    // First try new multi-segment props
    if (regeneratingIndices instanceof Set && regeneratingIndices.has(index)) {
      return true;
    }
    // Fall back to legacy single-segment prop
    return regeneratingIndex === index;
  };

  // Helper to get version history for a segment
  const getVersionHistory = (index) => {
    if (itemVersionHistories instanceof Map) {
      return itemVersionHistories.get(index) || [];
    }
    return [];
  };

  // Helper to get currently selected version index for a segment
  const getSelectedVersionIndex = (index) => {
    if (selectedVersions instanceof Map) {
      const selected = selectedVersions.get(index);
      if (selected !== undefined) return selected;
    }
    // Default to latest version
    const history = getVersionHistory(index);
    return history.length > 0 ? history.length - 1 : 0;
  };

  // Helper to check if a segment has multiple versions to navigate
  const hasMultipleVersions = (index) => {
    const history = getVersionHistory(index);
    return history.length > 1;
  };

  // Helper to check if we can go to previous version
  const canGoPrevVersion = (index) => {
    const selectedIdx = getSelectedVersionIndex(index);
    return selectedIdx > 0;
  };

  // Helper to check if we can go to next version
  const canGoNextVersion = (index) => {
    const history = getVersionHistory(index);
    const selectedIdx = getSelectedVersionIndex(index);
    return selectedIdx < history.length - 1;
  };

  // Handle going to previous version
  const handlePrevVersion = useCallback((index, e) => {
    e.stopPropagation();
    const selectedIdx = getSelectedVersionIndex(index);
    if (selectedIdx > 0 && onVersionChange) {
      onVersionChange(index, selectedIdx - 1);
    }
  }, [onVersionChange, selectedVersions, itemVersionHistories]);

  // Handle going to next version
  const handleNextVersion = useCallback((index, e) => {
    e.stopPropagation();
    const history = getVersionHistory(index);
    const selectedIdx = getSelectedVersionIndex(index);
    if (selectedIdx < history.length - 1 && onVersionChange) {
      onVersionChange(index, selectedIdx + 1);
    }
  }, [onVersionChange, selectedVersions, itemVersionHistories]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [showStitchWarning, setShowStitchWarning] = useState(false);
  const [showRedoConfirmation, setShowRedoConfirmation] = useState(false);
  const [redoConfirmationIndex, setRedoConfirmationIndex] = useState(null);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [promptEditorIndex, setPromptEditorIndex] = useState(null);
  const [editPositivePrompt, setEditPositivePrompt] = useState('');
  const [editNegativePrompt, setEditNegativePrompt] = useState('');
  const [isMuted, setIsMuted] = useState(true); // Start muted for mobile autoplay
  const previewVideoRef = useRef(null);

  // Content orientation detection - portrait vs landscape
  const [contentOrientation, setContentOrientation] = useState('landscape'); // 'portrait' | 'landscape'
  const [isMobile, setIsMobile] = useState(false);

  // Cache last known ETAs to prevent flickering between ETA and "Starting..."
  const lastKnownETAsRef = useRef({});
  
  // Track currently playing audio video (only one can play audio at a time)
  const [playingAudioIndex, setPlayingAudioIndex] = useState(null);
  const videoRefs = useRef({});

  // Get workflow config
  const config = WORKFLOW_CONFIG[workflowType] || WORKFLOW_CONFIG['s2v'];

  // Clear cached ETAs and playing audio when popup closes
  useEffect(() => {
    if (!visible) {
      lastKnownETAsRef.current = {};
      setPlayingAudioIndex(null);
      videoRefs.current = {};
    }
  }, [visible]);
  
  // Workflows that have audio and should pause on mouse leave
  const workflowHasAudio = workflowType === 's2v';

  // Handle hover to unmute video (only one can play audio at a time)
  // Only applies to workflows with audio (S2V)
  const handleVideoMouseEnter = useCallback((index) => {
    if (!videoRefs.current[index]) return;

    // For workflows without audio, don't change mute state
    if (!workflowHasAudio) return;

    // Mute the previously playing video
    if (playingAudioIndex !== null && videoRefs.current[playingAudioIndex]) {
      videoRefs.current[playingAudioIndex].muted = true;
    }

    // Unmute and play the hovered video
    videoRefs.current[index].muted = false;
    videoRefs.current[index].play().catch(() => {});
    setPlayingAudioIndex(index);
  }, [playingAudioIndex, workflowHasAudio]);

  // Handle hover leave to mute video
  // For workflows without audio (batch-transition, infinite-loop), keep videos playing
  const handleVideoMouseLeave = useCallback((index) => {
    if (!videoRefs.current[index]) return;

    // For workflows without audio, keep videos playing (don't pause/reset)
    if (!workflowHasAudio) return;

    videoRefs.current[index].muted = true;
    videoRefs.current[index].pause();
    videoRefs.current[index].currentTime = 0;

    if (playingAudioIndex === index) {
      setPlayingAudioIndex(null);
    }
  }, [playingAudioIndex, workflowHasAudio]);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Detect content orientation from first available thumbnail or video
  useEffect(() => {
    if (!visible || !items?.length) return;

    const detectOrientation = async () => {
      // Find first item with thumbnail or video URL
      const firstItem = items.find(item => item.thumbnail || item.url);
      if (!firstItem) return;

      const src = firstItem.thumbnail || firstItem.url;
      if (!src) return;

      // If it's a video URL, create a video element to get dimensions
      if (firstItem.url && !firstItem.thumbnail) {
        const video = document.createElement('video');
        video.muted = true;
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
          const isPortrait = video.videoHeight > video.videoWidth;
          setContentOrientation(isPortrait ? 'portrait' : 'landscape');
        };
        video.src = src;
      } else {
        // It's an image thumbnail
        const img = new Image();
        img.onload = () => {
          const isPortrait = img.naturalHeight > img.naturalWidth;
          setContentOrientation(isPortrait ? 'portrait' : 'landscape');
        };
        img.src = src;
      }
    };

    detectOrientation();
  }, [visible, items]);

  // Reset selection when popup opens
  useEffect(() => {
    if (visible) {
      setSelectedIndex(null);
      setIsPlaying(false);
      setShowCancelConfirmation(false);
      setShowStitchWarning(false);
      setShowRedoConfirmation(false);
      setRedoConfirmationIndex(null);
      setShowPromptEditor(false);
      setPromptEditorIndex(null);
      setIsMuted(true); // Reset to muted when opening
      setContentOrientation('landscape'); // Reset orientation detection
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
    // Don't allow clicking on generating items (no video yet)
    if (items[index]?.status === 'generating') return;
    // For regenerating items, allow if they have a URL (previous version available)
    if (items[index]?.status === 'regenerating' && !items[index]?.url) return;
    if (!items[index]?.url) return; // Don't allow clicking if no video URL

    // If onPlayItem is provided, use fullscreen playback instead of inline preview
    if (onPlayItem) {
      onPlayItem(index);
    } else {
      setSelectedIndex(index);
    }
  }, [items, onPlayItem]);

  // Open the prompt editor pre-filled with the item's current prompts
  const openPromptEditor = useCallback((index) => {
    const prompts = itemPrompts[index] || {};
    setEditPositivePrompt(prompts.positivePrompt || '');
    setEditNegativePrompt(prompts.negativePrompt || '');
    setPromptEditorIndex(index);
    setShowPromptEditor(true);
  }, [itemPrompts]);

  const handleRegenerateClick = useCallback((index, e) => {
    e.stopPropagation();
    const item = items[index];
    // If item is currently generating/regenerating, show confirmation first
    if (item?.status === 'regenerating' || item?.status === 'generating') {
      setRedoConfirmationIndex(index);
      setShowRedoConfirmation(true);
      return;
    }
    // Otherwise, open prompt editor before regenerating
    openPromptEditor(index);
  }, [items, openPromptEditor]);

  // Confirm redo (cancel current generation and open prompt editor)
  const handleConfirmRedo = useCallback(() => {
    if (redoConfirmationIndex !== null) {
      // First cancel the current item
      onCancelItem?.(redoConfirmationIndex);
      // Then open the prompt editor after a short delay for cancellation
      const indexToEdit = redoConfirmationIndex;
      setTimeout(() => {
        openPromptEditor(indexToEdit);
      }, 500);
    }
    setShowRedoConfirmation(false);
    setRedoConfirmationIndex(null);
  }, [redoConfirmationIndex, onCancelItem, openPromptEditor]);

  // Handle prompt editor confirm - regenerate with edited prompts
  const handlePromptEditorConfirm = useCallback(() => {
    if (promptEditorIndex !== null) {
      onRegenerateItem?.(promptEditorIndex, {
        positivePrompt: editPositivePrompt,
        negativePrompt: editNegativePrompt
      });
    }
    setShowPromptEditor(false);
    setPromptEditorIndex(null);
  }, [promptEditorIndex, editPositivePrompt, editNegativePrompt, onRegenerateItem]);

  // Handle prompt editor close - dismiss without regenerating
  const handlePromptEditorClose = useCallback(() => {
    setShowPromptEditor(false);
    setPromptEditorIndex(null);
  }, []);

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

  // Computed states - MUST be declared before callbacks that use them
  const allItemsReady = items?.every(t => t.status === 'ready') ?? false;
  const anyRegenerating = items?.some(t => t.status === 'regenerating') ?? false;
  const anyGenerating = items?.some(t => t.status === 'generating') ?? false;
  const anyFailed = items?.some(t => t.status === 'failed') ?? false;
  const isInitialGeneration = anyGenerating && !anyRegenerating;
  const readyCount = items?.filter(t => t.status === 'ready').length || 0;
  const generatingCount = items?.filter(t => t.status === 'generating').length || 0;
  const regeneratingCount = items?.filter(t => t.status === 'regenerating').length || 0;
  const inProgressCount = generatingCount + regeneratingCount;
  const failedCount = items?.filter(t => t.status === 'failed').length || 0;
  // Allow stitching if all items are done processing (ready or failed) and at least one is ready
  const allItemsDone = items?.every(t => t.status === 'ready' || t.status === 'failed') ?? false;
  // New logic: can stitch if we have 2+ ready segments, regardless of whether others are still processing
  const canStitch = readyCount >= 2;
  // Check if user is trying to stitch while items are still in progress
  const hasItemsInProgress = anyGenerating || anyRegenerating;

  // Handle stitch button click - check if items are in progress
  const handleStitchClick = useCallback(() => {
    if (hasItemsInProgress) {
      // Show warning if items are still generating/regenerating
      setShowStitchWarning(true);
    } else {
      // All items are done, proceed with stitching
      onStitchAll();
    }
  }, [hasItemsInProgress, onStitchAll]);

  // Confirm stitch despite items in progress
  const handleConfirmStitch = useCallback(() => {
    setShowStitchWarning(false);
    onStitchAll();
  }, [onStitchAll]);

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
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  flex: '1 1 auto',
                  minWidth: '120px'
                }}>
                  <span style={{
                    color: '#1a1a1a',
                    fontSize: '1rem',
                    fontWeight: '700',
                    fontFamily: '"Permanent Marker", cursive',
                    textAlign: 'center'
                  }}>
                    {getItemLabel(selectedIndex)}
                  </span>
                  {/* Version Navigation in Preview Mode */}
                  {hasMultipleVersions(selectedIndex) && onVersionChange && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <button
                        onClick={(e) => handlePrevVersion(selectedIndex, e)}
                        disabled={!canGoPrevVersion(selectedIndex)}
                        style={{
                          background: canGoPrevVersion(selectedIndex) ? config.accentColor : '#d4d4d4',
                          border: '2px solid #1a1a1a',
                          borderRadius: '50%',
                          width: '28px',
                          height: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: canGoPrevVersion(selectedIndex) ? 'pointer' : 'not-allowed',
                          fontSize: '0.75rem',
                          fontWeight: '800',
                          color: canGoPrevVersion(selectedIndex) ? '#fff' : '#737373',
                          transition: 'all 0.2s ease',
                          boxShadow: canGoPrevVersion(selectedIndex) ? '2px 2px 0 #1a1a1a' : 'none'
                        }}
                        title="View previous version"
                      >
                        ←
                      </button>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        color: '#666',
                        minWidth: '50px',
                        textAlign: 'center'
                      }}>
                        v{getSelectedVersionIndex(selectedIndex) + 1}/{getVersionHistory(selectedIndex).length}
                      </span>
                      <button
                        onClick={(e) => handleNextVersion(selectedIndex, e)}
                        disabled={!canGoNextVersion(selectedIndex)}
                        style={{
                          background: canGoNextVersion(selectedIndex) ? config.accentColor : '#d4d4d4',
                          border: '2px solid #1a1a1a',
                          borderRadius: '50%',
                          width: '28px',
                          height: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: canGoNextVersion(selectedIndex) ? 'pointer' : 'not-allowed',
                          fontSize: '0.75rem',
                          fontWeight: '800',
                          color: canGoNextVersion(selectedIndex) ? '#fff' : '#737373',
                          transition: 'all 0.2s ease',
                          boxShadow: canGoNextVersion(selectedIndex) ? '2px 2px 0 #1a1a1a' : 'none'
                        }}
                        title="View next version"
                      >
                        →
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => handleRegenerateClick(selectedIndex, e)}
                  style={{
                    background: (items[selectedIndex]?.status === 'regenerating' || items[selectedIndex]?.status === 'generating')
                      ? '#f59e0b'
                      : config.accentColor,
                    border: '3px solid #1a1a1a',
                    borderRadius: '50px',
                    padding: '12px 24px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '800',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    minHeight: '48px',
                    boxShadow: `3px 3px 0 #1a1a1a`,
                    transition: 'all 0.25s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                    textTransform: 'lowercase'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'translate(-2px, -2px)';
                    e.currentTarget.style.boxShadow = `5px 5px 0 #1a1a1a`;
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'translate(0, 0)';
                    e.currentTarget.style.boxShadow = `3px 3px 0 #1a1a1a`;
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.transform = 'translate(1px, 1px)';
                    e.currentTarget.style.boxShadow = `2px 2px 0 #1a1a1a`;
                  }}
                  title={
                    (items[selectedIndex]?.status === 'regenerating' || items[selectedIndex]?.status === 'generating')
                      ? 'cancel and retry'
                      : 'regenerate'
                  }
                >
                  {(items[selectedIndex]?.status === 'regenerating' || items[selectedIndex]?.status === 'generating') ? (
                    <>🔄 Cancel & Retry</>
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
                {items[selectedIndex]?.status === 'regenerating' ? (() => {
                  // Get progress for the selected segment
                  const selectedProgress = getRegenerationProgress(selectedIndex);
                  return (
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
                                        {selectedProgress?.eta !== undefined && selectedProgress?.eta > 0 ? (
                                          <>
                                            <span style={{ fontSize: '1.25rem', marginRight: '6px' }}>⏱️</span>
                                            {formatDuration(selectedProgress.eta)}
                                          </>
                                        ) : selectedProgress?.status?.startsWith('Queue') || selectedProgress?.status?.startsWith('In line') ? (
                                          <span style={{ fontSize: '1.125rem' }}>in line...</span>
                                        ) : (
                                          <>
                                            <div style={{
                                              width: '32px',
                                              height: '32px',
                                              margin: '0 auto 8px',
                                              border: `3px solid ${config.accentColor}40`,
                                              borderTopColor: config.accentColor,
                                              borderRadius: '50%',
                                              animation: 'videoReviewSpin 1s linear infinite'
                                            }} />
                                            <span style={{ fontSize: '1.125rem' }}>starting...</span>
                                          </>
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
                                        {selectedProgress?.status === 'Initializing Model' ? (
                                          'initializing...'
                                        ) : selectedProgress?.workerName ? (
                                          <>
                                            <span style={{ color: config.accentColor, fontWeight: '700' }}>{selectedProgress.workerName}</span>
                                            {selectedProgress?.elapsed !== undefined && (
                                              <span> • {formatDuration(selectedProgress.elapsed)} elapsed</span>
                                            )}
                                          </>
                                        ) : selectedProgress?.status?.startsWith('Queue') || selectedProgress?.status?.startsWith('In line') ? (
                                          selectedProgress.status
                                        ) : selectedProgress?.elapsed > 0 ? (
                                          `${formatDuration(selectedProgress.elapsed)} elapsed`
                                        ) : (
                                          'preparing regeneration...'
                                        )}
                                      </div>

                                      {/* Progress bar */}
                                      {selectedProgress?.progress > 0 && (
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
                                            width: `${selectedProgress.progress}%`,
                                            height: '100%',
                                            background: `linear-gradient(90deg, ${config.accentColor}, ${config.accentColor}dd)`,
                                            borderRadius: '2px',
                                            transition: 'width 0.3s ease'
                                          }} />
                                        </div>
                                      )}
                    </div>
                  </div>
                  );
                })() : (
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
            /* Grid Mode - Adaptive layout based on content orientation */
            <div style={{
              display: 'grid',
              // Portrait: fewer columns with taller cards, Landscape: more columns with shorter cards
              gridTemplateColumns: contentOrientation === 'portrait'
                ? (isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))')
                : 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: contentOrientation === 'portrait' ? '20px' : '16px'
            }}>
              {items?.map((item, index) => {
                const isInProgress = item.status === 'regenerating' || item.status === 'generating';
                const isThisRegenerating = item.status === 'regenerating' && isRegeneratingIndex(index);
                const thisRegenerationProgress = getRegenerationProgress(index);

                // Portrait cards use horizontal layout (thumbnail beside info)
                const isPortraitLayout = contentOrientation === 'portrait';

                return (
                  <div
                    key={item.photoId || index}
                    onClick={() => handleItemClick(index)}
                    style={{
                      position: 'relative',
                      backgroundColor: isInProgress
                        ? 'rgba(255, 237, 78, 0.2)'
                        : item.status === 'ready'
                        ? '#f0fdf4'
                        : '#fafafa',
                      borderRadius: '24px',
                      // Allow clicking on regenerating items if they have a previous version URL
                      cursor: (isInProgress && !item.url) ? 'wait' : 'pointer',
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
                      // Portrait: horizontal layout, Landscape: vertical layout
                      flexDirection: isPortraitLayout ? 'row' : 'column',
                      boxShadow: isInProgress
                        ? '0 0 0 rgba(0,0,0,0)'
                        : item.status === 'ready'
                        ? '4px 4px 0 #1a1a1a'
                        : '3px 3px 0 rgba(26, 26, 26, 0.2)',
                      overflow: 'hidden',
                      // Portrait cards need minimum height for the side-by-side layout
                      ...(isPortraitLayout ? { minHeight: '180px' } : {})
                    }}
                    onMouseOver={(e) => {
                      // Allow hover effects if not in progress, OR if regenerating with a URL (previous version)
                      if (!isInProgress || (isInProgress && item.url)) {
                        e.currentTarget.style.borderColor = config.accentColor;
                        e.currentTarget.style.transform = 'translate(-3px, -3px)';
                        e.currentTarget.style.boxShadow = `6px 6px 0 #1a1a1a`;
                      }
                    }}
                    onMouseOut={(e) => {
                      // Allow hover effects if not in progress, OR if regenerating with a URL (previous version)
                      if (!isInProgress || (isInProgress && item.url)) {
                        e.currentTarget.style.borderColor = item.status === 'failed' ? '#ff3366' : item.status === 'ready' ? '#22c55e' : isInProgress ? '#FFED4E' : 'rgba(26, 26, 26, 0.15)';
                        e.currentTarget.style.transform = 'translate(0, 0)';
                        e.currentTarget.style.boxShadow = item.status === 'ready'
                          ? '4px 4px 0 #1a1a1a'
                          : isInProgress ? '0 0 0 rgba(0,0,0,0)' : '3px 3px 0 rgba(26, 26, 26, 0.2)';
                      }
                    }}
                  >
                    {/* Ready checkmark badge - Position adapts to layout */}
                    {item.status === 'ready' && (
                      <div style={{
                        position: 'absolute',
                        top: '10px',
                        // Portrait: position on thumbnail area, Landscape: top right of card
                        right: isPortraitLayout ? 'auto' : '10px',
                        left: isPortraitLayout ? '10px' : 'auto',
                        background: '#22c55e',
                        border: '2px solid #1a1a1a',
                        borderRadius: '50%',
                        width: isPortraitLayout ? '28px' : '36px',
                        height: isPortraitLayout ? '28px' : '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: isPortraitLayout ? '14px' : '18px',
                        zIndex: 2,
                        boxShadow: '2px 2px 0 #1a1a1a',
                        animation: 'videoReviewPop 0.3s ease-out',
                        color: '#fff',
                        fontWeight: 'bold'
                      }}>
                        ✓
                      </div>
                    )}
                    {/* Failed X badge - Position adapts to layout */}
                    {item.status === 'failed' && (
                      <div style={{
                        position: 'absolute',
                        top: '10px',
                        right: isPortraitLayout ? 'auto' : '10px',
                        left: isPortraitLayout ? '10px' : 'auto',
                        background: '#ff3366',
                        border: '2px solid #1a1a1a',
                        borderRadius: '50%',
                        width: isPortraitLayout ? '28px' : '36px',
                        height: isPortraitLayout ? '28px' : '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: isPortraitLayout ? '14px' : '18px',
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
                          top: isPortraitLayout ? 'auto' : '10px',
                          bottom: isPortraitLayout ? '10px' : 'auto',
                          left: '10px',
                          background: '#ff3366',
                          border: '2px solid #1a1a1a',
                          borderRadius: '50%',
                          width: isPortraitLayout ? '28px' : '32px',
                          height: isPortraitLayout ? '28px' : '32px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: isPortraitLayout ? '12px' : '14px',
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
                    {/* Video Thumbnail - Adaptive sizing for portrait/landscape */}
                    <div style={{
                      // Portrait: fixed width with full height, Landscape: full width with fixed height
                      ...(isPortraitLayout ? {
                        width: '140px',
                        minWidth: '140px',
                        height: '100%',
                        minHeight: '180px'
                      } : {
                        minHeight: '120px',
                        width: '100%'
                      }),
                      backgroundColor: '#000',
                      position: 'relative',
                      borderTopLeftRadius: isPortraitLayout ? '21px' : '21px',
                      borderTopRightRadius: isPortraitLayout ? '0' : '21px',
                      borderBottomLeftRadius: isPortraitLayout ? '21px' : '0',
                      overflow: 'hidden',
                      flexShrink: 0
                    }}>
                      {/* Show video with regeneration overlay if regenerating but has previous versions */}
                      {isInProgress && item.url && hasMultipleVersions(index) ? (
                        <>
                          {/* Show previous version video */}
                          <video
                            ref={(el) => { videoRefs.current[index] = el; }}
                            src={item.url}
                            style={{
                              width: '100%',
                              height: isPortraitLayout ? '100%' : 'auto',
                              display: 'block',
                              objectFit: isPortraitLayout ? 'cover' : 'contain',
                              objectPosition: isPortraitLayout ? 'top center' : 'center'
                            }}
                            loop
                            muted
                            playsInline
                            autoPlay
                            onMouseEnter={() => handleVideoMouseEnter(index)}
                            onMouseLeave={() => handleVideoMouseLeave(index)}
                          />
                          {/* Regeneration overlay indicator */}
                          <div style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            background: 'rgba(245, 158, 11, 0.9)',
                            border: '2px solid #1a1a1a',
                            borderRadius: '50px',
                            padding: '4px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.65rem',
                            fontWeight: '700',
                            color: '#fff',
                            boxShadow: '2px 2px 0 rgba(0,0,0,0.3)'
                          }}>
                            <div style={{
                              width: '10px',
                              height: '10px',
                              border: '2px solid rgba(255,255,255,0.3)',
                              borderTopColor: '#fff',
                              borderRadius: '50%',
                              animation: 'videoReviewSpin 1s linear infinite'
                            }} />
                            <span>generating...</span>
                          </div>
                        </>
                      ) : isInProgress ? (
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
                                objectFit: isPortraitLayout ? 'cover' : 'contain',
                                objectPosition: isPortraitLayout ? 'top center' : 'center'
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

                                              {/* ETA display - always show something for regenerating items */}
                                              <div style={{
                                                fontSize: '0.875rem',
                                                fontWeight: '700',
                                                color: config.accentColor,
                                                marginBottom: '4px',
                                                fontFamily: '"Permanent Marker", cursive'
                                              }}>
                                                {isThisRegenerating && thisRegenerationProgress?.eta > 0 ? (
                                                  <>⏱️ {formatDuration(thisRegenerationProgress.eta)}</>
                                                ) : isThisRegenerating && thisRegenerationProgress?.status?.startsWith('Queue') ? (
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
                                                  /* Regenerating but no progress data yet - show spinner */
                                                  <div style={{
                                                    width: '24px',
                                                    height: '24px',
                                                    margin: '0 auto',
                                                    border: `3px solid ${config.accentColor}40`,
                                                    borderTopColor: config.accentColor,
                                                    borderRadius: '50%',
                                                    animation: 'videoReviewSpin 1s linear infinite'
                                                  }} />
                                                )}
                                              </div>

                                              {/* Worker info or starting message */}
                                              {isThisRegenerating && thisRegenerationProgress?.workerName ? (
                                                <div style={{
                                                  fontSize: '0.65rem',
                                                  color: '#666',
                                                  fontWeight: '600',
                                                  overflow: 'hidden',
                                                  textOverflow: 'ellipsis',
                                                  whiteSpace: 'nowrap'
                                                }}>
                                                  {thisRegenerationProgress.workerName}
                                                </div>
                                              ) : isThisRegenerating && !thisRegenerationProgress?.eta && (
                                                <div style={{
                                                  fontSize: '0.65rem',
                                                  color: '#666',
                                                  fontWeight: '600'
                                                }}>
                                                  starting...
                                                </div>
                                              )}
                                            </div>
                                          )}
                        </div>
                      ) : item.url ? (
                        <video
                          ref={(el) => { videoRefs.current[index] = el; }}
                          src={item.url}
                          style={{
                            // Portrait: fill the container, Landscape: auto height
                            width: '100%',
                            height: isPortraitLayout ? '100%' : 'auto',
                            display: 'block',
                            objectFit: isPortraitLayout ? 'cover' : 'contain',
                            // For portrait, position at top to show face/subject
                            objectPosition: isPortraitLayout ? 'top center' : 'center'
                          }}
                          loop
                          muted
                          playsInline
                          autoPlay
                          onMouseEnter={() => handleVideoMouseEnter(index)}
                          onMouseLeave={() => handleVideoMouseLeave(index)}
                        />
                      ) : item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt=""
                          style={{
                            width: '100%',
                            height: isPortraitLayout ? '100%' : 'auto',
                            display: 'block',
                            objectFit: isPortraitLayout ? 'cover' : 'contain',
                            objectPosition: isPortraitLayout ? 'top center' : 'center'
                          }}
                        />
                      ) : null}
                      
                      {/* Play icon overlay - Smaller for portrait cards */}
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
                          <span style={{ fontSize: isPortraitLayout ? '24px' : '32px' }}>▶️</span>
                        </div>
                      )}
                    </div>

                    {/* Info Bar - Adaptive layout for portrait/landscape */}
                    <div style={{
                      padding: isPortraitLayout ? '14px 16px' : '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: isPortraitLayout ? '6px' : '4px',
                      // Portrait: take remaining space beside thumbnail, top-aligned
                      ...(isPortraitLayout ? {
                        flex: 1,
                        justifyContent: 'flex-start',
                        minWidth: 0,
                        paddingTop: '12px'
                      } : {})
                    }}>
                      {/* Title row - Adaptive for portrait/landscape */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: isPortraitLayout ? 'flex-start' : 'center',
                        flexDirection: isPortraitLayout ? 'column' : 'row',
                        gap: isPortraitLayout ? '10px' : '0'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {/* Source thumbnail (small) - Hide in portrait as we already have large thumbnail */}
                          {!isPortraitLayout && item.thumbnail && !item.startThumbnail && (
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
                              fontSize: isPortraitLayout ? '1rem' : '0.8rem',
                              fontWeight: '700',
                              color: '#1a1a1a',
                              fontFamily: isPortraitLayout ? '"Permanent Marker", cursive' : 'inherit'
                            }}>
                              {config.itemLabel} {index + 1}
                            </div>
                            {config.showFromTo && item.fromIndex !== undefined && (
                              <div style={{
                                fontSize: isPortraitLayout ? '0.8rem' : '0.7rem',
                                color: '#666',
                                fontWeight: '600'
                              }}>
                                {item.fromIndex + 1} → {item.toIndex + 1}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Status indicators - Always show redo button */}
                        <button
                          onClick={(e) => handleRegenerateClick(index, e)}
                          style={{
                            background: (item.status === 'regenerating' || item.status === 'generating')
                              ? '#f59e0b'
                              : config.accentColor,
                            border: '2px solid #1a1a1a',
                            borderRadius: '50px',
                            padding: '8px 14px',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: '800',
                            transition: 'all 0.25s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                            boxShadow: `2px 2px 0 #1a1a1a`,
                            textTransform: 'lowercase',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4em'
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
                          title={
                            (item.status === 'regenerating' || item.status === 'generating')
                              ? `cancel and retry this ${config.itemLabel.toLowerCase()}`
                              : `regenerate this ${config.itemLabel.toLowerCase()}`
                          }
                        >
                          <span>🔄</span> redo
                        </button>
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

                      {/* Version Navigation - Show when segment has multiple successful generations */}
                      {hasMultipleVersions(index) && onVersionChange && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          padding: '6px 0',
                          borderTop: '2px solid rgba(168, 85, 247, 0.2)',
                          marginTop: '6px'
                        }}>
                          <button
                            onClick={(e) => handlePrevVersion(index, e)}
                            disabled={!canGoPrevVersion(index)}
                            style={{
                              background: canGoPrevVersion(index) ? config.accentColor : '#d4d4d4',
                              border: '2px solid #1a1a1a',
                              borderRadius: '50%',
                              width: '28px',
                              height: '28px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: canGoPrevVersion(index) ? 'pointer' : 'not-allowed',
                              fontSize: '0.75rem',
                              fontWeight: '800',
                              color: canGoPrevVersion(index) ? '#fff' : '#737373',
                              transition: 'all 0.2s ease',
                              boxShadow: canGoPrevVersion(index) ? '2px 2px 0 #1a1a1a' : 'none'
                            }}
                            onMouseOver={(e) => {
                              if (canGoPrevVersion(index)) {
                                e.currentTarget.style.transform = 'translate(-1px, -1px)';
                                e.currentTarget.style.boxShadow = '3px 3px 0 #1a1a1a';
                              }
                            }}
                            onMouseOut={(e) => {
                              if (canGoPrevVersion(index)) {
                                e.currentTarget.style.transform = 'translate(0, 0)';
                                e.currentTarget.style.boxShadow = '2px 2px 0 #1a1a1a';
                              }
                            }}
                            title="View previous version"
                          >
                            ←
                          </button>
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: '700',
                            color: '#666',
                            minWidth: '60px',
                            textAlign: 'center'
                          }}>
                            v{getSelectedVersionIndex(index) + 1}/{getVersionHistory(index).length}
                          </span>
                          <button
                            onClick={(e) => handleNextVersion(index, e)}
                            disabled={!canGoNextVersion(index)}
                            style={{
                              background: canGoNextVersion(index) ? config.accentColor : '#d4d4d4',
                              border: '2px solid #1a1a1a',
                              borderRadius: '50%',
                              width: '28px',
                              height: '28px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: canGoNextVersion(index) ? 'pointer' : 'not-allowed',
                              fontSize: '0.75rem',
                              fontWeight: '800',
                              color: canGoNextVersion(index) ? '#fff' : '#737373',
                              transition: 'all 0.2s ease',
                              boxShadow: canGoNextVersion(index) ? '2px 2px 0 #1a1a1a' : 'none'
                            }}
                            onMouseOver={(e) => {
                              if (canGoNextVersion(index)) {
                                e.currentTarget.style.transform = 'translate(-1px, -1px)';
                                e.currentTarget.style.boxShadow = '3px 3px 0 #1a1a1a';
                              }
                            }}
                            onMouseOut={(e) => {
                              if (canGoNextVersion(index)) {
                                e.currentTarget.style.transform = 'translate(0, 0)';
                                e.currentTarget.style.boxShadow = '2px 2px 0 #1a1a1a';
                              }
                            }}
                            title="View next version"
                          >
                            →
                          </button>
                        </div>
                      )}

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
                          ⚠️ {cleanErrorMessage(item.error)}
                        </div>
                      )}

                      {/* Generation metadata */}
                      {isInProgress && (
                        <div style={{
                          fontSize: '0.75rem',
                          color: '#444',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          paddingTop: '8px',
                          borderTop: '2px solid rgba(255, 237, 78, 0.4)',
                          fontWeight: '600'
                        }}>
                          {isThisRegenerating ? (
                            /* Regenerating a segment - show progress from thisRegenerationProgress OR fallback UI */
                            thisRegenerationProgress && (thisRegenerationProgress.eta > 0 || thisRegenerationProgress.workerName || thisRegenerationProgress.status) ? (
                            <>
                              {/* ETA with caching */}
                              {(() => {
                                const eta = thisRegenerationProgress.eta;
                                if (eta > 0) {
                                  lastKnownETAsRef.current[index] = eta;
                                }
                                const displayETA = lastKnownETAsRef.current[index] || eta;

                                return displayETA > 0 ? (
                                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <span style={{ fontSize: '1rem' }}>⏱️</span>
                                    <span style={{
                                      fontWeight: '700',
                                      color: config.accentColor,
                                      fontFamily: '"Permanent Marker", cursive',
                                      fontSize: '0.9rem',
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
                                ) : thisRegenerationProgress.status?.startsWith('Queue') ? (
                                  <div style={{ color: config.accentColor, fontSize: '0.8rem' }}>⏳ queued...</div>
                                ) : null;
                              })()}

                              {/* Worker name */}
                              {thisRegenerationProgress.workerName && (
                                <div style={{
                                  display: 'flex',
                                  gap: '6px',
                                  alignItems: 'center',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  <span style={{ fontSize: '0.85rem' }}>🖥️</span>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: config.accentColor, fontWeight: '700', fontSize: '0.8rem' }}>{thisRegenerationProgress.workerName}</span>
                                </div>
                              )}

                              {/* Elapsed time */}
                              {thisRegenerationProgress.elapsed > 0 && (
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                  <span style={{ fontSize: '0.85rem' }}>⏲️</span>
                                  <span style={{ fontSize: '0.8rem', color: '#333' }}>{formatDuration(thisRegenerationProgress.elapsed)}</span>
                                </div>
                              )}

                              {/* Status message */}
                              {thisRegenerationProgress.status && !thisRegenerationProgress.status.startsWith('Queue') && (
                                <div style={{
                                  color: '#666',
                                  fontStyle: 'italic',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  fontSize: '0.75rem'
                                }}>
                                  {thisRegenerationProgress.status}
                                </div>
                              )}
                            </>
                            ) : (
                              /* Fallback: regeneration started but no progress yet - show starting state */
                              <>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                  <div style={{
                                    width: '16px',
                                    height: '16px',
                                    border: `2px solid ${config.accentColor}40`,
                                    borderTopColor: config.accentColor,
                                    borderRadius: '50%',
                                    animation: 'videoReviewSpin 1s linear infinite'
                                  }} />
                                  <span style={{ color: config.accentColor, fontSize: '0.8rem', fontWeight: '700' }}>regenerating...</span>
                                </div>
                                <div style={{ 
                                  color: '#666',
                                  fontStyle: 'italic',
                                  fontSize: '0.75rem'
                                }}>
                                  starting up...
                                </div>
                              </>
                            )
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
                                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <span style={{ fontSize: '1rem' }}>⏱️</span>
                                    <span style={{ 
                                      fontWeight: '700', 
                                      color: config.accentColor, 
                                      fontFamily: '"Permanent Marker", cursive', 
                                      fontSize: '0.9rem',
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
                                  <div style={{ color: config.accentColor, fontSize: '0.8rem' }}>⏳ queued...</div>
                                ) : (
                                  <div style={{ color: config.accentColor, fontSize: '0.8rem' }}>⏳ starting...</div>
                                );
                              })()}
                              
                              {/* Worker name */}
                              {item.status === 'generating' && itemWorkers[index] && (
                                <div style={{ 
                                  display: 'flex', 
                                  gap: '6px', 
                                  alignItems: 'center',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  <span style={{ fontSize: '0.85rem' }}>🖥️</span>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: config.accentColor, fontWeight: '700', fontSize: '0.8rem' }}>{itemWorkers[index]}</span>
                                </div>
                              )}
                              
                              {/* Elapsed time */}
                              {item.status === 'generating' && itemElapsed[index] > 0 && (
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                  <span style={{ fontSize: '0.85rem' }}>⏲️</span>
                                  <span style={{ fontSize: '0.8rem', color: '#333' }}>{formatDuration(itemElapsed[index])}</span>
                                </div>
                              )}
                              
                              {/* Status message */}
                              {item.status === 'generating' && itemStatuses[index] && !itemStatuses[index].startsWith('Queue') && (
                                <div style={{ 
                                  color: '#666',
                                  fontStyle: 'italic',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  fontSize: '0.75rem'
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
              onClick={handleStitchClick}
              disabled={!canStitch}
              style={{
                padding: '16px 36px',
                background: canStitch
                  ? '#ff3366'
                  : '#d4d4d4',
                border: canStitch ? '3px solid #1a1a1a' : '3px solid #a3a3a3',
                borderRadius: '50px',
                color: canStitch ? '#fff' : '#737373',
                fontSize: '1rem',
                fontWeight: '800',
                fontFamily: '"Permanent Marker", cursive',
                cursor: canStitch ? 'pointer' : 'not-allowed',
                transition: 'all 0.25s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                minHeight: '52px',
                boxShadow: canStitch
                  ? `4px 4px 0 #1a1a1a`
                  : 'none',
                opacity: canStitch ? 1 : 0.5,
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

      {/* Stitch Warning Modal - shown when user tries to stitch with items still in progress */}
      {showStitchWarning && (
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
          onClick={() => setShowStitchWarning(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '24px',
              padding: '32px',
              maxWidth: '450px',
              width: '90%',
              boxShadow: '6px 6px 0 #1a1a1a',
              border: '4px solid #1a1a1a',
              animation: 'videoReviewPopupFadeIn 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '56px' }}>⚠️</span>
            </div>

            <h3 style={{
              margin: '0 0 16px 0',
              color: '#1a1a1a',
              fontSize: '24px',
              fontWeight: '700',
              fontFamily: '"Permanent Marker", cursive',
              textAlign: 'center'
            }}>
              Stitch Now?
            </h3>

            <p style={{
              margin: '0 0 20px 0',
              color: '#666',
              fontSize: '15px',
              textAlign: 'center',
              lineHeight: '1.6',
              fontWeight: '600'
            }}>
              You have <strong style={{ color: config.accentColor }}>{inProgressCount} {config.itemLabel.toLowerCase()}{inProgressCount > 1 ? 's' : ''}</strong> still finishing.
              {' '}If you continue, {inProgressCount > 1 ? 'they' : 'it'} will be cancelled.
            </p>

            <div style={{
              backgroundColor: 'rgba(255, 237, 78, 0.2)',
              border: '2px solid #FFED4E',
              borderRadius: '16px',
              padding: '16px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px'
            }}>
              <span style={{ fontSize: '24px', flexShrink: 0 }}>💰</span>
              <span style={{
                color: '#1a1a1a',
                fontSize: '14px',
                fontWeight: '600',
                lineHeight: '1.5'
              }}>
                Credits for in-progress work will be refunded
              </span>
            </div>

            <div style={{
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              border: '2px solid #22c55e',
              borderRadius: '16px',
              padding: '16px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px'
            }}>
              <span style={{ fontSize: '24px', flexShrink: 0 }}>✓</span>
              <span style={{
                color: '#1a1a1a',
                fontSize: '14px',
                fontWeight: '600',
                lineHeight: '1.5'
              }}>
                You have <strong style={{ color: '#22c55e' }}>{readyCount} {config.itemLabel.toLowerCase()}{readyCount > 1 ? 's' : ''}</strong> ready to stitch
              </span>
            </div>

            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center'
            }}>
              <button
                onClick={() => setShowStitchWarning(false)}
                style={{
                  flex: 1,
                  padding: '14px 24px',
                  background: '#ffffff',
                  border: '3px solid #1a1a1a',
                  borderRadius: '50px',
                  color: '#1a1a1a',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
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
                wait for them
              </button>
              <button
                onClick={handleConfirmStitch}
                style={{
                  flex: 1,
                  padding: '14px 24px',
                  background: '#ff3366',
                  border: '3px solid #1a1a1a',
                  borderRadius: '50px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '4px 4px 0 #1a1a1a',
                  textTransform: 'lowercase'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translate(-2px, -2px)';
                  e.currentTarget.style.boxShadow = '6px 6px 0 #1a1a1a';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translate(0, 0)';
                  e.currentTarget.style.boxShadow = '4px 4px 0 #1a1a1a';
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = 'translate(2px, 2px)';
                  e.currentTarget.style.boxShadow = '2px 2px 0 #1a1a1a';
                }}
              >
                🎬 stitch now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Redo Confirmation Modal - shown when user tries to redo a segment that's still processing */}
      {showRedoConfirmation && redoConfirmationIndex !== null && (
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
          onClick={() => setShowRedoConfirmation(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '24px',
              padding: '32px',
              maxWidth: '420px',
              width: '90%',
              boxShadow: '6px 6px 0 #1a1a1a',
              border: '4px solid #1a1a1a',
              animation: 'videoReviewPopupFadeIn 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '56px' }}>🔄</span>
            </div>

            <h3 style={{
              margin: '0 0 16px 0',
              color: '#1a1a1a',
              fontSize: '24px',
              fontWeight: '700',
              fontFamily: '"Permanent Marker", cursive',
              textAlign: 'center'
            }}>
              Cancel & Retry?
            </h3>

            <p style={{
              margin: '0 0 20px 0',
              color: '#666',
              fontSize: '15px',
              textAlign: 'center',
              lineHeight: '1.6',
              fontWeight: '600'
            }}>
              This {config.itemLabel.toLowerCase()} is still being generated.
              {' '}Clicking "retry now" will cancel the current attempt and start over.
            </p>

            <div style={{
              backgroundColor: 'rgba(255, 237, 78, 0.2)',
              border: '2px solid #FFED4E',
              borderRadius: '16px',
              padding: '16px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px'
            }}>
              <span style={{ fontSize: '24px', flexShrink: 0 }}>💰</span>
              <span style={{
                color: '#1a1a1a',
                fontSize: '14px',
                fontWeight: '600',
                lineHeight: '1.5'
              }}>
                Credits for the current attempt will be refunded
              </span>
            </div>

            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center'
            }}>
              <button
                onClick={() => {
                  setShowRedoConfirmation(false);
                  setRedoConfirmationIndex(null);
                }}
                style={{
                  flex: 1,
                  padding: '14px 24px',
                  background: '#ffffff',
                  border: '3px solid #1a1a1a',
                  borderRadius: '50px',
                  color: '#1a1a1a',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
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
                keep generating
              </button>
              <button
                onClick={handleConfirmRedo}
                style={{
                  flex: 1,
                  padding: '14px 24px',
                  background: '#f59e0b',
                  border: '3px solid #1a1a1a',
                  borderRadius: '50px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '4px 4px 0 #1a1a1a',
                  textTransform: 'lowercase'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translate(-2px, -2px)';
                  e.currentTarget.style.boxShadow = '6px 6px 0 #1a1a1a';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translate(0, 0)';
                  e.currentTarget.style.boxShadow = '4px 4px 0 #1a1a1a';
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = 'translate(2px, 2px)';
                  e.currentTarget.style.boxShadow = '2px 2px 0 #1a1a1a';
                }}
              >
                🔄 retry now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prompt Editor Modal - shown before regenerating to let user edit prompts */}
      {showPromptEditor && promptEditorIndex !== null && (
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
            zIndex: 100002
          }}
          onClick={handlePromptEditorClose}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '24px',
              padding: '32px',
              maxWidth: '520px',
              width: '90%',
              boxShadow: '6px 6px 0 #1a1a1a',
              border: '4px solid #1a1a1a',
              animation: 'videoReviewPopupFadeIn 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '56px' }}>✏️</span>
            </div>

            <h3 style={{
              margin: '0 0 16px 0',
              color: '#1a1a1a',
              fontSize: '24px',
              fontWeight: '700',
              fontFamily: '"Permanent Marker", cursive',
              textAlign: 'center'
            }}>
              Edit Prompt
            </h3>

            <p style={{
              margin: '0 0 20px 0',
              color: '#666',
              fontSize: '14px',
              textAlign: 'center',
              lineHeight: '1.5',
              fontWeight: '600'
            }}>
              Tweak the motion prompt before regenerating {config.itemLabel.toLowerCase()} {promptEditorIndex + 1}
            </p>

            {/* Positive prompt (motion prompt) */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '6px',
                color: '#1a1a1a',
                fontSize: '13px',
                fontWeight: '700',
                textTransform: 'lowercase'
              }}>
                motion prompt
              </label>
              <textarea
                value={editPositivePrompt}
                onChange={(e) => setEditPositivePrompt(e.target.value)}
                placeholder="Describe the motion you want..."
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '12px',
                  borderRadius: '12px',
                  border: '3px solid #1a1a1a',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  outline: 'none',
                  transition: 'border-color 0.2s ease',
                  color: '#1a1a1a',
                  backgroundColor: '#ffffff'
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = config.accentColor || '#a855f7'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#1a1a1a'; }}
              />
            </div>

            {/* Negative prompt (avoid) */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                marginBottom: '6px',
                color: '#1a1a1a',
                fontSize: '13px',
                fontWeight: '700',
                textTransform: 'lowercase'
              }}>
                avoid (negative prompt)
              </label>
              <textarea
                value={editNegativePrompt}
                onChange={(e) => setEditNegativePrompt(e.target.value)}
                placeholder="Things to avoid..."
                style={{
                  width: '100%',
                  minHeight: '60px',
                  padding: '12px',
                  borderRadius: '12px',
                  border: '3px solid #1a1a1a',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  outline: 'none',
                  transition: 'border-color 0.2s ease',
                  color: '#1a1a1a',
                  backgroundColor: '#ffffff'
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = config.accentColor || '#a855f7'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#1a1a1a'; }}
              />
            </div>

            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center'
            }}>
              <button
                onClick={handlePromptEditorClose}
                style={{
                  flex: 1,
                  padding: '14px 24px',
                  background: '#ffffff',
                  border: '3px solid #1a1a1a',
                  borderRadius: '50px',
                  color: '#1a1a1a',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
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
                cancel
              </button>
              <button
                onClick={handlePromptEditorConfirm}
                style={{
                  flex: 1,
                  padding: '14px 24px',
                  background: config.accentColor || '#a855f7',
                  border: '3px solid #1a1a1a',
                  borderRadius: '50px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '4px 4px 0 #1a1a1a',
                  textTransform: 'lowercase'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translate(-2px, -2px)';
                  e.currentTarget.style.boxShadow = '6px 6px 0 #1a1a1a';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translate(0, 0)';
                  e.currentTarget.style.boxShadow = '4px 4px 0 #1a1a1a';
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = 'translate(2px, 2px)';
                  e.currentTarget.style.boxShadow = '2px 2px 0 #1a1a1a';
                }}
              >
                🔄 regenerate
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
            padding: 12px !important;
          }
        }

        /* Portrait layout mobile optimizations */
        @media (max-width: 480px) {
          .video-review-popup {
            padding: 8px !important;
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
  onCancelItem: PropTypes.func,
  onPlayItem: PropTypes.func,
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
  // Per-item prompt data for prompt editor
  itemPrompts: PropTypes.arrayOf(PropTypes.shape({
    positivePrompt: PropTypes.string,
    negativePrompt: PropTypes.string
  })),
  // Legacy single-segment props (for backward compatibility)
  regeneratingIndex: PropTypes.number,
  regenerationProgress: PropTypes.shape({
    progress: PropTypes.number,
    eta: PropTypes.number,
    message: PropTypes.string,
    workerName: PropTypes.string,
    status: PropTypes.string,
    elapsed: PropTypes.number
  }),
  // New multi-segment props (Set and Map)
  regeneratingIndices: PropTypes.instanceOf(Set),
  regenerationProgresses: PropTypes.instanceOf(Map),
  itemETAs: PropTypes.arrayOf(PropTypes.number),
  itemProgress: PropTypes.arrayOf(PropTypes.number),
  itemWorkers: PropTypes.arrayOf(PropTypes.string),
  itemStatuses: PropTypes.arrayOf(PropTypes.string),
  itemElapsed: PropTypes.arrayOf(PropTypes.number),
  // Version navigation props (for cycling through successful generations)
  itemVersionHistories: PropTypes.instanceOf(Map),
  selectedVersions: PropTypes.instanceOf(Map),
  onVersionChange: PropTypes.func
};

export default VideoReviewPopup;
