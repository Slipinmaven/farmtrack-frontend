import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
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
import { TextField } from "@/components/ui/text-field";
import type {
  SaleCategory,
  SaleStatus,
} from "@/features/sales/api";
import { useSalesReport } from "@/features/sales/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

const pageSize = 20;

export default function SalesScreen() {
  return (
    <SessionGate>
      <SalesContent />
    </SessionGate>
  );
}

function SalesContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const routeParams = useLocalSearchParams<{
    from_date?: string;
    to_date?: string;
  }>();
  const numberColors =
    theme.mode === "dark"
      ? {
          sales: "#67E8C1",
          received: "#73D995",
          owed: "#FF827A",
          count: "#FFC95C",
          credit: "#C4A7FF",
        }
      : {
          sales: "#176B55",
          received: "#287A3F",
          owed: "#B3261E",
          count: "#8A5A00",
          credit: "#6C48A8",
        };
  const fromDate =
    typeof routeParams.from_date === "string" ? routeParams.from_date : "";
  const toDate =
    typeof routeParams.to_date === "string" ? routeParams.to_date : "";
  const [category, setCategory] = useState<SaleCategory | "">("");
  const [status, setStatus] = useState<SaleStatus>("completed");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const isDateRangeValid = !fromDate || !toDate || fromDate <= toDate;
  const report = useSalesReport(user?.id, farm.selectedFarm?.id, {
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
    category: category || undefined,
    status,
    search: debouncedSearch || undefined,
    offset,
    limit: pageSize,
  }, isDateRangeValid);
  const data = isDateRangeValid ? report.data : undefined;
  const currency = farm.selectedFarm?.settings?.currency ?? "KES";
  const pageStart = data?.total_count ? offset + 1 : 0;
  const pageEnd = Math.min(offset + pageSize, data?.total_count ?? 0);
  const monthly = data?.summary.monthly.slice(-6) ?? [];
  const maxMonthlySales = Math.max(
    1,
    ...monthly.map((month) => Number(month.sales_total) || 0),
  );
  const categories: { label: string; value: SaleCategory | "" }[] = [
    { label: "All categories", value: "" },
    ...(data?.sellable_categories ?? []).map((value) => ({
      label: labelize(value),
      value,
    })),
  ];

  function clearFilters() {
    router.setParams({ from_date: "", to_date: "" });
    setCategory("");
    setStatus("completed");
    setSearch("");
    setOffset(0);
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top"]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <FarmPageHeader title="Sales" />

        <View style={styles.pageHeading}>
          <View style={styles.headingCopy}>
            <AppText size="heading" weight="semibold">
              Sales overview
            </AppText>
            <AppText size="small" tone="secondary">
              Sales performance and transaction history
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh sales"
            disabled={!isDateRangeValid}
            onPress={() => void report.refetch()}
            style={[styles.refreshButton, { borderColor: theme.border }]}
          >
            <Ionicons name="refresh-outline" size={19} color={theme.primary} />
          </Pressable>
        </View>

        {data ? (
          <>
            <Card style={styles.salesOverview}>
              <View
                style={[
                  styles.overviewMain,
                  {
                    borderLeftColor: numberColors.sales,
                    backgroundColor: theme.background,
                  },
                ]}
              >
                <View style={styles.heroLabelRow}>
                  <View
                    style={[
                      styles.heroIcon,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <Ionicons
                      name="trending-up-outline"
                      size={20}
                      color={numberColors.sales}
                    />
                  </View>
                  <View style={styles.heroLabelCopy}>
                    <AppText
                      size="small"
                      weight="semibold"
                      style={{ color: theme.textSecondary }}
                    >
                      COMPLETED SALES
                    </AppText>
                    <AppText size="small" tone="secondary">
                      {fromDate && toDate
                        ? `${formatDate(fromDate)} – ${formatDate(toDate)}`
                        : fromDate
                          ? `From ${formatDate(fromDate)}`
                          : toDate
                            ? `Through ${formatDate(toDate)}`
                            : "All dates · value of completed sales"}
                    </AppText>
                  </View>
                </View>
                <AppText
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[styles.heroValue, { color: numberColors.sales }]}
                >
                  {formatMoney(data.summary.sales_total, currency)}
                </AppText>
                <View style={styles.heroTransactionCount}>
                  <Ionicons
                    name="receipt-outline"
                    size={14}
                    color={numberColors.count}
                  />
                  <AppText size="small" tone="secondary">
                    {data.summary.transaction_count.toLocaleString()} completed{" "}
                    {data.summary.transaction_count === 1 ? "sale" : "sales"}
                  </AppText>
                </View>
              </View>
              <View style={styles.metrics}>
                <Metric
                  title="Sales"
                  value={data.summary.transaction_count.toLocaleString()}
                  icon="receipt-outline"
                  accent={numberColors.count}
                  description="Completed"
                  theme={theme}
                />
                <Metric
                  title="Payments received"
                  value={formatMoney(data.summary.amount_received, currency)}
                  icon="cash-outline"
                  accent={numberColors.received}
                  description="Customers have paid"
                  theme={theme}
                />
                <Metric
                  title="Still owed"
                  value={formatMoney(data.summary.balance_due, currency)}
                  icon="time-outline"
                  accent={
                    Number(data.summary.balance_due) > 0
                      ? numberColors.owed
                      : numberColors.received
                  }
                  description="Outstanding balance"
                  theme={theme}
                />
              </View>
            </Card>

            <Card style={styles.monthlyCard}>
              <View style={styles.sectionHeading}>
                <View style={styles.headingCopy}>
                  <AppText weight="semibold">Monthly sales & receipts</AppText>
                  <AppText size="small" tone="secondary">
                    Sales by sale month; payments by payment month
                  </AppText>
                </View>
                <Ionicons name="calendar-outline" size={20} color={theme.primary} />
              </View>
              {monthly.length ? (
                monthly.map((month) => (
                  <View
                    key={month.month}
                    style={[styles.monthRow, { borderTopColor: theme.border }]}
                  >
                    <View style={styles.monthName}>
                      <AppText weight="semibold">{formatMonth(month.month)}</AppText>
                      <AppText size="small" tone="secondary">
                        {month.transaction_count.toLocaleString()}{" "}
                        {month.transaction_count === 1 ? "sale" : "sales"}
                      </AppText>
                    </View>
                    <View style={styles.monthAmounts}>
                      <AppText
                        size="small"
                        weight="semibold"
                        style={{ color: numberColors.sales }}
                      >
                        {formatMoney(month.sales_total, currency)}
                      </AppText>
                      <AppText
                        size="small"
                        weight="semibold"
                        style={{ color: numberColors.received }}
                      >
                        {formatMoney(month.amount_received, currency)} received
                      </AppText>
                    </View>
                    <View
                      style={[
                        styles.monthTrack,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <View
                        style={[
                          styles.monthBar,
                          {
                            backgroundColor: numberColors.sales,
                            width: `${Math.max(
                              3,
                              (Number(month.sales_total) / maxMonthlySales) * 100,
                            )}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                ))
              ) : (
                <AppText size="small" tone="secondary">
                  No completed sales in this date range.
                </AppText>
              )}
            </Card>
          </>
        ) : null}

        <Card style={styles.filters}>
          <View style={styles.sectionHeading}>
            <AppText weight="semibold">Find sales</AppText>
            <Pressable accessibilityRole="button" onPress={clearFilters}>
              <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                Clear
              </AppText>
            </Pressable>
          </View>
          <TextField
            label="Search"
            value={search}
            onChangeText={(value) => {
              setOffset(0);
              setSearch(value);
            }}
            placeholder="Reference, customer or product"
            autoCapitalize="none"
          />
          <View style={styles.dateFilters}>
            <DatePickerField
              label="From"
              value={fromDate}
              onChange={(value) => {
                setOffset(0);
                router.setParams({ from_date: value });
              }}
            />
            <DatePickerField
              label="To"
              value={toDate}
              onChange={(value) => {
                setOffset(0);
                router.setParams({ to_date: value });
              }}
            />
          </View>
          {!isDateRangeValid ? (
            <AppText size="small" style={{ color: theme.danger }}>
              Start date must be on or before end date.
            </AppText>
          ) : null}
          <AppText size="small" weight="semibold">
            Product category
          </AppText>
          {categories.length > 1 ? (
            <View style={styles.chips}>
              {categories.map((item) => {
                const selected = category === item.value;
                return (
                  <Pressable
                    key={item.value || "all"}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => {
                      setOffset(0);
                      setCategory(item.value);
                    }}
                    style={[
                      styles.chip,
                      {
                        borderColor: selected ? theme.primary : theme.border,
                        backgroundColor: selected
                          ? theme.backgroundSelected
                          : theme.backgroundElement,
                      },
                    ]}
                  >
                    <AppText
                      size="small"
                      weight={selected ? "semibold" : "regular"}
                      style={selected ? { color: theme.primary } : undefined}
                    >
                      {item.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <AppText size="small" tone="secondary">
              No active sellable products are set up for this farm.
            </AppText>
          )}
          <AppText size="small" weight="semibold">
            Sale status
          </AppText>
          <View style={styles.chips}>
            {(
              [
                ["completed", "Completed"],
                ["cancelled", "Cancelled"],
                ["all", "All statuses"],
              ] as const
            ).map(([value, label]) => {
              const selected = status === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => {
                    setOffset(0);
                    setStatus(value);
                  }}
                  style={[
                    styles.chip,
                    {
                      borderColor: selected ? theme.primary : theme.border,
                      backgroundColor: selected
                        ? theme.backgroundSelected
                        : theme.backgroundElement,
                    },
                  ]}
                >
                  <AppText
                    size="small"
                    weight={selected ? "semibold" : "regular"}
                    style={selected ? { color: theme.primary } : undefined}
                  >
                    {label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <View style={styles.listHeading}>
          <View style={styles.headingCopy}>
            <AppText size="heading" weight="semibold">
              Sale records
            </AppText>
            {data ? (
              <AppText size="small" tone="secondary">
                {data.total_count.toLocaleString()}{" "}
                {data.total_count === 1 ? "sale" : "sales"} match your filters
              </AppText>
            ) : null}
          </View>
          {report.isFetching ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : null}
        </View>

        {isDateRangeValid && report.isError ? (
          <Card style={styles.stateCard}>
            <Ionicons name="cloud-offline-outline" size={25} color={theme.danger} />
            <AppText weight="semibold">Couldn’t load sales</AppText>
            <AppText size="small" tone="secondary">
              {normalizeApiError(report.error).message}
            </AppText>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => void report.refetch()}
            />
          </Card>
        ) : null}

        {isDateRangeValid && report.isLoading ? (
          <Card style={styles.stateCard}>
            <ActivityIndicator color={theme.primary} />
            <AppText size="small" tone="secondary">
              Loading sales…
            </AppText>
          </Card>
        ) : null}

        {data?.items.length === 0 ? (
          <Card style={styles.stateCard}>
            <Ionicons name="receipt-outline" size={26} color={theme.textSecondary} />
            <AppText weight="semibold">No sales found</AppText>
            <AppText size="small" tone="secondary">
              Try changing the dates or filters to find a sale.
            </AppText>
          </Card>
        ) : null}

        {data?.items.map((sale) => {
          const isCancelled = sale.status === "cancelled";
          return (
            <Pressable
              key={sale.id}
              accessibilityRole="button"
              accessibilityLabel={`Open sale ${sale.reference_number ?? ""}, ${sale.customer_name ?? "walk-in customer"}, ${formatMoney(sale.transaction_total, currency)}`}
              onPress={() =>
                router.push({
                  pathname: "/sales/[saleId]",
                  params: { saleId: sale.id },
                })
              }
              style={({ pressed }) => [
                styles.saleCard,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.backgroundElement,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <View style={styles.saleTopRow}>
                <View style={styles.saleTitle}>
                  <AppText weight="semibold" numberOfLines={1}>
                    {sale.reference_number
                      ? `Sale ${sale.reference_number}`
                      : "Sale"}
                  </AppText>
                  <AppText size="small" tone="secondary">
                    {formatDate(sale.transaction_date)}
                  </AppText>
                </View>
                <AppText
                  size="small"
                  weight="semibold"
                  style={{
                    color: isCancelled ? numberColors.owed : numberColors.received,
                  }}
                >
                  {isCancelled ? "Cancelled" : "Completed"}
                </AppText>
              </View>
              <AppText size="small" weight="semibold">
                {sale.customer_name ?? "Walk-in customer"}
              </AppText>
              <View style={styles.productsSold}>
                {sale.products_sold.length ? (
                  sale.products_sold.map((product) => (
                    <View
                      key={`${product.name}-${product.unit_name ?? ""}`}
                      style={styles.productSoldRow}
                    >
                      <AppText
                        size="small"
                        tone="secondary"
                        numberOfLines={2}
                        style={styles.productSoldName}
                      >
                        {product.name}
                      </AppText>
                      <View
                        style={[
                          styles.quantityPill,
                          { backgroundColor: theme.backgroundSelected },
                        ]}
                      >
                        <AppText
                          size="small"
                          weight="semibold"
                          style={{ color: numberColors.count }}
                        >
                          {formatQuantity(product.quantity)}
                          {product.unit_name ? ` ${product.unit_name}` : ""}
                        </AppText>
                      </View>
                    </View>
                  ))
                ) : (
                  <AppText size="small" tone="secondary">
                    No product details
                  </AppText>
                )}
              </View>
              <View
                style={[
                  styles.saleBottomRow,
                  { borderTopColor: theme.border },
                ]}
              >
                <View style={styles.saleTags}>
                  {sale.categories.map((item) => (
                    <View
                      key={item}
                      style={[
                        styles.categoryTag,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <AppText
                        size="small"
                        style={{ color: numberColors.sales }}
                      >
                        {labelize(item)}
                      </AppText>
                    </View>
                  ))}
                </View>
                <View style={styles.saleAmounts}>
                  <AppText
                    weight="semibold"
                    style={[styles.saleTotal, { color: numberColors.sales }]}
                  >
                    {formatMoney(sale.transaction_total, currency)}
                  </AppText>
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{
                      color:
                        Number(sale.balance_due) > 0
                          ? numberColors.owed
                          : Number(sale.credit_balance) > 0
                            ? numberColors.credit
                            : numberColors.received,
                    }}
                  >
                    {Number(sale.balance_due) > 0
                      ? `Owed ${formatMoney(sale.balance_due, currency)}`
                      : Number(sale.credit_balance) > 0
                        ? `Credit ${formatMoney(sale.credit_balance, currency)}`
                        : `Paid ${formatMoney(sale.amount_paid, currency)}`}
                  </AppText>
                </View>
              </View>
            </Pressable>
          );
        })}

        {data && data.total_count > 0 ? (
          <View style={styles.pagination}>
            <AppText size="small" tone="secondary">
              Showing {pageStart}–{pageEnd} of {data.total_count.toLocaleString()}
            </AppText>
            <View style={styles.pageButtons}>
              <Button
                label="Previous"
                variant="secondary"
                disabled={offset === 0 || report.isFetching}
                onPress={() => setOffset(Math.max(0, offset - pageSize))}
              />
              <Button
                label="Next"
                variant="secondary"
                disabled={offset + pageSize >= data.total_count || report.isFetching}
                onPress={() => setOffset(offset + pageSize)}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({
  title,
  value,
  icon,
  accent,
  description,
  theme,
}: {
  title: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  description: string;
  theme: ReturnType<typeof useTheme>["theme"];
}) {
  return (
    <View
      style={[
        styles.metric,
        {
          borderColor: theme.border,
          borderLeftColor: accent,
          backgroundColor: theme.backgroundElement,
        },
      ]}
    >
      <View style={[styles.metricIcon, { backgroundColor: theme.backgroundSelected }]}>
        <Ionicons name={icon} size={17} color={accent} />
      </View>
      <View style={styles.metricCopy}>
        <AppText size="small" weight="semibold" numberOfLines={1}>
          {title}
        </AppText>
        <AppText size="small" tone="secondary" numberOfLines={1}>
          {description}
        </AppText>
      </View>
      <AppText
        size="small"
        weight="semibold"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[styles.metricValue, { color: accent }]}
      >
        {value}
      </AppText>
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

function formatQuantity(value: number | string): string {
  const quantity = Number(value);
  return Number.isFinite(quantity)
    ? quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })
    : String(value);
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
}

function formatMonth(value: string): string {
  const date = new Date(`${value}-01T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        month: "long",
        year: "numeric",
      }).format(date);
}

function labelize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 920,
    alignSelf: "center",
    padding: 18,
    gap: 14,
  },
  pageHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  headingCopy: { flex: 1, gap: 4 },
  refreshButton: {
    width: 42,
    height: 42,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  salesOverview: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 14,
    padding: 18,
  },
  overviewMain: {
    flexGrow: 2,
    flexBasis: "38%",
    minWidth: 260,
    gap: 10,
    borderLeftWidth: 3,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  heroLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  heroLabelCopy: { gap: 2 },
  heroValue: {
    fontSize: 36,
    lineHeight: 44,
    fontWeight: "700",
    letterSpacing: -0.7,
    fontVariant: ["tabular-nums"],
  },
  heroTransactionCount: {
    paddingTop: 2,
  },
  metrics: {
    flexGrow: 3,
    flexBasis: "54%",
    minWidth: 220,
    flexDirection: "column",
    gap: 8,
  },
  metric: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  metricIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  metricCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  metricValue: {
    maxWidth: "48%",
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  monthlyCard: { gap: 12 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  monthRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  monthName: { flex: 1, gap: 3 },
  monthAmounts: { alignItems: "flex-end", gap: 3 },
  monthTrack: {
    width: "100%",
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
  },
  monthBar: {
    height: "100%",
    borderRadius: 3,
  },
  filters: { gap: 13 },
  dateFilters: {
    flexDirection: "row",
    gap: 10,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  chip: {
    minHeight: 36,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  listHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  stateCard: { alignItems: "center", gap: 10, paddingVertical: 22 },
  saleCard: {
    gap: 9,
    borderWidth: 1,
    borderRadius: 11,
    padding: 13,
  },
  saleTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  saleTitle: { flex: 1, gap: 3 },
  productsSold: {
    gap: 5,
    paddingVertical: 2,
  },
  productSoldRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  productSoldName: { flex: 1 },
  quantityPill: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  saleBottomRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 9,
  },
  saleTags: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 5 },
  categoryTag: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  saleAmounts: { alignItems: "flex-end", gap: 3 },
  saleTotal: {
    fontSize: 18,
    fontVariant: ["tabular-nums"],
  },
  pagination: { alignItems: "center", gap: 10, paddingVertical: 4 },
  pageButtons: { flexDirection: "row", gap: 8 },
});
