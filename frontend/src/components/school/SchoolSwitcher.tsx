import React, { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Repeat } from "lucide-react";
import SchoolMark from "./SchoolMark";
import SwitchSchoolDialog from "./SwitchSchoolDialog";
import { mySchools, type MySchool } from "../../lib/schoolSwitch";
import { useUser } from "../../contexts/UserContext";

/**
 * Top-bar school chip and account-menu entry (TENANT_SWITCHING_PLAN.md §4.4): the
 * current school's logo and name, with the person's schools to switch to. Rendered only
 * for people with two or more schools (owner decision). Following a switch made
 * elsewhere is UserContext's job (watchSchoolChanges).
 *
 * Layout: inside a menu the list expands in place (a flyout would overflow the menu and
 * be cut off); from the top bar it is a popover that becomes a full-width sheet on phones.
 * Long school names wrap to two lines instead of being cut.
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

/** "SUPER_ADMIN" -> "Super admin", "class_teacher" -> "Class teacher"; readable names kept. */
export const roleLabel = (role: string) => {
  const r = role.trim();
  if (!/[_]/.test(r) && r !== r.toUpperCase()) return r;
  const words = r.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

/**
 * Asking to switch goes through one always-mounted host. The menu that offers the
 * choice closes as soon as a school is picked; a dialog living inside that menu
 * unmounted with it, so picking a school from the account menu did nothing.
 */
const SWITCH_EVENT = "nga:switch-school";
export const requestSchoolSwitch = (to: MySchool) => window.dispatchEvent(new CustomEvent<MySchool>(SWITCH_EVENT, { detail: to }));

/** Mount once (Navbar). Shows the confirm-switch dialog for any switcher on the page. */
export const SchoolSwitchHost: React.FC = () => {
  const schools = useMySchools();
  const [target, setTarget] = useState<MySchool | null>(null);
  useEffect(() => {
    const on = (e: Event) => setTarget((e as CustomEvent<MySchool>).detail);
    window.addEventListener(SWITCH_EVENT, on);
    return () => window.removeEventListener(SWITCH_EVENT, on);
  }, []);
  const current = schools?.find((s) => s.current) ?? null;
  return <SwitchSchoolDialog from={current} to={target} onClose={() => setTarget(null)} />;
};

/** One school in the list: logo, name (wraps), roles, and Current / switch affordance. */
const SchoolRow: React.FC<{ s: MySchool; onPick: (s: MySchool) => void }> = ({ s, onPick }) => (
  <li role="none">
    <button
      type="button"
      role="menuitem"
      aria-current={s.current ? "true" : undefined}
      disabled={s.current}
      onClick={() => onPick(s)}
      className={cx(
        "group flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        s.current ? "cursor-default bg-blue-50 dark:bg-blue-500/10" : "hover:bg-gray-100 dark:hover:bg-gray-800/70",
      )}
    >
      <SchoolMark name={s.name} logoUrl={s.logoUrl} size="md" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words text-sm font-medium leading-snug text-gray-900 dark:text-white" title={s.name}>
          {s.name}
        </span>
        {!!s.roles?.length && <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">{s.roles.map(roleLabel).join(" · ")}</span>}
      </span>
      {s.current ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">
          <Check className="h-3 w-3" aria-hidden="true" />
          Current
        </span>
      ) : (
        <ArrowRight className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-400" aria-hidden="true" />
      )}
    </button>
  </li>
);

const SchoolSwitcher: React.FC<{ variant?: "chip" | "menu"; onPicked?: () => void }> = ({ variant = "chip", onPicked }) => {
  const schools = useMySchools();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  useEffect(() => {
    if (!open || variant === "menu") return; // the inline list closes with its menu
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open, variant]);

  if (!schools || schools.length < 2) return null;
  const current = schools.find((s) => s.current) ?? null;
  // current school first, then the others by name
  const ordered = [...schools].sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name));
  const pick = (s: MySchool) => {
    if (s.current) return;
    setOpen(false);
    requestSchoolSwitch(s);
    onPicked?.();
  };
  const list = (
    <ul id={listId} role="menu" aria-label="Your schools" className="space-y-0.5">
      {ordered.map((s) => (
        <SchoolRow key={s.tid} s={s} onPick={pick} />
      ))}
    </ul>
  );

  if (variant === "menu") {
    return (
      <div className="px-2 py-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={listId}
          className="flex w-full items-center gap-3 rounded-full px-2 py-2 text-left transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-gray-800/70"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400" aria-hidden="true">
            <Repeat className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">Switch school</span>
            {current && <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{current.name}</span>}
          </span>
          <span className="shrink-0 rounded-full bg-gray-100 px-1.5 text-[11px] font-semibold leading-5 text-gray-600 tabular-nums dark:bg-gray-800 dark:text-gray-300" title={`${schools.length} schools`}>
            {schools.length}
          </span>
          <ChevronDown className={cx("h-4 w-4 shrink-0 text-gray-400 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
        {/* expands in place: grid-rows 0fr -> 1fr animates the height without measuring */}
        <div className={cx("grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")} aria-hidden={!open}>
          <div className="overflow-hidden">
            <div className="mt-1 rounded-2xl bg-gray-50 p-1 dark:bg-gray-800/50" {...({ inert: open ? undefined : "" } as Record<string, unknown>)}>
              {list}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`School: ${current?.name ?? ""}. Switch school`}
        title={current ? `${current.name} · switch school` : "Switch school"}
        className="flex max-w-[13rem] items-center gap-2 rounded-full border border-gray-200 py-1 pl-1 pr-1 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:pr-2.5 dark:border-gray-700/40 dark:text-gray-100 dark:hover:bg-gray-800/60"
      >
        {current && <SchoolMark name={current.name} logoUrl={current.logoUrl} size="sm" />}
        <span className="hidden truncate sm:inline">{current?.name}</span>
        <ChevronDown className={cx("hidden h-3.5 w-3.5 shrink-0 opacity-70 transition-transform sm:block", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div
          className={cx(
            // phones: a full-width sheet under the top bar; from sm: a popover under the chip
            "fixed inset-x-2 top-16 z-50 rounded-2xl border border-gray-200 bg-white p-2 dark:border-gray-700/30 dark:bg-gray-900",
            "sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80",
          )}
        >
          <p className="flex items-center justify-between px-2.5 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <span>Your schools</span>
            <span className="tabular-nums">{schools.length}</span>
          </p>
          {list}
        </div>
      )}
    </div>
  );
};

export default SchoolSwitcher;
