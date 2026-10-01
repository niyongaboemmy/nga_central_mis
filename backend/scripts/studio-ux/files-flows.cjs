/**
 * Files on e-learning weeks — browser flow (ELEARNING_AI_LESSON_STUDIO_IMPLEMENTATION_PLAN.md §10).
 *
 *   node backend/scripts/studio-ux/files-flows.cjs --teacher=15 --student=23 --course=1 [--out=/tmp/files-ux]
 *
 * Builds real sample files (PPTX with speaker notes, DOCX, XLSX, PDF), uploads them through the
 * builder's file picker, waits for previews, then opens each as the student and screenshots it
 * (phone + desktop). Runs axe (WCAG 2 AA) on the learner previews. Needs backend 5001, frontend
 * 5173 and the file-server 5004. Exit code 1 on any failed check.
 */
const path = require("path");
const fs = require("fs");
const os = require("os");
const B = path.resolve(__dirname, "../..");
require(path.join(B, "node_modules/dotenv")).config({ path: path.join(B, ".env") });
const jwt = require(path.join(B, "node_modules/jsonwebtoken"));
const mysql = require(path.join(B, "node_modules/mysql2/promise"));
const puppeteer = require(path.join(B, "node_modules/puppeteer"));
const JSZip = require(path.join(B, "node_modules/jszip"));
const XLSX = require(path.join(B, "node_modules/xlsx"));
const AXE = fs.readFileSync(path.join(B, "scripts/access-ux/node_modules/axe-core/axe.min.js"), "utf8");

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1] || d;
const TEACHER = Number(arg("teacher", "15"));
const STUDENT = Number(arg("student", "23"));
const COURSE = Number(arg("course", "1"));
const OUT = arg("out", "/tmp/files-ux");
const FE = "http://localhost:5173";
const API = "http://localhost:5001";
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildPdf(text) {
  const content = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => (body += `${String(o).padStart(10, "0")} 00000 n \n`));
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

async function buildDocx(paragraphs) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const ps = paragraphs.map(([style, t]) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r>${style ? "<w:rPr><w:b/><w:sz w:val=\"32\"/></w:rPr>" : ""}<w:t xml:space="preserve">${t}</w:t></w:r></w:p>`).join("");
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${ps}</w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function buildPptx(slides) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  slides.forEach((s, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`, `<p:sld><p:txBody>${s.lines.map((l) => `<a:p><a:r><a:t>${l}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sld>`);
    if (s.notes) zip.file(`ppt/notesSlides/notesSlide${i + 1}.xml`, `<p:notes><a:p><a:r><a:t>${s.notes}</a:t></a:r></a:p></p:notes>`);
  });
  return zip.generateAsync({ type: "nodebuffer" });
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "files-ux-"));
  const files = {
    "Colour theory.pptx": await buildPptx([
      { lines: ["Colour theory", "Week 2 — Elements of design"], notes: "Start by asking students which colours they see on a mobile-money poster." },
      { lines: ["Primary colours", "Red, yellow and blue"], notes: "Mix two primaries to show a secondary colour." },
      { lines: ["Warm and cool colours"] },
    ]),
    "Design brief.docx": await buildDocx([
      ["Heading1", "Design brief: a poster for a Kigali cooperative"],
      [null, "Create a poster that uses line, shape and colour to advertise a coffee cooperative."],
      [null, "Use at most three colours and show balance between text and images."],
    ]),
    "Marks.xlsx": (() => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Student", "Poster", "Logo"], ["Uwase", 8, 9], ["Mugisha", 7, 6], ["Keza", 9, 8]]), "Week 2");
      return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    })(),
    "Worksheet.pdf": buildPdf("Worksheet: label the elements of design on this poster"),
  };
  for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), data);

  const db = await mysql.createConnection({ host: "127.0.0.1", port: Number(process.env.DB_PORT || 8889), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const tokenFor = async (id) => {
    const [[u]] = await db.query("SELECT token_version FROM User WHERE user_id=?", [id]);
    return jwt.sign({ userId: id, tokenVersion: u.token_version ?? 0 }, process.env.JWT_SECRET, { expiresIn: "2h" });
  };
  const tTeacher = await tokenFor(TEACHER);
  const tStudent = await tokenFor(STUDENT);
  const api = (t, p, init = {}) => fetch(`${API}${p}`, { ...init, headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", ...(init.headers || {}) } }).then((r) => r.json());

  // Use week 2 of the course; make the course and week visible to students for the learner part.
  const builder = await api(tTeacher, `/elearning/courses/${COURSE}`);
  const week = builder.data.sections[1];
  await api(tTeacher, `/elearning/courses/${COURSE}`, { method: "PATCH", body: JSON.stringify({ status: "PUBLISHED" }) });
  await api(tTeacher, `/elearning/sections/${week.section_id}`, { method: "PATCH", body: JSON.stringify({ status: "PUBLISHED" }) });

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const open = async (token, vp) => {
    const page = await browser.newPage();
    await page.setViewport(vp);
    await page.evaluateOnNewDocument((t, uids) => {
      localStorage.setItem("token", t);
      sessionStorage.setItem("nga.pwa.autoPromptDismissedThisSession", "1");
      for (const v of ["2026-10-01", "2026-09-30"]) for (const u of uids) localStorage.setItem(`nga.activityNotice.${v}.${u}`, "1");
    }, token, [TEACHER, STUDENT]);
    page.on("pageerror", (e) => record("no page errors", false, e.message));
    return page;
  };

  // 1. Teacher uploads through the builder's picker.
  const tp = await open(tTeacher, { width: 1440, height: 900 });
  await tp.goto(`${FE}/elearning/courses/${COURSE}/build`, { waitUntil: "networkidle2" });
  await tp.evaluate((sid) => {
    const el = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Week 2"));
    el?.click();
    void sid;
  }, week.section_id);
  await sleep(800);
  const input = await tp.$('input[type="file"]');
  await input.uploadFile(...Object.keys(files).map((n) => path.join(dir, n)));
  await tp.waitForFunction(() => document.body.innerText.includes("Added 4 files"), { timeout: 60000 }).then(
    () => record("teacher uploads 4 files to a week in one go", true),
    () => record("teacher uploads 4 files to a week in one go", false),
  );
  await tp.screenshot({ path: path.join(OUT, "1-builder-after-upload.png") });

  // 2. Wait for the preview pipeline (the job worker runs on enqueue).
  let assets = [];
  for (let i = 0; i < 30; i++) {
    [assets] = await db.query("SELECT original_name, preview_status, page_count, text_chars FROM FileAsset WHERE course_id=? AND original_name IN (?) ORDER BY asset_id DESC LIMIT 4", [COURSE, Object.keys(files)]);
    if (assets.length === 4 && assets.every((a) => !["PENDING", "PROCESSING"].includes(a.preview_status))) break;
    await sleep(2000);
  }
  for (const a of assets) record(`preview for ${a.original_name}: ${a.preview_status} (text ${a.text_chars ?? 0} chars)`, ["READY", "UNSUPPORTED"].includes(a.preview_status));

  // 3. The student opens each file in the course (desktop dark + phone light).
  const course = await api(tStudent, `/elearning/my/courses/${COURSE}`);
  const items = (course.data?.sections ?? []).flatMap((s) => s.items).filter((i) => i.item_type === "FILE");
  record("student sees the uploaded files on the week", items.length >= 4, `${items.length} file items`);
  const expectText = { "Colour theory": "Primary colours", "Design brief": "coffee cooperative", Marks: "Mugisha", Worksheet: "pages" };
  for (const [theme, vp] of [["dark", { width: 1280, height: 860 }], ["light", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    const sp = await open(tStudent, vp);
    for (const item of items.slice(0, 4)) {
      await sp.goto(`${FE}/my-learning/courses/${COURSE}/items/${item.item_id}`, { waitUntil: "networkidle2" });
      await sp.evaluate((th) => {
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(th);
      }, theme);
      const want = expectText[item.title] || item.title;
      const ok = await sp
        .waitForFunction((w) => document.body.innerText.toLowerCase().includes(w.toLowerCase()) || !!document.querySelector(".react-pdf__Page canvas"), { timeout: 30000 }, want)
        .then(() => true, () => false);
      await sleep(1200);
      await sp.screenshot({ path: path.join(OUT, `2-${vp.width}-${theme}-${item.title.replace(/\W+/g, "_")}.png`) });
      record(`${theme}/${vp.width}: "${item.title}" previews in the page`, ok);
      if (vp.width > 400) {
        await sp.evaluate(AXE);
        const v = await sp.evaluate(async () => (await axe.run({ exclude: [['[aria-label="Notifications"]']] }, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })).violations.filter((x) => x.impact === "serious" || x.impact === "critical").map((x) => `${x.id}:${x.nodes[0]?.target}`));
        record(`axe ${item.title}`, v.length === 0, v.join("; "));
      }
    }
    await sp.close();
  }
  await browser.close();
  await db.end();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${OUT}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
