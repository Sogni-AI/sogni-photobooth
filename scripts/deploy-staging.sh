#!/bin/bash

# Comprehensive staging deployment script for Sogni Photobooth
# This script handles building, deploying, and starting both frontend and backend
#
# Environment file priority:
# 1. server/.env.staging - Used for backend deployment (highest priority)
# 2. .env.staging - Used for environment variables during build (including Google Analytics)

set -e # Exit immediately if a command exits with a non-zero status

echo "🚀 Starting Sogni Photobooth Staging Deployment"
echo "=================================================="

# Configuration
REMOTE_HOST="sogni-staging"
REMOTE_FRONTEND_PATH="/var/www/photobooth-staging.sogni.ai/dist"
REMOTE_BACKEND_PATH="/var/www/photobooth-staging.sogni.ai/backend"
LOG_FILE="staging-deployment.log"

# Check for frontend .env.staging file. If not found, create one from template.
if [ ! -f .env.staging ]; then
  echo "⚠️ No .env.staging file found for frontend"
else
  echo "📄 Found .env.staging for frontend. Loading environment variables..."
  export $(grep -v '^#' .env.staging | xargs)
fi

# Check for server/.env.staging file
if [ ! -f server/.env.staging ]; then
  echo "❌ No server/.env.staging file found! Cannot deploy to staging without backend configuration."
  echo "Please create a server/.env.staging file with the necessary credentials."
  exit 1
else
  echo "📄 Found server/.env.staging file for backend deployment."
fi

# Start logging
exec > >(tee -a $LOG_FILE) 2>&1
echo "Deployment started at $(date)"

# Function to display progress
function show_step() {
  echo ""
  echo "📋 $1"
  echo "------------------------------------------------"
}

# Build frontend with staging configuration
show_step "Building frontend application for staging"
npm run build:staging
if [ $? -ne 0 ]; then
  echo "❌ Frontend build failed! Exiting."
  exit 1
fi
echo "✅ Frontend built successfully"

# Step 2: Create necessary directories on the server
show_step "Creating directories on the staging server"
ssh $REMOTE_HOST "sudo mkdir -p /var/www/photobooth-staging.sogni.ai/dist /var/www/photobooth-staging.sogni.ai/backend && sudo chown -R \$USER:\$USER /var/www/photobooth-staging.sogni.ai"

if [ $? -ne 0 ]; then
  echo "❌ Failed to create directories on the server! Check SSH connection and permissions."
  exit 1
fi

echo "✅ Directories created successfully"

# Deploy frontend
show_step "Deploying frontend to $REMOTE_HOST:$REMOTE_FRONTEND_PATH"
rsync -ar --progress --update --checksum dist/ $REMOTE_HOST:$REMOTE_FRONTEND_PATH/
if [ $? -ne 0 ]; then
  echo "❌ Frontend deployment failed! Exiting."
  exit 1
fi

# Note: Gallery images are now served from Cloudflare R2, no need to sync them
# CDN URL is configured in src/config/urls.ts (assetUrl property)

# Fix file and directory permissions to ensure nginx can serve files
show_step "Setting correct file and directory permissions"
ssh $REMOTE_HOST "sudo chmod 755 ${REMOTE_FRONTEND_PATH} && sudo find ${REMOTE_FRONTEND_PATH} -type d -exec chmod 755 {} \; && sudo find ${REMOTE_FRONTEND_PATH} -type f -exec chmod 644 {} \;"
if [ $? -ne 0 ]; then
  echo "⚠️ Warning: Could not set file permissions properly"
else
  echo "✅ File and directory permissions set correctly (directories: 755, files: 644)"
fi

echo "✅ Frontend deployed successfully"

# Deploy backend
show_step "Deploying backend to $REMOTE_HOST:$REMOTE_BACKEND_PATH"
rsync -ar --progress server/ $REMOTE_HOST:$REMOTE_BACKEND_PATH/ --exclude node_modules
if [ $? -ne 0 ]; then
  echo "❌ Backend deployment failed! Exiting."
  exit 1
fi
echo "✅ Backend files deployed successfully"

# Copy server/.env.staging to server if it exists
if [ -f server/.env.staging ]; then
  show_step "Copying server/.env.staging to server"
  rsync -ar --progress server/.env.staging $REMOTE_HOST:/tmp/env.staging
  echo "✅ server/.env.staging copied to server"
else
  echo "ℹ️ No server/.env.staging found, will create .env from variables"
fi

# Deploy the environment file from local .env.production
show_step "Deploying environment file from local .env.staging"
rsync -ar --progress .env.staging $REMOTE_HOST:$REMOTE_FRONTEND_PATH/.env
if [ $? -ne 0 ]; then
  echo "❌ Staging environment file (.env.staging) deployment failed! Exiting."
  exit 1
fi
echo "✅ Staging environment file (.env.staging) deployed successfully to $REMOTE_FRONTEND_PATH/.env"

# Deploy nginx configuration
show_step "Deploying nginx configuration"
rsync -ar --progress scripts/nginx/staging.conf $REMOTE_HOST:/tmp/sogni-photobooth-staging.conf
if [ $? -ne 0 ]; then
  echo "❌ Nginx configuration deployment failed! Exiting."
  exit 1
fi
echo "✅ Nginx configuration deployed to temp location"

# Setup and start services on remote server
show_step "Setting up and starting services on remote server"
ssh $REMOTE_HOST << EOF
  cd ${REMOTE_BACKEND_PATH}
  echo "📦 Installing backend dependencies..."
  npm install --production
  
  # Setup environment variables
  echo "🔧 Setting up environment variables..."
  
  # Check if server/.env.staging exists locally and copy it to the server
  if [ -f /tmp/env.staging ]; then
    echo "📄 Using server/.env.staging file"
    cp /tmp/env.staging .env
  else
    echo "⚠️ No staging environment file found. Backend may not function correctly."
    exit 1
  fi

  # Ensure permissions are correct
  chmod 600 .env
  
  # Install PM2 if not already installed
  if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2 process manager..."
    npm install -g pm2
  fi
  
  # Start or restart the backend using PM2
  echo "🔧 Starting backend service with PM2..."
  pm2 delete sogni-photobooth-staging 2>/dev/null || true
  PORT=3002 pm2 start index.js --name sogni-photobooth-staging
  pm2 save
  
  # Setup PM2 to start on system boot
  echo "🔧 Configuring PM2 to start on system boot..."
  pm2 startup | tail -1 | bash || echo "PM2 startup command failed, may need manual configuration"
  
  # Check service status
  echo "📊 Backend service status:"
  pm2 status sogni-photobooth-staging
  
  # Configure nginx
  echo "🔍 Setting up nginx configuration..."
  sudo mkdir -p /etc/nginx/conf.d/
  sudo cp /tmp/sogni-photobooth-staging.conf /etc/nginx/conf.d/photobooth-staging.sogni.ai.conf
  
  # Test and reload nginx if available
  if command -v nginx &> /dev/null; then
    sudo nginx -t
    if [ $? -eq 0 ]; then
      if command -v systemctl &> /dev/null; then
        sudo systemctl reload nginx
      else
        sudo service nginx reload || echo "Could not reload nginx service"
      fi
      echo "✅ Nginx configuration is valid and reloaded"
    else
      echo "❌ Nginx configuration test failed!"
    fi
  else
    echo "⚠️ Nginx command not found. Please configure the web server manually."
  fi
EOF

if [ $? -ne 0 ]; then
  echo "❌ Remote setup failed! Please check the logs for details."
  exit 1
fi

# Wait a moment for services to start
echo "Waiting 5 seconds for services to start..."
sleep 5

# Verify deployment
show_step "Verifying deployment"
echo "🔍 Checking backend health via branded domain (https://photobooth-api-staging.sogni.ai)..."
HEALTH_CHECK=$(ssh $REMOTE_HOST "curl -s -o /dev/null -w '%{http_code}' https://photobooth-api-staging.sogni.ai/health" || echo "failed")
if [ "$HEALTH_CHECK" = "200" ]; then
  echo "✅ Backend API is accessible via HTTPS (status code: $HEALTH_CHECK)"
else
  echo "❌ Backend API health check failed with status $HEALTH_CHECK"
  echo "⚠️ Warning: The backend may not be running correctly. Please check logs with: ssh $REMOTE_HOST 'pm2 logs sogni-photobooth-staging'"
fi

echo "🔍 Checking frontend availability (https://photobooth-staging.sogni.ai)..."
FRONTEND_CHECK=$(curl -s -o /dev/null -w "%{http_code}" -I https://photobooth-staging.sogni.ai/ || echo "failed")
if [ "$FRONTEND_CHECK" = "200" ]; then
  echo "✅ Frontend is accessible via HTTPS (status code: $FRONTEND_CHECK)"
else
  echo "❌ Frontend check failed with status $FRONTEND_CHECK"
fi

echo ""
echo "✅ Deployment completed at $(date)"
echo "=================================================="
echo "Your staging application should be available at:"
echo "Frontend: http://photobooth-staging.sogni.ai/"
echo "Backend API: http://photobooth-api-staging.sogni.ai/"
if [ -f server/.env.staging ]; then
  echo "✅ Used server/.env.staging for backend configuration"
else
  echo "⚠️ Created .env from environment variables (server/.env.staging not found)"
fi
echo "Logs saved to: $LOG_FILE" 