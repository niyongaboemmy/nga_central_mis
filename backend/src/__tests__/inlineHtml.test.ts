import { describe, expect, it } from "vitest";
import { inlineHtml } from "../services/elearning/generation/artifacts/shared";

describe("inlineHtml", () => {
  it("keeps bare inline tags the model writes in headings and summaries", () => {
    expect(inlineHtml("Declaring Variables with <code>var</code> and <strong>let</strong>")).toBe(
      "Declaring Variables with <code>var</code> and <strong>let</strong>",
    );
  });

  it("escapes everything else", () => {
    expect(inlineHtml('<script>x</script> <code onclick="1">y</code> <i>open & "q"')).toBe(
      "&lt;script&gt;x&lt;/script&gt; &lt;code onclick=&quot;1&quot;&gt;y&lt;/code&gt; &lt;i&gt;open &amp; &quot;q&quot;",
    );
  });
});
