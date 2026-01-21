/**
 * CameraAnglePopup
 *
 * Popup for generating images from different camera angles using the Multiple Angles LoRA.
 * Features:
 * - Source image preview
 * - Interactive 3D camera control
 * - Cost estimation display
 * - Batch support
 * - Multi-angle mode with presets
 *
 * Styled with Starface-inspired aesthetic: bold yellow/black, rounded elements, lowercase text
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import CameraAngle3DControl from './CameraAngle3DControl';
import AngleSlotCard from './AngleSlotCard';
import { useCameraAngleCostEstimation } from '../../hooks/useCameraAngleCostEstimation';
import { getTokenLabel } from '../../services/walletService';
import {
  type AzimuthKey,
  type ElevationKey,
  type DistanceKey,
  getAzimuthConfig,
  getElevationConfig,
  getDistanceConfig,
  MAX_ANGLES,
  MULTI_ANGLE_PRESETS
} from '../../constants/cameraAngleSettings';
import type { AngleSlot, AngleSelectionMode } from '../../types/cameraAngle';

interface CameraAnglePopupProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (params: CameraAngleGenerationParams) => void;
  onMultiAngleConfirm?: (angles: AngleSlot[], mode: AngleSelectionMode) => void;
  isBatch?: boolean;
  itemCount?: number;
  tokenType?: 'spark' | 'sogni';
  imageWidth?: number;
  imageHeight?: number;
  /** Single source photo URL (for single image mode) */
  sourcePhotoUrl?: string;
  /** Array of source photo URLs (for batch mode - one per image) */
  sourcePhotoUrls?: string[];
}

export interface CameraAngleGenerationParams {
  azimuth: AzimuthKey;
  elevation: ElevationKey;
  distance: DistanceKey;
  azimuthPrompt: string;
  elevationPrompt: string;
  distancePrompt: string;
  loraStrength: number;
}

// Refined color palette - elegant dark theme
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
  borderLight: 'rgba(255, 255, 255, 0.06)'
};

// Generate unique ID for angle slots
let angleSlotIdCounter = 0;
const generateSlotId = () => `slot-${++angleSlotIdCounter}-${Date.now()}`;

const CameraAnglePopup: React.FC<CameraAnglePopupProps> = ({
  visible,
  onClose,
  onConfirm,
  onMultiAngleConfirm,
  isBatch = false,
  itemCount = 1,
  tokenType = 'spark',
  imageWidth = 1024,
  imageHeight = 1024,
  sourcePhotoUrl,
  sourcePhotoUrls
}) => {
  // Camera angle state - default to front, eye-level, close-up
  const [azimuth, setAzimuth] = useState<AzimuthKey>('front');
  const [elevation, setElevation] = useState<ElevationKey>('eye-level');
  const [distance, setDistance] = useState<DistanceKey>('close-up');

  // Multi-angle mode state
  const [sameAngleForAll, setSameAngleForAll] = useState(true);
  const [angleSlots, setAngleSlots] = useState<AngleSlot[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>('');

  // Treat single-item batch as single image mode
  const isMultipleImages = isBatch && itemCount > 1;

  // Determine current mode
  const mode: AngleSelectionMode = useMemo(() => {
    if (isMultipleImages && !sameAngleForAll) return 'per-image';
    if (!isMultipleImages && angleSlots.length > 0) return 'multiple';
    return 'same';
  }, [isMultipleImages, sameAngleForAll, angleSlots.length]);

  // Count angles that will actually generate (excluding isOriginal)
  const generatedAngleCount = useMemo(() => {
    return angleSlots.filter(slot => !slot.isOriginal).length;
  }, [angleSlots]);

  // Calculate total job count based on mode (only count non-isOriginal slots)
  const totalJobCount = useMemo(() => {
    if (mode === 'same') {
      return isMultipleImages ? itemCount : 1;
    }
    if (mode === 'per-image') {
      // Only count slots that will actually generate (not isOriginal)
      return generatedAngleCount;
    }
    if (mode === 'multiple') {
      // Single image generates multiple angles (only non-isOriginal)
      return generatedAngleCount;
    }
    return 1;
  }, [mode, isMultipleImages, itemCount, generatedAngleCount]);

  // Cost estimation
  const { cost, costInUSD, loading: costLoading } = useCameraAngleCostEstimation({
    width: imageWidth,
    height: imageHeight,
    jobCount: totalJobCount,
    enabled: visible
  });

  // Reset state when popup opens
  useEffect(() => {
    if (visible) {
      setAzimuth('front');
      setElevation('eye-level');
      setDistance('close-up');
      setSameAngleForAll(true);
      setAngleSlots([]);
      setSelectedPreset('');
    }
  }, [visible]);

  // Initialize angle slots when switching to per-image mode in batch
  // Each image needs its own angle slot, so we create itemCount slots
  useEffect(() => {
    if (isMultipleImages && !sameAngleForAll && angleSlots.length === 0) {
      // Auto-select custom mode and create one slot per image
      setSelectedPreset('custom');
      const initialSlots: AngleSlot[] = [];
      for (let i = 0; i < itemCount; i++) {
        initialSlots.push({
          id: generateSlotId(),
          azimuth: 'front',
          elevation: 'eye-level',
          distance: i === 0 ? 'close-up' : 'wide',
          // First slot uses original perspective by default
          isOriginal: i === 0
        });
      }
      setAngleSlots(initialSlots);
    }
  }, [sameAngleForAll, isMultipleImages, itemCount]);

  // Handle preset selection
  // In per-image mode, ensure we have at least itemCount slots
  const handlePresetSelect = useCallback((presetKey: string) => {
    setSelectedPreset(presetKey);
    if (!presetKey) {
      setAngleSlots([]);
      return;
    }

    // Calculate minimum slots needed (in per-image mode, need at least itemCount)
    const minSlots = mode === 'per-image' ? itemCount : 2;

    // Handle custom preset - start with original + additional angles
    if (presetKey === 'custom') {
      const customSlots: AngleSlot[] = [];
      for (let i = 0; i < Math.max(minSlots, 2); i++) {
        customSlots.push({
          id: generateSlotId(),
          azimuth: 'front',
          elevation: 'eye-level',
          distance: i === 0 ? 'close-up' : 'wide',
          isOriginal: i === 0
        });
      }
      setAngleSlots(customSlots);
      return;
    }

    const preset = MULTI_ANGLE_PRESETS.find(p => p.key === presetKey);
    if (preset) {
      const newSlots: AngleSlot[] = preset.angles.map(angle => ({
        id: generateSlotId(),
        azimuth: angle.azimuth,
        elevation: angle.elevation,
        distance: angle.distance,
        isOriginal: angle.isOriginal
      }));

      // In per-image mode, pad to itemCount if preset has fewer angles
      if (mode === 'per-image' && newSlots.length < itemCount) {
        for (let i = newSlots.length; i < itemCount; i++) {
          // Cycle through preset angles to fill remaining slots
          const templateSlot = preset.angles[i % preset.angles.length];
          newSlots.push({
            id: generateSlotId(),
            azimuth: templateSlot.azimuth,
            elevation: templateSlot.elevation,
            distance: templateSlot.distance,
            isOriginal: templateSlot.isOriginal
          });
        }
      }

      setAngleSlots(newSlots);
    }
  }, [mode, itemCount]);

  // Handle adding a new angle slot
  const handleAddAngle = useCallback(() => {
    if (angleSlots.length >= MAX_ANGLES) return;

    setAngleSlots(prev => [...prev, {
      id: generateSlotId(),
      azimuth: 'front',
      elevation: 'eye-level',
      distance: 'medium'
    }]);
    setSelectedPreset(''); // Clear preset when manually adding
  }, [angleSlots.length]);

  // Handle removing an angle slot
  // In per-image mode, cannot remove below itemCount (each image needs a slot)
  // In multiple mode, cannot remove if only 1 slot remains
  const handleRemoveAngle = useCallback((slotId: string) => {
    setAngleSlots(prev => {
      // In per-image mode, don't allow removing below itemCount
      if (mode === 'per-image' && prev.length <= itemCount) {
        return prev;
      }
      // In multiple mode, don't allow removing the last slot
      if (mode === 'multiple' && prev.length <= 1) {
        return prev;
      }
      return prev.filter(slot => slot.id !== slotId);
    });
    setSelectedPreset(''); // Clear preset when manually removing
  }, [mode, itemCount]);

  // Handle updating an angle slot
  const handleUpdateAngle = useCallback((updatedSlot: AngleSlot) => {
    setAngleSlots(prev => prev.map(slot =>
      slot.id === updatedSlot.id ? updatedSlot : slot
    ));
    setSelectedPreset(''); // Clear preset when manually editing
  }, []);

  // Handle confirm for single angle mode
  const handleConfirm = useCallback(() => {
    const azimuthConfig = getAzimuthConfig(azimuth);
    const elevationConfig = getElevationConfig(elevation);
    const distanceConfig = getDistanceConfig(distance);

    onConfirm({
      azimuth,
      elevation,
      distance,
      azimuthPrompt: azimuthConfig.prompt,
      elevationPrompt: elevationConfig.prompt,
      distancePrompt: distanceConfig.prompt,
      loraStrength: 0.9 // Default strength
    });
  }, [azimuth, elevation, distance, onConfirm]);

  // Handle confirm for multi-angle mode
  const handleMultiAngleConfirm = useCallback(() => {
    if (onMultiAngleConfirm && angleSlots.length > 0) {
      onMultiAngleConfirm(angleSlots, mode);
    }
  }, [onMultiAngleConfirm, angleSlots, mode]);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && visible) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  // Show multi-angle UI for:
  // 1. Single image with onMultiAngleConfirm callback
  // 2. Batch mode with "different angle per image" selected
  const showMultiAngleUI = (!isMultipleImages && onMultiAngleConfirm) || (isMultipleImages && !sameAngleForAll);

  if (!visible) return null;

  const popup = (
    <div
      className="camera-angle-popup-backdrop"
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999999,
        padding: '16px',
        animation: 'cameraAngleFadeIn 0.2s ease'
      }}
    >
      <div
        className="camera-angle-popup"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.surface,
          borderRadius: '20px',
          border: `1px solid ${COLORS.border}`,
          width: '100%',
          maxWidth: showMultiAngleUI && angleSlots.length > 0 ? '720px' : '420px',
          maxHeight: 'calc(100vh - 32px)',
          overflow: 'auto',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6), 0 0 1px rgba(255, 255, 255, 0.1)',
          animation: 'cameraAngleSlideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          fontFamily: '"SF Mono", "Monaco", "Inconsolata", "Fira Mono", monospace',
          transition: 'max-width 0.3s ease'
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
              📷
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
                3D Camera Angle
              </h2>
              <p style={{
                margin: '2px 0 0',
                fontSize: '11px',
                color: COLORS.textMuted,
                textTransform: 'lowercase',
                fontWeight: '500'
              }}>
                {isMultipleImages
                  ? (sameAngleForAll
                      ? `re-render ${itemCount} images`
                      : `generate ${generatedAngleCount} angle${generatedAngleCount !== 1 ? 's' : ''} from ${itemCount} image${itemCount !== 1 ? 's' : ''}`)
                  : angleSlots.length > 0
                    ? `generate ${generatedAngleCount} angle${generatedAngleCount !== 1 ? 's' : ''} from 1 image`
                    : 're-render from a new angle'}
              </p>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
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
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
              e.currentTarget.style.color = COLORS.textPrimary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = COLORS.surfaceLight;
              e.currentTarget.style.color = COLORS.textSecondary;
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '16px 20px' }}>
          {/* Multi-Angle Mode Toggle for Batch (only when more than 1 image) */}
          {isMultipleImages && (
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '16px',
              padding: '12px',
              background: COLORS.surfaceLight,
              borderRadius: '10px',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={sameAngleForAll}
                onChange={(e) => {
                  setSameAngleForAll(e.target.checked);
                  if (e.target.checked) {
                    // Clear angle slots when switching back to same angle mode
                    setAngleSlots([]);
                    setSelectedPreset('');
                  }
                }}
                style={{
                  width: '18px',
                  height: '18px',
                  accentColor: COLORS.accent,
                  cursor: 'pointer'
                }}
              />
              <span style={{
                fontSize: '12px',
                color: COLORS.textSecondary,
                textTransform: 'lowercase',
                fontWeight: '500'
              }}>
                same angle for every image
              </span>
            </label>
          )}

          {/* Multi-Angle Preset Selector */}
          {showMultiAngleUI && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px'
              }}>
                <span style={{
                  fontSize: '11px',
                  color: COLORS.textMuted,
                  textTransform: 'lowercase',
                  fontWeight: '600'
                }}>
                  multi-angle presets
                </span>
                <span style={{
                  fontSize: '10px',
                  color: COLORS.textMuted,
                  fontWeight: '500'
                }}>
                  {angleSlots.length > 0 ? `${generatedAngleCount} angle${generatedAngleCount !== 1 ? 's' : ''}` : `max ${MAX_ANGLES}`}
                </span>
              </div>

              <div style={{
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap'
              }}>
                {MULTI_ANGLE_PRESETS.map(preset => (
                  <button
                    key={preset.key}
                    onClick={() => handlePresetSelect(preset.key === selectedPreset ? '' : preset.key)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${preset.key === selectedPreset ? COLORS.accent : COLORS.border}`,
                      background: preset.key === selectedPreset ? COLORS.accentSoft : 'transparent',
                      color: preset.key === selectedPreset ? COLORS.accent : COLORS.textSecondary,
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: '500',
                      textTransform: 'lowercase',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                    title={preset.description}
                  >
                    <span>{preset.icon}</span>
                    <span>{preset.label.toLowerCase()}</span>
                  </button>
                ))}
                {/* Custom option */}
                <button
                  onClick={() => handlePresetSelect(selectedPreset === 'custom' ? '' : 'custom')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${selectedPreset === 'custom' ? COLORS.accent : COLORS.border}`,
                    background: selectedPreset === 'custom' ? COLORS.accentSoft : 'transparent',
                    color: selectedPreset === 'custom' ? COLORS.accent : COLORS.textSecondary,
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '500',
                    textTransform: 'lowercase',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  title="Create your own custom angles"
                >
                  <span>✏️</span>
                  <span>custom</span>
                </button>
              </div>
            </div>
          )}

          {/* Single Angle Camera Controls (when not in multi-angle mode) */}
          {(mode === 'same' && angleSlots.length === 0) && (
            <CameraAngle3DControl
              azimuth={azimuth}
              elevation={elevation}
              distance={distance}
              onAzimuthChange={setAzimuth}
              onElevationChange={setElevation}
              onDistanceChange={setDistance}
            />
          )}

          {/* Multi-Angle Slots List - Horizontal Scrolling */}
          {showMultiAngleUI && angleSlots.length > 0 && (
            <div style={{ marginTop: '12px', position: 'relative' }}>
              {/* Scroll container */}
              <div style={{
                display: 'flex',
                gap: '16px',
                overflowX: 'auto',
                overflowY: 'visible',
                padding: '16px 60px 8px 4px',
                scrollSnapType: 'x mandatory',
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'thin',
                scrollbarColor: `${COLORS.textMuted} transparent`
              }}>
                {angleSlots.map((slot, idx) => {
                  // In per-image mode, use individual thumbnails from sourcePhotoUrls
                  // Loop images if there are more slots than images (user added extra slots)
                  const thumbnailIndex = sourcePhotoUrls && sourcePhotoUrls.length > 0
                    ? idx % sourcePhotoUrls.length
                    : 0;
                  const thumbnail = mode === 'per-image' && sourcePhotoUrls
                    ? sourcePhotoUrls[thumbnailIndex]
                    : sourcePhotoUrl;

                  // In per-image mode, only show remove if we have more slots than images
                  // In multiple mode, show remove if more than 1 slot
                  const canRemove = mode === 'per-image'
                    ? angleSlots.length > itemCount
                    : angleSlots.length > 1;

                  return (
                    <AngleSlotCard
                      key={slot.id}
                      index={idx + 1}
                      slot={slot}
                      thumbnailUrl={thumbnail}
                      onChange={handleUpdateAngle}
                      onRemove={() => handleRemoveAngle(slot.id)}
                      showRemove={canRemove}
                    />
                  );
                })}

                {/* Add Angle Card */}
                {angleSlots.length < MAX_ANGLES && (
                  <button
                    onClick={handleAddAngle}
                    style={{
                      minWidth: '200px',
                      height: '340px',
                      borderRadius: '16px',
                      border: `2px dashed ${COLORS.border}`,
                      background: 'transparent',
                      color: COLORS.textSecondary,
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '500',
                      textTransform: 'lowercase',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      flexShrink: 0
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = COLORS.accent;
                      e.currentTarget.style.color = COLORS.accent;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = COLORS.border;
                      e.currentTarget.style.color = COLORS.textSecondary;
                    }}
                  >
                    <span style={{ fontSize: '24px' }}>+</span>
                    <span>add angle</span>
                  </button>
                )}
              </div>

              {/* Scroll hint - fade gradient on right edge */}
              <div style={{
                position: 'absolute',
                top: '16px',
                right: 0,
                bottom: '8px',
                width: '60px',
                background: `linear-gradient(to right, transparent, ${COLORS.surface})`,
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingRight: '8px'
              }}>
                <span style={{
                  color: COLORS.textMuted,
                  fontSize: '20px',
                  opacity: 0.7
                }}>
                  →
                </span>
              </div>

              {/* Scroll indicator dots */}
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '6px',
                marginTop: '8px'
              }}>
                {angleSlots.map((slot, idx) => (
                  <div
                    key={slot.id}
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: idx === 0 ? COLORS.accent : COLORS.textMuted,
                      opacity: idx === 0 ? 1 : 0.5,
                      transition: 'all 0.15s ease'
                    }}
                  />
                ))}
                {angleSlots.length < MAX_ANGLES && (
                  <div style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: COLORS.textMuted,
                    opacity: 0.3
                  }} />
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer with Actions and Cost */}
        <div style={{
          padding: '16px 20px',
          borderTop: `1px solid ${COLORS.borderLight}`,
          background: COLORS.surfaceLight
        }}>
          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            gap: '10px',
            marginBottom: '14px'
          }}>
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '12px',
                border: `1px solid ${COLORS.border}`,
                background: 'transparent',
                color: COLORS.textSecondary,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                textTransform: 'lowercase',
                letterSpacing: '0.3px',
                transition: 'all 0.15s ease',
                fontFamily: 'inherit'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.color = COLORS.textPrimary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = COLORS.textSecondary;
              }}
            >
              cancel
            </button>

            <button
              onClick={angleSlots.length > 0 ? handleMultiAngleConfirm : handleConfirm}
              disabled={mode === 'multiple' && angleSlots.length === 0}
              style={{
                flex: 2,
                padding: '12px 16px',
                borderRadius: '12px',
                border: 'none',
                background: (mode === 'multiple' && angleSlots.length === 0)
                  ? COLORS.textMuted
                  : COLORS.accent,
                color: COLORS.black,
                cursor: (mode === 'multiple' && angleSlots.length === 0)
                  ? 'not-allowed'
                  : 'pointer',
                fontSize: '13px',
                fontWeight: '600',
                textTransform: 'lowercase',
                letterSpacing: '0.3px',
                transition: 'all 0.15s ease',
                fontFamily: 'inherit'
              }}
              onMouseEnter={(e) => {
                if (!(mode === 'multiple' && angleSlots.length === 0)) {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(253, 255, 0, 0.25)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              generate {generatedAngleCount > 1 ? `${generatedAngleCount} angles` : isMultipleImages ? 'all' : ''}
            </button>
          </div>

          {/* Cost Display - below buttons */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{
              fontSize: '12px',
              color: COLORS.textMuted,
              textTransform: 'lowercase',
              fontWeight: '500'
            }}>
              {mode === 'multiple' && angleSlots.length > 0
                ? `${generatedAngleCount} angle${generatedAngleCount !== 1 ? 's' : ''} × 1 image`
                : mode === 'per-image' && angleSlots.length > 0
                  ? `${generatedAngleCount} angle${generatedAngleCount !== 1 ? 's' : ''} × ${itemCount} image${itemCount !== 1 ? 's' : ''}`
                  : `${totalJobCount} image${totalJobCount > 1 ? 's' : ''}`
              }
            </span>
            <div style={{ textAlign: 'right' }}>
              {costLoading ? (
                <span style={{
                  fontSize: '12px',
                  color: COLORS.textMuted,
                  textTransform: 'lowercase'
                }}>
                  estimating...
                </span>
              ) : cost !== null ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: COLORS.textPrimary
                  }}>
                    {cost.toFixed(2)} {getTokenLabel(tokenType).toLowerCase()}
                  </span>
                  {costInUSD !== null && (
                    <span style={{
                      fontSize: '11px',
                      color: COLORS.textMuted
                    }}>
                      ≈ ${costInUSD.toFixed(2)}
                    </span>
                  )}
                </div>
              ) : (
                <span style={{ fontSize: '12px', color: COLORS.textMuted }}>
                  —
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes cameraAngleFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes cameraAngleSlideUp {
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

export default CameraAnglePopup;
