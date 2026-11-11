import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { APPS, type AppInfo, type Feature } from "./content";
import { EASE, SectionHead, cx, linkChevron } from "./parts";
import { LiveContext, LiveDot, WIDGETS } from "./widgets";

/**
 * "One sign-in. Every activity." -- a module explorer. A pill segmented
 * control picks the app (apps take turns on their own; pointer or focus stops
 * that), and the app's features appear as live widgets: small pieces of
 * working UI -- a lesson in progress, submissions arriving, ticks landing on
 * a register, messages coming in -- instead of sentences.
 */

const TURN_MS = 9000;

/** Grid spans: the first widget is wide; the last one stretches to close its row. */
function spanClasses(i: number, n: number): string {
  if (i === 0) return "sm:col-span-2";
  if (i !== n - 1) return "";
  const cells = n + 1; // the wide one takes two
  const two = cells % 2 !== 0; // 2 columns: an odd count leaves a gap
  const r3 = cells % 3;
  const three = r3 === 0 ? 1 : 1 + (3 - r3);
  // literal class names, so Tailwind generates them
  const lg = three === 3 ? "lg:col-span-3" : three === 2 ? "lg:col-span-2" : two ? "lg:col-span-1" : "";
  return cx(two && "sm:col-span-2", lg);
}

const WidgetTile: React.FC<{ f: Feature; index: number; n: number }> = ({ f, index, n }) => {
  const reduced = useReducedMotion();
  const Widget = WIDGETS[f.label];
  const Icon = f.icon;
  const wide = index === 0;
  return (
    <motion.li
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ duration: 0.6, delay: reduced ? 0 : 0.06 + index * 0.05, ease: EASE }}
      className={cx(
        "group relative flex h-60 w-[80%] shrink-0 snap-center flex-col rounded-[22px] sm:w-auto bg-[var(--lp-card)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-[var(--lp-hair)] transition-shadow duration-300 hover:shadow-[0_16px_40px_rgba(0,0,0,0.10)]",
        spanClasses(index, n),
      )}
    >
      <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--lp-text)]">
        <Icon className="h-4 w-4 text-[var(--lp-blue)]" strokeWidth={2} aria-hidden />
        {f.label}
      </div>
      <div className="mt-3 min-h-0 flex-1" aria-hidden>
        {Widget ? <Widget /> : null}
      </div>
      {f.hint && !wide && <p className="mt-2 truncate text-xs text-[var(--lp-muted)]">{f.hint}</p>}
      {f.hint && <span className="sr-only">{f.hint}</span>}
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
            <div role="tablist" aria-label="Apps" onKeyDown={onKey} className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-[var(--lp-seg)] p-1 [scrollbar-width:none]">
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
                      <motion.span layoutId="apps-seg-thumb" className="absolute inset-0 rounded-full bg-[var(--lp-card)] shadow-[0_2px_8px_rgba(0,0,0,0.12)]" transition={{ type: "spring", stiffness: 420, damping: 36 }} aria-hidden />
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
          <LiveContext.Provider value={inView && !reduced}>
            <div id="apps-stage" role="tabpanel" aria-labelledby={`apps-tab-${app.key}`} className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,9fr)] lg:gap-10">
              <AnimatePresence mode="wait">
                <motion.div
                  key={app.key}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.6, ease: EASE }}
                  className="flex items-center gap-5 lg:sticky lg:top-24 lg:flex-col lg:items-start lg:self-start lg:pt-2"
                >
                  <span className={cx("flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br text-white shadow-[0_10px_30px_rgba(0,113,227,0.25)] lg:h-20 lg:w-20 lg:rounded-[24px]", app.grad)}>
                    <AppIcon className="h-8 w-8 lg:h-10 lg:w-10" strokeWidth={1.75} aria-hidden />
                  </span>
                  <div>
                    <span className="mb-2 hidden items-center gap-1.5 text-xs font-semibold text-[var(--lp-blue)] lg:inline-flex">
                      <LiveDot /> Live preview
                    </span>
                    <h3 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--lp-text)] lg:text-4xl">{app.name}</h3>
                    <p className="mt-1 text-lg text-[var(--lp-muted)]">{app.tagline}.</p>
                    <p className="mt-5 hidden text-sm text-[var(--lp-muted)] lg:block">
                      <span className="text-3xl font-semibold tabular-nums tracking-tight text-[var(--lp-text)]">{app.features.length}</span> features, all live
                    </p>
                    <Link to="/register" className={cx(linkChevron, "mt-5 hidden lg:inline-flex")}>
                      Get {app.name}
                      <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* phones: a swipe row of widgets; wider: a bento grid */}
              <ul className="-mx-4 flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {app.features.map((f, i) => (
                    <WidgetTile key={`${app.key}-${f.label}`} f={f} index={i} n={app.features.length} />
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          </LiveContext.Provider>
        </div>
      </motion.div>
    </section>
  );
};

export default AppsSection;
