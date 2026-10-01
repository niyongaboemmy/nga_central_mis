import React from "react";

/**
 * Loading skeletons for Usage & Monitoring. Each one has the shape of what it stands
 * in for (KPI tiles, a chart, a table, a ranked list, a map, a timeline, a person
 * header) so the page does not jump when data arrives. The wrapper is announced once
 * as "Loading…"; the shapes themselves are hidden from assistive technology.
 */
export const Skel: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = "", style }) => (
  <div aria-hidden className={`skel ${className}`} style={style} />
);

const Busy: React.FC<{ label?: string; className?: string; children: React.ReactNode }> = ({ label = "Loading…", className = "", children }) => (
  <div role="status" aria-live="polite" aria-busy="true" className={className}>
    <span className="sr-only">{label}</span>
    {children}
  </div>
);

const card = "rounded-2xl border border-white/60 dark:border-slate-700/30 bg-white/70 dark:bg-slate-800/50";

export const SkeletonKpis: React.FC<{ count?: number; className?: string }> = ({ count = 4, className = "grid grid-cols-2 lg:grid-cols-4 gap-3" }) => (
  <Busy className={className} label="Loading figures…">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className={`${card} px-4 py-3`}>
        <Skel className="h-3 w-24" />
        <Skel className="h-7 w-20 mt-2" />
        <Skel className="h-6 w-full mt-2" />
      </div>
    ))}
  </Busy>
);

/** Bars of varying height under a legend row: reads as "a chart is coming". */
export const SkeletonChart: React.FC<{ height?: number; bars?: number; legend?: boolean }> = ({ height = 220, bars = 18, legend = true }) => (
  <Busy label="Loading chart…">
    {legend && (
      <div className="flex gap-3 mb-3">
        <Skel className="h-3 w-16" />
        <Skel className="h-3 w-20" />
        <Skel className="h-3 w-14" />
      </div>
    )}
    <div className="flex items-end gap-1.5" style={{ height }}>
      {Array.from({ length: bars }, (_, i) => (
        <Skel key={i} className="flex-1 rounded-b-none" style={{ height: `${30 + ((i * 37) % 60)}%` }} />
      ))}
    </div>
    <div className="flex justify-between mt-2">
      {Array.from({ length: 5 }, (_, i) => (
        <Skel key={i} className="h-2.5 w-10" />
      ))}
    </div>
  </Busy>
);

export const SkeletonDonut: React.FC<{ size?: number }> = ({ size = 150 }) => (
  <Busy label="Loading chart…" className="flex items-center gap-5">
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <Skel className="absolute inset-0 !rounded-full" />
      <div className="absolute rounded-full bg-white dark:bg-slate-800" style={{ inset: size * 0.2 }} />
    </div>
    <div className="flex-1 space-y-2.5">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skel className="h-2.5 w-2.5 !rounded-full" />
          <Skel className="h-3 flex-1" />
          <Skel className="h-3 w-10" />
        </div>
      ))}
    </div>
  </Busy>
);

export const SkeletonTable: React.FC<{ rows?: number; cols?: number }> = ({ rows = 6, cols = 5 }) => (
  <Busy label="Loading table…">
    <div className="flex gap-3 pb-2 border-b border-border-light dark:border-slate-700">
      {Array.from({ length: cols }, (_, c) => (
        <Skel key={c} className={`h-3 ${c === 0 ? "flex-[2]" : "flex-1"}`} />
      ))}
    </div>
    {Array.from({ length: rows }, (_, r) => (
      <div key={r} className="flex items-center gap-3 py-2.5 border-b border-border-light/60 dark:border-slate-800">
        {Array.from({ length: cols }, (_, c) =>
          c === 0 ? (
            <div key={c} className="flex-[2] flex items-center gap-2">
              <Skel className="h-7 w-7 !rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skel className="h-3 w-3/4" />
                <Skel className="h-2.5 w-1/3" />
              </div>
            </div>
          ) : (
            <Skel key={c} className="h-3 flex-1" style={{ maxWidth: `${50 + ((r + c) * 13) % 45}%` }} />
          ),
        )}
      </div>
    ))}
  </Busy>
);

export const SkeletonList: React.FC<{ rows?: number }> = ({ rows = 6 }) => (
  <Busy label="Loading list…" className="space-y-3">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i}>
        <div className="flex justify-between gap-3">
          <Skel className="h-3" style={{ width: `${40 + ((i * 17) % 40)}%` }} />
          <Skel className="h-3 w-10" />
        </div>
        <Skel className="h-1.5 mt-1.5 !rounded-full" style={{ width: `${95 - i * 12}%` }} />
      </div>
    ))}
  </Busy>
);

export const SkeletonMap: React.FC<{ height?: number }> = ({ height = 320 }) => (
  <Busy label="Loading map…">
    <Skel className="w-full !rounded-xl" style={{ height }} />
  </Busy>
);

export const SkeletonTimeline: React.FC<{ items?: number }> = ({ items = 4 }) => (
  <Busy label="Loading timeline…" className="space-y-4">
    {Array.from({ length: items }, (_, i) => (
      <div key={i} className="flex gap-3">
        <Skel className="h-3 w-3 !rounded-full mt-1 shrink-0" />
        <div className="flex-1 space-y-2">
          <Skel className="h-3 w-1/3" />
          <Skel className="h-2.5 w-2/3" />
          <Skel className="h-2.5 w-1/2" />
        </div>
      </div>
    ))}
  </Busy>
);

/** User 360 / Visitor 360 header: avatar, name, chips, actions. */
export const SkeletonProfile: React.FC = () => (
  <Busy label="Loading profile…" className={`${card} p-4`}>
    <div className="flex flex-wrap items-center gap-4">
      <Skel className="h-14 w-14 !rounded-full" />
      <div className="flex-1 min-w-[200px] space-y-2">
        <Skel className="h-5 w-48" />
        <Skel className="h-3 w-72 max-w-full" />
        <div className="flex gap-2">
          <Skel className="h-5 w-16 !rounded-full" />
          <Skel className="h-5 w-20 !rounded-full" />
          <Skel className="h-5 w-14 !rounded-full" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skel className="h-8 w-24" />
        <Skel className="h-8 w-24" />
      </div>
    </div>
  </Busy>
);

/** A panel-shaped placeholder (title + body) for whole sections. */
export const SkeletonPanel: React.FC<{ children?: React.ReactNode; className?: string; titleWidth?: string }> = ({ children, className = "", titleWidth = "w-40" }) => (
  <div className={`${card} p-4 ${className}`}>
    <Skel className={`h-4 ${titleWidth} mb-4`} />
    {children ?? <SkeletonChart />}
  </div>
);

/**
 * A thin indeterminate bar for "refreshing what you can already see": stale data
 * stays on screen and this runs along the top of the panel.
 */
export const RefreshBar: React.FC<{ active: boolean; className?: string }> = ({ active, className = "" }) =>
  active ? (
    <div role="status" aria-label="Refreshing" className={`refresh-bar relative h-0.5 overflow-hidden rounded-full text-brand-600 dark:text-brand-500 ${className}`}>
      <span className="sr-only">Refreshing…</span>
    </div>
  ) : (
    <div aria-hidden className={`h-0.5 ${className}`} />
  );

/** A whole analytics page while its code or access snapshot loads. */
export const PageSkeleton: React.FC = () => (
  <div className="space-y-4 max-w-[1500px] mx-auto pt-5 sm:pt-7 pb-10">
    <div className="space-y-2">
      <Skel className="h-3 w-36" />
      <Skel className="h-7 w-64" />
      <Skel className="h-3 w-96 max-w-full" />
    </div>
    <div className="flex gap-2 border-b border-border-light dark:border-slate-700 pb-2 overflow-hidden">
      {Array.from({ length: 8 }, (_, i) => (
        <Skel key={i} className="h-6 w-24 shrink-0" />
      ))}
    </div>
    <SkeletonKpis />
    <div className="grid lg:grid-cols-3 gap-4">
      <SkeletonPanel className="lg:col-span-2" />
      <SkeletonPanel>
        <SkeletonList rows={5} />
      </SkeletonPanel>
    </div>
  </div>
);
