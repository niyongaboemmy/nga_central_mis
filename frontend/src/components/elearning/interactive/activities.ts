/**
 * Lesson Studio activities (ELEARNING_AI_LESSON_STUDIO_IMPLEMENTATION_PLAN.md §11): fill in the
 * blanks, put the steps in order, match the pairs. They live in note HTML as
 * `<div data-type="activity" data-activity="{json}">…static fallback…</div>` — the same idea as
 * the inline check — and are made interactive here with plain DOM, so the reader, the course
 * item view and old clients (which just show the fallback) all work. Phone first: big targets,
 * no drag-and-drop (tap up/down instead), feedback announced politely to screen readers.
 */

export type ActivityData =
  | { kind: "fill_blank"; text: string; explanation?: string }
  | { kind: "order_steps"; prompt: string; steps: string[] }
  | { kind: "match_pairs"; prompt: string; pairs: { left: string; right: string }[] };

export function parseActivity(raw: unknown): ActivityData | null {
  try {
    const d = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!d || typeof d !== "object") return null;
    const a = d as any;
    if (a.kind === "fill_blank" && typeof a.text === "string" && /\[\[[^\]]+\]\]/.test(a.text)) {
      return { kind: "fill_blank", text: a.text.slice(0, 600), explanation: typeof a.explanation === "string" ? a.explanation.slice(0, 400) : "" };
    }
    if (a.kind === "order_steps" && Array.isArray(a.steps) && a.steps.length >= 3) {
      return { kind: "order_steps", prompt: String(a.prompt || "Put the steps in the right order").slice(0, 200), steps: a.steps.map(String).slice(0, 7) };
    }
    if (a.kind === "match_pairs" && Array.isArray(a.pairs) && a.pairs.length >= 3) {
      const pairs = a.pairs
        .map((p: any) => ({ left: String(p?.left ?? ""), right: String(p?.right ?? "") }))
        .filter((p: { left: string; right: string }) => p.left && p.right)
        .slice(0, 6);
      return pairs.length >= 3 ? { kind: "match_pairs", prompt: String(a.prompt || "Match each term to its meaning").slice(0, 200), pairs } : null;
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** The blanks of a fill-in sentence, in order (`[[word]]` → "word"). */
export const blanksOf = (text: string): string[] => [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim());

/** Answers are forgiving: case, surrounding spaces and a trailing full stop don't matter. */
export const sameAnswer = (given: string, expected: string): boolean => {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[.\s]+$/g, "").replace(/\s+/g, " ");
  return norm(given) === norm(expected) && norm(given).length > 0;
};

/** A deterministic shuffle that never returns the original order (when there are ≥ 2 items). */
export function shuffledOrder(n: number, seed: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  let s = seed || 1;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  if (n > 1 && idx.every((v, i) => v === i)) idx.push(idx.shift()!);
  return idx;
}

const seedOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 100000, 7);

const BTN =
  "min-h-[44px] px-4 rounded-xl text-sm font-medium focus:outline-none focus-visible:shadow-glow disabled:opacity-50";
const PRIMARY = `${BTN} bg-brand-500 text-white hover:bg-brand-600`;
const GHOST = `${BTN} border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function feedbackLine() {
  const p = el("p", "mt-3 text-sm min-h-[1.25rem]");
  p.setAttribute("aria-live", "polite");
  return p;
}

function setFeedback(p: HTMLElement, ok: boolean, text: string) {
  p.className = `mt-3 text-sm min-h-[1.25rem] ${ok ? "text-success-700 dark:text-success-500" : "text-warning-700 dark:text-warning-500"}`;
  p.textContent = text;
}

function header(label: string, prompt?: string) {
  const wrap = document.createDocumentFragment();
  wrap.append(el("p", "text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400", label));
  if (prompt) wrap.append(el("p", "mt-1 text-base font-medium text-gray-900 dark:text-white", prompt));
  return wrap;
}

function renderFill(block: HTMLElement, data: Extract<ActivityData, { kind: "fill_blank" }>, onAnswer?: (ok: boolean) => void) {
  const answers = blanksOf(data.text);
  const sentence = el("p", "mt-2 text-base leading-9 text-gray-900 dark:text-white");
  const inputs: HTMLInputElement[] = [];
  data.text.split(/\[\[[^\]]+\]\]/).forEach((part, i) => {
    sentence.append(document.createTextNode(part));
    if (i < answers.length) {
      const input = el("input", "mx-1 inline-block w-32 max-w-[40vw] min-h-[36px] px-2 rounded-lg border-2 border-dashed border-brand-200 dark:border-brand-700 bg-white dark:bg-white/[0.05] text-base text-center");
      input.setAttribute("aria-label", `Blank ${i + 1}`);
      input.autocomplete = "off";
      inputs.push(input);
      sentence.append(input);
    }
  });
  const fb = feedbackLine();
  const check = el("button", PRIMARY, "Check");
  check.type = "button";
  const reveal = el("button", `${GHOST} ml-2`, "Show answers");
  reveal.type = "button";
  check.addEventListener("click", () => {
    let right = 0;
    inputs.forEach((input, i) => {
      const ok = sameAnswer(input.value, answers[i]);
      if (ok) right += 1;
      input.classList.toggle("!border-success-500", ok);
      input.classList.toggle("!border-warning-500", !ok);
      input.setAttribute("aria-invalid", ok ? "false" : "true");
    });
    const all = right === answers.length;
    onAnswer?.(all);
    setFeedback(fb, all, all ? `Yes — all correct.${data.explanation ? ` ${data.explanation}` : ""}` : `${right} of ${answers.length} right. Try the others again.`);
  });
  reveal.addEventListener("click", () => {
    inputs.forEach((input, i) => (input.value = answers[i]));
    setFeedback(fb, true, data.explanation || "Here are the answers.");
  });
  const actions = el("div", "mt-3 flex flex-wrap gap-2");
  actions.append(check, reveal);
  block.append(header("Fill in the blanks"), sentence, actions, fb);
}

function renderOrder(block: HTMLElement, data: Extract<ActivityData, { kind: "order_steps" }>, onAnswer?: (ok: boolean) => void) {
  let order = shuffledOrder(data.steps.length, seedOf(data.steps.join("|")));
  const list = el("ol", "mt-3 space-y-2");
  const fb = feedbackLine();
  const draw = (focusIndex?: number) => {
    list.innerHTML = "";
    order.forEach((stepIndex, pos) => {
      const li = el("li", "flex items-center gap-2 min-h-[48px] px-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03]");
      li.append(el("span", "w-6 h-6 rounded-md el-chip text-[11px] font-semibold flex items-center justify-center flex-shrink-0 tabular-nums", String(pos + 1)));
      li.append(el("span", "flex-1 text-sm text-gray-800 dark:text-gray-100", data.steps[stepIndex]));
      const up = el("button", "w-9 h-9 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30", "↑");
      const down = el("button", "w-9 h-9 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30", "↓");
      up.type = down.type = "button";
      up.setAttribute("aria-label", `Move "${data.steps[stepIndex]}" up`);
      down.setAttribute("aria-label", `Move "${data.steps[stepIndex]}" down`);
      up.disabled = pos === 0;
      down.disabled = pos === order.length - 1;
      const move = (to: number) => {
        const next = [...order];
        [next[pos], next[to]] = [next[to], next[pos]];
        order = next;
        fb.textContent = "";
        draw(to);
      };
      up.addEventListener("click", () => move(pos - 1));
      down.addEventListener("click", () => move(pos + 1));
      li.append(up, down);
      list.append(li);
      if (focusIndex === pos) (pos === 0 ? down : up).focus();
    });
  };
  draw();
  const check = el("button", `${PRIMARY} mt-3`, "Check order");
  check.type = "button";
  check.addEventListener("click", () => {
    const placed = order.filter((stepIndex, pos) => stepIndex === pos).length;
    const ok = placed === order.length;
    onAnswer?.(ok);
    setFeedback(fb, ok, ok ? "Yes — that's the right order." : `${placed} of ${order.length} steps are in the right place. Keep going.`);
  });
  block.append(header("Put in order", data.prompt), list, check, fb);
}

function renderMatch(block: HTMLElement, data: Extract<ActivityData, { kind: "match_pairs" }>, onAnswer?: (ok: boolean) => void) {
  const rightOrder = shuffledOrder(data.pairs.length, seedOf(data.prompt + data.pairs.length));
  const rows = el("div", "mt-3 space-y-2");
  const selects: HTMLSelectElement[] = [];
  data.pairs.forEach((pair, i) => {
    const row = el("label", "flex flex-col sm:flex-row sm:items-center gap-2 p-2 rounded-xl border border-gray-200 dark:border-white/10");
    row.append(el("span", "sm:w-1/3 text-sm font-medium text-gray-900 dark:text-white", pair.left));
    const select = el("select", "flex-1 min-h-[44px] px-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#111] text-sm text-gray-800 dark:text-gray-100");
    select.setAttribute("aria-label", `Meaning of ${pair.left}`);
    select.append(new Option("Choose…", ""));
    rightOrder.forEach((j) => select.append(new Option(data.pairs[j].right, String(j))));
    selects.push(select);
    row.append(select);
    rows.append(row);
    void i;
  });
  const fb = feedbackLine();
  const check = el("button", `${PRIMARY} mt-3`, "Check matches");
  check.type = "button";
  check.addEventListener("click", () => {
    let right = 0;
    selects.forEach((s, i) => {
      const ok = s.value === String(i);
      if (ok) right += 1;
      s.classList.toggle("!border-success-500", ok);
      s.classList.toggle("!border-warning-500", !ok && s.value !== "");
    });
    const all = right === selects.length;
    onAnswer?.(all);
    setFeedback(fb, all, all ? "All matched — well done." : `${right} of ${selects.length} matched. Try the others again.`);
  });
  block.append(header("Match the pairs", data.prompt), rows, check, fb);
}

/** Makes every `<div data-type="activity">` under `root` interactive. Idempotent. */
export function hydrateActivities(root: HTMLElement | null, onAnswer?: (correct: boolean) => void): void {
  if (!root) return;
  root.querySelectorAll<HTMLElement>('[data-type="activity"]:not([data-hydrated])').forEach((block) => {
    const data = parseActivity(block.getAttribute("data-activity"));
    block.setAttribute("data-hydrated", "1");
    if (!data) return; // keep the static fallback
    block.innerHTML = "";
    block.className = "note-activity my-4 el-card p-4 shadow-soft not-prose";
    if (data.kind === "fill_blank") renderFill(block, data, onAnswer);
    else if (data.kind === "order_steps") renderOrder(block, data, onAnswer);
    else renderMatch(block, data, onAnswer);
  });
}
