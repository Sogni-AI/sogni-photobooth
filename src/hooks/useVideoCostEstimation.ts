/**
 * Hook for estimating video generation costs
 *
 * Uses the Sogni video job estimate REST endpoint to get cost estimates
 * before starting video generation.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useWallet } from './useWallet';
import {
  VIDEO_QUALITY_PRESETS,
  VIDEO_CONFIG,
  calculateVideoDimensions,
  calculateVideoFrames,
  VideoQualityPreset,
  VideoResolution
} from '../constants/videoSettings';

interface VideoCostEstimationParams {
  /** Width of the source image */
  imageWidth?: number;
  /** Height of the source image */
  imageHeight?: number;
  /** Video resolution preset */
  resolution?: VideoResolution;
  /** Video quality preset */
  quality?: VideoQualityPreset;
  /** Number of frames (default: calculated from duration and fps) */
  frames?: number;
  /** Frames per second (default: 16) */
  fps?: number;
  /** Video duration in seconds (default: 5) */
  duration?: number;
  /** Whether estimation is enabled */
  enabled?: boolean;
  /** Photo ID to bust cache when switching photos */
  photoId?: number | null;
  /** Number of jobs to request (default: 1) */
  jobCount?: number;
}

interface VideoCostEstimationResult {
  loading: boolean;
  cost: number | null;
  costInUSD: number | null;
  error: Error | null;
  formattedCost: string;
  /** Refetch the cost estimate */
  refetch: () => void;
}

interface VideoEstimateResponse {
  quote: {
    project: {
      costInSpark?: number | string;
      costInSogni?: number | string;
      costInUSD?: number | string;
    };
  };
}

/**
 * Get video job cost estimate from the Sogni API
 */
async function fetchVideoCostEstimate(
  tokenType: string,
  modelId: string,
  width: number,
  height: number,
  frames: number,
  fps: number,
  steps: number,
  jobCount: number = 1
): Promise<VideoEstimateResponse> {
  const url = `https://socket.sogni.ai/api/v1/job-video/estimate/${tokenType}/${encodeURIComponent(modelId)}/${width}/${height}/${frames}/${fps}/${steps}/${jobCount}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to get video cost estimate: ${response.statusText}`);
  }

  return response.json() as Promise<VideoEstimateResponse>;
}

/**
 * Hook to estimate video generation cost before submitting
 */
export function useVideoCostEstimation(params: VideoCostEstimationParams): VideoCostEstimationResult {
  const [loading, setLoading] = useState(false);
  const [cost, setCost] = useState<number | null>(null);
  const [costInUSD, setCostInUSD] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const { tokenType } = useWallet();

  // Use ref to track the last params to avoid unnecessary re-fetches
  const lastParamsRef = useRef<string>('');

  const {
    imageWidth,
    imageHeight,
    resolution = '480p',
    quality = 'fast',
    frames: providedFrames,
    fps = VIDEO_CONFIG.defaultFps,
    duration = VIDEO_CONFIG.defaultDuration,
    enabled = true,
    photoId,
    jobCount = 1
  } = params;

  // Calculate frames from duration and fps if not explicitly provided
  const frames = providedFrames ?? calculateVideoFrames(duration);

  const fetchCost = useCallback(async () => {
    // Don't fetch if disabled or missing required params
    if (!enabled || !imageWidth || !imageHeight) {
      setCost(null);
      setCostInUSD(null);
      setError(null);
      setLoading(false);
      // Reset the params ref when disabled so it will refetch when enabled again
      lastParamsRef.current = '';
      return;
    }

    // Get quality preset config
    const qualityConfig = VIDEO_QUALITY_PRESETS[quality];
    if (!qualityConfig) {
      setError(new Error(`Invalid quality preset: ${quality}`));
      setLoading(false);
      return;
    }

    // Calculate video dimensions
    const dimensions = calculateVideoDimensions(imageWidth, imageHeight, resolution);

    // Create a stable params hash to avoid re-fetching with same params
    // Include photoId to bust cache when switching photos
    // Include enabled to bust cache when dropdown opens/closes
    const paramsHash = JSON.stringify({
      tokenType,
      modelId: qualityConfig.model,
      width: dimensions.width,
      height: dimensions.height,
      frames,
      fps,
      steps: qualityConfig.steps,
      photoId,
      jobCount,
      enabled
    });

    if (paramsHash === lastParamsRef.current) {
      return;
    }
    lastParamsRef.current = paramsHash;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchVideoCostEstimate(
        tokenType,
        qualityConfig.model,
        dimensions.width,
        dimensions.height,
        frames,
        fps,
        qualityConfig.steps,
        jobCount
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
      console.warn('[VideoCostEstimation] Cost estimation failed:', err);
      setError(err as Error);
      setCost(null);
      setCostInUSD(null);
      setLoading(false);
    }
  }, [enabled, imageWidth, imageHeight, resolution, quality, frames, fps, tokenType, photoId, jobCount]);

  // Fetch on mount and when params change
  useEffect(() => {
    void fetchCost();
  }, [fetchCost]);

  // Format the cost for display
  const formattedCost = cost !== null ? cost.toFixed(2) : '—';

  // Wrap fetchCost to match the void return type expected
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

/**
 * Standalone function to fetch video cost estimate
 * Useful when you need to fetch cost outside of a React component
 */
export async function getVideoCostEstimate(
  tokenType: string,
  imageWidth: number,
  imageHeight: number,
  resolution: VideoResolution = '480p',
  quality: VideoQualityPreset = 'fast',
  duration: number = VIDEO_CONFIG.defaultDuration,
  fps: number = VIDEO_CONFIG.defaultFps,
  jobCount: number = 1
): Promise<{ cost: number | null; costInUSD: number | null }> {
  try {
    const qualityConfig = VIDEO_QUALITY_PRESETS[quality];
    const dimensions = calculateVideoDimensions(imageWidth, imageHeight, resolution);
    const frames = calculateVideoFrames(duration);

    const result = await fetchVideoCostEstimate(
      tokenType,
      qualityConfig.model,
      dimensions.width,
      dimensions.height,
      frames,
      fps,
      qualityConfig.steps,
      jobCount
    );

    if (result?.quote?.project) {
      const project = result.quote.project;

      const tokenCostRaw = tokenType === 'spark'
        ? project.costInSpark
        : project.costInSogni;

      const tokenCost = typeof tokenCostRaw === 'string'
        ? parseFloat(tokenCostRaw)
        : tokenCostRaw;

      const usdCostRaw = project.costInUSD;
      const usdCost = typeof usdCostRaw === 'string'
        ? parseFloat(usdCostRaw)
        : usdCostRaw;

      return {
        cost: tokenCost !== undefined && !isNaN(tokenCost) ? tokenCost : null,
        costInUSD: usdCost !== undefined && !isNaN(usdCost) ? usdCost : null
      };
    }

    return { cost: null, costInUSD: null };
  } catch (error) {
    console.warn('[VideoCostEstimation] Standalone cost fetch failed:', error);
    return { cost: null, costInUSD: null };
  }
}

export default useVideoCostEstimation;

