import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiX,
  FiCheck,
  FiBook,
  FiAward,
  FiGrid,
  FiAlertCircle,
} from "react-icons/fi";
import type {
  FilterOptions,
  Subject,
  Program,
  Grade,
} from "../../api/documents";

interface FilterSelectionComponentProps {
  filterType: string;
  filterOptions: FilterOptions | null;
  selectedFilterIds: number[];
  onFilterIdsChange: (filterIds: number[]) => void;
  isLoading?: boolean;
}

const FilterSelectionComponent: React.FC<FilterSelectionComponentProps> = ({
  filterType,
  filterOptions,
  selectedFilterIds,
  onFilterIdsChange,
  isLoading = false,
}) => {
  // Get items based on filter type
  const getItems = (): { id: number; name: string; code?: string | null }[] => {
    if (!filterOptions || !filterOptions.myAssignments) return [];

    switch (filterType) {
      case "subject_assigned":
        return filterOptions.myAssignments.assignedSubjects.map(
          (s: Subject) => ({
            id: s.subject_id,
            name: s.subject_name || s.name,
            code: s.subject_code || s.code,
          }),
        );
      case "subject_enrolled":
        return filterOptions.myAssignments.enrolledSubjects.map(
          (s: Subject) => ({
            id: s.subject_id,
            name: s.subject_name || s.name,
            code: s.subject_code || s.code,
          }),
        );
      case "program_assigned":
        return filterOptions.myAssignments.programLeads.map((p: Program) => ({
          id: p.program_id,
          name: p.program_name || p.name,
        }));
      case "grade_assigned":
        return filterOptions.myAssignments.gradeAssignments.map((g: Grade) => ({
          id: g.grade_id,
          name: g.grade_name || g.name,
        }));
      default:
        return [];
    }
  };

  const items = getItems();

  // Get icon based on filter type
  const getIcon = () => {
    switch (filterType) {
      case "subject_assigned":
      case "subject_enrolled":
        return FiBook;
      case "program_assigned":
        return FiAward;
      case "grade_assigned":
        return FiGrid;
      default:
        return FiBook;
    }
  };

  // Get label for filter type
  const getFilterTypeLabel = () => {
    switch (filterType) {
      case "subject_assigned":
        return "Subjects Assigned (Teacher)";
      case "subject_enrolled":
        return "Subjects Enrolled (Student)";
      case "program_assigned":
        return "Programs Lead";
      case "grade_assigned":
        return "Grades Assigned (Class Teacher)";
      default:
        return "Select Items";
    }
  };

  // Get empty message based on filter type
  const getEmptyMessage = () => {
    switch (filterType) {
      case "subject_assigned":
        return "You don't have any assigned subjects. You need to be assigned as a teacher to at least one subject to use this filter.";
      case "subject_enrolled":
        return "You don't have any enrolled subjects. You need to be enrolled in at least one subject to use this filter.";
      case "program_assigned":
        return "You are not a program lead for any programs. You need to be assigned as a program lead to use this filter.";
      case "grade_assigned":
        return "You are not assigned as a class teacher for any grades. You need to be assigned as a class teacher to use this filter.";
      default:
        return `No ${getFilterTypeLabel().toLowerCase()} found for your account.`;
    }
  };

  // Handle checkbox toggle
  const handleToggle = (itemId: number) => {
    if (selectedFilterIds.includes(itemId)) {
      onFilterIdsChange(selectedFilterIds.filter((id) => id !== itemId));
    } else {
      onFilterIdsChange([...selectedFilterIds, itemId]);
    }
  };

  // Handle remove single item
  const handleRemove = (itemId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    onFilterIdsChange(selectedFilterIds.filter((id) => id !== itemId));
  };

  // Get selected items for display
  const selectedItems = items.filter((item) =>
    selectedFilterIds.includes(item.id),
  );
  const Icon = getIcon();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-6">
        <div className="w-8 h-8 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-3" />
        <p className="text-sm text-purple-600 dark:text-purple-400">
          Loading {getFilterTypeLabel().toLowerCase()}...
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
        <div className="flex items-start gap-3">
          <FiAlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
              No {getFilterTypeLabel()} Available
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
              {getEmptyMessage()}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Selection checklist */}
      <div>
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 block">
          Select {getFilterTypeLabel()} (choose multiple)
        </label>
        <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl max-h-48 overflow-y-auto">
          {items.map((item) => (
            <motion.button
              key={item.id}
              whileHover={{ x: 2 }}
              onClick={() => handleToggle(item.id)}
              className={`w-full p-3 text-left flex items-center gap-3 transition-colors border-b border-gray-100 dark:border-gray-600 last:border-b-0 ${
                selectedFilterIds.includes(item.id)
                  ? "bg-purple-50 dark:bg-purple-900/20"
                  : "hover:bg-gray-50 dark:hover:bg-gray-600"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                  selectedFilterIds.includes(item.id)
                    ? "bg-purple-500 text-white"
                    : "bg-gray-100 dark:bg-gray-600 text-gray-400"
                }`}
              >
                {selectedFilterIds.includes(item.id) && (
                  <FiCheck className="w-3 h-3" />
                )}
              </div>
              <Icon className="w-4 h-4 text-gray-400" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-700 dark:text-gray-200 truncate">
                  {item.name}
                </p>
                {item.code && (
                  <p className="text-xs text-gray-500 truncate">{item.code}</p>
                )}
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Selected items display */}
      <AnimatePresence>
        {selectedItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 block">
              Selected {getFilterTypeLabel()} ({selectedItems.length}):
            </label>
            <div className="flex flex-wrap gap-2">
              {selectedItems.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full"
                >
                  <Icon className="w-3 h-3" />
                  <span className="text-sm font-medium">
                    {item.name}
                    {item.code && (
                      <span className="opacity-70"> ({item.code})</span>
                    )}
                  </span>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => handleRemove(item.id, e)}
                    className="p-0.5 hover:bg-purple-200 dark:hover:bg-purple-800 rounded-full"
                  >
                    <FiX className="w-3 h-3" />
                  </motion.button>
                </motion.div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onFilterIdsChange([])}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Clear all
              </button>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span className="text-xs text-gray-500">
                {selectedItems.length === items.length
                  ? "All items selected"
                  : `${selectedItems.length} of ${items.length} selected`}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info message when filter is active */}
      {selectedFilterIds.length > 0 && (
        <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <FiCheck className="w-4 h-4 text-green-500" />
          <span className="text-xs text-green-700 dark:text-green-400">
            Only users with{" "}
            {selectedFilterIds.length === 1
              ? `this ${filterType.replace("_", " ")} will`
              : `any of these ${filterType.replace("_", "s")} will`}{" "}
            see the document
          </span>
        </div>
      )}
    </div>
  );
};

export default FilterSelectionComponent;
