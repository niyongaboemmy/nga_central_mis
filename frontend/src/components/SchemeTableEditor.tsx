import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Sparkles,
  CloudUpload,
  Eye,
  Loader2,
  CheckCircle2,
  Plus,
  Trash2,
  CalendarOff,
  RotateCcw,
  Pencil,
  Check,
  Save,
  Trash,
  CornerDownRight,
} from "lucide-react";
import { schemeOfWorkApi, SchemeEntry, SchemeHeader } from "../api/schemeOfWork";
import { competenciesApi, SubjectCompetency } from "../api/curriculum";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { SchemeReportService } from "../services/SchemeReportService";
import SchemeReportPreviewModal from "./SchemeReportPreviewModal";

// Same visual language as the printed PDF (backend/src/services/schemeReportPdf.ts) so this
// editor reads as "the document itself, but editable" rather than a generic spreadsheet.
// The values themselves live in index.css under `.scheme-sheet` / `.dark .scheme-sheet`:
// inline hex could not follow Tailwind's class-based dark mode, which left the whole sheet
// printing dark ink onto a dark surface.
const INK = "var(--sheet-ink)";
const MUTED = "var(--sheet-muted)";
const RULE = "var(--sheet-rule)";
const RULE_STRONG = "var(--sheet-rule-strong)";
const TAN_SOFT = "var(--sheet-head-bg)";
const HEAD_INK = "var(--sheet-head-ink)";
const PAPER = "var(--sheet-paper)";
const PAPER_ALT = "var(--sheet-paper-alt)";

type TextField =
  | "topic"
  | "methodology"
  | "resources"
  | "evaluation"
  | "learning_place"
  | "observation";

const COLUMNS: { field: TextField; label: string; width: string; placeholder: string }[] = [
  { field: "topic", label: "Indicative Content (IC)", width: "18%", placeholder: "Topic / indicative content…" },
  { field: "methodology", label: "Learning Activities", width: "15%", placeholder: "e.g. Individual and Trainer guided" },
  { field: "resources", label: "Resources (Equipment, tools, materials)", width: "13%", placeholder: "e.g. Computer, projector, reference books" },
  { field: "evaluation", label: "Evidences of Formative Assessment", width: "13%", placeholder: "e.g. Individual quiz, homework" },
  { field: "learning_place", label: "Learning Place", width: "8%", placeholder: "Classroom" },
  { field: "observation", label: "Observation", width: "8%", placeholder: "Notes / remarks" },
];

const SKIPPED_MESSAGE = "Skipped / Holiday — no lesson scheduled this week";

/** Entries may store the week as "3" or already as "Week 3" — don't print "Week Week 3". */
const weekLabel = (weekNumber?: string | number | null): string => {
  const raw = String(weekNumber ?? "").trim();
  if (!raw) return "Week";
  return /^week\b/i.test(raw) ? raw.replace(/^week\b/i, "Week") : `Week ${raw}`;
};

/** "Week 12" / "12" / " 12 " -> 12. Entries store the label, not a number, so the old
 *  `Number(week_number)` produced NaN and Add Week posted an empty week_number, which the
 *  API rejects with "Required fields missing". */
const weekNumberOf = (weekNumber?: string | number | null): number | null => {
  const match = String(weekNumber ?? "").match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
};

const weekRangeLabel = (start?: string, end?: string): string => {
  if (!start || !end) return "";
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return "";
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${fmt(s)} to ${fmt(e)}/${e.getFullYear()}`;
};

/** Auto-growing textarea cell matching the PDF's compact typography. */
const EditableCell: React.FC<{
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}> = ({ value, placeholder, disabled, onCommit }) => {
  const [local, setLocal] = useState(value);
  const ta = useRef<HTMLTextAreaElement>(null);
  const initialRef = useRef(value);

  useEffect(() => {
    setLocal(value);
    initialRef.current = value;
  }, [value]);

  const resize = () => {
    if (ta.current) {
      ta.current.style.height = "auto";
      ta.current.style.height = `${ta.current.scrollHeight}px`;
    }
  };
  useEffect(resize, [local]);

  return (
    <textarea
      ref={ta}
      rows={1}
      value={local}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={() => { initialRef.current = local; }}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== initialRef.current) onCommit(local);
      }}
      className="w-full bg-transparent resize-none overflow-hidden text-[13px] leading-snug placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none disabled:cursor-not-allowed"
      style={{ minHeight: 22, color: INK }}
    />
  );
};

interface SchemeGroup {
  competencyId: number | null;
  rows: SchemeEntry[];
}

const groupByCompetency = (entries: SchemeEntry[]): SchemeGroup[] => {
  const groups: SchemeGroup[] = [];
  for (const entry of entries) {
    const cid = entry.competency_id ?? null;
    const last = groups[groups.length - 1];
    if (last && last.competencyId === cid && cid !== null) {
      last.rows.push(entry);
    } else {
      groups.push({ competencyId: cid, rows: [entry] });
    }
  }
  return groups;
};

interface CompetencePickerProps {
  options: SubjectCompetency[];
  currentId: number | null;
  onPick: (competencyId: number | null) => void;
  onClose: () => void;
}

const CompetencePicker: React.FC<CompetencePickerProps> = ({ options, currentId, onPick, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-20 top-full left-0 mt-1 w-72 max-h-64 overflow-y-auto bg-white/95 dark:bg-[#141b2b]/95 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-xl shadow-xl dark:shadow-[0_16px_50px_-12px_rgb(0_0_0/0.9)] p-1.5"
    >
      <button
        onClick={() => onPick(null)}
        className={`w-full text-left px-3 py-2 rounded-lg text-xs italic transition-colors ${
          currentId === null
            ? "bg-blue-50 dark:bg-blue-400/15 text-blue-700 dark:text-blue-300"
            : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.07]"
        }`}
      >
        No Learning Outcome linked
      </button>
      {options.map((c) => (
        <button
          key={c.competency_id}
          onClick={() => onPick(c.competency_id)}
          className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
            currentId === c.competency_id
              ? "bg-blue-50 dark:bg-blue-400/15 text-blue-700 dark:text-blue-300"
              : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.07]"
          }`}
        >
          <span className="font-semibold">Learning outcome {c.element_number}:</span> {c.title}
          {c.learning_hours ? (
            <span className="block text-[10px] text-gray-400 mt-0.5">{c.learning_hours} hours</span>
          ) : null}
        </button>
      ))}
      {options.length === 0 && (
        <p className="px-3 py-2 text-xs text-gray-400">No Learning Outcomes defined for this subject yet.</p>
      )}
    </div>
  );
};

interface Props {
  isOpen: boolean;
  entries: SchemeEntry[];
  scheme: SchemeHeader | null;
  subjectId: number;
  classGroupId: number;
  academicTermId: number;
  subjectName?: string;
  classGroupName?: string;
  /** Shown as a dismissible highlight banner at the top — e.g. right after AI generation or a
   * DOCX import completes, prompting the teacher to check the machine-produced content. */
  introMessage?: string;
  /** Called after the whole scheme is discarded from here, so the parent can drop its copy of
   * the entries and return the teacher to the create-scheme chooser. */
  onSchemeDeleted?: () => void;
  onClose: () => void;
}

const SchemeTableEditor: React.FC<Props> = ({
  isOpen,
  entries: initialEntries,
  scheme,
  subjectId,
  classGroupId,
  academicTermId,
  subjectName,
  classGroupName,
  introMessage,
  onSchemeDeleted,
  onClose,
}) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<SchemeEntry[]>(initialEntries);
  const [competencies, setCompetencies] = useState<SubjectCompetency[]>([]);
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [pickerForGroup, setPickerForGroup] = useState<number | null>(null); // group index
  const [showIntro, setShowIntro] = useState(!!introMessage);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isAddingWeek, setIsAddingWeek] = useState(false);
  const [isRemovingWeek, setIsRemovingWeek] = useState(false);
  const [insertingAfterId, setInsertingAfterId] = useState<number | null>(null);
  const [isDeletingScheme, setIsDeletingScheme] = useState(false);
  const [flashRowId, setFlashRowId] = useState<number | null>(null);
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});

  // Sync only when the editor (re)opens, so it owns its own state (with immediate per-field
  // autosave) while mounted rather than fighting a parent re-render mid-edit.
  useEffect(() => {
    if (isOpen) {
      setRows(initialEntries);
      setShowIntro(!!introMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !subjectId) return;
    competenciesApi
      .getAll(subjectId)
      .then((resp) => {
        setCompetencies([...(resp.data.data || [])].sort((a, b) => a.element_number - b.element_number));
      })
      .catch(() => setCompetencies([]));
  }, [isOpen, subjectId]);

  useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isOpen]);

  const groups = useMemo(() => groupByCompetency(rows), [rows]);

  const markSaving = (id: number, saving: boolean) => {
    setSavingIds((prev) => {
      const next = new Set(prev);
      if (saving) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const commitField = async (entryId: number, field: TextField, value: string) => {
    setRows((prev) => prev.map((r) => (r.entry_id === entryId ? { ...r, [field]: value } : r)));
    markSaving(entryId, true);
    try {
      await schemeOfWorkApi.updateEntry(entryId, { [field]: value });
    } catch (error: any) {
      showToast(error.response?.data?.message || "Couldn't save that change — please retry", "error");
    } finally {
      markSaving(entryId, false);
    }
  };

  const toggleSkip = async (entry: SchemeEntry) => {
    const nextStatus = entry.entry_status === "SKIPPED" ? "PLANNED" : "SKIPPED";
    setRows((prev) =>
      prev.map((r) => (r.entry_id === entry.entry_id ? { ...r, entry_status: nextStatus } : r)),
    );
    markSaving(entry.entry_id, true);
    try {
      await schemeOfWorkApi.updateEntry(entry.entry_id, { entry_status: nextStatus });
      showToast(
        nextStatus === "SKIPPED" ? "Marked as a skipped week" : "Restored — ready to fill in again",
        "success",
      );
    } catch (error: any) {
      showToast(error.response?.data?.message || "Couldn't update this week", "error");
      setRows((prev) =>
        prev.map((r) => (r.entry_id === entry.entry_id ? { ...r, entry_status: entry.entry_status } : r)),
      );
    } finally {
      markSaving(entry.entry_id, false);
    }
  };

  const assignGroupCompetency = async (group: SchemeGroup, competencyId: number | null) => {
    setPickerForGroup(null);
    const ids = group.rows.map((r) => r.entry_id);
    setRows((prev) =>
      prev.map((r) =>
        ids.includes(r.entry_id)
          ? {
              ...r,
              competency_id: competencyId,
              competency: competencyId
                ? (() => {
                    const c = competencies.find((c) => c.competency_id === competencyId);
                    return c
                      ? {
                          competency_id: c.competency_id,
                          element_number: c.element_number,
                          title: c.title,
                          learning_hours: c.learning_hours,
                        }
                      : r.competency;
                  })()
                : null,
            }
          : r,
      ),
    );
    ids.forEach((id) => markSaving(id, true));
    try {
      await Promise.all(ids.map((id) => schemeOfWorkApi.assignEntryCompetency(id, competencyId)));
      showToast("Learning Outcome updated", "success");
    } catch (error: any) {
      showToast(error.response?.data?.message || "Couldn't update the Learning Outcome", "error");
    } finally {
      ids.forEach((id) => markSaving(id, false));
    }
  };

  const handleRemoveWeek = async (entry: SchemeEntry) => {
    const ok = await confirm({
      title: `Remove ${weekLabel(entry.week_number)}?`,
      message: "This permanently deletes the week and any lesson plans logged against it.",
      details: ["The following weeks keep their own numbers and dates."],
      confirmText: "Remove week",
    });
    if (!ok) return;
    const entryId = entry.entry_id;
    setIsRemovingWeek(true);
    try {
      await schemeOfWorkApi.deleteEntry(entryId);
      setRows((prev) => prev.filter((r) => r.entry_id !== entryId));
      showToast("Week removed", "success");
    } catch (error: any) {
      showToast(error.response?.data?.message || "Couldn't remove this week", "error");
    } finally {
      setIsRemovingWeek(false);
    }
  };

  /** Re-reads the scheme after an operation the server reshuffles (insert renumbers and
   *  reschedules every following week), so the sheet never shows stale week numbers. */
  const reloadRows = async () => {
    try {
      const resp = await schemeOfWorkApi.getEntries(subjectId, classGroupId, academicTermId);
      const raw = (resp.data as any).data;
      const list: SchemeEntry[] = Array.isArray(raw) ? raw : raw?.entries || [];
      setRows(list);
      return list;
    } catch {
      return null;
    }
  };

  /** Scrolls a newly created week into view and pulses it, so "Add Week" has a visible result
   *  even 15 rows down the sheet. */
  const revealRow = (entryId: number) => {
    setFlashRowId(entryId);
    window.setTimeout(() => {
      rowRefs.current[entryId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    window.setTimeout(() => setFlashRowId((id) => (id === entryId ? null : id)), 2200);
  };

  const handleInsertAfter = async (afterEntryId: number) => {
    setInsertingAfterId(afterEntryId);
    try {
      // The insert endpoint requires a topic, and renumbers/reschedules everything after the
      // insertion point — so re-read rather than splicing locally.
      const res = await schemeOfWorkApi.insertEntry({
        subject_id: subjectId,
        class_group_id: classGroupId,
        academic_term_id: academicTermId,
        after_entry_id: afterEntryId,
        topic: "New topic",
      });
      const newId = res.data?.data?.entry_id;
      await reloadRows();
      if (newId) revealRow(newId);
      showToast("Week inserted — the following weeks were rescheduled", "success");
    } catch (error: any) {
      showToast(error.response?.data?.message || "Couldn't insert a week here", "error");
    } finally {
      setInsertingAfterId(null);
    }
  };

  const handleDeleteScheme = async () => {
    if (!scheme?.scheme_id) {
      showToast("There's no saved scheme to delete yet", "warning");
      return;
    }
    const ok = await confirm({
      title: "Discard this scheme of work?",
      message: `This permanently deletes all ${rows.length} weekly ${
        rows.length === 1 ? "entry" : "entries"
      } for ${subjectName || "this subject"}${classGroupName ? ` — ${classGroupName}` : ""}.`,
      details: [
        "Their lesson plans go with them.",
        "The e-learning course built on this scheme is deleted, along with students' progress in it.",
        "You'll start over from the create options. This cannot be undone.",
      ],
      confirmText: "Delete scheme",
      confirmationPhrase: "delete",
    });
    if (!ok) return;
    setIsDeletingScheme(true);
    try {
      await schemeOfWorkApi.deleteScheme(scheme.scheme_id);
      showToast("Scheme of work deleted — start over whenever you're ready", "success");
      setRows([]);
      onSchemeDeleted?.();
      onClose();
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Couldn't delete this scheme of work",
        "error",
      );
    } finally {
      setIsDeletingScheme(false);
    }
  };

  const handleAddWeek = async () => {
    setIsAddingWeek(true);
    try {
      const last = rows[rows.length - 1];
      let startDate = new Date();
      let weekNumber = "Week 1";
      if (last) {
        const lastEnd = new Date(last.end_date);
        lastEnd.setDate(lastEnd.getDate() + 3); // skip the weekend
        startDate = lastEnd;
        const n = weekNumberOf(last.week_number);
        weekNumber = `Week ${n !== null ? n + 1 : rows.length + 1}`;
      }
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 4);
      const iso = (d: Date) => d.toISOString().split("T")[0];

      const res = await schemeOfWorkApi.addEntry({
        subject_id: subjectId,
        class_group_id: classGroupId,
        academic_term_id: academicTermId,
        week_number: weekNumber,
        start_date: iso(startDate),
        end_date: iso(endDate),
        topic: "",
        sub_topic: "",
        objective: "",
        methodology: "",
        resources: "",
        evaluation: "",
        entry_status: "PLANNED",
      } as any);
      const newId = res.data?.data?.entry_id;
      const newEntry: SchemeEntry = {
        entry_id: newId,
        scheme_id: scheme?.scheme_id || 0,
        week_number: weekNumber,
        start_date: iso(startDate),
        end_date: iso(endDate),
        topic: "",
        sub_topic: "",
        objective: "",
        methodology: "",
        resources: "",
        evaluation: "",
        is_completed: false,
        entry_status: "PLANNED",
        validation_status: "PENDING",
        validation_comment: null,
        created_at: new Date().toISOString(),
        competency_id: null,
      };
      setRows((prev) => [...prev, newEntry]);
      if (newId) revealRow(newId);
      showToast("Week added", "success");
    } catch (error: any) {
      showToast(error.response?.data?.message || "Couldn't add a new week", "error");
    } finally {
      setIsAddingWeek(false);
    }
  };

  const openPreview = async () => {
    if (!scheme?.scheme_id) {
      showToast("Nothing to preview yet", "warning");
      return;
    }
    setIsGeneratingPreview(true);
    try {
      const url = await SchemeReportService.getPreviewBlobUrl(scheme.scheme_id);
      setPreviewUrl(url);
      setIsPreviewOpen(true);
    } catch (error: any) {
      showToast(error.response?.data?.message || "Failed to generate PDF preview", "error");
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const closePreview = () => {
    setIsPreviewOpen(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  const handleDownload = async () => {
    if (!scheme?.scheme_id) return;
    try {
      await SchemeReportService.downloadPdf(scheme.scheme_id, `Scheme_of_Work_${subjectName || scheme.scheme_id}`);
      showToast("PDF downloaded", "success");
    } catch (error: any) {
      showToast(error.response?.data?.message || "Download failed", "error");
    }
  };

  if (!isOpen) return null;

  const isSaving = savingIds.size > 0;

  return (
    <div className="scheme-sheet fixed inset-0 z-50 flex flex-col" style={{ background: "var(--sheet-shell)" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-white/10 bg-white/85 dark:bg-[#0b0f19]/85 backdrop-blur-xl sticky top-0 z-10 shadow-sm dark:shadow-[0_1px_0_0_rgb(255_255_255/0.04)]">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors flex-shrink-0"
            title="Close editor"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white truncate">
              Review &amp; Edit — {subjectName || "Scheme of Work"}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {classGroupName ? `${classGroupName} · ` : ""}
              {rows.length} week{rows.length === 1 ? "" : "s"} · looks like the printed document, edited live
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div
            className={`hidden sm:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
              isSaving
                ? "text-amber-600 bg-amber-50 ring-1 ring-amber-200/70 dark:text-amber-300 dark:bg-amber-400/10 dark:ring-amber-400/20"
                : "text-emerald-600 bg-emerald-50 ring-1 ring-emerald-200/70 dark:text-emerald-300 dark:bg-emerald-400/10 dark:ring-emerald-400/20"
            }`}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3 h-3" /> All changes saved
              </>
            )}
          </div>
          <button
            onClick={openPreview}
            disabled={isGeneratingPreview}
            className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-400/10 border border-blue-200 dark:border-blue-400/25 rounded-full hover:bg-blue-100 dark:hover:bg-blue-400/20 hover:-translate-y-px active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 transition-all disabled:opacity-60 disabled:translate-y-0"
          >
            {isGeneratingPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            Preview PDF
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-full transition-all shadow-sm shadow-blue-500/30 hover:shadow-md hover:shadow-blue-500/40 hover:-translate-y-px active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
          >
            <Save className="w-4 h-4" />
            Done
          </button>
        </div>
      </div>

      {/* Intro banner */}
      <AnimatePresence>
        {showIntro && introMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mx-4 sm:mx-6 mt-4 p-4 rounded-2xl bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-500/[0.12] dark:to-blue-500/[0.10] border border-violet-200 dark:border-violet-400/20 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm shadow-violet-500/30">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{introMessage}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Click any cell to edit it — changes save automatically. Use "Preview PDF" any time to see exactly
                  how it will look printed.
                </p>
              </div>
              <button
                onClick={() => setShowIntro(false)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 py-4">
        <div
          className="rounded-2xl overflow-hidden border shadow-sm dark:shadow-[0_10px_40px_-18px_rgb(0_0_0/0.9)]"
          style={{ borderColor: RULE, background: PAPER }}
        >
          <table className="w-full border-collapse text-left" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "9%" }} />
              <col style={{ width: "20%" }} />
              {COLUMNS.map((c) => (
                <col key={c.field} style={{ width: c.width }} />
              ))}
              <col style={{ width: "44px" }} />
            </colgroup>
            <thead>
              <tr>
                <th
                  className="px-2 py-2 text-[10px] font-bold uppercase tracking-wide sticky top-0 z-[5]"
                  style={{ background: TAN_SOFT, color: HEAD_INK, borderBottom: `1px solid ${RULE_STRONG}` }}
                >
                  Weeks
                </th>
                <th
                  className="px-2 py-2 text-[10px] font-bold uppercase tracking-wide sticky top-0 z-[5]"
                  style={{ background: TAN_SOFT, color: HEAD_INK, borderBottom: `1px solid ${RULE_STRONG}` }}
                >
                  Competence code and name
                </th>
                {COLUMNS.map((c) => (
                  <th
                    key={c.field}
                    className="px-2 py-2 text-[10px] font-bold uppercase tracking-wide sticky top-0 z-[5]"
                    style={{ background: TAN_SOFT, color: HEAD_INK, borderBottom: `1px solid ${RULE_STRONG}` }}
                  >
                    {c.label}
                  </th>
                ))}
                <th
                  className="sticky top-0 z-[5]"
                  style={{ background: TAN_SOFT, borderBottom: `1px solid ${RULE_STRONG}` }}
                />
              </tr>
            </thead>
            <tbody>
              {groups.map((group, groupIndex) => {
                const isSkippedGroup = group.rows.length === 1 && group.rows[0].entry_status === "SKIPPED";
                return group.rows.map((entry, rowIndexInGroup) => {
                  const isGroupStart = rowIndexInGroup === 0;
                  const skipped = entry.entry_status === "SKIPPED";
                  const rowSaving = savingIds.has(entry.entry_id);

                  return (
                    <tr
                      key={entry.entry_id}
                      ref={(el) => {
                        rowRefs.current[entry.entry_id] = el;
                      }}
                      className={`scheme-row${isGroupStart ? " scheme-group-start border-t-2" : ""}${
                        flashRowId === entry.entry_id ? " scheme-row-flash" : ""
                      }`}
                      style={{
                        borderTopColor: isGroupStart ? RULE_STRONG : undefined,
                        background: rowIndexInGroup % 2 === 1 ? PAPER_ALT : PAPER,
                      }}
                    >
                      <td
                        className="align-top px-2 py-2 text-[11px] font-semibold"
                        style={{ borderRight: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}`, color: INK }}
                      >
                        {weekLabel(entry.week_number)}
                        <div className="text-[10px] font-normal mt-0.5" style={{ color: MUTED }}>
                          {weekRangeLabel(entry.start_date, entry.end_date)}
                        </div>
                      </td>

                      {isGroupStart && (
                        <td
                          rowSpan={isSkippedGroup ? 1 : group.rows.length}
                          className="align-top px-2 py-2 relative group/comp"
                          style={{ borderRight: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}
                        >
                          {entry.competency_id ? (
                            <div className="text-[11px]">
                              <span className="font-semibold" style={{ color: INK }}>
                                Learning outcome {entry.competency?.element_number ?? ""}:
                              </span>{" "}
                              <span style={{ color: INK }}>{entry.competency?.title}</span>
                              {entry.competency?.learning_hours ? (
                                <div className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                                  Duration: {entry.competency.learning_hours} hours
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-[11px] italic" style={{ color: MUTED }}>
                              No Learning Outcome linked
                            </span>
                          )}
                          <button
                            onClick={() => setPickerForGroup(pickerForGroup === groupIndex ? null : groupIndex)}
                            className="absolute top-1.5 right-1.5 p-1 rounded-md text-gray-400 dark:text-gray-500 opacity-0 group-hover/comp:opacity-100 focus-visible:opacity-100 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 transition-all"
                            title="Change Learning Outcome for this group"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          {pickerForGroup === groupIndex && (
                            <CompetencePicker
                              options={competencies}
                              currentId={entry.competency_id ?? null}
                              onPick={(id) => assignGroupCompetency(group, id)}
                              onClose={() => setPickerForGroup(null)}
                            />
                          )}
                        </td>
                      )}

                      {skipped ? (
                        <td
                          colSpan={COLUMNS.length}
                          className="align-middle px-3 py-3 text-center text-[12px] italic"
                          style={{
                            background: "var(--sheet-skip-bg)",
                            color: MUTED,
                            borderBottom: `1px solid ${RULE}`,
                          }}
                        >
                          {SKIPPED_MESSAGE}
                        </td>
                      ) : (
                        COLUMNS.map((c) => (
                          <td
                            key={c.field}
                            className="scheme-cell align-top px-2 py-2"
                            style={{ borderRight: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}
                          >
                            <EditableCell
                              value={(entry[c.field] as string) || ""}
                              placeholder={c.placeholder}
                              onCommit={(v) => commitField(entry.entry_id, c.field, v)}
                            />
                          </td>
                        ))
                      )}

                      <td
                        className="align-top px-1 py-2 text-center"
                        style={{ borderBottom: `1px solid ${RULE}` }}
                      >
                        <div className="flex flex-col items-center gap-1">
                          {rowSaving ? (
                            <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                          ) : (
                            <>
                              <button
                                onClick={() => toggleSkip(entry)}
                                title={skipped ? "Restore this week" : "Mark as skipped/holiday"}
                                className="p-1 rounded-md text-gray-400 dark:text-gray-500 hover:text-amber-600 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-400/15 hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 transition-all"
                              >
                                {skipped ? <RotateCcw className="w-3.5 h-3.5" /> : <CalendarOff className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => handleInsertAfter(entry.entry_id)}
                                disabled={insertingAfterId !== null}
                                title="Insert a new week below this one"
                                className="p-1 rounded-md text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-400/15 hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 transition-all disabled:opacity-40"
                              >
                                {insertingAfterId === entry.entry_id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <CornerDownRight className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                onClick={() => handleRemoveWeek(entry)}
                                disabled={isRemovingWeek}
                                title="Remove this week"
                                className="p-1 rounded-md text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-400/15 hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 transition-all"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <div
            className="mt-4 rounded-2xl border border-dashed p-10 text-center"
            style={{ borderColor: RULE_STRONG }}
          >
            <p className="text-sm font-semibold" style={{ color: INK }}>
              This scheme has no weeks left
            </p>
            <p className="text-xs mt-1" style={{ color: MUTED }}>
              Add one below, or discard the scheme and start again from the create options.
            </p>
          </div>
        )}

        <button
          onClick={handleAddWeek}
          disabled={isAddingWeek}
          className="mt-4 flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-400/10 border border-dashed border-blue-300 dark:border-blue-400/30 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-400/20 hover:border-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 transition-all disabled:opacity-60"
        >
          {isAddingWeek ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add Week
        </button>
      </div>

      {/* Bottom action bar */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-gray-200 dark:border-white/10 bg-white/85 dark:bg-[#0b0f19]/85 backdrop-blur-xl">
        <div className="flex items-center gap-3 min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
            <CloudUpload className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
            Every change is saved instantly — there's nothing to submit.
          </p>
          <button
            onClick={handleDeleteScheme}
            disabled={isDeletingScheme}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-400/10 border border-red-200 dark:border-red-400/25 rounded-full hover:bg-red-100 dark:hover:bg-red-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 transition-all"
          >
            <Trash className="w-3.5 h-3.5" />
            Discard scheme
          </button>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={handleDownload}
            className="px-4 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-200 bg-gray-50 dark:bg-white/[0.06] border border-gray-200 dark:border-white/10 rounded-full hover:bg-gray-100 dark:hover:bg-white/[0.12] hover:-translate-y-px active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/50 transition-all"
          >
            Download PDF
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-full transition-all shadow-sm shadow-blue-500/30 hover:shadow-lg hover:shadow-blue-500/40 hover:-translate-y-px active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
          >
            <Check className="w-4 h-4" />
            Looks Good — Continue
          </button>
        </div>
      </div>


      <SchemeReportPreviewModal
        isOpen={isPreviewOpen}
        onClose={closePreview}
        pdfUrl={previewUrl}
        onDownload={handleDownload}
      />

    </div>
  );
};

export default SchemeTableEditor;
