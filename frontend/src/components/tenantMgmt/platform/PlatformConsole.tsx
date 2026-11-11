import React, { useState } from "react";
import ConfirmDialog from "../../ui/ConfirmDialog";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { CreditCard, FileStack, Gauge, LifeBuoy, Package, ScrollText, School, Settings2, ShieldOff, type LucideIcon } from "lucide-react";
import { EmptyState } from "../kit";
import { PlatformProvider, Spinner, TabBar, usePlatform, type PCapName } from "./platformShared";
import OverviewPage from "./OverviewPage";
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

const Shell: React.FC = () => {
  const { overview, loading, error, can, dirty, setDirty } = usePlatform();
  const nav = useNavigate();
  const loc = useLocation();
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  if (loading) return <Spinner />;
  if (!overview)
    return (
      <EmptyState icon={ShieldOff} title="No access">
        {error}
      </EmptyState>
    );
  const tabs = CONSOLE_TABS.filter((t) => can(...t.caps));
  if (!tabs.length) return <EmptyState icon={ShieldOff} title="No access" />;
  const seg = (loc.pathname.split("/platform/")[1] ?? "").split("/")[0] as TabKey;
  const current = tabs.find((t) => t.key === seg)?.key ?? tabs[0].key;
  const toReview = (overview.applications.SUBMITTED ?? 0) + (overview.applications.UNDER_REVIEW ?? 0);
  const badges: Partial<Record<TabKey, number>> = {
    applications: toReview,
    billing: overview.paymentsToConfirm,
    schools: overview.provisioningFailures,
  };
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-4 sm:px-6">
      <TabBar
        id="platform"
        label="Platform console"
        value={current}
        onChange={(v) => (dirty ? setLeaveTo(`/platform/${v}`) : nav(`/platform/${v}`))}
        tabs={tabs.map((t) => ({ value: t.key, label: t.label, icon: t.icon, badge: badges[t.key] }))}
      />
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
