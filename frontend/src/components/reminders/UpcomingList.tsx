import React, { useState } from "react";
import { AlarmClock, BellRing, CheckCheck, Clock3, TimerReset } from "lucide-react";
import { remindersApi, type ReminderJob } from "../../api/reminders";
import { useToast } from "../../contexts/ToastContext";
import { formatOffset, kigaliClock, kigaliYmd, KIND_META } from "./agendaUtils";

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Scheduled", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  sending: { label: "Sending", className: "bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-200" },
  sent: { label: "Sent", className: "bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-200" },
  acked: { label: "Seen", className: "bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-100" },
};

const dayLabel = (iso: string) => {
  const ymd = kigaliYmd(iso);
  const today = kigaliYmd(new Date());
  const tomorrow = kigaliYmd(new Date(Date.now() + 86_400_000));
  if (ymd === today) return "Today";
  if (ymd === tomorrow) return "Tomorrow";
  if (ymd < today) return "Earlier";
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
};

/** The reminders the hub has planned or sent for the next day and a half. */
export const UpcomingList: React.FC<{ jobs: ReminderJob[]; remindersOn: boolean; onChanged: () => void }> = ({
  jobs,
  remindersOn,
  onChanged,
}) => {
  const { showToast } = useToast();
  const [busy, setBusy] = useState<number | null>(null);

  const act = async (job: ReminderJob, action: "ack" | "snooze") => {
    setBusy(job.job_id);
    try {
      if (action === "ack") await remindersApi.ack(job.job_id);
      else await remindersApi.snooze(job.job_id);
      showToast(action === "ack" ? "Marked as seen" : "Snoozed for 5 minutes", "success");
      onChanged();
    } catch (e: any) {
      showToast(e?.response?.data?.message || "That didn't work", "warning");
    } finally {
      setBusy(null);
    }
  };

  const groups = jobs.reduce<Record<string, ReminderJob[]>>((acc, job) => {
    const label = dayLabel(job.fire_at);
    (acc[label] ||= []).push(job);
    return acc;
  }, {});

  return (
    <section aria-labelledby="upcoming-title" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-700/60 dark:bg-slate-900">
      <h2 id="upcoming-title" className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
        <AlarmClock className="h-5 w-5 text-brand-600 dark:text-brand-200" /> Reminders
      </h2>
      {jobs.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {remindersOn
            ? "Nothing planned for the next day and a half. New lessons and deadlines are picked up automatically."
            : "Turn reminders on to see what you'll be reminded about."}
        </p>
      ) : (
        <div className="mt-2 space-y-3">
          {Object.entries(groups).map(([label, items]) => (
            <div key={label}>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
              <ul className="mt-1 space-y-1.5">
                {items.map((job) => {
                  const status = STATUS[job.status] ?? STATUS.pending;
                  const sent = job.status === "sent";
                  return (
                    <li key={job.job_id} className="flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {job.status === "pending" ? <Clock3 className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {job.title}
                          {Number(job.critical) === 1 && (
                            <span className="ml-1.5 rounded-full bg-danger-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-danger-700 dark:bg-danger-500/15 dark:text-red-300">
                              Important
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-slate-600 dark:text-slate-300">
                          {KIND_META[job.source_type as keyof typeof KIND_META]?.label ?? job.source_type} ·{" "}
                          {job.source_type === "briefing"
                            ? `at ${kigaliClock(job.fire_at)}`
                            : `${kigaliClock(job.fire_at)} (${formatOffset(job.offset_min)} before ${kigaliClock(job.event_start)})`}
                        </p>
                      </div>
                      <span className={`hidden rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline ${status.className}`}>{status.label}</span>
                      {sent && (
                        <div className="flex flex-shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => act(job, "ack")}
                            disabled={busy === job.job_id}
                            aria-label={`Mark "${job.title}" as seen`}
                            className="rounded-lg p-1.5 text-slate-500 transition dark:text-slate-300 hover:bg-success-100 hover:text-success-700 dark:hover:bg-success-500/15"
                          >
                            <CheckCheck className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => act(job, "snooze")}
                            disabled={busy === job.job_id}
                            aria-label={`Snooze "${job.title}" for 5 minutes`}
                            className="rounded-lg p-1.5 text-slate-500 transition dark:text-slate-300 hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-600/20"
                          >
                            <TimerReset className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
