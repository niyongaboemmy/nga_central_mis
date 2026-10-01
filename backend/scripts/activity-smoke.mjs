#!/usr/bin/env node
/**
 * Production smoke test for Usage & Monitoring (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md §19).
 * Safe to run against production: it sends one anonymous page view from a throwaway device
 * marked `debug` (excluded from every report) and reads back public endpoints only.
 *
 *   node scripts/activity-smoke.mjs [https://api.amashuri.com] [https://mis.amashuri.com]
 *
 * Optional: SMOKE_ADMIN_TOKEN=<a platform owner's MIS JWT> also checks /monitor/ingest/health.
 */
const API = (process.argv[2] || "http://localhost:5001").replace(/\/$/, "");
const ORIGIN = (process.argv[3] || "https://mis.amashuri.com").replace(/\/$/, "");
const ok = (name, cond, detail) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? `  — ${JSON.stringify(detail)}` : ""}`);
  if (!cond) process.exitCode = 1;
};

const cfg = await fetch(`${API}/activity/config`).then((r) => r.json());
ok("config answers with a device id and token", !!cfg.did && !!cfg.dt, { enabled: cfg.enabled });

const now = Date.now();
const id = "0".repeat(10) + Math.random().toString(36).slice(2, 18).toUpperCase().replace(/[ILOU]/g, "X").padEnd(16, "X").slice(0, 16);
const r = await fetch(`${API}/activity/sync`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: ORIGIN },
  body: JSON.stringify({ v: 1, did: cfg.did, dt: cfg.dt, tab: "smoke", sent_at: now, events: [{ id, n: "page_view", t: now, r: "/", f: "mis.landing", p: { debug: true } }] }),
});
const body = await r.json().catch(() => ({}));
ok("anonymous batch accepted (202)", r.status === 202 && body.ok !== false, { status: r.status, body });

const foreign = await fetch(`${API}/activity/sync`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://example.invalid" },
  body: JSON.stringify({ v: 1, did: cfg.did, dt: cfg.dt, tab: "smoke", sent_at: now, events: [] }),
}).then((x) => x.json());
ok("foreign origins are refused", foreign.error === "origin", foreign);

const unauth = await fetch(`${API}/activity/ingest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
ok("relay ingest requires client credentials", unauth.status === 401, unauth.status);

if (process.env.SMOKE_ADMIN_TOKEN) {
  const h = await fetch(`${API}/monitor/ingest/health`, { headers: { Authorization: `Bearer ${process.env.SMOKE_ADMIN_TOKEN}` } }).then((x) => x.json());
  ok("ingest health readable", h.success === true, { writer: h.data?.writer?.lastError ?? null, geoip: h.data?.geoip?.provider ?? "not installed", rss_mb: h.data?.process?.rss_mb });
}
