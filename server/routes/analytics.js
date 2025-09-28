import express from 'express';
import {
  trackDownload,
  trackShare,
  getPromptAnalytics,
  getTopPrompts,
  getDailyAnalyticsSummary,
  getLifetimeAnalyticsSummary,
  clearAnalytics
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
    
    console.log(`[Analytics API] Download tracked for prompt: ${promptId}`);
    
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
    
    await trackShare(promptId, enrichedMetadata);
    
    console.log(`[Analytics API] Share tracked for prompt: ${promptId} (type: ${shareType})`);
    
    res.json({ 
      success: true, 
      message: 'Share tracked successfully',
      promptId,
      shareType
    });
  } catch (error) {
    console.error('[Analytics API] Error tracking share:', error);
    res.status(500).json({ 
      error: 'Failed to track share' 
    });
  }
});

/**
 * Get analytics for a specific prompt
 * GET /api/analytics/prompt/:promptId?date=YYYY-MM-DD
 */
router.get('/prompt/:promptId', async (req, res) => {
  try {
    const { promptId } = req.params;
    const { date } = req.query;
    
    const analytics = await getPromptAnalytics(promptId, date);
    
    if (!analytics) {
      return res.status(404).json({ 
        error: 'Analytics not found for prompt' 
      });
    }
    
    res.json(analytics);
  } catch (error) {
    console.error('[Analytics API] Error getting prompt analytics:', error);
    res.status(500).json({ 
      error: 'Failed to get prompt analytics' 
    });
  }
});

/**
 * Get top prompts leaderboard
 * GET /api/analytics/top?type=combined&period=lifetime&date=YYYY-MM-DD&limit=50
 */
router.get('/top', async (req, res) => {
  try {
    const { 
      type = 'combined', 
      period = 'lifetime', 
      date, 
      limit = 50 
    } = req.query;
    
    // Validate parameters
    if (!['downloads', 'shares', 'combined'].includes(type)) {
      return res.status(400).json({ 
        error: 'type must be downloads, shares, or combined' 
      });
    }
    
    if (!['daily', 'lifetime'].includes(period)) {
      return res.status(400).json({ 
        error: 'period must be daily or lifetime' 
      });
    }
    
    if (period === 'daily' && !date) {
      return res.status(400).json({ 
        error: 'date is required for daily period' 
      });
    }
    
    const limitNum = Math.min(parseInt(limit) || 50, 100); // Cap at 100
    
    const topPrompts = await getTopPrompts(type, period, date, limitNum);
    
    res.json({
      type,
      period,
      date: period === 'daily' ? date : null,
      limit: limitNum,
      results: topPrompts
    });
  } catch (error) {
    console.error('[Analytics API] Error getting top prompts:', error);
    res.status(500).json({ 
      error: 'Failed to get top prompts' 
    });
  }
});

/**
 * Get daily analytics summary
 * GET /api/analytics/summary/daily?date=YYYY-MM-DD
 */
router.get('/summary/daily', async (req, res) => {
  try {
    const { date } = req.query;
    
    const summary = await getDailyAnalyticsSummary(date);
    
    if (!summary) {
      return res.status(404).json({ 
        error: 'Daily summary not found' 
      });
    }
    
    res.json(summary);
  } catch (error) {
    console.error('[Analytics API] Error getting daily summary:', error);
    res.status(500).json({ 
      error: 'Failed to get daily summary' 
    });
  }
});

/**
 * Get lifetime analytics summary
 * GET /api/analytics/summary/lifetime
 */
router.get('/summary/lifetime', async (req, res) => {
  try {
    const summary = await getLifetimeAnalyticsSummary();
    
    if (!summary) {
      return res.status(404).json({ 
        error: 'Lifetime summary not found' 
      });
    }
    
    res.json(summary);
  } catch (error) {
    console.error('[Analytics API] Error getting lifetime summary:', error);
    res.status(500).json({ 
      error: 'Failed to get lifetime summary' 
    });
  }
});

/**
 * Admin endpoint: Clear analytics data
 * DELETE /api/analytics/clear?type=all&date=YYYY-MM-DD&confirm=true
 */
router.delete('/clear', async (req, res) => {
  try {
    const { type = 'all', date, confirm } = req.query;
    
    // Safety check
    if (confirm !== 'true') {
      return res.status(400).json({ 
        error: 'Must set confirm=true to clear analytics data' 
      });
    }
    
    // Validate type
    if (!['daily', 'lifetime', 'all'].includes(type)) {
      return res.status(400).json({ 
        error: 'type must be daily, lifetime, or all' 
      });
    }
    
    // Require date for daily cleanup
    if (type === 'daily' && !date) {
      return res.status(400).json({ 
        error: 'date is required for daily cleanup' 
      });
    }
    
    const success = await clearAnalytics(type, date);
    
    if (!success) {
      return res.status(500).json({ 
        error: 'Failed to clear analytics data' 
      });
    }
    
    console.log(`[Analytics API] Cleared analytics data: type=${type}, date=${date}`);
    
    res.json({ 
      success: true, 
      message: `Analytics data cleared successfully`,
      type,
      date: type === 'daily' ? date : null
    });
  } catch (error) {
    console.error('[Analytics API] Error clearing analytics:', error);
    res.status(500).json({ 
      error: 'Failed to clear analytics data' 
    });
  }
});

/**
 * Admin endpoint: Get analytics dashboard data
 * GET /api/analytics/dashboard
 */
router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Get comprehensive analytics data
    const [
      todaySummary,
      yesterdaySummary,
      lifetimeSummary,
      topLifetimeDownloads,
      topLifetimeShares,
      topLifetimeCombined,
      topTodayDownloads,
      topTodayShares,
      topTodayCombined
    ] = await Promise.all([
      getDailyAnalyticsSummary(today),
      getDailyAnalyticsSummary(yesterday),
      getLifetimeAnalyticsSummary(),
      getTopPrompts('downloads', 'lifetime', null, 20),
      getTopPrompts('shares', 'lifetime', null, 20),
      getTopPrompts('combined', 'lifetime', null, 20),
      getTopPrompts('downloads', 'daily', today, 10),
      getTopPrompts('shares', 'daily', today, 10),
      getTopPrompts('combined', 'daily', today, 10)
    ]);
    
    res.json({
      today: {
        date: today,
        summary: todaySummary,
        topPrompts: {
          downloads: topTodayDownloads,
          shares: topTodayShares,
          combined: topTodayCombined
        }
      },
      yesterday: {
        date: yesterday,
        summary: yesterdaySummary
      },
      lifetime: {
        summary: lifetimeSummary,
        topPrompts: {
          downloads: topLifetimeDownloads,
          shares: topLifetimeShares,
          combined: topLifetimeCombined
        }
      },
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Analytics API] Error getting dashboard data:', error);
    res.status(500).json({ 
      error: 'Failed to get dashboard data' 
    });
  }
});

export default router;
