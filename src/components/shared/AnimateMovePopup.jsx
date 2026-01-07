import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { getTokenLabel } from '../../services/walletService';

// Sample motion videos for Animate Move
const SAMPLE_MOTION_VIDEOS = [
  {
    id: 'lil-yacty',
    title: '🚶 Yacty Walkout',
    description: '',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/video-samples/lil-yacty-walkout.mp4'
  },
  {
    id: 'm-to-the-beat',
    title: '🎵 M to the Beat',
    description: '',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/video-samples/m-to-the-beat.mp4'
  },
  {
    id: 'ra-ra',
    title: '💃 Ra Ra Dance',
    description: '',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/video-samples/ra-ra.mp4'
  },
  {
    id: 'techno-viking',
    title: '⚔️ Techno Viking',
    description: '',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/video-samples/techno-viking.mp4'
  },
  {
    id: 'viral-dance',
    title: '🕺 Viral Dance',
    description: 'Trending dance moves',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/video-samples/viral-dance.mp4'
  }
];

const MAX_DURATION = 20; // Max 20 seconds

/**
 * AnimateMovePopup
 * Popup for Animate Move video generation - applies camera movement from a source video to reference image
 */
const AnimateMovePopup = ({
  visible,
  onConfirm,
  onClose,
  loading,
  costRaw,
  costUSD,
  videoResolution,
  tokenType = 'spark',
  isBatch = false,
  itemCount = 1,
  modelVariant: externalModelVariant,
  onModelVariantChange,
  videoDuration: externalVideoDuration,
  onDurationChange
}) => {
  const [positivePrompt, setPositivePrompt] = useState('High quality animation with smooth natural camera movement');
  const [negativePrompt, setNegativePrompt] = useState('blurry, low quality, static, deformed, overexposed, worst quality, JPEG compression');
  const [sourceType, setSourceType] = useState('sample'); // 'sample' or 'upload'
  const [selectedSample, setSelectedSample] = useState(null);
  const [uploadedVideo, setUploadedVideo] = useState(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState(null);
  const [error, setError] = useState('');
  
  // Use external model variant state if provided (for cost estimation), otherwise use internal
  const modelVariant = externalModelVariant !== undefined ? externalModelVariant : 'speed';
  const setModelVariant = onModelVariantChange || (() => {});

  // Duration state - use external if provided for cost estimation
  const [internalVideoDuration, setInternalVideoDuration] = useState(5);
  const [sliderDuration, setSliderDuration] = useState(5); // Local slider value for smooth dragging
  const videoDuration = externalVideoDuration !== undefined ? externalVideoDuration : internalVideoDuration;
  const setVideoDuration = (value, updateParent = true) => {
    setInternalVideoDuration(value);
    setSliderDuration(value);
    if (updateParent && onDurationChange) onDurationChange(value);
  };
  // Commit slider value to parent (only called on release)
  const commitDuration = (value) => {
    setInternalVideoDuration(value);
    if (onDurationChange) onDurationChange(value);
  };
  
  // Sync slider with external duration changes
  useEffect(() => {
    if (externalVideoDuration !== undefined) {
      setSliderDuration(externalVideoDuration);
      setInternalVideoDuration(externalVideoDuration);
    }
  }, [externalVideoDuration]);
  
  const [sourceVideoDuration, setSourceVideoDuration] = useState(0);

  const videoInputRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 768;

  // Cleanup uploaded video URL on unmount
  useEffect(() => {
    return () => {
      if (uploadedVideoUrl) {
        URL.revokeObjectURL(uploadedVideoUrl);
      }
    };
  }, [uploadedVideoUrl]);

  // Reset state when popup opens
  useEffect(() => {
    if (visible) {
      setError('');
    }
  }, [visible]);

  // Preload all sample videos when popup opens (iOS fix - matches VideoSelectionPopup approach)
  useEffect(() => {
    if (!visible) return;

    // Get all sample video URLs
    const allVideoUrls = SAMPLE_MOTION_VIDEOS.map(sample => sample.url);

    // Add link preload tags to head for faster loading
    const preloadLinks = allVideoUrls.map(videoUrl => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'video';
      link.href = videoUrl;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
      return link;
    });

    // Also preload all videos in hidden elements to cache them on iOS
    const preloadVideoElements = allVideoUrls.map((videoUrl) => {
      const preloadVideo = document.createElement('video');
      preloadVideo.src = videoUrl;
      preloadVideo.preload = 'auto';
      preloadVideo.muted = true;
      preloadVideo.playsInline = true;
      preloadVideo.style.display = 'none';
      document.body.appendChild(preloadVideo);
      return preloadVideo;
    });

    // Remove preload videos after a delay to allow caching
    const preloadTimeout = setTimeout(() => {
      preloadVideoElements.forEach(video => {
        if (document.body.contains(video)) {
          document.body.removeChild(video);
        }
      });
    }, 2000);

    // Cleanup function
    return () => {
      clearTimeout(preloadTimeout);
      preloadLinks.forEach(link => {
        if (document.head.contains(link)) {
          document.head.removeChild(link);
        }
      });
      preloadVideoElements.forEach(video => {
        if (document.body.contains(video)) {
          document.body.removeChild(video);
        }
      });
    };
  }, [visible]);

  // Get video duration when loaded
  const handleVideoLoadedMetadata = useCallback(() => {
    if (videoPreviewRef.current) {
      const duration = videoPreviewRef.current.duration;
      setSourceVideoDuration(duration);
      // Set default duration to source video duration or MAX_DURATION, whichever is smaller
      // Round down to nearest 0.25s to ensure frame count is divisible at 16fps
      const defaultDuration = Math.min(duration, MAX_DURATION);
      const roundedDuration = Math.floor(defaultDuration * 4) / 4;
      setVideoDuration(roundedDuration);
    }
  }, []);

  const handleVideoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('video/')) {
        setError('Please upload a valid video file');
        return;
      }
      // Validate file size (max 100MB)
      if (file.size > 100 * 1024 * 1024) {
        setError('Video file must be less than 100MB');
        return;
      }

      setUploadedVideo(file);
      setSourceType('upload');
      setSelectedSample(null);
      setError('');
      setSourceVideoDuration(0);

      // Create preview URL
      if (uploadedVideoUrl) {
        URL.revokeObjectURL(uploadedVideoUrl);
      }
      setUploadedVideoUrl(URL.createObjectURL(file));
    }
  };

  const handleSampleSelect = (sample) => {
    setSelectedSample(sample);
    setSourceType('sample');
    setUploadedVideo(null);
    if (uploadedVideoUrl) {
      URL.revokeObjectURL(uploadedVideoUrl);
      setUploadedVideoUrl(null);
    }
    setError('');
    
    // Load the sample video to get its duration
    const tempVideo = document.createElement('video');
    tempVideo.src = sample.url;
    tempVideo.preload = 'metadata';
    tempVideo.onloadedmetadata = () => {
      const duration = tempVideo.duration;
      setSourceVideoDuration(duration);
      // Set default duration to source video duration or MAX_DURATION, whichever is smaller
      // Round down to nearest 0.25s to ensure frame count is divisible at 16fps
      const defaultDuration = Math.min(duration, MAX_DURATION);
      const roundedDuration = Math.floor(defaultDuration * 4) / 4;
      setVideoDuration(roundedDuration);
      // Clean up
      tempVideo.remove();
    };
  };

  const formatCost = (tokenCost, usdCost) => {
    if (!tokenCost || !usdCost) return null;
    const formattedTokenCost = typeof tokenCost === 'number' ? tokenCost.toFixed(2) : parseFloat(tokenCost).toFixed(2);
    return `${formattedTokenCost} (≈ $${usdCost.toFixed(2)} USD)`;
  };

  const handleConfirm = async () => {
    // Validate source video selection
    if (sourceType === 'sample' && !selectedSample) {
      setError('Please select a motion style or upload a video');
      return;
    }
    if (sourceType === 'upload' && !uploadedVideo) {
      setError('Please upload a source video');
      return;
    }

    setError('');

    // Get video data
    let videoData = null;
    let videoUrl = null;

    if (sourceType === 'upload' && uploadedVideo) {
      // Read file as buffer
      const arrayBuffer = await uploadedVideo.arrayBuffer();
      videoData = new Uint8Array(arrayBuffer);
    } else if (sourceType === 'sample' && selectedSample) {
      videoUrl = selectedSample.url;
    }

    onConfirm({
      positivePrompt: positivePrompt.trim(),
      negativePrompt: negativePrompt.trim(),
      videoData,
      videoUrl,
      videoDuration,
      workflowType: 'animate-move',
      modelVariant // Pass the selected model variant
    });
  };

  const handleClose = () => {
    setPositivePrompt('High quality animation with smooth natural camera movement');
    setNegativePrompt('blurry, low quality, static, deformed, overexposed, worst quality, JPEG compression');
    setSourceType('sample');
    setSelectedSample(null);
    setUploadedVideo(null);
    if (uploadedVideoUrl) {
      URL.revokeObjectURL(uploadedVideoUrl);
      setUploadedVideoUrl(null);
    }
    setError('');
    setVideoDuration(5);
    setSourceVideoDuration(0);
    onClose();
  };

  if (!visible) return null;

  const hasValidSource = (sourceType === 'sample' && selectedSample) || (sourceType === 'upload' && uploadedVideo);
  // Round max duration down to nearest 0.25s to ensure frame count is divisible at 16fps
  const maxDuration = sourceVideoDuration > 0 ? Math.floor(Math.min(sourceVideoDuration, MAX_DURATION) * 4) / 4 : MAX_DURATION;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: isMobile ? '10px' : '20px',
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.2s ease',
        overflowY: 'auto'
      }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
          borderRadius: isMobile ? '16px' : '20px',
          padding: isMobile ? '20px' : '30px',
          maxWidth: isMobile ? '550px' : '750px',
          width: '100%',
          maxHeight: isMobile ? '95vh' : '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(6, 182, 212, 0.5)',
          animation: 'slideUp 0.3s ease',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          style={{
            position: 'absolute',
            top: '15px',
            right: '15px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255, 255, 255, 0.2)',
            color: 'white',
            fontSize: '20px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            zIndex: 10
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          ×
        </button>

        {/* Header */}
        <div style={{ marginBottom: '20px', textAlign: 'center' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: isMobile ? '32px' : '40px' }}>🎬</span>
            <h2 style={{
              margin: 0,
              color: 'white',
              fontSize: isMobile ? '22px' : '28px',
              fontWeight: '700',
              fontFamily: '"Permanent Marker", cursive'
            }}>
              Animate Move{isBatch ? ' (Batch)' : ''}
            </h2>
          </div>
          <p style={{
            margin: 0,
            color: 'rgba(255, 255, 255, 0.85)',
            fontSize: isMobile ? '12px' : '14px'
          }}>
            Transfer character movement from a video to your image
          </p>
        </div>

        {/* Source Video Section */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '12px',
          padding: isMobile ? '14px' : '16px',
          marginBottom: '16px'
        }}>
          <label style={{
            display: 'block',
            color: 'white',
            fontSize: '13px',
            fontWeight: '600',
            marginBottom: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            📹 Source Motion Video
          </label>

          {/* Sample Videos Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)',
              gap: '10px',
              marginBottom: '12px'
            }}
          >
            {SAMPLE_MOTION_VIDEOS.map((sample) => (
              <button
                key={sample.id}
                onClick={() => handleSampleSelect(sample)}
                style={{
                  position: 'relative',
                  padding: 0,
                  borderRadius: '10px',
                  border: selectedSample?.id === sample.id
                    ? '3px solid white'
                    : '3px solid rgba(255, 255, 255, 0.3)',
                  background: 'rgba(0, 0, 0, 0.3)',
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  overflow: 'hidden',
                  aspectRatio: '9/16',
                  display: 'flex',
                  flexDirection: 'column'
                }}
                onMouseEnter={(e) => {
                  const video = e.currentTarget.querySelector('video');
                  if (video) video.play().catch(() => {});
                }}
                onMouseLeave={(e) => {
                  const video = e.currentTarget.querySelector('video');
                  if (video) {
                    video.pause();
                    video.currentTime = 0;
                  }
                }}
              >
                <video
                  src={sample.url}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="auto"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    pointerEvents: 'none'
                  }}
                />
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
                  padding: '6px 8px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                    {sample.title}
                  </div>
                  <div style={{ fontSize: '9px', opacity: 0.8, marginTop: '2px', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                    {sample.description}
                  </div>
                </div>
                {selectedSample?.id === sample.id && (
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                  }}>
                    ✓
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Or divider */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            margin: '12px 0',
            color: 'rgba(255, 255, 255, 0.6)',
            fontSize: '11px'
          }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.3)' }} />
            <span>or upload your own</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.3)' }} />
          </div>

          {/* Upload Button */}
          <input
            type="file"
            ref={videoInputRef}
            accept="video/*"
            style={{ display: 'none' }}
            onChange={handleVideoUpload}
          />
          <button
            onClick={() => videoInputRef.current?.click()}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: uploadedVideo
                ? '2px solid rgba(76, 175, 80, 0.8)'
                : '2px dashed rgba(255, 255, 255, 0.4)',
              background: uploadedVideo
                ? 'rgba(76, 175, 80, 0.3)'
                : 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              transition: 'all 0.2s ease'
            }}
          >
            {uploadedVideo ? `✅ ${uploadedVideo.name}` : '📁 Upload Motion Video (MP4)'}
          </button>

          {/* Video Preview */}
          {uploadedVideoUrl && (
            <div style={{
              marginTop: '12px',
              borderRadius: '8px',
              overflow: 'hidden',
              background: 'rgba(0, 0, 0, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              maxHeight: isMobile ? '180px' : '160px'
            }}>
              <video
                ref={videoPreviewRef}
                src={uploadedVideoUrl}
                autoPlay
                muted
                loop
                playsInline
                onLoadedMetadata={handleVideoLoadedMetadata}
                style={{
                  maxWidth: '100%',
                  maxHeight: isMobile ? '180px' : '160px',
                  width: 'auto',
                  height: 'auto',
                  objectFit: 'contain',
                  borderRadius: '8px'
                }}
              />
            </div>
          )}

          {/* Video duration info */}
          {sourceVideoDuration > 0 && (
            <div style={{
              marginTop: '8px',
              fontSize: '11px',
              color: 'rgba(255, 255, 255, 0.7)',
              textAlign: 'center'
            }}>
              Source video: {Math.round(sourceVideoDuration)}s
            </div>
          )}
        </div>

        {/* Duration Slider */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '12px',
          padding: isMobile ? '14px' : '16px',
          marginBottom: '16px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px'
          }}>
            <label style={{
              color: 'white',
              fontSize: '13px',
              fontWeight: '600'
            }}>
              ⏱️ Output Duration
            </label>
            <span style={{
              color: 'white',
              fontSize: '16px',
              fontWeight: '700',
              background: 'rgba(255, 255, 255, 0.2)',
              padding: '4px 12px',
              borderRadius: '6px'
            }}>
              {sliderDuration}s
            </span>
          </div>
          <input
            type="range"
            min="0.25"
            max={maxDuration}
            step="0.25"
            value={sliderDuration}
            onChange={(e) => {
              const newDuration = parseFloat(e.target.value);
              setSliderDuration(newDuration);
              setInternalVideoDuration(newDuration);
            }}
            onMouseUp={(e) => {
              const newDuration = parseFloat(e.target.value);
              commitDuration(newDuration);
            }}
            onTouchEnd={(e) => {
              const newDuration = parseFloat(e.target.value);
              commitDuration(newDuration);
            }}
            style={{
              width: '100%',
              height: '8px',
              borderRadius: '4px',
              background: `linear-gradient(to right, white ${(sliderDuration / maxDuration) * 100}%, rgba(255,255,255,0.3) ${(sliderDuration / maxDuration) * 100}%)`,
              outline: 'none',
              cursor: 'pointer',
              WebkitAppearance: 'none'
            }}
          />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '6px',
            fontSize: '10px',
            color: 'rgba(255, 255, 255, 0.7)'
          }}>
            <span>0.25s</span>
            <span>{maxDuration}s max</span>
          </div>
        </div>

        {/* Prompt Section */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: '13px',
            fontWeight: '600',
            marginBottom: '6px'
          }}>
            ✨ Motion Description (Optional)
          </label>
          <textarea
            value={positivePrompt}
            onChange={(e) => setPositivePrompt(e.target.value)}
            placeholder="Describe the desired motion style..."
            rows={2}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '2px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              fontSize: '13px',
              fontFamily: 'inherit',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            padding: '10px 12px',
            background: 'rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            marginBottom: '16px',
            color: 'white',
            fontSize: '13px',
            fontWeight: '500',
            textAlign: 'center'
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '12px'
        }}>
          <button
            type="button"
            onClick={handleClose}
            style={{
              flex: 1,
              padding: isMobile ? '12px' : '14px',
              borderRadius: '12px',
              border: '2px solid rgba(255, 255, 255, 0.4)',
              background: 'transparent',
              color: 'white',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || !hasValidSource}
            style={{
              flex: 2,
              padding: isMobile ? '12px' : '14px',
              borderRadius: '12px',
              border: 'none',
              background: loading || !hasValidSource
                ? 'rgba(255, 255, 255, 0.3)'
                : 'white',
              color: loading || !hasValidSource
                ? 'rgba(255, 255, 255, 0.7)'
                : '#0891b2',
              fontSize: '14px',
              fontWeight: '700',
              cursor: loading || !hasValidSource ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: loading || !hasValidSource ? 'none' : '0 4px 15px rgba(255, 255, 255, 0.3)'
            }}
          >
            {loading
              ? '⏳ Calculating...'
              : isBatch
                ? `🎬 Generate ${itemCount} Videos`
                : '🎬 Generate Animate Move'
            }
          </button>
        </div>

        {/* Cost Footer */}
        {!loading && formatCost(costRaw, costUSD) ? (
          <div style={{
            padding: '8px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.15)',
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: '11px',
            textAlign: 'center'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: '10px', fontWeight: '500', opacity: 0.8 }}>
                {`${isBatch ? `📹 ${itemCount} videos • ` : ''}📐 ${videoResolution || '480p'} • ⏱️ ${sliderDuration}s`}
              </span>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {costRaw && (
                  <span style={{ fontSize: '11px', fontWeight: '700', color: 'white' }}>
                    {(() => {
                      const costValue = typeof costRaw === 'number' ? costRaw : parseFloat(costRaw);
                      if (isNaN(costValue)) return null;
                      const tokenLabel = getTokenLabel(tokenType);
                      return `${costValue.toFixed(2)} ${tokenLabel}`;
                    })()}
                  </span>
                )}
                {costUSD && (
                  <span style={{ fontWeight: '400', opacity: 0.75, fontSize: '10px' }}>
                    ≈ ${costUSD.toFixed(2)} USD
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : loading ? (
          <div style={{
            padding: '8px 16px',
            fontSize: '11px',
            fontWeight: '700',
            textAlign: 'center',
            borderTop: '1px solid rgba(255, 255, 255, 0.15)',
            color: 'rgba(255, 255, 255, 0.9)'
          }}>
            Calculating cost...
          </div>
        ) : null}
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
        input[type="range"]::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
      `}</style>
    </div>,
    document.body
  );
};

AnimateMovePopup.propTypes = {
  visible: PropTypes.bool.isRequired,
  onConfirm: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  costRaw: PropTypes.number,
  costUSD: PropTypes.number,
  videoResolution: PropTypes.string,
  tokenType: PropTypes.oneOf(['spark', 'sogni']),
  isBatch: PropTypes.bool,
  itemCount: PropTypes.number
};

export default AnimateMovePopup;
