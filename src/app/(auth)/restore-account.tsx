import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { restoreAccountDeletion } from "@/features/auth/api";
import { normalizeApiError } from "@/lib/api/errors";
import { useTheme } from "@/providers/theme-provider";

export default function RestoreAccountScreen() {
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const initialEmail = Array.isArray(params.email) ? params.email[0] : params.email;
  const dialog = useAppDialog();
  const { theme } = useTheme();
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function restore() {
    if (!email.trim() || !password || saving) {
      setError("Enter your account email and password.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await restoreAccountDeletion(email.trim(), password);
      setPassword("");
      await dialog.showDialog({
        title: "Account restored",
        message:
          "Your account and owned farms have been restored. Sign in to continue.",
        tone: "success",
      });
      router.replace("/(auth)/login");
    } catch (requestError: unknown) {
      setError(normalizeApiError(requestError).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <FarmPageHeader title="Restore account" showBack />
          <Card style={styles.card}>
            <AppText size="small" tone="secondary">
              Enter your password to cancel account deletion. You can restore
              the account and its farms within 30 days of the request.
            </AppText>
            <TextField
              label="Email address"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
            />
            {error ? (
              <AppText accessibilityRole="alert" style={{ color: theme.danger }}>
                {error}
              </AppText>
            ) : null}
            <View style={styles.actions}>
              <Button
                label="Restore account"
                loading={saving}
                onPress={() => void restore()}
              />
              <Button
                label="Back to sign in"
                variant="secondary"
                disabled={saving}
                onPress={() => router.replace("/(auth)/login")}
              />
            </View>
          </Card>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    padding: 20,
    gap: 16,
  },
  card: { gap: 14 },
  actions: { gap: 8 },
});
