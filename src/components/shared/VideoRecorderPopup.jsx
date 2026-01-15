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

  const videoRef = useRef(null);
  const previewVideoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const recordedUrlRef = useRef(null);
  const recordingStartTimeRef = useRef(null);

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

      const constraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: idealWidth },
          height: { ideal: idealHeight }
        },
        audio: true
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

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
  }, [facingMode, aspectRatioValue, isLandscape, cleanupResources]);

  // Load last recording and preload FFmpeg when popup opens
  useEffect(() => {
    if (visible) {
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

  // Initialize camera when popup opens or facing mode changes
  useEffect(() => {
    if (visible && !isPreviewing) {
      // Small delay to ensure any previous cleanup has completed
      const timeoutId = setTimeout(() => {
        initCamera();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [visible, facingMode, isPreviewing, initCamera]);

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
    if (!streamRef.current) {
      setError('Camera not ready. Please try again.');
      return;
    }

    // Make sure previous recording is cleaned up
    clearAllTimers();
    chunksRef.current = [];
    setRecordingDuration(0);
    setError('');

    try {
      // Try different mime types
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
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

      // Configure MediaRecorder with settings optimized for video generation
      // Higher bitrate and longer chunk intervals for better keyframe distribution
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: 4000000, // 4 Mbps for better quality
        audioBitsPerSecond: 128000   // 128 kbps audio
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Clear timer immediately on stop
        clearAllTimers();

        // Calculate final duration
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
        setIsRecording(false);
      };

      mediaRecorderRef.current = mediaRecorder;
      // Use 1 second intervals to ensure proper keyframe distribution in the recorded video
      // Shorter intervals can cause fragmented keyframes which may cause playback issues
      mediaRecorder.start(1000);
      setIsRecording(true);

      // Start duration timer
      recordingStartTimeRef.current = Date.now();
      recordingTimerRef.current = setInterval(() => {
        if (recordingStartTimeRef.current) {
          const elapsed = (Date.now() - recordingStartTimeRef.current) / 1000;
          setRecordingDuration(elapsed);

          // Auto-stop at max duration
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
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
            )}
          </div>
        </div>

        {/* Use Previous Recording Button - tucked in bottom right corner */}
        {!isPreviewing && !isRecording && lastRecording && lastRecording.thumbnailUrl && (
          <div
            style={{
              position: 'absolute',
              bottom: '16px',
              right: '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              padding: '6px',
              background: 'rgba(0, 0, 0, 0.6)',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              zIndex: 10
            }}
            onClick={handleUseLastRecording}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(0, 0, 0, 0.85)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.6)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }}
          >
            <img
              src={lastRecording.thumbnailUrl}
              alt="Previous recording"
              style={{
                width: '40px',
                height: '53px',
                objectFit: 'cover',
                borderRadius: '4px',
                border: '1px solid white'
              }}
            />
            <div style={{ 
              color: 'white', 
              fontSize: '9px',
              fontWeight: '600',
              textAlign: 'center',
              lineHeight: '1.2'
            }}>
              Use<br/>Previous
            </div>
            <div style={{ 
              color: 'rgba(255,255,255,0.8)', 
              fontSize: '8px',
              fontWeight: '500'
            }}>
              {formatTime(lastRecording.duration)}
            </div>
          </div>
        )}

        {/* Bottom Controls */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: isMobile ? '16px' : '24px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '20px',
          background: 'white'
        }}>
          {!isPreviewing ? (
            <>
              {/* Camera flip button */}
              <button
                onClick={toggleCamera}
                disabled={isRecording}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  border: '2px solid #ddd',
                  background: 'white',
                  cursor: isRecording ? 'not-allowed' : 'pointer',
                  opacity: isRecording ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  transition: 'all 0.2s ease'
                }}
                title="Switch Camera"
              >
                🔄
              </button>

              {/* Record button */}
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
                  opacity: (!isCameraReady && !isRecording) ? 0.5 : 1
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

              {/* Spacer for symmetry */}
              <div style={{ width: '44px' }} />
            </>
          ) : (
            <>
              {/* Retake button */}
              <button
                onClick={handleRetake}
                style={{
                  padding: '12px 24px',
                  borderRadius: '25px',
                  border: '2px solid #ddd',
                  background: 'white',
                  color: '#333',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                🔄 Retake
              </button>

              {/* Use Recording button */}
              <button
                onClick={handleUseRecording}
                style={{
                  padding: '12px 28px',
                  borderRadius: '25px',
                  border: 'none',
                  background: accentColor,
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: `0 4px 15px ${accentColor}50`,
                  transition: 'all 0.2s ease',
                  minWidth: '140px'
                }}
              >
                ✓ Use Video
              </button>
            </>
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
