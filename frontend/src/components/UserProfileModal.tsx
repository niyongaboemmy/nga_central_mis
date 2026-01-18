import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User as UserIcon,
  Shield,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Building,
  Clock,
  Award,
  X,
  CheckCircle,
  Ban,
  Clock4,
  BookOpen,
  Plus,
  Edit,
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
} from "../api/users";
import {
  programsApi,
  Program,
  programLeadsApi,
  Grade,
  gradesApi,
} from "../api/academics";
import { useToast } from "../contexts/ToastContext";
import { usePermissions } from "../hooks/usePermissions";
import { Permissions } from "../constants/permissions";
import TeacherSubjectAssignment from "./academics/TeacherSubjectAssignment";
import StudentEnrollmentTab from "./StudentEnrollmentTab";

// Status badge with icon
const StatusBadge = ({ status }: { status: string }) => {
  const config: Record<
    string,
    { color: string; icon: React.ElementType; label: string }
  > = {
    ACTIVE: {
      color: "bg-gradient-to-r from-green-500 to-green-600",
      icon: CheckCircle,
      label: "Active",
    },
    INACTIVE: {
      color: "bg-gradient-to-r from-slate-400 to-slate-500",
      icon: Clock4,
      label: "Inactive",
    },
    SUSPENDED: {
      color: "bg-gradient-to-r from-rose-500 to-rose-600",
      icon: Ban,
      label: "Suspended",
    },
  };
  const { color, icon: Icon, label } = config[status] || config.ACTIVE;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white ${color}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
};

// User type badge
const UserTypeBadge = ({ type }: { type: string }) => {
  const colors: Record<string, string> = {
    ADMIN: "bg-gradient-to-r from-blue-500 to-blue-600",
    STUDENT: "bg-gradient-to-r from-blue-500 to-blue-600",
    TEACHER: "bg-gradient-to-r from-blue-500 to-blue-600",
    PARENT: "bg-gradient-to-r from-blue-500 to-blue-600",
    STAFF: "bg-gradient-to-r from-slate-500 to-slate-600",
  };
  const color = colors[type] || "bg-gradient-to-r from-gray-500 to-gray-600";

  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-normal text-white ${color}`}
    >
      {type}
    </span>
  );
};

// Info item component
const InfoItem = ({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  highlight?: boolean;
}) => (
  <div
    className={`flex items-start gap-3 p-3 rounded-xl transition-all hover:shadow-md cursor-pointer ${
      highlight
        ? "bg-blue-50 dark:bg-blue-900/20"
        : "bg-gray-50/50 dark:bg-slate-800/50"
    }`}
  >
    <div
      className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
        highlight
          ? "bg-blue-100 dark:bg-blue-900/40"
          : "bg-gray-100 dark:bg-slate-700"
      }`}
    >
      <Icon
        className={`w-4.5 h-4.5 ${
          highlight
            ? "text-blue-600 dark:text-blue-400"
            : "text-gray-500 dark:text-gray-400"
        }`}
      />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
        {value}
      </p>
    </div>
  </div>
);

// Role card component
const RoleCard = ({
  role,
  permissions,
}: {
  role: UserRole;
  permissions: Permission[];
}) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-6 bg-gradient-to-br from-blue-100/40 to-blue-100/40 dark:from-slate-900/60 dark:to-slate-900/60 rounded-2xl border border-blue-200/30 dark:border-slate-700/30"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white">
              {role.name}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {role.description || "No description"}
            </p>
          </div>
        </div>
        <StatusBadge status={role.status} />
      </div>

      {permissions.length > 0 && (
        <div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors mb-2"
          >
            <Award className="w-4 h-4" />
            {permissions.length} Permissions
            {isExpanded ? (
              <Clock className="w-3.5 h-3.5" />
            ) : (
              <Clock className="w-3.5 h-3.5" />
            )}
          </button>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {permissions.map((perm) => (
                    <span
                      key={perm.perm_id}
                      className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg text-xs font-medium"
                    >
                      {perm.name}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
};

// Main User Profile Modal Component
interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserWithProfile | null;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  user,
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
  const [userGrades, setUserGrades] = React.useState<UserGrade[]>([]);
  const [loadingGrades, setLoadingGrades] = React.useState(false);
  const [availableGrades, setAvailableGrades] = React.useState<Grade[]>([]);
  const [showAddGradeModal, setShowAddGradeModal] = React.useState(false);
  const [assigningGrade, setAssigningGrade] = React.useState(false);

  // Load user programs and grades when modal opens
  React.useEffect(() => {
    if (user && isOpen) {
      loadUserPrograms();
      loadUserGrades();
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
    }
  };

  const openChangeRoleModal = async () => {
    try {
      const roles = await getRoles("ACTIVE");
      if (roles) {
        // Show all active roles since user can change to any role
        setAvailableRoles(roles);
      }
      setShowAddRoleModal(true);
    } catch (error) {
      showToast("Failed to load available roles", "error");
    }
  };

  const openAddProgramModal = async () => {
    try {
      const response = await programsApi.getAll();
      const programs = response.data.data;
      if (programs) {
        setAvailablePrograms(programs);
      }
      setShowAddProgramModal(true);
    } catch (error) {
      showToast("Failed to load available programs", "error");
    }
  };

  const handleAssignProgram = async (programId: number) => {
    setAssigningProgram(true);
    try {
      await programLeadsApi.assign({
        user_id: user.user.user_id,
        program_id: programId,
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

  const handleRemoveProgram = async (programId: number) => {
    try {
      await programLeadsApi.remove(programId, user.user.user_id);
      showToast("Program removed successfully", "success");
      // Refresh user programs
      await loadUserPrograms();
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to remove program",
        "error",
      );
    }
  };

  const handleRemoveGrade = async (gradeId: number) => {
    try {
      await removeGradeFromUser(user.user.user_id, gradeId);
      showToast("Grade removed successfully", "success");
      // Refresh user grades
      await loadUserGrades();
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to remove grade",
        "error",
      );
    }
  };

  const openAddGradeModal = async () => {
    try {
      const response = await gradesApi.getAll();
      const grades = response.data.data;
      if (grades) {
        // Filter out grades already assigned to this user
        const assignedGradeIds = userGrades.map((g) => g.grade_id);
        const available = grades.filter(
          (g) => !assignedGradeIds.includes(g.grade_id),
        );
        setAvailableGrades(available);
      }
      setShowAddGradeModal(true);
    } catch (error) {
      showToast("Failed to load available grades", "error");
    }
  };

  const handleAssignGrade = async (gradeId: number) => {
    setAssigningGrade(true);
    try {
      await assignGradeToUser(user.user.user_id, gradeId);
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

  const handleStatusChange = async () => {
    setChangingStatus(true);
    try {
      if (user.user.status === "ACTIVE") {
        await disableUser(user.user.user_id);
        showToast("User disabled successfully", "success");
      } else {
        await enableUser(user.user.user_id);
        showToast("User enabled successfully", "success");
      }
      // Refresh user data - this would need to be passed from parent component
      window.location.reload(); // Temporary solution
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to change user status",
        "error",
      );
    } finally {
      setChangingStatus(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="bg-white dark:bg-gray-950 w-full h-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
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
                  <button
                    onClick={onClose}
                    className="p-2 bg-gray-100 dark:bg-slate-700 hover:bg-red-100 dark:hover:bg-red-900/20 hover:scale-110 rounded-full transition-all group"
                  >
                    <X className="w-5 h-5 text-gray-600 dark:text-gray-400 group-hover:text-red-500 transition-colors" />
                  </button>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-4">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {activeTab === "info" && (
                      <div className="space-y-4">
                        {hasPermission(Permissions.ENABLE_DISABLE_USERS) && (
                          <div className="flex justify-end">
                            <button
                              onClick={handleToggleUserStatus}
                              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                                user.user.status === "ACTIVE"
                                  ? "bg-red-500 hover:bg-red-600 text-white"
                                  : "bg-green-500 hover:bg-green-600 text-white"
                              }`}
                            >
                              {user.user.status === "ACTIVE"
                                ? "Disable User"
                                : "Enable User"}
                            </button>
                          </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <InfoItem
                            icon={Mail}
                            label="Email"
                            value={user.user.email}
                            highlight
                          />
                          <InfoItem
                            icon={Phone}
                            label="Phone"
                            value={user.user.phone_number || "Not provided"}
                          />
                          <InfoItem
                            icon={Building}
                            label="Gender"
                            value={user.profile?.gender || "Not specified"}
                          />
                          <InfoItem
                            icon={Calendar}
                            label="Date of Birth"
                            value={
                              user.profile?.date_of_birth
                                ? new Date(
                                    user.profile.date_of_birth,
                                  ).toLocaleDateString()
                                : "Not specified"
                            }
                          />
                          <InfoItem
                            icon={MapPin}
                            label="Address"
                            value={user.profile?.address || "Not provided"}
                          />
                        </div>
                        <InfoItem
                          icon={Clock}
                          label="Account Created"
                          value={new Date(
                            user.user.created_at,
                          ).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                          highlight
                        />
                      </div>
                    )}

                    {activeTab === "roles" && (
                      <div className="space-y-4">
                        {user.roles && user.roles.length > 0 ? (
                          <div className="space-y-4">
                            {user.roles.map((role: UserRole) => (
                              <RoleCard
                                key={role.role_id}
                                role={role}
                                permissions={role.permissions || []}
                              />
                            ))}
                            {hasPermission(Permissions.CHANGE_USER_ROLES) && (
                              <div className="flex justify-center pt-4">
                                <button
                                  onClick={openChangeRoleModal}
                                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-colors"
                                >
                                  <Edit className="w-4 h-4" />
                                  Change Role
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-12">
                            <Shield className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                            <p className="text-lg font-medium text-gray-500 dark:text-gray-400 mb-2">
                              No role assigned
                            </p>
                            <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
                              This user needs to be assigned a role.
                            </p>
                            {hasPermission(Permissions.CHANGE_USER_ROLES) && (
                              <button
                                onClick={openChangeRoleModal}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors mx-auto"
                              >
                                <Plus className="w-4 h-4" />
                                Assign Role
                              </button>
                            )}
                          </div>
                        )}

                        {uniquePermissions.length > 0 && (
                          <div className="mt-6 p-4 md:p-6 bg-blue-100/40 dark:bg-gray-900 rounded-2xl">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                              All Permissions ({uniquePermissions.length})
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {uniquePermissions.map((perm: Permission) => (
                                <span
                                  key={perm.perm_id}
                                  className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium"
                                >
                                  {perm.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === "programs" && (
                      <div className="space-y-4">
                        {loadingPrograms ? (
                          <div className="flex items-center justify-center py-6">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                          </div>
                        ) : userPrograms && userPrograms.length > 0 ? (
                          <div className="space-y-4">
                            {userPrograms.map((program: UserProgram) => (
                              <motion.div
                                key={program.program_id}
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
                                    hasPermission(
                                      Permissions.MANAGE_PROGRAM_LEADS,
                                    ) && (
                                      <button
                                        onClick={() =>
                                          handleRemoveProgram(
                                            program.program_id,
                                          )
                                        }
                                        className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-full transition-colors"
                                      >
                                        Remove
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
                            {hasPermission(
                              Permissions.MANAGE_PROGRAM_LEADS,
                            ) && (
                              <div className="flex justify-center pt-4">
                                <button
                                  onClick={openAddProgramModal}
                                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-colors"
                                >
                                  <Plus className="w-4 h-4" />
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
                            {hasPermission(
                              Permissions.MANAGE_PROGRAM_LEADS,
                            ) && (
                              <button
                                onClick={openAddProgramModal}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors mx-auto"
                              >
                                <Plus className="w-4 h-4" />
                                Assign Program Lead
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === "grades" && (
                      <div className="space-y-4">
                        {hasPermission(
                          Permissions.ASSIGN_GRADE_TO_CLASS_TEACHER,
                        ) && (
                          <div className="flex justify-end">
                            <button
                              onClick={openAddGradeModal}
                              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-colors"
                            >
                              <Plus className="w-4 h-4" />
                              Assign Grade
                            </button>
                          </div>
                        )}
                        {loadingGrades ? (
                          <div className="flex items-center justify-center py-6">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                          </div>
                        ) : userGrades && userGrades.length > 0 ? (
                          <div className="space-y-4">
                            {userGrades.map((grade: UserGrade) => (
                              <motion.div
                                key={grade.grade_id}
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
                                        {grade.program_name} • Level{" "}
                                        {grade.level_order}
                                      </p>
                                    </div>
                                  </div>
                                  {hasPermission(
                                    Permissions.ASSIGN_GRADE_TO_CLASS_TEACHER,
                                  ) && (
                                    <button
                                      onClick={() =>
                                        handleRemoveGrade(grade.grade_id)
                                      }
                                      className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-full transition-colors"
                                    >
                                      Remove
                                    </button>
                                  )}
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-300">
                                  Assigned on{" "}
                                  {new Date(
                                    grade.assigned_at,
                                  ).toLocaleDateString()}
                                </p>
                              </motion.div>
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

                    {activeTab === "activity" && (
                      <div className="space-y-4">
                        <div className="p-6 bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-3xl border border-green-200 dark:border-green-800">
                          <div className="flex items-center gap-4 mb-3">
                            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                              <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                            </div>
                            <div>
                              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                                Account Created
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {new Date(
                                  user.user.created_at,
                                ).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-300">
                            User account was successfully created and is ready
                            for use.
                          </p>
                        </div>

                        <div className="p-6 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-3xl border border-blue-200 dark:border-blue-800">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                              <UserIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                                Profile Setup
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {user.profile
                                  ? "Profile information is complete"
                                  : "Profile not yet setup"}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="p-6 bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-3xl border border-orange-200 dark:border-orange-800">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div
                                className={`w-12 h-12 rounded-full flex items-center justify-center ${
                                  user.user.status === "ACTIVE"
                                    ? "bg-green-100 dark:bg-green-900/30"
                                    : "bg-red-100 dark:bg-red-900/30"
                                }`}
                              >
                                {user.user.status === "ACTIVE" ? (
                                  <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                                ) : (
                                  <Ban className="w-6 h-6 text-red-600 dark:text-red-400" />
                                )}
                              </div>
                              <div>
                                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                                  Account Status
                                </p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  {user.user.status === "ACTIVE"
                                    ? "User can login and access the system"
                                    : "User cannot login to the system"}
                                </p>
                              </div>
                            </div>
                            {hasPermission(
                              Permissions.ENABLE_DISABLE_USERS,
                            ) && (
                              <button
                                onClick={handleStatusChange}
                                disabled={changingStatus}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors ${
                                  user.user.status === "ACTIVE"
                                    ? "bg-red-500 hover:bg-red-600 text-white"
                                    : "bg-green-500 hover:bg-green-600 text-white"
                                } disabled:opacity-50`}
                              >
                                {changingStatus ? (
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                ) : user.user.status === "ACTIVE" ? (
                                  <>
                                    <Ban className="w-4 h-4" />
                                    Disable
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="w-4 h-4" />
                                    Enable
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
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

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {availableGrades.length === 0 ? (
                    <div className="text-center py-8">
                      <Award className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        No available grades to assign
                      </p>
                    </div>
                  ) : (
                    availableGrades.map((grade) => (
                      <div
                        key={grade.grade_id}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-2xl"
                      >
                        <div>
                          <h5 className="font-medium text-gray-900 dark:text-white text-sm">
                            {grade.name}
                          </h5>
                          <p className="text-sm text-gray-500 dark:text-gray-400/50">
                            Level {grade.level_order}
                          </p>
                        </div>
                        <button
                          onClick={() => handleAssignGrade(grade.grade_id)}
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
    </AnimatePresence>
  );
};

export default UserProfileModal;
