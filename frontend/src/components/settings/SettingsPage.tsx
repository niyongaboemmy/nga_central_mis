import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Code2, GraduationCap, History, KeyRound, LayoutGrid, Save, Settings as SettingsIcon } from "lucide-react";
import { AI_OFF_MESSAGE, aiPolicyApi, aiUnavailableReason, loadAiPolicy, rememberAiPolicy, type AiApp, type AiPolicy, type AiPolicyView } from "../../api/aiPolicy";
import { Card, CardTitle, EmptyState, Muted, Spinner, inputCls, primaryBtn, secondaryBtn } from "../officeHours/ohUi";
import SelectField from "../ui/SelectField";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useToast } from "../../contexts/ToastContext";

/**
 * Settings (/settings). Today it holds the school AI policy (AI_USAGE_CONTROL_PLAN.md §4.6):
 * the super admin's master switch, the per-app switches, AI grading on submit, the
 * assessment lock and third-party AI tools in TMCode (for students, and for staff when
 * grading). Only holders of
 * AI_POLICY_MANAGE (the platform owner) see and change it; everyone else sees whether AI
 * is available to them. Every app picks a change up within about 3 minutes.
 */

const APPS: Array<{ key: AiApp; name: string; covers: string }> = [
  { key: "mis", name: "NGA MIS", covers: "Lesson Studio, AI lesson notes and plans, scheme of work, curriculum import, mentorship insights, SQL assistant, course tutor" },
  { key: "tm", name: "Task Mentor", covers: "Question generator, rubrics, marking drafts, report comments, hints for students" },
  { key: "tmcode", name: "TMCode", covers: "AI chat, agent modes and inline code completion" },
  { key: "desktop", name: "NGA Desktop", covers: "Ask AI for staff and the AI Tutor for students" },
  { key: "tupo", name: "Tupo", covers: "Mail and Meet AI, translation, meeting notes" },
  { key: "da", name: "Tendo", covers: "AI drafts of discipline rules" },
];

/** What the master switch turns off, for the confirm dialog. */
const TURNS_OFF = [
  ...APPS.map((a) => `${a.name}: ${a.covers}`),
  "Third-party AI tools in TMCode for students and for staff, including grading (Claude Code, Codex, Gemini CLI, Copilot)",
  "AI grading on submit (short answers fall back to keyword marking)",
];

type Draft = Pick<AiPolicy, "enabled" | "apps" | "features" | "assessments" | "thirdPartyExtensions" | "thirdPartyExtensionsStaff">;
const draftOf = (p: AiPolicy): Draft => ({
  enabled: p.enabled,
  apps: { ...p.apps },
  features: { ...p.features },
  assessments: p.assessments,
  thirdPartyExtensions: p.thirdPartyExtensions,
  // Default on: a policy saved before the staff switch existed allows staff tools.
  thirdPartyExtensionsStaff: p.thirdPartyExtensionsStaff !== false,
});

const Switch: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; id?: string }> = ({ on, onChange, label, disabled, id }) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!on)}
    className={`relative h-6 w-11 flex-none rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${on ? "bg-success-500" : "bg-slate-300 dark:bg-gray-600"}`}
  >
    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
  </button>
);

const Row: React.FC<React.PropsWithChildren<{ title: string; hint?: React.ReactNode; htmlFor?: string }>> = ({ title, hint, htmlFor, children }) => (
  <div className="flex items-start justify-between gap-4 py-3">
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-800 dark:text-gray-100">{title}</label>
      {hint && <Muted className="!text-xs">{hint}</Muted>}
    </div>
    <div className="flex-none">{children}</div>
  </div>
);

const when = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

/** Super admin: the school AI policy. */
const AiPolicyCard: React.FC<{ view: AiPolicyView; onSaved: (v: AiPolicyView) => void }> = ({ view, onSaved }) => {
  const [draft, setDraft] = useState<Draft>(() => draftOf(view.policy));
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const { showToast } = useToast();
  useEffect(() => setDraft(draftOf(view.policy)), [view.policy]);

  const dirty = useMemo(() => JSON.stringify(draftOf(view.policy)) !== JSON.stringify(draft), [view.policy, draft]);
  const p = view.policy;

  const save = async () => {
    if (draft.enabled !== p.enabled) {
      const ok = await confirm(
        draft.enabled
          ? {
              title: "Turn AI on for the school?",
              message: "AI becomes available, app by app as set below, to the roles that hold AI_USE. In quizzes and assignments the teacher's setting decides.",
              confirmText: "Turn AI on",
              tone: "info",
            }
          : {
              title: "Turn AI off for the whole school?",
              message: "Nobody can use AI in any app until you turn it back on. This turns off:",
              details: TURNS_OFF,
              confirmText: "Turn AI off",
              tone: "danger",
            },
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const r = await aiPolicyApi.save(draft);
      const next: AiPolicyView = { ...view, policy: r.data.data.policy, updatedByName: r.data.data.updatedByName };
      rememberAiPolicy(next);
      onSaved(next);
      showToast("Saved. Every app picks this up within about 3 minutes.", "success");
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Couldn't save the AI settings.", "error");
    } finally {
      setBusy(false);
    }
  };

  const changed = when(p.updated_at);
  const off = !draft.enabled;
  return (
    <div className="space-y-5">
      <Card labelledBy="ai-master">
        <CardTitle id="ai-master" icon={<Bot className="h-4 w-4" aria-hidden />}>AI for the school</CardTitle>
        <Row
          title="AI is on"
          htmlFor="ai-enabled"
          hint="The master switch. Off means no AI anywhere, for anyone: every app, every feature, every role."
        >
          <Switch id="ai-enabled" on={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} label="AI for the whole school" />
        </Row>
        {off && (
          <p role="status" className="mt-1 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
            {AI_OFF_MESSAGE} The settings below are kept and apply as soon as AI is turned on.
          </p>
        )}
        <p className="mt-3 flex flex-wrap items-center gap-x-2 text-xs text-slate-600 dark:text-gray-300">
          <History className="h-3.5 w-3.5" aria-hidden />
          {changed ? (
            <span>
              Last changed {view.updatedByName ? <>by <strong>{view.updatedByName}</strong> </> : null}on {changed} (version {p.v})
            </span>
          ) : (
            <span>Never changed since setup (version {p.v})</span>
          )}
        </p>
      </Card>

      <Card labelledBy="ai-apps">
        <CardTitle id="ai-apps" icon={<LayoutGrid className="h-4 w-4" aria-hidden />}>Apps</CardTitle>
        <Muted className="mb-1">Turn AI off in one app while the others keep it.</Muted>
        <div className="divide-y divide-slate-200 dark:divide-gray-700/40">
          {APPS.map((a) => (
            <Row key={a.key} title={a.name} hint={a.covers} htmlFor={`ai-app-${a.key}`}>
              <Switch
                id={`ai-app-${a.key}`}
                on={draft.apps[a.key] !== false}
                onChange={(v) => setDraft({ ...draft, apps: { ...draft.apps, [a.key]: v } })}
                label={`AI in ${a.name}`}
              />
            </Row>
          ))}
        </div>
      </Card>

      <Card labelledBy="ai-assess">
        <CardTitle id="ai-assess" icon={<GraduationCap className="h-4 w-4" aria-hidden />}>Quizzes and assignments</CardTitle>
        <div className="divide-y divide-slate-200 dark:divide-gray-700/40">
          <Row
            title="AI in quizzes and assignments"
            htmlFor="ai-assessments"
            hint="Teacher decides: each quiz or assignment has its own AI setting (off by default). Always off locks every one of them to off."
          >
            <SelectField
              id="ai-assessments"
              className={inputCls.replace("w-full", "w-48")}
              value={draft.assessments}
              onChange={(e) => setDraft({ ...draft, assessments: e.target.value === "always_off" ? "always_off" : "teacher" })}
            >
              <option value="teacher">Teacher decides</option>
              <option value="always_off">Always off</option>
            </SelectField>
          </Row>
          <Row
            title="AI grading on submit"
            htmlFor="ai-grading"
            hint="Task Mentor marks short answers and suggests marks for code with AI when work is submitted. Off: short answers are marked by keywords only."
          >
            <Switch id="ai-grading" on={draft.features.grading} onChange={(v) => setDraft({ ...draft, features: { ...draft.features, grading: v } })} label="AI grading on submit" />
          </Row>
        </div>
      </Card>

      <Card labelledBy="ai-thirdparty">
        <CardTitle id="ai-thirdparty" icon={<Code2 className="h-4 w-4" aria-hidden />}>TMCode</CardTitle>
        <div className="divide-y divide-slate-200 dark:divide-gray-700/40">
          <Row
            title="Third-party AI tools for students"
            htmlFor="ai-third-party"
            hint="Editor extensions and terminal tools such as Claude Code, Codex, Gemini CLI and Copilot. Off blocks them in TMCode for students (best-effort on the student's device)."
          >
            <Switch id="ai-third-party" on={draft.thirdPartyExtensions} onChange={(v) => setDraft({ ...draft, thirdPartyExtensions: v })} label="Third-party AI tools for students" />
          </Row>
          <Row
            title="Third-party AI tools for staff (grading)"
            htmlFor="ai-third-party-staff"
            hint="Lets teachers use Claude Code, Gemini and similar tools in TMCode, for example to draft grades for their review. On by default."
          >
            <Switch
              id="ai-third-party-staff"
              on={draft.thirdPartyExtensionsStaff}
              onChange={(v) => setDraft({ ...draft, thirdPartyExtensionsStaff: v })}
              label="Third-party AI tools for staff (grading)"
            />
          </Row>
        </div>
      </Card>

      <Card labelledBy="ai-roles">
        <CardTitle id="ai-roles" icon={<KeyRound className="h-4 w-4" aria-hidden />}>Who may use AI</CardTitle>
        <Muted>
          Outside quizzes and assignments, the role permission <strong>AI_USE</strong> decides. Teachers, school leaders, administrators,
          mentors and counsellors have it; students and parents don't. Give it to (or take it from) a role in Access Studio.
        </Muted>
        <Link to="/access-studio?tab=roles&cap=AI_USE" className={`${secondaryBtn} mt-3`}>
          Open roles in Access Studio
        </Link>
      </Card>

      <div className="sticky bottom-4 flex justify-end gap-2">
        {dirty && (
          <button type="button" className={secondaryBtn} disabled={busy} onClick={() => setDraft(draftOf(p))}>
            Discard
          </button>
        )}
        <button type="button" className={primaryBtn} disabled={!dirty || busy} onClick={() => void save()}>
          <Save className="h-4 w-4" aria-hidden /> {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
};

const SettingsPage: React.FC = () => {
  const [view, setView] = useState<AiPolicyView | null>(null);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    const v = await loadAiPolicy(true);
    setView(v);
    setFailed(!v);
  };
  useEffect(() => {
    void load();
  }, []);

  const mine = aiUnavailableReason(view);
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
          <SettingsIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" aria-hidden /> Settings
        </h1>
        {view?.me.canManage && <Muted className="mt-1">School-wide settings. Changes apply to every NGA app.</Muted>}
      </header>

      {failed ? (
        <EmptyState title="Settings" body="Couldn't load the settings." action={<button type="button" className={secondaryBtn} onClick={() => void load()}>Try again</button>} />
      ) : !view ? (
        <Spinner label="Loading settings" />
      ) : view.me.canManage ? (
        <AiPolicyCard view={view} onSaved={setView} />
      ) : (
        <>
          <Card labelledBy="ai-mine">
            <CardTitle id="ai-mine" icon={<Bot className="h-4 w-4" aria-hidden />}>AI tools</CardTitle>
            <Muted>{mine ?? "AI tools are available to you. In quizzes and assignments your teacher's setting decides."}</Muted>
          </Card>
          <Muted className="text-center">More settings are on the way.</Muted>
        </>
      )}
    </div>
  );
};

export default SettingsPage;
