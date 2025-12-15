import { TwitterApi } from 'twitter-api-v2';
import axios from 'axios';
import dotenv from 'dotenv';
import process from 'process'; // Added to address linter error
import { Buffer } from 'buffer'; // Added to address linter error

dotenv.config(); // To load environment variables from .env file

// Initialize a base client for app-only actions or to generate auth links
// User-specific actions will need a client initialized with user's accessToken
const appOnlyClient = new TwitterApi({
  clientId: process.env.TWITTER_CLIENT_ID,
  clientSecret: process.env.TWITTER_CLIENT_SECRET,
});

const TWITTER_REDIRECT_URI = process.env.TWITTER_REDIRECT_URI;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '/'; // For redirecting after share

/**
 * Generates the OAuth2 authorization link for users to authorize the app.
 * @param {string} state - A unique string to prevent CSRF, also used to pass data.
 * @returns {object} { url: string, codeVerifier: string, state: string }
 */
export const generateAuthLink = (state) => {
  const { url, codeVerifier, state: generatedState } = appOnlyClient.generateOAuth2AuthLink(
    TWITTER_REDIRECT_URI,
    {
      scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access', 'media.write'],
      state: state, // Use the passed state
    }
  );
  // The state returned by generateOAuth2AuthLink is the one to verify on callback
  return { url, codeVerifier, state: generatedState }; 
};

/**
 * Exchanges the authorization code for an access token.
 * @param {string} code - The authorization code from Twitter callback.
 * @param {string} codeVerifier - The PKCE code verifier.
 * @returns {Promise<object>} Twitter access token object { client: TwitterApi, accessToken: string, refreshToken?: string, expiresIn?: number, scope?: string[] }
 */
export const loginWithOAuth2 = async (code, codeVerifier) => {
  try {
    const { client: loggedClient, accessToken, refreshToken, expiresIn, scope } = await appOnlyClient.loginWithOAuth2({
      code,
      codeVerifier,
      redirectUri: TWITTER_REDIRECT_URI,
    });
    return { client: loggedClient, accessToken, refreshToken, expiresIn, scope };
  } catch (error) {
    console.error('Error logging in with OAuth2:', error.message);
    if (error.response && error.response.data) {
      console.error('Twitter API error details:', error.response.data);
    }
    throw new Error('Failed to exchange authorization code for token.');
  }
};

/**
 * Shares an image to Twitter on behalf of the user.
 * @param {TwitterApi} userClient - The user's Twitter API client.
 * @param {string} imageUrl - The URL of the image to share.
 * @param {string} [tweetText=""] - Optional text for the tweet.
 * @returns {Promise<object>} The result of the tweet posting (data part).
 */
export const shareImageToX = async (userClient, imageUrl, tweetText = "") => {
  try {
    // userClient is now passed in directly, no need to create a new one from accessToken.
    // The block for creating and verifying userClient has been removed.
    
    // Verify the passed-in client object
    if (!userClient) {
      throw new Error('Twitter API client (userClient) was not provided.');
    }
    console.log('Using provided Twitter API client for sharing.');

    // Existing checks for client methods can remain as a safeguard, 
    // though the loggedUserClient should already be correctly configured.
    if (!userClient.post || typeof userClient.post !== 'function') {
      throw new Error('Provided Twitter API client missing required method: post');
    }
    if (!userClient.v2 || !userClient.v2.tweet || typeof userClient.v2.tweet !== 'function') {
      throw new Error('Provided Twitter API client missing required method: v2.tweet');
    }

    // Optional: Re-verify token if deemed necessary, though it might be redundant
    // if loggedUserClient is assumed to be valid.
    try {
      console.log('Verifying provided Twitter API client token...');
      await userClient.currentUserV2(); // Using V2 endpoint for user context
      console.log('Token verification successful for provided client.');
    } catch (verifyError) {
      console.warn('Token verification warning for provided client (non-fatal):', verifyError.message);
      // Decide if this is critical. For now, proceed as before.
      console.log('Continuing with media upload as token may still have write access.');
    }

    console.log(`Downloading image from: ${imageUrl.startsWith('data:image') ? 'data:image URL' : 'http URL'}`);
    let imageBuffer;
    let imageResponse;
    try {
      // Add timeout to prevent hanging on slow URLs
      imageResponse = await axios.get(imageUrl, { 
        responseType: 'arraybuffer',
        timeout: 15000, // 15 second timeout
        headers: {
          'Accept': 'image/*'
        }
      });
      
      // Log response details to help with debugging
      console.log(`Image download status: ${imageResponse.status}`);
      
      if (!imageResponse.data || imageResponse.data.length === 0) {
        throw new Error('Downloaded image is empty');
      }
      
      imageBuffer = Buffer.from(imageResponse.data);
      console.log('Image downloaded successfully.');
      
      // Validate buffer is not empty
      if (imageBuffer.length === 0) {
        throw new Error('Image buffer is empty after download');
      }
      
    } catch (downloadError) {
      console.error('Error downloading image:', downloadError.message);
      if (downloadError.response) {
        console.error(`Response status: ${downloadError.response.status}`);
        console.error(`Response headers:`, downloadError.response.headers);
      }
      throw new Error(`Failed to download image: ${downloadError.message}`);
    }

    // Improved MIME type detection with robust error handling
    let mimeType = 'image/jpeg'; // Default
    try {
      // First try to use the content-type header if available (if imageResponse exists from download)
      if (typeof imageResponse !== 'undefined' && 
          imageResponse?.headers?.['content-type'] && 
          typeof imageResponse.headers['content-type'] === 'string' &&
          imageResponse.headers['content-type'].startsWith('image/')) {
        console.log(`Using content-type header for MIME type: ${imageResponse.headers['content-type']}`);
        mimeType = imageResponse.headers['content-type'].split(';')[0].trim(); // Remove any parameters
      } 
      // Then try to extract from URL if it's valid
      else if (imageUrl && typeof imageUrl === 'string') {
        try {
          const url = new URL(imageUrl);
          if (url.pathname) {
            const pathLower = url.pathname.toLowerCase();
            
            // Check for image extensions
            if (pathLower.endsWith('.png') || pathLower.includes('.png?')) {
              mimeType = 'image/png';
            } else if (pathLower.endsWith('.gif') || pathLower.includes('.gif?')) {
              mimeType = 'image/gif';
            } else if (pathLower.endsWith('.jpg') || pathLower.includes('.jpg?') || 
                       pathLower.endsWith('.jpeg') || pathLower.includes('.jpeg?')) {
              mimeType = 'image/jpeg';
            } else if (pathLower.endsWith('.webp') || pathLower.includes('.webp?')) {
              mimeType = 'image/webp';
            } else {
              console.log('No file extension found in URL, will try detecting from content');
            }
          }
        } catch (urlError) {
          console.warn('Failed to parse image URL:', urlError.message);
        }
      }
      
      // If we still don't have a MIME type, try to detect from the content
      if (imageBuffer && imageBuffer.length >= 4) {
        const header = imageBuffer.slice(0, 4).toString('hex');
        
        // Detect based on magic numbers
        if (header.startsWith('89504e47')) { // PNG header
          console.log('Detected PNG from image header bytes');
          mimeType = 'image/png';
        } else if (header.startsWith('47494638')) { // GIF header
          console.log('Detected GIF from image header bytes');
          mimeType = 'image/gif';
        } else if (header.startsWith('ffd8ff')) { // JPEG header
          console.log('Detected JPEG from image header bytes');
          mimeType = 'image/jpeg';
        } else if (header.startsWith('52494646')) { // WEBP header starts with "RIFF"
          console.log('Detected WEBP from image header bytes');
          mimeType = 'image/webp';
        } else {
          console.log(`Unknown image format from header: ${header}, using default MIME type`);
        }
      }
    } catch (error) {
      console.warn('Error detecting MIME type, using default:', error.message);
    }
    
    console.log(`Final MIME type for upload: ${mimeType}`);

    // Additional validation of the image buffer before uploading
    try {
      if (!imageBuffer || imageBuffer.length === 0) {
        throw new Error('Image buffer is empty or undefined');
      }
      
      // Check if the image is reasonably sized for Twitter (Twitter has limits)
      if (imageBuffer.length > 15 * 1024 * 1024) {
        console.warn('Image may be too large for Twitter (>15MB):', imageBuffer.length, 'bytes');
      } else if (imageBuffer.length < 100) {
        console.warn('Image suspiciously small, might be corrupted:', imageBuffer.length, 'bytes');
      }
      
      // Look for common image format markers to verify the buffer is actually an image
      const header = imageBuffer.slice(0, 8).toString('hex');
      console.log('Image header (first 8 bytes):', header);
      
      let formatValid = false;
      
      // Check for valid headers
      if (header.startsWith('89504e47')) { // PNG
        formatValid = true;
        console.log('Image verified as PNG format from header');
      } else if (header.startsWith('47494638')) { // GIF
        formatValid = true;
        console.log('Image verified as GIF format from header');
      } else if (header.startsWith('ffd8ff')) { // JPEG
        formatValid = true;
        console.log('Image verified as JPEG format from header');
      } else if (header.startsWith('52494646')) { // WEBP (RIFF...)
        formatValid = true;
        console.log('Image verified as WEBP format from header');
      }
      
      if (!formatValid) {
        console.warn('Warning: Could not verify image format from header bytes. This may cause upload issues.');
        console.warn('Header bytes:', header);
      }
      
      // Double check MIME type against actual header
      if ((header.startsWith('89504e47') && mimeType !== 'image/png') ||
          (header.startsWith('47494638') && mimeType !== 'image/gif') ||
          (header.startsWith('ffd8ff') && mimeType !== 'image/jpeg') ||
          (header.startsWith('52494646') && mimeType !== 'image/webp')) {
        
        console.warn('Warning: MIME type mismatch. Header indicates a different format than provided MIME type.');
        console.warn(`Header suggests: ${
          header.startsWith('89504e47') ? 'PNG' : 
          header.startsWith('47494638') ? 'GIF' : 
          header.startsWith('ffd8ff') ? 'JPEG' : 
          header.startsWith('52494646') ? 'WEBP' : 'unknown'
        }, but MIME type is: ${mimeType}`);
        
        // Correct MIME type based on header
        if (header.startsWith('89504e47')) {
          console.log('Auto-correcting MIME type to image/png based on file header');
          mimeType = 'image/png';
        } else if (header.startsWith('47494638')) {
          console.log('Auto-correcting MIME type to image/gif based on file header');
          mimeType = 'image/gif';
        } else if (header.startsWith('ffd8ff')) {
          console.log('Auto-correcting MIME type to image/jpeg based on file header');
          mimeType = 'image/jpeg';
        } else if (header.startsWith('52494646')) {
          console.log('Auto-correcting MIME type to image/webp based on file header');
          mimeType = 'image/webp';
        }
      }
    } catch (validationError) {
      console.error('Image validation error:', validationError.message);
      // Don't throw here - we'll let the upload try anyway, but we've logged the potential issues
    }

    console.log(`Uploading media to Twitter (MIME type: ${mimeType}) using API v2...`);
    
    let mediaId;
    try {
      // Log image buffer size before upload
      console.log(`Uploading image buffer of size: ${imageBuffer.length} bytes with MIME type: ${mimeType} using client.v2.uploadMedia.`);
      
      // Use the library's v2 uploadMedia method.
      // This method should handle the INIT, APPEND, FINALIZE flow internally for API v2.
      // It typically requires the media buffer and an object specifying the mimeType.
      // We might also need to specify media_category if required by v2 for images (e.g., 'tweet_image').
      mediaId = await userClient.v2.uploadMedia(imageBuffer, {
        mimeType: mimeType,
        media_category: 'tweet_image' // Explicitly set media category for tweet images
      });

      if (!mediaId) {
        throw new Error('Media ID was not returned from v2.uploadMedia.');
      }
      
      console.log(`Media uploaded successfully using API v2. Media ID: ${mediaId}`);

    } catch (uploadError) {
      console.error('Error uploading media to Twitter using API v2:', uploadError);
      // ... existing detailed error logging ...
      if (uploadError && typeof uploadError === 'object') {
        if (uploadError.data && uploadError.data.errors) {
          const errorDetail = JSON.stringify(uploadError.data.errors);
          throw new Error(`Twitter API v2 media upload failed: ${errorDetail}`);
        } else if (uploadError.data && uploadError.data.detail) { // v2 errors often have a 'detail' field
          throw new Error(`Twitter API v2 media upload failed: ${uploadError.data.detail}`);
        } else if (uploadError.code || uploadError.statusCode) {
          const statusCode = uploadError.code || uploadError.statusCode;
          throw new Error(`Twitter API v2 media upload failed with status code ${statusCode}: ${uploadError.message || 'Unknown error'}`);
        } else if (uploadError.message && uploadError.message.includes('ETIMEDOUT')) {
          throw new Error('Twitter API v2 media upload timed out. Please try again.');
        }
      }
      throw new Error(`Twitter API v2 media upload failed: ${uploadError ? uploadError.message || uploadError.toString() : 'Unknown error'}`);
    }

    // Post the tweet with the media using enhanced error handling
    console.log('Posting tweet...');
    try {
      /*
      console.log(`Attempting to post tweet with text: "${tweetText}" and media ID: ${mediaId}`);
      console.log('Tweet request payload:', JSON.stringify({
        text: tweetText,
        media: { media_ids: [mediaId] },
      }, null, 2));
      */

      // Perform the tweet request with better error handling
      let rawTweetResult;
      try {
        rawTweetResult = await userClient.v2.tweet({
          text: tweetText,
          media: { media_ids: [mediaId] },
        });
        
        // console.log('Raw tweet response type:', typeof rawTweetResult);
        // console.log('Raw tweet response:', JSON.stringify(rawTweetResult, null, 2));
      } catch (tweetApiError) {
        console.error('Tweet API call failed with error:', tweetApiError);
        console.error('Tweet API error details:', tweetApiError.message);
        if (tweetApiError.data) {
          console.error('Tweet API error data:', tweetApiError.data);
        }
        if (tweetApiError.errors) {
          console.error('Tweet API errors array:', tweetApiError.errors);
        }
        
        // Check for specific API errors
        if (tweetApiError.code === 170) {
          throw new Error('Twitter rejected the request: Missing authentication');
        } else if (tweetApiError.code === 187) {
          throw new Error('Twitter rejected the request: Status is a duplicate');
        } else if (tweetApiError.code === 186) {
          throw new Error('Twitter rejected the request: Tweet too long');
        } else if (tweetApiError.code === 324) {
          throw new Error('Twitter rejected the request: Media ID not found');
        }
        
        throw tweetApiError; // Re-throw for the outer catch
      }
      
      const tweetResult = rawTweetResult;
      
      // Verify the response contains the expected data
      if (!tweetResult) {
        throw new Error('No response received from Twitter tweet API');
      }
      
      if (!tweetResult.data || !tweetResult.data.id) {
        console.warn('Unexpected tweet result structure:', JSON.stringify(tweetResult, null, 2));
        throw new Error('Incomplete tweet data returned from Twitter API');
      }
      
      console.log('Tweet posted successfully with ID:', tweetResult.data.id);
      return tweetResult;
    } catch (tweetError) {
      console.error('Error posting tweet to Twitter:', tweetError);
      
      // Extract useful information from the error with proper null checks
      if (tweetError && typeof tweetError === 'object') {
        if (tweetError.data && tweetError.data.errors) {
          // Twitter API error with specific error details
          const errorDetail = JSON.stringify(tweetError.data.errors);
          throw new Error(`Twitter tweet posting failed: ${errorDetail}`);
        } else if (tweetError.code || tweetError.statusCode) {
          // HTTP error with status code
          const statusCode = tweetError.code || tweetError.statusCode;
          throw new Error(`Twitter tweet posting failed with status code ${statusCode}: ${tweetError.message || 'Unknown error'}`);
        } else if (tweetError.message && tweetError.message.includes('ETIMEDOUT')) {
          throw new Error('Twitter tweet posting timed out. The image was uploaded, but the tweet failed to post. Please try again.');
        } else if (tweetError.message && (
                  tweetError.message.includes('cannot read property') || 
                  tweetError.message.includes('Cannot read propert')
                  )) {
          // Specific error for the "cannot read property" issue
          throw new Error(`Twitter API response parsing error: ${tweetError.message}`);
        }
      }
      
      // If we couldn't extract specific details, use the generic message
      throw new Error(`Twitter tweet posting failed: ${tweetError ? tweetError.message || tweetError.toString() : 'Unknown error'}`);
    }

  } catch (error) {
    console.error('Error sharing image to X:', error.message);
    let errorMessage = `Failed to share image on X: ${error.message}`;
    if (error.isAxiosError && error.response && error.response.data) {
      console.error('Axios error details during share:', error.response.data);
      errorMessage = `Failed to download image for sharing. Server responded with ${error.response.status}`;
    } else if (error.response && error.response.data) { // Twitter API error
      console.error('Twitter API error details during share:', error.response.data);
      const twitterError = error.response.data.errors?.[0]?.message || error.response.data.detail || JSON.stringify(error.response.data);
      errorMessage = `Twitter API error during share: ${twitterError}`;
    }
    throw new Error(errorMessage);
  }
};

// Export CLIENT_ORIGIN as well if needed by other parts of the server for redirects
export { CLIENT_ORIGIN };

/**
 * Shares a video to Twitter on behalf of the user.
 * @param {TwitterApi} userClient - The user's Twitter API client.
 * @param {string} videoUrl - The URL of the video to share.
 * @param {string} [tweetText=""] - Optional text for the tweet.
 * @returns {Promise<object>} The result of the tweet posting (data part).
 */
export const shareVideoToX = async (userClient, videoUrl, tweetText = "") => {
  try {
    // Verify the passed-in client object
    if (!userClient) {
      throw new Error('Twitter API client (userClient) was not provided.');
    }
    console.log('[Twitter Video] Using provided Twitter API client for video sharing.');

    // Verify required methods exist
    if (!userClient.v1 || !userClient.v1.uploadMedia || typeof userClient.v1.uploadMedia !== 'function') {
      throw new Error('Provided Twitter API client missing required method: v1.uploadMedia');
    }
    if (!userClient.v2 || !userClient.v2.tweet || typeof userClient.v2.tweet !== 'function') {
      throw new Error('Provided Twitter API client missing required method: v2.tweet');
    }

    // Optional: Verify token
    try {
      console.log('[Twitter Video] Verifying provided Twitter API client token...');
      await userClient.currentUserV2();
      console.log('[Twitter Video] Token verification successful.');
    } catch (verifyError) {
      console.warn('[Twitter Video] Token verification warning (non-fatal):', verifyError.message);
      console.log('[Twitter Video] Continuing with video upload as token may still have write access.');
    }

    console.log(`[Twitter Video] Downloading video from URL...`);
    let videoBuffer;
    let videoResponse;
    
    try {
      // Add longer timeout for videos as they're larger
      videoResponse = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 60000, // 60 second timeout for video download
        maxContentLength: 512 * 1024 * 1024, // 512MB max
        headers: {
          'Accept': 'video/*'
        }
      });

      console.log(`[Twitter Video] Video download status: ${videoResponse.status}`);

      if (!videoResponse.data || videoResponse.data.length === 0) {
        throw new Error('Downloaded video is empty');
      }

      videoBuffer = Buffer.from(videoResponse.data);
      console.log(`[Twitter Video] Video downloaded successfully. Size: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);

      // Validate buffer is not empty
      if (videoBuffer.length === 0) {
        throw new Error('Video buffer is empty after download');
      }

      // Twitter video limits: 512MB max, 140 seconds max for most accounts
      if (videoBuffer.length > 512 * 1024 * 1024) {
        throw new Error('Video is too large for Twitter (max 512MB)');
      }

    } catch (downloadError) {
      console.error('[Twitter Video] Error downloading video:', downloadError.message);
      if (downloadError.response) {
        console.error(`[Twitter Video] Response status: ${downloadError.response.status}`);
      }
      throw new Error(`Failed to download video: ${downloadError.message}`);
    }

    // Detect MIME type
    let mimeType = 'video/mp4'; // Default for most video
    try {
      const contentType = videoResponse?.headers?.['content-type'];
      if (contentType && typeof contentType === 'string' && contentType.startsWith('video/')) {
        mimeType = contentType.split(';')[0].trim();
        console.log(`[Twitter Video] Using content-type header for MIME type: ${mimeType}`);
      } else if (videoUrl.toLowerCase().includes('.webm')) {
        mimeType = 'video/webm';
      } else if (videoUrl.toLowerCase().includes('.mov')) {
        mimeType = 'video/quicktime';
      }
    } catch (error) {
      console.warn('[Twitter Video] Error detecting MIME type, using default:', error.message);
    }

    console.log(`[Twitter Video] Final MIME type for upload: ${mimeType}`);
    console.log(`[Twitter Video] Uploading video to Twitter (this may take a while)...`);

    let mediaId;
    try {
      // Use v1 uploadMedia for video - it handles chunked upload automatically
      // and supports the longVideo option for videos over 30 seconds
      mediaId = await userClient.v1.uploadMedia(videoBuffer, {
        mimeType: mimeType,
        target: 'tweet', // Target for the media
        shared: false, // Not a shared media
      });

      if (!mediaId) {
        throw new Error('Media ID was not returned from video upload.');
      }

      console.log(`[Twitter Video] Video uploaded successfully. Media ID: ${mediaId}`);

    } catch (uploadError) {
      console.error('[Twitter Video] Error uploading video to Twitter:', uploadError);
      
      if (uploadError && typeof uploadError === 'object') {
        if (uploadError.data && uploadError.data.errors) {
          const errorDetail = JSON.stringify(uploadError.data.errors);
          throw new Error(`Twitter video upload failed: ${errorDetail}`);
        } else if (uploadError.data && uploadError.data.error) {
          throw new Error(`Twitter video upload failed: ${uploadError.data.error}`);
        } else if (uploadError.code || uploadError.statusCode) {
          const statusCode = uploadError.code || uploadError.statusCode;
          throw new Error(`Twitter video upload failed with status code ${statusCode}: ${uploadError.message || 'Unknown error'}`);
        }
      }
      throw new Error(`Twitter video upload failed: ${uploadError ? uploadError.message || uploadError.toString() : 'Unknown error'}`);
    }

    // Post the tweet with the video
    console.log('[Twitter Video] Posting tweet with video...');
    try {
      const tweetResult = await userClient.v2.tweet({
        text: tweetText,
        media: { media_ids: [mediaId] },
      });

      if (!tweetResult || !tweetResult.data || !tweetResult.data.id) {
        console.warn('[Twitter Video] Unexpected tweet result structure:', JSON.stringify(tweetResult, null, 2));
        throw new Error('Incomplete tweet data returned from Twitter API');
      }

      console.log('[Twitter Video] Tweet with video posted successfully! ID:', tweetResult.data.id);
      return tweetResult;

    } catch (tweetError) {
      console.error('[Twitter Video] Error posting tweet:', tweetError);

      if (tweetError && typeof tweetError === 'object') {
        if (tweetError.data && tweetError.data.errors) {
          const errorDetail = JSON.stringify(tweetError.data.errors);
          throw new Error(`Twitter video tweet posting failed: ${errorDetail}`);
        } else if (tweetError.code === 324) {
          throw new Error('Twitter rejected the video. It may still be processing. Please try again in a moment.');
        }
      }

      throw new Error(`Twitter video tweet posting failed: ${tweetError ? tweetError.message || tweetError.toString() : 'Unknown error'}`);
    }

  } catch (error) {
    console.error('[Twitter Video] Error sharing video to X:', error.message);
    throw new Error(`Failed to share video on X: ${error.message}`);
  }
};

/**
 * Creates a Twitter client from a stored access token
 * @param {Object} accessToken - The stored Twitter access token object
 * @returns {TwitterApi} A configured Twitter API client
 */
export const getClientFromToken = (accessToken) => {
  if (!accessToken) {
    throw new Error('No access token provided to create Twitter client');
  }
  
  console.log('[Twitter] Creating client from stored access token');
  
  try {
    
    // Handle different token formats (string or object)
    let tokenToUse = accessToken;
    
    // If it's an object with token properties, use those
    if (typeof accessToken === 'object' && accessToken.token) {
      tokenToUse = accessToken.token;
    } else if (typeof accessToken === 'object' && typeof accessToken.token_type === 'string') {
      // It's already in the correct format
    } else if (typeof accessToken === 'string') {
    } else {
      console.log('[Twitter] Unknown token format, trying to use as-is');
      console.log('[Twitter] Token keys:', Object.keys(accessToken));
    }
    
    // Create a user client from the stored access token
    const userClient = new TwitterApi(tokenToUse);
    
    if (!userClient) {
      throw new Error('Failed to create Twitter client from token');
    }
    
    return userClient;
  } catch (error) {
    console.error('[Twitter] Error creating client from token:', error);
    throw new Error(`Failed to initialize Twitter client: ${error.message}`);
  }
};

/**
 * Refresh an OAuth2 token using the refresh token
 * @param {string} refreshToken - The refresh token to use
 * @returns {Promise<object>} New token data or null if refresh failed
 */
export const refreshOAuth2Token = async (refreshToken) => {
  if (!refreshToken) {
    console.error('[Twitter] No refresh token provided');
    return null;
  }
  
  try {
    console.log('[Twitter] Attempting to refresh OAuth2 token');
    const { client: refreshedClient, accessToken, refreshToken: newRefreshToken, expiresIn } = 
      await appOnlyClient.refreshOAuth2Token(refreshToken);
    
    console.log('[Twitter] Successfully refreshed OAuth2 token');
    return { 
      client: refreshedClient, 
      accessToken, 
      refreshToken: newRefreshToken, 
      expiresIn,
      tokenCreatedAt: Date.now()
    };
  } catch (error) {
    console.error('[Twitter] Failed to refresh OAuth2 token:', error);
    return null;
  }
};