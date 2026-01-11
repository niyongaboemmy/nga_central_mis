import React from "react";
import { motion } from "framer-motion";
import { CheckCircle, XCircle } from "lucide-react";

interface PasswordStrengthGuideProps {
  password: string;
}

const PasswordStrengthGuide: React.FC<PasswordStrengthGuideProps> = ({
  password,
}) => {
  const criteria = [
    { label: "At least 8 characters", test: password.length >= 8 },
    { label: "Contains uppercase letter", test: /[A-Z]/.test(password) },
    { label: "Contains lowercase letter", test: /[a-z]/.test(password) },
    { label: "Contains a number", test: /\d/.test(password) },
    {
      label: "Contains special character",
      test: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
    },
  ];

  const metCount = criteria.filter((c) => c.test).length;
  const strengthPercentage = (metCount / criteria.length) * 100;

  const getStrengthColor = () => {
    if (strengthPercentage < 40) return "bg-red-500";
    if (strengthPercentage < 80) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div className="mt-2 p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border dark:border-none">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
        Password Strength
      </h4>
      <motion.div
        className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className={`h-2 rounded-full ${getStrengthColor()}`}
          initial={{ width: 0 }}
          animate={{ width: `${strengthPercentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </motion.div>
      <ul className="space-y-2">
        {criteria.map((criterion, index) => (
          <motion.li
            key={index}
            className="flex items-center text-sm"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1, duration: 0.3 }}
          >
            {criterion.test ? (
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500 mr-2" />
            )}
            <span
              className={
                criterion.test
                  ? "text-green-700 dark:text-green-400"
                  : "text-red-700 dark:text-red-400"
              }
            >
              {criterion.label}
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
};

export default PasswordStrengthGuide;
