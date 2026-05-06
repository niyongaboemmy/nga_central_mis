import React, { useState, useEffect, useRef } from "react";
import {
  UserWithProfile,
  parentingApi,
  ParentingRelation,
} from "../../api/users";
import {
  Users,
  Plus,
  X,
  Search,
  User as UserIcon,
  Trash2,
  Eye,
} from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import { motion, AnimatePresence } from "framer-motion";

interface FamilyTabProps {
  user: UserWithProfile;
  onViewUser?: (userId: number) => void;
}

const FamilyTab: React.FC<FamilyTabProps> = ({ user, onViewUser }) => {
  const { showToast } = useToast();
  const [parents, setParents] = useState<ParentingRelation[]>([]);
  const [students, setStudents] = useState<ParentingRelation[]>([]);
  const [loading, setLoading] = useState(false);

  // Use useRef to prevent double loading
  const loadedUserIdRef = useRef<number | null>(null);
  const loadingRef = useRef(false);

  const [showAddModal, setShowAddModal] = useState<"parent" | "student" | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const userId = user.user.user_id;

  const loadData = async (force = false) => {
    if (!force && (loadingRef.current || loadedUserIdRef.current === userId))
      return;

    loadingRef.current = true;
    setLoading(true);
    try {
      const [parentsData, studentsData] = await Promise.all([
        parentingApi.getParents(userId),
        parentingApi.getStudents(userId),
      ]);
      setParents(parentsData?.data || []);
      setStudents(studentsData?.data || []);
      loadedUserIdRef.current = userId;
    } catch (error) {
      console.error("Failed to load family data", error);
      showToast("Failed to load family data", "error");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const excludeIds =
        showAddModal === "parent"
          ? [...parents.map((p) => p.user_id), userId].join(",")
          : [...students.map((s) => s.user_id), userId].join(",");

      const res = await parentingApi.search({
        query,
        excludeIds,
        type: showAddModal || undefined,
      });
      setSearchResults(res?.data || []);
    } catch (error) {
      console.error("Search failed", error);
    } finally {
      setSearching(false);
    }
  };

  const handleAssign = async (targetUserId: number) => {
    setAssigning(true);
    try {
      if (showAddModal === "parent") {
        await parentingApi.assign({
          student_id: userId,
          parent_id: targetUserId,
          relationship: "PARENT",
        });
        showToast("Parent assigned successfully", "success");
      } else {
        await parentingApi.assign({
          student_id: targetUserId,
          parent_id: userId,
          relationship: "PARENT",
        });
        showToast("Student assigned successfully", "success");
      }
      setShowAddModal(null);
      setSearchResults([]);
      setSearchQuery("");
      loadData(true); // Force reload
    } catch (error: any) {
      showToast(error.response?.data?.message || "Assignment failed", "error");
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = async (
    relation: ParentingRelation,
    type: "parent" | "student",
  ) => {
    if (!confirm("Are you sure you want to remove this relationship?")) return;

    try {
      if (type === "parent") {
        await parentingApi.remove({
          student_id: userId,
          parent_id: relation.user_id,
        });
      } else {
        await parentingApi.remove({
          student_id: relation.user_id,
          parent_id: userId,
        });
      }
      showToast("Removed successfully", "success");
      loadData(true); // Force reload
    } catch (error: any) {
      showToast(error.response?.data?.message || "Removal failed", "error");
    }
  };

  const RelationCard = ({
    relation,
    type,
  }: {
    relation: ParentingRelation;
    type: "parent" | "student";
  }) => (
    <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-700/30 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
          {relation.first_name?.[0] || relation.username[0].toUpperCase()}
        </div>
        <div>
          <p className="font-medium text-gray-900 dark:text-white">
            {relation.first_name} {relation.last_name || ""}
          </p>
          <p className="text-xs text-gray-500">@{relation.username}</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {onViewUser && (
          <button
            onClick={() => onViewUser(relation.user_id)}
            className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
            title="View Profile"
          >
            <Eye className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={() => handleRemove(relation, type)}
          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          title="Remove Relationship"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Parents Section */}
      <div className="bg-gray-50 dark:bg-slate-900/50 p-4 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
            <UserIcon className="w-4 h-4" /> Parents / Guardians
            <span className="bg-gray-200 dark:bg-slate-700 px-2 py-0.5 rounded-full text-xs text-gray-600 dark:text-gray-300">
              {parents.length}/2
            </span>
          </h3>
          {parents.length < 2 && (
            <button
              onClick={() => setShowAddModal("parent")}
              className="text-xs flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-full hover:bg-blue-700 transition"
            >
              <Plus className="w-3 h-3" /> Add Parent
            </button>
          )}
        </div>

        <div className="space-y-2">
          {parents.map((p) => (
            <RelationCard key={p.parenting_id} relation={p} type="parent" />
          ))}
          {parents.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-4 italic">
              No parents assigned
            </p>
          )}
        </div>
      </div>

      {/* Students Section */}
      <div className="bg-gray-50 dark:bg-slate-900/50 p-4 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4" /> Children / Students assigned
            <span className="bg-gray-200 dark:bg-slate-700 px-2 py-0.5 rounded-full text-xs text-gray-600 dark:text-gray-300">
              {students.length}
            </span>
          </h3>
          <button
            onClick={() => setShowAddModal("student")}
            className="text-xs flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-full hover:bg-blue-700 transition"
          >
            <Plus className="w-3 h-3" /> Add Student
          </button>
        </div>

        <div className="space-y-2">
          {students.map((s) => (
            <RelationCard key={s.parenting_id} relation={s} type="student" />
          ))}
          {students.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-4 italic">
              No students assigned
            </p>
          )}
        </div>
      </div>

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowAddModal(null)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-xl p-6 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Add {showAddModal === "parent" ? "Parent" : "Student"}
                </h3>
                <button
                  onClick={() => setShowAddModal(null)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, username or email..."
                  className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-slate-800 dark:text-white border-none rounded-xl focus:ring-2 focus:ring-blue-500"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2">
                {searching ? (
                  <div className="flex justify-center py-4">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((user) => (
                    <button
                      key={user.user_id}
                      onClick={() => handleAssign(user.user_id)}
                      disabled={assigning}
                      className="w-full flex items-center justify-between p-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition group text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-200 dark:bg-slate-700 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">
                          {user.username[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white text-sm">
                            {user.first_name} {user.last_name}
                          </p>
                          <p className="text-xs text-gray-500">
                            @{user.username} • {user.user_type}
                          </p>
                        </div>
                      </div>
                      <Plus className="w-4 h-4 text-gray-400 group-hover:text-blue-500" />
                    </button>
                  ))
                ) : searchQuery.length >= 2 ? (
                  <p className="text-center text-gray-400 text-sm py-2">
                    No users found
                  </p>
                ) : (
                  <p className="text-center text-gray-400 text-sm py-2">
                    Type to search users
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FamilyTab;
