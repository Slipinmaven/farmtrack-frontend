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
import type { ReceiptHistoryTransaction } from "@/features/receipts/api";
import { useReceiptHistory } from "@/features/receipts/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type PurchaseStatusFilter = "all" | "completed" | "cancelled";
type PurchasePeriod = "all" | "month" | "30days";

export default function PurchasesScreen() {
  return (
    <SessionGate>
      <PurchasesContent />
    </SessionGate>
  );
}

function PurchasesContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const currency = farm.selectedFarm?.settings?.currency ?? "KES";
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<PurchaseStatusFilter>("all");
  const [period, setPeriod] = useState<PurchasePeriod>("all");
  const dateRange = useMemo(() => getDateRange(period), [period]);
  const history = useReceiptHistory(user?.id, farm.selectedFarm?.id, {
    search: debouncedSearch || undefined,
    transactionType: "purchase",
    receiptKind: "all",
    status,
    fromDate: dateRange.fromDate,
    toDate: dateRange.toDate,
  });
  const purchases = useMemo(
    () => history.data?.pages.flatMap((page) => page.items) ?? [],
    [history.data],
  );
  const totalCount = history.data?.pages[0]?.total_count ?? 0;
  const completedTotal = history.data?.pages[0]?.completed_total ?? 0;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  function clearFilters() {
    setSearch("");
    setStatus("all");
    setPeriod("all");
  }

  const hasFilters = Boolean(search || status !== "all" || period !== "all");

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
        <FarmPageHeader title="Purchases" showBack backHref="/(tabs)/account" />

        <View style={styles.pageIntro}>
          <View style={styles.pageIntroIcon}>
            <Ionicons
              name="bag-handle-outline"
              size={21}
              color={theme.primary}
            />
          </View>
          <View style={styles.pageIntroCopy}>
            <AppText size="heading" weight="semibold">
              Purchases
            </AppText>
            <AppText size="small" tone="secondary">
              Record stock bought or find a previous purchase.
            </AppText>
          </View>
        </View>

        <View style={styles.actionGrid}>
          <PurchaseAction
            icon="egg-outline"
            title="Buy chickens"
            detail="Add birds to your flock"
            tint={theme.primary}
            onPress={() => router.push("/chicken-purchase")}
          />
          <PurchaseAction
            icon="cube-outline"
            title="Buy other stock"
            detail="Feed, medicine and supplies"
            tint={theme.secondary}
            onPress={() => router.push("/inventory/purchase")}
          />
        </View>

        <Card style={styles.summaryCard}>
          <View style={styles.summaryMain}>
            <View style={styles.summaryTitle}>
              <Ionicons name="wallet-outline" size={17} color={theme.primary} />
              <AppText size="small" weight="semibold" tone="secondary">
                Completed purchase value
              </AppText>
            </View>
            <AppText size="heading" weight="semibold">
              {history.isLoading ? "—" : formatMoney(completedTotal, currency)}
            </AppText>
            <AppText size="small" tone="secondary">
              Cancelled purchases are excluded
            </AppText>
          </View>
          <View
            style={[styles.summaryDivider, { backgroundColor: theme.border }]}
          />
          <View style={styles.summaryCount}>
            <AppText size="heading" weight="semibold">
              {history.isLoading ? "—" : totalCount}
            </AppText>
            <AppText size="small" tone="secondary">
              {totalCount === 1 ? "purchase" : "purchases"}
            </AppText>
          </View>
        </Card>

        <View style={styles.historyHeading}>
          <View style={styles.historyIcon}>
            <Ionicons name="receipt-outline" size={19} color={theme.primary} />
          </View>
          <View style={styles.historyHeadingCopy}>
            <AppText size="body" weight="semibold">
              Purchase history
            </AppText>
            <AppText size="small" tone="secondary">
              {history.isLoading
                ? "Loading purchases"
                : `${totalCount.toLocaleString()} matching ${totalCount === 1 ? "record" : "records"}`}
            </AppText>
          </View>
        </View>

        <View
          style={[
            styles.searchField,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}
        >
          <Ionicons
            name="search-outline"
            size={19}
            color={theme.textSecondary}
          />
          <TextInput
            accessibilityLabel="Search purchases"
            value={search}
            onChangeText={setSearch}
            placeholder="Supplier, item, receipt or amount"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={[styles.searchInput, { color: theme.text }]}
          />
          {search ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear purchase search"
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

        <View style={styles.filters}>
          <View style={styles.filterGroup}>
            <AppText size="small" weight="semibold">
              DATE
            </AppText>
            <View style={styles.chipRow}>
              <FilterChip
                label="Any time"
                selected={period === "all"}
                onPress={() => setPeriod("all")}
              />
              <FilterChip
                label="This month"
                selected={period === "month"}
                onPress={() => setPeriod("month")}
              />
              <FilterChip
                label="Last 30 days"
                selected={period === "30days"}
                onPress={() => setPeriod("30days")}
              />
            </View>
          </View>
          <View style={styles.filterGroup}>
            <AppText size="small" weight="semibold">
              STATUS
            </AppText>
            <View style={styles.chipRow}>
              <FilterChip
                label="All"
                selected={status === "all"}
                onPress={() => setStatus("all")}
              />
              <FilterChip
                label="Completed"
                selected={status === "completed"}
                onPress={() => setStatus("completed")}
              />
              <FilterChip
                label="Cancelled"
                selected={status === "cancelled"}
                onPress={() => setStatus("cancelled")}
              />
            </View>
          </View>
          {hasFilters ? (
            <Pressable
              accessibilityRole="button"
              onPress={clearFilters}
              style={styles.clearFilters}
            >
              <Ionicons
                name="close-circle-outline"
                size={16}
                color={theme.primary}
              />
              <AppText
                size="small"
                weight="semibold"
                style={{ color: theme.primary }}
              >
                Clear filters
              </AppText>
            </Pressable>
          ) : null}
        </View>

        {history.isLoading ? (
          <Card style={styles.stateCard}>
            <ActivityIndicator size="large" color={theme.primary} />
            <AppText size="small" tone="secondary">
              Loading purchase history…
            </AppText>
          </Card>
        ) : history.isError ? (
          <Card style={styles.stateCard}>
            <Ionicons
              name="cloud-offline-outline"
              size={23}
              color={theme.danger}
            />
            <AppText weight="semibold">Purchases couldn’t be loaded</AppText>
            <AppText size="small" tone="secondary" style={styles.centered}>
              {normalizeApiError(history.error).message}
            </AppText>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => void history.refetch()}
            />
          </Card>
        ) : purchases.length === 0 ? (
          <Card style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name={hasFilters ? "search-outline" : "file-tray-outline"}
                size={25}
                color={theme.primary}
              />
            </View>
            <AppText size="body" weight="semibold">
              {hasFilters
                ? "No purchases match these filters"
                : "No purchases recorded yet"}
            </AppText>
            <AppText size="small" tone="secondary" style={styles.centered}>
              {hasFilters
                ? "Try a different supplier, item or date range."
                : "When you buy chickens or farm stock, the records will be available here."}
            </AppText>
            {hasFilters ? (
              <Pressable onPress={clearFilters} style={styles.clearEmpty}>
                <AppText
                  size="small"
                  weight="semibold"
                  style={{ color: theme.primary }}
                >
                  Show all purchases
                </AppText>
              </Pressable>
            ) : null}
          </Card>
        ) : (
          <View style={styles.purchaseList}>
            {purchases.map((purchase) => (
              <PurchaseRow
                key={purchase.id}
                purchase={purchase}
                currency={currency}
                onPress={() =>
                  router.push({
                    pathname: "/transactions/[transactionId]/receipt",
                    params: {
                      transactionId: purchase.id,
                      transactionType: "purchase",
                      documentKind: "transaction",
                    },
                  })
                }
              />
            ))}
          </View>
        )}

        {history.hasNextPage ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: history.isFetchingNextPage }}
            disabled={history.isFetchingNextPage}
            onPress={() => void history.fetchNextPage()}
            style={({ pressed }) => [
              styles.loadMore,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
                opacity: pressed || history.isFetchingNextPage ? 0.7 : 1,
              },
            ]}
          >
            {history.isFetchingNextPage ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Ionicons name="time-outline" size={18} color={theme.primary} />
            )}
            <AppText
              size="small"
              weight="semibold"
              style={{ color: theme.primary }}
            >
              {history.isFetchingNextPage
                ? "Loading older purchases…"
                : "Load older purchases"}
            </AppText>
            <Ionicons name="chevron-down" size={17} color={theme.primary} />
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function PurchaseAction({
  icon,
  title,
  detail,
  tint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  tint: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionCard,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <View style={[styles.actionIcon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <View style={styles.actionCopy}>
        <AppText weight="semibold">{title}</AppText>
        <AppText size="small" tone="secondary">
          {detail}
        </AppText>
      </View>
      <View style={[styles.actionArrow, { backgroundColor: `${tint}18` }]}>
        <Ionicons name="arrow-forward" size={16} color={tint} />
      </View>
    </Pressable>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.filterChip,
        {
          backgroundColor: selected
            ? theme.backgroundSelected
            : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}
    >
      {selected ? (
        <Ionicons name="checkmark" size={14} color={theme.primary} />
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

function PurchaseRow({
  purchase,
  currency,
  onPress,
}: {
  purchase: ReceiptHistoryTransaction;
  currency: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const cancelled = purchase.status === "cancelled";
  const productSummary = purchase.product_names.join(", ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open purchase ${purchase.reference_number ?? ""}, ${cancelled ? "cancelled" : "completed"}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.purchaseCard,
        {
          backgroundColor: pressed
            ? theme.backgroundSelected
            : theme.backgroundElement,
          borderColor: cancelled ? theme.danger : theme.border,
        },
      ]}
    >
      <View style={styles.purchaseTop}>
        <View style={styles.purchaseIdentity}>
          <View
            style={[
              styles.supplierIcon,
              {
                backgroundColor: cancelled
                  ? `${theme.danger}18`
                  : theme.backgroundSelected,
              },
            ]}
          >
            <Ionicons
              name={cancelled ? "close-circle-outline" : "bag-handle-outline"}
              size={18}
              color={cancelled ? theme.danger : theme.primary}
            />
          </View>
          <View style={styles.purchaseCopy}>
            <AppText weight="semibold" numberOfLines={1}>
              {purchase.contact_name ?? "Supplier not recorded"}
            </AppText>
            <AppText size="small" tone="secondary" numberOfLines={1}>
              {purchase.reference_number ?? "Purchase record"}
            </AppText>
          </View>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={theme.textSecondary}
        />
      </View>

      <View style={styles.purchaseDetails}>
        <View style={styles.purchaseItem}>
          <Ionicons name="cube-outline" size={15} color={theme.textSecondary} />
          <AppText
            size="small"
            tone="secondary"
            numberOfLines={2}
            style={styles.itemText}
          >
            {productSummary || "Items not listed"}
          </AppText>
        </View>
        <View style={styles.purchaseBottom}>
          <View style={styles.purchaseMeta}>
            <Ionicons
              name="calendar-outline"
              size={14}
              color={theme.textSecondary}
            />
            <AppText size="small" tone="secondary">
              {formatPurchaseDate(purchase.transaction_date)}
            </AppText>
          </View>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: cancelled
                  ? `${theme.danger}18`
                  : theme.backgroundSelected,
              },
            ]}
          >
            <Ionicons
              name={cancelled ? "close-circle" : "checkmark-circle"}
              size={14}
              color={cancelled ? theme.danger : theme.primary}
            />
            <AppText
              size="small"
              weight="semibold"
              style={{ color: cancelled ? theme.danger : theme.primary }}
            >
              {cancelled ? "Cancelled" : "Completed"}
            </AppText>
          </View>
        </View>
      </View>

      <View style={[styles.totalStrip, { borderTopColor: theme.border }]}>
        <AppText size="small" tone="secondary">
          {cancelled
            ? "Recorded total · not counted as spend"
            : "Purchase total"}
        </AppText>
        <AppText
          weight="semibold"
          style={{ color: cancelled ? theme.textSecondary : theme.text }}
        >
          {formatMoney(purchase.transaction_total, currency)}
        </AppText>
      </View>
    </Pressable>
  );
}

function getDateRange(period: PurchasePeriod) {
  if (period === "all") return { fromDate: undefined, toDate: undefined };
  const today = new Date();
  const end = toDateString(today);
  if (period === "month") {
    return {
      fromDate: toDateString(
        new Date(today.getFullYear(), today.getMonth(), 1),
      ),
      toDate: end,
    };
  }
  const start = new Date(today);
  start.setDate(start.getDate() - 29);
  return { fromDate: toDateString(start), toDate: end };
}

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPurchaseDate(value: string): string {
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(parsed);
}

function formatMoney(value: number | string, currency: string) {
  const amount = Number(value);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return `${currency} ${Number.isFinite(amount) ? amount.toLocaleString() : "0"}`;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 14,
  },
  pageIntro: { flexDirection: "row", alignItems: "center", gap: 11 },
  pageIntroIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "rgba(34,107,104,0.12)",
  },
  pageIntroCopy: { flex: 1, gap: 2 },
  actionGrid: { flexDirection: "row", gap: 10 },
  actionCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 142,
    justifyContent: "space-between",
    gap: 11,
    padding: 13,
    borderWidth: 1,
    borderRadius: 15,
  },
  actionIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  actionCopy: { gap: 3 },
  actionArrow: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
    borderRadius: 14,
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    borderRadius: 14,
    padding: 14,
  },
  summaryMain: { flex: 1, minWidth: 0, gap: 5 },
  summaryTitle: { flexDirection: "row", alignItems: "center", gap: 6 },
  summaryDivider: { width: StyleSheet.hairlineWidth, alignSelf: "stretch" },
  summaryCount: { minWidth: 70, alignItems: "center", gap: 2 },
  historyHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 3,
  },
  historyIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "rgba(34,107,104,0.12)",
  },
  historyHeadingCopy: { flex: 1, gap: 1 },
  searchField: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, minWidth: 0, minHeight: 46, fontSize: 16 },
  filters: { gap: 10 },
  filterGroup: { gap: 7 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  filterChip: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 11,
  },
  clearFilters: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: 2,
  },
  purchaseList: { gap: 10 },
  purchaseCard: { borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  purchaseTop: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  purchaseIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  supplierIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  purchaseCopy: { flex: 1, minWidth: 0, gap: 3 },
  purchaseDetails: { gap: 9, paddingHorizontal: 12, paddingVertical: 10 },
  purchaseItem: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  itemText: { flex: 1 },
  purchaseBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  purchaseMeta: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusBadge: {
    minHeight: 27,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 14,
    paddingHorizontal: 8,
  },
  totalStrip: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  stateCard: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 22,
  },
  emptyCard: { alignItems: "center", gap: 9, padding: 20, borderRadius: 14 },
  emptyIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "rgba(34,107,104,0.12)",
  },
  centered: { textAlign: "center" },
  clearEmpty: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  loadMore: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 12,
  },
});
