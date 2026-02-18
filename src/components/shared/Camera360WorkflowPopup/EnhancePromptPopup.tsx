/**
 * EnhancePromptPopup
 *
 * Portal-rendered overlay for configuring the enhancement prompt and quality
 * before enhancing one or more 360 camera angle images.
 * Includes cost estimation via useCostEstimation hook, matching Camera360 styling.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { COLORS } from '../../../constants/camera360Settings';
import { useCostEstimation } from '../../../hooks/useCostEstimation';
import { useWallet } from '../../../hooks/useWallet';
import { getTokenLabel } from '../../../services/walletService';

interface EnhancePromptPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (prompt: string, steps: number) => void;
  imageCount?: number;
}

const DEFAULT_PROMPT = '(Extra detailed and contrasty portrait) Portrait masterpiece';

/** Quality presets for Z-Image Turbo enhancement (steps 4-10) */
const ENHANCE_QUALITY_PRESETS = [
  { key: 'fast', label: 'Fast', steps: 4, description: 'Quick enhance' },
  { key: 'balanced', label: 'Balanced', steps: 6, description: 'Recommended' },
  { key: 'quality', label: 'Quality', steps: 8, description: 'Higher detail' },
  { key: 'pro', label: 'Pro', steps: 10, description: 'Max quality' }
] as const;

type QualityKey = typeof ENHANCE_QUALITY_PRESETS[number]['key'];

const EnhancePromptPopup: React.FC<EnhancePromptPopupProps> = ({
  isOpen,
  onClose,
  onConfirm,
  imageCount = 1
}) => {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [qualityKey, setQualityKey] = useState<QualityKey>('balanced');
  const { tokenType } = useWallet();

  const selectedPreset = ENHANCE_QUALITY_PRESETS.find(p => p.key === qualityKey) || ENHANCE_QUALITY_PRESETS[1];

  // Cost estimation via SDK
  const { loading: costLoading, cost, costInUSD } = useCostEstimation({
    model: 'z_image_turbo_bf16',
    imageCount: isOpen ? imageCount : 0,
    stepCount: selectedPreset.steps,
    scheduler: 'euler',
    guidance: 3.5,
    guideImage: true,
    denoiseStrength: 0.75,
    previewCount: 5
  });

  const handleConfirm = useCallback(() => {
    onConfirm(prompt, selectedPreset.steps);
  }, [prompt, selectedPreset.steps, onConfirm]);

  const handleResetPrompt = useCallback(() => {
    setPrompt(DEFAULT_PROMPT);
  }, []);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const tokenLabel = getTokenLabel(tokenType);

  const renderCost = () => {
    if (costLoading) {
      return (
        <span style={{ fontSize: '11px', color: COLORS.textMuted }}>Estimating...</span>
      );
    }
    if (cost !== null) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: '700', color: COLORS.textPrimary }}>
            {cost.toFixed(2)} {tokenLabel}
          </span>
          {costInUSD !== null && (
            <span style={{ fontSize: '10px', color: COLORS.textMuted }}>
              {'\u2248'} ${costInUSD.toFixed(2)} USD
            </span>
          )}
        </div>
      );
    }
    return <span style={{ fontSize: '11px', color: COLORS.textMuted }}>{'\u2014'}</span>;
  };

  const popup = (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000000,
        fontFamily: '"SF Mono", "Monaco", "Inconsolata", "Fira Mono", monospace'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.surface,
          borderRadius: '16px',
          border: `1px solid ${COLORS.border}`,
          width: '100%',
          maxWidth: '440px',
          margin: '0 20px',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${COLORS.borderLight}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <h3 style={{
            margin: 0,
            fontSize: '15px',
            fontWeight: '700',
            color: COLORS.textPrimary,
            fontFamily: 'inherit'
          }}>
            Enhance Image{imageCount > 1 ? 's' : ''}
          </h3>
          <button
            onClick={onClose}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              border: 'none',
              background: COLORS.surfaceLight,
              color: COLORS.textSecondary,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px'
            }}
          >
            {'\u2715'}
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px' }}>
          <p style={{
            margin: '0 0 12px',
            fontSize: '12px',
            color: COLORS.textSecondary,
            lineHeight: '1.5'
          }}>
            Customize the enhancement prompt to control how your image is upscaled.
          </p>

          {imageCount > 1 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: '8px',
              background: COLORS.surfaceLight,
              marginBottom: '12px',
              fontSize: '11px',
              color: COLORS.warning,
              fontWeight: '600'
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              {imageCount} images will be enhanced
            </div>
          )}

          {/* Quality picker */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: '600',
              color: COLORS.textMuted,
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Quality
            </label>
            <div style={{
              display: 'flex',
              gap: '6px'
            }}>
              {ENHANCE_QUALITY_PRESETS.map(preset => {
                const isSelected = preset.key === qualityKey;
                return (
                  <button
                    key={preset.key}
                    onClick={() => setQualityKey(preset.key)}
                    style={{
                      flex: 1,
                      padding: '8px 4px',
                      borderRadius: '8px',
                      border: `1px solid ${isSelected ? COLORS.warning : COLORS.border}`,
                      background: isSelected ? 'rgba(251, 191, 36, 0.12)' : 'transparent',
                      color: isSelected ? COLORS.warning : COLORS.textSecondary,
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: isSelected ? '700' : '500',
                      fontFamily: 'inherit',
                      textAlign: 'center',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div>{preset.label}</div>
                    <div style={{
                      fontSize: '9px',
                      color: isSelected ? 'rgba(251, 191, 36, 0.7)' : COLORS.textMuted,
                      marginTop: '2px'
                    }}>
                      {preset.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prompt textarea */}
          <div style={{ marginBottom: '8px' }}>
            <label style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: '600',
              color: COLORS.textMuted,
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Enhancement Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter enhancement prompt..."
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${COLORS.border}`,
                background: COLORS.surfaceLight,
                color: COLORS.textPrimary,
                fontSize: '12px',
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
                lineHeight: '1.5'
              }}
            />
          </div>

          <button
            onClick={handleResetPrompt}
            type="button"
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: 'none',
              background: 'transparent',
              color: COLORS.textMuted,
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: '500',
              fontFamily: 'inherit'
            }}
          >
            Reset to Default
          </button>
        </div>

        {/* Footer with cost estimate */}
        <div style={{
          padding: '12px 20px',
          borderTop: `1px solid ${COLORS.borderLight}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {/* Cost display */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}>
            <span style={{
              fontSize: '9px',
              fontWeight: '600',
              color: COLORS.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Estimated Cost
            </span>
            {renderCost()}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: `1px solid ${COLORS.border}`,
                background: 'transparent',
                color: COLORS.textSecondary,
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '600',
                fontFamily: 'inherit'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: COLORS.warning,
                color: COLORS.black,
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '700',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {imageCount > 1 ? `Enhance ${imageCount} Images` : 'Enhance'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(popup, document.body);
};

export default EnhancePromptPopup;
