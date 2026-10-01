import React, { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAccess } from "../../hooks/useAccess";
import { Empty } from "../access/shared";
import { AnalyticsShell } from "./AnalyticsShell";

/**
 * /analytics/* -- Usage & Monitoring. Pages load lazily so the console's charts and map
 * never weigh on the rest of the MIS bundle.
 */
const Realtime = lazy(() => import("./Realtime"));
const Overview = lazy(() => import("./Overview"));
const AccessLogins = lazy(() => import("./AccessLogins"));
const Audience = lazy(() => import("./Audience"));
const Visitors = lazy(() => import("./Visitors"));
const Engagement = lazy(() => import("./Engagement"));
const AppsPage = lazy(() => import("./AppsRetentionTech").then((m) => ({ default: m.AppsPage })));
const RetentionPage = lazy(() => import("./AppsRetentionTech").then((m) => ({ default: m.RetentionPage })));
const TechnologyPage = lazy(() => import("./AppsRetentionTech").then((m) => ({ default: m.TechnologyPage })));
const LocationsPage = lazy(() => import("./Locations").then((m) => ({ default: m.LocationsPage })));
const Explore = lazy(() => import("./Explore"));
const User360 = lazy(() => import("./User360"));
const Visitor360 = lazy(() => import("./Visitor360"));
const Watchlist = lazy(() => import("./Watchlist"));
const SettingsPage = lazy(() => import("./SettingsPage"));
const IpLookupPage = lazy(() => import("./Locations").then((m) => ({ default: m.IpLookupPage })));

const Gate: React.FC<{ caps: string[]; children: React.ReactNode }> = ({ caps, children }) => {
  const { can, loading } = useAccess();
  if (loading) return <Empty>Loading…</Empty>;
  if (!can(caps))
    return (
      <AnalyticsShell title="Not available">
        <Empty>You don't have access to this part of Usage &amp; Monitoring.</Empty>
      </AnalyticsShell>
    );
  return <>{children}</>;
};

export default function AnalyticsRoutes() {
  const { can, loading } = useAccess();
  return (
    <Suspense fallback={<Empty>Loading…</Empty>}>
      <Routes>
        <Route
          index
          element={
            loading ? <Empty>Loading…</Empty> : can("ANALYTICS_VIEW") ? <Overview /> : <Navigate to="realtime" replace />
          }
        />
        <Route path="realtime" element={<Gate caps={["ANALYTICS_VIEW", "ANALYTICS_LIVE_VIEW"]}><Realtime /></Gate>} />
        <Route path="access" element={<Gate caps={["ANALYTICS_VIEW"]}><AccessLogins /></Gate>} />
        <Route path="audience" element={<Gate caps={["ANALYTICS_VIEW"]}><Audience /></Gate>} />
        <Route path="visitors" element={<Gate caps={["ANALYTICS_USER_VIEW"]}><Visitors /></Gate>} />
        <Route path="engagement" element={<Gate caps={["ANALYTICS_VIEW"]}><Engagement /></Gate>} />
        <Route path="apps" element={<Gate caps={["ANALYTICS_VIEW"]}><AppsPage /></Gate>} />
        <Route path="retention" element={<Gate caps={["ANALYTICS_VIEW"]}><RetentionPage /></Gate>} />
        <Route path="technology" element={<Gate caps={["ANALYTICS_VIEW"]}><TechnologyPage /></Gate>} />
        <Route path="locations" element={<Gate caps={["ANALYTICS_VIEW"]}><LocationsPage /></Gate>} />
        <Route path="ip/:ip" element={<Gate caps={["ANALYTICS_USER_VIEW"]}><IpLookupPage /></Gate>} />
        <Route path="explore" element={<Gate caps={["ANALYTICS_VIEW"]}><Explore /></Gate>} />
        <Route path="watchlist" element={<Gate caps={["ANALYTICS_USER_CONTROL"]}><Watchlist /></Gate>} />
        <Route path="settings" element={<Gate caps={["ANALYTICS_CONFIGURE"]}><SettingsPage /></Gate>} />
        <Route path="users/:id" element={<Gate caps={["ANALYTICS_USER_VIEW"]}><User360 /></Gate>} />
        <Route path="visitors/:code" element={<Gate caps={["ANALYTICS_USER_VIEW"]}><Visitor360 /></Gate>} />
        <Route path="*" element={<Navigate to="/analytics" replace />} />
      </Routes>
    </Suspense>
  );
}
