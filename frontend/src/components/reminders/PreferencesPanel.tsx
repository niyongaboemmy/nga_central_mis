import React, { useEffect, useRef, useState } from "react";
import { Check, Loader2, Moon, Plus, Sunrise, X } from "lucide-react";
import type { ReminderKind, ReminderPreferences } from "../../api/reminders";
import { formatOffset, KIND_META, OFFSET_PRESETS } from "./agendaUtils";

const KINDS: ReminderKind[] = ["lesson", "activity", "quiz_open", "quiz_close", "assignment_due", "meeting", "event"];
const MAX_OFFSETS = 3;

type SaveState = "idle" | "saving" | "saved" | "error";

const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }> = ({
  checked,
  onChange,
  label,
  disabled,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative h-6 w-11 flex-shrink-0 rounded-full transition focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-50 ${
      checked ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-600"
    }`}
  >
    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
  </button>
);

const AddOffset: React.FC<{ existing: number[]; onAdd: (m: number) => void; kindLabel: string }> = ({ existing, onAdd, kindLabel }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const options = OFFSET_PRESETS.filter((m) => !existing.includes(m));
  if (existing.length >= MAX_OFFSETS || options.length === 0) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Add a reminder time for ${kindLabel}`}
        className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 text-xs font-semibold text-slate-600 transition hover:border-brand-500 hover:text-brand-600 dark:border-slate-600 dark:text-slate-300"
      >
        <Plus className="h-3.5 w-3.5" /> Add
      </button>
      {open && (
        <div role="menu" className="absolute left-0 z-20 mt-1 w-36 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-float dark:border-slate-700 dark:bg-slate-900">
          {options.map((m) => (
            <button
              key={m}
              type="button"
              role="menuitem"
              onClick={() => {
                onAdd(m);
                setOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-brand-50 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {formatOffset(m)} before
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * What to be reminded of, and how long before (proposal §8 defaults).
 * Autosaves: every change is sent after a short pause, with a visible status.
 */
export const PreferencesPanel: React.FC<{
  preferences: ReminderPreferences;
  onSave: (patch: Partial<ReminderPreferences>) => Promise<unknown>;
  isTeacher: boolean;
}> = ({ preferences, onSave, isTeacher }) => {
  const [draft, setDraft] = useState(preferences);
  const [state, setState] = useState<SaveState>("idle");
  const pending = useRef<Partial<ReminderPreferences>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => setDraft(preferences), [preferences]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const queue = (patch: Partial<ReminderPreferences>) => {
    pending.current = {
      ...pending.current,
      ...patch,
      settings: { ...(pending.current.settings ?? {}), ...(patch.settings ?? {}) } as ReminderPreferences["settings"],
    };
    setState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const body = pending.current;
      pending.current = {};
      if (body.settings && Object.keys(body.settings).length === 0) delete body.settings;
      try {
        await onSave(body);
        setState("saved");
      } catch {
        setState("error");
      }
    }, 600);
  };

  const setKind = (kind: ReminderKind, next: { enabled?: boolean; offsets?: number[] }) => {
    const merged = { ...draft.settings[kind], ...next };
    setDraft((d) => ({ ...d, settings: { ...d.settings, [kind]: merged } }));
    queue({ settings: { [kind]: merged } as ReminderPreferences["settings"] });
  };

  const lessonHint =
    isTeacher && !draft.lessonCustomized ? "Teachers get 15 min before their own lessons unless you choose times" : null;

  return (
    <section aria-labelledby="prefs-title" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-700/60 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <h2 id="prefs-title" className="text-base font-semibold text-slate-900 dark:text-white">
          What to remind me about
        </h2>
        <span className="flex h-6 items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400" role="status" aria-live="polite">
          {state === "saving" && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </>
          )}
          {state === "saved" && (
            <>
              <Check className="h-3.5 w-3.5 text-success-500" /> Saved
            </>
          )}
          {state === "error" && <span className="text-danger-500">Not saved — check your connection</span>}
        </span>
      </div>

      <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
        {KINDS.map((kind) => {
          const setting = draft.settings[kind];
          const meta = KIND_META[kind];
          return (
            <li key={kind} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <Switch checked={setting.enabled} onChange={(v) => setKind(kind, { enabled: v })} label={meta.label} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{meta.label}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{kind === "lesson" && lessonHint ? lessonHint : meta.hint}</p>
                </div>
              </div>
              <div
                className={`flex flex-wrap items-center gap-1.5 pl-14 sm:pl-0 ${setting.enabled ? "" : "pointer-events-none"}`}
                aria-disabled={!setting.enabled || undefined}
              >
                {setting.offsets.map((m) => (
                  <span
                    key={m}
                    className={`inline-flex h-7 items-center gap-1 rounded-full pl-2.5 pr-1 text-xs font-semibold ${
                      setting.enabled
                        ? "bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-200"
                        : "bg-slate-100 text-slate-600 line-through dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {formatOffset(m)}
                    <button
                      type="button"
                      aria-label={`Remove ${formatOffset(m)} reminder for ${meta.label}`}
                      disabled={setting.offsets.length <= 1}
                      onClick={() => setKind(kind, { offsets: setting.offsets.filter((o) => o !== m) })}
                      className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-brand-100 disabled:opacity-30 dark:hover:bg-brand-600/30"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <AddOffset
                  existing={setting.offsets}
                  kindLabel={meta.label}
                  onAdd={(m) => setKind(kind, { offsets: [...setting.offsets, m].sort((a, b) => b - a) })}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Moon className="h-4 w-4 text-indigo-500" /> Quiet hours
          </p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">Non-urgent reminders wait until morning.</p>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="time"
              aria-label="Quiet hours start"
              value={draft.quietStart}
              onChange={(e) => {
                setDraft((d) => ({ ...d, quietStart: e.target.value }));
                if (e.target.value) queue({ quietStart: e.target.value });
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <span className="text-sm text-slate-600 dark:text-slate-300">to</span>
            <input
              type="time"
              aria-label="Quiet hours end"
              value={draft.quietEnd}
              onChange={(e) => {
                setDraft((d) => ({ ...d, quietEnd: e.target.value }));
                if (e.target.value) queue({ quietEnd: e.target.value });
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
        </div>
        <div className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <Sunrise className="h-4 w-4 text-amber-500" /> Morning briefing
            </p>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
              One calm summary of your day at 06:30 instead of many pings.
            </p>
          </div>
          <Switch
            checked={draft.morningBriefing}
            label="Morning briefing"
            onChange={(v) => {
              setDraft((d) => ({ ...d, morningBriefing: v }));
              queue({ morningBriefing: v });
            }}
          />
        </div>
      </div>
    </section>
  );
};
