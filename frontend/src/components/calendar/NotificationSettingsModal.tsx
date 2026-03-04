import React from "react";
import { X } from "lucide-react";
import type { CalendarNotification } from "../../api/calendar";

interface NotificationSettingsModalProps {
  showModal: boolean;
  notifications: CalendarNotification[];
  onClose: () => void;
  onSave: () => void;
  onNotificationsChange: (notifications: CalendarNotification[]) => void;
  isSubmitting?: boolean;
}

const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({
  showModal,
  notifications,
  onClose,
  onSave,
  onNotificationsChange,
  isSubmitting,
}) => {
  if (!showModal) return null;

  const handleToggle = (minutes: number, checked: boolean) => {
    const existing = notifications.find((n) => n.minutes_before === minutes);
    if (existing) {
      onNotificationsChange(
        notifications.map((n) =>
          n.minutes_before === minutes
            ? { ...n, is_enabled: checked ? 1 : 0 }
            : n,
        ),
      );
    } else {
      onNotificationsChange([
        ...notifications,
        {
          notification_type: "LESSON_STARTING",
          minutes_before: minutes,
          is_enabled: checked ? 1 : 0,
          notification_method: "IN_APP",
        },
      ]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Notification Settings</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Get notified before your lessons start
          </p>
          <div className="flex items-center justify-between">
            <span className="font-medium">30 minutes before</span>
            <input
              type="checkbox"
              checked={notifications.some(
                (n) => n.minutes_before === 30 && n.is_enabled,
              )}
              onChange={(e) => handleToggle(30, e.target.checked)}
              className="w-5 h-5"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="font-medium">15 minutes before</span>
            <input
              type="checkbox"
              checked={notifications.some(
                (n) => n.minutes_before === 15 && n.is_enabled,
              )}
              onChange={(e) => handleToggle(15, e.target.checked)}
              className="w-5 h-5"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="font-medium">5 minutes before</span>
            <input
              type="checkbox"
              checked={notifications.some(
                (n) => n.minutes_before === 5 && n.is_enabled,
              )}
              onChange={(e) => handleToggle(5, e.target.checked)}
              className="w-5 h-5"
            />
          </div>
        </div>
        <div className="flex justify-end mt-6">
          <button
            onClick={onSave}
            disabled={isSubmitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting && (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            )}
            {isSubmitting ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationSettingsModal;
