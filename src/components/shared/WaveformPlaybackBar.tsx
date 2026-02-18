/**
 * WaveformPlaybackBar
 *
 * Canvas-based waveform that visualizes playback progress with click-to-seek.
 * Simpler than AudioTrimPreview — only handles playback + seek, no trim/selection.
 * Uses the same HiDPI canvas pattern and pseudo-random waveform generation.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { generatePlaceholderWaveform, WAVEFORM_SAMPLES } from '../../utils/audioWaveform';

interface WaveformPlaybackBarProps {
  audioUrl: string;
  audioRef: React.RefObject<HTMLAudioElement>;
  isPlaying: boolean;
  duration: number;
  accentColor?: string;
  height?: number;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const WaveformPlaybackBar: React.FC<WaveformPlaybackBarProps> = ({
  audioUrl,
  audioRef,
  isPlaying,
  duration,
  accentColor = '#ec4899',
  height = 40
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const currentTimeRef = useRef(0);

  const waveform = useMemo(() => generatePlaceholderWaveform(audioUrl, WAVEFORM_SAMPLES), [audioUrl]);

  const updateTimeDisplay = useCallback(() => {
    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = `${formatTime(currentTimeRef.current)} / ${formatTime(duration)}`;
    }
  }, [duration]);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveform) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const barWidth = w / waveform.length;
    const progress = duration > 0 ? currentTimeRef.current / duration : 0;

    ctx.save();
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Draw bars — played portion in white, remaining dim
    waveform.forEach((value, i) => {
      const barHeight = value * (h - 4);
      const x = i * barWidth;
      const y = (h - barHeight) / 2;
      const barProgress = i / waveform.length;

      ctx.fillStyle = barProgress <= progress
        ? 'rgba(255, 255, 255, 0.9)'
        : 'rgba(255, 255, 255, 0.2)';

      ctx.fillRect(x + 1, y, Math.max(barWidth - 2, 1), barHeight);
    });

    // Playhead line
    if (duration > 0) {
      const playheadX = progress * w;
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();
    }

    ctx.restore();
  }, [waveform, duration, accentColor]);

  // Animation loop — reads currentTime from the audio element
  useEffect(() => {
    if (!isPlaying) return;

    const animate = () => {
      if (audioRef.current) {
        currentTimeRef.current = audioRef.current.currentTime;
      }
      drawWaveform();
      updateTimeDisplay();
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
    // audioRef is a stable ref prop — safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, drawWaveform, updateTimeDisplay]);

  // Redraw when paused (to show frozen playhead position)
  useEffect(() => {
    if (isPlaying) return;
    if (audioRef.current) {
      currentTimeRef.current = audioRef.current.currentTime;
    }
    drawWaveform();
    updateTimeDisplay();
    // audioRef is a stable ref prop — safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, drawWaveform, updateTimeDisplay]);

  // Resize canvas for HiDPI
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

  // Click-to-seek
  const handleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || duration <= 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickProgress = x / rect.width;
    const seekTime = Math.max(0, Math.min(clickProgress * duration, duration));

    audio.currentTime = seekTime;
    currentTimeRef.current = seekTime;
    drawWaveform();
    updateTimeDisplay();
    // audioRef is a stable ref prop — safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, drawWaveform, updateTimeDisplay]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '4px 12px 8px',
    }}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{
          flex: 1,
          height: `${height}px`,
          cursor: 'pointer',
          borderRadius: '4px',
          background: 'rgba(0, 0, 0, 0.2)'
        }}
      />
      <span
        ref={timeDisplayRef}
        style={{
          color: 'rgba(255, 255, 255, 0.6)',
          fontSize: '10px',
          fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
          minWidth: '70px',
          textAlign: 'right'
        }}
      >
        {formatTime(0)} / {formatTime(duration)}
      </span>
    </div>
  );
};

export default WaveformPlaybackBar;
