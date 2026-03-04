import React from "react";
import { X, Clock, CalendarDays } from "lucide-react";
import SubjectSelect from "../ui/SubjectSelect";
import { DAYS_FULL, backendDayToDisplay } from "./calendarConstants";
import type { CalendarSlot, CalendarSetupData } from "../../api/calendar";

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
}) => {
  if (!showModal) return null;

  const isEditing = Boolean(selectedSlot);

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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center  p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-gray-200/50 dark:border-gray-700/50">
        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                {mode === "details"
                  ? "Lesson Details"
                  : isEditing
                    ? "Edit Schedule Slot"
                    : "Add New Schedule Slot"}
              </h3>
              <p className="text-xs text-white/70 mt-0.5">
                {mode === "details"
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
                style={{ backgroundColor: selectedSlot.color || "#3B82F6" }}
              >
                <div className="text-white font-bold text-xl">
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
        ) : (
          <form
            onSubmit={onSubmit}
            className="p-6 space-y-5 overflow-y-auto max-h-[70vh]"
          >
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
          {mode === "details" ? (
            <>
              <div className="flex items-center gap-3">
                {canViewLessonPlan && (
                  <button
                    type="button"
                    onClick={() => onViewLessonPlan(selectedSlot!)}
                    className="px-5 py-2 text-sm font-medium bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-full hover:bg-gray-50 dark:hover:bg-gray-600 transition-all shadow-sm"
                  >
                    View Lesson Plan
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
                  className="px-4 py-2 text-sm font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-full hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800/50 transition-all"
                >
                  Delete Slot
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
                  className="px-6 py-2 text-sm font-medium bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-full shadow-lg shadow-blue-500/20 transition-all"
                >
                  {isEditing ? "Update" : "Create Slot"}
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
