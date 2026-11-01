import React, { useId } from "react";
import { Link } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { Card, CardTitle, Muted, inputCls } from "../officeHours/ohUi";
import SelectField from "../ui/SelectField";
import { Switch } from "../myAi/ui";
import { APP_LABELS } from "../../api/myAi";
import { AI_PERSONAL_APPS, AI_PROVIDER_IDS, AI_STUDENT_BLOCKED_PROVIDERS, type AiPersonalPolicy, type AiProviderId } from "../../vendor/nga-access";

/**
 * Settings -> AI -> "My AI (people's own keys)" (PERSONAL_AI_PROVIDERS_PLAN.md §4.1): who may
 * add their own AI keys, which providers, and the rules around them. Part of the AI policy
 * draft; the page's Save button sends it with PUT /ai-policy { personal }.
 */

export const PROVIDER_NAMES: Record<AiProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic (Claude)",
  gemini: "Google Gemini",
  groq: "Groq",
  deepseek: "DeepSeek",
  openrouter: "OpenRouter",
  mistral: "Mistral",
  glm: "Z.ai (GLM)",
  cerebras: "Cerebras",
  custom: "Custom (OpenAI-compatible)",
};

const STUDENT_BLOCK_WHY: Partial<Record<AiProviderId, string>> = {
  gemini: "Google's Gemini API terms require users to be 18 or older.",
  deepseek: "DeepSeek stores data in China and may train on it.",
  custom: "Custom endpoints are for staff only.",
};

const Row: React.FC<React.PropsWithChildren<{ title: string; hint?: React.ReactNode; htmlFor?: string; id?: string }>> = ({ title, hint, htmlFor, id, children }) => (
  <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
    <div className="min-w-0">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-800 dark:text-gray-100">
          {title}
        </label>
      ) : (
        <p id={id} className="text-sm font-semibold text-slate-800 dark:text-gray-100">
          {title}
        </p>
      )}
      {hint && <Muted className="!text-xs">{hint}</Muted>}
    </div>
    <div className="flex-none">{children}</div>
  </div>
);

/** Checkbox chips for a provider allowlist. */
const ProviderPicker: React.FC<{
  legend: string;
  hint: string;
  value: AiProviderId[];
  options: AiProviderId[];
  disabled?: Partial<Record<AiProviderId, string>>;
  onChange: (v: AiProviderId[]) => void;
}> = ({ legend, hint, value, options, disabled = {}, onChange }) => {
  const uid = useId();
  return (
    <fieldset className="py-3" aria-describedby={`${uid}-hint`}>
      <legend className="text-sm font-semibold text-slate-800 dark:text-gray-100">{legend}</legend>
      <Muted className="!text-xs">
        <span id={`${uid}-hint`}>{hint}</span>
      </Muted>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((p) => {
          const why = disabled[p];
          const on = !why && value.includes(p);
          return (
            <label
              key={p}
              title={why}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${why ? "cursor-not-allowed border-slate-200 text-slate-500 dark:border-gray-700/40 dark:text-gray-400" : on ? "border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-500/15 dark:text-blue-100" : "border-slate-300 text-slate-800 dark:border-gray-700/50 dark:text-gray-100"}`}
            >
              <input
                type="checkbox"
                className="h-4 w-4"
                disabled={!!why}
                checked={on}
                onChange={(e) => onChange(e.target.checked ? [...value, p] : value.filter((x) => x !== p))}
              />
              {PROVIDER_NAMES[p]}
            </label>
          );
        })}
      </div>
      {Object.keys(disabled).length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-slate-600 dark:text-gray-300">
          {Object.entries(disabled).map(([p, why]) => (
            <li key={p}>
              <strong>{PROVIDER_NAMES[p as AiProviderId]}</strong> is never available here: {why}
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
};

const PersonalAiPolicyCard: React.FC<{ value: AiPersonalPolicy; onChange: (v: AiPersonalPolicy) => void }> = ({ value: p, onChange }) => {
  const uid = useId();
  const set = (patch: Partial<AiPersonalPolicy>) => onChange({ ...p, ...patch });
  const staffOptions = AI_PROVIDER_IDS.filter((x) => x !== "custom");
  const studentBlocked = Object.fromEntries([...AI_STUDENT_BLOCKED_PROVIDERS, "custom"].map((x) => [x, STUDENT_BLOCK_WHY[x as AiProviderId] ?? "Not for students."])) as Partial<
    Record<AiProviderId, string>
  >;
  const off = !p.enabled;

  return (
    <Card labelledBy={`${uid}-h`}>
      <CardTitle id={`${uid}-h`} icon={<KeyRound className="h-4 w-4" aria-hidden />}>
        My AI (people's own keys)
      </CardTitle>
      <Muted className="mb-1">
        Lets people add their own AI provider keys and choose which AI answers what. School AI stays the free default; nobody at school can see anyone's keys.
        People manage theirs on <Link to="/my-ai" className="font-semibold text-blue-700 underline dark:text-blue-300">My AI</Link>.
      </Muted>
      <div className="divide-y divide-slate-200 dark:divide-gray-700/40">
        <Row title="My AI is on" htmlFor={`${uid}-on`} hint="Off: everyone uses School AI, and stored keys are not used. The rules below are kept.">
          <Switch id={`${uid}-on`} on={p.enabled} onChange={(v) => set({ enabled: v })} label="My AI for the school" />
        </Row>

        <div className={off ? "opacity-60" : ""}>
          <Row title="Staff may add their own keys" htmlFor={`${uid}-staff`} hint="Roles with AI_PERSONAL_PROVIDERS (teachers and staff by default).">
            <Switch id={`${uid}-staff`} on={p.staff.allowed} onChange={(v) => set({ staff: { ...p.staff, allowed: v } })} label="Staff may add their own keys" />
          </Row>
          {p.staff.allowed && (
            <>
              <ProviderPicker
                legend="Providers for staff"
                hint="Tick the providers staff may use. None ticked means all of them (custom endpoints are a separate switch)."
                value={p.staff.providers}
                options={staffOptions}
                onChange={(v) => set({ staff: { ...p.staff, providers: v } })}
              />
              <Row
                title="Custom endpoints"
                htmlFor={`${uid}-custom`}
                hint="Staff may connect any OpenAI-compatible service by address (https only; private addresses are blocked)."
              >
                <Switch
                  id={`${uid}-custom`}
                  on={p.staff.customEndpoints}
                  onChange={(v) => set({ staff: { ...p.staff, customEndpoints: v } })}
                  label="Custom endpoints for staff"
                />
              </Row>
            </>
          )}

          <Row title="Students may add their own keys" htmlFor={`${uid}-students`} hint="Roles with AI_PERSONAL_PROVIDERS_STUDENT. Off by default.">
            <Switch id={`${uid}-students`} on={p.students.allowed} onChange={(v) => set({ students: { ...p.students, allowed: v } })} label="Students may add their own keys" />
          </Row>
          {p.students.allowed && (
            <>
              <ProviderPicker
                legend="Providers for students"
                hint="Only ticked providers. OpenRouter keys of students always stay on free models that don't train on prompts."
                value={p.students.providers}
                options={AI_PROVIDER_IDS.filter((x) => x !== "custom")}
                disabled={studentBlocked}
                onChange={(v) => set({ students: { ...p.students, providers: v.filter((x) => !studentBlocked[x]) } })}
              />
              <Row title="Requests a day per student" htmlFor={`${uid}-max`} hint="With their own keys, all apps together. 0 stops students' own keys without turning the switch off.">
                <input
                  id={`${uid}-max`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={10000}
                  className={inputCls.replace("w-full", "w-28")}
                  value={p.students.maxDailyRequests}
                  onChange={(e) => {
                    const n = Math.max(0, Math.min(10000, Math.floor(Number(e.target.value) || 0)));
                    set({ students: { ...p.students, maxDailyRequests: n } });
                  }}
                />
              </Row>
            </>
          )}

          <Row title="Inside quizzes and assignments" htmlFor={`${uid}-assess`} hint="Never: School AI always answers there, under the teacher's AI setting.">
            <SelectField
              id={`${uid}-assess`}
              className={inputCls.replace("w-full", "w-48")}
              value={p.inAssessments}
              onChange={(e) => set({ inAssessments: e.target.value === "allowed" ? "allowed" : "never" })}
            >
              <option value="never">Never</option>
              <option value="allowed">Allowed</option>
            </SelectField>
          </Row>
          <Row title="Fall back to School AI" htmlFor={`${uid}-fb`} hint="When someone's key fails (out of credit, refused), School AI answers instead and they're told why.">
            <Switch id={`${uid}-fb`} on={p.fallbackToSchool} onChange={(v) => set({ fallbackToSchool: v })} label="Fall back to School AI" />
          </Row>

          <div className="py-3">
            <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Apps</p>
            <Muted className="!text-xs">Turn My AI off in one app; School AI keeps answering there.</Muted>
            <div className="mt-1 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {AI_PERSONAL_APPS.map((a) => (
                <div key={a} className="flex items-center justify-between gap-3 py-1.5">
                  <label htmlFor={`${uid}-app-${a}`} className="text-sm text-slate-800 dark:text-gray-100">
                    {APP_LABELS[a]}
                  </label>
                  <Switch id={`${uid}-app-${a}`} on={p.apps[a] !== false} onChange={(v) => set({ apps: { ...p.apps, [a]: v } })} label={`My AI in ${APP_LABELS[a]}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default PersonalAiPolicyCard;
