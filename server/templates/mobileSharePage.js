// Template renderer for the mobile share page
// Keep behavior identical to the in-route string it replaces

import { TWITTER_SHARE_CONFIG } from '../constants.js';

export function renderMobileSharePage({ imageUrl, twitterMessage }) {
  const defaultMessage = TWITTER_SHARE_CONFIG.DEFAULT_MESSAGE;
  const safeTwitterMessage = twitterMessage || defaultMessage;

  return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Share Your Photo - Sogni Photobooth</title>
        <meta property="og:title" content="My Sogni Photobooth Creation">
        <meta property="og:description" content="Check out my AI-generated photo from Sogni Photobooth!">
        <meta property="og:image" content="${imageUrl}">
        <meta property="og:type" content="website">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="My Sogni Photobooth Creation">
        <meta name="twitter:description" content="Check out my AI-generated photo from Sogni Photobooth!">
        <meta name="twitter:image" content="${imageUrl}">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            color: white;
            margin: 0;
            padding: 0;
          }
          
          .container {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 10px 10px 60px 10px;
            box-sizing: border-box;
          }
          
          .header {
            text-align: center;
            flex-shrink: 0;
            margin-bottom: 10px;
          }
          
          .header h1 {
            font-size: 22px;
            margin: 20px 0 5px 0;
            font-weight: 700;
          }
          
          .header p {
            opacity: 0.9;
            font-size: 13px;
            margin: 0;
          }
          
          .content {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
            max-width: 400px;
            flex: 1;
            min-height: 0;
          }
          
          .photo-container {
            margin-bottom: 15px;
            width: 100%;
            display: flex;
            justify-content: center;
          }
          
          .photo {
            width: 100%;
            max-width: 100%;
            height: auto;
            max-height: 60vh;
            display: block;
            object-fit: contain;
            border-radius: 8px;
          }
          
          .actions {
            display: flex;
            flex-direction: row;
            gap: 10px;
            width: 100%;
            flex-shrink: 0;
            margin-top: auto;
          }
          
          .btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 12px 16px;
            border: none;
            border-radius: 50px;
            font-size: 14px;
            font-weight: 600;
            text-decoration: none;
            transition: all 0.3s ease;
            cursor: pointer;
            flex: 1;
          }
          
          .btn-twitter {
            background: #1DA1F2;
            color: white;
          }
          
          .btn-twitter:hover {
            background: #0d8bd9;
            transform: translateY(-2px);
          }
          
          .btn-twitter:disabled {
            background: #999;
            cursor: not-allowed;
            transform: none;
          }
          
          .btn-download {
            background: white;
            color: #667eea;
            border: 2px solid rgba(255, 255, 255, 0.3);
          }
          
          .btn-download:hover {
            background: rgba(255, 255, 255, 0.1);
            color: white;
          }
          
          .footer {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            text-align: center;
            font-size: 14px;
            background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
            padding: 16px;
            z-index: 1000;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 -4px 15px rgba(255, 215, 0, 0.3);
          }
          
          .footer:hover {
            transform: translateY(-2px);
            box-shadow: 0 -6px 20px rgba(255, 215, 0, 0.4);
          }
          
          .footer:active {
            transform: translateY(0);
          }
          
          .loading {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid #ffffff;
            border-radius: 50%;
            border-top-color: transparent;
            animation: spin 1s ease-in-out infinite;
          }
          
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          
          .error-message {
            background: rgba(255, 0, 0, 0.1);
            border: 1px solid rgba(255, 0, 0, 0.3);
            color: #ff6b6b;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 15px;
            font-size: 14px;
            text-align: center;
          }
          
          .success-message {
            background: rgba(0, 255, 0, 0.1);
            border: 1px solid rgba(0, 255, 0, 0.3);
            color: #51cf66;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 15px;
            font-size: 14px;
            text-align: center;
          }
          
          .footer .prize-text {
            color: #333;
            text-decoration: none;
            font-weight: 700;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          }
          
          .footer .prize-emoji {
            font-size: 20px;
            animation: bounce 2s infinite;
          }
          
          @keyframes bounce {
            0%, 20%, 50%, 80%, 100% {
              transform: translateY(0);
            }
            40% {
              transform: translateY(-10px);
            }
            60% {
              transform: translateY(-5px);
            }
          }
          
          /* Promotional Popup Styles */
          .promo-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            height: 100vh;
            background-color: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.3s ease-out;
            overflow-y: auto;
            padding: 20px 0;
            box-sizing: border-box;
          }

          .promo-modal {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 20px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            width: 90%;
            max-width: 480px;
            max-height: 90vh;
            min-height: 400px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            animation: slideIn 0.4s ease-out;
            position: relative;
            color: white;
            margin: auto 0;
          }

          .promo-modal-close {
            position: absolute;
            top: 16px;
            right: 16px;
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            cursor: pointer;
            z-index: 1;
            transition: all 0.2s ease;
            backdrop-filter: blur(10px);
          }

          .promo-modal-close:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: scale(1.1);
          }

          .promo-modal-header {
            padding: 24px 24px 16px 24px;
            text-align: center;
            border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          }

          .promo-mascot {
            margin-bottom: 16px;
            display: flex;
            justify-content: center;
            align-items: center;
          }

          .sloth-mascot {
            width: 120px;
            height: auto;
            max-width: 100%;
            filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3));
            animation: slothBounce 3s ease-in-out infinite;
            transition: transform 0.3s ease;
          }

          .sloth-mascot:hover {
            transform: scale(1.05) rotate(-2deg);
          }

          @keyframes slothBounce {
            0%, 100% { 
              transform: translateY(0) scale(1);
            }
            25% { 
              transform: translateY(-8px) scale(1.02);
            }
            50% { 
              transform: translateY(-4px) scale(1.01);
            }
            75% { 
              transform: translateY(-12px) scale(1.03);
            }
          }

          .promo-modal-header h2 {
            font-size: 24px;
            margin: 0;
            font-weight: 600;
            color: white;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
          }

          .promo-modal-content {
            padding: 24px;
            overflow-y: auto;
            flex: 1;
          }

          .promo-message h3 {
            font-size: 20px;
            margin: 0 0 16px 0;
            font-weight: 700;
            text-align: center;
            color: white;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
          }

          .promo-message p {
            font-size: 16px;
            line-height: 1.5;
            margin: 0 0 24px 0;
            text-align: center;
            color: rgba(255, 255, 255, 0.95);
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
          }

          .promo-message strong {
            color: #FFD700;
            font-weight: 700;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
          }

          .promo-modal-footer {
            padding: 20px 24px 24px 24px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            border-top: 1px solid rgba(255, 255, 255, 0.2);
          }

          .promo-signup-btn {
            background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
            border: none;
            color: #333;
            padding: 16px 24px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3);
          }

          .promo-signup-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(255, 215, 0, 0.4);
          }

          .promo-signup-btn:active {
            transform: translateY(0);
          }

          .signup-text {
            flex: 1;
          }

          .signup-arrow {
            font-size: 18px;
            transition: transform 0.2s ease;
          }

          .promo-signup-btn:hover .signup-arrow {
            transform: translateX(4px);
          }

          .promo-maybe-later {
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.3);
            color: rgba(255, 255, 255, 0.8);
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s ease;
          }

          .promo-maybe-later:hover {
            background: rgba(255, 255, 255, 0.1);
            color: white;
          }

          @media (max-width: 480px) {
            .header h1 {
              font-size: 24px;
            }
            
            .photo-container {
              margin: 0 10px 20px;
            }
            
            .actions {
              margin: 0 10px;
            }

            .promo-modal-overlay {
              align-items: flex-end;
              padding: 0;
            }
            
            .promo-modal {
              width: 100%;
              margin: 0;
              border-radius: 20px 20px 0 0;
              max-height: 85vh;
              min-height: 300px;
            }

            .promo-modal-close {
              top: 12px;
              right: 12px;
              width: 32px;
              height: 32px;
              font-size: 20px;
            }

            .sloth-mascot {
              width: 80px;
            }

            .promo-modal-header h2 {
              font-size: 20px;
            }

            .promo-message h3 {
              font-size: 17px;
            }

            .promo-message p {
              font-size: 14px;
            }
          }
        </style>
      </head>
              <body>
        <div class="container">
          <div class="header">
            <h1>📸 Your Sogni Creation</h1>
            <p>Share your AI-generated masterpiece!</p>
          </div>
          
          <div class="content">
            <div class="photo-container">
              <img src="${imageUrl}" alt="Your Sogni Photobooth creation" class="photo" />
            </div>
            
            <div id="messages"></div>
            
            <div class="actions">
              <button onclick="window.handleTwitterShare()" class="btn btn-twitter" id="twitterBtn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.46 6c-.77.35-1.6.58-2.46.67.9-.53 1.59-1.37 1.92-2.38-.84.5-1.78.86-2.79 1.07C18.27 4.49 17.01 4 15.63 4c-2.38 0-4.31 1.94-4.31 4.31 0 .34.04.67.11.99C7.83 9.09 4.16 7.19 1.69 4.23-.07 6.29.63 8.43 2.49 9.58c-.71-.02-1.38-.22-1.97-.54v.05c0 2.09 1.49 3.83 3.45 4.23-.36.1-.74.15-1.14.15-.28 0-.55-.03-.81-.08.55 1.71 2.14 2.96 4.03 3-1.48 1.16-3.35 1.85-5.37 1.85-.35 0-.69-.02-1.03-.06 1.92 1.23 4.2 1.95 6.67 1.95 8.01 0 12.38-6.63 12.38-12.38 0-.19 0-.38-.01-.56.85-.61 1.58-1.37 2.16-2.24z"/>
                </svg>
                Twitter
              </button>
              
              <button onclick="window.handleSaveToPhone()" class="btn btn-download" id="saveBtn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                </svg>
                Save
              </button>
            </div>
            
            <div class="footer" onclick="window.showPromoPopup()">
              <div class="prize-text">
                <span class="prize-emoji">🎁</span>
                <span>Redeem 100 Free Render Credits</span>
                <span class="prize-emoji">✨</span>
              </div>
            </div>
          </div>
        </div>
        
        <script>
          // Import and use the exact same Twitter sharing logic as the main app
          let isSharing = false;
          
          function showMessage(message, type = 'info') {
            const messagesDiv = document.getElementById('messages');
            messagesDiv.innerHTML = \`<div class="\${type}-message">\${message}</div>\`;
            
            // Auto-hide success messages after 3 seconds
            if (type === 'success') {
              setTimeout(() => {
                messagesDiv.innerHTML = '';
              }, 3000);
            }
          }
          
          function setButtonLoading(loading) {
            const btn = document.getElementById('twitterBtn');
            if (loading) {
              btn.disabled = true;
              btn.innerHTML = \`
                <div class="loading"></div>
                Sharing...
              \`;
            } else {
              btn.disabled = false;
              btn.innerHTML = \`
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.46 6c-.77.35-1.6.58-2.46.67.9-.53 1.59-1.37 1.92-2.38-.84.5-1.78.86-2.79 1.07C18.27 4.49 17.01 4 15.63 4c-2.38 0-4.31 1.94-4.31 4.31 0 .34.04.67.11.99C7.83 9.09 4.16 7.19 1.69 4.23-.07 6.29.63 8.43 2.49 9.58c-.71-.02-1.38-.22-1.97-.54v.05c0 2.09 1.49 3.83 3.45 4.23-.36.1-.74.15-1.14.15-.28 0-.55-.03-.81-.08.55 1.71 2.14 2.96 4.03 3-1.48 1.16-3.35 1.85-5.37 1.85-.35 0-.69-.02-1.03-.06 1.92 1.23 4.2 1.95 6.67 1.95 8.01 0 12.38-6.63 12.38-12.38 0-.19 0-.38-.01-.56.85-.61 1.58-1.37 2.16-2.24z"/>
                </svg>
                Twitter
              \`;
            }
          }
          
          // Use the exact same shareToTwitter function as the main app
          async function shareToTwitter(params) {
            const {
              photoIndex = 0,
              photos = [{ images: ["${imageUrl}"] }],
              setBackendError = (err) => console.error('Backend error:', err),
              customMessage = ${JSON.stringify(safeTwitterMessage)},
              shareUrl = window.location.href,
              maxRetries = 2,
              onSuccess = () => showMessage('Successfully shared to Twitter! 🎉', 'success'),
              tezdevTheme = 'off',
              aspectRatio = null,
              outputFormat = 'jpg'
            } = params;
            
            console.log('shareToTwitter called with params:', { photoIndex, customMessage, shareUrl });
            
            // Get the image data URL (same logic as main app)
            const photo = photos[photoIndex];
            if (!photo || !photo.images || !photo.images[0]) {
              throw new Error('No image available for sharing');
            }
            
            const imageDataUrl = photo.images[0];
            const twitterMessage = customMessage;
            
            console.log('Attempting to share image to X');
            
            let retries = 0;
            const attemptShare = async () => {
              try {
                setBackendError(null);
                
                // Use config for API endpoint (same as main app)
                const apiBaseUrl = window.location.hostname.includes('localhost')
                  ? 'http://localhost:3001'
                  : 'https://photobooth-api.sogni.ai';
                const apiUrl = apiBaseUrl + '/api/auth/x/start';
                
                const response = await fetch(apiUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  credentials: 'include', // Important! Ensures cookies are sent
                  body: JSON.stringify({ 
                    imageUrl: imageDataUrl, // Send the data URL directly instead of blob URL
                    message: twitterMessage, // Use the appropriate message format
                    shareUrl: shareUrl // Include the share URL if provided
                  }),
                });
                
                if (!response.ok) {
                  // Try to get error message from response
                  let errorMessage = 'Failed to start Twitter share process.';
                  try {
                    const errorData = await response.json();
                    errorMessage = errorData.message || errorMessage;
                  } catch (e) {
                    // If we can't parse response body, use status text
                    errorMessage = response.statusText || errorMessage;
                  }
                  
                  console.error('Failed to initiate Twitter share:', response.status, errorMessage);
                  
                  // For specific status codes that might be transient, retry
                  if ((response.status >= 500 || response.status === 429) && retries < maxRetries) {
                    retries++;
                    console.log(\`Retrying Twitter share (\${retries}/\${maxRetries})\`);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retrying
                    return attemptShare();
                  }
                  
                  setBackendError({
                    type: 'connection_error',
                    title: '🌐 Connection Issue',
                    message: 'Having trouble connecting to our sharing service. Please check your internet connection and try again.',
                    details: errorMessage,
                    canRetry: true
                  });
                  return;
                }
                
                const responseData = await response.json();
                console.log('Twitter API response:', responseData);
                
                if (responseData.success) {
                  if (responseData.authUrl) {
                    // Need to authenticate first
                    console.log('Redirecting to Twitter auth:', responseData.authUrl);
                    window.location.href = responseData.authUrl;
                  } else if (responseData.message) {
                    // Already authenticated and shared successfully
                    console.log('Twitter share successful:', responseData.message);
                    onSuccess();
                  }
                } else {
                  throw new Error(responseData.message || 'Twitter sharing failed');
                }
                
              } catch (error) {
                console.error('Twitter share error:', error);
                throw error;
              }
            };
            
            return attemptShare();
          }
          
          // Show custom Twitter share modal (same as main app)
          function handleTwitterShare() {
            if (isSharing) return;
            showTwitterModal();
          }
          // Expose handler globally for inline onclick
          window.handleTwitterShare = handleTwitterShare;
          
          // Custom Twitter share modal (same as main app)
          function showTwitterModal() {
            // Create modal overlay
            const overlay = document.createElement('div');
            overlay.className = 'twitter-modal-overlay';
            overlay.style.cssText = \`
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background-color: rgba(0, 0, 0, 0.75);
              display: flex;
              align-items: center;
              justify-content: center;
              z-index: 10000;
              animation: fadeIn 0.2s ease-out;
            \`;
            
            // Create modal
            const modal = document.createElement('div');
            modal.className = 'twitter-modal';
            modal.style.cssText = \`
              background-color: white;
              border-radius: 16px;
              box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
              width: 95%;
              max-width: 460px;
              max-height: 85vh;
              overflow: hidden;
              display: flex;
              flex-direction: column;
              animation: slideIn 0.25s ease-out;
              position: relative;
            \`;
            
            modal.innerHTML = \`
              <button class="twitter-modal-close" style="
                position: absolute;
                top: 12px;
                right: 12px;
                background: rgba(0, 0, 0, 0.1);
                border: none;
                color: #333;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                cursor: pointer;
                z-index: 1;
              ">×</button>
              
              <div class="twitter-modal-header" style="
                padding: 16px 20px;
                border-bottom: 1px solid #eee;
                display: flex;
                align-items: center;
                gap: 12px;
              ">
                <svg class="twitter-logo" fill="#1DA1F2" viewBox="0 0 24 24" style="width: 22px; height: 22px;">
                  <path d="M22.46 6c-.77.35-1.6.58-2.46.67.9-.53 1.59-1.37 1.92-2.38-.84.5-1.78.86-2.79 1.07C18.27 4.49 17.01 4 15.63 4c-2.38 0-4.31 1.94-4.31 4.31 0 .34.04.67.11.99C7.83 9.09 4.16 7.19 1.69 4.23-.07 6.29.63 8.43 2.49 9.58c-.71-.02-1.38-.22-1.97-.54v.05c0 2.09 1.49 3.83 3.45 4.23-.36.1-.74.15-1.14.15-.28 0-.55-.03-.81-.08.55 1.71 2.14 2.96 4.03 3-1.48 1.16-3.35 1.85-5.37 1.85-.35 0-.69-.02-1.03-.06 1.92 1.23 4.2 1.95 6.67 1.95 8.01 0 12.38-6.63 12.38-12.38 0-.19 0-.38-.01-.56.85-.61 1.58-1.37 2.16-2.24z"/>
                </svg>
                <h2 style="font-size: 18px; margin: 0; font-weight: 600; color: #333;">Share to X</h2>
              </div>
              
              <div class="twitter-modal-content" style="
                display: flex;
                flex-direction: column;
                gap: 16px;
                padding: 16px 20px;
                overflow-y: auto;
                max-height: calc(85vh - 140px);
              ">
                <div class="twitter-message-container" style="position: relative;">
                  <textarea class="twitter-message" style="
                    width: 100%;
                    min-height: 120px;
                    padding: 12px;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    font-size: 16px;
                    resize: vertical;
                    font-family: inherit;
                    box-sizing: border-box;
                    color: #000000;
                  " placeholder="What would you like to say about this photo?" maxlength="280">${safeTwitterMessage}</textarea>
                  <div class="twitter-char-counter" style="
                    position: absolute;
                    bottom: 8px;
                    right: 12px;
                    font-size: 12px;
                    color: #666;
                  "><span id="char-count">${safeTwitterMessage.length}</span>/280</div>
                </div>
                
                <div class="twitter-image-preview" style="
                  padding: 12px;
                  background: #f8f8f8;
                  margin-top: 12px;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  min-height: 150px;
                  border-radius: 12px;
                  overflow: hidden;
                  position: relative;
                ">
                  <img src="${imageUrl}" alt="Preview" style="
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    object-fit: contain;
                    max-height: 40vh;
                    max-width: 100%;
                  " />
                </div>
              </div>
              
              <div class="twitter-modal-footer" style="
                padding: 16px 20px;
                border-top: 1px solid #eee;
                display: flex;
                justify-content: flex-end;
              ">
                <button class="twitter-share-btn" style="
                  background-color: #1DA1F2;
                  color: white;
                  border: none;
                  border-radius: 50px;
                  padding: 10px 24px;
                  font-size: 16px;
                  font-weight: 500;
                  cursor: pointer;
                  display: flex;
                  align-items: center;
                  gap: 8px;
                ">
                  <svg class="twitter-icon" fill="white" viewBox="0 0 24 24" style="width: 18px; height: 18px;">
                    <path d="M22.46 6c-.77.35-1.6.58-2.46.67.9-.53 1.59-1.37 1.92-2.38-.84.5-1.78.86-2.79 1.07C18.27 4.49 17.01 4 15.63 4c-2.38 0-4.31 1.94-4.31 4.31 0 .34.04.67.11.99C7.83 9.09 4.16 7.19 1.69 4.23-.07 6.29.63 8.43 2.49 9.58c-.71-.02-1.38-.22-1.97-.54v.05c0 2.09 1.49 3.83 3.45 4.23-.36.1-.74.15-1.14.15-.28 0-.55-.03-.81-.08.55 1.71 2.14 2.96 4.03 3-1.48 1.16-3.35 1.85-5.37 1.85-.35 0-.69-.02-1.03-.06 1.92 1.23 4.2 1.95 6.67 1.95 8.01 0 12.38-6.63 12.38-12.38 0-.19 0-.38-.01-.56.85-.61 1.58-1.37 2.16-2.24z"/>
                  </svg>
                  Post
                </button>
              </div>
            \`;
            
            // Add CSS animations
            const style = document.createElement('style');
            style.textContent = \`
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes slideIn {
                from { transform: translateY(20px); opacity: 0.8; }
                to { transform: translateY(0); opacity: 1; }
              }
            \`;
            document.head.appendChild(style);
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // Get elements
            const closeBtn = modal.querySelector('.twitter-modal-close');
            const shareBtn = modal.querySelector('.twitter-share-btn');
            const textarea = modal.querySelector('.twitter-message');
            const charCount = modal.querySelector('#char-count');
            
            // Close modal function
            const closeModal = () => {
              document.body.removeChild(overlay);
              document.head.removeChild(style);
            };
            
            // Event listeners
            closeBtn.addEventListener('click', closeModal);
            overlay.addEventListener('click', (e) => {
              if (e.target === overlay) closeModal();
            });
            
            // Character counter
            textarea.addEventListener('input', () => {
              charCount.textContent = textarea.value.length;
            });
            
            // Share button
            shareBtn.addEventListener('click', async () => {
              if (isSharing) return;
              
              isSharing = true;
              shareBtn.disabled = true;
              shareBtn.innerHTML = \`
                <span style="display: flex; align-items: center; gap: 8px;">
                  <span style="display: flex; gap: 4px;">
                    <span style="width: 6px; height: 6px; background: white; border-radius: 50%; animation: dotFade 1.4s infinite ease-in-out both; animation-delay: -0.32s;"></span>
                    <span style="width: 6px; height: 6px; background: white; border-radius: 50%; animation: dotFade 1.4s infinite ease-in-out both; animation-delay: -0.16s;"></span>
                    <span style="width: 6px; height: 6px; background: white; border-radius: 50%; animation: dotFade 1.4s infinite ease-in-out both;"></span>
                  </span>
                  <span>Sharing...</span>
                </span>
              \`;
              
              // Add dot animation
              const dotStyle = document.createElement('style');
              dotStyle.textContent = \`
                @keyframes dotFade {
                  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
                  40% { opacity: 1; transform: scale(1); }
                }
              \`;
              document.head.appendChild(dotStyle);
              
              try {
                // Pre-open popup synchronously to avoid Safari popup blocking
                let popup = null;
                try {
                  const width = 600;
                  const height = 700;
                  const left = window.innerWidth / 2 - width / 2 + window.screenX;
                  const top = window.innerHeight / 2 - height / 2 + window.screenY;
                  popup = window.open('', 'twitter-auth', \`width=\${width},height=\${height},left=\${left},top=\${top},location=yes,resizable=yes,scrollbars=yes\`);
                } catch (e) {
                  popup = null;
                }
                // Lightweight waiting UI in the pre-opened popup (if accessible)
                if (popup) {
                  try {
                    popup.document.write(\`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Preparing share…</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f8f9fa;color:#333}.card{background:#fff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);padding:1.2rem;text-align:center;max-width:90%;width:380px}.spinner{width:24px;height:24px;border:3px solid #e5e7eb;border-top-color:#1DA1F2;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 10px}@keyframes spin{to{transform:rotate(360deg)}}</style></head><body><div class="card"><div class="spinner"></div><div>Preparing your image and opening X…</div></div></body></html>\`);
                    popup.document.close();
                  } catch (e) { /* ignore */ }
                }
                
                const apiBaseUrl = window.location.hostname.includes('localhost')
                  ? 'http://localhost:3001'
                  : 'https://photobooth-api.sogni.ai';
                
                const response = await fetch(apiBaseUrl + '/api/auth/x/start', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({
                    imageUrl: "${imageUrl}",
                    message: textarea.value,
                    shareUrl: 'https://photobooth.sogni.ai'
                  }),
                });
                
                if (!response.ok) {
                  throw new Error('Failed to share');
                }
                
                const responseData = await response.json();
                
                if (responseData.success === true && !responseData.authUrl) {
                  // Direct share success - close popup and only show inline success
                  try { if (popup && !popup.closed) popup.close(); } catch (e0) {}
                  showMessage('Successfully shared to Twitter! 🎉', 'success');
                  closeModal();
                } else if (responseData.authUrl) {
                  // Need to authenticate - navigate pre-opened popup or fallback
                  if (popup) {
                    try {
                      popup.location.href = responseData.authUrl;
                    } catch (e) {
                      try { if (popup && !popup.closed) popup.close(); } catch (e01) {}
                      window.location.href = responseData.authUrl;
                      return;
                    }
                  } else {
                    // Popup blocked or failed - navigate current window as fallback
                    try { if (popup && !popup.closed) popup.close(); } catch (e02) {}
                    window.location.href = responseData.authUrl;
                    return;
                  }
                  
                  let authCompleted = false;
                  const messageHandler = (event) => {
                    if (event.data && event.data.type === 'twitter-auth-success') {
                      authCompleted = true;
                      // Stop closed timer if running
                      if (checkClosed) clearInterval(checkClosed);
                      window.removeEventListener('message', messageHandler);
                      try { if (popup && !popup.closed) popup.close(); } catch (e03) {}
                      // Only inline success message; nothing in the popup
                      showMessage('Successfully shared to Twitter! 🎉', 'success');
                      closeModal();
                    } else if (event.data && event.data.type === 'twitter-auth-error') {
                      if (checkClosed) clearInterval(checkClosed);
                      window.removeEventListener('message', messageHandler);
                      try { if (popup && !popup.closed) popup.close(); } catch (e04) {}
                      showMessage(\`Failed to share: \${event.data.message}\`, 'error');
                      closeModal();
                    }
                  };
                  
                  window.addEventListener('message', messageHandler);
                  
                  // Check if popup was closed
                  var checkClosed = setInterval(() => {
                    if (!popup || popup.closed) {
                      clearInterval(checkClosed);
                      window.removeEventListener('message', messageHandler);
                      if (!authCompleted) {
                        showMessage('Twitter authorization was cancelled', 'error');
                        closeModal();
                      }
                    }
                  }, 1000);
                } else {
                  throw new Error('Unexpected response from server');
                }
              } catch (error) {
                console.error('Twitter share error:', error);
                showMessage(\`Failed to share: \${error.message}\`, 'error');
                closeModal();
              } finally {
                isSharing = false;
                document.head.removeChild(dotStyle);
              }
            });
            
            // Focus textarea
            setTimeout(() => {
              textarea.focus();
              textarea.select();
            }, 100);
          }
          
          // Smart save functionality - same logic as main app
          function handleSaveToPhone() {
            const imageUrl = "${imageUrl}";
            const userAgent = navigator.userAgent.toLowerCase();
            const isIOS = /iphone|ipad|ipod/.test(userAgent);
            const isAndroid = /android/.test(userAgent);
            const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
            
            console.log('Save to phone - Device detection:', { isIOS, isAndroid, isSafari });
            
            if (isIOS) {
              // iOS: Use the share API if available, otherwise fallback to download
              if (navigator.share) {
                fetch(imageUrl)
                  .then(response => response.blob())
                  .then(blob => {
                    const file = new File([blob], 'sogni-photobooth-creation.jpg', { type: 'image/jpeg' });
                    return navigator.share({
                      title: 'My Sogni Photobooth Creation',
                      text: 'Check out my AI-generated photo!',
                      files: [file]
                    });
                  })
                  .catch(error => {
                    console.log('Share API failed, using fallback:', error);
                    fallbackSave();
                  });
              } else {
                fallbackSave();
              }
            } else if (isAndroid) {
              // Android: Try share API first, then fallback
              if (navigator.share) {
                fetch(imageUrl)
                  .then(response => response.blob())
                  .then(blob => {
                    const file = new File([blob], 'sogni-photobooth-creation.jpg', { type: 'image/jpeg' });
                    return navigator.share({
                      title: 'My Sogni Photobooth Creation',
                      files: [file]
                    });
                  })
                  .catch(error => {
                    console.log('Share API failed, using fallback:', error);
                    fallbackSave();
                  });
              } else {
                fallbackSave();
              }
            } else {
              // Desktop or other devices: direct download
              fallbackSave();
            }
          }
          // Expose handler globally for inline onclick
          window.handleSaveToPhone = handleSaveToPhone;
          
          function fallbackSave() {
            // Create a temporary link and trigger download
            const link = document.createElement('a');
            link.href = "${imageUrl}";
            link.download = 'sogni-photobooth-creation.jpg';
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
          
          // Show promotional popup
          function showPromoPopup() {
            // Create modal overlay
            const overlay = document.createElement('div');
            overlay.className = 'promo-modal-overlay';
            
            // Create modal
            const modal = document.createElement('div');
            modal.className = 'promo-modal';
            
            modal.innerHTML = \`
              <button class="promo-modal-close">×</button>
              
              <div class="promo-modal-header">
                <div class="promo-mascot">
                  <img 
                    src="/sloth_cam_hop_trnsparent.png" 
                    alt="Sogni Sloth Camera" 
                    class="sloth-mascot"
                  />
                </div>
                <h2>Enjoying Photobooth?</h2>
              </div>
              
              <div class="promo-modal-content">
                <div class="promo-message">
                  <h3>Unlock the Full Power of Sogni!</h3>
                  <p>
                    Take your creativity to the next level with our complete AI art platform.
                    Get <strong>100 FREE render credits</strong> now.
                  </p>            
                </div>
              </div>
              
              <div class="promo-modal-footer">
                <button class="promo-signup-btn">
                  <span class="signup-text">Get 100 Free Credits</span>
                  <span class="signup-arrow">→</span>
                </button>
                
                <button class="promo-maybe-later">
                  Maybe Later
                </button>
              </div>
            \`;
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // Get elements
            const closeBtn = modal.querySelector('.promo-modal-close');
            const signupBtn = modal.querySelector('.promo-signup-btn');
            const maybeLaterBtn = modal.querySelector('.promo-maybe-later');
            
            // Close modal function
            const closeModal = () => {
              document.body.removeChild(overlay);
            };
            
            // Event listeners
            closeBtn.addEventListener('click', closeModal);
            maybeLaterBtn.addEventListener('click', closeModal);
            overlay.addEventListener('click', (e) => {
              if (e.target === overlay) closeModal();
            });
            
            // Handle escape key
            const handleEscape = (e) => {
              if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEscape);
              }
            };
            document.addEventListener('keydown', handleEscape);
            
            // Signup button
            signupBtn.addEventListener('click', () => {
              window.open('https://app.sogni.ai/create?code=PHOTOBOOTH', '_blank');
              closeModal();
            });
          }
          
          // Expose handler globally for inline onclick
          window.showPromoPopup = showPromoPopup;

          // Auto-focus on Twitter button for better UX
          document.addEventListener('DOMContentLoaded', function() {
            const twitterBtn = document.querySelector('.btn-twitter');
            if (twitterBtn) {
              twitterBtn.focus();
            }
          });
        </script>
      </body>
      </html>
    `;
}


