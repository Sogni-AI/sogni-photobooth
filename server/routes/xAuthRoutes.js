import express from 'express';
// import { generateAuthLink, loginWithOAuth2, shareImageToX } from '../services/twitterShareService.js'; // We'll uncomment later
import crypto from 'crypto'; // For generating a random state string
import { generateAuthLink, loginWithOAuth2, shareImageToX, CLIENT_ORIGIN, refreshOAuth2Token, getClientFromToken } from '../services/twitterShareService.js';
import { v4 as uuidv4 } from 'uuid';
import process from 'process'; // Add process import for environment variables
import { 
  storeTwitterOAuthData, 
  storeTwitterStateMapping, 
  getTwitterOAuthData, 
  getSessionIdFromState, 
  deleteTwitterOAuthData,
  redisReady,
  listAllTwitterSessions,
  incrementTwitterShares
} from '../services/redisService.js';
import { trackMetric } from '../services/analyticsService.js';
import { saveContestEntry } from '../services/contestService.js';

const router = express.Router();

// Legacy Map objects - will be used as fallback if Redis is unavailable
const sessionOAuthData = new Map();
const sessionIdIndex = new Map();
const OAUTH_DATA_TTL = 15 * 60 * 1000; // 15 minutes TTL for OAuth data (in-memory fallback)
const OAUTH_DATA_TTL_SECONDS = 15 * 60; // 15 minutes TTL for Redis

// Debug endpoint to verify Redis is working properly
// Only enable in development or when explicitly allowed
router.get('/debug', async (req, res) => {
  const isDebugAllowed = process.env.NODE_ENV !== 'production' || process.env.ALLOW_OAUTH_DEBUG === 'true';
  
  if (!isDebugAllowed) {
    return res.status(403).json({
      message: 'Debug endpoints are disabled in production. Set ALLOW_OAUTH_DEBUG=true to enable.'
    });
  }
  
  try {
    // Get information about Redis connection
    const redisStatus = {
      connected: redisReady(),
      inMemoryFallbackActive: !redisReady(),
      inMemoryStats: {
        sessionCount: sessionOAuthData.size,
        stateIndexCount: sessionIdIndex.size
      }
    };
    
    // Add cookie information for troubleshooting
    const sessionId = req.cookies?.sogni_session_id;
    const cookieInfo = {
      hasSessionCookie: !!sessionId,
      sessionId: sessionId || null
    };
    
    // Check for OAuth data for the current session
    let sessionData = null;
    if (sessionId) {
      if (redisReady()) {
        sessionData = await getTwitterOAuthData(sessionId);
      } else {
        sessionData = sessionOAuthData.get(sessionId) || null;
      }
    }
    
    // Get all active sessions from Redis or in-memory
    let allSessions = { sessions: [], states: [] };
    
    if (redisReady()) {
      allSessions = await listAllTwitterSessions();
    } else {
      allSessions = {
        sessions: Array.from(sessionOAuthData.entries()).map(([id, data]) => ({
          sessionId: id,
          timestamp: data.timestamp,
          ttl: (data.timestamp + OAUTH_DATA_TTL - Date.now()) / 1000
        })),
        states: Array.from(sessionIdIndex.keys())
      };
    }
    
    // Safe version of session data for display
    const safeSessionData = sessionData ? {
      hasAccessToken: !!sessionData.accessToken,
      hasRefreshToken: !!sessionData.refreshToken,
      tokenCreatedAt: sessionData.tokenCreatedAt,
      lastUsed: sessionData.lastUsed,
      expiresIn: sessionData.expiresIn,
      isExpired: sessionData.tokenCreatedAt && 
                sessionData.expiresIn && 
                Date.now() > (sessionData.tokenCreatedAt + (sessionData.expiresIn * 1000)),
      tokenAge: sessionData.tokenCreatedAt ? 
                Math.floor((Date.now() - sessionData.tokenCreatedAt) / 1000) + ' seconds' : 
                'unknown',
      timestamp: sessionData.timestamp,
      scope: sessionData.scope
    } : null;
    
    res.json({
      timestamp: new Date().toISOString(),
      redis: redisStatus,
      cookieInfo,
      currentSession: {
        hasData: !!sessionData,
        dataSizeIfPresent: sessionData ? JSON.stringify(sessionData).length : 0,
        tokenInfo: safeSessionData
      },
      activeSessions: allSessions
    });
  } catch (error) {
    console.error('[Debug] Error in debug endpoint:', error);
    res.status(500).json({ error: 'Error fetching debug information' });
  }
});

// Middleware to ensure we have a session ID to work with
const getSessionId = (req, res, next) => {
  const sessionCookieName = 'sogni_session_id';
  let sessionId = req.cookies?.[sessionCookieName];
  
  // Log the current cookie state for debugging
  console.log(`[Twitter OAuth] Cookie check for ${sessionCookieName}: ${sessionId || 'not found'}`);
  
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
    
    console.log(`[Twitter OAuth] Creating new session ID: ${sessionId}, Secure: ${secure}, SameSite: ${sameSiteSetting}`);
    
    // Get effective cookie domain (same logic as in server/index.js)
    const cookieDomain = process.env.COOKIE_DOMAIN || 
                        (process.env.NODE_ENV === 'production' ? '.sogni.ai' : undefined);
                        
    if (cookieDomain) {
      console.log(`[Twitter OAuth] Setting cookie with domain: ${cookieDomain}`);
    }
    
    // Set cookie with long expiry (30 days) with proper security settings
    res.cookie(sessionCookieName, sessionId, {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      secure: secure, // Enable for HTTPS, even local
      sameSite: sameSiteSetting, // Use 'none' for cross-domain requests
      path: '/',  // Ensure cookie is available for all paths
      domain: cookieDomain // Add domain for cross-subdomain support if defined
    });
  } else {
    console.log(`[Twitter OAuth] Using existing session ID: ${sessionId}`);
  }
  
  // Attach session ID to request for use in route handlers
  req.sessionId = sessionId;
  next();
};

// POST /api/auth/x/start - Initiate Twitter OAuth flow
router.post('/start', getSessionId, async (req, res) => {
  try {
    // Check for required data
    const { imageUrl, message, shareUrl, halloweenContext, prompt, username, address } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ message: 'No image URL provided' });
    }

    const sessionId = req.sessionId;
    
    // Check for existing token
    let existingOAuthData = null;
    if (redisReady()) {
      existingOAuthData = await getTwitterOAuthData(sessionId);
    } else {
      existingOAuthData = sessionOAuthData.get(sessionId);
    }

    // Check if we have a valid token
    if (existingOAuthData && existingOAuthData.accessToken) {
      console.log('[Twitter OAuth] Found existing OAuth data for session, checking if token is valid');
      
      // Check if token is expired or will expire soon
      const isExpired = existingOAuthData.tokenCreatedAt && 
                       existingOAuthData.expiresIn && 
                       Date.now() > (existingOAuthData.tokenCreatedAt + (existingOAuthData.expiresIn * 1000) - 300000); // 5 minutes buffer
      
      // Try to refresh if expired and we have a refresh token
      if (isExpired && existingOAuthData.refreshToken) {
        console.log('[Twitter OAuth] Token expired or will expire soon, attempting to refresh');
        try {
          const refreshedData = await refreshOAuth2Token(existingOAuthData.refreshToken);
          
          if (refreshedData && refreshedData.accessToken) {
            // Update token data
            existingOAuthData.accessToken = refreshedData.accessToken;
            existingOAuthData.refreshToken = refreshedData.refreshToken || existingOAuthData.refreshToken;
            existingOAuthData.expiresIn = refreshedData.expiresIn || existingOAuthData.expiresIn;
            existingOAuthData.tokenCreatedAt = refreshedData.tokenCreatedAt;
            existingOAuthData.lastRefresh = Date.now();
            
            // Store updated token
            if (redisReady()) {
              await storeTwitterOAuthData(sessionId, existingOAuthData, 
                      existingOAuthData.expiresIn ? Math.min(existingOAuthData.expiresIn, OAUTH_DATA_TTL_SECONDS) : OAUTH_DATA_TTL_SECONDS);
              console.log('[Twitter OAuth] Successfully refreshed and stored token in Redis');
            } else {
              sessionOAuthData.set(sessionId, existingOAuthData);
              console.log('[Twitter OAuth] Successfully refreshed and stored token in memory');
            }
          } else {
            console.log('[Twitter OAuth] Token refresh failed, will need to reauthorize');
          }
        } catch (refreshError) {
          console.error('[Twitter OAuth] Error refreshing token:', refreshError);
          // Continue with standard flow if refresh fails
        }
      }
      
      // Try to use existing token for direct share if still valid or successfully refreshed
      if (!isExpired || existingOAuthData.lastRefresh) {
        try {
          console.log('[Twitter OAuth] Using existing token to share directly');
          
          // Create Twitter client from the stored token
          const loggedUserClient = getClientFromToken(existingOAuthData.accessToken);
          
          // Construct tweet text with custom message and shareUrl
          const tweetText = shareUrl
            ? `${message || "Created in #SogniPhotobooth"} ${shareUrl}`
            : message || "Created in #SogniPhotobooth https://photobooth.sogni.ai";
          
          // Attempt to share the image directly
          const tweetResult = await shareImageToX(loggedUserClient, imageUrl, tweetText);
          
          // Update usage timestamps
          existingOAuthData.lastUsed = Date.now();
          existingOAuthData.lastSuccess = Date.now();
          
          // Store the updated data
          if (redisReady()) {
            await storeTwitterOAuthData(sessionId, existingOAuthData, 
                    existingOAuthData.expiresIn ? Math.min(existingOAuthData.expiresIn, OAUTH_DATA_TTL_SECONDS) : OAUTH_DATA_TTL_SECONDS);
          } else {
            sessionOAuthData.set(sessionId, existingOAuthData);
          }
          
          // Track successful share in metrics (both old and new systems)
          await incrementTwitterShares();
          await trackMetric('twitter_shares', 1);
          
          console.log('[Twitter OAuth] Successfully shared directly using existing token');
          
          // If this is a Halloween context share, submit to contest (direct share path)
          if (halloweenContext && prompt && tweetResult?.data?.id) {
            try {
              console.log('[Contest] Submitting Halloween contest entry (direct share)');
              const tweetUrl = `https://twitter.com/i/web/status/${tweetResult.data.id}`;
              
              await saveContestEntry({
                contestId: 'halloween',
                imageUrl,
                prompt,
                username,
                address,
                tweetId: tweetResult.data.id,
                tweetUrl,
                metadata: {
                  message: message || '',
                  shareUrl: shareUrl || '',
                  timestamp: Date.now(),
                  shareType: 'direct'
                }
              });
              
              console.log('[Contest] Successfully submitted Halloween contest entry (direct share)');
            } catch (contestError) {
              // Don't fail the whole share if contest submission fails
              console.error('[Contest] Error submitting contest entry (direct share):', contestError);
            }
          }
          
          // Send direct success response
          // Make sure the response includes all necessary fields for the client to recognize success
          return res.json({ 
            success: true,
            message: 'Image shared directly using existing token',
            directShare: true  // Add this flag to help client distinguish direct shares
          });
        } catch (directShareError) {
          console.error('[Twitter OAuth] Error using existing token for direct share:', directShareError);
          console.log('[Twitter OAuth] Will proceed with standard OAuth flow');
          // Fall through to standard OAuth flow if direct share fails
        }
      }
    }

    // Standard OAuth flow (only reached if we don't have a valid token or direct share fails)
    // Generate a unique state string
    const state = crypto.randomBytes(16).toString('hex');
    
    // Store session ID mapped to state
    if (redisReady()) {
      await storeTwitterStateMapping(state, sessionId);
    } else {
      sessionIdIndex.set(state, sessionId);
    }
    
    // Generate OAuth URL
    const { url, codeVerifier } = generateAuthLink(state);
    
    // Store code verifier in session data for later verification
    const oauthData = { 
      codeVerifier,
      timestamp: Date.now(),
      pendingImageUrl: imageUrl,
      pendingMessage: message,
      pendingShareUrl: shareUrl,
      halloweenContext: halloweenContext || false,
      prompt: prompt || null,
      username: username || null,
      address: address || null
    };
    
    if (redisReady()) {
      await storeTwitterOAuthData(sessionId, oauthData, OAUTH_DATA_TTL_SECONDS);
    } else {
      sessionOAuthData.set(sessionId, oauthData);
    }
    
    console.log(`[Twitter OAuth] Stored code verifier for state ${state} and session ${sessionId}`);
    
    // Send OAuth URL to client
    res.json({ authUrl: url });
  } catch (error) {
    console.error('Error starting Twitter share:', error);
    res.status(500).json({ message: `Error starting Twitter share: ${error.message}` });
  }
});

// GET /auth/x/callback - Handle Twitter OAuth callback
router.get('/callback', async (req, res) => {
  try {
    // Get state and code from query parameters
    const { state, code } = req.query;
    
    if (!state || !code) {
      const errorMessage = !state ? 'Missing OAuth state' : 'Missing authorization code';
      console.error(`[Twitter OAuth] ${errorMessage}`);
      return sendErrorPage(res, errorMessage);
    }
    
    // Make sure the state is a string - simplified check to avoid false rejections
    if (typeof state !== 'string') {
      console.error(`[Twitter OAuth] State is not a string. Received: ${typeof state}`);
      return sendErrorPage(res, 'Invalid OAuth state. Please try again.');
    }
    
    // Get the session ID associated with this state
    let sessionId;
    if (redisReady()) {
      sessionId = await getSessionIdFromState(state);
    } else {
      sessionId = sessionIdIndex.get(state);
    }
    
    if (!sessionId) {
      // console.error(`[Twitter OAuth] No session found for state: ${state}`);
      return sendErrorPage(res, 'Session expired or invalid. Please try again.');
    }
    
    // console.log(`[Twitter OAuth] Using session ID: ${sessionId} with storage: ${redisReady() ? 'Redis' : 'in-memory'}`);
    
    // Try to get OAuth data from Redis first
    let oauthData = null;
    
    if (redisReady()) {
      // console.log(`[Twitter OAuth] Attempting to retrieve OAuth data from Redis using session ID: ${sessionId}`);
      oauthData = await getTwitterOAuthData(sessionId);
      
      if (oauthData) {
        // console.log('[Twitter OAuth] Found OAuth data directly in Redis with session ID');
      }
    } else {
      // Try in-memory storage as fallback
      oauthData = sessionOAuthData.get(sessionId);
      if (oauthData) {
        // console.log('[Twitter OAuth] Found OAuth data in in-memory storage');
      }
    }
    
    if (!oauthData || !oauthData.codeVerifier) {
      console.error(`[Twitter OAuth] OAuth data not found or missing code verifier for session ${sessionId}`);
      return sendErrorPage(res, 'Authentication data expired or invalid. Please try again.');
    }
    
    // console.log(`[Twitter OAuth] OAuth data retrieval result: ${dataSource}`);
    // onsole.log('[Twitter OAuth] Retrieved OAuth data successfully, proceeding with Twitter API call');

    // Extract required data from OAuth data
    const { codeVerifier, pendingImageUrl: imageUrl, pendingMessage: message } = oauthData;
    
    // IMPORTANT: Do not delete OAuth data yet, wait until the token exchange is successful
    
    try {
      // Complete the OAuth2 flow by exchanging the authorization code for an access token
      const { client: loggedUserClient, accessToken, refreshToken, expiresIn, scope } = 
        await loginWithOAuth2(code, codeVerifier);
      
      console.log('[Twitter OAuth] Successfully exchanged authorization code for access token');
      
      // Now we can safely update the OAuth data
      if (redisReady()) {
        // Instead of deleting, update the OAuth data with the new tokens
        const updatedOAuthData = { 
          ...oauthData,
          accessToken,
          refreshToken,
          expiresIn,
          scope,
          tokenCreatedAt: Date.now(),
          timestamp: Date.now(),
        };
        // Remove the code verifier as it's no longer needed
        delete updatedOAuthData.codeVerifier;
        
        await storeTwitterOAuthData(sessionId, updatedOAuthData, 
                  updatedOAuthData.expiresIn ? 
                  Math.min(updatedOAuthData.expiresIn, OAUTH_DATA_TTL_SECONDS) : 
                  OAUTH_DATA_TTL_SECONDS);
        
        console.log('[Twitter OAuth] Updated OAuth data with access token');
      } else {
        // In-memory fallback
        oauthData.accessToken = accessToken;
        oauthData.refreshToken = refreshToken;
        oauthData.expiresIn = expiresIn;
        oauthData.scope = scope;
        oauthData.tokenCreatedAt = Date.now();
        delete oauthData.codeVerifier;
        oauthData.timestamp = Date.now();
        
        sessionOAuthData.set(sessionId, oauthData);
        console.log('[Twitter OAuth] Stored access token in memory before attempting share');
      }
      
      // Log info before sharing
      console.log('[Twitter OAuth] Token exchange successful, attempting to share image');
      
      // Extract the pending data
      const shareUrl = oauthData.pendingShareUrl;
      
      if (!imageUrl) {
        throw new Error('No pending image URL found in session data');
      }
      
      // Construct tweet text with custom message and shareUrl
      const tweetText = shareUrl
        ? `${message || "Created in #SogniPhotobooth"} ${shareUrl}`
        : message || "Created in #SogniPhotobooth https://photobooth.sogni.ai";
      
      // Share the image on Twitter with the logged in user
      const tweetResult = await shareImageToX(loggedUserClient, imageUrl, tweetText);
      
      // Add specific check for successful tweet result
      if (!tweetResult || !tweetResult.data || !tweetResult.data.id) {
        throw new Error('Could not verify successful image share. Tweet data incomplete.');
      }
      
      // Increment share count in analytics (both old and new systems)
      if (sessionId && redisReady()) {
        await incrementTwitterShares();
        await trackMetric('twitter_shares', 1);
      }
      
      console.log('[Twitter OAuth] Image successfully shared to X, tweet ID:', tweetResult.data.id);
      
      // If this is a Halloween context share, submit to contest (OAuth callback path)
      if (oauthData.halloweenContext && oauthData.prompt) {
        try {
          console.log('[Contest] Submitting Halloween contest entry (OAuth callback)');
          const tweetUrl = `https://twitter.com/i/web/status/${tweetResult.data.id}`;
          
          await saveContestEntry({
            contestId: 'halloween',
            imageUrl,
            prompt: oauthData.prompt,
            username: oauthData.username,
            address: oauthData.address,
            tweetId: tweetResult.data.id,
            tweetUrl,
            metadata: {
              message: message || '',
              shareUrl: shareUrl || '',
              timestamp: Date.now(),
              shareType: 'oauth_callback'
            }
          });
          
          console.log('[Contest] Successfully submitted Halloween contest entry (OAuth callback)');
        } catch (contestError) {
          // Don't fail the whole share if contest submission fails
          console.error('[Contest] Error submitting contest entry (OAuth callback):', contestError);
        }
      }
      
      // Success HTML with messaging to parent window
      const successHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Sharing to X - Success</title>
          <style>
            body {
              font-family: sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background-color: #f8f9fa;
            }
            .success-card {
              background: white;
              border-radius: 8px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              padding: 2rem;
              text-align: center;
              max-width: 90%;
              width: 400px;
            }
            .icon {
              font-size: 4rem;
              color: #00acee;
              margin-bottom: 1rem;
            }
            h2 {
              margin-top: 0;
              color: #333;
            }
            .message {
              color: #555;
              margin: 1rem 0;
            }
          </style>
        </head>
        <body>
          <div class="success-card">
            <div class="icon">✓</div>
            <h2>Share Successful!</h2>
            <div class="message">Your image has been successfully shared to X.</div>
          </div>
          <script>
            // Notify the opener window about successful share
            if (window.opener) {
              try {
                window.opener.postMessage({
                  type: 'twitter-auth-success',
                  service: 'twitter',
                  message: 'Successfully shared to X'
                }, '*');
                
                console.log('Success message posted to opener');
              } catch (err) {
                console.error('Error posting message to opener:', err);
              }
            } else {
              console.warn('No opener window found');
            }
            
            // Auto-close this window after a delay
            setTimeout(function() {
              window.close();
              // If window doesn't close (e.g., if not opened by script), redirect
              setTimeout(function() {
                window.location.href = "${CLIENT_ORIGIN}?share_status=success&service=twitter";
              }, 500);
            }, 2000);
          </script>
        </body>
        </html>
      `;
      
      res.send(successHtml);

    } catch (apiError) {
      console.error('[Twitter OAuth] Error during token exchange or sharing:', apiError);
      
      // Don't delete the token on error, as we might want to troubleshoot
      // Instead, mark it as having an error
      if (redisReady()) {
        const currentData = await getTwitterOAuthData(sessionId);
        if (currentData) {
          const updatedData = { 
            ...currentData,
            lastError: Date.now(),
            errorMessage: apiError.message || 'Unknown error',
          };
          
          await storeTwitterOAuthData(sessionId, updatedData, OAUTH_DATA_TTL_SECONDS);
          console.log('[Twitter OAuth] Stored error information with token data');
        }
      }
      
      // Re-throw the error to be handled by the outer catch
      throw apiError;
    }

  } catch (error) {
    console.error('Error in /auth/x/callback:', error.message);
    
    // Try to get session ID and clean up
    const sessionId = req.cookies?.sogni_session_id;
    if (sessionId) {
      if (redisReady()) {
        await deleteTwitterOAuthData(sessionId);
      } else {
        sessionOAuthData.delete(sessionId);
      }
    }

    let userMessage = 'An error occurred during Twitter authorization or sharing. Please try again.';
    if (error.message.includes('Failed to exchange authorization code')) {
      userMessage = 'Could not complete Twitter authorization. The request may have expired or been invalid.';
    } else if (error.message.includes('Failed to share image on X')) {
      userMessage = `Could not share your image to Twitter. ${error.message.replace('Failed to share image on X: ','')}`;
    }
    
    // Send HTML with error message that will post to opener
    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Twitter Share Failed</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            color: #333;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            padding: 20px;
            text-align: center;
          }
          .error-card {
            background: white;
            border-radius: 10px;
            box-shadow: 0 8px 16px rgba(0,0,0,0.1);
            padding: 30px;
            max-width: 400px;
            width: 100%;
          }
          h2 {
            color: #E0245E;
            margin-top: 0;
          }
          .icon {
            font-size: 48px;
            margin-bottom: 20px;
          }
          .message {
            margin-bottom: 20px;
            color: #555;
          }
        </style>
      </head>
      <body>
        <div class="error-card">
          <div class="icon">✕</div>
          <h2>Share Failed</h2>
          <div class="message">${userMessage}</div>
        </div>
        <script>
          // Send error message to opener window
          if (window.opener) {
            try {
              window.opener.postMessage({
                type: 'twitter-auth-error',
                service: 'twitter',
                message: ${JSON.stringify(userMessage)}
              }, '*'); // Using * since CLIENT_ORIGIN may vary
              
              console.log('Error message posted to opener');
            } catch (err) {
              console.error('Error posting message to opener:', err);
            }
          } else {
            console.warn('No opener window found');
          }
          
          // Auto-close this window after a delay
          setTimeout(function() {
            window.close();
            // If window doesn't close (e.g., if not opened by script), redirect
            setTimeout(function() {
              window.location.href = "${CLIENT_ORIGIN}?share_status=error&service=twitter&message=${encodeURIComponent(userMessage)}";
            }, 500);
          }, 3000);
        </script>
      </body>
      </html>
    `;
    
    if (!res.headersSent) {
      res.send(errorHtml);
    } else {
      console.error("Headers already sent in /auth/x/callback error handler, cannot send HTML.");
    }
  }
});

// No need for regular cleanup with Redis as it handles TTL automatically
// But we'll keep a modified version for the in-memory fallback
const cleanupExpiredOAuthData = () => {
  // Skip if Redis is available as it handles TTL automatically
  if (redisReady()) {
    return;
  }
  
  const now = Date.now();
  let expiredCount = 0;
  let indexCount = 0;
  
  // Clean up expired OAuth data from in-memory storage
  for (const [sessionId, data] of sessionOAuthData.entries()) {
    if (now - data.timestamp > OAUTH_DATA_TTL) {
      sessionOAuthData.delete(sessionId);
      expiredCount++;
    }
  }
  
  // Clean up expired session ID indexes
  for (const [state, sessionId] of sessionIdIndex.entries()) {
    if (!sessionOAuthData.has(sessionId)) {
      sessionIdIndex.delete(state);
      indexCount++;
    }
  }
  
  if (expiredCount > 0 || indexCount > 0) {
    console.log(`Cleaned up ${expiredCount} expired OAuth sessions and ${indexCount} session indexes from in-memory storage`);
  }
};

// Run cleanup every 5 minutes for in-memory fallback
setInterval(cleanupExpiredOAuthData, 5 * 60 * 1000);

// Add this function before the routes, after the constants
const sendErrorPage = (res, userMessage) => {
  // Log the error message
  console.error(`[Twitter OAuth] Sending error page: ${userMessage}`);
  
  // Send HTML with error message that will post to opener
  const errorHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Twitter Share Failed</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          color: #333;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
          padding: 20px;
          text-align: center;
        }
        .error-card {
          background: white;
          border-radius: 10px;
          box-shadow: 0 8px 16px rgba(0,0,0,0.1);
          padding: 30px;
          max-width: 400px;
          width: 100%;
        }
        h2 {
          color: #E0245E;
          margin-top: 0;
        }
        .icon {
          font-size: 48px;
          margin-bottom: 20px;
        }
        .message {
          margin-bottom: 20px;
          color: #555;
        }
      </style>
    </head>
    <body>
      <div class="error-card">
        <div class="icon">✕</div>
        <h2>Share Failed</h2>
        <div class="message">${userMessage}</div>
      </div>
      <script>
        // Send error message to opener window
        if (window.opener) {
          try {
            window.opener.postMessage({
              type: 'twitter-auth-error',
              service: 'twitter',
              message: ${JSON.stringify(userMessage)}
            }, '*'); // Using * since CLIENT_ORIGIN may vary
            
            console.log('Error message posted to opener');
          } catch (err) {
            console.error('Error posting message to opener:', err);
          }
        } else {
          console.warn('No opener window found');
        }
        
        // Auto-close this window after a delay
        setTimeout(function() {
          window.close();
          // If window doesn't close (e.g., if not opened by script), redirect
          setTimeout(function() {
            window.location.href = "${CLIENT_ORIGIN}?share_status=error&service=twitter&message=${encodeURIComponent(userMessage)}";
          }, 500);
        }, 3000);
      </script>
    </body>
    </html>
  `;
  
  if (!res.headersSent) {
    res.send(errorHtml);
    return true;
  } else {
    console.error("Headers already sent, cannot send error HTML.");
    return false;
  }
};

export default router; 