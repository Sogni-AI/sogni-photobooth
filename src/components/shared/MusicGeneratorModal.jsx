import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { getTokenLabel } from '../../services/walletService';
import { AUDIO_MODEL_ID_TURBO, AUDIO_MODELS, AUDIO_CONSTRAINTS, AUDIO_DEFAULTS } from '../../constants/audioSettings';
import { useAudioCostEstimation } from '../../hooks/useAudioCostEstimation';
import { useAudioModelConfig } from '../../hooks/useAudioModelConfig';
import aceStepDemos from '../../constants/ace-step-demos.json';

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * MusicGeneratorModal
 * Standalone modal for AI music generation using the Sogni SDK.
 * Extracted from SoundToVideoPopup to separate concerns.
 */
const MusicGeneratorModal = ({
  visible,
  onClose,
  onTrackSelect,
  sogniClient = null,
  isAuthenticated = false,
  tokenType = 'spark',
  zIndex = 10001
}) => {
  // Music generation state
  const [selectedModelId, setSelectedModelId] = useState(AUDIO_MODEL_ID_TURBO);
  const [musicPrompt, setMusicPrompt] = useState('');
  const [musicDuration, setMusicDuration] = useState(AUDIO_DEFAULTS.duration);
  const [musicBpm, setMusicBpm] = useState(AUDIO_DEFAULTS.bpm);
  const [musicKeyscale, setMusicKeyscale] = useState(AUDIO_DEFAULTS.keyscale);
  const [musicTimesig, setMusicTimesig] = useState(AUDIO_DEFAULTS.timesig);
  const [musicLyricsEnabled, setMusicLyricsEnabled] = useState(false);
  const [musicLyrics, setMusicLyrics] = useState('');
  const [musicLanguage, setMusicLanguage] = useState(AUDIO_DEFAULTS.language);
  const [musicVersionCount, setMusicVersionCount] = useState(1);
  const [showMusicAdvanced, setShowMusicAdvanced] = useState(false);
  const [musicSteps, setMusicSteps] = useState(AUDIO_DEFAULTS.steps);
  const [musicComposerMode, setMusicComposerMode] = useState(AUDIO_DEFAULTS.composerMode);
  const [musicPromptStrength, setMusicPromptStrength] = useState(AUDIO_DEFAULTS.promptStrength);
  const [musicCreativity, setMusicCreativity] = useState(AUDIO_DEFAULTS.creativity);
  const [musicGenerating, setMusicGenerating] = useState(false);
  const [musicProgress, setMusicProgress] = useState({});
  const [musicError, setMusicError] = useState('');
  const [generatedTracks, setGeneratedTracks] = useState([]);
  const [previewingGeneratedTrackId, setPreviewingGeneratedTrackId] = useState(null);
  const [isGeneratedPreviewPlaying, setIsGeneratedPreviewPlaying] = useState(false);
  const [selectedDemoId, setSelectedDemoId] = useState('');

  const generatedPreviewAudioRef = useRef(null);
  const musicProjectRef = useRef(null);
  const musicCleanupRef = useRef(null);

  // Mobile detection
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 768;

  // Fetch audio model config from API (cached per model)
  const { config: audioConfig } = useAudioModelConfig({
    modelId: selectedModelId,
    enabled: visible
  });

  // Merge API config over fallback constraints
  const ac = audioConfig || AUDIO_CONSTRAINTS;

  // Keep a ref so callbacks always read the latest config (avoids stale closures)
  const acRef = useRef(ac);
  acRef.current = ac;

  // When model config changes, clamp user values to valid ranges for the new model
  useEffect(() => {
    if (!audioConfig) return;

    // Clamp numeric values to new model's valid range, reset to default if out of range
    if (audioConfig.steps) {
      setMusicSteps(prev => {
        if (prev < audioConfig.steps.min || prev > audioConfig.steps.max) {
          return audioConfig.steps.default;
        }
        return prev;
      });
    }
    if (audioConfig.duration) {
      setMusicDuration(prev => {
        if (prev < audioConfig.duration.min || prev > audioConfig.duration.max) {
          return audioConfig.duration.default;
        }
        return prev;
      });
    }
    if (audioConfig.bpm) {
      setMusicBpm(prev => {
        if (prev < audioConfig.bpm.min || prev > audioConfig.bpm.max) {
          return audioConfig.bpm.default;
        }
        return prev;
      });
    }
    if (audioConfig.promptStrength) {
      setMusicPromptStrength(prev => {
        if (prev < audioConfig.promptStrength.min || prev > audioConfig.promptStrength.max) {
          return audioConfig.promptStrength.default;
        }
        return prev;
      });
    }
    if (audioConfig.creativity) {
      setMusicCreativity(prev => {
        if (prev < audioConfig.creativity.min || prev > audioConfig.creativity.max) {
          return audioConfig.creativity.default;
        }
        return prev;
      });
    }
    if (audioConfig.keyscale?.allowed) {
      setMusicKeyscale(prev =>
        audioConfig.keyscale.allowed.includes(prev) ? prev : audioConfig.keyscale.default
      );
    }
    if (audioConfig.timesignature?.allowed) {
      setMusicTimesig(prev =>
        audioConfig.timesignature.allowed.includes(prev) ? prev : audioConfig.timesignature.default
      );
    }
    if (audioConfig.language?.allowed) {
      setMusicLanguage(prev =>
        audioConfig.language.allowed.includes(prev) ? prev : audioConfig.language.default
      );
    }
  }, [selectedModelId, audioConfig]);

  // Audio generation cost estimation
  const { loading: musicCostLoading, cost: musicCostRaw } = useAudioCostEstimation({
    modelId: selectedModelId,
    duration: musicDuration,
    steps: musicSteps,
    audioCount: musicVersionCount,
    enabled: isAuthenticated && visible && !musicGenerating
  });

  // --- Preview Handlers ---

  const stopGeneratedTrackPreview = useCallback(() => {
    if (generatedPreviewAudioRef.current) {
      generatedPreviewAudioRef.current.pause();
      generatedPreviewAudioRef.current.currentTime = 0;
    }
    setPreviewingGeneratedTrackId(null);
    setIsGeneratedPreviewPlaying(false);
  }, []);

  const handleGeneratedPreviewToggle = useCallback((track) => {
    const audio = generatedPreviewAudioRef.current;
    if (!audio) return;

    if (previewingGeneratedTrackId === track.id) {
      if (isGeneratedPreviewPlaying) {
        audio.pause();
        setIsGeneratedPreviewPlaying(false);
      } else {
        audio.play().catch(() => setIsGeneratedPreviewPlaying(false));
        setIsGeneratedPreviewPlaying(true);
      }
    } else {
      audio.pause();
      audio.src = track.url;
      audio.load();
      audio.play().catch(() => setIsGeneratedPreviewPlaying(false));
      setPreviewingGeneratedTrackId(track.id);
      setIsGeneratedPreviewPlaying(true);
    }
  }, [previewingGeneratedTrackId, isGeneratedPreviewPlaying]);

  // --- Track Selection ---

  const handleUseTrack = useCallback((track) => {
    stopGeneratedTrackPreview();
    onTrackSelect(track);
  }, [stopGeneratedTrackPreview, onTrackSelect]);

  // --- Download Handler (XHR blob pattern) ---

  const handleDownloadTrack = useCallback((track, idx) => {
    // Build a descriptive filename matching the pattern used by image/video downloads
    // Format: sogni-photobooth-music-{prompt}-{duration}s-{bpm}bpm-v{N}.mp3
    const cleanPrompt = musicPrompt.trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 40)
      .replace(/-+$/, '');
    const promptPart = cleanPrompt || 'untitled';
    const modelLabel = AUDIO_MODELS.find(m => m.id === selectedModelId)?.label?.toLowerCase().replace(/\s+/g, '-') || selectedModelId;
    const filename = `sogni-photobooth-music-${promptPart}-${musicDuration}s-${musicBpm}bpm-${modelLabel}-v${idx + 1}.mp3`;

    const xhr = new XMLHttpRequest();
    xhr.open('GET', track.url, true);
    xhr.responseType = 'blob';

    xhr.onload = function() {
      if (xhr.status === 200) {
        const blobUrl = window.URL.createObjectURL(xhr.response);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      } else {
        const link = document.createElement('a');
        link.href = track.url;
        link.download = filename;
        link.click();
      }
    };

    xhr.onerror = function() {
      const link = document.createElement('a');
      link.href = track.url;
      link.download = filename;
      link.click();
    };

    xhr.send();
  }, [musicPrompt, musicDuration, musicBpm, selectedModelId]);

  // --- Demo Sample Picker ---

  const applyDemo = useCallback((demo) => {
    setSelectedDemoId(demo.id);
    setMusicPrompt(demo.positivePrompt);
    setMusicBpm(demo.bpm);
    setMusicDuration(demo.duration);
    setMusicKeyscale(demo.keyscale);
    setMusicTimesig(demo.timesignature);
    if (demo.lyrics && demo.lyrics !== '[instrumental]') {
      setMusicLyricsEnabled(true);
      setMusicLyrics(demo.lyrics);
      setMusicLanguage(demo.language);
    } else {
      setMusicLyricsEnabled(false);
      setMusicLyrics('');
    }
  }, []);

  const handleDemoSelect = useCallback((e) => {
    const value = e.target.value;
    if (value === 'random') {
      applyDemo(aceStepDemos[Math.floor(Math.random() * aceStepDemos.length)]);
    } else if (value) {
      const demo = aceStepDemos.find(d => d.id === value);
      if (demo) applyDemo(demo);
    }
  }, [applyDemo]);

  // --- Music Generation ---

  const handleMusicGenerate = useCallback(async () => {
    if (!musicPrompt.trim()) {
      setMusicError('Please describe the music style you want to create');
      return;
    }
    if (!sogniClient) {
      setMusicError('SDK not available. Please sign in first.');
      return;
    }

    setMusicGenerating(true);
    setMusicError('');
    setMusicProgress({});

    try {
      // Read latest config from ref to avoid stale closure values
      const currentAc = acRef.current;
      const projectParams = {
        type: 'audio',
        modelId: selectedModelId,
        positivePrompt: musicPrompt.trim(),
        numberOfMedia: musicVersionCount,
        steps: musicSteps,
        duration: musicDuration,
        bpm: musicBpm,
        keyscale: musicKeyscale,
        timesignature: musicTimesig,
        language: musicLanguage,
        composerMode: musicComposerMode,
        promptStrength: musicPromptStrength,
        creativity: musicCreativity,
        sampler: currentAc.comfySampler?.default || 'euler',
        scheduler: currentAc.comfyScheduler?.default || 'simple',
        outputFormat: currentAc.outputFormat?.default || 'mp3',
        tokenType,
      };

      if (musicLyricsEnabled && musicLyrics.trim()) {
        projectParams.lyrics = musicLyrics.trim();
      }

      const project = await sogniClient.projects.create(projectParams);
      musicProjectRef.current = project;

      const expectedCount = musicVersionCount;
      const completedResults = [];
      let failedCount = 0;
      let finalized = false;

      // Cleanup helper — unsubscribe all listeners
      const cleanup = () => {
        sogniClient.projects.off('job', jobEventHandler);
        sogniClient.projects.off('project', projectEventHandler);
        musicProjectRef.current = null;
        musicCleanupRef.current = null;
      };

      // Finalize generation — show results and reset state
      const finalize = (errorMsg) => {
        if (finalized) return;
        finalized = true;
        cleanup();
        if (completedResults.length > 0) {
          setGeneratedTracks(completedResults);
        }
        if (errorMsg) {
          setMusicError(errorMsg);
        }
        setMusicGenerating(false);
      };

      // Only finalize when ALL jobs have resolved (completed or errored).
      // The project 'completed' event fires BEFORE job result URLs are fetched
      // (SDK handleJobState is sync, handleJobResult is async), so we cannot
      // rely on project completion — we must count individual job outcomes.
      const tryFinalize = () => {
        const resolvedCount = completedResults.length + failedCount;
        if (resolvedCount >= expectedCount) {
          finalize(completedResults.length === 0 ? 'Music generation failed' : null);
        }
      };

      // Job event handler — matches SDK event types from ProjectsApi
      const jobEventHandler = (event) => {
        if (event.projectId !== project.id) return;
        const jobId = event.jobId;

        switch (event.type) {
          case 'initiating':
          case 'started':
            // Initialize progress entry so UI shows "Starting..." for this job
            setMusicProgress(prev => {
              if (prev[jobId] && !event.workerName) return prev;
              return { ...prev, [jobId]: { ...prev[jobId], ...(event.workerName ? { workerName: event.workerName } : {}) } };
            });
            break;
          case 'progress':
            if (event.step !== undefined) {
              setMusicProgress(prev => ({
                ...prev,
                [jobId]: { ...prev[jobId], step: event.step, stepCount: event.stepCount, ...(event.workerName ? { workerName: event.workerName } : {}) }
              }));
            }
            break;
          case 'jobETA': {
            const eta = event.etaSeconds;
            if (eta !== undefined) {
              setMusicProgress(prev => ({
                ...prev,
                [jobId]: { ...prev[jobId], eta }
              }));
            }
            break;
          }
          case 'completed':
            if (event.resultUrl) {
              completedResults.push({
                id: jobId,
                url: event.resultUrl,
                seed: event.seed,
                index: completedResults.length
              });
            } else {
              // Completed without a result URL — count as failed
              failedCount++;
            }
            tryFinalize();
            break;
          case 'error':
            failedCount++;
            console.error('[MusicGenerate] Job error:', event.error?.message || event.error || 'Unknown error');
            tryFinalize();
            break;
        }
      };

      // Project event handler — only handles hard errors.
      // We do NOT finalize on project 'completed' because job result URLs
      // are fetched asynchronously and arrive AFTER project completion.
      const projectEventHandler = (event) => {
        if (event.projectId !== project.id) return;

        switch (event.type) {
          case 'error':
            finalize(event.error?.message || 'Music generation failed');
            break;
        }
      };

      sogniClient.projects.on('job', jobEventHandler);
      sogniClient.projects.on('project', projectEventHandler);

      // Store cleanup so cancel handler can unsubscribe
      musicCleanupRef.current = cleanup;

    } catch (err) {
      console.error('[MusicGenerate] Error:', err);
      setMusicError(err.message || 'Failed to start music generation');
      setMusicGenerating(false);
      musicProjectRef.current = null;
    }
  }, [musicPrompt, sogniClient, selectedModelId, musicVersionCount, musicSteps, musicDuration, musicBpm, musicKeyscale, musicTimesig, musicLanguage, musicComposerMode, musicPromptStrength, musicCreativity, musicLyricsEnabled, musicLyrics, tokenType]);

  const handleCancelMusicGeneration = useCallback(() => {
    if (musicProjectRef.current) {
      try { musicProjectRef.current.cancel(); } catch (e) { /* ignore */ }
    }
    // Unsubscribe event listeners to prevent stale handlers
    if (musicCleanupRef.current) {
      musicCleanupRef.current();
    } else {
      musicProjectRef.current = null;
    }
    setMusicGenerating(false);
    setMusicProgress({});
  }, []);

  // --- Close Handler ---

  const handleClose = useCallback(() => {
    // Pause any preview
    stopGeneratedTrackPreview();
    // Cancel in-progress generation
    if (musicProjectRef.current) {
      try { musicProjectRef.current.cancel(); } catch (e) { /* ignore */ }
    }
    if (musicCleanupRef.current) {
      musicCleanupRef.current();
    } else {
      musicProjectRef.current = null;
    }
    setMusicGenerating(false);
    setMusicProgress({});
    // Do NOT reset generatedTracks — they cost Spark to generate and should persist
    onClose();
  }, [stopGeneratedTrackPreview, onClose]);

  if (!visible) return null;

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
        zIndex,
        padding: isMobile ? '10px' : '20px',
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.2s ease',
        overflowY: 'auto'
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
          borderRadius: isMobile ? '16px' : '20px',
          padding: isMobile ? '16px' : '24px',
          maxWidth: isMobile ? '500px' : '600px',
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
        <audio
          ref={generatedPreviewAudioRef}
          onEnded={() => { setPreviewingGeneratedTrackId(null); setIsGeneratedPreviewPlaying(false); }}
          onError={() => { setPreviewingGeneratedTrackId(null); setIsGeneratedPreviewPlaying(false); }}
          style={{ display: 'none' }}
        />

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
        <div style={{ marginBottom: '16px', textAlign: 'center' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '4px'
          }}>
            <span style={{ fontSize: isMobile ? '28px' : '32px' }}>✨</span>
            <h2 style={{
              margin: 0,
              color: 'white',
              fontSize: isMobile ? '20px' : '24px',
              fontWeight: '700',
              fontFamily: '"Permanent Marker", cursive'
            }}>
              Create AI Music
            </h2>
          </div>
          <p style={{
            margin: 0,
            color: 'rgba(255, 255, 255, 0.7)',
            fontSize: isMobile ? '11px' : '12px'
          }}>
            Generate custom music tracks with AI
          </p>
        </div>

        {!isAuthenticated ? (
          <div style={{
            textAlign: 'center',
            padding: '24px 16px',
            color: 'rgba(255, 255, 255, 0.7)',
            fontSize: '14px'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔒</div>
            <div style={{ fontWeight: '600', color: 'white', marginBottom: '4px' }}>Sign in to create AI music</div>
            <div style={{ fontSize: '12px' }}>Log in with your Sogni account to generate custom music tracks</div>
          </div>
        ) : (
          <>
            {/* Model Selector */}
            {!musicGenerating && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{
                  display: 'flex',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  background: 'rgba(0, 0, 0, 0.2)'
                }}>
                  {AUDIO_MODELS.map((model) => {
                    const isSelected = selectedModelId === model.id;
                    return (
                      <button
                        key={model.id}
                        onClick={() => setSelectedModelId(model.id)}
                        style={{
                          flex: 1,
                          padding: isMobile ? '8px 6px' : '8px 12px',
                          border: 'none',
                          background: isSelected
                            ? 'rgba(255, 255, 255, 0.9)'
                            : 'transparent',
                          color: isSelected ? '#db2777' : 'rgba(255, 255, 255, 0.7)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '2px'
                        }}
                      >
                        <span style={{
                          fontSize: '12px',
                          fontWeight: '700'
                        }}>
                          {model.label}
                        </span>
                        <span style={{
                          fontSize: '9px',
                          fontWeight: '400',
                          opacity: isSelected ? 0.7 : 0.5
                        }}>
                          {model.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Generated Tracks List */}
            {generatedTracks.length > 0 && (
              <div style={{
                marginBottom: '12px',
                background: 'rgba(0, 0, 0, 0.15)',
                borderRadius: '8px',
                overflow: 'hidden'
              }}>
                <div style={{
                  padding: '8px 12px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: 'rgba(255, 255, 255, 0.7)',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  Generated Tracks
                </div>
                {generatedTracks.map((track, idx) => {
                  const isPreviewing = previewingGeneratedTrackId === track.id;
                  return (
                    <div
                      key={track.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 12px',
                        background: 'transparent',
                        borderLeft: '3px solid transparent',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <button
                        onClick={() => handleGeneratedPreviewToggle(track)}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          border: 'none',
                          background: isPreviewing && isGeneratedPreviewPlaying
                            ? '#ec4899'
                            : 'rgba(255, 255, 255, 0.15)',
                          color: 'white',
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          padding: 0
                        }}
                      >
                        {isPreviewing && isGeneratedPreviewPlaying ? '⏸' : '▶'}
                      </button>
                      <span style={{
                        flex: 1,
                        color: 'white',
                        fontSize: '13px',
                        fontWeight: '500'
                      }}>
                        Version {idx + 1}
                      </span>
                      <span style={{
                        color: 'rgba(255, 255, 255, 0.5)',
                        fontSize: '11px',
                        flexShrink: 0
                      }}>
                        {formatTime(musicDuration)}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadTrack(track, idx);
                        }}
                        title="Download track"
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '50%',
                          border: 'none',
                          background: 'rgba(255, 255, 255, 0.1)',
                          color: 'rgba(255, 255, 255, 0.7)',
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          padding: 0
                        }}
                      >
                        ↓
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUseTrack(track);
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: '1px solid rgba(255, 255, 255, 0.3)',
                          background: 'rgba(255, 255, 255, 0.1)',
                          color: 'white',
                          fontSize: '10px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          flexShrink: 0,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        Use
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Progress View */}
            {musicGenerating ? (
              <div style={{ padding: '12px 0' }}>
                <div style={{
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '600',
                  marginBottom: '12px',
                  textAlign: 'center'
                }}>
                  Generating Music...
                </div>
                {Object.entries(musicProgress).length > 0 ? (
                  Object.entries(musicProgress).map(([jobId, progress], idx) => (
                    <div key={jobId} style={{ marginBottom: '8px' }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '11px',
                        color: 'rgba(255, 255, 255, 0.7)',
                        marginBottom: '4px'
                      }}>
                        <span>
                          Version {idx + 1}
                          {progress.workerName && (
                            <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontWeight: '400' }}>
                              {' • '}{progress.workerName}
                            </span>
                          )}
                        </span>
                        <span>
                          {progress.step !== undefined && progress.stepCount
                            ? `Step ${progress.step}/${progress.stepCount} (${Math.round((progress.step / progress.stepCount) * 100)}%)`
                            : 'Starting...'}
                          {progress.eta !== undefined && ` • ETA: ~${Math.round(progress.eta)}s`}
                        </span>
                      </div>
                      <div style={{
                        height: '6px',
                        background: 'rgba(0, 0, 0, 0.3)',
                        borderRadius: '3px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          height: '100%',
                          background: 'linear-gradient(90deg, #ec4899, #f472b6)',
                          borderRadius: '3px',
                          width: progress.step !== undefined && progress.stepCount
                            ? `${(progress.step / progress.stepCount) * 100}%`
                            : '0%',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{
                    textAlign: 'center',
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontSize: '12px',
                    padding: '8px 0'
                  }}>
                    Waiting for worker...
                  </div>
                )}
                <button
                  onClick={handleCancelMusicGeneration}
                  style={{
                    display: 'block',
                    margin: '12px auto 0',
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    background: 'rgba(239, 68, 68, 0.2)',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancel Generation
                </button>
              </div>
            ) : (
              /* Generation Form */
              <div>
                {/* Song Style Prompt */}
                <div style={{ marginBottom: '10px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '4px'
                  }}>
                    <label style={{
                      color: 'rgba(255, 255, 255, 0.9)',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}>
                      Song Style
                    </label>
                    <select
                      value={selectedDemoId}
                      onChange={handleDemoSelect}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        border: '1px solid rgba(255, 255, 255, 0.25)',
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: 'rgba(255, 255, 255, 0.8)',
                        fontSize: '9px',
                        fontWeight: '400',
                        cursor: 'pointer',
                        outline: 'none',
                        maxWidth: isMobile ? '170px' : '240px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <option value="" disabled>Samples...</option>
                      <option value="random">🎲 Random</option>
                      {aceStepDemos.map(demo => (
                        <option key={demo.id} value={demo.id}>{demo.title}</option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    value={musicPrompt}
                    onChange={(e) => setMusicPrompt(e.target.value)}
                    placeholder="e.g. upbeat electronic dance music with heavy bass..."
                    rows={2}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      background: 'rgba(0, 0, 0, 0.2)',
                      color: 'white',
                      fontSize: '12px',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Duration Slider */}
                <div style={{ marginBottom: '10px' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '4px'
                  }}>
                    <label style={{
                      color: 'rgba(255, 255, 255, 0.9)',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}>
                      Duration
                    </label>
                    <span style={{
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: '600',
                      fontVariantNumeric: 'tabular-nums'
                    }}>
                      {Math.floor(musicDuration / 60)}:{(musicDuration % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={ac.duration.min}
                    max={ac.duration.max}
                    step={1}
                    value={musicDuration}
                    onChange={(e) => setMusicDuration(parseInt(e.target.value, 10))}
                    style={{
                      width: '100%',
                      height: '4px',
                      borderRadius: '2px',
                      background: `linear-gradient(to right, #ec4899 ${((musicDuration - ac.duration.min) / (ac.duration.max - ac.duration.min)) * 100}%, rgba(255,255,255,0.2) ${((musicDuration - ac.duration.min) / (ac.duration.max - ac.duration.min)) * 100}%)`,
                      outline: 'none',
                      WebkitAppearance: 'none',
                      cursor: 'pointer'
                    }}
                  />
                  {ac.duration?.description && (
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', marginTop: '3px' }}>
                      {ac.duration.description}
                    </div>
                  )}
                </div>

                {/* BPM Slider */}
                <div style={{ marginBottom: '10px' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '4px'
                  }}>
                    <label style={{
                      color: 'rgba(255, 255, 255, 0.9)',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}>
                      BPM
                    </label>
                    <span style={{
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}>
                      {musicBpm}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={ac.bpm.min}
                    max={ac.bpm.max}
                    step={1}
                    value={musicBpm}
                    onChange={(e) => setMusicBpm(parseInt(e.target.value, 10))}
                    style={{
                      width: '100%',
                      height: '4px',
                      borderRadius: '2px',
                      background: `linear-gradient(to right, #ec4899 ${((musicBpm - ac.bpm.min) / (ac.bpm.max - ac.bpm.min)) * 100}%, rgba(255,255,255,0.2) ${((musicBpm - ac.bpm.min) / (ac.bpm.max - ac.bpm.min)) * 100}%)`,
                      outline: 'none',
                      WebkitAppearance: 'none',
                      cursor: 'pointer'
                    }}
                  />
                  {ac.bpm?.description && (
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', marginTop: '3px' }}>
                      {ac.bpm.description}
                    </div>
                  )}
                </div>

                {/* Include Lyrics Toggle */}
                <div style={{ marginBottom: musicLyricsEnabled ? '4px' : '10px' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={musicLyricsEnabled}
                      onChange={(e) => setMusicLyricsEnabled(e.target.checked)}
                      style={{
                        width: '14px',
                        height: '14px',
                        accentColor: '#ec4899',
                        cursor: 'pointer'
                      }}
                    />
                    <span style={{
                      color: 'rgba(255, 255, 255, 0.9)',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}>
                      Include Lyrics
                    </span>
                  </label>
                </div>

                {/* Lyrics section (shown when enabled) */}
                {musicLyricsEnabled && (
                  <div style={{ marginBottom: '10px', paddingLeft: '22px' }}>
                    <div style={{ marginBottom: '6px' }}>
                      <label style={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '10px',
                        fontWeight: '600',
                        marginRight: '8px'
                      }}>
                        Language
                      </label>
                      <select
                        value={musicLanguage}
                        onChange={(e) => setMusicLanguage(e.target.value)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          background: 'rgba(0, 0, 0, 0.3)',
                          color: 'white',
                          fontSize: '11px',
                          outline: 'none'
                        }}
                      >
                        {ac.language.allowed.filter(lang => lang !== 'unknown').map(lang => (
                          <option key={lang} value={lang}>{ac.language?.labels?.[lang] || lang}</option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      value={musicLyrics}
                      onChange={(e) => setMusicLyrics(e.target.value)}
                      placeholder="Enter your lyrics here..."
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        background: 'rgba(0, 0, 0, 0.2)',
                        color: 'white',
                        fontSize: '11px',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                )}

                {/* Versions selector */}
                <div style={{ marginBottom: '10px' }}>
                  <label style={{
                    display: 'block',
                    color: 'rgba(255, 255, 255, 0.9)',
                    fontSize: '11px',
                    fontWeight: '600',
                    marginBottom: '6px'
                  }}>
                    Versions
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[1, 2, 3, 4].map(n => (
                      <button
                        key={n}
                        onClick={() => setMusicVersionCount(n)}
                        style={{
                          width: '36px',
                          height: '30px',
                          borderRadius: '6px',
                          border: 'none',
                          background: musicVersionCount === n
                            ? 'rgba(255, 255, 255, 0.9)'
                            : 'rgba(255, 255, 255, 0.12)',
                          color: musicVersionCount === n ? '#db2777' : 'white',
                          fontSize: '13px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Advanced Options */}
                <div>
                  <button
                    onClick={() => setShowMusicAdvanced(!showMusicAdvanced)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'none',
                      border: 'none',
                      color: 'rgba(255, 255, 255, 0.6)',
                      fontSize: '11px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      padding: '4px 0',
                      marginBottom: showMusicAdvanced ? '8px' : '10px'
                    }}
                  >
                    <span style={{
                      fontSize: '8px',
                      transition: 'transform 0.2s ease',
                      transform: showMusicAdvanced ? 'rotate(90deg)' : 'rotate(0deg)'
                    }}>▶</span>
                    Advanced Options
                  </button>

                  {showMusicAdvanced && (
                    <div style={{
                      background: 'rgba(0, 0, 0, 0.15)',
                      borderRadius: '8px',
                      padding: '10px',
                      marginBottom: '10px',
                      display: 'grid',
                      gap: '8px'
                    }}>
                      {/* Musical Key */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <label style={{
                          color: 'rgba(255, 255, 255, 0.7)',
                          fontSize: '11px',
                          fontWeight: '500'
                        }}>
                          Musical Key
                        </label>
                        <select
                          value={musicKeyscale}
                          onChange={(e) => setMusicKeyscale(e.target.value)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            background: 'rgba(0, 0, 0, 0.3)',
                            color: 'white',
                            fontSize: '11px',
                            outline: 'none',
                            maxWidth: '140px'
                          }}
                        >
                          {ac.keyscale.allowed.map(key => (
                            <option key={key} value={key}>{key}</option>
                          ))}
                        </select>
                      </div>

                      {/* Time Signature */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <label style={{
                          color: 'rgba(255, 255, 255, 0.7)',
                          fontSize: '11px',
                          fontWeight: '500'
                        }}>
                          Time Signature
                        </label>
                        <select
                          value={musicTimesig}
                          onChange={(e) => setMusicTimesig(e.target.value)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            background: 'rgba(0, 0, 0, 0.3)',
                            color: 'white',
                            fontSize: '11px',
                            outline: 'none',
                            maxWidth: '180px'
                          }}
                        >
                          {ac.timesignature.allowed.map(ts => (
                            <option key={ts} value={ts}>{ac.timesignature?.labels?.[ts] || ts}</option>
                          ))}
                        </select>
                      </div>

                      {/* Steps */}
                      <div>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: '2px'
                        }}>
                          <label style={{
                            color: 'rgba(255, 255, 255, 0.7)',
                            fontSize: '11px',
                            fontWeight: '500'
                          }}>
                            Steps
                          </label>
                          <span style={{
                            color: 'white',
                            fontSize: '11px',
                            fontWeight: '600'
                          }}>
                            {musicSteps}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={ac.steps.min}
                          max={ac.steps.max}
                          step={1}
                          value={musicSteps}
                          onChange={(e) => setMusicSteps(parseInt(e.target.value, 10))}
                          style={{
                            width: '100%',
                            height: '3px',
                            borderRadius: '2px',
                            background: `linear-gradient(to right, #ec4899 ${((musicSteps - ac.steps.min) / (ac.steps.max - ac.steps.min)) * 100}%, rgba(255,255,255,0.2) ${((musicSteps - ac.steps.min) / (ac.steps.max - ac.steps.min)) * 100}%)`,
                            outline: 'none',
                            WebkitAppearance: 'none',
                            cursor: 'pointer'
                          }}
                        />
                      </div>

                      {/* Composer Mode */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <label style={{
                          color: 'rgba(255, 255, 255, 0.7)',
                          fontSize: '11px',
                          fontWeight: '500'
                        }}>
                          AI Composer
                        </label>
                        <label style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          cursor: 'pointer'
                        }}>
                          <input
                            type="checkbox"
                            checked={musicComposerMode}
                            onChange={(e) => setMusicComposerMode(e.target.checked)}
                            style={{
                              width: '14px',
                              height: '14px',
                              accentColor: '#ec4899',
                              cursor: 'pointer'
                            }}
                          />
                          <span style={{
                            color: 'rgba(255, 255, 255, 0.6)',
                            fontSize: '10px'
                          }}>
                            {musicComposerMode ? 'On' : 'Off'}
                          </span>
                        </label>
                      </div>

                      {/* Prompt Strength */}
                      <div>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: '2px'
                        }}>
                          <label style={{
                            color: 'rgba(255, 255, 255, 0.7)',
                            fontSize: '11px',
                            fontWeight: '500'
                          }}>
                            Prompt Strength
                          </label>
                          <span style={{
                            color: 'white',
                            fontSize: '11px',
                            fontWeight: '600'
                          }}>
                            {musicPromptStrength.toFixed(1)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={ac.promptStrength.min}
                          max={ac.promptStrength.max}
                          step={0.1}
                          value={musicPromptStrength}
                          onChange={(e) => setMusicPromptStrength(parseFloat(e.target.value))}
                          style={{
                            width: '100%',
                            height: '3px',
                            borderRadius: '2px',
                            background: `linear-gradient(to right, #ec4899 ${(musicPromptStrength / ac.promptStrength.max) * 100}%, rgba(255,255,255,0.2) ${(musicPromptStrength / ac.promptStrength.max) * 100}%)`,
                            outline: 'none',
                            WebkitAppearance: 'none',
                            cursor: 'pointer'
                          }}
                        />
                      </div>

                      {/* Creativity */}
                      <div>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: '2px'
                        }}>
                          <label style={{
                            color: 'rgba(255, 255, 255, 0.7)',
                            fontSize: '11px',
                            fontWeight: '500'
                          }}>
                            Creativity
                          </label>
                          <span style={{
                            color: 'white',
                            fontSize: '11px',
                            fontWeight: '600'
                          }}>
                            {musicCreativity.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={ac.creativity.min}
                          max={ac.creativity.max}
                          step={0.05}
                          value={musicCreativity}
                          onChange={(e) => setMusicCreativity(parseFloat(e.target.value))}
                          style={{
                            width: '100%',
                            height: '3px',
                            borderRadius: '2px',
                            background: `linear-gradient(to right, #ec4899 ${(musicCreativity / ac.creativity.max) * 100}%, rgba(255,255,255,0.2) ${(musicCreativity / ac.creativity.max) * 100}%)`,
                            outline: 'none',
                            WebkitAppearance: 'none',
                            cursor: 'pointer'
                          }}
                        />
                        {ac.creativity?.description && (
                          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '9px', marginTop: '2px' }}>
                            {ac.creativity.description}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Music Error */}
                {musicError && (
                  <div style={{
                    padding: '8px 10px',
                    background: 'rgba(239, 68, 68, 0.3)',
                    borderRadius: '6px',
                    marginBottom: '10px',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: '500',
                    textAlign: 'center'
                  }}>
                    ⚠️ {musicError}
                  </div>
                )}

                {/* Generate Button + Cost */}
                <button
                  onClick={handleMusicGenerate}
                  disabled={!musicPrompt.trim() || musicCostLoading}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: !musicPrompt.trim()
                      ? 'rgba(255, 255, 255, 0.2)'
                      : 'rgba(255, 255, 255, 0.9)',
                    color: !musicPrompt.trim()
                      ? 'rgba(255, 255, 255, 0.5)'
                      : '#db2777',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: !musicPrompt.trim() ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <span>✨ Generate Music</span>
                  {musicCostRaw !== null && (
                    <span style={{
                      fontSize: '11px',
                      fontWeight: '500',
                      opacity: 0.8
                    }}>
                      ({musicCostRaw.toFixed(2)} {getTokenLabel(tokenType)})
                    </span>
                  )}
                </button>
              </div>
            )}
          </>
        )}
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
      `}</style>
    </div>,
    document.body
  );
};

MusicGeneratorModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onTrackSelect: PropTypes.func.isRequired,
  sogniClient: PropTypes.object,
  isAuthenticated: PropTypes.bool,
  tokenType: PropTypes.oneOf(['spark', 'sogni']),
  zIndex: PropTypes.number
};

export default MusicGeneratorModal;
