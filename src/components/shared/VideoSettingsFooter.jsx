import React, { useState, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useApp } from '../../context/AppContext';
import { VIDEO_QUALITY_PRESETS, VIDEO_RESOLUTIONS, VIDEO_CONFIG } from '../../constants/videoSettings';
import { getTokenLabel } from '../../services/walletService';

/**
 * VideoSettingsFooter
 *
 * A compact footer for video popups that displays and allows inline editing of:
 * - Resolution (480p, 580p, 720p)
 * - Duration (1-8 seconds)
 * - Quality (Fast, Balanced, High, Pro)
 *
 * Changes are persisted to AppContext settings.
 *
 * @param {string} colorScheme - 'light' for dark text on light backgrounds (yellow popups),
 *                               'dark' for light text on dark/colored backgrounds (purple, blue, pink popups)
 */
const VideoSettingsFooter = ({
  videoCount = 1,
  cost = null,
  costUSD = null,
  loading = false,
  formatCost = null,
  style = {},
  showQuality = true,
  showDuration = true,
  showResolution = true,
  colorScheme = 'light', // 'light' = dark text, 'dark' = light text
  tokenType = 'spark' // 'spark' or 'sogni'
}) => {
  const { settings, updateSetting } = useApp();

  // Color scheme configuration
  const isDark = colorScheme === 'dark';
  const colors = {
    text: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.6)',
    textStrong: isDark ? '#fff' : '#000',
    textMuted: isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.4)',
    pillBg: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
    pillBgHover: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.1)',
    pillBgActive: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.12)',
    separator: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.4)'
  };

  // Track which dropdown is open
  const [openDropdown, setOpenDropdown] = useState(null); // 'resolution' | 'duration' | 'quality' | null
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    };

    if (openDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openDropdown]);

  // Current values from settings
  const currentResolution = settings.videoResolution || '480p';
  const currentDuration = settings.videoDuration || 5;
  const currentQuality = settings.videoQuality || 'fast';

  // Generate duration options (1-8 seconds in 0.5 increments)
  const durationOptions = [];
  for (let d = VIDEO_CONFIG.minDuration; d <= VIDEO_CONFIG.maxDuration; d += VIDEO_CONFIG.durationStep) {
    durationOptions.push(d);
  }

  // Handle setting changes
  const handleResolutionChange = useCallback((resolution) => {
    updateSetting('videoResolution', resolution);
    setOpenDropdown(null);
  }, [updateSetting]);

  const handleDurationChange = useCallback((duration) => {
    updateSetting('videoDuration', duration);
    setOpenDropdown(null);
  }, [updateSetting]);

  const handleQualityChange = useCallback((quality) => {
    updateSetting('videoQuality', quality);
    setOpenDropdown(null);
  }, [updateSetting]);

  // Toggle dropdown
  const toggleDropdown = (dropdown) => (e) => {
    e.stopPropagation();
    setOpenDropdown(openDropdown === dropdown ? null : dropdown);
  };

  // Quality label mapping
  const qualityLabels = {
    fast: 'Fast',
    balanced: 'Balanced',
    quality: 'High',
    pro: 'Pro'
  };

  // Render a setting pill with dropdown
  const renderSettingPill = (type, icon, value, label, options, onChange) => {
    const isOpen = openDropdown === type;

    return (
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          onClick={toggleDropdown(type)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2px',
            padding: '2px 6px',
            background: isOpen ? colors.pillBgActive : colors.pillBg,
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: '500',
            color: 'inherit',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={(e) => {
            if (!isOpen) e.currentTarget.style.background = colors.pillBgHover;
          }}
          onMouseLeave={(e) => {
            if (!isOpen) e.currentTarget.style.background = colors.pillBg;
          }}
        >
          <span>{icon}</span>
          <span>{label}</span>
          <span style={{
            fontSize: '8px',
            marginLeft: '1px',
            opacity: 0.6,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease'
          }}>
            ▼
          </span>
        </button>

        {/* Dropdown menu */}
        {isOpen && (
          <div
            ref={dropdownRef}
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: '4px',
              background: '#fff',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.08)',
              padding: '4px',
              minWidth: type === 'quality' ? '100px' : '70px',
              zIndex: 10000,
              animation: 'videoSettingsDropdownFadeIn 0.15s ease'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {options.map((option) => {
              const optionValue = typeof option === 'object' ? option.value : option;
              const optionLabel = typeof option === 'object' ? option.label : option;
              const isSelected = optionValue === value;

              return (
                <button
                  key={optionValue}
                  onClick={() => onChange(optionValue)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '6px 10px',
                    border: 'none',
                    borderRadius: '4px',
                    background: isSelected ? 'rgba(0, 0, 0, 0.08)' : 'transparent',
                    color: '#000',
                    fontSize: '12px',
                    fontWeight: isSelected ? '600' : '400',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 0.1s ease',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'rgba(0, 0, 0, 0.05)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {optionLabel}
                  {isSelected && <span style={{ marginLeft: '6px', opacity: 0.5 }}>✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Format cost display
  const renderCost = () => {
    if (loading) {
      return <span style={{ fontSize: '10px', color: colors.textMuted }}>...</span>;
    }

    if (cost !== null && cost !== undefined) {
      const costValue = typeof cost === 'number' ? cost : parseFloat(cost);
      if (isNaN(costValue)) return null;

      const tokenLabel = getTokenLabel(tokenType);
      const costDisplay = `${costValue.toFixed(2)} ${tokenLabel}`;

      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: colors.textStrong }}>{costDisplay}</span>
          {costUSD !== null && costUSD !== undefined && (
            <span style={{ fontWeight: '400', color: colors.textMuted, fontSize: '10px' }}>
              ≈ ${costUSD.toFixed(2)} USD
            </span>
          )}
        </div>
      );
    }

    return null;
  };

  // Resolution options
  const resolutionOptions = Object.keys(VIDEO_RESOLUTIONS).map(res => ({
    value: res,
    label: res
  }));

  // Duration options formatted
  const formattedDurationOptions = durationOptions.map(d => ({
    value: d,
    label: `${d}s`
  }));

  // Quality options
  const qualityOptions = Object.entries(VIDEO_QUALITY_PRESETS).map(([key, preset]) => ({
    value: key,
    label: preset.label
  }));

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px',
        ...style
      }}
    >
      {/* Left side: Settings pills */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexWrap: 'wrap',
        fontSize: '11px',
        fontWeight: '500',
        color: colors.text
      }}>
        {/* Video count (static) */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
          📹 {videoCount} video{videoCount !== 1 ? 's' : ''}
        </span>

        {/* Resolution selector */}
        {showResolution && (
          <>
            <span style={{ color: colors.separator }}>•</span>
            {renderSettingPill(
              'resolution',
              '📐',
              currentResolution,
              currentResolution,
              resolutionOptions,
              handleResolutionChange
            )}
          </>
        )}

        {/* Duration selector */}
        {showDuration && (
          <>
            <span style={{ color: colors.separator }}>•</span>
            {renderSettingPill(
              'duration',
              '⏱️',
              currentDuration,
              `${currentDuration}s`,
              formattedDurationOptions,
              handleDurationChange
            )}
          </>
        )}

        {/* Quality selector (optional) */}
        {showQuality && (
          <>
            <span style={{ color: colors.separator }}>•</span>
            {renderSettingPill(
              'quality',
              '⚡',
              currentQuality,
              qualityLabels[currentQuality] || 'Fast',
              qualityOptions,
              handleQualityChange
            )}
          </>
        )}
      </div>

      {/* Right side: Cost */}
      {renderCost()}

      {/* Dropdown animation styles */}
      <style>{`
        @keyframes videoSettingsDropdownFadeIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

VideoSettingsFooter.propTypes = {
  videoCount: PropTypes.number,
  cost: PropTypes.number,
  costUSD: PropTypes.number,
  loading: PropTypes.bool,
  formatCost: PropTypes.func,
  style: PropTypes.object,
  showQuality: PropTypes.bool,
  showDuration: PropTypes.bool,
  showResolution: PropTypes.bool,
  colorScheme: PropTypes.oneOf(['light', 'dark']),
  tokenType: PropTypes.oneOf(['spark', 'sogni'])
};

export default VideoSettingsFooter;
