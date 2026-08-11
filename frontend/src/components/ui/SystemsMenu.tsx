import React, { useRef, useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Grid } from "lucide-react";
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
  const [searchQuery, setSearchQuery] = useState("");

  // Close when clicking outside
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

  // Reset search when menu opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
    }
  }, [isOpen]);

  const filteredSystems = useMemo(() => {
    return systems.filter((s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [systems, searchQuery]);

  const handleSystemClick = async (system: System) => {
    const callbacks = system.allowed_redirect_uris
      ? system.allowed_redirect_uris.split(",").map((s) => s.trim())
      : [];

    const currentOrigin = window.location.origin;
    const matchingCallback = callbacks.find((cb) =>
      cb.startsWith(currentOrigin),
    );
    const redirectUri = matchingCallback || callbacks[0] || system.home_url;

    if (!redirectUri) {
      showToast("No callback or home URL configured for this system", "error");
      return;
    }

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
        newWindow.close();
        const loginUrl = new URL("/login", window.location.origin);
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
      newWindow.location.href = redirectUri;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.97, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: -8 }}
          transition={{ type: "spring", damping: 28, stiffness: 380 }}
          className="absolute left-0 mt-2 w-[340px] bg-white dark:bg-[#202226] rounded-[20px] shadow-[0_20px_44px_rgba(0,0,0,0.16),0_2px_10px_rgba(0,0,0,0.08)] dark:shadow-[0_20px_44px_rgba(0,0,0,0.55)] ring-1 ring-black/5 dark:ring-white/10 overflow-hidden z-[100]"
        >
          {/* Search */}
          <div className="px-3.5 pt-3.5 pb-2.5">
            <div className="flex items-center justify-between mb-2.5 px-0.5">
              <span className="text-[11px] font-semibold tracking-wide text-slate-500 dark:text-slate-400 uppercase">
                Apps
              </span>
              <button
                onClick={onClose}
                className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="relative group">
              <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              </div>
              <input
                type="text"
                placeholder="Search for apps"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full pl-10 pr-3 py-2.5 bg-black/[0.045] dark:bg-white/[0.07] border border-black/5 dark:border-white/10 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:bg-white dark:focus:bg-white/[0.09] transition-all text-[13px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
              />
            </div>
          </div>

          {/* Pinned label */}
          {filteredSystems.length > 0 && (
            <div className="px-4 mb-1">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Pinned
              </span>
            </div>
          )}

          {/* Grid Section */}
          <div className="px-2.5 pb-2 max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
            {filteredSystems.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-11 h-11 bg-black/[0.03] dark:bg-white/[0.06] rounded-full flex items-center justify-center mx-auto mb-3">
                  <Search className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  No systems found matching "{searchQuery}"
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-0.5">
                {filteredSystems.map((system, idx) => (
                  <motion.button
                    key={system.system_id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    onClick={() => handleSystemClick(system)}
                    className="group flex flex-col items-center justify-start gap-1.5 py-2.5 px-1 rounded-xl hover:bg-black/[0.05] dark:hover:bg-white/[0.08] active:bg-black/[0.08] dark:active:bg-white/[0.12] transition-colors duration-150 text-center"
                  >
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden">
                      {system.icon_url ? (
                        <img
                          src={system.icon_url}
                          alt={system.name}
                          className="w-9 h-9 object-contain rounded-lg"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                          <Grid className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>
                    <span className="text-[10.5px] font-medium text-slate-700 dark:text-slate-300 leading-tight line-clamp-2 px-0.5 w-full">
                      {system.name}
                    </span>
                  </motion.button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-black/5 dark:border-white/10 px-4 py-2.5 flex items-center justify-center">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
              NGA Central MIS Ecosystem
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SystemsMenu;
