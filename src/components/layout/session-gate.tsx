import type { ReactNode } from "react";
import { Redirect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Pressable, StyleSheet, View } from "react-native";

import { LoadingState } from "@/components/feedback/loading-state";
import { AuthRecoveryState } from "@/components/feedback/auth-recovery-state";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAccountDeletionStatus } from "@/features/auth/hooks";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

const styles = StyleSheet.create({
  lockedScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  lockedContent: { width: "100%", maxWidth: 480, minWidth: 0 },
  lockedCard: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    minWidth: 0,
    gap: 18,
    borderWidth: 1,
    borderRadius: 24,
    padding: 22,
    overflow: "hidden",
  },
  lockHeader: { gap: 13 },
  lockIcon: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
  },
  lockStatus: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 99,
    paddingHorizontal: 10,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  lockTitle: { gap: 7, minWidth: 0 },
  deadline: {
    gap: 5,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 13,
    minWidth: 0,
  },
  recoveryAction: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 15,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  signOutAction: {
    alignSelf: "center",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
  },
  actionCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  actionLabel: { flex: 1, minWidth: 0, flexShrink: 1 },
  lockFootnote: { textAlign: "center" },
});

export function SessionGate({
  children,
  allowEmptyFarm = false,
  allowIncompleteSetup = false,
}: {
  children: ReactNode;
  allowEmptyFarm?: boolean;
  allowIncompleteSetup?: boolean;
}) {
  const auth = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const accountDeletionStatus = useAccountDeletionStatus(
    auth.status === "authenticated" ? auth.user?.id : undefined,
  );

  if (auth.status === "loading") return <LoadingState />;
  if (auth.status === "blocked") return <Redirect href="/device-blocked" />;
  if (auth.status === "anonymous") return <Redirect href="/login" />;
  if (auth.status === "error") {
    return (
      <AuthRecoveryState
        error={auth.error}
        errorCode={auth.errorCode}
        onRetry={auth.retrySession}
      />
    );
  }
  if (
    accountDeletionStatus.isLoading &&
    !accountDeletionStatus.data &&
    farm.status === "error"
  ) {
    return <LoadingState label="Checking your account recovery status" />;
  }
  if (accountDeletionStatus.data?.status === "scheduled") {
    return (
      <View
        style={[
          styles.lockedScreen,
          { backgroundColor: theme.background },
        ]}
      >
        <Animated.View
          entering={FadeInDown.duration(360).springify().damping(20)}
          style={styles.lockedContent}
        >
          <Card
            style={[
              styles.lockedCard,
              {
                borderColor: `${theme.danger}55`,
                borderTopColor: theme.danger,
              },
            ]}
          >
            <View style={styles.lockHeader}>
              <View
                style={[
                  styles.lockIcon,
                  { backgroundColor: `${theme.danger}18` },
                ]}
              >
                <Ionicons
                  name="pause-circle-outline"
                  size={30}
                  color={theme.danger}
                />
              </View>
              <View
                style={[
                  styles.lockStatus,
                  { backgroundColor: `${theme.danger}16` },
                ]}
              >
                <View
                  style={[styles.statusDot, { backgroundColor: theme.danger }]}
                />
                <AppText
                  size="small"
                  weight="semibold"
                  style={{ color: theme.danger }}
                >
                  ACCOUNT RECOVERY
                </AppText>
              </View>
            </View>
            <View style={styles.lockTitle}>
              <AppText size="heading" weight="semibold">
                Your farm access is on hold
              </AppText>
              <AppText tone="secondary">
                Your account is scheduled for deletion, so farm records and
                operations are temporarily unavailable. Cancel the request to
                pick up where you left off.
              </AppText>
            </View>
            {accountDeletionStatus.data.scheduled_for ? (
              <View
                style={[
                  styles.deadline,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <AppText size="small" tone="secondary">
                  PERMANENT DELETION DATE
                </AppText>
                <AppText weight="semibold">
                  {new Date(
                    accountDeletionStatus.data.scheduled_for,
                  ).toLocaleString()}
                </AppText>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace("/account-details")}
              style={({ pressed }) => [
                styles.recoveryAction,
                {
                  backgroundColor: theme.success,
                  opacity: pressed ? 0.88 : 1,
                  transform: [{ scale: pressed ? 0.99 : 1 }],
                },
              ]}
            >
              <View style={styles.actionCopy}>
                <Ionicons name="refresh-outline" size={19} color="#FFFFFF" />
                <AppText
                  weight="semibold"
                  style={[styles.actionLabel, { color: "#FFFFFF" }]}
                >
                  Review request and restore access
                </AppText>
              </View>
              <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
            </Pressable>
            <AppText size="small" tone="secondary" style={styles.lockFootnote}>
              Your farms are still recoverable during the 30-day recovery
              period.
            </AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => void auth.signOut()}
              style={({ pressed }) => [
                styles.signOutAction,
                { opacity: pressed ? 0.65 : 1 },
              ]}
            >
              <Ionicons
                name="log-out-outline"
                size={18}
                color={theme.textSecondary}
              />
              <AppText weight="semibold" tone="secondary">
                Sign out
              </AppText>
            </Pressable>
          </Card>
        </Animated.View>
      </View>
    );
  }
  if (farm.status === "initializing")
    return <LoadingState label="Loading your farm" />;
  if (farm.status === "error") {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.background,
          justifyContent: "center",
          padding: 24,
          gap: 16,
        }}
      >
        <AppText size="heading" weight="semibold">
          Farm data is unavailable
        </AppText>
        <AppText tone="secondary">
          {farm.error?.message ??
            "Check your connection and try again. If account deletion is scheduled, open Account & access to restore your farm access."}
        </AppText>
        <Button
          label="Try again"
          onPress={() => {
            void Promise.all([
              farm.refreshFarms(),
              accountDeletionStatus.refetch(),
            ]);
          }}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace("/account-details")}
          style={({ pressed }) => [
            styles.signOutAction,
            { opacity: pressed ? 0.65 : 1 },
          ]}
        >
          <AppText weight="semibold" style={{ color: theme.primary }}>
            Open account recovery
          </AppText>
          <Ionicons name="arrow-forward" size={17} color={theme.primary} />
        </Pressable>
      </View>
    );
  }

  if (
    farm.status === "ready" &&
    farm.selectedFarm?.setup_completed_at &&
    allowEmptyFarm
  )
    return <Redirect href="/(tabs)" />;
  if (farm.status === "ready" && !farm.selectedFarm?.setup_completed_at && !allowIncompleteSetup)
    return <Redirect href="/farm-setup" />;
  if (!allowEmptyFarm && farm.status === "empty")
    return <Redirect href="/farm-setup" />;
  return <>{children}</>;
}
