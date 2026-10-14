import React, { useEffect, useRef, useState } from "react";
import { FileCode2, MoreHorizontal, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { MAX_FILES, pathProblem, type PlayFile } from "./project";

/**
 * The playground's files as editor tabs: open one, add one (named for the language — the
 * extension decides its colours), rename, delete, and choose the main file (what runs, or
 * the first page shown). Self-contained (no app dialogs), so it works inside lesson blocks.
 */
export interface FileTabsProps {
  files: PlayFile[];
  entry: string;
  active: string;
  onSelect: (path: string) => void;
  onAdd: (path: string) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (path: string) => void;
  onSetEntry: (path: string) => void;
  /** Name offered for a new file. */
  suggest: () => string;
  /** Files changed since the start (a dot on their tab). */
  changed?: Set<string>;
  compact?: boolean;
}

const FileTabs: React.FC<FileTabsProps> = ({ files, entry, active, onSelect, onAdd, onRename, onDelete, onSetEntry, suggest, changed, compact }) => {
  const [adding, setAdding] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; value: string } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const addError = adding !== null ? pathProblem(adding, files) : null;
  const renameError = renaming ? pathProblem(renaming.value, files, renaming.path) : null;

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && (setMenu(null), setConfirmDelete(null));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), setMenu(null), setConfirmDelete(null));
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [menu]);

  const commitAdd = () => {
    if (adding === null || addError) return;
    onAdd(adding.trim());
    setAdding(null);
  };
  const commitRename = () => {
    if (!renaming) return;
    if (renaming.value.trim() !== renaming.path && !renameError) onRename(renaming.path, renaming.value.trim());
    setRenaming(null);
  };

  const inputCls =
    "h-7 w-40 px-2 rounded-md border bg-white dark:bg-[#0d1117] text-[12px] font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40";

  return (
    <div className={`relative flex items-center gap-0.5 ${compact ? "h-9" : "h-9"} px-1.5 border-b border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/[0.02] text-[12px]`} data-testid="playground-files">
      <div role="group" aria-label="Files" className="flex items-center gap-0.5 min-w-0 overflow-x-auto overflow-y-hidden flex-1 [scrollbar-width:thin]">
        {files.map((f) => {
          const isActive = f.path === active;
          if (renaming?.path === f.path) {
            return (
              <span key={f.path} className="inline-flex flex-col">
                <input
                  autoFocus
                  aria-label={`New name for ${f.path}`}
                  className={`${inputCls} ${renameError ? "border-danger-500" : "border-slate-300 dark:border-white/20"}`}
                  value={renaming.value}
                  onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  onBlur={commitRename}
                />
              </span>
            );
          }
          return (
            <span key={f.path} className="relative inline-flex items-center flex-shrink-0">
              <button
                type="button"
                aria-current={isActive ? "true" : undefined}
                aria-label={`${f.path}${f.path === entry ? " (main file)" : ""}${isActive ? ", open" : ""}`}
                onClick={() => onSelect(f.path)}
                onDoubleClick={() => setRenaming({ path: f.path, value: f.path })}
                title={f.path === entry ? `${f.path} — main file (runs first)` : f.path}
                className={`relative inline-flex items-center gap-1.5 h-9 pl-2 ${isActive ? "pr-1" : "pr-2"} font-medium whitespace-nowrap transition-colors ${
                  isActive ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
                data-testid="playground-file-tab"
                data-path={f.path}
              >
                {f.path === entry ? <Play className="w-3 h-3 fill-current text-success-700 dark:text-success-500" aria-label="main file" /> : <FileCode2 className="w-3.5 h-3.5 text-brand-500" />}
                <span className="font-mono">{f.path}</span>
                {changed?.has(f.path) && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-label="changed" />}
                {isActive && <span className="absolute left-1.5 right-1.5 -bottom-px h-0.5 rounded-full bg-brand-500" />}
              </button>
              {isActive && (
                <button
                  type="button"
                  onClick={() => setMenu(menu === f.path ? null : f.path)}
                  aria-label={`More for ${f.path}`}
                  aria-haspopup="menu"
                  aria-expanded={menu === f.path}
                  className="h-6 w-6 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/70 dark:hover:bg-white/10"
                  data-testid="playground-file-menu"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              )}
            </span>
          );
        })}
        {adding !== null ? (
          <input
            autoFocus
            aria-label="New file name"
            placeholder="name.ext"
            className={`${inputCls} ${addError ? "border-danger-500" : "border-slate-300 dark:border-white/20"}`}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAdd();
              if (e.key === "Escape") setAdding(null);
            }}
            onBlur={() => (adding && !addError ? commitAdd() : setAdding(null))}
            data-testid="playground-new-file"
          />
        ) : (
          files.length < MAX_FILES && (
            <button
              type="button"
              onClick={() => setAdding(suggest())}
              className="flex-shrink-0 inline-flex items-center gap-1 h-7 px-2 ml-0.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-brand-600 hover:bg-slate-200/60 dark:hover:bg-white/10"
              title="Add a file"
              aria-label="Add a file"
              data-testid="playground-add-file"
            >
              <Plus className="w-3.5 h-3.5" />
              {!compact && <span>File</span>}
            </button>
          )
        )}
      </div>
      {(addError && adding) || (renameError && renaming) ? (
        <p role="alert" className="absolute left-2 top-full mt-1 z-30 rounded-md bg-danger-100 dark:bg-red-500/20 text-danger-700 dark:text-red-300 text-[11px] px-2 py-1 shadow">
          {addError ?? renameError}
        </p>
      ) : null}
      {menu && (
        <div ref={menuRef} role="menu" className="absolute right-2 top-full mt-1 z-30 w-56 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#161b22] shadow-xl p-1 text-[13px]">
          {confirmDelete === menu ? (
            <div className="p-2">
              <p className="text-slate-700 dark:text-slate-200">
                Delete <span className="font-mono">{menu}</span>?
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="h-8 px-3 rounded-lg bg-danger-700 text-white text-xs font-semibold"
                  onClick={() => {
                    onDelete(menu);
                    setMenu(null);
                    setConfirmDelete(null);
                  }}
                  data-testid="playground-confirm-delete"
                >
                  Delete
                </button>
                <button type="button" className="h-8 px-3 rounded-lg text-xs" onClick={() => setConfirmDelete(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <button type="button" role="menuitem" className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => (setRenaming({ path: menu, value: menu }), setMenu(null))}>
                <Pencil className="w-3.5 h-3.5" /> Rename
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={menu === entry}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50"
                onClick={() => (onSetEntry(menu), setMenu(null))}
                data-testid="playground-set-main"
              >
                <Play className="w-3.5 h-3.5" /> {menu === entry ? "This is the main file" : "Make it the main file"}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={files.length < 2}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-danger-700 dark:text-red-400 hover:bg-danger-100/60 dark:hover:bg-red-500/10 disabled:opacity-50"
                onClick={() => setConfirmDelete(menu)}
                data-testid="playground-delete-file"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default FileTabs;
