import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
} from "react-router-dom";
import Landing from "./components/Landing";
import AboutUs from "./components/AboutUs";
import ContactUs from "./components/ContactUs";
import PasswordRecovery from "./components/PasswordRecovery";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import Navbar from "./components/ui/Navbar";
import Footer from "./components/ui/Footer";
import "./App.css";

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
  return (
    <Login
      onLoginSuccess={() => navigate("/dashboard")}
      onNavigateToPasswordRecovery={() => navigate("/password-recovery")}
    />
  );
};

const PasswordRecoveryPage: React.FC = () => {
  const navigate = useNavigate();
  return <PasswordRecovery onNavigateBackToLogin={() => navigate("/login")} />;
};

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/");
  };
  return <Dashboard onLogout={handleLogout} />;
};

// Navbar wrapper for pages with full navigation
const FullNavbarWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      setIsLoggedIn(true);
    }
  }, []);

  if (isLoggedIn) {
    return <>{children}</>;
  }

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
      {children}
      <Footer />
    </>
  );
};

// Inner pages with back button navbar
const BackButtonNavbarWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      setIsLoggedIn(true);
    }
  }, []);

  if (isLoggedIn) {
    return <>{children}</>;
  }

  return (
    <>
      <Navbar
        onNavigateBack={() => navigate("/")}
        showNavigation={false}
        showAuthButtons={false}
      />
      {children}
      <Footer />
    </>
  );
};

function App() {
  return (
    <Router basename="/mis">
      <Routes>
        {/* Landing page with full navbar */}
        <Route
          path="/"
          element={
            <FullNavbarWrapper>
              <LandingPage />
            </FullNavbarWrapper>
          }
        />

        {/* About page with full navbar */}
        <Route
          path="/about"
          element={
            <FullNavbarWrapper>
              <AboutPage />
            </FullNavbarWrapper>
          }
        />

        {/* Contact page with full navbar */}
        <Route
          path="/contact"
          element={
            <FullNavbarWrapper>
              <ContactPage />
            </FullNavbarWrapper>
          }
        />

        {/* Login page with full navbar (navigation links but no Sign In button) */}
        <Route
          path="/login"
          element={
            <FullNavbarWrapper>
              <LoginPage />
            </FullNavbarWrapper>
          }
        />

        {/* Password recovery with back button navbar */}
        <Route
          path="/password-recovery"
          element={
            <BackButtonNavbarWrapper>
              <PasswordRecoveryPage />
            </BackButtonNavbarWrapper>
          }
        />

        {/* Dashboard - protected */}
        <Route path="/dashboard" element={<DashboardPage />} />
      </Routes>
    </Router>
  );
}

export default App;
