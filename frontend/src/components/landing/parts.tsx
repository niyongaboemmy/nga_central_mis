import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ALL_FEATURES, JOURNEY } from "./content";

/**
 * Shared pieces of the landing page. The look follows Apple's discipline:
 * a few colour tokens (--lp-*, set on the page root in LandingPage), big
 * tight headlines with one grey line under them, generous space, one action
 * colour (blue), and motion that eases in rather than bounces.
 */

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

/** Apple's ease: quick start, long soft landing. */
export const EASE = [0.25, 0.1, 0.25, 1] as const;

/** Fade and rise into view, once. */
export const Reveal: React.FC<{ children: React.ReactNode; delay?: number; className?: string; y?: number }> = ({ children, delay = 0, className, y = 28 }) => {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.8, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
};

export const SectionHead: React.FC<{ eyebrow?: string; title: string; sub?: string; className?: string }> = ({ eyebrow, title, sub, className }) => (
  <Reveal className={cx("mx-auto max-w-3xl text-center", className)}>
    {eyebrow && <p className="mb-3 text-sm font-semibold text-[var(--lp-blue)] sm:text-base">{eyebrow}</p>}
    <h2 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.035em] text-[var(--lp-text)] sm:text-6xl">{title}</h2>
    {sub && <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-[var(--lp-muted)] sm:text-xl">{sub}</p>}
  </Reveal>
);

/** Blue pill, Apple's primary action. */
export const pillPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--lp-blue)] px-6 py-3 text-[17px] font-medium text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--lp-blue)]/30";
/** Text link with a chevron, Apple's secondary action. */
export const linkChevron =
  "group inline-flex items-center gap-0.5 text-[17px] font-medium text-[var(--lp-blue)] hover:underline focus:outline-none focus-visible:underline";

/** A quiet, endless line of feature names; stops under the pointer, wraps when motion is reduced. */
export const FeatureMarquee: React.FC = () => {
  const reduced = useReducedMotion();
  const items = ALL_FEATURES;
  const row = (hidden: boolean) =>
    items.map((f, i) => (
      <li key={`${f.label}-${hidden}-${i}`} aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-2 text-[15px] font-medium text-[var(--lp-muted)]">
        <f.icon className="h-[18px] w-[18px] text-[var(--lp-text)]" strokeWidth={1.75} aria-hidden />
        {f.label}
      </li>
    ));
  return (
    <section aria-label="Everything included" className="border-y border-[var(--lp-hair)] py-6">
      <style>{`@keyframes lp-marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
      {reduced ? (
        <ul className="mx-auto flex max-w-5xl flex-wrap justify-center gap-x-8 gap-y-3 px-4">{row(false)}</ul>
      ) : (
        <div className="group flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
          <ul className="flex shrink-0 gap-10 pr-10 [animation:lp-marquee_70s_linear_infinite] group-hover:[animation-play-state:paused]">
            {row(false)}
            {row(true)}
          </ul>
        </div>
      )}
    </section>
  );
};

/** Four numbered steps; a hairline fills between them as the row scrolls in. */
export const Journey: React.FC = () => {
  const reduced = useReducedMotion();
  return (
    <section id="how" className="scroll-mt-16 border-t border-[var(--lp-hair)] bg-[var(--lp-bg)] px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl">
        <SectionHead eyebrow="How to join" title="Live in four steps." sub="Register online. We review, you pay, your school goes live." />
        <ol className="relative mt-16 grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-4">
          <div className="absolute left-[12.5%] right-[12.5%] top-6 hidden h-px bg-[var(--lp-hair)] sm:block" aria-hidden />
          <motion.div
            className="absolute left-[12.5%] top-6 hidden h-px bg-[var(--lp-blue)] sm:block"
            initial={{ width: reduced ? "75%" : 0 }}
            whileInView={{ width: "75%" }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1.8, ease: EASE }}
            aria-hidden
          />
          {JOURNEY.map((s, i) => (
            <motion.li
              key={s.label}
              className="relative flex flex-col items-center text-center"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.7, delay: reduced ? 0 : 0.25 + i * 0.35, ease: EASE }}
            >
              <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[var(--lp-card)] text-[var(--lp-blue)] shadow-[0_2px_12px_rgba(0,0,0,0.08)] ring-1 ring-[var(--lp-hair)]">
                <s.icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="mt-4 text-sm font-semibold tabular-nums text-[var(--lp-muted)]">0{i + 1}</span>
              <span className="mt-1 text-xl font-semibold tracking-tight text-[var(--lp-text)]">{s.label}</span>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
};
