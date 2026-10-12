import React, { useId, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronDown, ExternalLink, Info, Inbox } from "lucide-react";
import type { AttentionItem, HomeLens, Tier } from "./contract";
import { Card, CardHeader, Chip, CtaLink, SOURCE_LABEL, TIER_DOT, TIER_ICON, TIER_TEXT } from "./ui";
import { type Audience, groupByTier, safeEntities, TIER_LABEL, TIERS } from "./merge";

const VISIBLE_PER_TIER = 4;
const MAX_CHIPS = 3;


/** "Why am I seeing this?" -- names the position that put the item here. */
const WhyButton: React.FC<{ item: AttentionItem; lens?: HomeLens }> = ({ item, lens }) => {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="Why am I seeing this?"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className="grid place-items-center w-8 h-8 -m-1 rounded-full text-slate-500 dark:text-slate-400 hover:bg-surface-light dark:hover:bg-surface-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Info className="w-4 h-4" aria-hidden />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute right-0 top-8 z-20 w-64 max-w-[80vw] rounded-2xl border border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark p-3 text-xs text-text-primary-light dark:text-text-primary-dark shadow-lg"
        >
          Shown because you are <strong>{lens?.reason ?? "signed in"}</strong>
          {lens && lens.type !== "SELF" ? <> ({lens.label})</> : null}. From {SOURCE_LABEL[item.source] ?? item.source}.
        </span>
      )}
    </span>
  );
};

const ItemRow: React.FC<{ item: AttentionItem; lens?: HomeLens; showLens: boolean }> = ({ item, lens, showLens }) => {
  const entities = safeEntities(item);
  const more = entities.length - MAX_CHIPS;
  return (
    <li
      className={`group rounded-2xl px-3.5 py-3 transition-colors ${
        item.tier === "blocking"
          ? "bg-red-50/70 dark:bg-red-900/10"
          : "hover:bg-surface-light dark:hover:bg-surface-dark"
      }`}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 sm:flex-nowrap">
        <span className={`mt-0.5 flex-shrink-0 ${TIER_TEXT[item.tier]}`}>{TIER_ICON[item.tier]}</span>
        <div className="min-w-0 flex-1 basis-[calc(100%-2.5rem)] sm:basis-auto">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 break-words text-sm font-semibold text-text-primary-light dark:text-text-primary-dark">{item.title}</p>
            <WhyButton item={item} lens={lens} />
          </div>
          {item.why && (
            <p className="mt-0.5 break-words text-xs text-slate-600 dark:text-slate-300">{item.why}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {entities.slice(0, MAX_CHIPS).map((e) => (
              <Chip key={e} title={e}>
                {e}
              </Chip>
            ))}
            {more > 0 && <Chip title={entities.slice(MAX_CHIPS).join(", ")}>+{more} more</Chip>}
            {showLens && lens && lens.type !== "SELF" && (
              <Chip className="!bg-blue-50 !text-blue-700 dark:!bg-blue-900/20 dark:!text-blue-300 !border-blue-200/60 dark:!border-blue-800/50">
                {lens.label}
              </Chip>
            )}
            <span className="text-[11px] text-slate-600 dark:text-slate-300">
              {SOURCE_LABEL[item.source] ?? item.source}
            </span>
          </div>
        </div>
        <CtaLink
          href={item.cta.href}
          external={!!item.cta.external}
          className={`ml-7 sm:ml-0 flex-shrink-0 inline-flex min-h-[40px] sm:min-h-[32px] items-center gap-1 rounded-xl px-3.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            item.tier === "blocking"
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-surface-light dark:bg-surface-dark text-text-primary-light dark:text-text-primary-dark hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/20 dark:hover:text-blue-300"
          }`}
        >
          {item.cta.label}
          {item.cta.external ? <ExternalLink className="w-3.5 h-3.5" aria-hidden /> : <ArrowRight className="w-3.5 h-3.5" aria-hidden />}
        </CtaLink>
      </div>
    </li>
  );
};

const TierGroup: React.FC<{
  tier: Tier;
  label: string;
  items: AttentionItem[];
  lensByKey: Map<string, HomeLens>;
  showLens: boolean;
  defaultOpen: boolean;
  /** The only group in the card: the card header already names it, so no
   *  second header and nothing to collapse. */
  bare?: boolean;
}> = ({ tier, label, items, lensByKey, showLens, defaultOpen, bare = false }) => {
  const [open, setOpen] = useState(defaultOpen || bare);
  const [all, setAll] = useState(false);
  // Nothing that needs you now is ever tucked behind "show more"; only the
  // calmer tiers are capped.
  const capped = tier !== "blocking" && items.length > VISIBLE_PER_TIER;
  const visible = all || !capped ? items : items.slice(0, VISIBLE_PER_TIER);
  const headingId = useId();
  return (
    <div className="px-2 pb-2">
      {!bare && (
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={headingId}
        className="flex min-h-[40px] w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 hover:bg-surface-light dark:hover:bg-surface-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <span className={`w-2 h-2 rounded-full ${TIER_DOT[tier]}`} aria-hidden />
        {label}
        <span className="rounded-full bg-surface-light dark:bg-surface-dark px-1.5 text-[11px] tabular-nums">
          {items.length}
        </span>
        <ChevronDown className={`ml-auto w-4 h-4 transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden />
      </button>
      )}
      {open && (
        <ul id={headingId} className="space-y-1">
          {visible.map((i) => (
            <ItemRow key={i.id} item={i} lens={lensByKey.get(i.lens)} showLens={showLens} />
          ))}
          {capped && (
            <li>
              <button
                type="button"
                onClick={() => setAll((a) => !a)}
                className="ml-2 mt-1 inline-flex min-h-[36px] items-center rounded-lg px-2 text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {all ? "Show fewer" : `Show ${items.length - VISIBLE_PER_TIER} more`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

export const NeedsYouList: React.FC<{
  items: AttentionItem[];
  lenses: HomeLens[];
  audience: Audience;
  showLens: boolean;
  /** The hero above already says "all caught up" -- don't say it twice. */
  quietWhenEmpty?: boolean;
  /** The most urgent item is shown in "Next up" and left out of this list. */
  heroTaken?: boolean;
}> = ({ items, lenses, audience, showLens, quietWhenEmpty = false, heroTaken = false }) => {
  const shownGroups = TIERS.filter((t) => groupByTier(items)[t].length > 0);
  const groups = groupByTier(items);
  const lensByKey = new Map(lenses.map((l) => [l.key, l]));
  const urgent = groups.blocking.length + groups.slipping.length;
  return (
    <Card aria-labelledby="home-needs-you">
      <CardHeader
        id="home-needs-you"
        icon={<Inbox className="w-4 h-4" />}
        title={audience === "learner" ? "Your to-do" : audience === "family" ? "For your family" : "Needs you"}
        subtitle={
          items.length === 0
            ? heroTaken
              ? "Nothing else waiting on you"
              : "Nothing waiting on you"
            : urgent === 0
              ? "Nothing urgent — just housekeeping"
              : `${urgent} ${urgent === 1 ? "thing" : "things"} to act on`
        }
      />
      {items.length === 0 && quietWhenEmpty ? (
        <p className="px-5 pb-5 text-sm text-text-secondary-light dark:text-text-secondary-dark">
          New work from any module will appear here the moment it needs you.
        </p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 pb-8 pt-2 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-500" aria-hidden />
          <p className="font-semibold text-text-primary-light dark:text-text-primary-dark">You're all caught up</p>
          <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark">
            New work from any module will appear here the moment it needs you.
          </p>
        </div>
      ) : (
        shownGroups.map((t) => (
          <TierGroup
            key={t}
            tier={t}
            label={TIER_LABEL[audience][t]}
            items={groups[t]}
            lensByKey={lensByKey}
            showLens={showLens}
            defaultOpen={t !== "tidy" || urgent === 0}
            bare={shownGroups.length === 1}
          />
        ))
      )}
    </Card>
  );
};
