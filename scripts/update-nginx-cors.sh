#!/bin/bash

# Update Nginx CORS Configuration for Production
# This script copies the updated nginx config and reloads nginx

set -e

echo "🔧 Updating Nginx configuration for CORS support..."

# Check if we're on the production server
if [ ! -f "/etc/nginx/sites-available/photobooth-api.sogni.ai" ]; then
    echo "❌ Error: This doesn't appear to be the production server"
    echo "Please run this script on the production server where Nginx is installed"
    exit 1
fi

# Backup existing config
echo "📦 Backing up existing Nginx config..."
sudo cp /etc/nginx/sites-available/photobooth-api.sogni.ai /etc/nginx/sites-available/photobooth-api.sogni.ai.backup.$(date +%Y%m%d_%H%M%S)

# Copy the new config
echo "📝 Copying updated config..."
sudo cp scripts/nginx/production.conf /etc/nginx/sites-available/photobooth-api.sogni.ai

# Test the configuration
echo "🧪 Testing Nginx configuration..."
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "✅ Configuration test passed!"
    
    # Reload Nginx
    echo "🔄 Reloading Nginx..."
    sudo systemctl reload nginx
    
    echo "✅ Nginx configuration updated and reloaded successfully!"
    echo ""
    echo "CORS should now work properly for:"
    echo "  - https://photobooth.sogni.ai → https://photobooth-api.sogni.ai"
    echo ""
    echo "Test the Twitter share functionality to verify it's working."
else
    echo "❌ Configuration test failed!"
    echo "Restoring previous configuration..."
    sudo cp /etc/nginx/sites-available/photobooth-api.sogni.ai.backup.$(date +%Y%m%d_%H%M%S) /etc/nginx/sites-available/photobooth-api.sogni.ai
    exit 1
fi

