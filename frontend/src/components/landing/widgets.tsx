import React, { createContext, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock, Heart, MapPin, Mic, RefreshCw, Shield, Sparkles, Terminal, Wifi, WifiOff } from "lucide-react";
import { EASE, cx } from "./parts";

/**
 * Live widgets for the module explorer: every feature is a small piece of
 * working UI (iOS-widget style) instead of a sentence. All blue. They only
 * move while their stage is on screen and motion is allowed (LiveContext),
 * driven by one shared clock per widget (useTick).
 */

export const LiveContext = createContext(false);

/** Counts up every `ms` while live; frozen otherwise. */
function useTick(ms: number): number {
  const live = useContext(LiveContext);
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setT((x) => x + 1), ms);
    return () => window.clearInterval(id);
  }, [ms, live]);
  return t;
}

const Blue = "var(--lp-blue)";

// ---- primitives -------------------------------------------------------------

const Ring: React.FC<{ value: number; size?: number; children?: React.ReactNode }> = ({ value, size = 64, children }) => (
  <div className="relative shrink-0" style={{ width: size, height: size }}>
    <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
      <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3.5" stroke="var(--lp-hair)" />
      <motion.circle cx="18" cy="18" r="15" fill="none" strokeWidth="3.5" strokeLinecap="round" stroke={Blue} animate={{ pathLength: value }} transition={{ duration: 0.9, ease: EASE }} />
    </svg>
    <div className="absolute inset-0 flex items-center justify-center">{children}</div>
  </div>
);

const Avatar: React.FC<{ i: number; className?: string; bare?: boolean }> = ({ i, className, bare }) => {
  const shades = ["#0071e3", "#4da3ff", "#0058b0", "#77b9ff", "#2997ff", "#a8d1ff"];
  const initials = ["AK", "JM", "EU", "GN", "PI", "SB", "DM", "RN"];
  return (
    <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-[var(--lp-card)]", className)} style={{ background: shades[i % shades.length] }}>
      {bare ? null : initials[i % initials.length]}
    </span>
  );
};

const Pill: React.FC<{ children: React.ReactNode; strong?: boolean }> = ({ children, strong }) => (
  <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", strong ? "bg-[var(--lp-blue)] text-white" : "bg-[var(--lp-blue-soft)] text-[var(--lp-blue)]")}>{children}</span>
);

export const LiveDot: React.FC = () => (
  <span className="relative flex h-2 w-2">
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--lp-blue)] opacity-60" />
    <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--lp-blue)]" />
  </span>
);

// ---- Central MIS -------------------------------------------------------------

const LESSONS = [
  { s: "Mathematics", c: "S3 B", r: "Room 12", t: "10:20" },
  { s: "Physics", c: "S4 A", r: "Lab 2", t: "11:00" },
  { s: "English", c: "S2 C", r: "Room 5", t: "11:40" },
  { s: "ICT", c: "S5 A", r: "Lab 1", t: "13:20" },
];

const NowLesson: React.FC = () => {
  const t = useTick(140);
  const cycle = Math.floor(t / 70) % LESSONS.length;
  const progress = (t % 70) / 70;
  const now = LESSONS[cycle];
  const next = [1, 2].map((k) => LESSONS[(cycle + k) % LESSONS.length]);
  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <AnimatePresence mode="wait">
        <motion.div key={cycle} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4, ease: EASE }} className="rounded-2xl bg-[var(--lp-blue)] p-3.5 text-white">
          <div className="flex items-center justify-between text-[11px] font-semibold opacity-90">
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-white" /> Now · {now.t}</span>
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{now.r}</span>
          </div>
          <p className="mt-1 text-xl font-semibold tracking-tight">{now.s}</p>
          <p className="text-xs opacity-80">{now.c}</p>
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white transition-[width] duration-150 ease-linear" style={{ width: `${progress * 100}%` }} />
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="flex gap-2">
        {next.map((l) => (
          <div key={l.s + cycle} className="flex-1 rounded-xl bg-[var(--lp-alt)] px-2.5 py-2">
            <p className="text-[10px] font-semibold text-[var(--lp-muted)]">{l.t}</p>
            <p className="truncate text-xs font-semibold text-[var(--lp-text)]">{l.s}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const CourseProgress: React.FC = () => {
  const t = useTick(900);
  const v = 0.42 + ((t % 6) / 6) * 0.5;
  return (
    <div className="flex h-full items-center gap-3">
      <Ring value={v}>
        <span className="text-sm font-semibold tabular-nums text-[var(--lp-text)]">{Math.round(v * 100)}%</span>
      </Ring>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--lp-text)]">Biology · S2</p>
        <p className="text-xs text-[var(--lp-muted)]">Week {3 + (t % 6)} of 12</p>
      </div>
    </div>
  );
};

const AiWriter: React.FC = () => {
  const t = useTick(380);
  const step = t % 9;
  const widths = [88, 72, 80, 55];
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      {widths.map((w, i) => (
        <div key={i} className="h-2 overflow-hidden rounded-full bg-[var(--lp-hair)]">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-[#0071e3] to-[#77b9ff]" animate={{ width: step > i ? `${w}%` : "0%" }} transition={{ duration: 0.5, ease: EASE }} />
        </div>
      ))}
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--lp-blue)]">
        <motion.span animate={{ rotate: [0, 20, -10, 0] }} transition={{ repeat: Infinity, duration: 1.6 }}><Sparkles className="h-3.5 w-3.5" /></motion.span>
        {step > 4 ? "Lesson ready" : "Drafting…"}
      </div>
    </div>
  );
};

const Competency: React.FC = () => {
  const t = useTick(1400);
  const skills = ["Think", "Solve", "Create", "Share"];
  return (
    <div className="flex h-full flex-col justify-center gap-1.5">
      {skills.map((s, i) => {
        const level = 1 + ((t + i * 2) % 4);
        return (
          <div key={s} className="flex items-center gap-2">
            <span className="w-11 text-[11px] font-medium text-[var(--lp-muted)]">{s}</span>
            <div className="flex flex-1 gap-1">
              {[0, 1, 2, 3].map((k) => (
                <motion.span key={k} className="h-2 flex-1 rounded-full" animate={{ background: k < level ? "#0071e3" : "rgba(127,127,127,0.18)" }} transition={{ duration: 0.4 }} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const Mentorship: React.FC = () => {
  const t = useTick(1600);
  const done = t % 2 === 1;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <div className="flex items-center gap-2">
        <Avatar i={0} className="h-9 w-9 text-xs" />
        <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} className="text-[var(--lp-blue)]">
          <Heart className="h-4 w-4 fill-current" />
        </motion.span>
        <Avatar i={3} className="h-9 w-9 text-xs" />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={String(done)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          {done ? <Pill strong><Check className="h-3 w-3" /> Check-in done</Pill> : <Pill>Weekly check-in</Pill>}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

const Safeguarding: React.FC = () => (
  <div className="flex h-full items-center gap-3">
    <div className="relative flex h-12 w-12 items-center justify-center">
      <motion.span className="absolute inset-0 rounded-full bg-[var(--lp-blue)]/20" animate={{ scale: [1, 1.5], opacity: [0.6, 0] }} transition={{ repeat: Infinity, duration: 2 }} />
      <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[var(--lp-blue-soft)] text-[var(--lp-blue)]">
        <Shield className="h-6 w-6" strokeWidth={1.75} />
      </span>
    </div>
    <div>
      <p className="text-lg font-semibold tracking-tight text-[var(--lp-text)]">All clear</p>
      <p className="text-xs text-[var(--lp-muted)]">0 open concerns</p>
    </div>
  </div>
);

const OfficeHours: React.FC = () => {
  const t = useTick(1300);
  const slots = ["14:00", "14:20", "14:40"];
  const booked = t % 4;
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <div className="flex gap-1.5">
        {slots.map((s, i) => {
          const on = i < booked;
          return (
            <motion.span key={s} animate={{ scale: i === booked - 1 ? [1, 1.1, 1] : 1 }} className={cx("flex-1 rounded-lg py-1.5 text-center text-[11px] font-semibold transition-colors", on ? "bg-[var(--lp-blue)] text-white" : "bg-[var(--lp-alt)] text-[var(--lp-muted)]")}>
              {s}
            </motion.span>
          );
        })}
      </div>
      <p className="text-xs text-[var(--lp-muted)]">{booked} of 3 booked · Thu</p>
    </div>
  );
};

const Sparkline: React.FC = () => {
  const t = useTick(1000);
  const pts = Array.from({ length: 12 }, (_, i) => 40 + 22 * Math.sin((i + t) / 2) + 10 * Math.cos((i * 3 + t) / 3));
  const path = pts.map((y, i) => `${i === 0 ? "M" : "L"}${(i / 11) * 100},${100 - y}`).join(" ");
  return (
    <div className="flex h-full flex-col justify-end gap-1">
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-semibold tabular-nums tracking-tight text-[var(--lp-text)]">{(1240 + (t % 9) * 13).toLocaleString()}</span>
        <span className="text-[11px] font-semibold text-[var(--lp-blue)]">active today</span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-12 w-full overflow-visible">
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0071e3" stopOpacity="0.25" />
            <stop offset="1" stopColor="#0071e3" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L100,100 L0,100 Z`} fill="url(#spark-fill)" style={{ transition: "d 0.9s ease" }} />
        <path d={path} fill="none" stroke={Blue} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={{ transition: "d 0.9s ease" }} />
      </svg>
    </div>
  );
};

// ---- Task Mentor -------------------------------------------------------------

const Submissions: React.FC = () => {
  const t = useTick(450);
  const total = 32;
  const n = 18 + (t % (total - 17));
  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[var(--lp-muted)]">Chemistry quiz · S4 A</p>
          <p className="mt-0.5 text-3xl font-semibold tabular-nums tracking-tight text-[var(--lp-text)]">
            {n}
            <span className="text-base font-medium text-[var(--lp-muted)]">/{total} submitted</span>
          </p>
        </div>
        <Pill><Clock className="h-3 w-3" /> 12 min left</Pill>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--lp-hair)]">
        <motion.div className="h-full rounded-full bg-[var(--lp-blue)]" animate={{ width: `${(n / total) * 100}%` }} transition={{ duration: 0.4, ease: EASE }} />
      </div>
      <div className="flex -space-x-2">
        <AnimatePresence initial={false}>
          {Array.from({ length: Math.min(7, n - 17) }).map((_, i) => (
            <motion.span key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 400, damping: 22 }}>
              <Avatar i={i} bare />
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

const AiQuestions: React.FC = () => {
  const t = useTick(700);
  const n = (t % 12) + 1;
  return (
    <div className="flex h-full items-center gap-4">
      <div className="relative h-14 w-12">
        {[2, 1, 0].map((k) => (
          <motion.div key={k} className="absolute inset-0 rounded-lg border border-[var(--lp-hair)] bg-[var(--lp-card)] shadow-sm" animate={{ rotate: (k - 1) * 8 + (k === 0 ? Math.sin(t) * 3 : 0), x: (k - 1) * 4 }} transition={{ duration: 0.5 }}>
            {k === 0 && (
              <div className="space-y-1 p-1.5">
                <div className="h-1 w-full rounded bg-[var(--lp-blue)]/60" />
                <div className="h-1 w-2/3 rounded bg-[var(--lp-hair)]" />
                <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--lp-blue)]" />
              </div>
            )}
          </motion.div>
        ))}
      </div>
      <div>
        <p className="text-2xl font-semibold tabular-nums tracking-tight text-[var(--lp-text)]">{n}</p>
        <p className="text-xs text-[var(--lp-muted)]">questions generated</p>
      </div>
    </div>
  );
};

const CodeRunner: React.FC = () => {
  const t = useTick(600);
  const step = t % 8;
  const lines = [
    { s: "$ run main.py", c: "text-[var(--lp-muted)]" },
    { s: "Running 5 tests…", c: "text-[var(--lp-text)]" },
    { s: "✓ 5/5 passed · 0.21s", c: "text-[var(--lp-blue)] font-semibold" },
  ];
  return (
    <div className="flex h-full flex-col justify-center gap-1 rounded-xl bg-[var(--lp-alt)] p-3 font-mono text-[11px]">
      <div className="mb-1 flex items-center gap-1 text-[var(--lp-muted)]"><Terminal className="h-3 w-3" /> terminal</div>
      {lines.map((l, i) => (
        <motion.p key={i} className={l.c} animate={{ opacity: step > i * 2 ? 1 : 0, x: step > i * 2 ? 0 : -6 }} transition={{ duration: 0.3 }}>
          {l.s}
        </motion.p>
      ))}
    </div>
  );
};

const CodeEditor: React.FC = () => {
  const t = useTick(500);
  const rows = [
    [18, 30],
    [10, 22, 26],
    [10, 40],
    [18, 14],
  ];
  return (
    <div className="flex h-full flex-col justify-center gap-1.5 rounded-xl bg-[#0d1b2e] p-3">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-3 text-[9px] text-white/30">{i + 1}</span>
          {r.map((w, k) => (
            <span key={k} className="h-1.5 rounded-full" style={{ width: `${w}%`, background: ["#4da3ff", "#a8d1ff", "#2997ff"][(i + k) % 3] }} />
          ))}
          {i === t % rows.length && <motion.span className="h-3 w-px bg-white" animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 0.8 }} />}
        </div>
      ))}
    </div>
  );
};

const PaperSheets: React.FC = () => {
  const t = useTick(220);
  const filled = t % 21;
  return (
    <div className="flex h-full items-center gap-3">
      <div className="grid grid-cols-4 gap-1.5 rounded-lg border border-[var(--lp-hair)] bg-[var(--lp-card)] p-2">
        {Array.from({ length: 20 }).map((_, i) => {
          const answer = (i * 7) % 4 === i % 4;
          return <span key={i} className={cx("h-2.5 w-2.5 rounded-full border transition-colors duration-200", i < filled && answer ? "border-transparent bg-[var(--lp-blue)]" : "border-[var(--lp-hair)]")} />;
        })}
      </div>
      <div>
        <p className="text-lg font-semibold tabular-nums text-[var(--lp-text)]">{Math.min(filled, 20)}/20</p>
        <p className="text-xs text-[var(--lp-muted)]">auto-marked</p>
      </div>
    </div>
  );
};

const Proctoring: React.FC = () => (
  <div className="flex h-full items-center gap-3">
    <div className="relative h-16 w-20 overflow-hidden rounded-xl bg-gradient-to-b from-[#1b2a44] to-[#0d1b2e]">
      <div className="absolute left-1/2 top-3 h-5 w-5 -translate-x-1/2 rounded-full bg-[#77b9ff]/70" />
      <div className="absolute bottom-0 left-1/2 h-6 w-12 -translate-x-1/2 rounded-t-full bg-[#77b9ff]/50" />
      <div className="absolute inset-x-4 top-1.5 bottom-3 rounded-md border border-[#4da3ff]" />
      <motion.div className="absolute inset-x-0 h-px bg-[#4da3ff]" animate={{ top: ["10%", "90%", "10%"] }} transition={{ repeat: Infinity, duration: 2.6, ease: "easeInOut" }} />
    </div>
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--lp-text)]"><LiveDot /> Focused</div>
      <p className="text-xs text-[var(--lp-muted)]">1 face · full screen</p>
    </div>
  </div>
);

const Rankings: React.FC = () => {
  const t = useTick(1800);
  const order =
    t % 2 === 0
      ? [{ n: "Aline", s: 94 }, { n: "Jean", s: 91 }, { n: "Eric", s: 88 }]
      : [{ n: "Jean", s: 96 }, { n: "Aline", s: 94 }, { n: "Eric", s: 88 }];
  return (
    <ul className="flex h-full flex-col justify-center gap-1.5">
      {order.map((r, i) => (
        <motion.li layout key={r.n} transition={{ type: "spring", stiffness: 300, damping: 28 }} className="flex items-center gap-2 rounded-lg bg-[var(--lp-alt)] px-2 py-1.5">
          <span className={cx("flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold", i === 0 ? "bg-[var(--lp-blue)] text-white" : "text-[var(--lp-muted)]")}>{i + 1}</span>
          <span className="flex-1 text-xs font-semibold text-[var(--lp-text)]">{r.n}</span>
          <span className="text-xs font-semibold tabular-nums text-[var(--lp-muted)]">{r.s}</span>
        </motion.li>
      ))}
    </ul>
  );
};

// ---- Tendo ---------------------------------------------------------------------

const Register: React.FC = () => {
  const t = useTick(380);
  const n = t % 12;
  const names = ["Aline K.", "Jean M.", "Eric U.", "Grace N.", "Patrick I."];
  const present = Math.min(n, names.length);
  return (
    <div className="flex h-full gap-4">
      <ul className="flex flex-1 flex-col justify-center gap-1.5">
        {names.map((nm, i) => {
          const late = i === 3;
          const on = i < present;
          return (
            <li key={nm} className="flex items-center gap-2">
              <Avatar i={i} className="h-6 w-6 text-[9px]" />
              <span className="flex-1 truncate text-xs font-medium text-[var(--lp-text)]">{nm}</span>
              <motion.span animate={{ scale: on ? 1 : 0 }} transition={{ type: "spring", stiffness: 500, damping: 22 }} className={cx("flex h-5 w-5 items-center justify-center rounded-full", late ? "bg-[var(--lp-blue-soft)] text-[var(--lp-blue)]" : "bg-[var(--lp-blue)] text-white")}>
                {late ? <Clock className="h-3 w-3" /> : <Check className="h-3 w-3" strokeWidth={3} />}
              </motion.span>
            </li>
          );
        })}
      </ul>
      <div className="hidden w-24 flex-col items-center justify-center sm:flex">
        <Ring value={present / names.length} size={72}>
          <span className="text-center leading-none">
            <span className="block text-lg font-semibold tabular-nums text-[var(--lp-text)]">{present ? 26 + present : 0}</span>
            <span className="text-[9px] text-[var(--lp-muted)]">present</span>
          </span>
        </Ring>
      </div>
    </div>
  );
};

const Offline: React.FC = () => {
  const t = useTick(1200);
  const phase = t % 4; // 0,1 offline queueing · 2 syncing · 3 synced
  return (
    <div className="flex h-full items-center gap-3">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--lp-blue-soft)] text-[var(--lp-blue)]">
        {phase < 2 ? <WifiOff className="h-5 w-5" /> : phase === 2 ? <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}><RefreshCw className="h-5 w-5" /></motion.span> : <Wifi className="h-5 w-5" />}
      </span>
      <div>
        <p className="text-sm font-semibold text-[var(--lp-text)]">{phase < 2 ? `${phase + 2} registers queued` : phase === 2 ? "Syncing…" : "All synced"}</p>
        <p className="text-xs text-[var(--lp-muted)]">{phase < 2 ? "No signal" : "Back online"}</p>
      </div>
    </div>
  );
};

const Rfid: React.FC = () => {
  const t = useTick(1500);
  const time = `07:${String(38 + (t % 10)).padStart(2, "0")}`;
  return (
    <div className="flex h-full items-center gap-3">
      <div className="relative flex h-14 w-14 items-center justify-center">
        <motion.span key={t} className="absolute inset-0 rounded-full border-2 border-[var(--lp-blue)]" initial={{ scale: 0.4, opacity: 0.8 }} animate={{ scale: 1.2, opacity: 0 }} transition={{ duration: 1.2 }} />
        <motion.span key={`c${t}`} initial={{ y: -8, rotate: -12 }} animate={{ y: 0, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 14 }} className="relative h-9 w-12 rounded-md bg-gradient-to-br from-[#0071e3] to-[#4da3ff] shadow-lg">
          <span className="absolute left-1.5 top-1.5 h-2 w-3 rounded-sm bg-white/70" />
        </motion.span>
      </div>
      <div>
        <p className="text-sm font-semibold text-[var(--lp-text)]">Checked in</p>
        <p className="text-xs tabular-nums text-[var(--lp-muted)]">Main gate · {time}</p>
      </div>
    </div>
  );
};

const Discipline: React.FC = () => {
  const t = useTick(1100);
  const items = ["Late arrival", "Uniform", "Commendation"];
  const shown = (t % (items.length + 1)) + 0;
  return (
    <ul className="relative flex h-full flex-col justify-center gap-2 pl-4">
      <span className="absolute bottom-3 left-[5px] top-3 w-px bg-[var(--lp-hair)]" />
      {items.map((it, i) => (
        <motion.li key={it} className="relative flex items-center gap-2 text-xs font-medium text-[var(--lp-text)]" animate={{ opacity: i < shown ? 1 : 0.25 }}>
          <span className={cx("absolute -left-4 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--lp-card)]", i < shown ? "bg-[var(--lp-blue)]" : "bg-[var(--lp-hair)]")} />
          {it}
        </motion.li>
      ))}
    </ul>
  );
};

const DaySchedule: React.FC = () => {
  const t = useTick(120);
  const pos = (t % 100) / 100;
  const blocks = ["Assembly", "Maths", "Break", "Physics"];
  return (
    <div className="relative flex h-full flex-col justify-center gap-1.5">
      {blocks.map((b, i) => (
        <div key={b} className={cx("rounded-md px-2 py-1 text-[11px] font-semibold", i === 2 ? "bg-[var(--lp-alt)] text-[var(--lp-muted)]" : "bg-[var(--lp-blue-soft)] text-[var(--lp-blue)]")}>
          {b}
        </div>
      ))}
      <div className="pointer-events-none absolute inset-x-0 h-px bg-[var(--lp-blue)]" style={{ top: `${8 + pos * 84}%` }}>
        <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-[var(--lp-blue)]" />
      </div>
    </div>
  );
};

// ---- Tupo ------------------------------------------------------------------------

const Chat: React.FC = () => {
  const t = useTick(1100);
  const all = [
    { me: false, txt: "Is the trip still on Friday?" },
    { me: true, txt: "Yes! Bus leaves at 8:00" },
    { me: false, txt: "Great, thanks 🙌" },
    { me: true, txt: "Bring your permission slip" },
  ];
  const n = t % (all.length + 2);
  const visible = all.slice(Math.max(0, Math.min(n, all.length) - 3), Math.min(n, all.length));
  return (
    <div className="flex h-full flex-col justify-end gap-1.5 overflow-hidden">
      <AnimatePresence initial={false}>
        {visible.map((m) => (
          <motion.div
            layout
            key={m.txt}
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease: EASE }}
            className={cx("max-w-[80%] rounded-[16px] px-3 py-1.5 text-xs", m.me ? "self-end rounded-br-md bg-[#0a84ff] text-white" : "self-start rounded-bl-md bg-[var(--lp-seg)] text-[var(--lp-text)]")}
          >
            {m.txt}
          </motion.div>
        ))}
      </AnimatePresence>
      {n >= all.length && (
        <div className="flex w-12 gap-1 self-start rounded-[16px] bg-[var(--lp-seg)] px-3 py-2.5">
          {[0, 1, 2].map((d) => (
            <motion.span key={d} className="h-1.5 w-1.5 rounded-full bg-[var(--lp-muted)]" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: d * 0.18 }} />
          ))}
        </div>
      )}
    </div>
  );
};

const Mail: React.FC = () => {
  const t = useTick(1500);
  const mails = ["Staff meeting", "Term report", "Sports day", "Parents' evening"];
  const top = t % mails.length;
  const list = [0, 1, 2].map((k) => mails[(top + k) % mails.length]);
  return (
    <ul className="flex h-full flex-col justify-center gap-1.5">
      <AnimatePresence initial={false} mode="popLayout">
        {list.map((m, i) => (
          <motion.li layout key={m} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: EASE }} className="flex items-center gap-2 rounded-lg bg-[var(--lp-alt)] px-2 py-1.5">
            <span className={cx("h-1.5 w-1.5 rounded-full", i === 0 ? "bg-[var(--lp-blue)]" : "bg-transparent")} />
            <span className={cx("flex-1 truncate text-xs", i === 0 ? "font-semibold text-[var(--lp-text)]" : "text-[var(--lp-muted)]")}>{m}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
};

const Feed: React.FC = () => {
  const t = useTick(700);
  return (
    <div className="flex h-full flex-col justify-center gap-2 rounded-xl bg-[var(--lp-alt)] p-2.5">
      <div className="flex items-center gap-2">
        <Avatar i={2} className="h-6 w-6 text-[9px]" />
        <span className="text-xs font-semibold text-[var(--lp-text)]">Science club</span>
      </div>
      <div className="h-8 rounded-lg bg-gradient-to-r from-[#a8d1ff] to-[#4da3ff]" />
      <div className="flex items-center gap-1 text-xs font-semibold text-[var(--lp-blue)]">
        <motion.span key={t} initial={{ scale: 1.4 }} animate={{ scale: 1 }}><Heart className="h-3.5 w-3.5 fill-current" /></motion.span>
        <span className="tabular-nums">{48 + t}</span>
      </div>
    </div>
  );
};

const Meetings: React.FC = () => {
  const t = useTick(1300);
  const speaking = t % 4;
  return (
    <div className="grid h-full grid-cols-2 gap-1.5">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={cx("relative flex items-center justify-center rounded-lg bg-gradient-to-br from-[#1b2a44] to-[#0d1b2e] transition-shadow", i === speaking && "ring-2 ring-[#2997ff]")}>
          <Avatar i={i + 1} className="h-6 w-6 text-[9px] ring-0" />
          {i === speaking && <Mic className="absolute bottom-1 right-1 h-3 w-3 text-[#77b9ff]" />}
        </div>
      ))}
    </div>
  );
};

// ---- registry ----------------------------------------------------------------------

export const WIDGETS: Record<string, React.FC> = {
  "Timetable & calendar": NowLesson,
  "E-learning": CourseProgress,
  "AI Lesson Studio": AiWriter,
  "Competency map": Competency,
  Mentorship,
  Safeguarding,
  "Office hours": OfficeHours,
  Analytics: Sparkline,
  "Quizzes & assignments": Submissions,
  "AI questions": AiQuestions,
  "Code runner": CodeRunner,
  "TMCode editor": CodeEditor,
  "Paper answer sheets": PaperSheets,
  Proctoring,
  Rankings,
  "Class registers": Register,
  "Works offline": Offline,
  "RFID check-in": Rfid,
  "Discipline records": Discipline,
  "Daily schedule": DaySchedule,
  Chat,
  "School mail": Mail,
  "News feed": Feed,
  Meetings,
};
