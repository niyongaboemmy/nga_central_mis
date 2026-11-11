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
import { endActivity } from "../vendor/nga-activity";
import { primeAvatars } from "../lib/avatarDirectory";
import { PRIMARY_TID, currentUserCacheKey, forgetIdentity, noteIdentity } from "../lib/tenant";

/**
 * Last profile seen on this device -- only ever used while offline (refreshUser).
 * Keyed by school + person (lib/tenant.ts), so one school's profile never opens
 * another school's session.
 */
const rememberUser = (value: unknown) => {
  try {
    const key = currentUserCacheKey();
    if (!key) return;
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    /* private mode / quota: offline start just won't be available */
  }
};
const recalledUser = () => {
  try {
    const key = currentUserCacheKey();
    const raw = key ? localStorage.getItem(key) : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

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
        }
      }

      // A different school or person than last time: drop the old one's caches first.
      if (userData?.user?.user_id) await noteIdentity(userData.tenant?.tid ?? PRIMARY_TID, userData.user.user_id);
      setUser(userData || null);
      rememberUser(userData || null);
      // Lists elsewhere on the page show your own face from the photo directory.
      if (userData?.user?.user_id && userData.avatar !== undefined) {
        primeAvatars([{ user_id: userData.user.user_id, avatar: userData.avatar ?? null }]);
      }
    } catch (error: any) {
      // Offline (no response at all) with a session token: open with the
      // profile last seen on this device, so the installed app and its cached
      // agenda still work without signal. The server still authorises every
      // API call; a real 401 keeps logging the user out as before.
      const cached = !error?.response && getToken() ? recalledUser() : null;
      if (cached) {
        setUser(cached);
      } else {
        console.error("Failed to fetch user:", error);
        setUser(null);
      }
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
    // Tell Usage & Monitoring this tab's session is over (sent with the old token).
    void endActivity();
    apiLogout();
    removeToken();
    rememberUser(null);
    void forgetIdentity();
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
