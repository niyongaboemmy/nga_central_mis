import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { getCurrentUser, UserWithProfile, UserRole } from "../api/users";
import { logout as apiLogout } from "../api/auth";
import { removeToken, getToken } from "../utils/auth";

interface UserContextType {
  user: UserWithProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  permissions: string[];
  roles: UserRole[];
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

  const permissions = user?.permissions || [];
  const roles = user?.roles || [];

  const refreshUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const userData = await getCurrentUser();
      setUser(userData || null);
    } catch (error) {
      console.error("Failed to fetch user:", error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (_tempToken: string) => {
    // The actual login flow stores the token via verifyOTP
    // This method is called after successful OTP verification
    await refreshUser();
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
        permissions,
        roles,
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
