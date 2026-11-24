import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import { login, logout, refreshAuthentication } from "@/features/auth/api";
import type { LoginPayload, User } from "@/features/auth/types";
import { normalizeApiError } from "@/lib/api/errors";
import { getLoginDeviceMetadata } from "@/lib/storage/device";
import {
  clearSession,
  notifySessionExpired,
  readSession,
  saveSession,
  setSessionExpiredHandler,
} from "@/lib/storage/session";

type AuthStatus =
  | "loading"
  | "authenticated"
  | "anonymous"
  | "blocked"
  | "error";
type AuthContextValue = {
  user: User | null;
  status: AuthStatus;
  error: string | null;
  errorCode: string | null;
  signIn: (payload: LoginPayload) => Promise<void>;
  signOut: () => Promise<void>;
  verifyStoredSession: () => Promise<boolean>;
  retrySession: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);

  const verifyStoredSession = useCallback(
    async (isActive: () => boolean = () => true): Promise<boolean> => {
      try {
        const storedSession = await readSession();
        if (!isActive()) return false;
        if (!storedSession) {
          setUser(null);
          setErrorMessage(null);
          setErrorCode(null);
          setStatus("anonymous");
          return false;
        }

        const response = await refreshAuthentication(
          storedSession.refreshToken,
        );
        if (!isActive()) return false;
        await saveSession({
          accessToken: response.access_token,
          refreshToken: response.refresh_token,
        });
        setUser(response.user);
        setErrorMessage(null);
        setErrorCode(null);
        setStatus("authenticated");
        return true;
      } catch (error) {
        if (!isActive()) return false;
        const apiError = normalizeApiError(error);
        if (apiError.code === "DEVICE_BLOCKED") {
          await clearSession();
          queryClient.clear();
          setUser(null);
          setErrorMessage(apiError.message);
          setErrorCode(apiError.code);
          setStatus("blocked");
          return false;
        }
        if (apiError.code === "ACCOUNT_DELETION_PENDING") {
          await clearSession();
          queryClient.clear();
          setUser(null);
          setErrorMessage(apiError.message);
          setErrorCode(apiError.code);
          setStatus("anonymous");
          return false;
        }
        if (apiError.status === undefined || apiError.status >= 500) {
          setErrorMessage(apiError.message);
          setErrorCode(apiError.code);
          setStatus("error");
          return false;
        }

        await clearSession();
        queryClient.clear();
        setUser(null);
        setErrorMessage(null);
        setErrorCode(null);
        setStatus("anonymous");
        return false;
      }
    },
    [queryClient],
  );

  useEffect(() => {
    let active = true;
    setSessionExpiredHandler((expiredError) => {
      const apiError = expiredError
        ? normalizeApiError(expiredError)
        : undefined;
      void clearSession().finally(() => {
        queryClient.clear();
        if (active) {
          setUser(null);
          if (apiError?.code === "DEVICE_BLOCKED") {
            setErrorMessage(apiError.message);
            setErrorCode(apiError.code);
            setStatus("blocked");
          } else if (apiError?.code === "ACCOUNT_DELETION_PENDING") {
            setErrorMessage(apiError.message);
            setErrorCode(apiError.code);
            setStatus("anonymous");
          } else {
            setErrorMessage(null);
            setErrorCode(null);
            setStatus("anonymous");
          }
        }
      });
    });
    void Promise.resolve().then(() => {
      if (active) void verifyStoredSession(() => active);
    });
    return () => {
      active = false;
      setSessionExpiredHandler(undefined);
    };
  }, [queryClient, restoreAttempt, verifyStoredSession]);

  async function signIn(payload: LoginPayload): Promise<void> {
    const response = await login({
      ...payload,
      ...(await getLoginDeviceMetadata()),
    });
    await saveSession({
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
    });
    queryClient.clear();
    setUser(response.user);
    setErrorMessage(null);
    setErrorCode(null);
    setStatus("authenticated");
  }

  function retrySession(): void {
    setErrorMessage(null);
    setErrorCode(null);
    setStatus("loading");
    setRestoreAttempt((attempt) => attempt + 1);
  }

  async function signOut(): Promise<void> {
    try {
      const session = await readSession();
      if (session) await logout(session.refreshToken).catch(() => undefined);
    } finally {
      await clearSession();
      queryClient.clear();
      setUser(null);
      setErrorMessage(null);
      setErrorCode(null);
      setStatus("anonymous");
      notifySessionExpired();
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        status,
        error: errorMessage,
        errorCode,
        signIn,
        signOut,
        verifyStoredSession: () => verifyStoredSession(),
        retrySession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
