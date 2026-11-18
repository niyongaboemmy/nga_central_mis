import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CalendarRange,
  Check,
  Flag,
  GanttChartSquare,
  PauseCircle,
  Pencil,
  Undo2,
} from "lucide-react";
import {
  failure,
  sideProjectsApi,
  type ProjectDetail,
  type Status,
} from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import { Field, FormModal, IconInput } from "../form";
import PlanEditor, {
  MIN_PROJECT_DAYS,
  clampEnds,
  datesToEnds,
  defaultEnds,
  endsToDates,
  spanDays,
} from "../PlanEditor";
import {
  STAGES,
  STATUS_META,
  Spinner,
  cardCls,
  dayWord,
  primaryBtn,
  secondaryBtn,
  statusColor,
  useIsDark,
} from "../ui";

const DAY = 86_400_000;
const dayOf = (iso: string) =>
  Math.floor(Date.parse(iso.length <= 10 ? `${iso}T00:00:00Z` : iso) / DAY);
const fmt = (n: number) =>
  new Date(n * DAY).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const CRITICAL = "#d03b3b";

type Tip = { x: number; y: number; title: string; lines: string[] } | null;

/**
 * Planned vs actual per stage, Gantt-style: a soft band for the planned window, a solid bar for
 * every real stay, the part beyond the plan in red, a "today" line. Hover or focus a bar for
 * the exact dates. Teams (and the lead) edit the plan from here.
 */
const StageTimeline: React.FC<{
  p: ProjectDetail;
  canEdit: boolean;
  onSaved: () => void;
}> = ({ p, canEdit, onSaved }) => {
  const dark = useIsDark();
  const [edit, setEdit] = useState(false);
  const [tip, setTip] = useState<Tip>(null);
  const box = useRef<HTMLDivElement>(null);
  const period = p.period;
  const today = Math.floor(Date.now() / DAY);

  const geo = useMemo(() => {
    const planned = period.stages.filter((s) => s.plannedStart && s.plannedEnd);
    const starts = [
      ...planned.map((s) => dayOf(s.plannedStart!)),
      ...p.stays.map((s) => dayOf(s.enteredAt)),
    ];
    const ends = [
      ...planned.map((s) => dayOf(s.plannedEnd!) + 1),
      ...p.stays.map((s) => (s.leftAt ? dayOf(s.leftAt) : today) + 1),
    ];
    if (p.status !== "COMPLETED") ends.push(today + 1);
    const min = starts.length ? Math.min(...starts) : today;
    const max = Math.max(min + 7, ...(ends.length ? ends : [today + 7]));
    return { min, max, span: max - min };
  }, [period, p.stays, p.status, today]);

  const x = (d: number) => ((d - geo.min) / geo.span) * 100;
  const ticks = useMemo(() => {
    const n = 5;
    return Array.from({ length: n }, (_, i) =>
      Math.round(geo.min + (geo.span * i) / (n - 1)),
    );
  }, [geo]);

  const rows: Array<{ stage: Status; view?: (typeof period.stages)[number] }> =
    [
      ...period.stages.map((v) => ({ stage: v.stage as Status, view: v })),
      ...(p.stays.some((s) => s.stage === "ON_HOLD")
        ? [{ stage: "ON_HOLD" as Status }]
        : []),
    ];

  const show = (
    e: React.MouseEvent | React.FocusEvent,
    title: string,
    lines: string[],
  ) => {
    const r = box.current?.getBoundingClientRect();
    const t = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (!r) return;
    setTip({
      x: t.left - r.left + t.width / 2,
      y: t.top - r.top,
      title,
      lines,
    });
  };

  const current = period.stages.find((s) => s.state === "current");
  const dayN =
    period.totalDays && p.startDate
      ? Math.min(period.totalDays, Math.max(1, today - dayOf(p.startDate) + 1))
      : null;

  return (
    <section className={`${cardCls} p-5`} aria-labelledby="sp-gantt-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
            <GanttChartSquare className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <div>
            <h3
              id="sp-gantt-title"
              className="text-sm font-bold text-slate-900 dark:text-white"
            >
              Time in each stage
            </h3>
            <p className="text-xs text-slate-500 dark:text-gray-400">
              {p.startDate && p.targetDate
                ? `${fmt(dayOf(p.startDate))} – ${fmt(dayOf(p.targetDate))}`
                : "No dates yet"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {dayN && p.status !== "COMPLETED" && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold tabular-nums text-slate-700 dark:bg-gray-700/60 dark:text-gray-200">
              Day {dayN} of {period.totalDays}
            </span>
          )}
          {period.daysLeftProject !== null && p.status !== "COMPLETED" && (
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums ${
                period.daysLeftProject < 0
                  ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                  : "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
              }`}
            >
              {period.daysLeftProject < 0
                ? `${dayWord(-period.daysLeftProject)} past closing`
                : period.daysLeftProject === 0
                  ? "Closes today"
                  : `${dayWord(period.daysLeftProject)} left`}
            </span>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => setEdit(true)}
              className={`${secondaryBtn} !min-h-[32px] !px-3.5 !py-1 !text-xs`}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit plan
            </button>
          )}
        </div>
      </div>

      {!p.startDate || !p.targetDate ? (
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => setEdit(true)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 p-5 text-sm font-semibold text-slate-500 transition enabled:hover:border-blue-300 enabled:hover:bg-blue-50/50 enabled:hover:text-blue-700 dark:border-gray-700/60 dark:text-gray-400"
        >
          <CalendarRange className="h-4 w-4" aria-hidden />{" "}
          {canEdit ? "Set the start and closing dates" : "No plan yet"}
        </button>
      ) : (
        <div
          ref={box}
          className="relative mt-4"
          onMouseLeave={() => setTip(null)}
        >
          {/* axis */}
          <div
            className="relative ml-24 mr-16 h-5 text-[10px] font-semibold text-slate-500 dark:text-gray-400 sm:mr-24"
            aria-hidden
          >
            {ticks.map((t, i) => (
              <span
                key={i}
                className={`absolute top-0 whitespace-nowrap ${i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`}
                style={{ left: `${x(t)}%` }}
              >
                {fmt(t)}
              </span>
            ))}
          </div>
          <div className="relative">
            <ul className="space-y-1.5" aria-label="Stages, planned and actual">
              {rows.map(({ stage, view }) => {
                const M = STATUS_META[stage];
                const color = statusColor(stage, dark);
                const stays = p.stays.filter((s) => s.stage === stage);
                const ps = view?.plannedStart ? dayOf(view.plannedStart) : null;
                const pe = view?.plannedEnd ? dayOf(view.plannedEnd) + 1 : null;
                const over = (view?.overrunDays ?? 0) > 0;
                const summary =
                  stage === "ON_HOLD"
                    ? dayWord(Math.round(period.onHoldDays))
                    : view?.state === "skipped"
                      ? "skipped"
                      : view?.state === "upcoming"
                        ? `${view.plannedDays ?? "–"}d planned`
                        : `${Math.max(view?.state === "current" ? 0 : 1, Math.round(view?.actualDays ?? 0))} / ${view?.plannedDays ?? "–"}d`;
                return (
                  <li key={stage} className="flex items-center gap-2">
                    <span className="flex w-[5.5rem] shrink-0 items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-gray-200">
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-lg text-white"
                        style={{ backgroundColor: color }}
                      >
                        <M.icon className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <span className="truncate">{M.label}</span>
                    </span>
                    <div className="relative h-8 flex-1 rounded-xl bg-slate-50 dark:bg-gray-800/40">
                      {ps !== null && pe !== null && (
                        <span
                          tabIndex={0}
                          role="img"
                          className="absolute inset-y-1 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          style={{
                            left: `${x(ps)}%`,
                            width: `${Math.max(0.8, x(pe) - x(ps))}%`,
                            backgroundColor: `${color}33`,
                          }}
                          onMouseEnter={(e) =>
                            show(e, `${M.label}: planned`, [
                              `${fmt(ps)} – ${fmt(pe - 1)}`,
                              dayWord(pe - ps),
                            ])
                          }
                          onFocus={(e) =>
                            show(e, `${M.label}: planned`, [
                              `${fmt(ps)} – ${fmt(pe - 1)}`,
                              dayWord(pe - ps),
                            ])
                          }
                          onBlur={() => setTip(null)}
                          aria-label={`${M.label} planned ${fmt(ps)} to ${fmt(pe - 1)}`}
                        />
                      )}
                      {stays.map((s, i) => {
                        const a = dayOf(s.enteredAt);
                        const b = (s.leftAt ? dayOf(s.leftAt) : today) + 1;
                        const cut =
                          pe !== null && stage !== "ON_HOLD"
                            ? Math.min(Math.max(pe, a), b)
                            : b;
                        const len = Math.max(
                          0,
                          (Date.parse(s.leftAt ?? new Date().toISOString()) -
                            Date.parse(s.enteredAt)) /
                            DAY,
                        );
                        const lines = [
                          `${fmt(a)} – ${s.leftAt ? fmt(b - 1) : "now"}`,
                          `${len < 1 ? "under a day" : dayWord(Math.round(len))}${!s.leftAt ? " so far" : ""}`,
                        ];
                        return (
                          <React.Fragment key={i}>
                            <motion.span
                              tabIndex={0}
                              role="img"
                              initial={{ scaleX: 0 }}
                              animate={{ scaleX: 1 }}
                              transition={{ duration: 0.6, delay: 0.05 * i }}
                              className={`absolute top-[10px] h-3 origin-left rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${stage === "ON_HOLD" ? "bg-[repeating-linear-gradient(135deg,currentColor_0_3px,transparent_3px_6px)]" : ""}`}
                              style={{
                                left: `${x(a)}%`,
                                width: `${Math.max(0.8, x(cut) - x(a))}%`,
                                backgroundColor:
                                  stage === "ON_HOLD" ? undefined : color,
                                color,
                              }}
                              onMouseEnter={(e) =>
                                show(e, `${M.label}: actual`, lines)
                              }
                              onFocus={(e) =>
                                show(e, `${M.label}: actual`, lines)
                              }
                              onBlur={() => setTip(null)}
                              aria-label={`${M.label} actual ${lines.join(", ")}`}
                            />
                            {cut < b && (
                              <motion.span
                                initial={{ scaleX: 0 }}
                                animate={{ scaleX: 1 }}
                                transition={{ duration: 0.5, delay: 0.5 }}
                                className="absolute top-[10px] h-3 origin-left rounded-full"
                                style={{
                                  left: `calc(${x(cut)}% + 2px)`,
                                  width: `calc(${x(b) - x(cut)}% - 2px)`,
                                  backgroundColor: CRITICAL,
                                }}
                                onMouseEnter={(e) =>
                                  show(e, `${M.label}: beyond the plan`, [
                                    `${dayWord(b - cut)} over`,
                                  ])
                                }
                                aria-hidden
                              />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                    <span
                      className={`flex w-14 shrink-0 items-center justify-end gap-1 text-[11px] font-bold tabular-nums sm:w-[5.5rem] ${over ? "text-red-700 dark:text-red-300" : "text-slate-600 dark:text-gray-300"}`}
                    >
                      {over && (
                        <AlertTriangle
                          className="h-3 w-3 shrink-0"
                          aria-label="Over the plan"
                        />
                      )}
                      {stage === "ON_HOLD" && (
                        <PauseCircle className="h-3 w-3 shrink-0" aria-hidden />
                      )}
                      {view?.state === "done" && !over && (
                        <Check
                          className="h-3 w-3 shrink-0 text-green-700 dark:text-green-400"
                          aria-label="Done"
                        />
                      )}
                      <span className="truncate">{summary}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {/* today */}
            {today >= geo.min && today <= geo.max && (
              <div
                className="pointer-events-none absolute inset-y-0 left-24 right-16 sm:right-24"
                aria-hidden
              >
                <span
                  className="absolute -inset-y-1 w-px bg-blue-600 dark:bg-blue-400"
                  style={{ left: `${x(today + 0.5)}%` }}
                >
                  <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-blue-600 dark:bg-blue-400" />
                </span>
              </div>
            )}
          </div>
          {tip && (
            <div
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-xl bg-slate-900 px-3 py-2 text-[11px] text-white dark:bg-gray-100 dark:text-gray-900"
              style={{ left: tip.x, top: tip.y - 6 }}
              role="tooltip"
            >
              <p className="font-bold">{tip.title}</p>
              {tip.lines.map((l) => (
                <p key={l} className="tabular-nums opacity-90">
                  {l}
                </p>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 pl-24 text-[10px] font-semibold text-slate-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-5 rounded bg-blue-500/20" aria-hidden />{" "}
              Planned
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-5 rounded-full bg-blue-600" aria-hidden />{" "}
              Actual
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2 w-5 rounded-full"
                style={{ backgroundColor: CRITICAL }}
                aria-hidden
              />{" "}
              Beyond the plan
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-px bg-blue-600" aria-hidden /> Today
            </span>
          </div>
          {current &&
            current.daysLeft !== null &&
            current.overrunDays === 0 &&
            p.status !== "ON_HOLD" && (
              <p className="mt-3 text-xs text-slate-600 dark:text-gray-300">
                <span className="font-bold">
                  {STATUS_META[current.stage].label}
                </span>{" "}
                is planned to end in{" "}
                {current.daysLeft === 0 ? "today" : dayWord(current.daysLeft)}.
              </p>
            )}
        </div>
      )}

      <PlanModal
        p={p}
        open={edit}
        onClose={() => setEdit(false)}
        onSaved={onSaved}
      />
    </section>
  );
};

/** Dates + stage boundaries; the boundaries rescale when the dates change. */
export const PlanModal: React.FC<{
  p: ProjectDetail;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}> = ({ p, open, onClose, onSaved }) => {
  const { showToast } = useToast();
  const [start, setStart] = useState("");
  const [target, setTarget] = useState("");
  const [ends, setEnds] = useState<number[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const s = p.startDate ?? new Date().toISOString().slice(0, 10);
    const t = p.targetDate ?? "";
    setStart(s);
    setTarget(t);
    setErrors({});
    const planned = STAGES.slice(0, 3).map(
      (st) => p.period.stages.find((v) => v.stage === st)?.plannedEnd ?? null,
    );
    const total = spanDays(s, t);
    setEnds(
      planned.every(Boolean) && p.startDate
        ? clampEnds(datesToEnds(s, planned), total)
        : total >= MIN_PROJECT_DAYS
          ? defaultEnds(total)
          : [],
    );
  }, [open, p]);

  /** New dates: keep the same proportions. */
  const redate = (s: string, t: string) => {
    const oldTotal = spanDays(start, target);
    const total = spanDays(s, t);
    if (total < MIN_PROJECT_DAYS) return setEnds([]);
    if (ends.length === 3 && oldTotal >= MIN_PROJECT_DAYS)
      setEnds(
        clampEnds(
          ends.map((e) => ((e + 1) / oldTotal) * total - 1),
          total,
        ),
      );
    else setEnds(defaultEnds(total));
  };

  const save = async () => {
    const e: Record<string, string> = {};
    if (!start) e.startDate = "Choose the start date";
    if (!target) e.targetDate = "Choose the closing date";
    else if (start && spanDays(start, target) < MIN_PROJECT_DAYS)
      e.targetDate = `At least ${MIN_PROJECT_DAYS} days after the start`;
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await sideProjectsApi.updatePlan(p.id, {
        startDate: start,
        targetDate: target,
        stagePlan: endsToDates(start, ends),
      });
      showToast("Plan saved", "success");
      onClose();
      onSaved();
    } catch (err) {
      const f = failure(err, "The plan wasn't saved");
      if (f.field === "startDate" || f.field === "targetDate")
        setErrors({ [f.field]: f.message });
      showToast(f.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      icon={GanttChartSquare}
      title="Project plan"
      subtitle={p.title}
      footer={
        <>
          <button
            type="button"
            className={secondaryBtn}
            onClick={onClose}
            disabled={busy}
          >
            <Undo2 className="h-4 w-4" /> Cancel
          </button>
          <button
            type="button"
            className={primaryBtn}
            onClick={save}
            disabled={busy || ends.length !== 3}
          >
            {busy ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <Check className="h-4 w-4" />
            )}{" "}
            Save plan
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Start date"
            htmlFor="plan-start"
            error={errors.startDate}
          >
            <IconInput
              id="plan-start"
              icon={CalendarRange}
              type="date"
              value={start}
              invalid={!!errors.startDate}
              onChange={(ev) => (
                setStart(ev.target.value),
                redate(ev.target.value, target)
              )}
              className="[color-scheme:light] dark:[color-scheme:dark]"
            />
          </Field>
          <Field
            label="Closing date"
            htmlFor="plan-target"
            error={errors.targetDate}
          >
            <IconInput
              id="plan-target"
              icon={Flag}
              type="date"
              value={target}
              min={start || undefined}
              invalid={!!errors.targetDate}
              onChange={(ev) => (
                setTarget(ev.target.value),
                redate(start, ev.target.value)
              )}
              className="[color-scheme:light] dark:[color-scheme:dark]"
            />
          </Field>
        </div>
        <div>
          <p className="mb-3 text-[13px] font-semibold text-slate-700 dark:text-gray-200">
            Drag the handles to give each stage its days
          </p>
          <PlanEditor
            start={start}
            target={target}
            ends={ends}
            onChange={setEnds}
            disabled={busy}
          />
        </div>
      </div>
    </FormModal>
  );
};

export default StageTimeline;
