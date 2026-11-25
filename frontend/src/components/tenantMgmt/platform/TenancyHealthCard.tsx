import React, { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { platformApi } from "../../../api/tenantMgmt";
import { Card, cx, errorText } from "./platformShared";

const APP_NAMES: Record<string, string> = { mis: "MIS", taskmentor: "Task Mentor", tendo: "Tendo", tupo: "Tupo" };

/**
 * School safety (TENANT_SWITCHING_PLAN.md Appendix A.6): per app, whether it still
 * guesses school 1 when a request names no school, the last 8 days, and when it
 * switched itself to strict mode (after 7 clean, reported days).
 */
const TenancyHealthCard: React.FC = () => {
  type Health = Awaited<ReturnType<typeof platformApi.tenancyHealth>>;
  const [rows, setRows] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    platformApi.tenancyHealth().then(setRows, (e) => setError(errorText(e)));
  }, []);
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-brand-600 dark:text-brand-200" aria-hidden />
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">School safety</h2>
        <span className="text-xs text-slate-600 dark:text-gray-300">· requests that name no school</span>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      {!rows && !error && (
        <ul className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="h-8 animate-pulse rounded-xl bg-slate-100 dark:bg-gray-800" />
          ))}
        </ul>
      )}
      {rows && (
        <ul className="space-y-2">
          {rows.map((r) => {
            const clean = r.days.filter((d, i) => i < r.days.length - 1 && d.reported && d.fallbacks === 0).length;
            return (
              <li key={r.app} className="flex flex-wrap items-center gap-3">
                <span className="w-24 text-sm font-semibold text-slate-900 dark:text-white">{APP_NAMES[r.app] ?? r.app}</span>
                <span className="flex gap-1" role="img" aria-label={`${APP_NAMES[r.app] ?? r.app}, last ${r.days.length} days`}>
                  {r.days.map((d) => (
                    <span
                      key={d.day}
                      title={`${d.day}: ${!d.reported ? "no report" : d.fallbacks === 0 ? "clean" : `${d.fallbacks} without a school`}`}
                      className={cx(
                        "h-4 w-4 rounded",
                        !d.reported ? "bg-slate-200 dark:bg-gray-700" : d.fallbacks === 0 ? "bg-brand-500" : "bg-red-500",
                      )}
                    />
                  ))}
                </span>
                <span className={cx("ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold", r.strict ? "bg-brand-100 text-brand-800 dark:bg-brand-500/20 dark:text-brand-200" : "bg-slate-100 text-slate-700 dark:bg-gray-800 dark:text-gray-200")}>
                  {r.strict ? "Strict" : `Learning · ${clean}/7 clean days`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};

export default TenancyHealthCard;
