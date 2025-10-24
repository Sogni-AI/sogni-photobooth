# Sogni Vibe Explorer - Production Build

## Overview
This directory contains the production-ready build of the Sogni Vibe Explorer browser extension, configured for Chrome Web Store submission.

## Files Included
- `manifest.json` - Extension manifest (v1.1.0)
- `background.js` - Service worker script
- `content.js` - Content script for webpage interaction
- `content.css` - Styles for content script
- `api-service.js` - API communication service
- `popup.html` - Extension popup interface
- `popup.js` - Popup functionality
- `popup.css` - Popup styles
- `progress-overlay.js` - Progress tracking overlay
- `icons/` - Extension icons (16, 32, 48, 128px)

## Production Configuration
- ✅ All endpoints configured for production (`https://photobooth-api.sogni.ai`)
- ✅ Development mode disabled
- ✅ Version bumped to 1.1.0
- ✅ Permissions cleaned up (removed localhost)
- ✅ Unnecessary files removed

## Submission Package
The extension is packaged as `sogni-style-explorer-v1.1.0.zip` and ready for Chrome Web Store submission.

## Next Steps
1. Review `CHROME_STORE_SUBMISSION_GUIDE.md` for detailed submission instructions
2. Take required screenshots for store listing
3. Create and host privacy policy
4. Register Chrome Web Store developer account
5. Submit extension for review

## Testing
To test this production build locally:
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory
4. Test the extension on various websites

## Support
For questions about the extension or submission process, refer to the documentation in this directory or contact the development team.
