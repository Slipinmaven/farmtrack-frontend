import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { useChickenSaleOptions } from "@/features/chickens/hooks";
import { useEggCollectionOptions } from "@/features/eggs/hooks";
import { getFarmLogoUri } from "@/features/farms/logo";
import type { ProfitabilityReport } from "@/features/management/api";
import type { ReportExportData } from "@/features/reports/export";
import { ReportExportActions } from "@/features/reports/report-export-actions";
import {
  useExpenseSummary,
  useFarmActivities,
  useFarmActivitySummary,
  useInventory,
  useProfitabilityReport,
} from "@/features/management/hooks";
import {
  categoryIcons,
  entityColors,
  getActivityDetail,
  getActivityLabel,
  getEntityLabel,
} from "@/features/management/activity-presentation";
import { useSalesReport } from "@/features/sales/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type Period = "today" | "week" | "month" | "custom";
type ReportName = "sales" | "expenses" | "production" | "flock" | "inventory" | "accounts";

const periods: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Last 7 days" },
  { id: "month", label: "This month" },
  { id: "custom", label: "Custom" },
];

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

export default function ReportsRoute() {
  return (
    <SessionGate>
      <ReportsContent />
    </SessionGate>
  );
}

function ReportsContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const [period, setPeriod] = useState<Period>("month");
  const [fromDate, setFromDate] = useState(monthStart());
  const [toDate, setToDate] = useState(today());
  const [showOverview, setShowOverview] = useState(false);
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
    undefined,
    undefined,
  );
  const activitySummaryQuery = useFarmActivitySummary(user?.id, farmId);
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
            ? `${fromDate || "Beginning"} – ${toDate || "Today"}`
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
  const overviewExportData = useMemo<ReportExportData>(() => {
    const inventory = inventoryQuery.data;
    const batches = flockQuery.data?.batches ?? [];
    const blocks = flockQuery.data?.blocks ?? [];
    return {
      title: "Farm overview report",
      farmName: farm.selectedFarm?.name ?? "FarmTrack",
      currencyCode: currency,
      farmLogoUri: getFarmLogoUri(farm.selectedFarm?.settings?.logo_path),
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      summary: [
        { label: "Completed sales", value: salesTotal, kind: "currency" },
        {
          label: "Operating expenses",
          value: profitabilityQuery.data?.operating_expenses ?? null,
          kind: "currency",
        },
        {
          label: "Accrual net profit",
          value: profitabilityQuery.data?.complete
            ? Number(profitabilityQuery.data.net_profit ?? 0)
            : null,
          kind: "currency",
        },
        {
          label: "Profitability status",
          value: profitabilityQuery.data?.complete
            ? Number(profitabilityQuery.data.net_profit ?? 0) < 0
              ? "Loss"
              : Number(profitabilityQuery.data.net_profit ?? 0) > 0
                ? "Profit"
                : "Break-even"
            : "Incomplete",
        },
        { label: "Customer balances", value: customerBalance, kind: "currency" },
        { label: "Unpaid expenses", value: expenseBalance, kind: "currency" },
        { label: "Sales transactions", value: salesQuery.data?.summary.transaction_count ?? 0, kind: "number" },
        { label: "Expense records", value: expensesQuery.data?.expense_count ?? 0, kind: "number" },
        { label: "Current flock", value: flockCount, kind: "number" },
      ],
      sheets: [
        {
          name: "Overview metrics",
          columns: [
            { key: "area", label: "Area" },
            { key: "metric", label: "Metric" },
            { key: "value", label: "Value", kind: "number" },
            { key: "unit", label: "Unit" },
          ],
          rows: [
            { area: "Financial", metric: "Completed sales", value: salesTotal, unit: currency },
                {
                  area: "Financial",
                  metric: "Operating expenses",
                  value: profitabilityQuery.data?.operating_expenses ?? null,
                  unit: currency,
                },
            {
              area: "Financial",
              metric: "Accrual net profit",
              value: profitabilityQuery.data?.complete
                ? Number(profitabilityQuery.data.net_profit ?? 0)
                : null,
              unit: currency,
            },
            {
              area: "Financial",
              metric: "Profitability status",
              value: profitabilityQuery.data?.complete
                ? Number(profitabilityQuery.data.net_profit ?? 0) < 0
                  ? "Loss"
                  : Number(profitabilityQuery.data.net_profit ?? 0) > 0
                    ? "Profit"
                    : "Break-even"
                : "Incomplete",
              unit: "",
            },
            { area: "Financial", metric: "Customer balances", value: customerBalance, unit: currency },
            { area: "Financial", metric: "Unpaid expenses", value: expenseBalance, unit: currency },
            { area: "Operations", metric: "Sales transactions", value: salesQuery.data?.summary.transaction_count ?? 0, unit: "transactions" },
            { area: "Operations", metric: "Expense records", value: expensesQuery.data?.expense_count ?? 0, unit: "records" },
            { area: "Stock snapshot", metric: "Current flock", value: flockCount, unit: "birds" },
          ],
        },
        {
          name: "Expense records summary",
          columns: [
            { key: "category", label: "Category" },
            { key: "records", label: "Records", kind: "number" },
            { key: "total", label: `Total (${currency})`, kind: "currency" },
            { key: "paid", label: `Paid (${currency})`, kind: "currency" },
            { key: "balance", label: `Balance (${currency})`, kind: "currency" },
          ],
          rows: (expensesQuery.data?.categories ?? []).map((category) => ({
            category: category.name,
            records: category.expense_count,
            total: Number(category.total_amount),
            paid: Number(category.amount_paid),
            balance: Number(category.balance_due),
          })),
          totals: true,
        },
        {
          name: "Profitability bridge",
          columns: [
            { key: "line", label: "Profit and loss line" },
            { key: "amount", label: `Amount (${currency})`, kind: "currency" },
            { key: "treatment", label: "Accounting treatment" },
          ],
          rows: profitabilityQuery.data
            ? profitabilityExportRows(profitabilityQuery.data)
            : [],
        },
        {
          name: "Closing stock valuation",
          columns: [
            { key: "product", label: "Product" },
            { key: "type", label: "Product type" },
            { key: "quantity", label: "Closing quantity", kind: "number" },
            { key: "valuedQuantity", label: "Valued quantity", kind: "number" },
            { key: "valuedCost", label: `Carrying cost (${currency})`, kind: "currency" },
            { key: "unvaluedQuantity", label: "Unvalued quantity", kind: "number" },
          ],
          rows: (profitabilityQuery.data?.closing_stock ?? []).map((item) => ({
            product: item.product_name,
            type: item.product_type,
            quantity: Number(item.quantity),
            valuedQuantity: Number(item.valued_quantity),
            valuedCost: Number(item.valued_cost),
            unvaluedQuantity: Number(item.unvalued_quantity),
          })),
          totals: true,
        },
        {
          name: "Flock by batch",
          columns: [
            { key: "batch", label: "Batch" },
            { key: "type", label: "Chicken type" },
            { key: "hatchDate", label: "Hatch date", kind: "date" },
            { key: "block", label: "Block" },
            { key: "birds", label: "Birds", kind: "number" },
          ],
          rows: batches.flatMap((batch) =>
            batch.stocks.length
              ? batch.stocks.map((stock) => ({
                  batch: batch.name,
                  type: batch.chicken_type,
                  hatchDate: batch.hatch_date,
                  block: stock.block_name,
                  birds: stock.quantity,
                }))
              : [{
                  batch: batch.name,
                  type: batch.chicken_type,
                  hatchDate: batch.hatch_date,
                  block: "Unallocated",
                  birds: 0,
                }],
          ),
          totals: true,
        },
        {
          name: "Housing capacity",
          columns: [
            { key: "block", label: "Block" },
            { key: "current", label: "Current birds", kind: "number" },
            { key: "maximum", label: "Maximum capacity", kind: "number" },
            { key: "available", label: "Available capacity", kind: "number" },
          ],
          rows: blocks.map((block) => ({
            block: block.name,
            current: block.current_chickens,
            maximum: block.maximum_chickens,
            available: block.available_capacity,
          })),
          totals: true,
        },
        {
          name: "Egg stock",
          columns: [
            { key: "product", label: "Product" },
            { key: "quantity", label: "Available quantity", kind: "number" },
            { key: "unit", label: "Unit" },
          ],
          rows: eggStock.map((product) => ({
            product: product.name,
            quantity: product.quantity,
            unit: product.unit,
          })),
        },
        {
          name: "Inventory stock",
          columns: [
            { key: "product", label: "Product" },
            { key: "type", label: "Product type" },
            { key: "quantity", label: "Quantity on hand", kind: "number" },
            { key: "unit", label: "Unit" },
          ],
          rows: (inventory?.items ?? []).map((item) => ({
            product: item.product_name,
            type: item.product_type,
            quantity: Number(item.quantity),
            unit: item.unit_name,
          })),
        },
        {
          name: "Recent stock movements",
          columns: [
            { key: "date", label: "Date", kind: "date" },
            { key: "product", label: "Product" },
            { key: "type", label: "Movement type" },
            { key: "change", label: "Quantity change", kind: "number" },
            { key: "unit", label: "Unit" },
            { key: "notes", label: "Notes" },
          ],
          rows: (inventory?.movements ?? []).map((movement) => ({
            date: movement.occurred_on,
            product: movement.product_name,
            type: movement.movement_type.replaceAll("_", " "),
            change: Number(movement.quantity_delta),
            unit: movement.unit_abbreviation || movement.unit_name,
            notes: movement.notes,
          })),
        },
      ],
    };
  }, [
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
  ]);

  function formatMoney(value: number): string {
    return `${currency} ${new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)}`;
  }

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

  if (!farm.selectedFarm) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: theme.background }]}
        edges={["top", "bottom"]}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <FarmPageHeader title="Farm reports" showBack />
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
      <ScrollView contentContainerStyle={styles.content}>
        <FarmPageHeader title="Farm reports" showBack />

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

        {overviewExportReady && !financialError ? (
          <ReportExportActions data={overviewExportData} />
        ) : isFinancialLoading || profitabilityQuery.isLoading ? (
          <Card style={styles.card}>
            <AppText size="small" tone="secondary">
              Preparing your report…
            </AppText>
          </Card>
        ) : financialError || snapshotError || profitabilityQuery.isError ? (
          <Card style={styles.card}>
            <AppText size="small" weight="semibold">
              Report download unavailable
            </AppText>
            <AppText size="small" tone="secondary">
              Check your connection and try again.
            </AppText>
            <Button
              label="Retry"
              variant="secondary"
              onPress={() => {
                void salesQuery.refetch();
                void expensesQuery.refetch();
                void profitabilityQuery.refetch();
                void flockQuery.refetch();
                void eggsQuery.refetch();
                void inventoryQuery.refetch();
              }}
            />
          </Card>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showOverview }}
          onPress={() => setShowOverview((visible) => !visible)}
          style={styles.overviewToggle}
        >
          <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
            {showOverview ? "Hide farm snapshot" : "Show farm snapshot"}
          </AppText>
          <Ionicons
            name={showOverview ? "chevron-up" : "chevron-down"}
            size={18}
            color={theme.primary}
          />
        </Pressable>

        {showOverview ? (
          <>
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
                label="Completed sales"
                value={salesTotal}
                currency={currency}
                detail={`${salesQuery.data?.summary.transaction_count ?? 0} transactions`}
                accent={theme.primary}
                onPress={() => router.push(reportHref("sales", fromDate, toDate))}
              />
              <MetricCard
                icon="receipt-outline"
                label="Recorded expenses"
                value={expenseTotal}
                currency={currency}
                detail={`${expensesQuery.data?.expense_count ?? 0} records`}
                accent={theme.textSecondary}
                onPress={() => router.push(reportHref("expenses", fromDate, toDate))}
              />
              <MetricCard
                icon="arrow-down-circle-outline"
                label="Customer balances"
                value={customerBalance}
                currency={currency}
                detail="Outstanding on completed sales"
                accent={customerBalance > 0 ? theme.secondary : theme.success}
                onPress={() => router.push(reportHref("accounts", fromDate, toDate))}
              />
              <MetricCard
                icon="time-outline"
                label="Unpaid expenses"
                value={expenseBalance}
                currency={currency}
                detail="Remaining expense balances"
                accent={expenseBalance > 0 ? theme.secondary : theme.success}
                onPress={() => router.push(reportHref("expenses", fromDate, toDate))}
              />
            </View>

          </>
        )}

        <ProfitabilityCard
          report={profitabilityQuery.data}
          loading={profitabilityQuery.isLoading}
          error={profitabilityQuery.error}
          currency={currency}
          onRetry={() => void profitabilityQuery.refetch()}
        />

        <View style={styles.sectionHeading}>
          <View style={styles.grow}>
            <AppText size="heading" weight="semibold">
              Current farm position
            </AppText>
            <AppText size="small" tone="secondary">
              Live stock snapshots, not limited to the selected report period.
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
                Financial and operational changes recorded across the farm.
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
          {activitySummaryQuery.isLoading ? (
            <LoadingState label="Loading activity summary" />
          ) : activitySummaryQuery.isError ? (
            <View style={styles.activityError}>
              <AppText size="small" style={{ color: theme.danger }}>
                {normalizeApiError(activitySummaryQuery.error).message}
              </AppText>
              <Button
                label="Retry"
                variant="secondary"
                onPress={() => void activitySummaryQuery.refetch()}
              />
            </View>
          ) : activitySummaryQuery.data ? (
            <View style={styles.activityStats}>
              <View style={styles.activityStat}>
                <AppText size="heading" weight="semibold">
                  {activitySummaryQuery.data.last_7_days_count}
                </AppText>
                <AppText size="small" tone="secondary">activity events · 7 days</AppText>
              </View>
              <View style={[styles.activityStat, { borderLeftColor: theme.border }]}>
                <AppText
                  size="heading"
                  weight="semibold"
                  style={{
                    color: activitySummaryQuery.data.losses_and_returns_count
                      ? theme.danger
                      : theme.success,
                  }}
                >
                  {activitySummaryQuery.data.losses_and_returns_count}
                </AppText>
                <AppText size="small" tone="secondary">losses, returns & refunds</AppText>
              </View>
            </View>
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
                        {getActivityDetail(activity.details) ||
                          getEntityLabel(activity.entity_type)}
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

        {customerBalance > 0 || expenseBalance > 0 ? (
          <Card style={styles.attentionCard}>
            <View style={styles.sectionHeading}>
              <View
                style={[
                  styles.attentionIcon,
                  { backgroundColor: `${theme.secondary}20` },
                ]}
              >
                <Ionicons name="alert-circle-outline" size={19} color={theme.secondary} />
              </View>
              <View style={styles.grow}>
                <AppText size="heading" weight="semibold">
                  Needs attention
                </AppText>
                <AppText size="small" tone="secondary">
                  Open balances in {periodLabel.toLocaleLowerCase()}.
                </AppText>
              </View>
            </View>
            {customerBalance > 0 ? (
              <AttentionLink
                title="Customer balances"
                detail={`${formatMoney(customerBalance)} outstanding`}
                href={reportHref("accounts", fromDate, toDate)}
              />
            ) : null}
            {expenseBalance > 0 ? (
              <AttentionLink
                title="Unpaid expenses"
                detail={`${formatMoney(expenseBalance)} remaining`}
                href={reportHref("expenses", fromDate, toDate)}
              />
            ) : null}
          </Card>
        ) : null}
          </>
        ) : null}

        <View style={styles.sectionHeading}>
          <View style={styles.grow}>
            <AppText size="heading" weight="semibold">
              Explore reports
            </AppText>
            <AppText size="small" tone="secondary">
              Open the records behind each area of the farm.
            </AppText>
          </View>
        </View>
        <View style={styles.shortcutGrid}>
          {shortcuts.map((item) => (
            <ShortcutCard
              key={item.title}
              title={item.title}
              description={item.description}
              icon={item.icon}
              onPress={() =>
                router.push(reportHref(item.report, fromDate, toDate))
              }
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfitabilityCard({
  report,
  loading,
  error,
  currency,
  onRetry,
}: {
  report: ProfitabilityReport | undefined;
  loading: boolean;
  error: unknown;
  currency: string;
  onRetry: () => void;
}) {
  const { theme } = useTheme();
  const [showCalculationDetails, setShowCalculationDetails] = useState(false);
  const formatAmount = (value: string | number) =>
    `${currency} ${new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value))}`;

  if (loading) {
    return (
      <Card style={styles.profitabilityCard}>
        <AppText size="heading" weight="semibold">Net profit & loss</AppText>
        <LoadingState label="Calculating farm profitability" />
      </Card>
    );
  }
  if (error) {
    return (
      <Card style={styles.profitabilityCard}>
        <View style={styles.errorHeading}>
          <Ionicons name="alert-circle-outline" size={20} color={theme.danger} />
          <AppText size="heading" weight="semibold">
            Profitability report unavailable
          </AppText>
        </View>
        <AppText size="small" tone="secondary">
          {normalizeApiError(error).message}
        </AppText>
        <Button label="Retry profitability report" variant="secondary" onPress={onRetry} />
      </Card>
    );
  }
  if (!report) return null;

  const result = report.net_profit === null ? null : Number(report.net_profit);
  const resultColor = !report.complete
    ? theme.secondary
    : result !== null && result < 0
      ? theme.danger
      : result !== null && result > 0
        ? theme.success
        : theme.text;
  const resultLabel = !report.complete
    ? "NOT VERIFIED"
    : result !== null && result < 0
      ? "LOSS"
      : result !== null && result > 0
        ? "PROFIT"
        : "BREAK-EVEN";
  const rows = [
    { label: "Gross sales", value: report.gross_sales },
    { label: "Delivered returns & credits", value: report.sales_credits, deduct: true },
    { label: "Net revenue", value: report.net_revenue, strong: true },
    { label: "Cost of goods sold", value: report.cost_of_goods_sold, deduct: true },
    {
      label: "Unallocated feed & product consumption",
      value: report.unallocated_consumption_expense,
      deduct: true,
    },
    {
      label: "Operating expenses (excluding stock purchases)",
      value: report.operating_expenses,
      deduct: true,
    },
    { label: "Inventory losses", value: report.inventory_losses, deduct: true },
  ];
  const hasUncostedCurrentStock =
    Number(report.closing_stock_unvalued_quantity) > 0 ||
    Number(report.untracked_chicken_quantity) > 0;
  const profitabilityGaps = report.incompleteness_reasons.map((reason) => {
    const normalized = reason.toLowerCase();
    if (normalized.includes("products still on hand")) {
      return {
        title: "Stock you still have needs a cost",
        detail: "Enter the actual purchase or production cost for the remaining stock.",
      };
    }
    if (normalized.includes("sale, consumption, or loss")) {
      return {
        title: "Past stock activity has no cost",
        detail: "Some stock sold, used or lost in this period could not be valued.",
      };
    }
    if (normalized.includes("egg production")) {
      return {
        title: "Egg production costs are missing",
        detail: "Feed or other inputs for eggs collected in this period are not fully recorded.",
      };
    }
    if (normalized.includes("not represented in the inventory ledger")) {
      return {
        title: "Egg stock records don’t match",
        detail: "Collections, sales, returns or losses differ from the stock ledger.",
      };
    }
    if (normalized.includes("ledger exceeds the quantity")) {
      return {
        title: "Egg ledger shows extra stock",
        detail: "Recorded egg stock is higher than collections, returns and losses explain.",
      };
    }
    if (normalized.includes("current chicken batch stock")) {
      return {
        title: "Some chickens aren’t linked to costed stock",
        detail: "Batch counts and the valued chicken stock ledger do not match.",
      };
    }
    return {
      title: "Some costs or stock records are missing",
      detail: "The available records are not enough to verify profit for this period.",
    };
  });

  return (
    <Card style={styles.profitabilityCard}>
      <View style={styles.profitabilityHeader}>
        <View style={[styles.profitabilityIcon, { backgroundColor: `${resultColor}18` }]}>
          <Ionicons name="analytics-outline" size={21} color={resultColor} />
        </View>
        <View style={styles.grow}>
          <AppText size="heading" weight="semibold">Net profit & loss</AppText>
          <AppText size="small" tone="secondary">
            Profit after stock costs, expenses, returns and losses
          </AppText>
        </View>
        <View style={[styles.profitabilityBadge, { backgroundColor: `${resultColor}18` }]}>
          <AppText size="small" weight="semibold" style={{ color: resultColor }}>
            {resultLabel}
          </AppText>
        </View>
      </View>
      <View style={[styles.profitabilityResult, { borderColor: `${resultColor}55` }]}>
        <AppText size="small" weight="semibold" tone="secondary">
          {report.from_date} – {report.to_date}
        </AppText>
        <AppText
          size={result === null ? "body" : "title"}
          weight="semibold"
          style={{ color: resultColor }}
        >
          {result === null
            ? "Profit can’t be verified yet"
            : formatAmount(result)}
        </AppText>
      </View>
      {!report.complete ? (
        <View
          style={[
            styles.incompletePanel,
            { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
          ]}
        >
          <AppText size="small" weight="semibold">
            Why profit isn’t shown
          </AppText>
          {profitabilityGaps.map((gap) => (
            <View key={gap.title} style={styles.incompleteReason}>
              <Ionicons name="alert-circle-outline" size={16} color={theme.secondary} />
              <View style={styles.incompleteReasonCopy}>
                <AppText size="small" weight="semibold">{gap.title}</AppText>
                <AppText size="small" tone="secondary">
                  {gap.detail}
                </AppText>
              </View>
            </View>
          ))}
          {hasUncostedCurrentStock ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/reports/stock-costing")}
              style={[styles.stockReviewLink, { borderTopColor: theme.border }]}
            >
              <Ionicons name="cube-outline" size={17} color={theme.primary} />
              <View style={styles.grow}>
                <AppText size="small" weight="semibold">
                  Add cost to stock you still have
                </AppText>
                <AppText size="small" tone="secondary">
                  Use a verified purchase or production cost.
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={17} color={theme.primary} />
            </Pressable>
          ) : (
            <View style={[styles.incompleteTip, { borderTopColor: theme.border }]}>
              <AppText size="small" tone="secondary">
                This is about costs missing from past activity. Valuing today’s
                stock will not fill those gaps, and missing amounts are never guessed.
              </AppText>
            </View>
          )}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showCalculationDetails }}
        onPress={() => setShowCalculationDetails((visible) => !visible)}
        style={[styles.calculationToggle, { borderTopColor: theme.border }]}
      >
        <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
          {showCalculationDetails ? "Hide calculation details" : "Show calculation details"}
        </AppText>
        <Ionicons
          name={showCalculationDetails ? "chevron-up" : "chevron-down"}
          size={17}
          color={theme.primary}
        />
      </Pressable>
      {showCalculationDetails ? (
        <>
          <View style={styles.profitabilityBreakdown}>
            {rows.map((row) => (
              <ProfitabilityValueRow
                key={row.label}
                {...row}
                formatAmount={formatAmount}
              />
            ))}
            {report.complete ? (
              <ProfitabilityValueRow
                label="Net profit / (loss)"
                value={report.net_profit ?? "0"}
                strong
                highlight={resultColor}
                formatAmount={formatAmount}
              />
            ) : null}
          </View>
          <View style={[styles.stockValuation, { borderTopColor: theme.border }]}>
            <View style={styles.profitabilitySectionHeading}>
              <Ionicons name="file-tray-stacked-outline" size={18} color={theme.primary} />
              <AppText size="small" weight="semibold">Stock value today</AppText>
            </View>
            <ProfitabilityValueRow
              label={`Total value · ${report.closing_stock_as_of}`}
              value={report.closing_stock_valued_cost}
              formatAmount={formatAmount}
            />
            <AppText size="small" tone="secondary">
              Uncosted products: {report.closing_stock.filter(
                (item) => Number(item.unvalued_quantity) > 0,
              ).length}
              {Number(report.untracked_chicken_quantity) > 0
                ? ` · Chickens not linked to costs: ${formatQuantity(report.untracked_chicken_quantity)}`
                : ""}
              {Number(report.untracked_egg_quantity) > 0
                ? ` · Egg stock not in ledger: ${formatQuantity(report.untracked_egg_quantity)}`
                : ""}
              {Number(report.overrepresented_egg_quantity) > 0
                ? ` · Extra eggs in ledger: ${formatQuantity(report.overrepresented_egg_quantity)}`
                : ""}
            </AppText>
            {report.closing_stock.map((item) => (
              <View key={item.product_id} style={styles.stockValueRow}>
                <View style={styles.grow}>
                  <AppText size="small">{item.product_name}</AppText>
                  <AppText size="small" tone="secondary">
                    {formatQuantity(item.valued_quantity)} {item.unit_abbreviation || item.unit_name} valued
                    {Number(item.unvalued_quantity) > 0
                      ? ` · ${formatQuantity(item.unvalued_quantity)} ${item.unit_abbreviation || item.unit_name} uncosted`
                      : ""}
                  </AppText>
                </View>
                <AppText size="small" weight="semibold">
                  {formatAmount(item.valued_cost)}
                </AppText>
              </View>
            ))}
          </View>
          <View style={[styles.accountingNotes, { backgroundColor: theme.backgroundSelected }]}>
            <AppText size="small" weight="semibold">How the calculation works</AppText>
            <AppText size="small" tone="secondary">
              Stock purchases count as a cost when stock is sold, used, returned
              or lost. Customer return credits reduce sales; cash refunds are
              listed separately to avoid counting them twice.
            </AppText>
            <AppText size="small" tone="secondary">
              Egg-production costs: {formatAmount(report.product_consumption_cost)} ·
              assigned to egg stock: {formatAmount(report.egg_production_cost_allocated)}
            </AppText>
          </View>
        </>
      ) : null}
    </Card>
  );
}

function ProfitabilityValueRow({
  label,
  value,
  deduct = false,
  strong = false,
  highlight,
  formatAmount,
}: {
  label: string;
  value: string;
  deduct?: boolean;
  strong?: boolean;
  highlight?: string;
  formatAmount: (value: string | number) => string;
}) {
  const { theme } = useTheme();
  const amount = Number(value);
  return (
    <View
      style={[
        styles.profitabilityRow,
        strong && {
          borderTopColor: theme.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <AppText
        size="small"
        weight={strong ? "semibold" : "regular"}
        style={[styles.grow, highlight ? { color: highlight } : undefined]}
      >
        {label}
      </AppText>
      <AppText
        size="small"
        weight={strong ? "semibold" : "regular"}
        style={highlight ? { color: highlight } : undefined}
      >
        {deduct && amount > 0 ? "− " : ""}{formatAmount(value)}
      </AppText>
    </View>
  );
}

function formatQuantity(value: string | number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(
    Number(value),
  );
}

function profitabilityExportRows(report: ProfitabilityReport) {
  return [
    {
      line: "Profitability status",
      amount: report.net_profit === null ? null : Number(report.net_profit),
      treatment: report.complete
        ? Number(report.net_profit) < 0
          ? "Loss"
          : Number(report.net_profit) > 0
            ? "Profit"
            : "Break-even"
        : report.incompleteness_reasons.join(" "),
    },
    { line: "Gross sales", amount: Number(report.gross_sales), treatment: "Accrual revenue before returns." },
    { line: "Delivered return credits", amount: -Number(report.sales_credits), treatment: "Deducted from sales revenue." },
    { line: "Net revenue", amount: Number(report.net_revenue), treatment: "Gross sales less delivered return credits." },
    { line: "Cost of goods sold", amount: -Number(report.cost_of_goods_sold), treatment: "Weighted-average carrying cost of sold stock." },
    { line: "Unallocated consumption", amount: -Number(report.unallocated_consumption_expense), treatment: "Consumption not allocated to egg production." },
    { line: "Consumption cost allocated to egg stock", amount: Number(report.egg_production_cost_allocated), treatment: "Informational only; included in stock cost and COGS when those eggs are sold." },
    { line: "Operating expenses", amount: -Number(report.operating_expenses), treatment: "Excludes expenses linked to inventory purchases." },
    { line: "Inventory losses", amount: -Number(report.inventory_losses), treatment: "Recorded stock losses valued at cost." },
    { line: "Customer cash refunds", amount: Number(report.customer_cash_refunds_excluded), treatment: "Cash-flow/balance item; not a second revenue deduction." },
    { line: "Supplier cash refunds", amount: Number(report.supplier_cash_refunds_excluded), treatment: "Cash-flow item; not recognized as income." },
    { line: "Supplier return credits", amount: Number(report.supplier_return_credits_excluded), treatment: "Reverses stock cost, not operating income." },
  ];
}

function PeriodOption({
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
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.periodOption,
        {
          backgroundColor: selected ? theme.primary : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}
    >
      <AppText
        size="small"
        weight="semibold"
        style={{ color: selected ? theme.onPrimary : theme.textSecondary }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function MetricCard({
  icon,
  label,
  value,
  currency,
  detail,
  accent,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  currency: string;
  detail: string;
  accent: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.metricCard,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}
    >
      <View style={[styles.metricIcon, { backgroundColor: `${accent}1A` }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <AppText size="small" tone="secondary">
        {label}
      </AppText>
      <MoneyValue
        value={value}
        currency={currency}
      />
      <AppText size="small" tone="secondary">
        {detail}
      </AppText>
      <View style={[styles.metricAccent, { backgroundColor: accent }]} />
      <Ionicons
        name="chevron-forward"
        size={15}
        color={theme.textSecondary}
        style={styles.metricChevron}
      />
    </Pressable>
  );
}

function MoneyValue({
  value,
  currency,
  color,
}: {
  value: number;
  currency: string;
  color?: string;
}) {
  return (
    <View style={styles.moneyValue}>
      <AppText size="small" tone="secondary" weight="semibold">
        {currency}
      </AppText>
      <AppText size="body" weight="semibold" style={color ? { color } : undefined}>
        {new Intl.NumberFormat(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(value)}
      </AppText>
    </View>
  );
}
function SnapshotRow({
  icon,
  title,
  value,
  detail,
  href,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: string;
  detail: string;
  href: Href;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(href)}
      style={styles.snapshotRow}
    >
      <View style={[styles.snapshotIcon, { backgroundColor: theme.backgroundSelected }]}>
        <Ionicons name={icon} size={18} color={theme.primary} />
      </View>
      <View style={styles.grow}>
        <AppText size="small" weight="semibold">
          {title}
        </AppText>
        <AppText size="small" tone="secondary">
          {detail}
        </AppText>
      </View>
      <AppText size="heading" weight="semibold">
        {value}
      </AppText>
    </Pressable>
  );
}

function AttentionLink({
  title,
  detail,
  href,
}: {
  title: string;
  detail: string;
  href: Href;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(href)}
      style={[styles.attentionLink, { borderTopColor: theme.border }]}
    >
      <View style={styles.grow}>
        <AppText size="small" weight="semibold">
          {title}
        </AppText>
        <AppText size="small" tone="secondary">
          {detail}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.primary} />
    </Pressable>
  );
}

function ShortcutCard({
  title,
  description,
  icon,
  onPress,
}: {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.shortcutCard,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}
    >
      <View style={[styles.shortcutIcon, { backgroundColor: theme.backgroundSelected }]}>
        <Ionicons name={icon} size={19} color={theme.primary} />
      </View>
      <AppText size="small" weight="semibold">
        {title}
      </AppText>
      <AppText size="small" tone="secondary" numberOfLines={2}>
        {description}
      </AppText>
      <View style={styles.shortcutFooter}>
        <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
          Open
        </AppText>
        <Ionicons name="arrow-forward" size={15} color={theme.primary} />
      </View>
    </Pressable>
  );
}

function today(): string {
  const date = new Date();
  return formatDate(date);
}

function monthStart(): string {
  const date = new Date();
  date.setDate(1);
  return formatDate(date);
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatDate(date);
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function reportHref(report: ReportName, fromDate: string, toDate: string): Href {
  const query = new URLSearchParams({
    from_date: fromDate,
    to_date: toDate,
  });
  return `/reports/${report}?${query.toString()}` as Href;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  card: { gap: 13 },
  intro: { gap: 4, paddingHorizontal: 2 },
  grow: { flex: 1, gap: 3 },
  periodHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  overviewToggle: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  periodOptions: { gap: 8, paddingRight: 2 },
  periodOption: {
    minHeight: 36,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 13,
  },
  dateFilters: { flexDirection: "row", gap: 10 },
  dateField: { flex: 1 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: {
    width: "48%",
    minHeight: 148,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 7,
    overflow: "hidden",
    position: "relative",
  },
  metricIcon: {
    width: 33,
    height: 33,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    marginBottom: 2,
  },
  metricAccent: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 3,
  },
  metricChevron: { position: "absolute", top: 13, right: 10 },
  moneyValue: { gap: 1 },
  profitabilityCard: { gap: 14 },
  profitabilityHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  profitabilityIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  profitabilityBadge: {
    maxWidth: 155,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 5,
    alignItems: "center",
  },
  profitabilityResult: {
    gap: 4,
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
  },
  incompletePanel: { gap: 9, padding: 12, borderRadius: 12, borderWidth: 1 },
  incompleteReason: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  incompleteReasonCopy: { flex: 1, gap: 1 },
  incompleteTip: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9 },
  stockReviewLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  calculationToggle: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 7,
  },
  profitabilityBreakdown: { gap: 1 },
  profitabilityRow: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  stockValuation: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  profitabilitySectionHeading: { flexDirection: "row", alignItems: "center", gap: 7 },
  stockValueRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 },
  accountingNotes: { gap: 7, borderRadius: 11, padding: 11 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  activityCard: { gap: 14 },
  activityHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  activityStats: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  activityStat: {
    flex: 1,
    gap: 2,
    paddingHorizontal: 10,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  activityList: { gap: 0 },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 11,
  },
  activityIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  activityCopy: { flex: 1, gap: 3 },
  activityError: { gap: 8 },
  snapshotRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  snapshotIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  attention: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 2,
  },
  stockGroup: { gap: 8, paddingTop: 11, borderTopWidth: StyleSheet.hairlineWidth },
  stockHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  stockRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  snapshotLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  attentionCard: { gap: 9 },
  attentionIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  attentionLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  shortcutGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  shortcutCard: {
    width: "48%",
    minHeight: 140,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 7,
  },
  shortcutIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  shortcutFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: "auto",
  },
  errorHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  errorCard: { gap: 10 },
});
