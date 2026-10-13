import React, { Suspense, lazy, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { DEFAULT_BLOCK, type PlaygroundBlock } from "./playgroundData";
import { languageById } from "./languages";
import type { WorkbenchProps } from "./PlaygroundWorkbench";

const PlaygroundWorkbench = lazy(() => import("./PlaygroundWorkbench"));

/**
 * The Code Playground as a drop-in component — use it anywhere code should be
 * written and run:
 *
 *   <CodePlayground language="python" code={"print('hi')"} />                    // inline block
 *   <CodePlayground mode="exercise" language="java" instructions="…" expected="42" />
 *   <CodePlayground variant="page" language="cpp" onLanguageChange={…} />       // full page
 *
 * The editor, formatter and runner load on demand (the first render shows a light
 * placeholder). Server languages run on Task Mentor's code runner; HTML/CSS, browser
 * JavaScript and React in a sandboxed frame. To open it over the page instead, call
 * openPlayground() from ./store (needs CodePlaygroundHost, mounted in App).
 */
export interface CodePlaygroundProps
  extends Partial<Omit<PlaygroundBlock, "language" | "code">>,
    Pick<WorkbenchProps, "autoRun" | "source" | "onClose" | "onExpand" | "onSave" | "fullscreen" | "onToggleFullscreen" | "onLanguageChange" | "onShare" | "onBack"> {
  /** Playground language id (languages.ts); defaults to Python. */
  language?: string;
  /** Starting code; defaults to the language's starter program. */
  code?: string;
  variant?: WorkbenchProps["variant"];
  className?: string;
}

const CodePlayground: React.FC<CodePlaygroundProps> = ({ language, code, variant = "inline", className, mode, title, instructions, stdin, expected, hint, solution, ...rest }) => {
  const block = useMemo<PlaygroundBlock>(() => {
    const lang = languageById(language) ?? languageById(DEFAULT_BLOCK.language)!;
    return {
      ...DEFAULT_BLOCK,
      language: lang.id,
      code: code ?? lang.starter,
      mode: mode ?? "example",
      title: title ?? "",
      instructions: instructions ?? "",
      stdin: stdin ?? "",
      expected: expected ?? "",
      hint: hint ?? "",
      solution: solution ?? "",
    };
  }, [language, code, mode, title, instructions, stdin, expected, hint, solution]);

  return (
    <div className={className ?? (variant === "inline" ? undefined : "h-full")}>
      <Suspense
        fallback={
          <div className="h-full min-h-[160px] flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400" role="status">
            <Loader2 className="w-4 h-4 animate-spin" /> Opening the Code Playground…
          </div>
        }
      >
        <PlaygroundWorkbench key={`${block.language}\u0000${block.code}`} block={block} variant={variant} {...rest} />
      </Suspense>
    </div>
  );
};

export default CodePlayground;
