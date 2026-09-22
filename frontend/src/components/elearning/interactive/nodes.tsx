import React, { useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { ChevronDown, HelpCircle, Pencil, Plus, Trash2 } from "lucide-react";

/**
 * Interactive blocks a teacher inserts inside a lesson note (UX plan §4.3): tap-to-reveal and an
 * inline quick check. Both persist as plain HTML that the backend sanitiser allows
 * (`<details data-type="reveal">`, `<div data-type="inline-check" data-check="…">`) and that the
 * student reader hydrates without a Tiptap instance — see ./hydrate.ts.
 */

// ---------------------------------------------------------------- Reveal (tap to show)

const RevealView: React.FC<NodeViewProps> = ({ node, updateAttributes, editor }) => {
  const [open, setOpen] = useState(true);
  const [editingSummary, setEditingSummary] = useState(false);
  const summary = (node.attrs.summary as string) || "Tap to reveal";
  return (
    <NodeViewWrapper className="my-3 rounded-xl border border-brand-200 dark:border-brand-700 bg-brand-50/50 dark:bg-brand-700/10">
      <div contentEditable={false} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-brand-700 dark:text-brand-200 select-none">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? "Collapse" : "Expand"} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-brand-100 dark:hover:bg-brand-700/30">
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        {editingSummary ? (
          <input
            autoFocus
            defaultValue={summary}
            aria-label="Prompt students see before revealing"
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next) updateAttributes({ summary: next.slice(0, 200) });
              setEditingSummary(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditingSummary(false);
            }}
            className="flex-1 bg-transparent outline-none border-b border-brand-500 text-sm"
          />
        ) : (
          <span className="flex-1">{summary}</span>
        )}
        {editor.isEditable && !editingSummary && (
          <button
            type="button"
            onClick={() => setEditingSummary(true)}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-brand-100 dark:hover:bg-brand-700/30"
            aria-label="Edit prompt"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className={`px-3 pb-3 ${open ? "" : "hidden"}`}>
        <NodeViewContent className="prose-sm" />
      </div>
    </NodeViewWrapper>
  );
};

export const Reveal = Node.create({
  name: "reveal",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return { summary: { default: "Tap to reveal" } };
  },
  parseHTML() {
    return [
      {
        tag: 'details[data-type="reveal"]',
        getAttrs: (el) => ({ summary: (el as HTMLElement).querySelector("summary")?.textContent?.trim() || "Tap to reveal" }),
        contentElement: (el) => ((el as HTMLElement).querySelector("div") as HTMLElement) || (el as HTMLElement),
      },
    ];
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["details", mergeAttributes({ "data-type": "reveal", class: "note-reveal" }), ["summary", {}, node.attrs.summary as string], ["div", HTMLAttributes, 0]];
  },
  addNodeView() {
    return ReactNodeViewRenderer(RevealView);
  },
  addCommands() {
    return {
      insertReveal:
        (summary?: string) =>
        ({ commands }: { commands: any }) =>
          commands.insertContent({
            type: this.name,
            attrs: { summary: summary || "Tap to reveal" },
            content: [{ type: "paragraph", content: [{ type: "text", text: "The answer or example goes here." }] }],
          }),
    } as any;
  },
});

// ---------------------------------------------------------------- Inline check

export interface InlineCheckData {
  prompt: string;
  options: string[];
  correct: number;
  explanation: string;
}

const DEFAULT_CHECK: InlineCheckData = { prompt: "Which one is true?", options: ["Option A", "Option B"], correct: 0, explanation: "" };

const parseCheck = (raw: unknown): InlineCheckData => {
  try {
    const d = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!d || typeof d !== "object") return DEFAULT_CHECK;
    const options = Array.isArray((d as any).options) ? (d as any).options.map((o: any) => String(o)).slice(0, 6) : DEFAULT_CHECK.options;
    return {
      prompt: String((d as any).prompt || DEFAULT_CHECK.prompt).slice(0, 500),
      options: options.length >= 2 ? options : DEFAULT_CHECK.options,
      correct: Math.min(Math.max(0, Number((d as any).correct) || 0), options.length - 1),
      explanation: String((d as any).explanation || "").slice(0, 500),
    };
  } catch {
    return DEFAULT_CHECK;
  }
};

const InlineCheckView: React.FC<NodeViewProps> = ({ node, updateAttributes, editor, deleteNode }) => {
  const data = parseCheck(node.attrs.check);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<InlineCheckData>(data);
  const inputCls = "w-full min-h-[36px] px-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.05] text-sm";

  const save = () => {
    updateAttributes({ check: JSON.stringify({ ...draft, options: draft.options.map((o) => o.trim()).filter(Boolean) }) });
    setEditing(false);
  };

  return (
    <NodeViewWrapper className="my-3 el-card shadow-soft" contentEditable={false}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-white/[0.06] text-[11px] uppercase tracking-wider font-semibold text-gray-500">
        <HelpCircle className="w-3.5 h-3.5" /> Quick check
        <span className="flex-1" />
        {editor.isEditable && !editing && (
          <>
            <button type="button" onClick={() => { setDraft(data); setEditing(true); }} className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-200 normal-case tracking-normal font-medium"><Pencil className="w-3 h-3" /> Edit</button>
            <button type="button" onClick={() => deleteNode()} className="inline-flex items-center gap-1 text-danger-700 dark:text-danger-500 normal-case tracking-normal font-medium ml-2"><Trash2 className="w-3 h-3" /> Remove</button>
          </>
        )}
      </div>
      {editing ? (
        <div className="p-3 space-y-2">
          <input className={inputCls} value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} placeholder="Question" />
          {draft.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <button type="button" aria-label={`Mark option ${i + 1} correct`} onClick={() => setDraft({ ...draft, correct: i })} className={`w-5 h-5 rounded-full border-2 flex-shrink-0 ${draft.correct === i ? "border-success-500 bg-success-500" : "border-gray-300"}`} />
              <input className={inputCls} value={o} onChange={(e) => setDraft({ ...draft, options: draft.options.map((x, j) => (j === i ? e.target.value : x)) })} placeholder={`Option ${i + 1}`} />
              {draft.options.length > 2 && (
                <button type="button" onClick={() => setDraft({ ...draft, options: draft.options.filter((_, j) => j !== i), correct: Math.min(draft.correct, draft.options.length - 2) })} className="text-gray-400 hover:text-danger-500" aria-label="Remove option"><Trash2 className="w-3.5 h-3.5" /></button>
              )}
            </div>
          ))}
          {draft.options.length < 6 && (
            <button type="button" onClick={() => setDraft({ ...draft, options: [...draft.options, ""] })} className="inline-flex items-center gap-1 text-xs text-brand-600 dark:text-brand-200"><Plus className="w-3 h-3" /> option</button>
          )}
          <input className={inputCls} value={draft.explanation} onChange={(e) => setDraft({ ...draft, explanation: e.target.value })} placeholder="Explanation after answering (optional)" />
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setEditing(false)} className="min-h-[32px] px-3 rounded-pill text-xs text-gray-600">Cancel</button>
            <button type="button" onClick={save} className="min-h-[32px] px-3 rounded-pill bg-brand-500 text-white text-xs font-semibold">Save</button>
          </div>
        </div>
      ) : (
        <div className="p-3">
          <p className="text-sm font-medium text-gray-900 dark:text-white">{data.prompt}</p>
          <ol className="mt-2 space-y-1">
            {data.options.map((o, i) => (
              <li key={i} className={`text-sm px-3 py-1.5 rounded-lg border ${i === data.correct ? "border-success-500 text-success-700 dark:text-success-500" : "border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200"}`}>
                {i + 1}. {o} {i === data.correct && editor.isEditable ? <span className="text-[10px] uppercase ml-1">correct</span> : null}
              </li>
            ))}
          </ol>
          {data.explanation && <p className="mt-2 text-xs text-gray-500">{data.explanation}</p>}
        </div>
      )}
    </NodeViewWrapper>
  );
};

export const InlineCheck = Node.create({
  name: "inlineCheck",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { check: { default: JSON.stringify(DEFAULT_CHECK) } };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="inline-check"]', getAttrs: (el) => ({ check: (el as HTMLElement).getAttribute("data-check") || JSON.stringify(DEFAULT_CHECK) }) }];
  },
  renderHTML({ node }) {
    const data = parseCheck(node.attrs.check);
    // Static fallback content so the block still reads sensibly in print / PDF / no-JS.
    return [
      "div",
      mergeAttributes({ "data-type": "inline-check", "data-check": JSON.stringify(data), class: "note-inline-check" }),
      ["p", { class: "note-inline-check__prompt" }, data.prompt],
      ["ol", {}, ...data.options.map((o) => ["li", {}, o] as any)],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(InlineCheckView);
  },
  addCommands() {
    return {
      insertInlineCheck:
        (data?: Partial<InlineCheckData>) =>
        ({ commands }: { commands: any }) =>
          commands.insertContent({ type: this.name, attrs: { check: JSON.stringify({ ...DEFAULT_CHECK, ...data }) } }),
    } as any;
  },
});

export { parseCheck };
