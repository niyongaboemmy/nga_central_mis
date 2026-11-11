import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Building2, Check, ClipboardCheck, Copy, LogIn, Package as PackageIcon, UserRound, type LucideIcon } from "lucide-react";
import {
  applicantApi,
  getOnboardingToken,
  publicApi,
  type Application,
  type OnboardingMe,
  type PackageInfo,
} from "../../../api/tenantMgmt";
import { Burst } from "../kit";
import ThemeToggle from "../../ui/ThemeToggle";
import { AmashuriLogo } from "../../brand/AmashuriLogo";
import { isRegistrationSite } from "../../../utils/registrationSite";
import StepSchool from "./StepSchool";
import StepPackage from "./StepPackage";
import StepAdmin from "./StepAdmin";
import StepReview from "./StepReview";
import type { Divisions } from "./SchoolFields";
import { cx, ghostBtn, primaryBtn } from "./fields";
import { bestFitPackage, clearWizard, loadWizard, saveWizard, schoolFormFrom, toSchoolDetails, type WizardState } from "./wizardState";
import type { CaptchaProvider } from "./Captcha";

const STEPS: Array<{ key: string; label: string; icon: LucideIcon }> = [
  { key: "school", label: "School", icon: Building2 },
  { key: "package", label: "Package", icon: PackageIcon },
  { key: "admin", label: "Administrator", icon: UserRound },
  { key: "review", label: "Review", icon: ClipboardCheck },
];

/** Four icon dots joined by a bar that fills as the applicant moves on. */
const WizardProgress: React.FC<{ step: number; maxReached: number; onJump: (i: number) => void }> = ({ step, maxReached, onJump }) => {
  const reduced = useReducedMotion();
  return (
    <ol className="relative flex items-start justify-between" aria-label="Registration steps">
      <div className="absolute left-6 right-6 top-5 h-1 rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden />
      <motion.div
        className="absolute left-6 top-5 h-1 rounded-full bg-gradient-to-r from-brand-500 to-emerald-500"
        initial={false}
        animate={{ width: `calc((100% - 3rem) * ${step / (STEPS.length - 1)})` }}
        transition={{ duration: reduced ? 0 : 0.5, ease: "easeOut" }}
        aria-hidden
      />
      {STEPS.map((s, i) => {
        const done = i < step;
        const active = i === step;
        const reachable = i <= maxReached && i !== step;
        return (
          <li key={s.key} className="relative z-10 flex w-12 flex-col items-center gap-1 sm:w-24" aria-current={active ? "step" : undefined}>
            <motion.button
              type="button"
              disabled={!reachable}
              onClick={() => onJump(i)}
              animate={{ scale: active ? 1.12 : 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className={cx(
                "flex h-10 w-10 items-center justify-center rounded-full border-2 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-default dark:focus-visible:ring-offset-slate-900",
                done && "border-emerald-500 bg-emerald-500 text-white",
                active && "border-brand-500 bg-white text-brand-600 dark:bg-slate-900 dark:text-brand-200",
                !done && !active && "border-slate-300 bg-white text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300",
              )}
            >
              {done ? <Check className="h-5 w-5" aria-hidden /> : <s.icon className="h-5 w-5" aria-hidden />}
              <span className="sr-only">
                {s.label}
                {done ? " (done)" : active ? " (current)" : ""}
              </span>
            </motion.button>
            <span className={cx("hidden text-xs font-medium sm:block", active ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-300")} aria-hidden>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

/** Success: confetti, the reference chip, the way to the tracker. */
const Submitted: React.FC<{ app: Application }> = ({ app }) => {
  const [copied, setCopied] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className="relative flex flex-col items-center gap-4 py-10 text-center">
      <Burst show />
      <motion.span
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 16 }}
        className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xl"
      >
        <Check className="h-11 w-11" aria-hidden />
      </motion.span>
      <h2 ref={heading} tabIndex={-1} className="text-2xl font-bold text-slate-900 focus:outline-none dark:text-white">
        Submitted
      </h2>
      {app.ref && (
        <button
          type="button"
          onClick={() => {
            try {
              void navigator.clipboard?.writeText(app.ref!);
            } catch {
              /* ignore */
            }
            setCopied(true);
          }}
          className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 font-mono text-lg font-bold text-slate-900 hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-slate-800 dark:text-white"
        >
          {app.ref}
          {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          <span className="sr-only">{copied ? "Copied" : "Copy reference"}</span>
        </button>
      )}
      <Link to="/onboarding" className={primaryBtn}>
        Track progress
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
};

/**
 * Public self-registration: /register on amashuri.com, /register-school on the MIS
 * (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §6.1). `?package=gold&cycle=YEAR`
 * (the landing page's package cards) preselects the package.
 * School -> Package -> Administrator (OTP; the draft is created here) -> Review & submit.
 */
/** The landing page's package cards link here with ?package=&cycle= (only fills an empty choice). */
const withPackageFromUrl = (w: WizardState): WizardState => {
  const q = new URLSearchParams(window.location.search);
  const pkg = q.get("package");
  const cycle = q.get("cycle");
  if (!pkg || w.requestedPackage) return w;
  return { ...w, requestedPackage: pkg, billingCycle: cycle === "YEAR" || cycle === "TERM" ? cycle : w.billingCycle };
};

const RegisterSchoolPage: React.FC = () => {
  const [wiz, setWiz] = useState<WizardState>(() => {
    const w = loadWizard();
    // a verified step without the token (signed out / expired) must be redone
    if (w.verifiedEmail && !getOnboardingToken()) return { ...w, verifiedEmail: null, applicationId: null, step: Math.min(w.step, 2) };
    return withPackageFromUrl(w);
  });
  const [dir, setDir] = useState(1);
  const [logo, setLogo] = useState<File | null>(null);
  const [packages, setPackages] = useState<PackageInfo[] | null>(null);
  const [divisions, setDivisions] = useState<Divisions>({});
  const [captcha, setCaptcha] = useState<{ provider: CaptchaProvider | null; siteKey: string | null } | null>(null);
  const [submitted, setSubmitted] = useState<Application | null>(null);
  const [maxReached, setMaxReached] = useState(wiz.step);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const reduced = useReducedMotion();

  useEffect(() => saveWizard(wiz), [wiz]);

  useEffect(() => {
    publicApi.packages().then((p) => setPackages(p.filter((x) => x.isPublic !== false))).catch(() => setPackages([]));
    publicApi.adminDivisions().then(setDivisions).catch(() => setDivisions({}));
    publicApi.captchaConfig().then(setCaptcha).catch(() => setCaptcha(null));
  }, []);

  // a signed-in applicant with a draft but no local wizard state: pick the draft up
  useEffect(() => {
    if (wiz.applicationId || !getOnboardingToken()) return;
    let live = true;
    applicantApi
      .me()
      .then((me) => {
        const a = me.application;
        if (!live || !a || a.status !== "DRAFT") return;
        setWiz((w) => ({
          ...w,
          step: 3,
          school: schoolFormFrom(a),
          requestedPackage: a.requestedPackage ?? w.requestedPackage,
          billingCycle: a.billingCycle ?? w.billingCycle,
          admin: { fullName: me.account.fullName, email: me.account.email, phone: me.account.phone ?? "" },
          verifiedEmail: me.account.email.toLowerCase(),
          applicationId: a.id,
          logoUploaded: me.documents.some((d) => d.kind === "LOGO"),
        }));
        setMaxReached(3);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // focus the step title on every step change (not on first paint)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = window.setTimeout(() => heading.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [wiz.step]);

  const bestFit = useMemo(() => (packages ? bestFitPackage(packages, wiz.school.estStudents) : null), [packages, wiz.school.estStudents]);

  // pre-select the best fit once
  useEffect(() => {
    if (bestFit && !wiz.requestedPackage) setWiz((w) => ({ ...w, requestedPackage: bestFit }));
  }, [bestFit, wiz.requestedPackage]);

  const go = useCallback((step: number) => {
    setWiz((w) => {
      setDir(step >= w.step ? 1 : -1);
      return { ...w, step };
    });
    setMaxReached((m) => Math.max(m, step));
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  }, []);

  /** after OTP: create (or update) the draft, then upload the logo */
  const finalize = async (me: OnboardingMe) => {
    const body = toSchoolDetails(wiz);
    const open = me.application && ["DRAFT", "CHANGES_REQUESTED"].includes(me.application.status) ? me.application : null;
    const app = open ? await applicantApi.updateApplication(open.id, body) : await applicantApi.createApplication(body);
    let logoUploaded = wiz.logoUploaded;
    if (logo) {
      try {
        await applicantApi.uploadDocument(app.id, "LOGO", logo);
        logoUploaded = true;
        setLogo(null);
      } catch {
        /* optional: the tracker can take it later */
      }
    }
    setWiz((w) => ({ ...w, applicationId: app.id, verifiedEmail: w.admin.email.trim().toLowerCase(), logoUploaded }));
  };

  const submit = async (captchaToken?: string) => {
    const id = wiz.applicationId!;
    await applicantApi.updateApplication(id, toSchoolDetails(wiz));
    if (logo && !wiz.logoUploaded) {
      try {
        await applicantApi.uploadDocument(id, "LOGO", logo);
      } catch {
        /* optional */
      }
    }
    return applicantApi.submit(id, { acceptTerms: true, captchaToken });
  };

  const verified = !!wiz.verifiedEmail && !!wiz.applicationId && wiz.verifiedEmail === wiz.admin.email.trim().toLowerCase() && !!getOnboardingToken();

  const variants = reduced
    ? { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        enter: (d: number) => ({ x: d * 48, opacity: 0 }),
        center: { x: 0, opacity: 1 },
        exit: (d: number) => ({ x: d * -48, opacity: 0 }),
      };

  const step = STEPS[wiz.step];

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand-50 px-4 py-6 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between gap-3">
          <Link to={isRegistrationSite() ? "/" : "/login"} className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <AmashuriLogo size={34} />
          </Link>
          <div className="flex items-center gap-1">
            <Link to="/onboarding" className={ghostBtn}>
              <LogIn className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">My application</span>
              <span className="sr-only sm:hidden">My application</span>
            </Link>
            <ThemeToggle />
          </div>
        </header>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:p-8">
          {submitted ? (
            <Submitted app={submitted} />
          ) : (
            <>
              <WizardProgress step={wiz.step} maxReached={verified ? Math.max(maxReached, 3) : Math.min(maxReached, 2)} onJump={go} />
              <h1 className="sr-only">Register your school</h1>
              <AnimatePresence mode="wait" custom={dir} initial={false}>
                <motion.div
                  key={wiz.step}
                  custom={dir}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: reduced ? 0.12 : 0.25, ease: "easeOut" }}
                  className="mt-6"
                >
                  <h2 ref={heading} tabIndex={-1} className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-900 focus:outline-none dark:text-white">
                    <step.icon className="h-5 w-5 text-brand-600 dark:text-brand-200" aria-hidden />
                    {step.label}
                    <span className="ml-auto text-sm font-medium text-slate-600 dark:text-slate-300">
                      {wiz.step + 1}/{STEPS.length}
                    </span>
                  </h2>
                  {wiz.step === 0 && (
                    <StepSchool
                      school={wiz.school}
                      divisions={divisions}
                      onChange={(p) => setWiz((w) => ({ ...w, school: { ...w.school, ...p } }))}
                      logo={logo}
                      logoUploaded={wiz.logoUploaded}
                      onLogo={setLogo}
                      onNext={() => go(1)}
                    />
                  )}
                  {wiz.step === 1 && (
                    <StepPackage
                      packages={packages}
                      value={wiz.requestedPackage}
                      cycle={wiz.billingCycle}
                      bestFit={bestFit}
                      onChange={(p) => setWiz((w) => ({ ...w, ...p }))}
                      onBack={() => go(0)}
                      onNext={() => go(2)}
                    />
                  )}
                  {wiz.step === 2 && (
                    <StepAdmin
                      admin={wiz.admin}
                      onChange={(p) => setWiz((w) => ({ ...w, admin: { ...w.admin, ...p } }))}
                      captcha={captcha}
                      verified={verified}
                      finalize={finalize}
                      onBack={() => go(1)}
                      onNext={() => go(3)}
                    />
                  )}
                  {wiz.step === 3 && (
                    <StepReview
                      wiz={wiz}
                      packages={packages}
                      captcha={captcha}
                      onEdit={go}
                      onBack={() => go(2)}
                      submit={submit}
                      onSubmitted={(a) => {
                        clearWizard();
                        setSubmitted(a);
                      }}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </>
          )}
        </section>
      </div>
    </main>
  );
};

export default RegisterSchoolPage;
