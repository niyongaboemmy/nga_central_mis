import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { LessonPlan, lessonPlanApi } from "../api/lessonPlan";
import { useToast } from "../contexts/ToastContext";

interface LessonPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  entryId: number;
  onSaved: () => void;
  initialData?: LessonPlan | null;
}

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
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>("Header");
  const [loading, setLoading] = useState(false);

  const defaultFormData: Partial<LessonPlan> = {
    entry_id: entryId,
    lesson_date: new Date().toISOString().split("T")[0],
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

  useEffect(() => {
    if (initialData) {
      // Merge initialData with defaultFormData to ensure all required fields exist
      setFormData({ ...defaultFormData, ...initialData, entry_id: entryId });
    } else {
      setFormData({ ...defaultFormData, entry_id: entryId });
    }
    setActiveTab("Header");
  }, [initialData, entryId, isOpen]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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

  const handleSave = async () => {
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

  const renderTabContent = () => {
    switch (activeTab) {
      case "Header":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-right-2">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase">
                Lesson Date
              </label>
              <input
                type="date"
                name="lesson_date"
                value={formData.lesson_date || ""}
                onChange={handleChange}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase">
                Time Slot
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  name="start_time"
                  placeholder="08:30"
                  value={formData.start_time || ""}
                  onChange={handleChange}
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 dark:text-white"
                />
                <input
                  type="text"
                  name="end_time"
                  placeholder="10:30"
                  value={formData.end_time || ""}
                  onChange={handleChange}
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 dark:text-white"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase">
                Sector
              </label>
              <input
                type="text"
                name="sector"
                value={formData.sector || ""}
                onChange={handleChange}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase">
                Trade
              </label>
              <input
                type="text"
                name="trade"
                value={formData.trade || ""}
                onChange={handleChange}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase">
                Instructor Name
              </label>
              <input
                type="text"
                name="instructor_name"
                value={formData.instructor_name || ""}
                onChange={handleChange}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase">
                Class Name
              </label>
              <input
                type="text"
                name="class_name"
                value={formData.class_name || ""}
                onChange={handleChange}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 dark:text-white"
              />
            </div>
          </div>
        );
      case "Objectives":
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase">
                Big Question
              </label>
              <textarea
                name="big_question"
                value={formData.big_question || ""}
                onChange={handleChange}
                rows={2}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 text-gray-900 dark:text-white"
              />
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
                      className="bg-transparent border-b border-gray-200 dark:border-gray-700 px-2 py-1 text-xs font-bold text-gray-900 dark:text-white"
                    />
                    <input
                      type="text"
                      placeholder="Title"
                      value={outcome.title}
                      onChange={(e) =>
                        handleOutcomeChange(idx, "title", e.target.value)
                      }
                      className="col-span-2 bg-transparent border-b border-gray-200 dark:border-gray-700 px-2 py-1 text-xs text-gray-900 dark:text-white"
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
                      className="bg-transparent border-b border-gray-200 dark:border-gray-700 px-2 py-1 text-xs text-gray-900 dark:text-white"
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
                            className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded px-2 py-1 text-xs"
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
                  Trainer Activities
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
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">
                  Learner Activities
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
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-gray-100"
                />
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
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-white"
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
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-white"
                />
              </div>
            </div>
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
                  Trainer Activities
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
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-3 text-sm text-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">
                  Learner Activities
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
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-3 text-sm text-gray-900 dark:text-gray-100"
                />
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
                  className="w-full h-11 px-5 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-full text-gray-900 dark:text-white"
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
                  className="w-full h-11 px-5 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-full text-gray-900 dark:text-white"
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
                      className="w-1/3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-1.5 text-xs font-bold text-blue-600"
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
                      className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-1.5 text-xs text-gray-900 dark:text-gray-100"
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
                  Trainer Activities
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
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-3 text-sm text-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">
                  Learner Activities
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
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-3 text-sm text-gray-900 dark:text-gray-100"
                />
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
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-3 text-sm text-gray-900 dark:text-white"
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
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-3 text-sm text-gray-900 dark:text-white"
                />
              </div>
            </div>
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
                      className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 text-xs text-gray-900 dark:text-gray-100"
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
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-3 text-sm text-gray-900 dark:text-gray-100"
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
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-gray-100"
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
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-white"
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
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-white"
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-6xl bg-white dark:bg-gray-950 rounded-3xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800 animate-in zoom-in-95 duration-300">
          {/* Header */}
          <div className="px-8 py-6 flex items-center justify-between border-b border-gray-50 dark:border-gray-900 bg-white dark:bg-gray-950">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                <LayoutDashboard className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
                  {initialData ? "Refine Lesson Plan" : "Draft New Lesson Plan"}
                </h2>
                <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-1">
                  Step-by-step curriculum planning
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label
                className={`cursor-pointer flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full text-xs font-bold border border-gray-100 dark:border-gray-800 transition-all ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
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
              <button
                onClick={onClose}
                className="p-2 hover:bg-red-50 dark:hover:bg-red-950/30 text-gray-400 hover:text-red-500 rounded-full transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row h-[75vh]">
            {/* Sidebar Navigation */}
            <div className="w-full lg:w-64 bg-gray-50/50 dark:bg-gray-900/10 border-r border-gray-50 dark:border-gray-900 p-6 space-y-1 overflow-y-auto">
              {tabs.map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                      isActive
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                        : "text-gray-500 hover:text-gray-800 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-white dark:hover:bg-gray-900/50"
                    }`}
                  >
                    {getIcon(tab)}
                    {tab}
                  </button>
                );
              })}

              <div className="mt-8 pt-8 border-t border-gray-100 dark:border-gray-900">
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-full text-xs font-black uppercase tracking-widest shadow-lg shadow-green-500/20 transition-all active:scale-95 disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
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
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 rounded-full text-xs font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 mt-2"
                  >
                    {!loading && <Trash2 className="w-4 h-4" />}
                    {loading && (
                      <div className="w-4 h-4 border-2 border-red-600 dark:border-red-400 border-t-transparent rounded-full animate-spin" />
                    )}
                    {loading ? "Deleting..." : "Delete Plan"}
                  </button>
                )}
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-950 p-8">
              <div className="max-w-4xl mx-auto">{renderTabContent()}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LessonPlanModal;
