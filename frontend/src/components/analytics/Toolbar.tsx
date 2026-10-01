import React, { useEffect, useState } from "react";
import { CalendarRange, Filter, X } from "lucide-react";
import api from "../../services/api";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import { inputCls } from "../access/shared";
import { SearchSelect } from "../ui/SearchSelect";
import { APPS, AppDot } from "./common";
import { PRESETS, ReportState, kigaliToday } from "./useReportQuery";

/**
 * The report toolbar (plan §14): date range (incl. this term / academic year), granularity,
 * comparison, apps, audience and segments, in one row above everything it affects.
 */
const USER_TYPES = ["STUDENT", "TEACHER", "STAFF", "ADMIN", "PARENT"];

interface Option {
  id: number;
  name: string;
}

export const Toolbar: React.FC<{
  state: ReportState;
  update: (p: Partial<ReportState>) => void;
  showGran?: boolean;
  showCompare?: boolean;
  showAudience?: boolean;
  showSegments?: boolean;
}> = ({ state, update, showGran = true, showCompare = true, showAudience = true, showSegments = true }) => {
  const { selectedTerm, selectedYear } = useAcademicPeriod();
  const [moreOpen, setMoreOpen] = useState(state.program.length + state.grade.length + state.classGroup.length > 0);
  const [nodes, setNodes] = useState<{ programs: Option[]; grades: Option[]; classGroups: Option[] } | null>(null);

  useEffect(() => {
    if (!moreOpen || nodes) return;
    // Programmes / grades / classes for the segment pickers (same source as Access Studio).
    api
      .get("/monitor/nodes")
      .then((r) => {
        const d = r.data?.data ?? r.data ?? {};
        setNodes({ programs: d.programs ?? [], grades: d.grades ?? [], classGroups: d.classGroups ?? [] });
      })
      .catch(() => setNodes({ programs: [], grades: [], classGroups: [] }));
  }, [moreOpen, nodes]);

  const periodPresets: { key: string; label: string; from?: string | null; to?: string | null }[] = [
    { key: "term", label: selectedTerm ? `This term (${selectedTerm.name})` : "This term", from: selectedTerm?.start_date, to: selectedTerm?.end_date },
    { key: "year", label: selectedYear ? `Academic year ${selectedYear.name}` : "This academic year", from: selectedYear?.start_date, to: selectedYear?.end_date },
  ];

  const onPreset = (key: string) => {
    const p = PRESETS.find((x) => x.key === key);
    if (p) return update({ preset: key, from: undefined as any, to: undefined as any });
    const pp = periodPresets.find((x) => x.key === key);
    if (pp?.from) {
      const to = pp.to && pp.to.slice(0, 10) < kigaliToday() ? pp.to.slice(0, 10) : kigaliToday();
      update({ from: pp.from.slice(0, 10), to, gran: "week" });
    }
  };

  const toggle = (k: "app" | "type", v: string) => {
    const cur = state[k];
    update({ [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] } as Partial<ReportState>);
  };

  return (
    <div className="rounded-2xl border border-white/60 dark:border-slate-700/30 bg-white/70 dark:bg-slate-800/50 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarRange className="w-4 h-4 text-slate-600 dark:text-slate-300" aria-hidden />
        <SearchSelect
          label="Date range"
          width={230}
          value={PRESETS.some((p) => p.key === state.preset) ? state.preset : "custom"}
          onChange={(v) => v && onPreset(v)}
          options={[
            ...PRESETS.map((p) => ({ value: p.key, label: p.label, group: "Quick ranges" })),
            ...periodPresets.map((p) => ({ value: p.key, label: p.label, group: "School calendar", disabled: !p.from })),
            { value: "custom", label: "Custom…", description: "Pick the dates on the right", group: "Custom" },
          ]}
        />
        <label className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
          From
          <input type="date" className={`${inputCls} !w-auto !py-1.5 !rounded-[10px]`} value={state.from} max={state.to} onChange={(e) => e.target.value && update({ from: e.target.value })} />
        </label>
        <label className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
          to
          <input type="date" className={`${inputCls} !w-auto !py-1.5 !rounded-[10px]`} value={state.to} min={state.from} max={kigaliToday()} onChange={(e) => e.target.value && update({ to: e.target.value })} />
        </label>
        {showGran && (
          <SearchSelect
            label="Group by"
            width={130}
            value={state.gran}
            onChange={(v) => v && update({ gran: v as ReportState["gran"] })}
            options={[
              { value: "day", label: "By day" },
              { value: "week", label: "By week" },
              { value: "month", label: "By month" },
            ]}
          />
        )}
        {showCompare && (
          <SearchSelect
            label="Compare"
            width={220}
            value={state.compare || "none"}
            onChange={(v) => update({ compare: (v === "none" || !v ? "" : v) as ReportState["compare"] })}
            options={[
              { value: "none", label: "No comparison" },
              { value: "prev", label: "vs previous period", description: "Same length, just before" },
              { value: "yoy", label: "vs same period last year" },
            ]}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Apps" className="flex flex-wrap gap-1.5">
          {APPS.map((a) => (
            <button
              key={a}
              onClick={() => toggle("app", a)}
              aria-pressed={state.app.includes(a)}
              className={`px-2.5 py-1 rounded-xl text-xs font-medium border transition-colors ${
                state.app.includes(a)
                  ? "border-brand-600 bg-brand-50 dark:bg-slate-700 text-text-primary-light dark:text-text-primary-dark"
                  : "border-border-light dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-surface-light dark:hover:bg-slate-800"
              }`}
            >
              <AppDot app={a} />
            </button>
          ))}
        </div>
        {showAudience && (
          <SearchSelect
            label="Audience"
            width={170}
            value={state.aud}
            onChange={(v) => v && update({ aud: v as ReportState["aud"] })}
            options={[
              { value: "both", label: "Everyone" },
              { value: "user", label: "Signed-in users" },
              { value: "visitor", label: "Public visitors", description: "Devices that never signed in" },
            ]}
          />
        )}
        {showSegments && (
          <>
            <div role="group" aria-label="User types" className="flex flex-wrap gap-1">
              {USER_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => toggle("type", t)}
                  aria-pressed={state.type.includes(t)}
                  className={`px-2 py-1 rounded-lg text-xs border ${
                    state.type.includes(t)
                      ? "border-brand-600 bg-brand-50 dark:bg-slate-700 text-text-primary-light dark:text-text-primary-dark"
                      : "border-border-light dark:border-slate-700 text-slate-700 dark:text-slate-200"
                  }`}
                >
                  {t.charAt(0) + t.slice(1).toLowerCase()}s
                </button>
              ))}
            </div>
            <button className="inline-flex items-center gap-1 text-xs text-slate-700 dark:text-slate-200 hover:underline" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}>
              <Filter className="w-3.5 h-3.5" aria-hidden /> Programme / grade / class
            </button>
          </>
        )}
      </div>
      {showSegments && moreOpen && (
        <div className="flex flex-wrap items-center gap-2">
          <NodeSelect label="Programme" options={nodes?.programs} value={state.program} onChange={(v) => update({ program: v })} />
          <NodeSelect label="Grade" options={nodes?.grades} value={state.grade} onChange={(v) => update({ grade: v })} />
          <NodeSelect label="Class" options={nodes?.classGroups} value={state.classGroup} onChange={(v) => update({ classGroup: v })} />
          {(state.program.length || state.grade.length || state.classGroup.length) > 0 && (
            <button className="inline-flex items-center gap-1 text-xs text-slate-700 dark:text-slate-200 hover:underline" onClick={() => update({ program: [], grade: [], classGroup: [] })}>
              <X className="w-3.5 h-3.5" aria-hidden /> Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const NodeSelect: React.FC<{ label: string; options?: Option[]; value: string[]; onChange: (v: string[]) => void }> = ({ label, options, value, onChange }) => (
  <SearchSelect
    multi
    label={label}
    width={240}
    isLoading={!options}
    placeholder={`All ${label.toLowerCase()}s`}
    value={value}
    onChange={onChange}
    options={(options ?? []).map((o) => ({ value: String(o.id), label: o.name }))}
  />
);
