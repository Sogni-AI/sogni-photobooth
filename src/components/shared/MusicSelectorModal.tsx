/**
 * MusicSelectorModal
 *
 * Shared modal for selecting background music for stitched videos.
 * Supports preset tracks, file upload, and AI music generation.
 * Uses a staged selection pattern: user picks + trims, then "Apply" commits.
 *
 * Used by:
 * - Camera360FinalVideoStep (360 Camera workflow)
 * - PhotoGallery stitched video overlay (all video stitch workflows)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TRANSITION_MUSIC_PRESETS } from '../../constants/transitionMusicPresets';
import AudioTrimPreview from './AudioTrimPreview';

const ACCENT_COLOR = '#ECB630';

export interface PendingAITrack {
  id: string;
  url: string;
  title: string;
}

export interface MusicSelectorModalProps {
  currentPresetId: string | null;
  musicStartOffset?: number;
  customMusicUrl?: string | null;
  customMusicTitle?: string | null;
  totalVideoDuration?: number;
  onSelect: (presetId: string | null, startOffset?: number, customUrl?: string | null, customTitle?: string | null) => void;
  onUploadMusic: (blobUrl: string, filename: string) => void;
  onClose: () => void;
  onOpenMusicGenerator?: () => void;
  isAuthenticated?: boolean;
  /** Accent color for selection highlights and apply button. Defaults to gold (#ECB630). */
  accentColor?: string;
  /** Label for the apply button. Defaults to "Apply & Restitch". */
  applyLabel?: string;
  /** Label for the remove button. Defaults to "Remove Music & Restitch". */
  removeLabel?: string;
  /** AI-generated track to stage for trimming (set when user clicks "Use" in MusicGeneratorModal). */
  pendingAITrack?: PendingAITrack | null;
  /** Called after the pending AI track has been consumed/staged. */
  onPendingAITrackConsumed?: () => void;
}

const MusicSelectorModal: React.FC<MusicSelectorModalProps> = ({
  currentPresetId,
  musicStartOffset = 0,
  customMusicUrl,
  customMusicTitle,
  totalVideoDuration = 15,
  onSelect,
  onUploadMusic,
  onClose,
  onOpenMusicGenerator,
  isAuthenticated = false,
  accentColor = ACCENT_COLOR,
  applyLabel = 'Apply & Restitch',
  removeLabel = 'Remove Music & Restitch',
  pendingAITrack,
  onPendingAITrackConsumed
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const musicFileInputRef = useRef<HTMLInputElement>(null);

  // Staged selection: user picks a track, previews waveform + trims, then hits "Apply"
  const [stagedId, setStagedId] = useState<string | null>(currentPresetId);
  const [stagedCustomUrl, setStagedCustomUrl] = useState<string | null>(customMusicUrl || null);
  const [stagedCustomTitle, setStagedCustomTitle] = useState<string | null>(customMusicTitle || null);
  const [trimOffset, setTrimOffset] = useState(musicStartOffset);

  const filteredTracks = searchQuery
    ? (TRANSITION_MUSIC_PRESETS as any[]).filter((t: any) =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : TRANSITION_MUSIC_PRESETS;

  // Compute URL for the staged (not yet applied) track for waveform preview
  const stagedMusicUrl = (() => {
    if (!stagedId) return null;
    if (stagedCustomUrl) return stagedCustomUrl;
    const preset = (TRANSITION_MUSIC_PRESETS as any[]).find((p: any) => p.id === stagedId);
    return preset?.url || null;
  })();

  // Whether the staged selection differs from the currently applied one
  const hasChanges = stagedId !== currentPresetId || trimOffset !== musicStartOffset
    || stagedCustomUrl !== (customMusicUrl || null);

  const togglePreview = useCallback((track: any) => {
    if (previewId === track.id) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setPreviewId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = track.url;
        audioRef.current.play().catch(() => {});
      }
      setPreviewId(track.id);
    }
  }, [previewId]);

  // When an AI track is selected from the generator, stage it for trimming
  useEffect(() => {
    if (pendingAITrack) {
      setStagedId(`ai-generated-${pendingAITrack.id}`);
      setStagedCustomUrl(pendingAITrack.url);
      setStagedCustomTitle(pendingAITrack.title);
      setTrimOffset(0);
      onPendingAITrackConsumed?.();
    }
  }, [pendingAITrack]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = useCallback(() => {
    if (!stagedId) {
      onSelect(null);
    } else if (stagedId === 'uploaded' && stagedCustomUrl && stagedCustomTitle) {
      onUploadMusic(stagedCustomUrl, stagedCustomTitle);
    } else if (stagedCustomUrl) {
      // AI-generated or other custom tracks - pass URL/title with trim offset
      onSelect(stagedId, trimOffset, stagedCustomUrl, stagedCustomTitle);
    } else {
      onSelect(stagedId, trimOffset);
    }
  }, [stagedId, stagedCustomUrl, stagedCustomTitle, trimOffset, onSelect, onUploadMusic]);

  // Cleanup audio on unmount
  useEffect(() => {
    const audioEl = audioRef.current;
    return () => {
      if (audioEl) {
        audioEl.pause();
      }
    };
  }, []);

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        zIndex: 20
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '420px',
          maxHeight: '90vh',
          borderRadius: '20px',
          background: 'linear-gradient(135deg, rgba(30, 30, 40, 0.95) 0%, rgba(20, 20, 30, 0.98) 100%)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          margin: '20px'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.08)'
        }}>
          <h3 style={{
            margin: 0,
            fontSize: '16px',
            fontWeight: '700',
            color: '#fff'
          }}>
            Background Music
          </h3>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Remove music option */}
        {(stagedId || currentPresetId) && (
          <div style={{ padding: '12px 20px 0' }}>
            <button
              onClick={() => {
                setStagedId(null);
                setStagedCustomUrl(null);
                setStagedCustomTitle(null);
                setTrimOffset(0);
              }}
              style={{
                width: '100%',
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(255,100,100,0.3)',
                background: 'rgba(255,100,100,0.08)',
                color: 'rgba(255,150,150,0.9)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '500',
                fontFamily: 'inherit',
                textAlign: 'center'
              }}
            >
              Remove Music
            </button>
          </div>
        )}

        {/* Search */}
        <div style={{ padding: '12px 20px 4px' }}>
          <input
            type="text"
            placeholder="Search preset tracks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)',
              color: '#fff',
              fontSize: '13px',
              fontFamily: 'inherit',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Track list */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 12px 8px',
          minHeight: 0,
          maxHeight: '280px'
        }}>
          {filteredTracks.map((track: any) => {
            const isStaged = track.id === stagedId;
            const isPreviewing = track.id === previewId;

            return (
              <div
                key={track.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  background: isStaged ? `${accentColor}1F` : 'transparent',
                  borderLeft: isStaged ? `3px solid ${accentColor}` : '3px solid transparent',
                  transition: 'all 0.15s ease',
                  marginBottom: '2px'
                }}
                onClick={() => {
                  setStagedId(track.id);
                  setStagedCustomUrl(null);
                  setStagedCustomTitle(null);
                  setTrimOffset(0);
                }}
              >
                {/* Preview button */}
                <button
                  onClick={(e) => { e.stopPropagation(); togglePreview(track); }}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    border: 'none',
                    background: isPreviewing ? accentColor : 'rgba(255,255,255,0.1)',
                    color: isPreviewing ? '#000' : '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    flexShrink: 0,
                    transition: 'all 0.15s ease'
                  }}
                >
                  {isPreviewing ? '⏸' : '▶'}
                </button>

                {/* Track info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '13px',
                    color: isStaged ? accentColor : '#fff',
                    fontWeight: isStaged ? '600' : '400',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {track.emoji} {track.title}
                  </div>
                </div>

                {/* Duration */}
                <span style={{
                  fontSize: '11px',
                  color: 'rgba(255,255,255,0.4)',
                  fontVariantNumeric: 'tabular-nums',
                  flexShrink: 0
                }}>
                  {track.duration}
                </span>
              </div>
            );
          })}
        </div>

        {/* "or" divider */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          margin: '0',
          padding: '0 20px',
          color: 'rgba(255,255,255,0.3)',
          fontSize: '10px'
        }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
          <span>or</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
        </div>

        {/* Upload Music */}
        <div style={{ padding: '8px 20px 0' }}>
          <input
            ref={musicFileInputRef}
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.ogg"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const blobUrl = URL.createObjectURL(file);
                setStagedId('uploaded');
                setStagedCustomUrl(blobUrl);
                setStagedCustomTitle(file.name);
                setTrimOffset(0);
              }
            }}
          />
          <button
            onClick={() => musicFileInputRef.current?.click()}
            style={{
              width: '100%',
              padding: '8px 10px',
              backgroundColor: stagedId === 'uploaded' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255,255,255,0.05)',
              border: stagedId === 'uploaded' ? '2px solid rgba(76, 175, 80, 0.5)' : '1px dashed rgba(255,255,255,0.2)',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '500',
              fontFamily: 'inherit',
              textAlign: 'center'
            }}
          >
            {stagedId === 'uploaded' && stagedCustomTitle
              ? `\u2705 ${stagedCustomTitle}`
              : '\uD83D\uDCC1 Upload MP3/M4A'}
          </button>
        </div>

        {/* AI Music Generation */}
        {isAuthenticated && onOpenMusicGenerator && (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              margin: '0',
              padding: '8px 20px 0',
              color: 'rgba(255,255,255,0.3)',
              fontSize: '10px'
            }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
              <span>or</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
            </div>
            <div style={{ padding: '8px 20px 0' }}>
              <button
                onClick={onOpenMusicGenerator}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  backgroundColor: stagedId?.startsWith('ai-generated-') ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255,255,255,0.05)',
                  border: stagedId?.startsWith('ai-generated-') ? '2px solid rgba(76, 175, 80, 0.5)' : '1px dashed rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  fontFamily: 'inherit',
                  textAlign: 'center'
                }}
              >
                {stagedId?.startsWith('ai-generated-')
                  ? '\u2705 AI Generated Track'
                  : `${String.fromCodePoint(0x2728)} Create AI Music`}
              </button>
            </div>
          </>
        )}

        {/* Audio trim preview when a track is staged */}
        {stagedMusicUrl && stagedId && (
          <div style={{ padding: '8px 20px 0' }}>
            <AudioTrimPreview
              audioUrl={stagedMusicUrl}
              startOffset={trimOffset}
              duration={totalVideoDuration}
              onOffsetChange={setTrimOffset}
              accentColor={accentColor}
              height={48}
            />
          </div>
        )}

        {/* Apply / Confirm button */}
        <div style={{ padding: '12px 20px', flexShrink: 0 }}>
          <button
            onClick={handleApply}
            disabled={!hasChanges}
            style={{
              width: '100%',
              padding: '10px 16px',
              borderRadius: '10px',
              border: 'none',
              background: hasChanges ? accentColor : 'rgba(255,255,255,0.1)',
              color: hasChanges ? '#000' : 'rgba(255,255,255,0.3)',
              cursor: hasChanges ? 'pointer' : 'default',
              fontSize: '13px',
              fontWeight: '700',
              fontFamily: 'inherit',
              transition: 'all 0.15s ease'
            }}
          >
            {!stagedId ? removeLabel : applyLabel}
          </button>
        </div>

        {/* Hidden audio element for previews */}
        <audio ref={audioRef} onEnded={() => setPreviewId(null)} />
      </div>
    </div>
  );
};

export default MusicSelectorModal;
