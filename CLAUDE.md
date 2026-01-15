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
```
Frontend/Extension → Backend API → Sogni Client SDK → Sogni Socket Service
```

The backend acts as a secure proxy to the Sogni SDK, keeping credentials server-side only.

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

## Debugging Concurrent Issues

- Check for `code: 4015` errors (multiple SDK instances conflict)
- Check for "Invalid nonce" errors (concurrent SDK creation)
- Never conclude SDK processes projects sequentially - main frontend runs 16+ concurrent jobs successfully
- Always examine actual code before making assumptions
