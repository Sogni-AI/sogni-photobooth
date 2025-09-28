import { getRedisClient } from './redisService.js';

/**
 * Analytics Service for tracking photobooth style popularity
 * Tracks downloads and shares by prompt ID with daily and lifetime metrics
 */

// Redis key patterns
const KEYS = {
  // Daily metrics: analytics:daily:2025-01-15:downloads:anime1990s
  DAILY_DOWNLOADS: (date, promptId) => `analytics:daily:${date}:downloads:${promptId}`,
  DAILY_SHARES: (date, promptId) => `analytics:daily:${date}:shares:${promptId}`,
  
  // Lifetime metrics: analytics:lifetime:downloads:anime1990s
  LIFETIME_DOWNLOADS: (promptId) => `analytics:lifetime:downloads:${promptId}`,
  LIFETIME_SHARES: (promptId) => `analytics:lifetime:shares:${promptId}`,
  
  // Combined metrics: analytics:daily:2025-01-15:combined:anime1990s
  DAILY_COMBINED: (date, promptId) => `analytics:daily:${date}:combined:${promptId}`,
  LIFETIME_COMBINED: (promptId) => `analytics:lifetime:combined:${promptId}`,
  
  // Metadata
  PROMPT_METADATA: (promptId) => `analytics:metadata:${promptId}`,
  DAILY_ACTIVE_PROMPTS: (date) => `analytics:active:${date}`,
  
  // Leaderboards
  DAILY_LEADERBOARD_DOWNLOADS: (date) => `analytics:leaderboard:daily:${date}:downloads`,
  DAILY_LEADERBOARD_SHARES: (date) => `analytics:leaderboard:daily:${date}:shares`,
  DAILY_LEADERBOARD_COMBINED: (date) => `analytics:leaderboard:daily:${date}:combined`,
  LIFETIME_LEADERBOARD_DOWNLOADS: () => `analytics:leaderboard:lifetime:downloads`,
  LIFETIME_LEADERBOARD_SHARES: () => `analytics:leaderboard:lifetime:shares`,
  LIFETIME_LEADERBOARD_COMBINED: () => `analytics:leaderboard:lifetime:combined`
};

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
    const timestamp = Date.now();
    
    // Use Redis pipeline for atomic operations
    const pipeline = redis.multi();
    
    // Increment daily counters
    pipeline.incr(KEYS.DAILY_DOWNLOADS(date, promptId));
    pipeline.incr(KEYS.DAILY_COMBINED(date, promptId));
    
    // Increment lifetime counters
    pipeline.incr(KEYS.LIFETIME_DOWNLOADS(promptId));
    pipeline.incr(KEYS.LIFETIME_COMBINED(promptId));
    
    // Update leaderboards (sorted sets with scores)
    pipeline.zincrby(KEYS.DAILY_LEADERBOARD_DOWNLOADS(date), 1, promptId);
    pipeline.zincrby(KEYS.DAILY_LEADERBOARD_COMBINED(date), 1, promptId);
    pipeline.zincrby(KEYS.LIFETIME_LEADERBOARD_DOWNLOADS(), 1, promptId);
    pipeline.zincrby(KEYS.LIFETIME_LEADERBOARD_COMBINED(), 1, promptId);
    
    // Track active prompts for the day
    pipeline.sadd(KEYS.DAILY_ACTIVE_PROMPTS(date), promptId);
    
    // Store metadata if provided
    if (Object.keys(metadata).length > 0) {
      const metadataKey = KEYS.PROMPT_METADATA(promptId);
      pipeline.hset(metadataKey, {
        lastDownload: timestamp,
        ...metadata
      });
    }
    
    // Set expiration for daily keys (30 days)
    pipeline.expire(KEYS.DAILY_DOWNLOADS(date, promptId), 30 * 24 * 60 * 60);
    pipeline.expire(KEYS.DAILY_COMBINED(date, promptId), 30 * 24 * 60 * 60);
    pipeline.expire(KEYS.DAILY_LEADERBOARD_DOWNLOADS(date), 30 * 24 * 60 * 60);
    pipeline.expire(KEYS.DAILY_LEADERBOARD_COMBINED(date), 30 * 24 * 60 * 60);
    pipeline.expire(KEYS.DAILY_ACTIVE_PROMPTS(date), 30 * 24 * 60 * 60);
    
    await pipeline.exec();
    
    console.log(`[Analytics] Tracked download for prompt: ${promptId} on ${date}`);
  } catch (error) {
    console.error('[Analytics] Error tracking download:', error);
  }
};

/**
 * Track a share event for a specific prompt
 * @param {string} promptId - The prompt ID (e.g., 'anime1990s')
 * @param {Object} metadata - Optional metadata about the share
 */
export const trackShare = async (promptId, metadata = {}) => {
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
    const timestamp = Date.now();
    
    // Use Redis pipeline for atomic operations
    const pipeline = redis.multi();
    
    // Increment daily counters
    pipeline.incr(KEYS.DAILY_SHARES(date, promptId));
    pipeline.incr(KEYS.DAILY_COMBINED(date, promptId));
    
    // Increment lifetime counters
    pipeline.incr(KEYS.LIFETIME_SHARES(promptId));
    pipeline.incr(KEYS.LIFETIME_COMBINED(promptId));
    
    // Update leaderboards (sorted sets with scores)
    pipeline.zincrby(KEYS.DAILY_LEADERBOARD_SHARES(date), 1, promptId);
    pipeline.zincrby(KEYS.DAILY_LEADERBOARD_COMBINED(date), 1, promptId);
    pipeline.zincrby(KEYS.LIFETIME_LEADERBOARD_SHARES(), 1, promptId);
    pipeline.zincrby(KEYS.LIFETIME_LEADERBOARD_COMBINED(), 1, promptId);
    
    // Track active prompts for the day
    pipeline.sadd(KEYS.DAILY_ACTIVE_PROMPTS(date), promptId);
    
    // Store metadata if provided
    if (Object.keys(metadata).length > 0) {
      const metadataKey = KEYS.PROMPT_METADATA(promptId);
      pipeline.hset(metadataKey, {
        lastShare: timestamp,
        ...metadata
      });
    }
    
    // Set expiration for daily keys (30 days)
    pipeline.expire(KEYS.DAILY_SHARES(date, promptId), 30 * 24 * 60 * 60);
    pipeline.expire(KEYS.DAILY_COMBINED(date, promptId), 30 * 24 * 60 * 60);
    pipeline.expire(KEYS.DAILY_LEADERBOARD_SHARES(date), 30 * 24 * 60 * 60);
    pipeline.expire(KEYS.DAILY_LEADERBOARD_COMBINED(date), 30 * 24 * 60 * 60);
    pipeline.expire(KEYS.DAILY_ACTIVE_PROMPTS(date), 30 * 24 * 60 * 60);
    
    await pipeline.exec();
    
    console.log(`[Analytics] Tracked share for prompt: ${promptId} on ${date}`);
  } catch (error) {
    console.error('[Analytics] Error tracking share:', error);
  }
};

/**
 * Get analytics for a specific prompt
 * @param {string} promptId - The prompt ID
 * @param {string} date - Optional date (YYYY-MM-DD), defaults to today
 */
export const getPromptAnalytics = async (promptId, date = null) => {
  const redis = getRedisClient();
  if (!redis) {
    console.warn('[Analytics] Redis not available');
    return null;
  }

  try {
    const targetDate = date || getCurrentUTCDate();
    
    const [
      dailyDownloads,
      dailyShares,
      dailyCombined,
      lifetimeDownloads,
      lifetimeShares,
      lifetimeCombined,
      metadata
    ] = await Promise.all([
      redis.get(KEYS.DAILY_DOWNLOADS(targetDate, promptId)),
      redis.get(KEYS.DAILY_SHARES(targetDate, promptId)),
      redis.get(KEYS.DAILY_COMBINED(targetDate, promptId)),
      redis.get(KEYS.LIFETIME_DOWNLOADS(promptId)),
      redis.get(KEYS.LIFETIME_SHARES(promptId)),
      redis.get(KEYS.LIFETIME_COMBINED(promptId)),
      redis.hgetall(KEYS.PROMPT_METADATA(promptId))
    ]);
    
    return {
      promptId,
      date: targetDate,
      daily: {
        downloads: parseInt(dailyDownloads) || 0,
        shares: parseInt(dailyShares) || 0,
        combined: parseInt(dailyCombined) || 0
      },
      lifetime: {
        downloads: parseInt(lifetimeDownloads) || 0,
        shares: parseInt(lifetimeShares) || 0,
        combined: parseInt(lifetimeCombined) || 0
      },
      metadata: metadata || {}
    };
  } catch (error) {
    console.error('[Analytics] Error getting prompt analytics:', error);
    return null;
  }
};

/**
 * Get top prompts leaderboard
 * @param {string} type - 'downloads', 'shares', or 'combined'
 * @param {string} period - 'daily' or 'lifetime'
 * @param {string} date - Required for daily, ignored for lifetime (YYYY-MM-DD)
 * @param {number} limit - Number of top results to return (default: 50)
 */
export const getTopPrompts = async (type = 'combined', period = 'lifetime', date = null, limit = 50) => {
  const redis = getRedisClient();
  if (!redis) {
    console.warn('[Analytics] Redis not available');
    return [];
  }

  try {
    let leaderboardKey;
    
    if (period === 'daily') {
      const targetDate = date || getCurrentUTCDate();
      if (type === 'downloads') {
        leaderboardKey = KEYS.DAILY_LEADERBOARD_DOWNLOADS(targetDate);
      } else if (type === 'shares') {
        leaderboardKey = KEYS.DAILY_LEADERBOARD_SHARES(targetDate);
      } else {
        leaderboardKey = KEYS.DAILY_LEADERBOARD_COMBINED(targetDate);
      }
    } else {
      if (type === 'downloads') {
        leaderboardKey = KEYS.LIFETIME_LEADERBOARD_DOWNLOADS();
      } else if (type === 'shares') {
        leaderboardKey = KEYS.LIFETIME_LEADERBOARD_SHARES();
      } else {
        leaderboardKey = KEYS.LIFETIME_LEADERBOARD_COMBINED();
      }
    }
    
    // Get top prompts with scores (descending order)
    const results = await redis.zrevrange(leaderboardKey, 0, limit - 1, 'WITHSCORES');
    
    // Parse results into array of objects
    const topPrompts = [];
    for (let i = 0; i < results.length; i += 2) {
      topPrompts.push({
        promptId: results[i],
        count: parseInt(results[i + 1]) || 0,
        rank: Math.floor(i / 2) + 1
      });
    }
    
    return topPrompts;
  } catch (error) {
    console.error('[Analytics] Error getting top prompts:', error);
    return [];
  }
};

/**
 * Get analytics summary for a specific date
 * @param {string} date - Date in YYYY-MM-DD format, defaults to today
 */
export const getDailyAnalyticsSummary = async (date = null) => {
  const redis = getRedisClient();
  if (!redis) {
    console.warn('[Analytics] Redis not available');
    return null;
  }

  try {
    const targetDate = date || getCurrentUTCDate();
    
    // Get all active prompts for the date
    const activePrompts = await redis.smembers(KEYS.DAILY_ACTIVE_PROMPTS(targetDate));
    
    if (activePrompts.length === 0) {
      return {
        date: targetDate,
        totalPrompts: 0,
        totalDownloads: 0,
        totalShares: 0,
        totalCombined: 0,
        topPrompts: {
          downloads: [],
          shares: [],
          combined: []
        }
      };
    }
    
    // Get totals and top prompts
    const [
      topDownloads,
      topShares,
      topCombined
    ] = await Promise.all([
      getTopPrompts('downloads', 'daily', targetDate, 10),
      getTopPrompts('shares', 'daily', targetDate, 10),
      getTopPrompts('combined', 'daily', targetDate, 10)
    ]);
    
    // Calculate totals
    const totalDownloads = topDownloads.reduce((sum, item) => sum + item.count, 0);
    const totalShares = topShares.reduce((sum, item) => sum + item.count, 0);
    const totalCombined = topCombined.reduce((sum, item) => sum + item.count, 0);
    
    return {
      date: targetDate,
      totalPrompts: activePrompts.length,
      totalDownloads,
      totalShares,
      totalCombined,
      topPrompts: {
        downloads: topDownloads,
        shares: topShares,
        combined: topCombined
      }
    };
  } catch (error) {
    console.error('[Analytics] Error getting daily summary:', error);
    return null;
  }
};

/**
 * Get lifetime analytics summary
 */
export const getLifetimeAnalyticsSummary = async () => {
  const redis = getRedisClient();
  if (!redis) {
    console.warn('[Analytics] Redis not available');
    return null;
  }

  try {
    // Get top prompts
    const [
      topDownloads,
      topShares,
      topCombined
    ] = await Promise.all([
      getTopPrompts('downloads', 'lifetime', null, 10),
      getTopPrompts('shares', 'lifetime', null, 10),
      getTopPrompts('combined', 'lifetime', null, 10)
    ]);
    
    // Calculate totals
    const totalDownloads = topDownloads.reduce((sum, item) => sum + item.count, 0);
    const totalShares = topShares.reduce((sum, item) => sum + item.count, 0);
    const totalCombined = topCombined.reduce((sum, item) => sum + item.count, 0);
    
    // Count unique prompts that have any activity
    const uniquePromptsCount = new Set([
      ...topDownloads.map(p => p.promptId),
      ...topShares.map(p => p.promptId)
    ]).size;
    
    return {
      totalPrompts: uniquePromptsCount,
      totalDownloads,
      totalShares,
      totalCombined,
      topPrompts: {
        downloads: topDownloads,
        shares: topShares,
        combined: topCombined
      }
    };
  } catch (error) {
    console.error('[Analytics] Error getting lifetime summary:', error);
    return null;
  }
};

/**
 * Clear analytics data (for testing/admin purposes)
 * @param {string} type - 'daily', 'lifetime', or 'all'
 * @param {string} date - Required for daily cleanup (YYYY-MM-DD)
 */
export const clearAnalytics = async (type = 'all', date = null) => {
  const redis = getRedisClient();
  if (!redis) {
    console.warn('[Analytics] Redis not available');
    return false;
  }

  try {
    let keysToDelete = [];
    
    if (type === 'daily' && date) {
      // Get all keys for a specific date
      const pattern = `analytics:daily:${date}:*`;
      keysToDelete = await redis.keys(pattern);
      keysToDelete.push(KEYS.DAILY_ACTIVE_PROMPTS(date));
    } else if (type === 'lifetime') {
      // Get all lifetime keys
      const patterns = [
        'analytics:lifetime:*',
        'analytics:leaderboard:lifetime:*',
        'analytics:metadata:*'
      ];
      
      for (const pattern of patterns) {
        const keys = await redis.keys(pattern);
        keysToDelete.push(...keys);
      }
    } else if (type === 'all') {
      // Get all analytics keys
      keysToDelete = await redis.keys('analytics:*');
    }
    
    if (keysToDelete.length > 0) {
      await redis.del(keysToDelete);
      console.log(`[Analytics] Cleared ${keysToDelete.length} keys for type: ${type}`);
    }
    
    return true;
  } catch (error) {
    console.error('[Analytics] Error clearing analytics:', error);
    return false;
  }
};
