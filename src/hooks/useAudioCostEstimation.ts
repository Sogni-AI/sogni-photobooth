/**
 * Hook for estimating audio generation costs
 *
 * Uses the Sogni audio job estimate REST endpoint to get cost estimates
 * before starting audio generation.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useWallet } from './useWallet';

interface AudioCostEstimationParams {
  /** Audio model ID (e.g., 'ace_step_1.5_sft') */
  modelId: string;
  /** Audio duration in seconds */
  duration: number;
  /** Inference steps */
  steps: number;
  /** Number of audio tracks to generate */
  audioCount?: number;
  /** Whether estimation is enabled */
  enabled?: boolean;
}

interface AudioCostEstimationResult {
  loading: boolean;
  cost: number | null;
  costInUSD: number | null;
  error: Error | null;
  formattedCost: string;
  /** Refetch the cost estimate */
  refetch: () => void;
}

interface AudioEstimateResponse {
  quote: {
    project: {
      costInSpark?: number | string;
      costInSogni?: number | string;
      costInUSD?: number | string;
    };
  };
}

/**
 * Get audio job cost estimate from the Sogni API
 */
async function fetchAudioCostEstimate(
  tokenType: string,
  modelId: string,
  duration: number,
  steps: number,
  audioCount: number = 1
): Promise<AudioEstimateResponse> {
  const url = `https://socket.sogni.ai/api/v1/job-audio/estimate/${tokenType}/${encodeURIComponent(modelId)}/${duration}/${steps}/${audioCount}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to get audio cost estimate: ${response.statusText}`);
  }

  return response.json() as Promise<AudioEstimateResponse>;
}

/**
 * Hook to estimate audio generation cost before submitting
 */
export function useAudioCostEstimation(params: AudioCostEstimationParams): AudioCostEstimationResult {
  const [loading, setLoading] = useState(false);
  const [cost, setCost] = useState<number | null>(null);
  const [costInUSD, setCostInUSD] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const { tokenType } = useWallet();

  // Use ref to track the last params to avoid unnecessary re-fetches
  const lastParamsRef = useRef<string>('');

  const {
    modelId,
    duration,
    steps,
    audioCount = 1,
    enabled = true
  } = params;

  const fetchCost = useCallback(async () => {
    if (!enabled || !modelId) {
      setCost(null);
      setCostInUSD(null);
      setError(null);
      setLoading(false);
      lastParamsRef.current = '';
      return;
    }

    // Create a stable params hash to avoid re-fetching with same params
    const paramsHash = JSON.stringify({
      tokenType,
      modelId,
      duration,
      steps,
      audioCount,
      enabled
    });

    if (paramsHash === lastParamsRef.current) {
      return;
    }
    lastParamsRef.current = paramsHash;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchAudioCostEstimate(
        tokenType,
        modelId,
        duration,
        steps,
        audioCount
      );

      if (result?.quote?.project) {
        const project = result.quote.project;

        // Get cost based on token type
        const tokenCostRaw = tokenType === 'spark'
          ? project.costInSpark
          : project.costInSogni;

        const tokenCost = typeof tokenCostRaw === 'string'
          ? parseFloat(tokenCostRaw)
          : tokenCostRaw;

        if (tokenCost !== undefined && !isNaN(tokenCost)) {
          setCost(tokenCost);
        } else {
          setCost(null);
        }

        // Get USD cost
        const usdCostRaw = project.costInUSD;
        const usdCost = typeof usdCostRaw === 'string'
          ? parseFloat(usdCostRaw)
          : usdCostRaw;

        if (usdCost !== undefined && !isNaN(usdCost)) {
          setCostInUSD(usdCost);
        } else {
          setCostInUSD(null);
        }
      } else {
        setCost(null);
        setCostInUSD(null);
      }

      setLoading(false);
    } catch (err) {
      console.warn('[AudioCostEstimation] Cost estimation failed:', err);
      setError(err as Error);
      setCost(null);
      setCostInUSD(null);
      setLoading(false);
    }
  }, [enabled, modelId, duration, steps, audioCount, tokenType]);

  // Fetch on mount and when params change
  useEffect(() => {
    void fetchCost();
  }, [fetchCost]);

  // Format the cost for display
  const formattedCost = cost !== null ? cost.toFixed(2) : '—';

  const refetch = () => {
    void fetchCost();
  };

  return {
    loading,
    cost,
    costInUSD,
    error,
    formattedCost,
    refetch
  };
}

export default useAudioCostEstimation;
