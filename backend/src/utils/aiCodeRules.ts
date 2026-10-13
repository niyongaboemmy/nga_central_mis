/**
 * How AI-written lesson HTML must show code, so the reader can lay it out, colour it
 * and run it in the Code Playground (frontend/src/components/codePlayground). Models
 * left alone squash code onto one line, break lines with <br>, or split one program
 * across several blocks — students then saw "inventoryconst parts = [ …" as one line.
 */
export const CODE_HTML_RULE =
  'Code: put each program or snippet in ONE <pre><code class="language-LANG"> block (LANG = javascript, typescript, python, java, c, cpp, csharp, php, sql, html, css, bash, go, rust, kotlin, jsx), ' +
  "written exactly as in a code editor: real line breaks (\\n) — never <br> — one statement per line, ending ';' where the language needs it, " +
  "4-space indentation inside every block, and HTML-escaped &lt; &gt; &amp;. Never split one program across several blocks; " +
  "prefer complete examples that run on their own and print their result (console.log / print / System.out.println). Inline names go in <code>.";
