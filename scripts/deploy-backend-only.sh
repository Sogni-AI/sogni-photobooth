#!/bin/bash

# Backend-only deployment script
# Use this when you only need to update backend code and nginx config

set -e

REMOTE_HOST="sogni-staging"
REMOTE_BACKEND_PATH="/var/www/photobooth.sogni.ai-server"

echo "🚀 Deploying Backend + Nginx Config..."

# Deploy backend
echo "📦 Deploying backend files..."
rsync -ar --progress server/ $REMOTE_HOST:$REMOTE_BACKEND_PATH/ --exclude node_modules
echo "✅ Backend files deployed"

# Deploy nginx configuration
echo "🔧 Deploying nginx configuration..."
rsync -ar --progress scripts/nginx/production.conf $REMOTE_HOST:/tmp/sogni-photobooth-nginx.conf

# Update on server
ssh $REMOTE_HOST << 'EOF'
  set -e
  
  # Install backend dependencies
  cd /var/www/photobooth.sogni.ai-server
  echo "📦 Installing backend dependencies..."
  npm install --omit=dev --no-fund --no-audit --prefer-offline --loglevel=error
  
  # Restart backend
  echo "🔄 Restarting backend..."
  pm2 restart sogni-photobooth-production
  
  # Update nginx
  echo "🔧 Updating nginx configuration..."
  sudo cp /tmp/sogni-photobooth-nginx.conf /etc/nginx/conf.d/photobooth.sogni.ai.conf
  sudo nginx -t && sudo systemctl reload nginx
  
  echo "✅ Backend and nginx deployed successfully!"
EOF

echo ""
echo "✅ Deployment complete!"
echo "🎃 Test contest at: https://photobooth.sogni.ai/halloween"
echo "🛡️ Moderate entries at: https://photobooth.sogni.ai/admin/moderate"

