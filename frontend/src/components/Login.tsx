import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Input, Alert, VerificationCode } from "./ui";
import { login, verifyOTP } from "../api/auth";

interface LoginProps {
  onLoginSuccess?: () => void;
  onNavigateToPasswordRecovery?: () => void;
}

const Login: React.FC<LoginProps> = ({
  onLoginSuccess,
  onNavigateToPasswordRecovery,
}) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [tempToken, setTempToken] = useState("");
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCredentialsSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await login({ username, password });
      if (response?.requiresOTP) {
        setTempToken(response.tempToken);
        setStep("otp");
      }
    } catch (error: any) {
      setError(
        error.response?.data?.message || "Login failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOTPSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await verifyOTP(otp, tempToken);
      if (onLoginSuccess) {
        onLoginSuccess();
      }
    } catch (error: any) {
      setError(
        error.response?.data?.message || "Invalid OTP code. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // Animation variants
  const pageVariants = {
    initial: { opacity: 0, y: 20, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -20, scale: 0.95 },
  };

  const formVariants = {
    initial: { opacity: 0, x: -50 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 50 },
  };

  const iconVariants = {
    initial: { scale: 0, rotate: -180 },
    animate: { scale: 1, rotate: 0 },
  };

  const inputVariants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      className="pt-16"
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.4 }}
    >
      <div className="w-full max-w-md mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {step === "otp" ? (
            <motion.div
              key="otp"
              variants={formVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3 }}
            >
              {/* OTP Form Card */}
              <motion.div
                className="bg-card-light dark:bg-card-dark/30 rounded-3xl p-8 border border-border-light dark:border-border-dark/20"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.1 }}
              >
                <motion.div
                  className="text-center mb-8"
                  initial={iconVariants.initial}
                  animate={iconVariants.animate}
                  transition={{ duration: 0.5, type: "spring" }}
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
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  </motion.div>
                  <motion.h1
                    className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark mb-2"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    NGA Central MIS
                  </motion.h1>
                  <motion.p
                    className="text-text-secondary-light dark:text-text-secondary-dark"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    Verify Your Identity
                  </motion.p>
                </motion.div>

                <motion.form
                  onSubmit={handleOTPSubmit}
                  className="space-y-6"
                  variants={formVariants}
                >
                  <motion.div
                    className="space-y-2"
                    initial={inputVariants.initial}
                    animate={inputVariants.animate}
                    transition={{ delay: 0.4 }}
                  >
                    <label className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark block text-center">
                      Enter Verification Code
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
                    transition={{ delay: 0.5 }}
                  >
                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 transform hover:scale-[1.02] shadow-lg hover:shadow-xl"
                      disabled={loading}
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
                    </Button>
                  </motion.div>

                  <motion.button
                    type="button"
                    onClick={() => {
                      setStep("credentials");
                      setError("");
                      setOtp("");
                    }}
                    className="w-full text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors duration-200"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    whileHover={{ scale: 1.02 }}
                  >
                    ← Back to login
                  </motion.button>
                </motion.form>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="credentials"
              variants={formVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3 }}
            >
              {/* Login Form Card */}
              <motion.div
                className="bg-card-light dark:bg-card-dark/30 rounded-3xl p-8 border border-border-light dark:border-border-dark/20"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                <motion.div
                  className="text-center mb-8"
                  initial={iconVariants.initial}
                  animate={iconVariants.animate}
                  transition={{ duration: 0.5, type: "spring", delay: 0.1 }}
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
                        d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                      />
                    </svg>
                  </motion.div>
                  <motion.h1
                    className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark mb-2"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    NGA Central MIS
                  </motion.h1>
                  <motion.p
                    className="text-text-secondary-light dark:text-text-secondary-dark"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    Welcome Back
                  </motion.p>
                </motion.div>

                <motion.form
                  onSubmit={handleCredentialsSubmit}
                  className="space-y-6"
                  variants={formVariants}
                >
                  <motion.div
                    initial={inputVariants.initial}
                    animate={inputVariants.animate}
                    transition={{ delay: 0.2 }}
                  >
                    <Input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter your username"
                      label=""
                      required
                      className="transition-all duration-200"
                    />
                  </motion.div>
                  <motion.div
                    initial={inputVariants.initial}
                    animate={inputVariants.animate}
                    transition={{ delay: 0.3 }}
                  >
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      label=""
                      required
                      className="transition-all duration-200"
                    />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 px-4 rounded-full transition-all duration-200 transform hover:scale-[1.02] shadow-lg hover:shadow-xl"
                      disabled={loading}
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
                          Signing in...
                        </div>
                      ) : (
                        "Sign In"
                      )}
                    </Button>
                  </motion.div>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <Alert type="error" message={error} className="mt-6" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.form>

                <motion.div
                  className="mt-6 text-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  <motion.button
                    type="button"
                    onClick={onNavigateToPasswordRecovery}
                    className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Forgot your password?
                  </motion.button>
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default Login;
