/* End-to-end check of the Reminder Hub in a real Chrome (REMINDERS_SOLUTION_PROPOSAL.md).
 *
 * Needs, already running:
 *   API  (E2E_API, default http://localhost:5051) on the *test* database
 *   app  (E2E_APP, default http://localhost:5183) = `vite preview` of a build pointing at that API
 * Seeds its own user, role and Source API items in nga_central_mis_test, then drives:
 *   manifest + icons, service worker, real Web Push through FCM (test + a *scheduled*
 *   reminder sent by the dispatcher), notification action links, preferences autosave,
 *   calendar feed, Now & Next, bell, iPhone install guide, install/enable nudges,
 *   offline agenda, and an axe + overflow audit in 2 themes x 3 viewports.
 *
 * Usage: node scripts/reminders-e2e/e2e.cjs [outDir]
 */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const B = path.resolve(__dirname, "../..");
require(path.join(B, "node_modules/dotenv")).config({ path: path.join(B, ".env") });
const jwt = require(path.join(B, "node_modules/jsonwebtoken"));
const mysql = require(path.join(B, "node_modules/mysql2/promise"));
const puppeteer = require(path.join(B, "node_modules/puppeteer"));
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js", { paths: [__dirname] }), "utf8");

const API = process.env.E2E_API || "http://localhost:5051";
const APP = process.env.E2E_APP || "http://localhost:5183";
const OUT = process.argv[2] || path.join(__dirname, "out");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? `  — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, timeoutMs, everyMs = 1000) => {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await sleep(everyMs);
  }
  return null;
};

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 8889),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: "nga_central_mis_test",
  });

  // ─── seed ──────────────────────────────────────────────────────────────────
  const stamp = Date.now();
  const [u] = await db.query("INSERT INTO User (username, email, status) VALUES (?, ?, 'ACTIVE')", [`e2e_${stamp}`, `e2e_${stamp}@example.com`]);
  const userId = u.insertId;
  await db.query("INSERT INTO UserProfile (user_id, first_name, last_name, user_type) VALUES (?, 'Aline', 'E2E', 'TEACHER')", [userId]);
  const [[{ next }]] = await db.query("SELECT COALESCE(MAX(role_id),0)+1 AS next FROM Role");
  await db.query("INSERT INTO Role (role_id, name, status) VALUES (?, ?, 'ACTIVE')", [next, `E2E_REMINDERS_${stamp}`]);
  for (const perm of ["MANAGE_SYSTEMS", "TEACHER_DASHBOARD", "VIEW_MY_CALENDAR"]) {
    let [[p]] = await db.query("SELECT perm_id FROM Permission WHERE name=?", [perm]);
    if (!p) {
      const [ins] = await db.query("INSERT INTO Permission (name, status) VALUES (?, 'ACTIVE')", [perm]);
      p = { perm_id: ins.insertId };
    }
    await db.query("INSERT INTO RolePermission (role_id, perm_id) VALUES (?, ?)", [next, p.perm_id]);
  }
  await db.query("INSERT INTO UserRole (user_id, role_id) VALUES (?, ?)", [userId, next]);
  const token = jwt.sign({ userId, tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: "2h" });

  const service = `ngat_${crypto.randomBytes(16).toString("hex")}`;
  await db.query("INSERT INTO IntegrationToken (name, token_hash, token_prefix, scopes) VALUES ('e2e', ?, ?, 'reminders:write')", [
    crypto.createHash("sha256").update(service).digest("hex"),
    service.slice(0, 12),
  ]);
  const putSource = (body) =>
    fetch(`${API}/reminders/sources`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${service}` },
      body: JSON.stringify({ source_app: "e2e", audience_user_ids: [userId], ...body }),
    }).then((r) => r.status);
  const now = Date.now();
  const iso = (ms) => new Date(now + ms).toISOString();
  const s1 = await putSource({ source_type: "meeting", external_id: `m-${stamp}`, title: "Staff briefing", location: "Hall A", starts_at: iso(-10 * 60_000), ends_at: iso(40 * 60_000) });
  // 15-min reminder of this one falls due ~1 minute from now -> the scheduler must push it.
  const s2 = await putSource({ source_type: "quiz_close", external_id: `q-${stamp}`, title: "Algebra quiz", starts_at: iso(16 * 60_000), critical: true, link: "/reminders" });
  const s3 = await putSource({ source_type: "assignment_due", external_id: `a-${stamp}`, title: "Physics lab report", starts_at: iso(3 * 3_600_000) });
  check("Source API accepts meeting, quiz and assignment", s1 === 200 && s2 === 200 && s3 === 200, [s1, s2, s3]);

  const api = (p, init = {}) =>
    fetch(`${API}${p}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) } }).then((r) => r.json());

  // ─── manifest ─────────────────────────────────────────────────────────────
  const manifest = await fetch(`${APP}/manifest.webmanifest`).then((r) => r.json());
  const iconsOk = await Promise.all(manifest.icons.map((i) => fetch(`${APP}${i.src}`).then((r) => r.ok)));
  check(
    "manifest: id, standalone, maskable icon, shortcuts, launch_handler",
    manifest.id === "/" && manifest.display === "standalone" && manifest.icons.some((i) => i.purpose === "maskable") && manifest.shortcuts.length >= 2 && manifest.launch_handler,
  );
  check("manifest icons all load", iconsOk.every(Boolean));

  // A real (non-incognito) profile: Chrome has no Push API in incognito, and
  // every extra puppeteer context is incognito.
  const profile = fs.mkdtempSync(path.join(require("os").tmpdir(), "nga-e2e-"));
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME, userDataDir: profile, args: ["--no-sandbox"] });
  const ctx = browser.defaultBrowserContext();
  await ctx.overridePermissions(APP, ["notifications"]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/favicon|React Router|DevTools|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.setViewport({ width: 1366, height: 900 });
  await page.evaluateOnNewDocument((t) => localStorage.setItem("token", t), token);

  const text = () => page.evaluate(() => document.body.innerText);
  const clickByText = (sel, t) =>
    page.evaluate((s, x) => {
      const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().startsWith(x) && e.offsetParent !== null);
      if (el) el.click();
      return Boolean(el);
    }, sel, t);

  await page.goto(`${APP}/reminders`, { waitUntil: "networkidle0", timeout: 60_000 });
  check("reminders page renders the setup card", /Reminders are off/.test(await text()));
  const swUrl = await page.evaluate(() => navigator.serviceWorker.ready.then((r) => r.active && r.active.scriptURL));
  check("service worker /sw.js is active", String(swUrl).endsWith("/sw.js"), swUrl);

  await page.click('button[role="switch"][aria-label="Reminders"]');
  check("master switch turns reminders on", Boolean(await waitFor(async () => /finish setting up this device/.test(await text()), 8000, 300)));

  await clickByText("button", "Turn on notifications");
  // FCM registration of a brand-new Chrome profile can take a while.
  const subscribed = await waitFor(async () => /Turn off on this device/.test(await text()), 60_000, 500);
  const toast = await page.evaluate(() =>
    [...document.querySelectorAll('[role="alert"], [role="status"], .fixed')].map((e) => e.innerText).filter(Boolean).join(" | ").slice(0, 300),
  );
  check("Turn on notifications subscribes this browser (real FCM subscription)", subscribed, subscribed ? undefined : `on-screen: ${toast}`);

  const me = await api("/reminders/me");
  const device = me.data.devices[0];
  check("server stored the device (macOS · Chrome)", device && device.platform === "macos" && device.browser === "chrome", device);

  if (subscribed) {
    await clickByText("button", "Send test notification");
    const shown = await waitFor(
      () => page.evaluate(() => navigator.serviceWorker.ready.then((r) => r.getNotifications()).then((ns) => ns.map((n) => n.title))).then((t) => (t.some((x) => /Reminders are working/.test(x)) ? t : null)),
      45_000,
    );
    check("test push delivered through FCM and shown by the service worker", shown, shown || "not shown");

    // The dispatcher (1-min tick) must send the quiz's 15-minute reminder on its own.
    const scheduled = await waitFor(
      () =>
        page
          .evaluate(() =>
            navigator.serviceWorker.ready
              .then((r) => r.getNotifications())
              .then((ns) => ns.map((n) => ({ title: n.title, body: n.body, requireInteraction: n.requireInteraction, actions: (n.actions || []).map((a) => a.action), data: n.data }))),
          )
          .then((ns) => ns.find((n) => /Quiz closes/.test(n.title)) || null),
      180_000,
      3000,
    );
    check("scheduled reminder pushed by the dispatcher (quiz closes)", scheduled, scheduled && scheduled.title);
    if (scheduled) {
      check("critical reminder stays on screen and offers Got it / Snooze", scheduled.requireInteraction && scheduled.actions.join() === "ack,snooze", scheduled);
      const ackStatus = await fetch(scheduled.data.ackUrl, { method: "POST" }).then((r) => r.status);
      const [[job]] = await db.query("SELECT status, channels, acked_at FROM ReminderJob WHERE job_id=?", [scheduled.data.jobId]);
      check("notification 'Got it' link acknowledges the job", ackStatus === 200 && job.status === "acked" && job.acked_at, { ackStatus, job });
      check("job went out in-app and by push", job.channels === "in_app,push", job.channels);
    }
  }

  // Preferences autosave
  await page.click('button[role="switch"][aria-label="Activities"]');
  const saved = await waitFor(async () => /Saved/.test(await page.$eval("#prefs-title + span", (e) => e.textContent)), 8000, 300);
  const prefs = (await api("/reminders/me")).data.preferences;
  check("preferences autosave", saved && prefs.settings.activity.enabled === false);

  // Calendar feed
  await clickByText("button", "Create my calendar link");
  const feedUrl = await waitFor(() => page.$eval("#calendar-title ~ div code", (e) => e.textContent).catch(() => null), 8000, 300);
  const ics = feedUrl ? await fetch(feedUrl).then((r) => r.text()) : "";
  check("calendar feed link works and contains alarms", /BEGIN:VCALENDAR/.test(ics) && /Algebra quiz/.test(ics) && /BEGIN:VALARM/.test(ics), feedUrl);

  // Now & Next
  const nn = await page.$eval('[aria-labelledby="now-next-title"]', (e) => e.innerText);
  check("Now & Next shows the running meeting and a countdown", /Staff briefing/.test(nn) && /in \d+/.test(nn), nn.replace(/\s+/g, " ").slice(0, 160));

  // Bell
  await page.goto(`${APP}/home`, { waitUntil: "networkidle0" });
  await page.click('button[aria-label="Notifications"]');
  await sleep(600);
  check("bell lists the reminder", /Quiz closes|Reminders are working/.test(await text()) || !subscribed);

  // Offline: last agenda from the worker's cache
  await page.goto(`${APP}/reminders`, { waitUntil: "networkidle0" });
  await sleep(1500);
  const onlineErrors = errors.splice(0);
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
  const offlineText = await waitFor(async () => {
    const t = await text();
    return /offline copy/.test(t) && /Staff briefing/.test(t) ? t : null;
  }, 15_000, 500);
  await page.screenshot({ path: `${OUT}/offline.png` });
  check("offline: page opens and shows the cached agenda", offlineText, offlineText ? undefined : (await text()).slice(0, 200));
  await page.setOfflineMode(false);
  check("no uncaught page errors while online", onlineErrors.length === 0, onlineErrors.slice(0, 5));

  // ─── iPhone: install first ────────────────────────────────────────────────
  const ios = await browser.newPage();
  await ios.emulate(puppeteer.KnownDevices["iPhone 15 Pro"] || puppeteer.KnownDevices["iPhone 13"]);
  await ios.evaluateOnNewDocument((t) => localStorage.setItem("token", t), token);
  await ios.goto(`${APP}/reminders`, { waitUntil: "networkidle0" });
  const iosText = await ios.evaluate(() => document.body.innerText);
  check("iPhone (not installed): push asks to install first", /Install to continue/.test(iosText) && /Required on iPhone\/iPad/.test(iosText));
  await ios.evaluate(() => [...document.querySelectorAll("button")].find((b) => /How to install/.test(b.textContent))?.click());
  await sleep(700);
  const sheet = await ios.evaluate(() => document.querySelector('[role="dialog"]')?.innerText || "");
  check("iPhone install sheet shows Share → Add to Home Screen → Open as Web App", /Add to Home Screen/.test(sheet) && /Open as Web App/.test(sheet));
  await ios.screenshot({ path: `${OUT}/iphone-install-sheet.png` });

  // ─── nudges on /home ───────────────────────────────────────────────────────
  const fresh = await (await browser.createBrowserContext()).newPage();
  await fresh.setViewport({ width: 1280, height: 850 });
  await fresh.evaluateOnNewDocument((t) => {
    localStorage.setItem("token", t);
    localStorage.setItem("nga.pwa.visits", "5");
  }, token);
  await fresh.goto(`${APP}/home`, { waitUntil: "networkidle0" });
  await sleep(1500);
  const nudge = await fresh.evaluate(() => document.querySelector('aside[role="complementary"]')?.innerText || "");
  check("second browser gets 'Get reminders on this device too'", /Get reminders on this device too/.test(nudge), nudge.slice(0, 80));
  await fresh.screenshot({ path: `${OUT}/nudge-home.png` });

  // ─── visual + a11y audit ──────────────────────────────────────────────────
  const VIEWPORTS = [
    { name: "desktop", width: 1366, height: 900 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "phone", width: 390, height: 844 },
  ];
  const a11y = [];
  const themeProblems = [];
  const note = (m) => themeProblems.push(m);
  for (const theme of ["light", "dark"]) {
    // The signed-in user's saved theme wins over localStorage (ThemeContext).
    await db.query("UPDATE User SET preferred_theme=? WHERE user_id=?", [theme, userId]);
    for (const vp of VIEWPORTS) {
      const p = await ctx.newPage();
      await p.setViewport({ width: vp.width, height: vp.height });
      await p.evaluateOnNewDocument((t, th) => {
        localStorage.setItem("token", t);
        localStorage.setItem("theme", th);
      }, token, theme);
      await p.goto(`${APP}/reminders`, { waitUntil: "networkidle0" });
      await sleep(900);
      const isDark = await p.evaluate(() => document.documentElement.classList.contains("dark"));
      if (isDark !== (theme === "dark")) note(`theme ${theme} not applied`);
      await p.screenshot({ path: `${OUT}/reminders-${theme}-${vp.name}.png`, fullPage: true });
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      await p.addScriptTag({ content: AXE });
      const res = await p.evaluate(async () => {
        const r = await window.axe.run(document.querySelector("main") || document.body, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0]?.target?.join(" ") }));
      });
      const serious = res.filter((v) => ["serious", "critical"].includes(v.impact));
      a11y.push({ theme, vp: vp.name, overflow, serious, all: res });
      await p.close();
    }
  }
  fs.writeFileSync(`${OUT}/a11y.json`, JSON.stringify(a11y, null, 2));
  check("both themes actually applied", themeProblems.length === 0, themeProblems);
  check("no horizontal overflow (2 themes x 3 viewports)", a11y.every((r) => !r.overflow), a11y.filter((r) => r.overflow).map((r) => `${r.theme}/${r.vp}`));
  check("axe: no serious/critical WCAG AA violations", a11y.every((r) => r.serious.length === 0), a11y.flatMap((r) => r.serious.map((v) => `${r.theme}/${r.vp}: ${v.id} (${v.sample})`)).slice(0, 8));

  await browser.close();
  await db.end();
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in ${OUT}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
