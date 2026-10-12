import UserAvatar from "../ui/UserAvatar";
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  User,
  AtSign,
  GraduationCap,
  Users2,
  BookMarked,
  CalendarDays,
  UserMinus,
  Loader2,
  Hash,
} from "lucide-react";
import { EnrolledStudent } from "../../api/academics";

interface Props {
  student: EnrolledStudent | null;
  onClose: () => void;
  canManage?: boolean;
  onRemove?: (student: EnrolledStudent) => void;
  removing?: boolean;
}

const InfoRow: React.FC<{
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}> = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-gray-100 dark:border-gray-700/30">
    <div className="w-9 h-9 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center flex-shrink-0 border border-gray-100 dark:border-gray-700/40 shadow-sm">
      <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
    </div>
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
        {label}
      </p>
      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
        {value}
      </p>
    </div>
  </div>
);

const StudentDetailsModal: React.FC<Props> = ({
  student,
  onClose,
  canManage,
  onRemove,
  removing,
}) => {
  return (
    <AnimatePresence>
      {student && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
            onClick={onClose}
          />
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 10 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="relative w-full max-w-md max-h-[85vh] bg-white dark:bg-gray-900 rounded-[2rem] shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800 flex flex-col"
          >
            {/* Header */}
            <div className="relative flex-shrink-0 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 px-6 pt-8 pb-6">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex flex-col items-center text-center">
                <UserAvatar decorative userId={student.user_id} name={`${student.first_name} ${student.last_name}`} size={80} shape="rounded" ring />
                <h2 className="mt-3 text-lg font-bold text-white">
                  {student.first_name} {student.last_name}
                </h2>
                <p className="text-sm text-blue-100 flex items-center gap-1">
                  <AtSign className="w-3.5 h-3.5" />
                  {student.username}
                </p>
              </div>
            </div>

            {/* Info cards */}
            <div className="px-6 pt-5 pb-6 space-y-2.5 overflow-y-auto">
              {student.registration_number && (
                <InfoRow
                  icon={Hash}
                  label="Registration Number"
                  value={student.registration_number}
                />
              )}
              <InfoRow
                icon={User}
                label="Gender"
                value={
                  student.gender
                    ? student.gender.charAt(0) + student.gender.slice(1).toLowerCase()
                    : "—"
                }
              />
              <InfoRow
                icon={Users2}
                label="Class Group"
                value={student.class_group_name ?? "—"}
              />
              <InfoRow
                icon={GraduationCap}
                label="Grade"
                value={student.grade_name ?? "—"}
              />
              <InfoRow
                icon={BookMarked}
                label="Program"
                value={student.program_name ?? "—"}
              />
              <InfoRow
                icon={CalendarDays}
                label="Enrolled"
                value={new Date(student.enrolled_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              />

              {canManage && onRemove && (
                <button
                  onClick={() => onRemove(student)}
                  disabled={removing}
                  className="w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-xl border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {removing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserMinus className="w-4 h-4" />
                  )}
                  Remove from Subject
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default StudentDetailsModal;
