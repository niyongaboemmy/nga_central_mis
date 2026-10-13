import { describe, expect, it } from "vitest";
import { generateHTML, generateJSON } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import { CodePlayground } from "../playgroundNode";
import { parseBlock } from "../../../codePlayground/playgroundData";

const extensions = [StarterKit, CodePlayground];

describe("CodePlayground node", () => {
  const data = { mode: "exercise", language: "python", title: "Low stock", code: "for p in parts:\n    pass\n", expected: "Brake Pad", solution: "print('Brake Pad')" };
  const html = `<p>Before</p><div data-type="code-playground" data-playground="${JSON.stringify(data).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"><pre><code>old fallback</code></pre></div><p>After</p>`;

  it("parses a saved block and writes it back with a readable fallback", () => {
    const json = generateJSON(html, extensions);
    const node = json.content.find((n: any) => n.type === "codePlayground");
    expect(parseBlock(node.attrs.playground)).toMatchObject(data);
    const out = generateHTML(json, extensions);
    expect(out).toContain('data-type="code-playground"');
    expect(out).toContain("<p><strong>Low stock</strong></p>");
    expect(out).toContain('<pre><code class="language-python">for p in parts:\n    pass\n</code></pre>');
    // The editor-only "fresh" flag never reaches the saved HTML.
    expect(out).not.toContain("fresh");
    const again = generateJSON(out, extensions).content.find((n: any) => n.type === "codePlayground");
    expect(parseBlock(again.attrs.playground)).toEqual(parseBlock(node.attrs.playground));
  });

  it("leaves ordinary code blocks as code blocks", () => {
    const json = generateJSON('<pre><code class="language-js">let a = 1;</code></pre>', extensions);
    expect(json.content[0].type).toBe("codeBlock");
  });
});
