import { parseCheck } from "./nodes";
import { copy } from "../copy";

/**
 * Turns the static `<div data-type="inline-check">` blocks in rendered note HTML into live
 * checks — instant, kind feedback; wrong → gentle shake + retry; unlimited (UX plan §4.3).
 * Plain DOM so it works on HTML we set via dangerouslySetInnerHTML (reader, page items, PDF export
 * simply shows the static fallback). `<details data-type="reveal">` needs nothing: it's native.
 * Idempotent — safe to call after every re-render of the host.
 */
export function hydrateInlineChecks(root: HTMLElement | null, onAnswer?: (correct: boolean) => void): void {
  if (!root) return;
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  root.querySelectorAll<HTMLElement>('[data-type="inline-check"]:not([data-hydrated])').forEach((block) => {
    const data = parseCheck(block.getAttribute("data-check"));
    block.setAttribute("data-hydrated", "1");
    block.innerHTML = "";
    block.className = "note-inline-check my-4 el-card p-4 shadow-soft not-prose";

    const head = document.createElement("p");
    head.className = "text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400";
    head.textContent = copy.check.title;
    const prompt = document.createElement("p");
    prompt.className = "mt-1 text-base font-medium text-gray-900 dark:text-white";
    prompt.textContent = data.prompt;
    const list = document.createElement("div");
    list.className = "mt-3 space-y-2";
    list.setAttribute("role", "radiogroup");
    const feedback = document.createElement("p");
    feedback.className = "mt-3 text-sm min-h-[1.25rem]";
    feedback.setAttribute("aria-live", "polite");

    let answered = false;
    data.options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", "false");
      btn.className =
        "w-full flex items-center gap-3 text-left min-h-[44px] px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-800 dark:text-gray-100 hover:border-brand-200 focus:outline-none focus-visible:shadow-glow";
      const badge = document.createElement("span");
      badge.className = "w-6 h-6 rounded-md bg-gray-100 dark:bg-gray-800 text-[11px] font-semibold flex items-center justify-center flex-shrink-0 tabular-nums";
      badge.textContent = String(i + 1);
      const label = document.createElement("span");
      label.textContent = opt;
      btn.append(badge, label);
      btn.addEventListener("click", () => {
        if (answered) return;
        list.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", "false"));
        btn.setAttribute("aria-checked", "true");
        const correct = i === data.correct;
        onAnswer?.(correct);
        if (correct) {
          answered = true;
          btn.className += " !border-success-500 !bg-success-100 !text-success-700";
          badge.textContent = "✓";
          feedback.className = "mt-3 text-sm text-success-700 dark:text-success-500";
          feedback.textContent = data.explanation ? copy.check.correctWhy(data.explanation) : copy.check.correct;
          list.querySelectorAll("button").forEach((b) => (b as HTMLButtonElement).disabled === false && b !== btn && b.classList.add("opacity-60"));
        } else {
          btn.className += " !border-warning-500 !bg-warning-100 !text-warning-700";
          badge.textContent = "✕";
          feedback.className = "mt-3 text-sm text-warning-700 dark:text-warning-500";
          feedback.textContent = data.explanation ? copy.check.wrongHint(data.explanation) : copy.check.wrong;
          if (!reduced && typeof list.animate === "function") {
            list.animate([{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(0)" }], { duration: 240 });
          }
          setTimeout(() => {
            btn.className = btn.className.replace(" !border-warning-500 !bg-warning-100 !text-warning-700", "");
            badge.textContent = String(i + 1);
          }, 1200);
        }
      });
      list.appendChild(btn);
    });
    block.append(head, prompt, list, feedback);
  });

  // Reveal blocks: make sure the summary is keyboard-focusable and styled without needing CSS files.
  root.querySelectorAll<HTMLElement>('details[data-type="reveal"]:not([data-hydrated])').forEach((d) => {
    d.setAttribute("data-hydrated", "1");
    d.className = "note-reveal my-3 rounded-xl border border-brand-200 dark:border-brand-700 bg-brand-50/50 dark:bg-brand-700/10 px-3 py-2 not-prose";
    const s = d.querySelector("summary");
    if (s) s.className = "cursor-pointer text-sm font-medium text-brand-700 dark:text-brand-200 select-none min-h-[36px] flex items-center";
    const body = d.querySelector(":scope > div");
    if (body) body.className = "prose prose-sm dark:prose-invert max-w-none pt-2";
  });
}
