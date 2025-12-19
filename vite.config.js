import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import fs from 'fs';
import process from 'process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), "");

  // Use '/' base for production now that we're on our own domain
  const base = '/';

  // Get version from package.json
  const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
  const appVersion = packageJson.version;
  console.log(`App version: ${appVersion}`);

  // Filter out sensitive environment variables
  const secureEnv = {};
  for (const key in env) {
    // Only include non-sensitive environment variables
    // Exclude sensitive credentials from the frontend
    if (!key.includes('VITE_SOGNI_APP_ID')) {
      secureEnv[key] = env[key];
    }
  }

  // Determine the backend API port - default to 3001 if not specified
  const backendPort = parseInt(env.BACKEND_PORT || '3001', 10);
  console.log(`Backend API configured on port: ${backendPort}`);

  return {
    plugins: [react()],
    base,
    server: {
      host: "0.0.0.0",
      port: 5175,
      strictPort: true,
      https: false,            // disable HTTPS entirely as its handled by nginx
      allowedHosts: ["photobooth-local.sogni.ai", "photobooth.sogni.ai"],
      cors: {
        origin: ["https://photobooth-local.sogni.ai", "http://localhost:5175"],
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Client-App-ID"]
      },
      // Allow iframe embedding for browser extension
      // Add COOP/COEP headers for SharedArrayBuffer support (required for FFmpeg.wasm on mobile)
      // Using 'credentialless' instead of 'require-corp' to allow external resources like R2
      headers: {
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy': "frame-ancestors *;",
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless'
      },
      proxy: {
        // Proxy API requests to the backend server
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          secure: false,
          ws: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('Proxy error:', err);
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log('Proxying request:', req.method, req.url);
            });
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('Proxy response:', proxyRes.statusCode, req.url);
            });
          },
        },
        // Also proxy the /sogni endpoint
        '/sogni': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          secure: false,
        },
        // Also proxy health endpoint
        '/health': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          secure: false,
        }
      }
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      // Ensure JSON files and JavaScript configs are included in the build
      assetsInclude: ['**/*.json', 'src/constants/**/*.js'],
      // AGGRESSIVE cache busting with content hashes AND timestamps for all assets
      rollupOptions: {
        output: {
          // Add hash AND timestamp to all JS and CSS files for maximum cache busting
          entryFileNames: `assets/[name]-[hash]-${Date.now()}.js`,
          chunkFileNames: `assets/[name]-[hash]-${Date.now()}.js`,
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name.split('.');
            const ext = info[info.length - 1];
            const timestamp = Date.now();
            if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
              return `assets/images/[name]-[hash]-${timestamp}.${ext}`;
            }
            if (/css/i.test(ext)) {
              return `assets/css/[name]-[hash]-${timestamp}.${ext}`;
            }
            return `assets/[name]-[hash]-${timestamp}.${ext}`;
          },
        },
      },
    },
    // Copy PWA files during build
    publicDir: 'public',
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    // Only expose filtered environment variables to the frontend
    define: {
      // Replace sensitive env variables with safe placeholders
      'import.meta.env.VITE_SOGNI_APP_ID': JSON.stringify('***REMOVED***'),
      'import.meta.env.APP_VERSION': JSON.stringify(appVersion),
      // Remove VITE_API_ENDPOINT as src/config/urls.ts handles API URLs based on MODE
      // 'import.meta.env.VITE_API_ENDPOINT': JSON.stringify(env.VITE_API_ENDPOINT || 'https://photobooth-api-local.sogni.ai'), 
    }
  };
});
