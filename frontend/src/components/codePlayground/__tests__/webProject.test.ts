import { describe, expect, it } from "vitest";
// @ts-expect-error jsdom ships no type declarations here (the test only needs JSDOM and its window).
import { JSDOM } from "jsdom";
import { buildPageDocument, buildScriptDocument, composePage, looksLikeHtml, phpFields, phpRequestInput, resolvePath } from "../browserRun";
import { exampleProject, editorLanguageFor, newFileContent, pathProblem, projectProblem, startPage, suggestName } from "../project";
import { LANGUAGES, languageById } from "../languages";
import { parseBlock, serializeBlock, DEFAULT_BLOCK } from "../playgroundData";

describe("resolvePath", () => {
  it("resolves like a browser from the page's folder", () => {
    expect(resolvePath("index.html", "style.css")).toEqual({ path: "style.css", query: "" });
    expect(resolvePath("pages/a.html", "../css/site.css")).toEqual({ path: "css/site.css", query: "" });
    expect(resolvePath("pages/a.html", "b.php?id=3#top")).toEqual({ path: "pages/b.php", query: "id=3" });
    expect(resolvePath("pages/a.html", "/index.html")).toEqual({ path: "index.html", query: "" });
  });
});

describe("composePage", () => {
  const files = [
    { path: "style.css", content: "h1{color:red}" },
    { path: "js/app.js", content: "console.log('app')" },
    { path: "js/main.js", content: "import './util.js'" },
  ];
  it("inlines linked CSS and classic scripts, collects module scripts", () => {
    const page = composePage(
      '<head><link rel="stylesheet" href="style.css"><link rel="icon" href="x.ico"></head><body><script src="js/app.js"></script><script type="module" src="js/main.js"></script><script type="module">import "./js/app.js";</script></body>',
      "index.html",
      files,
    );
    expect(page.html).toContain('<style data-file="style.css">h1{color:red}</style>');
    expect(page.html).toContain('<link rel="icon" href="x.ico">');
    expect(page.html).toContain(`<script data-file="js/app.js">console.log('app')</script>`);
    expect(page.modules).toEqual(["js/main.js", "_nga_inline_1.js"]);
    expect(page.extraFiles[0]).toEqual({ path: "_nga_inline_1.js", content: 'import "./js/app.js";' });
    expect(page.missing).toEqual([]);
  });
  it("reports files a page links to that don't exist", () => {
    expect(composePage('<link rel="stylesheet" href="nope.css"><script src="gone.js"></script>', "index.html", files).missing).toEqual(["nope.css", "gone.js"]);
  });
  it("leaves CDN links alone", () => {
    const html = '<link rel="stylesheet" href="https://cdn.example/x.css"><script src="https://cdn.example/x.js"></script>';
    expect(composePage(html, "index.html", files).html).toBe(html);
  });
  it("hands links and forms to the playground and loads modules", () => {
    const { doc } = buildPageDocument('<script type="module" src="js/main.js"></script>', "index.html", [...files, { path: "js/util.js", content: "" }], "r1", "");
    expect(doc).toContain('var PAGE="index.html"');
    expect(doc).toContain('"submit"');
    expect(doc).toContain("window.__ngaModules()");
    expect(doc).toContain('"js/util.js"');
  });
});

describe("forms and links in the preview", () => {
  /** Runs the preview document and returns what the bridge asked the playground to open. */
  const preview = (html: string) => {
    const { doc } = buildPageDocument(html, "index.html", [{ path: "index.html", content: html }, { path: "about.html", content: "<p>About</p>" }], "r1", "");
    const w: Window = new JSDOM(doc, { runScripts: "dangerously" }).window;
    const navs: unknown[] = [];
    w.postMessage = ((m: { nav?: unknown }) => m?.nav && navs.push(m.nav)) as Window["postMessage"];
    return { w, d: w.document, navs };
  };

  it("leaves a form the page handles itself alone (no reload, its state stays)", () => {
    const { d, navs } = preview('<form id="f"><input name="who" value="Aline"><button>Go</button></form><p id="out"></p><script>document.getElementById("f").addEventListener("submit", (e) => { e.preventDefault(); document.getElementById("out").textContent = "Hi"; });</script>');
    d.querySelector("button")!.click();
    expect(d.getElementById("out")!.textContent).toBe("Hi");
    expect(navs).toEqual([]);
  });

  it("leaves onsubmit=\"return false\" and links with their own handler alone", () => {
    const { d, navs } = preview('<form onsubmit="return false"><button>Go</button></form><a href="about.html" id="a">About</a><script>document.getElementById("a").onclick = (e) => e.preventDefault();</script>');
    d.querySelector("button")!.click();
    d.getElementById("a")!.click();
    expect(navs).toEqual([]);
  });

  it("still opens the project's pages for plain forms and links", () => {
    const { d, navs } = preview('<form action="about.html" method="post"><input name="who" value="Aline"><button>Go</button></form><a href="about.html" id="a">About</a>');
    d.querySelector("button")!.click();
    d.getElementById("a")!.click();
    expect(navs).toEqual([
      { href: "about.html", method: "POST", fields: [["who", "Aline"]] },
      { href: "about.html", method: "GET", fields: [] },
    ]);
  });
});

describe("browser JavaScript", () => {
  it("runs a classic script unless the main file imports or exports", () => {
    expect(buildScriptDocument({ entry: "a.js", files: [{ path: "a.js", content: "x = 1; console.log(x)" }] }, "r", "")).not.toContain("__ngaModules");
    const mod = buildScriptDocument({ entry: "a.js", files: [{ path: "a.js", content: 'import { t } from "./b.js";\nconsole.log(t)' }, { path: "b.js", content: "export const t = 1" }] }, "r", "");
    expect(mod).toContain("__ngaModules");
    expect(mod).toContain('"b.js"');
  });
});

describe("PHP requests", () => {
  it("builds $_GET/$_POST like PHP, including arrays", () => {
    expect(phpFields([["name", "Aline"], ["tags[]", "a"], ["tags[]", "b"], ["car[make]", "Toyota"]])).toEqual({ name: "Aline", tags: { 0: "a", 1: "b" }, car: { make: "Toyota" } });
    expect(JSON.parse(phpRequestInput("greet.php", "POST", "lang=rw", [["name", "Aline"]]))).toEqual({ script: "greet.php", method: "POST", get: { lang: "rw" }, post: { name: "Aline" } });
    expect(JSON.parse(phpRequestInput("list.php", "GET", "page=2", [["q", "oil filter"]]))).toMatchObject({ get: { page: "2", q: "oil filter" }, post: {} });
  });
  it("recognises a printed page", () => {
    expect(looksLikeHtml("<!doctype html><html></html>")).toBe(true);
    expect(looksLikeHtml("<h1>Hello</h1>")).toBe(true);
    expect(looksLikeHtml("Total: 5\n")).toBe(false);
    expect(looksLikeHtml("if a < b and c > d")).toBe(false);
  });
});

describe("project files", () => {
  it("accepts names a runner can use and refuses the rest", () => {
    const files = [{ path: "main.py", content: "" }];
    expect(pathProblem("helpers.py", files)).toBeNull();
    expect(pathProblem("lib/maths.php", files)).toBeNull();
    expect(pathProblem("main.py", files)).toMatch(/already/);
    expect(pathProblem("../x.py", files)).toBeTruthy();
    expect(pathProblem("/etc/x", files)).toBeTruthy();
    expect(pathProblem("no-extension", files)).toMatch(/extension/);
    expect(pathProblem("my file.py", files)).toBeTruthy();
    expect(pathProblem("_nga_router.php", files)).toMatch(/reserved/);
    expect(projectProblem({ entry: "x.py", files })).toMatch(/main file/);
  });
  it("suggests a new file name in the language's style and fills it sensibly", () => {
    expect(suggestName(languageById("java")!, [{ path: "Main.java", content: "" }])).toBe("Calculator.java");
    expect(suggestName(languageById("python")!, [{ path: "helpers.py", content: "" }])).toBe("helpers2.py");
    expect(newFileContent("Calculator.java")).toContain("public class Calculator");
    expect(newFileContent("lib/maths.h")).toContain("#ifndef MATHS_H");
    expect(newFileContent("Shop-cart.cs")).toContain("class ShopCart");
    expect(editorLanguageFor("about.html", "php")).toBe("html");
    expect(editorLanguageFor("notes.txt", "python")).toBe("");
  });
  it("has a multi-file example for every language that has files to link", () => {
    for (const l of LANGUAGES) {
      const ex = exampleProject(l.id);
      if (l.id === "sql") {
        expect(ex).toBeNull();
        continue;
      }
      expect(ex, l.id).not.toBeNull();
      expect(ex!.files.length, l.id).toBeGreaterThan(1);
      expect(projectProblem(ex!), l.id).toBeNull();
      for (const f of ex!.files) expect(pathProblem(f.path, ex!.files, f.path), `${l.id}: ${f.path}`).toBeNull();
    }
    expect(startPage(exampleProject("css")!)).toBe("index.html");
  });
});

describe("blocks with files", () => {
  it("round-trips the main file's name and the other files", () => {
    const b = { ...DEFAULT_BLOCK, language: "c", code: "int main(){}", entry: "app.c", files: [{ path: "maths.h", content: "int x;" }] };
    const back = parseBlock(serializeBlock(b));
    expect(back).toMatchObject({ entry: "app.c", files: [{ path: "maths.h", content: "int x;" }] });
    // The language's usual name isn't stored.
    expect(JSON.parse(serializeBlock({ ...b, entry: "main.c" })).entry).toBeUndefined();
    // Bad files are dropped.
    expect(parseBlock(JSON.stringify({ language: "python", code: "x", files: [{ path: "../x", content: "" }, { path: "ok.py", content: "1" }] })).files).toEqual([{ path: "ok.py", content: "1" }]);
  });
});
