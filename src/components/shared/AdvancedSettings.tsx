import React from 'react';

interface AdvancedSettingsProps {
  /** Whether the settings overlay is visible */
  visible: boolean;
  /** Handler for closing the settings overlay */
  onClose: () => void;
  /** Current style selection */
  selectedStyle?: string;
  /** Custom prompt text */
  customPrompt?: string;
  /** Handler for custom prompt changes */
  onCustomPromptChange?: (prompt: string) => void;
  /** Camera devices list */
  cameraDevices?: MediaDeviceInfo[];
  /** Selected camera device ID */
  selectedCameraDeviceId?: string;
  /** Handler for camera selection */
  onCameraSelect?: (deviceId: string) => void;
  /** Model options */
  modelOptions?: Array<{ label: string; value: string; }>;
  /** Selected model */
  selectedModel?: string;
  /** Handler for model selection */
  onModelSelect?: (model: string) => void;
  /** Number of images */
  numImages?: number;
  /** Handler for number of images change */
  onNumImagesChange?: (num: number) => void;
  /** Prompt guidance value */
  promptGuidance?: number;
  /** Handler for prompt guidance change */
  onPromptGuidanceChange?: (value: number) => void;
  /** ControlNet strength value */
  controlNetStrength?: number;
  /** Handler for ControlNet strength change */
  onControlNetStrengthChange?: (value: number) => void;
  /** ControlNet guidance end value */
  controlNetGuidanceEnd?: number;
  /** Handler for ControlNet guidance end change */
  onControlNetGuidanceEndChange?: (value: number) => void;
  /** Flash enabled state */
  flashEnabled?: boolean;
  /** Handler for flash enabled change */
  onFlashEnabledChange?: (enabled: boolean) => void;
  /** Keep original photo state */
  keepOriginalPhoto?: boolean;
  /** Handler for keep original photo change */
  onKeepOriginalPhotoChange?: (keep: boolean) => void;
  /** Handler for settings reset */
  onResetSettings?: () => void;
}

/**
 * AdvancedSettings component - reusable settings overlay for camera controls
 */
export const AdvancedSettings: React.FC<AdvancedSettingsProps> = ({
  visible,
  onClose,
  selectedStyle = '',
  customPrompt = '',
  onCustomPromptChange,
  cameraDevices = [],
  selectedCameraDeviceId = '',
  onCameraSelect,
  modelOptions = [],
  selectedModel = '',
  onModelSelect,
  numImages = 8,
  onNumImagesChange,
  promptGuidance = 2,
  onPromptGuidanceChange,
  controlNetStrength = 0.7,
  onControlNetStrengthChange,
  controlNetGuidanceEnd = 0.6,
  onControlNetGuidanceEndChange,
  flashEnabled = true,
  onFlashEnabledChange,
  keepOriginalPhoto = false,
  onKeepOriginalPhotoChange,
  onResetSettings,
}) => {
  return (
    <div className={`control-overlay ${visible ? 'visible' : ''}`} style={{ position: 'fixed', zIndex: 99999 }}>
      <div className="control-overlay-content">
        <h2 className="settings-title">Advanced Settings</h2>
        
        <button 
          className="dismiss-overlay-btn"
          onClick={onClose}
        >
          ×
        </button>
        
        {/* Camera selector */}
        {cameraDevices.length > 0 && (
          <div className="control-option">
            <label className="control-label">Camera:</label>
            <select
              className="camera-select"
              onChange={(e) => onCameraSelect?.(e.target.value)}
              value={selectedCameraDeviceId || ''}
            >
              <option value="">Default (user-facing)</option>
              {cameraDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${device.deviceId}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Custom prompt */}
        {selectedStyle === 'custom' && (
          <div className="control-option">
            <label className="control-label">Custom Style Prompt:</label>
            <textarea
              className="custom-style-input"
              placeholder="Enter your custom style prompt here..."
              value={customPrompt}
              onChange={(e) => onCustomPromptChange?.(e.target.value)}
              rows={4}
            />
          </div>
        )}

        {/* Model selector */}
        {modelOptions.length > 0 && (
          <div className="control-option">
            <label className="control-label">Image Model:</label>
            <select
              className="model-select"
              onChange={(e) => onModelSelect?.(e.target.value)}
              value={selectedModel}
            >
              {modelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Number of images slider */}
        <div className="control-option">
          <label className="control-label">Number of Images:</label>
          <input
            type="range"
            min={1}
            max={64}
            step={1}
            value={numImages}
            onChange={(e) => onNumImagesChange?.(Number(e.target.value))}
            className="slider-input"
          />
          <span className="slider-value">{numImages}</span>
        </div>

        {/* Prompt Guidance slider */}
        <div className="control-option">
          <label className="control-label">Prompt Guidance:</label>
          <input
            type="range"
            min={1.8}
            max={3}
            step={0.1}
            value={promptGuidance}
            onChange={(e) => onPromptGuidanceChange?.(Number(e.target.value))}
            className="slider-input"
          />
          <span className="slider-value">{promptGuidance.toFixed(1)}</span>
        </div>

        {/* ControlNet Strength slider */}
        <div className="control-option">
          <label className="control-label">Instant ID Strength:</label>
          <input
            type="range"
            min={0.4}
            max={1}
            step={0.1}
            value={controlNetStrength}
            onChange={(e) => onControlNetStrengthChange?.(Number(e.target.value))}
            className="slider-input"
          />
          <span className="slider-value">{controlNetStrength.toFixed(1)}</span>
        </div>

        {/* ControlNet Guidance End slider */}
        <div className="control-option">
          <label className="control-label">Instant ID Impact Stop:</label>
          <input
            type="range"
            min={0.2}
            max={0.8}
            step={0.1}
            value={controlNetGuidanceEnd}
            onChange={(e) => onControlNetGuidanceEndChange?.(Number(e.target.value))}
            className="slider-input"
          />
          <span className="slider-value">{controlNetGuidanceEnd.toFixed(1)}</span>
        </div>

        {/* Flash toggle */}
        <div className="control-option checkbox">
          <input
            type="checkbox"
            id="flash-toggle"
            checked={flashEnabled}
            onChange={(e) => onFlashEnabledChange?.(e.target.checked)}
          />
          <label htmlFor="flash-toggle" className="control-label">Flash</label>
        </div>

        {/* Keep original photo toggle */}
        <div className="control-option checkbox">
          <input
            type="checkbox"
            id="keep-original-toggle"
            checked={keepOriginalPhoto}
            onChange={(e) => onKeepOriginalPhotoChange?.(e.target.checked)}
          />
          <label htmlFor="keep-original-toggle" className="control-label">Show Original Image</label>
        </div>
        
        {/* Reset settings button */}
        <div className="control-option reset-option">
          <button 
            className="reset-settings-btn"
            onClick={onResetSettings}
          >
            Reset to Defaults
          </button>
        </div>
        
        {/* Version information */}
        <div className="version-info">
          Sogni Photobooth v{import.meta.env.APP_VERSION || '1.0.1'}
        </div>
      </div>
    </div>
  );
};

export default AdvancedSettings; 