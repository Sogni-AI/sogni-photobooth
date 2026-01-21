# Sogni Photobooth

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

A full-featured **AI media generation suite** for stylized portraits, video creation, and image editing. Snap a selfie or upload a photo, then generate stunning stylized portraits, animate them into videos, edit with AI-powered transformations, and re-render from any camera angle—all without downloading models or needing a GPU.

**Key Capabilities:**
- 🎨 **12 AI Models** including SDXL, Qwen Image Edit 2511, and Flux.2
- 🎬 **Video Generation** with Wan 2.2 (I2V, sound-to-video, dance memes, character replacement)
- 📐 **3D Camera Angles** via Multiple Angles LoRA (96 angle combinations)
- 🖌️ **AI Image Editing** with 30+ transformation presets
- ⚡ **150+ Style Prompts** across 18 categories
- 🔄 **Batch Processing** up to 256 concurrent generations

This is a demo application powered by the whitelabel Sogni Client SDK, open-sourced for developers to fork or reference for their own Sogni Supernet powered applications.

If you build something cool with the Sogni Client SDK let us know and we'll add it to the growing list of "Sogni Superapps": https://www.sogni.ai/super-apps

Live demo → **https://photobooth.sogni.ai**

<div align="center">
  <img alt="Photobooth screenshot – webcam mode" src="docs/assets/photobooth-demo-1.png?1" width="100%"/>
  <img alt="Photobooth screenshot – style selection"  src="docs/assets/photobooth-demo-2.png?1" width="100%"/>
  <img alt="Photobooth screenshot – generated gallery"  src="docs/assets/photobooth-demo-3.png?1" width="100%"/>
</div>

---

## ✨ Features

### 🎨 Image Generation

**12 AI Models** for diverse generation styles:

| Model | Type | Best For |
|-------|------|----------|
| **Sogni.XLT α1** | SDXL Turbo | Fast generation, general purpose |
| **DreamShaper v2.1** | SDXL Turbo | Artistic styles |
| **JuggernautXL 9** | SDXL Lightning | Photorealistic portraits |
| **RealVisXL v4** | SDXL Lightning | Ultra-realistic output |
| **Qwen Image Edit 2511** | Context-aware | Image transformations & editing |
| **Qwen Image Edit 2511 Lightning** | Context-aware | Fast image transformations |
| **Flux.1 Kontext** | Flux | Advanced context-aware generation |
| **Flux.2 [dev]** | Flux | Highest quality output |

**150+ Style Prompts** across 18 categories:
- 🎄 Christmas/Winter (35+ styles) - defrostMode, snowLeopardFur, winterElf, etc.
- 🎌 Anime/Manga/Chibi - 1990s anime, Ghibli meadow, Jojo stand aura, pixel chibi
- 🎨 Classical/Vintage - Art Nouveau, Klimt gilded, Van Gogh swirl, Warhol pop
- 📚 Comics/Caricature - Cel shade 3D, holo trading card, sketch caricature
- 🚀 Fantasy/Sci-Fi - Cyber glow, mythic mermaid, neon cyberpunk
- 💄 Glamour - Barbie, satin studio, avant-garde, fashion mag
- 🎭 Kitsch/Gags - Llama photobomb, clown pastel, kitty swarm
- 🖼️ Materials/Printmaking - Watercolor bleed, woodcut ink, embroidery stitch
- 🌈 Neon/Vapor/Glitch - Synthwave grid, vaporwave, prism kaleidoscope
- 👾 Pixel/NFT/Retro Game - CryptoPunk, Bored Ape, pixel art, arcade vector
- 📸 Pro/Editorial - Magazine cover, vintage Hollywood, professional headshot
- 🎉 Raver/Costume - Candy raver, festival color powder, y2k raver kid
- 🎵 Roleplay - DJ, MC, F1 driver, basketball star, figure skater
- 🥊 Fighters - Boxer, wrestler, kung fu master, samurai ronin
- 🎨 Street/Graffiti - Banksy stencil, pop graffiti, punk poster
- 📖 Storybook/Kidlit - Dragon, astronaut, mermaid cat, viking
- 🎃 Halloween - Wednesday Addams, dark fairy, pumpkin queen
- 👻 Horror - Vampire lord, haunted bride, cosmic grim reaper

---

### 🎬 Video Generation (Wan 2.2 14B)

**Image-to-Video (I2V)**
- Transform still images into dynamic 1-8 second videos
- Quality presets: Fast (4 steps), Balanced (8 steps), High Quality (20 steps), Pro (30 steps)
- Resolutions: 480p, 580p, 720p
- LightX2V variant for 4x faster generation

**Sound-to-Video (S2V)**
- Generate videos synchronized to audio input
- Precise audio timing controls (start time, duration)
- Lip-sync and beat-matching capabilities

**Animate-Move**
- Reference motion from existing videos
- Preserve subject identity while animating movement
- Perfect for dance meme videos and choreography transfer

**Animate-Replace (Character Replacement)**
- Replace subjects in existing videos using SAM2 coordinate selection
- Batch video character replacement for montage sequences
- Maintains video continuity with new subject

**Batch-Transition (Montage Mode)**
- Generate seamless transitions between multiple images
- Create montage videos with coordinated segments
- Sequential image linking for continuous narratives

---

### 📐 Camera Angle Generation (Multiple Angles LoRA)

**3D Position Remapping** using Qwen Image Edit 2511 + Multiple Angles LoRA:

**96 Camera Angle Combinations:**
- **8 Azimuths**: Front, Front-Right, Right, Back-Right, Back, Back-Left, Left, Front-Left
- **4 Elevations**: Low-angle (-30°), Eye-level (0°), Elevated (30°), High-angle (60°)
- **3 Distances**: Close-up, Medium, Wide

**6 Quick Presets:**
- 3/4 Portrait - Classic flattering angle
- Profile - Side view
- Hero Shot - Low-angle dramatic
- Overhead - Top-down perspective
- Close-up - Detailed face shot
- Over Shoulder - Dynamic composition

---

### 🖌️ Image Enhancement & Editing

**Qwen-Powered Transformations** (30+ presets):
- Style transfers: Lego, Pixar, Simpsons, Minecraft, Fortnite, WoW
- Art styles: Pop art, Ukiyo-e, tattoo flash, doodle art
- Effects: Neon glow, claymation, bobblehead, angry expression
- Additions: Add cats, hats & glasses, clone yourself

**Photo Enhancement**
- Full image upscaling and enhancement
- Face-preserving transformations
- Multiple undo/redo with original baseline preservation

---

### 📱 Core Features

- **Identity-Preserving Synthesis** – keeps your face while transforming the style
- **Mobile & Desktop** – webcam support, camera-roll upload, drag-and-drop
- **Aspect Ratios** – Ultra Narrow to Ultra Wide (7 presets including 2:3, 3:4, 1:1, 16:9)
- **DePIN Powered** – no model downloads; up to 256 concurrent jobs on Sogni Supernet
- **Real-time Progress** – SSE streaming with per-image progress bars
- **QR Watermarking** – configurable size, position, and custom URLs
- **Batch Processing** – up to 256 concurrent images (16 on mobile)
- **Local Project Storage** – IndexedDB with cloud sync
- **Stripe Payments** – purchase Spark Points with credit card

---

### 🛠️ Developer Features

- **One-Click Local Dev** – Vite + Nodemon + script runner
- **Secure Backend** – credentials isolated in Node server
- **Visual Regression Testing** – Playwright-based screenshot comparison
- **useEffect Validation** – automated React hook linting
- **Event Theming** – Halloween, Winter, custom event contexts

> You'll need a free [Sogni account](https://www.sogni.ai) + tokens for inference jobs.

---

## 📑 Table of Contents
1. [Quick Start](#-quick-start)
2. [Project Layout](#-project-layout)
3. [Configuration](#️-configuration)
4. [Stripe Payment Integration](#-stripe-payment-integration)
5. [Code Quality & Enforcement](#-code-quality--enforcement)
6. [Testing](#-testing)
7. [Production Build & Deploy](#-production-build--deploy)
8. [Contributing](#-contributing)
9. [License](#-license)
10. [Acknowledgements](#-acknowledgements)

---

## 🚀 Quick Start

### 1 · Clone & install
```bash
# clone
git clone https://github.com/Sogni-AI/sogni-photobooth.git
cd sogni-photobooth

# installs root deps *and* runs the npm **prepare** script which installs /server deps
npm install
```

### 2 · Backend credentials
```bash
cp server/.env.example server/.env   # edit the values
```
Minimal example:
```
SOGNI_APP_ID=photobooth-local   # optional; autogenerated if blank
SOGNI_USERNAME=your_username
SOGNI_PASSWORD=your_password
SOGNI_ENV=local                # local | staging | production
PORT=3001
CLIENT_ORIGIN=https://photobooth-local.sogni.ai

# Redis Configuration (optional, for Analytics, improved session management, Twitter/X sharing)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB_INDEX=1
REDIS_VERBOSE_LOGGING=true
```

### 3 · Configure Local Hosts & SSL Certificate

For the best local development experience, we use Nginx as a reverse proxy to handle SSL and route traffic to the appropriate services (frontend and backend) on separate subdomains.

**a. Update your hosts file:**
   You\'ll need to map the local development domains to your loopback address. Add the following lines to your `/etc/hosts` file (or equivalent for your OS):

   ```
   127.0.0.1 photobooth-local.sogni.ai
   127.0.0.1 photobooth-api-local.sogni.ai
   ```

**b. Create SSL Certificates:**
   The Nginx configuration requires SSL certificates for both domains. Create them with this one-liner:

   ```bash
   # Create SSL directory and generate self-signed certificate
   mkdir -p /opt/homebrew/etc/nginx/ssl && \
   cd /opt/homebrew/etc/nginx/ssl && \
   openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
     -keyout sogni-local.key \
     -out sogni-local.crt \
     -subj "/C=US/ST=State/L=City/O=Development/CN=*.sogni.ai" \
     -addext "subjectAltName=DNS:photobooth-local.sogni.ai,DNS:photobooth-api-local.sogni.ai,DNS:*.sogni.ai"
   ```

   This creates certificates at:
   - `/opt/homebrew/etc/nginx/ssl/sogni-local.crt`
   - `/opt/homebrew/etc/nginx/ssl/sogni-local.key`

   **Browser Certificate Warning:** When you first visit https://photobooth-local.sogni.ai, your browser will show a security warning about the self-signed certificate. Click **"Advanced"** → **"Proceed"** to continue. This is normal for local development.

   *Optional: To trust the certificate system-wide and avoid the warning:*
   ```bash
   sudo security add-trusted-cert -d -r trustRoot \
     -k /Library/Keychains/System.keychain \
     /opt/homebrew/etc/nginx/ssl/sogni-local.crt
   # Restart your browser after running this
   ```

### 4 · Configure Nginx and Run in dev mode

Before starting the development servers, ensure Nginx is running and configured to use the local setup.

**a. Configure Nginx:**
   Copy the provided Nginx configuration file from this project to your Nginx server configuration directory. A common location for Homebrew Nginx is `/opt/homebrew/etc/nginx/servers/`.

   ```bash
   # Run from the project root directory
   cp scripts/nginx/local.conf /opt/homebrew/etc/nginx/servers/photobooth-local.conf
   ```

**b. Start/Restart Nginx:**
   Start Nginx to apply the configuration. You'll need to enter your password:

   ```bash
   # Start Nginx (if not running)
   sudo nginx

   # Or restart if already running
   sudo nginx -s reload
   ```

   Verify Nginx is running:
   ```bash
   ps aux | grep nginx | grep -v grep
   ```

**c. Run Development Servers:**
   Now, start the React front-end and the Node Express back-end in separate terminals.

```bash
# Terminal 1 – backend
cd server && npm run dev

# Terminal 2 – frontend (in project root)
npm run dev
```

**d. Access the Application:**
   Visit **https://photobooth-local.sogni.ai**. The frontend will make API calls to **https://photobooth-api-local.sogni.ai**.

   *Note: Your browser will show a security warning about the self-signed certificate. Click "Advanced" → "Proceed" to continue (see Step 3b above).*

### Optional script runner

If you prefer not to keep terminals open, you can use the script runner. This will start the services in the background and log to files in the
`logs/` directory.

```bash
./scripts/run.sh start   # starts front & back in background
./scripts/run.sh status  # see logs / ports
```

### Troubleshooting Local Setup

**"This site can't be reached" / ERR_CONNECTION_REFUSED:**
- Make sure both frontend (port 5175) and backend (port 3001) are running
- Verify Nginx is running: `ps aux | grep nginx | grep -v grep`
- If Nginx isn't running, start it: `sudo nginx`
- Check that SSL certificates exist: `ls -la /opt/homebrew/etc/nginx/ssl/`

**ERR_CERT_AUTHORITY_INVALID:**
- This is expected with self-signed certificates
- Click "Advanced" → "Proceed" in your browser
- Or trust the certificate system-wide (see Step 3b above)

**Port already in use:**
- The `npm run dev` commands automatically kill processes on ports 5175 and 3001
- If you see errors, manually kill the processes: `npx kill-port 5175 3001`

---

## 🗂 Project Layout
```
├─ src/           # React frontend
│  ├─ components/
│  ├─ services/   # browser-side API helpers
│  └─ ...
├─ server/        # Express backend (API → Sogni SDK)
│  ├─ routes/
│  └─ services/
├─ scripts/       # helper CLI & deployment scripts
├─ tests/         # Playwright visual tests & Jest unit tests
└─ screenshots/   # demo images used in this README
```

---

## ⚙️ Configuration

| File | Purpose |
|------|---------|
| `server/.env` | Backend secrets, CORS origin, Redis configuration |
| `.env.local` | Local frontend configuration including Google Analytics settings |
| `.env.staging` | Staging frontend configuration for builds |
| `.env.production` | Production frontend configuration for builds |
| `configs/local/*.conf` | Nginx local SSL reverse-proxy |
| `scripts/nginx/local.conf` | Main Nginx configuration for local development, defining frontend and backend subdomains. Expects SSL certs at `/opt/homebrew/etc/nginx/ssl/`. |

### Frontend Environment Variables

The application uses environment-specific configuration files for frontend settings:

1. Create a `.env.local` file in the project root for local development:
   ```
   # Moderation Password (Required)
   # Used to protect the /admin/moderate page
   VITE_MODERATION_PASSWORD=your_secure_password_here

   # Moderation Feature Flag (Optional)
   # Set to 'false' to disable moderation for rapid testing
   VITE_MODERATION_ENABLED=false

   # Google Analytics Configuration (Optional)
   # Set to 'false' to disable GA completely
   VITE_GA_ENABLED=true
   # Your Google Analytics measurement ID (e.g., G-XXXXXXXXXX)
   VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
   # Domain for cookies, set to 'auto' for default behavior or specify 'sogni.ai' to share across subdomains
   VITE_GA_DOMAIN=sogni.ai
   ```

2. For production builds, create a `.env.production` file with the same variables (set `VITE_MODERATION_ENABLED=true` for production)

3. Important notes:
   - **Never commit `.env.local` or `.env.production` to Git** - they're in `.gitignore`
   - All frontend environment variables must be prefixed with `VITE_` to be accessible
   - The moderation password is required to access `/admin/moderate`
   - Moderation is enabled by default in production/staging, disabled by default in local
   - Google Analytics is optional and respects user privacy
   - Analytics supports cross-subdomain tracking for sogni.ai domains

### Redis Configuration

The application utilizes Redis for session management and persistence of Twitter/X OAuth data when using the photo sharing functionality:

1. Add these Redis configuration variables to your `server/.env` file:
   ```
   # Redis Configuration
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=
   REDIS_DB_INDEX=1
   REDIS_VERBOSE_LOGGING=true
   ```

2. Redis benefits:
   - Provides persistent session storage for Twitter/X OAuth flow
   - Falls back to in-memory storage if Redis is unavailable
   - Automatically handles TTL (Time-To-Live) for session data
   - Improves scalability when deploying to multiple server instances

Redis is optional - if not available, the system will use in-memory storage as a fallback.

---

## 💳 Stripe Payment Integration

The photobooth now supports credit card payments via Stripe for purchasing Spark Points. This feature allows authenticated users to buy credits directly within the app.

### Features
- **Beautiful Payment Modal** - Gradient backgrounds, smooth animations, responsive design
- **Real-time Balance Updates** - WebSocket-powered balance updates via SDK's DataEntity pattern (no polling!)
- **Cross-tab Notifications** - BroadcastChannel for purchase completion messages
- **Direct API Integration** - Calls Sogni API directly via authenticated SDK (same as sogni-web)
- **Mobile Optimized** - Works seamlessly on mobile and desktop

### Architecture
```
Photobooth Frontend → Sogni API (via SDK) → Stripe
                   ← ← ← ← ← ← ← ← ← ← ← ← ←
```
*Calls Sogni API directly using the authenticated SogniClient SDK (same as sogni-web)*

### User Flow
1. User clicks "Buy Spark" in wallet widget OR triggers "Out of Credits" popup
2. StripePurchase modal shows available Spark Point packages
3. User selects a package and clicks "Buy"
4. Stripe Checkout opens in new window/tab
5. User completes payment with credit card
6. Stripe redirects to success page `/spark-purchase-complete/`
7. Success page broadcasts purchase completion to main app
8. Stripe webhook updates backend, credits are added to user account
9. **Balance updates automatically via WebSocket** (SDK's DataEntity 'updated' event)
10. UI displays new balance in real-time

### Backend Changes Required

The Sogni API backend needs updates to support photobooth redirects. See `STRIPE_INTEGRATION.md` for complete implementation details:

**Key changes needed in `../sogni-api`:**
1. Add `getPhotoboothBaseUrl()` helper function
2. Update `StripeService.getRedirectUrl()` to support `redirectType: 'photobooth'`
3. Update TypeScript interfaces to include `'photobooth'` redirect type

### Testing

Use Stripe test cards:
- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- Use any future expiry date and any 3-digit CVC

### Files
- **Frontend**: `src/components/stripe/*`, `src/services/stripe.ts`, `src/hooks/useSparkPurchase.ts`
- **Success Page**: `public/spark-purchase-complete/index.html`
- **Documentation**: `STRIPE_INTEGRATION.md`

*No backend proxy needed - calls Sogni API directly via SDK*

### Limitations
- Only available for **authenticated users** (not demo mode)
- Requires backend changes in `../sogni-api` to be deployed
- Webhook endpoint must be configured in Stripe dashboard

For complete implementation details, troubleshooting, and deployment guide, see **[STRIPE_INTEGRATION.md](./STRIPE_INTEGRATION.md)**.

---

## 🔍 Code Quality & Enforcement

This project uses **automated validation** to prevent common React bugs, especially around `useEffect` hooks.

### useEffect Validation

**Before making changes to React components:**

```bash
npm run validate:useeffect
```

This script scans all React files for common `useEffect` violations:
- ❌ Functions in dependency arrays (causes infinite re-renders)
- ❌ Too many dependencies (indicates mixed concerns)
- ❌ Context functions that don't need to be dependencies

**Required reading:**
- 📖 `cursor.rules.md` - Complete rules and examples
- 📋 `USEEFFECT-CHECKLIST.md` - Step-by-step checklist before editing useEffect
- 📊 `USEEFFECT-ENFORCEMENT.md` - Full enforcement strategy and rationale

**Why this matters:**

A single misplaced dependency can cause bugs like:
- Settings that auto-deselect after being clicked
- Infinite render loops
- Effects running when unrelated state changes
- Performance degradation from unnecessary re-renders

The validation script catches these issues **before** they make it into the codebase.

---

## 🧪 Testing

```bash
# unit + component tests
npm test

# visual regression (HTML report)
npm run test:visual
```
Full visual refactor workflow:
```bash
npm run test:visual:baseline  # capture
# …make changes…
npm run test:visual:refactor  # compare & report
```

---

## 📦 Production Build & Deploy

```bash
# Build for production
npm run build            # Uses .env.production for frontend config

# Build for staging
npm run build:staging    # Uses .env.staging for frontend config

# Deploy to production (requires server/.env.production)
npm run deploy:production

# Deploy to staging (requires server/.env.staging and .env.staging)
npm run deploy:staging
```

Deploy `/dist` to your static host and `/server` behind Node (PM2, systemd, etc.).  
Make sure **PORT**, **CLIENT_ORIGIN**, **Redis configuration** (if using Twitter sharing), and SSL are configured.

---

## 🤝 Contributing
Pull requests are welcome!  
Please run `npm run lint` and `npm run test:visual` before submitting.

We follow the standard [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) Code of Conduct.

---

## 📜 License

Licensed under the **MIT License**.  See [`LICENSE`](LICENSE) for the full text.

---

## 🙏 Acknowledgements
- **Sogni AI** – for the SDK & Supernet that powers this application. [More "Superapps"](https://www.sogni.ai/super-apps)
- **Stable Diffusion SDXL** – <https://huggingface.co/docs/diffusers/en/using-diffusers/sdxl>
- **Wan 2.2** – video generation model for I2V, S2V, and animation workflows
- **Qwen Image Edit 2511** – context-aware image editing and transformation
- **Flux** – advanced image generation models (Kontext & Flux.2)
- **Multiple Angles LoRA** – 3D camera position remapping
- **ControlNet** – <https://github.com/lllyasviel/ControlNet>
- **Instant ID** – <https://github.com/instantX-research/InstantID>
- **SAM2** – segment anything for video subject selection
- **Cursor AI** – the AI pair-programmer used to vibe-code this sample repo.

For questions, feedback, or support feel free to reach us at **dream@sogni.ai** 
