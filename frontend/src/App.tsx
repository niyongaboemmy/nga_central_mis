import React, { useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
  Navigate,
} from "react-router-dom";
import Landing from "./components/Landing";
import AboutUs from "./components/AboutUs";
import ContactUs from "./components/ContactUs";
import PasswordRecovery from "./components/PasswordRecovery";
import Login from "./components/Login";
import Profile from "./components/Profile";
import Dashboard from "./components/Dashboard";
import Permissions from "./components/Permissions";
import Users from "./components/Users";
import SystemLayout from "./components/SystemLayout";
import Footer from "./components/ui/Footer";
import Navbar from "./components/ui/Navbar";
import { UserProvider, useUser } from "./contexts/UserContext";
import { ToastProvider, useToast } from "./contexts/ToastContext";
import { ToastStore } from "./services/api";
import "./App.css";
import Documents from "./components/documents/Documents";
import Academics from "./components/Academics";

// Wrapper components for pages that need the Navbar
const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <Landing
      onNavigateToLogin={() => navigate("/login")}
      onNavigateToAbout={() => navigate("/about")}
      onNavigateToContact={() => navigate("/contact")}
    />
  );
};

const AboutPage: React.FC = () => {
  const navigate = useNavigate();
  return <AboutUs onNavigateBack={() => navigate("/")} />;
};

const ContactPage: React.FC = () => {
  const navigate = useNavigate();
  return <ContactUs onNavigateBack={() => navigate("/")} />;
};

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { refreshUser } = useUser();
  return (
    <Login
      onLoginSuccess={async () => {
        await refreshUser();
        navigate("/dashboard");
      }}
      onNavigateToPasswordRecovery={() => navigate("/password-recovery")}
    />
  );
};

const PasswordRecoveryPage: React.FC = () => {
  const navigate = useNavigate();
  return <PasswordRecovery onNavigateBackToLogin={() => navigate("/login")} />;
};

// Protected Route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isAuthenticated, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Public Route wrapper (redirects to dashboard if already logged in)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

// Simple public layout with just Navbar and Footer (no SystemLayout)
const PublicLayout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const navigate = useNavigate();
  return (
    <>
      <Navbar
        onNavigateToHome={() => navigate("/")}
        onNavigateToLogin={() => navigate("/login")}
        onNavigateToAbout={() => navigate("/about")}
        onNavigateToContact={() => navigate("/contact")}
        showNavigation={true}
        showAuthButtons={true}
      />
      <div className="pt-16">{children}</div>
      <Footer />
    </>
  );
};

// Inner pages with back button navbar
const BackButtonLayout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const navigate = useNavigate();
  return (
    <>
      <Navbar
        onNavigateBack={() => navigate("/")}
        showNavigation={false}
        showAuthButtons={false}
      />
      <div className="pt-16">{children}</div>
      <Footer />
    </>
  );
};

// System layout with sidebar for authenticated users
const SystemLayoutWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return <SystemLayout showSidebar={true}>{children}</SystemLayout>;
};

// Dashboard page with sidebar
const DashboardPage: React.FC = () => {
  const { logout } = useUser();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return <Dashboard onLogout={handleLogout} />;
};

// Profile page with sidebar
const ProfilePage: React.FC = () => {
  return <Profile />;
};

// Documents page with sidebar
const DocumentsPage: React.FC = () => {
  return <Documents />;
};

// Academics page with sidebar
const AcademicsPage: React.FC = () => {
  return <Academics />;
};

// Permissions page with sidebar
const PermissionsPage: React.FC = () => {
  return <Permissions />;
};

// Users page with sidebar
const UsersPage: React.FC = () => {
  return <Users />;
};

// Initialize toast store for API interceptor
const ToastInitializer: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { showToast } = useToast();

  useEffect(() => {
    ToastStore.setShowToast(showToast);
  }, [showToast]);

  return <>{children}</>;
};

function App() {
  return (
    <UserProvider>
      <ToastProvider>
        <ToastInitializer>
          <Router basename="/mis">
            <Routes>
              {/* Landing page with full navbar */}
              <Route
                path="/"
                element={
                  <PublicRoute>
                    <PublicLayout>
                      <LandingPage />
                    </PublicLayout>
                  </PublicRoute>
                }
              />

              {/* About page with full navbar */}
              <Route
                path="/about"
                element={
                  <PublicRoute>
                    <PublicLayout>
                      <AboutPage />
                    </PublicLayout>
                  </PublicRoute>
                }
              />

              {/* Contact page with full navbar */}
              <Route
                path="/contact"
                element={
                  <PublicRoute>
                    <PublicLayout>
                      <ContactPage />
                    </PublicLayout>
                  </PublicRoute>
                }
              />

              {/* Login page with full navbar */}
              <Route
                path="/login"
                element={
                  <PublicRoute>
                    <PublicLayout>
                      <LoginPage />
                    </PublicLayout>
                  </PublicRoute>
                }
              />

              {/* Password recovery with back button navbar */}
              <Route
                path="/password-recovery"
                element={
                  <PublicRoute>
                    <BackButtonLayout>
                      <PasswordRecoveryPage />
                    </BackButtonLayout>
                  </PublicRoute>
                }
              />

              {/* Dashboard - protected with sidebar */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <SystemLayoutWrapper>
                      <DashboardPage />
                    </SystemLayoutWrapper>
                  </ProtectedRoute>
                }
              />

              {/* Profile - protected with sidebar */}
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <SystemLayoutWrapper>
                      <ProfilePage />
                    </SystemLayoutWrapper>
                  </ProtectedRoute>
                }
              />

              {/* Documents - protected with sidebar */}
              <Route
                path="/documents"
                element={
                  <ProtectedRoute>
                    <SystemLayoutWrapper>
                      <DocumentsPage />
                    </SystemLayoutWrapper>
                  </ProtectedRoute>
                }
              />

              {/* Academics - protected with sidebar */}
              <Route
                path="/academics"
                element={
                  <ProtectedRoute>
                    <SystemLayoutWrapper>
                      <AcademicsPage />
                    </SystemLayoutWrapper>
                  </ProtectedRoute>
                }
              />

              {/* Users page - protected with sidebar */}
              <Route
                path="/users"
                element={
                  <ProtectedRoute>
                    <SystemLayoutWrapper>
                      <UsersPage />
                    </SystemLayoutWrapper>
                  </ProtectedRoute>
                }
              />

              {/* Settings page - protected with sidebar */}
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <SystemLayoutWrapper>
                      <div className="text-center py-12">
                        <h2 className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
                          Settings
                        </h2>
                        <p className="mt-2 text-text-secondary-light dark:text-text-secondary-dark/70">
                          This page is under construction
                        </p>
                      </div>
                    </SystemLayoutWrapper>
                  </ProtectedRoute>
                }
              />

              {/* Permissions page - protected with sidebar */}
              <Route
                path="/permissions"
                element={
                  <ProtectedRoute>
                    <SystemLayoutWrapper>
                      <PermissionsPage />
                    </SystemLayoutWrapper>
                  </ProtectedRoute>
                }
              />

              {/* Fallback route */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Router>
        </ToastInitializer>
      </ToastProvider>
    </UserProvider>
  );
}

export default App;
