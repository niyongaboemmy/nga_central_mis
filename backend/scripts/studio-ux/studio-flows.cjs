/**
 * Lesson Studio UI flows + accessibility audit (ELEARNING_AI_LESSON_STUDIO_IMPLEMENTATION_PLAN.md §19).
 *
 *   node backend/scripts/studio-ux/studio-flows.cjs --user=15 --course=1 [--run=1] [--out=/tmp/studio-ux] [--live]
 *
 * Needs the backend (5001) and frontend (5173) dev servers. Walks every Studio step in
 * two themes × phone/desktop, screenshots each, and runs axe (WCAG 2 AA) on each screen.
 * --live also clicks "Try on one week" and waits for real AI drafts (spends free quota).
 * Exit code 1 when a flow breaks or axe finds a serious/critical violation.
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
const RUN = arg("run", "");
const OUT = arg("out", "/tmp/studio-ux");
const LIVE = process.argv.includes("--live");
const FE = arg("fe", "http://localhost:5173");
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function axe(page, label) {
  await page.evaluate(AXE);
  const theme = label.includes("light") ? "light" : "dark";
  await page.evaluate((th) => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(th);
  }, theme);
  const r = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
    return res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target?.join(" ") }));
  });
  const serious = r.filter((v) => v.impact === "serious" || v.impact === "critical");
  record(`axe ${label}`, serious.length === 0, serious.map((v) => `${v.id}×${v.nodes} (${v.sample})`).join("; "));
  return r;
}

const clickText = async (page, text, tag = "button") => {
  const ok = await page.evaluate(
    (t, tg) => {
      const el = [...document.querySelectorAll(tg)].find((e) => e.textContent && e.textContent.trim().includes(t) && !e.disabled);
      if (!el) return false;
      el.click();
      return true;
    },
    text,
    tag,
  );
  if (!ok) throw new Error(`No ${tag} with text "${text}"`);
};
// innerText applies text-transform (uppercase labels), so compare case-insensitively.
const waitText = (page, text, timeout = 15000) =>
  page.waitForFunction((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), { timeout }, text);

(async () => {
  const db = await mysql.createConnection({ host: "127.0.0.1", port: Number(process.env.DB_PORT || 8889), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [[u]] = await db.query("SELECT token_version FROM User WHERE user_id=?", [USER]);
  const token = jwt.sign({ userId: USER, tokenVersion: u.token_version ?? 0 }, process.env.JWT_SECRET, { expiresIn: "2h" });
  await db.end();
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

  for (const [theme, vp] of [
    ["dark", { width: 1440, height: 900, label: "desktop" }],
    ["light", { width: 390, height: 844, label: "phone", isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]) {
    const page = await browser.newPage();
    await page.setViewport(vp);
    await page.evaluateOnNewDocument((t, th, uid) => {
      localStorage.setItem("token", t);
      localStorage.setItem("theme", th);
      // Overlays unrelated to the Studio: the app-install prompt and the activity notice.
      sessionStorage.setItem("nga.pwa.autoPromptDismissedThisSession", "1");
      for (const v of ["2026-10-01", "2026-09-30"]) localStorage.setItem(`nga.activityNotice.${v}.${uid}`, "1");
    }, token, theme, USER);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // The signed-in user's saved preference overrides localStorage, so pin the theme class
    // before every screenshot / audit to really test both themes.
    const pin = () =>
      page.evaluate((th) => {
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(th);
      }, theme);
    const shot = async (name) => {
      await pin();
      await new Promise((r) => setTimeout(r, 150));
      return page.screenshot({ path: path.join(OUT, `${vp.label}-${theme}-${name}.png`), fullPage: false });
    };
    const tag = `${vp.label}/${theme}`;
    try {
      await page.goto(`${FE}/elearning/courses/${COURSE}/studio`, { waitUntil: "networkidle2", timeout: 60000 });
      await waitText(page, "Which weeks should the AI draft?");
      await new Promise((r) => setTimeout(r, 800));
      await shot("1-weeks");
      record(`${tag} weeks step renders`, true);
      await axe(page, `${tag} weeks`);

      await clickText(page, "Next");
      await waitText(page, "What the AI will read");
      await page.waitForFunction(() => !document.body.innerText.includes("Gathering sources"), { timeout: 15000 });
      await shot("2-sources");
      record(`${tag} sources step shows the context pack`, await page.evaluate(() => /\bS1\b/.test(document.body.innerText)));
      await axe(page, `${tag} sources`);

      await clickText(page, "Next");
      await waitText(page, "Design each week");
      await clickText(page, "Practical TVET week");
      await new Promise((r) => setTimeout(r, 600));
      await shot("3-recipe");
      const practicalOn = await page.evaluate(() => {
        const sw = document.querySelector('[role="switch"][aria-label="Practical task"]');
        return sw?.getAttribute("aria-checked") === "true";
      });
      record(`${tag} preset switches the practical task on`, practicalOn);
      await axe(page, `${tag} recipe`);

      await clickText(page, "Try it");
      await waitText(page, "Try the recipe on one week first");
      await shot("4-try");
      record(`${tag} try step renders`, true);

      if (LIVE && vp.label === "desktop") {
        await clickText(page, "Try on one week");
        await waitText(page, "Approve week", 6 * 60 * 1000);
        await new Promise((r) => setTimeout(r, 1500));
        await shot("5-try-result");
        record(`${tag} live preview produced drafts to review`, true);
      }

      if (RUN) {
        await page.goto(`${FE}/elearning/courses/${COURSE}/studio?run=${RUN}`, { waitUntil: "networkidle2" });
        await waitText(page, "Draft");
        await new Promise((r) => setTimeout(r, 800));
        await shot("6-board");
        await clickText(page, "Review");
        await waitText(page, "Approve week");
        await page.waitForFunction(() => document.querySelector(".lesson-note-preview")?.textContent?.length > 50, { timeout: 15000 });
        await new Promise((r) => setTimeout(r, 800));
        await shot("7-review");
        const sources = await page.evaluate(() => document.body.innerText.toLowerCase().includes("where each part comes from"));
        record(`${tag} review shows the lesson with its sources`, sources);
        record(`${tag} review shows question keys`, await page.evaluate(() => !!document.querySelector('[aria-label="Correct answer"]')));
        await page.evaluate(() => window.scrollTo(0, 0));
        await axe(page, `${tag} review`);
      }

      await page.goto(`${FE}/elearning/courses/${COURSE}/build`, { waitUntil: "networkidle2" });
      await waitText(page, "Build with AI").catch(() => undefined);
      await new Promise((r) => setTimeout(r, 800));
      await shot("8-builder");
      record(`${tag} builder offers "Build with AI"`, await page.evaluate(() => document.body.innerText.includes("Build with AI") || !!document.querySelector('button[title^="Draft every week"]')));
    } catch (e) {
      record(`${tag} flow`, false, e.message);
      await shot("error").catch(() => undefined);
    }
    if (errors.length) record(`${tag} no page errors`, false, errors.slice(0, 3).join(" | "));
    await page.close();
  }
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${OUT}`);
  process.exit(failed.length ? 1 : 0);
})();
