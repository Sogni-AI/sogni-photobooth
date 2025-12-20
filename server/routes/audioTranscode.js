import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';

const router = express.Router();

// Create temp directory for audio processing
const AUDIO_TEMP_DIR = path.join(process.cwd(), 'uploads', 'audio-temp');
if (!fs.existsSync(AUDIO_TEMP_DIR)) {
  fs.mkdirSync(AUDIO_TEMP_DIR, { recursive: true });
  console.log(`[Audio Transcode] Created temp directory: ${AUDIO_TEMP_DIR}`);
}

// Configure multer for audio uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit for audio files
  },
  fileFilter: (req, file, cb) => {
    // Accept MP3 and M4A files
    const allowedMimes = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a'];
    const allowedExts = ['.mp3', '.m4a'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio format. Received: ${file.mimetype} (${ext}). Supported: MP3, M4A`), false);
    }
  }
});

// Cleanup old temp files (older than 1 hour)
const cleanupTempFiles = () => {
  try {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    if (!fs.existsSync(AUDIO_TEMP_DIR)) {
      return;
    }
    
    const files = fs.readdirSync(AUDIO_TEMP_DIR);
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(AUDIO_TEMP_DIR, file);
      const stats = fs.statSync(filePath);
      
      if (!stats.isFile()) continue;
      
      if (stats.mtime.getTime() < oneHourAgo) {
        try {
          fs.unlinkSync(filePath);
          deletedCount++;
        } catch (deleteError) {
          console.error(`[Audio Transcode] Error deleting temp file ${file}:`, deleteError);
        }
      }
    }
    
    if (deletedCount > 0) {
      console.log(`[Audio Transcode] Cleanup: deleted ${deletedCount} temp files`);
    }
  } catch (error) {
    console.error('[Audio Transcode] Error during cleanup:', error);
  }
};

// Run cleanup every 30 minutes
setInterval(cleanupTempFiles, 30 * 60 * 1000);
cleanupTempFiles();

/**
 * Transcode audio file to M4A (AAC) using FFmpeg
 * @param {string} inputPath - Path to input audio file
 * @param {string} outputPath - Path to output M4A file
 * @returns {Promise<void>}
 */
const transcodeToM4A = (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    // FFmpeg command: convert to AAC in M4A container
    // -i: input file
    // -c:a aac: use AAC codec
    // -b:a 192k: 192kbps bitrate (good quality)
    // -ar 44100: 44.1kHz sample rate
    // -ac 2: stereo
    // -movflags +faststart: optimize for streaming
    // -y: overwrite output
    const args = [
      '-i', inputPath,
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      '-ac', '2',
      '-movflags', '+faststart',
      '-y',
      outputPath
    ];
    
    console.log(`[Audio Transcode] Running FFmpeg: ffmpeg ${args.join(' ')}`);
    
    const ffmpeg = spawn('ffmpeg', args);
    
    let stderr = '';
    
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log(`[Audio Transcode] FFmpeg completed successfully`);
        resolve();
      } else {
        console.error(`[Audio Transcode] FFmpeg failed with code ${code}`);
        console.error(`[Audio Transcode] FFmpeg stderr: ${stderr}`);
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });
    
    ffmpeg.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('FFmpeg not found. Please install FFmpeg on the server.'));
      } else {
        reject(err);
      }
    });
  });
};

// Health check - verify FFmpeg is available
router.get('/health', async (req, res) => {
  try {
    const ffmpeg = spawn('ffmpeg', ['-version']);
    
    let output = '';
    ffmpeg.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        const versionMatch = output.match(/ffmpeg version ([^\s]+)/);
        const version = versionMatch ? versionMatch[1] : 'unknown';
        res.json({ 
          status: 'ok', 
          ffmpeg: true, 
          version: version,
          tempDir: AUDIO_TEMP_DIR
        });
      } else {
        res.status(500).json({ status: 'error', ffmpeg: false, message: 'FFmpeg check failed' });
      }
    });
    
    ffmpeg.on('error', () => {
      res.status(500).json({ status: 'error', ffmpeg: false, message: 'FFmpeg not installed' });
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Transcode MP3 to M4A endpoint
router.post('/mp3-to-m4a', upload.single('audio'), async (req, res) => {
  console.log(`[Audio Transcode] ==========================================`);
  console.log(`[Audio Transcode] POST /mp3-to-m4a request received`);
  
  const tempFiles = [];
  
  try {
    if (!req.file) {
      console.log(`[Audio Transcode] ERROR: No file provided`);
      return res.status(400).json({ error: 'No audio file provided' });
    }
    
    const ext = path.extname(req.file.originalname).toLowerCase();
    console.log(`[Audio Transcode] File details:`, {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      extension: ext
    });
    
    // If already M4A, return as-is
    if (ext === '.m4a' || req.file.mimetype === 'audio/mp4' || req.file.mimetype === 'audio/x-m4a') {
      console.log(`[Audio Transcode] File is already M4A, returning as-is`);
      
      res.setHeader('Content-Type', 'audio/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(req.file.originalname, ext)}.m4a"`);
      res.setHeader('X-Original-Format', 'M4A');
      res.setHeader('X-Transcoded', 'false');
      
      return res.send(req.file.buffer);
    }
    
    // Generate unique filenames for temp files
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
    const inputPath = path.join(AUDIO_TEMP_DIR, `${timestamp}-${uniqueId}-input${ext}`);
    const outputPath = path.join(AUDIO_TEMP_DIR, `${timestamp}-${uniqueId}-output.m4a`);
    
    tempFiles.push(inputPath, outputPath);
    
    // Write input file
    console.log(`[Audio Transcode] Writing input file: ${inputPath}`);
    fs.writeFileSync(inputPath, req.file.buffer);
    
    // Transcode
    console.log(`[Audio Transcode] Starting transcoding...`);
    const startTime = Date.now();
    
    await transcodeToM4A(inputPath, outputPath);
    
    const transcodeTime = Date.now() - startTime;
    console.log(`[Audio Transcode] Transcoding completed in ${transcodeTime}ms`);
    
    // Read output file
    if (!fs.existsSync(outputPath)) {
      throw new Error('Transcoded file not found');
    }
    
    const outputBuffer = fs.readFileSync(outputPath);
    const outputStats = fs.statSync(outputPath);
    
    console.log(`[Audio Transcode] Output file size: ${outputStats.size} bytes`);
    console.log(`[Audio Transcode] Compression ratio: ${((req.file.size - outputStats.size) / req.file.size * 100).toFixed(1)}%`);
    
    // Set response headers
    const outputFilename = `${path.basename(req.file.originalname, ext)}.m4a`;
    res.setHeader('Content-Type', 'audio/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
    res.setHeader('Content-Length', outputStats.size);
    res.setHeader('X-Original-Format', ext.substring(1).toUpperCase());
    res.setHeader('X-Transcoded', 'true');
    res.setHeader('X-Transcode-Time-Ms', transcodeTime.toString());
    res.setHeader('X-Original-Size', req.file.size.toString());
    
    // Send the transcoded file
    res.send(outputBuffer);
    
    console.log(`[Audio Transcode] Response sent successfully`);
    
  } catch (error) {
    console.error('[Audio Transcode] Error:', error);
    res.status(500).json({ 
      error: 'Failed to transcode audio',
      details: error.message
    });
  } finally {
    // Cleanup temp files
    for (const filePath of tempFiles) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`[Audio Transcode] Cleaned up: ${path.basename(filePath)}`);
        }
      } catch (cleanupError) {
        console.error(`[Audio Transcode] Failed to cleanup ${filePath}:`, cleanupError);
      }
    }
  }
});

export default router;

