import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { SafeAreaView, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";

export default function DeviceBlockedScreen() {
  const auth = useAuth();
  const { theme } = useTheme();

  function returnToSignIn() {
    auth.retrySession();
    router.replace("/(auth)/login");
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
    >
      <View
        style={[
          styles.icon,
          {
            backgroundColor: `${theme.danger}16`,
            borderColor: `${theme.danger}55`,
          },
        ]}
      >
        <Ionicons name="ban-outline" size={30} color={theme.danger} />
      </View>
      <View style={styles.copy}>
        <AppText size="heading" weight="semibold" style={styles.title}>
          This device is blocked
        </AppText>
        <AppText tone="secondary" style={styles.message}>
          {auth.error ??
            "This device can’t sign in to this account. If you think this is a mistake, please contact your farm administrator."}
        </AppText>
      </View>
      <View style={styles.actions}>
        <Button label="Back to sign in" onPress={returnToSignIn} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 18,
  },
  icon: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 31,
  },
  copy: { width: "100%", maxWidth: 420, alignItems: "center", gap: 8 },
  title: { textAlign: "center" },
  message: { textAlign: "center" },
  actions: { width: "100%", maxWidth: 360, gap: 9 },
});
