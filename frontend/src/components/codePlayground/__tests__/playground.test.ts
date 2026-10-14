import { afterEach, describe, expect, it, vi } from "vitest";
import { codeTextOf, normalizePreLineBreaks } from "../codeText";
import { resolveLanguage, isRunnable, languageById } from "../languages";
import { outputMatches, parseBlock, serializeBlock, DEFAULT_BLOCK } from "../playgroundData";
import { buildPageDocument, buildReactDocument, buildScriptDocument } from "../browserRun";
import { closePlayground, openPlayground, subscribePlayground, type PlaygroundRequest } from "../store";
import { enhanceCodeBlocks } from "../../codeWindow/codeWindow";

const el = (html: string) => {
  const d = document.createElement("div");
  d.innerHTML = html;
  document.body.appendChild(d);
  return d;
};

describe("codeTextOf", () => {
  it("keeps lines broken with <br> and per-line paragraphs", () => {
    const a = el("<pre><code>// parts in inventory<br>const parts = [];<br/>console.log(parts);</code></pre>").querySelector("pre")!;
    expect(codeTextOf(a)).toBe("// parts in inventory\nconst parts = [];\nconsole.log(parts);");
    const b = el("<pre><div>int a = 1;</div><div>int b = 2;</div></pre>").querySelector("pre")!;
    expect(codeTextOf(b)).toBe("int a = 1;\nint b = 2;");
  });
  it("reads every <code> in the block, not only the first", () => {
    const pre = el("<pre><code>const a = parts.filter(p =&gt;</code>\n<code>  p.quantity &lt; 20);</code></pre>").querySelector("pre")!;
    expect(codeTextOf(pre)).toBe("const a = parts.filter(p =>\n  p.quantity < 20);");
  });
  it("normalizes HTML before an editor parses it", () => {
    expect(normalizePreLineBreaks("<p>a<br>b</p><pre><code>x = 1<br>y = 2</code></pre>")).toBe("<p>a<br>b</p><pre><code>x = 1\ny = 2</code></pre>");
  });
});

describe("resolveLanguage", () => {
  it("maps lesson languages to playground languages", () => {
    expect(resolveLanguage("python")?.id).toBe("python");
    expect(resolveLanguage("cpp")?.id).toBe("cpp");
    expect(resolveLanguage("xml", "<h1>Hi</h1>")?.id).toBe("html");
    expect(resolveLanguage("json")).toBeNull();
    expect(resolveLanguage("plaintext")).toBeNull();
  });
  it("tells browser JavaScript, Node and React apart", () => {
    expect(resolveLanguage("javascript", "console.log([1,2].map(x => x * 2));")?.id).toBe("javascript");
    expect(resolveLanguage("javascript", 'const fs = require("fs");')?.id).toBe("node");
    expect(resolveLanguage("javascript", "function App() {\n  return <div>Hi</div>;\n}")?.id).toBe("react");
  });
  it("runs browser languages always and server ones when the runner has them", () => {
    expect(isRunnable(languageById("html")!, new Set())).toBe(true);
    expect(isRunnable(languageById("python")!, new Set(["python"]))).toBe(true);
    expect(isRunnable(languageById("php")!, new Set(["python"]))).toBe(false);
    expect(isRunnable(languageById("php")!, null)).toBe(true);
  });
});

describe("playground blocks", () => {
  it("round-trips and drops empty fields", () => {
    const b = { ...DEFAULT_BLOCK, mode: "exercise" as const, title: "Sum", code: "print(1)", expected: "1" };
    const json = serializeBlock(b);
    expect(JSON.parse(json)).toEqual({ mode: "exercise", language: "python", code: "print(1)", title: "Sum", expected: "1" });
    expect(parseBlock(json)).toEqual(b);
  });
  it("survives bad data", () => {
    expect(parseBlock("{not json")).toEqual(DEFAULT_BLOCK);
    expect(parseBlock({ language: "cobol", code: 5 }).language).toBe("python");
  });
  it("compares output ignoring trailing spaces and blank lines", () => {
    expect(outputMatches("Total: 5  \n\n", "Total: 5")).toBe(true);
    expect(outputMatches("Total: 6", "Total: 5")).toBe(false);
  });
});

describe("documents", () => {
  it("wraps browser JavaScript with the console bridge and escapes </script>", () => {
    const doc = buildScriptDocument({ entry: "script.js", files: [{ path: "script.js", content: 'console.log("</script>")' }] }, "run-1", "Aline");
    expect(doc).toContain('var RUN="run-1"');
    expect(doc).toContain('["Aline"]');
    expect(doc).toContain('console.log("<\\/script>")');
  });
  it("puts the bridge into a full HTML document's head", () => {
    const { doc } = buildPageDocument("<!doctype html><html><head><title>x</title></head><body><p>Hi</p></body></html>", "index.html", [], "r", "");
    expect(doc.indexOf("__ngaPlayground")).toBeLessThan(doc.indexOf("<title>"));
    expect(doc).toContain("__ngaDone()})</script></body>");
  });
  it("loads React and Babel for JSX", () => {
    const doc = buildReactDocument({ entry: "App.jsx", files: [{ path: "App.jsx", content: "function App(){return <p>Hi</p>}" }] }, "r");
    expect(doc).toContain("react-dom@18.3.1");
    expect(doc).toContain("@babel/standalone");
    expect(doc).toContain("export default App;");
  });
});

describe("Run on lesson code windows", () => {
  let unsubscribe: (() => void) | null = null;
  afterEach(() => {
    unsubscribe?.();
    unsubscribe = null;
    closePlayground();
  });

  it("shows Run for a runnable language and opens the playground with the code", async () => {
    const seen: (PlaygroundRequest | null)[] = [];
    unsubscribe = subscribePlayground((r) => seen.push(r));
    const root = el('<pre><code class="language-python">name = "Aline"<br>print(name)</code></pre>');
    enhanceCodeBlocks(root);
    const run = root.querySelector<HTMLButtonElement>(".cw-run")!;
    expect(run.hidden).toBe(false);
    run.click();
    const req = seen[seen.length - 1]!;
    expect(req).toMatchObject({ autoRun: true, block: { language: "python", code: 'name = "Aline"\nprint(name)' } });
  });

  it("repairs a squashed block before showing it, then polishes it", async () => {
    unsubscribe = subscribePlayground(() => undefined);
    const root = el("<pre><code class=\"language-javascript\">// Array of car parts in inventoryconst parts = [ { id: 1, qty: 25 }, { id: 2, qty: 15 }];const low = parts.filter(p =&gt; p.qty &lt; 20);console.log(low);</code></pre>");
    enhanceCodeBlocks(root);
    // Laid out at once (Prettier polishes it a moment later, once it has loaded).
    const lines = Array.from(root.querySelectorAll(".cw-code")).map((l) => l.textContent);
    expect(lines).toEqual(["// Array of car parts in inventory", "const parts = [ { id: 1, qty: 25 }, { id: 2, qty: 15 }];", "const low = parts.filter(p => p.qty < 20);", "console.log(low);"]);
    await vi.waitFor(() => expect(root.querySelector(".code-window__meta")!.textContent).not.toBe("4 lines"), { timeout: 8000 });
    const pretty = Array.from(root.querySelectorAll(".cw-code")).map((l) => l.textContent);
    expect(pretty).toContain("const low = parts.filter((p) => p.qty < 20);");
    expect(pretty).toContain("    { id: 1, qty: 25 },");
  });

  it("hides Run for languages the playground can't run and without a host", async () => {
    const root = el('<pre><code class="language-json">{"a": 1}</code></pre><pre><code class="language-python">print(1)</code></pre>');
    enhanceCodeBlocks(root);
    const [json, py] = Array.from(root.querySelectorAll<HTMLButtonElement>(".cw-run"));
    expect(json.hidden).toBe(true);
    expect(py.hidden).toBe(true); // no CodePlaygroundHost mounted
  });

  it("leaves playground blocks to the playground (no code window inside them)", () => {
    const spy = vi.fn();
    unsubscribe = subscribePlayground(spy);
    const root = el(`<div data-type="code-playground" data-playground='${JSON.stringify({ language: "python", code: "print(1)" })}'><pre><code>print(1)</code></pre></div>`);
    enhanceCodeBlocks(root);
    expect(root.querySelector("figure.code-window")).toBeNull();
    expect(root.querySelector('[data-type="code-playground"]')!.getAttribute("data-hydrated")).toBe("1");
  });
});

describe("store", () => {
  it("tells subscribers about open and close", () => {
    const seen: unknown[] = [];
    const off = subscribePlayground((r) => seen.push(r));
    openPlayground({ block: DEFAULT_BLOCK });
    closePlayground();
    off();
    expect(seen).toEqual([null, { block: DEFAULT_BLOCK }, null]);
  });
});
