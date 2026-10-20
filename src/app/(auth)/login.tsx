import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { router } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { FarmTrackMark } from "@/components/branding/farmtrack-mark";
import { normalizeApiError } from "@/lib/api/errors";
import { loginSchema, type LoginFormValues } from "@/features/auth/schema";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const auth = useAuth();
  const { theme } = useTheme();
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  async function submit(values: LoginFormValues) {
    try {
      await signIn(values);
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
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandRow}>
          <FarmTrackMark size={48} />
          <AppText size="heading" weight="semibold">
            FarmTrack
          </AppText>
        </View>
        <View style={styles.form}>
          <View style={{ gap: 4 }}>
            <AppText size="title" weight="semibold">
              Welcome back
            </AppText>
            <AppText tone="secondary">Sign in to manage your farm.</AppText>
          </View>
          {auth.status === "error" ? (
            <View style={{ gap: 8 }}>
              <AppText style={{ color: theme.danger }}>{auth.error}</AppText>
              <Button
                label="Retry session"
                variant="secondary"
                onPress={auth.retrySession}
              />
            </View>
          ) : null}
          <Controller
            control={form.control}
            name="email"
            render={({ field, fieldState }) => (
              <TextField
                label="Email address"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <TextField
                label="Password"
                secureTextEntry
                autoComplete="password"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
          {form.formState.errors.root?.message ? (
            <AppText style={{ color: theme.danger }}>
              {form.formState.errors.root.message}
            </AppText>
          ) : null}
          <Button
            label="Sign in"
            loading={form.formState.isSubmitting}
            onPress={form.handleSubmit(submit)}
          />
        </View>
        <AppText size="small" tone="secondary" style={styles.footer}>
          Farm operations, clearly in hand.
        </AppText>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    justifyContent: "center",
    padding: 24,
    gap: 48,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  form: { gap: 20 },
  footer: { textAlign: "center" },
});
