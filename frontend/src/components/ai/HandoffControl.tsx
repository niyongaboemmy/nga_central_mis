import React, { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ClipboardCopy, ClipboardPaste, ExternalLink, Loader2, X } from "lucide-react";
import { ToastStore } from "../../services/api";
import { useAiPolicy } from "../../api/aiPolicy";

/**
 * "Open in my AI ▾" + "Paste the answer" (EXTERNAL_AI_CONTRACT.md §1). The person's own
 * Claude / ChatGPT / Gemini subscription is never called by the MIS: we fetch the exact prompt
 * the feature would send (prompt mode), open their chat with it, and turn the answer they paste
 * back into the feature's normal result (import mode). We never submit anything ourselves.
 *
 *   <HandoffControl
 *     run={(extra) => api.post(url, { ...body, ...extra }).then((r) => r.data)}
 *     onImported={(body) => handleSuccess(body)}
 *   />
 *
 * `run` calls the same endpoint as the panel's AI button with `extra` merged into the body and
 * returns the response body. Shown only when hand-off is available to this person.
 */

export type HandoffRequest = { mode: "prompt"; pupilConsent: boolean } | { mode: "import"; text: string };
export type HandoffExtra = { aiHandoff: HandoffRequest };
export type HandoffTarget = "claude" | "chatgpt" | "gemini" | "copy";

/** Prompts up to this length go into the link itself; longer ones are copied. */
export const PREFILL_MAX = 6000;

const TARGETS: Array<{ id: HandoffTarget; label: string; hint: string }> = [
  { id: "claude", label: "Claude", hint: "claude.ai" },
  { id: "chatgpt", label: "ChatGPT", hint: "chatgpt.com" },
  { id: "gemini", label: "Gemini", hint: "copies, then opens gemini.google.com" },
  { id: "copy", label: "Copy prompt", hint: "for any other AI" },
];

/** Where to send a prompt, and whether the link carries it (otherwise it is copied first). */
export function handoffLink(target: HandoffTarget, prompt: string): { url: string | null; prefilled: boolean } {
  const fits = prompt.length <= PREFILL_MAX;
  const q = encodeURIComponent(prompt);
  switch (target) {
    case "claude":
      return fits ? { url: `https://claude.ai/new?q=${q}`, prefilled: true } : { url: "https://claude.ai/new", prefilled: false };
    case "chatgpt":
      return fits ? { url: `https://chatgpt.com/?q=${q}`, prefilled: true } : { url: "https://chatgpt.com/", prefilled: false };
    case "gemini":
      return { url: "https://gemini.google.com/app", prefilled: false };
    default:
      return { url: null, prefilled: false };
  }
}

const NAMES: Record<HandoffTarget, string> = { claude: "Claude", chatgpt: "ChatGPT", gemini: "Gemini", copy: "your AI" };

const ERROR_TEXT: Record<string, string> = {
  AI_HANDOFF_OFF: "Open in my AI is turned off for the school.",
  AI_HANDOFF_NOT_ALLOWED: "Your role can't use your own Claude or ChatGPT with NGA.",
};

const errorText = (e: any): string => {
  const body = e?.response?.data;
  if (body?.code === "AI_HANDOFF_PUPIL_CONSENT") return body.message || "This prompt includes a pupil's details. Tick \"Include pupil details\" first.";
  return (body?.code && ERROR_TEXT[body.code]) || body?.message || e?.message || "Something went wrong. Please try again.";
};

/** The `handoff` payload from a prompt-mode answer, wherever the caller's API layer put it. */
const handoffOf = (body: any): { prompt: string } | null => {
  const h = body?.handoff ?? body?.data?.handoff;
  return h && typeof h.prompt === "string" ? h : null;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

interface Props {
  run: (extra: HandoffExtra) => Promise<unknown>;
  /** The panel's normal success path, with the import-mode response body. */
  onImported: (body: any) => void | Promise<void>;
  /** The prompt carries a named pupil's data: offer an (unticked) consent box. */
  pupilData?: boolean;
  disabled?: boolean;
  className?: string;
  /** Called before a request, e.g. to validate the panel's form; return false to stop. */
  beforeRun?: () => boolean;
}

const HandoffControl: React.FC<Props> = ({ run, onImported, pupilData = false, disabled, className = "", beforeRun }) => {
  const view = useAiPolicy();
  const ext = view?.me?.external;
  const id = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState<"prompt" | "import" | null>(null);
  const [consent, setConsent] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [last, setLast] = useState<{ target: HandoffTarget; prompt: string } | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  if (!ext?.handoff || (pupilData && !ext.pupilConsent)) return null;

  const openPrompt = async (target: HandoffTarget) => {
    setMenuOpen(false);
    setError(null);
    setNote(null);
    if (beforeRun && !beforeRun()) return;
    setBusy("prompt");
    try {
      const body = await run({ aiHandoff: { mode: "prompt", pupilConsent: pupilData && consent } });
      const h = handoffOf(body);
      if (!h) throw new Error("The server didn't return a prompt for this request.");
      setLast({ target, prompt: h.prompt });
      const { url, prefilled } = handoffLink(target, h.prompt);
      let copied = false;
      if (!prefilled) copied = await copyText(h.prompt);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      setShowPrompt(!prefilled && !copied);
      const msg = prefilled
        ? `${NAMES[target]} opened with the prompt. Check it, send it there, then paste the answer here.`
        : copied
          ? `Prompt copied — paste it in${url ? ` ${NAMES[target]}` : ""}, then paste the answer here.`
          : "Copy the prompt below, paste it in your AI, then paste the answer here.";
      setNote(msg);
      if (copied) ToastStore.getShowToast()?.("Prompt copied — paste it in", "success");
      setPasteOpen(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const importAnswer = async () => {
    if (!text.trim()) {
      setError("Paste the answer from your AI first.");
      return;
    }
    if (beforeRun && !beforeRun()) return;
    setError(null);
    setBusy("import");
    try {
      const body = await run({ aiHandoff: { mode: "import", text } });
      await onImported(body);
      setText("");
      setPasteOpen(false);
      setNote(null);
      setLast(null);
      setShowPrompt(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const reopen = last && handoffLink(last.target, last.prompt).url;
  const btn =
    "inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700/60 dark:bg-gray-800/40 dark:text-gray-100 dark:hover:bg-gray-800";

  return (
    <div className={`text-xs ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className={btn}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={`${id}-menu`}
            disabled={disabled || !!busy}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {busy === "prompt" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ExternalLink className="h-3.5 w-3.5" aria-hidden />}
            Open in my AI
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </button>
          {menuOpen && (
            <div
              id={`${id}-menu`}
              role="menu"
              aria-label="Open in my AI"
              className="absolute left-0 z-30 mt-1 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
            >
              {TARGETS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="menuitem"
                  onClick={() => void openPrompt(t.id)}
                  className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none dark:hover:bg-gray-800 dark:focus:bg-gray-800"
                >
                  <span className="text-sm font-medium text-slate-900 dark:text-gray-100">{t.label}</span>
                  <span className="text-xs text-slate-600 dark:text-slate-300">{t.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {!pasteOpen && (
          <button type="button" className="inline-flex items-center gap-1 font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-300" onClick={() => setPasteOpen(true)} disabled={disabled}>
            <ClipboardPaste className="h-3.5 w-3.5" aria-hidden /> Paste the answer
          </button>
        )}
        {pupilData && (
          <label className="inline-flex items-center gap-1.5 text-slate-700 dark:text-gray-200">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" />
            Include pupil details
          </label>
        )}
      </div>
      {pupilData && !consent && !pasteOpen && (
        <p className="mt-1 text-slate-600 dark:text-slate-300">This uses a pupil's record. It goes to your own AI only if you tick "Include pupil details".</p>
      )}

      {note && (
        <p role="status" className="mt-2 text-slate-700 dark:text-gray-200">
          {note}
          {reopen && (
            <>
              {" "}
              <a href={reopen} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 underline underline-offset-2 dark:text-blue-300">
                Open {NAMES[last!.target]} again
              </a>
            </>
          )}
        </p>
      )}
      {showPrompt && last && (
        <div className="mt-2">
          <label htmlFor={`${id}-prompt`} className="mb-1 flex items-center gap-1 font-semibold text-slate-700 dark:text-gray-200">
            <ClipboardCopy className="h-3.5 w-3.5" aria-hidden /> The prompt
          </label>
          <textarea
            id={`${id}-prompt`}
            readOnly
            value={last.prompt}
            onFocus={(e) => e.currentTarget.select()}
            rows={4}
            className="w-full rounded-xl border border-slate-300 bg-slate-50 p-2 font-mono text-[11px] text-slate-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          />
        </div>
      )}

      {pasteOpen && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-gray-700/60 dark:bg-gray-800/40">
          <div className="mb-1 flex items-center justify-between gap-2">
            <label htmlFor={`${id}-paste`} className="font-semibold text-slate-800 dark:text-gray-100">
              Paste the answer
            </label>
            <button
              type="button"
              aria-label="Close paste the answer"
              onClick={() => {
                setPasteOpen(false);
                setError(null);
              }}
              className="rounded p-0.5 text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          <textarea
            id={`${id}-paste`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="Paste your AI's whole reply here, including the ```json block."
            className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs text-slate-900 placeholder:text-slate-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-slate-400"
          />
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-600 dark:text-slate-300">It is checked like any AI answer before anything is saved.</span>
            <button
              type="button"
              onClick={() => void importAnswer()}
              disabled={disabled || !!busy || !text.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "import" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              Import
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </p>
      )}
    </div>
  );
};

export default HandoffControl;
