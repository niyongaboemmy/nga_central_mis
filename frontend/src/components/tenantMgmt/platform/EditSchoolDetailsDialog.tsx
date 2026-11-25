import React, { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Globe2, ImageUp, Loader2, Pencil, Trash2 } from "lucide-react";
import Modal from "../../ui/Modal";
import SelectField from "../../ui/SelectField";
import TenantLogo from "../../brand/TenantLogo";
import { platformApi, type TenantDetail } from "../../../api/tenantMgmt";
import { Btn, Field, act, cx, inputCls, surface, toast } from "./platformShared";

/** Every IANA timezone the browser knows, with the school's current one first if it's missing. */
const timezones = (current: string): string[] => {
  const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? ["Africa/Kigali", "Africa/Nairobi", "Africa/Kampala", "Africa/Dar_es_Salaam", "UTC"];
  return all.includes(current) ? all : [current, ...all];
};

const LOGO_TYPES = "image/png,image/jpeg,image/svg+xml,image/webp";
const LOGO_MAX = 5 * 1024 * 1024;

/**
 * The school's logo as an interactive tile: click or drop an image to replace it, a small
 * button removes it. Saves straight away (POST/DELETE /platform/tenants/:id/logo) and toasts.
 * Read-only (no overlay) without `canEdit`.
 */
export const LogoEditor: React.FC<{ d: TenantDetail; canEdit: boolean; onChange: (d: TenantDetail) => void; size?: number }> = ({ d, canEdit, onChange, size = 72 }) => {
  const t = d.tenant;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const upload = async (file?: File | null) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type)) return toast("Use a PNG, JPG, SVG or WEBP image", "error");
    if (file.size > LOGO_MAX) return toast("The image is larger than 5 MB", "error");
    setBusy(true);
    const next = await act(() => platformApi.setLogo(t.tid, file), "Logo updated");
    setBusy(false);
    if (next) onChange(next);
  };
  const remove = async () => {
    setBusy(true);
    const next = await act(() => platformApi.removeLogo(t.tid), "Logo removed");
    setBusy(false);
    if (next) onChange(next);
  };
  const logo = <TenantLogo src={t.logoUrl} name={t.name} isPrimary={t.isPrimary} className="h-full w-full" rounded="rounded-2xl" />;
  return (
    <div className="group relative shrink-0" style={{ width: size, height: size }}>
      {canEdit ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void upload(e.dataTransfer.files?.[0]);
          }}
          disabled={busy}
          aria-label={t.logoUrl ? "Change the logo" : "Add a logo"}
          title={t.logoUrl ? "Change the logo" : "Add a logo"}
          className={cx(
            "relative block h-full w-full overflow-hidden rounded-2xl bg-gray-50 p-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-gray-900/50",
            over && "ring-2 ring-blue-500",
          )}
        >
          {logo}
          <span
            className={cx(
              "absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-2xl bg-gray-900/60 text-[11px] font-semibold text-white transition-opacity",
              busy || over ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
            )}
            aria-hidden
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : over ? <ImageUp className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
            {busy ? "Saving" : over ? "Drop" : "Change"}
          </span>
        </button>
      ) : (
        <span className="block h-full w-full overflow-hidden rounded-2xl bg-gray-50 p-1 dark:bg-gray-900/50">{logo}</span>
      )}
      {canEdit && t.logoUrl && !busy && (
        <button
          type="button"
          onClick={remove}
          aria-label="Remove the logo"
          title="Remove the logo"
          className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-gray-500 opacity-0 ring-1 ring-gray-200 transition-opacity hover:text-red-600 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 group-hover:opacity-100 dark:bg-gray-900 dark:text-gray-400 dark:ring-gray-700/50"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
      <input ref={input} type="file" accept={LOGO_TYPES} className="hidden" aria-label="Logo file" onChange={(e) => void upload(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
    </div>
  );
};

/**
 * Edit a school's details from the platform console (PUT /platform/tenants/:id/details).
 * Name, legal name (printed on invoices), timezone and country, with a reason. The logo sits at
 * the top and saves on its own. The web address (slug) is shown but fixed: the school's sign-in
 * address and its databases are named after it.
 */
const EditSchoolDetailsDialog: React.FC<{ d: TenantDetail; open: boolean; onClose: () => void; onSaved: (d: TenantDetail) => void; onLogo?: (d: TenantDetail) => void }> = ({
  d,
  open,
  onClose,
  onSaved,
  onLogo,
}) => {
  const t = d.tenant;
  const initial = useMemo(() => ({ name: t.name, legalName: t.legalName ?? "", timezone: t.timezone, country: t.country ?? "" }), [t.name, t.legalName, t.timezone, t.country]);
  const [f, setF] = useState(initial);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  // Reset only when the dialog opens: a logo saved meanwhile must not wipe what was typed.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setF(initial);
      setReason("");
    }
    wasOpen.current = open;
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
      <div className={cx(surface.inset, "mb-5 flex items-center gap-4 p-3")}>
        <LogoEditor d={d} canEdit onChange={(next) => onLogo?.(next)} size={64} />
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-gray-900 dark:text-white">Logo</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Click or drop an image · PNG, JPG, SVG, WEBP · 5 MB · saves straight away</p>
        </div>
      </div>
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
