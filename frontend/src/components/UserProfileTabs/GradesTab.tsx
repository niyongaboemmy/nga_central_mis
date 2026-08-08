import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Award, Calendar, Plus } from "lucide-react";
import { UserWithProfile, UserGrade } from "../../api/users";
import { Permissions as PermConstants } from "../../constants/permissions";

interface GradesTabProps {
  user: UserWithProfile;
  hasPermission: (perm: string) => boolean;
  loadingGrades: boolean;
  userGrades: UserGrade[];
  removingGrade: boolean;
  handleRemoveGrade: (
    gradeId: number,
    academicYearId: number,
  ) => Promise<void>;
  openAddGradeModal: () => void;
  loadingAvailableGrades: boolean;
}

const GradesTab: React.FC<GradesTabProps> = ({
  hasPermission,
  loadingGrades,
  userGrades,
  removingGrade,
  handleRemoveGrade,
  openAddGradeModal,
  loadingAvailableGrades,
}) => {
  // Group grades by academic year, most recent year first
  const groupedGrades = useMemo(() => {
    const groups = new Map<
      number,
      { name: string; isCurrent: boolean; items: UserGrade[] }
    >();
    userGrades.forEach((grade) => {
      const key = grade.academic_year_id;
      if (!groups.has(key)) {
        groups.set(key, {
          name: grade.academic_year_name,
          isCurrent: grade.academic_year_is_current === 1,
          items: [],
        });
      }
      groups.get(key)!.items.push(grade);
    });
    return Array.from(groups.entries()).sort(
      ([yearA], [yearB]) => yearB - yearA,
    );
  }, [userGrades]);

  return (
    <div className="space-y-4">
      {hasPermission(PermConstants.ASSIGN_GRADE_TO_CLASS_TEACHER) && (
        <div className="flex justify-end">
          <button
            onClick={openAddGradeModal}
            disabled={loadingAvailableGrades}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-colors disabled:opacity-50"
          >
            {loadingAvailableGrades ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Assign Grade
          </button>
        </div>
      )}
      {loadingGrades ? (
        <div className="flex items-center justify-center py-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : userGrades && userGrades.length > 0 ? (
        <div className="space-y-6">
          {groupedGrades.map(([academicYearId, { name, isCurrent, items }]) => (
            <div key={academicYearId} className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-500 dark:text-blue-500" />
                {name}
                {isCurrent && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    Current
                  </span>
                )}
              </h4>
              <div className="space-y-4">
                {items.map((grade: UserGrade) => (
                  <motion.div
                    key={`${grade.grade_id}-${grade.academic_year_id}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 md:p-6 bg-gradient-to-br from-blue-100/40 to-blue-100/40 dark:from-blue-900/30 dark:to-blue-900/30 rounded-2xl border border-blue-200/30 dark:border-blue-700/30"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                          <Award className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900 dark:text-white">
                            {grade.name}
                          </h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {grade.program_name} • Level {grade.level_order}
                          </p>
                        </div>
                      </div>
                      {hasPermission(
                        PermConstants.ASSIGN_GRADE_TO_CLASS_TEACHER,
                      ) && (
                        <button
                          onClick={() =>
                            handleRemoveGrade(
                              grade.grade_id,
                              grade.academic_year_id,
                            )
                          }
                          disabled={removingGrade}
                          className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-full transition-colors disabled:opacity-50 min-w-[70px] flex items-center justify-center"
                        >
                          {removingGrade ? (
                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                          ) : (
                            "Remove"
                          )}
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Assigned on{" "}
                      {new Date(grade.assigned_at).toLocaleDateString()}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Award className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-500 dark:text-gray-400 mb-2">
            No grades assigned
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
            This teacher is not assigned to any grades yet.
          </p>
        </div>
      )}
    </div>
  );
};

export default GradesTab;
