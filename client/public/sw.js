// The service worker exists for two reasons only: Chrome will not offer to
// install a site without one, and a home-screen launch should open something
// rather than a network error when the phone is offline. It is deliberately
// not an offline cache for library data — lib/staleCache.ts already keeps the
// last payload for that, and a second cache of the same thing would just be
// another way for the two to disagree.
const VERSION = "v1";
const SHELL = `astro-hub-shell-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.add("/")).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  // Pages: network first, so the app updates the moment a deploy lands. The
  // cached copy is the offline fallback, never the default answer.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached || Response.error()))
    );
    return;
  }

  // Build assets carry a content hash in their name, so a hit is never stale
  // and cache-first makes the second launch open instantly.
  if (new URL(request.url).pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
  }
});
