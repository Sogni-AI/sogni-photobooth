/**
 * CameraAnglePopup
 *
 * Popup for generating images from different camera angles using the Multiple Angles LoRA.
 * Features:
 * - Source image preview
 * - Interactive 3D camera control
 * - Cost estimation display
 * - Batch support
 *
 * Styled with Starface-inspired aesthetic: bold yellow/black, rounded elements, lowercase text
 */

import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import CameraAngle3DControl from './CameraAngle3DControl';
import { useCameraAngleCostEstimation } from '../../hooks/useCameraAngleCostEstimation';
import { getTokenLabel } from '../../services/walletService';
import {
  type AzimuthKey,
  type ElevationKey,
  type DistanceKey,
  getAzimuthConfig,
  getElevationConfig,
  getDistanceConfig
} from '../../constants/cameraAngleSettings';

interface CameraAnglePopupProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (params: CameraAngleGenerationParams) => void;
  isBatch?: boolean;
  itemCount?: number;
  tokenType?: 'spark' | 'sogni';
  imageWidth?: number;
  imageHeight?: number;
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

const CameraAnglePopup: React.FC<CameraAnglePopupProps> = ({
  visible,
  onClose,
  onConfirm,
  isBatch = false,
  itemCount = 1,
  tokenType = 'spark',
  imageWidth = 1024,
  imageHeight = 1024
}) => {
  // Camera angle state - default to front, eye-level, close-up
  const [azimuth, setAzimuth] = useState<AzimuthKey>('front');
  const [elevation, setElevation] = useState<ElevationKey>('eye-level');
  const [distance, setDistance] = useState<DistanceKey>('close-up');

  // Cost estimation
  const { cost, costInUSD, loading: costLoading } = useCameraAngleCostEstimation({
    width: imageWidth,
    height: imageHeight,
    jobCount: isBatch ? itemCount : 1,
    enabled: visible
  });

  // Handle confirm
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
          maxWidth: '420px',
          maxHeight: 'calc(100vh - 32px)',
          overflow: 'auto',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6), 0 0 1px rgba(255, 255, 255, 0.1)',
          animation: 'cameraAngleSlideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
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
                {isBatch ? `re-render ${itemCount} images` : 're-render from a new angle'}
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
          {/* Camera Controls */}
          <CameraAngle3DControl
            azimuth={azimuth}
            elevation={elevation}
            distance={distance}
            onAzimuthChange={setAzimuth}
            onElevationChange={setElevation}
            onDistanceChange={setDistance}
          />
        </div>

        {/* Footer with Cost and Actions */}
        <div style={{
          padding: '16px 20px',
          borderTop: `1px solid ${COLORS.borderLight}`,
          background: COLORS.surfaceLight
        }}>
          {/* Cost Display */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '14px'
          }}>
            <span style={{
              fontSize: '12px',
              color: COLORS.textMuted,
              textTransform: 'lowercase',
              fontWeight: '500'
            }}>
              {isBatch ? itemCount : 1} image{isBatch && itemCount > 1 ? 's' : ''}
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

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            gap: '10px'
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
              onClick={handleConfirm}
              style={{
                flex: 2,
                padding: '12px 16px',
                borderRadius: '12px',
                border: 'none',
                background: COLORS.accent,
                color: COLORS.black,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '600',
                textTransform: 'lowercase',
                letterSpacing: '0.3px',
                transition: 'all 0.15s ease',
                fontFamily: 'inherit'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(253, 255, 0, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              generate {isBatch ? 'all' : ''}
            </button>
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
