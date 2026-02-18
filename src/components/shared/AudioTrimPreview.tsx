/**
 * AudioTrimPreview
 *
 * Waveform trim component for selecting a start offset within an audio track.
 * Adapted from the PhotoGallery batch-transition music modal waveform pattern:
 * - Duration detected via <audio> element metadata (no CORS needed)
 * - Pseudo-random deterministic waveform seeded from URL (CORS workaround for CDN presets/AI tracks)
 * - Canvas-based rendering with selection highlight, playhead, click-to-jump, drag-to-move
 * - Play/pause preview with requestAnimationFrame loop
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generatePlaceholderWaveform } from '../../utils/audioWaveform';

interface AudioTrimPreviewProps {
  audioUrl: string;
  startOffset: number;
  duration: number;
  onOffsetChange: (offset: number) => void;
  accentColor?: string;
  height?: number;
}

const SNAP_STEP = 0.25; // snap to 0.25s increments

const AudioTrimPreview: React.FC<AudioTrimPreviewProps> = ({
  audioUrl,
  startOffset,
  duration,
  onOffsetChange,
  accentColor = '#FDFF00',
  height = 60
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const animFrameRef = useRef<number | null>(null);

  const waveform = useMemo(() => generatePlaceholderWaveform(audioUrl), [audioUrl]);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartOffsetRef = useRef(0);

  // Refs for animation loop (avoid stale closures)
  const startOffsetRef = useRef(startOffset);
  startOffsetRef.current = startOffset;
  const durationRef = useRef(duration);
  durationRef.current = duration;

  // Load audio duration via <audio> element and generate waveform
  // Following the PhotoGallery pattern: use Audio element for duration (no CORS needed for metadata),
  // then generate a pseudo-random waveform seeded from the URL (CORS workaround)
  useEffect(() => {
    if (!audioUrl) return;

    let cancelled = false;

    // Get duration via Audio element (works without CORS for metadata)
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';

    const handleMetadata = () => {
      if (cancelled) return;
      setAudioDuration(audio.duration);
    };

    const handleError = () => {
      if (cancelled) return;
      // Duration detection failed - still show waveform with 0 duration
      // Selection range just won't be drawn
    };

    audio.addEventListener('loadedmetadata', handleMetadata);
    audio.addEventListener('error', handleError);
    audio.src = audioUrl;

    // Set up audio preview element
    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.crossOrigin = 'anonymous';
    }

    return () => {
      cancelled = true;
      audio.removeEventListener('loadedmetadata', handleMetadata);
      audio.removeEventListener('error', handleError);
      audio.src = '';
    };
  }, [audioUrl]);

  // Draw waveform on canvas
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveform) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use logical (CSS) dimensions for drawing, canvas is scaled by devicePixelRatio
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const barWidth = w / waveform.length;

    // Scale context for HiDPI
    ctx.save();
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Calculate selection range
    const selectionEnd = Math.min(startOffset + duration, audioDuration || duration);

    // Draw selection background
    if (audioDuration > 0) {
      const startX = (startOffset / audioDuration) * w;
      const selectionWidth = ((selectionEnd - startOffset) / audioDuration) * w;
      ctx.fillStyle = `${accentColor}15`;
      ctx.fillRect(startX, 0, selectionWidth, h);
    }

    // Draw bars
    waveform.forEach((value, i) => {
      const barHeight = value * (h - 4);
      const x = i * barWidth;
      const y = (h - barHeight) / 2;

      if (audioDuration > 0) {
        const barTime = (i / waveform.length) * audioDuration;
        const isInSelection = barTime >= startOffset && barTime < selectionEnd;
        ctx.fillStyle = isInSelection ? '#ffffff' : 'rgba(255, 255, 255, 0.25)';
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      }

      ctx.fillRect(x + 1, y, Math.max(barWidth - 2, 1), barHeight);
    });

    // Draw selection border
    if (audioDuration > 0) {
      const startX = (startOffset / audioDuration) * w;
      const selectionWidth = ((selectionEnd - startOffset) / audioDuration) * w;
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(startX + 1, 1, selectionWidth - 2, h - 2);
    }

    // Draw playhead
    if (isPlaying && audioDuration > 0) {
      const playheadX = (playhead / audioDuration) * w;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();
    }

    // Draw start position marker triangle
    if (audioDuration > 0) {
      const markerX = (startOffset / audioDuration) * w;
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.moveTo(markerX - 4, 0);
      ctx.lineTo(markerX + 4, 0);
      ctx.lineTo(markerX, 6);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }, [waveform, audioDuration, startOffset, duration, accentColor, isPlaying, playhead]);

  // Redraw on state changes
  useEffect(() => {
    const frame = requestAnimationFrame(() => drawWaveform());
    return () => cancelAnimationFrame(frame);
  }, [drawWaveform]);

  // Resize canvas to container (HiDPI aware)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      drawWaveform();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [drawWaveform]);

  // Mouse/touch helpers
  const getClientX = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): number => {
    if ('touches' in e) {
      return e.touches[0]?.clientX ?? (e as TouchEvent).changedTouches?.[0]?.clientX ?? 0;
    }
    return (e as MouseEvent).clientX;
  };

  // Click-to-jump: clicking on the waveform jumps the selection start to that position
  const handleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || audioDuration === 0 || isDragging) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickTime = (x / rect.width) * audioDuration;

    // Center the selection on the click point
    const maxOffset = Math.max(0, audioDuration - duration);
    let newOffset = clickTime - duration / 2;
    newOffset = Math.max(0, Math.min(newOffset, maxOffset));
    newOffset = Math.round(newOffset / SNAP_STEP) * SNAP_STEP;

    onOffsetChange(newOffset);
  }, [audioDuration, duration, isDragging, onOffsetChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || audioDuration === 0) return;

    const x = getClientX(e);
    setIsDragging(true);
    dragStartXRef.current = x;
    dragStartOffsetRef.current = startOffset;

    e.preventDefault();
    e.stopPropagation();
  }, [audioDuration, startOffset]);

  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;

    const canvas = canvasRef.current;
    if (!canvas || audioDuration === 0) return;

    if (e.cancelable) e.preventDefault();

    const x = getClientX(e);
    const rect = canvas.getBoundingClientRect();
    const deltaX = x - dragStartXRef.current;
    const deltaTime = (deltaX / rect.width) * audioDuration;

    const maxOffset = Math.max(0, audioDuration - duration);
    let newOffset = dragStartOffsetRef.current + deltaTime;
    newOffset = Math.max(0, Math.min(newOffset, maxOffset));
    newOffset = Math.round(newOffset / SNAP_STEP) * SNAP_STEP;

    onOffsetChange(newOffset);
  }, [isDragging, audioDuration, duration, onOffsetChange]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    // If playing, restart at new position
    if (isPlaying && audioRef.current) {
      audioRef.current.currentTime = startOffsetRef.current;
    }
  }, [isDragging, isPlaying]);

  // Global mouse/touch listeners during drag
  useEffect(() => {
    if (!isDragging) return;

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleMouseMove, { passive: false });
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Play/pause toggle
  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    } else {
      audio.currentTime = startOffset;
      audio.play().catch(() => setIsPlaying(false));
      setIsPlaying(true);

      const updatePlayhead = () => {
        if (audio && !audio.paused) {
          setPlayhead(audio.currentTime);
          // Loop at end of selection
          if (audio.currentTime >= startOffsetRef.current + durationRef.current) {
            audio.currentTime = startOffsetRef.current;
            audio.play().catch(() => setIsPlaying(false));
          }
          animFrameRef.current = requestAnimationFrame(updatePlayhead);
        }
      };
      animFrameRef.current = requestAnimationFrame(updatePlayhead);
    }
  }, [isPlaying, audioUrl, startOffset]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Stop playback when audioUrl changes
  useEffect(() => {
    setIsPlaying(false);
    setPlayhead(0);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, [audioUrl]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {/* Play/pause button */}
      <button
        onClick={togglePlayback}
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          border: 'none',
          background: isPlaying ? accentColor : 'rgba(255,255,255,0.1)',
          color: isPlaying ? '#000' : '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          flexShrink: 0,
          transition: 'all 0.15s ease'
        }}
      >
        {isPlaying ? '\u23F8' : '\u25B6'}
      </button>

      {/* Waveform canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        onClick={handleClick}
        style={{
          flex: 1,
          height: `${height}px`,
          cursor: isDragging ? 'grabbing' : 'grab',
          borderRadius: '6px',
          background: 'rgba(0,0,0,0.3)'
        }}
      />

      {/* Hidden audio element */}
      <audio ref={audioRef} crossOrigin="anonymous" />
    </div>
  );
};

export default AudioTrimPreview;
