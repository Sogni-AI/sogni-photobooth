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
    
    // Set expiry on daily keys (30 days)
    await redis.expire(dailyLeaderboard, 30 * 24 * 60 * 60);
    await redis.expire(dailyTotalKey, 30 * 24 * 60 * 60);
    
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
    
    // Set expiry on daily keys (30 days)
    await redis.expire(dailyLeaderboard, 30 * 24 * 60 * 60);
    await redis.expire(dailyTotalKey, 30 * 24 * 60 * 60);
    
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
      daily: { downloads: 0, shares: 0, combined: 0 },
      lifetime: { downloads: 0, shares: 0, combined: 0 },
      topPrompts: [],
      date: getCurrentUTCDate()
    };
  }

  try {
    const date = getCurrentUTCDate();
    
    // Get daily and lifetime totals
    const dailyDownloads = parseInt(await redis.get(`analytics:daily:${date}:downloads:total`) || '0', 10);
    const dailyShares = parseInt(await redis.get(`analytics:daily:${date}:shares:total`) || '0', 10);
    const lifetimeDownloads = parseInt(await redis.get(`analytics:lifetime:downloads:total`) || '0', 10);
    const lifetimeShares = parseInt(await redis.get(`analytics:lifetime:shares:total`) || '0', 10);
    
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
    
    // Convert to array and sort by combined score
    const topPrompts = Array.from(promptStats.values())
      .sort((a, b) => b.combined - a.combined)
      .slice(0, 20);
    
    return {
      daily: {
        downloads: dailyDownloads,
        shares: dailyShares,
        combined: dailyDownloads + dailyShares
      },
      lifetime: {
        downloads: lifetimeDownloads,
        shares: lifetimeShares,
        combined: lifetimeDownloads + lifetimeShares
      },
      topPrompts,
      date
    };
  } catch (error) {
    console.error('[Analytics] ❌ Error getting dashboard data:', error);
    return {
      daily: { downloads: 0, shares: 0, combined: 0 },
      lifetime: { downloads: 0, shares: 0, combined: 0 },
      topPrompts: [],
      date: getCurrentUTCDate()
    };
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