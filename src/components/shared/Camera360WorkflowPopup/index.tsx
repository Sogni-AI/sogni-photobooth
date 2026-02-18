/**
 * Camera360WorkflowPopup
 *
 * Main popup shell for the 360 Camera video generation workflow.
 * Full-width overlay with step navigation and phase-specific content.
 *
 * When opened from gallery view (no single photo selected), uses all gallery photos
 * as thumbnails for angle slots, cycling through them.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useCamera360Workflow } from '../../../hooks/useCamera360Workflow';
import { COLORS } from '../../../constants/camera360Settings';
import Camera360ConfigStep from './Camera360ConfigStep';
import Camera360AngleReviewStep from './Camera360AngleReviewStep';
import Camera360TransitionReviewStep from './Camera360TransitionReviewStep';
import Camera360FinalVideoStep from './Camera360FinalVideoStep';
import type { Camera360Step } from '../../../types/camera360';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Camera360WorkflowPopupProps {
  visible: boolean;
  /** Primary source image URL (from selected photo, or first gallery photo) */
  sourceImageUrl: string;
  /** All available gallery photo URLs (for assigning thumbnails to angle slots) */
  galleryPhotoUrls?: string[];
  sourceWidth: number;
  sourceHeight: number;
  sogniClient: any;
  onClose: () => void;
  onOutOfCredits?: () => void;
}

const STEP_LABELS: Record<Camera360Step, string> = {
  'configure-angles': 'configure angles',
  'review-angles': 'generating angles',
  'review-transitions': 'transitions',
  'final-video': 'final video'
};

const STEP_ORDER: Camera360Step[] = [
  'configure-angles',
  'review-angles',
  'review-transitions',
  'final-video'
];

const Camera360WorkflowPopup: React.FC<Camera360WorkflowPopupProps> = ({
  visible,
  sourceImageUrl,
  galleryPhotoUrls = [],
  sourceWidth,
  sourceHeight,
  sogniClient,
  onClose,
  onOutOfCredits
}) => {
  const workflow = useCamera360Workflow({
    sourceImageUrl,
    galleryPhotoUrls,
    sourceWidth,
    sourceHeight,
    sogniClient,
    onOutOfCredits
  });

  // Build per-slot thumbnail URLs: cycle through gallery photos, fallback to sourceImageUrl
  const slotThumbnailUrls = useMemo(() => {
    const photos = galleryPhotoUrls.length > 0 ? galleryPhotoUrls : [sourceImageUrl];
    return workflow.angles.map((_, i) => photos[i % photos.length]);
  }, [galleryPhotoUrls, sourceImageUrl, workflow.angles]);

  const handleClose = useCallback(() => {
    workflow.abort();
    onClose();
  }, [onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape key handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && visible) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, handleClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }, [handleClose]);

  if (!visible) return null;

  const currentStepIndex = STEP_ORDER.indexOf(workflow.step);
  const isFinalVideoStep = workflow.step === 'final-video';

  const renderStep = () => {
    switch (workflow.step) {
      case 'configure-angles':
        return (
          <Camera360ConfigStep
            angles={workflow.angles}
            presetKey={workflow.presetKey}
            slotThumbnailUrls={slotThumbnailUrls}
            onSelectPreset={workflow.selectPreset}
            onUpdateAngle={workflow.updateAngle}
            onRemoveAngle={workflow.removeAngle}
            onAddAngle={workflow.addAngle}
            onGenerate={workflow.startAngleGeneration}
            generatableAngleCount={workflow.generatableAngleCount}
            isGenerating={workflow.isGeneratingAngles}
            sourceWidth={sourceWidth}
            sourceHeight={sourceHeight}
          />
        );
      case 'review-angles':
        return (
          <Camera360AngleReviewStep
            angleItems={workflow.angleItems}
            sourceImageUrl={sourceImageUrl}
            isGenerating={workflow.isGeneratingAngles}
            allReady={workflow.allAnglesReady}
            onRegenerate={workflow.regenerateAngle}
            onVersionChange={workflow.selectAngleVersion}
            onProceed={workflow.proceedToTransitions}
            onBack={workflow.goBack}
            sourceWidth={sourceWidth}
            sourceHeight={sourceHeight}
          />
        );
      case 'review-transitions':
        return (
          <Camera360TransitionReviewStep
            transitions={workflow.transitions}
            angleImageUrls={workflow.getAngleImageUrls()}
            isGenerating={workflow.isGeneratingTransitions}
            allReady={workflow.allTransitionsReady}
            onRegenerate={workflow.regenerateTransition}
            onVersionChange={workflow.selectTransitionVersion}
            onProceed={workflow.stitchFinalVideo}
            onBack={workflow.goBack}
            sourceWidth={sourceWidth}
            sourceHeight={sourceHeight}
            settings={workflow.transitionSettings}
            onUpdateSettings={workflow.updateTransitionSettings}
            onGenerate={workflow.startTransitionGeneration}
          />
        );
      case 'final-video':
        return (
          <Camera360FinalVideoStep
            videoUrl={workflow.finalVideoUrl}
            videoBlob={workflow.finalVideoBlob}
            isStitching={workflow.isStitching}
            progress={workflow.stitchingProgress}
            musicPresetId={workflow.transitionSettings.musicPresetId}
            onBack={workflow.goBack}
            onStartOver={workflow.resetWorkflow}
            onClose={handleClose}
            onRestitchWithMusic={workflow.restitchWithMusic}
          />
        );
      default:
        return null;
    }
  };

  const popup = (
    <div
      className="camera360-popup-backdrop"
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: isFinalVideoStep ? '#000' : 'rgba(0, 0, 0, 0.92)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 9999999,
        animation: 'camera360FadeIn 0.2s ease'
      }}
    >
      <div
        className="camera360-popup"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: isFinalVideoStep ? '#000' : COLORS.surface,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: '"SF Mono", "Monaco", "Inconsolata", "Fira Mono", monospace'
        }}
      >
        {/* Header - hidden during final video for full-screen experience */}
        {!isFinalVideoStep && (
          <div style={{
            padding: '12px 20px',
            borderBottom: `1px solid ${COLORS.borderLight}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <span style={{ fontSize: '18px', flexShrink: 0 }}>📷</span>
              <div style={{ minWidth: 0 }}>
                <h2 style={{
                  margin: 0,
                  fontSize: '15px',
                  fontWeight: '700',
                  color: COLORS.textPrimary,
                  fontFamily: '"Permanent Marker", cursive',
                  letterSpacing: '0.3px',
                  whiteSpace: 'nowrap'
                }}>
                  360 Camera
                </h2>
                <p style={{
                  margin: '1px 0 0',
                  fontSize: '11px',
                  color: COLORS.textMuted,
                  fontWeight: '500',
                  whiteSpace: 'nowrap'
                }}>
                  {STEP_LABELS[workflow.step]}
                </p>
              </div>
            </div>

            {/* Step indicators */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flex: '0 0 auto',
              margin: '0 12px'
            }}>
              {STEP_ORDER.map((s, i) => (
                <div
                  key={s}
                  style={{
                    width: i === currentStepIndex ? '20px' : '8px',
                    height: '6px',
                    borderRadius: '3px',
                    background: i <= currentStepIndex ? COLORS.accent : COLORS.surfaceLight,
                    transition: 'all 0.3s ease'
                  }}
                />
              ))}
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
                transition: 'all 0.15s ease',
                flexShrink: 0
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Content - flex:1 fills remaining height */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 0
        }}>
          {renderStep()}
        </div>
      </div>

      <style>{`
        @keyframes camera360FadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );

  return createPortal(popup, document.body);
};

export default Camera360WorkflowPopup;
