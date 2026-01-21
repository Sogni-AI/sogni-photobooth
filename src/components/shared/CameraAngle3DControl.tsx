/**
 * CameraAngle3DControl
 *
 * Interactive control for selecting camera angles with a visual orbital representation.
 * Features:
 * - Large visual sphere with orbital camera path
 * - Vertical height slider on the left
 * - Horizontal distance slider below (close near sphere, far away from it)
 * - Dramatic camera travel for elevation changes
 * - Starface-inspired aesthetic: bold yellow/black styling
 */

import React, { useCallback, useMemo, useRef } from 'react';
import {
  AZIMUTHS,
  ELEVATIONS,
  DISTANCES,
  type AzimuthKey,
  type ElevationKey,
  type DistanceKey,
  getAzimuthConfig,
  getElevationConfig,
  getDistanceConfig
} from '../../constants/cameraAngleSettings';

interface CameraAngle3DControlProps {
  azimuth: AzimuthKey;
  elevation: ElevationKey;
  distance: DistanceKey;
  onAzimuthChange: (azimuth: AzimuthKey) => void;
  onElevationChange: (elevation: ElevationKey) => void;
  onDistanceChange: (distance: DistanceKey) => void;
  compact?: boolean;
}

// Refined color palette - softer, more pleasant
const COLORS = {
  accent: '#FDFF00',           // Keep yellow for primary actions only
  accentSoft: '#d4d700',       // Softer yellow for subtle highlights
  black: '#000000',
  white: '#FFFFFF',
  textPrimary: 'rgba(255, 255, 255, 0.9)',
  textSecondary: 'rgba(255, 255, 255, 0.55)',
  textMuted: 'rgba(255, 255, 255, 0.35)',
  darkGray: 'rgba(40, 40, 42, 0.98)',
  surfaceLight: 'rgba(255, 255, 255, 0.06)',
  border: 'rgba(255, 255, 255, 0.1)',
  accentGlow: 'rgba(253, 255, 0, 0.4)'
};

const CameraAngle3DControl: React.FC<CameraAngle3DControlProps> = ({
  azimuth,
  elevation,
  distance,
  onAzimuthChange,
  onElevationChange,
  onDistanceChange,
  compact = false
}) => {
  const orbitRef = useRef<HTMLDivElement>(null);

  const currentAzimuth = getAzimuthConfig(azimuth);
  const currentElevation = getElevationConfig(elevation);
  const currentDistance = getDistanceConfig(distance);

  // Check if camera is behind the sphere (for z-index layering)
  // Use threshold to avoid floating-point precision issues at 90°/270°
  // Only positions clearly in the back half (back-right, back, back-left) should be "behind"
  const isBehindSphere = useMemo(() => {
    const angleRad = (currentAzimuth.angle * Math.PI) / 180;
    return Math.cos(angleRad) < -0.3; // ~107° to ~253° are behind
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
  // Use same threshold as isBehindSphere for consistency
  const isAngleBehind = (angle: number) => {
    const angleRad = (angle * Math.PI) / 180;
    return Math.cos(angleRad) < -0.3; // ~107° to ~253° are behind
  };

  // Calculate camera position on the orbital ring with elevation
  // Coordinate system: avatar faces toward viewer (out of screen)
  // Front (0°) = bottom of ellipse, Back (180°) = top of ellipse
  const cameraPosition = useMemo(() => {
    const angleRad = (currentAzimuth.angle * Math.PI) / 180;
    const baseRadius = 36;
    const perspectiveFactor = 0.4;

    // X position: sin gives left/right
    const x = 50 + baseRadius * Math.sin(angleRad);

    // Y position: cos gives front/back, with perspective flattening
    const baseY = 50 + baseRadius * Math.cos(angleRad) * perspectiveFactor;

    // Eye level offset - shift up to match avatar's face height
    const eyeLevelOffset = -8;

    // Elevation offset - moves camera up/down
    const elevationOffset = -currentElevation.angle * 0.4 + eyeLevelOffset;

    return {
      x,
      y: baseY + elevationOffset
    };
  }, [currentAzimuth.angle, currentElevation.angle]);

  // Calculate cone visibility based on azimuth AND elevation
  // Cone should be hidden when pointing directly at viewer (front) or away (back) at eye level
  // But visible when at different elevations even at front/back
  const coneVisibility = useMemo(() => {
    const azimuthRad = (currentAzimuth.angle * Math.PI) / 180;
    // At front (0°) and back (180°), sin is 0 - cone points at/away from viewer
    // At left (90°) and right (270°), sin is ±1 - cone is fully visible from side
    const azimuthVisibility = Math.abs(Math.sin(azimuthRad));

    // Factor in elevation - even at front/back, if elevation is different from eye-level,
    // we should see some of the cone
    const elevationVisibility = Math.abs(currentElevation.angle) / 60; // Normalize to 0-1 range

    // Use the maximum of both factors
    return Math.max(azimuthVisibility, elevationVisibility);
  }, [currentAzimuth.angle, currentElevation.angle]);

  // Calculate lens angle based on distance (narrow for close-up, wide for wide shot)
  const lensAngle = useMemo(() => {
    switch (currentDistance.key) {
      case 'close-up': return 25;
      case 'medium': return 45;
      case 'wide': return 70;
      default: return 45;
    }
  }, [currentDistance.key]);

  // Calculate camera size based on azimuth (perspective effect)
  const cameraScale = useMemo(() => {
    const angleRad = (currentAzimuth.angle * Math.PI) / 180;
    // cos(0°) = 1 (front, largest), cos(180°) = -1 (back, smallest)
    return 1 + Math.cos(angleRad) * 0.3;
  }, [currentAzimuth.angle]);

  // Handle click on orbital ring to select azimuth
  const handleOrbitClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!orbitRef.current) return;

    const rect = orbitRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const clickX = e.clientX - rect.left - centerX;
    const clickY = e.clientY - rect.top - centerY;

    // Calculate angle from click position
    let angle = Math.atan2(clickX, clickY) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    // Find closest azimuth
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

    onAzimuthChange(closestAzimuth.key);
  }, [onAzimuthChange]);

  // Rotate camera clockwise/counter-clockwise
  const rotateCamera = useCallback((direction: 'cw' | 'ccw') => {
    const currentIndex = AZIMUTHS.findIndex(a => a.key === azimuth);
    const newIndex = direction === 'cw'
      ? (currentIndex + 1) % AZIMUTHS.length
      : (currentIndex - 1 + AZIMUTHS.length) % AZIMUTHS.length;
    onAzimuthChange(AZIMUTHS[newIndex].key);
  }, [azimuth, onAzimuthChange]);

  const orbitalSize = compact ? 180 : 200;
  const elevationsReversed = [...ELEVATIONS].reverse();

  // Render azimuth dot - all dots rendered once with dynamic styling based on depth
  const renderAzimuthDot = (az: typeof AZIMUTHS[number]) => {
    const pos = getPositionForAngle(az.angle);
    const behind = isAngleBehind(az.angle);
    const isSelected = az.key === azimuth;

    return (
      <button
        key={az.key}
        onClick={(e) => {
          e.stopPropagation();
          onAzimuthChange(az.key);
        }}
        style={{
          position: 'absolute',
          left: `${pos.x}%`,
          top: `${pos.y}%`,
          transform: 'translate(-50%, -50%)',
          width: isSelected ? '14px' : behind ? '8px' : '10px',
          height: isSelected ? '14px' : behind ? '8px' : '10px',
          borderRadius: '50%',
          background: isSelected
            ? COLORS.accent
            : behind ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.5)',
          border: 'none',
          cursor: 'pointer',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: isSelected
            ? `0 0 12px ${COLORS.accentGlow}`
            : 'none',
          padding: 0,
          opacity: behind ? 0.5 : 1,
          zIndex: behind ? 1 : 6
        }}
        title={az.label}
      />
    );
  };

  // Camera is rendered as a single element with dynamic z-index for smooth transitions
  const renderCamera = () => {
    return (
      <div
        style={{
          position: 'absolute',
          left: `${cameraPosition.x}%`,
          top: `${cameraPosition.y}%`,
          transform: `translate(-50%, -50%) scale(${cameraScale})`,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          pointerEvents: 'none',
          zIndex: isBehindSphere ? 2 : 10,
          opacity: isBehindSphere ? 0.5 : 1
        }}
      >
        {/* Lens cone - visibility based on angle */}
        {/* Note: No transition on transform to avoid 360° spin when crossing ±180° boundary */}
        <svg
          width="100"
          height="120"
          viewBox="0 0 100 120"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(-50%, -50%) rotate(${Math.atan2(50 - cameraPosition.y, 50 - cameraPosition.x) * (180 / Math.PI) - 90}deg)`,
            transformOrigin: '50px 60px',
            pointerEvents: 'none',
            zIndex: 20,
            opacity: coneVisibility * (isBehindSphere ? 0.6 : 1),
            transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          <defs>
            <linearGradient id="coneFade" x1="0%" y1="50%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={`rgba(253, 255, 0, ${0.6 * coneVisibility})`} />
              <stop offset="100%" stopColor="rgba(253, 255, 0, 0)" />
            </linearGradient>
          </defs>
          <path
            d={`M 50 60 L ${50 - Math.tan((lensAngle / 2) * Math.PI / 180) * 60 * coneVisibility} 120 L ${50 + Math.tan((lensAngle / 2) * Math.PI / 180) * 60 * coneVisibility} 120 Z`}
            fill="url(#coneFade)"
          />
        </svg>
        {/* Camera icon with circular background */}
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: COLORS.accent,
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 10,
          boxShadow: `0 2px 12px ${COLORS.accentGlow}`,
          filter: isBehindSphere ? 'brightness(0.7)' : 'none'
        }}>
          <span style={{ fontSize: '16px' }}>📷</span>
        </div>
      </div>
    );
  };

  return (
    <div className="camera-angle-3d-control" style={{
      display: 'flex',
      flexDirection: 'column',
      gap: compact ? '12px' : '16px',
      padding: compact ? '12px' : '16px',
      background: COLORS.darkGray,
      borderRadius: '16px',
      border: `1px solid ${COLORS.border}`,
      overflow: 'hidden'
    }}>
      {/* Main Control Area */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        {/* Vertical Height Slider */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            fontSize: '10px',
            fontWeight: '600',
            color: COLORS.textSecondary,
            marginBottom: '6px',
            textTransform: 'lowercase',
            letterSpacing: '0.5px'
          }}>
            height
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            background: COLORS.surfaceLight,
            borderRadius: '10px',
            padding: '4px',
            gap: '2px'
          }}>
            {elevationsReversed.map((el) => {
              const isSelected = el.key === elevation;
              const label = el.key === 'high-angle' ? 'high' :
                           el.key === 'elevated' ? 'up' :
                           el.key === 'eye-level' ? 'eye' : 'low';
              return (
                <button
                  key={el.key}
                  onClick={() => onElevationChange(el.key)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: isSelected ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                    color: isSelected ? COLORS.textPrimary : COLORS.textMuted,
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: isSelected ? '600' : '500',
                    transition: 'all 0.15s ease',
                    minWidth: '44px',
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

        {/* Rotate Left Button */}
        <button
          onClick={(e) => { e.stopPropagation(); rotateCamera('cw'); }}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: `1px solid ${COLORS.border}`,
            background: 'rgba(30, 30, 30, 0.9)',
            color: COLORS.textSecondary,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            transition: 'all 0.2s ease',
            fontWeight: '500',
            flexShrink: 0
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.color = COLORS.textPrimary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(30, 30, 30, 0.9)';
            e.currentTarget.style.color = COLORS.textSecondary;
          }}
          title="Rotate camera left"
        >
          ↻
        </button>

        {/* Orbital View */}
        <div style={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flex: 1,
          minWidth: 0
        }}>
          {/* Orbital Diagram */}
          <div
            ref={orbitRef}
            onClick={handleOrbitClick}
            style={{
              width: `${orbitalSize}px`,
              height: `${orbitalSize}px`,
              position: 'relative',
              cursor: 'pointer'
            }}
          >

            {/* All azimuth dots - rendered with dynamic z-index based on depth */}
            {AZIMUTHS.map((az) => renderAzimuthDot(az))}

            {/* Semi-transparent sphere */}
            <div style={{
              position: 'absolute',
              inset: '12%',
              borderRadius: '50%',
              background: `
                radial-gradient(
                  ellipse 70% 70% at 35% 35%,
                  rgba(70, 70, 75, 0.6) 0%,
                  rgba(45, 45, 50, 0.65) 40%,
                  rgba(25, 25, 30, 0.7) 70%,
                  rgba(15, 15, 18, 0.75) 100%
                )
              `,
              boxShadow: `
                inset 0 0 40px rgba(0, 0, 0, 0.4),
                0 8px 32px rgba(0, 0, 0, 0.4)
              `,
              zIndex: 3,
              pointerEvents: 'none'
            }} />

            {/* Orbital ring */}
            <div style={{
              position: 'absolute',
              inset: '8%',
              border: `1px dashed rgba(255, 255, 255, 0.15)`,
              borderRadius: '50%',
              transform: 'rotateX(60deg)',
              transformStyle: 'preserve-3d',
              zIndex: 4,
              pointerEvents: 'none'
            }} />

            {/* Subject silhouette - avatar faces toward viewer */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: compact ? '52px' : '64px',
              opacity: 0.6,
              pointerEvents: 'none',
              zIndex: 4
            }}>
              👤
            </div>

            {/* Camera - single element with dynamic z-index for smooth transitions */}
            {renderCamera()}

            {/* Current angle label */}
            <div style={{
              position: 'absolute',
              bottom: '-4px',
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '12px',
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

        {/* Rotate Right Button */}
        <button
          onClick={(e) => { e.stopPropagation(); rotateCamera('ccw'); }}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: `1px solid ${COLORS.border}`,
            background: 'rgba(30, 30, 30, 0.9)',
            color: COLORS.textSecondary,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            transition: 'all 0.2s ease',
            fontWeight: '500',
            flexShrink: 0
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.color = COLORS.textPrimary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(30, 30, 30, 0.9)';
            e.currentTarget.style.color = COLORS.textSecondary;
          }}
          title="Rotate camera right"
        >
          ↺
        </button>
      </div>

      {/* Distance Slider */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px'
      }}>
        <div style={{
          fontSize: '10px',
          fontWeight: '600',
          color: COLORS.textSecondary,
          textTransform: 'lowercase',
          letterSpacing: '0.5px'
        }}>
          distance
        </div>
        <div style={{
          display: 'flex',
          background: COLORS.surfaceLight,
          borderRadius: '10px',
          padding: '4px',
          gap: '2px',
          width: 'fit-content'
        }}>
          {DISTANCES.map((dist) => {
            const isSelected = dist.key === distance;
            const label = dist.key === 'close-up' ? 'close' :
                         dist.key === 'medium' ? 'medium' : 'wide';
            return (
              <button
                key={dist.key}
                onClick={() => onDistanceChange(dist.key)}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isSelected ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                  color: isSelected ? COLORS.textPrimary : COLORS.textMuted,
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: isSelected ? '600' : '500',
                  transition: 'all 0.15s ease',
                  minWidth: '60px',
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

      {/* Selection Summary */}
      <div style={{
        textAlign: 'center',
        padding: '10px 16px',
        background: COLORS.surfaceLight,
        borderRadius: '10px',
        fontSize: '12px',
        fontWeight: '500',
        color: COLORS.textSecondary,
        textTransform: 'lowercase',
        letterSpacing: '0.3px'
      }}>
        {currentAzimuth.label.toLowerCase()} · {currentElevation.label.toLowerCase()} · {currentDistance.label.toLowerCase()}
      </div>
    </div>
  );
};

export default CameraAngle3DControl;
