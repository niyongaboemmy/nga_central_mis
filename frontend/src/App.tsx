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
import TeacherWelcome from "./components/TeacherWelcome";
import TeacherDashboard from "./components/teacher/TeacherDashboard";
import Permissions from "./components/Permissions";
import Users from "./components/Users";
import SystemLayout from "./components/SystemLayout";
import { useUser } from "./contexts/UserContext";
import { ToastProvider, useToast } from "./contexts/ToastContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { ConfirmProvider } from "./contexts/ConfirmContext";
import { ToastStore } from "./services/api";
import "./App.css";
import Documents from "./components/documents/Documents";
import Academics from "./components/Academics";
import TeacherAssignedSubjects from "./components/TeacherAssignedSubjects";
import MyStudents from "./components/MyStudents";
import MyEnrolledSubjects from "./components/MyEnrolledSubjects";
import ProgramUsersPage from "./components/ProgramUsersPage";
import ProgramAcademicPage from "./components/ProgramAcademicPage";
import ClassTeacherUsersPage from "./components/ClassTeacherUsersPage";
import ClassTeacherSubjectsPage from "./components/ClassTeacherSubjectsPage";
import ClassTeacherCalendarPage from "./components/ClassTeacherCalendarPage";
import Schools from "./components/Schools";
import Systems from "./components/Systems";
import SystemDetails from "./components/SystemDetails";
import SchemeOfWorkList from "./components/SchemeOfWorkList";
import SchemeOfWorkCalendar from "./components/SchemeOfWorkCalendar";
import AcademicCalendar from "./components/AcademicCalendar";
import DatabaseManagement from "./components/DatabaseManagement";
import AllTeachersSchemeOfWork from "./components/AllTeachersSchemeOfWork";
import SchemeDetails from "./components/SchemeDetails";
import ReportingModule from "./components/reporting/ReportingModule";
import AdminReporting from "./components/reporting/AdminReporting";
import MyMentor from "./components/reporting/MyMentor";
import { MetadataProvider } from "./contexts/MetadataContext";
import { AcademicPeriodProvider } from "./contexts/AcademicPeriodContext";
import SubjectDetailPage from "./components/curriculum/SubjectDetailPage";
import LessonNotesListPage from "./components/lessonNotes/LessonNotesListPage";
import LessonNoteEditorPage from "./components/lessonNotes/LessonNoteEditorPage";
import SharedLessonNotesPage from "./components/lessonNotes/SharedLessonNotesPage";
import SharedLessonNoteViewPage from "./components/lessonNotes/SharedLessonNoteViewPage";
import EnrollmentManager from "./components/enrollment/EnrollmentManager";
import SchemeVerifyPage from "./components/SchemeVerifyPage";
import MyLearningHome from "./components/elearning/learner/MyLearningHome";
import CoursePage from "./components/elearning/learner/CoursePage";
import MePage from "./components/elearning/learner/MePage";
import CourseBuilderPage from "./components/elearning/builder/CourseBuilderPage";
import MyCoursesPage from "./components/elearning/builder/MyCoursesPage";
import ElearningAdminPage from "./components/elearning/admin/ElearningAdminPage";
import DevKitchenSink from "./components/elearning/DevKitchenSink";
import AccessStudio from "./components/access/AccessStudio";
import InsightsHub from "./components/access/InsightsHub";
import HomePage from "./components/home/HomePage";
import { ActivityRouterTracker } from "./vendor/nga-activity/react";
import AnalyticsRoutes from "./components/analytics/AnalyticsRoutes";
import MyActivity from "./components/analytics/MyActivity";
import ActivityNotice from "./components/analytics/ActivityNotice";
import RemindersPage from "./components/reminders/RemindersPage";
import AppsInstallerPage from "./components/apps/AppsInstallerPage";
import { AutoInstallPrompt } from "./components/apps/AutoInstallPrompt";

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <Login
      onLoginSuccess={() => {
        // Home is the post-login landing page for every user
        // (HOME_OVERVIEW_IMPLEMENTATION_PLAN.md).
        navigate("/home");
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
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
};

// System layout with sidebar for authenticated users
const SystemLayoutWrapper: React.FC<{
  children: React.ReactNode;
  fullWidth?: boolean;
}> = ({ children, fullWidth }) => {
  return (
    <SystemLayout showSidebar={true} fullWidth={fullWidth}>
      {children}
    </SystemLayout>
  );
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

  // A teacher's landing page is the welcome page: a greeting and their weekly
  // timetable. The figures and reminders live on /teacher-dashboard.
  if (hasTeacherDashboard) {
    return <TeacherWelcome onLogout={handleLogout} />;
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

// My Students page with sidebar
const MyStudentsPage: React.FC = () => {
  return <MyStudents />;
};

// Student's Enrolled Subjects page with sidebar
const MyEnrolledSubjectsPage: React.FC = () => {
  return <MyEnrolledSubjects />;
};

// Permissions page with sidebar
const PermissionsPage: React.FC = () => {
  return <Permissions />;
};

// Bulk subject enrollment page with sidebar
const EnrollmentPage: React.FC = () => {
  return <EnrollmentManager />;
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

// Class Teacher Calendar page with sidebar — the weekly timetable of the
// class group the signed-in teacher is assigned to.
const ClassTeacherCalendarPageWrapper: React.FC = () => {
  return <ClassTeacherCalendarPage />;
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
        <NotificationProvider>
        <ConfirmProvider>
        <MetadataProvider>
          <AcademicPeriodProvider>
          <Router basename="/">
            {/* Asks to install the app on load when it isn't installed here. */}
            <AutoInstallPrompt />
            {/* Page views → Usage & Monitoring (patterns only, never ids). */}
            <ActivityRouterTracker />
            <ActivityNotice />
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

            {/* Public Scheme of Work verification page — the destination of the QR code printed
                on every exported PDF. Deliberately unwrapped (no ProtectedRoute/PublicRoute):
                it must render identically for an anonymous scanner and a logged-in user. */}
            <Route path="/verify/:schemeId" element={<SchemeVerifyPage />} />

            {/* Dashboard - protected with sidebar */}
            {/* Home -- what needs me across every module, today, and how my
                areas are doing. The post-login landing page for everyone. */}
            <Route
              path="/home"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <HomePage />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* Install every NGA app from one place. Public on purpose: a new
                device can be set up before anyone signs in (docs/APP_LAUNCH.md). */}
            <Route path="/apps" element={<AppsInstallerPage />} />

            {/* Reminders -- set up this device, Now & Next, what to be
                reminded of (REMINDERS_SOLUTION_PROPOSAL.md). Everyone. */}
            <Route
              path="/reminders"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper fullWidth>
                    <RemindersPage />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

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

            {/* Teacher Dashboard - the teacher's working board (KPIs, today,
                reminders). /dashboard stays the timetable welcome page. */}
            <Route
              path="/teacher-dashboard"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <TeacherDashboard />
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

            {/* Documents - protected with sidebar.
                fullWidth: a file manager with its own tree rail was being
                squeezed into the default max-w-7xl. */}
            <Route
              path="/documents"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper fullWidth>
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

            {/* Bulk Subject Enrollment - protected with sidebar */}
            <Route
              path="/enrollment"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <EnrollmentPage />
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

            {/* My Students - protected with sidebar */}
            <Route
              path="/my-students"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <MyStudentsPage />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* Student's Enrolled Subjects - protected with sidebar */}
            <Route
              path="/my-enrolled-subjects"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <MyEnrolledSubjectsPage />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* Subject Detail page - curriculum & materials.
                fullWidth: the page has its own edge-to-edge sticky header, and
                the default max-w-7xl centred it inside `main`, leaving an 80px
                dead gutter hard against the sidebar with the white header bar
                stopping short of it. */}
            <Route
              path="/subjects/:subjectId"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper fullWidth>
                    <SubjectDetailPage />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* Lesson Notes - teacher authoring */}
            <Route
              path="/lesson-notes"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <LessonNotesListPage />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/lesson-notes/:id"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <LessonNoteEditorPage />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* Lesson Notes - student read-only view */}
            <Route
              path="/shared-lesson-notes"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <SharedLessonNotesPage />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />
            {/* Reading a note is a full-screen job, so this one route renders
                without the app shell. Inside it, the sidebar (256px) and navbar
                competed with the contents rail and the AI panel and left the
                note itself a ~480px column of six-word lines. The page carries
                its own header and its own way back to the library. */}
            <Route
              path="/shared-lesson-notes/:id"
              element={
                <ProtectedRoute>
                  <SharedLessonNoteViewPage />
                </ProtectedRoute>
              }
            />

            {/* E-Learning — student (My Learning) */}
            <Route
              path="/my-learning"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <MyLearningHome />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-learning/me"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <MePage />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-learning/courses/:courseId"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper fullWidth>
                    <CoursePage />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-learning/courses/:courseId/items/:itemId"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper fullWidth>
                    <CoursePage />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* E-Learning — teacher course builder */}
            <Route
              path="/elearning/courses"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <MyCoursesPage />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/elearning/courses/:courseId/build"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper fullWidth>
                    <CourseBuilderPage />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* E-Learning — admin oversight */}
            <Route
              path="/admin/elearning"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper fullWidth>
                    <ElearningAdminPage />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {import.meta.env.DEV && (
              <Route
                path="/dev/elearning-ui"
                element={
                  <ProtectedRoute>
                    <SystemLayoutWrapper>
                      <DevKitchenSink />
                    </SystemLayoutWrapper>
                  </ProtectedRoute>
                }
              />
            )}

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
            {/* Class Calendar - class teacher's own class group timetable */}
            <Route
              path="/class-calendar"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <ClassTeacherCalendarPageWrapper />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

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

            {/* Leadership & Access (access control v2 Access Studio). The page
                gates each tab on the viewer's v2 capabilities itself. */}
            <Route
              path="/access-studio"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <AccessStudio />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* Leadership Insights -- aggregates only, gated per widget by v2 access. */}
            <Route
              path="/insights"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <InsightsHub />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* My activity: what the platform records about me (everyone signed in). */}
            <Route
              path="/me/activity"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper fullWidth>
                    <MyActivity />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* Usage & Monitoring (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md): every page
                gates itself on an ANALYTICS_* capability; the server enforces it too. */}
            <Route
              path="/analytics/*"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper fullWidth>
                    <AnalyticsRoutes />
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

            {/* System details page - protected with sidebar */}
            <Route
              path="/systems/:id"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <SystemDetails />
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

            {/* My Mentor (student-facing) - protected with sidebar */}
            <Route
              path="/my-mentor"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper>
                    <MyMentor />
                  </SystemLayoutWrapper>
                </ProtectedRoute>
              }
            />

            {/* Logs History moved into Usage & Monitoring → Audit log; keep old links working. */}
            <Route path="/logs-history" element={<Navigate to="/analytics/audit-log" replace />} />

            {/* Database Management - protected with sidebar, further gated by permission + step-up auth inside the page */}
            <Route
              path="/database-management"
              element={
                <ProtectedRoute>
                  <SystemLayoutWrapper fullWidth>
                    <DatabaseManagement />
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
        </AcademicPeriodProvider>
      </MetadataProvider>
        </ConfirmProvider>
      </NotificationProvider>
    </ToastInitializer>
  </ToastProvider>
);
}

export default App;
