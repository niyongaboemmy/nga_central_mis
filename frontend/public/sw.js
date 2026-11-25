/* NGA app service worker (REMINDERS_SOLUTION_PROPOSAL.md §6.1, §7).
 *
 * One worker per origin controls scope "/", so this file is the only one the
 * app registers. It pulls in the e-learning offline cache (elearning-sw.js,
 * unchanged) and adds what the installable NGA app needs:
 *   - push      -> show the reminder (Declarative Web Push payload shape)
 *   - actions   -> "Got it" / "Snooze 5 min" straight from the notification
 *   - click     -> focus an open NGA window or open the deep link
 *   - pushsubscriptionchange -> tell open pages to re-subscribe
 *   - periodicsync / message -> keep today's agenda cached for offline "Now & Next"
 */
importScripts("/elearning-sw.js");

const APP_CACHE = "nga-app-v1";
const SW_VERSION = "nga-sw-v2";

// When this version takes over, refresh open tabs sitting on a safe landing
// page so they run the current release at once (an old page could be reused
// from the HTTP cache before the HTML got no-cache headers). Pages where
// someone could be mid-task are never reloaded.
const SAFE_TO_REFRESH = new Set(["/", "/home", "/dashboard", "/login", "/reminders", "/apps"]);
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const windows = await self.clients.matchAll({ type: "window" });
      // Deliberately NOT awaited: the reload's own page request is held until
      // this activation finishes, so waiting for it here would deadlock the
      // worker in "activating" (seen in testing).
      windows.forEach((client) => {
        try {
          const url = new URL(client.url);
          if (url.origin !== self.location.origin || !SAFE_TO_REFRESH.has(url.pathname)) return;
          if ("navigate" in client) client.navigate(client.url).catch(() => null);
        } catch (e) {
          /* ignore */
        }
      });
    })(),
  );
});
// The offline agenda is one person's data (WEB-ISO-7): it lives in its own cache,
// keyed by school + person (`?id=t<tid>.u<uid>`), and the page drops that cache
// whenever the signed-in identity changes ("nga:agenda-clear", lib/tenant.ts).
const AGENDA_PATH = "/__nga/agenda.json";
const AGENDA_CACHE = "nga-agenda-v1";
const agendaKey = (id) => `${AGENDA_PATH}?id=${encodeURIComponent(id)}`;
const validId = (id) => typeof id === "string" && /^t\d+\.u\d+$/.test(id);
// Older workers kept one unkeyed agenda in the shared app cache: drop it.
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.delete(AGENDA_PATH)).catch(() => null));
});

const showFromPayload = async (payload) => {
  const n = (payload && payload.notification) || {};
  const data = n.data || {};
  const title = n.title || "NGA reminder";
  const critical = Boolean(data.critical);
  const options = {
    body: n.body || "",
    tag: n.tag || undefined,
    renotify: Boolean(n.tag),
    lang: n.lang || "en",
    dir: n.dir || "ltr",
    icon: "/android-chrome-192x192.png",
    badge: "/badge-96x96.png",
    timestamp: data.eventStart ? Date.parse(data.eventStart) : Date.now(),
    requireInteraction: critical,
    vibrate: critical ? [200, 100, 200, 100, 300] : [120, 60, 120],
    data: { ...data, url: data.url || n.navigate || "/reminders" },
    actions:
      data.ackUrl && data.kind !== "test"
        ? [
            { action: "ack", title: "✅ Got it" },
            { action: "snooze", title: "⏰ Snooze 5 min" },
          ]
        : Array.isArray(data.actions)
          ? data.actions.slice(0, 2).map((a) => ({ action: String(a.action), title: String(a.title) }))
          : [],
  };
  await self.registration.showNotification(title, options);
  // Tell open pages so the bell / Now & Next refresh without polling.
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((c) => c.postMessage({ type: "nga:reminder", data }));
};

self.addEventListener("push", (event) => {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch (e) {
    payload = { notification: { title: "NGA", body: event.data ? event.data.text() : "" } };
  }
  event.waitUntil(showFromPayload(payload));
});

const post = (url) =>
  fetch(url, { method: "POST", mode: "cors", credentials: "omit", keepalive: true }).catch(() => null);

const openOrFocus = async (url) => {
  const target = new URL(url, self.location.origin);
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    const here = new URL(client.url);
    if (here.origin === target.origin) {
      await client.focus();
      if ("navigate" in client && here.href !== target.href) {
        try {
          await client.navigate(target.href);
        } catch (e) {
          client.postMessage({ type: "nga:navigate", url: target.pathname + target.search });
        }
      }
      return;
    }
  }
  await self.clients.openWindow(target.href);
};

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  event.notification.close();
  if (event.action === "snooze" && data.snoozeUrl) {
    event.waitUntil(post(data.snoozeUrl));
    return;
  }
  if (event.action === "ack" && data.ackUrl) {
    event.waitUntil(post(data.ackUrl));
    return;
  }
  // Signed one-tap actions (e.g. "Submit as is" on a Git report draft): POST, then confirm.
  const custom = Array.isArray(data.actions) ? data.actions.find((a) => a.action === event.action && a.url) : null;
  if (custom) {
    event.waitUntil(
      fetch(custom.url, { method: "POST", mode: "cors", credentials: "omit" })
        .then((r) => self.registration.showNotification(r.ok ? "Report submitted ✅" : "Couldn't submit", { body: r.ok ? "Your team lead has been told." : "Open the MIS to review it.", icon: "/android-chrome-192x192.png", badge: "/badge-96x96.png", data: { url: data.url } }))
        .catch(() => openOrFocus(data.url || "/")),
    );
    return;
  }
  // A tap on the body counts as "seen" too.
  event.waitUntil(Promise.all([data.ackUrl ? post(data.ackUrl) : null, openOrFocus(data.url || "/reminders")]));
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => clients.forEach((c) => c.postMessage({ type: "nga:resubscribe" }))),
  );
});

// ─── Offline agenda for "Now & Next" ─────────────────────────────────────────
// The page hands us its API base + token once (message "nga:agenda-source");
// periodic sync (installed Chromium apps) then refreshes the cached agenda.
let agendaSource = null;

const refreshAgenda = async () => {
  if (!agendaSource) return;
  const source = agendaSource;
  try {
    const res = await fetch(`${source.apiBase}/reminders/agenda?days=2`, {
      headers: { Authorization: `Bearer ${source.token}` },
    });
    if (!res.ok) return;
    // Someone else signed in meanwhile: never store under the new identity.
    if (agendaSource !== source) return;
    const cache = await caches.open(AGENDA_CACHE);
    await cache.put(agendaKey(source.id), new Response(await res.text(), { headers: { "Content-Type": "application/json" } }));
  } catch (e) {
    /* offline: keep the last copy */
  }
};

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "nga:agenda-source" && msg.apiBase && msg.token && validId(msg.id)) {
    agendaSource = { apiBase: msg.apiBase, token: msg.token, id: msg.id };
  }
  if (msg.type === "nga:agenda-cache" && msg.body && validId(msg.id)) {
    event.waitUntil(
      caches
        .open(AGENDA_CACHE)
        .then((cache) => cache.put(agendaKey(msg.id), new Response(msg.body, { headers: { "Content-Type": "application/json" } }))),
    );
  }
  // Sign-out / another person or school: forget the token and every cached agenda.
  if (msg.type === "nga:agenda-clear") {
    agendaSource = null;
    event.waitUntil(caches.delete(AGENDA_CACHE).catch(() => null));
  }
  if (msg.type === "nga:skip-waiting") self.skipWaiting();
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "nga-agenda") event.waitUntil(refreshAgenda());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname === AGENDA_PATH) {
    const id = url.searchParams.get("id");
    event.respondWith(
      (validId(id) ? caches.open(AGENDA_CACHE).then((c) => c.match(agendaKey(id))) : Promise.resolve(null))
        .then((hit) => hit || new Response("null", { status: 404, headers: { "Content-Type": "application/json" } })),
    );
  }
});
