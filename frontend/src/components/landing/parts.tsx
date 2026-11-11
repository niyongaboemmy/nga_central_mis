import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ALL_FEATURES, JOURNEY, type Feature } from "./content";

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

export const SectionTitle: React.FC<{ kicker: string; title: string; className?: string }> = ({ kicker, title, className }) => {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45 }}
      className={cx("text-center", className)}
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
        <span className="h-1.5 w-1.5 rounded-[2px] bg-amber-400" aria-hidden />
        {kicker}
      </span>
      <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">{title}</h2>
    </motion.div>
  );
};

/** An endless row of feature chips; pauses under the pointer, wraps when motion is reduced. */
const MarqueeRow: React.FC<{ items: Feature[]; reverse?: boolean; duration: number }> = ({ items, reverse, duration }) => {
  const reduced = useReducedMotion();
  if (reduced) {
    return (
      <ul className="flex flex-wrap justify-center gap-2 px-4">
        {items.map((f) => (
          <Chip key={f.label} f={f} />
        ))}
      </ul>
    );
  }
  return (
    <div className="group relative flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      <ul
        className="flex shrink-0 gap-2 pr-2 [animation:amashuri-marquee_var(--d)_linear_infinite] group-hover:[animation-play-state:paused]"
        style={{ ["--d" as string]: `${duration}s`, animationDirection: reverse ? "reverse" : "normal" }}
      >
        {[...items, ...items].map((f, i) => (
          <Chip key={`${f.label}-${i}`} f={f} hidden={i >= items.length} />
        ))}
      </ul>
    </div>
  );
};

const Chip: React.FC<{ f: Feature; hidden?: boolean }> = ({ f, hidden }) => (
  <li
    aria-hidden={hidden || undefined}
    className="flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200"
  >
    <f.icon className="h-4 w-4 text-brand-600 dark:text-brand-200" aria-hidden />
    {f.label}
  </li>
);

export const FeatureMarquee: React.FC = () => {
  const half = Math.ceil(ALL_FEATURES.length / 2);
  return (
    <section className="py-10" aria-label="Everything included">
      <style>{`@keyframes amashuri-marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
      <div className="space-y-3">
        <MarqueeRow items={ALL_FEATURES.slice(0, half)} duration={45} />
        <MarqueeRow items={ALL_FEATURES.slice(half)} duration={50} reverse />
      </div>
    </section>
  );
};

/** Register -> Review -> Approve & pay -> Go live; the line fills as it scrolls in. */
export const Journey: React.FC = () => {
  const reduced = useReducedMotion();
  return (
    <section id="how" className="scroll-mt-24 px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-4xl">
        <SectionTitle kicker="How to join" title="Live in four steps." />
        <ol className="relative mt-12 grid grid-cols-4 gap-2">
          <div className="absolute left-[12.5%] right-[12.5%] top-7 h-1 rounded-full bg-slate-200 dark:bg-white/10" aria-hidden />
          <motion.div
            className="absolute left-[12.5%] top-7 h-1 rounded-full bg-gradient-to-r from-brand-500 via-indigo-500 to-emerald-500"
            initial={reduced ? { width: "75%" } : { width: 0 }}
            whileInView={{ width: "75%" }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 1.6, ease: "easeInOut" }}
            aria-hidden
          />
          {JOURNEY.map((s, i) => (
            <motion.li
              key={s.label}
              className="relative flex flex-col items-center gap-3 text-center"
              initial={reduced ? false : { opacity: 0, scale: 0.6 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ type: "spring", stiffness: 260, damping: 18, delay: reduced ? 0 : 0.2 + i * 0.4 }}
            >
              <span
                className={cx(
                  "flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg ring-4 ring-white dark:ring-slate-950",
                  i === JOURNEY.length - 1 ? "bg-gradient-to-br from-emerald-500 to-teal-600" : "bg-gradient-to-br from-brand-500 to-indigo-600",
                )}
              >
                <s.icon className="h-6 w-6" aria-hidden />
              </span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100 sm:text-base">{s.label}</span>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
};
