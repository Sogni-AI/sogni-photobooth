import { getRedisClient } from './redisService.js';

/**
 * Get current UTC date in YYYY-MM-DD format
 */
const getCurrentUTCDate = () => {
  return new Date().toISOString().split('T')[0];
};

/**
 * Track a download event for a specific prompt
 * @param {string} promptId - The prompt ID (e.g., 'anime1990s')
 * @param {Object} metadata - Optional metadata about the download
 */
export const trackDownload = async (promptId, metadata = {}) => {
  if (!promptId) {
    console.warn('[Analytics] trackDownload called without promptId');
    return;
  }

  const redis = getRedisClient();
  if (!redis) {
    console.warn('[Analytics] Redis not available, skipping download tracking');
    return;
  }

  try {
    const date = getCurrentUTCDate();
    
    // Use sorted sets for efficient leaderboards and simple counters for totals
    const dailyLeaderboard = `analytics:daily:${date}:downloads:leaderboard`;
    const lifetimeLeaderboard = `analytics:lifetime:downloads:leaderboard`;
    const dailyTotalKey = `analytics:daily:${date}:downloads:total`;
    const lifetimeTotalKey = `analytics:lifetime:downloads:total`;
    
    // Increment leaderboards (sorted sets) and totals atomically
    await redis.zIncrBy(dailyLeaderboard, 1, promptId);
    await redis.zIncrBy(lifetimeLeaderboard, 1, promptId);
    await redis.incrBy(dailyTotalKey, 1);
    await redis.incrBy(lifetimeTotalKey, 1);
    
    // NO expiry on daily keys - keep forever for historical charting
    
  } catch (error) {
    console.error('[Analytics] ❌ Error tracking download:', error);
  }
};

/**
 * Track a share event for a specific prompt
 * @param {string} promptId - The prompt ID (e.g., 'anime1990s')
 * @param {string} shareType - Type of share (e.g., 'twitter', 'web-share', 'copy-link')
 * @param {Object} metadata - Optional metadata about the share
 */
export const trackShare = async (promptId, shareType = 'unknown', metadata = {}) => {
  if (!promptId) {
    console.warn('[Analytics] trackShare called without promptId');
    return;
  }

  const redis = getRedisClient();
  if (!redis) {
    console.warn('[Analytics] Redis not available, skipping share tracking');
    return;
  }

  try {
    const date = getCurrentUTCDate();
    
    // Use sorted sets for efficient leaderboards and simple counters for totals
    const dailyLeaderboard = `analytics:daily:${date}:shares:leaderboard`;
    const lifetimeLeaderboard = `analytics:lifetime:shares:leaderboard`;
    const dailyTotalKey = `analytics:daily:${date}:shares:total`;
    const lifetimeTotalKey = `analytics:lifetime:shares:total`;
    
    // Increment leaderboards (sorted sets) and totals atomically
    await redis.zIncrBy(dailyLeaderboard, 1, promptId);
    await redis.zIncrBy(lifetimeLeaderboard, 1, promptId);
    await redis.incrBy(dailyTotalKey, 1);
    await redis.incrBy(lifetimeTotalKey, 1);
    
    // NO expiry on daily keys - keep forever for historical charting
    
  } catch (error) {
    console.error('[Analytics] ❌ Error tracking share:', error);
  }
};

/**
 * Get analytics dashboard data
 * @returns {Object} Dashboard data with daily and lifetime stats
 */
export const getDashboardData = async () => {
  const redis = getRedisClient();
  if (!redis) {
    console.warn('[Analytics] Redis not available, returning empty dashboard data');
    return {
      daily: { 
        downloads: 0, 
        shares: 0, 
        combined: 0,
        batches_generated: 0,
        photos_generated: 0,
        photos_enhanced: 0,
        photos_taken_camera: 0,
        photos_uploaded_browse: 0,
        twitter_shares: 0
      },
      lifetime: { 
        downloads: 0, 
        shares: 0, 
        combined: 0,
        batches_generated: 0,
        photos_generated: 0,
        photos_enhanced: 0,
        photos_taken_camera: 0,
        photos_uploaded_browse: 0,
        twitter_shares: 0
      },
      topPrompts: [],
      date: getCurrentUTCDate()
    };
  }

  try {
    const date = getCurrentUTCDate();
    
    // Get daily and lifetime totals for all metrics
    const dailyDownloads = parseInt(await redis.get(`analytics:daily:${date}:downloads:total`) || '0', 10);
    const dailyShares = parseInt(await redis.get(`analytics:daily:${date}:shares:total`) || '0', 10);
    const dailyBatches = parseInt(await redis.get(`analytics:daily:${date}:batches_generated:total`) || '0', 10);
    const dailyPhotos = parseInt(await redis.get(`analytics:daily:${date}:photos_generated:total`) || '0', 10);
    const dailyEnhanced = parseInt(await redis.get(`analytics:daily:${date}:photos_enhanced:total`) || '0', 10);
    const dailyCamera = parseInt(await redis.get(`analytics:daily:${date}:photos_taken_camera:total`) || '0', 10);
    const dailyUploaded = parseInt(await redis.get(`analytics:daily:${date}:photos_uploaded_browse:total`) || '0', 10);
    const dailyTwitter = parseInt(await redis.get(`analytics:daily:${date}:twitter_shares:total`) || '0', 10);
    
    const lifetimeDownloads = parseInt(await redis.get(`analytics:lifetime:downloads:total`) || '0', 10);
    const lifetimeShares = parseInt(await redis.get(`analytics:lifetime:shares:total`) || '0', 10);
    const lifetimeBatches = parseInt(await redis.get(`analytics:lifetime:batches_generated:total`) || '0', 10);
    const lifetimePhotos = parseInt(await redis.get(`analytics:lifetime:photos_generated:total`) || '0', 10);
    const lifetimeEnhanced = parseInt(await redis.get(`analytics:lifetime:photos_enhanced:total`) || '0', 10);
    const lifetimeCamera = parseInt(await redis.get(`analytics:lifetime:photos_taken_camera:total`) || '0', 10);
    const lifetimeUploaded = parseInt(await redis.get(`analytics:lifetime:photos_uploaded_browse:total`) || '0', 10);
    const lifetimeTwitter = parseInt(await redis.get(`analytics:lifetime:twitter_shares:total`) || '0', 10);
    
    // Get top prompts efficiently using sorted sets
    const lifetimeDownloadLeaderboard = await redis.zRangeWithScores('analytics:lifetime:downloads:leaderboard', 0, 19, { REV: true });
    const lifetimeShareLeaderboard = await redis.zRangeWithScores('analytics:lifetime:shares:leaderboard', 0, 19, { REV: true });
    
    // Create a map to combine download and share data
    const promptStats = new Map();
    
    // Process download leaderboard
    lifetimeDownloadLeaderboard.forEach(item => {
      const promptId = item.value;
      const downloads = item.score;
      promptStats.set(promptId, { promptId, downloads, shares: 0, combined: downloads });
    });
    
    // Process share leaderboard and merge with downloads
    lifetimeShareLeaderboard.forEach(item => {
      const promptId = item.value;
      const shares = item.score;
      if (promptStats.has(promptId)) {
        const existing = promptStats.get(promptId);
        existing.shares = shares;
        existing.combined = existing.downloads + shares;
      } else {
        promptStats.set(promptId, { promptId, downloads: 0, shares, combined: shares });
      }
    });
    
    // Filter out non-trackable prompts and convert to array and sort by combined score
    const nonTrackablePrompts = ['custom', 'browseGallery', 'random', 'randomMix', 'RANDOM_SINGLE_STYLE'];
    const topPrompts = Array.from(promptStats.values())
      .filter(item => !nonTrackablePrompts.includes(item.promptId))
      .sort((a, b) => b.combined - a.combined)
      .slice(0, 20);
    
    return {
      daily: {
        downloads: dailyDownloads,
        shares: dailyShares,
        combined: dailyDownloads + dailyShares,
        batches_generated: dailyBatches,
        photos_generated: dailyPhotos,
        photos_enhanced: dailyEnhanced,
        photos_taken_camera: dailyCamera,
        photos_uploaded_browse: dailyUploaded,
        twitter_shares: dailyTwitter
      },
      lifetime: {
        downloads: lifetimeDownloads,
        shares: lifetimeShares,
        combined: lifetimeDownloads + lifetimeShares,
        batches_generated: lifetimeBatches,
        photos_generated: lifetimePhotos,
        photos_enhanced: lifetimeEnhanced,
        photos_taken_camera: lifetimeCamera,
        photos_uploaded_browse: lifetimeUploaded,
        twitter_shares: lifetimeTwitter
      },
      topPrompts,
      date
    };
  } catch (error) {
    console.error('[Analytics] ❌ Error getting dashboard data:', error);
    return {
      daily: { 
        downloads: 0, 
        shares: 0, 
        combined: 0,
        batches_generated: 0,
        photos_generated: 0,
        photos_enhanced: 0,
        photos_taken_camera: 0,
        photos_uploaded_browse: 0,
        twitter_shares: 0
      },
      lifetime: { 
        downloads: 0, 
        shares: 0, 
        combined: 0,
        batches_generated: 0,
        photos_generated: 0,
        photos_enhanced: 0,
        photos_taken_camera: 0,
        photos_uploaded_browse: 0,
        twitter_shares: 0
      },
      topPrompts: [],
      date: getCurrentUTCDate()
    };
  }
};

/**
 * Track a general metric (batches, photos generated, etc.)
 * @param {string} metricType - The metric type (e.g., 'batches_generated', 'photos_generated')
 * @param {number} amount - Amount to increment by (default: 1)
 */
export const trackMetric = async (metricType, amount = 1) => {
  const redis = getRedisClient();
  if (!redis) {
    console.warn('[Analytics] Redis not available, skipping metric tracking');
    return;
  }

  try {
    const date = getCurrentUTCDate();
    
    // Use permanent keys for historical data (no expiry)
    const dailyKey = `analytics:daily:${date}:${metricType}:total`;
    const lifetimeKey = `analytics:lifetime:${metricType}:total`;
    
    // Increment both daily and lifetime counters
    await redis.incrBy(dailyKey, amount);
    await redis.incrBy(lifetimeKey, amount);
    
    // NO expiry on daily keys - keep forever for historical charting
    console.log(`[Analytics] ✅ Tracked ${metricType}: +${amount} (daily: ${dailyKey}, lifetime: ${lifetimeKey})`);
    
  } catch (error) {
    console.error(`[Analytics] ❌ Error tracking metric ${metricType}:`, error);
  }
};

/**
 * Get historical analytics data for the last N days
 * @param {number} days - Number of days to retrieve (default 30)
 * @returns {Array} Array of daily analytics data
 */
export const getHistoricalData = async (days = 30) => {
  const redis = getRedisClient();
  if (!redis) {
    console.warn('[Analytics] Redis not available, returning empty historical data');
    return [];
  }

  try {
    const historicalData = [];
    const today = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      // Get all daily metrics for this date
      const dailyDownloads = parseInt(await redis.get(`analytics:daily:${dateStr}:downloads:total`) || '0', 10);
      const dailyShares = parseInt(await redis.get(`analytics:daily:${dateStr}:shares:total`) || '0', 10);
      const dailyBatches = parseInt(await redis.get(`analytics:daily:${dateStr}:batches_generated:total`) || '0', 10);
      const dailyPhotos = parseInt(await redis.get(`analytics:daily:${dateStr}:photos_generated:total`) || '0', 10);
      const dailyEnhanced = parseInt(await redis.get(`analytics:daily:${dateStr}:photos_enhanced:total`) || '0', 10);
      const dailyCamera = parseInt(await redis.get(`analytics:daily:${dateStr}:photos_taken_camera:total`) || '0', 10);
      const dailyUploaded = parseInt(await redis.get(`analytics:daily:${dateStr}:photos_uploaded_browse:total`) || '0', 10);
      const dailyTwitter = parseInt(await redis.get(`analytics:daily:${dateStr}:twitter_shares:total`) || '0', 10);
      
      historicalData.push({
        date: dateStr,
        downloads: dailyDownloads,
        shares: dailyShares,
        combined: dailyDownloads + dailyShares,
        batches_generated: dailyBatches,
        photos_generated: dailyPhotos,
        photos_enhanced: dailyEnhanced,
        photos_taken_camera: dailyCamera,
        photos_uploaded_browse: dailyUploaded,
        twitter_shares: dailyTwitter
      });
    }
    
    // Return in chronological order (oldest first)
    return historicalData.reverse();
  } catch (error) {
    console.error('[Analytics] ❌ Error getting historical data:', error);
    return [];
  }
};

/**
 * Get top prompts by popularity
 * @param {number} limit - Number of top prompts to return
 * @returns {Array} Array of top prompts with stats
 */
export const getTopPrompts = async (limit = 10) => {
  const dashboardData = await getDashboardData();
  return dashboardData.topPrompts.slice(0, limit);
};

/**
 * Clear all analytics data (for testing/admin purposes)
 */
export const clearAllAnalytics = async () => {
  const redis = getRedisClient();
  if (!redis) {
    console.warn('[Analytics] Redis not available, cannot clear analytics');
    return false;
  }

  try {
    const analyticsKeys = await redis.keys('analytics:*');
    if (analyticsKeys.length > 0) {
      await redis.del(analyticsKeys);
      console.log(`[Analytics] ✅ Cleared ${analyticsKeys.length} analytics keys`);
    }
    return true;
  } catch (error) {
    console.error('[Analytics] ❌ Error clearing analytics:', error);
    return false;
  }
};