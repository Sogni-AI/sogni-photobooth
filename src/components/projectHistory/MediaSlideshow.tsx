import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { SogniClient } from '@sogni-ai/sogni-client';
import type { ArchiveProject, ArchiveJob } from '../../types/projectHistory';
import { useMediaUrl } from '../../hooks/useMediaUrl';
import './MediaSlideshow.css';

interface SlideshowContentProps {
  job: ArchiveJob;
  sogniClient: SogniClient;
  active: boolean;
  modelName: string;
}

function SlideshowContent({ job, sogniClient, active, modelName }: SlideshowContentProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [hasAudio, setHasAudio] = useState(false);
  
  const { url, loading, error } = useMediaUrl({
    projectId: job.projectId,
    jobId: job.id,
    type: job.type,
    sogniClient,
    enabled: true
  });

  // Detect if video should have audio based on model name or actual audio tracks
  useEffect(() => {
    if (job.type !== 'video') return;

    // Check model name for workflows that have audio
    const modelLower = modelName?.toLowerCase() || '';
    const shouldHaveAudio = modelLower.includes('s2v') ||
      modelLower.includes('animate-move') ||
      modelLower.includes('animate-replace');

    if (shouldHaveAudio) {
      setHasAudio(true);
      return;
    }

    // Fallback: check video element for audio tracks (for other video types)
    const video = videoRef.current;
    if (!video || !url) return;

    const checkAudio = () => {
      const videoAny = video as any;
      const hasAudioTrack = videoAny.mozHasAudio ||
        Boolean(videoAny.webkitAudioDecodedByteCount) ||
        Boolean(videoAny.audioTracks && videoAny.audioTracks.length > 0);
      setHasAudio(hasAudioTrack);
    };

    video.addEventListener('loadedmetadata', checkAudio);
    if (video.readyState >= 1) {
      checkAudio();
    }

    return () => {
      video.removeEventListener('loadedmetadata', checkAudio);
    };
  }, [url, job.type, modelName]);

  // Autoplay video when active and URL is ready
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url || job.type !== 'video') return;

    if (active) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [active, url, job.type]);

  // Sync playing state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, []);

  // Toggle video play/pause
  const handleVideoToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(() => {});
    }
  }, [isPlaying]);

  // Toggle mute/unmute
  const handleMuteToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    const newMutedState = !isMuted;
    video.muted = newMutedState;
    setIsMuted(newMutedState);
  }, [isMuted]);

  if (loading) {
    return (
      <div className="slideshow-loading">
        <div className="slideshow-spinner" />
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className="slideshow-error">
        <span>⚠️</span>
        <span>{error || 'Media not available'}</span>
      </div>
    );
  }

  if (job.type === 'video') {
    return (
      <div className="slideshow-video-wrapper">
        <video
          ref={videoRef}
          src={url}
          loop
          playsInline
          muted
          preload="auto"
        />
        <button
          className="slideshow-video-btn"
          onClick={handleVideoToggle}
          title={isPlaying ? 'Pause video' : 'Play video'}
        >
          <svg viewBox="0 0 24 24">
            {isPlaying ? (
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            ) : (
              <path d="M8 5v14l11-7z"/>
            )}
          </svg>
        </button>
        {hasAudio && (
          <button
            className="slideshow-mute-btn"
            onClick={handleMuteToggle}
            title={isMuted ? 'Unmute video' : 'Mute video'}
          >
            <svg viewBox="0 0 24 24">
              {isMuted ? (
                // Muted icon (speaker with X)
                <>
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                </>
              ) : (
                // Unmuted icon (speaker with sound waves)
                <>
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </>
              )}
            </svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <img
      className="slideshow-media"
      src={url}
      alt={`Job ${job.id}`}
    />
  );
}

interface DownloadButtonProps {
  job: ArchiveJob;
  sogniClient: SogniClient;
}

function DownloadButton({ job, sogniClient }: DownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const { url } = useMediaUrl({
    projectId: job.projectId,
    jobId: job.id,
    type: job.type,
    sogniClient,
    enabled: true
  });

  const handleDownload = useCallback(async () => {
    if (!url || downloading) return;

    setDownloading(true);
    try {
      const response = await fetch(url);
      const blob = await response.blob();

      const extension = job.type === 'video' ? 'mp4' : 'png';
      const filename = `sogni-${job.id}.${extension}`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Failed to download:', error);
      if (url) {
        window.open(url, '_blank');
      }
    } finally {
      setDownloading(false);
    }
  }, [url, job.id, job.type, downloading]);

  return (
    <button
      className="slideshow-save-btn"
      onClick={handleDownload}
      disabled={downloading || !url}
      title="Download"
    >
      {downloading ? '⏳' : '⬇️'}
    </button>
  );
}

interface MediaSlideshowProps {
  project: ArchiveProject;
  initialJobId: string;
  sogniClient: SogniClient;
  onClose: () => void;
}

function MediaSlideshow({ project, initialJobId, sogniClient, onClose }: MediaSlideshowProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Get completed, non-hidden jobs only (like sogni-web)
  const jobs = useMemo<ArchiveJob[]>(() => {
    return project.jobs.filter(j => 
      j.status === 'completed' && 
      !j.hidden && 
      !j.isNSFW
    );
  }, [project.jobs]);

  const currentJob = jobs[currentIndex];
  const total = jobs.length;

  // Find initial position
  useEffect(() => {
    const initialIndex = jobs.findIndex(j => j.id === initialJobId);
    if (initialIndex >= 0) {
      setCurrentIndex(initialIndex);
    }
  }, [jobs, initialJobId]);

  // Animate in
  useEffect(() => {
    setIsVisible(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          handleClose();
          break;
        case 'ArrowLeft':
          setCurrentIndex(prev => (prev === 0 ? total - 1 : prev - 1));
          break;
        case 'ArrowRight':
          setCurrentIndex(prev => (prev === total - 1 ? 0 : prev + 1));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, total]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }, [handleClose]);

  const handlePrev = useCallback(() => {
    setCurrentIndex(prev => (prev === 0 ? total - 1 : prev - 1));
  }, [total]);

  const handleNext = useCallback(() => {
    setCurrentIndex(prev => (prev === total - 1 ? 0 : prev + 1));
  }, [total]);

  if (!currentJob) {
    return null;
  }

  return (
    <div
      className={`slideshow-container ${isVisible ? 'slideshow-visible' : ''}`}
      onClick={handleBackdropClick}
    >
      <button className="slideshow-close-btn" onClick={handleClose}>
        ×
      </button>

      <div className="slideshow-content">
        {/* Previous button - always visible */}
        <button className="slideshow-nav-btn slideshow-prev-btn" onClick={handlePrev}>
          ‹
        </button>

        {/* Media content */}
        <div className="slideshow-slide">
          <SlideshowContent
            job={currentJob}
            sogniClient={sogniClient}
            active={true}
            modelName={project.model.name}
          />
        </div>

        {/* Next button - always visible */}
        <button className="slideshow-nav-btn slideshow-next-btn" onClick={handleNext}>
          ›
        </button>
      </div>

      {/* Save button in bottom right */}
      <div className="slideshow-save">
        <DownloadButton job={currentJob} sogniClient={sogniClient} />
      </div>
    </div>
  );
}

export default MediaSlideshow;
