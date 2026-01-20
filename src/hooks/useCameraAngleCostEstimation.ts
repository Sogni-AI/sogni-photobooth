/**
 * Hook for estimating camera angle generation costs
 *
 * Uses the Sogni SDK's estimateCost method (same as regular cost estimation)
 * to get cost estimates before starting camera angle generation.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useRef } from 'react';
import { useSogniAuth } from '../services/sogniAuth';
import { useWallet } from './useWallet';
import {
  CAMERA_ANGLE_MODEL,
  CAMERA_ANGLE_DEFAULTS
} from '../constants/cameraAngleSettings';

interface CameraAngleCostEstimationParams {
  /** Width of the output image */
  width?: number;
  /** Height of the output image */
  height?: number;
  /** Number of jobs/images to generate (default: 1) */
  jobCount?: number;
  /** Whether estimation is enabled */
  enabled?: boolean;
  /** Photo ID to bust cache when switching photos */
  photoId?: number | string | null;
}

interface CameraAngleCostEstimationResult {
  loading: boolean;
  cost: number | null;
  costInUSD: number | null;
  error: Error | null;
  formattedCost: string;
  /** Refetch the cost estimate */
  refetch: () => void;
}

/**
 * Hook to estimate camera angle generation cost before submitting
 * Uses the SDK's estimateCost method, same pattern as useCostEstimation
 */
export function useCameraAngleCostEstimation(params: CameraAngleCostEstimationParams): CameraAngleCostEstimationResult {
  const [loading, setLoading] = useState(false);
  const [cost, setCost] = useState<number | null>(null);
  const [costInUSD, setCostInUSD] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const { getSogniClient } = useSogniAuth();
  const { tokenType } = useWallet();

  // Use ref to track the last params to avoid unnecessary re-fetches
  const lastParamsRef = useRef<string>('');

  const {
    width = 1024,
    height = 1024,
    jobCount = 1,
    enabled = true,
    photoId
  } = params;

  useEffect(() => {
    const estimateCost = async () => {
      // Don't fetch if disabled
      if (!enabled) {
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
        model: CAMERA_ANGLE_MODEL,
        width,
        height,
        jobCount,
        photoId,
        enabled
      });

      if (paramsHash === lastParamsRef.current) {
        return;
      }
      lastParamsRef.current = paramsHash;

      setLoading(true);
      setError(null);

      try {
        const client = getSogniClient();
        if (!client) {
          // No client available, can't estimate
          setCost(null);
          setCostInUSD(null);
          setLoading(false);
          return;
        }

        // Check if the client has the estimateCost method
        if (!client.projects || typeof (client.projects as any).estimateCost !== 'function') {
          // If estimateCost is not available, we can't estimate
          setCost(null);
          setCostInUSD(null);
          setLoading(false);
          return;
        }

        // Use same estimation params pattern as useCostEstimation
        const estimationParams = {
          network: 'fast',
          model: CAMERA_ANGLE_MODEL,
          imageCount: jobCount,
          previewCount: 10,
          stepCount: CAMERA_ANGLE_DEFAULTS.steps,
          scheduler: 'simple',
          guidance: CAMERA_ANGLE_DEFAULTS.guidance,
          contextImages: 1, // Camera angle uses context image
          cnEnabled: false,
          guideImage: false,
          tokenType: tokenType
        };

        const result = await (client.projects as any).estimateCost(estimationParams);

        if (result && result.token !== undefined && result.token !== null) {
          const tokenCost = typeof result.token === 'string' ? parseFloat(result.token) : result.token;
          if (!isNaN(tokenCost)) {
            setCost(tokenCost);
          } else {
            setCost(null);
          }
        } else {
          setCost(null);
        }

        // Extract USD cost if available
        if (result && result.usd !== undefined && result.usd !== null) {
          const usdCost = typeof result.usd === 'string' ? parseFloat(result.usd) : result.usd;
          if (!isNaN(usdCost)) {
            setCostInUSD(usdCost);
          } else {
            setCostInUSD(null);
          }
        } else {
          setCostInUSD(null);
        }

        setLoading(false);
      } catch (err) {
        console.warn('[CameraAngleCostEstimation] Cost estimation failed:', err);
        setError(err as Error);
        setCost(null);
        setCostInUSD(null);
        setLoading(false);
      }
    };

    void estimateCost();
  }, [enabled, width, height, tokenType, photoId, jobCount, getSogniClient]);

  // Format the cost for display
  const formattedCost = cost !== null ? cost.toFixed(2) : '—';

  // Refetch function
  const refetch = () => {
    lastParamsRef.current = '';
    // Trigger re-fetch by updating state
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

export default useCameraAngleCostEstimation;
