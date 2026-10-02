import { describe, expect, it, vi } from "vitest";
import { enhanceCodeBlocks, splitHighlightedLines } from "../codeWindow";
import { highlightCode } from "../highlight";

const mount = (html: string) => {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("splitHighlightedLines", () => {
  it("closes and reopens spans that cross a line break", () => {
    const lines = splitHighlightedLines('<span class="c">/* a\nb */</span> x\ny');
    expect(lines).toEqual(['<span class="c">/* a</span>', '<span class="c">b */</span> x', "y"]);
  });

  it("keeps nested spans balanced on every line", () => {
    const lines = splitHighlightedLines('<span class="a"><span class="b">1\n2</span>3</span>');
    for (const l of lines) expect((l.match(/<span/g) || []).length).toBe((l.match(/<\/span>/g) || []).length);
  });
});

describe("highlightCode", () => {
  it("uses the declared language", () => {
    expect(highlightCode("const x = 1;", "javascript").language).toBe("javascript");
  });
  it("guesses common languages and leaves prose plain", () => {
    expect(highlightCode("def greet(name):\n    return f'Hi {name}'\n\nprint(greet('Ana'))").language).toBe("python");
    expect(highlightCode("hello there").language).toBe("");
  });
});

describe("enhanceCodeBlocks", () => {
  it("turns a pre into a window with numbered lines, label and actions", async () => {
    const root = mount('<p>Intro</p><pre><code class="language-js">let a = 1;\nconsole.log(a);\n</code></pre>');
    enhanceCodeBlocks(root);
    const win = root.querySelector("figure.code-window")!;
    expect(win).toBeTruthy();
    expect(root.querySelectorAll("pre")).toHaveLength(1);
    expect(win.querySelector(".code-window__lang")!.textContent).toBe("JavaScript");
    expect(win.querySelector(".code-window__meta")!.textContent).toBe("2 lines");
    expect(win.querySelectorAll(".cw-line")).toHaveLength(2);
    // Numbers come from attributes, so they aren't part of the code text.
    expect(win.querySelector(".code-window__body")!.textContent).toBe("let a = 1;console.log(a);");
    await flush();
    await flush();
    expect(win.querySelector(".hljs-keyword")).toBeTruthy();
  });

  it("is idempotent", () => {
    const root = mount("<pre><code>x = 1</code></pre>");
    enhanceCodeBlocks(root);
    enhanceCodeBlocks(root);
    expect(root.querySelectorAll("figure.code-window")).toHaveLength(1);
  });

  it("copies the original code, toggles wrap, and folds long blocks", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const code = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n");
    const root = mount(`<pre>${code}</pre>`);
    enhanceCodeBlocks(root);
    const win = root.querySelector<HTMLElement>(".code-window")!;

    win.querySelector<HTMLButtonElement>(".cw-copy")!.click();
    await flush();
    expect(writeText).toHaveBeenCalledWith(code);
    expect(win.querySelector(".cw-copy")!.textContent).toContain("Copied");

    const wrap = win.querySelector<HTMLButtonElement>(".cw-wrap")!;
    wrap.click();
    expect(win.classList.contains("is-wrapped")).toBe(true);
    expect(wrap.getAttribute("aria-pressed")).toBe("true");

    expect(win.classList.contains("is-folded")).toBe(true);
    const more = win.querySelector<HTMLButtonElement>(".code-window__more")!;
    expect(more.textContent).toContain("Show all 30 lines");
    more.click();
    expect(win.classList.contains("is-folded")).toBe(false);
    expect(more.getAttribute("aria-expanded")).toBe("true");
  });

  it("offers Explain only when asked, with the code", () => {
    const onExplain = vi.fn();
    const root = mount('<pre><code class="language-python">print(1)</code></pre><pre>y</pre>');
    enhanceCodeBlocks(root, { onExplain });
    const buttons = root.querySelectorAll<HTMLButtonElement>(".cw-explain");
    expect(buttons).toHaveLength(2);
    buttons[0].click();
    expect(onExplain).toHaveBeenCalledWith("print(1)", "Python");
    const plain = mount("<pre>z</pre>");
    enhanceCodeBlocks(plain);
    expect(plain.querySelector(".cw-explain")).toBeNull();
  });
});
