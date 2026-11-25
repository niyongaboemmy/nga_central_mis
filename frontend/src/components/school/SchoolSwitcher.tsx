import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Repeat } from "lucide-react";
import SchoolMark from "./SchoolMark";
import SwitchSchoolDialog from "./SwitchSchoolDialog";
import { mySchools, type MySchool } from "../../lib/schoolSwitch";
import { useUser } from "../../contexts/UserContext";

/**
 * Top-bar school chip (TENANT_SWITCHING_PLAN.md §4.4): the current school's logo
 * and short name, with a menu of the person's other schools. Rendered only for
 * people with two or more schools (owner decision). Following a switch made
 * elsewhere is UserContext's job (watchSchoolChanges).
 */
export function useMySchools(): MySchool[] | null {
  const { user } = useUser();
  const [schools, setSchools] = useState<MySchool[] | null>(null);
  const uid = user?.user?.user_id;
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    mySchools().then(
      (s) => alive && setSchools(s),
      () => alive && setSchools([]),
    );
    return () => {
      alive = false;
    };
  }, [uid]);
  return schools;
}

const SchoolSwitcher: React.FC<{ variant?: "chip" | "menu"; onPicked?: () => void }> = ({ variant = "chip", onPicked }) => {
  const schools = useMySchools();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<MySchool | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!schools || schools.length < 2) return null;
  const current = schools.find((s) => s.current) ?? null;
  const others = schools.filter((s) => !s.current);

  const list = (
    <ul role="menu" aria-label="Your schools" className="py-1">
      {schools.map((s) => (
        <li key={s.tid} role="none">
          <button
            type="button"
            role="menuitem"
            disabled={s.current}
            onClick={() => {
              setOpen(false);
              onPicked?.();
              setTarget(s);
            }}
            className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-slate-800"
          >
            <SchoolMark name={s.name} logoUrl={s.logoUrl} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{s.name}</span>
              {s.roles.length > 0 && <span className="block truncate text-xs text-slate-600 dark:text-slate-300">{s.roles.join(", ")}</span>}
            </span>
            {s.current && <Check className="h-4 w-4 text-blue-600 dark:text-blue-300" aria-label="Current school" />}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="relative" ref={ref}>
      {variant === "chip" ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`School: ${current?.name ?? ""}. Switch school`}
          title="Switch school"
          className="flex max-w-[12rem] items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          {current && <SchoolMark name={current.name} logoUrl={current.logoUrl} size="sm" />}
          <span className="truncate">{current?.name}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text-secondary-light hover:bg-surface-light dark:text-text-secondary-dark/70 dark:hover:bg-surface-dark"
        >
          <Repeat className="h-4 w-4" aria-hidden="true" />
          <span className="flex-1">Switch school</span>
          <span className="text-xs opacity-70">{others.length}</span>
        </button>
      )}
      {open && (
        <div className={`absolute z-50 mt-2 w-72 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 ${variant === "chip" ? "right-0" : "left-0"}`}>
          {list}
        </div>
      )}
      <SwitchSchoolDialog from={current} to={target} onClose={() => setTarget(null)} />
    </div>
  );
};

export default SchoolSwitcher;
