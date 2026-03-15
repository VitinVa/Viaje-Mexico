// Trip Together · México 2025
// Service Worker - Offline PWA Support
const CACHE_NAME = 'trip-together-v1';
const CACHE_URLS = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap',
];

// Firebase & Cloudinary CDN resources to cache
const CDN_CACHE = 'trip-together-cdn-v1';
const CDN_PATTERNS = [
  'gstatic.com/firebasejs',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// ── INSTALL: Cache core app shell ──
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching app shell');
      return cache.addAll(CACHE_URLS).catch(err => {
        console.warn('[SW] Some cache failed:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: Clean old caches ──
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== CDN_CACHE)
            .map(k => { console.log('[SW] Deleting old cache:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: Cache-first for app, network-first for Firebase ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if(event.request.method !== 'GET') return;

  // Skip Firebase Realtime Database requests (always need network for real-time sync)
  if(url.hostname.includes('firebaseio.com')) return;

  // Skip Cloudinary uploads
  if(url.hostname.includes('cloudinary.com') && url.pathname.includes('/upload')) return;

  // CDN resources (Firebase SDK, fonts) - cache first, then network
  const isCDN = CDN_PATTERNS.some(p => url.href.includes(p));
  if(isCDN) {
    event.respondWith(
      caches.open(CDN_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if(cached) return cached;
          return fetch(event.request).then(response => {
            if(response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // App shell - cache first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if(cached) {
        // Return cached, but refresh in background
        fetch(event.request).then(response => {
          if(response && response.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, response));
          }
        }).catch(() => {});
        return cached;
      }
      // Not cached - try network
      return fetch(event.request).then(response => {
        if(response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Complete offline fallback - return cached index.html
        if(event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── BACKGROUND SYNC (future enhancement) ──
self.addEventListener('sync', event => {
  if(event.tag === 'sync-queue') {
    console.log('[SW] Background sync triggered');
    // The actual sync is handled in the main app via flushQueue()
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SYNC_QUEUE' }));
      })
    );
  }
});

// Listen for messages from app
self.addEventListener('message', event => {
  if(event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
