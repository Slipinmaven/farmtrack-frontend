import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeOutUp,
  LinearTransition,
} from "react-native-reanimated";
import * as LocalAuthentication from "expo-local-authentication";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import {
  useAccountDeletionStatus,
  useCancelAccountDeletion,
  useChangePassword,
  useScheduleAccountDeletion,
} from "@/features/auth/hooks";
import {
  usePendingFarmDeletions,
  useRestoreFarmDeletion,
} from "@/features/farms/hooks";
import { DestructiveReviewAction } from "@/features/deletion/components/destructive-review-action";
import { DeletionConfirmationSheet } from "@/features/deletion/components/deletion-confirmation-sheet";
import { normalizeApiError } from "@/lib/api/errors";
import { useAssistantBubblePreference } from "@/providers/assistant-bubble-preference";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

const lockDurations = [1, 5, 10, 15, 30];

function formatTimeRemaining(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return `${days} day${days === 1 ? "" : "s"}, ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${hours} hour${hours === 1 ? "" : "s"}, ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function AccountSectionHeader({
  icon,
  title,
  description,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.accountSectionHeader}>
      <View
        style={[
          styles.accountSectionIcon,
          { backgroundColor: theme.backgroundSelected },
        ]}
      >
        <Ionicons name={icon} size={17} color={theme.primary} />
      </View>
      <View style={styles.accountSectionCopy}>
        <AppText weight="semibold">{title}</AppText>
        <AppText size="small" tone="secondary">
          {description}
        </AppText>
      </View>
    </View>
  );
}

function RecoveryActionButton({
  label,
  icon,
  onPress,
  disabled = false,
  loading = false,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const { theme } = useTheme();
  const unavailable = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: unavailable, busy: loading }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.recoveryActionButton,
        {
          backgroundColor: unavailable
            ? theme.backgroundSelected
            : theme.success,
          borderColor: unavailable ? theme.border : theme.success,
          opacity: pressed && !unavailable ? 0.88 : 1,
          transform: [{ scale: pressed && !unavailable ? 0.99 : 1 }],
        },
      ]}
    >
      <View style={styles.recoveryActionCopy}>
        <View
          style={[
            styles.recoveryActionIcon,
            {
              backgroundColor: unavailable
                ? theme.background
                : "rgba(255,255,255,0.16)",
            },
          ]}
        >
          {loading ? (
            <ActivityIndicator color={unavailable ? theme.textSecondary : "#FFFFFF"} />
          ) : (
            <Ionicons
              name={icon}
              size={18}
              color={unavailable ? theme.textSecondary : "#FFFFFF"}
            />
          )}
        </View>
        <AppText
          weight="semibold"
          style={{ color: unavailable ? theme.textSecondary : "#FFFFFF" }}
        >
          {label}
        </AppText>
      </View>
      <Ionicons
        name="arrow-forward"
        size={18}
        color={unavailable ? theme.textSecondary : "#FFFFFF"}
      />
    </Pressable>
  );
}

export default function AccountDetailsScreen() {
  const { farmDeletionEmailSent } = useLocalSearchParams<{
    farmDeletionEmailSent?: string;
  }>();
  const auth = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const assistantBubble = useAssistantBubblePreference();
  const dialog = useAppDialog();
  const changePassword = useChangePassword(auth.user?.id ?? "");
  const scheduleAccountDeletion = useScheduleAccountDeletion();
  const accountDeletionStatus = useAccountDeletionStatus(auth.user?.id);
  const cancelAccountDeletion = useCancelAccountDeletion(auth.user?.id);
  const pendingFarmDeletions = usePendingFarmDeletions(auth.user?.id);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const restoreFarmDeletion = useRestoreFarmDeletion(auth.user?.id ?? "");
  const security = useSecuritySettings(auth.user?.id);
  const updateSecurity = useUpdateSecuritySettings(auth.user?.id ?? "");
  const [passwordFormOpen, setPasswordFormOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setClockNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [accountDeletionPassword, setAccountDeletionPassword] = useState("");
  const [accountDeletionSheetOpen, setAccountDeletionSheetOpen] =
    useState(false);
  const [accountDeletionNoticeSent, setAccountDeletionNoticeSent] = useState<
    boolean | null
  >(null);
  const [recoveryFeedback, setRecoveryFeedback] = useState<string | null>(null);
  const [cancelAccountStepOpen, setCancelAccountStepOpen] = useState(false);
  const [accountDeletionError, setAccountDeletionError] = useState<
    string | null
  >(null);
  const [restorePasswords, setRestorePasswords] = useState<
    Record<string, string>
  >({});
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoringFarmId, setRestoringFarmId] = useState<string | null>(null);
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

  async function deleteAccount(password: string): Promise<boolean> {
    setAccountDeletionError(null);
    try {
      const result =
        await scheduleAccountDeletion.mutateAsync(password);
      setAccountDeletionNoticeSent(result.notification_sent);
      setAccountDeletionSheetOpen(false);
      const email = auth.user?.email;
      await dialog.showDialog({
        title: "Deletion scheduled",
        message:
          "You are signed out and cannot sign in while deletion is scheduled. " +
          "To change your mind within 30 days, choose Restore scheduled account " +
          "deletion on the sign-in screen and use your email and password.",
        tone: "success",
      });
      await auth.signOut();
      router.replace({
        pathname: "/(auth)/login",
        params: {
          deletionPending: "true",
          ...(email ? { email } : {}),
        },
      });
      return true;
    } catch (error: unknown) {
      setAccountDeletionError(normalizeApiError(error).message);
      return false;
    }
  }

  async function cancelAccountDeletionRequest() {
    if (!accountDeletionPassword) {
      setAccountDeletionError("Enter your current password to continue.");
      return;
    }
    setAccountDeletionError(null);
    try {
      if (!auth.user?.email) {
        setAccountDeletionError("Sign in again to restore your account.");
        return;
      }
      await cancelAccountDeletion.mutateAsync({
        email: auth.user.email,
        password: accountDeletionPassword,
      });
      setAccountDeletionPassword("");
      setCancelAccountStepOpen(false);
      setRecoveryFeedback(
        "Account deletion was cancelled. Your farm access is restored.",
      );
    } catch (error: unknown) {
      setAccountDeletionError(normalizeApiError(error).message);
    }
  }

  async function restoreFarm(farmId: string) {
    const password = restorePasswords[farmId] ?? "";
    if (!password) {
      setRestoringFarmId(farmId);
      return;
    }
    setRestoreError(null);
    try {
      const restoredName =
        pendingFarmDeletions.data?.find((farm) => farm.id === farmId)?.name ??
        "Farm";
      await restoreFarmDeletion.mutateAsync({
        farmId,
        currentPassword: password,
      });
      setRestorePasswords((current) => ({ ...current, [farmId]: "" }));
      setRestoringFarmId(null);
      setRecoveryFeedback(`${restoredName} is restored to your workspace.`);
    } catch (error: unknown) {
      setRestoreError(normalizeApiError(error).message);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
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

        <Card
          style={[
            styles.profileCard,
            {
              borderColor: theme.border,
              borderTopColor: theme.primary,
            },
          ]}
        >
          <View style={styles.profileHero}>
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor: theme.primary,
                  borderColor: `${theme.primary}55`,
                },
              ]}
            >
              <AppText
                size="heading"
                weight="semibold"
                style={{ color: theme.onPrimary }}
              >
                {auth.user?.email?.slice(0, 1).toUpperCase() ?? "A"}
              </AppText>
            </View>
            <View style={styles.profileCopy}>
              <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                FARMTRACK ACCOUNT
              </AppText>
              <AppText size="body" weight="semibold" numberOfLines={2}>
                {auth.user?.email ?? "Not available"}
              </AppText>
              <View
                style={[
                  styles.currentFarmPill,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <Ionicons
                  name="leaf-outline"
                  size={14}
                  color={theme.secondary}
                />
                <AppText size="small" tone="secondary" numberOfLines={1}>
                  {farm.selectedFarm?.name ?? "No farm selected"}
                </AppText>
              </View>
            </View>
          </View>
          <View style={[styles.profileFooter, { borderTopColor: theme.border }]}>
            <Ionicons
              name="shield-checkmark-outline"
              size={16}
              color={theme.success}
            />
            <AppText size="small" tone="secondary">
              Profile, security and recovery settings
            </AppText>
          </View>
        </Card>
        {farm.status === "empty" &&
        accountDeletionStatus.data?.status !== "scheduled" ? (
          <Card style={styles.deletionCard}>
            <View style={styles.sectionHeading}>
              <Ionicons
                name="leaf-outline"
                size={19}
                color={theme.primary}
              />
              <AppText weight="semibold">No active farms</AppText>
            </View>
            <AppText size="small" tone="secondary">
              Your workspace is empty. Restore a farm in its recovery window,
              or create a new farm to get started.
            </AppText>
            <Button
              label={
                pendingFarmDeletions.data?.length
                  ? "Create a new farm"
                  : "Set up your farm"
              }
              onPress={() => router.push("/farm-setup")}
            />
          </Card>
        ) : null}
        {accountDeletionStatus.isError || pendingFarmDeletions.isError ? (
          <Card style={styles.deletionCard}>
            <AppText size="small" style={{ color: theme.danger }}>
              {accountDeletionStatus.isError
                ? "Recovery status is unavailable."
                : "Pending farm recovery details are unavailable."}
            </AppText>
            <Button
              label="Retry"
              variant="secondary"
              onPress={() => {
                if (accountDeletionStatus.isError) {
                  void accountDeletionStatus.refetch();
                }
                if (pendingFarmDeletions.isError) {
                  void pendingFarmDeletions.refetch();
                }
              }}
            />
          </Card>
        ) : null}
        {recoveryFeedback ? (
          <Animated.View
            entering={FadeInUp.duration(220)}
            exiting={FadeOutUp.duration(160)}
            style={[
              styles.feedbackCard,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <Ionicons
              name="checkmark-circle-outline"
              size={19}
              color={theme.primary}
            />
            <AppText size="small" weight="semibold" style={{ flex: 1 }}>
              {recoveryFeedback}
            </AppText>
          </Animated.View>
        ) : null}
        {accountDeletionStatus.data?.status === "confirmation_pending" ? (
          <Animated.View
            entering={FadeInDown.duration(240)}
            layout={LinearTransition.springify().damping(18)}
          >
            <Card style={styles.accountRecoveryCard}>
              <View style={styles.recoveryHeader}>
                <View
                  style={[
                    styles.recoveryIcon,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Ionicons
                    name="mail-unread-outline"
                    size={20}
                    color={theme.primary}
                  />
                </View>
                <View style={styles.recoveryTitle}>
                  <AppText size="body" weight="semibold">
                    Confirm deletion request
                  </AppText>
                  <AppText size="small" tone="secondary">
                    The 30-day recovery period has not started.
                  </AppText>
                </View>
              </View>
              <AppText size="small" tone="secondary">
                A deletion request is waiting for confirmation. Cancel it here
                with your password to keep your account active. If you did not
                make this request, change your password and review your
                signed-in devices.
              </AppText>
            </Card>
          </Animated.View>
        ) : null}
        {accountDeletionStatus.data?.status === "scheduled" ? (
          <Animated.View
            entering={FadeInDown.duration(260)}
            layout={LinearTransition.springify().damping(18)}
          >
            <Card style={styles.accountRecoveryCard}>
              <View style={styles.recoveryHeader}>
                <View
                  style={[
                    styles.recoveryIcon,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Ionicons
                    name="pause-circle-outline"
                    size={21}
                    color={theme.secondary}
                  />
                </View>
                <View style={styles.recoveryTitle}>
                  <AppText size="body" weight="semibold">
                    Account deletion is scheduled
                  </AppText>
                  <AppText size="small" tone="secondary">
                    Farm access is paused until you cancel.
                  </AppText>
                </View>
              </View>
              <View
                style={[
                  styles.deadlinePanel,
                  { backgroundColor: theme.background },
                ]}
              >
                <AppText size="small" tone="secondary">
                  {accountDeletionStatus.data.scheduled_for &&
                  new Date(accountDeletionStatus.data.scheduled_for).getTime() >
                    clockNow
                    ? `${formatTimeRemaining(
                        new Date(
                          accountDeletionStatus.data.scheduled_for,
                        ).getTime() - clockNow,
                      )} until permanent deletion`
                    : "The recovery deadline has passed; deletion may be processing."}
                </AppText>
                <AppText size="small" weight="semibold">
                  {accountDeletionStatus.data.scheduled_for
                    ? new Date(
                        accountDeletionStatus.data.scheduled_for,
                      ).toLocaleString()
                    : "Scheduled within 30 days"}
                </AppText>
              </View>
              {accountDeletionNoticeSent === true ? (
                <AppText size="small" tone="secondary">
                  A notification email was sent to your account address.
                </AppText>
              ) : accountDeletionNoticeSent === false ? (
                <AppText size="small" tone="secondary">
                  The request is active, but its notification email could not
                  be sent.
                </AppText>
              ) : null}
              {!cancelAccountStepOpen ? (
                <RecoveryActionButton
                  label="Resume farm access"
                  icon="play-outline"
                  onPress={() => {
                    setAccountDeletionError(null);
                    setAccountDeletionPassword("");
                    setCancelAccountStepOpen(true);
                  }}
                />
              ) : (
                <Animated.View
                  entering={FadeInUp.duration(200)}
                  style={styles.restoreConfirmation}
                >
                  <View
                    style={[
                      styles.restorePanel,
                      {
                        backgroundColor: theme.backgroundElement,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <View style={styles.restorePanelHeading}>
                      <Ionicons
                        name="shield-checkmark-outline"
                        size={19}
                        color={theme.success}
                      />
                      <AppText weight="semibold">
                        Verify to resume access
                      </AppText>
                    </View>
                    <TextField
                      label="Current password"
                      value={accountDeletionPassword}
                      onChangeText={setAccountDeletionPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      textContentType="password"
                      leadingIcon="key-outline"
                    />
                    {accountDeletionError ? (
                      <AppText size="small" style={{ color: theme.danger }}>
                        {accountDeletionError}
                      </AppText>
                    ) : null}
                    <RecoveryActionButton
                      label="Resume farm access"
                      icon="play-outline"
                      loading={cancelAccountDeletion.isPending}
                      disabled={!accountDeletionPassword}
                      onPress={() => void cancelAccountDeletionRequest()}
                    />
                    <Button
                      label="Keep deletion scheduled"
                      variant="quiet"
                      onPress={() => {
                        setCancelAccountStepOpen(false);
                        setAccountDeletionPassword("");
                        setAccountDeletionError(null);
                      }}
                    />
                  </View>
                </Animated.View>
              )}
            </Card>
          </Animated.View>
        ) : null}
        {pendingFarmDeletions.data?.length ? (
          <View style={styles.recoverySection}>
            <View style={styles.recoverySectionHeading}>
              <AppText size="heading" weight="semibold">
                Farm recovery
              </AppText>
              <AppText size="small" tone="secondary">
                Restore before the deadline to keep each farm and its records.
              </AppText>
            </View>
            {farmDeletionEmailSent === "true" ? (
              <AppText size="small" tone="secondary">
                The farm deletion notice was sent to your account email.
              </AppText>
            ) : farmDeletionEmailSent === "false" ? (
              <AppText size="small" tone="secondary">
                The farm deletion is scheduled, but its email notice could not
                be delivered.
              </AppText>
            ) : null}
            {pendingFarmDeletions.data.map((pendingFarm, index) => {
              const deadline = new Date(pendingFarm.scheduled_for).getTime();
              const started = new Date(
                pendingFarm.deletion_requested_at,
              ).getTime();
              const total = Math.max(1, deadline - started);
              const remaining = Math.max(0, deadline - clockNow);
              const progress = Math.min(
                1,
                Math.max(0, 1 - remaining / total),
              );
              const isRestoring = restoringFarmId === pendingFarm.id;
              const accountIsScheduled =
                accountDeletionStatus.data?.status === "scheduled";
              return (
                <Animated.View
                  key={pendingFarm.id}
                  entering={FadeInDown.delay(index * 45).duration(240)}
                  exiting={FadeOutUp.duration(180)}
                  layout={LinearTransition.springify().damping(18)}
                >
                  <Card style={styles.farmRecoveryCard}>
                    <View style={styles.recoveryHeader}>
                      <View
                        style={[
                          styles.recoveryIcon,
                          { backgroundColor: theme.backgroundSelected },
                        ]}
                      >
                        <Ionicons
                          name="business-outline"
                          size={20}
                          color={theme.primary}
                        />
                      </View>
                      <View style={styles.recoveryTitle}>
                        <AppText size="body" weight="semibold" numberOfLines={1}>
                          {pendingFarm.name}
                        </AppText>
                        <AppText size="small" tone="secondary">
                          Recovery period
                        </AppText>
                      </View>
                      <View
                        style={[
                          styles.daysRemainingBadge,
                          { backgroundColor: theme.backgroundSelected },
                        ]}
                      >
                        <AppText size="small" weight="semibold">
                          {deadline <= clockNow
                            ? "Ending"
                            : `${Math.max(1, Math.ceil(remaining / 86_400_000))}d`}
                        </AppText>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.progressTrack,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <View
                        style={[
                          styles.progressFill,
                          {
                            backgroundColor: theme.primary,
                            width: `${progress * 100}%`,
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.deadlineCopy}>
                      <AppText size="small" weight="semibold">
                        {deadline <= clockNow
                          ? "Permanent removal may be processing"
                          : `${formatTimeRemaining(remaining)} remaining`}
                      </AppText>
                      <AppText size="small" tone="secondary">
                        Deadline · {new Date(deadline).toLocaleString()}
                      </AppText>
                    </View>
                    {accountIsScheduled ? (
                      <View
                        style={[
                          styles.inlineNotice,
                          { backgroundColor: theme.backgroundSelected },
                        ]}
                      >
                        <Ionicons
                          name="information-circle-outline"
                          size={17}
                          color={theme.secondary}
                        />
                        <AppText size="small" tone="secondary" style={{ flex: 1 }}>
                          Cancel account deletion above before restoring a farm.
                        </AppText>
                      </View>
                    ) : isRestoring ? (
                      <Animated.View
                        entering={FadeInUp.duration(200)}
                        style={styles.restoreConfirmation}
                      >
                        <View
                          style={[
                            styles.restorePanel,
                            {
                              backgroundColor: theme.backgroundElement,
                              borderColor: theme.border,
                            },
                          ]}
                        >
                          <View style={styles.restorePanelHeading}>
                            <Ionicons
                              name="shield-checkmark-outline"
                              size={19}
                              color={theme.success}
                            />
                            <AppText weight="semibold">
                              Verify to restore this farm
                            </AppText>
                          </View>
                            <AppText size="small" tone="secondary">
                              Confirm your identity to return this farm to your
                              workspace.
                            </AppText>
                            <TextField
                              label="Current password"
                              value={restorePasswords[pendingFarm.id] ?? ""}
                              onChangeText={(value) =>
                                setRestorePasswords((current) => ({
                                  ...current,
                                  [pendingFarm.id]: value,
                                }))
                              }
                              secureTextEntry
                              autoCapitalize="none"
                              textContentType="password"
                              leadingIcon="key-outline"
                            />
                            {restoreError ? (
                              <AppText size="small" style={{ color: theme.danger }}>
                                {restoreError}
                              </AppText>
                            ) : null}
                            <RecoveryActionButton
                              label="Restore farm"
                              icon="refresh-outline"
                              loading={restoreFarmDeletion.isPending}
                              disabled={!restorePasswords[pendingFarm.id]}
                              onPress={() => void restoreFarm(pendingFarm.id)}
                            />
                            <Button
                              label="Not now"
                              variant="quiet"
                              onPress={() => {
                                setRestoringFarmId(null);
                                setRestorePasswords((current) => ({
                                  ...current,
                                  [pendingFarm.id]: "",
                                }));
                                setRestoreError(null);
                              }}
                            />
                        </View>
                      </Animated.View>
                    ) : (
                      <RecoveryActionButton
                        label="Restore this farm"
                        icon="refresh-outline"
                        onPress={() => {
                          setRestoreError(null);
                          setRestoringFarmId(pendingFarm.id);
                        }}
                      />
                    )}
                  </Card>
                </Animated.View>
              );
            })}
          </View>
        ) : null}

        <AccountSectionHeader
          icon="options-outline"
          title="Preferences & device security"
          description="Choose how FarmTrack appears and stays protected."
        />
        <Card style={styles.securityCard}>
          <View style={styles.securityHeader}>
            <View style={styles.sectionHeading}>
              <Ionicons name="sparkles-outline" size={18} color={theme.primary} />
              <AppText size="body" weight="semibold">
                FarmMate chat bubble
              </AppText>
            </View>
            <Switch
              value={assistantBubble.enabled}
              disabled={!assistantBubble.loaded}
              onValueChange={(enabled) => void assistantBubble.setEnabled(enabled)}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={theme.backgroundElement}
            />
          </View>
          <AppText size="small" tone="secondary">
            Show a floating FarmMate shortcut on farm screens. You can still
            open FarmMate from More when this is hidden.
          </AppText>
          {!assistantBubble.loaded ? (
            <AppText size="small" tone="secondary">
              Loading assistant preference…
            </AppText>
          ) : null}
          {assistantBubble.error ? (
            <AppText size="small" style={{ color: theme.danger }}>
              {assistantBubble.error}
            </AppText>
          ) : null}
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

        <AccountSectionHeader
          icon="key-outline"
          title="Password & sign-in activity"
          description="Manage credentials and review devices using your account."
        />
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

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out of FarmTrack on this device"
          onPress={() => void auth.signOut()}
          style={({ pressed }) => [
            styles.signOutAction,
            {
              backgroundColor: pressed
                ? theme.backgroundSelected
                : theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}
        >
          <View
            style={[
              styles.signOutIcon,
              { backgroundColor: `${theme.secondary}18` },
            ]}
          >
            <Ionicons name="log-out-outline" size={20} color={theme.secondary} />
          </View>
          <View style={styles.signOutCopy}>
            <AppText weight="semibold">Sign out on this device</AppText>
            <AppText size="small" tone="secondary">
              End this session. You can sign in again anytime.
            </AppText>
          </View>
          <Ionicons
            name="arrow-forward"
            size={18}
            color={theme.textSecondary}
          />
        </Pressable>

        <View style={styles.dangerZone}>
          <View style={styles.dangerZoneHeading}>
            <Ionicons
              name="warning-outline"
              size={17}
              color={theme.danger}
            />
            <AppText size="small" weight="semibold" style={{ color: theme.danger }}>
              PERMANENT ACCOUNT CHANGES
            </AppText>
          </View>
          <Card
            style={[
              styles.dangerZoneCard,
              {
                borderColor: `${theme.danger}66`,
                borderLeftColor: theme.danger,
              },
            ]}
          >
            <View style={styles.dangerZoneDetails}>
              <View style={styles.dangerZoneIntro}>
                <View
                  style={[
                    styles.dangerIcon,
                    { backgroundColor: `${theme.danger}18` },
                  ]}
                >
                  <Ionicons
                    name="person-remove-outline"
                    size={21}
                    color={theme.danger}
                  />
                </View>
                <View style={styles.dangerZoneCopy}>
                  <AppText weight="semibold">Delete your account</AppText>
                  <AppText size="small" tone="secondary">
                    Your account and owned farms are affected.
                  </AppText>
                </View>
              </View>
              <AppText size="small" tone="secondary">
                A 30-day recovery period starts when you schedule deletion.
                Farm access pauses immediately; you can cancel with your
                password before the deadline.
              </AppText>
              {accountDeletionStatus.isLoading ||
              !accountDeletionStatus.data ? (
                <AppText size="small" tone="secondary">
                  Checking your account deletion status…
                </AppText>
              ) : accountDeletionStatus.data.status === "none" ? (
                <DestructiveReviewAction
                  label="Review account deletion"
                  description="Account and owned farms · 30-day recovery"
                  onPress={() => {
                    setAccountDeletionError(null);
                    setAccountDeletionSheetOpen(true);
                  }}
                />
              ) : accountDeletionStatus.data.status ===
                "confirmation_pending" ? (
                <View style={styles.restoreConfirmation}>
                  <AppText size="small" weight="semibold">
                    A request is awaiting confirmation
                  </AppText>
                  <AppText size="small" tone="secondary">
                    No deletion countdown has started. Cancel the request
                    here with your password. If this was not you, change
                    your password and review your signed-in devices.
                  </AppText>
                  {!cancelAccountStepOpen ? (
                    <RecoveryActionButton
                      label="Cancel this request"
                      icon="close-circle-outline"
                      onPress={() => {
                        setAccountDeletionError(null);
                        setAccountDeletionPassword("");
                        setCancelAccountStepOpen(true);
                      }}
                    />
                  ) : (
                    <View style={styles.restorePanel}>
                      <View style={styles.restorePanelHeading}>
                        <Ionicons
                          name="shield-checkmark-outline"
                          size={19}
                          color={theme.success}
                        />
                        <AppText weight="semibold">
                          Verify to keep your account
                        </AppText>
                      </View>
                      <TextField
                        label="Current password"
                        value={accountDeletionPassword}
                        onChangeText={setAccountDeletionPassword}
                        secureTextEntry
                        autoCapitalize="none"
                        textContentType="password"
                        leadingIcon="key-outline"
                      />
                      {accountDeletionError ? (
                        <AppText size="small" style={{ color: theme.danger }}>
                          {accountDeletionError}
                        </AppText>
                      ) : null}
                      <RecoveryActionButton
                        label="Cancel deletion request"
                        icon="checkmark-circle-outline"
                        loading={cancelAccountDeletion.isPending}
                        disabled={!accountDeletionPassword}
                        onPress={() => void cancelAccountDeletionRequest()}
                      />
                    </View>
                  )}
                </View>
              ) : (
                <View
                  style={[
                    styles.scheduledNotice,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Ionicons
                    name="time-outline"
                    size={18}
                    color={theme.secondary}
                  />
                  <AppText size="small" tone="secondary" style={{ flex: 1 }}>
                    Deletion is scheduled. Manage or cancel it in the recovery
                    panel above.
                  </AppText>
                </View>
              )}
            </View>
          </Card>
        </View>
      </ScrollView>
        <DeletionConfirmationSheet
          visible={accountDeletionSheetOpen}
          title="Schedule account deletion?"
          subject="Your FarmTrack account and owned farms"
          description="This starts a 30-day recovery period. Your account remains sign-in capable, but all farm access and operations pause until you cancel."
          recoveryDescription="Cancel with your password from Account & access to restore your access before the deadline."
          confirmationPhrase="DELETE"
          busy={scheduleAccountDeletion.isPending}
          error={accountDeletionError}
          onDismiss={() => setAccountDeletionSheetOpen(false)}
          onConfirm={deleteAccount}
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 44,
    gap: 15,
  },
  profileCard: {
    gap: 14,
    borderWidth: 1,
    borderTopWidth: 4,
    borderRadius: 19,
    padding: 17,
  },
  profileHero: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    borderWidth: 2,
  },
  profileCopy: { flex: 1, minWidth: 0, gap: 4 },
  currentFarmPill: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    minHeight: 27,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 99,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  profileFooter: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  accountSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 7,
    paddingHorizontal: 2,
  },
  accountSectionIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  accountSectionCopy: { flex: 1, gap: 2 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  securityCard: {
    gap: 14,
    borderRadius: 17,
    padding: 17,
  },
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
  signOutAction: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  signOutIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  signOutCopy: { flex: 1, minWidth: 0, gap: 3 },
  deletionCard: { gap: 12, borderRadius: 16 },
  feedbackCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  accountRecoveryCard: {
    gap: 14,
    borderRadius: 18,
    padding: 18,
  },
  recoverySection: { gap: 12 },
  recoverySectionHeading: { gap: 4, paddingHorizontal: 2 },
  farmRecoveryCard: { gap: 13, borderRadius: 16 },
  recoveryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  recoveryIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  recoveryTitle: { flex: 1, gap: 3 },
  daysRemainingBadge: {
    minWidth: 42,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 9,
  },
  deadlinePanel: {
    gap: 5,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  deadlineCopy: { gap: 4 },
  progressTrack: { height: 5, overflow: "hidden", borderRadius: 99 },
  progressFill: { height: "100%", borderRadius: 99 },
  inlineNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    padding: 11,
  },
  restoreConfirmation: { gap: 11 },
  restorePanel: {
    gap: 12,
    borderWidth: 1,
    borderRadius: 15,
    padding: 14,
  },
  restorePanelHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  recoveryActionButton: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  recoveryActionCopy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  recoveryActionIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  dangerZone: { gap: 9, marginTop: 16 },
  dangerZoneHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 2,
  },
  dangerZoneCard: {
    gap: 13,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 16,
    padding: 15,
    overflow: "hidden",
  },
  dangerZoneDetails: { gap: 13 },
  dangerZoneIntro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  dangerIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  dangerZoneCopy: { flex: 1, gap: 3 },
  scheduledNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: 11,
    padding: 12,
  },
  passwordDisclosure: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderRadius: 15,
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
