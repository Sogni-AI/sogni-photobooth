#!/usr/bin/env node

/**
 * Migration script to migrate existing metrics data to the new analytics system
 * This script will copy data from the old metrics:* keys to the new analytics:* keys
 */

import { getRedisClient } from '../services/redisService.js';
import { trackMetric } from '../services/analyticsService.js';

const migrateAnalytics = async () => {
  console.log('🔄 Starting analytics migration...');
  
  const redis = getRedisClient();
  if (!redis) {
    console.error('❌ Redis not available, cannot migrate');
    process.exit(1);
  }

  try {
    // Get all existing metrics keys
    const metricsKeys = await redis.keys('metrics:*');
    console.log(`📊 Found ${metricsKeys.length} existing metrics keys`);

    let migrated = 0;
    
    for (const key of metricsKeys) {
      try {
        // Parse the key to understand what it contains
        // Format: metrics:today:YYYY-MM-DD:metric_name or metrics:lifetime:metric_name
        const keyParts = key.split(':');
        
        if (keyParts.length >= 3) {
          const value = parseInt(await redis.get(key) || '0', 10);
          
          if (keyParts[1] === 'today' && keyParts.length === 4) {
            // Daily metric: metrics:today:YYYY-MM-DD:metric_name
            const date = keyParts[2];
            const metricName = keyParts[3];
            const newKey = `analytics:daily:${date}:${metricName}:total`;
            
            // Only migrate if the new key doesn't already exist
            const existingValue = await redis.get(newKey);
            if (!existingValue) {
              await redis.set(newKey, value);
              console.log(`✅ Migrated daily ${metricName} for ${date}: ${value}`);
              migrated++;
            }
            
          } else if (keyParts[1] === 'lifetime' && keyParts.length === 3) {
            // Lifetime metric: metrics:lifetime:metric_name
            const metricName = keyParts[2];
            const newKey = `analytics:lifetime:${metricName}:total`;
            
            // Only migrate if the new key doesn't already exist
            const existingValue = await redis.get(newKey);
            if (!existingValue) {
              await redis.set(newKey, value);
              console.log(`✅ Migrated lifetime ${metricName}: ${value}`);
              migrated++;
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error migrating key ${key}:`, error);
      }
    }

    console.log(`🎉 Migration completed! Migrated ${migrated} metrics.`);
    
    // Verify migration by checking some key metrics
    console.log('\n📋 Verification:');
    const lifetimeBatches = await redis.get('analytics:lifetime:batches_generated:total');
    const lifetimePhotos = await redis.get('analytics:lifetime:photos_generated:total');
    console.log(`   Lifetime batches: ${lifetimeBatches || 0}`);
    console.log(`   Lifetime photos: ${lifetimePhotos || 0}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
};

// Run the migration
migrateAnalytics();
