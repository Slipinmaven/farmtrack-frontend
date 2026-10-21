import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TextField } from "@/components/ui/text-field";
import {
  getExpenseDisplayName,
  type SettlementPaymentMethod,
} from "@/features/management/api";
import {
  useCancelExpense,
  useExpense,
  useExpenseCategories,
  useRecordExpensePayment,
  useRecordExpenseRefund,
  useUpdateExpense,
} from "@/features/management/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAppDialog } from "@/components/ui/app-dialog";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

const methods: { value: SettlementPaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "mpesa", label: "M-Pesa" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

type ActionMode = "payment" | "refund" | "cancel" | null;

export default function ExpenseDetailsRoute() {
  return (
    <SessionGate>
      <ExpenseDetailsContent />
    </SessionGate>
  );
}

function ExpenseDetailsContent() {
  const params = useLocalSearchParams<{ expenseId?: string }>();
  const router = useRouter();
  const expenseId =
    typeof params.expenseId === "string" ? params.expenseId : undefined;
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const farmId = farm.selectedFarm?.id;
  const expenseQuery = useExpense(user?.id, farmId, expenseId);
  const categoriesQuery = useExpenseCategories(user?.id, farmId, true);
  const expense = expenseQuery.data;
  const updateMutation = useUpdateExpense(user?.id ?? "", farmId ?? "", expenseId ?? "");
  const paymentMutation = useRecordExpensePayment(user?.id ?? "", farmId ?? "", expenseId ?? "");
  const refundMutation = useRecordExpenseRefund(user?.id ?? "", farmId ?? "", expenseId ?? "");
  const cancelMutation = useCancelExpense(user?.id ?? "", farmId ?? "", expenseId ?? "");
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<ActionMode>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptReference, setReceiptReference] = useState("");
  const [actionAmount, setActionAmount] = useState("");
  const [actionDate, setActionDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState<SettlementPaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  function startEditing() {
    if (!expense) return;
    setName(expense.name);
    setCategory(expense.category);
    setAmount(expense.amount);
    setExpenseDate(expense.expense_date);
    setNotes(expense.notes ?? "");
    setReceiptReference(expense.receipt_reference ?? "");
    setEditing(true);
    setMode(null);
    setError("");
  }

  function openAction(nextMode: ActionMode) {
    setMode(nextMode);
    setActionAmount("");
    setActionDate(today());
    setPaymentMethod("cash");
    setReference("");
    setReason("");
    setError("");
  }

  async function saveChanges() {
    if (!expense || !name.trim() || !category || !/^\d+(\.\d{1,2})?$/.test(amount)) {
      setError("Enter a name, category, and a valid amount with up to two decimals.");
      return;
    }
    try {
      await updateMutation.mutateAsync({
        name: name.trim(),
        category,
        amount: amount.trim(),
        expense_date: expenseDate,
        notes: notes.trim() || null,
        receipt_reference: receiptReference.trim() || null,
      });
      setEditing(false);
      setError("");
      await dialog.showDialog({
        title: "Expense updated",
        message: "The expense details have been saved.",
        tone: "success",
      });
    } catch (caught) {
      setError(normalizeApiError(caught).message);
    }
  }

  async function savePaymentOrRefund() {
    if (!expense || !/^\d+(\.\d{1,2})?$/.test(actionAmount) || Number(actionAmount) <= 0) {
      setError("Enter a valid amount greater than zero.");
      return;
    }
    if (paymentMethod !== "cash" && reference.trim() && !/^[A-Za-z0-9- ]{1,100}$/.test(reference.trim())) {
      setError("Reference must be letters, numbers, spaces, or dashes, with up to 100 characters.");
      return;
    }
    if (mode === "refund" && reason.trim().length < 3) {
      setError("Enter a reason for the refund.");
      return;
    }
    try {
      const payload = {
        amount: actionAmount.trim(),
        payment_date: actionDate,
        payment_method: paymentMethod,
        ...(reference.trim() ? { reference_number: reference.trim() } : {}),
      };
      if (mode === "payment") {
        await paymentMutation.mutateAsync(payload);
      } else {
        await refundMutation.mutateAsync({ ...payload, reason: reason.trim() });
      }
      setMode(null);
      setError("");
    } catch (caught) {
      setError(normalizeApiError(caught).message);
    }
  }

  async function cancelRecord() {
    if (!reason.trim() || reason.trim().length < 3) {
      setError("Enter a cancellation reason.");
      return;
    }
    const confirmed = await dialog.confirmDialog({
      title: "Cancel this expense?",
      message: "This will retain the record and mark it cancelled. It cannot be silently deleted.",
      confirmLabel: "Cancel expense",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await cancelMutation.mutateAsync(reason.trim());
      setMode(null);
      setError("");
    } catch (caught) {
      setError(normalizeApiError(caught).message);
    }
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <FarmPageHeader title="Expense details" showBack />
        {!farm.selectedFarm ? (
          <Card><AppText weight="semibold">Choose a farm to view this expense.</AppText></Card>
        ) : expenseQuery.isLoading ? (
          <LoadingState label="Loading expense details" />
        ) : expenseQuery.isError ? (
          <Card style={styles.card}>
            <AppText weight="semibold">Could not load this expense</AppText>
            <AppText size="small" tone="secondary">
              {normalizeApiError(expenseQuery.error).message}
            </AppText>
            <Button label="Retry" variant="secondary" onPress={() => void expenseQuery.refetch()} />
          </Card>
        ) : !expense ? (
          <Card><AppText weight="semibold">Expense not found.</AppText></Card>
        ) : (
          <>
            <Card style={styles.card}>
              {editing ? (
                <>
                  <AppText size="heading" weight="semibold">Edit expense</AppText>
                  <TextField label="Expense name" value={name} onChangeText={setName} />
                  <AppText size="small" weight="semibold">Category</AppText>
                  {categoriesQuery.isError ? (
                    <AppText size="small" style={{ color: theme.danger }}>
                      Couldn’t load categories: {normalizeApiError(categoriesQuery.error).message}
                    </AppText>
                  ) : null}
                  <View style={styles.chips}>
                    {(categoriesQuery.data ?? []).map((item) => (
                      <ChoiceChip
                        key={item.id}
                        label={item.name}
                        selected={category === item.key}
                        onPress={() => setCategory(item.key)}
                      />
                    ))}
                  </View>
                  <TextField
                    label={`Total amount (${theme.currency})`}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                  />
                  <DatePickerField label="Expense date" value={expenseDate} onChange={setExpenseDate} maximumDate={new Date()} />
                  <TextField label="Receipt link or reference" value={receiptReference} onChangeText={setReceiptReference} autoCapitalize="none" />
                  <TextField label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={3} />
                  <View style={styles.actions}>
                    <Button label="Save changes" onPress={() => void saveChanges()} loading={updateMutation.isPending} />
                    <Button label="Discard" variant="quiet" onPress={() => { setEditing(false); setError(""); }} />
                  </View>
                  {error ? (
                    <View style={styles.error}>
                      <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
                      <AppText size="small" style={{ color: theme.danger, flex: 1 }}>{error}</AppText>
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  <View style={styles.titleRow}>
                    <View style={styles.grow}>
                      <AppText size="heading" weight="semibold">{getExpenseDisplayName(expense)}</AppText>
                      <AppText size="small" tone="secondary">
                        {expense.category_name} · {expense.expense_date}
                      </AppText>
                    </View>
                    <View
                      style={[
                        styles.status,
                        {
                          backgroundColor: `${expense.payment_status === "paid" ? theme.success : expense.payment_status === "cancelled" || expense.payment_status === "unpaid" ? theme.danger : theme.secondary}18`,
                        },
                      ]}
                    >
                      <AppText
                        size="small"
                        weight="semibold"
                        style={{
                          color:
                            expense.payment_status === "paid"
                              ? theme.success
                              : expense.payment_status === "cancelled" ||
                                  expense.payment_status === "unpaid"
                                ? theme.danger
                                : theme.secondary,
                        }}
                      >
                        {humanize(expense.payment_status)}
                      </AppText>
                    </View>
                  </View>
                  <View style={[styles.amountGrid, { borderColor: theme.border }]}>
                    <Amount
                      label="Total"
                      value={expense.amount}
                      currency={theme.currency}
                      color={theme.text}
                    />
                    <Amount
                      label="Paid"
                      value={expense.amount_paid}
                      currency={theme.currency}
                      color={theme.success}
                    />
                    <Amount
                      label="Balance"
                      value={expense.balance_due}
                      currency={theme.currency}
                      color={
                        Number(expense.balance_due) > 0
                          ? theme.danger
                          : theme.textSecondary
                      }
                    />
                  </View>
                  {expense.purchase_transaction_id ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`View purchase ${expense.purchase_reference ?? ""}`}
                      onPress={() =>
                        router.push({
                          pathname: "/purchases/[purchaseId]",
                          params: { purchaseId: expense.purchase_transaction_id! },
                        })
                      }
                      style={[
                        styles.purchaseLink,
                        {
                          backgroundColor: theme.backgroundSelected,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.purchaseIcon,
                          { backgroundColor: theme.backgroundElement },
                        ]}
                      >
                        <Ionicons
                          name="receipt-outline"
                          size={18}
                          color={theme.primary}
                        />
                      </View>
                      <View style={styles.grow}>
                        <AppText size="small" weight="semibold">
                          Linked purchase
                        </AppText>
                        <AppText size="small" tone="secondary">
                          {expense.purchase_reference ?? "View purchase details"}
                        </AppText>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={theme.primary}
                      />
                    </Pressable>
                  ) : null}
                  <Detail label="Payee" value={expense.contact_name} />
                  <Detail label="Related block" value={expense.block_name} />
                  <Detail label="Receipt / reference" value={expense.receipt_reference} />
                  <Detail label="Notes" value={expense.notes} />
                  {expense.cancellation_reason ? <Detail label="Cancellation reason" value={expense.cancellation_reason} /> : null}
                  {expense.canceled_at ? <Detail label="Cancelled" value={formatTimestamp(expense.canceled_at)} /> : null}
                  <AppText size="small" tone="secondary" style={styles.auditLine}>
                    Recorded {formatTimestamp(expense.created_at)}
                    {expense.updated_at !== expense.created_at
                      ? ` · Updated ${formatTimestamp(expense.updated_at)}`
                      : ""}
                  </AppText>
                </>
              )}
            </Card>

            <Card style={styles.card}>
              <AppText size="heading" weight="semibold">Payment history</AppText>
              {expense.payments.length ? expense.payments.map((payment) => (
                <View key={payment.id} style={[styles.paymentRow, { borderTopColor: theme.border }]}>
                  <View style={styles.grow}>
                    <AppText size="small" weight="semibold">
                      {payment.kind === "refund" ? "Refund" : "Payment"} · {payment.payment_date}
                    </AppText>
                    <AppText size="small" tone="secondary">
                      {humanize(payment.payment_method)}
                      {payment.reference_number ? ` · Ref ${payment.reference_number}` : ""}
                    </AppText>
                    {payment.reason ? <AppText size="small" tone="secondary">{payment.reason}</AppText> : null}
                  </View>
                  <AppText size="small" weight="semibold" style={{ color: payment.kind === "refund" ? theme.danger : theme.text }}>
                    {payment.kind === "refund" ? "−" : ""}
                    {formatMoney(Number(payment.amount), theme.currency)}
                  </AppText>
                </View>
              )) : (
                <AppText size="small" tone="secondary">No payments have been recorded.</AppText>
              )}
            </Card>

            {!editing && !expense.purchase_transaction_id && expense.payment_status !== "cancelled" ? (
              <Card style={[styles.card, styles.actionCard]}>
                <View style={styles.actionHeader}>
                  <View style={styles.actionHeaderCopy}>
                    <AppText weight="semibold">Manage expense</AppText>
                    <AppText size="small" tone="secondary">
                      Update details or record a money movement.
                    </AppText>
                  </View>
                  <Ionicons name="options-outline" size={19} color={theme.textSecondary} />
                </View>
                {Number(expense.balance_due) > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => openAction("payment")}
                    style={({ pressed }) => [
                      styles.primaryAction,
                      {
                        backgroundColor: theme.primary,
                        opacity: pressed ? 0.82 : 1,
                      },
                    ]}
                  >
                    <Ionicons name="wallet-outline" size={18} color={theme.onPrimary} />
                    <AppText
                      weight="semibold"
                      style={[styles.primaryActionLabel, { color: theme.onPrimary }]}
                    >
                      Record payment
                    </AppText>
                    <AppText
                      size="small"
                      weight="semibold"
                      style={{ color: theme.onPrimary }}
                    >
                      {formatMoney(Number(expense.balance_due), theme.currency)}
                    </AppText>
                  </Pressable>
                ) : null}
                <View style={styles.secondaryActions}>
                  <ExpenseAction
                    icon="create-outline"
                    label="Edit"
                    onPress={startEditing}
                  />
                  {Number(expense.amount_paid) > 0 ? (
                    <ExpenseAction
                      icon="arrow-undo-outline"
                      label="Refund"
                      onPress={() => openAction("refund")}
                    />
                  ) : null}
                  <ExpenseAction
                    icon="close-circle-outline"
                    label="Cancel"
                    destructive
                    onPress={() => openAction("cancel")}
                  />
                </View>
                {mode === "payment" || mode === "refund" ? (
                  <View style={styles.actionForm}>
                    <AppText weight="semibold">{mode === "payment" ? "Record payment" : "Record refund"}</AppText>
                    <TextField
                      label={`Amount (${theme.currency})`}
                      value={actionAmount}
                      onChangeText={setActionAmount}
                      keyboardType="decimal-pad"
                    />
                    <DatePickerField label="Payment date" value={actionDate} onChange={setActionDate} maximumDate={new Date()} />
                    <AppText size="small" weight="semibold">Method</AppText>
                    <View style={styles.chips}>
                      {methods.map((method) => (
                        <ChoiceChip
                          key={method.value}
                          label={method.label}
                          selected={paymentMethod === method.value}
                          onPress={() => { setPaymentMethod(method.value); if (method.value === "cash") setReference(""); }}
                        />
                      ))}
                    </View>
                    {paymentMethod !== "cash" ? (
                      <TextField label="Reference (optional)" value={reference} onChangeText={setReference} autoCapitalize="characters" />
                    ) : null}
                    {mode === "refund" ? <TextField label="Refund reason (required)" value={reason} onChangeText={setReason} multiline /> : null}
                    <View style={styles.actions}>
                      <Button label={mode === "payment" ? "Save payment" : "Save refund"} onPress={() => void savePaymentOrRefund()} loading={paymentMutation.isPending || refundMutation.isPending} />
                      <Button label="Close" variant="quiet" onPress={() => { setMode(null); setError(""); }} />
                    </View>
                  </View>
                ) : mode === "cancel" ? (
                  <View style={styles.actionForm}>
                    <AppText size="small" tone="secondary">
                      {Number(expense.amount_paid) > 0
                        ? "This expense has payments. Record refunds for the full net amount before cancellation."
                        : "The expense will remain in the audit history as cancelled."}
                    </AppText>
                    <TextField label="Cancellation reason (required)" value={reason} onChangeText={setReason} multiline />
                    <View style={styles.actions}>
                      <Button
                        label="Confirm cancellation"
                        onPress={() => void cancelRecord()}
                        loading={cancelMutation.isPending}
                        disabled={Number(expense.amount_paid) > 0}
                      />
                      <Button label="Close" variant="quiet" onPress={() => { setMode(null); setError(""); }} />
                    </View>
                  </View>
                ) : null}
                {error ? (
                  <View style={styles.error}>
                    <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
                    <AppText size="small" style={{ color: theme.danger, flex: 1 }}>{error}</AppText>
                  </View>
                ) : null}
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ExpenseAction({
  icon,
  label,
  destructive = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const color = destructive ? theme.danger : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryAction,
        {
          borderColor: destructive ? `${theme.danger}55` : theme.border,
          backgroundColor: destructive ? `${theme.danger}0A` : theme.backgroundElement,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={16} color={color} />
      <AppText size="small" weight="semibold" style={{ color }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function ChoiceChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? theme.primary : theme.border,
          backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
        },
      ]}
    >
      <AppText size="small" style={{ color: selected ? theme.primary : theme.text }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function Amount({
  label,
  value,
  currency,
  color,
}: {
  label: string;
  value: string;
  currency: string;
  color: string;
}) {
  return (
    <View style={styles.amountCell}>
      <AppText size="small" tone="secondary">{label}</AppText>
      <AppText size="small" weight="semibold" style={{ color }}>
        {formatMoney(Number(value), currency)}
      </AppText>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  const { theme } = useTheme();
  if (!value) return null;
  return (
    <View style={[styles.detail, { borderTopColor: theme.border }]}>
      <AppText size="small" tone="secondary" style={styles.detailLabel}>{label}</AppText>
      <AppText size="small" style={styles.detailValue}>{value}</AppText>
    </View>
  );
}

function humanize(value: string): string {
  return value.split(/[_\s]+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

function formatMoney(value: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  keyboardContainer: { flex: 1 },
  content: { padding: 14, gap: 12, paddingBottom: 30 },
  card: { gap: 12, borderRadius: 12, padding: 14 },
  grow: { flex: 1, gap: 3 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  status: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  amountGrid: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 11,
    gap: 8,
  },
  amountCell: { flex: 1, gap: 4 },
  detail: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  detailLabel: { flex: 0.8 },
  detailValue: { flex: 1.2, textAlign: "right" },
  purchaseLink: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 11 },
  purchaseIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  auditLine: { paddingTop: 2 },
  paymentRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  actionCard: { gap: 11 },
  actionHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  actionHeaderCopy: { flex: 1, gap: 2 },
  primaryAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  primaryActionLabel: { flex: 1 },
  secondaryActions: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  secondaryAction: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
  },
  actions: { gap: 8 },
  actionForm: { gap: 12, paddingTop: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 34, justifyContent: "center", borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6 },
  error: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
});
