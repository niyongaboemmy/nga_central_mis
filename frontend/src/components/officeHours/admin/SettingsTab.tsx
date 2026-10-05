import React, { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { useToast } from "../../../contexts/ToastContext";
import { apiError, officeHoursApi } from "../../../api/officeHours";
import { Card, CardTitle, inputCls, labelCls, Muted, primaryBtn, Spinner } from "../ohUi";
import SelectField from "../../ui/SelectField";

/**
 * Office-hours policy (plan §6.8, decisions D1-D10). Every field says what it
 * changes, so leadership can tune the policy without reading the plan.
 */
type Field =
  | { key: string; label: string; help: string; type: "time" }
  | { key: string; label: string; help: string; type: "number"; min: number; max: number }
  | { key: string; label: string; help: string; type: "bool" }
  | { key: string; label: string; help: string; type: "select"; options: Array<[string, string]> };

const GROUPS: Array<{ title: string; fields: Field[] }> = [
  {
    title: "Who can be assigned",
    fields: [
      {
        key: "student_lock_mode",
        label: "One office hours per student",
        help: "Per term: a student holds at most one set of office hours this term. Per weekday: at most one per weekday, so two teachers can share a student on different days. Existing assignments keep their current lock.",
        type: "select",
        options: [
          ["TERM", "Per term (strict)"],
          ["WEEKDAY", "Per weekday"],
        ],
      },
      { key: "allow_any_student", label: "Teachers may assign any student", help: "Off: teachers assign only students they teach, lead as class teacher or mentor. Leadership can always assign anyone.", type: "bool" },
      { key: "roster_cutoff_time", label: "Same-day cut-off", help: "A student added on a meeting day after this time starts at the next session, so nobody is surprised at the last minute.", type: "time" },
    ],
  },
  {
    title: "When office hours run",
    fields: [
      { key: "band_start", label: "Timetable band starts", help: "The default start, shown on every timetable.", type: "time" },
      { key: "band_end", label: "Timetable band ends", help: "The default end.", type: "time" },
      { key: "allowed_window_start", label: "Earliest allowed start", help: "Teachers may move their office hours inside this window.", type: "time" },
      { key: "allowed_window_end", label: "Latest allowed end", help: "", type: "time" },
      { key: "default_capacity", label: "Default capacity", help: "Places offered when a teacher creates office hours.", type: "number", min: 1, max: 200 },
      { key: "max_capacity", label: "Maximum capacity", help: "No office hours can take more students than this.", type: "number", min: 1, max: 200 },
    ],
  },
  {
    title: "Register",
    fields: [
      { key: "late_after_minutes", label: "Late after (minutes)", help: "Used by self check-in to mark a student late.", type: "number", min: 0, max: 60 },
      { key: "register_edit_days", label: "Teachers can correct a register for (days)", help: "After this, only leadership can change it.", type: "number", min: 0, max: 60 },
      { key: "auto_close_unmarked", label: "Mark unmarked students absent after the window", help: "Off: a register nobody took stays 'unmarked' and is excluded from attendance rates. On: still-unmarked students become absent.", type: "bool" },
      { key: "qr_checkin_enabled", label: "Self check-in by QR code", help: "Students scan a rotating code shown by the teacher. The teacher's register still decides.", type: "bool" },
    ],
  },
  {
    title: "Consistency and follow-up",
    fields: [
      { key: "rate_band_consistent", label: "Consistent from (%)", help: "Attendance rate counted as consistent.", type: "number", min: 1, max: 100 },
      { key: "rate_band_watch", label: "Watch from (%)", help: "Below this a student is chronic. Matches the attendance app's 80% warning by default.", type: "number", min: 1, max: 100 },
      { key: "min_sessions_for_rate", label: "Sessions before a band is given", help: "Fewer held sessions show 'Too few sessions'.", type: "number", min: 1, max: 50 },
      { key: "escalation_consecutive_l1", label: "Tell the class teacher after (misses in a row)", help: "", type: "number", min: 1, max: 20 },
      { key: "escalation_month_l1", label: "…or after (misses in 30 days)", help: "", type: "number", min: 1, max: 20 },
      { key: "escalation_consecutive_l2", label: "Escalate to programme lead and parent after (misses in a row)", help: "Also when the rate falls below the watch threshold.", type: "number", min: 1, max: 30 },
      {
        key: "parent_notifications",
        label: "Parents are told",
        help: "Parents never get a message for every session.",
        type: "select",
        options: [
          ["OFF", "Never"],
          ["ESCALATIONS", "Only on repeated absence"],
          ["WEEKLY", "Repeated absence + a weekly summary"],
        ],
      },
    ],
  },
];

const SettingsTab: React.FC = () => {
  const { showToast } = useToast();
  const [values, setValues] = useState<Record<string, any> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    officeHoursApi
      .settings()
      .then((r) => setValues(r.data.data))
      .catch((e) => showToast(apiError(e, "Couldn't load settings"), "error"));
  }, [showToast]);

  const save = async () => {
    if (!values) return;
    setSaving(true);
    setErrors({});
    try {
      const body: Record<string, unknown> = {};
      for (const g of GROUPS) for (const f of g.fields) body[f.key] = values[f.key];
      const r = await officeHoursApi.saveSettings(body);
      setValues(r.data.data);
      showToast("Settings saved", "success");
    } catch (e: any) {
      const errs = e?.response?.data?.errors as Array<{ field: string; message: string }> | undefined;
      if (errs) setErrors(Object.fromEntries(errs.map((x) => [x.field, x.message])));
      showToast(apiError(e, "Couldn't save settings"), "error");
    } finally {
      setSaving(false);
    }
  };

  if (!values) return <Spinner />;
  return (
    <div className="space-y-5">
      {GROUPS.map((g) => (
        <Card key={g.title} labelledBy={`oh-set-${g.title}`}>
          <CardTitle id={`oh-set-${g.title}`} icon={<Settings2 className="h-4 w-4" aria-hidden />}>{g.title}</CardTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            {g.fields.map((f) => {
              const id = `oh-setting-${f.key}`;
              return (
                <div key={f.key}>
                  {f.type === "bool" ? (
                    <label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-gray-100">
                      <input id={id} type="checkbox" className="h-4 w-4 rounded border-slate-400" checked={Boolean(values[f.key])} onChange={(e) => setValues({ ...values, [f.key]: e.target.checked ? 1 : 0 })} />
                      {f.label}
                    </label>
                  ) : (
                    <>
                      <label htmlFor={id} className={labelCls}>{f.label}</label>
                      {f.type === "select" ? (
                        <SelectField id={id} className={inputCls} value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                          {f.options.map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </SelectField>
                      ) : (
                        <input
                          id={id}
                          type={f.type}
                          className={inputCls}
                          value={values[f.key] ?? ""}
                          min={f.type === "number" ? f.min : undefined}
                          max={f.type === "number" ? f.max : undefined}
                          onChange={(e) => setValues({ ...values, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value })}
                        />
                      )}
                    </>
                  )}
                  {f.help && <Muted className="mt-1 text-xs">{f.help}</Muted>}
                  {errors[f.key] && <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">{errors[f.key]}</p>}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
      <div className="flex justify-end">
        <button type="button" className={primaryBtn} onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save settings"}</button>
      </div>
    </div>
  );
};

export default SettingsTab;
