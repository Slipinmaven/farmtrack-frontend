import type { ComponentType } from "react";

import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppDialogProvider } from "@/components/ui/app-dialog";
import { ApiWakeupNotice } from "@/components/feedback/api-wakeup-notice";
import { AssistantChatBubble } from "@/components/layout/assistant-chat-bubble";
import { queryClient } from "@/lib/query/client";
import { AuthProvider } from "@/providers/auth-provider";
import { AssistantBubblePreferenceProvider } from "@/providers/assistant-bubble-preference";
import { FarmProvider } from "@/providers/farm-provider";
import { AppLockGuard } from "@/providers/app-lock-guard";
import { ThemeProvider, useTheme } from "@/providers/theme-provider";
import { PaymentMessageImportProvider } from "@/features/payment-message-import/PaymentMessageImportProvider";

let AndroidAppUpdateChecker: ComponentType | null = null;

if (Platform.OS === "android") {
  AndroidAppUpdateChecker = require(
    "@/features/app-updates/android-app-update-checker",
  ).AndroidAppUpdateChecker;
}

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
      {AndroidAppUpdateChecker ? <AndroidAppUpdateChecker /> : null}
      <PaymentMessageImportProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.background },
          }}
        />
        <AssistantChatBubble />
      </PaymentMessageImportProvider>
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
              <AssistantBubblePreferenceProvider>
                <AppDialogProvider>
                  <AppLockGuard>
                    <AppRoutes />
                  </AppLockGuard>
                </AppDialogProvider>
              </AssistantBubblePreferenceProvider>
            </ThemeProvider>
          </FarmProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
