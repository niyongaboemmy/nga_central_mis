# Usage & Monitoring: operator guide

How the platform usage analytics and live monitoring run in production. The design and the decisions behind it are in [`USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md`](../USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md).

## What runs where

| Piece | Where |
|---|---|
| Collector, sessions, presence, rollups, reports, alerts | MIS backend (`backend/src/services/activity/*`, routes `/activity/*` and `/monitor/*`) |
| Console | MIS frontend `/analytics/*`, plus `/me/activity` for every user |
| Browser tracker | `packages/activity/src/index.ts` (+ `react.ts`), vendored into each SPA as `vendor/nga-activity` |
| Relay (satellites → MIS) | `packages/activity/src/relay.ts`, vendored as `vendor/nga-activity-relay` into Task Mentor, Tendo, Tupo (api and realtime) |
| Data | MySQL, migration `095_platform_activity.sql` (raw events are partitioned by month); `099_analytics_access.sql` guarantees administrators their access |
| IP → place / provider | DB-IP Lite files in `/var/lib/nga-geo` (read locally, never an online lookup) |

The MIS must run as **one** pm2 process: live presence and the dedupe set live in memory.

## Deploying

1. **Migration**: `npm run migrate` fails on the box, so pipe the file into mysql.
   ```bash
   cd /opt/apps/nga_central_mis/backend && set -a; . ./.env; set +a
   mysql -h "$DB_HOST" -u "$DB_USERNAME" -p"$DB_PASSWORD" "$DB_NAME" < migrations/095_platform_activity.sql
   ```
   The migration is idempotent and only creates tables. Then apply `099_analytics_access.sql` the same way.

   **099 (access).** The `ANALYTICS_*` capabilities reach a person only through an ACTIVE access-control v2 grant. 099 links them to the roles below and gives every ACTIVE holder of the legacy SUPER_ADMIN / ADMIN role the v2 grant they are missing (PLATFORM / SCHOOL, source MIGRATION). A grant an operator ended or suspended is left alone. It is idempotent: `RolePermission` has no primary key on older databases, so every insert is guarded with `NOT EXISTS`. At boot the MIS also self-heals the same grants for administrators created later (`ensureLegacyAdminGrants`, logged as `grantsHealed`).

   | Role | Gets |
   |---|---|
   | SUPER_ADMIN (platform owner) | every `ANALYTICS_*` capability + `USAGE_INSIGHTS_VIEW` |
   | ADMIN (school administrator) | `ANALYTICS_VIEW`, `_LIVE_VIEW`, `_USER_VIEW` (a person's page and live activity), `_LOCATION_VIEW`, `USAGE_INSIGHTS_VIEW`. Not control or settings. |
   | IT Support | `ANALYTICS_VIEW`, `ANALYTICS_LIVE_VIEW` |

2. **Environment** (`backend/.env`; all optional except where noted):

   | Variable | Default | Purpose |
   |---|---|---|
   | `ACTIVITY_SECRET` | derived from `JWT_SECRET` | HMAC key for device tokens, beacon and stream tickets. Set a random 32+ character value. |
   | `ACTIVITY_SOURCE_CLIENTS` | `taskmentor_app=tm,discipline_attendance=tendo,tupo=tupo` | SSO clients allowed to write activity, and as which app. **Required for the relays to be accepted.** |
   | `ACTIVITY_ORIGINS` | the four `*.amashuri.com` SPAs + localhost | Origins allowed to send anonymous (public-page) batches. |
   | `ACTIVITY_DB_CONNECTION_LIMIT` | `2` | Size of the analytics pool. It is separate from the app's single-connection pool on purpose. |
   | `ACTIVITY_JOBS` | `true` | `false` stops timers (flush, sweeps, rollups); collection still answers 202. |
   | `GEOIP_DIR` | `/var/lib/nga-geo` | Location of the `.mmdb` files. |
   | `GEOIP_PROVIDER` / `MAXMIND_LICENSE_KEY` | `dbip` | Use `maxmind` plus a licence key for GeoLite2. |

3. **pm2**: `ecosystem.config.js` gives the process `kill_timeout: 8000` so buffered events are flushed on restart. Run `pm2 save` afterwards.

4. **nginx**: `api.amashuri.com` already forwards `X-Forwarded-For` and has `proxy_read_timeout 3600s` (the live SSE stream needs it). The MIS sets `trust proxy` to loopback.

5. **IP location database** (once, then monthly):
   ```bash
   sudo mkdir -p /var/lib/nga-geo && sudo chown ubuntu /var/lib/nga-geo
   /opt/apps/nga_central_mis/backend/scripts/geoip-update.sh
   crontab -e   # 17 3 2 * * /opt/apps/nga_central_mis/backend/scripts/geoip-update.sh >> /var/log/nga-geoip.log 2>&1
   ```
   The MIS picks up new files within a minute without a restart. Settings → Health shows the database age. Without the files, places show as "Unknown" and nothing else is affected.

6. **Backfill sign-in history** (once, idempotent):
   ```bash
   node dist/scripts/activityBackfill.js        # dev: npx ts-node src/scripts/activityBackfill.ts
   ```
   This turns `ActivityLog` LOGIN_SUCCESS and `SSOCode` rows into sign-in history, so "who accessed by day/week/month" starts with the past. Engagement, IP and places start at go-live.

7. **Satellites**: deploy each app's `feat/platform-activity` branch. Each needs `NGA_MIS_BASE_URL`, `SSO_CLIENT_ID` and `SSO_CLIENT_SECRET`, which they already have.
   - **Tupo realtime** (`apps/realtime/.env`) also needs those three, so chat messages sent over the socket are counted.
   - **Task Mentor**'s SPA posts cross-origin to `taskmentor-api.amashuri.com`. Its `ACTIVITY_ORIGINS` default already lists `https://taskmentor.amashuri.com`.

8. **Smoke test**:
   ```bash
   node scripts/activity-smoke.mjs https://api.amashuri.com https://mis.amashuri.com
   SMOKE_ADMIN_TOKEN=<platform owner JWT> node scripts/activity-smoke.mjs https://api.amashuri.com
   ```
   The test page view is flagged `debug` and is excluded from every report.

## Who sees what

| Capability (v2-only) | Grants | Default preset |
|---|---|---|
| `ANALYTICS_VIEW` | Aggregate reports, Realtime counts | Platform owner, IT support |
| `ANALYTICS_LIVE_VIEW` | Named Realtime roster and live events | Platform owner, IT support |
| `ANALYTICS_USER_VIEW` | User 360, Visitor 360, IP lookup, named lists and exports | Platform owner |
| `ANALYTICS_LOCATION_VIEW` | Precise browser-location fixes | Platform owner |
| `ANALYTICS_USER_CONTROL` | Sign out, suspend, message, watches, blocks | Platform owner |
| `ANALYTICS_CONFIGURE` | Settings, exclusions, deletion, access log | Platform owner |
| `USAGE_INSIGHTS_VIEW` | Usage widgets in Insights for the viewer's own area (aggregates) | Leadership presets, class teacher |

Every per-person view, export and control is written to `MonitorAccessLog`, which has no update or delete path. Only holders of `ANALYTICS_CONFIGURE` can open the record of another holder of `ANALYTICS_CONFIGURE`.

**A watched person is always told** (decision D2): who set the watch, why, and until when. They are told again when it ends, and they can see it in My activity.

## Day-to-day operations

- **Kill switch:** Settings → turn off "Collect activity". Every app stops within 10 minutes. For an immediate stop, set `ACTIVITY_COLLECT=off` and run `pm2 reload mis-backend`.
- **Health:** Settings → Health shows:
  - events per app;
  - when the last event arrived;
  - rejected, duplicate and blocked counts;
  - the write buffer;
  - process memory;
  - GeoIP database age.
  If an app shows no events for a long time during school hours, check its relay environment and `ACTIVITY_SOURCE_CLIENTS`.
- **Catalog gaps:** Settings → Health → "Pages without a feature name". Add the routes to that app's catalog JSON, push it, and redeploy.
- **Nightly job (01:30–06:00 Kigali):**
  - recomputes the last three days' rollups;
  - adds next months' partitions and drops expired ones;
  - prunes data past retention;
  - expires watches, notifying the people watched;
  - refreshes the shared-IP counts.
- **Retention defaults:**

  | Data | Kept for |
  |---|---|
  | Detailed events | 13 months |
  | Visits, IPs, devices, location fixes | 25 months |
  | Sign-in records | 24 months |
  | Alerts | 12 months |
  | Daily totals (no IPs) and the access log | 5 years |

- **Subject-access or deletion requests:** User 360 → Export / Delete data. Visitor 360 has the same for a public device.

## Tests

| Where | Command |
|---|---|
| MIS backend | `TEST_DB_NAME=<own schema> npx vitest run src/__tests__/activity*.test.ts` (five suites) |
| MIS frontend | `npx vitest run src/test/ngaActivity.test.ts src/test/activityCatalog.test.ts` |
| Real browser | `node backend/scripts/activity-e2e/e2e.cjs` (needs the API on 5071 and vite on 5174; 103 checks including axe WCAG AA in two themes and three widths) |
| Load | `TEST_DB_NAME=<own schema> node backend/scripts/activity-load/load.cjs` (1,000 relay tabs + 200 direct tabs; it starts its own API) |

## Traps

- **Port 5061 is unusable for local testing.** Browsers and Node's fetch block it, because it is the SIP-TLS port. Use 5071.
- **The analytics pool runs in UTC** (`timezone: "Z"` and `SET time_zone = '+00:00'`). Legacy `CURRENT_TIMESTAMP` columns hold server-local time; the backfill converts them.
- **body-parser already inflates gzip bodies.** Never gunzip a request body because of its `Content-Encoding` header; check the magic bytes instead.
- **Chrome fires `pagehide` before `visibilitychange`** when you navigate away. The SDK says "gone" on `pagehide` and stays quiet afterwards. The server also ignores any "hidden" beat that arrives after a "gone".
- **A cross-origin keepalive request with an `Authorization` header is refused on unload.** The SDK uses `sendBeacon` with its signed ticket for the cross-origin MIS case.
- **Signed-in users are never hidden as bots.** Bot scoring only filters anonymous traffic.
