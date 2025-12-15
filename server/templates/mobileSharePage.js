// Template renderer for the mobile share page
// Keep behavior identical to the in-route string it replaces

import { TWITTER_SHARE_CONFIG } from '../constants.js';

export function renderMobileSharePage({ imageUrl, videoUrl, isVideo, twitterMessage }) {
  const defaultMessage = TWITTER_SHARE_CONFIG.DEFAULT_MESSAGE;
  const safeTwitterMessage = twitterMessage || defaultMessage;
  const mediaUrl = videoUrl || imageUrl;
  const mediaType = isVideo ? 'video' : 'photo';
  const mediaDescription = isVideo ? 'AI-generated video' : 'AI-generated photo';

  return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Share Your ${isVideo ? 'Video' : 'Photo'} - Sogni Photobooth</title>
        <meta property="og:title" content="My Sogni Photobooth Creation">
        <meta property="og:description" content="Check out my ${mediaDescription} from Sogni Photobooth!">
        <meta property="og:image" content="${imageUrl}">
        ${isVideo ? `<meta property="og:video" content="${videoUrl}">` : ''}
        <meta property="og:type" content="${isVideo ? 'video.other' : 'website'}">
        <meta name="twitter:card" content="${isVideo ? 'player' : 'summary_large_image'}">
        <meta name="twitter:title" content="My Sogni Photobooth Creation">
        <meta name="twitter:description" content="Check out my ${mediaDescription} from Sogni Photobooth!">
        <meta name="twitter:image" content="${imageUrl}">
        ${isVideo ? `<meta name="twitter:player" content="${videoUrl}">` : ''}
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
          
          /* Video pages have normal padding */
          .container.video-page {
            padding: 10px 10px 60px 10px;
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
          
          /* For video pages, slightly wider content area */
          .content.video-page {
            max-width: 500px;
            padding: 0 10px;
          }
          
          .photo-container {
            margin-bottom: 15px;
            width: 100%;
            display: flex;
            justify-content: center;
          }
          
          /* Video container - centered with constrained size */
          .video-container {
            width: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            margin-bottom: 15px;
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
          
          .video {
            width: 100%;
            max-width: 100%;
            height: auto;
            max-height: 60vh;
            display: block;
            object-fit: contain;
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
          
          .btn-save-share {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            font-size: 16px;
            padding: 14px 24px;
          }
          
          .btn-save-share:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
          }
          
          .btn-save-share:active {
            transform: translateY(0);
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
        <div class="container${isVideo ? ' video-page' : ''}">
          <div class="header">
            <h1>${isVideo ? '🎥' : '📸'} Your Sogni Creation</h1>
            <p>Share your AI-generated masterpiece!</p>
          </div>
          
          <div class="content${isVideo ? ' video-page' : ''}">
            ${isVideo ? `
            <div class="video-container">
              <video 
                src="${videoUrl}" 
                class="video" 
                autoplay 
                loop 
                muted 
                playsinline
                poster="${imageUrl}"
              ></video>
            </div>
            ` : `
            <div class="photo-container">
              <img src="${imageUrl}" alt="Your Sogni Photobooth creation" class="photo" />
            </div>
            `}
            
            <div id="messages"></div>
            
            <div class="actions">
              <button onclick="window.handleSaveToPhone()" class="btn btn-save-share" id="saveBtn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
                </svg>
                Save & Share
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
          
          // Smart save functionality - uses native OS share dialog which works with all platforms including Twitter
          function handleSaveToPhone() {
            const mediaUrl = "${isVideo ? videoUrl : imageUrl}";
            const isVideoMedia = ${isVideo ? 'true' : 'false'};
            const fileExtension = isVideoMedia ? 'mp4' : 'jpg';
            const mimeType = isVideoMedia ? 'video/mp4' : 'image/jpeg';
            const fileName = \`sogni-photobooth-creation.\${fileExtension}\`;
            
            const userAgent = navigator.userAgent.toLowerCase();
            const isIOS = /iphone|ipad|ipod/.test(userAgent);
            const isAndroid = /android/.test(userAgent);
            const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
            
            console.log('Save to phone - Device detection:', { isIOS, isAndroid, isSafari, isVideo: isVideoMedia });
            
            if (isIOS) {
              // iOS: Use the share API if available, otherwise fallback to download
              if (navigator.share) {
                fetch(mediaUrl)
                  .then(response => response.blob())
                  .then(blob => {
                    const file = new File([blob], fileName, { type: mimeType });
                    return navigator.share({
                      title: 'My Sogni Photobooth Creation',
                      text: \`Check out my AI-generated \${isVideoMedia ? 'video' : 'photo'}!\`,
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
                fetch(mediaUrl)
                  .then(response => response.blob())
                  .then(blob => {
                    const file = new File([blob], fileName, { type: mimeType });
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
            const mediaUrl = "${isVideo ? videoUrl : imageUrl}";
            const isVideoMedia = ${isVideo ? 'true' : 'false'};
            const fileExtension = isVideoMedia ? 'mp4' : 'jpg';
            
            // Create a temporary link and trigger download
            const link = document.createElement('a');
            link.href = mediaUrl;
            link.download = \`sogni-photobooth-creation.\${fileExtension}\`;
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


