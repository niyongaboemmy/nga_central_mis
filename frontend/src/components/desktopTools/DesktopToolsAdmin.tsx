import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, Gamepad2, Moon, RotateCcw, Save, ShieldCheck, Timer } from "lucide-react";
import { apiError, desktopToolsApi, type GameSettings, type GamesAdmin } from "../../api/desktopTools";
import { Card, CardTitle, EmptyState, Muted, Spinner, inputCls as fieldCls, primaryBtn, secondaryBtn } from "../officeHours/ohUi";
import SelectField from "../ui/SelectField";
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

export default DesktopToolsAdmin;
