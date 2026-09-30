/* E-learning service worker (ELEARNING_MODULE_IMPLEMENTATION_PLAN.md Phase 5).
 * - App shell + built assets: cache-first (they are content-hashed).
 * - Learner API GETs (/elearning/my/*, /lesson-notes/shared-with-me/*): stale-while-revalidate,
 *   so the last-opened course and items still open with no signal; progress writes are queued
 *   by the page itself (see src/components/elearning/learner/offline.ts), never by this worker.
 */
const VERSION = "elearning-v1";
const SHELL = `${VERSION}-shell`;
const API = `${VERSION}-api`;
const API_PATHS = ["/elearning/my/", "/lesson-notes/shared-with-me/", "/lesson-notes/images/", "/lesson-notes/"];

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("elearning-") && !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Built assets: cache-first.
  if (url.origin === self.location.origin && /\/assets\/.+\.(js|css|woff2?|png|svg)$/.test(url.pathname)) {
    event.respondWith(caches.open(SHELL).then(async (cache) => (await cache.match(req)) || fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })));
    return;
  }

  // Navigations: network, falling back to the cached shell.
  if (req.mode === "navigate") {
    // Always revalidate the page with the server (the HTML used to be served
    // without cache headers, so a plain fetch could hand back an old release).
    event.respondWith(fetch(req, { cache: "no-cache" }).then((res) => { caches.open(SHELL).then((c) => c.put("/", res.clone())); return res; }).catch(() => caches.match("/")));
    return;
  }

  // Learner API: stale-while-revalidate keyed by URL (the auth header is not part of the key —
  // the cache is per browser profile, which is per student on a personal phone).
  if (API_PATHS.some((p) => url.pathname.startsWith(p)) && !url.pathname.endsWith("/heartbeat")) {
    event.respondWith(
      caches.open(API).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);
        return cached || (await network) || new Response(JSON.stringify({ success: false, message: "offline" }), { status: 503, headers: { "Content-Type": "application/json" } });
      }),
    );
  }
});
