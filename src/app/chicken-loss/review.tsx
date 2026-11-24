import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TextField } from "@/components/ui/text-field";
import type { ChickenLossReason } from "@/features/chickens/api";
import { useCreateChickenLoss } from "@/features/chickens/hooks";
import {
  clearChickenLossDraft,
  getChickenLossDraft,
  setChickenLossDraft,
  type ChickenLossDraft,
  type ChickenLossDraftItem,
} from "@/features/chickens/loss-draft";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

const reasons: { value: ChickenLossReason; label: string }[] = [
  { value: "disease", label: "Disease" },
  { value: "natural_death", label: "Natural death" },
  { value: "predator", label: "Predator" },
  { value: "injury", label: "Injury" },
  { value: "accident", label: "Accident" },
  { value: "culling", label: "Culling" },
  { value: "missing", label: "Missing" },
  { value: "other", label: "Other" },
];

export default function ChickenLossReviewScreen() {
  return (
    <SessionGate>
      <ChickenLossReviewContent />
    </SessionGate>
  );
}

function ChickenLossReviewContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const farmId = farm.selectedFarm?.id;
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const createLoss = useCreateChickenLoss(user?.id ?? "", farmId ?? "");
  const [draft, setDraft] = useState<ChickenLossDraft | null>(
    getChickenLossDraft,
  );
  const [error, setError] = useState<string | null>(null);
  const totalQuantity = useMemo(
    () =>
      draft?.items.reduce((total, item) => total + item.quantity, 0) ?? 0,
    [draft],
  );

  function updateDraft(nextDraft: ChickenLossDraft) {
    setChickenLossDraft(nextDraft);
    setDraft(nextDraft);
    setError(null);
  }

  function updateItem(
    itemId: string,
    update: Partial<ChickenLossDraftItem>,
  ) {
    if (!draft) return;
    updateDraft({
      ...draft,
      items: draft.items.map((item) =>
        item.id === itemId ? { ...item, ...update } : item,
      ),
    });
  }

  async function saveLosses() {
    if (!draft?.items.length) {
      setError("No loss entries to record. Return and select at least one batch.");
      return;
    }
    const invalid = draft.items.find(
      (item) =>
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > item.available,
    );
    if (invalid) {
      setError(
        `Enter a quantity from 1 to ${invalid.available} for ${invalid.batch_name} in ${invalid.block_name}.`,
      );
      return;
    }
    setError(null);
    try {
      await createLoss.mutateAsync({
        loss_date: draft.loss_date,
        items: draft.items.map((item) => ({
          batch_id: item.batch_id,
          block_id: item.block_id,
          quantity: item.quantity,
          reason: item.reason,
          notes: item.notes.trim() || undefined,
        })),
      });
      clearChickenLossDraft();
      await dialog.showDialog({
        title: "Loss recorded",
        message: `${totalQuantity} ${
          totalQuantity === 1 ? "chicken was" : "chickens were"
        } removed from flock inventory across ${
          new Set(draft.items.map((item) => item.block_id)).size
        } ${
          new Set(draft.items.map((item) => item.block_id)).size === 1
            ? "block"
            : "blocks"
        }.`,
        tone: "success",
      });
      router.replace("/(tabs)/flock");
    } catch (submitError: unknown) {
      setError(normalizeApiError(submitError).message);
    }
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <FarmPageHeader title="Flock" showBack />
          {draft ? (
            <>
              <Card
                style={[
                  styles.reviewHero,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                    borderLeftColor: theme.danger,
                  },
                ]}
              >
                <View style={styles.reviewHeroTop}>
                  <View
                    style={[
                      styles.reviewHeroIcon,
                      { backgroundColor: `${theme.danger}16` },
                    ]}
                  >
                    <Ionicons
                      name="clipboard-outline"
                      size={22}
                      color={theme.danger}
                    />
                  </View>
                  <View style={styles.reviewHeroCopy}>
                    <AppText size="heading" weight="semibold">
                      Review loss
                    </AppText>
                    <AppText size="small" tone="secondary">
                      Check each batch before recording.
                    </AppText>
                  </View>
                </View>
                <View
                  style={[
                    styles.reviewTotal,
                    { borderTopColor: theme.border },
                  ]}
                >
                  <AppText size="heading" weight="semibold">
                    {totalQuantity}{" "}
                    <AppText size="body">
                      {totalQuantity === 1 ? "bird" : "birds"}
                    </AppText>
                  </AppText>
                  <AppText size="small" tone="secondary">
                    {draft.items.length}{" "}
                    {draft.items.length === 1 ? "entry" : "entries"}
                  </AppText>
                </View>
              </Card>

              <Card style={styles.section}>
                <View style={styles.sectionHeading}>
                  <View
                    style={[
                      styles.sectionIcon,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      color={theme.primary}
                    />
                  </View>
                  <View style={styles.sectionHeadingCopy}>
                    <AppText weight="semibold">Loss date</AppText>
                    <AppText size="small" tone="secondary">
                      When did it happen?
                    </AppText>
                  </View>
                </View>
                <DatePickerField
                  label="Loss date"
                  value={draft.loss_date}
                  onChange={(loss_date) => updateDraft({ ...draft, loss_date })}
                />
              </Card>

              <View style={styles.entries}>
                {draft.items.map((item, index) => (
                  <LossReviewCard
                    key={item.id}
                    item={item}
                    index={index + 1}
                    lossDate={draft.loss_date}
                    onChange={(update) => updateItem(item.id, update)}
                    onRemove={() =>
                      updateDraft({
                        ...draft,
                        items: draft.items.filter(
                          (entry) => entry.id !== item.id,
                        ),
                      })
                    }
                  />
                ))}
              </View>
              {draft.items.length === 0 ? (
                <Card style={styles.emptyState}>
                  <AppText weight="semibold">No entries left to review</AppText>
                  <AppText size="small" tone="secondary">
                    Go back and select the batch and block stock to record.
                  </AppText>
                </Card>
              ) : null}
              {error ? (
                <Card
                  style={[
                    styles.errorCard,
                    { borderColor: theme.danger, backgroundColor: theme.background },
                  ]}
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={18}
                    color={theme.danger}
                  />
                  <AppText size="small" style={styles.errorText}>
                    {error}
                  </AppText>
                </Card>
              ) : null}
              <View style={styles.actions}>
                <Button
                  label="Back to selection"
                  variant="secondary"
                  onPress={() => router.back()}
                />
                <Button
                  label={
                    createLoss.isPending
                      ? "Recording losses…"
                      : `Record ${totalQuantity} ${
                          totalQuantity === 1 ? "loss" : "losses"
                        }`
                  }
                  loading={createLoss.isPending}
                  disabled={
                    createLoss.isPending ||
                    draft.items.length === 0 ||
                    totalQuantity === 0
                  }
                  onPress={() => void saveLosses()}
                />
              </View>
            </>
          ) : (
            <Card style={styles.emptyState}>
              <AppText weight="semibold">Your loss selection is unavailable</AppText>
              <AppText size="small" tone="secondary">
                Return to the flock screen and start a new loss record.
              </AppText>
              <Button
                label="Return to flock"
                onPress={() => router.replace("/(tabs)/flock")}
              />
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LossReviewCard({
  item,
  index,
  lossDate,
  onChange,
  onRemove,
}: {
  item: ChickenLossDraftItem;
  index: number;
  lossDate: string;
  onChange: (update: Partial<ChickenLossDraftItem>) => void;
  onRemove: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Card style={styles.lossCard}>
      <View style={styles.lossHeading}>
        <View
          style={[
            styles.indexBadge,
            { backgroundColor: `${theme.primary}18` },
          ]}
        >
          <AppText
            size="small"
            weight="semibold"
            style={{ color: theme.primary }}
          >
            {index}
          </AppText>
        </View>
        <View style={styles.lossHeadingCopy}>
          <AppText weight="semibold">{item.batch_name}</AppText>
          <AppText size="small" tone="secondary">
            {item.block_name} · {formatChickenType(item.chicken_type)} · Age{" "}
            {formatBatchAge(item.hatch_date, lossDate)}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.batch_name} in ${item.block_name}`}
          onPress={onRemove}
          style={styles.removeButton}
        >
          <Ionicons name="trash-outline" size={18} color={theme.danger} />
        </Pressable>
      </View>

      <View style={styles.quantityAndReason}>
        <TextField
          label={`Number lost (up to ${item.available})`}
          value={item.quantity ? String(item.quantity) : ""}
          onChangeText={(value) => {
            const numeric = value.replace(/[^\d]/g, "");
            onChange({
              quantity: numeric
                ? Math.min(Number(numeric), item.available)
                : 0,
            });
          }}
          keyboardType="number-pad"
          placeholder={`1–${item.available}`}
          style={styles.quantityInput}
        />
        <View style={styles.reasonGroup}>
          <AppText size="small" weight="semibold">
            Reason
          </AppText>
          <View style={styles.reasonGrid}>
            {reasons.map((reason) => {
              const selected = reason.value === item.reason;
              return (
                <Pressable
                  key={reason.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => onChange({ reason: reason.value })}
                  style={[
                    styles.reasonOption,
                    {
                      borderColor: selected ? theme.primary : theme.border,
                      backgroundColor: selected
                        ? `${theme.primary}12`
                        : theme.background,
                    },
                  ]}
                >
                  <AppText
                    size="small"
                    weight={selected ? "semibold" : "regular"}
                    style={{
                      color: selected ? theme.primary : theme.text,
                    }}
                  >
                    {reason.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      <TextField
        label="Notes (optional)"
        placeholder="Add details about this loss"
        value={item.notes}
        onChangeText={(notes) => onChange({ notes })}
        multiline
        textAlignVertical="top"
        style={styles.notesInput}
      />
    </Card>
  );
}

function formatBatchAge(hatchDate: string | null, onDate: string): string {
  if (!hatchDate) return "unknown";
  const hatch = new Date(`${hatchDate}T00:00:00`);
  const referenceDate = new Date(`${onDate}T00:00:00`);
  if (
    Number.isNaN(hatch.getTime()) ||
    Number.isNaN(referenceDate.getTime())
  ) {
    return "unknown";
  }
  const days = Math.max(
    0,
    Math.floor((referenceDate.getTime() - hatch.getTime()) / 86_400_000),
  );
  const weeks = Math.floor(days / 7);
  const remainingDays = days % 7;
  if (weeks === 0) return `${days} ${days === 1 ? "day" : "days"}`;
  return `${weeks} ${weeks === 1 ? "week" : "weeks"}${
    remainingDays
      ? ` ${remainingDays} ${remainingDays === 1 ? "day" : "days"}`
      : ""
  }`;
}

function formatChickenType(type: ChickenLossDraftItem["chicken_type"]): string {
  return type === "kienyeji"
    ? "Kienyeji"
    : type.charAt(0).toUpperCase() + type.slice(1);
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 40,
    gap: 14,
  },
  reviewHero: {
    gap: 14,
    borderLeftWidth: 4,
  },
  reviewHeroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  reviewHeroIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  reviewHeroCopy: { flex: 1, minWidth: 0, gap: 2 },
  reviewTotal: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  section: { gap: 12 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  sectionHeadingCopy: { flex: 1, minWidth: 0, gap: 2 },
  entries: { gap: 12 },
  lossCard: { gap: 14 },
  lossHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  indexBadge: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  lossHeadingCopy: { flex: 1, minWidth: 0, gap: 2 },
  removeButton: { padding: 8 },
  quantityAndReason: { gap: 14 },
  quantityInput: { width: "100%" },
  reasonGroup: { gap: 8 },
  reasonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reasonOption: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 11,
    borderWidth: 1,
    borderRadius: 8,
  },
  notesInput: { minHeight: 76 },
  emptyState: { alignItems: "center", gap: 10, paddingVertical: 24 },
  actions: { gap: 10, marginTop: 4 },
  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
  },
  errorText: { flex: 1 },
});
