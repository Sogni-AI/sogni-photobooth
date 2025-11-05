import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import PropTypes from 'prop-types';
import '../../styles/components/GalleryCarousel.css';

/**
 * Memoized carousel item to prevent unnecessary re-renders
 */
const GalleryCarouselItem = memo(({ entry, index, isSelected, onClick }) => {
  const tooltipRef = useRef(null);

  const handleMouseEnter = (e) => {
    const tooltip = tooltipRef.current;
    if (!tooltip) return;

    const rect = e.currentTarget.getBoundingClientRect();
    tooltip.style.left = `${rect.left + rect.width / 2}px`;
    tooltip.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    tooltip.style.transform = 'translateX(-50%)';
  };

  return (
    <div
      className={`gallery-carousel-item ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
    >
      <div className="gallery-carousel-image-wrapper">
        <img
          src={entry.imageUrl}
          alt={`Gallery submission by ${entry.username || 'Anonymous'}`}
          loading="lazy"
        />
      </div>
      {isSelected && (
        <div className="gallery-carousel-selected-indicator">▲</div>
      )}
      {/* Show seed tooltip for all submissions - positioned via JS */}
      <div className="gallery-carousel-seed-tooltip" ref={tooltipRef}>
        {!entry.isOriginal && entry.metadata?.seed !== undefined && entry.metadata?.seed !== null && (
          <div>Seed: {entry.metadata.seed}</div>
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
  onClick: PropTypes.func.isRequired
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
  showKeyboardHint = true
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
  showKeyboardHint: PropTypes.bool
};

// Custom comparison function to prevent unnecessary re-renders
// Only re-render if promptKey or selectedEntryId actually changes
const areEqual = (prevProps, nextProps) => {
  return prevProps.promptKey === nextProps.promptKey &&
         prevProps.selectedEntryId === nextProps.selectedEntryId;
};

export default memo(GalleryCarousel, areEqual);

