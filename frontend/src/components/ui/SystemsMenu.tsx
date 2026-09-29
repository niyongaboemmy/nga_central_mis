import React, { useRef, useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Grid, ArrowRight, LayoutGrid } from "lucide-react";
import { authorizeSSO } from "../../api/auth";
import { buildLaunchHref, buildLoginHref, resolveRedirectUri, useLaunchLinks } from "./appLaunch";
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

  const { links, consume } = useLaunchLinks(systems, isOpen);

  /**
   * Tiles are real links so Chrome can open an app in its installed window
   * (see appLaunch.ts). This handler only covers the moments no link is
   * ready yet -- the code is still being minted -- by falling back to the
   * scripted flow, which always works but opens in a browser tab.
   */
  const fallbackLaunch = async (system: System) => {
    const redirectUri = resolveRedirectUri(system, window.location.origin);
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
      const result = await authorizeSSO(system.client_id, redirectUri, "code", state);
      newWindow.location.href = result && result.code ? buildLaunchHref(redirectUri, result.code, result.state) : redirectUri;
    } catch (error: any) {
      if (error.response?.status === 401) {
        newWindow.close();
        window.location.href = buildLoginHref(window.location.origin, system.client_id, redirectUri, state);
        return;
      }
      showToast(error.response?.data?.message || "SSO Authentication failed", "error");
      newWindow.location.href = redirectUri;
    }
  };

  const linkProps = (system: System) => {
    const link = links[system.system_id];
    if (link?.status === "ready" || link?.status === "error") {
      return {
        href: link.href,
        target: "_blank",
        rel: "noopener noreferrer",
        onClick: () => {
          consume(system.system_id);
          // After the browser has followed the link: a link removed from
          // the page mid-click can't navigate.
          window.setTimeout(onClose, 0);
        },
      };
    }
    if (link?.status === "signed-out") {
      // MIS session expired: sign in here first, then continue to the app.
      return { href: link.loginHref, onClick: () => window.setTimeout(onClose, 0) };
    }
    return {
      href: resolveRedirectUri(system, window.location.origin) || undefined,
      "aria-busy": true,
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        void fallbackLaunch(system);
      },
    };
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
          className="absolute left-0 mt-2 w-[300px] sm:w-[340px] bg-white/95 dark:bg-[#202226]/95 backdrop-blur-xl rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.15)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.5)] ring-1 ring-black/5 dark:ring-white/10 overflow-hidden z-[100]"
        >
          {/* Header Section */}
          <div className="p-3.5 pb-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl shadow-sm shadow-blue-600/20">
                  <LayoutGrid className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                    Apps
                  </h3>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    NGA Central MIS Ecosystem
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative group mb-3">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Search className="w-3.5 h-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              </div>
              <input
                type="text"
                placeholder="Search for apps"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full pl-9 pr-3 py-2 bg-black/[0.045] dark:bg-white/[0.07] border border-black/5 dark:border-white/10 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:bg-white dark:focus:bg-white/[0.09] transition-all text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
              />
            </div>
          </div>

          {/* Grid Section */}
          <div className="px-3 pb-3 max-h-[360px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
            {filteredSystems.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-10 h-10 bg-black/[0.03] dark:bg-white/[0.06] rounded-full flex items-center justify-center mx-auto mb-2.5">
                  <Search className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  No systems found matching "{searchQuery}"
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-1">
                {filteredSystems.map((system, idx) => (
                  <motion.a
                    key={system.system_id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    {...linkProps(system)}
                    title={`Open ${system.name}`}
                    className="group relative flex flex-col items-center p-1.5 pt-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-600/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 transition-all duration-200 text-center"
                  >
                    <div className="relative mb-1.5">
                      <div className="w-10 h-10 rounded-lg bg-white dark:bg-white/[0.06] shadow-[0_4px_10px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.3)] group-hover:shadow-[0_6px_16px_rgba(37,99,235,0.18)] group-hover:scale-105 flex items-center justify-center border border-black/5 dark:border-white/10 group-hover:border-blue-200 dark:group-hover:border-blue-500/30 transition-all duration-200 overflow-hidden">
                        {system.icon_url ? (
                          <img
                            src={system.icon_url}
                            alt={system.name}
                            className="w-6 h-6 object-contain rounded-md"
                          />
                        ) : (
                          <Grid className="w-5 h-5 text-blue-500 opacity-80" />
                        )}
                      </div>
                      <div className="absolute -top-1 -right-1 bg-blue-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow">
                        <ArrowRight className="w-2 h-2" />
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate w-full px-0.5">
                      {system.name}
                    </span>
                  </motion.a>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SystemsMenu;
