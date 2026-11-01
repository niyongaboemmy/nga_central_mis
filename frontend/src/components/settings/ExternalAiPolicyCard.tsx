import React from "react";
import { ExternalLink } from "lucide-react";
import { Card, CardTitle, Muted, inputCls } from "../officeHours/ohUi";
import SelectField from "../ui/SelectField";
import { Switch } from "../myAi/ui";
import type { AiExternalPolicy } from "../../vendor/nga-access";

/**
 * Settings -> AI -> "Your own Claude / ChatGPT" (REUSING_AI_SUBSCRIPTIONS_ANALYSIS.md §3,
 * EXTERNAL_AI_CONTRACT.md): staff (AI_EXTERNAL_CONNECT) bringing their own subscriptions.
 * NGA never calls those accounts; the person takes the prompt there, or adds NGA to them.
 * Part of the AI policy draft; Save sends PUT /ai-policy { external }. All off by default.
 */

const Row: React.FC<React.PropsWithChildren<{ title: string; hint?: React.ReactNode; htmlFor: string }>> = ({ title, hint, htmlFor, children }) => (
  <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-800 dark:text-gray-100">
        {title}
      </label>
      {hint && <Muted className="!text-xs">{hint}</Muted>}
    </div>
    <div className="flex-none">{children}</div>
  </div>
);

const ExternalAiPolicyCard: React.FC<{ value: AiExternalPolicy; onChange: (v: AiExternalPolicy) => void }> = ({ value, onChange }) => {
  const anyOn = value.handoff || value.connector;
  return (
    <Card labelledBy="ai-external">
      <CardTitle id="ai-external" icon={<ExternalLink className="h-4 w-4" aria-hidden />}>
        Your own Claude / ChatGPT
      </CardTitle>
      <Muted className="mb-1">
        Many teachers already pay for ChatGPT, Claude or Gemini. NGA can never sign in to those accounts (the providers forbid it), but staff can bring them to
        their work in two ways. Students are never offered this.
      </Muted>
      <div className="divide-y divide-slate-200 dark:divide-gray-700/40">
        <Row
          title="Open in my AI + paste back"
          htmlFor="ai-ext-handoff"
          hint={
            <>
              Every AI button gets "Open in my AI ▾": it opens Claude, ChatGPT or Gemini with NGA's prompt filled in (nothing is sent automatically), and a
              "Paste the answer" box turns the reply into the usual draft. Costs the school nothing. Emails and phone numbers are removed from prompts.
            </>
          }
        >
          <Switch id="ai-ext-handoff" on={value.handoff} onChange={(v) => onChange({ ...value, handoff: v })} label="Open in my AI + paste back" />
        </Row>
        <Row
          title="NGA connector for Claude / ChatGPT"
          htmlFor="ai-ext-connector"
          hint="Staff add NGA to their own Claude or ChatGPT. It can read their timetable, schemes and notes, and save drafts that they confirm in the app. It never sends, publishes, grades or deletes, and it is closed during exams."
        >
          <Switch id="ai-ext-connector" on={value.connector} onChange={(v) => onChange({ ...value, connector: v })} label="NGA connector for Claude / ChatGPT" />
        </Row>
        <Row
          title="Pupil names and records"
          htmlFor="ai-ext-pupils"
          hint={
            <>
              A named pupil's record (for example mentorship insights) goes to a personal AI account only if this allows it <strong>and</strong> the teacher ticks
              "Include pupil details" for that request. Otherwise such features stay on the school's AI.
            </>
          }
        >
          <SelectField
            id="ai-ext-pupils"
            className={inputCls.replace("w-full", "w-64")}
            value={value.pupilNames}
            onChange={(e) => onChange({ ...value, pupilNames: e.target.value === "never" ? "never" : "with_consent" })}
          >
            <option value="never">Never</option>
            <option value="with_consent">Only with the teacher's consent</option>
          </SelectField>
        </Row>
      </div>
      {anyOn && (
        <Muted className="mt-2 !text-xs">
          Only roles with <strong>AI_EXTERNAL_CONNECT</strong> (staff who have AI_USE) see these. Every use is logged without its content.
        </Muted>
      )}
    </Card>
  );
};

export default ExternalAiPolicyCard;
