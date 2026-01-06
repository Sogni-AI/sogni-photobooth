import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import PropTypes from 'prop-types';
import '../../styles/components/GalleryCarousel.css';

/**
 * Memoized carousel item to prevent unnecessary re-renders
 */
const GalleryCarouselItem = memo(({ entry, index, isSelected, onClick, onModelClick }) => {
  const tooltipRef = useRef(null);

  const handleMouseEnter = (e) => {
    const tooltip = tooltipRef.current;
    if (!tooltip) return;

    const rect = e.currentTarget.getBoundingClientRect();
    tooltip.style.left = `${rect.left + rect.width / 2}px`;
    tooltip.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    tooltip.style.transform = 'translateX(-50%)';
  };

  const handleModelClick = (e) => {
    e.stopPropagation(); // Prevent triggering the image click
    console.log('🤖 [GalleryCarouselItem] Model clicked:', entry.metadata?.model);
    if (onModelClick && entry.metadata?.model) {
      console.log('🤖 [GalleryCarouselItem] Calling onModelClick with:', entry.metadata.model);
      onModelClick(entry.metadata.model);
    } else {
      console.warn('🤖 [GalleryCarouselItem] Cannot switch model:', {
        hasCallback: !!onModelClick,
        hasModel: !!entry.metadata?.model,
        model: entry.metadata?.model
      });
    }
  };

  // Get model display name
  const getModelDisplayName = (modelId) => {
    if (!modelId) return null;
    
    // Map model IDs to clean display names
    const modelMap = {
      'coreml-sogniXLturbo_alpha1_ad': 'SOGNI.XLT',
      'coreml-dreamshaperXL_v21TurboDPMSDE': 'DreamShaper',
      'coreml-juggernautXL_v9Rdphoto2Lightning': 'JuggernautXL',
      'coreml-wildcardxXLLIGHTNING_wildcardxXL': 'WildcardX',
      'coreml-realvisxlV40_v40LightningBakedvae': 'RealVisXL',
      'coreml-realDream_sdxlLightning1': 'RealDream',
      'coreml-fenrisxl_SDXLLightning': 'FenrisXL',
      'coreml-epicrealismXL_VXIAbeast4SLightning': 'epiCRealism XL',
      'qwen_image_edit_2511_fp8_lightning': 'Qwen Image Edit 2511 Lightning',
      'qwen_image_edit_2511_fp8': 'Qwen Image Edit 2511',
      'flux1-dev-kontext_fp8_scaled': 'Flux.1 Kontext',
      'flux2_dev_fp8': 'Flux.2 [dev]'
    };
    
    // Return mapped name or fallback to shortened version
    if (modelMap[modelId]) {
      return modelMap[modelId];
    }
    
    // Fallback: try to extract a readable name from the ID
    if (modelId.includes('qwen')) return 'Qwen Image Edit';
    if (modelId.includes('flux2')) return 'Flux.2 [dev]';
    if (modelId.includes('kontext')) return 'Flux.1 Kontext';
    if (modelId.includes('flux1')) return 'Flux.1';
    if (modelId.includes('sogni')) return 'SOGNI.XLT';
    if (modelId.includes('dreamshaper')) return 'DreamShaper';
    if (modelId.includes('juggernaut')) return 'JuggernautXL';
    if (modelId.includes('wildcard')) return 'WildcardX';
    if (modelId.includes('realvis')) return 'RealVisXL';
    if (modelId.includes('realdream')) return 'RealDream';
    if (modelId.includes('fenris')) return 'FenrisXL';
    if (modelId.includes('epicrealism')) return 'epiCRealism XL';
    
    // Last resort: return the ID as-is
    return modelId;
  };

  return (
    <div
      className={`gallery-carousel-item ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
    >
      <div className="gallery-carousel-image-wrapper">
        {entry.videoUrl ? (
          <video
            src={entry.videoUrl}
            poster={entry.imageUrl}
            loop
            muted
            playsInline
            autoPlay={isSelected}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              background: '#000'
            }}
          />
        ) : (
          <img
            src={entry.imageUrl}
            alt={`Gallery submission by ${entry.username || 'Anonymous'}`}
            loading="lazy"
          />
        )}
      </div>
      {isSelected && (
        <div className="gallery-carousel-selected-indicator">▲</div>
      )}
      {/* Show seed tooltip for all submissions - positioned via JS */}
      <div className="gallery-carousel-seed-tooltip" ref={tooltipRef}>
        {!entry.isOriginal && entry.metadata?.seed !== undefined && entry.metadata?.seed !== null && (
          <div>Seed: {entry.metadata.seed}</div>
        )}
        {!entry.isOriginal && entry.metadata?.model && (
          <div 
            className="model-info clickable"
            onClick={handleModelClick}
            title="Click to switch to this model"
          >
            🤖 {getModelDisplayName(entry.metadata.model)}
          </div>
        )}
        <div className="username">
          {entry.isOriginal ? 'Style' : `@${entry.username || 'Anonymous'}`}
        </div>
      </div>
    </div>
  );
});

GalleryCarouselItem.displayName = 'GalleryCarouselItem';

GalleryCarouselItem.propTypes = {
  entry: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
  isSelected: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
  onModelClick: PropTypes.func
};

/**
 * GalleryCarousel - Displays approved UGC gallery submissions for a specific prompt
 * Shows as a horizontal scrollable carousel of mini polaroids
 */
const GalleryCarousel = ({ 
  promptKey, 
  originalImage = null,
  onImageSelect,
  onEntriesLoaded,
  selectedEntryId = null,
  showKeyboardHint = true,
  onModelSelect = null
}) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allImages, setAllImages] = useState([]);
  const [cachedOriginalImageUrl, setCachedOriginalImageUrl] = useState(null);
  
  // Use refs to avoid dependency issues
  const onImageSelectRef = useRef(onImageSelect);
  const onEntriesLoadedRef = useRef(onEntriesLoaded);
  
  useEffect(() => {
    onImageSelectRef.current = onImageSelect;
    onEntriesLoadedRef.current = onEntriesLoaded;
  }, [onImageSelect, onEntriesLoaded]);

  // Reset cached original when promptKey changes
  useEffect(() => {
    setCachedOriginalImageUrl(null);
  }, [promptKey]);

  // Cache original image URL when originalImage changes
  useEffect(() => {
    if (originalImage && !cachedOriginalImageUrl) {
      const originalUrl = originalImage.originalDataUrl || 
                         originalImage.images?.[0] || 
                         originalImage.imageUrl;
      if (originalUrl) {
        setCachedOriginalImageUrl(originalUrl);
      }
    }
  }, [originalImage, cachedOriginalImageUrl]);

  // Fetch approved gallery submissions for this prompt
  useEffect(() => {
    const fetchGalleryEntries = async () => {
      if (!promptKey) {
        setEntries([]);
        setAllImages([]);
        setLoading(false);
        if (onEntriesLoadedRef.current) {
          onEntriesLoadedRef.current(0);
        }
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`/api/contest/gallery-submissions/approved/${promptKey}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch gallery submissions');
        }
        
        const data = await response.json();
        
        if (data.success) {
          const userEntries = data.entries || [];
          setEntries(userEntries);
          
          // Notify parent of user submission count first
          if (onEntriesLoadedRef.current) {
            onEntriesLoadedRef.current(userEntries.length);
          }
          
          // Only show carousel if there are user submissions
          // Don't show if only the original sample exists
          if (userEntries.length === 0) {
            setAllImages([]);
            return;
          }
          
          // Combine original sample image with user entries
          const combined = [];
          
          // Add original sample image first - use the cached URL to prevent replacement
          if (cachedOriginalImageUrl) {
            combined.push({
              id: 'original-sample',
              imageUrl: cachedOriginalImageUrl,
              username: null, // No username for sample
              isOriginal: true
            });
          }
          
          // Add user submissions
          combined.push(...userEntries);
          
          setAllImages(combined);
          
          // If we have a selectedEntryId, find its index (accounting for original)
          if (selectedEntryId && combined.length > 0) {
            const index = combined.findIndex(entry => entry.id === selectedEntryId);
            if (index !== -1) {
              setSelectedIndex(index);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching gallery submissions:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchGalleryEntries();
  }, [promptKey, selectedEntryId, cachedOriginalImageUrl]);

  // Handle keyboard navigation
  const [hasFocus, setHasFocus] = useState(false);

  const handleKeyDown = useCallback((e) => {
    // Only handle arrow keys when carousel has focus
    if (allImages.length === 0 || !hasFocus) return;
    
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      
      const newIndex = e.key === 'ArrowLeft' 
        ? (selectedIndex > 0 ? selectedIndex - 1 : allImages.length - 1)
        : (selectedIndex < allImages.length - 1 ? selectedIndex + 1 : 0);
      
      if (newIndex !== selectedIndex) {
        setSelectedIndex(newIndex);
        if (onImageSelectRef.current && allImages[newIndex]) {
          onImageSelectRef.current(allImages[newIndex]);
        }
      }
    }
  }, [allImages, selectedIndex, hasFocus]);

  // Attach keyboard listener with capture phase to intercept before other handlers
  useEffect(() => {
    if (allImages.length > 0) {
      window.addEventListener('keydown', handleKeyDown, true); // Use capture phase
      return () => window.removeEventListener('keydown', handleKeyDown, true);
    }
  }, [allImages.length, handleKeyDown]);

  // Preload images to prevent flicker
  useEffect(() => {
    allImages.forEach(entry => {
      if (entry.imageUrl) {
        const img = new Image();
        img.src = entry.imageUrl;
      }
    });
  }, [allImages]);

  // Handle model click - switch to the selected model
  const handleModelClick = useCallback((modelId) => {
    console.log(`🤖 [GalleryCarousel] Switching to model: ${modelId}`);
    if (onModelSelect) {
      console.log(`🤖 [GalleryCarousel] Calling onModelSelect`);
      onModelSelect(modelId);
    } else {
      console.warn('🤖 [GalleryCarousel] onModelSelect callback not provided!');
    }
  }, [onModelSelect]);

  // Handle click on an entry - keep callback stable to prevent re-renders
  const handleEntryClick = useCallback((entry, index, e) => {
    e?.stopPropagation();
    setSelectedIndex(index);
    if (onImageSelectRef.current) {
      onImageSelectRef.current(entry);
    }
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    const selectedElement = document.querySelector('.gallery-carousel-item.selected');
    if (selectedElement) {
      selectedElement.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'nearest', 
        inline: 'center' 
      });
    }
  }, [selectedIndex]);

  // Don't render anything while loading, on error, or if there are no images
  if (loading || allImages.length === 0 || error) {
    return null;
  }

  return (
    <div
      className="gallery-carousel"
      onMouseEnter={() => setHasFocus(true)}
      onMouseLeave={() => setHasFocus(false)}
      onClick={() => setHasFocus(true)}
    >
      <div className="gallery-carousel-header">
        <h3>Community Gallery</h3>
      </div>

      <div className="gallery-carousel-track">
        {allImages.map((entry, index) => (
          <GalleryCarouselItem
            key={entry.id}
            entry={entry}
            index={index}
            isSelected={index === selectedIndex}
            onClick={(e) => handleEntryClick(entry, index, e)}
            onModelClick={handleModelClick}
          />
        ))}
      </div>
    </div>
  );
};

GalleryCarousel.propTypes = {
  promptKey: PropTypes.string.isRequired,
  originalImage: PropTypes.object,
  onImageSelect: PropTypes.func,
  onEntriesLoaded: PropTypes.func,
  selectedEntryId: PropTypes.string,
  showKeyboardHint: PropTypes.bool,
  onModelSelect: PropTypes.func
};

// Custom comparison function to prevent unnecessary re-renders
// Only re-render if promptKey or selectedEntryId actually changes
const areEqual = (prevProps, nextProps) => {
  return prevProps.promptKey === nextProps.promptKey &&
         prevProps.selectedEntryId === nextProps.selectedEntryId;
};

export default memo(GalleryCarousel, areEqual);

