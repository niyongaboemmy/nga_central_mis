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
const AGENDA_KEY = "/__nga/agenda.json";

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
  try {
    const res = await fetch(`${agendaSource.apiBase}/reminders/agenda?days=2`, {
      headers: { Authorization: `Bearer ${agendaSource.token}` },
    });
    if (!res.ok) return;
    const cache = await caches.open(APP_CACHE);
    await cache.put(AGENDA_KEY, new Response(await res.text(), { headers: { "Content-Type": "application/json" } }));
  } catch (e) {
    /* offline: keep the last copy */
  }
};

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "nga:agenda-source" && msg.apiBase && msg.token) {
    agendaSource = { apiBase: msg.apiBase, token: msg.token };
  }
  if (msg.type === "nga:agenda-cache" && msg.body) {
    event.waitUntil(
      caches
        .open(APP_CACHE)
        .then((cache) => cache.put(AGENDA_KEY, new Response(msg.body, { headers: { "Content-Type": "application/json" } }))),
    );
  }
  if (msg.type === "nga:skip-waiting") self.skipWaiting();
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "nga-agenda") event.waitUntil(refreshAgenda());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname === AGENDA_KEY) {
    event.respondWith(
      caches
        .open(APP_CACHE)
        .then((c) => c.match(AGENDA_KEY))
        .then((hit) => hit || new Response("null", { status: 404, headers: { "Content-Type": "application/json" } })),
    );
  }
});
