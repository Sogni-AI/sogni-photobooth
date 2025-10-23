import { useState, useEffect, useRef } from 'react';
import { useSogniAuth } from '../services/sogniAuth';
import { useWallet } from './useWallet';

interface CostEstimationParams {
  model?: string;
  imageCount?: number;
  stepCount?: number;
  previewCount?: number;
  scheduler?: string;
  guidance?: number;
  contextImages?: number; // Number of Flux Kontext reference images (0 if not using)
  cnEnabled?: boolean; // Whether ControlNet (InstantID) is enabled
  guideImage?: boolean; // Whether using a guide/starting image (for enhancement/upscaling)
  denoiseStrength?: number; // Denoise strength for guide image (0.0-1.0, typically 0.75 for Krea)
  network?: string;
}

interface CostEstimationResult {
  loading: boolean;
  cost: number | null;
  error: Error | null;
  formattedCost: string;
}

/**
 * Hook to estimate the cost of a job/project before submitting
 * Mimics the implementation from sogni-web
 */
export function useCostEstimation(params: CostEstimationParams): CostEstimationResult {
  const [loading, setLoading] = useState(false);
  const [cost, setCost] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const { getSogniClient } = useSogniAuth();
  const { tokenType } = useWallet();

  // Use ref to track the last params to avoid unnecessary re-fetches
  const lastParamsRef = useRef<string>('');

  useEffect(() => {
    const estimateCost = async () => {
      // Don't fetch if we don't have the minimum required params
      if (!params.model || !params.imageCount) {
        setCost(null);
        setError(null);
        setLoading(false);
        return;
      }

      // Create a stable params hash to avoid re-fetching with same params
      const paramsHash = JSON.stringify({ ...params, tokenType });
      if (paramsHash === lastParamsRef.current) {
        return;
      }
      lastParamsRef.current = paramsHash;

      setLoading(true);
      setError(null);

      try {
        const client = getSogniClient();
        if (!client) {
          throw new Error('Sogni client not available');
        }

        // Check if the client has the estimateCost method
        if (!client.projects || typeof (client.projects as any).estimateCost !== 'function') {
          // If estimateCost is not available, we can't estimate
          setCost(null);
          setLoading(false);
          return;
        }

        const estimationParams = {
          network: params.network || 'fast',
          model: params.model,
          imageCount: params.imageCount,
          previewCount: params.previewCount ?? 10,
          stepCount: params.stepCount ?? 7,
          scheduler: params.scheduler || 'DPM++ SDE',
          guidance: params.guidance ?? 2,
          contextImages: params.contextImages ?? 0,
          cnEnabled: params.cnEnabled ?? false,
          guideImage: params.guideImage ?? false,
          denoiseStrength: params.denoiseStrength,
          tokenType: tokenType
        };

        const result = await (client.projects as any).estimateCost(estimationParams);

        if (result && result.token !== undefined && result.token !== null) {
          // Handle both string and number values
          const tokenCost = typeof result.token === 'string' ? parseFloat(result.token) : result.token;
          if (!isNaN(tokenCost)) {
            setCost(tokenCost);
          } else {
            setCost(null);
          }
        } else {
          setCost(null);
        }
        setLoading(false);
      } catch (err) {
        console.warn('[CostEstimation] Cost estimation failed:', err);
        setError(err as Error);
        setCost(null);
        setLoading(false);
      }
    };

    void estimateCost();
  }, [params.model, params.imageCount, params.stepCount, params.previewCount, params.scheduler, params.guidance, params.contextImages, params.cnEnabled, params.guideImage, params.denoiseStrength, params.network, tokenType]);

  // Format the cost for display
  const formattedCost = cost !== null ? cost.toFixed(2) : '—';

  return {
    loading,
    cost,
    error,
    formattedCost
  };
}

/**
 * Calculate cost for a single estimation synchronously
 * This is useful when you already have the client and want to estimate without a hook
 */
export async function estimateJobCost(
  client: any,
  params: CostEstimationParams & { tokenType?: string }
): Promise<number | null> {
  try {
    if (!client || !client.projects || typeof client.projects.estimateCost !== 'function') {
      return null;
    }

    const estimationParams = {
      network: params.network || 'fast',
      model: params.model,
      imageCount: params.imageCount,
      previewCount: params.previewCount ?? 10,
      stepCount: params.stepCount ?? 7,
      scheduler: params.scheduler || 'DPM++ SDE',
      guidance: params.guidance ?? 2,
      contextImages: params.contextImages ?? 0,
      cnEnabled: params.cnEnabled ?? false,
      guideImage: params.guideImage ?? false,
      denoiseStrength: params.denoiseStrength,
      tokenType: params.tokenType || 'spark'
    };

    const result = await client.projects.estimateCost(estimationParams);
    if (result?.token !== undefined && result?.token !== null) {
      // Handle both string and number values
      const tokenCost = typeof result.token === 'string' ? parseFloat(result.token) : result.token;
      return !isNaN(tokenCost) ? tokenCost : null;
    }
    return null;
  } catch (error) {
    console.warn('Cost estimation failed:', error);
    return null;
  }
}

