import {
  BarChart3,
  Bell,
  BookOpen,
  Brain,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Code2,
  CreditCard,
  Eye,
  FileText,
  GraduationCap,
  HardDrive,
  HeartHandshake,
  KeyRound,
  LayoutGrid,
  MessageCircle,
  MonitorSmartphone,
  Newspaper,
  Palette,
  PartyPopper,
  Plug,
  Rocket,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  Terminal,
  Timer,
  UserCheck,
  Users,
  Video,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import type { TrackerStep } from "../../../api/tenantMgmt";

/**
 * One icon per entitlement key, so screens show what a package holds with
 * pictures instead of sentences (labels stay available as tooltips / sr-only).
 */
export const ENT_ICONS: Record<string, LucideIcon> = {
  "app.mis": Building2,
  "app.taskmentor": ClipboardCheck,
  "app.tendo": UserCheck,
  "app.tupo": MessageCircle,
  "app.desktop": MonitorSmartphone,
  "app.tmcode": Terminal,
  "feature.elearning": BookOpen,
  "feature.ai_lesson_studio": Sparkles,
  "feature.office_hours": Clock,
  "feature.safeguarding": Shield,
  "feature.mentorship": HeartHandshake,
  "feature.competency_map": LayoutGrid,
  "feature.reminders.push": Bell,
  "feature.reminders.telegram": Send,
  "feature.reminders.google_calendar": Calendar,
  "feature.analytics.advanced": BarChart3,
  "feature.tupo.meetings": Video,
  "feature.tupo.feed": Newspaper,
  "feature.tm.proctoring": Eye,
  "feature.tm.code_runner": Code2,
  "feature.tm.paper_sheets": FileText,
  "feature.tendo.rfid": Wifi,
  "feature.integration_api": Plug,
  "feature.mcp": Brain,
  "feature.custom_branding": Palette,
  "feature.custom_branding.pdf": Palette,
  "limit.students": GraduationCap,
  "limit.staff": Users,
  "limit.storage_gb": HardDrive,
  "limit.ai_requests_day": Sparkles,
  "limit.code_runs_day": Code2,
  "limit.tupo_meeting_minutes_month": Timer,
};

export const entIcon = (key: string): LucideIcon => ENT_ICONS[key] ?? KeyRound;

/** The applicant journey: one icon per tracker step. */
export const STEP_ICONS: Record<TrackerStep, LucideIcon> = {
  submitted: Send,
  review: Search,
  approved: ShieldCheck,
  payment: CreditCard,
  setup: Rocket,
  live: PartyPopper,
};

export const STEP_LABELS: Record<TrackerStep, string> = {
  submitted: "Submitted",
  review: "Review",
  approved: "Approved",
  payment: "Payment",
  setup: "Setup",
  live: "Live",
};

export { CheckCircle2 };
