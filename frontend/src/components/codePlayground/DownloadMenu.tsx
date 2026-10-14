import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, CloudUpload, Download, HardDriveDownload } from "lucide-react";

/**
 * Keeping the code: "Download" (a file to this device — the file, or a .zip of the
 * project) or "Save to Documents" (in the person's MIS documents). ↑/↓ move, Esc closes.
 */
export interface DownloadMenuProps {
  /** What a download gives, e.g. "main.py" or "garage.zip (3 files)". */
  downloadLabel: string;
  onDownload: () => void;
  onSaveToDocuments: () => void;
  showLabel?: boolean;
  className?: string;
}

const isMac = typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.platform || navigator.userAgent);

const DownloadMenu: React.FC<DownloadMenuProps> = ({ downloadLabel, onDownload, onSaveToDocuments, showLabel, className }) => {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    itemsRef.current[0]?.focus();
    const onDown = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const choose = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = itemsRef.current.filter(Boolean) as HTMLButtonElement[];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      close();
    } else if (e.key === "Tab") setOpen(false);
  };

  const item = (i: number, icon: React.ReactNode, title: string, hint: string, fn: () => void, testId: string, kbd?: string) => (
    <button
      ref={(el) => (itemsRef.current[i] = el)}
      type="button"
      role="menuitem"
      onClick={() => choose(fn)}
      className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-slate-100 dark:hover:bg-white/10 focus:bg-slate-100 dark:focus:bg-white/10 outline-none"
      data-testid={testId}
    >
      <span className="mt-0.5 text-brand-600 dark:text-brand-200">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
          {title}
          {kbd && <kbd className="ml-auto font-sans text-[10px] font-normal text-slate-500 dark:text-slate-400">{kbd}</kbd>}
        </span>
        <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{hint}</span>
      </span>
    </button>
  );

  return (
    <div ref={boxRef} className={`relative ${className ?? ""}`} onKeyDown={open ? onKeyDown : undefined}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Download or save to Documents"
        aria-label="Download or save code"
        className="inline-flex items-center justify-center gap-1 h-8 min-w-[32px] px-2 rounded-lg text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors"
        data-testid="playground-download"
      >
        <Download className="w-4 h-4" />
        {showLabel && <span className="hidden lg:inline">Save</span>}
        <ChevronDown className={`w-3 h-3 opacity-70 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" aria-label="Keep your code" className="absolute right-0 z-40 mt-1.5 w-[min(300px,calc(100vw-32px))] p-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#161b22] shadow-2xl ring-1 ring-black/5 animate-fade-in">
          {item(0, <HardDriveDownload className="w-4 h-4" />, "Download", `${downloadLabel} to this device`, onDownload, "playground-download-file")}
          {item(1, <CloudUpload className="w-4 h-4" />, "Save to Documents", "Keep it in your MIS documents", onSaveToDocuments, "playground-save-docs", isMac ? "⌘S" : "Ctrl+S")}
        </div>
      )}
    </div>
  );
};

export default DownloadMenu;
