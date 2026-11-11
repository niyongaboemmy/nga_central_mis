import React, { useEffect, useState } from "react";
import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useReducedMotion } from "framer-motion";
import { APPS, type AppInfo } from "./content";
import { SectionTitle } from "./parts";

/** One app: a spotlight follows the pointer, its features tick past one by one. */
const AppCard: React.FC<{ app: AppInfo; index: number }> = ({ app, index }) => {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  const [hover, setHover] = useState(false);
  const mx = useMotionValue(-200);
  const my = useMotionValue(-200);
  const spotlight = useMotionTemplate`radial-gradient(260px circle at ${mx}px ${my}px, ${app.glow}, transparent 70%)`;

  useEffect(() => {
    if (reduced || hover) return;
    // cards start out of step so they never all change at once
    const start = window.setTimeout(() => setTick((t) => t + 1), 600 + index * 450);
    const t = window.setInterval(() => setTick((v) => v + 1), 2200);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(t);
    };
  }, [reduced, hover, index]);

  const current = app.features[tick % app.features.length];
  const Icon = app.icon;
  return (
    <motion.article
      initial={reduced ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: index * 0.08, ease: [0.2, 0.8, 0.2, 1] }}
      whileHover={reduced ? undefined : { y: -6 }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set(e.clientX - r.left);
        my.set(e.clientY - r.top);
      }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => {
        setHover(false);
        mx.set(-200);
        my.set(-200);
      }}
      className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/70"
    >
      <motion.div className="pointer-events-none absolute inset-0" style={{ background: spotlight }} aria-hidden />
      <div className="relative">
        <div className="flex items-center gap-3">
          <motion.span
            className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${app.grad} text-white shadow-lg`}
            whileHover={reduced ? undefined : { rotate: [0, -8, 8, 0] }}
            transition={{ duration: 0.5 }}
          >
            <Icon className="h-6 w-6" aria-hidden />
          </motion.span>
          <div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">{app.name}</h3>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{app.tagline}</p>
          </div>
        </div>

        {/* the feature on stage */}
        <div className="relative mt-5 h-12 overflow-hidden rounded-xl bg-slate-50 dark:bg-white/5" aria-live="off">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={current.label}
              initial={{ y: 28, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -28, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
              className="absolute inset-0 flex items-center gap-2.5 px-3"
            >
              <current.icon className="h-5 w-5 text-slate-700 dark:text-slate-200" aria-hidden />
              <span className="font-semibold text-slate-800 dark:text-slate-100">{current.label}</span>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* every feature as an icon; the one on stage lights up */}
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {app.features.map((f) => {
            const on = f.label === current.label;
            return (
              <li key={f.label}>
                <motion.span
                  title={f.label}
                  animate={{ scale: on ? 1.12 : 1 }}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                    on ? `bg-gradient-to-br ${app.grad} text-white shadow` : "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400"
                  }`}
                >
                  <f.icon className="h-4 w-4" aria-hidden />
                </motion.span>
                <span className="sr-only">{f.label}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </motion.article>
  );
};

const AppsSection: React.FC = () => (
  <section id="apps" className="scroll-mt-24 px-4 py-12 sm:py-16">
    <div className="mx-auto max-w-6xl">
      <SectionTitle kicker="4 apps" title="One sign-in. Every activity." />
      {/* phones: a swipe row; wider: a grid */}
      <div className="-mx-4 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
        {APPS.map((a, i) => (
          <div key={a.key} className="w-[82%] shrink-0 snap-center sm:w-auto">
            <AppCard app={a} index={i} />
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default AppsSection;
