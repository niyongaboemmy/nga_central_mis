import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, CalendarRange, Check, CheckCircle2, ChevronLeft, Clock, DoorOpen, Info, Lock, Minus, Plus, Tag, Users } from "lucide-react";
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
  scheduleWeeks,
  shortDate,
  type AssignResult,
  type OfficeHourSchedule,
  type OfficeHoursConfig,
  type ScheduleInput,
} from "../../api/officeHours";
import StudentPicker from "./StudentPicker";
import { inputCls, labelCls, Muted, primaryBtn, secondaryBtn } from "./ohUi";
import SelectField from "../ui/SelectField";

/**
 * Create or edit office hours (plan §9.2). Creating runs three steps:
 *   1. when & what -> saved as a DRAFT (students are not told yet);
 *   2. who         -> students invited week by week, against the saved draft;
 *   3. review      -> Publish, which notifies every invited student.
 * Editing an existing schedule shows step 1 only.
 *
 * Desktop gets the form and a live preview side by side, so the whole step
 * fits without scrolling; phones stack them with a sticky action bar.
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
const STEPS: Array<[Step, string]> = [
  ["details", "When & what"],
  ["students", "Students"],
  ["review", "Review"],
];

const sectionTitle = "flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50";
const errorText = "mt-1 text-xs font-medium text-rose-700 dark:text-rose-300";

const Stepper: React.FC<{ step: Step }> = ({ step }) => {
  const at = STEPS.findIndex(([k]) => k === step);
  return (
    <ol className="flex items-center gap-2 text-xs font-semibold" aria-label="Steps">
      {STEPS.map(([k, label], i) => (
        <li key={k} className="flex items-center gap-2" aria-current={i === at ? "step" : undefined}>
          <span
            className={`grid h-6 w-6 place-items-center rounded-full text-[11px] ${
              i < at ? "bg-emerald-600 text-white" : i === at ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
            }`}
          >
            {i < at ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
          </span>
          <span className={`hidden sm:inline ${i === at ? "text-slate-900 dark:text-slate-50" : "text-slate-500 dark:text-slate-400"}`}>{label}</span>
          {i < STEPS.length - 1 && <span className="h-px w-6 bg-slate-300 dark:bg-slate-600" aria-hidden />}
        </li>
      ))}
    </ol>
  );
};

const ScheduleDrawer: React.FC<ScheduleDrawerProps> = ({ open, onClose, config, termId, initialDay, schedule, onSaved }) => {
  const { showToast } = useToast();
  const editing = Boolean(schedule);
  const [step, setStep] = useState<Step>("details");
  const [subjects, setSubjects] = useState<MyAssignedSubject[]>([]);
  const [draft, setDraft] = useState<OfficeHourSchedule | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [invited, setInvited] = useState<Map<string, number>>(new Map());

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
    setInvited(new Map());
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

  const subjectName = subjects.find((s) => s.subject_id === form.subject_id)?.subject_name ?? schedule?.subject_name ?? null;
  const subjectColor = schedule && schedule.subject_id === form.subject_id ? schedule.subject_color : null;
  const titlePreview = form.title.trim() || (subjectName ? `${subjectName} support` : humanize(form.purpose));
  const weeks = useMemo(
    () => (form.days.length && form.effective_from <= form.effective_to ? scheduleWeeks({ effective_from: form.effective_from, effective_to: form.effective_to, days: form.days }) : []),
    [form.days, form.effective_from, form.effective_to],
  );
  const sessionCount = weeks.reduce((n, w) => n + w.meetings.length, 0);

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

  const assignedCount = [...invited.values()].reduce((a, b) => a + b, 0);
  const onAssigned = (r: AssignResult) =>
    setInvited((prev) => {
      const next = new Map(prev);
      for (const a of r.assigned) next.set(a.effective_from, (next.get(a.effective_from) ?? 0) + 1);
      return next;
    });

  const publish = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await officeHoursApi.publishSchedule(draft.schedule_id);
      showToast(assignedCount ? `Published — ${assignedCount} invitation${assignedCount === 1 ? "" : "s"} sent` : "Published", "success");
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
  const firstError = errors.days || errors.start_time || errors.end_time || errors.effective_to || errors.capacity;

  const footer = (children: React.ReactNode) => (
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur sm:px-6 dark:border-slate-700 dark:bg-slate-900/95">
      {children}
    </div>
  );

  return (
    <Modal
      isOpen={open}
      onClose={draft ? keepDraft : onClose}
      size="3xl"
      contentClassName="p-0"
      title={
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pr-2">
          <span>{stepTitle}</span>
          {!editing && <Stepper step={step} />}
        </div>
      }
    >
      {step === "details" && (
        <>
          <div className="grid lg:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="space-y-6 p-5 sm:p-6">
              <section aria-labelledby="oh-when" className="space-y-4">
                <h3 id="oh-when" className={sectionTitle}>
                  <CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden /> When
                </h3>
                <fieldset>
                  <legend className={labelCls}>Days</legend>
                  <div className="grid grid-cols-5 gap-2" role="group" aria-label="Weekdays">
                    {[1, 2, 3, 4, 5].map((d) => {
                      const on = form.days.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={on}
                          aria-label={DAY_LONG[d]}
                          onClick={() => toggleDay(d)}
                          className={`flex flex-col items-center rounded-2xl border px-2 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                            on
                              ? "border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                              : "border-slate-300 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50/60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-blue-500/50"
                          }`}
                        >
                          <span>{DAY_SHORT[d]}</span>
                          <span className={`hidden text-[11px] font-medium md:block ${on ? "text-blue-100" : "text-slate-500 dark:text-slate-400"}`}>{DAY_LONG[d]}</span>
                        </button>
                      );
                    })}
                  </div>
                  {errors.days && <p className={errorText}>{errors.days}</p>}
                </fieldset>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div>
                    <label htmlFor="oh-start" className={labelCls}>Starts</label>
                    <input id="oh-start" type="time" className={inputCls} value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} aria-invalid={Boolean(errors.start_time || errors.end_time)} />
                  </div>
                  <div>
                    <label htmlFor="oh-end" className={labelCls}>Ends</label>
                    <input id="oh-end" type="time" className={inputCls} value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} aria-invalid={Boolean(errors.end_time)} />
                  </div>
                  <div>
                    <label htmlFor="oh-from" className={labelCls}>From</label>
                    <input id="oh-from" type="date" min={termStart} max={termEnd} className={inputCls} value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="oh-to" className={labelCls}>Until</label>
                    <input id="oh-to" type="date" min={termStart} max={termEnd} className={inputCls} value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} aria-invalid={Boolean(errors.effective_to)} />
                  </div>
                </div>
                {(errors.start_time || errors.end_time || errors.effective_to) && <p className={errorText}>{errors.start_time || errors.end_time || errors.effective_to}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  {(form.start_time !== config.band_start || form.end_time !== config.band_end) && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, start_time: config.band_start, end_time: config.band_end })}
                      className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Use the band {config.band_start}–{config.band_end}
                    </button>
                  )}
                  {(form.effective_from !== defaults.effective_from || form.effective_to !== termEnd) && !editing && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, effective_from: defaults.effective_from, effective_to: termEnd })}
                      className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Rest of term
                    </button>
                  )}
                  <Muted className="text-xs">
                    The timetable's office-hours band is {config.band_start}–{config.band_end}. Dates stay inside the term ({formatYmd(termStart, { year: true })} – {formatYmd(termEnd, { year: true })}).
                  </Muted>
                </div>
              </section>

              <section aria-labelledby="oh-what" className="space-y-4 border-t border-slate-200 pt-5 dark:border-slate-700">
                <h3 id="oh-what" className={sectionTitle}>
                  <Tag className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden /> What
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label htmlFor="oh-subject" className={labelCls}>Subject (optional)</label>
                    <SelectField id="oh-subject" className={inputCls} value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value ? Number(e.target.value) : "" })} searchPlaceholder="Search your subjects…">
                      <option value="">Not tied to a subject</option>
                      {subjects.map((s) => (
                        <option key={s.subject_id} value={s.subject_id} data-description={s.subject_code ?? undefined}>
                          {s.subject_name}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  <div>
                    <label htmlFor="oh-title" className={labelCls}>Title</label>
                    <input id="oh-title" className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={150} placeholder={subjectName ? `${subjectName} support` : "e.g. Mathematics support"} />
                  </div>
                </div>

                <fieldset>
                  <legend className={labelCls}>Purpose</legend>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Purpose">
                    {config.purposes.map((p) => {
                      const on = form.purpose === p;
                      return (
                        <button
                          key={p}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setForm({ ...form, purpose: p })}
                          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                            on
                              ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          }`}
                        >
                          {humanize(p)}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
                  <div>
                    <label htmlFor="oh-room" className={labelCls}>Room</label>
                    <div className="relative">
                      <DoorOpen className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
                      <input id="oh-room" className={`${inputCls} pl-9`} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} maxLength={100} placeholder="e.g. B4 or Academy Hall" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="oh-capacity" className={labelCls}>Capacity</label>
                    <div className="flex items-stretch overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-800">
                      <button type="button" onClick={() => setForm({ ...form, capacity: Math.max(1, Number(form.capacity) - 1) })} className="px-3 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700" aria-label="One place fewer">
                        <Minus className="h-4 w-4" aria-hidden />
                      </button>
                      <input
                        id="oh-capacity"
                        type="number"
                        min={1}
                        max={config.max_capacity}
                        className="w-full min-w-0 border-0 bg-transparent px-1 py-2 text-center text-sm font-semibold tabular-nums text-slate-900 focus:outline-none dark:text-slate-100"
                        value={form.capacity}
                        onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                        aria-invalid={Boolean(errors.capacity)}
                      />
                      <button type="button" onClick={() => setForm({ ...form, capacity: Math.min(config.max_capacity, Number(form.capacity) + 1) })} className="px-3 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700" aria-label="One place more">
                        <Plus className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                    {errors.capacity ? <p className={errorText}>{errors.capacity}</p> : <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Per session · max {config.max_capacity}</p>}
                  </div>
                </div>

                <div>
                  <label htmlFor="oh-notes" className={labelCls}>
                    <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" aria-hidden /> Private notes</span>
                  </label>
                  <textarea id="oh-notes" rows={2} className={`${inputCls} resize-y`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Only you and leadership see this" />
                </div>
              </section>
            </div>

            <aside className="border-t border-slate-200 bg-slate-50/80 p-5 sm:p-6 lg:border-l lg:border-t-0 dark:border-slate-700 dark:bg-slate-900/40" aria-label="Preview">
              <div className="space-y-4 lg:sticky lg:top-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">What students will see</p>
                <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: subjectColor ?? "#2563eb" }} aria-hidden />
                  <p className="truncate pl-2 text-base font-semibold text-slate-900 dark:text-slate-50">{titlePreview}</p>
                  <ul className="mt-2 space-y-1.5 pl-2 text-sm text-slate-700 dark:text-slate-200">
                    <li className="flex items-center gap-2"><Clock className="h-4 w-4 text-slate-400" aria-hidden />{form.days.length ? form.days.map((d) => DAY_SHORT[d]).join(", ") : "No day yet"} · {form.start_time}–{form.end_time}</li>
                    <li className="flex items-center gap-2"><DoorOpen className="h-4 w-4 text-slate-400" aria-hidden />{form.location.trim() || "Room not set"}</li>
                    <li className="flex items-center gap-2"><CalendarRange className="h-4 w-4 text-slate-400" aria-hidden />{shortDate(form.effective_from)} – {shortDate(form.effective_to, true)}</li>
                  </ul>
                </div>

                <div className="grid grid-cols-5 gap-1.5" aria-hidden>
                  {[1, 2, 3, 4, 5].map((d) => {
                    const on = form.days.includes(d);
                    return (
                      <div key={d} className={`flex h-16 flex-col items-center justify-between rounded-xl border p-1.5 text-[11px] font-semibold ${on ? "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-100" : "border-dashed border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-500"}`}>
                        <span>{DAY_SHORT[d]}</span>
                        {on && <span className="rounded-md bg-blue-600 px-1 py-0.5 text-[10px] text-white">{form.start_time}</span>}
                      </div>
                    );
                  })}
                </div>

                <dl className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Weeks", weeks.length],
                    ["Sessions", sessionCount],
                    ["Places", form.capacity || 0],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-white p-2 dark:bg-slate-800">
                      <dd className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-50">{v}</dd>
                      <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{k}</dt>
                    </div>
                  ))}
                </dl>

                <div className="flex gap-2 rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
                  <Users className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
                  <p>
                    Students are invited <strong>week by week</strong>. Invite a group for one week, bring them back the next, or change them — up to {form.capacity || 0} per session.
                  </p>
                </div>
              </div>
            </aside>
          </div>

          {footer(
            <>
              <p className="min-h-[1rem] text-xs text-rose-700 dark:text-rose-300" role={firstError ? "alert" : undefined}>
                {firstError ? (
                  <span className="inline-flex items-center gap-1"><Info className="h-3.5 w-3.5" aria-hidden /> Fix the highlighted fields</span>
                ) : null}
              </p>
              <div className="flex gap-2">
                <button type="button" className={secondaryBtn} onClick={draft ? keepDraft : onClose}>Cancel</button>
                <button type="button" className={primaryBtn} onClick={saveDetails} disabled={saving}>
                  {saving ? "Saving…" : editing ? "Save changes" : "Continue to students"}
                </button>
              </div>
            </>,
          )}
        </>
      )}

      {step === "students" && draft && (
        <>
          <div className="p-5 sm:p-6">
            <StudentPicker scheduleId={draft.schedule_id} reasonCodes={config.reason_codes} onAssigned={onAssigned} schedule={draft} today={config.today} />
          </div>
          {footer(
            <>
              <button type="button" className={secondaryBtn} onClick={() => setStep("details")}>
                <ChevronLeft className="h-4 w-4" aria-hidden /> Back
              </button>
              <div className="flex items-center gap-3">
                <span className="hidden text-sm text-slate-600 sm:inline dark:text-slate-300">{assignedCount} invitation{assignedCount === 1 ? "" : "s"} so far</span>
                <button type="button" className={primaryBtn} onClick={() => setStep("review")}>Review</button>
              </div>
            </>,
          )}
        </>
      )}

      {step === "review" && draft && (
        <>
          <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/60">
              {draft.subject_color && <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: draft.subject_color }} aria-hidden />}
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{draft.title}</p>
              <Muted>
                {draft.days_label} · {draft.start_time}–{draft.end_time}
                {draft.location ? ` · ${draft.location}` : ""}
              </Muted>
              <Muted>
                {formatYmd(draft.effective_from, { year: true })} – {formatYmd(draft.effective_to, { year: true })} · capacity {draft.capacity}
              </Muted>
              <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> {assignedCount} invitation{assignedCount === 1 ? "" : "s"} so far
              </p>
            </div>
            <div className="space-y-3">
              <Muted>
                Publishing adds these office hours to your timetable and tells each invited student when and where to come. Plan the following weeks any time from the office hours page: invite last week's group again, or choose new students.
              </Muted>
              {invited.size > 0 && (
                <ul className="flex flex-wrap gap-2 text-xs" aria-label="Invitations by start date">
                  {[...invited.entries()].sort().map(([d, n]) => (
                    <li key={d} className="rounded-full bg-blue-100 px-2.5 py-1 font-semibold text-blue-900 dark:bg-blue-500/15 dark:text-blue-100">
                      {formatYmd(d)} · {n}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {footer(
            <>
              <button type="button" className={secondaryBtn} onClick={() => setStep("students")}>
                <ChevronLeft className="h-4 w-4" aria-hidden /> Back
              </button>
              <div className="flex gap-2">
                <button type="button" className={secondaryBtn} onClick={keepDraft}>Keep as draft</button>
                <button type="button" className={primaryBtn} onClick={publish} disabled={saving}>{saving ? "Publishing…" : "Publish"}</button>
              </div>
            </>,
          )}
        </>
      )}
    </Modal>
  );
};

export default ScheduleDrawer;
