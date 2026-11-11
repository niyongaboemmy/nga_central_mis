import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MotionConfig, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ChevronRight } from "lucide-react";
import ThemeToggle from "../ui/ThemeToggle";
import { AmashuriLogo, AmashuriMark } from "../brand/AmashuriLogo";
import { misHref } from "../../utils/registrationSite";
import Orbit from "./Orbit";
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
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
}
.dark .lp {
  --lp-bg: #000000; --lp-alt: #111113; --lp-card: #1c1c1e;
  --lp-text: #f5f5f7; --lp-muted: #a1a1a6;
  --lp-blue: #2997ff; --lp-blue-soft: rgba(41,151,255,0.15);
  --lp-hair: rgba(255,255,255,0.12); --lp-seg: rgba(255,255,255,0.10); --lp-nav: rgba(22,22,23,0.72);
}`;

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

const Hero: React.FC = () => {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  // the visual settles in as the page moves, like a product shot
  const scale = useTransform(scrollYProgress, [0, 1], [1, reduced ? 1 : 0.88]);
  const fade = useTransform(scrollYProgress, [0, 0.9], [1, reduced ? 1 : 0.3]);
  const words = ["Every", "school", "activity."];

  return (
    <section id="top" ref={ref} className="relative overflow-hidden bg-[var(--lp-bg)] px-4 pb-16 pt-32 sm:pt-40">
      <div className="mx-auto max-w-4xl text-center">
        <motion.p
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE }}
          className="text-lg font-semibold text-[var(--lp-muted)] sm:text-xl"
        >
          amashuri<span className="text-[var(--lp-blue)]">.</span> school activities management
        </motion.p>
        <h1 className="mt-4 text-[3.25rem] font-semibold leading-[1.02] tracking-[-0.045em] text-[var(--lp-text)] sm:text-[5.5rem]">
          {words.map((w, i) => (
            <React.Fragment key={w}>
              <motion.span
                className="inline-block"
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, delay: 0.1 + i * 0.1, ease: EASE }}
              >
                {w}
              </motion.span>{" "}
            </React.Fragment>
          ))}
          <motion.span
            className="block bg-gradient-to-r from-[#0071e3] via-[#2997ff] to-[#5ac8fa] bg-clip-text pb-2 text-transparent"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.45, ease: EASE }}
          >
            One platform.
          </motion.span>
        </h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.7, ease: EASE }}
          className="mx-auto mt-5 max-w-xl text-xl leading-relaxed text-[var(--lp-muted)] sm:text-2xl"
        >
          Lessons, assessments, attendance and messages. Together.
        </motion.p>
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.85, ease: EASE }}
          className="mt-9 flex flex-col items-center justify-center gap-5 sm:flex-row sm:gap-8"
        >
          <Link to="/register" className={pillPrimary}>
            Register your school
          </Link>
          <a href={misHref("/login")} className={linkChevron}>
            Sign in
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </a>
        </motion.div>
      </div>
      <motion.div style={{ scale, opacity: fade }} className="mt-14 sm:mt-16">
        <Orbit />
      </motion.div>
    </section>
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
