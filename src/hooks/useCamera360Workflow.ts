/**
 * useCamera360Workflow Hook
 *
 * Manages all state and actions for the 360 Camera workflow:
 * - Phase 1: Configure camera angles (preset selection, slot editing)
 * - Phase 2: Generate & review angles (via MultiAngleGenerator)
 * - Phase 3: Generate & review transitions with inline settings (via Camera360TransitionGenerator)
 * - Phase 4: Stitch final video (via videoConcatenation)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useCallback, useRef } from 'react';
import type {
  Camera360Step,
  Camera360TransitionItem,
  Camera360TransitionSettings
} from '../types/camera360';
import type { AngleSlot, AngleGenerationItem } from '../types/cameraAngle';
import { MULTI_ANGLE_PRESETS } from '../constants/cameraAngleSettings';
import { DEFAULT_360_TRANSITION_SETTINGS } from '../constants/camera360Settings';
import {
  generateMultipleAngles,
  createAngleGenerationItems,
  markItemStarted,
  updateItemProgress,
  markItemComplete,
  markItemFailed,
  resetItemForRegeneration
} from '../services/MultiAngleGenerator';
import {
  generateMultipleTransitions,
  generateTransition
} from '../services/Camera360TransitionGenerator';
import { concatenateVideos } from '../utils/videoConcatenation';
import { TRANSITION_MUSIC_PRESETS } from '../constants/transitionMusicPresets';
import { getPaymentMethod } from '../services/walletService';
import { enhanceImage } from '../services/ImageEnhancer';

type SogniClient = {
  supportsVideo?: boolean;
  projects: {
    create: (params: Record<string, unknown>) => Promise<any>;
    on: (event: string, handler: (...args: any[]) => void) => void;
    off: (event: string, handler: (...args: any[]) => void) => void;
  };
};

interface UseCamera360WorkflowProps {
  sourceImageUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  sogniClient: SogniClient | null;
  onOutOfCredits?: () => void;
}

// Counter for unique IDs
let idCounter = 0;
function generateId(prefix: string): string {
  return `${prefix}-${++idCounter}-${Date.now()}`;
}

/**
 * Create AngleSlot array from a preset key
 */
function createSlotsFromPreset(presetKey: string): AngleSlot[] {
  const preset = MULTI_ANGLE_PRESETS.find(p => p.key === presetKey);
  if (!preset) return [];
  return preset.angles.map(angle => ({
    id: generateId('slot'),
    azimuth: angle.azimuth,
    elevation: angle.elevation,
    distance: angle.distance,
    isOriginal: angle.isOriginal
  }));
}

/**
 * Build transition items from angle slots (N angles -> N transitions for loop)
 */
function buildTransitions(angles: AngleSlot[]): Camera360TransitionItem[] {
  if (angles.length < 2) return [];

  const transitions: Camera360TransitionItem[] = [];
  for (let i = 0; i < angles.length; i++) {
    const fromIndex = i;
    const toIndex = (i + 1) % angles.length; // Loop back to first
    transitions.push({
      id: generateId('trans'),
      fromIndex,
      toIndex,
      videoUrl: null,
      status: 'pending',
      progress: 0,
      error: null,
      workerName: null,
      versionHistory: [],
      selectedVersion: 0
    });
  }
  return transitions;
}

export function useCamera360Workflow({
  sourceImageUrl,
  sourceWidth,
  sourceHeight,
  sogniClient,
  onOutOfCredits
}: UseCamera360WorkflowProps) {
  // Workflow step
  const [step, setStep] = useState<Camera360Step>('configure-angles');

  // Phase 1: Angle configuration
  const defaultPreset = 'zoom-out-360';
  const [presetKey, setPresetKey] = useState(defaultPreset);
  const [angles, setAngles] = useState<AngleSlot[]>(() => createSlotsFromPreset(defaultPreset));

  // Phase 2: Angle generation
  const [angleItems, setAngleItems] = useState<AngleGenerationItem[]>([]);
  const [isGeneratingAngles, setIsGeneratingAngles] = useState(false);

  // Phase 3: Transition config
  const [transitionSettings, setTransitionSettings] = useState<Camera360TransitionSettings>(
    DEFAULT_360_TRANSITION_SETTINGS
  );

  // Phase 4: Transition generation
  const [transitions, setTransitions] = useState<Camera360TransitionItem[]>([]);
  const [isGeneratingTransitions, setIsGeneratingTransitions] = useState(false);

  // Phase 5: Final video
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [finalVideoBlob, setFinalVideoBlob] = useState<Blob | null>(null);
  const [stitchingProgress, setStitchingProgress] = useState(0);
  const [isStitching, setIsStitching] = useState(false);

  // Enhancement state
  const [isEnhancingAngle, setIsEnhancingAngle] = useState(false);
  const [isEnhancingAll, setIsEnhancingAll] = useState(false);
  const [enhanceAllProgress, setEnhanceAllProgress] = useState({ done: 0, total: 0 });
  const [showEnhancePopup, setShowEnhancePopup] = useState(false);
  const [pendingEnhanceIndex, setPendingEnhanceIndex] = useState<number | null>(null);
  const [isEnhanceAllMode, setIsEnhanceAllMode] = useState(false);

  // Abort ref
  const abortRef = useRef(false);

  // Ref for transitions to avoid stale closure in startTransitionGeneration
  const transitionsRef = useRef(transitions);
  transitionsRef.current = transitions;

  const anyEnhancing = angleItems.some(i => i.enhancing);
  const isGenerating = isGeneratingAngles || isGeneratingTransitions || isStitching || isEnhancingAngle || isEnhancingAll;

  // ---- Phase 1 Actions ----

  const selectPreset = useCallback((key: string) => {
    setPresetKey(key);
    setAngles(createSlotsFromPreset(key));
    // Clear stale angle items when preset changes (new slot IDs won't match old items)
    setAngleItems([]);
  }, []);

  const updateAngle = useCallback((index: number, slot: AngleSlot) => {
    setAngles(prev => prev.map((s, i) => i === index ? slot : s));
  }, []);

  const removeAngle = useCallback((index: number) => {
    setAngles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const addAngle = useCallback(() => {
    setAngles(prev => [
      ...prev,
      {
        id: generateId('slot'),
        azimuth: 'front' as const,
        elevation: 'eye-level' as const,
        distance: 'medium' as const
      }
    ]);
  }, []);

  // ---- Phase 2 Actions ----

  const startAngleGeneration = useCallback(async () => {
    if (!sogniClient || isGeneratingAngles) return;

    abortRef.current = false;
    setIsGeneratingAngles(true);

    // Create initial items
    const items = createAngleGenerationItems(angles, sourceImageUrl);
    setAngleItems(items);
    setStep('review-angles');

    const tokenType = getPaymentMethod();

    try {
      await generateMultipleAngles(sogniClient, {
        angles,
        sourceImageUrl,
        imageWidth: sourceWidth,
        imageHeight: sourceHeight,
        tokenType,
        sourcePhotoId: 'camera360'
      }, {
        onItemStart: (index) => {
          setAngleItems(prev => markItemStarted(prev, index));
        },
        onItemProgress: (index, progress, eta, workerName) => {
          setAngleItems(prev => updateItemProgress(prev, index, progress, eta, workerName));
        },
        onItemComplete: (index, url) => {
          setAngleItems(prev => markItemComplete(prev, index, url));
        },
        onItemError: (index, error) => {
          setAngleItems(prev => markItemFailed(prev, index, error));
        },
        onOutOfCredits: () => {
          onOutOfCredits?.();
        }
      });
    } catch (error) {
      console.error('[360-Workflow] Angle generation error:', error);
    } finally {
      setIsGeneratingAngles(false);
    }
  }, [sogniClient, isGeneratingAngles, angles, sourceImageUrl, sourceWidth, sourceHeight, onOutOfCredits]);

  const regenerateAngle = useCallback(async (index: number) => {
    if (!sogniClient) return;

    // Reset the item
    setAngleItems(prev => resetItemForRegeneration(prev, index));

    // Get the angle slot for this item
    const generatableAngles = angles.filter(s => !s.isOriginal);
    const slot = generatableAngles[index];
    if (!slot) return;

    const tokenType = getPaymentMethod();

    try {
      await generateMultipleAngles(sogniClient, {
        angles: [slot],
        sourceImageUrl,
        imageWidth: sourceWidth,
        imageHeight: sourceHeight,
        tokenType,
        sourcePhotoId: 'camera360-regen'
      }, {
        onItemStart: () => {
          setAngleItems(prev => markItemStarted(prev, index));
        },
        onItemProgress: (_, progress, eta, workerName) => {
          setAngleItems(prev => updateItemProgress(prev, index, progress, eta, workerName));
        },
        onItemComplete: (_, url) => {
          setAngleItems(prev => markItemComplete(prev, index, url));
        },
        onItemError: (_, error) => {
          setAngleItems(prev => markItemFailed(prev, index, error));
        },
        onOutOfCredits: () => {
          onOutOfCredits?.();
        }
      });
    } catch (error) {
      console.error('[360-Workflow] Angle regeneration error:', error);
      setAngleItems(prev => markItemFailed(prev, index, 'Regeneration failed'));
    }
  }, [sogniClient, angles, sourceImageUrl, sourceWidth, sourceHeight, onOutOfCredits]);

  const selectAngleVersion = useCallback((index: number, version: number) => {
    setAngleItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const url = item.versionHistory[version];
      return {
        ...item,
        selectedVersion: version,
        resultUrl: url || item.resultUrl
      };
    }));
  }, []);

  // ---- Phase 2b: Enhancement Actions ----

  const openEnhancePopup = useCallback((index: number) => {
    setPendingEnhanceIndex(index);
    setIsEnhanceAllMode(false);
    setShowEnhancePopup(true);
  }, []);

  const openEnhanceAllPopup = useCallback(() => {
    setPendingEnhanceIndex(null);
    setIsEnhanceAllMode(true);
    setShowEnhancePopup(true);
  }, []);

  const closeEnhancePopup = useCallback(() => {
    setShowEnhancePopup(false);
    setPendingEnhanceIndex(null);
    setIsEnhanceAllMode(false);
  }, []);

  /**
   * Enhance a single angle image. The enhanced URL is pushed to versionHistory
   * so the user gets free undo/redo via the existing version nav arrows.
   */
  const enhanceAngle = useCallback(async (index: number, prompt: string, steps: number = 6) => {
    if (!sogniClient) return;

    const item = angleItems[index];
    if (!item || item.status !== 'ready' || item.enhancing) return;

    const displayUrl = item.versionHistory[item.selectedVersion] || item.resultUrl;
    if (!displayUrl) return;

    setIsEnhancingAngle(true);

    // Mark item as enhancing
    setAngleItems(prev => prev.map((it, i) =>
      i === index ? { ...it, enhancing: true, enhancementProgress: 0, enhanceWorkerName: undefined } : it
    ));

    const tokenType = getPaymentMethod();

    try {
      const result = await enhanceImage({
        imageUrl: displayUrl,
        width: sourceWidth,
        height: sourceHeight,
        sogniClient,
        tokenType,
        prompt,
        steps,
        onProgress: (progress, workerName) => {
          setAngleItems(prev => prev.map((it, i) =>
            i === index ? { ...it, enhancementProgress: progress, enhanceWorkerName: workerName || it.enhanceWorkerName } : it
          ));
        },
        onComplete: (enhancedUrl) => {
          // Push enhanced URL as new version history entry
          setAngleItems(prev => prev.map((it, i) => {
            if (i !== index) return it;
            const newHistory = [...it.versionHistory, enhancedUrl];
            return {
              ...it,
              enhancing: false,
              enhanced: true,
              enhancementProgress: 100,
              enhancedImageUrl: enhancedUrl,
              originalImageUrl: displayUrl,
              versionHistory: newHistory,
              selectedVersion: newHistory.length - 1,
              resultUrl: enhancedUrl
            };
          }));
        },
        onError: (error) => {
          console.error(`[360-Workflow] Enhancement error for angle ${index}:`, error);
          setAngleItems(prev => prev.map((it, i) =>
            i === index ? { ...it, enhancing: false, enhancementProgress: 0, enhanceWorkerName: undefined } : it
          ));
          if (error.message.includes('Insufficient') || error.message.includes('insufficient')) {
            onOutOfCredits?.();
          }
        }
      });

      if (!result) {
        // Ensure enhancing is cleared even if result is null but onError wasn't called
        setAngleItems(prev => prev.map((it, i) =>
          i === index && it.enhancing ? { ...it, enhancing: false, enhancementProgress: 0 } : it
        ));
      }
    } catch (error) {
      console.error('[360-Workflow] Enhancement error:', error);
      setAngleItems(prev => prev.map((it, i) =>
        i === index ? { ...it, enhancing: false, enhancementProgress: 0 } : it
      ));
    } finally {
      setIsEnhancingAngle(false);
    }
  }, [sogniClient, angleItems, sourceWidth, sourceHeight, onOutOfCredits]);

  /**
   * Enhance all ready angles in parallel.
   */
  const enhanceAllAngles = useCallback(async (prompt: string, steps: number = 6) => {
    if (!sogniClient) return;

    const readyIndices = angleItems
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => item.status === 'ready' && !item.enhancing)
      .map(({ i }) => i);

    if (readyIndices.length === 0) return;

    setIsEnhancingAll(true);
    setEnhanceAllProgress({ done: 0, total: readyIndices.length });

    // Mark all as enhancing
    setAngleItems(prev => prev.map((it, i) =>
      readyIndices.includes(i) ? { ...it, enhancing: true, enhancementProgress: 0, enhanceWorkerName: undefined } : it
    ));

    const tokenType = getPaymentMethod();
    let doneCount = 0;

    const promises = readyIndices.map(async (index) => {
      const item = angleItems[index];
      const displayUrl = item.versionHistory[item.selectedVersion] || item.resultUrl;
      if (!displayUrl) return;

      try {
        await enhanceImage({
          imageUrl: displayUrl,
          width: sourceWidth,
          height: sourceHeight,
          sogniClient,
          tokenType,
          prompt,
          steps,
          onProgress: (progress, workerName) => {
            setAngleItems(prev => prev.map((it, i) =>
              i === index ? { ...it, enhancementProgress: progress, enhanceWorkerName: workerName || it.enhanceWorkerName } : it
            ));
          },
          onComplete: (enhancedUrl) => {
            doneCount++;
            setEnhanceAllProgress({ done: doneCount, total: readyIndices.length });
            setAngleItems(prev => prev.map((it, i) => {
              if (i !== index) return it;
              const newHistory = [...it.versionHistory, enhancedUrl];
              return {
                ...it,
                enhancing: false,
                enhanced: true,
                enhancementProgress: 100,
                enhancedImageUrl: enhancedUrl,
                originalImageUrl: displayUrl,
                versionHistory: newHistory,
                selectedVersion: newHistory.length - 1,
                resultUrl: enhancedUrl
              };
            }));
          },
          onError: (error) => {
            doneCount++;
            setEnhanceAllProgress({ done: doneCount, total: readyIndices.length });
            console.error(`[360-Workflow] Enhancement error for angle ${index}:`, error);
            setAngleItems(prev => prev.map((it, i) =>
              i === index ? { ...it, enhancing: false, enhancementProgress: 0, enhanceWorkerName: undefined } : it
            ));
            if (error.message.includes('Insufficient') || error.message.includes('insufficient')) {
              onOutOfCredits?.();
            }
          }
        });
      } catch (error) {
        doneCount++;
        setEnhanceAllProgress({ done: doneCount, total: readyIndices.length });
        console.error(`[360-Workflow] Enhancement error for angle ${index}:`, error);
        setAngleItems(prev => prev.map((it, i) =>
          i === index ? { ...it, enhancing: false, enhancementProgress: 0 } : it
        ));
      }
    });

    await Promise.all(promises);
    setIsEnhancingAll(false);
  }, [sogniClient, angleItems, sourceWidth, sourceHeight, onOutOfCredits]);

  /**
   * Dispatcher called by popup confirmation.
   */
  const handleEnhanceConfirm = useCallback((prompt: string, steps: number) => {
    setShowEnhancePopup(false);
    if (isEnhanceAllMode) {
      enhanceAllAngles(prompt, steps);
    } else if (pendingEnhanceIndex !== null) {
      enhanceAngle(pendingEnhanceIndex, prompt, steps);
    }
    setPendingEnhanceIndex(null);
    setIsEnhanceAllMode(false);
  }, [isEnhanceAllMode, pendingEnhanceIndex, enhanceAllAngles, enhanceAngle]);

  // ---- Phase 3 Actions ----

  const proceedToTransitions = useCallback(() => {
    // Build transitions from the angles and go straight to review
    const newTransitions = buildTransitions(angles);
    setTransitions(newTransitions);
    setStep('review-transitions');
  }, [angles]);

  const updateTransitionSettings = useCallback((updates: Partial<Camera360TransitionSettings>) => {
    setTransitionSettings(prev => ({ ...prev, ...updates }));
  }, []);

  // ---- Phase 4 Actions ----

  /**
   * Get the final image URL for each angle (original source for isOriginal, generated for others)
   */
  const getAngleImageUrls = useCallback((): string[] => {
    return angles.map(slot => {
      if (slot.isOriginal) {
        return sourceImageUrl;
      }
      const item = angleItems.find(i => i.slotId === slot.id);
      const url = item?.versionHistory[item.selectedVersion] || item?.resultUrl;
      return url || sourceImageUrl;
    });
  }, [angles, angleItems, sourceImageUrl]);

  const startTransitionGeneration = useCallback(async () => {
    if (!sogniClient || isGeneratingTransitions) return;

    abortRef.current = false;
    setIsGeneratingTransitions(true);

    const imageUrls = getAngleImageUrls();
    const tokenType = getPaymentMethod();

    // Capture current transitions via ref to avoid stale closure
    const currentTransitions = transitionsRef.current;

    // Reset all transitions to pending
    setTransitions(prev => prev.map(t => ({
      ...t,
      status: 'pending' as const,
      progress: 0,
      error: null,
      workerName: null
    })));

    try {
      await generateMultipleTransitions(
        currentTransitions,
        imageUrls,
        {
          prompt: transitionSettings.prompt,
          negativePrompt: transitionSettings.negativePrompt,
          resolution: transitionSettings.resolution,
          quality: transitionSettings.quality,
          duration: transitionSettings.duration,
          tokenType,
          sourceWidth,
          sourceHeight,
          sogniClient,
          abortRef,
          onTransitionStart: (transitionId) => {
            setTransitions(prev => prev.map(t =>
              t.id === transitionId ? { ...t, status: 'generating' as const, progress: 0 } : t
            ));
          },
          onTransitionProgress: (transitionId, progress, workerName) => {
            setTransitions(prev => prev.map(t =>
              t.id === transitionId ? { ...t, progress, workerName: workerName || t.workerName } : t
            ));
          },
          onTransitionComplete: (transitionId, result) => {
            setTransitions(prev => prev.map(t => {
              if (t.id !== transitionId) return t;
              const newVersion = {
                id: generateId('ver'),
                videoUrl: result.videoUrl,
                createdAt: Date.now()
              };
              const versionHistory = [...t.versionHistory, newVersion];
              return {
                ...t,
                status: 'ready' as const,
                progress: 100,
                videoUrl: result.videoUrl,
                versionHistory,
                selectedVersion: versionHistory.length - 1
              };
            }));
          },
          onTransitionError: (transitionId, error) => {
            setTransitions(prev => prev.map(t =>
              t.id === transitionId
                ? { ...t, status: 'failed' as const, error: error.message }
                : t
            ));
          },
          onOutOfCredits: () => {
            onOutOfCredits?.();
          }
        }
      );
    } catch (error) {
      console.error('[360-Workflow] Transition generation error:', error);
    } finally {
      setIsGeneratingTransitions(false);
    }
  }, [sogniClient, isGeneratingTransitions, getAngleImageUrls, transitionSettings, sourceWidth, sourceHeight, onOutOfCredits]); // eslint-disable-line react-hooks/exhaustive-deps

  const regenerateTransition = useCallback(async (transitionId: string) => {
    if (!sogniClient) return;

    const transition = transitions.find(t => t.id === transitionId);
    if (!transition) return;

    const imageUrls = getAngleImageUrls();
    const fromImageUrl = imageUrls[transition.fromIndex];
    const toImageUrl = imageUrls[transition.toIndex];
    if (!fromImageUrl || !toImageUrl) return;

    const tokenType = getPaymentMethod();

    // Reset this transition
    setTransitions(prev => prev.map(t =>
      t.id === transitionId
        ? { ...t, status: 'generating' as const, progress: 0, error: null }
        : t
    ));

    try {
      await generateTransition({
        transitionId,
        fromImageUrl,
        toImageUrl,
        prompt: transitionSettings.prompt,
        negativePrompt: transitionSettings.negativePrompt,
        resolution: transitionSettings.resolution,
        quality: transitionSettings.quality,
        duration: transitionSettings.duration,
        tokenType,
        sourceWidth,
        sourceHeight,
        sogniClient,
        abortRef,
        onProgress: (progress, workerName) => {
          setTransitions(prev => prev.map(t =>
            t.id === transitionId
              ? { ...t, progress, workerName: workerName || t.workerName }
              : t
          ));
        },
        onComplete: (result) => {
          setTransitions(prev => prev.map(t => {
            if (t.id !== transitionId) return t;
            const newVersion = {
              id: generateId('ver'),
              videoUrl: result.videoUrl,
              createdAt: Date.now()
            };
            const versionHistory = [...t.versionHistory, newVersion];
            return {
              ...t,
              status: 'ready' as const,
              progress: 100,
              videoUrl: result.videoUrl,
              versionHistory,
              selectedVersion: versionHistory.length - 1
            };
          }));
        },
        onError: (error) => {
          setTransitions(prev => prev.map(t =>
            t.id === transitionId
              ? { ...t, status: 'failed' as const, error: error.message }
              : t
          ));
        }
      });
    } catch (error) {
      console.error('[360-Workflow] Transition regeneration error:', error);
    }
  }, [sogniClient, transitions, getAngleImageUrls, transitionSettings, sourceWidth, sourceHeight]);

  const selectTransitionVersion = useCallback((transitionId: string, version: number) => {
    setTransitions(prev => prev.map(t => {
      if (t.id !== transitionId) return t;
      const ver = t.versionHistory[version];
      return {
        ...t,
        selectedVersion: version,
        videoUrl: ver?.videoUrl || t.videoUrl
      };
    }));
  }, []);

  // ---- Phase 5 Actions ----

  const stitchFinalVideo = useCallback(async () => {
    setIsStitching(true);
    setStitchingProgress(0);
    setStep('final-video');

    try {
      // Build ordered video list from transitions
      const videos = transitions.map((t, index) => {
        const ver = t.versionHistory[t.selectedVersion];
        const url = ver?.videoUrl || t.videoUrl;
        if (!url) throw new Error(`Missing video for transition ${index + 1}`);
        return { url, filename: `transition-${index}.mp4` };
      });

      // Prepare audio options
      let audioOptions: { buffer: ArrayBuffer; startOffset: number } | undefined;
      if (transitionSettings.musicPresetId) {
        // Custom music (uploaded or AI-generated) uses customMusicUrl; presets use the preset URL
        let audioUrl: string | null = null;
        if (transitionSettings.customMusicUrl) {
          audioUrl = transitionSettings.customMusicUrl;
        } else {
          const preset = TRANSITION_MUSIC_PRESETS.find(
            (p: any) => p.id === transitionSettings.musicPresetId
          );
          audioUrl = preset?.url || null;
        }
        if (audioUrl) {
          const audioResponse = await fetch(audioUrl);
          const audioBuffer = await audioResponse.arrayBuffer();
          audioOptions = {
            buffer: audioBuffer,
            startOffset: transitionSettings.musicStartOffset || 0
          };
        }
      }

      const blob = await concatenateVideos(
        videos,
        (current: number, total: number) => {
          setStitchingProgress(Math.round((current / total) * 100));
        },
        audioOptions
      );

      const url = URL.createObjectURL(blob);
      setFinalVideoUrl(url);
      setFinalVideoBlob(blob);
    } catch (error) {
      console.error('[360-Workflow] Stitching error:', error);
    } finally {
      setIsStitching(false);
      setStitchingProgress(100);
    }
  }, [transitions, transitionSettings.musicPresetId, transitionSettings.musicStartOffset, transitionSettings.customMusicUrl]);

  /**
   * Re-stitch the final video with a different music preset (or no music).
   * Called from the final video step when user changes music.
   */
  const restitchWithMusic = useCallback(async (
    musicPresetId: string | null,
    musicStartOffset: number = 0,
    customMusicUrl?: string,
    customMusicTitle?: string
  ) => {
    // Update settings — preserve custom URL/title for uploaded and AI-generated tracks
    const hasCustomUrl = musicPresetId === 'uploaded' || musicPresetId?.startsWith('ai-generated-');
    setTransitionSettings(prev => ({
      ...prev,
      musicPresetId,
      musicStartOffset,
      customMusicUrl: customMusicUrl ?? (hasCustomUrl ? prev.customMusicUrl : null),
      customMusicTitle: customMusicTitle ?? (hasCustomUrl ? prev.customMusicTitle : null)
    }));

    // Clean up old video URL
    if (finalVideoUrl) {
      URL.revokeObjectURL(finalVideoUrl);
    }
    setFinalVideoUrl(null);
    setFinalVideoBlob(null);

    setIsStitching(true);
    setStitchingProgress(0);

    try {
      const videos = transitions.map((t, index) => {
        const ver = t.versionHistory[t.selectedVersion];
        const url = ver?.videoUrl || t.videoUrl;
        if (!url) throw new Error(`Missing video for transition ${index + 1}`);
        return { url, filename: `transition-${index}.mp4` };
      });

      let audioOptions: { buffer: ArrayBuffer; startOffset: number } | undefined;
      if (musicPresetId) {
        // Custom music (uploaded or AI-generated) uses customMusicUrl; presets use the preset URL
        let audioUrl: string | null = null;
        if (customMusicUrl) {
          audioUrl = customMusicUrl;
        } else if (transitionSettings.customMusicUrl) {
          // Fallback: check current settings for the URL (e.g. AI-generated track from previous session)
          audioUrl = transitionSettings.customMusicUrl;
        } else {
          const preset = TRANSITION_MUSIC_PRESETS.find(
            (p: any) => p.id === musicPresetId
          );
          audioUrl = preset?.url || null;
        }
        if (audioUrl) {
          const audioResponse = await fetch(audioUrl);
          const audioBuffer = await audioResponse.arrayBuffer();
          audioOptions = {
            buffer: audioBuffer,
            startOffset: musicStartOffset
          };
        }
      }

      const blob = await concatenateVideos(
        videos,
        (current: number, total: number) => {
          setStitchingProgress(Math.round((current / total) * 100));
        },
        audioOptions
      );

      const url = URL.createObjectURL(blob);
      setFinalVideoUrl(url);
      setFinalVideoBlob(blob);
    } catch (error) {
      console.error('[360-Workflow] Re-stitch error:', error);
    } finally {
      setIsStitching(false);
      setStitchingProgress(100);
    }
  }, [transitions, finalVideoUrl, transitionSettings.customMusicUrl]);

  // ---- Navigation ----

  const goToStep = useCallback((newStep: Camera360Step) => {
    setStep(newStep);
  }, []);

  const goBack = useCallback(() => {
    switch (step) {
      case 'review-angles':
        setStep('configure-angles');
        break;
      case 'review-transitions':
        setStep('review-angles');
        break;
      case 'final-video':
        setStep('review-transitions');
        break;
    }
  }, [step]);

  const resetWorkflow = useCallback(() => {
    abortRef.current = true;
    setStep('configure-angles');
    setPresetKey(defaultPreset);
    setAngles(createSlotsFromPreset(defaultPreset));
    setAngleItems([]);
    setIsGeneratingAngles(false);
    setIsEnhancingAngle(false);
    setIsEnhancingAll(false);
    setEnhanceAllProgress({ done: 0, total: 0 });
    setShowEnhancePopup(false);
    setPendingEnhanceIndex(null);
    setIsEnhanceAllMode(false);
    setTransitionSettings(DEFAULT_360_TRANSITION_SETTINGS);
    setTransitions([]);
    setIsGeneratingTransitions(false);
    if (finalVideoUrl) {
      URL.revokeObjectURL(finalVideoUrl);
    }
    setFinalVideoUrl(null);
    setFinalVideoBlob(null);
    setStitchingProgress(0);
    setIsStitching(false);
  }, [finalVideoUrl]);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  // ---- Computed values ----

  const allAnglesReady = angleItems.length > 0 && angleItems.every(item => item.status === 'ready') && !anyEnhancing;
  const allTransitionsReady = transitions.length > 0 && transitions.every(t => t.status === 'ready');
  const generatableAngleCount = angles.filter(s => !s.isOriginal).length;
  const enhancableCount = angleItems.filter(i => i.status === 'ready' && !i.enhancing).length;

  return {
    // State
    step,
    presetKey,
    angles,
    angleItems,
    transitionSettings,
    transitions,
    finalVideoUrl,
    finalVideoBlob,
    isGenerating,
    isGeneratingAngles,
    isGeneratingTransitions,
    isStitching,
    stitchingProgress,

    // Computed
    allAnglesReady,
    allTransitionsReady,
    generatableAngleCount,
    anyEnhancing,
    enhancableCount,

    // Phase 1
    selectPreset,
    updateAngle,
    removeAngle,
    addAngle,

    // Phase 2
    startAngleGeneration,
    regenerateAngle,
    selectAngleVersion,

    // Phase 2b: Enhancement
    isEnhancingAngle,
    isEnhancingAll,
    enhanceAllProgress,
    showEnhancePopup,
    pendingEnhanceIndex,
    isEnhanceAllMode,
    openEnhancePopup,
    openEnhanceAllPopup,
    closeEnhancePopup,
    handleEnhanceConfirm,

    // Phase 3
    proceedToTransitions,
    updateTransitionSettings,

    // Phase 4
    startTransitionGeneration,
    regenerateTransition,
    selectTransitionVersion,
    getAngleImageUrls,

    // Phase 5
    stitchFinalVideo,
    restitchWithMusic,

    // Navigation
    goToStep,
    goBack,
    resetWorkflow,
    abort
  };
}
