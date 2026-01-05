import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Users,
  BarChart3,
  GraduationCap,
  Shield,
  Clock,
  TrendingUp,
  Activity,
  PieChart,
  ArrowRight,
  Star,
  Sparkles,
} from "lucide-react";
import { Button } from "./ui";
import LOGO from "../assets/logo.png";

// Animated floating particles
const FloatingParticles = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    {[...Array(12)].map((_, i) => (
      <motion.div
        key={i}
        initial={{
          opacity: 0,
          x: Math.random() * window.innerWidth,
          y: window.innerHeight + 50,
        }}
        animate={{
          opacity: [0, 1, 0],
          y: -100,
        }}
        transition={{
          repeat: Infinity,
          duration: 10 + Math.random() * 10,
          delay: Math.random() * 10,
          ease: "linear",
        }}
        className="absolute"
        style={{
          left: `${Math.random() * 100}%`,
        }}
      >
        <Star className="w-3 h-3 text-yellow-400" fill="currentColor" />
      </motion.div>
    ))}
  </div>
);

// Animated background shapes with more variety
const BackgroundShapes = () => (
  <>
    <motion.div
      animate={{
        y: [0, -40, 0],
        x: [0, 30, 0],
        scale: [1, 1.2, 1],
      }}
      transition={{ repeat: Infinity, duration: 10, ease: "easeInOut" }}
      className="absolute top-20 right-[5%] w-96 h-96 bg-blue-200/20 rounded-full blur-3xl"
    />
    <motion.div
      animate={{
        y: [0, 50, 0],
        x: [0, -30, 0],
        scale: [1, 1.3, 1],
      }}
      transition={{
        repeat: Infinity,
        duration: 12,
        ease: "easeInOut",
        delay: 1,
      }}
      className="absolute bottom-20 left-[5%] w-[500px] h-[500px] bg-purple-200/20 rounded-full blur-3xl"
    />
    <motion.div
      animate={{
        scale: [1, 1.4, 1],
        opacity: [0.2, 0.4, 0.2],
      }}
      transition={{
        repeat: Infinity,
        duration: 8,
        ease: "easeInOut",
        delay: 2,
      }}
      className="absolute top-1/3 right-1/3 w-[400px] h-[400px] bg-indigo-200/20 rounded-full blur-3xl"
    />
    <motion.div
      animate={{
        rotate: [0, 360],
      }}
      transition={{ repeat: Infinity, duration: 60, ease: "linear" }}
      className="absolute inset-0 opacity-30"
    >
      <div className="absolute top-20 left-[20%] w-4 h-4 bg-blue-400/30 rounded-full" />
      <div className="absolute bottom-40 right-[15%] w-6 h-6 bg-purple-400/30 rounded-full" />
      <div className="absolute top-1/2 left-[10%] w-3 h-3 bg-indigo-400/30 rounded-full" />
    </motion.div>
  </>
);

// Animated line chart
const LineChart = () => (
  <div className="w-full h-48 relative">
    <svg viewBox="0 0 300 150" fill="none" className="w-full h-full">
      {[0, 30, 60, 90, 120].map((y, i) => (
        <line
          key={i}
          x1="20"
          y1={y + 20}
          x2="280"
          y2={y + 20}
          stroke="#E5E7EB"
          strokeWidth="1"
        />
      ))}

      <motion.path
        d="M20 120 L60 100 L100 85 L140 95 L180 70 L220 55 L260 40 L280 30"
        stroke="url(#lineGradient)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        transition={{ duration: 2, ease: "easeInOut" }}
      />

      <motion.path
        d="M20 120 L60 100 L100 85 L140 95 L180 70 L220 55 L260 40 L280 30 L280 140 L20 140 Z"
        fill="url(#areaGradient)"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 0.3 }}
        transition={{ delay: 1, duration: 1 }}
      />

      {[
        { x: 20, y: 120 },
        { x: 60, y: 100 },
        { x: 100, y: 85 },
        { x: 140, y: 95 },
        { x: 180, y: 70 },
        { x: 220, y: 55 },
        { x: 260, y: 40 },
        { x: 280, y: 30 },
      ].map((point, i) => (
        <motion.circle
          key={i}
          cx={point.x}
          cy={point.y}
          r="4"
          fill="#3B82F6"
          initial={{ scale: 0 }}
          whileInView={{ scale: 1 }}
          transition={{ delay: 1 + i * 0.1 }}
        />
      ))}

      <defs>
        <linearGradient id="lineGradient" x1="20" y1="30" x2="280" y2="30">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
        <linearGradient id="areaGradient" x1="20" y1="30" x2="280" y2="140">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  </div>
);

// Animated bar chart
const BarChart = () => (
  <div className="w-full h-48 flex items-end justify-center gap-3">
    {[
      { label: "Jan", value: 45, color: "from-blue-400 to-blue-600" },
      { label: "Feb", value: 65, color: "from-blue-400 to-blue-500" },
      { label: "Mar", value: 55, color: "from-blue-400 to-blue-600" },
      { label: "Apr", value: 80, color: "from-blue-400 to-blue-600" },
      { label: "May", value: 70, color: "from-blue-400 to-blue-500" },
      { label: "Jun", value: 90, color: "from-blue-500 to-blue-700" },
    ].map((item, i) => (
      <motion.div
        key={i}
        className="flex flex-col items-center gap-2"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.1 }}
      >
        <motion.div
          className={`w-10 bg-gradient-to-t ${item.color} rounded-t-lg relative overflow-hidden`}
          style={{ height: `${item.value * 1.5}px` }}
          initial={{ height: 0 }}
          whileInView={{ height: `${item.value * 1.5}px` }}
          transition={{ duration: 0.8, delay: i * 0.1 }}
        >
          <motion.div
            animate={{ y: ["0%", "100%", "0%"] }}
            transition={{ repeat: Infinity, duration: 2, delay: i * 0.2 }}
            className="absolute top-0 left-0 right-0 h-4 bg-white/30"
          />
        </motion.div>
        <span className="text-xs text-gray-500">{item.label}</span>
      </motion.div>
    ))}
  </div>
);

// Animated donut chart
const DonutChart = () => (
  <div className="w-40 h-40 relative">
    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
      <circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        stroke="#E5E7EB"
        strokeWidth="12"
      />
      <motion.circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        stroke="#3B82F6"
        strokeWidth="12"
        strokeDasharray="251.2"
        strokeDashoffset="251.2"
        initial={{ strokeDashoffset: 251.2 }}
        whileInView={{ strokeDashoffset: 251.2 * 0.25 }}
        transition={{ duration: 2, ease: "easeOut" }}
      />
      <motion.circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        stroke="#8B5CF6"
        strokeWidth="12"
        strokeDasharray="251.2"
        strokeDashoffset="251.2"
        initial={{ strokeDashoffset: 251.2 }}
        whileInView={{ strokeDashoffset: 251.2 * 0.45 }}
        transition={{ duration: 2, delay: 0.5, ease: "easeOut" }}
      />
      <motion.circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        stroke="#10B981"
        strokeWidth="12"
        strokeDasharray="251.2"
        strokeDashoffset="251.2"
        initial={{ strokeDashoffset: 251.2 }}
        whileInView={{ strokeDashoffset: 251.2 * 0.7 }}
        transition={{ duration: 2, delay: 1, ease: "easeOut" }}
      />
    </svg>
    <div className="absolute inset-0 flex items-center justify-center">
      <motion.div
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        transition={{ delay: 2, type: "spring" }}
        className="text-center"
      >
        <span className="text-2xl font-bold text-gray-900 dark:text-white">
          75%
        </span>
        <p className="text-xs text-gray-500">Complete</p>
      </motion.div>
    </div>
  </div>
);

// Animated area chart
const AreaChart = () => (
  <div className="w-full h-40 relative">
    <svg viewBox="0 0 300 120" fill="none" className="w-full h-full">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10B981" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d="M0 100 Q50 80 100 70 T200 50 T300 30 L300 120 L0 120 Z"
        fill="url(#areaGrad)"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        transition={{ duration: 1.5 }}
        transformOrigin="bottom"
      />
      <motion.path
        d="M0 100 Q50 80 100 70 T200 50 T300 30"
        stroke="#10B981"
        strokeWidth="3"
        fill="none"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        transition={{ duration: 2 }}
      />
      {[0, 50, 100, 150, 200, 250, 300].map((x, i) => (
        <motion.circle
          key={i}
          cx={x}
          cy={100 - i * 12}
          r="4"
          fill="#10B981"
          initial={{ scale: 0 }}
          whileInView={{ scale: 1 }}
          transition={{ delay: 2 + i * 0.1 }}
        />
      ))}
    </svg>
  </div>
);

// Professional student illustration
const StudentIllustration = () => (
  <motion.div
    animate={{
      y: [0, -15, 0],
      rotate: [0, 2, -2, 0],
    }}
    transition={{
      repeat: Infinity,
      duration: 4,
      ease: "easeInOut",
    }}
    className="relative w-80 h-80"
  >
    <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="70" y="110" width="60" height="50" rx="8" fill="#3B82F6" />
      <rect x="75" y="115" width="50" height="40" rx="4" fill="#60A5FA" />
      <path
        d="M85 115 L85 105 Q100 95 115 105 L115 115"
        stroke="#3B82F6"
        strokeWidth="4"
        fill="none"
      />
      <path
        d="M60 160 Q60 130 100 125 Q140 130 140 160 L140 180 L60 180 Z"
        fill="#1E40AF"
      />
      <circle cx="100" cy="70" r="45" fill="#FCD34D" />
      <path
        d="M55 65 Q60 25 100 25 Q140 25 145 65 Q140 45 100 45 Q60 45 55 65"
        fill="#1E293B"
      />
      <circle cx="85" cy="70" r="6" fill="#1E293B" />
      <circle cx="115" cy="70" r="6" fill="#1E293B" />
      <circle cx="87" cy="68" r="2" fill="white" />
      <circle cx="117" cy="68" r="2" fill="white" />
      <path
        d="M88 85 Q100 95 112 85"
        stroke="#1E293B"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M60 140 Q45 150 50 170"
        stroke="#FCD34D"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M140 140 Q155 150 150 170"
        stroke="#FCD34D"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <rect x="75" y="175" width="18" height="25" rx="6" fill="#1E293B" />
      <rect x="107" y="175" width="18" height="25" rx="6" fill="#1E293B" />
      <rect
        x="35"
        y="145"
        width="25"
        height="35"
        rx="3"
        fill="#10B981"
        transform="rotate(-20 35 145)"
      />
      <rect
        x="38"
        y="148"
        width="19"
        height="29"
        rx="2"
        fill="white"
        transform="rotate(-20 35 145)"
      />
      <motion.polygon
        points="160,40 163,52 175,52 165,60 169,72 160,64 151,72 155,60 145,52 157,52"
        fill="#FBBF24"
        animate={{ rotate: [0, 360] }}
        transition={{ repeat: Infinity, duration: 10, ease: "linear" }}
      />
      <motion.polygon
        points="40,100 42,108 50,108 44,113 46,121 40,116 34,121 36,113 30,108 38,108"
        fill="#FBBF24"
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ repeat: Infinity, duration: 2 }}
      />
    </svg>
  </motion.div>
);

// Cute animated student icon
const CuteStudentIcon = () => (
  <motion.div
    animate={{ y: [0, -5, 0] }}
    transition={{ repeat: Infinity, duration: 2 }}
    className="w-16 h-16"
  >
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="20" r="14" fill="#FCD34D" />
      <path d="M18 46 Q18 32 32 30 Q46 32 46 46" fill="#3B82F6" />
      <circle cx="27" cy="18" r="2" fill="#1E293B" />
      <circle cx="37" cy="18" r="2" fill="#1E293B" />
      <path
        d="M28 24 Q32 28 36 24"
        stroke="#1E293B"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M14 42 Q10 46 12 52"
        stroke="#FCD34D"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M50 42 Q54 46 52 52"
        stroke="#FCD34D"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <rect x="26" y="48" width="5" height="8" rx="2" fill="#1E293B" />
      <rect x="33" y="48" width="5" height="8" rx="2" fill="#1E293B" />
      <motion.rect x="22" y="36" width="8" height="10" rx="2" fill="#10B981" />
    </svg>
  </motion.div>
);

// Cute animated book icon
const CuteBookIcon = () => (
  <motion.div
    animate={{ rotate: [0, 5, 0, -5, 0] }}
    transition={{ repeat: Infinity, duration: 3 }}
    className="w-16 h-16"
  >
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="12" width="48" height="44" rx="4" fill="#10B981" />
      <rect x="12" y="16" width="40" height="36" rx="2" fill="white" />
      <path
        d="M18 24 L32 20 L46 24"
        stroke="#10B981"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M18 32 L32 28 L46 32"
        stroke="#10B981"
        strokeWidth="2"
        fill="none"
      />
      <path d="M18 40 L28 36" stroke="#10B981" strokeWidth="2" fill="none" />
      <motion.circle
        cx="42"
        cy="44"
        r="4"
        fill="#FCD34D"
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ repeat: Infinity, duration: 1.5 }}
      />
    </svg>
  </motion.div>
);

// Cute animated users icon
const CuteUsersIcon = () => (
  <motion.div
    animate={{ x: [0, 3, 0, -3, 0] }}
    transition={{ repeat: Infinity, duration: 2.5 }}
    className="w-16 h-16"
  >
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="20" r="10" fill="#F472B6" />
      <circle cx="48" cy="20" r="10" fill="#60A5FA" />
      <circle cx="32" cy="24" r="10" fill="#A78BFA" />
      <path d="M6 38 Q16 32 26 38" fill="#F472B6" />
      <path d="M38 38 Q48 32 58 38" fill="#60A5FA" />
      <path d="M22 42 Q32 36 42 42" fill="#A78BFA" />
    </svg>
  </motion.div>
);

// Cute animated chart icon
const CuteChartIcon = () => (
  <motion.div
    animate={{ scaleY: [1, 1.1, 1, 0.9, 1] }}
    transition={{ repeat: Infinity, duration: 2 }}
    className="w-16 h-16"
  >
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="36" width="8" height="20" rx="2" fill="#F472B6">
        <animate
          attributeName="height"
          values="20;16;20"
          dur="1s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="y"
          values="36;40;36"
          dur="1s"
          repeatCount="indefinite"
        />
      </rect>
      <rect x="22" y="24" width="8" height="32" rx="2" fill="#FB923C">
        <animate
          attributeName="height"
          values="32;26;32"
          dur="1.2s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="y"
          values="24;30;24"
          dur="1.2s"
          repeatCount="indefinite"
        />
      </rect>
      <rect x="34" y="14" width="8" height="42" rx="2" fill="#60A5FA">
        <animate
          attributeName="height"
          values="42;36;42"
          dur="0.8s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="y"
          values="14;20;14"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </rect>
      <rect x="46" y="28" width="8" height="28" rx="2" fill="#A78BFA">
        <animate
          attributeName="height"
          values="28;22;28"
          dur="1.1s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="y"
          values="28;34;28"
          dur="1.1s"
          repeatCount="indefinite"
        />
      </rect>
    </svg>
  </motion.div>
);

// Cute animated shield icon
const CuteShieldIcon = () => (
  <motion.div
    animate={{ scale: [1, 1.1, 1] }}
    transition={{ repeat: Infinity, duration: 2 }}
    className="w-16 h-16"
  >
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M32 8 L56 16 V32 C56 44 44 54 32 58 C20 54 8 44 8 32 V16 L32 8Z"
        fill="#3B82F6"
      />
      <path d="M32 20 L40 28 L32 44 L24 28 Z" fill="white" />
      <path
        d="M26 28 L32 22 L38 28"
        stroke="#3B82F6"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <motion.circle
        cx="32"
        cy="34"
        r="3"
        fill="#3B82F6"
        animate={{ opacity: [1, 0.5, 1] }}
        transition={{ repeat: Infinity, duration: 1.5 }}
      />
    </svg>
  </motion.div>
);

// Cute animated clock icon
const CuteClockIcon = () => (
  <motion.div
    animate={{ rotate: [0, 360] }}
    transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
    className="w-16 h-16"
  >
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle
        cx="32"
        cy="32"
        r="28"
        fill="#FBBF24"
        stroke="#F59E0B"
        strokeWidth="4"
      />
      <circle cx="32" cy="32" r="22" fill="white" />
      <line
        x1="32"
        y1="32"
        x2="32"
        y2="18"
        stroke="#1E293B"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <line
        x1="32"
        y1="32"
        x2="42"
        y2="32"
        stroke="#1E293B"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="32" cy="32" r="3" fill="#1E293B" />
    </svg>
  </motion.div>
);

// Modern Feature Card with cute icon
const ModernFeatureCard = ({
  icon,
  title,
  description,
  delay,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: number;
  color: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    whileHover={{
      y: -8,
      boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
    }}
    className="group relative bg-white dark:bg-slate-800 rounded-3xl p-8 shadow-lg border border-gray-100 dark:border-slate-700 overflow-hidden"
  >
    {/* Animated background blob */}
    <motion.div
      animate={{
        scale: [1, 1.2, 1],
        opacity: [0.1, 0.15, 0.1],
      }}
      transition={{ repeat: Infinity, duration: 4 }}
      className={`absolute -top-10 -right-10 w-40 h-40 rounded-full ${color} blur-2xl`}
    />

    {/* Icon container */}
    <div className="relative mb-6">
      <motion.div
        whileHover={{ rotate: 10, scale: 1.1 }}
        className="w-20 h-20 mx-auto"
      >
        {icon}
      </motion.div>
    </div>

    {/* Content */}
    <h3 className="relative text-2xl font-bold text-gray-900 dark:text-white text-center mb-4">
      {title}
    </h3>
    <p className="relative text-base text-gray-600 dark:text-gray-300 text-center leading-relaxed">
      {description}
    </p>

    {/* Hover arrow indicator */}
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      whileHover={{ opacity: 1, x: 0 }}
      className="absolute bottom-4 right-4 w-8 h-8 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center"
    >
      <ArrowRight className="w-4 h-4 text-gray-600 dark:text-gray-300" />
    </motion.div>
  </motion.div>
);

// Animated stats counter
const StatCounter = ({
  value,
  label,
  delay,
  icon: Icon,
}: {
  value: string;
  label: string;
  delay: number;
  icon?: React.ElementType;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    whileHover={{ scale: 1.05 }}
    className="text-center"
  >
    {Icon && (
      <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-500 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg">
        <Icon className="w-7 h-7 text-white" />
      </div>
    )}
    <motion.span
      initial={{ scale: 0.5 }}
      whileInView={{ scale: 1 }}
      transition={{ delay, type: "spring" }}
      className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent"
    >
      {value}
    </motion.span>
    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{label}</p>
  </motion.div>
);

// Chart preview card
const ChartCard = ({
  title,
  icon: Icon,
  children,
  delay,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  delay: number;
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    whileInView={{ opacity: 1, scale: 1 }}
    transition={{ delay }}
    whileHover={{
      y: -5,
      boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
    }}
    className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-lg border border-gray-100 dark:border-slate-700"
  >
    <div className="flex items-center gap-3 mb-6">
      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-500 rounded-full flex items-center justify-center shadow-md">
        <Icon className="w-5 h-5 text-white" />
      </div>
      <h3 className="font-bold text-lg text-gray-900 dark:text-white">
        {title}
      </h3>
    </div>
    {children}
  </motion.div>
);

// Animated CTA Button
const AnimatedCTAButton = ({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) => (
  <motion.button
    onClick={onClick}
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
    className="relative px-10 py-4 bg-white text-blue-600 font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all overflow-hidden"
  >
    <motion.div
      animate={{ x: ["-100%", "100%"] }}
      transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
      className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-100/50 to-transparent skew-x-12"
    />
    <span className="relative flex items-center gap-2">
      {children}
      <Sparkles className="w-5 h-5" />
    </span>
  </motion.button>
);

interface LandingProps {
  onNavigateToLogin: () => void;
  onNavigateToAbout: () => void;
  onNavigateToContact: () => void;
}

const Landing: React.FC<LandingProps> = ({
  onNavigateToLogin,
  onNavigateToAbout,
  onNavigateToContact,
}) => {
  const features = [
    {
      icon: <CuteStudentIcon />,
      title: "Student Management",
      description:
        "Comprehensive student records, enrollment tracking, and academic history management made simple.",
      color: "bg-blue-500",
    },
    {
      icon: <CuteBookIcon />,
      title: "Academic Programs",
      description:
        "Manage courses, curricula, class schedules, and examination systems efficiently.",
      color: "bg-green-500",
    },
    {
      icon: <CuteUsersIcon />,
      title: "Staff Administration",
      description:
        "Handle teacher records, payroll, attendance, and performance evaluations.",
      color: "bg-blue-500",
    },
    {
      icon: <CuteChartIcon />,
      title: "Analytics & Reports",
      description:
        "Generate detailed reports, analytics dashboards, and performance insights.",
      color: "bg-orange-500",
    },
    {
      icon: <CuteShieldIcon />,
      title: "Secure Access",
      description:
        "Role-based permissions and secure authentication to protect sensitive data.",
      color: "bg-blue-500",
    },
    {
      icon: <CuteClockIcon />,
      title: "Real-time Updates",
      description: "Instant notifications and live updates across all modules.",
      color: "bg-yellow-500",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 overflow-hidden">
      <FloatingParticles />
      <BackgroundShapes />

      {/* Hero Section */}
      <section className="relative z-10 pt-40 pb-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-2xl md:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-6 leading-tight"
              >
                <div className="mb-2">Empowering</div>
                <div className="bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600 bg-clip-text text-transparent">
                  Educational Excellence
                </div>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-xl"
              >
                A modern education management system that streamlines operations
                and boosts productivity.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-wrap gap-4"
              >
                <motion.button
                  onClick={onNavigateToLogin}
                  whileHover={{
                    scale: 1.02,
                    boxShadow: "0 20px 40px rgba(59, 130, 246, 0.3)",
                  }}
                  whileTap={{ scale: 0.98 }}
                  className="px-8 py-3.5 bg-gradient-to-r from-blue-500 via-blue-500 to-blue-600 text-white font-semibold rounded-full shadow-lg shadow-blue-500/25 transition-all relative overflow-hidden"
                >
                  <motion.div
                    animate={{ x: ["-100%", "100%"] }}
                    transition={{
                      repeat: Infinity,
                      duration: 2,
                      ease: "linear",
                    }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"
                  />
                  <span className="relative flex items-center gap-2">
                    Get Started <ArrowRight className="w-5 h-5" />
                  </span>
                </motion.button>
                <motion.button
                  onClick={onNavigateToAbout}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-8 py-3.5 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 font-semibold rounded-full shadow-lg border border-gray-200 dark:border-slate-700 hover:shadow-xl transition-all"
                >
                  Learn More
                </motion.button>
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative flex justify-center"
            >
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ repeat: Infinity, duration: 3 }}
              >
                <StudentIllustration />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 }}
                whileHover={{ scale: 1.05 }}
                className="absolute -bottom-4 -left-4 bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-4 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-lg">
                    <TrendingUp className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <motion.p
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                      className="text-sm font-bold text-gray-900 dark:text-white"
                    >
                      +25% Growth
                    </motion.p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      This month
                    </p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1 }}
                whileHover={{ scale: 1.05 }}
                className="absolute -top-4 -right-4 bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-4 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center shadow-lg">
                    <Activity className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">
                      Live Analytics
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Real-time data
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Decorative elements */}
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
                className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] border-2 border-dashed border-blue-200 dark:border-blue-400/20 rounded-full"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Charts Section */}
      <section className="relative z-10 py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <ChartCard title="Performance Trend" icon={TrendingUp} delay={0}>
              <LineChart />
            </ChartCard>

            <ChartCard title="Monthly Enrollment" icon={BarChart3} delay={0.1}>
              <BarChart />
            </ChartCard>

            <ChartCard title="Completion Rate" icon={PieChart} delay={0.2}>
              <div className="flex justify-center">
                <DonutChart />
              </div>
              <div className="flex justify-center gap-4 mt-4">
                {[
                  { color: "bg-blue-500", label: "Students" },
                  { color: "bg-blue-500", label: "Staff" },
                  { color: "bg-green-500", label: "Courses" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{
                        repeat: Infinity,
                        duration: 1,
                        delay: i * 0.2,
                      }}
                      className={`w-3 h-3 rounded-full ${item.color}`}
                    />
                    <span className="text-xs text-gray-500">{item.label}</span>
                  </div>
                ))}
              </div>
            </ChartCard>

            <ChartCard title="Attendance Rate" icon={Activity} delay={0.3}>
              <AreaChart />
            </ChartCard>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 py-24 px-4 bg-gray-50 dark:bg-slate-900">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            className="text-center mb-16"
          >
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              className="inline-block px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-base font-medium mb-4"
            >
              ✨ Powerful Features
            </motion.span>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Everything You Need
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Comprehensive tools designed for modern educational institutions
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <ModernFeatureCard
                key={index}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
                delay={index * 0.1}
                color={feature.color}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Landing;
