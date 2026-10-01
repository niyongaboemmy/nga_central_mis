/* Theme contrast scan for Usage & Monitoring: every page, every tab, open selects and
 * dialogs, in the theme given (light|dark). Flags visible text whose contrast with the
 * background actually behind it is below 4.5:1 (3:1 for large text).
 *
 * Usage: node scripts/activity-e2e/contrast.cjs <light|dark> [outDir]
 * Needs the same API (5071) + vite (5174) as e2e.cjs.
 */
const path = require("path");
const fs = require("fs");
const B = path.resolve(__dirname, "../..");
require(path.join(B, "node_modules/dotenv")).config({ path: path.join(B, ".env") });
const jwt = require(path.join(B, "node_modules/jsonwebtoken"));
const mysql = require(path.join(B, "node_modules/mysql2/promise"));
const puppeteer = require(path.join(B, "node_modules/puppeteer"));

const APP = process.env.E2E_APP || "http://localhost:5174";
const THEME = process.argv[2] || "dark";
const OUT = process.argv[3] || path.join(__dirname, "out-contrast");
const ADMIN_ID = Number(process.env.E2E_ADMIN_ID || 1);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SCAN = () => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = "1"] = m[1].split(/[ ,/]+/).filter(Boolean);
    return [Number(r), Number(g), Number(b), Number(a)];
  };
  const lum = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const blend = (top, bottom) => {
    const a = top[3];
    return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1];
  };
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c[3] > 0) layers.push(c);
      if (c && c[3] >= 1) break;
    }
    let base = layers.length && layers[layers.length - 1][3] >= 1 ? layers.pop() : [255, 255, 255, 1];
    while (layers.length) base = blend(layers.pop(), base);
    return base;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) < 0.15) return false;
      if (e.classList?.contains("sr-only") || e.getAttribute?.("aria-hidden") === "true") return false;
    }
    return true;
  };
  const out = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim();
    if (!t || t.length < 1) continue;
    const el = n.parentElement;
    if (!el || seen.has(el) || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) continue;
    seen.add(el);
    if (el.closest(".leaflet-container")) continue; // map tiles carry their own colours
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    const isSvg = el instanceof SVGElement;
    const fg = parse(isSvg ? s.fill : s.color);
    if (!fg) continue;
    const bg = bgOf(el);
    const fgc = fg[3] < 1 ? blend(fg, bg) : fg;
    const L1 = lum(fgc), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.6 && Number(s.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) {
      const cls = (typeof el.className === "string" ? el.className : el.getAttribute("class") || "").slice(0, 90);
      out.push({ text: t.slice(0, 50), ratio: Math.round(ratio * 100) / 100, fg: (isSvg ? s.fill : s.color), bg: `rgb(${bg.slice(0, 3).map(Math.round).join(",")})`, tag: el.tagName.toLowerCase(), cls });
    }
  }
  return out;
};

(async () => {
  const db = await mysql.createConnection({ host: process.env.DB_HOST || "localhost", port: Number(process.env.DB_PORT || 8889), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME || "nga_central_mis" });
  const [[u]] = await db.query("SELECT token_version, preferred_theme FROM User WHERE user_id = ?", [ADMIN_ID]);
  // The signed-in user's saved preference overrides localStorage: set it for the run, restore after.
  await db.query("UPDATE User SET preferred_theme = ? WHERE user_id = ?", [THEME, ADMIN_ID]);
  const token = jwt.sign({ userId: ADMIN_ID, tokenVersion: u.token_version || 0 }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const [[dev]] = await db.query("SELECT device_id AS h FROM AnalyticsDevice ORDER BY last_seen DESC LIMIT 1").catch(() => [[null]]);
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
  const findings = [];
  try {
    const p = await browser.newPage();
    await p.setViewport({ width: 1440, height: 1000 });
    await p.evaluateOnNewDocument((t, th, uid) => {
      localStorage.setItem("token", t);
      localStorage.setItem("theme", th);
      localStorage.setItem("nga.pwa.installSnoozedUntil", String(Date.now() + 86400000));
      sessionStorage.setItem("nga.pwa.autoPromptDismissedThisSession", "1");
      localStorage.setItem(`nga.activityNotice.2026-10-01.${uid}`, "1");
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    }, token, THEME, ADMIN_ID);
    const scan = async (where) => {
      const f = await p.evaluate(SCAN);
      for (const x of f) findings.push({ where, ...x });
    };
    const routes = ["/analytics", "/analytics/realtime", "/analytics/access", "/analytics/audience", "/analytics/visitors", "/analytics/engagement", "/analytics/apps", "/analytics/retention", "/analytics/locations", "/analytics/technology", "/analytics/explore", "/analytics/watchlist", "/analytics/settings", "/analytics/users/13", "/analytics/ip/::1", "/me/activity"];
    if (dev?.h) routes.push(`/analytics/visitors/${dev.h}`);
    for (const r of routes) {
      await p.goto(APP + r, { waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
      await sleep(1800);
      const cls = await p.evaluate(() => document.documentElement.className);
      if (!cls.includes(THEME)) console.log(`WARN ${r}: html class "${cls}"`);
      await scan(`${r}`);
      await p.screenshot({ path: path.join(OUT, `${THEME}${r.replace(/\W+/g, "_")}.png`), fullPage: true });
      // Every segmented control option (tabs inside the page).
      const radios = await p.$$('[role="radiogroup"] [role="radio"]');
      for (let i = 0; i < radios.length; i++) {
        const all = await p.$$('[role="radiogroup"] [role="radio"]');
        if (!all[i]) continue;
        const label = await all[i].evaluate((e) => e.textContent.trim());
        await all[i].click().catch(() => {});
        await sleep(900);
        await scan(`${r} [tab ${label}]`);
      }
      // Open each searchable select once.
      const selects = await p.$$('input[id^="ss-"]');
      for (let i = 0; i < Math.min(selects.length, 6); i++) {
        await selects[i].click().catch(() => {});
        await sleep(400);
        await scan(`${r} [select ${i} open]`);
        await p.keyboard.press("Escape");
      }
      // Dialog buttons on the person pages.
      if (/users|visitors\/|watchlist/.test(r)) {
        for (const label of ["Watch", "Message", "Sign out everywhere", "Block device", "New watch"]) {
          const btn = await p.$$("xpath/" + `//button[normalize-space(.)="${label}"]`);
          if (!btn[0]) continue;
          await btn[0].click().catch(() => {});
          await sleep(600);
          await scan(`${r} [dialog ${label}]`);
          await p.screenshot({ path: path.join(OUT, `${THEME}${r.replace(/\W+/g, "_")}_dlg_${label.replace(/\W+/g, "_")}.png`) });
          await p.keyboard.press("Escape");
          await sleep(300);
          const cancel = await p.$$("xpath/" + '//button[normalize-space(.)="Cancel"]');
          if (cancel[0]) await cancel[0].click().catch(() => {});
        }
      }
    }
  } finally {
    await browser.close();
    await db.query("UPDATE User SET preferred_theme = ? WHERE user_id = ?", [u.preferred_theme, ADMIN_ID]);
    await db.end();
  }
  // Group identical problems (same text/classes) across states.
  const key = (f) => `${f.text}|${f.cls}|${f.fg}|${f.bg}`;
  const grouped = new Map();
  for (const f of findings) {
    const g = grouped.get(key(f)) ?? { ...f, where: [] };
    if (!g.where.includes(f.where.split(" [")[0])) g.where.push(f.where.split(" [")[0]);
    grouped.set(key(f), g);
  }
  const list = [...grouped.values()].sort((a, b) => a.ratio - b.ratio);
  fs.writeFileSync(path.join(OUT, `findings-${THEME}.json`), JSON.stringify(list, null, 2));
  console.log(`${THEME}: ${list.length} low-contrast text elements (${findings.length} sightings)`);
  for (const f of list.slice(0, 80)) console.log(`${f.ratio}\t${f.fg} on ${f.bg}\t<${f.tag} class="${f.cls}">\t"${f.text}"\t${f.where.join(", ")}`);
})();
