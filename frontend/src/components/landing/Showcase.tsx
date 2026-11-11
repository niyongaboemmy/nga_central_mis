import React, { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bell, CalendarDays, Check, Clock, MessageCircle, PenLine, Send, Sparkles, UserCheck, type LucideIcon } from "lucide-react";
import { SectionTitle, cx } from "./parts";

/**
 * "See it move": six highlights, each a tiny animated scene instead of a
 * paragraph. Auto-advances; pointer or focus on the list pauses it.
 */

const DURATION = 5200;

// ---- scenes ---------------------------------------------------------------

const COLORS = ["bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-400", "bg-rose-500", "bg-cyan-500"];

const TimetableScene: React.FC = () => (
  <div className="grid h-full grid-cols-5 gap-1.5 p-4">
    {["M", "T", "W", "T", "F"].map((d, i) => (
      <div key={i} className="text-center text-[11px] font-bold text-slate-400">{d}</div>
    ))}
    {Array.from({ length: 20 }).map((_, i) => {
      const filled = (i * 7) % 5 !== 0;
      const now = i === 12;
      return (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: now ? [1, 1.08, 1] : 1 }}
          transition={{ delay: i * 0.05, duration: now ? 1.2 : 0.3, repeat: now ? Infinity : 0, repeatDelay: 0.4 }}
          className={cx(
            "h-9 rounded-lg",
            filled ? COLORS[i % COLORS.length] : "border border-dashed border-slate-300 dark:border-white/15",
            filled && "opacity-90",
            now && "ring-2 ring-amber-300 ring-offset-2 ring-offset-white dark:ring-offset-slate-900",
          )}
        />
      );
    })}
  </div>
);

const AiScene: React.FC = () => (
  <div className="flex h-full flex-col gap-2.5 p-5">
    <div className="flex items-center gap-2 text-sm font-bold text-violet-600 dark:text-violet-300">
      <motion.span animate={{ rotate: [0, 20, -10, 0], scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.6 }}>
        <Sparkles className="h-5 w-5" />
      </motion.span>
      Photosynthesis · S2
    </div>
    {[92, 78, 85, 60].map((w, i) => (
      <motion.div
        key={i}
        className="h-3 rounded-full bg-gradient-to-r from-violet-400/80 to-fuchsia-400/60"
        initial={{ width: 0 }}
        animate={{ width: `${w}%` }}
        transition={{ delay: 0.2 + i * 0.35, duration: 0.6, ease: "easeOut" }}
      />
    ))}
    <div className="mt-auto flex gap-2">
      {["Slides", "Quiz", "Notes"].map((t, i) => (
        <motion.span
          key={t}
          initial={{ opacity: 0, y: 10, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 1.8 + i * 0.2, type: "spring", stiffness: 300, damping: 16 }}
          className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700 dark:bg-violet-500/20 dark:text-violet-200"
        >
          {t}
        </motion.span>
      ))}
    </div>
  </div>
);

const AssessScene: React.FC = () => {
  const bars = [55, 80, 68, 92, 74, 86];
  return (
    <div className="flex h-full items-end gap-5 p-5">
      <div className="flex h-full flex-1 items-end gap-2">
        {bars.map((h, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-t-lg bg-gradient-to-t from-fuchsia-600 to-violet-400"
            initial={{ height: 0 }}
            animate={{ height: `${h}%` }}
            transition={{ delay: i * 0.12, duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
          />
        ))}
      </div>
      <div className="relative mb-2 h-24 w-24 shrink-0">
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="4" className="stroke-slate-200 dark:stroke-white/10" />
          <motion.circle
            cx="18" cy="18" r="15.5" fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-violet-500"
            initial={{ pathLength: 0 }} animate={{ pathLength: 0.86 }} transition={{ duration: 1.2, delay: 0.4 }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-lg font-extrabold text-slate-800 dark:text-white">86%</span>
      </div>
    </div>
  );
};

const AttendanceScene: React.FC = () => (
  <ul className="flex h-full flex-col justify-center gap-2 p-5">
    {[0, 1, 2, 3, 4].map((i) => {
      const late = i === 3;
      return (
        <motion.li
          key={i}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.12 }}
          className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5"
        >
          <span className="h-7 w-7 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-700" />
          <span className="h-2.5 flex-1 rounded-full bg-slate-200 dark:bg-white/10" style={{ maxWidth: `${50 + ((i * 13) % 35)}%` }} />
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.25, 1] }}
            transition={{ delay: 0.8 + i * 0.3, duration: 0.35 }}
            className={cx("flex h-7 w-7 items-center justify-center rounded-full text-white", late ? "bg-amber-400" : "bg-emerald-500")}
          >
            {late ? <Clock className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          </motion.span>
        </motion.li>
      );
    })}
  </ul>
);

const ChatScene: React.FC = () => {
  const msgs = [
    { me: false, w: "70%" },
    { me: true, w: "55%" },
    { me: false, w: "62%" },
    { me: true, w: "40%" },
  ];
  return (
    <div className="flex h-full flex-col justify-end gap-2 p-5">
      {msgs.map((m, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 14, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.3 + i * 0.6, type: "spring", stiffness: 300, damping: 22 }}
          className={cx("h-9 rounded-2xl", m.me ? "self-end rounded-br-md bg-gradient-to-r from-amber-400 to-orange-500" : "self-start rounded-bl-md bg-slate-200 dark:bg-white/10")}
          style={{ width: m.w }}
        />
      ))}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ delay: 2.8, duration: 2, repeat: Infinity }}
        className="flex w-16 gap-1 self-start rounded-2xl bg-slate-200 px-3 py-3 dark:bg-white/10"
      >
        {[0, 1, 2].map((d) => (
          <motion.span key={d} className="h-2 w-2 rounded-full bg-slate-500" animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: d * 0.15 }} />
        ))}
      </motion.div>
    </div>
  );
};

const RemindersScene: React.FC = () => {
  const notes: Array<{ icon: LucideIcon; tint: string }> = [
    { icon: Bell, tint: "bg-brand-500" },
    { icon: Send, tint: "bg-sky-500" },
    { icon: CalendarDays, tint: "bg-emerald-500" },
  ];
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="relative h-full w-40 rounded-[1.6rem] border-4 border-slate-800 bg-slate-100 p-2 dark:border-slate-600 dark:bg-slate-950">
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-800 dark:bg-slate-600" />
        {notes.map((n, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: -30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.3 + i * 0.7, type: "spring", stiffness: 260, damping: 20 }}
            className="mb-1.5 flex items-center gap-2 rounded-xl bg-white p-2 shadow dark:bg-slate-800"
          >
            <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-white", n.tint)}>
              <n.icon className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1 space-y-1">
              <span className="block h-1.5 w-full rounded-full bg-slate-300 dark:bg-slate-600" />
              <span className="block h-1.5 w-2/3 rounded-full bg-slate-200 dark:bg-slate-700" />
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

const SCENES: Array<{ key: string; label: string; app: string; icon: LucideIcon; tint: string; Scene: React.FC }> = [
  { key: "timetable", label: "Timetable", app: "Central MIS", icon: CalendarDays, tint: "from-blue-500 to-indigo-600", Scene: TimetableScene },
  { key: "ai", label: "AI lessons", app: "Central MIS", icon: Sparkles, tint: "from-violet-500 to-fuchsia-600", Scene: AiScene },
  { key: "assess", label: "Assessments", app: "Task Mentor", icon: PenLine, tint: "from-fuchsia-500 to-violet-600", Scene: AssessScene },
  { key: "attendance", label: "Attendance", app: "Tendo", icon: UserCheck, tint: "from-emerald-500 to-teal-600", Scene: AttendanceScene },
  { key: "chat", label: "Messages", app: "Tupo", icon: MessageCircle, tint: "from-amber-400 to-orange-500", Scene: ChatScene },
  { key: "reminders", label: "Reminders", app: "Everywhere", icon: Bell, tint: "from-sky-500 to-blue-600", Scene: RemindersScene },
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

  const { Scene, label, app, icon: Icon, tint } = SCENES[active];
  return (
    <section id="features" className="scroll-mt-24 px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <SectionTitle kicker="Features" title="See it move." />
        <div className="mt-10 grid items-center gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div
            role="tablist"
            aria-label="Features"
            className="grid grid-cols-3 gap-2 lg:grid-cols-1"
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
                  className={cx(
                    "relative flex flex-col items-center gap-2 overflow-hidden rounded-2xl border p-3 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:flex-row lg:p-4 lg:text-left",
                    on ? "border-transparent bg-white shadow-lg dark:bg-slate-900" : "border-slate-200 bg-white/50 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
                  )}
                >
                  <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white bg-gradient-to-br", s.tint, !on && "opacity-60")}>
                    <s.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-900 dark:text-white lg:text-base">{s.label}</span>
                    <span className="hidden text-xs font-medium text-slate-500 dark:text-slate-400 lg:block">{s.app}</span>
                  </span>
                  {on && (
                    <motion.span
                      key={`${s.key}-${active}-${auto}`}
                      className={cx("absolute bottom-0 left-0 h-1 bg-gradient-to-r", s.tint)}
                      initial={{ width: auto ? "0%" : "100%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: auto ? DURATION / 1000 : 0, ease: "linear" }}
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div id="showcase-stage" role="tabpanel" aria-label={label} className="relative">
            <div className={cx("absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br opacity-25 blur-2xl transition-all duration-700", tint)} aria-hidden />
            <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/10">
                <span className="flex gap-1.5" aria-hidden>
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </span>
                <span className="ml-2 flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {app}
                </span>
              </div>
              <div className="h-72 sm:h-80">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={SCENES[active].key}
                    className="h-full"
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, y: -16 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Scene />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Showcase;
