import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useState, type ReactNode } from "react";
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
import { isChickenPurchaseItem } from "@/features/chickens/api";
import { useChickenPurchaseDetails } from "@/features/chickens/hooks";
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
  const purchase = detail.data;
  const transaction = purchase?.transaction;
  const balanceTone =
    Number(transaction?.balance_due) > 0
      ? theme.danger
      : Number(transaction?.credit_balance) > 0
        ? theme.primary
        : theme.success;
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
            onRefresh={() => void detail.refetch()}
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
            <Card
              style={[
                styles.hero,
                {
                  borderLeftColor: balanceTone,
                  backgroundColor: `${balanceTone}08`,
                },
              ]}
            >
              <View style={styles.heroTop}>
                <View
                  style={[
                    styles.heroIcon,
                    { backgroundColor: `${theme.primary}14` },
                  ]}
                >
                  <Ionicons
                    name="receipt-outline"
                    size={25}
                    color={theme.primary}
                  />
                </View>
                <View style={styles.heroTitle}>
                  <AppText size="small" tone="secondary" numberOfLines={2}>
                    {purchase.supplier_name ?? "Supplier not recorded"}
                  </AppText>
                  <AppText
                    size="heading"
                    weight="semibold"
                    numberOfLines={2}
                    ellipsizeMode="middle"
                  >
                    {transaction.reference_number
                      ? `Purchase ${transaction.reference_number}`
                      : "Purchase"}
                  </AppText>
                </View>
              </View>
              {transaction.reference_number ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Copy purchase reference"
                  onPress={() => void copyReference()}
                  style={[
                    styles.copyButton,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={referenceCopied ? "checkmark" : "copy-outline"}
                    size={17}
                    color={referenceCopied ? theme.success : theme.primary}
                  />
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{
                      color: referenceCopied ? theme.success : theme.primary,
                    }}
                  >
                    {referenceCopied ? "Copied" : "Copy reference"}
                  </AppText>
                </Pressable>
              ) : null}
              <View style={styles.heroAmountRow}>
                <View style={styles.heroTotal}>
                  <AppText size="small" tone="secondary">
                    Purchase total
                  </AppText>
                  <AppText size="title" weight="semibold">
                    {formatMoney(transaction.transaction_total, theme.currency)}
                  </AppText>
                </View>
                <View
                  style={[
                    styles.balanceBadge,
                    {
                      backgroundColor: `${balanceTone}18`,
                    },
                  ]}
                >
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{
                      color: balanceTone,
                    }}
                  >
                    {Number(transaction.balance_due) > 0
                      ? "Balance due"
                      : Number(transaction.credit_balance) > 0
                        ? "Supplier owes you"
                        : "Paid in full"}
                  </AppText>
                </View>
              </View>
              <View style={styles.heroDetails}>
                <DetailLine
                  label="Date"
                  value={formatDate(transaction.transaction_date)}
                />
                <DetailLine
                  label="Net paid"
                  value={formatMoney(transaction.amount_paid, theme.currency)}
                />
                {Number(transaction.balance_due) > 0 ? (
                  <DetailLine
                    label="Still owed"
                    value={formatMoney(transaction.balance_due, theme.currency)}
                    valueColor={theme.danger}
                  />
                ) : null}
                {Number(transaction.credit_balance) > 0 ? (
                  <DetailLine
                    label="Supplier holds"
                    value={formatMoney(
                      transaction.credit_balance,
                      theme.currency,
                    )}
                    valueColor={theme.primary}
                  />
                ) : null}
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
                  <AppText weight="semibold">Purchase actions</AppText>
                  <AppText size="small" tone="secondary">
                    Manage receipts, payment, or a return.
                  </AppText>
                </View>
                {outstandingChickenCount > 0 ? (
                  <View
                    style={[
                      styles.actionCountBadge,
                      { backgroundColor: `${theme.secondary}18` },
                    ]}
                  >
                    <AppText
                      size="small"
                      weight="semibold"
                      style={{ color: theme.secondary }}
                    >
                      {formatQuantity(outstandingChickenCount)} left
                    </AppText>
                  </View>
                ) : null}
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
              title="Items purchased"
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
                      <AppText weight="semibold" numberOfLines={2}>
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
                  <View style={styles.quantityGrid}>
                    <QuantityCell
                      label={
                        isChickenPurchaseItem(item) ? "Ordered" : "Quantity"
                      }
                      value={formatQuantity(
                        item.ordered_base_quantity ?? item.quantity,
                      )}
                      accent={theme.primary}
                    />
                    {isChickenPurchaseItem(item) ? (
                      <>
                        <QuantityCell
                          label="Received"
                          value={formatQuantity(item.quantity_received)}
                          accent={theme.success}
                        />
                        <QuantityCell
                          label="Outstanding"
                          value={formatQuantity(item.quantity_remaining)}
                          highlight={Number(item.quantity_remaining) > 0}
                          accent={
                            Number(item.quantity_remaining) > 0
                              ? theme.secondary
                              : theme.success
                          }
                        />
                      </>
                    ) : null}
                  </View>
                  {Number(item.unit_price) > 0 ? (
                    <AppText size="small" tone="secondary">
                      Unit price: {formatMoney(item.unit_price, theme.currency)}
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
            </Section>

            {transaction.items.some(isChickenPurchaseItem) ? (
              <Section
                title="Chicken receipts & batches"
                icon="home-outline"
                accent={theme.secondary}
              >
                <View style={styles.receiptSummary}>
                  <View style={[styles.receiptMetric, { backgroundColor: theme.backgroundSelected }]}>
                    <AppText size="small" tone="secondary">Deliveries</AppText>
                    <AppText size="heading" weight="semibold" numberOfLines={1} adjustsFontSizeToFit>
                      {purchase.receipts.length}
                    </AppText>
                  </View>
                  <View style={[styles.receiptMetric, { backgroundColor: `${theme.success}12` }]}>
                    <AppText size="small" tone="secondary">Received</AppText>
                    <AppText size="heading" weight="semibold" numberOfLines={1} adjustsFontSizeToFit style={{ color: theme.success }}>
                      {formatQuantity(
                        transaction.items
                          .filter(isChickenPurchaseItem)
                          .reduce((total, item) => total + Number(item.quantity_received), 0),
                      )}
                    </AppText>
                  </View>
                  <View style={[styles.receiptMetric, { backgroundColor: `${theme.secondary}12` }]}>
                    <AppText size="small" tone="secondary">Still due</AppText>
                    <AppText
                      size="heading"
                      weight="semibold"
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      style={{
                        color: transaction.items.some(
                          (item) => isChickenPurchaseItem(item) && Number(item.quantity_remaining) > 0,
                        )
                          ? theme.secondary
                          : theme.text,
                      }}
                    >
                      {formatQuantity(
                        transaction.items
                          .filter(isChickenPurchaseItem)
                          .reduce((total, item) => total + Number(item.quantity_remaining), 0),
                      )}
                    </AppText>
                  </View>
                </View>

                {purchase.receipts.length === 0 ? (
                  <View style={[styles.receiptEmpty, { backgroundColor: theme.background }]}>
                    <Ionicons name="cube-outline" size={20} color={theme.textSecondary} />
                    <View style={styles.itemCopy}>
                      <AppText size="small" weight="semibold">No deliveries received yet</AppText>
                      <AppText size="small" tone="secondary">
                        Received chickens and their batches will appear here.
                      </AppText>
                    </View>
                  </View>
                ) : (
                  <>
                    <View style={styles.subsectionHeading}>
                      <AppText weight="semibold">Batches in this purchase</AppText>
                      <AppText size="small" tone="secondary">
                        {batchSummaries.length} {batchSummaries.length === 1 ? "batch" : "batches"} created or updated from deliveries
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
                            <AppText weight="semibold" numberOfLines={1}>{batch.name}</AppText>
                            <AppText size="small" tone="secondary" numberOfLines={1}>
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
                                  <AppText size="small" style={{ color: theme.primary }} numberOfLines={1}>
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
                                      <AppText size="small" weight="semibold" numberOfLines={1}>
                                        {received.batch_name ?? "Batch not assigned"}
                                      </AppText>
                                      <AppText size="small" tone="secondary" numberOfLines={1}>
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
                                        <AppText size="small" style={{ color: theme.primary }} numberOfLines={1}>
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

            <Section
              title="Purchase transaction"
              icon="document-text-outline"
              accent={theme.primary}
            >
              <DetailLine
                label="Reference"
                value={transaction.reference_number ?? "Not assigned"}
              />
              <DetailLine
                label="Transaction date"
                value={formatDate(transaction.transaction_date)}
              />
              <DetailLine
                label="Status"
                value={labelize(transaction.status)}
              />
              <DetailLine
                label="Subtotal"
                value={formatMoney(
                  Number(transaction.transaction_total) +
                    Number(transaction.discount_amount),
                  theme.currency,
                )}
              />
              <DetailLine
                label="Total"
                value={formatMoney(transaction.transaction_total, theme.currency)}
              />
            </Section>

            <Section
              title="Payment history"
              icon="card-outline"
              accent={theme.success}
            >
              {transaction.payments.length === 0 ? (
                <AppText size="small" tone="secondary">
                  No payments have been recorded for this purchase.
                </AppText>
              ) : (
                transaction.payments.map((payment, index) => (
                  <View
                    key={payment.id ?? `${payment.payment_date}-${index}`}
                    style={styles.paymentRow}
                  >
                    <View
                      style={[
                        styles.paymentIcon,
                        { backgroundColor: `${theme.success}14` },
                      ]}
                    >
                      <Ionicons
                        name="card-outline"
                        size={18}
                        color={theme.success}
                      />
                    </View>
                    <View style={styles.paymentCopy}>
                      <AppText weight="semibold">
                        {labelize(payment.payment_method)}
                      </AppText>
                      <AppText size="small" tone="secondary">
                        {payment.payment_date
                          ? formatDate(payment.payment_date)
                          : "Date not available"}
                        {payment.reference_number
                          ? ` · ${payment.reference_number}`
                          : ""}
                      </AppText>
                      {payment.notes ? (
                        <AppText size="small" tone="secondary">
                          {payment.notes}
                        </AppText>
                      ) : null}
                    </View>
                    <AppText
                      weight="semibold"
                      style={{ flexShrink: 1, textAlign: "right" }}
                    >
                      {formatMoney(payment.amount, theme.currency)}
                    </AppText>
                  </View>
                ))
              )}
            </Section>

            {transaction.contact_id ? (
              <Section
                title="Supplier account balance"
                icon="swap-horizontal-outline"
                accent={theme.secondary}
              >
                <View style={styles.supplierTotal}>
                  <View
                    style={[
                      styles.balanceSummaryCard,
                      { backgroundColor: `${theme.danger}12` },
                    ]}
                  >
                    <Ionicons name="arrow-up-circle-outline" size={21} color={theme.danger} />
                    <View style={styles.balanceSummaryCopy}>
                      <AppText size="small" tone="secondary">
                        You owe {purchase.supplier_name ?? "supplier"}
                      </AppText>
                      <AppText weight="semibold" style={{ color: theme.danger }}>
                        {formatMoney(purchase.supplier_balance_total, theme.currency)}
                      </AppText>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.balanceSummaryCard,
                      { backgroundColor: `${theme.success}12` },
                    ]}
                  >
                    <Ionicons name="arrow-down-circle-outline" size={21} color={theme.success} />
                    <View style={styles.balanceSummaryCopy}>
                      <AppText size="small" tone="secondary">
                        Supplier owes you
                      </AppText>
                      <AppText weight="semibold" style={{ color: theme.success }}>
                        {formatMoney(purchase.supplier_credit_total, theme.currency)}
                      </AppText>
                    </View>
                  </View>
                </View>
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
                        {balance.reference_number
                          ? `Purchase ${balance.reference_number}`
                          : "Purchase"}
                      </AppText>
                      <AppText size="small" tone="secondary">
                        {formatDate(balance.transaction_date)}
                      </AppText>
                    </View>
                    <View style={styles.balanceAmount}>
                      <AppText
                        weight="semibold"
                        style={{
                          flexShrink: 1,
                          textAlign: "right",
                          color:
                            Number(balance.balance_due) > 0
                              ? theme.danger
                              : theme.primary,
                        }}
                      >
                        {Number(balance.balance_due) > 0
                          ? `Owed ${formatMoney(balance.balance_due, theme.currency)}`
                          : `Credit ${formatMoney(balance.credit_balance, theme.currency)}`}
                      </AppText>
                      <Ionicons
                        name="chevron-forward"
                        size={17}
                        color={theme.textSecondary}
                      />
                    </View>
                  </Pressable>
                ))}
                {otherBalances.length === 0 ? (
                  <AppText size="small" tone="secondary">
                    There are no other open balances with this supplier.
                  </AppText>
                ) : null}
              </Section>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
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
        <View
          style={[
            styles.sectionIcon,
            { backgroundColor: `${accent}14` },
          ]}
        >
          <Ionicons name={icon} size={18} color={accent} />
        </View>
        <AppText size="heading" weight="semibold" style={styles.sectionTitle}>
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

function QuantityCell({
  label,
  value,
  highlight = false,
  accent,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  accent: string;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.quantityCell,
        { backgroundColor: `${accent}10` },
      ]}
    >
      <AppText size="small" tone="secondary">
        {label}
      </AppText>
      <AppText
        weight="semibold"
        style={{ color: highlight ? theme.danger : accent }}
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
    justifyContent: "space-between",
    gap: 10,
  },
  actionsTitleCopy: { flex: 1, gap: 3 },
  actionCountBadge: {
    maxWidth: "45%",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
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
  hero: { gap: 16, padding: 18, borderRadius: 12, borderLeftWidth: 4 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 13 },
  heroIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#E8EDE5",
  },
  heroTitle: { flex: 1, minWidth: 0, gap: 2 },
  copyButton: {
    alignSelf: "flex-start",
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderRadius: 10,
  },
  heroTotal: { flex: 1, minWidth: 0 },
  heroAmountRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  balanceBadge: {
    maxWidth: "100%",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 16,
  },
  heroDetails: { gap: 7 },
  notes: { paddingTop: 12, borderTopWidth: 1, borderTopColor: "#D8DED5" },
  section: { gap: 13, padding: 17, borderRadius: 12 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
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
  quantityGrid: { flexDirection: "row", gap: 8 },
  quantityCell: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    padding: 9,
    borderRadius: 10,
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
  receiptSummary: { flexDirection: "row", gap: 8 },
  receiptMetric: { flex: 1, minWidth: 0, gap: 3, padding: 10, borderRadius: 11 },
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
  paymentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  paymentIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  paymentCopy: { flex: 1, minWidth: 0, gap: 2 },
  supplierTotal: {
    gap: 10,
  },
  balanceSummaryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
  },
  balanceSummaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  balanceRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  balanceAmount: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 5,
  },
  detailLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
});
