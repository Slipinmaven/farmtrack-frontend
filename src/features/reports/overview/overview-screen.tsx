import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { useChickenSaleOptions } from "@/features/chickens/hooks";
import { useEggCollectionOptions } from "@/features/eggs/hooks";
import { zonedDateTimeToUtc } from "@/features/dashboard/date-range";
import {
  useExpenseSummary,
  useFarmActivities,
  useInventory,
  useProfitabilityReport,
} from "@/features/management/hooks";
import {
  categoryIcons,
  entityColors,
  getActivityLabel,
  getActivityNarrative,
} from "@/features/management/activity-presentation";
import { ReportExportActions } from "@/features/reports/report-export-actions";
import {
  buildOverviewExportData,
  resolveOverviewExportData,
} from "@/features/reports/overview/overview-export";
import {
  MetricCard,
  PeriodOption,
  ProductProfitSection,
  ShortcutChip,
  SnapshotRow,
} from "@/features/reports/overview/overview-components";
import { ProfitabilityCard } from "@/features/reports/overview/profitability-card";
import {
  daysAgo,
  formatDateLabel,
  monthStart,
  reportHref,
  today,
  type Period,
  type ReportName,
} from "@/features/reports/overview/overview-utils";
import { styles } from "@/features/reports/overview/styles";
import { useSalesReport } from "@/features/sales/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

const shortcuts: {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  report: ReportName;
}[] = [
  {
    title: "Sales",
    description: "Sales history and customer balances",
    icon: "trending-up-outline",
    report: "sales",
  },
  {
    title: "Expenses",
    description: "Costs and payment history",
    icon: "receipt-outline",
    report: "expenses",
  },
  {
    title: "Egg production",
    description: "Collections, losses and current stock",
    icon: "egg-outline",
    report: "production",
  },
  {
    title: "Flock",
    description: "Batches, housing and movements",
    icon: "leaf-outline",
    report: "flock",
  },
  {
    title: "Inventory",
    description: "Product stock and movements",
    icon: "cube-outline",
    report: "inventory",
  },
  {
    title: "Transactions",
    description: "Customer and supplier accounts",
    icon: "people-outline",
    report: "accounts",
  },
];

const periods: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Last 7 days" },
  { id: "month", label: "This month" },
  { id: "custom", label: "Custom" },
];

function dateAtFarmStart(value: string, timezone: string): string {
  return zonedDateTimeToUtc(value, "00:00:00", timezone);
}

function dateAtFarmEnd(value: string, timezone: string): string {
  return zonedDateTimeToUtc(value, "23:59:59", timezone);
}

export function ReportsOverview() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const timezone = farm.selectedFarm?.settings?.timezone ?? theme.timezone;
  const [period, setPeriod] = useState<Period>("month");
  const [fromDate, setFromDate] = useState(monthStart());
  const [toDate, setToDate] = useState(today());
  const farmId = farm.selectedFarm?.id;
  const filters = {
    from_date: fromDate,
    to_date: toDate,
  };
  const expensesQuery = useExpenseSummary(user?.id, farmId, filters);
  const profitabilityQuery = useProfitabilityReport(user?.id, farmId, filters);
  const salesQuery = useSalesReport(user?.id, farmId, {
    ...filters,
    status: "completed",
    offset: 0,
    limit: 1,
  });
  const flockQuery = useChickenSaleOptions(user?.id, farmId);
  const eggsQuery = useEggCollectionOptions(user?.id, farmId);
  const inventoryQuery = useInventory(user?.id, farmId);
  const activitiesQuery = useFarmActivities(
    user?.id,
    farmId,
    "",
    undefined,
    fromDate ? dateAtFarmStart(fromDate, timezone) : undefined,
    toDate ? dateAtFarmEnd(toDate, timezone) : undefined,
  );
  const isRefreshing =
    expensesQuery.isRefetching ||
    profitabilityQuery.isRefetching ||
    salesQuery.isRefetching ||
    flockQuery.isRefetching ||
    eggsQuery.isRefetching ||
    inventoryQuery.isRefetching ||
    activitiesQuery.isRefetching;
  const recentActivities =
    activitiesQuery.data?.pages.flatMap((page) => page.items).slice(0, 6) ?? [];
  const expenseTotal = Number(expensesQuery.data?.total_amount ?? 0);
  const salesTotal = Number(salesQuery.data?.summary.sales_total ?? 0);
  const customerBalance = Number(salesQuery.data?.summary.balance_due ?? 0);
  const expenseBalance = Number(expensesQuery.data?.balance_due ?? 0);
  const currency = farm.selectedFarm?.settings?.currency ?? "KES";
  const flockCount = useMemo(
    () =>
      (flockQuery.data?.batches ?? []).reduce(
        (total, batch) =>
          total +
          batch.stocks.reduce((batchTotal, stock) => batchTotal + stock.quantity, 0),
        0,
      ),
    [flockQuery.data?.batches],
  );
  const blocksNearCapacity = useMemo(
    () =>
      (flockQuery.data?.blocks ?? []).filter(
        (block) =>
          block.maximum_chickens > 0 &&
          block.current_chickens / block.maximum_chickens >= 0.8,
      ),
    [flockQuery.data?.blocks],
  );
  const eggStock = useMemo(
    () =>
      (eggsQuery.data?.products ?? []).map((product) => ({
        id: product.id,
        name: product.name,
        quantity: Number(product.available_quantity_in_base_unit),
        unit:
          product.units.find((unit) => unit.is_base_unit)?.abbreviation ??
          "base units",
      })),
    [eggsQuery.data?.products],
  );
  const activeFilters = [fromDate, toDate].filter(Boolean);
  const periodLabel =
    period === "today"
      ? "Today"
      : period === "week"
        ? "Last 7 days"
        : period === "month"
          ? "This month"
          : activeFilters.length
            ? `${fromDate ? formatDateLabel(fromDate) : "Beginning"} – ${toDate ? formatDateLabel(toDate) : "Today"}`
            : "All dates";
  const isFinancialLoading = expensesQuery.isLoading || salesQuery.isLoading;
  const financialError = expensesQuery.isError || salesQuery.isError;
  const snapshotError =
    flockQuery.isError || eggsQuery.isError || inventoryQuery.isError;
  const overviewExportReady =
    !isFinancialLoading &&
    !snapshotError &&
    !profitabilityQuery.isLoading &&
    profitabilityQuery.isSuccess &&
    !flockQuery.isLoading &&
    !eggsQuery.isLoading &&
    !inventoryQuery.isLoading;
  const overviewExportData = useMemo(
    () =>
      buildOverviewExportData({
        currency,
        customerBalance,
        eggStock,
        expenseBalance,
        expenseSummary: expensesQuery.data,
        farmLogoPath: farm.selectedFarm?.settings?.logo_path,
        farmName: farm.selectedFarm?.name,
        flockCount,
        flock: flockQuery.data,
        fromDate,
        inventory: inventoryQuery.data,
        profitability: profitabilityQuery.data,
        sales: salesQuery.data,
        salesTotal,
        toDate,
      }),
    [
      currency,
      customerBalance,
      eggStock,
      expenseBalance,
      expensesQuery.data,
      farm.selectedFarm,
      flockCount,
      flockQuery.data,
      fromDate,
      inventoryQuery.data,
      profitabilityQuery.data,
      salesQuery.data,
      salesTotal,
      toDate,
    ],
  );

  function choosePeriod(nextPeriod: Period) {
    setPeriod(nextPeriod);
    if (nextPeriod === "today") {
      setFromDate(today());
      setToDate(today());
    } else if (nextPeriod === "week") {
      setFromDate(daysAgo(6));
      setToDate(today());
    } else if (nextPeriod === "month") {
      setFromDate(monthStart());
      setToDate(today());
    }
  }

  async function refreshReports() {
    await Promise.all([
      expensesQuery.refetch(),
      profitabilityQuery.refetch(),
      salesQuery.refetch(),
      flockQuery.refetch(),
      eggsQuery.refetch(),
      inventoryQuery.refetch(),
      activitiesQuery.refetch(),
    ]);
  }

  if (!farm.selectedFarm) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: theme.background }]}
        edges={["top", "bottom"]}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <FarmPageHeader
            title="Farm reports"
            showBack
            rightAction={
              overviewExportReady && !financialError ? (
                <ReportExportActions
                  data={overviewExportData}
                  resolveData={() =>
                    resolveOverviewExportData({
                      farmId: farm.selectedFarm?.id,
                      fromDate,
                      toDate,
                      currency,
                      overviewExportData,
                    })
                  }
                  label="Export"
                  compact
                />
              ) : undefined
            }
          />
          <Card style={styles.card}>
            <AppText weight="semibold">Choose a farm</AppText>
            <AppText size="small" tone="secondary">
              Select a farm to see its performance and operational reports.
            </AppText>
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
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
            refreshing={isRefreshing}
            onRefresh={() => void refreshReports()}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <FarmPageHeader title="Farm reports" showBack />

        {isRefreshing ? (
          <View style={styles.refreshStatus}>
            <ActivityIndicator size="small" color={theme.primary} />
            <AppText size="small" tone="secondary">
              Updating report data…
            </AppText>
          </View>
        ) : null}

        <Card style={styles.card}>
          <View style={styles.periodHeading}>
            <View style={styles.grow}>
              <AppText size="small" weight="semibold">
                REPORT PERIOD
              </AppText>
              <AppText size="small" tone="secondary">
                {periodLabel}
              </AppText>
            </View>
            {period === "custom" && (fromDate || toDate) ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setFromDate("");
                  setToDate("");
                }}
              >
                <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                  Clear
                </AppText>
              </Pressable>
            ) : null}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.periodOptions}
          >
            {periods.map((item) => (
              <PeriodOption
                key={item.id}
                label={item.label}
                selected={period === item.id}
                onPress={() => choosePeriod(item.id)}
              />
            ))}
          </ScrollView>
          {period === "custom" ? (
            <View style={styles.dateFilters}>
              <DatePickerField
                label="From"
                value={fromDate}
                maximumDate={toDate ? new Date(`${toDate}T12:00:00`) : new Date()}
                onChange={setFromDate}
                style={styles.dateField}
              />
              <DatePickerField
                label="To"
                value={toDate}
                minimumDate={fromDate ? new Date(`${fromDate}T12:00:00`) : undefined}
                maximumDate={new Date()}
                onChange={setToDate}
                style={styles.dateField}
              />
            </View>
          ) : null}
        </Card>

        <ProfitabilityCard
          report={profitabilityQuery.data}
          loading={profitabilityQuery.isLoading}
          error={profitabilityQuery.error}
          currency={currency}
          transactionSalesTotal={salesTotal}
          userId={user?.id ?? ""}
          farmId={farmId ?? ""}
          onRetry={() => void profitabilityQuery.refetch()}
        />

        {isFinancialLoading ? (
          <LoadingState label="Loading farm performance" />
        ) : financialError ? (
          <Card style={styles.card}>
            <View style={styles.errorHeading}>
              <Ionicons name="alert-circle-outline" size={20} color={theme.danger} />
              <AppText weight="semibold">Couldn’t load financial totals</AppText>
            </View>
            {salesQuery.isError ? (
              <AppText size="small" tone="secondary">
                Sales: {normalizeApiError(salesQuery.error).message}
              </AppText>
            ) : null}
            {expensesQuery.isError ? (
              <AppText size="small" tone="secondary">
                Expenses: {normalizeApiError(expensesQuery.error).message}
              </AppText>
            ) : null}
            <Button
              label="Retry"
              variant="secondary"
              onPress={() => {
                void salesQuery.refetch();
                void expensesQuery.refetch();
              }}
            />
          </Card>
        ) : (
          <>
            <View style={styles.metricGrid}>
              <MetricCard
                icon="trending-up-outline"
                label="Completed sales total"
                value={salesTotal}
                currency={currency}
                detail={`${salesQuery.data?.summary.transaction_count ?? 0} transactions`}
                accent={theme.primary}
                valueColor={theme.primary}
                onPress={() => router.push(reportHref("sales", fromDate, toDate))}
              />
              <MetricCard
                icon="receipt-outline"
                label="Recorded expenses"
                value={expenseTotal}
                currency={currency}
                detail={`${expensesQuery.data?.expense_count ?? 0} records`}
                accent={theme.secondary}
                valueColor={theme.text}
                onPress={() => router.push(reportHref("expenses", fromDate, toDate))}
              />
              <MetricCard
                icon="arrow-down-circle-outline"
                label="Customer balance"
                value={customerBalance}
                currency={currency}
                detail="Outstanding"
                accent={customerBalance > 0 ? theme.secondary : theme.success}
                valueColor={customerBalance > 0 ? theme.secondary : theme.success}
                statusLabel={customerBalance > 0 ? "To collect" : "Settled"}
                statusColor={customerBalance > 0 ? theme.secondary : theme.success}
                statusIcon={customerBalance > 0 ? "alert-circle-outline" : "checkmark-circle-outline"}
                onPress={() => router.push(reportHref("accounts", fromDate, toDate))}
              />
              <MetricCard
                icon="time-outline"
                label="Unpaid expenses"
                value={expenseBalance}
                currency={currency}
                detail="Still to pay"
                accent={expenseBalance > 0 ? theme.danger : theme.success}
                valueColor={expenseBalance > 0 ? theme.danger : theme.success}
                statusLabel={expenseBalance > 0 ? "Payment due" : "Clear"}
                statusColor={expenseBalance > 0 ? theme.danger : theme.success}
                statusIcon={expenseBalance > 0 ? "warning-outline" : "checkmark-circle-outline"}
                onPress={() => router.push(reportHref("expenses", fromDate, toDate))}
              />
            </View>

          </>
        )}

        <View style={styles.reportLinksHeader}>
          <AppText size="small" weight="semibold">
            EXPLORE REPORTS
          </AppText>
          <AppText size="small" tone="secondary">
            More detail
          </AppText>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.shortcutRow}
        >
          {shortcuts.map((item) => (
            <ShortcutChip
              key={item.title}
              title={item.title}
              icon={item.icon}
              onPress={() =>
                router.push(reportHref(item.report, fromDate, toDate))
              }
            />
          ))}
        </ScrollView>

        {profitabilityQuery.data ? (
          <ProductProfitSection
            products={profitabilityQuery.data.product_performance.filter(
              (item) => Number(item.quantity_sold) > 0,
            )}
            currency={currency}
          />
        ) : null}

        <View style={styles.sectionHeading}>
          <View style={styles.grow}>
            <AppText size="heading" weight="semibold">
              Current farm position
            </AppText>
            <AppText size="small" tone="secondary">
              Live stock snapshots, not limited to the selected report period.
            </AppText>
          </View>
          <View style={[styles.liveBadge, { backgroundColor: `${theme.success}18` }]}>
            <AppText size="small" weight="semibold" style={{ color: theme.success }}>
              LIVE
            </AppText>
          </View>
        </View>
        {snapshotError ? (
          <Card style={styles.errorCard}>
            <View style={styles.errorHeading}>
              <Ionicons name="alert-circle-outline" size={19} color={theme.danger} />
              <AppText size="small" weight="semibold">
                Some current stock data couldn’t be loaded.
              </AppText>
            </View>
            {flockQuery.isError ? (
              <AppText size="small" tone="secondary">
                Flock: {normalizeApiError(flockQuery.error).message}
              </AppText>
            ) : null}
            {eggsQuery.isError ? (
              <AppText size="small" tone="secondary">
                Egg stock: {normalizeApiError(eggsQuery.error).message}
              </AppText>
            ) : null}
            {inventoryQuery.isError ? (
              <AppText size="small" tone="secondary">
                Inventory: {normalizeApiError(inventoryQuery.error).message}
              </AppText>
            ) : null}
            <Button
              label="Retry stock data"
              variant="secondary"
              onPress={() => {
                void flockQuery.refetch();
                void eggsQuery.refetch();
                void inventoryQuery.refetch();
              }}
            />
          </Card>
        ) : null}
        <Card style={styles.card}>
          {flockQuery.isLoading ? (
            <LoadingState label="Loading flock totals" />
          ) : (
            <SnapshotRow
              icon="leaf-outline"
              title="Active flock"
              value={`${new Intl.NumberFormat().format(flockCount)} birds`}
              detail={`${flockQuery.data?.batches.length ?? 0} active batches`}
              href={reportHref("flock", fromDate, toDate)}
            />
          )}
          {blocksNearCapacity.length ? (
            <View style={[styles.attention, { borderColor: `${theme.secondary}55` }]}>
              <Ionicons name="warning-outline" size={17} color={theme.secondary} />
              <View style={styles.grow}>
                <AppText size="small" weight="semibold">
                  {blocksNearCapacity.length} {blocksNearCapacity.length === 1 ? "block is" : "blocks are"} near capacity
                </AppText>
                <AppText size="small" tone="secondary">
                  {blocksNearCapacity.map((block) => block.name).join(", ")}
                </AppText>
              </View>
            </View>
          ) : null}
          {eggsQuery.isLoading ? (
            <LoadingState label="Loading egg stock" />
          ) : eggStock.length ? (
            <View style={styles.stockGroup}>
              <View style={styles.stockHeading}>
                <Ionicons name="egg-outline" size={18} color={theme.primary} />
                <AppText size="small" weight="semibold">
                  Available egg stock
                </AppText>
              </View>
              {eggStock.map((product) => (
                <View key={product.id} style={styles.stockRow}>
                  <AppText size="small" style={styles.grow}>
                    {product.name}
                  </AppText>
                  <AppText size="small" weight="semibold">
                    {new Intl.NumberFormat(undefined, {
                      maximumFractionDigits: 2,
                    }).format(product.quantity)}{" "}
                    {product.unit}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(reportHref("inventory", fromDate, toDate))}
            style={[styles.snapshotLink, { borderTopColor: theme.border }]}
          >
            <Ionicons name="cube-outline" size={18} color={theme.primary} />
            <AppText size="small" weight="semibold" style={styles.grow}>
              View tracked product inventory
            </AppText>
            <Ionicons name="chevron-forward" size={17} color={theme.textSecondary} />
          </Pressable>
        </Card>

        <Card style={styles.activityCard}>
          <View style={styles.activityHeader}>
            <View style={styles.grow}>
              <AppText size="heading" weight="semibold">
                Farm activity
              </AppText>
              <AppText size="small" tone="secondary">
                Recorded activity for {periodLabel.toLocaleLowerCase()}.
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/activities")}
            >
              <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                View all
              </AppText>
            </Pressable>
          </View>
          {activitiesQuery.data?.pages[0]?.total_count !== null &&
          activitiesQuery.data?.pages[0]?.total_count !== undefined ? (
            <AppText size="small" weight="semibold">
              {activitiesQuery.data.pages[0].total_count}{" "}
              {activitiesQuery.data.pages[0].total_count === 1 ? "event" : "events"}
            </AppText>
          ) : null}
          {activitiesQuery.isLoading ? (
            <LoadingState label="Loading recent activity" />
          ) : activitiesQuery.isError ? (
            <View style={styles.activityError}>
              <AppText size="small" style={{ color: theme.danger }}>
                {normalizeApiError(activitiesQuery.error).message}
              </AppText>
              <Button
                label="Retry"
                variant="secondary"
                onPress={() => void activitiesQuery.refetch()}
              />
            </View>
          ) : recentActivities.length ? (
            <View style={styles.activityList}>
              {recentActivities.map((activity) => {
                const color = entityColors[activity.entity_type] ?? theme.primary;
                const timestamp = new Date(activity.created_at);
                const dateLabel = Number.isNaN(timestamp.getTime())
                  ? "Date unavailable"
                  : new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: timezone,
                    }).format(timestamp);
                return (
                  <Pressable
                    key={activity.id}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: "/activities/[activityId]",
                        params: { activityId: activity.id },
                      })
                    }
                    style={[styles.activityItem, { borderTopColor: theme.border }]}
                  >
                    <View style={[styles.activityIcon, { backgroundColor: `${color}20` }]}>
                      <Ionicons
                        name={categoryIcons[activity.entity_type] ?? "time-outline"}
                        size={17}
                        color={color}
                      />
                    </View>
                    <View style={styles.activityCopy}>
                      <AppText size="small" weight="semibold">
                        {getActivityLabel(activity.type)}
                      </AppText>
                      <AppText size="small" tone="secondary">
                        {getActivityNarrative(activity)}
                      </AppText>
                      <AppText size="small" tone="secondary">
                        {dateLabel}
                      </AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <AppText size="small" tone="secondary">
              No activity has been recorded yet.
            </AppText>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
