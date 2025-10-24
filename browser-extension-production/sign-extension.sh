#!/bin/bash

# Chrome Extension CRX Signing Script
# This script creates a signed .crx file for Chrome Web Store verified uploads

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_DIR="$SCRIPT_DIR"
PRIVATE_KEY="$(cd "$SCRIPT_DIR/../keys" && pwd)/privatekey.pem"
VERSION=$(grep '"version"' "$EXTENSION_DIR/manifest.json" | sed 's/.*"version": *"\([^"]*\)".*/\1/')
OUTPUT_CRX="$SCRIPT_DIR/sogni-style-explorer-v${VERSION}-signed.crx"

echo "🔐 Sogni Vibe Explorer - CRX Signing Script"
echo "============================================="
echo "Extension Directory: $EXTENSION_DIR"
echo "Private Key: $PRIVATE_KEY"
echo "Version: $VERSION"
echo "Output: $OUTPUT_CRX"
echo ""

# Check if private key exists
if [ ! -f "$PRIVATE_KEY" ]; then
    echo "❌ Error: Private key not found at $PRIVATE_KEY"
    echo "Please run the key generation script first:"
    echo "  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out privatekey.pem"
    exit 1
fi

# Check if Chrome is available
CHROME_PATH=""
if command -v google-chrome >/dev/null 2>&1; then
    CHROME_PATH="google-chrome"
elif command -v google-chrome-stable >/dev/null 2>&1; then
    CHROME_PATH="google-chrome-stable"
elif command -v chromium >/dev/null 2>&1; then
    CHROME_PATH="chromium"
elif [ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
else
    echo "❌ Error: Chrome not found. Please install Google Chrome."
    exit 1
fi

echo "🔍 Using Chrome at: $CHROME_PATH"
echo ""

# Remove existing CRX file if it exists
if [ -f "$OUTPUT_CRX" ]; then
    echo "🗑️  Removing existing CRX file..."
    rm "$OUTPUT_CRX"
fi

# Create signed CRX
echo "📦 Creating signed CRX package..."

# Create a temporary directory with only the necessary extension files
TEMP_DIR=$(mktemp -d)
TEMP_EXTENSION_DIR="$TEMP_DIR/$(basename "$EXTENSION_DIR")"

echo "🗂️  Creating temporary extension directory: $TEMP_EXTENSION_DIR"
mkdir -p "$TEMP_EXTENSION_DIR"

# Copy extension files, excluding CRX files and other build artifacts
echo "📋 Copying extension files (excluding CRX files)..."
rsync -av --exclude='*.crx' --exclude='*.zip' --exclude='.DS_Store' --exclude='*.log' "$EXTENSION_DIR/" "$TEMP_EXTENSION_DIR/"

# Package the extension from the temporary directory
cd "$(dirname "$TEMP_EXTENSION_DIR")"
"$CHROME_PATH" --pack-extension="$(basename "$TEMP_EXTENSION_DIR")" --pack-extension-key="$PRIVATE_KEY" --no-message-box

# Chrome creates the CRX with the directory name, so we need to find and rename it
GENERATED_CRX="$TEMP_DIR/$(basename "$EXTENSION_DIR").crx"
if [ -f "$GENERATED_CRX" ]; then
    mv "$GENERATED_CRX" "$OUTPUT_CRX"
    echo "✅ Successfully created signed CRX: $OUTPUT_CRX"
else
    echo "❌ Error: Failed to create CRX file"
    exit 1
fi

# Clean up temporary directory
echo "🧹 Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

# Display file info
echo ""
echo "📊 Package Information:"
echo "  File: $(basename "$OUTPUT_CRX")"
echo "  Size: $(ls -lh "$OUTPUT_CRX" | awk '{print $5}')"
echo "  Path: $OUTPUT_CRX"
echo ""
echo "🚀 Next Steps:"
echo "  1. Go to Chrome Web Store Developer Dashboard"
echo "  2. Navigate to your extension's Package tab"
echo "  3. Click 'Upload New Package'"
echo "  4. Upload the signed CRX file: $(basename "$OUTPUT_CRX")"
echo ""
echo "⚠️  Important: Keep your privatekey.pem file secure and never commit it to version control!"
