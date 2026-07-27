import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Alert, VerificationCode } from "./ui";
import ThemeToggle from "./ui/ThemeToggle";
import {
  login,
  verifyOTP,
  authorizeSSO,
  checkSession,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
} from "../api/auth";
import { useUser } from "../contexts/UserContext";
import { useToast } from "../contexts/ToastContext";
import { usePermissions } from "../hooks/usePermissions";
import { useSearchParams } from "react-router-dom";
import {
  Lock,
  Mail,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  User,
  Shield,
  CheckCircle,
  Key,
  LayoutDashboard,
  Users,
  FileText,
  GraduationCap,
  Link2,
  Building2,
} from "lucide-react";
import LOGO from "../assets/logo.png";

interface LoginProps {
  onLoginSuccess?: () => void;
}

const WEBSITE_URL =
  (import.meta.env.VITE_WEBSITE_URL as string | undefined) ||
  "https://nga.ac.rw";

// Layered ambient light — a tight glow anchored top-right for depth,
// plus a broad, loose wash behind the illustration. Both stay well
// clear of the card edges so they read as room lighting, not a halo.
const PanelGlow = () => (
  <>
    <div
      className="absolute -top-24 -right-24 w-[28rem] h-[28rem] rounded-full pointer-events-none"
      style={{
        background:
          "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)",
      }}
    />
    <div
      className="absolute top-1/3 left-1/4 w-[40rem] h-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
      style={{
        background:
          "radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 65%)",
      }}
    />
  </>
);

// Large, faint graduation-cap watermark — a quiet but unmistakable
// signal that this is a school system, sitting in the empty grid
// space below the carousel rather than competing with it.
const SchoolMark = () => (
  <GraduationCap
    className="absolute -bottom-10 -right-10 w-64 h-64 text-white/[0.05] pointer-events-none rotate-[-8deg]"
    strokeWidth={1}
  />
);

// Graph-paper grid — visible behind the logo (top) and in the empty
// space below the carousel (bottom), faded out where it would clutter
// the feature content in the middle band.
const GridBackground = () => (
  <div
    className="absolute inset-0 pointer-events-none"
    style={{
      backgroundImage:
        "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
      backgroundSize: "44px 44px",
      maskImage:
        "linear-gradient(to bottom, black 0%, black 10%, transparent 22%, transparent 76%, black 90%, black 100%)",
      WebkitMaskImage:
        "linear-gradient(to bottom, black 0%, black 10%, transparent 22%, transparent 76%, black 90%, black 100%)",
    }}
  />
);

type MockVariant =
  | "dashboard"
  | "users"
  | "reports"
  | "sso"
  | "academics"
  | "documents";

// Slim left nav shared by every preview — the single biggest cue that
// this is a real, navigable application rather than a graphic.
const NAV_ICONS = [LayoutDashboard, Users, FileText, GraduationCap, Link2];
const ACTIVE_NAV: Record<MockVariant, number> = {
  dashboard: 0,
  users: 1,
  reports: 2,
  documents: 2,
  academics: 3,
  sso: 4,
};

// Real-looking "browser window" frame used by the feature carousel —
// light app chrome + sidebar + white canvas, like an actual screenshot.
const FeatureWindowMockup: React.FC<{
  variant: MockVariant;
  accent: string;
  label: string;
}> = ({ variant, accent, label }) => (
  <div className="h-full w-full rounded-2xl overflow-hidden flex flex-col bg-white dark:bg-slate-900 border border-black/5 dark:border-white/10 shadow-[0_25px_70px_-20px_rgba(0,0,0,0.45)]">
    {/* Browser chrome */}
    <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-gray-100 dark:border-slate-800 shrink-0 bg-gray-50 dark:bg-slate-800/60">
      <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
      <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
      <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
      <div className="ml-2 flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-md px-2.5 py-1">
        <Lock className="w-2.5 h-2.5 text-gray-300 dark:text-slate-600" />
        <span className="text-[10px] text-gray-400 dark:text-slate-500 font-medium truncate">
          {label}
        </span>
      </div>
    </div>

    <div className="flex-1 flex min-h-0">
      {/* App sidebar */}
      <div className="w-11 shrink-0 bg-gray-50 dark:bg-slate-800/60 border-r border-gray-100 dark:border-slate-800 flex flex-col items-center gap-1.5 py-3">
        {NAV_ICONS.map((NavIcon, i) => (
          <span
            key={i}
            className={`flex items-center justify-center w-7 h-7 rounded-lg ${
              i === ACTIVE_NAV[variant]
                ? `bg-gradient-to-br ${accent} text-white`
                : "text-gray-300 dark:text-slate-600"
            }`}
          >
            <NavIcon className="w-3.5 h-3.5" />
          </span>
        ))}
      </div>

      {/* Canvas */}
      <div className="flex-1 p-4 bg-gray-50/60 dark:bg-slate-900/60 overflow-hidden">
        {variant === "dashboard" && (
          <div className="h-full flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { label: "Students", value: "1,240" },
                { label: "Attendance", value: "96%" },
                { label: "Teachers", value: "58" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-white dark:bg-slate-800 rounded-lg p-2.5 border border-gray-100 dark:border-slate-700 shadow-sm"
                >
                  <div className="text-[10px] text-gray-400 dark:text-slate-500 font-medium truncate">
                    {stat.label}
                  </div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white">
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex-1 bg-white dark:bg-slate-800 rounded-lg p-3 border border-gray-100 dark:border-slate-700 shadow-sm flex items-end gap-2">
              {[40, 65, 45, 80, 55, 90, 60].map((h, i) => (
                <motion.div
                  key={i}
                  className={`flex-1 rounded-t bg-gradient-to-t ${accent}`}
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{
                    duration: 0.6,
                    delay: i * 0.05,
                    ease: "easeOut",
                  }}
                />
              ))}
            </div>
          </div>
        )}
        {variant === "users" && (
          <div className="h-full flex flex-col gap-2 justify-center">
            {[
              { name: "Aline U.", role: "Head Teacher" },
              { name: "Eric N.", role: "Class Teacher" },
              { name: "Divine M.", role: "Bursar" },
            ].map((person, i) => (
              <motion.div
                key={person.name}
                className="flex items-center gap-3 bg-white dark:bg-slate-800 rounded-lg p-2.5 border border-gray-100 dark:border-slate-700 shadow-sm"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
              >
                <div
                  className={`w-8 h-8 rounded-full bg-gradient-to-br ${accent} shrink-0 flex items-center justify-center text-[10px] font-bold text-white`}
                >
                  {person.name
                    .split(" ")
                    .map((p) => p[0])
                    .join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-900 dark:text-white font-semibold truncate">
                    {person.name}
                  </div>
                  <div className="text-[10px] text-gray-400 dark:text-slate-500 truncate">
                    {person.role}
                  </div>
                </div>
                <span className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded-full shrink-0">
                  Active
                </span>
              </motion.div>
            ))}
          </div>
        )}
        {variant === "reports" && (
          <div className="h-full flex gap-4 items-center">
            <div className="flex-1 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-700 dark:text-slate-200 font-semibold">
                  Term 2 Report
                </span>
                <span className="text-[10px] text-gray-400 dark:text-slate-500">
                  4 schools
                </span>
              </div>
              {["Pass rate", "Enrollment", "Retention", "Completion"].map(
                (row) => (
                  <div
                    key={row}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-[10px] text-gray-400 dark:text-slate-500 w-16 shrink-0 truncate">
                      {row}
                    </span>
                    <div className="h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full flex-1 overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${accent}`}
                        style={{
                          width: `${60 + (row.length % 4) * 10}%`,
                        }}
                      />
                    </div>
                  </div>
                ),
              )}
            </div>
            <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
              <div
                className={`w-20 h-20 rounded-full bg-gradient-to-br ${accent}`}
                style={{
                  WebkitMask:
                    "radial-gradient(farthest-side, transparent calc(100% - 10px), black calc(100% - 9px))",
                  mask: "radial-gradient(farthest-side, transparent calc(100% - 10px), black calc(100% - 9px))",
                }}
              />
              <span className="absolute text-xs font-bold text-gray-900 dark:text-white">
                72%
              </span>
            </div>
          </div>
        )}
        {variant === "sso" && (
          <div className="h-full flex flex-col items-center justify-center relative gap-3">
            <div className="relative w-full flex items-center justify-center h-20">
              <div
                className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${accent} flex items-center justify-center z-10 shadow-sm`}
              >
                <Key className="w-6 h-6 text-white" />
              </div>
              {[
                { top: "5%", left: "12%" },
                { top: "10%", right: "10%" },
                { bottom: "5%", left: "18%" },
                { bottom: "8%", right: "16%" },
              ].map((pos, i) => (
                <motion.div
                  key={i}
                  className="absolute w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 shadow-sm flex items-center justify-center"
                  style={pos}
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{
                    repeat: Infinity,
                    duration: 2.5,
                    delay: i * 0.3,
                    ease: "easeInOut",
                  }}
                >
                  <Building2 className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
                </motion.div>
              ))}
            </div>
            <span className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">
              Connected to 4 school systems
            </span>
          </div>
        )}
        {variant === "academics" && (
          <div className="h-full flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-700 dark:text-slate-200 font-semibold">
                Term 2 Calendar
              </span>
              <span className="text-[10px] text-gray-400 dark:text-slate-500">
                Week 6
              </span>
            </div>
            <div className="flex-1 grid grid-cols-7 gap-1.5 content-center">
              {Array.from({ length: 28 }).map((_, i) => (
                <div
                  key={i}
                  className={`aspect-square rounded-md ${
                    [3, 9, 14, 20, 23].includes(i)
                      ? `bg-gradient-to-br ${accent}`
                      : "bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700"
                  }`}
                />
              ))}
            </div>
          </div>
        )}
        {variant === "documents" && (
          <div className="h-full flex flex-col gap-2 justify-center">
            {[
              { name: "Report_Card_T2.pdf", size: "1.2 MB" },
              { name: "Enrollment_Form.docx", size: "340 KB" },
              { name: "Fee_Structure_2026.xlsx", size: "88 KB" },
            ].map((file) => (
              <div
                key={file.name}
                className="flex items-center gap-3 bg-white dark:bg-slate-800 rounded-lg p-2.5 border border-gray-100 dark:border-slate-700 shadow-sm"
              >
                <div
                  className={`w-7 h-8 rounded-sm bg-gradient-to-br ${accent} shrink-0 flex items-center justify-center`}
                >
                  <FileText className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-900 dark:text-white font-semibold truncate">
                    {file.name}
                  </div>
                  <div className="text-[10px] text-gray-400 dark:text-slate-500">
                    {file.size}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);

const FEATURE_SLIDES = [
  {
    icon: LayoutDashboard,
    title: "Unified Dashboards",
    description: "Real-time insights across every NGA program, in one view.",
    mock: "dashboard" as const,
    label: "dashboard.mis",
    accent: "from-blue-500 to-blue-600",
  },
  {
    icon: Users,
    title: "Role-Based Access",
    description: "Every user sees exactly what they're permissioned to see.",
    mock: "users" as const,
    label: "users.mis",
    accent: "from-blue-500 to-blue-600",
  },
  {
    icon: FileText,
    title: "Cross-System Reporting",
    description: "Generate consolidated reports without leaving the platform.",
    mock: "reports" as const,
    label: "reports.mis",
    accent: "from-blue-500 to-blue-600",
  },
  {
    icon: Link2,
    title: "Single Sign-On",
    description: "One secure login connects you to every integrated system.",
    mock: "sso" as const,
    label: "sso.mis",
    accent: "from-blue-500 to-blue-600",
  },
  {
    icon: GraduationCap,
    title: "Academic Planning",
    description: "Track terms, schemes of work, and calendars in sync.",
    mock: "academics" as const,
    label: "academics.mis",
    accent: "from-blue-500 to-blue-600",
  },
  {
    icon: FileText,
    title: "Document Workflows",
    description: "Store, share, and track official documents securely.",
    mock: "documents" as const,
    label: "documents.mis",
    accent: "from-blue-500 to-blue-600",
  },
];

// Auto-advancing, swipeable, tilt-interactive window carousel showcasing MIS modules
const FeatureCarousel = () => {
  const [[index, direction], setSlide] = useState<[number, number]>([0, 1]);
  const [paused, setPaused] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const count = FEATURE_SLIDES.length;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setSlide(([i]) => [(i + 1) % count, 1]);
    }, 5000);
    return () => clearInterval(id);
  }, [index, paused, count]);

  const goTo = (i: number) => {
    if (i === index) return;
    setSlide([(i + count) % count, i > index ? 1 : -1]);
  };

  const next = () => goTo(index + 1);
  const prev = () => goTo(index - 1 < 0 ? count - 1 : index - 1);

  const slide = FEATURE_SLIDES[index];

  const windowVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 60 : -60,
      opacity: 0,
      scale: 0.97,
    }),
    center: { x: 0, opacity: 1, scale: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0, scale: 0.97 }),
  };

  const textVariants = {
    enter: { opacity: 0, y: 10, scale: 0.98 },
    center: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -10, scale: 0.98 },
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: py * -10, y: px * 10 });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    }
  };

  return (
    <div
      className="relative z-10 w-full group"
      role="region"
      aria-roledescription="carousel"
      aria-label="NGA MIS feature highlights"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => {
        setPaused(false);
        setTilt({ x: 0, y: 0 });
      }}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <motion.div
        className="relative h-[clamp(120px,26vh,208px)] mb-5"
        style={{ perspective: 900 }}
        animate={reduceMotion ? undefined : { y: [0, -3, 0] }}
        transition={
          reduceMotion
            ? undefined
            : { repeat: Infinity, duration: 7, ease: "easeInOut" }
        }
      >
        <AnimatePresence custom={direction} mode="wait">
          <motion.div
            key={index}
            custom={direction}
            variants={windowVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="absolute inset-0"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.6}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60) next();
              else if (info.offset.x > 60) prev();
            }}
            onMouseMove={handleMouseMove}
            style={{
              rotateX: tilt.x,
              rotateY: tilt.y,
              transformStyle: "preserve-3d",
            }}
          >
            <FeatureWindowMockup
              variant={slide.mock}
              accent={slide.accent}
              label={slide.label}
            />
          </motion.div>
        </AnimatePresence>

        <button
          type="button"
          onClick={prev}
          aria-label="Previous feature"
          className="absolute -left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/10 border border-white/20 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={next}
          aria-label="Next feature"
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/10 border border-white/20 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`text-${index}`}
          variants={textVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-normal text-white dark:text-slate-100 flex items-center gap-2.5 tracking-tight">
              {slide.title}
            </h2>
            <span className="text-xs font-medium text-white/40 dark:text-slate-400 tabular-nums shrink-0">
              {String(index + 1).padStart(2, "0")} /{" "}
              {String(count).padStart(2, "0")}
            </span>
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center gap-1.5">
        {FEATURE_SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Show ${FEATURE_SLIDES[i].title}`}
            className="h-1.5 flex-1 rounded-full bg-white/15 dark:bg-white/10 overflow-hidden"
          >
            {i < index && (
              <div className="h-full w-full bg-white/70 dark:bg-slate-300/70" />
            )}
            {i === index && (
              <div
                key={`fill-${index}`}
                className="h-full bg-white dark:bg-slate-100 rounded-full animate-grow-width"
                style={{ animationPlayState: paused ? "paused" : "running" }}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

const GoogleIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.44a5.5 5.5 0 0 1-2.39 3.6v3h3.86c2.26-2.08 3.58-5.15 3.58-8.79Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.86-3c-1.08.72-2.45 1.15-4.09 1.15-3.14 0-5.8-2.12-6.75-4.96H1.27v3.1A12 12 0 0 0 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M5.25 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.27a12 12 0 0 0 0 10.78l3.98-3.1Z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.61l3.98 3.1C6.2 6.87 8.86 4.75 12 4.75Z"
    />
  </svg>
);

// Branded left panel — desktop split-screen; compact banner on mobile
const LoginBrandPanel = () => {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 dark:from-blue-950 dark:via-blue-900 dark:to-blue-950">
      {/* Compact mobile banner */}
      <div className="lg:hidden relative z-10 flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center p-1.5 shrink-0">
            <img
              src={LOGO}
              alt="NGA MIS"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <p className="text-white font-bold leading-tight tracking-tight">
              NGA<span className="font-light text-blue-100"> MIS</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={WEBSITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-white/80 text-xs font-medium px-2.5 py-1.5 rounded-full border border-white/20 hover:bg-white/10 transition-colors"
          >
            Website
            <ArrowUpRight className="w-3 h-3" />
          </a>
          <ThemeToggle />
        </div>
      </div>

      {/* Full desktop panel */}
      <div className="hidden lg:flex h-full relative z-10 px-10 py-[clamp(1rem,4vh,2rem)] overflow-hidden">
        <GridBackground />
        <PanelGlow />
        <SchoolMark />

        <div className="relative z-10 flex flex-col justify-between h-full w-full max-w-xl mx-auto">
          <motion.div
            className="flex items-center justify-between gap-3"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center gap-3">
              <motion.div
                className="w-11 h-11 rounded-2xl bg-white flex items-center justify-center p-2 shrink-0"
                whileHover={{ scale: 1.05, rotate: -3 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <img
                  src={LOGO}
                  alt="NGA MIS"
                  className="w-full h-full object-contain"
                />
              </motion.div>
              <div className="leading-tight">
                <span className="text-white text-xl font-bold tracking-tight block">
                  NGA<span className="font-light text-blue-100">MIS</span>
                </span>
              </div>
            </div>

            <a
              href={WEBSITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-white/80 hover:text-white text-sm font-medium px-3.5 py-2 rounded-full border border-white/20 hover:bg-white/10 transition-colors"
            >
              Visit website
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </motion.div>

          <motion.h1
            className="text-2xl md:text-3xl lg:text-5xl font-bold text-white tracking-tight max-w-md h-max"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            School Management Platform
          </motion.h1>

          <FeatureCarousel />

          <motion.p
            className="text-blue-100/60 text-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            © {new Date().getFullYear()} NGA Central MIS. All rights reserved.
          </motion.p>
        </div>
      </div>
    </div>
  );
};

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const { refreshUser, user: currentUser } = useUser();
  const { showToast } = useToast();
  const { getUserPermissions } = usePermissions();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [tempToken, setTempToken] = useState("");
  const [step, setStep] = useState<
    | "credentials"
    | "otp"
    | "success"
    | "sso-consent"
    | "forgot-email"
    | "forgot-otp"
    | "forgot-password"
    | "forgot-success"
  >("credentials");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [resetTempToken, setResetTempToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [initializing, setInitializing] = useState(true);
  const hasCheckedRef = useRef(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleCredentialsSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setAuthError("");

    try {
      const response = await login({ username, password });
      if (response?.requiresOTP) {
        setTempToken(response.tempToken);
        setStep("otp");
      }
    } catch (error: any) {
      setAuthError(
        error.response?.data?.message || "Login failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotEmailSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setAuthError("");

    try {
      const response = await forgotPassword(resetEmail);
      if (response?.tempToken) {
        setResetTempToken(response.tempToken);
      }
      setStep("forgot-otp");
    } catch (error: any) {
      setAuthError(
        error.response?.data?.message ||
          "Failed to send verification code. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotOTPSubmit = async (e: any) => {
    e.preventDefault();
    if (!resetOtp) return;
    if (!resetTempToken) {
      setAuthError("Session expired. Please start over.");
      return;
    }
    setLoading(true);
    setAuthError("");

    try {
      await verifyResetOTP(resetOtp, resetTempToken);
      setStep("forgot-password");
    } catch (error: any) {
      setAuthError(
        error.response?.data?.message ||
          error.message ||
          "Invalid verification code. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: any) => {
    e.preventDefault();
    setAuthError("");

    if (newPassword !== confirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setAuthError("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(newPassword);
      setStep("forgot-success");
    } catch (error: any) {
      setAuthError(
        error.response?.data?.message ||
          "Failed to reset password. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const resetForgotPasswordFlow = () => {
    setResetEmail("");
    setResetOtp("");
    setResetTempToken("");
    setNewPassword("");
    setConfirmPassword("");
    setAuthError("");
  };

  const handleGoogleLogin = () => {
    showToast(
      "Google sign-in isn't connected yet — ask your admin to enable it.",
      "info",
    );
  };

  const handleOTPSubmit = async (e: any) => {
    e.preventDefault();
    if (loading) return; // Prevent multiple submissions
    setLoading(true);
    setAuthError("");

    try {
      await verifyOTP(otp, tempToken);
      await refreshUser();

      // Check for SSO parameters
      const clientId = searchParams.get("client_id");
      const redirectUri = searchParams.get("redirect_uri");

      if (clientId && redirectUri) {
        try {
          const responseType = searchParams.get("response_type") || "code";
          const state = searchParams.get("state");
          const ssoData = await authorizeSSO(
            clientId,
            redirectUri,
            responseType,
            state || undefined,
          );
          if (ssoData?.code) {
            setStep("success");
            setTimeout(() => {
              // Redirect back to integrated system with auth code and state
              const finalUrl = new URL(redirectUri);
              finalUrl.searchParams.set("code", ssoData.code);
              if (ssoData.state) {
                finalUrl.searchParams.set("state", ssoData.state);
              }
              window.location.href = finalUrl.toString();
            }, 500);
            return;
          }
        } catch (ssoError) {
          console.error("SSO Authorization failed:", ssoError);
          // Fallback to normal login flow if SSO fails
        }
      }

      setStep("success");
      setTimeout(() => {
        if (onLoginSuccess) {
          onLoginSuccess();
        }
      }, 800);
    } catch (error: any) {
      setAuthError(
        error.response?.data?.message || "Invalid OTP code. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  // Check for auto-login/SSO redirect on mount
  useEffect(() => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    const handleAutoRedirect = async () => {
      const clientId = searchParams.get("client_id");
      const redirectUri = searchParams.get("redirect_uri");

      // Verify if user is already logged in
      try {
        await checkSession();
        // If session is valid and we have SSO params, auto-continue after brief pause
        if (clientId && redirectUri) {
          console.log("User already logged in, auto-continuing SSO...");
          setStep("sso-consent");
          // 1.5s pause so user can see the consent screen before automatic redirect
          setTimeout(() => {
            handleSSOContinue();
          }, 1500);
        } else {
          // If logged in but no SSO params, let parent handle navigation (e.g. to dashboard)
          if (onLoginSuccess) onLoginSuccess();
        }
      } catch (err) {
        // Not logged in, stay on login page
      } finally {
        setInitializing(false);
      }
    };

    handleAutoRedirect();
  }, [searchParams, onLoginSuccess]);

  const handleSSOContinue = async () => {
    setLoading(true);
    const clientId = searchParams.get("client_id");
    const redirectUri = searchParams.get("redirect_uri");

    if (clientId && redirectUri) {
      try {
        const responseType = searchParams.get("response_type") || "code";
        const state = searchParams.get("state");
        const ssoData = await authorizeSSO(
          clientId,
          redirectUri,
          responseType,
          state || undefined,
        );
        if (ssoData?.code) {
          setStep("success");
          setTimeout(() => {
            const finalUrl = new URL(redirectUri);
            finalUrl.searchParams.set("code", ssoData.code);
            if (ssoData.state) {
              finalUrl.searchParams.set("state", ssoData.state);
            }
            window.location.href = finalUrl.toString();
          }, 500);
        }
      } catch (ssoError) {
        console.error("SSO Authorization failed:", ssoError);
        setAuthError("Failed to authorize application. Please try again.");
        setStep("credentials"); // Fallback
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSSOLogout = async () => {
    // Clear all MIS session tokens and reload to re-present the login form
    localStorage.removeItem("token");
    localStorage.removeItem("nga_auth_token");
    localStorage.removeItem("misToken");
    try {
      // Best-effort server-side logout to clear the HttpOnly cookie
      const { logout } = await import("../api/auth");
      await logout();
    } catch {
      // ignore — cookie will expire naturally
    }
    window.location.reload();
  };

  const formVariants = {
    initial: { opacity: 0, x: -50 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 50 },
  };

  const inputVariants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
  };

  // Progress indicator for steps
  const ProgressIndicator = () => (
    <motion.div
      className="flex justify-center gap-2 mb-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className={`w-3 h-3 rounded-full ${
            i === 0
              ? step === "credentials" || step === "sso-consent"
                ? "bg-gradient-to-r from-blue-500 to-blue-600"
                : "bg-gray-300 dark:bg-gray-600"
              : i === 1
                ? step === "otp"
                  ? "bg-gradient-to-r from-blue-500 to-blue-600"
                  : step === "success"
                    ? "bg-green-500"
                    : "bg-gray-300 dark:bg-gray-600"
                : step === "success"
                  ? "bg-gradient-to-r from-green-500 to-green-600"
                  : "bg-gray-300 dark:bg-gray-600"
          }`}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: i * 0.1 }}
        />
      ))}
    </motion.div>
  );

  return (
    <motion.div
      className="h-screen relative overflow-hidden bg-white dark:bg-black flex flex-col lg:grid lg:grid-cols-[45%_55%]"
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.4 }}
    >
      <div className="hidden lg:block fixed top-6 right-6 z-50">
        <ThemeToggle />
      </div>

      <LoginBrandPanel />

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8 lg:py-8 overflow-y-auto">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 50% 35%, rgba(59,130,246,0.06), transparent 60%)",
          }}
        />
        <div className="w-full max-w-md mx-auto relative">
          <AnimatePresence mode="wait">
            {initializing ? (
              <motion.div
                key="initializing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center p-12"
              >
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-gray-600 dark:text-gray-300 font-medium">
                  Checking session...
                </p>
              </motion.div>
            ) : step === "sso-consent" ? (
              <motion.div
                key="sso-consent"
                variants={formVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  className="rounded-3xl p-8 text-center bg-white/40 dark:bg-white/[0.02] backdrop-blur-sm"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  {/* User avatar */}
                  <motion.div className="flex justify-center mb-4">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 p-1">
                        <div className="w-full h-full rounded-full bg-white dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                          <User className="w-10 h-10 text-gray-400" />
                        </div>
                      </div>
                      <div className="absolute bottom-0 right-0 p-1.5 bg-green-500 rounded-full border-2 border-white dark:border-slate-800">
                        <CheckCircle className="w-3 h-3 text-white" />
                      </div>
                    </div>
                  </motion.div>

                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                    {[
                      currentUser?.profile?.first_name,
                      currentUser?.profile?.last_name,
                    ]
                      .filter(Boolean)
                      .join(" ") ||
                      currentUser?.user?.username ||
                      "Signed In"}
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">
                    {currentUser?.roles?.[0]?.name || "NGA User"} · NGA Central
                    MIS
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
                    Redirecting you to{" "}
                    <span className="font-medium text-gray-600 dark:text-gray-300">
                      {searchParams.get("client_id") || "the app"}
                    </span>{" "}
                    automatically…
                  </p>

                  {/* Auto-redirect progress bar */}
                  {!loading && (
                    <div className="mb-6">
                      <div className="h-1.5 w-full bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-500 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: "100%" }}
                          transition={{ duration: 1.4, ease: "easeInOut" }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <button
                      onClick={handleSSOContinue}
                      disabled={loading}
                      className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 disabled:opacity-60 text-white font-semibold rounded-2xl transition-all flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          Redirecting…
                        </>
                      ) : (
                        <>
                          Continue now <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleSSOLogout}
                      className="w-full py-3 bg-transparent hover:bg-gray-50 dark:hover:bg-slate-700/50 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 text-sm font-medium rounded-2xl border border-gray-200 dark:border-slate-700 transition-all"
                    >
                      Not you? Switch account
                    </button>
                  </div>

                  <div className="mt-5 pt-5 border-t border-gray-100 dark:border-slate-700/50">
                    <p className="text-xs text-gray-400">
                      Your identity is securely shared with{" "}
                      <span className="font-medium text-gray-600 dark:text-gray-300">
                        {searchParams.get("client_id")}
                      </span>
                      .
                    </p>
                  </div>
                </motion.div>
              </motion.div>
            ) : step === "success" ? (
              <motion.div
                key="success"
                variants={formVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                {/* Success Card with Permissions */}
                <motion.div
                  className="rounded-3xl p-8 bg-white/40 dark:bg-white/[0.02] backdrop-blur-sm"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                >
                  {/* Centered Icon */}
                  <motion.div
                    className="flex justify-center mb-6"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                  >
                    <motion.div
                      className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full"
                      whileHover={{ scale: 1.05 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <CheckCircle className="w-8 h-8 text-white" />
                    </motion.div>
                  </motion.div>

                  <motion.div className="text-center mb-2">
                    <motion.h1
                      className="text-2xl font-bold text-gray-900 dark:text-white mb-2"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      Login Successful!
                    </motion.h1>
                    <motion.p
                      className="text-gray-600 dark:text-gray-300"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      Welcome to NGA Central MIS
                    </motion.p>
                  </motion.div>

                  <ProgressIndicator />

                  {/* Permissions Section */}
                  <motion.div
                    className="mt-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Key className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        Your Permissions
                      </span>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-900/50 rounded-2xl p-4 max-h-48 overflow-y-auto">
                      {(() => {
                        const userPermissions = getUserPermissions();
                        return userPermissions.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {userPermissions.map(
                              (perm: string, index: number) => (
                                <motion.span
                                  key={index + 1}
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ delay: 0.5 + index * 0.05 }}
                                  className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-full text-xs font-medium"
                                >
                                  {perm}
                                </motion.span>
                              ),
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                            No permissions assigned
                          </p>
                        );
                      })()}
                    </div>
                  </motion.div>

                  <motion.div
                    className="mt-6 text-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                  >
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Redirecting to dashboard...
                    </p>
                  </motion.div>
                </motion.div>
              </motion.div>
            ) : step === "otp" ? (
              <motion.div
                key="otp"
                variants={formVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                {/* OTP Form Card */}
                <motion.div
                  className="rounded-3xl p-8 bg-white/40 dark:bg-white/[0.02] backdrop-blur-sm"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                >
                  {/* Centered Icon */}
                  <motion.div
                    className="flex justify-center mb-6"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                  >
                    <motion.div
                      className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full"
                      whileHover={{ scale: 1.05 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <Shield className="w-8 h-8 text-white" />
                    </motion.div>
                  </motion.div>

                  <motion.div className="text-center mb-2">
                    <motion.h1
                      className="text-2xl font-bold text-gray-900 dark:text-white mb-2"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      Verify Your Identity
                    </motion.h1>
                    <motion.p
                      className="text-gray-600 dark:text-gray-300"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      Enter the 6-digit code sent to your email
                    </motion.p>
                  </motion.div>

                  <ProgressIndicator />

                  <motion.form
                    onSubmit={handleOTPSubmit}
                    className="space-y-6"
                    variants={formVariants}
                  >
                    <motion.div
                      className="space-y-2"
                      initial={inputVariants.initial}
                      animate={inputVariants.animate}
                      transition={{ delay: 0.4 }}
                    >
                      <VerificationCode
                        length={6}
                        onChange={setOtp}
                        onComplete={(code) => {
                          setOtp(code);
                          // if (code.length === 6) {
                          //   handleOTPSubmit({
                          //     preventDefault: () => {},
                          //   } as any);
                          // }
                        }}
                        error={!!authError}
                      />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                    >
                      <motion.button
                        type="submit"
                        className="w-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 hover:from-blue-600 hover:via-blue-700 hover:to-blue-700 text-white font-semibold py-2.5 px-6 rounded-full transition-all duration-200 transform hover:scale-[1.02] relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={loading}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <motion.div
                          animate={{ x: ["-100%", "100%"] }}
                          transition={{
                            repeat: Infinity,
                            duration: 2,
                            ease: "linear",
                          }}
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"
                        />
                        {loading ? (
                          <div className="flex items-center justify-center">
                            <motion.div
                              className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"
                              animate={{ rotate: 360 }}
                              transition={{
                                duration: 1,
                                repeat: Infinity,
                                ease: "linear",
                              }}
                            />
                            Verifying...
                          </div>
                        ) : (
                          <span className="relative flex items-center justify-center gap-2">
                            Verify Code
                            <CheckCircle className="w-5 h-5" />
                          </span>
                        )}
                      </motion.button>
                    </motion.div>

                    <motion.button
                      type="button"
                      onClick={() => {
                        setStep("credentials");
                        setAuthError("");
                        setOtp("");
                      }}
                      className="w-full text-sm text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 font-medium transition-colors duration-200 flex items-center justify-center gap-2 py-2 px-4 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      whileHover={{ scale: 1.05, rotate: 1 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <ArrowRight className="w-4 h-4 rotate-180" />
                      Back to login
                    </motion.button>
                  </motion.form>
                </motion.div>
              </motion.div>
            ) : step === "forgot-email" ? (
              <motion.div
                key="forgot-email"
                variants={formVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  className="rounded-3xl p-8 bg-white/40 dark:bg-white/[0.02] backdrop-blur-sm"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                >
                  <motion.div
                    className="flex justify-center mb-6"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                  >
                    <motion.div
                      className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full"
                      whileHover={{ scale: 1.05 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <Mail className="w-8 h-8 text-white" />
                    </motion.div>
                  </motion.div>

                  <motion.div className="text-center mb-6">
                    <motion.h1
                      className="text-2xl font-bold text-gray-900 dark:text-white mb-2"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      Reset Password
                    </motion.h1>
                    <motion.p
                      className="text-gray-600/60 dark:text-gray-300/60 text-sm"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      Enter your email to receive a verification code
                    </motion.p>
                  </motion.div>

                  <motion.form
                    onSubmit={handleForgotEmailSubmit}
                    className="space-y-5"
                    variants={formVariants}
                  >
                    <motion.div
                      initial={inputVariants.initial}
                      animate={inputVariants.animate}
                      transition={{ delay: 0.2 }}
                    >
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="email"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          placeholder="Enter your email"
                          className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 dark:bg-slate-900/50 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-[5px] focus:ring-blue-500/15 transition-all duration-300 text-gray-900 dark:text-white placeholder-gray-400"
                          required
                        />
                      </div>
                    </motion.div>

                    <AnimatePresence>
                      {authError && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <Alert
                            type="error"
                            message={authError}
                            className="mt-4"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <motion.button
                        type="submit"
                        className="group w-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 hover:from-blue-600 hover:via-blue-700 hover:to-blue-700 text-white font-semibold py-2.5 px-6 rounded-full transition-all duration-200 transform hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/30 relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={loading}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <motion.div
                          animate={{ x: ["-100%", "100%"] }}
                          transition={{
                            repeat: Infinity,
                            duration: 2,
                            ease: "linear",
                          }}
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"
                        />
                        {loading ? (
                          <div className="flex items-center justify-center">
                            <motion.div
                              className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"
                              animate={{ rotate: 360 }}
                              transition={{
                                duration: 1,
                                repeat: Infinity,
                                ease: "linear",
                              }}
                            />
                            Sending...
                          </div>
                        ) : (
                          <span className="relative flex items-center justify-center gap-2">
                            Send Verification Code
                            <ArrowRight className="w-5 h-5 transition-transform duration-200 group-hover:translate-x-1" />
                          </span>
                        )}
                      </motion.button>
                    </motion.div>
                  </motion.form>

                  <motion.div
                    className="mt-6 text-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                  >
                    <motion.button
                      type="button"
                      onClick={() => {
                        resetForgotPasswordFlow();
                        setStep("credentials");
                      }}
                      className="text-sm text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 font-medium transition-colors flex items-center justify-center gap-2 mx-auto"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back to login
                    </motion.button>
                  </motion.div>
                </motion.div>
              </motion.div>
            ) : step === "forgot-otp" ? (
              <motion.div
                key="forgot-otp"
                variants={formVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  className="rounded-3xl p-8 bg-white/40 dark:bg-white/[0.02] backdrop-blur-sm"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                >
                  <motion.div
                    className="flex justify-center mb-6"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                  >
                    <motion.div
                      className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full"
                      whileHover={{ scale: 1.05 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <Shield className="w-8 h-8 text-white" />
                    </motion.div>
                  </motion.div>

                  <motion.div className="text-center mb-2">
                    <motion.h1
                      className="text-2xl font-bold text-gray-900 dark:text-white mb-2"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      Verify Your Identity
                    </motion.h1>
                    <motion.p
                      className="text-gray-600 dark:text-gray-300"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      Enter the 6-digit code sent to your email
                    </motion.p>
                  </motion.div>

                  <motion.form
                    onSubmit={handleForgotOTPSubmit}
                    className="space-y-6"
                    variants={formVariants}
                  >
                    <motion.div
                      className="space-y-2"
                      initial={inputVariants.initial}
                      animate={inputVariants.animate}
                      transition={{ delay: 0.4 }}
                    >
                      <VerificationCode
                        length={6}
                        onChange={(code) => {
                          setResetOtp(code);
                          if (code.length > 0) setAuthError("");
                        }}
                        error={!!authError}
                      />
                    </motion.div>

                    <AnimatePresence>
                      {authError && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <Alert
                            type="error"
                            message={authError}
                            className="mt-4"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                    >
                      <motion.button
                        type="submit"
                        className="w-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 hover:from-blue-600 hover:via-blue-700 hover:to-blue-700 text-white font-semibold py-2.5 px-6 rounded-full transition-all duration-200 transform hover:scale-[1.02] relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={loading}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <motion.div
                          animate={{ x: ["-100%", "100%"] }}
                          transition={{
                            repeat: Infinity,
                            duration: 2,
                            ease: "linear",
                          }}
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"
                        />
                        {loading ? (
                          <div className="flex items-center justify-center">
                            <motion.div
                              className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"
                              animate={{ rotate: 360 }}
                              transition={{
                                duration: 1,
                                repeat: Infinity,
                                ease: "linear",
                              }}
                            />
                            Verifying...
                          </div>
                        ) : (
                          <span className="relative flex items-center justify-center gap-2">
                            Verify Code
                            <CheckCircle className="w-5 h-5" />
                          </span>
                        )}
                      </motion.button>
                    </motion.div>

                    <motion.button
                      type="button"
                      onClick={() => {
                        setStep("forgot-email");
                        setAuthError("");
                        setResetOtp("");
                      }}
                      className="w-full text-sm text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 font-medium transition-colors duration-200 flex items-center justify-center gap-2 py-2 px-4 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      whileHover={{ scale: 1.05, rotate: 1 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back to email
                    </motion.button>
                  </motion.form>
                </motion.div>
              </motion.div>
            ) : step === "forgot-password" ? (
              <motion.div
                key="forgot-password"
                variants={formVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  className="rounded-3xl p-8 bg-white/40 dark:bg-white/[0.02] backdrop-blur-sm"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                >
                  <motion.div
                    className="flex justify-center mb-6"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                  >
                    <motion.div
                      className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full"
                      whileHover={{ scale: 1.05 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <Key className="w-8 h-8 text-white" />
                    </motion.div>
                  </motion.div>

                  <motion.div className="text-center mb-6">
                    <motion.h1
                      className="text-2xl font-bold text-gray-900 dark:text-white mb-2"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      Set New Password
                    </motion.h1>
                    <motion.p
                      className="text-gray-600/60 dark:text-gray-300/60 text-sm"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      Choose a strong new password for your account
                    </motion.p>
                  </motion.div>

                  <motion.form
                    onSubmit={handleResetPasswordSubmit}
                    className="space-y-5"
                    variants={formVariants}
                  >
                    <motion.div
                      initial={inputVariants.initial}
                      animate={inputVariants.animate}
                      transition={{ delay: 0.2 }}
                    >
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="New password"
                          className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 dark:bg-slate-900/50 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-[5px] focus:ring-blue-500/15 transition-all duration-300 text-gray-900 dark:text-white placeholder-gray-400"
                          required
                        />
                      </div>
                    </motion.div>
                    <motion.div
                      initial={inputVariants.initial}
                      animate={inputVariants.animate}
                      transition={{ delay: 0.3 }}
                    >
                      <div className="relative">
                        <Key className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm new password"
                          className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 dark:bg-slate-900/50 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-[5px] focus:ring-blue-500/15 transition-all duration-300 text-gray-900 dark:text-white placeholder-gray-400"
                          required
                        />
                      </div>
                    </motion.div>

                    <motion.p
                      className="text-xs text-gray-500 dark:text-gray-400"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.35 }}
                    >
                      Password must be at least 8 characters long
                    </motion.p>

                    <AnimatePresence>
                      {authError && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <Alert
                            type="error"
                            message={authError}
                            className="mt-4"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      <motion.button
                        type="submit"
                        className="w-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 hover:from-blue-600 hover:via-blue-700 hover:to-blue-700 text-white font-semibold py-2.5 px-6 rounded-full transition-all duration-200 transform hover:scale-[1.02] relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={loading}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <motion.div
                          animate={{ x: ["-100%", "100%"] }}
                          transition={{
                            repeat: Infinity,
                            duration: 2,
                            ease: "linear",
                          }}
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"
                        />
                        {loading ? (
                          <div className="flex items-center justify-center">
                            <motion.div
                              className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"
                              animate={{ rotate: 360 }}
                              transition={{
                                duration: 1,
                                repeat: Infinity,
                                ease: "linear",
                              }}
                            />
                            Resetting Password...
                          </div>
                        ) : (
                          <span className="relative flex items-center justify-center gap-2">
                            Reset Password
                            <Lock className="w-5 h-5" />
                          </span>
                        )}
                      </motion.button>
                    </motion.div>

                    <motion.button
                      type="button"
                      onClick={() => {
                        setStep("forgot-otp");
                        setNewPassword("");
                        setConfirmPassword("");
                        setAuthError("");
                      }}
                      className="w-full text-sm text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 font-medium transition-colors duration-200 flex items-center justify-center gap-2 py-2 px-4 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      whileHover={{ scale: 1.05, rotate: 1 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back to verification
                    </motion.button>
                  </motion.form>
                </motion.div>
              </motion.div>
            ) : step === "forgot-success" ? (
              <motion.div
                key="forgot-success"
                variants={formVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  className="rounded-3xl p-8 text-center bg-white/40 dark:bg-white/[0.02] backdrop-blur-sm"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                >
                  <motion.div
                    className="flex justify-center mb-6"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                  >
                    <motion.div
                      className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full"
                      whileHover={{ scale: 1.05 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <CheckCircle className="w-8 h-8 text-white" />
                    </motion.div>
                  </motion.div>

                  <motion.h1
                    className="text-2xl font-bold text-gray-900 dark:text-white mb-2"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    Password Reset Successful
                  </motion.h1>
                  <motion.p
                    className="text-gray-600/60 dark:text-gray-300/60 text-sm mb-6"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    Your password has been successfully reset. You can now
                    sign in with your new password.
                  </motion.p>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <motion.button
                      type="button"
                      onClick={() => {
                        resetForgotPasswordFlow();
                        setStep("credentials");
                      }}
                      className="group w-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 hover:from-blue-600 hover:via-blue-700 hover:to-blue-700 text-white font-semibold py-2.5 px-6 rounded-full transition-all duration-200 transform hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/30 relative overflow-hidden"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span className="relative flex items-center justify-center gap-2">
                        Back to Login
                        <ArrowRight className="w-5 h-5 transition-transform duration-200 group-hover:translate-x-1" />
                      </span>
                    </motion.button>
                  </motion.div>
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key="credentials"
                variants={formVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                {/* Login Form Card */}
                <motion.div
                  className="rounded-3xl p-8 bg-white/40 dark:bg-white/[0.02] backdrop-blur-sm"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                >
                  {/* Centered Icon */}
                  <motion.div
                    className="flex justify-center mb-6"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                  >
                    <motion.div
                      className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full"
                      whileHover={{ scale: 1.05 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <User className="w-8 h-8 text-white" />
                    </motion.div>
                  </motion.div>

                  <motion.div className="text-center mb-6">
                    <motion.h1
                      className="text-2xl font-bold text-gray-900 dark:text-white mb-2"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      Welcome Back
                    </motion.h1>
                    <motion.p
                      className="text-gray-600/60 dark:text-gray-300/60 text-sm"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      Sign in to access NGA Central MIS
                    </motion.p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="mb-5"
                  >
                    <motion.button
                      type="button"
                      onClick={handleGoogleLogin}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full flex items-center justify-center gap-3 py-2.5 px-6 text-sm rounded-xl border-2 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-50 hover:border-gray-300 dark:hover:bg-slate-700/40 dark:hover:border-slate-600 hover:shadow-sm transition-all"
                    >
                      <GoogleIcon />
                      Continue with Google
                    </motion.button>
                    <div className="flex items-center gap-3 mt-5">
                      <div className="flex-1 h-px bg-gray-200 dark:bg-slate-700" />
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        or continue with email
                      </span>
                      <div className="flex-1 h-px bg-gray-200 dark:bg-slate-700" />
                    </div>
                  </motion.div>

                  <motion.form
                    onSubmit={handleCredentialsSubmit}
                    className="space-y-5"
                    variants={formVariants}
                  >
                    <motion.div
                      initial={inputVariants.initial}
                      animate={inputVariants.animate}
                      transition={{ delay: 0.2 }}
                    >
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="Enter your username or email"
                          className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 dark:bg-slate-900/50 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-[5px] focus:ring-blue-500/15 transition-all duration-300 text-gray-900 dark:text-white placeholder-gray-400"
                          required
                        />
                      </div>
                    </motion.div>
                    <motion.div
                      initial={inputVariants.initial}
                      animate={inputVariants.animate}
                      transition={{ delay: 0.3 }}
                    >
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter your password"
                          className="w-full pl-10 pr-11 py-2.5 text-sm bg-gray-50 dark:bg-slate-900/50 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-[5px] focus:ring-blue-500/15 transition-all duration-300 text-gray-900 dark:text-white placeholder-gray-400"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                          aria-pressed={showPassword}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-slate-700/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                        >
                          <AnimatePresence mode="wait" initial={false}>
                            {showPassword ? (
                              <motion.span
                                key="eye-off"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={{ duration: 0.15 }}
                                className="block"
                              >
                                <EyeOff className="w-4 h-4" />
                              </motion.span>
                            ) : (
                              <motion.span
                                key="eye"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={{ duration: 0.15 }}
                                className="block"
                              >
                                <Eye className="w-4 h-4" />
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </button>
                      </div>
                    </motion.div>

                    <AnimatePresence>
                      {authError && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <Alert
                            type="error"
                            message={authError}
                            className="mt-4"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      <motion.button
                        type="submit"
                        className="group w-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 hover:from-blue-600 hover:via-blue-700 hover:to-blue-700 text-white font-semibold py-2.5 px-6 rounded-full transition-all duration-200 transform hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/30 relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={loading}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <motion.div
                          animate={{ x: ["-100%", "100%"] }}
                          transition={{
                            repeat: Infinity,
                            duration: 2,
                            ease: "linear",
                          }}
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"
                        />
                        {loading ? (
                          <div className="flex items-center justify-center">
                            <motion.div
                              className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"
                              animate={{ rotate: 360 }}
                              transition={{
                                duration: 1,
                                repeat: Infinity,
                                ease: "linear",
                              }}
                            />
                            Signing in...
                          </div>
                        ) : (
                          <span className="relative flex items-center justify-center gap-2">
                            Sign In
                            <ArrowRight className="w-5 h-5 transition-transform duration-200 group-hover:translate-x-1" />
                          </span>
                        )}
                      </motion.button>
                    </motion.div>
                  </motion.form>

                  <motion.div
                    className="mt-6 text-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                  >
                    <motion.button
                      type="button"
                      onClick={() => {
                        resetForgotPasswordFlow();
                        setStep("forgot-email");
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      Forgot your password or New Account?
                    </motion.button>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-6 flex items-center justify-center gap-4 text-xs text-gray-400 dark:text-gray-500">
            <span>© {new Date().getFullYear()} NGA Central MIS</span>
            <a
              href={WEBSITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
            >
              Privacy
            </a>
            <a
              href={WEBSITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
            >
              Terms
            </a>
            <a
              href={WEBSITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
            >
              Help
            </a>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default Login;
