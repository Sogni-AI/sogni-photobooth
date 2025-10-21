import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const router = express.Router();

// Create uploads directory if it doesn't exist
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log(`[Image Hosting] Created uploads directory: ${UPLOADS_DIR}`);
}

// Configure multer for image uploads
const storage = multer.memoryStorage(); // Store in memory first for processing
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Cleanup old images (older than 48 hours)
const cleanupOldImages = () => {
  try {
    const twoDaysAgo = Date.now() - (48 * 60 * 60 * 1000); // 48 hours in milliseconds
    
    if (!fs.existsSync(UPLOADS_DIR)) {
      return;
    }
    
    const files = fs.readdirSync(UPLOADS_DIR);
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(UPLOADS_DIR, file);
      const stats = fs.statSync(filePath);
      
      // Skip directories
      if (!stats.isFile()) {
        continue;
      }
      
      if (stats.mtime.getTime() < twoDaysAgo) {
        try {
          fs.unlinkSync(filePath);
          deletedCount++;
          console.log(`[Image Hosting] Deleted expired image: ${file}`);
        } catch (deleteError) {
          console.error(`[Image Hosting] Error deleting file ${file}:`, deleteError);
        }
      }
    }
    
    if (deletedCount > 0) {
      console.log(`[Image Hosting] Cleanup completed: deleted ${deletedCount} expired images`);
    }
  } catch (error) {
    console.error('[Image Hosting] Error during cleanup:', error);
  }
};

// Run cleanup every hour
setInterval(cleanupOldImages, 60 * 60 * 1000);

// Run cleanup on startup
cleanupOldImages();

// Upload image endpoint
router.post('/upload', upload.single('image'), (req, res) => {
  console.log(`[Image Hosting] ==========================================`);
  console.log(`[Image Hosting] POST /upload request received`);
  
  try {
    if (!req.file) {
      console.log(`[Image Hosting] ERROR: No file provided`);
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    console.log(`[Image Hosting] File details:`, {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });
    
    // Generate unique filename
    const fileExtension = path.extname(req.file.originalname) || '.jpg';
    const uniqueId = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const filename = `${timestamp}-${uniqueId}${fileExtension}`;
    const filePath = path.join(UPLOADS_DIR, filename);
    
    console.log(`[Image Hosting] Saving file as: ${filename}`);
    
    // Save file to disk
    fs.writeFileSync(filePath, req.file.buffer);
    
    // Generate public URL - always use the API domain for consistency
    const isProduction = process.env.NODE_ENV === 'production';
    const apiDomain = isProduction ? 'https://photobooth-api.sogni.ai' : `http://localhost:${process.env.PORT || 3001}`;
    const imageUrl = `${apiDomain}/api/images/${filename}`;
    
    console.log(`[Image Hosting] Image uploaded successfully`);
    console.log(`[Image Hosting] File saved to: ${filePath}`);
    
    res.json({
      success: true,
      imageUrl: imageUrl,
      filename: filename,
      size: req.file.size,
      expiresAt: new Date(Date.now() + (48 * 60 * 60 * 1000)).toISOString()
    });
    
  } catch (error) {
    console.error('[Image Hosting] Error uploading image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Serve uploaded images with security measures
router.get('/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(UPLOADS_DIR, filename);
    
    console.log(`[Image Hosting] Image request: ${filename}`);
    console.log(`[Image Hosting] User-Agent: ${req.get('User-Agent')}`);
    console.log(`[Image Hosting] Referer: ${req.get('Referer')}`);
    
    // Security: Block common crawlers and bots
    const userAgent = req.get('User-Agent') || '';
    const blockedBots = [
      'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider',
      'yandexbot', 'facebookexternalhit', 'twitterbot', 'linkedinbot',
      'whatsapp', 'telegrambot', 'crawler', 'spider', 'scraper',
      'wget', 'curl', 'python-requests', 'node-fetch'
    ];
    
    const isBot = blockedBots.some(bot => 
      userAgent.toLowerCase().includes(bot.toLowerCase())
    );
    
    if (isBot) {
      console.log(`[Image Hosting] BLOCKED BOT: ${userAgent}`);
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Security: Validate filename format (must match our generated pattern)
    // Expected format: timestamp-hexstring.ext (e.g., 1756794335136-a1b2c3d4e5f6.jpg)
    const validFilenamePattern = /^\d{13}-[a-f0-9]{32}\.(jpg|jpeg|png|gif|webp)$/i;
    if (!validFilenamePattern.test(filename)) {
      console.log(`[Image Hosting] INVALID FILENAME FORMAT: ${filename}`);
      return res.status(404).json({ error: 'Not found' });
    }
    
    // Security: Rate limiting per IP
    const clientIP = req.ip || req.connection.remoteAddress;
    const rateLimitKey = `img_rate_${clientIP}`;
    
    // Simple in-memory rate limiting (10 requests per minute per IP)
    if (!global.imageLimiter) {
      global.imageLimiter = new Map();
    }
    
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const maxRequests = 10;
    
    const clientData = global.imageLimiter.get(rateLimitKey) || { count: 0, resetTime: now + windowMs };
    
    if (now > clientData.resetTime) {
      // Reset the window
      clientData.count = 1;
      clientData.resetTime = now + windowMs;
    } else {
      clientData.count++;
    }
    
    global.imageLimiter.set(rateLimitKey, clientData);
    
    if (clientData.count > maxRequests) {
      console.log(`[Image Hosting] RATE LIMITED: ${clientIP} (${clientData.count} requests)`);
      return res.status(429).json({ error: 'Too many requests' });
    }
    
    // Security: Check file exists and validate path
    if (!fs.existsSync(filePath)) {
      console.log(`[Image Hosting] Image not found: ${filename}`);
      return res.status(404).json({ error: 'Not found' });
    }
    
    // Ensure the resolved path is still within our uploads directory (prevent path traversal)
    const resolvedPath = path.resolve(filePath);
    const uploadsPath = path.resolve(UPLOADS_DIR);
    if (!resolvedPath.startsWith(uploadsPath)) {
      console.log(`[Image Hosting] PATH TRAVERSAL ATTEMPT: ${filename}`);
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if file is expired (older than 48 hours)
    const stats = fs.statSync(filePath);
    const twoDaysAgo = Date.now() - (48 * 60 * 60 * 1000);
    
    if (stats.mtime.getTime() < twoDaysAgo) {
      console.log(`[Image Hosting] Image expired, deleting: ${filename}`);
      fs.unlinkSync(filePath);
      return res.status(404).json({ error: 'Not found' });
    }
    
    // Set appropriate headers
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'image/jpeg'; // default
    
    switch (ext) {
      case '.png':
        contentType = 'image/png';
        break;
      case '.gif':
        contentType = 'image/gif';
        break;
      case '.webp':
        contentType = 'image/webp';
        break;
      case '.jpg':
      case '.jpeg':
      default:
        contentType = 'image/jpeg';
        break;
    }
    
    // Security headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600'); // Private cache, 1 hour
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
    
    // Don't set Expires header to make caching less predictable
    
    console.log(`[Image Hosting] Serving image: ${filename} to ${clientIP}`);
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('[Image Hosting] Error serving image:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get image info endpoint (with same security measures)
router.get('/info/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    
    // Apply same security measures as image serving
    const userAgent = req.get('User-Agent') || '';
    const blockedBots = [
      'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider',
      'yandexbot', 'facebookexternalhit', 'twitterbot', 'linkedinbot',
      'whatsapp', 'telegrambot', 'crawler', 'spider', 'scraper',
      'wget', 'curl', 'python-requests', 'node-fetch'
    ];
    
    const isBot = blockedBots.some(bot => 
      userAgent.toLowerCase().includes(bot.toLowerCase())
    );
    
    if (isBot) {
      console.log(`[Image Hosting] BLOCKED BOT from info endpoint: ${userAgent}`);
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Validate filename format
    const validFilenamePattern = /^\d{13}-[a-f0-9]{32}\.(jpg|jpeg|png|gif|webp)$/i;
    if (!validFilenamePattern.test(filename)) {
      console.log(`[Image Hosting] INVALID FILENAME FORMAT in info: ${filename}`);
      return res.status(404).json({ error: 'Not found' });
    }
    
    const filePath = path.join(UPLOADS_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Not found' });
    }
    
    // Path traversal protection
    const resolvedPath = path.resolve(filePath);
    const uploadsPath = path.resolve(UPLOADS_DIR);
    if (!resolvedPath.startsWith(uploadsPath)) {
      console.log(`[Image Hosting] PATH TRAVERSAL ATTEMPT in info: ${filename}`);
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const stats = fs.statSync(filePath);
    const twoDaysAgo = Date.now() - (48 * 60 * 60 * 1000);
    const isExpired = stats.mtime.getTime() < twoDaysAgo;
    
    // Set security headers
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
    res.setHeader('Cache-Control', 'private, no-cache');
    
    // Generate consistent API domain URL
    const isProduction = process.env.NODE_ENV === 'production';
    const apiDomain = isProduction ? 'https://photobooth-api.sogni.ai' : `http://localhost:${process.env.PORT || 3001}`;
    
    res.json({
      filename: filename,
      size: stats.size,
      uploadedAt: stats.mtime.toISOString(),
      expiresAt: new Date(stats.mtime.getTime() + (48 * 60 * 60 * 1000)).toISOString(),
      isExpired: isExpired,
      url: `${apiDomain}/api/images/${filename}`
    });
    
  } catch (error) {
    console.error('[Image Hosting] Error getting image info:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
