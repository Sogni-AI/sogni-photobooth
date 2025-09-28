import express from 'express';
import {
  trackDownload,
  trackShare,
  getDashboardData,
  getTopPrompts,
  clearAllAnalytics
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