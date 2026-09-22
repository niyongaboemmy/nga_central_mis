import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, ExternalLink, FileText, Heading, HelpCircle, Paperclip, PlayCircle, Search, X } from "lucide-react";
import { CourseItemType, elearningApi, PickerDocument, PickerNote } from "../../../api/elearning";
import { useMotion } from "../../../design/motion";
import { copy } from "../copy";

interface Props {
  courseId: number;
  sectionTitle: string;
  open: boolean;
  onClose: () => void;
  onPick: (choice: { item_type: CourseItemType; ref_id?: number; title?: string }) => void;
}

const NEW_TYPES: { type: CourseItemType; icon: React.ElementType; hint: string }[] = [
  { type: "PAGE", icon: FileText, hint: "Write a page with text, images, tables" },
  { type: "VIDEO", icon: PlayCircle, hint: "Embed a YouTube or Vimeo video" },
  { type: "LINK", icon: ExternalLink, hint: "Link to a website or file" },
  { type: "KNOWLEDGE_CHECK", icon: HelpCircle, hint: "A few quick questions with instant feedback" },
  { type: "HEADER", icon: Heading, hint: "A heading to group items" },
];

/**
 * Command-palette style picker (UX plan §3.2): type to search the teacher's notes and
 * materials, or pick a new content type. Keyboard: ↑↓ Enter Esc.
 */
const AddItemPalette: React.FC<Props> = ({ courseId, sectionTitle, open, onClose, onPick }) => {
  const m = useMotion();
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<PickerNote[]>([]);
  const [docs, setDocs] = useState<PickerDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
    setLoading(true);
    Promise.all([elearningApi.pickNotes(courseId), elearningApi.pickDocuments(courseId)])
      .then(([n, d]) => {
        setNotes(n.data.data);
        setDocs(d.data.data);
      })
      .finally(() => setLoading(false));
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open, courseId]);

  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    const out: { key: string; label: string; hint: string; icon: React.ElementType; choice: Parameters<Props["onPick"]>[0]; placed?: boolean; draft?: boolean }[] = [];
    for (const t of NEW_TYPES) {
      const label = copy.builder.itemTypes[t.type];
      if (!q || label.toLowerCase().includes(q) || t.hint.toLowerCase().includes(q)) {
        out.push({ key: `new-${t.type}`, label, hint: t.hint, icon: t.icon, choice: { item_type: t.type } });
      }
    }
    for (const n of notes) {
      if (q && !n.title.toLowerCase().includes(q)) continue;
      out.push({
        key: `note-${n.note_id}`,
        label: n.title,
        hint: `${copy.builder.itemTypes.LESSON_NOTE}${n.status === "DRAFT" ? " · draft" : ""}${n.page_count ? ` · PDF ${n.page_count} p.` : ""}${n.is_mine ? "" : " · shared with this class"}`,
        icon: BookOpen,
        choice: { item_type: "LESSON_NOTE", ref_id: n.note_id, title: n.title },
        placed: n.placed_in_section_id !== null,
        draft: n.status === "DRAFT",
      });
    }
    for (const d of docs) {
      if (q && !d.original_name.toLowerCase().includes(q) && !(d.category_name || "").toLowerCase().includes(q)) continue;
      out.push({
        key: `doc-${d.document_id}`,
        label: d.original_name,
        hint: `${copy.builder.itemTypes.SUBJECT_DOCUMENT}${d.category_name ? ` · ${d.category_name}` : ""} · ${(d.file_extension || "").toUpperCase()}`,
        icon: Paperclip,
        choice: { item_type: "SUBJECT_DOCUMENT", ref_id: d.document_id, title: d.original_name },
        placed: d.placed_in_section_id !== null,
      });
    }
    return out;
  }, [q, notes, docs]);

  useEffect(() => setCursor(0), [q]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(rows.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter" && rows[cursor]) {
      e.preventDefault();
      onPick(rows[cursor].choice);
    } else if (e.key === "Escape") onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh] bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            {...m("reveal")}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={`Add to ${sectionTitle}`}
            className="w-full max-w-xl rounded-2xl bg-white dark:bg-gray-900 shadow-float border border-gray-200 dark:border-gray-800 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder={`Add to ${sectionTitle} — search notes, materials, or pick a type`}
                className="flex-1 bg-transparent text-sm outline-none text-gray-900 dark:text-white placeholder:text-gray-400"
                aria-label="Search content to add"
              />
              <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="max-h-[55vh] overflow-y-auto py-2" role="listbox">
              {loading && <li className="px-4 py-3 text-sm text-gray-400">Loading your content…</li>}
              {!loading && rows.length === 0 && <li className="px-4 py-6 text-sm text-gray-500 text-center">Nothing matches "{query}".</li>}
              {rows.map((r, i) => (
                <li key={r.key} role="option" aria-selected={i === cursor}>
                  <button
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => onPick(r.choice)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left min-h-[48px] ${i === cursor ? "bg-brand-50 dark:bg-brand-700/20" : ""}`}
                  >
                    <span className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center flex-shrink-0">
                      <r.icon className="w-4 h-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-gray-900 dark:text-white truncate">{r.label}</span>
                      <span className="block text-[11px] text-gray-500 dark:text-gray-400 truncate">{r.hint}</span>
                    </span>
                    {r.placed && <span className="text-[10px] px-1.5 py-0.5 rounded-pill bg-gray-100 dark:bg-gray-800 text-gray-500">already in course</span>}
                    {r.draft && <span className="text-[10px] px-1.5 py-0.5 rounded-pill bg-warning-100 text-warning-700">draft</span>}
                  </button>
                </li>
              ))}
            </ul>
            <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-400 flex gap-3">
              <span>↑↓ move</span><span>↵ add</span><span>esc close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AddItemPalette;
