import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ExternalLink, Eye, History, LifeBuoy, Pencil, Radio, ShieldCheck } from "lucide-react";
import TenantLogo from "../../brand/TenantLogo";
import { EmptyState, Pill, StatusPill } from "../kit";
import { platformApi, publicApi, type SupportSession } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { Panel, StatTile } from "../viz";
import { Btn, SkeletonGrid, act, cx, fmtDateTime, surface, usePlatform } from "./platformShared";
import { fmtLeft, supportSessionUrl } from "./supportSession";

type Row = SupportSession & { tid: number; schoolName: string };

/** Ring that empties as the session runs out; the time left sits in the middle. */
export const TimeLeftRing: React.FC<{ startsAt: string; expiresAt: string; now: number; size?: number }> = ({ startsAt, expiresAt, now, size = 48 }) => {
  const reduced = useReducedMotion();
  const start = new Date(startsAt).getTime();
  const end = new Date(expiresAt).getTime();
  const left = Math.max(0, end - now);
  const ratio = end > start ? Math.min(1, left / (end - start)) : 0;
  const stroke = size >= 64 ? 6 : 5;
  const r = (size - stroke - 1) / 2;
  const c = 2 * Math.PI * r;
  // blue while there is time, amber in the last 40 %, red in the last 15 %
  const color = ratio < 0.15 ? "stroke-red-500" : ratio < 0.4 ? "stroke-amber-500" : "stroke-blue-600 dark:stroke-blue-500";
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-gray-100 dark:stroke-gray-800" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          className={cx("fill-none", color)}
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - ratio) }}
          transition={{ duration: reduced ? 0 : 0.6 }}
        />
      </svg>
      <span className={cx("absolute inset-0 flex flex-col items-center justify-center font-bold tabular-nums text-gray-900 dark:text-white", size >= 64 ? "text-sm" : "text-[10px]")}>
        {fmtLeft(Math.round(left / 1000))}
        {size >= 64 && <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">left</span>}
      </span>
      <span className="sr-only">{Math.round(left / 60000)} minutes left</span>
    </span>
  );
};

const ModePill: React.FC<{ mode: SupportSession["mode"] }> = ({ mode }) =>
  mode === "WRITE" ? (
    <Pill tone="amber" icon={Pencil}>
      Read & write
    </Pill>
  ) : (
    <Pill tone="blue" icon={Eye}>
      Read only
    </Pill>
  );

/** Logos for the schools in the list: tid -> slug from the school list (when the caller may see it), then branding. */
const useLogos = (tids: number[]) => {
  const [logos, setLogos] = useState<Record<number, string | null>>({});
  const key = [...new Set(tids)].sort().join(",");
  useEffect(() => {
    if (!key) return;
    let live = true;
    platformApi
      .tenants()
      .then(async (list) => {
        const wanted = new Set(key.split(",").map(Number));
        const out: Record<number, string | null> = {};
        await Promise.all(
          list
            .filter((t) => wanted.has(t.tid))
            .map(async (t) => {
              out[t.tid] = await publicApi.branding(t.slug).then((b) => b.logoUrl, () => null);
            }),
        );
        if (live) setLogos(out);
      })
      .catch(() => undefined); // no school list for this caller: initials
    return () => {
      live = false;
    };
  }, [key]);
  return logos;
};

const SupportPage: React.FC = () => {
  const { can } = usePlatform();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<number | null>(null);
  const m = useMotion();
  useEffect(() => {
    platformApi.supportSessions().then(setRows, () => setRows([]));
  }, []);
  const isLive = (s: Row) => s.active && !s.revokedAt && new Date(s.expiresAt).getTime() > now;
  const live = useMemo(() => (rows ?? []).filter(isLive).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)), [rows, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const past = useMemo(() => (rows ?? []).filter((s) => !isLive(s)).sort((a, b) => b.startsAt.localeCompare(a.startsAt)), [rows, now]); // eslint-disable-line react-hooks/exhaustive-deps
  // A live countdown ticks every second; with nothing open, a slow refresh is enough.
  useEffect(() => {
    const h = window.setInterval(() => setNow(Date.now()), live.length ? 1000 : 30_000);
    return () => window.clearInterval(h);
  }, [live.length]);
  const logos = useLogos(live.map((s) => s.tid));

  if (!rows)
    return (
      <div className="space-y-4">
        <SkeletonGrid cards={3} label="Loading support sessions" className="grid grid-cols-1 gap-3 sm:grid-cols-3" cardClassName="h-28" />
        <SkeletonGrid cards={2} label="Loading support sessions" className="grid gap-3 md:grid-cols-2" cardClassName="h-44" />
      </div>
    );

  const open = async (s: Row) => {
    setBusy(s.id);
    const out = await act(() => platformApi.openSupportSession(s.id));
    setBusy(null);
    if (out) window.open(supportSessionUrl(out, { mode: s.mode, schoolName: s.schoolName }), "_blank", "noopener");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile icon={Radio} label="Open now" value={live.length} />
        <StatTile icon={Pencil} label="Open with write access" value={live.filter((s) => s.mode === "WRITE").length} tone="amber" />
        <StatTile icon={History} label="Ended" value={past.length} tone="gray" />
      </div>

      {live.length === 0 ? (
        <div className={cx(surface.card, "py-4")}>
          <EmptyState icon={ShieldCheck} title="No support session is open">
            <p className="max-w-sm">A school opens one from its Support access page. It shows here with a countdown until it ends.</p>
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Support sessions">
          <AnimatePresence initial={false}>
            {live.map((s) => (
              <motion.li key={s.id} layout {...m("reveal")} className={cx(surface.card, "flex flex-col gap-4 p-4")}>
                <div className="flex items-start gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-50 p-1 dark:bg-gray-900/50">
                    <TenantLogo src={logos[s.tid] ?? null} name={s.schoolName} isPrimary={false} className="h-full w-full" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-gray-900 dark:text-white">{s.schoolName}</p>
                    <div className="mt-1">
                      <ModePill mode={s.mode} />
                    </div>
                  </div>
                  <TimeLeftRing startsAt={s.startsAt} expiresAt={s.expiresAt} now={now} size={72} />
                </div>
                {(s.reason || s.openedBy) && (
                  <div className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-800/50 dark:text-gray-300">
                    {s.reason && <p className="line-clamp-2 text-gray-800 dark:text-gray-100">{s.reason}</p>}
                    {s.openedBy && (
                      <p className="mt-0.5 text-gray-500 dark:text-gray-400">
                        {s.openedBy} · {fmtDateTime(s.openedAt)}
                      </p>
                    )}
                  </div>
                )}
                {can("support") && (
                  <Btn tone="primary" icon={ExternalLink} busy={busy === s.id} onClick={() => void open(s)} className="mt-auto w-full">
                    Open
                  </Btn>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {past.length > 0 && (
        <Panel title="Ended" icon={History} aside={`${past.length}`}>
          <ul className={cx("divide-y", surface.divide)} aria-label="Ended support sessions">
            {past.slice(0, 20).map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800/70 dark:text-gray-500">
                  <LifeBuoy className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{s.schoolName}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {s.reason ?? "—"}
                    {s.openedBy && ` · ${s.openedBy} ${fmtDateTime(s.openedAt)}`}
                  </p>
                </div>
                <ModePill mode={s.mode} />
                <StatusPill status={s.revokedAt ? "VOID" : "EXPIRED"} label={s.revokedAt ? "Revoked" : "Ended"} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
};

export default SupportPage;
