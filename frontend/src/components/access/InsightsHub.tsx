import { useEffect, useMemo, useState } from "react";
import { BarChart3, ChevronRight } from "lucide-react";
import { accessApi, InsightResult, InsightWidget } from "../../api/access";
import { useAccess } from "../../hooks/useAccess";
import { useTheme } from "../../contexts/ThemeContext";
import { Empty, Panel } from "./shared";

/**
 * Leadership Insights (ACCESS_LEVELS_RBAC_IMPLEMENTATION_PLAN.md §8):
 * School -> Programme -> Grade -> Class -> Subject, aggregates only. What a
 * viewer sees is assembled from their grants: a widget appears only where they
 * hold its capability at `summary` depth or deeper, and the server refuses
 * anything else. Groups below the cohort floor are shown as suppressed.
 */

// Single series, magnitude -> one hue (sequential blue), per the dataviz method.
const BAR = { light: "#2a78d6", dark: "#3987e5" };
const NEXT_LEVEL: Record<string, string> = { PROGRAM: "PROGRAM", GRADE: "GRADE", CLASS_GROUP: "CLASS_GROUP" };

const LEVEL_NAME: Record<string, string> = {
  PROGRAM: "Programme",
  GRADE: "Grade",
  CLASS_GROUP: "Class",
  DEPARTMENT: "Department",
};
const nodeTitle = (node: string, names: Record<string, string>) => {
  if (node === "SCHOOL") return "Whole school";
  if (names[node]) return names[node];
  const [type, id] = node.toUpperCase().split(":");
  return `${LEVEL_NAME[type] ?? type} #${id}`;
};

const Bars: React.FC<{ data: InsightResult; onDrill: (node: string, label: string) => void }> = ({ data, onDrill }) => {
  const { theme } = useTheme();
  const color = theme === "dark" ? BAR.dark : BAR.light;
  const drillable = !!NEXT_LEVEL[data.groupBy];
  if (data.rows.length === 0) return <Empty>No data at this level yet.</Empty>;
  return (
    <ul className="space-y-2" aria-label={data.label}>
      {data.rows.map((r) => {
        const label = `${r.label}: ${r.suppressed ? `fewer than ${data.min_cohort} — hidden` : `${r.value}${data.unit}`} (${r.n})`;
        const content = (
          <>
            <span className="w-32 shrink-0 truncate text-left text-text-primary-light dark:text-text-primary-dark">{r.label}</span>
            <span className="flex-1 h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" aria-hidden>
              {!r.suppressed && r.value != null && (
                <span className="block h-full rounded-r-[4px]" style={{ width: `${Math.max(1, Math.min(100, r.value))}%`, background: color }} />
              )}
            </span>
            <span className="w-24 shrink-0 text-right tabular-nums text-slate-600 dark:text-slate-300">
              {r.suppressed ? `<${data.min_cohort}` : `${r.value}${data.unit}`}
              <span className="text-[11px]"> · {r.n}</span>
            </span>
            {drillable && <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-300" />}
          </>
        );
        return (
          <li key={String(r.key)} title={label}>
            {drillable && r.key !== "none" ? (
              <button className="w-full flex items-center gap-3 text-sm rounded-lg hover:bg-surface-light dark:hover:bg-slate-800 px-1 py-0.5" onClick={() => onDrill(`${data.groupBy}:${r.key}`, r.label)}>
                {content}
              </button>
            ) : (
              <div className="flex items-center gap-3 text-sm px-1 py-0.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

/** "CLASS_TEACHER" -> "Class teacher"; preset names ("Class Teacher") pass through. */
const roleName = (role: string) =>
  /^[A-Z0-9_]+$/.test(role) ? role.charAt(0) + role.slice(1).toLowerCase().replace(/_/g, " ") : role;

/** Widest first: the natural place to start looking at the school. */
const NODE_RANK: Record<string, number> = { SCHOOL: 5, PROGRAM: 4, DEPARTMENT: 3, GRADE: 2, CLASS_GROUP: 1 };

export default function InsightsHub() {
  const { snapshot, loading } = useAccess();
  const [trail, setTrail] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [widgets, setWidgets] = useState<InsightWidget[] | null>(null);
  const [data, setData] = useState<Record<string, InsightResult | "error">>({});

  // Nodes the viewer holds positions at -- quick starting points, widest first.
  const starts = useMemo(() => {
    const out = new Map<string, string>();
    for (const g of Object.values(snapshot?.grants ?? {})) {
      if (["SCHOOL", "PLATFORM"].includes(g.scope_type)) out.set("SCHOOL", "Whole school");
      else if (["PROGRAM", "GRADE", "CLASS_GROUP", "DEPARTMENT"].includes(g.scope_type) && g.scope_id)
        out.set(`${g.scope_type}:${g.scope_id}`, g.title || `${LEVEL_NAME[g.scope_type] ?? g.scope_type} #${g.scope_id} (${roleName(g.role)})`);
    }
    return new Map(
      [...out.entries()].sort(([a], [b]) => (NODE_RANK[b.split(":")[0]] ?? 0) - (NODE_RANK[a.split(":")[0]] ?? 0)),
    );
  }, [snapshot]);

  // Where the page opens. The snapshot's `home` names an insights node only
  // for programme/grade/school leaders; a class teacher's home is their
  // teaching board, and opening them at "Whole school" -- where they hold
  // nothing -- left them on an empty page with no way in. So: the snapshot's
  // insights home if it has one, else the viewer's own widest area, else the
  // whole school.
  const start = snapshot?.home?.startsWith("insights:")
    ? snapshot.home.slice("insights:".length)
    : ([...starts.keys()][0] ?? "SCHOOL");
  const node = trail[trail.length - 1] ?? start;
  const otherAreas = [...starts.keys()].filter((k) => k !== node);

  useEffect(() => {
    if (loading) return;
    setWidgets(null);
    setData({});
    accessApi
      .insightWidgets(node)
      .then(async (list) => {
        setWidgets(list);
        for (const w of list.filter((x) => x.source === "mis")) {
          accessApi
            .insight(w.metric, node)
            .then((r) => setData((d) => ({ ...d, [w.metric]: r })))
            .catch(() => setData((d) => ({ ...d, [w.metric]: "error" })));
        }
      })
      .catch(() => setWidgets([]));
  }, [node, loading]);

  // Name the viewer's own starting nodes from their positions.
  useEffect(() => {
    if (starts.size) setNames((n) => ({ ...Object.fromEntries(starts), ...n }));
  }, [starts]);

  const drill = (next: string, label: string) => {
    setNames((n) => ({ ...n, [next]: label }));
    setTrail((t) => [...t, next]);
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-6 sm:px-6" data-testid="insights-hub">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-slate-700 flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-brand-600 dark:text-brand-200" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary-light dark:text-text-primary-dark">Insights</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Summaries for the parts of the school you lead. No individual records are shown here.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {/* Every area the viewer leads, whenever there is somewhere else to go --
            a single area still needs its button when the page is elsewhere. */}
        {(starts.size > 1 || otherAreas.length > 0) &&
          [...starts.entries()].map(([k, label]) => (
            <button
              key={k}
              onClick={() => {
                setNames((n) => ({ ...n, [k]: label }));
                setTrail([k]);
              }}
              className={`rounded-full px-3 py-1 border ${node === k ? "bg-brand-600 text-white border-brand-600" : "border-border-light dark:border-slate-700"}`}
            >
              {label}
            </button>
          ))}
      </div>
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
        {[start, ...trail.filter((t, i) => !(i === 0 && t === start))].map((n, i, all) => (
          <span key={`${n}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />}
            <button
              className={i === all.length - 1 ? "font-semibold" : "text-brand-600 dark:text-brand-200 hover:underline"}
              onClick={() => setTrail(i === 0 ? [] : all.slice(1, i + 1))}
            >
              {nodeTitle(n, names)}
            </button>
          </span>
        ))}
      </nav>

      {widgets === null ? (
        <Panel><Empty>Loading…</Empty></Panel>
      ) : widgets.length === 0 ? (
        <Panel>
          <Empty>
            {otherAreas.length > 0
              ? "No insights for you at this level. Choose one of your areas above."
              : "None of your positions include summaries yet. Whoever manages your access in Leadership & Access can add them."}
          </Empty>
        </Panel>
      ) : (
        <>
        <div className="grid gap-3 lg:grid-cols-2">
          {widgets.filter((w) => w.source === "mis").map((w) => {
            const d = data[`${w.metric}`];
            return (
              <Panel key={`${w.app}:${w.metric}`} title={w.label} actions={<span className="text-[11px] text-slate-600 dark:text-slate-300">{w.app_label}</span>}>
                {w.source === "app" ? (
                  <Empty>Comes from {w.app_label} — available once that app serves its insights.</Empty>
                ) : d === "error" ? (
                  <Empty>Could not load.</Empty>
                ) : !d ? (
                  <Empty>Loading…</Empty>
                ) : (
                  <>
                    <p className="mb-3 text-2xl font-bold text-text-primary-light dark:text-text-primary-dark tabular-nums">
                      {d.total.suppressed || d.total.value == null ? "—" : `${d.total.value}${d.unit}`}
                      <span className="ml-2 text-xs font-normal text-slate-600 dark:text-slate-300">overall · {d.total.n} records</span>
                    </p>
                    <Bars data={d} onDrill={drill} />
                  </>
                )}
              </Panel>
            );
          })}
        </div>
        {widgets.some((w) => w.source === "app") && (
          <Panel title="More views you will get from the other apps">
            <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">
              You already have access to these. They appear here once each app starts serving its summaries.
            </p>
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {widgets
                .filter((w) => w.source === "app")
                .map((w) => (
                  <li key={`${w.app}:${w.metric}`} className="flex justify-between gap-2">
                    <span>{w.label}</span>
                    <span className="text-xs text-slate-600 dark:text-slate-300">{w.app_label}</span>
                  </li>
                ))}
            </ul>
          </Panel>
        )}
        </>
      )}
    </div>
  );
}
