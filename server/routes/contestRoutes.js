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

// GET /api/contest/:contestId/entries - Get contest entries (paginated)
router.get('/:contestId/entries', async (req, res) => {
  try {
    const { contestId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const sortBy = req.query.sortBy || 'timestamp'; // timestamp, username
    const order = req.query.order || 'desc'; // asc, desc

    const result = await getContestEntries(contestId, {
      page,
      limit,
      sortBy,
      order
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

// GET /api/contest/:contestId/image/:filename - Serve contest image
router.get('/:contestId/image/:filename', async (req, res) => {
  try {
    const { contestId, filename } = req.params;

    // Validate filename to prevent directory traversal
    if (!filename.match(/^[a-f0-9-]+\.(jpg|jpeg|png|gif|webp)$/i)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid filename'
      });
    }

    // Use the same uploads directory pattern as imageHosting.js
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const imagePath = path.join(uploadsDir, 'contest', contestId, filename);

    // Check if file exists
    try {
      await fs.access(imagePath);
    } catch (err) {
      console.error(`[Contest] Image not found at ${imagePath}:`, err);
      return res.status(404).json({
        success: false,
        message: 'Image not found',
        path: imagePath,
        filename: filename
      });
    }

    console.log(`[Contest] Serving image: ${imagePath}`);
    // Serve the image
    res.sendFile(imagePath);
  } catch (error) {
    console.error('[Contest] Error serving image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to serve image',
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

