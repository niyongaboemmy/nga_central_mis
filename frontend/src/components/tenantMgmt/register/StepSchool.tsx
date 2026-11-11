import React, { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { DropZone } from "../kit";
import SchoolFields, { type Divisions } from "./SchoolFields";
import { StepFooter, iconBtn } from "./fields";
import { validateSchool, type SchoolErrors, type SchoolForm } from "./wizardState";

const StepSchool: React.FC<{
  school: SchoolForm;
  onChange: (patch: Partial<SchoolForm>) => void;
  divisions: Divisions;
  logo: File | null;
  logoUploaded: boolean;
  onLogo: (f: File | null) => void;
  onNext: () => void;
}> = ({ school, onChange, divisions, logo, logoUploaded, onLogo, onNext }) => {
  const [errors, setErrors] = useState<SchoolErrors>({});
  const [slugOk, setSlugOk] = useState<boolean | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const preview = useMemo(() => {
    try {
      return logo && typeof URL.createObjectURL === "function" ? URL.createObjectURL(logo) : null;
    } catch {
      return null;
    }
  }, [logo]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateSchool(school, slugOk);
    setErrors(errs);
    if (Object.keys(errs).length) {
      if (errs.schoolType && Object.keys(errs).length === 1) form.current?.querySelector<HTMLElement>('[role="radiogroup"] button')?.focus();
      else window.setTimeout(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    onNext();
  };

  const patch = (p: Partial<SchoolForm>) => {
    onChange(p);
    // clear the error of a field as soon as it changes
    const keys = Object.keys(p) as Array<keyof SchoolForm>;
    if (keys.some((k) => errors[k])) setErrors((old) => Object.fromEntries(Object.entries(old).filter(([k]) => !keys.includes(k as keyof SchoolForm))));
  };

  return (
    <form ref={form} onSubmit={submit} noValidate>
      <SchoolFields value={school} onChange={patch} errors={errors} divisions={divisions} onSlugState={setSlugOk} />
      <div className="mt-4">
        {logo || logoUploaded ? (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-500/40 dark:bg-emerald-400/10">
            {preview && <img src={preview} alt="" className="h-12 w-12 rounded-xl object-cover" />}
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{logo?.name ?? "Logo"}</span>
            {logo && (
              <button type="button" className={iconBtn} onClick={() => onLogo(null)}>
                <X className="h-4 w-4" aria-hidden />
                <span className="sr-only">Remove logo</span>
              </button>
            )}
          </div>
        ) : (
          <DropZone accept="image/png,image/jpeg,image/webp,image/svg+xml" label="Logo (optional)" icon={ImagePlus} maxMb={2} onFile={(f) => onLogo(f)} />
        )}
      </div>
      <StepFooter primary="Next" />
    </form>
  );
};

export default StepSchool;
