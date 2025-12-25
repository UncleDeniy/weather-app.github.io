/* WeatherVision service worker */
const CACHE_VERSION = 'wv-v4';
const APP_SHELL = [
  './',
  './index.html',
  './widget.html',
  './assets/styles.css',
  './assets/widget.css',
  './assets/app.js',
  './assets/ui.js',
  './assets/widget.js',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(APP_SHELL);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

function isApi(url) {
  return url.origin === 'https://api.open-meteo.com' ||
         url.origin === 'https://air-quality-api.open-meteo.com' ||
         url.origin === 'https://geocoding-api.open-meteo.com';
}

function isCacheableResponse(res) {
  // Avoid caching partial/range responses (status 206) — Cache.put doesn't support them
  if (!res) return false;
  if (res.status === 206) return false;
  if (!res.ok) return false;
  if (res.headers && res.headers.get('content-range')) return false;
  return true;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const fresh = await fetch(request);
    if (request.method === 'GET' && !request.headers.has('range') && isCacheableResponse(fresh)) {
      await cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: false });
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request, { ignoreSearch: false });
  if (cached) return cached;
  const fresh = await fetch(request);
  if (request.method === 'GET' && !request.headers.has('range') && isCacheableResponse(fresh)) {
    await cache.put(request, fresh.clone());
  }
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Navigation: network-first, fallback to cached shell
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_VERSION);
        if (isCacheableResponse(fresh)) {
          await cache.put('./index.html', fresh.clone());
        }
        return fresh;
      } catch {
        const cache = await caches.open(CACHE_VERSION);
        return (await cache.match('./index.html')) || (await cache.match('./'));
      }
    })());
    return;
  }

  // API: network-first (fresh data), fallback to cache
  if (isApi(url)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Everything else: cache-first
  event.respondWith(cacheFirst(req));
});
