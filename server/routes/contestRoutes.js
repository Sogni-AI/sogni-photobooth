import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import {
  saveContestEntry,
  getContestEntries,
  getContestEntry,
  getContestStats
} from '../services/contestService.js';

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

    const isDev = process.env.NODE_ENV !== 'production';
    const uploadsDir = isDev
      ? path.join(__dirname, '..', 'uploads')
      : '/var/www/photobooth-uploads';

    const imagePath = path.join(uploadsDir, 'contest', contestId, filename);

    // Check if file exists
    try {
      await fs.access(imagePath);
    } catch {
      return res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }

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

export default router;

