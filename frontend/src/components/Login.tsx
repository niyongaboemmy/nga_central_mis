import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Alert, VerificationCode } from "./ui";
import { login, verifyOTP, authorizeSSO, checkSession } from "../api/auth";
import { useUser } from "../contexts/UserContext";
import { usePermissions } from "../hooks/usePermissions";
import { useSearchParams } from "react-router-dom";
import {
  Star,
  Lock,
  ArrowRight,
  User,
  Shield,
  CheckCircle,
  Key,
} from "lucide-react";

interface LoginProps {
  onLoginSuccess?: () => void;
  onNavigateToPasswordRecovery?: () => void;
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
      className="absolute top-20 right-[5%] w-96 h-96 bg-blue-200/20 rounded-full blur-3xl"
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
      className="absolute bottom-20 left-[5%] w-[500px] h-[500px] bg-blue-200/20 rounded-full blur-3xl"
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
  </>
);

const Login: React.FC<LoginProps> = ({
  onLoginSuccess,
  onNavigateToPasswordRecovery,
}) => {
  const { refreshUser, user: currentUser } = useUser();
  const { getUserPermissions } = usePermissions();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [tempToken, setTempToken] = useState("");
  const [step, setStep] = useState<
    "credentials" | "otp" | "success" | "sso-consent"
  >("credentials");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const hasCheckedRef = useRef(false);

  const handleCredentialsSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setAuthError("");

    try {
      const response = await login({ username, password });
      if (response?.requiresOTP) {
        setTempToken(response.tempToken);
        setStep("otp");
      }
    } catch (error: any) {
      setAuthError(
        error.response?.data?.message || "Login failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOTPSubmit = async (e: any) => {
    e.preventDefault();
    if (loading) return; // Prevent multiple submissions
    setLoading(true);
    setAuthError("");

    try {
      await verifyOTP(otp, tempToken);
      await refreshUser();

      // Check for SSO parameters
      const clientId = searchParams.get("client_id");
      const redirectUri = searchParams.get("redirect_uri");

      if (clientId && redirectUri) {
        try {
          const responseType = searchParams.get("response_type") || "code";
          const state = searchParams.get("state");
          const ssoData = await authorizeSSO(
            clientId,
            redirectUri,
            responseType,
            state || undefined,
          );
          if (ssoData?.code) {
            setStep("success");
            setTimeout(() => {
              // Redirect back to integrated system with auth code and state
              const finalUrl = new URL(redirectUri);
              finalUrl.searchParams.set("code", ssoData.code);
              if (ssoData.state) {
                finalUrl.searchParams.set("state", ssoData.state);
              }
              window.location.href = finalUrl.toString();
            }, 500);
            return;
          }
        } catch (ssoError) {
          console.error("SSO Authorization failed:", ssoError);
          // Fallback to normal login flow if SSO fails
        }
      }

      setStep("success");
      setTimeout(() => {
        if (onLoginSuccess) {
          onLoginSuccess();
        }
      }, 800);
    } catch (error: any) {
      setAuthError(
        error.response?.data?.message || "Invalid OTP code. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  // Check for auto-login/SSO redirect on mount
  useEffect(() => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    const handleAutoRedirect = async () => {
      const clientId = searchParams.get("client_id");
      const redirectUri = searchParams.get("redirect_uri");

      // Verify if user is already logged in
      try {
        await checkSession();
        // If session is valid and we have SSO params, auto-continue after brief pause
        if (clientId && redirectUri) {
          console.log("User already logged in, auto-continuing SSO...");
          setStep("sso-consent");
          // 1.5s pause so user can see the consent screen before automatic redirect
          setTimeout(() => {
            handleSSOContinue();
          }, 1500);
        } else {
          // If logged in but no SSO params, let parent handle navigation (e.g. to dashboard)
          if (onLoginSuccess) onLoginSuccess();
        }
      } catch (err) {
        // Not logged in, stay on login page
      } finally {
        setInitializing(false);
      }
    };

    handleAutoRedirect();
  }, [searchParams, onLoginSuccess]);

  const handleSSOContinue = async () => {
    setLoading(true);
    const clientId = searchParams.get("client_id");
    const redirectUri = searchParams.get("redirect_uri");

    if (clientId && redirectUri) {
      try {
        const responseType = searchParams.get("response_type") || "code";
        const state = searchParams.get("state");
        const ssoData = await authorizeSSO(
          clientId,
          redirectUri,
          responseType,
          state || undefined,
        );
        if (ssoData?.code) {
          setStep("success");
          setTimeout(() => {
            const finalUrl = new URL(redirectUri);
            finalUrl.searchParams.set("code", ssoData.code);
            if (ssoData.state) {
              finalUrl.searchParams.set("state", ssoData.state);
            }
            window.location.href = finalUrl.toString();
          }, 500);
        }
      } catch (ssoError) {
        console.error("SSO Authorization failed:", ssoError);
        setAuthError("Failed to authorize application. Please try again.");
        setStep("credentials"); // Fallback
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSSOLogout = async () => {
    // Clear all MIS session tokens and reload to re-present the login form
    localStorage.removeItem("token");
    localStorage.removeItem("nga_auth_token");
    localStorage.removeItem("misToken");
    try {
      // Best-effort server-side logout to clear the HttpOnly cookie
      const { logout } = await import("../api/auth");
      await logout();
    } catch {
      // ignore — cookie will expire naturally
    }
    window.location.reload();
  };

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
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className={`w-3 h-3 rounded-full ${
            i === 0
              ? step === "credentials" || step === "sso-consent"
                ? "bg-gradient-to-r from-blue-500 to-blue-600"
                : "bg-gray-300 dark:bg-gray-600"
              : i === 1
                ? step === "otp"
                  ? "bg-gradient-to-r from-blue-500 to-blue-600"
                  : step === "success"
                    ? "bg-green-500"
                    : "bg-gray-300 dark:bg-gray-600"
                : step === "success"
                  ? "bg-gradient-to-r from-green-500 to-green-600"
                  : "bg-gray-300 dark:bg-gray-600"
          }`}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: i * 0.1 }}
        />
      ))}
    </motion.div>
  );

  return (
    <motion.div
      className="min-h-screen relative overflow-hidden bg-gradient-to-br from-gray-50 to-blue-50 dark:from-black dark:to-black pt-6"
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.4 }}
    >
      <FloatingParticles />
      <BackgroundShapes />

      <div className="relative z-10 pt-0 pb-8 px-4">
        <div className="w-full max-w-md mx-auto">
          <AnimatePresence mode="wait">
            {initializing ? (
              <motion.div
                key="initializing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center p-12 bg-white/80 dark:bg-slate-800/60 backdrop-blur-xl rounded-3xl border border-white dark:border-slate-700/50 shadow-2xl"
              >
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-gray-600 dark:text-gray-300 font-medium">
                  Checking session...
                </p>
              </motion.div>
            ) : step === "sso-consent" ? (
              <motion.div
                key="sso-consent"
                variants={formVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  className="bg-white/80 dark:bg-slate-800/60 backdrop-blur-xl rounded-3xl p-8 border border-white dark:border-slate-700/50 shadow-2xl text-center"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  {/* User avatar */}
                  <motion.div className="flex justify-center mb-4">
                    <div className="relative">
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 p-1">
                        <div className="w-full h-full rounded-full bg-white dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                          <User className="w-10 h-10 text-gray-400" />
                        </div>
                      </div>
                      <div className="absolute bottom-0 right-0 p-1.5 bg-green-500 rounded-full border-2 border-white dark:border-slate-800">
                        <CheckCircle className="w-3 h-3 text-white" />
                      </div>
                    </div>
                  </motion.div>

                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                    {[
                      currentUser?.profile?.first_name,
                      currentUser?.profile?.last_name,
                    ]
                      .filter(Boolean)
                      .join(" ") ||
                      currentUser?.user?.username ||
                      "Signed In"}
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">
                    {currentUser?.roles?.[0]?.name || "NGA User"}{" "}
                    · NGA Central MIS
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
                    Redirecting you to{" "}
                    <span className="font-medium text-gray-600 dark:text-gray-300">
                      {searchParams.get("client_id") || "the app"}
                    </span>{" "}
                    automatically…
                  </p>

                  {/* Auto-redirect progress bar */}
                  {!loading && (
                    <div className="mb-6">
                      <div className="h-1.5 w-full bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: "100%" }}
                          transition={{ duration: 1.4, ease: "easeInOut" }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <button
                      onClick={handleSSOContinue}
                      disabled={loading}
                      className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60 text-white font-semibold rounded-2xl shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          Redirecting…
                        </>
                      ) : (
                        <>
                          Continue now <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleSSOLogout}
                      className="w-full py-3 bg-transparent hover:bg-gray-50 dark:hover:bg-slate-700/50 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 text-sm font-medium rounded-2xl border border-gray-200 dark:border-slate-700 transition-all"
                    >
                      Not you? Switch account
                    </button>
                  </div>

                  <div className="mt-5 pt-5 border-t border-gray-100 dark:border-slate-700/50">
                    <p className="text-xs text-gray-400">
                      Your identity is securely shared with{" "}
                      <span className="font-medium text-gray-600 dark:text-gray-300">
                        {searchParams.get("client_id")}
                      </span>
                      .
                    </p>
                  </div>
                </motion.div>
              </motion.div>
            ) : step === "success" ? (
              <motion.div
                key="success"
                variants={formVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                {/* Success Card with Permissions */}
                <motion.div
                  className="bg-white/80 dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl p-8 border border-white dark:border-slate-700/50 shadow-2xl"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                >
                  {/* Centered Icon */}
                  <motion.div
                    className="flex justify-center mb-6"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                  >
                    <motion.div
                      className="flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-500 to-green-600 rounded-full shadow-lg shadow-green-500/25"
                      whileHover={{ scale: 1.05 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <CheckCircle className="w-10 h-10 text-white" />
                    </motion.div>
                  </motion.div>

                  <motion.div className="text-center mb-2">
                    <motion.h1
                      className="text-2xl font-bold text-gray-900 dark:text-white mb-2"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      Login Successful!
                    </motion.h1>
                    <motion.p
                      className="text-gray-600 dark:text-gray-300"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      Welcome to NGA Central MIS
                    </motion.p>
                  </motion.div>

                  <ProgressIndicator />

                  {/* Permissions Section */}
                  <motion.div
                    className="mt-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Key className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        Your Permissions
                      </span>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-900/50 rounded-2xl p-4 max-h-48 overflow-y-auto">
                      {(() => {
                        const userPermissions = getUserPermissions();
                        return userPermissions.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {userPermissions.map(
                              (perm: string, index: number) => (
                                <motion.span
                                  key={index + 1}
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ delay: 0.5 + index * 0.05 }}
                                  className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-full text-xs font-medium"
                                >
                                  {perm}
                                </motion.span>
                              ),
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                            No permissions assigned
                          </p>
                        );
                      })()}
                    </div>
                  </motion.div>

                  <motion.div
                    className="mt-6 text-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                  >
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Redirecting to dashboard...
                    </p>
                  </motion.div>
                </motion.div>
              </motion.div>
            ) : step === "otp" ? (
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
                  className="bg-white/80 dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl p-8 border border-white dark:border-slate-700/50 shadow-2xl"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                >
                  {/* Centered Icon */}
                  <motion.div
                    className="flex justify-center mb-6"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                  >
                    <motion.div
                      className="flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full shadow-lg shadow-blue-500/25"
                      whileHover={{ scale: 1.05 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <Shield className="w-10 h-10 text-white" />
                    </motion.div>
                  </motion.div>

                  <motion.div className="text-center mb-2">
                    <motion.h1
                      className="text-2xl font-bold text-gray-900 dark:text-white mb-2"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      Verify Your Identity
                    </motion.h1>
                    <motion.p
                      className="text-gray-600 dark:text-gray-300"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      Enter the 6-digit code sent to your email
                    </motion.p>
                  </motion.div>

                  <ProgressIndicator />

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
                      <VerificationCode
                        length={6}
                        onChange={setOtp}
                        onComplete={(code) => {
                          setOtp(code);
                          // if (code.length === 6) {
                          //   handleOTPSubmit({
                          //     preventDefault: () => {},
                          //   } as any);
                          // }
                        }}
                        error={!!authError}
                      />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
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
                        setStep("credentials");
                        setAuthError("");
                        setOtp("");
                      }}
                      className="w-full text-sm text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 font-medium transition-colors duration-200 flex items-center justify-center gap-2 py-2 px-4 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      whileHover={{ scale: 1.05, rotate: 1 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <ArrowRight className="w-4 h-4 rotate-180" />
                      Back to login
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
                  className="bg-white/80 dark:bg-slate-800/60 backdrop-blur-xl rounded-3xl p-8 border border-white dark:border-slate-700/50 shadow-2xl"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                >
                  {/* Centered Icon */}
                  <motion.div
                    className="flex justify-center mb-6"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                  >
                    <motion.div
                      className="flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full shadow-lg shadow-blue-500/25"
                      whileHover={{ scale: 1.05 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <User className="w-10 h-10 text-white" />
                    </motion.div>
                  </motion.div>

                  <motion.div className="text-center mb-6">
                    <motion.h1
                      className="text-2xl font-bold text-gray-900 dark:text-white mb-2"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      Welcome Back
                    </motion.h1>
                    <motion.p
                      className="text-gray-600/60 dark:text-gray-300/60 text-sm"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      Sign in to access NGA Central MIS
                    </motion.p>
                  </motion.div>

                  <motion.form
                    onSubmit={handleCredentialsSubmit}
                    className="space-y-5"
                    variants={formVariants}
                  >
                    <motion.div
                      initial={inputVariants.initial}
                      animate={inputVariants.animate}
                      transition={{ delay: 0.2 }}
                    >
                      <div className="relative">
                        <User className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="Enter your username or email"
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
                        <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter your password"
                          className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-slate-900/50 border-2 border-gray-200 dark:border-slate-600 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 text-gray-900 dark:text-white placeholder-gray-400"
                          required
                        />
                      </div>
                    </motion.div>

                    <AnimatePresence>
                      {authError && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <Alert
                            type="error"
                            message={authError}
                            className="mt-4"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
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
                            Signing in...
                          </div>
                        ) : (
                          <span className="relative flex items-center justify-center gap-2">
                            Sign In
                            <ArrowRight className="w-5 h-5" />
                          </span>
                        )}
                      </motion.button>
                    </motion.div>
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
                      Forgot your password or New Account?
                    </motion.button>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};

export default Login;
