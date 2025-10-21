# CORS Fix Instructions for Twitter Share

## Problem
The Twitter share functionality is failing with CORS errors:
```
Access to fetch at 'https://photobooth-api.sogni.ai/api/auth/x/start' from origin 'https://photobooth.sogni.ai' 
has been blocked by CORS policy: Response to preflight request doesn't pass access control check: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## Root Cause
The Nginx configuration on the production server wasn't properly handling CORS preflight OPTIONS requests for all endpoints. While it had CORS headers configured globally, it wasn't responding to preflight requests before they reached the Node.js backend.

## Solution
Two changes were made:

### 1. Node.js Backend (Already Applied)
Added CORS middleware to `server/index.js`:
- Allows requests from all `*.sogni.ai` subdomains
- Enables credentials support for cookies
- Handles all necessary HTTP methods

### 2. Nginx Configuration (Needs Deployment)
Updated `scripts/nginx/production.conf` to:
- Handle OPTIONS preflight requests directly in Nginx
- Add `Cookie` and `Authorization` to allowed headers
- Add `Set-Cookie` to exposed headers

## Deployment Steps

### Option A: Using the Automated Script (Recommended)

1. **SSH into the production server:**
   ```bash
   ssh your-user@your-production-server
   ```

2. **Navigate to the project directory:**
   ```bash
   cd /path/to/sogni-photobooth
   ```

3. **Pull the latest changes:**
   ```bash
   git pull origin main
   ```

4. **Run the update script:**
   ```bash
   ./scripts/update-nginx-cors.sh
   ```

### Option B: Manual Deployment

1. **SSH into the production server:**
   ```bash
   ssh your-user@your-production-server
   ```

2. **Backup the current Nginx config:**
   ```bash
   sudo cp /etc/nginx/sites-available/photobooth-api.sogni.ai \
          /etc/nginx/sites-available/photobooth-api.sogni.ai.backup.$(date +%Y%m%d_%H%M%S)
   ```

3. **Copy the updated config:**
   ```bash
   sudo cp /path/to/sogni-photobooth/scripts/nginx/production.conf \
          /etc/nginx/sites-available/photobooth-api.sogni.ai
   ```

4. **Test the configuration:**
   ```bash
   sudo nginx -t
   ```

5. **If test passes, reload Nginx:**
   ```bash
   sudo systemctl reload nginx
   ```

### Option C: Restart Backend Server (Alternative)

If you don't have access to update Nginx configuration, you can rely on the Node.js CORS middleware:

1. **SSH into the production server**

2. **Restart the Node.js backend:**
   ```bash
   pm2 restart photobooth-api
   # or
   sudo systemctl restart photobooth-api
   ```

However, this is **not recommended** because Nginx will still be adding its own CORS headers, potentially causing conflicts.

## Verification

After deployment, test the Twitter share functionality:

1. Go to https://photobooth.sogni.ai
2. Take a photo or upload one
3. Click the Twitter/X share button
4. Verify that the share popup opens successfully

If you see the authorization popup, CORS is working correctly!

## What Changed

### Key Changes to Nginx Config:

**Before:**
```nginx
location / {
    proxy_pass http://localhost:3001;
    # ... proxy settings
}
```

**After:**
```nginx
location / {
    # Handle preflight OPTIONS requests
    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' 'https://photobooth.sogni.ai' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE, PATCH' always;
        add_header 'Access-Control-Allow-Headers' '...,Cookie,Authorization' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
        return 204;
    }
    
    proxy_pass http://localhost:3001;
    # ... proxy settings
}
```

Also added `Cookie` and `Authorization` to the global CORS allowed headers.

## Troubleshooting

If CORS errors persist:

1. **Check Nginx is running the new config:**
   ```bash
   sudo nginx -t
   sudo systemctl status nginx
   ```

2. **Check the Nginx error log:**
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```

3. **Verify the config file is in the right location:**
   ```bash
   ls -la /etc/nginx/sites-available/photobooth-api.sogni.ai
   ```

4. **Clear browser cache** and try again

5. **Check browser console** for the exact error message

## Notes

- The Nginx config change is **required** for production
- The Node.js backend changes are a fallback and work for local development
- Both layers (Nginx + Node.js) now support CORS properly
- Cookies will work across the photobooth.sogni.ai → photobooth-api.sogni.ai boundary

