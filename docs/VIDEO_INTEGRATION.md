# Video Integration Documentation

This document outlines the image-to-video generation feature in Sogni Photobooth, which uses the Wan 2.2 14B FP8 model to create motion videos from photos.

## Overview

The video feature allows authenticated users to generate AI-powered motion videos from their generated photos. Videos can be 3, 5, or 7 seconds long and can be generated at different quality levels and resolutions.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface                           │
├─────────────────────────────────────────────────────────────────┤
│  Video Button (with NEW badge)                                  │
│       │                                                         │
│       ├── First click → Video Intro Popup (if not seen)         │
│       │                                                         │
│       └── Video Dropdown                                        │
│           ├── Generate: Shows cost, triggers generation         │
│           ├── Progress: ETA countdown, elapsed time, cancel     │
│           └── Complete: Video preview, download, regenerate     │
├─────────────────────────────────────────────────────────────────┤
│                      Services Layer                             │
├─────────────────────────────────────────────────────────────────┤
│  VideoGenerator.ts                                              │
│       │                                                         │
│       ├── generateVideo() - Creates project, tracks progress    │
│       ├── cancelVideoGeneration() - Cancels active project      │
│       └── downloadVideo() - Downloads completed video           │
├─────────────────────────────────────────────────────────────────┤
│  useVideoCostEstimation.ts                                      │
│       │                                                         │
│       └── Fetches cost from Sogni REST API                      │
├─────────────────────────────────────────────────────────────────┤
│                    Sogni Client SDK                             │
│       │                                                         │
│       └── projects.create({ type: 'video', ... })               │
└─────────────────────────────────────────────────────────────────┘
```

## Files

### New Files

| File | Description |
|------|-------------|
| `src/constants/videoSettings.ts` | Video models, quality presets, resolution options, helper functions |
| `src/hooks/useVideoCostEstimation.ts` | Hook for fetching video generation costs |
| `src/services/VideoGenerator.ts` | Video generation service with progress tracking |
| `src/components/shared/VideoIntroPopup.tsx` | First-time feature introduction popup |

### Modified Files

| File | Changes |
|------|---------|
| `src/types/index.ts` | Added video-related properties to Photo and Settings types |
| `src/constants/settings.ts` | Added videoResolution and videoQuality defaults |
| `src/context/AppContext.tsx` | Added video settings to context |
| `src/components/shared/AdvancedSettings.tsx` | Added Video Generation settings section |
| `src/components/shared/PhotoGallery.jsx` | Added Video button, dropdown, and video generation UI |
| `src/styles/components/PhotoGallery.css` | Added video button and dropdown styles |

## Video Settings

### Quality Presets

| Preset | Model | Steps | Description |
|--------|-------|-------|-------------|
| Fast | `wan_v2.2-14b-fp8_i2v_lightx2v` | 4 | Quick generation (~12-20s) |
| Balanced | `wan_v2.2-14b-fp8_i2v_lightx2v` | 8 | Good balance (~25-40s) |
| High Quality | `wan_v2.2-14b-fp8_i2v` | 20 | Higher quality (~1-2 min) |
| Pro | `wan_v2.2-14b-fp8_i2v` | 40 | Maximum quality (~2-4 min) |

### Resolution Options

| Resolution | Max Dimension | Description |
|------------|---------------|-------------|
| 480p | 480px | Standard quality (faster, lower cost) |
| 720p | 720px | HD quality (slower, higher cost) |

Video dimensions are automatically calculated to:
- Maintain the original image aspect ratio
- Be divisible by 16 (required by the model)
- Not exceed the resolution's max dimension

### Duration Options

| Duration | Frames (16fps) | Frames (32fps) | Description |
|----------|----------------|----------------|-------------|
| 3s | 49 | 97 | Short video (0.6x cost/time) |
| 5s | 81 | 161 | Standard duration (default) |
| 7s | 113 | 225 | Extended duration (1.4x cost/time) |

Duration setting affects:
- Frame count calculation (fps × duration + 1)
- Cost estimation (proportional to frame count)
- Generation time (proportional to frame count)

## Photo State Properties

The Photo type includes these video-related properties:

```typescript
interface Photo {
  // ... existing properties ...
  
  // Video generation fields
  videoUrl?: string;           // URL of completed video
  generatingVideo?: boolean;   // Currently generating
  videoProgress?: number;      // Progress 0-1
  videoETA?: number;           // Seconds remaining
  videoStartTime?: number;     // Generation start timestamp
  videoProjectId?: string;     // Active project ID (for cancellation)
  videoError?: string;         // Error message if failed
}
```

## Cost Estimation

Video costs are fetched from the Sogni REST API:

```
GET https://socket.sogni.ai/api/v1/job-video/estimate/{tokenType}/{modelId}/{width}/{height}/{frames}/{fps}/{steps}
```

Response:
```json
{
  "quote": {
    "project": {
      "costInSpark": "1.23",
      "costInSogni": "0.45",
      "costInUSD": "0.02"
    }
  }
}
```

## Progress Tracking

Unlike image generation which tracks steps, video progress is calculated based on:

```
progress = elapsedTime / etaSeconds
```

The SDK provides `jobETA` events with estimated completion time. Progress is capped at 99% until actual completion.

## Toast Notifications

The feature integrates with the existing toast system for:

- **Success**: "Video ready! Your 5-second video is ready to view."
- **Error**: "Video generation failed. Please try again."
- **Cancelled**: "Video generation cancelled."

## First-Time User Experience

1. **NEW Badge**: A pulsing "NEW" badge appears on the Video button until the user generates their first video
2. **Intro Popup**: On first click, users see an introduction with:
   - Auto-playing example videos
   - Feature highlights
   - Options to dismiss or proceed

LocalStorage keys:
- `sogni_video_intro_seen`: Whether intro popup was shown
- `sogni_video_generated`: Whether user has generated a video (hides NEW badge)

## Example Usage

### Generating a Video

```typescript
import { generateVideo } from '../../services/VideoGenerator';

generateVideo({
  photo: photos[selectedPhotoIndex],
  photoIndex: selectedPhotoIndex,
  subIndex: selectedSubIndex,
  imageWidth: desiredWidth,
  imageHeight: desiredHeight,
  sogniClient,
  setPhotos,
  resolution: settings.videoResolution,
  quality: settings.videoQuality,
  fps: settings.videoFramerate,
  duration: settings.videoDuration,
  onComplete: (videoUrl) => {
    showToast({ title: 'Video Ready!', type: 'success' });
  },
  onError: (error) => {
    showToast({ title: 'Video Failed', message: error.message, type: 'error' });
  }
});
```

### Cancelling a Video

```typescript
import { cancelVideoGeneration } from '../../services/VideoGenerator';

cancelVideoGeneration(
  photo.videoProjectId,
  sogniClient,
  setPhotos,
  () => showToast({ title: 'Cancelled', type: 'info' })
);
```

### Downloading a Video

```typescript
import { downloadVideo } from '../../services/VideoGenerator';

await downloadVideo(photo.videoUrl, `sogni-video-${Date.now()}.mp4`);
```

## Display Currency Setting

Users can choose to display costs in either tokens (SOGNI/Spark) or USD:

- **SOGNI Token / Spark Points** (default): Shows cost in the selected token type
- **$ USD**: Shows cost in US dollars, rounded up to 3 decimal places (e.g., "$0.023 USD")

The setting is found in **Photobooth Settings → Advanced Features → Display Currency**.

## Availability

- **Authenticated users only**: Video generation requires login
- **Not available in demo mode**: Skipped for unauthenticated users
- **Not in Vibe Explorer**: Video button only appears in regular photo gallery slideshow

## SDK Requirements

This feature requires Sogni Client SDK v4.0.0-alpha.25 or later with:
- `type: 'video'` support in `projects.create()`
- `numberOfMedia` parameter (renamed from `numberOfImages`)
- `referenceImage` parameter for image-to-video
- `frames` and `fps` parameters
- `jobETA` event support

## Future Enhancements

Potential future improvements:
- Multiple video storage per photo
- Video gallery/history
- Sound-to-video generation
- Video sharing to social media

