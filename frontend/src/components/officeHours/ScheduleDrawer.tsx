import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import Modal from "../ui/Modal";
import { useToast } from "../../contexts/ToastContext";
import { myAssignedSubjectsApi, type MyAssignedSubject } from "../../api/academics";
import {
  apiError,
  DAY_LONG,
  DAY_SHORT,
  formatYmd,
  humanize,
  officeHoursApi,
  type OfficeHourSchedule,
  type OfficeHoursConfig,
  type ScheduleInput,
} from "../../api/officeHours";
import StudentPicker from "./StudentPicker";
import { inputCls, labelCls, Muted, primaryBtn, secondaryBtn } from "./ohUi";

/**
 * Create or edit office hours (plan §9.2). Creating runs three steps:
 *   1. when & what -> saved as a DRAFT (students are not told yet);
 *   2. who         -> the student picker, against the saved draft;
 *   3. review      -> Publish, which notifies every assigned student.
 * Editing an existing schedule shows step 1 only.
 */
export interface ScheduleDrawerProps {
  open: boolean;
  onClose: () => void;
  config: OfficeHoursConfig;
  termId: number | null;
  initialDay?: number | null;
  schedule?: OfficeHourSchedule | null;
  onSaved: (scheduleId: number) => void;
}

type Step = "details" | "students" | "review";

const ScheduleDrawer: React.FC<ScheduleDrawerProps> = ({ open, onClose, config, termId, initialDay, schedule, onSaved }) => {
  const { showToast } = useToast();
  const editing = Boolean(schedule);
  const [step, setStep] = useState<Step>("details");
  const [subjects, setSubjects] = useState<MyAssignedSubject[]>([]);
  const [draft, setDraft] = useState<OfficeHourSchedule | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [assignedCount, setAssignedCount] = useState(0);

  const termStart = config.term?.startYmd ?? config.today;
  const termEnd = config.term?.endYmd ?? config.today;
  const defaults = useMemo(
    () => ({
      days: initialDay ? [initialDay] : ([] as number[]),
      start_time: config.band_start,
      end_time: config.band_end,
      effective_from: config.today > termStart ? config.today : termStart,
      effective_to: termEnd,
      subject_id: "" as number | "",
      title: "",
      purpose: "ACADEMIC_SUPPORT",
      location: "",
      capacity: config.default_capacity,
      notes: "",
    }),
    [config, initialDay, termStart, termEnd],
  );
  const [form, setForm] = useState(defaults);

  useEffect(() => {
    if (!open) return;
    setStep("details");
    setErrors({});
    setDraft(null);
    setAssignedCount(0);
    setForm(
      schedule
        ? {
            days: schedule.days,
            start_time: schedule.start_time,
            end_time: schedule.end_time,
            effective_from: schedule.effective_from,
            effective_to: schedule.effective_to,
            subject_id: schedule.subject_id ?? "",
            title: schedule.title,
            purpose: schedule.purpose,
            location: schedule.location ?? "",
            capacity: schedule.capacity,
            notes: schedule.notes ?? "",
          }
        : defaults,
    );
    myAssignedSubjectsApi
      .getAll(termId ?? undefined)
      .then((r) => setSubjects(r.data.data ?? []))
      .catch(() => setSubjects([]));
  }, [open, schedule, defaults, termId]);

  const toggleDay = (d: number) =>
    setForm((f) => ({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort() }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.days.length) e.days = "Choose at least one weekday";
    if (form.end_time <= form.start_time) e.end_time = "The end must be after the start";
    if (form.start_time < config.allowed_window_start || form.end_time > config.allowed_window_end) {
      e.start_time = `Office hours must fall between ${config.allowed_window_start} and ${config.allowed_window_end}`;
    }
    if (form.effective_from > form.effective_to) e.effective_to = "The end date must be on or after the start date";
    if (!form.capacity || form.capacity < 1 || form.capacity > config.max_capacity) e.capacity = `From 1 to ${config.max_capacity}`;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const payload = (): ScheduleInput => ({
    academic_term_id: termId,
    days: form.days,
    start_time: form.start_time,
    end_time: form.end_time,
    effective_from: form.effective_from,
    effective_to: form.effective_to,
    subject_id: form.subject_id === "" ? null : Number(form.subject_id),
    title: form.title.trim() || undefined,
    purpose: form.purpose,
    location: form.location.trim() || null,
    capacity: Number(form.capacity),
    notes: form.notes.trim() || null,
  });

  const saveDetails = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (editing && schedule) {
        await officeHoursApi.updateSchedule(schedule.schedule_id, { ...payload(), academic_term_id: undefined, version: schedule.version });
        showToast("Office hours updated", "success");
        onSaved(schedule.schedule_id);
        onClose();
      } else if (draft) {
        const r = await officeHoursApi.updateSchedule(draft.schedule_id, { ...payload(), academic_term_id: undefined, version: draft.version });
        setDraft(r.data.data);
        setStep("students");
      } else {
        const r = await officeHoursApi.createSchedule({ ...payload(), status: "DRAFT" });
        setDraft(r.data.data.schedule);
        setStep("students");
      }
    } catch (error) {
      showToast(apiError(error, "Couldn't save the office hours"), "error");
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await officeHoursApi.publishSchedule(draft.schedule_id);
      showToast(assignedCount ? `Published — ${assignedCount} student${assignedCount === 1 ? "" : "s"} notified` : "Published", "success");
      onSaved(draft.schedule_id);
      onClose();
    } catch (error) {
      showToast(apiError(error, "Couldn't publish"), "error");
    } finally {
      setSaving(false);
    }
  };

  const keepDraft = () => {
    if (draft) {
      showToast("Saved as a draft — students are not told until you publish", "info");
      onSaved(draft.schedule_id);
    }
    onClose();
  };

  const stepTitle = editing ? "Edit office hours" : step === "details" ? "New office hours · 1 of 3" : step === "students" ? "Choose students · 2 of 3" : "Review & publish · 3 of 3";

  return (
    <Modal isOpen={open} onClose={draft ? keepDraft : onClose} title={stepTitle} size="2xl">
      {step === "details" && (
        <div className="space-y-5">
          <fieldset>
            <legend className={labelCls}>Days</legend>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Weekdays">
              {[1, 2, 3, 4, 5].map((d) => {
                const on = form.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    aria-label={DAY_LONG[d]}
                    onClick={() => toggleDay(d)}
                    className={`min-w-[3.5rem] rounded-full border px-3 py-1.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      on
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    }`}
                  >
                    {DAY_SHORT[d]}
                  </button>
                );
              })}
            </div>
            {errors.days && <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">{errors.days}</p>}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label htmlFor="oh-start" className={labelCls}>Starts</label>
              <input id="oh-start" type="time" className={inputCls} value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </div>
            <div>
              <label htmlFor="oh-end" className={labelCls}>Ends</label>
              <input id="oh-end" type="time" className={inputCls} value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </div>
            <div>
              <label htmlFor="oh-from" className={labelCls}>From</label>
              <input id="oh-from" type="date" min={termStart} max={termEnd} className={inputCls} value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
            </div>
            <div>
              <label htmlFor="oh-to" className={labelCls}>Until</label>
              <input id="oh-to" type="date" min={termStart} max={termEnd} className={inputCls} value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} />
            </div>
          </div>
          {(errors.start_time || errors.end_time || errors.effective_to) && (
            <p className="text-xs text-rose-700 dark:text-rose-300">{errors.start_time || errors.end_time || errors.effective_to}</p>
          )}
          <Muted className="text-xs">
            The timetable's office-hours band is {config.band_start}–{config.band_end}. Dates stay inside the term ({formatYmd(termStart, { year: true })} – {formatYmd(termEnd, { year: true })}).
          </Muted>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="oh-subject" className={labelCls}>Subject (optional)</label>
              <select id="oh-subject" className={inputCls} value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value ? Number(e.target.value) : "" })}>
                <option value="">Not tied to a subject</option>
                {subjects.map((s) => (
                  <option key={s.subject_id} value={s.subject_id}>{s.subject_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="oh-title" className={labelCls}>Title</label>
              <input id="oh-title" className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={150} placeholder="e.g. Mathematics support" />
            </div>
            <div>
              <label htmlFor="oh-purpose" className={labelCls}>Purpose</label>
              <select id="oh-purpose" className={inputCls} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}>
                {config.purposes.map((p) => (
                  <option key={p} value={p}>{humanize(p)}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="oh-room" className={labelCls}>Room</label>
              <input id="oh-room" className={inputCls} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} maxLength={100} placeholder="e.g. B4" />
            </div>
            <div>
              <label htmlFor="oh-capacity" className={labelCls}>Capacity</label>
              <input
                id="oh-capacity"
                type="number"
                min={1}
                max={config.max_capacity}
                className={inputCls}
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
              />
              {errors.capacity && <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">{errors.capacity}</p>}
            </div>
            <div>
              <label htmlFor="oh-notes" className={labelCls}>Private notes</label>
              <input id="oh-notes" className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Only you and leadership see this" />
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
            <button type="button" className={secondaryBtn} onClick={draft ? keepDraft : onClose}>Cancel</button>
            <button type="button" className={primaryBtn} onClick={saveDetails} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Continue to students"}
            </button>
          </div>
        </div>
      )}

      {step === "students" && draft && (
        <div className="space-y-4">
          <StudentPicker scheduleId={draft.schedule_id} reasonCodes={config.reason_codes} onAssigned={(r) => setAssignedCount((n) => n + r.assigned.length)} />
          <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
            <button type="button" className={secondaryBtn} onClick={() => setStep("details")}>
              <ChevronLeft className="h-4 w-4" aria-hidden /> Back
            </button>
            <button type="button" className={primaryBtn} onClick={() => setStep("review")}>Review</button>
          </div>
        </div>
      )}

      {step === "review" && draft && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{draft.title}</p>
            <Muted>
              {draft.days_label} · {draft.start_time}–{draft.end_time}
              {draft.location ? ` · ${draft.location}` : ""}
            </Muted>
            <Muted>
              {formatYmd(draft.effective_from, { year: true })} – {formatYmd(draft.effective_to, { year: true })} · capacity {draft.capacity}
            </Muted>
            <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> {assignedCount} student{assignedCount === 1 ? "" : "s"} assigned
            </p>
          </div>
          <Muted>Publishing adds these office hours to your timetable and tells each student when and where to come. You can add or remove students later.</Muted>
          <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
            <button type="button" className={secondaryBtn} onClick={() => setStep("students")}>
              <ChevronLeft className="h-4 w-4" aria-hidden /> Back
            </button>
            <div className="flex gap-2">
              <button type="button" className={secondaryBtn} onClick={keepDraft}>Keep as draft</button>
              <button type="button" className={primaryBtn} onClick={publish} disabled={saving}>{saving ? "Publishing…" : "Publish"}</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default ScheduleDrawer;
