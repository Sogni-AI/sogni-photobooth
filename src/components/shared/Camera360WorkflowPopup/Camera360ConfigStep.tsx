/**
 * Camera360ConfigStep (Phase 1)
 *
 * Configure camera angle presets and individual angle slots.
 * Horizontal scroll-snap carousel matching sogni-360's layout.
 */

import React, { useCallback } from 'react';
import type { AngleSlot } from '../../../types/cameraAngle';
import type { VideoResolution, VideoQualityPreset } from '../../../constants/videoSettings';
import { MULTI_ANGLE_PRESETS, MAX_ANGLES } from '../../../constants/cameraAngleSettings';
import { COLORS } from '../../../constants/camera360Settings';
import AngleSlotCard from '../AngleSlotCard';
import VideoSettingsFooter from '../VideoSettingsFooter';
import { useCameraAngleCostEstimation } from '../../../hooks/useCameraAngleCostEstimation';
import { getPaymentMethod } from '../../../services/walletService';

interface Camera360ConfigStepProps {
  angles: AngleSlot[];
  presetKey: string;
  slotThumbnailUrls: string[];
  onSelectPreset: (key: string) => void;
  onUpdateAngle: (index: number, slot: AngleSlot) => void;
  onRemoveAngle: (index: number) => void;
  onAddAngle: () => void;
  onGenerate: () => void;
  generatableAngleCount: number;
  isGenerating: boolean;
  sourceWidth: number;
  sourceHeight: number;
  /** Video resolution setting for the upcoming transitions */
  resolution: VideoResolution;
  /** Video quality preset for the upcoming transitions */
  quality: VideoQualityPreset;
  /** Callback to change the resolution */
  onResolutionChange: (resolution: string) => void;
  /** Callback to change the quality */
  onQualityChange: (quality: string) => void;
  /** In batch mode, the available gallery photos to pick from */
  galleryPhotoUrls?: string[];
  /** Index of the currently selected source photo in galleryPhotoUrls */
  selectedSourceIndex?: number;
  /** Callback to change the selected source photo */
  onSelectSourcePhoto?: (index: number) => void;
}

const Camera360ConfigStep: React.FC<Camera360ConfigStepProps> = ({
  angles,
  presetKey,
  slotThumbnailUrls,
  onSelectPreset,
  onUpdateAngle,
  onRemoveAngle,
  onAddAngle,
  onGenerate,
  generatableAngleCount,
  isGenerating,
  sourceWidth,
  sourceHeight,
  resolution,
  quality,
  onResolutionChange,
  onQualityChange,
  galleryPhotoUrls,
  selectedSourceIndex = 0,
  onSelectSourcePhoto
}) => {
  const tokenType = getPaymentMethod();

  const { formattedCost, loading: costLoading } = useCameraAngleCostEstimation({
    width: sourceWidth || 1024,
    height: sourceHeight || 1024,
    jobCount: generatableAngleCount,
    enabled: generatableAngleCount > 0
  });

  const handleSlotChange = useCallback((index: number) => (slot: AngleSlot) => {
    onUpdateAngle(index, slot);
  }, [onUpdateAngle]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      overflow: 'hidden',
      minHeight: 0
    }}>
      {/* Source photo picker - shown in batch mode when multiple gallery photos exist */}
      {galleryPhotoUrls && galleryPhotoUrls.length > 1 && onSelectSourcePhoto && (
        <div style={{
          padding: '10px 20px',
          flexShrink: 0,
          borderBottom: `1px solid ${COLORS.borderLight}`
        }}>
          <div style={{
            fontSize: '11px',
            color: COLORS.textMuted,
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '8px'
          }}>
            Source Photo
          </div>
          <div style={{
            display: 'flex',
            gap: '6px',
            overflowX: 'auto',
            paddingBottom: '4px'
          }}>
            {galleryPhotoUrls.map((url, index) => (
              <button
                key={index}
                onClick={() => onSelectSourcePhoto(index)}
                style={{
                  flexShrink: 0,
                  height: '48px',
                  borderRadius: '8px',
                  border: `2px solid ${index === selectedSourceIndex ? COLORS.accent : 'transparent'}`,
                  padding: 0,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  background: 'transparent',
                  opacity: index === selectedSourceIndex ? 1 : 0.5,
                  transition: 'all 0.15s ease'
                }}
              >
                <img
                  src={url}
                  alt={`Photo ${index + 1}`}
                  style={{
                    height: '100%',
                    width: 'auto',
                    display: 'block'
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Preset selector - fixed top bar */}
      <div style={{
        padding: '12px 20px',
        flexShrink: 0,
        borderBottom: `1px solid ${COLORS.borderLight}`
      }}>
        <div style={{
          fontSize: '11px',
          color: COLORS.textMuted,
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '8px'
        }}>
          Preset
        </div>
        <div style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '4px'
        }}>
          {MULTI_ANGLE_PRESETS.map(preset => (
            <button
              key={preset.key}
              onClick={() => onSelectPreset(preset.key)}
              style={{
                padding: '8px 14px',
                borderRadius: '20px',
                border: `1px solid ${preset.key === presetKey ? COLORS.accent : COLORS.border}`,
                background: preset.key === presetKey ? COLORS.accentSoft : 'transparent',
                color: preset.key === presetKey ? COLORS.accent : COLORS.textSecondary,
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '600',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                fontFamily: 'inherit',
                flexShrink: 0
              }}
            >
              {preset.icon} {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Angle cards - horizontal scroll on mobile, wrapping grid on desktop */}
      <div
        className="camera360-config-carousel"
        style={{
          flex: 1,
          display: 'flex',
          gap: '20px',
          padding: '20px 24px',
          overflowX: 'auto',
          overflowY: 'visible',
          alignItems: 'flex-start',
          scrollSnapType: 'x mandatory',
          scrollPadding: '0 24px',
          WebkitOverflowScrolling: 'touch',
          minHeight: 0
        }}
      >
        {angles.map((slot, index) => (
          <div
            key={slot.id}
            className="camera360-config-card-wrapper"
            style={{
              flexShrink: 0,
              scrollSnapAlign: 'center'
            }}
          >
            <AngleSlotCard
              index={index + 1}
              slot={slot}
              thumbnailUrl={slotThumbnailUrls[index] || slotThumbnailUrls[0]}
              onChange={handleSlotChange(index)}
              onRemove={() => onRemoveAngle(index)}
              showRemove={angles.length > 2}
            />
          </div>
        ))}

        {/* Add angle button */}
        {angles.length < MAX_ANGLES && (
          <button
            onClick={onAddAngle}
            style={{
              flexShrink: 0,
              scrollSnapAlign: 'center',
              border: `2px dashed ${COLORS.border}`,
              borderRadius: '16px',
              background: 'transparent',
              color: COLORS.textMuted,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              minWidth: '200px',
              minHeight: '200px',
              fontSize: '12px',
              fontWeight: '500',
              transition: 'all 0.15s ease',
              fontFamily: 'inherit'
            }}
          >
            <span style={{ fontSize: '28px' }}>+</span>
            Add Angle
          </button>
        )}
      </div>

      {/* Footer row 1: VideoSettingsFooter pills + cost */}
      <div style={{
        padding: '6px 20px',
        borderTop: `1px solid ${COLORS.borderLight}`,
        flexShrink: 0
      }}>
        {/* @ts-expect-error VideoSettingsFooter is JSX without type declarations */}
        <VideoSettingsFooter
          videoCount={generatableAngleCount}
          countLabel="angle"
          cost={formattedCost ? parseFloat(formattedCost) : null}
          loading={costLoading}
          colorScheme="dark"
          tokenType={tokenType}
          showDuration={false}
          showResolution={true}
          showQuality={true}
          resolution={resolution}
          onResolutionChange={onResolutionChange}
          quality={quality}
          onQualityChange={onQualityChange}
        />
      </div>

      {/* Footer row 2: Generate button */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '8px 20px 12px',
        flexShrink: 0
      }}>
        <button
          onClick={onGenerate}
          disabled={generatableAngleCount === 0 || isGenerating}
          style={{
            padding: '10px 24px',
            borderRadius: '10px',
            border: 'none',
            background: generatableAngleCount > 0 && !isGenerating ? COLORS.accent : COLORS.surfaceLight,
            color: generatableAngleCount > 0 && !isGenerating ? COLORS.black : COLORS.textMuted,
            cursor: generatableAngleCount > 0 && !isGenerating ? 'pointer' : 'default',
            fontSize: '13px',
            fontWeight: '700',
            transition: 'all 0.15s ease',
            fontFamily: 'inherit'
          }}
        >
          {isGenerating ? 'Generating...' : `Generate ${generatableAngleCount} Angle${generatableAngleCount !== 1 ? 's' : ''}`}
        </button>
      </div>

      <style>{`
        .camera360-config-carousel::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default Camera360ConfigStep;
