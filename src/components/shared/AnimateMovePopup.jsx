import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { getTokenLabel } from '../../services/walletService';
import { useApp } from '../../context/AppContext';
import VideoRecorderPopup from './VideoRecorderPopup';
import { saveRecording } from '../../utils/recordingsDB';
import VideoSettingsFooter from './VideoSettingsFooter';

// Sample motion videos for Animate Move
const SAMPLE_MOTION_VIDEOS = [
{
    id: 'lil-yacty',
    title: '🚶 Yachty Walkout',
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
    title: '💃 Rasputin',
    description: '',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/video-samples/rasputin.mp4'
  },
  {
    id: 'techno-viking',
    title: '⚔️ Techno Viking',
    description: '',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/video-samples/techno-viking.mp4'
  },
  {
    id: 'dance-dance-dance',
    title: '🕺 Dance Dance Dance',
    description: '',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/video-samples/viral-dance.mp4'
  },
  {
    id: 'dance-chanel',
    title: '💃 Chanel',
    description: '',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/video-samples/chanel.mp4'
  },
  {
    id: 'dance-leave-the-party',
    title: '🕺 Leave the party',
    description: '',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/video-samples/leave-the-party.mp4'
  },
  {
    id: 'dance-spongebob',
    title: '🕺 SpongeBob dance',
    description: '',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/video-samples/spongebob-dance.mp4'
  },
  {
    id: 'dance-keep-it-gangsta',
    title: '🕺 Keep it gangsta',
    description: '',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/video-samples/dance-keep-it-gangsta.mp4'
  },
 
  {
    id: 'dance-big-guy',
    title: '💃 Big guy',
    description: '',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/video-samples/big-guy-dance.mp4'
  },
  {
    id: 'this-is-america',
    title: 'This is America',
    description: '',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/video-samples/this-is-america.mp4'
  },
  {
    id: 'yeah',
    title: 'yeah',
    description: '',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/video-samples/yeah.mp4'
  },
  {
    id: 'sky-guy-dance',
    title: 'Sky guy dance',
    description: '',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/video-samples/sky-guy-dance.mp4'
  },
  {
    id: 'you-want-to-argue',
    title: 'You want to argue',
    description: '',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/video-samples/you-want-to-argue.mp4'
  },
  {
    id: 'weabu',
    title: 'Weabu',
    description: '',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/video-samples/weabu.mp4'
  },
  {
    id: 'not-enough',
    title: 'not enough',
    description: '',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/video-samples/snaptik_7584458675423677703_v2.mp4'
  },
];

const BASE_MAX_DURATION = 20; // Max 20 seconds per image

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
  const { settings } = useApp();

  // Convert aspect ratio key to CSS format for video recording
  const getAspectRatioCss = (key) => {
    const map = {
      'ultranarrow': '768/1344',
      'narrow': '832/1216',
      'portrait': '896/1152',
      'square': '1024/1024',
      'landscape': '1152/896',
      'wide': '1216/832',
      'ultrawide': '1344/768'
    };
    return map[key] || '832/1216'; // Default to narrow (2:3)
  };
  const userAspectRatio = getAspectRatioCss(settings?.aspectRatio);

  const [positivePrompt, setPositivePrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [sourceType, setSourceType] = useState('sample'); // 'sample', 'upload', or 'record'
  const [selectedSample, setSelectedSample] = useState(null);
  const [uploadedVideo, setUploadedVideo] = useState(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState(null);
  const [recordedVideo, setRecordedVideo] = useState(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState(null);
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);
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
  const [videoAspectRatio, setVideoAspectRatio] = useState(9/16); // Default to portrait

  // Split selection mode for batch - splits the timeline segment across all images
  const [splitSelectionEnabled, setSplitSelectionEnabled] = useState(isBatch && itemCount > 1);

  // Compute dynamic constraints based on split mode
  const effectiveItemCount = (isBatch && itemCount > 1) ? itemCount : 1;
  const isSplitMode = splitSelectionEnabled && isBatch && itemCount > 1;

  // In split mode: max = 20s * itemCount, min = 1s * itemCount, step = 0.25s * itemCount
  // In normal mode: max = 20s, min = 0.25s, step = 0.25s
  const MAX_DURATION = isSplitMode ? BASE_MAX_DURATION * effectiveItemCount : BASE_MAX_DURATION;
  const MIN_DURATION = isSplitMode ? 1 * effectiveItemCount : 0.25;
  const DURATION_STEP = isSplitMode ? 0.25 * effectiveItemCount : 0.25;

  // Check if source video is long enough for split mode (need at least 1s per image)
  const canUseSplitMode = sourceVideoDuration >= effectiveItemCount;

  // Reset split selection when popup opens or batch settings change
  useEffect(() => {
    if (visible) {
      setSplitSelectionEnabled(isBatch && itemCount > 1);
    }
  }, [visible, isBatch, itemCount]);

  // Adjust duration when split mode changes or constraints change
  useEffect(() => {
    if (sourceVideoDuration > 0) {
      // If split mode enabled but video too short, disable it
      if (isSplitMode && !canUseSplitMode) {
        setSplitSelectionEnabled(false);
        return;
      }

      // Clamp duration to new constraints
      const effectiveMax = Math.min(sourceVideoDuration - videoStartOffset, MAX_DURATION);
      let newDuration = videoDuration;

      // Clamp to min/max
      newDuration = Math.max(MIN_DURATION, Math.min(newDuration, effectiveMax));

      // Round to step
      newDuration = Math.round(newDuration / DURATION_STEP) * DURATION_STEP;

      // Ensure it's still within bounds after rounding
      newDuration = Math.max(MIN_DURATION, Math.min(newDuration, effectiveMax));

      if (newDuration !== videoDuration) {
        setVideoDuration(newDuration);
      }
    }
  }, [isSplitMode, sourceVideoDuration, MIN_DURATION, MAX_DURATION, DURATION_STEP, canUseSplitMode]);

  // Video timeline trimmer state
  const [videoStartOffset, setVideoStartOffset] = useState(0);
  const [videoThumbnails, setVideoThumbnails] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [previewPlayhead, setPreviewPlayhead] = useState(0);
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
  const [dragType, setDragType] = useState(null); // 'move', 'start', 'end'
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartOffset, setDragStartOffset] = useState(0);
  const [dragStartDuration, setDragStartDuration] = useState(0);
  const [hasMovedDuringDrag, setHasMovedDuringDrag] = useState(false);
  const [pendingStartOffset, setPendingStartOffset] = useState(null);
  const [pendingDuration, setPendingDuration] = useState(null);

  const videoInputRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const timelineCanvasRef = useRef(null);
  const timelineContainerRef = useRef(null);
  const simpleTimelineRef = useRef(null);
  const playbackAnimationRef = useRef(null);
  const sampleVideoRefs = useRef({}); // Track sample video elements to pause others
  const thumbnailImagesRef = useRef([]); // Cache loaded thumbnail images to prevent flicker
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [canvasWidth, setCanvasWidth] = useState(400); // Dynamic canvas width
  const sampleVideoContainerRefs = useRef({});
  const [visibleSampleVideos, setVisibleSampleVideos] = useState({});

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ResizeObserver to keep canvas width in sync with container
  useEffect(() => {
    if (!timelineContainerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = Math.floor(entry.contentRect.width);
        if (newWidth > 0 && newWidth !== canvasWidth) {
          setCanvasWidth(newWidth);
        }
      }
    });

    resizeObserver.observe(timelineContainerRef.current);
    return () => resizeObserver.disconnect();
  }, [canvasWidth]);

  const isMobile = windowWidth < 768;

  // Cleanup uploaded video URL on unmount
  useEffect(() => {
    return () => {
      if (uploadedVideoUrl) {
        URL.revokeObjectURL(uploadedVideoUrl);
      }
      if (recordedVideoUrl) {
        URL.revokeObjectURL(recordedVideoUrl);
      }
    };
  }, [uploadedVideoUrl, recordedVideoUrl]);

  // Reset state when popup opens
  useEffect(() => {
    if (visible) {
      setError('');
      setIsPlaying(false);
    } else {
      // Cleanup when popup closes
      if (videoPreviewRef.current) {
        videoPreviewRef.current.pause();
        videoPreviewRef.current.currentTime = 0;
      }
      setIsPlaying(false);
      if (playbackAnimationRef.current) {
        cancelAnimationFrame(playbackAnimationRef.current);
      }
    }
  }, [visible]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (playbackAnimationRef.current) {
        cancelAnimationFrame(playbackAnimationRef.current);
      }
    };
  }, []);

  // Generate thumbnails from video
  const generateThumbnails = useCallback(async (videoUrl, knownDuration = null) => {
    setVideoThumbnails(null); // Reset thumbnails
    setPreviewPlayhead(0); // Reset playhead

    // For remote URLs, fetch as blob to avoid CORS issues with canvas
    let blobUrl = null;
    const isBlobUrl = videoUrl.startsWith('blob:');

    try {
      if (!isBlobUrl) {
        // Fetch the video as a blob to bypass CORS for canvas operations
        const response = await fetch(videoUrl, { mode: 'cors' });
        if (!response.ok) throw new Error('Failed to fetch video');
        const blob = await response.blob();
        blobUrl = URL.createObjectURL(blob);
      }

      const workingUrl = blobUrl || videoUrl;

      // Create video element for thumbnail extraction
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.preload = 'auto';
      video.playsInline = true;

      // For blob URLs, we need to wait longer for proper loading
      const isRecordedBlob = isBlobUrl && !blobUrl;

      // Set source
      video.src = workingUrl;

      // Wait for metadata to load
      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('Video load timeout')), 15000);
        video.onloadedmetadata = () => {
          clearTimeout(timeoutId);
          resolve();
        };
        video.onerror = (e) => {
          clearTimeout(timeoutId);
          reject(new Error('Video load error'));
        };
      });

      // For recorded blobs, wait for more data to be available
      if (isRecordedBlob) {
        await new Promise((resolve) => {
          if (video.readyState >= 3) {
            resolve();
          } else {
            video.oncanplaythrough = resolve;
            setTimeout(resolve, 1000); // Timeout after 1s
          }
        });
      }

      // Use known duration if provided (WebM blobs often report Infinity)
      // Fall back to video.duration if available and finite
      let duration = knownDuration;
      if (!duration || !isFinite(duration) || duration <= 0) {
        duration = video.duration;
      }

      // If duration is still not valid, try to determine it by seeking to the end
      if (!isFinite(duration) || duration <= 0) {
        // For WebM files without duration metadata, seek to a large time
        // The video will clamp to the actual end
        try {
          video.currentTime = 1e10; // Large number
          await new Promise((resolve) => {
            video.onseeked = resolve;
            setTimeout(resolve, 2000); // Timeout after 2s
          });
          duration = video.currentTime;
          if (isFinite(duration) && duration > 0) {
            video.currentTime = 0;
            await new Promise((resolve) => {
              video.onseeked = resolve;
              setTimeout(resolve, 500);
            });
          }
        } catch (e) {
          // Seeking failed, will use known duration or throw error
        }
      }

      // Final validation
      if (!isFinite(duration) || duration <= 0) {
        throw new Error('Could not determine video duration');
      }

      setSourceVideoDuration(duration);

      // Set default duration to source video duration or base max, whichever is smaller
      // (split mode constraints will be applied via useEffect if needed)
      const defaultDuration = Math.min(duration, BASE_MAX_DURATION);
      const roundedDuration = Math.floor(defaultDuration * 4) / 4;
      setVideoDuration(roundedDuration);
      setVideoStartOffset(0);

      // Wait for video to be ready for seeking
      await new Promise((resolve) => {
        if (video.readyState >= 2) {
          resolve();
        } else {
          video.oncanplay = resolve;
        }
      });

      // Calculate thumbnail dimensions based on video's actual aspect ratio
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

      // Validate video dimensions
      if (!videoWidth || !videoHeight || videoWidth <= 0 || videoHeight <= 0) {
        throw new Error('Invalid video dimensions');
      }

      const aspectRatio = videoWidth / videoHeight;
      if (!isFinite(aspectRatio) || aspectRatio <= 0) {
        throw new Error('Invalid video aspect ratio');
      }
      setVideoAspectRatio(aspectRatio);

      // Generate thumbnails at higher resolution for quality, then scale down when drawing
      // Use 120px height for better quality when stretched
      const thumbHeight = 120;
      const thumbWidth = Math.round(thumbHeight * aspectRatio);

      // Calculate optimal number of thumbnails based on actual container width
      // The timeline container width is approximately: popup width - padding
      // Popup maxWidth: mobile (<768) = 550px, desktop = 750px
      // Account for popup padding (~30px each side) + section padding (~16px each side) = ~92px
      const estimatedContainerWidth = window.innerWidth < 768
        ? Math.min(window.innerWidth - 20, 550) - 92  // Mobile: ~458px max
        : Math.min(window.innerWidth - 40, 750) - 92; // Desktop: ~658px max

      // Calculate number of thumbnails based on display height (60px) and aspect ratio
      const displayThumbWidth = Math.round(60 * aspectRatio);
      const minThumbnails = 6;
      const maxThumbnails = 24; // Higher cap for wider videos / desktop
      const calculatedThumbnails = Math.ceil(estimatedContainerWidth / displayThumbWidth);
      const numThumbnails = Math.max(minThumbnails, Math.min(maxThumbnails, calculatedThumbnails));

      const interval = duration / numThumbnails;

      // Validate interval
      if (!isFinite(interval) || interval <= 0) {
        throw new Error('Invalid thumbnail interval');
      }
      const thumbnails = [];
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = thumbWidth;
      canvas.height = thumbHeight;

      for (let i = 0; i < numThumbnails; i++) {
        video.currentTime = i * interval;
        await new Promise((resolve) => {
          video.onseeked = resolve;
        });

        try {
          ctx.drawImage(video, 0, 0, thumbWidth, thumbHeight);
          thumbnails.push(canvas.toDataURL('image/jpeg', 0.5));
        } catch (canvasErr) {
          // Canvas tainted - fall back to simple timeline
          console.warn('Canvas tainted, falling back to simple timeline');
          setVideoThumbnails(null);
          video.remove();
          if (blobUrl) URL.revokeObjectURL(blobUrl);
          return;
        }
      }

      setVideoThumbnails(thumbnails);
      video.remove();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Failed to generate thumbnails:', err);
      setVideoThumbnails(null);
      if (blobUrl) URL.revokeObjectURL(blobUrl);

      // Still try to get duration from a simple video load
      try {
        const fallbackVideo = document.createElement('video');
        fallbackVideo.src = videoUrl;
        fallbackVideo.muted = true;
        fallbackVideo.preload = 'metadata';

        await new Promise((resolve, reject) => {
          fallbackVideo.onloadedmetadata = resolve;
          fallbackVideo.onerror = reject;
          setTimeout(() => reject(new Error('Video load timeout')), 10000);
        });

        const duration = fallbackVideo.duration;
        setSourceVideoDuration(duration);
        const defaultDuration = Math.min(duration, BASE_MAX_DURATION);
        const roundedDuration = Math.floor(defaultDuration * 4) / 4;
        setVideoDuration(roundedDuration);
        setVideoStartOffset(0);
        fallbackVideo.remove();
      } catch (fallbackErr) {
        console.error('Failed to get video duration:', fallbackErr);
      }
    }
  }, []);

  // Track if thumbnails are loaded
  const [thumbnailsLoaded, setThumbnailsLoaded] = useState(false);

  // Pre-load thumbnail images when thumbnails change to prevent flicker
  useEffect(() => {
    if (videoThumbnails && videoThumbnails.length > 0) {
      setThumbnailsLoaded(false);
      let loadedCount = 0;
      const images = videoThumbnails.map((thumb) => {
        const img = new Image();
        img.onload = () => {
          loadedCount++;
          // Mark as loaded when all images are done
          if (loadedCount === videoThumbnails.length) {
            setThumbnailsLoaded(true);
          }
        };
        img.src = thumb;
        return img;
      });
      thumbnailImagesRef.current = images;
    } else {
      thumbnailImagesRef.current = [];
      setThumbnailsLoaded(false);
    }
  }, [videoThumbnails]);

  // Draw timeline on canvas - uses visual values (pending during drag) for real-time updates
  const drawTimeline = useCallback(() => {
    const canvas = timelineCanvasRef.current;
    if (!canvas || !videoThumbnails || sourceVideoDuration <= 0) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Use visual values for real-time dragging
    const displayStartOffset = pendingStartOffset !== null ? pendingStartOffset : videoStartOffset;
    const displayDuration = pendingDuration !== null ? pendingDuration : videoDuration;

    ctx.clearRect(0, 0, width, height);

    // Calculate thumbnail width based on video aspect ratio to preserve proportions
    // Use the stored aspect ratio from when thumbnails were generated
    const thumbWidth = Math.round(height * videoAspectRatio);
    const cachedImages = thumbnailImagesRef.current;

    // Calculate selection bounds in pixels
    const startX = (displayStartOffset / sourceVideoDuration) * width;
    const endX = Math.min(((displayStartOffset + displayDuration) / sourceVideoDuration), 1) * width;

    // Helper to draw all thumbnails (evenly distributed across timeline without overlap)
    const drawAllThumbnails = () => {
      const numThumbs = videoThumbnails.length;
      const spacing = width / numThumbs; // Equal spacing across width
      
      videoThumbnails.forEach((thumb, i) => {
        const img = cachedImages[i] || new Image();
        if (!cachedImages[i]) img.src = thumb;

        // Position thumbnails edge-to-edge across the timeline
        const x = i * spacing;

        if (img.complete && img.naturalWidth > 0) {
          // Draw thumbnail stretched to fit the spacing width
          ctx.drawImage(img, x, 0, spacing, height);
        }
      });
    };

    // STEP 1: Draw ALL thumbnails at reduced opacity (entire timeline dimmed)
    ctx.globalAlpha = 0.35;
    drawAllThumbnails();

    // STEP 2: Clip to selection region and redraw at full opacity (overwrites dimmed area)
    ctx.save();
    ctx.beginPath();
    ctx.rect(startX, 0, endX - startX, height);
    ctx.clip();
    ctx.globalAlpha = 1.0;
    drawAllThumbnails();
    ctx.restore();

    // STEP 3: Reset alpha and draw selection border
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(startX + 1, 1, (endX - startX) - 2, height - 2);

    // STEP 4: Draw playhead
    const clampedPlayhead = Math.max(0, Math.min(previewPlayhead, sourceVideoDuration));
    const playheadX = (clampedPlayhead / sourceVideoDuration) * width;
    ctx.strokeStyle = isPlaying ? '#fff' : 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();

    // Draw playhead top marker
    ctx.fillStyle = isPlaying ? '#fff' : 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.arc(playheadX, 0, 4, 0, Math.PI);
    ctx.fill();
  }, [videoThumbnails, videoStartOffset, sourceVideoDuration, videoDuration, isPlaying, previewPlayhead, pendingStartOffset, pendingDuration, canvasWidth]);

  // Redraw timeline when thumbnails finish loading
  // Use requestAnimationFrame to ensure canvas is mounted after state updates
  useEffect(() => {
    if (thumbnailsLoaded && visible) {
      // Wait for next frame to ensure canvas is mounted
      const frame = requestAnimationFrame(() => {
        // Double RAF to ensure layout is complete
        requestAnimationFrame(() => {
          drawTimeline();
        });
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [thumbnailsLoaded, drawTimeline, visible]);

  // Update timeline when data changes - including during drag for real-time visual feedback
  useEffect(() => {
    if (visible && videoThumbnails) {
      const frame = requestAnimationFrame(() => {
        drawTimeline();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [drawTimeline, visible, videoThumbnails, videoStartOffset, isPlaying, previewPlayhead, videoDuration, pendingStartOffset, pendingDuration]);

  // Get visual values (pending during drag, actual otherwise)
  const visualStartOffset = pendingStartOffset !== null ? pendingStartOffset : videoStartOffset;
  const visualDuration = pendingDuration !== null ? pendingDuration : videoDuration;

  // Helper to get clientX from mouse or touch event
  const getClientX = (e) => {
    if (e.touches && e.touches.length > 0) {
      return e.touches[0].clientX;
    }
    if (e.changedTouches && e.changedTouches.length > 0) {
      return e.changedTouches[0].clientX;
    }
    return e.clientX;
  };

  // Handle timeline mouse/touch interaction - unified for both canvas and div
  const handleTimelineMouseDown = useCallback((e, overrideDragType = null) => {
    const timelineElement = timelineCanvasRef.current || simpleTimelineRef.current;
    if (!timelineElement || sourceVideoDuration === 0) return;

    const rect = timelineElement.getBoundingClientRect();
    const x = getClientX(e) - rect.left;
    const clickPosition = Math.max(0, Math.min(1, x / rect.width));
    const clickTime = clickPosition * sourceVideoDuration;

    // Calculate handle zones (10px on each side)
    const handleZone = 10 / rect.width * sourceVideoDuration;
    const selectionStart = videoStartOffset;
    const selectionEnd = videoStartOffset + videoDuration;

    let detectedDragType = overrideDragType;

    if (!detectedDragType) {
      // Check if clicking on start handle
      if (Math.abs(clickTime - selectionStart) < handleZone) {
        detectedDragType = 'start';
      }
      // Check if clicking on end handle
      else if (Math.abs(clickTime - selectionEnd) < handleZone) {
        detectedDragType = 'end';
      }
      // Check if clicking inside selection (move)
      else if (clickTime >= selectionStart && clickTime <= selectionEnd) {
        detectedDragType = 'move';
      }
      // Clicking outside - just update playhead position, don't move selection
      else {
        setPreviewPlayhead(clickTime);

        // Seek video preview to clicked position
        if (videoPreviewRef.current) {
          videoPreviewRef.current.currentTime = clickTime;
        }

        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    setIsDraggingTimeline(true);
    setDragType(detectedDragType);
    setDragStartX(x);
    setDragStartOffset(videoStartOffset);
    setDragStartDuration(videoDuration);
    setHasMovedDuringDrag(false);
    setPendingStartOffset(videoStartOffset);
    setPendingDuration(videoDuration);

    e.preventDefault();
    e.stopPropagation();
  }, [sourceVideoDuration, videoStartOffset, videoDuration]);

  // Alias for simple timeline
  const handleSimpleTimelineMouseDown = handleTimelineMouseDown;

  const handleTimelineMouseMove = useCallback((e) => {
    if (!isDraggingTimeline || !dragType) return;

    const timelineElement = timelineCanvasRef.current || simpleTimelineRef.current;
    if (!timelineElement || sourceVideoDuration === 0) return;

    // Prevent scrolling during drag on touch devices
    if (e.cancelable) {
      e.preventDefault();
    }

    const rect = timelineElement.getBoundingClientRect();
    const x = getClientX(e) - rect.left;
    const deltaX = x - dragStartX;

    if (Math.abs(deltaX) > 3) {
      setHasMovedDuringDrag(true);
    }

    const deltaTime = (deltaX / rect.width) * sourceVideoDuration;

    if (dragType === 'move') {
      // Move entire selection
      const maxOffset = Math.max(0, sourceVideoDuration - dragStartDuration);
      const newOffset = Math.max(0, Math.min(dragStartOffset + deltaTime, maxOffset));
      setPendingStartOffset(newOffset);
    } else if (dragType === 'start') {
      // Adjust start (and inversely adjust duration)
      const newStart = Math.max(0, Math.min(dragStartOffset + deltaTime, dragStartOffset + dragStartDuration - MIN_DURATION));
      const newDuration = dragStartOffset + dragStartDuration - newStart;
      // Round to step increments (0.25s in normal mode, 0.25*itemCount in split mode)
      const roundedDuration = Math.round(newDuration / DURATION_STEP) * DURATION_STEP;
      const clampedDuration = Math.min(Math.max(roundedDuration, MIN_DURATION), MAX_DURATION);
      const adjustedStart = dragStartOffset + dragStartDuration - clampedDuration;
      setPendingStartOffset(Math.max(0, adjustedStart));
      setPendingDuration(clampedDuration);
    } else if (dragType === 'end') {
      // Adjust end (duration)
      const newDuration = Math.max(MIN_DURATION, Math.min(dragStartDuration + deltaTime, sourceVideoDuration - dragStartOffset, MAX_DURATION));
      // Round to step increments (0.25s in normal mode, 0.25*itemCount in split mode)
      const roundedDuration = Math.round(newDuration / DURATION_STEP) * DURATION_STEP;
      setPendingDuration(Math.max(MIN_DURATION, roundedDuration));
    }

    // Update video preview position during drag (visual feedback)
    if (videoPreviewRef.current && hasMovedDuringDrag) {
      const previewTime = pendingStartOffset !== null ? pendingStartOffset : videoStartOffset;
      // Don't update video position during drag - wait for release
    }
  }, [isDraggingTimeline, dragType, dragStartX, dragStartOffset, dragStartDuration, sourceVideoDuration, hasMovedDuringDrag, pendingStartOffset, videoStartOffset]);

  const handleTimelineMouseUp = useCallback((e) => {
    if (!isDraggingTimeline) return;

    const wasClick = !hasMovedDuringDrag;

    // Get final values before clearing pending
    const finalStart = pendingStartOffset !== null ? pendingStartOffset : videoStartOffset;
    const finalDuration = pendingDuration !== null ? pendingDuration : videoDuration;

    // Commit pending values to actual state
    if (pendingStartOffset !== null) {
      setVideoStartOffset(pendingStartOffset);
    }
    if (pendingDuration !== null) {
      setVideoDuration(pendingDuration);
    }

    // Reset drag state
    setIsDraggingTimeline(false);
    setDragType(null);
    setHasMovedDuringDrag(false);

    // Handle click (no drag movement) - seek to clicked position
    if (wasClick && sourceVideoDuration > 0) {
      const timelineElement = timelineCanvasRef.current || simpleTimelineRef.current;
      if (timelineElement) {
        const rect = timelineElement.getBoundingClientRect();
        const x = getClientX(e) - rect.left;
        const clickPosition = Math.max(0, Math.min(1, x / rect.width));
        const clickTime = clickPosition * sourceVideoDuration;

        // Update playhead visual immediately
        setPreviewPlayhead(clickTime);

        // Seek video to clicked position
        if (videoPreviewRef.current) {
          videoPreviewRef.current.currentTime = clickTime;
          // Also update the selected sample card's video
          if (selectedSample && sampleVideoRefs.current[selectedSample.id]) {
            sampleVideoRefs.current[selectedSample.id].currentTime = clickTime;
          }
        }
      }
    } else if (hasMovedDuringDrag) {
      // After drag, seek video to new start position
      setPreviewPlayhead(finalStart);

      if (videoPreviewRef.current) {
        videoPreviewRef.current.currentTime = finalStart;
      }
      // Also update the selected sample card's video
      if (selectedSample && sampleVideoRefs.current[selectedSample.id]) {
        sampleVideoRefs.current[selectedSample.id].currentTime = finalStart;
      }

      // If was playing, restart playback loop
      if (isPlaying && videoPreviewRef.current) {
        if (playbackAnimationRef.current) {
          cancelAnimationFrame(playbackAnimationRef.current);
        }
        const updatePlayhead = () => {
          if (videoPreviewRef.current && !videoPreviewRef.current.paused) {
            setPreviewPlayhead(videoPreviewRef.current.currentTime);
            if (videoPreviewRef.current.currentTime >= finalStart + finalDuration) {
              videoPreviewRef.current.currentTime = finalStart;
            }
            playbackAnimationRef.current = requestAnimationFrame(updatePlayhead);
          }
        };
        playbackAnimationRef.current = requestAnimationFrame(updatePlayhead);
      }
    }

    // Clear pending values AFTER committing
    setPendingStartOffset(null);
    setPendingDuration(null);
  }, [isDraggingTimeline, hasMovedDuringDrag, isPlaying, videoStartOffset, videoDuration, sourceVideoDuration, pendingStartOffset, pendingDuration, selectedSample]);

  // Global mouse/touch up listener for drag
  useEffect(() => {
    if (isDraggingTimeline) {
      window.addEventListener('mouseup', handleTimelineMouseUp);
      window.addEventListener('mousemove', handleTimelineMouseMove);
      window.addEventListener('touchend', handleTimelineMouseUp);
      window.addEventListener('touchmove', handleTimelineMouseMove, { passive: false });
      return () => {
        window.removeEventListener('mouseup', handleTimelineMouseUp);
        window.removeEventListener('mousemove', handleTimelineMouseMove);
        window.removeEventListener('touchend', handleTimelineMouseUp);
        window.removeEventListener('touchmove', handleTimelineMouseMove);
      };
    }
  }, [isDraggingTimeline, handleTimelineMouseUp, handleTimelineMouseMove]);

  // Toggle video preview playback
  const toggleVideoPreview = useCallback(() => {
    const video = videoPreviewRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
      if (playbackAnimationRef.current) {
        cancelAnimationFrame(playbackAnimationRef.current);
      }
      // Sync previewPlayhead state with actual video position when pausing
      setPreviewPlayhead(video.currentTime);
    } else {
      // Use video.currentTime as source of truth for where to resume from
      // (previewPlayhead state may be stale, especially on mobile)
      const currentPosition = video.currentTime;
      const endTime = videoStartOffset + videoDuration;
      const isOutsideSelection = currentPosition < videoStartOffset || currentPosition >= endTime;

      if (isOutsideSelection) {
        video.currentTime = videoStartOffset;
        setPreviewPlayhead(videoStartOffset);
      } else {
        // Sync state before playing
        setPreviewPlayhead(currentPosition);
      }

      video.play().catch(() => {
        setError('Unable to play video preview');
      });
      setIsPlaying(true);

      const updatePlayhead = () => {
        if (videoPreviewRef.current && !videoPreviewRef.current.paused) {
          const currentTime = videoPreviewRef.current.currentTime;
          const loopEndTime = videoStartOffset + videoDuration;

          setPreviewPlayhead(currentTime);

          // Loop back to start if we've reached or passed the end
          if (currentTime >= loopEndTime) {
            videoPreviewRef.current.currentTime = videoStartOffset;
          }

          playbackAnimationRef.current = requestAnimationFrame(updatePlayhead);
        }
      };
      playbackAnimationRef.current = requestAnimationFrame(updatePlayhead);
    }
  }, [isPlaying, videoStartOffset, videoDuration]);

  // Toggle mute state
  const toggleMute = useCallback(() => {
    const video = videoPreviewRef.current;
    if (video) {
      video.muted = !isMuted;
    }
    setIsMuted(!isMuted);
  }, [isMuted]);

  // Format time helper
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Reset visible videos when popup opens
  useEffect(() => {
    if (!visible) return;

    // Reset visible videos
    setVisibleSampleVideos({});

    return () => {};
  }, [visible]);

  // Intersection Observer to track which sample video tiles are in view
  useEffect(() => {
    if (!visible) return;
    
    // Only observe if no source is selected yet
    const hasSource = (sourceType === 'sample' && selectedSample) || (sourceType === 'upload' && uploadedVideo) || (sourceType === 'record' && recordedVideo);
    if (hasSource) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const videoId = entry.target.dataset.videoId;
          if (videoId) {
            setVisibleSampleVideos((prev) => ({
              ...prev,
              [videoId]: entry.isIntersecting
            }));
          }
        });
      },
      {
        root: null,
        rootMargin: '50px',
        threshold: 0.1
      }
    );

    // Observe all sample video container elements
    Object.values(sampleVideoContainerRefs.current).forEach((container) => {
      if (container) {
        observer.observe(container);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [visible, sourceType, selectedSample, uploadedVideo, recordedVideo]);

  // Get video duration when loaded (fallback if thumbnails fail)
  const handleVideoLoadedMetadata = useCallback(() => {
    if (videoPreviewRef.current && sourceVideoDuration === 0) {
      const duration = videoPreviewRef.current.duration;
      setSourceVideoDuration(duration);
      const defaultDuration = Math.min(duration, MAX_DURATION);
      const roundedDuration = Math.floor(defaultDuration * 4) / 4;
      setVideoDuration(roundedDuration);
    }
  }, [sourceVideoDuration]);

  const handleVideoUpload = async (e) => {
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
      setVideoThumbnails(null);
      setVideoStartOffset(0);
      setIsPlaying(false);

      // Create preview URL
      if (uploadedVideoUrl) {
        URL.revokeObjectURL(uploadedVideoUrl);
      }
      const newUrl = URL.createObjectURL(file);
      setUploadedVideoUrl(newUrl);

      // Generate thumbnails for timeline
      await generateThumbnails(newUrl);
    }
  };

  const handleSampleSelect = async (sample) => {
    // Pause all sample videos first
    Object.values(sampleVideoRefs.current).forEach((videoEl) => {
      if (videoEl) {
        videoEl.pause();
      }
    });

    setSelectedSample(sample);
    setSourceType('sample');
    setUploadedVideo(null);
    if (uploadedVideoUrl) {
      URL.revokeObjectURL(uploadedVideoUrl);
      setUploadedVideoUrl(null);
    }
    setError('');
    setVideoThumbnails(null);
    setVideoStartOffset(0);
    setPreviewPlayhead(0);
    setPendingStartOffset(null);
    setPendingDuration(null);
    setIsPlaying(false);

    // Stop any existing playback animation
    if (playbackAnimationRef.current) {
      cancelAnimationFrame(playbackAnimationRef.current);
    }

    // Generate thumbnails for timeline first
    await generateThumbnails(sample.url);

    // Set videoPreviewRef to the selected sample's video element and autoplay
    if (sampleVideoRefs.current[sample.id]) {
      videoPreviewRef.current = sampleVideoRefs.current[sample.id];
      const video = sampleVideoRefs.current[sample.id];

      // Reset to start position and autoplay
      video.currentTime = 0;
      setPreviewPlayhead(0);

      // Start playback automatically
      video.play().then(() => {
        setIsPlaying(true);

        // Start playhead animation
        const updatePlayhead = () => {
          if (videoPreviewRef.current && !videoPreviewRef.current.paused) {
            const currentTime = videoPreviewRef.current.currentTime;
            const loopEndTime = videoDuration; // Use the video duration set by generateThumbnails

            setPreviewPlayhead(currentTime);

            // Loop back to start if we've reached the end of the selected segment
            if (currentTime >= loopEndTime) {
              videoPreviewRef.current.currentTime = 0;
            }

            playbackAnimationRef.current = requestAnimationFrame(updatePlayhead);
          }
        };
        playbackAnimationRef.current = requestAnimationFrame(updatePlayhead);
      }).catch((err) => {
        console.log('Autoplay prevented:', err);
        setIsPlaying(false);
      });
    }
  };

  // Handle video recording complete
  const handleRecordingComplete = async ({ file, url, duration: recordedDuration }) => {
    setShowVideoRecorder(false);
    setRecordedVideo(file);
    setSourceType('record');
    setSelectedSample(null);
    setUploadedVideo(null);
    if (uploadedVideoUrl) {
      URL.revokeObjectURL(uploadedVideoUrl);
      setUploadedVideoUrl(null);
    }
    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl);
    }
    setRecordedVideoUrl(url);
    setError('');
    setVideoThumbnails(null);
    setVideoStartOffset(0);
    setIsPlaying(false);
    setPreviewPlayhead(0);

    // Generate thumbnails for timeline
    // Pass the known duration since WebM blobs often report Infinity
    await generateThumbnails(url, recordedDuration);
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
    if (sourceType === 'record' && !recordedVideo) {
      setError('Please record a video first');
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
      // Create a persistent blob URL for regeneration
      // This is separate from uploadedVideoUrl (used for preview) and won't be revoked when popup closes
      videoUrl = URL.createObjectURL(uploadedVideo);
    } else if (sourceType === 'record' && recordedVideo) {
      // Read file as buffer
      const arrayBuffer = await recordedVideo.arrayBuffer();
      videoData = new Uint8Array(arrayBuffer);
      // Create a persistent blob URL for regeneration
      videoUrl = URL.createObjectURL(recordedVideo);
      // Also save to IndexedDB for retry capability (in background)
      const blob = new Blob([arrayBuffer], { type: recordedVideo.type || 'video/webm' });
      saveRecording('video', blob, sourceVideoDuration, userAspectRatio).catch((err) => {
        console.error('Failed to save recording for retry:', err);
      });
    } else if (sourceType === 'sample' && selectedSample) {
      videoUrl = selectedSample.url;
    }

    onConfirm({
      positivePrompt: positivePrompt.trim(),
      negativePrompt: negativePrompt.trim(),
      videoData,
      videoUrl,
      videoDuration,
      videoStartOffset,
      workflowType: 'animate-move',
      modelVariant, // Pass the selected model variant
      splitMode: isSplitMode, // Whether to split the selection across batch images
      perImageDuration: isSplitMode ? videoDuration / effectiveItemCount : videoDuration
    });
  };

  const handleClose = () => {
    setPositivePrompt('');
    setNegativePrompt('');
    setSourceType('sample');
    setSelectedSample(null);
    setUploadedVideo(null);
    setRecordedVideo(null);
    if (uploadedVideoUrl) {
      URL.revokeObjectURL(uploadedVideoUrl);
      setUploadedVideoUrl(null);
    }
    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl);
      setRecordedVideoUrl(null);
    }
    setShowVideoRecorder(false);
    setError('');
    setVideoDuration(5);
    setSourceVideoDuration(0);
    setVideoThumbnails(null);
    setVideoStartOffset(0);
    setIsPlaying(false);
    if (playbackAnimationRef.current) {
      cancelAnimationFrame(playbackAnimationRef.current);
    }
    onClose();
  };

  if (!visible) return null;

  const hasValidSource = (sourceType === 'sample' && selectedSample) || (sourceType === 'upload' && uploadedVideo) || (sourceType === 'record' && recordedVideo);
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
          {/* Header with title and optional clear button */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px'
          }}>
            <label style={{
              display: 'block',
              color: 'white',
              fontSize: '13px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              📹 Source Motion Video
            </label>
            {hasValidSource && (
              <button
                onClick={() => {
                  setSelectedSample(null);
                  setUploadedVideo(null);
                  setRecordedVideo(null);
                  if (uploadedVideoUrl) {
                    URL.revokeObjectURL(uploadedVideoUrl);
                    setUploadedVideoUrl(null);
                  }
                  if (recordedVideoUrl) {
                    URL.revokeObjectURL(recordedVideoUrl);
                    setRecordedVideoUrl(null);
                  }
                  setSourceVideoDuration(0);
                  setVideoThumbnails(null);
                  setVideoStartOffset(0);
                  setPreviewPlayhead(0);
                  setIsPlaying(false);
                  // Resume all sample videos
                  Object.values(sampleVideoRefs.current).forEach((videoEl) => {
                    if (videoEl) videoEl.play().catch(() => {});
                  });
                }}
                style={{
                  padding: '4px 10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '6px',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.4)';
                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.6)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                }}
              >
                ✕ Change
              </button>
            )}
          </div>

          {/* Selected Video Preview and Timeline Editor - shown when a video is selected */}
          {hasValidSource && sourceVideoDuration > 0 && (
            <>
              {/* Video Preview - show above timeline */}
              <div style={{
                marginBottom: '14px',
                borderRadius: '10px',
                overflow: 'hidden',
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                border: '2px solid rgba(6, 182, 212, 0.5)',
                position: 'relative'
              }}>
                {/* Selected video title badge */}
                <div style={{
                  position: 'absolute',
                  top: '8px',
                  left: '8px',
                  padding: '4px 10px',
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: 'white',
                  zIndex: 2
                }}>
                  {sourceType === 'sample' && selectedSample
                    ? selectedSample.title
                    : sourceType === 'record'
                      ? '🎬 Recorded Video'
                      : uploadedVideo?.name || 'Uploaded Video'}
                </div>

                {/* Video element */}
                <video
                  ref={videoPreviewRef}
                  src={sourceType === 'sample' && selectedSample
                    ? selectedSample.url
                    : sourceType === 'record'
                      ? recordedVideoUrl
                      : uploadedVideoUrl}
                  muted={isMuted}
                  playsInline
                  onLoadedMetadata={handleVideoLoadedMetadata}
                  style={{
                    width: '100%',
                    maxHeight: isMobile ? '180px' : '220px',
                    objectFit: 'contain',
                    display: 'block'
                  }}
                />
              </div>

              {/* Timeline Trimmer Controls */}
              <div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px'
                }}>
                  <label style={{
                    color: 'rgba(255, 255, 255, 0.9)',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}>
                    ✂️ Select Video Segment
                  </label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button
                      onClick={toggleMute}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: 'rgba(255, 255, 255, 0.2)',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        borderRadius: '6px',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease'
                      }}
                      title={isMuted ? 'Unmute' : 'Mute'}
                    >
                      {isMuted ? '🔇' : '🔊'}
                    </button>
                    <button
                      onClick={toggleVideoPreview}
                      style={{
                        padding: '6px 14px',
                        backgroundColor: isPlaying ? '#ef4444' : 'rgba(255, 255, 255, 0.9)',
                        border: 'none',
                        borderRadius: '6px',
                        color: isPlaying ? 'white' : '#0891b2',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {isPlaying ? '⏸ Pause' : '▶ Preview'}
                    </button>
                  </div>
                </div>

                {/* Timeline - either canvas with thumbnails or simple gradient bar */}
                {videoThumbnails ? (
                  <div
                    ref={timelineContainerRef}
                    style={{
                      position: 'relative',
                      backgroundColor: 'rgba(0, 0, 0, 0.4)',
                      borderRadius: '8px',
                      overflow: 'visible',
                      cursor: isDraggingTimeline ? 'grabbing' : 'pointer',
                      userSelect: 'none',
                      border: '1px solid rgba(255, 255, 255, 0.2)'
                    }}
                    onMouseDown={handleTimelineMouseDown}
                    onTouchStart={handleTimelineMouseDown}
                  >
                    <canvas
                      ref={timelineCanvasRef}
                      width={canvasWidth}
                      height={60}
                      style={{
                        display: 'block',
                        width: '100%',
                        height: '60px',
                        pointerEvents: 'none'
                      }}
                    />
                    {/* Left resize handle overlay for canvas timeline */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '0',
                        bottom: '0',
                        left: `calc(${(visualStartOffset / sourceVideoDuration) * 100}% - 6px)`,
                        width: '12px',
                        cursor: 'ew-resize',
                        zIndex: 5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      onMouseDown={(e) => { e.stopPropagation(); handleTimelineMouseDown(e, 'start'); }}
                      onTouchStart={(e) => { e.stopPropagation(); handleTimelineMouseDown(e, 'start'); }}
                    >
                      <div style={{
                        width: '4px',
                        height: '28px',
                        backgroundColor: '#06b6d4',
                        borderRadius: '2px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.5)'
                      }} />
                    </div>
                    {/* Right resize handle overlay for canvas timeline */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '0',
                        bottom: '0',
                        left: `calc(${((visualStartOffset + visualDuration) / sourceVideoDuration) * 100}% - 6px)`,
                        width: '12px',
                        cursor: 'ew-resize',
                        zIndex: 5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      onMouseDown={(e) => { e.stopPropagation(); handleTimelineMouseDown(e, 'end'); }}
                      onTouchStart={(e) => { e.stopPropagation(); handleTimelineMouseDown(e, 'end'); }}
                    >
                      <div style={{
                        width: '4px',
                        height: '28px',
                        backgroundColor: '#06b6d4',
                        borderRadius: '2px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.5)'
                      }} />
                    </div>
                    {/* Duration label overlay for canvas timeline */}
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: `${((visualStartOffset + visualDuration / 2) / sourceVideoDuration) * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      fontSize: '11px',
                      fontWeight: '700',
                      color: 'white',
                      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                      pointerEvents: 'none',
                      zIndex: 3
                    }}>
                      {isSplitMode
                        ? `${visualDuration.toFixed(1)}s (${(visualDuration / effectiveItemCount).toFixed(2)}s×${effectiveItemCount})`
                        : `${visualDuration.toFixed(2)}s`}
                    </div>
                  </div>
                ) : (
                  /* Simple gradient timeline for videos without thumbnails */
                  <div
                    ref={simpleTimelineRef}
                    style={{
                      position: 'relative',
                      height: '50px',
                      backgroundColor: 'rgba(0, 0, 0, 0.4)',
                      borderRadius: '8px',
                      overflow: 'visible',
                      cursor: isDraggingTimeline && dragType === 'move' ? 'grabbing' : 'pointer',
                      userSelect: 'none',
                      border: '1px solid rgba(255, 255, 255, 0.2)'
                    }}
                    onMouseDown={handleSimpleTimelineMouseDown}
                    onTouchStart={handleSimpleTimelineMouseDown}
                  >
                    {/* Background gradient representing video */}
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'linear-gradient(90deg, rgba(6, 182, 212, 0.15) 0%, rgba(8, 145, 178, 0.1) 50%, rgba(6, 182, 212, 0.15) 100%)',
                      borderRadius: '7px'
                    }} />

                    {/* Selection highlight */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '2px',
                        bottom: '2px',
                        left: `${(visualStartOffset / sourceVideoDuration) * 100}%`,
                        width: `${(Math.min(visualDuration, sourceVideoDuration - visualStartOffset) / sourceVideoDuration) * 100}%`,
                        background: 'linear-gradient(180deg, rgba(6, 182, 212, 0.7) 0%, rgba(8, 145, 178, 0.5) 100%)',
                        border: '2px solid #06b6d4',
                        borderRadius: '4px',
                        boxSizing: 'border-box',
                        cursor: isDraggingTimeline && dragType === 'move' ? 'grabbing' : 'grab',
                        minWidth: '20px'
                      }}
                    >
{/* Duration label inside selection */}
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      fontSize: '11px',
                      fontWeight: '700',
                      color: 'white',
                      textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none'
                    }}>
                      {isSplitMode
                        ? `${visualDuration.toFixed(1)}s (${(visualDuration / effectiveItemCount).toFixed(2)}s×${effectiveItemCount})`
                        : `${visualDuration.toFixed(2)}s`}
                    </div>
                  </div>

                    {/* Left resize handle */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '0',
                        bottom: '0',
                        left: `calc(${(visualStartOffset / sourceVideoDuration) * 100}% - 6px)`,
                        width: '12px',
                        cursor: 'ew-resize',
                        zIndex: 5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      onMouseDown={(e) => { e.stopPropagation(); handleTimelineMouseDown(e, 'start'); }}
                      onTouchStart={(e) => { e.stopPropagation(); handleTimelineMouseDown(e, 'start'); }}
                    >
                      <div style={{
                        width: '4px',
                        height: '24px',
                        backgroundColor: '#06b6d4',
                        borderRadius: '2px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                      }} />
                    </div>

                    {/* Right resize handle */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '0',
                        bottom: '0',
                        left: `calc(${((visualStartOffset + visualDuration) / sourceVideoDuration) * 100}% - 6px)`,
                        width: '12px',
                        cursor: 'ew-resize',
                        zIndex: 5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      onMouseDown={(e) => { e.stopPropagation(); handleTimelineMouseDown(e, 'end'); }}
                      onTouchStart={(e) => { e.stopPropagation(); handleTimelineMouseDown(e, 'end'); }}
                    >
                      <div style={{
                        width: '4px',
                        height: '24px',
                        backgroundColor: '#06b6d4',
                        borderRadius: '2px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                      }} />
                    </div>

                    {/* Playhead - always visible when video loaded */}
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${(previewPlayhead / sourceVideoDuration) * 100}%`,
                      width: '2px',
                      backgroundColor: isPlaying ? '#fff' : 'rgba(255, 255, 255, 0.7)',
                      zIndex: 4,
                      pointerEvents: 'none',
                      boxShadow: isPlaying ? '0 0 6px rgba(255,255,255,0.8)' : '0 0 4px rgba(255,255,255,0.3)',
                      transition: isPlaying ? 'none' : 'left 0.1s ease-out'
                    }} />

                    {/* Time markers */}
                    <div style={{
                      position: 'absolute',
                      bottom: '-18px',
                      left: '0',
                      fontSize: '9px',
                      color: 'rgba(255, 255, 255, 0.6)',
                      fontWeight: '500'
                    }}>
                      0:00
                    </div>
                    <div style={{
                      position: 'absolute',
                      bottom: '-18px',
                      right: '0',
                      fontSize: '9px',
                      color: 'rgba(255, 255, 255, 0.6)',
                      fontWeight: '500'
                    }}>
                      {formatTime(sourceVideoDuration)}
                    </div>
                  </div>
                )}

                {/* Time indicators */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '22px',
                  fontSize: '10px',
                  color: 'rgba(255, 255, 255, 0.8)',
                  fontWeight: '500'
                }}>
                  <span style={{ color: '#fff' }}>
                    Start: {formatTime(visualStartOffset)}
                  </span>
                  <span style={{ color: '#fff', fontWeight: '700' }}>
                    {isSplitMode
                      ? `Total: ${visualDuration.toFixed(2)}s (${(visualDuration / effectiveItemCount).toFixed(2)}s each)`
                      : `Duration: ${visualDuration.toFixed(2)}s`}
                  </span>
                  <span style={{ color: '#fff' }}>
                    End: {formatTime(visualStartOffset + visualDuration)}
                  </span>
                </div>

                <p style={{
                  margin: '6px 0 0 0',
                  color: 'rgba(255, 255, 255, 0.6)',
                  fontSize: '10px',
                  textAlign: 'center'
                }}>
                  Drag edges to resize • Drag middle to move • Click outside to jump
                </p>

                {/* Split Selection Checkbox - only in batch mode */}
                {isBatch && itemCount > 1 && (
                  <div style={{
                    marginTop: '12px',
                    padding: '10px 12px',
                    background: isSplitMode ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    border: isSplitMode ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid rgba(255, 255, 255, 0.2)'
                  }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      cursor: canUseSplitMode ? 'pointer' : 'not-allowed',
                      opacity: canUseSplitMode ? 1 : 0.6
                    }}>
                      <input
                        type="checkbox"
                        checked={splitSelectionEnabled && canUseSplitMode}
                        onChange={(e) => canUseSplitMode && setSplitSelectionEnabled(e.target.checked)}
                        disabled={!canUseSplitMode}
                        style={{
                          width: '18px',
                          height: '18px',
                          marginTop: '2px',
                          accentColor: '#06b6d4',
                          cursor: canUseSplitMode ? 'pointer' : 'not-allowed'
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <span style={{
                          color: 'white',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}>
                          🎬 Montage Mode
                        </span>
                        {canUseSplitMode ? (
                          <p style={{
                            margin: '4px 0 0 0',
                            color: 'rgba(255, 255, 255, 0.7)',
                            fontSize: '10px',
                            lineHeight: '1.4'
                          }}>
                          {isSplitMode
                            ? `Each image will get ${(videoDuration / itemCount).toFixed(2)}s of video, creating a continuous sequence.`
                            : 'Each image will get the full video segment.'}
                          </p>
                        ) : (
                          <p style={{
                            margin: '4px 0 0 0',
                            color: 'rgba(239, 68, 68, 0.9)',
                            fontSize: '10px',
                            lineHeight: '1.4'
                          }}>
                            ⚠️ Video is too short. Need at least {itemCount}s for {itemCount} images.
                          </p>
                        )}
                      </div>
                    </label>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Source Selection Tabs - only shown when no video selected */}
          {!hasValidSource && (
            <>
              {/* Tab Headers */}
              <div style={{
                display: 'flex',
                gap: '4px',
                marginBottom: '12px',
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '8px',
                padding: '4px'
              }}>
                {[
                  { id: 'sample', label: '📹 Samples' },
                  { id: 'record', label: '🎬 Record' },
                  { id: 'upload', label: '📁 Upload' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setSourceType(tab.id)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      background: sourceType === tab.id 
                        ? 'rgba(255, 255, 255, 0.95)' 
                        : 'transparent',
                      color: sourceType === tab.id ? '#0891b2' : 'white',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div style={{ minHeight: '80px' }}>
                {/* Samples Tab */}
                {sourceType === 'sample' && (
                  <div
                    style={{
                      display: 'flex',
                      gap: '10px',
                      overflowX: 'auto',
                      overflowY: 'hidden',
                      scrollSnapType: 'x mandatory',
                      WebkitOverflowScrolling: 'touch',
                      paddingBottom: '8px',
                      marginLeft: '-4px',
                      marginRight: '-4px',
                      paddingLeft: '4px',
                      paddingRight: '4px'
                    }}
                  >
                    {SAMPLE_MOTION_VIDEOS.map((sample) => (
                      <button
                        key={sample.id}
                        onClick={() => handleSampleSelect(sample)}
                        ref={(el) => {
                          if (el) {
                            sampleVideoContainerRefs.current[sample.id] = el;
                          }
                        }}
                        data-video-id={sample.id}
                        style={{
                          position: 'relative',
                          padding: 0,
                          borderRadius: '10px',
                          border: '3px solid rgba(255, 255, 255, 0.3)',
                          background: 'rgba(0, 0, 0, 0.3)',
                          color: 'white',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          overflow: 'hidden',
                          flexShrink: 0,
                          width: isMobile ? '100px' : '90px',
                          height: isMobile ? '178px' : '160px',
                          scrollSnapAlign: 'start',
                          display: 'flex',
                          flexDirection: 'column'
                        }}
                      >
                        {visibleSampleVideos[sample.id] && (
                          <video
                            ref={(el) => { sampleVideoRefs.current[sample.id] = el; }}
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
                        )}
                        <div style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
                          padding: '4px 6px',
                          textAlign: 'center'
                        }}>
                          <div style={{ fontSize: '10px', fontWeight: '700', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                            {sample.title}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Record Tab - Coming Soon */}
                {sourceType === 'record' && (
                  <div style={{ 
                    textAlign: 'center',
                    padding: '24px 16px',
                    borderRadius: '10px',
                    border: '2px dashed rgba(255, 255, 255, 0.3)',
                    background: 'rgba(255, 255, 255, 0.05)'
                  }}>
                    <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>🚧</span>
                    <span style={{ 
                      color: 'white', 
                      fontSize: '16px', 
                      fontWeight: '600',
                      display: 'block',
                      marginBottom: '8px'
                    }}>
                      Coming Soon!
                    </span>
                    <span style={{ 
                      color: 'rgba(255, 255, 255, 0.7)', 
                      fontSize: '13px',
                      display: 'block'
                    }}>
                      Video recording will be available in a future update.
                      <br />
                      For now, please upload a video file instead.
                    </span>
                  </div>
                )}

                {/* Upload Tab */}
                {sourceType === 'upload' && (
                  <div style={{ textAlign: 'center' }}>
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
                        padding: '24px 16px',
                        borderRadius: '10px',
                        border: '2px dashed rgba(255, 255, 255, 0.4)',
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <span style={{ fontSize: '32px' }}>📁</span>
                      <span>Tap to Upload Video</span>
                      <span style={{ fontSize: '11px', opacity: 0.7 }}>
                        Select a video file from your device
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
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
            className="motion-description-textarea"
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

        {/* Video Settings Footer */}
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.15)'
        }}>
          <VideoSettingsFooter
            videoCount={isBatch ? itemCount : 1}
            cost={isSplitMode ? costRaw / effectiveItemCount : costRaw}
            costUSD={isSplitMode ? costUSD / effectiveItemCount : costUSD}
            loading={loading}
            tokenType={tokenType}
            showDuration={false}
            colorScheme="dark"
          />
        </div>
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
        .motion-description-textarea::placeholder {
          color: rgba(255, 255, 255, 0.6);
          opacity: 1;
        }
        .motion-description-textarea::-webkit-input-placeholder {
          color: rgba(255, 255, 255, 0.6);
          opacity: 1;
        }
        .motion-description-textarea::-moz-placeholder {
          color: rgba(255, 255, 255, 0.6);
          opacity: 1;
        }
        .motion-description-textarea:-ms-input-placeholder {
          color: rgba(255, 255, 255, 0.6);
          opacity: 1;
        }
      `}</style>

      {/* Video Recorder Popup */}
      <VideoRecorderPopup
        visible={showVideoRecorder}
        onRecordingComplete={handleRecordingComplete}
        onClose={() => setShowVideoRecorder(false)}
        maxDuration={60}
        title="Record Motion Video"
        accentColor="#06b6d4"
        aspectRatio={userAspectRatio}
      />
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
