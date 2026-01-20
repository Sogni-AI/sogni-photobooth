/**
 * CameraAngle3DControl
 *
 * Interactive control for selecting camera angles with a visual orbital representation.
 * Features:
 * - Large visual sphere with orbital camera path
 * - Vertical height slider on the left
 * - Horizontal distance slider below (close near sphere, far away from it)
 * - Dramatic camera travel for elevation changes
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

  // Calculate camera position on the orbital ring with elevation
  const cameraPosition = useMemo(() => {
    const angleRad = (currentAzimuth.angle * Math.PI) / 180;
    const radius = 36;

    // Elevation offset - moves camera up/down
    // low-angle (-30°): camera below subject (positive Y)
    // eye-level (0°): centered
    // elevated (30°): camera above subject (negative Y)
    // high-angle (60°): camera way above (more negative Y)
    const elevationOffset = currentElevation.angle * 0.5;

    return {
      x: 50 - radius * Math.sin(angleRad),
      y: 50 + radius * Math.cos(angleRad) * 0.4 - elevationOffset
    };
  }, [currentAzimuth.angle, currentElevation.angle]);

  // Calculate lens angle based on distance (narrow for close-up, wide for wide shot)
  const lensAngle = useMemo(() => {
    switch (currentDistance.key) {
      case 'close-up': return 25; // Narrow lens angle
      case 'medium': return 45; // Medium lens angle
      case 'wide': return 70; // Wide lens angle
      default: return 45;
    }
  }, [currentDistance.key]);

  // Calculate camera size based on azimuth (perspective effect)
  // Front positions are closer to viewer (larger), back positions are farther (smaller)
  const cameraScale = useMemo(() => {
    const angleRad = (currentAzimuth.angle * Math.PI) / 180;
    // cos(0°) = 1 (front, largest), cos(180°) = -1 (back, smallest)
    // Scale range: 0.7 (back) to 1.3 (front)
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

    // Calculate angle from click position (adjusted for front at bottom, left/right mirrored)
    let angle = Math.atan2(-clickX, clickY) * (180 / Math.PI);
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

  // Larger sphere size
  const orbitalSize = compact ? 220 : 280;

  // Reversed elevations for vertical slider (High at top, Low at bottom)
  const elevationsReversed = [...ELEVATIONS].reverse();

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: compact ? '12px' : '16px',
      padding: compact ? '8px' : '12px',
      background: 'rgba(0, 0, 0, 0.2)',
      borderRadius: '16px'
    }}>
      {/* Main Control Area - Height slider + Orbital View */}
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: '12px'
      }}>
        {/* Vertical Height Slider */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 0'
        }}>
          <div style={{
            fontSize: '10px',
            fontWeight: '600',
            color: 'rgba(255, 255, 255, 0.6)',
            marginBottom: '8px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            Height
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '8px',
            padding: '4px',
            gap: '2px',
            flex: 1
          }}>
            {elevationsReversed.map((el) => {
              const isSelected = el.key === elevation;
              const label = el.key === 'high-angle' ? 'High' :
                           el.key === 'elevated' ? 'Up' :
                           el.key === 'eye-level' ? 'Eye' : 'Low';
              return (
                <button
                  key={el.key}
                  onClick={() => onElevationChange(el.key)}
                  style={{
                    padding: '10px 8px',
                    borderRadius: '6px',
                    border: 'none',
                    background: isSelected
                      ? 'linear-gradient(135deg, #4A90D9, #357ABD)'
                      : 'transparent',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: isSelected ? '700' : '500',
                    transition: 'all 0.15s ease',
                    opacity: isSelected ? 1 : 0.7,
                    minWidth: '44px'
                  }}
                  title={el.label}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Orbital View with Rotate Buttons */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flex: 1,
          justifyContent: 'center'
        }}>
          {/* Rotate Left Button */}
          <button
            onClick={() => rotateCamera('cw')}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              transition: 'all 0.2s ease',
              flexShrink: 0
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }}
            title="Rotate camera left"
          >
            ↺
          </button>

          {/* Orbital Diagram */}
          <div
            ref={orbitRef}
            onClick={handleOrbitClick}
            style={{
              width: `${orbitalSize}px`,
              height: `${orbitalSize}px`,
              position: 'relative',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            {/* Background gradient sphere - larger */}
            <div style={{
              position: 'absolute',
              inset: '12%',
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.2), rgba(0, 0, 0, 0.4))',
              boxShadow: 'inset 0 0 30px rgba(0, 0, 0, 0.4), 0 4px 20px rgba(0, 0, 0, 0.3)'
            }} />

            {/* Orbital ring (ellipse for perspective) */}
            <div style={{
              position: 'absolute',
              inset: '8%',
              border: '2px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '50%',
              transform: 'rotateX(60deg)',
              transformStyle: 'preserve-3d'
            }} />

            {/* Subject silhouette - larger */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: compact ? '52px' : '64px',
              opacity: 0.5,
              pointerEvents: 'none',
              filter: 'grayscale(100%)'
            }}>
              👤
            </div>

            {/* Azimuth position indicators */}
            {AZIMUTHS.map((az) => {
              const angleRad = (az.angle * Math.PI) / 180;
              const radius = 40;
              const x = 50 - radius * Math.sin(angleRad);
              const y = 50 + radius * Math.cos(angleRad) * 0.4;
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
                    left: `${x}%`,
                    top: `${y}%`,
                    transform: 'translate(-50%, -50%)',
                    width: isSelected ? '18px' : '12px',
                    height: isSelected ? '18px' : '12px',
                    borderRadius: '50%',
                    background: isSelected
                      ? 'linear-gradient(135deg, #4A90D9, #357ABD)'
                      : 'rgba(255, 255, 255, 0.4)',
                    border: isSelected
                      ? '2px solid #fff'
                      : '1px solid rgba(255, 255, 255, 0.3)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected
                      ? '0 0 16px rgba(74, 144, 217, 0.7)'
                      : 'none',
                    padding: 0
                  }}
                  title={az.label}
                />
              );
            })}

            {/* Camera indicator (active position) - always faces up, scales with distance */}
            <div
              style={{
                position: 'absolute',
                left: `${cameraPosition.x}%`,
                top: `${cameraPosition.y}%`,
                transform: `translate(-50%, -50%) scale(${cameraScale})`,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                pointerEvents: 'none',
                zIndex: 10
              }}
            >
              {/* Lens angle visualization - cone pointing toward center of sphere */}
              <svg
                width="100"
                height="120"
                viewBox="0 0 100 120"
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  // Offset to align with camera lens (lens is ~3px right of emoji center)
                  // Rotate cone to point toward center (50, 50). +90 because cone's default points down in SVG
                  transform: `translate(calc(-50% + 3px), calc(-50% + 2px)) rotate(${Math.atan2(50 - cameraPosition.y, 50 - cameraPosition.x) * (180 / Math.PI) - 90}deg)`,
                  transformOrigin: '50px 60px',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  pointerEvents: 'none',
                  zIndex: 20
                }}
              >
                {/* Gradient definition for fade effect */}
                <defs>
                  <linearGradient id="coneFade" x1="0%" y1="50%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="rgba(74, 144, 217, 0.6)" />
                    <stop offset="100%" stopColor="rgba(74, 144, 217, 0)" />
                  </linearGradient>
                  <linearGradient id="coneStrokeFade" x1="0%" y1="50%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="rgba(74, 144, 217, 0.9)" />
                    <stop offset="100%" stopColor="rgba(74, 144, 217, 0)" />
                  </linearGradient>
                </defs>
                {/* Lens cone - expands based on distance setting, fades at the end */}
                <path
                  d={`M 50 60 L ${50 - Math.tan((lensAngle / 2) * Math.PI / 180) * 60} 120 L ${50 + Math.tan((lensAngle / 2) * Math.PI / 180) * 60} 120 Z`}
                  fill="url(#coneFade)"
                  stroke="url(#coneStrokeFade)"
                  strokeWidth="2"
                  style={{
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                />
              </svg>
              {/* Camera icon */}
              <div style={{
                fontSize: '28px',
                position: 'relative',
                zIndex: 10,
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4))'
              }}>
                📷
              </div>
            </div>

            {/* Current angle label */}
            <div style={{
              position: 'absolute',
              bottom: '-8px',
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '12px',
              fontWeight: '600',
              color: '#fff',
              textShadow: '0 1px 3px rgba(0, 0, 0, 0.6)',
              whiteSpace: 'nowrap'
            }}>
              {currentAzimuth.label}
            </div>
          </div>

          {/* Rotate Right Button */}
          <button
            onClick={() => rotateCamera('ccw')}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              transition: 'all 0.2s ease',
              flexShrink: 0
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }}
            title="Rotate camera right"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Distance Slider - Horizontal below sphere, Close near center, Wide far */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        paddingLeft: '56px' // Offset to align with sphere (accounting for height slider)
      }}>
        <div style={{
          fontSize: '10px',
          fontWeight: '600',
          color: 'rgba(255, 255, 255, 0.6)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          Distance
        </div>
        <div style={{
          display: 'flex',
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: '8px',
          padding: '4px',
          gap: '2px',
          width: 'fit-content'
        }}>
          {/* Close is first (nearest to sphere concept), Wide is last (farthest) */}
          {DISTANCES.map((dist) => {
            const isSelected = dist.key === distance;
            const label = dist.key === 'close-up' ? 'Close' :
                         dist.key === 'medium' ? 'Medium' : 'Wide';
            return (
              <button
                key={dist.key}
                onClick={() => onDistanceChange(dist.key)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: isSelected
                    ? 'linear-gradient(135deg, #4A90D9, #357ABD)'
                    : 'transparent',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: isSelected ? '700' : '500',
                  transition: 'all 0.15s ease',
                  opacity: isSelected ? 1 : 0.7,
                  minWidth: '60px'
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
        padding: '8px 12px',
        background: 'rgba(74, 144, 217, 0.15)',
        borderRadius: '8px',
        fontSize: '12px',
        fontWeight: '500',
        color: '#fff'
      }}>
        {currentAzimuth.label} • {currentElevation.label} • {currentDistance.label}
      </div>
    </div>
  );
};

export default CameraAngle3DControl;
