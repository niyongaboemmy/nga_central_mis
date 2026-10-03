import React from "react";
import { Clock, Sparkles } from "lucide-react";

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface Props {
  toc: TocItem[];
  activeId: string | null;
  /** 0..1 through the note. */
  progress: number;
  readingMinutes?: number | null;
  onJump: (id: string) => void;
  onAskAI?: () => void;
  /** The drawer has its own titled header, so the rail's "Contents" label would repeat it. */
  hideTitle?: boolean;
  className?: string;
}

/**
 * Where you are in the note, as a route rather than a list of links.
 *
 * A flat column of anchors tells you what the sections are called and nothing
 * else. A student reading a long note wants two other things at a glance: how
 * far through they are, and which parts they have already passed. So each
 * section is a stop on a line — filled behind you, ringed where you are,
 * hollow ahead — and the header counts the stops rather than only showing a
 * percentage.
 */
const ContentsRail: React.FC<Props> = ({
  toc,
  activeId,
  progress,
  readingMinutes,
  onJump,
  onAskAI,
  hideTitle = false,
  className = "",
}) => {
  const pct = Math.round(progress * 100);
  // Sub-headings are stops on the same line, but they do not count as sections.
  const tops = toc.filter((t) => t.level <= 2);
  const activeIndex = toc.findIndex((t) => t.id === activeId);
  const currentStop = activeId
    ? tops.filter((t) => toc.indexOf(t) <= activeIndex).length || 1
    : 0;

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header: the count first, the percentage as supporting detail. */}
      <div className="px-1">
        <div className="flex items-baseline justify-between gap-2">
          {!hideTitle && (
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Contents
            </p>
          )}
          <p className="text-[11px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">
            {currentStop > 0 ? `${currentStop} of ${tops.length}` : `${tops.length} sections`}
          </p>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-gray-200 dark:bg-white/10">
            <div
              className="h-full rounded-pill bg-brand-500 transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="w-8 text-right text-[11px] font-bold tabular-nums text-brand-600 dark:text-brand-200">
            {pct}%
          </span>
        </div>
      </div>

      {/* The route */}
      <nav aria-label="Note contents" className="relative mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        {/* The line every stop sits on. Inset to pass through the dot centres. */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-3 left-[7px] top-3 w-px bg-gray-200 dark:bg-white/10"
        />
        <ul className="relative space-y-0.5">
          {toc.map((t, i) => {
            const isActive = t.id === activeId;
            const isPassed = activeIndex > -1 && i < activeIndex;
            const isSub = t.level >= 3;
            return (
              <li key={t.id}>
                <button
                  onClick={() => onJump(t.id)}
                  aria-current={isActive ? "location" : undefined}
                  className={`group relative flex w-full items-start gap-3 rounded-lg py-1.5 pl-0 pr-2 text-left transition-colors ${
                    isActive
                      ? "text-brand-700 dark:text-brand-200"
                      : isPassed
                        ? "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                        : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                  }`}
                >
                  {/* The stop */}
                  <span
                    aria-hidden
                    className="relative z-10 mt-[5px] flex h-[15px] w-[15px] flex-shrink-0 items-center justify-center"
                  >
                    <span
                      className={`rounded-pill transition-all ${
                        isActive
                          ? "h-[11px] w-[11px] bg-brand-500 ring-4 ring-brand-500/20"
                          : isPassed
                            ? "h-[7px] w-[7px] bg-brand-500/70"
                            : isSub
                              ? "h-[5px] w-[5px] bg-gray-300 group-hover:bg-gray-400 dark:bg-white/25"
                              : "h-[7px] w-[7px] bg-gray-300 group-hover:bg-gray-400 dark:bg-white/25"
                      }`}
                    />
                  </span>
                  <span
                    className={`min-w-0 flex-1 leading-snug ${
                      isSub ? "pl-2 text-[12px]" : "text-[13px]"
                    } ${isActive ? "font-semibold" : isSub ? "font-normal" : "font-medium"}`}
                  >
                    {t.text}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer: the two things worth reaching for without scrolling back up. */}
      <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3 dark:border-white/[0.07]">
        {!!readingMinutes && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300">
            <Clock className="h-3 w-3" /> {readingMinutes} min
          </span>
        )}
        {onAskAI && (
          <button
            onClick={onAskAI}
            className="ml-auto inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1.5 text-[11px] font-semibold text-brand-600 transition-colors hover:bg-brand-50 dark:text-brand-200 dark:hover:bg-brand-500/10"
          >
            <Sparkles className="h-3 w-3" /> Ask AI
          </button>
        )}
      </div>
    </div>
  );
};

export default ContentsRail;
