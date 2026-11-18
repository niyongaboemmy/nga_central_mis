import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertOctagon, Annoyed, ArrowRight, CalendarDays, Check, Clock3, FileText, Frown, Laugh, Meh, NotebookPen, RotateCcw, Smile, Undo2, X } from "lucide-react";
import { failure, sideProjectsApi, type ProjectDetail, type Report } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import { Field, FormModal, TextArea } from "../form";
import { Dropzone, ProgressRing, Spinner, fmtBytes, inputCls, primaryBtn, secondaryBtn } from "../ui";

export const MOODS = [
  { v: 1, icon: Frown, label: "Struggling", color: "#d03b3b" },
  { v: 2, icon: Annoyed, label: "Hard", color: "#ec835a" },
  { v: 3, icon: Meh, label: "Okay", color: "#fab219" },
  { v: 4, icon: Smile, label: "Good", color: "#1baf7a" },
  { v: 5, icon: Laugh, label: "Great", color: "#0ca30c" },
];
export const MAX_FILES = 3;
const MAX_MB = 20;
const HOURS = [0.5, 1, 2, 3, 4, 6];
const DAY = 86_400_000;
const isoDay = (offset = 0) => {
  const d = new Date(Date.now() - offset * DAY);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
};

type Form = { workDate: string; hours: number | null; mood: number | null; did: string; nextSteps: string; blockers: string };
const blank = (): Form => ({ workDate: isoDay(0), hours: null, mood: null, did: "", nextSteps: "", blockers: "" });

/**
 * Record a progress report (or edit one): which day the work was done, hours, mood, what was
 * done / next / blocking, and up to three PDF attachments (minutes, test reports, designs).
 */
const ReportModal: React.FC<{ p: ProjectDetail; open: boolean; report: Report | null; onClose: () => void; onSaved: () => void }> = ({ p, open, report, onClose, onSaved }) => {
  const { showToast } = useToast();
  const [f, setF] = useState<Form>(blank);
  const [files, setFiles] = useState<File[]>([]);
  const [remove, setRemove] = useState<number[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setF(
      report
        ? { workDate: report.workDate, hours: report.hours, mood: report.mood, did: report.did, nextSteps: report.nextSteps ?? "", blockers: report.blockers ?? "" }
        : blank(),
    );
    setFiles([]);
    setRemove([]);
    setErrors({});
    setPct(null);
  }, [open, report]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const kept = (report?.files ?? []).filter((x) => !remove.includes(x.assetId));
  const room = MAX_FILES - kept.length - files.length;
  const today = isoDay(0);
  const minDay = isoDay(60);

  const addFiles = (list: File[]) => {
    const pdfs = list.filter((x) => x.type === "application/pdf" || x.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length < list.length) showToast("Only PDF files can be attached", "warning");
    const big = pdfs.filter((x) => x.size > MAX_MB * 1048576);
    if (big.length) showToast(`${big[0].name} is over ${MAX_MB} MB`, "warning");
    const ok = pdfs.filter((x) => x.size <= MAX_MB * 1048576);
    if (ok.length > room) showToast(`A report holds at most ${MAX_FILES} PDF files`, "warning");
    setFiles((cur) => [...cur, ...ok.slice(0, Math.max(0, room))]);
    setErrors((e) => ({ ...e, files: "" }));
  };

  const save = async () => {
    const e: Record<string, string> = {};
    if (f.did.trim().length < 5) e.did = "Say what you did (at least 5 characters)";
    if (!f.workDate) e.workDate = "Choose the day";
    else if (f.workDate > today) e.workDate = "That day hasn't come yet";
    else if (f.workDate < minDay) e.workDate = "Reports go back 60 days at most";
    if (f.hours !== null && (f.hours < 0.5 || f.hours > 24 || Math.round(f.hours * 2) !== f.hours * 2)) e.hours = "Between 0.5 and 24, in half hours";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setPct(files.length ? 0 : null);
    const body = {
      did: f.did.trim(),
      nextSteps: f.nextSteps.trim(),
      blockers: f.blockers.trim(),
      mood: f.mood,
      workDate: f.workDate,
      hours: f.hours,
    };
    try {
      if (report) await sideProjectsApi.editReport(p.id, report.id, { ...body, removeFiles: remove }, files, files.length ? setPct : undefined);
      else await sideProjectsApi.addReport(p.id, body, files, files.length ? setPct : undefined);
      showToast(report ? "Report updated" : "Report saved", "success");
      onClose();
      onSaved();
    } catch (err) {
      const x = failure(err, report ? "The report wasn't updated" : "The report wasn't saved");
      if (x.field) setErrors({ [x.field === "file" ? "files" : x.field]: x.message });
      showToast(x.message, "error");
    } finally {
      setBusy(false);
      setPct(null);
    }
  };

  const dayChoice = (label: string, value: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={f.workDate === value}
      onClick={() => set("workDate", value)}
      className={`rounded-full px-3.5 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        f.workDate === value ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      }`}
    >
      {label}
    </button>
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      icon={NotebookPen}
      title={report ? "Edit report" : "New progress report"}
      subtitle={p.title}
      footer={
        <>
          <button type="button" className={secondaryBtn} onClick={onClose} disabled={busy}>
            <Undo2 className="h-4 w-4" /> Cancel
          </button>
          <button type="button" className={primaryBtn} onClick={save} disabled={busy}>
            {busy ? pct !== null ? <ProgressRing value={pct} size={20} stroke={3} color="#ffffff" label={`${pct}% uploaded`}>{" "}</ProgressRing> : <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {report ? "Save changes" : "Save report"}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        {/* When + how long + how it went */}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Day of the work" icon={CalendarDays} error={errors.workDate}>
            <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Day of the work">
              {dayChoice("Today", today)}
              {dayChoice("Yesterday", isoDay(1))}
              <input
                type="date"
                aria-label="Another day"
                value={f.workDate}
                min={minDay}
                max={today}
                onChange={(e) => set("workDate", e.target.value)}
                className={`${inputCls} !min-h-[36px] !w-auto !rounded-full !px-3 !py-1.5 text-xs [color-scheme:light] dark:[color-scheme:dark]`}
              />
            </div>
          </Field>
          <Field label="Hours spent" icon={Clock3} optional error={errors.hours}>
            <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Hours spent">
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  role="radio"
                  aria-checked={f.hours === h}
                  onClick={() => set("hours", f.hours === h ? null : h)}
                  className={`min-w-[2.5rem] rounded-full px-3 py-2 text-xs font-bold tabular-nums transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    f.hours === h ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {h}h
                </button>
              ))}
              <input
                type="number"
                aria-label="Other number of hours"
                min={0.5}
                max={24}
                step={0.5}
                placeholder="other"
                value={f.hours !== null && !HOURS.includes(f.hours) ? f.hours : ""}
                onChange={(e) => set("hours", e.target.value === "" ? null : Number(e.target.value))}
                className={`${inputCls} !min-h-[36px] !w-20 !rounded-full !px-3 !py-1.5 text-xs`}
              />
            </div>
          </Field>
        </div>

        <Field label="How did it go?" optional>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="How did it go?">
            {MOODS.map((m) => {
              const on = f.mood === m.v;
              return (
                <button
                  key={m.v}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set("mood", on ? null : m.v)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    on ? "bg-slate-900 text-white dark:bg-white dark:text-gray-900" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  <m.icon className="h-4 w-4" style={{ color: m.color }} aria-hidden /> {m.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="What did you do?" icon={Check} htmlFor="rp-did" counter={{ value: f.did, min: 5, max: 2000 }} error={errors.did}>
          <TextArea id="rp-did" data-autofocus rows={4} value={f.did} invalid={!!errors.did} onChange={(e) => set("did", e.target.value)} placeholder="Wired the moisture sensor and logged the first readings…" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Next steps" icon={ArrowRight} htmlFor="rp-next" optional error={errors.nextSteps}>
            <TextArea id="rp-next" rows={3} value={f.nextSteps} onChange={(e) => set("nextSteps", e.target.value)} placeholder="Calibrate the readings" />
          </Field>
          <Field label="Blockers" icon={AlertOctagon} htmlFor="rp-block" optional error={errors.blockers}>
            <TextArea id="rp-block" rows={3} value={f.blockers} onChange={(e) => set("blockers", e.target.value)} placeholder="Waiting for a relay module" />
          </Field>
        </div>

        <Field label={`PDF attachments (${kept.length + files.length}/${MAX_FILES})`} icon={FileText} optional error={errors.files}>
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {(report?.files ?? []).map((x) => {
                const gone = remove.includes(x.assetId);
                return (
                  <motion.div key={`a${x.assetId}`} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2 dark:bg-gray-800/40 ${gone ? "opacity-60" : ""}`}>
                    <PdfGlyph />
                    <span className={`min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-gray-100 ${gone ? "line-through" : ""}`}>{x.name}</span>
                    <span className="text-[11px] tabular-nums text-slate-500 dark:text-gray-400">{fmtBytes(x.size)}</span>
                    <button
                      type="button"
                      onClick={() => setRemove((r) => (gone ? r.filter((id) => id !== x.assetId) : [...r, x.assetId]))}
                      aria-label={gone ? `Keep ${x.name}` : `Remove ${x.name}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-slate-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
                    >
                      {gone ? <RotateCcw className="h-4 w-4" /> : <X className="h-4 w-4" />}
                    </button>
                  </motion.div>
                );
              })}
              {files.map((x, i) => (
                <motion.div key={`n${i}${x.name}`} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-3 rounded-2xl bg-blue-50 px-3 py-2 dark:bg-blue-500/10">
                  <PdfGlyph />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-gray-100">{x.name}</span>
                  <span className="text-[11px] tabular-nums text-slate-500 dark:text-gray-400">{fmtBytes(x.size)}</span>
                  <button type="button" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} aria-label={`Remove ${x.name}`} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-slate-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white">
                    <X className="h-4 w-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
            {room > 0 && <Dropzone onFiles={addFiles} accept="application/pdf,.pdf" multiple compact disabled={busy} label="Drop PDFs or browse" hint={`Up to ${room} more · ${MAX_MB} MB each`} icon={FileText} />}
          </div>
        </Field>
      </div>
    </FormModal>
  );
};

export const PdfGlyph: React.FC = () => (
  <span className="flex h-9 w-8 shrink-0 flex-col items-center justify-end rounded-lg bg-red-600 pb-1 text-[8px] font-black tracking-wide text-white" aria-hidden>
    PDF
  </span>
);

export default ReportModal;
