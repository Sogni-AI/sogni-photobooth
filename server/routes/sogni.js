import express from 'express';
import { getClientInfo, generateImage, cleanupSogniClient, getSessionClient, disconnectSessionClient, getActiveConnectionsCount, checkIdleConnections, activeConnections, sessionClients, clearInvalidTokens, validateAuthError } from '../services/sogni.js';
import { v4 as uuidv4 } from 'uuid';
import { 
  incrementBatchesGenerated, 
  incrementPhotosGenerated, 
  incrementPhotosEnhanced,
  incrementPhotosTakenViaCamera,
  incrementPhotosUploadedViaBrowse
} from '../services/redisService.js';
import { trackMetric } from '../services/analyticsService.js';
import { redactProjectResult } from '../utils/logRedaction.js';
import process from 'process';
import { Buffer } from 'buffer';

const router = express.Router();

// Map to store active project SSE connections (legacy)
const activeProjects = new Map();

// Map to store active client SSE connections (for multiple concurrent projects)
const activeClients = new Map();

// Map to store active session SSE connections (session-wide multiplexed stream)
const activeSessions = new Map();

// Map to store pending events for projects that don't have SSE clients yet
const pendingProjectEvents = new Map();

// Timer for delayed Sogni cleanup
let sogniCleanupTimer = null;
const SOGNI_CLEANUP_DELAY_MS = 30 * 1000; // 30 seconds

// Track recent disconnect requests to prevent duplicates
const recentDisconnectRequests = new Map();
const DISCONNECT_CACHE_TTL = 3000; // 3 seconds

// Middleware to ensure session ID cookie exists
const ensureSessionId = (req, res, next) => {
  const sessionCookieName = 'sogni_session_id';
  let sessionId = req.cookies?.[sessionCookieName];
  
  // Log the current cookie state for debugging
  console.log(`[SESSION] Cookie check for ${sessionCookieName}: ${sessionId || 'not found'}`);
  //console.log(`[SESSION] Request origin: ${req.headers.origin}, referer: ${req.headers.referer}`);
  
  // If no session ID exists, create one
  if (!sessionId) {
    sessionId = `sid-${uuidv4()}`;
    
    // Determine if we're in a secure context
    const isSecureContext = req.secure || 
                            req.headers['x-forwarded-proto'] === 'https' || 
                            process.env.NODE_ENV === 'production' ||
                            req.headers.origin?.startsWith('https:');
    
    // Get the origin for cross-domain access
    const origin = req.headers.origin;
    
    // For cross-origin requests from HTTPS origins, use SameSite=None and Secure=true
    // For all other requests, use SameSite=Lax for better compatibility
    const sameSiteSetting = (origin && origin.startsWith('https:')) ? 'none' : 'lax';
    const secure = isSecureContext || sameSiteSetting === 'none';
    
    console.log(`[SESSION] Creating new session ID: ${sessionId}, Secure: ${secure}, SameSite: ${sameSiteSetting}`);
    
    // Set cookie with long expiry (30 days) with proper security settings
    res.cookie(sessionCookieName, sessionId, {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      secure: secure, // Enable for HTTPS, even local
      sameSite: sameSiteSetting, // Use 'none' for cross-domain requests
      path: '/'  // Ensure cookie is available for all paths
    });
  } else {
    console.log(`[SESSION] Using existing session ID: ${sessionId}`);
  }
  
  // Attach session ID to request for use in route handlers
  req.sessionId = sessionId;
  next();
};

// Helper function to send SSE messages
// Helper function to forward events to both project-based and client-based SSE connections
function forwardEventToSSE(localProjectId, clientAppId, sseEvent, sessionId) {
  let totalClients = 0;
  
  // Send to project-based connections (legacy)
  if (activeProjects.has(localProjectId)) {
    const projectClients = activeProjects.get(localProjectId);
    projectClients.forEach(client => {
      sendSSEMessage(client, sseEvent);
    });
    totalClients += projectClients.size;
  }
  
  // Send to client-based connections (new architecture)
  if (clientAppId && activeClients.has(clientAppId)) {
    const clientConnections = activeClients.get(clientAppId);
    clientConnections.forEach(client => {
      sendSSEMessage(client, sseEvent);
    });
    totalClients += clientConnections.size;
  }

  // Send to session-based connections (single SSE carrying all projects in session)
  if (sessionId && activeSessions.has(sessionId)) {
    const sessionConnections = activeSessions.get(sessionId);
    sessionConnections.forEach(client => {
      sendSSEMessage(client, sseEvent);
    });
    totalClients += sessionConnections.size;
  }
  
  if (totalClients > 0) {
    console.log(`[${localProjectId}] Forwarded '${sseEvent.type}' event to ${totalClients} SSE client(s)`);
  } else {
    console.log(`[${localProjectId}] No SSE clients found - storing event for later pickup`);
    // Store for later pickup
    if (!pendingProjectEvents.has(localProjectId)) {
      pendingProjectEvents.set(localProjectId, []);
    }
    // Add clientAppId to event for client-based retrieval
    const eventWithClient = { ...sseEvent, clientAppId, sessionId };
    pendingProjectEvents.get(localProjectId).push(eventWithClient);
  }
}

const sendSSEMessage = (client, data) => {
  if (!client || !client.writable) {
    return false;
  }
  
  try {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    return client.write(message);
  } catch (error) {
    console.error('Error sending SSE message:', error);
    return false;
  }
};

// Add OPTIONS handler for the /status endpoint to handle preflight requests
router.options('/status', (req, res) => {
  // CORS headers are now handled by Nginx for the api subdomain
  // if (req.headers.origin) {
  //   res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  //   res.setHeader('Access-Control-Allow-Credentials', 'true');
  //   res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  //   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Client-App-ID, Accept');
  //   res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  // }
  res.status(204).end(); // No content response for OPTIONS
});

// Test connection to Sogni
router.get('/status', ensureSessionId, async (req, res) => {
  try {
    // Extract client app ID from header or query parameter
    const clientAppId = req.headers['x-client-app-id'] || req.query.clientAppId;
    
    // Get status info, passing the session ID and client app ID to enable result caching and app ID reuse
    const status = await getClientInfo(req.sessionId, clientAppId);
    
    // Add session info to the response
    res.json({
      ...status,
      sessionId: req.sessionId
    });
  } catch (error) {
    console.error('Error getting Sogni client status:', error);
    
    
    // Check for proxy or timeout issues
    if (error.code === 'ECONNREFUSED') {
      console.error('DEBUG - Connection refused. Check if the Sogni API is reachable.');
      res.status(502).json({
        error: 'Backend unavailable',
        message: 'Could not connect to Sogni API. Connection refused.',
        details: 'This is likely due to network connectivity issues to the Sogni API.'
      });
    } 
    // Return a more specific error code for credential issues
    else if (error.message && error.message.includes('Invalid credentials')) {
      console.error('DEBUG - Invalid credentials detected. Check your .env file.');
      res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Invalid Sogni credentials. Please check your .env file.',
        details: 'This error occurs when the Sogni API rejects the username and password combination.'
      });
    } 
    // Handle timeout errors
    else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      console.error('DEBUG - Connection timeout detected.');
      res.status(504).json({
        error: 'Gateway timeout',
        message: 'Connection to Sogni API timed out',
        details: 'The request took too long to complete. Check your network connection or try again later.'
      });
    } 
    // Generic error fallback
    else {
      res.status(500).json({ 
        error: 'Failed to connect to Sogni services',
        message: error.message,
        details: JSON.stringify(error)
      });
    }
  }
});

// Add OPTIONS handler for the /progress/:projectId endpoint
router.options('/progress/:projectId', (req, res) => {
  // CORS headers are now handled by Nginx
  res.status(204).end();
});

// Client-based SSE endpoint for multiple concurrent projects (like main frontend)
router.get('/progress/client', ensureSessionId, (req, res) => {
  const clientAppId = req.query.clientAppId;
  
  if (!clientAppId) {
    return res.status(400).json({ error: 'clientAppId is required' });
  }
  
  console.log(`SSE connection request for client: ${clientAppId}`);
  
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Content-Encoding', 'identity');
  res.setHeader('X-Accel-Buffering', 'no');
  
  // Send immediate response
  res.write(`data: ${JSON.stringify({ type: 'connected', clientId: clientAppId, timestamp: Date.now() })}\n\n`);
  
  try {
    res.flushHeaders();
  } catch (err) {
    console.error(`Error flushing headers: ${err.message}`);
  }
  
  // Set up client tracking for ALL projects from this client
  if (!activeClients.has(clientAppId)) {
    activeClients.set(clientAppId, new Set());
  }
  activeClients.get(clientAppId).add(res);
  
  // Send any pending events for ALL projects from this client
  for (const [projectId, events] of pendingProjectEvents.entries()) {
    if (events.length > 0 && events[0].clientAppId === clientAppId) {
      console.log(`[${clientAppId}] Sending ${events.length} stored events for project ${projectId}`);
      try {
        for (const event of events) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
        pendingProjectEvents.delete(projectId);
      } catch (error) {
        console.error(`Error sending pending events for client ${clientAppId}:`, error);
      }
    }
  }
  
  // Handle client disconnect
  req.on('close', () => {
    console.log(`[${clientAppId}] Client disconnected from SSE stream`);
    if (activeClients.has(clientAppId)) {
      activeClients.get(clientAppId).delete(res);
      if (activeClients.get(clientAppId).size === 0) {
        activeClients.delete(clientAppId);
      }
    }
  });
  
  req.on('error', (err) => {
    console.error(`[${clientAppId}] SSE connection error:`, err);
    if (activeClients.has(clientAppId)) {
      activeClients.get(clientAppId).delete(res);
      if (activeClients.get(clientAppId).size === 0) {
        activeClients.delete(clientAppId);
      }
    }
  });
});

// Session-based SSE endpoint: streams all projects for the current session
router.get('/progress/session', ensureSessionId, (req, res) => {
  const sessionId = req.sessionId;
  console.log(`SSE connection request for session: ${sessionId}`);

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Content-Encoding', 'identity');
  res.setHeader('X-Accel-Buffering', 'no');

  // Send immediate connected event
  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId, timestamp: Date.now() })}\n\n`);
  try { res.flushHeaders(); } catch {}

  // Track this session connection
  if (!activeSessions.has(sessionId)) {
    activeSessions.set(sessionId, new Set());
  }
  activeSessions.get(sessionId).add(res);

  // Flush any pending events for this session (across all projects)
  for (const [projectId, events] of pendingProjectEvents.entries()) {
    if (events.length > 0 && events[0].sessionId === sessionId) {
      console.log(`[session:${sessionId}] Sending ${events.length} stored events for project ${projectId}`);
      try {
        for (const event of events) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
        pendingProjectEvents.delete(projectId);
      } catch (error) {
        console.error(`Error sending pending events for session ${sessionId}:`, error);
      }
    }
  }

  // Disconnect handlers
  req.on('close', () => {
    if (activeSessions.has(sessionId)) {
      activeSessions.get(sessionId).delete(res);
      if (activeSessions.get(sessionId).size === 0) {
        activeSessions.delete(sessionId);
      }
    }
  });

  req.on('error', (err) => {
    console.error(`[${sessionId}] SSE connection error:`, err);
    if (activeSessions.has(sessionId)) {
      activeSessions.get(sessionId).delete(res);
      if (activeSessions.get(sessionId).size === 0) {
        activeSessions.delete(sessionId);
      }
    }
  });
});

// SSE endpoint for getting real-time progress updates (legacy - per project)
router.get('/progress/:projectId', ensureSessionId, (req, res) => {
  const projectId = req.params.projectId;
  
  // Extract client app ID from header or query parameter
  const clientAppId = req.headers['x-client-app-id'] || req.query.clientAppId;
  
  // Log request info for debugging (streamlined for performance)
  console.log(`SSE connection request for project: ${projectId}, client: ${clientAppId || 'none'}`);
  
  // Set headers for SSE - optimized order for faster processing
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Content-Encoding', 'identity');
  res.setHeader('X-Accel-Buffering', 'no');
  
  // Send immediate response before other processing
  res.write(`data: ${JSON.stringify({ type: 'connected', projectId, timestamp: Date.now() })}\n\n`);
  
  // Immediately flush the response to send data to client
  try {
    res.flushHeaders();
  } catch (err) {
    console.error(`Error flushing headers: ${err.message}`);
  }
  
  // Set up client tracking - do this after initial response is sent
  if (!activeProjects.has(projectId)) {
    activeProjects.set(projectId, new Set());
  }
  activeProjects.get(projectId).add(res);
  
  // Check for any pending events for this project and send them immediately
  console.log(`[${projectId}] Checking for pending events. Available events:`, 
    pendingProjectEvents.has(projectId) ? pendingProjectEvents.get(projectId).length : 0);
  
  if (pendingProjectEvents.has(projectId)) {
    const events = pendingProjectEvents.get(projectId);
    console.log(`[${projectId}] Sending ${events.length} stored events to newly connected SSE client`);
    
    try {
      // Send all pending events in order
      for (const event of events) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      res.flushHeaders();
      console.log(`[${projectId}] Successfully sent ${events.length} pending events`);
      
      // Remove the events from pending since they've been delivered
      pendingProjectEvents.delete(projectId);
      console.log(`[${projectId}] Removed events from pending. Remaining projects: ${pendingProjectEvents.size}`);
    } catch (err) {
      console.error(`[${projectId}] Error sending pending events:`, err.message);
    }
  } else {
    console.log(`[${projectId}] No pending events found for this project`);
  }
  
  // Also check for any pending errors for backward compatibility
  if (globalThis.pendingProjectErrors && globalThis.pendingProjectErrors.has(projectId)) {
    const errorEvent = globalThis.pendingProjectErrors.get(projectId);
    console.log(`[${projectId}] Sending stored error event to newly connected SSE client:`, JSON.stringify(errorEvent));
    
    try {
      res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
      res.flushHeaders();
      console.log(`[${projectId}] Successfully sent pending error event`);
      
      // Remove the error from pending errors since it's been delivered
      globalThis.pendingProjectErrors.delete(projectId);
    } catch (err) {
      console.error(`Error sending pending error event: ${err.message}`);
    }
  }
  
  // Cancel any pending cleanup since a user is now connected
  if (sogniCleanupTimer) {
    clearTimeout(sogniCleanupTimer);
    sogniCleanupTimer = null;
  }
  
  // Send a heartbeat every 15 seconds to keep the connection alive
  // Increased from 3s to reduce unnecessary traffic
  const heartbeatInterval = setInterval(() => {
    if (res.writable) {
      try {
        res.write(":\n\n"); 
      } catch (err) {
        clearInterval(heartbeatInterval);
      }
    } else {
      clearInterval(heartbeatInterval);
    }
  }, 15000);
  
  // Handle client disconnect - simplified for performance
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    
    if (activeProjects.has(projectId)) {
      activeProjects.get(projectId).delete(res);
      if (activeProjects.get(projectId).size === 0) {
        activeProjects.delete(projectId);
      }
    }
    
    // If no active projects remain, schedule Sogni cleanup
    if (activeProjects.size === 0) {
      if (sogniCleanupTimer) clearTimeout(sogniCleanupTimer);
      sogniCleanupTimer = setTimeout(() => {
        cleanupSogniClient({ logout: false });
      }, SOGNI_CLEANUP_DELAY_MS);
    }
  });
  
  // Handle connection errors - simplified
  req.on('error', () => {
    clearInterval(heartbeatInterval);
    
    if (activeProjects.has(projectId)) {
      activeProjects.get(projectId).delete(res);
      if (activeProjects.get(projectId).size === 0) {
        activeProjects.delete(projectId);
      }
    }
  });
  
  // Add a safety timeout - reduced from 10 minutes to 5 minutes
  const connectionTimeout = setTimeout(() => {
    clearInterval(heartbeatInterval);
    
    try {
      if (res.writable) {
        res.write(`data: ${JSON.stringify({ type: 'timeout', projectId })}\n\n`);
        res.end();
      }
    } catch (err) {
      // Silent catch - connection likely already closed
    }
    
    if (activeProjects.has(projectId)) {
      activeProjects.get(projectId).delete(res);
      if (activeProjects.get(projectId).size === 0) {
        activeProjects.delete(projectId);
      }
    }
  }, 5 * 60 * 1000); // 5 minutes max connection time
  
  // Clean up the timeout when the connection closes
  req.on('close', () => {
    clearTimeout(connectionTimeout);
  });
});

// Add project cancellation endpoint
router.post('/cancel/:projectId', ensureSessionId, async (req, res) => {
  const projectId = req.params.projectId;
  
  try {
    // Extract client app ID from header, body, or query parameter
    const clientAppId = req.headers['x-client-app-id'] || req.body.clientAppId || req.query.clientAppId;
    console.log(`Request to cancel project ${projectId} for session ${req.sessionId} with app ID: ${clientAppId || 'none provided'}`);
    
    // Get the existing client for this session
    const client = await getSessionClient(req.sessionId, clientAppId);
    
    // Cancel the project using the session's client
    await client.projects.cancel(projectId);
    
    // Notify any connected clients
    if (activeProjects.has(projectId)) {
      const clients = activeProjects.get(projectId);
      clients.forEach(client => {
        if (client.writable) {
          client.write(`data: ${JSON.stringify({ type: 'cancelled', projectId })}\n\n`);
        }
      });
    }
    
    res.json({ status: 'cancelled', projectId });
  } catch (error) {
    console.error(`Error cancelling project ${projectId}:`, error);
    res.status(500).json({ error: 'Failed to cancel project', message: error.message });
  }
});

// Add OPTIONS handler for the /generate endpoint
router.options('/generate', (req, res) => {
  // CORS headers are now handled by Nginx
  res.status(204).end();
});

// Generate image with project tracking
router.post('/generate', ensureSessionId, async (req, res) => {
  const localProjectId = `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[${localProjectId}] Starting image generation request for session ${req.sessionId}...`);
  
  try {
    // Ensure each user gets a unique client app ID for better isolation
    let clientAppId = req.headers['x-client-app-id'] || req.body.clientAppId || req.query.clientAppId;
    if (!clientAppId) {
      clientAppId = `user-${req.sessionId}-${Date.now()}`;
      console.log(`[${localProjectId}] Generated unique client app ID for session: ${clientAppId}`);
    } else {
      console.log(`[${localProjectId}] Using provided client app ID: ${clientAppId}`);
    }
    
    // Server-side image generation caps
    const selectedModel = req.body.selectedModel;
    const requestedImages = parseInt(req.body.numberImages) || 1;
    
    // Define FLUX models that have 8 image cap
    const fluxModelsWithCap = ['flux1-dev-kontext_fp8_scaled', 'flux1-krea-dev_fp8_scaled'];
    const isFluxModel = fluxModelsWithCap.includes(selectedModel);
    
    // Apply caps
    if (isFluxModel && requestedImages > 8) {
      console.log(`[${localProjectId}] REJECTED: FLUX model ${selectedModel} requested ${requestedImages} images, max allowed is 8`);
      return res.status(400).json({
        error: 'Image generation limit exceeded',
        message: `FLUX.1 Kontext [dev] and FLUX.1 Krea models are limited to 8 images per project. Requested: ${requestedImages}`,
        maxAllowed: 8,
        modelType: 'FLUX'
      });
    }
    
    if (requestedImages > 16) {
      console.log(`[${localProjectId}] REJECTED: Model ${selectedModel} requested ${requestedImages} images, max allowed is 16`);
      return res.status(400).json({
        error: 'Image generation limit exceeded',
        message: `All models are limited to 16 images per project. Requested: ${requestedImages}`,
        maxAllowed: 16,
        modelType: 'ALL'
      });
    }
    
    console.log(`[${localProjectId}] Image generation caps validated: ${selectedModel} requesting ${requestedImages} images`);
    
    // Server-side worker preference enforcement
    // Strip any client-provided worker preferences and enforce hardcoded values
    let positivePrompt = req.body.positivePrompt || '';
    
    // Remove any existing worker preference flags from the prompt
    positivePrompt = positivePrompt
      .replace(/--workers=[^\s]+/g, '')
      .replace(/--preferred-workers=[^\s]+/g, '')
      .replace(/--skip-workers=[^\s]+/g, '')
      .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
      .trim();
    
    // Enforce hardcoded worker preferences
    const hardcodedWorkerPreferences = [];
    
    // Hardcoded required workers (empty for now)
    const requiredWorkers = [];
    if (requiredWorkers.length > 0) {
      hardcodedWorkerPreferences.push(`--workers=${requiredWorkers.join(',')}`);
    }
    
    // Hardcoded preferred workers
    const preferredWorkers = ['SPICE.MUST.FLOW'];
    if (preferredWorkers.length > 0) {
      hardcodedWorkerPreferences.push(`--preferred-workers=${preferredWorkers.join(',')}`);
    }
    
    // Hardcoded skip workers (maximum 2 values allowed)
    const skipWorkers = ['freeman123'];
    // Enforce maximum of 2 skip workers
    const limitedSkipWorkers = skipWorkers.slice(0, 2);
    if (limitedSkipWorkers.length > 0) {
      hardcodedWorkerPreferences.push(`--skip-workers=${limitedSkipWorkers.join(',')}`);
    }
    
    // Log if skip workers were truncated
    if (skipWorkers.length > 2) {
      console.log(`[${localProjectId}] WARNING: Skip workers truncated from ${skipWorkers.length} to 2 values. Original: [${skipWorkers.join(', ')}], Limited: [${limitedSkipWorkers.join(', ')}]`);
    }
    
    // Apply hardcoded worker preferences to the prompt
    if (hardcodedWorkerPreferences.length > 0) {
      positivePrompt = `${positivePrompt} ${hardcodedWorkerPreferences.join(' ')}`.trim();
    }
    
    // Override the request body with the sanitized prompt
    req.body.positivePrompt = positivePrompt;
    
    console.log(`[${localProjectId}] Worker preferences enforced on server side:`, hardcodedWorkerPreferences);
    
    // Track a new batch being generated for metrics (both old and new systems)
    await incrementBatchesGenerated();
    await trackMetric('batches_generated', 1);
    
    // If we have numImages parameter, increment photos generated count
    if (req.body.numberImages && !isNaN(parseInt(req.body.numberImages))) {
      const numberImages = parseInt(req.body.numberImages);
      await incrementPhotosGenerated(numberImages);
      await trackMetric('photos_generated', numberImages);
      // if the selectedModel is flux it is an enhance job
      if (req.body.selectedModel === 'flux1-schnell-fp8') {
        await incrementPhotosEnhanced();
        await trackMetric('photos_enhanced', 1);
      }
    } else {
      // Default to 1 if not specified
      await incrementPhotosGenerated(1);
      await trackMetric('photos_generated', 1);
    }
    
    // Track camera vs file upload based on sourceType parameter
    const sourceType = req.body.sourceType;
    if (sourceType === 'camera') {
      await incrementPhotosTakenViaCamera();
      await trackMetric('photos_taken_camera', 1);
      console.log(`[${localProjectId}] Tracked camera photo from sourceType parameter`);
    } else if (sourceType === 'upload') {
      await incrementPhotosUploadedViaBrowse();
      await trackMetric('photos_uploaded_browse', 1);
      console.log(`[${localProjectId}] Tracked uploaded photo from sourceType parameter`);
    }

    // Track if we've received the first event (queued/started)
    let hasReceivedFirstEvent = false;
    let firstEventResolve = null;
    const firstEventPromise = new Promise((resolve) => {
      firstEventResolve = resolve;
    });
    
    // Track progress and send updates
    let lastProgressUpdate = Date.now();
    const progressHandler = (eventData) => {
      // Log the raw progress data received from the Sogni service callback
      // we don't currently care for the project 'complete' event as we listen to the job 'complete' events already
      /*
      if (eventData.type !== 'complete') {
        console.log(`[${localProjectId}] Received callback event:`, JSON.stringify(eventData));
      }
      */

      // Signal that we've received the first event from Sogni
      if (!hasReceivedFirstEvent && (eventData.type === 'queued' || eventData.type === 'started' || eventData.type === 'initiating')) {
        hasReceivedFirstEvent = true;
        if (firstEventResolve) {
          firstEventResolve();
          firstEventResolve = null;
        }
      }
      
      // Throttle SSE updates
      const now = Date.now();
      if (now - lastProgressUpdate < 500 && eventData.type === 'progress' && (eventData.progress !== 0 && eventData.progress !== 1)) { 
        // Skip frequent progress updates unless it's start/end
        return;
      }
      lastProgressUpdate = now;
        
      // Ensure the projectId in the event matches the localProjectId for this SSE stream
      // Sogni service events might have their own projectId (the actual Sogni project ID)
      const { jobId: originalJobId, ...eventDataWithoutJobId } = eventData;
      const sseEvent = {
        ...eventDataWithoutJobId,
        projectId: localProjectId, // Standardize on the localProjectId for client-side tracking
        workerName: eventData.workerName || 'unknown', // Ensure workerName is present
        progress: typeof eventData.progress === 'number' ? 
                  (eventData.progress > 1 ? eventData.progress / 100 : eventData.progress) : 
                  eventData.progress, // Normalize progress 0-1
      };
      
      // Only include jobId if it actually exists (avoid jobId: undefined for project completion events)
      if (originalJobId !== undefined) {
        sseEvent.jobId = originalJobId;
      }

      // Handle the 'queued' event specifically
      if (eventData.type === 'queued') {
        const sseEvent = {
          type: 'queued',
          projectId: localProjectId, // Standardize on the localProjectId for client-side tracking
          queuePosition: eventData.queuePosition,
        };
        // Use new unified forwarding function
        forwardEventToSSE(localProjectId, clientAppId, sseEvent, req.sessionId);
        return; // Exit the handler for this specific event type after processing
      }

      // Forward all events (not just 'queued') to legacy, client-based, and session-based SSE connections
      forwardEventToSSE(localProjectId, clientAppId, sseEvent, req.sessionId);

      // Also maintain legacy pending storage for late project-based SSE connections
      if (!activeProjects.has(localProjectId)) {
        // Initialize pending events array for this project if it doesn't exist
        if (!pendingProjectEvents.has(localProjectId)) {
          pendingProjectEvents.set(localProjectId, []);
        }
        // Store the event
        pendingProjectEvents.get(localProjectId).push({ ...sseEvent, clientAppId });
        
        // Limit stored events to prevent memory issues (keep last 50 events)
        const events = pendingProjectEvents.get(localProjectId);
        if (events.length > 50) {
          events.splice(0, events.length - 50);
        }
        
        // Also handle error events in the old system for compatibility
        if (eventData.type === 'failed' || eventData.type === 'error') {
          if (!globalThis.pendingProjectErrors) {
            globalThis.pendingProjectErrors = new Map();
          }
          const isInsufficientFundsError = (eventData.error && eventData.error.code === 4024) || 
                                           (eventData.error && eventData.error.message && eventData.error.message.includes('Insufficient funds')) ||
                                           (eventData.error && eventData.error.message && eventData.error.message.includes('Debit Error'));
          let errorMessage = (eventData.error && eventData.error.message) || eventData.message || 'Image generation failed';
          if (isInsufficientFundsError) {
            errorMessage = 'Insufficient Sogni credits to generate images. Please add more credits to your account.';
          }
          const errorEvent = { 
            type: 'error', 
            projectId: localProjectId,
            message: errorMessage,
            details: eventData.error ? JSON.stringify(eventData.error) : 'Unknown error',
            errorCode: isInsufficientFundsError ? 'insufficient_funds' : 
                     (eventData.error && eventData.error.code ? `api_error_${eventData.error.code}` : 'unknown_error'),
            status: 500,
            isInsufficientFunds: isInsufficientFundsError
          };
          globalThis.pendingProjectErrors.set(localProjectId, errorEvent);
          // Clean up after 30 seconds
          setTimeout(() => {
            if (globalThis.pendingProjectErrors) {
              globalThis.pendingProjectErrors.delete(localProjectId);
            }
          }, 30000);
        }
        
        // Clean up pending events after 2 minutes
        setTimeout(() => {
          if (pendingProjectEvents.has(localProjectId)) {
            pendingProjectEvents.delete(localProjectId);
          }
        }, 2 * 60 * 1000);
      }
    };
    
    // Get or create a client for this session, using the client-provided app ID
    const client = await getSessionClient(req.sessionId, clientAppId);
    const params = { ...req.body, clientAppId };

    
    // Helper function to attempt generation with retry on auth failure
    const attemptGeneration = async (clientToUse, isRetry = false) => {
      return generateImage(clientToUse, params, progressHandler, localProjectId)
        .then((sogniResult) => {
          // Redact potentially large result data from logs
          const redactedResult = redactProjectResult(sogniResult.result);
          console.log(`[${localProjectId}] Sogni generation process finished. Sogni Project ID: ${sogniResult.projectId}, Result:`, JSON.stringify(redactedResult));
        })
        .catch(async (error) => {
          console.error(`ERROR - ${new Date().toISOString()} - [${localProjectId}] Sogni SDK (generateImage function) promise rejected:`, error);
          console.error(`[${localProjectId}] Sogni generation process failed${isRetry ? ' (retry attempt)' : ''}:`, error);
          
          // Check if this is an authentication error (including token expiry during generation)
          const isAuthError = error.status === 401 || 
                             (error.payload && error.payload.errorCode === 107) || 
                             error.message?.includes('Invalid token') ||
                             error.message?.includes('Authentication required');
          
          // Check if this is an insufficient funds error
          const isInsufficientFundsError = error.payload?.errorCode === 4024 || 
                                         error.message?.includes('Insufficient funds') ||
                                         error.message?.includes('Debit Error');
          
          // If this appears to be an auth error, validate it with an additional authenticated call
          if (isAuthError && !isRetry) {
            console.log(`[${localProjectId}] Potential auth error detected, validating...`);
            
            try {
              const isRealAuthError = await validateAuthError(error);
              
              if (isRealAuthError) {
                console.log(`[${localProjectId}] Confirmed auth error, attempting retry with fresh client`);
                
                // Clear invalid cached tokens
                clearInvalidTokens();
                
                // Get the client ID associated with this session
                const sessionId = req.sessionId;
                if (sessionId && sessionClients.has(sessionId)) {
                  const clientId = sessionClients.get(sessionId);
                  
                  // Force client cleanup to trigger re-authentication
                  console.log(`[${localProjectId}] Forcing cleanup of client ${clientId} due to auth error`);
                  cleanupSogniClient(clientId);
                  
                  // Remove the session-to-client mapping to force new client creation
                  sessionClients.delete(sessionId);
                }
                
                try {
                  // Get a fresh client with new authentication
                  console.log(`[${localProjectId}] Creating fresh client for retry...`);
                  const freshClient = await getSessionClient(sessionId, clientAppId);
                  
                  // Retry the generation with the fresh client
                  console.log(`[${localProjectId}] Retrying generation with fresh client...`);
                  return await attemptGeneration(freshClient, true); // Mark as retry to prevent infinite recursion
                } catch (retryError) {
                  console.error(`[${localProjectId}] Retry attempt failed:`, retryError);
                  // Fall through to normal error handling with the original error
                }
              } else {
                console.log(`[${localProjectId}] Error is not auth-related, not retrying: ${error.message}`);
              }
            } catch (validationError) {
              console.error(`[${localProjectId}] Error validation failed:`, validationError);
              // Fall through to normal error handling
            }
          }
          
          if (isAuthError) {
            console.log(`[${localProjectId}] Authentication error ${isRetry ? '(retry also failed)' : ''} - will clean up client state`);
            
            // Clear invalid cached tokens
            clearInvalidTokens();
            
            // Get the client ID associated with this session
            const sessionId = req.sessionId;
            if (sessionId && sessionClients.has(sessionId)) {
              const clientId = sessionClients.get(sessionId);
              
              // Force client cleanup to trigger re-authentication on next request
              console.log(`[${localProjectId}] Forcing cleanup of client ${clientId} due to auth error`);
              cleanupSogniClient(clientId);
              
              // Remove the session-to-client mapping to force new client creation
              sessionClients.delete(sessionId);
            }
          }
          
          // Re-throw the error to continue with normal error handling
          throw error;
        });
    };

    // Start the generation process but don't wait for completion - just wait for first event
    attemptGeneration(client)
      .catch(error => {
        // This handles the final error after any retry attempts
        
        // Check if this is an authentication error
        const isAuthError = (error.payload && error.payload.errorCode === 107) || 
                           error.message?.includes('Invalid token') ||
                           error.message?.includes('Authentication required');
        
        // Check if this is an insufficient funds error
        const isInsufficientFundsError = error.payload?.errorCode === 4024 || 
                                       error.message?.includes('Insufficient funds') ||
                                       error.message?.includes('Debit Error');
        
        if (activeProjects.has(localProjectId)) {
          const clients = activeProjects.get(localProjectId);
          let errorMessage = error.message || 'Image generation failed';
          
          // Provide a user-friendly message for insufficient funds
          if (isInsufficientFundsError) {
            errorMessage = 'Insufficient Sogni credits to generate images. Please add more credits to your account.';
          }
          
          const errorEvent = { 
            type: 'error', 
            projectId: localProjectId,
            message: errorMessage,
            details: error.toString(),
            errorCode: isAuthError ? 'auth_error' : 
                     isInsufficientFundsError ? 'insufficient_funds' :
                     (error.payload?.errorCode ? `api_error_${error.payload.errorCode}` : 'unknown_error'),
            status: error.status || 500,
            isAuthError: isAuthError,
            isInsufficientFunds: isInsufficientFundsError
          };
          console.log(`[${localProjectId}] Sending 'error' event to ${clients.size} SSE client(s):`, JSON.stringify(errorEvent));
          clients.forEach((client) => {
            sendSSEMessage(client, errorEvent);
          });
        } else {
          // If no SSE clients are connected yet, we need to handle this differently
          // Store the error so the SSE connection can pick it up immediately
          console.log(`[${localProjectId}] No SSE clients found - storing error for immediate pickup`);
          
          // Store the error event for immediate pickup when SSE connects
          if (!globalThis.pendingProjectErrors) {
            globalThis.pendingProjectErrors = new Map();
          }
          
          // Check if this is an authentication error
          const isAuthError = (error.payload && error.payload.errorCode === 107) || 
                             error.message?.includes('Invalid token') ||
                             error.message?.includes('Authentication required');
          
          // Check if this is an insufficient funds error  
          const isInsufficientFundsError = error.payload?.errorCode === 4024 || 
                                         error.message?.includes('Insufficient funds') ||
                                         error.message?.includes('Debit Error');
          
          let errorMessage = error.message || 'Image generation failed';
          
          // Provide a user-friendly message for insufficient funds
          if (isInsufficientFundsError) {
            errorMessage = 'Insufficient Sogni credits to generate images. Please add more credits to your account.';
          }
          
          const errorEvent = { 
            type: 'error', 
            projectId: localProjectId,
            message: errorMessage,
            details: error.toString(),
            errorCode: isAuthError ? 'auth_error' : 
                     isInsufficientFundsError ? 'insufficient_funds' :
                     (error.payload?.errorCode ? `api_error_${error.payload.errorCode}` : 'unknown_error'),
            status: error.status || 500,
            isAuthError: isAuthError,
            isInsufficientFunds: isInsufficientFundsError
          };
          
          globalThis.pendingProjectErrors.set(localProjectId, errorEvent);
          console.log(`[${localProjectId}] Error stored for project. Total pending errors: ${globalThis.pendingProjectErrors.size}`);
          console.log(`[${localProjectId}] All pending error keys:`, Array.from(globalThis.pendingProjectErrors.keys()));
          
          // Clean up after 30 seconds
          setTimeout(() => {
            if (globalThis.pendingProjectErrors) {
              console.log(`[${localProjectId}] Cleaning up pending error after timeout`);
              globalThis.pendingProjectErrors.delete(localProjectId);
            }
          }, 30000);
        }
        
        // Signal completion of first event check even on error
        if (!hasReceivedFirstEvent && firstEventResolve) {
          firstEventResolve();
          firstEventResolve = null;
        }
      });

    // Don't wait for first event - respond immediately to allow SSE connection to establish quickly
    console.log(`[${localProjectId}] Responding immediately to allow fast SSE connection establishment`);
    
    // Respond to the initial POST request with the project ID
    console.log(`[${localProjectId}] Responding to initial POST request.`);
    res.json({ 
      status: 'processing',
      projectId: localProjectId, // This is the ID the client uses to listen for SSE
      message: 'Image generation request received and processing started.',
      clientAppId: clientAppId // Include clientAppId for frontend tracking
    });
  } catch (error) {
    console.error(`ERROR - ${new Date().toISOString()} - [${localProjectId}] Uncaught error in POST /generate handler:`, error);
    console.error(`[${localProjectId}] Error in POST /generate handler:`, error);
    res.status(500).json({ 
      error: 'Failed to initiate image generation',
      message: error.message,
      // Adding full error details to the response for debugging (consider removing for production)
      errorDetails: { name: error.name, message: error.message, stack: error.stack, ...error }
    });
  }
});

// Add a health check endpoint to verify server is running
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Test endpoint for new session management
router.get('/test-client', ensureSessionId, async (req, res) => {
  try {
    console.log(`[TEST] Testing new Sogni session management for session: ${req.sessionId}`);
    
    const clientInfo = await getClientInfo(req.sessionId);
    
    res.json({
      status: 'success',
      message: 'New Sogni session management is working',
      clientInfo: clientInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[TEST] Error testing client:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Admin endpoint to clean up all connections (for development/maintenance)
router.post('/admin/cleanup', async (req, res) => {
  try {
    const adminKey = req.query.key || req.body.key;
    
    // Simple security - require an admin key
    if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
      console.warn(`Unauthorized cleanup attempt from ${req.ip}`);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log(`[ADMIN] Running full cleanup requested by ${req.ip}`);
    
    // Clean up all connections including session clients
    await cleanupSogniClient({ 
      logout: true, 
      includeSessionClients: true 
    });
    
    // Force run idle check to clean up any other resources
    await checkIdleConnections();
    
    // Return status with counts
    res.json({ 
      status: 'success', 
      message: 'All connections cleaned up',
      remainingConnections: getActiveConnectionsCount()
    });
  } catch (error) {
    console.error('[ADMIN] Error during cleanup:', error);
    res.status(500).json({ 
      error: 'Failed to clean up connections',
      message: error.message
    });
  }
});

// Add OPTIONS handler for the disconnect endpoint
router.options('/disconnect', (req, res) => {
  // Set CORS headers for preflight requests
  if (req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Client-App-ID, Accept');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  }
  res.status(204).end(); // No content response for OPTIONS
});

// Helper to check and cache disconnect requests
const cacheDisconnectRequest = (key) => {
  // Check if this request was processed recently
  if (recentDisconnectRequests.has(key)) {
    return true; // Already in cache, duplicate request
  }
  
  // Add to cache with expiration
  recentDisconnectRequests.set(key, Date.now());
  
  // Set cleanup timer
  setTimeout(() => {
    recentDisconnectRequests.delete(key);
  }, DISCONNECT_CACHE_TTL);
  
  return false; // Not a duplicate
};

// Add an endpoint to explicitly disconnect a session when the user leaves
router.post('/disconnect', ensureSessionId, async (req, res) => {
  try {
    console.log(`Explicit disconnect request for session ${req.sessionId}`);
    
    // Extract client app ID from header or body
    const clientAppId = req.headers['x-client-app-id'] || req.body?.clientAppId;
    console.log(`Disconnect request with clientAppId: ${clientAppId || 'none'}`);
    
    // Create a unique key for this request to detect duplicates
    const requestKey = `${req.sessionId}:${clientAppId || 'no-client-id'}:POST`;
    
    // Check if this is a duplicate request
    if (cacheDisconnectRequest(requestKey)) {
      console.log(`Skipping duplicate POST disconnect request for session ${req.sessionId} with clientAppId ${clientAppId}`);
      
      // Still return success to the client
      res.setHeader('Connection', 'close');
      res.setHeader('Cache-Control', 'no-store, no-cache');
      return res.status(200).send({ success: true, cached: true });
    }
    
    // Set CORS headers to ensure response reaches the client
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Client-App-ID');
    }
    
    // Check if we have this client before attempting to disconnect
    let hasClient = false;
    
    if (clientAppId && activeConnections.has(clientAppId)) {
      hasClient = true;
    } else if (sessionClients.has(req.sessionId)) {
      const clientId = sessionClients.get(req.sessionId);
      if (activeConnections.has(clientId)) {
        hasClient = true;
      }
    }
    
    // Only attempt to disconnect if we have a client
    let result = false;
    if (hasClient) {
      console.log(`Found active client for session ${req.sessionId}, disconnecting...`);
      result = await disconnectSessionClient(req.sessionId, clientAppId);
    } else {
      console.log(`No active client found for session ${req.sessionId}, skipping disconnect`);
    }
    
    // Set special headers to ensure the response reaches the client 
    // even during page unload/navigation events
    res.setHeader('Connection', 'close');
    res.setHeader('Cache-Control', 'no-store, no-cache');
    
    // Return a very small response to ensure it completes quickly
    res.status(200).send({ success: true });
    
    // Log the outcome
    console.log(`Session ${req.sessionId} disconnect attempt: ${result ? 'success' : 'no client found or no action needed'}`);
  } catch (error) {
    console.error(`Error disconnecting session ${req.sessionId}:`, error);
    res.status(500).json({ error: 'Failed to disconnect session', message: error.message });
  }
});

// Add GET version of disconnect for easier browser integration (e.g., beacon, img tag)
router.get('/disconnect', ensureSessionId, async (req, res) => {
  try {
    console.log(`GET disconnect request for session ${req.sessionId}`);
    
    // Extract client app ID from query parameters
    const clientAppId = req.query?.clientAppId || req.headers['x-client-app-id'];
    console.log(`GET disconnect with clientAppId: ${clientAppId || 'none'}`);
    
    // Create a unique key for this request to detect duplicates
    const requestKey = `${req.sessionId}:${clientAppId || 'no-client-id'}:GET`;
    
    // Check if this is a duplicate request
    if (cacheDisconnectRequest(requestKey)) {
      console.log(`Skipping duplicate GET disconnect request for session ${req.sessionId} with clientAppId ${clientAppId}`);
      
      // Still return the transparent GIF to the client
      res.setHeader('Connection', 'close');
      res.setHeader('Cache-Control', 'no-store, no-cache');
      res.setHeader('Content-Type', 'image/gif');
      const TRANSPARENT_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      return res.send(TRANSPARENT_GIF);
    }
    
    // Set CORS headers to ensure response reaches the client
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Client-App-ID');
    }
    
    // Check if we have this client before attempting to disconnect
    let hasClient = false;
    
    if (clientAppId && activeConnections.has(clientAppId)) {
      hasClient = true;
    } else if (sessionClients.has(req.sessionId)) {
      const clientId = sessionClients.get(req.sessionId);
      if (activeConnections.has(clientId)) {
        hasClient = true;
      }
    }
    
    // Queue the disconnect operation but don't wait for it
    // This ensures a fast response even during page unload
    if (hasClient) {
      console.log(`Found active client for session ${req.sessionId}, queuing disconnect...`);
      disconnectSessionClient(req.sessionId, clientAppId)
        .then(result => {
          console.log(`Async session ${req.sessionId} disconnected: ${result ? 'success' : 'failed'}`);
        })
        .catch(err => {
          console.error(`Async error disconnecting session ${req.sessionId}:`, err);
        });
    } else {
      console.log(`No active client found for session ${req.sessionId}, skipping disconnect`);
    }
    
    // Return a tiny response with appropriate headers
    res.setHeader('Connection', 'close');
    res.setHeader('Cache-Control', 'no-store, no-cache');
    res.setHeader('Content-Type', 'image/gif');
    
    // 1x1 transparent GIF
    const TRANSPARENT_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.send(TRANSPARENT_GIF);
  } catch (error) {
    console.error(`Error in GET disconnect for session ${req.sessionId}:`, error);
    res.status(500).send('');
  }
});

export default router; 