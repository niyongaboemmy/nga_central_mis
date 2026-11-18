import React, { useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, Building2, Check, ChevronDown, GraduationCap, HandHeart, Landmark, Lightbulb, Mail, Phone, Plus, Search, Shapes, Undo2, UserRound, X } from "lucide-react";
import { failure, sideProjectsApi, type Customer, type CustomerKind } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import { Field, FormModal, IconInput, TextArea } from "../form";
import { Dropzone, Spinner, inputCls, primaryBtn, secondaryBtn } from "../ui";

export const CUSTOMER_KIND_META: Record<CustomerKind, { label: string; icon: React.ElementType }> = {
  COMPANY: { label: "Company", icon: Building2 },
  PERSON: { label: "Person", icon: UserRound },
  SCHOOL: { label: "School", icon: GraduationCap },
  NGO: { label: "NGO", icon: HandHeart },
  GOVERNMENT: { label: "Government", icon: Landmark },
  OTHER: { label: "Other", icon: Shapes },
};
export const CUSTOMER_KINDS: CustomerKind[] = ["COMPANY", "PERSON", "SCHOOL", "NGO", "GOVERNMENT", "OTHER"];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/** The customer's logo, or their initials on a soft tile. */
export const CustomerLogo: React.FC<{ c: { id: number; name: string; logoAssetId: number | null }; size?: number; className?: string }> = ({ c, size = 36, className = "" }) => {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [c.logoAssetId]);
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 font-bold text-slate-600 dark:bg-gray-800 dark:text-gray-300 ${className}`} style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }} aria-hidden>
      {initials(c.name)}
      {c.logoAssetId && !broken && <img src={sideProjectsApi.customerLogoUrl(c.id, c.logoAssetId)} alt="" onError={() => setBroken(true)} className="absolute inset-0 h-full w-full bg-white object-contain p-0.5 dark:bg-gray-100" />}
    </span>
  );
};

type Form = { name: string; kind: CustomerKind; contactName: string; email: string; phone: string; website: string; address: string; description: string };
const blank: Form = { name: "", kind: "COMPANY", contactName: "", email: "", phone: "", website: "", address: "", description: "" };

/** Register or edit a customer, with an optional logo (PNG/JPG/WebP). */
export const CustomerModal: React.FC<{ open: boolean; customer?: Customer | null; initialName?: string; onClose: () => void; onSaved: (c: Customer) => void }> = ({ open, customer, initialName, onClose, onSaved }) => {
  const { showToast } = useToast();
  const [f, setF] = useState<Form>(blank);
  const [logo, setLogo] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setLogo(null);
    setRemoveLogo(false);
    setF(
      customer
        ? { name: customer.name, kind: customer.kind, contactName: customer.contactName ?? "", email: customer.email ?? "", phone: customer.phone ?? "", website: customer.website ?? "", address: customer.address ?? "", description: customer.description ?? "" }
        : { ...blank, name: initialName ?? "" },
    );
  }, [open, customer, initialName]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = "At least 2 characters";
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = "Use a valid email address";
    if (f.website && !/^https:\/\//i.test(f.website.trim())) e.website = "Start with https://";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const fields = { ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, String(v).trim()])), ...(removeLogo ? { removeLogo: true } : {}) };
    try {
      const c = customer ? await sideProjectsApi.updateCustomer(customer.id, fields, logo) : await sideProjectsApi.createCustomer(fields, logo);
      showToast(customer ? "Customer saved" : `${c.name} registered`, "success");
      onClose();
      onSaved(c);
    } catch (err) {
      const x = failure(err, "The customer wasn't saved");
      if (x.field) setErrors({ [x.field === "logo" || x.field === "file" ? "logo" : x.field]: x.message });
      showToast(x.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const currentLogo = customer?.logoAssetId && !removeLogo ? sideProjectsApi.customerLogoUrl(customer.id, customer.logoAssetId) : null;
  return (
    <FormModal
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      icon={Briefcase}
      title={customer ? "Edit customer" : "Register a customer"}
      subtitle="Shared by every project, so it's registered once."
      footer={
        <>
          <button type="button" className={secondaryBtn} onClick={onClose} disabled={busy}>
            <Undo2 className="h-4 w-4" /> Cancel
          </button>
          <button type="button" className={primaryBtn} onClick={save} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} {customer ? "Save" : "Register"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="w-28 shrink-0">
            {preview || currentLogo ? (
              <div className="relative">
                <img src={preview ?? currentLogo ?? ""} alt="Logo preview" className="h-28 w-28 rounded-2xl border border-slate-900/[0.07] bg-white object-contain p-2 dark:border-white/10 dark:bg-gray-100" />
                <button type="button" aria-label="Remove logo" onClick={() => (logo ? setLogo(null) : setRemoveLogo(true))} className="absolute -right-2 -top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-700 dark:bg-gray-700 dark:hover:bg-gray-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <Dropzone compact onFiles={(fs) => (setLogo(fs[0]), setErrors((x) => ({ ...x, logo: "" })))} accept="image/png,image/jpeg,image/webp" label="Logo" hint="PNG · JPG" error={errors.logo || null} />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-4">
            <Field label="Name" htmlFor="cu-name" counter={{ value: f.name, min: 2, max: 120 }} error={errors.name}>
              <input id="cu-name" data-autofocus value={f.name} onChange={(e) => set("name", e.target.value)} className={`${inputCls} font-semibold`} placeholder="e.g. Kigali Green Farms" />
            </Field>
            <Field label="Kind">
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kind of customer">
                {CUSTOMER_KINDS.map((k) => {
                  const K = CUSTOMER_KIND_META[k];
                  return (
                    <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => set("kind", k)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${f.kind === k ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"}`}>
                      <K.icon className="h-3.5 w-3.5" aria-hidden /> {K.label}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact person" htmlFor="cu-contact" optional>
            <IconInput id="cu-contact" icon={UserRound} value={f.contactName} onChange={(e) => set("contactName", e.target.value)} />
          </Field>
          <Field label="Email" htmlFor="cu-email" optional error={errors.email}>
            <IconInput id="cu-email" icon={Mail} type="email" value={f.email} invalid={!!errors.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Phone" htmlFor="cu-phone" optional error={errors.phone}>
            <IconInput id="cu-phone" icon={Phone} value={f.phone} invalid={!!errors.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+250 7…" />
          </Field>
          <Field label="Website" htmlFor="cu-web" optional error={errors.website}>
            <input id="cu-web" value={f.website} onChange={(e) => set("website", e.target.value)} className={inputCls} placeholder="https://…" />
          </Field>
        </div>
        <Field label="Address" htmlFor="cu-addr" optional>
          <input id="cu-addr" value={f.address} onChange={(e) => set("address", e.target.value)} className={inputCls} />
        </Field>
        <Field label="About" htmlFor="cu-desc" optional>
          <TextArea id="cu-desc" rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="What they do, what they need" />
        </Field>
      </div>
    </FormModal>
  );
};

/** Search registered customers; register a new one in place when it's not there yet. */
export const CustomerPicker: React.FC<{ value: Customer | { id: number; name: string; logoAssetId: number | null } | null; onChange: (c: Customer | null) => void; error?: string | null }> = ({ value, onChange, error }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [list, setList] = useState<Customer[] | null>(null);
  const [register, setRegister] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setList(null);
    const t = setTimeout(() => {
      sideProjectsApi
        .customers(q)
        .then((r) => live && setList(r))
        .catch(() => live && setList([]));
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${inputCls} flex items-center gap-3 text-left ${error ? "!border-red-400" : ""}`}
      >
        {value ? (
          <>
            <CustomerLogo c={value} size={28} />
            <span className="min-w-0 flex-1 truncate font-semibold">{value.name}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 text-slate-400 dark:text-gray-500">Choose a customer</span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      </button>
      {error && <p role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-2xl border border-slate-900/[0.07] bg-white dark:border-white/10 dark:bg-gray-900">
          <div className="relative border-b border-slate-900/[0.05] p-2 dark:border-white/[0.06]">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers" aria-label="Search customers" className="h-9 w-full rounded-full bg-slate-50 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 dark:bg-gray-800 dark:text-white" />
          </div>
          <ul role="listbox" aria-label="Customers" className="max-h-64 overflow-y-auto p-1.5">
            {!list ? (
              <li role="presentation" className="flex items-center justify-center py-4">
                <Spinner className="h-4 w-4 text-slate-400" />
              </li>
            ) : list.length === 0 ? (
              <li role="presentation" className="px-3 py-3 text-center text-xs text-slate-500 dark:text-gray-400">{q ? `No customer called “${q}” yet` : "No customers registered yet"}</li>
            ) : (
              list.map((c) => (
                <li
                  key={c.id}
                  role="option"
                  tabIndex={0}
                  aria-selected={value?.id === c.id}
                  onClick={() => (onChange(c), setOpen(false))}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onChange(c), setOpen(false))}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${value?.id === c.id ? "bg-blue-50 dark:bg-blue-500/15" : "hover:bg-slate-50 dark:hover:bg-gray-800"}`}
                >
                    <CustomerLogo c={c} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800 dark:text-gray-100">{c.name}</span>
                      <span className="block truncate text-[11px] text-slate-500 dark:text-gray-400">
                        {CUSTOMER_KIND_META[c.kind]?.label}
                        {c.projects ? ` · ${c.projects} project${c.projects === 1 ? "" : "s"}` : ""}
                      </span>
                    </span>
                    {value?.id === c.id && <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />}
                </li>
              ))
            )}
          </ul>
          <div className="border-t border-slate-900/[0.05] p-1.5 dark:border-white/[0.06]">
            <button type="button" onClick={() => (setRegister(true), setOpen(false))} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/10">
              <Plus className="h-4 w-4" /> Register {q ? `“${q}”` : "a new customer"}
            </button>
          </div>
        </div>
      )}
      <CustomerModal open={register} initialName={q} onClose={() => setRegister(false)} onSaved={(c) => onChange(c)} />
    </div>
  );
};

/** "Who is it for?": own initiative, or a registered customer. */
export const CustomerField: React.FC<{
  mode: "OWN" | "CUSTOMER";
  customer: Customer | { id: number; name: string; logoAssetId: number | null } | null;
  onChange: (mode: "OWN" | "CUSTOMER", c: Customer | null | undefined) => void;
  error?: string | null;
}> = ({ mode, customer, onChange, error }) => (
  <div className="space-y-3">
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Who is it for?">
      {(
        [
          ["OWN", Lightbulb, "Own initiative", "Your idea, for yourself or the school"],
          ["CUSTOMER", Briefcase, "For a customer", "Someone or a company asked for it"],
        ] as const
      ).map(([k, Icon, title, caption]) => {
        const on = mode === k;
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(k, k === "OWN" ? null : undefined)}
            className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition ${on ? "border-blue-600 bg-blue-50 dark:border-blue-500 dark:bg-blue-500/10" : "border-slate-900/[0.07] hover:border-slate-900/20 dark:border-white/10 dark:hover:border-white/20"}`}
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${on ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-400"}`}>
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-800 dark:text-gray-100">{title}</span>
              <span className="block text-[11px] text-slate-500 dark:text-gray-400">{caption}</span>
            </span>
          </button>
        );
      })}
    </div>
    {mode === "CUSTOMER" && <CustomerPicker value={customer} onChange={(c) => onChange("CUSTOMER", c)} error={error} />}
  </div>
);
