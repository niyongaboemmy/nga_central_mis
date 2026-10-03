import React, { useCallback, useEffect, useState } from "react";
import { CalendarClock, Clock4, Flame, History, MapPin } from "lucide-react";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import { useToast } from "../../contexts/ToastContext";
import { apiError, formatYmd, officeHoursApi, studentName, type StudentCard, type StudentOverview } from "../../api/officeHours";
import { AttendancePill, Card, CardTitle, EmptyState, Muted, Spinner } from "./ohUi";
import AbsenceNoticeButton from "./AbsenceNoticeButton";

/**
 * /my-office-hours (plan §10): a student's office hours -- who, when, where,
 * the next sessions and their own attendance -- in neutral language. Parents
 * see the same card for each linked child.
 */
export const StudentOfficeHoursCard: React.FC<{ data: StudentOverview; name?: string; canNotify?: boolean; onChanged?: () => void }> = ({
  data,
  name,
  canNotify,
  onChanged,
}) => {
  const active = data.assignments.filter((a) => a.status === "ACTIVE");
  const next = data.upcoming[0];
  const stats = data.stats;
  return (
    <div className="space-y-5">
      {name && <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{name}</h2>}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="min-w-0 space-y-5 lg:col-span-3">
          <Card labelledBy={`oh-assign-${data.student_id}`}>
            <CardTitle id={`oh-assign-${data.student_id}`} icon={<Clock4 className="h-4 w-4" aria-hidden />}>Office hours this term</CardTitle>
            {active.length === 0 ? (
              <EmptyState title="No office hours right now" body="If a teacher asks you to come to office hours, it will appear here and on your timetable." />
            ) : (
              <ul className="space-y-3">
                {active.map((a) => (
                  <li
                    key={a.assignment_id}
                    className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"
                    style={a.subject_color ? { borderLeftColor: a.subject_color, borderLeftWidth: 4 } : undefined}
                  >
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {a.title}
                      {a.teacher_name ? <span className="font-normal text-slate-700 dark:text-slate-200"> with {a.teacher_name}</span> : null}
                    </p>
                    <Muted>
                      {a.days_label} · {a.start_time}–{a.end_time}
                    </Muted>
                    {a.location && (
                      <Muted className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" aria-hidden /> {a.location}
                      </Muted>
                    )}
                    <Muted className="text-xs">
                      From {formatYmd(a.effective_from)} to {formatYmd(a.effective_to)}
                    </Muted>
                  </li>
                ))}
              </ul>
            )}
            {active.length > 0 && (
              <p className="mt-4 text-sm text-slate-700 dark:text-slate-200">
                Office hours are mandatory. If you can't come, tell your teacher before the session.
              </p>
            )}
          </Card>

          <Card labelledBy={`oh-history-${data.student_id}`}>
            <CardTitle id={`oh-history-${data.student_id}`} icon={<History className="h-4 w-4" aria-hidden />}>My sessions</CardTitle>
            {data.history.length === 0 ? (
              <Muted>No sessions yet.</Muted>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.history.slice(0, 30).map((h) => (
                  <li key={h.session_id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{formatYmd(h.session_date)}</p>
                      <p className="truncate text-xs text-slate-600 dark:text-slate-300">{[h.title, h.teacher_name].filter(Boolean).join(" · ")}</p>
                    </div>
                    {h.state === "cancelled" ? (
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Cancelled{h.cancel_reason === "CLOSURE" ? " (school closed)" : ""}</span>
                    ) : h.state === "held" ? (
                      <AttendancePill status={h.status} />
                    ) : (
                      <span className="text-xs text-slate-600 dark:text-slate-300">Not marked yet</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Card labelledBy={`oh-next-${data.student_id}`}>
            <CardTitle id={`oh-next-${data.student_id}`} icon={<CalendarClock className="h-4 w-4" aria-hidden />}>Next session</CardTitle>
            {next ? (
              <div>
                <p className="text-xl font-bold text-slate-900 dark:text-slate-50">{formatYmd(next.session_date)}</p>
                <Muted>
                  {next.start_time}–{next.end_time}
                  {next.location ? ` · ${next.location}` : ""}
                </Muted>
                <Muted className="text-xs">{[next.title, next.teacher_name].filter(Boolean).join(" · ")}</Muted>
                {canNotify && <AbsenceNoticeButton session={next} onSent={onChanged} />}
                {data.upcoming.length > 1 && (
                  <ul className="mt-3 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                    {data.upcoming.slice(1, 5).map((u) => (
                      <li key={u.session_id}>
                        {formatYmd(u.session_date)} · {u.start_time}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <Muted>Nothing in the next two weeks.</Muted>
            )}
          </Card>

          {stats && stats.expected > 0 && (
            <Card labelledBy={`oh-stats-${data.student_id}`}>
              <CardTitle id={`oh-stats-${data.student_id}`} icon={<Flame className="h-4 w-4 text-orange-500" aria-hidden />}>Attendance</CardTitle>
              <p className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-50">{stats.rate === null ? "—" : `${Math.round(stats.rate)}%`}</p>
              <Muted className="text-xs">
                {stats.present + stats.late} attended · {stats.excused} excused · {stats.absent} missed, of {stats.expected}
              </Muted>
              {stats.current_absent_streak === 0 && stats.longest_attended_streak >= 2 && (
                <p className="mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">Best run: {stats.longest_attended_streak} sessions in a row</p>
              )}
              {stats.current_absent_streak >= 2 && (
                <p className="mt-2 text-sm font-semibold text-amber-800 dark:text-amber-200">You missed the last {stats.current_absent_streak} sessions — please come next time.</p>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

const MyOfficeHours: React.FC = () => {
  const { selectedTermId } = useAcademicPeriod();
  const { showToast } = useToast();
  const [own, setOwn] = useState<StudentOverview | null>(null);
  const [children, setChildren] = useState<Array<StudentOverview & { student: StudentCard | null }>>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [me, kids] = await Promise.allSettled([officeHoursApi.me({ term_id: selectedTermId }), officeHoursApi.children(selectedTermId)]);
      if (me.status === "fulfilled") setOwn(me.value.data.data);
      if (kids.status === "fulfilled") setChildren(kids.value.data.data.children);
      if (me.status === "rejected" && kids.status === "rejected") showToast(apiError(me.reason, "Couldn't load office hours"), "error");
    } finally {
      setLoading(false);
    }
  }, [selectedTermId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const showOwn = own && (own.assignments.length > 0 || children.length === 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-slate-50">
          <Clock4 className="h-6 w-6 text-blue-600" aria-hidden /> {children.length && !showOwn ? "Office hours" : "My office hours"}
        </h1>
        <Muted>Support sessions with your teachers after the last period.</Muted>
      </header>
      {loading && !own && !children.length ? (
        <Spinner label="Loading office hours" />
      ) : (
        <>
          {showOwn && own && <StudentOfficeHoursCard data={own} canNotify onChanged={() => void load()} />}
          {children.map((c) => (
            <StudentOfficeHoursCard key={c.student_id} data={c} name={studentName(c.student)} />
          ))}
          {!showOwn && children.length === 0 && <EmptyState title="Nothing to show" />}
        </>
      )}
    </div>
  );
};

export default MyOfficeHours;
