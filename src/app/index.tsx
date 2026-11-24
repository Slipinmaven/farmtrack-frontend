import { Redirect, router } from "expo-router";
import { View } from "react-native";

import { LoadingState } from "@/components/feedback/loading-state";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { AuthRecoveryState } from "@/components/feedback/auth-recovery-state";
import { useAccountDeletionStatus } from "@/features/auth/hooks";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

export default function IndexRoute() {
  const auth = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const accountDeletionStatus = useAccountDeletionStatus(
    auth.status === "authenticated" ? auth.user?.id : undefined,
  );
  if (auth.status === "loading") return <LoadingState />;
  if (auth.status === "blocked") return <Redirect href="/device-blocked" />;
  if (auth.status === "anonymous") return <Redirect href="/(auth)/login" />;
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
    !accountDeletionStatus.data
  ) {
    return <LoadingState label="Checking your account recovery status" />;
  }
  if (accountDeletionStatus.data?.status === "scheduled") {
    return <Redirect href="/account-details" />;
  }
  if (farm.status === "initializing")
    return <LoadingState label="Loading your farm" />;
  if (farm.status === "empty") return <Redirect href="/farm-setup" />;
  if (farm.status === "ready") return <Redirect href="/(tabs)" />;
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
        {farm.error?.message ?? "Check your connection and try again."}
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
      <Button
        label="Open account recovery"
        variant="secondary"
        onPress={() => router.replace("/account-details")}
      />
    </View>
  );
}
