/**
 * Camera360FinalVideoStep (Phase 5)
 *
 * Full-screen video player mirroring sogni-360's FinalVideoPanel:
 * - Auto-playing looped video
 * - Auto-hiding UI on inactivity (3s)
 * - Floating right-side action buttons (play/pause, music, download, share)
 * - Music selector popup with preset tracks
 * - Close button (top-right)
 * - Back/Start Over options
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { COLORS } from '../../../constants/camera360Settings';
import { TRANSITION_MUSIC_PRESETS } from '../../../constants/transitionMusicPresets';
import MusicGeneratorModal from '../MusicGeneratorModal';
import MusicSelectorModal from '../MusicSelectorModal';

interface Camera360FinalVideoStepProps {
  videoUrl: string | null;
  videoBlob: Blob | null;
  isStitching: boolean;
  progress: number;
  musicPresetId: string | null;
  musicStartOffset?: number;
  customMusicUrl?: string | null;
  customMusicTitle?: string | null;
  onBack: () => void;
  onStartOver: () => void;
  onClose: () => void;
  onRestitchWithMusic: (musicPresetId: string | null, musicStartOffset?: number, customMusicUrl?: string, customMusicTitle?: string) => void;
  /** Total video duration in seconds (transitions * per-transition duration) */
  totalVideoDuration?: number;
  // Auth/SDK props for AI music generation
  sogniClient?: any;
  isAuthenticated?: boolean;
  tokenType?: string;
  /** Called to share the video via QR code (kiosk mode) */
  onShareQRCode?: () => void;
}

const Camera360FinalVideoStep: React.FC<Camera360FinalVideoStepProps> = ({
  videoUrl,
  videoBlob,
  isStitching,
  progress,
  musicPresetId,
  musicStartOffset = 0,
  customMusicUrl,
  customMusicTitle,
  onBack,
  onStartOver,
  onClose,
  onRestitchWithMusic,
  totalVideoDuration = 15,
  sogniClient,
  isAuthenticated = false,
  tokenType = 'spark',
  onShareQRCode
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [uiVisible, setUiVisible] = useState(true);
  const [showMusicSelector, setShowMusicSelector] = useState(false);
  const [showMusicGenerator, setShowMusicGenerator] = useState(false);
  const [needsPlayPrompt, setNeedsPlayPrompt] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-hide UI after 3 seconds of inactivity during playback
  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    setUiVisible(true);
    hideTimerRef.current = setTimeout(() => {
      if (!showMusicSelector) {
        setUiVisible(false);
      }
    }, 3000);
  }, [showMusicSelector]);

  // Show UI on any mouse/touch activity
  useEffect(() => {
    const handleActivity = () => resetHideTimer();
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [resetHideTimer]);

  // Auto-play when video URL is available
  useEffect(() => {
    if (videoUrl && videoRef.current) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
        setNeedsPlayPrompt(false);
        resetHideTimer();
      }).catch(() => {
        // Autoplay blocked (e.g. iOS with audio) - show tap-to-play
        setNeedsPlayPrompt(true);
        setIsPlaying(false);
      });
    }
  }, [videoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep UI visible when music selector is open
  useEffect(() => {
    if (showMusicSelector) {
      setUiVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    }
  }, [showMusicSelector]);

  const togglePlayback = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
      setNeedsPlayPrompt(false);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleVideoClick = useCallback(() => {
    if (needsPlayPrompt) {
      togglePlayback();
      return;
    }
    // On click, toggle play/pause and show UI
    togglePlayback();
    resetHideTimer();
  }, [needsPlayPrompt, togglePlayback, resetHideTimer]);

  const handleDownload = useCallback(() => {
    if (!videoBlob) return;

    // Only use native share on mobile devices (desktop browsers also support navigator.share
    // but it opens the OS share sheet instead of downloading)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile && navigator.share) {
      try {
        const file = new File([videoBlob], 'sogni-360-camera.mp4', { type: 'video/mp4' });
        navigator.share({
          title: 'Sogni 360 Camera',
          files: [file]
        }).catch(() => {
          // Fall back to download
          downloadBlob(videoBlob);
        });
        return;
      } catch {
        // share() not supported with files
      }
    }

    downloadBlob(videoBlob);
  }, [videoBlob]);

  const handleShare = useCallback(async () => {
    if (!videoBlob) return;

    if (navigator.share) {
      try {
        const file = new File([videoBlob], '360-camera.mp4', { type: 'video/mp4' });
        await navigator.share({
          title: 'Sogni 360 Camera',
          files: [file]
        });
      } catch {
        handleDownload();
      }
    } else {
      handleDownload();
    }
  }, [videoBlob, handleDownload]);

  const handleMusicSelect = useCallback((presetId: string | null, startOffset: number = 0) => {
    setShowMusicSelector(false);
    onRestitchWithMusic(presetId, startOffset);
  }, [onRestitchWithMusic]);

  const handleAIMusicSelect = useCallback((track: any) => {
    setShowMusicGenerator(false);
    setShowMusicSelector(false);
    onRestitchWithMusic(`ai-generated-${track.id}`, 0, track.url, 'AI Generated');
  }, [onRestitchWithMusic]);

  const handleUploadMusic = useCallback((blobUrl: string, filename: string) => {
    setShowMusicSelector(false);
    onRestitchWithMusic('uploaded', 0, blobUrl, filename);
  }, [onRestitchWithMusic]);

  const currentMusicTitle = musicPresetId
    ? (customMusicTitle || (TRANSITION_MUSIC_PRESETS as any[]).find((p: any) => p.id === musicPresetId)?.title || 'Music')
    : null;

  const uiOpacity = uiVisible ? 1 : 0;
  const uiPointerEvents = uiVisible ? 'auto' as const : 'none' as const;

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      background: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden'
    }}>
      {/* Stitching progress */}
      {isStitching && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px'
        }}>
          <svg width="72" height="72" viewBox="0 0 72 72">
            <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
            <circle
              cx="36" cy="36" r="30" fill="none"
              stroke={COLORS.accent}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${(progress / 100) * 188.5} 188.5`}
              transform="rotate(-90 36 36)"
              style={{ transition: 'stroke-dasharray 0.3s ease' }}
            />
          </svg>
          <div style={{
            fontSize: '14px',
            color: 'rgba(255,255,255,0.7)',
            fontWeight: '500'
          }}>
            Stitching video... {progress}%
          </div>
        </div>
      )}

      {/* Video player */}
      {!isStitching && videoUrl && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
          onClick={handleVideoClick}
        >
          <video
            ref={videoRef}
            src={videoUrl}
            loop
            muted={!musicPresetId}
            playsInline
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block'
            }}
          />

          {/* Tap to play prompt (iOS autoplay blocked) */}
          {needsPlayPrompt && (
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.4)'
            }}>
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(255,255,255,0.2)'
              }}>
                <span style={{ fontSize: '32px', color: '#fff', marginLeft: '4px' }}>▶</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preparing state */}
      {!isStitching && !videoUrl && (
        <div style={{
          fontSize: '14px',
          color: 'rgba(255,255,255,0.5)'
        }}>
          Preparing video...
        </div>
      )}

      {/* ---- Floating UI (auto-hides) ---- */}

      {/* Close button - top right */}
      {videoUrl && !isStitching && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 'calc(1.5rem + env(safe-area-inset-top, 0px))',
            right: 'calc(1.5rem + env(safe-area-inset-right, 0px))',
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(12px)',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            fontWeight: '300',
            zIndex: 15,
            opacity: uiOpacity,
            pointerEvents: uiPointerEvents,
            transition: 'opacity 0.3s ease'
          }}
        >
          ✕
        </button>
      )}

      {/* Right-side action buttons */}
      {videoUrl && !isStitching && (
        <div style={{
          position: 'absolute',
          right: 'calc(2rem + env(safe-area-inset-right, 0px))',
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          zIndex: 10,
          opacity: uiOpacity,
          pointerEvents: uiPointerEvents,
          transition: 'opacity 0.3s ease'
        }}>
          {/* Play/Pause */}
          <ActionButton
            onClick={(e) => { e.stopPropagation(); togglePlayback(); }}
            title={isPlaying ? 'Pause' : 'Play'}
            active={false}
          >
            {isPlaying ? '⏸' : '▶'}
          </ActionButton>

          {/* Music */}
          <ActionButton
            onClick={(e) => { e.stopPropagation(); setShowMusicSelector(!showMusicSelector); }}
            title="Music"
            active={!!musicPresetId}
          >
            ♫
          </ActionButton>

          {/* Download */}
          <ActionButton
            onClick={(e) => { e.stopPropagation(); handleDownload(); }}
            title="Download"
            active={false}
          >
            ↓
          </ActionButton>

          {/* Share */}
          {typeof navigator.share === 'function' && (
            <ActionButton
              onClick={(e) => { e.stopPropagation(); handleShare(); }}
              title="Share"
              active={false}
            >
              <svg fill="currentColor" width="20" height="20" viewBox="0 0 24 24">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/>
              </svg>
            </ActionButton>
          )}

          {/* QR Code Share */}
          {onShareQRCode && (
            <ActionButton
              onClick={(e) => { e.stopPropagation(); onShareQRCode(); }}
              title="Share as QR Code"
              active={false}
            >
              <svg fill="currentColor" width="20" height="20" viewBox="0 0 24 24">
                <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4zM13 13h2v2h-2zM15 15h2v2h-2zM13 17h2v2h-2zM15 19h2v2h-2zM17 17h2v2h-2zM17 13h2v2h-2zM19 15h2v2h-2z"/>
              </svg>
            </ActionButton>
          )}

          {/* Back to editor */}
          <ActionButton
            onClick={(e) => { e.stopPropagation(); onBack(); }}
            title="Back to Editor"
            active={false}
          >
            ←
          </ActionButton>
        </div>
      )}

      {/* Bottom-left: Start Over */}
      {videoUrl && !isStitching && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))',
          left: 'calc(2rem + env(safe-area-inset-left, 0px))',
          display: 'flex',
          gap: '12px',
          zIndex: 10,
          opacity: uiOpacity,
          pointerEvents: uiPointerEvents,
          transition: 'opacity 0.3s ease'
        }}>
          <button
            onClick={(e) => { e.stopPropagation(); onStartOver(); }}
            style={{
              padding: '10px 20px',
              borderRadius: '24px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(12px)',
              color: 'rgba(255,255,255,0.8)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              fontFamily: 'inherit',
              transition: 'all 0.2s ease'
            }}
          >
            Start Over
          </button>
        </div>
      )}

      {/* Current music indicator - bottom center */}
      {videoUrl && !isStitching && currentMusicTitle && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '8px 16px',
          borderRadius: '20px',
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: 'rgba(255,255,255,0.7)',
          fontSize: '12px',
          fontWeight: '500',
          zIndex: 10,
          opacity: uiOpacity,
          pointerEvents: uiPointerEvents,
          transition: 'opacity 0.3s ease',
          whiteSpace: 'nowrap'
        }}>
          ♫ {currentMusicTitle}
        </div>
      )}

      {/* Music Selector Modal */}
      {showMusicSelector && (
        <MusicSelectorModal
          currentPresetId={musicPresetId}
          musicStartOffset={musicStartOffset}
          customMusicUrl={customMusicUrl}
          customMusicTitle={customMusicTitle}
          totalVideoDuration={totalVideoDuration}
          onSelect={handleMusicSelect}
          onUploadMusic={handleUploadMusic}
          onClose={() => setShowMusicSelector(false)}
          onOpenMusicGenerator={() => setShowMusicGenerator(true)}
          isAuthenticated={isAuthenticated}
        />
      )}

      {/* AI Music Generator Modal */}
      <MusicGeneratorModal
        visible={showMusicGenerator}
        onClose={() => setShowMusicGenerator(false)}
        onTrackSelect={handleAIMusicSelect}
        sogniClient={sogniClient}
        isAuthenticated={isAuthenticated}
        tokenType={tokenType}
        zIndex={99999999}
      />
    </div>
  );
};

// ---- Action Button ----

interface ActionButtonProps {
  onClick: (e: React.MouseEvent) => void;
  title: string;
  active: boolean;
  children: React.ReactNode;
}

const ActionButton: React.FC<ActionButtonProps> = ({ onClick, title, active, children }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      width: '56px',
      height: '56px',
      borderRadius: '50%',
      border: `1px solid ${active ? COLORS.accent : 'rgba(255,255,255,0.15)'}`,
      background: active ? 'rgba(236, 182, 48, 0.25)' : 'rgba(0,0,0,0.4)',
      backdropFilter: 'blur(12px)',
      color: active ? COLORS.accent : '#fff',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '20px',
      transition: 'all 0.2s ease',
      fontFamily: 'inherit'
    }}
  >
    {children}
  </button>
);

// MusicSelectorModal is now a shared component imported from '../MusicSelectorModal'

// ---- Helpers ----

function downloadBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sogni-360-camera-${Date.now()}.mp4`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default Camera360FinalVideoStep;
