import React, { useEffect, useMemo, useState } from "react";
import { Globe2, Pencil } from "lucide-react";
import Modal from "../../ui/Modal";
import SelectField from "../../ui/SelectField";
import { platformApi, type TenantDetail } from "../../../api/tenantMgmt";
import { Btn, Field, act, cx, inputCls, surface } from "./platformShared";

/** Every IANA timezone the browser knows, with the school's current one first if it's missing. */
const timezones = (current: string): string[] => {
  const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? ["Africa/Kigali", "Africa/Nairobi", "Africa/Kampala", "Africa/Dar_es_Salaam", "UTC"];
  return all.includes(current) ? all : [current, ...all];
};

/**
 * Edit a school's details from the platform console (PUT /platform/tenants/:id/details).
 * Name, legal name (printed on invoices), timezone and country. The web address (slug) is
 * shown but fixed: the school's sign-in address and its databases are named after it.
 */
const EditSchoolDetailsDialog: React.FC<{ d: TenantDetail; open: boolean; onClose: () => void; onSaved: (d: TenantDetail) => void }> = ({ d, open, onClose, onSaved }) => {
  const t = d.tenant;
  const initial = useMemo(() => ({ name: t.name, legalName: t.legalName ?? "", timezone: t.timezone, country: t.country ?? "" }), [t]);
  const [f, setF] = useState(initial);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setF(initial);
      setReason("");
    }
  }, [open, initial]);
  const tzs = useMemo(() => timezones(t.timezone), [t.timezone]);

  const changes: Record<string, string> = {};
  if (f.name.trim().replace(/\s+/g, " ") !== initial.name) changes.name = f.name;
  if (f.legalName.trim() !== initial.legalName) changes.legalName = f.legalName;
  if (f.timezone !== initial.timezone) changes.timezone = f.timezone;
  if (f.country.trim().toUpperCase() !== initial.country) changes.country = f.country;
  const nameOk = f.name.trim().length >= 3 && f.name.trim().length <= 150;
  const countryOk = !f.country.trim() || /^[A-Za-z]{2}$/.test(f.country.trim());
  const ok = Object.keys(changes).length > 0 && nameOk && countryOk && reason.trim().length >= 3;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <Modal
      isOpen={open}
      onClose={() => !busy && onClose()}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Pencil className="h-5 w-5" aria-hidden />
          Edit school details
        </span>
      }
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ok) return;
          setBusy(true);
          const next = await act(() => platformApi.updateDetails(t.tid, { ...changes, reason: reason.trim() }), "School details saved");
          setBusy(false);
          if (next) onSaved(next);
        }}
      >
        <Field label="School name">
          {(id) => <input id={id} required autoFocus value={f.name} onChange={set("name")} maxLength={150} className={cx(inputCls, !nameOk && "border-red-400 dark:border-red-500/60")} />}
        </Field>
        <Field label="Legal name (on invoices)">
          {(id) => <input id={id} value={f.legalName} onChange={set("legalName")} maxLength={200} placeholder={f.name || "Same as the school name"} className={inputCls} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field label="Timezone">
            {(id) => (
              <SelectField id={id} value={f.timezone} onChange={set("timezone")} searchable className={inputCls}>
                {tzs.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, " ")}
                  </option>
                ))}
              </SelectField>
            )}
          </Field>
          <Field label="Country">
            {(id) => (
              <input
                id={id}
                value={f.country}
                onChange={(e) => setF({ ...f, country: e.target.value.toUpperCase().slice(0, 2) })}
                maxLength={2}
                placeholder="RW"
                className={cx(inputCls, "uppercase", !countryOk && "border-red-400 dark:border-red-500/60")}
              />
            )}
          </Field>
        </div>
        <div className={cx(surface.inset, "flex items-start gap-2 px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300")}>
          <Globe2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Web address <span className="font-mono font-semibold text-gray-900 dark:text-white">{t.slug}</span> stays the same: the school signs in there and its data is stored under it.
          </span>
        </div>
        <Field label="Reason">
          {(id) => <textarea id={id} required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} placeholder="e.g. The school registered a new name" />}
        </Field>
        <p className="text-xs text-gray-600 dark:text-gray-300">The new name shows on the school's sign-in page, app header and invoices straight away, and is recorded in the audit log.</p>
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn type="submit" tone="primary" icon={Pencil} disabled={!ok} busy={busy}>
            Save details
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

export default EditSchoolDetailsDialog;
