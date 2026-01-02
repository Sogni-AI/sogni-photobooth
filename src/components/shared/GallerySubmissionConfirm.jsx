import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import '../../styles/components/GallerySubmissionConfirm.css';
import { styleIdToDisplay } from '../../utils';
import { createPolaroidImage } from '../../utils/imageProcessing';
import { useSogniAuth } from '../../services/sogniAuth';

/**
 * GallerySubmissionConfirm - Confirmation popup for submitting to gallery
 */
const GallerySubmissionConfirm = ({ 
  isOpen, 
  onConfirm, 
  onCancel,
  promptKey,
  imageUrl,
  videoUrl,
  isStitchedVideo = false
}) => {
  const [polaroidPreview, setPolaroidPreview] = useState(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const { user } = useSogniAuth();
  
  // Check if we're showing a video
  const isVideo = !!videoUrl;
  
  // Generate polaroid preview with username label (only for images)
  useEffect(() => {
    // Skip polaroid generation for videos - we'll show the video directly
    if (isVideo) {
      setPolaroidPreview(null);
      return;
    }
    
    if (!isOpen || !imageUrl || !user?.username) {
      setPolaroidPreview(null);
      return;
    }
    
    const generatePreview = async () => {
      setIsGeneratingPreview(true);
      try {
        const label = `by @${user.username}`;
        const polaroidUrl = await createPolaroidImage(imageUrl, label, {
          tezdevTheme: 'off',
          aspectRatio: null,
          outputFormat: 'png'
        });
        setPolaroidPreview(polaroidUrl);
      } catch (error) {
        console.error('Error generating polaroid preview:', error);
        setPolaroidPreview(imageUrl); // Fallback to original
      } finally {
        setIsGeneratingPreview(false);
      }
    };
    
    generatePreview();
  }, [isOpen, imageUrl, videoUrl, isVideo, user]);
  
  if (!isOpen) return null;

  const promptDisplayName = promptKey ? styleIdToDisplay(promptKey) : 'this prompt';

  return (
    <div className="gallery-confirm-overlay" onClick={onCancel}>
      <div className="gallery-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <button className="gallery-confirm-close" onClick={onCancel}>×</button>
        
        <div className="gallery-confirm-header">
          <svg className="gallery-icon" fill="#764ba2" viewBox="0 0 24 24" width="48" height="48">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
          </svg>
          <h2>Submit to Gallery?</h2>
        </div>
        
        <div className="gallery-confirm-content">
          {(isVideo ? videoUrl : (polaroidPreview || imageUrl)) && (
            <div className="gallery-confirm-preview">
              {isGeneratingPreview ? (
                <div className="preview-loading">
                  <span className="loading-spinner"></span>
                  <p>Preparing preview...</p>
                </div>
              ) : isVideo ? (
                <video 
                  src={videoUrl} 
                  autoPlay 
                  loop 
                  muted 
                  playsInline
                  poster={imageUrl}
                />
              ) : (
                <img src={polaroidPreview || imageUrl} alt="Preview" />
              )}
            </div>
          )}
          
          <p className="gallery-confirm-message">
            {isStitchedVideo
              ? 'Submit this stitched video to the public gallery?'
              : <>Submit this {isVideo ? 'video' : 'photo'} to <strong>{promptDisplayName}</strong>'s public gallery?</>
            }
          </p>
          
          <p className="gallery-confirm-note">
            Your {isVideo ? 'video' : 'image'} will be reviewed by moderators before appearing in the gallery.
            {isStitchedVideo
              ? ' If approved, your stitched video will be visible to other users.'
              : ' If approved, other users will see it as an example when browsing this style.'
            }
          </p>
        </div>
        
        <div className="gallery-confirm-footer">
          <button 
            className="gallery-confirm-btn cancel-btn" 
            onClick={onCancel}
          >
            Cancel
          </button>
          <button 
            className="gallery-confirm-btn submit-btn" 
            onClick={onConfirm}
          >
            <svg fill="currentColor" width="16" height="16" viewBox="0 0 24 24">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            Submit to Gallery
          </button>
        </div>
      </div>
    </div>
  );
};

GallerySubmissionConfirm.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  promptKey: PropTypes.string,
  imageUrl: PropTypes.string,
  videoUrl: PropTypes.string,
  isStitchedVideo: PropTypes.bool
};

export default GallerySubmissionConfirm;

