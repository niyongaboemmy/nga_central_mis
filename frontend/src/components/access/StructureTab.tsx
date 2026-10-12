import UserAvatar from "../ui/UserAvatar";
import React, { useId, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  GraduationCap,
  Layers,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { GrantRow, Nodes } from "../../api/access";
import { mutedCls, Panel } from "./shared";

// ---------------------------------------------------------------------------
// Structure: who holds which position where -- an interactive organisation
// chart. Coverage first (what is filled, what is vacant), then the school's
// posts, then every programme as a card that opens onto its grades and
// classes. Search finds a person, class or programme; clicking a person shows
// every position they hold; filters surface vacancies and classes with more
// than one class teacher.
// ---------------------------------------------------------------------------

/** Key school posts: shown even when vacant, so gaps are visible. */
const KEY_SCHOOL_POSTS: Array<{ preset: string; label: string }> = [
  { preset: "head_teacher", label: "Head Teacher" },
  { preset: "deputy_head_academics", label: "Deputy Head — Academics" },
  { preset: "deputy_head_discipline", label: "Deputy Head — Discipline" },
];

type Filter = "all" | "vacant" | "shared";

/** "CLASS_TEACHER" -> "Class teacher"; preset names ("Class Teacher") pass through. */
export const roleLabel = (role: string) =>
  /^[A-Z0-9_]+$/.test(role) ? role.charAt(0) + role.slice(1).toLowerCase().replace(/_/g, " ") : role;

/** A person's NGA photo, or their initials. */
const Avatar: React.FC<{ id: number; name: string; size?: "sm" | "md" }> = ({ id, name, size = "sm" }) => (
  <UserAvatar decorative userId={id} name={name} size={size === "md" ? 40 : 28} />
);

/** A person in a position. Clicking shows every position they hold. */
const PersonChip: React.FC<{ p: GrantRow; onPick: (name: string) => void; showRole?: boolean }> = ({
  p,
  onPick,
  showRole = true,
}) => (
  <button
    type="button"
    onClick={() => onPick(p.full_name)}
    title={`${roleLabel(p.title || p.role_name)} — show all of ${p.full_name}'s positions`}
    className="group inline-flex min-h-[36px] max-w-full items-center gap-2 rounded-full border border-border-light bg-white py-1 pl-1 pr-3 text-left text-xs transition-colors hover:border-brand-300 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-slate-500 dark:hover:bg-slate-800"
  >
    <Avatar id={p.user_id} name={p.full_name} />
    <span className="min-w-0">
      <span className="block truncate font-semibold text-text-primary-light dark:text-text-primary-dark">{p.full_name}</span>
      {showRole && (
        <span className={`block truncate text-[11px] ${mutedCls}`}>
          {roleLabel(p.title || p.role_name)}
          {p.valid_until ? ` · until ${p.valid_until}` : ""}
        </span>
      )}
    </span>
  </button>
);

const VacantBadge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-amber-400 px-2.5 py-1 text-xs font-medium text-amber-800 dark:border-amber-500 dark:text-amber-200">
    {children}
  </span>
);

/** Filled vs total as a bar, with the numbers spelled out for screen readers. */
const Coverage: React.FC<{ done: number; total: number; label: string }> = ({ done, total, label }) => {
  const pct = total > 0 ? Math.round((done / total) * 100) : 100;
  const tone = pct === 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="min-w-[8rem]">
      <div className={`flex items-center justify-between text-[11px] ${mutedCls}`}>
        <span>{label}</span>
        <span className="tabular-nums">
          {done}/{total}
        </span>
      </div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div className={`h-full rounded-full ${tone} motion-safe:transition-[width] motion-safe:duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string; hint?: string; tone?: "good" | "warn" | "neutral" }> = ({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
}) => (
  <div className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/70 p-3 backdrop-blur-sm dark:border-slate-700/30 dark:bg-slate-800/50">
    <span
      className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl ${
        tone === "good"
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
          : tone === "warn"
            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
            : "bg-brand-100 text-brand-700 dark:bg-slate-700 dark:text-brand-200"
      }`}
    >
      {icon}
    </span>
    <div className="min-w-0">
      <p className={`truncate text-xs ${mutedCls}`}>{label}</p>
      <p className="text-lg font-bold tabular-nums text-text-primary-light dark:text-text-primary-dark">{value}</p>
      {hint && <p className={`truncate text-[11px] ${mutedCls}`}>{hint}</p>}
    </div>
  </div>
);

export const StructureTab: React.FC<{
  positions: GrantRow[];
  nodes: Nodes | null;
  /** When the viewer may assign positions: vacancies offer a shortcut to the Positions tab. */
  onAssign?: () => void;
}> = ({ positions, nodes, onAssign }) => {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const searchId = useId();

  const at = (type: string, id: number | null) =>
    positions.filter((p) => p.scope_type === type && (id === null || p.scope_id === id));

  const programs = nodes?.programs ?? [];
  const grades = nodes?.grades ?? [];
  const classes = nodes?.classGroups ?? [];
  const departments = nodes?.departments ?? [];
  const school = at("SCHOOL", null);
  const platform = at("PLATFORM", null);

  // Coverage across the whole school, before any filtering.
  const stats = useMemo(() => {
    const keyFilled = KEY_SCHOOL_POSTS.filter((k) => school.some((p) => p.preset_key === k.preset)).length;
    const led = programs.filter((p) => at("PROGRAM", p.id).length > 0).length;
    const taught = classes.filter((c) => at("CLASS_GROUP", c.id).length > 0).length;
    const shared = classes.filter((c) => at("CLASS_GROUP", c.id).length > 1).length;
    const people = new Set(positions.filter((p) => p.scope_type !== "SELF").map((p) => p.user_id)).size;
    return { keyFilled, led, taught, shared, people };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, nodes]);

  const q = query.trim().toLowerCase();
  const matches = (text: string | null | undefined) => !q || (text ?? "").toLowerCase().includes(q);
  const holdersMatch = (list: GrantRow[]) => list.some((p) => matches(p.full_name) || matches(p.title) || matches(p.role_name));

  /** Classes to show under a grade for the current search + filter. */
  const visibleClasses = (gradeId: number, programHit: boolean, gradeHit: boolean) =>
    classes
      .filter((c) => c.grade_id === gradeId)
      .filter((c) => {
        const holders = at("CLASS_GROUP", c.id);
        if (filter === "vacant" && holders.length > 0) return false;
        if (filter === "shared" && holders.length < 2) return false;
        return !q || programHit || gradeHit || matches(c.name) || holdersMatch(holders);
      });

  const programView = programs
    .map((p) => {
      const lead = at("PROGRAM", p.id);
      const programHit = matches(p.name) || holdersMatch(lead);
      const gradeViews = grades
        .filter((g) => g.program_id === p.id)
        .map((g) => {
          const gHolders = at("GRADE", g.id);
          const gradeHit = matches(g.name) || holdersMatch(gHolders);
          return { g, gHolders, list: visibleClasses(g.id, programHit, gradeHit), gradeHit };
        });
      const allClasses = classes.filter((c) => grades.some((g) => g.id === c.grade_id && g.program_id === p.id));
      const taught = allClasses.filter((c) => at("CLASS_GROUP", c.id).length > 0).length;
      const vacancies = (lead.length === 0 ? 1 : 0) + (allClasses.length - taught);
      const anyShown = gradeViews.some((v) => v.list.length > 0 || (v.gradeHit && filter === "all"));
      const include =
        filter === "all"
          ? !q || programHit || anyShown
          : filter === "vacant"
            ? vacancies > 0 && (anyShown || (lead.length === 0 && (!q || programHit)))
            : anyShown;
      return { p, lead, gradeViews, allClasses, taught, vacancies, include };
    })
    .filter((v) => v.include);

  const searching = q.length > 0 || filter !== "all";
  const isOpen = (id: number) => (searching ? true : !!open[id]);
  const setAll = (value: boolean) => setOpen(Object.fromEntries(programs.map((p) => [p.id, value])));
  const allOpen = programs.length > 0 && programs.every((p) => open[p.id]);

  const pick = (name: string) => {
    setQuery(name);
    setFilter("all");
  };

  const FILTERS: Array<[Filter, string, number | null]> = [
    ["all", "Everything", null],
    ["vacant", "Vacancies", programs.length - stats.led + (classes.length - stats.taught)],
    ["shared", "Several class teachers", stats.shared],
  ];

  return (
    <div className="space-y-4">
      {/* ── Coverage ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={<ShieldCheck className="h-5 w-5" />}
          label="Key school posts filled"
          value={`${stats.keyFilled}/${KEY_SCHOOL_POSTS.length}`}
          tone={stats.keyFilled === KEY_SCHOOL_POSTS.length ? "good" : "warn"}
        />
        <Stat
          icon={<Layers className="h-5 w-5" />}
          label="Programmes with a lead"
          value={`${stats.led}/${programs.length}`}
          tone={stats.led === programs.length ? "good" : "warn"}
        />
        <Stat
          icon={<GraduationCap className="h-5 w-5" />}
          label="Classes with a class teacher"
          value={`${stats.taught}/${classes.length}`}
          hint={stats.shared ? `${stats.shared} with more than one` : undefined}
          tone={stats.taught === classes.length ? "good" : "warn"}
        />
        <Stat icon={<Users className="h-5 w-5" />} label="People holding positions" value={String(stats.people)} />
      </div>

      {/* ── Find & filter ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <label htmlFor={searchId} className="sr-only">
            Find a person, programme or class
          </label>
          <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${mutedCls}`} aria-hidden />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a person, programme or class"
            className="h-10 w-full rounded-xl border border-border-light bg-white pl-9 pr-9 text-sm text-text-primary-light placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-text-primary-dark dark:placeholder:text-slate-400"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-surface-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
          {FILTERS.map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                filter === key
                  ? "border-transparent bg-brand-600 text-white"
                  : "border-border-light bg-white text-slate-700 hover:bg-surface-light dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              {label}
              {n !== null && n > 0 && (
                <span
                  className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                    filter === key ? "bg-white/20" : "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100"
                  }`}
                >
                  {n}
                </span>
              )}
            </button>
          ))}
          {!searching && programs.length > 0 && (
            <button
              type="button"
              onClick={() => setAll(!allOpen)}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border-light bg-white px-3 text-sm font-medium text-slate-700 hover:bg-surface-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {allOpen ? <ChevronsDownUp className="h-4 w-4" aria-hidden /> : <ChevronsUpDown className="h-4 w-4" aria-hidden />}
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
          )}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {searching ? `${programView.length} programme${programView.length === 1 ? "" : "s"} shown` : ""}
      </p>

      {/* ── School & platform ────────────────────────────────────────────── */}
      {filter !== "shared" && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Panel title="School leadership" className="lg:col-span-2">
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {KEY_SCHOOL_POSTS.map((post) => {
                const held = school.filter((p) => p.preset_key === post.preset);
                if (held.length && filter === "vacant") return null;
                if (q && !matches(post.label) && !holdersMatch(held)) return null;
                return (
                  <li
                    key={post.preset}
                    className={`rounded-xl p-3 ${
                      held.length
                        ? "border border-border-light bg-white dark:border-slate-700 dark:bg-slate-900/40"
                        : "border border-dashed border-amber-400 bg-amber-50/60 dark:border-amber-500/70 dark:bg-amber-950/20"
                    }`}
                  >
                    <p className={`text-xs font-medium ${mutedCls}`}>{post.label}</p>
                    {held.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {held.map((p) => (
                          <PersonChip key={p.grant_id} p={p} onPick={pick} showRole={false} />
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">Vacant</span>
                        {onAssign && (
                          <button
                            type="button"
                            onClick={onAssign}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-200 dark:hover:bg-slate-800"
                          >
                            <UserPlus className="h-3.5 w-3.5" aria-hidden /> Assign
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {filter === "all" &&
              school.filter((p) => !KEY_SCHOOL_POSTS.some((k) => k.preset === p.preset_key)).filter((p) => !q || holdersMatch([p])).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {school
                    .filter((p) => !KEY_SCHOOL_POSTS.some((k) => k.preset === p.preset_key))
                    .filter((p) => !q || holdersMatch([p]))
                    .map((p) => (
                      <PersonChip key={p.grant_id} p={p} onPick={pick} />
                    ))}
                </div>
              )}
          </Panel>
          {filter === "all" && platform.length > 0 && (!q || holdersMatch(platform)) && (
            <Panel title="Platform administration">
              <div className="flex flex-wrap gap-1.5">
                {platform
                  .filter((p) => !q || holdersMatch([p]))
                  .map((p) => (
                    <PersonChip key={p.grant_id} p={p} onPick={pick} />
                  ))}
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* ── Programmes ───────────────────────────────────────────────────── */}
      <section aria-labelledby="structure-programmes" className="space-y-3">
        <h2 id="structure-programmes" className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark">
          Programmes, grades and classes
        </h2>
        {programs.length === 0 ? (
          <Panel>
            <p className={`py-6 text-center text-sm ${mutedCls}`}>No programmes yet.</p>
          </Panel>
        ) : programView.length === 0 ? (
          <Panel>
            <p className={`py-6 text-center text-sm ${mutedCls}`}>
              Nothing matches.{" "}
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
                className="font-semibold text-brand-700 underline dark:text-brand-200"
              >
                Show everything
              </button>
            </p>
          </Panel>
        ) : (
          <ul className="space-y-3">
            {programView.map(({ p, lead, gradeViews, allClasses, taught, vacancies }) => {
              const expanded = isOpen(p.id);
              const bodyId = `structure-program-${p.id}`;
              return (
                <li
                  key={p.id}
                  className="overflow-hidden rounded-2xl border border-white/60 bg-white/70 backdrop-blur-sm transition-shadow hover:shadow-md dark:border-slate-700/30 dark:bg-slate-800/50"
                >
                  <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={bodyId}
                      onClick={() => setOpen((o) => ({ ...o, [p.id]: !expanded }))}
                      className="flex min-h-[40px] flex-1 items-center gap-3 rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <ChevronDown
                        className={`h-5 w-5 flex-shrink-0 text-slate-500 motion-safe:transition-transform dark:text-slate-300 ${expanded ? "" : "-rotate-90"}`}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-base font-bold text-text-primary-light dark:text-text-primary-dark">{p.name}</span>
                        <span className={`block text-xs ${mutedCls}`}>
                          {gradeViews.length} {gradeViews.length === 1 ? "grade" : "grades"} · {allClasses.length}{" "}
                          {allClasses.length === 1 ? "class" : "classes"}
                          {vacancies > 0 && (
                            <span className="ml-1 inline-flex items-center gap-0.5 text-amber-800 dark:text-amber-200">
                              · <AlertTriangle className="h-3 w-3" aria-hidden /> {vacancies} to fill
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                    <div className="flex flex-wrap items-center gap-3 md:justify-end">
                      {lead.length ? (
                        <span className="flex flex-wrap gap-1.5">
                          {lead.map((l) => (
                            <PersonChip key={l.grant_id} p={l} onPick={pick} />
                          ))}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <VacantBadge>No programme lead yet</VacantBadge>
                          {onAssign && (
                            <button
                              type="button"
                              onClick={onAssign}
                              aria-label={`Assign a programme lead for ${p.name}`}
                              className="grid h-9 w-9 place-items-center rounded-lg text-brand-700 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-200 dark:hover:bg-slate-800"
                            >
                              <UserPlus className="h-4 w-4" aria-hidden />
                            </button>
                          )}
                        </span>
                      )}
                      {allClasses.length > 0 && <Coverage done={taught} total={allClasses.length} label="Class teachers" />}
                    </div>
                  </div>

                  {/* Height animates via grid rows; content stays in the DOM order for screen readers. */}
                  <div
                    id={bodyId}
                    className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-300 ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                  >
                    <div className="min-h-0 overflow-hidden" hidden={!expanded}>
                      <div className="space-y-4 border-t border-border-light px-4 pb-4 pt-3 dark:border-slate-700/50">
                        {gradeViews.length === 0 && <p className={`text-sm ${mutedCls}`}>No grades in this programme yet.</p>}
                        {gradeViews
                          .filter((v) => !searching || v.list.length > 0 || (v.gradeHit && filter === "all"))
                          .map(({ g, gHolders, list }) => (
                            <div key={g.id}>
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark">{g.name}</h3>
                                {gHolders.map((h) => (
                                  <PersonChip key={h.grant_id} p={h} onPick={pick} />
                                ))}
                              </div>
                              {list.length === 0 ? (
                                <p className={`text-xs ${mutedCls}`}>{searching ? "No classes match." : "No classes yet."}</p>
                              ) : (
                                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                  {list.map((c) => {
                                    const holders = at("CLASS_GROUP", c.id);
                                    return (
                                      <li
                                        key={c.id}
                                        className={`rounded-xl p-3 ${
                                          holders.length === 0
                                            ? "border border-dashed border-amber-400 bg-amber-50/50 dark:border-amber-500/70 dark:bg-amber-950/20"
                                            : "border border-border-light bg-white dark:border-slate-700 dark:bg-slate-900/40"
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="flex items-center gap-1.5 text-sm font-semibold text-text-primary-light dark:text-text-primary-dark">
                                            <Building2 className={`h-4 w-4 ${mutedCls}`} aria-hidden />
                                            {c.name}
                                          </span>
                                          {holders.length > 1 && (
                                            <span
                                              className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-100"
                                              title="A class usually has one class teacher"
                                            >
                                              {holders.length} class teachers
                                            </span>
                                          )}
                                        </div>
                                        <div className="mt-2 flex flex-col gap-1.5">
                                          {holders.length ? (
                                            holders.map((h) => <PersonChip key={h.grant_id} p={h} onPick={pick} showRole={false} />)
                                          ) : (
                                            <span className="flex items-center justify-between gap-2">
                                              <span className="text-xs font-medium text-amber-800 dark:text-amber-200">No class teacher</span>
                                              {onAssign && (
                                                <button
                                                  type="button"
                                                  onClick={onAssign}
                                                  aria-label={`Assign a class teacher for ${c.name}`}
                                                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-200 dark:hover:bg-slate-800"
                                                >
                                                  <UserPlus className="h-3.5 w-3.5" aria-hidden /> Assign
                                                </button>
                                              )}
                                            </span>
                                          )}
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Departments ──────────────────────────────────────────────────── */}
      {filter !== "shared" && (
        <Panel title="Departments">
          {departments.length === 0 ? (
            <p className={`py-4 text-center text-sm ${mutedCls}`}>No departments yet — create them in the Departments tab.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {departments
                .filter((d) => {
                  const hod = at("DEPARTMENT", d.id);
                  if (filter === "vacant" && hod.length) return false;
                  return !q || matches(d.name) || holdersMatch(hod);
                })
                .map((d) => {
                  const hod = at("DEPARTMENT", d.id);
                  return (
                    <li
                      key={d.id}
                      className={`rounded-xl p-3 ${
                        hod.length
                          ? "border border-border-light bg-white dark:border-slate-700 dark:bg-slate-900/40"
                          : "border border-dashed border-amber-400 bg-amber-50/50 dark:border-amber-500/70 dark:bg-amber-950/20"
                      }`}
                    >
                      <p className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark">{d.name}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {hod.length ? (
                          hod.map((h) => <PersonChip key={h.grant_id} p={h} onPick={pick} />)
                        ) : (
                          <VacantBadge>No head of department yet</VacantBadge>
                        )}
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
};
