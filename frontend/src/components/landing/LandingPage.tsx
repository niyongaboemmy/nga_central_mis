import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MotionConfig, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, CalendarRange, CalendarDays, Check, LogIn, Rocket } from "lucide-react";
import { publicApi, type PackageInfo } from "../../api/tenantMgmt";
import { CountUp, Segmented, accentOf, entIcon } from "../tenantMgmt/kit";
import ThemeToggle from "../ui/ThemeToggle";
import { AmashuriLogo, AmashuriMark } from "../brand/AmashuriLogo";
import { misHref } from "../../utils/registrationSite";
import Orbit from "./Orbit";
import AppsSection from "./AppsSection";
import Showcase from "./Showcase";
import { ALL_FEATURES, APPS } from "./content";
import { FeatureMarquee, Journey, SectionTitle, cx } from "./parts";

/**
 * amashuri.com -- the public face of the platform ("amashuri" = schools;
 * amashuri.com = school activities management). Short on words, long on
 * motion: what the apps do is shown, not described. Registration lives on
 * /register (utils/registrationSite.ts).
 */

const primaryCta =
  "inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-indigo-600 px-6 py-3 text-base font-bold text-white shadow-lg shadow-brand-600/30 transition-shadow hover:shadow-xl hover:shadow-brand-600/40 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/40";
const ghostCta =
  "inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white/70 px-6 py-3 text-base font-bold text-slate-800 backdrop-blur transition-colors hover:bg-white focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10";

const NAV = [
  { href: "#apps", label: "Apps" },
  { href: "#features", label: "Features" },
  { href: "#how", label: "How" },
  { href: "#packages", label: "Packages" },
];

const Nav: React.FC = () => {
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  useEffect(() => scrollY.on("change", (y) => setSolid(y > 12)), [scrollY]);
  return (
    <header
      className={cx(
        "fixed inset-x-0 top-0 z-40 transition-all duration-300",
        solid ? "border-b border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/75" : "bg-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4" aria-label="Main">
        <a href="#top" className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <AmashuriLogo size={34} animated />
        </a>
        <ul className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <li key={n.href}>
              <a href={n.href} className="rounded-full px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white">
                {n.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1.5">
          <a href={misHref("/login")} className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10 sm:inline-flex">
            <LogIn className="h-4 w-4" aria-hidden />
            Sign in
          </a>
          <Link to="/register" className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white transition-transform hover:scale-[1.03] dark:bg-white dark:text-slate-900">
            Register
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
};

/** Soft colour fields drifting behind the hero, over a faint grid. */
const Backdrop: React.FC = () => {
  const reduced = useReducedMotion();
  const blob = (cls: string, x: number[], y: number[], d: number) => (
    <motion.div
      className={cx("absolute rounded-full blur-3xl", cls)}
      animate={reduced ? undefined : { x, y }}
      transition={{ repeat: Infinity, repeatType: "mirror", duration: d, ease: "easeInOut" }}
    />
  );
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(100,116,139,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(100,116,139,0.08)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
      {blob("-left-32 top-10 h-96 w-96 bg-brand-500/25", [0, 60], [0, 40], 14)}
      {blob("right-[-8rem] top-40 h-[28rem] w-[28rem] bg-indigo-500/20", [0, -50], [0, 60], 16)}
      {blob("left-1/3 top-[26rem] h-72 w-72 bg-amber-400/15", [0, 40], [0, -30], 12)}
    </div>
  );
};

const STATS = [
  { value: APPS.length, suffix: "", label: "apps" },
  { value: Math.floor(ALL_FEATURES.length / 5) * 5, suffix: "+", label: "features" },
  { value: 1, suffix: "", label: "sign-in" },
];

const Hero: React.FC = () => {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  // parallax only beside the text (lg); stacked, it would slide over the next section
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(min-width: 1024px)").matches);
  useEffect(() => {
    const mq = window.matchMedia?.("(min-width: 1024px)");
    if (!mq) return;
    const on = () => setWide(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  const orbitY = useTransform(scrollY, [0, 600], [0, reduced || !wide ? 0 : 80]);
  const words = ["Every", "school", "activity."];
  return (
    <section id="top" className="relative px-4 pb-10 pt-28 sm:pt-32">
      <Backdrop />
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
        <div className="text-center lg:text-left">
          <motion.span
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
          >
            <span className="h-2 w-2 rounded-[3px] bg-amber-400" aria-hidden />
            amashuri · school activities management
          </motion.span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight text-slate-900 dark:text-white sm:text-6xl">
            {words.map((w, i) => (
              <motion.span
                key={w}
                className="mr-[0.25em] inline-block"
                initial={reduced ? false : { opacity: 0, y: 24, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ delay: 0.1 + i * 0.12, duration: 0.5 }}
              >
                {w}
              </motion.span>
            ))}
            <motion.span
              className="block bg-gradient-to-r from-brand-600 via-indigo-500 to-amber-500 bg-[length:200%_auto] bg-clip-text text-transparent dark:from-brand-200 dark:via-indigo-300 dark:to-amber-300"
              initial={reduced ? false : { opacity: 0, y: 24 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
              transition={{ opacity: { delay: 0.5 }, y: { delay: 0.5 }, backgroundPosition: { repeat: Infinity, duration: 8, ease: "linear" } }}
            >
              One platform.
            </motion.span>
          </h1>
          <motion.p
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="mx-auto mt-5 max-w-md text-lg text-slate-600 dark:text-slate-300 lg:mx-0"
          >
            Lessons, assessments, attendance and messages, together.
          </motion.p>
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85 }}
            className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start"
          >
            <motion.span whileHover={reduced ? undefined : { scale: 1.04 }} whileTap={{ scale: 0.97 }} className="inline-flex">
              <Link to="/register" className={cx(primaryCta, "w-full sm:w-auto")}>
                <Rocket className="h-5 w-5" aria-hidden />
                Register your school
              </Link>
            </motion.span>
            <a href={misHref("/login")} className={ghostCta}>
              <LogIn className="h-5 w-5" aria-hidden />
              Sign in
            </a>
          </motion.div>
          <dl className="mt-10 flex justify-center gap-8 lg:justify-start">
            {STATS.map((s, i) => (
              <motion.div
                key={s.label}
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 + i * 0.1 }}
              >
                <dt className="sr-only">{s.label}</dt>
                <dd className="text-3xl font-extrabold text-slate-900 dark:text-white">
                  <CountUp value={s.value} />
                  {s.suffix}
                </dd>
                <dd className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" aria-hidden>
                  {s.label}
                </dd>
              </motion.div>
            ))}
          </dl>
        </div>
        <motion.div style={{ y: orbitY }}>
          <Orbit />
        </motion.div>
      </div>
    </section>
  );
};

const money = (n: number, currency: string) => `${currency} ${Math.round(n).toLocaleString()}`;

/** A package at a glance: price, the three size limits, the apps, and how many features. */
const LandingPackageCard: React.FC<{ pkg: PackageInfo; cycle: "TERM" | "YEAR"; featured: boolean; index: number; onChoose: () => void }> = ({ pkg, cycle, featured, index, onChoose }) => {
  const reduced = useReducedMotion();
  const a = accentOf(pkg.accent);
  const price = cycle === "YEAR" ? pkg.priceYear : pkg.priceTerm;
  const apps = pkg.entitlements.filter((e) => e.kind === "APP");
  const features = pkg.entitlements.filter((e) => e.kind === "FEATURE").length;
  const limits = ["limit.students", "limit.staff", "limit.storage_gb"]
    .map((k) => pkg.entitlements.find((e) => e.key === k))
    .filter((e): e is NonNullable<typeof e> => !!e);
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08 }}
      whileHover={reduced ? undefined : { y: -6 }}
      className={cx(
        "relative flex flex-col overflow-hidden rounded-3xl border bg-white p-5 shadow-sm dark:bg-slate-900/70",
        featured ? cx("border-transparent ring-2 shadow-xl", a.ring) : "border-slate-200 dark:border-white/10",
      )}
    >
      <div className={cx("absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r", a.grad)} aria-hidden />
      <div className="flex items-center justify-between">
        <h3 className={cx("text-lg font-extrabold", a.text)}>{pkg.name}</h3>
        {featured && <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-bold text-white", a.bg)}>★ Popular</span>}
      </div>
      <div className="mt-2 min-h-[2.25rem] text-2xl font-extrabold text-slate-900 dark:text-white">
        {price === null ? (
          <span className="text-base font-semibold text-slate-500 dark:text-slate-400">Price on approval</span>
        ) : (
          <>
            {money(price, pkg.currency)}
            <span className="ml-1 text-xs font-semibold text-slate-500">/{cycle === "YEAR" ? "yr" : "term"}</span>
          </>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {limits.map((l) => {
          const Icon = entIcon(l.key);
          return (
            <span key={l.key} className="flex items-center gap-1 text-sm font-bold text-slate-700 dark:text-slate-200" title={l.label}>
              <Icon className="h-4 w-4 text-slate-400" aria-hidden />
              {l.value === null ? "∞" : Number(l.value).toLocaleString()}
              {l.key === "limit.storage_gb" ? " GB" : ""}
              <span className="sr-only">{l.label}</span>
            </span>
          );
        })}
      </div>
      <ul className="mt-4 flex flex-wrap gap-1.5">
        {apps.map((e) => {
          const Icon = entIcon(e.key);
          return (
            <li key={e.key} title={e.label} className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">
              <Icon className="h-4 w-4" aria-hidden />
              <span className="sr-only">{e.label}</span>
            </li>
          );
        })}
        {features > 0 && (
          <li className={cx("flex h-9 items-center gap-1 rounded-xl px-2.5 text-xs font-bold", a.soft, a.text)}>
            <Check className="h-3.5 w-3.5" aria-hidden />
            {features} {features === 1 ? "feature" : "features"}
          </li>
        )}
      </ul>
      <button
        type="button"
        onClick={onChoose}
        className={cx(
          "mt-5 inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
          featured ? cx("text-white", a.bg) : "bg-slate-900 text-white dark:bg-white dark:text-slate-900",
        )}
      >
        Choose {pkg.name}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </motion.div>
  );
};

const Packages: React.FC = () => {
  const navigate = useNavigate();
  const [packages, setPackages] = useState<PackageInfo[] | null>(null);
  const [cycle, setCycle] = useState<"TERM" | "YEAR">("YEAR");
  useEffect(() => {
    publicApi
      .packages()
      .then((p) => setPackages(p.filter((x) => x.isPublic !== false && x.isActive !== false).sort((a, b) => a.tier - b.tier)))
      .catch(() => setPackages([]));
  }, []);
  if (packages && packages.length === 0) return null;
  return (
    <section id="packages" className="scroll-mt-24 px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <SectionTitle kicker="Packages" title="Start small. Grow anytime." />
        <div className="mt-6 flex justify-center">
          <Segmented
            label="Billing cycle"
            value={cycle}
            onChange={setCycle}
            options={[
              { value: "TERM", label: "Term", icon: CalendarDays },
              { value: "YEAR", label: "Year", icon: CalendarRange },
            ]}
          />
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(packages ?? Array.from({ length: 4 }).map(() => null)).map((p, i) =>
            p ? (
              <LandingPackageCard
                key={p.code}
                pkg={p}
                cycle={cycle}
                index={i}
                featured={i === 1}
                onChoose={() => navigate(`/register?package=${encodeURIComponent(p.code)}&cycle=${cycle}`)}
              />
            ) : (
              <div key={i} className="h-64 animate-pulse rounded-3xl bg-slate-100 dark:bg-white/5" />
            ),
          )}
        </div>
      </div>
    </section>
  );
};

const FinalCta: React.FC = () => {
  const reduced = useReducedMotion();
  return (
    <section className="px-4 pb-16 sm:pb-24">
      <motion.div
        initial={reduced ? false : { opacity: 0, scale: 0.96 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-600 via-indigo-600 to-[#1a2b8c] px-6 py-14 text-center text-white shadow-2xl sm:px-12"
      >
        <motion.div
          className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-amber-400/30 blur-3xl"
          animate={reduced ? undefined : { scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 7 }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.15)_1px,transparent_0)] bg-[size:22px_22px]" aria-hidden />
        <div className="relative flex flex-col items-center">
          <AmashuriMark size={72} animated live />
          <h2 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-5xl">Bring your school online.</h2>
          <Link
            to="/register"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-extrabold text-brand-700 shadow-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
          >
            <Rocket className="h-5 w-5" aria-hidden />
            Register your school
          </Link>
        </div>
      </motion.div>
    </section>
  );
};

const Footer: React.FC = () => (
  <footer className="border-t border-slate-200 px-4 py-8 dark:border-white/10">
    <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
      <div className="flex flex-col items-center gap-1 sm:items-start">
        <AmashuriLogo size={28} domain />
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">School activities management</span>
      </div>
      <nav className="flex items-center gap-4 text-sm font-semibold text-slate-600 dark:text-slate-300" aria-label="Footer">
        <a href="/privacy/" className="hover:underline">Privacy</a>
        <a href="/terms/" className="hover:underline">Terms</a>
        <a href={misHref("/login")} className="hover:underline">Sign in</a>
        <span className="text-slate-400">© {new Date().getFullYear()}</span>
      </nav>
    </div>
  </footer>
);

const LandingPage: React.FC = () => (
  <MotionConfig reducedMotion="user">
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900 dark:bg-[#070b18] dark:text-white">
      <Nav />
      <main>
        <Hero />
        <FeatureMarquee />
        <AppsSection />
        <Showcase />
        <Journey />
        <Packages />
        <FinalCta />
      </main>
      <Footer />
    </div>
  </MotionConfig>
);

export default LandingPage;
