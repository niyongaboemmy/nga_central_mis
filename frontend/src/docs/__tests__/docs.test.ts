import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { GUIDES, MODULES, buildGuides, guidesOf, searchGuides } from "../index";
import { parseGuide } from "../markdown";

const ROOT = path.resolve(__dirname, "..");
const folders = fs.readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== "__tests__").map((e) => e.name);
const files = folders.flatMap((f) => fs.readdirSync(path.join(ROOT, f)).filter((n) => n.endsWith(".md")).map((n) => ({ folder: f, name: n, text: fs.readFileSync(path.join(ROOT, f, n), "utf8") })));

describe("staff documentation folders", () => {
  it("has one folder per module, and every folder is a listed module", () => {
    expect(folders.sort()).toEqual(MODULES.map((m) => m.id).sort());
  });

  it("gives every module an overview and at least four guides", () => {
    for (const m of MODULES) {
      const guides = guidesOf(m.id);
      expect(guides.length, m.id).toBeGreaterThanOrEqual(4);
      expect(guides[0].slug, m.id).toBe("overview");
    }
  });

  it("loads every file on disk", () => {
    expect(GUIDES.length).toBe(files.length);
  });
});

describe("guide files", () => {
  it.each(files.map((f) => [`${f.folder}/${f.name}`, f] as const))("%s follows the format", (_label, f) => {
    expect(f.name).toMatch(/^\d{2}-[a-z0-9]+(-[a-z0-9]+)*\.md$/);
    const g = parseGuide(f.text);
    expect(g.title.length).toBeGreaterThan(2);
    expect(g.summary.length).toBeGreaterThan(10);
    expect(g.blocks.length).toBeGreaterThan(3);
    const body = f.text.replace(/^---\n[\s\S]*?\n---\n/, "");
    // The title comes from the frontmatter.
    expect(body).not.toMatch(/^# /m);
    // HTML and images are not rendered.
    expect(body).not.toMatch(/<\/?[a-z][^>]*>/i);
    expect(body).not.toMatch(/!\[/);
    // Product name rule, and nothing internal.
    expect(f.text).not.toMatch(/NGA (Central )?MIS|Central MIS|\bthe MIS\b/i);
    expect(f.text).not.toMatch(/\.tsx?\b|\/api\/|pull request|migration \d/i);
    // No personal data: e-mail addresses other than examples, phone numbers.
    for (const mail of f.text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []) expect(mail).toMatch(/example\.|@school\./);
    expect(f.text).not.toMatch(/\+?250[\s-]?7\d{2}/);
  });

  it("has unique addresses inside each folder", () => {
    for (const m of MODULES) {
      const slugs = guidesOf(m.id).map((g) => g.slug);
      expect(new Set(slugs).size, m.id).toBe(slugs.length);
    }
  });
});

describe("markdown dialect", () => {
  const sample = ["---", "title: Take a register", "summary: Record who is present in a lesson.", "---", "", "Use this at the start of a lesson.", "", "## Steps", "", "1. Open **Today**.", "2. Choose the lesson.", "   It opens the class list.", "", "- one", "- two", "", "> **Tip:** Works offline.", "", "| Mark | Meaning |", "| --- | --- |", "| P | Present |", "", "### Steps", ""].join("\n");

  it("parses frontmatter and every block kind", () => {
    const g = parseGuide(sample);
    expect(g.title).toBe("Take a register");
    expect(g.summary).toBe("Record who is present in a lesson.");
    expect(g.blocks.map((b) => b.kind)).toEqual(["p", "heading", "list", "list", "callout", "table", "heading"]);
    const steps = g.blocks[2];
    expect(steps.kind === "list" && steps.ordered && steps.items).toEqual(["Open **Today**.", "Choose the lesson. It opens the class list."]);
    const tip = g.blocks[4];
    expect(tip.kind === "callout" && tip.tone).toBe("tip");
    expect(g.plain).toContain("Open Today.");
  });

  it("gives repeated headings different anchors", () => {
    const ids = parseGuide(sample).blocks.flatMap((b) => (b.kind === "heading" ? [b.id] : []));
    expect(ids).toEqual(["steps", "steps-2"]);
  });

  it("orders guides by their number and finds them by word", () => {
    const guides = buildGuides({ "./tendo/02-b.md": sample, "./tendo/01-overview.md": sample.replace("Take a register", "Overview"), "./README.md": "x" });
    expect(guides.map((g) => g.slug)).toEqual(["overview", "b"]);
    expect(searchGuides("register offline", guides).map((h) => h.guide.slug)).toEqual(["b"]);
    expect(searchGuides("offline", guides).map((h) => h.guide.slug)).toEqual(["overview", "b"]);
    expect(searchGuides("nothing-like-this", guides)).toEqual([]);
  });
});
