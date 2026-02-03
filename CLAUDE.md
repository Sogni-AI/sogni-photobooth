# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sogni Photobooth is an AI-powered web application for stylized portrait generation using face-preserving image synthesis. Built with React 18 + TypeScript + Vite (frontend) and Node.js/Express (backend), it uses the Sogni Client SDK for DePIN-powered image generation.

**Live demo**: https://photobooth.sogni.ai

## Development Commands

```bash
# Install all dependencies (including server via prepare script)
npm install

# Configure backend
cp server/.env.example server/.env  # Add Sogni credentials

# Run development servers
cd server && npm run dev    # Terminal 1: Backend (port 3001)
npm run dev                 # Terminal 2: Frontend (port 5175)

# Build
npm run build               # Production build
npm run build:staging       # Staging build

# Testing
npm test                    # Jest unit/component tests
npm run test:watch          # Jest watch mode
npm run test:visual         # Playwright visual regression tests
npm run test:visual:update  # Update visual baselines

# Code quality
npm run lint                # ESLint (must pass with 0 warnings)
npm run validate:useeffect  # CRITICAL: Validate useEffect patterns before committing
```

## Local Development URLs

**NEVER use localhost or 127.0.0.1**. Always use the Nginx-proxied subdomains:
- Frontend: `https://photobooth-local.sogni.ai`
- Backend API: `https://photobooth-api-local.sogni.ai`

Reason: CORS, cookies (.sogni.ai domain), OAuth redirects all require proper subdomains.

## Architecture

### System Flow

**For Logged-Out Users:**
```
Frontend → Backend API → Sogni Client SDK → Sogni Socket Service
```
The backend acts as a secure proxy to the Sogni SDK, keeping credentials server-side only.

**For Logged-In Users (IMPORTANT):**
```
Frontend → FrontendSogniClientAdapter → Sogni Client SDK (direct) → Sogni Socket Service
```
When users are authenticated, the frontend uses the SDK directly via `FrontendSogniClientAdapter` (`src/services/frontendSogniAdapter.ts`). This bypasses the backend for image and video generation, providing lower latency and direct WebSocket communication. The adapter wraps the real Sogni SDK to emit events compatible with the existing UI.

### Key Directories
- `src/` - React frontend
  - `components/` - React components (admin, auth, camera, shared, etc.)
  - `context/` - React Context providers (AppContext, RewardsContext, ToastContext)
  - `services/` - API communication, auth, analytics (sogniBackend.ts, api.ts, sogniAuth.ts)
  - `hooks/` - Custom hooks (useProjectHistory, useLocalProjects, useWallet)
  - `config/urls.ts` - Environment-aware API URLs
  - `prompts.json` - 150+ AI style prompts
- `server/` - Express backend (separate package.json)
  - `routes/sogni.js` - Main SDK proxy routes, SSE endpoints
  - `services/sogni.js` - Core SDK instance management
- `tests/visual/` - Playwright visual regression tests
- `scripts/` - CLI, deployment, nginx configuration

### Critical Architecture Rules

**ONE Global SDK Instance Per Backend**: All clients (frontend, browser extension, mobile) share a single `globalSogniClient` instance. The SDK fully supports concurrent projects.

**Server-Sent Events (SSE) for Progress**: Real-time updates use EventSource, not WebSockets:
```typescript
GET /api/sogni/progress/:projectId?clientAppId=xxx
// Events: connected, progress, jobCompleted, complete, error
```

**Context-Based State Management**: Use AppContext for global state, custom hooks for component-level logic.

## Related Sogni Repositories

These sibling repositories are available locally for reference when building features or debugging:

- **`../sogni-client`** - Sogni Client SDK (TypeScript). Reference when integrating new SDK features, understanding Project/Job entities, or debugging WebSocket communication.

- **`../sogni-socket`** - Sogni Socket Service. WebSocket server that routes jobs between artists (users) and workers (GPUs). Check here for job matching, pricing logic, or connection issues.

- **`../sogni-api`** - Sogni REST API (Node.js/Express/TypeScript). Backend for accounts, authentication, transactions. Required for Stripe integration changes (see README.md).

- **`../ComfyUI`** - Sogni Comfy Fast Worker. ComfyUI-based GPU worker for image/video generation. Check here when debugging audio/video transcode issues or workflow bugs.

## useEffect Rules (MANDATORY)

Every useEffect must pass `npm run validate:useeffect` before committing.

**Golden Rule**: Each effect has ONE responsibility.

**NEVER add to dependency arrays**:
- Functions (`initializeSogni`, `handleClick`, `updateSetting`)
- Whole objects (`settings`, `authState`)
- Context functions (`updateSetting`, `clearCache`)

**Only add primitives that should trigger the effect**:
```typescript
// CORRECT - separate effects for separate concerns
useEffect(() => {
  if (authState.isAuthenticated) initializeSogni();
}, [authState.isAuthenticated]);

useEffect(() => {
  if (settings.watermark) updateWatermark();
}, [settings.watermark]);
```

See `cursor.rules.md` for complete examples and rationale.

## Key Reference Documents

- `cursor.rules.md` - Development rules, useEffect enforcement, debugging guidelines
- `ARCHITECTURE-ROADMAP.md` - Concurrent processing patterns, SSE strategies, common pitfalls
- `README.md` - Setup, features, Stripe integration

## Environment Configuration

| File | Purpose |
|------|---------|
| `server/.env` | Backend secrets (SOGNI_USERNAME, SOGNI_PASSWORD, Redis config) |
| `.env.local` | Frontend local dev (VITE_* vars) |
| `.env.production` | Frontend production config |
| `scripts/nginx/local.conf` | Nginx reverse proxy configuration |

## Video Generation

### Video Model Architecture

The SDK supports two families of video models with **fundamentally different FPS and frame count behavior**. See `../sogni-client/CLAUDE.md` for authoritative SDK documentation.

### Standard Behavior (LTX-2 and future models)

**LTX-2 Models (`ltx2-*`)** represent the standard behavior going forward:
- **Generate at the actual specified FPS** (1-60 fps range)
- No post-render interpolation - fps directly affects generation
- **Frame calculation**: `duration * fps + 1`
- **Frame step constraint**: Frame count must follow pattern `1 + n*8` (i.e., 1, 9, 17, 25, 33, ...)
- Example: 5 seconds at 24fps = 121 frames (snapped to 1 + 15*8 = 121)

### Legacy Behavior (WAN 2.2 only)

**WAN 2.2 Models (`wan_v2.2-*`)** are the outlier with legacy behavior:
- **Always generate at 16fps internally**, regardless of the user's fps setting
- The `fps` parameter (16 or 32) controls **post-render frame interpolation only**
- `fps=16`: No interpolation, output matches generation (16fps)
- `fps=32`: Frames are doubled via interpolation after generation
- **Frame calculation**: `duration * 16 + 1` (always uses 16, ignores fps)
- Example: 5 seconds at 32fps = 81 frames generated → interpolated to 161 output frames

### Key Files
- `src/services/VideoGenerator.ts` - Main video generation service
- `src/constants/videoSettings.ts` - Video settings, quality presets, and `calculateVideoFrames()` (currently WAN 2.2 specific)
- `src/constants/settings.ts` - App settings including `DEFAULT_SETTINGS.videoFramerate` (32)

### Important Note
The current `calculateVideoFrames()` function in `videoSettings.ts` uses the WAN 2.2 formula (`duration * 16 + 1`). When adding LTX-2 or other models, this logic must be made model-aware. The SDK (`sogni-client`) already handles this internally via `calculateVideoFrames()` in `src/Projects/utils/index.ts`.

## Debugging Concurrent Issues

- Check for `code: 4015` errors (multiple SDK instances conflict)
- Check for "Invalid nonce" errors (concurrent SDK creation)
- Never conclude SDK processes projects sequentially - main frontend runs 16+ concurrent jobs successfully
- Always examine actual code before making assumptions
