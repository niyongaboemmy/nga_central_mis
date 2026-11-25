import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronsLeft, ChevronsRight, Clock3, Search, Star, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../../contexts/UserContext";
import { useTenantBranding } from "../../hooks/useTenantBranding";
import { requestAppsDialog } from "../apps/openAppsDialog";
import { useAccess } from "../../hooks/useAccess";
import { useMentorshipRole } from "../../hooks/useMentorshipRole";
import { useOptionalAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import { useSupervisingCount } from "../sideProjects/useSupervising";
import { useMotion } from "../../design/motion";
import UserAvatar from "./UserAvatar";
import { buildAccountLinks, buildNavAreas, matchPath, NavArea, NavGroup, NavLink, placeLinks, PlacedLink } from "./nav/navModel";

interface SidebarProps {
  /** Rail only: the panel opens over the page when an area is clicked. */
  isCollapsed?: boolean;
  onToggle?: () => void;
  onMenuClick?: () => void;
}

const KEYS = { area: "nga.sidebar.area", groups: "nga.sidebar.openGroups", pins: "nga.sidebar.pins", recent: "nga.sidebar.recent" };
const readList = (key: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const writeList = (key: string, list: string[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* private mode: just not remembered */
  }
};
const RECENT_MAX = 4;

const railBtn =
  "relative grid h-10 w-10 place-items-center rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const railIdle = "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/60 dark:hover:text-white";
const railOn = "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300";
const rowBase =
  "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1.5 pl-2.5 pr-8 text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const rowIdle = "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/50 dark:hover:text-white";
const rowOn = "bg-blue-50 font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300";
const headingCls = "px-2.5 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500";

const Badge: React.FC<{ n: number }> = ({ n }) => (
  <span className="ml-auto min-w-[1.25rem] rounded-full bg-blue-600 px-1.5 text-center text-[10px] font-semibold leading-5 text-white tabular-nums">
    {n > 99 ? "99+" : n}
    <span className="sr-only"> new</span>
  </span>
);

/**
 * The MIS menu: an icon rail of areas (Teaching, Oversight, Administration…) and a
 * panel with the chosen area's groups and pages. Labels on the rail show on hover or
 * focus. The panel adds a menu search ("/"), pinned pages and recent pages. Collapsed,
 * only the rail stays and the panel opens over the page.
 */
const Sidebar: React.FC<SidebarProps> = ({ isCollapsed = false, onToggle, onMenuClick }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useUser();
  const brand = useTenantBranding();
  const access = useAccess();
  const m = useMotion();
  const selectedYearId = useOptionalAcademicPeriod()?.selectedYearId;
  const mentorship = useMentorshipRole(user?.user?.user_id, selectedYearId);
  const userType = String(user?.profile?.user_type ?? "").toUpperCase();
  const supervising = useSupervisingCount(userType !== "STUDENT" && userType !== "PARENT" && !!user);

  const hasPermission = useCallback(
    (perm?: string | string[]) => {
      if (!perm) return true;
      const required = Array.isArray(perm) ? perm : [perm];
      return !!user?.roles?.some((role) => role.permissions?.some((p) => required.includes(p.name)));
    },
    [user],
  );

  const ctx = {
    isMentor: !!mentorship?.is_mentor,
    menteeCheckins: mentorship?.new_checkins ?? 0,
    hasMentor: !!mentorship?.has_mentor,
    supervising: supervising || 0,
    hasPermission,
    openApps: () => {
      if (!requestAppsDialog()) navigate("/apps");
    },
  };

  /** Both gates: the v1 permission and, where set, an access-control v2 capability. */
  const isVisible = (l: NavLink): boolean =>
    l.when !== false &&
    (!l.userTypes || l.userTypes.includes(userType)) &&
    hasPermission(l.requiredPermission) &&
    (!l.requiredCapability || access.can(l.requiredCapability) || (!!l.orPermission?.length && hasPermission(l.orPermission)));

  const areas: NavArea[] = buildNavAreas(ctx)
    .map((a) => {
      if (a.link) return isVisible(a.link) ? a : null;
      const groups = (a.groups ?? []).map((g) => ({ ...g, items: g.items.filter(isVisible) })).filter((g) => g.items.length > 0);
      return groups.length ? { ...a, groups } : null;
    })
    .filter((a): a is NavArea => !!a);
  const accountLinks = buildAccountLinks(ctx).filter(isVisible);
  const placed = placeLinks(areas);
  const current = matchPath(placed, location.pathname);
  const panelAreas = areas.filter((a) => a.groups);

  // ---- remembered state ----
  const [storedArea, setStoredArea] = useState<string | null>(() => {
    try {
      return localStorage.getItem(KEYS.area);
    } catch {
      return null;
    }
  });
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(readList(KEYS.groups)));
  const [pins, setPins] = useState<string[]>(() => readList(KEYS.pins));
  const [recent, setRecent] = useState<string[]>(() => readList(KEYS.recent));
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tip, setTip] = useState<{ label: string; badge: number; top: number; left: number } | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountBtnRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const chooseArea = (id: string) => {
    setStoredArea(id);
    try {
      localStorage.setItem(KEYS.area, id);
    } catch {
      /* not remembered */
    }
  };
  const setGroupOpen = (key: string, open: boolean) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (open) next.add(key);
      else next.delete(key);
      writeList(KEYS.groups, [...next]);
      return next;
    });
  const togglePin = (path: string) =>
    setPins((prev) => {
      const next = prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path];
      writeList(KEYS.pins, next);
      return next;
    });

  // Landing on a page: its area becomes the panel, it joins Recent, its group opens.
  const currentPath = current?.link.path;
  const currentAreaId = current?.area.groups ? current.area.id : null;
  const currentGroupKey = current?.group ? `${current.area.id}/${current.group.label}` : null;
  useEffect(() => {
    setOverlayOpen(false);
    setAccountOpen(false);
    setQuery("");
    if (currentAreaId) chooseArea(currentAreaId);
    if (currentGroupKey && !openGroups.has(currentGroupKey)) setGroupOpen(currentGroupKey, true);
    if (currentPath && currentAreaId) {
      setRecent((prev) => {
        const next = [currentPath, ...prev.filter((p) => p !== currentPath)].slice(0, RECENT_MAX + 1);
        writeList(KEYS.recent, next);
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const area = panelAreas.find((a) => a.id === storedArea) ?? panelAreas.find((a) => a.id === currentAreaId) ?? panelAreas[0];
  const panelVisible = !!area && (!isCollapsed || overlayOpen);

  // Overlay and account menu close on Escape or a click outside them.
  useEffect(() => {
    if (!overlayOpen && !accountOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (accountOpen && !accountRef.current?.contains(t) && !accountBtnRef.current?.contains(t)) setAccountOpen(false);
      if (overlayOpen && !asideRef.current?.contains(t)) setOverlayOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (accountOpen) {
        setAccountOpen(false);
        accountBtnRef.current?.focus();
      } else setOverlayOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [overlayOpen, accountOpen]);

  // "/" jumps to the menu search (not while typing somewhere else).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      if (searchRef.current) searchRef.current.focus();
      else {
        setOverlayOpen(true);
        window.setTimeout(() => searchRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isCollapsed]);

  // Move focus to the first account item when the menu opens.
  useEffect(() => {
    if (accountOpen) accountRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [accountOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return placed.filter(({ link, area: a, group }) => `${link.label} ${group?.label ?? ""} ${a.label}`.toLowerCase().includes(q)).slice(0, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, location.pathname, areas.length, placed.length]);

  const byPath = (path: string) => placed.find((p) => p.link.path === path && p.area.groups);
  const pinned = pins.map(byPath).filter((p): p is PlacedLink => !!p);
  const recents = recent
    .filter((p) => p !== currentPath && !pins.includes(p))
    .map(byPath)
    .filter((p): p is PlacedLink => !!p)
    .slice(0, RECENT_MAX - 1);

  const badgeOf = (a: NavArea) => (a.groups ?? []).reduce((n, g) => n + g.items.reduce((k, l) => k + (l.badge || 0), 0), 0);

  // ---- rail ----
  const showTip = (el: HTMLElement, label: string, badge = 0) => {
    const r = el.getBoundingClientRect();
    setTip({ label, badge, top: r.top + r.height / 2, left: r.right + 10 });
  };
  const tipProps = (label: string, badge = 0) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => showTip(e.currentTarget, label, badge),
    onMouseLeave: () => setTip(null),
    onFocus: (e: React.FocusEvent<HTMLElement>) => showTip(e.currentTarget, label, badge),
    onBlur: () => setTip(null),
  });
  const railKeys = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const all = Array.from(asideRef.current?.querySelectorAll<HTMLElement>("[data-rail]") ?? []);
    const i = all.indexOf(e.currentTarget);
    all[(i + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length]?.focus();
  };

  const onArea = (a: NavArea) => {
    setTip(null);
    if (isCollapsed) {
      if (overlayOpen && area?.id === a.id) setOverlayOpen(false);
      else {
        chooseArea(a.id);
        setOverlayOpen(true);
      }
      return;
    }
    if (area?.id === a.id) onToggle?.();
    else chooseArea(a.id);
  };

  // ---- panel rows ----
  const pageRow = (p: PlacedLink, opts: { showWhere?: boolean; icon?: React.ReactNode } = {}) => {
    const { link } = p;
    const active = current?.link === link;
    const isPinned = !!link.path && pins.includes(link.path);
    const Icon = link.icon;
    return (
      <li key={`${p.area.id}:${link.path ?? link.label}`} className="group/row relative flex items-center">
        <Link
          to={link.path!}
          onClick={() => onMenuClick?.()}
          aria-current={active ? "page" : undefined}
          className={`${rowBase} ${active ? rowOn : rowIdle}`}
        >
          <span className="shrink-0 opacity-80">{opts.icon ?? <Icon className="h-4 w-4" aria-hidden />}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{link.label}</span>
            {opts.showWhere && (
              <span className="block truncate text-[11px] font-normal text-gray-400 dark:text-gray-500">
                {[p.area.label, p.group && p.group.label !== p.area.label ? p.group.label : null].filter(Boolean).join(" › ")}
              </span>
            )}
          </span>
          {!!link.badge && <Badge n={link.badge} />}
        </Link>
        {link.path && (
          <button
            type="button"
            onClick={() => togglePin(link.path!)}
            aria-label={isPinned ? `Unpin ${link.label}` : `Pin ${link.label}`}
            aria-pressed={isPinned}
            title={isPinned ? "Unpin" : "Pin to top"}
            className={`absolute right-1 rounded-md p-1 transition focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isPinned
                ? "text-blue-600 opacity-0 group-hover/row:opacity-100 dark:text-blue-300"
                : "text-gray-400 opacity-0 hover:text-gray-700 group-hover/row:opacity-100 dark:hover:text-gray-200"
            } ${link.badge ? "hidden group-hover/row:block" : ""}`}
          >
            <Star className={`h-3.5 w-3.5 ${isPinned ? "fill-current" : ""}`} aria-hidden />
          </button>
        )}
      </li>
    );
  };

  const groupBlock = (a: NavArea, g: NavGroup) => {
    const key = `${a.id}/${g.label}`;
    const list = (
      <ul aria-label={g.label} className="space-y-0.5">
        {g.items.map((link) => pageRow({ link, area: a, group: g }))}
      </ul>
    );
    if (!g.collapsible) {
      return (
        <div key={key}>
          <h3 className={headingCls}>{g.label}</h3>
          {list}
        </div>
      );
    }
    const open = openGroups.has(key);
    const badge = g.items.reduce((n, l) => n + (l.badge || 0), 0);
    const panelId = `nav-group-${key.replace(/\W+/g, "-").toLowerCase()}`;
    return (
      <div key={key} className="pt-2">
        <button
          type="button"
          onClick={() => setGroupOpen(key, !open)}
          aria-expanded={open}
          aria-controls={panelId}
          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            currentGroupKey === key && !open ? "text-blue-600 dark:text-blue-300" : ""
          }`}
        >
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} aria-hidden />
          <span className="flex-1 text-left">{g.label}</span>
          {badge > 0 && !open ? <Badge n={badge} /> : <span className="rounded-full bg-gray-100 px-1.5 text-[10px] font-semibold leading-[18px] text-gray-500 tabular-nums dark:bg-gray-800/70 dark:text-gray-400">{g.items.length}</span>}
        </button>
        <div id={panelId} className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="overflow-hidden" hidden={!open}>
            <div className="ml-4 mt-0.5 border-l border-gray-200 pl-1.5 dark:border-gray-700/40">{list}</div>
          </div>
        </div>
      </div>
    );
  };

  const areaBody = (a: NavArea) => {
    const groups = a.groups ?? [];
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    // One group, or a handful of pages: no headings, just the pages.
    if (!groups.some((g) => g.collapsible) && (groups.length === 1 || total <= 4)) {
      return (
        <ul aria-label={a.label} className="space-y-0.5 pt-1">
          {groups.flatMap((g) => g.items.map((link) => pageRow({ link, area: a, group: g })))}
        </ul>
      );
    }
    return groups.map((g) => groupBlock(a, g));
  };

  const panel = area && (
    <div
      id="nav-panel"
      className={`flex w-56 min-h-0 flex-col ${
        isCollapsed
          ? "absolute left-16 top-0 h-full border-r border-gray-200 bg-white dark:border-gray-700/40 dark:bg-gray-900"
          : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3.5">
        <h2 className="truncate text-[15px] font-semibold text-gray-900 dark:text-white">{query ? "Search" : area.label}</h2>
        <button
          type="button"
          onClick={() => (isCollapsed ? setOverlayOpen(false) : onToggle?.())}
          aria-label={isCollapsed ? "Close menu" : "Collapse menu"}
          title={isCollapsed ? "Close" : "Collapse menu"}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800/60 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {isCollapsed ? <X className="h-4 w-4" aria-hidden /> : <ChevronsLeft className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      <div className="px-3 pb-2">
        <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1.5 transition-colors focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30 dark:border-gray-700/30 dark:bg-gray-900/50">
          <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setQuery("");
              } else if (e.key === "Enter" && results[0]?.link.path) {
                navigate(results[0].link.path);
                onMenuClick?.();
              }
            }}
            placeholder="Search menu"
            aria-label="Search menu"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : (
            <kbd className="rounded border border-gray-200 px-1 text-[10px] text-gray-400 dark:border-gray-700/40">/</kbd>
          )}
        </label>
      </div>
      <nav aria-label={query ? "Search results" : area.label} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {query ? (
          results.length ? (
            <ul aria-label="Search results" className="space-y-0.5">
              {results.map((p) => pageRow(p, { showWhere: true }))}
            </ul>
          ) : (
            <p className="px-2.5 py-6 text-center text-[13px] text-gray-500 dark:text-gray-400">No page called “{query}”. Try another word.</p>
          )
        ) : (
          <motion.div key={area.id} initial={m("reveal").initial} animate={m("reveal").animate} transition={m("reveal").transition}>
              {pinned.length > 0 && (
                <div>
                  <h3 className={headingCls}>Pinned</h3>
                  <ul aria-label="Pinned" className="space-y-0.5">
                    {pinned.map((p) => pageRow(p, { icon: <Star className="h-4 w-4 fill-current text-blue-500" aria-hidden /> }))}
                  </ul>
                </div>
              )}
              {recents.length > 0 && (
                <div>
                  <h3 className={headingCls}>Recent</h3>
                  <ul aria-label="Recent" className="space-y-0.5">
                    {recents.map((p) => pageRow(p, { icon: <Clock3 className="h-4 w-4" aria-hidden /> }))}
                  </ul>
                </div>
              )}
              {(pinned.length > 0 || recents.length > 0) && <div className="mx-2.5 mt-3 border-t border-gray-100 dark:border-gray-700/30" />}
              {areaBody(area)}
          </motion.div>
        )}
      </nav>
    </div>
  );

  const fullName = [user?.profile?.first_name, user?.profile?.last_name].filter(Boolean).join(" ") || user?.user?.username || "Account";
  const roleLabel = userType ? userType.charAt(0) + userType.slice(1).toLowerCase() : "";

  return (
    <>
      <aside
        ref={asideRef}
        className={`fixed left-0 top-16 z-50 flex border-r border-gray-200 bg-white transition-[width] duration-300 dark:border-gray-700/20 dark:bg-gray-800/30 ${
          isCollapsed ? "w-16" : "w-72"
        }`}
        style={{ height: "calc(100vh - 4rem)" }}
        aria-label="Main menu"
      >
        {/* Rail: one icon per area; the label shows on hover or focus. */}
        <nav aria-label="Areas" className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-gray-100 py-3 dark:border-gray-700/30">
          {areas.map((a) => {
            const Icon = a.icon;
            if (a.link) {
              const active = current?.area.id === a.id;
              return (
                <Link
                  key={a.id}
                  to={a.link.path!}
                  data-rail
                  aria-label={a.label}
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    setTip(null);
                    onMenuClick?.();
                  }}
                  onKeyDown={railKeys}
                  {...tipProps(a.label)}
                  className={`${railBtn} ${active ? railOn : railIdle}`}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </Link>
              );
            }
            const showing = panelVisible && area?.id === a.id;
            const holdsCurrent = currentAreaId === a.id;
            const badge = badgeOf(a);
            return (
              <button
                key={a.id}
                type="button"
                data-rail
                aria-label={badge ? `${a.label} (${badge} new)` : a.label}
                aria-expanded={showing}
                aria-controls="nav-panel"
                onClick={() => onArea(a)}
                onKeyDown={railKeys}
                {...tipProps(a.label, badge)}
                className={`${railBtn} ${showing ? railOn : holdsCurrent ? "text-blue-600 hover:bg-gray-100 dark:text-blue-300 dark:hover:bg-gray-800/60" : railIdle}`}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {badge > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-white dark:ring-gray-900" aria-hidden />}
              </button>
            );
          })}
          <div className="flex-1" />
          {isCollapsed && (
            <button type="button" data-rail onClick={onToggle} onKeyDown={railKeys} aria-label="Expand menu" {...tipProps("Expand menu")} className={`${railBtn} ${railIdle}`}>
              <ChevronsRight className="h-5 w-5" aria-hidden />
            </button>
          )}
          <button
            ref={accountBtnRef}
            type="button"
            data-rail
            onClick={() => {
              setTip(null);
              setAccountOpen((o) => !o);
            }}
            onKeyDown={railKeys}
            aria-label="Account"
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            {...tipProps("Account")}
            className={`mt-1 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${accountOpen ? "ring-2 ring-blue-500" : "hover:ring-2 hover:ring-gray-200 dark:hover:ring-gray-700"}`}
          >
            <UserAvatar name={fullName} avatar={user?.avatar} size={34} decorative fallback="person" />
          </button>
        </nav>

        {panelVisible && panel}
      </aside>

      {/* Rail labels: fixed so the rail's scroll box never clips them. */}
      <AnimatePresence>
        {tip && (
          <motion.div
            key={tip.label}
            role="tooltip"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none fixed z-[70] flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white dark:bg-gray-700"
            style={{ top: tip.top, left: tip.left }}
          >
            {tip.label}
            {tip.badge > 0 && <span className="rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold leading-4 tabular-nums">{tip.badge}</span>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Account menu: everything about you, out of the main list. */}
      <AnimatePresence>
        {accountOpen && (
          <motion.div
            ref={accountRef}
            role="menu"
            aria-label="Account"
            {...m("reveal")}
            className="fixed bottom-3 left-[4.5rem] z-[60] w-64 rounded-2xl border border-gray-200 bg-white p-1.5 dark:border-gray-700/40 dark:bg-gray-900"
            onKeyDown={(e) => {
              if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
              e.preventDefault();
              const items = Array.from(accountRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
              const i = items.indexOf(document.activeElement as HTMLElement);
              items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
            }}
          >
            <div className="flex items-center gap-3 px-2.5 pb-2.5 pt-2">
              <UserAvatar name={fullName} avatar={user?.avatar} size={36} decorative fallback="person" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">{fullName}</div>
                <div className="truncate text-xs text-gray-500 dark:text-gray-400">{roleLabel}</div>
              </div>
            </div>
            <div className="mb-1 border-t border-gray-100 dark:border-gray-700/30" />
            {accountLinks.map((l) => {
              const Icon = l.icon;
              const cls = `flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors focus:outline-none focus-visible:bg-gray-100 dark:focus-visible:bg-gray-800/60 ${
                l.path && location.pathname === l.path ? rowOn : rowIdle
              }`;
              const body = (
                <>
                  <Icon className="h-4 w-4 opacity-80" aria-hidden />
                  {l.label}
                </>
              );
              return l.path ? (
                <Link
                  key={l.label}
                  to={l.path}
                  role="menuitem"
                  className={cls}
                  onClick={() => {
                    setAccountOpen(false);
                    onMenuClick?.();
                  }}
                >
                  {body}
                </Link>
              ) : (
                <button
                  key={l.label}
                  type="button"
                  role="menuitem"
                  className={cls}
                  onClick={() => {
                    setAccountOpen(false);
                    l.action?.();
                    onMenuClick?.();
                  }}
                >
                  {body}
                </button>
              );
            })}
            <div className="mt-1 border-t border-gray-100 px-2.5 pb-1 pt-2 text-[11px] text-gray-400 dark:border-gray-700/30 dark:text-gray-500">
              {brand.isPrimary ? "NGA MIS v1.0" : `${brand.name} · MIS`}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;
