import React, { Suspense, lazy, useEffect, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { Code2, FlaskConical, Loader2, Pencil, Play, Trash2, Wand2 } from "lucide-react";
import { LANGUAGES, languageById } from "../../codePlayground/languages";
import { DEFAULT_BLOCK, parseBlock, serializeBlock, type PlaygroundBlock } from "../../codePlayground/playgroundData";
import { openPlayground } from "../../codePlayground/store";
import { useRunner } from "../../codePlayground/useRunner";
import { useDarkMode } from "../../codePlayground/useDarkMode";
import SelectField from "../../ui/SelectField";

/**
 * Code Playground block (teacher side): an example students run and change, or an
 * exercise they solve and check against the expected output. Saved as
 * <div data-type="code-playground" data-playground="{json}"> with the code as a <pre>
 * fallback; readers hydrate it (codePlayground/hydratePlaygrounds.tsx).
 */

const CodeEditor = lazy(() => import("../../codePlayground/CodeEditor"));

const inputCls = "w-full min-h-[36px] px-2.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.05] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30";
const labelCls = "block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1";

const EditorBox: React.FC<{ value: string; onChange: (v: string) => void; language: string; label: string }> = ({ value, onChange, language, label }) => {
  const dark = useDarkMode();
  return (
    <div className="rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden max-h-[320px] overflow-y-auto">
      <Suspense fallback={<pre className="m-0 p-3 text-xs font-mono whitespace-pre-wrap">{value}</pre>}>
        <CodeEditor value={value} onChange={onChange} language={language} dark={dark} ariaLabel={label} />
      </Suspense>
    </div>
  );
};

const PlaygroundEditForm: React.FC<{ initial: PlaygroundBlock; onSave: (b: PlaygroundBlock) => void; onCancel: () => void }> = ({ initial, onSave, onCancel }) => {
  const [b, setB] = useState<PlaygroundBlock>(initial);
  const { state, run } = useRunner();
  const [filling, setFilling] = useState(false);
  const set = <K extends keyof PlaygroundBlock>(k: K, v: PlaygroundBlock[K]) => setB((x) => ({ ...x, [k]: v }));
  const lang = languageById(b.language) ?? LANGUAGES[0];

  const changeLanguage = (id: string) => {
    const next = languageById(id)!;
    setB((x) => ({ ...x, language: id, code: !x.code.trim() || x.code === (languageById(x.language)?.starter ?? "") ? next.starter : x.code }));
  };

  // "Use its output": run the solution (or the code) and keep what it prints as the expected output.
  const fillExpected = () => {
    setFilling(true);
    const main = b.entry || lang.file;
    void run(lang, { entry: main, files: [{ path: main, content: b.solution.trim() || b.code }, ...b.files.filter((x) => x.path !== main)] }, b.stdin);
  };
  useEffect(() => {
    if (!filling || state.phase !== "done") return;
    setFilling(false);
    if (state.meta?.verdict === "ok") set("expected", state.output.replace(/\n+$/, ""));
  }, [filling, state.phase, state.meta, state.output]);

  return (
    <div className="p-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        {(["example", "exercise"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => set("mode", m)}
            aria-pressed={b.mode === m}
            className={`min-h-[34px] px-3 rounded-pill text-xs font-semibold border ${b.mode === m ? "bg-brand-500 border-brand-500 text-white" : "border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300"}`}
          >
            {m === "example" ? "Example — students run and change it" : "Exercise — students solve and check it"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-3">
        <div>
          <label className={labelCls}>Title</label>
          <input className={inputCls} value={b.title} onChange={(e) => set("title", e.target.value)} placeholder={b.mode === "exercise" ? "e.g. Total value of the stock" : "e.g. Try map() yourself"} />
        </div>
        <div>
          <label className={labelCls}>Language</label>
          <SelectField className={inputCls} value={b.language} onChange={(e) => changeLanguage(e.target.value)} aria-label="Language">
            <optgroup label="Runs in the browser">
              {LANGUAGES.filter((l) => l.browser).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Runs on the code runner">
              {LANGUAGES.filter((l) => !l.browser).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </optgroup>
          </SelectField>
        </div>
      </div>
      <div>
        <label className={labelCls}>{b.mode === "exercise" ? "Task for the student" : "What to try (optional)"}</label>
        <textarea rows={3} className={`${inputCls} py-2`} value={b.instructions} onChange={(e) => set("instructions", e.target.value)} placeholder={b.mode === "exercise" ? "e.g. Complete totalValue() so it prints the total value of all parts." : "e.g. Change the quantity of the oil filter and run it again."} />
      </div>
      <div>
        <label className={labelCls}>{b.mode === "exercise" ? "Starting code" : "Code"}</label>
        <EditorBox value={b.code} onChange={(v) => set("code", v)} language={b.language} label="Starting code" />
      </div>
      {lang.stdin && (
        <div>
          <label className={labelCls}>Input given to the program (optional, one value per line)</label>
          <textarea rows={2} className={`${inputCls} py-2 font-mono`} value={b.stdin} onChange={(e) => set("stdin", e.target.value)} />
        </div>
      )}
      {b.mode === "exercise" && (
        <>
          <div>
            <label className={labelCls}>Solution (students can reveal it)</label>
            <EditorBox value={b.solution} onChange={(v) => set("solution", v)} language={b.language} label="Solution" />
          </div>
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className={labelCls + " mb-0"}>Expected output (checked automatically)</label>
              <button type="button" onClick={fillExpected} disabled={filling || !(b.solution.trim() || b.code.trim())} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-200 disabled:opacity-50">
                {filling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} Run the {b.solution.trim() ? "solution" : "code"} and use its output
              </button>
            </div>
            <textarea rows={3} className={`${inputCls} py-2 font-mono`} value={b.expected} onChange={(e) => set("expected", e.target.value)} placeholder="Leave empty for no automatic check" />
            {state.phase === "done" && state.meta?.verdict !== "ok" && !filling && <p className="mt-1 text-xs text-danger-700">It didn't run cleanly: {state.entries.map((e) => e.text).join(" ").slice(0, 200)}</p>}
          </div>
          <div>
            <label className={labelCls}>Hint (optional)</label>
            <input className={inputCls} value={b.hint} onChange={(e) => set("hint", e.target.value)} placeholder="e.g. Use reduce() with a starting value of 0." />
          </div>
        </>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" onClick={() => onSave(b)} className="min-h-[36px] px-4 rounded-lg bg-brand-500 text-white text-sm font-semibold">
          Save
        </button>
        <button type="button" onClick={() => openPlayground({ block: b, source: "Testing the block", onSave: (next) => setB(next) })} className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-gray-200 dark:border-white/10 text-sm">
          <Play className="w-3.5 h-3.5" /> Test in the playground
        </button>
        <button type="button" onClick={onCancel} className="min-h-[36px] px-3 rounded-lg text-sm text-gray-600 dark:text-gray-300">
          Cancel
        </button>
      </div>
    </div>
  );
};

const PlaygroundView: React.FC<NodeViewProps> = ({ node, updateAttributes, editor, deleteNode }) => {
  const data = parseBlock(node.attrs.playground);
  const [editing, setEditing] = useState(!!node.attrs.fresh);
  const lang = languageById(data.language);
  const save = (b: PlaygroundBlock) => {
    updateAttributes({ playground: serializeBlock(b), fresh: false });
    setEditing(false);
  };
  return (
    <NodeViewWrapper className="my-3 el-card shadow-soft" contentEditable={false} data-playground-mode={data.mode}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-white/[0.06] text-[11px] uppercase tracking-wider font-semibold text-gray-500">
        {data.mode === "exercise" ? <FlaskConical className="w-3.5 h-3.5" /> : <Code2 className="w-3.5 h-3.5" />}
        {data.mode === "exercise" ? "Coding exercise" : "Code playground"} · {lang?.label}
        <span className="flex-1" />
        {editor.isEditable && !editing && (
          <>
            <button type="button" onClick={() => openPlayground({ block: data, source: "Preview of the block", autoRun: true })} className="inline-flex items-center gap-1 text-success-700 dark:text-success-500 normal-case tracking-normal font-medium">
              <Play className="w-3 h-3" /> Run
            </button>
            <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-200 normal-case tracking-normal font-medium ml-2">
              <Pencil className="w-3 h-3" /> Edit
            </button>
            <button type="button" onClick={() => deleteNode()} className="inline-flex items-center gap-1 text-danger-700 dark:text-danger-500 normal-case tracking-normal font-medium ml-2">
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </>
        )}
      </div>
      {editing ? (
        <PlaygroundEditForm initial={data} onSave={save} onCancel={() => (node.attrs.fresh ? deleteNode() : setEditing(false))} />
      ) : (
        <div className="p-3">
          {data.title && <p className="text-sm font-semibold text-gray-900 dark:text-white">{data.title}</p>}
          {data.instructions && <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">{data.instructions}</p>}
          <pre className="mt-2 mb-0 max-h-48 overflow-auto rounded-lg bg-gray-50 dark:bg-black/30 p-3 text-xs font-mono text-gray-800 dark:text-gray-100">{data.code}</pre>
          {data.mode === "exercise" && (
            <p className="mt-2 text-xs text-gray-500">
              {data.expected.trim() ? "Checked against the expected output." : "No automatic check (add an expected output)."}
              {data.solution.trim() ? " Has a solution." : ""}
              {data.hint.trim() ? " Has a hint." : ""}
            </p>
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
};

export const CodePlayground = Node.create({
  name: "codePlayground",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      playground: { default: serializeBlock(DEFAULT_BLOCK) },
      // Just inserted: opens in edit mode; never saved to HTML.
      fresh: { default: false, rendered: false },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="code-playground"]', getAttrs: (el) => ({ playground: (el as HTMLElement).getAttribute("data-playground") || serializeBlock(DEFAULT_BLOCK) }) }];
  },
  renderHTML({ node }) {
    const data = parseBlock(node.attrs.playground);
    const lang = languageById(data.language);
    // Static fallback: title, task and the code, readable in print / PDF / without JS.
    return [
      "div",
      mergeAttributes({ "data-type": "code-playground", "data-playground": serializeBlock(data), class: "note-playground" }),
      ...(data.title ? [["p", {}, ["strong", {}, data.title]] as any] : []),
      ...(data.instructions ? [["p", {}, data.instructions] as any] : []),
      ["pre", {}, ["code", { class: `language-${lang?.hljs ?? "plaintext"}` }, data.code]],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(PlaygroundView);
  },
  addCommands() {
    return {
      insertCodePlayground:
        (data?: Partial<PlaygroundBlock>) =>
        ({ commands }: { commands: any }) =>
          commands.insertContent({ type: this.name, attrs: { playground: serializeBlock({ ...DEFAULT_BLOCK, ...data }), fresh: true } }),
    } as any;
  },
});
