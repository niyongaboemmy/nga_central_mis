import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, FolderOpen, FileText, ShieldOff, X } from "lucide-react";
import { useNotifications } from "../../contexts/NotificationContext";
import type { AppNotification } from "../../api/notifications";

const kindIcon = (kind: string) => {
  switch (kind) {
    case "folder_shared":
      return <FolderOpen className="w-4 h-4 text-blue-500" />;
    case "permission_revoked":
      return <ShieldOff className="w-4 h-4 text-red-500" />;
    case "document_shared":
    default:
      return <FileText className="w-4 h-4 text-blue-500" />;
  }
};

const timeAgo = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const isToday = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
};

const NotificationBell: React.FC = () => {
  const { notifications, unreadCount, markRead, markAllRead, remove } =
    useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleClick = async (item: AppNotification) => {
    if (!item.notification.read_at) {
      await markRead(item.notification.notification_id);
    }
    setIsOpen(false);
    if (item.notification.link) {
      navigate(item.notification.link);
    }
  };

  const todayItems = notifications.filter((n) =>
    isToday(n.notification.created_at),
  );
  const earlierItems = notifications.filter(
    (n) => !isToday(n.notification.created_at),
  );

  const renderGroup = (label: string, items: AppNotification[]) => {
    if (items.length === 0) return null;
    return (
      <div key={label}>
        <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
          {label}
        </p>
        {items.map((item) => (
          <div
            key={item.notification.notification_id}
            onClick={() => handleClick(item)}
            className={`group flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
              !item.notification.read_at
                ? "bg-blue-50/60 dark:bg-blue-900/10"
                : ""
            }`}
          >
            <div className="mt-0.5 flex-shrink-0">
              {kindIcon(item.notification.kind)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                {item.notification.title}
              </p>
              {item.notification.body && (
                <p className="text-xs text-gray-500 truncate">
                  {item.notification.body}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">
                {timeAgo(item.notification.created_at)}
              </p>
            </div>
            {!item.notification.read_at && (
              <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                remove(item.notification.notification_id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-opacity flex-shrink-0"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="relative p-2 rounded-xl text-text-secondary-light dark:text-text-secondary-dark/70 hover:bg-surface-light dark:hover:bg-surface-dark transition-all duration-200"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-border-light dark:border-gray-700/30 overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-light dark:border-gray-700/40">
            <p className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark">
              Notifications
            </p>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Check className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                <Bell className="w-8 h-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">No notifications yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  You'll see it here when someone shares a file or folder
                  with you.
                </p>
              </div>
            ) : (
              <>
                {renderGroup("Today", todayItems)}
                {renderGroup("Earlier", earlierItems)}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
