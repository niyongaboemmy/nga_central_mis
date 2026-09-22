import React, { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageResize from "tiptap-extension-resize-image";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import CharacterCount from "@tiptap/extension-character-count";
import Mathematics from "@tiptap/extension-mathematics";
import "katex/dist/katex.min.css";
import { getHTMLFromFragment } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import MathFormulaModal from "./MathFormulaModal";
import ImageCropModal from "./ImageCropModal";
import {
  Bold,
  Italic,
  Strikethrough,
  Underline as UnderlineIcon,
  Highlighter,
  Baseline,
  Palette,
  List,
  ListOrdered,
  ListChecks,
  ChevronDown,
  Quote,
  Table as TableIcon,
  Sigma,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ImagePlus,
  Undo2,
  Redo2,
  Sparkles,
  Loader2,
  Check,
  X,
  BookmarkPlus,
  Trash2,
  Search,
  ListTree,
  ChevronUp,
  TableCellsMerge,
  TableCellsSplit,
  Ban,
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  PanelTop,
  Crop,
  Eye,
  HelpCircle,
} from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import { lessonNotesApi, PromptPreset } from "../../api/lessonNotes";
import { QUICK_PROMPTS } from "./quickPrompts";
import { InlineCheck, Reveal } from "../elearning/interactive/nodes";

interface Props {
  initialContent: any;
  editable: boolean;
  onChange: (json: any, html: string) => void;
  onUploadImage: (file: File) => Promise<string>;
  onRequestAIEdit: (instruction: string, selectionHtml?: string, wholeNoteHtml?: string) => Promise<string>;
  onAIEditAccepted: (instruction: string) => void;
  /** Renders the note body as a centered, fixed-width A4-like page with side margins
   * instead of stretching edge to edge — only worth the visual overhead in fullscreen,
   * where the viewport is otherwise wide enough to make long lines hard to read. */
  isFullscreen?: boolean;
}

// Adds cell-shading support to the stock table nodes — plain @tiptap/extension-table-cell/
// -header has no color attribute. Rendered as an inline style so it round-trips through the
// backend's sanitizer (see backend/src/utils/sanitizeNoteHtml.ts allowedStyles.td/th) and
// renders identically in the read-only shared-note view and PDF export.
// Cell padding presets. Deliberately a per-cell inline style (applied via setCellAttribute,
// same command family as shading below) rather than a table-level class: Tiptap's Table
// node uses a custom NodeView (TableView, for the resizable-column colgroup) whose update()
// only patches column widths — it never re-applies generic node attributes to the live <table>
// DOM, so a table-level "density" attribute would silently do nothing while editing even
// though it'd be present in getHTML(). td/th use the default node view, so a per-cell style
// attribute renders immediately, both live and in the read-only/PDF output.
const CELL_PADDING: { label: string; value: string }[] = [
  { label: "Compact", value: "0.15rem 0.4rem" },
  { label: "Normal", value: "0.5rem 0.75rem" },
  { label: "Spacious", value: "1rem 1.25rem" },
];

// Adds cell-shading + padding support to the stock table nodes — plain
// @tiptap/extension-table-cell/-header has neither. Rendered as inline styles so they
// round-trip through the backend's sanitizer (see backend/src/utils/sanitizeNoteHtml.ts
// allowedStyles.td/th) and render identically in the read-only shared-note view and PDF export.
const withCellStyling = <T extends { name: string }>(base: T) =>
  (base as any).extend({
    addAttributes() {
      return {
        ...(this as any).parent?.(),
        backgroundColor: {
          default: null,
          parseHTML: (element: HTMLElement) => element.style.backgroundColor || null,
          renderHTML: (attributes: { backgroundColor?: string | null }) =>
            attributes.backgroundColor ? { style: `background-color: ${attributes.backgroundColor}` } : {},
        },
        padding: {
          default: null,
          parseHTML: (element: HTMLElement) => element.style.padding || null,
          renderHTML: (attributes: { padding?: string | null }) =>
            attributes.padding ? { style: `padding: ${attributes.padding}` } : {},
        },
      };
    },
  });
const ShadedTableCell = withCellStyling(TableCell);
const ShadedTableHeader = withCellStyling(TableHeader);

// Shared preset palette for text color, highlight, and table cell shading — a small,
// legible set rather than an unbounded color wheel, matching how most teachers actually
// use color (a handful of consistent meanings) rather than precise brand-matching.
const COLOR_SWATCHES = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
  "#78716c", "#000000",
];

const ColorDropdown: React.FC<{
  title: string;
  icon: React.ReactNode;
  activeColor?: string | null;
  onPick: (color: string | null) => void;
}> = ({ title, icon, activeColor, onPick }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        title={title}
        className={`p-1.5 rounded-full transition-colors flex items-center gap-0.5 ${
          activeColor
            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
            : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700/60"
        }`}
      >
        {icon}
        <span
          className="w-2.5 h-2.5 rounded-full border border-gray-300 dark:border-gray-600 -mb-1"
          style={{ backgroundColor: activeColor || "transparent" }}
        />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 p-2 rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800 shadow-lg w-48">
            <div className="grid grid-cols-7 gap-1">
              {COLOR_SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(color);
                    setOpen(false);
                  }}
                  title={color}
                  className="w-5 h-5 rounded-full border border-black/10 dark:border-white/10 hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(null);
                setOpen(false);
              }}
              className="mt-2 w-full text-left px-1.5 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/60 rounded"
            >
              Remove color
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const ToolbarButton: React.FC<{
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}> = ({ onClick, active, disabled, title, children }) => (
  <button
    type="button"
    // Toolbar clicks would otherwise blur the editor on mousedown, collapsing
    // the text selection before onClick's toggle command runs against it.
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`p-1.5 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
      active
        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
        : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700/60"
    }`}
  >
    {children}
  </button>
);

// Images are embedded as base64 in content_json/content_html (sent on every autosave,
// doubled since both fields carry it) rather than uploaded to storage, so the cap here
// is about keeping the PATCH payload under the backend's JSON body limit (app.ts), not
// about a multer limit.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
// Mirrors the backend's saved-prompt cap (lessonNoteController.ts createPromptPreset).
const PRESET_LIMIT = 30;
const validateImageFile = (file: File): string | null => {
  if (!file.type.startsWith("image/")) return "Only image files can be inserted here.";
  if (file.size > MAX_IMAGE_BYTES) return "That image is larger than 10MB — try a smaller file.";
  return null;
};

// A short plain-text preview of the HTML a revision will target, so the teacher can
// confirm at a glance that the right passage got captured before they type an instruction.
const previewOf = (html: string, max = 90): string => {
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

const LessonNoteRichEditor: React.FC<Props> = ({
  initialContent,
  editable,
  onChange,
  onUploadImage,
  onRequestAIEdit,
  onAIEditAccepted,
  isFullscreen,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Position captured at the moment the crop modal opens (not re-derived from the live
  // selection on apply) — the modal's own inputs steal focus from the editor while open,
  // so by the time "Apply crop" is clicked the ProseMirror selection can no longer be
  // trusted to still point at the image that was being cropped.
  const [cropTarget, setCropTarget] = useState<{ pos: number; src: string } | null>(null);
  const [tableMenu, setTableMenu] = useState<{ x: number; y: number } | null>(null);

  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [proposal, setProposal] = useState<{ originalHtml: string; revisedHtml: string; range: { from: number; to: number } | null } | null>(null);
  // Captured the moment the AI panel opens, not read live off the editor — otherwise
  // clicking into the instruction input (which can shift focus/selection) would silently
  // drop the very passage the teacher just highlighted.
  const [capturedSelection, setCapturedSelection] = useState<{ html: string; range: { from: number; to: number } } | null>(null);

  const [presets, setPresets] = useState<PromptPreset[]>([]);
  const [savingPreset, setSavingPreset] = useState(false);
  const [headingMenuOpen, setHeadingMenuOpen] = useState(false);
  const [mathModalOpen, setMathModalOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [outlineOpen, setOutlineOpen] = useState(false);

  useEffect(() => {
    lessonNotesApi
      .listPromptPresets()
      .then((res) => setPresets(res.data.data))
      .catch(() => {});
  }, []);

  const editor = useEditor({
    editable,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      // No maxWidth: the extension force-sets the image's pixel width to maxWidth on
      // every fresh insert (not just when a teacher actually drags to resize), which
      // would override responsive 100%-width scaling and cause horizontal overflow in
      // narrower layouts. minWidth alone still stops a teacher from shrinking it to nothing.
      ImageResize.configure({ inline: false, HTMLAttributes: { class: "rounded-lg max-w-full" }, minWidth: 80 }),
      Placeholder.configure({ placeholder: "Start writing your lesson notes..." }),
      Link.configure({ openOnClick: false }),
      Underline,
      TextStyle,
      Color,
      // multicolor: true switches Highlight from a fixed yellow toggle to a per-mark
      // `color` attribute the toolbar's color picker can set (see ColorDropdown).
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      ShadedTableHeader,
      ShadedTableCell,
      CharacterCount,
      Mathematics,
      // Interactive blocks for the e-learning reader (tap-to-reveal, inline quick check).
      Reveal,
      InlineCheck,
    ],
    content: initialContent || "",
    onUpdate: ({ editor: e }) => {
      onChange(e.getJSON(), e.getHTML());
    },
    editorProps: {
      attributes: { spellcheck: "true" },
      // Pasting a screenshot or copying an image from another doc/site is the natural way
      // teachers already work — falling back to file-picker-only would be a regression.
      // onUploadImage just reads the file into a data URI (no network round-trip), so this
      // resolves near-instantly, same as pasting an image in Google Docs or Word.
      handlePaste: (_view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        const imageItem = items.find((item) => item.type.startsWith("image/"));
        if (!imageItem) return false;
        const file = imageItem.getAsFile();
        if (!file) return false;
        event.preventDefault();
        const validationError = validateImageFile(file);
        if (validationError) {
          showToast(validationError, "error");
          return true;
        }
        onUploadImage(file)
          .then((url) => editor?.chain().focus().setImage({ src: url, alt: file.name }).run())
          .catch(() => showToast("Failed to insert pasted image", "error"));
        return true;
      },
      handleDrop: (_view, event) => {
        const file = event.dataTransfer?.files?.[0];
        if (!file || !file.type.startsWith("image/")) return false;
        event.preventDefault();
        const validationError = validateImageFile(file);
        if (validationError) {
          showToast(validationError, "error");
          return true;
        }
        onUploadImage(file)
          .then((url) => editor?.chain().focus().setImage({ src: url, alt: file.name }).run())
          .catch(() => showToast("Failed to insert dropped image", "error"));
        return true;
      },
      handleDOMEvents: {
        // Right-click inside a table opens a Word/Docs-style context menu with the same
        // row/column/merge/delete actions as the contextual toolbar — a teacher shouldn't
        // have to first find the toolbar bar to do something the cursor is already on.
        contextmenu: (view, event) => {
          const mouseEvent = event as MouseEvent;
          const coords = view.posAtCoords({ left: mouseEvent.clientX, top: mouseEvent.clientY });
          if (!coords) return false;
          const $pos = view.state.doc.resolve(coords.pos);
          const inTable = Array.from({ length: $pos.depth }, (_, i) => $pos.node(i + 1)).some(
            (node) => node.type.name === "table",
          );
          if (!inTable) return false;
          view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)));
          mouseEvent.preventDefault();
          setTableMenu({ x: mouseEvent.clientX, y: mouseEvent.clientY });
          return true;
        },
      },
    },
  });

  useEffect(() => {
    if (editor && editable !== editor.isEditable) {
      editor.setEditable(editable);
    }
  }, [editable, editor]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f" && wrapperRef.current?.contains(document.activeElement)) {
        e.preventDefault();
        setFindOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!editor) return null;

  const findMatches = (): { from: number; to: number }[] => {
    if (!findQuery.trim()) return [];
    const query = findQuery.toLowerCase();
    const matches: { from: number; to: number }[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return;
      const text = node.text.toLowerCase();
      let idx = 0;
      for (;;) {
        const found = text.indexOf(query, idx);
        if (found === -1) break;
        matches.push({ from: pos + found, to: pos + found + query.length });
        idx = found + query.length;
      }
    });
    return matches;
  };

  const goToMatch = (index: number) => {
    const matches = findMatches();
    if (matches.length === 0) return;
    const clamped = ((index % matches.length) + matches.length) % matches.length;
    setMatchIndex(clamped);
    editor.chain().focus().setTextSelection(matches[clamped]).scrollIntoView().run();
  };

  const replaceCurrent = () => {
    const matches = findMatches();
    if (matches.length === 0) return;
    const m = matches[((matchIndex % matches.length) + matches.length) % matches.length];
    editor.chain().focus().insertContentAt(m, replaceQuery).run();
  };

  const replaceAll = () => {
    const matches = findMatches();
    if (matches.length === 0) return;
    // Replace back-to-front so earlier ranges' positions aren't shifted by later edits.
    let chain = editor.chain().focus();
    for (let i = matches.length - 1; i >= 0; i--) {
      chain = chain.insertContentAt(matches[i], replaceQuery);
    }
    chain.run();
    setMatchIndex(0);
  };

  const getHeadings = (): { level: number; text: string; pos: number }[] => {
    const headings: { level: number; text: string; pos: number }[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading") {
        headings.push({ level: node.attrs.level, text: node.textContent || "(untitled)", pos });
      }
    });
    return headings;
  };

  const scrollToHeading = (pos: number) => {
    editor.chain().focus().setTextSelection(pos).scrollIntoView().run();
    setOutlineOpen(false);
  };

  const handleImagePick = () => fileInputRef.current?.click();

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const validationError = validateImageFile(file);
    if (validationError) {
      showToast(validationError, "error");
      return;
    }
    try {
      const url = await onUploadImage(file);
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
    } catch {
      showToast("Failed to insert image", "error");
    }
  };

  const handleReplaceImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const validationError = validateImageFile(file);
    if (validationError) {
      showToast(validationError, "error");
      return;
    }
    try {
      const url = await onUploadImage(file);
      // tiptap-extension-resize-image registers its node as "imageResize", not the stock
      // "image" — targeting the wrong node name here would silently no-op.
      editor.chain().focus().updateAttributes("imageResize", { src: url }).run();
    } catch {
      showToast("Failed to replace image", "error");
    }
  };

  const openCropModal = () => {
    const { selection } = editor.state;
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== "imageResize") return;
    setCropTarget({ pos: selection.from, src: selection.node.attrs.src });
  };

  const applyCrop = (dataUrl: string) => {
    if (!cropTarget) return;
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setNodeAttribute(cropTarget.pos, "src", dataUrl);
        return true;
      })
      .run();
    setCropTarget(null);
  };

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const insertFormula = (latex: string) => {
    // Mathematics is decoration-based (renders any $...$ span it finds in the text),
    // not a distinct node type — inserting plain "$latex$" text is all that's needed,
    // and it round-trips through getHTML()/sanitization as ordinary text.
    editor.chain().focus().insertContent(`$${latex}$ `).run();
  };

  const openAIPanel = () => {
    setProposal(null);
    setInstruction("");
    const { from, to, empty } = editor.state.selection;
    if (!empty) {
      const slice = editor.state.doc.slice(from, to);
      setCapturedSelection({ html: getHTMLFromFragment(slice.content, editor.schema), range: { from, to } });
    } else {
      setCapturedSelection(null);
    }
    setAiPanelOpen(true);
  };

  const runAIEdit = async (rawInstruction?: string) => {
    const finalInstruction = (rawInstruction ?? instruction).trim();
    if (!finalInstruction) return;

    setAiLoading(true);
    try {
      // For a whole-note edit, send the editor's live HTML rather than relying on the
      // last autosave having landed — autosave is debounced, so content typed moments
      // ago could otherwise still read back as empty/stale on the server.
      const revisedHtml = await onRequestAIEdit(
        finalInstruction,
        capturedSelection?.html,
        capturedSelection ? undefined : editor.getHTML(),
      );
      setProposal({
        originalHtml: capturedSelection?.html ?? editor.getHTML(),
        revisedHtml,
        range: capturedSelection?.range ?? null,
      });
    } catch (err: any) {
      showToast(err?.response?.data?.message || "AI could not revise this content", "error");
    } finally {
      setAiLoading(false);
    }
  };

  const acceptProposal = () => {
    if (!proposal) return;
    if (proposal.range) {
      editor
        .chain()
        .focus()
        .deleteRange(proposal.range)
        .insertContentAt(proposal.range.from, proposal.revisedHtml)
        .run();
    } else {
      editor.commands.setContent(proposal.revisedHtml, true);
    }
    onAIEditAccepted(instruction);
    setAiPanelOpen(false);
    setProposal(null);
    setInstruction("");
    setCapturedSelection(null);
  };

  const rejectProposal = () => {
    setProposal(null);
  };

  const handleSavePreset = async () => {
    if (!instruction.trim()) return;
    setSavingPreset(true);
    try {
      const label = instruction.trim().length > 40 ? `${instruction.trim().slice(0, 40)}…` : instruction.trim();
      const res = await lessonNotesApi.savePromptPreset({ label, prompt_text: instruction.trim() });
      setPresets((prev) => [res.data.data, ...prev]);
      showToast("Prompt saved for reuse", "success");
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to save prompt", "error");
    } finally {
      setSavingPreset(false);
    }
  };

  const handleDeletePreset = async (presetId: number) => {
    try {
      await lessonNotesApi.deletePromptPreset(presetId);
      setPresets((prev) => prev.filter((p) => p.preset_id !== presetId));
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to delete saved prompt", "error");
    }
  };

  return (
    <div ref={wrapperRef} className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 dark:border-gray-700/50 bg-gray-50/60 dark:bg-gray-800/30 rounded-t-xl">
        <ToolbarButton title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="w-4 h-4" />
        </ToolbarButton>
        <ColorDropdown
          title="Text color"
          icon={<Baseline className="w-4 h-4" />}
          activeColor={editor.getAttributes("textStyle").color}
          onPick={(color) =>
            color
              ? editor.chain().focus().setColor(color).run()
              : editor.chain().focus().unsetColor().run()
          }
        />
        <ColorDropdown
          title="Highlight color"
          icon={<Highlighter className="w-4 h-4" />}
          activeColor={editor.getAttributes("highlight").color}
          onPick={(color) =>
            color
              ? editor.chain().focus().setHighlight({ color }).run()
              : editor.chain().focus().unsetHighlight().run()
          }
        />
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setHeadingMenuOpen((v) => !v)}
            className="flex items-center gap-1 px-2 py-1.5 rounded-full text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 min-w-[6.5rem]"
          >
            <span className="truncate">
              {editor.isActive("heading", { level: 1 })
                ? "Heading 1"
                : editor.isActive("heading", { level: 2 })
                  ? "Heading 2"
                  : editor.isActive("heading", { level: 3 })
                    ? "Heading 3"
                    : "Normal text"}
            </span>
            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
          </button>
          {headingMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setHeadingMenuOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-20 w-36 py-1 rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800 shadow-lg">
                {[
                  { label: "Normal text", onClick: () => editor.chain().focus().setParagraph().run(), active: editor.isActive("paragraph") },
                  { label: "Heading 1", onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: editor.isActive("heading", { level: 1 }) },
                  { label: "Heading 2", onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive("heading", { level: 2 }) },
                  { label: "Heading 3", onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), active: editor.isActive("heading", { level: 3 }) },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      opt.onClick();
                      setHeadingMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/60 ${
                      opt.active ? "text-blue-700 dark:text-blue-300 font-medium" : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
        <ToolbarButton title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Checklist" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <ListChecks className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="w-4 h-4" />
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
        <ToolbarButton
          title="Tap to reveal — hide an answer or example until the student taps"
          active={editor.isActive("reveal")}
          onClick={() => {
            const summary = window.prompt("What should the student tap? (e.g. 'Show the answer')", "Tap to reveal");
            if (summary !== null) (editor.chain().focus() as any).insertReveal(summary.trim() || "Tap to reveal").run();
          }}
        >
          <Eye className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Quick check — a question with instant feedback, inside the note" onClick={() => (editor.chain().focus() as any).insertInlineCheck().run()}>
          <HelpCircle className="w-4 h-4" />
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
        <ToolbarButton title="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          <AlignLeft className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          <AlignCenter className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          <AlignRight className="w-4 h-4" />
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
        <ToolbarButton title="Insert table" onClick={insertTable}>
          <TableIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Insert formula" onClick={() => setMathModalOpen(true)}>
          <Sigma className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Insert image" onClick={handleImagePick}>
          <ImagePlus className="w-4 h-4" />
        </ToolbarButton>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
        <ToolbarButton title="Undo" onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Redo" onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className="w-4 h-4" />
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
        <ToolbarButton
          title="Find & replace (Ctrl/Cmd+F)"
          active={findOpen}
          onClick={() => {
            setOutlineOpen(false);
            setFindOpen((v) => !v);
          }}
        >
          <Search className="w-4 h-4" />
        </ToolbarButton>
        <div className="relative">
          <ToolbarButton
            title="Document outline"
            active={outlineOpen}
            onClick={() => {
              setFindOpen(false);
              setOutlineOpen((v) => !v);
            }}
          >
            <ListTree className="w-4 h-4" />
          </ToolbarButton>
          {outlineOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOutlineOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 w-64 max-w-[calc(100vw-2rem)] max-h-80 overflow-y-auto py-1 rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800 shadow-lg">
                {getHeadings().length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-400">No headings yet — add some to build an outline.</div>
                ) : (
                  getHeadings().map((h, i) => (
                    <button
                      key={i}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => scrollToHeading(h.pos)}
                      className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 truncate"
                      style={{ paddingLeft: `${0.75 + (h.level - 1) * 0.75}rem` }}
                    >
                      {h.text}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex-1" />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={openAIPanel}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-gradient-to-r from-violet-600 to-blue-600 text-white hover:opacity-90 transition-opacity shadow-sm"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Ask AI
        </button>
      </div>

      {editable && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 100 }}
          shouldShow={({ state }) => !state.selection.empty}
        >
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={openAIPanel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow-lg hover:opacity-90"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Ask AI about this
          </button>
        </BubbleMenu>
      )}

      {/* Resize (drag handles) and left/center/right alignment already come from
          tiptap-extension-resize-image's own on-image overlay — this bar only adds what
          that overlay doesn't: crop, replace, and delete. */}
      {editable && editor.isActive("imageResize") && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 dark:border-gray-700/50 bg-violet-50/40 dark:bg-violet-950/10">
          <ToolbarButton title="Crop image" onClick={openCropModal}>
            <Crop className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Replace image" onClick={() => replaceFileInputRef.current?.click()}>
            <ImagePlus className="w-4 h-4" />
          </ToolbarButton>
          <input
            ref={replaceFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleReplaceImageFile}
          />
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
          <ToolbarButton title="Delete image" onClick={() => editor.chain().focus().deleteSelection().run()}>
            <Trash2 className="w-4 h-4 text-red-500" />
          </ToolbarButton>
        </div>
      )}

      {editable && editor.isActive("table") && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 dark:border-gray-700/50 bg-violet-50/40 dark:bg-violet-950/10">
          <ToolbarButton title="Add row above" onClick={() => editor.chain().focus().addRowBefore().run()} disabled={!editor.can().addRowBefore()}>
            <ArrowUpToLine className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Add row below" onClick={() => editor.chain().focus().addRowAfter().run()} disabled={!editor.can().addRowAfter()}>
            <ArrowDownToLine className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Delete row" onClick={() => editor.chain().focus().deleteRow().run()} disabled={!editor.can().deleteRow()}>
            <Trash2 className="w-4 h-4" />
          </ToolbarButton>
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
          <ToolbarButton title="Add column left" onClick={() => editor.chain().focus().addColumnBefore().run()} disabled={!editor.can().addColumnBefore()}>
            <ArrowLeftToLine className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Add column right" onClick={() => editor.chain().focus().addColumnAfter().run()} disabled={!editor.can().addColumnAfter()}>
            <ArrowRightToLine className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Delete column" onClick={() => editor.chain().focus().deleteColumn().run()} disabled={!editor.can().deleteColumn()}>
            <Trash2 className="w-4 h-4 rotate-90" />
          </ToolbarButton>
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
          <ToolbarButton title="Merge cells" onClick={() => editor.chain().focus().mergeCells().run()} disabled={!editor.can().mergeCells()}>
            <TableCellsMerge className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Split cell" onClick={() => editor.chain().focus().splitCell().run()} disabled={!editor.can().splitCell()}>
            <TableCellsSplit className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Toggle header row" active={editor.isActive("tableHeader")} onClick={() => editor.chain().focus().toggleHeaderRow().run()} disabled={!editor.can().toggleHeaderRow()}>
            <PanelTop className="w-4 h-4" />
          </ToolbarButton>
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
          <ColorDropdown
            title="Cell shading"
            icon={<Palette className="w-4 h-4" />}
            activeColor={editor.getAttributes("tableCell").backgroundColor || editor.getAttributes("tableHeader").backgroundColor}
            onPick={(color) => editor.chain().focus().setCellAttribute("backgroundColor", color).run()}
          />
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
          <div className="flex items-center gap-1 px-1 text-xs text-gray-500 dark:text-gray-400">
            <span className="hidden sm:inline">Padding:</span>
            {CELL_PADDING.map((p) => {
              const current =
                editor.getAttributes("tableCell").padding || editor.getAttributes("tableHeader").padding || CELL_PADDING[1].value;
              return (
                <button
                  key={p.label}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => editor.chain().focus().setCellAttribute("padding", p.value).run()}
                  title={`${p.label} cell padding`}
                  className={`px-2 py-1 rounded-full ${
                    current === p.value
                      ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                      : "hover:bg-gray-100 dark:hover:bg-gray-700/60"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="flex-1" />
          <ToolbarButton title="Delete table" onClick={() => editor.chain().focus().deleteTable().run()} disabled={!editor.can().deleteTable()}>
            <Ban className="w-4 h-4 text-red-500" />
          </ToolbarButton>
        </div>
      )}

      {findOpen && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700/50 bg-gray-50/60 dark:bg-gray-800/30 text-sm">
          <input
            autoFocus
            value={findQuery}
            onChange={(e) => {
              setFindQuery(e.target.value);
              setMatchIndex(0);
            }}
            onKeyDown={(e) => e.key === "Enter" && goToMatch(matchIndex + 1)}
            placeholder="Find"
            className="w-40 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
          <span className="text-xs text-gray-400 tabular-nums min-w-[3.5rem]">
            {findQuery.trim() ? `${findMatches().length ? matchIndex + 1 : 0}/${findMatches().length}` : ""}
          </span>
          <ToolbarButton title="Previous match" onClick={() => goToMatch(matchIndex - 1)}>
            <ChevronUp className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Next match" onClick={() => goToMatch(matchIndex + 1)}>
            <ChevronDown className="w-4 h-4" />
          </ToolbarButton>
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />
          <input
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            placeholder="Replace"
            className="w-40 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
          <button
            onClick={replaceCurrent}
            disabled={!findQuery.trim()}
            className="px-2.5 py-1.5 text-xs font-medium rounded-full border border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 disabled:opacity-40"
          >
            Replace
          </button>
          <button
            onClick={replaceAll}
            disabled={!findQuery.trim()}
            className="px-2.5 py-1.5 text-xs font-medium rounded-full border border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 disabled:opacity-40"
          >
            Replace all
          </button>
          <button
            onClick={() => setFindOpen(false)}
            className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div
        className={
          isFullscreen
            ? "flex-1 overflow-y-auto px-4 sm:px-10 py-8 bg-gray-100 dark:bg-gray-950"
            : "flex-1 overflow-y-auto px-6 py-5 bg-white dark:bg-gray-900/40"
        }
      >
        <div
          className={
            isFullscreen
              ? "max-w-[794px] mx-auto bg-white dark:bg-gray-900 rounded-sm shadow-sm ring-1 ring-black/5 dark:ring-white/10 px-16 py-14"
              : undefined
          }
        >
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      {editable && (
        <div className="px-4 py-1 text-[11px] text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/30 flex justify-end gap-3">
          <span>{editor.storage.characterCount.words()} words</span>
          <span>{editor.storage.characterCount.characters()} characters</span>
        </div>
      )}

      {aiPanelOpen && (
        <div className="border-t border-gray-200 dark:border-gray-700/50 bg-violet-50/60 dark:bg-violet-950/20 p-4">
          {!proposal ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  {capturedSelection ? "Revise the selected text" : "Revise the whole note"}
                </span>
                <button onClick={() => setAiPanelOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {capturedSelection && (
                <div className="text-xs text-violet-700 dark:text-violet-300 bg-white/70 dark:bg-gray-800/60 border border-violet-200 dark:border-violet-800/50 rounded-lg px-2.5 py-1.5 italic">
                  "{previewOf(capturedSelection.html)}"
                </div>
              )}

              {(QUICK_PROMPTS.length > 0 || presets.length > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((p) => (
                    <span
                      key={p.preset_id}
                      className="group inline-flex items-center gap-1 pl-2.5 pr-1 py-1 text-[11px] rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50"
                    >
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setInstruction(p.prompt_text)} title={p.prompt_text}>
                        {p.label}
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleDeletePreset(p.preset_id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded-full hover:bg-amber-300/60 dark:hover:bg-amber-800/60"
                        title="Delete saved prompt"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                  {QUICK_PROMPTS.map((qp) => (
                    <button
                      key={qp.label}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setInstruction(qp.prompt)}
                      title={qp.prompt}
                      className="px-2.5 py-1 text-[11px] rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:border-violet-300 dark:hover:border-violet-700 hover:text-violet-700 dark:hover:text-violet-300"
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>
              )}

              {presets.length >= PRESET_LIMIT - 5 && (
                <div className="text-[11px] text-amber-600 dark:text-amber-400">
                  {presets.length >= PRESET_LIMIT
                    ? `You've saved the maximum of ${PRESET_LIMIT} prompts — delete one to save another.`
                    : `${PRESET_LIMIT - presets.length} saved-prompt slot${PRESET_LIMIT - presets.length === 1 ? "" : "s"} left.`}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  autoFocus
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !aiLoading && runAIEdit()}
                  placeholder="Tell the AI what to do — any wording works, e.g. simplify this, add examples, make it shorter..."
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
                <button
                  onClick={handleSavePreset}
                  disabled={savingPreset || !instruction.trim() || presets.length >= PRESET_LIMIT}
                  title={presets.length >= PRESET_LIMIT ? `You've reached the ${PRESET_LIMIT}-prompt limit` : "Save this prompt for reuse"}
                  className="px-3 py-2 text-sm rounded-full border border-gray-200 dark:border-gray-700/50 text-gray-500 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <BookmarkPlus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => runAIEdit()}
                  disabled={aiLoading || !instruction.trim()}
                  className="px-4 py-2 text-sm font-medium rounded-full bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {aiLoading ? "Thinking..." : "Generate"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">Review the AI's proposed change</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">Before</div>
                  <div
                    className="lesson-note-preview prose prose-sm dark:prose-invert max-w-none opacity-70"
                    dangerouslySetInnerHTML={{ __html: proposal.originalHtml }}
                  />
                </div>
                <div className="rounded-lg border border-violet-300 dark:border-violet-700/60 bg-violet-50 dark:bg-violet-900/20 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-violet-500 mb-1.5">After (proposed)</div>
                  <div
                    className="lesson-note-preview prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: proposal.revisedHtml }}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={rejectProposal}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40"
                >
                  <X className="w-3.5 h-3.5" /> Reject
                </button>
                <button
                  onClick={acceptProposal}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full bg-green-600 text-white hover:bg-green-700"
                >
                  <Check className="w-3.5 h-3.5" /> Accept change
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tableMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setTableMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setTableMenu(null);
            }}
          />
          <div
            className="fixed z-50 w-52 py-1 rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800 shadow-xl text-sm"
            style={{ top: tableMenu.y, left: tableMenu.x }}
          >
            {(
              [
                { label: "Insert row above", action: () => editor.chain().focus().addRowBefore().run(), can: editor.can().addRowBefore() },
                { label: "Insert row below", action: () => editor.chain().focus().addRowAfter().run(), can: editor.can().addRowAfter() },
                { label: "Delete row", action: () => editor.chain().focus().deleteRow().run(), can: editor.can().deleteRow() },
                { divider: true },
                { label: "Insert column left", action: () => editor.chain().focus().addColumnBefore().run(), can: editor.can().addColumnBefore() },
                { label: "Insert column right", action: () => editor.chain().focus().addColumnAfter().run(), can: editor.can().addColumnAfter() },
                { label: "Delete column", action: () => editor.chain().focus().deleteColumn().run(), can: editor.can().deleteColumn() },
                { divider: true },
                { label: "Merge cells", action: () => editor.chain().focus().mergeCells().run(), can: editor.can().mergeCells() },
                { label: "Split cell", action: () => editor.chain().focus().splitCell().run(), can: editor.can().splitCell() },
                { label: "Toggle header row", action: () => editor.chain().focus().toggleHeaderRow().run(), can: editor.can().toggleHeaderRow() },
                { divider: true },
                { label: "Delete table", action: () => editor.chain().focus().deleteTable().run(), can: editor.can().deleteTable(), danger: true },
              ] as { label?: string; action?: () => void; can?: boolean; divider?: boolean; danger?: boolean }[]
            ).map((item, i) =>
              item.divider ? (
                <div key={i} className="my-1 border-t border-gray-100 dark:border-gray-700/50" />
              ) : (
                <button
                  key={item.label}
                  type="button"
                  disabled={!item.can}
                  onClick={() => {
                    item.action?.();
                    setTableMenu(null);
                  }}
                  className={`w-full text-left px-3 py-1.5 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700/60 ${
                    item.danger ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {item.label}
                </button>
              ),
            )}
          </div>
        </>
      )}

      <MathFormulaModal isOpen={mathModalOpen} onClose={() => setMathModalOpen(false)} onInsert={insertFormula} />
      <ImageCropModal
        isOpen={!!cropTarget}
        src={cropTarget?.src ?? null}
        onClose={() => setCropTarget(null)}
        onApply={applyCrop}
      />
    </div>
  );
};

export default LessonNoteRichEditor;
