import React, { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, Package as PackageIcon, RefreshCw } from "lucide-react";
import { platformApi, type ModuleSchool, type ModuleSchools } from "../../../api/tenantMgmt";
import { surface } from "../../../design/surfaces";
import { useConfirm } from "../../../contexts/ConfirmContext";
import { Switch, act, cx, errorText } from "./platformShared";

/**
 * Which schools have a module (Modules -> a module -> Schools).
 *
 * One switch per school, the same switch as the console's school -> Plan & apps.
 * A switch set here is kept whatever the package says; a school whose package
 * includes the module gets it without anyone touching this list.
 */

const chip = "rounded-full px-1.5 text-[11px] font-bold";

const sourceLabel = (s: ModuleSchool) => (s.source === "OVERRIDE" ? "Set by hand" : s.source === "PACKAGE" ? "Package" : "Not assigned");

const ModuleSchoolsPanel: React.FC<{ systemId: number; moduleName: string }> = ({ systemId, moduleName }) => {
  const [data, setData] = useState<ModuleSchools | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await platformApi.moduleSchools(systemId));
    } catch (e) {
      setError(errorText(e));
    }
  }, [systemId]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  if (error) {
    return (
      <div className={cx(surface.inset, "flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-gray-600 dark:text-gray-300")}>
        <span>Couldn't load the schools: {error}</span>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-700/40 dark:text-gray-200 dark:hover:bg-gray-800/60"
        >
          <RefreshCw className="h-4 w-4" aria-hidden /> Try again
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <ul className="space-y-2" aria-busy="true" aria-label="Loading schools">
        {[0, 1, 2].map((i) => (
          <li key={i} className={cx(surface.skeleton, "h-14")} />
        ))}
      </ul>
    );
  }

  const works = (s: ModuleSchool) => s.status === "ACTIVE" && !s.needsPackage;
  const onCount = data.schools.filter(works).length;
  const allOn = data.schools.length > 0 && data.schools.every((s) => s.status === "ACTIVE");
  const retired = data.module.moduleStatus === "DISABLED";

  const setAll = async (status: "ACTIVE" | "DISABLED") => {
    const ok = await confirm({
      title: status === "ACTIVE" ? `Turn ${moduleName} on for every school?` : `Turn ${moduleName} off for every school?`,
      message:
        status === "ACTIVE"
          ? `All ${data.schools.length} schools will be able to open ${moduleName}.`
          : `Nobody in any school will be able to open ${moduleName} until it is turned on again.`,
      confirmText: status === "ACTIVE" ? "Turn on for all" : "Turn off for all",
      tone: status === "ACTIVE" ? "info" : "warning",
    });
    if (!ok) return;
    setBusy("all");
    const next = await act(
      () => platformApi.setModuleSchools(systemId, "all", status),
      status === "ACTIVE" ? `${moduleName} is on for every school` : `${moduleName} is off for every school`,
    );
    setBusy(null);
    if (next) setData(next);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {onCount} of {data.schools.length} schools can open {moduleName}. A switch you set here stays as set, whatever a school's package includes.
        </p>
        <button
          type="button"
          disabled={busy !== null || data.schools.length === 0}
          onClick={() => void setAll(allOn ? "DISABLED" : "ACTIVE")}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3.5 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:border-gray-700/40 dark:text-gray-200 dark:hover:bg-gray-800/50"
        >
          {busy === "all" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {allOn ? "Turn off for all schools" : "Turn on for all schools"}
        </button>
      </div>

      {retired && (
        <p className={cx(surface.inset, "mb-3 p-3 text-sm text-amber-800 dark:text-amber-200")}>
          This module is disabled, so no school can open it. Set its status to Active (Edit) first.
        </p>
      )}

      {data.schools.length === 0 ? (
        <p className={cx(surface.inset, "p-6 text-center text-sm text-gray-500 dark:text-gray-400")}>No schools yet.</p>
      ) : (
        <ul className="space-y-2" aria-label={`Schools with ${moduleName}`}>
          {data.schools.map((s) => {
            const on = s.status === "ACTIVE";
            return (
              <li
                key={s.tid}
                className={cx(
                  "flex items-center gap-3 rounded-2xl p-3 transition-colors",
                  works(s) ? "bg-blue-50 ring-1 ring-inset ring-blue-500/20 dark:bg-blue-500/10 dark:ring-blue-400/20" : "bg-gray-50 dark:bg-gray-800/50",
                )}
              >
                <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", works(s) ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300")}>
                  <Building2 className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-gray-900 dark:text-white">{s.name}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    <span className={cx(chip, "inline-flex items-center gap-1 bg-gray-100 capitalize text-gray-700 dark:bg-gray-800 dark:text-gray-200")}>
                      <PackageIcon className="h-3 w-3" aria-hidden /> {s.pkg}
                    </span>
                    <span className={cx(chip, s.source === "OVERRIDE" ? "bg-blue-100 text-blue-800 dark:bg-blue-400/15 dark:text-blue-200" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200")}>
                      {sourceLabel(s)}
                    </span>
                    {s.inPackage && s.source !== "PACKAGE" && <span className={cx(chip, "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200")}>In package</span>}
                    {s.needsPackage && (
                      <span className={cx(chip, "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200")} title="This app is not in the school's package. Change the package or add an override on the school's page.">
                        Not in package
                      </span>
                    )}
                    {s.isPrimary && <span className={cx(chip, "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200")}>Primary</span>}
                    {s.lifecycle !== "ACTIVE" && <span className={cx(chip, "bg-gray-100 capitalize text-gray-700 dark:bg-gray-800 dark:text-gray-200")}>{s.lifecycle.toLowerCase()}</span>}
                  </div>
                </div>
                {busy === s.tid ? (
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" aria-label="Saving" />
                ) : (
                  <Switch
                    checked={on}
                    label={`${moduleName} for ${s.name}`}
                    disabled={busy !== null}
                    onChange={async (v) => {
                      setBusy(s.tid);
                      const next = await act(
                        () => platformApi.setModuleSchools(systemId, [s.tid], v ? "ACTIVE" : "DISABLED"),
                        v ? `${moduleName} is on for ${s.name}` : `${moduleName} is off for ${s.name}`,
                      );
                      setBusy(null);
                      if (next) setData(next);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ModuleSchoolsPanel;
