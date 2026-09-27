import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import SubjectIcon from "../../elearning/ui/subjectIcons";

interface Props {
  /** [subject, note count] for the subjects that did not fit in the chip row. */
  subjects: [string, number][];
  onPick: (subject: string) => void;
}

/**
 * The "+N more" chip at the end of the subject filter row.
 *
 * The row used to scroll sideways with its scrollbar hidden, so past about
 * seven subjects the rest were simply invisible. Now the row shows a few and
 * this chip lists the others, with a search box once there are enough to need one.
 */
const MoreSubjectsMenu: React.FC<Props> = ({ subjects, onPick }) => {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState("");
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const visible = useMemo(() => {
    const q = find.trim().toLowerCase();
    return q ? subjects.filter(([s]) => s.toLowerCase().includes(q)) : subjects;
  }, [subjects, find]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        onClick={() => {
          // Open leftwards when the chip sits near the right edge, so the menu
          // never runs off-screen (18rem = 288px, plus a 16px gutter).
          const left = buttonRef.current?.getBoundingClientRect().left ?? 0;
          setAlignRight(left + 288 > window.innerWidth - 16);
          setOpen((v) => !v);
          setFind("");
        }}
        aria-expanded={open}
        aria-haspopup="true"
        className="el-chip inline-flex min-h-[34px] items-center gap-1 whitespace-nowrap rounded-pill px-3.5 text-xs font-semibold transition-colors hover:text-gray-900 dark:hover:text-white"
      >
        +{subjects.length} more
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Solid, not el-float's 95% + blur: inside the sticky toolbar, which
          blurs too, the nested blur does not apply and the cards show through. */}
      {open && (
        <div className={`el-float absolute ${alignRight ? "right-0" : "left-0"} top-full z-30 mt-2 flex max-h-[min(22rem,60vh)] w-[min(18rem,calc(100vw-2rem))] flex-col rounded-2xl bg-white p-2 dark:bg-[#0b0d12]`}>
          {subjects.length > 6 && (
            <div className="relative mb-1.5 flex-shrink-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                value={find}
                onChange={(e) => setFind(e.target.value)}
                autoFocus
                type="search"
                aria-label="Find a subject"
                placeholder="Find a subject"
                className="el-input min-h-[36px] rounded-lg pl-8 pr-2 text-[13px]"
              />
            </div>
          )}
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {visible.map(([subject, count]) => (
              <li key={subject}>
                <button
                  onClick={() => {
                    onPick(subject);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/[0.06]"
                >
                  <SubjectIcon subjectName={subject} className="h-4 w-4 flex-shrink-0 text-gray-400" />
                  <span className="min-w-0 flex-1 truncate" title={subject}>
                    {subject}
                  </span>
                  <span className="text-xs tabular-nums text-gray-400">{count}</span>
                </button>
              </li>
            ))}
            {visible.length === 0 && (
              <li className="px-2.5 py-3 text-center text-xs text-gray-400">No subject matches.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default MoreSubjectsMenu;
