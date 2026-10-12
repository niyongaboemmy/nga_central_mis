import React, { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { apiError, desktopToolsApi } from "../../api/desktopTools";
import { Card, CardTitle, EmptyState, Muted, Spinner } from "../officeHours/ohUi";
import { useToast } from "../../contexts/ToastContext";

/**
 * For parents and guardians: allow (or not) the NGA AI Tutor for each child.
 * The tutor gives hints rather than answers; chats are saved and may be reviewed by
 * school staff. Used when the school requires parent consent.
 */
const FamilyTutor: React.FC = () => {
  const [data, setData] = useState<{ requireConsent: boolean; enabled: boolean; dailyCap: number; children: Array<{ id: number; name: string; granted: boolean | null }> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const { showToast } = useToast();

  const load = async () => {
    try {
      setData((await desktopToolsApi.family()).data.data);
    } catch (e) {
      setError(apiError(e, "Couldn't load your children."));
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const set = async (id: number, granted: boolean) => {
    setBusy(id);
    try {
      await desktopToolsApi.setConsent(id, granted);
      setData((d) => (d ? { ...d, children: d.children.map((c) => (c.id === id ? { ...c, granted } : c)) } : d));
      showToast(granted ? "Allowed." : "Not allowed.", "success");
    } catch (e) {
      showToast(apiError(e, "Couldn't save."), "error");
    } finally {
      setBusy(null);
    }
  };

  if (error) return <div className="p-6"><EmptyState title="AI Tutor" body={error} /></div>;
  if (!data) return <div className="p-6"><Spinner label="Loading" /></div>;
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white"><Bot className="h-6 w-6 text-blue-600 dark:text-blue-400" aria-hidden /> AI Tutor for my children</h1>
        <Muted className="mt-1">
          NGA Desktop has an AI study coach for students. It explains topics and gives hints, but it doesn't do homework for them, and every reply is checked before it is shown. It pauses during lessons and exams, and each student can ask up to {data.dailyCap} questions a day. Chats are saved and may be read by school staff to keep students safe. The school uses several AI services (some are run by companies whose terms are for adults); no names or contact details are sent to them.
        </Muted>
        {!data.requireConsent && <Muted className="mt-2 !text-xs">Your school doesn't require your permission at the moment; your choice is kept for when it does.</Muted>}
      </header>
      <Card labelledBy="family-kids">
        <CardTitle id="family-kids">My children</CardTitle>
        {data.children.length === 0 ? (
          <Muted>No children are linked to your account. Contact the school office.</Muted>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-gray-700/40">
            {data.children.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{c.name || `Student #${c.id}`}</span>
                <div className="flex gap-2" role="group" aria-label={`AI Tutor for ${c.name}`}>
                  {[true, false].map((g) => (
                    <button key={String(g)} type="button" disabled={busy === c.id} aria-pressed={c.granted === g} onClick={() => void set(c.id, g)}
                      className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${c.granted === g ? (g ? "bg-emerald-600 text-white" : "bg-slate-700 text-white") : "border border-slate-300 text-slate-700 dark:border-gray-700/50 dark:text-gray-200"}`}>
                      {g ? "Allow" : "Don't allow"}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

export default FamilyTutor;
