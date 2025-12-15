import express from 'express';
import fs from 'fs';
import path from 'path';
import process from 'process';
import { renderMobileSharePage } from '../templates/mobileSharePage.js';
import { TWITTER_SHARE_CONFIG } from '../constants.js';
const router = express.Router();

// File-based persistent storage for share data
const SHARE_DATA_FILE = path.join(process.cwd(), 'mobile-shares.json');

// Load existing share data from file
let shareData = new Map();

const loadShareData = () => {
  try {
    if (fs.existsSync(SHARE_DATA_FILE)) {
      const data = fs.readFileSync(SHARE_DATA_FILE, 'utf8');
      const parsed = JSON.parse(data);
      shareData = new Map(Object.entries(parsed));
    }
  } catch (error) {
    console.error(`[Mobile Share] Error loading share data:`, error);
    shareData = new Map(); // Fallback to empty storage
  }
};

const saveShareData = () => {
  try {
    const dataToSave = Object.fromEntries(shareData.entries());
    fs.writeFileSync(SHARE_DATA_FILE, JSON.stringify(dataToSave, null, 2));
  } catch (error) {
    console.error(`[Mobile Share] Error saving share data:`, error);
  }
};

// Load data on startup
loadShareData();

// Cleanup old shares (older than 1 hour)
const cleanupOldShares = () => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  let deletedCount = 0;
  for (const [shareId, data] of shareData.entries()) {
    if (data.timestamp < oneHourAgo) {
      shareData.delete(shareId);
      deletedCount++;
    }
  }
  if (deletedCount > 0) {
    saveShareData(); // Save after cleanup
  }
};

// Run cleanup every 15 minutes
setInterval(cleanupOldShares, 15 * 60 * 1000);

// Create a new mobile share
router.post('/create', (req, res) => {
  try {
    const { 
      shareId, photoIndex, imageUrl, videoUrl, isVideo, 
      tezdevTheme, aspectRatio, outputFormat, timestamp, twitterMessage,
      // New fields for proper filename generation
      styleName, videoDuration, videoResolution, videoFramerate
    } = req.body;
    
    if (!shareId || (!imageUrl && !videoUrl)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Store the share data
    const shareDataObj = {
      photoIndex,
      imageUrl,
      videoUrl: videoUrl || null,
      isVideo: isVideo || false,
      tezdevTheme,
      aspectRatio,
      outputFormat,
      timestamp,
      // Persist the precomputed Twitter message so the mobile share UI uses the correct text
      twitterMessage,
      // Add creation timestamp for additional validation
      createdAt: Date.now(),
      // Store metadata for proper filename generation
      styleName: styleName || 'sogni',
      videoDuration: videoDuration || null,
      videoResolution: videoResolution || null,
      videoFramerate: videoFramerate || null
    };
    
    shareData.set(shareId, shareDataObj);
    
    // Save to persistent storage
    saveShareData();

    res.json({ success: true, shareId });
  } catch (error) {
    console.error('Error creating mobile share:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve the mobile sharing page
router.get('/:shareId', async (req, res) => {
  // Prevent caching of mobile share pages by browsers, proxies, and CDNs
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const { shareId } = req.params;
    const data = shareData.get(shareId);
    if (!data) {

      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Share Not Found - Sogni Photobooth</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-align: center;
              padding: 20px;
            }
            .container {
              max-width: 400px;
            }
            h1 { margin-bottom: 20px; }
            p { margin-bottom: 30px; opacity: 0.9; }
            .btn {
              background: white;
              color: #667eea;
              padding: 12px 24px;
              border: none;
              border-radius: 25px;
              font-weight: 600;
              text-decoration: none;
              display: inline-block;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🔗 Share Not Found</h1>
            <p>This sharing link has expired or doesn't exist.</p>
            <a href="https://photobooth.sogni.ai" class="btn">Visit Sogni Photobooth</a>
          </div>
        </body>
        </html>
      `);
    }

    // Check if share is expired
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    if (data.timestamp < oneHourAgo) {
      shareData.delete(shareId);
      saveShareData(); // Save after deletion
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Share Expired - Sogni Photobooth</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-align: center;
              padding: 20px;
            }
            .container {
              max-width: 400px;
            }
            h1 { margin-bottom: 20px; }
            p { margin-bottom: 30px; opacity: 0.9; }
            .btn {
              background: white;
              color: #667eea;
              padding: 12px 24px;
              border: none;
              border-radius: 25px;
              font-weight: 600;
              text-decoration: none;
              display: inline-block;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>⏰ Share Expired</h1>
            <p>This sharing link has expired. Sharing links are valid for 1 hour.</p>
            <a href="https://photobooth.sogni.ai" class="btn">Visit Sogni Photobooth</a>
          </div>
        </body>
        </html>
      `);
    }

    // Verify the image URL is accessible before serving the page
    try {
      if (!data.imageUrl) {
        return res.status(404).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Photo Not Available - Sogni Photobooth</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-align: center;
                padding: 20px;
              }
              .container {
                max-width: 400px;
              }
              h1 { margin-bottom: 20px; }
              p { margin-bottom: 30px; opacity: 0.9; }
              .btn {
                background: white;
                color: #667eea;
                padding: 12px 24px;
                border: none;
                border-radius: 25px;
                font-weight: 600;
                text-decoration: none;
                display: inline-block;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>📸 Photo Not Available</h1>
              <p>No image URL was provided for this share.</p>
              <a href="https://photobooth.sogni.ai" class="btn">Visit Sogni Photobooth</a>
            </div>
          </body>
          </html>
        `);
      }
      
      // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Image verification timeout')), 10000);
        });
        
        // Race between fetch and timeout
        const imageResponse = await Promise.race([
          fetch(data.imageUrl, { method: 'HEAD' }),
          timeoutPromise
        ]);
      
      if (!imageResponse.ok) {
        return res.status(404).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Photo Not Available - Sogni Photobooth</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-align: center;
                padding: 20px;
              }
              .container {
                max-width: 400px;
              }
              h1 { margin-bottom: 20px; }
              p { margin-bottom: 30px; opacity: 0.9; }
              .btn {
                background: white;
                color: #667eea;
                padding: 12px 24px;
                border: none;
                border-radius: 25px;
                font-weight: 600;
                text-decoration: none;
                display: inline-block;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>📸 Photo Not Available</h1>
              <p>The photo you're trying to share is no longer available. This may happen if the photo has expired or was removed.</p>
              <a href="https://photobooth.sogni.ai" class="btn">Visit Sogni Photobooth</a>
            </div>
          </body>
          </html>
        `);
      }

    } catch (imageError) {
      console.error(`[Mobile Share] Error verifying image:`, imageError);
      console.error(`[Mobile Share] Error name:`, imageError.name);
      console.error(`[Mobile Share] Error message:`, imageError.message);
      console.error(`[Mobile Share] Error stack:`, imageError.stack);
      
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Photo Not Available - Sogni Photobooth</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-align: center;
              padding: 20px;
            }
            .container {
              max-width: 400px;
            }
            h1 { margin-bottom: 20px; }
            p { margin-bottom: 30px; opacity: 0.9; }
            .btn {
              background: white;
              color: #667eea;
              padding: 12px 24px;
              border: none;
              border-radius: 25px;
              font-weight: 600;
              text-decoration: none;
              display: inline-block;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>📸 Photo Not Available</h1>
            <p>The photo you're trying to share is no longer available. Please try creating a new share link.</p>
            <a href="https://photobooth.sogni.ai" class="btn">Visit Sogni Photobooth</a>
          </div>
        </body>
        </html>
      `);
    }

    // Generate the mobile sharing page
    // Use the custom Twitter message if provided, otherwise use default
    const twitterMessage = data.twitterMessage || TWITTER_SHARE_CONFIG.DEFAULT_MESSAGE;
    
    // Render via external template for maintainability
    return res.send(renderMobileSharePage({ 
      imageUrl: data.imageUrl, 
      videoUrl: data.videoUrl,
      isVideo: data.isVideo || false,
      twitterMessage,
      // Pass metadata for proper filename generation
      styleName: data.styleName || 'sogni',
      videoDuration: data.videoDuration,
      videoResolution: data.videoResolution,
      videoFramerate: data.videoFramerate,
      outputFormat: data.outputFormat || 'jpg',
      isFramed: data.isFramed || false
    }));
  } catch (error) {
    console.error(`[Mobile Share] FATAL ERROR serving mobile share page:`, error);
    console.error(`[Mobile Share] Error name:`, error.name);
    console.error(`[Mobile Share] Error message:`, error.message);
    console.error(`[Mobile Share] Error stack:`, error.stack);

    res.status(500).send('Internal server error');
  }
});

export default router;
