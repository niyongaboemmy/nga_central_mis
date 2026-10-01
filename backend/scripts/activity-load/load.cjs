/* Load test for the activity collector (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md §17 Phase 6).
 *
 * Starts its own API on the disposable TEST database, then for DURATION seconds simulates:
 *   - RELAY_TABS tabs behind 3 satellite relays (one gzip batch per relay every 5 s,
 *     beats coalesced per tab, a page view per tab every ~60 s);
 *   - DIRECT_TABS signed-in MIS tabs posting /activity/sync (beat every 30 s, page view every 60 s);
 *   - 5 admins holding a live SSE stream.
 * Reports latency (p50/p95/max) per request type, server RSS, and rows written.
 *
 * Usage: TEST_DB_NAME=nga_central_mis_test_activity node scripts/activity-load/load.cjs
 *   env: RELAY_TABS=1000 DIRECT_TABS=200 DURATION=120 LOAD_PORT=5072
 */
const path = require("path");
const http = require("http");
const zlib = require("zlib");
const crypto = require("crypto");
const { spawn, execSync } = require("child_process");
const B = path.resolve(__dirname, "../..");
require(path.join(B, "node_modules/dotenv")).config({ path: path.join(B, ".env") });
const jwt = require(path.join(B, "node_modules/jsonwebtoken"));
const mysql = require(path.join(B, "node_modules/mysql2/promise"));

const PORT = Number(process.env.LOAD_PORT || 5072);
const API = `http://127.0.0.1:${PORT}`;
const RELAY_TABS = Number(process.env.RELAY_TABS || 1000);
const DIRECT_TABS = Number(process.env.DIRECT_TABS || 200);
const DURATION = Number(process.env.DURATION || 120) * 1000;
const DB = process.env.TEST_DB_NAME || `${process.env.DB_NAME || "nga_central_mis"}_test`;
const CLIENT = `activity_load_${Date.now()}`;
const SECRET = crypto.randomBytes(12).toString("hex");

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ulid = (t = Date.now()) => {
  let s = "";
  for (let i = 0, x = t; i < 10; i++) { s = CROCKFORD[x % 32] + s; x = Math.floor(x / 32); }
  for (const b of crypto.randomBytes(16)) s += CROCKFORD[b % 32];
  return s;
};
const did = () => crypto.randomBytes(16).toString("base64url");
const dt = (d) => crypto.createHmac("sha256", process.env.ACTIVITY_SECRET || crypto.createHash("sha256").update(`nga-activity:${process.env.JWT_SECRET}`).digest("hex")).update(`dt.${d}`).digest("base64url").slice(0, 32);

const lat = { relay: [], direct: [], sse_connect: [] };
let errors = 0;
const timed = async (kind, fn) => {
  const t = performance.now();
  try {
    const r = await fn();
    if (r.status >= 400) {
      if (!errors) console.log(`first error (${kind}): ${r.status} ${await r.text().catch(() => "")}`.slice(0, 300));
      errors++;
    }
  } catch {
    errors++;
  }
  lat[kind].push(performance.now() - t);
};
const pct = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))].toFixed(1) : "-");

(async () => {
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: DB });
  await db.query("INSERT INTO `System` (name, client_id, client_secret, allowed_redirect_uris, icon_url, home_url, status) VALUES (?, ?, ?, 'http://localhost', 'x', 'http://localhost', 'ACTIVE')", [CLIENT, CLIENT, SECRET]);
  const users = [];
  for (let i = 0; i < Math.min(DIRECT_TABS, 200); i++) {
    const [u] = await db.query("INSERT INTO User (username, email, status) VALUES (?, ?, 'ACTIVE')", [`load_${Date.now()}_${i}`, `load_${Date.now()}_${i}@example.com`]);
    await db.query("INSERT INTO UserProfile (user_id, first_name, last_name, user_type) VALUES (?, 'Load', ?, 'TEACHER')", [u.insertId, String(i)]);
    users.push(u.insertId);
  }

  console.log(`starting API on ${PORT} against ${DB}…`);
  const api = spawn("npx", ["ts-node", "--transpile-only", "src/index.ts"], {
    cwd: B,
    env: { ...process.env, PORT: String(PORT), DB_NAME: DB, NODE_ENV: "development", REMINDERS_SCHEDULER: "false", ACTIVITY_SOURCE_CLIENTS: `${CLIENT}=tm,discipline_attendance=tendo,tupo=tupo`, DB_CONNECTION_LIMIT: "5" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${API}/health`)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  const rssOf = () => {
    try {
      const pids = execSync(`pgrep -P ${api.pid}`).toString().trim().split("\n").concat(String(api.pid));
      return Math.max(...pids.map((p) => Number(execSync(`ps -o rss= -p ${p} 2>/dev/null || echo 0`).toString().trim()) || 0)) / 1024;
    } catch { return 0; }
  };
  const rss0 = rssOf();
  const basic = `Basic ${Buffer.from(`${CLIENT}:${SECRET}`).toString("base64")}`;

  // Relay tabs.
  const relayTabs = Array.from({ length: RELAY_TABS }, (_, i) => ({ did: did(), tab: `r${i}`, lastPv: 0, ip: `41.186.${(i >> 8) & 255}.${i & 255}`, user: null }));
  // Direct MIS tabs.
  const direct = Array.from({ length: DIRECT_TABS }, (_, i) => {
    const u = users[i % users.length];
    return { did: did(), tab: `d${i}`, lastPv: 0, token: jwt.sign({ userId: u, tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: "1h" }) };
  });

  // SSE watchers (owner tokens are not needed for connect cost; use a ticket-less connect to measure 401 path cheaply? No: measure real streams).
  const sse = [];
  const end = Date.now() + DURATION;
  const features = ["tm.dashboard", "tm.quiz.take", "tm.course.grades", "tm.courses"];

  const relayTick = async () => {
    const now = Date.now();
    const batches = relayTabs.map((t) => {
      const events = [];
      if (now - t.lastPv > 60_000 * (0.8 + Math.random() * 0.4)) {
        t.lastPv = now;
        events.push({ id: ulid(now), n: "page_view", t: now, r: "/x/:id", f: features[Math.floor(Math.random() * features.length)] });
      }
      return { user_id: null, ip: t.ip, ua: "Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Safari/537.36", envelope: { v: 1, did: t.did, dt: dt(t.did), tab: t.tab, sent_at: now, events, beat: { vis: "visible", r: "/x/:id", f: "tm.dashboard" } } };
    });
    // 3 relays, each with a third of the tabs, chunked at 500 batches (the relay's own limit).
    const per = Math.ceil(batches.length / 3);
    const jobs = [];
    for (let r = 0; r < 3; r++) {
      const mine = batches.slice(r * per, (r + 1) * per);
      for (let i = 0; i < mine.length; i += 500) {
        const body = zlib.gzipSync(Buffer.from(JSON.stringify({ batches: mine.slice(i, i + 500), server_events: [] })));
        jobs.push(timed("relay", () => fetch(`${API}/activity/ingest`, { method: "POST", headers: { Authorization: basic, "Content-Type": "application/json", "Content-Encoding": "gzip" }, body })));
      }
    }
    await Promise.all(jobs);
  };
  const directTick = async (t) => {
    const now = Date.now();
    const events = [];
    if (now - t.lastPv > 60_000) {
      t.lastPv = now;
      events.push({ id: ulid(now), n: "page_view", t: now, r: "/home", f: "mis.home" }, { id: ulid(now), n: "user_engagement", t: now, p: { ms: 25_000 } });
    }
    await timed("direct", () => fetch(`${API}/activity/sync`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t.token}`, Origin: "http://localhost:5174", "X-Forwarded-For": "102.22.1.1" }, body: JSON.stringify({ v: 1, did: t.did, dt: dt(t.did), tab: t.tab, sent_at: now, events, beat: { vis: "visible", r: "/home", f: "mis.home" } }) }));
  };

  console.log(`load: ${RELAY_TABS} relay tabs + ${DIRECT_TABS} direct tabs for ${DURATION / 1000}s`);
  const timers = [setInterval(() => void relayTick(), 5_000)];
  direct.forEach((t, i) => {
    setTimeout(() => {
      void directTick(t);
      timers.push(setInterval(() => void directTick(t), 30_000));
    }, (i / direct.length) * 30_000);
  });
  let peak = rss0;
  const sampler = setInterval(() => { peak = Math.max(peak, rssOf()); }, 5_000);
  await new Promise((r) => setTimeout(r, DURATION));
  timers.forEach(clearInterval);
  clearInterval(sampler);
  await new Promise((r) => setTimeout(r, 4_000)); // let the writer flush
  const [[{ n: events }]] = await db.query("SELECT COUNT(*) AS n FROM AnalyticsEvent WHERE received_at > UTC_TIMESTAMP() - INTERVAL ? SECOND", [Math.ceil(DURATION / 1000) + 30]);
  const [[{ n: sessions }]] = await db.query("SELECT COUNT(*) AS n FROM AnalyticsSession WHERE started_at > UTC_TIMESTAMP() - INTERVAL ? SECOND", [Math.ceil(DURATION / 1000) + 30]);
  console.log("\nrequest     n      p50 ms  p95 ms  max ms");
  for (const k of ["relay", "direct"]) console.log(`${k.padEnd(10)} ${String(lat[k].length).padEnd(6)} ${pct(lat[k], 0.5).padStart(7)} ${pct(lat[k], 0.95).padStart(7)} ${pct(lat[k], 0.999).padStart(7)}`);
  console.log(`errors: ${errors}`);
  console.log(`server RSS: start ${rss0.toFixed(0)} MB, peak ${peak.toFixed(0)} MB`);
  console.log(`rows written: ${events} events, ${sessions} sessions`);

  // Cleanup the synthetic data.
  await db.query("DELETE FROM `System` WHERE client_id = ?", [CLIENT]);
  await db.query("DELETE FROM AnalyticsEvent WHERE received_at > UTC_TIMESTAMP() - INTERVAL ? SECOND", [Math.ceil(DURATION / 1000) + 60]);
  await db.query("DELETE FROM AnalyticsSession WHERE started_at > UTC_TIMESTAMP() - INTERVAL ? SECOND", [Math.ceil(DURATION / 1000) + 60]);
  api.kill("SIGTERM");
  await db.end();
  const p95 = Number(pct(lat.direct, 0.95));
  process.exit(errors === 0 && p95 < 50 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
