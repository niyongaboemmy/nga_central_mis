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
  /** a few words under the label in the module explorer */
  hint?: string;
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
  /** the app's solid colour (borders, rings, tilt glow) */
  accent: string;
  features: Feature[];
}

export const APPS: AppInfo[] = [
  {
    key: "mis",
    name: "Central MIS",
    tagline: "Run the school",
    icon: Building2,
    grad: "from-blue-600 to-blue-800",
    glow: "rgba(47,86,217,0.35)",
    accent: "#2f56d9",
    features: [
      { icon: CalendarDays, label: "Timetable & calendar", hint: "Every lesson, every room" },
      { icon: BookOpen, label: "E-learning", hint: "Courses that publish themselves" },
      { icon: Sparkles, label: "AI Lesson Studio", hint: "Lessons drafted in minutes" },
      { icon: LayoutGrid, label: "Competency map", hint: "Skills, not just marks" },
      { icon: HeartHandshake, label: "Mentorship", hint: "Every student has someone" },
      { icon: Shield, label: "Safeguarding", hint: "Concerns never get lost" },
      { icon: Clock, label: "Office hours", hint: "Book a teacher's time" },
      { icon: BarChart3, label: "Analytics", hint: "See how the school runs" },
    ],
  },
  {
    key: "tm",
    name: "Task Mentor",
    tagline: "Teach & assess",
    icon: ClipboardCheck,
    grad: "from-sky-500 to-blue-600",
    glow: "rgba(14,165,233,0.35)",
    accent: "#0ea5e9",
    features: [
      { icon: PenLine, label: "Quizzes & assignments", hint: "Set, submit, grade" },
      { icon: Sparkles, label: "AI questions", hint: "Question banks on demand" },
      { icon: Code2, label: "Code runner", hint: "Run code in 20+ languages" },
      { icon: Terminal, label: "TMCode editor", hint: "A real IDE for exams" },
      { icon: FileText, label: "Paper answer sheets", hint: "Print, scan, auto-mark" },
      { icon: Eye, label: "Proctoring", hint: "Fair online exams" },
      { icon: Trophy, label: "Rankings", hint: "Progress made visible" },
    ],
  },
  {
    key: "tendo",
    name: "Tendo",
    tagline: "Attendance & discipline",
    icon: UserCheck,
    grad: "from-cyan-500 to-sky-700",
    glow: "rgba(6,182,212,0.35)",
    accent: "#06b6d4",
    features: [
      { icon: UserCheck, label: "Class registers", hint: "Roll call in seconds" },
      { icon: WifiOff, label: "Works offline", hint: "No signal, no problem" },
      { icon: Wifi, label: "RFID check-in", hint: "Tap a card at the gate" },
      { icon: Gavel, label: "Discipline records", hint: "Fair and on record" },
      { icon: Calendar, label: "Daily schedule", hint: "Today at a glance" },
    ],
  },
  {
    key: "tupo",
    name: "Tupo",
    tagline: "Talk together",
    icon: MessageCircle,
    grad: "from-blue-400 to-blue-600",
    glow: "rgba(59,130,246,0.35)",
    accent: "#3b82f6",
    features: [
      { icon: MessageCircle, label: "Chat", hint: "Classes and staff rooms" },
      { icon: Mail, label: "School mail", hint: "Inbox for the whole school" },
      { icon: Newspaper, label: "News feed", hint: "School news, one place" },
      { icon: Video, label: "Meetings", hint: "Video calls built in" },
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
