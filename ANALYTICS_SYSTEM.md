# Photobooth Analytics System

This document describes the analytics system for tracking photobooth style popularity based on downloads and shares.

## Overview

The analytics system tracks which AI prompt styles (like `anime1990s`, `animeClassic`, etc.) are most popular by monitoring:
- **Downloads**: When users save images to their device
- **Shares**: When users share images via Twitter/X or mobile web share API

## Architecture

### Backend Components

1. **Analytics Service** (`server/services/analyticsService.js`)
   - Redis-based storage for real-time analytics
   - Tracks daily and lifetime metrics
   - Maintains leaderboards for popularity ranking

2. **Analytics Routes** (`server/routes/analytics.js`)
   - REST API endpoints for tracking and retrieving analytics
   - Admin dashboard data aggregation
   - Secure tracking with metadata enrichment

### Frontend Components

1. **Analytics Service** (`src/services/analyticsService.js`)
   - Client-side tracking utilities
   - Automatic prompt ID extraction from style settings
   - Error-resilient tracking (failures don't break UX)

2. **Admin Dashboard** (`src/components/admin/AnalyticsDashboard.jsx`)
   - Real-time analytics visualization
   - Daily, yesterday, and lifetime metrics
   - Top prompts leaderboards

## Data Structure

### Redis Keys

```
# Daily metrics (expire after 30 days)
analytics:daily:2025-01-15:downloads:anime1990s
analytics:daily:2025-01-15:shares:anime1990s
analytics:daily:2025-01-15:combined:anime1990s

# Lifetime metrics (permanent)
analytics:lifetime:downloads:anime1990s
analytics:lifetime:shares:anime1990s
analytics:lifetime:combined:anime1990s

# Leaderboards (sorted sets)
analytics:leaderboard:daily:2025-01-15:downloads
analytics:leaderboard:lifetime:combined
```

### Tracked Metadata

- User agent and IP (for analytics, not stored permanently)
- Download type (framed vs raw)
- Share type (twitter, mobile-web-share, etc.)
- Theme and aspect ratio settings
- File format and watermark status

## API Endpoints

### Tracking Endpoints

```http
POST /api/analytics/track/download
POST /api/analytics/track/share
```

### Data Retrieval Endpoints

```http
GET /api/analytics/prompt/:promptId?date=YYYY-MM-DD
GET /api/analytics/top?type=combined&period=lifetime&limit=50
GET /api/analytics/summary/daily?date=YYYY-MM-DD
GET /api/analytics/summary/lifetime
GET /api/analytics/dashboard
```

### Admin Endpoints

```http
DELETE /api/analytics/clear?type=all&confirm=true
```

## Usage

### Accessing the Dashboard

Visit the analytics dashboard at:
- `https://photobooth.sogni.ai/#admin-analytics`
- `https://photobooth.sogni.ai/admin/analytics`

### Automatic Tracking

The system automatically tracks:
- ✅ Framed image downloads (with Polaroid frames)
- ✅ Raw image downloads (without frames)
- ✅ Twitter/X shares
- ✅ Mobile web share API usage

### Tracked Prompt IDs

All prompt IDs from `src/prompts.json` are tracked, including:
- `anime1990s`, `animeClassic`, `animeKawaii`
- `artNouveauGold`, `klimtGilded`, `vangoghSwirl`
- `neonTropical`, `synthwaveGrid`, `vaporwave`
- And 200+ more styles across all categories

## Privacy & Security

- **No Personal Data**: Only prompt usage patterns are tracked
- **IP Anonymization**: IPs are used for rate limiting, not stored long-term
- **User Agent**: Only for platform detection (mobile vs desktop)
- **Automatic Expiry**: Daily metrics expire after 30 days
- **Error Resilience**: Analytics failures never break user experience

## Configuration

### Redis Setup

Ensure Redis is configured in `server/.env`:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB_INDEX=1
REDIS_VERBOSE_LOGGING=true
```

### Environment Variables

No additional environment variables are required. The system uses existing Redis configuration.

## Monitoring

### Key Metrics

1. **Daily Active Prompts**: Number of unique prompts used each day
2. **Download vs Share Ratio**: User behavior patterns
3. **Mobile vs Desktop Usage**: Platform preferences
4. **Popular Style Categories**: Trending art styles

### Performance

- **Redis Pipeline Operations**: Atomic updates for consistency
- **Automatic Cleanup**: Old daily metrics expire automatically
- **Rate Limiting**: 10 requests per minute per IP for image serving
- **Efficient Queries**: Sorted sets for fast leaderboard retrieval

## Troubleshooting

### Common Issues

1. **No Analytics Data**
   - Check Redis connection
   - Verify tracking calls are being made
   - Check browser console for errors

2. **Dashboard Not Loading**
   - Ensure you're accessing the correct URL
   - Check network requests in browser dev tools
   - Verify API endpoints are responding

3. **Missing Prompt Tracking**
   - Verify prompt ID exists in `src/prompts.json`
   - Check that `selectedStyle` is being passed correctly
   - Ensure tracking calls are not being blocked

### Debug Tools

The analytics service is exposed to the browser console:

```javascript
// Available in browser console
window.analyticsService.trackDownload('anime1990s', { test: true });
window.analyticsService.getTopPrompts('combined', 'lifetime');
window.analyticsService.getAnalyticsDashboard();
```

## Future Enhancements

Potential improvements:
- Geographic analytics (country-level)
- Time-based trend analysis
- A/B testing for prompt variations
- Export functionality for data analysis
- Real-time WebSocket updates for dashboard
- Integration with Google Analytics events

## Support

For questions or issues with the analytics system:
1. Check the browser console for client-side errors
2. Check server logs for backend issues
3. Verify Redis is running and accessible
4. Test API endpoints directly with curl/Postman
