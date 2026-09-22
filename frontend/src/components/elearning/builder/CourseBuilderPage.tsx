import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion, Reorder, useDragControls } from "framer-motion";
import { ArrowLeft, BarChart3, BookOpenCheck, ChevronLeft, Download, Eye, EyeOff, FolderPlus, GripVertical, HelpCircle, Link as LinkIcon, MoreHorizontal, PlayCircle, Plus, RefreshCw, Settings2, Smartphone, Wand2, X } from "lucide-react";
import {
  BuilderCourse,
  CourseItem,
  CourseItemType,
  CourseSection,
  CurriculumOutcomePick,
  elearningApi,
  LearnerCourse,
  SectionStatus,
} from "../../../api/elearning";
import { useToast } from "../../../contexts/ToastContext";
import { useMotion } from "../../../design/motion";
import { copy } from "../copy";
import AddItemPalette from "./AddItemPalette";
import ItemSettingsDrawer from "./ItemSettingsDrawer";
import InsightsTab from "./InsightsTab";
import CoveragePanel from "./CoveragePanel";
import NextStepBar, { NextStep } from "./NextStepBar";
import { useCourseLive } from "./useCourseLive";
import { SUBJECT_ICONS, resolveSubjectIcon } from "../ui/subjectIcons";
import WeekList from "./WeekList";
import WeekPeek from "./WeekPeek";
import { usePrompt } from "../ui/PromptDialog";
import { API_BASE_URL } from "../../../services/api";
import { getToken } from "../../../utils/auth";
import Mascot from "../ui/Mascot";
import { CompletionDot, ItemTypeIcon, Skeleton, WeekPill } from "../ui/primitives";

type Tab = "content" | "curriculum" | "insights" | "settings";

/** One draggable row in the week's item list. */
const ItemRow: React.FC<{
  item: CourseItem;
  onOpen: () => void;
  onRename: (title: string) => void;
  onTogglePublished: () => void;
}> = ({ item, onOpen, onRename, onTogglePublished }) => {
  const controls = useDragControls();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);
  useEffect(() => setDraft(item.title), [item.title]);
  const draftNote = item.item_type === "LESSON_NOTE" && item.ref?.status === "DRAFT";
  const missing = item.ref?.missing;

  return (
    <Reorder.Item value={item} dragListener={false} dragControls={controls} className="list-none">
      <div
        className={`group flex items-center gap-2 p-2 pl-1 el-card min-h-[56px] ${!item.is_published ? "opacity-60" : ""}`}
        style={{ marginLeft: item.indent * 16 }}
      >
        <button onPointerDown={(e) => controls.start(e)} className="w-8 h-10 flex items-center justify-center text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none" aria-label="Drag to reorder">
          <GripVertical className="w-4 h-4" />
        </button>
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${item.item_type === "HEADER" ? "bg-transparent text-gray-400" : "el-subtle text-gray-600 dark:text-gray-300"}`}>
          <ItemTypeIcon type={item.item_type} className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                setEditing(false);
                if (draft.trim() && draft !== item.title) onRename(draft.trim());
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  setDraft(item.title);
                  setEditing(false);
                }
              }}
              className="w-full bg-transparent text-sm font-medium text-gray-900 dark:text-white outline-none border-b border-brand-500"
              aria-label="Item title"
            />
          ) : (
            <button onClick={() => setEditing(true)} className={`block w-full text-left text-sm truncate ${item.item_type === "HEADER" ? "font-semibold uppercase tracking-wider text-[11px] text-gray-500" : "font-medium text-gray-800 dark:text-gray-100"}`} title="Click to rename">
              {item.title}
            </button>
          )}
          <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
            {copy.builder.itemTypes[item.item_type]}
            {item.item_type !== "HEADER" && ` · ${copy.builder.completionRules[item.completion_rule]}${item.completion_rule === "MIN_SCORE" ? ` ${item.min_score_pct}%` : ""}`}
            {item.estimated_minutes ? ` · ${item.estimated_minutes} min` : ""}
            {item.due_at ? ` · due ${new Date(item.due_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
            {!item.is_required && item.item_type !== "HEADER" ? " · optional" : ""}
            {item.criteria.length ? ` · ${item.criteria.map((c) => c.criteria_number).join(", ")}` : ""}
          </p>
        </div>
        {missing && <span className="text-[10px] px-1.5 py-0.5 rounded-pill el-chip-danger">content deleted</span>}
        {draftNote && <span className="text-[10px] px-1.5 py-0.5 rounded-pill el-chip-warning">note is draft</span>}
        <button onClick={onTogglePublished} className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06]" aria-label={item.is_published ? "Hide from students" : "Show to students"} title={item.is_published ? "Visible to students" : "Hidden from students"}>
          {item.is_published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        <button onClick={onOpen} className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06]" aria-label="Item settings">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
    </Reorder.Item>
  );
};

/** `/elearning/courses/:courseId/build` — the one teacher screen (UX plan §3.2). */
const CourseBuilderPage: React.FC = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const m = useMotion();
  const cid = Number(courseId);

  const [data, setData] = useState<BuilderCourse | null>(null);
  const [curriculum, setCurriculum] = useState<CurriculumOutcomePick[]>([]);
  const [selected, setSelected] = useState<number | null>(search.get("section") ? Number(search.get("section")) : null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsItem, setSettingsItem] = useState<CourseItem | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [prereqs, setPrereqs] = useState<Record<string, number[]>>({});
  const [coverageKey, setCoverageKey] = useState(0);
  const [building, setBuilding] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [peek, setPeek] = useState<{ section: CourseSection; rect: DOMRect } | null>(null);
  const [ask, promptUI] = usePrompt();
  // A published course is worth watching even while editing: the pill lights up the moment
  // a student opens something, and takes the teacher to the live list.
  const { watchers } = useCourseLive(cid, !!data && data.course.status === "PUBLISHED");
  const tab = (search.get("tab") as Tab) || "content";
  const setTab = (t: Tab) => setSearch((p) => { const n = new URLSearchParams(p); if (t === "content") n.delete("tab"); else n.set("tab", t); return n; });

  const load = useCallback(async () => {
    const r = await elearningApi.builder(cid);
    setData(r.data.data);
    return r.data.data;
  }, [cid]);

  useEffect(() => {
    load()
      .then((d) => {
        if (selected === null) {
          const current = d.sections.find((s) => s.start_date && s.end_date && s.start_date <= new Date().toISOString().slice(0, 10) && s.end_date >= new Date().toISOString().slice(0, 10));
          setSelected(current?.section_id ?? d.sections[0]?.section_id ?? null);
        }
      })
      .catch(() => showToast("This course isn't available", "error"));
    elearningApi.pickCriteria(cid).then((r) => setCurriculum(r.data.data)).catch(() => undefined);
    elearningApi.prerequisites(cid).then((r) => setPrereqs(r.data.data)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  const section = useMemo(() => data?.sections.find((s) => s.section_id === selected) || null, [data, selected]);
  // Which of the week's target criteria have an item behind them (client-side mirror of the coverage service).
  const weekCoverage = useMemo(() => {
    if (!section) return null;
    const covered = new Set(section.items.flatMap((i) => i.criteria.map((c) => c.criteria_id)));
    return {
      targets: section.criteria,
      gaps: section.criteria.filter((c) => !covered.has(c.criteria_id)),
      hasCheck: section.items.some((i) => ["KNOWLEDGE_CHECK", "TASKMENTOR_QUIZ"].includes(i.item_type)),
    };
  }, [section]);
  const courseCoveragePct = useMemo(() => {
    if (!data) return 0;
    const visible = data.sections.filter((s) => s.status !== "HIDDEN");
    const targets = visible.reduce((n, s) => n + s.criteria.length, 0);
    const covered = visible.reduce((n, s) => {
      const have = new Set(s.items.flatMap((i) => i.criteria.map((c) => c.criteria_id)));
      return n + s.criteria.filter((c) => have.has(c.criteria_id)).length;
    }, 0);
    return targets ? Math.round((covered / targets) * 100) : 0;
  }, [data]);

  const buildJourney = async () => {
    if (!section) return;
    setBuilding(true);
    try {
      const r = await elearningApi.buildJourney(section.section_id);
      const d = r.data.data;
      await load();
      setCoverageKey((k) => k + 1);
      if (d.added.length) showToast(`Added ${d.added.map((a) => `"${a.title}"`).join(", ")}`, "success");
      else if (d.still_missing.length) showToast(`No note of yours covers ${d.still_missing.map((c) => c.criteria_number).join(", ")} yet — write one (with those criteria) and try again.`, "info");
      else showToast("This week already covers every planned criterion.", "info");
    } catch (e: any) {
      showToast(e?.response?.data?.message || copy.errors.generic, "error");
    } finally {
      setBuilding(false);
    }
  };

  /** One tap: a quick check aligned to the week's targets, then the drawer (with "Write 5 with AI"). */
  const addAlignedCheck = async () => {
    if (!section) return;
    try {
      const r = await elearningApi.createItem(section.section_id, {
        item_type: "KNOWLEDGE_CHECK",
        title: `${section.week_number || "Week"} quick check`,
        completion_rule: "MIN_SCORE",
        min_score_pct: 60,
        criteria_ids: section.criteria.map((c) => c.criteria_id),
        content_json: { questions: [{ type: "MCQ", prompt: "Replace me — or tap 'Write 5 with AI'", options: ["Option A", "Option B"], correct_index: 0 }] },
      });
      setData(r.data.data);
      const created = r.data.data.sections.flatMap((x) => x.items).find((i) => i.item_id === r.data.data.item_id) || null;
      if (created) setSettingsItem(created);
    } catch (e: any) {
      showToast(e?.response?.data?.message || copy.errors.save, "error");
    }
  };

  /** Optimistic apply + server reconcile; rollback + toast on failure. */
  const mutate = useCallback(
    async (optimistic: (d: BuilderCourse) => BuilderCourse, call: () => Promise<{ data: { data: BuilderCourse } }>, ok?: string) => {
      const before = data;
      if (before) setData(optimistic(before));
      setBusy(true);
      try {
        const r = await call();
        setData(r.data.data);
        if (ok) showToast(ok, "success");
        return r.data.data;
      } catch (e: any) {
        setData(before);
        showToast(e?.response?.data?.message || copy.errors.save, "error");
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [data, showToast],
  );

  const patchSectionLocal = (sid: number, patch: Partial<CourseSection>) => (d: BuilderCourse) => ({
    ...d,
    sections: d.sections.map((s) => (s.section_id === sid ? { ...s, ...patch } : s)),
  });
  const patchItemLocal = (iid: number, patch: Partial<CourseItem>) => (d: BuilderCourse) => ({
    ...d,
    sections: d.sections.map((s) => ({ ...s, items: s.items.map((i) => (i.item_id === iid ? { ...i, ...patch } : i)) })),
  });

  const setSectionStatus = (s: CourseSection, status: SectionStatus) =>
    mutate(patchSectionLocal(s.section_id, { status }), () => elearningApi.updateSection(s.section_id, { status }));

  const togglePublishCourse = () => {
    if (!data) return;
    const status = data.course.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    mutate(
      (d) => ({ ...d, course: { ...d.course, status } }),
      () => elearningApi.updateCourse(cid, { status }),
      status === "PUBLISHED" ? "Course published — students can open it now" : "Course is back in draft",
    );
  };

  const addItem = async (choice: { item_type: CourseItemType; ref_id?: number; title?: string }) => {
    if (!section) return;
    setPaletteOpen(false);
    const body: Record<string, unknown> = { item_type: choice.item_type, ref_id: choice.ref_id, title: choice.title };
    if (choice.item_type === "HEADER") body.title = "New heading";
    if (choice.item_type === "PAGE") body.title = "New page";
    if (choice.item_type === "KNOWLEDGE_CHECK") {
      body.title = "Quick check";
      body.content_json = { questions: [{ type: "MCQ", prompt: "Which is true?", options: ["Option A", "Option B"], correct_index: 0 }] };
      body.completion_rule = "SUBMIT";
      // New checks start aligned to what the scheme planned for this week.
      body.criteria_ids = section.criteria.map((c) => c.criteria_id);
    }
    if (choice.item_type === "LINK" || choice.item_type === "VIDEO") {
      const isVideo = choice.item_type === "VIDEO";
      const url = await ask({
        title: isVideo ? "Add a video" : "Add a link",
        detail: isVideo ? "Paste a YouTube or Vimeo link — students watch it inside the course." : "Students open it in a new tab.",
        placeholder: isVideo ? "https://youtu.be/…" : "https://…",
        confirmLabel: isVideo ? "Add video" : "Add link",
        icon: isVideo ? PlayCircle : LinkIcon,
        inputMode: "url",
        validate: (v) => {
          if (!/^https?:\/\//i.test(v)) return "Start the address with http:// or https://";
          if (isVideo && !/(youtube\.com|youtu\.be|vimeo\.com)/i.test(v)) return "Only YouTube and Vimeo links can be embedded.";
          return null;
        },
      });
      if (!url) return;
      body.url = url;
      body.title = choice.item_type === "VIDEO" ? "Video" : url.replace(/^https?:\/\//, "").slice(0, 60);
    }
    try {
      const r = await elearningApi.createItem(section.section_id, body);
      setData(r.data.data);
      const created = r.data.data.sections.flatMap((s) => s.items).find((i) => i.item_id === r.data.data.item_id) || null;
      if (created && ["PAGE", "KNOWLEDGE_CHECK", "HEADER"].includes(choice.item_type)) setSettingsItem(created);
    } catch (e: any) {
      showToast(e?.response?.data?.message || copy.errors.save, "error");
    }
  };

  const reorder = (items: CourseItem[]) => {
    if (!section) return;
    setData((d) => (d ? patchSectionLocal(section.section_id, { items })(d) : d));
  };
  const commitOrder = () => {
    if (!section || !data) return;
    const current = data.sections.find((s) => s.section_id === section.section_id)!;
    elearningApi.reorderItems(section.section_id, current.items.map((i) => i.item_id)).then((r) => setData(r.data.data)).catch(() => showToast(copy.errors.save, "error"));
  };

  const previewCourse = useMemo<LearnerCourse | null>(() => {
    if (!data) return null;
    const today = new Date().toISOString().slice(0, 10);
    const sections = data.sections
      .filter((s) => s.status === "PUBLISHED")
      .map((s) => ({
        ...s,
        items: s.items.filter((i) => i.is_published && !(i.item_type === "LESSON_NOTE" && i.ref?.status !== "PUBLISHED")).map((i) => ({ ...i, state: "NOT_STARTED" as const, completed_at: null, best_score_pct: null, seconds_spent: 0, last_position: null, locked: false })),
        state: "unlocked" as const,
        required_total: s.items.filter((i) => i.is_required && i.completion_rule !== "NONE").length,
        required_done: 0,
        is_current_week: !!s.start_date && !!s.end_date && s.start_date <= today && s.end_date >= today,
        lock_reason: null,
        criteria_progress: s.criteria.map((c) => ({ ...c, state: "NOT_STARTED" as const, unplanned: !s.items.some((i) => i.criteria.some((x) => x.criteria_id === c.criteria_id)) })),
      }));
    return {
      ...data,
      sections,
      summary: { percent: 0, required_total: 0, required_done: 0, overdue_count: 0, due_soon: [], current_section: null, next_item: null, resume_item: null, sections_completed: 0, sections_total: sections.length, near_goal: [], criteria_total: 0, criteria_covered: 0 },
    };
  }, [data]);

  if (!data) {
    return (
      <div className="flex flex-col h-[calc(100dvh-4rem)] overflow-hidden pt-5 gap-3">
        <Skeleton className="h-16 flex-shrink-0" />
        <Skeleton className="h-16 flex-shrink-0" />
        <div className="flex-1 min-h-0 flex gap-5">
          <Skeleton className="hidden md:block w-[300px] lg:w-[320px] h-full" />
          <Skeleton className="flex-1 h-full" />
        </div>
      </div>
    );
  }

  const isLive = data.course.status === "PUBLISHED";
  const todayIso = new Date().toISOString().slice(0, 10);
  const liveWeeks = data.sections.filter((s) => s.status === "PUBLISHED").length;
  const totalItems = data.sections.reduce((n, s) => n + s.items.length, 0);

  /**
   * The single next thing to do. Order matters: fill the week you are teaching, give it a
   * check, put it in front of students, then publish the course. One sentence, one button —
   * the teacher never has to read the whole screen to know what to do.
   */
  const nextStep: NextStep = (() => {
    const current = data.sections.find((s) => s.start_date && s.end_date && s.start_date <= todayIso && s.end_date >= todayIso && s.status !== "HIDDEN");
    const focus = section || current || data.sections.find((s) => s.status !== "HIDDEN") || null;
    const weekName = focus?.week_number || "this week";
    if (totalItems === 0) {
      return {
        id: "first-item",
        title: `Put something in ${weekName}`,
        detail: weekCoverage?.gaps.length
          ? "Your notes that match this week's criteria can be added for you."
          : "Add a lesson note, a material or a link — students see them in this order.",
        action: weekCoverage?.gaps.length
          ? { label: "Build it for me", icon: Wand2, onClick: buildJourney, busy: building }
          : { label: "Add content", icon: Plus, onClick: () => setPaletteOpen(true) },
        secondary: weekCoverage?.gaps.length ? { label: "Add it myself", onClick: () => setPaletteOpen(true) } : undefined,
      };
    }
    if (focus && weekCoverage && weekCoverage.gaps.length > 0) {
      return {
        id: `gaps-${focus.section_id}`,
        title: `${weekName} is missing ${weekCoverage.gaps.length} of its ${weekCoverage.targets.length} criteria`,
        detail: `Nothing covers ${weekCoverage.gaps.map((c) => c.criteria_number).join(", ")} yet.`,
        action: { label: "Build it for me", icon: Wand2, onClick: buildJourney, busy: building },
        secondary: { label: "Add it myself", onClick: () => setPaletteOpen(true) },
      };
    }
    if (focus && weekCoverage && !weekCoverage.hasCheck && focus.items.length > 0) {
      return {
        id: `check-${focus.section_id}`,
        title: `Add a quick check to ${weekName}`,
        detail: "A few questions with instant feedback — the AI can write them from your notes.",
        action: { label: "Add a check", icon: HelpCircle, onClick: addAlignedCheck },
      };
    }
    if (focus && focus.status !== "PUBLISHED" && focus.items.length > 0) {
      return {
        id: `publish-week-${focus.section_id}`,
        title: `Make ${weekName} visible to students`,
        detail: "It has content. Students can't open it until you make it live.",
        action: { label: "Make it live", icon: Eye, onClick: () => setSectionStatus(focus, "PUBLISHED") },
      };
    }
    if (!isLive) {
      return {
        id: "publish-course",
        title: "Publish the course",
        detail: `${liveWeeks} week${liveWeeks === 1 ? "" : "s"} ready. Students will see it under My Learning.`,
        action: { label: copy.builder.publishCourse, onClick: togglePublishCourse, busy },
      };
    }
    return {
      id: "all-good",
      title: "Everything is ready",
      detail: `${liveWeeks} of ${data.sections.length} weeks are live for students.`,
      tone: "done",
      secondary: { label: "See who's learning", onClick: () => setTab("insights") },
    };
  })();

  const showDetail = !!section && (!railOpen || !!selected);

  return (
    /* App-shell layout: the page is exactly the viewport minus the navbar, so the header and
       the next step stay put and only the week list / week detail scroll. On a small laptop
       the teacher never loses the instruction or the Publish menu while scrolling weeks. */
    <div className="flex flex-col h-[calc(100dvh-4rem)] overflow-hidden pt-5">
      {/* Header — title, state, one primary action. Stats moved into the week list. */}
      <div className="flex-shrink-0">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 min-h-[40px] text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <div className="mt-2 flex flex-col md:flex-row md:items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white leading-tight truncate">{data.subject.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-2">
            <span>{data.class_group.name} · {data.term.name}</span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-pill text-[11px] font-semibold ${isLive ? "el-chip-success" : "el-chip"}`}>
              {isLive ? copy.builder.published : copy.builder.draft}
            </span>
            <span className="text-gray-400">· {liveWeeks}/{data.sections.length} weeks live · {courseCoveragePct}% of the curriculum</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {watchers.length > 0 && (
            <button
              onClick={() => setTab("insights")}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-pill el-chip-success text-sm font-semibold"
              title={`${watchers.map((w) => w.name).join(", ")} — learning now`}
            >
              <span className="w-2 h-2 rounded-full bg-success-500 animate-pulse" aria-hidden />
              {watchers.length} learning now
            </button>
          )}
          <button onClick={() => setPreview(true)} className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-pill el-chip text-sm font-medium" title={copy.builder.previewAsStudent}>
            <Smartphone className="w-4 h-4" /> <span className="hidden lg:inline">Preview</span>
          </button>
          <div className="relative">
            <button onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-pill el-chip text-sm font-medium">
              <MoreHorizontal className="w-4 h-4" /> <span className="hidden lg:inline">More</span>
            </button>
            <AnimatePresence>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
                  <motion.div {...m("reveal")} className="absolute right-0 top-full mt-2 z-40 w-60 rounded-2xl el-float p-1.5" role="menu">
                    {([
                      ["Curriculum coverage", BookOpenCheck, () => setTab("curriculum")],
                      ["Who's learning", BarChart3, () => setTab("insights")],
                      ["Course settings", Settings2, () => setTab("settings")],
                      ["Pull in new notes", RefreshCw, () => elearningApi.reseed(cid).then((r) => { setData(r.data.data); showToast(r.data.data.created ? `Added ${r.data.data.created} item(s)` : "Nothing new to add", "info"); })],
                      [isLive ? copy.builder.unpublishCourse : copy.builder.publishCourse, Eye, togglePublishCourse],
                    ] as [string, React.ElementType, () => void][]).map(([label, Icon, fn]) => (
                      <button key={label} role="menuitem" onClick={() => { setMoreOpen(false); fn(); }} className="w-full flex items-center gap-2.5 px-3 min-h-[44px] rounded-xl text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 text-left">
                        <Icon className="w-4 h-4 text-gray-400" /> {label}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* One instruction at a time */}
      {tab === "content" && <div className="mt-3"><AnimatePresence mode="wait"><NextStepBar key={nextStep.id} step={nextStep} /></AnimatePresence></div>}
      </div>

      {/* Secondary views open full-width with a way back to the weeks */}
      {tab !== "content" && (
        <div className="flex-1 min-h-0 overflow-y-auto mt-4 pb-6">
          <button onClick={() => setTab("content")} className="inline-flex items-center gap-1 min-h-[40px] text-sm text-brand-600 dark:text-brand-200">
            <ChevronLeft className="w-4 h-4" /> Back to weeks
          </button>
          <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
            {tab === "curriculum" ? "Curriculum coverage" : tab === "insights" ? "Who's learning" : "Course settings"}
          </h2>
          <div className="mt-3">
            {tab === "curriculum" && <CoveragePanel courseId={cid} refreshKey={coverageKey} onJumpToWeek={(sid) => { setSelected(sid); setTab("content"); }} />}
            {tab === "insights" && (
              <>
                <div className="flex justify-end">
                  <a href={`${API_BASE_URL}${elearningApi.progressReportUrl(cid)}?token=${getToken() || ""}`} className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-pill text-xs text-gray-600 dark:text-gray-300 el-chip">
                    <Download className="w-3.5 h-3.5" /> Progress report (CSV)
                  </a>
                </div>
                <InsightsTab courseId={cid} course={data} />
              </>
            )}
            {tab === "settings" && <SettingsTab data={data} onChange={(patch) => mutate((d) => ({ ...d, course: { ...d.course, ...patch } }), () => elearningApi.updateCourse(cid, patch), "Saved")} />}
          </div>
        </div>
      )}

      {tab === "content" && (
        <div className="flex-1 min-h-0 mt-4 md:flex md:gap-5">
          {/* Weeks — the whole screen on a phone, a quiet column on desktop */}
          <aside className={`${showDetail ? "hidden" : "flex"} md:flex flex-col h-full md:w-[300px] lg:w-[320px] flex-shrink-0 el-card overflow-hidden`}>
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-white/[0.06]">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">{data.sections.length} weeks</p>
              <button
                onClick={async () => {
                  const title = await ask({
                    title: "Add a section",
                    detail: "A section sits alongside the scheme's weeks — for revision, or things to do before you start.",
                    placeholder: "Before you start",
                    confirmLabel: "Add section",
                    icon: FolderPlus,
                  });
                  if (title) elearningApi.createSection(cid, { title }).then((r) => { setData(r.data.data); setSelected(r.data.data.section_id); });
                }}
                className="inline-flex items-center gap-1 text-[11px] text-brand-600 dark:text-brand-200 min-h-[32px] px-1"
              >
                <Plus className="w-3.5 h-3.5" /> Section
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <WeekList
                sections={data.sections}
                selected={selected}
                onSelect={(id) => { setSelected(id); setRailOpen(false); }}
                todayIso={todayIso}
                onPeek={(s, rect) => setPeek(s && rect ? { section: s, rect } : null)}
              />
            </div>
          </aside>

          {/* The week */}
          <main className={`${showDetail ? "flex" : "hidden"} md:flex flex-col h-full flex-1 min-w-0 mt-4 md:mt-0 overflow-y-auto overscroll-contain pr-0.5`}>
            {!section ? (
              <p className="text-sm text-gray-500">Choose a week.</p>
            ) : (
              <>
                <button onClick={() => setRailOpen(true)} className="md:hidden inline-flex items-center gap-1 mb-3 min-h-[40px] text-sm text-brand-600 dark:text-brand-200">
                  <ChevronLeft className="w-4 h-4" /> All weeks
                </button>

                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
                      {section.week_number}
                      {section.element_number ? ` · Element ${section.element_number}` : ""}
                    </p>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                      {section.title.split(" — ").slice(1).join(" — ") || "No topic in the scheme yet"}
                    </h2>
                  </div>
                  {/* Visible / not visible: a switch, not three states. Skipping lives in More. */}
                  <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{section.status === "PUBLISHED" ? "Visible to students" : "Hidden"}</span>
                    <button
                      role="switch"
                      aria-checked={section.status === "PUBLISHED"}
                      aria-label="Visible to students"
                      onClick={() => setSectionStatus(section, section.status === "PUBLISHED" ? "SCHEDULED" : "PUBLISHED")}
                      className={`relative w-12 h-7 rounded-pill transition-colors ${section.status === "PUBLISHED" ? "bg-success-500" : "bg-gray-300 dark:bg-gray-700"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${section.status === "PUBLISHED" ? "translate-x-5" : ""}`} />
                    </button>
                  </label>
                </div>

                {/* Criteria: chips only, no panel. The instruction above says what to do about gaps. */}
                {section.criteria.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="What this week teaches">
                    {section.criteria.map((c) => {
                      const gap = !section.items.some((i) => i.criteria.some((x) => x.criteria_id === c.criteria_id));
                      return (
                        <li
                          key={c.criteria_id}
                          title={`${c.criteria_number} ${c.description}${gap ? " — nothing covers this yet" : ""}`}
                          className={`text-[11px] px-2 py-1 rounded-pill font-medium ${gap ? "el-chip-warning border border-dashed border-warning-500/60" : "el-chip-success"}`}
                        >
                          {c.criteria_number}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {section.items.length === 0 ? (
                  <div className="mt-5 flex flex-col items-center text-center p-8 rounded-2xl border border-dashed border-gray-300 dark:border-white/[0.12]">
                    <Mascot pose="nudge" size={56} />
                    <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 max-w-xs">Nothing here yet — use the button above, or add something yourself.</p>
                    <motion.button {...m("tap")} onClick={() => setPaletteOpen(true)} className="mt-4 inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-pill el-chip text-sm font-semibold">
                      <Plus className="w-4 h-4" /> Add content
                    </motion.button>
                  </div>
                ) : (
                  <Reorder.Group axis="y" values={section.items} onReorder={reorder} className="mt-5 space-y-2" onPointerUp={commitOrder}>
                    {section.items.map((i) => (
                      <ItemRow
                        key={i.item_id}
                        item={i}
                        onOpen={() => setSettingsItem(i)}
                        onRename={(title) => mutate(patchItemLocal(i.item_id, { title }), () => elearningApi.updateItem(i.item_id, { title }))}
                        onTogglePublished={() => mutate(patchItemLocal(i.item_id, { is_published: i.is_published ? 0 : 1 }), () => elearningApi.updateItem(i.item_id, { is_published: !i.is_published }))}
                      />
                    ))}
                  </Reorder.Group>
                )}

                {/* Everything advanced, folded away until asked for */}
                <details className="mt-5 group">
                  <summary className="inline-flex items-center gap-1 cursor-pointer text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 min-h-[36px] list-none">
                    <MoreHorizontal className="w-4 h-4" /> More options for this week
                  </summary>
                  <div className="mt-2 el-card p-3 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex-1 min-w-[140px]">Not teaching this week?</span>
                      <button onClick={() => setSectionStatus(section, section.status === "HIDDEN" ? "SCHEDULED" : "HIDDEN")} className="min-h-[36px] px-3 rounded-pill el-chip text-xs font-semibold">
                        {section.status === "HIDDEN" ? "Un-skip this week" : "Skip this week"}
                      </button>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Students must finish first: {(prereqs[String(section.section_id)] || []).length ? `${(prereqs[String(section.section_id)] || []).length} week(s)` : "nothing"}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {data.sections.filter((s) => s.section_id !== section.section_id && s.position < section.position).map((s) => {
                          const on = (prereqs[String(section.section_id)] || []).includes(s.section_id);
                          return (
                            <button
                              key={s.section_id}
                              aria-pressed={on}
                              onClick={() => {
                                const next = on ? (prereqs[String(section.section_id)] || []).filter((x) => x !== s.section_id) : [...(prereqs[String(section.section_id)] || []), s.section_id];
                                setPrereqs((p) => ({ ...p, [String(section.section_id)]: next }));
                                elearningApi.setPrerequisites(section.section_id, next).catch(() => showToast(copy.errors.save, "error"));
                              }}
                              className={`min-h-[32px] px-2.5 rounded-pill text-xs ${on ? "bg-brand-500 text-white" : "el-chip"}`}
                            >
                              {s.week_number || s.title.split(" — ")[0]}
                            </button>
                          );
                        })}
                        {data.sections.filter((s) => s.position < section.position).length === 0 && <span className="text-xs text-gray-400">This is the first week.</span>}
                      </div>
                    </div>
                  </div>
                </details>

                {/* Stays reachable however long the week gets */}
                <div className="sticky bottom-0 mt-auto pt-4 pb-1 -mx-0.5 px-0.5 bg-gradient-to-t from-white via-white dark:from-black dark:via-black to-transparent">
                  <motion.button
                    {...m("tap")}
                    onClick={() => setPaletteOpen(true)}
                    className="inline-flex items-center gap-2 min-h-[48px] px-5 rounded-pill bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-soft focus:outline-none focus-visible:shadow-glow"
                  >
                    <Plus className="w-4 h-4" /> {copy.builder.addItem}
                  </motion.button>
                </div>
              </>
            )}
          </main>
        </div>
      )}

      <WeekPeek section={peek?.section ?? null} anchor={peek?.rect ?? null} />
      {promptUI}

      {section && <AddItemPalette courseId={cid} sectionTitle={section.week_number || section.title} open={paletteOpen} onClose={() => setPaletteOpen(false)} onPick={addItem} />}

      {settingsItem && (
        <ItemSettingsDrawer
          item={data.sections.flatMap((s) => s.items).find((i) => i.item_id === settingsItem.item_id) || settingsItem}
          courseId={cid}
          curriculum={curriculum}
          onClose={() => setSettingsItem(null)}
          onSave={async (id, patch) => { await mutate((d) => d, () => elearningApi.updateItem(id, patch), "Saved"); }}
          onDelete={async (id) => { await mutate((d) => ({ ...d, sections: d.sections.map((s) => ({ ...s, items: s.items.filter((i) => i.item_id !== id) })) }), () => elearningApi.deleteItem(id), "Removed"); }}
          onNotePublished={() => load()}
        />
      )}

      {/* Preview as student — phone-width frame of the learner index */}
      <AnimatePresence>
        {preview && previewCourse && (
          <motion.div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPreview(false)}>
            <motion.div {...m("reveal")} onClick={(e) => e.stopPropagation()} className="w-[390px] max-w-full h-[80vh] rounded-[2rem] el-float overflow-hidden flex flex-col border-8 border-gray-900/90">
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-white/[0.06] text-xs text-gray-500">
                <span>Student view · structure only</span>
                <button onClick={() => setPreview(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06]" aria-label="Close preview"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {previewCourse.sections.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-500">{copy.course.emptyCourse}</div>
                ) : (
                  <ul className="p-3 space-y-2">
                    {previewCourse.sections.map((s) => (
                      <li key={s.section_id} className="rounded-2xl border border-gray-200 dark:border-white/[0.07] p-3">
                        <WeekPill weekNumber={s.week_number || s.title.split(" — ")[0]} startDate={s.start_date} endDate={s.end_date} current={s.is_current_week} />
                        <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{s.title.split(" — ").slice(1).join(" — ") || s.title}</p>
                        <ul className="mt-2 space-y-1">
                          {s.items.length === 0 && <li className="text-xs text-gray-400">{copy.course.emptyStudent}</li>}
                          {s.items.map((i) => (
                            <li key={i.item_id} className="flex items-center gap-2 text-[13px] text-gray-700 dark:text-gray-200 min-h-[36px]">
                              {i.item_type !== "HEADER" && <CompletionDot state="NOT_STARTED" size={14} />}
                              <ItemTypeIcon type={i.item_type} className="w-3.5 h-3.5 text-gray-400" />
                              <span className={`truncate ${i.item_type === "HEADER" ? "uppercase text-[10px] font-semibold text-gray-400" : ""}`}>{i.title}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const input = "el-input";
const Row: React.FC<{ label: string; hint: string; checked: boolean; onToggle: (v: boolean) => void }> = ({ label, hint, checked, onToggle }) => (
  <label className="flex items-center justify-between gap-4 min-h-[52px] py-2">
    <span><span className="block text-sm text-gray-800 dark:text-gray-100">{label}</span><span className="block text-[11px] text-gray-500">{hint}</span></span>
    <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} className="w-5 h-5 accent-brand-500" />
  </label>
);

const SettingsTab: React.FC<{ data: BuilderCourse; onChange: (patch: Record<string, unknown>) => Promise<unknown> }> = ({ data, onChange }) => {
  const [title, setTitle] = useState(data.course.title);
  const [description, setDescription] = useState(data.course.description || "");
  const [icon, setIcon] = useState(data.course.icon || "");
  return (
    <div className="mt-4 max-w-xl space-y-5">
      <label className="block"><span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Title</span><input className={`${input} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== data.course.title && onChange({ title })} /></label>
      <label className="block"><span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Description</span><textarea className={`${input} mt-1 py-2 min-h-[80px]`} value={description} onChange={(e) => setDescription(e.target.value)} onBlur={() => description !== (data.course.description || "") && onChange({ description })} /></label>
      {/* Pick from the set rather than typing a character nobody can guess. */}
      <div>
        <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Cover icon</span>
        <p className="text-[11px] text-gray-400">Chosen from the subject name unless you pick one.</p>
        <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cover icon">
          <button
            type="button"
            role="radio"
            aria-checked={!icon}
            onClick={() => { setIcon(""); onChange({ icon: null }); }}
            title={`Automatic — ${resolveSubjectIcon(data.subject.name, null).label}`}
            className={`min-h-[44px] px-3 rounded-xl border text-xs font-medium ${!icon ? "border-brand-500 el-chip-brand" : "border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300"}`}
          >
            Auto
          </button>
          {SUBJECT_ICONS.filter((i) => i.key !== "general").map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={icon === key}
              aria-label={label}
              title={label}
              onClick={() => { setIcon(key); onChange({ icon: key }); }}
              className={`w-11 h-11 flex items-center justify-center rounded-xl border transition-colors ${
                icon === key ? "border-brand-500 el-chip-brand" : "border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-brand-200 dark:hover:border-brand-500/40"
              }`}
              style={icon === key ? { color: data.course.cover_color || data.subject.color || undefined } : undefined}
            >
              <Icon className="w-5 h-5" strokeWidth={1.75} />
            </button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-white/[0.06] rounded-2xl border border-gray-200 dark:border-white/[0.07] px-4">
        <Row label="Weeks publish themselves" hint="A week goes live when it starts, or when you mark it completed in the scheme." checked={!!data.course.auto_publish_from_scheme} onToggle={(v) => onChange({ auto_publish_from_scheme: v })} />
        <Row label="Sequential progress" hint="Students must finish items in order. Off by default — you pace the class." checked={!!data.course.require_sequential_progress} onToggle={(v) => onChange({ require_sequential_progress: v })} />
      </div>
    </div>
  );
};

export default CourseBuilderPage;
