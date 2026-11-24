import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
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
import { isChickenPurchaseItem, type ChickenPurchaseResult } from "@/features/chickens/api";
import { useChickenPurchaseDetails } from "@/features/chickens/hooks";
import {
  usePurchaseReplacements,
  usePurchaseReturns,
  useSupplierRefunds,
  useTransactionSettlements,
} from "@/features/management/hooks";
import type {
  CashRefundRecord,
  PurchaseReplacementHistory,
  RecordedReturn,
  TransactionSettlement,
} from "@/features/management/api";
import { GenerateReceiptButton } from "@/features/receipts/receipt-actions";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

export default function PurchaseDetailsRoute() {
  return (
    <SessionGate>
      <PurchaseDetailsContent />
    </SessionGate>
  );
}

function PurchaseDetailsContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const [referenceCopied, setReferenceCopied] = useState(false);
  const { purchaseId } = useLocalSearchParams<{ purchaseId: string }>();
  const detail = useChickenPurchaseDetails(
    user?.id,
    farm.selectedFarm?.id,
    purchaseId,
  );
  const settlements = useTransactionSettlements(
    user?.id,
    farm.selectedFarm?.id,
    purchaseId,
  );
  const returns = usePurchaseReturns(user?.id, farm.selectedFarm?.id, purchaseId);
  const refunds = useSupplierRefunds(user?.id, farm.selectedFarm?.id, purchaseId);
  const replacements = usePurchaseReplacements(
    user?.id,
    farm.selectedFarm?.id,
    purchaseId,
  );
  const purchase = detail.data;
  const transaction = purchase?.transaction;
  const auditTrail = useMemo(
    () =>
      transaction
        ? buildPurchaseAuditTrail(
            transaction,
            settlements.data ?? [],
            returns.data ?? [],
            refunds.data ?? [],
            replacements.data ?? [],
          )
        : [],
    [
      transaction,
      settlements.data,
      returns.data,
      refunds.data,
      replacements.data,
    ],
  );
  const balanceTone =
    Number(transaction?.balance_due) > 0 ? theme.secondary : theme.success;
  const otherBalances =
    purchase?.outstanding_supplier_balances.filter(
      (balance) => balance.id !== transaction?.id,
    ) ?? [];
  const outstandingChickenCount =
    transaction?.items.reduce(
      (total, item) =>
        total +
        (isChickenPurchaseItem(item) ? Number(item.quantity_remaining) : 0),
      0,
    ) ?? 0;
  const totalChickenCount =
    transaction?.items
      .filter(isChickenPurchaseItem)
      .reduce(
        (total, item) =>
          total + Number(item.ordered_base_quantity ?? item.quantity),
        0,
      ) ?? 0;
  const receivedChickenCount =
    transaction?.items
      .filter(isChickenPurchaseItem)
      .reduce((total, item) => total + Number(item.quantity_received), 0) ?? 0;
  const deliveryProgress =
    totalChickenCount > 0
      ? Math.min(1, receivedChickenCount / totalChickenCount)
      : 0;
  const purchaseTotal = Number(transaction?.transaction_total ?? 0);
  const amountPaid = Number(transaction?.amount_paid ?? 0);
  const balanceDue = Number(transaction?.balance_due ?? 0);
  const creditBalance = Number(transaction?.credit_balance ?? 0);
  const paidProgress =
    purchaseTotal > 0 ? Math.min(1, amountPaid / purchaseTotal) : 0;
  const batchSummaries = (purchase?.receipts ?? [])
    .flatMap((receipt) =>
      receipt.items.map((received) => ({
        receiptId: receipt.id,
        received,
        purchaseItem: transaction?.items.find(
          (item) => item.id === received.transaction_item_id,
        ),
      })),
    )
    .reduce<
      {
        key: string;
        name: string;
        chickenType: string | null;
        hatchDate: string | null;
        quantity: number;
        receiptIds: string[];
        blocks: { id: string; name: string; quantity: number }[];
      }[]
    >((summaries, entry) => {
      const { received, purchaseItem } = entry;
      const key = received.batch_id ?? received.batch_name ?? `unassigned-${received.id}`;
      let summary = summaries.find((candidate) => candidate.key === key);
      if (!summary) {
        summary = {
          key,
          name: received.batch_name ?? "Batch not assigned",
          chickenType: purchaseItem?.chicken_type ?? null,
          hatchDate: received.hatch_date,
          quantity: 0,
          receiptIds: [],
          blocks: [],
        };
        summaries.push(summary);
      }
      summary.quantity += Number(received.quantity_received);
      if (!summary.receiptIds.includes(entry.receiptId)) {
        summary.receiptIds.push(entry.receiptId);
      }
      summary.hatchDate ??= received.hatch_date;
      for (const allocation of received.block_allocations) {
        const block = summary.blocks.find(
          (candidate) => candidate.id === allocation.block_id,
        );
        if (block) {
          block.quantity += allocation.quantity;
        } else {
          summary.blocks.push({
            id: allocation.block_id,
            name: allocation.block_name ?? "Housing",
            quantity: allocation.quantity,
          });
        }
      }
      return summaries;
    }, []);

  async function copyReference() {
    const reference = transaction?.reference_number;
    if (!reference) return;
    try {
      setReferenceCopied(false);
      await Clipboard.setStringAsync(reference);
      setReferenceCopied(true);
    } catch (error: unknown) {
      await dialog.showDialog({
        title: "Couldn’t copy reference",
        message: normalizeApiError(error).message,
        tone: "error",
      });
    }
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={detail.isRefetching}
            onRefresh={() => {
              void Promise.all([
                detail.refetch(),
                settlements.refetch(),
                returns.refetch(),
                refunds.refetch(),
                replacements.refetch(),
              ]);
            }}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <FarmPageHeader title="Purchase details" showBack />
        {detail.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={theme.primary} />
            <AppText tone="secondary">Loading purchase details…</AppText>
          </View>
        ) : null}
        {detail.isError ? (
          <Card style={styles.stateCard}>
            <Ionicons
              name="cloud-offline-outline"
              size={28}
              color={theme.danger}
            />
            <AppText weight="semibold">
              Couldn’t load this purchase
            </AppText>
            <AppText tone="secondary" style={styles.centered}>
              {normalizeApiError(detail.error).message}
            </AppText>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => void detail.refetch()}
            />
          </Card>
        ) : null}
        {purchase && transaction ? (
          <>
            <Card style={styles.hero}>
              <View style={styles.heroTop}>
                <View style={styles.heroTitle}>
                  <AppText size="heading" weight="semibold">
                    {purchase.supplier_name ?? "Supplier not recorded"}
                  </AppText>
                  <AppText size="small" tone="secondary">
                    {transaction.status === "cancelled"
                      ? "Cancelled purchase"
                      : `Purchased ${formatDate(transaction.transaction_date)}`}
                  </AppText>
                </View>
              </View>
              {transaction.reference_number ? (
                <View style={styles.referenceRow}>
                  <AppText size="small" tone="secondary" style={styles.referenceText}>
                    Reference · {transaction.reference_number}
                  </AppText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Copy purchase reference"
                    onPress={() => void copyReference()}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.copyButton,
                      { opacity: pressed ? 0.65 : 1 },
                    ]}
                  >
                    <Ionicons
                      name={referenceCopied ? "checkmark" : "copy-outline"}
                      size={16}
                      color={referenceCopied ? theme.success : theme.primary}
                    />
                    <AppText
                      size="small"
                      weight="semibold"
                      style={{
                        color: referenceCopied ? theme.success : theme.primary,
                      }}
                    >
                      {referenceCopied ? "Copied" : "Copy"}
                    </AppText>
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.heroAmountRow}>
                <View style={styles.heroTotal}>
                  <AppText size="small" tone="secondary">
                    {transaction.status === "cancelled"
                      ? "Purchase cancelled"
                      : balanceDue > 0
                        ? "Still to pay"
                        : creditBalance > 0
                          ? "Supplier credit"
                          : "Purchase total · settled"}
                  </AppText>
                  <AppText
                    size="heading"
                    weight="semibold"
                    style={{ color: balanceTone }}
                  >
                    {transaction.status === "cancelled"
                      ? "No balance"
                      : formatMoney(
                          balanceDue > 0
                            ? balanceDue
                            : creditBalance > 0
                              ? creditBalance
                              : purchaseTotal,
                          theme.currency,
                        )}
                  </AppText>
                </View>
              </View>
              {transaction.status !== "cancelled" ? (
                <>
                  <View
                    style={[
                      styles.progressTrack,
                      { backgroundColor: theme.border },
                    ]}
                  >
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${paidProgress * 100}%`,
                          backgroundColor:
                            balanceDue > 0 ? theme.secondary : theme.success,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.financialSummary}>
                    <DetailLine
                      label="Purchase total"
                      value={formatMoney(purchaseTotal, theme.currency)}
                    />
                    <DetailLine
                      label="Payments recorded"
                      value={formatMoney(amountPaid, theme.currency)}
                    />
                  </View>
                  {creditBalance > 0 ? (
                    <AppText size="small" tone="secondary">
                      {formatMoney(creditBalance, theme.currency)} credit is available with this supplier.
                    </AppText>
                  ) : null}
                </>
              ) : null}
              {transaction.items.some(isChickenPurchaseItem) ? (
                <View
                  style={[
                    styles.deliverySummary,
                    { borderTopColor: theme.border },
                  ]}
                >
                  <View style={styles.deliverySummaryHeading}>
                    <View style={styles.deliverySummaryTitle}>
                      <AppText weight="semibold">Chicken delivery</AppText>
                      <AppText size="small" tone="secondary">
                        {outstandingChickenCount > 0
                          ? `${formatQuantity(outstandingChickenCount)} ${pluralizeUnit("bird", outstandingChickenCount)} still expected`
                          : "All chickens received"}
                      </AppText>
                    </View>
                    <AppText size="small" weight="semibold">
                      {formatQuantity(receivedChickenCount)} of {formatQuantity(totalChickenCount)}
                    </AppText>
                  </View>
                  <View
                    style={[
                      styles.progressTrack,
                      { backgroundColor: theme.border },
                    ]}
                  >
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${deliveryProgress * 100}%`,
                          backgroundColor: theme.success,
                        },
                      ]}
                    />
                  </View>
                </View>
              ) : null}
              <View style={styles.heroFooter}>
                <GenerateReceiptButton
                  transactionId={purchaseId}
                  transactionType="purchase"
                  compact
                />
              </View>
              {transaction.notes ? (
                <AppText size="small" tone="secondary" style={styles.notes}>
                  {transaction.notes}
                </AppText>
              ) : null}
            </Card>

            <Card style={styles.actionsCard}>
              <View style={styles.actionsHeading}>
                <View style={styles.actionsTitleCopy}>
                  <AppText weight="semibold">Next steps</AppText>
                </View>
              </View>
              {outstandingChickenCount > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Record receipt, ${formatQuantity(outstandingChickenCount)} chickens remaining`}
                  onPress={() =>
                    router.push({
                      pathname: "/purchases/[purchaseId]/receive",
                      params: {
                        purchaseId,
                      },
                    })
                  }
                  style={({ pressed }) => [
                    styles.primaryAction,
                    {
                      backgroundColor: `${theme.primary}0D`,
                      borderColor: `${theme.primary}45`,
                      opacity: pressed ? 0.82 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.primaryActionIcon,
                      { backgroundColor: `${theme.primary}18` },
                    ]}
                  >
                    <Ionicons
                      name="cube-outline"
                      size={21}
                      color={theme.primary}
                    />
                  </View>
                  <View style={styles.actionCopy}>
                    <AppText weight="semibold">Record goods received</AppText>
                    <AppText size="small" tone="secondary">
                      {formatQuantity(outstandingChickenCount)} chickens still
                      expected
                    </AppText>
                  </View>
                  <Ionicons
                    name="arrow-forward"
                    size={19}
                    color={theme.primary}
                  />
                </Pressable>
              ) : null}
              <View
                style={[
                  styles.secondaryActions,
                  { borderTopColor: theme.border },
                ]}
              >
                {Number(transaction.balance_due) > 0 ||
                Number(transaction.credit_balance) > 0 ? (
                  <PurchaseActionRow
                    icon="wallet-outline"
                    accent={theme.secondary}
                    title={
                      Number(transaction.balance_due) > 0
                        ? "Settle purchase balance"
                        : "Apply supplier credit"
                    }
                    detail={
                      Number(transaction.balance_due) > 0
                        ? `${formatMoney(transaction.balance_due, theme.currency)} still to pay`
                        : `${formatMoney(transaction.credit_balance, theme.currency)} credit available`
                    }
                    onPress={() =>
                      router.push({
                        pathname: "/transactions/[transactionId]/settlements",
                        params: {
                          transactionId: purchaseId,
                          transactionType: "purchase",
                          balanceDue: String(transaction.balance_due),
                          creditBalance: String(transaction.credit_balance),
                          accountBalanceTotal: String(purchase.supplier_balance_total),
                          accountCreditTotal: String(purchase.supplier_credit_total),
                          contactName: purchase.supplier_name ?? "Supplier",
                          referenceNumber: transaction.reference_number ?? "",
                        },
                      })
                    }
                  />
                ) : null}
                {Number(transaction.balance_due) > 0 ||
                Number(transaction.credit_balance) > 0 ? (
                  <View
                    style={[
                      styles.actionDivider,
                      { backgroundColor: theme.border },
                    ]}
                  />
                ) : null}
                <PurchaseActionRow
                  icon="return-down-back-outline"
                  accent={theme.danger}
                  title="Record a product return"
                  detail="Return eligible goods and track the supplier credit."
                  onPress={() =>
                    router.push({
                      pathname: "/transactions/[transactionId]/returns",
                      params: {
                        transactionId: purchaseId,
                        transactionType: "purchase",
                      },
                    })
                  }
                />
              </View>
            </Card>

            <Section
              title="What you bought"
              icon="cart-outline"
              accent={theme.primary}
            >
              {transaction.items.map((item, index) => (
                <View
                  key={item.id}
                  style={[
                    styles.listItem,
                    index > 0 && {
                      borderTopWidth: 1,
                      borderTopColor: theme.border,
                    },
                  ]}
                >
                  <View style={styles.itemHeading}>
                    <View style={styles.itemCopy}>
                      <AppText weight="semibold">
                        {item.product_name ?? "Unnamed product"}
                      </AppText>
                      <AppText size="small" tone="secondary">
                        {item.chicken_type
                          ? labelize(item.chicken_type)
                          : item.product_type === "chickens"
                            ? "Chicken"
                            : labelize(item.product_type ?? "product")}
                        {item.unit_name ? ` · ${item.unit_name}` : ""}
                      </AppText>
                    </View>
                    <AppText
                      weight="semibold"
                      style={{ flexShrink: 1, textAlign: "right" }}
                    >
                      {formatMoney(item.total_amount, theme.currency)}
                    </AppText>
                  </View>
                  <AppText size="small" tone="secondary">
                    {formatQuantity(item.quantity)}{" "}
                    {pluralizeUnit(
                      item.unit_name ??
                        (isChickenPurchaseItem(item) ? "bird" : "unit"),
                      Number(item.quantity),
                    )}
                    {Number(item.unit_price) > 0
                      ? ` × ${formatMoney(item.unit_price, theme.currency)} each`
                      : ""}
                  </AppText>
                  {isChickenPurchaseItem(item) ? (
                    <AppText size="small" tone="secondary">
                      Received {formatQuantity(item.quantity_received)} ·{" "}
                      {formatQuantity(item.quantity_remaining)} still expected
                    </AppText>
                  ) : null}
                  {item.notes ? (
                    <AppText size="small" tone="secondary">
                      {item.notes}
                    </AppText>
                  ) : null}
                </View>
              ))}
              {Number(transaction.discount_amount) > 0 ? (
                <View style={styles.discountLine}>
                  <AppText tone="secondary">
                    Discount
                    {transaction.discount_reason
                      ? ` · ${transaction.discount_reason}`
                      : ""}
                  </AppText>
                  <AppText weight="semibold" style={{ color: theme.success }}>
                    −{formatMoney(transaction.discount_amount, theme.currency)}
                  </AppText>
                </View>
              ) : null}
              <View
                style={[
                  styles.purchaseTotalLine,
                  { borderTopColor: theme.border },
                ]}
              >
                <AppText size="small" tone="secondary">
                  Subtotal before discount
                </AppText>
                <AppText size="small" weight="semibold">
                  {formatMoney(
                    purchaseTotal + Number(transaction.discount_amount),
                    theme.currency,
                  )}
                </AppText>
              </View>
              {Number(transaction.discount_amount) > 0 ? (
                <View style={styles.discountLine}>
                  <AppText size="small" tone="secondary">
                    Discount
                    {transaction.discount_reason
                      ? ` · ${transaction.discount_reason}`
                      : ""}
                  </AppText>
                  <AppText size="small" weight="semibold" style={{ color: theme.success }}>
                    −{formatMoney(transaction.discount_amount, theme.currency)}
                  </AppText>
                </View>
              ) : null}
              <View style={styles.purchaseTotalLine}>
                <AppText weight="semibold">Purchase total</AppText>
                <AppText weight="semibold">
                  {formatMoney(purchaseTotal, theme.currency)}
                </AppText>
              </View>
            </Section>

            {transaction.items.some(isChickenPurchaseItem) ? (
              <Section
                title="Delivery and batches"
                icon="home-outline"
                accent={theme.secondary}
              >
                {purchase.receipts.length === 0 ? (
                  <View style={[styles.receiptEmpty, { backgroundColor: theme.background }]}>
                    <Ionicons name="cube-outline" size={20} color={theme.textSecondary} />
                    <View style={styles.itemCopy}>
                      <AppText size="small" weight="semibold">No delivery recorded yet</AppText>
                      <AppText size="small" tone="secondary">
                        Batch and housing details will appear after the first delivery.
                      </AppText>
                    </View>
                  </View>
                ) : (
                  <>
                    <View style={styles.subsectionHeading}>
                      <AppText size="small" tone="secondary">
                        {batchSummaries.length}{" "}
                        {batchSummaries.length === 1 ? "batch" : "batches"} from these deliveries
                      </AppText>
                    </View>
                    {batchSummaries.map((batch) => (
                      <View
                        key={batch.key}
                        style={[
                          styles.batchSummary,
                          { backgroundColor: theme.background, borderColor: theme.border },
                        ]}
                      >
                        <View style={styles.batchSummaryTop}>
                          <View style={[styles.batchIcon, { backgroundColor: `${theme.primary}12` }]}>
                            <Ionicons name="layers-outline" size={18} color={theme.primary} />
                          </View>
                          <View style={styles.itemCopy}>
                            <AppText weight="semibold">{batch.name}</AppText>
                            <AppText size="small" tone="secondary">
                              {batch.chickenType ? labelize(batch.chickenType) : "Chicken batch"}
                              {batch.hatchDate ? ` · Hatched ${formatDate(batch.hatchDate)}` : ""}
                            </AppText>
                          </View>
                          <View style={[styles.batchQuantityBadge, { backgroundColor: `${theme.success}12` }]}>
                            <AppText size="small" weight="semibold" style={{ color: theme.success }}>
                              {formatQuantity(batch.quantity)} received
                            </AppText>
                          </View>
                        </View>
                        <View style={styles.batchSummaryFooter}>
                          <AppText size="small" tone="secondary">
                            {batch.receiptIds.length} {batch.receiptIds.length === 1 ? "delivery" : "deliveries"} for this purchase
                          </AppText>
                          {batch.blocks.length ? (
                            <View style={styles.batchBlockList}>
                              {batch.blocks.map((block) => (
                                <View key={block.id} style={[styles.blockTag, { backgroundColor: theme.backgroundSelected }]}>
                                  <Ionicons name="home-outline" size={13} color={theme.primary} />
                                  <AppText size="small" style={{ color: theme.primary }}>
                                    {block.name} · {formatQuantity(block.quantity)}
                                  </AppText>
                                </View>
                              ))}
                            </View>
                          ) : null}
                        </View>
                      </View>
                    ))}

                    <View style={styles.subsectionHeading}>
                      <AppText weight="semibold">Delivery history</AppText>
                    </View>
                    {[...purchase.receipts]
                      .sort((first, second) =>
                        `${second.received_date}${second.received_time ?? ""}`.localeCompare(
                          `${first.received_date}${first.received_time ?? ""}`,
                        ),
                      )
                      .map((receipt, index) => {
                        const receiptTotal = receipt.items.reduce(
                          (total, received) => total + Number(received.quantity_received),
                          0,
                        );
                        return (
                          <View
                            key={receipt.id}
                            style={[
                              styles.receiptCard,
                              { backgroundColor: theme.background, borderColor: theme.border },
                            ]}
                          >
                            <View style={styles.receiptHeading}>
                              <View style={styles.receiptDateRow}>
                                <View style={[styles.receiptNumber, { backgroundColor: `${theme.primary}12` }]}>
                                  <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                                    {String(purchase.receipts.length - index).padStart(2, "0")}
                                  </AppText>
                                </View>
                                <View style={styles.itemCopy}>
                                  <AppText weight="semibold">
                                    {formatDate(receipt.received_date)}
                                  </AppText>
                                  {receipt.received_time ? (
                                    <AppText size="small" tone="secondary">
                                      {receipt.received_time.slice(0, 5)}
                                    </AppText>
                                  ) : null}
                                </View>
                              </View>
                              <View style={[styles.receiptTotalBadge, { backgroundColor: `${theme.success}12` }]}>
                                <AppText size="small" weight="semibold" style={{ color: theme.success }}>
                                  +{formatQuantity(receiptTotal)}
                                </AppText>
                              </View>
                            </View>
                            {receipt.items.map((received) => {
                              const purchaseItem = transaction.items.find(
                                (item) => item.id === received.transaction_item_id,
                              );
                              return (
                                <View
                                  key={received.id}
                                  style={[styles.receiptLine, { borderTopColor: theme.border }]}
                                >
                                  <View style={styles.receiptLineTop}>
                                    <View style={styles.itemCopy}>
                                      <AppText size="small" weight="semibold">
                                        {received.batch_name ?? "Batch not assigned"}
                                      </AppText>
                                      <AppText size="small" tone="secondary">
                                        {purchaseItem?.product_name ?? "Chicken product"}
                                      </AppText>
                                    </View>
                                    <AppText size="small" weight="semibold" style={{ color: theme.success }}>
                                      +{formatQuantity(received.quantity_received)}
                                    </AppText>
                                  </View>
                                  <View style={styles.allocations}>
                                    {received.hatch_date ? (
                                      <View style={[styles.blockTag, { backgroundColor: theme.backgroundSelected }]}>
                                        <Ionicons name="calendar-outline" size={13} color={theme.textSecondary} />
                                        <AppText size="small" tone="secondary">
                                          Hatched {formatDate(received.hatch_date)}
                                        </AppText>
                                      </View>
                                    ) : null}
                                    {received.block_allocations.map((allocation) => (
                                      <View
                                        key={allocation.block_id}
                                        style={[styles.blockTag, { backgroundColor: theme.backgroundSelected }]}
                                      >
                                        <Ionicons name="home-outline" size={13} color={theme.primary} />
                                        <AppText size="small" style={{ color: theme.primary }}>
                                          {allocation.block_name ?? "Housing"} · {formatQuantity(allocation.quantity)}
                                        </AppText>
                                      </View>
                                    ))}
                                  </View>
                                </View>
                              );
                            })}
                            {receipt.notes ? (
                              <View style={[styles.receiptNote, { borderTopColor: theme.border }]}>
                                <Ionicons name="document-text-outline" size={15} color={theme.textSecondary} />
                                <AppText size="small" tone="secondary" style={styles.itemCopy}>
                                  {receipt.notes}
                                </AppText>
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                  </>
                )}
              </Section>
            ) : null}

            <PurchaseHistorySection
              events={auditTrail}
              transactionId={purchaseId}
              currency={theme.currency}
              currentBalance={creditBalance - balanceDue}
              loading={
                settlements.isLoading ||
                returns.isLoading ||
                refunds.isLoading ||
                replacements.isLoading
              }
              complete={
                !settlements.isLoading &&
                !returns.isLoading &&
                !refunds.isLoading &&
                !replacements.isLoading &&
                !settlements.isError &&
                !returns.isError &&
                !refunds.isError &&
                !replacements.isError
              }
              errors={[
                settlements.isError ? settlements.error : null,
                returns.isError ? returns.error : null,
                refunds.isError ? refunds.error : null,
                replacements.isError ? replacements.error : null,
              ].filter((error): error is Error => error instanceof Error)}
              retry={() => {
                void Promise.all([
                  settlements.refetch(),
                  returns.refetch(),
                  refunds.refetch(),
                  replacements.refetch(),
                ]);
              }}
            />

            {transaction.contact_id ? (
              otherBalances.length ? (
                <Section
                  title={`Other purchases with ${purchase.supplier_name ?? "this supplier"}`}
                  icon="swap-horizontal-outline"
                  accent={theme.secondary}
                >
                  {otherBalances.map((balance) => (
                    <Pressable
                      key={balance.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Open purchase ${balance.reference_number ?? ""}, ${Number(balance.balance_due) > 0 ? `balance due ${formatMoney(balance.balance_due, theme.currency)}` : `supplier credit ${formatMoney(balance.credit_balance, theme.currency)}`}`}
                      onPress={() =>
                        router.push({
                          pathname: "/purchases/[purchaseId]",
                          params: { purchaseId: balance.id },
                        })
                      }
                      style={({ pressed }) => [
                        styles.balanceRow,
                        {
                          borderBottomColor: theme.border,
                          opacity: pressed ? 0.65 : 1,
                        },
                      ]}
                    >
                      <View style={styles.paymentCopy}>
                        <AppText weight="semibold">
                          {balance.reference_number ?? "Purchase"}
                        </AppText>
                        <AppText size="small" tone="secondary">
                          {formatDate(balance.transaction_date)}
                        </AppText>
                      </View>
                      <View style={styles.balanceAmount}>
                        <View style={styles.balanceValueCopy}>
                          <AppText
                            size="small"
                            tone="secondary"
                            style={{ textAlign: "right" }}
                          >
                            {Number(balance.balance_due) > 0
                              ? "Still owed"
                              : "Credit"}
                          </AppText>
                          <AppText
                            weight="semibold"
                            style={{
                              flexShrink: 1,
                              textAlign: "right",
                              color:
                                Number(balance.balance_due) > 0
                                  ? theme.secondary
                                  : theme.success,
                            }}
                          >
                            {formatMoney(
                              Number(balance.balance_due) > 0
                                ? balance.balance_due
                                : balance.credit_balance,
                              theme.currency,
                            )}
                          </AppText>
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={17}
                          color={theme.textSecondary}
                        />
                      </View>
                    </Pressable>
                  ))}
                </Section>
              ) : null
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

type PurchaseAuditEntry = {
  id: string;
  type: "purchase" | "payment" | "settlement" | "return" | "refund" | "replacement";
  date: string;
  time: string | null;
  title: string;
  detail: string | null;
  amount: number;
  balanceAfter: number;
  method: string | null;
  reference: string | null;
  notes: string | null;
  components: TransactionSettlement["lines"];
  paymentIndex?: number;
  paymentId?: string;
};

function buildPurchaseAuditTrail(
  transaction: ChickenPurchaseResult,
  settlements: TransactionSettlement[],
  returns: RecordedReturn[],
  refunds: CashRefundRecord[],
  replacements: PurchaseReplacementHistory[],
): PurchaseAuditEntry[] {
  const entries: Omit<PurchaseAuditEntry, "balanceAfter">[] = [
    {
      id: `purchase:${transaction.id}`,
      type: "purchase",
      date: transaction.transaction_date,
      time: null,
      title: transaction.status === "cancelled" ? "Purchase cancelled" : "Purchase recorded",
      detail: null,
      amount: transaction.status === "cancelled" ? 0 : -Number(transaction.transaction_total),
      method: null,
      reference: null,
      notes: null,
      components: [],
    },
    ...transaction.payments.map((payment, index) => ({
      id: `payment:${payment.id ?? `${payment.payment_date ?? transaction.transaction_date}-${index}`}`,
      type: "payment" as const,
      date: payment.payment_date ?? transaction.transaction_date,
      time: payment.payment_time ?? null,
      title: "You paid the supplier",
      detail: null,
      amount: Number(payment.amount),
      method: payment.payment_method,
      reference: payment.reference_number,
      notes: payment.notes ?? null,
      components: [],
      paymentIndex: index + 1,
      paymentId: payment.id,
    })),
    ...settlements.map((settlement) => ({
      id: `settlement:${settlement.id}`,
      type: "settlement" as const,
      date: settlement.settlement_date,
      time: null,
      title: settlement.direction === "farm_to_contact"
        ? "You settled with the supplier"
        : "Supplier settled with you",
      detail: null,
      amount: settlement.direction === "farm_to_contact"
        ? Number(settlement.total_value)
        : -Number(settlement.total_value),
      method: null,
      reference: null,
      notes: settlement.notes,
      components: settlement.lines,
    })),
    ...returns.map((record) => ({
      id: `return:${record.id}`,
      type: "return" as const,
      date: record.return_date,
      time: null,
      title: "Goods returned to supplier",
      detail: [
        record.reason,
        ...record.items.map((item) => {
          const quantity = item.quantity_returned ?? item.quantity;
          return quantity
            ? `${formatQuantity(quantity)} ${item.product_name ?? "items"}`
            : item.product_name ?? "Returned item";
        }),
      ].filter(Boolean).join(" · "),
      amount: Number(record.credit_total),
      method: null,
      reference: null,
      notes: record.notes,
      components: [],
    })),
    ...refunds.map((refund) => ({
      id: `refund:${refund.id}`,
      type: "refund" as const,
      date: refund.refund_date,
      time: null,
      title: "Supplier refunded you",
      detail: refund.reason,
      amount: -Number(refund.amount),
      method: refund.payment_method,
      reference: refund.reference_number ?? null,
      notes: refund.notes ?? null,
      components: [],
    })),
    ...replacements.map((replacement) => ({
      id: `replacement:${replacement.id}`,
      type: "replacement" as const,
      date: replacement.replacement_date,
      time: replacement.replacement_time,
      title: "Replacement received",
      detail: replacement.items.map((item) => {
        const quantity = formatQuantity(item.quantity_received);
        const type = labelize(item.chicken_type);
        const blocks = item.block_allocations
          .map((allocation) => allocation.block_name)
          .filter((name): name is string => Boolean(name));
        return `${quantity} ${type}${blocks.length ? ` · ${blocks.join(", ")}` : ""}`;
      }).join("; "),
      amount: -Number(replacement.credit_applied_total),
      method: null,
      reference: null,
      notes: replacement.notes,
      components: [],
    })),
  ];

  entries.sort((first, second) =>
    first.date.localeCompare(second.date) ||
    (first.time ?? "").localeCompare(second.time ?? "") ||
    getPurchaseAuditOrder(first.type) - getPurchaseAuditOrder(second.type) ||
    first.id.localeCompare(second.id),
  );

  let balance = 0;
  return entries.map((entry) => {
    balance += entry.amount;
    return { ...entry, balanceAfter: balance };
  });
}

function getPurchaseAuditOrder(type: PurchaseAuditEntry["type"]): number {
  return {
    purchase: 0,
    payment: 1,
    settlement: 2,
    return: 3,
    refund: 4,
    replacement: 5,
  }[type];
}

function PurchaseHistorySection({
  events,
  transactionId,
  currency,
  currentBalance,
  loading,
  complete,
  errors,
  retry,
}: {
  events: PurchaseAuditEntry[];
  transactionId: string;
  currency: string;
  currentBalance: number;
  loading: boolean;
  complete: boolean;
  errors: Error[];
  retry: () => void;
}) {
  const { theme } = useTheme();
  const historyMatchesBalance =
    complete &&
    events.length > 0 &&
    Math.abs(events[events.length - 1].balanceAfter - currentBalance) < 0.01;
  return (
    <Section title="Financial history" icon="time-outline" accent={theme.primary}>
      {loading ? (
        <View style={styles.historyLoading}>
          <ActivityIndicator size="small" color={theme.primary} />
          <AppText size="small" tone="secondary">Loading purchase history</AppText>
        </View>
      ) : null}
      {errors.map((error, index) => (
        <View key={`history-error-${index}`} style={[styles.historyError, { borderColor: theme.border }]}>
          <View style={styles.historyErrorCopy}>
            <AppText size="small" weight="semibold">Some purchase history could not be loaded</AppText>
            <AppText size="small" tone="secondary">{normalizeApiError(error).message}</AppText>
          </View>
          <Pressable accessibilityRole="button" onPress={retry} hitSlop={8}>
            <AppText size="small" weight="semibold" style={{ color: theme.primary }}>Retry</AppText>
          </Pressable>
        </View>
      ))}
      {!loading && events.length === 0 ? (
        <AppText size="small" tone="secondary">No purchase events are recorded yet.</AppText>
      ) : null}
      {complete && events.length > 0 && !historyMatchesBalance ? (
        <View
          style={[
            styles.historyMismatch,
            { borderColor: `${theme.secondary}55`, backgroundColor: `${theme.secondary}0D` },
          ]}
        >
          <Ionicons name="information-circle-outline" size={18} color={theme.secondary} />
          <AppText size="small" style={styles.historyMismatchText}>
            These records do not add up to the current purchase balance. The current balance is{" "}
            {getPurchaseBalanceLabel(currentBalance, currency)}. Running balances are hidden until the history reconciles.
          </AppText>
        </View>
      ) : null}
      {events.map((event, index) => {
        const palette = getPurchaseAuditPalette(theme, event.type, event.amount);
        const remaining = getPurchaseBalanceLabel(event.balanceAfter, currency);
        return (
          <View key={event.id} style={styles.historyEvent}>
            <View style={styles.historyRail}>
              <View style={[styles.historyDot, { backgroundColor: palette.accent, borderColor: theme.backgroundElement }]} />
              {index < events.length - 1 ? (
                <View style={[styles.historyConnector, { backgroundColor: theme.border }]} />
              ) : null}
            </View>
            <View style={styles.historyEventBody}>
              <View style={styles.historyEventHeading}>
                <View style={styles.historyEventTitle}>
                  <AppText size="small" weight="semibold">{event.title}</AppText>
                  <AppText size="small" tone="secondary">
                    {formatDate(event.date)}
                    {event.time ? ` · ${formatAuditTime(event.time)}` : ""}
                  </AppText>
                </View>
                {Math.abs(event.amount) > 0.005 ? (
                  <AppText size="small" weight="semibold" style={{ color: palette.accent, textAlign: "right" }}>
                    {formatMoney(Math.abs(event.amount), currency)}
                  </AppText>
                ) : null}
              </View>
              {event.detail ? (
                <AppText size="small" tone="secondary">{event.detail}</AppText>
              ) : null}
              {event.method || event.reference ? (
                <View style={styles.historyMetadata}>
                  {event.method ? (
                    <View style={styles.historyMetadataItem}>
                      <Ionicons name="card-outline" size={13} color={theme.textSecondary} />
                      <AppText size="small" tone="secondary">{labelize(event.method)}</AppText>
                    </View>
                  ) : null}
                  {event.reference ? (
                    <View style={styles.historyMetadataItem}>
                      <Ionicons name="receipt-outline" size={13} color={theme.textSecondary} />
                      <AppText size="small" tone="secondary">Reference · {event.reference}</AppText>
                    </View>
                  ) : null}
                </View>
              ) : null}
              {event.components.length ? (
                <View style={[styles.historyComponents, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  {event.components.map((component, componentIndex) => (
                    <View
                      key={`${event.id}-${componentIndex}`}
                      style={[
                        styles.historyComponent,
                        componentIndex > 0 && { borderTopColor: theme.border },
                      ]}
                    >
                      <View style={styles.historyComponentCopy}>
                        <AppText size="small" weight="semibold">
                          {getSettlementComponentTitle(component, event.amount)}
                        </AppText>
                        {component.kind !== "cash" ? (
                          <AppText size="small" tone="secondary">
                            {component.kind === "service"
                              ? component.description ?? "Service"
                              : `${component.quantity ?? ""} ${component.unit_name ?? ""} ${component.product_name ?? "Goods"}`.trim()}
                          </AppText>
                        ) : null}
                        {component.reference_number ? (
                          <AppText size="small" tone="secondary">
                            Receipt · {component.reference_number}
                          </AppText>
                        ) : null}
                      </View>
                      <AppText size="small" weight="semibold">
                        {formatMoney(component.value, currency)}
                      </AppText>
                    </View>
                  ))}
                </View>
              ) : null}
              {event.type === "settlement" && !event.components.length ? (
                <AppText size="small" tone="secondary">
                  Settlement details were not saved.
                </AppText>
              ) : null}
              {event.notes ? (
                <AppText size="small" tone="secondary">Note: {event.notes}</AppText>
              ) : null}
              {event.type === "payment" && event.paymentIndex ? (
                <GenerateReceiptButton
                  transactionId={transactionId}
                  transactionType="purchase"
                  paymentNumber={event.paymentIndex}
                  paymentId={event.paymentId}
                  compact
                />
              ) : null}
              {historyMatchesBalance ? (
                <View style={[styles.historyBalance, { borderTopColor: theme.border }]}>
                  <AppText size="small" tone="secondary">Balance after this</AppText>
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{ color: event.balanceAfter > 0.005 ? theme.success : event.balanceAfter < -0.005 ? getPurchaseAuditPalette(theme, "refund", -1).accent : theme.textSecondary }}
                  >
                    {event.type === "purchase" && event.amount === 0
                      ? "Purchase cancelled · no balance"
                      : remaining}
                  </AppText>
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </Section>
  );
}

function getPurchaseBalanceLabel(balance: number, currency: string): string {
  if (Math.abs(balance) < 0.005) return "Paid in full";
  if (balance < 0) return `You still owe ${formatMoney(Math.abs(balance), currency)}`;
  return `Supplier credit ${formatMoney(balance, currency)}`;
}

function getPurchaseAuditPalette(
  theme: ReturnType<typeof useTheme>["theme"],
  type: PurchaseAuditEntry["type"],
  amount: number,
): { accent: string } {
  if (type === "purchase") return { accent: theme.textSecondary };
  if (amount > 0) return { accent: theme.success };
  if (amount < 0) {
    return {
      accent: theme.mode === "dark" ? "#F0C77C" : "#80510B",
    };
  }
  return { accent: theme.textSecondary };
}

function getSettlementComponentTitle(
  component: TransactionSettlement["lines"][number],
  effect: number,
): string {
  const paymentDirection = effect > 0;
  if (component.kind === "cash") {
    return `${paymentDirection ? "Cash paid" : "Cash received"} · ${labelize(component.payment_method ?? "cash")}`;
  }
  if (component.kind === "service") {
    return paymentDirection ? "Service you provided" : "Service received";
  }
  return paymentDirection ? "Goods you gave" : "Goods received";
}

function formatAuditTime(value: string): string {
  const [hoursText, minutes] = value.slice(0, 5).split(":");
  const hours = Number(hoursText);
  if (!Number.isFinite(hours) || !minutes) return value.slice(0, 5);
  return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? "PM" : "AM"}`;
}

function Section({
  title,
  children,
  icon,
  accent,
}: {
  title: string;
  children: ReactNode;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
}) {
  const { theme } = useTheme();
  return (
    <Card style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={styles.sectionIcon}>
          <Ionicons name={icon} size={18} color={accent} />
        </View>
        <AppText size="body" weight="semibold" style={styles.sectionTitle}>
          {title}
        </AppText>
      </View>
      <View style={[styles.sectionContent, { borderTopColor: theme.border }]}>
        {children}
      </View>
    </Card>
  );
}

function DetailLine({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.detailLine}>
      <AppText size="small" tone="secondary">
        {label}
      </AppText>
      <AppText
        size="small"
        weight="semibold"
        style={{
          color: valueColor ?? theme.text,
          flexShrink: 1,
          textAlign: "right",
        }}
      >
        {value}
      </AppText>
    </View>
  );
}

function PurchaseActionRow({
  icon,
  accent,
  title,
  detail,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryAction,
        {
          borderBottomColor: theme.border,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <View style={[styles.secondaryActionIcon, { backgroundColor: `${accent}14` }]}>
        <Ionicons name={icon} size={19} color={accent} />
      </View>
      <View style={styles.actionCopy}>
        <AppText size="small" weight="semibold">
          {title}
        </AppText>
        <AppText size="small" tone="secondary">
          {detail}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

function formatMoney(value: number | string, currency: string): string {
  return `${currency} ${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)}`;
}

function formatQuantity(value: number | string): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 3,
  }).format(Number(value) || 0);
}

function pluralizeUnit(unit: string, quantity: number): string {
  const normalized = unit.trim();
  const lowerCaseUnit = normalized.toLocaleLowerCase();
  if (
    Math.abs(quantity) === 1 ||
    /^(kg|g|mg|l|ml|cm|m|mm)$/.test(lowerCaseUnit) ||
    lowerCaseUnit.endsWith("s")
  ) {
    return normalized;
  }
  if (/[sxz]$|(?:ch|sh)$/.test(lowerCaseUnit)) return `${normalized}es`;
  if (/[^aeiou]y$/.test(lowerCaseUnit)) {
    return `${normalized.slice(0, -1)}ies`;
  }
  return `${normalized}s`;
}

function formatDate(value: string): string {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(parsed);
}

function labelize(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    gap: 14,
    padding: 20,
    paddingBottom: 40,
  },
  loading: { alignItems: "center", gap: 12, padding: 36 },
  stateCard: { alignItems: "center", gap: 12, padding: 24 },
  centered: { textAlign: "center" },
  actionsCard: { gap: 14, padding: 16 },
  actionsHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  actionsTitleCopy: { flex: 1, gap: 3 },
  primaryAction: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderWidth: 1,
    borderRadius: 14,
  },
  primaryActionIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  actionCopy: { flex: 1, minWidth: 0, gap: 3 },
  secondaryActions: {
    borderTopWidth: 1,
  },
  secondaryAction: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  secondaryActionIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  actionDivider: { height: StyleSheet.hairlineWidth, marginLeft: 49 },
  hero: { gap: 14, padding: 18, borderRadius: 14 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroTitle: { flex: 1, minWidth: 0, gap: 2 },
  referenceRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  referenceText: { flex: 1, minWidth: 0 },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
  },
  heroTotal: { flex: 1, minWidth: 0 },
  heroAmountRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  progressTrack: {
    width: "100%",
    height: 7,
    overflow: "hidden",
    borderRadius: 4,
  },
  progressFill: { height: "100%", borderRadius: 4 },
  financialSummary: { gap: 7 },
  deliverySummary: { gap: 9, paddingTop: 13, borderTopWidth: 1 },
  deliverySummaryHeading: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 6,
  },
  deliverySummaryTitle: { flex: 1, minWidth: 0, gap: 2 },
  heroFooter: { alignItems: "flex-start" },
  notes: { paddingTop: 12, borderTopWidth: 1, borderTopColor: "#D8DED5" },
  section: { gap: 13, padding: 17, borderRadius: 12 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 9 },
  sectionIcon: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { flex: 1, minWidth: 0 },
  sectionContent: { gap: 12, paddingTop: 12, borderTopWidth: 1 },
  listItem: { gap: 10, paddingTop: 12, paddingBottom: 3 },
  itemHeading: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  itemCopy: { flex: 1, minWidth: 0, gap: 2 },
  purchaseTotalLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  discountLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#D8DED5",
  },
  receiptEmpty: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13, borderRadius: 12 },
  subsectionHeading: { gap: 3, paddingTop: 3 },
  batchSummary: { gap: 10, borderWidth: 1, borderRadius: 13, padding: 12 },
  batchSummaryTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  batchIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  batchQuantityBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  batchSummaryFooter: { gap: 8, paddingLeft: 43 },
  batchBlockList: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  blockTag: { maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  receiptCard: { gap: 11, borderWidth: 1, borderRadius: 14, padding: 12 },
  receiptHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  receiptDateRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 9 },
  receiptNumber: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  receiptTotalBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  receiptLine: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  receiptLineTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  allocations: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  receiptNote: { flexDirection: "row", alignItems: "flex-start", gap: 7, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9 },
  historyLoading: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 9 },
  historyError: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, padding: 10 },
  historyErrorCopy: { flex: 1, minWidth: 0, gap: 3 },
  historyMismatch: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  historyMismatchText: { flex: 1, minWidth: 0 },
  historyEvent: { flexDirection: "row", gap: 10 },
  historyRail: { width: 16, alignItems: "center" },
  historyDot: { zIndex: 1, width: 10, height: 10, borderWidth: 2, borderRadius: 5, marginTop: 4 },
  historyConnector: { position: "absolute", top: 12, bottom: -3, width: 1 },
  historyEventBody: { flex: 1, minWidth: 0, gap: 5, paddingBottom: 13 },
  historyEventHeading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  historyEventTitle: { flex: 1, minWidth: 0, gap: 2 },
  historyMetadata: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  historyMetadataItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  historyComponents: { gap: 1, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, marginTop: 2 },
  historyComponent: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  historyComponentCopy: { flex: 1, minWidth: 0, gap: 2 },
  historyBalance: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 4, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6, marginTop: 2 },
  paymentCopy: { flex: 1, minWidth: 0, gap: 2 },
  balanceRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  balanceAmount: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 5,
  },
  balanceValueCopy: {
    alignItems: "flex-end",
    gap: 1,
  },
  detailLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
});
