import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/app-text";
import { TextField } from "@/components/ui/text-field";
import { useTheme } from "@/providers/theme-provider";

type DeletionConfirmationSheetProps = {
  visible: boolean;
  title: string;
  subject: string;
  description: string;
  recoveryDescription: string;
  confirmationPhrase: string;
  onDismiss: () => void;
  onConfirm: (password: string) => Promise<boolean>;
  busy?: boolean;
  error?: string | null;
};

const RECOVERY_DAYS = 30;

export function DeletionConfirmationSheet({
  visible,
  title,
  subject,
  description,
  recoveryDescription,
  confirmationPhrase,
  onDismiss,
  onConfirm,
  busy = false,
  error,
}: DeletionConfirmationSheetProps) {
  const { theme } = useTheme();
  const [password, setPassword] = useState("");
  const [phrase, setPhrase] = useState("");
  const phraseComplete =
    phrase.trim().toLowerCase() === confirmationPhrase.trim().toLowerCase();
  const passwordComplete = password.length > 0;
  const canConfirm = phraseComplete && passwordComplete;
  const completedChecks = Number(phraseComplete) + Number(passwordComplete);

  function dismiss() {
    if (busy) return;
    setPassword("");
    setPhrase("");
    onDismiss();
  }

  async function confirm() {
    if (!canConfirm || busy) return;
    const succeeded = await onConfirm(password);
    if (succeeded) {
      setPassword("");
      setPhrase("");
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close deletion confirmation"
          disabled={busy}
          onPress={dismiss}
          style={styles.scrim}
        />
        <SafeAreaView
          edges={["bottom"]}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.background,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
          >
            <Animated.View entering={FadeInUp.duration(240)} style={styles.body}>
              <View
                style={[
                  styles.eyebrow,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={15}
                  color={theme.secondary}
                />
                <AppText size="small" weight="semibold">
                  DELETION REVIEW
                </AppText>
              </View>
              <AppText size="title" weight="semibold">
                {title}
              </AppText>
              <AppText tone="secondary">{description}</AppText>

              <View
                style={[
                  styles.recoveryCard,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.daysBadge,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <AppText
                    size="title"
                    weight="semibold"
                    style={{ color: theme.text }}
                  >
                    {RECOVERY_DAYS}
                  </AppText>
                  <AppText size="small" tone="secondary">
                    DAYS
                  </AppText>
                </View>
                <View style={styles.recoveryCopy}>
                  <AppText weight="semibold">Recovery period</AppText>
                  <AppText size="small" tone="secondary">
                    {recoveryDescription}
                  </AppText>
                </View>
              </View>

              <View
                style={[
                  styles.subjectCard,
                  { borderLeftColor: theme.secondary },
                ]}
              >
                <AppText size="small" tone="secondary">
                  This request applies to
                </AppText>
                <AppText weight="semibold" numberOfLines={2}>
                  {subject}
                </AppText>
                <AppText size="small" tone="secondary">
                  The request takes effect immediately and is not permanent
                  until the recovery period ends.
                </AppText>
              </View>

              <View
                style={[
                  styles.identitySection,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
              >
                <View style={styles.sectionHeading}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={20}
                    color={theme.danger}
                  />
                  <AppText weight="semibold">Confirm this is intentional</AppText>
                </View>
                <AppText size="small" tone="secondary">
                  Type <AppText weight="semibold">{confirmationPhrase}</AppText>{" "}
                  exactly, then enter your current password.
                </AppText>
                <View style={styles.checklist}>
                  <View
                    style={[
                      styles.checklistMark,
                      {
                        backgroundColor: phraseComplete
                          ? theme.success
                          : theme.backgroundSelected,
                      },
                    ]}
                  >
                    {phraseComplete ? (
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    ) : (
                      <AppText
                        size="small"
                        weight="semibold"
                        style={{ color: theme.textSecondary }}
                      >
                        1
                      </AppText>
                    )}
                  </View>
                  <View style={styles.checklistTrack} />
                  <View
                    style={[
                      styles.checklistMark,
                      {
                        backgroundColor: passwordComplete
                          ? theme.success
                          : theme.backgroundSelected,
                      },
                    ]}
                  >
                    {passwordComplete ? (
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    ) : (
                      <AppText
                        size="small"
                        weight="semibold"
                        style={{ color: theme.textSecondary }}
                      >
                        2
                      </AppText>
                    )}
                  </View>
                  <AppText size="small" tone="secondary">
                    {completedChecks} of 2 checks complete
                  </AppText>
                </View>
                <TextField
                  label={`Type ${confirmationPhrase} to continue`}
                  value={phrase}
                  onChangeText={setPhrase}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!busy}
                  returnKeyType="next"
                />
                <TextField
                  label="Current password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  editable={!busy}
                  returnKeyType="done"
                />
              </View>

              {error ? (
                <View
                  style={[
                    styles.errorCard,
                    { backgroundColor: `${theme.danger}12` },
                  ]}
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={18}
                    color={theme.danger}
                  />
                  <AppText size="small" style={{ color: theme.danger, flex: 1 }}>
                    {error}
                  </AppText>
                </View>
              ) : null}
            </Animated.View>
          </ScrollView>

          <View
            style={[
              styles.footer,
              {
                backgroundColor: theme.background,
                borderTopColor: theme.border,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Keep everything and close"
              disabled={busy}
              onPress={dismiss}
              style={({ pressed }) => [
                styles.keepButton,
                {
                  opacity: busy ? 0.48 : pressed ? 0.65 : 1,
                },
              ]}
            >
              <Ionicons
                name="arrow-back-outline"
                size={18}
                color={theme.textSecondary}
              />
              <AppText weight="semibold" style={{ color: theme.textSecondary }}>
                Keep everything
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Schedule deletion"
              accessibilityState={{
                disabled: !canConfirm || busy,
                busy,
              }}
              disabled={!canConfirm || busy}
              onPress={() => void confirm()}
              style={({ pressed }) => [
                styles.deleteButton,
                {
                  backgroundColor: canConfirm
                    ? theme.danger
                    : theme.backgroundSelected,
                  borderColor: canConfirm ? theme.danger : theme.border,
                  opacity: pressed && canConfirm ? 0.88 : 1,
                  transform: [{ scale: pressed && canConfirm ? 0.99 : 1 }],
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Ionicons
                  name={canConfirm ? "trash-outline" : "lock-closed-outline"}
                  size={19}
                  color={canConfirm ? "#FFFFFF" : theme.textSecondary}
                />
              )}
              <View style={styles.deleteButtonCopy}>
                <AppText
                  weight="semibold"
                  style={{
                    color: canConfirm ? "#FFFFFF" : theme.textSecondary,
                    textAlign: "center",
                  }}
                >
                  {busy ? "Scheduling…" : "Schedule deletion"}
                </AppText>
                {!canConfirm && !busy ? (
                  <AppText
                    size="small"
                    style={{ color: theme.textSecondary, textAlign: "center" }}
                  >
                    Complete both checks to continue
                  </AppText>
                ) : null}
              </View>
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(13, 22, 18, 0.58)",
  },
  sheet: {
    maxHeight: "92%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 3,
    marginTop: 10,
  },
  content: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 16,
  },
  body: { gap: 16 },
  eyebrow: {
    alignSelf: "flex-start",
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 99,
    paddingHorizontal: 10,
  },
  recoveryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  daysBadge: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  recoveryCopy: { flex: 1, gap: 5 },
  subjectCard: {
    gap: 6,
    borderLeftWidth: 3,
    borderRadius: 10,
    padding: 12,
    backgroundColor: "rgba(130, 130, 130, 0.06)",
  },
  identitySection: {
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  checklist: { flexDirection: "row", alignItems: "center", gap: 8 },
  checklistMark: {
    width: 23,
    height: 23,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  checklistTrack: {
    width: 20,
    height: 1,
    backgroundColor: "#84918A",
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    padding: 12,
  },
  footer: {
    gap: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  keepButton: {
    alignSelf: "center",
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  deleteButton: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  deleteButtonCopy: {
    flexShrink: 1,
    alignItems: "center",
  },
});
