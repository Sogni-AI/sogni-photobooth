import { useState, useCallback, useRef, useEffect } from 'react';
import type { SogniClient } from '@sogni-ai/sogni-client';
import type { ArchiveJob } from '../../types/projectHistory';
import { useLazyLoad } from '../../hooks/useLazyLoad';
import { useMediaUrl } from '../../hooks/useMediaUrl';
import './JobItem.css';

interface JobItemProps {
  job: ArchiveJob;
  aspect: number;
  sogniClient: SogniClient | null;
  onView: () => void;
  onHideJob?: (projectId: string, jobId: string) => void;
}

function JobItem({ job, aspect, sogniClient, onView, onHideJob }: JobItemProps) {
  const [isPlaying, setIsPlaying] = useState(true); // Default to playing
  const videoRef = useRef<HTMLVideoElement>(null);

  // Lazy load media only when item is in viewport
  const { ref, isVisible } = useLazyLoad({
    rootMargin: '100px',
    once: true
  });

  // Get media URL (only fetch when visible)
  const { url, loading, error, hidden } = useMediaUrl({
    projectId: job.projectId,
    jobId: job.id,
    type: job.type,
    sogniClient,
    enabled: isVisible && job.status === 'completed',
    onHideJob
  });

  // Toggle video play/pause
  const handleVideoToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying]);

  // Autoplay video when URL is ready
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url || job.type !== 'video') return;

    const playVideo = () => {
      video.play().catch(() => {});
      setIsPlaying(true);
    };

    if (video.readyState >= 2) {
      playVideo();
    } else {
      video.addEventListener('loadeddata', playVideo, { once: true });
    }

    return () => {
      video.removeEventListener('loadeddata', playVideo);
    };
  }, [url, job.type]);

  // Sync playing state with video element
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

  // Don't render if job is hidden (media unavailable)
  if (hidden || job.hidden) {
    return null;
  }

  // Render content based on state
  const renderContent = () => {
    // Show loading placeholder if not yet visible and item is completed
    if (!isVisible && job.status === 'completed') {
      return (
        <div className="job-item-placeholder">
          <div className="job-item-spinner" />
        </div>
      );
    }

    // Show loading state
    if (loading && !url) {
      return (
        <div className="job-item-placeholder">
          <div className="job-item-spinner" />
        </div>
      );
    }

    // Show error state
    if (error) {
      return (
        <div className="job-item-placeholder job-item-placeholder-error">
          <span className="job-item-error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      );
    }

    // NSFW content
    if (job.isNSFW) {
      return (
        <div className="job-item-placeholder job-item-placeholder-warning">
          <span className="job-item-nsfw-icon">🔞</span>
          <span>Sensitive content detected</span>
        </div>
      );
    }

    // Show actual content once visible and URL is ready
    if (job.status === 'completed' && url) {
      return job.type === 'video' ? (
        <div className="job-item-video-wrapper">
          <video
            ref={videoRef}
            className="job-item-video"
            src={url}
            loop
            muted
            playsInline
            autoPlay
            preload="auto"
          />
          {/* Small play/pause button */}
          <button
            className="job-item-video-btn"
            onClick={handleVideoToggle}
            title={isPlaying ? 'Pause' : 'Play'}
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
      ) : (
        <img
          className="job-item-media"
          src={url}
          alt={`Job ${job.id}`}
          loading="lazy"
        />
      );
    }

    // Non-completed items (failed, canceled, etc.)
    return (
      <div
        className={`job-item-placeholder ${
          job.status === 'failed' ? 'job-item-placeholder-error' :
          job.status === 'canceled' ? 'job-item-placeholder-warning' : ''
        }`}
      >
        {job.status === 'failed' && <span className="job-item-error-icon">⚠️</span>}
        {job.status === 'canceled' && <span className="job-item-warning-icon">🚫</span>}
        <span className="job-item-status">{job.status}</span>
      </div>
    );
  };

  // Calculate width based on aspect ratio and 320px height
  const calculatedWidth = Math.round(320 * aspect);

  return (
    <div
      ref={ref}
      className="job-item"
      style={{ width: `${calculatedWidth}px` }}
      onClick={onView}
    >
      {renderContent()}
    </div>
  );
}

export default JobItem;
