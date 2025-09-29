#!/usr/bin/env node

/**
 * Cleanup script to remove randomMix entries from analytics data
 * This script will remove randomMix from Redis analytics data since it's not a real prompt
 */

import { getRedisClient } from '../services/redisService.js';

const cleanupRandomMix = async () => {
  console.log('🧹 Starting randomMix cleanup from analytics...');
  
  const redis = getRedisClient();
  if (!redis) {
    console.error('❌ Redis not available, cannot cleanup');
    process.exit(1);
  }

  try {
    let removedCount = 0;
    
    // Remove randomMix from lifetime leaderboards
    const lifetimeDownloadLeaderboard = 'analytics:lifetime:downloads:leaderboard';
    const lifetimeShareLeaderboard = 'analytics:lifetime:shares:leaderboard';
    
    const downloadRemoved = await redis.zRem(lifetimeDownloadLeaderboard, 'randomMix');
    const shareRemoved = await redis.zRem(lifetimeShareLeaderboard, 'randomMix');
    
    if (downloadRemoved > 0) {
      console.log('✅ Removed randomMix from lifetime downloads leaderboard');
      removedCount++;
    }
    
    if (shareRemoved > 0) {
      console.log('✅ Removed randomMix from lifetime shares leaderboard');
      removedCount++;
    }
    
    // Get all daily leaderboard keys and remove randomMix from them
    const dailyKeys = await redis.keys('analytics:daily:*:*:leaderboard');
    
    for (const key of dailyKeys) {
      const removed = await redis.zRem(key, 'randomMix');
      if (removed > 0) {
        console.log(`✅ Removed randomMix from ${key}`);
        removedCount++;
      }
    }
    
    // Also remove any direct randomMix keys (though these shouldn't exist with the new logic)
    const randomMixKeys = await redis.keys('*randomMix*');
    
    for (const key of randomMixKeys) {
      if (key.includes('analytics')) {
        await redis.del(key);
        console.log(`✅ Removed key: ${key}`);
        removedCount++;
      }
    }

    if (removedCount === 0) {
      console.log('✨ No randomMix entries found in analytics data - already clean!');
    } else {
      console.log(`🎉 Cleanup completed! Removed ${removedCount} randomMix entries from analytics.`);
    }
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
};

// Run the cleanup
cleanupRandomMix();
