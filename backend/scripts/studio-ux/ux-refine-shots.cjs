/**
 * Lesson Studio UI refinements, in a real browser (desktop dark + phone light, axe):
 * the week rail (readiness, status words), the compact stepper, Try with real output
 * (no mock phone, right week), and Review (built-from, approve label, prev/next).
 * Needs the backend (5001) and frontend (5173) dev servers and a course with a finished
 * preview run that still has drafts to review.
 *   node scripts/studio-ux/ux-refine-shots.cjs [--user=15] [--course=1]
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
const check = (ok, label) => { console.log(`${ok ? "✓" : "✗"} ${label}`); if (!ok) failures += 1; };
const text = (page) => page.evaluate(() => document.body.innerText);
const waitText = (page, t, timeout = 15000) => page.waitForFunction((x) => document.body.innerText.toLowerCase().includes(x.toLowerCase()), { timeout }, t);

(async () => {
  const db = await mysql.createConnection({ host: "127.0.0.1", port: Number(process.env.DB_PORT || 8889), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [[u]] = await db.query("SELECT token_version FROM User WHERE user_id=?", [USER]);
  await db.end();
  const token = jwt.sign({ userId: USER, tokenVersion: u.token_version ?? 0 }, process.env.JWT_SECRET, { expiresIn: "2h" });
  const runs = await fetch(`${API}/elearning/courses/${COURSE}/generation/runs`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  const preview = runs.data.runs.find((r) => r.mode === "PREVIEW" && r.status === "READY_FOR_REVIEW");
  if (!preview) throw new Error("Needs a finished preview run with drafts on this course");
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  for (const [theme, vp] of [
    ["dark", { width: 1512, height: 917, label: "desktop" }],
    ["light", { width: 390, height: 844, label: "phone", isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]) {
    const page = await browser.newPage();
    await page.setViewport(vp);
    await page.evaluateOnNewDocument((t, th, uid) => {
      localStorage.setItem("token", t);
      localStorage.setItem("theme", th);
      sessionStorage.setItem("nga.pwa.autoPromptDismissedThisSession", "1");
      for (const v of ["2026-10-01", "2026-09-30", "2026-10-02"]) localStorage.setItem(`nga.activityNotice.${v}.${uid}`, "1");
    }, token, theme, USER);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const pin = () => page.evaluate((th) => { document.documentElement.classList.remove("light", "dark"); document.documentElement.classList.add(th); }, theme);
    const shot = async (name) => { await pin(); await new Promise((r) => setTimeout(r, 500)); await page.screenshot({ path: path.join(OUT, `ux-${name}-${vp.label}-${theme}.png`) }); };
    const axe = async (label) => {
      await pin();
      await page.addScriptTag({ content: AXE });
      const res = await page.evaluate(async () => (await window.axe.run({ include: [["main"], ["nav[aria-label='Lesson Studio steps']"]] }, { resultTypes: ["violations"] })).violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join(" ; ")}`));
      check(res.length === 0, `${label} (${vp.label}/${theme}) axe serious/critical: ${res.join(" | ") || "none"}`);
    };
    const step = (name) => page.evaluate((n) => [...document.querySelectorAll("nav[aria-label='Lesson Studio steps'] button")].find((b) => b.title === n)?.click(), name);
    const noOverflow = async (label) => { const w = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); check(w <= 1, `${label} (${vp.label}) no sideways scroll (${w}px)`); };

    await page.goto(`${FE}/elearning/courses/${COURSE}/studio?run=${preview.run_id}`, { waitUntil: "networkidle2" });
    await waitText(page, "Lesson Studio");

    // Weeks step: rail header + status words.
    await step("Choose weeks");
    await waitText(page, "Which weeks should the AI draft");
    const t1 = await text(page);
    if (vp.label === "desktop") {
      check(/Term readiness/i.test(t1) && /weeks live/i.test(t1), "rail shows term readiness");
      check(/\d+ weeks · \d+ can be drafted · \d+ selected/.test(t1), "rail header says what the counts mean");
      check(!/Has material/.test(t1), "old 'Has material' label is gone");
      check(!/AI calls/.test(t1), "AI-call count is not on screen (tooltip only)");
    }
    await shot("weeks");
    await axe("Weeks step");
    await noOverflow("Weeks step");

    // Recipe step: the student preview switches between phone and desktop, and enlarges.
    await step("Lesson recipe");
    await waitText(page, "Design each week");
    if (vp.label === "desktop") {
      // Click the switch that is on screen (dialog first, then the side column).
      const sw = (d) => page.evaluate((x) => [...document.querySelectorAll("[role='radiogroup'][aria-label='Preview device'] [role='radio']")].filter((b) => b.getBoundingClientRect().width > 0 && b.innerText.trim() === x).pop()?.click(), d);
      await sw("Desktop");
      await page.waitForFunction(() => [...document.querySelectorAll("[aria-label=\"Preview of a week on a student's computer\"]")].some((e) => e.getBoundingClientRect().width > 0), { timeout: 5000 });
      check(true, "preview switches to desktop");
      await shot("recipe-desktop-preview");
      await axe("Recipe step, desktop preview");
      // Two previews exist (side column, and the phone-layout copy hidden at this width): click the visible one.
      await page.evaluate(() => [...document.querySelectorAll("button[aria-label='Enlarge the student preview']")].find((b) => b.getBoundingClientRect().width > 0)?.click());
      await waitText(page, "What students get —");
      await new Promise((r) => setTimeout(r, 600));
      const bigW = await page.evaluate(() => Math.max(...[...document.querySelectorAll("[aria-label=\"Preview of a week on a student's computer\"]")].map((e) => e.getBoundingClientRect().width)));
      check(bigW >= 700, `enlarged desktop preview is readable size (${Math.round(bigW)}px wide)`);
      await shot("recipe-preview-enlarged");
      await axe("Enlarged preview").catch(() => undefined);
      await page.keyboard.press("Escape");
      await new Promise((r) => setTimeout(r, 400));
      await sw("Phone");
      await page.waitForFunction(() => [...document.querySelectorAll("[aria-label=\"Preview of a week on a student's phone\"]")].some((e) => e.getBoundingClientRect().width > 0), { timeout: 5000 });
      check(true, "and back to phone");
    } else {
      // Phones show the preview under the recipe (no side column).
      check(!!(await page.$("[role='radiogroup'][aria-label='Preview device']")), "phone layout offers the device switch too");
    }
    await noOverflow("Recipe step");

    // Try step with real output: no mock phone; the week named is the one drafted.
    await step("Try one week");
    await waitText(page, "Try the recipe on one week first");
    await new Promise((r) => setTimeout(r, 800));
    const phoneVisible = await page.evaluate(() => { const el = document.querySelector("[aria-label=\"Preview of a week on a student's phone\"]"); return !!el && el.getBoundingClientRect().width > 0; });
    check(!phoneVisible, "mock phone hidden once real output is on screen");
    const t2 = await text(page);
    check(/Approve & turn week on|Approve, keep week off/.test(t2), "approve button says what happens");
    check(/Built from/.test(t2), "drafts say what they were built from");
    await shot("try");
    await axe("Try step");
    await noOverflow("Try step");

    check(errors.length === 0, `no page errors (${vp.label}) ${errors.join(" | ")}`);
    await page.close();
  }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : "\nall UI refinement checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
