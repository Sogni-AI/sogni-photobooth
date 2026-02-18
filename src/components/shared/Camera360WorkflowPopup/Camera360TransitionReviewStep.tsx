/**
 * Camera360TransitionReviewStep (Phase 3)
 *
 * Horizontal carousel review of generated transition videos with:
 * - Collapsible inline settings panel (duration, prompt, music)
 * - VideoSettingsFooter pills for resolution/quality
 * - Progress indicators, from/to thumbnails, video players, SMPTE test patterns
 * - Regeneration and version history
 */

import React, { useCallback, useRef, useState, useMemo } from 'react';
import type { Camera360TransitionItem, Camera360TransitionSettings } from '../../../types/camera360';
import type { VideoResolution, VideoQualityPreset } from '../../../constants/videoSettings';
import { calculateVideoFrames, calculateVideoDimensions } from '../../../constants/videoSettings';
import { COLORS, DEFAULT_360_TRANSITION_PROMPT } from '../../../constants/camera360Settings';
import { TRANSITION_MUSIC_PRESETS } from '../../../constants/transitionMusicPresets';
import { useVideoCostEstimation } from '../../../hooks/useVideoCostEstimation';
import { getPaymentMethod } from '../../../services/walletService';
import TestPatternPlaceholder from '../TestPatternPlaceholder';
import VideoSettingsFooter from '../VideoSettingsFooter';
import AudioTrimPreview from '../AudioTrimPreview';
import MusicGeneratorModal from '../MusicGeneratorModal';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Camera360TransitionReviewStepProps {
  transitions: Camera360TransitionItem[];
  angleImageUrls: string[];
  isGenerating: boolean;
  allReady: boolean;
  onRegenerate: (transitionId: string) => void;
  onVersionChange: (transitionId: string, version: number) => void;
  onProceed: () => void;
  onBack: () => void;
  sourceWidth: number;
  sourceHeight: number;
  // Inline settings props (merged from former config step)
  settings: Camera360TransitionSettings;
  onUpdateSettings: (updates: Partial<Camera360TransitionSettings>) => void;
  onGenerate: () => void;
  // Auth/SDK props for AI music generation
  sogniClient?: any;
  isAuthenticated?: boolean;
  tokenType?: string;
}

const Camera360TransitionReviewStep: React.FC<Camera360TransitionReviewStepProps> = ({
  transitions,
  angleImageUrls,
  isGenerating,
  allReady,
  onRegenerate,
  onVersionChange,
  onProceed,
  onBack,
  sourceWidth,
  sourceHeight,
  settings,
  onUpdateSettings,
  onGenerate,
  sogniClient,
  isAuthenticated = false,
  tokenType = 'spark'
}) => {
  const readyCount = transitions.filter(t => t.status === 'ready').length;
  const totalCount = transitions.length;
  const hasGenerated = transitions.some(t => t.status !== 'pending');

  // AI Music Generator state
  const [showMusicGenerator, setShowMusicGenerator] = useState(false);

  // Music section state
  const [showTrackBrowser, setShowTrackBrowser] = useState(false);
  const [trackSearchQuery, setTrackSearchQuery] = useState('');
  const [previewingTrackId, setPreviewingTrackId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement>(null);
  const musicFileInputRef = useRef<HTMLInputElement>(null);

  // Collapsible settings panel - starts expanded, auto-collapses on generate
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const prevIsGenerating = useRef(false);

  // Auto-collapse when generation starts
  if (isGenerating && !prevIsGenerating.current) {
    setSettingsExpanded(false);
  }
  prevIsGenerating.current = isGenerating;

  // Cost estimation
  const costTokenType = getPaymentMethod();
  const frames = useMemo(() => calculateVideoFrames(settings.duration), [settings.duration]);
  const { cost, costInUSD, loading: costLoading } = useVideoCostEstimation({
    imageWidth: sourceWidth,
    imageHeight: sourceHeight,
    resolution: settings.resolution,
    quality: settings.quality,
    frames,
    fps: 32,
    duration: settings.duration,
    enabled: totalCount > 0,
    jobCount: totalCount
  });

  // Settings change handlers
  const handleDurationChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateSettings({ duration: parseFloat(e.target.value) });
  }, [onUpdateSettings]);

  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdateSettings({ prompt: e.target.value });
  }, [onUpdateSettings]);

  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.src = '';
    }
    setPreviewingTrackId(null);
  }, []);

  const handlePreviewToggle = useCallback((e: React.MouseEvent, trackId: string, trackUrl: string) => {
    e.stopPropagation();
    if (previewingTrackId === trackId) {
      stopPreview();
      return;
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.src = trackUrl;
      previewAudioRef.current.play().catch(() => {});
    }
    setPreviewingTrackId(trackId);
  }, [previewingTrackId, stopPreview]);

  const handlePresetSelect = useCallback((presetId: string) => {
    stopPreview();
    setShowTrackBrowser(false);
    onUpdateSettings({
      musicPresetId: presetId,
      customMusicUrl: null,
      customMusicTitle: null,
      musicStartOffset: 0
    });
  }, [onUpdateSettings, stopPreview]);

  const handleRemoveMusic = useCallback(() => {
    onUpdateSettings({
      musicPresetId: null,
      customMusicUrl: null,
      customMusicTitle: null,
      musicStartOffset: 0
    });
  }, [onUpdateSettings]);

  const handleMusicUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const blobUrl = URL.createObjectURL(file);
    onUpdateSettings({
      musicPresetId: 'uploaded',
      customMusicUrl: blobUrl,
      customMusicTitle: file.name,
      musicStartOffset: 0
    });
  }, [onUpdateSettings]);

  // AI music track selection handler
  const handleAIMusicSelect = useCallback((track: any) => {
    setShowMusicGenerator(false);
    onUpdateSettings({
      musicPresetId: `ai-generated-${track.id}`,
      customMusicUrl: track.url,
      customMusicTitle: 'AI Generated',
      musicStartOffset: 0
    });
  }, [onUpdateSettings]);

  // Compute selected music URL for AudioTrimPreview
  const selectedMusicUrl = useMemo(() => {
    if (!settings.musicPresetId) return null;
    if (settings.customMusicUrl) return settings.customMusicUrl;
    const preset = (TRANSITION_MUSIC_PRESETS as any[]).find((p: any) => p.id === settings.musicPresetId);
    return preset?.url || null;
  }, [settings.musicPresetId, settings.customMusicUrl]);

  const handleMusicStartOffsetChange = useCallback((offset: number) => {
    onUpdateSettings({ musicStartOffset: offset });
  }, [onUpdateSettings]);

  // VideoSettingsFooter override callbacks
  const handleResolutionChange = useCallback((resolution: string) => {
    onUpdateSettings({ resolution: resolution as VideoResolution });
  }, [onUpdateSettings]);

  const handleQualityChange = useCallback((quality: string) => {
    onUpdateSettings({ quality: quality as VideoQualityPreset });
  }, [onUpdateSettings]);

  const handleDurationPillChange = useCallback((duration: number) => {
    onUpdateSettings({ duration });
  }, [onUpdateSettings]);

  const handleGenerate = useCallback(() => {
    setSettingsExpanded(false);
    onGenerate();
  }, [onGenerate]);

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '6px',
    display: 'block'
  };

  // Compute actual video output dimensions (rounded to 16px divisor)
  // This is what the transition generator actually renders at
  const videoDimensions = useMemo(() =>
    calculateVideoDimensions(sourceWidth, sourceHeight, settings.resolution),
    [sourceWidth, sourceHeight, settings.resolution]
  );

  // Determine action button state
  const canGenerate = !isGenerating && totalCount > 0;
  const showCreateFinal = allReady && !isGenerating;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      overflow: 'hidden',
      minHeight: 0
    }}>
      {/* Status bar - fixed top */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        flexShrink: 0,
        borderBottom: `1px solid ${COLORS.borderLight}`
      }}>
        <div style={{
          fontSize: '12px',
          color: COLORS.textSecondary,
          fontWeight: '600'
        }}>
          {allReady
            ? `All ${totalCount} transitions ready`
            : hasGenerated
              ? `${readyCount} of ${totalCount} complete`
              : `${totalCount} transition${totalCount !== 1 ? 's' : ''} to generate`}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isGenerating && (
            <div style={{
              fontSize: '11px',
              color: COLORS.warning,
              fontWeight: '500'
            }}>
              Generating...
            </div>
          )}
          {/* Settings toggle button */}
          <button
            onClick={() => setSettingsExpanded(!settingsExpanded)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '6px',
              border: `1px solid ${COLORS.border}`,
              background: settingsExpanded ? COLORS.accentSoft : 'transparent',
              color: settingsExpanded ? COLORS.accent : COLORS.textSecondary,
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '600',
              fontFamily: 'inherit',
              transition: 'all 0.15s ease'
            }}
          >
            <span style={{ fontSize: '12px' }}>&#9881;</span>
            Settings
            <span style={{
              fontSize: '8px',
              transform: settingsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease'
            }}>
              &#9660;
            </span>
          </button>
        </div>
      </div>

      {/* Carousel + settings overlay container */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {/* Horizontal carousel - always takes full space */}
        <div style={{
          height: '100%',
          display: 'flex',
          gap: '20px',
          padding: '20px 24px',
          overflowX: 'auto',
          overflowY: 'hidden',
          alignItems: 'stretch',
          scrollSnapType: 'x mandatory',
          scrollPadding: '0 24px',
          WebkitOverflowScrolling: 'touch',
        }}>
          {transitions.map((transition, index) => (
            <TransitionCard
              key={transition.id}
              transition={transition}
              index={index}
              fromImageUrl={angleImageUrls[transition.fromIndex] || ''}
              toImageUrl={angleImageUrls[transition.toIndex] || ''}
              onRegenerate={() => onRegenerate(transition.id)}
              onVersionChange={(version) => onVersionChange(transition.id, version)}
              videoWidth={videoDimensions.width}
              videoHeight={videoDimensions.height}
            />
          ))}
        </div>

        {/* Settings overlay - slides down over carousel */}
        <div
          onClick={() => setSettingsExpanded(false)}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9,
            opacity: settingsExpanded ? 1 : 0,
            pointerEvents: settingsExpanded ? 'auto' : 'none',
            transition: 'opacity 0.3s ease'
          }}
        />
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          maxHeight: settingsExpanded ? '90%' : '0px',
          overflowY: settingsExpanded ? 'auto' : 'hidden',
          overscrollBehavior: 'contain',
          transition: 'max-height 0.3s ease',
          background: 'rgba(28, 28, 30, 0.97)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: settingsExpanded ? `1px solid ${COLORS.borderLight}` : 'none',
          zIndex: 10,
          opacity: isGenerating ? 0.5 : 1,
          pointerEvents: isGenerating ? 'none' : 'auto'
        }}>
          <div style={{ padding: '12px 20px' }}>
            {/* Settings row */}
            <div style={{
              display: 'flex',
              gap: '16px',
              flexWrap: 'wrap',
              alignItems: 'flex-start'
            }}>
              {/* Duration slider */}
              <div style={{ flex: '0 0 160px' }}>
                <label style={labelStyle}>Duration ({settings.duration}s)</label>
                <input
                  type="range"
                  min="1"
                  max="8"
                  step="0.5"
                  value={settings.duration}
                  onChange={handleDurationChange}
                  style={{
                    width: '100%',
                    accentColor: COLORS.accent,
                    marginTop: '4px'
                  }}
                />
              </div>

              {/* Background Music */}
              <div style={{ flex: '1 1 200px', minWidth: '160px' }}>
                <label style={labelStyle}>Background Music</label>

                {/* Remove music button - shown when any music is selected */}
                {settings.musicPresetId && (
                  <button
                    onClick={handleRemoveMusic}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: `1px solid rgba(255,100,100,0.3)`,
                      background: 'rgba(255,100,100,0.08)',
                      color: 'rgba(255,150,150,0.9)',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: '500',
                      fontFamily: 'inherit',
                      textAlign: 'center',
                      marginBottom: '6px'
                    }}
                  >
                    Remove Music
                  </button>
                )}

                {/* Browse Preset Tracks - collapsible */}
                <button
                  onClick={() => {
                    if (showTrackBrowser) stopPreview();
                    setShowTrackBrowser(!showTrackBrowser);
                    setTrackSearchQuery('');
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    backgroundColor: settings.musicPresetId && !settings.musicPresetId.startsWith('ai-generated-') && settings.musicPresetId !== 'uploaded'
                      ? 'rgba(76, 175, 80, 0.2)' : COLORS.surfaceLight,
                    border: settings.musicPresetId && !settings.musicPresetId.startsWith('ai-generated-') && settings.musicPresetId !== 'uploaded'
                      ? `2px solid rgba(76, 175, 80, 0.5)` : `1px solid ${COLORS.border}`,
                    borderRadius: '6px',
                    borderBottomLeftRadius: showTrackBrowser ? '0' : '6px',
                    borderBottomRightRadius: showTrackBrowser ? '0' : '6px',
                    color: COLORS.textPrimary,
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '500',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>
                    {settings.musicPresetId && !settings.musicPresetId.startsWith('ai-generated-') && settings.musicPresetId !== 'uploaded'
                      ? (() => {
                          const preset = (TRANSITION_MUSIC_PRESETS as any[]).find((p: any) => p.id === settings.musicPresetId);
                          return preset ? `${preset.emoji} ${preset.title}` : '🎵 Browse Preset Tracks...';
                        })()
                      : '🎵 Browse Preset Tracks...'}
                  </span>
                  <span style={{
                    fontSize: '10px',
                    transition: 'transform 0.2s ease',
                    transform: showTrackBrowser ? 'rotate(180deg)' : 'rotate(0deg)'
                  }}>▼</span>
                </button>

                {/* Expandable track browser */}
                {showTrackBrowser && (
                  <div style={{
                    border: `1px solid ${COLORS.border}`,
                    borderTop: 'none',
                    borderBottomLeftRadius: '6px',
                    borderBottomRightRadius: '6px',
                    background: COLORS.surfaceLight,
                    overflow: 'hidden'
                  }}>
                    {/* Search */}
                    <div style={{ padding: '8px 8px 4px' }}>
                      <input
                        type="text"
                        value={trackSearchQuery}
                        onChange={(e) => setTrackSearchQuery(e.target.value)}
                        placeholder="Search tracks..."
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '5px',
                          border: `1px solid ${COLORS.border}`,
                          background: COLORS.surface,
                          color: COLORS.textPrimary,
                          fontSize: '12px',
                          fontFamily: 'inherit',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    {/* Hidden audio element for track preview */}
                    <audio ref={previewAudioRef} onEnded={stopPreview} />
                    {/* Scrollable track list */}
                    <div style={{ maxHeight: '180px', overflowY: 'auto', overscrollBehavior: 'contain' }}>
                      {(TRANSITION_MUSIC_PRESETS as any[])
                        .filter((track: any) => track.title.toLowerCase().includes(trackSearchQuery.toLowerCase()))
                        .map((track: any) => {
                          const isSelected = settings.musicPresetId === track.id;
                          const isPreviewing = previewingTrackId === track.id;
                          return (
                            <div
                              key={track.id}
                              onClick={() => handlePresetSelect(track.id)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 10px',
                                cursor: 'pointer',
                                background: isPreviewing
                                  ? 'rgba(100, 181, 246, 0.12)'
                                  : isSelected ? 'rgba(76, 175, 80, 0.15)' : 'transparent',
                                borderLeft: isSelected ? `3px solid ${COLORS.accent}` : '3px solid transparent',
                                transition: 'background 0.15s ease'
                              }}
                            >
                              {/* Play/Pause preview button */}
                              <button
                                onClick={(e) => handlePreviewToggle(e, track.id, track.url)}
                                title={isPreviewing ? 'Pause preview' : 'Preview track'}
                                style={{
                                  width: '24px',
                                  height: '24px',
                                  borderRadius: '50%',
                                  border: `1px solid ${isPreviewing ? 'rgba(100, 181, 246, 0.5)' : COLORS.border}`,
                                  background: isPreviewing ? 'rgba(100, 181, 246, 0.2)' : 'transparent',
                                  color: isPreviewing ? 'rgb(100, 181, 246)' : COLORS.textMuted,
                                  cursor: 'pointer',
                                  fontSize: '10px',
                                  padding: 0,
                                  flexShrink: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                {isPreviewing ? '\u23F8' : '\u25B6'}
                              </button>
                              <span style={{ fontSize: '14px', flexShrink: 0 }}>{track.emoji}</span>
                              <span style={{
                                flex: 1,
                                fontSize: '12px',
                                fontWeight: isSelected ? '600' : '400',
                                color: isSelected ? COLORS.accent : COLORS.textPrimary,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {track.title}
                              </span>
                              <span style={{
                                fontSize: '11px',
                                color: COLORS.textMuted,
                                flexShrink: 0,
                                fontVariantNumeric: 'tabular-nums'
                              }}>
                                {track.duration}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* "or" divider */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  margin: '6px 0',
                  color: COLORS.textMuted,
                  fontSize: '10px'
                }}>
                  <div style={{ flex: 1, height: '1px', backgroundColor: COLORS.border }} />
                  <span>or</span>
                  <div style={{ flex: 1, height: '1px', backgroundColor: COLORS.border }} />
                </div>

                {/* Upload Music */}
                <input
                  ref={musicFileInputRef}
                  type="file"
                  accept="audio/*,.mp3,.m4a,.wav,.ogg"
                  style={{ display: 'none' }}
                  onChange={handleMusicUpload}
                />
                <button
                  onClick={() => musicFileInputRef.current?.click()}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    backgroundColor: settings.musicPresetId === 'uploaded' ? 'rgba(76, 175, 80, 0.2)' : COLORS.surfaceLight,
                    border: settings.musicPresetId === 'uploaded' ? '2px solid rgba(76, 175, 80, 0.5)' : `1px dashed ${COLORS.border}`,
                    borderRadius: '6px',
                    color: COLORS.textPrimary,
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '500',
                    fontFamily: 'inherit',
                    textAlign: 'center'
                  }}
                >
                  {settings.musicPresetId === 'uploaded' && settings.customMusicTitle
                    ? `✅ ${settings.customMusicTitle}`
                    : '📁 Upload MP3/M4A'}
                </button>

                {/* AI Music Generation (authenticated users only) */}
                {isAuthenticated && (
                  <>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      margin: '6px 0',
                      color: COLORS.textMuted,
                      fontSize: '10px'
                    }}>
                      <div style={{ flex: 1, height: '1px', backgroundColor: COLORS.border }} />
                      <span>or</span>
                      <div style={{ flex: 1, height: '1px', backgroundColor: COLORS.border }} />
                    </div>
                    <button
                      onClick={() => setShowMusicGenerator(true)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        backgroundColor: settings.musicPresetId?.startsWith('ai-generated-') ? 'rgba(76, 175, 80, 0.2)' : COLORS.surfaceLight,
                        border: settings.musicPresetId?.startsWith('ai-generated-') ? '2px solid rgba(76, 175, 80, 0.5)' : `1px dashed ${COLORS.border}`,
                        borderRadius: '6px',
                        color: COLORS.textPrimary,
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '500',
                        fontFamily: 'inherit',
                        textAlign: 'center'
                      }}
                    >
                      {settings.musicPresetId?.startsWith('ai-generated-')
                        ? '✅ AI Generated Track'
                        : `${String.fromCodePoint(0x2728)} Create AI Music`}
                    </button>
                  </>
                )}

                {/* Audio trim preview when music is selected */}
                {selectedMusicUrl && (
                  <div style={{ marginTop: '8px' }}>
                    <AudioTrimPreview
                      audioUrl={selectedMusicUrl}
                      startOffset={settings.musicStartOffset || 0}
                      duration={settings.duration * totalCount}
                      onOffsetChange={handleMusicStartOffsetChange}
                      accentColor={COLORS.accent}
                      height={48}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Transition prompt */}
            <div style={{ marginTop: '10px' }}>
              <label style={labelStyle}>Transition Prompt</label>
              <textarea
                value={settings.prompt}
                onChange={handlePromptChange}
                placeholder={DEFAULT_360_TRANSITION_PROMPT}
                rows={2}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.surfaceLight,
                  color: COLORS.textPrimary,
                  fontSize: '12px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer row 1: VideoSettingsFooter pills + cost */}
      <div style={{
        padding: '6px 20px',
        borderTop: `1px solid ${COLORS.borderLight}`,
        flexShrink: 0
      }}>
        {/* @ts-expect-error VideoSettingsFooter is JSX without type declarations */}
        <VideoSettingsFooter
          videoCount={totalCount}
          cost={cost}
          costUSD={costInUSD}
          loading={costLoading}
          colorScheme="dark"
          tokenType={costTokenType}
          showDuration={true}
          showResolution={true}
          showQuality={true}
          resolution={settings.resolution}
          onResolutionChange={handleResolutionChange}
          quality={settings.quality}
          onQualityChange={handleQualityChange}
          duration={settings.duration}
          onDurationChange={handleDurationPillChange}
        />
      </div>

      {/* Footer row 2: Back + Action button */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 20px 12px',
        flexShrink: 0
      }}>
        <button
          onClick={onBack}
          disabled={isGenerating}
          style={{
            padding: '10px 20px',
            borderRadius: '10px',
            border: `1px solid ${COLORS.border}`,
            background: 'transparent',
            color: COLORS.textSecondary,
            cursor: isGenerating ? 'default' : 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            fontFamily: 'inherit',
            opacity: isGenerating ? 0.5 : 1
          }}
        >
          Back
        </button>

        <div style={{ display: 'flex', gap: '8px' }}>
          {/* Generate button - show when not all ready */}
          {!showCreateFinal && (
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              style={{
                padding: '10px 24px',
                borderRadius: '10px',
                border: 'none',
                background: canGenerate ? COLORS.accent : COLORS.surfaceLight,
                color: canGenerate ? COLORS.black : COLORS.textMuted,
                cursor: canGenerate ? 'pointer' : 'default',
                fontSize: '13px',
                fontWeight: '700',
                fontFamily: 'inherit',
                transition: 'all 0.15s ease'
              }}
            >
              {isGenerating
                ? 'Generating...'
                : `Generate ${totalCount} Transition${totalCount !== 1 ? 's' : ''}`}
            </button>
          )}

          {/* Create Final Video button - show when all ready */}
          {showCreateFinal && (
            <button
              onClick={onProceed}
              style={{
                padding: '10px 24px',
                borderRadius: '10px',
                border: 'none',
                background: COLORS.accent,
                color: COLORS.black,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '700',
                fontFamily: 'inherit',
                transition: 'all 0.15s ease'
              }}
            >
              Create Final Video
            </button>
          )}
        </div>
      </div>

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

// ---- TransitionCard subcomponent ----

interface TransitionCardProps {
  transition: Camera360TransitionItem;
  index: number;
  fromImageUrl: string;
  toImageUrl: string;
  onRegenerate: () => void;
  onVersionChange: (version: number) => void;
  videoWidth: number;
  videoHeight: number;
}

const TransitionCard: React.FC<TransitionCardProps> = ({
  transition,
  index,
  fromImageUrl,
  toImageUrl,
  onRegenerate,
  onVersionChange,
  videoWidth,
  videoHeight
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentVideoUrl = transition.versionHistory[transition.selectedVersion]?.videoUrl || transition.videoUrl;

  const togglePlayback = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  }, []);

  return (
    <div style={{
      flexShrink: 0,
      minWidth: '320px',
      maxWidth: '520px',
      display: 'flex',
      flexDirection: 'column',
      borderRadius: '12px',
      border: `1px solid ${
        transition.status === 'ready' ? COLORS.border :
        transition.status === 'failed' ? COLORS.error :
        COLORS.borderLight
      }`,
      overflow: 'hidden',
      background: COLORS.surfaceLight,
      scrollSnapAlign: 'center'
    }}>
      {/* From -> To thumbnails */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 10px',
        gap: '8px',
        borderBottom: `1px solid ${COLORS.borderLight}`,
        flexShrink: 0
      }}>
        <img
          src={fromImageUrl}
          alt={`From ${transition.fromIndex + 1}`}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '6px',
            objectFit: 'cover'
          }}
        />
        <span style={{ fontSize: '12px', color: COLORS.textMuted }}>→</span>
        <img
          src={toImageUrl}
          alt={`To ${transition.toIndex + 1}`}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '6px',
            objectFit: 'cover'
          }}
        />
        <span style={{
          fontSize: '11px',
          color: COLORS.textMuted,
          marginLeft: 'auto'
        }}>
          Transition {index + 1}
        </span>
      </div>

      {/* Video / Progress area - aspect ratio driven, shrinks when carousel height is constrained */}
      <div style={{
        flex: '0 1 auto',
        minHeight: 0,
        position: 'relative',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: 'rgba(0,0,0,0.4)',
        aspectRatio: `${videoWidth} / ${videoHeight}`,
        cursor: transition.status === 'ready' ? 'pointer' : 'default'
      }}
        onClick={transition.status === 'ready' ? togglePlayback : undefined}
      >
        {transition.status === 'ready' && currentVideoUrl ? (
          <video
            ref={videoRef}
            src={currentVideoUrl}
            loop
            muted
            autoPlay
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block'
            }}
          />
        ) : transition.status === 'generating' ? (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {/* Test pattern behind progress */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TestPatternPlaceholder width={videoWidth} height={videoHeight} />
            </div>
            {/* Progress overlay */}
            <div style={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(0,0,0,0.5)',
              borderRadius: '12px',
              padding: '16px 24px'
            }}>
              <svg width="40" height="40" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="16" fill="none" stroke={COLORS.borderLight} strokeWidth="3" />
                <circle
                  cx="20" cy="20" r="16" fill="none"
                  stroke={COLORS.accent}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${(transition.progress / 100) * 100.5} 100.5`}
                  transform="rotate(-90 20 20)"
                  style={{ transition: 'stroke-dasharray 0.3s ease' }}
                />
              </svg>
              <div style={{ fontSize: '12px', color: COLORS.textSecondary, fontWeight: '500' }}>
                {Math.round(transition.progress)}%
              </div>
              {transition.workerName && (
                <div style={{
                  fontSize: '9px',
                  color: 'rgba(255, 255, 255, 0.4)',
                  whiteSpace: 'nowrap',
                  textAlign: 'center'
                }}>
                  {transition.workerName}
                </div>
              )}
            </div>
          </div>
        ) : transition.status === 'failed' ? (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <TestPatternPlaceholder width={videoWidth} height={videoHeight} />
            <div style={{
              position: 'absolute',
              background: 'rgba(0,0,0,0.6)',
              borderRadius: '8px',
              padding: '8px 16px',
              textAlign: 'center'
            }}>
              <span style={{ fontSize: '20px', display: 'block' }}>!</span>
              <div style={{ fontSize: '10px', color: COLORS.error, padding: '0 8px' }}>
                {transition.error || 'Failed'}
              </div>
            </div>
          </div>
        ) : (
          /* Pending - show test pattern */
          <TestPatternPlaceholder width={videoWidth} height={videoHeight} />
        )}
      </div>

      {/* Actions bar */}
      <div style={{
        padding: '8px 10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        {/* Version nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {transition.versionHistory.length > 1 && (
            <>
              <button
                onClick={() => onVersionChange(Math.max(0, transition.selectedVersion - 1))}
                disabled={transition.selectedVersion === 0}
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '4px',
                  border: 'none',
                  background: 'transparent',
                  color: transition.selectedVersion > 0 ? COLORS.textSecondary : COLORS.textMuted,
                  cursor: transition.selectedVersion > 0 ? 'pointer' : 'default',
                  fontSize: '10px',
                  padding: 0
                }}
              >
                &#8249;
              </button>
              <span style={{ fontSize: '9px', color: COLORS.textMuted }}>
                v{transition.selectedVersion + 1}/{transition.versionHistory.length}
              </span>
              <button
                onClick={() => onVersionChange(Math.min(transition.versionHistory.length - 1, transition.selectedVersion + 1))}
                disabled={transition.selectedVersion >= transition.versionHistory.length - 1}
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '4px',
                  border: 'none',
                  background: 'transparent',
                  color: transition.selectedVersion < transition.versionHistory.length - 1 ? COLORS.textSecondary : COLORS.textMuted,
                  cursor: transition.selectedVersion < transition.versionHistory.length - 1 ? 'pointer' : 'default',
                  fontSize: '10px',
                  padding: 0
                }}
              >
                &#8250;
              </button>
            </>
          )}
        </div>

        {/* Regenerate */}
        {(transition.status === 'ready' || transition.status === 'failed') && (
          <button
            onClick={onRegenerate}
            title="Regenerate"
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: 'none',
              background: COLORS.surfaceLight,
              color: COLORS.textSecondary,
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '500',
              fontFamily: 'inherit'
            }}
          >
            &#8635; Redo
          </button>
        )}
      </div>
    </div>
  );
};

export default Camera360TransitionReviewStep;
