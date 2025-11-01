/**
 * Frontend Analytics Tracker for SDK-based Generation
 * 
 * Sends analytics events to the backend when users generate images
 * through the frontend Sogni SDK (logged-in users)
 */

import urls from '../config/urls';

const API_BASE_URL = urls.apiUrl;

/**
 * Track a generation event when using the frontend SDK
 * This ensures analytics are captured even when bypassing the backend generate endpoint
 */
export async function trackFrontendGeneration(params: {
  numberImages: number;
  sourceType?: 'camera' | 'upload';
  selectedModel?: string;
}): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/analytics/track/generation`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        numberImages: params.numberImages || 1,
        sourceType: params.sourceType,
        selectedModel: params.selectedModel,
      }),
    });

    if (!response.ok) {
      throw new Error(`Analytics tracking failed: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('[Frontend Analytics] ✅ Generation tracked:', result.tracked);
  } catch (error) {
    // Don't throw - analytics failures shouldn't break the user experience
    console.error('[Frontend Analytics] ❌ Failed to track generation:', error);
  }
}

/**
 * Track a single metric (for other use cases)
 */
export async function trackFrontendMetric(metricType: string, amount: number = 1): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/analytics/track/metric`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        metricType,
        amount,
      }),
    });

    if (!response.ok) {
      throw new Error(`Metric tracking failed: ${response.statusText}`);
    }

    await response.json(); // Consume the response
    console.log(`[Frontend Analytics] ✅ Metric tracked: ${metricType} (+${amount})`);
  } catch (error) {
    // Don't throw - analytics failures shouldn't break the user experience
    console.error(`[Frontend Analytics] ❌ Failed to track metric ${metricType}:`, error);
  }
}

