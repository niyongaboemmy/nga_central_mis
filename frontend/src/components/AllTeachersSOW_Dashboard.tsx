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
    color: "emerald",
    bg: "bg-emerald-500",
    light: "bg-emerald-50 dark:bg-emerald-900/20",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-800",
    icon: CheckCircle2,
    glow: "shadow-emerald-500/20",
  },
  partial: {
    label: "Partially Submitted",
    color: "amber",
    bg: "bg-amber-500",
    light: "bg-amber-50 dark:bg-amber-900/20",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-800",
    icon: Clock,
    glow: "shadow-amber-500/20",
  },
  pending: {
    label: "Not Submitted",
    color: "rose",
    bg: "bg-rose-500",
    light: "bg-rose-50 dark:bg-rose-900/20",
    text: "text-rose-600 dark:text-rose-400",
    border: "border-rose-200 dark:border-rose-800",
    icon: AlertTriangle,
    glow: "shadow-rose-500/20",
  },
};

const getInitials = (name: string) => {
  const words = name.trim().split(" ");
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
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

    // Validation stats
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
    return {
      total,
      submitted,
      partial,
      pending,
      totalSchemes,
      submittedSchemes,
      overallRate,
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
      subValue: `${stats.totalSchemes} Subjects`,
      icon: Users,
      bg: "bg-violet-50 dark:bg-violet-900/20",
      text: "text-violet-600 dark:text-violet-400",
      accent: "violet",
    },
    {
      label: "Fully Submitted",
      value: stats.submitted,
      subValue: "Schemes Completed",
      icon: CheckCircle2,
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
      text: "text-emerald-600 dark:text-emerald-400",
      accent: "emerald",
    },
    {
      label: "Validated",
      value: stats.validatedCount,
      subValue: "Approved/Rejected",
      icon: TrendingUp,
      bg: "bg-blue-50 dark:bg-blue-900/20",
      text: "text-blue-600 dark:text-blue-400",
      accent: "blue",
    },
    {
      label: "Not Validated",
      value: stats.notValidatedCount,
      subValue: "Pending Review",
      icon: AlertTriangle,
      bg: "bg-rose-50 dark:bg-rose-900/20",
      text: "text-rose-600 dark:text-rose-400",
      accent: "rose",
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
      <div className="space-y-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="relative overflow-hidden bg-white dark:bg-gray-900/80 rounded-3xl border border-gray-100 dark:border-gray-800/50 p-6 hover:shadow-2xl hover:border-blue-500/30 transition-all duration-500 group"
            >
              <div className="flex items-start justify-between relative z-10">
                <div>
                  <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-2">
                    {card.label}
                  </p>
                  <p className="text-4xl font-black text-gray-900 dark:text-white tracking-tighter mb-1">
                    {card.value}
                  </p>
                  <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 italic">
                    {card.subValue}
                  </p>
                </div>
                <div
                  className={`p-4 rounded-[2rem] ${card.bg} group-hover:scale-110 transition-transform duration-500`}
                >
                  <card.icon className={`w-6 h-6 ${card.text}`} />
                </div>
              </div>

              {/* Subtle background glow */}
              <div
                className={`absolute -right-4 -bottom-4 w-24 h-24 rounded-full blur-3xl opacity-20 ${card.bg}`}
              />
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-white dark:bg-gray-900/80 rounded-2xl border border-gray-100 dark:border-gray-800/50 p-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Submission Rate */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 dark:text-blue-400">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-sm">
                      Overall Submission Rate
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {stats.submittedSchemes} of {stats.totalSchemes} subject
                      schemes submitted
                    </p>
                  </div>
                </div>
                <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                  {stats.overallRate}%
                </span>
              </div>
              <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.overallRate}%` }}
                  transition={{ duration: 1, ease: "easeOut", delay: 0.4 }}
                  className="h-full rounded-full bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.3)]"
                />
              </div>
            </div>

            {/* Validation Rate */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-sm">
                      Overall Validation Rate
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {stats.validatedCount} of {stats.submittedSchemes} submitted schemes validated
                    </p>
                  </div>
                </div>
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {(() => {
                    if (stats.submittedSchemes === 0) return 0;
                    return Math.round((stats.validatedCount / stats.submittedSchemes) * 100);
                  })()}%
                </span>
              </div>
              <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ 
                    width: `${(() => {
                      if (stats.submittedSchemes === 0) return 0;
                      return Math.round((stats.validatedCount / stats.submittedSchemes) * 100);
                    })()}%` 
                  }}
                  transition={{ duration: 1, ease: "easeOut", delay: 0.6 }}
                  className="h-full rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-4 border-t border-gray-50 dark:border-gray-800/50 pt-4">
            <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> Interactive Analytics</span>
            <span className="italic opacity-70">Updated in real-time</span>
          </div>
        </motion.div>

        {/* Filter Chips */}
        <div className="flex flex-wrap gap-2">
          {filterChips.map((chip) => (
            <button
              key={chip.key}
              onClick={() => onStatusFilterChange(chip.key)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                statusFilter === chip.key
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                  : "bg-white dark:bg-gray-900/80 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-blue-400"
              }`}
            >
              {chip.label}
              <span
                className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${statusFilter === chip.key ? "bg-white/20" : "bg-gray-100 dark:bg-gray-800"}`}
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

        {/* Teacher Cards Grid */}
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20 bg-white dark:bg-gray-900/80 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700"
            >
              <Users className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">
                No teachers found
              </p>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filtered.map((teacher, idx) => {
                const config = statusConfig[teacher.overall_status];
                const StatusIcon = config.icon;
                const progressPct =
                  teacher.total_subjects > 0
                    ? Math.round(
                        (teacher.submitted_count / teacher.total_subjects) *
                          100,
                      )
                    : 0;

                return (
                  <motion.div
                    key={teacher.user_id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: idx * 0.04 }}
                    onClick={() => setSelectedTeacherForModal(teacher)}
                    className="group cursor-pointer bg-white dark:bg-gray-900/80 rounded-2xl border border-gray-100 dark:border-gray-800/50 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-xl transition-all duration-300 overflow-hidden"
                  >
                    {/* Top gradient bar */}
                    <div className={`h-1.5 w-full ${config.bg} opacity-90`} />

                    <div className="p-5">
                      <div className="flex items-start gap-4 mb-4">
                        {/* Avatar */}
                        <div
                          className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                          style={{
                            backgroundColor:
                              teacher.schemes[0]?.subject_color || "#3B82F6",
                          }}
                        >
                          {getInitials(teacher.full_name)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-gray-900 dark:text-white text-sm truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {teacher.full_name}
                          </h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            @{teacher.username}
                          </p>
                          <div className="mt-1.5">
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${config.light} ${config.text} ${config.border}`}
                            >
                              <StatusIcon className="w-3 h-3" />
                              {config.label}
                            </span>
                          </div>
                        </div>

                        <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 transition-colors flex-shrink-0 mt-1" />
                      </div>

                      {/* Stats row */}
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        <div className="text-center bg-gray-50 dark:bg-gray-800/60 rounded-xl p-2">
                          <div className="text-base font-black text-gray-900 dark:text-white">
                            {teacher.total_subjects}
                          </div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                            Subjects
                          </div>
                        </div>
                        <div className="text-center bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-2">
                          <div className="text-base font-black text-emerald-600 dark:text-emerald-400">
                            {teacher.submitted_count}
                          </div>
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                            Done
                          </div>
                        </div>
                        <div className="text-center bg-rose-50 dark:bg-rose-900/20 rounded-xl p-2">
                          <div className="text-base font-black text-rose-600 dark:text-rose-400">
                            {teacher.pending_count}
                          </div>
                          <div className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">
                            Pending
                          </div>
                        </div>
                      </div>

                        <div className="space-y-4">
                          {/* Submission Progress bar */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] uppercase font-black tracking-widest text-gray-400 dark:text-gray-500">
                              <span className="flex items-center gap-1.5">
                                <BookOpen className="w-3 h-3 text-blue-500" />
                                Submission Progress
                              </span>
                              <span className="font-bold text-gray-900 dark:text-white bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-md">
                                {progressPct}%
                              </span>
                            </div>
                            <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden p-[1px]">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${progressPct}%` }}
                                transition={{
                                  duration: 0.8,
                                  ease: "easeOut",
                                  delay: 0.1 + idx * 0.04,
                                }}
                                className="h-full rounded-full shadow-sm"
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
                          </div>

                          {/* Validation Progress bar */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] uppercase font-black tracking-widest text-gray-400 dark:text-gray-500">
                              <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                Validation Status
                              </span>
                              <span className="font-bold text-gray-900 dark:text-white bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-md">
                                {(() => {
                                  const submitted = teacher.schemes.filter(s => s.status === 'submitted');
                                  if (submitted.length === 0) return 0;
                                  const validated = submitted.filter(s => s.validation_status === 'APPROVED' || s.validation_status === 'REJECTED');
                                  return Math.round((validated.length / submitted.length) * 100);
                                })()}%
                              </span>
                            </div>
                            <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden p-[1px]">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ 
                                  width: `${(() => {
                                    const submitted = teacher.schemes.filter(s => s.status === 'submitted');
                                    if (submitted.length === 0) return 0;
                                    const validated = submitted.filter(s => s.validation_status === 'APPROVED' || s.validation_status === 'REJECTED');
                                    return Math.round((validated.length / submitted.length) * 100);
                                  })()}%` 
                                }}
                                transition={{
                                  duration: 0.8,
                                  ease: "easeOut",
                                  delay: 0.2 + idx * 0.04,
                                }}
                                className="h-full rounded-full shadow-sm"
                                style={{
                                  backgroundColor: (() => {
                                    const submitted = teacher.schemes.filter(s => s.status === 'submitted');
                                    if (submitted.length === 0) return "#9ca3af";
                                    const validated = submitted.filter(s => s.validation_status === 'APPROVED' || s.validation_status === 'REJECTED');
                                    const pct = Math.round((validated.length / submitted.length) * 100);
                                    if (pct >= 100) return "#3b82f6";
                                    if (pct > 0) return "#6366f1";
                                    return "#9ca3af";
                                  })()
                                }}
                              />
                            </div>
                          </div>
                        </div>

                      {/* Subjects preview */}
                      {teacher.schemes.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {teacher.schemes.slice(0, 3).map((s) => (
                            <span
                              key={`${s.subject_id}-${s.class_group_id}`}
                              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                            >
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{
                                  backgroundColor: s.subject_color || "#3B82F6",
                                }}
                              />
                              {s.subject_name}
                            </span>
                          ))}
                          {teacher.schemes.length > 3 && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                              +{teacher.schemes.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </AnimatePresence>
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
