import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  addWeeks,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
  isValid as isValidDate,
} from "date-fns";
import {
  Sparkles,
  FileText,
  Loader2,
  CheckCircle2,
  Circle,
  AlertTriangle,
  ArrowLeft,
  CloudUpload,
  RefreshCcw,
  ArrowRight,
  CalendarDays,
  ListOrdered,
  SkipForward,
  ListChecks,
  MessageSquarePlus,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Layers,
  CheckSquare,
  Square,
  Plus,
  Minus,
  X,
  CalendarRange,
  Search,
  Lightbulb,
} from "lucide-react";
import {
  schemeOfWorkApi,
  AIGenerationStatus,
  CurriculumStructurePreview,
} from "../api/schemeOfWork";
import { academicTermsApi } from "../api/academics";
import { useAcademicPeriod } from "../contexts/AcademicPeriodContext";
import { competenciesApi, SubjectCompetency } from "../api/curriculum";
import { useToast } from "../contexts/ToastContext";
import usePermissions from "../hooks/usePermissions";
import { Permissions } from "../constants/permissions";
import CurriculumExtractionPreview from "./curriculum/CurriculumExtractionPreview";

interface Props {
  subjectId: number;
  classGroupId: number;
  academicTermId: number;
  subjectName?: string;
  classGroupName?: string;
  termName?: string;
  onComplete: () => void;
  onCancel: () => void;
}

const BASE_STEPS: { key: AIGenerationStatus["status"]; label: string; description: string }[] = [
  { key: "parsing", label: "Reading document", description: "Extracting text from your curriculum file" },
  { key: "analyzing", label: "Analyzing with AI", description: "Gemini is interpreting the curriculum content" },
  { key: "structuring", label: "Structuring weekly plan", description: "Mapping content into weeks with dates" },
  { key: "saving", label: "Saving to database", description: "Writing the scheme of work entries" },
];

const CURRICULUM_STEP = {
  key: "extracting_curriculum" as const,
  label: "Extracting curriculum",
  description: "Detecting Elements of Competency & Performance Criteria",
};

const POLL_INTERVAL_MS = 1200;

/** A "select all" checkbox with indeterminate state when only some children are checked — plain
 * <input> doesn't expose `indeterminate` as a JSX prop. */
const TriStateCheckbox: React.FC<{
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  className?: string;
}> = ({ checked, indeterminate, onChange, className }) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className={className || "mt-0.5 accent-violet-600"}
    />
  );
};

/** A self-contained month-grid date picker, styled to match the wizard's violet theme — replaces
 * the plain native <input type="date"> on the "Scheme of Work" step with something that actually
 * feels like part of a scheduling tool. When `scheduleMap` is given (built from the teacher's
 * chosen start date / week count / skip list), it also renders a live preview of exactly which
 * days become each teaching week and which weeks are being skipped. */
const MonthCalendarPicker: React.FC<{
  value: string;
  onChange: (isoDate: string) => void;
  scheduleMap?: Map<string, ScheduleSlot>;
  scheduleSlots?: ScheduleSlot[];
}> = ({ value, onChange, scheduleMap, scheduleSlots }) => {
  const selected = value ? parseISO(value) : null;
  // The actual first teaching week starts on the Monday on/after the chosen date (see
  // computeWeekDates on the backend) — jump the calendar there rather than to the raw picked
  // date, so a Wednesday start date doesn't land the user on a month with no highlighted weeks.
  const firstWeekMonth = (d: Date) => {
    const dow = d.getDay();
    return dow === 1 ? d : addDays(d, (1 - dow + 7) % 7);
  };
  const [viewMonth, setViewMonth] = useState<Date>(
    selected && isValidDate(selected) ? firstWeekMonth(selected) : new Date(),
  );

  useEffect(() => {
    if (selected && isValidDate(selected)) setViewMonth(firstWeekMonth(selected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const gridStart = startOfWeek(startOfMonth(viewMonth));
  const gridEnd = endOfWeek(endOfMonth(viewMonth));
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const goToday = () => {
    const today = new Date();
    setViewMonth(today);
    onChange(format(today, "yyyy-MM-dd"));
  };

  const jumpToSlot = (slot: ScheduleSlot) => setViewMonth(slot.start);

  const hasSchedule = !!scheduleSlots && scheduleSlots.length > 0;

  return (
    <div className="w-full bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setViewMonth((m) => subMonths(m, 1))}
          className="w-7 h-7 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          {format(viewMonth, "MMMM yyyy")}
        </span>
        <button
          type="button"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          className="w-7 h-7 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 py-1"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const inMonth = isSameMonth(day, viewMonth);
          const isSelected = selected && isValidDate(selected) && isSameDay(day, selected);
          const isCurrentDay = isToday(day);
          const info = scheduleMap?.get(dateKey);
          const isSlotStart = !!info && isSameDay(day, info.start);

          let cellClasses =
            "relative h-11 rounded-lg flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ";
          if (isSelected) {
            cellClasses += "bg-violet-600 text-white shadow-sm shadow-violet-500/40";
          } else if (info) {
            cellClasses += info.skipped
              ? "bg-amber-100 dark:bg-amber-900/25 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/40"
              : "bg-violet-100 dark:bg-violet-900/25 text-violet-800 dark:text-violet-200 hover:bg-violet-200 dark:hover:bg-violet-900/40";
          } else if (inMonth) {
            cellClasses += "text-gray-700 dark:text-gray-200 hover:bg-violet-50 dark:hover:bg-violet-900/20";
          } else {
            cellClasses += "text-gray-300 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700/40";
          }

          return (
            <button
              type="button"
              key={dateKey}
              onClick={() => onChange(dateKey)}
              title={
                info
                  ? `Week ${info.slot}${info.skipped ? " — skipped" : ""}: ${format(info.start, "d MMM")} – ${format(info.end, "d MMM")}`
                  : undefined
              }
              className={cellClasses}
            >
              <span>{format(day, "d")}</span>
              {isSlotStart && (
                <span
                  className={`text-[8px] font-bold leading-none tracking-wide ${
                    isSelected
                      ? "text-white/90"
                      : info!.skipped
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-violet-600 dark:text-violet-400"
                  }`}
                >
                  {info!.skipped ? "SKIP" : `W${info!.slot}`}
                </span>
              )}
              {isCurrentDay && !isSelected && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-violet-500" />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-3 gap-3">
        <button
          type="button"
          onClick={goToday}
          className="text-[11px] font-medium text-violet-600 dark:text-violet-400 hover:underline"
        >
          Jump to today
        </button>
        {hasSchedule && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => jumpToSlot(scheduleSlots![0])}
              className="text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:underline"
            >
              First week
            </button>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <button
              type="button"
              onClick={() => jumpToSlot(scheduleSlots![scheduleSlots!.length - 1])}
              className="text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:underline"
            >
              Last week
            </button>
          </div>
        )}
      </div>

      {hasSchedule && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-gray-200 dark:border-slate-700 text-[11px] text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-violet-600" /> Start date
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-violet-100 dark:bg-violet-900/50 border border-violet-300 dark:border-violet-700" />{" "}
            Scheme week
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-amber-100 dark:bg-amber-900/50 border border-amber-300 dark:border-amber-700" />{" "}
            Skipped week
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500" /> Today
          </span>
        </div>
      )}
    </div>
  );
};

type WizardStep = "curriculum" | "generate";

/** One Mon-Fri teaching week slot in the scheduled range, as the backend will actually generate
 * it (see computeWeekDates) — lets the calendar preview show exactly which days become "Week N"
 * and which weeks the teacher chose to skip. */
interface ScheduleSlot {
  slot: number;
  start: Date;
  end: Date;
  skipped: boolean;
}

const SchemeAIGenerate: React.FC<Props> = ({
  subjectId,
  classGroupId,
  academicTermId,
  subjectName,
  onComplete,
  onCancel,
}) => {
  const { showToast } = useToast();
  const { selectedYear, selectedTerm } = useAcademicPeriod();
  const { hasPermission } = usePermissions();
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobStatus, setJobStatus] = useState<AIGenerationStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [numWeeks, setNumWeeks] = useState("");
  const [startDate, setStartDate] = useState("");
  const [skipWeeks, setSkipWeeks] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");

  const [structurePreview, setStructurePreview] =
    useState<CurriculumStructurePreview | null>(null);
  // Keyed by "loNumber:itemIndex" — lets a term cover only part of a Learning Outcome. Used only
  // on the "no curriculum yet, upload a document" path.
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(new Set());
  const [isLoadingStructure, setIsLoadingStructure] = useState(false);

  // Step 1: does this subject already have a Curriculum? Loading state gates the whole wizard so
  // we don't flash the "upload a file" UI before we know.
  const [isLoadingCurriculum, setIsLoadingCurriculum] = useState(true);
  const [existingElements, setExistingElements] = useState<SubjectCompetency[] | null>(null);
  // Keyed by "competencyId:criteriaId" — which existing Performance Criteria the teacher picked
  // to prepare for this term. Defaults to "everything selected".
  const [selectedCriteriaRefs, setSelectedCriteriaRefs] = useState<Set<string>>(new Set());
  const [expandedElements, setExpandedElements] = useState<Set<number>>(new Set());
  const [curriculumSearch, setCurriculumSearch] = useState("");
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const [wizardStep, setWizardStep] = useState<WizardStep>("curriculum");
  const [wantsCurriculumGen, setWantsCurriculumGen] = useState(true);
  // Frozen at submit time so the progress UI's step list doesn't change mid-flight.
  const [curriculumStepEnabled, setCurriculumStepEnabled] = useState(false);

  const canManageCurriculum = hasPermission(Permissions.MANAGE_CURRICULUM);
  const hasCurriculum = !!existingElements && existingElements.length > 0;
  const offerCurriculumGen = canManageCurriculum && existingElements !== null && !hasCurriculum;

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingCurriculum(true);
    competenciesApi
      .getAll(subjectId)
      .then((resp) => {
        if (cancelled) return;
        const elements = resp.data.data || [];
        setExistingElements(elements);
        // Default to full coverage — the teacher can then narrow it down to specific criteria.
        const seeded = new Set<string>();
        for (const el of elements) {
          for (const c of el.criteria || []) {
            seeded.add(`${el.competency_id}:${c.criteria_id}`);
          }
        }
        setSelectedCriteriaRefs(seeded);
        setExpandedElements(new Set(elements.slice(0, 1).map((el) => el.competency_id)));
      })
      .catch(() => {
        setExistingElements([]);
        showToast("Couldn't check for an existing Curriculum — you can still upload one", "error");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCurriculum(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  useEffect(() => {
    let cancelled = false;
    academicTermsApi
      .getAll()
      .then((resp) => {
        if (cancelled) return;
        const raw = resp.data as any;
        const terms = Array.isArray(raw) ? raw : raw?.data || [];
        const term = terms.find(
          (t: any) => t.academic_term_id === academicTermId,
        );
        if (term?.start_date) {
          setStartDate(String(term.start_date).slice(0, 10));
          if (term.end_date) {
            const days = Math.max(
              (new Date(term.end_date).getTime() -
                new Date(term.start_date).getTime()) /
                86400000,
              0,
            );
            setNumWeeks(String(Math.max(1, Math.round(days / 7))));
          }
        }
      })
      .catch(() => {
        /* non-fatal: user can still type dates/weeks manually */
      });
    return () => {
      cancelled = true;
    };
  }, [academicTermId]);

  const processSelectedFile = async (selected: File) => {
    setFile(selected);
    setStructurePreview(null);
    setSelectedRefs(new Set());

    setIsLoadingStructure(true);
    try {
      const structureData = new FormData();
      structureData.append("file", selected);
      structureData.append("academic_term_id", academicTermId.toString());
      const resp = await schemeOfWorkApi.getCurriculumStructure(structureData);
      const preview = resp.data.data;
      setStructurePreview(preview);
      const seeded = new Set<string>();
      for (const lo of preview.los) {
        if (preview.autoSelectedLoNumbers.includes(lo.loNumber)) {
          for (const item of lo.contentItems) {
            seeded.add(`${lo.loNumber}:${item.index}`);
          }
        }
      }
      setSelectedRefs(seeded);
      showToast("Document read successfully", "success");
    } catch {
      // Non-fatal: behave as if no structure was detected and let the user generate as-is.
      setStructurePreview({
        hasStructure: false,
        los: [],
        autoSelectedLoNumbers: [],
        termOrdinal: null,
        totalTermsInYear: null,
      });
      showToast("Couldn't analyze the document's structure — you can still generate from the full file", "error");
    } finally {
      setIsLoadingStructure(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) processSelectedFile(selected);
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped) return;
    if (!/\.(docx|pdf|txt)$/i.test(dropped.name)) {
      showToast("Only .docx, .pdf, and .txt files are supported", "error");
      return;
    }
    processSelectedFile(dropped);
  };

  const toggleContentItem = (loNumber: number, itemIndex: number) => {
    const key = `${loNumber}:${itemIndex}`;
    setSelectedRefs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleWholeLo = (lo: CurriculumStructurePreview["los"][number]) => {
    const keys = lo.contentItems.map((item) => `${lo.loNumber}:${item.index}`);
    const allSelected = keys.every((k) => selectedRefs.has(k));
    setSelectedRefs((prev) => {
      const next = new Set(prev);
      if (allSelected) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  };

  const toggleElementExpanded = (competencyId: number) => {
    setExpandedElements((prev) => {
      const next = new Set(prev);
      if (next.has(competencyId)) next.delete(competencyId);
      else next.add(competencyId);
      return next;
    });
  };

  const toggleCriterion = (competencyId: number, criteriaId: number) => {
    const key = `${competencyId}:${criteriaId}`;
    setSelectedCriteriaRefs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleWholeElement = (el: SubjectCompetency) => {
    const keys = (el.criteria || []).map((c) => `${el.competency_id}:${c.criteria_id}`);
    const allSelected = keys.length > 0 && keys.every((k) => selectedCriteriaRefs.has(k));
    setSelectedCriteriaRefs((prev) => {
      const next = new Set(prev);
      if (allSelected) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  };

  const selectAllElements = (select: boolean) => {
    if (!existingElements) return;
    if (!select) {
      setSelectedCriteriaRefs(new Set());
      return;
    }
    const all = new Set<string>();
    for (const el of existingElements) {
      for (const c of el.criteria || []) {
        all.add(`${el.competency_id}:${c.criteria_id}`);
      }
    }
    setSelectedCriteriaRefs(all);
  };

  const totalCriteriaCount = useMemo(
    () => (existingElements || []).reduce((sum, el) => sum + (el.criteria || []).length, 0),
    [existingElements],
  );

  const filteredElements = useMemo(() => {
    const all = existingElements || [];
    const query = curriculumSearch.trim().toLowerCase();
    if (!query) return all;
    return all.filter((el) => {
      if (el.title.toLowerCase().includes(query)) return true;
      return (el.criteria || []).some(
        (c) =>
          c.criteria_number.toLowerCase().includes(query) ||
          c.description.toLowerCase().includes(query),
      );
    });
  }, [existingElements, curriculumSearch]);

  const skipWeekNumbers = useMemo(
    () =>
      skipWeeks
        .split(/[,\s]+/)
        .map((t) => parseInt(t, 10))
        .filter((n) => Number.isInteger(n) && n > 0),
    [skipWeeks],
  );

  const removeSkipWeek = (weekNum: number) => {
    setSkipWeeks(skipWeekNumbers.filter((w) => w !== weekNum).join(", "));
  };

  const toggleSkipWeek = (weekNum: number) => {
    if (skipWeekNumbers.includes(weekNum)) {
      removeSkipWeek(weekNum);
      showToast(`Week ${weekNum} added back to the teaching schedule`, "success");
    } else {
      setSkipWeeks([...skipWeekNumbers, weekNum].sort((a, b) => a - b).join(", "));
      showToast(`Week ${weekNum} marked as skipped`, "success");
    }
  };

  const adjustNumWeeks = (delta: number) => {
    const current = parseInt(numWeeks, 10) || 0;
    const next = Math.min(52, Math.max(1, current + delta));
    setNumWeeks(String(next));
  };

  const scheduleEndDate = useMemo(() => {
    const start = startDate ? parseISO(startDate) : null;
    const weeks = parseInt(numWeeks, 10);
    if (!start || !isValidDate(start) || !Number.isInteger(weeks) || weeks <= 0) {
      return null;
    }
    return addWeeks(start, weeks);
  }, [startDate, numWeeks]);

  // The exact Mon-Fri slots the backend will generate (see computeWeekDates: anchor snaps forward
  // to the next Monday, then each week is 5 consecutive days) — drives the calendar's week bands.
  const scheduleSlots = useMemo<ScheduleSlot[]>(() => {
    const start = startDate ? parseISO(startDate) : null;
    const weeks = parseInt(numWeeks, 10);
    if (!start || !isValidDate(start) || !Number.isInteger(weeks) || weeks <= 0) return [];

    const dow = start.getDay();
    const anchor = dow === 1 ? start : addDays(start, (1 - dow + 7) % 7);
    const skipSet = new Set(skipWeekNumbers);
    const cap = Math.min(weeks, 52);
    const slots: ScheduleSlot[] = [];
    for (let i = 0; i < cap; i++) {
      const slotStart = addDays(anchor, i * 7);
      slots.push({
        slot: i + 1,
        start: slotStart,
        end: addDays(slotStart, 4),
        skipped: skipSet.has(i + 1),
      });
    }
    return slots;
  }, [startDate, numWeeks, skipWeekNumbers]);

  const scheduleByDate = useMemo(() => {
    const map = new Map<string, ScheduleSlot>();
    for (const s of scheduleSlots) {
      for (let d = s.start; d <= s.end; d = addDays(d, 1)) {
        map.set(format(d, "yyyy-MM-dd"), s);
      }
    }
    return map;
  }, [scheduleSlots]);

  const skippedWeekCount = scheduleSlots.filter((s) => s.skipped).length;

  const pollStatus = (jobId: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const resp = await schemeOfWorkApi.getAIGenerateStatus(jobId);
        const status = resp.data.data;
        setJobStatus(status);

        if (status.status === "done") {
          if (pollRef.current) clearInterval(pollRef.current);
          if (status.proposedCurriculum && status.proposedCurriculum.length > 0) {
            // Hold here — the user reviews/confirms the proposed Curriculum before we're fully
            // done (the Scheme of Work entries themselves are already saved at this point).
            showToast("Scheme of work generated — review the detected curriculum too", "success");
          } else {
            showToast(
              status.autoTaggedCriteriaCount
                ? `Scheme of work generated — ${status.autoTaggedCriteriaCount} week(s) auto-tagged with performance criteria`
                : "Scheme of work generated by AI!",
              "success",
            );
            setTimeout(() => onComplete(), 900);
          }
        } else if (status.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          showToast(status.error || status.message || "Generation failed", "error");
        }
      } catch (err) {
        if (pollRef.current) clearInterval(pollRef.current);
        setJobStatus({
          status: "error",
          stepIndex: 0,
          totalSteps: 4,
          message: "Lost connection while checking progress",
          error: "Lost connection while checking progress",
        });
        showToast("Lost connection while checking generation progress", "error");
      }
    }, POLL_INTERVAL_MS);
  };

  const goToGenerateStep = () => {
    if (hasCurriculum && selectedCriteriaRefs.size === 0) {
      showToast("Select at least one Element or Performance Criteria to continue", "error");
      return;
    }
    if (!hasCurriculum && !file) {
      showToast("Select a curriculum file to continue", "error");
      return;
    }
    if (!hasCurriculum && isLoadingStructure) {
      showToast("Still reading the document — one moment", "error");
      return;
    }
    setWizardStep("generate");
    showToast(
      hasCurriculum
        ? `${selectedCriteriaRefs.size} performance criteria confirmed — set the schedule to continue`
        : "Curriculum confirmed — set the schedule to continue",
      "success",
    );
  };

  const handleGenerate = async () => {
    if (!hasCurriculum && !file) return;
    setIsSubmitting(true);
    const curriculumEnabled = offerCurriculumGen && wantsCurriculumGen && !hasCurriculum;
    setCurriculumStepEnabled(curriculumEnabled);
    setJobStatus({
      status: "parsing",
      stepIndex: 1,
      totalSteps: curriculumEnabled ? 5 : 4,
      message: hasCurriculum ? "Reading selected curriculum..." : "Reading document...",
    });

    const formData = new FormData();
    if (file && !hasCurriculum) formData.append("file", file);
    formData.append("subject_id", subjectId.toString());
    formData.append("class_group_id", classGroupId.toString());
    formData.append("academic_term_id", academicTermId.toString());
    formData.append("subject_name", subjectName || "this subject");
    if (numWeeks.trim()) formData.append("num_weeks", numWeeks.trim());
    if (startDate.trim()) formData.append("start_date", startDate.trim());
    if (skipWeeks.trim()) formData.append("skip_weeks", skipWeeks.trim());
    if (additionalInstructions.trim()) {
      formData.append("additional_instructions", additionalInstructions.trim());
    }

    if (hasCurriculum) {
      formData.append("use_existing_curriculum", "true");
      formData.append("selected_criteria_refs", Array.from(selectedCriteriaRefs).join(","));
    } else {
      if (selectedRefs.size > 0) {
        formData.append("selected_content_refs", Array.from(selectedRefs).join(","));
      }
      if (curriculumEnabled) {
        formData.append("generate_curriculum", "true");
      }
    }

    try {
      const resp = await schemeOfWorkApi.startAIGenerate(formData);
      const { jobId } = resp.data.data;
      showToast("AI generation started", "success");
      pollStatus(jobId);
    } catch (error: any) {
      const message = error.response?.data?.message || "Could not start AI generation";
      setJobStatus({
        status: "error",
        stepIndex: 0,
        totalSteps: 4,
        message: "Could not start AI generation",
        error: message,
      });
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCurriculumSaved = async (subjectIdForLink: number, schemeId?: number) => {
    if (jobStatus?.entryCriteriaNumbers && schemeId) {
      try {
        await schemeOfWorkApi.linkCriteria(schemeId, {
          subjectId: subjectIdForLink,
          entryCriteriaNumbers: jobStatus.entryCriteriaNumbers,
        });
        showToast("Performance criteria linked to the new scheme", "success");
      } catch {
        // Non-fatal: the scheme and curriculum are both already saved either way — matching is a
        // best-effort convenience, correctable later via the entry modal's manual multi-select.
        showToast("Curriculum saved — criteria linking will need a manual pass", "error");
      }
    }
    onComplete();
  };

  const handleRetry = () => {
    setJobStatus(null);
    setFile(null);
    setStructurePreview(null);
    setSelectedRefs(new Set());
    setWizardStep("curriculum");
  };

  const isProcessing =
    !!jobStatus && !["done", "error"].includes(jobStatus.status);

  const activeSteps = curriculumStepEnabled
    ? [BASE_STEPS[0], CURRICULUM_STEP, ...BASE_STEPS.slice(1)]
    : BASE_STEPS;

  const needsCurriculumReview =
    jobStatus?.status === "done" &&
    !!jobStatus.proposedCurriculum &&
    jobStatus.proposedCurriculum.length > 0;

  const showWizardChrome = !jobStatus;

  // Step 1 and Step 2 stretch to the page's full content width (they use two-column layouts that
  // need the room); the compact progress/done/error states stay centered and narrower since they
  // hold nothing but a short status message.
  const containerWidthClass = needsCurriculumReview
    ? "max-w-5xl mx-auto"
    : !jobStatus && (wizardStep === "generate" || wizardStep === "curriculum")
      ? "w-full"
      : "max-w-2xl mx-auto";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className={containerWidthClass}
    >
      <div className="relative overflow-hidden py-5 px-4 sm:py-6 sm:px-6 md:px-8 bg-white dark:bg-slate-900 border-2 border-violet-100 dark:border-violet-900/40 rounded-3xl">
        <div className="absolute -top-16 -right-16 w-40 h-40 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 mb-5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 flex-shrink-0 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm shadow-violet-500/25">
                <Sparkles className="w-[18px] h-[18px] text-white" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white truncate">
                Generate Scheme of Work with AI
              </h3>
              {(selectedYear || selectedTerm) && (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-800 px-2.5 py-1 rounded-full flex-shrink-0">
                  <CalendarDays className="w-3 h-3" />
                  {selectedYear?.name}
                  {selectedYear && selectedTerm && " · "}
                  {selectedTerm?.name}
                </span>
              )}
            </div>

            {showWizardChrome && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {(["curriculum", "generate"] as WizardStep[]).map((step, idx) => {
                  const stepNum = idx + 1;
                  const isActive = wizardStep === step;
                  const isDone = step === "curriculum" && wizardStep === "generate";
                  return (
                    <React.Fragment key={step}>
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                            isActive
                              ? "bg-violet-600 text-white"
                              : isDone
                                ? "bg-emerald-500 text-white"
                                : "bg-gray-100 dark:bg-slate-800 text-gray-400"
                          }`}
                        >
                          {isDone ? <CheckCircle2 className="w-3 h-3" /> : stepNum}
                        </div>
                        <span
                          className={`hidden sm:inline text-xs font-semibold ${
                            isActive
                              ? "text-violet-700 dark:text-violet-300"
                              : "text-gray-400 dark:text-gray-500"
                          }`}
                        >
                          {step === "curriculum" ? "Curriculum" : "Scheme of Work"}
                        </span>
                      </div>
                      {idx === 0 && <div className="w-5 sm:w-6 h-px bg-gray-200 dark:bg-slate-700" />}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>

          {!showWizardChrome && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 -mt-2">
              {hasCurriculum
                ? "Preparing your weekly scheme from the selected Curriculum..."
                : "Preparing your weekly scheme from the uploaded document..."}
            </p>
          )}

          <AnimatePresence mode="wait">
            {!jobStatus && wizardStep === "curriculum" && (
              <motion.div
                key="curriculum-step"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full flex flex-col items-center"
              >
                {isLoadingCurriculum ? (
                  <div className="w-full flex flex-col items-center gap-2 py-8 text-gray-400 dark:text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-xs">Checking for existing Curriculum...</span>
                  </div>
                ) : hasCurriculum ? (
                  <div className="w-full text-left">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                      <div>
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-200">
                          <Layers className="w-4 h-4 text-violet-500" />
                          This subject's Curriculum
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Pick the Elements and Performance Criteria this term should prepare for
                        </p>
                      </div>
                      <div className="relative w-full sm:w-64">
                        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={curriculumSearch}
                          onChange={(e) => setCurriculumSearch(e.target.value)}
                          placeholder="Search elements or criteria..."
                          className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>
                    </div>

                    <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-5">
                      <div className="lg:col-span-2 flex flex-col gap-2 max-h-[30rem] overflow-y-auto pr-1">
                        {filteredElements.map((el) => {
                          const criteria = el.criteria || [];
                          const keys = criteria.map((c) => `${el.competency_id}:${c.criteria_id}`);
                          const selectedCount = keys.filter((k) => selectedCriteriaRefs.has(k)).length;
                          const allSelected = keys.length > 0 && selectedCount === keys.length;
                          const someSelected = selectedCount > 0 && !allSelected;
                          const isExpanded =
                            expandedElements.has(el.competency_id) || !!curriculumSearch.trim();
                          return (
                            <div
                              key={el.competency_id}
                              className={`rounded-xl border transition-colors ${
                                selectedCount > 0
                                  ? "border-violet-200 dark:border-violet-800/60 bg-violet-50/50 dark:bg-violet-900/10"
                                  : "border-gray-200 dark:border-slate-700 hover:border-violet-200 dark:hover:border-violet-800/50"
                              }`}
                            >
                              <div className="flex items-start gap-2 px-3 py-2.5">
                                <TriStateCheckbox
                                  checked={allSelected}
                                  indeterminate={someSelected}
                                  onChange={() => toggleWholeElement(el)}
                                  className="mt-1 accent-violet-600"
                                />
                                <button
                                  type="button"
                                  onClick={() => toggleElementExpanded(el.competency_id)}
                                  className="flex-1 flex items-start justify-between gap-2 text-left"
                                >
                                  <span>
                                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                      Element {el.element_number}: {el.title}
                                    </span>
                                    {el.learning_hours != null && (
                                      <span className="ml-1.5 text-xs font-normal text-gray-400">
                                        ({el.learning_hours} learning hrs)
                                      </span>
                                    )}
                                    <span className="block text-[11px] text-gray-400 mt-0.5">
                                      {selectedCount}/{keys.length} criteria selected
                                    </span>
                                  </span>
                                  {isExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                                  )}
                                </button>
                              </div>
                              {isExpanded && (
                                <div className="px-3 pb-3 ml-6 flex flex-col gap-1.5 border-l border-gray-200 dark:border-slate-700 pl-3">
                                  {criteria.map((c) => (
                                    <label
                                      key={c.criteria_id}
                                      className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selectedCriteriaRefs.has(
                                          `${el.competency_id}:${c.criteria_id}`,
                                        )}
                                        onChange={() => toggleCriterion(el.competency_id, c.criteria_id)}
                                        className="mt-0.5 accent-violet-600"
                                      />
                                      <span>
                                        <span className="font-medium text-gray-500 dark:text-gray-400">
                                          {c.criteria_number}
                                        </span>{" "}
                                        {c.description}
                                      </span>
                                    </label>
                                  ))}
                                  {criteria.length === 0 && (
                                    <p className="text-xs text-gray-400 italic">No performance criteria defined for this element.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {filteredElements.length === 0 && (
                          <div className="flex flex-col items-center gap-2 py-10 text-gray-400 dark:text-gray-500">
                            <Search className="w-6 h-6" />
                            <p className="text-xs">No elements or criteria match "{curriculumSearch}"</p>
                          </div>
                        )}
                      </div>

                      <div className="lg:col-span-1">
                        <div className="lg:sticky lg:top-4 bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-2xl p-4 flex flex-col gap-4">
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                Selection progress
                              </span>
                              <span className="text-xs font-bold text-violet-600 dark:text-violet-400">
                                {selectedCriteriaRefs.size}/{totalCriteriaCount}
                              </span>
                            </div>
                            <div className="w-full h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <motion.div
                                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500"
                                initial={{ width: 0 }}
                                animate={{
                                  width:
                                    totalCriteriaCount > 0
                                      ? `${(selectedCriteriaRefs.size / totalCriteriaCount) * 100}%`
                                      : "0%",
                                }}
                                transition={{ duration: 0.3 }}
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-[11px]">
                            <button
                              type="button"
                              onClick={() => selectAllElements(true)}
                              className="inline-flex items-center gap-1 font-medium text-violet-600 dark:text-violet-400 hover:underline"
                            >
                              <CheckSquare className="w-3 h-3" /> Select all
                            </button>
                            <span className="text-gray-300 dark:text-gray-600">·</span>
                            <button
                              type="button"
                              onClick={() => selectAllElements(false)}
                              className="inline-flex items-center gap-1 font-medium text-gray-500 dark:text-gray-400 hover:underline"
                            >
                              <Square className="w-3 h-3" /> Clear all
                            </button>
                          </div>

                          <div className="flex flex-col gap-1.5 text-xs text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-200 dark:border-slate-700">
                            <p className="flex items-center justify-between">
                              <span>Elements defined</span>
                              <span className="font-semibold text-gray-700 dark:text-gray-300">
                                {existingElements!.length}
                              </span>
                            </p>
                            <p className="flex items-center justify-between">
                              <span>Performance criteria</span>
                              <span className="font-semibold text-gray-700 dark:text-gray-300">
                                {totalCriteriaCount}
                              </span>
                            </p>
                          </div>

                          <button
                            onClick={goToGenerateStep}
                            disabled={selectedCriteriaRefs.size === 0}
                            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-full transition-colors shadow-sm disabled:opacity-50"
                          >
                            Continue to Scheme of Work
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-6 text-left">
                    <div className="lg:col-span-2">
                      {!file ? (
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            setIsDraggingFile(true);
                          }}
                          onDragLeave={() => setIsDraggingFile(false)}
                          onDrop={handleFileDrop}
                          className={`w-full flex flex-col items-center justify-center gap-3 py-14 px-6 rounded-2xl border-2 border-dashed transition-colors ${
                            isDraggingFile
                              ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20"
                              : "border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/40"
                          }`}
                        >
                          <div className="w-14 h-14 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                            <CloudUpload className="w-7 h-7 text-violet-600 dark:text-violet-400" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                              Drag & drop your curriculum file here
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">or click below to browse</p>
                          </div>
                          <label className="cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-full transition-colors shadow-sm">
                            <CloudUpload className="w-4 h-4" />
                            Select Curriculum File
                            <input
                              type="file"
                              accept=".docx,.pdf,.txt"
                              className="hidden"
                              onChange={handleFileChange}
                            />
                          </label>
                          <div className="flex flex-wrap gap-2 justify-center mt-1">
                            {[".docx", ".pdf", ".txt"].map((ext) => (
                              <span
                                key={ext}
                                className="text-xs bg-white dark:bg-slate-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-slate-700 px-2.5 py-0.5 rounded-full font-medium"
                              >
                                {ext}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3 w-full">
                          <div className="w-full flex items-center gap-3 px-4 py-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/50 rounded-xl">
                            <FileText className="w-5 h-5 text-violet-600 dark:text-violet-400 flex-shrink-0" />
                            <span className="text-sm text-violet-700 dark:text-violet-300 font-medium truncate">
                              {file.name}
                            </span>
                          </div>

                          {isLoadingStructure && (
                            <div className="w-full flex items-center gap-2 px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Checking document structure...
                            </div>
                          )}

                          {!isLoadingStructure && structurePreview?.hasStructure && (
                            <div className="w-full text-left px-4 py-3 bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl max-h-80 overflow-y-auto">
                              <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
                                <ListChecks className="w-3.5 h-3.5" />
                                {structurePreview.autoSelectedLoNumbers.length > 0
                                  ? `Detected content for Term ${structurePreview.termOrdinal} — confirm or narrow down what this term will actually cover`
                                  : "We couldn't automatically match a Learning Outcome to this term — please select which content applies"}
                              </p>
                              <div className="flex flex-col gap-3">
                                {structurePreview.los.map((lo) => {
                                  const itemKeys = lo.contentItems.map(
                                    (item) => `${lo.loNumber}:${item.index}`,
                                  );
                                  const selectedCount = itemKeys.filter((k) =>
                                    selectedRefs.has(k),
                                  ).length;
                                  const allSelected =
                                    itemKeys.length > 0 &&
                                    selectedCount === itemKeys.length;
                                  const someSelected =
                                    selectedCount > 0 && !allSelected;
                                  return (
                                    <div key={lo.loNumber}>
                                      <label className="flex items-start gap-2 text-sm font-medium text-gray-800 dark:text-gray-200 cursor-pointer">
                                        <TriStateCheckbox
                                          checked={allSelected}
                                          indeterminate={someSelected}
                                          onChange={() => toggleWholeLo(lo)}
                                        />
                                        <span>
                                          LO {lo.loNumber}: {lo.title}
                                          {lo.hours != null && (
                                            <span className="font-normal text-gray-400">
                                              {" "}
                                              ({lo.hours} learning hrs)
                                            </span>
                                          )}
                                        </span>
                                      </label>
                                      <div className="mt-1.5 ml-6 flex flex-col gap-1 border-l border-gray-200 dark:border-slate-700 pl-3">
                                        {lo.contentItems.map((item) => (
                                          <label
                                            key={item.index}
                                            className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer"
                                          >
                                            <input
                                              type="checkbox"
                                              checked={selectedRefs.has(
                                                `${lo.loNumber}:${item.index}`,
                                              )}
                                              onChange={() =>
                                                toggleContentItem(
                                                  lo.loNumber,
                                                  item.index,
                                                )
                                              }
                                              className="mt-0.5 accent-violet-600"
                                            />
                                            <span>{item.text}</span>
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {!isLoadingStructure &&
                            structurePreview &&
                            !structurePreview.hasStructure && (
                              <p className="w-full text-xs text-gray-400 dark:text-gray-500 px-1">
                                Couldn't detect separate terms in this document —
                                the whole file will be used.
                              </p>
                            )}

                          {offerCurriculumGen && (
                            <label className="w-full flex items-start gap-2.5 text-left px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-xl cursor-pointer">
                              <input
                                type="checkbox"
                                checked={wantsCurriculumGen}
                                onChange={(e) => setWantsCurriculumGen(e.target.checked)}
                                className="mt-0.5 accent-blue-600"
                              />
                              <span className="flex items-start gap-2">
                                <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                                <span className="text-xs text-blue-700 dark:text-blue-300">
                                  <span className="font-semibold">This subject has no Curriculum defined yet</span> —
                                  also extract Elements of Competency and Performance Criteria from this same document?
                                  You'll review it before anything is saved.
                                </span>
                              </span>
                            </label>
                          )}

                          <div className="w-full flex items-center gap-2">
                            <button
                              onClick={() => {
                                setFile(null);
                                setStructurePreview(null);
                                setSelectedRefs(new Set());
                                showToast("File cleared — select another to continue", "success");
                              }}
                              className="flex-shrink-0 px-4 py-2.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300 text-sm font-medium rounded-full transition-colors"
                            >
                              Change file
                            </button>
                            <button
                              onClick={goToGenerateStep}
                              disabled={
                                isLoadingStructure ||
                                (!!structurePreview?.hasStructure && selectedRefs.size === 0)
                              }
                              className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-full transition-colors shadow-sm disabled:opacity-50"
                            >
                              Continue to Scheme of Work
                              <ArrowRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="lg:col-span-1">
                      <div className="bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-2xl p-4 flex flex-col gap-3">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200">
                          <Lightbulb className="w-4 h-4 text-violet-500" />
                          How this works
                        </p>
                        <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-2.5">
                          <li className="flex items-start gap-2">
                            <span className="w-4 h-4 flex-shrink-0 mt-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 text-[10px] font-bold flex items-center justify-center">
                              1
                            </span>
                            Upload your official curriculum document (DOCX, PDF, or TXT).
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="w-4 h-4 flex-shrink-0 mt-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 text-[10px] font-bold flex items-center justify-center">
                              2
                            </span>
                            AI scans it and detects the Learning Outcomes relevant to this term.
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="w-4 h-4 flex-shrink-0 mt-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 text-[10px] font-bold flex items-center justify-center">
                              3
                            </span>
                            Confirm what to cover, then continue to schedule the weekly scheme.
                          </li>
                        </ul>
                        {offerCurriculumGen && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-200 dark:border-slate-700">
                            Since this subject has no Curriculum yet, you can also let AI extract one
                            from the same document — you'll review it before it's saved.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {!jobStatus && wizardStep === "generate" && (
              <motion.div
                key="generate-step"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full flex flex-col items-center"
              >
                <div className="w-full flex items-center gap-2 px-3 py-2 mb-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-left">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    {hasCurriculum
                      ? `${selectedCriteriaRefs.size} performance criteria selected from this subject's Curriculum`
                      : `Using "${file?.name}"`}
                  </p>
                </div>

                <div className="w-full grid grid-cols-1 lg:grid-cols-5 gap-6 mb-5 text-left">
                  <div className="lg:col-span-3 flex flex-col xl:flex-row gap-4">
                    <div className="w-full xl:w-80 xl:flex-shrink-0">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                        <CalendarDays className="w-3.5 h-3.5" />
                        Start Date
                      </label>
                      <MonthCalendarPicker
                        value={startDate}
                        onChange={setStartDate}
                        scheduleMap={scheduleByDate}
                        scheduleSlots={scheduleSlots}
                      />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col">
                      <label className="flex items-center justify-between gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                        <span className="flex items-center gap-1.5">
                          <ListChecks className="w-3.5 h-3.5" />
                          Weekly Breakdown
                        </span>
                        {scheduleSlots.length > 0 && (
                          <span className="font-normal text-gray-400">
                            {scheduleSlots.length - skippedWeekCount} teaching · {skippedWeekCount} skipped
                          </span>
                        )}
                      </label>
                      <div className="flex-1 bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-2xl p-2.5">
                        {scheduleSlots.length > 0 ? (
                          <div className="flex flex-col gap-1.5 max-h-[26.5rem] overflow-y-auto pr-1">
                            {scheduleSlots.map((s) => (
                              <button
                                type="button"
                                key={s.slot}
                                onClick={() => toggleSkipWeek(s.slot)}
                                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs transition-colors text-left ${
                                  s.skipped
                                    ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-amber-200 dark:border-amber-800/50"
                                    : "bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 border border-gray-200 dark:border-slate-700"
                                }`}
                              >
                                <span className="font-semibold flex-shrink-0">Week {s.slot}</span>
                                <span className="flex-1 text-center text-[11px]">
                                  {format(s.start, "d MMM")} – {format(s.end, "d MMM")}
                                </span>
                                <span
                                  className={`text-[9px] font-bold uppercase tracking-wide flex-shrink-0 px-1.5 py-0.5 rounded-full ${
                                    s.skipped
                                      ? "bg-amber-200/70 dark:bg-amber-800/50"
                                      : "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300"
                                  }`}
                                >
                                  {s.skipped ? "Skip" : "Teach"}
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic text-center py-10 px-3">
                            Pick a start date and number of weeks to preview the weekly schedule.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-2 flex flex-col gap-4">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                        <ListOrdered className="w-3.5 h-3.5" />
                        Number of Weeks
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => adjustNumWeeks(-1)}
                          className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                          aria-label="Decrease number of weeks"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={52}
                          value={numWeeks}
                          onChange={(e) => setNumWeeks(e.target.value)}
                          placeholder="Auto"
                          className="w-full px-3 py-2 text-sm text-center rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                        <button
                          type="button"
                          onClick={() => adjustNumWeeks(1)}
                          className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                          aria-label="Increase number of weeks"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                        <SkipForward className="w-3.5 h-3.5" />
                        Weeks to Skip <span className="font-normal text-gray-400">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={skipWeeks}
                        onChange={(e) => setSkipWeeks(e.target.value)}
                        placeholder="e.g. 8, 16 for midterm breaks"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                      {skipWeekNumbers.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {skipWeekNumbers.map((w) => (
                            <span
                              key={w}
                              className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 pl-2 pr-1 py-0.5 rounded-full"
                            >
                              Week {w}
                              <button
                                type="button"
                                onClick={() => removeSkipWeek(w)}
                                className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-amber-200/60 dark:hover:bg-amber-800/60"
                                aria-label={`Remove week ${w} from skip list`}
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {scheduleEndDate && (
                      <div className="flex items-start gap-2 px-3 py-2.5 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/50 rounded-xl">
                        <CalendarRange className="w-4 h-4 text-violet-600 dark:text-violet-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-violet-700 dark:text-violet-300">
                          Runs <span className="font-semibold">{format(parseISO(startDate), "d MMM yyyy")}</span> to{" "}
                          <span className="font-semibold">{format(scheduleEndDate, "d MMM yyyy")}</span>
                          {" — "}
                          <span className="font-semibold">
                            {scheduleSlots.length - skippedWeekCount} teaching week
                            {scheduleSlots.length - skippedWeekCount === 1 ? "" : "s"}
                          </span>
                          {skippedWeekCount > 0 &&
                            `, ${skippedWeekCount} skipped (${skipWeekNumbers.join(", ")})`}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="lg:col-span-5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                      <MessageSquarePlus className="w-3.5 h-3.5" />
                      Notes for the AI{" "}
                      <span className="font-normal text-gray-400">
                        (optional)
                      </span>
                    </label>
                    <textarea
                      value={additionalInstructions}
                      onChange={(e) =>
                        setAdditionalInstructions(e.target.value)
                      }
                      rows={3}
                      placeholder={
                        hasCurriculum
                          ? "Anything you want the AI to emphasize or skip — e.g. 'focus more on practical exercises than theory'"
                          : "If the document didn't extract cleanly (garbled tables, missing sections, scanned text) or you want the AI to emphasize/skip something, say so here — e.g. 'ignore the resources table, it's scrambled' or 'focus more on practical exercises than theory'"
                      }
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                    />
                  </div>
                </div>

                <div className="w-full flex items-center gap-2">
                  <button
                    onClick={() => setWizardStep("curriculum")}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300 text-sm font-medium rounded-full transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={isSubmitting}
                    className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-full transition-colors shadow-sm disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {isSubmitting ? "Starting..." : "Generate Scheme of Work"}
                  </button>
                </div>
              </motion.div>
            )}

            {jobStatus && isProcessing && (
              <motion.div
                key="progress"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full text-left"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wide">
                    Step {jobStatus.stepIndex} of {jobStatus.totalSteps}
                  </span>
                  <span className="text-xs text-gray-400">
                    {activeSteps.length - jobStatus.stepIndex} step
                    {activeSteps.length - jobStatus.stepIndex === 1 ? "" : "s"} remaining
                  </span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden mb-6">
                  <motion.div
                    className="h-full bg-gradient-to-r from-violet-500 to-indigo-500"
                    initial={{ width: 0 }}
                    animate={{
                      width: `${(jobStatus.stepIndex / jobStatus.totalSteps) * 100}%`,
                    }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
                <div className="flex flex-col gap-4">
                  {activeSteps.map((step, idx) => {
                    const stepNum = idx + 1;
                    const isDone = stepNum < jobStatus.stepIndex ||
                      (stepNum === jobStatus.stepIndex && jobStatus.status !== step.key);
                    const isActive = stepNum === jobStatus.stepIndex && jobStatus.status === step.key;
                    return (
                      <div key={step.key} className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {isDone ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          ) : isActive ? (
                            <Loader2 className="w-5 h-5 text-violet-600 dark:text-violet-400 animate-spin" />
                          ) : (
                            <Circle className="w-5 h-5 text-gray-300 dark:text-gray-700" />
                          )}
                        </div>
                        <div>
                          <p
                            className={`text-sm font-semibold ${
                              isActive
                                ? "text-violet-700 dark:text-violet-300"
                                : isDone
                                  ? "text-gray-700 dark:text-gray-300"
                                  : "text-gray-400 dark:text-gray-600"
                            }`}
                          >
                            {step.label}
                          </p>
                          {isActive && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {step.description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {jobStatus?.status === "done" && !needsCurriculumReview && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full flex flex-col items-center py-4"
              >
                <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {jobStatus.entriesCount} weeks generated!
                </p>
                {!!jobStatus.autoTaggedCriteriaCount && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {jobStatus.autoTaggedCriteriaCount} auto-tagged with performance criteria
                  </p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                  Opening your scheme <ArrowRight className="w-3 h-3" />
                </p>
              </motion.div>
            )}

            {needsCurriculumReview && jobStatus?.proposedCurriculum && (
              <motion.div
                key="curriculum-review"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full text-left"
              >
                <div className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    {jobStatus.entriesCount} weeks generated and saved. We also detected this
                    subject's Curriculum — review it below before saving.
                  </p>
                </div>
                <CurriculumExtractionPreview
                  subjectId={subjectId}
                  initialElements={jobStatus.proposedCurriculum}
                  sourceFilename={file?.name}
                  onSaved={() => handleCurriculumSaved(subjectId, jobStatus.schemeId)}
                  onCancel={onComplete}
                  cancelLabel="Skip — I'll set up Curriculum later"
                />
              </motion.div>
            )}

            {jobStatus?.status === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full flex flex-col items-center py-2"
              >
                <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-3">
                  <AlertTriangle className="w-7 h-7 text-red-500" />
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                  Generation failed
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs mb-4">
                  {jobStatus.error || jobStatus.message}
                </p>
                <button
                  onClick={handleRetry}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-full transition-colors"
                >
                  <RefreshCcw className="w-4 h-4" />
                  Try Again
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {!isProcessing && jobStatus?.status !== "done" && (
            <div className="flex justify-center">
              <button
                onClick={onCancel}
                className="mt-6 inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to options
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default SchemeAIGenerate;
