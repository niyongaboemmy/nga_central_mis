import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  Save,
  Wand2,
  Loader2,
  Calendar,
  CheckCircle2,
  Copy,
  ArrowLeft,
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp,
  GripVertical,
  BookOpen,
  X,
} from "lucide-react";
import { schemeOfWorkApi } from "../api/schemeOfWork";
import { competenciesApi, SubjectCompetency } from "../api/curriculum";
import { useToast } from "../contexts/ToastContext";
import SelectField from "./ui/SelectField";

/* ─── Types ─────────────────────────────────────────────────────────── */
interface WeekRow {
  id: string;
  week_number: string;
  start_date: string;
  end_date: string;
  duration: string;
  topic: string;        // IC – main
  sub_topic: string;    // IC – sub
  methodology: string;  // Learning Activities
  resources: string;    // Resources
  evaluation: string;   // Evidences of formative assessment
  learning_place: string;
  observation: string;
}

interface LOGroup {
  id: string;
  objective: string;  // Learning Outcome (LO) — shared across all rows in this group
  collapsed: boolean;
  rows: WeekRow[];
  // Optional link to the subject's real Curriculum Learning Outcome (SubjectCompetency) — sets
  // competency_id on every row in this group, which is what the PDF/report's "Competence code
  // and name" grouping and total-duration display key on. Independent of the free-text
  // `objective` above (kept as-is for backward compatibility / documents that just want a
  // written LO title with no Curriculum link).
  competency_id: number | null;
}

interface Props {
  subjectId: number;
  classGroupId: number;
  academicTermId: number;
  subjectName?: string;
  classGroupName?: string;
  termName?: string;
  onComplete: () => void;
  onCancel: () => void;
}

/* ─── Helpers ───────────────────────────────────────────────────────── */
const uid = () => Math.random().toString(36).slice(2, 9);

const emptyWeek = (weekNum = "", sd = "", ed = ""): WeekRow => ({
  id: uid(),
  week_number: weekNum,
  start_date: sd,
  end_date: ed,
  duration: "3 hours",
  topic: "",
  sub_topic: "",
  methodology: "",
  resources: "Computer, Projector, Reference books",
  evaluation: "",
  learning_place: "Classroom",
  observation: "",
});

const emptyGroup = (loNum = 1): LOGroup => ({
  id: uid(),
  objective: `Learning outcome ${loNum}: `,
  collapsed: false,
  rows: [emptyWeek()],
  competency_id: null,
});

function nextWorkweek(endDate: string): { start: string; end: string } {
  const d = new Date(endDate);
  d.setDate(d.getDate() + 3);
  const day = d.getDay();
  if (day !== 1) d.setDate(d.getDate() + ((1 - day + 7) % 7));
  const s = d.toISOString().split("T")[0];
  d.setDate(d.getDate() + 4);
  return { start: s, end: d.toISOString().split("T")[0] };
}

/* ─── Week column definitions (LO is at group level, not per-row) ───── */
interface ColDef {
  key: keyof Omit<WeekRow, "id">;
  label: string;
  sub?: string;
  minW: number;
  required?: boolean;
  type?: "week" | "date" | "short" | "text";
  placeholder?: string;
}

const WEEK_COLS: ColDef[] = [
  { key: "week_number",  label: "Weeks",      sub: "Week #",                   minW: 62,  required: true, type: "week",  placeholder: "1" },
  { key: "start_date",   label: "Dates",      sub: "Start",                    minW: 128, required: true, type: "date" },
  { key: "end_date",     label: "",           sub: "End",                      minW: 128, required: true, type: "date" },
  { key: "duration",     label: "Duration",   sub: "",                         minW: 84,  type: "short",  placeholder: "3 hours" },
  { key: "topic",        label: "Indicative Content (IC)", sub: "Topic",       minW: 220, required: true, placeholder: "e.g. Working with Symbol" },
  { key: "sub_topic",    label: "",           sub: "Sub-topic",                minW: 190, placeholder: "e.g. Creating reusable design elements…" },
  { key: "methodology",  label: "Learning Activities", sub: "",               minW: 160, placeholder: "e.g. Individual and Trainer guided" },
  { key: "resources",    label: "Resources",  sub: "Equipment, tools & materials", minW: 170, placeholder: "e.g. Computer, Projector, Reference books" },
  { key: "evaluation",   label: "Evidences of Formative Assessment", sub: "", minW: 185, placeholder: "e.g. Individual Quiz, Homework" },
  { key: "learning_place", label: "Learning Place", sub: "",                  minW: 115, placeholder: "Classroom" },
  { key: "observation",  label: "Observation", sub: "",                        minW: 130, placeholder: "Notes / remarks" },
];

/* ─── Inline cell ───────────────────────────────────────────────────── */
const Cell: React.FC<{
  col: ColDef;
  value: string;
  onChange: (v: string) => void;
}> = ({ col, value, onChange }) => {
  const ta = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    if (ta.current) {
      ta.current.style.height = "auto";
      ta.current.style.height = ta.current.scrollHeight + "px";
    }
  };
  const base = "w-full bg-transparent text-sm text-gray-100 placeholder-gray-600 focus:outline-none";

  if (col.type === "date")
    return (
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ colorScheme: "dark" }}
        className={`${base} cursor-pointer`} />
    );

  if (col.type === "week")
    return (
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={col.placeholder} maxLength={3}
        className={`${base} text-center font-bold text-blue-400 placeholder-gray-700`} />
    );

  if (col.type === "short")
    return (
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={col.placeholder}
        className={`${base} text-center placeholder-gray-700`} />
    );

  return (
    <textarea ref={ta} rows={1} value={value} placeholder={col.placeholder ?? "—"}
      onChange={(e) => { onChange(e.target.value); resize(); }}
      onFocus={resize}
      className={`${base} resize-none overflow-hidden leading-relaxed`}
      style={{ minHeight: 24 }} />
  );
};

/* ─── Main component ─────────────────────────────────────────────────── */
const SchemeManualEntry: React.FC<Props> = ({
  subjectId, classGroupId, academicTermId,
  subjectName, classGroupName, termName,
  onComplete, onCancel,
}) => {
  const { showToast } = useToast();

  const [groups, setGroups] = useState<LOGroup[]>([emptyGroup(1)]);
  // The subject's existing Curriculum Learning Outcomes, offered as an optional link per group —
  // fetched once per subject, not re-fetched on every group add/remove.
  const [subjectCompetencies, setSubjectCompetencies] = useState<SubjectCompetency[]>([]);

  useEffect(() => {
    let cancelled = false;
    competenciesApi
      .getAll(subjectId)
      .then((resp) => {
        if (!cancelled) {
          setSubjectCompetencies(
            [...(resp.data.data || [])].sort((a, b) => a.element_number - b.element_number),
          );
        }
      })
      .catch(() => {
        /* non-fatal: LO linking simply won't be offered */
      });
    return () => {
      cancelled = true;
    };
  }, [subjectId]);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  /* Wizard */
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStart, setWizardStart] = useState("");
  const [wizardWeeks, setWizardWeeks] = useState(13);

  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* ── Derived stats ── */
  const allRows = groups.flatMap((g) => g.rows);
  const totalWeeks = allRows.length;
  const filledWeeks = allRows.filter((r) => r.topic.trim()).length;
  const progress = totalWeeks ? (filledWeeks / totalWeeks) * 100 : 0;
  const hasUnsaved = allRows.some((r) => r.topic || r.week_number);

  /* ── Last row across all groups for date continuation ── */
  const lastRow = (): WeekRow | null => {
    for (let gi = groups.length - 1; gi >= 0; gi--) {
      const rows = groups[gi].rows;
      if (rows.length > 0) return rows[rows.length - 1];
    }
    return null;
  };

  const nextWeekNumber = (): string => {
    const last = lastRow();
    if (last?.week_number && !isNaN(Number(last.week_number)))
      return String(Number(last.week_number) + 1);
    return "";
  };

  const nextDates = (): { sd: string; ed: string } => {
    const last = lastRow();
    if (last?.end_date) {
      const nw = nextWorkweek(last.end_date);
      return { sd: nw.start, ed: nw.end };
    }
    return { sd: "", ed: "" };
  };

  /* ── Group mutations ── */
  const updateGroupLO = (gid: string, value: string) =>
    setGroups((prev) => prev.map((g) => g.id === gid ? { ...g, objective: value } : g));

  const updateGroupCompetency = (gid: string, value: string) =>
    setGroups((prev) =>
      prev.map((g) =>
        g.id === gid ? { ...g, competency_id: value ? parseInt(value, 10) : null } : g,
      ),
    );

  const toggleCollapse = (gid: string) =>
    setGroups((prev) => prev.map((g) => g.id === gid ? { ...g, collapsed: !g.collapsed } : g));

  const removeGroup = (gid: string) =>
    setGroups((prev) => prev.filter((g) => g.id !== gid));

  const addGroup = () => {
    const loNum = groups.length + 1;
    const { sd, ed } = nextDates();
    const wn = nextWeekNumber();
    setGroups((prev) => [
      ...prev,
      { id: uid(), objective: `Learning outcome ${loNum}: `, collapsed: false,
        rows: [emptyWeek(wn, sd, ed)], competency_id: null },
    ]);
    setTimeout(() => bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" }), 80);
  };

  /* ── Row mutations ── */
  const updateRow = useCallback((gid: string, rid: string, field: keyof WeekRow, value: string) =>
    setGroups((prev) => prev.map((g) =>
      g.id !== gid ? g : {
        ...g,
        rows: g.rows.map((r) => r.id === rid ? { ...r, [field]: value } : r),
      }
    )), []);

  const addRow = (gid: string) => {
    setGroups((prev) => prev.map((g) => {
      if (g.id !== gid) return g;
      const last = g.rows[g.rows.length - 1];
      const wn = last?.week_number && !isNaN(Number(last.week_number))
        ? String(Number(last.week_number) + 1) : nextWeekNumber();
      let sd = "", ed = "";
      if (last?.end_date) { const nw = nextWorkweek(last.end_date); sd = nw.start; ed = nw.end; }
      else { const nd = nextDates(); sd = nd.sd; ed = nd.ed; }
      return { ...g, rows: [...g.rows, emptyWeek(wn, sd, ed)] };
    }));
  };

  const duplicateRow = (gid: string, rid: string) =>
    setGroups((prev) => prev.map((g) => {
      if (g.id !== gid) return g;
      const idx = g.rows.findIndex((r) => r.id === rid);
      if (idx === -1) return g;
      const copy = { ...g.rows[idx], id: uid(),
        week_number: g.rows[idx].week_number ? String(Number(g.rows[idx].week_number) + 1) : "" };
      return { ...g, rows: [...g.rows.slice(0, idx + 1), copy, ...g.rows.slice(idx + 1)] };
    }));

  const removeRow = (gid: string, rid: string) =>
    setGroups((prev) => prev.map((g) =>
      g.id !== gid ? g :
      g.rows.length === 1 ? g : // keep at least one row per group
      { ...g, rows: g.rows.filter((r) => r.id !== rid) }
    ));

  /* ── Wizard: distributes weeks across existing groups proportionally ── */
  const applyWizard = () => {
    if (!wizardStart || wizardWeeks < 1) return;
    let cursor = new Date(wizardStart);
    const day = cursor.getDay();
    if (day !== 1) cursor.setDate(cursor.getDate() + ((1 - day + 7) % 7));

    // Build flat list of (wn, sd, ed) for all weeks
    const dates = Array.from({ length: wizardWeeks }, (_, i) => {
      const sd = cursor.toISOString().split("T")[0];
      const end = new Date(cursor);
      end.setDate(end.getDate() + 4);
      cursor.setDate(cursor.getDate() + 7);
      return { wn: String(i + 1), sd, ed: end.toISOString().split("T")[0] };
    });

    // Apply dates to existing rows in order, then fill new empty rows
    let flat: WeekRow[] = [];
    groups.forEach((g) => g.rows.forEach((r) => flat.push(r)));

    setGroups((prev) => {
      let di = 0;
      return prev.map((g) => ({
        ...g,
        rows: g.rows.map((r) => {
          if (di >= dates.length) return r;
          const d = dates[di++];
          return { ...r, week_number: d.wn, start_date: d.sd, end_date: d.ed };
        }),
      }));
    });

    setShowWizard(false);
    showToast(`${wizardWeeks} week dates applied — existing content preserved!`, "success");
  };

  /* ── Save ── */
  const validate = (): string | null => {
    for (const g of groups) {
      if (!g.objective.trim()) return `An LO group has no Learning Outcome text`;
      for (const r of g.rows) {
        if (!r.week_number.trim()) return `Week # missing in "${g.objective.slice(0, 30)}…"`;
        if (!r.start_date || !r.end_date) return `Dates missing for week ${r.week_number}`;
        if (!r.topic.trim()) return `Indicative Content missing for week ${r.week_number}`;
      }
    }
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) { showToast(err, "error"); return; }

    setSaving(true);
    setSavedCount(0);
    let saved = 0;
    const errors: string[] = [];

    for (const g of groups) {
      for (const row of g.rows) {
        try {
          await schemeOfWorkApi.addEntry({
            subject_id: subjectId,
            class_group_id: classGroupId,
            academic_term_id: academicTermId,
            week_number: row.week_number,
            start_date: row.start_date,
            end_date: row.end_date,
            objective: g.objective,   // LO from group header
            competency_id: g.competency_id,
            duration: row.duration,
            topic: row.topic,
            sub_topic: row.sub_topic,
            methodology: row.methodology,
            resources: row.resources,
            evaluation: row.evaluation,
            learning_place: row.learning_place,
            observation: row.observation,
          });
          saved++;
          setSavedCount(saved);
        } catch (e: any) {
          errors.push(`Week ${row.week_number}: ${e.response?.data?.message ?? "failed"}`);
        }
      }
    }

    setSaving(false);
    if (errors.length) {
      showToast(`${saved} saved · ${errors.length} failed — ${errors[0]}`, "error");
    } else {
      showToast(`All ${saved} weeks saved successfully!`, "success");
      onComplete();
    }
  };

  /* ─────────────────────────────── Render ──────────────────────────── */
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col bg-[#0d1117]"
    >
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-white/[0.07] bg-[#161b22]">
        <div className="flex items-center gap-4 px-5 py-3">
          <button
            onClick={() => hasUnsaved ? setConfirmDiscard(true) : onCancel()}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <div className="h-4 w-px bg-white/10" />

          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2 text-sm">
            {subjectName && <span className="font-semibold text-white truncate">{subjectName}</span>}
            {classGroupName && <><span className="text-white/20">·</span><span className="text-gray-400">{classGroupName}</span></>}
            {termName && <><span className="text-white/20">·</span><span className="text-gray-400">{termName}</span></>}
            <span className="text-white/20">·</span>
            <span className="text-gray-600 text-xs">Scheme of Work Editor</span>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              onClick={() => setShowWizard((v) => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                showWizard
                  ? "bg-violet-600/25 text-violet-300 border border-violet-500/40"
                  : "text-gray-400 hover:text-white border border-white/10 hover:bg-white/5"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" /> Auto-fill dates
            </button>

            <button
              onClick={handleSave}
              disabled={saving || totalWeeks === 0}
              className="flex items-center gap-2 px-4 py-1.5 text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white rounded-lg shadow-lg shadow-emerald-500/20 transition-all"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" />{savedCount}/{totalWeeks}</>
                : <><Save className="w-4 h-4" />Save {totalWeeks} week{totalWeeks !== 1 ? "s" : ""}</>}
            </button>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-4 px-5 pb-2.5">
          <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <motion.div
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4 }}
              className={`h-full rounded-full ${progress === 100 ? "bg-emerald-400" : progress > 60 ? "bg-blue-400" : "bg-indigo-500"}`}
            />
          </div>
          <span className="text-xs text-gray-600 whitespace-nowrap">
            {groups.length} LO{groups.length !== 1 ? "s" : ""} · {filledWeeks}/{totalWeeks} weeks filled
          </span>
          {filledWeeks === totalWeeks && totalWeeks > 0 && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Ready to save
            </motion.span>
          )}
        </div>
      </div>

      {/* ── Wizard ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showWizard && (
          <motion.div key="wizard"
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ overflow: "hidden", flexShrink: 0 }}
          >
            <div className="border-b border-white/[0.07] bg-violet-950/40 px-5 py-4">
              <div className="flex flex-wrap items-end gap-5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-semibold text-violet-300">Auto-fill week date ranges</span>
                </div>
                <div className="flex flex-wrap gap-4 items-end">
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1 uppercase tracking-wide">Term start date</label>
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                      <input type="date" value={wizardStart} onChange={(e) => setWizardStart(e.target.value)}
                        style={{ colorScheme: "dark" }}
                        className="pl-8 pr-3 py-1.5 text-sm bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1 uppercase tracking-wide">Total weeks</label>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setWizardWeeks((v) => Math.max(1, v - 1))} className="w-7 h-7 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-400 hover:text-white transition-colors text-lg leading-none">−</button>
                      <span className="w-8 text-center text-sm font-bold text-white">{wizardWeeks}</span>
                      <button onClick={() => setWizardWeeks((v) => Math.min(52, v + 1))} className="w-7 h-7 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-400 hover:text-white transition-colors text-lg leading-none">+</button>
                    </div>
                  </div>
                  <button onClick={applyWizard} disabled={!wizardStart}
                    className="flex items-center gap-2 px-4 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-all">
                    <Wand2 className="w-4 h-4" /> Fill {wizardWeeks} weeks
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-600 mt-2.5 flex items-center gap-1.5">
                <Info className="w-3 h-3 shrink-0" />
                Dates snap to Mon–Fri. Topic content is preserved. Only week #, start & end dates are updated.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div ref={bodyRef} className="flex-1 overflow-auto px-5 py-5 space-y-4">

        {/* Column legend — shown once at top */}
        <div className="overflow-x-auto">
          <table className="border-collapse w-full" style={{ minWidth: 1400 }}>
            <thead>
              <tr className="bg-[#161b22] rounded-xl">
                <th className="w-8 rounded-tl-xl" />
                {WEEK_COLS.map((col, i) => (
                  <th key={col.key} style={{ minWidth: col.minW }}
                    className={`px-3 py-2 text-left ${i === WEEK_COLS.length - 1 ? "rounded-tr-xl" : ""}`}>
                    {col.label && (
                      <span className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-tight">
                        {col.label}{col.required && <span className="text-red-500 ml-0.5">*</span>}
                      </span>
                    )}
                    {col.sub && (
                      <span className="block text-[9px] text-gray-600 mt-0.5">{col.sub}</span>
                    )}
                  </th>
                ))}
                <th className="w-14 rounded-tr-xl" />
              </tr>
            </thead>
          </table>
        </div>

        {/* ── LO Groups ── */}
        <AnimatePresence initial={false}>
          {groups.map((group, gi) => (
            <motion.div
              key={group.id}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 60, height: 0 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl border border-white/[0.08] overflow-hidden"
            >
              {/* ── Group header (Learning Outcome) ── */}
              <div className="flex items-center gap-3 px-4 py-3 bg-[#1c2128] border-b border-white/[0.07]">
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                    <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest whitespace-nowrap">
                    LO {gi + 1}
                  </span>
                </div>

                {/* LO input — the shared Learning Outcome for all rows in this group */}
                <input
                  type="text"
                  value={group.objective}
                  onChange={(e) => updateGroupLO(group.id, e.target.value)}
                  placeholder="e.g. Learning outcome 2: Draw a digital sketch"
                  className="flex-1 bg-transparent text-sm font-semibold text-white placeholder-gray-600 focus:outline-none border-b border-transparent focus:border-blue-500/60 transition-colors pb-0.5"
                />

                {/* Optional link to a real Curriculum Learning Outcome — sets competency_id on
                    every week in this group, which the PDF/report groups and totals duration by. */}
                {subjectCompetencies.length > 0 && (
                  <SelectField
                    value={group.competency_id ?? ""}
                    onChange={(e) => updateGroupCompetency(group.id, e.target.value)}
                    title="Link this group to a Curriculum Learning Outcome (optional)"
                    className="shrink-0 max-w-[220px] bg-[#0d1117] border border-white/10 rounded-lg text-xs text-gray-300 px-2 py-1.5 focus:outline-none focus:border-blue-500/60 transition-colors"
                  >
                    <option value="">Not linked to Curriculum</option>
                    {subjectCompetencies.map((c) => (
                      <option key={c.competency_id} value={c.competency_id}>
                        LO {c.element_number}: {c.title}
                      </option>
                    ))}
                  </SelectField>
                )}

                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-gray-600 mr-1">
                    {group.rows.length} week{group.rows.length !== 1 ? "s" : ""}
                  </span>

                  <button onClick={() => toggleCollapse(group.id)}
                    title={group.collapsed ? "Expand" : "Collapse"}
                    className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-white/5 rounded-lg transition-all">
                    {group.collapsed
                      ? <ChevronDown className="w-4 h-4" />
                      : <ChevronUp className="w-4 h-4" />}
                  </button>

                  {groups.length > 1 && (
                    <button onClick={() => removeGroup(group.id)}
                      title="Remove this learning outcome"
                      className="p-1.5 text-gray-700 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-all">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* ── Week rows for this group ── */}
              <AnimatePresence initial={false}>
                {!group.collapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: "hidden" }}
                  >
                    <div className="overflow-x-auto bg-[#0d1117]">
                      <table className="border-collapse w-full" style={{ minWidth: 1400 }}>
                        <tbody>
                          <AnimatePresence initial={false}>
                            {group.rows.map((row) => {
                              const isFilled = !!row.topic.trim();
                              return (
                                <motion.tr
                                  key={row.id}
                                  layout
                                  initial={{ opacity: 0, y: -4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, x: 40 }}
                                  transition={{ duration: 0.13 }}
                                  className={`group border-b border-white/[0.04] transition-colors ${
                                    isFilled ? "hover:bg-white/[0.02]" : "bg-amber-950/10 hover:bg-amber-950/15"
                                  }`}
                                >
                                  {/* Drag handle */}
                                  <td className="w-8 px-2 align-middle">
                                    <GripVertical className="w-3.5 h-3.5 text-gray-700 mx-auto cursor-grab" />
                                  </td>

                                  {WEEK_COLS.map((col) => (
                                    <td key={col.key} style={{ minWidth: col.minW }} className="px-0 py-0 align-top">
                                      <div className="m-1 px-2.5 py-2 rounded-md border border-transparent hover:border-white/10 hover:bg-white/[0.025] focus-within:border-blue-500 focus-within:bg-blue-950/25 focus-within:ring-1 focus-within:ring-blue-500/20 transition-all min-h-[36px]">
                                        <Cell col={col} value={row[col.key]} onChange={(v) => updateRow(group.id, row.id, col.key, v)} />
                                      </div>
                                    </td>
                                  ))}

                                  {/* Row actions */}
                                  <td className="w-14 px-1 align-top pt-1">
                                    <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button onClick={() => duplicateRow(group.id, row.id)} title="Duplicate week"
                                        className="p-1.5 text-gray-600 hover:text-blue-400 hover:bg-blue-900/30 rounded transition-all">
                                        <Copy className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={() => removeRow(group.id, row.id)} title="Remove week"
                                        disabled={group.rows.length === 1}
                                        className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/30 rounded transition-all disabled:opacity-20 disabled:cursor-not-allowed">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </motion.tr>
                              );
                            })}
                          </AnimatePresence>
                        </tbody>
                      </table>
                    </div>

                    {/* Add week to this group */}
                    <div className="bg-[#0d1117] border-t border-white/[0.04] px-5 py-2.5">
                      <button onClick={() => addRow(group.id)}
                        className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-300 transition-colors group/btn">
                        <span className="w-5 h-5 rounded border border-white/10 group-hover/btn:border-white/20 flex items-center justify-center group-hover/btn:bg-white/5 transition-all">
                          <Plus className="w-3 h-3" />
                        </span>
                        Add week to this learning outcome
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* ── Add new Learning Outcome ── */}
        <motion.button
          layout
          onClick={addGroup}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl border-2 border-dashed border-white/10 hover:border-blue-500/40 hover:bg-blue-950/10 text-gray-600 hover:text-blue-400 transition-all group"
        >
          <div className="w-7 h-7 rounded-lg border border-current flex items-center justify-center group-hover:bg-blue-500/10 transition-all">
            <Plus className="w-4 h-4" />
          </div>
          <span className="text-sm font-medium">Add Learning Outcome</span>
          <span className="text-xs text-gray-700 group-hover:text-blue-600">
            (LO {groups.length + 1})
          </span>
        </motion.button>

      </div>

      {/* ── Bottom status bar ─────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/[0.06] bg-[#161b22] px-5 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <span>{groups.length} learning outcome{groups.length !== 1 ? "s" : ""}</span>
          <span>·</span>
          <span>{totalWeeks} weeks total</span>
          <span>·</span>
          <span className={filledWeeks === totalWeeks && totalWeeks > 0 ? "text-emerald-500" : ""}>
            {filledWeeks} with content
          </span>
          <span>·</span>
          <span>Fields <span className="text-red-500">*</span> are required</span>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || totalWeeks === 0}
          className="flex items-center gap-2 px-5 py-1.5 text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white rounded-lg shadow-lg shadow-emerald-500/20 transition-all"
        >
          {saving
            ? <><Loader2 className="w-4 h-4 animate-spin" />Saving {savedCount}/{totalWeeks}…</>
            : <><Save className="w-4 h-4" />Save all weeks</>}
        </button>
      </div>

      {/* ── Discard confirm ───────────────────────────────────────────── */}
      <AnimatePresence>
        {confirmDiscard && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              className="bg-[#1c2128] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
              <h3 className="text-base font-bold text-white mb-2">Discard changes?</h3>
              <p className="text-sm text-gray-400 mb-5">You have unsaved content. Going back will lose your work.</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDiscard(false)}
                  className="flex-1 py-2 text-sm font-medium text-gray-300 border border-white/10 rounded-xl hover:bg-white/5 transition-all">
                  Keep editing
                </button>
                <button onClick={onCancel}
                  className="flex-1 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded-xl transition-all">
                  Discard
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default SchemeManualEntry;
