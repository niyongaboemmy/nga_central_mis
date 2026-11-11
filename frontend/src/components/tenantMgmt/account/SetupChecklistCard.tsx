import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AppWindow, CalendarDays, Check, Clock, KeyRound, Network, School, UserPlus, Users, X, type LucideIcon } from "lucide-react";
import { tenantApi, type SetupItem } from "../../../api/tenantMgmt";
import { Burst } from "../kit";
import { useMotion } from "../../../design/motion";
import { useAccess } from "../../../hooks/useAccess";
import { useUser } from "../../../contexts/UserContext";
import { CountdownRing, card, cx } from "../shared/paymentBits";

/** First-run setup card on Home (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §6.6). */

const ICONS: Record<SetupItem["key"], LucideIcon> = {
  profile: School,
  academic_year: CalendarDays,
  structure: Network,
  periods: Clock,
  people: Users,
  roles: KeyRound,
  apps: AppWindow,
  parents: UserPlus,
};

export const SetupChecklist: React.FC = () => {
  const m = useMotion();
  const [items, setItems] = useState<SetupItem[] | null>(null);
  const [hidden, setHidden] = useState(true);
  const [celebrate, setCelebrate] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    tenantApi
      .setup()
      .then((r) => {
        if (!alive) return;
        setItems(r.items);
        setHidden(r.dismissed);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!items || hidden) return null;
  const done = items.filter((i) => i.done).length;
  const complete = done === items.length;

  const dismiss = async () => {
    setBusy(true);
    try {
      await tenantApi.dismissSetup();
      setCelebrate(true);
      window.setTimeout(() => setHidden(true), 1400);
    } catch {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.section {...m("reveal")} className={cx(card, "relative overflow-hidden p-4")} aria-label="School setup">
        <Burst show={celebrate} />
        <div className="flex items-center gap-3">
          <CountdownRing
            left={done}
            total={items.length}
            size={56}
            mode="progress"
            label={`${done} of ${items.length} setup steps done`}
            center={
              <span className="text-sm font-extrabold tabular-nums">
                {done}/{items.length}
              </span>
            }
          />
          <h2 className="min-w-0 flex-1 text-base font-bold text-slate-900 dark:text-white">{complete ? "All set" : "Set up your school"}</h2>
          {complete && (
            <motion.button
              type="button"
              {...m("tap")}
              onClick={dismiss}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              <X className="h-4 w-4" aria-hidden /> Dismiss
            </motion.button>
          )}
        </div>
        <ul className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {items.map((it, i) => {
            const Icon = ICONS[it.key] ?? Check;
            return (
              <motion.li key={it.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Link
                  to={it.link}
                  title={it.label}
                  className={cx(
                    "relative flex flex-col items-center gap-1 rounded-xl p-2 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                    it.done
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  <span className="line-clamp-2 text-[11px] font-medium leading-tight">{it.label}</span>
                  {it.done && (
                    <motion.span {...m("check")} className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white" data-testid={`setup-done-${it.key}`}>
                      <Check className="h-3 w-3" aria-hidden />
                    </motion.span>
                  )}
                  <span className="sr-only">{it.done ? "done" : "to do"}</span>
                </Link>
              </motion.li>
            );
          })}
        </ul>
      </motion.section>
    </AnimatePresence>
  );
};

/** Home mount: only for school-settings holders of a non-primary school. */
const SetupChecklistCard: React.FC = () => {
  const { user } = useUser();
  const access = useAccess();
  if (user?.tenant?.isPrimary === true || !access.can("SCHOOL_SETTINGS_MANAGE")) return null;
  return <SetupChecklist />;
};

export default SetupChecklistCard;
