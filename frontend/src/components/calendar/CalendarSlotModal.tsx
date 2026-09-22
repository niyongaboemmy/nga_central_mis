import React from "react";
import OpenLessonContentButton from "../elearning/learner/OpenLessonContentButton";
import { X, Clock, CalendarDays, Sparkles, Users } from "lucide-react";
import ActivityAssigneePicker, { assigneeLabel } from "./ActivityAssigneePicker";
import SubjectSelect from "../ui/SubjectSelect";
import { DAYS_FULL, backendDayToDisplay } from "./calendarConstants";
import { getSlotColor, readableTextColor } from "./slotColor";
import type {
  CalendarSlot,
  CalendarActivity,
  CalendarSetupData,
  ActivityAssignee,
} from "../../api/calendar";

interface FormData {
  class_group_id: string;
  subject_id: string;
  user_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  location: string;
}

interface FormErrors {
  subject_id?: string;
  day_of_week?: string;
  start_time?: string;
  end_time?: string;
}

export type EntryKind = "lesson" | "activity";

export interface ActivityFormData {
  activity_name: string;
  activity_type: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  location: string;
  description: string;
  color: string;
  /** Optional staff who run the activity. */
  assignees: ActivityAssignee[];
}

export interface ActivityFormErrors {
  activity_name?: string;
  activity_type?: string;
  day_of_week?: string;
  start_time?: string;
  end_time?: string;
}

/** Preset non-subject activity types (free text is still allowed). */
export const ACTIVITY_TYPES = [
  "Devotion",
  "Assembly",
  "Sports",
  "Club",
  "Exam",
  "Study Hall",
  "Office Hours",
  "Meeting",
  "Event",
  "Other",
];

/** Colour swatches offered for a custom activity. */
export const ACTIVITY_COLORS = [
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#6366F1",
  "#64748B",
];

interface CalendarSlotModalProps {
  showModal: boolean;
  selectedSlot: CalendarSlot | null;
  formData: FormData;
  formErrors: FormErrors;
  effectiveClassGroupId: number | null;
  setupData: CalendarSetupData | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onFormDataChange: (data: Partial<FormData>) => void;
  onErrorsChange: (errors: FormErrors) => void;
  onDelete: (id: number) => void;
  mode: "details" | "form";
  canEdit: boolean;
  canViewLessonPlan: boolean;
  onEditClick: () => void;
  onViewLessonPlan: (slot: CalendarSlot) => void;
  /** The calendar day the slot was opened on — lets the e-learning link resolve the right week. */
  selectedSlotDate?: Date | null;
  isSubmitting?: boolean;
  isDeleting?: boolean;
  isLoadingLessonPlan?: boolean;

  // ─── Custom activity (non-subject event) support ─────────────────────────
  /** Which kind of entry the create form is currently editing. */
  entryKind?: EntryKind;
  onEntryKindChange?: (kind: EntryKind) => void;
  /** Gates the Lesson/Activity toggle and activity edit/delete actions. */
  canManageActivities?: boolean;
  selectedActivity?: CalendarActivity | null;
  activityForm?: ActivityFormData;
  activityErrors?: ActivityFormErrors;
  onActivityFormChange?: (data: Partial<ActivityFormData>) => void;
  onActivityErrorsChange?: (errors: ActivityFormErrors) => void;
  onActivitySubmit?: (e: React.FormEvent) => void;
  onActivityDelete?: (id: number) => void;
}

/* ─── shared input classes ─────────────────────────────────────────────────── */
const inputCls = (hasError?: boolean) =>
  `w-full px-4 py-3 text-sm border-2 rounded-xl transition-all
   bg-gray-50 dark:bg-gray-700/60
   text-gray-900 dark:text-white
   placeholder-gray-400 dark:placeholder-gray-500
   focus:outline-none focus:ring-2 focus:ring-blue-500/30
   ${
     hasError
       ? "border-red-400 dark:border-red-500 focus:border-red-500"
       : "border-gray-200 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400"
   }`;

const labelCls =
  "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5";

/* ─── component ─────────────────────────────────────────────────────────────── */
const CalendarSlotModal: React.FC<CalendarSlotModalProps> = ({
  showModal,
  selectedSlot,
  formData,
  formErrors,
  effectiveClassGroupId,
  setupData,
  onClose,
  onSubmit,
  onFormDataChange,
  onErrorsChange,
  onDelete,
  mode,
  canEdit,
  onEditClick,
  onViewLessonPlan,
  canViewLessonPlan,
  selectedSlotDate,
  isSubmitting,
  isDeleting,
  isLoadingLessonPlan,
  entryKind = "lesson",
  onEntryKindChange,
  canManageActivities = false,
  selectedActivity = null,
  activityForm,
  activityErrors = {},
  onActivityFormChange,
  onActivityErrorsChange,
  onActivitySubmit,
  onActivityDelete,
}) => {
  if (!showModal) return null;

  const isEditing = Boolean(selectedSlot);
  const isEditingActivity = Boolean(selectedActivity);
  // The form is in "activity" shape when editing an existing activity, or when
  // the create toggle is set to Activity.
  const activityMode = isEditingActivity || entryKind === "activity";

  const af: ActivityFormData = activityForm ?? {
    assignees: [],
    activity_name: "",
    activity_type: "",
    day_of_week: "",
    start_time: "",
    end_time: "",
    location: "",
    description: "",
    color: ACTIVITY_COLORS[0],
  };

  const setAf = (data: Partial<ActivityFormData>) =>
    onActivityFormChange?.(data);

  // ─── Activity details view ────────────────────────────────────────────────
  if (mode === "details" && selectedActivity) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-gray-200/50 dark:border-gray-700/50">
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">
                  Activity Details
                </h3>
                <p className="text-xs text-white/70 mt-0.5">
                  Non-subject calendar event
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          <div className="p-8 space-y-6">
            <div className="flex items-start gap-4">
              <div
                className="w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center shadow-inner"
                style={{ backgroundColor: selectedActivity.color || "#10B981" }}
              >
                <div className="text-white font-bold text-xl">
                  {selectedActivity.activity_name?.charAt(0)}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                  {selectedActivity.activity_name}
                </h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {selectedActivity.activity_type}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 bg-gray-50 dark:bg-gray-800/40 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/50">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
                  Day
                </p>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-emerald-500" />
                  {selectedActivity.day_of_week != null
                    ? DAYS_FULL[backendDayToDisplay(selectedActivity.day_of_week)]
                    : "—"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
                  Location
                </p>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {selectedActivity.location || "—"}
                </p>
              </div>
              <div className="col-span-2 space-y-1 pt-2 border-t border-gray-200 dark:border-gray-700/50">
                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
                  Time Slot
                </p>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-500" />
                  {selectedActivity.start_time} — {selectedActivity.end_time}
                </p>
              </div>
              <div className="col-span-2 space-y-1 pt-2 border-t border-gray-200 dark:border-gray-700/50">
                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
                  Assigned to
                </p>
                {selectedActivity.assignees &&
                selectedActivity.assignees.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5" aria-label="Assigned staff">
                    {selectedActivity.assignees.map((u) => (
                      <li
                        key={u.user_id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 text-xs font-medium"
                      >
                        <Users className="w-3 h-3" />
                        {assigneeLabel(u)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Not assigned to anyone
                  </p>
                )}
              </div>
              {selectedActivity.description && (
                <div className="col-span-2 space-y-1 pt-2 border-t border-gray-200 dark:border-gray-700/50">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
                    Description
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-200">
                    {selectedActivity.description}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700/30 bg-gray-50 dark:bg-gray-800/30 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
            >
              Close
            </button>
            {canManageActivities && (
              <button
                type="button"
                onClick={onEditClick}
                className="px-6 py-2 text-sm font-medium bg-emerald-600 text-white rounded-full hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-all"
              >
                Edit Activity
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const handleSubjectChange = (value: string, classGroupId?: number) => {
    const parts = value.split("_");
    const userId = parts[1] || "";
    const cgId = classGroupId?.toString() || "";

    onFormDataChange({
      subject_id: value,
      user_id: userId,
      class_group_id: cgId,
    });
    onErrorsChange({ ...formErrors, subject_id: undefined });
  };

  const filteredSubjects = effectiveClassGroupId
    ? (setupData?.subjects || []).filter((subject) =>
        subject.teachers?.find(
          (t) =>
            t.class_group_id != null &&
            Number(t.class_group_id) === Number(effectiveClassGroupId),
        ),
      )
    : setupData?.subjects || [];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-gray-200/50 dark:border-gray-700/50">
        {/* ── Header ── */}
        <div
          className={`bg-gradient-to-r px-6 py-4 flex items-center justify-between ${
            activityMode
              ? "from-emerald-600 to-emerald-700"
              : "from-blue-600 to-blue-700"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              {activityMode ? (
                <Sparkles className="w-5 h-5 text-white" />
              ) : (
                <CalendarDays className="w-5 h-5 text-white" />
              )}
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                {activityMode
                  ? isEditingActivity
                    ? "Edit Activity"
                    : "Add Custom Activity"
                  : mode === "details"
                    ? "Lesson Details"
                    : isEditing
                      ? "Edit Schedule Slot"
                      : "Add New Schedule Slot"}
              </h3>
              <p className="text-xs text-white/70 mt-0.5">
                {activityMode
                  ? "A non-subject event on this time slot"
                  : mode === "details"
                    ? "View scheduled lesson info"
                    : isEditing
                      ? "Update or remove this slot"
                      : "Fill in the slot details below"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* ── Content ── */}
        {mode === "details" && selectedSlot ? (
          <div className="p-8 space-y-6">
            <div className="flex items-start gap-4">
              <div
                className="w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center shadow-inner"
                style={{ backgroundColor: getSlotColor(selectedSlot) }}
              >
                <div
                  className="font-bold text-xl"
                  style={{ color: readableTextColor(getSlotColor(selectedSlot)) }}
                >
                  {selectedSlot.subject_name?.charAt(0)}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                  {selectedSlot.subject_name}
                </h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  {selectedSlot.instructor_name || "Assigned Instructor"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 bg-gray-50 dark:bg-gray-800/40 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/50">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
                  Day
                </p>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-blue-500" />
                  {DAYS_FULL[backendDayToDisplay(selectedSlot.day_of_week)]}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
                  Location
                </p>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {selectedSlot.location || "Room 1"}
                </p>
              </div>
              <div className="col-span-2 space-y-1 pt-2 border-t border-gray-200 dark:border-gray-700/50">
                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
                  Time Slot
                </p>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-500" />
                  {selectedSlot.start_time} — {selectedSlot.end_time}
                </p>
              </div>
            </div>
          </div>
        ) : activityMode ? (
          <form
            onSubmit={onActivitySubmit}
            className="p-6 space-y-5 overflow-y-auto max-h-[70vh]"
          >
            {/* Lesson / Activity toggle (create only) */}
            {!isEditingActivity && !isEditing && canManageActivities && (
              <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 text-sm font-medium">
                <button
                  type="button"
                  onClick={() => onEntryKindChange?.("lesson")}
                  className="flex-1 py-2 rounded-lg text-gray-500 dark:text-gray-400"
                >
                  Lesson
                </button>
                <button
                  type="button"
                  onClick={() => onEntryKindChange?.("activity")}
                  className="flex-1 py-2 rounded-lg bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow"
                >
                  Activity
                </button>
              </div>
            )}

            {/* Activity name */}
            <div>
              <label className={labelCls}>
                Activity Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={af.activity_name}
                onChange={(e) => {
                  setAf({ activity_name: e.target.value });
                  onActivityErrorsChange?.({
                    ...activityErrors,
                    activity_name: undefined,
                  });
                }}
                placeholder="e.g. Morning Devotion, Sports Afternoon"
                className={inputCls(Boolean(activityErrors.activity_name))}
              />
              {activityErrors.activity_name && (
                <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                  {activityErrors.activity_name}
                </p>
              )}
            </div>

            {/* Activity type */}
            <div>
              <label className={labelCls}>
                Type <span className="text-red-500">*</span>
              </label>
              <input
                list="calendar-activity-types"
                value={af.activity_type}
                onChange={(e) => {
                  setAf({ activity_type: e.target.value });
                  onActivityErrorsChange?.({
                    ...activityErrors,
                    activity_type: undefined,
                  });
                }}
                placeholder="Select or type a category"
                className={inputCls(Boolean(activityErrors.activity_type))}
              />
              <datalist id="calendar-activity-types">
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              {activityErrors.activity_type && (
                <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                  {activityErrors.activity_type}
                </p>
              )}
            </div>

            {/* Colour */}
            <div>
              <label className={labelCls}>Colour</label>
              <div className="flex flex-wrap gap-2">
                {ACTIVITY_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colour ${c}`}
                    onClick={() => setAf({ color: c })}
                    className={`w-8 h-8 rounded-full transition-transform ${
                      af.color === c
                        ? "ring-2 ring-offset-2 ring-gray-500 dark:ring-offset-gray-900 scale-110"
                        : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Day of Week */}
            <div>
              <label className={labelCls}>
                Day of Week <span className="text-red-500">*</span>
              </label>
              <select
                value={af.day_of_week}
                onChange={(e) => {
                  setAf({ day_of_week: e.target.value });
                  onActivityErrorsChange?.({
                    ...activityErrors,
                    day_of_week: undefined,
                  });
                }}
                className={inputCls(Boolean(activityErrors.day_of_week))}
              >
                <option value="">Select Day</option>
                {DAYS_FULL.map((day, idx) => (
                  <option key={idx} value={idx}>
                    {day}
                  </option>
                ))}
              </select>
              {activityErrors.day_of_week && (
                <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                  {activityErrors.day_of_week}
                </p>
              )}
            </div>

            {/* Time range */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                    Start Time <span className="text-red-500">*</span>
                  </span>
                </label>
                <input
                  type="time"
                  value={af.start_time}
                  onChange={(e) => {
                    setAf({ start_time: e.target.value });
                    onActivityErrorsChange?.({
                      ...activityErrors,
                      start_time: undefined,
                    });
                  }}
                  className={inputCls(Boolean(activityErrors.start_time))}
                />
                {activityErrors.start_time && (
                  <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                    {activityErrors.start_time}
                  </p>
                )}
              </div>
              <div>
                <label className={labelCls}>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                    End Time <span className="text-red-500">*</span>
                  </span>
                </label>
                <input
                  type="time"
                  value={af.end_time}
                  onChange={(e) => {
                    setAf({ end_time: e.target.value });
                    onActivityErrorsChange?.({
                      ...activityErrors,
                      end_time: undefined,
                    });
                  }}
                  className={inputCls(Boolean(activityErrors.end_time))}
                />
                {activityErrors.end_time && (
                  <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                    {activityErrors.end_time}
                  </p>
                )}
              </div>
            </div>

            {/* Location */}
            <div>
              <label className={labelCls}>Location</label>
              <input
                type="text"
                value={af.location}
                onChange={(e) => setAf({ location: e.target.value })}
                placeholder="Optional"
                className={inputCls(false)}
              />
            </div>

            {/* Description */}
            <div>
              <label className={labelCls}>Description</label>
              <textarea
                value={af.description}
                onChange={(e) => setAf({ description: e.target.value })}
                rows={2}
                placeholder="Optional"
                className={inputCls(false)}
              />
            </div>

            {/* Assigned to — optional; assigned staff see the activity on
                their own teaching schedule. */}
            <div>
              <label className={labelCls}>
                Assigned to{" "}
                <span className="text-xs font-normal text-gray-400 dark:text-gray-500">
                  (optional — shows on their teaching schedule)
                </span>
              </label>
              <ActivityAssigneePicker
                value={af.assignees ?? []}
                onChange={(assignees) => setAf({ assignees })}
                disabled={isSubmitting}
              />
            </div>
          </form>
        ) : (
          <form
            onSubmit={onSubmit}
            className="p-6 space-y-5 overflow-y-auto max-h-[70vh]"
          >
            {/* Lesson / Activity toggle (create only) */}
            {!isEditing && canManageActivities && (
              <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 text-sm font-medium">
                <button
                  type="button"
                  onClick={() => onEntryKindChange?.("lesson")}
                  className="flex-1 py-2 rounded-lg bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow"
                >
                  Lesson
                </button>
                <button
                  type="button"
                  onClick={() => onEntryKindChange?.("activity")}
                  className="flex-1 py-2 rounded-lg text-gray-500 dark:text-gray-400"
                >
                  Activity
                </button>
              </div>
            )}

            {/* Subject with Instructor */}
            <div>
              <SubjectSelect
                label="Subject with Instructor"
                subjects={filteredSubjects}
                value={formData.subject_id}
                onChange={handleSubjectChange}
                error={formErrors.subject_id}
                required
                placeholder="Search by subject, code, or instructor name…"
              />
            </div>

            {/* Day of Week */}
            <div>
              <label className={labelCls}>
                Day of Week <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.day_of_week}
                onChange={(e) => {
                  onFormDataChange({ day_of_week: e.target.value });
                  onErrorsChange({ ...formErrors, day_of_week: undefined });
                }}
                className={inputCls(Boolean(formErrors.day_of_week))}
                required
              >
                <option value="">Select Day</option>
                {DAYS_FULL.map((day, idx) => (
                  <option key={idx} value={idx}>
                    {day}
                  </option>
                ))}
              </select>
              {formErrors.day_of_week && (
                <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                  {formErrors.day_of_week}
                </p>
              )}
            </div>

            {/* Time range */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                    Start Time <span className="text-red-500">*</span>
                  </span>
                </label>
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => {
                    onFormDataChange({ start_time: e.target.value });
                    onErrorsChange({ ...formErrors, start_time: undefined });
                  }}
                  className={inputCls(Boolean(formErrors.start_time))}
                  required
                />
                {formErrors.start_time && (
                  <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                    {formErrors.start_time}
                  </p>
                )}
              </div>
              <div>
                <label className={labelCls}>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                    End Time <span className="text-red-500">*</span>
                  </span>
                </label>
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => {
                    onFormDataChange({ end_time: e.target.value });
                    onErrorsChange({ ...formErrors, end_time: undefined });
                  }}
                  className={inputCls(Boolean(formErrors.end_time))}
                  required
                />
                {formErrors.end_time && (
                  <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                    {formErrors.end_time}
                  </p>
                )}
              </div>
            </div>
          </form>
        )}

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700/30 bg-gray-50 dark:bg-gray-800/30 flex items-center justify-between">
          {activityMode ? (
            <>
              {isEditingActivity ? (
                <button
                  type="button"
                  onClick={() =>
                    onActivityDelete?.(selectedActivity!.activity_id)
                  }
                  disabled={isDeleting || isSubmitting}
                  className="px-4 py-2 text-sm font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-full hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isDeleting && (
                    <div className="w-3.5 h-3.5 border-2 border-red-600 dark:border-red-400 border-t-transparent rounded-full animate-spin"></div>
                  )}
                  {isDeleting ? "Deleting..." : "Delete Activity"}
                </button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onActivitySubmit as any}
                  disabled={isSubmitting || isDeleting}
                  className="px-6 py-2 text-sm font-medium bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-full shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSubmitting && (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  )}
                  {isSubmitting
                    ? "Saving..."
                    : isEditingActivity
                      ? "Update Activity"
                      : "Create Activity"}
                </button>
              </div>
            </>
          ) : mode === "details" ? (
            <>
              <div className="flex items-center gap-3">
                {/* E-learning: jump to the course week that covers this lesson (students only). */}
                {selectedSlot && (
                  <OpenLessonContentButton subjectId={selectedSlot.subject_id} classGroupId={selectedSlot.class_group_id} date={selectedSlotDate ?? null} />
                )}
                {canViewLessonPlan && (
                  <button
                    type="button"
                    onClick={() => onViewLessonPlan(selectedSlot!)}
                    disabled={isLoadingLessonPlan}
                    className="px-5 py-2 text-sm font-medium bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-full hover:bg-gray-50 dark:hover:bg-gray-600 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isLoadingLessonPlan && (
                      <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                    )}
                    {isLoadingLessonPlan ? "Loading..." : "View Lesson Plan"}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                >
                  Close
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={onEditClick}
                    className="px-6 py-2 text-sm font-medium bg-blue-600 text-white rounded-full hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all"
                  >
                    Edit Slot
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Delete (edit mode only) */}
              {isEditing ? (
                <button
                  type="button"
                  onClick={() => onDelete(selectedSlot!.slot_id)}
                  disabled={isDeleting || isSubmitting}
                  className="px-4 py-2 text-sm font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-full hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isDeleting && (
                    <div className="w-3.5 h-3.5 border-2 border-red-600 dark:border-red-400 border-t-transparent rounded-full animate-spin"></div>
                  )}
                  {isDeleting ? "Deleting..." : "Delete Slot"}
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form=""
                  onClick={onSubmit as any}
                  disabled={isSubmitting || isDeleting}
                  className="px-6 py-2 text-sm font-medium bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-full shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSubmitting && (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  )}
                  {isSubmitting
                    ? "Saving..."
                    : isEditing
                      ? "Update"
                      : "Create Slot"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CalendarSlotModal;
