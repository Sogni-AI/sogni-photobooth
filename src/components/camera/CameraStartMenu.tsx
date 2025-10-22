import React, { useRef, useState, useMemo } from 'react';
import MetricsBar from '../shared/MetricsBar';
import StyleDropdown from '../shared/StyleDropdown';
import { styleIdToDisplay } from '../../utils';
import { isFluxKontextModel } from '../../constants/settings';
import { generateGalleryFilename } from '../../utils/galleryLoader';
import './CameraStartMenu.css';

interface CameraStartMenuProps {
  onTakePhoto: () => void;
  onBrowsePhoto: (file: File) => void;
  onDragPhoto: () => void;
  isProcessing?: boolean;
  // Style selector props
  selectedStyle?: string;
  onStyleSelect?: (style: string) => void;
  stylePrompts?: Record<string, string>;
  selectedModel?: string;
  onNavigateToGallery?: () => void;
  onShowControlOverlay?: () => void;
  onThemeChange?: (themeState: Record<string, boolean>) => void;
  onCustomPromptChange?: (prompt: string) => void;
  currentCustomPrompt?: string;
  portraitType?: 'headshot' | 'medium' | 'fullbody';
}

const CameraStartMenu: React.FC<CameraStartMenuProps> = ({ 
  onTakePhoto, 
  onBrowsePhoto,
  isProcessing = false,
  selectedStyle = '',
  onStyleSelect,
  stylePrompts = {},
  selectedModel = '',
  onNavigateToGallery,
  onShowControlOverlay,
  onThemeChange,
  onCustomPromptChange,
  currentCustomPrompt = '',
  portraitType = 'medium'
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showStyleDropdown, setShowStyleDropdown] = useState(false);

  // Generate preview image path for selected style
  const stylePreviewImage = useMemo(() => {
    // Check if it's an individual style (not a prompt sampler mode)
    const isIndividualStyle = selectedStyle && 
      !['custom', 'random', 'randomMix', 'oneOfEach', 'browseGallery'].includes(selectedStyle);
    
    if (isIndividualStyle) {
      try {
        const expectedFilename = generateGalleryFilename(selectedStyle);
        return `/gallery/prompts/${portraitType}/${expectedFilename}`;
      } catch (error) {
        console.warn('Error generating style preview image:', error);
        return null;
      }
    }
    
    return null;
  }, [selectedStyle, portraitType]);

  const handleBrowseClick = () => {
    if (isProcessing) return;
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isProcessing) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (17MB limit)
      if (file.size > 17 * 1024 * 1024) {
        alert("Image must be less than 17MB.");
        // Clear the input
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      
      // Check file type
      if (!file.type.startsWith('image/')) {
        alert("Please select an image file (PNG or JPG).");
        // Clear the input
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      
      // Pass the file to the callback
      onBrowsePhoto(file);
    }
  };

  // Style selector handlers
  const handleStyleClick = () => {
    if (isProcessing) return;
    
    const isFluxKontext = isFluxKontextModel(selectedModel);
    
    if (isFluxKontext) {
      // For Flux Kontext, show the dropdown
      setShowStyleDropdown(true);
    } else {
      // For other models, navigate to the full gallery
      onNavigateToGallery?.();
    }
  };

  const handleStyleSelect = (style: string) => {
    onStyleSelect?.(style);
    setShowStyleDropdown(false);
  };


  return (
    <div className="camera-start-menu">
      <div className="start-menu-content">
        <h1 className="start-menu-title">Sogni Photobooth</h1>
        <div className="start-menu-description">
          Transform yourself with AI-powered style transfer
        </div>
        
        {isProcessing && (
          <div className="processing-message">
            <div className="spinner"></div>
            <div className="message">Processing previous image...</div>
          </div>
        )}

        {/* Style Selector Section */}
        <div className="style-selector-section">
          <h2 className="section-title">PICK A STYLE</h2>
          <button 
            className={`style-selector-button ${isProcessing ? 'disabled' : ''}`}
            onClick={isProcessing ? undefined : handleStyleClick}
            disabled={isProcessing}
          >
            <div className="style-selector-content">
              {stylePreviewImage ? (
                <img 
                  src={stylePreviewImage} 
                  alt={selectedStyle ? styleIdToDisplay(selectedStyle) : 'Style preview'}
                  className="style-preview-image"
                  onError={(e) => {
                    // Fallback to emoji icon if image fails to load
                    e.currentTarget.style.display = 'none';
                    const fallbackIcon = e.currentTarget.nextElementSibling;
                    if (fallbackIcon && fallbackIcon.classList.contains('style-icon-fallback')) {
                      (fallbackIcon as HTMLElement).style.display = 'block';
                    }
                  }}
                />
              ) : null}
              <span className={`style-icon ${stylePreviewImage ? 'style-icon-fallback' : ''}`} style={stylePreviewImage ? { display: 'none' } : {}}>
                🎨
              </span>
              <span className="style-text">
                {selectedStyle === 'custom' ? 'Custom...' : selectedStyle ? styleIdToDisplay(selectedStyle) : 'Select Style'}
              </span>
              <span className="style-arrow">→</span>
            </div>
          </button>
        </div>

        {/* Photo Options Section */}
        <div className="photo-options-section">
          <h2 className="section-title">PICK A PHOTO</h2>
          <div className={`start-menu-options ${isProcessing ? 'disabled' : ''}`}>
            <button 
              className="option-button take-photo"
              onClick={isProcessing ? undefined : onTakePhoto}
              disabled={isProcessing}
            >
              <div className="option-icon">📸</div>
              <div className="option-label">Take Photo</div>
            </button>
            
            <button 
              className="option-button browse-photo"
              onClick={isProcessing ? undefined : handleBrowseClick}
              disabled={isProcessing}
            >
              <div className="option-icon">🖼️</div>
              <div className="option-label">Upload Photo</div>
            </button>
            
            <div className="option-button drag-photo info-only">
              <div className="option-icon">✋</div>
              <div className="option-label">Drag & Drop Photo</div>
            </div>
          </div>
        </div>
        
        <MetricsBar />
      </div>
      
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        accept="image/png, image/jpeg"
        onChange={handleFileSelect}
        disabled={isProcessing}
      />

      {/* Style Dropdown - only show for Flux Kontext models */}
      {showStyleDropdown && (
        <StyleDropdown
          isOpen={showStyleDropdown}
          onClose={() => setShowStyleDropdown(false)}
          selectedStyle={selectedStyle}
          updateStyle={handleStyleSelect}
          defaultStylePrompts={stylePrompts}
          setShowControlOverlay={onShowControlOverlay as any}
          dropdownPosition="bottom"
          triggerButtonClass=".style-selector-button"
          onThemeChange={onThemeChange as any}
          selectedModel={selectedModel as any}
          onGallerySelect={undefined}
          onCustomPromptChange={onCustomPromptChange as any}
          currentCustomPrompt={currentCustomPrompt}
        />
      )}
    </div>
  );
};

export default CameraStartMenu; 