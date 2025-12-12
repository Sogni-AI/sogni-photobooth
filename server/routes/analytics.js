import express from 'express';
import {
  trackDownload,
  trackShare,
  getDashboardData,
  getTopPrompts,
  clearAllAnalytics,
  trackMetric,
  getHistoricalData
} from '../services/analyticsService.js';

const router = express.Router();

/**
 * Track a download event
 * POST /api/analytics/track/download
 * Body: { promptId: string, metadata?: object }
 */
router.post('/track/download', async (req, res) => {
  try {
    const { promptId, metadata = {} } = req.body;
    
    if (!promptId) {
      return res.status(400).json({ 
        error: 'promptId is required' 
      });
    }
    
    // Add request metadata
    const enrichedMetadata = {
      ...metadata,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: Date.now()
    };
    
    await trackDownload(promptId, enrichedMetadata);
    
    res.json({ 
      success: true, 
      message: 'Download tracked successfully',
      promptId
    });
  } catch (error) {
    console.error('[Analytics API] Error tracking download:', error);
    res.status(500).json({ 
      error: 'Failed to track download'
    });
  }
});

/**
 * Track a share event
 * POST /api/analytics/track/share
 * Body: { promptId: string, shareType?: string, metadata?: object }
 */
router.post('/track/share', async (req, res) => {
  try {
    const { promptId, shareType = 'unknown', metadata = {} } = req.body;
    
    if (!promptId) {
      return res.status(400).json({ 
        error: 'promptId is required' 
      });
    }
    
    // Add request metadata
    const enrichedMetadata = {
      ...metadata,
      shareType,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: Date.now()
    };
    
    await trackShare(promptId, shareType, enrichedMetadata);
    
    console.log(`[Analytics API] ✅ Share tracked for prompt: ${promptId} (type: ${shareType})`);
    
    res.json({ 
      success: true, 
      message: 'Share tracked successfully',
      promptId,
      shareType
    });
  } catch (error) {
    console.error('[Analytics API] ❌ Error tracking share:', error);
    res.status(500).json({ 
      error: 'Failed to track share' 
    });
  }
});

/**
 * Get analytics dashboard data
 * GET /api/analytics/dashboard
 */
router.get('/dashboard', async (req, res) => {
  try {
    const dashboardData = await getDashboardData();
    
    res.json({
      ...dashboardData,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Analytics API] Error getting dashboard data:', error);
    res.status(500).json({ 
      error: 'Failed to get dashboard data' 
    });
  }
});

/**
 * Get top prompts leaderboard
 * GET /api/analytics/top?limit=10
 */
router.get('/top', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const limitNum = Math.min(parseInt(limit) || 10, 50); // Cap at 50
    
    const topPrompts = await getTopPrompts(limitNum);
    
    res.json({
      limit: limitNum,
      results: topPrompts
    });
  } catch (error) {
    console.error('[Analytics API] ❌ Error getting top prompts:', error);
    res.status(500).json({ 
      error: 'Failed to get top prompts' 
    });
  }
});

/**
 * Get historical analytics data
 * GET /api/analytics/historical?days=30
 */
router.get('/historical', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const daysNum = Math.min(parseInt(days) || 30, 365); // Cap at 1 year
    
    const historicalData = await getHistoricalData(daysNum);
    
    res.json({
      days: daysNum,
      data: historicalData
    });
  } catch (error) {
    console.error('[Analytics API] ❌ Error getting historical data:', error);
    res.status(500).json({ 
      error: 'Failed to get historical data' 
    });
  }
});

/**
 * Track a general metric
 * POST /api/analytics/track/metric
 * Body: { metricType: string, amount?: number }
 */
router.post('/track/metric', async (req, res) => {
  try {
    const { metricType, amount = 1 } = req.body;
    
    if (!metricType) {
      return res.status(400).json({ 
        error: 'metricType is required' 
      });
    }
    
    await trackMetric(metricType, amount);
    
    res.json({ 
      success: true, 
      message: 'Metric tracked successfully',
      metricType,
      amount
    });
  } catch (error) {
    console.error('[Analytics API] ❌ Error tracking metric:', error);
    res.status(500).json({ 
      error: 'Failed to track metric' 
    });
  }
});

/**
 * Track photobooth generation event
 * POST /api/analytics/track/generation
 * Body: { 
 *   numberImages: number, 
 *   sourceType?: 'camera' | 'upload',
 *   selectedModel?: string
 * }
 */
router.post('/track/generation', async (req, res) => {
  try {
    const { numberImages = 1, sourceType, selectedModel } = req.body;
    
    // Track batch generated
    await trackMetric('batches_generated', 1);
    
    // Track photos generated
    await trackMetric('photos_generated', numberImages);
    
    // Track enhancement if applicable
    if (selectedModel === 'flux1-schnell-fp8') {
      await trackMetric('photos_enhanced', 1);
    }
    
    // Track source type (camera vs upload)
    if (sourceType === 'camera') {
      await trackMetric('photos_taken_camera', 1);
    } else if (sourceType === 'upload') {
      await trackMetric('photos_uploaded_browse', 1);
    }
    
    console.log(`[Analytics API] ✅ Generation tracked: ${numberImages} images, sourceType: ${sourceType || 'unknown'}, model: ${selectedModel || 'unknown'}`);
    
    res.json({ 
      success: true, 
      message: 'Generation tracked successfully',
      tracked: {
        batches: 1,
        photos: numberImages,
        enhanced: selectedModel === 'flux1-schnell-fp8' ? 1 : 0,
        sourceType: sourceType || 'unknown'
      }
    });
  } catch (error) {
    console.error('[Analytics API] ❌ Error tracking generation:', error);
    res.status(500).json({ 
      error: 'Failed to track generation',
      details: error.message
    });
  }
});

/**
 * Track video generation event
 * POST /api/analytics/track/video-generation
 * Body: { 
 *   resolution: string,
 *   quality: string,
 *   modelId?: string,
 *   width?: number,
 *   height?: number,
 *   success: boolean,
 *   errorMessage?: string
 * }
 */
router.post('/track/video-generation', async (req, res) => {
  try {
    const { 
      resolution, 
      quality, 
      modelId, 
      width, 
      height, 
      success = true, 
      errorMessage 
    } = req.body;
    
    // Track video generation attempt
    await trackMetric('videos_generated_attempts', 1);
    
    if (success) {
      // Track successful video generation
      await trackMetric('videos_generated_success', 1);
      
      // Track by resolution
      if (resolution === '480p') {
        await trackMetric('videos_generated_480p', 1);
      } else if (resolution === '720p') {
        await trackMetric('videos_generated_720p', 1);
      }
      
      // Track by quality
      if (quality) {
        await trackMetric(`videos_generated_${quality}`, 1);
      }
    } else {
      // Track failed video generation
      await trackMetric('videos_generated_failed', 1);
    }
    
    console.log(`[Analytics API] ✅ Video generation tracked: ${resolution}, ${quality}, success: ${success}${errorMessage ? `, error: ${errorMessage}` : ''}`);
    
    res.json({ 
      success: true, 
      message: 'Video generation tracked successfully',
      tracked: {
        resolution,
        quality,
        success,
        dimensions: width && height ? `${width}x${height}` : null
      }
    });
  } catch (error) {
    console.error('[Analytics API] ❌ Error tracking video generation:', error);
    res.status(500).json({ 
      error: 'Failed to track video generation',
      details: error.message
    });
  }
});

/**
 * Admin endpoint: Clear all analytics data
 * DELETE /api/analytics/clear-all?confirm=true
 */
router.delete('/clear-all', async (req, res) => {
  try {
    const { confirm } = req.query;
    
    // Safety check
    if (confirm !== 'true') {
      return res.status(400).json({ 
        error: 'Must set confirm=true to clear analytics data' 
      });
    }
    
    const success = await clearAllAnalytics();
    
    if (!success) {
      return res.status(500).json({ 
        error: 'Failed to clear analytics data' 
      });
    }
    
    console.log(`[Analytics API] ✅ Cleared all analytics data`);
    
    res.json({ 
      success: true, 
      message: 'All analytics data cleared successfully'
    });
  } catch (error) {
    console.error('[Analytics API] ❌ Error clearing analytics:', error);
    res.status(500).json({ 
      error: 'Failed to clear analytics data' 
    });
  }
});

export default router;