import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Eye, LifeBuoy, LogOut, Pencil } from "lucide-react";
import { endSupportSession, fmtLeft, useSupportSession } from "./supportSession";

/**
 * Persistent "Support session" chip: countdown + End. Renders nothing outside
 * a support session, so any banner (TenantStatusBanner) can mount it always.
 */
export const SupportSessionChip: React.FC<{ className?: string }> = ({ className }) => {
  const { session, secondsLeft } = useSupportSession();
  const reduced = useReducedMotion();
  if (!session) return null;
  const end = () => {
    const to = endSupportSession();
    window.location.assign(to);
  };
  const low = secondsLeft < 600;
  const ModeIcon = session.mode === "WRITE" ? Pencil : Eye;
  return (
    <div
      role="status"
      aria-label="Support session"
      className={`inline-flex items-center gap-2 rounded-full bg-violet-600 py-1 pl-2 pr-1 text-xs font-semibold text-white shadow-lg ${className ?? ""}`}
    >
      <motion.span animate={reduced ? undefined : { rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }} className="inline-flex">
        <LifeBuoy className="h-4 w-4" aria-hidden />
      </motion.span>
      <span className="hidden sm:inline">Support</span>
      {session.schoolName && <span className="hidden max-w-[10rem] truncate opacity-90 md:inline">· {session.schoolName}</span>}
      {session.mode && (
        <span title={session.mode === "WRITE" ? "Read & write" : "Read only"}>
          <ModeIcon className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">{session.mode === "WRITE" ? "Read and write" : "Read only"}</span>
        </span>
      )}
      <span className={`rounded-full px-2 py-0.5 tabular-nums ${low ? "bg-red-500" : "bg-white/20"}`}>
        <span className="sr-only">Time left </span>
        {secondsLeft > 0 ? fmtLeft(secondsLeft) : "0:00"}
      </span>
      <button
        type="button"
        onClick={end}
        className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-violet-800 hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden />
        End
      </button>
    </div>
  );
};

export default SupportSessionChip;
