import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { router, useLocalSearchParams } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type ScrollViewInstance,
  type TextInputInstance,
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
  const params = useLocalSearchParams<{
    deletionPending?: string | string[];
    email?: string | string[];
  }>();
  const initialEmail = Array.isArray(params.email) ? params.email[0] : params.email;
  const pendingParam = Array.isArray(params.deletionPending)
    ? params.deletionPending[0]
    : params.deletionPending;
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [accountDeletionPending, setAccountDeletionPending] = useState(
    pendingParam === "true",
  );
  const emailInput = useRef<TextInputInstance>(null);
  const passwordInput = useRef<TextInputInstance>(null);
  const scrollView = useRef<ScrollViewInstance>(null);
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: initialEmail ?? "", password: "" },
  });

  useEffect(() => {
    if (auth.errorCode === "ACCOUNT_DELETION_PENDING") {
      setAccountDeletionPending(true);
      form.setError("root", {
        message: auth.error ?? "Restore this account before signing in.",
      });
    }
  }, [auth.error, auth.errorCode, form]);

  async function submit(values: LoginFormValues) {
    try {
      await auth.signIn(values);
    } catch (error) {
      const apiError = normalizeApiError(error);
      if (apiError.code === "DEVICE_BLOCKED") {
        router.replace("/device-blocked");
        return;
      }
      setAccountDeletionPending(
        apiError.code === "ACCOUNT_DELETION_PENDING",
      );
      form.setError("root", { message: apiError.message });
    }
  }

  function scrollInputIntoView(input: TextInputInstance | null) {
    if (Platform.OS !== "android" || !input) return;

    setTimeout(() => {
      scrollView.current?.scrollResponderScrollNativeHandleToKeyboard(
        input,
        24,
        true,
      );
    }, 350);
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
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
                <AppText
                  size="small"
                  weight="semibold"
                  tone="muted"
                  style={styles.eyebrow}
                >
                  FARM MANAGEMENT
                </AppText>
                <AppText size="title" weight="semibold" style={styles.title}>
                  Welcome back
                </AppText>
                <AppText size="body" tone="secondary">
                  Sign in to continue to your farm workspace.
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
                    ref={emailInput}
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
                      setAccountDeletionPending(false);
                    }}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onFocus={() => scrollInputIntoView(emailInput.current)}
                    onSubmitEditing={() => passwordInput.current?.focus()}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="password"
                render={({ field, fieldState }) => (
                  <TextField
                    ref={passwordInput}
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
                      setAccountDeletionPending(false);
                    }}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    returnKeyType="done"
                    onFocus={() => scrollInputIntoView(passwordInput.current)}
                    onSubmitEditing={() => {
                      void form.handleSubmit(submit)();
                    }}
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
                onPress={() => {
                  void form.handleSubmit(submit)();
                }}
                style={styles.signInButton}
              />
              {accountDeletionPending ? (
                <Button
                  label="Restore scheduled account deletion"
                  variant="secondary"
                  onPress={() =>
                    router.push({
                      pathname: "/restore-account",
                      params: { email: form.getValues("email") },
                    })
                  }
                />
              ) : null}
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
    paddingTop: 24,
    paddingBottom: 32,
  },
  column: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    gap: 24,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  brandMark: {
    width: 62,
    height: 62,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  brandCopy: { gap: 1 },
  loginCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    gap: 20,
    shadowColor: "#10251B",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  cardHeading: {
    gap: 2,
  },
  welcomeCopy: { gap: 4 },
  eyebrow: { letterSpacing: 1.1, marginBottom: 2 },
  title: { letterSpacing: -0.7 },
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
  form: { gap: 16 },
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
