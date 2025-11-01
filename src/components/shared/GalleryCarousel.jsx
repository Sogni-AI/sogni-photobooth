import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import '../../styles/components/GalleryCarousel.css';

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

  // Reset cached original when promptKey changes
  useEffect(() => {
    setCachedOriginalImageUrl(null);
  }, [promptKey]);

  // Fetch approved gallery submissions for this prompt
  useEffect(() => {
    const fetchGalleryEntries = async () => {
      if (!promptKey) {
        setEntries([]);
        setAllImages([]);
        setLoading(false);
        if (onEntriesLoaded) {
          onEntriesLoaded(0);
        }
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        // Cache the original image URL if not already cached
        if (!cachedOriginalImageUrl && originalImage) {
          const originalUrl = originalImage.originalDataUrl || 
                             originalImage.images?.[0] || 
                             originalImage.imageUrl;
          if (originalUrl) {
            setCachedOriginalImageUrl(originalUrl);
          }
        }
        
        const response = await fetch(`/api/contest/gallery-submissions/approved/${promptKey}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch gallery submissions');
        }
        
        const data = await response.json();
        
        if (data.success) {
          const userEntries = data.entries || [];
          setEntries(userEntries);
          
          // Notify parent of user submission count first
          if (onEntriesLoaded) {
            onEntriesLoaded(userEntries.length);
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
  }, [promptKey, selectedEntryId, originalImage, onEntriesLoaded, cachedOriginalImageUrl]);

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
        if (onImageSelect && allImages[newIndex]) {
          onImageSelect(allImages[newIndex]);
        }
      }
    }
  }, [allImages, selectedIndex, onImageSelect, hasFocus]);

  // Attach keyboard listener
  useEffect(() => {
    if (allImages.length > 0) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
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

  // Handle click on an entry
  const handleEntryClick = useCallback((entry, index, e) => {
    e?.stopPropagation();
    
    // Only update if different index to prevent flicker
    if (index === selectedIndex) return;
    
    setSelectedIndex(index);
    if (onImageSelect) {
      onImageSelect(entry);
    }
  }, [selectedIndex, onImageSelect]);

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
          <div
            key={entry.id}
            className={`gallery-carousel-item ${index === selectedIndex ? 'selected' : ''}`}
            onClick={(e) => handleEntryClick(entry, index, e)}
          >
            <div className="gallery-carousel-polaroid">
              <div className="gallery-carousel-image-wrapper">
                <img 
                  src={entry.imageUrl} 
                  alt={`Gallery submission by ${entry.username || 'Anonymous'}`}
                  loading="lazy"
                />
              </div>
              <div className="gallery-carousel-label">
                {entry.isOriginal ? 'Sample' : `@${entry.username || 'Anonymous'}`}
              </div>
            </div>
            {index === selectedIndex && (
              <div className="gallery-carousel-selected-indicator">▲</div>
            )}
          </div>
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

export default GalleryCarousel;

