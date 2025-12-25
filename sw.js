/* WeatherVision service worker */
const CACHE_VERSION = 'wv-v3';
const APP_SHELL = [
  './',
  './index.html',
  './assets/styles.css',
  './assets/app.js',
  './assets/ui.js',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
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

function isApi(url){
  return url.origin === 'https://api.open-meteo.com' ||
         url.origin === 'https://air-quality-api.open-meteo.com' ||
         url.origin === 'https://geocoding-api.open-meteo.com';
}

async function networkFirst(request){
  const cache = await caches.open(CACHE_VERSION);
  try{
    const fresh = await fetch(request);
    // Cache successful GET responses
    if(request.method === 'GET' && fresh && fresh.ok){
      cache.put(request, fresh.clone());
    }
    return fresh;
  }catch(err){
    const cached = await cache.match(request, { ignoreSearch:false });
    if(cached) return cached;
    throw err;
  }
}

async function cacheFirst(request){
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request, { ignoreSearch:false });
  if(cached) return cached;
  const fresh = await fetch(request);
  if(request.method === 'GET' && fresh && fresh.ok){
    cache.put(request, fresh.clone());
  }
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);

  // Navigation: try network, fallback to cached shell
  if(req.mode === 'navigate'){
    event.respondWith((async () => {
      try{
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_VERSION);
        cache.put('./index.html', fresh.clone());
        return fresh;
      }catch{
        const cache = await caches.open(CACHE_VERSION);
        return (await cache.match('./index.html')) || (await cache.match('./'));
      }
    })());
    return;
  }

  // API: network-first (fresh data), fallback to cache
  if(isApi(url)){
    event.respondWith(networkFirst(req));
    return;
  }

  // Everything else: cache-first
  event.respondWith(cacheFirst(req));
});
