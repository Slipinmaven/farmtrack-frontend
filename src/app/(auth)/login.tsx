import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { FarmTrackMark } from "@/components/branding/farmtrack-mark";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { loginSchema, type LoginFormValues } from "@/features/auth/schema";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";

export default function LoginScreen() {
  const auth = useAuth();
  const { theme } = useTheme();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function submit(values: LoginFormValues) {
    try {
      await auth.signIn(values);
    } catch (error) {
      const apiError = normalizeApiError(error);
      if (apiError.code === "DEVICE_BLOCKED") {
        router.replace("/device-blocked");
        return;
      }
      form.setError("root", { message: apiError.message });
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.column}>
          <View style={styles.brandRow}>
            <View
              style={[
                styles.brandMark,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}
            >
              <FarmTrackMark size={42} />
            </View>
            <View style={styles.brandCopy}>
              <AppText size="body" weight="semibold">
                FarmTrack
              </AppText>
              <AppText size="small" tone="secondary">
                FARM MANAGEMENT
              </AppText>
            </View>
          </View>

          <View
            style={[
              styles.loginCard,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.cardHeading}>
              <View style={styles.welcomeCopy}>
                <AppText size="title" weight="semibold" style={styles.title}>
                  Welcome back
                </AppText>
                <AppText size="body" tone="secondary">
                  Sign in to stay close to your farm.
                </AppText>
              </View>
              <View
                style={[
                  styles.secureBadge,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <Ionicons name="shield-checkmark-outline" size={16} color={theme.primary} />
                <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                  SECURE
                </AppText>
              </View>
            </View>

            {auth.status === "error" ? (
              <View
                style={[
                  styles.sessionNotice,
                  { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
                ]}
              >
                <Ionicons
                  name="cloud-offline-outline"
                  size={19}
                  color={theme.danger}
                />
                <View style={styles.noticeCopy}>
                  <AppText size="small" weight="semibold">
                    Session unavailable
                  </AppText>
                  <AppText size="small" style={{ color: theme.danger }}>
                    {auth.error}
                  </AppText>
                  <Button
                    label="Retry connection"
                    variant="secondary"
                    onPress={auth.retrySession}
                    style={styles.retryButton}
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.form}>
              <Controller
                control={form.control}
                name="email"
                render={({ field, fieldState }) => (
                  <TextField
                    label="Email address"
                    leadingIcon="mail-outline"
                    placeholder="you@example.com"
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    autoCorrect={false}
                    value={field.value}
                    onChangeText={(value) => {
                      field.onChange(value);
                      form.clearErrors("root");
                    }}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    returnKeyType="next"
                  />
                )}
              />
              <Controller
                control={form.control}
                name="password"
                render={({ field, fieldState }) => (
                  <TextField
                    label="Password"
                    leadingIcon="lock-closed-outline"
                    placeholder="Enter your password"
                    secureTextEntry={!passwordVisible}
                    trailingAction={{
                      icon: passwordVisible ? "eye-off-outline" : "eye-outline",
                      accessibilityLabel: passwordVisible
                        ? "Hide password"
                        : "Show password",
                      onPress: () => setPasswordVisible((visible) => !visible),
                    }}
                    autoComplete="password"
                    autoCapitalize="none"
                    value={field.value}
                    onChangeText={(value) => {
                      field.onChange(value);
                      form.clearErrors("root");
                    }}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    returnKeyType="done"
                    onSubmitEditing={form.handleSubmit(submit)}
                  />
                )}
              />

              {form.formState.errors.root?.message ? (
                <View
                  accessibilityRole="alert"
                  style={[
                    styles.errorNotice,
                    { backgroundColor: `${theme.danger}12` },
                  ]}
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={18}
                    color={theme.danger}
                  />
                  <AppText
                    size="small"
                    style={[styles.errorText, { color: theme.danger }]}
                  >
                    {form.formState.errors.root.message}
                  </AppText>
                </View>
              ) : null}

              <Button
                label="Sign in"
                loading={form.formState.isSubmitting}
                onPress={form.handleSubmit(submit)}
                style={styles.signInButton}
              />
            </View>

            <View style={[styles.cardDivider, { backgroundColor: theme.border }]} />
            <View style={styles.privacyNote}>
              <Ionicons name="lock-closed-outline" size={15} color={theme.textSecondary} />
              <AppText size="small" tone="secondary">
                Your farm workspace is protected.
              </AppText>
            </View>
          </View>

          <View style={styles.footer}>
            <AppText size="small" tone="secondary" style={styles.footerText}>
              Farm operations, clearly in hand.
            </AppText>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  column: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    gap: 28,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  brandMark: {
    width: 58,
    height: 58,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  brandCopy: { gap: 2 },
  loginCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 24,
    gap: 22,
    shadowColor: "#10251B",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  cardHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  welcomeCopy: { flex: 1, gap: 6 },
  title: { letterSpacing: -0.5 },
  secureBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
  },
  sessionNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  noticeCopy: { flex: 1, gap: 6 },
  retryButton: { alignSelf: "flex-start", minHeight: 40 },
  form: { gap: 18 },
  errorNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 11,
    borderRadius: 10,
  },
  errorText: { flex: 1, color: "#8C2924" },
  signInButton: { minHeight: 54, borderRadius: 12 },
  cardDivider: { height: StyleSheet.hairlineWidth },
  privacyNote: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
  },
  footer: { alignItems: "center" },
  footerText: { textAlign: "center" },
});
