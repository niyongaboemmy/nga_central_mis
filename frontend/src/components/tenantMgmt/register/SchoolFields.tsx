import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AtSign, Building2, Globe, GraduationCap, Link2, MapPin, Phone, School, Sparkles, Users, Wrench, Backpack, AlertTriangle, type LucideIcon } from "lucide-react";
import { publicApi, type SchoolType } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import SelectField from "../../ui/SelectField";
import { Field, LiveCheck, NumberStepper, Shake, ErrorLine, cx, inputCls, useDebounced, type CheckState } from "./fields";
import { SLUG_RE, slugify, type SchoolErrors, type SchoolForm } from "./wizardState";

export const SCHOOL_TYPES: Array<{ value: SchoolType; label: string; icon: LucideIcon }> = [
  { value: "primary", label: "Primary", icon: Backpack },
  { value: "secondary", label: "Secondary", icon: School },
  { value: "tvet", label: "TVET", icon: Wrench },
  { value: "university", label: "University", icon: GraduationCap },
  { value: "other", label: "Other", icon: Building2 },
];

export type Divisions = Record<string, Record<string, string[]>>;

/** Select when the list has entries, free text otherwise. */
const PlaceSelect: React.FC<{ label: string; value: string; options: string[]; onChange: (v: string) => void; error?: string; disabled?: boolean; optional?: boolean }> = ({
  label,
  value,
  options,
  onChange,
  error,
  disabled,
  optional,
}) => (
  <Field label={label} error={error} optional={optional}>
    {({ id, describedBy, invalid }) =>
      options.length ? (
        <SelectField id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} aria-describedby={describedBy} className={inputCls(error)}>
          <option value="">—</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </SelectField>
      ) : (
        <input id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} aria-describedby={describedBy} className={inputCls(error)} />
      )
    }
  </Field>
);

/**
 * Every school field of step 1 (also the tracker's "Fix changes" editor):
 * type tiles, cascading divisions, steppers, near-duplicate chips and a live
 * slug check. Reports the slug verdict through onSlugState.
 */
const SchoolFields: React.FC<{
  value: SchoolForm;
  onChange: (patch: Partial<SchoolForm>) => void;
  errors: SchoolErrors;
  divisions: Divisions;
  onSlugState: (ok: boolean | null) => void;
  /** a slug that is known to be ours (tracker edit): not re-checked */
  ownSlug?: string | null;
  checkSimilar?: boolean;
}> = ({ value: s, onChange, errors, divisions, onSlugState, ownSlug, checkSimilar = true }) => {
  const m = useMotion();
  const [similar, setSimilar] = useState<Array<{ name: string; kind: "TENANT" | "APPLICATION" }>>([]);
  const [slugCheck, setSlugCheck] = useState<{ state: CheckState; suggestion: string | null; reason?: string }>({ state: "idle", suggestion: null });
  const name = useDebounced(s.schoolName.trim(), 450);
  const slug = useDebounced(s.desiredSlug, 400);

  // near-duplicate names
  useEffect(() => {
    if (!checkSimilar || name.length < 3) return setSimilar([]);
    let live = true;
    publicApi
      .similarSchools(name)
      .then((r) => live && setSimilar(r.slice(0, 3)))
      .catch(() => live && setSimilar([]));
    return () => {
      live = false;
    };
  }, [name, checkSimilar]);

  // slug availability
  useEffect(() => {
    if (!slug || !SLUG_RE.test(slug)) {
      setSlugCheck({ state: slug ? "bad" : "idle", suggestion: null });
      onSlugState(null);
      return;
    }
    if (ownSlug && slug === ownSlug) {
      setSlugCheck({ state: "ok", suggestion: null });
      onSlugState(true);
      return;
    }
    let live = true;
    setSlugCheck((c) => ({ ...c, state: "checking" }));
    publicApi
      .slugAvailable(slug)
      .then((r) => {
        if (!live) return;
        setSlugCheck({ state: r.available ? "ok" : "bad", suggestion: r.available ? null : r.suggestion, reason: r.reason });
        onSlugState(r.available);
      })
      .catch(() => {
        if (!live) return;
        setSlugCheck({ state: "idle", suggestion: null });
        onSlugState(null);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, ownSlug]);

  const provinces = Object.keys(divisions);
  const districts = s.province && divisions[s.province] ? Object.keys(divisions[s.province]) : [];
  const sectors = s.province && s.district && divisions[s.province]?.[s.district] ? divisions[s.province][s.district] : [];

  const setName = (schoolName: string) => onChange(s.slugTouched ? { schoolName } : { schoolName, desiredSlug: slugify(schoolName) });
  const slugBad = slugCheck.state === "bad" && SLUG_RE.test(s.desiredSlug);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="School name" icon={School} error={errors.schoolName} className="sm:col-span-2">
        {({ id, describedBy, invalid }) => (
          <>
            <input id={id} value={s.schoolName} onChange={(e) => setName(e.target.value)} autoComplete="organization" aria-invalid={invalid} aria-describedby={describedBy} className={inputCls(errors.schoolName)} />
            <AnimatePresence>
              {similar.length > 0 && (
                <motion.div {...m("reveal")} className="mt-2 flex flex-wrap items-center gap-1.5" aria-live="polite">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300" aria-hidden />
                  <span className="sr-only">Similar schools:</span>
                  {similar.map((x) => (
                    <span key={x.name} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-400/15 dark:text-amber-100">
                      {x.name}
                    </span>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </Field>

      <Shake error={errors.schoolType} className="sm:col-span-2">
        <div role="radiogroup" aria-label="School type" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {SCHOOL_TYPES.map((t) => {
            const on = s.schoolType === t.value;
            return (
              <motion.button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={on}
                {...m("tap")}
                onClick={() => onChange({ schoolType: t.value })}
                className={cx(
                  "flex flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                  on ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100" : "border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-200",
                )}
              >
                <motion.span animate={on ? { scale: [1, 1.2, 1] } : { scale: 1 }}>
                  <t.icon className="h-6 w-6" aria-hidden />
                </motion.span>
                {t.label}
              </motion.button>
            );
          })}
        </div>
        <ErrorLine error={errors.schoolType} />
      </Shake>

      <PlaceSelect label="Province" value={s.province} options={provinces} error={errors.province} onChange={(province) => onChange({ province, district: "", sector: "" })} />
      <PlaceSelect label="District" value={s.district} options={districts} error={errors.district} disabled={!!provinces.length && !s.province} onChange={(district) => onChange({ district, sector: "" })} />
      <PlaceSelect label="Sector" value={s.sector} options={sectors} optional disabled={!!districts.length && !s.district} onChange={(sector) => onChange({ sector })} />
      <Field label="Address" icon={MapPin} optional>
        {({ id }) => <input id={id} value={s.address} onChange={(e) => onChange({ address: e.target.value })} autoComplete="street-address" className={inputCls()} />}
      </Field>
      <Field label="Phone" icon={Phone} error={errors.schoolPhone} optional>
        {({ id, describedBy, invalid }) => (
          <input id={id} type="tel" value={s.schoolPhone} onChange={(e) => onChange({ schoolPhone: e.target.value })} autoComplete="tel" aria-invalid={invalid} aria-describedby={describedBy} className={inputCls(errors.schoolPhone)} />
        )}
      </Field>
      <Field label="E-mail" icon={AtSign} error={errors.schoolEmail} optional>
        {({ id, describedBy, invalid }) => (
          <input id={id} type="email" value={s.schoolEmail} onChange={(e) => onChange({ schoolEmail: e.target.value })} autoComplete="email" aria-invalid={invalid} aria-describedby={describedBy} className={inputCls(errors.schoolEmail)} />
        )}
      </Field>
      <Field label="Website" icon={Globe} optional className="sm:col-span-2">
        {({ id }) => <input id={id} type="url" value={s.website} onChange={(e) => onChange({ website: e.target.value })} placeholder="https://" className={inputCls()} />}
      </Field>
      <Field label="Students" icon={GraduationCap}>
        {({ id }) => <NumberStepper id={id} label="students" value={s.estStudents} step={50} max={50000} onChange={(estStudents) => onChange({ estStudents })} />}
      </Field>
      <Field label="Staff" icon={Users}>
        {({ id }) => <NumberStepper id={id} label="staff" value={s.estStaff} step={5} max={5000} onChange={(estStaff) => onChange({ estStaff })} />}
      </Field>

      <Field label="Short name" icon={Link2} error={errors.desiredSlug ?? (slugBad ? slugCheck.reason || "Taken" : undefined)} className="sm:col-span-2" trailing={<LiveCheck state={slugCheck.state} label={slugCheck.state === "ok" ? "Available" : slugCheck.state === "bad" ? "Not available" : "Checking"} />}>
        {({ id, describedBy, invalid }) => (
          <>
            <div className={cx("flex items-center overflow-hidden rounded-xl border bg-white focus-within:ring-2 focus-within:ring-brand-500 dark:bg-slate-800", errors.desiredSlug || slugBad ? "border-red-500" : slugCheck.state === "ok" ? "border-emerald-500" : "border-slate-300 dark:border-slate-600")}>
              <input
                id={id}
                value={s.desiredSlug}
                onChange={(e) => onChange({ desiredSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30), slugTouched: true })}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                autoCapitalize="none"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-semibold text-slate-900 focus:outline-none dark:text-white"
              />
              <span className="shrink-0 pr-3 text-sm text-slate-600 dark:text-slate-300">.amashuri.com</span>
            </div>
            <AnimatePresence>
              {slugCheck.suggestion && (
                <motion.button
                  type="button"
                  {...m("reveal")}
                  onClick={() => onChange({ desiredSlug: slugCheck.suggestion!, slugTouched: true })}
                  className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:bg-emerald-400/15 dark:text-emerald-100"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">Use</span>
                  {slugCheck.suggestion}
                </motion.button>
              )}
            </AnimatePresence>
          </>
        )}
      </Field>
    </div>
  );
};

export default SchoolFields;
