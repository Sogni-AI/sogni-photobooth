import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { saveRecording, getLastRecording } from '../../utils/recordingsDB';

/**
 * VideoRecorderPopup
 * A polaroid-style video recording component for recording reference/driving videos
 * Used by AnimateMove and AnimateReplace popups
 */
const VideoRecorderPopup = ({
  visible,
  onRecordingComplete,
  onClose,
  maxDuration = 60, // Max recording duration in seconds
  title = 'Record Video',
  accentColor = '#f97316', // Default to orange (Animate Replace)
  aspectRatio = '9/16' // Default to portrait, can be '16/9', '1/1', '4/3', etc.
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState('');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [facingMode, setFacingMode] = useState('user'); // 'user' or 'environment'
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [lastRecording, setLastRecording] = useState(null);
  const [isLoadingLastRecording, setIsLoadingLastRecording] = useState(true);

  // Device selection
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState('');
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState('');

  // Dropdown menu state
  const [showVideoMenu, setShowVideoMenu] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const videoMenuRef = useRef(null);
  const audioMenuRef = useRef(null);
  const videoMenuPortalRef = useRef(null);
  const audioMenuPortalRef = useRef(null);

  // Audio mute option
  const [audioEnabled, setAudioEnabled] = useState(true);

  const videoRef = useRef(null);
  const previewVideoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const recordedUrlRef = useRef(null);
  const recordingStartTimeRef = useRef(null);

  // Canvas-based recording for proper aspect ratio cropping
  const canvasRef = useRef(null);
  const canvasStreamRef = useRef(null);
  const canvasAnimationRef = useRef(null);

  const isMobile = windowWidth < 768;

  // Parse aspect ratio string to get numeric ratio
  const getAspectRatioValue = (ratioStr) => {
    const parts = ratioStr.split('/');
    if (parts.length === 2) {
      return parseFloat(parts[0]) / parseFloat(parts[1]);
    }
    return 9 / 16; // Default portrait
  };

  const aspectRatioValue = getAspectRatioValue(aspectRatio);
  const isLandscape = aspectRatioValue > 1;

  // Handle window resize
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Clear all timers helper
  const clearAllTimers = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  // Full state reset function
  const resetAllState = useCallback(() => {
    setIsRecording(false);
    setIsPreviewing(false);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecordingDuration(0);
    setError('');
    setIsCameraReady(false);
    chunksRef.current = [];
    recordingStartTimeRef.current = null;
  }, []);

  // Cleanup resources
  const cleanupResources = useCallback(() => {
    // Clear all timers first
    clearAllTimers();

    // Stop canvas animation
    if (canvasAnimationRef.current) {
      cancelAnimationFrame(canvasAnimationRef.current);
      canvasAnimationRef.current = null;
    }

    // Stop canvas stream
    if (canvasStreamRef.current) {
      canvasStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          // Ignore errors during cleanup
        }
      });
      canvasStreamRef.current = null;
    }

    // Stop recording if active
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch (e) {
        // Ignore errors during cleanup
      }
      mediaRecorderRef.current = null;
    }

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          // Ignore errors during cleanup
        }
      });
      streamRef.current = null;
    }

    // Clear video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [clearAllTimers]);

  // Enumerate available audio and video input devices
  const enumerateDevices = useCallback(async () => {
    try {
      console.log('[VideoRecorder] Enumerating devices...');

      // Need to request permission first to get device labels
      let tempStream = null;
      try {
        tempStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        console.log('[VideoRecorder] Camera and audio permission granted');
      } catch (permErr) {
        console.warn('[VideoRecorder] Could not get permissions:', permErr.message);
        // Continue anyway - we might still get devices without labels
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      const videoInputs = devices.filter(device => device.kind === 'videoinput');

      // Stop the temporary stream to release devices
      if (tempStream) {
        tempStream.getTracks().forEach(track => track.stop());
      }

      console.log('[VideoRecorder] Available audio devices:', audioInputs.length);
      audioInputs.forEach((device, i) => {
        console.log(`  🎤 ${i + 1}. ${device.label || `Microphone ${i + 1}`}`);
      });

      console.log('[VideoRecorder] Available video devices:', videoInputs.length);
      videoInputs.forEach((device, i) => {
        console.log(`  📹 ${i + 1}. ${device.label || `Camera ${i + 1}`}`);
      });

      setAudioDevices(audioInputs);
      setVideoDevices(videoInputs);

      // Auto-select audio device - prefer built-in, avoid iPhone
      if (audioInputs.length > 0 && !selectedAudioDeviceId) {
        const builtInMic = audioInputs.find(d => {
          const label = (d.label || '').toLowerCase();
          return label.includes('built-in') || label.includes('macbook') || label.includes('internal');
        });
        const nonIphoneMic = audioInputs.find(d => {
          const label = (d.label || '').toLowerCase();
          return !label.includes('iphone');
        });
        const defaultAudio = builtInMic || nonIphoneMic || audioInputs[0];
        console.log('[VideoRecorder] Auto-selecting audio:', defaultAudio.label || 'Microphone 1');
        setSelectedAudioDeviceId(defaultAudio.deviceId);
      }

      // Auto-select video device - prefer front-facing/FaceTime camera
      if (videoInputs.length > 0 && !selectedVideoDeviceId) {
        const frontCamera = videoInputs.find(d => {
          const label = (d.label || '').toLowerCase();
          return label.includes('facetime') || label.includes('front') || label.includes('user');
        });
        const defaultVideo = frontCamera || videoInputs[0];
        console.log('[VideoRecorder] Auto-selecting video:', defaultVideo.label || 'Camera 1');
        setSelectedVideoDeviceId(defaultVideo.deviceId);
      }

      return { audioInputs, videoInputs };
    } catch (err) {
      console.error('[VideoRecorder] Failed to enumerate devices:', err);
      return { audioInputs: [], videoInputs: [] };
    }
  }, [selectedAudioDeviceId, selectedVideoDeviceId]);

  // Initialize camera
  const initCamera = useCallback(async () => {
    try {
      setError('');
      setIsCameraReady(false);

      // First cleanup any existing resources
      cleanupResources();

      // Calculate ideal dimensions based on aspect ratio
      const baseSize = 720;
      let idealWidth, idealHeight;

      if (isLandscape) {
        idealWidth = Math.round(baseSize * aspectRatioValue);
        idealHeight = baseSize;
      } else {
        idealWidth = baseSize;
        idealHeight = Math.round(baseSize / aspectRatioValue);
      }

      // Build audio constraints - use selected device if available, or false if disabled
      const audioConstraints = !audioEnabled
        ? false
        : selectedAudioDeviceId
          ? { deviceId: { exact: selectedAudioDeviceId } }
          : true;

      // Build video constraints - use selected device if available, otherwise facingMode
      const videoConstraints = selectedVideoDeviceId
        ? {
            deviceId: { exact: selectedVideoDeviceId },
            width: { ideal: idealWidth },
            height: { ideal: idealHeight }
          }
        : {
            facingMode: facingMode,
            width: { ideal: idealWidth },
            height: { ideal: idealHeight }
          };

      console.log('[VideoRecorder] Using video device:', selectedVideoDeviceId || `facingMode: ${facingMode}`);
      console.log('[VideoRecorder] Using audio device:', selectedAudioDeviceId || 'system default');

      const constraints = {
        video: videoConstraints,
        audio: audioConstraints
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Debug: Log audio/video tracks
      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();
      console.log('[VideoRecorder] Stream obtained:');
      console.log(`  Video tracks: ${videoTracks.length}`, videoTracks.map(t => ({ label: t.label, enabled: t.enabled, muted: t.muted })));
      console.log(`  Audio tracks: ${audioTracks.length}`, audioTracks.map(t => ({ label: t.label, enabled: t.enabled, muted: t.muted })));

      if (audioTracks.length === 0) {
        console.warn('[VideoRecorder] WARNING: No audio tracks in stream! Audio will not be recorded.');
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraReady(true);
      }
    } catch (err) {
      console.error('Camera access error:', err);
      if (err.name === 'NotAllowedError') {
        setError('Camera access denied. Please enable camera permissions.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on this device.');
      } else {
        setError('Could not access camera. Please try again.');
      }
    }
  }, [facingMode, aspectRatioValue, isLandscape, cleanupResources, audioEnabled, selectedAudioDeviceId, selectedVideoDeviceId]);

  // Load last recording and enumerate devices when popup opens
  useEffect(() => {
    if (visible) {
      // Enumerate audio and video devices first
      enumerateDevices();

      setIsLoadingLastRecording(true);
      getLastRecording('video')
        .then((recording) => {
          setLastRecording(recording);
        })
        .catch(() => {
          setLastRecording(null);
        })
        .finally(() => {
          setIsLoadingLastRecording(false);
        });
    }
  }, [visible]);

  // Initialize camera when popup opens or settings change
  useEffect(() => {
    if (visible && !isPreviewing) {
      console.log('[VideoRecorder] Camera init triggered - audioEnabled:', audioEnabled, 'videoDevice:', selectedVideoDeviceId, 'audioDevice:', selectedAudioDeviceId);
      // Small delay to ensure any previous cleanup has completed
      const timeoutId = setTimeout(() => {
        initCamera();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [visible, facingMode, isPreviewing, initCamera, audioEnabled, selectedAudioDeviceId, selectedVideoDeviceId]);

  // Close menus when clicking outside
  useEffect(() => {
    if (!showVideoMenu && !showAudioMenu) return;

    const handleClickOutside = (e) => {
      // Check if click is inside the video menu button OR the portal content
      if (showVideoMenu) {
        const isInsideButton = videoMenuRef.current && videoMenuRef.current.contains(e.target);
        const isInsidePortal = videoMenuPortalRef.current && videoMenuPortalRef.current.contains(e.target);
        if (!isInsideButton && !isInsidePortal) {
          setShowVideoMenu(false);
        }
      }
      // Check if click is inside the audio menu button OR the portal content
      if (showAudioMenu) {
        const isInsideButton = audioMenuRef.current && audioMenuRef.current.contains(e.target);
        const isInsidePortal = audioMenuPortalRef.current && audioMenuPortalRef.current.contains(e.target);
        if (!isInsideButton && !isInsidePortal) {
          setShowAudioMenu(false);
        }
      }
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setShowVideoMenu(false);
        setShowAudioMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showVideoMenu, showAudioMenu]);

  // Keep ref in sync with state for cleanup
  useEffect(() => {
    recordedUrlRef.current = recordedUrl;
  }, [recordedUrl]);

  // Cleanup when popup closes
  useEffect(() => {
    if (!visible) {
      cleanupResources();
      // Revoke URL if it wasn't passed to parent (recordedUrl is still set)
      if (recordedUrlRef.current) {
        try {
          URL.revokeObjectURL(recordedUrlRef.current);
        } catch (e) {
          // Ignore
        }
      }
      resetAllState();
    }
  }, [visible, cleanupResources, resetAllState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupResources();
    };
  }, [cleanupResources]);

  const toggleCamera = () => {
    if (isRecording) return;
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const startRecording = () => {
    if (!streamRef.current || !videoRef.current) {
      setError('Camera not ready. Please try again.');
      return;
    }

    // Make sure previous recording is cleaned up
    clearAllTimers();
    chunksRef.current = [];
    setRecordingDuration(0);
    setError('');

    try {
      // Try different mime types - order matters for browser compatibility
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs=h264,aac',
        'video/mp4'
      ];

      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      if (!selectedMimeType) {
        setError('Video recording not supported on this browser.');
        return;
      }

      // Get video element dimensions
      const video = videoRef.current;
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      const videoAspect = videoWidth / videoHeight;

      // Calculate canvas dimensions based on target aspect ratio
      // Use 720p base resolution, adjusted for aspect ratio
      const baseSize = 720;
      let canvasWidth, canvasHeight;

      if (isLandscape) {
        canvasWidth = Math.round(baseSize * aspectRatioValue);
        canvasHeight = baseSize;
      } else {
        canvasWidth = baseSize;
        canvasHeight = Math.round(baseSize / aspectRatioValue);
      }

      // Create offscreen canvas for cropped recording
      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');
      canvasRef.current = canvas;

      console.log('[VideoRecorder] Canvas-based recording setup:');
      console.log(`  Target aspect ratio: ${aspectRatio} (${aspectRatioValue.toFixed(3)})`);
      console.log(`  Canvas size: ${canvasWidth}x${canvasHeight}`);
      console.log(`  Video source: ${videoWidth}x${videoHeight} (aspect: ${videoAspect.toFixed(3)})`);

      // Calculate crop region to center-crop the video to target aspect ratio
      let srcX, srcY, srcWidth, srcHeight;
      if (videoAspect > aspectRatioValue) {
        // Video is wider than target - crop sides
        srcHeight = videoHeight;
        srcWidth = Math.round(videoHeight * aspectRatioValue);
        srcX = Math.round((videoWidth - srcWidth) / 2);
        srcY = 0;
      } else {
        // Video is taller than target - crop top/bottom
        srcWidth = videoWidth;
        srcHeight = Math.round(videoWidth / aspectRatioValue);
        srcX = 0;
        srcY = Math.round((videoHeight - srcHeight) / 2);
      }

      console.log(`  Crop region: (${srcX}, ${srcY}) ${srcWidth}x${srcHeight}`);

      // Mirror the video if using front camera
      const shouldMirror = facingMode === 'user';

      // Start drawing video frames to canvas
      const drawFrame = () => {
        if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) {
          canvasAnimationRef.current = requestAnimationFrame(drawFrame);
          return;
        }

        ctx.save();
        if (shouldMirror) {
          ctx.translate(canvasWidth, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(
          video,
          srcX, srcY, srcWidth, srcHeight, // Source crop
          0, 0, canvasWidth, canvasHeight  // Destination
        );
        ctx.restore();

        canvasAnimationRef.current = requestAnimationFrame(drawFrame);
      };
      drawFrame();

      // Capture canvas stream at 30fps
      const canvasStream = canvas.captureStream(30);
      canvasStreamRef.current = canvasStream;

      // Create combined stream with canvas video + original audio
      const combinedTracks = [...canvasStream.getVideoTracks()];

      // Add audio track if enabled
      const audioTracks = streamRef.current.getAudioTracks();
      if (audioEnabled && audioTracks.length > 0) {
        combinedTracks.push(audioTracks[0]);
        console.log(`  Audio track: ${audioTracks[0].label}`);
      } else {
        console.log('  Audio: disabled or not available');
      }

      const combinedStream = new MediaStream(combinedTracks);

      console.log(`  Recording stream: ${combinedStream.getVideoTracks().length} video, ${combinedStream.getAudioTracks().length} audio`);

      // Configure MediaRecorder with the combined stream
      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: 4000000,
        audioBitsPerSecond: 128000
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Clear timer and canvas animation
        clearAllTimers();
        if (canvasAnimationRef.current) {
          cancelAnimationFrame(canvasAnimationRef.current);
          canvasAnimationRef.current = null;
        }

        // Stop canvas stream
        if (canvasStreamRef.current) {
          canvasStreamRef.current.getTracks().forEach(track => track.stop());
          canvasStreamRef.current = null;
        }

        const finalDuration = recordingStartTimeRef.current
          ? (Date.now() - recordingStartTimeRef.current) / 1000
          : 0;
        recordingStartTimeRef.current = null;

        if (chunksRef.current.length === 0) {
          setError('No video data recorded. Please try again.');
          setIsRecording(false);
          initCamera();
          return;
        }

        const blob = new Blob(chunksRef.current, { type: selectedMimeType });
        const url = URL.createObjectURL(blob);

        console.log('[VideoRecorder] Recording completed:');
        console.log(`  Chunks: ${chunksRef.current.length}`);
        console.log(`  Blob size: ${blob.size} bytes`);
        console.log(`  Output dimensions: ${canvasWidth}x${canvasHeight}`);
        console.log(`  Duration: ${finalDuration.toFixed(2)}s`);

        setRecordedBlob(blob);
        setRecordedUrl(url);
        setRecordingDuration(finalDuration);
        setIsRecording(false);
        setIsPreviewing(true);

        // Stop camera stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      };

      mediaRecorder.onerror = (e) => {
        console.error('MediaRecorder error:', e);
        setError('Recording failed. Please try again.');
        clearAllTimers();
        if (canvasAnimationRef.current) {
          cancelAnimationFrame(canvasAnimationRef.current);
        }
        setIsRecording(false);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);
      setIsRecording(true);

      // Start duration timer
      recordingStartTimeRef.current = Date.now();
      recordingTimerRef.current = setInterval(() => {
        if (recordingStartTimeRef.current) {
          const elapsed = (Date.now() - recordingStartTimeRef.current) / 1000;
          setRecordingDuration(elapsed);

          if (elapsed >= maxDuration) {
            stopRecording();
          }
        }
      }, 100);

    } catch (err) {
      console.error('Failed to start recording:', err);
      setError('Failed to start recording. Please try again.');
    }
  };

  const stopRecording = () => {
    // Clear timer first
    clearAllTimers();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.error('Error stopping MediaRecorder:', e);
      }
    }
    // Note: setIsRecording(false) will be called in onstop handler
  };

  const handleRecordButton = () => {
    if (isRecording) {
      stopRecording();
    } else if (isCameraReady) {
      startRecording();
    }
  };

  // Reinitialize camera with new device settings
  const reinitializeCamera = async (newVideoDeviceId, newAudioDeviceId) => {
    if (isPreviewing || isRecording) return;

    cleanupResources();
    setTimeout(async () => {
      const baseSize = 720;
      let idealWidth, idealHeight;
      if (isLandscape) {
        idealWidth = Math.round(baseSize * aspectRatioValue);
        idealHeight = baseSize;
      } else {
        idealWidth = baseSize;
        idealHeight = Math.round(baseSize / aspectRatioValue);
      }

      try {
        const videoConstraints = newVideoDeviceId
          ? { deviceId: { exact: newVideoDeviceId }, width: { ideal: idealWidth }, height: { ideal: idealHeight } }
          : { facingMode: facingMode, width: { ideal: idealWidth }, height: { ideal: idealHeight } };

        const audioConstraints = !audioEnabled
          ? false
          : newAudioDeviceId
            ? { deviceId: { exact: newAudioDeviceId } }
            : true;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: audioConstraints
        });
        streamRef.current = stream;

        const videoTracks = stream.getVideoTracks();
        const audioTracks = stream.getAudioTracks();
        console.log('[VideoRecorder] New video track:', videoTracks[0]?.label || 'none');
        console.log('[VideoRecorder] New audio track:', audioTracks[0]?.label || 'none');

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setIsCameraReady(true);
        }
      } catch (err) {
        console.error('[VideoRecorder] Failed to switch devices:', err);
        setError('Failed to switch device. Please try again.');
      }
    }, 100);
  };

  // Handle video device selection change
  const handleVideoDeviceChange = (deviceId) => {
    console.log('[VideoRecorder] Switching to video device:', deviceId);
    setSelectedVideoDeviceId(deviceId);
    reinitializeCamera(deviceId, selectedAudioDeviceId);
  };

  // Handle audio device selection change
  const handleAudioDeviceChange = (deviceId) => {
    console.log('[VideoRecorder] Switching to audio device:', deviceId);
    setSelectedAudioDeviceId(deviceId);
    reinitializeCamera(selectedVideoDeviceId, deviceId);
  };

  const handleRetake = () => {
    // Store URL to revoke
    const urlToRevoke = recordedUrl;

    // Clear timer first
    clearAllTimers();

    // Reset all recording state
    setRecordedBlob(null);
    setRecordedUrl(null);
    recordedUrlRef.current = null;
    setIsPreviewing(false);
    setRecordingDuration(0);
    setIsRecording(false);
    setError('');
    chunksRef.current = [];
    recordingStartTimeRef.current = null;
    mediaRecorderRef.current = null;

    // Revoke URL after clearing state
    if (urlToRevoke) {
      try {
        URL.revokeObjectURL(urlToRevoke);
      } catch (e) {
        // Ignore errors revoking URL
      }
    }

    // Delay to ensure state is updated before re-initializing
    setTimeout(() => {
      initCamera();
    }, 200);
  };

  const handleUseRecording = async () => {
    if (recordedBlob && recordedUrl) {
      try {
        setError('');

        // Use the recording directly without conversion
        // FFmpeg.wasm conversion is disabled due to reliability issues
        const finalBlob = recordedBlob;
        const finalMimeType = recordedBlob.type;

        // Create a File object from the blob
        const extension = finalMimeType.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([finalBlob], `recording-${Date.now()}.${extension}`, {
          type: finalMimeType
        });

        // Create a new URL for the blob
        const finalUrl = URL.createObjectURL(finalBlob);
        const durationToPass = recordingDuration;

        // Save recording to IndexedDB for future reuse
        saveRecording('video', finalBlob, durationToPass, aspectRatio).catch((err) => {
          console.error('Failed to save recording to IndexedDB:', err);
        });

        // Clear local state
        setRecordedUrl(null);
        setRecordedBlob(null);
        recordedUrlRef.current = null;

        onRecordingComplete({
          file,
          blob: finalBlob,
          url: finalUrl,
          duration: durationToPass,
          aspectRatio: aspectRatio
        });
      } catch (err) {
        console.error('[VideoRecorder] Error processing recording:', err);
        setError('Failed to process video. Please try again.');
      }
    }
  };

  const handleUseLastRecording = async () => {
    if (lastRecording) {
      try {
        setError('');

        // Use the recording directly without conversion
        const finalBlob = lastRecording.blob;
        const finalMimeType = lastRecording.mimeType || lastRecording.blob.type;

        // Create file from blob
        const extension = finalMimeType.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([finalBlob], `recording-${Date.now()}.${extension}`, {
          type: finalMimeType
        });
        const url = URL.createObjectURL(finalBlob);

        onRecordingComplete({
          file,
          blob: finalBlob,
          url,
          duration: lastRecording.duration,
          aspectRatio: lastRecording.aspectRatio || aspectRatio
        });
      } catch (err) {
        console.error('[VideoRecorder] Error using last recording:', err);
        setError('Failed to load previous recording.');
      }
    }
  };

  const handleClose = () => {
    cleanupResources();
    if (recordedUrl) {
      try {
        URL.revokeObjectURL(recordedUrl);
      } catch (e) {
        // Ignore
      }
    }
    resetAllState();
    onClose();
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!visible) return null;

  // Determine if we should mirror the video display
  const shouldMirrorLive = facingMode === 'user';

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10001,
        padding: isMobile ? '10px' : '20px',
        backdropFilter: 'blur(12px)',
        animation: 'fadeIn 0.2s ease'
      }}
      onClick={handleClose}
    >
      {/* Polaroid Frame Container */}
      <div
        style={{
          background: 'white',
          borderRadius: '4px',
          boxShadow: '0 2px 0 #e5e5e5, 0 8px 30px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 0,
          maxWidth: isMobile ? '95vw' : (isLandscape ? '600px' : '400px'),
          width: '100%',
          maxHeight: isMobile ? '90vh' : '85vh',
          position: 'relative',
          animation: 'slideUp 0.3s ease',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(0, 0, 0, 0.15)',
            color: '#333',
            fontSize: '18px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            zIndex: 10
          }}
        >
          ×
        </button>

        {/* Polaroid Header */}
        <div style={{
          padding: isMobile ? '12px 16px 8px' : '16px 24px 12px',
          width: '100%',
          textAlign: 'center',
          borderBottom: '1px solid rgba(0,0,0,0.05)'
        }}>
          <h3 style={{
            margin: 0,
            fontFamily: '"Permanent Marker", cursive',
            fontSize: isMobile ? '18px' : '22px',
            color: accentColor,
            letterSpacing: '1px'
          }}>
            {title}
          </h3>

        </div>

        {/* Camera View Area */}
        <div style={{
          width: '100%',
          padding: isMobile ? '16px' : '24px',
          paddingBottom: isMobile ? '80px' : '100px',
          background: 'white'
        }}>
          <div style={{
            position: 'relative',
            width: '100%',
            aspectRatio: aspectRatio,
            maxHeight: isMobile ? '55vh' : '50vh',
            backgroundColor: '#111',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: 'inset 0 0 20px rgba(0,0,0,0.3)'
          }}>
            {/* Live Camera View */}
            {!isPreviewing && (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transform: shouldMirrorLive ? 'scaleX(-1)' : 'none'
                  }}
                />

                {/* Recording indicator */}
                {isRecording && (
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    left: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 12px',
                    backgroundColor: 'rgba(239, 68, 68, 0.9)',
                    borderRadius: '20px',
                    zIndex: 5
                  }}>
                    <div style={{
                      width: '10px',
                      height: '10px',
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      animation: 'pulse 1s infinite'
                    }} />
                    <span style={{
                      color: 'white',
                      fontSize: '13px',
                      fontWeight: '700',
                      fontVariantNumeric: 'tabular-nums'
                    }}>
                      {formatTime(recordingDuration)}
                    </span>
                  </div>
                )}

                {/* Duration limit indicator */}
                {isRecording && (
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    padding: '4px 10px',
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    borderRadius: '12px',
                    color: 'white',
                    fontSize: '11px',
                    fontWeight: '500'
                  }}>
                    Max: {formatTime(maxDuration)}
                  </div>
                )}

                {/* Camera not ready overlay */}
                {!isCameraReady && !error && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#111'
                  }}>
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
                      Starting camera...
                    </span>
                  </div>
                )}

                {/* Error overlay */}
                {error && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#111',
                    padding: '20px',
                    textAlign: 'center'
                  }}>
                    <div>
                      <span style={{ fontSize: '40px', marginBottom: '12px', display: 'block' }}>📷</span>
                      <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '14px' }}>
                        {error}
                      </span>
                      <button
                        onClick={() => {
                          setError('');
                          initCamera();
                        }}
                        style={{
                          display: 'block',
                          margin: '16px auto 0',
                          padding: '8px 16px',
                          background: accentColor,
                          color: 'white',
                          border: 'none',
                          borderRadius: '20px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: '600'
                        }}
                      >
                        Try Again
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Preview Recorded Video */}
            {isPreviewing && recordedUrl && (
              <video
                ref={previewVideoRef}
                src={recordedUrl}
                autoPlay
                loop
                playsInline
                muted={false}
                controls
                onLoadedMetadata={(e) => {
                  const video = e.target;
                  console.log('[VideoRecorder] Preview video loaded:');
                  console.log(`  Duration: ${video.duration}s`);
                  console.log(`  Muted: ${video.muted}`);
                  console.log(`  Volume: ${video.volume}`);
                  // Check videoTracks and audioTracks if available
                  if (video.videoTracks) {
                    console.log(`  Video tracks: ${video.videoTracks.length}`);
                  }
                  if (video.audioTracks) {
                    console.log(`  Audio tracks: ${video.audioTracks.length}`);
                    for (let i = 0; i < video.audioTracks.length; i++) {
                      console.log(`    Track ${i}: enabled=${video.audioTracks[i].enabled}, label=${video.audioTracks[i].label}`);
                    }
                  } else {
                    console.log('  Audio tracks: API not available in this browser');
                  }
                }}
                onPlay={(e) => {
                  const video = e.target;
                  console.log('[VideoRecorder] Preview playing - muted:', video.muted, 'volume:', video.volume);
                  // Try to unmute if browser muted it
                  if (video.muted) {
                    console.log('[VideoRecorder] Video was auto-muted, attempting to unmute...');
                    video.muted = false;
                  }
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
            )}

          </div>
        </div>

        {/* Bottom Controls */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: isMobile ? '12px 16px' : '16px 24px',
          background: 'white'
        }}>
          {!isPreviewing ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}>
              {/* Left: Camera selector button */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                flex: '1',
                justifyContent: 'flex-end',
                position: 'relative'
              }} ref={videoMenuRef}>
                <button
                  onClick={() => !isRecording && videoDevices.length > 0 && setShowVideoMenu(!showVideoMenu)}
                  disabled={isRecording || videoDevices.length === 0}
                  title="Select camera"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '2px',
                    padding: '8px 10px',
                    borderRadius: '20px',
                    border: 'none',
                    fontSize: '14px',
                    height: '40px',
                    cursor: (isRecording || videoDevices.length === 0) ? 'not-allowed' : 'pointer',
                    opacity: (isRecording || videoDevices.length === 0) ? 0.5 : 1,
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {/* Camera SVG Icon */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 5H16.83L15 3H9L7.17 5H4C2.9 5 2 5.9 2 7V19C2 20.1 2.9 21 4 21H20C21.1 21 22 20.1 22 19V7C22 5.9 21.1 5 20 5ZM12 18C9.24 18 7 15.76 7 13C7 10.24 9.24 8 12 8C14.76 8 17 10.24 17 13C17 15.76 14.76 18 12 18Z" fill="#333"/>
                  </svg>
                  {/* Chevron indicator */}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginLeft: '2px' }}>
                    <path d="M7 10L12 15L17 10" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {/* Camera dropdown menu - rendered in portal to avoid clipping */}
                {showVideoMenu && videoDevices.length > 0 && createPortal(
                  <div
                    ref={videoMenuPortalRef}
                    style={{
                      position: 'fixed',
                      bottom: isMobile ? '100px' : '120px',
                      left: '50%',
                      transform: 'translateX(-70%)',
                      zIndex: 100002,
                      background: 'rgba(255, 255, 255, 0.98)',
                      borderRadius: '12px',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.24)',
                      border: '1px solid rgba(0,0,0,0.08)',
                      minWidth: '260px',
                      maxWidth: '90vw',
                      overflow: 'hidden',
                      backdropFilter: 'blur(8px)'
                    }}
                  >
                    <div style={{
                      fontFamily: '"Permanent Marker", cursive',
                      fontSize: '14px',
                      color: '#444',
                      padding: '10px 12px',
                      borderBottom: '1px solid rgba(0,0,0,0.08)'
                    }}>Choose Camera</div>
                    <ul style={{ listStyle: 'none', margin: 0, padding: '6px 0', maxHeight: '200px', overflowY: 'auto' }}>
                      {videoDevices.map((device, index) => {
                        const isActive = device.deviceId === selectedVideoDeviceId;
                        const label = device.label || `Camera ${index + 1}`;
                        return (
                          <li key={device.deviceId || index}>
                            <button
                              onClick={() => {
                                console.log('[VideoRecorder] Video device selected:', device.label || device.deviceId);
                                handleVideoDeviceChange(device.deviceId);
                                setShowVideoMenu(false);
                              }}
                              style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '10px',
                                padding: '10px 12px',
                                background: isActive ? 'rgba(255, 83, 136, 0.10)' : 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'background 0.15s ease'
                              }}
                            >
                              <span style={{ color: '#222', fontSize: '14px', lineHeight: 1.2, flex: 1 }}>{label}</span>
                              {isActive && <span style={{ color: accentColor, fontWeight: 700 }}>✓</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>,
                  document.body
                )}
              </div>

              {/* Center: Record button */}
              <button
                onClick={handleRecordButton}
                disabled={!isCameraReady && !isRecording}
                style={{
                  width: isMobile ? '64px' : '72px',
                  height: isMobile ? '64px' : '72px',
                  borderRadius: '50%',
                  border: `4px solid ${isRecording ? '#ef4444' : '#222'}`,
                  background: 'white',
                  cursor: (!isCameraReady && !isRecording) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                  opacity: (!isCameraReady && !isRecording) ? 0.5 : 1,
                  flexShrink: 0
                }}
              >
                <div style={{
                  width: isRecording ? '24px' : '32px',
                  height: isRecording ? '24px' : '32px',
                  backgroundColor: '#ef4444',
                  borderRadius: isRecording ? '4px' : '50%',
                  border: '2px solid white',
                  transition: 'all 0.2s ease'
                }} />
              </button>

              {/* Right: Microphone selector + Use Previous */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flex: '1',
                justifyContent: 'flex-start',
                position: 'relative'
              }} ref={audioMenuRef}>
                <button
                  onClick={() => !isRecording && setShowAudioMenu(!showAudioMenu)}
                  disabled={isRecording}
                  title={audioEnabled ? "Audio enabled - click to configure" : "Audio disabled - click to enable"}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '2px',
                    padding: '8px 10px',
                    borderRadius: '20px',
                    border: 'none',
                    fontSize: '14px',
                    height: '40px',
                    cursor: isRecording ? 'not-allowed' : 'pointer',
                    opacity: isRecording ? 0.5 : 1,
                    backgroundColor: audioEnabled ? 'rgba(255, 255, 255, 0.9)' : 'rgba(239, 68, 68, 0.15)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {/* Microphone SVG Icon - with mute line if disabled */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 14C13.66 14 15 12.66 15 11V5C15 3.34 13.66 2 12 2C10.34 2 9 3.34 9 5V11C9 12.66 10.34 14 12 14Z" fill={audioEnabled ? "#333" : "#999"}/>
                    <path d="M17 11C17 13.76 14.76 16 12 16C9.24 16 7 13.76 7 11H5C5 14.53 7.61 17.43 11 17.92V21H13V17.92C16.39 17.43 19 14.53 19 11H17Z" fill={audioEnabled ? "#333" : "#999"}/>
                    {!audioEnabled && <path d="M3 3L21 21" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>}
                  </svg>
                  {/* Chevron indicator */}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginLeft: '2px' }}>
                    <path d="M7 10L12 15L17 10" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {/* Audio dropdown menu - rendered in portal to avoid clipping */}
                {showAudioMenu && createPortal(
                  <div
                    ref={audioMenuPortalRef}
                    style={{
                      position: 'fixed',
                      bottom: isMobile ? '100px' : '120px',
                      left: '50%',
                      transform: 'translateX(-30%)',
                      zIndex: 100002,
                      background: 'rgba(255, 255, 255, 0.98)',
                      borderRadius: '12px',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.24)',
                      border: '1px solid rgba(0,0,0,0.08)',
                      minWidth: '260px',
                      maxWidth: '90vw',
                      overflow: 'hidden',
                      backdropFilter: 'blur(8px)'
                    }}
                  >
                    <div style={{
                      fontFamily: '"Permanent Marker", cursive',
                      fontSize: '14px',
                      color: '#444',
                      padding: '10px 12px',
                      borderBottom: '1px solid rgba(0,0,0,0.08)'
                    }}>Audio Settings</div>

                    {/* Audio enable/disable toggle */}
                    <button
                      onClick={() => {
                        const newAudioEnabled = !audioEnabled;
                        console.log('[VideoRecorder] Toggling audio:', newAudioEnabled ? 'enabled' : 'disabled');
                        setAudioEnabled(newAudioEnabled);
                        // The useEffect that depends on initCamera will reinit the camera
                        // because initCamera's useCallback depends on audioEnabled
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        padding: '10px 12px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid rgba(0,0,0,0.08)',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      <span style={{ color: '#222', fontSize: '14px', fontWeight: 600 }}>
                        {audioEnabled ? 'Audio Enabled' : 'Audio Disabled'}
                      </span>
                      <div style={{
                        width: '40px',
                        height: '22px',
                        borderRadius: '11px',
                        background: audioEnabled ? accentColor : '#ccc',
                        position: 'relative',
                        transition: 'background 0.2s ease'
                      }}>
                        <div style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: 'white',
                          position: 'absolute',
                          top: '2px',
                          left: audioEnabled ? '20px' : '2px',
                          transition: 'left 0.2s ease',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                        }} />
                      </div>
                    </button>

                    {/* Device list - only show if audio is enabled */}
                    {audioEnabled && audioDevices.length > 0 && (
                      <ul style={{ listStyle: 'none', margin: 0, padding: '6px 0', maxHeight: '160px', overflowY: 'auto' }}>
                        {audioDevices.map((device, index) => {
                          const isActive = device.deviceId === selectedAudioDeviceId;
                          const label = device.label || `Microphone ${index + 1}`;
                          return (
                            <li key={device.deviceId || index}>
                              <button
                                onClick={() => {
                                  console.log('[VideoRecorder] Audio device selected:', device.label || device.deviceId);
                                  handleAudioDeviceChange(device.deviceId);
                                  setShowAudioMenu(false);
                                }}
                                style={{
                                  width: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '10px',
                                  padding: '10px 12px',
                                  background: isActive ? 'rgba(255, 83, 136, 0.10)' : 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                  transition: 'background 0.15s ease'
                                }}
                              >
                                <span style={{ color: '#222', fontSize: '14px', lineHeight: 1.2, flex: 1 }}>{label}</span>
                                {isActive && <span style={{ color: accentColor, fontWeight: 700 }}>✓</span>}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>,
                  document.body
                )}

                {/* Use Previous - thumbnail with proper aspect ratio from recording */}
                {!isRecording && lastRecording && lastRecording.thumbnailUrl && (() => {
                  // Calculate thumbnail dimensions based on recorded aspect ratio
                  const recordedAspect = lastRecording.aspectRatio || '9/16';
                  const [w, h] = recordedAspect.split('/').map(Number);
                  const aspectValue = w / h;
                  const maxDim = 48;
                  const thumbWidth = aspectValue >= 1 ? maxDim : Math.round(maxDim * aspectValue);
                  const thumbHeight = aspectValue >= 1 ? Math.round(maxDim / aspectValue) : maxDim;

                  return (
                    <button
                      onClick={handleUseLastRecording}
                      title={`Use previous (${formatTime(lastRecording.duration)})`}
                      style={{
                        width: `${thumbWidth}px`,
                        height: `${thumbHeight}px`,
                        borderRadius: '6px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        border: '2px solid #222',
                        background: 'white',
                        padding: '0',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                        transition: 'all 0.2s ease',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <img
                        src={lastRecording.thumbnailUrl}
                        alt="Use previous"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          borderRadius: '4px'
                        }}
                      />
                    </button>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              width: '100%'
            }}>
              {/* Retake button */}
              <button
                onClick={handleRetake}
                style={{
                  padding: '12px 20px',
                  borderRadius: '25px',
                  border: '2px solid #ddd',
                  background: 'white',
                  color: '#333',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4C7.58 4 4.01 7.58 4.01 12C4.01 16.42 7.58 20 12 20C15.73 20 18.84 17.45 19.73 14H17.65C16.83 16.33 14.61 18 12 18C8.69 18 6 15.31 6 12C6 8.69 8.69 6 12 6C13.66 6 15.14 6.69 16.22 7.78L13 11H20V4L17.65 6.35Z" fill="#333"/>
                </svg>
                Retake
              </button>

              {/* Download button */}
              {recordedUrl && (
                <a
                  href={recordedUrl}
                  download={`recording-${Date.now()}.webm`}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '25px',
                    border: '2px solid #ddd',
                    background: 'white',
                    color: '#333',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    textDecoration: 'none',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Download recording"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 9H15V3H9V9H5L12 16L19 9ZM5 18V20H19V18H5Z" fill="#333"/>
                  </svg>
                </a>
              )}

              {/* Use Recording button */}
              <button
                onClick={handleUseRecording}
                style={{
                  padding: '12px 24px',
                  borderRadius: '25px',
                  border: 'none',
                  background: accentColor,
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: `0 4px 15px ${accentColor}50`,
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 16.17L4.83 12L3.41 13.41L9 19L21 7L19.59 5.59L9 16.17Z" fill="white"/>
                </svg>
                Use Video
              </button>
            </div>
          )}
        </div>

        {/* Recording duration bar */}
        {isRecording && (
          <div style={{
            position: 'absolute',
            bottom: isMobile ? '90px' : '110px',
            left: isMobile ? '16px' : '24px',
            right: isMobile ? '16px' : '24px',
            height: '4px',
            backgroundColor: 'rgba(0,0,0,0.1)',
            borderRadius: '2px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min((recordingDuration / maxDuration) * 100, 100)}%`,
              backgroundColor: accentColor,
              transition: 'width 0.1s linear'
            }} />
          </div>
        )}
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
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>,
    document.body
  );
};

VideoRecorderPopup.propTypes = {
  visible: PropTypes.bool.isRequired,
  onRecordingComplete: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  maxDuration: PropTypes.number,
  title: PropTypes.string,
  accentColor: PropTypes.string,
  aspectRatio: PropTypes.string
};

export default VideoRecorderPopup;
