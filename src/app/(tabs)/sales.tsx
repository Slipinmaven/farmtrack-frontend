import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TextField } from "@/components/ui/text-field";
import type { SaleCategory, SaleStatus } from "@/features/sales/api";
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
  const [showFilters, setShowFilters] = useState(false);
  const [showMonthly, setShowMonthly] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const isDateRangeValid = !fromDate || !toDate || fromDate <= toDate;
  const report = useSalesReport(
    user?.id,
    farm.selectedFarm?.id,
    {
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
      category: category || undefined,
      status,
      search: debouncedSearch || undefined,
      offset,
      limit: pageSize,
    },
    isDateRangeValid,
  );
  const data = isDateRangeValid ? report.data : undefined;
  const currency = farm.selectedFarm?.settings?.currency ?? "KES";
  const residual = Number(data?.summary.unallocated_amount ?? 0);
  const hasCustomerCredit = residual < 0;
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
  const activeFilterCount =
    Number(Boolean(fromDate)) +
    Number(Boolean(toDate)) +
    Number(Boolean(category)) +
    Number(status !== "completed");

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
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl
            refreshing={report.isRefetching}
            onRefresh={() => {
              if (isDateRangeValid) void report.refetch();
            }}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <FarmPageHeader
          title="Sales"
          rightAction={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh sales"
              disabled={!isDateRangeValid}
              onPress={() => void report.refetch()}
              style={[
                styles.refreshButton,
                {
                  borderColor: theme.border,
                  opacity: isDateRangeValid ? 1 : 0.5,
                },
              ]}
            >
              <Ionicons
                name="refresh-outline"
                size={19}
                color={theme.primary}
              />
            </Pressable>
          }
        />

        {data ? (
          <Animated.View
            entering={FadeIn.duration(180)}
            layout={LinearTransition.duration(160)}
          >
            <Card style={styles.salesOverview}>
              <View
                style={[
                  styles.overviewMain,
                  {
                    backgroundColor: theme.backgroundSelected,
                    borderColor: `${numberColors.sales}35`,
                  },
                ]}
              >
                <View style={styles.overviewTopLine}>
                  <View style={styles.overviewTitle}>
                    <View
                      style={[
                        styles.periodBadge,
                        {
                          backgroundColor: `${numberColors.sales}20`,
                          borderColor: `${numberColors.sales}35`,
                        },
                      ]}
                    >
                      <AppText
                        size="small"
                        weight="semibold"
                        style={{ color: numberColors.sales }}
                      >
                        THIS PERIOD
                      </AppText>
                    </View>
                    <AppText size="small" tone="secondary">
                      {fromDate && toDate
                        ? `${formatDate(fromDate)} – ${formatDate(toDate)}`
                        : fromDate
                          ? `From ${formatDate(fromDate)}`
                          : toDate
                            ? `Through ${formatDate(toDate)}`
                            : "All dates"}
                    </AppText>
                  </View>
                  <View
                    style={[
                      styles.heroIcon,
                      { backgroundColor: theme.backgroundElement },
                    ]}
                  >
                    <Ionicons
                      name="trending-up-outline"
                      size={21}
                      color={numberColors.sales}
                    />
                  </View>
                </View>
                <AppText
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[styles.heroValue, { color: numberColors.sales }]}
                >
                  {formatMoney(data.summary.sales_total, currency)}
                </AppText>
                <View style={styles.heroMeta}>
                  <View
                    style={[
                      styles.salesCountPill,
                      { backgroundColor: theme.backgroundElement },
                    ]}
                  >
                    <Ionicons
                      name="receipt-outline"
                      size={14}
                      color={numberColors.count}
                    />
                    <AppText size="small" weight="semibold">
                      {data.summary.transaction_count.toLocaleString()}{" "}
                      {data.summary.transaction_count === 1 ? "sale" : "sales"}
                    </AppText>
                  </View>
                  <AppText size="small" tone="secondary">
                    Recorded transactions
                  </AppText>
                </View>
              </View>

              <View style={styles.metrics}>
                <Metric
                  title="Net received"
                  value={formatMoney(data.summary.amount_received, currency)}
                  icon="cash-outline"
                  accent={numberColors.received}
                  description="After refunds"
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
                  description={
                    Number(data.summary.balance_due) > 0
                      ? "Outstanding"
                      : "Nothing outstanding"
                  }
                  theme={theme}
                />
                <Metric
                  title={
                    hasCustomerCredit
                      ? "Customer credit"
                      : "Credits & adjustments"
                  }
                  value={formatMoney(Math.abs(residual), currency)}
                  icon={
                    hasCustomerCredit
                      ? "wallet-outline"
                      : "swap-horizontal-outline"
                  }
                  accent={numberColors.credit}
                  description={
                    hasCustomerCredit
                      ? "Credit held"
                      : residual > 0
                        ? "Returns / adjustments"
                        : "None recorded"
                  }
                  theme={theme}
                  wide
                />
              </View>
              <AppText
                size="small"
                tone="secondary"
                style={styles.summaryScope}
              >
                Totals are for recorded sales matching your dates, search and
                category. Record status only filters the list below.
              </AppText>
            </Card>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeIn.duration(180)}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Record a sale"
            onPress={() => router.push("/sales/new")}
            style={({ pressed }) => [
              styles.recordSaleAction,
              {
                backgroundColor: theme.primary,
                borderColor: theme.primary,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.985 : 1 }],
              },
            ]}
          >
            <View
              style={[
                styles.recordSaleIcon,
                { backgroundColor: `${theme.onPrimary}20` },
              ]}
            >
              <Ionicons
                name="add-circle-outline"
                size={25}
                color={theme.onPrimary}
              />
            </View>
            <View style={styles.recordSaleCopy}>
              <AppText weight="semibold" style={{ color: theme.onPrimary }}>
                Record a sale
              </AppText>
              <AppText size="small" style={{ color: `${theme.onPrimary}D9` }}>
                Sell eggs or chickens
              </AppText>
            </View>
            <Ionicons name="arrow-forward" size={20} color={theme.onPrimary} />
          </Pressable>
        </Animated.View>

        <Animated.View
          entering={FadeIn.duration(180)}
          layout={LinearTransition.duration(160)}
        >
          <Card style={styles.filters}>
            <View style={styles.sectionHeading}>
              <AppText weight="semibold">Find sales</AppText>
              <Pressable accessibilityRole="button" onPress={clearFilters}>
                <AppText
                  size="small"
                  weight="semibold"
                  style={{ color: theme.primary }}
                >
                  Clear
                </AppText>
              </Pressable>
            </View>
            <TextField
              label="Search sales"
              value={search}
              onChangeText={(value) => {
                setOffset(0);
                setSearch(value);
              }}
              placeholder="Reference, customer or product"
              autoCapitalize="none"
              returnKeyType="search"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showFilters }}
              onPress={() => setShowFilters((visible) => !visible)}
              style={[styles.filterToggle, { borderTopColor: theme.border }]}
            >
              <View style={styles.filterToggleCopy}>
                <Ionicons
                  name="options-outline"
                  size={17}
                  color={theme.primary}
                />
                <AppText
                  size="small"
                  weight="semibold"
                  style={{ color: theme.primary }}
                >
                  Filters
                  {activeFilterCount ? ` · ${activeFilterCount} active` : ""}
                </AppText>
              </View>
              <Ionicons
                name={showFilters ? "chevron-up" : "chevron-down"}
                size={17}
                color={theme.primary}
              />
            </Pressable>
            {showFilters ? (
              <Animated.View
                entering={FadeIn.duration(160)}
                exiting={FadeOut.duration(120)}
                style={styles.filterOptions}
              >
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
                              borderColor: selected
                                ? theme.primary
                                : theme.border,
                              backgroundColor: selected
                                ? theme.backgroundSelected
                                : theme.backgroundElement,
                            },
                          ]}
                        >
                          <AppText
                            size="small"
                            weight={selected ? "semibold" : "regular"}
                            style={
                              selected ? { color: theme.primary } : undefined
                            }
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
                  Record status
                </AppText>
                <View style={styles.chips}>
                  {(
                    [
                      ["completed", "Recorded"],
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
                            borderColor: selected
                              ? theme.primary
                              : theme.border,
                            backgroundColor: selected
                              ? theme.backgroundSelected
                              : theme.backgroundElement,
                          },
                        ]}
                      >
                        <AppText
                          size="small"
                          weight={selected ? "semibold" : "regular"}
                          style={
                            selected ? { color: theme.primary } : undefined
                          }
                        >
                          {label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </Animated.View>
            ) : !isDateRangeValid ? (
              <AppText size="small" style={{ color: theme.danger }}>
                Start date must be on or before end date.
              </AppText>
            ) : null}
          </Card>
        </Animated.View>

        {!isDateRangeValid ? (
          <Card style={styles.stateCard}>
            <Ionicons name="calendar-outline" size={25} color={theme.danger} />
            <AppText weight="semibold">Update your date range</AppText>
            <AppText size="small" tone="secondary">
              The start date must be on or before the end date. Adjust the dates
              in filters to see matching sales.
            </AppText>
            <Button
              label="Adjust dates"
              variant="secondary"
              onPress={() => setShowFilters(true)}
            />
          </Card>
        ) : null}

        <View style={styles.listHeading}>
          <View style={styles.headingCopy}>
            <AppText size="body" weight="semibold">
              Recent sales
            </AppText>
            {data ? (
              <AppText size="small" tone="secondary">
                {data.total_count.toLocaleString()}{" "}
                {data.total_count === 1 ? "sale" : "sales"} found
              </AppText>
            ) : null}
          </View>
          {report.isFetching ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : null}
        </View>

        {isDateRangeValid && report.isError ? (
          <Card style={styles.stateCard}>
            <Ionicons
              name="cloud-offline-outline"
              size={25}
              color={theme.danger}
            />
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
            <Ionicons
              name="receipt-outline"
              size={26}
              color={theme.textSecondary}
            />
            <AppText weight="semibold">No sales found</AppText>
            <AppText size="small" tone="secondary">
              Try changing the dates or filters to find a sale.
            </AppText>
          </Card>
        ) : null}

        {data?.items.map((sale) => {
          const isCancelled = sale.status === "cancelled";
          const balanceDue = Number(sale.balance_due);
          const creditBalance = Number(sale.credit_balance);
          const settlementLabel = isCancelled
            ? null
            : balanceDue > 0
              ? `Still owed · ${formatMoney(sale.balance_due, currency)}`
              : creditBalance > 0
                ? `Customer credit · ${formatMoney(sale.credit_balance, currency)}`
                : "Paid in full";
          return (
            <Animated.View
              key={sale.id}
              entering={FadeIn.duration(160)}
              layout={LinearTransition.duration(140)}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${isCancelled ? "cancelled" : "recorded"} sale ${sale.reference_number ?? ""}, ${sale.customer_name ?? "walk-in customer"}${settlementLabel ? `, ${settlementLabel}` : ""}`}
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
                    backgroundColor: pressed
                      ? theme.backgroundSelected
                      : theme.backgroundElement,
                    transform: [{ scale: pressed ? 0.992 : 1 }],
                  },
                ]}
              >
                <View style={styles.saleTopRow}>
                  <View style={styles.saleTitle}>
                    <AppText
                      weight="semibold"
                      numberOfLines={1}
                      ellipsizeMode="middle"
                    >
                      {sale.reference_number
                        ? `Sale ${sale.reference_number}`
                        : "Sale"}
                    </AppText>
                    <AppText size="small" tone="secondary">
                      {formatDate(sale.transaction_date)}
                    </AppText>
                  </View>
                  <View
                    style={[
                      styles.saleStatus,
                      {
                        backgroundColor: isCancelled
                          ? `${numberColors.owed}16`
                          : `${numberColors.received}16`,
                      },
                    ]}
                  >
                    <Ionicons
                      name={isCancelled ? "close-circle" : "checkmark-circle"}
                      size={14}
                      color={
                        isCancelled ? numberColors.owed : numberColors.received
                      }
                    />
                    <AppText
                      size="small"
                      weight="semibold"
                      style={{
                        color: isCancelled
                          ? numberColors.owed
                          : numberColors.received,
                      }}
                    >
                      {isCancelled ? "Cancelled" : "Recorded"}
                    </AppText>
                  </View>
                </View>
                <View style={styles.customerLine}>
                  <Ionicons
                    name="person-circle-outline"
                    size={19}
                    color={theme.textSecondary}
                  />
                  <AppText
                    size="small"
                    weight="semibold"
                    numberOfLines={1}
                    style={styles.customerName}
                  >
                    {sale.customer_name ?? "Walk-in customer"}
                  </AppText>
                </View>
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
                    {settlementLabel ? (
                      <AppText
                        size="small"
                        weight="semibold"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        style={{
                          color:
                            balanceDue > 0
                              ? numberColors.owed
                              : creditBalance > 0
                                ? numberColors.credit
                                : numberColors.received,
                        }}
                      >
                        {settlementLabel}
                      </AppText>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            </Animated.View>
          );
        })}

        {data && data.total_count > 0 ? (
          <Animated.View
            entering={FadeIn.duration(160)}
            layout={LinearTransition.duration(140)}
            style={[
              styles.pagination,
              {
                borderColor: theme.border,
                backgroundColor: theme.backgroundElement,
              },
            ]}
          >
            <View style={styles.paginationCopy}>
              <AppText size="small" weight="semibold">
                {pageStart}–{pageEnd}{" "}
                <AppText size="small" tone="secondary">
                  of {data.total_count.toLocaleString()} sales
                </AppText>
              </AppText>
              <AppText size="small" tone="secondary">
                Page {Math.floor(offset / pageSize) + 1} of{" "}
                {Math.ceil(data.total_count / pageSize)}
              </AppText>
            </View>
            <View style={styles.pageButtons}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous sales page"
                accessibilityState={{
                  disabled: offset === 0 || report.isFetching,
                }}
                disabled={offset === 0 || report.isFetching}
                onPress={() => setOffset(Math.max(0, offset - pageSize))}
                style={({ pressed }) => [
                  styles.pageButton,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                    opacity:
                      offset === 0 || report.isFetching
                        ? 0.4
                        : pressed
                          ? 0.68
                          : 1,
                  },
                ]}
              >
                <Ionicons name="chevron-back" size={18} color={theme.text} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next sales page"
                accessibilityState={{
                  disabled:
                    offset + pageSize >= data.total_count || report.isFetching,
                }}
                disabled={
                  offset + pageSize >= data.total_count || report.isFetching
                }
                onPress={() => setOffset(offset + pageSize)}
                style={({ pressed }) => [
                  styles.pageButton,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                    opacity:
                      offset + pageSize >= data.total_count || report.isFetching
                        ? 0.4
                        : pressed
                          ? 0.68
                          : 1,
                  },
                ]}
              >
                <Ionicons name="chevron-forward" size={18} color={theme.text} />
              </Pressable>
            </View>
          </Animated.View>
        ) : null}

        {data ? (
          <Animated.View
            entering={FadeIn.duration(180)}
            layout={LinearTransition.duration(160)}
          >
            <Card style={styles.monthlyCard}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showMonthly }}
                onPress={() => setShowMonthly((visible) => !visible)}
                style={styles.monthlyToggle}
              >
                <View style={styles.monthlyHeading}>
                  <View
                    style={[
                      styles.monthlyIcon,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      color={theme.primary}
                    />
                  </View>
                  <View style={styles.monthlyCopy}>
                    <AppText weight="semibold">Monthly reconciliation</AppText>
                    <AppText size="small" tone="secondary">
                      Latest 6 sale months · same filters as the totals above
                    </AppText>
                  </View>
                </View>
                <Ionicons
                  name={showMonthly ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={theme.primary}
                />
              </Pressable>
              {showMonthly ? (
                <Animated.View
                  entering={FadeIn.duration(160)}
                  exiting={FadeOut.duration(120)}
                  style={styles.monthlyRows}
                >
                  {monthly.length ? (
                    monthly.map((month) => {
                      const monthCredit = Number(month.unallocated_amount);
                      return (
                        <View
                          key={month.month}
                          style={[
                            styles.monthRow,
                            { borderTopColor: theme.border },
                          ]}
                        >
                          <View style={styles.monthTopLine}>
                            <View style={styles.monthName}>
                              <AppText weight="semibold">
                                {formatMonth(month.month)}
                              </AppText>
                              <AppText size="small" tone="secondary">
                                {month.transaction_count.toLocaleString()}{" "}
                                {month.transaction_count === 1
                                  ? "sale"
                                  : "sales"}
                              </AppText>
                            </View>
                            <View style={styles.monthSales}>
                              <AppText size="small" tone="secondary">
                                Sales
                              </AppText>
                              <AppText
                                size="small"
                                weight="semibold"
                                style={{ color: numberColors.sales }}
                              >
                                {formatMoney(month.sales_total, currency)}
                              </AppText>
                            </View>
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
                                    0,
                                    Math.min(
                                      100,
                                      (Number(month.sales_total) /
                                        maxMonthlySales) *
                                        100,
                                    ),
                                  )}%`,
                                },
                              ]}
                            />
                          </View>
                          <View style={styles.monthBreakdown}>
                            <MonthAmount
                              label="Net received"
                              value={month.amount_received}
                              color={numberColors.received}
                              currency={currency}
                            />
                            <MonthAmount
                              label="Still owed"
                              value={month.balance_due}
                              color={numberColors.owed}
                              currency={currency}
                            />
                            <MonthAmount
                              label={
                                monthCredit < 0
                                  ? "Customer credit"
                                  : "Credits / adj."
                              }
                              value={Math.abs(monthCredit)}
                              color={numberColors.credit}
                              currency={currency}
                            />
                          </View>
                        </View>
                      );
                    })
                  ) : (
                    <AppText size="small" tone="secondary">
                      No completed sales in this date range.
                    </AppText>
                  )}
                  <AppText size="small" tone="secondary">
                    Monthly figures are grouped by sale date, not payment date.
                    Net received includes payments and cash settlements, less
                    refunds. Only the latest 6 months are shown.
                  </AppText>
                </Animated.View>
              ) : null}
            </Card>
          </Animated.View>
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
  wide = false,
}: {
  title: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  description: string;
  theme: ReturnType<typeof useTheme>["theme"];
  wide?: boolean;
}) {
  return (
    <View
      style={[
        styles.metric,
        wide && styles.metricWide,
        {
          borderColor: theme.border,
          backgroundColor: theme.backgroundElement,
        },
      ]}
    >
      <View style={styles.metricHeading}>
        <View style={[styles.metricIcon, { backgroundColor: `${accent}18` }]}>
          <Ionicons name={icon} size={16} color={accent} />
        </View>
        <AppText
          size="small"
          weight="semibold"
          numberOfLines={1}
          style={styles.metricTitle}
        >
          {title}
        </AppText>
      </View>
      <AppText
        size="body"
        weight="semibold"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[styles.metricValue, { color: theme.text }]}
      >
        {value}
      </AppText>
      <AppText size="small" tone="secondary" numberOfLines={1}>
        {description}
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

function MonthAmount({
  label,
  value,
  color,
  currency,
}: {
  label: string;
  value: number | string;
  color: string;
  currency: string;
}) {
  return (
    <View style={styles.monthAmount}>
      <AppText size="small" tone="secondary" numberOfLines={1}>
        {label}
      </AppText>
      <AppText
        size="small"
        weight="semibold"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ color }}
      >
        {formatMoney(value, currency)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 920,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 118,
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
  recordSaleAction: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  recordSaleIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  recordSaleCopy: { flex: 1, gap: 3 },
  salesOverview: {
    gap: 14,
    padding: 14,
    borderRadius: 18,
  },
  overviewMain: {
    gap: 10,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingVertical: 15,
  },
  overviewTopLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  overviewTitle: { flex: 1, gap: 6 },
  periodBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  heroValue: {
    fontSize: 34,
    lineHeight: 42,
    fontWeight: "700",
    letterSpacing: -0.9,
    fontVariant: ["tabular-nums"],
  },
  heroMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  salesCountPill: {
    minHeight: 29,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 15,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  summaryScope: { lineHeight: 19, paddingHorizontal: 2 },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  metric: {
    flexGrow: 1,
    flexBasis: "44%",
    minWidth: 135,
    minHeight: 112,
    justifyContent: "space-between",
    gap: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
    padding: 11,
  },
  metricWide: { flexBasis: "100%" },
  metricHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  metricTitle: { flex: 1 },
  metricIcon: {
    width: 29,
    height: 29,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: {
    fontSize: 17,
    fontVariant: ["tabular-nums"],
  },
  monthlyCard: { gap: 12, borderRadius: 15 },
  monthlyToggle: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  monthlyHeading: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  monthlyIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  monthlyCopy: { flex: 1, gap: 3 },
  monthlyRows: { gap: 12 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  monthRow: {
    gap: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  monthTopLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  monthName: { flex: 1, gap: 3 },
  monthSales: { alignItems: "flex-end", gap: 3 },
  monthBreakdown: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  monthAmount: { flexGrow: 1, flexBasis: "45%", gap: 3 },
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
  filters: { gap: 11, borderRadius: 15 },
  filterToggle: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  filterToggleCopy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  filterOptions: { gap: 11, paddingTop: 2 },
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
    marginTop: 2,
  },
  stateCard: { alignItems: "center", gap: 10, paddingVertical: 22 },
  saleCard: {
    gap: 10,
    borderWidth: 1,
    borderRadius: 15,
    padding: 14,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.045,
    shadowRadius: 5,
    elevation: 1,
  },
  saleTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  saleTitle: { flex: 1, gap: 3 },
  saleStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  customerLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  customerName: { flex: 1 },
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
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 11,
  },
  saleTags: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 5 },
  categoryTag: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  saleAmounts: { alignItems: "flex-end", gap: 3 },
  saleTotal: {
    fontSize: 19,
    fontVariant: ["tabular-nums"],
  },
  pagination: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  paginationCopy: { flex: 1, gap: 3 },
  pageButtons: { flexDirection: "row", gap: 7 },
  pageButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 12,
  },
});
