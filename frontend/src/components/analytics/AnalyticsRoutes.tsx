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

const Soon: React.FC<{ title: string }> = ({ title }) => (
  <AnalyticsShell title={title}>
    <Empty>This report is being built.</Empty>
  </AnalyticsShell>
);

export default function AnalyticsRoutes() {
  const { can, loading } = useAccess();
  return (
    <Suspense fallback={<Empty>Loading…</Empty>}>
      <Routes>
        <Route
          index
          element={
            loading ? <Empty>Loading…</Empty> : can("ANALYTICS_VIEW") ? <Soon title="Overview" /> : <Navigate to="realtime" replace />
          }
        />
        <Route path="realtime" element={<Gate caps={["ANALYTICS_VIEW", "ANALYTICS_LIVE_VIEW"]}><Realtime /></Gate>} />
        <Route path="*" element={<Navigate to="/analytics" replace />} />
      </Routes>
    </Suspense>
  );
}
