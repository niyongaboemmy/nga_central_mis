import { describe, it, expect } from "vitest";
import {
  EMPTY_LETTERHEAD,
  FOOTER_IMAGE_MAX_MM,
  Letterhead,
  footerLinesOf,
  letterheadFrame,
  letterheadLayout,
} from "../services/documents/letterhead";

/**
 * The document letterhead (services/documents/letterhead.ts): a school's header and footer
 * on every page of every server-made PDF. These pin the sizes the PDFs are paginated with
 * and what goes into Chromium's header/footer templates.
 */
const img = (width: number, height: number) => ({ dataUri: "data:image/png;base64,AAAA", width, height });
const cambridge: Letterhead = { schoolName: "Test School", header: img(248, 108), footer: img(1245, 159), footerLines: [] };

describe("letterheadLayout", () => {
  it("keeps page numbers and the school's name for a school that set nothing", () => {
    const l = letterheadLayout({ ...EMPTY_LETTERHEAD, schoolName: "Plain School" });
    expect(l.topMm).toBe(16); // edge 6 + name 6 + gap 4
    expect(l.bottomMm).toBe(14); // edge 6 + page line 4 + gap 4
    expect(l.footerImageHeightMm).toBe(0);
  });

  it("fits a wide footer strip to the content width and reserves its height", () => {
    const l = letterheadLayout(cambridge, { sideMm: 14 });
    expect(l.contentWidthMm).toBe(182);
    expect(l.footerImageWidthMm).toBe(172.26); // capped by the 22 mm height
    expect(l.footerImageHeightMm).toBe(FOOTER_IMAGE_MAX_MM);
    expect(l.topMm).toBe(23); // edge 6 + logo 13 + gap 4
    expect(l.bottomMm).toBe(37); // edge 6 + page 4 + image 22 + 1 + gap 4
    expect(l.contentHeightMm).toBe(297 - 23 - 37);
  });

  it("uses the full width when the strip is short enough", () => {
    const l = letterheadLayout({ ...cambridge, footer: img(2000, 100) }, { sideMm: 10 });
    expect(l.footerImageWidthMm).toBe(190);
    expect(l.footerImageHeightMm).toBe(9.5);
  });

  it("adds a line of room per footer text line, and honours the document's minimums", () => {
    const text = letterheadLayout({ ...EMPTY_LETTERHEAD, footerLines: ["one", "two"] });
    expect(text.bottomMm).toBe(6 + 4 + 7.2 + 1 + 4);
    const min = letterheadLayout(EMPTY_LETTERHEAD, { minTopMm: 22, minBottomMm: 30 });
    expect([min.topMm, min.bottomMm]).toEqual([22, 30]);
  });

  it("gives landscape pages their own size and leaves the header out on request", () => {
    const l = letterheadLayout(cambridge, { landscape: true, header: false });
    expect([l.pageWidthMm, l.pageHeightMm]).toEqual([297, 210]);
    expect(l.topMm).toBe(12);
  });
});

describe("letterheadFrame", () => {
  it("puts both images and page numbers in the templates, and the matching margins", () => {
    const f = letterheadFrame(cambridge, { title: "Scheme <of> Work", note: "Note & more" });
    expect(f.margin).toEqual({ top: "23mm", bottom: "37mm", left: "14mm", right: "14mm" });
    expect(f.headerTemplate).toContain(cambridge.header!.dataUri);
    expect(f.headerTemplate).toContain("Scheme &lt;of&gt; Work");
    expect(f.footerTemplate).toContain(cambridge.footer!.dataUri);
    expect(f.footerTemplate).toContain('class="pageNumber"');
    expect(f.footerTemplate).toContain('class="totalPages"');
    expect(f.footerTemplate).toContain("Note &amp; more");
    // Inside style="..." no double quote may appear (it would end the attribute).
    expect(/style="[^"]*'Segoe UI'/.test(f.headerTemplate)).toBe(true);
  });

  it("prints the school's name when there is no header image, and nothing when told not to", () => {
    expect(letterheadFrame({ ...EMPTY_LETTERHEAD, schoolName: "A&B School" }).headerTemplate).toContain("A&amp;B School");
    expect(letterheadFrame(cambridge, { header: false }).headerTemplate).toBe("<span></span>");
  });

  it("prints footer text lines, escaped", () => {
    const f = letterheadFrame({ ...EMPTY_LETTERHEAD, footerLines: ["Tel <1>", "Line 2"] });
    expect(f.footerTemplate).toContain("Tel &lt;1&gt;");
    expect(f.footerTemplate).toContain("Line 2");
  });
});

describe("footerLinesOf", () => {
  it("drops blank lines and keeps at most four", () => {
    expect(footerLinesOf(" a \n\n b\r\nc\nd\ne")).toEqual(["a", "b", "c", "d"]);
    expect(footerLinesOf(null)).toEqual([]);
  });
});
