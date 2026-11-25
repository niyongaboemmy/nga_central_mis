import React, { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import SchoolMark from "./SchoolMark";
import SwitchSchoolDialog from "./SwitchSchoolDialog";
import { mySchools, safeReturnUrl, type MySchool } from "../../lib/schoolSwitch";
import { useUser } from "../../contexts/UserContext";

/**
 * /switch-school?return=<url> -- the one place every NGA app sends people to
 * change school (TENANT_SWITCHING_PLAN.md Appendix A.4). Signed out: sign in
 * first, then come back. After the switch the browser goes to `return` (an
 * *.amashuri.com app's SSO entry, so it arrives already in the new school).
 */
const SwitchSchoolPage: React.FC = () => {
  const { isAuthenticated, isLoading } = useUser();
  const [params] = useSearchParams();
  const back = safeReturnUrl(params.get("return")) ?? "/home";
  const [schools, setSchools] = useState<MySchool[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<MySchool | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    mySchools(true).then(setSchools, (e) => setError(e?.response?.data?.message ?? "Could not load your schools."));
  }, [isAuthenticated]);

  if (isLoading) return <Centered><Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-label="Loading" /></Centered>;
  if (!isAuthenticated) {
    try {
      sessionStorage.setItem("nga.afterLogin", `${window.location.pathname}${window.location.search}`);
    } catch {
      /* private mode: lands on the home page after sign-in */
    }
    return <Navigate to="/login" replace />;
  }

  const current = schools?.find((s) => s.current) ?? null;
  return (
    <Centered>
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">Switch school</h1>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">Choose the school to work in. Every NGA app on this device follows.</p>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
        {!schools && !error && (
          <ul className="space-y-2" aria-busy="true">
            {[0, 1].map((i) => (
              <li key={i} className="h-14 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </ul>
        )}
        {schools && schools.length < 2 && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            You only have an account at {current?.name ?? "this school"}.{" "}
            <a href={back} className="font-semibold text-blue-700 underline dark:text-blue-300">Go back</a>
          </p>
        )}
        {schools && schools.length >= 2 && (
          <ul className="space-y-2" aria-label="Your schools">
            {schools.map((s) => (
              <li key={s.tid}>
                <button
                  type="button"
                  onClick={() => (s.current ? window.location.assign(back) : setTarget(s))}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-3 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <SchoolMark name={s.name} logoUrl={s.logoUrl} size="lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-900 dark:text-white">{s.name}</span>
                    <span className="block truncate text-xs text-slate-600 dark:text-slate-300">{s.current ? "Current school" : s.roles.join(", ") || s.slug}</span>
                  </span>
                  {s.current && <Check className="h-5 w-5 text-blue-600 dark:text-blue-300" aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <SwitchSchoolDialog from={current} to={target} next={back} onClose={() => setTarget(null)} />
    </Centered>
  );
};

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex min-h-screen items-center justify-center bg-background-light px-4 dark:bg-background-dark">{children}</div>
);

export default SwitchSchoolPage;
