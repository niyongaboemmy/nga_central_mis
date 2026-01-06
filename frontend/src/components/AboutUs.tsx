import React from "react";
import { motion } from "framer-motion";
import { Star, Target, Heart, Lightbulb } from "lucide-react";

interface AboutUsProps {
  onNavigateBack: () => void;
}

// Animated floating particles
const FloatingParticles = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    {[...Array(8)].map((_, i) => (
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

// Animated background shapes
const BackgroundShapes = () => (
  <>
    <motion.div
      animate={{
        y: [0, -30, 0],
        x: [0, 20, 0],
        scale: [1, 1.2, 1],
      }}
      transition={{ repeat: Infinity, duration: 10, ease: "easeInOut" }}
      className="absolute top-20 right-[5%] w-80 h-80 bg-blue-200/20 rounded-full blur-3xl"
    />
    <motion.div
      animate={{
        y: [0, 40, 0],
        x: [0, -20, 0],
        scale: [1, 1.3, 1],
      }}
      transition={{
        repeat: Infinity,
        duration: 12,
        ease: "easeInOut",
        delay: 1,
      }}
      className="absolute bottom-40 left-[5%] w-[400px] h-[400px] bg-blue-400/20 rounded-full blur-3xl"
    />
  </>
);

// Cute animated icons
const MissionIcon = () => (
  <motion.div
    animate={{ y: [0, -5, 0] }}
    transition={{ repeat: Infinity, duration: 2 }}
    className="w-16 h-16"
  >
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="28" fill="#3B82F6" />
      <path
        d="M32 12 L32 32 L44 32"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="32" cy="32" r="4" fill="white" />
    </svg>
  </motion.div>
);

const ValuesIcon = () => (
  <motion.div
    animate={{ scale: [1, 1.1, 1] }}
    transition={{ repeat: Infinity, duration: 2 }}
    className="w-16 h-16"
  >
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M32 8 L56 14 V30 C56 42 44 52 32 56 C20 52 8 42 8 30 V14 L32 8Z"
        fill="#8B5CF6"
      />
      <path d="M32 24 L40 32 L32 48 L24 32 Z" fill="white" />
      <path
        d="M26 28 L32 22 L38 28"
        stroke="#8B5CF6"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  </motion.div>
);

const InnovationIcon = () => (
  <motion.div
    animate={{ rotate: [0, 10, 0, -10, 0] }}
    transition={{ repeat: Infinity, duration: 3 }}
    className="w-16 h-16"
  >
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="28" fill="#F59E0B" />
      <path
        d="M32 16 L32 32 L44 44"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="32" cy="32" r="3" fill="white" />
      <path
        d="M20 20 L28 28"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  </motion.div>
);

const UserCentricIcon = () => (
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

// Modern stat card
const StatCard = ({
  value,
  label,
  delay,
}: {
  value: string;
  label: string;
  delay: number;
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.8 }}
    whileInView={{ opacity: 1, scale: 1 }}
    transition={{ delay }}
    whileHover={{ scale: 1.05 }}
    className="bg-white/80 dark:bg-slate-800/40 backdrop-blur-sm rounded-3xl p-6 text-center shadow-lg border border-white dark:border-slate-700/30"
  >
    <motion.span
      initial={{ scale: 0.5 }}
      whileInView={{ scale: 1 }}
      transition={{ delay, type: "spring" }}
      className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent"
    >
      {value}
    </motion.span>
    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{label}</p>
  </motion.div>
);

const AboutUs: React.FC<AboutUsProps> = ({ onNavigateBack }) => {
  const values = [
    {
      icon: <Target />,
      cuteIcon: <MissionIcon />,
      title: "Our Mission",
      description:
        "To empower educational institutions with innovative management solutions that streamline operations, enhance productivity, and enable data-driven decision-making for excellence in education.",
      color: "from-blue-500 to-blue-600",
    },
    {
      icon: <Lightbulb />,
      cuteIcon: <InnovationIcon />,
      title: "Innovation",
      description:
        "We continuously evolve to bring cutting-edge technology solutions that transform how institutions manage their daily operations and strategic planning.",
      color: "from-amber-500 to-amber-600",
    },
    {
      icon: <Heart />,
      cuteIcon: <UserCentricIcon />,
      title: "User-Centric Design",
      description:
        "Every feature is thoughtfully designed with our users' needs in mind, ensuring intuitive experiences that maximize efficiency and user satisfaction.",
      color: "from-pink-500 to-pink-600",
    },
    {
      icon: <Target />,
      cuteIcon: <ValuesIcon />,
      title: "Integrity & Trust",
      description:
        "We prioritize data security and privacy, building systems that institutions can rely on with confidence and peace of mind.",
      color: "from-blue-400 to-blue-400",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-slate-950 overflow-hidden relative">
      <FloatingParticles />
      <BackgroundShapes />

      {/* Hero Section */}
      <section className="relative z-10 pt-40 pb-20 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-block px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-sm font-medium mb-4"
            >
              About NGA Central MIS
            </motion.span>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6"
            >
              Empowering{" "}
              <span className="bg-gradient-to-r from-blue-600 via-blue-400 to-blue-600 bg-clip-text text-transparent">
                Educational Excellence
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto"
            >
              A modern education management system designed to transform how
              institutions operate and succeed.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="relative z-10 py-12 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <StatCard value="500+" label="Institutions" delay={0} />
            <StatCard value="50K+" label="Students" delay={0.1} />
            <StatCard value="99.9%" label="Uptime" delay={0.2} />
            <StatCard value="24/7" label="Support" delay={0.3} />
          </div>
        </div>
      </section>

      {/* Mission & Values Section */}
      <section className="relative z-10 py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            className="text-center mb-16"
          >
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              className="inline-block px-4 py-2 bg-blue-500 dark:bg-blue-400/30 text-white dark:text-blue-400 rounded-full text-sm font-medium mb-4"
            >
              Our Purpose
            </motion.span>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Mission & Values
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              The principles that guide everything we do
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            {values.map((value, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{
                  y: -8,
                  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
                }}
                className="group relative bg-white dark:bg-slate-800/50 rounded-3xl p-8 shadow-lg border border-white dark:border-slate-700/30 overflow-hidden"
              >
                {/* Animated background blob */}
                <motion.div
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.1, 0.15, 0.1],
                  }}
                  transition={{ repeat: Infinity, duration: 4 }}
                  className={`absolute -top-10 -right-10 w-40 h-40 rounded-full bg-gradient-to-r ${value.color} blur-2xl`}
                />

                {/* Content */}
                <div className="relative">
                  <div className="flex items-center gap-4 mb-6">
                    <motion.div
                      whileHover={{ rotate: 10, scale: 1.1 }}
                      className="w-16 h-16"
                    >
                      {value.cuteIcon}
                    </motion.div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {value.title}
                    </h3>
                  </div>
                  <p className="text-base text-gray-600 dark:text-gray-300 leading-relaxed">
                    {value.description}
                  </p>
                </div>

                {/* Hover indicator */}
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  whileHover={{ opacity: 1, x: 0 }}
                  className="absolute bottom-4 right-4 w-8 h-8 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center"
                >
                  <svg
                    className="w-4 h-4 text-gray-600 dark:text-gray-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Back Button */}
      <section className="relative z-10 py-16 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <motion.button
            onClick={onNavigateBack}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="inline-flex items-center px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-400 text-white font-semibold rounded-full shadow-lg shadow-blue-500/25 transition-all"
          >
            <svg
              className="w-5 h-5 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to Home
          </motion.button>
        </div>
      </section>
    </div>
  );
};

export default AboutUs;
