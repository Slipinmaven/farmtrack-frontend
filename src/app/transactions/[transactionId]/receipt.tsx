import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  useChickenPurchaseDetails,
  useChickenSaleDetails,
} from "@/features/chickens/hooks";
import { useTransactionSettlements } from "@/features/management/hooks";
import { ReceiptActionButtons } from "@/features/receipts/receipt-actions";
import type {
  ReceiptContext,
  ReceiptDocument,
  ReceiptPayment,
} from "@/features/receipts/receipt-export";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type TransactionType = "sale" | "purchase";
type ReceiptKind = "transaction" | "payment";
type GenerationPhase = "printing" | "tearing" | "ready";

export default function TransactionReceiptRoute() {
  return (
    <SessionGate>
      <TransactionReceiptContent />
    </SessionGate>
  );
}

function TransactionReceiptContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{
    transactionId: string;
    transactionType: TransactionType;
    documentKind?: ReceiptKind;
    paymentId?: string;
    paymentNumber?: string;
  }>();
  const transactionId = params.transactionId;
  const transactionType =
    params.transactionType === "purchase" ? "purchase" : "sale";
  const documentKind =
    params.documentKind === "payment" ? "payment" : "transaction";
  const paymentNumber = Number(params.paymentNumber);
  const isPayment = documentKind === "payment";
  const sale = useChickenSaleDetails(
    user?.id,
    farm.selectedFarm?.id,
    transactionType === "sale" ? transactionId : undefined,
  );
  const purchase = useChickenPurchaseDetails(
    user?.id,
    farm.selectedFarm?.id,
    transactionType === "purchase" ? transactionId : undefined,
  );
  const detail = transactionType === "sale" ? sale : purchase;
  const transaction = detail.data?.transaction;
  const settlements = useTransactionSettlements(
    user?.id,
    farm.selectedFarm?.id,
    transactionId,
  );
  const counterpartyName =
    transactionType === "sale"
      ? sale.data?.customer_name ?? null
      : purchase.data?.supplier_name ?? null;
  const payment = useMemo<ReceiptPayment | null>(() => {
    if (!transaction || !isPayment) return null;
    const byId = params.paymentId
      ? transaction.payments.find((entry) => entry.id === params.paymentId)
      : undefined;
    if (byId) return byId;
    if (Number.isInteger(paymentNumber) && paymentNumber > 0) {
      return transaction.payments[paymentNumber - 1] ?? null;
    }
    return null;
  }, [isPayment, params.paymentId, paymentNumber, transaction]);
  const document = useMemo<ReceiptDocument | null>(() => {
    if (!transaction || !farm.selectedFarm || !settlements.isSuccess) return null;
    const context = {
      transactionType,
      transaction,
      settlements: settlements.data,
      farmName: farm.selectedFarm.name,
      farmLocation: farm.selectedFarm.location,
      farmPhone: farm.selectedFarm.phone_number,
      farmEmail: farm.selectedFarm.email,
      counterpartyName,
      currency: theme.currency,
    } satisfies ReceiptContext;
    if (isPayment) {
      if (!payment || !Number.isInteger(paymentNumber) || paymentNumber < 1) {
        return null;
      }
      return {
        ...context,
        kind: "payment",
        payment,
        paymentNumber,
      };
    }
    return { ...context, kind: "transaction" };
  }, [
    counterpartyName,
    farm.selectedFarm,
    isPayment,
    payment,
    paymentNumber,
    settlements.data,
    settlements.isSuccess,
    theme.currency,
    transaction,
    transactionType,
  ]);
  const generationKey = document
    ? [
        document.transaction.id,
        document.transaction.updated_at,
        document.kind,
        document.settlements
          .map((settlement) => `${settlement.id}:${settlement.total_value}`)
          .join("|"),
        document.kind === "payment"
          ? `${document.payment.id ?? document.paymentNumber}:${document.payment.amount}`
          : "",
      ].join(":")
    : null;
  const [tearingKey, setTearingKey] = useState<string | null>(null);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  useEffect(() => {
    if (!generationKey) return;
    const tearTimer = setTimeout(
      () => setTearingKey(generationKey),
      1020,
    );
    const readyTimer = setTimeout(
      () => setReadyKey(generationKey),
      1660,
    );
    return () => {
      clearTimeout(tearTimer);
      clearTimeout(readyTimer);
    };
  }, [generationKey]);
  const phase: GenerationPhase =
    generationKey && readyKey === generationKey
      ? "ready"
      : generationKey && tearingKey === generationKey
        ? "tearing"
        : "printing";

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <FarmPageHeader title="Receipt" showBack />
        {detail.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={theme.primary} />
            <AppText tone="secondary">Loading transaction…</AppText>
          </View>
        ) : null}
        {!detail.isLoading && !detail.isError && settlements.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color={theme.primary} />
            <AppText tone="secondary">Loading settlement history…</AppText>
          </View>
        ) : null}
        {detail.isError ? (
          <Card style={styles.stateCard}>
            <Ionicons
              name="cloud-offline-outline"
              size={28}
              color={theme.danger}
            />
            <AppText weight="semibold">Couldn’t load this transaction</AppText>
            <AppText size="small" tone="secondary" style={styles.centered}>
              {normalizeApiError(detail.error).message}
            </AppText>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => void detail.refetch()}
            />
          </Card>
        ) : null}
        {settlements.isError ? (
          <Card style={styles.stateCard}>
            <Ionicons
              name="cloud-offline-outline"
              size={28}
              color={theme.danger}
            />
            <AppText weight="semibold">
              Couldn’t load transaction settlements
            </AppText>
            <AppText size="small" tone="secondary" style={styles.centered}>
              {normalizeApiError(settlements.error).message}
            </AppText>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => void settlements.refetch()}
            />
          </Card>
        ) : null}
        {document && phase !== "ready" ? (
          <View style={styles.generation}>
            <ReceiptPrinterAnimation
              document={document}
              phase={phase}
              key={`${transactionId}-${documentKind}-${paymentNumber}`}
            />
            <View style={styles.generationStatus}>
              {phase === "tearing" ? (
                <Ionicons
                  name="cut-outline"
                  size={19}
                  color={theme.secondary}
                />
              ) : (
                <ActivityIndicator size="small" color={theme.primary} />
              )}
              <AppText weight="semibold">
                {phase === "tearing"
                  ? "Finishing your receipt…"
                  : "Printing your receipt…"}
              </AppText>
            </View>
            <AppText size="small" tone="secondary" style={styles.centered}>
              Just a moment — your receipt is being prepared.
            </AppText>
          </View>
        ) : null}
        {document && phase === "ready" ? (
          <>
            <View style={styles.readyNotice}>
              <View
                style={[
                  styles.readyIcon,
                  { backgroundColor: `${theme.success}18` },
                ]}
              >
                <Ionicons
                  name="checkmark"
                  size={21}
                  color={theme.success}
                />
              </View>
              <View style={styles.readyCopy}>
                <AppText weight="semibold">Receipt ready</AppText>
                <AppText size="small" tone="secondary">
                  Review it below, then share, save, or print a fresh copy.
                </AppText>
              </View>
            </View>
            <ReceiptPreview document={document} />
            <ReceiptActionButtons document={document} />
          </>
        ) : null}
        {!detail.isLoading &&
        !detail.isError &&
        !settlements.isLoading &&
        !settlements.isError &&
        transaction &&
        isPayment &&
        !document ? (
          <Card style={styles.stateCard}>
            <Ionicons
              name="receipt-outline"
              size={28}
              color={theme.secondary}
            />
            <AppText weight="semibold">Payment not found</AppText>
            <AppText size="small" tone="secondary" style={styles.centered}>
              This payment may have changed since the transaction was opened.
              Go back and generate its receipt again.
            </AppText>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ReceiptPrinterAnimation({
  document,
  phase,
}: {
  document: ReceiptDocument;
  phase: GenerationPhase;
}) {
  const { theme } = useTheme();
  const feed = useSharedValue(0);
  const tear = useSharedValue(0);
  const paperStyle = useAnimatedStyle(() => ({
    height: interpolate(feed.value, [0, 1], [0, 158]),
    opacity: interpolate(feed.value, [0, 0.1, 1], [0, 1, 1]),
  }));
  const tearStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(tear.value, [0, 1], [0, 7]) }],
  }));

  useEffect(() => {
    feed.set(withTiming(1, {
      duration: 1120,
      easing: Easing.out(Easing.cubic),
    }));
    tear.set(withDelay(
      1030,
      withTiming(1, { duration: 460, easing: Easing.inOut(Easing.quad) }),
    ));
  }, [feed, tear]);

  const number =
    document.transaction.reference_number ?? document.transaction.id;
  const amount =
    document.kind === "payment"
      ? document.payment.amount
      : document.transaction.transaction_total;

  return (
    <View style={styles.printerStage}>
      <Animated.View
        style={[
          styles.animatedPaper,
          paperStyle,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
          },
        ]}
      >
        <AppText size="small" weight="semibold" style={styles.miniBrand}>
          FARMTRACK
        </AppText>
        <View style={[styles.miniRule, { backgroundColor: theme.border }]} />
        <AppText size="small" tone="secondary" style={styles.miniTitle}>
          {document.kind === "payment" ? "PAYMENT RECEIPT" : "SALE / PURCHASE"}
        </AppText>
        <AppText size="small" tone="secondary">
          Ref {number}
        </AppText>
        <View style={[styles.miniRule, { backgroundColor: theme.border }]} />
        <View style={styles.miniRow}>
          <AppText size="small" tone="secondary">
            {document.kind === "payment" ? "AMOUNT" : "TOTAL"}
          </AppText>
          <AppText size="small" weight="semibold">
            {formatMoney(amount, document.currency)}
          </AppText>
        </View>
        {phase === "tearing" ? (
          <Animated.View style={[styles.tearLine, tearStyle]}>
            <View style={[styles.miniRule, { backgroundColor: theme.border }]} />
            <Ionicons
              name="cut-outline"
              size={13}
              color={theme.secondary}
              style={styles.scissor}
            />
          </Animated.View>
        ) : null}
      </Animated.View>
      <View style={[styles.printer, { backgroundColor: theme.primary }]}>
        <View
          style={[
            styles.printerSlot,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        />
        <View style={styles.printerControls}>
          <View
            style={[
              styles.printerLight,
              { backgroundColor: phase === "tearing" ? theme.success : theme.secondary },
            ]}
          />
          <AppText size="small" weight="semibold" style={{ color: theme.onPrimary }}>
            RECEIPT PRINTER
          </AppText>
          <Ionicons name="receipt-outline" size={18} color={theme.onPrimary} />
        </View>
      </View>
    </View>
  );
}

function ReceiptPreview({ document }: { document: ReceiptDocument }) {
  const { theme } = useTheme();
  const { transaction, currency, transactionType } = document;
  const isSale = transactionType === "sale";
  const isPayment = document.kind === "payment";
  const due = Number(transaction.balance_due);
  const credit = Number(transaction.credit_balance);
  const status =
    transaction.status.toLowerCase() === "cancelled"
      ? "Cancelled"
      : credit > 0
        ? isSale
          ? "Customer credit"
          : "Supplier credit"
        : due > 0
          ? Number(transaction.amount_paid) > 0
            ? "Partially paid"
            : "Unpaid"
          : "Paid in full";
  const balanceLabel =
    credit > 0
      ? isSale
        ? "Customer credit"
        : "Supplier credit"
      : isSale
        ? "Customer owes the farm"
        : "Farm owes the supplier";
  const receiptNumber =
    isPayment
      ? document.payment.reference_number ||
        document.payment.id ||
        `${transaction.reference_number ?? transaction.id}-PAY-${document.paymentNumber}`
      : transaction.reference_number ?? transaction.id;
  const transactionDate = isPayment
    ? document.payment.payment_date
    : transaction.transaction_date;

  return (
    <View style={styles.ticketWrap}>
      <View
        style={[
          styles.ticket,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
          },
        ]}
      >
        <View
          style={[
            styles.ticketAccent,
            { backgroundColor: isSale ? theme.primary : theme.secondary },
          ]}
        />
        <AppText size="heading" weight="semibold" style={styles.ticketBrand}>
          {document.farmName}
        </AppText>
        {document.farmLocation || document.farmPhone || document.farmEmail ? (
          <AppText size="small" tone="secondary" style={styles.ticketContact}>
            {[document.farmLocation, document.farmPhone, document.farmEmail]
              .filter(Boolean)
              .join("  ·  ")}
          </AppText>
        ) : null}
        <AppText
          size="small"
          weight="semibold"
          style={[styles.ticketTitle, { color: theme.primary }]}
        >
          {isPayment
            ? isSale
              ? "PAYMENT RECEIPT"
              : "PAYMENT RECORD"
            : isSale
              ? "SALE RECEIPT"
              : "PURCHASE RECORD"}
        </AppText>
        <View style={[styles.ticketRule, { borderColor: theme.border }]} />
        <TicketMeta label="Receipt no." value={receiptNumber} />
        <TicketMeta label="Date" value={formatDate(transactionDate)} />
        <TicketMeta
          label={isSale ? "Customer" : "Supplier"}
          value={document.counterpartyName || "Walk-in"}
        />
        {!isPayment ? (
          <>
            <View style={[styles.ticketRule, { borderColor: theme.border }]} />
            <View style={styles.itemsHeading}>
              <AppText size="small" weight="semibold">
                DESCRIPTION
              </AppText>
              <AppText size="small" weight="semibold">
                AMOUNT
              </AppText>
            </View>
            {transaction.items.map((item) => (
              <View key={item.id} style={styles.ticketItem}>
                <View style={styles.ticketItemTop}>
                  <AppText weight="semibold" style={styles.ticketItemName}>
                    {item.product_name || "Item"}
                  </AppText>
                  <AppText weight="semibold">
                    {formatMoney(item.total_amount, currency)}
                  </AppText>
                </View>
                <AppText size="small" tone="secondary">
                  {formatQuantity(item.quantity)} {item.unit_name || ""}
                  {"  ×  "}
                  {formatMoney(item.unit_price, currency)}
                </AppText>
                {item.notes ? (
                  <AppText size="small" tone="secondary">
                    {item.notes}
                  </AppText>
                ) : null}
              </View>
            ))}
            {Number(transaction.discount_amount ?? 0) > 0 ? (
              <TicketMeta
                label="Discount"
                value={`− ${formatMoney(transaction.discount_amount ?? 0, currency)}`}
              />
            ) : null}
            <View style={[styles.ticketTotal, { borderColor: theme.border }]}>
              <AppText weight="semibold">TOTAL</AppText>
              <AppText size="body" weight="semibold">
                {formatMoney(transaction.transaction_total, currency)}
              </AppText>
            </View>
            {transaction.payments.map((entry, index) => (
              <TicketMeta
                key={entry.id ?? `${entry.payment_date}-${index}`}
                label={`${labelize(entry.payment_method)} · ${formatDate(entry.payment_date)}`}
                value={formatMoney(entry.amount, currency)}
              />
            ))}
            {!transaction.payments.length ? (
              <AppText size="small" tone="secondary" style={styles.noPayments}>
                No payments recorded
              </AppText>
            ) : null}
            <TicketMeta
              label="Paid to date"
              value={formatMoney(transaction.amount_paid, currency)}
              strong
            />
            {due > 0 ? (
              <TicketMeta
                label={balanceLabel}
                value={formatMoney(transaction.balance_due, currency)}
                strong
                color={theme.danger}
              />
            ) : null}
            {credit > 0 ? (
              <TicketMeta
                label={balanceLabel}
                value={formatMoney(transaction.credit_balance, currency)}
                strong
                color={theme.primary}
              />
            ) : null}
            <View
              style={[
                styles.statusPill,
                { backgroundColor: `${due > 0 ? theme.secondary : theme.success}18` },
              ]}
            >
              <AppText
                size="small"
                weight="semibold"
                style={{ color: due > 0 ? theme.secondary : theme.success }}
              >
                {status.toUpperCase()}
              </AppText>
            </View>
          </>
        ) : (
          <>
            <View style={[styles.ticketRule, { borderColor: theme.border }]} />
            <View
              style={[
                styles.paymentAmount,
                { backgroundColor: `${theme.success}12` },
              ]}
            >
              <AppText size="small" weight="semibold" tone="secondary">
                {isSale ? "AMOUNT RECEIVED" : "AMOUNT PAID"}
              </AppText>
              <AppText size="heading" weight="semibold" style={{ color: theme.success }}>
                {formatMoney(document.payment.amount, currency)}
              </AppText>
            </View>
            <TicketMeta
              label="Method"
              value={labelize(document.payment.payment_method)}
            />
            {document.payment.reference_number ? (
              <TicketMeta
                label="Payment ref."
                value={document.payment.reference_number}
              />
            ) : null}
            {due > 0 || credit > 0 ? (
              <TicketMeta
                label={balanceLabel}
                value={formatMoney(due > 0 ? transaction.balance_due : transaction.credit_balance, currency)}
                strong
                color={due > 0 ? theme.danger : theme.primary}
              />
            ) : null}
            <View style={[styles.ticketRule, { borderColor: theme.border }]} />
            <TicketMeta
              label="Transaction"
              value={transaction.reference_number ?? transaction.id}
            />
            {!isSale ? (
              <AppText size="small" tone="secondary" style={styles.recordNote}>
                Farm-generated payment record · Not supplier-issued
              </AppText>
            ) : null}
          </>
        )}
        {transaction.notes ? (
          <AppText
            size="small"
            tone="secondary"
            style={[styles.ticketNote, { borderColor: theme.border }]}
          >
            Note: {transaction.notes}
          </AppText>
        ) : null}
        <View style={[styles.ticketRule, { borderColor: theme.border }]} />
        <AppText size="small" weight="semibold" style={styles.ticketThanks}>
          {isPayment
            ? isSale
              ? "Payment received. Thank you!"
              : "Keep this payment record."
            : isSale
              ? "Thank you for your business!"
              : "Keep this purchase record."}
        </AppText>
        {!isSale ? (
          <AppText size="small" tone="secondary" style={styles.ticketContact}>
            This record does not replace a receipt from the supplier.
          </AppText>
        ) : null}
        <View style={styles.ticketPerforation}>
          {Array.from({ length: 28 }, (_, index) => (
            <View
              key={index}
              style={[
                styles.perforationDot,
                { backgroundColor: theme.background },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function TicketMeta({
  label,
  value,
  strong = false,
  color,
}: {
  label: string;
  value: string;
  strong?: boolean;
  color?: string;
}) {
  return (
    <View style={styles.metaLine}>
      <AppText size="small" tone="secondary" style={styles.metaLabel}>
        {label}
      </AppText>
      <AppText
        size="small"
        weight="semibold"
        style={[styles.metaValue, color ? { color } : null]}
      >
        {value}
      </AppText>
    </View>
  );
}

function formatMoney(value: number | string, currency: string): string {
  return `${currency} ${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)}`;
}

function formatQuantity(value: number | string): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(
    Number(value) || 0,
  );
}

function formatDate(value?: string): string {
  if (!value) return "Date not recorded";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function labelize(value: string): string {
  return value
    .split(/[_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 36,
    gap: 16,
  },
  loading: { alignItems: "center", paddingVertical: 36, gap: 12 },
  stateCard: { alignItems: "center", gap: 10, padding: 22 },
  centered: { textAlign: "center" },
  generation: { alignItems: "center", gap: 12, paddingVertical: 12 },
  printerStage: {
    width: "100%",
    maxWidth: 330,
    height: 245,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  animatedPaper: {
    position: "absolute",
    zIndex: 1,
    bottom: 76,
    width: 218,
    overflow: "hidden",
    paddingHorizontal: 15,
    paddingTop: 13,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  miniBrand: { textAlign: "center", letterSpacing: 1.5 },
  miniTitle: { textAlign: "center", marginBottom: 5, letterSpacing: 0.6 },
  miniRule: { height: 1, marginVertical: 6 },
  miniRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  tearLine: { marginTop: 5 },
  scissor: { position: "absolute", right: 0, top: -3 },
  printer: {
    zIndex: 2,
    width: "78%",
    height: 83,
    justifyContent: "flex-end",
    paddingHorizontal: 15,
    paddingBottom: 12,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 19,
    borderBottomRightRadius: 19,
    elevation: 5,
  },
  printerSlot: {
    position: "absolute",
    top: 0,
    left: 16,
    right: 16,
    height: 9,
    borderBottomWidth: 2,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  printerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  printerLight: { width: 9, height: 9, borderRadius: 5 },
  generationStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  readyNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 13,
    borderRadius: 13,
  },
  readyIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  readyCopy: { flex: 1, gap: 2 },
  ticketWrap: {
    width: "100%",
    alignItems: "center",
    paddingVertical: 4,
  },
  ticket: {
    position: "relative",
    width: "100%",
    maxWidth: 410,
    overflow: "hidden",
    paddingHorizontal: 20,
    paddingTop: 23,
    paddingBottom: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 5,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  ticketAccent: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 5,
  },
  ticketBrand: { textAlign: "center" },
  ticketContact: { textAlign: "center", marginTop: 4 },
  ticketTitle: { textAlign: "center", marginTop: 16, letterSpacing: 1.4 },
  ticketRule: { marginVertical: 12, borderTopWidth: 1, borderStyle: "dashed" },
  metaLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 4,
  },
  metaLabel: { flex: 1, minWidth: 0 },
  metaValue: { maxWidth: "62%", flexShrink: 1, textAlign: "right" },
  itemsHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 6,
  },
  ticketItem: {
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
  },
  ticketItemTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  ticketItemName: { flex: 1 },
  ticketTotal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 7,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  noPayments: { paddingVertical: 6 },
  statusPill: {
    alignSelf: "flex-start",
    marginTop: 9,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  paymentAmount: {
    alignItems: "center",
    gap: 3,
    marginVertical: 7,
    paddingVertical: 12,
    borderRadius: 10,
  },
  recordNote: {
    marginTop: 10,
    padding: 9,
    textAlign: "center",
    borderRadius: 7,
    overflow: "hidden",
  },
  ticketNote: {
    marginTop: 8,
    paddingTop: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ticketThanks: { textAlign: "center" },
  ticketPerforation: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -5,
    flexDirection: "row",
    justifyContent: "space-around",
  },
  perforationDot: { width: 10, height: 10, borderRadius: 5 },
});
