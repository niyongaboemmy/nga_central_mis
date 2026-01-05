import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Input, Alert, VerificationCode } from "./ui";

interface PasswordRecoveryProps {
  onNavigateBackToLogin: () => void;
}

const PasswordRecovery: React.FC<PasswordRecoveryProps> = ({
  onNavigateBackToLogin,
}) => {
  const [step, setStep] = useState<"email" | "otp" | "newPassword">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setStep("otp");
    } catch (err) {
      setError("Failed to send verification code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setStep("newPassword");
    } catch (err) {
      setError("Invalid verification code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      setLoading(false);
      return;
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setSuccess(true);
    } catch (err) {
      setError("Failed to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Animation variants
  const formVariants = {
    initial: { opacity: 0, x: -50 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 50 },
  };

  const inputVariants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
  };

  const successVariants = {
    initial: { scale: 0, rotate: -180 },
    animate: {
      scale: 1,
      rotate: 0,
      transition: { type: "spring" as const, stiffness: 200, damping: 15 },
    },
  };

  if (success) {
    return (
      <motion.div
        className="min-h-screen pt-16"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="w-full max-w-md mx-auto px-4 py-8">
          <motion.div
            className="bg-card-light dark:bg-card-dark rounded-2xl p-8 border border-border-light dark:border-border-dark text-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <motion.div
              className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-6"
              variants={successVariants}
              initial="initial"
              animate="animate"
            >
              <svg
                className="w-10 h-10 text-green-600 dark:text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </motion.div>
            <motion.h1
              className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark mb-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              Password Reset Successful
            </motion.h1>
            <motion.p
              className="text-text-secondary-light dark:text-text-secondary-dark mb-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Your password has been successfully reset. You can now sign in
              with your new password.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <motion.button
                onClick={onNavigateBackToLogin}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 py-3 px-4"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Back to Login
              </motion.button>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="min-h-screen pt-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="w-full max-w-md mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <motion.div
            className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-600 to-blue-500 rounded-full mb-4 shadow-lg"
            whileHover={{ scale: 1.1, rotate: 10 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
          </motion.div>
          <motion.h1
            className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark mb-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            Reset Password
          </motion.h1>
          <motion.p
            className="text-text-secondary-light dark:text-text-secondary-dark"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            {step === "email" &&
              "Enter your email to receive a verification code"}
            {step === "otp" && "Enter the verification code sent to your email"}
            {step === "newPassword" && "Enter your new password"}
          </motion.p>
        </motion.div>

        {/* Form Card */}
        <motion.div
          className="bg-card-light dark:bg-card-dark/30 rounded-3xl p-8 border border-border-light dark:border-border-dark/20"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              variants={formVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3 }}
            >
              <AnimatePresence mode="wait">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Alert type="error" message={error} className="mb-6" />
                  </motion.div>
                )}
              </AnimatePresence>

              {step === "email" && (
                <motion.form
                  onSubmit={handleEmailSubmit}
                  className="space-y-6"
                  variants={formVariants}
                >
                  <motion.div
                    initial={inputVariants.initial}
                    animate={inputVariants.animate}
                    transition={{ delay: 0.2 }}
                  >
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      label="Email Address"
                      required
                    />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <motion.button
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 py-3 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={loading}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {loading ? (
                        <div className="flex items-center justify-center">
                          <motion.div
                            className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              ease: "linear",
                            }}
                          />
                          Sending...
                        </div>
                      ) : (
                        "Send Verification Code"
                      )}
                    </motion.button>
                  </motion.div>
                </motion.form>
              )}

              {step === "otp" && (
                <motion.form
                  onSubmit={handleOTPSubmit}
                  className="space-y-6"
                  variants={formVariants}
                >
                  <motion.div
                    className="space-y-2"
                    initial={inputVariants.initial}
                    animate={inputVariants.animate}
                    transition={{ delay: 0.2 }}
                  >
                    <label className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark block text-center">
                      Verification Code
                    </label>
                    <VerificationCode
                      length={6}
                      onChange={setOtp}
                      onComplete={(code) => {
                        setOtp(code);
                        if (code.length === 6) {
                          handleOTPSubmit({ preventDefault: () => {} } as any);
                        }
                      }}
                      error={!!error}
                    />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <motion.button
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 py-3 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={loading}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {loading ? (
                        <div className="flex items-center justify-center">
                          <motion.div
                            className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              ease: "linear",
                            }}
                          />
                          Verifying...
                        </div>
                      ) : (
                        "Verify Code"
                      )}
                    </motion.button>
                  </motion.div>
                  <motion.button
                    type="button"
                    onClick={() => {
                      setStep("email");
                      setOtp("");
                    }}
                    className="w-full text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    ← Back to email
                  </motion.button>
                </motion.form>
              )}

              {step === "newPassword" && (
                <motion.form
                  onSubmit={handlePasswordSubmit}
                  className="space-y-6"
                  variants={formVariants}
                >
                  <motion.div
                    initial={inputVariants.initial}
                    animate={inputVariants.animate}
                    transition={{ delay: 0.2 }}
                  >
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password"
                      label="New Password"
                      required
                    />
                  </motion.div>
                  <motion.div
                    initial={inputVariants.initial}
                    animate={inputVariants.animate}
                    transition={{ delay: 0.3 }}
                  >
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      label="Confirm Password"
                      required
                    />
                  </motion.div>
                  <motion.div
                    className="text-sm text-text-secondary-light dark:text-text-secondary-dark"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                  >
                    <p>Password must be at least 8 characters long</p>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <motion.button
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 py-3 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={loading}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {loading ? (
                        <div className="flex items-center justify-center">
                          <motion.div
                            className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              ease: "linear",
                            }}
                          />
                          Resetting Password...
                        </div>
                      ) : (
                        "Reset Password"
                      )}
                    </motion.button>
                  </motion.div>
                  <motion.button
                    type="button"
                    onClick={() => {
                      setStep("otp");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    className="w-full text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    ← Back to verification
                  </motion.button>
                </motion.form>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* Back to Login */}
        <motion.div
          className="mt-6 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <motion.button
            onClick={onNavigateBackToLogin}
            className="text-text-secondary-light dark:text-text-secondary-dark hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            ← Back to Login
          </motion.button>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default PasswordRecovery;
