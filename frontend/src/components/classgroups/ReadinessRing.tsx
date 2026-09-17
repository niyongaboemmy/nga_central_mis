import React from "react";

interface ReadinessRingProps {
  value: number;
  total: number;
  /** Diameter in px. */
  size?: number;
  /** Rendered next to the ring; omit for a bare indicator. */
  label?: string;
  className?: string;
}

const ringColor = (ratio: number, empty: boolean) => {
  if (empty) return "text-gray-300 dark:text-gray-600";
  if (ratio >= 1) return "text-emerald-500";
  if (ratio >= 0.5) return "text-amber-500";
  return "text-red-500";
};

/**
 * Small progress donut used by the navigator and the setup checklist.
 * Always paired with the numeric `n/total` so completeness is never conveyed
 * by colour alone.
 */
const ReadinessRing: React.FC<ReadinessRingProps> = ({
  value,
  total,
  size = 20,
  label,
  className = "",
}) => {
  const ratio = total > 0 ? Math.min(1, value / total) : 0;
  const radius = (size - 3) / 2;
  const circumference = 2 * Math.PI * radius;
  const text = label ?? `${value}/${total}`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      role="img"
      aria-label={`${text} complete`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0 -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={3}
          className="stroke-gray-200 dark:stroke-slate-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          className={`transition-[stroke-dashoffset] duration-500 stroke-current ${ringColor(
            ratio,
            total === 0,
          )}`}
        />
      </svg>
      <span
        className={`text-[11px] font-medium tabular-nums ${ringColor(
          ratio,
          total === 0,
        )}`}
      >
        {text}
      </span>
    </span>
  );
};

export default ReadinessRing;
