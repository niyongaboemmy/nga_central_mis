import React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  User as UserIcon,
  Shield,
  Building,
  Clock,
  Award,
  X,
  Plus,
  Edit,
  Users,
  BookOpen,
  Save,
} from "lucide-react";
import {
  UserWithProfile,
  UserRole,
  Permission,
  getRoles,
  assignRoleToUser,
  Role,
  enableUser,
  disableUser,
  getUserPrograms,
  UserProgram,
  getUserGrades,
  assignGradeToUser,
  removeGradeFromUser,
  UserGrade,
  updateUserProfile,
} from "../api/users";
import {
  programsApi,
  Program,
  programLeadsApi,
  ClassGroup,
  classGroupsApi,
  academicYearsApi,
  AcademicYear,
} from "../api/academics";
import { useToast } from "../contexts/ToastContext";
import { usePermissions } from "../hooks/usePermissions";
import { Permissions } from "../constants/permissions";
import TeacherSubjectAssignment from "./academics/TeacherSubjectAssignment";
import { StatusBadge, UserTypeBadge } from "./UserProfileTabs/TabShared";
import InfoTab from "./UserProfileTabs/InfoTab";
import RolesTab from "./UserProfileTabs/RolesTab";
import ProgramsTab from "./UserProfileTabs/ProgramsTab";
import GradesTab from "./UserProfileTabs/GradesTab";
import ActivityTab from "./UserProfileTabs/ActivityTab";
import FamilyTab from "./UserProfileTabs/FamilyTab";
import StudentEnrollmentTab from "./UserProfileTabs/StudentEnrollmentTab";

// Main User Profile Modal Component
interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserWithProfile | null;
  onViewUser?: (userId: number) => void;
  isSwitchingUser?: boolean;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onViewUser,
  isSwitchingUser,
}) => {
  const { showToast } = useToast();
  const { hasPermission } = usePermissions();
  const [activeTab, setActiveTab] = React.useState<
    | "info"
    | "roles"
    | "programs"
    | "subjects"
    | "enrollment"
    | "activity"
    | "grades"
    | "family"
  >("info");
  const [showAddRoleModal, setShowAddRoleModal] = React.useState(false);
  const [availableRoles, setAvailableRoles] = React.useState<Role[]>([]);
  const [assigningRole, setAssigningRole] = React.useState(false);
  const [changingStatus, setChangingStatus] = React.useState(false);
  const [availablePrograms, setAvailablePrograms] = React.useState<Program[]>(
    [],
  );
  const [userPrograms, setUserPrograms] = React.useState<UserProgram[]>([]);
  const [showAddProgramModal, setShowAddProgramModal] = React.useState(false);
  const [assigningProgram, setAssigningProgram] = React.useState(false);
  const [loadingPrograms, setLoadingPrograms] = React.useState(false);
  const [loadingAvailablePrograms, setLoadingAvailablePrograms] =
    React.useState(false);
  const [removingProgram, setRemovingProgram] = React.useState(false);
  const [userGrades, setUserGrades] = React.useState<UserGrade[]>([]);
  const [loadingGrades, setLoadingGrades] = React.useState(false);
  const [loadingAvailableGrades, setLoadingAvailableGrades] =
    React.useState(false);
  const [removingGrade, setRemovingGrade] = React.useState(false);
  // A class-teacher assignment names a class group, not a whole grade, so the
  // picker offers class groups (each labelled with its grade).
  const [availableClassGroups, setAvailableClassGroups] = React.useState<
    ClassGroup[]
  >([]);
  const [showAddGradeModal, setShowAddGradeModal] = React.useState(false);
  const [assigningGrade, setAssigningGrade] = React.useState(false);
  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>(
    [],
  );
  const [assignYearId, setAssignYearId] = React.useState<number>(0);
  const [loadingRoles, setLoadingRoles] = React.useState(false);
  const [isEditingInfo, setIsEditingInfo] = React.useState(false);
  const [isSavingInfo, setIsSavingInfo] = React.useState(false);
  const [editedInfo, setEditedInfo] = React.useState<{
    first_name?: string;
    last_name?: string;
    gender?: "MALE" | "FEMALE" | "OTHER";
    date_of_birth?: string;
    address?: string;
    external_id?: string;
    phone_number?: string;
  }>({});

  // Load user programs and grades when modal opens
  React.useEffect(() => {
    if (user && isOpen) {
      loadUserPrograms();
      loadUserGrades();
      academicYearsApi.getAll().then((res) => {
        const data = res.data;
        const years = ("data" in data ? data.data : data) as AcademicYear[];
        setAcademicYears(years);
        const currentYear = years.find((y) => y.is_current === 1);
        setAssignYearId(
          currentYear?.academic_year_id || years[0]?.academic_year_id || 0,
        );
      });
      // Initialize edited info when user changes or modal opens
      setEditedInfo({
        first_name: user.profile?.first_name || "",
        last_name: user.profile?.last_name || "",
        gender: user.profile?.gender as any,
        date_of_birth: user.profile?.date_of_birth
          ? new Date(user.profile.date_of_birth).toISOString().split("T")[0]
          : "",
        address: user.profile?.address || "",
        external_id: user.profile?.external_id || "",
        phone_number: user.user.phone_number || "",
      });
      setIsEditingInfo(false);
    }
  }, [user, isOpen]);

  const loadUserPrograms = async () => {
    if (!user) return;
    setLoadingPrograms(true);
    try {
      const programs = await getUserPrograms(user.user.user_id);
      if (programs) {
        setUserPrograms(programs);
      }
    } catch (error) {
      console.error("Failed to load user programs:", error);
    } finally {
      setLoadingPrograms(false);
    }
  };

  const loadUserGrades = async () => {
    if (!user) return;
    setLoadingGrades(true);
    try {
      const grades = await getUserGrades(user.user.user_id);
      if (grades) {
        setUserGrades(grades);
      }
    } catch (error) {
      console.error("Failed to load user grades:", error);
    } finally {
      setLoadingGrades(false);
    }
  };

  const handleSaveInfo = async () => {
    if (!user) return;
    setIsSavingInfo(true);
    try {
      await updateUserProfile(user.user.user_id, editedInfo);
      showToast("Profile updated successfully", "success");
      setIsEditingInfo(false);
      // Refresh user data using parent's onViewUser
      if (onViewUser) {
        onViewUser(user.user.user_id);
      }
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to update profile",
        "error",
      );
    } finally {
      setIsSavingInfo(false);
    }
  };

  if (!user) return null;

  const getUserType = (): string => user.profile?.user_type || "USER";

  // Collect all permissions from all roles
  const allPermissions =
    user.roles?.flatMap((role: UserRole) => role.permissions || []) || [];
  const uniquePermissions = Array.from(
    new Map(allPermissions.map((p: Permission) => [p.perm_id, p])).values(),
  );

  const tabs = [
    { id: "info", label: "Info", icon: UserIcon },
    { id: "roles", label: "Roles", icon: Shield },
    ...(getUserType() === "STUDENT"
      ? [{ id: "enrollment", label: "Enrollment", icon: BookOpen }]
      : [
          { id: "programs", label: "Programs", icon: Building },
          { id: "grades", label: "Grades", icon: Award },
          { id: "subjects", label: "Subjects", icon: BookOpen },
        ]),
    { id: "family", label: "Family", icon: Users },
    { id: "activity", label: "Activity", icon: Clock },
  ];

  const handleChangeRole = async (roleId: number) => {
    setAssigningRole(true);
    try {
      await assignRoleToUser(user.user.user_id, roleId);
      showToast("Role changed successfully", "success");
      // Refresh user data - this would need to be passed from parent component
      window.location.reload(); // Temporary solution
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to change role",
        "error",
      );
    } finally {
      setAssigningRole(false);
      setShowAddRoleModal(false);
    }
  };

  const handleToggleUserStatus = async () => {
    if (!user) return;

    setChangingStatus(true);
    try {
      if (user.user.status === "ACTIVE") {
        await disableUser(user.user.user_id);
        showToast("User disabled successfully", "success");
      } else {
        await enableUser(user.user.user_id);
        showToast("User enabled successfully", "success");
      }
      // Refresh user data
      window.location.reload(); // Temporary solution
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to update user status",
        "error",
      );
    } finally {
      setChangingStatus(false);
    }
  };

  const openChangeRoleModal = async () => {
    setLoadingRoles(true);
    try {
      const roles = await getRoles("ACTIVE");
      if (roles) {
        // Show all active roles since user can change to any role
        setAvailableRoles(roles);
      }
      setShowAddRoleModal(true);
    } catch (error) {
      showToast("Failed to load available roles", "error");
    } finally {
      setLoadingRoles(false);
    }
  };

  const openAddProgramModal = async () => {
    setLoadingAvailablePrograms(true);
    try {
      const response = await programsApi.getAll();
      const programs = response.data.data;
      if (programs) {
        setAvailablePrograms(programs);
      }
      setShowAddProgramModal(true);
    } catch (error) {
      showToast("Failed to load available programs", "error");
    } finally {
      setLoadingAvailablePrograms(false);
    }
  };

  const handleAssignProgram = async (programId: number) => {
    setAssigningProgram(true);
    try {
      await programLeadsApi.assign({
        user_id: user.user.user_id,
        program_id: programId,
        academic_year_id: assignYearId,
      });
      showToast("Program assigned successfully", "success");
      // Refresh user programs
      await loadUserPrograms();
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to assign program",
        "error",
      );
    } finally {
      setAssigningProgram(false);
      setShowAddProgramModal(false);
    }
  };

  const handleRemoveProgram = async (
    programId: number,
    academicYearId: number,
  ) => {
    setRemovingProgram(true);
    try {
      await programLeadsApi.remove(
        programId,
        user.user.user_id,
        academicYearId,
      );
      showToast("Program removed successfully", "success");
      // Refresh user programs
      await loadUserPrograms();
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to remove program",
        "error",
      );
    } finally {
      setRemovingProgram(false);
    }
  };

  const handleRemoveGrade = async (
    gradeId: number,
    classGroupId: number,
    academicYearId: number,
  ) => {
    setRemovingGrade(true);
    try {
      await removeGradeFromUser(
        user.user.user_id,
        gradeId,
        classGroupId,
        academicYearId,
      );
      showToast("Grade removed successfully", "success");
      // Refresh user grades
      await loadUserGrades();
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to remove grade",
        "error",
      );
    } finally {
      setRemovingGrade(false);
    }
  };

  // Class groups this user does not already lead in `yearId`. They may still
  // hold the same class group in other years, so the filter is year-scoped.
  const unassignedClassGroupsForYear = (
    classGroups: ClassGroup[],
    yearId: number,
  ) => {
    const assignedIds = userGrades
      .filter((g) => g.academic_year_id === yearId)
      .map((g) => g.class_group_id);
    return classGroups.filter(
      (cg) => !assignedIds.includes(cg.class_group_id),
    );
  };

  const openAddGradeModal = async () => {
    setLoadingAvailableGrades(true);
    try {
      const response = await classGroupsApi.getAll();
      const classGroups = response.data.data;
      if (classGroups) {
        setAvailableClassGroups(
          unassignedClassGroupsForYear(classGroups, assignYearId),
        );
      }
      setShowAddGradeModal(true);
    } catch (error) {
      showToast("Failed to load available class groups", "error");
    } finally {
      setLoadingAvailableGrades(false);
    }
  };

  const handleAssignGrade = async (gradeId: number, classGroupId: number) => {
    setAssigningGrade(true);
    try {
      await assignGradeToUser(
        user.user.user_id,
        gradeId,
        classGroupId,
        assignYearId,
      );
      showToast("Grade assigned successfully", "success");
      // Refresh user grades
      await loadUserGrades();
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to assign grade",
        "error",
      );
    } finally {
      setAssigningGrade(false);
      setShowAddGradeModal(false);
    }
  };

  // Portaled to document.body so the modal always sits above page-level
  // stacking contexts (e.g. a page wrapper's `relative z-10`) rather than
  // being trapped behind the fixed Navbar/Sidebar chrome (both z-50).
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="bg-white dark:bg-gray-950 w-full h-full overflow-hidden relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Loading Overlay */}
            <AnimatePresence>
              {isSwitchingUser && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-[110] bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm flex flex-col items-center justify-center"
                >
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Users className="w-6 h-6 text-blue-500 animate-pulse" />
                    </div>
                  </div>
                  <p className="mt-4 text-sm font-medium text-gray-600 dark:text-gray-300 animate-pulse">
                    Switching Profile...
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] h-full">
              {/* Left Column: Profile Card and Tabs */}
              <div className="flex flex-col bg-gradient-to-b from-blue-50 to-gray-50 dark:from-gray-900/60 dark:to-gray-900/60 border-r border-gray-200 dark:border-slate-700/40 overflow-y-auto relative">
                <div className="absolute" />
                {/* Profile Card */}
                <div className="p-4">
                  <div className="flex flex-col items-center text-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        type: "spring",
                        stiffness: 200,
                        delay: 0.1,
                      }}
                      className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-2xl shadow-blue-500/30 mb-3 hover:scale-105 transition-transform"
                    >
                      <UserIcon className="w-8 h-8 text-white" />
                    </motion.div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                      {user.profile?.first_name && user.profile?.last_name
                        ? `${user.profile.first_name} ${user.profile.last_name}`
                        : user.user.username}
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      @{user.user.username}
                    </p>
                    <div className="flex flex-col gap-1.5 items-center">
                      <UserTypeBadge type={getUserType()} />
                      <StatusBadge status={user.user.status} />
                    </div>
                  </div>
                </div>

                {/* Vertical Tabs */}
                <div className="flex-1 p-4 pt-0">
                  <div className="space-y-1.5">
                    {tabs.map((tab) => (
                      <motion.button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as typeof activeTab)}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 + tabs.indexOf(tab) * 0.05 }}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 sm:pl-4 md:pl-5 rounded-full text-sm font-medium transition-all hover:scale-105 active:scale-95 ${
                          activeTab === tab.id
                            ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 shadow-sm"
                            : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-gray-200"
                        }`}
                      >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                      </motion.button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Content */}
              <div className="flex flex-col h-screen overflow-y-auto">
                {/* Header with Close Button */}
                <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-slate-700/50">
                  <h2 className="text-lg pl-3 font-semibold text-gray-900 dark:text-white">
                    {tabs.find((tab) => tab.id === activeTab)?.label}
                  </h2>
                  <div className="flex justify-end gap-3 md:gap-5">
                    {activeTab === "info" &&
                      hasPermission(Permissions.UPDATE_USER_PROFILE_INFO) && (
                        <div className="flex gap-2">
                          {isEditingInfo ? (
                            <>
                              <button
                                onClick={() => setIsEditingInfo(false)}
                                className="px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleSaveInfo}
                                disabled={isSavingInfo}
                                className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-full transition-colors flex items-center gap-2"
                              >
                                {isSavingInfo ? (
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                ) : (
                                  <Save className="w-4 h-4" />
                                )}
                                Save
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setIsEditingInfo(true)}
                              className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-full transition-colors flex items-center gap-2"
                            >
                              <Edit className="w-4 h-4" />
                              Edit Info
                            </button>
                          )}
                        </div>
                      )}
                    {hasPermission(Permissions.ENABLE_DISABLE_USERS) && (
                      <button
                        onClick={handleToggleUserStatus}
                        disabled={changingStatus}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${
                          user.user.status === "ACTIVE"
                            ? "bg-red-500 hover:bg-red-600 text-white"
                            : "bg-green-500 hover:bg-green-600 text-white"
                        } disabled:opacity-50`}
                      >
                        {changingStatus ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : user.user.status === "ACTIVE" ? (
                          "Disable User"
                        ) : (
                          "Enable User"
                        )}
                      </button>
                    )}
                    <button
                      onClick={onClose}
                      className="p-2 bg-gray-100 dark:bg-slate-700 hover:bg-red-100 dark:hover:bg-red-900/20 hover:scale-110 rounded-full transition-all group"
                    >
                      <X className="w-5 h-5 text-gray-600 dark:text-gray-400 group-hover:text-red-500 transition-colors" />
                    </button>
                  </div>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-4">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="container max-w-5xl mx-auto"
                  >
                    {activeTab === "info" && (
                      <InfoTab
                        user={user}
                        isEditingInfo={isEditingInfo}
                        editedInfo={editedInfo}
                        setEditedInfo={setEditedInfo}
                      />
                    )}

                    {activeTab === "roles" && (
                      <RolesTab
                        user={user}
                        hasPermission={hasPermission}
                        openChangeRoleModal={openChangeRoleModal}
                        loadingRoles={loadingRoles}
                        uniquePermissions={uniquePermissions}
                      />
                    )}

                    {activeTab === "programs" && (
                      <ProgramsTab
                        user={user}
                        userPrograms={userPrograms}
                        loadingPrograms={loadingPrograms}
                        hasPermission={hasPermission}
                        handleRemoveProgram={handleRemoveProgram}
                        removingProgram={removingProgram}
                        openAddProgramModal={openAddProgramModal}
                        loadingAvailablePrograms={loadingAvailablePrograms}
                      />
                    )}

                    {activeTab === "grades" && (
                      <GradesTab
                        user={user}
                        userGrades={userGrades}
                        loadingGrades={loadingGrades}
                        hasPermission={hasPermission}
                        handleRemoveGrade={handleRemoveGrade}
                        removingGrade={removingGrade}
                        openAddGradeModal={openAddGradeModal}
                        loadingAvailableGrades={loadingAvailableGrades}
                      />
                    )}

                    {activeTab === "subjects" && (
                      <div className="space-y-6">
                        <TeacherSubjectAssignment
                          teacherId={user.user.user_id}
                          teacherName={
                            user.profile?.first_name && user.profile?.last_name
                              ? `${user.profile.first_name} ${user.profile.last_name}`
                              : user.user.username
                          }
                          isOpen={true}
                          onClose={() => setActiveTab("info")}
                          onSuccess={() => {}} // Could refresh user data if needed
                        />
                      </div>
                    )}

                    {activeTab === "enrollment" &&
                      getUserType() === "STUDENT" && (
                        <StudentEnrollmentTab
                          studentId={user.user.user_id}
                          studentName={
                            user.profile?.first_name && user.profile?.last_name
                              ? `${user.profile.first_name} ${user.profile.last_name}`
                              : user.user.username
                          }
                          isOpen={true}
                          onClose={() => setActiveTab("info")}
                          showHeader={false}
                        />
                      )}

                    {activeTab === "family" && (
                      <FamilyTab user={user} onViewUser={onViewUser} />
                    )}

                    {activeTab === "activity" && (
                      <ActivityTab
                        user={user}
                        handleToggleUserStatus={handleToggleUserStatus}
                        changingStatus={changingStatus}
                        hasPermission={hasPermission}
                      />
                    )}
                  </motion.div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Add Role Modal */}
      <AnimatePresence>
        {showAddRoleModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAddRoleModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-3xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Change Role
                  </h3>
                  <button
                    onClick={() => setShowAddRoleModal(false)}
                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {availableRoles.length === 0 ? (
                    <div className="text-center py-8">
                      <Shield className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        No available roles to assign
                      </p>
                    </div>
                  ) : (
                    availableRoles.map((role) => (
                      <div
                        key={role.role_id}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-2xl"
                      >
                        <div>
                          <h5 className="font-medium text-gray-900 dark:text-white text-sm">
                            {role.name}
                          </h5>
                          {role.description && (
                            <p className="text-sm text-gray-500 dark:text-gray-400/50">
                              {role.description}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleChangeRole(role.role_id)}
                          disabled={assigningRole}
                          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-colors disabled:opacity-50"
                        >
                          {assigningRole ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          ) : (
                            <>
                              <Edit className="w-4 h-4" />
                              Change To
                            </>
                          )}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Program Modal */}
      <AnimatePresence>
        {showAddProgramModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAddProgramModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-3xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Assign Program Lead
                  </h3>
                  <button
                    onClick={() => setShowAddProgramModal(false)}
                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Academic Year
                  </label>
                  <select
                    value={assignYearId}
                    onChange={(e) => setAssignYearId(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value={0}>Select an academic year...</option>
                    {academicYears.map((year) => (
                      <option
                        key={year.academic_year_id}
                        value={year.academic_year_id}
                      >
                        {year.name}
                        {year.is_current === 1 ? " (Current)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {availablePrograms.length === 0 ? (
                    <div className="text-center py-8">
                      <Building className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        No available programs to assign
                      </p>
                    </div>
                  ) : (
                    availablePrograms.map((program) => (
                      <div
                        key={program.program_id}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-2xl"
                      >
                        <div>
                          <h5 className="font-medium text-gray-900 dark:text-white text-sm">
                            {program.name}
                          </h5>
                          {program.description && (
                            <p className="text-sm text-gray-500 dark:text-gray-400/50">
                              {program.description}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() =>
                            handleAssignProgram(program.program_id)
                          }
                          disabled={assigningProgram}
                          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-colors disabled:opacity-50"
                        >
                          {assigningProgram ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          ) : (
                            <>
                              <Plus className="w-4 h-4" />
                              Assign
                            </>
                          )}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Grade Modal */}
      <AnimatePresence>
        {showAddGradeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAddGradeModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-3xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Assign Grade
                  </h3>
                  <button
                    onClick={() => setShowAddGradeModal(false)}
                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Academic Year
                  </label>
                  <select
                    value={assignYearId}
                    onChange={(e) => {
                      const yearId = parseInt(e.target.value);
                      setAssignYearId(yearId);
                      classGroupsApi.getAll().then((response) => {
                        const classGroups = response.data.data;
                        if (classGroups) {
                          setAvailableClassGroups(
                            unassignedClassGroupsForYear(classGroups, yearId),
                          );
                        }
                      });
                    }}
                    className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value={0}>Select an academic year...</option>
                    {academicYears.map((year) => (
                      <option
                        key={year.academic_year_id}
                        value={year.academic_year_id}
                      >
                        {year.name}
                        {year.is_current === 1 ? " (Current)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {availableClassGroups.length === 0 ? (
                    <div className="text-center py-8">
                      <Award className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        No available class groups to assign
                      </p>
                    </div>
                  ) : (
                    availableClassGroups.map((classGroup) => (
                      <div
                        key={classGroup.class_group_id}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-2xl"
                      >
                        <div>
                          <h5 className="font-medium text-gray-900 dark:text-white text-sm">
                            {classGroup.grade_name} • {classGroup.name}
                          </h5>
                          <p className="text-sm text-gray-500 dark:text-gray-400/50">
                            {classGroup.program_name}
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            handleAssignGrade(
                              classGroup.grade_id,
                              classGroup.class_group_id,
                            )
                          }
                          disabled={assigningGrade}
                          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-colors disabled:opacity-50"
                        >
                          {assigningGrade ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          ) : (
                            <>
                              <Plus className="w-4 h-4" />
                              Assign
                            </>
                          )}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatePresence>,
    document.body,
  );
};

export default UserProfileModal;
