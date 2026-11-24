import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TimePickerField } from "@/components/ui/time-picker-field";
import {
  useChickenPurchaseDetails,
  useChickenSaleDetails,
} from "@/features/chickens/hooks";
import { formatMoneyValue } from "@/features/chickens/purchase-pricing";
import {
  useCompleteReminder,
  useReminder,
  useReopenReminder,
  useRescheduleReminder,
} from "@/features/reminders/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

export default function ReminderDetailsRoute() {
  return (
    <SessionGate>
      <ReminderDetailsContent />
    </SessionGate>
  );
}

function ReminderDetailsContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const { reminderId } = useLocalSearchParams<{ reminderId: string }>();
  const farmId = farm.selectedFarm?.id;
  const timezone = farm.selectedFarm?.settings?.timezone ?? theme.timezone;
  const reminderQuery = useReminder(
    user?.id,
    farmId,
    reminderId,
  );
  const reminder = reminderQuery.data;
  const isSaleReminder =
    reminder?.related_entity_type === "sale_transaction" ||
    reminder?.title.toLowerCase().includes("chicken sale balance");
  const relatedTransactionId =
    reminder?.related_entity_type === "transaction" ||
    reminder?.related_entity_type === "sale_transaction"
      ? reminder.related_entity_id
      : null;
  const purchaseQuery = useChickenPurchaseDetails(
    user?.id,
    farmId,
    relatedTransactionId && !isSaleReminder ? relatedTransactionId : undefined,
  );
  const saleQuery = useChickenSaleDetails(
    user?.id,
    farmId,
    relatedTransactionId && isSaleReminder ? relatedTransactionId : undefined,
  );
  const completeMutation = useCompleteReminder(
    user?.id ?? "",
    farmId ?? "",
    reminderId,
  );
  const reopenMutation = useReopenReminder(
    user?.id ?? "",
    farmId ?? "",
    reminderId,
  );
  const rescheduleMutation = useRescheduleReminder(
    user?.id ?? "",
    farmId ?? "",
    reminderId,
  );
  const [now, setNow] = useState(() => new Date());
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [customDate, setCustomDate] = useState(() => farmDate(new Date(), timezone));
  const [customTime, setCustomTime] = useState(() => farmTime(new Date(), timezone));
  const [actionError, setActionError] = useState<string | null>(null);
  const purchase = purchaseQuery.data;
  const sale = saleQuery.data;
  const linkedTransaction = purchase?.transaction ?? sale?.transaction;
  const balanceDue = Number(linkedTransaction?.balance_due ?? 0);
  const contactName = purchase?.supplier_name ?? sale?.customer_name ?? null;
  const transactionReference = linkedTransaction?.reference_number ?? null;
  const linkedBalanceQuery = isSaleReminder ? saleQuery : purchaseQuery;
  const refetchLinkedBalance = linkedBalanceQuery.refetch;
  const canCompleteReminder =
    !relatedTransactionId ||
    (Boolean(linkedTransaction) &&
      !linkedBalanceQuery.isLoading &&
      !linkedBalanceQuery.isFetching &&
      !linkedBalanceQuery.isError &&
      Number.isFinite(balanceDue) &&
      balanceDue <= 0);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!relatedTransactionId) return;
      void refetchLinkedBalance();
    }, [refetchLinkedBalance, relatedTransactionId]),
  );

  const statusPresentation = useMemo(
    () => getReminderStatus(reminder, now),
    [reminder, now],
  );

  async function snoozeUntil(value: string) {
    setActionError(null);
    try {
      await rescheduleMutation.mutateAsync(value);
      setSnoozeOpen(false);
      await reminderQuery.refetch();
    } catch (error: unknown) {
      setActionError(normalizeApiError(error).message);
    }
  }

  async function markDone() {
    if (!canCompleteReminder) return;
    setActionError(null);
    try {
      await completeMutation.mutateAsync();
      await reminderQuery.refetch();
    } catch (error: unknown) {
      setActionError(normalizeApiError(error).message);
    }
  }

  async function undoDone() {
    setActionError(null);
    try {
      await reopenMutation.mutateAsync();
      await reminderQuery.refetch();
    } catch (error: unknown) {
      setActionError(normalizeApiError(error).message);
    }
  }

  function openSnooze() {
    setCustomDate(farmDate(now, timezone));
    setCustomTime(farmTime(now, timezone));
    setActionError(null);
    setSnoozeOpen(true);
  }

  async function chooseSnooze(preset: "hour" | "evening" | "tomorrow" | "three-days") {
    const target = new Date(now);
    if (preset === "hour") {
      target.setTime(target.getTime() + 60 * 60 * 1000);
      await snoozeUntil(target.toISOString());
      return;
    }
    const today = farmDate(now, timezone);
    const currentTime = farmTime(now, timezone);
    const targetDate = preset === "evening"
      ? currentTime < "18:00" ? today : addLocalDays(today, 1)
      : addLocalDays(today, preset === "tomorrow" ? 1 : 3);
    const targetTime = preset === "evening" ? "18:00" : "09:00";
    await snoozeUntil(`${targetDate}T${targetTime}:00`);
  }

  const payBalance = () => {
    if (!relatedTransactionId || !linkedTransaction) return;
    router.push({
      pathname: "/transactions/[transactionId]/settlements",
      params: {
        transactionId: relatedTransactionId,
        transactionType: isSaleReminder ? "sale" : "purchase",
        balanceDue: String(linkedTransaction.balance_due),
        creditBalance: String(linkedTransaction.credit_balance),
        contactName: contactName ?? (isSaleReminder ? "Customer" : "Supplier"),
        referenceNumber: transactionReference ?? "",
      },
    });
  };

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={reminderQuery.isRefetching}
            onRefresh={() => void reminderQuery.refetch()}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <FarmPageHeader title="Reminder details" showBack />
        {reminderQuery.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={theme.primary} />
            <AppText tone="secondary">Loading reminder…</AppText>
          </View>
        ) : null}
        {reminderQuery.isError ? (
          <Card style={styles.stateCard}>
            <Ionicons
              name="cloud-offline-outline"
              size={28}
              color={theme.danger}
            />
            <AppText weight="semibold">Couldn’t load this reminder</AppText>
            <AppText tone="secondary" style={styles.centered}>
              {normalizeApiError(reminderQuery.error).message}
            </AppText>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => void reminderQuery.refetch()}
            />
          </Card>
        ) : null}
        {reminder ? (
          <>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: `${statusPresentation.color}18` },
              ]}
            >
              <View style={[styles.statusDot, { backgroundColor: statusPresentation.color }]} />
              <AppText size="small" weight="semibold" style={{ color: statusPresentation.color }}>
                {statusPresentation.label}
              </AppText>
            </View>
            <AppText size="heading" weight="semibold" style={styles.title}>
              {reminder.title}
            </AppText>
            <AppText size="small" tone="secondary">
              <AppText weight="semibold" style={{ color: theme.text }}>
                {formatDayTime(reminder.due_at, timezone, now)}
              </AppText>
              {" · farm time"}
            </AppText>

            {linkedTransaction ? (
              <View style={[styles.amountBlock, { borderTopColor: theme.border }]}>
                <AppText size="small" tone="secondary">
                  {balanceDue > 0
                    ? `Still owed${contactName ? ` to ${contactName}` : ""}`
                    : "Balance is settled"}
                </AppText>
                <AppText
                  size="title"
                  weight="semibold"
                  style={{ color: balanceDue > 0 ? theme.text : theme.success }}
                >
                  {formatMoney(balanceDue, theme.currency)}
                </AppText>
                {transactionReference ? (
                  <AppText size="small" tone="secondary">
                    {isSaleReminder ? "Sale" : "Purchase"} {transactionReference}
                  </AppText>
                ) : null}
              </View>
            ) : reminder.description ? (
              <AppText size="small" tone="secondary">{reminder.description}</AppText>
            ) : null}
            {relatedTransactionId && purchaseQuery.isLoading ? (
              <AppText size="small" tone="secondary">Loading linked purchase…</AppText>
            ) : null}
            {relatedTransactionId && saleQuery.isLoading ? (
              <AppText size="small" tone="secondary">Loading linked sale…</AppText>
            ) : null}
            {purchaseQuery.isError ? (
              <AppText size="small" style={{ color: theme.danger }}>
                Couldn’t load the linked purchase: {normalizeApiError(purchaseQuery.error).message}
              </AppText>
            ) : null}
            {saleQuery.isError ? (
              <AppText size="small" style={{ color: theme.danger }}>
                Couldn’t load the linked sale: {normalizeApiError(saleQuery.error).message}
              </AppText>
            ) : null}

            {reminder.status === "PENDING" ? (
              <View style={styles.actions}>
                {balanceDue > 0 && relatedTransactionId ? (
                  <Button label="Pay balance" onPress={payBalance} />
                ) : null}
                <View style={styles.actionRow}>
                  <Button
                    label="Snooze"
                    variant="secondary"
                    style={styles.actionButton}
                    disabled={rescheduleMutation.isPending}
                    onPress={openSnooze}
                  />
                  <Button
                    label="Mark done"
                    variant="secondary"
                    style={[
                      styles.actionButton,
                      !canCompleteReminder && styles.disabledActionButton,
                    ]}
                    disabled={!canCompleteReminder}
                    loading={completeMutation.isPending}
                    onPress={() => void markDone()}
                  />
                </View>
                {relatedTransactionId && !canCompleteReminder ? (
                  <AppText size="small" tone="secondary">
                    {balanceDue > 0
                      ? "Settle the balance before marking this reminder done."
                      : linkedBalanceQuery.isLoading || linkedBalanceQuery.isFetching
                        ? "Checking the linked balance before you can mark this done."
                        : "The linked balance could not be verified. Refresh the page and try again."}
                  </AppText>
                ) : null}
              </View>
            ) : reminder.status === "COMPLETED" ? (
              <View style={[styles.doneBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <AppText size="small" tone="secondary">This reminder is complete.</AppText>
                <Pressable
                  accessibilityRole="button"
                  disabled={reopenMutation.isPending}
                  onPress={() => void undoDone()}
                >
                  <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                    {reopenMutation.isPending ? "Undoing…" : "Undo"}
                  </AppText>
                </Pressable>
              </View>
            ) : null}
            {actionError ? (
              <AppText size="small" style={{ color: theme.danger }}>{actionError}</AppText>
            ) : null}

            <View style={[styles.detailList, { borderTopColor: theme.border }]}>
              <DetailLine
                label="Remind me"
                value={formatDateTime(reminder.due_at, timezone)}
              />
              <DetailLine
                label="How"
                value={reminder.delivery_channel === "push" ? "In the app and push" : "In the app"}
              />
              <DetailLine
                label="Created"
                value={formatDateTime(reminder.created_at, timezone)}
              />
              {reminder.completed_at ? (
                <DetailLine label="Completed" value={formatDateTime(reminder.completed_at, timezone)} />
              ) : null}
              {relatedTransactionId ? (
                <View style={styles.detailLine}>
                  <AppText size="small" tone="secondary" style={styles.detailLabel}>Linked to</AppText>
                  <View style={styles.linkedValue}>
                    <AppText size="small" weight="semibold" style={styles.detailValue}>
                      {transactionReference ?? (isSaleReminder ? "Sale" : "Purchase")}
                    </AppText>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        if (isSaleReminder) {
                          router.push({
                            pathname: "/sales/[saleId]",
                            params: { saleId: relatedTransactionId },
                          });
                        } else {
                          router.push({
                            pathname: "/purchases/[purchaseId]",
                            params: { purchaseId: relatedTransactionId },
                          });
                        }
                      }}
                    >
                      <AppText size="small" weight="semibold" style={{ color: theme.primary }}>View</AppText>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          </>
        ) : null}
      </ScrollView>

      <Modal
        visible={snoozeOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSnoozeOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.scrim} onPress={() => setSnoozeOpen(false)} />
          <View style={[styles.snoozeSheet, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.sheetHandle} />
            <AppText size="body" weight="semibold">Remind me again</AppText>
            <SnoozeOption label="In 1 hour" onPress={() => void chooseSnooze("hour")} />
            <SnoozeOption label="This evening" detail="6:00 PM" onPress={() => void chooseSnooze("evening")} />
            <SnoozeOption label="Tomorrow morning" detail="9:00 AM" onPress={() => void chooseSnooze("tomorrow")} />
            <SnoozeOption label="In 3 days" detail="9:00 AM" onPress={() => void chooseSnooze("three-days")} />
            <View style={[styles.customSnooze, { borderTopColor: theme.border }]}>
              <AppText size="small" weight="semibold">Pick date and time</AppText>
              <DatePickerField
                label="Date"
                value={customDate}
                onChange={setCustomDate}
                minimumDate={parseLocalDate(farmDate(now, timezone))}
              />
              <TimePickerField
                label="Time"
                value={customTime}
                onChange={setCustomTime}
                minimumTime={customDate === farmDate(now, timezone)
                  ? farmTime(new Date(now.getTime() + 60_000), timezone)
                  : undefined}
              />
              <Button
                label="Set reminder"
                loading={rescheduleMutation.isPending}
                onPress={() => void snoozeUntil(`${customDate}T${customTime}:00`)}
              />
              {actionError ? (
                <AppText size="small" style={{ color: theme.danger }}>{actionError}</AppText>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.detailLine}>
      <AppText size="small" tone="secondary" style={styles.detailLabel}>
        {label}
      </AppText>
      <AppText
        size="small"
        weight="semibold"
        style={[styles.detailValue, { color: theme.text }]}
      >
        {value}
      </AppText>
    </View>
  );
}

function SnoozeOption({
  label,
  detail,
  onPress,
}: {
  label: string;
  detail?: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.snoozeOption,
        { backgroundColor: pressed ? theme.backgroundSelected : "transparent" },
      ]}
    >
      <AppText size="small" weight="semibold">{label}</AppText>
      {detail ? <AppText size="small" tone="secondary">{detail}</AppText> : null}
    </Pressable>
  );
}

function getReminderStatus(
  reminder: NonNullable<ReturnType<typeof useReminder>["data"]> | undefined,
  now: Date,
): { label: string; color: string } {
  if (!reminder) return { label: "", color: "#777777" };
  if (reminder.status === "COMPLETED") return { label: "Done", color: "#17803F" };
  if (reminder.status === "CANCELLED") return { label: "Cancelled", color: "#66736D" };
  const dueAt = new Date(reminder.due_at);
  if (Number.isNaN(dueAt.getTime())) return { label: "Pending", color: "#A85A12" };
  const difference = dueAt.getTime() - now.getTime();
  const duration = formatRelativeDuration(Math.abs(difference));
  if (difference < 0) return { label: `Overdue by ${duration}`, color: "#B3261E" };
  return {
    label: difference < 60_000 ? "Due now" : `Due in ${duration}`,
    color: "#A85A12",
  };
}

function formatRelativeDuration(milliseconds: number): string {
  const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.ceil(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function formatDateTime(value: string, timezone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

function formatMoney(value: number | string, currency: string): string {
  return formatMoneyValue(value, currency);
}

function formatDayTime(value: string, timezone: string, now: Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const today = farmDate(now, timezone);
  const tomorrow = addLocalDays(today, 1);
  const dueDate = farmDate(date, timezone);
  const day = dueDate === today
    ? "Today"
    : dueDate === tomorrow
      ? "Tomorrow"
      : new Intl.DateTimeFormat(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: timezone,
        }).format(date);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(date);
  return `${day}, ${time}`;
}

function farmDate(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function farmTime(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("hour")}:${part("minute")}`;
}

function addLocalDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    gap: 8,
    padding: 20,
    paddingBottom: 36,
  },
  loading: { alignItems: "center", gap: 12, padding: 36 },
  stateCard: { alignItems: "center", gap: 12, padding: 24 },
  centered: { textAlign: "center" },
  title: { marginTop: 4 },
  statusBadge: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 16,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  amountBlock: { gap: 3, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, marginTop: 14 },
  actions: { gap: 9, marginTop: 12 },
  actionRow: { flexDirection: "row", gap: 9 },
  doneBox: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, marginTop: 12 },
  detailList: { gap: 0, borderTopWidth: 1, marginTop: 22 },
  detailLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#D8DED5",
  },
  detailLabel: { flexShrink: 0, minWidth: 82 },
  detailValue: { flex: 1, minWidth: 0, textAlign: "right" },
  linkedValue: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 12 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  scrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.5)" },
  actionButton: { flex: 1 },
  disabledActionButton: { opacity: 0.55 },
  snoozeSheet: { gap: 8, maxHeight: "90%", borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 24 },
  sheetHandle: { width: 38, height: 4, alignSelf: "center", borderRadius: 2, backgroundColor: "#97A49D", marginBottom: 7 },
  snoozeOption: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 10, paddingHorizontal: 10 },
  customSnooze: { gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, marginTop: 4 },
});
