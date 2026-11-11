import React from "react";
import { Navigate } from "react-router-dom";
import { useUser } from "../../contexts/UserContext";

/**
 * Multi-tenancy gate for signed-in pages (MIS-A16): a session whose school is not
 * usable never reaches the app. PENDING -> the "under review" page; SUSPENDED or
 * ARCHIVED -> the same page in its "suspended" form. ACTIVE and GRACE pass (GRACE
 * still works). A session without a tenant block (older API) passes as NGA.
 */
const TenantGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useUser();
  const status = user?.tenant?.status;
  if (status === "PENDING") return <Navigate to="/onboarding" replace />;
  if (status === "SUSPENDED" || status === "ARCHIVED") return <Navigate to="/onboarding?status=suspended" replace />;
  return <>{children}</>;
};

export default TenantGate;
