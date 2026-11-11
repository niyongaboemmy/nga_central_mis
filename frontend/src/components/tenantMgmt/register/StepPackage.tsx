import React, { useState } from "react";
import { CalendarDays, CalendarRange, Loader2, PiggyBank } from "lucide-react";
import type { BillingCycle, PackageCode, PackageInfo } from "../../../api/tenantMgmt";
import { PackageCard, Segmented } from "../kit";
import { ErrorLine, Shake, StepFooter } from "./fields";

const StepPackage: React.FC<{
  packages: PackageInfo[] | null;
  value: PackageCode | null;
  cycle: BillingCycle;
  bestFit: PackageCode | null;
  onChange: (p: { requestedPackage?: PackageCode; billingCycle?: BillingCycle }) => void;
  onBack: () => void;
  onNext: () => void;
}> = ({ packages, value, cycle, bestFit, onChange, onBack, onNext }) => {
  const [error, setError] = useState<string | null>(null);
  const all = packages ? Array.from(new Map(packages.flatMap((p) => p.entitlements).map((e) => [e.key, e])).values()) : undefined;
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!value) return setError("Pick a package");
        onNext();
      }}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented<BillingCycle>
          label="Billing cycle"
          value={cycle}
          onChange={(billingCycle) => onChange({ billingCycle })}
          options={[
            { value: "TERM", label: "Term", icon: CalendarDays },
            { value: "YEAR", label: "Year", icon: CalendarRange },
          ]}
        />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-100">
          <PiggyBank className="h-4 w-4" aria-hidden />
          No payment now
        </span>
      </div>
      {!packages ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-brand-500" aria-label="Loading packages" />
        </div>
      ) : (
        <Shake error={error}>
          <div className="grid gap-4 pt-2 sm:grid-cols-2" aria-label="Packages" role="group">
            {[...packages]
              .sort((a, b) => a.tier - b.tier)
              .map((p) => (
                <PackageCard
                  key={p.code}
                  pkg={p}
                  allEntitlements={all}
                  cycle={cycle}
                  selected={value === p.code}
                  recommended={bestFit === p.code}
                  onSelect={() => {
                    setError(null);
                    onChange({ requestedPackage: p.code });
                  }}
                />
              ))}
          </div>
          <ErrorLine error={error} />
        </Shake>
      )}
      <StepFooter onBack={onBack} primary="Next" />
    </form>
  );
};

export default StepPackage;
