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
  modelName: string;
}

function JobItem({ job, aspect, sogniClient, onView, onHideJob, modelName }: JobItemProps) {
  const [isPlaying, setIsPlaying] = useState(true); // Default to playing
  const [isMuted, setIsMuted] = useState(true);
  const [hasAudio, setHasAudio] = useState(false);
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

  // Detect if video should have audio based on model name
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

  // Toggle mute/unmute
  const handleMuteToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    const video = videoRef.current;
    if (!video) return;

    const newMutedState = !isMuted;
    video.muted = newMutedState;
    setIsMuted(newMutedState);
  }, [isMuted]);

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
          {/* Mute/unmute button (only shown for videos with audio) */}
          {hasAudio && (
            <button
              className="job-item-mute-btn"
              onClick={handleMuteToggle}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              <svg viewBox="0 0 24 24">
                {isMuted ? (
                  // Muted icon (speaker with X)
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                ) : (
                  // Unmuted icon (speaker with sound waves)
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                )}
              </svg>
            </button>
          )}
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
  // Default to 1:1 square if aspect is invalid (0, NaN, undefined, or unreasonably small)
  const validAspect = aspect && Number.isFinite(aspect) && aspect > 0.1 ? aspect : 1;
  const calculatedWidth = Math.round(320 * validAspect);

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
