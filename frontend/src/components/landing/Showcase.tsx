import React, { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bell, CalendarDays, Check, Clock, MessageCircle, PenLine, Send, Sparkles, UserCheck, type LucideIcon } from "lucide-react";
import { EASE, SectionHead, cx } from "./parts";

/**
 * "See it in motion": six highlights, each a small animated scene instead of
 * a paragraph, all in blue. The list is plain text -- the active line turns
 * dark and a hairline under it counts down; pointer or focus pauses.
 */

const DURATION = 5200;
const BLUES = ["bg-[#0071e3]", "bg-[#4da3ff]", "bg-[#a8d1ff]", "bg-[#0058b0]", "bg-[#77b9ff]", "bg-[#cfe5ff]"];

// ---- scenes ---------------------------------------------------------------

const TimetableScene: React.FC = () => (
  <div className="grid h-full grid-cols-5 content-center gap-2 p-6">
    {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
      <div key={d} className="pb-1 text-center text-xs font-semibold text-[var(--lp-muted)]">{d}</div>
    ))}
    {Array.from({ length: 20 }).map((_, i) => {
      const filled = (i * 7) % 5 !== 0;
      const now = i === 12;
      return (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: now ? [1, 1.06, 1] : 1 }}
          transition={{ delay: i * 0.04, duration: now ? 1.4 : 0.4, ease: EASE, repeat: now ? Infinity : 0, repeatDelay: 0.6 }}
          className={cx(
            "h-10 rounded-xl",
            filled ? BLUES[i % BLUES.length] : "bg-[var(--lp-hair)]",
            now && "ring-2 ring-[var(--lp-blue)] ring-offset-2 ring-offset-[var(--lp-card)]",
          )}
        />
      );
    })}
  </div>
);

const AiScene: React.FC = () => (
  <div className="flex h-full flex-col justify-center gap-3 p-7">
    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--lp-blue)]">
      <motion.span animate={{ rotate: [0, 18, -8, 0], scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 1.8 }}>
        <Sparkles className="h-5 w-5" strokeWidth={1.75} />
      </motion.span>
      Photosynthesis · Senior 2
    </div>
    {[92, 78, 86, 58, 70].map((w, i) => (
      <motion.div
        key={i}
        className="h-2.5 rounded-full bg-gradient-to-r from-[#0071e3] to-[#77b9ff]"
        initial={{ width: 0, opacity: 0.4 }}
        animate={{ width: `${w}%`, opacity: 1 }}
        transition={{ delay: 0.2 + i * 0.3, duration: 0.7, ease: EASE }}
      />
    ))}
    <div className="mt-3 flex gap-2">
      {["Slides", "Quiz", "Notes"].map((t, i) => (
        <motion.span
          key={t}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.9 + i * 0.15, duration: 0.5, ease: EASE }}
          className="rounded-full bg-[var(--lp-blue-soft)] px-3 py-1 text-xs font-semibold text-[var(--lp-blue)]"
        >
          {t}
        </motion.span>
      ))}
    </div>
  </div>
);

const AssessScene: React.FC = () => {
  const bars = [52, 78, 66, 92, 72, 86];
  return (
    <div className="flex h-full items-end gap-6 p-7">
      <div className="flex h-[85%] flex-1 items-end gap-2.5">
        {bars.map((h, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-t-lg bg-gradient-to-t from-[#0058b0] to-[#4da3ff]"
            initial={{ height: 0 }}
            animate={{ height: `${h}%` }}
            transition={{ delay: i * 0.1, duration: 0.8, ease: EASE }}
          />
        ))}
      </div>
      <div className="relative mb-3 h-24 w-24 shrink-0">
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" stroke="var(--lp-hair)" />
          <motion.circle
            cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" strokeLinecap="round" stroke="var(--lp-blue)"
            initial={{ pathLength: 0 }} animate={{ pathLength: 0.86 }} transition={{ duration: 1.3, delay: 0.4, ease: EASE }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xl font-semibold tracking-tight text-[var(--lp-text)]">86%</span>
      </div>
    </div>
  );
};

const AttendanceScene: React.FC = () => (
  <ul className="flex h-full flex-col justify-center gap-2.5 p-7">
    {[0, 1, 2, 3, 4].map((i) => {
      const late = i === 3;
      return (
        <motion.li
          key={i}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1, duration: 0.5, ease: EASE }}
          className="flex items-center gap-3 rounded-2xl bg-[var(--lp-alt)] px-3.5 py-2.5"
        >
          <span className="h-7 w-7 rounded-full bg-[var(--lp-hair)]" />
          <span className="h-2 flex-1 rounded-full bg-[var(--lp-hair)]" style={{ maxWidth: `${48 + ((i * 13) % 34)}%` }} />
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.8 + i * 0.28, type: "spring", stiffness: 400, damping: 20 }}
            className={cx(
              "flex h-7 w-7 items-center justify-center rounded-full",
              late ? "bg-[var(--lp-blue-soft)] text-[var(--lp-blue)]" : "bg-[var(--lp-blue)] text-white",
            )}
          >
            {late ? <Clock className="h-4 w-4" strokeWidth={2} /> : <Check className="h-4 w-4" strokeWidth={2.5} />}
          </motion.span>
        </motion.li>
      );
    })}
  </ul>
);

const ChatScene: React.FC = () => {
  const msgs = [
    { me: false, w: "68%" },
    { me: true, w: "52%" },
    { me: false, w: "60%" },
    { me: true, w: "38%" },
  ];
  return (
    <div className="flex h-full flex-col justify-end gap-2 p-7">
      {msgs.map((m, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.3 + i * 0.55, duration: 0.5, ease: EASE }}
          className={cx("h-9 rounded-[18px]", m.me ? "self-end rounded-br-md bg-[#0a84ff]" : "self-start rounded-bl-md bg-[var(--lp-seg)]")}
          style={{ width: m.w }}
        />
      ))}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ delay: 2.6, duration: 2.2, repeat: Infinity }}
        className="flex w-16 gap-1 self-start rounded-[18px] bg-[var(--lp-seg)] px-3.5 py-3"
      >
        {[0, 1, 2].map((d) => (
          <motion.span key={d} className="h-2 w-2 rounded-full bg-[var(--lp-muted)]" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: d * 0.18 }} />
        ))}
      </motion.div>
    </div>
  );
};

const RemindersScene: React.FC = () => {
  const notes: LucideIcon[] = [Bell, Send, CalendarDays];
  return (
    <div className="flex h-full items-center justify-center p-5">
      <div className="relative h-full w-44 rounded-[2rem] bg-[var(--lp-text)] p-1.5 shadow-xl">
        <div className="h-full rounded-[1.6rem] bg-gradient-to-b from-[#cfe5ff] to-[#4da3ff] p-2.5 pt-7">
          <div className="absolute left-1/2 top-3 h-4 w-14 -translate-x-1/2 rounded-full bg-[var(--lp-text)]" />
          {notes.map((Icon, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: -24, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.3 + i * 0.65, duration: 0.6, ease: EASE }}
              className="mb-1.5 flex items-center gap-2 rounded-2xl bg-white/85 p-2 shadow-sm backdrop-blur"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#0071e3] text-white">
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
              </span>
              <span className="flex-1 space-y-1">
                <span className="block h-1.5 w-full rounded-full bg-slate-400/60" />
                <span className="block h-1.5 w-2/3 rounded-full bg-slate-300/70" />
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

const SCENES: Array<{ key: string; label: string; app: string; icon: LucideIcon; Scene: React.FC }> = [
  { key: "timetable", label: "Timetable", app: "Central MIS", icon: CalendarDays, Scene: TimetableScene },
  { key: "ai", label: "AI lessons", app: "Central MIS", icon: Sparkles, Scene: AiScene },
  { key: "assess", label: "Assessments", app: "Task Mentor", icon: PenLine, Scene: AssessScene },
  { key: "attendance", label: "Attendance", app: "Tendo", icon: UserCheck, Scene: AttendanceScene },
  { key: "chat", label: "Messages", app: "Tupo", icon: MessageCircle, Scene: ChatScene },
  { key: "reminders", label: "Reminders", app: "Everywhere", icon: Bell, Scene: RemindersScene },
];

const Showcase: React.FC = () => {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const auto = !reduced && !paused;

  useEffect(() => {
    if (!auto) return;
    const t = window.setTimeout(() => setActive((a) => (a + 1) % SCENES.length), DURATION);
    return () => window.clearTimeout(t);
  }, [active, auto]);

  const { Scene, label, app, icon: Icon } = SCENES[active];
  return (
    <section id="features" className="scroll-mt-16 bg-[var(--lp-bg)] px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow="Features" title="See it in motion." sub="The everyday work of a school, made simple." />
        <div className="mt-14 grid items-center gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
          <div
            role="tablist"
            aria-label="Features"
            className="flex gap-1 overflow-x-auto [scrollbar-width:none] lg:flex-col lg:gap-0"
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            {SCENES.map((s, i) => {
              const on = i === active;
              return (
                <button
                  key={s.key}
                  role="tab"
                  aria-selected={on}
                  aria-controls="showcase-stage"
                  onClick={() => setActive(i)}
                  className="relative shrink-0 px-3 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-blue)] lg:px-0 lg:py-4"
                >
                  <span className={cx("block text-lg font-semibold tracking-tight transition-colors duration-300 lg:text-2xl", on ? "text-[var(--lp-text)]" : "text-[var(--lp-muted)]/70 hover:text-[var(--lp-muted)]")}>
                    {s.label}
                  </span>
                  <span className={cx("hidden text-sm transition-colors lg:block", on ? "text-[var(--lp-muted)]" : "text-transparent")}>{s.app}</span>
                  <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-[var(--lp-hair)] lg:left-0 lg:right-auto lg:w-40" aria-hidden />
                  {on && (
                    <motion.span
                      key={`${s.key}-${active}-${auto}`}
                      className="absolute bottom-0 left-3 right-3 h-[2px] origin-left rounded-full bg-[var(--lp-blue)] lg:left-0 lg:right-auto lg:w-40"
                      initial={{ scaleX: auto ? 0 : 1 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: auto ? DURATION / 1000 : 0, ease: "linear" }}
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div id="showcase-stage" role="tabpanel" aria-label={label} className="overflow-hidden rounded-[28px] bg-[var(--lp-card)] shadow-[0_20px_60px_rgba(0,0,0,0.08)] ring-1 ring-[var(--lp-hair)]">
            <div className="flex items-center gap-2 border-b border-[var(--lp-hair)] px-5 py-3.5">
              <span className="flex gap-1.5" aria-hidden>
                <span className="h-3 w-3 rounded-full bg-[var(--lp-seg)]" />
                <span className="h-3 w-3 rounded-full bg-[var(--lp-seg)]" />
                <span className="h-3 w-3 rounded-full bg-[var(--lp-seg)]" />
              </span>
              <span className="ml-3 flex items-center gap-1.5 text-xs font-medium text-[var(--lp-muted)]">
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                {app}
              </span>
            </div>
            <div className="h-80 sm:h-96">
              <AnimatePresence mode="wait">
                <motion.div
                  key={SCENES[active].key}
                  className="h-full"
                  initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.2 } }}
                  transition={{ duration: 0.5, ease: EASE }}
                >
                  <Scene />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Showcase;
