/**
 * Hook to fetch and cache audio model tier configuration from the Sogni API.
 *
 * Returns server-provided constraints (allowed values, labels, defaults)
 * for use in the Create tab, replacing hardcoded constants.
 */

import { useState, useEffect } from 'react';

export interface AudioModelConfig {
  type: string;
  duration: { min: number; max: number; default: number; description?: string };
  bpm: { min: number; max: number; default: number; description?: string };
  keyscale: { allowed: string[]; default: string };
  timesignature: { allowed: string[]; default: string; labels?: Record<string, string> };
  language: { allowed: string[]; default: string; labels?: Record<string, string> };
  steps: { min: number; max: number; default: number };
  shift: { min: number; max: number; step: number; default: number };
  guidance: { min: number; max: number; decimals?: number; default: number };
  composerMode: { default: boolean };
  promptStrength: { min: number; max: number; decimals?: number; default: number };
  creativity: { min: number; max: number; decimals?: number; default: number; description?: string };
  comfySampler: { allowed: string[]; default: string };
  comfyScheduler: { allowed: string[]; default: string };
  outputFormat?: { allowed: string[]; default: string };
  numberOfMedia?: { min: number; max: number; default: number };
  [key: string]: unknown;
}

interface UseAudioModelConfigParams {
  modelId: string;
  enabled?: boolean;
}

interface UseAudioModelConfigResult {
  config: AudioModelConfig | null;
  loading: boolean;
  error: Error | null;
}

// Module-level cache — fetched once, shared across all component instances
let cachedConfig: AudioModelConfig | null = null;
let cachedModelId: string | null = null;
let fetchPromise: Promise<AudioModelConfig> | null = null;

async function fetchModelConfig(modelId: string): Promise<AudioModelConfig> {
  const url = `https://socket.sogni.ai/api/v1/models/tiers/${encodeURIComponent(modelId)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch model config: ${response.statusText}`);
  }
  return response.json() as Promise<AudioModelConfig>;
}

export function useAudioModelConfig({ modelId, enabled = true }: UseAudioModelConfigParams): UseAudioModelConfigResult {
  const [config, setConfig] = useState<AudioModelConfig | null>(cachedConfig);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled || !modelId) return;

    // Return from cache if already fetched for this model
    if (cachedConfig && cachedModelId === modelId) {
      setConfig(cachedConfig);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // Deduplicate in-flight requests
        if (!fetchPromise || cachedModelId !== modelId) {
          cachedModelId = modelId;
          fetchPromise = fetchModelConfig(modelId);
        }

        const result = await fetchPromise;

        if (!cancelled) {
          cachedConfig = result;
          setConfig(result);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[useAudioModelConfig] Failed to fetch model config:', err);
          setError(err as Error);
          setLoading(false);
          fetchPromise = null;
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [modelId, enabled]);

  return { config, loading, error };
}

export default useAudioModelConfig;
