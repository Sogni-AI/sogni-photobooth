#!/bin/bash

# Quick CORS Fix Deployment Script
# This script commits the changes and provides instructions for production deployment

set -e

echo "🚀 Deploying CORS Fix for Twitter Share..."
echo ""

# Stage all changes
git add -A

# Commit the changes
echo "📝 Committing changes..."
git commit -m "Fix CORS for Twitter share + Add Halloween contest tracking

- Added CORS middleware to Node.js backend
- Updated Nginx config to handle OPTIONS preflight requests
- Added Cookie and Authorization to CORS allowed headers
- Created contest submission system for Halloween event
- Added contest results admin page at /admin/contest/results
- Fixed redisClient export issue

Changes needed on production:
1. Pull latest code
2. Restart backend server
3. Update Nginx config: sudo cp scripts/nginx/production.conf /etc/nginx/sites-available/photobooth-api.sogni.ai
4. Test and reload Nginx: sudo nginx -t && sudo systemctl reload nginx
" || echo "No changes to commit or already committed"

# Push to main
echo "⬆️  Pushing to main branch..."
git push origin main

echo ""
echo "✅ Code pushed to GitHub!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 NEXT STEPS - Run these commands on your production server:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "# 1. SSH into production server"
echo "ssh your-user@your-production-server"
echo ""
echo "# 2. Navigate to project and pull latest code"
echo "cd /path/to/sogni-photobooth"
echo "git pull origin main"
echo ""
echo "# 3. Restart the backend server"
echo "pm2 restart photobooth-api"
echo "# OR if using systemd:"
echo "sudo systemctl restart photobooth-api"
echo ""
echo "# 4. Update Nginx configuration"
echo "sudo cp scripts/nginx/production.conf /etc/nginx/sites-available/photobooth-api.sogni.ai"
echo ""
echo "# 5. Test and reload Nginx"
echo "sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎃 After deployment, test at: https://photobooth.sogni.ai/halloween"
echo "📊 View contest entries at: https://photobooth.sogni.ai/admin/contest/results"
echo ""

