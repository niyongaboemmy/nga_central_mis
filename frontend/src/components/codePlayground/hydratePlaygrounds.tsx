import { Suspense, lazy } from "react";
import { createRoot, type Root } from "react-dom/client";
import { parseBlock, type PlaygroundBlock } from "./playgroundData";
import { openPlayground } from "./store";

/**
 * Brings Code Playground blocks in saved lesson HTML to life — the reader injects the
 * HTML with dangerouslySetInnerHTML, so each `<div data-type="code-playground">` gets
 * its own small React root (the static <pre> inside stays as the no-JS / print copy).
 * Roots whose block left the page are unmounted on the next call.
 */

const InlineWorkbench = lazy(() => import("./PlaygroundWorkbench"));

const mounted = new Map<HTMLElement, Root>();

const expand = (block: PlaygroundBlock) => openPlayground({ block, source: "From the lesson" });

export function hydratePlaygrounds(root: HTMLElement | null): void {
  for (const [el, r] of mounted) {
    if (!el.isConnected) {
      mounted.delete(el);
      // Unmounting during React's own render is refused: do it right after.
      queueMicrotask(() => r.unmount());
    }
  }
  if (!root) return;
  root.querySelectorAll<HTMLElement>('div[data-type="code-playground"]:not([data-hydrated])').forEach((el) => {
    const block = parseBlock(el.getAttribute("data-playground"));
    el.setAttribute("data-hydrated", "1");
    el.setAttribute("data-code-chrome", "");
    const fallback = el.innerHTML;
    el.innerHTML = "";
    const r = createRoot(el);
    mounted.set(el, r);
    r.render(
      <Suspense fallback={<div className="not-prose my-5" dangerouslySetInnerHTML={{ __html: fallback }} />}>
        <InlineWorkbench block={block} variant="inline" onExpand={expand} />
      </Suspense>,
    );
  });
}
