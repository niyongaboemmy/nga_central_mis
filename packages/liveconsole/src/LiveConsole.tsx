import React, { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Keyboard, Loader2, OctagonX, Terminal } from "lucide-react";
import { PLAYGROUND_TEXTS, PLAYGROUND_THEME, type ConsoleChunk, type LiveConsoleTexts, type LiveConsoleTheme } from "./index";

export type { LiveConsoleTexts, LiveConsoleTheme };

/**
 * A live run's console, like a terminal: the program's output as it is printed, and — while
 * it runs — an input box right where the cursor is (after a prompt such as "Name: "), so the
 * person sees when the program is asking and answers in place.
 *
 * "Is it waiting for me?" from what we can see over a pipe:
 *  - it printed something without a newline and stopped (a prompt): it is asking;
 *  - it has been quiet for a moment: it may be — say so gently, the box is there anyway.
 * Enter sends the line, ↑/↓ recall earlier lines, Ctrl+D ends the input, Ctrl+C stops it.
 *
 * Colours are Tailwind classes an app may replace (`theme`) to fit its own palette; the
 * defaults (PLAYGROUND_THEME in index.ts) are the MIS Code Playground's.
 */

export interface LiveConsoleProps {
  chunks: ConsoleChunk[];
  running: boolean;
  stage: "build" | "run" | null;
  lastOutputAt: number;
  onLine: (text: string) => void;
  onEof: () => void;
  onInterrupt: () => void;
  /** Shown while nothing has happened yet. */
  emptyHint?: React.ReactNode;
  theme?: Partial<LiveConsoleTheme>;
  texts?: Partial<LiveConsoleTexts>;
  /** Prefix of the test ids (default "playground": playground-console, playground-stdin…). */
  testIdPrefix?: string;
  /** Classes of the scrolling transcript (font size, padding, background). */
  className?: string;
}

const QUIET_MS = 900;

const LiveConsole: React.FC<LiveConsoleProps> = ({ chunks, running, stage, lastOutputAt, onLine, onEof, onInterrupt, emptyHint, theme, texts, testIdPrefix = "playground", className }) => {
  const [value, setValue] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [history, setHistory] = useState<string[]>([]);
  const [recall, setRecall] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const focusedFor = useRef<number>(0);
  const th = { ...PLAYGROUND_THEME, ...theme };
  const tx = { ...PLAYGROUND_TEXTS, ...texts };
  const id = (name: string) => `${testIdPrefix}-${name}`;

  // The clock for "quiet for a moment" (only while running).
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [running]);

  const lastPrinted = useMemo(() => [...chunks].reverse().find((c) => c.kind === "out" || c.kind === "err" || c.kind === "in"), [chunks]);
  const accepting = running && stage !== "build";
  /** It printed a prompt (no newline after it) and stopped. */
  const asking = accepting && !!lastPrinted && lastPrinted.kind !== "in" && !lastPrinted.text.endsWith("\n") && now - lastOutputAt > 120;
  const quiet = accepting && !asking && now - lastOutputAt > QUIET_MS;

  // Keep the newest output in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chunks, accepting]);

  // When the program asks, put the cursor in the box (unless the person is typing elsewhere).
  useEffect(() => {
    if (!(asking || quiet) || focusedFor.current === lastOutputAt) return;
    focusedFor.current = lastOutputAt;
    const a = document.activeElement as HTMLElement | null;
    const elsewhere = a && a !== inputRef.current && (a.tagName === "TEXTAREA" || a.tagName === "INPUT" || a.isContentEditable) && !a.closest(".cm-editor");
    if (!elsewhere) inputRef.current?.focus({ preventScroll: true });
  }, [asking, quiet, lastOutputAt]);

  const send = () => {
    onLine(value);
    if (value.trim()) setHistory((h) => [...h.filter((x) => x !== value), value].slice(-50));
    setValue("");
    setRecall(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      send();
    } else if (e.key === "d" && e.ctrlKey) {
      e.preventDefault();
      if (value) send();
      onEof();
    } else if (e.key === "c" && e.ctrlKey && !window.getSelection()?.toString()) {
      e.preventDefault();
      onInterrupt();
    } else if (e.key === "ArrowUp" && history.length) {
      e.preventDefault();
      const i = recall === null ? history.length - 1 : Math.max(0, recall - 1);
      setRecall(i);
      setValue(history[i]);
    } else if (e.key === "ArrowDown" && recall !== null) {
      e.preventDefault();
      const i = recall + 1;
      if (i >= history.length) {
        setRecall(null);
        setValue("");
      } else {
        setRecall(i);
        setValue(history[i]);
      }
    }
  };

  const cls: Record<ConsoleChunk["kind"], string> = { out: th.out, err: th.err, in: th.in, note: "" };

  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid={id("console")}>
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="Program console"
        onClick={() => accepting && !window.getSelection()?.toString() && inputRef.current?.focus()}
        className={`flex-1 min-h-0 overflow-auto font-mono whitespace-pre-wrap break-words ${className ?? "text-[12.5px] leading-relaxed px-3 py-2.5"} ${accepting ? "cursor-text" : ""}`}
      >
        {!chunks.length && !running && emptyHint}
        {!chunks.length && running && stage === null && (
          <span className={`inline-flex items-center gap-2 font-sans text-sm ${th.starting}`}>
            <Loader2 className="w-4 h-4 animate-spin" /> {tx.starting}
          </span>
        )}
        {chunks.map((c, i) =>
          c.kind === "note" ? (
            <span key={i} className={`block my-1 font-sans text-xs italic ${th.note}`} data-note="">
              {c.text}
            </span>
          ) : (
            <span key={i} className={cls[c.kind]} data-kind={c.kind}>
              {c.text}
            </span>
          ),
        )}
        {accepting && (
          <span className={`inline-flex items-baseline align-baseline rounded-sm ${asking ? th.asking : ""}`}>
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label={tx.inputLabel}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className={`bg-transparent border-0 outline-none p-0 m-0 font-mono text-[12.5px] ${th.input}`}
              style={{ width: `${Math.max(asking ? 12 : 4, value.length + 2)}ch` }}
              data-testid={id("stdin")}
            />
          </span>
        )}
      </div>
      {running && (
        <div className={`flex flex-wrap items-center gap-2 min-h-[38px] px-3 py-1.5 border-t text-[12px] ${asking ? th.barAsking : th.bar}`} data-testid={id("console-status")}>
          {stage === "build" ? (
            <span className={`inline-flex items-center gap-1.5 ${th.status}`}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Building…
            </span>
          ) : asking ? (
            <span className={`inline-flex items-center gap-1.5 font-semibold ${th.waiting}`} data-testid={id("waiting")}>
              <Keyboard className="w-4 h-4 animate-pulse" /> {tx.waiting}
            </span>
          ) : quiet ? (
            <span className={`inline-flex items-center gap-1.5 ${th.status}`} data-testid={id("quiet")}>
              <Keyboard className="w-4 h-4" /> {tx.quiet}
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1.5 ${th.status}`}>
              <Terminal className="w-3.5 h-3.5" /> Running…
            </span>
          )}
          <span className="flex-1" />
          {stage !== "build" && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (value) send();
                  onEof();
                }}
                title="End of input (Ctrl+D): for programs that read until the input ends"
                className={`inline-flex items-center gap-1 h-7 px-2 rounded-md ${th.eof}`}
                data-testid={id("eof")}
              >
                <CornerDownLeft className="w-3.5 h-3.5" /> End input
              </button>
              <button
                type="button"
                onClick={onInterrupt}
                title="Interrupt the program (Ctrl+C)"
                className={`inline-flex items-center gap-1 h-7 px-2 rounded-md ${th.interrupt}`}
                data-testid={id("interrupt")}
              >
                <OctagonX className="w-3.5 h-3.5" /> Ctrl+C
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default LiveConsole;
