import React, { useState, useMemo } from "react";
import UserAvatar from "./ui/UserAvatar";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Filter,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  Calendar,
  Users,
  FileText,
  AlertCircle,
} from "lucide-react";
import { TeacherWithSchemes } from "../api/schemeOfWork";

interface Props {
  teachers: TeacherWithSchemes[];
  statusFilter:
    | "all"
    | "submitted"
    | "pending"
    | "partial"
    | "validated"
    | "not_validated";
  onStatusFilterChange: (
    f:
      | "all"
      | "submitted"
      | "pending"
      | "partial"
      | "validated"
      | "not_validated",
  ) => void;
}

const statusBadge = (status: "submitted" | "pending") => {
  if (status === "submitted") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
        <CheckCircle2 className="w-3 h-3" />
        Submitted
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
      <AlertTriangle className="w-3 h-3" />
      Pending
    </span>
  );
};

const validationBadge = (
  status: "PENDING" | "APPROVED" | "REJECTED" | null,
) => {
  const isApproved = status === "APPROVED";
  const isRejected = status === "REJECTED";

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-xl uppercase tracking-tighter border ${
        isApproved
          ? "bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800"
          : isRejected
            ? "bg-rose-50 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-800"
            : "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-100 dark:border-gray-700 opacity-60"
      }`}
    >
      {isApproved ? "Approved" : isRejected ? "Rejected" : "Not Validated"}
    </span>
  );
};

const AllTeachersSOW_List: React.FC<Props> = ({
  teachers,
  statusFilter,
  onStatusFilterChange,
}) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return teachers.filter((t) => {
      // Apply status filter to teacher's overall status for some filters
      if (["submitted", "pending", "partial"].includes(statusFilter)) {
        if (t.overall_status !== statusFilter) return false;
      }

      // If filtering by validation, we handle that by allowing the teacher if ANY of their schemes match
      if (statusFilter === "validated") {
        if (
          !t.schemes.some(
            (s) =>
              s.validation_status === "APPROVED" ||
              s.validation_status === "REJECTED",
          )
        )
          return false;
      }
      if (statusFilter === "not_validated") {
        if (
          !t.schemes.some(
            (s) => !s.validation_status || s.validation_status === "PENDING",
          )
        )
          return false;
      }

      if (search) {
        const q = search.toLowerCase();
        if (
          !t.full_name.toLowerCase().includes(q) &&
          !t.username.toLowerCase().includes(q) &&
          !t.email?.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [teachers, statusFilter, search]);

  // Flatten teacher-scheme pairs for list display
  const listItems = useMemo(() => {
    const flattened = filtered.flatMap((teacher) =>
      teacher.schemes.map((scheme) => ({ teacher, scheme })),
    );

    // Filter flattened items if applying validation filter specifically to items
    if (statusFilter === "validated") {
      return flattened.filter(
        (item) =>
          item.scheme.validation_status === "APPROVED" ||
          item.scheme.validation_status === "REJECTED",
      );
    }
    if (statusFilter === "not_validated") {
      return flattened.filter(
        (item) =>
          !item.scheme.validation_status ||
          item.scheme.validation_status === "PENDING",
      );
    }

    return flattened;
  }, [filtered, statusFilter]);

  const filterChips: {
    key:
      | "all"
      | "submitted"
      | "pending"
      | "partial"
      | "validated"
      | "not_validated";
    label: string;
  }[] = [
    { key: "all", label: "All" },
    { key: "submitted", label: "Submitted" },
    { key: "partial", label: "Partial" },
    { key: "pending", label: "Pending" },
    { key: "validated", label: "Validated" },
    { key: "not_validated", label: "Not Validated" },
  ];

  return (
    <div className="space-y-6">
      {/* Search + filter row */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by teacher name or username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          {filterChips.map((chip) => (
            <button
              key={chip.key}
              onClick={() => onStatusFilterChange(chip.key)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                statusFilter === chip.key
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-500/25"
                  : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-blue-400"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">
        Showing {listItems.length} subject assignment
        {listItems.length !== 1 ? "s" : ""}
      </p>

      {/* List */}
      <AnimatePresence mode="popLayout">
        {listItems.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16 bg-white dark:bg-gray-900 rounded-xl border border-dashed border-gray-200 dark:border-gray-700"
          >
            <Users className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
              No records found
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Try adjusting your search or filters
            </p>
          </motion.div>
        ) : (
          <div className="bg-white dark:bg-gray-900/80 rounded-xl border border-gray-100 dark:border-gray-800/50 overflow-hidden">
            {listItems.map(({ teacher, scheme }, idx) => {
              return (
                <motion.div
                  key={`${teacher.user_id}-${scheme.subject_id}-${scheme.class_group_id}`}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ delay: idx * 0.02 }}
                  onClick={() =>
                    navigate(
                      `/all-teachers-sow/details?user_id=${teacher.user_id}&subject_id=${scheme.subject_id}&class_group_id=${scheme.class_group_id}&academic_term_id=${scheme.academic_term_id}&name=${encodeURIComponent(teacher.full_name)}&subject_name=${encodeURIComponent(scheme.subject_name)}`,
                    )
                  }
                  className={`group cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors px-4 py-2.5 ${
                    idx !== 0 ? "border-t border-gray-50 dark:border-gray-800/50" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <UserAvatar decorative userId={teacher.user_id} name={teacher.full_name} size={32} shape="rounded" />

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-1.5">
                        <h3 className="font-bold text-sm text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                          {teacher.full_name}
                        </h3>
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                          @{teacher.username}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Subject */}
                        <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor:
                                scheme.subject_color || "#3B82F6",
                            }}
                          />
                          <BookOpen className="w-3 h-3" />
                          <span className="font-semibold">
                            {scheme.subject_name}
                          </span>
                          {scheme.subject_code && (
                            <span className="text-gray-400">
                              ({scheme.subject_code})
                            </span>
                          )}
                        </div>
                        {/* Class group */}
                        <span className="text-gray-300 dark:text-gray-700">
                          •
                        </span>
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <Users className="w-3 h-3" />
                          {scheme.class_group_name}
                        </div>
                        {/* Term */}
                        <span className="text-gray-300 dark:text-gray-700">
                          •
                        </span>
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <Calendar className="w-3 h-3" />
                          {scheme.academic_term_name}
                        </div>
                      </div>
                    </div>

                    {/* Right column: status + entries */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        {validationBadge(scheme.validation_status)}
                        {statusBadge(scheme.status)}
                      </div>
                      {scheme.entries_count > 0 && (
                        <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                          <FileText className="w-3 h-3" />
                          {scheme.entries_count} week
                          {scheme.entries_count !== 1 ? "s" : ""}
                        </div>
                      )}
                    </div>

                    <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                  </div>

                  {/* Warning banner for pending / rejected */}
                  {scheme.status === "pending" ? (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2 text-xs text-rose-500 dark:text-rose-400">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      Scheme of work not yet submitted. Lesson plans
                      unavailable.
                    </div>
                  ) : scheme.validation_status === "REJECTED" ? (
                    <div className="mt-3 pt-3 border-t border-gray-50 dark:border-gray-800 flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400 font-bold bg-rose-50/50 dark:bg-rose-900/10 px-3 py-2 rounded-xl">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      REJECTED: A scheme of work of that subject has rejected.
                      {scheme.validation_comment && (
                        <span className="font-normal italic ml-1">
                          "{scheme.validation_comment}"
                        </span>
                      )}
                    </div>
                  ) : null}
                </motion.div>
              );
            })}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AllTeachersSOW_List;
