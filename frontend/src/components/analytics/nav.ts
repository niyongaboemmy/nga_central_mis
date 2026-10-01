import {
  BarChart3,
  Compass,
  Cpu,
  Eye,
  Globe2,
  LayoutDashboard,
  LogIn,
  MapPin,
  MousePointerClick,
  Radio,
  Repeat,
  Settings2,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Header and section navigation for Usage & Monitoring. A tab only shows when the
 * viewer holds the capability its page needs (the server enforces it regardless).
 * The same list feeds the sidebar's "Usage & Monitoring" submenu, so the two
 * never disagree.
 */
export interface AnalyticsTab {
  to: string;
  label: string;
  caps: string[];
  icon: LucideIcon;
}

export const ANALYTICS_TABS: AnalyticsTab[] = [
  { to: "/analytics", label: "Overview", caps: ["ANALYTICS_VIEW"], icon: LayoutDashboard },
  { to: "/analytics/realtime", label: "Realtime", caps: ["ANALYTICS_VIEW", "ANALYTICS_LIVE_VIEW"], icon: Radio },
  { to: "/analytics/access", label: "Access & logins", caps: ["ANALYTICS_VIEW"], icon: LogIn },
  { to: "/analytics/audience", label: "Audience", caps: ["ANALYTICS_VIEW"], icon: Users },
  { to: "/analytics/visitors", label: "Visitors", caps: ["ANALYTICS_USER_VIEW"], icon: Globe2 },
  { to: "/analytics/engagement", label: "Engagement", caps: ["ANALYTICS_VIEW"], icon: MousePointerClick },
  { to: "/analytics/apps", label: "Apps", caps: ["ANALYTICS_VIEW"], icon: BarChart3 },
  { to: "/analytics/retention", label: "Retention", caps: ["ANALYTICS_VIEW"], icon: Repeat },
  { to: "/analytics/locations", label: "Locations", caps: ["ANALYTICS_VIEW"], icon: MapPin },
  { to: "/analytics/technology", label: "Technology", caps: ["ANALYTICS_VIEW"], icon: Cpu },
  { to: "/analytics/explore", label: "Explore", caps: ["ANALYTICS_VIEW"], icon: Compass },
  { to: "/analytics/watchlist", label: "Watchlist", caps: ["ANALYTICS_USER_CONTROL"], icon: Eye },
  { to: "/analytics/settings", label: "Settings", caps: ["ANALYTICS_CONFIGURE"], icon: Settings2 },
];

