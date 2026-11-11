import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { APPS, type AppInfo, type Feature } from "./content";
import { EASE, SectionHead, cx, linkChevron } from "./parts";

/**
 * "One sign-in. Every activity." -- a module explorer in Apple's manner: a
 * pill segmented control (the thumb slides; apps take turns on their own and
 * a hairline shows the time left; pointer or focus stops that), and a calm
 * stage where the chosen app's features rise into place.
 */

const TURN_MS = 7000;

const FeatureTile: React.FC<{ f: Feature; index: number; featured: boolean }> = ({ f, index, featured }) => {
  const reduced = useReducedMotion();
  const Icon = f.icon;
  return (
    <motion.li
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ duration: 0.6, delay: reduced ? 0 : 0.08 + index * 0.05, ease: EASE }}
      whileHover={reduced ? undefined : { y: -4 }}
      className={cx(
        "group flex rounded-[22px] bg-[var(--lp-card)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow duration-300 hover:shadow-[0_12px_32px_rgba(0,0,0,0.10)]",
        featured ? "col-span-2 items-center gap-5" : "flex-col gap-4",
      )}
    >
      <span
        className={cx(
          "flex shrink-0 items-center justify-center rounded-full bg-[var(--lp-blue-soft)] text-[var(--lp-blue)] transition-transform duration-500 group-hover:scale-110",
          featured ? "h-16 w-16" : "h-11 w-11",
        )}
      >
        <Icon className={featured ? "h-7 w-7" : "h-5 w-5"} strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className={cx("block font-semibold tracking-tight text-[var(--lp-text)]", featured ? "text-2xl" : "text-[17px]")}>{f.label}</span>
        {f.hint && <span className={cx("mt-1 block text-[var(--lp-muted)]", featured ? "text-base" : "text-sm")}>{f.hint}</span>}
      </span>
    </motion.li>
  );
};

const AppsSection: React.FC = () => {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  const [inView, setInView] = useState(false);
  const running = !reduced && !held && inView;
  const app: AppInfo = APPS[active];
  const AppIcon = app.icon;

  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => setActive((a) => (a + 1) % APPS.length), TURN_MS);
    return () => window.clearTimeout(t);
  }, [active, running]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (active + (e.key === "ArrowRight" ? 1 : APPS.length - 1)) % APPS.length;
    setActive(next);
    document.getElementById(`apps-tab-${APPS[next].key}`)?.focus();
  };

  return (
    <section id="apps" className="scroll-mt-16 bg-[var(--lp-alt)] px-4 py-24 sm:py-32">
      <motion.div className="mx-auto max-w-6xl" onViewportEnter={() => setInView(true)} onViewportLeave={() => setInView(false)}>
        <SectionHead eyebrow="Four apps" title="One sign-in. Every activity." sub="Each app does one job well. Together they run the school." />

        <div
          className="mt-14"
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
        >
          {/* segmented control */}
          <div className="flex justify-center">
            <div
              role="tablist"
              aria-label="Apps"
              onKeyDown={onKey}
              className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-[var(--lp-seg)] p-1 [scrollbar-width:none]"
            >
              {APPS.map((a, i) => {
                const on = i === active;
                const Icon = a.icon;
                return (
                  <button
                    key={a.key}
                    id={`apps-tab-${a.key}`}
                    role="tab"
                    type="button"
                    aria-selected={on}
                    aria-controls="apps-stage"
                    tabIndex={on ? 0 : -1}
                    onClick={() => setActive(i)}
                    className={cx(
                      "relative flex shrink-0 items-center gap-2 overflow-hidden rounded-full px-4 py-2.5 text-[15px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-blue)] sm:px-5",
                      on ? "text-[var(--lp-text)]" : "text-[var(--lp-muted)] hover:text-[var(--lp-text)]",
                    )}
                  >
                    {on && (
                      <motion.span
                        layoutId="apps-seg-thumb"
                        className="absolute inset-0 rounded-full bg-[var(--lp-card)] shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
                        transition={{ type: "spring", stiffness: 420, damping: 36 }}
                        aria-hidden
                      />
                    )}
                    <Icon className="relative h-4 w-4" strokeWidth={1.75} aria-hidden />
                    <span className="relative whitespace-nowrap">{a.name}</span>
                    {on && (
                      <motion.span
                        key={`${a.key}-${running}`}
                        className="absolute bottom-1 left-5 right-5 h-[2px] origin-left rounded-full bg-[var(--lp-blue)]/70"
                        initial={{ scaleX: running ? 0 : 1 }}
                        animate={{ scaleX: running ? 1 : 0 }}
                        transition={{ duration: running ? TURN_MS / 1000 : 0.2, ease: "linear" }}
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* stage */}
          <div id="apps-stage" role="tabpanel" aria-labelledby={`apps-tab-${app.key}`} className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:items-center lg:gap-12">
            <AnimatePresence mode="wait">
              <motion.div
                key={app.key}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                transition={{ duration: 0.6, ease: EASE }}
                className="flex items-center gap-5 lg:flex-col lg:items-start"
              >
                <span className={cx("flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br text-white shadow-[0_10px_30px_rgba(0,113,227,0.25)] lg:h-24 lg:w-24 lg:rounded-[28px]", app.grad)}>
                  <AppIcon className="h-8 w-8 lg:h-11 lg:w-11" strokeWidth={1.75} aria-hidden />
                </span>
                <div>
                  <h3 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--lp-text)] lg:text-5xl">{app.name}</h3>
                  <p className="mt-1 text-lg text-[var(--lp-muted)] lg:mt-2 lg:text-xl">{app.tagline}.</p>
                  <p className="mt-6 hidden text-sm font-medium text-[var(--lp-muted)] lg:block">
                    <span className="text-4xl font-semibold tabular-nums tracking-tight text-[var(--lp-text)]">{app.features.length}</span> features
                  </p>
                  <Link to="/register" className={cx(linkChevron, "mt-6 hidden lg:inline-flex")}>
                    Get {app.name}
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </div>
              </motion.div>
            </AnimatePresence>

            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {app.features.map((f, i) => (
                  <FeatureTile key={`${app.key}-${f.label}`} f={f} index={i} featured={i === 0} />
                ))}
              </AnimatePresence>
            </ul>
          </div>
        </div>
      </motion.div>
    </section>
  );
};

export default AppsSection;
