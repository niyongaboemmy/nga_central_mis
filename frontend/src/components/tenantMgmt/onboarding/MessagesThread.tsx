import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, MessageCircle, Paperclip, Send, X } from "lucide-react";
import { applicantApi, type ThreadMessage } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { EmptyState } from "../kit";
import { ErrorLine, cx, iconBtn } from "../register/fields";
import { apiErr } from "../register/wizardState";

/** Chat with the reviewer (ApplicationMessage). Re-reads when `refreshKey` changes. */
const MessagesThread: React.FC<{ applicationId: number; refreshKey: unknown; onRead?: () => void }> = ({ applicationId, refreshKey, onRead }) => {
  const m = useMotion();
  const [items, setItems] = useState<ThreadMessage[] | null>(null);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const readCb = useRef(onRead);
  readCb.current = onRead;

  const load = useCallback(async () => {
    try {
      const r = await applicantApi.messages(applicationId);
      setItems(r.filter((x) => !x.internal));
      readCb.current?.();
    } catch {
      setItems((x) => x ?? []);
    }
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items?.length]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!body.trim() && !file) return;
    setBusy(true);
    setError(null);
    try {
      const msg = await applicantApi.sendMessage(applicationId, body.trim(), file ?? undefined);
      setItems((x) => [...(x ?? []), msg]);
      setBody("");
      setFile(null);
    } catch (e2) {
      setError(apiErr(e2, "Not sent").message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col">
      {items === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-blue-500" aria-label="Loading messages" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={MessageCircle} title="No messages" />
      ) : (
        <ol ref={list} className="max-h-96 space-y-2 overflow-y-auto pr-1" aria-label="Messages" aria-live="polite">
          <AnimatePresence initial={false}>
            {items.map((x) =>
              x.author === "SYSTEM" ? (
                <motion.li key={x.id} {...m("fade")} className="text-center text-xs text-gray-600 dark:text-gray-300">
                  {x.body}
                </motion.li>
              ) : (
                <motion.li key={x.id} {...m("reveal")} className={cx("flex", x.author === "APPLICANT" ? "justify-end" : "justify-start")}>
                  <div
                    className={cx(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                      x.author === "APPLICANT" ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100",
                    )}
                  >
                    {x.author !== "APPLICANT" && x.authorName && <p className="mb-0.5 text-xs font-semibold text-gray-600 dark:text-gray-300">{x.authorName}</p>}
                    {x.body && <p className="whitespace-pre-wrap break-words">{x.body}</p>}
                    {x.attachmentUrl && (
                      <a href={x.attachmentUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold underline">
                        <Paperclip className="h-3 w-3" aria-hidden />
                        File
                      </a>
                    )}
                    <time dateTime={x.at} className={cx("mt-0.5 block text-[11px]", x.author === "APPLICANT" ? "text-white/80" : "text-gray-600 dark:text-gray-300")}>
                      {new Date(x.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                    </time>
                  </div>
                </motion.li>
              ),
            )}
          </AnimatePresence>
        </ol>
      )}
      <form onSubmit={send} className="mt-3 flex items-end gap-1 rounded-2xl border border-gray-200 bg-gray-50 p-1.5 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30 dark:border-gray-700/30 dark:bg-gray-900/50">
        <input ref={fileInput} type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="button" className={iconBtn} onClick={() => fileInput.current?.click()}>
          <Paperclip className="h-4 w-4" aria-hidden />
          <span className="sr-only">Attach a file</span>
        </button>
        <div className="min-w-0 flex-1">
          {file && (
            <span className="mb-1 inline-flex max-w-full items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-800 dark:bg-gray-700 dark:text-gray-100">
              <span className="truncate">{file.name}</span>
              <button type="button" onClick={() => setFile(null)} className="rounded-full">
                <X className="h-3 w-3" aria-hidden />
                <span className="sr-only">Remove file</span>
              </button>
            </span>
          )}
          <label htmlFor={`msg-${applicationId}`} className="sr-only">
            Message
          </label>
          <textarea
            id={`msg-${applicationId}`}
            rows={1}
            value={body}
            placeholder="Message…"
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            className="block max-h-32 w-full resize-none bg-transparent px-1 py-1.5 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none dark:text-white dark:placeholder:text-gray-400"
          />
        </div>
        <motion.button type="submit" {...m("tap")} disabled={busy || (!body.trim() && !file)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          <span className="sr-only">Send</span>
        </motion.button>
      </form>
      <ErrorLine error={error} />
    </div>
  );
};

export default MessagesThread;
