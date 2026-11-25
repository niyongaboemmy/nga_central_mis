import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftRight, Check, Copy, Crown, KeyRound, Lock, Mail, Phone, RotateCcw, School, Search, ShieldCheck, TriangleAlert, UserCog, UserMinus, UserPlus, Users } from "lucide-react";
import Modal from "../../ui/Modal";
import { EmptyState } from "../kit";
import { platformApi, type PersonElsewhere, type TenantAdmin, type TenantDetail } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { Btn, Card, Field, IconBtn, ReasonDialog, act, ago, cx, errorText, fmtDateTime, initials, inputCls, toast, usePlatform } from "./platformShared";

type Kind = TenantAdmin["kind"];
type Credentials = { name: string; email: string | null; username: string; password: string; emailed: boolean };

/**
 * Schools → a school → Admins: who runs the school, and a new administrator when
 * the school needs one (backend: services/tenantMgmt/tenantAdmins.ts).
 */
const SchoolAdminsTab: React.FC<{ d: TenantDetail }> = ({ d }) => {
  const t = d.tenant;
  const { can } = usePlatform();
  const m = useMotion();
  const [admins, setAdmins] = useState<TenantAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [resetFor, setResetFor] = useState<TenantAdmin | null>(null);
  const [removeFor, setRemoveFor] = useState<TenantAdmin | null>(null);
  const [creds, setCreds] = useState<Credentials | null>(null);

  const load = useCallback(() => {
    setError(null);
    platformApi.admins(t.tid).then(setAdmins, (e) => setError(errorText(e)));
  }, [t.tid]);
  useEffect(load, [load]);

  const closed = t.status === "ARCHIVED" || t.status === "PENDING";
  const manage = can("lifecycle") && !t.isPrimary && !closed;
  const owners = admins?.filter((a) => a.kind === "OWNER" && a.status === "ACTIVE").length ?? 0;

  if (error) {
    return (
      <EmptyState icon={TriangleAlert} title={error}>
        <Btn icon={RotateCcw} onClick={load}>
          Try again
        </Btn>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Administrators</h2>
          <p className="text-sm text-slate-600 dark:text-gray-300">
            {admins === null ? "Loading…" : `${admins.length} ${admins.length === 1 ? "person runs" : "people run"} ${t.name}`}
          </p>
        </div>
        {manage && (
          <div className="flex flex-wrap gap-2">
            <Btn icon={ArrowLeftRight} onClick={() => setAssigning(true)}>
              Add existing person
            </Btn>
            <Btn tone="primary" icon={UserPlus} onClick={() => setAdding(true)} disabled={admins === null}>
              Add administrator
            </Btn>
          </div>
        )}
      </div>

      {t.isPrimary && (
        <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-gray-300">
          <ShieldCheck className="h-4 w-4 text-brand-600 dark:text-brand-200" aria-hidden />
          The primary school's administrators are managed in its own Access settings.
        </p>
      )}

      {admins === null ? (
        <ul className="space-y-2" aria-busy="true" aria-label="Loading administrators">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex animate-pulse items-center gap-3 rounded-2xl border border-slate-200 p-3 dark:border-gray-700">
              <span className="h-11 w-11 rounded-full bg-slate-200 dark:bg-gray-800" />
              <span className="flex-1 space-y-2">
                <span className="block h-3.5 w-40 rounded bg-slate-200 dark:bg-gray-800" />
                <span className="block h-3 w-64 max-w-full rounded bg-slate-100 dark:bg-gray-800/70" />
              </span>
            </li>
          ))}
        </ul>
      ) : admins.length === 0 ? (
        <EmptyState icon={Users} title="No administrators">
          {manage && (
            <Btn tone="primary" icon={UserPlus} onClick={() => setAdding(true)}>
              Add administrator
            </Btn>
          )}
        </EmptyState>
      ) : (
        <ul className="space-y-2" aria-label="Administrators">
          <AnimatePresence initial={false}>
            {admins.map((a) => (
              <motion.li key={a.userId} layout {...m("reveal")}>
                <AdminRow
                  admin={a}
                  manage={manage}
                  lastOwner={a.kind === "OWNER" && owners <= 1}
                  onReset={() => setResetFor(a)}
                  onRemove={() => setRemoveFor(a)}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <AddAdminDialog
        open={adding}
        tid={t.tid}
        ownersFull={owners >= 2}
        onClose={() => setAdding(false)}
        onDone={(r, name) => {
          setAdding(false);
          load();
          if (r.tempPassword) setCreds({ name, email: r.admin.email, username: r.admin.username, password: r.tempPassword, emailed: r.emailed });
        }}
      />

      <AssignPersonDialog
        open={assigning}
        tid={t.tid}
        schoolName={t.name}
        onClose={() => setAssigning(false)}
        onDone={() => {
          setAssigning(false);
          load();
        }}
      />

      <ReasonDialog
        open={!!resetFor}
        title={`New password for ${resetFor?.name ?? ""}`}
        icon={KeyRound}
        confirmText="Reset password"
        tone="primary"
        placeholder="Why (e.g. the admin is locked out)"
        onClose={() => setResetFor(null)}
        onSubmit={async (reason) => {
          const a = resetFor!;
          const r = await act(() => platformApi.resetAdminPassword(t.tid, a.userId, reason), "Password reset");
          if (!r) return;
          setResetFor(null);
          load();
          setCreds({ name: a.name, email: a.email, username: a.username, password: r.tempPassword, emailed: r.emailed });
        }}
      >
        <p className="text-sm text-slate-600 dark:text-gray-300">They get a one-time password, are signed out everywhere, and choose a new password at their next sign-in.</p>
      </ReasonDialog>

      <ReasonDialog
        open={!!removeFor}
        title={`Remove ${removeFor?.name ?? ""}`}
        icon={UserMinus}
        confirmText="Remove access"
        tone="danger"
        placeholder="Why"
        onClose={() => setRemoveFor(null)}
        onSubmit={async (reason) => {
          const r = await act(() => platformApi.removeAdmin(t.tid, removeFor!.userId, reason), "Administrator access removed");
          if (!r) return;
          setRemoveFor(null);
          load();
        }}
      >
        <p className="text-sm text-slate-600 dark:text-gray-300">Their administrator access ends. The account itself stays, with any other roles it has.</p>
      </ReasonDialog>

      <CredentialsDialog creds={creds} onClose={() => setCreds(null)} />
    </div>
  );
};

// ---------------------------------------------------------------------------

const Chip: React.FC<{ tone: "brand" | "slate" | "amber" | "red"; icon?: React.ElementType; children: React.ReactNode }> = ({ tone, icon: Icon, children }) => (
  <span
    className={cx(
      "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold",
      tone === "brand" && "bg-brand-100 text-brand-800 dark:bg-brand-500/20 dark:text-brand-200",
      tone === "slate" && "bg-slate-100 text-slate-700 dark:bg-gray-800 dark:text-gray-200",
      tone === "amber" && "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200",
      tone === "red" && "bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-200",
    )}
  >
    {Icon && <Icon className="h-3 w-3" aria-hidden />}
    {children}
  </span>
);

const AdminRow: React.FC<{ admin: TenantAdmin; manage: boolean; lastOwner: boolean; onReset: () => void; onRemove: () => void }> = ({
  admin: a,
  manage,
  lastOwner,
  onReset,
  onRemove,
}) => {
  const active = a.status === "ACTIVE";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900 sm:flex-nowrap">
      <span
        className={cx(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold",
          active ? "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200" : "bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-400",
        )}
        aria-hidden
      >
        {initials(a.name) || "?"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-semibold text-slate-900 dark:text-white">{a.name}</span>
          {a.kind === "OWNER" ? (
            <Chip tone="brand" icon={Crown}>
              Owner
            </Chip>
          ) : (
            <Chip tone="slate" icon={UserCog}>
              Administrator
            </Chip>
          )}
          {!active && <Chip tone="red">Deactivated</Chip>}
          {a.lockedUntil && (
            <Chip tone="red" icon={Lock}>
              Locked
            </Chip>
          )}
          {a.mustChangePassword && <Chip tone="amber">Password not set yet</Chip>}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600 dark:text-gray-300">
          {a.email && (
            <a href={`mailto:${a.email}`} className="inline-flex min-w-0 items-center gap-1 hover:text-brand-700 dark:hover:text-brand-200">
              <Mail className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{a.email}</span>
            </a>
          )}
          {a.phone && (
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3" aria-hidden />
              {a.phone}
            </span>
          )}
          <span>@{a.username}</span>
          <span title={a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : undefined}>{a.lastLoginAt ? `Signed in ${ago(a.lastLoginAt)} ago` : "Never signed in"}</span>
        </div>
      </div>
      {manage && (
        <div className="ml-auto flex shrink-0 gap-1">
          <IconBtn icon={KeyRound} label={`Reset ${a.name}'s password`} onClick={onReset} disabled={!active} />
          <IconBtn
            icon={UserMinus}
            tone="danger"
            label={lastOwner ? "The last owner can't be removed" : `Remove ${a.name}`}
            onClick={onRemove}
            disabled={lastOwner}
          />
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const KINDS: Array<{ k: Kind; label: string; hint: string; icon: React.ElementType }> = [
  { k: "ADMIN", label: "Administrator", hint: "Runs school operations and people", icon: UserCog },
  { k: "OWNER", label: "Owner", hint: "Everything, incl. access and subscription (max 2)", icon: Crown },
];

const EMPTY_FORM = { firstName: "", lastName: "", email: "", phone: "", reason: "", kind: "ADMIN" as Kind };

const AddAdminDialog: React.FC<{
  open: boolean;
  tid: number;
  ownersFull: boolean;
  onClose: () => void;
  onDone: (r: Awaited<ReturnType<typeof platformApi.createAdmin>>, name: string) => void;
}> = ({ open, tid, ownersFull, onClose, onDone }) => {
  const [f, setF] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF(EMPTY_FORM);
  }, [open]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const ok = f.firstName.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()) && f.reason.trim().length >= 3 && !(f.kind === "OWNER" && ownersFull);

  return (
    <Modal
      isOpen={open}
      onClose={() => !busy && onClose()}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" aria-hidden />
          Add administrator
        </span>
      }
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ok) return;
          setBusy(true);
          const name = `${f.firstName.trim()} ${f.lastName.trim()}`.trim();
          const r = await act(
            () => platformApi.createAdmin(tid, { ...f, firstName: f.firstName.trim(), lastName: f.lastName.trim(), email: f.email.trim(), phone: f.phone.trim() || undefined, reason: f.reason.trim() }),
          );
          setBusy(false);
          if (!r) return;
          toast(r.created ? `${name} added` : `${r.admin.name} is now ${r.admin.kind === "OWNER" ? "an owner" : "an administrator"}`, "success");
          onDone(r, r.admin.name || name);
        }}
      >
        <div role="radiogroup" aria-label="Kind" className="grid gap-2 sm:grid-cols-2">
          {KINDS.map(({ k, label, hint, icon: Icon }) => {
            const on = f.kind === k;
            const disabled = k === "OWNER" && ownersFull;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={disabled}
                onClick={() => setF({ ...f, kind: k })}
                className={cx(
                  "flex items-start gap-3 rounded-2xl border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50",
                  on ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10" : "border-slate-200 hover:bg-slate-50 dark:border-gray-700 dark:hover:bg-gray-800",
                )}
              >
                <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", on ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300")}>
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900 dark:text-white">{label}</span>
                  <span className="block text-xs text-slate-600 dark:text-gray-300">{disabled ? "Already 2 owners" : hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name">{(id) => <input id={id} required autoFocus value={f.firstName} onChange={set("firstName")} className={inputCls} maxLength={100} />}</Field>
          <Field label="Last name">{(id) => <input id={id} value={f.lastName} onChange={set("lastName")} className={inputCls} maxLength={100} />}</Field>
          <Field label="E-mail" icon={Mail}>
            {(id) => <input id={id} type="email" required value={f.email} onChange={set("email")} className={inputCls} maxLength={150} autoComplete="off" />}
          </Field>
          <Field label="Phone (optional)" icon={Phone}>
            {(id) => <input id={id} type="tel" value={f.phone} onChange={set("phone")} className={inputCls} maxLength={20} placeholder="+250…" />}
          </Field>
        </div>
        <Field label="Reason">
          {(id) => <textarea id={id} required rows={2} value={f.reason} onChange={set("reason")} className={inputCls} placeholder="e.g. The head teacher asked for a second administrator" />}
        </Field>
        <p className="text-xs text-slate-600 dark:text-gray-300">
          A new person gets a one-time password by e-mail and sets their own at first sign-in. Someone who already has an account with this e-mail keeps their password.
        </p>
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn type="submit" tone="primary" icon={UserPlus} disabled={!ok} busy={busy}>
            Add
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------

/** Someone of another school, given a role in this one (backend: crossSchool.ts). */
const AssignPersonDialog: React.FC<{ open: boolean; tid: number; schoolName: string; onClose: () => void; onDone: () => void }> = ({
  open,
  tid,
  schoolName,
  onClose,
  onDone,
}) => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PersonElsewhere[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<PersonElsewhere | null>(null);
  const [roles, setRoles] = useState<Array<{ roleId: number; name: string; description: string | null }> | null>(null);
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setResults(null);
    setPicked(null);
    setRoleIds([]);
    setReason("");
    setRoles(null);
    platformApi.tenantRoles(tid).then(setRoles, (e) => {
      setRoles([]);
      toast(errorText(e), "error");
    });
  }, [open, tid]);

  // Debounced search across every school.
  useEffect(() => {
    if (!open || picked) return;
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    const h = window.setTimeout(() => {
      platformApi.people(term, tid).then(
        (r) => {
          setResults(r);
          setSearching(false);
        },
        (e) => {
          setSearching(false);
          toast(errorText(e), "error");
        },
      );
    }, 350);
    return () => window.clearTimeout(h);
  }, [q, open, picked, tid]);

  const ok = !!picked && roleIds.length > 0 && reason.trim().length >= 3;

  return (
    <Modal
      isOpen={open}
      onClose={() => !busy && onClose()}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5" aria-hidden />
          Add someone from another school
        </span>
      }
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ok || !picked) return;
          setBusy(true);
          const r = await act(() => platformApi.assignPerson(tid, { sourceTid: picked.tid, sourceUserId: picked.userId, roleIds, reason: reason.trim() }));
          setBusy(false);
          if (!r) return;
          toast(`${picked.name} added to ${schoolName} as ${r.roles.join(", ")}`, "success");
          onDone();
        }}
      >
        {!picked ? (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                autoFocus
                aria-label="Search people in every school"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, e-mail, username or phone"
                className={cx(inputCls, "pl-9")}
              />
            </div>
            {searching ? (
              <ul className="space-y-2" aria-busy="true">
                {[0, 1].map((i) => (
                  <li key={i} className="h-14 animate-pulse rounded-2xl bg-slate-100 dark:bg-gray-800" />
                ))}
              </ul>
            ) : results === null ? (
              <p className="text-sm text-slate-600 dark:text-gray-300">Search every school. The person keeps their password and signs in to both schools.</p>
            ) : results.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-gray-300">No one matches “{q.trim()}”.</p>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto" aria-label="People found">
                {results.map((p) => (
                  <li key={`${p.tid}-${p.userId}`}>
                    <button
                      type="button"
                      disabled={p.alreadyInTarget}
                      onClick={() => setPicked(p)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-3 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:hover:bg-gray-800"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200" aria-hidden>
                        {initials(p.name) || "?"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-slate-900 dark:text-white">{p.name}</span>
                        <span className="flex flex-wrap gap-x-3 text-xs text-slate-600 dark:text-gray-300">
                          <span className="inline-flex items-center gap-1">
                            <School className="h-3 w-3" aria-hidden />
                            {p.schoolName}
                          </span>
                          {p.email && <span className="truncate">{p.email}</span>}
                          {p.roles.length > 0 && <span>{p.roles.join(", ")}</span>}
                        </span>
                      </span>
                      {p.alreadyInTarget && <span className="shrink-0 text-xs font-semibold text-slate-600 dark:text-gray-300">Already here</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-300 bg-brand-50 p-3 dark:border-brand-400/40 dark:bg-brand-500/10">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white" aria-hidden>
                {initials(picked.name) || "?"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-slate-900 dark:text-white">{picked.name}</span>
                <span className="block truncate text-xs text-slate-600 dark:text-gray-300">
                  {picked.schoolName} · {picked.email ?? `@${picked.username}`}
                </span>
              </span>
              <Btn size="sm" onClick={() => setPicked(null)}>
                Change
              </Btn>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-gray-300">Role in {schoolName}</p>
              {roles === null ? (
                <div className="flex gap-2" aria-busy="true">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-8 w-24 animate-pulse rounded-full bg-slate-100 dark:bg-gray-800" />
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Roles">
                  {roles.map((r) => {
                    const on = roleIds.includes(r.roleId);
                    return (
                      <button
                        key={r.roleId}
                        type="button"
                        aria-pressed={on}
                        title={r.description ?? undefined}
                        onClick={() => setRoleIds(on ? roleIds.filter((x) => x !== r.roleId) : [...roleIds, r.roleId])}
                        className={cx(
                          "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                          on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800",
                        )}
                      >
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="mt-2 text-xs text-slate-600 dark:text-gray-300">Owners are added with “Add administrator”.</p>
            </div>
            <Field label="Reason">
              {(id) => <textarea id={id} required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} placeholder="e.g. Teaches in both schools" />}
            </Field>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn type="submit" tone="primary" icon={UserPlus} disabled={!ok} busy={busy}>
            Add to {schoolName}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------

const CredentialsDialog: React.FC<{ creds: Credentials | null; onClose: () => void }> = ({ creds, onClose }) => {
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [creds]);
  if (!creds) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(creds.password);
      setCopied(true);
      toast("Password copied", "success");
    } catch {
      toast("Couldn't copy; select the password instead", "error");
    }
  };
  return (
    <Modal
      isOpen
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" aria-hidden />
          One-time password
        </span>
      }
    >
      <div className="space-y-4">
        <p className={cx("flex items-start gap-2 text-sm", creds.emailed ? "text-slate-700 dark:text-gray-200" : "text-amber-700 dark:text-amber-200")}>
          {creds.emailed ? <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          {creds.emailed ? `Sent to ${creds.email}. Share it yourself only if the e-mail doesn't arrive.` : `The e-mail could not be sent. Give ${creds.name} this password through a safe channel.`}
        </p>
        <Card className="space-y-2">
          <div className="flex justify-between gap-2 text-sm">
            <span className="text-slate-600 dark:text-gray-300">Username</span>
            <span className="truncate font-semibold text-slate-900 dark:text-white">{creds.username}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <code className="select-all rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-lg font-bold tracking-wider text-slate-900 dark:bg-gray-800 dark:text-white">{creds.password}</code>
            <Btn icon={copied ? Check : Copy} onClick={copy} size="sm">
              {copied ? "Copied" : "Copy"}
            </Btn>
          </div>
        </Card>
        <p className="text-xs text-slate-600 dark:text-gray-300">Shown once. {creds.name} must choose a new password at the first sign-in.</p>
        <div className="flex justify-end">
          <Btn tone="primary" onClick={onClose}>
            Done
          </Btn>
        </div>
      </div>
    </Modal>
  );
};

export default SchoolAdminsTab;
