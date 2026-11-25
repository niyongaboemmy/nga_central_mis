/* E-learning service worker (ELEARNING_MODULE_IMPLEMENTATION_PLAN.md Phase 5).
 * - App shell + built assets: cache-first (they are content-hashed).
 * - Learner API GETs (/elearning/my/*, /lesson-notes/shared-with-me/*): stale-while-revalidate,
 *   so the last-opened course and items still open with no signal; progress writes are queued
 *   by the page itself (see src/components/elearning/learner/offline.ts), never by this worker.
 * - The learner API cache is keyed by school + person (WEB-ISO-8): the key carries
 *   `t<tid>.u<uid>` read from the request's own token, so a shared browser never hands
 *   one learner's cached pages to the next. No identity on the request = network only.
 *   lib/tenant.ts also drops this cache when the signed-in identity changes.
 */
const VERSION = "elearning-v2";
const SHELL = `${VERSION}-shell`;
const API = `${VERSION}-api`;
const API_PATHS = ["/elearning/my/", "/lesson-notes/shared-with-me/", "/lesson-notes/images/"];
// A note's PDF file, which learners read offline. Deliberately NOT every "/lesson-notes/..."
// path: that also matched the teacher's own note detail, so the editor could open on the
// copy from its last visit and autosave over newer work, and "Edit details" re-read the
// pre-save note. Teacher authoring GETs always go to the network.
const NOTE_PDF = /^\/lesson-notes\/\d+\/pdf\/raw$/;

/** `t<tid>.u<uid>` from the request's JWT (Bearer, else ?token=), or null. Not a check of the token: the server does that. */
const identityOf = (req, url) => {
  let token = null;
  const h = req.headers.get("Authorization") || "";
  if (h.startsWith("Bearer ")) token = h.slice(7).trim();
  if (!token) token = url.searchParams.get("token");
  if (!token) return null;
  try {
    const part = token.split(".")[1] || "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(b64 + "===".slice((b64.length + 3) % 4)));
    const uid = Number(claims.userId);
    const tid = Number(claims.tid ?? claims.tenant_id ?? 0);
    return Number.isInteger(uid) && uid > 0 && Number.isInteger(tid) && tid >= 0 ? `t${tid}.u${uid}` : null;
  } catch (e) {
    return null;
  }
};

/** The cache key: the URL without its token, plus the identity. */
const keyFor = (url, id) => {
  const u = new URL(url.href);
  u.searchParams.delete("token");
  u.searchParams.set("__nga_id", id);
  return new Request(u.href);
};

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

  // Standalone public pages (privacy policy, terms) are not the app shell:
  // let the browser load them untouched, and never cache them as "/".
  if (url.origin === self.location.origin && /^\/(privacy|terms)(\/|\/index\.html)?$/.test(url.pathname)) return;

  // Navigations: network, falling back to the cached shell.
  if (req.mode === "navigate") {
    // Always revalidate the page with the server (the HTML used to be served
    // without cache headers, so a plain fetch could hand back an old release).
    event.respondWith(fetch(req, { cache: "no-cache" }).then((res) => { caches.open(SHELL).then((c) => c.put("/", res.clone())); return res; }).catch(() => caches.match("/")));
    return;
  }

  // Learner API: stale-while-revalidate keyed by URL + school + person (WEB-ISO-8).
  if ((API_PATHS.some((p) => url.pathname.startsWith(p)) || NOTE_PDF.test(url.pathname)) && !url.pathname.endsWith("/heartbeat")) {
    const id = identityOf(req, url);
    if (!id) return; // identity unknown: straight to the network, nothing cached
    const key = keyFor(url, id);
    event.respondWith(
      caches.open(API).then(async (cache) => {
        const cached = await cache.match(key);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(key, res.clone());
            return res;
          })
          .catch(() => null);
        return cached || (await network) || new Response(JSON.stringify({ success: false, message: "offline" }), { status: 503, headers: { "Content-Type": "application/json" } });
      }),
    );
  }
});
