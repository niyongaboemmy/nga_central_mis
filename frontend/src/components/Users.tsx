import React, { useState, useEffect, useRef, Suspense, lazy } from "react";
import { motion } from "framer-motion";
import {
  User as UserIcon,
  LayoutGrid,
  LayoutDashboard,
  Network,
  Loader2,
} from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { getRoles, Role } from "../api/users";
import UsersManagement from "./UsersManagement";
import UsersDashboard from "./UsersDashboard";

// The class-groups workspace pulls in a virtualised enrollment matrix and a
// class tree; code-split so admins who only use Management never load it.
const ClassGroupsManagement = lazy(
  () => import("./classgroups/ClassGroupsManagement"),
);

type Tab = "management" | "dashboard" | "classgroups";

const TABS: { id: Tab; label: string; shortLabel: string; icon: React.ElementType }[] = [
  {
    id: "management",
    label: "Management",
    shortLabel: "Management",
    icon: LayoutGrid,
  },
  {
    id: "dashboard",
    label: "Dashboard",
    shortLabel: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    id: "classgroups",
    label: "Class Groups Management",
    shortLabel: "Class Groups",
    icon: Network,
  },
];

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
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(
    () => new Set<Tab>(["management"]),
  );
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

  const handleSelectTab = (tab: Tab) => {
    setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
    setActiveTab(tab);
  };

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
            className="flex flex-wrap gap-1 mb-5 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-white/50 dark:border-slate-700/30 rounded-full p-1 w-fit max-w-full"
          >
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => handleSelectTab(tab.id)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    activeTab === tab.id
                      ? "bg-blue-500 text-white"
                      : "text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-slate-700/60"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.shortLabel}</span>
                </button>
              );
            })}
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
          {/* Mounted on first visit rather than upfront: unlike the other two
              tabs it is heavy (class tree + enrollment matrix). Once opened it
              stays mounted, so its selection and scroll survive tab switches. */}
          {visitedTabs.has("classgroups") && (
            <div className={activeTab === "classgroups" ? "" : "hidden"}>
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-16 text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Loading class groups workspace…
                  </div>
                }
              >
                <ClassGroupsManagement />
              </Suspense>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Users;
