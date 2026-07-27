import React, { useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
  Navigate,
  useLocation,
} from "react-router-dom";
import Login from "./components/Login";
import Profile from "./components/Profile";
import Dashboard from "./components/Dashboard";
import SuperAdminDashboard from "./components/SuperAdminDashboard";
import TeacherDashboard from "./components/TeacherDashboard";
import Permissions from "./components/Permissions";
import Users from "./components/Users";
import SystemLayout from "./components/SystemLayout";
import { useUser } from "./contexts/UserContext";
import { ToastProvider, useToast } from "./contexts/ToastContext";
import { ToastStore } from "./services/api";
import "./App.css";
import Documents from "./components/documents/Documents";
import Academics from "./components/Academics";
import TeacherAssignedSubjects from "./components/TeacherAssignedSubjects";
import ProgramUsersPage from "./components/ProgramUsersPage";
import ProgramAcademicPage from "./components/ProgramAcademicPage";
import ClassTeacherUsersPage from "./components/ClassTeacherUsersPage";
import ClassTeacherSubjectsPage from "./components/ClassTeacherSubjectsPage";
import Schools from "./components/Schools";
import Systems from "./components/Systems";
import SchemeOfWorkList from "./components/SchemeOfWorkList";
import SchemeOfWorkCalendar from "./components/SchemeOfWorkCalendar";
import AcademicCalendar from "./components/AcademicCalendar";
import LogsHistory from "./components/LogsHistory";
import AllTeachersSchemeOfWork from "./components/AllTeachersSchemeOfWork";
import SchemeDetails from "./components/SchemeDetails";
import ReportingModule from "./components/reporting/ReportingModule";
import AdminReporting from "./components/reporting/AdminReporting";
import { MetadataProvider } from "./contexts/MetadataContext";
import SubjectDetailPage from "./components/curriculum/SubjectDetailPage";

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <Login
      onLoginSuccess={() => {
        navigate("/dashboard");
      }}
    />
  );
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

// Public Route wrapper (redirects to dashboard if already logged in, unless explicit SSO request)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useUser();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isSSORequest =
    searchParams.has("client_id") && searchParams.has("redirect_uri");

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // If logged in and NOT an SSO request, redirect to dashboard
  // If it IS an SSO request, let them through to the Login page which handles the consent UI
  if (isAuthenticated && !isSSORequest) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

// System layout with sidebar for authenticated users
const SystemLayoutWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return <SystemLayout showSidebar={true}>{children}</SystemLayout>;
};

// Dashboard page with sidebar
const DashboardPage: React.FC = () => {
  const { logout, user } = useUser();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  // Check if user has any role with SUPER_ADMIN_DASHBOARD permission
  const hasSuperAdminDashboard =
    user?.roles?.some((role) =>
      role.permissions?.some((perm) => perm.name === "SUPER_ADMIN_DASHBOARD"),
    ) || false;

  // Check if user has any role with TEACHER_DASHBOARD permission
  const hasTeacherDashboard =
    user?.roles?.some((role) =>
      role.permissions?.some((perm) => perm.name === "TEACHER_DASHBOARD"),
    ) || false;

  if (hasSuperAdminDashboard) {
    return <SuperAdminDashboard onLogout={handleLogout} />;
  }

  if (hasTeacherDashboard) {
    return <TeacherDashboard onLogout={handleLogout} />;
  }

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

// Teacher Assigned Subjects page with sidebar
const TeacherAssignedSubjectsPage: React.FC = () => {
  return <TeacherAssignedSubjects />;
};

// Permissions page with sidebar
const PermissionsPage: React.FC = () => {
  return <Permissions />;
};

// Users page with sidebar
const UsersPage: React.FC = () => {
  return <Users />;
};

// Program Users page with sidebar
const ProgramUsersPageWrapper: React.FC = () => {
  return <ProgramUsersPage />;
};

// Program Academic page with sidebar
const ProgramAcademicPageWrapper: React.FC = () => {
  return <ProgramAcademicPage />;
};

// Class Teacher Users page with sidebar
const ClassTeacherUsersPageWrapper: React.FC = () => {
  return <ClassTeacherUsersPage />;
};

// Class Teacher Subjects page with sidebar
const ClassTeacherSubjectsPageWrapper: React.FC = () => {
  return <ClassTeacherSubjectsPage />;
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
    <ToastProvider>
      <ToastInitializer>
        <MetadataProvider>
          <Router basename="/mis">
            <Routes>

            {/* Landing page */}
            <Route
              path="/"
              element={
                <PublicRoute>
                  <LoginPage />
                </PublicRoute>
              }
            />

            {/* About page */}
            <Route
              path="/about"
              element={
                <PublicRoute>
                  <LoginPage />
                </PublicRoute>
              }
            />

            {/* Contact page */}
            <Route
              path="/contact"
              element={
                <PublicRoute>
                  <LoginPage />
                </PublicRoute>
              }
            />

            {/* Login page — no public navbar/footer, fixed full-viewport layout */}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <LoginPage />
                </PublicRoute>
              }
            />

            {/* Password recovery now lives inline inside the Login split-screen shell */}
            <Route
              path="/password-recovery"
              element={<Navigate to="/login" replace />}
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

            {/* Teacher Assigned Subjects - protected with sidebar */}
            <Route
              path="/my-subjects"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <TeacherAssignedSubjectsPage />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* Subject Detail page - curriculum & materials */}
            <Route
              path="/subjects/:subjectId"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <SubjectDetailPage />
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

            {/* Program Users page - protected with sidebar */}
            <Route
              path="/program-users"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <ProgramUsersPageWrapper />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* Program Academic page - protected with sidebar */}
            <Route
              path="/program-academics"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <ProgramAcademicPageWrapper />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* Class Teacher Users page - protected with sidebar */}
            <Route
              path="/class-users"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <ClassTeacherUsersPageWrapper />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* Class Teacher Subjects page - protected with sidebar */}
            <Route
              path="/class-subjects"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <ClassTeacherSubjectsPageWrapper />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* All Teachers SOW (Admin View) */}
            <Route
              path="/all-teachers-sow/*"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <Routes>
                      <Route path="/" element={<AllTeachersSchemeOfWork />} />
                      <Route path="/details" element={<SchemeDetails />} />
                    </Routes>
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

            {/* Systems page - protected with sidebar */}
            <Route
              path="/systems"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <Systems />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* Assign System to School page - protected with sidebar */}
            <Route
              path="/schools"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <Schools />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* Scheme of Work - protected with sidebar */}
            <Route
              path="/scheme-of-work"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <SchemeOfWorkList />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/scheme-of-work/calendar"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <SchemeOfWorkCalendar />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* Academic Calendar - protected with sidebar */}
            <Route
              path="/calendar"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <AcademicCalendar />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* Reporting - protected with sidebar */}
            <Route
              path="/reporting"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <ReportingModule />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* Logs History - protected with sidebar */}
            <Route
              path="/logs-history"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <LogsHistory />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* Admin Reporting - protected with sidebar */}
            <Route
              path="/admin/reports"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <AdminReporting />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* Fallback route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </MetadataProvider>
    </ToastInitializer>
  </ToastProvider>
);
}

export default App;
