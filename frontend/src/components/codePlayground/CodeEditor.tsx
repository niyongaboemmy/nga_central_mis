import React, { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { Compartment, EditorState, Prec, type Extension } from "@codemirror/state";
import { keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { HighlightStyle, indentUnit, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * A real code editor (CodeMirror 6) for the playground: line numbers, syntax colours,
 * bracket matching and auto-closing, autocompletion, multi-cursor, search (Ctrl/Cmd+F),
 * Tab to indent. Ctrl/Cmd+Enter runs, Shift+Alt+F formats. Each language's grammar
 * loads on demand.
 */

/** Legacy modes are typed against @codemirror/streamparser's StringStream; StreamLanguage
 *  passes its own, which has the same methods. */
const legacy = (mode: unknown) => StreamLanguage.define(mode as Parameters<typeof StreamLanguage.define>[0]);

const loaders: Record<string, () => Promise<Extension>> = {
  javascript: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  node: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  react: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true })),
  typescript: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true })),
  python: () => import("@codemirror/lang-python").then((m) => m.python()),
  java: () => import("@codemirror/lang-java").then((m) => m.java()),
  c: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  cpp: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  arduino: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  php: () => import("@codemirror/lang-php").then((m) => m.php()),
  rust: () => import("@codemirror/lang-rust").then((m) => m.rust()),
  go: () => import("@codemirror/lang-go").then((m) => m.go()),
  sql: () => import("@codemirror/lang-sql").then((m) => m.sql()),
  html: () => import("@codemirror/lang-html").then((m) => m.html()),
  css: () => import("@codemirror/lang-css").then((m) => m.css()),
  csharp: () => import("@codemirror/legacy-modes/mode/clike").then((m) => legacy(m.csharp)),
  kotlin: () => import("@codemirror/legacy-modes/mode/clike").then((m) => legacy(m.kotlin)),
  swift: () => import("@codemirror/legacy-modes/mode/swift").then((m) => legacy(m.swift)),
  ruby: () => import("@codemirror/legacy-modes/mode/ruby").then((m) => legacy(m.ruby)),
  bash: () => import("@codemirror/legacy-modes/mode/shell").then((m) => legacy(m.shell)),
};

/**
 * The lesson code windows' palettes (GitHub light / dark, index.css .code-window), so code
 * looks the same in the lesson and in the playground — and every colour meets AA
 * contrast on its background (CodeMirror's defaults and One Dark fall just short).
 */
const palette = (c: Record<string, string>) =>
  HighlightStyle.define([
    { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: c.keyword },
    { tag: [t.string, t.special(t.string), t.regexp, t.character], color: c.string },
    { tag: [t.number, t.bool, t.null, t.atom, t.literal], color: c.number },
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: c.comment, fontStyle: "italic" },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName)), t.className, t.definition(t.className)], color: c.title },
    { tag: [t.typeName, t.standard(t.variableName), t.self, t.namespace], color: c.builtin },
    { tag: [t.propertyName, t.attributeName], color: c.attr },
    { tag: [t.tagName, t.angleBracket], color: c.tag },
    { tag: [t.meta, t.processingInstruction, t.annotation], color: c.meta },
    { tag: [t.heading, t.strong], fontWeight: "bold" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.link, textDecoration: "underline" },
    { tag: t.invalid, color: c.keyword },
  ]);

const LIGHT = { bg: "#ffffff", text: "#1f2328", gutter: "#f6f8fa", gutterText: "#6e7781", border: "#d8dee4", keyword: "#cf222e", string: "#0a3069", number: "#0550ae", comment: "#57606a", title: "#8250df", builtin: "#953800", attr: "#0550ae", tag: "#116329", meta: "#6639ba" };
const DARK = { bg: "#0d1117", text: "#e6edf3", gutter: "#0d1117", gutterText: "#8b949e", border: "#30363d", keyword: "#ff7b72", string: "#a5d6ff", number: "#79c0ff", comment: "#9198a1", title: "#d2a8ff", builtin: "#ffa657", attr: "#79c0ff", tag: "#7ee787", meta: "#d2a8ff" };

const chrome = (c: typeof LIGHT, dark: boolean) =>
  EditorView.theme(
    {
      "&": { backgroundColor: c.bg, color: c.text },
      ".cm-content": { caretColor: dark ? "#58a6ff" : "#0969da" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: dark ? "#58a6ff" : "#0969da" },
      ".cm-gutters": { backgroundColor: c.gutter, color: c.gutterText, borderRight: `1px solid ${c.border}` },
      ".cm-activeLine": { backgroundColor: dark ? "rgba(110, 118, 129, 0.12)" : "rgba(84, 174, 255, 0.07)" },
      ".cm-activeLineGutter": { backgroundColor: dark ? "rgba(110, 118, 129, 0.18)" : "rgba(84, 174, 255, 0.12)", color: c.text },
      "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection": {
        backgroundColor: dark ? "rgba(56, 139, 253, 0.35)" : "rgba(84, 174, 255, 0.3)",
      },
      ".cm-selectionMatch": { backgroundColor: dark ? "rgba(187, 128, 9, 0.3)" : "rgba(255, 213, 79, 0.4)" },
      "&.cm-focused .cm-matchingBracket": { backgroundColor: dark ? "rgba(63, 185, 80, 0.25)" : "rgba(26, 127, 55, 0.15)", outline: "none" },
      ".cm-tooltip": { backgroundColor: dark ? "#161b22" : "#ffffff", border: `1px solid ${c.border}`, color: c.text },
      ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: dark ? "#1f6feb" : "#0969da", color: "#ffffff" },
      ".cm-panels": { backgroundColor: dark ? "#161b22" : "#f6f8fa", color: c.text },
      ".cm-foldPlaceholder": { backgroundColor: "transparent", border: `1px solid ${c.border}`, color: c.gutterText },
    },
    { dark },
  );

const lightTheme = [chrome(LIGHT, false), syntaxHighlighting(palette(LIGHT))];
const darkTheme = [chrome(DARK, true), syntaxHighlighting(palette(DARK))];

const baseTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13.5px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    lineHeight: "1.65",
    fontVariantLigatures: "none",
  },
  ".cm-content": { padding: "10px 0" },
  ".cm-gutters": { minWidth: "40px" },
});

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: string;
  dark: boolean;
  readOnly?: boolean;
  onRun?: () => void;
  onFormat?: () => void;
  ariaLabel?: string;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ value, onChange, language, dark, readOnly, onRun, onFormat, ariaLabel, placeholder, autoFocus, className }) => {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const langSlot = useRef(new Compartment());
  const themeSlot = useRef(new Compartment());
  const readSlot = useRef(new Compartment());
  // Latest callbacks, read by the keymap without rebuilding the editor.
  const cb = useRef({ onChange, onRun, onFormat });
  cb.current = { onChange, onRun, onFormat };

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          Prec.highest(
            keymap.of([
              { key: "Mod-Enter", run: () => (cb.current.onRun?.(), true) },
              { key: "Shift-Alt-f", run: () => (cb.current.onFormat?.(), true) },
            ]),
          ),
          basicSetup,
          keymap.of([indentWithTab]),
          indentUnit.of("    "),
          EditorState.tabSize.of(4),
          baseTheme,
          langSlot.current.of([]),
          themeSlot.current.of(dark ? darkTheme : lightTheme),
          readSlot.current.of([EditorState.readOnly.of(!!readOnly), EditorView.editable.of(!readOnly)]),
          EditorView.contentAttributes.of({ "aria-label": ariaLabel || "Code editor", spellcheck: "false", autocapitalize: "off", autocorrect: "off" }),
          placeholder ? cmPlaceholder(placeholder) : [],
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    if (autoFocus) v.focus();
    return () => {
      v.destroy();
      view.current = null;
    };
    // Built once; value/language/theme changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Outside changes (Format, Reset, a language switch) replace the text.
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    let alive = true;
    const load = loaders[language];
    if (!load) {
      view.current?.dispatch({ effects: langSlot.current.reconfigure([]) });
      return;
    }
    load()
      .then((ext) => {
        if (alive) view.current?.dispatch({ effects: langSlot.current.reconfigure(ext) });
      })
      .catch(() => {
        /* plain text editing still works */
      });
    return () => {
      alive = false;
    };
  }, [language]);

  useEffect(() => {
    view.current?.dispatch({ effects: themeSlot.current.reconfigure(dark ? darkTheme : lightTheme) });
  }, [dark]);

  useEffect(() => {
    view.current?.dispatch({ effects: readSlot.current.reconfigure([EditorState.readOnly.of(!!readOnly), EditorView.editable.of(!readOnly)]) });
  }, [readOnly]);

  return <div ref={host} className={className} data-testid="code-editor" />;
};

export default CodeEditor;
