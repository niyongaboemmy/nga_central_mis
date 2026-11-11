import {
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  CalendarDays,
  ClipboardCheck,
  Clock,
  Code2,
  Eye,
  FileText,
  Gavel,
  HeartHandshake,
  LayoutGrid,
  Mail,
  MessageCircle,
  MonitorSmartphone,
  Newspaper,
  PenLine,
  Rocket,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trophy,
  UserCheck,
  Video,
  Wifi,
  WifiOff,
  type LucideIcon,
} from "lucide-react";

/**
 * What amashuri.com promotes: the four apps and what each one does. Labels are
 * deliberately two or three words -- the page shows, it does not explain.
 */

export interface Feature {
  icon: LucideIcon;
  label: string;
}

export interface AppInfo {
  key: string;
  name: string;
  tagline: string;
  icon: LucideIcon;
  /** tailwind gradient stops for the app's tile */
  grad: string;
  /** soft glow colour behind the card on hover */
  glow: string;
  features: Feature[];
}

export const APPS: AppInfo[] = [
  {
    key: "mis",
    name: "Central MIS",
    tagline: "Run the school",
    icon: Building2,
    grad: "from-blue-500 to-indigo-600",
    glow: "rgba(59,108,255,0.35)",
    features: [
      { icon: CalendarDays, label: "Timetable & calendar" },
      { icon: BookOpen, label: "E-learning" },
      { icon: Sparkles, label: "AI Lesson Studio" },
      { icon: LayoutGrid, label: "Competency map" },
      { icon: HeartHandshake, label: "Mentorship" },
      { icon: Shield, label: "Safeguarding" },
      { icon: Clock, label: "Office hours" },
      { icon: BarChart3, label: "Analytics" },
    ],
  },
  {
    key: "tm",
    name: "Task Mentor",
    tagline: "Teach & assess",
    icon: ClipboardCheck,
    grad: "from-violet-500 to-fuchsia-600",
    glow: "rgba(168,85,247,0.35)",
    features: [
      { icon: PenLine, label: "Quizzes & assignments" },
      { icon: Sparkles, label: "AI questions" },
      { icon: Code2, label: "Code runner" },
      { icon: Terminal, label: "TMCode editor" },
      { icon: FileText, label: "Paper answer sheets" },
      { icon: Eye, label: "Proctoring" },
      { icon: Trophy, label: "Rankings" },
    ],
  },
  {
    key: "tendo",
    name: "Tendo",
    tagline: "Attendance & discipline",
    icon: UserCheck,
    grad: "from-emerald-500 to-teal-600",
    glow: "rgba(16,185,129,0.35)",
    features: [
      { icon: UserCheck, label: "Class registers" },
      { icon: WifiOff, label: "Works offline" },
      { icon: Wifi, label: "RFID check-in" },
      { icon: Gavel, label: "Discipline records" },
      { icon: Calendar, label: "Daily schedule" },
    ],
  },
  {
    key: "tupo",
    name: "Tupo",
    tagline: "Talk together",
    icon: MessageCircle,
    grad: "from-amber-400 to-orange-500",
    glow: "rgba(245,158,11,0.35)",
    features: [
      { icon: MessageCircle, label: "Chat" },
      { icon: Mail, label: "School mail" },
      { icon: Newspaper, label: "News feed" },
      { icon: Video, label: "Meetings" },
    ],
  },
];

/** Everything else that comes with the platform (the marquee). */
export const EXTRAS: Feature[] = [
  { icon: Bell, label: "Push reminders" },
  { icon: Send, label: "Telegram reminders" },
  { icon: Calendar, label: "Google Calendar" },
  { icon: MonitorSmartphone, label: "Desktop app" },
  { icon: ShieldCheck, label: "One sign-in" },
  { icon: Search, label: "Audit log" },
];

export const ALL_FEATURES: Feature[] = [...APPS.flatMap((a) => a.features), ...EXTRAS];

export const JOURNEY: Array<{ icon: LucideIcon; label: string }> = [
  { icon: PenLine, label: "Register" },
  { icon: Search, label: "Review" },
  { icon: ShieldCheck, label: "Approve & pay" },
  { icon: Rocket, label: "Go live" },
];
