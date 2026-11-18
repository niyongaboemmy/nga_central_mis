import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertOctagon,
  ArrowRight,
  CalendarCheck2,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  LayoutList,
  ListTree,
  MoreHorizontal,
  NotebookPen,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  failure,
  sideProjectsApi,
  type ProjectDetail,
  type Report,
  type ReportFile,
} from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import UserAvatar from "../../ui/UserAvatar";
import Modal from "../../ui/Modal";
import { AssetPreview } from "./DocumentsPanel";
import ReportModal, { MOODS } from "./ReportModal";
import {
  STATUS_META,
  Spinner,
  cardCls,
  chipCls,
  primaryBtn,
  statusColor,
  useIsDark,
} from "../ui";

/**
 * Progress reports, built to stay readable with hundreds of entries:
 *   pulse   -- totals, the last 14 days as small bars, and a nudge when today has no report;
 *   toolbar -- search, filters (mine / blockers / PDFs / one teammate), timeline or compact view;
 *   feed    -- grouped by week (collapsible, with count and hours), four weeks at a time.
 */

type Filter = "all" | "mine" | "blockers" | "files";
type View = "timeline" | "compact";

const DAY = 86_400_000;
const todayIso = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);
};
const dayNum = (iso: string) =>
  Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const ago = (iso: string) => dayNum(todayIso()) - dayNum(iso);
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    ...o,
    timeZone: "UTC",
  });
/** Monday of the week the day falls in. */
const weekOf = (iso: string) => {
  const n = dayNum(iso);
  const dow = (new Date(n * DAY).getUTCDay() + 6) % 7;
  return new Date((n - dow) * DAY).toISOString().slice(0, 10);
};
const weekLabel = (monday: string) => {
  const thisWeek = weekOf(todayIso());
  if (monday === thisWeek) return "This week";
  if (dayNum(thisWeek) - dayNum(monday) === 7) return "Last week";
  const sunday = new Date((dayNum(monday) + 6) * DAY)
    .toISOString()
    .slice(0, 10);
  return `${fmt(monday, { day: "numeric", month: "short" })} – ${fmt(sunday, { day: "numeric", month: "short" })}`;
};
const round1 = (n: number) => Math.round(n * 10) / 10;
const WEEKS_PAGE = 4;

/** The last 14 days as bars: height = hours (or one notch per report when no hours). */
const Pulse14: React.FC<{ reports: Report[] }> = ({ reports }) => {
  const days = useMemo(() => {
    const today = dayNum(todayIso());
    return Array.from({ length: 14 }, (_, i) => {
      const n = today - 13 + i;
      const iso = new Date(n * DAY).toISOString().slice(0, 10);
      const list = reports.filter((r) => r.workDate === iso);
      return {
        iso,
        count: list.length,
        hours: round1(list.reduce((s, r) => s + (r.hours ?? 0), 0)),
        today: n === today,
      };
    });
  }, [reports]);
  const max = Math.max(1, ...days.map((d) => d.hours || d.count));
  return (
    <div>
      <div
        className="flex h-12 items-end gap-[3px]"
        role="img"
        aria-label={`Last 14 days: ${days.filter((d) => d.count).length} days with a report`}
      >
        {days.map((d) => {
          const v = d.hours || d.count;
          return (
            <span
              key={d.iso}
              className="group relative flex h-full flex-1 items-end"
              title={`${fmt(d.iso, { weekday: "short", day: "numeric", month: "short" })}: ${d.count} report${d.count === 1 ? "" : "s"}${d.hours ? `, ${d.hours} h` : ""}`}
            >
              <motion.span
                className={`w-full rounded-[4px] ${v ? "bg-blue-600 dark:bg-blue-400" : "bg-slate-200 dark:bg-gray-700/70"}`}
                initial={{ height: 0 }}
                animate={{
                  height: v ? `${Math.max(18, (v / max) * 100)}%` : "12%",
                }}
                transition={{ duration: 0.5 }}
              />
              {d.today && (
                <span
                  className="absolute -bottom-2 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-blue-600 dark:bg-blue-400"
                  aria-hidden
                />
              )}
            </span>
          );
        })}
      </div>
      <div className="mt-2.5 flex justify-between text-[10px] font-medium text-slate-500 dark:text-gray-400">
        <span>{fmt(days[0].iso, { day: "numeric", month: "short" })}</span>
        <span>Today</span>
      </div>
    </div>
  );
};

const Chip: React.FC<{
  children: React.ReactNode;
  className?: string;
  title?: string;
}> = ({ children, className = "", title }) => (
  <span
    title={title}
    className={`inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-gray-700/60 dark:text-gray-200 ${className}`}
  >
    {children}
  </span>
);

const Actions: React.FC<{
  onEdit: () => void;
  onDelete: () => void;
  busy: boolean;
}> = ({ onEdit, onDelete, busy }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Report actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => (e.stopPropagation(), setOpen((o) => !o))}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-white"
      >
        {busy ? (
          <Spinner className="h-4 w-4" />
        ) : (
          <MoreHorizontal className="h-4 w-4" />
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-10 w-36 overflow-hidden rounded-2xl border border-slate-900/[0.07] bg-white p-1.5 dark:border-white/10 dark:bg-gray-900"
          onMouseLeave={() => setOpen(false)}
        >
          <button
            role="menuitem"
            type="button"
            onClick={(e) => (e.stopPropagation(), setOpen(false), onEdit())}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-gray-100 dark:hover:bg-gray-700/50"
          >
            <Pencil className="h-4 w-4" /> Edit
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={(e) => (e.stopPropagation(), setOpen(false), onDelete())}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      )}
    </div>
  );
};

/** One report in the timeline: date block, what was done (clamped), next, blockers, chips. */
const ReportItem: React.FC<{
  r: Report;
  showAuthor: boolean;
  canManage: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onOpenFile: (f: ReportFile) => void;
  firstOfDay?: boolean;
}> = ({
  r,
  showAuthor,
  canManage,
  deleting,
  onEdit,
  onDelete,
  onOpenFile,
  firstOfDay = true,
}) => {
  const dark = useIsDark();
  const [more, setMore] = useState(false);
  const mood = MOODS.find((m) => m.v === r.mood);
  const long = r.did.length > 220 || r.did.split("\n").length > 3;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: deleting ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex gap-3 rounded-2xl p-3 transition hover:bg-slate-50 dark:hover:bg-gray-800/40"
    >
      {firstOfDay ? (
        <div
          className="flex w-11 shrink-0 flex-col items-center rounded-xl bg-slate-100 py-1.5 dark:bg-gray-800"
          aria-label={fmt(r.workDate, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        >
          <span className="text-[10px] font-semibold uppercase text-slate-600 dark:text-gray-300">
            {fmt(r.workDate, { weekday: "short" })}
          </span>
          <span className="text-base font-bold leading-tight tabular-nums text-slate-900 dark:text-white">
            {fmt(r.workDate, { day: "numeric" })}
          </span>
        </div>
      ) : (
        <span className="w-11 shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {showAuthor && (
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-gray-300">
                <UserAvatar
                  name={r.author}
                  userId={r.authorId}
                  size={18}
                  decorative
                />{" "}
                {r.author}
              </p>
            )}
            <p
              className={`whitespace-pre-line text-sm leading-relaxed text-slate-800 dark:text-gray-100 ${long && !more ? "line-clamp-3" : ""}`}
            >
              {r.did}
            </p>
            {long && (
              <button
                type="button"
                onClick={() => setMore((m) => !m)}
                className="mt-0.5 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300"
              >
                {more ? "Show less" : "Show more"}
              </button>
            )}
          </div>
          {canManage && (
            <Actions onEdit={onEdit} onDelete={onDelete} busy={deleting} />
          )}
        </div>
        {r.nextSteps && (
          <p className="mt-1.5 flex gap-1.5 text-sm text-slate-600 dark:text-gray-300">
            <ArrowRight
              className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400"
              aria-label="Next"
            />
            <span className="whitespace-pre-line">{r.nextSteps}</span>
          </p>
        )}
        {r.blockers && (
          <p className="mt-1.5 flex gap-1.5 rounded-xl bg-amber-50 px-2.5 py-1.5 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
            <AlertOctagon
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-label="Blocker"
            />
            <span className="whitespace-pre-line">{r.blockers}</span>
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {r.hours !== null && (
            <Chip title="Hours spent">
              <Clock3 className="h-3 w-3" aria-hidden /> {r.hours}h
            </Chip>
          )}
          {mood && (
            <Chip title={mood.label}>
              <mood.icon
                className="h-3 w-3"
                style={{ color: mood.color }}
                aria-hidden
              />{" "}
              {mood.label}
            </Chip>
          )}
          {r.stage && (
            <Chip title="Stage when reported">
              {React.createElement(STATUS_META[r.stage].icon, {
                className: "h-3 w-3",
                style: { color: statusColor(r.stage, dark) },
                "aria-hidden": true,
              })}{" "}
              {STATUS_META[r.stage].label}
            </Chip>
          )}
          {r.files.map((f) => (
            <button
              key={f.assetId}
              type="button"
              onClick={() => onOpenFile(f)}
              className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2.5 text-[11px] font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-gray-700/60 dark:text-gray-200 dark:hover:bg-blue-500/15 dark:hover:text-blue-200"
            >
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-[7px] font-black text-white"
                aria-hidden
              >
                PDF
              </span>
              <span className="truncate">{f.name}</span>
            </button>
          ))}
          {r.editedAt && (
            <span
              className="text-[11px] text-slate-500 dark:text-gray-400"
              title={new Date(r.editedAt).toLocaleString()}
            >
              edited
            </span>
          )}
        </div>
      </div>
    </motion.li>
  );
};

/** Dense row for long histories; expands in place. */
const CompactRow: React.FC<{
  r: Report;
  showAuthor: boolean;
  canManage: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onOpenFile: (f: ReportFile) => void;
  firstOfDay?: boolean;
}> = (props) => {
  const { r, showAuthor, canManage, deleting, onEdit, onDelete } = props;
  const [open, setOpen] = useState(false);
  if (open) return <ReportItem {...props} />;
  return (
    <li
      className={`flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-slate-50 dark:hover:bg-gray-800/40 ${deleting ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg"
        aria-label={`Expand report of ${fmt(r.workDate, { day: "numeric", month: "long" })}`}
      >
        <span className="w-14 shrink-0 text-xs font-semibold tabular-nums text-slate-500 dark:text-gray-400">
          {fmt(r.workDate, { weekday: "short", day: "numeric" })}
        </span>
        {showAuthor && (
          <UserAvatar
            name={r.author}
            userId={r.authorId}
            size={20}
            decorative
          />
        )}
        <span className="min-w-0 flex-1 truncate text-sm text-slate-800 dark:text-gray-100">
          {r.did}
        </span>
        {r.blockers && (
          <AlertOctagon
            className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300"
            aria-label="Has a blocker"
          />
        )}
        {r.files.length > 0 && (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-slate-500 dark:text-gray-400"
            title="PDF attachments"
          >
            <Paperclip className="h-3.5 w-3.5" aria-hidden /> {r.files.length}
          </span>
        )}
        <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-600 dark:text-gray-300">
          {r.hours !== null ? `${r.hours}h` : "–"}
        </span>
      </button>
      {canManage && (
        <Actions onEdit={onEdit} onDelete={onDelete} busy={deleting} />
      )}
    </li>
  );
};

const ReportsFeed: React.FC<{
  p: ProjectDetail;
  meId: number;
  onChanged: () => void;
}> = ({ p, meId, onChanged }) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canEdit = p.rights.edit;
  const reports = p.updates;
  const [modal, setModal] = useState<{ report: Report | null } | null>(null);
  const [file, setFile] = useState<ReportFile | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [author, setAuthor] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>(() => {
    try {
      return (localStorage.getItem("sp.reports.view") as View) || "timeline";
    } catch {
      return "timeline";
    }
  });
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [weeks, setWeeks] = useState(WEEKS_PAGE);
  const setViewSaved = (v: View) => {
    setView(v);
    try {
      localStorage.setItem("sp.reports.view", v);
    } catch {
      /* private mode */
    }
  };

  const authors = useMemo(() => {
    const m = new Map<number, { id: number; name: string; n: number }>();
    for (const r of reports)
      m.set(r.authorId, {
        id: r.authorId,
        name: r.author,
        n: (m.get(r.authorId)?.n ?? 0) + 1,
      });
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [reports]);
  const team = authors.length > 1;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return reports.filter((r) => {
      if (filter === "mine" && r.authorId !== meId) return false;
      if (filter === "blockers" && !r.blockers) return false;
      if (filter === "files" && !r.files.length) return false;
      if (author && r.authorId !== author) return false;
      if (
        needle &&
        ![
          r.did,
          r.nextSteps ?? "",
          r.blockers ?? "",
          r.author,
          ...r.files.map((f) => f.name),
        ].some((t) => t.toLowerCase().includes(needle))
      )
        return false;
      return true;
    });
  }, [reports, filter, author, q, meId]);

  const groups = useMemo(() => {
    const out: Array<{ week: string; items: Report[]; hours: number }> = [];
    for (const r of shown) {
      const w = weekOf(r.workDate);
      const g = out[out.length - 1];
      if (g && g.week === w) (g.items.push(r), (g.hours += r.hours ?? 0));
      else out.push({ week: w, items: [r], hours: r.hours ?? 0 });
    }
    return out;
  }, [shown]);

  const totalHours = round1(reports.reduce((s, r) => s + (r.hours ?? 0), 0));
  const thisWeek = reports.filter(
    (r) => weekOf(r.workDate) === weekOf(todayIso()),
  ).length;
  const last = reports[0]?.workDate ?? null;
  const since = last ? ago(last) : null;
  const reportedToday = since === 0;
  const working = ["PLANNING", "IN_PROGRESS", "TESTING"].includes(p.status);

  const remove = async (r: Report) => {
    if (
      !(await confirm({
        title: "Delete this report?",
        tone: "danger",
        confirmText: "Delete",
        message: r.files.length ? "Its PDF attachments go too." : undefined,
      }))
    )
      return;
    setDeleting(r.id);
    try {
      await sideProjectsApi.removeUpdate(p.id, r.id);
      showToast("Report deleted", "success");
      onChanged();
    } catch (e) {
      showToast(failure(e, "The report wasn't deleted").message, "error");
    } finally {
      setDeleting(null);
    }
  };

  const stats = [
    { icon: NotebookPen, label: "Reports", value: reports.length },
    { icon: CalendarCheck2, label: "This week", value: thisWeek },
    { icon: Clock3, label: "Hours", value: totalHours },
  ];
  const filtered = filter !== "all" || author !== null || q.trim() !== "";
  const visible = groups.slice(0, weeks);

  return (
    <div className="space-y-4">
      {/* Pulse: totals, last 14 days, and what to do next */}
      <section
        className={`${cardCls} p-4 sm:p-5`}
        aria-label="Reporting summary"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap gap-5">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-gray-400">
                  <s.icon className="h-3.5 w-3.5" aria-hidden /> {s.label}
                </p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {s.value}
                </p>
              </div>
            ))}
          </div>
          {canEdit && (
            <button
              type="button"
              className={primaryBtn}
              onClick={() => setModal({ report: null })}
            >
              <Plus className="h-4 w-4" /> New report
            </button>
          )}
        </div>
        {reports.length > 0 && (
          <div className="mt-4 grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Pulse14 reports={reports} />
            <div className="sm:w-56">
              {reportedToday ? (
                <p className="flex items-center gap-2 rounded-2xl bg-green-50 px-3 py-2 text-xs font-semibold text-green-800 dark:bg-green-500/10 dark:text-green-200">
                  <Check className="h-4 w-4 shrink-0" aria-hidden /> Reported
                  today. Keep it up.
                </p>
              ) : canEdit && working ? (
                <button
                  type="button"
                  onClick={() => setModal({ report: null })}
                  className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-xs font-semibold transition ${since !== null && since >= 3 ? "bg-amber-50 text-amber-900 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-100 dark:hover:bg-amber-500/20" : "bg-blue-50 text-blue-800 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-100 dark:hover:bg-blue-500/20"}`}
                >
                  <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    {since !== null && since >= 3
                      ? `No report for ${since} days. Log what you did today.`
                      : "Log today's work in a minute."}
                  </span>
                </button>
              ) : (
                <p className="text-xs text-slate-500 dark:text-gray-400">
                  Last report{" "}
                  {since === null
                    ? "never"
                    : since === 1
                      ? "yesterday"
                      : `${since} days ago`}
                  .
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {reports.length === 0 ? (
        <section className={`${cardCls} p-6 sm:p-8`}>
          <div className="mx-auto max-w-md text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
              <NotebookPen className="h-6 w-6" aria-hidden />
            </span>
            <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-white">
              No reports yet
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
              A short report after each work session keeps your supervisor in
              the loop and builds your activity graph.
            </p>
            <ol className="mt-5 grid gap-2 text-left sm:grid-cols-3">
              {[
                [Check, "What you did", "One or two sentences"],
                [ArrowRight, "What's next", "And anything blocking"],
                [FileText, "Proof", "Hours and PDFs, optional"],
              ].map(([Icon, t, c], i) => (
                <li
                  key={i}
                  className="rounded-2xl bg-slate-50 p-3 dark:bg-gray-800/40"
                >
                  {React.createElement(Icon as React.ElementType, {
                    className: "h-4 w-4 text-blue-600 dark:text-blue-300",
                    "aria-hidden": true,
                  })}
                  <p className="mt-1.5 text-xs font-bold text-slate-800 dark:text-gray-100">
                    {t as string}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-gray-400">
                    {c as string}
                  </p>
                </li>
              ))}
            </ol>
            {canEdit && (
              <button
                type="button"
                className={`${primaryBtn} mt-5`}
                onClick={() => setModal({ report: null })}
              >
                <Plus className="h-4 w-4" /> Record the first report
              </button>
            )}
          </div>
        </section>
      ) : (
        <section className={`${cardCls} p-2 sm:p-3`} aria-label="Reports">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 p-2">
            <div className="relative min-w-[11rem] flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search reports"
                aria-label="Search reports"
                className="h-9 w-full rounded-full border border-slate-900/[0.07] bg-white pl-9 pr-8 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 dark:border-white/10 dark:bg-gray-800/40 dark:text-white"
              />
              {q && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQ("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div
              className="flex flex-wrap gap-1.5"
              role="radiogroup"
              aria-label="Show"
            >
              {(
                [
                  ["all", "All", reports.length],
                  [
                    "mine",
                    "Mine",
                    reports.filter((r) => r.authorId === meId).length,
                  ],
                  [
                    "blockers",
                    "Blockers",
                    reports.filter((r) => r.blockers).length,
                  ],
                  [
                    "files",
                    "With PDFs",
                    reports.filter((r) => r.files.length).length,
                  ],
                ] as Array<[Filter, string, number]>
              )
                .filter(
                  ([k, , n]) =>
                    k === "all" || (n > 0 && !(k === "mine" && !team)),
                )
                .map(([k, label, n]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={filter === k}
                    onClick={() => setFilter(k)}
                    className={chipCls(filter === k)}
                  >
                    {label}
                    <span
                      className={`rounded-full px-1.5 text-[10px] tabular-nums ${filter === k ? "bg-blue-800" : "bg-slate-100 dark:bg-gray-700/60"}`}
                    >
                      {n}
                    </span>
                  </button>
                ))}
            </div>
            <div
              className="ml-auto flex items-center gap-1 rounded-full border border-slate-900/[0.07] bg-white p-1 dark:border-white/10 dark:bg-gray-800/40"
              role="radiogroup"
              aria-label="Layout"
            >
              <button
                type="button"
                role="radio"
                aria-checked={view === "timeline"}
                title="Timeline"
                aria-label="Timeline"
                onClick={() => setViewSaved("timeline")}
                className={`rounded-full p-1.5 ${view === "timeline" ? "bg-blue-600 text-white" : "text-slate-500"}`}
              >
                <ListTree className="h-4 w-4" />
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={view === "compact"}
                title="Compact"
                aria-label="Compact"
                onClick={() => setViewSaved("compact")}
                className={`rounded-full p-1.5 ${view === "compact" ? "bg-blue-600 text-white" : "text-slate-500"}`}
              >
                <LayoutList className="h-4 w-4" />
              </button>
            </div>
          </div>
          {team && (
            <div
              className="flex flex-wrap gap-1.5 px-2 pb-2"
              role="radiogroup"
              aria-label="Reporter"
            >
              {authors.map((a) => {
                const on = author === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setAuthor(on ? null : a.id)}
                    className={`${chipCls(on)} !py-1 !pl-1`}
                  >
                    <UserAvatar
                      name={a.name}
                      userId={a.id}
                      size={20}
                      decorative
                    />{" "}
                    {a.name.split(" ")[0]}
                    <span
                      className={`rounded-full px-1.5 text-[10px] tabular-nums ${on ? "bg-blue-800" : "bg-slate-100 dark:bg-gray-700/60"}`}
                    >
                      {a.n}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {shown.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <p className="text-sm text-slate-600 dark:text-gray-300">
                No report matches.
              </p>
              {filtered && (
                <button
                  type="button"
                  className={chipCls(false)}
                  onClick={() => (setFilter("all"), setAuthor(null), setQ(""))}
                >
                  <X className="h-3.5 w-3.5" /> Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {visible.map((g) => {
                const isClosed = closed.has(g.week);
                return (
                  <section key={g.week} aria-label={weekLabel(g.week)}>
                    <button
                      type="button"
                      aria-expanded={!isClosed}
                      onClick={() =>
                        setClosed((c) => {
                          const n = new Set(c);
                          if (n.has(g.week)) n.delete(g.week);
                          else n.add(g.week);
                          return n;
                        })
                      }
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition hover:bg-slate-50 dark:hover:bg-gray-800/40"
                    >
                      <ChevronDown
                        className={`h-4 w-4 text-slate-400 transition-transform ${isClosed ? "-rotate-90" : ""}`}
                        aria-hidden
                      />
                      <span className="text-sm font-bold text-slate-800 dark:text-gray-100">
                        {weekLabel(g.week)}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-gray-400">
                        {g.items.length} report{g.items.length === 1 ? "" : "s"}
                        {g.hours > 0 ? ` · ${round1(g.hours)}h` : ""}
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {!isClosed && (
                        <motion.ul
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          {g.items.map((r, idx) => {
                            const Row =
                              view === "compact" ? CompactRow : ReportItem;
                            return (
                              <Row
                                key={r.id}
                                r={r}
                                firstOfDay={
                                  idx === 0 ||
                                  g.items[idx - 1].workDate !== r.workDate
                                }
                                showAuthor={team}
                                canManage={
                                  canEdit &&
                                  (r.authorId === meId || p.rights.manageAny)
                                }
                                deleting={deleting === r.id}
                                onEdit={() => setModal({ report: r })}
                                onDelete={() => remove(r)}
                                onOpenFile={setFile}
                              />
                            );
                          })}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </section>
                );
              })}
              {groups.length > weeks && (
                <div className="flex justify-center p-2">
                  <button
                    type="button"
                    onClick={() => setWeeks((w) => w + WEEKS_PAGE)}
                    className={chipCls(false)}
                  >
                    <ChevronDown className="h-3.5 w-3.5" /> Older weeks ·{" "}
                    {groups
                      .slice(weeks)
                      .reduce((n, g) => n + g.items.length, 0)}{" "}
                    more
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <ReportModal
        p={p}
        open={!!modal}
        report={modal?.report ?? null}
        onClose={() => setModal(null)}
        onSaved={onChanged}
      />
      <Modal
        isOpen={!!file}
        onClose={() => setFile(null)}
        title={file?.name ?? ""}
        size="3xl"
        contentClassName="p-3"
      >
        {file ? <AssetPreview assetId={file.assetId} name={file.name} /> : null}
      </Modal>
    </div>
  );
};

export default ReportsFeed;
