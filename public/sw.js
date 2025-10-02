// Service Worker for Sogni AI Photobooth PWA - INTELLIGENT CACHING
const CACHE_VERSION = '1.0.22';
const CACHE_NAME = `sogni-photobooth-v${CACHE_VERSION}`;
const STATIC_CACHE_NAME = `sogni-photobooth-static-v${CACHE_VERSION}`;

// Assets that are safe to cache long-term (rarely change)
const CACHEABLE_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
  '/polaroid-camera.png',
  '/slothicorn-camera.png'
];

// Install event - cache only static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker installing (INTELLIGENT CACHE MODE)...');
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      console.log('Caching static assets that rarely change');
      return cache.addAll(CACHEABLE_ASSETS);
    })
  );
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches but keep current static cache
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating (CLEANING OLD CACHES)...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  // Take control immediately
  self.clients.claim();
});

// Fetch event - intelligent caching strategy
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip API requests - let them go to network normally
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('/sogni/') || 
      event.request.url.includes('/health')) {
    return;
  }

  // Let external requests (Google Fonts, etc.) go to network normally
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  const url = new URL(event.request.url);
  
  // NEVER cache JavaScript and CSS files (they contain theme updates)
  if (url.pathname.endsWith('.js') || 
      url.pathname.endsWith('.css') || 
      url.pathname.includes('assets/index-') ||
      url.pathname.includes('assets/css/') ||
      url.pathname.includes('assets/js/')) {
    console.log('Bypassing cache for JS/CSS file:', url.pathname);
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
    );
    return;
  }

  // ALWAYS fetch fresh events theme config to reflect newly deployed themes
  if (url.pathname === '/events/config.json') {
    console.log('Bypassing cache for events theme config:', url.pathname);
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
    );
    return;
  }

  // Handle navigation requests (including start_url)
  if (event.request.mode === 'navigate') {
    console.log('Handling navigation request:', url.pathname);
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() => {
        // If network fails, return cached version or offline page
        return caches.match('/') || new Response('Offline - Please check your internet connection', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
    );
    return;
  }

  // NEVER cache HTML files (they reference the JS/CSS)
  if (url.pathname.endsWith('.html') || url.pathname === '/') {
    console.log('Bypassing cache for HTML:', url.pathname);
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
    );
    return;
  }

  // NEVER cache mobile share pages to prevent stale cross-user content
  if (url.pathname.startsWith('/mobile-share/')) {
    console.log('Bypassing cache for mobile share page:', url.pathname);
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
    );
    return;
  }

  // For everything else, use cache-first strategy
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        console.log('Serving from cache:', url.pathname);
        return cachedResponse;
      }

      // Not in cache, fetch from network and cache for next time
      return fetch(event.request).then((response) => {
        // Don't cache non-successful responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Cache the response for future use
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(() => {
        // If network fails for navigation requests, return offline message
        if (event.request.mode === 'navigate') {
          return new Response('Offline - Please check your internet connection', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        }
        throw new Error('Network unavailable');
      });
    })
  );
});

// Handle background sync for photo uploads when back online
self.addEventListener('sync', (event) => {
  console.log('Background sync event:', event.tag);
  // Background sync functionality can be added here if needed
});