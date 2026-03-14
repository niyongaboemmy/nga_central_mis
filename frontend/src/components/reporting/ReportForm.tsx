import React, { useState, useEffect, useRef } from "react";
import {
  X,
  ChevronRight,
  ChevronLeft,
  Save,
  Sparkles,
  Plus,
  Trash2,
  ArrowRight,
  Shield,
  Smile,
  AlertTriangle,
  Users,
  BookOpen,
  MessageSquare,
  Zap,
  Calendar,
} from "lucide-react";
import { reportsApi } from "../../api/reports";
import {
  academicTermsApi,
  classGroupsApi,
  teacherSubjectAssignmentsApi,
} from "../../api/academics";
import { useToast } from "../../contexts/ToastContext";
import { useUser } from "../../contexts/UserContext";
import { format } from "date-fns";

const parseLocalNoShift = (dateStr: string) => {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, d);
};

interface ReportFormProps {
  onClose: () => void;
  initialRange: { start: string; end: string } | null;
  existingReport?: any;
}

const ReportForm: React.FC<ReportFormProps> = ({
  onClose,
  initialRange,
  existingReport,
}) => {
  const { showToast } = useToast();
  const { user } = useUser();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [hasAutoFilled, setHasAutoFilled] = useState(false);
  const initialized = useRef(false);

  // Lookup data
  const [terms, setTerms] = useState<any[]>([]);
  const [classGroups, setClassGroups] = useState<any[]>([]);

  // Form State
  const [formData, setFormData] = useState({
    academic_term_id: "",
    class_group_id: "",
    week_number: "",
    start_date: initialRange?.start ? initialRange.start : "",
    end_date: initialRange?.end ? initialRange.end : "",
    progress_status: "ON_TRACK",
    key_highlights: "",
    challenges_encountered: "",
    metrics: {
      lessons_delivered_count: 0,
      mentorship_sessions_count: 0,
      active_students_count: 0,
      struggling_students_count: 0,
    },
    topics: [] as any[],
    lessons: [] as any[],
    mentorship_sessions: [] as any[],
    project_updates: [] as any[],
    reflections: {
      what_worked_well: "",
      improvement_areas: "",
      academic_support_needed: "",
      technical_support_needed: "",
      infrastructure_support_needed: "",
      coordination_support_needed: "",
    },
  });

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    loadLookupData();
    if (existingReport) {
      loadExistingReport(existingReport.report_id);
    }
  }, [existingReport]);

  // Automatic Auto-Fill trigger
  useEffect(() => {
    const { start_date, end_date, class_group_id } = formData;
    if (
      !existingReport &&
      !hasAutoFilled &&
      start_date &&
      end_date &&
      class_group_id
    ) {
      handleAutoFill();
      setHasAutoFilled(true);
    }
  }, [
    formData.start_date,
    formData.end_date,
    formData.class_group_id,
    existingReport,
    hasAutoFilled,
  ]);

  const loadExistingReport = async (id: number) => {
    setLoading(true);
    try {
      const res = await reportsApi.getById(id);
      const data = (res as any).data?.data || (res as any).data;
      if (data) {
        setFormData({
          academic_term_id: data.academic_term_id?.toString() || "",
          class_group_id: data.class_group_id?.toString() || "",
          week_number: data.week_number?.toString() || "",
          start_date: data.start_date,
          end_date: data.end_date,
          progress_status: data.progress_status,
          key_highlights: data.key_highlights || "",
          challenges_encountered: data.challenges_encountered || "",
          metrics: {
            lessons_delivered_count: data.lessons_delivered_count || 0,
            mentorship_sessions_count: data.mentorship_sessions_count || 0,
            active_students_count: data.active_students_count || 0,
            struggling_students_count: data.struggling_students_count || 0,
          },
          topics: (data.topics || []).map((t: any) => ({
            topic_name: t.topic_name,
            is_planned_for_next_week: !!t.is_planned_for_next_week,
          })),
          lessons: (data.lessons || []).map((l: any) => ({
            lesson_title: l.lesson_title,
            planned: !!l.planned,
            delivered: !!l.delivered,
            notes: l.notes,
          })),
          mentorship_sessions: (data.mentorship || []).map((m: any) => ({
            student_id: m.student_id ? m.student_id.toString() : (m.student_name || ""),
            session_date: m.session_date,
            notes: m.notes,
          })),
          project_updates: (data.projectUpdates || []).map((p: any) => ({
            project_name: p.project_name,
            role: p.role,
            status: p.status,
            work_completed: p.work_completed,
          })),
          reflections: data.reflections
            ? {
                what_worked_well: data.reflections.what_worked_well || "",
                improvement_areas: data.reflections.improvement_areas || "",
                academic_support_needed:
                  data.reflections.academic_support_needed || "",
                technical_support_needed:
                  data.reflections.technical_support_needed || "",
                infrastructure_support_needed:
                  data.reflections.infrastructure_support_needed || "",
                coordination_support_needed:
                  data.reflections.coordination_support_needed || "",
              }
            : {
                what_worked_well: "",
                improvement_areas: "",
                academic_support_needed: "",
                technical_support_needed: "",
                infrastructure_support_needed: "",
                coordination_support_needed: "",
              },
        });
      }
    } catch (error) {
      showToast("Failed to load report details", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadLookupData = async () => {
    try {
      const [termsRes, groupsRes] = await Promise.all([
        academicTermsApi.getAll(),
        classGroupsApi.getAll(),
      ]);
      const termsData =
        (termsRes as any).data?.data || (termsRes as any).data || [];
      const groupsData =
        (groupsRes as any).data?.data || (groupsRes as any).data || [];

      setTerms(Array.isArray(termsData) ? termsData : []);
      setClassGroups(Array.isArray(groupsData) ? groupsData : []);

      // Select current term by default
      if (Array.isArray(termsData)) {
        const currentTerm = termsData.find((t: any) => t.is_current);
        if (currentTerm) {
          setFormData((prev) => ({
            ...prev,
            academic_term_id: currentTerm.academic_term_id.toString(),
          }));
        }
      }

      // Auto-select Class Group if user is a teacher
      if (user?.user?.user_id) {
        try {
          const assignmentsRes =
            await teacherSubjectAssignmentsApi.getByTeacher(user.user.user_id);
          const assignments =
            (assignmentsRes as any).data?.data ||
            (assignmentsRes as any).data ||
            [];
          if (
            Array.isArray(assignments) &&
            assignments.length > 0 &&
            !formData.class_group_id
          ) {
            setFormData((prev) => ({
              ...prev,
              class_group_id: assignments[0].class_group_id.toString(),
            }));
          }
        } catch (e) {
          console.error("Failed to fetch teacher assignments", e);
        }
      }
    } catch (error) {
      console.error("Failed to load lookup data", error);
    }
  };

  const handleAutoFill = async () => {
    if (!formData.start_date || !formData.end_date) {
      showToast("Please select a date range first", "warning");
      return;
    }

    setAutoFilling(true);
    try {
      const res = await reportsApi.getAutoFill({
        start_date: formData.start_date,
        end_date: formData.end_date,
        class_group_id: formData.class_group_id
          ? parseInt(formData.class_group_id)
          : undefined,
        academic_term_id: formData.academic_term_id
          ? parseInt(formData.academic_term_id)
          : undefined,
      });

      const data = (res as any).data?.data || (res as any).data;

      setFormData((prev) => ({
        ...prev,
        class_group_id: data.class_group_id
          ? data.class_group_id.toString()
          : prev.class_group_id,
        progress_status: data.suggestedStatus || prev.progress_status,
        metrics: {
          ...prev.metrics,
          lessons_delivered_count:
            data.metrics?.lessons_delivered_count ??
            prev.metrics.lessons_delivered_count,
          mentorship_sessions_count:
            data.metrics?.mentorship_sessions_count ??
            prev.metrics.mentorship_sessions_count,
        },
        topics: (data.topics || []).map((t: any) => ({
          topic_name: typeof t === "string" ? t : `${t.subject}: ${t.name}`,
          is_planned_for_next_week: false,
        })),
        lessons: (data.lessons || []).map((l: any) => ({
          lesson_title: l.title,
          planned: true,
          delivered: true,
          notes: l.summary,
        })),
      }));
      showToast(
        "Report data intelligently filled from your lesson plans and SOW",
        "success",
      );
    } catch (error) {
      showToast("Failed to fetch auto-fill data", "error");
    } finally {
      setAutoFilling(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (existingReport) {
        await reportsApi.update(existingReport.report_id, formData);
        showToast("Report updated successfully!", "success");
      } else {
        await reportsApi.submit(formData);
        showToast("Report submitted successfully!", "success");
      }
      onClose();
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to process report",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const addTopic = () =>
    setFormData((p) => ({
      ...p,
      topics: [
        ...p.topics,
        { topic_name: "", is_planned_for_next_week: false },
      ],
    }));
  const addLesson = () =>
    setFormData((p) => ({
      ...p,
      lessons: [
        ...p.lessons,
        { lesson_title: "", planned: true, delivered: true, notes: "" },
      ],
    }));
  const addMentorship = () =>
    setFormData((p) => ({
      ...p,
      mentorship_sessions: [
        ...p.mentorship_sessions,
        {
          student_id: "",
          session_date: p.start_date, // Use master report date
          notes: "",
        },
      ],
    }));
  const addProject = () =>
    setFormData((p) => ({
      ...p,
      project_updates: [
        ...p.project_updates,
        { project_name: "", role: "", status: "ON_TRACK", work_completed: "" },
      ],
    }));

  const updateArrayItem = (
    arrayName: string,
    index: number,
    field: string,
    value: any,
  ) => {
    setFormData((prev) => {
      const newArray = [...(prev as any)[arrayName]];
      newArray[index] = { ...newArray[index], [field]: value };
      return { ...prev, [arrayName]: newArray };
    });
  };

  const removeArrayItem = (arrayName: string, index: number) => {
    setFormData((prev) => {
      const newArray = [...(prev as any)[arrayName]];
      newArray.splice(index, 1);
      return { ...prev, [arrayName]: newArray };
    });
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden dark:text-white">
      {/* Navbar */}
      <div className="flex items-center justify-between px-8 py-4 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center space-x-4">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-all"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">
            Daily Instructor Report
          </h1>
          {existingReport && (
            <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 px-3 py-1 rounded-full text-xs font-bold border border-green-100 dark:border-green-800 flex items-center space-x-1">
              <Shield className="w-3 h-3" />
              <span>Reported</span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-4">
          <div className="hidden md:flex items-center space-x-2 mr-8">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`h-2 w-12 rounded-full transition-all duration-300 ${step >= i ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-700"}`}
              />
            ))}
          </div>

          <button
            onClick={handleAutoFill}
            disabled={autoFilling}
            className="flex items-center space-x-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-4 py-2 rounded-full text-sm font-semibold hover:bg-blue-100 transition-all border border-blue-100 dark:border-blue-800 disabled:opacity-50"
          >
            <Sparkles
              className={`w-4 h-4 ${autoFilling ? "animate-spin" : ""}`}
            />
            <span>{autoFilling ? "Filling..." : "Auto-Fill"}</span>
          </button>

          {step < 5 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-2 rounded-full font-bold hover:bg-blue-700 transition-all shadow-blue-200 dark:shadow-blue-900/20"
            >
              <span>Next Step</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center space-x-2 bg-green-600 text-white px-8 py-2 rounded-full font-bold hover:bg-green-700 transition-all shadow-ful shadow-green-200 dark:shadow-green-900/20 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? (existingReport ? "Updating..." : "Submitting...") : (existingReport ? "Update Report" : "Submit Report")}</span>
            </button>
          )}
        </div>
      </div>

      {/* Form Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-black p-8">
        <div className="max-w-4xl mx-auto pb-20">
          {/* STEP 1: BASICS */}
          {step === 1 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right duration-500">
              <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-800">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl">
                    <Zap className="w-6 h-6 text-blue-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                    General Information
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                      Academic Term
                    </p>
                    {initialRange || existingReport ? (
                      <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
                        {terms.find(
                          (t) =>
                            t.academic_term_id.toString() ===
                            formData.academic_term_id,
                        )?.name || "N/A"}
                      </p>
                    ) : (
                      <select
                        value={formData.academic_term_id}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            academic_term_id: e.target.value,
                          }))
                        }
                        className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm font-bold"
                      >
                        <option value="">Select Term</option>
                        {terms.map((t) => (
                          <option
                            key={t.academic_term_id}
                            value={t.academic_term_id}
                          >
                            {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                      Class Group
                    </p>
                    {existingReport ? (
                      <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
                        {classGroups.find(
                          (g) =>
                            g.class_group_id.toString() ===
                            formData.class_group_id,
                        )?.name || "N/A"}
                      </p>
                    ) : (
                      <select
                        value={formData.class_group_id}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            class_group_id: e.target.value,
                          }))
                        }
                        className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm font-bold"
                      >
                        <option value="">Select Class Group</option>
                        {classGroups.map((g) => (
                          <option
                            key={g.class_group_id}
                            value={g.class_group_id}
                          >
                            {g.name} ({g.grade_name})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                      Report Date
                    </p>
                    {initialRange || existingReport ? (
                      <div className="flex items-center space-x-2 text-sm font-bold text-blue-600">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>
                          {format(
                            parseLocalNoShift(formData.start_date),
                            "PPP",
                          )}
                        </span>
                      </div>
                    ) : (
                      <input
                        type="date"
                        value={formData.start_date}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            start_date: e.target.value,
                            end_date: e.target.value,
                            mentorship_sessions: p.mentorship_sessions.map(
                              (s) => ({ ...s, session_date: e.target.value }),
                            ),
                          }))
                        }
                        className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm font-bold"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 dark:text-white rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-800">
                <h3 className="text-lg font-bold mb-4">
                  Highlights & Challenges
                </h3>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">
                      Key Highlights (What happened today?)
                    </label>
                    <textarea
                      value={formData.key_highlights}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          key_highlights: e.target.value,
                        }))
                      }
                      rows={3}
                      placeholder="E.g. Successful completion of the final project module..."
                      className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-xl p-4 focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">
                      Challenges Encountered
                    </label>
                    <textarea
                      value={formData.challenges_encountered}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          challenges_encountered: e.target.value,
                        }))
                      }
                      rows={3}
                      placeholder="E.g. Electricity outage on Tuesday affected lab work..."
                      className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-xl p-4 focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: METRICS */}
          {step === 2 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right duration-500">
              <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-800">
                <div className="flex items-center space-x-3 mb-8">
                  <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-2xl">
                    <Users className="w-6 h-6 text-purple-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                    Quantitative Metrics
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Counter
                    label="Lessons Delivered"
                    value={formData.metrics.lessons_delivered_count}
                    onChange={(v) =>
                      setFormData((p) => ({
                        ...p,
                        metrics: { ...p.metrics, lessons_delivered_count: v },
                      }))
                    }
                    readOnly={formData.lessons.length > 0}
                  />
                  <Counter
                    label="Mentorship Sessions"
                    value={formData.metrics.mentorship_sessions_count}
                    onChange={(v) =>
                      setFormData((p) => ({
                        ...p,
                        metrics: { ...p.metrics, mentorship_sessions_count: v },
                      }))
                    }
                    readOnly={formData.mentorship_sessions.length > 0}
                  />
                  <Counter
                    label="Active Students"
                    value={formData.metrics.active_students_count}
                    onChange={(v) =>
                      setFormData((p) => ({
                        ...p,
                        metrics: { ...p.metrics, active_students_count: v },
                      }))
                    }
                  />
                  <Counter
                    label="Struggling Students"
                    value={formData.metrics.struggling_students_count}
                    onChange={(v) =>
                      setFormData((p) => ({
                        ...p,
                        metrics: { ...p.metrics, struggling_students_count: v },
                      }))
                    }
                  />
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-800">
                <h3 className="text-lg font-bold mb-6">
                  Overall Progress Status
                </h3>
                <div className="flex flex-wrap gap-4">
                  {[
                    {
                      id: "ON_TRACK",
                      label: "On Track",
                      color: "green",
                      icon: <Smile className="w-5 h-5" />,
                    },
                    {
                      id: "SLIGHTLY_BEHIND",
                      label: "Slightly Behind",
                      color: "amber",
                      icon: <AlertTriangle className="w-5 h-5" />,
                    },
                    {
                      id: "AHEAD",
                      label: "Ahead of Schedule",
                      color: "blue",
                      icon: <Zap className="w-5 h-5" />,
                    },
                  ].map((status) => (
                    <button
                      key={status.id}
                      onClick={() =>
                        setFormData((p) => ({
                          ...p,
                          progress_status: status.id,
                        }))
                      }
                      className={`flex items-center space-x-3 px-6 py-4 rounded-2xl border-2 transition-all ${
                        formData.progress_status === status.id
                          ? `bg-${status.color}-50 dark:bg-${status.color}-900/20 border-${status.color}-500 text-${status.color}-700 dark:text-${status.color}-300`
                          : "bg-gray-50 dark:bg-gray-800 border-transparent text-gray-500"
                      }`}
                    >
                      {status.icon}
                      <span className="font-bold">{status.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: CONTENT */}
          {step === 3 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right duration-500">
              <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center space-x-3">
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl">
                      <BookOpen className="w-6 h-6 text-blue-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                      Topics Covered
                    </h2>
                  </div>
                  <button
                    onClick={addTopic}
                    className="bg-blue-600 text-white p-2 rounded-xl hover:bg-blue-700 transition-all  shadow-blue-200 dark:shadow-blue-900/20"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-4">
                  {formData.topics.map((topic, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col md:flex-row md:items-center gap-4 bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl group border border-transparent hover:border-blue-200 transition-all"
                    >
                      <div className="flex-1">
                        <input
                          value={topic.topic_name}
                          onChange={(e) =>
                            updateArrayItem(
                              "topics",
                              idx,
                              "topic_name",
                              e.target.value,
                            )
                          }
                          placeholder="Module / Topic Title"
                          className="w-full bg-white dark:bg-gray-900 border-none rounded-xl p-3 focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <label className="flex items-center space-x-2 cursor-pointer bg-white dark:bg-gray-900 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700">
                        <input
                          type="checkbox"
                          checked={topic.is_planned_for_next_week}
                          onChange={(e) =>
                            updateArrayItem(
                              "topics",
                              idx,
                              "is_planned_for_next_week",
                              e.target.checked,
                            )
                          }
                          className="w-5 h-5 rounded-lg text-blue-600"
                        />
                        <span className="text-sm font-medium">
                          Next Session?
                        </span>
                      </label>
                      <button
                        onClick={() => removeArrayItem("topics", idx)}
                        className="p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                  {formData.topics.length === 0 && (
                    <p className="text-center py-8 text-gray-400 italic">
                      No topics added. Use Auto-Fill or click +
                    </p>
                  )}
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-lg font-bold">Log Lessons</h3>
                  <button
                    onClick={addLesson}
                    className="flex items-center space-x-2 text-blue-600 font-bold hover:underline"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Manual Lesson</span>
                  </button>
                </div>

                <div className="space-y-6">
                  {formData.lessons.map((lesson, idx) => (
                    <div
                      key={idx}
                      className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700/50 overflow-hidden"
                    >
                      <div className="p-6 border-b border-gray-100 dark:border-gray-700/50 flex items-center justify-between">
                        <input
                          value={lesson.lesson_title}
                          onChange={(e) =>
                            updateArrayItem(
                              "lessons",
                              idx,
                              "lesson_title",
                              e.target.value,
                            )
                          }
                          placeholder="Lesson Title"
                          className="bg-transparent border-none text-base font-bold text-gray-800 dark:text-white focus:ring-0 w-full"
                        />
                        <button
                          onClick={() => removeArrayItem("lessons", idx)}
                          className="p-2 text-gray-400 hover:text-red-500 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex items-center space-x-6">
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={lesson.planned}
                              onChange={(e) =>
                                updateArrayItem(
                                  "lessons",
                                  idx,
                                  "planned",
                                  e.target.checked,
                                )
                              }
                              className="w-4 h-4 rounded-lg text-blue-600"
                            />
                            <span className="font-medium text-sm">Planned</span>
                          </label>
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={lesson.delivered}
                              onChange={(e) =>
                                updateArrayItem(
                                  "lessons",
                                  idx,
                                  "delivered",
                                  e.target.checked,
                                )
                              }
                              className="w-4 h-4 rounded-lg text-green-600"
                            />
                            <span className="font-medium text-sm">
                              Delivered
                            </span>
                          </label>
                        </div>
                        <textarea
                          placeholder="Short summary/notes about this lesson..."
                          value={lesson.notes}
                          onChange={(e) =>
                            updateArrayItem(
                              "lessons",
                              idx,
                              "notes",
                              e.target.value,
                            )
                          }
                          className="w-full bg-white dark:bg-gray-900 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: MENTORSHIP & PROJECTS */}
          {step === 4 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right duration-500">
              <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center space-x-3">
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-2xl">
                      <Shield className="w-6 h-6 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                      Mentorship & Projects
                    </h2>
                  </div>
                  <button
                    onClick={addMentorship}
                    className="bg-green-600 text-white px-4 py-2 rounded-xl hover:bg-green-700 transition-all  shadow-green-200 dark:shadow-green-900/20 text-sm font-bold flex items-center space-x-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Log Mentorship</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {formData.mentorship_sessions.map((session, idx) => (
                    <div
                      key={idx}
                      className="bg-gray-50 dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 space-y-4"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input
                          placeholder="Student Name / ID"
                          value={session.student_id}
                          onChange={(e) =>
                            updateArrayItem(
                              "mentorship_sessions",
                              idx,
                              "student_id",
                              e.target.value,
                            )
                          }
                          className="w-full bg-white dark:bg-gray-900 border-none rounded-xl p-3 focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="relative group/date">
                          <label className="text-[10px] absolute -top-2 left-3 bg-gray-50 dark:bg-gray-800 px-1 font-bold text-blue-500 uppercase tracking-widest z-10">
                            Session Date
                          </label>
                          <div className="w-full bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-3 text-gray-500 font-bold flex items-center justify-between">
                            <span>
                              {format(
                                parseLocalNoShift(session.session_date),
                                "dd/MM/yyyy",
                              )}
                            </span>
                            <Shield className="w-4 h-4 text-blue-400 opacity-50" />
                          </div>
                        </div>
                      </div>
                      <textarea
                        placeholder="Session focus & outcomes..."
                        value={session.notes}
                        onChange={(e) =>
                          updateArrayItem(
                            "mentorship_sessions",
                            idx,
                            "notes",
                            e.target.value,
                          )
                        }
                        className="w-full bg-white dark:bg-gray-900 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={() =>
                          removeArrayItem("mentorship_sessions", idx)
                        }
                        className="text-red-500 text-sm font-bold flex items-center space-x-1 hover:underline"
                      >
                        <Trash2 className="w-4 h-4" /> <span>Remove</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-lg font-bold">
                    Curriculum / Capstone Projects
                  </h3>
                  <button
                    onClick={addProject}
                    className="text-blue-600 font-bold hover:underline flex items-center space-x-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Project Update</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {formData.project_updates.map((proj, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 dark:bg-gray-800 p-6 rounded-2xl"
                    >
                      <input
                        placeholder="Project Name"
                        value={proj.project_name}
                        onChange={(e) =>
                          updateArrayItem(
                            "project_updates",
                            idx,
                            "project_name",
                            e.target.value,
                          )
                        }
                        className="w-full bg-white dark:bg-gray-900 border-none rounded-xl p-3"
                      />
                      <input
                        placeholder="Work Completed"
                        value={proj.work_completed}
                        onChange={(e) =>
                          updateArrayItem(
                            "project_updates",
                            idx,
                            "work_completed",
                            e.target.value,
                          )
                        }
                        className="w-full bg-white dark:bg-gray-900 border-none rounded-xl p-3 md:col-span-2"
                      />
                      <select
                        value={proj.status}
                        onChange={(e) =>
                          updateArrayItem(
                            "project_updates",
                            idx,
                            "status",
                            e.target.value,
                          )
                        }
                        className="w-full bg-white dark:bg-gray-900 border-none rounded-xl p-3"
                      >
                        <option value="ON_TRACK">On Track</option>
                        <option value="DELAYED">Delayed</option>
                        <option value="COMPLETE">Complete</option>
                      </select>
                      <button
                        onClick={() => removeArrayItem("project_updates", idx)}
                        className="text-red-500 md:col-start-3 justify-self-end"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: REFLECTIONS */}
          {step === 5 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right duration-500">
              <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-800">
                <div className="flex items-center space-x-3 mb-8">
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-2xl">
                    <MessageSquare className="w-6 h-6 text-amber-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                    Reflections & Support
                  </h2>
                </div>

                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ReflectField
                      label="What worked well today?"
                      value={formData.reflections.what_worked_well}
                      onChange={(v) =>
                        setFormData((p) => ({
                          ...p,
                          reflections: {
                            ...p.reflections,
                            what_worked_well: v,
                          },
                        }))
                      }
                    />
                    <ReflectField
                      label="Areas needing improvement?"
                      value={formData.reflections.improvement_areas}
                      onChange={(v) =>
                        setFormData((p) => ({
                          ...p,
                          reflections: {
                            ...p.reflections,
                            improvement_areas: v,
                          },
                        }))
                      }
                    />
                  </div>

                  <div className="border-t border-gray-100 dark:border-gray-800 pt-8 mt-8">
                    <h3 className="text-lg font-bold mb-6">
                      Support Needed from NGA HQ
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <ReflectField
                        label="Academic Support"
                        placeholder="E.g. Curriculum clarification..."
                        value={formData.reflections.academic_support_needed}
                        onChange={(v) =>
                          setFormData((p) => ({
                            ...p,
                            reflections: {
                              ...p.reflections,
                              academic_support_needed: v,
                            },
                          }))
                        }
                      />
                      <ReflectField
                        label="Technical / IT Support"
                        placeholder="E.g. Server issues in lab..."
                        value={formData.reflections.technical_support_needed}
                        onChange={(v) =>
                          setFormData((p) => ({
                            ...p,
                            reflections: {
                              ...p.reflections,
                              technical_support_needed: v,
                            },
                          }))
                        }
                      />
                      <ReflectField
                        label="Infrastructure Support"
                        placeholder="E.g. Electricity, Space..."
                        value={
                          formData.reflections.infrastructure_support_needed
                        }
                        onChange={(v) =>
                          setFormData((p) => ({
                            ...p,
                            reflections: {
                              ...p.reflections,
                              infrastructure_support_needed: v,
                            },
                          }))
                        }
                      />
                      <ReflectField
                        label="Coordination Support"
                        placeholder="E.g. Partner relations..."
                        value={formData.reflections.coordination_support_needed}
                        onChange={(v) =>
                          setFormData((p) => ({
                            ...p,
                            reflections: {
                              ...p.reflections,
                              coordination_support_needed: v,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-blue-600 rounded-3xl p-10 text-white shadow-2xl shadow-blue-200 dark:shadow-none text-center">
                <h3 className="text-2xl font-bold mb-4">Ready to Submit?</h3>
                <p className="opacity-80 mb-8 max-w-md mx-auto">
                  Please review your entries. Once submitted, your program
                  manager will be notified of your weekly progress.
                </p>
                <button
                  disabled={loading}
                  onClick={handleSubmit}
                  className="bg-white text-blue-600 px-12 py-4 rounded-2xl font-black text-lg hover:scale-105 transition-all shadow-xl"
                >
                  {loading ? "SAVING REPORT..." : "FINALIZE & SUBMIT"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer / Mobile Nav */}
      <div className="shrink-0 flex items-center justify-between px-8 py-4 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
        <button
          disabled={step === 1}
          onClick={() => setStep((s) => s - 1)}
          className="flex items-center space-x-2 text-gray-500 dark:text-white font-bold disabled:opacity-30"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Previous</span>
        </button>

        <div className="text-sm font-bold text-gray-400">Step {step} of 5</div>

        {step < 5 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            className="flex items-center space-x-2 text-blue-600 font-bold"
          >
            <span>Next</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        ) : (
          <div className="w-20" />
        )}
      </div>
    </div>
  );
};

// Helper Components
const Counter: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  readOnly?: boolean;
}> = ({ label, value, onChange, readOnly }) => (
  <div
    className={`flex flex-col space-y-3 p-6 rounded-2xl border transition-all ${readOnly ? "bg-gray-100 dark:bg-gray-800/80 border-gray-200 dark:border-gray-700" : "bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700/50"}`}
  >
    <div className="flex items-center justify-between">
      <label className="text-sm font-bold text-gray-600 dark:text-gray-400">
        {label}
      </label>
      {readOnly && <Shield className="w-4 h-4 text-blue-500" />}
    </div>
    <div className="flex items-center space-x-6">
      {!readOnly && (
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-10 h-10 flex items-center justify-center bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-xl font-bold hover:bg-gray-50 transition-colors"
        >
          -
        </button>
      )}
      <span
        className={`text-3xl font-black tabular-nums ${readOnly ? "text-gray-500" : "text-gray-800 dark:text-white"}`}
      >
        {value}
      </span>
      {!readOnly && (
        <button
          onClick={() => onChange(value + 1)}
          className="w-10 h-10 flex items-center justify-center bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-xl font-bold hover:bg-gray-50 transition-colors"
        >
          +
        </button>
      )}
      {readOnly && (
        <div className="text-[10px] font-bold text-blue-500 uppercase tracking-wider bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-md">
          Locked
        </div>
      )}
    </div>
  </div>
);

const ReflectField: React.FC<{
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}> = ({ label, placeholder, value, onChange }) => (
  <div className="space-y-2">
    <label className="text-sm font-bold text-gray-600 dark:text-gray-400">
      {label}
    </label>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={4}
      placeholder={placeholder || "Your reflection here..."}
      className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-2xl p-4 focus:ring-2 focus:ring-blue-500 transition-all"
    />
  </div>
);

export default ReportForm;
