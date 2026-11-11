import React, { useState } from "react";
import { motion } from "framer-motion";
import { AtSign, Building2, Check, Globe, GraduationCap, KeyRound, Link2, MapPin, Package as PackageIcon, Phone, Users, type LucideIcon } from "lucide-react";
import { applicantApi, type Application, type PackageInfo } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import Modal from "../../ui/Modal";
import PasswordStrengthGuide from "../../ui/PasswordStrengthGuide";
import { SCHOOL_TYPES } from "../register/SchoolFields";
import { ErrorLine, Field, Shake, ghostBtn, inputCls, primaryBtn } from "../register/fields";
import { apiErr, passwordOk } from "../register/wizardState";

export const ChangePasswordModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const m = useMotion();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const close = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
    setDone(false);
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordOk(next)) return setError("Too weak");
    if (next !== confirm) return setError("Passwords differ");
    setBusy(true);
    setError(null);
    try {
      await applicantApi.changePassword({ currentPassword: current, newPassword: next });
      setDone(true);
      window.setTimeout(close, 1200);
    } catch (e2) {
      setError(apiErr(e2, "Not changed").message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="Change password" size="sm">
      {done ? (
        <motion.div {...m("check")} className="flex flex-col items-center gap-2 py-6" role="status">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check className="h-8 w-8" aria-hidden />
          </span>
          <span className="font-semibold text-slate-900 dark:text-white">Changed</span>
        </motion.div>
      ) : (
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field label="Current" icon={KeyRound}>
            {({ id }) => <input id={id} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls()} />}
          </Field>
          <Field label="New" icon={KeyRound}>
            {({ id }) => <input id={id} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls()} />}
          </Field>
          {next && <PasswordStrengthGuide password={next} />}
          <Field label="Repeat" icon={KeyRound}>
            {({ id }) => <input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls()} />}
          </Field>
          <Shake error={error}>
            <ErrorLine error={error} />
          </Shake>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={ghostBtn} onClick={close}>
              Cancel
            </button>
            <button type="submit" className={primaryBtn} disabled={busy}>
              Save
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};

const Row: React.FC<{ icon: LucideIcon; label: string; value: React.ReactNode }> = ({ icon: Icon, label, value }) =>
  value === null || value === undefined || value === "" ? null : (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 dark:text-slate-300" aria-hidden />
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-slate-800 dark:text-slate-100">{value}</dd>
    </div>
  );

/** Read-only application details (icons stand in for labels; labels are sr-only). */
export const ApplicationSummary: React.FC<{ app: Application; packages?: PackageInfo[] | null }> = ({ app, packages }) => {
  const type = SCHOOL_TYPES.find((t) => t.value === app.schoolType);
  const pkgCode = app.approvedPackage ?? app.requestedPackage;
  const pkg = packages?.find((p) => p.code === pkgCode);
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      <Row icon={type?.icon ?? Building2} label="Type" value={type?.label} />
      <Row icon={MapPin} label="Location" value={[app.address, app.sector, app.district, app.province].filter(Boolean).join(", ")} />
      <Row icon={Phone} label="Phone" value={app.schoolPhone} />
      <Row icon={AtSign} label="E-mail" value={app.schoolEmail} />
      <Row icon={Globe} label="Website" value={app.website} />
      <Row icon={Link2} label="Short name" value={app.desiredSlug && <span className="font-mono">{app.desiredSlug}.amashuri.com</span>} />
      <Row icon={GraduationCap} label="Students" value={app.estStudents?.toLocaleString()} />
      <Row icon={Users} label="Staff" value={app.estStaff?.toLocaleString()} />
      <Row icon={PackageIcon} label="Package" value={pkgCode && `${pkg?.name ?? pkgCode} · ${app.billingCycle === "YEAR" ? "Year" : "Term"}`} />
    </dl>
  );
};
