# PWA Icon Deployment Issue - Android "Add to Home Screen" Fix

## Issue
The Android "Add to Home Screen" functionality is not working on https://photobooth.sogni.ai/ because the PWA icon files return 404 errors on the production server.

## Root Cause
The icon files exist in the repository (`public/icons/`) and are correctly built into `dist/icons/`, but they haven't been deployed to the production server.

## Current Status

### ✅ What's Working:
1. **HTML Configuration** - All PWA meta tags are properly set in `index.html`:
   - Manifest link: `<link rel="manifest" href="/manifest.json?v=1.0.20" />`
   - Viewport meta tag: Present
   - Theme-color meta tag: Present
   - Apple touch icons: All configured

2. **Manifest.json** - Correctly structured with all required fields at `/public/manifest.json`

3. **Service Worker** - Registered and functional at `/sw.js`

4. **Icon Files** - All icon sizes (72x72 to 512x512) exist in:
   - Source: `/public/icons/`
   - Build output: `/dist/icons/` (after running `npm run build`)

### ❌ What's Not Working:
- Icons return 404 on production:
  - https://photobooth.sogni.ai/icons/icon-192x192.png → 404
  - https://photobooth.sogni.ai/icons/icon-512x512.png → 404
  - All other icon sizes also return 404

## Solution
Simply deploy the current build to production using the existing deployment script:

```bash
npm run deploy:production
# or
bash scripts/deploy-production.sh
```

This will:
1. Build the project (including copying icons from `public/` to `dist/`)
2. Deploy the `dist/` folder to the production server
3. Make the icons accessible at their expected URLs
4. Enable Android "Add to Home Screen" functionality

## Testing
After deployment, verify on an Android device:
1. Visit https://photobooth.sogni.ai/ in Chrome
2. Wait 30 seconds (engagement requirement)
3. Tap the three-dot menu
4. "Install app" or "Add to Home screen" option should appear

## Technical Details
- Icons are served from `/icons/` path (not `/public/icons/`)
- The build process (Vite) correctly copies all files from `public/` to `dist/`
- The deployment script uses rsync to transfer `dist/` to the server

## No Code Changes Required
This is purely a deployment issue. All necessary files and configurations are already in place in the repository.