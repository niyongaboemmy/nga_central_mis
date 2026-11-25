import React, { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ExternalLink, Eye, LifeBuoy, Pencil } from "lucide-react";
import { EmptyState, StatusPill } from "../kit";
import { platformApi, type SupportSession } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { Btn, SkeletonRows, act, cx, fmtDateTime, surface, usePlatform } from "./platformShared";
import { fmtLeft, supportSessionUrl } from "./supportSession";

type Row = SupportSession & { tid: number; schoolName: string };

/** Ring that empties as the session runs out. */
export const TimeLeftRing: React.FC<{ startsAt: string; expiresAt: string; now: number; size?: number }> = ({ startsAt, expiresAt, now, size = 48 }) => {
  const reduced = useReducedMotion();
  const start = new Date(startsAt).getTime();
  const end = new Date(expiresAt).getTime();
  const left = Math.max(0, end - now);
  const ratio = end > start ? Math.min(1, left / (end - start)) : 0;
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const color = ratio < 0.15 ? "stroke-red-500" : ratio < 0.4 ? "stroke-amber-500" : "stroke-emerald-500";
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={5} className="fill-none stroke-gray-200 dark:stroke-gray-800" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={5}
          strokeLinecap="round"
          className={cx("fill-none", color)}
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - ratio) }}
          transition={{ duration: reduced ? 0 : 0.6 }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums text-gray-800 dark:text-gray-100">
        {fmtLeft(Math.round(left / 1000)).replace(/:\d\d$/, "m")}
      </span>
      <span className="sr-only">{Math.round(left / 60000)} minutes left</span>
    </span>
  );
};

const SupportPage: React.FC = () => {
  const { can } = usePlatform();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<number | null>(null);
  const m = useMotion();
  useEffect(() => {
    platformApi.supportSessions().then(setRows, () => setRows([]));
    const h = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(h);
  }, []);
  if (!rows) return <SkeletonRows rows={3} label="Loading support sessions" />;
  if (!rows.length) return <EmptyState icon={LifeBuoy} title="No sessions" />;
  const sorted = [...rows].sort((a, b) => Number(b.active) - Number(a.active) || b.startsAt.localeCompare(a.startsAt));
  return (
    <div className={cx(surface.card, "p-2")}>
    <ul className={cx("divide-y", surface.divide)} aria-label="Support sessions">
      <AnimatePresence initial={false}>
        {sorted.map((s) => {
          const live = s.active && !s.revokedAt && new Date(s.expiresAt).getTime() > now;
          const ModeIcon = s.mode === "WRITE" ? Pencil : Eye;
          return (
            <motion.li key={s.id} layout {...m("reveal")} className={cx("flex items-center gap-3 rounded-xl p-3", live ? "bg-blue-50/70 dark:bg-blue-500/10" : "opacity-75")}>
              {live ? <TimeLeftRing startsAt={s.startsAt} expiresAt={s.expiresAt} now={now} /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800/70"><LifeBuoy className="h-5 w-5" aria-hidden /></span>}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-semibold text-gray-900 dark:text-white">
                  <span
                    className={cx("inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full", s.mode === "WRITE" ? "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200" : "bg-blue-100 text-blue-800 dark:bg-blue-400/15 dark:text-blue-200")}
                    title={s.mode === "WRITE" ? "Read & write" : "Read only"}
                  >
                    <ModeIcon className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only">{s.mode === "WRITE" ? "Read and write" : "Read only"}</span>
                  </span>
                  <span className="truncate">{s.schoolName}</span>
                </p>
                <p className="truncate text-xs text-gray-600 dark:text-gray-300">
                  {s.reason ?? "—"}
                  {s.openedBy && ` · ${s.openedBy} ${fmtDateTime(s.openedAt)}`}
                </p>
              </div>
              {live ? (
                can("support") && (
                  <Btn
                    size="sm"
                    tone="primary"
                    icon={ExternalLink}
                    busy={busy === s.id}
                    onClick={async () => {
                      setBusy(s.id);
                      const out = await act(() => platformApi.openSupportSession(s.id));
                      setBusy(null);
                      if (out) window.open(supportSessionUrl(out, { mode: s.mode, schoolName: s.schoolName }), "_blank", "noopener");
                    }}
                  >
                    Open
                  </Btn>
                )
              ) : (
                <StatusPill status={s.revokedAt ? "VOID" : "EXPIRED"} label={s.revokedAt ? "Revoked" : "Ended"} />
              )}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
    </div>
  );
};

export default SupportPage;
