import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Building, Calendar, Plus } from "lucide-react";
import { UserWithProfile, UserProgram } from "../../api/users";
import { Permissions as PermConstants } from "../../constants/permissions";

interface ProgramsTabProps {
  user: UserWithProfile;
  loadingPrograms: boolean;
  userPrograms: UserProgram[];
  hasPermission: (perm: string) => boolean;
  removingProgram: boolean;
  handleRemoveProgram: (
    programId: number,
    academicYearId: number,
  ) => Promise<void>;
  openAddProgramModal: () => void;
  loadingAvailablePrograms: boolean;
}

const ProgramsTab: React.FC<ProgramsTabProps> = ({
  loadingPrograms,
  userPrograms,
  hasPermission,
  removingProgram,
  handleRemoveProgram,
  openAddProgramModal,
  loadingAvailablePrograms,
}) => {
  // Group programs by academic year, most recent year first
  const groupedPrograms = useMemo(() => {
    const groups = new Map<
      number,
      { name: string; isCurrent: boolean; items: UserProgram[] }
    >();
    userPrograms.forEach((program) => {
      const key = program.academic_year_id;
      if (!groups.has(key)) {
        groups.set(key, {
          name: program.academic_year_name,
          isCurrent: program.academic_year_is_current === 1,
          items: [],
        });
      }
      groups.get(key)!.items.push(program);
    });
    return Array.from(groups.entries()).sort(
      ([yearA], [yearB]) => yearB - yearA,
    );
  }, [userPrograms]);

  return (
    <div className="space-y-4">
      {loadingPrograms ? (
        <div className="flex items-center justify-center py-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : userPrograms && userPrograms.length > 0 ? (
        <div className="space-y-6">
          {groupedPrograms.map(([academicYearId, { name, isCurrent, items }]) => (
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
                {items.map((program: UserProgram) => (
                  <motion.div
                    key={`${program.program_id}-${program.academic_year_id}-${program.relationship}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 md:p-6 bg-gradient-to-br from-blue-100/40 to-blue-100/40 dark:from-blue-900/30 dark:to-blue-900/30 rounded-2xl border border-blue-200/30 dark:border-blue-700/30"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                          <Building className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900 dark:text-white">
                            {program.name}
                          </h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {program.relationship === "LEAD"
                              ? "Program Lead"
                              : program.relationship === "STUDENT"
                                ? "Student"
                                : program.relationship === "TEACHER"
                                  ? "Teacher"
                                  : "Associated"}
                          </p>
                        </div>
                      </div>
                      {program.relationship === "LEAD" &&
                        hasPermission(PermConstants.MANAGE_PROGRAM_LEADS) && (
                          <button
                            onClick={() =>
                              handleRemoveProgram(
                                program.program_id,
                                program.academic_year_id,
                              )
                            }
                            disabled={removingProgram}
                            className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-full transition-colors disabled:opacity-50 min-w-[70px] flex items-center justify-center"
                          >
                            {removingProgram ? (
                              <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                            ) : (
                              "Remove"
                            )}
                          </button>
                        )}
                    </div>
                    {program.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {program.description}
                      </p>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
          {hasPermission(PermConstants.MANAGE_PROGRAM_LEADS) && (
            <div className="flex justify-center pt-4">
              <button
                onClick={openAddProgramModal}
                disabled={loadingAvailablePrograms}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-colors disabled:opacity-50"
              >
                {loadingAvailablePrograms ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Assign Program Lead
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12">
          <Building className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-500 dark:text-gray-400 mb-2">
            No programs associated
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
            This user is not associated with any programs.
          </p>
          {hasPermission(PermConstants.MANAGE_PROGRAM_LEADS) && (
            <button
              onClick={openAddProgramModal}
              disabled={loadingAvailablePrograms}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors mx-auto disabled:opacity-50"
            >
              {loadingAvailablePrograms ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Assign Program Lead
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ProgramsTab;
