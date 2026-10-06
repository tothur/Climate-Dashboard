const CACHE_NAME = "climate-dashboard-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./earthicon.svg",
  "./earthicon.png",
  "./favicon-32.png",
  "./pwa-192.png",
  "./pwa-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(cacheNames.filter((cacheName) => cacheName !== CACHE_NAME).map((cacheName) => caches.delete(cacheName)))
      )
      .then(() => self.clients.claim())
  );
});

// Only successful same-origin responses are worth keeping: caching a 404 or
// 500 would replay that error offline.
function isCacheable(response) {
  return response && response.ok && response.type === "basic";
}

// Data files are versioned with ?v=<token>; keep only the newest version of
// each path so superseded chunks don't pile up in the cache forever.
async function putLatestVersion(request, response) {
  const cache = await caches.open(CACHE_NAME);
  await cache.delete(request, { ignoreSearch: true });
  await cache.put(request, response);
}

// Hashed build assets change name on every deploy. Once a fresh index.html
// arrives, drop cached assets it no longer references.
async function pruneStaleAssets(indexResponse) {
  const html = await indexResponse.text();
  const referenced = new Set();
  for (const match of html.matchAll(/assets\/[\w.-]+/g)) {
    referenced.add(new URL(`./${match[0]}`, self.registration.scope).pathname);
  }
  if (!referenced.size) return;

  const cache = await caches.open(CACHE_NAME);
  for (const cachedRequest of await cache.keys()) {
    const { pathname } = new URL(cachedRequest.url);
    if (pathname.includes("/assets/") && !referenced.has(pathname)) {
      await cache.delete(cachedRequest);
    }
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheable(response)) {
            const copy = response.clone();
            const pruneCopy = response.clone();
            event.waitUntil(
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put("./index.html", copy))
                .then(() => pruneStaleAssets(pruneCopy))
            );
          }
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  const isRuntimeData = url.pathname.includes("/data/");
  if (isRuntimeData) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheable(response)) {
            event.waitUntil(putLatestVersion(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Hashed build assets never change: cache first.
  if (url.pathname.includes("/assets/")) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((response) => {
          if (isCacheable(response)) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
          }
          return response;
        });
      })
    );
    return;
  }

  // Unhashed files (manifest, icons): serve from cache, refresh in the background.
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const network = fetch(request).then((response) => {
        if (isCacheable(response)) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      });
      if (cachedResponse) {
        event.waitUntil(network.catch(() => undefined));
        return cachedResponse;
      }
      return network;
    })
  );
});
