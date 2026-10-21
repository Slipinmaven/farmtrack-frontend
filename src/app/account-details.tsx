import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import {
  useSecuritySettings,
  useUpdateSecuritySettings,
} from "@/features/management/hooks";
import type { UpdateSecurityPayload } from "@/features/management/api";
import { SessionHistoryPanel } from "@/features/auth/components/session-history-panel";
import { useChangePassword } from "@/features/auth/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

const lockDurations = [1, 5, 10, 15, 30];

export default function AccountDetailsScreen() {
  const auth = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const changePassword = useChangePassword(auth.user?.id ?? "");
  const security = useSecuritySettings(auth.user?.id);
  const updateSecurity = useUpdateSecuritySettings(auth.user?.id ?? "");
  const [passwordFormOpen, setPasswordFormOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [customMinutes, setCustomMinutes] = useState<string | null>(null);
  const savedLockMinutes = security.data?.auto_lock_minutes ?? 5;
  const customDurationSelected =
    customMinutes !== null || !lockDurations.includes(savedLockMinutes);

  async function saveSecurityPreference(
    payload: UpdateSecurityPayload,
  ): Promise<boolean> {
    setSecurityError(null);
    try {
      await updateSecurity.mutateAsync(payload);
      return true;
    } catch (error: unknown) {
      setSecurityError(normalizeApiError(error).message);
      return false;
    }
  }

  async function toggleAppLock(enabled: boolean) {
    if (!enabled) {
      await saveSecurityPreference({
        biometric_unlock_enable: false,
        auto_lock_enabled: false,
      });
      return;
    }
    if (Platform.OS === "web") {
      setSecurityError("App lock is available in the FarmTrack mobile app.");
      return;
    }
    setSecurityError(null);
    try {
      const securityLevel = await LocalAuthentication.getEnrolledLevelAsync();
      if (securityLevel === LocalAuthentication.SecurityLevel.NONE) {
        setSecurityError(
          "Set up fingerprint, face, or a device screen lock first.",
        );
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Confirm to enable FarmTrack app lock",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });
      if (!result.success) {
        if (result.error !== "user_cancel") {
          setSecurityError("Device authentication didn’t succeed. Try again.");
        }
        return;
      }
      await saveSecurityPreference({
        biometric_unlock_enable: true,
        auto_lock_enabled: true,
        auto_lock_minutes: security.data?.auto_lock_minutes || 5,
      });
    } catch {
      setSecurityError("Device authentication is unavailable on this device.");
    }
  }

  async function saveCustomLockDuration() {
    const minutes = Number(customMinutes ?? savedLockMinutes);
    if (!Number.isSafeInteger(minutes) || minutes < 1) {
      setSecurityError("Enter a whole number of minutes greater than zero.");
      return;
    }
    if (await saveSecurityPreference({ auto_lock_minutes: minutes })) {
      setCustomMinutes(null);
    }
  }

  async function savePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Complete all password fields.");
      return;
    }
    if (newPassword.length < 12) {
      setPasswordError("Use at least 12 characters for your new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("The new passwords do not match.");
      return;
    }

    setPasswordError(null);
    try {
      await changePassword.mutateAsync({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFormOpen(false);
      await dialog.showDialog({
        title: "Password changed",
        message: "Other signed-in devices have been signed out.",
        tone: "success",
      });
    } catch (error: unknown) {
      setPasswordError(normalizeApiError(error).message);
    }
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        <FarmPageHeader title="Account & access" showBack />

        <Card style={styles.profileCard}>
          <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
            <AppText
              size="heading"
              weight="semibold"
              style={{ color: theme.onPrimary }}
            >
              {auth.user?.email?.slice(0, 1).toUpperCase() ?? "A"}
            </AppText>
          </View>
          <View style={styles.profileCopy}>
            <AppText size="small" tone="secondary">
              Signed in as
            </AppText>
            <AppText weight="semibold" numberOfLines={2}>
              {auth.user?.email ?? "Not available"}
            </AppText>
            <AppText size="small" tone="secondary">
              {farm.selectedFarm?.name ?? "No farm selected"}
            </AppText>
          </View>
        </Card>

        <Card style={styles.securityCard}>
          <View style={styles.securityHeader}>
            <View style={styles.sectionHeading}>
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={theme.primary}
              />
              <AppText size="body" weight="semibold">
                App lock
              </AppText>
            </View>
            <Switch
              value={Boolean(
                security.data?.auto_lock_enabled &&
                security.data.biometric_unlock_enable,
              )}
              disabled={
                security.isLoading ||
                security.isError ||
                updateSecurity.isPending
              }
              onValueChange={(enabled) => void toggleAppLock(enabled)}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={theme.backgroundElement}
            />
          </View>
          {security.isLoading ? (
            <AppText size="small" tone="secondary">
              Loading app lock settings…
            </AppText>
          ) : null}
          {security.isError ? (
            <View style={styles.securityErrorState}>
              <AppText size="small" style={{ color: theme.danger }}>
                Could not load app lock settings.
              </AppText>
              <Button
                label="Retry"
                variant="secondary"
                onPress={() => void security.refetch()}
              />
            </View>
          ) : null}
          {security.data?.auto_lock_enabled &&
          security.data.biometric_unlock_enable ? (
            <View style={styles.durationGroup}>
              <AppText size="small" tone="secondary">
                Lock after inactivity
              </AppText>
              <View style={styles.durationChoices}>
                {lockDurations.map((minutes) => {
                  const selected =
                    customMinutes === null && savedLockMinutes === minutes;
                  return (
                    <Pressable
                      key={minutes}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      disabled={updateSecurity.isPending}
                      onPress={() => {
                        setCustomMinutes(null);
                        void saveSecurityPreference({
                          auto_lock_minutes: minutes,
                        });
                      }}
                      style={[
                        styles.durationChoice,
                        {
                          backgroundColor: selected
                            ? theme.primary
                            : theme.backgroundElement,
                          borderColor: selected ? theme.primary : theme.border,
                        },
                      ]}
                    >
                      <AppText
                        size="small"
                        weight="semibold"
                        style={{
                          color: selected ? theme.onPrimary : theme.text,
                        }}
                      >
                        {minutes} min
                      </AppText>
                    </Pressable>
                  );
                })}
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: customDurationSelected,
                  }}
                  onPress={() => setCustomMinutes(String(savedLockMinutes))}
                  style={[
                    styles.durationChoice,
                    {
                      backgroundColor: customDurationSelected
                        ? theme.primary
                        : theme.backgroundElement,
                      borderColor: customDurationSelected
                        ? theme.primary
                        : theme.border,
                    },
                  ]}
                >
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{
                      color: customDurationSelected
                        ? theme.onPrimary
                        : theme.text,
                    }}
                  >
                    Other
                  </AppText>
                </Pressable>
              </View>
              {customMinutes !== null ? (
                <View style={styles.customDuration}>
                  <TextField
                    label="Minutes of inactivity"
                    value={customMinutes}
                    onChangeText={setCustomMinutes}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="Enter minutes"
                  />
                  <Button
                    label="Save duration"
                    loading={updateSecurity.isPending}
                    onPress={() => void saveCustomLockDuration()}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
          {securityError ? (
            <AppText size="small" style={{ color: theme.danger }}>
              {securityError}
            </AppText>
          ) : null}
        </Card>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: passwordFormOpen }}
          onPress={() => {
            setPasswordFormOpen((open) => !open);
            setPasswordError(null);
          }}
          style={({ pressed }) => [
            styles.passwordDisclosure,
            {
              backgroundColor: pressed
                ? theme.backgroundSelected
                : theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.sectionHeading}>
            <Ionicons name="key-outline" size={18} color={theme.primary} />
            <View style={styles.passwordCopy}>
              <AppText size="body" weight="semibold">
                Change password
              </AppText>
              <AppText size="small" tone="secondary">
                Change your password
              </AppText>
            </View>
          </View>
          <AppText size="small" tone="muted" weight="semibold">
            {passwordFormOpen ? "Close" : "Change"}
          </AppText>
        </Pressable>

        {passwordFormOpen ? (
          <Card style={styles.passwordForm}>
            <TextField
              label="Current password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              autoCapitalize="none"
              textContentType="password"
            />
            <TextField
              label="New password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoCapitalize="none"
              textContentType="newPassword"
            />
            <TextField
              label="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              textContentType="newPassword"
            />
            <AppText size="small" tone="secondary">
              Use at least 12 characters. Other devices will need to sign in
              again.
            </AppText>
            {passwordError ? (
              <AppText size="small" style={{ color: theme.danger }}>
                {passwordError}
              </AppText>
            ) : null}
            <View style={styles.passwordActions}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => setPasswordFormOpen(false)}
              />
              <Button
                label="Update password"
                loading={changePassword.isPending}
                disabled={!currentPassword || !newPassword || !confirmPassword}
                onPress={() => void savePassword()}
              />
            </View>
          </Card>
        ) : null}

        <View style={styles.activitySection}>
          <View style={styles.sectionHeading}>
            <Ionicons name="time-outline" size={18} color={theme.primary} />
            <AppText size="body" weight="semibold">
              Sign-in activity
            </AppText>
          </View>
          <AppText size="small" tone="secondary">
            Times use your device’s local time. Network IP is approximate, not
            GPS.
          </AppText>
          <SessionHistoryPanel userId={auth.user?.id} />
        </View>

        <Button
          label="Sign out"
          variant="secondary"
          onPress={() => void auth.signOut()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 36,
    gap: 12,
  },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
  },
  profileCopy: { flex: 1, gap: 2 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  securityCard: { gap: 14 },
  securityHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  securityErrorState: { gap: 8, alignItems: "flex-start" },
  durationGroup: { gap: 10 },
  durationChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  durationChoice: {
    minHeight: 38,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
  },
  customDuration: { gap: 10 },
  activitySection: { gap: 10 },
  passwordDisclosure: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 5,
  },
  passwordCopy: { gap: 1 },
  passwordForm: { gap: 13 },
  passwordActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
  },
});
