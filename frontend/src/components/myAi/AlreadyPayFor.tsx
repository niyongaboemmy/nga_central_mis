import React, { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { myAiApi, type MyAiCosts } from "../../api/myAi";
import { useAiPolicy } from "../../api/aiPolicy";
import { Badge } from "./ui";

/**
 * "I already pay for…" (REUSING_AI_SUBSCRIPTIONS_ANALYSIS.md §3.4, §4): what each chat
 * subscription can honestly do with NGA, and what an API key really costs. A subscription is
 * never connected to the NGA apps: the vendors' terms forbid it.
 */

type Option = { title: string; text: React.ReactNode; tone?: "green" | "blue" | "amber" | "slate"; badge?: string };

const link = (href: string, label: string) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 underline underline-offset-2 dark:text-blue-300">
    {label}
    <span className="sr-only"> (opens in a new tab)</span>
  </a>
);

function plans(handoff: boolean, connectorOn: boolean): Array<{ name: string; options: Option[] }> {
  const openIn = (where: string): Option =>
    handoff
      ? { title: "Open in my AI", badge: "Available here", tone: "green", text: <>Next to every AI button, choose "Open in my AI ▾ → {where}", send the prompt there, then paste the answer back.</> }
      : { title: "Open in my AI", badge: "Off at this school", tone: "slate", text: <>When the school turns it on, every AI button gets "Open in my AI ▾ → {where}" and a "Paste the answer" box.</> };
  const connector = (where: string): Option => ({
    title: `The NGA connector for ${where}`,
    badge: connectorOn ? "Available here" : "Off at this school",
    tone: connectorOn ? "green" : "slate",
    text: (
      <>
        Add NGA to your own {where} so it can read your timetable and schemes and save drafts you confirm in the app. See{" "}
        <a href="#connected-apps" className="font-semibold text-blue-700 underline underline-offset-2 dark:text-blue-300">
          My AI → Connected apps
        </a>
        .
      </>
    ),
  });
  return [
    {
      name: "ChatGPT Plus / Pro",
      options: [
        openIn("ChatGPT"),
        connector("ChatGPT"),
        { title: "An API key", text: <>ChatGPT plans don't include API use. A key from {link("https://platform.openai.com/api-keys", "platform.openai.com")} on GPT-6 Luna costs cents a month (see below).</> },
      ],
    },
    {
      name: "Claude Pro / Max / Team",
      options: [
        openIn("Claude"),
        connector("Claude"),
        {
          title: "Monthly API credits",
          badge: "Max, Ultra, Team",
          tone: "amber",
          text: <>Claude Max, Ultra and Team include monthly API credits: create a Console key at {link("https://console.anthropic.com/settings/keys", "console.anthropic.com")} and add it here with "Add AI".</>,
        },
        { title: "In TMCode", text: <>Claude Code signs in with your own subscription on your computer.</> },
      ],
    },
    {
      name: "Gemini / Google AI Pro",
      options: [
        openIn("Gemini (the prompt is copied)"),
        {
          title: "Free with the school's Google account",
          badge: "Free",
          tone: "green",
          text: <>Google Workspace for Education gives Gemini and NotebookLM free in every edition. Ask the school's Google admin to turn them on.</>,
        },
        { title: "An API key", text: <>A Google AI plan doesn't cover the API. {link("https://aistudio.google.com/apikey", "aistudio.google.com")} gives a free key (18+ only).</> },
      ],
    },
    {
      name: "GitHub Copilot",
      options: [
        { title: "In your code editor", text: <>Copilot answers inside VS Code, not in NGA web pages. Teachers can get Copilot Pro free through GitHub Education (new sign-ups were paused in April 2026).</> },
        connector("Copilot in VS Code"),
      ],
    },
  ];
}

/** Each subscription and its honest options; also used in the Add AI wizard. */
export const SubscriptionOptions: React.FC<{ className?: string }> = ({ className = "" }) => {
  const external = useAiPolicy()?.me?.external;
  const handoff = !!external?.handoff;
  const connectorOn = !!external?.connector;
  return (
    <div className={`grid grid-cols-1 gap-3 md:grid-cols-2 ${className}`}>
      {plans(handoff, connectorOn).map((p) => (
        <section key={p.name} aria-label={p.name} className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700/50">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{p.name}</h3>
          <ul className="mt-2 space-y-2">
            {p.options.map((o) => (
              <li key={o.title} className="text-sm text-slate-700 dark:text-gray-200">
                <span className="mr-1.5 font-semibold text-slate-900 dark:text-white">{o.title}</span>
                {o.badge && <Badge tone={o.tone}>{o.badge}</Badge>}
                <p className="mt-0.5 text-slate-600 dark:text-slate-300">{o.text}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};

const usd = (n: number) => `$${n.toFixed(2)}`;

/** "What a key really costs": a heavy month per model, from the catalogue the server ships. */
export const KeyCostTable: React.FC = () => {
  const [costs, setCosts] = useState<MyAiCosts | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => myAiApi.costs())
      .then((r) => live && setCosts(r.data.data))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);
  if (failed) return null;
  if (!costs) return <p className="text-sm text-slate-600 dark:text-slate-300">Loading prices…</p>;
  const k = (n: number) => `${Math.round(n / 1000)}k`;
  return (
    <div>
      <p className="text-sm text-slate-700 dark:text-gray-200">
        A heavy month for a teacher (20 lesson notes, 30 question batches, 20 rubrics, 200 chat turns, 50 mail drafts) is about {k(costs.month.inputTokens)} tokens in and{" "}
        {k(costs.month.outputTokens)} out. On a key, that costs:
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[22rem] text-left text-sm">
          <caption className="sr-only">Cost of a heavy month by model</caption>
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-600 dark:border-gray-700 dark:text-slate-300">
              <th scope="col" className="py-2 pr-3 font-semibold">Model</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Per 1M tokens (in / out)</th>
              <th scope="col" className="py-2 font-semibold">Heavy month</th>
            </tr>
          </thead>
          <tbody>
            {costs.models.map((m) => (
              <tr key={`${m.provider}:${m.model}`} className="border-b border-slate-100 dark:border-gray-800">
                <th scope="row" className="py-2 pr-3 font-medium text-slate-900 dark:text-white">
                  {m.name} <span className="font-normal text-slate-600 dark:text-slate-300">· {m.providerLabel}</span>
                </th>
                <td className="py-2 pr-3 text-slate-700 dark:text-gray-200">
                  {usd(m.cost_in)} / {usd(m.cost_out)}
                </td>
                <td className="py-2 font-semibold text-slate-900 dark:text-white">≈ {usd(m.monthlyUsd)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="py-2 pr-3 font-medium text-slate-900 dark:text-white">School AI, OpenRouter free models</th>
              <td className="py-2 pr-3 text-slate-700 dark:text-gray-200">$0</td>
              <td className="py-2 font-semibold text-slate-900 dark:text-white">$0 (daily limits)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
        A $5 top-up lasts most teachers months on a small model. Prices from the model catalogue of{" "}
        {new Date(costs.catalogDate).toLocaleDateString(undefined, { dateStyle: "medium" })}.{" "}
        <a href="https://models.dev" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2">
          models.dev <ExternalLink className="h-3 w-3" aria-hidden />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </p>
    </div>
  );
};
