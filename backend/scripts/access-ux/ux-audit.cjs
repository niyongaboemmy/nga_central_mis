/* UI/UX audit of Access Studio + Insights: axe (WCAG 2.1 AA), overflow, keyboard, themes, viewports. */
const path = require("path");
const fs = require("fs");
const B = path.resolve(__dirname, "../..");
require(path.join(B, "node_modules/dotenv")).config({ path: path.join(B, ".env") });
const jwt = require(path.join(B, "node_modules/jsonwebtoken"));
const mysql = require(path.join(B, "node_modules/mysql2/promise"));
const puppeteer = require(path.join(B, "node_modules/puppeteer"));
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js", { paths: [__dirname] }), "utf8");
const OUT = process.argv[2] || path.join(__dirname, "ux");
fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.argv[3]; // optional filter on state name

const VIEWPORTS = [
  { name: "desktop", width: 1366, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "phone", width: 390, height: 844 },
];
const THEMES = ["light", "dark"];
const findings = [];
const note = (severity, where, what, detail) => findings.push({ severity, where, what, detail });

(async () => {
  const db = await mysql.createConnection({ host: "127.0.0.1", port: 8889, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: "nga_central_mis" });
  const tokenFor = async (id) => {
    const [[u]] = await db.query("SELECT token_version FROM User WHERE user_id=?", [id]);
    return jwt.sign({ userId: id, tokenVersion: u.token_version ?? 0 }, process.env.JWT_SECRET, { expiresIn: "2h" });
  };
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

  const clickText = (page, selector, text) =>
    page.evaluate((sel, t) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim() === t || e.textContent.trim().startsWith(t));
      if (el) el.click();
      return !!el;
    }, selector, text);

  // State = a function bringing the page into a state, scoped by `root`.
  const STATES = [
    { name: "studio-structure", user: 1, route: "/access-studio", root: '[data-testid="access-studio"]' },
    { name: "studio-positions", user: 1, route: "/access-studio", root: '[data-testid="access-studio"]', act: (p) => clickText(p, '[role="tab"]', "Positions") },
    { name: "studio-assign-modal", user: 1, route: "/access-studio", root: "[role=dialog]", act: async (p) => { await clickText(p, '[role="tab"]', "Positions"); await sleep(600); await clickText(p, "button", "Assign a position"); } },
    { name: "studio-end-confirm", user: 1, route: "/access-studio", root: "[role=dialog]", act: async (p) => { await clickText(p, '[role="tab"]', "Positions"); await sleep(700); await p.evaluate(() => { const b = [...document.querySelectorAll('button[aria-label^="Suspend "]')].find((x) => x.offsetParent); b && b.click(); }); } },
    { name: "studio-roles", user: 1, route: "/access-studio", root: '[data-testid="access-studio"]', act: (p) => clickText(p, '[role="tab"]', "Roles") },
    { name: "studio-role-editor", user: 1, route: "/access-studio", root: '[data-testid="access-studio"]', act: async (p) => { await clickText(p, '[role="tab"]', "Roles"); await sleep(700); await clickText(p, "[data-testid=access-studio] button", "Academic Insights Viewer"); } },
    { name: "studio-rules", user: 1, route: "/access-studio", root: '[data-testid="access-studio"]', act: (p) => clickText(p, '[role="tab"]', "Auto-assignment") },
    { name: "studio-departments", user: 1, route: "/access-studio", root: '[data-testid="access-studio"]', act: (p) => clickText(p, '[role="tab"]', "Departments") },
    { name: "studio-explorer", user: 1, route: "/access-studio", root: '[data-testid="access-studio"]', act: (p) => clickText(p, '[role="tab"]', "Explorer") },
    { name: "studio-audit", user: 1, route: "/access-studio", root: '[data-testid="access-studio"]', act: (p) => clickText(p, '[role="tab"]', "Audit") },
    { name: "studio-denied-student", user: 23, route: "/access-studio", root: '[data-testid="access-studio"]' },
    { name: "insights-lead", user: 19, route: "/insights", root: '[data-testid="insights-hub"]' },
    { name: "insights-drill", user: 19, route: "/insights", root: '[data-testid="insights-hub"]', act: (p) => clickText(p, "[data-testid=insights-hub] button", "Coding - 1") },
  ].filter((s) => !ONLY || s.name.includes(ONLY));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const retry = async (fn) => { try { return await fn(); } catch (e) { if (!/context was destroyed|detached/i.test(String(e))) throw e; await sleep(1500); return fn(); } };
  for (const st of STATES) {
    for (const theme of THEMES) {
      for (const vp of VIEWPORTS) {
        const page = await browser.newPage();
        await page.setViewport({ width: vp.width, height: vp.height });
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("console", (m) => m.type() === "error" && !/favicon|React Router Future|DevTools/.test(m.text()) && errors.push(m.text()));
        const tok = await tokenFor(st.user);
        await page.evaluateOnNewDocument((t, th) => { localStorage.setItem("token", t); localStorage.setItem("theme", th); }, tok, theme);
        await page.goto("http://localhost:5173" + st.route, { waitUntil: "networkidle0", timeout: 60000 });
        await sleep(900);
        if (st.act) { await st.act(page); await sleep(1200); }
        const tag = `${st.name}|${theme}|${vp.name}`;
        await page.screenshot({ path: `${OUT}/${st.name}-${theme}-${vp.name}.png`, fullPage: vp.name !== "desktop" });

        // Horizontal overflow of the whole page, and elements wider than the viewport.
        const overflow = await retry(() => page.evaluate(() => {
          const doc = document.documentElement;
          const wide = [...document.querySelectorAll("[data-testid] *")].filter((e) => !e.closest(".overflow-x-auto") && e.getBoundingClientRect().right > window.innerWidth + 2).slice(0, 5)
            .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(" ").slice(0, 3).join(".")} "${(e.textContent || "").trim().slice(0, 30)}"`);
          return { page: doc.scrollWidth > window.innerWidth + 2, wide };
        }));
        if (overflow.page || overflow.wide.length) note("serious", tag, "content wider than the viewport", overflow);

        // Text truncated without a way to read it (no title / aria-label).
        const clipped = await page.evaluate(() => [...document.querySelectorAll("[data-testid] .truncate")]
          .filter((e) => e.scrollWidth > e.clientWidth + 1 && !e.getAttribute("title") && !e.closest("[title]"))
          .slice(0, 5).map((e) => e.textContent.trim().slice(0, 40)));
        if (clipped.length) note("moderate", tag, "truncated text with no tooltip", clipped);

        // axe (WCAG 2.1 A/AA), scoped to our page root; only on desktop to keep it fast except contrast in both themes.
        if (vp.name === "desktop" || vp.name === "phone") {
          await page.addScriptTag({ content: AXE });
          const res = await page.evaluate(async (root) => {
            const ctx = document.querySelector(root.split(",")[0].trim()) ? root.split(",")[0].trim() : "body";
            const r = await window.axe.run(ctx, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] } });
            return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(" ") + " :: " + (n.failureSummary || "").split("\n").slice(0, 2).join(" ")) , count: v.nodes.length }));
          }, st.root);
          for (const v of res) {
            if (st.root === "body" && /region|landmark|page-has-heading-one/.test(v.id)) continue;
            note(v.impact === "critical" || v.impact === "serious" ? "serious" : "moderate", tag, `axe ${v.id}: ${v.help} (${v.count})`, v.nodes);
          }
        }
        if (errors.length) note("serious", tag, "console/page errors", errors.slice(0, 3));
        await page.close();
      }
    }
  }

  // Keyboard: the tab bar, focus visibility, Escape closes the dialog.
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    const tok1 = await tokenFor(1);
    await page.evaluateOnNewDocument((t) => { localStorage.setItem("token", t); localStorage.setItem("theme", "light"); }, tok1);
    await page.goto("http://localhost:5173/access-studio", { waitUntil: "networkidle0" });
    await sleep(800);
    await page.focus('[role="tab"]');
    const focusStyle = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { outline: s.outlineStyle + " " + s.outlineWidth, shadow: s.boxShadow }; });
    if (focusStyle.outline.startsWith("none") && (focusStyle.shadow === "none" || !focusStyle.shadow)) note("serious", "keyboard", "tab has no visible focus indicator", focusStyle);
    await page.keyboard.press("ArrowRight");
    await sleep(300);
    const afterArrow = await page.evaluate(() => ({ focused: document.activeElement?.textContent, selected: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent }));
    if (afterArrow.focused === "Structure") note("moderate", "keyboard", "ArrowRight does not move between tabs (WAI-ARIA tabs pattern)", afterArrow);
    const tabpanel = await page.evaluate(() => !!document.querySelector('[role="tabpanel"]'));
    if (!tabpanel) note("moderate", "keyboard", "tabs have no role=tabpanel / aria-controls", null);
    // dialog
    await clickText(page, '[role="tab"]', "Positions"); await sleep(600);
    await clickText(page, "button", "Assign a position"); await sleep(600);
    const dialog = await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); return { exists: !!d, modal: d?.getAttribute("aria-modal"), labelled: !!(d?.getAttribute("aria-labelledby") || d?.getAttribute("aria-label")), focusInside: d ? d.contains(document.activeElement) : false }; });
    if (!dialog.exists) note("serious", "keyboard", "Assign dialog has no role=dialog", dialog);
    else {
      if (!dialog.labelled) note("moderate", "keyboard", "dialog is not labelled", dialog);
      if (!dialog.focusInside) note("moderate", "keyboard", "focus does not move into the dialog when it opens", dialog);
    }
    await page.keyboard.press("Escape"); await sleep(500);
    const closed = await page.evaluate(() => !document.querySelector('[role="dialog"]') && ![...document.querySelectorAll("h2,h3")].some((h) => h.textContent === "Assign a position"));
    if (!closed) note("moderate", "keyboard", "Escape does not close the Assign dialog", null);
    // Destructive actions use a real confirmation with a reason field, not window.prompt
    const usesPrompt = fs.readFileSync(path.resolve(__dirname, "../../../frontend/src/components/access/PositionsTab.tsx"), "utf8").includes("window.prompt");
    if (usesPrompt) note("serious", "positions", "end/suspend use window.prompt (unstyled, not accessible, cannot be themed or validated inline)", null);
    await page.close();
  }

  await browser.close();
  await db.end();
  fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 2));
  // Summarise by (what) across states
  const byWhat = {};
  for (const f of findings) { const k = `${f.severity} | ${f.what}`; (byWhat[k] ??= []).push(f.where); }
  for (const [k, where] of Object.entries(byWhat).sort()) console.log(`${k}  [${where.length}]  e.g. ${where.slice(0, 3).join(", ")}`);
  console.log(`TOTAL findings: ${findings.length}`);
})().catch((e) => { console.error(e); process.exit(2); });
