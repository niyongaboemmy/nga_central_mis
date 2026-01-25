import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { getCurrentUser, UserWithProfile, UserRole } from "../api/users";
import { logout as apiLogout, checkSession } from "../api/auth";
import { removeToken, getToken } from "../utils/auth";

interface UserContextType {
  user: UserWithProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  roles: UserRole[];
  showWelcomePopup: boolean;
  setShowWelcomePopup: (show: boolean) => void;
  login: (tempToken: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<UserWithProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showWelcomePopup, setShowWelcomePopup] = useState(false);
  const isRefreshingRef = useRef(false);

  const roles = user?.roles || [];

  const refreshUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    if (isRefreshingRef.current) {
      return; // Prevent concurrent calls
    }

    isRefreshingRef.current = true;
    try {
      let userData;
      const token = getToken();

      if (token) {
        userData = await getCurrentUser();
      } else {
        // No local token, check for global session cookie
        const sessionData = await checkSession();
        if (sessionData) {
          userData = sessionData.user;
          // Note: If session data contains token, we could also store it locally
          // but relying on the cookie is safer for SSO.
        }
      }

      setUser(userData || null);
    } catch (error) {
      console.error("Failed to fetch user:", error);
      setUser(null);
    } finally {
      setIsLoading(false);
      isRefreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (_tempToken: string) => {
    // The actual login flow stores the token via verifyOTP
    // This method is called after successful OTP verification
    await refreshUser();
    setShowWelcomePopup(true);
  };

  const logout = () => {
    apiLogout();
    removeToken();
    setUser(null);
  };

  const isAuthenticated = !!user && !!getToken();

  return (
    <UserContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        roles,
        showWelcomePopup,
        setShowWelcomePopup,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};
