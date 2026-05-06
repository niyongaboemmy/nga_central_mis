import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  FolderOpen,
  LayoutGrid,
  FileText,
  Loader2,
} from "lucide-react";
import { subjectDetailApi, SubjectDetail } from "../../api/curriculum";
import { useToast } from "../../contexts/ToastContext";
import CurriculumTab from "./CurriculumTab";
import SubjectMaterialsTab from "./SubjectMaterialsTab";

type Tab = "overview" | "curriculum" | "materials";

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "curriculum", label: "Curriculum", icon: BookOpen },
  { id: "materials", label: "Materials", icon: FolderOpen },
];

const SubjectDetailPage: React.FC = () => {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [subject, setSubject] = useState<SubjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("curriculum");

  const id = parseInt(subjectId || "0");

  useEffect(() => {
    if (!id) return;
    loadSubject();
  }, [id]);

  const loadSubject = async () => {
    try {
      const res = await subjectDetailApi.get(id);
      setSubject(res.data.data);
    } catch {
      showToast("Failed to load subject details", "error");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <FileText className="w-12 h-12 text-gray-400" />
        <p className="text-gray-500 dark:text-gray-400">Subject not found</p>
        <button
          onClick={() => navigate("/my-subjects")}
          className="text-blue-600 hover:underline text-sm"
        >
          Back to My Subjects
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 pb-12">
      {/* Top bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700/50 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          {/* Breadcrumb + back */}
          <div className="flex items-center gap-3 py-3">
            <button
              onClick={() => navigate("/my-subjects")}
              className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              My Subjects
            </button>
            <span className="text-gray-300 dark:text-slate-600">/</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {subject.name}
            </span>
          </div>

          {/* Subject header */}
          <div className="flex items-start gap-4 pb-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm"
              style={{ backgroundColor: subject.color || "#3B82F6" }}
            >
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                  {subject.name}
                </h1>
                {subject.code && (
                  <span className="text-xs font-mono bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-md">
                    {subject.code}
                  </span>
                )}
                {subject.category_name && (
                  <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">
                    {subject.category_name}
                  </span>
                )}
              </div>
              {subject.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
                  {subject.description}
                </p>
              )}
              {/* Stats chips */}
              <div className="flex flex-wrap gap-3 mt-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-gray-800 dark:text-gray-200">
                    {subject.competency_count}
                  </span>{" "}
                  competenc{subject.competency_count === 1 ? "y" : "ies"}
                </span>
                <span className="text-gray-300 dark:text-slate-600 text-xs">•</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-gray-800 dark:text-gray-200">
                    {subject.document_count}
                  </span>{" "}
                  document{subject.document_count === 1 ? "" : "s"}
                </span>
                <span className="text-gray-300 dark:text-slate-600 text-xs">•</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-gray-800 dark:text-gray-200">
                    {subject.category_count}
                  </span>{" "}
                  categor{subject.category_count === 1 ? "y" : "ies"}
                </span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 -mb-px">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {active && (
                    <motion.div
                      layoutId="tab-underline"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18 }}
          >
            {activeTab === "overview" && (
              <OverviewTab subject={subject} onTabChange={setActiveTab} />
            )}
            {activeTab === "curriculum" && <CurriculumTab subjectId={id} />}
            {activeTab === "materials" && <SubjectMaterialsTab subjectId={id} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

interface OverviewTabProps {
  subject: SubjectDetail;
  onTabChange: (tab: Tab) => void;
}

const OverviewTab: React.FC<OverviewTabProps> = ({ subject, onTabChange }) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <button
      onClick={() => onTabChange("curriculum")}
      className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-200 dark:border-slate-700/50 text-left hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md transition-all group"
    >
      <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
        <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
        {subject.competency_count}
      </div>
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Elements of Competency
      </div>
    </button>

    <button
      onClick={() => onTabChange("materials")}
      className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-200 dark:border-slate-700/50 text-left hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md transition-all group"
    >
      <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
        <FolderOpen className="w-5 h-5 text-green-600 dark:text-green-400" />
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
        {subject.category_count}
      </div>
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Document Categories
      </div>
    </button>

    <button
      onClick={() => onTabChange("materials")}
      className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-200 dark:border-slate-700/50 text-left hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md transition-all group"
    >
      <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
        <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
        {subject.document_count}
      </div>
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Uploaded Documents
      </div>
    </button>

    {subject.description && (
      <div className="sm:col-span-3 bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-200 dark:border-slate-700/50">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Description
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {subject.description}
        </p>
      </div>
    )}
  </div>
);

export default SubjectDetailPage;
