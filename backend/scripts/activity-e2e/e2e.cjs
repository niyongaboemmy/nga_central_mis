/* End-to-end check of Usage & Monitoring in a real Chrome (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md §18).
 *
 * Needs, already running against the DEV database (nga_central_mis):
 *   API  (E2E_API, default http://localhost:5071) with ACTIVITY_ORIGINS / CORS_ORIGIN = the app origin
 *   app  (E2E_APP, default http://localhost:5174) = `vite` pointing at that API
 *
 * Drives three independent browser contexts at once:
 *   admin   -- a platform owner watching /analytics/realtime
 *   teacher -- a signed-in teacher moving between MIS pages
 *   visitor -- a public visitor on /login who fails to sign in
 * and checks that the admin sees both live, with app → feature, IP and status, that a
 * failed sign-in appears in the live event stream, and that closing the teacher's tab
 * takes them off the roster. Then runs axe + overflow checks in 2 themes × 3 viewports.
 *
 * Usage: node scripts/activity-e2e/e2e.cjs [outDir]
 */
const path = require("path");
const fs = require("fs");
const B = path.resolve(__dirname, "../..");
require(path.join(B, "node_modules/dotenv")).config({ path: path.join(B, ".env") });
const jwt = require(path.join(B, "node_modules/jsonwebtoken"));
const mysql = require(path.join(B, "node_modules/mysql2/promise"));
const puppeteer = require(path.join(B, "node_modules/puppeteer"));
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js", { paths: [__dirname] }), "utf8");

const API = process.env.E2E_API || "http://localhost:5071";
const APP = process.env.E2E_APP || "http://localhost:5174";
const OUT = process.argv[2] || path.join(__dirname, "out");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ADMIN_ID = Number(process.env.E2E_ADMIN_ID || 1);
const TEACHER_ID = Number(process.env.E2E_TEACHER_ID || 13);
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? `  — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, timeoutMs, everyMs = 500) => {
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
    database: process.env.DB_NAME || "nga_central_mis",
  });
  const tokenFor = async (id) => {
    const [[u]] = await db.query("SELECT token_version FROM User WHERE user_id = ?", [id]);
    return jwt.sign({ userId: id, tokenVersion: u.token_version || 0 }, process.env.JWT_SECRET, { expiresIn: "1h" });
  };
  const [[teacher]] = await db.query("SELECT CONCAT_WS(' ', first_name, last_name) AS name FROM UserProfile WHERE user_id = ?", [TEACHER_ID]);

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--window-size=1440,900"] });
  const ctx = async (token, theme = "light") => {
    const c = await browser.createBrowserContext();
    const p = await c.newPage();
    await p.setViewport({ width: 1440, height: 900 });
    await p.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36");
    await p.evaluateOnNewDocument(
      (t, th) => {
        if (t) localStorage.setItem("token", t);
        localStorage.setItem("theme", th);
        localStorage.setItem("academic_period_year_id", "5");
        localStorage.setItem("academic_period_term_id", "7");
        // Keep the install sheet out of the way (it would sit over the page under test).
        localStorage.setItem("nga.pwa.installSnoozedUntil", String(Date.now() + 86400000));
        sessionStorage.setItem("nga.pwa.autoPromptDismissedThisSession", "1");
        if (t) {
          try {
            const uid = JSON.parse(atob(t.split(".")[1])).userId;
            localStorage.setItem(`nga.activityNotice.2026-10-01.${uid}`, "1");
          } catch {}
        }
        // Real people don't browse in an automated browser: hide the automation flags so
        // the activity engine doesn't (correctly) classify the visitor as a bot.
        Object.defineProperty(navigator, "webdriver", { get: () => false });
      },
      token,
      theme,
    );
    return { c, p };
  };

  // ── admin opens Realtime ──────────────────────────────────────────────────
  const admin = await ctx(await tokenFor(ADMIN_ID));
  const consoleErrors = [];
  admin.p.on("pageerror", (e) => consoleErrors.push(String(e)));
  await admin.p.goto(`${APP}/analytics/realtime`, { waitUntil: "networkidle2" });
  const heading = (p, text) => p.evaluate((t) => [...document.querySelectorAll("h1")].some((h) => h.textContent === t), text);
  const shell = await waitFor(() => heading(admin.p, "Realtime"), 15_000);
  check("admin sees the Realtime page", shell);
  const live = await waitFor(() => admin.p.evaluate(() => document.querySelector("[data-live-mode]")?.getAttribute("data-live-mode") === "live"), 15_000);
  check("Realtime connects over SSE", live);

  // ── teacher browses, visitor arrives and fails to sign in ─────────────────
  const teach = await ctx(await tokenFor(TEACHER_ID));
  await teach.p.goto(`${APP}/home`, { waitUntil: "networkidle2" });
  await teach.p.goto(`${APP}/academics`, { waitUntil: "networkidle2" }).catch(() => undefined);

  const visit = await ctx(null);
  await visit.p.goto(`${APP}/login`, { waitUntil: "networkidle2" });
  const notice = await waitFor(() => visit.p.evaluate(() => /records visits, including your IP address/.test(document.body.innerText)), 8_000);
  check("public visitors see the activity notice", notice);
  const badName = `e2e-nobody-${Date.now()}`;
  await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-NGA-Device": await visit.p.evaluate(() => localStorage.getItem("nga_did")) },
    body: JSON.stringify({ username: badName, password: "wrong" }),
  });

  const teacherRow = await waitFor(
    () => admin.p.evaluate((n) => [...document.querySelectorAll("tbody tr")].map((r) => r.innerText).find((t) => t.includes(n)) || null, teacher.name),
    20_000,
  );
  check("teacher appears on the admin's roster", !!teacherRow, teacherRow?.replace(/\s+/g, " ").slice(0, 160));
  check("roster shows the app and the named feature", !!teacherRow && /NGA MIS/.test(teacherRow) && /(Academics|Home)/.test(teacherRow));
  check("roster shows an IP address", !!teacherRow && /(\d+\.){3}\d+|::1|[0-9a-f:]{3,}/i.test(teacherRow));
  const visitorRow = await waitFor(
    () => admin.p.evaluate(() => [...document.querySelectorAll("tbody tr")].map((r) => r.innerText).find((t) => t.includes("Visitor V-")) || null),
    20_000,
  );
  check("public visitor appears on the roster", !!visitorRow, visitorRow?.replace(/\s+/g, " ").slice(0, 120));
  const failed = await waitFor(() => admin.p.evaluate((n) => document.body.innerText.includes(n), badName), 15_000);
  check("failed sign-in shows in the live event stream with the username tried", failed);

  const kpi = await admin.p.evaluate(() => {
    const tile = [...document.querySelectorAll("div")].find((d) => d.firstElementChild?.textContent === "Online now");
    return tile ? Number(tile.children[1].textContent) : null;
  });
  check("'Online now' counts the people present", kpi !== null && kpi >= 2, kpi);
  await admin.p.screenshot({ path: path.join(OUT, "realtime-light-1440.png"), fullPage: true });

  // ── the teacher leaves (CDP's page.close() fires no pagehide; navigating away does,
  //    exactly like closing a real tab): this device's tab leaves presence within seconds ─
  const teacherDid = await teach.p.evaluate(() => localStorage.getItem("nga_did"));
  const adminToken = await tokenFor(ADMIN_ID);
  const tabsOf = async (did) => {
    const r = await fetch(`${API}/monitor/live`, { headers: { Authorization: `Bearer ${adminToken}` } });
    const j = await r.json();
    const p = j.data.people.find((x) => x.user?.id === TEACHER_ID);
    return p ? p.tabs.filter((t) => t.device && t.ip !== undefined && (t.device_id ?? did) && true).length : 0;
  };
  const before = await tabsOf(teacherDid);
  await teach.p.goto("about:blank");
  const gone = await waitFor(async () => (await tabsOf(teacherDid)) < before, 15_000);
  check("leaving the page removes that tab from presence", gone, { before });
  // ── data landed in the database ─────────────────────────────────────────────
  const [[ev]] = await db.query(
    "SELECT COUNT(*) AS n FROM AnalyticsEvent WHERE user_id = ? AND name = 'page_view' AND occurred_at > UTC_TIMESTAMP() - INTERVAL 5 MINUTE",
    [TEACHER_ID],
  );
  check("teacher page views were stored", Number(ev.n) >= 2, Number(ev.n));
  const [[fl]] = await db.query("SELECT reason, device_id IS NOT NULL AS has_device FROM AuthEvent WHERE username_attempted = ?", [badName]);
  check("failed sign-in stored with reason and device", fl && fl.reason === "unknown_user" && fl.has_device === 1, fl);

  // ── Phase 5: watched person is told (D2), User/Visitor 360, sign out everywhere ──
  const adminTok = await tokenFor(ADMIN_ID);
  const api = (method, p2, body) => fetch(`${API}${p2}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminTok}` }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json().then((j) => ({ status: r.status, body: j })));
  const teach2 = await ctx(await tokenFor(TEACHER_ID));
  await teach2.p.goto(`${APP}/home`, { waitUntil: "networkidle2" });
  const w = await api("POST", "/monitor/watches", { target: { kind: "user", userId: TEACHER_ID }, reason: "E2E transparency check", rules: [{ type: "comes_online" }], days: 1 });
  check("admin creates a watch", w.status === 201, w.status);
  await teach2.p.goto(`${APP}/me/activity`, { waitUntil: "networkidle2" });
  const told = await waitFor(() => teach2.p.evaluate(() => /is monitoring your account activity until/.test(document.body.innerText) && /E2E transparency check/.test(document.body.innerText)), 10_000);
  check("the watched teacher sees who is monitoring them and why (My activity)", told);
  await teach2.p.screenshot({ path: path.join(OUT, "my-activity-watched.png"), fullPage: true });
  const ended = await api("DELETE", `/monitor/watches/${w.body.data.id}`, { reason: "E2E done" });
  check("admin ends the watch", ended.status === 200);

  for (const [url, title] of [[`/analytics/users/${TEACHER_ID}`, teacher.name], [`/analytics/visitors/${await visit.p.evaluate(() => localStorage.getItem("nga_did"))}`, null], ["/analytics/watchlist", "Watchlist"], ["/analytics/settings", "Settings"], ["/me/activity", "My activity"]]) {
    await admin.p.goto(`${APP}${url}`, { waitUntil: "networkidle2" });
    const ok = await waitFor(() => admin.p.evaluate((t) => [...document.querySelectorAll("h1")].some((h) => (t ? h.textContent === t : /^Visitor V-/.test(h.textContent || ""))), title), 15_000);
    await sleep(800);
    const bad = await admin.p.evaluate(() => /Couldn't load|don't have access/.test(document.body.innerText));
    check(`${title ?? "Visitor 360"} page renders`, ok && !bad);
    await admin.p.addScriptTag({ content: AXE });
    const axe = await admin.p.evaluate(async () => (await window.axe.run(document.querySelector("main") || document.body, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target}`));
    check(`axe WCAG AA ${title ?? "Visitor 360"}`, axe.length === 0, axe.slice(0, 4));
    await admin.p.screenshot({ path: path.join(OUT, `p5${url.replace(/\//g, "_").slice(0, 60)}.png`), fullPage: true });
  }

  const so = await api("POST", `/monitor/users/${TEACHER_ID}/signout`, { reason: "E2E sign-out everywhere" });
  check("admin signs the teacher out everywhere", so.status === 200, so.status);
  await teach2.p.goto(`${APP}/home`, { waitUntil: "domcontentloaded" }).catch(() => undefined);
  const kicked = await waitFor(() => teach2.p.evaluate(() => location.pathname === "/login" || location.pathname === "/"), 15_000);
  check("the teacher's open session ends (back to sign-in)", kicked, await teach2.p.evaluate(() => location.pathname));
  await teach2.c.close();

  // ── every report page renders with data, no errors (admin) ──────────────────
  const PAGES = [
    ["/analytics", "Overview"],
    ["/analytics/access", "Access & logins"],
    ["/analytics/audience", "Audience"],
    ["/analytics/visitors", "Visitors"],
    ["/analytics/engagement", "Engagement"],
    ["/analytics/apps", "Apps"],
    ["/analytics/retention", "Retention"],
    ["/analytics/locations", "Locations"],
    ["/analytics/technology", "Technology"],
    ["/analytics/ip/127.0.0.1", "IP 127.0.0.1"],
    ["/analytics/explore", "Explore"],
  ];
  for (const [url, title] of PAGES) {
    await admin.p.goto(`${APP}${url}`, { waitUntil: "networkidle2" });
    const ok = await waitFor(() => heading(admin.p, title), 15_000);
    await sleep(800);
    const bad = await admin.p.evaluate(() => /Couldn't load|don't have access/.test(document.body.innerText));
    check(`${title} page renders without errors`, ok && !bad);
  }

  // ── accessibility & layout: 2 themes × 3 viewports ─────────────────────────
  for (const theme of ["light", "dark"]) {
    const a = await ctx(await tokenFor(ADMIN_ID), theme);
    for (const [path2, title2, w, h] of [
      ["/analytics/realtime", "Realtime", 1440, 900], ["/analytics/realtime", "Realtime", 820, 1180], ["/analytics/realtime", "Realtime", 390, 844],
      ["/analytics", "Overview", 1440, 900], ["/analytics", "Overview", 390, 844],
      ["/analytics/access", "Access & logins", 1440, 900], ["/analytics/access", "Access & logins", 390, 844],
      ["/analytics/audience", "Audience", 820, 1180], ["/analytics/visitors", "Visitors", 390, 844],
      ["/analytics/engagement", "Engagement", 1440, 900], ["/analytics/apps", "Apps", 390, 844],
      ["/analytics/retention", "Retention", 820, 1180], ["/analytics/locations", "Locations", 1440, 900],
      ["/analytics/technology", "Technology", 390, 844],
      ["/analytics/explore", "Explore", 1440, 900], ["/analytics/explore", "Explore", 390, 844],
    ]) {
      await a.p.setViewport({ width: w, height: h });
      await a.p.goto(`${APP}${path2}`, { waitUntil: "networkidle2" });
      await waitFor(() => heading(a.p, title2), 10_000);
      await sleep(1500);
      await a.p.addScriptTag({ content: AXE });
      const axe = await a.p.evaluate(async () => {
        const r = await window.axe.run(document.querySelector("main") || document.body, { runOnly: ["wcag2a", "wcag2aa"] });
        return r.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target}`);
      });
      check(`axe WCAG AA ${title2} ${theme} ${w}px`, axe.length === 0, axe.slice(0, 5));
      const overflow = await a.p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`no horizontal page overflow ${title2} ${theme} ${w}px`, overflow <= 1, overflow);
      await a.p.screenshot({ path: path.join(OUT, `${path2.replace(/\//g, "_")}-${theme}-${w}.png`), fullPage: true });
    }
    await a.c.close();
  }
  check("no uncaught page errors on the admin page", consoleErrors.length === 0, consoleErrors.slice(0, 3));

  await browser.close();
  await db.end();
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const failedN = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failedN}/${results.length} checks passed. Screenshots in ${OUT}`);
  process.exit(failedN ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
