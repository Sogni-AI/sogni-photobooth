#!/bin/bash

# Comprehensive production deployment script for Sogni Photobooth
# This script handles building, deploying, and starting both frontend and backend

set -e # Exit immediately if a command exits with a non-zero status

echo "🚀 Starting Sogni Photobooth Production Deployment"
echo "=================================================="

# Configuration
REMOTE_HOST="sogni-staging"
REMOTE_FRONTEND_PATH="/var/www/photobooth.sogni.ai"
REMOTE_BACKEND_PATH="/var/www/photobooth.sogni.ai-server"
LOG_FILE="deployment.log"

# Check for server/.env.production file. This file will be deployed AS IS to production.
if [ ! -f server/.env.production ]; then
  echo "❌ server/.env.production file not found! This file is required for production backend deployment."
  exit 1
else
  echo "📄 Found server/.env.production. This file will be deployed as the production backend .env file."
fi

# Check for frontend .env.production file. If not found, create one from template.
if [ ! -f server/.env.production ]; then
  echo "❌ .env.production file not found! This file is required for production frontend deployment."
  exit 1
else
  echo "📄 Found /.env.production. This file will be deployed as the production frontend .env file."
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

# Build frontend
show_step "Building frontend application"
npm run build
if [ $? -ne 0 ]; then
  echo "❌ Frontend build failed! Exiting."
  exit 1
fi
echo "✅ Frontend built successfully"

# Create necessary directories on the server
show_step "Creating directories on $REMOTE_HOST"
# Construct the base path from REMOTE_FRONTEND_PATH if they share a common parent like /var/www/photobooth.sogni.ai
# Assuming REMOTE_FRONTEND_PATH is /var/www/photobooth.sogni.ai 
# and REMOTE_BACKEND_PATH is /var/www/photobooth.sogni.ai-server
# We need to ensure /var/www exists and is writable, or use sudo mkdir for full paths and chown.

# Using a simpler approach: create each path and chown it to the current user on the remote machine.
# This assumes $USER on the remote machine is the one that should own the files.
ssh $REMOTE_HOST "sudo mkdir -p ${REMOTE_FRONTEND_PATH} && sudo chown -R \$USER:\$USER ${REMOTE_FRONTEND_PATH} && sudo mkdir -p ${REMOTE_BACKEND_PATH} && sudo chown -R \$USER:\$USER ${REMOTE_BACKEND_PATH}"

if [ $? -ne 0 ]; then
  echo "❌ Failed to create directories on $REMOTE_HOST! Check SSH connection and permissions for ${REMOTE_FRONTEND_PATH} and ${REMOTE_BACKEND_PATH}."
  exit 1
fi
echo "✅ Directories created successfully on $REMOTE_HOST"

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

# Deploy nginx configuration
show_step "Deploying nginx configuration"
rsync -ar --progress scripts/nginx/production.conf $REMOTE_HOST:/tmp/sogni-photobooth-nginx.conf
if [ $? -ne 0 ]; then
  echo "❌ Nginx configuration deployment failed! Exiting."
  exit 1
fi
echo "✅ Nginx configuration deployed to temp location"

# Deploy the environment file from local server/.env.production
show_step "Deploying production environment file from local server/.env.production"
rsync -ar --progress server/.env.production $REMOTE_HOST:$REMOTE_BACKEND_PATH/.env
if [ $? -ne 0 ]; then
  echo "❌ Production environment file (server/.env.production) deployment failed! Exiting."
  exit 1
fi
echo "✅ Production environment file (server/.env.production) deployed successfully to $REMOTE_BACKEND_PATH/.env"

# Deploy the environment file from local .env.production
show_step "Deploying production environment file from local .env.production"
rsync -ar --progress .env.production $REMOTE_HOST:$REMOTE_FRONTEND_PATH/.env
if [ $? -ne 0 ]; then
  echo "❌ Production environment file (.env.production) deployment failed! Exiting."
  exit 1
fi
echo "✅ Production environment file (.env.production) deployed successfully to $REMOTE_FRONTEND_PATH/.env"

# Setup and start services on remote server
show_step "Setting up and starting services on remote server"
ssh $REMOTE_HOST /bin/bash --noprofile --norc << 'EOF'
  # Use a clean bash environment without loading any profile files
  # This prevents the problematic .functions file from being sourced
  set -e  # Exit on error

  # Check if port 3001 is already in use and kill the process if needed
  if lsof -i:3001 > /dev/null 2>&1; then
    echo "🔧 Port 3001 is already in use. Stopping existing process..."
    # Get the PID of the process using port 3001
    PID=$(lsof -i:3001 -t)
    if [ ! -z "$PID" ]; then
      echo "Stopping process with PID $PID"
      kill -9 $PID 2>/dev/null || true
      sleep 1
    fi
  fi

  # Install backend dependencies
  cd /var/www/photobooth.sogni.ai-server
  echo "📦 Installing backend dependencies..."
  # Use --no-fund and --no-audit to prevent interactive prompts
  # Use --loglevel=error to reduce output noise
  npm install --omit=dev --no-fund --no-audit --prefer-offline --loglevel=error
  
  if [ $? -ne 0 ]; then
    echo "❌ npm install failed! Check network connectivity and package.json"
    exit 1
  fi
  echo "✅ Backend dependencies installed successfully"
  
  # Ensure correct permissions for environment file
  chmod 600 .env
  
  # Install PM2 if not already installed
  if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2 process manager..."
    npm install -g pm2 --no-fund --no-audit --loglevel=error
    if [ $? -ne 0 ]; then
      echo "❌ PM2 installation failed!"
      exit 1
    fi
    echo "✅ PM2 installed successfully"
  else
    echo "✅ PM2 is already installed"
  fi
  
  # Start or restart the backend using PM2
  echo "🔧 Starting backend service with PM2..."
  pm2 delete sogni-photobooth-production 2>/dev/null || true
  PORT=3001 pm2 start index.js --name sogni-photobooth-production
  pm2 save
  
  # Setup PM2 to start on system boot
  echo "🔧 Configuring PM2 to start on system boot..."
  pm2 startup | tail -1 | bash || echo "PM2 startup command failed, may need manual configuration"
  
  # Check service status
  echo "📊 Backend service status:"
  pm2 status sogni-photobooth-production
  
  # Check that nginx is properly configured
  echo "🔍 Verifying nginx configuration..."
  sudo cp /tmp/sogni-photobooth-nginx.conf /etc/nginx/conf.d/photobooth.sogni.ai.conf
  sudo nginx -t
  if [ $? -eq 0 ]; then
    sudo systemctl reload nginx
    echo "✅ Nginx configuration is valid and reloaded"
  else
    echo "❌ Nginx configuration test failed!"
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
echo "🔍 Checking backend health via branded domain (https://photobooth-api.sogni.ai)..."
HEALTH_CHECK=$(ssh $REMOTE_HOST "curl -s -o /dev/null -w '%{http_code}' https://photobooth-api.sogni.ai/health" || echo "failed")
if [ "$HEALTH_CHECK" = "200" ]; then
  echo "✅ Backend API is accessible via HTTPS (status code: $HEALTH_CHECK)"
else
  echo "❌ Backend API health check failed with status $HEALTH_CHECK"
  echo "⚠️ Warning: The backend may not be running correctly. Please check logs with: ssh $REMOTE_HOST 'pm2 logs sogni-photobooth-production'"
fi

echo "🔍 Checking frontend availability (https://photobooth.sogni.ai)..."
FRONTEND_CHECK=$(curl -s -o /dev/null -w "%{http_code}" -I https://photobooth.sogni.ai/ || echo "failed")
if [ "$FRONTEND_CHECK" = "200" ]; then
  echo "✅ Frontend is accessible via HTTPS (status code: $FRONTEND_CHECK)"
else
  echo "❌ Frontend check failed with status $FRONTEND_CHECK"
fi

echo ""
echo "✅ Deployment completed at $(date)"
echo "=================================================="
echo "Your application should be available at:"
echo "Frontend: https://photobooth.sogni.ai/"
echo "Backend API: https://photobooth-api.sogni.ai/"
echo "Logs saved to: $LOG_FILE" 