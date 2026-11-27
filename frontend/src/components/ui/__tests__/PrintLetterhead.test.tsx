import { describe, it, expect } from "vitest";
import { cssString, printLetterheadCss } from "../PrintLetterhead";
import { EMPTY_LETTERHEAD } from "../../../utils/documentLetterhead";

const PNG = "data:image/png;base64,AAAA";

describe("printLetterheadCss", () => {
  it("puts the header and footer in the paper's margins with page numbers", () => {
    const css = printLetterheadCss(
      { schoolName: "S", header: { dataUrl: PNG, width: 248, height: 108 }, footer: { dataUrl: PNG, width: 1245, height: 159 }, footerLines: ["Tel: 1"] },
      { note: "Mentoring log" },
    );
    expect(css).toContain("@media print");
    expect(css).toContain("margin-top: 23mm");
    expect(css).toContain("margin-bottom: 41.6mm");
    expect(css).toContain(`@top-left { content: ""; width: 70mm; background: url("${PNG}")`);
    expect(css).toContain(`@bottom-center { content: "Tel: 1\\A Mentoring log · Page " counter(page) " of " counter(pages)`);
    expect(css).toContain(`url("${PNG}") no-repeat center`);
  });

  it("prints the school's name when there is no header image", () => {
    expect(printLetterheadCss({ ...EMPTY_LETTERHEAD, schoolName: 'A "B" School' })).toContain('@top-left { content: "A \\"B\\" School"');
  });

  it("escapes text for CSS content", () => {
    expect(cssString('a\\b"c\nd')).toBe('"a\\\\b\\"c\\A d"');
  });
});
