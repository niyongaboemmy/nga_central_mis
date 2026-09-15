import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Save,
  Clock,
  BookOpen,
  Target,
  ClipboardList,
  CheckCircle,
  UploadCloud,
  FileText,
  Layout,
  LayoutDashboard,
  Trash2,
  PenLine,
  Sparkles,
  CloudUpload,
  ArrowRight,
  ArrowLeft,
  CalendarDays,
  Timer,
  GraduationCap,
  UserRound,
  Users,
  CheckCircle2,
  Circle,
  AlertCircle,
} from "lucide-react";
import { LessonPlan, lessonPlanApi } from "../api/lessonPlan";
import { useToast } from "../contexts/ToastContext";
import LessonPlanAIGenerate from "./LessonPlanAIGenerate";

interface WeekdayDefault {
  start_time: string;
  end_time: string;
  class_name?: string;
  location?: string;
}

interface LessonPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  entryId: number;
  onSaved: () => void;
  initialData?: LessonPlan | null;
  entryTopic?: string;
  entryWeekLabel?: string;
  // The subject/class's real timetable, keyed by weekday (0=Sun..6=Sat,
  // matching Date#getDay()) — lets a brand-new plan auto-fill its time slot
  // and class name instead of asking the teacher to retype what the
  // timetable already knows.
  weekdayDefaults?: Record<number, WeekdayDefault>;
  instructorName?: string;
}

type ModalMode = "choose" | "manual" | "ai";

type TabType =
  | "Header"
  | "Objectives"
  | "Introduction"
  | "Development"
  | "Conclusion"
  | "Footer"
  | "Preview";

const LessonPlanModal: React.FC<LessonPlanModalProps> = ({
  isOpen,
  onClose,
  entryId,
  onSaved,
  initialData,
  entryTopic,
  entryWeekLabel,
  weekdayDefaults,
  instructorName,
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>("Header");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<ModalMode>(initialData ? "manual" : "choose");
  const chooseFileInputRef = useRef<HTMLInputElement>(null);

  // Local date, not toISOString() — that converts to UTC first and rolls
  // back to yesterday for anyone west of UTC in the evening.
  const todayLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const defaultFormData: Partial<LessonPlan> = {
    entry_id: entryId,
    lesson_date: todayLocal(),
    sector: "",
    trade: "",
    level: "3",
    outcomes: [
      {
        code: "LO1",
        title: "",
        description: "",
        duration_minutes: 0,
        activities: [{ trainer_activities: "", learner_activities: "" }],
        resources: [{ resource_name: "" }],
      },
    ],
    sections: [
      {
        section_type: "Introduction",
        trainer_activities: "",
        learner_activities: "",
        resources: "",
        duration_minutes: 0,
      },
      {
        section_type: "Development",
        trainer_activities: "",
        learner_activities: "",
        resources: "",
        duration_minutes: 0,
      },
      {
        section_type: "Conclusion",
        trainer_activities: "",
        learner_activities: "",
        resources: "",
        duration_minutes: 0,
      },
    ],
    indicativeContent: [],
    assignments: [],
    evaluation: {
      teacher_notes: "",
      references: "",
      prepared_by: "",
      verified_by: "",
    },
  };

  const [formData, setFormData] =
    useState<Partial<LessonPlan>>(defaultFormData);
  // Snapshot of the form the moment it was opened/loaded, so we can tell a
  // teacher apart who is mid-edit from one who hasn't touched anything yet —
  // used to warn before a close/Escape would silently drop their work.
  const [savedSnapshot, setSavedSnapshot] = useState<string>(
    JSON.stringify(defaultFormData),
  );
  // Which fields were pre-filled from the timetable rather than typed by the
  // teacher — surfaced as a small "from timetable" hint so it's clear these
  // values are a suggestion, not something already saved.
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(
    new Set(),
  );
  // Turns on inline "Required" messaging — deliberately withheld until the
  // teacher actually tries to save, so opening the modal never greets them
  // with a wall of red.
  const [attemptedSave, setAttemptedSave] = useState(false);

  // Only ever fills gaps — never overwrites a value the teacher (or a saved
  // plan) already has, whether that's real data or something typed a moment
  // ago and not yet saved.
  const withTimetableDefaults = (
    data: Partial<LessonPlan>,
  ): { data: Partial<LessonPlan>; filled: Set<string> } => {
    const filled = new Set<string>();
    if (!weekdayDefaults || !data.lesson_date) return { data, filled };

    const [y, m, d] = data.lesson_date.split("-").map(Number);
    const weekday = new Date(y, (m || 1) - 1, d || 1).getDay();
    const slot = weekdayDefaults[weekday];
    const next = { ...data };

    if (slot) {
      if (!next.start_time) {
        next.start_time = slot.start_time;
        filled.add("start_time");
      }
      if (!next.end_time) {
        next.end_time = slot.end_time;
        filled.add("end_time");
      }
      if (!next.class_name && slot.class_name) {
        next.class_name = slot.class_name;
        filled.add("class_name");
      }
    }
    if (!next.instructor_name && instructorName) {
      next.instructor_name = instructorName;
      filled.add("instructor_name");
    }
    return { data: next, filled };
  };

  useEffect(() => {
    if (initialData) {
      // Merge initialData with defaultFormData to ensure all required fields exist
      const merged = { ...defaultFormData, ...initialData, entry_id: entryId };
      // Only worth auto-filling for a plan that isn't saved yet — an
      // existing plan's own recorded time slot always wins.
      const { data: withDefaults, filled } = merged.id
        ? { data: merged, filled: new Set<string>() }
        : withTimetableDefaults(merged);
      setFormData(withDefaults);
      setAutoFilledFields(filled);
      setSavedSnapshot(JSON.stringify(withDefaults));
      setMode("manual");
    } else {
      const { data: fresh, filled } = withTimetableDefaults({
        ...defaultFormData,
        entry_id: entryId,
      });
      setFormData(fresh);
      setAutoFilledFields(filled);
      setSavedSnapshot(JSON.stringify(fresh));
      setMode("choose");
    }
    setActiveTab("Header");
    setAttemptedSave(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData, entryId, isOpen]);

  const isDirty = mode === "manual" && JSON.stringify(formData) !== savedSnapshot;

  // A close request (backdrop click, X button, Escape) checks for unsaved
  // work first — losing a half-written lesson plan silently is the single
  // most frustrating thing this modal could do to a teacher.
  const requestClose = useCallback(() => {
    if (isDirty && !window.confirm("You have unsaved changes. Discard them?")) {
      return;
    }
    onClose();
  }, [isDirty, onClose]);

  // Esc closes (with the unsaved-changes guard); Cmd/Ctrl+S saves without
  // needing to reach for the sidebar button.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        if (mode === "manual") {
          e.preventDefault();
          handleSave();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, requestClose, mode, formData]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Once a teacher edits an auto-filled field it's their value now — drop
    // the "from timetable" hint so it doesn't look stale.
    setAutoFilledFields((prev) => {
      if (!prev.has(name)) return prev;
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
  };

  const handleOutcomeChange = (index: number, field: string, value: any) => {
    setFormData((prev: Partial<LessonPlan>) => {
      const outcomes = [...(prev.outcomes || [])];
      outcomes[index] = { ...outcomes[index], [field]: value };
      return { ...prev, outcomes };
    });
  };

  const addOutcome = () => {
    setFormData((prev: Partial<LessonPlan>) => ({
      ...prev,
      outcomes: [
        ...(prev.outcomes || []),
        {
          code: `LO${(prev.outcomes?.length || 0) + 1}`,
          title: "",
          description: "",
          duration_minutes: 0,
          activities: [{ trainer_activities: "", learner_activities: "" }],
          resources: [{ resource_name: "" }],
        },
      ],
    }));
  };

  const removeOutcome = (index: number) => {
    setFormData((prev: Partial<LessonPlan>) => ({
      ...prev,
      outcomes: (prev.outcomes || []).filter((_, i) => i !== index),
    }));
  };

  const handleSectionChange = (
    type: "Introduction" | "Development" | "Conclusion",
    field: string,
    value: any,
  ) => {
    setFormData((prev: Partial<LessonPlan>) => {
      const sections = [...(prev.sections || [])];
      const idx = sections.findIndex((s) => s.section_type === type);
      if (idx !== -1) {
        sections[idx] = { ...sections[idx], [field]: value };
      } else {
        sections.push({
          section_type: type,
          trainer_activities: "",
          learner_activities: "",
          resources: "",
          duration_minutes: 0,
          ...({ [field]: value } as any),
        });
      }
      return { ...prev, sections };
    });
  };

  const addIndicativeContent = () => {
    setFormData((prev: Partial<LessonPlan>) => ({
      ...prev,
      indicativeContent: [
        ...(prev.indicativeContent || []),
        { category: "", content: "" },
      ],
    }));
  };

  const removeIndicativeContent = (index: number) => {
    setFormData((prev: Partial<LessonPlan>) => ({
      ...prev,
      indicativeContent: (prev.indicativeContent || []).filter(
        (_, i) => i !== index,
      ),
    }));
  };

  const addAssignment = () => {
    setFormData((prev: Partial<LessonPlan>) => ({
      ...prev,
      assignments: [...(prev.assignments || []), { description: "" }],
    }));
  };

  const removeAssignment = (index: number) => {
    setFormData((prev: Partial<LessonPlan>) => ({
      ...prev,
      assignments: (prev.assignments || []).filter((_, i) => i !== index),
    }));
  };

  // Sections a plan can't be finalized without. Footer (notes/sign-off) and
  // Preview are left out on purpose — useful, but not blocking.
  const requiredTabs: TabType[] = [
    "Header",
    "Objectives",
    "Introduction",
    "Development",
    "Conclusion",
  ];

  const handleSave = async () => {
    const missing = requiredTabs.filter((t) => !isTabComplete(t));
    if (missing.length > 0) {
      setAttemptedSave(true);
      setActiveTab(missing[0]);
      showToast(
        `Please complete before saving: ${missing.join(", ")}`,
        "error",
      );
      return;
    }

    setLoading(true);
    try {
      await lessonPlanApi.save({
        ...formData,
        entry_id: entryId,
      } as LessonPlan);
      showToast(
        initialData ? "Lesson plan updated" : "Lesson plan created",
        "success",
      );
      onSaved();
      onClose();
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to save lesson plan",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!initialData?.id) return;
    if (!window.confirm("Are you sure you want to delete this lesson plan?"))
      return;

    setLoading(true);
    try {
      await lessonPlanApi.delete(initialData.id);
      showToast("Lesson plan deleted", "success");
      onSaved();
      onClose();
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to delete lesson plan",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const resp = await lessonPlanApi.extract(file);
      if (resp.data.success && resp.data.data) {
        setFormData((prev: Partial<LessonPlan>) => ({
          ...prev,
          ...resp.data.data,
        }));
        showToast("Content extracted successfully!", "success");
        setMode("manual");
        setActiveTab("Preview");
      }
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to extract lesson plan",
        "error",
      );
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const tabs: TabType[] = [
    "Header",
    "Objectives",
    "Introduction",
    "Development",
    "Conclusion",
    "Footer",
    "Preview",
  ];

  // Shared validation helpers — surfaced only after a save attempt, so
  // opening the modal never front-loads a wall of red before the teacher has
  // typed anything.
  const showRequiredError = (value: unknown) => attemptedSave && !value;
  const requiredFieldClass = (invalid: boolean) =>
    invalid
      ? "border-red-300 dark:border-red-800 focus:ring-2 focus:ring-red-500/40 focus:border-red-500 bg-red-50/50 dark:bg-red-950/10"
      : "";
  const RequiredHint = ({ show }: { show: boolean }) =>
    show ? (
      <p className="flex items-center gap-1 text-[11px] font-semibold text-red-500 dark:text-red-400 mt-1">
        <AlertCircle className="w-3 h-3" /> Required
      </p>
    ) : null;

  // The banner every section shows once it's incomplete: amber before a save
  // attempt (a gentle heads-up), red after one (something blocked the save).
  const SectionBanner = ({ tab, message }: { tab: TabType; message: string }) =>
    !isTabComplete(tab) ? (
      <div
        className={`flex items-center gap-2 text-xs rounded-xl px-4 py-2.5 border ${
          attemptedSave
            ? "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30"
            : "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30"
        }`}
      >
        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
        {message}
      </div>
    ) : null;

  const renderTabContent = () => {
    switch (activeTab) {
      case "Header": {
        const baseField =
          "w-full bg-gray-50 dark:bg-gray-900 border rounded-xl pl-9 pr-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 hover:border-gray-200 dark:hover:border-gray-600 transition-all";
        const okBorder =
          "border-gray-100 dark:border-gray-700 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500";
        const errBorder =
          "border-red-300 dark:border-red-800 focus:ring-red-500/40 focus:border-red-500 bg-red-50/50 dark:bg-red-950/10";
        const fieldClass = (invalid: boolean) =>
          `${baseField} ${invalid ? errBorder : okBorder}`;
        const showError = (value: unknown) =>
          attemptedSave && !value;

        const FieldIcon = ({ children }: { children: React.ReactNode }) => (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            {children}
          </span>
        );
        const AutoBadge = ({ field }: { field: string }) =>
          autoFilledFields.has(field) ? (
            <span
              className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded-full"
              title="Pre-filled from your timetable — edit if this lesson differs"
            >
              <CalendarDays className="w-2.5 h-2.5" />
              From timetable
            </span>
          ) : null;
        const RequiredHint = ({ show }: { show: boolean }) =>
          show ? (
            <p className="flex items-center gap-1 text-[11px] font-semibold text-red-500 dark:text-red-400">
              <AlertCircle className="w-3 h-3" /> Required
            </p>
          ) : null;

        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
            {Object.keys(weekdayDefaults || {}).length > 0 && autoFilledFields.size > 0 && (
              <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl px-4 py-2.5">
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                Time slot and class details were pre-filled from this subject's timetable — adjust anything that's different for this lesson.
              </div>
            )}

            {/* Schedule */}
            <div className="p-5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-900/20">
              <h3 className="flex items-center gap-2 text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                <CalendarDays className="w-3.5 h-3.5 text-blue-500" />
                Schedule
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">
                    Lesson Date <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <FieldIcon>
                      <CalendarDays className="w-4 h-4" />
                    </FieldIcon>
                    <input
                      type="date"
                      name="lesson_date"
                      value={formData.lesson_date || ""}
                      onChange={handleChange}
                      required
                      className={fieldClass(showError(formData.lesson_date))}
                    />
                  </div>
                  <RequiredHint show={showError(formData.lesson_date)} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">
                      Time Slot <span className="text-red-400">*</span>
                    </label>
                    <AutoBadge field="start_time" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <FieldIcon>
                        <Timer className="w-4 h-4" />
                      </FieldIcon>
                      <input
                        type="time"
                        name="start_time"
                        value={formData.start_time || ""}
                        onChange={handleChange}
                        required
                        className={fieldClass(showError(formData.start_time))}
                      />
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-700 flex-shrink-0" />
                    <div className="relative flex-1">
                      <FieldIcon>
                        <Timer className="w-4 h-4" />
                      </FieldIcon>
                      <input
                        type="time"
                        name="end_time"
                        value={formData.end_time || ""}
                        onChange={handleChange}
                        required
                        className={fieldClass(showError(formData.end_time))}
                      />
                    </div>
                  </div>
                  <RequiredHint
                    show={showError(formData.start_time) || showError(formData.end_time)}
                  />
                </div>
              </div>
            </div>

            {/* Class & Instructor */}
            <div className="p-5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-900/20">
              <h3 className="flex items-center gap-2 text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                <GraduationCap className="w-3.5 h-3.5 text-blue-500" />
                Class &amp; Instructor
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">
                    Sector
                  </label>
                  <div className="relative">
                    <FieldIcon>
                      <BookOpen className="w-4 h-4" />
                    </FieldIcon>
                    <input
                      type="text"
                      name="sector"
                      placeholder="e.g. ICT"
                      value={formData.sector || ""}
                      onChange={handleChange}
                      className={fieldClass(false)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">
                    Trade
                  </label>
                  <div className="relative">
                    <FieldIcon>
                      <Target className="w-4 h-4" />
                    </FieldIcon>
                    <input
                      type="text"
                      name="trade"
                      placeholder="e.g. Software Development"
                      value={formData.trade || ""}
                      onChange={handleChange}
                      className={fieldClass(false)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">
                      Instructor Name
                    </label>
                    <AutoBadge field="instructor_name" />
                  </div>
                  <div className="relative">
                    <FieldIcon>
                      <UserRound className="w-4 h-4" />
                    </FieldIcon>
                    <input
                      type="text"
                      name="instructor_name"
                      placeholder="Your name"
                      value={formData.instructor_name || ""}
                      onChange={handleChange}
                      className={fieldClass(false)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">
                      Class Name
                    </label>
                    <AutoBadge field="class_name" />
                  </div>
                  <div className="relative">
                    <FieldIcon>
                      <Users className="w-4 h-4" />
                    </FieldIcon>
                    <input
                      type="text"
                      name="class_name"
                      placeholder="e.g. L3 Class A"
                      value={formData.class_name || ""}
                      onChange={handleChange}
                      className={fieldClass(false)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <SectionBanner
              tab="Header"
              message="Date and time slot are required before this plan can be finalized."
            />
          </div>
        );
      }
      case "Objectives":
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase">
                Big Question <span className="text-red-400">*</span>
              </label>
              <textarea
                name="big_question"
                value={formData.big_question || ""}
                onChange={handleChange}
                rows={2}
                className={`w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500 hover:border-gray-200 dark:hover:border-gray-600 transition-all ${requiredFieldClass(showRequiredError(formData.big_question))}`}
              />
              <RequiredHint show={showRequiredError(formData.big_question)} />
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-400 uppercase">
                  Learning Outcomes
                </label>
                <button
                  onClick={addOutcome}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700"
                >
                  + Add Outcome
                </button>
              </div>
              {formData.outcomes?.map((outcome, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 space-y-3 relative group"
                >
                  <button
                    onClick={() => removeOutcome(idx)}
                    className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="grid grid-cols-4 gap-2">
                    <input
                      type="text"
                      placeholder="Code (LO1)"
                      value={outcome.code}
                      onChange={(e) =>
                        handleOutcomeChange(idx, "code", e.target.value)
                      }
                      className="bg-transparent border-b border-gray-200 dark:border-gray-700 px-2 py-1 text-xs font-bold text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
                    />
                    <input
                      type="text"
                      placeholder="Title"
                      value={outcome.title}
                      onChange={(e) =>
                        handleOutcomeChange(idx, "title", e.target.value)
                      }
                      className="col-span-2 bg-transparent border-b border-gray-200 dark:border-gray-700 px-2 py-1 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
                    />
                    <input
                      type="number"
                      placeholder="Mins"
                      value={outcome.duration_minutes}
                      onChange={(e) =>
                        handleOutcomeChange(
                          idx,
                          "duration_minutes",
                          parseInt(e.target.value) || 0,
                        )
                      }
                      className="bg-transparent border-b border-gray-200 dark:border-gray-700 px-2 py-1 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <textarea
                    placeholder="Description"
                    value={outcome.description}
                    onChange={(e) =>
                      handleOutcomeChange(idx, "description", e.target.value)
                    }
                    rows={2}
                    className="w-full bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg p-2 text-xs text-gray-900 dark:text-gray-100"
                  />

                  {/* Resources for this outcome */}
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Resources
                      </label>
                      <button
                        onClick={() => {
                          const newOutcomes = [...(formData.outcomes || [])];
                          newOutcomes[idx].resources = [
                            ...(newOutcomes[idx].resources || []),
                            { resource_name: "" },
                          ];
                          setFormData((prev) => ({
                            ...prev,
                            outcomes: newOutcomes,
                          }));
                        }}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-700"
                      >
                        + Add Resource
                      </button>
                    </div>
                    <div className="space-y-1">
                      {outcome.resources?.map((resource, resIdx) => (
                        <div
                          key={resIdx}
                          className="flex gap-2 group items-center"
                        >
                          <input
                            type="text"
                            placeholder="Resource name (e.g., Whiteboard, Laptop)"
                            value={resource.resource_name}
                            onChange={(e) => {
                              const newOutcomes = [
                                ...(formData.outcomes || []),
                              ];
                              newOutcomes[idx].resources[resIdx].resource_name =
                                e.target.value;
                              setFormData((prev) => ({
                                ...prev,
                                outcomes: newOutcomes,
                              }));
                            }}
                            className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500 hover:border-gray-200 dark:hover:border-gray-600 transition-all"
                          />
                          <button
                            onClick={() => {
                              const newOutcomes = [
                                ...(formData.outcomes || []),
                              ];
                              newOutcomes[idx].resources = newOutcomes[
                                idx
                              ].resources.filter((_, i) => i !== resIdx);
                              setFormData((prev) => ({
                                ...prev,
                                outcomes: newOutcomes,
                              }));
                            }}
                            className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <SectionBanner
              tab="Objectives"
              message="A big question and at least one titled learning outcome are required."
            />
          </div>
        );
      case "Introduction":
        const intro = formData.sections?.find(
          (s) => s.section_type === "Introduction",
        ) || {
          trainer_activities: "",
          learner_activities: "",
          resources: "",
          duration_minutes: 0,
        };
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">
                  Trainer Activities <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={intro.trainer_activities}
                  onChange={(e) =>
                    handleSectionChange(
                      "Introduction",
                      "trainer_activities",
                      e.target.value,
                    )
                  }
                  rows={6}
                  className={`w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500 hover:border-gray-200 dark:hover:border-gray-600 transition-all ${requiredFieldClass(showRequiredError(intro.trainer_activities))}`}
                />
                <RequiredHint show={showRequiredError(intro.trainer_activities)} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">
                  Learner Activities <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={intro.learner_activities}
                  onChange={(e) =>
                    handleSectionChange(
                      "Introduction",
                      "learner_activities",
                      e.target.value,
                    )
                  }
                  rows={6}
                  className={`w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500 hover:border-gray-200 dark:hover:border-gray-600 transition-all ${requiredFieldClass(showRequiredError(intro.learner_activities))}`}
                />
                <RequiredHint show={showRequiredError(intro.learner_activities)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">
                  Resources
                </label>
                <input
                  type="text"
                  value={intro.resources}
                  onChange={(e) =>
                    handleSectionChange(
                      "Introduction",
                      "resources",
                      e.target.value,
                    )
                  }
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500 hover:border-gray-200 dark:hover:border-gray-600 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">
                  Duration (mins)
                </label>
                <input
                  type="number"
                  value={intro.duration_minutes}
                  onChange={(e) =>
                    handleSectionChange(
                      "Introduction",
                      "duration_minutes",
                      parseInt(e.target.value) || 0,
                    )
                  }
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500 hover:border-gray-200 dark:hover:border-gray-600 transition-all"
                />
              </div>
            </div>
            <SectionBanner
              tab="Introduction"
              message="Trainer and learner activities are required for this section."
            />
          </div>
        );
      case "Development":
        const dev = formData.sections?.find(
          (s) => s.section_type === "Development",
        ) || {
          trainer_activities: "",
          learner_activities: "",
          resources: "",
          duration_minutes: 0,
        };
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">
                  Trainer Activities <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={dev.trainer_activities}
                  onChange={(e) =>
                    handleSectionChange(
                      "Development",
                      "trainer_activities",
                      e.target.value,
                    )
                  }
                  rows={6}
                  className={`w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500 hover:border-gray-200 dark:hover:border-gray-600 transition-all ${requiredFieldClass(showRequiredError(dev.trainer_activities))}`}
                />
                <RequiredHint show={showRequiredError(dev.trainer_activities)} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">
                  Learner Activities <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={dev.learner_activities}
                  onChange={(e) =>
                    handleSectionChange(
                      "Development",
                      "learner_activities",
                      e.target.value,
                    )
                  }
                  rows={6}
                  className={`w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500 hover:border-gray-200 dark:hover:border-gray-600 transition-all ${requiredFieldClass(showRequiredError(dev.learner_activities))}`}
                />
                <RequiredHint show={showRequiredError(dev.learner_activities)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">
                  Resources
                </label>
                <input
                  type="text"
                  value={dev.resources}
                  onChange={(e) =>
                    handleSectionChange(
                      "Development",
                      "resources",
                      e.target.value,
                    )
                  }
                  className="w-full h-11 px-5 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-full text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500 hover:border-gray-200 dark:hover:border-gray-600 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">
                  Duration (mins)
                </label>
                <input
                  type="number"
                  value={dev.duration_minutes}
                  onChange={(e) =>
                    handleSectionChange(
                      "Development",
                      "duration_minutes",
                      parseInt(e.target.value) || 0,
                    )
                  }
                  className="w-full h-11 px-5 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-full text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500 hover:border-gray-200 dark:hover:border-gray-600 transition-all"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-gray-400 uppercase">
                  Indicative Content
                </label>
                <button
                  onClick={addIndicativeContent}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700"
                >
                  + Add Content
                </button>
              </div>
              <div className="space-y-2">
                {formData.indicativeContent?.map((item, idx) => (
                  <div key={idx} className="flex gap-2 group items-start">
                    <input
                      type="text"
                      placeholder="Category (e.g. Tools)"
                      value={item.category}
                      onChange={(e) => {
                        const newList = [...(formData.indicativeContent || [])];
                        newList[idx].category = e.target.value;
                        setFormData((prev: Partial<LessonPlan>) => ({
                          ...prev,
                          indicativeContent: newList,
                        }));
                      }}
                      className="w-1/3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-1.5 text-xs font-bold text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500 hover:border-gray-200 dark:hover:border-gray-600 transition-all"
                    />
                    <textarea
                      placeholder="Content"
                      value={item.content}
                      onChange={(e) => {
                        const newList = [...(formData.indicativeContent || [])];
                        newList[idx].content = e.target.value;
                        setFormData((prev: Partial<LessonPlan>) => ({
                          ...prev,
                          indicativeContent: newList,
                        }));
                      }}
                      rows={1}
                      className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500 hover:border-gray-200 dark:hover:border-gray-600 transition-all"
                    />
                    <button
                      onClick={() => removeIndicativeContent(idx)}
                      className="p-1.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs text-gray-500 italic pb-2">
                Detailed activities for each learning outcome are managed here.
              </p>
              {formData.outcomes?.map((outcome, idx) => (
                <div
                  key={idx}
                  className="space-y-2 p-4 bg-gray-50/50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700 mb-4"
                >
                  <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">
                    {outcome.code}: {outcome.title}
                  </h4>
                  <div className="space-y-3">
                    {outcome.activities.map((act, actIdx) => (
                      <div key={actIdx} className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            Trainer Activity
                          </span>
                          <textarea
                            placeholder="What the trainer does..."
                            value={act.trainer_activities}
                            onChange={(e) => {
                              const newOutcomes = [
                                ...(formData.outcomes || []),
                              ];
                              newOutcomes[idx].activities[
                                actIdx
                              ].trainer_activities = e.target.value;
                              setFormData((prev: Partial<LessonPlan>) => ({
                                ...prev,
                                outcomes: newOutcomes,
                              }));
                            }}
                            className="w-full bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-3 text-xs leading-relaxed text-gray-900 dark:text-gray-100"
                            rows={3}
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            Learner Activity
                          </span>
                          <textarea
                            placeholder="What the learners do..."
                            value={act.learner_activities}
                            onChange={(e) => {
                              const newOutcomes = [
                                ...(formData.outcomes || []),
                              ];
                              newOutcomes[idx].activities[
                                actIdx
                              ].learner_activities = e.target.value;
                              setFormData((prev: Partial<LessonPlan>) => ({
                                ...prev,
                                outcomes: newOutcomes,
                              }));
                            }}
                            className="w-full bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-3 text-xs leading-relaxed text-gray-900 dark:text-gray-100"
                            rows={3}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <SectionBanner
              tab="Development"
              message="Trainer and learner activities are required for this section."
            />
          </div>
        );
      case "Conclusion":
        const conc = formData.sections?.find(
          (s) => s.section_type === "Conclusion",
        ) || {
          trainer_activities: "",
          learner_activities: "",
          resources: "",
          duration_minutes: 0,
        };
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">
                  Trainer Activities <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={conc.trainer_activities}
                  onChange={(e) =>
                    handleSectionChange(
                      "Conclusion",
                      "trainer_activities",
                      e.target.value,
                    )
                  }
                  rows={6}
                  className={`w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500 hover:border-gray-200 dark:hover:border-gray-600 transition-all ${requiredFieldClass(showRequiredError(conc.trainer_activities))}`}
                />
                <RequiredHint show={showRequiredError(conc.trainer_activities)} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">
                  Learner Activities <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={conc.learner_activities}
                  onChange={(e) =>
                    handleSectionChange(
                      "Conclusion",
                      "learner_activities",
                      e.target.value,
                    )
                  }
                  rows={6}
                  className={`w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500 hover:border-gray-200 dark:hover:border-gray-600 transition-all ${requiredFieldClass(showRequiredError(conc.learner_activities))}`}
                />
                <RequiredHint show={showRequiredError(conc.learner_activities)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">
                  Resources
                </label>
                <input
                  type="text"
                  value={conc.resources}
                  onChange={(e) =>
                    handleSectionChange(
                      "Conclusion",
                      "resources",
                      e.target.value,
                    )
                  }
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500 hover:border-gray-200 dark:hover:border-gray-600 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">
                  Duration (mins)
                </label>
                <input
                  type="number"
                  value={conc.duration_minutes}
                  onChange={(e) =>
                    handleSectionChange(
                      "Conclusion",
                      "duration_minutes",
                      parseInt(e.target.value) || 0,
                    )
                  }
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500 hover:border-gray-200 dark:hover:border-gray-600 transition-all"
                />
              </div>
            </div>

            <SectionBanner
              tab="Conclusion"
              message="Trainer and learner activities are required for this section."
            />
          </div>
        );
      case "Footer":
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-gray-400 uppercase">
                  Assignments / Homework
                </label>
                <button
                  onClick={addAssignment}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700"
                >
                  + Add Assignment
                </button>
              </div>
              <div className="space-y-2">
                {formData.assignments?.map((item, idx) => (
                  <div key={idx} className="flex gap-2 group items-start">
                    <textarea
                      placeholder="Assignment description..."
                      value={item.description}
                      onChange={(e) => {
                        const newList = [...(formData.assignments || [])];
                        newList[idx].description = e.target.value;
                        setFormData((prev: Partial<LessonPlan>) => ({
                          ...prev,
                          assignments: newList,
                        }));
                      }}
                      rows={1}
                      className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500 hover:border-gray-200 dark:hover:border-gray-600 transition-all"
                    />
                    <button
                      onClick={() => removeAssignment(idx)}
                      className="p-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase">
                Teacher Notes / Evaluation
              </label>
              <textarea
                value={formData.evaluation?.teacher_notes || ""}
                onChange={(e) =>
                  setFormData((prev: Partial<LessonPlan>) => ({
                    ...prev,
                    evaluation: {
                      ...(prev.evaluation || {
                        teacher_notes: "",
                        prepared_by: "",
                        verified_by: "",
                        references: "",
                      }),
                      teacher_notes: e.target.value,
                    } as any,
                  }))
                }
                rows={4}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500 hover:border-gray-200 dark:hover:border-gray-600 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase">
                References
              </label>
              <textarea
                value={formData.evaluation?.references || ""}
                onChange={(e) =>
                  setFormData((prev: Partial<LessonPlan>) => ({
                    ...prev,
                    evaluation: {
                      ...(prev.evaluation || {
                        teacher_notes: "",
                        prepared_by: "",
                        verified_by: "",
                        references: "",
                      }),
                      references: e.target.value,
                    } as any,
                  }))
                }
                rows={2}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500 hover:border-gray-200 dark:hover:border-gray-600 transition-all"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase">
                  Prepared By
                </label>
                <input
                  type="text"
                  placeholder="Instructor Name"
                  value={formData.evaluation?.prepared_by || ""}
                  onChange={(e) =>
                    setFormData((prev: Partial<LessonPlan>) => ({
                      ...prev,
                      evaluation: {
                        ...(prev.evaluation || {
                          teacher_notes: "",
                          prepared_by: "",
                          verified_by: "",
                          references: "",
                        }),
                        prepared_by: e.target.value,
                      } as any,
                    }))
                  }
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500 hover:border-gray-200 dark:hover:border-gray-600 transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase">
                  Verified By
                </label>
                <input
                  type="text"
                  placeholder="School Manager"
                  value={formData.evaluation?.verified_by || ""}
                  onChange={(e) =>
                    setFormData((prev: Partial<LessonPlan>) => ({
                      ...prev,
                      evaluation: {
                        ...(prev.evaluation || {
                          teacher_notes: "",
                          prepared_by: "",
                          verified_by: "",
                          references: "",
                        }),
                        verified_by: e.target.value,
                      } as any,
                    }))
                  }
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:border-blue-500 hover:border-gray-200 dark:hover:border-gray-600 transition-all"
                />
              </div>
            </div>
          </div>
        );
      case "Preview":
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-2 pb-10">
            <div className="bg-blue-600 text-white p-6 rounded-3xl space-y-2 shadow-xl shadow-blue-500/20">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tight">
                    {formData.lesson_date
                      ? new Date(formData.lesson_date).toLocaleDateString(
                          "en-GB",
                          {
                            weekday: "long",
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          },
                        )
                      : "Draft Date"}
                  </h3>
                  <p className="opacity-80 font-bold text-sm">
                    {formData.start_time} - {formData.end_time} •{" "}
                    {formData.sector}
                  </p>
                </div>
                <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
                  <FileText className="w-6 h-6" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-6">
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">
                    The Big Question
                  </h4>
                  <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 italic text-sm text-gray-700 dark:text-gray-300">
                    "{formData.big_question}"
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-green-600 uppercase tracking-[0.2em]">
                    Learning Outcomes
                  </h4>
                  <div className="space-y-2">
                    {formData.outcomes?.map((out, i) => (
                      <div
                        key={i}
                        className="bg-white dark:bg-gray-950 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 flex gap-4"
                      >
                        <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-600 font-bold text-xs shrink-0">
                          {out.code}
                        </div>
                        <div>
                          <p className="font-black text-xs text-gray-900 dark:text-white uppercase mb-1">
                            {out.title}
                          </p>
                          <p className="text-xs text-gray-500 leading-relaxed">
                            {out.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-purple-600 uppercase tracking-[0.2em]">
                    Indicative Content
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {formData.indicativeContent?.map((ic, i) => (
                      <div
                        key={i}
                        className="p-3 bg-purple-500/5 dark:bg-purple-500/10 rounded-xl border border-purple-500/10 flex justify-between items-center"
                      >
                        <span className="text-[10px] font-black text-purple-600 uppercase">
                          {ic.category}
                        </span>
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                          {ic.content}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-orange-600 uppercase tracking-[0.2em]">
                    Lesson Flow
                  </h4>
                  <div className="space-y-3">
                    {formData.sections?.map((s, i) => (
                      <div
                        key={i}
                        className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-2"
                      >
                        <div className="flex justify-between items-center pb-2 border-b border-gray-100 dark:border-gray-800">
                          <span className="text-xs font-black text-orange-600 uppercase tracking-wider">
                            {s.section_type}
                          </span>
                          <span className="text-[10px] font-bold text-gray-400">
                            {s.duration_minutes} min
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-1">
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">
                              Trainer
                            </p>
                            <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-3">
                              {s.trainer_activities || "---"}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">
                              Learner
                            </p>
                            <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-3">
                              {s.learner_activities || "---"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const getIcon = (tab: TabType) => {
    switch (tab) {
      case "Header":
        return <Layout className="w-4 h-4" />;
      case "Objectives":
        return <Target className="w-4 h-4" />;
      case "Introduction":
        return <Clock className="w-4 h-4" />;
      case "Development":
        return <BookOpen className="w-4 h-4" />;
      case "Conclusion":
        return <CheckCircle className="w-4 h-4" />;
      case "Footer":
        return <ClipboardList className="w-4 h-4" />;
      case "Preview":
        return <FileText className="w-4 h-4" />;
    }
  };

  // Lightweight completion signal per section — lets the sidebar show a
  // teacher at a glance which parts of the plan still need attention instead
  // of them having to click through all seven tabs to find out. "Preview" is
  // a read-only summary, so it isn't part of the checklist.
  const sectionOf = (type: "Introduction" | "Development" | "Conclusion") =>
    formData.sections?.find((s) => s.section_type === type);

  const isTabComplete = (tab: TabType): boolean => {
    switch (tab) {
      case "Header":
        return !!(formData.lesson_date && formData.start_time && formData.end_time);
      case "Objectives":
        return !!(
          formData.big_question &&
          formData.outcomes &&
          formData.outcomes.length > 0 &&
          formData.outcomes.every((o) => o.title)
        );
      case "Introduction": {
        const s = sectionOf("Introduction");
        return !!(s?.trainer_activities && s?.learner_activities);
      }
      case "Development": {
        const s = sectionOf("Development");
        return !!(s?.trainer_activities && s?.learner_activities);
      }
      case "Conclusion": {
        const s = sectionOf("Conclusion");
        return !!(s?.trainer_activities && s?.learner_activities);
      }
      case "Footer":
        return !!formData.evaluation?.teacher_notes;
      case "Preview":
        return true;
    }
  };

  const checklistTabs = tabs.filter((t) => t !== "Preview");
  const completedCount = checklistTabs.filter(isTabComplete).length;
  const progressPct = Math.round((completedCount / checklistTabs.length) * 100);

  const goToStep = (delta: 1 | -1) => {
    const idx = tabs.indexOf(activeTab);
    const next = tabs[idx + delta];
    if (next) setActiveTab(next);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity animate-in fade-in duration-300"
        onClick={requestClose}
      />

      {/* Modal Container */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-6xl bg-white dark:bg-gray-950 rounded-2xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800 animate-in zoom-in-95 duration-300">
          {/* Header */}
          <div className="px-5 py-4 flex items-center justify-between border-b border-gray-50 dark:border-gray-900 bg-white dark:bg-gray-950">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <LayoutDashboard className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  {initialData
                    ? "Refine Lesson Plan"
                    : mode === "ai"
                      ? "Generate Lesson Plan with AI"
                      : mode === "choose"
                        ? "New Lesson Plan"
                        : "Draft New Lesson Plan"}
                  {isDirty && (
                    <span
                      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full"
                      title="Unsaved changes — Cmd/Ctrl+S to save"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      Unsaved
                    </span>
                  )}
                </h2>
                <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 mt-0.5">
                  {entryWeekLabel ? `${entryWeekLabel} · ` : ""}Step-by-step curriculum planning
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {mode === "manual" && (
                <button
                  onClick={() => setMode("ai")}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 hover:bg-violet-100 dark:bg-violet-900/20 dark:hover:bg-violet-900/40 text-violet-600 dark:text-violet-400 rounded-full text-xs font-semibold border border-violet-100 dark:border-violet-900/40 transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate with AI
                </button>
              )}
              {mode === "manual" && (
                <label
                  className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full text-xs font-semibold border border-gray-100 dark:border-gray-800 transition-all ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {loading ? (
                    <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <UploadCloud className="w-3.5 h-3.5" />
                  )}
                  {loading ? "Importing..." : "Import DOCX"}
                  <input
                    type="file"
                    accept=".docx"
                    className="hidden"
                    onChange={handleFileSelect}
                    disabled={loading}
                  />
                </label>
              )}
              <button
                onClick={requestClose}
                title="Close (Esc)"
                className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 text-gray-400 hover:text-red-500 rounded-full transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {mode === "choose" && (
            <div className="h-[75vh] overflow-y-auto flex items-center justify-center p-8">
              <div className="w-full max-w-3xl">
                <input
                  ref={chooseFileInputRef}
                  type="file"
                  accept=".docx"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    onClick={() => setMode("manual")}
                    className="relative group text-left p-5 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 hover:-translate-y-0.5 transition-all overflow-hidden"
                  >
                    <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center mb-3">
                      <PenLine className="w-4 h-4 text-white" />
                    </div>
                    <h4 className="text-sm font-bold mb-1">Build Manually</h4>
                    <p className="text-xs text-white/80 leading-relaxed mb-3">
                      Fill out the full lesson plan yourself, section by section.
                    </p>
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      Open Editor <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </button>

                  <button
                    onClick={() => setMode("ai")}
                    className="relative group text-left p-5 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-lg shadow-violet-600/25 hover:shadow-violet-600/40 hover:-translate-y-0.5 transition-all overflow-hidden"
                  >
                    <div className="absolute top-2.5 right-2.5 bg-white/20 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                      New
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center mb-3">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <h4 className="text-sm font-bold mb-1">Generate with AI</h4>
                    <p className="text-xs text-white/80 leading-relaxed mb-3">
                      AI acts as your subject teacher and builds the full lesson plan from this week's scheme entry.
                    </p>
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      Generate Now <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </button>

                  <button
                    onClick={() => chooseFileInputRef.current?.click()}
                    className="group text-left p-5 rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md hover:-translate-y-0.5 transition-all"
                  >
                    <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-slate-800 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 flex items-center justify-center mb-3 transition-colors">
                      <CloudUpload className="w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
                    </div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-1">
                      Import from DOCX
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-3">
                      Already have a lesson plan file? Upload it and we'll extract the content.
                    </p>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
                      Upload File <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {mode === "ai" && (
            <div className="h-[75vh] overflow-y-auto flex items-center justify-center p-8">
              <LessonPlanAIGenerate
                entryId={entryId}
                lessonId={initialData?.id}
                weekLabel={entryWeekLabel}
                topic={entryTopic}
                lessonDate={formData.lesson_date}
                onComplete={() => {
                  onSaved();
                  onClose();
                }}
                onCancel={() => setMode(initialData ? "manual" : "choose")}
              />
            </div>
          )}

          {mode === "manual" && (
          <div className="flex flex-col lg:flex-row h-[75vh]">
            {/* Sidebar Navigation — a stepper, not just a tab list: a
                progress bar and per-section dots tell a teacher at a glance
                what's left before the plan is genuinely complete. */}
            <div className="w-full lg:w-56 flex flex-col bg-gray-50/50 dark:bg-gray-900/10 border-r border-gray-50 dark:border-gray-900">
              <div className="p-4 pb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Progress
                  </span>
                  <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                    {completedCount}/{checklistTabs.length}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 space-y-1">
                {tabs.map((tab) => {
                  const isActive = activeTab === tab;
                  const complete = tab !== "Preview" && isTabComplete(tab);
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                        isActive
                          ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
                          : "text-gray-500 hover:text-gray-800 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-white dark:hover:bg-gray-900/50"
                      }`}
                    >
                      {getIcon(tab)}
                      <span className="flex-1 text-left">{tab}</span>
                      {tab !== "Preview" &&
                        (complete ? (
                          <CheckCircle2
                            className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? "text-white" : "text-emerald-500"}`}
                          />
                        ) : (
                          <Circle
                            className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? "text-white/50" : "text-gray-300 dark:text-gray-700"}`}
                          />
                        ))}
                    </button>
                  );
                })}
              </div>

              {/* Sticky footer — always reachable regardless of how long the
                  step list gets or how far the user has scrolled it. */}
              <div className="p-4 pt-3 border-t border-gray-100 dark:border-gray-900 space-y-2">
                <button
                  onClick={handleSave}
                  disabled={loading}
                  title="Cmd/Ctrl+S"
                  className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-bold shadow-sm shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {loading
                    ? "Saving..."
                    : initialData
                      ? "Update Plan"
                      : "Finalize Draft"}
                </button>

                {initialData && (
                  <button
                    onClick={handleDelete}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-full text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
                  >
                    {!loading && <Trash2 className="w-3.5 h-3.5" />}
                    {loading && (
                      <div className="w-3.5 h-3.5 border-2 border-red-600 dark:border-red-400 border-t-transparent rounded-full animate-spin" />
                    )}
                    {loading ? "Deleting..." : "Delete Plan"}
                  </button>
                )}
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-950">
              <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-4xl mx-auto">{renderTabContent()}</div>
              </div>

              {/* Back/Continue — keeps the seven sections a linear walk
                  instead of forcing every step back out to the sidebar. */}
              <div className="flex items-center justify-between px-6 py-3 border-t border-gray-50 dark:border-gray-900 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm">
                <button
                  onClick={() => goToStep(-1)}
                  disabled={tabs.indexOf(activeTab) === 0}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-50 dark:hover:bg-gray-900 transition-all disabled:opacity-0 disabled:pointer-events-none"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
                <span className="text-[11px] font-medium text-gray-400 dark:text-gray-600">
                  Step {tabs.indexOf(activeTab) + 1} of {tabs.length}
                </span>
                <button
                  onClick={() => goToStep(1)}
                  disabled={tabs.indexOf(activeTab) === tabs.length - 1}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all disabled:opacity-0 disabled:pointer-events-none"
                >
                  Continue
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LessonPlanModal;
