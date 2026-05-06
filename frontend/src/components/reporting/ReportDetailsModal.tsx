import React, { useState, useEffect, useRef } from "react";
import {
  Edit3,
  Calendar,
  Users,
  BookOpen,
  Shield,
  Zap,
  Smile,
  AlertTriangle,
  FileText,
  ArrowRight,
} from "lucide-react";
import { format } from "date-fns";
import { reportsApi } from "../../api/reports";
import Modal from "../ui/Modal";

interface ReportDetailsModalProps {
  reportId: number;
  onClose: () => void;
  onEdit?: () => void;
  isAdminView?: boolean;
}

const ReportDetailsModal: React.FC<ReportDetailsModalProps> = ({
  reportId,
  onClose,
  onEdit,
  isAdminView = false,
}) => {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const fetchedId = useRef<number | null>(null);

  useEffect(() => {
    const fetchReport = async () => {
      if (fetchedId.current === reportId) return;
      setLoading(true);
      fetchedId.current = reportId;
      try {
        const res = await reportsApi.getById(reportId);
        setReport((res as any).data?.data || (res as any).data);
      } catch (error) {
        console.error("Failed to fetch report details", error);
        fetchedId.current = null; // Allow retry
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [reportId]);

  const parseLocalNoShift = (dateStr: string) => {
    if (!dateStr) return new Date();
    const [y, m, d] = dateStr.split("T")[0].split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-10 flex flex-col items-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-500 text-sm font-medium">
            Loading report details...
          </p>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ON_TRACK":
        return (
          <div className="flex items-center space-x-2 bg-green-50 dark:bg-green-900/20 text-green-600 px-4 py-1.5 rounded-full text-sm font-bold border border-green-100 dark:border-green-800">
            <Smile className="w-4 h-4" /> <span>On Track</span>
          </div>
        );
      case "SLIGHTLY_BEHIND":
        return (
          <div className="flex items-center space-x-2 bg-amber-50 dark:bg-amber-900/20 text-amber-600 px-4 py-1.5 rounded-full text-sm font-bold border border-amber-100 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4" /> <span>Slightly Behind</span>
          </div>
        );
      case "AHEAD":
        return (
          <div className="flex items-center space-x-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 px-4 py-1.5 rounded-full text-sm font-bold border border-blue-100 dark:border-blue-800">
            <Zap className="w-4 h-4" /> <span>Ahead</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      size="2xl"
      title={
        <div className="flex items-center justify-between w-full pr-4">
          <div className="flex items-center space-x-4">
            <div className="p-2.5 bg-blue-600 rounded-xl text-white">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-800 dark:text-white">
                Report Details
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                Week {report.week_number} • Submitted on{" "}
                {format(new Date(report.submission_date), "PPP")}
              </p>
            </div>
          </div>
          {!isAdminView && onEdit && (
            <button
              onClick={onEdit}
              className="flex items-center space-x-2 bg-white dark:bg-slate-800 hover:bg-gray-50 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-xl text-sm font-bold border border-gray-100 dark:border-slate-700 transition-all"
            >
              <Edit3 className="w-4 h-4 text-blue-600" />
              <span>Edit</span>
            </button>
          )}
        </div>
      }
      showCloseButton={true}
      contentClassName="p-0"
    >
      <div className="flex flex-col">
        {/* Scrollable Content */}
        <div className="p-8 space-y-8">
          {/* Summary Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/30">
              <p className="text-[10px] font-bold text-blue-600/60 uppercase tracking-widest mb-1">
                Period
              </p>
              <div className="flex items-center space-x-2 text-gray-800 dark:text-gray-200 text-xs font-bold">
                <Calendar className="w-3.5 h-3.5 text-blue-500" />
                <span>
                  {format(parseLocalNoShift(report.start_date), "dd MMM")} -{" "}
                  {format(parseLocalNoShift(report.end_date), "dd MMM, yyyy")}
                </span>
              </div>
            </div>
            <div className="bg-purple-50/50 dark:bg-purple-900/10 p-4 rounded-2xl border border-purple-100 dark:border-purple-900/30">
              <p className="text-[10px] font-bold text-purple-600/60 uppercase tracking-widest mb-1">
                Status
              </p>
              {getStatusBadge(report.progress_status)}
            </div>
            <div className="bg-emerald-50/50 dark:bg-emerald-900/10 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
              <p className="text-[10px] font-bold text-emerald-600/60 uppercase tracking-widest mb-1">
                Context
              </p>
              <div className="flex flex-col text-gray-800 dark:text-gray-200 text-[11px] font-bold">
                <span className="truncate">{report.program_name}</span>
                <span className="text-emerald-600 text-[9px] uppercase">
                  {report.grade_name}
                </span>
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                Instructor
              </p>
              <div className="flex items-center space-x-2 text-gray-800 dark:text-gray-200 text-xs font-bold">
                <Users className="w-3.5 h-3.5 text-gray-400" />
                <span className="truncate">
                  {report.first_name} {report.last_name}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Highlights */}
            <div className="space-y-3">
              <h3 className="text-base font-black text-gray-800 dark:text-white flex items-center space-x-2 underline decoration-blue-500/30 underline-offset-8">
                <Zap className="w-4 h-4 text-blue-600" />
                <span>Key Highlights</span>
              </h3>
              <div className="bg-white dark:bg-gray-800/50 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 text-sm text-gray-600 dark:text-gray-400 leading-relaxed font-medium">
                {report.key_highlights ||
                  "No highlights recorded for this period."}
              </div>
            </div>

            {/* Challenges */}
            <div className="space-y-3">
              <h3 className="text-base font-black text-gray-800 dark:text-white flex items-center space-x-2 underline decoration-red-500/30 underline-offset-8">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>Challenges</span>
              </h3>
              <div className="bg-white dark:bg-gray-800/50 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 text-sm text-gray-600 dark:text-gray-400 leading-relaxed font-medium">
                {report.challenges_encountered || "No challenges reported."}
              </div>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="space-y-4">
            <h3 className="text-base font-black text-gray-800 dark:text-white flex items-center space-x-2 underline decoration-purple-500/30 underline-offset-8">
              <BarChart2 className="w-4 h-4 text-purple-600" />
              <span>Quantitative Metrics</span>
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  label: "Lessons",
                  value: report.lessons_delivered_count,
                  icon: <BookOpen className="w-4 h-4" />,
                  color: "blue",
                },
                {
                  label: "Mentorship",
                  value: report.mentorship_sessions_count,
                  icon: <Shield className="w-4 h-4" />,
                  color: "green",
                },
                {
                  label: "Active Students",
                  value: report.active_students_count,
                  icon: <Users className="w-4 h-4" />,
                  color: "purple",
                },
                {
                  label: "Struggling",
                  value: report.struggling_students_count,
                  icon: <AlertTriangle className="w-4 h-4" />,
                  color: "amber",
                },
              ].map((m, i) => (
                <div
                  key={i}
                  className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 text-center flex flex-col items-center"
                >
                  <div
                    className={`p-2 bg-${m.color}-50 dark:bg-${m.color}-900/20 text-${m.color}-600 rounded-lg mb-2`}
                  >
                    {m.icon}
                  </div>
                  <div className="text-xl font-black text-gray-800 dark:text-white mb-0.5">
                    {m.value}
                  </div>
                  <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                    {m.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Topics & Lessons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <h3 className="text-base font-black text-gray-800 dark:text-white underline decoration-blue-500/30 underline-offset-8">
                Topics Covered
              </h3>
              <div className="space-y-2">
                {report.topics?.map((t: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center space-x-3 bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 text-sm font-bold group"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span className="text-gray-700 dark:text-gray-300 flex-1">
                      {t.topic_name}
                    </span>
                    {t.is_planned_for_next_week && (
                      <span className="text-[9px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 px-2 py-0.5 rounded-md">
                        Next Week
                      </span>
                    )}
                  </div>
                ))}
                {(!report.topics || report.topics.length === 0) && (
                  <p className="text-gray-400 italic text-sm">
                    No topics listed.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-black text-gray-800 dark:text-white underline decoration-green-500/30 underline-offset-8">
                Lesson Logs
              </h3>
              <div className="space-y-2">
                {report.lessons?.map((l: any, idx: number) => (
                  <div
                    key={idx}
                    className="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 text-sm font-bold"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-gray-800 dark:text-gray-200">
                        {l.lesson_title}
                      </span>
                      <div className="flex space-x-2">
                        {l.planned && (
                          <span className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 text-[7px] uppercase px-1.5 py-0.5 rounded-md">
                            Planned
                          </span>
                        )}
                        {l.delivered && (
                          <span className="bg-green-50 dark:bg-green-900/20 text-green-600 text-[7px] uppercase px-1.5 py-0.5 rounded-md">
                            Delivered
                          </span>
                        )}
                      </div>
                    </div>
                    {l.notes && (
                      <p className="text-[11px] text-gray-500 font-medium leading-relaxed mt-1">
                        {l.notes}
                      </p>
                    )}
                  </div>
                ))}
                {(!report.lessons || report.lessons.length === 0) && (
                  <p className="text-gray-400 italic text-sm">
                    No lessons logged.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Mentorship & Projects */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h3 className="text-base font-black text-gray-800 dark:text-white underline decoration-rose-500/30 underline-offset-8">
                Mentorship Sessions
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {report.mentorship_sessions?.map((s: any, idx: number) => (
                  <div
                    key={idx}
                    className="bg-rose-50/30 dark:bg-rose-900/10 p-4 rounded-2xl border border-rose-100/50 dark:border-rose-900/20"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                        {s.student_name || `Student ID: ${s.student_id}`}
                      </span>
                      <span className="text-[10px] font-bold text-rose-500 bg-rose-50 dark:bg-rose-900/30 px-2 py-0.5 rounded-md">
                        {s.session_date ? format(parseLocalNoShift(s.session_date), "dd MMM") : "-"}
                      </span>
                    </div>
                    {s.notes && (
                      <p className="text-xs text-gray-500 font-medium leading-relaxed italic">
                        "{s.notes}"
                      </p>
                    )}
                  </div>
                ))}
                {(!report.mentorship_sessions ||
                  report.mentorship_sessions.length === 0) && (
                  <p className="text-gray-400 italic text-sm">
                    No mentorship sessions logged.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-black text-gray-800 dark:text-white underline decoration-emerald-500/30 underline-offset-8">
                Capstone Project Updates
              </h3>
              <div className="space-y-3">
                {report.project_updates?.map((p: any, idx: number) => (
                  <div
                    key={idx}
                    className="bg-emerald-50/30 dark:bg-emerald-900/10 p-5 rounded-2xl border border-emerald-100/50 dark:border-emerald-900/20"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="text-sm font-black text-emerald-600 uppercase tracking-tight">
                          {p.project_name}
                        </span>
                        {p.role && (
                          <span className="ml-2 text-[10px] text-gray-400 font-bold uppercase">
                            - {p.role}
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${
                          p.status === "ON_TRACK"
                            ? "bg-green-100 text-green-600"
                            : p.status === "DELAYED" || p.status === "AT_RISK"
                              ? "bg-amber-100 text-amber-600"
                              : p.status === "COMPLETE"
                                ? "bg-blue-100 text-blue-600"
                                : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {p.status?.replace("_", " ")}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs">
                        <span className="font-bold text-gray-600 dark:text-gray-400 uppercase text-[9px] tracking-wider">
                          Work Completed:
                        </span>
                        <p className="text-gray-800 dark:text-gray-200 font-medium mt-1 leading-relaxed">
                          {p.work_completed}
                        </p>
                      </div>
                      {p.key_outputs && (
                        <div className="text-xs border-t border-emerald-100/30 dark:border-emerald-900/10 pt-2">
                          <span className="font-bold text-gray-600 dark:text-gray-400 uppercase text-[9px] tracking-wider">
                            Key Outputs:
                          </span>
                          <p className="text-gray-800 dark:text-gray-200 font-medium mt-1">
                            {p.key_outputs}
                          </p>
                        </div>
                      )}
                      {p.challenges && (
                        <div className="text-xs border-t border-emerald-100/30 dark:border-emerald-900/10 pt-2">
                          <span className="font-bold text-red-500/70 uppercase text-[9px] tracking-wider">
                            Project Challenges:
                          </span>
                          <p className="text-gray-800 dark:text-gray-200 font-medium mt-1">
                            {p.challenges}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {(!report.project_updates ||
                  report.project_updates.length === 0) && (
                  <p className="text-gray-400 italic text-sm">
                    No project updates recorded.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Qualitative Reflections */}
          <div className="space-y-4">
            <h3 className="text-base font-black text-gray-800 dark:text-white underline decoration-indigo-500/30 underline-offset-8">
              Qualitative reflections
            </h3>
            <div className="bg-indigo-50/30 dark:bg-indigo-900/10 p-6 rounded-3xl border border-indigo-100/50 dark:border-indigo-900/20 space-y-6">
              {report.reflections && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[
                    {
                      label: "What Worked Well",
                      value: report.reflections.what_worked_well,
                    },
                    {
                      label: "Improvement Areas",
                      value: report.reflections.improvement_areas,
                    },
                    {
                      label: "Academic Support",
                      value: report.reflections.academic_support_needed,
                    },
                    {
                      label: "Technical Support",
                      value: report.reflections.technical_support_needed,
                    },
                    {
                      label: "Infrastructure",
                      value: report.reflections.infrastructure_support_needed,
                    },
                    {
                      label: "Coordination",
                      value: report.reflections.coordination_support_needed,
                    },
                  ].map(
                    (ref, ridx) =>
                      ref.value && (
                        <div key={ridx} className="space-y-1">
                          <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">
                            {ref.label}
                          </p>
                          <p className="text-sm text-gray-700 dark:text-gray-300 font-medium leading-relaxed">
                            {ref.value}
                          </p>
                        </div>
                      ),
                  )}
                </div>
              )}
              {(!report.reflections || Object.values(report.reflections).every(v => !v)) && (
                <p className="text-gray-400 italic text-sm text-center">
                  No additional reflections provided.
                </p>
              )}
            </div>
          </div>

          {/* Footer Action */}
          {!isAdminView && onEdit && (
            <div className="pt-6 border-t border-gray-50 dark:border-gray-800 flex justify-end">
              <button
                onClick={onEdit}
                className="flex items-center space-x-2.5 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full font-black text-sm shadow-blue-200 dark:shadow-none hover:scale-[1.02] transition-all"
              >
                <Edit3 className="w-4 h-4" />
                <span>CONTINUE TO EDITING</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

// Internal Import replacement for BarChart2 which was missing in initial imports
const BarChart2 = (props: any) => (
  <svg
    {...props}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

export default ReportDetailsModal;
