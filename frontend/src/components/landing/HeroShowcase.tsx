import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bell, Building2, ClipboardCheck, LayoutGrid, MessageCircle, Search, UserCheck, Users } from "lucide-react";
import { APPS } from "./content";
import { EASE, cx } from "./parts";
import { LiveContext, WIDGETS, useTick } from "./widgets";

/**
 * The hero's product shot, built from live UI instead of a screenshot: the
 * Central MIS dashboard in a browser window, with the other apps' cards
 * floating around it (Task Mentor submissions, Tendo attendance, a Tupo
 * message) and a reminder that slides in now and then. `focus` (an app key)
 * rings that app's piece -- the hero's app chips drive it.
 */

const NowLesson = WIDGETS["Timetable & calendar"];
const Course = WIDGETS["E-learning"];
const Analytics = WIDGETS.Analytics;

/** Gentle float; each card on its own period so they never move together. */
const Float: React.FC<{ children: React.ReactNode; period: number; className?: string; style?: React.CSSProperties }> = ({ children, period, className, style }) => {
  const reduced = useReducedMotion();
  return (
    <motion.div className={className} style={style} animate={reduced ? undefined : { y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: period, ease: "easeInOut" }}>
      {children}
    </motion.div>
  );
};

/** A floating card from one app; ringed and lifted when its chip is in focus. */
const AppCard: React.FC<{ app: string; on: boolean; children: React.ReactNode; className?: string }> = ({ app, on, children, className }) => {
  const info = APPS.find((a) => a.key === app)!;
  const Icon = info.icon;
  return (
    <motion.div
      animate={{ scale: on ? 1.05 : 1, opacity: on ? 1 : 0.92 }}
      transition={{ duration: 0.45, ease: EASE }}
      className={cx(
        "rounded-[20px] bg-[var(--lp-glass)] p-3.5 shadow-[0_18px_50px_rgba(0,40,120,0.18)] backdrop-blur-xl transition-[box-shadow] duration-500",
        on ? "ring-2 ring-[var(--lp-blue)]" : "ring-1 ring-[var(--lp-hair)]",
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className={cx("flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br text-white", info.grad)}>
          <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </span>
        <span className="text-xs font-semibold text-[var(--lp-text)]">{info.name}</span>
      </div>
      {children}
    </motion.div>
  );
};

const TaskMentorCard: React.FC = () => {
  const t = useTick(600);
  const n = 18 + (t % 15);
  return (
    <>
      <p className="text-[22px] font-semibold leading-none tabular-nums tracking-tight text-[var(--lp-text)]">
        {n}
        <span className="text-xs font-medium text-[var(--lp-muted)]">/32 submitted</span>
      </p>
      <div className="mt-2 h-1.5 w-36 overflow-hidden rounded-full bg-[var(--lp-hair)]">
        <motion.div className="h-full rounded-full bg-[var(--lp-blue)]" animate={{ width: `${(n / 32) * 100}%` }} transition={{ duration: 0.4, ease: EASE }} />
      </div>
    </>
  );
};

const TendoCard: React.FC = () => {
  const t = useTick(900);
  const present = 26 + (t % 6);
  const share = present / 32;
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-11 w-11">
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" strokeWidth="4" stroke="var(--lp-hair)" />
          <motion.circle cx="18" cy="18" r="15" fill="none" strokeWidth="4" strokeLinecap="round" stroke="var(--lp-blue)" animate={{ pathLength: share }} transition={{ duration: 0.6, ease: EASE }} />
        </svg>
        <UserCheck className="absolute inset-0 m-auto h-4 w-4 text-[var(--lp-blue)]" />
      </div>
      <div>
        <p className="text-lg font-semibold leading-none tabular-nums text-[var(--lp-text)]">{present}</p>
        <p className="text-[11px] text-[var(--lp-muted)]">present · S3 B</p>
      </div>
    </div>
  );
};

const MESSAGES = ["Bus leaves at 8:00 tomorrow", "Report cards are ready", "Science fair: Friday 2 pm"];
const TupoCard: React.FC = () => {
  const t = useTick(3200);
  const msg = MESSAGES[t % MESSAGES.length];
  return (
    <div className="flex items-start gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#4da3ff] text-[10px] font-semibold text-white">MN</span>
      <AnimatePresence mode="wait">
        <motion.p
          key={msg}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="max-w-[11rem] rounded-2xl rounded-tl-md bg-[#0a84ff] px-3 py-2 text-xs leading-snug text-white"
        >
          {msg}
        </motion.p>
      </AnimatePresence>
    </div>
  );
};

/** A reminder sliding down over the window every few seconds. */
const Reminder: React.FC = () => {
  const t = useTick(2600);
  const show = t % 3 === 1;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="absolute left-4 top-12 z-20 flex w-60 items-center sm:left-16 gap-2.5 rounded-2xl bg-[var(--lp-glass)] p-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.18)] ring-1 ring-[var(--lp-hair)] backdrop-blur-xl"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--lp-blue)] text-white">
            <Bell className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-[var(--lp-text)]">Physics in 10 minutes</span>
            <span className="block text-[11px] text-[var(--lp-muted)]">Lab 2 · S4 A</span>
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const SIDEBAR = [Building2, LayoutGrid, ClipboardCheck, Users, MessageCircle];

const HeroShowcase: React.FC<{ focus: string; live: boolean }> = ({ focus, live }) => (
  <LiveContext.Provider value={live}>
    <div className="relative mx-auto w-full max-w-[560px] pb-14 pt-10 sm:pb-16 lg:pt-6" aria-hidden>
      {/* the Central MIS, in a window */}
      <motion.div
        animate={{ scale: focus === "mis" ? 1.015 : 1 }}
        transition={{ duration: 0.5, ease: EASE }}
        className={cx(
          "relative overflow-hidden rounded-[22px] bg-[var(--lp-card)] shadow-[0_30px_80px_rgba(0,40,120,0.22)] transition-[box-shadow]",
          focus === "mis" ? "ring-2 ring-[var(--lp-blue)]" : "ring-1 ring-[var(--lp-hair)]",
        )}
      >
        <div className="flex items-center gap-3 border-b border-[var(--lp-hair)] px-4 py-2.5">
          <span className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-2.5 w-2.5 rounded-full bg-[var(--lp-seg)]" />
            ))}
          </span>
          <span className="mx-auto flex items-center gap-1.5 rounded-md bg-[var(--lp-alt)] px-3 py-1 text-[11px] text-[var(--lp-muted)]">
            <Search className="h-3 w-3" /> yourschool.amashuri.com
          </span>
        </div>
        <div className="flex">
          <div className="hidden flex-col items-center gap-3 border-r border-[var(--lp-hair)] px-2.5 py-4 sm:flex">
            {SIDEBAR.map((Icon, i) => (
              <span key={i} className={cx("flex h-8 w-8 items-center justify-center rounded-lg", i === 0 ? "bg-[var(--lp-blue-soft)] text-[var(--lp-blue)]" : "text-[var(--lp-muted)]")}>
                <Icon className="h-4 w-4" strokeWidth={1.75} />
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1 p-4">
            <p className="text-sm font-semibold text-[var(--lp-text)]">Good morning, Grace</p>
            <p className="mb-3 text-[11px] text-[var(--lp-muted)]">Thursday · Term 1, week 6</p>
            <div className="h-[9.5rem]">
              <NowLesson />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="h-24 rounded-2xl bg-[var(--lp-alt)] p-3">
                <Course />
              </div>
              <div className="h-24 rounded-2xl bg-[var(--lp-alt)] p-3">
                <Analytics />
              </div>
            </div>
          </div>
        </div>
        <Reminder />
      </motion.div>

      {/* the other apps, floating */}
      <Float period={6} className="absolute -right-3 -top-6 sm:-right-12 sm:-top-8">
        <AppCard app="tm" on={focus === "tm"}>
          <TaskMentorCard />
        </AppCard>
      </Float>
      <Float period={7} className="absolute -right-2 -bottom-2 sm:-right-14 sm:-bottom-4">
        <AppCard app="tendo" on={focus === "tendo"}>
          <TendoCard />
        </AppCard>
      </Float>
      <Float period={6.5} className="absolute -left-3 -bottom-6 sm:-left-16 sm:bottom-[-1.5rem]">
        <AppCard app="tupo" on={focus === "tupo"}>
          <TupoCard />
        </AppCard>
      </Float>
    </div>
  </LiveContext.Provider>
);

export default HeroShowcase;
