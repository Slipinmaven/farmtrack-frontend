import * as LocalAuthentication from "expo-local-authentication";
import { AppState, Modal, Platform, StyleSheet, View } from "react-native";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { FarmTrackMark } from "@/components/branding/farmtrack-mark";
import { useSecuritySettings } from "@/features/management/hooks";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";

const AppLockContext = createContext(false);

export function useAppLockBlocksUpdates(): boolean {
  return useContext(AppLockContext);
}

export function AppLockGuard({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { theme } = useTheme();
  const security = useSecuritySettings(auth.user?.id);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [lockState, setLockState] = useState({
    authStatus: auth.status,
    shouldLockRestoredSession: false,
    locked: false,
  });
  const appState = useRef(AppState.currentState);
  const backgroundedAt = useRef<number | null>(null);
  const appLockEnabled =
    Platform.OS !== "web" &&
    security.data?.auto_lock_enabled === true &&
    security.data.biometric_unlock_enable === true;
  const lockDelayMs = (security.data?.auto_lock_minutes ?? 5) * 60 * 1000;
  const lockVisible =
    lockState.locked && appLockEnabled && auth.status === "authenticated";

  if (lockState.authStatus !== auth.status) {
    const shouldLockRestoredSession =
      auth.status === "authenticated" &&
      (lockState.authStatus === "loading" || lockState.authStatus === "error");
    setLockState({
      authStatus: auth.status,
      shouldLockRestoredSession,
      locked:
        auth.status !== "authenticated" && auth.status !== "loading"
          ? false
          : lockState.locked,
    });
  } else if (lockState.shouldLockRestoredSession && security.isSuccess) {
    setLockState({
      ...lockState,
      shouldLockRestoredSession: false,
      locked: appLockEnabled || lockState.locked,
    });
  }

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appState.current;
      if (previousState === "active" && nextState !== "active") {
        backgroundedAt.current = Date.now();
      }
      if (previousState !== "active" && nextState === "active") {
        const backgroundedTime = backgroundedAt.current;
        if (
          appLockEnabled &&
          auth.status === "authenticated" &&
          backgroundedTime !== null &&
          Date.now() - backgroundedTime >= lockDelayMs
        ) {
          setLockState((current) => ({ ...current, locked: true }));
        }
        backgroundedAt.current = null;
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [auth.status, appLockEnabled, lockDelayMs]);

  async function unlock() {
    if (unlocking) return;
    setUnlocking(true);
    setUnlockError(null);
    try {
      const securityLevel = await LocalAuthentication.getEnrolledLevelAsync();
      if (securityLevel === LocalAuthentication.SecurityLevel.NONE) {
        setUnlockError(
          "Set up fingerprint, face, or a device screen lock to unlock FarmTrack.",
        );
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock FarmTrack",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });
      if (!result.success) {
        if (result.error !== "user_cancel") {
          setUnlockError("Device authentication didn’t succeed. Try again.");
        }
        return;
      }

      setLockState((current) => ({
        ...current,
        shouldLockRestoredSession: false,
        locked: false,
      }));
    } catch {
      setUnlockError("Device authentication is unavailable. Try again.");
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <AppLockContext.Provider
      value={lockVisible || lockState.shouldLockRestoredSession}
    >
      {children}
      <Modal
        visible={
          lockState.locked &&
          appLockEnabled &&
          auth.status === "authenticated"
        }
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => undefined}
      >
        <View
          style={[styles.lockScreen, { backgroundColor: theme.background }]}
        >
          <View
            style={[
              styles.lockMark,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <FarmTrackMark size={48} />
          </View>
          <AppText size="heading" weight="semibold" style={styles.title}>
            FarmTrack is locked
          </AppText>
          <AppText tone="secondary" style={styles.description}>
            Confirm it’s you with your fingerprint, face, or device screen lock.
            Farm data will sync when the server is available.
          </AppText>
          {unlockError ? (
            <AppText
              size="small"
              style={{ color: theme.danger, textAlign: "center" }}
            >
              {unlockError}
            </AppText>
          ) : null}
          <Button
            label="Unlock FarmTrack"
            loading={unlocking}
            onPress={() => void unlock()}
          />
        </View>
      </Modal>
    </AppLockContext.Provider>
  );
}

const styles = StyleSheet.create({
  lockScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 26,
  },
  lockMark: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  title: { textAlign: "center" },
  description: { maxWidth: 360, textAlign: "center", marginBottom: 4 },
});
