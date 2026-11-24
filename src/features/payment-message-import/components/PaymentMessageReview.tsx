import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { useTheme } from "@/providers/theme-provider";

import type { NormalizedPaymentMessage } from "../types";

export type PaymentMessageEdits = {
  amount: string;
  reference: string;
  date: string;
  time: string;
};

type PaymentMessageReviewProps = {
  payment: NormalizedPaymentMessage;
  warnings: string[];
  currency: string;
  expectedAmount: string | null;
  purchaseDate: string;
  canImport: boolean;
  blockReason?: string;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (edits: PaymentMessageEdits) => void;
};

const channelLabels = {
  BUY_GOODS: "Buy Goods / Till",
  PAYBILL: "PayBill",
  SEND_MONEY: "Send Money",
  RECEIVED_MONEY: "Money received",
  OTHER: "Other M-Pesa message",
  UNKNOWN: "Unknown",
};

export function PaymentMessageReview({
  payment,
  warnings,
  currency,
  expectedAmount,
  purchaseDate,
  canImport,
  blockReason,
  error,
  onCancel,
  onConfirm,
}: PaymentMessageReviewProps) {
  const { theme } = useTheme();
  const [amount, setAmount] = useState(payment.amount ?? "");
  const [reference, setReference] = useState(payment.transactionReference ?? "");
  const [date, setDate] = useState(payment.transactionDate ?? "");
  const [time, setTime] = useState(payment.transactionTime ?? "");
  const [confirmDirection, setConfirmDirection] = useState(false);
  const nonOutgoing = payment.direction !== "OUTGOING";
  const validAmount = /^\d+(?:\.\d{1,2})?$/.test(amount.trim());
  const validDate = isValidDate(date);
  const validTime = !time || /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const validReference = reference.length <= 100;
  const importedCents = toCents(amount);
  const expectedCents = expectedAmount ? toCents(expectedAmount) : null;
  const amountComparison =
    importedCents === null || expectedCents === null
      ? "UNKNOWN"
      : importedCents === expectedCents
        ? "MATCH"
        : importedCents < expectedCents
          ? "PARTIAL"
          : "OVER";
  const dateWarning = comparePaymentDate(date, purchaseDate);
  const allowed =
    canImport &&
    validAmount &&
    validDate &&
    validTime &&
    validReference &&
    (!nonOutgoing || confirmDirection);

  function detail(label: string, value: string | null | undefined) {
    if (!value) return null;
    return (
      <View key={label} style={styles.detailRow}>
        <AppText size="small" tone="secondary">
          {label}
        </AppText>
        <AppText size="small" style={styles.detailValue}>
          {value}
        </AppText>
      </View>
    );
  }

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={[styles.backdrop, { backgroundColor: "rgba(0,0,0,0.42)" }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.background,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.heading}>
            <View style={styles.flex}>
              <AppText size="heading" weight="semibold">
                Review M-Pesa message
              </AppText>
              <AppText size="small" tone="secondary">
                Imported details are not verified payment evidence. Nothing is
                recorded until you submit the purchase.
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel message import"
              onPress={onCancel}
              hitSlop={8}
            >
              <Ionicons name="close" size={23} color={theme.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            <Card style={styles.summary}>
              {detail("Payment channel", channelLabels[payment.paymentChannel])}
              {detail("Direction", payment.direction)}
              {detail("Status", payment.transactionStatus)}
              {detail("Sender", payment.senderName)}
              {detail("Sender phone", payment.senderPhone)}
              {detail("Recipient", payment.recipientName)}
              {detail("Recipient phone", payment.recipientPhone)}
              {detail("Business / Till number", payment.businessNumber)}
              {detail("PayBill account", payment.accountNumber)}
              {detail("Timezone", payment.timezone)}
            </Card>

            <TextField
              label={`Amount (${currency})`}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="Enter amount"
            />
            <TextField
              label="M-Pesa transaction code"
              value={reference}
              onChangeText={setReference}
              autoCapitalize="characters"
              maxLength={100}
              placeholder="Enter transaction code if available"
            />
            <TextField
              label="Transaction date (YYYY-MM-DD)"
              value={date}
              onChangeText={setDate}
              placeholder="Review the transaction date"
            />
            <TextField
              label="Transaction time (24-hour, HH:mm)"
              value={time}
              onChangeText={setTime}
              placeholder="Leave blank if not provided"
            />
            {amountComparison === "MATCH" ? (
              <AppText size="small" style={{ color: theme.success }}>
                Imported amount matches the expected payment.
              </AppText>
            ) : amountComparison === "PARTIAL" ? (
              <AppText size="small" style={{ color: theme.secondary }}>
                This is a partial payment and will not mark the full purchase as paid.
              </AppText>
            ) : amountComparison === "OVER" ? (
              <AppText size="small" style={{ color: theme.secondary }}>
                The amount is higher than expected. Confirm any supplier credit
                in the existing purchase flow.
              </AppText>
            ) : null}
            {dateWarning ? (
              <AppText size="small" style={{ color: theme.secondary }}>
                {dateWarning}
              </AppText>
            ) : null}

            {payment.missingFields.length > 0 ? (
              <AppText size="small" style={{ color: theme.secondary }}>
                Missing details: {payment.missingFields.join(", ")}. Add the
                amount, date, time, or reference above if you know it.
              </AppText>
            ) : null}
            {warnings.map((warning, index) => (
              <View key={`${index}-${warning}`} style={styles.warning}>
                <Ionicons
                  name="warning-outline"
                  size={17}
                  color={theme.secondary}
                />
                <AppText size="small" style={styles.warningText}>
                  {warning}
                </AppText>
              </View>
            ))}
            {nonOutgoing ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: confirmDirection }}
                onPress={() => setConfirmDirection((current) => !current)}
                style={[
                  styles.confirmDirection,
                  { borderColor: theme.border },
                ]}
              >
                <Ionicons
                  name={confirmDirection ? "checkbox" : "square-outline"}
                  size={21}
                  color={confirmDirection ? theme.primary : theme.textSecondary}
                />
                <AppText size="small" style={styles.flex}>
                  I have checked this message and confirm it represents a
                  payment made to the selected supplier.
                </AppText>
              </Pressable>
            ) : null}
            {blockReason ? (
              <AppText size="small" style={{ color: theme.danger }}>
                {blockReason}
              </AppText>
            ) : null}
            {error ? (
              <AppText size="small" style={{ color: theme.danger }}>
                {error}
              </AppText>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={onCancel} />
            <Button
              label="Use payment details"
              onPress={() =>
                onConfirm({
                  amount: amount.trim(),
                  reference: reference.trim(),
                  date: date.trim(),
                  time: time.trim(),
                })
              }
              disabled={!allowed}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "94%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 20,
  },
  heading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  flex: { flex: 1 },
  content: { gap: 14, paddingBottom: 10 },
  summary: { gap: 9, padding: 14 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  detailValue: { flex: 1, textAlign: "right" },
  warning: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  warningText: { flex: 1 },
  confirmDirection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  actions: { flexDirection: "row", gap: 10, paddingTop: 12 },
});

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function toCents(value: string): bigint | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
}

function comparePaymentDate(date: string, purchaseDate: string): string | null {
  if (!isValidDate(date) || !isValidDate(purchaseDate)) return null;
  if (date < purchaseDate) {
    return "The payment date is before the purchase date. Review both dates before recording.";
  }
  const [year, month, day] = date.split("-").map(Number);
  const [purchaseYear, purchaseMonth, purchaseDay] = purchaseDate
    .split("-")
    .map(Number);
  const dayDifference =
    (Date.UTC(year, month - 1, day) -
      Date.UTC(purchaseYear, purchaseMonth - 1, purchaseDay)) /
    (24 * 60 * 60 * 1000);
  return dayDifference > 30
    ? "The payment date is more than 30 days after the purchase date. Review both dates before recording."
    : null;
}
