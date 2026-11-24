import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type ReceiptHistoryPayment,
  type ReceiptHistoryTransaction,
  type ReceiptKind,
  type ReceiptTransactionType,
} from "@/features/receipts/api";
import { useReceiptHistory } from "@/features/receipts/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type ReceiptEntry = {
  key: string;
  transaction: ReceiptHistoryTransaction;
  kind: ReceiptKind;
  payment?: ReceiptHistoryPayment;
};

export default function ReceiptsScreen() {
  return (
    <SessionGate>
      <ReceiptsContent />
    </SessionGate>
  );
}

function ReceiptsContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [transactionType, setTransactionType] = useState<
    "all" | ReceiptTransactionType
  >("all");
  const [receiptKind, setReceiptKind] = useState<"all" | ReceiptKind>("all");
  const history = useReceiptHistory(user?.id, farm.selectedFarm?.id, {
    search: debouncedSearch || undefined,
    transactionType,
    receiptKind,
  });
  const transactions = useMemo(
    () => history.data?.pages.flatMap((page) => page.items) ?? [],
    [history.data],
  );
  const totalTransactions = history.data?.pages[0]?.total_count ?? 0;
  const currency = farm.selectedFarm?.settings?.currency ?? "KES";

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const entries = useMemo(() => {
    const records: ReceiptEntry[] = [];
    for (const transaction of transactions) {
      if (receiptKind !== "payment") {
        records.push({
          key: `${transaction.id}:transaction`,
          transaction,
          kind: "transaction",
        });
      }
      if (receiptKind !== "transaction") {
        for (const payment of transaction.payments) {
          records.push({
            key: `${transaction.id}:payment:${payment.id}`,
            transaction,
            kind: "payment",
            payment,
          });
        }
      }
    }
    return records.sort((left, right) =>
      receiptDate(right).localeCompare(receiptDate(left)),
    );
  }, [receiptKind, transactions]);

  function openReceipt(entry: ReceiptEntry) {
    router.push({
      pathname: "/transactions/[transactionId]/receipt",
      params: {
        transactionId: entry.transaction.id,
        transactionType: entry.transaction.transaction_type,
        documentKind: entry.kind,
        paymentId: entry.payment?.id,
        paymentNumber: entry.payment
          ? String(entry.payment.payment_number)
          : undefined,
      },
    });
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl
            refreshing={history.isRefetching}
            onRefresh={() => void history.refetch()}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <FarmPageHeader
          title="Receipts"
          showBack
          backHref="/(tabs)/account"
        />

        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <AppText size="heading" weight="semibold">
              Receipt library
            </AppText>
            <AppText size="small" tone="secondary">
              Find a sale, purchase, or individual payment receipt.
            </AppText>
          </View>
          <View
            style={[
              styles.heroIcon,
              { backgroundColor: `${theme.primary}14` },
            ]}
          >
            <Ionicons name="receipt-outline" size={23} color={theme.primary} />
          </View>
        </View>

        <Card style={styles.searchCard}>
          <View
            style={[
              styles.searchField,
              { backgroundColor: theme.background, borderColor: theme.border },
            ]}
          >
            <Ionicons
              name="search-outline"
              size={20}
              color={theme.textSecondary}
            />
            <TextInput
              accessibilityLabel="Search receipts"
              value={search}
              onChangeText={setSearch}
              placeholder="Number, person, product, amount…"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={[styles.searchInput, { color: theme.text }]}
            />
            {search ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear receipt search"
                hitSlop={8}
                onPress={() => setSearch("")}
              >
                <Ionicons
                  name="close-circle"
                  size={19}
                  color={theme.textSecondary}
                />
              </Pressable>
            ) : null}
          </View>
          <AppText size="small" tone="secondary">
            Search receipt numbers, customer or supplier, product names,
            payment references, dates, and amounts.
          </AppText>
        </Card>

        <View style={styles.filterSection}>
          <AppText size="small" weight="semibold">
            TRANSACTION
          </AppText>
          <View style={styles.filterRow}>
            <FilterOption
              label="All"
              icon="apps-outline"
              selected={transactionType === "all"}
              onPress={() => setTransactionType("all")}
            />
            <FilterOption
              label="Sales"
              icon="arrow-up-circle-outline"
              selected={transactionType === "sale"}
              onPress={() => setTransactionType("sale")}
            />
            <FilterOption
              label="Purchases"
              icon="arrow-down-circle-outline"
              selected={transactionType === "purchase"}
              onPress={() => setTransactionType("purchase")}
            />
          </View>
        </View>

        <View style={styles.filterSection}>
          <AppText size="small" weight="semibold">
            RECEIPT
          </AppText>
          <View style={styles.filterRow}>
            <FilterOption
              label="All documents"
              selected={receiptKind === "all"}
              onPress={() => setReceiptKind("all")}
            />
            <FilterOption
              label="Transactions"
              selected={receiptKind === "transaction"}
              onPress={() => setReceiptKind("transaction")}
            />
            <FilterOption
              label="Payments"
              selected={receiptKind === "payment"}
              onPress={() => setReceiptKind("payment")}
            />
          </View>
        </View>

        <View style={styles.resultsHeading}>
          <View style={styles.resultsCopy}>
            <AppText weight="semibold">Recent receipts</AppText>
            <AppText size="small" tone="secondary">
              {history.isLoading
                ? "Loading your transaction history…"
                : `${totalTransactions.toLocaleString()} ${totalTransactions === 1 ? "transaction" : "transactions"} found`}
            </AppText>
          </View>
          {history.isFetchingNextPage ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : null}
        </View>

        {history.isLoading ? (
          <Card style={styles.stateCard}>
            <ActivityIndicator size="large" color={theme.primary} />
            <AppText tone="secondary">Loading receipts…</AppText>
          </Card>
        ) : null}

        {history.isError ? (
          <Card style={styles.stateCard}>
            <View
              style={[
                styles.stateIcon,
                { backgroundColor: `${theme.danger}12` },
              ]}
            >
              <Ionicons
                name="cloud-offline-outline"
                size={22}
                color={theme.danger}
              />
            </View>
            <AppText weight="semibold">Couldn’t load receipts</AppText>
            <AppText size="small" tone="secondary" style={styles.centered}>
              {normalizeApiError(history.error).message}
            </AppText>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => void history.refetch()}
            />
          </Card>
        ) : null}

        {!history.isLoading && !history.isError && entries.length === 0 ? (
          <Card style={styles.emptyCard}>
            <View
              style={[
                styles.emptyIcon,
                { backgroundColor: `${theme.primary}12` },
              ]}
            >
              <Ionicons
                name={search ? "search-outline" : "receipt-outline"}
                size={25}
                color={theme.primary}
              />
            </View>
            <AppText size="heading" weight="semibold">
              {search ? "No matching receipts" : "No receipts yet"}
            </AppText>
            <AppText size="small" tone="secondary" style={styles.centered}>
              {search
                ? "Try a receipt number, a shorter search, a customer or supplier name, or a payment reference."
                : receiptKind === "payment"
                  ? "Payments recorded on sales and purchases will appear here."
                  : receiptKind === "transaction"
                    ? "Sales and purchase records will appear here."
                    : "Receipts for sales, purchases, and their payments will appear here."}
            </AppText>
            {search ? (
              <Button
                label="Clear search"
                variant="secondary"
                onPress={() => setSearch("")}
              />
            ) : null}
          </Card>
        ) : null}

        {entries.map((entry) => (
          <ReceiptCard
            key={entry.key}
            entry={entry}
            currency={currency}
            onPress={() => openReceipt(entry)}
          />
        ))}

        {history.hasNextPage ? (
          <Button
            label={
              history.isFetchingNextPage
                ? "Loading more…"
                : `Load more transactions (${Math.max(totalTransactions - transactions.length, 0).toLocaleString()} left)`
            }
            variant="secondary"
            disabled={history.isFetchingNextPage}
            onPress={() => void history.fetchNextPage()}
          />
        ) : null}

        {!history.isLoading && entries.length > 0 ? (
          <AppText size="small" tone="secondary" style={styles.footerNote}>
            Select a receipt to preview, print, or share its PDF.
          </AppText>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function FilterOption({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterOption,
        {
          backgroundColor: selected ? `${theme.primary}12` : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={16}
          color={selected ? theme.primary : theme.textSecondary}
        />
      ) : null}
      <AppText
        size="small"
        weight={selected ? "semibold" : "regular"}
        style={{ color: selected ? theme.primary : theme.text }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function ReceiptCard({
  entry,
  currency,
  onPress,
}: {
  entry: ReceiptEntry;
  currency: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const isPayment = entry.kind === "payment";
  const transaction = entry.transaction;
  const isSale = transaction.transaction_type === "sale";
  const reference = isPayment
    ? entry.payment?.reference_number ||
      entry.payment?.id ||
      `${transaction.reference_number ?? transaction.id}-PAY-${entry.payment?.payment_number}`
    : transaction.reference_number ?? transaction.id;
  const amount = isPayment
    ? Number(entry.payment?.amount ?? 0)
    : Number(transaction.transaction_total);
  const date = isPayment
    ? entry.payment?.payment_date ?? transaction.transaction_date
    : transaction.transaction_date;
  const method = isPayment
    ? formatPaymentMethod(entry.payment?.payment_method ?? "cash")
    : null;
  const subtitle = isPayment
    ? `${transaction.contact_name || (isSale ? "Walk-in customer" : "Supplier")} · ${method}`
    : transaction.contact_name || (isSale ? "Walk-in customer" : "Supplier");
  const productSummary = transaction.product_names.slice(0, 2).join(", ");
  const extraProducts = transaction.product_names.length - 2;
  const { dateLabel, dateValue } = formatReceiptDate(date);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${isPayment ? "Payment receipt" : isSale ? "Sale receipt" : "Purchase record"} ${reference}, ${subtitle}, ${formatMoney(amount, currency)}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.receiptPressable,
        { opacity: pressed ? 0.82 : 1 },
      ]}
    >
      <Card
        style={[
          styles.receiptCard,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}
      >
        <View
          style={[
            styles.receiptIcon,
            {
              backgroundColor: isPayment
                ? `${theme.success}15`
                : isSale
                  ? `${theme.primary}15`
                  : `${theme.secondary}15`,
            },
          ]}
        >
          <Ionicons
            name={
              isPayment
                ? "card-outline"
                : isSale
                  ? "arrow-up-outline"
                  : "arrow-down-outline"
            }
            size={20}
            color={
              isPayment
                ? theme.success
                : isSale
                  ? theme.primary
                  : theme.secondary
            }
          />
        </View>
        <View style={styles.receiptMain}>
          <View style={styles.receiptTopline}>
            <AppText
              size="small"
              weight="semibold"
              style={{ color: isPayment ? theme.success : theme.primary }}
            >
              {isPayment
                ? "PAYMENT RECEIPT"
                : isSale
                  ? "SALE RECEIPT"
                  : "PURCHASE RECORD"}
            </AppText>
            {transaction.status === "cancelled" ? (
              <View
                style={[
                  styles.cancelledBadge,
                  { backgroundColor: `${theme.danger}12` },
                ]}
              >
                <AppText
                  size="small"
                  weight="semibold"
                  style={{ color: theme.danger }}
                >
                  Cancelled
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText weight="semibold" numberOfLines={1}>
            {reference}
          </AppText>
          <AppText size="small" tone="secondary" numberOfLines={1}>
            {subtitle}
          </AppText>
          {isPayment && !entry.payment?.reference_number ? (
            <AppText size="small" tone="secondary" numberOfLines={1}>
              {transaction.reference_number ?? transaction.id}
            </AppText>
          ) : null}
          {!isPayment && productSummary ? (
            <AppText size="small" tone="secondary" numberOfLines={1}>
              {productSummary}
              {extraProducts > 0 ? ` + ${extraProducts} more` : ""}
            </AppText>
          ) : null}
        </View>
        <View style={styles.receiptAmount}>
          <AppText size="small" tone="secondary" style={styles.dateLabel}>
            {dateLabel}
          </AppText>
          <AppText size="small" weight="semibold" style={{ color: theme.text }}>
            {formatMoney(amount, currency)}
          </AppText>
          <Ionicons
            name="chevron-forward"
            size={17}
            color={theme.textSecondary}
          />
        </View>
        <View
          style={[styles.receiptPerforation, { borderColor: theme.border }]}
        />
        <View style={styles.receiptBottom}>
          <View style={styles.receiptBottomMeta}>
            <Ionicons
              name="calendar-outline"
              size={14}
              color={theme.textSecondary}
            />
            <AppText size="small" tone="secondary">
              {dateValue}
            </AppText>
          </View>
          {isPayment && entry.payment ? (
            <View style={styles.receiptBottomMeta}>
              <Ionicons
                name="receipt-outline"
                size={14}
                color={theme.textSecondary}
              />
              <AppText size="small" tone="secondary">
                Payment {entry.payment.payment_number}
              </AppText>
            </View>
          ) : (
            <AppText size="small" tone="secondary">
              {transaction.product_names.length}{" "}
              {transaction.product_names.length === 1 ? "product" : "products"}
            </AppText>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

function receiptDate(entry: ReceiptEntry): string {
  return entry.payment?.payment_date ?? entry.transaction.transaction_date;
}

function formatReceiptDate(value: string): { dateLabel: string; dateValue: string } {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return { dateLabel: "DATE", dateValue: value };
  }
  return {
    dateLabel: "DATE",
    dateValue: new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(parsed),
  };
}

function formatPaymentMethod(
  method: ReceiptHistoryPayment["payment_method"],
): string {
  switch (method) {
    case "mpesa":
      return "M-Pesa";
    case "bank_transfer":
      return "Bank transfer";
    default:
      return method[0].toUpperCase() + method.slice(1);
  }
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 40,
    gap: 14,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  heroCopy: { flex: 1, gap: 4 },
  heroIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  searchCard: { gap: 9, padding: 12, borderRadius: 14 },
  searchField: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 11,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    paddingVertical: 8,
  },
  filterSection: { gap: 8 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  filterOption: {
    minHeight: 37,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderRadius: 10,
  },
  resultsHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 4,
  },
  resultsCopy: { flex: 1, gap: 3 },
  receiptPressable: { borderRadius: 15 },
  receiptCard: {
    position: "relative",
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 10,
    padding: 13,
    borderRadius: 15,
    borderWidth: 1,
  },
  receiptIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  receiptMain: { flex: 1, minWidth: 100, gap: 3 },
  receiptTopline: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  cancelledBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  receiptAmount: {
    alignItems: "flex-end",
    gap: 5,
    maxWidth: "42%",
  },
  dateLabel: { fontSize: 10, letterSpacing: 0.6 },
  receiptPerforation: {
    width: "100%",
    height: 1,
    marginTop: 2,
    borderTopWidth: 1,
    borderStyle: "dashed",
  },
  receiptBottom: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  receiptBottomMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  stateCard: { alignItems: "center", gap: 10, paddingVertical: 22 },
  stateIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  centered: { textAlign: "center" },
  emptyCard: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 26,
  },
  emptyIcon: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  footerNote: { textAlign: "center", paddingVertical: 3 },
});
