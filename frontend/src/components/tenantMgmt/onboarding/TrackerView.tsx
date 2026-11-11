import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Ban, CalendarX2, ChevronDown, FileText, History, KeyRound, LogOut, MessageCircle, School, ShieldCheck, Sparkles, UndoDot, UserRound, WifiOff, Zap } from "lucide-react";
import { applicantApi, publicApi, type OnboardingMe, type PackageInfo, type TimelineEvent } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { EmptyState, JourneyStepper, StatusPill, Timeline } from "../kit";
import ConfirmDialog from "../../ui/ConfirmDialog";
import ThemeToggle from "../../ui/ThemeToggle";
import { AmashuriMark } from "../../brand/AmashuriLogo";
import { cx, ghostBtn, iconBtn, primaryBtn } from "../register/fields";
import ActionCards from "./ActionCards";
import { ProvisioningSteps } from "./LiveBits";
import MessagesThread from "./MessagesThread";
import { ApplicationSummary, ChangePasswordModal } from "./AccountBits";

const FAILED = new Set(["REJECTED", "PAYMENT_REJECTED", "PROVISIONING_FAILED"]);
const WITHDRAWABLE = new Set(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED", "APPROVED_AWAITING_PAYMENT", "PAYMENT_REJECTED"]);
const SETTING_UP = new Set(["PAYMENT_CONFIRMED", "PROVISIONING", "PROVISIONING_FAILED"]);

const actorIcon = (e: TimelineEvent) => (e.actor === "PLATFORM" ? ShieldCheck : e.actor === "APPLICANT" ? UserRound : Sparkles);

const useIsDesktop = () => {
  const q = "(min-width: 1024px)";
  const get = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(q).matches : false);
  const [v, setV] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(q);
    const on = () => setV(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return v;
};

type Tab = "progress" | "timeline" | "messages";

const Panel: React.FC<{ id: string; icon: React.ComponentType<{ className?: string }>; title: string; badge?: number; children: React.ReactNode }> = ({ id, icon: Icon, title, badge, children }) => (
  <section aria-labelledby={id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
    <h2 id={id} className="mb-3 flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
      <Icon className="h-4 w-4 text-brand-600 dark:text-brand-200" />
      {title}
      {!!badge && <span className="rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">{badge}</span>}
    </h2>
    {children}
  </section>
);

/** The applicant's tracker once signed in (§6.2). */
const TrackerView: React.FC<{ me: OnboardingMe; error: string | null; reload: () => Promise<void> | void; onPatch: (p: Partial<OnboardingMe>) => void; onSignOut: () => void }> = ({
  me,
  error,
  reload,
  onPatch,
  onSignOut,
}) => {
  const m = useMotion();
  const desktop = useIsDesktop();
  const [tab, setTab] = useState<Tab>("progress");
  const [pwOpen, setPwOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [packages, setPackages] = useState<PackageInfo[] | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const app = me.application;

  useEffect(() => {
    publicApi.packages().then(setPackages).catch(() => setPackages([]));
    heading.current?.focus();
  }, []);

  const signOut = async () => {
    try {
      await applicantApi.logout();
    } catch {
      /* the token is dropped anyway */
    }
    onSignOut();
  };

  const header = (
    <header className="mb-5 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <AmashuriMark size={36} />
        <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{me.account.fullName}</span>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" className={iconBtn} onClick={() => setPwOpen(true)}>
          <KeyRound className="h-4 w-4" aria-hidden />
          <span className="sr-only">Change password</span>
        </button>
        <ThemeToggle />
        <button type="button" className={iconBtn} onClick={() => void signOut()}>
          <LogOut className="h-4 w-4" aria-hidden />
          <span className="sr-only">Sign out</span>
        </button>
      </div>
    </header>
  );

  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand-50 px-4 py-6 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="mx-auto max-w-6xl">
        {header}
        {error && (
          <p role="status" className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-400/15 dark:text-amber-100">
            <WifiOff className="h-3.5 w-3.5" aria-hidden />
            Offline · retrying
          </p>
        )}
        {children}
      </div>
      <ChangePasswordModal isOpen={pwOpen} onClose={() => setPwOpen(false)} />
    </main>
  );

  if (!app) {
    return shell(
      <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h1 ref={heading} tabIndex={-1} className="sr-only">
          My application
        </h1>
        <EmptyState icon={School} title="No application yet">
          <Link to="/register-school" className={cx(primaryBtn, "mt-2")}>
            <School className="h-4 w-4" aria-hidden />
            Register your school
          </Link>
        </EmptyState>
      </section>,
    );
  }

  const failed = FAILED.has(app.status);
  const unread = me.unreadMessages;
  const tabs: Array<{ key: Tab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }> = [
    { key: "progress", label: "Progress", icon: Zap },
    { key: "timeline", label: "Timeline", icon: History },
    { key: "messages", label: "Messages", icon: MessageCircle, badge: unread },
  ];
  const show = (t: Tab) => (t === tab ? "" : "hidden lg:block");

  return shell(
    <>
      <motion.section {...m("reveal")} className="mb-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <h1 ref={heading} tabIndex={-1} className="mr-auto min-w-0 break-words text-xl font-extrabold text-slate-900 focus:outline-none dark:text-white sm:text-2xl">
            {app.schoolName}
          </h1>
          {app.ref && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-100">{app.ref}</span>}
          <StatusPill status={app.status} />
        </div>
        <JourneyStepper current={app.step} failed={failed} />
      </motion.section>

      {/* mobile tab bar; on desktop every panel is visible */}
      <div className="mb-4 flex gap-1 rounded-full bg-slate-100 p-1 dark:bg-slate-800 lg:hidden" aria-label="Sections">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cx(
              "relative flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-semibold",
              tab === t.key ? "bg-white text-slate-900 shadow dark:bg-slate-700 dark:text-white" : "text-slate-600 dark:text-slate-300",
            )}
          >
            <t.icon className="h-4 w-4" aria-hidden />
            {t.label}
            {!!t.badge && (
              <span className="absolute right-1 top-0 min-w-[1.1rem] rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                {t.badge}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className={cx("space-y-4", show("progress"))}>
          {app.status === "REJECTED" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                <Ban className="h-5 w-5 text-slate-500 dark:text-slate-300" aria-hidden />
                Not approved
              </div>
              {app.decisionReason && <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{app.decisionReason}</p>}
            </section>
          )}
          {app.status === "EXPIRED" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                <CalendarX2 className="h-5 w-5 text-slate-500 dark:text-slate-300" aria-hidden />
                Expired
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">The platform team can reopen it · send a message</p>
            </section>
          )}
          {app.status === "WITHDRAWN" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                <UndoDot className="h-5 w-5 text-slate-500 dark:text-slate-300" aria-hidden />
                Withdrawn
              </div>
              <Link to="/register-school" className={cx(ghostBtn, "mt-2")}>
                <School className="h-4 w-4" aria-hidden />
                Register again
              </Link>
            </section>
          )}

          {app.status !== "REJECTED" && <ActionCards me={me} reload={reload} />}

          {me.provisioning && SETTING_UP.has(app.status) && <ProvisioningSteps run={me.provisioning} />}

          <details className="group rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl p-4 font-semibold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-white">
              <FileText className="h-4 w-4 text-brand-600 dark:text-brand-200" aria-hidden />
              Application
              <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="border-t border-slate-100 p-4 dark:border-slate-800">
              <ApplicationSummary app={app} packages={packages} />
              {WITHDRAWABLE.has(app.status) && (
                <div className="mt-4 flex justify-end">
                  <button type="button" className={cx(ghostBtn, "text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-400/10")} onClick={() => setWithdrawOpen(true)}>
                    <UndoDot className="h-4 w-4" aria-hidden />
                    Withdraw
                  </button>
                </div>
              )}
            </div>
          </details>
        </div>

        <aside className="space-y-4">
          <div className={show("timeline")}>
            <Panel id="tracker-timeline" icon={History} title="Timeline">
              {me.timeline.length ? (
                <Timeline events={[...me.timeline].sort((a, b) => b.at.localeCompare(a.at))} iconFor={actorIcon} />
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-300">—</p>
              )}
            </Panel>
          </div>
          <div className={show("messages")}>
            <Panel id="tracker-messages" icon={MessageCircle} title="Messages" badge={unread}>
              {(desktop || tab === "messages") && (
                <MessagesThread applicationId={app.id} refreshKey={`${me.timeline.length}:${unread}`} onRead={() => unread && onPatch({ unreadMessages: 0 })} />
              )}
            </Panel>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        isOpen={withdrawOpen}
        isLoading={withdrawing}
        title="Withdraw application?"
        message={app.ref ?? app.schoolName}
        confirmText="Withdraw"
        tone="danger"
        onCancel={() => setWithdrawOpen(false)}
        onConfirm={async () => {
          setWithdrawing(true);
          try {
            await applicantApi.withdraw(app.id);
            setWithdrawOpen(false);
            await reload();
          } finally {
            setWithdrawing(false);
          }
        }}
      />
    </>,
  );
};

export default TrackerView;
