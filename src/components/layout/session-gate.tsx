import type { ReactNode } from "react";
import { Redirect } from "expo-router";
import { View } from "react-native";

import { LoadingState } from "@/components/feedback/loading-state";
import { AuthRecoveryState } from "@/components/feedback/auth-recovery-state";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

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
          {farm.error?.message ?? "Check your connection and try again."}
        </AppText>
        <Button label="Try again" onPress={() => void farm.refreshFarms()} />
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
