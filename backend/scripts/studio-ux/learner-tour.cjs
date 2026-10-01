/**
 * The learner side, as a student sees it (puppeteer + axe), phone light + desktop dark:
 * My learning home, profile, the course page, and one item of each kind. Screenshots go to
 * --out; every page is audited (axe serious/critical), checked for sideways scroll and
 * page errors, and timed (time to first meaningful text).
 *   node scripts/studio-ux/learner-tour.cjs [--student=23] [--course=1] [--items=5,7,6,16,17,12]
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
const STUDENT = Number(arg("student", "23"));
const COURSE = Number(arg("course", "1"));
const ITEMS = arg("items", "5,7,6,16,17,12").split(",").map(Number);
const FE = arg("fe", "http://localhost:5173");
const OUT = arg("out", path.join(B, "scripts/studio-ux/out/learner"));
const ONLY = arg("only", "");
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "✓" : "✗"} ${label}`); if (!ok) failures += 1; };

(async () => {
  const db = await mysql.createConnection({ host: "127.0.0.1", port: Number(process.env.DB_PORT || 8889), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [[u]] = await db.query("SELECT token_version FROM User WHERE user_id=?", [STUDENT]);
  await db.end();
  const token = jwt.sign({ userId: STUDENT, tokenVersion: u.token_version ?? 0 }, process.env.JWT_SECRET, { expiresIn: "2h" });
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const pages = [
    ["home", "/my-learning"],
    ["me", "/my-learning/me"],
    ["course", `/my-learning/courses/${COURSE}`],
    ...ITEMS.map((id) => [`item-${id}`, `/my-learning/courses/${COURSE}/items/${id}`]),
  ].filter(([n]) => !ONLY || ONLY.split(",").includes(n));
  for (const [theme, vp] of [
    ["light", { width: 390, height: 844, label: "phone", isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["dark", { width: 1440, height: 900, label: "desktop" }],
  ]) {
    const page = await browser.newPage();
    await page.setViewport(vp);
    await page.evaluateOnNewDocument((t, th, uid) => {
      localStorage.setItem("token", t);
      localStorage.setItem("theme", th);
      sessionStorage.setItem("nga.pwa.autoPromptDismissedThisSession", "1");
      for (const v of ["2026-10-01", "2026-09-30", "2026-10-02"]) localStorage.setItem(`nga.activityNotice.${v}.${uid}`, "1");
    }, token, theme, STUDENT);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const pin = () => page.evaluate((th) => { document.documentElement.classList.remove("light", "dark"); document.documentElement.classList.add(th); }, theme);
    for (const [name, url] of pages) {
      const t0 = Date.now();
      await page.goto(`${FE}${url}`, { waitUntil: "networkidle2", timeout: 60000 });
      const ms = Date.now() - t0;
      await pin();
      await new Promise((r) => setTimeout(r, 900));
      await page.screenshot({ path: path.join(OUT, `${name}-${vp.label}-${theme}.png`) });
      await page.screenshot({ path: path.join(OUT, `${name}-${vp.label}-${theme}-full.png`), fullPage: true });
      await page.addScriptTag({ content: AXE });
      const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.filter((x) => ["serious", "critical"].includes(x.impact)).map((x) => `${x.id}(${x.nodes.length}): ${x.nodes.slice(0, 3).map((n) => n.target.join(" ") + (n.any[0]?.data?.contrastRatio ? ` ${n.any[0].data.contrastRatio} ${n.any[0].data.fgColor}/${n.any[0].data.bgColor}` : "")).join(" ; ")}`));
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const small = await page.evaluate(() => [...document.querySelectorAll("button, a[href], [role='button'], input[type='checkbox'], input[type='radio']")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 32 || r.width < 32) && getComputedStyle(e).visibility !== "hidden"; }).map((e) => (e.getAttribute("aria-label") || e.innerText || e.tagName).trim().slice(0, 24)).slice(0, 8));
      check(v.length === 0, `${name} ${vp.label}/${theme} axe: ${v.join(" | ") || "none"}`);
      check(over <= 1, `${name} ${vp.label} no sideways scroll (${over}px)`);
      console.log(`  · ${name} ${vp.label}: loaded in ${ms} ms; small tap targets: ${small.length ? small.join(", ") : "none"}`);
      // Desktop: a fixed frame — the page never scrolls; the centre column does.
      if (vp.label === "desktop" && name !== "home" && name !== "me") {
        const fit = await page.evaluate(() => {
          const main = document.querySelector("main[aria-label='Course content']");
          if (!main) return { ok: false, why: "no course main" };
          main.scrollTop = 600;
          window.scrollTo(0, 600);
          return { ok: true, page: Math.round(window.scrollY), docOverflow: document.documentElement.scrollHeight - window.innerHeight, main: Math.round(main.scrollTop), mainScrollable: main.scrollHeight > main.clientHeight };
        });
        check(fit.ok && fit.page === 0 && fit.docOverflow <= 1, `${name} desktop: page doesn't scroll (window ${fit.page}px, overflow ${fit.docOverflow}px)`);
        if (fit.mainScrollable) check(fit.main > 0, `${name} desktop: centre column scrolls (${fit.main}px)`);
        await page.evaluate(() => { const m = document.querySelector("main[aria-label='Course content']"); if (m) m.scrollTop = 0; });
      }
    }
    check(errors.length === 0, `no page errors (${vp.label}) ${[...new Set(errors)].join(" | ").slice(0, 300)}`);
    await page.close();
  }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : "\nall learner checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
