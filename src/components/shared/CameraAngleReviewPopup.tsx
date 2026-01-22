/**
 * CameraAngleReviewPopup
 *
 * Review popup for multi-angle camera generation results.
 * Based on VideoReviewPopup pattern.
 *
 * Features:
 * - Grid view of generated angle images
 * - Per-item regeneration with version history
 * - Status indicators and progress tracking
 * - "Apply to Gallery" to confirm and add images
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { AngleGenerationItem, CameraAngleReviewPopupProps } from '../../types/cameraAngle';
import {
  getAzimuthConfig,
  getElevationConfig,
  getDistanceConfig
} from '../../constants/cameraAngleSettings';

// Color palette matching other popups
const COLORS = {
  accent: '#FDFF00',
  accentSoft: 'rgba(253, 255, 0, 0.15)',
  black: '#000000',
  white: '#FFFFFF',
  textPrimary: 'rgba(255, 255, 255, 0.9)',
  textSecondary: 'rgba(255, 255, 255, 0.6)',
  textMuted: 'rgba(255, 255, 255, 0.4)',
  surface: '#1c1c1e',
  surfaceLight: 'rgba(255, 255, 255, 0.06)',
  border: 'rgba(255, 255, 255, 0.1)',
  borderLight: 'rgba(255, 255, 255, 0.06)',
  success: '#4ade80',
  error: '#f87171',
  warning: '#fbbf24'
};

/**
 * Helper to format ETA in human-readable format
 */
const formatETA = (seconds?: number): string => {
  if (seconds === undefined || seconds === null || isNaN(seconds)) return '';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Individual angle result card
 */
interface AngleResultCardProps {
  item: AngleGenerationItem;
  isOriginal?: boolean;
  onRegenerate?: () => void;
  onCancel?: () => void;
  onPrevVersion?: () => void;
  onNextVersion?: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  versionCount?: number;
  currentVersion?: number;
}

const AngleResultCard: React.FC<AngleResultCardProps> = ({
  item,
  isOriginal = false,
  onRegenerate,
  onCancel,
  onPrevVersion,
  onNextVersion,
  canPrev = false,
  canNext = false,
  versionCount = 1,
  currentVersion = 1
}) => {
  // Track when result image has finished loading to prevent flicker
  const [resultImageLoaded, setResultImageLoaded] = useState(false);
  const prevResultUrl = React.useRef<string | undefined>(undefined);

  // Reset loaded state when result URL changes
  React.useEffect(() => {
    if (item.resultUrl !== prevResultUrl.current) {
      setResultImageLoaded(false);
      prevResultUrl.current = item.resultUrl;
    }
  }, [item.resultUrl]);

  const azConfig = getAzimuthConfig(item.angleConfig.azimuth);
  const elConfig = getElevationConfig(item.angleConfig.elevation);
  const distConfig = getDistanceConfig(item.angleConfig.distance);

  // Determine status badge
  const getStatusBadge = () => {
    if (isOriginal) {
      return { text: 'original', color: COLORS.textMuted, bg: COLORS.surfaceLight };
    }
    switch (item.status) {
      case 'pending':
        return { text: 'waiting', color: COLORS.textMuted, bg: COLORS.surfaceLight };
      case 'generating':
        return { text: `${item.progress || 0}%`, color: COLORS.accent, bg: COLORS.accentSoft };
      case 'ready':
        return { text: 'ready', color: COLORS.success, bg: 'rgba(74, 222, 128, 0.15)' };
      case 'failed':
        return { text: 'failed', color: COLORS.error, bg: 'rgba(248, 113, 113, 0.15)' };
      default:
        return { text: '', color: COLORS.textMuted, bg: COLORS.surfaceLight };
    }
  };

  const badge = getStatusBadge();

  // Determine what to show:
  // - For original items or items without a result, show source
  // - For items with a result, show result only after it's loaded
  const showSourceImage = isOriginal || !item.resultUrl || !resultImageLoaded;
  const showResultImage = !isOriginal && item.resultUrl;

  return (
    <div
      className="angle-result-card"
      style={{
        position: 'relative',
        background: COLORS.surface,
        borderRadius: '12px',
        border: `1px solid ${COLORS.border}`,
        overflow: 'hidden',
        transition: 'all 0.2s ease'
      }}
    >
      {/* Status Badge */}
      <div style={{
        position: 'absolute',
        top: '8px',
        left: '8px',
        padding: '4px 8px',
        borderRadius: '6px',
        background: badge.bg,
        color: badge.color,
        fontSize: '10px',
        fontWeight: '600',
        textTransform: 'lowercase',
        zIndex: 2,
        backdropFilter: 'blur(8px)'
      }}>
        {badge.text}
      </div>

      {/* Cancel Button - shown during generation */}
      {item.status === 'generating' && onCancel && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          style={{
            position: 'absolute',
            bottom: '8px',
            left: '8px',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: `2px solid ${COLORS.surface}`,
            background: COLORS.error,
            color: COLORS.white,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: '700',
            zIndex: 3,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.background = '#ef4444';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.background = COLORS.error;
          }}
          title="Cancel this angle"
        >
          ✕
        </button>
      )}

      {/* Index Badge */}
      <div style={{
        position: 'absolute',
        top: '8px',
        right: '8px',
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        background: isOriginal ? COLORS.surfaceLight : COLORS.accent,
        color: isOriginal ? COLORS.textSecondary : COLORS.black,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '11px',
        fontWeight: '700',
        zIndex: 2
      }}>
        {isOriginal ? '0' : item.index + 1}
      </div>

      {/* Image Container */}
      <div style={{
        position: 'relative',
        aspectRatio: '1',
        background: COLORS.surfaceLight
      }}>
        {/* Source Image - shown during pending/generating or as fallback */}
        {showSourceImage && item.sourceImageUrl && (
          <img
            src={item.sourceImageUrl}
            alt={isOriginal ? 'Original' : `Angle ${item.index + 1} (source)`}
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: item.status === 'generating' ? 0.5 : 1,
              transition: 'opacity 0.3s ease'
            }}
          />
        )}

        {/* Result Image - preloads and shows only after loaded to prevent flicker */}
        {showResultImage && (
          <img
            src={item.resultUrl}
            alt={`Angle ${item.index + 1}`}
            onLoad={() => setResultImageLoaded(true)}
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: resultImageLoaded ? 1 : 0,
              transition: 'opacity 0.3s ease'
            }}
          />
        )}

        {/* Loading Overlay */}
        {item.status === 'generating' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)'
          }}>
            {/* Progress Ring */}
            <svg width="48" height="48" viewBox="0 0 48 48">
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke={COLORS.border}
                strokeWidth="3"
              />
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke={COLORS.accent}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${(item.progress || 0) * 1.26} 126`}
                transform="rotate(-90 24 24)"
                style={{ transition: 'stroke-dasharray 0.3s ease' }}
              />
            </svg>
            <div style={{
              marginTop: '8px',
              fontSize: '12px',
              fontWeight: '600',
              color: COLORS.textPrimary
            }}>
              {item.progress || 0}%
            </div>
            {item.eta && (
              <div style={{
                fontSize: '10px',
                color: COLORS.textMuted,
                marginTop: '2px'
              }}>
                ~{formatETA(item.eta)} left
              </div>
            )}
            {item.workerName && (
              <div style={{
                fontSize: '9px',
                color: COLORS.textMuted,
                marginTop: '4px'
              }}>
                {item.workerName}
              </div>
            )}
          </div>
        )}

        {/* Error Overlay */}
        {item.status === 'failed' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.7)',
            padding: '16px'
          }}>
            <span style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</span>
            <span style={{
              fontSize: '11px',
              color: COLORS.error,
              textAlign: 'center'
            }}>
              {item.error || 'Generation failed'}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 12px',
        borderTop: `1px solid ${COLORS.borderLight}`,
        background: COLORS.surfaceLight
      }}>
        {/* Angle Info */}
        <div style={{
          fontSize: '10px',
          color: COLORS.textSecondary,
          textTransform: 'lowercase',
          marginBottom: '8px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {isOriginal ? 'source image' : `${azConfig.label.toLowerCase()} · ${elConfig.label.toLowerCase()} · ${distConfig.label.toLowerCase()}`}
        </div>

        {/* Actions Row */}
        {!isOriginal && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px'
          }}>
            {/* Version Navigation */}
            {versionCount > 1 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <button
                  onClick={onPrevVersion}
                  disabled={!canPrev}
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '4px',
                    border: 'none',
                    background: canPrev ? COLORS.surfaceLight : 'transparent',
                    color: canPrev ? COLORS.textSecondary : COLORS.textMuted,
                    cursor: canPrev ? 'pointer' : 'not-allowed',
                    fontSize: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Previous version"
                >
                  ←
                </button>
                <span style={{
                  fontSize: '10px',
                  color: COLORS.textMuted,
                  minWidth: '30px',
                  textAlign: 'center'
                }}>
                  v{currentVersion}/{versionCount}
                </span>
                <button
                  onClick={onNextVersion}
                  disabled={!canNext}
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '4px',
                    border: 'none',
                    background: canNext ? COLORS.surfaceLight : 'transparent',
                    color: canNext ? COLORS.textSecondary : COLORS.textMuted,
                    cursor: canNext ? 'pointer' : 'not-allowed',
                    fontSize: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Next version"
                >
                  →
                </button>
              </div>
            )}

            {/* Regenerate Button - always visible */}
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: `1px solid ${item.status === 'generating' ? COLORS.warning : COLORS.border}`,
                  background: item.status === 'generating' ? 'rgba(251, 191, 36, 0.15)' : 'transparent',
                  color: item.status === 'generating' ? COLORS.warning : COLORS.textSecondary,
                  cursor: 'pointer',
                  fontSize: '10px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease',
                  marginLeft: 'auto'
                }}
                title={item.status === 'generating' ? 'Cancel and retry this angle' : 'Regenerate this angle'}
              >
                <span>🔄</span>
                <span>redo</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Main Review Popup Component
 */
const CameraAngleReviewPopup: React.FC<CameraAngleReviewPopupProps> = ({
  visible,
  items,
  sourcePhoto,
  keepOriginal,
  onClose,
  onRegenerateItem,
  onApply,
  onVersionChange,
  onCancelGeneration,
  onCancelItem
}) => {
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [showRedoConfirmation, setShowRedoConfirmation] = useState(false);
  const [redoConfirmationIndex, setRedoConfirmationIndex] = useState<number | null>(null);

  // Calculate stats
  const stats = useMemo(() => {
    const ready = items.filter(i => i.status === 'ready').length;
    const generating = items.filter(i => i.status === 'generating').length;
    const failed = items.filter(i => i.status === 'failed').length;
    const pending = items.filter(i => i.status === 'pending').length;
    const total = items.length;
    const allDone = generating === 0 && pending === 0;
    const anyReady = ready > 0;
    return { ready, generating, failed, pending, total, allDone, anyReady };
  }, [items]);

  // Get currently displayed URL for each item (based on version selection)
  const getDisplayUrl = useCallback((item: AngleGenerationItem): string | undefined => {
    if (item.versionHistory.length > 0 && item.selectedVersion < item.versionHistory.length) {
      return item.versionHistory[item.selectedVersion];
    }
    return item.resultUrl;
  }, []);

  // Handle close with confirmation if generation in progress
  const handleClose = useCallback(() => {
    if (stats.generating > 0) {
      setShowCancelConfirmation(true);
    } else {
      onClose();
    }
  }, [stats.generating, onClose]);

  // Handle confirm cancel
  const handleConfirmCancel = useCallback(() => {
    setShowCancelConfirmation(false);
    onCancelGeneration?.();
    onClose();
  }, [onCancelGeneration, onClose]);

  // Handle regenerate click - show confirmation if item is generating
  const handleRegenerateClick = useCallback((index: number) => {
    const item = items[index];
    if (item?.status === 'generating') {
      setRedoConfirmationIndex(index);
      setShowRedoConfirmation(true);
      return;
    }
    onRegenerateItem(index);
  }, [items, onRegenerateItem]);

  // Confirm redo (cancel current generation and start over)
  const handleConfirmRedo = useCallback(() => {
    if (redoConfirmationIndex !== null) {
      onCancelItem?.(redoConfirmationIndex);
      setTimeout(() => {
        onRegenerateItem(redoConfirmationIndex);
      }, 100);
    }
    setShowRedoConfirmation(false);
    setRedoConfirmationIndex(null);
  }, [redoConfirmationIndex, onCancelItem, onRegenerateItem]);

  // Handle cancel single item
  const handleCancelItem = useCallback((index: number) => {
    onCancelItem?.(index);
  }, [onCancelItem]);

  // Handle apply to gallery
  const handleApply = useCallback(() => {
    const finalUrls: string[] = [];

    // Add original first if keepOriginal is true
    if (keepOriginal && sourcePhoto.images?.[0]) {
      finalUrls.push(sourcePhoto.images[0]);
    } else if (keepOriginal && sourcePhoto.originalDataUrl) {
      finalUrls.push(sourcePhoto.originalDataUrl);
    }

    // Add all ready items in order
    for (const item of items) {
      const url = getDisplayUrl(item);
      if (item.status === 'ready' && url) {
        finalUrls.push(url);
      }
    }

    onApply(finalUrls);
  }, [keepOriginal, sourcePhoto, items, getDisplayUrl, onApply]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && visible) {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, handleClose]);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }, [handleClose]);

  // Create original item for display
  const originalItem: AngleGenerationItem | null = keepOriginal ? {
    index: -1,
    slotId: 'original',
    sourceImageUrl: sourcePhoto.images?.[0] || sourcePhoto.originalDataUrl || '',
    resultUrl: sourcePhoto.images?.[0] || sourcePhoto.originalDataUrl,
    status: 'ready',
    versionHistory: [],
    selectedVersion: 0,
    angleConfig: {
      azimuth: 'front',
      elevation: 'eye-level',
      distance: 'medium'
    }
  } : null;

  if (!visible) return null;

  const popup = (
    <div
      className="camera-angle-review-popup-backdrop"
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999999,
        padding: '16px',
        animation: 'cameraAngleReviewFadeIn 0.2s ease'
      }}
    >
      <div
        className="camera-angle-review-popup"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.surface,
          borderRadius: '20px',
          border: `1px solid ${COLORS.border}`,
          width: '100%',
          maxWidth: '800px',
          maxHeight: 'calc(100vh - 32px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6), 0 0 1px rgba(255, 255, 255, 0.1)',
          animation: 'cameraAngleReviewSlideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          fontFamily: '"SF Mono", "Monaco", "Inconsolata", "Fira Mono", monospace'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 20px',
          borderBottom: `1px solid ${COLORS.borderLight}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: COLORS.surfaceLight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px'
            }}>
              🎬
            </div>
            <div>
              <h2 style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: '700',
                color: COLORS.textPrimary,
                fontFamily: '"Permanent Marker", cursive',
                letterSpacing: '0.3px'
              }}>
                {stats.allDone ? 'Review Angle Renders' : 'Generating Angles'}
              </h2>
              <p style={{
                margin: '2px 0 0',
                fontSize: '11px',
                color: COLORS.textMuted,
                textTransform: 'lowercase',
                fontWeight: '500'
              }}>
                {stats.allDone
                  ? 'preview, regenerate, and apply to gallery'
                  : `${stats.ready + stats.failed} of ${stats.total} complete`}
              </p>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={handleClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: 'none',
              background: COLORS.surfaceLight,
              color: COLORS.textSecondary,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: '400',
              transition: 'all 0.15s ease'
            }}
          >
            ✕
          </button>
        </div>

        {/* Content - Grid of results */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px 20px'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '16px'
          }}>
            {/* Original Image Card (if keepOriginal) */}
            {originalItem && (
              <AngleResultCard
                item={originalItem}
                isOriginal={true}
              />
            )}

            {/* Generated Angle Cards */}
            {items.map((item, idx) => (
              <AngleResultCard
                key={item.slotId}
                item={{
                  ...item,
                  resultUrl: getDisplayUrl(item)
                }}
                onRegenerate={() => handleRegenerateClick(idx)}
                onCancel={onCancelItem ? () => handleCancelItem(idx) : undefined}
                onPrevVersion={() => onVersionChange(idx, item.selectedVersion - 1)}
                onNextVersion={() => onVersionChange(idx, item.selectedVersion + 1)}
                canPrev={item.selectedVersion > 0}
                canNext={item.selectedVersion < item.versionHistory.length - 1}
                versionCount={item.versionHistory.length}
                currentVersion={item.selectedVersion + 1}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 20px',
          borderTop: `1px solid ${COLORS.borderLight}`,
          background: COLORS.surfaceLight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {/* Status Summary */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '12px'
          }}>
            {stats.ready > 0 && (
              <span style={{ color: COLORS.success }}>
                ✓ {stats.ready} ready
              </span>
            )}
            {stats.generating > 0 && (
              <span style={{ color: COLORS.accent }}>
                ⏳ {stats.generating} generating
              </span>
            )}
            {stats.failed > 0 && (
              <span style={{ color: COLORS.error }}>
                ✕ {stats.failed} failed
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleClose}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                border: `1px solid ${COLORS.border}`,
                background: 'transparent',
                color: COLORS.textSecondary,
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '500',
                textTransform: 'lowercase',
                transition: 'all 0.15s ease'
              }}
            >
              {stats.generating > 0 ? 'cancel' : 'close'}
            </button>

            <button
              onClick={handleApply}
              disabled={!stats.anyReady}
              style={{
                padding: '10px 24px',
                borderRadius: '10px',
                border: 'none',
                background: stats.anyReady ? COLORS.accent : COLORS.textMuted,
                color: COLORS.black,
                cursor: stats.anyReady ? 'pointer' : 'not-allowed',
                fontSize: '12px',
                fontWeight: '600',
                textTransform: 'lowercase',
                transition: 'all 0.15s ease'
              }}
            >
              apply to gallery
            </button>
          </div>
        </div>
      </div>

      {/* Cancel Confirmation Dialog */}
      {showCancelConfirmation && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10
          }}
          onClick={() => setShowCancelConfirmation(false)}
        >
          <div
            style={{
              background: COLORS.surface,
              borderRadius: '16px',
              border: `1px solid ${COLORS.border}`,
              padding: '24px',
              maxWidth: '320px',
              textAlign: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              fontSize: '32px',
              marginBottom: '12px'
            }}>
              ⚠️
            </div>
            <h3 style={{
              margin: '0 0 8px',
              fontSize: '16px',
              fontWeight: '700',
              color: COLORS.textPrimary
            }}>
              Cancel Generation?
            </h3>
            <p style={{
              margin: '0 0 20px',
              fontSize: '12px',
              color: COLORS.textSecondary
            }}>
              {stats.generating} angle{stats.generating > 1 ? 's are' : ' is'} still generating.
              {stats.ready > 0 && ` You have ${stats.ready} ready to keep.`}
            </p>
            <div style={{
              display: 'flex',
              gap: '10px',
              justifyContent: 'center'
            }}>
              <button
                onClick={() => setShowCancelConfirmation(false)}
                style={{
                  padding: '10px 20px',
                  borderRadius: '10px',
                  border: `1px solid ${COLORS.border}`,
                  background: 'transparent',
                  color: COLORS.textSecondary,
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500'
                }}
              >
                keep generating
              </button>
              <button
                onClick={handleConfirmCancel}
                style={{
                  padding: '10px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  background: COLORS.error,
                  color: COLORS.white,
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600'
                }}
              >
                cancel & close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Redo Confirmation Dialog - shown when user tries to redo an angle that's still generating */}
      {showRedoConfirmation && redoConfirmationIndex !== null && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10
          }}
          onClick={() => {
            setShowRedoConfirmation(false);
            setRedoConfirmationIndex(null);
          }}
        >
          <div
            style={{
              background: COLORS.surface,
              borderRadius: '16px',
              border: `1px solid ${COLORS.border}`,
              padding: '24px',
              maxWidth: '320px',
              textAlign: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              fontSize: '32px',
              marginBottom: '12px'
            }}>
              🔄
            </div>
            <h3 style={{
              margin: '0 0 8px',
              fontSize: '16px',
              fontWeight: '700',
              color: COLORS.textPrimary
            }}>
              Cancel & Retry?
            </h3>
            <p style={{
              margin: '0 0 20px',
              fontSize: '12px',
              color: COLORS.textSecondary
            }}>
              Angle {redoConfirmationIndex + 1} is still generating. Cancel it and start over?
            </p>
            <div style={{
              display: 'flex',
              gap: '10px',
              justifyContent: 'center'
            }}>
              <button
                onClick={() => {
                  setShowRedoConfirmation(false);
                  setRedoConfirmationIndex(null);
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: '10px',
                  border: `1px solid ${COLORS.border}`,
                  background: 'transparent',
                  color: COLORS.textSecondary,
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500'
                }}
              >
                keep generating
              </button>
              <button
                onClick={handleConfirmRedo}
                style={{
                  padding: '10px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  background: COLORS.warning,
                  color: COLORS.black,
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600'
                }}
              >
                cancel & retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes cameraAngleReviewFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes cameraAngleReviewSlideUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );

  return createPortal(popup, document.body);
};

export default CameraAngleReviewPopup;
