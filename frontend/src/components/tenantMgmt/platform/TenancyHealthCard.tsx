import React, { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { platformApi } from "../../../api/tenantMgmt";
import { Pill } from "../kit";
import { Card, Skeleton, cx, errorText, sectionTitle } from "./platformShared";

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
        <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />
        <h2 className={sectionTitle}>School safety</h2>
        <span className="text-xs text-gray-600 dark:text-gray-300">· requests that name no school</span>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      {!rows && !error && (
        <ul className="space-y-2" role="status" aria-busy="true" aria-label="Loading school safety">
          {[0, 1, 2, 3].map((i) => (
            <li key={i}>
              <Skeleton className="h-8" />
            </li>
          ))}
        </ul>
      )}
      {rows && (
        <ul className="space-y-2">
          {rows.map((r) => {
            const clean = r.days.filter((d, i) => i < r.days.length - 1 && d.reported && d.fallbacks === 0).length;
            return (
              <li key={r.app} className="flex flex-wrap items-center gap-3">
                <span className="w-24 text-sm font-semibold text-gray-900 dark:text-white">{APP_NAMES[r.app] ?? r.app}</span>
                <span className="flex gap-1" role="img" aria-label={`${APP_NAMES[r.app] ?? r.app}, last ${r.days.length} days`}>
                  {r.days.map((d) => (
                    <span
                      key={d.day}
                      title={`${d.day}: ${!d.reported ? "no report" : d.fallbacks === 0 ? "clean" : `${d.fallbacks} without a school`}`}
                      className={cx(
                        "h-4 w-4 rounded",
                        !d.reported ? "bg-gray-200 dark:bg-gray-800" : d.fallbacks === 0 ? "bg-blue-500" : "bg-red-500",
                      )}
                    />
                  ))}
                </span>
                <Pill tone={r.strict ? "blue" : "gray"} className="ml-auto">
                  {r.strict ? "Strict" : `Learning · ${clean}/7 clean days`}
                </Pill>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};

export default TenancyHealthCard;
