import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { saveRecording, getLastRecording, recordingToFile } from '../../utils/recordingsDB';

/**
 * AudioRecorderPopup
 * A popup component for recording audio for Sound-to-Video generation
 * Features real-time waveform visualization and playback preview
 */
const AudioRecorderPopup = ({
  visible,
  onRecordingComplete,
  onClose,
  maxDuration = 60, // Max recording duration in seconds
  title = 'Record Audio',
  accentColor = '#ec4899' // Default to pink (S2V)
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastRecording, setLastRecording] = useState(null);
  const [isLoadingLastRecording, setIsLoadingLastRecording] = useState(true);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [isMicReady, setIsMicReady] = useState(false);
  const [waveformData, setWaveformData] = useState([]);
  const [recordedWaveform, setRecordedWaveform] = useState([]);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  const audioRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const audioContextRef = useRef(null);
  const recordedUrlRef = useRef(null);
  const recordingStartTimeRef = useRef(null);
  const waveformSnapshotsRef = useRef([]);
  const currentWaveformRef = useRef([]); // Ref to store current waveform for snapshot capture

  const isMobile = windowWidth < 768;

  // Handle window resize
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keep ref in sync with state for cleanup
  useEffect(() => {
    recordedUrlRef.current = recordedUrl;
  }, [recordedUrl]);

  // Define cleanup function BEFORE useEffects that use it
  const cleanup = useCallback(() => {
    // Stop recording if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Clear timers
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    setIsRecording(false);
    setIsMicReady(false);
    setIsPlaying(false);
  }, []);

  // Load last recording when popup opens
  useEffect(() => {
    if (visible) {
      setIsLoadingLastRecording(true);
      getLastRecording('audio')
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

  // Initialize microphone when popup opens
  useEffect(() => {
    if (visible && !isPreviewing) {
      // Small delay to ensure any previous cleanup has completed
      const timeoutId = setTimeout(() => {
        initMicrophone();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [visible, isPreviewing]);

  // Cleanup when popup closes
  useEffect(() => {
    if (!visible) {
      cleanup();
      // Revoke URL if it wasn't passed to parent (recordedUrl is still set)
      if (recordedUrlRef.current) {
        URL.revokeObjectURL(recordedUrlRef.current);
      }
      setIsPreviewing(false);
      setRecordedBlob(null);
      setRecordedUrl(null);
      setRecordingDuration(0);
      setError('');
      setWaveformData([]);
      setRecordedWaveform([]);
      setCountdown(0);
      setIsPlaying(false);
      chunksRef.current = [];
    }
  }, [visible, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Enumerate available audio input devices
  const enumerateAudioDevices = async () => {
    try {
      // Request permission first to get device labels
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      setAudioDevices(audioInputs);
      
      // Set default device if not already selected
      if (!selectedDeviceId && audioInputs.length > 0) {
        setSelectedDeviceId(audioInputs[0].deviceId);
      }
      return audioInputs;
    } catch (err) {
      console.error('Error enumerating devices:', err);
      return [];
    }
  };

  const initMicrophone = async (deviceId = null) => {
    try {
      setError('');
      setIsMicReady(false);

      // Stop existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      // Use provided deviceId, or selectedDeviceId, or default
      const targetDeviceId = deviceId || selectedDeviceId;
      
      const constraints = {
        audio: targetDeviceId 
          ? {
              deviceId: { exact: targetDeviceId },
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          : {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Enumerate devices after getting permission (to get labels)
      await enumerateAudioDevices();

      // Setup audio analyser for visualization
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      setIsMicReady(true);

      // Start visualization
      visualize();

    } catch (err) {
      console.error('Microphone access error:', err);
      if (err.name === 'NotAllowedError') {
        setError('Microphone access denied. Please enable microphone permissions.');
      } else if (err.name === 'NotFoundError') {
        setError('No microphone found on this device.');
      } else if (err.name === 'OverconstrainedError') {
        // Device not available, try without specific device
        setSelectedDeviceId('');
        setError('Selected device not available. Using default microphone.');
        initMicrophone('');
      } else {
        setError('Could not access microphone. Please try again.');
      }
    }
  };

  // Handle device change
  const handleDeviceChange = (deviceId) => {
    setSelectedDeviceId(deviceId);
    if (!isRecording && !isPreviewing) {
      initMicrophone(deviceId);
    }
  };

  const visualize = () => {
    if (!analyserRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!analyserRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);

      // Sample the data for visualization (reduce to ~50 bars)
      const samples = 50;
      const step = Math.floor(bufferLength / samples);
      const visualData = [];

      for (let i = 0; i < samples; i++) {
        const value = dataArray[i * step] / 255; // Normalize to 0-1
        visualData.push(value);
      }

      // Update both state (for UI) and ref (for snapshot capture)
      setWaveformData(visualData);
      currentWaveformRef.current = visualData;
      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
  };

  const startRecording = () => {
    if (!streamRef.current) {
      setError('Microphone not ready. Please try again.');
      return;
    }

    chunksRef.current = [];
    setRecordingDuration(0);
    setRecordedWaveform([]);

    try {
      // Try different mime types
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus'
      ];

      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      if (!selectedMimeType) {
        setError('Audio recording not supported on this browser.');
        return;
      }

      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType: selectedMimeType,
        audioBitsPerSecond: 128000
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Clear timer immediately
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }

        // Calculate final duration
        const finalDuration = recordingStartTimeRef.current
          ? (Date.now() - recordingStartTimeRef.current) / 1000
          : recordingDuration;
        setRecordingDuration(finalDuration);
        recordingStartTimeRef.current = null;

        const blob = new Blob(chunksRef.current, { type: selectedMimeType });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl(url);
        setIsPreviewing(true);
        setIsRecording(false);

        // Build a representative waveform from captured snapshots
        // Each snapshot is a single amplitude value captured every 50ms
        if (waveformSnapshotsRef.current.length > 0) {
          const snapshots = [...waveformSnapshotsRef.current];
          // Resample to exactly 100 bars for display
          const targetBars = 100;
          const resampled = [];
          
          if (snapshots.length >= targetBars) {
            // Downsample: take max value from each chunk
            const chunkSize = snapshots.length / targetBars;
            for (let i = 0; i < targetBars; i++) {
              const start = Math.floor(i * chunkSize);
              const end = Math.floor((i + 1) * chunkSize);
              const chunk = snapshots.slice(start, end);
              resampled.push(Math.max(...chunk, 0.01));
            }
          } else {
            // Upsample: interpolate between points
            for (let i = 0; i < targetBars; i++) {
              const sourceIndex = (i / targetBars) * snapshots.length;
              const lower = Math.floor(sourceIndex);
              const upper = Math.min(lower + 1, snapshots.length - 1);
              const fraction = sourceIndex - lower;
              resampled.push(snapshots[lower] * (1 - fraction) + snapshots[upper] * fraction);
            }
          }
          
          // Normalize to 0-1 range
          const max = Math.max(...resampled, 0.01);
          const normalized = resampled.map(v => Math.max(0.1, v / max)); // Min 10% height for visibility
          setRecordedWaveform(normalized);
        }

        // Stop visualizer
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };

      mediaRecorder.onerror = (e) => {
        console.error('MediaRecorder error:', e);
        setError('Recording failed. Please try again.');
        setIsRecording(false);
      };

      mediaRecorderRef.current = mediaRecorder;
      // Use 1 second intervals for better audio chunk handling
      mediaRecorder.start(1000);
      setIsRecording(true);

      // Track recording start time
      recordingStartTimeRef.current = Date.now();
      waveformSnapshotsRef.current = [];

      // Start duration timer and capture waveform snapshots
      recordingTimerRef.current = setInterval(() => {
        if (!recordingStartTimeRef.current) return;
        
        const elapsed = (Date.now() - recordingStartTimeRef.current) / 1000;
        setRecordingDuration(elapsed);

        // Capture waveform snapshot - use ref to avoid stale closure
        const currentWaveform = currentWaveformRef.current;
        if (currentWaveform && currentWaveform.length > 0) {
          // Take the maximum value from current frame for peak detection
          const maxLevel = Math.max(...currentWaveform);
          waveformSnapshotsRef.current.push(maxLevel);

          // Keep up to 1000 samples for good resolution (50 seconds at 20 samples/sec)
          if (waveformSnapshotsRef.current.length > 1000) {
            waveformSnapshotsRef.current.shift();
          }
        }

        // Auto-stop at max duration
        if (elapsed >= maxDuration) {
          stopRecording();
        }
      }, 50);

    } catch (err) {
      console.error('Failed to start recording:', err);
      setError('Failed to start recording. Please try again.');
    }
  };

  const stopRecording = () => {
    // Clear timer first to stop duration updates
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    
    // Stop the media recorder (onstop will handle final state)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.error('Error stopping MediaRecorder:', e);
        setIsRecording(false);
      }
    } else {
      setIsRecording(false);
    }
  };

  const generateWaveform = async (audioUrl) => {
    try {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await context.decodeAudioData(arrayBuffer);

      const channelData = audioBuffer.getChannelData(0);
      const samples = 100;
      const blockSize = Math.floor(channelData.length / samples);
      const waveform = [];

      for (let i = 0; i < samples; i++) {
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(channelData[i * blockSize + j]);
        }
        waveform.push(sum / blockSize);
      }

      // Normalize
      const max = Math.max(...waveform);
      const normalized = waveform.map(v => v / max);
      setRecordedWaveform(normalized);

      context.close();
    } catch (err) {
      console.error('Failed to generate waveform:', err);
    }
  };

  const handleRecordButton = () => {
    if (isRecording) {
      stopRecording();
    } else if (isMicReady) {
      startRecording();
    }
  };

  const handleRetake = async () => {
    // Clear timer first
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    
    // Cleanup recorded data
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
    }
    setRecordedBlob(null);
    setRecordedUrl(null);
    setIsPreviewing(false);
    setIsPlaying(false);
    setRecordingDuration(0);
    setRecordedWaveform([]);
    setIsRecording(false);
    chunksRef.current = [];
    recordingStartTimeRef.current = null;
    waveformSnapshotsRef.current = [];
    mediaRecorderRef.current = null;

    // Small delay to ensure state is updated before re-initializing
    setTimeout(() => {
      initMicrophone();
    }, 200);
  };

  const handlePlayPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {
        setError('Could not play audio.');
      });
      setIsPlaying(true);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
  };

  const handleUseRecording = async () => {
    if (recordedBlob && recordedUrl) {
      // Create a File object from the blob for consistency with upload flow
      const file = new File([recordedBlob], `recording-${Date.now()}.webm`, {
        type: recordedBlob.type
      });

      // Store refs before clearing state (parent now owns these)
      const blobToPass = recordedBlob;
      const urlToPass = recordedUrl;
      const durationToPass = recordingDuration;

      // Save recording to IndexedDB for future reuse (don't await to not block UI)
      saveRecording('audio', blobToPass, durationToPass).catch((err) => {
        console.error('Failed to save audio recording to IndexedDB:', err);
      });

      // Clear local state so we don't revoke the URL when popup closes
      // Parent component is now responsible for managing this URL
      setRecordedUrl(null);
      setRecordedBlob(null);

      onRecordingComplete({
        file,
        blob: blobToPass,
        url: urlToPass,
        duration: durationToPass
      });
    }
  };

  const handleUseLastRecording = () => {
    if (lastRecording) {
      // Create file from stored blob
      const file = recordingToFile(lastRecording);
      const url = URL.createObjectURL(lastRecording.blob);

      onRecordingComplete({
        file,
        blob: lastRecording.blob,
        url,
        duration: lastRecording.duration
      });
    }
  };

  const handleClose = () => {
    cleanup();
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
    }
    onClose();
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!visible) return null;

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
      {/* Hidden audio element for playback */}
      {recordedUrl && (
        <audio
          ref={audioRef}
          src={recordedUrl}
          onEnded={handleAudioEnded}
          style={{ display: 'none' }}
        />
      )}

      {/* Popup Container */}
      <div
        style={{
          background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
          borderRadius: isMobile ? '16px' : '20px',
          padding: isMobile ? '20px' : '30px',
          maxWidth: isMobile ? '95vw' : '450px',
          width: '100%',
          position: 'relative',
          animation: 'slideUp 0.3s ease',
          boxShadow: `0 20px 60px ${accentColor}50`
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255, 255, 255, 0.2)',
            color: 'white',
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

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <span style={{ fontSize: '40px', display: 'block', marginBottom: '8px' }}>🎤</span>
          <h3 style={{
            margin: 0,
            fontFamily: '"Permanent Marker", cursive',
            fontSize: isMobile ? '20px' : '24px',
            color: 'white',
            letterSpacing: '1px'
          }}>
            {title}
          </h3>
        </div>

        {/* Device Selector - show when multiple devices available */}
        {audioDevices.length > 1 && !isPreviewing && (
          <div style={{
            marginBottom: '16px',
            padding: '8px 12px',
            background: 'rgba(255, 255, 255, 0.15)',
            borderRadius: '8px',
            maxWidth: '100%',
            overflow: 'hidden'
          }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: 'white',
              fontSize: '12px',
              maxWidth: '100%'
            }}>
              <span style={{ opacity: 0.8, flexShrink: 0 }}>🎙️</span>
              <select
                value={selectedDeviceId}
                onChange={(e) => handleDeviceChange(e.target.value)}
                disabled={isRecording}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'rgba(255, 255, 255, 0.9)',
                  color: '#333',
                  fontSize: '13px',
                  cursor: isRecording ? 'not-allowed' : 'pointer',
                  opacity: isRecording ? 0.6 : 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%'
                }}
              >
                {audioDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${audioDevices.indexOf(device) + 1}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* Waveform Visualization Area */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.25)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '20px'
        }}>
          {/* Live Waveform / Recorded Waveform */}
          <div style={{
            height: '100px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px',
            padding: '10px 0'
          }}>
            {!isPreviewing && waveformData.length > 0 && waveformData.map((value, index) => (
              <div
                key={index}
                style={{
                  width: `${100 / 50}%`,
                  height: `${Math.max(4, value * 80)}px`,
                  backgroundColor: isRecording ? 'white' : 'rgba(255, 255, 255, 0.5)',
                  borderRadius: '2px',
                  transition: 'height 0.05s ease'
                }}
              />
            ))}

            {isPreviewing && recordedWaveform.length > 0 && recordedWaveform.map((value, index) => (
              <div
                key={index}
                style={{
                  width: `${100 / recordedWaveform.length}%`,
                  height: `${Math.max(4, value * 80)}px`,
                  backgroundColor: 'white',
                  borderRadius: '2px'
                }}
              />
            ))}

            {/* Placeholder when no data */}
            {!isPreviewing && waveformData.length === 0 && !error && (
              <div style={{
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: '14px'
              }}>
                {isMicReady ? 'Ready to record...' : 'Initializing microphone...'}
              </div>
            )}

            {/* Error state */}
            {error && (
              <div style={{
                color: 'rgba(255, 255, 255, 0.9)',
                fontSize: '14px',
                textAlign: 'center'
              }}>
                {error}
              </div>
            )}
          </div>

          {/* Time display */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '12px',
            marginTop: '12px'
          }}>
            {isRecording && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <div style={{
                  width: '10px',
                  height: '10px',
                  backgroundColor: '#ef4444',
                  borderRadius: '50%',
                  animation: 'pulse 1s infinite'
                }} />
                <span style={{
                  color: 'white',
                  fontSize: '20px',
                  fontWeight: '700',
                  fontVariantNumeric: 'tabular-nums'
                }}>
                  {formatTime(recordingDuration)}
                </span>
              </div>
            )}

            {isPreviewing && (
              <span style={{
                color: 'white',
                fontSize: '16px',
                fontWeight: '600'
              }}>
                Duration: {formatTime(recordingDuration)}
              </span>
            )}

            {!isRecording && !isPreviewing && (
              <span style={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '14px'
              }}>
                Max: {formatTime(maxDuration)}
              </span>
            )}
          </div>

          {/* Countdown overlay - removed, direct recording now */}
          {false && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              borderRadius: isMobile ? '16px' : '20px',
              zIndex: 10
            }}>
              <span style={{
                fontSize: '80px',
                fontWeight: 'bold',
                color: 'white',
                textShadow: '0 0 40px rgba(255,255,255,0.5)',
                animation: 'countdownPulse 1s ease-out'
              }}>
                {countdown}
              </span>
            </div>
          )}
        </div>

        {/* Recording Progress Bar */}
        {isRecording && (
          <div style={{
            height: '4px',
            backgroundColor: 'rgba(0,0,0,0.2)',
            borderRadius: '2px',
            marginBottom: '20px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min((recordingDuration / maxDuration) * 100, 100)}%`,
              backgroundColor: 'white',
              transition: 'width 0.1s linear'
            }} />
          </div>
        )}

        {/* Use Previous Recording Option */}
        {!isPreviewing && !isRecording && lastRecording && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '10px 20px',
              marginBottom: '16px',
              background: 'rgba(255, 255, 255, 0.15)',
              borderRadius: '25px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onClick={handleUseLastRecording}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
            }}
          >
            <span style={{ fontSize: '20px' }}>🎵</span>
            <div style={{ color: 'white', fontSize: '13px' }}>
              <div style={{ fontWeight: '600' }}>Use Previous Recording</div>
              <div style={{ opacity: 0.8, fontSize: '11px' }}>{formatTime(lastRecording.duration)}</div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '16px'
        }}>
          {!isPreviewing ? (
            /* Record button */
            <button
              onClick={handleRecordButton}
              disabled={!isMicReady && !isRecording}
              style={{
                width: isMobile ? '72px' : '80px',
                height: isMobile ? '72px' : '80px',
                borderRadius: '50%',
                border: `4px solid ${isRecording ? '#ef4444' : 'white'}`,
                background: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
              }}
            >
              <div style={{
                width: isRecording ? '28px' : '36px',
                height: isRecording ? '28px' : '36px',
                backgroundColor: '#ef4444',
                borderRadius: isRecording ? '6px' : '50%',
                transition: 'all 0.2s ease'
              }} />
            </button>
          ) : (
            <>
              {/* Retake button */}
              <button
                onClick={handleRetake}
                style={{
                  padding: '12px 20px',
                  borderRadius: '25px',
                  border: '2px solid rgba(255, 255, 255, 0.5)',
                  background: 'transparent',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                🔄 Retake
              </button>

              {/* Play/Pause button */}
              <button
                onClick={handlePlayPause}
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  border: '2px solid white',
                  background: isPlaying ? 'white' : 'transparent',
                  color: isPlaying ? accentColor : 'white',
                  fontSize: '20px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease'
                }}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>

              {/* Use Recording button */}
              <button
                onClick={handleUseRecording}
                style={{
                  padding: '12px 24px',
                  borderRadius: '25px',
                  border: 'none',
                  background: 'white',
                  color: accentColor,
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(255, 255, 255, 0.3)',
                  transition: 'all 0.2s ease'
                }}
              >
                ✓ Use Audio
              </button>
            </>
          )}
        </div>

        {/* Help text */}
        <p style={{
          textAlign: 'center',
          color: 'rgba(255, 255, 255, 0.7)',
          fontSize: '12px',
          marginTop: '16px',
          marginBottom: 0
        }}>
          {!isPreviewing
            ? isRecording
              ? 'Tap to stop recording'
              : 'Tap the button to start recording'
            : 'Preview your recording before using it'}
        </p>
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
      `}</style>
    </div>,
    document.body
  );
};

AudioRecorderPopup.propTypes = {
  visible: PropTypes.bool.isRequired,
  onRecordingComplete: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  maxDuration: PropTypes.number,
  title: PropTypes.string,
  accentColor: PropTypes.string
};

export default AudioRecorderPopup;
