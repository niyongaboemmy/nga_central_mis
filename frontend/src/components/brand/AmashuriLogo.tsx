import React, { useEffect, useId, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * The Amashuri mark: a school roof over four windows, and every window is an
 * activity tile -- "amashuri.com, school activities management". The amber tile
 * is the activity happening now; `live` makes it move from window to window.
 *
 * public/amashuri/* holds the same mark as static files (favicon, app icons).
 */

const TILES = [
  { x: 20, y: 31 },
  { x: 34, y: 31 },
  { x: 34, y: 44 },
  { x: 20, y: 44 },
];

export const AmashuriMark: React.FC<{
  size?: number;
  className?: string;
  /** draw the roof and pop the tiles in on mount */
  animated?: boolean;
  /** the amber "now" tile keeps moving round the windows */
  live?: boolean;
  title?: string;
}> = ({ size = 40, className, animated = false, live = false, title }) => {
  const id = useId().replace(/:/g, "");
  const reduced = useReducedMotion();
  const [now, setNow] = useState(1);
  const moving = live && !reduced;

  useEffect(() => {
    if (!moving) return;
    const t = window.setInterval(() => setNow((n) => (n + 1) % TILES.length), 1600);
    return () => window.clearInterval(t);
  }, [moving]);

  const intro = animated && !reduced;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b8cff" />
          <stop offset="0.55" stopColor="#2f56d9" />
          <stop offset="1" stopColor="#1a2b8c" />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id}-bg)`} />
      <path d="M0 16 A16 16 0 0 1 16 0 H48 A16 16 0 0 1 64 16 V26 Q32 34 0 26 Z" fill={`url(#${id}-shine)`} />
      <motion.path
        d="M13 29 L32 13 L51 29"
        fill="none"
        stroke="#fff"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={intro ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.7, ease: "easeInOut" }}
      />
      {TILES.map((t, i) => {
        const active = i === now;
        return (
          <motion.rect
            key={i}
            x={t.x}
            y={t.y}
            width="10"
            height="10"
            rx="3"
            style={{ transformOrigin: `${t.x + 5}px ${t.y + 5}px` }}
            initial={intro ? { scale: 0, opacity: 0 } : false}
            animate={{ scale: active && moving ? [1, 1.18, 1] : 1, opacity: 1, fill: active ? "#fbbf24" : "#ffffff" }}
            transition={{
              scale: { duration: 0.45, delay: intro ? 0.55 + i * 0.09 : 0 },
              opacity: { duration: 0.2, delay: intro ? 0.55 + i * 0.09 : 0 },
              fill: { duration: 0.35 },
            }}
            fillOpacity={!active && i === 2 ? 0.6 : 1}
          />
        );
      })}
    </svg>
  );
};

/** Mark + "amashuri" wordmark; the dot of the i is the amber activity tile. */
export const AmashuriLogo: React.FC<{
  size?: number;
  className?: string;
  animated?: boolean;
  live?: boolean;
  /** show ".com" after the name */
  domain?: boolean;
  /** text colour classes for the wordmark */
  textClass?: string;
}> = ({ size = 36, className = "", animated, live, domain = false, textClass = "text-slate-900 dark:text-white" }) => (
  <span className={`inline-flex items-center gap-2.5 ${className}`}>
    <AmashuriMark size={size} animated={animated} live={live} />
    <span className="sr-only">Amashuri</span>
    <span className={`relative font-extrabold tracking-tight leading-none ${textClass}`} style={{ fontSize: size * 0.56 }} aria-hidden>
      amashur
      <span className="relative inline-block">
        {"ı"}
        <span
          className="absolute left-1/2 rounded-[2px] bg-amber-400"
          style={{ width: size * 0.13, height: size * 0.13, top: size * 0.01, transform: "translateX(-50%)" }}
          aria-hidden
        />
      </span>
      {domain && <span className="font-semibold opacity-50">.com</span>}
    </span>
  </span>
);

export default AmashuriLogo;
