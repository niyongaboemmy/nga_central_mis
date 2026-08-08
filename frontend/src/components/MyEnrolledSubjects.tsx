import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, FolderOpen, Search, X } from "lucide-react";
import {
  myEnrolledSubjectsApi,
  MyEnrolledSubject,
} from "../api/curriculum";
import { useAcademicPeriod } from "../contexts/AcademicPeriodContext";
import SubjectItemCard from "./subjects/SubjectItemCard";

const MyEnrolledSubjects: React.FC = () => {
  const navigate = useNavigate();
  const { selectedYearId } = useAcademicPeriod();
  const [subjects, setSubjects] = useState<MyEnrolledSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYearId]);

  const loadSubjects = async () => {
    try {
      setLoading(true);
      const res = await myEnrolledSubjectsApi.getAll(selectedYearId ?? undefined);
      setSubjects(res.data.data || []);
    } catch (error) {
      console.error("Failed to load enrolled subjects:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSubjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.code || "").toLowerCase().includes(q),
    );
  }, [subjects, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">
            Loading your subjects...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-3 md:p-5">
      {/* Hero Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 dark:from-blue-700 dark:via-blue-800 dark:to-blue-900 rounded-3xl p-4 md:p-6 text-white shadow-lg">
        <h1 className="text-2xl md:text-3xl font-bold mb-1">My Subjects</h1>
        <p className="text-blue-100 text-sm">
          {subjects.length} subject{subjects.length === 1 ? "" : "s"} you're
          currently enrolled in
        </p>
      </div>

      {/* Search */}
      {subjects.length > 0 && (
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search subjects by name or code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-9 py-3 rounded-2xl border border-gray-200 dark:border-gray-700/30 bg-white dark:bg-gray-800/40 dark:backdrop-blur-sm text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Subjects list */}
      {filteredSubjects.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800/50 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <BookOpen className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {subjects.length === 0 ? "No Subjects Yet" : "No matches found"}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm mx-auto">
            {subjects.length === 0
              ? "Subjects will appear here once you're enrolled."
              : "Try adjusting your search."}
          </p>
        </div>
      ) : (
        <motion.div
          className="space-y-3"
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.05 } },
            hidden: {},
          }}
        >
          <AnimatePresence initial={false}>
            {filteredSubjects.map((subject) => (
              <SubjectItemCard
                key={subject.subject_id}
                subjectName={subject.name}
                subjectCode={subject.code}
                grades={[]}
                onCardClick={() => navigate(`/subjects/${subject.subject_id}`)}
                animationVariants={{
                  hidden: { opacity: 0, y: 10 },
                  visible: { opacity: 1, y: 0 },
                }}
                rightMeta={
                  <>
                    {subject.category_name && (
                      <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full flex-shrink-0">
                        {subject.category_name}
                      </span>
                    )}
                    <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                      <BookOpen className="w-3.5 h-3.5" />
                      {subject.competency_count} competenc
                      {subject.competency_count === 1 ? "y" : "ies"}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                      <FolderOpen className="w-3.5 h-3.5" />
                      {subject.document_count} document
                      {subject.document_count === 1 ? "" : "s"}
                    </div>
                  </>
                }
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
};

export default MyEnrolledSubjects;
