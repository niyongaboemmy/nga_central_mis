/* Headless browser smoke test of Access Studio and Insights. Needs the MIS API on 5001 and
 * the frontend dev server on 5173. Usage: node scripts/access-ui-smoke.cjs <screenshot-dir> */
const path = require("path");
const R = require("path").resolve(__dirname, "..");
require(path.join(R, "node_modules/dotenv")).config({ path: path.join(R, ".env") });
const jwt = require(path.join(R, "node_modules/jsonwebtoken"));
const mysql = require(path.join(R, "node_modules/mysql2/promise"));
const puppeteer = require(path.join(R, "node_modules/puppeteer"));
const OUT = process.argv[2];
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓", m); } else { fail++; console.log("  ✗", m, x ? JSON.stringify(x).slice(0, 300) : ""); } };
(async () => {
  const db = await mysql.createConnection({ host: "127.0.0.1", port: 8889, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: "nga_central_mis" });
  const tokenFor = async (id) => { const [[u]] = await db.query("SELECT token_version FROM User WHERE user_id=?", [id]); return jwt.sign({ userId: id, tokenVersion: u.token_version ?? 0 }, process.env.JWT_SECRET, { expiresIn: "1h" }); };
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  async function visit(userId, route, name) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
    page.on("response", (r) => { if (r.url().includes(":5001/access") && r.status() >= 500) errors.push(`api ${r.status()} ${r.url()}`); });
    await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => localStorage.setItem("token", t), await tokenFor(userId));
    await page.goto(`http://localhost:5173${route}`, { waitUntil: "networkidle0", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    const text = await page.evaluate(() => document.body.innerText);
    const relevant = errors.filter((e) => !/favicon|DevTools|React Router Future/.test(e));
    return { page, text, errors: relevant };
  }
  console.log("Platform owner (user 1) -> /access-studio");
  let v = await visit(1, "/access-studio", "studio-owner");
  ok(/Leadership & Access/.test(v.text), "Access Studio renders", v.text.slice(0, 200));
  for (const t of ["Structure", "Positions", "Roles", "Auto-assignment", "Departments", "Explorer", "Audit"]) ok(v.text.includes(t), `tab "${t}" present`);
  ok(v.errors.length === 0, "no page / console / API errors", v.errors);
  // Roles tab: open a role, check the depth editor lists capabilities from all four apps.
  await v.page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent === "Roles").click());
  await new Promise((r) => setTimeout(r, 1500));
  const rolesText = await v.page.evaluate(() => document.body.innerText);
  ok(/HEAD_TEACHER|Head Teacher/.test(rolesText) && /Academic Insights Viewer/.test(rolesText), "Roles list shows presets");
  await v.page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Academic Insights Viewer/.test(b.textContent)).click());
  await new Promise((r) => setTimeout(r, 1000));
  const editor = await v.page.evaluate(() => document.body.innerText);
  ok(/Task Mentor/.test(editor) && /Discipline & Attendance/.test(editor) && /Tupo/.test(editor), "role editor offers capabilities of all four apps");
  await v.page.screenshot({ path: `${OUT}/studio-role-editor.png`, fullPage: true });
  await v.page.close();

  console.log("Programme lead (user 19) -> /insights");
  v = await visit(19, "/insights", "insights-lead");
  ok(/Insights/.test(v.text) && /Reported lessons delivered/.test(v.text), "Insights shows the lead's widgets", v.text.slice(0, 300));
  ok(!/@|user_id/.test(v.text.replace(/Coding/g, "")), "no personal data on the page");
  ok(v.errors.length === 0, "no page / console / API errors", v.errors);
  await v.page.close();

  console.log("Student (user 23) -> /access-studio and sidebar");
  v = await visit(23, "/access-studio", "studio-student");
  ok(/do not have access to Access Studio/.test(v.text), "student is refused Access Studio (fails closed)");
  ok(!/Leadership & Access\n/.test(v.text.split("do not have access")[0].replace("Leadership & Access", "")), "sidebar hides Leadership & Access for the student");
  ok(v.errors.filter((e) => !/403/.test(e)).length === 0, "no unexpected errors", v.errors);
  await v.page.close();

  await browser.close();
  await db.end();
  console.log(`UI smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
