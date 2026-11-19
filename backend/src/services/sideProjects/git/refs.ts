/**
 * Task references in Git (GIT_AUTOMATED_REPORTING_ANALYSIS.md §5).
 *
 * A project has a task key (2-5 capital letters, e.g. FOP); a task is KEY-<task_id> (FOP-27).
 * Branch names, PR titles/bodies and commit messages are scanned for references; inside a
 * connected repository a bare #27 is accepted too, but only when 27 is a task of the project
 * (so GitHub issue numbers that aren't tasks are ignored).
 *
 * Commit commands (Jira smart-commit style, optional):
 *   #time 1h30m | #time 45m | #time 2h   hours hint for that commit's task
 *   #blocked <reason>                    move the task to Blocked with the reason
 *   #review                              move the task to In review
 *   #done                                move the task to Done
 */

export const TASK_KEY_RE = /^[A-Z]{2,5}$/;

/** Suggested key from a title: initials of up to four words, else the first letters. */
export function suggestKey(title: string): string {
  const words = title.normalize("NFD").replace(/[^A-Za-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !/^(the|and|for|of|a|an|to|in|on|with)$/i.test(w));
  let key = words.slice(0, 4).map((w) => w[0]).join("").toUpperCase();
  if (key.length < 2) key = (words[0] || "PRJ").slice(0, 3).toUpperCase();
  return key.slice(0, 5).padEnd(2, "X");
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Task ids referenced in a text: KEY-123 (any case), and #123 when allowBare. */
export function findRefs(text: string | null | undefined, key: string | null, opts: { allowBare?: boolean } = {}): number[] {
  if (!text) return [];
  const out = new Set<number>();
  if (key) {
    const re = new RegExp(`(?:^|[^A-Za-z0-9])${esc(key)}-(\\d{1,10})(?![0-9])`, "gi");
    for (const m of text.matchAll(re)) out.add(Number(m[1]));
  }
  if (opts.allowBare) for (const m of text.matchAll(/(?:^|[\s(\[/])#(\d{1,10})(?![0-9])/g)) out.add(Number(m[1]));
  return [...out];
}

/** Closing words in a PR body/title: "Closes FOP-27", "fixes #27". */
export function closingRefs(text: string | null | undefined, key: string | null): number[] {
  if (!text) return [];
  const out = new Set<number>();
  const target = key ? `(?:${esc(key)}-|#)` : "#";
  const re = new RegExp(`\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s*:?\\s+${target}(\\d{1,10})\\b`, "gi");
  for (const m of text.matchAll(re)) out.add(Number(m[1]));
  return [...out];
}

export interface CommitCommands {
  timeHours: number | null;
  blocked: string | null;
  review: boolean;
  done: boolean;
}

export function parseCommands(message: string): CommitCommands {
  const out: CommitCommands = { timeHours: null, blocked: null, review: false, done: false };
  const t = message.match(/#time\s+((?:\d+(?:\.\d+)?\s*[hm]\s*)+)/i);
  if (t) {
    let h = 0;
    for (const m of t[1].matchAll(/(\d+(?:\.\d+)?)\s*([hm])/gi)) h += m[2].toLowerCase() === "h" ? Number(m[1]) : Number(m[1]) / 60;
    if (h > 0 && h <= 24) out.timeHours = Math.round(h * 2) / 2 || 0.5;
  }
  const b = message.match(/#blocked\b[ \t:]*([^\n#]*)/i);
  if (b) out.blocked = (b[1] || "").trim().slice(0, 300) || "Blocked (from a commit)";
  out.review = /#review\b/i.test(message);
  out.done = /#done\b/i.test(message);
  return out;
}

/** "feat/FOP-27-build-the-shop-order-form" */
export function branchName(key: string | null, taskId: number, title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `feat/${key ? `${key}-${taskId}` : `task-${taskId}`}${slug ? `-${slug}` : ""}`;
}

/** First line of a commit message, without the task key and conventional prefix. */
export function cleanTitle(message: string, key: string | null): string {
  let t = (message.split("\n")[0] || "").trim();
  if (key) t = t.replace(new RegExp(`\\b${esc(key)}-\\d+\\b[:\\s-]*`, "gi"), "");
  t = t.replace(/#(time\s+[\dhm.\s]+|blocked[^#]*|review|done)\b/gi, "");
  t = t.replace(/^(feat|fix|chore|docs|refactor|test|style|perf|build|ci)(\([^)]*\))?!?:\s*/i, "");
  t = t.replace(/\s+/g, " ").trim().replace(/[.;,]+$/, "");
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

/** Co-authored-by trailers: emails. */
export function coAuthors(message: string): string[] {
  return [...message.matchAll(/^co-authored-by:.*<([^>]+)>/gim)].map((m) => m[1].trim().toLowerCase());
}

/** "12345+login@users.noreply.github.com" -> 12345 */
export function noreplyId(email: string | null | undefined): number | null {
  const m = String(email ?? "").match(/^(\d+)\+[^@]+@users\.noreply\.github\.com$/i);
  return m ? Number(m[1]) : null;
}

export const isBot = (login: string | null | undefined, email?: string | null) =>
  /\[bot\]$/i.test(login ?? "") || /dependabot|github-actions|renovate/i.test(login ?? "") || /\[bot\]@users\.noreply\.github\.com$/i.test(email ?? "");

const DEFAULT_IGNORED = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "composer.lock", "Cargo.lock", "dist/", "build/", "vendor/", "node_modules/", ".min.js"];

/** Files that don't count as work (lockfiles, generated or vendored code). */
export function isIgnoredPath(path: string, extra: string[] = []): boolean {
  return [...DEFAULT_IGNORED, ...extra].some((p) => (p.endsWith("/") ? path.startsWith(p) || path.includes(`/${p}`) : path === p || path.endsWith(`/${p}`) || (p.startsWith(".") && path.endsWith(p))));
}
