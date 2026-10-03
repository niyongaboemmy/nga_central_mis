/**
 * Code windows in a lesson, as a student sees them: light and dark, laptop and phone.
 * Checks structure, highlighting, copy/wrap/fold/explain, no sideways page scroll, and
 * axe (serious/critical) on the window. Run against a note that contains code blocks.
 *   node scripts/studio-ux/code-window.cjs [--student=23] [--course=1] [--item=5] [--fe=http://localhost:5173]
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
const ITEM = Number(arg("item", "5"));
const FE = arg("fe", "http://localhost:5173");
const OUT = arg("out", path.join(B, "scripts/studio-ux/out/code-window"));
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "✓" : "✗"} ${label}`); if (!ok) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const db = await mysql.createConnection({ host: "127.0.0.1", port: Number(process.env.DB_PORT || 8889), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [[u]] = await db.query("SELECT token_version FROM User WHERE user_id=?", [STUDENT]);
  await db.end();
  const token = jwt.sign({ userId: STUDENT, tokenVersion: u.token_version ?? 0 }, process.env.JWT_SECRET, { expiresIn: "2h" });
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

  for (const [theme, vp] of [
    ["light", { width: 1512, height: 945, label: "laptop" }],
    ["dark", { width: 1512, height: 945, label: "laptop" }],
    ["light", { width: 390, height: 844, label: "phone", isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["dark", { width: 390, height: 844, label: "phone", isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]) {
    const tag = `${vp.label}/${theme}`;
    const page = await browser.newPage();
    await page.setViewport(vp);
    await page.evaluateOnNewDocument((t, th, uid) => {
      localStorage.setItem("token", t);
      localStorage.setItem("theme", th);
      sessionStorage.setItem("nga.pwa.autoPromptDismissedThisSession", "1");
      for (const v of ["2026-10-01", "2026-10-02", "2026-10-03"]) localStorage.setItem(`nga.activityNotice.${v}.${uid}`, "1");
    }, token, theme, STUDENT);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${FE}/my-learning/courses/${COURSE}/items/${ITEM}`, { waitUntil: "networkidle2", timeout: 60000 });
    await page.evaluate((th) => { document.documentElement.classList.remove("light", "dark"); document.documentElement.classList.add(th); }, theme);
    await page.waitForSelector(".code-window", { timeout: 20000 });
    await sleep(800);
    const info = await page.evaluate(() => {
      const wins = [...document.querySelectorAll(".code-window")];
      const w = wins[0];
      return {
        count: wins.length,
        lang: w.querySelector(".code-window__lang").textContent,
        lines: w.querySelectorAll(".cw-line").length,
        colored: !!w.querySelector(".hljs-keyword, .hljs-title, .hljs-string"),
        bg: getComputedStyle(w).backgroundColor,
        folded: wins.some((x) => x.classList.contains("is-folded")),
        docOver: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    check(info.count >= 2, `${tag}: code blocks render as windows (${info.count})`);
    check(info.colored, `${tag}: syntax colours applied (${info.lang}, ${info.lines} lines)`);
    check(theme === "dark" ? info.bg === "rgb(13, 17, 23)" : info.bg === "rgb(251, 252, 253)", `${tag}: ${theme} editor theme (${info.bg})`);
    check(info.folded, `${tag}: long block starts folded`);
    check(info.docOver <= 1, `${tag}: no sideways page scroll (${info.docOver}px)`);
    await page.evaluate(() => document.querySelector(".code-window").scrollIntoView({ block: "center" }));
    await sleep(400);
    await page.screenshot({ path: path.join(OUT, `${vp.label}-${theme}.png`) });

    await page.addScriptTag({ content: AXE });
    const v = await page.evaluate(async () => (await window.axe.run(".code-window", { resultTypes: ["violations"] })).violations.filter((x) => ["serious", "critical"].includes(x.impact)).map((x) => `${x.id}(${x.nodes.length}): ${x.nodes.slice(0, 2).map((n) => n.target.join(" ") + (n.any[0]?.data?.contrastRatio ? ` ${n.any[0].data.contrastRatio} ${n.any[0].data.fgColor}/${n.any[0].data.bgColor}` : "")).join(" ; ")}`));
    check(v.length === 0, `${tag}: axe on code windows: ${v.join(" | ") || "none"}`);

    // Interactions on the folded (long) block.
    const r = await page.evaluate(async () => {
      const w = [...document.querySelectorAll(".code-window")].find((x) => x.classList.contains("is-folded"));
      w.querySelector(".code-window__more").click();
      const unfolded = !w.classList.contains("is-folded");
      w.querySelector(".cw-wrap").click();
      const wrapped = w.classList.contains("is-wrapped");
      w.querySelector(".cw-ln").click();
      const marked = !!w.querySelector(".cw-line.is-marked");
      return { unfolded, wrapped, marked };
    });
    check(r.unfolded && r.wrapped && r.marked, `${tag}: show all / wrap / mark line work (${JSON.stringify(r)})`);
    await page.evaluate(() => [...document.querySelectorAll(".code-window")].find((x) => x.classList.contains("is-wrapped")).scrollIntoView({ block: "start" }));
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, `${vp.label}-${theme}-long-wrapped.png`) });

    // Explain hands the code to the Study Assistant.
    await page.evaluate(() => { const b = document.querySelector(".code-window .cw-explain"); b.scrollIntoView({ block: "center" }); b.click(); });
    await sleep(1200);
    const asked = await page.evaluate(() => [...document.querySelectorAll("aside")].some((a) => /Study Assistant/.test(a.textContent)));
    check(asked, `${tag}: Explain opens the Study Assistant`);
    check(errors.length === 0, `${tag}: no page errors ${errors.slice(0, 2).join(" | ")}`);
    await page.close();
  }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
