import React, { useCallback, useEffect, useState } from "react";
import { Copy, Plug, Unplug } from "lucide-react";
import { Card, CardTitle, Muted, secondaryBtn } from "../officeHours/ohUi";
import { useConfirm } from "../../contexts/ConfirmContext";
import { SCOPE_LABELS, connectionsApi, type McpConnectionsView } from "../../api/mcpConnector";

/**
 * My AI → Connected AI apps: the NGA connector inside the person's own Claude or ChatGPT
 * (backend services/mcp). Shows the address to add, the apps they connected, and Revoke.
 * Hidden when the connector isn't available to them and nothing is connected.
 */

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Not yet");

const ConnectedAiApps: React.FC = () => {
  const confirm = useConfirm();
  const [view, setView] = useState<McpConnectionsView | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await connectionsApi.list();
      setView(r?.data?.data ?? null);
    } catch {
      setView(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!view || (!view.available && view.connections.length === 0)) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(view.connectorUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the address stays visible to copy by hand */
    }
  };

  const revoke = async (clientId: string, name: string) => {
    const ok = await confirm({
      title: `Disconnect ${name}?`,
      message: "It stops reading NGA at once. Drafts it already saved stay in NGA. You can connect it again later.",
      confirmText: "Disconnect",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await connectionsApi.revoke(clientId);
      setError(null);
      await load();
    } catch {
      setError("Couldn't disconnect it. Try again.");
    }
  };

  return (
    <Card labelledBy="myai-connected-apps">
      <CardTitle id="myai-connected-apps" icon={<Plug className="h-4 w-4" aria-hidden />}>
        Connected AI apps
      </CardTitle>
      {view.available ? (
        <>
          <Muted>
            Use NGA inside your own Claude or ChatGPT. Your subscription does the thinking; NGA answers with your timetable, schemes and notes, and saves drafts
            you confirm here. In Claude: Settings → Connectors → Add custom connector, then paste this address. In ChatGPT: turn on developer mode in Settings, then create an app with this address.
          </Muted>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 max-w-full break-all rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-900 dark:bg-gray-900 dark:text-gray-100">
              {view.connectorUrl}
            </code>
            <button type="button" className={secondaryBtn} onClick={() => void copy()}>
              <Copy className="h-4 w-4" aria-hidden /> {copied ? "Copied" : "Copy address"}
            </button>
          </div>
        </>
      ) : (
        view.blocked && <Muted>{view.blocked.message} Apps you connected earlier can't read NGA until it is available again.</Muted>
      )}

      {view.connections.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-200 dark:divide-gray-700/50">
          {view.connections.map((c) => (
            <li key={c.clientId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900 dark:text-white">{c.name}</p>
                <p className="text-xs text-slate-600 dark:text-gray-300">
                  {c.scopes.map((s) => SCOPE_LABELS[s] ?? s).join(" · ")} · Last used: {when(c.lastUsedAt)}
                </p>
              </div>
              <button type="button" className={secondaryBtn} onClick={() => void revoke(c.clientId, c.name)}>
                <Unplug className="h-4 w-4" aria-hidden /> Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </Card>
  );
};

export default ConnectedAiApps;
