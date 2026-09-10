import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Users2,
  UserCog,
  BookOpen,
  Layers,
  ClipboardList,
  PanelLeftClose,
  PanelLeftOpen,
  ListTree,
  X,
} from "lucide-react";
import {
  ClassGroupsProvider,
  useClassGroups,
  Lens,
} from "./ClassGroupsContext";
import ContextBar from "./ContextBar";
import ClassGroupNavigator from "./ClassGroupNavigator";
import SetupChecklistPanel from "./SetupChecklistPanel";
import { failedChecks } from "./readiness";
import StudentsLens from "./lenses/StudentsLens";
import TeachersLens from "./lenses/TeachersLens";
import SubjectsLens from "./lenses/SubjectsLens";
import StructureLens from "./lenses/StructureLens";
import EnrollmentsLens from "./lenses/EnrollmentsLens";

const LENSES: {
  id: Lens;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
}[] = [
  { id: "students", label: "Students", shortLabel: "Students", icon: Users2 },
  { id: "teachers", label: "Teachers", shortLabel: "Teachers", icon: UserCog },
  { id: "subjects", label: "Subjects", shortLabel: "Subjects", icon: BookOpen },
  {
    id: "structure",
    label: "Grades & Class Groups",
    shortLabel: "Structure",
    icon: Layers,
  },
  {
    id: "enrollments",
    label: "Enrollments & Assignments",
    shortLabel: "Enrollments",
    icon: ClipboardList,
  },
];

const Workspace: React.FC = () => {
  const { activeLens, setActiveLens, overview, programId } = useClassGroups();
  const [navOpen, setNavOpen] = useState(true);
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);

  const incompleteCount = useMemo(
    () =>
      overview.filter(
        (row) =>
          (programId === null || row.program_id === programId) &&
          failedChecks(row).length > 0,
      ).length,
    [overview, programId],
  );

  const renderLens = () => {
    switch (activeLens) {
      case "students":
        return <StudentsLens />;
      case "teachers":
        return <TeachersLens />;
      case "subjects":
        return <SubjectsLens />;
      case "structure":
        return <StructureLens />;
      case "enrollments":
        return <EnrollmentsLens />;
      default:
        return null;
    }
  };

  return (
    <div>
      <ContextBar
        onOpenChecklist={() => setChecklistOpen(true)}
        incompleteCount={incompleteCount}
      />

      <div className="flex gap-4 items-start">
        {/* Navigator — a fixed rail from xl up, a drawer below it. */}
        {navOpen && (
          <motion.aside
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="hidden xl:flex w-[280px] shrink-0 flex-col rounded-2xl bg-white/70 dark:bg-slate-800/60 backdrop-blur-sm border border-white/50 dark:border-slate-700/30 h-[calc(100vh-13rem)] sticky top-20"
          >
            <ClassGroupNavigator />
          </motion.aside>
        )}

        <div className="flex-1 min-w-0">
          {/* Lens switcher */}
          <div
            role="tablist"
            aria-label="Class group lenses"
            className="flex flex-wrap items-center gap-1 mb-3"
          >
            <button
              type="button"
              onClick={() => setNavOpen((v) => !v)}
              aria-label={navOpen ? "Hide class list" : "Show class list"}
              className="hidden xl:inline-flex w-8 h-8 items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            >
              {navOpen ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeftOpen className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setNavDrawerOpen(true)}
              className="xl:hidden inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-white/70 dark:bg-slate-800/70 border border-white/50 dark:border-slate-700/40 text-gray-700 dark:text-gray-200"
            >
              <ListTree className="w-3.5 h-3.5" />
              Classes
            </button>

            <div className="flex gap-1 overflow-x-auto bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-white/50 dark:border-slate-700/30 rounded-full p-1">
              {LENSES.map((lens) => {
                const Icon = lens.icon;
                const selected = activeLens === lens.id;
                return (
                  <button
                    key={lens.id}
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveLens(lens.id)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
                      selected
                        ? "bg-blue-500 text-white"
                        : "text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-slate-700/60"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="hidden lg:inline">{lens.label}</span>
                    <span className="lg:hidden">{lens.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <motion.div
            key={activeLens}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            {renderLens()}
          </motion.div>
        </div>
      </div>

      {/* Navigator drawer for < xl */}
      {navDrawerOpen && (
        <div
          className="fixed inset-0 z-[60] xl:hidden"
          role="dialog"
          aria-label="Class groups"
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setNavDrawerOpen(false)}
          />
          <motion.div
            initial={{ x: -320 }}
            animate={{ x: 0 }}
            className="absolute inset-y-0 left-0 w-[300px] max-w-[85vw] bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 flex flex-col"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-slate-700/50">
              <span className="text-sm font-bold text-gray-800 dark:text-white">
                Class groups
              </span>
              <button
                type="button"
                aria-label="Close class list"
                onClick={() => setNavDrawerOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ClassGroupNavigator onSelect={() => setNavDrawerOpen(false)} />
          </motion.div>
        </div>
      )}

      <SetupChecklistPanel
        open={checklistOpen}
        onClose={() => setChecklistOpen(false)}
      />
    </div>
  );
};

/**
 * "Class Groups Management" — the third tab of the Users page. Everything a
 * class group relates to (its students, its teachers, its curriculum, its
 * structure and its enrollments) is driven from one persistent context
 * instead of four routes and eight tabs.
 */
const ClassGroupsManagement: React.FC = () => (
  <ClassGroupsProvider>
    <Workspace />
  </ClassGroupsProvider>
);

export default ClassGroupsManagement;
