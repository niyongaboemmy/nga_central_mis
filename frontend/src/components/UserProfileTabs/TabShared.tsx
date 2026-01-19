import React from "react";
import { CheckCircle, Clock4, Ban } from "lucide-react";

// Status badge with icon
export const StatusBadge = ({ status }: { status: string }) => {
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
export const UserTypeBadge = ({ type }: { type: string }) => {
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
export const InfoItem = ({
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
