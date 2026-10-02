import { describe, expect, it } from "vitest";
import { repairInlineTags } from "../repairInlineTags";

const render = (html: string) => {
  const root = document.createElement("div");
  root.innerHTML = html;
  repairInlineTags(root);
  return root;
};

describe("repairInlineTags", () => {
  it("turns escaped inline pairs in headings back into elements", () => {
    const root = render("<h2>Declaring Variables with &lt;code&gt;var&lt;/code&gt;, &lt;code&gt;let&lt;/code&gt;, and &lt;code&gt;const&lt;/code&gt;</h2>");
    const h2 = root.querySelector("h2")!;
    expect(h2.textContent).toBe("Declaring Variables with var, let, and const");
    expect(h2.querySelectorAll("code")).toHaveLength(3);
  });

  it("restores strong/em inside a paragraph and keeps surrounding text", () => {
    const root = render("<p><strong>Use &lt;em&gt;let&lt;/em&gt; first</strong> — then &lt;b&gt;const&lt;/b&gt;.</p>");
    expect(root.querySelector("em")?.textContent).toBe("let");
    expect(root.querySelector("b")?.textContent).toBe("const");
    expect(root.textContent).toBe("Use let first — then const.");
  });

  it("leaves code blocks, attributes and unbalanced tags alone", () => {
    const root = render(
      "<pre><code>&lt;code&gt;x&lt;/code&gt;</code></pre><p>&lt;code class=\"a\"&gt;y&lt;/code&gt; &lt;script&gt;z&lt;/script&gt; &lt;i&gt;open</p>",
    );
    expect(root.querySelector("pre code")!.textContent).toBe("<code>x</code>");
    expect(root.querySelector("p")!.children).toHaveLength(0);
  });
});
