import React, { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { getOnboardingToken, setOnboardingToken, type OnboardingMe } from "../../../api/tenantMgmt";
import OnboardingPending from "../../auth/OnboardingPending";
import ApplicantSignIn from "./ApplicantSignIn";
import TrackerView from "./TrackerView";
import { useOnboardingMe } from "./useOnboardingMe";

const hasSession = () => {
  try {
    return !!localStorage.getItem("token");
  } catch {
    return false;
  }
};

const SignedIn: React.FC<{ token: string; initial: OnboardingMe | null; onExpired: () => void; onSignOut: () => void }> = ({ token, initial, onExpired, onSignOut }) => {
  const { me, error, reload, setMe } = useOnboardingMe(token, onExpired, initial);
  if (!me)
    return (
      <main className="flex min-h-screen items-center justify-center bg-white dark:bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" aria-label="Loading" />
      </main>
    );
  return <TrackerView me={me} error={error} reload={reload} onPatch={(p) => setMe((x) => (x ? { ...x, ...p } : x))} onSignOut={onSignOut} />;
};

/**
 * Applicant progress tracker, /onboarding (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §6.2).
 * No onboarding token: a signed-in school user whose school is pending sees
 * OnboardingPending; anyone else gets the applicant sign-in.
 */
const OnboardingTracker: React.FC = () => {
  const [token, setToken] = useState<string | null>(() => getOnboardingToken());
  const [initial, setInitial] = useState<OnboardingMe | null>(null);
  const [expired, setExpired] = useState(false);

  const drop = useCallback((why: "expired" | "signout") => {
    setOnboardingToken(null);
    setInitial(null);
    setToken(null);
    setExpired(why === "expired");
  }, []);

  if (!token) {
    if (!expired && hasSession()) return <OnboardingPending />;
    return (
      <ApplicantSignIn
        expired={expired}
        onSignedIn={(t, me) => {
          setInitial(me ?? null);
          setExpired(false);
          setToken(t);
        }}
      />
    );
  }
  return <SignedIn key={token} token={token} initial={initial} onExpired={() => drop("expired")} onSignOut={() => drop("signout")} />;
};

export default OnboardingTracker;
