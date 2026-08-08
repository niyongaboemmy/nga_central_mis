import { describe, it, expect } from "vitest";
import { sanitizeNoteHtml } from "./sanitizeNoteHtml";

describe("sanitizeNoteHtml", () => {
  it("folds tiptap-extension-resize-image's containerstyle into a real style attribute", () => {
    const out = sanitizeNoteHtml(
      '<img src="data:image/png;base64,AAA" containerstyle="width: 300px; float: left;" wrapperstyle="display:block">',
    );
    expect(out).toContain('style="width:300px;float:left"');
    expect(out).not.toContain("containerstyle");
    expect(out).not.toContain("wrapperstyle");
  });

  it("keeps colwidth on table cells so column resize survives a reload", () => {
    const out = sanitizeNoteHtml('<table><tr><td colwidth="180">x</td></tr></table>');
    expect(out).toContain('colwidth="180"');
  });

  it("keeps colgroup/col width so the read-only view matches the editor's column sizing", () => {
    const out = sanitizeNoteHtml(
      '<table><colgroup><col style="width: 120px"></colgroup><tbody><tr><td>x</td></tr></tbody></table>',
    );
    expect(out).toContain("<colgroup>");
    expect(out).toContain('style="width:120px"');
  });

  it("keeps cell background shading and padding presets, strips unlisted style props", () => {
    const out = sanitizeNoteHtml(
      '<table><tr><td style="background-color: #ef4444; padding: 0.15rem 0.4rem; cursor: pointer">x</td></tr></table>',
    );
    expect(out).toContain("background-color:#ef4444");
    expect(out).toContain("padding:0.15rem 0.4rem");
    expect(out).not.toContain("cursor");
  });

  it("keeps multicolor highlight's data-color + background-color style", () => {
    const out = sanitizeNoteHtml('<mark data-color="#3b82f6" style="background-color: #3b82f6; color: inherit">hi</mark>');
    expect(out).toContain('data-color="#3b82f6"');
    expect(out).toContain("background-color:#3b82f6");
  });

  it("strips scripts and inline event handlers", () => {
    const out = sanitizeNoteHtml('<p onclick="alert(1)">hi</p><script>alert(2)</script>');
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("<script>");
  });

  it("drops an out-of-range style value instead of keeping it verbatim", () => {
    const out = sanitizeNoteHtml('<td style="background-color: javascript:alert(1)">x</td>');
    expect(out).not.toContain("javascript:");
  });
});
