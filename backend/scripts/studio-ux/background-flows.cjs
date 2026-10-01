/**
 * Background runs, in a real browser (puppeteer + axe), desktop dark + phone light:
 *   1. the Generate step explains the run is on the server and offers "Run in background";
 *   2. starting one shows "on the server" + "Back to the course" on the run board;
 *   3. the course page shows the status banner with progress;
 *   4. the run is stopped again (cleanup).
 * Start the backend with ELEARNING_STUDIO_WORKER=false so the run stays queued and no AI
 * quota is spent. Needs the backend (5001) and frontend (5173) dev servers.
 *   node scripts/studio-ux/background-flows.cjs [--user=15] [--course=1]
 */
const path = require("path");
const fs = require("fs");
const B = path.resolve(__dirname, "../..");
require(path.join(B, "node_modules/dotenv")).config({ path: path.join(B, ".env") });
const jwt = require(path.join(B, "node_modules/jsonwebtoken"));
const mysql = require(path.join(B, "node_modules/mysql2/promise"));
const puppeteer = require(path.join(B, "node_modules/puppeteer"));
const AXE = fs.readFileSync(path.join(B, "scripts/access-ux/node_modules/axe-core/axe.min.js"), "utf8");

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1] || d;
const USER = Number(arg("user", "15"));
const COURSE = Number(arg("course", "1"));
const FE = arg("fe", "http://localhost:5173");
const API = arg("api", "http://localhost:5001");
const OUT = arg("out", path.join(B, "scripts/studio-ux/out"));
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures += 1;
};
const waitText = (page, text, timeout = 15000) =>
  page.waitForFunction((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), { timeout }, text);
const clickText = async (page, text, tag = "button") => {
  const ok = await page.evaluate(
    (t, g) => {
      const el = [...document.querySelectorAll(g)].find((e) => e.innerText.trim().toLowerCase().includes(t.toLowerCase()) && !e.disabled);
      if (el) el.click();
      return !!el;
    },
    text,
    tag,
  );
  if (!ok) throw new Error(`No ${tag} with text "${text}"`);
};

(async () => {
  const db = await mysql.createConnection({ host: "127.0.0.1", port: Number(process.env.DB_PORT || 8889), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [[u]] = await db.query("SELECT token_version FROM User WHERE user_id=?", [USER]);
  const token = jwt.sign({ userId: USER, tokenVersion: u.token_version ?? 0 }, process.env.JWT_SECRET, { expiresIn: "2h" });
  const api = (p, init = {}) => fetch(`${API}${p}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } }).then((r) => r.json());
  // Start clean: stop any run still going on this course.
  const before = await api(`/elearning/courses/${COURSE}/generation/runs`);
  for (const r of before.data.runs.filter((r) => ["PLANNED", "RUNNING", "PAUSED", "PAUSED_QUOTA"].includes(r.status))) await api(`/elearning/generation/runs/${r.run_id}/cancel`, { method: "POST" });

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  let runId = null;
  for (const [theme, vp] of [
    ["dark", { width: 1440, height: 900, label: "desktop" }],
    ["light", { width: 390, height: 844, label: "phone", isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]) {
    const page = await browser.newPage();
    await page.setViewport(vp);
    await page.evaluateOnNewDocument((t, th, uid) => {
      localStorage.setItem("token", t);
      localStorage.setItem("theme", th);
      sessionStorage.setItem("nga.pwa.autoPromptDismissedThisSession", "1");
      for (const v of ["2026-10-01", "2026-09-30"]) localStorage.setItem(`nga.activityNotice.${v}.${uid}`, "1");
    }, token, theme, USER);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const pin = () => page.evaluate((th) => { document.documentElement.classList.remove("light", "dark"); document.documentElement.classList.add(th); }, theme);
    const shot = async (name) => {
      await pin();
      await new Promise((r) => setTimeout(r, 400));
      await page.screenshot({ path: path.join(OUT, `bg-${name}-${vp.label}-${theme}.png`), fullPage: false });
    };
    // scope: a CSS selector to audit only what this change added (the rest of the page has its own audits).
    const axe = async (label, scope) => {
      await pin();
      await page.addScriptTag({ content: AXE });
      const res = await page.evaluate(async (sc) => (await window.axe.run(sc ? { include: [sc] } : document, { resultTypes: ["violations"] })).violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.length} [${v.nodes.slice(0, 6).map((n) => n.target.join(" ") + (n.any[0]?.data?.contrastRatio ? " " + n.any[0].data.contrastRatio + " " + n.any[0].data.fgColor + "/" + n.any[0].data.bgColor : "")).join(" ; ")}]`), scope);
      check(res.length === 0, `${label} (${vp.label}/${theme}) axe serious/critical: ${res.join(", ") || "none"}`);
    };
    const noOverflow = async (label) => {
      const w = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(w <= 1, `${label} (${vp.label}) no sideways scroll (${w}px)`);
    };

    if (!runId) {
      // 1. Generate step: explanation + "Run in background".
      // Generate unlocks after "Try one week": open it on an earlier, finished preview run.
      const preview = before.data.runs.find((r) => r.mode === "PREVIEW" && !["PLANNED", "RUNNING", "PAUSED", "PAUSED_QUOTA"].includes(r.status));
      if (!preview) throw new Error("No finished preview run on this course — run studio-flows.cjs --live once first");
      await page.goto(`${FE}/elearning/courses/${COURSE}/studio?run=${preview.run_id}`, { waitUntil: "networkidle2" });
      await waitText(page, "Run in background");
      check(await page.evaluate(() => document.body.innerText.includes("Runs on the school server")), "Generate step explains the run is on the server");
      await shot("generate");
      await axe("Generate step");
      await noOverflow("Generate step");

      // 2. Start it: the board says it's on the server and offers a way back.
      await clickText(page, "Run in background");
      await waitText(page, "on the server");
      await waitText(page, "Back to the course");
      runId = Number(new URL(page.url()).searchParams.get("run"));
      check(runId > 0, `run started (#${runId})`);
      check(await page.evaluate(() => /log out — the server keeps drafting/i.test(document.body.innerText)), "board says you can leave / log out");
      await shot("board");
      await axe("Run board", "main");

      // 3. Leave: the course page shows the banner.
      await clickText(page, "Back to the course");
    } else {
      await page.goto(`${FE}/elearning/courses/${COURSE}/build`, { waitUntil: "networkidle2" });
    }
    await page.waitForSelector("section[aria-label='AI drafting status']", { timeout: 15000 });
    const banner = await page.$eval("section[aria-label='AI drafting status']", (e) => e.innerText);
    check(/on the server/i.test(banner) && /parts done|starting/i.test(banner), `course page banner: "${banner.split("\n")[0]}"`);
    check(!!(await page.$("section[aria-label='AI drafting status'] [role='progressbar']")), "banner shows progress");
    await shot("course-banner");
    await axe("Course page banner", "section[aria-label='AI drafting status']");
    await noOverflow("Course page with banner");
    check(errors.length === 0, `no page errors (${vp.label}) ${errors.join(" | ")}`);
    await page.close();
  }
  await browser.close();

  // 4. Cleanup: stop the run; the banner then has nothing running to show.
  if (runId) {
    const stopped = await api(`/elearning/generation/runs/${runId}/cancel`, { method: "POST" });
    check(stopped.data?.run?.status === "CANCELLED", "run stopped again");
  }
  await db.end();
  console.log(failures ? `\n${failures} check(s) failed` : "\nall background-run checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
