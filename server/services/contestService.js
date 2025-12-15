import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import {
  redisClient,
  redisReady,
  storeContestEntry as redisStoreEntry,
  getContestEntries as redisGetEntries,
  getContestEntry as redisGetEntry,
  getContestStats as redisGetStats,
  deleteContestEntry as redisDeleteEntry
} from './redisService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use the same uploads directory as imageHosting.js - relative to server's cwd
const uploadsDir = path.join(process.cwd(), 'uploads');

/**
 * Save a contest entry image/video and metadata
 * @param {Object} params - Contest entry parameters
 * @param {string} params.contestId - Contest identifier (e.g., 'halloween')
 * @param {string} params.imageUrl - Image data URL or URL to download
 * @param {string} [params.videoUrl] - Video data URL or URL to download
 * @param {boolean} [params.isVideo] - Whether this is a video submission
 * @param {string} params.prompt - User's prompt
 * @param {string} [params.username] - Username (from Sogni account)
 * @param {string} [params.address] - Wallet address
 * @param {string} [params.tweetId] - Twitter tweet ID
 * @param {string} [params.tweetUrl] - Twitter tweet URL
 * @param {Object} [params.metadata] - Additional metadata
 * @returns {Promise<Object>} Contest entry object
 */
export async function saveContestEntry({
  contestId,
  imageUrl,
  videoUrl,
  isVideo = false,
  prompt,
  username,
  address,
  tweetId,
  tweetUrl,
  metadata = {}
}) {
  try {
    // Generate unique entry ID
    const entryId = uuidv4();
    const timestamp = Date.now();

    // Create contest directory if it doesn't exist
    const contestDir = path.join(uploadsDir, 'contest', contestId);
    await fs.mkdir(contestDir, { recursive: true });

    // Save image file
    let imageFilename = null;
    let savedImagePath = null;
    
    if (imageUrl) {
      // Extract image data from data URL or download from URL
      if (imageUrl.startsWith('data:')) {
        // Data URL - extract and save
        const matches = imageUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (matches) {
          const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1]; // Normalize jpeg to jpg
          const base64Data = matches[2];
          imageFilename = `${entryId}.${ext}`;
          savedImagePath = path.join(contestDir, imageFilename);
          
          await fs.writeFile(savedImagePath, Buffer.from(base64Data, 'base64'));
          console.log(`[Contest] Saved data URL image to ${savedImagePath} (size: ${base64Data.length} chars)`);
        } else {
          console.error('[Contest] Failed to parse data URL format:', imageUrl.substring(0, 100));
        }
      } else {
        // Regular URL - download and save
        try {
          const response = await fetch(imageUrl);
          const buffer = await response.arrayBuffer();
          
          // Try to determine extension from content-type
          const contentType = response.headers.get('content-type');
          const ext = contentType?.includes('png') ? 'png' : 'jpg';
          
          imageFilename = `${entryId}.${ext}`;
          savedImagePath = path.join(contestDir, imageFilename);
          
          await fs.writeFile(savedImagePath, Buffer.from(buffer));
          console.log(`[Contest] Downloaded and saved image to ${savedImagePath}`);
        } catch (downloadError) {
          console.error('[Contest] Failed to download image:', downloadError);
          // Continue without image file
        }
      }
    }

    // Save video file if provided
    let videoFilename = null;
    let savedVideoPath = null;
    
    if (videoUrl && isVideo) {
      // Extract video data from data URL or download from URL
      if (videoUrl.startsWith('data:')) {
        // Data URL - extract and save
        const matches = videoUrl.match(/^data:video\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (matches) {
          const ext = matches[1]; // e.g., 'mp4'
          const base64Data = matches[2];
          videoFilename = `${entryId}-video.${ext}`;
          savedVideoPath = path.join(contestDir, videoFilename);
          
          await fs.writeFile(savedVideoPath, Buffer.from(base64Data, 'base64'));
          console.log(`[Contest] Saved data URL video to ${savedVideoPath} (size: ${base64Data.length} chars)`);
        } else {
          console.error('[Contest] Failed to parse video data URL format:', videoUrl.substring(0, 100));
        }
      } else {
        // Regular URL - download and save
        try {
          const response = await fetch(videoUrl);
          const buffer = await response.arrayBuffer();
          
          // Try to determine extension from content-type
          const contentType = response.headers.get('content-type');
          const ext = contentType?.includes('webm') ? 'webm' : 'mp4';
          
          videoFilename = `${entryId}-video.${ext}`;
          savedVideoPath = path.join(contestDir, videoFilename);
          
          await fs.writeFile(savedVideoPath, Buffer.from(buffer));
          console.log(`[Contest] Downloaded and saved video to ${savedVideoPath}`);
        } catch (downloadError) {
          console.error('[Contest] Failed to download video:', downloadError);
          // Continue without video file
        }
      }
    }

    // Determine the API base URL based on CLIENT_ORIGIN (same pattern as static file serving)
    const isLocal = process.env.CLIENT_ORIGIN?.includes('local');
    const isStaging = process.env.CLIENT_ORIGIN?.includes('staging');
    
    let apiBaseUrl;
    if (isLocal) {
      apiBaseUrl = 'https://photobooth-api-local.sogni.ai';
    } else if (isStaging) {
      apiBaseUrl = 'https://photobooth-api-staging.sogni.ai';
    } else {
      apiBaseUrl = 'https://photobooth-api.sogni.ai';
    }

    // Create contest entry object
    const entry = {
      id: entryId,
      contestId,
      timestamp,
      prompt,
      username: username || 'Anonymous',
      address: address || null,
      tweetId: tweetId || null,
      tweetUrl: tweetUrl || null,
      imageFilename,
      imagePath: savedImagePath,
      imageUrl: imageFilename ? `${apiBaseUrl}/api/contest/${contestId}/image/${imageFilename}` : null,
      videoFilename: videoFilename || null,
      videoPath: savedVideoPath || null,
      videoUrl: videoFilename ? `${apiBaseUrl}/api/contest/${contestId}/image/${videoFilename}` : null,
      isVideo: isVideo || false,
      moderationStatus: 'PENDING',
      metadata: {
        ...metadata,
        submittedAt: new Date(timestamp).toISOString()
      }
    };

    // Store in Redis if available
    if (redisReady()) {
      await redisStoreEntry(contestId, entryId, entry);
      console.log(`[Contest] Stored entry in Redis: ${contestId}:${entryId}`);
    } else {
      console.warn('[Contest] Redis not available, entry only saved to filesystem');
    }

    // Also save metadata to JSON file as backup
    const metadataPath = path.join(contestDir, `${entryId}.json`);
    await fs.writeFile(metadataPath, JSON.stringify(entry, null, 2));

    return entry;
  } catch (error) {
    console.error('[Contest] Error saving contest entry:', error);
    throw error;
  }
}

/**
 * Get contest entries with pagination
 * @param {string} contestId - Contest identifier
 * @param {Object} options - Query options
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=20] - Entries per page
 * @param {string} [options.sortBy='timestamp'] - Sort field
 * @param {string} [options.order='desc'] - Sort order (asc/desc)
 * @param {string} [options.moderationStatus] - Filter by moderation status
 * @returns {Promise<Object>} Paginated entries
 */
export async function getContestEntries(contestId, options = {}) {
  const {
    page = 1,
    limit = 20,
    sortBy = 'timestamp',
    order = 'desc',
    moderationStatus = null
  } = options;

  try {
    if (redisReady()) {
      return await redisGetEntries(contestId, { page, limit, sortBy, order, moderationStatus });
    } else {
      // Fallback to filesystem
      const contestDir = path.join(uploadsDir, 'contest', contestId);
      
      // Check if directory exists first
      try {
        await fs.access(contestDir);
      } catch {
        // Directory doesn't exist yet
        return {
          entries: [],
          total: 0,
          page,
          limit,
          totalPages: 0
        };
      }
      
      const files = await fs.readdir(contestDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      let entries = [];
      for (const file of jsonFiles) {
        const content = await fs.readFile(path.join(contestDir, file), 'utf-8');
        entries.push(JSON.parse(content));
      }

      // Filter by moderation status if specified
      if (moderationStatus) {
        entries = entries.filter(entry => entry.moderationStatus === moderationStatus);
      }

      // Sort entries
      entries.sort((a, b) => {
        if (sortBy === 'votes') {
          // Sort by vote count with timestamp as secondary sort
          const aVotes = (a.votes || []).length;
          const bVotes = (b.votes || []).length;
          
          // Primary sort by vote count
          if (aVotes !== bVotes) {
            return order === 'asc' ? aVotes - bVotes : bVotes - aVotes;
          }
          
          // Secondary sort by timestamp (newest first) when votes are equal
          return b.timestamp - a.timestamp;
        } else {
          // Sort by other fields
          const aVal = a[sortBy];
          const bVal = b[sortBy];
          
          if (order === 'asc') {
            return aVal > bVal ? 1 : -1;
          } else {
            return aVal < bVal ? 1 : -1;
          }
        }
      });

      // Paginate
      const start = (page - 1) * limit;
      const end = start + limit;
      const paginatedEntries = entries.slice(start, end);

      return {
        entries: paginatedEntries,
        total: entries.length,
        page,
        limit,
        totalPages: Math.ceil(entries.length / limit)
      };
    }
  } catch (error) {
    console.error('[Contest] Error getting contest entries:', error);
    throw error;
  }
}

/**
 * Get a specific contest entry
 * @param {string} contestId - Contest identifier
 * @param {string} entryId - Entry ID
 * @returns {Promise<Object|null>} Contest entry or null
 */
export async function getContestEntry(contestId, entryId) {
  try {
    if (redisReady()) {
      return await redisGetEntry(contestId, entryId);
    } else {
      // Fallback to filesystem
      const metadataPath = path.join(uploadsDir, 'contest', contestId, `${entryId}.json`);
      const content = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    console.error('[Contest] Error getting contest entry:', error);
    throw error;
  }
}

/**
 * Get contest statistics
 * @param {string} contestId - Contest identifier
 * @returns {Promise<Object>} Contest statistics
 */
export async function getContestStats(contestId) {
  try {
    if (redisReady()) {
      return await redisGetStats(contestId);
    } else {
      // Fallback to filesystem
      const contestDir = path.join(uploadsDir, 'contest', contestId);
      
      // Check if directory exists first
      try {
        await fs.access(contestDir);
      } catch {
        // Directory doesn't exist yet
        return {
          totalEntries: 0,
          uniqueUsers: 0,
          oldestEntry: null,
          newestEntry: null
        };
      }
      
      const files = await fs.readdir(contestDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      const entries = [];
      for (const file of jsonFiles) {
        const content = await fs.readFile(path.join(contestDir, file), 'utf-8');
        entries.push(JSON.parse(content));
      }

      const uniqueUsers = new Set(entries.map(e => e.address || e.username).filter(Boolean));

      return {
        totalEntries: entries.length,
        uniqueUsers: uniqueUsers.size,
        oldestEntry: entries.length > 0 ? Math.min(...entries.map(e => e.timestamp)) : null,
        newestEntry: entries.length > 0 ? Math.max(...entries.map(e => e.timestamp)) : null
      };
    }
  } catch (error) {
    console.error('[Contest] Error getting contest stats:', error);
    return {
      totalEntries: 0,
      uniqueUsers: 0,
      oldestEntry: null,
      newestEntry: null
    };
  }
}

/**
 * Delete a contest entry
 * @param {string} contestId - Contest identifier
 * @param {string} entryId - Entry ID
 * @returns {Promise<boolean>} - Success status
 */
export async function deleteContestEntry(contestId, entryId) {
  try {
    if (redisReady()) {
      return await redisDeleteEntry(contestId, entryId);
    }
    // No filesystem-only delete needed as the route handles file deletion
    return true;
  } catch (error) {
    console.error('[Contest] Error deleting contest entry from Redis:', error);
    return false;
  }
}

