import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Bell, Check, Hourglass, Moon, RotateCcw, Server, Sparkles, Wand2, Zap } from "lucide-react";
import { Blueprint, DraftItem, Estimate, StudioData, studioApi } from "../../../api/studio";
import { builderRoutes } from "../../../api/elearning";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import { useMotion } from "../../../design/motion";
import { usePrompt } from "../ui/PromptDialog";
import Mascot from "../ui/Mascot";
import { Skeleton } from "../ui/primitives";
import WeekRail from "./WeekRail";
import RecipeBuilder from "./RecipeBuilder";
import StudentPreview from "./StudentPreview";
import SourcesStep from "./SourcesStep";
import GenerationBoard from "./GenerationBoard";
import ReviewWorkspace from "./ReviewWorkspace";
import { useRunStream } from "./useRunStream";
import {
  cloneBlueprint,
  currentWeek,
  formatEstimate,
  isRunActive,
  quotaLeftPct,
  selectWeeks,
  StepId,
  STEPS,
  WeekFilter,
} from "./studioModel";

const DRAFT_KEY = (courseId: number) => `studio:blueprint:${courseId}`;
const readDraft = (courseId: number): Blueprint | null => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(courseId));
    return raw ? (JSON.parse(raw) as Blueprint) : null;
  } catch {
    return null;
  }
};
const writeDraft = (courseId: number, b: Blueprint) => {
  try {
    localStorage.setItem(DRAFT_KEY(courseId), JSON.stringify(b));
  } catch {
    /* private mode / quota: the recipe simply isn't remembered */
  }
};

/**
 * Lesson Studio (ELEARNING_AI_LESSON_STUDIO_IMPLEMENTATION_PLAN.md §9): pick weeks → choose
 * sources → design the recipe → try one week → generate → review and approve. Generation runs
 * on the server; this page only starts, watches and reviews runs, so it can be closed at any
 * time. Nothing reaches students until the teacher approves it.
 */
const LessonStudioPage: React.FC = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const cid = Number(courseId);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [ask, promptUI] = usePrompt();
  const m = useMotion();

  const [data, setData] = useState<StudioData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<StepId>("weeks");
  const [filter, setFilter] = useState<WeekFilter>("gaps");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [focused, setFocused] = useState<number | null>(null);
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [busy, setBusy] = useState(false);
  const runId = params.get("run") ? Number(params.get("run")) : null;
  const stepperRef = useRef<HTMLElement>(null);
  // On a phone the stepper scrolls sideways: keep the current step in view.
  useEffect(() => {
    stepperRef.current?.querySelector<HTMLElement>('[aria-current="step"]')?.scrollIntoView?.({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [step]);
  const { run, reload: reloadRun, connected } = useRunStream(runId);

  const load = useCallback(async () => {
    try {
      const r = await studioApi.studio(cid);
      setData(r.data.data);
      setLoadError(null);
      return r.data.data;
    } catch (e: any) {
      setLoadError(e?.response?.data?.message || "Could not open the Lesson Studio for this course.");
      return null;
    }
  }, [cid]);

  // First load: weeks, presets, the remembered recipe, and an active run if there is one.
  useEffect(() => {
    void load().then((d) => {
      if (!d) return;
      const fullPreset = d.presets.find((p) => p.id === "full_lesson") ?? d.presets[0];
      setBlueprint(readDraft(cid) ?? cloneBlueprint(fullPreset.config));
      setSelected(new Set(selectWeeks(d.weeks, "gaps")));
      const now = currentWeek(d.weeks);
      setFocused(now?.section?.section_id ?? null);
      if (!params.get("run") && d.active_runs.length) setParams((p) => { p.set("run", String(d.active_runs[0])); return p; }, { replace: true });
      if (params.get("run") || d.active_runs.length) setStep("generate");
      if (params.get("week")) {
        const w = Number(params.get("week"));
        setSelected(new Set([w]));
        setFocused(w);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  useEffect(() => {
    if (blueprint) writeDraft(cid, blueprint);
  }, [cid, blueprint]);

  // Land on the review step when a run finishes with drafts.
  useEffect(() => {
    if (run && run.run.status === "READY_FOR_REVIEW" && step === "generate" && run.weeks.some((w) => w.pending_review > 0)) {
      showToast("Drafts are ready to review", "success");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.run.status]);

  const selectedIds = useMemo(() => (data ? data.weeks.filter((w) => w.section && selected.has(w.section.section_id)).map((w) => w.section!.section_id) : []), [data, selected]);
  const selectedWeeks = useMemo(() => (data ? data.weeks.filter((w) => w.section && selected.has(w.section.section_id)) : []), [data, selected]);
  const nowSection = useMemo(() => (data ? currentWeek(data.weeks)?.section?.section_id ?? null : null), [data]);

  // Live estimate: debounced on every recipe / week change.
  useEffect(() => {
    if (!blueprint || selectedIds.length === 0) {
      setEstimate(null);
      return;
    }
    setEstimating(true);
    const t = setTimeout(() => {
      studioApi
        .estimate(cid, { blueprint, section_ids: selectedIds })
        .then((r) => setEstimate(r.data.data))
        .catch(() => setEstimate(null))
        .finally(() => setEstimating(false));
    }, 450);
    return () => clearTimeout(t);
  }, [cid, blueprint, selectedIds]);

  const goto = (s: StepId) => setStep(s);
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const startRun = async (mode: "PREVIEW" | "FULL", when: "now" | "tonight" = "now") => {
    if (!blueprint) return;
    const ids = mode === "PREVIEW" ? [focused && selected.has(focused) ? focused : nowSection ?? selectedIds[0]].filter(Boolean) as number[] : selectedIds;
    if (ids.length === 0) return showToast("Choose at least one week", "error");
    setBusy(true);
    try {
      const r = await studioApi.start(cid, { blueprint, section_ids: ids, mode, start: when });
      setParams((p) => { p.set("run", String(r.data.data.run_id)); return p; });
      setStep(mode === "PREVIEW" ? "try" : "generate");
      if (when === "tonight") showToast("Scheduled for tonight — you'll get a notification when it's ready", "success");
      else if (mode === "FULL") showToast("Running on the server — you can leave this page", "success");
      void load();
    } catch (e: any) {
      const existing = e?.response?.data?.errors?.[0]?.run_id;
      if (e?.response?.status === 409 && existing) {
        showToast("A run is already in progress — showing it", "info");
        setParams((p) => { p.set("run", String(existing)); return p; });
        setStep("generate");
      } else showToast(e?.response?.data?.message || "Could not start", "error");
    } finally {
      setBusy(false);
    }
  };

  const control = async (action: "pause" | "resume" | "cancel" | "retry-failed") => {
    if (!runId) return;
    if (action === "cancel" && !(await confirm({ title: "Stop this run?", message: "Weeks already drafted stay for you to review. Weeks not started yet are skipped.", confirmText: "Stop", tone: "danger" }))) return;
    setBusy(true);
    try {
      await studioApi.control(runId, action);
      await reloadRun();
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Could not update the run", "error");
    } finally {
      setBusy(false);
    }
  };

  const approveWeek = async (sectionId: number, opts: { itemIds?: number[]; publish: boolean }) => {
    setBusy(true);
    try {
      const r = await studioApi.approve(sectionId, { item_ids: opts.itemIds, publish_section: opts.publish });
      const d = r.data.data;
      if (d.needs_attention.length) showToast(`${d.approved.length} approved · ${d.needs_attention[0].reason}`, "info");
      else showToast(d.approved.length === 1 ? "Approved" : `${d.approved.length} approved — on the course`, "success");
      await Promise.all([reloadRun(), load()]);
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Could not approve", "error");
    } finally {
      setBusy(false);
    }
  };

  const approveClean = async (ids: number[], publish: boolean) => {
    setBusy(true);
    try {
      for (const id of ids) await studioApi.approve(id, { publish_section: publish });
      showToast(`${ids.length} weeks approved`, "success");
      await Promise.all([reloadRun(), load()]);
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Could not approve every week", "error");
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async (item: DraftItem) => {
    const instruction = await ask({
      title: "Redo this with a note",
      detail: "Say what to change — the AI keeps the curriculum and your sources.",
      placeholder: "e.g. Simpler words, and an example from a carpentry workshop",
      confirmLabel: "Redo",
      icon: Wand2,
    });
    if (instruction === null) return;
    setBusy(true);
    try {
      const r = await studioApi.regenerate(item.item_id, instruction);
      showToast("Working on a new version…", "info");
      setParams((p) => { p.set("run", String(r.data.data.run_id)); return p; });
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Could not redo it", "error");
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async (item: DraftItem) => {
    const own = item.ai_origin === "NONE";
    if (!(await confirm({ title: own ? "Take this note off the week?" : "Discard this draft?", message: own ? "Your note itself is kept in Lesson Notes." : "The AI draft is deleted. You can generate the week again later.", confirmText: own ? "Remove" : "Discard", tone: "danger" }))) return;
    setBusy(true);
    try {
      await studioApi.dismiss(item.item_id);
      await reloadRun();
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Could not remove it", "error");
    } finally {
      setBusy(false);
    }
  };

  const savePreset = async () => {
    if (!blueprint) return;
    const name = await ask({ title: "Save recipe as a preset", detail: "It appears under the presets for all your subjects.", placeholder: "e.g. My practical weeks", confirmLabel: "Save", validate: (v) => (v.trim() ? null : "Give it a name") });
    if (!name) return;
    try {
      await studioApi.saveBlueprint({ name: name.trim(), config: blueprint });
      showToast("Preset saved", "success");
      void load();
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Could not save", "error");
    }
  };

  // ---------------------------------------------------------------- render

  if (loadError) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center">
        <Mascot pose="sleepy" size={72} className="mx-auto" />
        <p className="mt-3 text-base font-semibold text-gray-900 dark:text-white">{loadError}</p>
        <button onClick={() => navigate(builderRoutes.build(cid))} className="mt-4 min-h-[44px] px-4 rounded-pill el-chip text-sm font-medium">Back to the course</button>
      </div>
    );
  }
  if (!data || !blueprint) {
    return (
      <div className="pt-6 space-y-3" aria-busy="true">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-12 w-full" />
        <div className="grid md:grid-cols-[300px_1fr] gap-4"><Skeleton className="h-[60vh]" /><Skeleton className="h-[60vh]" /></div>
      </div>
    );
  }

  const est = estimate ? formatEstimate(estimate) : null;
  const quotaPct = quotaLeftPct(data.quota);
  const focusWeek = data.weeks.find((w) => w.section?.section_id === focused) ?? null;
  const reviewCount = run?.weeks.reduce((n, w) => n + w.pending_review, 0) ?? 0;
  const runActive = run ? isRunActive(run.run.status) : false;
  const canNext = step === "weeks" ? selectedIds.length > 0 : true;
  // The week "Try one week" drafts (and the phone shows while trying).
  const tryWeek = (focused && selected.has(focused) ? focusWeek : data.weeks.find((w) => w.section?.section_id === nowSection)) ?? null;
  const previewOnScreen = step === "try" && !!run && run.run.mode === "PREVIEW";
  // The phone mock-up helps while planning; once real output is on screen it only competes with it.
  const planning = step === "weeks" || step === "sources" || step === "recipe" || (step === "try" && !previewOnScreen);
  const phoneWeek = step === "try" ? tryWeek : focusWeek;
  // The desktop preview's sidebar: the previewed week with its neighbours.
  const previewWeekLabels = (() => {
    const labelled = data.weeks.filter((w) => w.entry.week_number);
    const i = Math.max(0, labelled.findIndex((w) => w === phoneWeek));
    return labelled.slice(Math.max(0, i - 2), i + 3).map((w) => w.entry.week_number as string);
  })();

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] overflow-hidden pt-4">
      {promptUI}
      {/* Header */}
      <div className="flex-shrink-0">
        <button onClick={() => navigate(builderRoutes.build(cid))} className="inline-flex items-center gap-1 min-h-[40px] text-sm text-slate-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white">
          <ArrowLeft className="w-4 h-4" /> {data.subject.name}
        </button>
        <div className="mt-1 flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-brand-500" aria-hidden /> Lesson Studio
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {data.class_group.name} · {data.term.name} · drafts every week from your scheme of work, plans and notes. Nothing reaches students until you approve it.
            </p>
          </div>
          {/* Metadata stays quiet: drafting time in plain words, AI calls on hover; the free-quota
              chip only appears when it matters (running low). */}
          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600 dark:text-slate-300" aria-live="polite">
            {quotaPct !== null && quotaPct <= 30 && (
              <span className={`px-2.5 py-1 rounded-pill font-semibold ${quotaPct > 0 ? "el-chip-warning" : "el-chip-danger"}`} title="Free AI requests left today — runs wait for the quota and carry on by themselves">
                {quotaPct > 0 ? `Free AI running low (${quotaPct}% left today)` : "Free AI used up for today"}
              </span>
            )}
            {estimate && step !== "generate" && step !== "review" && (
              <span className={est?.tone === "wait" ? "text-warning-700 dark:text-warning-500" : ""} title={`${estimate.calls} AI calls · ${est?.detail ?? ""}`}>
                {estimating ? "Estimating…" : `AI drafting · about ${estimate.minutes} min${estimate.fits_today ? "" : " · continues tomorrow"}`}
              </span>
            )}
          </div>
        </div>
        {!data.ai_configured && (
          <p className="mt-2 px-3 py-2 rounded-xl el-chip-warning text-sm">AI isn't configured on this server yet — you can plan a recipe, but generation won't start.</p>
        )}

        {/* Stepper */}
        <nav ref={stepperRef} aria-label="Lesson Studio steps" className="mt-3 overflow-x-auto">
          <ol className="flex items-center gap-1 min-w-max">
            {STEPS.map((s, i) => {
              const done = i < stepIndex;
              const on = s.id === step;
              const disabled = (s.id === "generate" && !runId) || (s.id === "review" && !runId);
              return (
                <li key={s.id} className="flex items-center gap-1">
                  <button
                    onClick={() => !disabled && goto(s.id)}
                    disabled={disabled}
                    aria-current={on ? "step" : undefined}
                    title={s.label}
                    className={`inline-flex items-center gap-1.5 min-h-[40px] rounded-pill text-sm transition-colors focus:outline-none focus-visible:shadow-glow ${on ? "px-4 bg-brand-600 text-white font-semibold shadow-soft" : done ? "px-2.5 text-brand-700 dark:text-brand-200 font-medium hover:bg-brand-50 dark:hover:bg-brand-500/10" : "px-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-gray-100 dark:hover:bg-white/5"} disabled:opacity-40`}
                  >
                    <span className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center font-semibold ${on ? "bg-white/25" : done ? "bg-brand-100 dark:bg-brand-500/20" : "bg-black/5 dark:bg-white/10"}`}>{done ? <Check className="w-3 h-3" aria-label="done" /> : i + 1}</span>
                    {/* The current step says its full name; the others stay short. */}
                    <span className={on ? "hidden sm:inline" : "hidden"}>{s.label}</span>
                    <span className={on ? "sm:hidden" : ""}>{s.short}</span>
                    {s.id === "review" && reviewCount > 0 && <span className="px-1.5 rounded-pill bg-success-700 hover:brightness-110 text-white text-[10px]">{reviewCount}</span>}
                  </button>
                  {i < STEPS.length - 1 && <span className={`w-3 h-px ${done ? "bg-brand-300 dark:bg-brand-500/40" : "bg-gray-200 dark:bg-white/10"}`} aria-hidden />}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      {/* Body: week rail | step content | phone preview */}
      {/* The phone preview helps while planning; generating and reviewing get the full width. */}
      <div className={`flex-1 min-h-0 mt-3 grid gap-4 md:grid-cols-[280px_1fr] ${planning ? "xl:grid-cols-[280px_1fr_300px]" : ""}`}>
        <aside className="hidden md:flex flex-col el-card overflow-hidden min-h-0">
          <WeekRail
            weeks={data.weeks}
            selected={selected}
            nowSectionId={nowSection}
            focused={focused}
            filter={filter}
            readOnly={step === "generate" || step === "review"}
            onFilter={(f) => {
              setFilter(f);
              setSelected(new Set(selectWeeks(data.weeks, f)));
            }}
            onToggle={(sid) => {
              setFilter("custom");
              setSelected((s) => {
                const n = new Set(s);
                if (n.has(sid)) n.delete(sid);
                else n.add(sid);
                return n;
              });
            }}
            onFocus={setFocused}
            badge={(sid) => {
              const w = run?.weeks.find((x) => x.section_id === sid);
              return w && w.pending_review > 0 ? <span className="px-1.5 rounded-pill el-chip-brand text-[10px] font-semibold">{w.pending_review} to review</span> : null;
            }}
          />
        </aside>

        <main className="min-h-0 overflow-y-auto pb-28 md:pb-6 pr-1">
          <AnimatePresence mode="wait">
            <motion.div key={step} {...m("fade")}>
              {step === "weeks" && (
                <section aria-labelledby="weeks-h">
                  <h2 id="weeks-h" className="text-lg font-bold text-gray-900 dark:text-white">Which weeks should the AI draft?</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300">“With gaps” picks every week that isn't live yet or misses criteria. Weeks with no topic are skipped — add one in the scheme of work.</p>
                  {/* On phones the rail lives here. */}
                  <div className="md:hidden mt-3 el-card overflow-hidden max-h-[55vh] flex flex-col">
                    <WeekRail weeks={data.weeks} selected={selected} nowSectionId={nowSection} focused={focused} filter={filter} onFilter={(f) => { setFilter(f); setSelected(new Set(selectWeeks(data.weeks, f))); }} onToggle={(sid) => { setFilter("custom"); setSelected((s) => { const n = new Set(s); if (n.has(sid)) n.delete(sid); else n.add(sid); return n; }); }} onFocus={setFocused} />
                  </div>
                  <div className="mt-4 grid sm:grid-cols-3 gap-3">
                    {[
                      ["Chosen", selectedIds.length, "weeks"],
                      ["With a lesson plan", selectedWeeks.filter((w) => w.readiness.has_plan).length, "AI follows your plan"],
                      ["With your notes", selectedWeeks.filter((w) => w.readiness.has_note).length, "reused first"],
                    ].map(([label, n, hint]) => (
                      <div key={label as string} className="el-card p-3">
                        <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{n as number}</p>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{label}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-300">{hint}</p>
                      </div>
                    ))}
                  </div>
                  {estimate && estimate.skipped.length > 0 && (
                    <p className="mt-3 text-sm text-warning-700 dark:text-warning-500">{estimate.skipped.length} chosen week(s) have no topic or criteria and will be skipped.</p>
                  )}
                </section>
              )}

              {step === "sources" && (
                <section aria-labelledby="sources-h">
                  <h2 id="sources-h" className="text-lg font-bold text-gray-900 dark:text-white">What should the AI read?</h2>
                  <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">Everything stays grounded in your own material, and every part says which source it came from.</p>
                  <SourcesStep
                    weeks={data.weeks}
                    selectedWeeks={selectedWeeks}
                    sources={blueprint.sources}
                    onChange={(sources) => setBlueprint({ ...blueprint, sources })}
                    focusSectionId={focused}
                    reuseNotes={blueprint.reuse_existing_notes}
                    onReuseNotes={(v) => setBlueprint({ ...blueprint, reuse_existing_notes: v })}
                    courseId={cid}
                    assetIds={blueprint.extra_asset_ids}
                    onAssetIds={(ids) => setBlueprint({ ...blueprint, extra_asset_ids: ids })}
                  />
                </section>
              )}

              {step === "recipe" && (
                <section aria-labelledby="recipe-h">
                  <h2 id="recipe-h" className="text-lg font-bold text-gray-900 dark:text-white">Design each week</h2>
                  <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">Pick a preset or switch blocks on and off. The preview shows what students get, on a phone or a computer.</p>
                  <RecipeBuilder blueprint={blueprint} onChange={setBlueprint} presets={data.presets} saved={data.blueprints} features={data.features} onSavePreset={savePreset} />
                  <div className="xl:hidden mt-6"><StudentPreview blueprint={blueprint} features={data.features} title={focusWeek?.entry.topic || "This week's lesson"} week={focusWeek?.entry.week_number} course={data.subject.name} weekLabels={previewWeekLabels} /></div>
                </section>
              )}

              {step === "try" && (
                <section aria-labelledby="try-h" className="space-y-4">
                  <h2 id="try-h" className="text-lg font-bold text-gray-900 dark:text-white">Try the recipe on one week first</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    See real output for <strong>{(previewOnScreen ? data.weeks.find((w) => w.section && run!.run.section_ids.includes(w.section.section_id)) : tryWeek)?.entry.week_number || "this week"}</strong> before drafting the whole term. Adjust the recipe and try again until you like it.
                  </p>
                  {(!run || run.run.mode !== "PREVIEW") && (
                    <button disabled={busy || !data.ai_configured} onClick={() => startRun("PREVIEW")} className="inline-flex items-center gap-2 min-h-[48px] px-5 rounded-pill bg-brand-600 text-white text-sm font-semibold shadow-soft disabled:opacity-50">
                      <Zap className="w-4 h-4" /> Try on one week
                    </button>
                  )}
                  {run && run.run.mode === "PREVIEW" && (
                    <>
                      {isRunActive(run.run.status) ? (
                        <GenerationBoard run={run} connected={connected} busy={busy} onControl={control} onReviewWeek={() => goto("review")} />
                      ) : (
                        <ReviewWorkspace weeks={run.weeks} focus={null} onFocus={setFocused} busy={busy} onApproveWeek={approveWeek} onApproveClean={approveClean} onRegenerate={regenerate} onDismiss={dismiss} onChanged={reloadRun} />
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => goto("recipe")} className="min-h-[44px] px-4 rounded-pill el-chip text-sm font-medium">Adjust the recipe</button>
                        <button disabled={busy || runActive} onClick={() => startRun("PREVIEW")} className="min-h-[44px] px-4 rounded-pill el-chip text-sm font-medium disabled:opacity-50">Try again</button>
                        <button onClick={() => goto("generate")} className="min-h-[44px] px-4 rounded-pill bg-brand-600 text-white text-sm font-semibold">Looks good — draft all weeks</button>
                      </div>
                    </>
                  )}
                </section>
              )}

              {step === "generate" && (
                <section aria-labelledby="gen-h" className="space-y-4">
                  <h2 id="gen-h" className="text-lg font-bold text-gray-900 dark:text-white">Draft {run && run.run.mode === "FULL" ? "" : `${selectedIds.length} week${selectedIds.length === 1 ? "" : "s"}`}</h2>
                  {(!run || run.run.mode !== "FULL") && (
                    <div className="el-card p-4 space-y-3">
                      {est && (
                        <div>
                          <p className="text-base font-semibold text-gray-900 dark:text-white">{est.headline}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-300">{est.detail}</p>
                        </div>
                      )}
                      <ul className="text-sm text-slate-700 dark:text-slate-200 space-y-1.5" aria-label="How a background run works">
                        <li className="flex gap-2"><Server className="w-4 h-4 mt-0.5 flex-shrink-0 text-brand-600 dark:text-brand-200" aria-hidden />Runs on the school server — close this page or log out, it keeps going.</li>
                        <li className="flex gap-2"><Hourglass className="w-4 h-4 mt-0.5 flex-shrink-0 text-brand-600 dark:text-brand-200" aria-hidden />When the free AI quota runs out it waits, then carries on by itself.</li>
                        <li className="flex gap-2"><RotateCcw className="w-4 h-4 mt-0.5 flex-shrink-0 text-brand-600 dark:text-brand-200" aria-hidden />A part that fails is re-run automatically over the next hours.</li>
                        <li className="flex gap-2"><Bell className="w-4 h-4 mt-0.5 flex-shrink-0 text-brand-600 dark:text-brand-200" aria-hidden />You get a notification when it's done; the course page shows the progress.</li>
                      </ul>
                      <div className="flex flex-wrap gap-2">
                        <button disabled={busy || !data.ai_configured || selectedIds.length === 0} onClick={() => startRun("FULL", "now")} className="inline-flex items-center gap-2 min-h-[48px] px-5 rounded-pill bg-brand-600 text-white text-sm font-semibold shadow-soft disabled:opacity-50">
                          <Sparkles className="w-4 h-4" /> Run in background
                        </button>
                        <button disabled={busy || !data.ai_configured || selectedIds.length === 0} onClick={() => startRun("FULL", "tonight")} className="inline-flex items-center gap-2 min-h-[48px] px-5 rounded-pill el-chip text-sm font-semibold disabled:opacity-50" title="Starts at 19:00, when nobody needs the free AI quota">
                          <Moon className="w-4 h-4" /> Run tonight
                        </button>
                      </div>
                    </div>
                  )}
                  {run && run.run.mode !== "PREVIEW" && (
                    <GenerationBoard run={run} connected={connected} busy={busy} onControl={control} onReviewWeek={(sid) => { setFocused(sid); goto("review"); }} onLeave={() => navigate(builderRoutes.build(cid))} />
                  )}
                </section>
              )}

              {step === "review" && (
                <section aria-labelledby="rev-h" className="space-y-4">
                  <h2 id="rev-h" className="text-lg font-bold text-gray-900 dark:text-white">Review & approve</h2>
                  {run ? (
                    <ReviewWorkspace weeks={run.weeks} focus={focused} onFocus={setFocused} busy={busy} onApproveWeek={approveWeek} onApproveClean={approveClean} onRegenerate={regenerate} onDismiss={dismiss} onChanged={reloadRun} />
                  ) : (
                    <p className="text-sm text-slate-600 dark:text-slate-300">Start a run to review drafts.</p>
                  )}
                  <button onClick={() => navigate(builderRoutes.build(cid))} className="min-h-[44px] px-4 rounded-pill el-chip text-sm font-medium">Open the course builder</button>
                </section>
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        <aside className={planning ? "hidden xl:block min-h-0 overflow-y-auto" : "hidden"}>
          <StudentPreview blueprint={blueprint} features={data.features} title={phoneWeek?.entry.topic || "This week's lesson"} week={phoneWeek?.entry.week_number} course={data.subject.name} weekLabels={previewWeekLabels} />
          {estimate && estimate.weeks_planned.some((w) => w.notes.includes("COVERED_BY_EXISTING")) && (
            <p className="mt-3 text-xs text-slate-600 dark:text-slate-300 text-center">
              {estimate.weeks_planned.filter((w) => w.notes.includes("COVERED_BY_EXISTING")).length} week(s) are already covered by your notes — no new lesson needed.
            </p>
          )}
        </aside>
      </div>

      {/* Sticky footer navigation for the planning steps */}
      {(step === "weeks" || step === "sources" || step === "recipe") && (
        <div className="fixed md:static bottom-0 inset-x-0 z-20 flex-shrink-0 flex items-center justify-between gap-2 px-4 md:px-0 py-3 bg-white/90 dark:bg-black/80 backdrop-blur border-t border-gray-100 dark:border-white/[0.06] md:bg-transparent md:dark:bg-transparent md:border-0">
          <button disabled={stepIndex === 0} onClick={() => goto(STEPS[stepIndex - 1].id)} className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-pill el-chip text-sm font-medium disabled:opacity-40">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button disabled={!canNext} onClick={() => goto(STEPS[stepIndex + 1].id)} className="inline-flex items-center gap-1.5 min-h-[44px] px-5 rounded-pill bg-brand-600 text-white text-sm font-semibold disabled:opacity-50">
            {step === "recipe" ? "Try it" : "Next"} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default LessonStudioPage;
