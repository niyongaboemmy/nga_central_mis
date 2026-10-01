import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  CircleHelp,
  Hammer,
  Layers,
  Languages,
  Minus,
  PlayCircle,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Ticket,
} from "lucide-react";
import type { Blueprint, Preset, SavedBlueprint } from "../../../api/studio";
import { useMotion } from "../../../design/motion";
import { DeepPartial, matchingPreset, patchBlueprint, previewBlocks } from "./studioModel";

// ---------------------------------------------------------------- small controls

const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }> = ({ checked, onChange, label, disabled }) => (
  <button
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors focus:outline-none focus-visible:shadow-glow disabled:opacity-40 ${checked ? "bg-brand-500" : "bg-gray-300 dark:bg-white/20"}`}
  >
    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
  </button>
);

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="el-segment inline-flex text-xs" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`min-h-[34px] px-3 rounded-lg font-medium ${value === v ? "el-segment-on" : "text-slate-600 dark:text-slate-300"}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

const Stepper: React.FC<{ value: number; min: number; max: number; onChange: (v: number) => void; label: string; unit?: string }> = ({ value, min, max, onChange, label, unit }) => (
  <div className="inline-flex items-center gap-1" role="group" aria-label={label}>
    <button aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)} className="w-8 h-8 rounded-lg el-chip flex items-center justify-center disabled:opacity-40">
      <Minus className="w-3.5 h-3.5" />
    </button>
    <span className="min-w-[3.5rem] text-center text-sm font-semibold tabular-nums text-gray-900 dark:text-white" aria-live="polite">
      {value}
      {unit ? ` ${unit}` : ""}
    </span>
    <button aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)} className="w-8 h-8 rounded-lg el-chip flex items-center justify-center disabled:opacity-40">
      <Plus className="w-3.5 h-3.5" />
    </button>
  </div>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 py-1.5">
    <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
    {children}
  </div>
);

const Block: React.FC<{
  icon: React.ElementType;
  title: string;
  hint: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  soon?: boolean;
  children?: React.ReactNode;
}> = ({ icon: Icon, title, hint, on, onToggle, soon, children }) => {
  const m = useMotion();
  return (
    <div className={`el-card p-3 transition-colors ${on ? "border-brand-200 dark:border-brand-500/40" : ""}`}>
      <div className="flex items-start gap-3">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${on ? "bg-brand-600 text-white" : "el-subtle text-gray-500"}`}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            {title}
            {soon && <span className="px-1.5 rounded-pill el-chip text-[10px] font-semibold">Coming soon</span>}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300">{hint}</p>
        </div>
        <Switch checked={on} onChange={onToggle} label={title} disabled={soon} />
      </div>
      <AnimatePresence initial={false}>
        {on && children && (
          <motion.div {...m("reveal")} className="mt-2 pl-12">
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const QUICK_INSTRUCTIONS = [
  "Use examples from a Rwandan garage or workshop",
  "Explain with a mobile-money example",
  "Keep sentences very short for L3 learners",
  "Add one common mistake and how to avoid it",
];

// ---------------------------------------------------------------- recipe builder

export const RecipeBuilder: React.FC<{
  blueprint: Blueprint;
  onChange: (b: Blueprint) => void;
  presets: Preset[];
  saved: SavedBlueprint[];
  features: { flashcards: boolean; exit_ticket: boolean };
  onSavePreset: () => void;
}> = ({ blueprint: b, onChange, presets, saved, features, onSavePreset }) => {
  const set = (patch: DeepPartial<Blueprint>) => onChange(patchBlueprint(b, patch));
  const active = matchingPreset(b, presets);
  return (
    <div className="space-y-5">
      <section aria-labelledby="presets-h">
        <h3 id="presets-h" className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-300">Start from a preset</h3>
        <div className="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => onChange({ ...p.config, sources: b.sources, extra_asset_ids: b.extra_asset_ids, instructions: b.instructions })}
              aria-pressed={active === p.id}
              className={`text-left p-3 rounded-2xl border transition-colors focus:outline-none focus-visible:shadow-glow ${active === p.id ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-gray-200 dark:border-white/10 hover:border-brand-200"}`}
            >
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{p.name}</p>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 line-clamp-3">{p.description}</p>
            </button>
          ))}
        </div>
        {saved.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {saved.map((s) => (
              <button key={s.blueprint_id} onClick={() => onChange({ ...s.config, sources: b.sources, extra_asset_ids: b.extra_asset_ids })} className="min-h-[34px] px-3 rounded-pill el-chip text-xs font-medium">
                {s.name}
                {s.visibility !== "PRIVATE" && <span className="ml-1 text-slate-600 dark:text-slate-300">· shared</span>}
              </button>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="blocks-h" className="space-y-2">
        <h3 id="blocks-h" className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-300">What each week gets</h3>
        <Block icon={BookOpen} title="Lesson" hint="Saved as a lesson note too, so it shows in Lesson Notes." on={b.lesson.enabled} onToggle={(v) => set({ lesson: { enabled: v } })}>
          <Row label="Length">
            <Segmented label="Lesson length" value={b.lesson.length} onChange={(v) => set({ lesson: { length: v } })} options={[["SHORT", "Short"], ["STANDARD", "Standard"], ["FULL", "Full"]]} />
          </Row>
          <Row label="Interactive breaks">
            <Stepper label="interactive breaks" value={b.lesson.interactive_breaks} min={0} max={3} onChange={(v) => set({ lesson: { interactive_breaks: v } })} />
          </Row>
          <Row label="Worked example">
            <Switch label="Worked example" checked={b.lesson.worked_example} onChange={(v) => set({ lesson: { worked_example: v } })} />
          </Row>
        </Block>
        <Block icon={Hammer} title="Practical task" hint="Hands-on task with steps, safety and a success checklist (TVET)." on={b.practical_task.enabled} onToggle={(v) => set({ practical_task: { enabled: v } })} />
        <Block icon={PlayCircle} title="Video slot" hint="You paste a YouTube link; the AI writes what to watch for. No uploads." on={b.video_slot.enabled} onToggle={(v) => set({ video_slot: { enabled: v } })} />
        <Block icon={CircleHelp} title="Knowledge check" hint="Questions aligned to the week's criteria, answers checked by a second AI." on={b.knowledge_check.enabled} onToggle={(v) => set({ knowledge_check: { enabled: v } })}>
          <Row label="Questions">
            <Stepper label="questions" value={b.knowledge_check.questions} min={3} max={10} onChange={(v) => set({ knowledge_check: { questions: v } })} />
          </Row>
          <Row label="Difficulty">
            <Segmented label="Difficulty" value={b.knowledge_check.difficulty} onChange={(v) => set({ knowledge_check: { difficulty: v } })} options={[["EASY", "Easy"], ["MIXED", "Mixed"], ["CHALLENGING", "Hard"]]} />
          </Row>
        </Block>
        <Block icon={Layers} title="Flashcards" hint="Key terms students review a few minutes a day." on={b.flashcards.enabled} soon={!features.flashcards} onToggle={(v) => set({ flashcards: { enabled: v } })}>
          <Row label="Cards">
            <Stepper label="cards" value={b.flashcards.cards} min={4} max={15} onChange={(v) => set({ flashcards: { cards: v } })} />
          </Row>
        </Block>
        <Block icon={Ticket} title="Exit ticket" hint="1–3 questions + “how sure are you?” before the next lesson." on={b.exit_ticket.enabled} soon={!features.exit_ticket} onToggle={(v) => set({ exit_ticket: { enabled: v } })}>
          <Row label="Questions">
            <Stepper label="exit ticket questions" value={b.exit_ticket.questions} min={1} max={3} onChange={(v) => set({ exit_ticket: { questions: v } })} />
          </Row>
        </Block>
      </section>

      <section aria-labelledby="style-h" className="el-card p-3">
        <h3 id="style-h" className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
          <Languages className="w-4 h-4 text-brand-500" /> Style
        </h3>
        <Row label="Language">
          <Segmented label="Language" value={b.style.language} onChange={(v) => set({ style: { language: v } })} options={[["en", "English"], ["fr", "Français"]]} />
        </Row>
        <Row label="Reading level">
          <Segmented label="Reading level" value={b.style.reading_level} onChange={(v) => set({ style: { reading_level: v } })} options={[["L3", "L3"], ["L4", "L4"], ["L5", "L5"]]} />
        </Row>
        <Row label="Tone">
          <Segmented label="Tone" value={b.style.tone} onChange={(v) => set({ style: { tone: v } })} options={[["FRIENDLY", "Friendly"], ["FORMAL", "Formal"]]} />
        </Row>
        <Row label="Rwandan workplace examples">
          <Switch label="Rwandan workplace examples" checked={b.style.local_examples} onChange={(v) => set({ style: { local_examples: v } })} />
        </Row>
        <Row label="Kinyarwanda glossary for key terms">
          <Switch label="Kinyarwanda glossary" checked={b.style.kinyarwanda_glossary} onChange={(v) => set({ style: { kinyarwanda_glossary: v } })} />
        </Row>
        <Row label="Always double-check answers">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-600 dark:text-slate-300" aria-hidden />
            <Switch label="Always double-check answers with a second AI" checked={b.style.strict_accuracy} onChange={(v) => set({ style: { strict_accuracy: v } })} />
          </span>
        </Row>
      </section>

      <section aria-labelledby="instr-h">
        <label id="instr-h" htmlFor="studio-instructions" className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-300">
          Anything else the AI should know?
        </label>
        <textarea
          id="studio-instructions"
          value={b.instructions}
          maxLength={2000}
          rows={3}
          onChange={(e) => set({ instructions: e.target.value })}
          placeholder="e.g. My class has no internet in the lab — prefer offline examples."
          className="mt-2 el-input py-2 min-h-[88px]"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_INSTRUCTIONS.map((q) => (
            <button key={q} onClick={() => set({ instructions: b.instructions ? `${b.instructions.trim()}\n${q}` : q })} className="min-h-[32px] px-2.5 rounded-pill el-chip text-xs">
              <Sparkles className="w-3 h-3 inline mr-1 text-brand-500" />
              {q}
            </button>
          ))}
        </div>
      </section>

      <button onClick={onSavePreset} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-pill el-chip text-sm font-medium">
        <Save className="w-4 h-4" /> Save this recipe as a preset
      </button>
    </div>
  );
};

/** What a week will look like on a student's phone — no AI call, just the recipe (§9.2 step 3). */
export const PhonePreview: React.FC<{ blueprint: Blueprint; title: string; week?: string | null; features?: { flashcards: boolean; exit_ticket: boolean }; large?: boolean }> = ({ blueprint, title, week, features, large }) => {
  const blocks = previewBlocks(blueprint, features);
  const m = useMotion();
  // large: real phone size, for reading in the "Enlarge" dialog.
  const t = large ? { w: "w-[360px]", min: "min-h-[600px]", week: "text-xs", title: "text-lg", label: "text-sm", detail: "text-xs", pad: "p-3.5" } : { w: "w-[260px]", min: "min-h-[420px]", week: "text-[10px]", title: "text-sm", label: "text-xs", detail: "text-[11px]", pad: "p-2.5" };
  return (
    <div className={`mx-auto ${t.w} rounded-[2rem] border-[6px] border-gray-900 dark:border-white/15 bg-white dark:bg-[#0b0b0f] shadow-soft overflow-hidden`} aria-label="Preview of a week on a student's phone">
      <div className="h-5 flex justify-center items-end"><span className="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-white/15" /></div>
      <div className={`px-3 pb-4 pt-2 ${t.min}`}>
        <p className={`${t.week} uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-300`}>{week || "This week"}</p>
        <p className={`${t.title} font-bold text-gray-900 dark:text-white leading-snug`}>{title}</p>
        <ul className="mt-3 space-y-2">
          <AnimatePresence initial={false}>
            {blocks.map((blk) => (
              <motion.li key={blk.key} layout {...m("reveal")} className={`rounded-xl el-subtle ${t.pad}`}>
                <p className={`${t.label} font-semibold text-gray-900 dark:text-white`}>{blk.label}</p>
                <p className={`${t.detail} text-slate-600 dark:text-slate-300`}>{blk.detail}</p>
                <div className="mt-1.5 space-y-1" aria-hidden>
                  <div className="h-1.5 rounded bg-gray-200 dark:bg-white/10 w-full" />
                  <div className="h-1.5 rounded bg-gray-200 dark:bg-white/10 w-4/5" />
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
          {blocks.length === 0 && <li className={`${t.detail} text-slate-600 dark:text-slate-300`}>Turn on at least one block.</li>}
        </ul>
      </div>
    </div>
  );
};

export default RecipeBuilder;
