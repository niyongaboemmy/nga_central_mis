import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { publicApi, type Entitlement, type PackageInfo } from "../../api/tenantMgmt";
import { CountUp, entIcon } from "../tenantMgmt/kit";
import { EASE, SectionHead, cx } from "./parts";

/**
 * "Start small. Grow anytime." -- packages compared with pictures, in blue:
 * size meters scaled to the biggest package, every app lit or dimmed, a ring
 * for the share of features. No coloured top bars; the popular package is
 * named in blue above its name and ringed.
 */

const LIMIT_KEYS = ["limit.students", "limit.staff", "limit.storage_gb"] as const;

const money = (n: number, currency: string) => `${currency} ${Math.round(n).toLocaleString()}`;

interface Scale {
  max: Record<string, number>;
  apps: Entitlement[];
  totalFeatures: number;
}

/** value / biggest package's value as a thin blue bar; unlimited fills with a slow shimmer. */
const Meter: React.FC<{ e: Entitlement; max: number; delay: number }> = ({ e, max, delay }) => {
  const reduced = useReducedMotion();
  const Icon = entIcon(e.key);
  const unlimited = e.value === null;
  const share = unlimited ? 1 : max > 0 ? Math.max(0.05, Number(e.value) / max) : 0;
  return (
    <div title={e.label}>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-[var(--lp-muted)]">
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {e.label}
        </span>
        <span className="font-semibold tabular-nums text-[var(--lp-text)]">
          {unlimited ? "Unlimited" : Number(e.value).toLocaleString()}
          {e.key === "limit.storage_gb" && !unlimited ? " GB" : ""}
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-[var(--lp-hair)]">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--lp-blue)]"
          initial={{ width: reduced ? `${share * 100}%` : 0 }}
          whileInView={{ width: `${share * 100}%` }}
          viewport={{ once: true }}
          transition={{ duration: 1.1, delay, ease: EASE }}
        />
        {unlimited && !reduced && (
          <motion.div
            className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-white/80 to-transparent"
            animate={{ x: ["-150%", "450%"] }}
            transition={{ repeat: Infinity, duration: 2.8, ease: "easeInOut", delay: 1.4 }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
};

/** Share of all features as a ring. */
const FeatureRing: React.FC<{ count: number; total: number }> = ({ count, total }) => {
  const reduced = useReducedMotion();
  const share = total ? count / total : 0;
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 36 36" className="h-11 w-11 shrink-0 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3.5" stroke="var(--lp-hair)" />
        <motion.circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          stroke="var(--lp-blue)"
          initial={{ pathLength: reduced ? share : 0 }}
          whileInView={{ pathLength: share }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: EASE }}
        />
      </svg>
      <p className="text-sm text-[var(--lp-muted)]">
        <span className="text-xl font-semibold tabular-nums tracking-tight text-[var(--lp-text)]">
          <CountUp value={count} />
        </span>{" "}
        of {total} features
      </p>
    </div>
  );
};

const PlanCard: React.FC<{ pkg: PackageInfo; scale: Scale; cycle: "TERM" | "YEAR"; popular: boolean; index: number; onChoose: () => void }> = ({
  pkg,
  scale,
  cycle,
  popular,
  index,
  onChoose,
}) => {
  const reduced = useReducedMotion();
  const price = cycle === "YEAR" ? pkg.priceYear : pkg.priceTerm;
  const own = new Set(pkg.entitlements.filter((e) => e.kind === "APP").map((e) => e.key));
  const features = pkg.entitlements.filter((e) => e.kind === "FEATURE").length;

  return (
    <motion.article
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px 0px" }}
      transition={{ duration: 0.8, delay: index * 0.1, ease: EASE }}
      whileHover={reduced ? undefined : { y: -6 }}
      className={cx(
        "group relative flex w-[84%] shrink-0 snap-center flex-col rounded-[28px] sm:w-auto bg-[var(--lp-card)] p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow duration-500 hover:shadow-[0_24px_60px_rgba(0,0,0,0.10)]",
        popular ? "ring-2 ring-[var(--lp-blue)]" : "ring-1 ring-[var(--lp-hair)]",
      )}
    >
      <p className={cx("h-5 text-sm font-semibold", popular ? "text-[var(--lp-blue)]" : "text-transparent")} aria-hidden={!popular}>
        {popular ? "Most popular" : "·"}
      </p>
      <h3 className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-[var(--lp-text)]">{pkg.name}</h3>
      {pkg.tagline && <p className="mt-1 min-h-[2.5rem] text-sm leading-snug text-[var(--lp-muted)]">{pkg.tagline}</p>}

      <div className="mt-4 h-9 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={cycle}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="text-[var(--lp-text)]"
          >
            {price === null ? (
              <span className="text-lg font-medium text-[var(--lp-muted)]">Price on approval</span>
            ) : (
              <>
                <span className="text-2xl font-semibold tracking-tight">{money(price, pkg.currency)}</span>
                <span className="ml-1 text-sm text-[var(--lp-muted)]">/ {cycle === "YEAR" ? "year" : "term"}</span>
              </>
            )}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="mt-6 space-y-4">
        {LIMIT_KEYS.map((k, i) => {
          const e = pkg.entitlements.find((x) => x.key === k);
          return e ? <Meter key={k} e={e} max={scale.max[k] ?? 0} delay={index * 0.1 + i * 0.12} /> : null;
        })}
      </div>

      <div className="my-6 h-px bg-[var(--lp-hair)]" />

      {/* every app, lit when the package has it */}
      <ul className="flex flex-wrap gap-2">
        {scale.apps.map((a, i) => {
          const on = own.has(a.key);
          const Icon = entIcon(a.key);
          return (
            <motion.li
              key={a.key}
              title={a.label}
              initial={reduced ? false : { opacity: 0, scale: 0.7 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 + i * 0.05, ease: EASE }}
              className={cx(
                "flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-300",
                on ? "bg-[var(--lp-blue-soft)] text-[var(--lp-blue)] group-hover:bg-[var(--lp-blue)] group-hover:text-white" : "text-[var(--lp-muted)]/40 ring-1 ring-inset ring-[var(--lp-hair)]",
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              <span className="sr-only">
                {a.label}: {on ? "included" : "not included"}
              </span>
            </motion.li>
          );
        })}
      </ul>

      <div className="mt-6">
        <FeatureRing count={features} total={scale.totalFeatures} />
      </div>

      <div className="mt-auto pt-8">
        <button
          type="button"
          onClick={onChoose}
          className={cx(
            "group/btn inline-flex w-full items-center justify-center gap-1 rounded-full px-5 py-3 text-[15px] font-medium transition-all active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--lp-blue)]/30",
            popular ? "bg-[var(--lp-blue)] text-white hover:brightness-110" : "bg-[var(--lp-blue-soft)] text-[var(--lp-blue)] hover:bg-[var(--lp-blue)] hover:text-white",
          )}
        >
          Choose {pkg.name}
          <ChevronRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" aria-hidden />
        </button>
      </div>
    </motion.article>
  );
};

/** Term / Year, an Apple segmented control. */
const CycleSwitch: React.FC<{ value: "TERM" | "YEAR"; onChange: (v: "TERM" | "YEAR") => void }> = ({ value, onChange }) => (
  <div role="radiogroup" aria-label="Billing cycle" className="inline-flex rounded-full bg-[var(--lp-seg)] p-1">
    {(["TERM", "YEAR"] as const).map((v) => {
      const on = v === value;
      return (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={on}
          onClick={() => onChange(v)}
          className={cx("relative rounded-full px-6 py-2 text-[15px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-blue)]", on ? "text-[var(--lp-text)]" : "text-[var(--lp-muted)]")}
        >
          {on && <motion.span layoutId="cycle-thumb" className="absolute inset-0 rounded-full bg-[var(--lp-card)] shadow-[0_2px_8px_rgba(0,0,0,0.12)]" transition={{ type: "spring", stiffness: 420, damping: 36 }} aria-hidden />}
          <span className="relative">{v === "TERM" ? "Per term" : "Per year"}</span>
        </button>
      );
    })}
  </div>
);

const Packages: React.FC = () => {
  const navigate = useNavigate();
  const [packages, setPackages] = useState<PackageInfo[] | null>(null);
  const [cycle, setCycle] = useState<"TERM" | "YEAR">("YEAR");

  useEffect(() => {
    publicApi
      .packages()
      .then((p) => setPackages(p.filter((x) => x.isPublic !== false && x.isActive !== false).sort((a, b) => a.tier - b.tier)))
      .catch(() => setPackages([]));
  }, []);

  const scale = useMemo<Scale>(() => {
    const max: Record<string, number> = {};
    const apps = new Map<string, Entitlement>();
    const featureKeys = new Set<string>();
    for (const p of packages ?? []) {
      for (const e of p.entitlements) {
        if (e.kind === "LIMIT" && e.value !== null) max[e.key] = Math.max(max[e.key] ?? 0, Number(e.value));
        if (e.kind === "APP" && !apps.has(e.key)) apps.set(e.key, e);
        if (e.kind === "FEATURE") featureKeys.add(e.key);
      }
    }
    return { max, apps: [...apps.values()], totalFeatures: featureKeys.size };
  }, [packages]);

  if (packages && packages.length === 0) return null;
  return (
    <section id="packages" className="scroll-mt-16 bg-[var(--lp-alt)] px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow="Packages" title="Start small. Grow anytime." sub="Every package includes the Central MIS. Move up whenever you need more." />
        <div className="mt-10 flex justify-center">
          <CycleSwitch value={cycle} onChange={setCycle} />
        </div>
        {/* phones: a swipe carousel; wider: a grid */}
        <div className="-mx-4 mt-12 flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto px-4 pb-6 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
          {packages
            ? packages.map((p, i) => (
                <PlanCard
                  key={p.code}
                  pkg={p}
                  scale={scale}
                  cycle={cycle}
                  popular={i === 1}
                  index={i}
                  onChoose={() => navigate(`/register?package=${encodeURIComponent(p.code)}&cycle=${cycle}`)}
                />
              ))
            : Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[34rem] w-[84%] shrink-0 animate-pulse rounded-[28px] bg-[var(--lp-card)] sm:w-auto" />)}
        </div>
      </div>
    </section>
  );
};

export default Packages;
