import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { SogniClient } from '@sogni-ai/sogni-client';
import type { ArchiveProject, ArchiveJob } from '../../types/projectHistory';
import { useMediaUrl } from '../../hooks/useMediaUrl';
import './MediaSlideshow.css';

interface SlideshowContentProps {
  job: ArchiveJob;
  sogniClient: SogniClient;
  active: boolean;
}

function SlideshowContent({ job, sogniClient, active }: SlideshowContentProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const { url, loading, error } = useMediaUrl({
    projectId: job.projectId,
    jobId: job.id,
    type: job.type,
    sogniClient,
    enabled: true
  });

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
