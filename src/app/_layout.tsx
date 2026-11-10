import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppDialogProvider } from "@/components/ui/app-dialog";
import { ApiWakeupNotice } from "@/components/feedback/api-wakeup-notice";
import { queryClient } from "@/lib/query/client";
import { AuthProvider } from "@/providers/auth-provider";
import { FarmProvider } from "@/providers/farm-provider";
import { AppLockGuard } from "@/providers/app-lock-guard";
import { ThemeProvider, useTheme } from "@/providers/theme-provider";
import { AndroidAppUpdateChecker } from "@/features/app-updates/android-app-update-checker";

let Notifications: typeof import("expo-notifications") | null = null;

if (Platform.OS !== "web") {
  try {
    Notifications = require("expo-notifications");
    if (Notifications) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    }
  } catch (error) {
    console.warn(
      "expo-notifications is unavailable in this runtime; local reminder support will be disabled until a native build is used.",
      error,
    );
  }
}

function AppRoutes() {
  const { theme } = useTheme();
  return (
    <>
      <StatusBar style={theme.mode === "dark" ? "light" : "dark"} />
      <ApiWakeupNotice />
      <AndroidAppUpdateChecker />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <FarmProvider>
            <ThemeProvider>
              <AppDialogProvider>
                <AppLockGuard>
                  <AppRoutes />
                </AppLockGuard>
              </AppDialogProvider>
            </ThemeProvider>
          </FarmProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
