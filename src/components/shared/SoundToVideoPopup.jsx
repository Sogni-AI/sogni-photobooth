import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { getTokenLabel } from '../../services/walletService';
import AudioRecorderPopup from './AudioRecorderPopup';
import { saveRecording } from '../../utils/recordingsDB';
import VideoSettingsFooter from './VideoSettingsFooter';

// Sample audio tracks for S2V
const SAMPLE_AUDIO_TRACKS = [
  {
    id: 'grandpa-on-retro',
    title: 'Grandpa on Retro',
    emoji: '🎸',
    url: 'https://cdn.sogni.ai/audio-samples/grandpa-on-retro.m4a'
  },
  {
    id: 'hank-hill-hotdog',
    title: 'Hank Hill Hotdog',
    emoji: '🌭',
    url: 'https://cdn.sogni.ai/audio-samples/hank-hill-hotdog.m4a'
  },
  {
    id: 'ylvis-the-fox',
    title: 'Ylvis The Fox',
    emoji: '🦊',
    url: 'https://cdn.sogni.ai/audio-samples/ylvis-the-fox.m4a'
  },
  {
    id: 'look-at-that-cat',
    title: 'Look at That Cat',
    emoji: '🐱',
    url: 'https://cdn.sogni.ai/audio-samples/look-at-that-cat.m4a'
  },
  {
    id: 'im-a-snake',
    title: "I'm a Snake",
    emoji: '🐍',
    url: 'https://cdn.sogni.ai/audio-samples/im-a-snake.m4a'
  },
  {
    id: 'mii-theme-trap-remix',
    title: 'Mii Theme Trap Remix',
    emoji: '🎮',
    url: 'https://cdn.sogni.ai/audio-samples/mii-theme-trap-remix.m4a'
  },
  {
    id: 'have-you-ever-had-a-dream',
    title: 'Have You Ever Had a Dream',
    emoji: '💭',
    url: 'https://cdn.sogni.ai/audio-samples/have-you-ever-had-a-dream.m4a'
  },
  {
    id: 'louis-theroux-jiggle-giggle',
    title: 'Louis Theroux Jiggle Giggle',
    emoji: '🕺',
    url: 'https://cdn.sogni.ai/audio-samples/louis-theroux-jiggle-giggle.m4a'
  },
  {
    id: 'jet-2-holiday-jingle',
    title: 'Jet 2 Holiday Jingle',
    emoji: '✈️',
    url: 'https://cdn.sogni.ai/audio-samples/jet-2-holiday-jingle.m4a'
  },
  {
    id: 'beez-in-the-trap',
    title: 'Beez in the Trap',
    emoji: '🐝',
    url: 'https://cdn.sogni.ai/audio-samples/beez-in-the-trap.m4a'
  },
  {
    id: '6-feet',
    title: '6 Feet',
    emoji: '🎵',
    url: 'https://cdn.sogni.ai/audio-samples/6-feet.m4a'
  },
  {
    id: '8-ball',
    title: '8 Ball',
    emoji: '🎱',
    url: 'https://cdn.sogni.ai/audio-samples/8-ball.m4a'
  },
  {
    id: 'fast-as-f',
    title: 'Fast as F',
    emoji: '⚡',
    url: 'https://cdn.sogni.ai/audio-samples/fast-as-f.m4a'
  },
  {
    id: 'hoist-the-colors',
    title: 'Hoist the Colors',
    emoji: '🏴‍☠️',
    url: 'https://cdn.sogni.ai/audio-samples/hoist-the-colors.m4a'
  },
  {
    id: 'hurricane-katrina',
    title: 'Hurricane Katrina',
    emoji: '🌀',
    url: 'https://cdn.sogni.ai/audio-samples/hurrican-katrina.m4a'
  },
  {
    id: 'kitty-bed',
    title: 'Kitty Bed',
    emoji: '🐱',
    url: 'https://cdn.sogni.ai/audio-samples/kitty-bed.m4a'
  },
  {
    id: 'listen-to-me-now',
    title: 'Listen to Me Now',
    emoji: '👂',
    url: 'https://cdn.sogni.ai/audio-samples/listen-to-me-now.m4a'
  },
  {
    id: 'n-95',
    title: 'N-95',
    emoji: '😷',
    url: 'https://cdn.sogni.ai/audio-samples/n-95.m4a'
  },
  {
    id: 'noone-is-going-to-know',
    title: 'No One is Going to Know',
    emoji: '🤫',
    url: 'https://cdn.sogni.ai/audio-samples/noone-is-going-to-know.m4a'
  },
  {
    id: 'o-fortuna',
    title: 'O Fortuna',
    emoji: '🎭',
    url: 'https://cdn.sogni.ai/audio-samples/o-fortuna.m4a'
  },
  {
    id: 'peter-axel-f',
    title: 'Peter Axel F',
    emoji: '🎹',
    url: 'https://cdn.sogni.ai/audio-samples/peter-axel-f.m4a'
  },
  {
    id: 'priceless',
    title: 'Priceless',
    emoji: '💎',
    url: 'https://cdn.sogni.ai/audio-samples/priceless.m4a'
  },
  {
    id: 'runnin-through-the-6',
    title: 'Runnin Through the 6',
    emoji: '🏃',
    url: 'https://cdn.sogni.ai/audio-samples/runnin-through-the-6.m4a'
  },
  {
    id: 'runnin-up-that-hill',
    title: 'Runnin Up That Hill',
    emoji: '⛰️',
    url: 'https://cdn.sogni.ai/audio-samples/runnin-up-that-hill.m4a'
  },
  {
    id: 'spider-man-2099',
    title: 'Spider-Man 2099',
    emoji: '🕷️',
    url: 'https://cdn.sogni.ai/audio-samples/spider-man-2099.m4a'
  },
  {
    id: 'surround-sound',
    title: 'Surround Sound',
    emoji: '🔊',
    url: 'https://cdn.sogni.ai/audio-samples/surrond-sound.m4a'
  }
];

const BASE_MAX_DURATION = 20; // Max 20 seconds per image

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
  const [positivePrompt, setPositivePrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [sourceType, setSourceType] = useState('sample'); // 'sample', 'upload', or 'record'
  const [selectedSample, setSelectedSample] = useState(null);
  const [uploadedAudio, setUploadedAudio] = useState(null);
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState(null);
  const [recordedAudio, setRecordedAudio] = useState(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState(null);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState('');

  // Audio waveform and timeline state
  const [audioStartOffset, setAudioStartOffset] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioWaveform, setAudioWaveform] = useState(null);
  const [previewPlayhead, setPreviewPlayhead] = useState(0);
  const [isDraggingWaveform, setIsDraggingWaveform] = useState(false);
  const [dragType, setDragType] = useState(null); // 'start', 'end', 'move'
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartOffset, setDragStartOffset] = useState(0);
  const [dragStartDuration, setDragStartDuration] = useState(0);
  const [hasMovedDuringDrag, setHasMovedDuringDrag] = useState(false);
  const [pendingStartOffset, setPendingStartOffset] = useState(null);
  const [pendingDuration, setPendingDuration] = useState(null);

  // Montage mode - splits the audio segment across all images (checked by default)
  const [montageEnabled, setMontageEnabled] = useState(true);

  // Compute montage mode constraints
  const effectiveItemCount = (isBatch && itemCount > 1) ? itemCount : 1;
  const isMontageMode = montageEnabled && isBatch && itemCount > 1;

  // In montage mode: max = 20s * itemCount, min = 1s * itemCount, step = 0.25s * itemCount
  // In normal mode: max = 20s, min = 0.25s, step = 0.25s
  const MAX_DURATION = isMontageMode ? BASE_MAX_DURATION * effectiveItemCount : BASE_MAX_DURATION;
  const MIN_DURATION = isMontageMode ? 1 * effectiveItemCount : 0.25;
  const DURATION_STEP = isMontageMode ? 0.25 * effectiveItemCount : 0.25;

  // Check if audio is long enough for montage mode (need at least 1s per image)
  const canUseMontageMode = audioDuration >= effectiveItemCount;

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

  // Reset montage mode when popup opens or batch settings change
  useEffect(() => {
    if (visible) {
      setMontageEnabled(true); // Always default to checked
    }
  }, [visible, isBatch, itemCount]);

  // Adjust duration when montage mode changes or constraints change
  useEffect(() => {
    if (visible && audioDuration > 0) {
      // If montage mode enabled but audio too short, disable it
      if (isMontageMode && !canUseMontageMode) {
        setMontageEnabled(false);
      }

      // Clamp duration to new constraints
      const effectiveMax = Math.min(audioDuration - audioStartOffset, MAX_DURATION);
      let newDuration = videoDuration;

      // Clamp to min/max
      if (newDuration > effectiveMax) {
        newDuration = effectiveMax;
      } else if (newDuration < MIN_DURATION) {
        newDuration = MIN_DURATION;
      }

      // Round to step increments
      newDuration = Math.round(newDuration / DURATION_STEP) * DURATION_STEP;

      if (newDuration !== videoDuration) {
        setVideoDuration(newDuration);
      }
    }
  }, [isMontageMode, audioDuration, MIN_DURATION, MAX_DURATION, DURATION_STEP, canUseMontageMode, audioStartOffset, visible]);

  const audioInputRef = useRef(null);
  const audioPreviewRef = useRef(null);
  const waveformCanvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const playbackAnimationRef = useRef(null);
  const audioStartOffsetRef = useRef(0); // Track current offset for animation frame access
  const videoDurationRef = useRef(0); // Track current video duration for animation frame access
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
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
      }
      if (playbackAnimationRef.current) {
        cancelAnimationFrame(playbackAnimationRef.current);
      }
    };
  }, [uploadedAudioUrl, recordedAudioUrl]);

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

      // Set default duration to min of audio duration and base max (20s)
      // WAN 2.2: Round down to nearest 0.25s to ensure clean frame count (16fps base)
      // (montage mode constraints will be applied via useEffect if needed)
      const defaultDuration = Math.min(audioBuffer.duration, BASE_MAX_DURATION);
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

    // Use visual values for real-time dragging
    const displayStartOffset = pendingStartOffset !== null ? pendingStartOffset : audioStartOffset;
    const displayDuration = pendingDuration !== null ? pendingDuration : videoDuration;

    ctx.clearRect(0, 0, width, height);

    // Draw waveform bars
    audioWaveform.forEach((value, i) => {
      const barHeight = value * (height - 4);
      const x = i * barWidth;
      const y = (height - barHeight) / 2;

      const barTime = (i / audioWaveform.length) * audioDuration;
      const isInSelection = barTime >= displayStartOffset && barTime < displayStartOffset + displayDuration;

      // White for selected, muted for non-selected
      ctx.fillStyle = isInSelection ? '#ffffff' : 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
    });

    // Draw selection border
    if (audioDuration > 0) {
      const startX = (displayStartOffset / audioDuration) * width;
      const endOffset = Math.min(displayStartOffset + displayDuration, audioDuration);
      const selectionWidth = ((endOffset - displayStartOffset) / audioDuration) * width;

      ctx.strokeStyle = 'rgba(236, 72, 153, 0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(startX + 1, 1, selectionWidth - 2, height - 2);
    }

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
  }, [audioWaveform, audioStartOffset, audioDuration, videoDuration, isPlaying, previewPlayhead, pendingStartOffset, pendingDuration]);

  // Update waveform when data changes
  useEffect(() => {
    if (visible && audioWaveform) {
      const frame = requestAnimationFrame(() => {
        drawWaveform();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [drawWaveform, visible, audioWaveform, audioStartOffset, isPlaying, previewPlayhead, videoDuration, pendingStartOffset, pendingDuration]);

  // Keep refs in sync for animation frame access (prevents stale closure when values change)
  useEffect(() => {
    audioStartOffsetRef.current = audioStartOffset;
  }, [audioStartOffset]);

  useEffect(() => {
    videoDurationRef.current = videoDuration;
  }, [videoDuration]);

  // Helper to get mouse/touch X coordinate
  const getClientX = (e) => {
    return e.touches ? e.touches[0].clientX : e.clientX;
  };

  // Handle waveform interaction (similar to video timeline)
  const handleWaveformMouseDown = useCallback((e, overrideDragType = null) => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || audioDuration === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = getClientX(e) - rect.left;
    const clickPosition = Math.max(0, Math.min(1, x / rect.width));
    const clickTime = clickPosition * audioDuration;

    // Calculate handle zones (10px on each side)
    const handleZone = 10 / rect.width * audioDuration;
    const selectionStart = audioStartOffset;
    const selectionEnd = audioStartOffset + videoDuration;

    let detectedDragType = overrideDragType;
    if (!overrideDragType) {
      // Detect which area was clicked
      if (Math.abs(clickTime - selectionStart) < handleZone) {
        detectedDragType = 'start';
      } else if (Math.abs(clickTime - selectionEnd) < handleZone) {
        detectedDragType = 'end';
      } else if (clickTime >= selectionStart && clickTime <= selectionEnd) {
        detectedDragType = 'move';
      } else {
        // Clicked outside - jump to that position
        const maxOffset = Math.max(0, audioDuration - videoDuration);
        const newOffset = Math.max(0, Math.min(clickTime, maxOffset));
        setAudioStartOffset(newOffset);

        // Update playhead immediately
        setPreviewPlayhead(newOffset);

        // If playing, restart at new position
        if (isPlaying && audioPreviewRef.current) {
          audioPreviewRef.current.currentTime = newOffset;
        }
        return;
      }
    }

    setIsDraggingWaveform(true);
    setDragType(detectedDragType);
    setDragStartX(x);
    setDragStartOffset(audioStartOffset);
    setDragStartDuration(videoDuration);
    setHasMovedDuringDrag(false);
    setPendingStartOffset(audioStartOffset);
    setPendingDuration(videoDuration);

    e.preventDefault();
    e.stopPropagation();
  }, [audioDuration, audioStartOffset, videoDuration, isPlaying]);

  const handleWaveformMouseMove = useCallback((e) => {
    if (!isDraggingWaveform || !dragType) return;

    const canvas = waveformCanvasRef.current;
    if (!canvas || audioDuration === 0) return;

    // Prevent scrolling during drag on touch devices
    if (e.cancelable) {
      e.preventDefault();
    }

    const rect = canvas.getBoundingClientRect();
    const x = getClientX(e) - rect.left;
    const deltaX = x - dragStartX;

    // Mark that user has moved during this drag
    if (Math.abs(deltaX) > 3) {
      setHasMovedDuringDrag(true);
    }

    const deltaTime = (deltaX / rect.width) * audioDuration;

    let newStartOffset = dragStartOffset;
    let newDuration = dragStartDuration;

    if (dragType === 'start') {
      // Adjust start (resize from left)
      const newStart = Math.max(0, Math.min(dragStartOffset + deltaTime, dragStartOffset + dragStartDuration - MIN_DURATION));
      const newDuration = dragStartOffset + dragStartDuration - newStart;
      // Round to step increments (0.25s in normal mode, 0.25*itemCount in montage mode)
      const roundedDuration = Math.round(newDuration / DURATION_STEP) * DURATION_STEP;
      const clampedDuration = Math.min(Math.max(roundedDuration, MIN_DURATION), MAX_DURATION);
      const adjustedStart = dragStartOffset + dragStartDuration - clampedDuration;
      setPendingStartOffset(Math.max(0, adjustedStart));
      setPendingDuration(clampedDuration);
      return;
    } else if (dragType === 'end') {
      // Adjust end (duration)
      const newDuration = Math.max(MIN_DURATION, Math.min(dragStartDuration + deltaTime, audioDuration - dragStartOffset, MAX_DURATION));
      // Round to step increments (0.25s in normal mode, 0.25*itemCount in montage mode)
      const roundedDuration = Math.round(newDuration / DURATION_STEP) * DURATION_STEP;
      setPendingDuration(Math.max(MIN_DURATION, roundedDuration));
      return;
    } else if (dragType === 'move') {
      // Move selection
      const maxOffset = Math.max(0, audioDuration - dragStartDuration);
      newStartOffset = Math.max(0, Math.min(dragStartOffset + deltaTime, maxOffset));
    }

    setPendingStartOffset(newStartOffset);
    setPendingDuration(dragStartDuration);
  }, [isDraggingWaveform, dragType, dragStartX, dragStartOffset, dragStartDuration, audioDuration, MIN_DURATION, MAX_DURATION, DURATION_STEP]);

  const handleWaveformMouseUp = useCallback((e) => {
    if (!isDraggingWaveform) return;

    const wasClick = !hasMovedDuringDrag;

    // Get final values before clearing pending
    const finalStart = pendingStartOffset !== null ? pendingStartOffset : audioStartOffset;
    const rawDuration = pendingDuration !== null ? pendingDuration : videoDuration;

    // WAN 2.2: Round duration to step increments to ensure clean frame count (16fps base)
    const finalDuration = Math.round(rawDuration / DURATION_STEP) * DURATION_STEP;

    // Commit changes
    setAudioStartOffset(finalStart);
    setVideoDuration(finalDuration);

    setIsDraggingWaveform(false);
    setDragType(null);
    setHasMovedDuringDrag(false);

    // Handle click (seek to position)
    if (wasClick && audioDuration > 0 && dragType === 'move') {
      const canvas = waveformCanvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const x = getClientX(e) - rect.left;
        const clickPosition = Math.max(0, Math.min(1, x / rect.width));
        const clickTime = clickPosition * audioDuration;

        // Update playhead visual immediately
        setPreviewPlayhead(clickTime);

        // Seek audio to clicked position
        if (audioPreviewRef.current) {
          audioPreviewRef.current.currentTime = clickTime;
        }
      }
    } else if (hasMovedDuringDrag && isPlaying && audioPreviewRef.current) {
      // If dragged while playing, restart at new position
      audioPreviewRef.current.pause();
      audioPreviewRef.current.currentTime = finalStart;
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
          if (audioPreviewRef.current.currentTime >= finalStart + finalDuration) {
            audioPreviewRef.current.currentTime = finalStart;
            audioPreviewRef.current.play().catch(() => setIsPlaying(false));
          }
          playbackAnimationRef.current = requestAnimationFrame(updatePlayhead);
        }
      };
      playbackAnimationRef.current = requestAnimationFrame(updatePlayhead);
    }

    // Clear pending values AFTER committing
    setPendingStartOffset(null);
    setPendingDuration(null);
  }, [isDraggingWaveform, hasMovedDuringDrag, isPlaying, audioStartOffset, videoDuration, audioDuration, pendingStartOffset, pendingDuration, dragType, DURATION_STEP]);

  // Global mouse/touch up listener for drag
  useEffect(() => {
    if (isDraggingWaveform) {
      window.addEventListener('mouseup', handleWaveformMouseUp);
      window.addEventListener('mousemove', handleWaveformMouseMove);
      window.addEventListener('touchend', handleWaveformMouseUp);
      window.addEventListener('touchmove', handleWaveformMouseMove, { passive: false });
      return () => {
        window.removeEventListener('mouseup', handleWaveformMouseUp);
        window.removeEventListener('mousemove', handleWaveformMouseMove);
        window.removeEventListener('touchend', handleWaveformMouseUp);
        window.removeEventListener('touchmove', handleWaveformMouseMove);
      };
    }
  }, [isDraggingWaveform, handleWaveformMouseUp, handleWaveformMouseMove]);

  const handleAudioUpload = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/m4a', 'audio/mp4', 'audio/wav', 'audio/x-m4a'];
      if (!validTypes.some(type => file.type.includes(type.split('/')[1]))) {
        setError('oops! we need an mp3, m4a, or wav file for this :)');
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        setError('whoa! that file is huge 😅 keep it under 50mb plz');
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

  // Handle audio recording complete
  const handleRecordingComplete = async ({ file, url }) => {
    setShowAudioRecorder(false);
    setRecordedAudio(file);
    setSourceType('record');
    setSelectedSample(null);
    setUploadedAudio(null);
    if (uploadedAudioUrl) {
      URL.revokeObjectURL(uploadedAudioUrl);
      setUploadedAudioUrl(null);
    }
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
    }
    setRecordedAudioUrl(url);
    setError('');
    setIsPlaying(false);
    setAudioStartOffset(0);

    // Generate waveform for timeline
    await generateWaveform(url);
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
        setError('hmm, couldn\'t play that preview 🤔 try another file?');
      });
      setIsPlaying(true);

      // Start playhead animation
      const updatePlayhead = () => {
        if (audioPreviewRef.current && !audioPreviewRef.current.paused) {
          setPreviewPlayhead(audioPreviewRef.current.currentTime);
          // Loop back to start when reaching end of selection
          // Use refs to read current values (prevents stale closure when duration changes)
          const currentOffset = audioStartOffsetRef.current;
          const currentDuration = videoDurationRef.current;
          if (audioPreviewRef.current.currentTime >= currentOffset + currentDuration) {
            audioPreviewRef.current.currentTime = currentOffset;
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
      setError('pick a track or upload ur own! ✨');
      return;
    }
    if (sourceType === 'upload' && !uploadedAudio) {
      setError('need an audio file first! 🎵');
      return;
    }
    if (sourceType === 'record' && !recordedAudio) {
      setError('please record some audio first! 🎤');
      return;
    }

    setError('');

    let audioData = null;
    let audioUrl = null;

    if (sourceType === 'upload' && uploadedAudio) {
      const arrayBuffer = await uploadedAudio.arrayBuffer();
      audioData = new Uint8Array(arrayBuffer);
      // Create a persistent blob URL for regeneration
      // This is separate from uploadedAudioUrl (used for preview) and won't be revoked when popup closes
      audioUrl = URL.createObjectURL(uploadedAudio);
    } else if (sourceType === 'record' && recordedAudio) {
      const arrayBuffer = await recordedAudio.arrayBuffer();
      audioData = new Uint8Array(arrayBuffer);
      // Create a persistent blob URL for regeneration
      audioUrl = URL.createObjectURL(recordedAudio);
      // Also save to IndexedDB for retry capability (in background)
      const blob = new Blob([arrayBuffer], { type: recordedAudio.type || 'audio/webm' });
      saveRecording('audio', blob, audioDuration).catch((err) => {
        console.error('Failed to save audio recording for retry:', err);
      });
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
      modelVariant, // Pass the selected model variant
      splitMode: isMontageMode, // Whether to split the audio across batch images
      perImageDuration: isMontageMode ? videoDuration / effectiveItemCount : videoDuration
    });
  };

  const handleClose = () => {
    setSourceType('sample');
    setSelectedSample(null);
    setUploadedAudio(null);
    setRecordedAudio(null);
    if (uploadedAudioUrl) {
      URL.revokeObjectURL(uploadedAudioUrl);
      setUploadedAudioUrl(null);
    }
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
      setRecordedAudioUrl(null);
    }
    setShowAudioRecorder(false);
    setIsPlaying(false);
    setError('');
    setAudioWaveform(null);
    setAudioDuration(0);
    setAudioStartOffset(0);
    setVideoDuration(5);
    onClose();
  };

  if (!visible) return null;

  const hasValidSource = (sourceType === 'sample' && selectedSample) || (sourceType === 'upload' && uploadedAudio) || (sourceType === 'record' && recordedAudio);
  const previewAudioUrl = sourceType === 'record'
    ? recordedAudioUrl
    : sourceType === 'upload'
      ? uploadedAudioUrl
      : selectedSample?.url;
  // WAN 2.2: Round max duration down to nearest 0.25s to ensure clean frame count (16fps base)
  const maxDuration = audioDuration > 0 ? Math.floor(Math.min(audioDuration, MAX_DURATION) * 4) / 4 : MAX_DURATION;
  
  // Get visual values (pending during drag, actual otherwise)
  const visualStartOffset = pendingStartOffset !== null ? pendingStartOffset : audioStartOffset;
  const visualDuration = pendingDuration !== null ? pendingDuration : videoDuration;

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
          background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
          borderRadius: isMobile ? '16px' : '20px',
          padding: isMobile ? '20px' : '30px',
          maxWidth: isMobile ? '550px' : '750px',
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

        {/* Source Audio Tabs */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '12px',
          padding: isMobile ? '12px' : '16px',
          marginBottom: '16px'
        }}>
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
              { id: 'sample', label: '🎵 Samples', hasContent: !!selectedSample },
              { id: 'record', label: '🎤 Record', hasContent: !!recordedAudio },
              { id: 'upload', label: '📁 Upload', hasContent: !!uploadedAudio }
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
                    : tab.hasContent 
                      ? 'rgba(255, 255, 255, 0.12)'
                      : 'transparent',
                  color: sourceType === tab.id ? '#db2777' : 'white',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
              >
                {tab.label}
                {tab.hasContent && sourceType !== tab.id && (
                  <span style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    width: '6px',
                    height: '6px',
                    background: '#4caf50',
                    borderRadius: '50%',
                    boxShadow: '0 0 4px rgba(76, 175, 80, 0.6)'
                  }} />
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div style={{ minHeight: '60px' }}>
            {/* Samples Tab */}
            {sourceType === 'sample' && (
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
                  borderRadius: '8px',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  outline: 'none',
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 16px center',
                  paddingRight: '44px'
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
            )}

            {/* Record Tab */}
            {sourceType === 'record' && (
              <div style={{ textAlign: 'center' }}>
                {recordedAudio ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '16px',
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.08) 100%)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '12px',
                      flex: 1,
                      minWidth: 0
                    }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: 'rgba(255, 255, 255, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                        flexShrink: 0
                      }}>
                        ✅
                      </div>
                      <div style={{ 
                        textAlign: 'left',
                        flex: 1,
                        minWidth: 0
                      }}>
                        <div style={{ 
                          color: 'white', 
                          fontSize: '14px', 
                          fontWeight: '600',
                          marginBottom: '2px'
                        }}>
                          Audio Recorded
                        </div>
                        <div style={{
                          color: 'rgba(255, 255, 255, 0.85)',
                          fontSize: '12px',
                          fontWeight: '500'
                        }}>
                          {formatTime(audioDuration)}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowAudioRecorder(true)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.4)',
                        background: 'rgba(255, 255, 255, 0.15)',
                        color: 'white',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        flexShrink: 0
                      }}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAudioRecorder(true)}
                    style={{
                      width: '100%',
                      padding: '24px 16px',
                      borderRadius: '12px',
                      border: '2px dashed rgba(255, 255, 255, 0.3)',
                      background: 'linear-gradient(135deg, rgba(219, 39, 119, 0.08) 0%, rgba(219, 39, 119, 0.15) 100%)',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '600',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '12px',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(219, 39, 119, 0.15) 0%, rgba(219, 39, 119, 0.22) 100%)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(219, 39, 119, 0.08) 0%, rgba(219, 39, 119, 0.15) 100%)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                    }}
                  >
                    <div style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.1) 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '28px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                    }}>
                      🎤
                    </div>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}>
                      <span style={{ fontSize: '15px', fontWeight: '700' }}>
                        Record Your Audio
                      </span>
                      <span style={{ 
                        fontSize: '12px', 
                        opacity: 0.75,
                        fontWeight: '400'
                      }}>
                        Tap to start recording with your microphone
                      </span>
                    </div>
                  </button>
                )}
              </div>
            )}

            {/* Upload Tab */}
            {sourceType === 'upload' && (
              <div style={{ textAlign: 'center' }}>
                <input
                  type="file"
                  ref={audioInputRef}
                  accept="audio/*,.mp3,.m4a,.wav"
                  onChange={handleAudioUpload}
                  style={{ display: 'none' }}
                />
                {uploadedAudio ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    padding: '8px',
                    background: 'rgba(76, 175, 80, 0.2)',
                    borderRadius: '8px'
                  }}>
                    <span style={{ fontSize: '20px' }}>📁</span>
                    <span style={{ 
                      color: 'white', 
                      fontSize: '13px', 
                      fontWeight: '500',
                      maxWidth: '150px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {uploadedAudio.name}
                    </span>
                    <button
                      onClick={() => audioInputRef.current?.click()}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.3)',
                        background: 'transparent',
                        color: 'white',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => audioInputRef.current?.click()}
                    style={{
                      width: '100%',
                      padding: '16px',
                      borderRadius: '8px',
                      border: '2px dashed rgba(255, 255, 255, 0.4)',
                      background: 'rgba(255, 255, 255, 0.1)',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '600',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    📁 Tap to Upload Audio
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

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
                  overflow: 'visible',
                  cursor: isDraggingWaveform ? 'grabbing' : 'pointer',
                  userSelect: 'none',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
                onMouseDown={handleWaveformMouseDown}
                onTouchStart={handleWaveformMouseDown}
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
                {/* Left resize handle overlay */}
                <div
                  style={{
                    position: 'absolute',
                    top: '0',
                    bottom: '0',
                    left: `calc(${(visualStartOffset / audioDuration) * 100}% - 6px)`,
                    width: '12px',
                    cursor: 'ew-resize',
                    zIndex: 5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onMouseDown={(e) => { e.stopPropagation(); handleWaveformMouseDown(e, 'start'); }}
                  onTouchStart={(e) => { e.stopPropagation(); handleWaveformMouseDown(e, 'start'); }}
                >
                  <div style={{
                    width: '4px',
                    height: '28px',
                    backgroundColor: '#ec4899',
                    borderRadius: '2px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.5)'
                  }} />
                </div>
                {/* Right resize handle overlay */}
                <div
                  style={{
                    position: 'absolute',
                    top: '0',
                    bottom: '0',
                    left: `calc(${((visualStartOffset + visualDuration) / audioDuration) * 100}% - 6px)`,
                    width: '12px',
                    cursor: 'ew-resize',
                    zIndex: 5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onMouseDown={(e) => { e.stopPropagation(); handleWaveformMouseDown(e, 'end'); }}
                  onTouchStart={(e) => { e.stopPropagation(); handleWaveformMouseDown(e, 'end'); }}
                >
                  <div style={{
                    width: '4px',
                    height: '28px',
                    backgroundColor: '#ec4899',
                    borderRadius: '2px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.5)'
                  }} />
                </div>
                {/* Duration label overlay */}
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: `${((visualStartOffset + visualDuration / 2) / audioDuration) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  fontSize: '11px',
                  fontWeight: '700',
                  color: 'white',
                  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                  pointerEvents: 'none',
                  zIndex: 3
                }}>
                  {visualDuration.toFixed(2)}s
                </div>
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
                  Start: {formatTime(visualStartOffset)} • Duration: {visualDuration.toFixed(2)}s
                </span>
                <span>{formatTime(audioDuration)}</span>
              </div>

              <p style={{
                margin: '6px 0 0 0',
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: '10px',
                textAlign: 'center'
              }}>
                Click to seek • Drag handles to resize • Drag pink area to move
              </p>

              {/* Montage Mode Checkbox - only in batch mode */}
              {isBatch && itemCount > 1 && (
                <div style={{
                  marginTop: '12px',
                  padding: '10px 12px',
                  background: isMontageMode ? 'rgba(236, 72, 153, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  border: isMontageMode ? '1px solid rgba(236, 72, 153, 0.4)' : '1px solid rgba(255, 255, 255, 0.2)'
                }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    cursor: canUseMontageMode ? 'pointer' : 'not-allowed',
                    opacity: canUseMontageMode ? 1 : 0.6
                  }}>
                    <input
                      type="checkbox"
                      checked={montageEnabled && canUseMontageMode}
                      onChange={(e) => canUseMontageMode && setMontageEnabled(e.target.checked)}
                      disabled={!canUseMontageMode}
                      style={{
                        width: '18px',
                        height: '18px',
                        marginTop: '2px',
                        accentColor: '#ec4899',
                        cursor: canUseMontageMode ? 'pointer' : 'not-allowed'
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
                      {canUseMontageMode ? (
                        <p style={{
                          margin: '4px 0 0 0',
                          color: 'rgba(255, 255, 255, 0.7)',
                          fontSize: '10px',
                          lineHeight: '1.4'
                        }}>
                          {isMontageMode
                            ? `Each image will get ${(videoDuration / itemCount).toFixed(2)}s of audio, creating a single montage video.`
                            : 'Each image will get the full audio segment to generate seprate full videos each.'}
                        </p>
                      ) : (
                        <p style={{
                          margin: '4px 0 0 0',
                          color: 'rgba(239, 68, 68, 0.9)',
                          fontSize: '10px',
                          lineHeight: '1.4'
                        }}>
                          ⚠️ Audio is too short. Need at least {itemCount}s for {itemCount} images.
                        </p>
                      )}
                    </div>
                  </label>
                </div>
              )}
            </div>
          )}

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
              ⚡ Fast (~{isMontageMode ? Math.ceil((videoDuration / itemCount) * 0.25) : Math.ceil(videoDuration * 0.25)}-{isMontageMode ? Math.ceil((videoDuration / itemCount) * 0.33) : Math.ceil(videoDuration * 0.33)} min)
            </option>
            <option value="quality" style={{ background: '#1a1a1a', color: 'white' }}>
              💎 Best Quality (~{isMontageMode ? Math.ceil((videoDuration / itemCount) * 1.3) : Math.ceil(videoDuration * 1.3)}-{isMontageMode ? Math.ceil((videoDuration / itemCount) * 1.67) : Math.ceil(videoDuration * 1.67)} min)
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

        {/* Video Settings Footer */}
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.15)'
        }}>
          <VideoSettingsFooter
            videoCount={isBatch ? itemCount : 1}
            cost={isMontageMode ? costRaw / effectiveItemCount : costRaw}
            costUSD={isMontageMode ? costUSD / effectiveItemCount : costUSD}
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

      {/* Audio Recorder Popup */}
      <AudioRecorderPopup
        visible={showAudioRecorder}
        onRecordingComplete={handleRecordingComplete}
        onClose={() => setShowAudioRecorder(false)}
        maxDuration={60}
        title="Record Audio"
        accentColor="#ec4899"
      />
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
