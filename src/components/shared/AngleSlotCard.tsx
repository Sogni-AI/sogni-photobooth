/**
 * AngleSlotCard
 *
 * Card for displaying and editing a single camera angle slot.
 * Uses the full 3D camera control with integrated thumbnail.
 *
 * Features:
 * - Source image thumbnail
 * - "Use original perspective" checkbox
 * - Full 3D camera angle control (disabled when using original)
 * - Index badge and remove button
 */

import React, { useCallback, useMemo, useRef } from 'react';
import type { AngleSlot } from '../../types/cameraAngle';
import {
  type AzimuthKey,
  type ElevationKey,
  type DistanceKey,
  AZIMUTHS,
  ELEVATIONS,
  DISTANCES,
  getAzimuthConfig,
  getElevationConfig,
  getDistanceConfig
} from '../../constants/cameraAngleSettings';

interface AngleSlotCardProps {
  /** Index number for display (1-based) */
  index: number;
  /** The angle slot configuration */
  slot: AngleSlot;
  /** Optional thumbnail URL */
  thumbnailUrl?: string;
  /** Callback when angle changes */
  onChange: (slot: AngleSlot) => void;
  /** Callback when remove is clicked */
  onRemove?: () => void;
  /** Whether to show remove button */
  showRemove?: boolean;
  /** Whether the card is disabled */
  disabled?: boolean;
}

// Color palette matching CameraAnglePopup
const COLORS = {
  accent: '#FDFF00',
  accentSoft: 'rgba(253, 255, 0, 0.15)',
  accentGlow: 'rgba(253, 255, 0, 0.4)',
  black: '#000000',
  white: '#FFFFFF',
  textPrimary: 'rgba(255, 255, 255, 0.9)',
  textSecondary: 'rgba(255, 255, 255, 0.55)',
  textMuted: 'rgba(255, 255, 255, 0.35)',
  surface: '#1c1c1e',
  surfaceLight: 'rgba(255, 255, 255, 0.06)',
  border: 'rgba(255, 255, 255, 0.1)',
  borderLight: 'rgba(255, 255, 255, 0.06)',
  darkGray: 'rgba(40, 40, 42, 0.98)'
};

const AngleSlotCard: React.FC<AngleSlotCardProps> = ({
  index,
  slot,
  thumbnailUrl,
  onChange,
  onRemove,
  showRemove = true,
  disabled = false
}) => {
  const orbitRef = useRef<HTMLDivElement>(null);
  const isOriginal = slot.isOriginal ?? false;
  const controlsDisabled = disabled || isOriginal;

  const currentAzimuth = getAzimuthConfig(slot.azimuth);
  const currentElevation = getElevationConfig(slot.elevation);
  const currentDistance = getDistanceConfig(slot.distance);

  const handleAzimuthChange = useCallback((azimuth: AzimuthKey) => {
    if (controlsDisabled) return;
    onChange({ ...slot, azimuth });
  }, [slot, onChange, controlsDisabled]);

  const handleElevationChange = useCallback((elevation: ElevationKey) => {
    if (controlsDisabled) return;
    onChange({ ...slot, elevation });
  }, [slot, onChange, controlsDisabled]);

  const handleDistanceChange = useCallback((distance: DistanceKey) => {
    if (controlsDisabled) return;
    onChange({ ...slot, distance });
  }, [slot, onChange, controlsDisabled]);

  const handleOriginalToggle = useCallback((checked: boolean) => {
    onChange({ ...slot, isOriginal: checked });
  }, [slot, onChange]);

  // Rotate camera
  const rotateCamera = useCallback((direction: 'cw' | 'ccw') => {
    if (controlsDisabled) return;
    const currentIndex = AZIMUTHS.findIndex(a => a.key === slot.azimuth);
    const newIndex = direction === 'cw'
      ? (currentIndex + 1) % AZIMUTHS.length
      : (currentIndex - 1 + AZIMUTHS.length) % AZIMUTHS.length;
    handleAzimuthChange(AZIMUTHS[newIndex].key);
  }, [slot.azimuth, handleAzimuthChange, controlsDisabled]);

  // Check if camera is behind the sphere
  const isBehindSphere = useMemo(() => {
    const angleRad = (currentAzimuth.angle * Math.PI) / 180;
    return Math.cos(angleRad) < -0.3;
  }, [currentAzimuth.angle]);

  // Helper to get position for any angle
  const getPositionForAngle = (angle: number) => {
    const angleRad = (angle * Math.PI) / 180;
    const radius = 40;
    const perspectiveFactor = 0.4;
    return {
      x: 50 + radius * Math.sin(angleRad),
      y: 50 + radius * Math.cos(angleRad) * perspectiveFactor
    };
  };

  // Helper to check if an angle is behind the sphere
  const isAngleBehind = (angle: number) => {
    const angleRad = (angle * Math.PI) / 180;
    return Math.cos(angleRad) < -0.3;
  };

  // Calculate camera position
  const cameraPosition = useMemo(() => {
    const angleRad = (currentAzimuth.angle * Math.PI) / 180;
    const baseRadius = 36;
    const perspectiveFactor = 0.4;
    const x = 50 + baseRadius * Math.sin(angleRad);
    const baseY = 50 + baseRadius * Math.cos(angleRad) * perspectiveFactor;
    const eyeLevelOffset = -8;
    const elevationOffset = -currentElevation.angle * 0.4 + eyeLevelOffset;
    return { x, y: baseY + elevationOffset };
  }, [currentAzimuth.angle, currentElevation.angle]);

  // Calculate cone visibility
  const coneVisibility = useMemo(() => {
    const azimuthRad = (currentAzimuth.angle * Math.PI) / 180;
    const azimuthVisibility = Math.abs(Math.sin(azimuthRad));
    const elevationVisibility = Math.abs(currentElevation.angle) / 60;
    return Math.max(azimuthVisibility, elevationVisibility);
  }, [currentAzimuth.angle, currentElevation.angle]);

  // Calculate lens angle
  const lensAngle = useMemo(() => {
    switch (currentDistance.key) {
      case 'close-up': return 25;
      case 'medium': return 45;
      case 'wide': return 70;
      default: return 45;
    }
  }, [currentDistance.key]);

  // Calculate camera scale
  const cameraScale = useMemo(() => {
    const angleRad = (currentAzimuth.angle * Math.PI) / 180;
    return 1 + Math.cos(angleRad) * 0.3;
  }, [currentAzimuth.angle]);

  // Handle click on orbital ring
  const handleOrbitClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (controlsDisabled || !orbitRef.current) return;

    const rect = orbitRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const clickX = e.clientX - rect.left - centerX;
    const clickY = e.clientY - rect.top - centerY;

    let angle = Math.atan2(clickX, clickY) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    let closestAzimuth: typeof AZIMUTHS[number] = AZIMUTHS[0];
    let minDiff = 360;

    for (const az of AZIMUTHS) {
      let diff = Math.abs(az.angle - angle);
      if (diff > 180) diff = 360 - diff;
      if (diff < minDiff) {
        minDiff = diff;
        closestAzimuth = az;
      }
    }

    handleAzimuthChange(closestAzimuth.key);
  }, [handleAzimuthChange, controlsDisabled]);

  const elevationsReversed = [...ELEVATIONS].reverse();

  // Render azimuth dot
  const renderAzimuthDot = (az: typeof AZIMUTHS[number]) => {
    const pos = getPositionForAngle(az.angle);
    const behind = isAngleBehind(az.angle);
    const isSelected = az.key === slot.azimuth;

    return (
      <button
        key={az.key}
        onClick={(e) => {
          e.stopPropagation();
          handleAzimuthChange(az.key);
        }}
        disabled={controlsDisabled}
        style={{
          position: 'absolute',
          left: `${pos.x}%`,
          top: `${pos.y}%`,
          transform: 'translate(-50%, -50%)',
          width: isSelected ? '12px' : behind ? '6px' : '8px',
          height: isSelected ? '12px' : behind ? '6px' : '8px',
          borderRadius: '50%',
          background: isSelected
            ? COLORS.accent
            : behind ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.5)',
          border: 'none',
          cursor: controlsDisabled ? 'default' : 'pointer',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: isSelected ? `0 0 10px ${COLORS.accentGlow}` : 'none',
          padding: 0,
          opacity: behind ? 0.7 : 1,
          zIndex: behind ? 1 : 6
        }}
        title={az.label}
      />
    );
  };

  // Render camera icon
  const renderCamera = () => (
    <div
      style={{
        position: 'absolute',
        left: `${cameraPosition.x}%`,
        top: `${cameraPosition.y}%`,
        transform: `translate(-50%, -50%) scale(${cameraScale * 0.8})`,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: 'none',
        zIndex: isBehindSphere ? 2 : 10,
        opacity: isBehindSphere ? 0.7 : 1
      }}
    >
      {/* Lens cone - positioned relative to camera icon center */}
      <svg
        width="100"
        height="120"
        viewBox="0 0 100 120"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) rotate(${Math.atan2(50 - cameraPosition.y, 50 - cameraPosition.x) * (180 / Math.PI) - 90}deg)`,
          transformOrigin: 'center center',
          pointerEvents: 'none',
          zIndex: -1,
          opacity: coneVisibility * (isBehindSphere ? 0.75 : 1),
          transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        <defs>
          <linearGradient id={`coneFade-${slot.id}`} x1="0%" y1="50%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={`rgba(253, 255, 0, ${0.6 * coneVisibility})`} />
            <stop offset="100%" stopColor="rgba(253, 255, 0, 0)" />
          </linearGradient>
        </defs>
        <path
          d={`M 50 60 L ${50 - Math.tan((lensAngle / 2) * Math.PI / 180) * 60 * coneVisibility} 120 L ${50 + Math.tan((lensAngle / 2) * Math.PI / 180) * 60 * coneVisibility} 120 Z`}
          fill={`url(#coneFade-${slot.id})`}
        />
      </svg>
      {/* Camera icon */}
      <div style={{
        width: '26px',
        height: '26px',
        borderRadius: '50%',
        background: COLORS.accent,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        zIndex: 10,
        boxShadow: `0 2px 10px ${COLORS.accentGlow}`,
        filter: isBehindSphere ? 'brightness(0.8)' : 'none'
      }}>
        <span style={{ fontSize: '13px' }}>📷</span>
      </div>
    </div>
  );

  return (
    <div
      className="angle-slot-card"
      style={{
        position: 'relative',
        background: COLORS.darkGray,
        borderRadius: '16px',
        border: `1px solid ${COLORS.border}`,
        padding: '16px',
        minWidth: '320px',
        maxWidth: '360px',
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
        transition: 'all 0.15s ease'
      }}
    >
      {/* Index Badge */}
      <div style={{
        position: 'absolute',
        top: '-10px',
        left: '12px',
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        background: COLORS.accent,
        color: COLORS.black,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        fontWeight: '700',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        zIndex: 1
      }}>
        {index}
      </div>

      {/* Remove Button */}
      {showRemove && onRemove && (
        <button
          onClick={onRemove}
          style={{
            position: 'absolute',
            top: '-8px',
            right: '-8px',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255, 100, 100, 0.9)',
            color: COLORS.white,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            transition: 'all 0.15s ease',
            zIndex: 1
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 80, 80, 1)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 100, 100, 0.9)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title="Remove angle"
        >
          ×
        </button>
      )}

      {/* Thumbnail + Original Checkbox Row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '12px',
        paddingTop: '4px'
      }}>
        {/* Thumbnail */}
        {thumbnailUrl && (
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '8px',
            overflow: 'hidden',
            border: `2px solid ${isOriginal ? COLORS.accent : COLORS.border}`,
            flexShrink: 0,
            transition: 'border-color 0.15s ease'
          }}>
            <img
              src={thumbnailUrl}
              alt="Source"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />
          </div>
        )}

        {/* Use Original Checkbox */}
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          flex: 1
        }}>
          <input
            type="checkbox"
            checked={isOriginal}
            onChange={(e) => handleOriginalToggle(e.target.checked)}
            style={{
              width: '16px',
              height: '16px',
              accentColor: COLORS.accent,
              cursor: 'pointer'
            }}
          />
          <span style={{
            fontSize: '11px',
            color: isOriginal ? COLORS.accent : COLORS.textSecondary,
            fontWeight: isOriginal ? '600' : '500',
            textTransform: 'lowercase',
            transition: 'color 0.15s ease'
          }}>
            use original perspective
          </span>
        </label>
      </div>

      {/* 3D Control Area - grayed out when isOriginal */}
      <div style={{
        opacity: isOriginal ? 0.3 : 1,
        pointerEvents: isOriginal ? 'none' : 'auto',
        transition: 'opacity 0.2s ease'
      }}>
        {/* Main Control Row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          {/* Vertical Height Slider */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            <div style={{
              fontSize: '9px',
              fontWeight: '600',
              color: COLORS.textSecondary,
              marginBottom: '4px',
              textTransform: 'lowercase'
            }}>
              height
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              background: COLORS.surfaceLight,
              borderRadius: '8px',
              padding: '3px',
              gap: '1px'
            }}>
              {elevationsReversed.map((el) => {
                const isSelected = el.key === slot.elevation;
                const label = el.key === 'high-angle' ? 'high' :
                             el.key === 'elevated' ? 'up' :
                             el.key === 'eye-level' ? 'eye' : 'low';
                return (
                  <button
                    key={el.key}
                    onClick={() => handleElevationChange(el.key)}
                    disabled={controlsDisabled}
                    style={{
                      padding: '6px 8px',
                      borderRadius: '6px',
                      border: 'none',
                      background: isSelected ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                      color: isSelected ? COLORS.textPrimary : COLORS.textMuted,
                      cursor: controlsDisabled ? 'default' : 'pointer',
                      fontSize: '10px',
                      fontWeight: isSelected ? '600' : '500',
                      transition: 'all 0.15s ease',
                      minWidth: '38px',
                      textTransform: 'lowercase'
                    }}
                    title={el.label}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rotate Left */}
          <button
            onClick={(e) => { e.stopPropagation(); rotateCamera('ccw'); }}
            disabled={controlsDisabled}
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              border: `1px solid ${COLORS.border}`,
              background: 'rgba(30, 30, 30, 0.9)',
              color: COLORS.textSecondary,
              cursor: controlsDisabled ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              transition: 'all 0.2s ease',
              flexShrink: 0
            }}
            title="Rotate left"
          >
            ↻
          </button>

          {/* Orbital View */}
          <div style={{ position: 'relative', flex: 1, display: 'flex', justifyContent: 'center' }}>
            <div
              ref={orbitRef}
              onClick={handleOrbitClick}
              style={{
                width: '140px',
                height: '140px',
                position: 'relative',
                cursor: controlsDisabled ? 'default' : 'pointer'
              }}
            >
              {/* Azimuth dots */}
              {AZIMUTHS.map(renderAzimuthDot)}

              {/* Sphere */}
              <div style={{
                position: 'absolute',
                inset: '15%',
                borderRadius: '50%',
                background: `radial-gradient(ellipse 70% 70% at 35% 35%, rgba(70, 70, 75, 0.6) 0%, rgba(45, 45, 50, 0.65) 40%, rgba(25, 25, 30, 0.7) 70%, rgba(15, 15, 18, 0.75) 100%)`,
                boxShadow: 'inset 0 0 30px rgba(0, 0, 0, 0.4), 0 6px 24px rgba(0, 0, 0, 0.4)',
                zIndex: 3,
                pointerEvents: 'none'
              }} />

              {/* Orbital ring */}
              <div style={{
                position: 'absolute',
                inset: '10%',
                border: '1px dashed rgba(255, 255, 255, 0.15)',
                borderRadius: '50%',
                transform: 'rotateX(60deg)',
                zIndex: 4,
                pointerEvents: 'none'
              }} />

              {/* Subject */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: '44px',
                opacity: 0.6,
                pointerEvents: 'none',
                zIndex: 4
              }}>
                👤
              </div>

              {/* Camera */}
              {renderCamera()}

              {/* Angle label */}
              <div style={{
                position: 'absolute',
                bottom: '-2px',
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: '11px',
                fontWeight: '600',
                color: COLORS.textPrimary,
                textShadow: '0 1px 4px rgba(0, 0, 0, 0.6)',
                whiteSpace: 'nowrap',
                textTransform: 'lowercase',
                zIndex: 10
              }}>
                {currentAzimuth.label.toLowerCase()}
              </div>
            </div>
          </div>

          {/* Rotate Right */}
          <button
            onClick={(e) => { e.stopPropagation(); rotateCamera('cw'); }}
            disabled={controlsDisabled}
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              border: `1px solid ${COLORS.border}`,
              background: 'rgba(30, 30, 30, 0.9)',
              color: COLORS.textSecondary,
              cursor: controlsDisabled ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              transition: 'all 0.2s ease',
              flexShrink: 0
            }}
            title="Rotate right"
          >
            ↺
          </button>
        </div>

        {/* Distance Slider */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
          marginTop: '10px'
        }}>
          <div style={{
            fontSize: '9px',
            fontWeight: '600',
            color: COLORS.textSecondary,
            textTransform: 'lowercase'
          }}>
            distance
          </div>
          <div style={{
            display: 'flex',
            background: COLORS.surfaceLight,
            borderRadius: '8px',
            padding: '3px',
            gap: '2px'
          }}>
            {DISTANCES.map((dist) => {
              const isSelected = dist.key === slot.distance;
              const label = dist.key === 'close-up' ? 'close' :
                           dist.key === 'medium' ? 'medium' : 'wide';
              return (
                <button
                  key={dist.key}
                  onClick={() => handleDistanceChange(dist.key)}
                  disabled={controlsDisabled}
                  style={{
                    padding: '6px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: isSelected ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                    color: isSelected ? COLORS.textPrimary : COLORS.textMuted,
                    cursor: controlsDisabled ? 'default' : 'pointer',
                    fontSize: '10px',
                    fontWeight: isSelected ? '600' : '500',
                    transition: 'all 0.15s ease',
                    minWidth: '50px',
                    textTransform: 'lowercase'
                  }}
                  title={dist.label}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div style={{
        marginTop: '10px',
        padding: '8px 12px',
        background: COLORS.surfaceLight,
        borderRadius: '8px',
        fontSize: '11px',
        fontWeight: '500',
        color: isOriginal ? COLORS.accent : COLORS.textSecondary,
        textTransform: 'lowercase',
        textAlign: 'center',
        letterSpacing: '0.3px'
      }}>
        {isOriginal
          ? 'original image (no changes)'
          : `${currentAzimuth.label.toLowerCase()} · ${currentElevation.label.toLowerCase()} · ${currentDistance.label.toLowerCase()}`
        }
      </div>
    </div>
  );
};

export default AngleSlotCard;
