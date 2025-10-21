import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import sogniRoutes from './routes/sogni.js';
import xAuthRoutes from './routes/xAuthRoutes.js';
import metricsRoutes from './routes/metricsRoutes.js';
import mobileShareRoutes from './routes/mobileShare.js';
import imageHostingRoutes from './routes/imageHosting.js';
import analyticsRoutes from './routes/analytics.js';
import contestRoutes from './routes/contestRoutes.js';
import process from 'process'; // Added to address linter error

// Load environment variables FIRST
dotenv.config();

// Automatically allow self-signed certificates when in local environment
if (process.env.SOGNI_ENV === 'local') {
  console.log('⚠️ Local environment detected: Self-signed certificates allowed');
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

// Get allowed origins and determine effective cookie domain for subdomain compatibility
const COOKIE_DOMAIN_EFFECTIVE = process.env.COOKIE_DOMAIN || (process.env.NODE_ENV === 'production' ? '.sogni.ai' : 'localhost');

// Add warning for production environments with non-standard domain
if (process.env.NODE_ENV === 'production' && COOKIE_DOMAIN_EFFECTIVE !== '.sogni.ai') {
  console.warn(`⚠️ Production environment detected, but COOKIE_DOMAIN is set to "${COOKIE_DOMAIN_EFFECTIVE}". Ensure this is intended for cross-subdomain cookies like .sogni.ai.`);
}

// Middleware ordering is important
// 1. Trust proxy (if applicable)
app.set('trust proxy', 1); // Trust first proxy if deployed behind one (e.g., Nginx, Heroku)

// 2. CORS Configuration
const allowedOrigins = [
  'https://photobooth.sogni.ai',
  'https://photobooth-staging.sogni.ai',
  'https://photobooth-local.sogni.ai',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, or curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.sogni.ai')) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(null, true); // Allow anyway for now, but log it
    }
  },
  credentials: true, // Important for cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  exposedHeaders: ['Set-Cookie']
}));

// 3. Cookie Parser
app.use(cookieParser());

// 4. Body Parsers
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging middleware - focused on cookie tracking for OAuth debugging
app.use((req, res, next) => {
  

  // General Set-Cookie logging for all responses
  const originalEnd = res.end;
  res.end = function (...args) {
    const setCookieHeaders = res.getHeaders()['set-cookie'];
    originalEnd.apply(res, args);
    return this;
  };

  next();
});

// Add debug logging for API routes to help diagnose the metrics issue
app.use('/api', (req, res, next) => {
  console.log(`[API Debug] ${req.method} ${req.path} received`);
  const originalJson = res.json;
  res.json = function(data) {
    //console.log(`[API Debug] ${req.method} ${req.path} responding with JSON:`, typeof data);
    return originalJson.call(this, data);
  };
  next();
});

// API routes - MAKE SURE THESE COME BEFORE THE STATIC/CATCH-ALL ROUTES
app.use('/sogni', sogniRoutes);  // Original route
app.use('/api/sogni', sogniRoutes);  // Add this new route for direct API access
app.use('/api/auth/x', xAuthRoutes); // Twitter OAuth routes, prefixed with /api for consistency
app.use('/auth/x', xAuthRoutes); // Also keep /auth/x for the direct callback from Twitter if redirect URI is /auth/x/callback
app.use('/api/metrics', metricsRoutes); // Metrics routes
app.use('/api/mobile-share', mobileShareRoutes); // Mobile sharing routes
app.use('/api/images', imageHostingRoutes); // Image hosting routes
app.use('/api/analytics', analyticsRoutes); // Analytics routes
app.use('/api/contest', contestRoutes); // Contest routes

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running', environment: process.env.NODE_ENV || 'development' });
});

// Also add the health check at /api/health
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running', environment: process.env.NODE_ENV || 'development' });
});

// Robots.txt to discourage crawling of API endpoints
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *
Disallow: /api/
Disallow: /api/images/
Disallow: /api/mobile-share/
Disallow: /sogni/
Disallow: /auth/
Crawl-delay: 86400

# Specifically block image hosting
User-agent: *
Disallow: /api/images/

# Block common crawlers from API endpoints
User-agent: Googlebot
Disallow: /api/

User-agent: Bingbot
Disallow: /api/

User-agent: Slurp
Disallow: /api/
`);
});

// Static routes for production
const isDev = process.env.NODE_ENV !== 'production';
const staticDir = isDev 
  ? path.join(__dirname, '..', 'dist')
  : '/var/www/photobooth.sogni.ai';
  
app.use(express.static(staticDir));

// Mobile sharing page route - must come before catch-all
app.use('/mobile-share', mobileShareRoutes);

// Catch-all route to serve index.html for SPA routing
app.get('*', (req, res) => {
  console.log(`[Catch-all] Serving index.html for path: ${req.path}`);
  res.sendFile(path.join(staticDir, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: err.message });
  } else {
    next(err);
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 