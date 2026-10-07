import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, Bot, Flag, Gamepad2, Moon, RotateCcw, Save, ShieldCheck, Timer, UserX } from "lucide-react";
import { apiError, desktopToolsApi, type GameOverride, type GameSettings, type GamesAdmin, type TutorAdmin, type TutorConversation, type TutorMessage, type TutorSettings } from "../../api/desktopTools";
import { Card, CardTitle, EmptyState, Muted, Spinner, inputCls as fieldCls, primaryBtn, secondaryBtn } from "../officeHours/ohUi";
import SelectField from "../ui/SelectField";
import Modal from "../ui/Modal";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useToast } from "../../contexts/ToastContext";

/**
 * NGA Desktop tools: the school's control over the desktop's games (nga-desktop
 * TOOLS_HUB plan §6.7.5). Lessons and exams always lock games on the desktop; here
 * the school switches games on and off, sets the budgets and quiet hours, and the
 * super admin approves Igisoro's rules. Changes reach desktops within 5 minutes.
 */

const GAME_INFO: Record<string, { name: string; kind: "fun" | "learning" | "reset"; group: string }> = {
  "number-place": { name: "Number Place (sudoku)", kind: "fun", group: "Logic" },
  "picture-logic": { name: "Picture Logic (nonogram)", kind: "fun", group: "Logic" },
  "lights-out": { name: "Lights Out", kind: "fun", group: "Logic" },
  mines: { name: "Mines", kind: "fun", group: "Logic" },
  "sliding-15": { name: "Sliding Tiles", kind: "fun", group: "Logic" },
  "merge-2048": { name: "Merge to 2048", kind: "fun", group: "Logic" },
  "code-breaker": { name: "Code Breaker", kind: "fun", group: "Logic" },
  pairs: { name: "Pairs", kind: "learning", group: "Memory" },
  echo: { name: "Echo", kind: "fun", group: "Memory" },
  "five-letter": { name: "Five-Letter Guess", kind: "learning", group: "Words & maths" },
  "word-search": { name: "Word Search", kind: "learning", group: "Words & maths" },
  "math-sprint": { name: "Math Sprint", kind: "learning", group: "Words & maths" },
  typing: { name: "Typing tutor", kind: "learning", group: "Words & maths" },
  "four-in-a-row": { name: "Four in a Row", kind: "fun", group: "Together & reflex" },
  snake: { name: "Snake", kind: "fun", group: "Together & reflex" },
  igisoro: { name: "Igisoro", kind: "fun", group: "Culture" },
  breathe: { name: "Breathe", kind: "reset", group: "Calm-down" },
  stretch: { name: "Stand & Stretch", kind: "reset", group: "Calm-down" },
};

const VARIANT_INFO: Record<string, string> = {
  standard: "Standard: 4 seeds in each back-row pit (32 per player). A move starts from a pit with at least 2 seeds and sows anticlockwise around the player's own two rows. If the last seed lands in an occupied pit, the player lifts those seeds and sows on. Landing in an occupied front-row pit when both opposite pits hold seeds captures them; the captured seeds are sown from the pit where the turn began. A player with no legal move loses.",
  beginner: "Beginner: 2 seeds in every pit, no relay sowing (the turn ends after one lap), captures as in the standard rules. Good for learning the game.",
};

// The house input style, narrow.
const inputCls = fieldCls.replace("w-full", "w-24");

const Switch: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }> = ({ on, onChange, label, disabled }) => (
  <button
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

const NumberField: React.FC<{ id: string; label: string; hint: string; value: number | null; min: number; max: number; onChange: (v: number | null) => void; allowEmpty?: boolean }> = ({
  id, label, hint, value, min, max, onChange, allowEmpty,
}) => (
  <div className="flex items-start justify-between gap-4 py-3">
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-slate-800 dark:text-gray-100">{label}</label>
      <Muted className="!text-xs">{hint}</Muted>
    </div>
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value ?? ""}
        placeholder={allowEmpty ? "None" : undefined}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "" && allowEmpty) return onChange(null);
          const n = Math.round(Number(v));
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        className={inputCls}
      />
      <span className="text-sm text-slate-600 dark:text-gray-300">min</span>
    </div>
  </div>
);

const DesktopToolsAdmin: React.FC = () => {
  const [data, setData] = useState<GamesAdmin | null>(null);
  const [draft, setDraft] = useState<GameSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [variant, setVariant] = useState("standard");
  const confirm = useConfirm();
  const { showToast } = useToast();

  const load = async () => {
    try {
      const r = await desktopToolsApi.games();
      setData(r.data.data);
      setDraft(r.data.data.settings);
      setVariant(r.data.data.settings.igisoro.variant ?? "standard");
      setError(null);
    } catch (e) {
      setError(apiError(e, "Couldn't load the desktop tools settings."));
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const dirty = useMemo(() => !!data && !!draft && JSON.stringify(data.settings) !== JSON.stringify(draft), [data, draft]);
  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const save = async (next: GameSettings, message = "Saved. Desktops pick this up within 5 minutes.") => {
    setBusy(true);
    try {
      const r = await desktopToolsApi.saveGames(next);
      const settings = r.data.data.settings;
      setData((d) => (d ? { ...d, settings } : d));
      setDraft(settings);
      showToast(message, "success");
    } catch (e) {
      showToast(apiError(e, "Couldn't save the settings."), "error");
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="p-6"><EmptyState title="Desktop tools" body={error} action={<button className={secondaryBtn} onClick={() => void load()}>Try again</button>} /></div>;
  if (!data || !draft) return <div className="p-6"><Spinner label="Loading desktop tools settings" /></div>;

  const groups = Object.entries(GAME_INFO).reduce<Record<string, string[]>>((acc, [id, g]) => {
    if (id !== "igisoro" && data.games.includes(id)) (acc[g.group] ??= []).push(id);
    return acc;
  }, {});
  const toggleGame = (id: string, on: boolean) => set("disabled", on ? draft.disabled.filter((x) => x !== id) : [...draft.disabled, id]);
  const ig = data.settings.igisoro;

  const approve = async (on: boolean) => {
    const ok = await confirm({
      title: on ? "Approve Igisoro" : "Switch Igisoro off",
      message: on
        ? `Students and staff will be able to play Igisoro with these rules:\n\n${VARIANT_INFO[variant]}`
        : "Igisoro will disappear from every desktop within 5 minutes. Saved games are kept.",
      confirmText: on ? "Approve" : "Switch off",
      tone: on ? "info" : "warning",
    });
    if (!ok) return;
    await save({ ...data.settings, ...draft, igisoro: { ...ig, approved: on, variant: on ? variant : null } }, on ? "Igisoro approved." : "Igisoro switched off.");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
            <Gamepad2 className="h-6 w-6 text-primary-600 dark:text-primary-400" aria-hidden /> Desktop tools
          </h1>
          <Muted className="mt-1 max-w-2xl">
            Brain-break games in the NGA Desktop app. Games always pause during each person's own lessons and exams. Here you decide which games are on, how long students may play, and when games rest.
          </Muted>
        </div>
        <div className="flex gap-2">
          <button className={secondaryBtn} disabled={!dirty || busy} onClick={() => setDraft(data.settings)}><RotateCcw className="h-4 w-4" aria-hidden /> Undo changes</button>
          <button className={primaryBtn} disabled={!dirty || busy} onClick={() => void save(draft)}><Save className="h-4 w-4" aria-hidden /> Save</button>
        </div>
      </header>

      <Card labelledBy="games-switch">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="games-switch" className="text-base font-semibold text-slate-900 dark:text-white">Games</h2>
            <Muted>{draft.enabled ? "On for students and staff (never for parents)." : "Off: no one can play. Breathe and Stand & Stretch stay available."}</Muted>
          </div>
          <Switch on={draft.enabled} onChange={(v) => set("enabled", v)} label="Games on or off" />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card labelledBy="games-list">
          <CardTitle id="games-list" icon={<Gamepad2 className="h-4 w-4" aria-hidden />}>Each game</CardTitle>
          <div className="space-y-4">
            {Object.entries(groups).map(([group, ids]) => (
              <div key={group}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-gray-300">{group}</p>
                <ul className="divide-y divide-slate-100 dark:divide-gray-700/40">
                  {ids.map((id) => {
                    const g = GAME_INFO[id];
                    const on = !draft.disabled.includes(id);
                    return (
                      <li key={id} className="flex items-center justify-between gap-3 py-2">
                        <span className="text-sm text-slate-800 dark:text-gray-100">
                          {g.name}
                          {g.kind === "learning" && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">Learning · counts half</span>}
                          {g.kind === "reset" && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-500/15 dark:text-sky-200">Doesn't count</span>}
                        </span>
                        <Switch on={on && draft.enabled} disabled={!draft.enabled} onChange={(v) => toggleGame(id, v)} label={`${g.name} on or off`} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card labelledBy="games-time">
            <CardTitle id="games-time" icon={<Timer className="h-4 w-4" aria-hidden />}>Time limits</CardTitle>
            <div className="divide-y divide-slate-100 dark:divide-gray-700/40">
              <NumberField id="budget" label="Daily budget for students" hint="Minutes per day across all computers. 0 stops games for students." value={draft.dailyBudgetMin} min={0} max={600} onChange={(v) => set("dailyBudgetMin", v ?? 0)} />
              <NumberField id="session" label="Session length" hint="After this, students get a movement break." value={draft.sessionCapMin} min={1} max={120} onChange={(v) => set("sessionCapMin", v ?? 1)} />
              <NumberField id="cooldown" label="Break between sessions" hint="How long games rest after a session." value={draft.cooldownMin} min={0} max={60} onChange={(v) => set("cooldownMin", v ?? 0)} />
              <NumberField id="staff" label="Daily budget for staff" hint="Leave empty for no limit." value={draft.staffBudgetMin} min={0} max={600} allowEmpty onChange={(v) => set("staffBudgetMin", v)} />
            </div>
          </Card>

          <Card labelledBy="games-quiet">
            <CardTitle id="games-quiet" icon={<Moon className="h-4 w-4" aria-hidden />}>Quiet hours</CardTitle>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Muted>{draft.quietHours ? "Games rest between these times (Kigali)." : "No quiet hours: games may be played at any time outside lessons."}</Muted>
              <Switch on={!!draft.quietHours} onChange={(v) => set("quietHours", v ? ["21:30", "06:00"] : null)} label="Quiet hours on or off" />
            </div>
            {draft.quietHours && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-700 dark:text-gray-200">
                <label className="flex items-center gap-2">From
                  <input type="time" className={inputCls + " w-32"} value={draft.quietHours[0]} onChange={(e) => e.target.value && set("quietHours", [e.target.value, draft.quietHours![1]])} />
                </label>
                <label className="flex items-center gap-2">to
                  <input type="time" className={inputCls + " w-32"} value={draft.quietHours[1]} onChange={(e) => e.target.value && set("quietHours", [draft.quietHours![0], e.target.value])} />
                </label>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card labelledBy="igisoro">
        <CardTitle id="igisoro" icon={<ShieldCheck className="h-4 w-4" aria-hidden />}>Igisoro</CardTitle>
        <div className="space-y-3">
          <p className="text-sm text-slate-800 dark:text-gray-100">
            {ig.approved ? (
              <>
                <span className="mr-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">On</span>
                Approved with the <strong>{ig.variant}</strong> rules{ig.approvedAt ? ` on ${new Date(ig.approvedAt).toLocaleDateString()}` : ""}.
              </>
            ) : (
              <>
                <span className="mr-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-gray-700/40 dark:text-gray-200">Off</span>
                Igisoro's rules vary from region to region, so it stays off until a super admin approves the rules students will play by.
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-gray-200">
              Rules
              <SelectField
                id="igisoro-variant"
                aria-label="Igisoro rules"
                className={inputCls + " w-40"}
                value={variant}
                disabled={!data.canApproveIgisoro || busy}
                onChange={(e) => setVariant(e.target.value)}
              >
                {data.igisoroVariants.map((v) => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}
              </SelectField>
            </label>
            {data.canApproveIgisoro ? (
              <>
                {(!ig.approved || ig.variant !== variant) && <button className={primaryBtn} disabled={busy || dirty} onClick={() => void approve(true)}>{ig.approved ? "Approve these rules" : "Approve Igisoro"}</button>}
                {ig.approved && <button className={secondaryBtn} disabled={busy || dirty} onClick={() => void approve(false)}>Switch off</button>}
                {dirty && <Muted className="!text-xs">Save your other changes first.</Muted>}
              </>
            ) : (
              <Muted className="!text-xs">Only a super admin can approve Igisoro.</Muted>
            )}
          </div>
          <p className="rounded-2xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700 dark:bg-gray-900/40 dark:text-gray-200">{VARIANT_INFO[variant] ?? variant}</p>
        </div>
      </Card>

      <TutorCard />

      <Exceptions />

      <Card labelledBy="games-usage">
        <CardTitle id="games-usage" icon={<BarChart3 className="h-4 w-4" aria-hidden />}>Last 7 days</CardTitle>
        {data.usage.games.length === 0 ? (
          <Muted>No games played yet.</Muted>
        ) : (
          <>
            <Muted className="mb-3">{data.usage.players === 1 ? "1 person" : `${data.usage.players} people`} played {data.usage.minutes} {data.usage.minutes === 1 ? "minute" : "minutes"} in total. Totals only: no one's individual play time is shown here.</Muted>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-slate-600 dark:text-gray-300"><th className="py-2">Game</th><th className="py-2 text-right">Minutes</th><th className="py-2 text-right">Players</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-700/40">
                {data.usage.games.map((g) => (
                  <tr key={g.game} className="text-slate-800 dark:text-gray-100">
                    <td className="py-2">{GAME_INFO[g.game]?.name ?? g.game}</td>
                    <td className="py-2 text-right tabular-nums">{g.minutes}</td>
                    <td className="py-2 text-right tabular-nums">{g.players}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>
    </div>
  );
};

/** The student AI Tutor (nga-desktop TOOLS_HUB plan §5.7): on/off, daily questions, conversation review. */
const TutorCard: React.FC = () => {
  const [settings, setSettings] = useState<TutorSettings | null>(null);
  const [draft, setDraft] = useState<TutorSettings | null>(null);
  const [list, setList] = useState<TutorConversation[]>([]);
  const [info, setInfo] = useState<Omit<TutorAdmin, "settings" | "conversations"> | null>(null);
  const [flaggedOnly, setFlaggedOnly] = useState(true);
  const [days, setDays] = useState(14);
  const [open, setOpen] = useState<{ conv: TutorConversation; messages: TutorMessage[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    try {
      const r = await desktopToolsApi.tutor({ flagged: flaggedOnly, days });
      const { settings: st, conversations, ...rest } = r.data.data;
      setSettings(st);
      setDraft((d) => d ?? st);
      setList(conversations);
      setInfo(rest);
    } catch (e) {
      showToast(apiError(e, "Couldn't load the AI Tutor."), "error");
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flaggedOnly, days]);
  // While provider tests run (a few minutes), refresh every 10 s.
  useEffect(() => {
    if (!info?.evalRunning) return;
    const id = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.evalRunning]);

  const runTests = async () => {
    try {
      await desktopToolsApi.runTutorEvals();
      setInfo((i) => (i ? { ...i, evalRunning: true } : i));
      showToast("Testing the AI services. This takes a few minutes.", "success");
    } catch (e) {
      showToast(apiError(e, "Couldn't start the tests."), "error");
    }
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const r = await desktopToolsApi.saveTutor(draft);
      setSettings(r.data.data.settings);
      setDraft(r.data.data.settings);
      showToast("Saved. Desktops use it on the next question.", "success");
    } catch (e) {
      showToast(apiError(e, "Couldn't save."), "error");
    } finally {
      setBusy(false);
    }
  };
  const view = async (conv: TutorConversation) => {
    try {
      const r = await desktopToolsApi.tutorConversation(conv.id);
      setOpen({ conv, messages: r.data.data.messages });
    } catch (e) {
      showToast(apiError(e, "Couldn't open the conversation."), "error");
    }
  };

  if (!settings || !draft) return <Card><Spinner label="Loading the AI Tutor" /></Card>;
  const dirty = JSON.stringify(settings) !== JSON.stringify(draft);
  return (
    <Card labelledBy="tutor-card">
      <CardTitle id="tutor-card" icon={<Bot className="h-4 w-4" aria-hidden />}>AI Tutor for students</CardTitle>
      <Muted className="mb-3">
        Students ask the tutor in NGA Desktop. It explains and gives hints instead of doing homework; every reply is checked for given-away answers and unsafe content before it is shown. It pauses in each student's own lessons and exams. Conversations are saved for review here; worrying messages (self-harm, abuse, bullying) and replies students report are flagged. Opening a conversation is recorded in the audit log.
      </Muted>
      <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-slate-50 p-3 dark:bg-gray-900/40">
        <label className="flex items-center gap-3 text-sm font-semibold text-slate-800 dark:text-gray-100">
          <Switch on={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} label="AI Tutor on or off" />
          {draft.enabled ? "On for students" : "Off for students"}
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-gray-200">
          Questions per student per day
          <input type="number" min={1} max={100} value={draft.dailyCap} onChange={(e) => setDraft({ ...draft, dailyCap: Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 1))) })} className={inputCls} aria-label="Questions per student per day" />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-gray-200">
          School total per day
          <input type="number" min={0} max={100000} placeholder="Off" value={draft.schoolDailyPool ?? ""} onChange={(e) => setDraft({ ...draft, schoolDailyPool: e.target.value === "" || Number(e.target.value) <= 0 ? null : Math.round(Number(e.target.value)) })} className={inputCls} aria-label="School total questions per day" />
        </label>
        <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-gray-200">
          <Switch on={draft.requireConsent} onChange={(v) => setDraft({ ...draft, requireConsent: v })} label="Require parent consent" />
          Parent consent required
        </label>
        <span className="flex-1" />
        <button className={primaryBtn} disabled={!dirty || busy} onClick={() => void save()}><Save className="h-4 w-4" aria-hidden /> Save</button>
      </div>
      {info && (
        <Muted className="mt-2 !text-xs">
          Today each student can ask {info.allowanceToday} question{info.allowanceToday === 1 ? "" : "s"}{draft.schoolDailyPool ? " (the school total shared across yesterday's active students, at least 2, at most the per-student number)" : ""}. Saved answers to common questions: {info.cache.entries}, used {info.cache.hits} times; they don't count against students' questions.
          {draft.requireConsent ? " Students need a parent's yes in MIS (parents: AI Tutor for my children)." : ""}
        </Muted>
      )}

      {info && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-gray-100">AI services for students</h3>
            <button className={secondaryBtn} disabled={info.evalRunning} onClick={() => void runTests()}>
              {info.evalRunning ? "Testing…" : "Test the AI services"}
            </button>
          </div>
          <Muted className="!text-xs">Each service answers {"22"} test questions (homework requests, concepts, French). A service passes when at least {info.passMark}% of its homework drafts hold back the answer; one that fails is left out of students' drafts. Services never tested stay in. Every reply is still checked live.</Muted>
          <table className="mt-2 w-full text-left text-sm">
            <thead><tr className="text-xs uppercase tracking-wider text-slate-600 dark:text-gray-300"><th className="py-1.5">Service</th><th className="py-1.5">Result</th><th className="py-1.5 text-right">Held back</th><th className="py-1.5 text-right">Tested</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-700/40">
              {info.providers.map((name) => {
                const e = info.evals.find((x) => x.provider === name);
                return (
                  <tr key={name} className="text-slate-800 dark:text-gray-100">
                    <td className="py-1.5">{name}{e?.model ? <span className="text-xs text-slate-600 dark:text-gray-300"> · {e.model}</span> : null}</td>
                    <td className="py-1.5">
                      {!e ? <span className="text-xs text-slate-600 dark:text-gray-300">Not tested (in use)</span>
                        : e.passed ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">In use</span>
                        : <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-500/15 dark:text-rose-200">Left out</span>}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{e ? `${e.noLeakPct}%` : "—"}</td>
                    <td className="py-1.5 text-right text-xs text-slate-600 dark:text-gray-300">{e ? new Date(e.runAt).toLocaleDateString() : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-gray-100">Conversations</h3>
        <div className="flex gap-1" role="group" aria-label="Which conversations">
          {[true, false].map((f) => (
            <button key={String(f)} type="button" aria-pressed={flaggedOnly === f} onClick={() => setFlaggedOnly(f)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${flaggedOnly === f ? "bg-blue-600 text-white" : "border border-slate-300 text-slate-700 dark:border-gray-700/50 dark:text-gray-200"}`}>
              {f ? "Flagged" : "All"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-gray-200">
          Last
          <input type="number" min={1} max={90} value={days} onChange={(e) => setDays(Math.max(1, Math.min(90, Math.round(Number(e.target.value) || 1))))} className={inputCls} aria-label="Days" />
          days
        </label>
      </div>
      {list.length === 0 ? (
        <Muted className="mt-2">{flaggedOnly ? "Nothing flagged." : "No conversations yet."}</Muted>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 dark:divide-gray-700/40">
          {list.map((c) => (
            <li key={c.id}>
              <button className="flex w-full items-start justify-between gap-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-gray-800/40" onClick={() => void view(c)}>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900 dark:text-white">{c.name || `Student #${c.userId}`}</span>
                  <span className="block truncate text-sm text-slate-700 dark:text-gray-200">{c.firstQuestion || "…"}</span>
                  {c.reasons && <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-300"><Flag className="h-3 w-3" aria-hidden /> {c.reasons}</span>}
                </span>
                <span className="shrink-0 text-xs text-slate-600 dark:text-gray-300">{Math.ceil(c.messages / 2)} questions · {new Date(c.lastAt).toLocaleString()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal size="2xl" isOpen={!!open} onClose={() => setOpen(null)} title={open ? open.conv.name || `Student #${open.conv.userId}` : ""}>
        {open && (
          <ol className="max-h-[70vh] space-y-3 overflow-auto">
            {open.messages.map((m) => (
              <li key={m.id} className={`rounded-2xl p-3 text-sm ${m.role === "student" ? "bg-slate-100 text-slate-900 dark:bg-gray-800 dark:text-gray-100" : "border border-slate-200 text-slate-800 dark:border-gray-700 dark:text-gray-100"}`}>
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-gray-300">
                  <strong>{m.role === "student" ? "Student" : "Tutor"}</strong>
                  <span>{new Date(m.at).toLocaleString()}</span>
                  {m.provider && <span>· {m.provider}</span>}
                  {m.verdict?.unchecked && <span>· not checked</span>}
                  {m.flagged && <span className="font-semibold text-rose-700 dark:text-rose-300">· {m.flagReason}</span>}
                </div>
                <p className="whitespace-pre-wrap">{m.text}</p>
              </li>
            ))}
          </ol>
        )}
      </Modal>
    </Card>
  );
};

/** Per-student exceptions (plan §6.7.5 layer 8): block, or extra daily minutes, with a reason and an end. */
const Exceptions: React.FC = () => {
  const [list, setList] = useState<GameOverride[] | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Array<{ id: number; name: string; className: string | null }>>([]);
  const [pick, setPick] = useState<{ id: number; name: string; className: string | null } | null>(null);
  const [kind, setKind] = useState<"block" | "extend">("block");
  const [extra, setExtra] = useState(15);
  const [days, setDays] = useState(14);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const { showToast } = useToast();

  const load = async () => {
    try {
      setList((await desktopToolsApi.overrides()).data.data.overrides);
    } catch (e) {
      showToast(apiError(e, "Couldn't load the exceptions."), "error");
      setList([]);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (pick || q.trim().length < 2) return setFound([]);
    const id = window.setTimeout(() => {
      desktopToolsApi.findStudents(q).then((r) => setFound(r.data.data.students)).catch(() => setFound([]));
    }, 250);
    return () => window.clearTimeout(id);
  }, [q, pick]);

  const add = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      await desktopToolsApi.addOverride({ userId: pick.id, kind, extraMin: kind === "extend" ? extra : undefined, reason: reason.trim(), days });
      showToast(kind === "block" ? `Games blocked for ${pick.name}.` : `${pick.name} gets ${extra} extra minutes a day.`, "success");
      setPick(null); setQ(""); setReason("");
      await load();
    } catch (e) {
      showToast(apiError(e, "Couldn't add the exception."), "error");
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (o: GameOverride) => {
    if (!(await confirm({ title: "End this exception", message: `${o.name}'s ${o.kind === "block" ? "block" : "extra time"} ends now.`, confirmText: "End now", tone: "warning" }))) return;
    try {
      await desktopToolsApi.revokeOverride(o.id);
      await load();
    } catch (e) {
      showToast(apiError(e, "Couldn't end the exception."), "error");
    }
  };

  return (
    <Card labelledBy="games-exceptions">
      <CardTitle id="games-exceptions" icon={<UserX className="h-4 w-4" aria-hidden />}>Student exceptions</CardTitle>
      <Muted className="mb-3">Block games for one student (behaviour, a parent's request) or give extra daily minutes (for example a learning plan). Every exception needs a reason and ends on its own; both are kept in the audit log.</Muted>
      <div className="grid gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-gray-900/40 md:grid-cols-2">
        <div className="relative">
          <label htmlFor="ex-student" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-gray-300">Student</label>
          {pick ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-gray-700/50 dark:bg-gray-800/40">
              <span className="text-slate-900 dark:text-gray-100">{pick.name}{pick.className ? ` · ${pick.className}` : ""}</span>
              <button className="text-xs font-semibold text-blue-700 dark:text-blue-300" onClick={() => { setPick(null); setQ(""); }}>Change</button>
            </div>
          ) : (
            <input id="ex-student" className={fieldCls} placeholder="Type a name…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          )}
          {!pick && found.length > 0 && (
            <ul role="listbox" className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
              {found.map((s) => (
                <li key={s.id}>
                  <button role="option" aria-selected={false} className="w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 dark:text-gray-100 dark:hover:bg-gray-700/50" onClick={() => { setPick(s); setFound([]); }}>
                    {s.name}{s.className && <span className="text-slate-600 dark:text-gray-300"> · {s.className}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-gray-300">Exception</span>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Exception type">
            {(["block", "extend"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${kind === k ? "bg-blue-600 text-white" : "border border-slate-300 text-slate-700 dark:border-gray-700/50 dark:text-gray-200"}`}>
                {k === "block" ? "Block games" : "Extra time"}
              </button>
            ))}
            {kind === "extend" && (
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-gray-200">
                <input type="number" min={5} max={120} value={extra} onChange={(e) => setExtra(Math.max(5, Math.min(120, Math.round(Number(e.target.value) || 5))))} className={inputCls} aria-label="Extra minutes a day" />
                min/day
              </label>
            )}
          </div>
        </div>
        <div>
          <label htmlFor="ex-reason" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-gray-300">Reason</label>
          <input id="ex-reason" className={fieldCls} maxLength={300} placeholder="e.g. Parent's request, learning plan" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex items-end justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-gray-200">
            For
            <input type="number" min={1} max={120} value={days} onChange={(e) => setDays(Math.max(1, Math.min(120, Math.round(Number(e.target.value) || 1))))} className={inputCls} aria-label="Days" />
            days
          </label>
          <button className={primaryBtn} disabled={!pick || reason.trim().length < 3 || busy} onClick={() => void add()}>Add exception</button>
        </div>
      </div>
      <div className="mt-4">
        {list === null ? (
          <Spinner label="Loading exceptions" />
        ) : list.length === 0 ? (
          <Muted>No exceptions right now.</Muted>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-gray-700/40">
            {list.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {o.name}
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${o.kind === "block" ? "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"}`}>
                      {o.kind === "block" ? "Blocked" : `+${o.extraMin} min/day`}
                    </span>
                  </p>
                  <Muted className="!text-xs">{o.reason} · until {new Date(o.endsAt).toLocaleDateString()}{o.by ? ` · by ${o.by}` : ""}</Muted>
                </div>
                <button className={secondaryBtn} onClick={() => void revoke(o)}>End now</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
};

export default DesktopToolsAdmin;
