import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";

// pdf.js's worker (pdfjs-dist/build/pdf.worker.min.mjs, referenced through
// `new URL(..., import.meta.url)` in PdfPagesViewer) is emitted by Vite as a
// standalone .mjs asset with a fixed name that assetFileNames can't change.
// The production nginx has no MIME mapping for .mjs and serves it as
// application/octet-stream, which the browser refuses to run as a module
// worker -- every PDF lesson note then fails with "This PDF could not be
// displayed". Emit such assets as .js (which nginx already serves as
// JavaScript) and patch every chunk that references the old name.
const mjsAssetsAsJs = (): Plugin => ({
  name: "mjs-assets-as-js",
  enforce: "post",
  generateBundle(_options, bundle) {
    for (const [fileName, output] of Object.entries(bundle)) {
      if (output.type !== "asset" || !fileName.endsWith(".mjs")) continue;
      const renamed = fileName.replace(/\.mjs$/, ".js");
      output.fileName = renamed;
      bundle[renamed] = output;
      delete bundle[fileName];
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === "chunk" && chunk.code.includes(fileName)) {
          chunk.code = chunk.code.split(fileName).join(renamed);
        }
      }
    }
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), mjsAssetsAsJs()],
  base: "/",
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
