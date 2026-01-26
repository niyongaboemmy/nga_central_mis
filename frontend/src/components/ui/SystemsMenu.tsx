import React, { useRef, useEffect } from "react";
import { authorizeSSO } from "../../api/auth";
import { useToast } from "../../contexts/ToastContext";
import { System } from "../../api/systems";

interface SystemsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  systems: System[];
}

const SystemsMenu: React.FC<SystemsMenuProps> = ({
  isOpen,
  onClose,
  systems,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  const handleSystemClick = async (system: System) => {
    // Get all allowed callbacks
    const callbacks = system.allowed_redirect_uris
      ? system.allowed_redirect_uris.split(",").map((s) => s.trim())
      : [];

    // Intelligently pick the best matching redirect URI
    // 1. Try to find one that matches our current origin (localhost -> localhost, etc.)
    // 2. Fallback to the first callback
    // 3. Fallback to home_url
    const currentOrigin = window.location.origin;
    const matchingCallback = callbacks.find((cb) =>
      cb.startsWith(currentOrigin),
    );
    const redirectUri = matchingCallback || callbacks[0] || system.home_url;

    if (!redirectUri) {
      showToast("No callback or home URL configured for this system", "error");
      return;
    }

    // Open window immediately to avoid popup blockers
    const newWindow = window.open("about:blank", "_blank");
    if (!newWindow) {
      showToast("Popup blocked! Please allow popups for this site.", "error");
      return;
    }

    if (!system.client_id) {
      newWindow.location.href = redirectUri;
      return;
    }

    const state = Math.random().toString(36).substring(2, 15);

    try {
      showToast(`Authenticating with ${system.name}...`, "info");
      const result = await authorizeSSO(
        system.client_id!,
        redirectUri,
        "code",
        state,
      );
      if (result && result.code) {
        const targetUrl = new URL(redirectUri);
        targetUrl.searchParams.append("code", result.code);
        if (result.state) {
          targetUrl.searchParams.append("state", result.state);
        }
        newWindow.location.href = targetUrl.toString();
      } else {
        newWindow.location.href = redirectUri;
      }
    } catch (error: any) {
      if (error.response?.status === 401) {
        // Session expired or missing - redirect to login with params
        newWindow.close();
        const loginUrl = new URL("/mis/login", window.location.origin);
        loginUrl.searchParams.set("client_id", system.client_id!);
        loginUrl.searchParams.set("redirect_uri", redirectUri);
        loginUrl.searchParams.set("response_type", "code");
        loginUrl.searchParams.set("state", state);
        window.location.href = loginUrl.toString();
        return;
      }

      showToast(
        error.response?.data?.message || "SSO Authentication failed",
        "error",
      );
      // Fallback to the redirect URI if SSO fails
      newWindow.location.href = redirectUri;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="absolute left-0 mt-2 w-80 bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-border-light dark:border-gray-700/30 overflow-hidden z-50 animate-fade-in"
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            Your Systems
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <svg
              className="w-5 h-5 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {systems.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500">No systems available.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {systems.map((system) => (
              <button
                key={system.system_id}
                onClick={() => handleSystemClick(system)}
                className="group flex flex-col items-center space-y-2 p-3 rounded-2xl hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200"
              >
                <div className="w-12 h-12 rounded-xl bg-gray-50 dark:bg-gray-800 group-hover:bg-white dark:group-hover:bg-gray-700 flex items-center justify-center border border-transparent group-hover:border-blue-100 dark:group-hover:border-blue-900/50 shadow-sm transition-all overflow-hidden">
                  {system.icon_url ? (
                    <img
                      src={system.icon_url}
                      alt={system.name}
                      className="w-8 h-8 object-contain"
                    />
                  ) : (
                    <svg
                      className="w-6 h-6 text-blue-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                  )}
                </div>
                <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 text-center truncate w-full">
                  {system.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="bg-gray-50 dark:bg-gray-800/50 p-4 border-t border-border-light dark:border-gray-700/30">
        <button className="w-full py-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
          View All Modules
        </button>
      </div>
    </div>
  );
};

export default SystemsMenu;
