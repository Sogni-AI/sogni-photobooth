import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { getTokenLabel } from '../../services/walletService';

// Sample audio tracks for S2V
const SAMPLE_AUDIO_TRACKS = [
  {
    id: '6-feet',
    title: '6 Feet',
    emoji: '🎵',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/audio-samples/6-feet.m4a'
  },
  {
    id: '8-ball',
    title: '8 Ball',
    emoji: '🎱',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/audio-samples/8-ball.m4a'
  },
  {
    id: 'fast-as-f',
    title: 'Fast as F',
    emoji: '⚡',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/audio-samples/fast-as-f.m4a'
  },
  {
    id: 'hoist-the-colors',
    title: 'Hoist the Colors',
    emoji: '🏴‍☠️',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/audio-samples/hoist-the-colors.m4a'
  },
  {
    id: 'hurricane-katrina',
    title: 'Hurricane Katrina',
    emoji: '🌀',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/audio-samples/hurrican-katrina.m4a'
  },
  {
    id: 'kitty-bed',
    title: 'Kitty Bed',
    emoji: '🐱',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/audio-samples/kitty-bed.m4a'
  },
  {
    id: 'listen-to-me-now',
    title: 'Listen to Me Now',
    emoji: '👂',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/audio-samples/listen-to-me-now.m4a'
  },
  {
    id: 'n-95',
    title: 'N-95',
    emoji: '😷',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/audio-samples/n-95.m4a'
  },
  {
    id: 'noone-is-going-to-know',
    title: 'No One is Going to Know',
    emoji: '🤫',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/audio-samples/noone-is-going-to-know.m4a'
  },
  {
    id: 'o-fortuna',
    title: 'O Fortuna',
    emoji: '🎭',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/audio-samples/o-fortuna.m4a'
  },
  {
    id: 'peter-axel-f',
    title: 'Peter Axel F',
    emoji: '🎹',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/audio-samples/peter-axel-f.m4a'
  },
  {
    id: 'priceless',
    title: 'Priceless',
    emoji: '💎',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/audio-samples/priceless.m4a'
  },
  {
    id: 'runnin-through-the-6',
    title: 'Runnin Through the 6',
    emoji: '🏃',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/audio-samples/runnin-through-the-6.m4a'
  },
  {
    id: 'runnin-up-that-hill',
    title: 'Runnin Up That Hill',
    emoji: '⛰️',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/audio-samples/runnin-up-that-hill.m4a'
  },
  {
    id: 'spider-man-2099',
    title: 'Spider-Man 2099',
    emoji: '🕷️',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/audio-samples/spider-man-2099.m4a'
  },
  {
    id: 'surround-sound',
    title: 'Surround Sound',
    emoji: '🔊',
    url: 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/audio-samples/surrond-sound.m4a'
  }
];

const MAX_DURATION = 20; // Max 20 seconds

/**
 * SoundToVideoPopup
 * Popup for Sound-to-Video (S2V) generation - creates lip-synced videos from audio
 */
const SoundToVideoPopup = ({
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
  const [positivePrompt, setPositivePrompt] = useState('A person speaking naturally with synchronized lip movements to the audio');
  const [negativePrompt, setNegativePrompt] = useState('blurry, low quality, static, deformed, overexposed, worst quality, JPEG compression, out of sync');
  const [sourceType, setSourceType] = useState('sample'); // 'sample' or 'upload'
  const [selectedSample, setSelectedSample] = useState(null);
  const [uploadedAudio, setUploadedAudio] = useState(null);
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState('');
  
  // Use external model variant state if provided (for cost estimation), otherwise use internal
  const modelVariant = externalModelVariant !== undefined ? externalModelVariant : 'speed';
  const setModelVariant = onModelVariantChange || (() => {});

  // Duration and waveform state - use external if provided for cost estimation
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
  const [audioStartOffset, setAudioStartOffset] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioWaveform, setAudioWaveform] = useState(null);
  const [previewPlayhead, setPreviewPlayhead] = useState(0);
  const [isDraggingWaveform, setIsDraggingWaveform] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartOffset, setDragStartOffset] = useState(0);

  const audioInputRef = useRef(null);
  const audioPreviewRef = useRef(null);
  const waveformCanvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const playbackAnimationRef = useRef(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 768;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (uploadedAudioUrl) {
        URL.revokeObjectURL(uploadedAudioUrl);
      }
      if (playbackAnimationRef.current) {
        cancelAnimationFrame(playbackAnimationRef.current);
      }
    };
  }, [uploadedAudioUrl]);

  // Reset state when popup opens
  useEffect(() => {
    if (visible) {
      setError('');
      setIsPlaying(false);
    } else {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
        audioPreviewRef.current.currentTime = 0;
      }
      setIsPlaying(false);
      if (playbackAnimationRef.current) {
        cancelAnimationFrame(playbackAnimationRef.current);
      }
    }
  }, [visible]);

  // Generate waveform from audio file
  const generateWaveform = useCallback(async (audioUrl) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }

      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);

      const channelData = audioBuffer.getChannelData(0);
      const samples = 200;
      const blockSize = Math.floor(channelData.length / samples);
      const waveformData = [];

      for (let i = 0; i < samples; i++) {
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(channelData[i * blockSize + j]);
        }
        waveformData.push(sum / blockSize);
      }

      // Normalize
      const max = Math.max(...waveformData);
      const normalized = waveformData.map(v => v / max);

      setAudioWaveform(normalized);
      setAudioDuration(audioBuffer.duration);

      // Set default duration to min of audio duration and MAX_DURATION
      // Round down to nearest 0.25s to ensure frame count is divisible at 16fps
      const defaultDuration = Math.min(audioBuffer.duration, MAX_DURATION);
      const roundedDuration = Math.floor(defaultDuration * 4) / 4;
      setVideoDuration(roundedDuration);
    } catch (err) {
      console.error('Failed to generate waveform:', err);
      // Set a placeholder waveform
      const samples = 200;
      const placeholder = Array(samples).fill(0).map((_, i) => 0.3 + Math.sin(i * 0.1) * 0.2 + Math.random() * 0.2);
      setAudioWaveform(placeholder);
    }
  }, []);

  // Draw waveform on canvas
  const drawWaveform = useCallback(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !audioWaveform) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const barWidth = width / audioWaveform.length;

    ctx.clearRect(0, 0, width, height);

    // Draw selection range indicator
    if (audioDuration > 0) {
      const startX = (audioStartOffset / audioDuration) * width;
      const endOffset = Math.min(audioStartOffset + videoDuration, audioDuration);
      const selectionWidth = ((endOffset - audioStartOffset) / audioDuration) * width;

      ctx.fillStyle = 'rgba(236, 72, 153, 0.25)';
      ctx.fillRect(startX, 0, selectionWidth, height);

      ctx.strokeStyle = 'rgba(236, 72, 153, 0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(startX, 0, selectionWidth, height);
    }

    // Draw waveform bars
    audioWaveform.forEach((value, i) => {
      const barHeight = value * (height - 4);
      const x = i * barWidth;
      const y = (height - barHeight) / 2;

      const barTime = (i / audioWaveform.length) * audioDuration;
      const isInSelection = barTime >= audioStartOffset && barTime < audioStartOffset + videoDuration;

      ctx.fillStyle = isInSelection ? '#db2777' : 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
    });

    // Draw playhead if playing
    if (isPlaying && audioPreviewRef.current) {
      const playheadX = (previewPlayhead / audioDuration) * width;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }

    // Draw start position marker
    const startMarkerX = (audioStartOffset / audioDuration) * width;
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(startMarkerX, 0);
    ctx.lineTo(startMarkerX, height);
    ctx.stroke();

    // Draw marker handle
    ctx.fillStyle = '#ec4899';
    ctx.beginPath();
    ctx.moveTo(startMarkerX - 6, 0);
    ctx.lineTo(startMarkerX + 6, 0);
    ctx.lineTo(startMarkerX, 10);
    ctx.closePath();
    ctx.fill();
  }, [audioWaveform, audioStartOffset, audioDuration, videoDuration, isPlaying, previewPlayhead]);

  // Update waveform when data changes
  useEffect(() => {
    if (visible && audioWaveform) {
      const frame = requestAnimationFrame(() => {
        drawWaveform();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [drawWaveform, visible, audioWaveform, audioStartOffset, isPlaying, previewPlayhead, videoDuration]);

  // Handle waveform interaction
  const handleWaveformMouseDown = useCallback((e) => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || audioDuration === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickPosition = x / rect.width;
    const clickTime = clickPosition * audioDuration;

    const selectionEnd = audioStartOffset + videoDuration;
    const isInsideSelection = clickTime >= audioStartOffset && clickTime <= selectionEnd;

    if (isInsideSelection) {
      setIsDraggingWaveform(true);
      setDragStartX(x);
      setDragStartOffset(audioStartOffset);
    } else {
      const maxOffset = Math.max(0, audioDuration - videoDuration);
      const newOffset = Math.max(0, Math.min(clickTime, maxOffset));
      setAudioStartOffset(newOffset);
      
      // If audio was playing, restart at new position
      if (isPlaying && audioPreviewRef.current) {
        audioPreviewRef.current.pause();
        audioPreviewRef.current.currentTime = newOffset;
        audioPreviewRef.current.play().catch(() => {
          setIsPlaying(false);
          setError('Unable to play audio preview');
        });
        
        // Restart playhead animation
        if (playbackAnimationRef.current) {
          cancelAnimationFrame(playbackAnimationRef.current);
        }
        const updatePlayhead = () => {
          if (audioPreviewRef.current && !audioPreviewRef.current.paused) {
            setPreviewPlayhead(audioPreviewRef.current.currentTime);
            // Loop back to start when reaching end of selection
            if (audioPreviewRef.current.currentTime >= newOffset + videoDuration) {
              audioPreviewRef.current.currentTime = newOffset;
              audioPreviewRef.current.play().catch(() => setIsPlaying(false));
            }
            playbackAnimationRef.current = requestAnimationFrame(updatePlayhead);
          }
        };
        playbackAnimationRef.current = requestAnimationFrame(updatePlayhead);
      }
    }

    e.preventDefault();
  }, [audioDuration, audioStartOffset, videoDuration, isPlaying]);

  const handleWaveformMouseMove = useCallback((e) => {
    if (!isDraggingWaveform) return;

    const canvas = waveformCanvasRef.current;
    if (!canvas || audioDuration === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const deltaX = x - dragStartX;
    const deltaTime = (deltaX / rect.width) * audioDuration;

    const maxOffset = Math.max(0, audioDuration - videoDuration);
    const newOffset = Math.max(0, Math.min(dragStartOffset + deltaTime, maxOffset));

    setAudioStartOffset(newOffset);
  }, [isDraggingWaveform, dragStartX, dragStartOffset, audioDuration, videoDuration]);

  const handleWaveformMouseUp = useCallback(() => {
    setIsDraggingWaveform(false);
    
    // If audio was playing when user interacted, restart playback at new position
    if (isPlaying && audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      audioPreviewRef.current.currentTime = audioStartOffset;
      audioPreviewRef.current.play().catch(() => {
        setIsPlaying(false);
        setError('Unable to play audio preview');
      });
      
      // Restart playhead animation
      if (playbackAnimationRef.current) {
        cancelAnimationFrame(playbackAnimationRef.current);
      }
      const updatePlayhead = () => {
        if (audioPreviewRef.current && !audioPreviewRef.current.paused) {
          setPreviewPlayhead(audioPreviewRef.current.currentTime);
          // Stop at end of selection and loop
          if (audioPreviewRef.current.currentTime >= audioStartOffset + videoDuration) {
            audioPreviewRef.current.currentTime = audioStartOffset;
            audioPreviewRef.current.play().catch(() => setIsPlaying(false));
          }
          playbackAnimationRef.current = requestAnimationFrame(updatePlayhead);
        }
      };
      playbackAnimationRef.current = requestAnimationFrame(updatePlayhead);
    }
  }, [isPlaying, audioStartOffset, videoDuration]);

  // Global mouse up listener for drag
  useEffect(() => {
    if (isDraggingWaveform) {
      window.addEventListener('mouseup', handleWaveformMouseUp);
      window.addEventListener('mousemove', handleWaveformMouseMove);
      return () => {
        window.removeEventListener('mouseup', handleWaveformMouseUp);
        window.removeEventListener('mousemove', handleWaveformMouseMove);
      };
    }
  }, [isDraggingWaveform, handleWaveformMouseUp, handleWaveformMouseMove]);

  const handleAudioUpload = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/m4a', 'audio/mp4', 'audio/wav', 'audio/x-m4a'];
      if (!validTypes.some(type => file.type.includes(type.split('/')[1]))) {
        setError('Please upload a valid audio file (MP3, M4A, WAV)');
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        setError('Audio file must be less than 50MB');
        return;
      }

      setUploadedAudio(file);
      setSourceType('upload');
      setSelectedSample(null);
      setError('');
      setIsPlaying(false);
      setAudioStartOffset(0);

      if (uploadedAudioUrl) {
        URL.revokeObjectURL(uploadedAudioUrl);
      }
      const newUrl = URL.createObjectURL(file);
      setUploadedAudioUrl(newUrl);

      // Generate waveform
      await generateWaveform(newUrl);
    }
  };

  const handleSampleSelect = async (sample) => {
    setSelectedSample(sample);
    setSourceType('sample');
    setUploadedAudio(null);
    if (uploadedAudioUrl) {
      URL.revokeObjectURL(uploadedAudioUrl);
      setUploadedAudioUrl(null);
    }
    setError('');
    setIsPlaying(false);
    setAudioStartOffset(0);

    // Generate waveform for sample
    await generateWaveform(sample.url);
  };

  const toggleAudioPreview = () => {
    const audio = audioPreviewRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      if (playbackAnimationRef.current) {
        cancelAnimationFrame(playbackAnimationRef.current);
      }
    } else {
      audio.currentTime = audioStartOffset;
      audio.play().catch(() => {
        setError('Unable to play audio preview');
      });
      setIsPlaying(true);

      // Start playhead animation
      const updatePlayhead = () => {
        if (audioPreviewRef.current && !audioPreviewRef.current.paused) {
          setPreviewPlayhead(audioPreviewRef.current.currentTime);
          // Loop back to start when reaching end of selection
          if (audioPreviewRef.current.currentTime >= audioStartOffset + videoDuration) {
            audioPreviewRef.current.currentTime = audioStartOffset;
            audioPreviewRef.current.play().catch(() => setIsPlaying(false));
          }
          playbackAnimationRef.current = requestAnimationFrame(updatePlayhead);
        }
      };
      playbackAnimationRef.current = requestAnimationFrame(updatePlayhead);
    }
  };

  const formatCost = (tokenCost, usdCost) => {
    if (!tokenCost || !usdCost) return null;
    const formattedTokenCost = typeof tokenCost === 'number' ? tokenCost.toFixed(2) : parseFloat(tokenCost).toFixed(2);
    return `${formattedTokenCost} (≈ $${usdCost.toFixed(2)} USD)`;
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleConfirm = async () => {
    if (sourceType === 'sample' && !selectedSample) {
      setError('Please select an audio track or upload your own');
      return;
    }
    if (sourceType === 'upload' && !uploadedAudio) {
      setError('Please upload an audio file');
      return;
    }

    setError('');

    let audioData = null;
    let audioUrl = null;

    if (sourceType === 'upload' && uploadedAudio) {
      const arrayBuffer = await uploadedAudio.arrayBuffer();
      audioData = new Uint8Array(arrayBuffer);
    } else if (sourceType === 'sample' && selectedSample) {
      audioUrl = selectedSample.url;
    }

    onConfirm({
      positivePrompt: positivePrompt.trim(),
      negativePrompt: negativePrompt.trim(),
      audioData,
      audioUrl,
      audioStartOffset,
      videoDuration,
      workflowType: 's2v',
      modelVariant // Pass the selected model variant
    });
  };

  const handleClose = () => {
    setPositivePrompt('A person speaking naturally with synchronized lip movements to the audio');
    setNegativePrompt('blurry, low quality, static, deformed, overexposed, worst quality, JPEG compression, out of sync');
    setSourceType('sample');
    setSelectedSample(null);
    setUploadedAudio(null);
    if (uploadedAudioUrl) {
      URL.revokeObjectURL(uploadedAudioUrl);
      setUploadedAudioUrl(null);
    }
    setIsPlaying(false);
    setError('');
    setAudioWaveform(null);
    setAudioDuration(0);
    setAudioStartOffset(0);
    setVideoDuration(5);
    onClose();
  };

  if (!visible) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const hasValidSource = (sourceType === 'sample' && selectedSample) || (sourceType === 'upload' && uploadedAudio);
  const previewAudioUrl = sourceType === 'upload' ? uploadedAudioUrl : selectedSample?.url;
  // Round max duration down to nearest 0.25s to ensure frame count is divisible at 16fps
  const maxDuration = audioDuration > 0 ? Math.floor(Math.min(audioDuration, MAX_DURATION) * 4) / 4 : MAX_DURATION;

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
      onClick={handleBackdropClick}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
          borderRadius: isMobile ? '16px' : '20px',
          padding: isMobile ? '20px' : '30px',
          maxWidth: '550px',
          width: '100%',
          maxHeight: isMobile ? '95vh' : '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(236, 72, 153, 0.5)',
          animation: 'slideUp 0.3s ease',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hidden audio element for preview */}
        {previewAudioUrl && (
          <audio
            ref={audioPreviewRef}
            src={previewAudioUrl}
            onEnded={() => setIsPlaying(false)}
            style={{ display: 'none' }}
          />
        )}

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
            <span style={{ fontSize: isMobile ? '32px' : '40px' }}>🎤</span>
            <h2 style={{
              margin: 0,
              color: 'white',
              fontSize: isMobile ? '22px' : '28px',
              fontWeight: '700',
              fontFamily: '"Permanent Marker", cursive'
            }}>
              Sound to Video{isBatch ? ' (Batch)' : ''}
            </h2>
          </div>
          <p style={{
            margin: 0,
            color: 'rgba(255, 255, 255, 0.85)',
            fontSize: isMobile ? '12px' : '14px'
          }}>
            Generate lip-synced video from audio
          </p>
        </div>

        {/* Source Audio Section */}
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
            🎵 Source Audio
          </label>

          {/* Sample Audio Dropdown */}
          <select
            value={selectedSample?.id || ''}
            onChange={(e) => {
              const sample = SAMPLE_AUDIO_TRACKS.find(s => s.id === e.target.value);
              if (sample) {
                handleSampleSelect(sample);
              }
            }}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '10px',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              background: 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              marginBottom: '12px',
              transition: 'all 0.2s ease',
              outline: 'none',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 16px center',
              paddingRight: '44px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }}
          >
            <option value="" disabled style={{ background: '#1a1a1a', color: 'white' }}>
              Select a sample audio track...
            </option>
            {SAMPLE_AUDIO_TRACKS.map((sample) => (
              <option 
                key={sample.id} 
                value={sample.id}
                style={{ background: '#1a1a1a', color: 'white', padding: '8px' }}
              >
                {sample.emoji} {sample.title}
              </option>
            ))}
          </select>

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
            ref={audioInputRef}
            accept="audio/*,.mp3,.m4a,.wav"
            style={{ display: 'none' }}
            onChange={handleAudioUpload}
          />
          <button
            onClick={() => audioInputRef.current?.click()}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: uploadedAudio
                ? '2px solid rgba(76, 175, 80, 0.8)'
                : '2px dashed rgba(255, 255, 255, 0.4)',
              background: uploadedAudio
                ? 'rgba(76, 175, 80, 0.3)'
                : 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              transition: 'all 0.2s ease'
            }}
          >
            {uploadedAudio ? `✅ ${uploadedAudio.name}` : '📁 Upload Audio (MP3, M4A, WAV)'}
          </button>

          {/* Waveform Visualization */}
          {hasValidSource && audioWaveform && (
            <div style={{ marginTop: '14px' }}>
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
                  Select Audio Segment
                </label>
                <button
                  onClick={toggleAudioPreview}
                  style={{
                    padding: '6px 14px',
                    backgroundColor: isPlaying ? '#ef4444' : 'rgba(255, 255, 255, 0.9)',
                    border: 'none',
                    borderRadius: '6px',
                    color: isPlaying ? 'white' : '#db2777',
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

              {/* Canvas for waveform */}
              <div
                style={{
                  position: 'relative',
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  cursor: isDraggingWaveform ? 'grabbing' : 'crosshair',
                  userSelect: 'none',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
                onMouseDown={handleWaveformMouseDown}
              >
                <canvas
                  ref={waveformCanvasRef}
                  width={352}
                  height={60}
                  style={{
                    display: 'block',
                    width: '100%',
                    height: '60px',
                    pointerEvents: 'none'
                  }}
                />
              </div>

              {/* Time indicators */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '6px',
                fontSize: '10px',
                color: 'rgba(255, 255, 255, 0.8)',
                fontWeight: '500'
              }}>
                <span>0:00</span>
                <span style={{ color: '#fff', fontWeight: '700' }}>
                  Start: {formatTime(audioStartOffset)} • Duration: {sliderDuration}s
                </span>
                <span>{formatTime(audioDuration)}</span>
              </div>

              <p style={{
                margin: '6px 0 0 0',
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: '10px',
                textAlign: 'center'
              }}>
                Click to set start • Drag pink area to move selection
              </p>
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
              ⏱️ Video Duration
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
              setSliderDuration(newDuration); // Only update local slider value
              setInternalVideoDuration(newDuration); // Update internal for display
              // Adjust start offset if needed
              if (audioDuration > 0 && audioStartOffset + newDuration > audioDuration) {
                setAudioStartOffset(Math.max(0, audioDuration - newDuration));
              }
            }}
            onMouseUp={(e) => {
              const newDuration = parseFloat(e.target.value);
              commitDuration(newDuration); // Commit to parent on release
            }}
            onTouchEnd={(e) => {
              const newDuration = parseFloat(e.target.value);
              commitDuration(newDuration); // Commit to parent on release
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
            ✨ Description (Optional)
          </label>
          <textarea
            value={positivePrompt}
            onChange={(e) => setPositivePrompt(e.target.value)}
            placeholder="Describe how the video should look..."
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

        {/* Model Variant Selector */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: '13px',
            fontWeight: '600',
            marginBottom: '6px'
          }}>
            ⚙️ Model Version
          </label>
          <select
            value={modelVariant}
            onChange={(e) => setModelVariant(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '2px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              outline: 'none',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              paddingRight: '36px'
            }}
          >
            <option value="speed" style={{ background: '#1a1a1a', color: 'white' }}>
              ⚡ Fast (~3-5 min)
            </option>
            <option value="quality" style={{ background: '#1a1a1a', color: 'white' }}>
              💎 Best Quality (~20-25 min)
            </option>
          </select>
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
                : '#db2777',
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
                ? `🎤 Generate ${itemCount} Videos`
                : '🎤 Generate Sound to Video'
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
        /* Custom scrollbar for audio sample grid */
        div::-webkit-scrollbar {
          width: 8px;
        }
        div::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }
        div::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 4px;
        }
        div::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }
      `}</style>
    </div>,
    document.body
  );
};

SoundToVideoPopup.propTypes = {
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

export default SoundToVideoPopup;
