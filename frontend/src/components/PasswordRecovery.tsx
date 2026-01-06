import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Input, Alert, VerificationCode } from "./ui";
import {
  Star,
  Mail,
  Lock,
  ArrowRight,
  CheckCircle,
  Shield,
  Key,
} from "lucide-react";

interface PasswordRecoveryProps {
  onNavigateBackToLogin: () => void;
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
        <Star className="w-3 h-3 text-blue-400" fill="currentColor" />
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
      className="absolute top-20 left-[5%] w-96 h-96 bg-blue-200/20 rounded-full blur-3xl"
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
      className="absolute bottom-20 right-[5%] w-[500px] h-[500px] bg-blue-200/20 rounded-full blur-3xl"
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
      className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-pink-200/20 rounded-full blur-3xl"
    />
  </>
);

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

  // Progress indicator for steps
  const ProgressIndicator = () => (
    <motion.div
      className="flex justify-center gap-2 mb-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {["email", "otp", "newPassword"].map((s, i) => (
        <motion.div
          key={s}
          className={`w-3 h-3 rounded-full transition-colors duration-300 ${
            (s === "email" && step === "email") ||
            (s === "otp" && (step === "otp" || step === "newPassword")) ||
            (s === "newPassword" && step === "newPassword")
              ? "bg-gradient-to-r from-blue-500 to-blue-600"
              : "bg-gray-300 dark:bg-gray-600"
          }`}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: i * 0.1 }}
        />
      ))}
    </motion.div>
  );

  // Get step icon
  const getStepIcon = () => {
    switch (step) {
      case "email":
        return <Mail className="w-8 h-8 text-white" />;
      case "otp":
        return <Shield className="w-8 h-8 text-white" />;
      case "newPassword":
        return <Key className="w-8 h-8 text-white" />;
    }
  };

  // Get step title
  const getStepTitle = () => {
    switch (step) {
      case "email":
        return "Reset Password";
      case "otp":
        return "Verify Your Identity";
      case "newPassword":
        return "Set New Password";
    }
  };

  // Get step description
  const getStepDescription = () => {
    switch (step) {
      case "email":
        return "Enter your email to receive a verification code";
      case "otp":
        return "Enter the verification code sent to your email";
      case "newPassword":
        return "Enter your new password";
    }
  };

  if (success) {
    return (
      <motion.div
        className="min-h-screen relative overflow-hidden bg-gradient-to-br from-gray-50 to-blue-50 dark:from-slate-950 dark:to-slate-900"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
      >
        <FloatingParticles />
        <BackgroundShapes />

        <div className="relative z-10 pt-20 pb-8 px-4">
          <div className="w-full max-w-md mx-auto">
            <motion.div
              className="bg-white/80 dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl p-8 border border-gray-100 dark:border-slate-800 shadow-2xl text-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
            >
              <motion.div
                className="flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full mb-6 shadow-lg"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
              >
                <CheckCircle className="w-10 h-10 text-white" />
              </motion.div>
              <motion.h1
                className="text-2xl font-bold text-gray-900 dark:text-white mb-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                Password Reset Successful
              </motion.h1>
              <motion.p
                className="text-gray-600 dark:text-gray-300 mb-6"
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
                  className="w-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 hover:from-blue-600 hover:via-blue-700 hover:to-blue-700 text-white font-semibold py-3.5 px-6 rounded-full shadow-lg hover:shadow-xl transition-all relative overflow-hidden"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
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
                  <span className="relative flex items-center justify-center gap-2">
                    Back to Login
                    <ArrowRight className="w-5 h-5" />
                  </span>
                </motion.button>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="min-h-screen relative overflow-hidden bg-gradient-to-br from-gray-50 to-blue-50 dark:from-slate-950 dark:to-slate-950 pt-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <FloatingParticles />
      <BackgroundShapes />

      <div className="relative z-10 pt-20 pb-8 px-4">
        <div className="w-full max-w-md mx-auto">
          {/* Header */}
          <motion.div
            className="flex flex-col items-center mb-6"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <motion.div
              className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full mb-4 shadow-lg shadow-blue-500/25"
              whileHover={{ scale: 1.05, rotate: 5 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              {getStepIcon()}
            </motion.div>
            <motion.h1
              className="text-2xl font-bold text-gray-900 dark:text-white"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              {getStepTitle()}
            </motion.h1>
          </motion.div>

          {/* Form Card */}
          <motion.div
            className="bg-white/80 dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl p-8 border border-gray-100 dark:border-slate-800 shadow-2xl"
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

                <ProgressIndicator />

                {step === "email" && (
                  <motion.form
                    onSubmit={handleEmailSubmit}
                    className="space-y-5"
                    variants={formVariants}
                  >
                    <motion.div
                      initial={inputVariants.initial}
                      animate={inputVariants.animate}
                      transition={{ delay: 0.2 }}
                    >
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="Enter your email"
                          className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-slate-900/50 border-2 border-gray-200 dark:border-slate-600 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 text-gray-900 dark:text-white placeholder-gray-400"
                          required
                        />
                      </div>
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <motion.button
                        type="submit"
                        className="w-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 hover:from-blue-600 hover:via-blue-700 hover:to-blue-700 text-white font-semibold py-3.5 px-6 rounded-full transition-all duration-200 transform hover:scale-[1.02] shadow-lg hover:shadow-xl relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={loading}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
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
                          <span className="relative flex items-center justify-center gap-2">
                            Send Verification Code
                            <ArrowRight className="w-5 h-5" />
                          </span>
                        )}
                      </motion.button>
                    </motion.div>
                  </motion.form>
                )}

                {step === "otp" && (
                  <motion.form
                    onSubmit={handleOTPSubmit}
                    className="space-y-5"
                    variants={formVariants}
                  >
                    <motion.div
                      className="space-y-2"
                      initial={inputVariants.initial}
                      animate={inputVariants.animate}
                      transition={{ delay: 0.2 }}
                    >
                      <VerificationCode
                        length={6}
                        onChange={setOtp}
                        onComplete={(code) => {
                          setOtp(code);
                          if (code.length === 6) {
                            handleOTPSubmit({
                              preventDefault: () => {},
                            } as any);
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
                        className="w-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 hover:from-blue-600 hover:via-blue-700 hover:to-blue-700 text-white font-semibold py-4 px-6 rounded-full transition-all duration-200 transform hover:scale-[1.02] shadow-lg hover:shadow-xl relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={loading}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
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
                          <span className="relative flex items-center justify-center gap-2">
                            Verify Code
                            <CheckCircle className="w-5 h-5" />
                          </span>
                        )}
                      </motion.button>
                    </motion.div>
                    <motion.button
                      type="button"
                      onClick={() => {
                        setStep("email");
                        setOtp("");
                      }}
                      className="w-full text-sm text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 font-medium transition-colors flex items-center justify-center gap-2"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      whileHover={{ scale: 1.02 }}
                    >
                      <ArrowRight className="w-4 h-4 rotate-180" />
                      Back to email
                    </motion.button>
                  </motion.form>
                )}

                {step === "newPassword" && (
                  <motion.form
                    onSubmit={handlePasswordSubmit}
                    className="space-y-5"
                    variants={formVariants}
                  >
                    <motion.div
                      initial={inputVariants.initial}
                      animate={inputVariants.animate}
                      transition={{ delay: 0.2 }}
                    >
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="New password"
                          className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-slate-900/50 border-2 border-gray-200 dark:border-slate-600 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 text-gray-900 dark:text-white placeholder-gray-400"
                          required
                        />
                      </div>
                    </motion.div>
                    <motion.div
                      initial={inputVariants.initial}
                      animate={inputVariants.animate}
                      transition={{ delay: 0.3 }}
                    >
                      <div className="relative">
                        <Key className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm new password"
                          className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-slate-900/50 border-2 border-gray-200 dark:border-slate-600 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 text-gray-900 dark:text-white placeholder-gray-400"
                          required
                        />
                      </div>
                    </motion.div>
                    <motion.div
                      className="text-sm text-gray-500 dark:text-gray-400"
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
                        className="w-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 hover:from-blue-600 hover:via-blue-700 hover:to-blue-700 text-white font-semibold py-3.5 px-6 rounded-full transition-all duration-200 transform hover:scale-[1.02] shadow-lg hover:shadow-xl relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={loading}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
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
                          <span className="relative flex items-center justify-center gap-2">
                            Reset Password
                            <Lock className="w-5 h-5" />
                          </span>
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
                      className="w-full text-sm text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 font-medium transition-colors flex items-center justify-center gap-2"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      whileHover={{ scale: 1.02 }}
                    >
                      <ArrowRight className="w-4 h-4 rotate-180" />
                      Back to verification
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
              className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200 flex items-center justify-center gap-2 mx-auto"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <ArrowRight className="w-4 h-4 rotate-180" />
              Back to Login
            </motion.button>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default PasswordRecovery;
