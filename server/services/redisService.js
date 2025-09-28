import { createClient } from 'redis';
import dotenv from 'dotenv';
import process from 'process';

// Load environment variables if not already loaded
dotenv.config();

// Redis configuration
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';
const REDIS_DB_INDEX = process.env.REDIS_DB_INDEX || 1; // Use a specific DB index for Twitter OAuth data

// Enable detailed logging
const VERBOSE_LOGGING = process.env.REDIS_VERBOSE_LOGGING === 'true';

// Log Redis config at startup
console.log(`[Redis Config] Host: ${REDIS_HOST}, Port: ${REDIS_PORT}, DB: ${REDIS_DB_INDEX}, Auth: ${REDIS_PASSWORD ? 'Yes' : 'No'}`);
console.log(`[Redis Config] Verbose logging: ${VERBOSE_LOGGING ? 'Enabled' : 'Disabled'}`);

// Create and configure the Redis client
const redisClient = createClient({
  url: `redis://${REDIS_HOST}:${REDIS_PORT}`,
  password: REDIS_PASSWORD,
  database: REDIS_DB_INDEX
});

// Redis client events for connection monitoring
redisClient.on('connect', () => {
  console.log(`[Redis] Socket connection established to ${REDIS_HOST}:${REDIS_PORT}`);
});

redisClient.on('ready', () => {
  console.log(`[Redis] Client is ready to use on database ${REDIS_DB_INDEX}`);
});

redisClient.on('reconnecting', () => {
  console.log('[Redis] Client is reconnecting...');
});

redisClient.on('end', () => {
  console.log('[Redis] Client connection closed');
});

// Error handling for Redis connection
redisClient.on('error', (err) => {
  console.error('[Redis Error]', err);
});

// Initialize connection
(async () => {
  try {
    await redisClient.connect();
    console.log(`[Redis] Connected successfully at ${REDIS_HOST}:${REDIS_PORT} using database ${REDIS_DB_INDEX}`);
    
    // Test connectivity with a basic operation
    await redisClient.set('redis:test:key', 'connection-test', { EX: 60 });
    const testResult = await redisClient.get('redis:test:key');
    console.log(`[Redis] Connection test ${testResult === 'connection-test' ? 'succeeded ✓' : 'failed ✗'}`);
    
    if (VERBOSE_LOGGING) {
      try {
        // Check and log the number of Twitter OAuth sessions
        const oauthKeys = await redisClient.keys('twitter:oauth:session:*');
        const stateKeys = await redisClient.keys('twitter:oauth:state:*');
        console.log(`[Redis] Current Twitter OAuth sessions: ${oauthKeys.length}, state mappings: ${stateKeys.length}`);
      } catch (err) {
        console.error('[Redis] Error fetching session stats:', err);
      }
    }
  } catch (error) {
    console.error('[Redis] Failed to connect:', error);
    console.warn('[Redis] Server will continue without Redis (in-memory fallback will be used)');
  }
})();

// For keys related to Twitter OAuth, use prefixes for better organization
const TWITTER_OAUTH_PREFIX = 'twitter:oauth:session:';
const TWITTER_STATE_PREFIX = 'twitter:oauth:state:';

/**
 * Store Twitter OAuth data with automatic expiration
 * @param {string} sessionId - The user's session ID
 * @param {Object} oauthData - OAuth data to store
 * @param {number} ttlSeconds - Time to live in seconds
 */
export const storeTwitterOAuthData = async (sessionId, oauthData, ttlSeconds = 900) => {
  if (!redisClient.isOpen) {
    console.warn('[Redis] Not connected, using in-memory storage for OAuth data');
    return false;
  }
  
  try {
    const key = `${TWITTER_OAUTH_PREFIX}${sessionId}`;
    await redisClient.set(key, JSON.stringify(oauthData), { EX: ttlSeconds });
    // console.log(`[Redis] Stored Twitter OAuth data for session ${sessionId} with TTL ${ttlSeconds}s`);
    
    if (VERBOSE_LOGGING) {
      console.log(`[Redis] OAuth data for ${sessionId}:`, {
        imageUrl: oauthData.imageUrl?.substring(0, 30) + '...',
        timestamp: oauthData.timestamp,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString()
      });
    }
    return true;
  } catch (error) {
    console.error('[Redis] Error storing Twitter OAuth data:', error);
    return false;
  }
};

/**
 * Store mapping between state parameter and session ID
 * @param {string} state - The OAuth state parameter
 * @param {string} sessionId - The user's session ID
 * @param {number} ttlSeconds - Time to live in seconds
 */
export const storeTwitterStateMapping = async (state, sessionId, ttlSeconds = 900) => {
  if (!redisClient.isOpen) {
    console.warn('[Redis] Not connected, using in-memory storage for state mapping');
    return false;
  }
  
  try {
    const key = `${TWITTER_STATE_PREFIX}${state}`;
    await redisClient.set(key, sessionId, { EX: ttlSeconds });
    //console.log(`[Redis] Stored Twitter state mapping ${state.substring(0, 8)}... -> ${sessionId} with TTL ${ttlSeconds}s`);
    return true;
  } catch (error) {
    //console.error('[Redis] Error storing Twitter state mapping:', error);
    return false;
  }
};

/**
 * Retrieve Twitter OAuth data for a session
 * @param {string} sessionId - The user's session ID
 * @returns {Object|null} The stored OAuth data or null if not found
 */
export const getTwitterOAuthData = async (sessionId) => {
  if (!redisClient.isOpen) {
    console.warn('[Redis] Not connected, cannot retrieve OAuth data from Redis');
    return null;
  }
  
  try {
    const key = `${TWITTER_OAUTH_PREFIX}${sessionId}`;
    const data = await redisClient.get(key);
    
    if (data) {
      console.log(`[Redis] Retrieved OAuth data for session ${sessionId} ✓`);
      if (VERBOSE_LOGGING) {
        const ttl = await redisClient.ttl(key);
        console.log(`[Redis] OAuth key ${key} has TTL: ${ttl} seconds`);
      }
      return JSON.parse(data);
    } else {
      console.log(`[Redis] No OAuth data found for session ${sessionId} ✗`);
      return null;
    }
  } catch (error) {
    console.error('[Redis] Error retrieving Twitter OAuth data:', error);
    return null;
  }
};

/**
 * Get session ID associated with a state parameter
 * @param {string} state - The OAuth state parameter
 * @returns {string|null} The associated session ID or null if not found
 */
export const getSessionIdFromState = async (state) => {
  if (!redisClient.isOpen) {
    console.warn('[Redis] Not connected, cannot retrieve session ID from state in Redis');
    return null;
  }
  
  try {
    const key = `${TWITTER_STATE_PREFIX}${state}`;
    const sessionId = await redisClient.get(key);
    
    if (sessionId) {
      console.log(`[Redis] Retrieved session ID ${sessionId} for state ${state.substring(0, 8)}... ✓`);
    } else {
      console.log(`[Redis] No session ID found for state ${state.substring(0, 8)}... ✗`);
    }
    
    return sessionId;
  } catch (error) {
    console.error('[Redis] Error retrieving session ID from state:', error);
    return null;
  }
};

/**
 * Delete Twitter OAuth data for a session
 * @param {string} sessionId - The user's session ID
 */
export const deleteTwitterOAuthData = async (sessionId) => {
  if (!redisClient.isOpen) {
    console.warn('[Redis] Not connected, skipping OAuth data deletion from Redis');
    return false;
  }
  
  try {
    const key = `${TWITTER_OAUTH_PREFIX}${sessionId}`;
    await redisClient.del(key);
    console.log(`[Redis] Deleted Twitter OAuth data for session ${sessionId}`);
    return true;
  } catch (error) {
    console.error('[Redis] Error deleting Twitter OAuth data:', error);
    return false;
  }
};

/**
 * List all Twitter OAuth sessions
 * Useful for debugging Redis integration
 */
export const listAllTwitterSessions = async () => {
  if (!redisClient.isOpen) {
    console.warn('[Redis] Not connected, cannot list Twitter sessions');
    return { sessions: [], states: [] };
  }
  
  try {
    const sessionKeys = await redisClient.keys(`${TWITTER_OAUTH_PREFIX}*`);
    const stateKeys = await redisClient.keys(`${TWITTER_STATE_PREFIX}*`);
    
    console.log(`[Redis] Found ${sessionKeys.length} active OAuth sessions and ${stateKeys.length} state mappings`);
    
    const sessionDetails = [];
    for (const key of sessionKeys) {
      const sessionId = key.replace(TWITTER_OAUTH_PREFIX, '');
      const ttl = await redisClient.ttl(key);
      sessionDetails.push({ sessionId, ttl });
    }
    
    return { 
      sessions: sessionDetails,
      states: stateKeys.map(key => key.replace(TWITTER_STATE_PREFIX, ''))
    };
  } catch (error) {
    console.error('[Redis] Error listing Twitter sessions:', error);
    return { sessions: [], states: [] };
  }
};

export const redisReady = () => redisClient.isOpen;

/**
 * Get the Redis client instance
 * @returns {Object|null} - Redis client or null if not connected
 */
export const getRedisClient = () => {
  return redisClient.isOpen ? redisClient : null;
};

export default redisClient;

// Metrics tracking prefixes
const METRICS_PREFIX = 'metrics:';
const TODAY_PREFIX = 'today:';  // UTC daily metrics
const LIFETIME_PREFIX = 'lifetime:'; // All-time metrics

/**
 * Increment a specific metric counter
 * @param {string} metric - The metric name to increment
 * @param {number} amount - Amount to increment by (default: 1)
 * @returns {boolean} - Success status
 */
export const incrementMetric = async (metric, amount = 1) => {
  if (!redisClient.isOpen) {
    console.warn(`[Redis] Not connected, skipping metrics increment for ${metric}`);
    return false;
  }

  try {
    // Get current UTC date (YYYY-MM-DD)
    const today = new Date().toISOString().split('T')[0];
    const todayKey = `${METRICS_PREFIX}${TODAY_PREFIX}${today}:${metric}`;
    const lifetimeKey = `${METRICS_PREFIX}${LIFETIME_PREFIX}${metric}`;

    // Increment both daily and lifetime counters
    await redisClient.incrBy(todayKey, amount);
    await redisClient.incrBy(lifetimeKey, amount);
    
    // Set expiry on daily metrics (keep for 90 days)
    await redisClient.expire(todayKey, 90 * 24 * 60 * 60);

    console.log(`[Redis] Incremented metric ${metric} by ${amount}`);
    return true;
  } catch (error) {
    console.error(`[Redis] Error incrementing metric ${metric}:`, error);
    return false;
  }
};

/**
 * Increment batches generated metric
 * @param {number} amount - Amount to increment by (default: 1)
 */
export const incrementBatchesGenerated = async (amount = 1) => {
  return incrementMetric('batches_generated', amount);
};

/**
 * Increment photos generated metric
 * @param {number} amount - Amount to increment by (default: 1)
 */
export const incrementPhotosGenerated = async (amount = 1) => {
  return incrementMetric('photos_generated', amount);
};

/**
 * Increment photos enhanced metric
 * @param {number} amount - Amount to increment by (default: 1)
 */
export const incrementPhotosEnhanced = async (amount = 1) => {
  return incrementMetric('photos_enhanced', amount);
};

/**
 * Increment photos taken via camera metric
 * @param {number} amount - Amount to increment by (default: 1)
 */
export const incrementPhotosTakenViaCamera = async (amount = 1) => {
  return incrementMetric('photos_taken_camera', amount);
};

/**
 * Increment photos uploaded via browse metric
 * @param {number} amount - Amount to increment by (default: 1)
 */
export const incrementPhotosUploadedViaBrowse = async (amount = 1) => {
  return incrementMetric('photos_uploaded_browse', amount);
};

/**
 * Increment Twitter shares metric
 * @param {number} amount - Amount to increment by (default: 1)
 */
export const incrementTwitterShares = async (amount = 1) => {
  return incrementMetric('twitter_shares', amount);
};

/**
 * Get all metrics for today and lifetime
 * @returns {Object} - Metrics data or null if error
 */
export const getAllMetrics = async () => {
  if (!redisClient.isOpen) {
    console.warn('[Redis] Not connected, cannot retrieve metrics');
    return null;
  }

  try {
    // Get current UTC date (YYYY-MM-DD)
    const today = new Date().toISOString().split('T')[0];
    
    // Define metric keys
    const metrics = [
      'batches_generated',
      'photos_generated',
      'photos_enhanced',
      'photos_taken_camera',
      'photos_uploaded_browse',
      'twitter_shares'
    ];
    
    const result = {
      today: {},
      lifetime: {},
      date: today
    };
    
    // Get all today's metrics
    for (const metric of metrics) {
      const todayKey = `${METRICS_PREFIX}${TODAY_PREFIX}${today}:${metric}`;
      const lifetimeKey = `${METRICS_PREFIX}${LIFETIME_PREFIX}${metric}`;
      
      const todayValue = await redisClient.get(todayKey) || '0';
      const lifetimeValue = await redisClient.get(lifetimeKey) || '0';
      
      result.today[metric] = parseInt(todayValue, 10);
      result.lifetime[metric] = parseInt(lifetimeValue, 10);
    }
    
    return result;
  } catch (error) {
    console.error('[Redis] Error retrieving metrics:', error);
    return null;
  }
}; 