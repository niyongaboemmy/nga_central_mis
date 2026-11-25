import React, { useState } from "react";
import ConfirmDialog from "../../ui/ConfirmDialog";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Building2, CreditCard, FileStack, Gauge, LifeBuoy, Package, RefreshCw, ScrollText, School, Settings2, ShieldOff, type LucideIcon } from "lucide-react";
import PageHeader, { HeaderTabs } from "../../ui/PageHeader";
import { TRACKER_STEPS } from "../../../api/tenantMgmt";
import { EmptyState } from "../kit";
import { Btn, PlatformProvider, Skeleton, SkeletonGrid, cx, surface, toast, usePlatform, type PCapName } from "./platformShared";
import OverviewPage, { STEP_STATUSES } from "./OverviewPage";
import ApplicationsPage from "./ApplicationsPage";
import ApplicationDetailPage from "./ApplicationDetailPage";
import BillingPage from "./BillingPage";
import SchoolsPage from "./SchoolsPage";
import SchoolDetailPage from "./SchoolDetailPage";
import PackagesPage from "./PackagesPage";
import SettingsPage from "./SettingsPage";
import AuditPage from "./AuditPage";
import SupportPage from "./SupportPage";

/** Primary-tenant console, /platform/* (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §6.3-6.8, §8). */

type TabKey = "overview" | "applications" | "billing" | "schools" | "packages" | "settings" | "audit" | "support";

export const CONSOLE_TABS: Array<{ key: TabKey; label: string; icon: LucideIcon; caps: PCapName[] }> = [
  { key: "overview", label: "Overview", icon: Gauge, caps: ["view", "review", "decide", "invoice", "confirm", "lifecycle", "packages", "audit", "support"] },
  { key: "applications", label: "Applications", icon: FileStack, caps: ["review", "decide"] },
  { key: "billing", label: "Billing", icon: CreditCard, caps: ["invoice", "confirm", "waive"] },
  { key: "schools", label: "Schools", icon: School, caps: ["view", "lifecycle", "entitlements"] },
  { key: "packages", label: "Packages", icon: Package, caps: ["packages"] },
  { key: "settings", label: "Settings", icon: Settings2, caps: ["packages"] },
  { key: "audit", label: "Audit", icon: ScrollText, caps: ["audit"] },
  { key: "support", label: "Support", icon: LifeBuoy, caps: ["support"] },
];

const PAGES: Record<TabKey, React.ReactNode> = {
  overview: <OverviewPage />,
  applications: <ApplicationsPage />,
  billing: <BillingPage />,
  schools: <SchoolsPage />,
  packages: <PackagesPage />,
  settings: <SettingsPage />,
  audit: <AuditPage />,
  support: <SupportPage />,
};

/** The console while the overview loads: header skeleton + cards. */
const ShellSkeleton: React.FC = () => (
  <div className="mx-auto max-w-7xl space-y-4 px-4 py-4 sm:px-6" role="status" aria-busy="true" aria-label="Loading the platform console">
    <div className={cx(surface.card, "space-y-4 p-4 sm:p-5")}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 !rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3.5 w-64" />
        </div>
      </div>
      <Skeleton className="h-8 w-full max-w-2xl" />
    </div>
    <SkeletonGrid cards={4} className="grid grid-cols-2 gap-3 lg:grid-cols-4" cardClassName="h-28" />
  </div>
);

const Shell: React.FC = () => {
  const { overview, loading, error, can, dirty, setDirty, reload } = usePlatform();
  const nav = useNavigate();
  const loc = useLocation();
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  if (loading) return <ShellSkeleton />;
  if (!overview)
    return (
      <EmptyState icon={ShieldOff} title="No access">
        {error}
      </EmptyState>
    );
  const tabs = CONSOLE_TABS.filter((t) => can(...t.caps));
  if (!tabs.length) return <EmptyState icon={ShieldOff} title="No access" />;
  const rest = (loc.pathname.split("/platform/")[1] ?? "").split("/");
  const seg = rest[0] as TabKey;
  const current = tabs.find((t) => t.key === seg)?.key ?? tabs[0].key;
  // A detail screen (one application, one school) has its own title and tab rail: the console
  // header stays out of the way so there is only ever one rail on screen (plan F12).
  const detail = rest.length > 1 && !!rest[1];
  const toReview = (overview.applications.SUBMITTED ?? 0) + (overview.applications.UNDER_REVIEW ?? 0);
  const badges: Partial<Record<TabKey, number>> = {
    applications: toReview,
    billing: overview.paymentsToConfirm,
    schools: overview.provisioningFailures,
  };
  const go = (to: string) => (dirty ? setLeaveTo(to) : nav(to));
  const inFlight = TRACKER_STEPS.filter((s) => s !== "live").reduce((t, s) => t + STEP_STATUSES[s].reduce((n, st) => n + (overview.applications[st] ?? 0), 0), 0);
  const updated = overview.generatedAt ? new Date(overview.generatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null;
  const refresh = async () => {
    setRefreshing(true);
    try {
      await reload();
      toast("Console refreshed", "success");
    } catch {
      toast("Couldn't refresh the console", "error");
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-4 sm:px-6">
      {!detail && (
        <PageHeader
          icon={Building2}
          title="Platform"
          subtitle={
            <>
              <span>{inFlight ? `${inFlight} ${inFlight === 1 ? "school is" : "schools are"} on the way in` : "No applications in progress"}</span>
              {updated && <span aria-hidden>·</span>}
              {updated && <span>updated {updated}</span>}
            </>
          }
          actions={
            <Btn icon={RefreshCw} busy={refreshing} onClick={refresh}>
              Refresh
            </Btn>
          }
          tabs={<HeaderTabs label="Platform console" value={current} onChange={(v) => go(`/platform/${v}`)} items={tabs.map((t) => ({ key: t.key, label: t.label, icon: t.icon, count: badges[t.key], alert: true }))} />}
        />
      )}
      <Routes>
        <Route index element={<Navigate to={tabs[0].key} replace />} />
        {tabs.map((t) => (
          <Route key={t.key} path={t.key} element={PAGES[t.key]} />
        ))}
        {can("review", "decide") && <Route path="applications/:id" element={<ApplicationDetailPage />} />}
        {can("view", "lifecycle", "entitlements") && <Route path="schools/:tid" element={<SchoolDetailPage />} />}
        <Route path="*" element={<Navigate to={tabs[0].key} replace />} />
      </Routes>
      <ConfirmDialog
        isOpen={!!leaveTo}
        tone="warning"
        title="Discard changes?"
        confirmText="Discard"
        cancelText="Stay"
        onCancel={() => setLeaveTo(null)}
        onConfirm={() => {
          setDirty(false);
          nav(leaveTo!);
          setLeaveTo(null);
        }}
      />
    </div>
  );
};

const PlatformConsole: React.FC = () => (
  <PlatformProvider>
    <Shell />
  </PlatformProvider>
);

export default PlatformConsole;
