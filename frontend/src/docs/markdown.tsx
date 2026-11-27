import React from "react";
import { Info, Lightbulb, TriangleAlert } from "lucide-react";

/**
 * The small markdown dialect the staff guides are written in (docs/README.md):
 * frontmatter (title, summary), `##`/`###` headings, paragraphs, `-` and `1.`
 * lists, pipe tables, callouts (`> **Note:**`, `> **Tip:**`, `> **Important:**`)
 * and inline **bold**, `code` and [links](https://...).
 *
 * Parsed into blocks and rendered as React elements -- no HTML is ever injected,
 * so a guide cannot carry markup or script into the page.
 */

export interface Frontmatter {
  title: string;
  summary: string;
}

export type MdBlock =
  | { kind: "heading"; level: 2 | 3; text: string; id: string }
  | { kind: "p"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "callout"; tone: "note" | "tip" | "important"; text: string };

export interface ParsedGuide extends Frontmatter {
  blocks: MdBlock[];
  /** Body without markup, for search. */
  plain: string;
}

export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[`*]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";

const stripInline = (text: string): string =>
  text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*]/g, "");

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

const isTableRule = (line: string): boolean => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;
const CALLOUT = /^\*\*(Note|Tip|Important):?\*\*:?\s*(.*)$/i;

export function parseGuide(source: string): ParsedGuide {
  const text = source.replace(/\r\n/g, "\n");
  let title = "";
  let summary = "";
  let body = text;
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (fm) {
    body = text.slice(fm[0].length);
    for (const line of fm[1].split("\n")) {
      const m = /^(\w+):\s*(.*)$/.exec(line);
      if (!m) continue;
      const value = m[2].trim().replace(/^["'](.*)["']$/, "$1");
      if (m[1] === "title") title = value;
      if (m[1] === "summary") summary = value;
    }
  }

  const lines = body.split("\n");
  const blocks: MdBlock[] = [];
  const used = new Map<string, number>();
  const uniqueId = (t: string) => {
    const base = slugify(t);
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    return n ? `${base}-${n + 1}` : base;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      // A stray `#` is treated as a section heading: the page title comes from the frontmatter.
      const level = h[1].length >= 3 ? 3 : 2;
      const t = h[2].trim();
      blocks.push({ kind: "heading", level, text: t, id: uniqueId(t) });
      i++;
      continue;
    }
    if (line.trim().startsWith("|") && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      blocks.push({ kind: "table", head, rows });
      continue;
    }
    if (line.trimStart().startsWith(">")) {
      const parts: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith(">")) parts.push(lines[i++].replace(/^\s*>\s?/, ""));
      const joined = parts.join(" ").trim();
      const c = CALLOUT.exec(joined);
      blocks.push({ kind: "callout", tone: c ? (c[1].toLowerCase() as "note" | "tip" | "important") : "note", text: c ? c[2] : joined });
      continue;
    }
    if (BULLET.test(line) || NUMBER.test(line)) {
      const ordered = NUMBER.test(line);
      const re = ordered ? NUMBER : BULLET;
      const items: string[] = [];
      while (i < lines.length) {
        const m = re.exec(lines[i]);
        if (m) {
          items.push(m[1].trim());
          i++;
        } else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) {
          // A wrapped line of the same item.
          items[items.length - 1] += ` ${lines[i].trim().replace(/^[-*]\s+/, "")}`;
          i++;
        } else break;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !lines[i].trimStart().startsWith(">") &&
      !BULLET.test(lines[i]) &&
      !NUMBER.test(lines[i]) &&
      !(lines[i].trim().startsWith("|") && i + 1 < lines.length && isTableRule(lines[i + 1]))
    ) {
      para.push(lines[i++].trim());
    }
    blocks.push({ kind: "p", text: para.join(" ") });
  }

  const plain = blocks
    .map((b) => {
      if (b.kind === "heading" || b.kind === "p" || b.kind === "callout") return stripInline(b.text);
      if (b.kind === "list") return b.items.map(stripInline).join(" ");
      return [...b.head, ...b.rows.flat()].map(stripInline).join(" ");
    })
    .join(" ");

  return { title, summary, blocks, plain };
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;

/** Only web, mail and in-app links; anything else is shown as plain text. */
const safeHref = (href: string): string | null => (/^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href) ? href : null);

export const Inline: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(INLINE).map((part, i) => {
      if (!part) return null;
      if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={i} className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[0.85em] text-gray-800 dark:bg-gray-800/70 dark:text-gray-200">
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-gray-900 dark:text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
      if (link) {
        const href = safeHref(link[2]);
        if (!href) return <React.Fragment key={i}>{link[1]}</React.Fragment>;
        const external = /^https?:/i.test(href);
        return (
          <a
            key={i}
            href={href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
          >
            <Inline text={link[1]} />
          </a>
        );
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    })}
  </>
);

const CALLOUT_LOOK = {
  note: { icon: Info, label: "Note", box: "bg-blue-50 text-blue-900 dark:bg-blue-500/10 dark:text-blue-100", tint: "text-blue-600 dark:text-blue-300" },
  tip: { icon: Lightbulb, label: "Tip", box: "bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100", tint: "text-emerald-600 dark:text-emerald-300" },
  important: { icon: TriangleAlert, label: "Important", box: "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100", tint: "text-amber-600 dark:text-amber-300" },
} as const;

const prose = "text-[15px] leading-7 text-gray-700 dark:text-gray-300";

export const GuideBody: React.FC<{ blocks: MdBlock[] }> = ({ blocks }) => (
  <div className="space-y-4">
    {blocks.map((b, i) => {
      switch (b.kind) {
        case "heading":
          return b.level === 2 ? (
            // The page has its h1 and the guide title is an h2, so `##` is an h3 on screen.
            <h3 key={i} id={b.id} className="scroll-mt-24 pt-4 text-xl font-semibold tracking-tight text-gray-900 dark:text-white">
              <Inline text={b.text} />
            </h3>
          ) : (
            <h4 key={i} id={b.id} className="scroll-mt-24 pt-2 text-base font-semibold text-gray-900 dark:text-white">
              <Inline text={b.text} />
            </h4>
          );
        case "p":
          return (
            <p key={i} className={prose}>
              <Inline text={b.text} />
            </p>
          );
        case "list":
          return b.ordered ? (
            <ol key={i} className="space-y-2.5">
              {b.items.map((it, j) => (
                <li key={j} className={`flex gap-3 ${prose}`}>
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                    {j + 1}
                  </span>
                  <span className="min-w-0">
                    <Inline text={it} />
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <ul key={i} className={`list-disc space-y-1.5 pl-5 marker:text-gray-400 ${prose}`}>
              {b.items.map((it, j) => (
                <li key={j}>
                  <Inline text={it} />
                </li>
              ))}
            </ul>
          );
        case "table":
          return (
            <div key={i} className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700/40">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
                  <tr>
                    {b.head.map((h, j) => (
                      <th key={j} scope="col" className="px-4 py-2.5">
                        <Inline text={h} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/30">
                  {b.rows.map((r, j) => (
                    <tr key={j}>
                      {r.map((c, k) => (
                        <td key={k} className={`px-4 py-2.5 align-top ${k === 0 ? "text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-300"}`}>
                          <Inline text={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        case "callout": {
          const look = CALLOUT_LOOK[b.tone];
          return (
            <aside key={i} className={`flex gap-3 rounded-2xl px-4 py-3.5 text-sm leading-6 ${look.box}`}>
              <look.icon className={`mt-0.5 h-4 w-4 shrink-0 ${look.tint}`} aria-hidden />
              <p>
                <span className="font-semibold">{look.label}: </span>
                <Inline text={b.text} />
              </p>
            </aside>
          );
        }
      }
    })}
  </div>
);
