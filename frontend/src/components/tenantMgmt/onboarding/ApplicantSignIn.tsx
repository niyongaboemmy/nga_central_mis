import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AtSign, Clock, KeyRound, LogIn, School } from "lucide-react";
import { publicApi, setOnboardingToken, type OnboardingMe } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { AmashuriMark } from "../../brand/AmashuriLogo";
import { ErrorLine, Field, RateLimitNotice, Shake, ghostBtn, inputCls, primaryBtn } from "../register/fields";
import { apiErr, type ApiErr } from "../register/wizardState";

/** Applicant sign-in on /onboarding when there is no onboarding token. */
const ApplicantSignIn: React.FC<{ expired?: boolean; onSignedIn: (token: string, me: OnboardingMe) => void }> = ({ expired, onSignedIn }) => {
  const m = useMotion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiErr | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErr({ status: 0, message: "E-mail and password", fields: {} });
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await publicApi.login({ email: email.trim().toLowerCase(), password });
      setOnboardingToken(r.token);
      onSignedIn(r.token, r.me);
    } catch (e2) {
      setErr(apiErr(e2, "Sign-in failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-brand-50 px-4 py-10 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <motion.section {...m("reveal")} aria-labelledby="applicant-signin" className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <AmashuriMark size={48} animated />
          <h1 ref={heading} id="applicant-signin" tabIndex={-1} className="text-xl font-bold text-slate-900 focus:outline-none dark:text-white">
            My application
          </h1>
          {expired && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-400/15 dark:text-amber-100" role="status">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              Session ended
            </span>
          )}
        </div>
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="E-mail" icon={AtSign}>
            {({ id }) => <input id={id} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls(err ? " " : null)} />}
          </Field>
          <Field label="Password" icon={KeyRound}>
            {({ id }) => <input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls(err ? " " : null)} />}
          </Field>
          {err?.status === 429 ? (
            <RateLimitNotice seconds={err.retryAfter ?? 60} nonce={err} onDone={() => setErr(null)} />
          ) : (
            <Shake error={err?.message}>
              <ErrorLine error={err?.message} />
            </Shake>
          )}
          <motion.button type="submit" {...m("tap")} disabled={busy} className={`${primaryBtn} w-full`}>
            <LogIn className="h-4 w-4" aria-hidden />
            {busy ? "Signing in…" : "Sign in"}
          </motion.button>
        </form>
        <div className="mt-5 flex flex-col items-center gap-1 border-t border-slate-100 pt-4 dark:border-slate-800">
          <Link to="/register-school" className={ghostBtn}>
            <School className="h-4 w-4" aria-hidden />
            Register your school
          </Link>
          <Link to="/login" className="text-xs font-medium text-slate-600 hover:underline dark:text-slate-300">
            School staff sign-in
          </Link>
        </div>
      </motion.section>
    </main>
  );
};

export default ApplicantSignIn;
