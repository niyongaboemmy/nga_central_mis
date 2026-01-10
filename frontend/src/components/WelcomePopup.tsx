import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sun, Moon, Sunrise } from "lucide-react";
import { useUser } from "../contexts/UserContext";

interface WelcomePopupProps {
  onClose: () => void;
}

const WelcomePopup: React.FC<WelcomePopupProps> = ({ onClose }) => {
  const { user } = useUser();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return { text: "Good morning", icon: Sunrise };
    if (hour < 18) return { text: "Good afternoon", icon: Sun };
    return { text: "Good evening", icon: Moon };
  };

  const { text: greeting, icon: Icon } = getGreeting();

  const fullName = user?.profile
    ? `${user.profile.first_name} ${user.profile.last_name}`
    : user?.user.username || "User";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.8, opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="bg-card-light dark:bg-card-dark/90 backdrop-blur-xl rounded-3xl p-8 border border-white dark:border-border-dark/30 shadow-2xl max-w-md mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="flex justify-center mb-4"
            >
              <div className="p-4 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full shadow-lg shadow-blue-500/25">
                <Icon className="w-8 h-8 text-white" />
              </div>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark mb-2"
            >
              {greeting}, {fullName}!
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-text-secondary-light dark:text-text-secondary-dark/70 mb-6"
            >
              Welcome to the NGA Central MIS platform
            </motion.p>

            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
              onClick={onClose}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-full transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Get Started
            </motion.button>
          </div>

          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-text-secondary-light dark:text-text-secondary-dark/70 hover:text-text-primary-light dark:hover:text-text-primary-dark transition-colors"
          >
            <X className="w-5 h-5" />
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default WelcomePopup;
