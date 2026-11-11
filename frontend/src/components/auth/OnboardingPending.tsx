import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Clock, ShieldOff } from "lucide-react";

/**
 * Where a school that can't be used yet lands (TenantGate, sign-in refusals).
 * PENDING: "Your school's application is under review" -- the full onboarding UI is a
 * later plan (management plan); SUSPENDED: access is paused. Placeholder on purpose.
 */
const OnboardingPending: React.FC = () => {
  const [params] = useSearchParams();
  const suspended = params.get("status") === "suspended";
  const Icon = suspended ? ShieldOff : Clock;
  return (
    <main className="min-h-screen flex items-center justify-center bg-white dark:bg-black px-4">
      <section
        aria-labelledby="onboarding-title"
        className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center"
      >
        <Icon className="w-10 h-10 mx-auto mb-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
        <h1 id="onboarding-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {suspended ? "Your school's access is suspended" : "Your school's application is under review"}
        </h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          {suspended
            ? "Signing in is paused for your school. Please contact your school's administration."
            : "We're checking your school's details. You'll be able to sign in as soon as the school is approved."}
        </p>
        <Link
          to="/login"
          className="mt-6 inline-block text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          Back to sign in
        </Link>
      </section>
    </main>
  );
};

export default OnboardingPending;
