# Platform Usage Analytics & Live Monitoring — Implementation Plan (v2)

**Revised:** 2026-10-01 (v1: 2026-10-01, earlier the same day)
**Scope:**
- **MIS (`nga_central_mis`):** the central MIS hosts the collector, live presence, IP intelligence, storage, reports and the admin console.
- **Satellites:** each app gets a vendored tracker plus a server relay: `nga-task-mentor` (TM), `nga-discipline-attendance` (Tendo) and `nga-communication-module` (Tupo).

**Audience:** developers and Claude Code sessions implementing it. Paths are relative to `/Users/m2pro/dev/projects/nga-mis-full/`.

**Depends on:**
- [`ACCESS_LEVELS_RBAC_IMPLEMENTATION_PLAN.md`](./ACCESS_LEVELS_RBAC_IMPLEMENTATION_PLAN.md), for capabilities, presets and `requireCapability`.
- `docs/SINGLE_SIGN_OUT.md`, for `token_version` and `notifyLogout`, which "sign out everywhere" reuses.

**Builds on:**
- the e-learning live presence engine (`backend/src/services/elearning/livePresence.ts` and the SSE hook `useCourseLive.ts`);
- the service-credential ingest pattern (`middleware/serviceAuth.ts`, `/access/audit`, `/reminders/sources`);
- the vendored-package pattern (`packages/access/sync.mjs`);
- the Reminder Hub delivery channels (`services/reminders/webPush.ts`, `channels.ts`).

> **Status check (2026-10-01):**
> - Build from **`origin/main`** (MIS f2ff93ff, TM 8c27b6d, Tendo 422731a, Tupo 3a87347).
> - The MIS main checkout is on `feat/access-control-v2`, 73 commits behind, and holds someone else's uncommitted work. **Do not switch branches there.** Use a worktree. The satellite `-pwa` folders already match `origin/main`.
> - The next MIS migration is **095**.
> - Nothing like this exists yet. Only Tupo has chat presence (Redis TTL), and only the MIS has per-course e-learning presence (in memory). No app stores a real client IP, because three of the four backends see `127.0.0.1` (§2.3).

---

## 0. Decision record and what changed from v1

The decisions below were made by the product owner on 2026-10-01.

| # | Question | Decision | Effect on the design |
|---|---|---|---|
| D1 | Who is monitored individually? | **All user types, including public visitors**, through their IP address and location | Students, parents, staff and admins all have a User 360 page. **Public visitors** (no account) are tracked per device with full IP and IP-derived location, and have a **Visitor 360** page (§6, §10). Public pages run the full tracker, not v1's anonymous counter. |
| D2 | Is a watched person told about the watch? | **Yes** | Creating a watch notifies the person in the app and by push. Their **My activity** page shows the watch: who set it, why, and until when. Revoking or expiring it notifies them again. **There is no confidential or covert watch** (§10.4). |
| D3 | Which IP addresses are recorded? | **All IP addresses** | The **full IPv4/IPv6 address** is stored on every event, session, login attempt and visitor, for every user type. v1's /24 truncation is gone. "On campus" becomes an optional label from configured ranges, not a filter (§7). |
| D4 | Public visitor counting (v1 §5.6) | Superseded by D1 | Public visitors are fully tracked (§6). |
| D5 | Leadership adoption widgets | Default kept: aggregate Insights widgets, no names | §11 |
| D6 | Retention | Defaults kept; see §13.5 | Raw events 13 months, sessions, IP and location 25 months, rollups 5 years |

**Other v1 → v2 changes found by deeper analysis:**

| v1 | v2 |
|---|---|
| Public pages were optional, anonymous and counted only | A first-class **Visitor** entity (device), with IP, geo, ISP, bot score and a timeline. On sign-in the device is **stitched** to the account (§6.4). |
| No location | **IP intelligence** (§7): an offline GeoIP plus ASN database (country, region, city, coordinates, ISP, mobile/fixed/hosting), a **Locations** report with a map, **IP lookup**, per-user IP history, and **optional precise browser location** behind a setting (§7.5). |
| The collector accepted authenticated traffic only | **Anonymous ingest** is hardened (§5.6): origin allowlist, signed device token, per-IP rate limits, an event-type allowlist, and bot scoring (§8). |
| Service auth with `activity:write` | `requireServiceToken` **grants any ACTIVE System whatever scope it asks for** (`serviceAuth.ts` `clientCredentials`). Writers are therefore pinned by an allowlist (`ACTIVITY_SOURCE_CLIENTS`) and must map to the batch's app (§5.3). |
| Dedupe by `event_id` UNIQUE | A partitioned table's PK must include the partition column, so `event_id` alone cannot be unique. v2 uses **deterministic `occurred_at` plus a 48 h in-memory dedupe set** (§5.3). |
| Body limits "≤256 kB" | MIS parses JSON globally at 30 MB (`app.ts:54`). The `/activity` router is **mounted before** the global parser with its own 256 kB `json` and `text` parsers (sendBeacon sends `text/plain`). |
| Trust proxy on MIS only | **Tendo and Tupo also lack `trust proxy`**, so every request looks like `127.0.0.1` there. That also means **Tupo's guest-join rate limit (`meet.ts:61`) is one global bucket for all guests**. It is fixed in Phase 0. TM already has `trust proxy 1`. |
| Watch could be "confidential" | Removed (D2). |
| 5 phases, ≈6½ weeks | 7 phases, **≈8 weeks** (§17) |

---

## 1. Problem and outcome

A system administrator must be able to answer the following from one place, for the MIS **and** the three apps:

| Question | Answered on (§9) |
|---|---|
| Who is online right now (signed-in users **and** public visitors), in which app, feature and page, and where from? | **Realtime** |
| Who accessed the platform today, this week and this month, and how often? | **Access & Logins**, **Audience** |
| How much is each app and feature used, and is usage growing? | **Overview**, **Engagement**, **Apps** |
| Who has stopped using it, or never started (adoption)? | **Audience → Dormant / Never signed in** |
| Do people come back (retention)? | **Retention** |
| From where (country, city, ISP, on campus or off), on which networks and IPs? | **Locations**, **IP lookup** |
| Which devices and browsers, installed PWA or tab? | **Technology** |
| Who are the public visitors, what did they look at, and did they try to sign in? | **Visitors** + **Visitor 360** |
| Everything a specific person did, live and historically, with controls to act | **User 360** |
| Tell me when a specific person comes online, opens something, or signs in from somewhere new | **Watchlist & Alerts** |

**Population (D1):**
- **Known users:** MIS accounts of type STUDENT, TEACHER, STAFF, ADMIN and PARENT. Every app SSOs from MIS, and the MIS `user_id` is the identity.
- **Public visitors:** anyone without a session. They reach:
  - **MIS:** `/`, `/about`, `/contact`, `/login`, `/password-recovery`, `/verify/:schemeId`, `/apps`, `/privacy`, `/terms`
  - **TM:** `/login`
  - **Tendo:** `/`
  - **Tupo:** `/` (sign-in) and the guest meeting `/meet/:idOrCode`
  - **all apps:** `/sso/callback`

  A visitor is identified by the device cookie plus IP. A Tupo meeting guest also has a **self-declared display name**.

**Non-goals (kept out deliberately):**
- **Content capture:** session replay, screenshots, keystrokes, form or input values, message or mail content, and search text.
- **Tracking outside NGA sites:** none.
- **Covert surveillance:** every watch is visible to the person watched (D2).

---

## 2. Research basis

### 2.1 How Google Analytics 4 works: what we copy and what we change

| GA4 concept | GA4 behaviour | Our equivalent |
|---|---|---|
| **Event model** | Everything is an event (`event_name` ≤40 chars, ≤25 params). There are no hit types. | Same: `AnalyticsEvent(name, params JSON)` |
| **Auto events** | `page_view` (also on SPA history change), `session_start`, `first_visit`, `user_engagement` (≥1 s in focus). Enhanced measurement adds `scroll` at 90%, outbound `click`, `file_download`, `form_start`/`form_submit` and `view_search_results`. | **Client:** `page_view`, `user_engagement`, `scroll` (90%, once per page), `click` (opt-in `data-track` and outbound links), `file_download`, `form_submit` (form id only, **never values**), `search` (result count only), `js_error`, `web_vital`. **Server-derived:** `session_start`, `first_visit` and `login_*` |
| **Identity** | `client_id` (the `_ga` device cookie) plus an optional `user_id`; "blended" reporting identity | `device_id` is one first-party cookie, `nga_did`, on `.amashuri.com`, **shared by all four apps**. It identifies visitors. The MIS `user_id` is **attested by a server**, never claimed by the browser. |
| **Pre-login stitching** | Events earlier in the same session are associated with `user_id` after sign-in. | The same session is stitched, and the device's **whole prior visitor history** is linked to the account (§6.4). |
| **Session** | Starts when there is no active session. Ends after **30 min** of inactivity (configurable from 5 min to 7 h 55 min). **No** midnight cut, and no cut on a campaign change. | Same rules, but **sessionised on the server**, keyed on `device_id`. A session spans apps, and a **change of user** starts a new session. |
| **Engaged session** | Lasts >10 s (configurable 10–60 s), or has ≥2 page views, or a key event | Same, configurable |
| **Engagement time** | Time with the page visible **and** focused, sent as `engagement_time_msec` on hide or navigation. Flushes on unload are lossy (about 40% loss reported). | Same timer, plus an idle cut-off. It also rides on **every 30 s heartbeat**, so a lost unload costs at most 30 s. |
| **Metrics** | Active users (engaged), total users, new users, returning users, DAU/WAU/MAU (rolling 1/7/28 days), DAU/MAU stickiness, views per user, average engagement time, engagement rate, bounce rate = 1 − engagement rate, event count, key events | Identical definitions (§8.2), plus **adoption against the eligible roster**, which GA cannot compute |
| **Realtime** | Active users over the last 30 min (per-minute bars) and the last 5 min; cards for page, event, source, audience and country/city; user snapshot | Same cards, **a live map**, and a **named roster of people online now** (users and visitors) with live page, feature, IP, location and actions |
| **Standard reports** | Acquisition, Engagement (events, pages, landing pages), Retention (new vs returning, cohorts), Tech (browser, OS, device, resolution), **Demographics / geo from IP** | Engagement; Apps (our "acquisition": entry app and entry kind, plus referrer for public pages); Retention cohorts; Technology (also PWA vs tab, release, web vitals and errors); **Locations** (country, region, city, ISP, connection type, campus vs off-campus) |
| **Explorations** | Free-form, funnel (≤10 steps, open or closed), path (forward or backward), cohort, segment overlap, **User Explorer** | Funnel, path and cohort (Phase 6); **User 360 / Visitor 360** (User Explorer plus controls) |
| **Comparisons** | ≤4 comparison sets | Compare by app, user type, programme, grade, class group, role, country/city and network. These come from MIS data joined at query time, with no custom dimensions to configure. |
| **Key events** | ≤30 marked events | `key_event: true` in the feature catalog |
| **Transport** | `sendBeacon`/fetch to `/g/collect`, batched. Measurement Protocol for server events (≤25 events per request, backdating ≤72 h) | Batched JSON over `fetch(keepalive)` with a `sendBeacon` fallback. Satellites relay server-to-server. Server events are written directly. Backdating is clamped at 72 h. |
| **IP / geo** | **GA4 does not store IP addresses.** It derives geo at collection time. | **We store the full IP (D3)** and derive geo and ASN offline at ingest. No third-party lookup service ever sees our users' IPs (§7). |
| **Retention / deletion** | Event data 2/14/26 months; per-user deletion | Raw events 13 months (monthly partitions dropped); per-user and per-visitor export and delete |
| **Bot filtering** | Known bots always excluded | UA list, `navigator.webdriver`, hosting-ASN, rate and behaviour scoring. Bots are **flagged, not dropped**, are excluded from reports, and stay reviewable under Visitors (§8). |
| **Internal traffic** | IP-rule data filters | "Excluded accounts" plus **network labels** (campus or office ranges), which label traffic rather than drop it (D3) |
| **Time zone** | Reporting zone; UTC storage | UTC `DATETIME(3)` storage, with days bucketed in **Africa/Kigali** (UTC+2, no DST) |

### 2.2 Current code: what we reuse (MIS `origin/main`)

- **Stack:**
  - Express 4 + TS (CommonJS) on Drizzle 0.29 / MySQL 8.
  - Hand-written idempotent migrations `backend/migrations/NNN_*.sql`; the latest is **094**. Migrations are applied by `migrate.yml` or piped into `mysql` in production. **Deploys never run migrations.**
  - Validation uses `validator` only (there is **no zod**). This plan adds `zod` (small, already used by Tupo).
- **Runtime:**
  - **One pm2 process** (`mis-backend`, fork mode) and **no Redis**, so in-memory presence is valid, as in `livePresence.ts`.
  - Jobs are `setInterval` calls in `backend/src/index.ts`.
- **Realtime:** SSE only (`courseAnalyticsController.ts`, `GET /elearning/courses/:id/live`), with `X-Accel-Buffering: no` and `retry: 5000`. nginx `api.amashuri.com` has `proxy_read_timeout 3600s` and already sets `X-Real-IP` and `X-Forwarded-For`.
- **Auth:**
  - `authenticate` (`middleware/auth.ts`) reads `token_version` **and** `getEffectivePermissions` from the DB on every request. That is too heavy for heartbeats (see §5.3).
  - The 24 h JWT lives in `localStorage.token`.
  - `logout` bumps `token_version` and then calls `notifyLogout(userId)`.
- **Service auth:**
  - `requireServiceToken(scope)` accepts an `IntegrationToken` (Bearer, scoped) **or** an ACTIVE System's `client_id:secret` (Basic). In the Basic case it grants exactly the requested scope.
  - Existing per-route writer allowlists: `REMINDERS_SOURCE_CLIENTS` (`reminderController.ts:444`) and `ACCESS_APP_CLIENTS` (`access/apps.ts`, which maps `tm=taskmentor_app,da=discipline_attendance,tupo=tupo`).
- **Traces we can backfill from:**
  - `ActivityLog` `LOGIN_SUCCESS` rows (no IP or UA)
  - `SSOCode` (one row per app hand-off)
  - `PushSubscription` (UA, platform, installed, `last_seen_at`)
  - There is no last-login, last-seen, login-history or failed-login table.
- **Frontend:**
  - React 18, Vite, Tailwind, react-router 7. Routes are in `frontend/src/App.tsx`, with public pages wrapped in `PublicRoute`. Navigation is `components/ui/Sidebar.tsx` `navItems`.
  - Libraries: recharts 3.6, date-fns 4, axios `services/api.ts`. There is **no map library**; this plan adds `leaflet` in a lazy chunk.
  - UI building blocks: `ui/Modal`, `useConfirm`, `ToastContext`.
- **RBAC v2:**
  - Capabilities are declared in `backend/src/access/manifest.ts` (`SYSTEM` domain, `SCHOOL_ONLY`).
  - v2-only names go in `access/v2Only.ts`.
  - Presets: `platform_owner` (SUPER_ADMIN, ≤2 holders) and `it_support`.
  - Guards: `requireCapability` on the server, `useAccess().can()` in the client.
- **Hosting:** AWS EC2 **eu-north-1 (Stockholm)**, `13.48.142.192`. This matters for §13.

### 2.3 Gaps found while planning (all fixed in Phase 0)

| # | Gap | Evidence | Fix |
|---|---|---|---|
| G1 | MIS has no `trust proxy`, so `req.ip` is always `127.0.0.1` | `app.ts` has no `app.set('trust proxy')` | `app.set('trust proxy', 'loopback')` |
| G2 | Tendo and Tupo have no `trust proxy` either | grep finds it only in TM `server/src/index.ts:64` | Same fix in `nga-discipline-attendance/server/src/app.ts` and `nga-communication-module/apps/api/src/app.ts` |
| G3 | Tupo's guest-join limiter is effectively global | `meet.ts:61` keys on `req.ip`, which is always `127.0.0.1` | Fixed by G2; add a regression test |
| G4 | MIS request logger writes **full POST bodies, including passwords and OTPs**, to winston | `middleware/requestLogger.ts`, `body: req.method !== "GET" ? req.body` | Redact `password`, `otp`, `code`, `token`, `client_secret`, `refresh_token`. Never log `/activity/*` bodies. |
| G5 | `GET /users/:userId/activities` has no authorisation | `routes/users.ts` uses `authenticate` only | Allow self or `VIEW_ALL_LOGS_HISTORY` |
| G6 | MIS backend has no rate limiting at all | no `express-rate-limit` | Add a small in-memory token bucket for `/activity/*` and `/auth/login` (§5.6) |

### 2.4 Satellites (`origin/main`, identical to the `-pwa` folders)

| | Task Mentor | Tendo (D&A) | Tupo |
|---|---|---|---|
| Backend | Express + Sequelize/MySQL, `trust proxy 1` | Express + SQLite raw SQL, **no trust proxy** | Express + Drizzle/Postgres + Redis + a Socket.IO gateway, **no trust proxy** |
| SPA routing | `client/src/routes/routeConfig.tsx` `appRoutes` (labelled through `navItem.label`); public `/login` and `/sso/callback` | inline `<Route>`s in `client/src/App.tsx`; labels in `navConfig.tsx` and `searchCatalog.ts`; public `/` and `/sso/callback` | `/app/<module>/…` under `pages/AppShell.tsx`; public `/` (sign-in), `/sso/callback`, `/meet/:idOrCode` (guest) |
| Where to mount the tracker | inside `<Router>` in `client/src/App.tsx` (also covers the public and `noLayout` routes) | inside `<BrowserRouter>` in `client/src/App.tsx` (AuthProvider sits outside it) | in `App.tsx` inside the router, not in AppShell, **so the guest meeting and sign-in pages are covered** |
| MIS user id (client / server) | `user.mis_user_id` / `req.user.mis_user_id` | `user.id` / `req.user.id` | `user.misUserId` / session `misUserId` |
| Browser token | `tm_auth_token` | `sso_token` | `tupo_token` |
| Server → MIS precedent | `access/misClient.ts` `postAudit()` (Basic credentials) | the same SDK | the same SDK |

**Common to all three:**
- They poll `/verify-mis` every 60 s and on focus, and support back-channel logout.
- They share the identical `public/sw.js`, which reloads tabs when a new release activates.
- **None sets a CSP**, so a same-origin POST is never blocked.
- Shared code is distributed as vendored packages (`sync.mjs` with a sha256 header) or as byte-identical copies.

---

## 3. Design principles

1. **Identity is attested by a server.**
   - The MIS SPA authenticates to the MIS directly.
   - A satellite SPA posts to **its own backend** (same origin, its own session). That backend stamps `misUserId` and the real client IP, then relays to MIS with its SSO client credentials.
   - Nobody can send events as someone else.
   - Visitors cannot claim to be a user.
2. **One device, one session, four apps.**
   - `nga_did` on `.amashuri.com` makes a visit like MIS → TM → Tupo a single session with an app path.
   - It also stitches a public visitor to the account they later sign in with.
3. **Collection is cheap.**
   - The client batches, and the relay coalesces per app every 5 s.
   - Auth on the collector is light, inserts are buffered, and presence lives in memory.
   - Collection never touches other features' hot paths.
4. **Capture all known context, never content.** Recorded:
   - full IP (D3), geo, ISP, device, route **pattern**, feature, timing and counts.

   Never recorded:
   - typed or displayed content, query strings or hashes, ids embedded in paths.
5. **Per-person access is deliberate and visible.**
   - Names, IPs and timelines require explicit capabilities.
   - Every per-person view is written to an append-only access log.
   - Watches require a reason and an expiry, and **the person is told** (D2).
   - Leadership sees aggregates only.
6. **Fail soft.**
   - The SDK swallows errors, the relay drops from a bounded queue, and the collector always returns 202.
   - A kill switch at `/activity/config` turns collection off.
7. **GA-compatible definitions**, so the numbers mean what an admin who knows GA expects (§8.2).
8. **Avoid ad-blocker patterns.**
   - EasyPrivacy blocks paths such as `/analytics/`, `/collect`, `/track` and `/telemetry`.
   - Ingest therefore lives at `/activity/sync` and `/activity/ingest`, admin APIs under `/monitor/*`, and the SDK is named `nga-activity`.
   - The SPA page route `/analytics` is safe, because only network requests are filtered.
9. **No third party sees user data.** GeoIP lookups use a local database file, and map tiles carry no user data.

---

## 4. Architecture

```
 Browser tabs (signed-in AND public pages)   App backends                         MIS backend (single pm2 process)
 ─────────────────────────────────────────   ────────────                         ────────────────────────────────
 MIS SPA ── nga-activity SDK ──────────────────────────────────────────────────▶ POST /activity/sync
            (Bearer if signed in; device token dt if public)                       (light auth | anonymous guard)
                                                                                         │
 TM SPA ─── SDK ──▶ POST /api/activity ──▶ relay: stamp mis_user_id|null, ──────▶ POST /activity/ingest
 Tendo SPA ─ SDK ──▶ POST /api/activity ──▶ real IP + UA, coalesce 5 s,            (Basic client creds,
 Tupo SPA ── SDK ──▶ POST /api/activity ──▶ gzip                                    ACTIVITY_SOURCE_CLIENTS)
                                                                                         │
 MIS server events: login ok/fail, OTP, Google, SSO launch, logout, suspend ──▶ ┌───────────────────────────┐
 Relay server events: tm.quiz.submit, tupo.meet.guest_join … ─────────────────▶ │ Ingest pipeline           │
                                                                                 │ validate → enrich(IP→geo, │
                                                                                 │ UA, bot score) → dedupe   │
                                                                                 ├─────────┬────────┬────────┤
                                                                                 │Presence │Session-│ Watch  │
                                                                                 │(memory) │izer    │matcher │──▶ alerts → in-app,
                                                                                 └────┬────┴───┬────┴────────┘    push, e-mail
                                                   SSE /monitor/live/stream ◀────────┘        │ bulk INSERT / 2 s
                                                                                               ▼
                                         MySQL: AnalyticsEvent (monthly partitions), AnalyticsSession, AnalyticsDevice,
                                                AnalyticsIp, AnalyticsGeo, AnalyticsUserIp, AuthEvent, rollups, watches, logs
                                                                                               │
                                         /monitor/* report APIs ◀──────────────────────────────┘
                                         MIS SPA /analytics/* (recharts + leaflet)

 GeoIP: /var/lib/nga-geo/{dbip-city-lite,dbip-asn-lite}.mmdb  (read locally; monthly refresh, §7.2)
```

**Why the satellites relay instead of posting to the MIS from the browser:**
- Tendo and Tupo browsers hold no MIS token, so posting directly would mean adding CORS and a new browser-held credential.
- The relay already has a verified session and the **true client IP** (after G2).
- It cuts MIS requests by about 100×: one coalesced POST per app every 5 s.

**Capacity** (assuming about 1,500 accounts, about 600 concurrent at peak, and public traffic of a few thousand page views a day):

| Item | Estimate |
|---|---|
| Heartbeats | about 20 per second, coalesced in the relays |
| Stored events | about 80–100k per day, about 30M per year |
| Raw table size | about 250 bytes per row with indexes, so about 7–8 GB per year (13 months kept) |
| Memory | presence and the dedupe set together use under 30 MB |
| MySQL 8 | fine with monthly partitions, because reports read rollups |

**Scale-out path (documented, not built):** move presence and dedupe to Redis (it is already on the box for Tupo), with pub/sub fan-out to SSE.

---

## 5. Collection

### 5.1 SDK: `packages/activity`, vendored as `vendor/nga-activity`

- **Source:** `nga_central_mis/packages/activity/src/{index.ts, react.ts, timer.ts, transport.ts, autocapture.ts, vitals.ts}`.
- **Sync:** `sync.mjs`, cloned from `packages/access/sync.mjs`, writes a `VENDORED — do not edit` header and a sha256 line into:
  - MIS: `frontend/src/vendor/nga-activity`
  - TM: `client/src/vendor/nga-activity`
  - Tendo: `client/src/vendor/nga-activity`
  - Tupo: `apps/web/src/vendor/nga-activity`
- **Dependencies:** none (React is a peer dependency for `react.ts` only).
- **Size budget:** ≤7 kB gzip. A **drift test in each repo** fails if the vendored hash differs from the header.

```ts
// main.tsx (every app)
initActivity({
  app: "tm",                                  // "mis" | "tm" | "tendo" | "tupo"
  endpoint: "/api/activity",                  // MIS: `${API_BASE}/activity/sync`
  authHeader: () => token() ? `Bearer ${token()}` : null,   // null on public pages
  userKey: () => misUserId() ?? null,         // a change = flush and reset (account switch)
  release: import.meta.env.VITE_RELEASE,
  catalog: FEATURE_CATALOG,                   // §5.4
});
// App.tsx, inside the router (covers public AND private routes)
<ActivityRouterTracker patterns={ROUTE_PATTERNS} />
// anywhere
track("tm.quiz.submit", { quiz_id: 123 });
```

| Concern | Behaviour |
|---|---|
| **Device id** | `nga_did` cookie: 128-bit random base64url (22 chars), `Domain=.amashuri.com; Max-Age=63072000; SameSite=Lax; Secure`. It falls back to localStorage on localhost. The cookie is also mirrored to localStorage, so a cleared cookie is restored per origin. |
| **Device token** | `nga_dt`: an HMAC over `did` issued by `/activity/config`, kept in localStorage. Anonymous batches must carry it (§5.6). |
| **Tab id** | Kept in `sessionStorage`, so it survives the reloads `sw.js` triggers. Presence is tracked per tab. |
| **Page view** | On each route change the location is matched to a **pattern** (`/courses/:id/grades`). The event is `page_view {pv, route, feature, nav: load\|push\|pop\|replace, ref_route}`. For the first page view of a page load it also carries `referrer_host` (host only, external referrers only) and `utm_source`/`utm_medium`/`utm_campaign` when present. A `replace` with the same pattern is ignored. **Query strings and hashes are never sent.** |
| **Engagement timer** | Runs only while the page is visible, the window has focus, and there was input in the last 60 s. Input is pointer, key, wheel or touch, listened to passively, and **only its timestamp is recorded**. The time is attributed to the current `pv`. It is flushed as `user_engagement {pv, ms}` on route change, on hide, on `pagehide` and **with every heartbeat**. |
| **Heartbeat** | Every 30 s while visible, plus immediately on show, focus or route change. The payload is `{tab, route, feature, vis, idle, standalone, net: navigator.connection?.effectiveType}`. One `hidden` beat is sent on hide, and nothing while hidden. On logout or `pagehide` with `persisted=false`, a `{vis: "gone"}` beat is sent. Heartbeats feed presence and **are not stored as events**. |
| **Auto events** | `scroll` once per page at 90%. `click` only on `[data-track]` elements and outbound links. `file_download` by link extension (pdf, docx, xlsx, pptx, csv, zip, mp4…). `form_submit {form_id}` only on `[data-track-form]`. `js_error {msg≤200, src_pattern, line}`, at most 5 per page. `web_vital {name, value, rating}` for LCP, INP, CLS and TTFB, using a ~1 kB PerformanceObserver implementation. `search {results_count}` is opt-in. |
| **Automation flag** | `navigator.webdriver`, `headless` in the UA, and no pointer or keyboard events during the whole visit are sent as `env.auto=1` to feed bot scoring (§8). |
| **Precise location** | Only if the server config says `precise_location` is on for this audience (§7.5). The browser asks permission once per device. The SDK sends `location_fix {lat, lon, accuracy_m}` rounded to 4 decimals (about 11 m), at most once per session. |
| **Transport** | Events queue in memory and are flushed every 5 s, at 20 events, or on hide. The request is `fetch(endpoint, {method: "POST", keepalive: true, headers: {Authorization?, "Content-Type": "application/json"}, body})`. On unload where keepalive is unavailable, it uses `navigator.sendBeacon(endpoint, new Blob([json], {type: "text/plain"}))`, with a **beacon ticket** in the body for signed-in users. Retries use backoff. Failed batches go to localStorage (at most 200 events, at most 24 h). |
| **Envelope** | `{v:1, app, did, dt?, tab, rel, sent_at, tz, lang, scr: "1920x1080@2", vp: "1280x720", events:[{id: ULID, n, t, pv?, r?, f?, p?}], beat?:{…}, ticket?}` |
| **Account switch** | When `userKey()` changes, the SDK flushes under the old identity, clears the queue, and starts a new `pv`. |
| **Kill switch / config** | `GET /activity/config?did=` (cached 10 min) returns `{enabled, heartbeat_s, flush_s, precise_location, dt?, debug}`. |
| **Debug** | `localStorage.nga_activity_debug=1` logs to the console and flags events as `debug`. They are excluded from reports and appear in Settings → DebugView. |

### 5.2 Satellite relay: `vendor/nga-activity-relay` (Node, framework-agnostic)

Each app adds `POST /api/activity` and `GET /api/activity/config`. The POST route is mounted **with optional auth**: the app's middleware runs if a token is present, but anonymous requests are allowed. Per batch, the relay:

1. Sets `user_id` to the MIS id from the app session, or `null` (visitor). A revoked session counts as `null`.
2. Stamps `ip` from `req.ip`, which needs `trust proxy` (G2), plus `ua`, `accept-language` and `origin`.
3. Rejects a request whose `Origin` is not its own SPA origin, and rate-limits anonymous requests to 30 batches per minute per IP.
4. Coalesces the batches and flushes every 5 s or at 500 events to MIS `POST /activity/ingest`. The flush is gzipped, authenticated with `Authorization: Basic base64(SSO_CLIENT_ID:SSO_CLIENT_SECRET)`, and has a 5 s timeout. The queue is bounded at 10k (oldest dropped) with one retry.
5. Keeps only the latest presence beat per tab within a window.
6. Answers `204` at once.
7. Exposes `relay.track(userId|null, deviceId|null, name, params)` for **server-side key events**, such as Tupo `meet.guest_join` with the guest's display name.

Files: TM `server/src/routes/activity.ts`, Tendo `server/src/routes/activity.ts` (ESM `.js` imports), Tupo `apps/api/src/routes/activity.ts`.

### 5.3 MIS collector

**Mounting:**
- The `/activity` router is mounted in `app.ts` **before** `express.json({limit: "30mb"}).`
- It has its own parsers: `express.json({limit: "256kb"})`, `express.text({type: "text/plain", limit: "64kb"})` for beacons, and gzip inflate for relays.

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /activity/sync` | MIS SPA, **light auth** (`middleware/activityAuth.ts`). It verifies the JWT signature, checks `token_version` against a **30 s per-user cache**, and skips `getEffectivePermissions`. It accepts a `ticket` (HMAC `{uid, did, exp: 10 min}`) for beacons. **With no token, the batch is anonymous** and handled under §5.6. | Returns `202 {ticket?, cfg}` |
| `POST /activity/ingest` | `requireServiceToken("activity:write")` **plus** `req.service.clientId ∈ ACTIVITY_SOURCE_CLIENTS` (default `taskmentor_app,discipline_attendance,tupo`). The `app` is derived from `access/apps.ts` mapping and **overrides** the batch's claimed app. Every non-null `user_id` must exist. | Relays only |
| `GET /activity/config` | public | Switches, plus a fresh `dt` when the `did` lacks a valid one |

**Validation** (zod, `services/activity/schema.ts`):
- At most 100 events per batch.
- Event names must match `^[a-z][a-z0-9_.]{0,63}$`.
- `params` holds at most 20 keys, each value at most 256 characters.
- `route` must be a pattern. Reject segments matching `/^\d{3,}$/`, UUIDs and email-like strings, and store `"(invalid)"` instead.
- Anonymous batches may only contain the allowlisted public events (§5.6).

**Deterministic time and deduplication:**
- `skew = received_at − sent_at`.
- If `|skew| ≤ 120 s`, then `occurred_at = t`. Otherwise `occurred_at = t + round_minute(skew)`.
- The result is clamped to `[received_at − 72 h, received_at]`.
- A retry of the same event therefore gets the same `occurred_at`.
- The PK is `(event_id, occurred_at)`. An in-memory **48 h dedupe set** (ULID → expiry, about 5 MB) drops retries before insert, and `INSERT IGNORE` handles the rest.
- A dedupe set lost on restart can let at most the retries of that minute through. That is accepted and covered by a test.

**Enrichment** (`services/activity/enrich.ts`):
- The IP is parsed (IPv4-mapped IPv6 is normalised), then looked up in GeoIP and ASN (§7) through an LRU of 20k entries.
- The network label comes from `campus_cidrs`.
- The UA is parsed into `AnalyticsUa` (a dimension table).
- A bot score is computed (§8).
- For a known user, `user_type` and the primary role are snapshotted on the session.

**Write path:**
- Events go to an in-memory buffer, flushed every 2 s with a multi-row `INSERT IGNORE` of at most 1,000 rows.
- `AnalyticsIp`, `AnalyticsUserIp` and `AnalyticsDevice` are upserted in batches every 10 s.
- On SIGTERM, all buffers are flushed. pm2 must have `kill_timeout ≥ 5000` (check the ecosystem file).
- Responses are always 202, even when collection is disabled, and a 4xx is never retried.

### 5.4 Feature catalog: pages → named features

Each app ships `activity.catalog.ts`. Its backend PUTs the catalog to the MIS on boot (`PUT /monitor/catalog/:app`, service auth, non-fatal), just as access manifests are pushed.

```ts
{ app: "tm", version: "2026.10.01", features: [
  { key: "tm.login",          label: "Sign-in page",      module: "Public",  patterns: ["/login"], public: true },
  { key: "tm.dashboard",      label: "Dashboard",         module: "Home",    patterns: ["/dashboard"] },
  { key: "tm.course.grades",  label: "Course gradebook",  module: "Courses", patterns: ["/courses/:id/grades"] },
  { key: "tm.quiz.take",      label: "Taking a quiz",     module: "Quizzes", patterns: ["/quizzes/:id/take"] },
  { key: "tm.quiz.submit",    label: "Quiz submitted",    module: "Quizzes", event: true, key_event: true },
]}
```

**Generating the catalogs:**
- **TM:** from `routeConfig.tsx` `appRoutes`.
- **Tendo:** from the `App.tsx` route list, plus labels from `navConfig.tsx` and `searchCatalog.ts`.
- **Tupo:** from `/app/<module>` segments.
- **MIS:** from `Sidebar.tsx` `navItems` and the `App.tsx` routes.
- Each repo gets `scripts/gen-activity-catalog.(ts|mjs)` and a test that **every `<Route path>` has a catalog entry**.
- Unknown routes are stored as `"<app>.other"` with the pattern kept, and surface in Settings → Catalog health.

### 5.5 Server-side events (no browser needed)

| Event | Source | Stored in |
|---|---|---|
| `login_success {method: password_otp\|google}` | `authController.completeLogin` | `AuthEvent` + `AnalyticsEvent` |
| `login_failed {reason: bad_password\|unknown_user\|locked\|otp_failed\|google_unlinked, username_attempted}` | the failure branches of `login`, `verifyOtp` and `googleLogin` | `AuthEvent`. `username_attempted` is stored **as typed**, truncated to 120 characters, because attempts against real accounts must be investigable (D1). |
| `otp_sent`, `password_reset_requested {username_attempted}` | existing controllers | `AuthEvent` |
| `app_launch {app}` | `ssoController.authorize` when an `SSOCode` is issued | `AuthEvent` + event |
| `logout {initiator: user\|admin\|expiry\|backchannel}` | `logout`, and the §10.3 controls | `AuthEvent` + event |
| `account_suspended \| reactivated \| password_changed` | user-management paths | `AuthEvent` |
| `tupo.meet.guest_join {meeting_id, display_name}` | Tupo relay `track()` in `meet.ts` guest route | event (visitor) |
| key domain events (`tm.quiz.submit`, `tendo.register.save`, …) | relays' `track()` | event |

The MIS writes `AuthEvent` with `ip`, `device_id` (read from the `nga_did` cookie when the login request carries it, since `mis.amashuri.com` → `api.amashuri.com` is same-site), and `ua_id`. **A failed login therefore links to the visitor device that attempted it.**

### 5.6 Anonymous (public-page) ingest hardening

| Control | Rule |
|---|---|
| Origin allowlist | `Origin` must be one of `mis.amashuri.com`, `taskmentor.amashuri.com`, `tendo.amashuri.com` or `tupo.amashuri.com` (env `ACTIVITY_ORIGINS`). Relays enforce their own origin, and MIS enforces it for `/activity/sync`. |
| Device token | The batch's `dt` must equal `HMAC(ACTIVITY_SECRET, did)`. Without one, the server issues a new `did` and `dt` in the 202 response and treats the batch as a new device. This stops anyone from writing into an existing visitor's history by guessing ids. |
| Rate limits | 30 batches per minute per IP, and 300 events per minute per IP. Excess traffic is dropped, counted in ingest health, and raises a bot score. |
| Event allowlist | `page_view`, `user_engagement`, `scroll`, `click`, `file_download`, `form_submit`, `web_vital`, `js_error`, `location_fix` |
| Size | At most 50 events per anonymous batch |
| No identity claims | Any `user_id` field in a browser batch is ignored. The server decides identity. |

---

## 6. Visitors (public users) and identity stitching

### 6.1 What a visitor is

A **visitor** is an `AnalyticsDevice` row that has activity with no authenticated user. It is shown as **"Visitor · `Kigali · MTN Rwanda · Chrome/Android`"**, with a short code `V-7KQ2M` (the base32 of the first 5 bytes of `device_id`).

Each visitor carries:
- first and last seen
- every IP used, with geo and ISP
- user agent and device class
- entry referrer and UTMs
- pages viewed and their timeline
- **sign-in attempts from this device**, with usernames typed and outcomes
- Tupo guest display names
- bot score
- the **linked account(s)**, if the device ever signed in

### 6.2 What is captured per public surface

| Surface | Captured |
|---|---|
| MIS `/`, `/about`, `/contact`, `/apps`, `/privacy`, `/terms` | page views, engagement, scroll, outbound clicks, referrer, UTMs |
| `/login`, `/password-recovery` (MIS) and the TM, Tendo and Tupo sign-in pages | page views, engagement and `form_submit {form_id: "login"}`. **On the server:** `login_failed`/`otp_sent`/`password_reset_requested` with the **username attempted**, IP, geo and device |
| `/verify/:schemeId` (MIS) | page view (pattern only) and the server-side verification result (`scheme_verify {result}`) |
| `/sso/callback` (every app) | page view. The exchange is a server event. |
| Tupo `/meet/:idOrCode` (guest) | page views, plus `tupo.meet.guest_join {meeting_id, display_name}` and `guest_leave {duration_s}` from the Tupo server |

### 6.3 Visitor sessions

Visitor sessions are sessionised exactly like users' sessions: keyed on `device_id`, with a 30-minute timeout.

### 6.4 Stitching (visitor → user)

- When a device with visitor history gets its first authenticated event:
  - `AnalyticsDevice.linked_user_ids` (JSON set) and `last_user_id` are updated;
  - the **current session continues** and is given that `user_id` (GA4 behaviour);
  - earlier anonymous events keep `user_id = NULL`, because partitioned history is never rewritten, but they are queryable through `device_id`.
- **User 360 → "Before sign-in"** lists the anonymous activity on that user's devices.
- **Visitor 360** shows "This device later signed in as: …".
- **A different user signing in on the same device starts a new session.** Shared lab PCs are expected, so linking is per device rather than merging people. The device page shows every account seen on it.

---

## 7. IP intelligence and location (D1, D3)

### 7.1 What is stored

- **Full IP addresses:** stored as `VARBINARY(16)` via `INET6_ATON` on `AnalyticsEvent`, `AnalyticsSession` (entry and last IP), `AuthEvent`, `AnalyticsIp`, `AnalyticsUserIp` and `AnalyticsDevice` (first and last IP).
- **IP dimension (`AnalyticsIp`):**
  - first and last seen
  - `geo_id`, ASN and ISP
  - connection type (mobile, fixed, hosting or education, from the ASN and a curated list)
  - `network_label` (campus, office, or a custom range)
  - the count of users and devices seen on it, which **flags shared NAT addresses**, e.g. the school's egress IP
- **Per-user IP history (`AnalyticsUserIp`):** `(user_id, ip)` with first and last seen and session counts. This answers "which IPs has this person used?" and "who else used this IP?".

### 7.2 GeoIP source (offline, no third party)

| Option | Licence and cost | Notes |
|---|---|---|
| **DB-IP Lite** (City + ASN, `.mmdb`), **recommended** | CC BY 4.0, free, no account | Monthly releases. Requires the attribution "IP geolocation by DB-IP" on the Locations page. |
| MaxMind GeoLite2 (City + ASN) | Free account and licence key; EULA requires updates within 30 days | Alternative, via `GEOIP_PROVIDER=maxmind` and `MAXMIND_LICENSE_KEY` |

- **Reader:** the `maxmind` npm package, which reads both formats, opened once and hot-reloaded on file change.
- **Files:** `/var/lib/nga-geo/*.mmdb`, outside the repo so `rsync --delete` deploys don't remove them.
- **Updates:** `backend/scripts/geoip-update.sh` downloads, verifies and swaps the files atomically. It runs from a monthly cron on the box. Settings shows the database age, and an alert fires when it is older than 45 days.
- **Private and reserved ranges** (10/8, 172.16/12, 192.168/16, 100.64/10 CGNAT, ::1, fc00::/7) resolve to `"Private network"`. These appear when traffic reaches a backend from the LAN without passing nginx.

### 7.3 Accuracy, shown in the UI, not hidden

- In Rwanda, **mobile traffic (MTN, Airtel) goes through carrier-grade NAT**. City-level IP location often reads "Kigali" wherever the person actually is, and one IP is shared by many subscribers.
- **Country and ISP are reliable. City is approximate.** The UI shows the city as "≈ Kigali (approx.)", and connection type as "Mobile (MTN Rwanda)".
- The school network appears as **one or a few shared egress IPs** with many users. That is why `network_label` (campus) and the "users on this IP" count matter more than the city.

### 7.4 Location features in the console

- **Locations report:** country, region and city table and map (bubble per city centroid), ISP/ASN table, connection-type split, campus vs off-campus trend, and the top IPs with users-per-IP.
- **Realtime map:** live bubbles of who is online, coloured by app, with users and visitors as separate layers.
- **IP lookup** (`/analytics/ip/:ip` and a search box): geo and ISP, first and last seen, **every user and visitor seen on that IP** with times, sessions and failed logins from it, plus a "label this range" action.
- **User 360 / Visitor 360:** IP history table, a location timeline, and **"new location / new ISP"** markers.
- **Map tiles:** Leaflet with OpenStreetMap tiles (attribution required), lazy-loaded on admin pages only. Tile requests carry only map coordinates, no user data. A self-hosted tile option is noted for later.

### 7.5 Optional precise location (browser geolocation)

- IP location cannot locate a person. If precise location is required, the only legitimate source is the browser Geolocation API, which **always shows the user a permission prompt**.
- **Setting `precise_location`:**
  - `off` (default)
  - `staff` (TEACHER, STAFF and ADMIN)
  - `known_users` (all signed-in users)
  - `everyone` (including visitors)
- When on, the SDK requests location once per device and sends at most one `location_fix` per session, rounded to about 11 m and carrying the browser's accuracy. A refusal is stored as `location_denied`, and the SDK never asks again on that device.
- Fixes are stored in `AnalyticsLocationFix` and shown on User 360 and Visitor 360 maps, visible only with `ANALYTICS_LOCATION_VIEW` (§11).
- The privacy notice must state when this is enabled (§13).
- This is **deliberately off by default**. Turning it on is a policy act, recorded in the monitor access log with a reason.

---

## 8. Bots, abuse and data quality

Public pages invite crawlers and credential-stuffing, so every device gets a `bot_score` (0–100), recomputed on each batch:

| Signal | Weight |
|---|---|
| UA matches the bot list (an inline, maintained regex list: crawlers, `curl`, `python-requests`, `HeadlessChrome`, `Lighthouse`, link previewers such as WhatsApp, Slack and Facebook) | 100 |
| `env.auto=1` (webdriver or headless) | 60 |
| ASN connection type `hosting` (AWS, GCP, Azure, OVH, Hetzner…) with no sign-in | 30 |
| No input events across ≥5 page views | 20 |
| Rate-limit hits | 20 per hit |
| ≥5 failed logins across ≥3 usernames in 15 minutes from this device or IP | security flag, separate from the bot score |

- **A score of 60 or more marks the device as a bot.** Its events are kept, flagged `bot` in `flags`, **excluded from every report and from Realtime counts**, and listed under Visitors → Bots.
- Admins can override a device as "Not a bot" or "Always a bot". Excluded accounts (test or service users) are handled the same way.
- Credential stuffing raises a **security alert** (§10.4) and is shown on Access & Logins.

---

## 9. Processing

### 9.1 Sessionizer (`services/activity/sessionizer.ts`)

**State:** an in-memory `Map<device_id, OpenSession>`.

**Per event, sorted by `occurred_at` within its batch:**
- **Start a new session when:**
  - no session is open, **or** `t − last_activity > session_timeout` (30 min);
  - **or** the event's `user_id` is non-null and differs from the session's non-null `user_id` (a person switch).

  Starting a new session closes the old one (`ended_at = last_activity`), inserts the new one, and emits a derived `session_start`.
- **Emit `first_visit`** when a known user has no `first_seen_by_app[app]` yet, or a visitor device is new.
- **When `user_id` goes from null to X,** set `session.user_id = X` and record `stitched_at`.
- **Update the session's counters** and its `app_path`: append on app change, up to 16 hops.

**Engaged:** at least `engaged_seconds` of engagement, **or** at least 2 page views, **or** a key event.

**Heartbeats:**
- They extend `last_activity` only when `vis=visible`, so a hidden tab never keeps a session alive.
- A `gone` beat, or a logout, closes the session immediately.

**Flushing and recovery:**
- Every 10 s, dirty sessions are flushed with `UPDATE`.
- Every 60 s, a sweep closes sessions that have timed out.
- On boot, sessions open within the last `timeout` are reloaded.
- **No midnight split.** Day rollups attribute activity by event time.

### 9.2 Metric definitions (shown in the product under "ⓘ How is this calculated?")

| Metric | Definition |
|---|---|
| **Accessed users** | Distinct users with ≥1 session (any event, including a bare login) in the range. This is the "who accessed the platform" number. |
| **Active users** | Distinct users with ≥1 **engaged** session (GA4's "Active users") |
| **Visitors / active visitors** | The same two measures for non-bot devices with no user in the range |
| **New users / new visitors** | Users whose `first_seen_at` (platform) or `first_seen_by_app[app]` falls in the range; devices whose `first_seen` does |
| **Returning** | Active users or visitors who had a session before the range |
| **DAU / WAU / MAU** | Rolling 1-, 7- and **28-day** distinct active users ending each day. **Calendar** "this week" and "this month" are offered as separate views. |
| **Stickiness** | DAU/MAU, DAU/WAU, WAU/MAU |
| **Adoption %** | Active users ÷ **eligible** users. Eligible means ACTIVE accounts of the selected user type, programme, grade or role, with the app's entitlement (`snapshot.systems`). |
| **Sessions, engaged sessions, engagement rate, bounce rate** | As in GA4: engagement rate = engaged ÷ sessions, bounce rate = 1 − engagement rate |
| **Average engagement time** | Σ `engagement_ms` ÷ active users, and ÷ sessions |
| **Views, views per user** | `page_view` count, and that count ÷ active users |
| **Feature reach** | Distinct viewers of a feature ÷ active users of that app |
| **Key events** | Count, per session, and conversion (sessions containing the key event ÷ sessions) |
| **Login success rate** | `login_success` ÷ (`login_success` + `login_failed`) |
| **Dormant** | Eligible users who were previously active but have had no session for N days or more (default 14) |
| **Never signed in** | Eligible ACTIVE accounts with no `login_success` ever, including backfilled ones |

### 9.3 Rollups (`services/activity/rollup.ts`)

**Every 5 minutes**, recompute **today** (the Kigali day) for these tables:
- `UserDay`
- `DeviceDay` (visitors)
- `FeatureDay`
- `DimDay`
- `GeoDay`
- `Hourly`

Each recompute is an idempotent `DELETE … WHERE day = today` followed by `INSERT … SELECT`, run under `GET_LOCK('activity_rollup')`. It takes about 1–3 s at the expected volume.

**Every night at 01:30 Kigali time:**
- Recompute D-1 to D-3 to absorb late events.
- Maintain partitions: create next month's, and drop those past retention.
- Expire watches and notify their targets.
- Prune `AuthEvent`, `AnalyticsLocationFix` and `AnalyticsAlert` past retention.
- Refresh `AnalyticsIp.users_count`.
- Check the GeoIP database's age.

**Segmentation and the small-cohort rule:**
- Segments are joined at query time: `UserDay` with `UserProfile`, the placement tables and `UserRole`.
- History therefore follows each person's **current** placement. This is documented in the product.
- Holders of `ANALYTICS_VIEW` only see segments of fewer than 5 users as "<5". `ANALYTICS_USER_VIEW` sees exact counts.

### 9.4 Presence engine (`services/activity/presence.ts`)

```ts
Map<presenceKey /* "u:<userId>" | "d:<deviceId>" */, {
  userId: number | null; deviceId: string; display: {...};
  tabs: Map<tabId, { app, route, feature, vis, idle, standalone, ip, geoId, network,
                     since, lastBeat, sessionId }>
}>
```

**Tab status:**

| Status | Condition |
|---|---|
| **active** | visible, input within `idle_after_s` (120 s), and a beat within `offline_after_s` (90 s) |
| **idle** | visible with no recent input, and a beat within 90 s |
| **background** | the last beat was `hidden`, at most `background_ttl_s` (10 min) ago |
| **offline** | anything else, or after a `gone` beat or a sign-out |

**Rolling up and broadcasting:**
- A person takes the best status among their tabs. **"Online" means active or idle.** Background is shown separately.
- Bots are never present.
- A sweep every 15 s expires tabs and emits diffs.
- A ring buffer of 30 per-minute slots holds distinct online users and visitors per app. It powers the last-30-minutes chart and is rebuilt from `AnalyticsEvent` on boot.

**Delivery to the console:**
- **SSE stream:** `GET /monitor/live/stream?ticket=` sends a snapshot on connect, then diffs every 2 s and counts every 10 s.
- **Tickets:** `POST /monitor/live/ticket` issues a 60 s, single-use HMAC ticket, so the 24 h JWT never appears in nginx logs.
- **Polling fallback:** `GET /monitor/live` every 10 s.

**Persistence:** `AnalyticsUserState.last_seen_*` is batch-updated every 5 minutes for people online, and immediately when they go offline.

**Tupo's own presence** (a chat status the user controls, with a "show presence" setting) is independent. Admin presence is not shown to peers, and the privacy notice says that admins see online status regardless of the chat setting.

---

## 10. Per-person monitoring and control

### 10.1 Access rules

| View | Capability | Additional rules |
|---|---|---|
| User 360 (any user type: student, parent, staff, admin; D1) | `ANALYTICS_USER_VIEW` | You cannot open the 360 of a holder of `ANALYTICS_CONFIGURE` unless you hold it too, so admins cannot quietly watch admins. You cannot open your own 360; use **My activity**. |
| Visitor 360, IP lookup | `ANALYTICS_USER_VIEW` | none |
| Full IPs, ISP, city, IP history, map | `ANALYTICS_USER_VIEW` (aggregate geo needs only `ANALYTICS_VIEW`) | none |
| Precise location fixes | `ANALYTICS_LOCATION_VIEW` | none |
| Controls and watches | `ANALYTICS_USER_CONTROL` | none |

Every open, export and control writes a row to `MonitorAccessLog`: viewer, action, target user or device, reason when required, IP and time.

### 10.2 User 360 (`/analytics/users/:id`) and Visitor 360 (`/analytics/visitors/:deviceCode`)

| Section | User 360 | Visitor 360 |
|---|---|---|
| Header | Name, photo, type, roles, placements, account status, **live status** (app · feature · page · since · IP · ≈city · ISP), last login (method, IP, place), first seen per app | Code, bot score, first and last seen, current status, IP · ≈city · ISP, device, **linked accounts** |
| Summary | Active days, sessions, engagement, key events for the range; app split; 12-month calendar heatmap | Sessions, page views, entry referrers and UTMs |
| **Timeline** (User Explorer) | Sessions, newest first, each expandable to ordered events (time, app, feature, route pattern, engagement, IP change markers). Logins, launches, failures and watch events are interleaved. Filters by app or event, and jump-to-date. | The same, plus failed sign-in attempts with the usernames typed and Tupo guest names |
| Before sign-in | Anonymous activity on this user's devices (§6.4) | "Signed in later as …" |
| Features | Top features compared with the median for the person's user type | Pages viewed |
| Devices | Browser, OS, PWA status, first and last seen, **other accounts on the same device** | Not applicable |
| **Network & location** | IP history (IP, ≈place, ISP, connection, first and last seen, sessions), a location timeline, **new IP / ISP / country markers**, precise fixes (with `ANALYTICS_LOCATION_VIEW`), and a map | The same |
| Security | Logins with success and failure, reasons, IP and place; concurrent sessions; new-device logins | Sign-in attempts and the usernames targeted |
| Watches & alerts | Active and past watches on this person, and alerts | Watches on this device |
| Accountability | Who viewed this profile and when (visible to `ANALYTICS_CONFIGURE`) | The same |

### 10.3 Controls (`ANALYTICS_USER_CONTROL`)

Each control is confirmed through `useConfirm`, requires a typed reason, and is written to the audit log.

| Control | Implementation |
|---|---|
| **Sign out everywhere** | 1. Bump `User.token_version`. 2. Call `notifyLogout(userId)`, which back-channels TM, Tendo and Tupo, and Tupo drops the user's sockets. 3. Drop presence for the user's tabs. 4. Write `AuthEvent logout {initiator: admin}`. The MIS returns 401 on the next call. The satellites end the session through the back-channel immediately, or on their 60 s `/verify-mis` check at the latest. |
| **Sign out one device** | Best effort: the next `/activity/sync` response, or the relay's response, carries `{cmd: "end", did}`, and the SDK calls the app's logout. "Sign out everywhere" is the guaranteed control. |
| **Suspend / reactivate** | Set `User.status = SUSPENDED` through the existing user-management service, then sign out everywhere. |
| **Send message** | `notifyUser()` in the app, plus Web Push through the Reminder Hub |
| **Manage access** | Deep link to Access Studio for this person |
| **Watch** | §10.4 |
| **Mark excluded** | For test or service accounts: excluded from reports, still logged |
| **Visitor: block** | Add the device and/or IP to a blocklist (`AnalyticsBlock`). Blocked IPs are refused on `/auth/login` and on anonymous ingest with a 403. Blocks expire (default 7 days, maximum 90). |
| **Visitor: mark bot / not bot** | §8 override |
| **Export data** | JSON or CSV of all events, sessions, auth events, IPs and fixes (a subject access request) |
| **Delete analytics data** | `ANALYTICS_CONFIGURE` only. Deletes the person's or device's events across partitions, their sessions, IP history, fixes and rollup rows. `MonitorAccessLog` is kept. |

### 10.4 Watchlist and alerts (D2: the watched person is told)

**A watch consists of:**
- a target, which can be a user, a visitor device, or an **IP or CIDR**;
- a required **reason**;
- a required **expiry** (at most 90 days, default 14);
- the channels to deliver alerts on: in-app, Web Push, or email, all through the Reminder Hub;
- one or more rules.

**Telling the target (users only):**

| When | What the target receives |
|---|---|
| On create | An in-app and push notification: *"An administrator, `<name>`, is monitoring your account activity until `<date>`. Reason: `<reason>`. See My activity."* |
| On revoke or expiry | A matching notification |
| While active | **My activity** lists the watch: who set it, the reason, when it started and expires, and which rules apply |

There is no confidential option. Visitor-device and IP watches have no account to notify, which the UI states.

| Rule | Fires when |
|---|---|
| `comes_online` | the target goes from offline to active (debounced 10 min) |
| `opens_app {app}` | the first event for that app in a session |
| `opens_feature {feature}` | a page view of that feature |
| `key_event {name}` | that event occurs |
| `login_failed {n, window}` | at least n failures within the window |
| `new_device` / `new_ip` / `new_country` / `new_isp` | the first time the target is seen with that device, IP, country or ISP |
| `off_hours {from, to}` | activity outside the configured hours (Kigali time) |
| `concurrent_sessions {n}` | at least n devices are online at once |
| `ip_activity` (IP watch) | any user or visitor is active on that IP or range |

**Platform-wide security alerts** go to `ANALYTICS_CONFIGURE` holders without needing a watch:
- credential stuffing (§8);
- brute force: at least 10 failures for one username within 15 minutes;
- an admin-capability holder signing in from a new country, ISP or device;
- a login to a SUSPENDED account being attempted;
- ingest health: no events for 10 minutes during school hours, or a spike in rejections;
- a GeoIP database that is too old.

**Matching** runs in the ingest pipeline (`watchMatcher.ts`, an in-memory index by user, device and IP), so alerts arrive within seconds. Each rule fires at most once per watch per 10 minutes. Alerts are stored in `AnalyticsAlert` and can be acknowledged.

### 10.5 My activity (`/me/activity`, every signed-in user)

Every signed-in user can see, for the last 90 days:
- their sessions and apps;
- their devices, IPs and approximate places;
- their sign-ins, including failed attempts on their username.

They can also:
- answer **"Was this you?"** on unfamiliar device, IP or country entries, with a one-click "Sign me out everywhere";
- see **active watches on them** (D2);
- read the privacy notice section that explains all of this.

---

## 11. Access control (RBAC v2)

**Declaring the capabilities:**
- New capabilities go in `backend/src/access/manifest.ts`, domain `SYSTEM`, `SCHOOL_ONLY`.
- **All of them must also be listed in `access/v2Only.ts`.** The satellites keyword-match the legacy permission list, so without this `ANALYTICS_CONFIGURE` reads as "ADMIN" and would make its holder an app admin. A test asserts that no legacy output contains `ANALYTICS_`.

| Capability | Grants | Default presets |
|---|---|---|
| `ANALYTICS_VIEW` | Aggregate reports, aggregate geo and Realtime counts (small cohorts suppressed) | `platform_owner`, `it_support`; an optional leadership add-on |
| `ANALYTICS_LIVE_VIEW` | The named Realtime roster, including the visitors list | `platform_owner`, `it_support` |
| `ANALYTICS_USER_VIEW` | User 360, Visitor 360, IP lookup, full IPs, named lists, exports with names | `platform_owner` |
| `ANALYTICS_LOCATION_VIEW` | Precise location fixes | `platform_owner` |
| `ANALYTICS_USER_CONTROL` | Sign-out, suspend, message, watch, block | `platform_owner` |
| `ANALYTICS_CONFIGURE` | Settings, catalog, exclusions, deletion, the access-log viewer, enabling precise location | `platform_owner` |

**Enforcement:**
- Routes use `requireCapability(cap, () => ({type: "SCHOOL"}), "detail")`, which is **always enforced**, whatever `ACCESS_V2_MIS_MODE` is set to.
- **Legacy fallback:** the `SUPER_ADMIN` permission implies all six capabilities. This is noted in `presets.ts`.
- **Leadership widgets:** three aggregate widgets are added to the Insights hub `MIS_INSIGHTS`, scoped per node with a minimum cohort: `usage.active_rate`, `usage.app_adoption` and `usage.dormant_count`.

---

## 12. Data model: migration `095_platform_activity.sql`

The migration follows the existing convention: idempotent `CREATE TABLE IF NOT EXISTS`, InnoDB, `utf8mb4_unicode_ci`.

- Times are **UTC `DATETIME(3)`**. Raw SQL binds them with `toDbUtc()` (the Reminder Hub trap).
- The Drizzle objects live in `backend/src/db/activitySchema.ts`.
- App codes: `1=mis, 2=tm, 3=tendo, 4=tupo`.

```sql
-- Raw events: monthly partitions; PK must include the partition column, no FKs (partitioning forbids them).
CREATE TABLE IF NOT EXISTS AnalyticsEvent (
  event_id      CHAR(26)          NOT NULL,           -- ULID from the client (server-generated for server events)
  occurred_at   DATETIME(3)       NOT NULL,           -- deterministic (§5.3)
  received_at   DATETIME(3)       NOT NULL,
  app           TINYINT UNSIGNED  NOT NULL,
  user_id       INT               NULL,               -- NULL = visitor
  device_id     CHAR(22)          NOT NULL,
  session_id    BIGINT UNSIGNED   NULL,
  pv_id         CHAR(12)          NULL,
  name          VARCHAR(64)       NOT NULL,
  route         VARCHAR(191)      NULL,
  feature       VARCHAR(80)       NULL,
  engagement_ms INT UNSIGNED      NOT NULL DEFAULT 0,
  ip            VARBINARY(16)     NULL,
  geo_id        INT UNSIGNED      NULL,
  params        JSON              NULL,
  flags         TINYINT UNSIGNED  NOT NULL DEFAULT 0,  -- 1 debug, 2 key_event, 4 bot, 8 excluded, 16 server
  PRIMARY KEY (event_id, occurred_at),
  KEY ix_user_time    (user_id, occurred_at),
  KEY ix_device_time  (device_id, occurred_at),
  KEY ix_feature_time (app, feature, occurred_at),
  KEY ix_session      (session_id),
  KEY ix_ip_time      (ip, occurred_at)
) ENGINE=InnoDB
PARTITION BY RANGE COLUMNS (occurred_at) (
  PARTITION p202609 VALUES LESS THAN ('2026-10-01'),
  PARTITION p202610 VALUES LESS THAN ('2026-11-01'),
  PARTITION p202611 VALUES LESS THAN ('2026-12-01'),
  PARTITION p202612 VALUES LESS THAN ('2027-01-01'),
  PARTITION pmax    VALUES LESS THAN (MAXVALUE)
);
-- Idempotency for partitions: the migration runner script checks information_schema.PARTITIONS
-- before CREATE; the nightly job REORGANIZEs pmax into the next month and DROPs expired months.

CREATE TABLE IF NOT EXISTS AnalyticsSession (
  session_id      BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  device_id       CHAR(22)         NOT NULL,
  user_id         INT              NULL,
  stitched_at     DATETIME(3)      NULL,
  started_at      DATETIME(3)      NOT NULL,
  last_activity_at DATETIME(3)     NOT NULL,
  ended_at        DATETIME(3)      NULL,
  entry_app       TINYINT UNSIGNED NOT NULL,
  entry_route     VARCHAR(191)     NULL,
  entry_kind      ENUM('direct','sso_launch','pwa','push_click','referral','campaign') NOT NULL DEFAULT 'direct',
  referrer_host   VARCHAR(191)     NULL,
  utm_source      VARCHAR(100) NULL, utm_medium VARCHAR(100) NULL, utm_campaign VARCHAR(100) NULL,
  exit_app        TINYINT UNSIGNED NULL,
  exit_route      VARCHAR(191)     NULL,
  apps_mask       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  app_path        VARCHAR(64)      NULL,
  page_views      INT UNSIGNED     NOT NULL DEFAULT 0,
  events          INT UNSIGNED     NOT NULL DEFAULT 0,
  engagement_ms   INT UNSIGNED     NOT NULL DEFAULT 0,
  key_events      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_engaged      TINYINT(1)       NOT NULL DEFAULT 0,
  entry_ip        VARBINARY(16)    NULL,
  last_ip         VARBINARY(16)    NULL,
  geo_id          INT UNSIGNED     NULL,
  network_label   VARCHAR(40)      NULL,
  ua_id           INT UNSIGNED     NULL,
  user_type       VARCHAR(16)      NULL,
  is_bot          TINYINT(1)       NOT NULL DEFAULT 0,
  KEY ix_user_start   (user_id, started_at),
  KEY ix_device_start (device_id, started_at),
  KEY ix_start        (started_at),
  KEY ix_open         (ended_at, last_activity_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS AnalyticsDevice (
  device_id       CHAR(22)    NOT NULL PRIMARY KEY,
  first_seen      DATETIME(3) NOT NULL,
  last_seen       DATETIME(3) NOT NULL,
  first_ip        VARBINARY(16) NULL,
  last_ip         VARBINARY(16) NULL,
  last_geo_id     INT UNSIGNED NULL,
  ua_id           INT UNSIGNED NULL,
  standalone_seen TINYINT(1)  NOT NULL DEFAULT 0,
  screen          VARCHAR(20) NULL,
  first_user_id   INT NULL,
  last_user_id    INT NULL,
  linked_user_ids JSON NULL,
  guest_names     JSON NULL,
  bot_score       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  bot_override    ENUM('none','human','bot') NOT NULL DEFAULT 'none',
  sessions        INT UNSIGNED NOT NULL DEFAULT 0,
  page_views      INT UNSIGNED NOT NULL DEFAULT 0,
  precise_loc_state ENUM('unasked','granted','denied') NOT NULL DEFAULT 'unasked',
  KEY ix_last_seen (last_seen),
  KEY ix_last_user (last_user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS AnalyticsUa (
  ua_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ua_hash BINARY(32) NOT NULL UNIQUE,
  ua VARCHAR(512) NOT NULL,
  browser VARCHAR(40), browser_ver VARCHAR(20), os VARCHAR(40), os_ver VARCHAR(20),
  device_type ENUM('desktop','mobile','tablet','bot','unknown') NOT NULL DEFAULT 'unknown',
  is_bot_ua TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS AnalyticsGeo (
  geo_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  country_code CHAR(2) NULL, country VARCHAR(80) NULL,
  region VARCHAR(120) NULL, city VARCHAR(120) NULL,
  lat DECIMAL(8,5) NULL, lon DECIMAL(8,5) NULL,
  asn INT UNSIGNED NULL, isp VARCHAR(160) NULL,
  conn_type ENUM('mobile','fixed','hosting','education','private','unknown') NOT NULL DEFAULT 'unknown',
  UNIQUE KEY uq_geo (country_code, region, city, asn)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS AnalyticsIp (
  ip VARBINARY(16) NOT NULL PRIMARY KEY,
  geo_id INT UNSIGNED NULL,
  network_label VARCHAR(40) NULL,
  first_seen DATETIME(3) NOT NULL, last_seen DATETIME(3) NOT NULL,
  users_count INT UNSIGNED NOT NULL DEFAULT 0,
  devices_count INT UNSIGNED NOT NULL DEFAULT 0,
  failed_logins INT UNSIGNED NOT NULL DEFAULT 0,
  KEY ix_last_seen (last_seen)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS AnalyticsUserIp (
  user_id INT NOT NULL, ip VARBINARY(16) NOT NULL,
  first_seen DATETIME(3) NOT NULL, last_seen DATETIME(3) NOT NULL,
  sessions INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, ip), KEY ix_ip (ip)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS AnalyticsLocationFix (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id CHAR(22) NOT NULL, user_id INT NULL, session_id BIGINT UNSIGNED NULL,
  lat DECIMAL(8,5) NOT NULL, lon DECIMAL(8,5) NOT NULL, accuracy_m INT UNSIGNED NULL,
  captured_at DATETIME(3) NOT NULL,
  KEY ix_user (user_id, captured_at), KEY ix_device (device_id, captured_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS AnalyticsUserState (
  user_id INT NOT NULL PRIMARY KEY,
  first_seen_at DATETIME(3) NULL, first_seen_by_app JSON NULL,
  last_seen_at DATETIME(3) NULL, last_seen_app TINYINT UNSIGNED NULL,
  last_ip VARBINARY(16) NULL, last_geo_id INT UNSIGNED NULL,
  last_login_at DATETIME(3) NULL, last_login_method VARCHAR(20) NULL,
  total_sessions INT UNSIGNED NOT NULL DEFAULT 0,
  excluded TINYINT(1) NOT NULL DEFAULT 0,
  KEY ix_last_seen (last_seen_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS AuthEvent (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  occurred_at DATETIME(3) NOT NULL,
  kind ENUM('login','otp','google','password_reset','app_launch','logout','suspend','reactivate','password_change','scheme_verify') NOT NULL,
  outcome ENUM('success','failure','info') NOT NULL,
  reason VARCHAR(40) NULL, method VARCHAR(20) NULL,
  user_id INT NULL, username_attempted VARCHAR(120) NULL,
  app TINYINT UNSIGNED NULL, initiator VARCHAR(20) NULL, actor_id INT NULL,
  device_id CHAR(22) NULL, ip VARBINARY(16) NULL, geo_id INT UNSIGNED NULL, ua_id INT UNSIGNED NULL,
  KEY ix_time (occurred_at), KEY ix_user (user_id, occurred_at),
  KEY ix_ip (ip, occurred_at), KEY ix_username (username_attempted, occurred_at),
  KEY ix_device (device_id, occurred_at)
) ENGINE=InnoDB;

-- Rollups (Kigali days)
CREATE TABLE IF NOT EXISTS AnalyticsUserDay (
  day DATE NOT NULL, user_id INT NOT NULL, app TINYINT UNSIGNED NOT NULL,
  sessions SMALLINT UNSIGNED NULL, page_views INT UNSIGNED NOT NULL DEFAULT 0,
  events INT UNSIGNED NOT NULL DEFAULT 0, engagement_ms INT UNSIGNED NOT NULL DEFAULT 0,
  key_events SMALLINT UNSIGNED NOT NULL DEFAULT 0, logins SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 0, first_at DATETIME(3) NULL, last_at DATETIME(3) NULL,
  source ENUM('live','backfill') NOT NULL DEFAULT 'live',
  PRIMARY KEY (day, user_id, app), KEY ix_user_day (user_id, day)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS AnalyticsDeviceDay (   -- visitors (no user that day)
  day DATE NOT NULL, device_id CHAR(22) NOT NULL, app TINYINT UNSIGNED NOT NULL,
  sessions SMALLINT UNSIGNED NOT NULL DEFAULT 0, page_views INT UNSIGNED NOT NULL DEFAULT 0,
  engagement_ms INT UNSIGNED NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 0,
  is_bot TINYINT(1) NOT NULL DEFAULT 0, geo_id INT UNSIGNED NULL,
  PRIMARY KEY (day, device_id, app)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS AnalyticsFeatureDay (
  day DATE NOT NULL, app TINYINT UNSIGNED NOT NULL, feature VARCHAR(80) NOT NULL, audience ENUM('user','visitor') NOT NULL,
  views INT UNSIGNED NOT NULL DEFAULT 0, users INT UNSIGNED NOT NULL DEFAULT 0, engaged_users INT UNSIGNED NOT NULL DEFAULT 0,
  engagement_ms BIGINT UNSIGNED NOT NULL DEFAULT 0, events INT UNSIGNED NOT NULL DEFAULT 0, key_events INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (day, app, feature, audience)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS AnalyticsDimDay (     -- browser, os, device_type, standalone, release, entry_kind, referrer_host, landing, exit, network
  day DATE NOT NULL, app TINYINT UNSIGNED NOT NULL, dim VARCHAR(24) NOT NULL, value VARCHAR(191) NOT NULL, audience ENUM('user','visitor') NOT NULL,
  users INT UNSIGNED NOT NULL DEFAULT 0, sessions INT UNSIGNED NOT NULL DEFAULT 0, views INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (day, app, dim, value, audience)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS AnalyticsGeoDay (
  day DATE NOT NULL, app TINYINT UNSIGNED NOT NULL, geo_id INT UNSIGNED NOT NULL, audience ENUM('user','visitor') NOT NULL,
  users INT UNSIGNED NOT NULL DEFAULT 0, sessions INT UNSIGNED NOT NULL DEFAULT 0, views INT UNSIGNED NOT NULL DEFAULT 0,
  failed_logins INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (day, app, geo_id, audience)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS AnalyticsHourly (
  day DATE NOT NULL, hour TINYINT UNSIGNED NOT NULL, app TINYINT UNSIGNED NOT NULL,
  users INT UNSIGNED NOT NULL DEFAULT 0, visitors INT UNSIGNED NOT NULL DEFAULT 0, sessions INT UNSIGNED NOT NULL DEFAULT 0,
  views INT UNSIGNED NOT NULL DEFAULT 0, logins INT UNSIGNED NOT NULL DEFAULT 0, failed_logins INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (day, hour, app)
) ENGINE=InnoDB;

-- Catalog, governance, control
CREATE TABLE IF NOT EXISTS AnalyticsFeature (
  app TINYINT UNSIGNED NOT NULL, feature_key VARCHAR(80) NOT NULL, label VARCHAR(120) NOT NULL, module VARCHAR(60) NULL,
  patterns JSON NULL, is_event TINYINT(1) NOT NULL DEFAULT 0, key_event TINYINT(1) NOT NULL DEFAULT 0,
  is_public TINYINT(1) NOT NULL DEFAULT 0, version VARCHAR(20) NULL, updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (app, feature_key)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS AnalyticsWatch (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  target_kind ENUM('user','device','ip') NOT NULL,
  target_user_id INT NULL, target_device_id CHAR(22) NULL, target_cidr VARCHAR(50) NULL,
  created_by INT NOT NULL, reason TEXT NOT NULL, rules JSON NOT NULL, channels JSON NOT NULL,
  starts_at DATETIME(3) NOT NULL, expires_at DATETIME(3) NOT NULL,
  status ENUM('active','revoked','expired') NOT NULL DEFAULT 'active',
  target_notified_at DATETIME(3) NULL, revoked_by INT NULL, revoked_at DATETIME(3) NULL, revoke_reason TEXT NULL,
  KEY ix_target_user (target_user_id, status), KEY ix_status (status, expires_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS AnalyticsAlert (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  watch_id INT UNSIGNED NULL, rule VARCHAR(40) NOT NULL, severity ENUM('info','warning','critical') NOT NULL DEFAULT 'info',
  target_user_id INT NULL, target_device_id CHAR(22) NULL, ip VARBINARY(16) NULL,
  fired_at DATETIME(3) NOT NULL, payload JSON NULL, delivered JSON NULL,
  ack_by INT NULL, ack_at DATETIME(3) NULL,
  KEY ix_fired (fired_at), KEY ix_unacked (ack_at, fired_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS AnalyticsBlock (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('device','ip','cidr') NOT NULL, value VARCHAR(50) NOT NULL,
  reason TEXT NOT NULL, created_by INT NOT NULL, created_at DATETIME(3) NOT NULL, expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL, KEY ix_active (kind, value, expires_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS MonitorAccessLog (      -- append-only: no UPDATE/DELETE path exists in code
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  at DATETIME(3) NOT NULL, viewer_id INT NOT NULL, action VARCHAR(40) NOT NULL,
  target_user_id INT NULL, target_device_id CHAR(22) NULL, target_ip VARBINARY(16) NULL,
  reason TEXT NULL, detail JSON NULL, viewer_ip VARBINARY(16) NULL,
  KEY ix_viewer (viewer_id, at), KEY ix_target (target_user_id, at), KEY ix_at (at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS AnalyticsSetting (
  setting_key VARCHAR(60) NOT NULL PRIMARY KEY, value JSON NOT NULL,
  updated_by INT NULL, updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB;
INSERT IGNORE INTO AnalyticsSetting (setting_key, value, updated_at) VALUES
 ('collect_enabled','true',UTC_TIMESTAMP(3)), ('session_timeout_min','30',UTC_TIMESTAMP(3)),
 ('engaged_seconds','10',UTC_TIMESTAMP(3)), ('idle_after_s','120',UTC_TIMESTAMP(3)),
 ('offline_after_s','90',UTC_TIMESTAMP(3)), ('background_ttl_s','600',UTC_TIMESTAMP(3)),
 ('raw_retention_months','13',UTC_TIMESTAMP(3)), ('session_retention_months','25',UTC_TIMESTAMP(3)),
 ('campus_cidrs','[]',UTC_TIMESTAMP(3)), ('precise_location','"off"',UTC_TIMESTAMP(3)),
 ('dormant_days','14',UTC_TIMESTAMP(3)), ('bot_threshold','60',UTC_TIMESTAMP(3)),
 ('school_hours','{"from":"07:00","to":"18:00","days":[1,2,3,4,5]}',UTC_TIMESTAMP(3));
CREATE TABLE IF NOT EXISTS AnalyticsSavedView (  -- Phase 6
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, owner_id INT NOT NULL, kind VARCHAR(20) NOT NULL,
  name VARCHAR(120) NOT NULL, definition JSON NOT NULL, shared TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB;
```

**Partitions and the migration runner:**
- `ALTER TABLE … PARTITION` is not idempotent. `scripts/run-migration.ts` (local) and the prod `mysql` pipe run 095's partition DDL **only on CREATE**.
- Later partitions are managed only by the nightly job (`rollup.ts` `ensurePartitions()`), which checks `information_schema.PARTITIONS` first.

**Backfill** (`backend/scripts/activity-backfill.ts`, idempotent):
- **From `ActivityLog LOGIN_SUCCESS`** → `AuthEvent(kind=login, outcome=success, ip=NULL)` and `AnalyticsUserState.last_login_at`.
- **From `SSOCode`** → `AuthEvent(app_launch)`.
- **From both** → `AnalyticsUserDay` rows with `source=backfill` and `logins=n`.

The "who accessed, by day/week/month" reports therefore have history from day one. Engagement, IP and location data start at go-live, and the UI says so.

---

## 13. Privacy, compliance and governance

These are now **required for go-live**, given D1 to D3.

Rwanda's **Law N° 058/2021 on the protection of personal data and privacy** treats IP addresses, location data and online identifiers as personal data. Most monitored users are **minors**.

> *This section is engineering guidance, not legal advice. Items marked ⚖ need confirmation from the school's legal or data-protection lead before go-live.*

1. **Lawful basis and registration ⚖.**
   - Document the basis for each purpose: security, service operation, safeguarding, adoption.
   - Confirm the school (the controller) is **registered with NCSA**, the supervisory authority, and that this processing is in the declared purposes.
2. **Cross-border storage ⚖.**
   - All NGA data, not only analytics, is stored on AWS **eu-north-1 (Stockholm)**.
   - Storing personal data outside Rwanda needs NCSA authorisation under the law.
   - This is a **platform-wide** item that predates this feature. Full IPs and locations raise the stakes.
   - Confirm the authorisation exists, or plan a Rwanda or Africa region.
3. **Transparency.**
   - Add a "Platform activity and monitoring" section to `/privacy` and each app's legal page. It must state:
     - what is collected: pages, features, times, devices, full IP addresses and the approximate location derived from them, sign-in attempts, and (if enabled) precise location;
     - who can see it, why, for how long, and how to request a copy or deletion.
   - **Public pages:** a slim, non-blocking notice bar: "This site records visits, including your IP address and approximate location, for security and service quality. Privacy notice." The `nga_notice_seen` cookie remembers that it was dismissed.
   - **Signed-in users:** a one-time in-app notice after go-live, acknowledged with `AuthEvent info notice_ack`.
4. **Children ⚖.**
   - Confirm that enrolment and ICT acceptable-use documents (parent or guardian consent) cover activity monitoring.
   - Update them if not.
   - The notice must be readable by students.
5. **Retention** (configurable downwards only):

   | Data | Retention |
   |---|---|
   | Raw events, including IPs | 13 months |
   | Sessions, IP history, devices, location fixes | 25 months |
   | Auth events | 24 months |
   | Alerts | 12 months |
   | Rollups | 5 years (they hold no IPs) |
   | Access log | 5 years |
   | Visitor devices inactive for 13 months | purged, with their IP rows |

6. **Minimisation.**
   - Never collected: content, form values, query strings, ids in paths, search text, keystrokes, screenshots or replays.
   - Precise location is **off** by default (§7.5).
7. **Accountability.**
   - Six separate capabilities.
   - An append-only access log with a viewer page.
   - Reasons required for controls, watches and enabling precise location.
   - **Watched people are notified (D2).**
   - Admins cannot monitor admins without `ANALYTICS_CONFIGURE`.
   - A quarterly access-log review appears as a reminder in the console.
8. **Rights.** Export and delete per user or device (§10.3), and My activity for self-service.
9. **Purpose limitation.** The console's About panel states that usage data is not used for marks, appraisal or discipline without a separate documented process.

---

## 14. Admin console: MIS frontend `/analytics/*`

**Navigation:**
- A new Sidebar group, **"Platform → Usage & Monitoring"** (`Activity` icon).
- It shows when `can("ANALYTICS_VIEW") || can("ANALYTICS_LIVE_VIEW")`.

**Files:**
- Pages: `frontend/src/components/analytics/`
- Routes: in `App.tsx`, using the usual `ProtectedRoute` and `SystemLayoutWrapper` pattern
- API module: `frontend/src/api/monitor.ts`
- Map: `components/analytics/map/` (Leaflet, lazy-loaded)

**Global toolbar** (sticky):
- **Date range:** Today, Yesterday, Last 7/28/90 days, This week, This month, **This term**, **This academic year** (from `AcademicPeriodContext`), Custom.
- **Granularity:** Day/Week/Month.
- **Compare:** previous period, or the same period last year.
- **App:** All, MIS, Task Mentor, Tendo, Tupo.
- **Audience:** Users, Visitors, Both.
- **Segments:** user type, programme, grade, class group, role, country/city, network. Up to **4 comparison series**.
- **State lives in the URL**, so every view is shareable.

| # | Page | Contents |
|---|---|---|
| 1 | **Overview** `/analytics` | KPIs with comparison deltas: accessed users, active users, **visitors**, new users, sessions, engagement rate, average engagement time, views, key events, login success rate. Charts: DAU/WAU/MAU with a stickiness toggle, usage by app (stacked area), adoption by user type, users vs visitors. Also top features, top countries and cities, a "Right now" mini-card, and anomaly callouts (z-score on `FeatureDay`/`UserDay`, e.g. "Teacher WAU −18% w/w") |
| 2 | **Realtime** `/analytics/realtime` | Online now (active / idle / background) by app, users vs visitors. **Per-minute bars for the last 30 min** and a "last 5 min" figure. A **live map**. **Who's online** roster: avatar or visitor code, name/type/role, **app → feature → page** (live), status, device and PWA, **IP · ≈city · ISP**, campus flag, since. Row actions: User/Visitor 360, watch, sign out, block. Cards: top features now, **live event stream** (logins, failed logins, launches, key events, errors), sign-ins in the last 30 min. With only `ANALYTICS_VIEW`, counts and aggregate map only. |
| 3 | **Access & Logins** `/analytics/access` | **Who accessed, by day/week/month:** a list of users with first and last access, days active, sessions, apps, last IP and place (CSV export). Logins over time (success vs failed); **hour × weekday heatmap**; method split; **SSO app launches per app**; **failed-login explorer** (username attempted, user if matched, IP, ≈place, ISP, device/visitor, reason, count); credential-stuffing and brute-force flags; blocked IPs and devices. |
| 4 | **Audience** `/analytics/audience` | User directory with last seen (app, IP, place), sessions, active days, engagement, devices and status. Saved filters: **Dormant**, **Never signed in**, **Power users**, **New**, **Signed in from a new country (30 d)**. Adoption % by type, programme, grade, class group and role. |
| 5 | **Visitors** `/analytics/visitors` | Public visitors: list by last seen with code, ≈place, ISP, device, pages, sessions, sign-in attempts, linked account, bot score. Tabs: **Humans**, **Bots**, **Converted** (later signed in). Charts: visitors over time, entry pages, referrers and UTMs, visitor-to-sign-in conversion. |
| 6 | **Engagement** `/analytics/engagement` | Features and pages (views, users, views per user, average engagement, reach, key events; module → route drill-down), Events, Landing/Exit, Key events (trend and conversion), Scroll depth on public pages |
| 7 | **Apps** `/analytics/apps` | App scorecards; **cross-app flows** (Sankey of `app_path`); entry kinds (SSO launch, PWA, direct, push, referral) |
| 8 | **Retention** `/analytics/retention` | New vs returning; **cohort grid** (weekly or monthly); user lifetime |
| 9 | **Locations** `/analytics/locations` | Map plus country/region/city table (users, visitors, sessions, failed logins); ISP/ASN table; connection type; campus vs off-campus trend; top IPs with users-per-IP; GeoIP attribution and database age |
| 10 | **IP lookup** `/analytics/ip/:ip` | §7.4 |
| 11 | **Technology** `/analytics/technology` | Browser, OS, device type, **PWA vs tab** per app, **release adoption**, screen sizes, **web vitals** p75 per feature, **JS errors** by message and feature with affected users |
| 12 | **Explore** `/analytics/explore` (Phase 6) | Funnel (≤10 steps, open/closed, within session or N days, breakdown); Path (forward/backward, 5 levels); saved views |
| 13 | **User 360** `/analytics/users/:id` · **Visitor 360** `/analytics/visitors/:code` | §10.2 |
| 14 | **Watchlist & Alerts** `/analytics/watchlist` | Active watches (target, rules, expiry, notified ✓); create watch (target picker: user, visitor or IP; rule builder; reason; expiry; channels); alert inbox with acknowledge; security alerts |
| 15 | **Settings** `/analytics/settings` (`ANALYTICS_CONFIGURE`) | Thresholds, retention, campus ranges, precise-location policy (reason required), excluded accounts, bot threshold and overrides, kill switch. **Catalog health** (uncatalogued routes). **Ingest health** (events/min per app, rejects, buffer depth, rollup duration, GeoIP age). **DebugView**. **Access log viewer**. |
| 16 | **My activity** `/me/activity` (every signed-in user) | §10.5 |

**Wireframe, Realtime (desktop; on mobile the columns stack and the map collapses):**

```
┌ Usage & Monitoring › Realtime ─────────────────────────────── [App: All ▾] [Users+Visitors ▾] ┐
│ ● 214 online   ◐ 37 idle   ○ 52 background   · 18 visitors    Last 5 min: 241                │
│ ▁▂▃▅▆▇▇▆▅▆▇█▇▆▅▅▆▇▇▆▅▄▅▆▇▇▆▅▆▇  (per minute, last 30 min, stacked by app)                    │
├──────────────────────────────────────────┬───────────────────────────────────────────────────┤
│  [ map: bubbles per city, by app ]       │ Top features now          Live events              │
│                                          │ TM · Taking a quiz   61   09:41 ✓ login  J. Uwase  │
│                                          │ MIS · Timetable      34   09:41 ✗ login  "admin"…  │
│                                          │ Tupo · Chat          29   09:40 ↗ TM launch …      │
├──────────────────────────────────────────┴───────────────────────────────────────────────────┤
│ Who's online   [search name / IP]  [type ▾] [programme ▾] [feature ▾]                         │
│ ● Jean Uwase  Teacher · S4   TM › Course gradebook › /courses/:id/grades  ⌂campus 102.22.x.x  │
│   Chrome · Win · PWA   since 08:12                                     [360] [Watch] [Sign out]│
│ ◐ V-7KQ2M  Visitor   MIS › Sign-in page   ≈Huye · MTN Rwanda (mobile)  since 09:39  [360][Block]│
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Wireframe, User 360:**

```
┌ ← Audience   Jean Uwase · Teacher · S4 Sciences            ● Online — TM › Gradebook (12 min) ┐
│ Last login 08:12 · password+OTP · 102.22.x.x ≈Kigali · Liquid (fixed) · campus               │
│ [Sign out everywhere] [Suspend] [Message] [Watch] [Manage access] [Export] [⋯]                │
├ Summary (Last 28 days) ───────────────────────────────────────────────────────────────────────┤
│ Active days 19 · Sessions 41 · Engagement 23 h · Key events 57   [calendar heatmap 12 months] │
├ Tabs: Timeline | Features | Devices | Network & location | Security | Watches | Accountability ┤
│ ▾ Tue 30 Sep · 08:12–10:05 · MIS › TM › MIS · 1 h 41 m engaged · 102.22.x.x                  │
│    08:12 login (password+OTP)   08:12 MIS Home   08:14 → TM launch   08:14 TM Dashboard …     │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Charts:**
- Built with recharts, following the `dataviz` skill.
- **App colours are fixed across all pages:** MIS, TM, Tendo, Tupo.
- Every chart has a table view and CSV export.
- CSV exports that contain names or IPs are written to the access log.

**Accessibility:** extend `backend/scripts/access-ux/ux-audit.cjs` and `ui-flows.cjs` to all of these pages (axe WCAG AA, 2 themes × 3 viewports, keyboard). Map pages also get a table alternative.

---

## 15. API contracts (key shapes)

**`POST /activity/sync`, `POST /api/activity` (browser → collector or relay)**

```json
{ "v":1, "app":"tm", "did":"q3Vx…22", "dt":"hmac…", "tab":"t_8f2a", "rel":"2026.10.03-1",
  "sent_at":1790000000123, "tz":"Africa/Kigali", "lang":"en-RW", "scr":"1920x1080@1", "vp":"1440x780",
  "events":[
    {"id":"01JABC…","n":"page_view","t":1790000000000,"pv":"p_91x","r":"/courses/:id/grades","f":"tm.course.grades",
     "p":{"nav":"push","ref_route":"/courses/:id"}},
    {"id":"01JABD…","n":"user_engagement","t":1790000029000,"pv":"p_91x","p":{"ms":28750}}
  ],
  "beat":{"r":"/courses/:id/grades","f":"tm.course.grades","vis":"visible","idle":false,"standalone":true,"net":"4g"} }
```

Response: `202 {"ticket":"…","cfg":{"v":7}, "did"?:"…", "dt"?:"…", "cmd"?:{"type":"end"}}`

**`POST /activity/ingest` (relay → MIS, gzip, Basic):** `{ "app":"tm", "batches":[ { "user_id": 412 | null, "ip":"102.22.1.9", "ua":"…", "lang":"…", "envelope": { …as above… } } ], "server_events":[ {"id":"…","n":"tm.quiz.submit","t":…,"user_id":412,"did":"…","p":{…}} ] }` → `202 {"accepted":n,"rejected":m}`

**`GET /monitor/live` (snapshot; the stream sends the same shape as diffs)**

```json
{ "at":"2026-10-01T07:41:02Z",
  "counts":{"active":214,"idle":37,"background":52,"visitors":18,"by_app":{"mis":90,"tm":101,"tendo":31,"tupo":47}},
  "minutes":[{"m":"07:12","mis":81,"tm":95,"tendo":29,"tupo":40,"visitors":12}],
  "people":[{"key":"u:412","user":{"id":412,"name":"Jean Uwase","type":"TEACHER","role":"Teacher"},
             "status":"active","since":"2026-10-01T06:12:00Z",
             "tabs":[{"app":"tm","feature":"tm.course.grades","label":"Course gradebook","route":"/courses/:id/grades",
                      "status":"active","device":{"browser":"Chrome","os":"Windows","pwa":true},
                      "ip":"102.22.1.9","geo":{"city":"Kigali","country":"RW","isp":"Liquid","conn":"fixed","approx":true},
                      "network":"campus"}]},
            {"key":"d:q3Vx…","visitor":{"code":"V-7KQ2M","bot":false,"linked":[]},"status":"active", "tabs":[…]}],
  "top_features":[{"app":"tm","feature":"tm.quiz.take","label":"Taking a quiz","n":61}],
  "events":[{"at":"…","kind":"login_failed","username_attempted":"admin","ip":"…","geo":{…}}] }
```

**Report endpoints:** all are `GET` with `?from=YYYY-MM-DD&to=…&gran=day|week|month&app=tm,tupo&aud=user|visitor|both&compare=prev|yoy&seg=type:TEACHER,program:12`, and all return `{ series?:[…], rows?:[…], totals:{…}, compare?:{…}, meta:{tz, generated_at, suppressed:boolean, sources:["live","backfill"]} }`.

**Full `/monitor` route list:**

| Area | Routes |
|---|---|
| Reports | `/overview` · `/timeseries?metric=` · `/access/users` · `/access/logins` · `/access/heatmap` · `/access/failed` · `/audience` · `/visitors` · `/engagement/{features,events,landing,scroll}` · `/apps` · `/apps/flows` · `/retention/cohorts` · `/locations` · `/locations/isps` · `/ip/:ip` · `/technology?dim=` · `/errors` · `/vitals` · `POST /funnel` · `/paths` |
| Live | `/live` · `POST /live/ticket` · `/live/stream` |
| Users | `/users/:id` (+ `/timeline`, `/sessions`, `/devices`, `/network`, `/locations`, `/security`, `/export`) · `POST /users/:id/{signout,signout-device,suspend,reactivate,message,exclude}` · `DELETE /users/:id/data` |
| Visitors | `/visitors/:code` (+ `/timeline`, `/export`) · `POST /visitors/:code/{block,bot}` · `DELETE /visitors/:code/data` |
| Watches and alerts | `/watches` (GET, POST) · `DELETE /watches/:id` · `/alerts` · `POST /alerts/:id/ack` |
| Blocks | `/blocks` (GET, POST) · `DELETE /blocks/:id` |
| Settings and admin | `/settings` (GET, PUT) · `PUT /catalog/:app` · `/catalog/health` · `/ingest/health` · `/access-log` · `/debug/stream` |
| Self | `/me/activity` (any authenticated user) |

---

## 16. Implementation file map

### 16.1 MIS backend

| Path | New/Edit | Purpose |
|---|---|---|
| `backend/migrations/095_platform_activity.sql` | NEW | §12 |
| `backend/src/db/activitySchema.ts` | NEW | Drizzle objects |
| `backend/src/app.ts` | EDIT | `trust proxy`; mount `/activity` **before** `express.json`; mount `/monitor` |
| `backend/src/middleware/requestLogger.ts` | EDIT | G4 redaction; skip bodies for `/activity/*` |
| `backend/src/middleware/activityAuth.ts` | NEW | Light JWT, cached `token_version`, beacon ticket, anonymous guard (§5.6) |
| `backend/src/middleware/rateLimit.ts` | NEW | In-memory token bucket (G6), used by `/activity/*` and `/auth/login` |
| `backend/src/routes/activity.ts`, `routes/monitor.ts` | NEW | §15 |
| `backend/src/services/activity/schema.ts` | NEW | zod envelopes |
| `backend/src/services/activity/ingest.ts` | NEW | validate → enrich → dedupe → buffer → bulk insert; SIGTERM flush |
| `backend/src/services/activity/enrich.ts`, `geoip.ts`, `ua.ts`, `network.ts`, `bot.ts` | NEW | §5.3, §7, §8 |
| `backend/src/services/activity/sessionizer.ts`, `presence.ts` | NEW | §9.1, §9.4 |
| `backend/src/services/activity/rollup.ts`, `partitions.ts` | NEW | §9.3 |
| `backend/src/services/activity/reports/*.ts` | NEW | One module per report page |
| `backend/src/services/activity/userMonitor.ts`, `visitorMonitor.ts` | NEW | 360s and controls |
| `backend/src/services/activity/watchMatcher.ts`, `alerts.ts` | NEW | §10.4; delivery through `notifyUser` + `webPush` + `channels.ts` |
| `backend/src/services/activity/accessLog.ts` | NEW | `withMonitorAccess(action)` route wrapper |
| `backend/src/services/activity/blocklist.ts` | NEW | Checked in `/auth/login` and anonymous ingest |
| `backend/src/controllers/authController.ts`, `ssoController.ts`, `schemeOfWork` verify | EDIT | §5.5 events, blocklist check |
| `backend/src/routes/users.ts` / `activityController.ts` | EDIT | G5 |
| `backend/src/access/{manifest,v2Only,presets}.ts`, `services/access/insights.ts` | EDIT | §11 |
| `backend/src/index.ts` | EDIT | Start jobs (`ACTIVITY_JOBS`); load GeoIP; reload open sessions |
| `backend/scripts/{activity-backfill.ts, geoip-update.sh, activity-smoke.mjs}` | NEW | Backfill, GeoIP refresh, prod smoke test |
| `backend/scripts/activity-e2e/*.cjs`, `scripts/activity-load/*.mjs` | NEW | §18 |
| `backend/package.json` | EDIT | add `zod`, `maxmind`, `ulid` (or an inline ULID) |
| `ecosystem.config.js` | EDIT | `kill_timeout: 8000` |
| `docs/PLATFORM_ACTIVITY.md` | NEW | Operator guide: env, GeoIP, deploy, catalog, privacy notice text, runbook |

**Environment variables:**

| Variable | Default / purpose |
|---|---|
| `ACTIVITY_COLLECT` | `on` |
| `ACTIVITY_JOBS` | `true` |
| `ACTIVITY_SECRET` | HMAC key for device tokens and tickets |
| `ACTIVITY_SOURCE_CLIENTS` | Satellites allowed to send activity |
| `ACTIVITY_ORIGINS` | Origins allowed to post activity |
| `ACTIVITY_TZ` | `Africa/Kigali` |
| `GEOIP_PROVIDER` | `dbip` or `maxmind` |
| `GEOIP_DIR` | `/var/lib/nga-geo` |
| `MAXMIND_LICENSE_KEY` | Optional; only with `GEOIP_PROVIDER=maxmind` |

### 16.2 MIS frontend

| Path | New/Edit | Purpose |
|---|---|---|
| `frontend/src/vendor/nga-activity/*` | NEW (synced) | SDK |
| `frontend/src/main.tsx`, `App.tsx` | EDIT | `initActivity`; tracker inside the router; `/analytics/*` and `/me/activity` routes |
| `frontend/src/activity.catalog.ts`, `scripts/gen-activity-catalog.mjs` | NEW | §5.4 |
| `frontend/src/api/monitor.ts` | NEW | API client |
| `frontend/src/components/analytics/{Overview,Realtime,Access,Audience,Visitors,Engagement,Apps,Retention,Locations,IpLookup,Technology,Explore,User360,Visitor360,Watchlist,Settings}.tsx` | NEW | Pages |
| `frontend/src/components/analytics/{Toolbar,KpiTile,TimeSeries,CohortGrid,Sankey,Heatmap,LiveRoster,LiveMap,TimelineList}.tsx` | NEW | Shared pieces |
| `frontend/src/hooks/{useMonitorRange,useLiveStream}.ts` | NEW | URL-state range; SSE with polling fallback (pattern: `useCourseLive.ts`) |
| `frontend/src/components/me/MyActivity.tsx` | NEW | §10.5 |
| `frontend/src/components/public/NoticeBar.tsx`; `/privacy` page | NEW/EDIT | §13 |
| `components/ui/Sidebar.tsx` | EDIT | Nav group |
| `frontend/package.json` | EDIT | add `leaflet` (lazy chunk) |

### 16.3 Satellites

| App | Work |
|---|---|
| **All three** | **Code:** vendor the SDK and relay via `sync.mjs`; add `activity.catalog.ts` with a generator and a "every route catalogued" test; add the relay routes (optional auth, origin check, anonymous rate limit); PUT the catalog on boot; `data-track` on about 10 key actions; `relay.track()` server key events; notice bar on public pages; privacy text. **Production config:** `SSO_CLIENT_ID` must be listed in MIS `ACTIVITY_SOURCE_CLIENTS`. |
| **Task Mentor** | Tracker inside `<Router>` in `client/src/App.tsx`; it covers `/login`, `/sso/callback` and the `noLayout` quiz routes. Patterns come from `appRoutes`. Key events: `tm.quiz.start/submit`, `tm.assignment.submit`, `tm.grade.save`, `tm.question.generate`. Relay: `server/src/routes/activity.ts`. Already has `trust proxy 1`. Mind the `/taskmentor/` base path in dev. **Never** add tracking to `live-server`. |
| **Tendo** | **G2:** `app.set('trust proxy','loopback')` in `server/src/app.ts`. Tracker inside `<BrowserRouter>` in `client/src/App.tsx`. Patterns are listed from the inline routes. Key events: `tendo.register.save`, `tendo.incident.create`, `tendo.excuse.approve`. Relay: `server/src/routes/activity.ts`. |
| **Tupo** | **G2/G3:** `trust proxy` in `apps/api/src/app.ts`, plus a guest-limiter regression test. The tracker goes in `App.tsx` inside the router (**not** AppShell), so `/` and `/meet/:idOrCode` are covered. Patterns are `/app/<module>/…`. Key events: `tupo.chat.send` (count only), `tupo.mail.send`, `tupo.feed.post`, `tupo.meet.join`, `tupo.meet.guest_join {display_name}`. Relay: `apps/api/src/routes/activity.ts`. Its `/app/admin/dashboard` stays as is and gains a "Platform view" link to MIS `/analytics?app=tupo`. |

---

## 17. Phased delivery and task checklist

| Phase | Scope | Exit criteria | Estimate |
|---|---|---|---|
| **0. Groundwork** | Worktree from `origin/main`; G1–G6; capabilities + v2Only + presets; migration 095 + `activitySchema.ts`; settings; privacy text draft; ⚖ items sent to legal | 095 applies on a fresh DB and re-runs cleanly; no legacy output contains `ANALYTICS_`; Tupo guest limiter is per-IP | 4 days |
| **1. MIS core + Realtime** | SDK; `/activity/sync` (auth + anonymous); ingest + dedupe + buffer; sessionizer; presence + SSE; §5.5 server events; backfill; MIS SPA instrumented (public pages too); **Realtime** page; last-seen column on the user list | Two users and one public visitor appear on Realtime within 5 s with the correct feature; a hidden tab goes to background, and a closed one to offline within 90 s; failed logins recorded with username, IP and device | 1.5 weeks |
| **2. Satellites** | Relay package; `/activity/ingest` + allowlist; catalogs, generators and tests; trackers in TM, Tendo and Tupo, including public pages and guest meet; key events; deploy | One session MIS → TM → Tupo produces one `AnalyticsSession` with `app_path mis>tm>tupo`; a satellite visitor's later sign-in stitches; a relay outage never affects the app | 1 week |
| **3. IP intelligence, visitors, bots** | GeoIP and ASN loader and update script; enrichment; `AnalyticsIp`/`UserIp`; bot scoring and overrides; blocklist; **Locations**, **IP lookup**, **Visitors** pages; live map | Known IPs resolve correctly (fixtures for MTN, Airtel, Liquid, AWS, private); bot UAs are excluded from counts but listed; a blocked IP gets 403 on login | 1 week |
| **4. Reports** | Rollups; Overview, Access & Logins, Audience, Engagement, Apps, Retention, Technology; toolbar with compare and segments; exports; Insights widgets | Rollups reconcile with raw recounts on a fixture; Kigali-midnight tests pass; ux-audit shows 0 findings | 1.5 weeks |
| **5. 360s and control** | User 360, Visitor 360; controls; watchlist with **target notification** (D2) and all rules; security alerts; access log and viewer; **My activity**; public notice bar and the in-app notice | Sign-out-everywhere ends sessions in all 4 apps (live smoke test like SLO); watch create, revoke and expiry each notify the target; `comes_online` alert arrives within 15 s; every per-person call writes an access-log row | 1 week |
| **6. Explore and hardening** | Funnel, Path, saved views; web vitals and errors; optional precise location (setting, SDK, fixes, map); partition rotation; load test; DebugView; docs | 1,000 synthetic tabs: ingest p95 under 15 ms, MIS RSS under 350 MB; partition rotation verified on a production copy | 1 week |

**Total ≈ 8 weeks** for one developer. Phases 1 and 2 overlap once the envelope (§15) is frozen, and Phase 3 can run in parallel with Phase 4 for a second developer.

**Checklist** (tick here as work lands):
- [ ] P0: worktree, G1–G6, capabilities, 095, schema, settings, privacy draft, legal questions sent
- [ ] P1: SDK + tests; collector + light auth + anonymous guard; ingest/dedupe; sessionizer; presence/SSE; server auth events; backfill; MIS instrumentation; Realtime page
- [ ] P2: relay + tests; ingest allowlist; TM, Tendo and Tupo trackers, catalogs and key events; deploys
- [ ] P3: GeoIP + update cron; enrichment; bots; blocklist; Locations, IP lookup and Visitors pages; live map
- [ ] P4: rollups; 7 report pages; toolbar; exports; Insights widgets
- [ ] P5: User and Visitor 360; controls; watches with notifications; alerts; access log; My activity; notices
- [ ] P6: Explore; vitals and errors; precise location (off by default); partitions; load test; docs

---

## 18. Testing

| Layer | Tests |
|---|---|
| **SDK** (vitest + jsdom, `packages/activity`) | Route → pattern (ids, query and hash stripped; unknown routes → other); same-pattern `replace` sends no view; engagement only while visible, focused and recently active (fake timers, visibility and focus events); flush on hide and on route change; heartbeat cadence and stop when hidden; keepalive → beacon fallback with ticket; offline cap and expiry; account switch resets; device cookie mirrored to localStorage; precise location requested only when config allows, and never again after a denial |
| **Relay** | Server user id stamped (any client `user_id` ignored); visitor batches go through with `user_id=null`; foreign origin rejected; anonymous rate limit; coalescing; bounded drop; MIS down → app still returns 204 |
| **Collector** (supertest on a real test DB, `src/__tests__/activity*.test.ts`) | Light auth rejects a revoked `token_version` within 30 s; a client not in `ACTIVITY_SOURCE_CLIENTS` gets 403 even with valid Basic credentials; a relay cannot write as another app; anonymous batch without a valid `dt` → new did; event allowlist; size limits; deterministic `occurred_at` under skew, with retry dedupe across restarts (in-memory set cleared); 72 h clamp; kill switch → 202 with nothing stored; the 30 MB global parser does not apply to `/activity` |
| **Enrichment** | GeoIP fixtures (test `.mmdb` built with `mmdbwriter`, or the DB-IP sample), IPv4/IPv6/mapped/private; ASN → connection type; campus CIDR labels; bot scoring table |
| **Sessionizer** | 30-min boundary (29:59 vs 30:01); no midnight split; cross-app same device → one session; visitor→user stitch keeps the session; user→other user starts a new session; hidden beats don't extend; restart reload; engaged rules |
| **Presence** | Status transitions with fake timers; multiple tabs count once; force sign-out drops all tabs; bots never present; SSE snapshot then diffs; ticket single-use and expiry |
| **Rollups and reports** | A fixed fixture with known DAU, WAU, MAU, engagement rate, cohorts, adoption and geo; Kigali vs UTC midnight edge cases; small-cohort suppression without `ANALYTICS_USER_VIEW`; partition create and drop on a temporary schema |
| **Access and governance** | 403 matrix of every `/monitor` route × each capability; an access-log row for every per-person call; admin-on-admin rule; watch create, revoke and expiry → target notification rows (D2); G5 fix; G3 regression |
| **E2E** (`backend/scripts/activity-e2e/e2e.cjs`, puppeteer with a `userDataDir` profile) | 1. A visitor opens MIS `/login`, fails once, then signs in as a teacher. 2. The teacher opens TM via the launcher, then Tupo. 3. The admin's Realtime shows the visitor become the teacher, then the moves MIS → TM → Tupo live, with IP and place. 4. Hiding the tab → idle/background. 5. The admin watches the teacher → the teacher's bell shows the watch notice. 6. "Sign out everywhere" → all tabs show the login page. 7. The Visitor 360 lists the failed attempt. Don't run the e2e API while vitest runs (they share the test DB). |
| **Load** (`scripts/activity-load`) | 1,000 synthetic tabs through 3 fake relays plus 200 MIS-direct tabs, 10 minutes: ingest p95, buffer depth, RSS, SSE fan-out to 5 admins |
| **UX** | `ux-audit.cjs` + `ui-flows.cjs` cover all `/analytics/*` and `/me/activity` pages: WCAG AA, 2 themes × 3 viewports, keyboard, chart/map table fallbacks |

---

## 19. Rollout and operations

1. **Before deploy:**
   - Get answers on the ⚖ items in §13.
   - Publish the privacy notice text.
   - Collect the school's egress IPs for `campus_cidrs`. They are labels only, since D3 records every IP regardless.
2. **Install GeoIP on the box:**
   - `sudo mkdir -p /var/lib/nga-geo && sudo chown ubuntu /var/lib/nga-geo`
   - Run `backend/scripts/geoip-update.sh` once.
   - Install the monthly cron entry.
3. **Deploy MIS** with migration 095:
   - Apply the migration through the `mysql` pipe, because `npm run migrate` fails on the box.
   - Deploy manually while GitHub Actions is billing-blocked.
   - Set the env vars from §16.1 and `kill_timeout` in pm2, then `pm2 save`.
4. **Smoke test:** run `node scripts/activity-smoke.mjs` on the box. It posts a batch for an excluded test user and one anonymous batch, then checks the 202 response, the presence entry, GeoIP enrichment and that the rollup includes the batch, and finally deletes the test data.
5. **Run the backfill**, then enable the console for `platform_owner`.
6. **Satellites, one by one** (Tendo, then TM, then Tupo):
   - Deploy the app with `trust proxy`, the relay and the tracker.
   - Add its client id to `ACTIVITY_SOURCE_CLIENTS`.
   - Relay smoke test: `/api/activity/config` returns 200, and the MIS ingest-health page shows the app.
7. **Turn on the notices:** the public notice bar and the one-time in-app notice.
8. **Watch the first two weeks:** check ingest health daily and review bot classification, and check that report numbers make sense against known school timetables.
9. **Kill switches:**
   - `PUT /monitor/settings {collect_enabled:false}`: clients stop within 10 minutes.
   - `ACTIVITY_COLLECT=off` followed by `pm2 reload mis-backend`: stops at once.

---

## 20. Risks

| Risk | Mitigation |
|---|---|
| Legal exposure from full IPs, location and monitoring of minors | The §13 ⚖ items gate go-live; notices; retention; access log; target notification (D2); precise location off by default |
| A single MIS process under ingest and SSE load | Relay coalescing; bounded buffers; light auth; load test; documented Redis scale-out path |
| MySQL growth (full IPs on raw events) | Monthly partitions dropped at retention; rollups hold no IPs; about 8 GB/yr estimate checked at the Phase 6 load test |
| Public ingest abuse (spoofed floods, poisoning) | Origin allowlist, device tokens, per-IP limits, event allowlist, bot scoring, blocklist |
| Misleading IP locations (mobile CGNAT, shared school NAT) | "≈ approx." labels, ISP and connection type shown, users-per-IP counts, campus labels; precise location only by explicit policy |
| Ad/tracker blockers | Neutral paths and same-origin relays; ingest health shows gaps per app |
| Shared lab PCs | Identity is the signed-in user; a person switch starts a new session; the device page lists every account seen on it |
| Lost events on unload | 30 s heartbeat carries engagement; keepalive; offline queue |
| Partition DDL not idempotent | Created only on first create; nightly `ensurePartitions()` checks `information_schema` |
| Legacy permission keyword leak (`ANALYTICS_CONFIGURE` → "admin") | `v2Only.ts`, plus a test |
| Trust and morale | Transparency, purpose limitation, My activity, notified watches, aggregates-only for leadership |
| Catalog drift | The "every route catalogued" test per app, plus the Catalog health panel |
| Timezone bugs | UTC storage, one Kigali bucketing helper, `toDbUtc`, midnight fixtures |

---

## 21. Quick reference

- **Ingest:**
  - `POST /activity/sync`: MIS SPA, signed-in or anonymous.
  - `POST /activity/ingest`: relays, Basic auth, client must be in `ACTIVITY_SOURCE_CLIENTS`.
  - `GET /activity/config`.
  - Satellite routes: `POST /api/activity`, `GET /api/activity/config`.
- **Admin API:** `/monitor/*`, plus SSE at `/monitor/live/stream?ticket=`.
- **UI:**
  - `/analytics` covers Overview, Realtime, Access, Audience, Visitors, Engagement, Apps, Retention, Locations, IP lookup, Technology, Explore, Users/:id, Visitors/:code, Watchlist and Settings.
  - `/me/activity` is each user's own view.
- **Capabilities:** `ANALYTICS_VIEW`, `ANALYTICS_LIVE_VIEW`, `ANALYTICS_USER_VIEW`, `ANALYTICS_LOCATION_VIEW`, `ANALYTICS_USER_CONTROL`, `ANALYTICS_CONFIGURE`. All are v2-only.
- **Defaults:**

  | Setting | Value |
  |---|---|
  | Session timeout | 30 min |
  | Engaged session | 10 s, 2 views, or a key event |
  | Heartbeat | 30 s |
  | Idle after | 120 s |
  | Offline after | 90 s |
  | Background TTL | 10 min |
  | Flush | every 5 s or at 20 events |
  | Bot threshold | 60 |
  | Raw data retention | 13 months |
  | Session, IP and location retention | 25 months |
  | Time zone | Africa/Kigali |
  | Precise location | off |

- **Decisions:** D1 all users and visitors monitored · D2 watched people are notified · D3 full IPs stored.
- **Cookie:** `nga_did` on `.amashuri.com` (device id), plus the `nga_dt` device token in localStorage.
- **Migration:** 095. **SDK:** `packages/activity` → `vendor/nga-activity` + `vendor/nga-activity-relay` via `sync.mjs`. **GeoIP:** `/var/lib/nga-geo/*.mmdb` (DB-IP Lite, CC BY 4.0).

---

## 22. Implementation status (2026-10-01)

All seven phases are built and tested on branch **`feat/platform-activity`**:
- **MIS:** worktree `nga_central_mis-activity`, branched from `origin/main` f2ff93ff.
- **Task Mentor, Tendo and Tupo:** one worktree each, named `<repo>-activity`.
- Nothing is pushed or deployed. Operator guide: [`docs/PLATFORM_ACTIVITY.md`](docs/PLATFORM_ACTIVITY.md).

### 22.1 What was built

| Phase | Status | Notes |
|---|---|---|
| 0 Groundwork | Done | Migration 095; G1 trust proxy (MIS, Tendo, Tupo); G4 log redaction; G5 activities authorisation; G6 rate limiter; capabilities in v2Only |
| 1 MIS core + Realtime | Done | Collector, light auth, anonymous guard, sessionizer, presence and SSE, auth events, backfill, MIS SDK instrumentation, Realtime page |
| 2 Satellites | Done | Relay, catalog, tracker and key events in TM (`b564631`, `ce7a10f`), Tendo (`4aecb8b`, `74a8c85`) and Tupo (`06b8472`, `0a0d185`; realtime gateway relay included) |
| 3 IP intelligence, visitors, bots | Done | DB-IP Lite offline lookups, bot scoring and overrides, blocklist, Locations page, IP lookup, Visitors page, live map |
| 4 Reports | Done | Rollups; Overview, Access, Audience, Engagement, Apps, Retention and Technology pages; toolbar; CSV exports |
| 5 360s and control | Done | User 360, Visitor 360, controls, watches with target notification (D2), alerts, access log, My activity, notices, privacy section 7 |
| 6 Explore and hardening | Done | Funnels, paths, leadership usage insights (`USAGE_INSIGHTS_VIEW`), load test, smoke test |

### 22.2 Tests

| Suite | Result |
|---|---|
| MIS backend analytics (5 suites) | 80 / 80 |
| Full MIS backend suite (fresh test schema) | 754 / 754. Unrelated files are flaky on the shared DB, the same as on `main` |
| MIS frontend | 576 / 576 (SDK 17, catalog 3) |
| Real-browser e2e | 103 / 103. Covers SSE live roster, cross-tab presence, the visitor → user flow, failed sign-in in the live stream, the D2 watched-person flow, sign-out everywhere ending a live tab, every page, and axe WCAG AA in 2 themes × 3 widths |
| Load test (1,000 relay tabs + 200 direct tabs, 90 s) | 0 errors; direct p95 15 ms; relay batches of about 330 tabs p95 186 ms; memory flat |
| Task Mentor | Server 526 pass / 17 fail; client 374 / 6. The failures already fail on `main` |
| Tendo | Server 298 / 2 (`homeSummary`, fails on `main`); client 13 / 13 |
| Tupo | API 462 / 463 (`feed` title test, fails on `main`); web 14 / 14; realtime 9 / 9 |

### 22.3 Where it lives

| Area | Path |
|---|---|
| Backend services | `backend/src/services/activity/`: `db`, `apps`, `ip`, `geoip`, `ua`, `bot`, `dims`, `people`, `settings`, `tokens`, `schema`, `ingest`, `sessionizer`, `presence`, `writer`, `engine`, `rollup`, `catalog`, `blocklist`, `authEvents`, `control`, `notify`, `userMonitor`, `watches`, `accessLog`, `reports/*` |
| Backend routes and middleware | `routes/activity.ts`, `routes/monitor.ts`, `middleware/activityAuth.ts`, `middleware/rateLimit.ts` |
| Frontend | `frontend/src/components/analytics/*`, `frontend/src/activity/`, `frontend/src/api/monitor.ts`, `frontend/src/hooks/useLiveStream.ts` |
| Shared SDK | `packages/activity/{src,sync.mjs}` |
| Scripts | `backend/src/scripts/activityBackfill.ts`, `backend/scripts/{geoip-update.sh, activity-smoke.mjs, activity-e2e/, activity-load/}` |

### 22.4 Deviations from the plan

1. **`ANALYTICS_ADMIN` is now `ANALYTICS_CONFIGURE`.** The access test suite forbids role keywords such as "ADMIN" in v2-only names, which the spoke apps keyword-match.
2. **Visitor 360 is addressed by device id** (`/analytics/visitors/:deviceId`). The short `V-XXXXXXX` code is a one-way hash, so it is shown but cannot be looked up.
3. **Leadership widgets use a new scopeable capability, `USAGE_INSIGHTS_VIEW`.** The `ANALYTICS_*` capabilities are school-wide only.
4. **Session ids are generated in-process** (ms × 1024 + counter), so events never wait for an insert round-trip.
5. **Analytics has its own MySQL pool,** 2 connections, in UTC. The app's pool has a single connection, and analytics writes must never queue in front of user requests.
6. **Bot classification only hides anonymous traffic.** Signed-in people are always visible.
7. **Late events get their own session chain.** An offline queue flushed hours later never joins the session that is open now.
8. **A failed sign-in never attaches identity** to a device or session. The targeted account is kept only on the `AuthEvent` row.
9. **Presence orders beats by the client's send time** and keeps "gone" tombstones. Chrome fires `pagehide` before `visibilitychange` on navigation, so a late "hidden" beat must not bring a tab back.
10. **On unload, the cross-origin MIS case uses `sendBeacon` with a signed ticket.** Chrome refuses keepalive requests that need a preflight.
11. **Nightly maintenance runs only between 01:30 and 06:00 Kigali.**

### 22.5 Still open

- **⚖ Legal items in §13:**
  - registration with NCSA;
  - authorisation to store data outside Rwanda (AWS Stockholm);
  - parental consent wording.
  These gate go-live.
- **Production rollout steps 1–9** in `docs/PLATFORM_ACTIVITY.md` (migration, env, GeoIP cron, backfill, satellite deploys, smoke test).
- **Optional:**
  - a "Platform view" link from Tupo's admin dashboard;
  - batch device lookups in the relay ingest path, to cut relay p95;
  - Redis-backed presence if the MIS ever runs more than one process.
