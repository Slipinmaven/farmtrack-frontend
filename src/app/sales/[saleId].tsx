import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
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
import {
  useChickenSaleDetails,
  useChickenSaleFulfillment,
} from "@/features/chickens/hooks";
import { formatChickenCount } from "@/features/chickens/format";
import { GenerateReceiptButton } from "@/features/receipts/receipt-actions";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

export default function SaleDetailsRoute() {
  return (
    <SessionGate>
      <SaleDetailsContent />
    </SessionGate>
  );
}

function SaleDetailsContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const {
    saleId,
    created,
    deliveryRecorded,
    deliveredCount,
    reminderNotice,
    reminderNoticeTone,
  } =
    useLocalSearchParams<{
      saleId: string;
      created?: string;
      deliveryRecorded?: string;
      deliveredCount?: string;
      reminderNotice?: string;
      reminderNoticeTone?: string;
    }>();
  const detail = useChickenSaleDetails(
    user?.id,
    farm.selectedFarm?.id,
    saleId,
  );
  const sale = detail.data;
  const transaction = sale?.transaction;
  const hasChickenItems =
    transaction?.items.some((item) => item.product_type === "chickens") ?? false;
  const hasEggItems =
    transaction?.items.some((item) => item.product_type === "eggs") ?? false;
  const hasDeliverableItems = hasChickenItems || hasEggItems;
  const fulfillment = useChickenSaleFulfillment(
    user?.id,
    farm.selectedFarm?.id,
    saleId,
    hasDeliverableItems,
  );
  const outstandingDeliverableQuantity =
    fulfillment.data?.items.reduce(
      (total, item) => total + Number(item.outstanding_quantity),
      0,
    ) ?? null;
  const balanceTone =
    Number(transaction?.balance_due) > 0
      ? theme.danger
      : Number(transaction?.credit_balance) > 0
        ? theme.primary
        : theme.success;
  const otherBalances =
    sale?.outstanding_customer_balances.filter(
      (balance) => balance.id !== transaction?.id,
    ) ?? [];

  async function copyReference() {
    const reference = transaction?.reference_number;
    if (!reference) return;
    try {
      const Clipboard = await import("expo-clipboard");
      await Clipboard.setStringAsync(reference);
      await dialog.showDialog({
        title: "Reference copied",
        message: `${reference} is ready to paste.`,
        tone: "success",
      });
    } catch (error: unknown) {
      await dialog.showDialog({
        title: "Couldn’t copy reference",
        message: `${normalizeApiError(error).message} If the installed app reports a missing ExpoClipboard native module, rebuild and reinstall the Android development client.`,
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
        <FarmPageHeader title="Sale details" showBack />
        {detail.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={theme.primary} />
            <AppText tone="secondary">Loading sale details…</AppText>
          </View>
        ) : null}
        {detail.isError ? (
          <Card style={styles.stateCard}>
            <Ionicons
              name="cloud-offline-outline"
              size={28}
              color={theme.danger}
            />
            <AppText weight="semibold">Couldn’t load this sale</AppText>
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
        {created === "true" && transaction ? (
          <Card
            style={[
              styles.createdNotice,
              {
                backgroundColor: `${theme.success}0D`,
                borderColor: `${theme.success}45`,
              },
            ]}
          >
            <View
              style={[
                styles.createdIcon,
                { backgroundColor: `${theme.success}18` },
              ]}
            >
              <Ionicons name="checkmark" size={21} color={theme.success} />
            </View>
            <View style={styles.actionCopy}>
              <AppText weight="semibold">
                {hasEggItems && !hasChickenItems
                  ? "Egg sale recorded"
                  : "Chicken sale recorded"}
              </AppText>
              <AppText size="small" tone="secondary">
                The order is saved. Record each delivery when products are
                handed over; stock updates with each delivery.
              </AppText>
            </View>
          </Card>
        ) : null}
        {deliveryRecorded === "true" ? (
          <Card
            style={[
              styles.createdNotice,
              {
                backgroundColor: `${theme.success}0D`,
                borderColor: `${theme.success}45`,
              },
            ]}
          >
            <View
              style={[
                styles.createdIcon,
                { backgroundColor: `${theme.success}18` },
              ]}
            >
              <Ionicons name="checkmark" size={21} color={theme.success} />
            </View>
            <View style={styles.actionCopy}>
              <AppText weight="semibold">Delivery recorded</AppText>
              <AppText size="small" tone="secondary">
                {Number(deliveredCount) > 0
                  ? `${Number(deliveredCount).toLocaleString()} ${
                      hasEggItems && !hasChickenItems
                        ? "eggs"
                        : Number(deliveredCount) === 1
                          ? "chicken"
                          : "chickens"
                    } added to this sale and deducted from stock.`
                  : "The delivery was recorded and stock was updated."}
              </AppText>
            </View>
          </Card>
        ) : null}
        {reminderNotice ? (
          <View
            accessibilityRole="alert"
            style={[
              styles.reminderNotice,
              {
                backgroundColor:
                  reminderNoticeTone === "warning"
                    ? `${theme.secondary}12`
                    : theme.backgroundElement,
                borderColor:
                  reminderNoticeTone === "warning"
                    ? `${theme.secondary}55`
                    : theme.border,
              },
            ]}
          >
            <Ionicons
              name={
                reminderNoticeTone === "warning"
                  ? "alert-circle-outline"
                  : "notifications-outline"
              }
              size={19}
              color={
                reminderNoticeTone === "warning"
                  ? theme.secondary
                  : theme.primary
              }
            />
            <AppText size="small" style={styles.reminderNoticeCopy}>
              {reminderNotice}
            </AppText>
          </View>
        ) : null}
        {sale && transaction ? (
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
              <View style={styles.heroHeading}>
                <View
                  style={[
                    styles.heroIcon,
                    { backgroundColor: `${theme.primary}16` },
                  ]}
                >
                  <Ionicons
                    name="receipt-outline"
                    size={22}
                    color={theme.primary}
                  />
                </View>
                <View style={styles.heroTitle}>
                  <AppText size="small" tone="secondary" numberOfLines={2}>
                    {sale.customer_name ?? "Customer not recorded"}
                  </AppText>
                  <AppText
                    size="body"
                    weight="semibold"
                    numberOfLines={2}
                  >
                    {transaction.reference_number
                      ? `Sale ${transaction.reference_number}`
                      : "Sale"}
                  </AppText>
                </View>
              </View>
              {transaction.reference_number ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Copy sale reference"
                  onPress={() => void copyReference()}
                  style={[
                    styles.copyButton,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Ionicons name="copy-outline" size={17} color={theme.primary} />
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{ color: theme.primary }}
                  >
                    Copy reference
                  </AppText>
                </Pressable>
              ) : null}
              <View style={styles.totalRow}>
                <View style={styles.totalCopy}>
                  <AppText size="small" tone="secondary">
                    Sale total
                  </AppText>
                  <AppText size="heading" weight="semibold">
                    {formatMoney(transaction.transaction_total, theme.currency)}
                  </AppText>
                </View>
                <View
                  style={[
                    styles.balanceBadge,
                    { backgroundColor: `${balanceTone}18` },
                  ]}
                >
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{ color: balanceTone }}
                  >
                    {Number(transaction.balance_due) > 0
                      ? "Balance due"
                      : Number(transaction.credit_balance) > 0
                        ? "Credit owed to customer"
                        : "Paid in full"}
                  </AppText>
                </View>
              </View>
              <GenerateReceiptButton
                transactionId={saleId}
                transactionType="sale"
              />
              <View style={styles.heroDetails}>
                <DetailLine
                  label="Date"
                  value={`${formatDate(transaction.transaction_date)}${transaction.transaction_time ? ` · ${transaction.transaction_time.slice(0, 5)}` : ""}`}
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
                    label="Owed to customer (credit / overpayment)"
                    value={formatMoney(
                      transaction.credit_balance,
                      theme.currency,
                    )}
                    valueColor={theme.primary}
                  />
                ) : null}
              </View>
              {transaction.notes ? (
                <AppText
                  size="small"
                  tone="secondary"
                  style={[styles.notes, { borderTopColor: theme.border }]}
                >
                  {transaction.notes}
                </AppText>
              ) : null}
            </Card>

            <Card style={styles.actionsCard}>
              <View style={styles.actionsHeading}>
                <View style={styles.actionsTitleCopy}>
                  <AppText weight="semibold">Sale actions</AppText>
                  <AppText size="small" tone="secondary">
                    Manage delivery, payment, or a return.
                  </AppText>
                </View>
                {hasDeliverableItems &&
                outstandingDeliverableQuantity !== null &&
                outstandingDeliverableQuantity > 0 ? (
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
                      {formatQuantity(outstandingDeliverableQuantity)} left
                    </AppText>
                  </View>
                ) : null}
              </View>

              {hasDeliverableItems &&
              (outstandingDeliverableQuantity === null ||
                outstandingDeliverableQuantity > 0) ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    hasEggItems && !hasChickenItems
                      ? "Record egg delivery"
                      : "Record chicken delivery"
                  }
                  onPress={() => {
                    const pathname =
                      hasEggItems && !hasChickenItems
                        ? "/sales/[saleId]/deliver-eggs"
                        : "/sales/[saleId]/deliver";
                    router.push({ pathname, params: { saleId } });
                  }}
                  style={({ pressed }) => [
                    styles.deliveryAction,
                    {
                      backgroundColor: `${theme.primary}0D`,
                      borderColor: `${theme.primary}45`,
                      opacity: pressed ? 0.82 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.deliveryActionIcon,
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
                    <AppText weight="semibold">
                      {outstandingDeliverableQuantity === null
                        ? "Record a delivery"
                        : hasEggItems && !hasChickenItems
                          ? "Record egg delivery"
                          : "Record chicken delivery"}
                    </AppText>
                    <AppText size="small" tone="secondary">
                      {outstandingDeliverableQuantity === null
                        ? "Update inventory for products handed over."
                        : `${formatQuantity(outstandingDeliverableQuantity)} ${hasEggItems && !hasChickenItems ? "eggs" : outstandingDeliverableQuantity === 1 ? "chicken" : "chickens"} still to deliver`}
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
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Settle sale balance or refund a customer overpayment"
                  onPress={() =>
                    router.push({
                      pathname: "/transactions/[transactionId]/settlements",
                      params: {
                        transactionId: saleId,
                        transactionType: "sale",
                        balanceDue: String(transaction.balance_due),
                        creditBalance: String(transaction.credit_balance),
                        accountBalanceTotal: String(sale.customer_balance_total),
                        accountCreditTotal: String(sale.customer_credit_total),
                        contactName: sale.customer_name ?? "Customer",
                        referenceNumber: transaction.reference_number ?? "",
                      },
                    })
                  }
                  style={({ pressed }) => [
                    styles.secondaryAction,
                    { opacity: pressed ? 0.72 : 1 },
                  ]}
                >
                  <View
                    style={[
                      styles.secondaryActionIcon,
                      { backgroundColor: `${theme.secondary}14` },
                    ]}
                  >
                    <Ionicons
                      name="wallet-outline"
                      size={19}
                      color={theme.secondary}
                    />
                  </View>
                  <View style={styles.actionCopy}>
                    <AppText size="small" weight="semibold">
                      Settle balance or credit
                    </AppText>
                    <AppText size="small" tone="secondary">
                      {Number(transaction.balance_due) > 0
                        ? `${formatMoney(transaction.balance_due, theme.currency)} still to collect`
                        : Number(transaction.credit_balance) > 0
                          ? `Farm owes customer ${formatMoney(transaction.credit_balance, theme.currency)}`
                          : "Record or review a payment"}
                    </AppText>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={theme.textSecondary}
                  />
                </Pressable>

                <View style={[styles.actionDivider, { backgroundColor: theme.border }]} />

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Record a product return"
                  onPress={() =>
                    router.push({
                      pathname: "/transactions/[transactionId]/returns",
                      params: {
                        transactionId: saleId,
                        transactionType: "sale",
                      },
                    })
                  }
                  style={({ pressed }) => [
                    styles.secondaryAction,
                    { opacity: pressed ? 0.72 : 1 },
                  ]}
                >
                  <View
                    style={[
                      styles.secondaryActionIcon,
                      { backgroundColor: `${theme.danger}12` },
                    ]}
                  >
                    <Ionicons
                      name="return-down-back-outline"
                      size={19}
                      color={theme.danger}
                    />
                  </View>
                  <View style={styles.actionCopy}>
                    <AppText size="small" weight="semibold">
                      Record a product return
                    </AppText>
                    <AppText size="small" tone="secondary">
                      Return delivered chickens or other sale items.
                    </AppText>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={theme.textSecondary}
                  />
                </Pressable>
              </View>
            </Card>

            <Section title="Items sold" icon="cart-outline" accent={theme.primary}>
              {transaction.items.map((item, index) => (
                <View
                  key={item.id}
                  style={[
                    styles.item,
                    index > 0 && {
                      borderTopWidth: 1,
                      borderTopColor: theme.border,
                    },
                  ]}
                >
                  <View style={styles.itemHeading}>
                    <View style={styles.itemCopy}>
                      <AppText weight="semibold" numberOfLines={2}>
                        {item.product_name ?? "Product"}
                      </AppText>
                      <AppText size="small" tone="secondary">
                        {item.chicken_type
                          ? labelize(item.chicken_type)
                          : "Product"}
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
                  <View style={styles.quantityRow}>
                    <Quantity
                      label="Quantity"
                      value={`${formatQuantity(item.quantity)}${item.unit_name ? ` ${item.unit_name}` : ""}`}
                    />
                    <Quantity
                      label="Unit price"
                      value={formatMoney(item.unit_price, theme.currency)}
                    />
                  </View>
                  {Number(item.discount_amount) > 0 ? (
                    <DetailLine
                      label="Item discount"
                      value={`−${formatMoney(item.discount_amount, theme.currency)}`}
                      valueColor={theme.success}
                    />
                  ) : null}
                  {item.notes ? (
                    <AppText size="small" tone="secondary">
                      {item.notes}
                    </AppText>
                  ) : null}
                </View>
              ))}
              {Number(transaction.discount_amount) > 0 ? (
                <DetailLine
                  label={`Sale discount${transaction.discount_reason ? ` · ${transaction.discount_reason}` : ""}`}
                  value={`−${formatMoney(transaction.discount_amount, theme.currency)}`}
                  valueColor={theme.success}
                />
              ) : null}
            </Section>

            {hasDeliverableItems ? (
              <Section
                title="Delivery progress"
                icon="git-commit-outline"
                accent={theme.secondary}
              >
              {fulfillment.isLoading ? (
                <AppText size="small" tone="secondary">
                  Loading delivery progress…
                </AppText>
              ) : fulfillment.isError ? (
                <AppText size="small" style={{ color: theme.danger }}>
                  Couldn’t load delivery progress:{" "}
                  {normalizeApiError(fulfillment.error).message}
                </AppText>
              ) : fulfillment.data?.items.length ? (
                fulfillment.data.items.map((item) => {
                  const soldItem = transaction.items.find(
                    (candidate) =>
                      candidate.id === item.transaction_item_id,
                  );
                  const deliveryUnit = item.unit_abbreviation ?? item.unit_name ?? "";
                  return (
                    <View
                      key={item.transaction_item_id}
                      style={[
                        styles.item,
                        { borderTopColor: theme.border },
                      ]}
                    >
                      <AppText weight="semibold">
                        {soldItem?.product_name ??
                          (item.chicken_type
                            ? labelize(item.chicken_type)
                            : hasEggItems
                              ? "Egg product"
                              : "Chicken item")}
                      </AppText>
                      <View style={styles.quantityRow}>
                        <Quantity
                          label="Ordered"
                          value={`${formatQuantity(item.ordered_quantity)}${soldItem?.product_type === "eggs" && deliveryUnit ? ` ${deliveryUnit}` : ""}`}
                        />
                        <Quantity
                          label="Delivered"
                          value={`${formatQuantity(item.delivered_quantity)}${soldItem?.product_type === "eggs" && deliveryUnit ? ` ${deliveryUnit}` : ""}`}
                        />
                        <Quantity
                          label="Remaining"
                          value={`${formatQuantity(item.outstanding_quantity)}${soldItem?.product_type === "eggs" && deliveryUnit ? ` ${deliveryUnit}` : ""}`}
                        />
                      </View>
                    </View>
                  );
                })
              ) : (
                <AppText size="small" tone="secondary">
                  No delivery quantities are pending on this sale.
                </AppText>
              )}
              </Section>
            ) : null}

            {hasChickenItems ? (
              <Section
                title="Blocks & batches"
                icon="home-outline"
                accent={theme.secondary}
              >
                {sale.deliveries.length === 0 ? (
                  <AppText size="small" tone="secondary">
                    No delivery allocations have been recorded.
                  </AppText>
                ) : (
                  sale.deliveries.map((delivery) => (
                    <View key={delivery.id} style={styles.delivery}>
                      <AppText weight="semibold">
                        {formatDate(delivery.delivered_date)}
                        {delivery.delivered_time
                          ? ` · ${delivery.delivered_time.slice(0, 5)}`
                          : ""}
                      </AppText>
                      {delivery.items.map((deliveryItem) => {
                        const soldItem = transaction.items.find(
                          (item) => item.id === deliveryItem.transaction_item_id,
                        );
                        return (
                          <View key={deliveryItem.id} style={styles.deliveryItem}>
                            <AppText size="small" weight="semibold">
                              {soldItem?.product_name ?? "Chicken"} ·{" "}
                              {formatQuantity(deliveryItem.quantity)} delivered
                            </AppText>
                            {deliveryItem.batch_allocations.map((allocation) => (
                              <View
                                key={`${allocation.batch_id}-${allocation.block_id}`}
                                style={[
                                  styles.allocation,
                                  { backgroundColor: theme.backgroundSelected },
                                ]}
                              >
                                <Ionicons
                                  name="layers-outline"
                                  size={15}
                                  color={theme.secondary}
                                />
                                <AppText
                                  size="small"
                                  style={{ color: theme.text, flex: 1 }}
                                >
                                  {allocation.batch_name} · {allocation.block_name} ·{" "}
                                  {formatChickenCount(allocation.quantity, "bird")}
                                </AppText>
                              </View>
                            ))}
                          </View>
                        );
                      })}
                      {delivery.notes ? (
                        <AppText size="small" tone="secondary">
                          Note: {delivery.notes}
                        </AppText>
                      ) : null}
                    </View>
                  ))
                )}
              </Section>
            ) : null}

            {hasEggItems ? (
              <Section
                title="Delivery history"
                icon="cube-outline"
                accent={theme.secondary}
              >
                {sale.deliveries.length === 0 ? (
                  <AppText size="small" tone="secondary">
                    No egg deliveries have been recorded yet.
                  </AppText>
                ) : (
                  sale.deliveries.map((delivery) => (
                    <View key={delivery.id} style={styles.delivery}>
                      <AppText weight="semibold">
                        {formatDate(delivery.delivered_date)}
                        {delivery.delivered_time
                          ? ` · ${delivery.delivered_time.slice(0, 5)}`
                          : ""}
                      </AppText>
                      {delivery.items.map((deliveryItem) => {
                        const soldItem = transaction.items.find(
                          (item) => item.id === deliveryItem.transaction_item_id,
                        );
                        const baseUnit = fulfillment.data?.items.find(
                          (item) =>
                            item.transaction_item_id ===
                            deliveryItem.transaction_item_id,
                        )?.unit_abbreviation;
                        return (
                          <AppText
                            key={deliveryItem.id}
                            size="small"
                            tone="secondary"
                          >
                            {soldItem?.product_name ?? "Eggs"} ·{" "}
                            {formatQuantity(deliveryItem.quantity)}
                            {baseUnit ? ` ${baseUnit}` : ""} delivered
                          </AppText>
                        );
                      })}
                      {delivery.notes ? (
                        <AppText size="small" tone="secondary">
                          Note: {delivery.notes}
                        </AppText>
                      ) : null}
                    </View>
                  ))
                )}
              </Section>
            ) : null}

            <Section
              title="Payment history"
              icon="card-outline"
              accent={theme.success}
            >
              {transaction.payments.length === 0 ? (
                <AppText size="small" tone="secondary">
                  No payments have been recorded for this sale.
                </AppText>
              ) : (
                transaction.payments.map((payment, index) => (
                  <View
                    key={payment.id}
                    style={[
                      styles.payment,
                      index > 0 && {
                        borderTopWidth: 1,
                        borderTopColor: theme.border,
                      },
                    ]}
                  >
                    <View style={styles.paymentCopy}>
                      <AppText weight="semibold">
                        {labelize(payment.payment_method)}
                      </AppText>
                      <AppText size="small" tone="secondary">
                        {formatDate(payment.payment_date)}
                        {payment.payment_time
                          ? ` · ${payment.payment_time.slice(0, 5)}`
                          : ""}
                        {payment.reference_number
                          ? ` · Ref ${payment.reference_number}`
                          : ""}
                      </AppText>
                      {payment.notes ? (
                        <AppText size="small" tone="secondary">
                          {payment.notes}
                        </AppText>
                      ) : null}
                      <GenerateReceiptButton
                        transactionId={saleId}
                        transactionType="sale"
                        paymentNumber={index + 1}
                        paymentId={payment.id}
                        compact
                      />
                    </View>
                    <AppText weight="semibold" style={{ color: theme.success }}>
                      {formatMoney(payment.amount, theme.currency)}
                    </AppText>
                  </View>
                ))
              )}
            </Section>

            {transaction.contact_id ? (
              <Section
                title="Customer balance"
                icon="wallet-outline"
                accent={theme.secondary}
              >
                <View style={styles.customerBalanceSummary}>
                  <View
                    style={[
                      styles.customerBalanceCard,
                      { backgroundColor: `${theme.danger}12` },
                    ]}
                  >
                    <View style={styles.customerBalanceHeading}>
                      <Ionicons
                        name="arrow-up-circle-outline"
                        size={20}
                        color={theme.danger}
                      />
                      <View style={styles.customerBalanceCopy}>
                        <AppText
                          weight="semibold"
                          style={styles.customerBalanceLabel}
                        >
                          Customer owes the farm
                        </AppText>
                        <AppText size="small" tone="secondary">
                          Across open sales
                        </AppText>
                      </View>
                    </View>
                    <View style={styles.customerBalanceAmount}>
                      <AppText
                        size="body"
                        weight="semibold"
                        style={[
                          styles.customerBalanceValue,
                          { color: theme.danger },
                        ]}
                      >
                        {formatMoneyWithBreaks(
                          sale.customer_balance_total,
                          theme.currency,
                        )}
                      </AppText>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.customerBalanceCard,
                      { backgroundColor: `${theme.primary}12` },
                    ]}
                  >
                    <View style={styles.customerBalanceHeading}>
                      <Ionicons
                        name="arrow-down-circle-outline"
                        size={20}
                        color={theme.primary}
                      />
                      <View style={styles.customerBalanceCopy}>
                        <AppText
                          weight="semibold"
                          style={styles.customerBalanceLabel}
                        >
                          Farm owes customer
                        </AppText>
                        <AppText size="small" tone="secondary">
                          Credit and overpayments
                        </AppText>
                      </View>
                    </View>
                    <View style={styles.customerBalanceAmount}>
                      <AppText
                        size="body"
                        weight="semibold"
                        style={[
                          styles.customerBalanceValue,
                          { color: theme.primary },
                        ]}
                      >
                        {formatMoneyWithBreaks(
                          sale.customer_credit_total,
                          theme.currency,
                        )}
                      </AppText>
                    </View>
                  </View>
                </View>
                {otherBalances.map((balance) => (
                  <Pressable
                    key={balance.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open sale ${balance.reference_number ?? ""}, ${Number(balance.balance_due) > 0 ? `customer owes ${formatMoney(balance.balance_due, theme.currency)}` : `farm owes customer ${formatMoney(balance.credit_balance, theme.currency)}`}`}
                    onPress={() =>
                      router.push({
                        pathname: "/sales/[saleId]",
                        params: { saleId: balance.id },
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
                    <View style={styles.balanceRowHeader}>
                      <View style={styles.balanceRowCopy}>
                        <AppText weight="semibold">
                          {balance.reference_number
                            ? `Sale ${balance.reference_number}`
                            : "Chicken sale"}
                        </AppText>
                        <AppText size="small" tone="secondary">
                          {formatDate(balance.transaction_date)}
                        </AppText>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={17}
                        color={theme.textSecondary}
                      />
                    </View>
                    <View style={styles.balanceAmount}>
                      <AppText size="small" tone="secondary">
                        {Number(balance.balance_due) > 0
                          ? "Customer owes the farm"
                          : "Farm owes customer"}
                      </AppText>
                      <AppText
                        weight="semibold"
                        style={[
                          styles.customerBalanceValue,
                          {
                            color:
                              Number(balance.balance_due) > 0
                                ? theme.danger
                                : theme.primary,
                          },
                        ]}
                      >
                        {formatMoneyWithBreaks(
                          Number(balance.balance_due) > 0
                            ? balance.balance_due
                            : balance.credit_balance,
                          theme.currency,
                        )}
                      </AppText>
                    </View>
                  </Pressable>
                ))}
                {otherBalances.length === 0 ? (
                  <AppText size="small" tone="secondary">
                    There are no other open balances with this customer.
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
  icon,
  accent,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <Card style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={[styles.sectionIcon, { backgroundColor: `${accent}16` }]}>
          <Ionicons name={icon} size={19} color={accent} />
        </View>
        <View style={styles.sectionHeadingCopy}>
          <AppText weight="semibold" size="heading" style={styles.sectionTitle}>
            {title}
          </AppText>
        </View>
      </View>
      <View style={[styles.sectionBody, { borderTopColor: theme.border }]}>
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
  return (
    <View style={styles.detailLine}>
      <AppText size="small" tone="secondary" style={styles.detailLabel}>
        {label}
      </AppText>
      <AppText
        size="small"
        weight="semibold"
        style={[styles.detailValue, valueColor ? { color: valueColor } : null]}
      >
        {value}
      </AppText>
    </View>
  );
}

function Quantity({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.quantity, { backgroundColor: theme.backgroundElement }]}>
      <AppText size="small" tone="secondary">
        {label}
      </AppText>
      <AppText weight="semibold">{value}</AppText>
    </View>
  );
}

function formatMoney(value: number | string, currency: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${currency} 0.00`;
  return `${currency} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatMoneyWithBreaks(
  value: number | string,
  currency: string,
): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${currency} 0.00`;
  return `${currency} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`.replace(/,/g, ",\u200B");
}

function formatQuantity(value: number | string): string {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString(undefined, { maximumFractionDigits: 3 })
    : "0";
}

function formatDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
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
    maxWidth: 760,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 36,
    gap: 14,
  },
  loading: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  stateCard: { alignItems: "center", gap: 10, padding: 20 },
  centered: { textAlign: "center" },
  createdNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    padding: 14,
    borderWidth: 1,
    borderRadius: 13,
  },
  createdIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  reminderNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 12,
    borderWidth: 1,
    borderRadius: 11,
  },
  reminderNoticeCopy: { flex: 1, minWidth: 0 },
  hero: { gap: 12, padding: 16, borderLeftWidth: 3 },
  heroHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  heroTitle: { flex: 1, gap: 3 },
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
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  totalCopy: { gap: 2, flex: 1 },
  balanceBadge: {
    maxWidth: "50%",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  heroDetails: { gap: 7 },
  notes: { borderTopWidth: 1, paddingTop: 10 },
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
  deliveryAction: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderWidth: 1,
    borderRadius: 14,
  },
  deliveryActionIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  actionCopy: { flex: 1, minWidth: 0, gap: 3 },
  secondaryActions: { borderTopWidth: 1 },
  secondaryAction: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 11,
  },
  secondaryActionIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  actionDivider: { height: StyleSheet.hairlineWidth, marginLeft: 49 },
  section: { gap: 12, padding: 16 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionHeadingCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { flexShrink: 1, minWidth: 0, flexWrap: "wrap" },
  sectionIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  sectionBody: { borderTopWidth: 1, paddingTop: 12, gap: 12 },
  item: { paddingTop: 12, gap: 10 },
  itemHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  itemCopy: { flex: 1, gap: 3 },
  quantityRow: { flexDirection: "row", gap: 9 },
  quantity: { flex: 1, padding: 10, borderRadius: 10, gap: 3 },
  delivery: { gap: 10 },
  deliveryItem: { gap: 7, paddingLeft: 10 },
  allocation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: 9,
    borderRadius: 9,
  },
  payment: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    paddingTop: 12,
  },
  paymentCopy: { flex: 1, gap: 4 },
  detailLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  detailLabel: { flex: 1 },
  detailValue: { flexShrink: 1, textAlign: "right" },
  balanceSummary: { borderTopWidth: 1, paddingTop: 10, gap: 8 },
  customerBalanceSummary: { gap: 9 },
  customerBalanceCard: {
    alignItems: "stretch",
    gap: 10,
    padding: 11,
    borderRadius: 10,
  },
  customerBalanceHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  customerBalanceCopy: { flex: 1, minWidth: 0, gap: 1 },
  customerBalanceLabel: { flexShrink: 1, minWidth: 0, flexWrap: "wrap" },
  customerBalanceAmount: { width: "100%", minWidth: 0 },
  customerBalanceValue: {
    width: "100%",
    minWidth: 0,
    flexWrap: "wrap",
  },
  balanceRow: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 5,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  balanceRowHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  balanceRowCopy: { flex: 1, minWidth: 0, gap: 3 },
  balanceAmount: {
    width: "100%",
    minWidth: 0,
    gap: 3,
  },
});
