const CACHE_NAME = 'erd-builder-cache-v1.2'; // Update version
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/favicon.png',
  '/manifest.webmanifest',
  '/icons/icon-192x192-any.svg',
  '/icons/icon-512x512-any.svg',
];

// Install Event: Precaching core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(asset => cache.add(asset))
      );
    })
  );
  self.skipWaiting();
});

// Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/')) return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  // STRATEGY: Network-First with Offline Fallback for Navigation (SPA Support)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // If network fails (offline), provide index.html from cache
          // This allows React Router to handle the route client-side
          return caches.match('/index.html') || caches.match('/');
        })
    );
    return;
  }

  // STRATEGY: Stale-While-Revalidate for other assets (images, fonts, etc)
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchedResponse = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse || fetchedResponse;
      });
    })
  );
});
