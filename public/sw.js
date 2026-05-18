// Rollo service worker — network-first with cache fallback.
// Bump CACHE_NAME (e.g. 'rollo-v2') when you change cached assets so old
// clients re-fetch on next visit.
const CACHE_NAME = 'rollo-v2';
const PRECACHE_URLS = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only GETs are safe to cache; let everything else (POST, PATCH, OPTIONS) pass through.
  if (req.method !== 'GET') return;
  // Never intercept Supabase / Next API calls — keep the network path authoritative.
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co') || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Mirror successful GETs to cache for offline fallback.
        if (res.ok && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached ?? Response.error())),
  );
});
