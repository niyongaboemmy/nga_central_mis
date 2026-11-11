import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AtSign, BadgeCheck, Eye, EyeOff, KeyRound, LogIn, MailCheck, Pencil, Phone, RefreshCcw, UserRound } from "lucide-react";
import { publicApi, setOnboardingToken, type OnboardingMe } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import VerificationCode from "../../ui/VerificationCode";
import PasswordStrengthGuide from "../../ui/PasswordStrengthGuide";
import Captcha, { type CaptchaProvider } from "./Captcha";
import { CountdownRing, ErrorLine, Field, RateLimitNotice, Shake, StepFooter, ghostBtn, inputCls, primaryBtn, useCountdown } from "./fields";
import { EMAIL_RE, apiErr, passwordOk, type AdminForm, type ApiErr } from "./wizardState";

const RESEND_SEC = 60;

type Errs = Partial<Record<"fullName" | "email" | "phone" | "password" | "captcha", string>>;

/** The 409 "one open application" banner: go to the tracker instead. */
export const OpenApplicationLink: React.FC = () => (
  <Link to="/onboarding" className={`${primaryBtn} mt-2`}>
    <LogIn className="h-4 w-4" aria-hidden />
    Open my application
  </Link>
);

const StepAdmin: React.FC<{
  admin: AdminForm;
  onChange: (p: Partial<AdminForm>) => void;
  captcha: { provider: CaptchaProvider | null; siteKey: string | null } | null;
  /** already verified in this browser (token stored, draft created) */
  verified: boolean;
  /** create / update the draft and upload the logo; throws on failure */
  finalize: (me: OnboardingMe) => Promise<void>;
  onBack: () => void;
  onNext: () => void;
}> = ({ admin, onChange, captcha, verified, finalize, onBack, onNext }) => {
  const m = useMotion();
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "code">("form");
  const [sentTo, setSentTo] = useState("");
  const [errors, setErrors] = useState<Errs>({});
  const [err, setErr] = useState<ApiErr | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeError, setCodeError] = useState(false);
  const [codeKey, setCodeKey] = useState(0);
  const [resendNonce, setResendNonce] = useState(0);
  const resendLeft = useCountdown(phase === "code" ? RESEND_SEC : 0, resendNonce);
  const needCaptcha = !!(captcha?.provider && captcha.siteKey);

  const fail = (e: unknown) => {
    const x = apiErr(e);
    setErr(x);
    const f: Errs = {};
    for (const k of ["fullName", "email", "phone", "password"] as const) if (x.fields[k]) f[k] = x.fields[k];
    if (Object.keys(f).length) setErrors(f);
  };

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    const f: Errs = {};
    if (admin.fullName.trim().length < 3) f.fullName = "Name required";
    if (!EMAIL_RE.test(admin.email.trim())) f.email = "Invalid e-mail";
    if (!passwordOk(password)) f.password = "Too weak";
    if (needCaptcha && !captchaToken) f.captcha = "Tick the box";
    setErrors(f);
    setErr(null);
    if (Object.keys(f).length) {
      window.setTimeout(() => document.querySelector<HTMLElement>('#register-admin [aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setBusy(true);
    try {
      const r = await publicApi.startAccount({
        fullName: admin.fullName.trim(),
        email: admin.email.trim().toLowerCase(),
        phone: admin.phone.trim() || undefined,
        password,
        captchaToken: captchaToken ?? undefined,
      });
      setSentTo(r.otpSentTo || admin.email.trim());
      setPhase("code");
      setResendNonce((n) => n + 1);
    } catch (e2) {
      fail(e2);
      setCaptchaToken(null);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (code: string) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    setCodeError(false);
    try {
      const r = await publicApi.verifyAccount({ email: admin.email.trim().toLowerCase(), code });
      setOnboardingToken(r.token);
      await finalize(r.me);
      onNext();
    } catch (e2: any) {
      const x = apiErr(e2);
      if (e2?.response?.status === 400 || e2?.response?.status === 401 || x.code === "INVALID_CODE") {
        setCodeError(true);
        setCodeKey((k) => k + 1);
      }
      setErr(x);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setErr(null);
    try {
      await publicApi.resendCode(admin.email.trim().toLowerCase());
      setResendNonce((n) => n + 1);
      setCodeKey((k) => k + 1);
    } catch (e2) {
      fail(e2);
    }
  };

  const banner = err && (
    <div className="mt-3">
      {err.status === 429 ? (
        <RateLimitNotice seconds={err.retryAfter ?? 60} nonce={err} onDone={() => setErr(null)} />
      ) : (
        <Shake error={err.message}>
          <ErrorLine error={Object.keys(err.fields).length ? null : err.message} />
          {err.status === 409 && <OpenApplicationLink />}
        </Shake>
      )}
    </div>
  );

  if (verified) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onNext();
        }}
      >
        <motion.div {...m("reveal")} className="flex flex-col items-center gap-3 py-8 text-center">
          <motion.span {...m("check")} className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
            <BadgeCheck className="h-9 w-9" aria-hidden />
          </motion.span>
          <p className="font-semibold text-slate-900 dark:text-white">{admin.email}</p>
          <span className="text-sm text-slate-600 dark:text-slate-300">Verified</span>
        </motion.div>
        <StepFooter onBack={onBack} primary="Next" />
      </form>
    );
  }

  if (phase === "code") {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <motion.span
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-100"
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <MailCheck className="h-8 w-8" aria-hidden />
        </motion.span>
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-300">Code sent to</p>
          <p className="font-semibold text-slate-900 dark:text-white">{sentTo}</p>
        </div>
        <Shake error={codeError ? String(codeKey) : null}>
          <VerificationCode key={codeKey} length={6} error={codeError} onComplete={(c) => void verify(c)} />
        </Shake>
        {busy && <span className="text-sm text-slate-600 dark:text-slate-300" role="status">Checking…</span>}
        {banner}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" className={ghostBtn} onClick={() => setPhase("form")}>
            <Pencil className="h-4 w-4" aria-hidden />
            Change e-mail
          </button>
          <button type="button" className={ghostBtn} onClick={() => void resend()} disabled={resendLeft > 0}>
            {resendLeft > 0 ? <CountdownRing left={resendLeft} total={RESEND_SEC} /> : <RefreshCcw className="h-4 w-4" aria-hidden />}
            Resend{resendLeft > 0 ? ` ${resendLeft}s` : ""}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form id="register-admin" onSubmit={start} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" icon={UserRound} error={errors.fullName} className="sm:col-span-2">
          {({ id, describedBy, invalid }) => (
            <input id={id} value={admin.fullName} onChange={(e) => onChange({ fullName: e.target.value })} autoComplete="name" aria-invalid={invalid} aria-describedby={describedBy} className={inputCls(errors.fullName)} />
          )}
        </Field>
        <Field label="E-mail" icon={AtSign} error={errors.email}>
          {({ id, describedBy, invalid }) => (
            <input id={id} type="email" value={admin.email} onChange={(e) => onChange({ email: e.target.value })} autoComplete="email" aria-invalid={invalid} aria-describedby={describedBy} className={inputCls(errors.email)} />
          )}
        </Field>
        <Field label="Phone" icon={Phone} error={errors.phone} optional>
          {({ id, describedBy, invalid }) => (
            <input id={id} type="tel" value={admin.phone} onChange={(e) => onChange({ phone: e.target.value })} autoComplete="tel" aria-invalid={invalid} aria-describedby={describedBy} className={inputCls(errors.phone)} />
          )}
        </Field>
        <Field label="Password" icon={KeyRound} error={errors.password} className="sm:col-span-2">
          {({ id, describedBy, invalid }) => (
            <>
              <div className="relative">
                <input
                  id={id}
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  className={`${inputCls(errors.password)} pr-11`}
                />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-600 dark:text-slate-300" aria-pressed={showPw}>
                  {showPw ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                  <span className="sr-only">{showPw ? "Hide password" : "Show password"}</span>
                </button>
              </div>
              {password && (
                <div className="mt-2">
                  <PasswordStrengthGuide password={password} />
                </div>
              )}
            </>
          )}
        </Field>
        {needCaptcha && (
          <Shake error={errors.captcha} className="sm:col-span-2">
            <Captcha provider={captcha!.provider!} siteKey={captcha!.siteKey!} onToken={setCaptchaToken} />
            <ErrorLine error={errors.captcha} />
          </Shake>
        )}
      </div>
      {banner}
      <StepFooter onBack={onBack} primary="Send code" busy={busy} primaryIcon={MailCheck} />
    </form>
  );
};

export default StepAdmin;
