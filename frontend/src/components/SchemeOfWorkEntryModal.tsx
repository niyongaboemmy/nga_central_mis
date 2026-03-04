import React, { useState, useEffect } from "react";
import Modal from "./ui/Modal";
import { SchemeEntry } from "../api/schemeOfWork";
import {
  BookOpen,
  Target,
  Sword,
  Wrench,
  BarChart,
  Calendar,
  Hash,
} from "lucide-react";

interface SchemeOfWorkEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<SchemeEntry>) => Promise<void>;
  initialData?: SchemeEntry | null;
  title: string;
}

const SchemeOfWorkEntryModal: React.FC<SchemeOfWorkEntryModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  title,
}) => {
  const [formData, setFormData] = useState<Partial<SchemeEntry>>({
    week_number: "",
    start_date: "",
    end_date: "",
    topic: "",
    objective: "",
    methodology: "",
    resources: "",
    evaluation: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        week_number: initialData.week_number,
        start_date: initialData.start_date
          ? initialData.start_date.split("T")[0]
          : "",
        end_date: initialData.end_date
          ? initialData.end_date.split("T")[0]
          : "",
        topic: initialData.topic,
        objective: initialData.objective,
        methodology: initialData.methodology,
        resources: initialData.resources,
        evaluation: initialData.evaluation,
      });
    } else {
      setFormData({
        week_number: "",
        start_date: "",
        end_date: "",
        topic: "",
        objective: "",
        methodology: "",
        resources: "",
        evaluation: "",
      });
    }
  }, [initialData, isOpen]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error("Failed to save entry:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header Metadata Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">
              <Hash className="w-3 h-3" />
              Week Number
            </label>
            <input
              name="week_number"
              value={formData.week_number}
              onChange={handleChange}
              placeholder="e.g. Week 1"
              required
              className="w-full h-11 px-4 text-sm bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-full text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400"
            />
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">
              <Calendar className="w-3 h-3" />
              Start Date
            </label>
            <input
              name="start_date"
              type="date"
              value={formData.start_date}
              onChange={handleChange}
              required
              className="w-full h-11 px-4 text-sm bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-full text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">
              <Calendar className="w-3 h-3" />
              End Date
            </label>
            <input
              name="end_date"
              type="date"
              value={formData.end_date}
              onChange={handleChange}
              required
              className="w-full h-11 px-4 text-sm bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-full text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
            />
          </div>
        </div>

        {/* Content Section */}
        <div className="space-y-5">
          <div className="bg-gray-50/50 dark:bg-gray-900/20 p-5 rounded-3xl border border-gray-100 dark:border-gray-800/50 space-y-4">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest ml-1">
                <BookOpen className="w-4 h-4" />
                Topic & Indicative Content
              </label>
              <textarea
                name="topic"
                value={formData.topic}
                onChange={handleChange}
                rows={3}
                className="w-full px-5 py-3 text-sm bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400 resize-none"
                placeholder="What will be covered this week?"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[11px] font-bold text-green-600 dark:text-green-400 uppercase tracking-widest ml-1">
                <Target className="w-4 h-4" />
                Learning Outcomes / Objectives
              </label>
              <textarea
                name="objective"
                value={formData.objective}
                onChange={handleChange}
                rows={2}
                className="w-full px-5 py-3 text-sm bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all placeholder:text-gray-400 resize-none"
                placeholder="What should students be able to do?"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest ml-1">
                  <Sword className="w-4 h-4" />
                  Methodology / Activities
                </label>
                <textarea
                  name="methodology"
                  value={formData.methodology}
                  onChange={handleChange}
                  rows={2}
                  className="w-full px-5 py-3 text-sm bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all placeholder:text-gray-400 resize-none"
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[11px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-widest ml-1">
                  <Wrench className="w-4 h-4" />
                  Resources
                </label>
                <textarea
                  name="resources"
                  value={formData.resources}
                  onChange={handleChange}
                  rows={2}
                  className="w-full px-5 py-3 text-sm bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all placeholder:text-gray-400 resize-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-widest ml-1">
                <BarChart className="w-4 h-4" />
                Evaluation / Assessment
              </label>
              <textarea
                name="evaluation"
                value={formData.evaluation}
                onChange={handleChange}
                rows={2}
                className="w-full px-5 py-3 text-sm bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all placeholder:text-gray-400 resize-none"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-6 border-t border-gray-50 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-8 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-all shadow-lg shadow-blue-500/25 active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving && (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            )}
            {isSaving
              ? "Saving..."
              : initialData
                ? "Update Week"
                : "Save Week Entry"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default SchemeOfWorkEntryModal;
