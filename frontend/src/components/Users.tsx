import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { User as UserIcon, LayoutGrid, LayoutDashboard } from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { getRoles, Role } from "../api/users";
import UsersManagement from "./UsersManagement";
import UsersDashboard from "./UsersDashboard";

type Tab = "management" | "dashboard";

// Animated floating particles
const FloatingParticles = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
    {[...Array(8)].map((_, i) => (
      <motion.div
        key={i}
        initial={{
          opacity: 0,
          x: `${Math.random() * 100}%`,
          y: "100%",
        }}
        animate={{
          opacity: [0, 0.3, 0],
          y: "-10%",
        }}
        transition={{
          repeat: Infinity,
          duration: 20 + Math.random() * 20,
          delay: Math.random() * 20,
          ease: "linear",
        }}
        className="absolute"
        style={{ left: `${Math.random() * 100}%` }}
      >
        <div className="w-2 h-2 bg-blue-300/30 rounded-full" />
      </motion.div>
    ))}
  </div>
);

// Users Management Page
const Users: React.FC = () => {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<Tab>("management");
  const [roles, setRoles] = useState<Role[]>([]);
  const [pendingRoleFilter, setPendingRoleFilter] = useState<string | null>(
    null,
  );

  const canManage = user?.roles?.find((itm) =>
    itm.permissions?.find(
      (perm) =>
        perm.name.includes("MANAGE_USERS") || perm.name.includes("ADMIN"),
    ),
  );

  const rolesFetchedRef = useRef(false);
  useEffect(() => {
    if (rolesFetchedRef.current) return;
    rolesFetchedRef.current = true;
    (async () => {
      try {
        const result = await getRoles();
        if (result) setRoles(result);
      } catch (error) {
        console.error("Failed to load roles:", error);
      }
    })();
  }, []);

  if (!canManage) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black overflow-hidden relative">
        <FloatingParticles />
        <div className="relative z-10 pb-10 pt-4 px-4 md:px-6">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-8"
            >
              <UserIcon className="w-10 h-10 text-gray-400 mx-auto mb-2" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                Access Denied
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                No permission to view user management.
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  const handleSelectRoleFromDashboard = (roleId: string) => {
    setPendingRoleFilter(roleId);
    setActiveTab("management");
  };

  return (
    <div className="min-h-screen overflow-hidden relative">
      <FloatingParticles />

      <div className="relative z-10 pb-10 pt-4 px-4 md:px-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4"
          >
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
              Users Management
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              View and manage all users
            </p>
          </motion.div>

          {/* Tabs */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 }}
            role="tablist"
            aria-label="Users view"
            className="flex gap-1 mb-5 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-white/50 dark:border-slate-700/30 rounded-full p-1 w-fit"
          >
            <button
              role="tab"
              aria-selected={activeTab === "management"}
              onClick={() => setActiveTab("management")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
                activeTab === "management"
                  ? "bg-blue-500 text-white"
                  : "text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-slate-700/60"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Management
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "dashboard"}
              onClick={() => setActiveTab("dashboard")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
                activeTab === "dashboard"
                  ? "bg-blue-500 text-white"
                  : "text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-slate-700/60"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </button>
          </motion.div>

          {/* Both tabs stay mounted permanently so switching between them
              never re-fetches data or loses scroll/filter/expand state. */}
          <div className={activeTab === "management" ? "" : "hidden"}>
            <UsersManagement
              roles={roles}
              initialRoleFilter={pendingRoleFilter}
              onInitialRoleFilterApplied={() => setPendingRoleFilter(null)}
            />
          </div>
          <div className={activeTab === "dashboard" ? "" : "hidden"}>
            <UsersDashboard
              roles={roles}
              onSelectRole={handleSelectRoleFromDashboard}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Users;
