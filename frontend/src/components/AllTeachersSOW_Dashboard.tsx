import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  TrendingUp,
  ChevronRight,
  BookOpen,
  Calendar,
  X,
  FileText,
  ShieldCheck,
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

const statusConfig = {
  submitted: {
    label: "Fully Submitted",
    bg: "bg-emerald-500",
    light: "bg-emerald-50 dark:bg-emerald-900/20",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-800",
    icon: CheckCircle2,
  },
  partial: {
    label: "Partially Submitted",
    bg: "bg-amber-500",
    light: "bg-amber-50 dark:bg-amber-900/20",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-800",
    icon: Clock,
  },
  pending: {
    label: "Not Submitted",
    bg: "bg-rose-500",
    light: "bg-rose-50 dark:bg-rose-900/20",
    text: "text-rose-600 dark:text-rose-400",
    border: "border-rose-200 dark:border-rose-800",
    icon: AlertTriangle,
  },
};

const getInitials = (name: string) => {
  const words = name.trim().split(" ");
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

/** Small ring gauge used in the completion-rate hero strip. */
const RingGauge: React.FC<{
  pct: number;
  colorClass: string;
  trackClass?: string;
}> = ({ pct, colorClass, trackClass = "text-gray-100 dark:text-gray-800" }) => {
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
      <circle cx="32" cy="32" r={r} strokeWidth="7" fill="none" className={trackClass} stroke="currentColor" />
      <motion.circle
        cx="32"
        cy="32"
        r={r}
        strokeWidth="7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        className={colorClass}
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
    </svg>
  );
};

const AllTeachersSOW_Dashboard: React.FC<Props> = ({
  teachers,
  statusFilter,
  onStatusFilterChange,
}) => {
  const navigate = useNavigate();
  const [selectedTeacherForModal, setSelectedTeacherForModal] =
    useState<TeacherWithSchemes | null>(null);

  const stats = useMemo(() => {
    const total = teachers.length;
    const submitted = teachers.filter(
      (t) => t.overall_status === "submitted",
    ).length;
    const partial = teachers.filter(
      (t) => t.overall_status === "partial",
    ).length;
    const pending = teachers.filter(
      (t) => t.overall_status === "pending",
    ).length;

    let validatedCount = 0;
    let notValidatedCount = 0;

    teachers.forEach((t) => {
      t.schemes.forEach((s) => {
        if (
          s.validation_status === "APPROVED" ||
          s.validation_status === "REJECTED"
        ) {
          validatedCount++;
        } else {
          notValidatedCount++;
        }
      });
    });

    const totalSchemes = teachers.reduce((sum, t) => sum + t.total_subjects, 0);
    const submittedSchemes = teachers.reduce(
      (sum, t) => sum + t.submitted_count,
      0,
    );
    const overallRate =
      totalSchemes > 0
        ? Math.round((submittedSchemes / totalSchemes) * 100)
        : 0;
    const validationRate =
      submittedSchemes > 0
        ? Math.round((validatedCount / submittedSchemes) * 100)
        : 0;
    return {
      total,
      submitted,
      partial,
      pending,
      totalSchemes,
      submittedSchemes,
      overallRate,
      validationRate,
      validatedCount,
      notValidatedCount,
      validated: teachers.filter((t) =>
        t.schemes.some(
          (s) =>
            s.validation_status === "APPROVED" ||
            s.validation_status === "REJECTED",
        ),
      ).length,
      not_validated: teachers.filter((t) =>
        t.schemes.some(
          (s) => !s.validation_status || s.validation_status === "PENDING",
        ),
      ).length,
    };
  }, [teachers]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return teachers;
    if (["submitted", "pending", "partial"].includes(statusFilter)) {
      return teachers.filter((t) => t.overall_status === statusFilter);
    }
    if (statusFilter === "validated") {
      return teachers.filter((t) =>
        t.schemes.some(
          (s) =>
            s.validation_status === "APPROVED" ||
            s.validation_status === "REJECTED",
        ),
      );
    }
    if (statusFilter === "not_validated") {
      return teachers.filter((t) =>
        t.schemes.some(
          (s) => !s.validation_status || s.validation_status === "PENDING",
        ),
      );
    }
    return teachers;
  }, [teachers, statusFilter]);

  const statCards = [
    {
      label: "Total Teachers",
      value: stats.total,
      subValue: `${stats.totalSchemes} subjects`,
      icon: Users,
      bg: "bg-violet-50 dark:bg-violet-900/20",
      text: "text-violet-600 dark:text-violet-400",
    },
    {
      label: "Fully Submitted",
      value: stats.submitted,
      subValue: "schemes completed",
      icon: CheckCircle2,
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
      text: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Validated",
      value: stats.validatedCount,
      subValue: "approved / rejected",
      icon: TrendingUp,
      bg: "bg-blue-50 dark:bg-blue-900/20",
      text: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "Not Validated",
      value: stats.notValidatedCount,
      subValue: "pending review",
      icon: AlertTriangle,
      bg: "bg-rose-50 dark:bg-rose-900/20",
      text: "text-rose-600 dark:text-rose-400",
    },
  ];

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
    { key: "all", label: "All Teachers" },
    { key: "submitted", label: "Submitted" },
    { key: "partial", label: "Partial" },
    { key: "pending", label: "Pending" },
    { key: "validated", label: "Validated" },
    { key: "not_validated", label: "Not Validated" },
  ];

  return (
    <>
      <div className="space-y-5">
        {/* Compact stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {statCards.map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 bg-white dark:bg-gray-900/80 rounded-xl border border-gray-100 dark:border-gray-800/50 px-4 py-3"
            >
              <div className={`p-2 rounded-lg ${card.bg} flex-shrink-0`}>
                <card.icon className={`w-4 h-4 ${card.text}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider truncate">
                  {card.label}
                </p>
                <div className="flex items-baseline gap-1.5">
                  <p className="text-xl font-black text-gray-900 dark:text-white leading-tight">
                    {card.value}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                    {card.subValue}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Completion rate hero */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-900/80 rounded-xl border border-gray-100 dark:border-gray-800/50 px-5 py-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="flex items-center gap-4">
              <div className="relative flex-shrink-0">
                <RingGauge pct={stats.overallRate} colorClass="text-blue-600" />
                <div className="absolute inset-0 flex items-center justify-center rotate-0">
                  <span className="text-sm font-black text-gray-900 dark:text-white">
                    {stats.overallRate}%
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
                  Submission completion
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  {stats.submittedSchemes} of {stats.totalSchemes} schemes submitted
                </p>
              </div>
            </div>

            <div className="hidden sm:block w-px h-10 bg-gray-100 dark:bg-gray-800" />

            <div className="flex items-center gap-4">
              <div className="relative flex-shrink-0">
                <RingGauge pct={stats.validationRate} colorClass="text-emerald-500" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-black text-gray-900 dark:text-white">
                    {stats.validationRate}%
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  Validation completion
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  {stats.validatedCount} of {stats.submittedSchemes} submitted schemes validated
                </p>
              </div>
            </div>

            <div className="sm:ml-auto text-[11px] text-gray-400 dark:text-gray-500 italic flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Updated in real-time
            </div>
          </div>
        </motion.div>

        {/* Filter Chips */}
        <div className="flex flex-wrap gap-1.5">
          {filterChips.map((chip) => (
            <button
              key={chip.key}
              onClick={() => onStatusFilterChange(chip.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                statusFilter === chip.key
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-500/25"
                  : "bg-white dark:bg-gray-900/80 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-blue-400"
              }`}
            >
              {chip.label}
              <span
                className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${statusFilter === chip.key ? "bg-white/20" : "bg-gray-100 dark:bg-gray-800"}`}
              >
                {chip.key === "all"
                  ? teachers.length
                  : ["submitted", "partial", "pending", "validated", "not_validated"].includes(chip.key)
                    ? (stats as any)[chip.key]
                    : filtered.length}
              </span>
            </button>
          ))}
        </div>

        {/* Teacher list (row-based, not a card grid) */}
        <div className="bg-white dark:bg-gray-900/80 rounded-xl border border-gray-100 dark:border-gray-800/50 overflow-hidden">
          {/* Header row */}
          <div className="hidden md:grid grid-cols-[1.6fr_0.9fr_1fr_1fr_auto] gap-3 px-4 py-2 border-b border-gray-100 dark:border-gray-800/50 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            <span>Teacher</span>
            <span>Subjects</span>
            <span>Submission</span>
            <span>Validation</span>
            <span className="text-right pr-6">Status</span>
          </div>

          <AnimatePresence mode="popLayout">
            {filtered.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-16"
              >
                <Users className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                  No teachers found
                </p>
              </motion.div>
            ) : (
              filtered.map((teacher, idx) => {
                const config = statusConfig[teacher.overall_status];
                const StatusIcon = config.icon;
                const progressPct =
                  teacher.total_subjects > 0
                    ? Math.round(
                        (teacher.submitted_count / teacher.total_subjects) *
                          100,
                      )
                    : 0;
                const submittedSchemes = teacher.schemes.filter(
                  (s) => s.status === "submitted",
                );
                const validatedForTeacher = submittedSchemes.filter(
                  (s) =>
                    s.validation_status === "APPROVED" ||
                    s.validation_status === "REJECTED",
                );
                const validationPct =
                  submittedSchemes.length > 0
                    ? Math.round(
                        (validatedForTeacher.length / submittedSchemes.length) * 100,
                      )
                    : 0;

                return (
                  <motion.div
                    key={teacher.user_id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: Math.min(idx, 20) * 0.02 }}
                    onClick={() => setSelectedTeacherForModal(teacher)}
                    className={`group cursor-pointer grid grid-cols-1 md:grid-cols-[1.6fr_0.9fr_1fr_1fr_auto] gap-2 md:gap-3 items-center px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors ${
                      idx !== 0 ? "border-t border-gray-50 dark:border-gray-800/50" : ""
                    }`}
                  >
                    {/* Teacher */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0"
                        style={{
                          backgroundColor:
                            teacher.schemes[0]?.subject_color || "#3B82F6",
                        }}
                      >
                        {getInitials(teacher.full_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {teacher.full_name}
                        </p>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                          @{teacher.username}
                        </p>
                      </div>
                    </div>

                    {/* Subjects count */}
                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span className="font-semibold text-gray-900 dark:text-white">{teacher.total_subjects}</span> subjects
                      <span className="hidden md:inline text-gray-300 dark:text-gray-700">•</span>
                      <span className="hidden md:inline text-emerald-600 dark:text-emerald-400">{teacher.submitted_count} done</span>
                    </div>

                    {/* Submission progress */}
                    <div className="flex items-center gap-2">
                      <span className="md:hidden text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider w-20 flex-shrink-0">
                        Submission
                      </span>
                      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${progressPct}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                          className="h-full rounded-full"
                          style={{
                            backgroundColor:
                              progressPct >= 100
                                ? "#10b981"
                                : progressPct > 0
                                  ? "#f59e0b"
                                  : "#f43f5e",
                          }}
                        />
                      </div>
                      <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 w-8 text-right">
                        {progressPct}%
                      </span>
                    </div>

                    {/* Validation progress */}
                    <div className="flex items-center gap-2">
                      <span className="md:hidden text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider w-20 flex-shrink-0">
                        Validation
                      </span>
                      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${validationPct}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                          className="h-full rounded-full bg-blue-500"
                        />
                      </div>
                      <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 w-8 text-right">
                        {validationPct}%
                      </span>
                    </div>

                    {/* Status + chevron */}
                    <div className="flex items-center justify-between md:justify-end gap-2">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${config.light} ${config.text} ${config.border}`}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {config.label}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Subject Selection Modal */}
      <AnimatePresence>
        {selectedTeacherForModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTeacherForModal(null)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white dark:bg-gray-900/80 rounded-3xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800/50"
            >
              {/* Header */}
              <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800/50 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold shadow-lg"
                    style={{
                      backgroundColor:
                        selectedTeacherForModal.schemes[0]?.subject_color ||
                        "#3B82F6",
                    }}
                  >
                    {getInitials(selectedTeacherForModal.full_name)}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                      {selectedTeacherForModal.full_name}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Select a subject to view details
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTeacherForModal(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Subject List */}
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                {selectedTeacherForModal.schemes.length === 0 ? (
                  <div className="text-center py-10">
                    <BookOpen className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 font-medium">
                      No subjects assigned
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {selectedTeacherForModal.schemes.map((scheme) => (
                      <div
                        key={`${scheme.subject_id}-${scheme.class_group_id}`}
                        onClick={() =>
                          navigate(
                            `/all-teachers-sow/details?user_id=${selectedTeacherForModal.user_id}&subject_id=${scheme.subject_id}&class_group_id=${scheme.class_group_id}&academic_term_id=${scheme.academic_term_id}&name=${encodeURIComponent(selectedTeacherForModal.full_name)}&subject_name=${encodeURIComponent(scheme.subject_name)}`,
                          )
                        }
                        className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border border-gray-100 dark:border-gray-800/50 bg-white dark:bg-gray-900/80 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor:
                                scheme.subject_color || "#3B82F6",
                            }}
                          />
                          <div>
                            <h3 className="font-bold text-gray-900 dark:text-white text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {scheme.subject_name}
                              {scheme.subject_code && (
                                <span className="text-gray-400 ml-1">
                                  ({scheme.subject_code})
                                </span>
                              )}
                            </h3>
                            <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {scheme.class_group_name}
                              </span>
                              <span className="text-gray-300 dark:text-gray-700">
                                •
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {scheme.academic_term_name}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto mt-2 sm:mt-0 pt-3 sm:pt-0 border-t border-gray-50 sm:border-t-0 dark:border-gray-800/50">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-xl uppercase tracking-tighter border ${
                                  scheme.validation_status === "APPROVED"
                                    ? "bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800"
                                    : scheme.validation_status === "REJECTED"
                                      ? "bg-rose-50 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-800"
                                      : "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-100 dark:border-gray-700 opacity-60"
                                }`}
                              >
                                {scheme.validation_status === "APPROVED"
                                  ? "Approved"
                                  : scheme.validation_status === "REJECTED"
                                    ? "Rejected"
                                    : "Not Validated"}
                              </span>
                              <span
                                className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${
                                  scheme.status === "submitted"
                                    ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                                    : "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800"
                                }`}
                              >
                                {scheme.status === "submitted" ? (
                                  <CheckCircle2 className="w-3 h-3" />
                                ) : (
                                  <AlertTriangle className="w-3 h-3" />
                                )}
                                {scheme.status === "submitted"
                                  ? "Submitted"
                                  : "Pending"}
                              </span>
                            </div>
                            {scheme.entries_count > 0 && (
                              <span className="flex items-center gap-1 text-xs text-gray-400 font-medium">
                                <FileText className="w-3 h-3" />
                                {scheme.entries_count}
                              </span>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 transition-colors" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AllTeachersSOW_Dashboard;
