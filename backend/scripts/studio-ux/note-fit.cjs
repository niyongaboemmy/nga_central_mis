/**
 * A lesson note inside a course must never be wider than the room it has: the app menu,
 * the week index and the Study Assistant all take width. At several screen sizes, with a
 * long code line and a long URL injected into the note, check that
 *   - nothing scrolls sideways (window, course column, the paper itself),
 *   - code scrolls inside its own block,
 *   - the reader toolbar sits flush at the top of the course column,
 *   - the contents rail only sits beside the page when the page still gets real width,
 *   - with the Study Assistant open, the page keeps that width and the bottom bar stays
 *     clear of the panel.
 *   node scripts/studio-ux/note-fit.cjs [--student=23] [--course=1] [--item=5] [--fe=http://localhost:5173]
 * EXPECT_REPAIRED_HEADING="Declaring" also checks that a heading stored with escaped
 * <code> tags (older generated lessons) renders with real code elements.
 */
const path = require("path");
const fs = require("fs");
const B = path.resolve(__dirname, "../..");
require(path.join(B, "node_modules/dotenv")).config({ path: path.join(B, ".env") });
const jwt = require(path.join(B, "node_modules/jsonwebtoken"));
const mysql = require(path.join(B, "node_modules/mysql2/promise"));
const puppeteer = require(path.join(B, "node_modules/puppeteer"));
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1] || d;
const STUDENT = Number(arg("student", "23"));
const COURSE = Number(arg("course", "1"));
const ITEM = Number(arg("item", "5"));
const FE = arg("fe", "http://localhost:5173");
const OUT = arg("out", path.join(B, "scripts/studio-ux/out/note-fit"));
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "✓" : "✗"} ${label}`); if (!ok) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LONG_CODE =
  'console.log(productName); // undefined (var is hoisted and initialized)\nvar productName = "A very long product name that keeps going well past the edge of any sheet of paper";\nconsole.log(itemCode); // ReferenceError: Cannot access \'itemCode\' before initialization';
const LONG_URL = "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/let#temporal_dead_zone_tdz_and_more_words";

(async () => {
  const db = await mysql.createConnection({ host: "127.0.0.1", port: Number(process.env.DB_PORT || 8889), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [[u]] = await db.query("SELECT token_version FROM User WHERE user_id=?", [STUDENT]);
  await db.end();
  const token = jwt.sign({ userId: STUDENT, tokenVersion: u.token_version ?? 0 }, process.env.JWT_SECRET, { expiresIn: "2h" });
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

  for (const vp of [
    { width: 1512, height: 945, label: "laptop" },
    { width: 1280, height: 800, label: "small-laptop" },
    { width: 1920, height: 1080, label: "desktop" },
    { width: 820, height: 1180, label: "tablet", isMobile: true, hasTouch: true },
    { width: 390, height: 844, label: "phone", isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  ]) {
    const page = await browser.newPage();
    await page.setViewport(vp);
    await page.evaluateOnNewDocument((t, uid) => {
      localStorage.setItem("token", t);
      localStorage.setItem("theme", "light");
      sessionStorage.setItem("nga.pwa.autoPromptDismissedThisSession", "1");
      for (const v of ["2026-10-01", "2026-09-30", "2026-10-02", "2026-10-03"]) localStorage.setItem(`nga.activityNotice.${v}.${uid}`, "1");
    }, token, STUDENT);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${FE}/my-learning/courses/${COURSE}/items/${ITEM}`, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector(".note-reader-body", { timeout: 20000 });
    await page.evaluate((code, url) => {
      const body = document.querySelector(".note-reader-body");
      const pre = document.createElement("pre");
      const c = document.createElement("code");
      c.textContent = code;
      pre.appendChild(c);
      pre.id = "fit-pre";
      body.prepend(pre);
      const p = document.createElement("p");
      p.textContent = `Read more: ${url}`;
      body.prepend(p);
    }, LONG_CODE, LONG_URL);
    await sleep(700);

    const measure = () => page.evaluate(() => {
      const r = (el) => (el ? el.getBoundingClientRect() : null);
      const main = document.querySelector("main[aria-label='Course content']");
      const sheet = document.querySelector(".note-reader-sheet");
      const pre = document.getElementById("fit-pre");
      const toolbar = document.querySelector(".note-reader > .sticky");
      const rail = [...document.querySelectorAll("nav")].find((n) => n.textContent.includes("Contents") && n.classList.contains("el-card"));
      const bar = document.querySelector("[role='toolbar'][aria-label='Item actions']");
      const panel = document.querySelector("aside[class*='sm:w-[420px]']");
      return {
        docOver: document.documentElement.scrollWidth - window.innerWidth,
        mainOver: main ? main.scrollWidth - main.clientWidth : 0,
        sheetOver: sheet ? sheet.scrollWidth - sheet.clientWidth : 0,
        sheetW: Math.round(r(sheet)?.width ?? 0),
        sheetRight: Math.round(r(sheet)?.right ?? 0),
        preScrolls: pre ? pre.scrollWidth > pre.clientWidth : false,
        preInside: pre && sheet ? r(pre).right <= r(sheet).right + 1 : false,
        toolbarGap: toolbar && main ? Math.round(r(toolbar).top - r(main).top) : null,
        rail: !!rail,
        bar: bar ? { left: Math.round(r(bar).left), right: Math.round(r(bar).right) } : null,
        panelLeft: panel ? Math.round(r(panel).left) : null,
        vw: window.innerWidth,
      };
    });

    const a = await measure();
    const tag = `${vp.label} ${vp.width}`;
    check(a.docOver <= 1, `${tag}: window doesn't scroll sideways (${a.docOver}px)`);
    check(a.mainOver <= 1, `${tag}: course column doesn't overflow sideways (${a.mainOver}px)`);
    check(a.sheetOver <= 1, `${tag}: the paper holds its content (${a.sheetOver}px over)`);
    check(a.preInside && a.preScrolls, `${tag}: long code scrolls inside its block`);
    check(a.sheetRight <= a.vw, `${tag}: the paper ends inside the window (right ${a.sheetRight} / ${a.vw})`);
    if (vp.width >= 1024) check(a.toolbarGap !== null && Math.abs(a.toolbarGap) <= 1, `${tag}: reader toolbar flush with the column top (gap ${a.toolbarGap}px)`);
    check(!a.rail || a.sheetW >= 560, `${tag}: rail ${a.rail ? "beside" : "folded into a drawer"}; paper ${a.sheetW}px`);
    await page.screenshot({ path: path.join(OUT, `${vp.label}-reading.png`) });

    // Study Assistant open.
    const opened = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Ask AI" && x.getBoundingClientRect().width > 0) ||
        [...document.querySelectorAll("button")].find((x) => x.querySelector("svg") && /ask ai/i.test(x.getAttribute("aria-label") || x.title || x.textContent) && x.getBoundingClientRect().width > 0);
      if (!b) return false;
      b.click();
      return true;
    });
    if (opened) {
      await sleep(900);
      const b = await measure();
      const docked = await page.evaluate(() => !document.querySelector(".fixed.inset-0.bg-black\\/30:not(.hidden)") || getComputedStyle(document.querySelector(".fixed.inset-0.bg-black\\/30")).display === "none");
      console.log(`  · ${tag} + assistant: panel ${docked ? "docked beside the page" : "over the page"}`);
      check(b.docOver <= 1 && b.mainOver <= 1 && b.sheetOver <= 1, `${tag} + assistant: nothing overflows (${b.docOver}/${b.mainOver}/${b.sheetOver}px)`);
      if (docked) {
        check(b.sheetW >= 480, `${tag} + assistant: the paper keeps a readable width (${b.sheetW}px; rail ${b.rail ? "beside" : "folded"})`);
        check(b.panelLeft === null || b.sheetRight <= b.panelLeft + 1, `${tag} + assistant: paper ends before the panel (${b.sheetRight} ≤ ${b.panelLeft})`);
        check(!b.bar || b.panelLeft === null || b.bar.right <= b.panelLeft, `${tag} + assistant: bottom bar clear of the panel (${b.bar?.right} ≤ ${b.panelLeft})`);
      } else {
        check(!b.bar, `${tag} + assistant: bottom bar steps away while the panel covers the page`);
      }
      await page.screenshot({ path: path.join(OUT, `${vp.label}-assistant.png`) });
    } else {
      check(false, `${tag}: found the Ask AI button`);
    }

    // Wherever the rail doesn't fit, the contents open as a drawer from the toolbar: on
    // the right, above the app's own menu, fully readable.
    if (!a.rail) {
      await page.keyboard.press("Escape");
      await page.evaluate(() => document.querySelector("button[aria-label='Close'], button[aria-label*='Close']")?.click());
      await sleep(500);
      const drawer = await page.evaluate(() => {
        const btn = document.querySelector("button[aria-label='Contents']");
        if (!btn) return "no contents button";
        btn.click();
        return "clicked";
      });
      if (drawer === "clicked") {
        await sleep(600);
        const d = await page.evaluate(() => {
          const dlg = document.querySelector("[role='dialog'][aria-labelledby='note-contents-title']");
          if (!dlg) return null;
          const r = dlg.getBoundingClientRect();
          // What a student actually sees at a few points inside the drawer.
          const pts = [0.25, 0.5, 0.75].map((f) => document.elementFromPoint(r.left + r.width / 2, r.top + r.height * f));
          const bg = getComputedStyle(dlg).backgroundColor;
          return {
            right: Math.round(window.innerWidth - r.right),
            width: Math.round(r.width),
            onTop: pts.every((el) => el && dlg.contains(el)),
            opaque: !/rgba\(.*,\s*0(\.\d+)?\)$/.test(bg),
            focused: dlg.contains(document.activeElement),
          };
        });
        check(!!d, `${tag}: contents open as a drawer`);
        if (d) {
          check(d.right <= 1, `${tag}: drawer opens on the right, by its button (${d.right}px from the edge)`);
          check(d.onTop, `${tag}: drawer sits above the app menu and page`);
          check(d.opaque, `${tag}: drawer surface is solid`);
          check(d.focused, `${tag}: focus moves into the drawer`);
          check(d.width <= vp.width, `${tag}: drawer fits the screen (${d.width}px)`);
        }
        await page.screenshot({ path: path.join(OUT, `${vp.label}-contents.png`) });
        await page.keyboard.press("Escape");
        await sleep(1200);
        const closed = await page.evaluate(() => !document.querySelector("[aria-labelledby='note-contents-title']"));
        check(closed, `${tag}: Escape closes the drawer`);
      }
    }
    if (process.env.EXPECT_REPAIRED_HEADING) {
      const toc = await page.evaluate(() => [...document.querySelectorAll(".note-reader-body h2")].map((h) => ({ codes: h.querySelectorAll("code").length, text: h.textContent })));
      const hit = toc.find((h) => h.text.startsWith(process.env.EXPECT_REPAIRED_HEADING));
      check(!!hit && hit.codes > 0 && !hit.text.includes("<code>"), `${tag}: literal <code> pairs render as code (${hit ? hit.text : "heading missing"})`);
    }
    check(errors.length === 0, `${tag}: no page errors ${errors.slice(0, 2).join(" | ")}`);
    await page.close();
  }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
