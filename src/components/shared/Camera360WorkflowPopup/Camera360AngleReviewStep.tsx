/**
 * Camera360AngleReviewStep (Phase 2)
 *
 * Horizontal carousel review of generated angle images with progress indicators,
 * worker names, SMPTE test pattern placeholders, regeneration, and version history.
 */

import React, { useCallback } from 'react';
import type { AngleGenerationItem } from '../../../types/cameraAngle';
import { COLORS } from '../../../constants/camera360Settings';
import {
  getAzimuthConfig,
  getElevationConfig,
  getDistanceConfig
} from '../../../constants/cameraAngleSettings';
import TestPatternPlaceholder from '../TestPatternPlaceholder';

interface Camera360AngleReviewStepProps {
  angleItems: AngleGenerationItem[];
  sourceImageUrl: string;
  isGenerating: boolean;
  allReady: boolean;
  onRegenerate: (index: number) => void;
  onVersionChange: (index: number, version: number) => void;
  onProceed: () => void;
  onBack: () => void;
  sourceWidth: number;
  sourceHeight: number;
}

const formatETA = (seconds?: number): string => {
  if (seconds === undefined || seconds === null || isNaN(seconds)) return '';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const Camera360AngleReviewStep: React.FC<Camera360AngleReviewStepProps> = ({
  angleItems,
  sourceImageUrl,
  isGenerating,
  allReady,
  onRegenerate,
  onVersionChange,
  onProceed,
  onBack,
  sourceWidth,
  sourceHeight
}) => {
  const readyCount = angleItems.filter(i => i.status === 'ready').length;
  const totalCount = angleItems.length;

  const getDisplayUrl = useCallback((item: AngleGenerationItem) => {
    if (item.versionHistory.length > 0 && item.selectedVersion < item.versionHistory.length) {
      return item.versionHistory[item.selectedVersion];
    }
    return item.resultUrl;
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      overflow: 'hidden',
      minHeight: 0
    }}>
      {/* Status bar - fixed top */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        flexShrink: 0,
        borderBottom: `1px solid ${COLORS.borderLight}`
      }}>
        <div style={{
          fontSize: '12px',
          color: COLORS.textSecondary,
          fontWeight: '600'
        }}>
          {allReady
            ? `All ${totalCount} angles ready`
            : `${readyCount} of ${totalCount} complete`}
        </div>
        {isGenerating && (
          <div style={{
            fontSize: '11px',
            color: COLORS.warning,
            fontWeight: '500'
          }}>
            Generating...
          </div>
        )}
      </div>

      {/* Horizontal carousel */}
      <div style={{
        flex: 1,
        display: 'flex',
        gap: '20px',
        padding: '20px 24px',
        overflowX: 'auto',
        overflowY: 'hidden',
        alignItems: 'flex-start',
        scrollSnapType: 'x mandatory',
        scrollPadding: '0 24px',
        WebkitOverflowScrolling: 'touch',
        minHeight: 0
      }}>
        {/* Original image card */}
        <div style={{
          flexShrink: 0,
          minWidth: '280px',
          maxWidth: '480px',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '12px',
          border: `1px solid ${COLORS.accent}`,
          overflow: 'hidden',
          background: COLORS.surfaceLight,
          scrollSnapAlign: 'center'
        }}>
          {/* Image area */}
          <div style={{
            flex: 'none',
            minHeight: 0,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            background: 'rgba(0,0,0,0.4)',
            aspectRatio: `${sourceWidth || 1024} / ${sourceHeight || 1024}`
          }}>
            <img
              src={sourceImageUrl}
              alt="Original"
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                display: 'block'
              }}
            />
          </div>
          {/* Info bar */}
          <div style={{
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0
          }}>
            <div style={{
              fontSize: '11px',
              color: COLORS.accent,
              fontWeight: '600'
            }}>
              Original (included in loop)
            </div>
          </div>
        </div>

        {/* Angle result cards */}
        {angleItems.map((item, index) => {
          const displayUrl = getDisplayUrl(item);
          const azimuth = getAzimuthConfig(item.angleConfig.azimuth);
          const elevation = getElevationConfig(item.angleConfig.elevation);
          const distance = getDistanceConfig(item.angleConfig.distance);

          return (
            <div
              key={item.slotId}
              style={{
                flexShrink: 0,
                minWidth: '280px',
                maxWidth: '480px',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: '12px',
                border: `1px solid ${
                  item.status === 'ready' ? COLORS.border :
                  item.status === 'failed' ? COLORS.error :
                  COLORS.borderLight
                }`,
                overflow: 'hidden',
                background: COLORS.surfaceLight,
                scrollSnapAlign: 'center'
              }}
            >
              {/* Image area - aspect ratio driven */}
              <div style={{
                flex: 'none',
                minHeight: 0,
                position: 'relative',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                background: 'rgba(0,0,0,0.4)',
                aspectRatio: `${sourceWidth || 1024} / ${sourceHeight || 1024}`
              }}>
                {item.status === 'ready' && displayUrl ? (
                  <img
                    src={displayUrl}
                    alt={`Angle ${index + 1}`}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      width: 'auto',
                      height: 'auto',
                      objectFit: 'contain',
                      display: 'block'
                    }}
                  />
                ) : item.status === 'generating' ? (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}>
                    {/* Test pattern behind progress */}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <TestPatternPlaceholder width={sourceWidth || 1024} height={sourceHeight || 1024} />
                    </div>
                    {/* Progress overlay */}
                    <div style={{
                      position: 'relative',
                      zIndex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'rgba(0,0,0,0.5)',
                      borderRadius: '12px',
                      padding: '16px 24px'
                    }}>
                      <svg width="48" height="48" viewBox="0 0 48 48">
                        <circle cx="24" cy="24" r="20" fill="none" stroke={COLORS.borderLight} strokeWidth="3" />
                        <circle
                          cx="24" cy="24" r="20" fill="none"
                          stroke={COLORS.accent}
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeDasharray={`${(item.progress || 0) / 100 * 125.6} 125.6`}
                          transform="rotate(-90 24 24)"
                          style={{ transition: 'stroke-dasharray 0.3s ease' }}
                        />
                      </svg>
                      <div style={{ fontSize: '12px', color: COLORS.textSecondary, fontWeight: '500' }}>
                        {Math.round(item.progress || 0)}%
                        {item.eta ? ` ~ ${formatETA(item.eta)}` : ''}
                      </div>
                      {item.workerName && (
                        <div style={{
                          fontSize: '9px',
                          color: 'rgba(255, 255, 255, 0.4)',
                          whiteSpace: 'nowrap',
                          textAlign: 'center'
                        }}>
                          {item.workerName}
                        </div>
                      )}
                    </div>
                  </div>
                ) : item.status === 'failed' ? (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}>
                    <TestPatternPlaceholder width={sourceWidth || 1024} height={sourceHeight || 1024} />
                    <div style={{
                      position: 'absolute',
                      background: 'rgba(0,0,0,0.6)',
                      borderRadius: '8px',
                      padding: '8px 16px',
                      textAlign: 'center'
                    }}>
                      <span style={{ fontSize: '20px', display: 'block' }}>!</span>
                      <div style={{ fontSize: '10px', color: COLORS.error, padding: '0 8px' }}>
                        {item.error || 'Failed'}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Pending - show test pattern */
                  <TestPatternPlaceholder width={sourceWidth || 1024} height={sourceHeight || 1024} />
                )}

                {/* Index badge */}
                <div style={{
                  position: 'absolute',
                  top: '8px',
                  left: '8px',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.7)',
                  color: COLORS.textPrimary,
                  fontSize: '11px',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2
                }}>
                  {index + 1}
                </div>
              </div>

              {/* Info bar */}
              <div style={{
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0
              }}>
                <div style={{
                  fontSize: '10px',
                  color: COLORS.textMuted,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {azimuth.label} / {elevation.label} / {distance.label}
                </div>

                {/* Version nav + Regenerate */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {item.versionHistory.length > 1 && (
                    <>
                      <button
                        onClick={() => onVersionChange(index, Math.max(0, item.selectedVersion - 1))}
                        disabled={item.selectedVersion === 0}
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '4px',
                          border: 'none',
                          background: 'transparent',
                          color: item.selectedVersion > 0 ? COLORS.textSecondary : COLORS.textMuted,
                          cursor: item.selectedVersion > 0 ? 'pointer' : 'default',
                          fontSize: '10px',
                          padding: 0
                        }}
                      >
                        ‹
                      </button>
                      <span style={{ fontSize: '9px', color: COLORS.textMuted }}>
                        {item.selectedVersion + 1}/{item.versionHistory.length}
                      </span>
                      <button
                        onClick={() => onVersionChange(index, Math.min(item.versionHistory.length - 1, item.selectedVersion + 1))}
                        disabled={item.selectedVersion >= item.versionHistory.length - 1}
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '4px',
                          border: 'none',
                          background: 'transparent',
                          color: item.selectedVersion < item.versionHistory.length - 1 ? COLORS.textSecondary : COLORS.textMuted,
                          cursor: item.selectedVersion < item.versionHistory.length - 1 ? 'pointer' : 'default',
                          fontSize: '10px',
                          padding: 0
                        }}
                      >
                        ›
                      </button>
                    </>
                  )}
                  {(item.status === 'ready' || item.status === 'failed') && (
                    <button
                      onClick={() => onRegenerate(index)}
                      title="Regenerate"
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: 'none',
                        background: COLORS.surfaceLight,
                        color: COLORS.textSecondary,
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: '500',
                        fontFamily: 'inherit'
                      }}
                    >
                      ↻ Redo
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom actions - fixed */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        borderTop: `1px solid ${COLORS.borderLight}`,
        flexShrink: 0
      }}>
        <button
          onClick={onBack}
          disabled={isGenerating}
          style={{
            padding: '10px 20px',
            borderRadius: '10px',
            border: `1px solid ${COLORS.border}`,
            background: 'transparent',
            color: COLORS.textSecondary,
            cursor: isGenerating ? 'default' : 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            fontFamily: 'inherit',
            opacity: isGenerating ? 0.5 : 1
          }}
        >
          Back
        </button>

        <button
          onClick={onProceed}
          disabled={!allReady}
          style={{
            padding: '10px 24px',
            borderRadius: '10px',
            border: 'none',
            background: allReady ? COLORS.accent : COLORS.surfaceLight,
            color: allReady ? COLORS.black : COLORS.textMuted,
            cursor: allReady ? 'pointer' : 'default',
            fontSize: '13px',
            fontWeight: '700',
            fontFamily: 'inherit',
            transition: 'all 0.15s ease'
          }}
        >
          Generate Transitions
        </button>
      </div>

      <style>{`
        @keyframes camera360Pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
};

export default Camera360AngleReviewStep;
