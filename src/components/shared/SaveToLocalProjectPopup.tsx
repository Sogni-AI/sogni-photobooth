import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import '../../styles/components/SaveToLocalProjectPopup.css';

interface PhotoData {
  id: string;
  images?: string[];
  promptKey?: string;
  customSceneName?: string;
  stylePrompt?: string;
  positivePrompt?: string;
  hidden?: boolean;
  loading?: boolean;
  generating?: boolean;
  error?: boolean;
}

interface SaveToLocalProjectPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (projectName: string) => Promise<void>;
  defaultName: string;
  imageCount: number;
  isSaving?: boolean;
}

const SaveToLocalProjectPopup: React.FC<SaveToLocalProjectPopupProps> = ({
  isOpen,
  onClose,
  onSave,
  defaultName,
  imageCount,
  isSaving = false
}) => {
  const [projectName, setProjectName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update project name when default changes
  useEffect(() => {
    setProjectName(defaultName);
  }, [defaultName]);

  // Focus input when popup opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, isSaving]);

  // Handle overlay click to close
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isSaving) {
      onClose();
    }
  };

  // Handle save
  const handleSave = useCallback(async () => {
    const trimmedName = projectName.trim();
    if (!trimmedName) {
      setError('Please enter a project name');
      return;
    }

    setError(null);
    await onSave(trimmedName);
  }, [projectName, onSave]);

  // Handle enter key in input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSaving) {
      handleSave();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="save-project-overlay"
      onClick={handleOverlayClick}
    >
      <div
        className="save-project-modal"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="save-project-close"
          onClick={onClose}
          disabled={isSaving}
        >
          ×
        </button>

        <div className="save-project-header">
          <div className="save-project-icon">💾</div>
          <h2>Save to Local Project</h2>
        </div>

        <div className="save-project-content">
          <p className="save-project-description">
            Save {imageCount} image{imageCount !== 1 ? 's' : ''} to a new local project.
            You can access it anytime from the Recent Projects tab.
          </p>

          <div className="save-project-input-group">
            <label htmlFor="project-name">Project Name</label>
            <input
              ref={inputRef}
              id="project-name"
              type="text"
              value={projectName}
              onChange={(e) => {
                setProjectName(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Enter project name..."
              disabled={isSaving}
              maxLength={100}
            />
            {error && <span className="save-project-error">{error}</span>}
          </div>
        </div>

        <div className="save-project-footer">
          <button
            className="save-project-btn secondary"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            className="save-project-btn primary"
            onClick={handleSave}
            disabled={isSaving || !projectName.trim()}
          >
            {isSaving ? (
              <>
                <span className="save-project-spinner"></span>
                Saving...
              </>
            ) : (
              'Save Project'
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SaveToLocalProjectPopup;

// Helper function to generate a clever default project name from photos
export function generateDefaultProjectName(
  photos: PhotoData[],
  styleIdToDisplay: (id: string) => string
): string {
  // Filter to only completed photos
  const completedPhotos = photos.filter(
    p => !p.hidden && !p.loading && !p.generating && !p.error && p.images && p.images.length > 0
  );

  if (completedPhotos.length === 0) {
    return 'New Project';
  }

  // Collect style names from photos
  const styleNames: string[] = [];

  for (const photo of completedPhotos) {
    let styleName = '';

    // Try custom scene name first
    if (photo.customSceneName) {
      styleName = photo.customSceneName;
    }
    // Try promptKey
    else if (photo.promptKey &&
             photo.promptKey !== 'custom' &&
             photo.promptKey !== 'random' &&
             photo.promptKey !== 'randomMix' &&
             photo.promptKey !== 'browseGallery') {
      styleName = styleIdToDisplay(photo.promptKey);
    }

    if (styleName) {
      styleNames.push(styleName);
    }
  }

  if (styleNames.length === 0) {
    return 'New Project';
  }

  // Count occurrences of each style
  const styleCounts = new Map<string, number>();
  for (const name of styleNames) {
    styleCounts.set(name, (styleCounts.get(name) || 0) + 1);
  }

  // If all photos have the same style
  if (styleCounts.size === 1) {
    return styleNames[0];
  }

  // If there's a dominant style (>50% of photos), use it
  const totalPhotos = styleNames.length;
  for (const [name, count] of styleCounts.entries()) {
    if (count > totalPhotos / 2) {
      return name;
    }
  }

  // If we have 2-3 unique styles, list them
  if (styleCounts.size <= 3) {
    const uniqueStyles = Array.from(styleCounts.keys());
    return uniqueStyles.join(' + ');
  }

  // Many different styles
  return 'Mixed Styles';
}
