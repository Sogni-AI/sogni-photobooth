# Deployment Optimization for Gallery Files

## Overview
The gallery feature includes 100+ sample images in `/public/gallery/prompts/`. To prevent redundant uploads during deployments, the deployment scripts have been optimized.

## Optimization Strategy

### 1. Main Frontend Sync
```bash
rsync -ar --progress --update --checksum dist/ $REMOTE_HOST:$REMOTE_FRONTEND_PATH/
```
- `--update`: Skip files that are newer on the destination
- `--checksum`: Use checksums instead of timestamps for accuracy

### 2. Gallery Files Optimization
```bash
rsync -ar --progress --ignore-existing --size-only dist/gallery/prompts/ $REMOTE_HOST:$REMOTE_FRONTEND_PATH/gallery/prompts/
```
- `--ignore-existing`: Skip files that already exist on destination
- `--size-only`: Only check file size (faster than checksum for large images)

## Benefits

### First Deployment
- All gallery files are uploaded normally
- Takes longer due to 100+ images being transferred

### Subsequent Deployments
- Gallery files that already exist are skipped completely
- Only new or modified gallery files are transferred
- Significantly faster deployment times
- Reduced bandwidth usage

## File Structure
```
public/gallery/prompts/
├── sogni-photobooth-crown-drip-raw.jpg
├── sogni-photobooth-vaporwave-raw.jpg
└── ... (200+ other prompt examples)
```

## Manual Gallery Update
If you need to force update all gallery files:
```bash
# Remove gallery directory on server first
ssh $REMOTE_HOST "rm -rf $REMOTE_FRONTEND_PATH/gallery/prompts"

# Then run normal deployment - all files will be uploaded
./scripts/deploy-production.sh
```

## Monitoring
The deployment scripts will show:
- `📸 Syncing gallery prompt images (skipping existing files)...`
- `✅ Gallery files synced efficiently (existing files skipped)`

This indicates the optimization is working correctly.
