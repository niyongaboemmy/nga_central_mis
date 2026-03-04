import React from "react";
import { X } from "lucide-react";
import { AcademicTerm } from "../../api/academics";

interface CalendarFormData {
  academic_year_id: string;
  academic_term_id: string;
  class_group_id: string;
  name: string;
  description: string;
}

interface AcademicCalendarModalProps {
  showModal: boolean;
  academicYears: any[];
  academicTerms: AcademicTerm[];
  availableClassGroups: any[];
  formData: CalendarFormData;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onFormDataChange: (data: Partial<CalendarFormData>) => void;
}

const AcademicCalendarModal: React.FC<AcademicCalendarModalProps> = ({
  showModal,
  academicYears,
  academicTerms,
  availableClassGroups,
  formData,
  onClose,
  onSubmit,
  onFormDataChange,
}) => {
  if (!showModal) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            Create Academic Calendar
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 p-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Academic Year
            </label>
            <select
              value={formData.academic_year_id}
              onChange={(e) =>
                onFormDataChange({ academic_year_id: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:text-white"
              required
            >
              <option value="">Select Academic Year</option>
              {academicYears.map((year) => (
                <option
                  key={year.academic_year_id}
                  value={year.academic_year_id}
                >
                  {year.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Academic Term
            </label>
            <select
              value={formData.academic_term_id}
              onChange={(e) =>
                onFormDataChange({ academic_term_id: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:text-white"
              required
            >
              <option value="">Select Academic Term</option>
              {academicTerms.map((term) => (
                <option
                  key={term.academic_term_id}
                  value={term.academic_term_id}
                >
                  {term.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Class Group
            </label>
            <select
              value={formData.class_group_id}
              onChange={(e) =>
                onFormDataChange({ class_group_id: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:text-white"
              required
            >
              <option value="">Select Class Group</option>
              {availableClassGroups.map((cg) => (
                <option key={cg.class_group_id} value={cg.class_group_id}>
                  {cg.grade_name ? `${cg.grade_name} - ` : ""}
                  {cg.name}
                </option>
              ))}
            </select>
            {availableClassGroups.length === 0 && (
              <p className="text-xs text-gray-500 mt-1">
                All class groups for this year/term already have calendars
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Calendar Name (Optional)
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => onFormDataChange({ name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:text-white"
              placeholder="e.g., S1A Weekly Schedule"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description (Optional)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                onFormDataChange({ description: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:text-white"
              rows={2}
              placeholder="Optional description for this calendar"
            />
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={availableClassGroups.length === 0}
              className="px-4 py-2 text-sm bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Calendar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AcademicCalendarModal;
