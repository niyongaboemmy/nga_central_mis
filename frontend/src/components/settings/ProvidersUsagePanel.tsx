import React, { useEffect, useId, useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardTitle, Muted, Spinner, inputCls } from "../officeHours/ohUi";
import SelectField from "../ui/SelectField";
import { APP_LABELS, STATUS_META, myAiApi, type AiPersonalApp, type CredentialStatus, type MyAiUsage } from "../../api/myAi";
import { PROVIDER_NAMES } from "./PersonalAiPolicyCard";

/**
 * Settings -> AI -> "Providers & usage" (PERSONAL_AI_PROVIDERS_PLAN.md §9.4), for holders of
 * AI_PROVIDERS_MANAGE. Aggregates only: calls per app (school vs personal), per provider, keys
 * by provider and health, people with keys, and the school's free quotas. Never keys, prompts
 * or per-person rows. Renders nothing for anyone the server refuses.
 */

const num = (n: number) => n.toLocaleString();
const providerName = (p: string) => PROVIDER_NAMES[p as keyof typeof PROVIDER_NAMES] ?? p;
const appName = (a: string) => APP_LABELS[a as AiPersonalApp] ?? a;

const th = "px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-gray-300";
const td = "px-2 py-1.5 text-sm text-slate-800 dark:text-gray-100 tabular-nums";

const Table: React.FC<{ caption: string; head: string[]; rows: React.ReactNode[][]; empty: string }> = ({ caption, head, rows, empty }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[20rem] border-collapse">
      <caption className="mb-1 text-left text-sm font-semibold text-slate-800 dark:text-gray-100">{caption}</caption>
      <thead>
        <tr className="border-b border-slate-200 dark:border-gray-700/40">
          {head.map((h, i) => (
            <th key={h} scope="col" className={`${th} ${i > 0 ? "text-right" : ""}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-gray-700/30">
        {rows.length === 0 ? (
          <tr>
            <td colSpan={head.length} className={`${td} text-slate-600 dark:text-gray-300`}>
              {empty}
            </td>
          </tr>
        ) : (
          rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={`${td} ${j > 0 ? "text-right" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

const ProvidersUsagePanel: React.FC = () => {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<MyAiUsage | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "hidden" | "error">("loading");
  const uid = useId();

  useEffect(() => {
    let live = true;
    setState((s) => (s === "hidden" ? s : "loading"));
    myAiApi
      .adminUsage(days)
      .then((r) => {
        if (!live) return;
        if (!Array.isArray(r.data?.data?.byRoute)) return setState("hidden");
        setData(r.data.data);
        setState("ok");
      })
      .catch((e) => live && setState(e?.response?.status === 403 ? "hidden" : "error"));
    return () => {
      live = false;
    };
  }, [days]);

  // Calls per app, school vs personal side by side.
  const byApp = useMemo(() => {
    const m = new Map<string, { school: number; personal: number; failures: number }>();
    for (const r of data?.byRoute ?? []) {
      const e = m.get(r.app) ?? { school: 0, personal: 0, failures: 0 };
      if (r.route === "personal") e.personal += r.calls;
      else e.school += r.calls;
      e.failures += r.failures;
      m.set(r.app, e);
    }
    return [...m.entries()].sort((a, b) => b[1].school + b[1].personal - (a[1].school + a[1].personal));
  }, [data]);

  if (state === "hidden") return null;

  return (
    <Card labelledBy={`${uid}-h`}>
      <CardTitle
        id={`${uid}-h`}
        icon={<BarChart3 className="h-4 w-4" aria-hidden />}
        action={
          <SelectField aria-label="Period" className={inputCls.replace("w-full", "w-36")} value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </SelectField>
        }
      >
        Providers & usage
      </CardTitle>
      <Muted className="mb-3">Totals only. Nobody, administrators included, can see anyone's keys or what they asked.</Muted>

      {state === "loading" && !data ? (
        <Spinner label="Loading AI usage" />
      ) : state === "error" && !data ? (
        <Muted>Couldn't load AI usage.</Muted>
      ) : data ? (
        <div className="space-y-5">
          {!data.vaultConfigured && (
            <p role="status" className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
              The key vault is not configured on this server, so nobody can add their own keys yet.
            </p>
          )}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ["People with keys", num(data.peopleWithKeys)],
              ["Keys", num(data.keys.reduce((s, k) => s + k.count, 0))],
              ["Calls on own keys", num(data.byRoute.filter((r) => r.route === "personal").reduce((s, r) => s + r.calls, 0))],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-gray-800/60">
                <dt className="text-xs font-semibold text-slate-600 dark:text-gray-300">{k}</dt>
                <dd className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{v}</dd>
              </div>
            ))}
          </dl>

          <Table
            caption={`Calls by app (last ${data.days} days)`}
            head={["App", "School AI", "Own keys", "Failed"]}
            rows={byApp.map(([app, e]) => [appName(app), num(e.school), num(e.personal), num(e.failures)])}
            empty="No AI calls in this period."
          />
          <Table
            caption="Calls by provider"
            head={["Provider", "Route", "Calls", "Failed", "Tokens"]}
            rows={data.byProvider.map((r) => [providerName(r.provider), r.route === "personal" ? "Own keys" : "School AI", num(r.calls), num(r.failures), num(r.tokens)])}
            empty="No AI calls in this period."
          />
          <Table
            caption="People's keys by provider and health"
            head={["Provider", "Health", "Keys"]}
            rows={data.keys.map((k) => [providerName(k.provider), STATUS_META[k.status as CredentialStatus]?.label ?? k.status, num(k.count)])}
            empty="Nobody has added a key yet."
          />
          <Table
            caption="School AI free quotas today"
            head={["Provider", "Used", "Daily limit", "Left"]}
            rows={data.schoolQuotas.map((q) => [providerName(q.provider), num(q.used_today), q.daily_limit == null ? "no limit" : num(q.daily_limit), q.remaining == null ? "—" : num(q.remaining)])}
            empty="No quota data."
          />
        </div>
      ) : null}
    </Card>
  );
};

export default ProvidersUsagePanel;
