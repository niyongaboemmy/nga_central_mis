import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MotionConfig, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ChevronRight, KeyRound, MonitorSmartphone, WifiOff } from "lucide-react";
import ThemeToggle from "../ui/ThemeToggle";
import { AmashuriLogo, AmashuriMark } from "../brand/AmashuriLogo";
import { misHref } from "../../utils/registrationSite";
import HeroShowcase from "./HeroShowcase";
import { APPS } from "./content";
import { LiveDot } from "./widgets";
import AppsSection from "./AppsSection";
import Showcase from "./Showcase";
import Packages from "./Packages";
import { EASE, FeatureMarquee, Journey, Reveal, cx, linkChevron, pillPrimary } from "./parts";

/**
 * amashuri.com -- the public face of the platform ("amashuri" = schools;
 * amashuri.com = school activities management). Designed in Apple's
 * discipline: generous space, big tight type, one action colour (blue),
 * light sections alternating with a soft grey, and motion that eases.
 * Registration lives on /register (utils/registrationSite.ts).
 */

/** Page tokens; every landing component paints with these. */
const TOKENS = `
.lp {
  --lp-bg: #ffffff; --lp-alt: #f5f5f7; --lp-card: #ffffff;
  --lp-text: #1d1d1f; --lp-muted: #6e6e73;
  --lp-blue: #0071e3; --lp-blue-soft: rgba(0,113,227,0.09);
  --lp-hair: rgba(0,0,0,0.08); --lp-seg: #e8e8ed; --lp-nav: rgba(255,255,255,0.72);
  --lp-glass: rgba(255,255,255,0.82);
  --lp-glow-a: rgba(0,113,227,0.16); --lp-glow-b: rgba(90,200,250,0.16); --lp-glow-c: rgba(41,151,255,0.12);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
}
.dark .lp {
  --lp-bg: #000000; --lp-alt: #111113; --lp-card: #1c1c1e;
  --lp-text: #f5f5f7; --lp-muted: #a1a1a6;
  --lp-blue: #2997ff; --lp-blue-soft: rgba(41,151,255,0.15);
  --lp-hair: rgba(255,255,255,0.12); --lp-seg: rgba(255,255,255,0.10); --lp-nav: rgba(22,22,23,0.72);
  --lp-glass: rgba(28,28,30,0.78);
  --lp-glow-a: rgba(0,113,227,0.34); --lp-glow-b: rgba(90,200,250,0.18); --lp-glow-c: rgba(41,151,255,0.22);
}
/* hero backdrop: three blurred glows drifting slowly (transform only) */
.lp-glow { position: absolute; border-radius: 9999px; filter: blur(80px); will-change: transform; }
@keyframes lp-drift-a { from { transform: translate3d(-50%, 0, 0) scale(1); } to { transform: translate3d(-44%, 6%, 0) scale(1.12); } }
@keyframes lp-drift-b { from { transform: translate3d(0, 0, 0) scale(1); } to { transform: translate3d(12%, -8%, 0) scale(1.15); } }
@keyframes lp-drift-c { from { transform: translate3d(0, 0, 0) scale(1.05); } to { transform: translate3d(-14%, 10%, 0) scale(0.95); } }
@keyframes lp-sheen { from { background-position: 0% 50%; } to { background-position: 100% 50%; } }
.lp-glow-a { animation: lp-drift-a 22s ease-in-out infinite alternate; }
.lp-glow-b { animation: lp-drift-b 28s ease-in-out infinite alternate; }
.lp-glow-c { animation: lp-drift-c 25s ease-in-out infinite alternate; }
.lp-sheen { background-size: 200% auto; animation: lp-sheen 9s ease-in-out infinite alternate; }
@media (prefers-reduced-motion: reduce) { .lp-glow, .lp-sheen { animation: none !important; } }`;

const NAV = [
  { href: "#apps", label: "Apps" },
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#packages", label: "Packages" },
];

const Nav: React.FC = () => {
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  useEffect(() => scrollY.on("change", (y) => setSolid(y > 8)), [scrollY]);
  return (
    <header
      className={cx(
        "fixed inset-x-0 top-0 z-40 transition-colors duration-300",
        solid ? "border-b border-[var(--lp-hair)] bg-[var(--lp-nav)] backdrop-blur-xl backdrop-saturate-150" : "border-b border-transparent",
      )}
    >
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4" aria-label="Main">
        <a href="#top" className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-blue)]">
          <AmashuriLogo size={28} animated textClass="text-[var(--lp-text)]" />
        </a>
        <ul className="hidden items-center gap-7 md:flex">
          {NAV.map((n) => (
            <li key={n.href}>
              <a href={n.href} className="text-[13px] text-[var(--lp-text)]/80 transition-colors hover:text-[var(--lp-text)]">
                {n.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3">
          <a href={misHref("/login")} className="hidden text-[13px] text-[var(--lp-text)]/80 hover:text-[var(--lp-text)] sm:inline">
            Sign in
          </a>
          <Link to="/register" className="rounded-full bg-[var(--lp-blue)] px-3.5 py-1.5 text-[13px] font-medium text-white transition hover:brightness-110">
            Register
          </Link>
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
};

/**
 * A quiet mesh gradient behind the hero: three blurred blue glows drifting on
 * 22-28 s cycles, fading into the page at the bottom. Still when motion is
 * reduced (TOKENS).
 */
const HeroBackdrop: React.FC = () => (
  <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
    <div className="lp-glow lp-glow-a left-1/2 top-[-18rem] h-[44rem] w-[64rem] max-w-[160vw]" style={{ background: "radial-gradient(closest-side, var(--lp-glow-a), transparent)" }} />
    <div className="lp-glow lp-glow-b left-[-12rem] top-[18rem] h-[30rem] w-[36rem]" style={{ background: "radial-gradient(closest-side, var(--lp-glow-b), transparent)" }} />
    <div className="lp-glow lp-glow-c right-[-10rem] top-[28rem] h-[32rem] w-[38rem]" style={{ background: "radial-gradient(closest-side, var(--lp-glow-c), transparent)" }} />
    <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-[var(--lp-bg)]" />
  </div>
);

const FACTS: Array<{ icon: React.FC<{ className?: string }>; label: string }> = [
  { icon: KeyRound, label: "One sign-in" },
  { icon: WifiOff, label: "Works offline" },
  { icon: MonitorSmartphone, label: "Desktop & mobile" },
];

/**
 * The hero introduces the ecosystem: the pitch on the left with the four
 * apps as chips, the product on the right (HeroShowcase) -- live UI, not a
 * screenshot. Chips and showcase share `focus`: hovering a chip rings that
 * app's piece; left alone, the focus tours the four apps.
 */
const Hero: React.FC = () => {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const [focus, setFocus] = useState(APPS[0].key);
  const [held, setHeld] = useState(false);
  const [inView, setInView] = useState(true);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const shotY = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : 60]);

  useEffect(() => {
    if (reduced || held || !inView) return;
    const t = window.setTimeout(() => {
      const i = APPS.findIndex((a) => a.key === focus);
      setFocus(APPS[(i + 1) % APPS.length].key);
    }, 3200);
    return () => window.clearTimeout(t);
  }, [focus, held, inView, reduced]);

  const rise = (delay: number) => ({
    initial: reduced ? { opacity: 0 } : { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.9, delay, ease: EASE },
  });

  return (
    <motion.section
      id="top"
      ref={ref}
      onViewportEnter={() => setInView(true)}
      onViewportLeave={() => setInView(false)}
      className="relative isolate overflow-hidden bg-[var(--lp-bg)] px-4 pb-16 pt-28 sm:pt-36 lg:pb-20"
    >
      <HeroBackdrop />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-10">
        {/* the pitch */}
        <div className="text-center lg:text-left">
          <motion.span
            {...rise(0)}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--lp-glass)] px-3 py-1.5 text-[13px] font-medium text-[var(--lp-text)] shadow-[0_2px_10px_rgba(0,0,0,0.06)] ring-1 ring-[var(--lp-hair)] backdrop-blur"
          >
            <LiveDot />
            The school operating system
          </motion.span>
          <motion.h1 {...rise(0.1)} className="mt-6 text-[3rem] font-semibold leading-[1.02] tracking-[-0.045em] text-[var(--lp-text)] sm:text-[4.5rem] lg:text-[4.75rem]">
            Your whole school.{" "}
            <span className="lp-sheen block bg-gradient-to-r from-[#0071e3] via-[#5ac8fa] to-[#0071e3] bg-clip-text pb-2 text-transparent">One place.</span>
          </motion.h1>
          <motion.p {...rise(0.25)} className="mx-auto mt-5 max-w-lg text-xl leading-relaxed text-[var(--lp-muted)] lg:mx-0">
            Four connected apps for lessons, assessments, attendance and messages. One sign-in for everyone.
          </motion.p>
          <motion.div {...rise(0.4)} className="mt-8 flex flex-col items-center gap-5 sm:flex-row sm:justify-center lg:justify-start">
            <Link to="/register" className={pillPrimary}>
              Register your school
            </Link>
            <a href={misHref("/login")} className={linkChevron}>
              Sign in
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </a>
          </motion.div>

          {/* the ecosystem, as chips that drive the showcase */}
          <motion.ul
            {...rise(0.55)}
            className="mt-10 flex flex-wrap justify-center gap-2 lg:justify-start"
            aria-label="The four apps"
            onPointerLeave={() => setHeld(false)}
          >
            {APPS.map((a) => {
              const on = a.key === focus;
              const Icon = a.icon;
              return (
                <li key={a.key}>
                  <button
                    type="button"
                    onPointerEnter={() => {
                      setHeld(true);
                      setFocus(a.key);
                    }}
                    onFocus={() => {
                      setHeld(true);
                      setFocus(a.key);
                    }}
                    onBlur={() => setHeld(false)}
                    onClick={() => document.getElementById("apps")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" })}
                    className={cx(
                      "relative flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-blue)]",
                      on ? "text-[var(--lp-text)]" : "text-[var(--lp-muted)] hover:text-[var(--lp-text)]",
                    )}
                  >
                    {on && (
                      <motion.span
                        layoutId="hero-chip"
                        className="absolute inset-0 rounded-full bg-[var(--lp-glass)] shadow-[0_4px_14px_rgba(0,0,0,0.08)] ring-1 ring-[var(--lp-hair)]"
                        transition={{ type: "spring", stiffness: 400, damping: 34 }}
                      />
                    )}
                    <span className={cx("relative flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br text-white", a.grad)}>
                      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </span>
                    <span className="relative">{a.name}</span>
                  </button>
                </li>
              );
            })}
          </motion.ul>

          <motion.ul {...rise(0.7)} className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-[var(--lp-muted)] lg:justify-start">
            {FACTS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-1.5">
                <Icon className="h-4 w-4 text-[var(--lp-blue)]" aria-hidden />
                {label}
              </li>
            ))}
          </motion.ul>
        </div>

        {/* the product */}
        <motion.div
          style={{ y: shotY }}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1.1, delay: 0.3, ease: EASE }}
          className="flex justify-center sm:block sm:px-12 lg:px-0"
        >
          {/* phones: the shot keeps its proportions and scales down, like a product photo */}
          <div className="w-[540px] shrink-0 [zoom:0.6] min-[430px]:[zoom:0.68] min-[520px]:[zoom:0.85] sm:w-auto sm:[zoom:1]">
            <HeroShowcase focus={focus} live={inView && !reduced} />
          </div>
        </motion.div>
      </div>
    </motion.section>
  );
};

const FinalCta: React.FC = () => (
  <section className="bg-[var(--lp-bg)] px-4 py-28 sm:py-36">
    <Reveal className="mx-auto flex max-w-3xl flex-col items-center text-center">
      <AmashuriMark size={84} animated live />
      <h2 className="mt-8 text-[2.75rem] font-semibold leading-[1.05] tracking-[-0.04em] text-[var(--lp-text)] sm:text-7xl">Bring your school online.</h2>
      <p className="mt-4 text-xl text-[var(--lp-muted)] sm:text-2xl">Apply today. We take it from there.</p>
      <div className="mt-9 flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
        <Link to="/register" className={pillPrimary}>
          Register your school
        </Link>
        <a href="#packages" className={linkChevron}>
          Compare packages
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </a>
      </div>
    </Reveal>
  </section>
);

const Footer: React.FC = () => (
  <footer className="border-t border-[var(--lp-hair)] bg-[var(--lp-alt)] px-4 py-8">
    <div className="mx-auto flex max-w-6xl flex-col gap-4 text-xs text-[var(--lp-muted)] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <AmashuriMark size={20} />
        <span>Amashuri · School activities management</span>
      </div>
      <nav className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Footer">
        <a href="/privacy/" className="hover:text-[var(--lp-text)] hover:underline">Privacy</a>
        <a href="/terms/" className="hover:text-[var(--lp-text)] hover:underline">Terms</a>
        <a href={misHref("/login")} className="hover:text-[var(--lp-text)] hover:underline">Sign in</a>
        <span>© {new Date().getFullYear()} Amashuri</span>
      </nav>
    </div>
  </footer>
);

const LandingPage: React.FC = () => (
  <MotionConfig reducedMotion="user">
    <style>{TOKENS}</style>
    <div className="lp min-h-screen overflow-x-hidden bg-[var(--lp-bg)] text-[var(--lp-text)]">
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
