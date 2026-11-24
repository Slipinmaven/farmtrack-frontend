import * as LocalAuthentication from "expo-local-authentication";
import { AppState, Modal, Platform, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useCallback,
  createContext,
  useEffect,
  useRef,
  useState,
  useContext,
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
  const [showUnlockButton, setShowUnlockButton] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [lockState, setLockState] = useState({
    authStatus: auth.status,
    shouldLockRestoredSession: false,
    locked: false,
  });
  const appState = useRef(AppState.currentState);
  const backgroundedAt = useRef<number | null>(null);
  const autoPromptStarted = useRef(false);
  const unlockingRef = useRef(false);
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

  const unlock = useCallback(async () => {
    if (unlockingRef.current) return;
    unlockingRef.current = true;
    let authenticated = false;
    setUnlocking(true);
    setShowUnlockButton(false);
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

      authenticated = true;
      setShowUnlockButton(false);
      setLockState((current) => ({
        ...current,
        shouldLockRestoredSession: false,
        locked: false,
      }));
    } catch {
      setUnlockError("Device authentication is unavailable. Try again.");
    } finally {
      unlockingRef.current = false;
      setUnlocking(false);
      if (!authenticated) setShowUnlockButton(true);
    }
  }, []);

  useEffect(() => {
    if (!lockVisible) {
      autoPromptStarted.current = false;
      return;
    }
    if (autoPromptStarted.current) return;

    autoPromptStarted.current = true;
    const timer = setTimeout(() => void unlock(), 250);
    return () => clearTimeout(timer);
  }, [lockVisible, unlock]);

  return (
    <AppLockContext.Provider
      value={lockVisible || lockState.shouldLockRestoredSession}
    >
      {children}
      <Modal
        visible={lockVisible}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => undefined}
      >
        <View
          style={[styles.lockScreen, { backgroundColor: theme.background }]}
        >
          <View style={styles.lockContent}>
            <View
              style={[
                styles.lockCard,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            >
              <View
                style={[
                  styles.lockMark,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <FarmTrackMark size={54} />
                <View
                  style={[
                    styles.lockBadge,
                    {
                      backgroundColor: theme.primary,
                      borderColor: theme.backgroundElement,
                    },
                  ]}
                >
                  <Ionicons
                    name="lock-closed"
                    size={14}
                    color={theme.onPrimary}
                  />
                </View>
              </View>
              <View
                style={[
                  styles.secureLabel,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <Ionicons
                  name="shield-checkmark"
                  size={15}
                  color={theme.primary}
                />
                <AppText
                  size="small"
                  weight="semibold"
                  style={{ color: theme.primary }}
                >
                  PRIVATE FARM SESSION
                </AppText>
              </View>
              <AppText size="heading" weight="semibold" style={styles.title}>
                FarmTrack is locked
              </AppText>
              <AppText tone="secondary" style={styles.description}>
                Your farm data is hidden. Verify with your device passcode,
                fingerprint, or face to continue.
              </AppText>

              <View
                style={[styles.verificationRow, { borderColor: theme.border }]}
              >
                <View
                  style={[
                    styles.verificationIcon,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Ionicons
                    name={unlocking ? "scan-outline" : "keypad-outline"}
                    size={19}
                    color={theme.primary}
                  />
                </View>
                <View style={styles.verificationCopy}>
                  <AppText weight="semibold">
                    {unlocking
                      ? "Waiting for verification"
                      : "Device verification"}
                  </AppText>
                  <AppText size="small" tone="secondary">
                    {unlocking
                      ? "Follow the prompt on your device"
                      : "Only you can unlock this session"}
                  </AppText>
                </View>
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={theme.success}
                />
              </View>

              {unlockError ? (
                <AppText
                  size="small"
                  style={{ color: theme.danger, textAlign: "center" }}
                  accessibilityLiveRegion="polite"
                >
                  {unlockError}
                </AppText>
              ) : null}

              {showUnlockButton ? (
                <Button
                  label="Unlock FarmTrack"
                  loading={unlocking}
                  onPress={() => void unlock()}
                  style={styles.unlockButton}
                />
              ) : null}
            </View>
            <AppText size="small" tone="secondary" style={styles.footer}>
              FarmTrack · Secure access
            </AppText>
          </View>
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
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  lockContent: {
    width: "100%",
    maxWidth: 430,
    alignItems: "center",
    gap: 18,
  },
  lockCard: {
    width: "100%",
    alignItems: "center",
    gap: 16,
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 22,
  },
  lockMark: {
    width: 92,
    height: 92,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
    position: "relative",
  },
  lockBadge: {
    position: "absolute",
    right: -5,
    bottom: -5,
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderRadius: 15,
  },
  secureLabel: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  title: { textAlign: "center" },
  description: {
    maxWidth: 340,
    textAlign: "center",
    lineHeight: 22,
    marginTop: -7,
  },
  verificationRow: {
    width: "100%",
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  verificationIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  verificationCopy: { flex: 1, gap: 2 },
  unlockButton: { width: "100%", borderRadius: 14 },
  footer: { textAlign: "center" },
});
