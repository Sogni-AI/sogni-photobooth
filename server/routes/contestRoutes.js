import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import {
  saveContestEntry,
  getContestEntries,
  getContestEntry,
  getContestStats,
  deleteContestEntry
} from '../services/contestService.js';
import { redisReady } from '../services/redisService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// POST /api/contest/submit - Submit a contest entry (called after successful Twitter share)
router.post('/submit', async (req, res) => {
  try {
    const {
      contestId, // e.g., 'halloween'
      imageUrl,
      prompt,
      username,
      address,
      tweetId,
      tweetUrl,
      metadata
    } = req.body;

    if (!contestId || !imageUrl || !prompt) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: contestId, imageUrl, and prompt are required'
      });
    }

    // Save the contest entry
    const entry = await saveContestEntry({
      contestId,
      imageUrl,
      prompt,
      username,
      address,
      tweetId,
      tweetUrl,
      metadata
    });

    console.log(`[Contest] New entry saved for ${contestId}:`, entry.id);

    res.json({
      success: true,
      message: 'Contest entry submitted successfully',
      entry: {
        id: entry.id,
        timestamp: entry.timestamp
      }
    });
  } catch (error) {
    console.error('[Contest] Error submitting entry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit contest entry',
      error: error.message
    });
  }
});

// GET /api/contest/gallery-submissions/approved/:promptKey - Get approved gallery submissions for a specific prompt
router.get('/gallery-submissions/approved/:promptKey', async (req, res) => {
  try {
    const { promptKey } = req.params;
    
    // Check if moderation is enabled (via MODERATION_ENABLED env var)
    const moderationEnabled = process.env.MODERATION_ENABLED !== 'false';
    
    console.log(`[Gallery] Fetching entries for promptKey: ${promptKey}`);
    console.log(`[Gallery] MODERATION_ENABLED env var: ${process.env.MODERATION_ENABLED}`);
    console.log(`[Gallery] moderationEnabled: ${moderationEnabled}`);
    console.log(`[Gallery] moderationStatus filter: ${moderationEnabled ? 'APPROVED' : 'undefined (all entries)'}`);
    
    // Get entries for gallery-submissions
    // If moderation is disabled, get all entries. Otherwise, only approved ones.
    const result = await getContestEntries('gallery-submissions', {
      page: 1,
      limit: 100, // Get up to 100 images per prompt
      sortBy: 'timestamp',
      order: 'desc',
      moderationStatus: moderationEnabled ? 'APPROVED' : undefined
    });
    
    // Filter by promptKey
    const filteredEntries = result.entries.filter(entry => 
      entry.metadata?.promptKey === promptKey
    );
    
    console.log(`[Gallery] Total entries from DB: ${result.entries.length}`);
    console.log(`[Gallery] Filtered entries for ${promptKey}: ${filteredEntries.length}`);
    if (filteredEntries.length > 0) {
      console.log(`[Gallery] Sample entry moderation statuses:`, filteredEntries.slice(0, 3).map(e => ({
        id: e.id.substring(0, 8),
        status: e.moderationStatus,
        promptKey: e.metadata?.promptKey
      })));
    }
    
    res.json({
      success: true,
      promptKey,
      entries: filteredEntries,
      total: filteredEntries.length
    });
  } catch (error) {
    console.error('[Gallery] Error fetching approved gallery submissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gallery submissions',
      error: error.message
    });
  }
});

// POST /api/contest/gallery-submissions/entry - Submit to public gallery (no tweet required)
router.post('/gallery-submissions/entry', async (req, res) => {
  try {
    const {
      imageUrl,
      videoUrl,
      isVideo,
      promptKey,
      username,
      address,
      metadata
    } = req.body;

    if (!imageUrl || !promptKey) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: imageUrl and promptKey are required'
      });
    }

    // Prevent custom prompts from being submitted
    if (promptKey === 'custom') {
      return res.status(400).json({
        success: false,
        message: 'Custom prompts cannot be submitted to the gallery'
      });
    }

    // Convert promptKey to display name (e.g., "barbie" -> "Barbie")
    const styleDisplayName = promptKey
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
      .trim();

    // Save the gallery submission as a contest entry under 'gallery-submissions'
    const entry = await saveContestEntry({
      contestId: 'gallery-submissions',
      imageUrl,
      videoUrl: videoUrl || null,
      isVideo: isVideo || false,
      prompt: styleDisplayName, // Store the style display name instead of the prompt text
      username,
      address,
      tweetId: null, // No tweet for gallery submissions
      tweetUrl: null,
      metadata: {
        ...metadata,
        promptKey, // Store the prompt key for filtering by style
        submittedAt: Date.now()
      }
    });

    console.log(`[Gallery] New submission for prompt ${promptKey}:`, entry.id);

    res.json({
      success: true,
      message: 'Gallery submission successful. Your image will be reviewed by moderators.',
      entry: {
        id: entry.id,
        timestamp: entry.timestamp
      }
    });
  } catch (error) {
    console.error('[Gallery] Error submitting to gallery:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit to gallery',
      error: error.message
    });
  }
});

// GET /api/contest/:contestId/entries - Get contest entries (paginated)
router.get('/:contestId/entries', async (req, res) => {
  try {
    const { contestId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const sortBy = req.query.sortBy || 'timestamp'; // timestamp, username, votes
    const order = req.query.order || 'desc'; // asc, desc
    const moderationStatus = req.query.moderationStatus; // Filter by moderation status

    const result = await getContestEntries(contestId, {
      page,
      limit,
      sortBy,
      order,
      moderationStatus
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[Contest] Error fetching entries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contest entries',
      error: error.message
    });
  }
});

// GET /api/contest/:contestId/entry/:entryId - Get a specific contest entry
router.get('/:contestId/entry/:entryId', async (req, res) => {
  try {
    const { contestId, entryId } = req.params;

    const entry = await getContestEntry(contestId, entryId);

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Contest entry not found'
      });
    }

    res.json({
      success: true,
      entry
    });
  } catch (error) {
    console.error('[Contest] Error fetching entry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contest entry',
      error: error.message
    });
  }
});

// GET /api/contest/:contestId/stats - Get contest statistics
router.get('/:contestId/stats', async (req, res) => {
  try {
    const { contestId } = req.params;

    const stats = await getContestStats(contestId);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[Contest] Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contest statistics',
      error: error.message
    });
  }
});

// GET /api/contest/:contestId/image/:filename - Serve contest image or video
router.get('/:contestId/image/:filename', async (req, res) => {
  try {
    const { contestId, filename } = req.params;

    // Validate filename to prevent directory traversal (allow images and videos)
    if (!filename.match(/^[a-f0-9-]+(-video)?\.(jpg|jpeg|png|gif|webp|mp4|webm)$/i)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid filename'
      });
    }

    // Use the same uploads directory pattern as imageHosting.js
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const mediaPath = path.join(uploadsDir, 'contest', contestId, filename);

    // Check if file exists
    try {
      await fs.access(mediaPath);
    } catch (err) {
      console.error(`[Contest] Media file not found at ${mediaPath}:`, err);
      return res.status(404).json({
        success: false,
        message: 'Media file not found',
        path: mediaPath,
        filename: filename
      });
    }

    console.log(`[Contest] Serving media: ${mediaPath}`);
    // Serve the file
    res.sendFile(mediaPath);
  } catch (error) {
    console.error('[Contest] Error serving media:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to serve media',
      error: error.message
    });
  }
});

// PATCH /api/contest/:contestId/entry/:entryId/moderation - Update moderation status
router.patch('/:contestId/entry/:entryId/moderation', async (req, res) => {
  try {
    const { contestId, entryId } = req.params;
    const { moderationStatus, moderatedBy } = req.body;

    // Validate moderation status
    const validStatuses = ['PENDING', 'APPROVED', 'REJECTED'];
    if (!validStatuses.includes(moderationStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid moderation status. Must be PENDING, APPROVED, or REJECTED'
      });
    }

    // Get the entry first
    const entry = await getContestEntry(contestId, entryId);

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Contest entry not found'
      });
    }

    // Update the moderation status
    entry.moderationStatus = moderationStatus;
    entry.moderatedAt = Date.now();
    if (moderatedBy) {
      entry.moderatedBy = moderatedBy;
    }

    // Update in Redis
    const { redisReady, storeContestEntry } = await import('../services/redisService.js');
    if (redisReady()) {
      await storeContestEntry(contestId, entryId, entry);
    }

    // Update metadata JSON file
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const metadataPath = path.join(uploadsDir, 'contest', contestId, `${entryId}.json`);
    await fs.writeFile(metadataPath, JSON.stringify(entry, null, 2));

    console.log(`[Contest] Updated moderation status for ${entryId} to ${moderationStatus}`);

    res.json({
      success: true,
      message: 'Moderation status updated successfully',
      entry
    });
  } catch (error) {
    console.error('[Contest] Error updating moderation status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update moderation status',
      error: error.message
    });
  }
});

// POST /api/contest/:contestId/entry/:entryId/vote - Vote for an entry (requires authentication)
router.post('/:contestId/entry/:entryId/vote', async (req, res) => {
  try {
    const { contestId, entryId } = req.params;
    const { username } = req.body;

    console.log(`[Contest] POST vote request for ${contestId}:${entryId}`, { body: req.body, username });

    if (!username) {
      console.log('[Contest] No username provided in POST request');
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please provide username.'
      });
    }

    // Get the entry
    const entry = await getContestEntry(contestId, entryId);

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Contest entry not found'
      });
    }

    // Initialize votes array if it doesn't exist
    if (!entry.votes) {
      entry.votes = [];
    }

    // Check if user already voted
    const existingVoteIndex = entry.votes.findIndex(vote => vote.username === username);
    if (existingVoteIndex !== -1) {
      return res.status(400).json({
        success: false,
        message: 'You have already voted for this entry'
      });
    }

    // Add the vote
    entry.votes.push({
      username,
      timestamp: Date.now()
    });

    // Update in Redis
    const { redisReady, storeContestEntry } = await import('../services/redisService.js');
    if (redisReady()) {
      await storeContestEntry(contestId, entryId, entry);
    }

    // Update metadata JSON file
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const metadataPath = path.join(uploadsDir, 'contest', contestId, `${entryId}.json`);
    await fs.writeFile(metadataPath, JSON.stringify(entry, null, 2));

    console.log(`[Contest] User ${username} voted for entry ${entryId}`);

    res.json({
      success: true,
      message: 'Vote recorded successfully',
      voteCount: entry.votes.length,
      votes: entry.votes
    });
  } catch (error) {
    console.error('[Contest] Error recording vote:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record vote',
      error: error.message
    });
  }
});

// DELETE /api/contest/:contestId/entry/:entryId/vote - Remove vote (unheart)
router.delete('/:contestId/entry/:entryId/vote', async (req, res) => {
  try {
    const { contestId, entryId } = req.params;
    const { username } = req.body;

    console.log(`[Contest] DELETE vote request for ${contestId}:${entryId}`, { body: req.body, username });

    if (!username) {
      console.log('[Contest] No username provided in DELETE request');
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please provide username.'
      });
    }

    // Get the entry
    const entry = await getContestEntry(contestId, entryId);

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Contest entry not found'
      });
    }

    // Initialize votes array if it doesn't exist
    if (!entry.votes) {
      entry.votes = [];
    }

    // Remove the vote
    const initialLength = entry.votes.length;
    entry.votes = entry.votes.filter(vote => vote.username !== username);

    if (entry.votes.length === initialLength) {
      return res.status(400).json({
        success: false,
        message: 'You have not voted for this entry'
      });
    }

    // Update in Redis
    const { redisReady, storeContestEntry } = await import('../services/redisService.js');
    if (redisReady()) {
      await storeContestEntry(contestId, entryId, entry);
    }

    // Update metadata JSON file
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const metadataPath = path.join(uploadsDir, 'contest', contestId, `${entryId}.json`);
    await fs.writeFile(metadataPath, JSON.stringify(entry, null, 2));

    console.log(`[Contest] User ${username} removed vote for entry ${entryId}`);

    res.json({
      success: true,
      message: 'Vote removed successfully',
      voteCount: entry.votes.length,
      votes: entry.votes
    });
  } catch (error) {
    console.error('[Contest] Error removing vote:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove vote',
      error: error.message
    });
  }
});

// DELETE /api/contest/:contestId/entry/:entryId - Delete a contest entry
router.delete('/:contestId/entry/:entryId', async (req, res) => {
  try {
    const { contestId, entryId } = req.params;

    // Get the entry first to find the image filename
    const entry = await getContestEntry(contestId, entryId);

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Contest entry not found'
      });
    }

    // Delete the image file if it exists
    if (entry.imageFilename) {
      const uploadsDir = path.join(process.cwd(), 'uploads');
      const imagePath = path.join(uploadsDir, 'contest', contestId, entry.imageFilename);
      
      try {
        await fs.unlink(imagePath);
        console.log(`[Contest] Deleted image file: ${imagePath}`);
      } catch (err) {
        console.warn(`[Contest] Could not delete image file: ${imagePath}`, err);
      }
    }

    // Delete metadata JSON file
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const metadataPath = path.join(uploadsDir, 'contest', contestId, `${entryId}.json`);
    try {
      await fs.unlink(metadataPath);
      console.log(`[Contest] Deleted metadata file: ${metadataPath}`);
    } catch (err) {
      console.warn(`[Contest] Could not delete metadata file: ${metadataPath}`, err);
    }

    // Delete from Redis if available
    if (redisReady()) {
      await deleteContestEntry(contestId, entryId);
    }

    res.json({
      success: true,
      message: 'Contest entry deleted successfully'
    });
  } catch (error) {
    console.error('[Contest] Error deleting entry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete contest entry',
      error: error.message
    });
  }
});

export default router;

