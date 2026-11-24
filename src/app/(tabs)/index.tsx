import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import * as React from "react";
import { useMemo } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeOutUp,
  LinearTransition,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { FarmSelector } from "@/features/farms/components/farm-selector";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { useEggCollectionOptions, useEggCollections } from "@/features/eggs/hooks";
import { zonedDateTimeToUtc } from "@/features/dashboard/date-range";
import {
  useChickenLosses,
  useChickenSaleOptions,
} from "@/features/chickens/hooks";
import {
  useExpenseSummary,
  useFarmActivities,
  useProfitabilityReport,
  useUnreadNotificationCount,
} from "@/features/management/hooks";
import { useReminders } from "@/features/reminders/hooks";
import {
  useOutstandingBalances,
  usePendingSaleDeliveries,
  useSalesReport,
} from "@/features/sales/hooks";
import { getActivityDetail, getActivityLabel } from "@/features/management/activity-presentation";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type DashboardRangePreset = "today" | "week" | "month" | "custom";

export default function DashboardScreen() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const farmId = farm.selectedFarm?.id;
  const timezone =
    farm.selectedFarm?.settings?.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const currency = farm.selectedFarm?.settings?.currency ?? "KES";
  const now = new Date();
  const today = dateInTimezone(now, timezone);
  const [dashboardRangePreset, setDashboardRangePreset] =
    React.useState<DashboardRangePreset>("today");
  const [salesFromDate, setSalesFromDate] = React.useState(today);
  const [salesToDate, setSalesToDate] = React.useState(today);
  const [showActivity, setShowActivity] = React.useState(true);
  const [showSalesTrend, setShowSalesTrend] = React.useState(false);
  const [showAllAttention, setShowAllAttention] = React.useState(false);
  const salesRangeValid =
    salesFromDate <= salesToDate && salesToDate <= today;
  const flockQuery = useChickenSaleOptions(user?.id, farmId);
  const chickenLossesQuery = useChickenLosses(user?.id, farmId, {
    from_date: salesFromDate,
    to_date: salesToDate,
  });
  const eggsQuery = useEggCollectionOptions(user?.id, farmId);
  const eggCollectionsQuery = useEggCollections(user?.id, farmId, {
    from_datetime: zonedDateTimeToUtc(salesFromDate, "00:00:00", timezone),
    to_datetime: zonedDateTimeToUtc(salesToDate, "23:59:59", timezone),
  });
  const salesRangeQuery = useSalesReport(user?.id, farmId, {
    from_date: salesFromDate,
    to_date: salesToDate,
    status: "completed",
    include_daily: true,
    offset: 0,
    limit: 1,
  }, salesRangeValid);
  const previousSalesRange = getPreviousDateRange(salesFromDate, salesToDate);
  const previousSalesQuery = useSalesReport(
    user?.id,
    farmId,
    {
      from_date: previousSalesRange.from,
      to_date: previousSalesRange.to,
      status: "completed",
      include_daily: false,
      offset: 0,
      limit: 1,
    },
    salesRangeValid,
  );
  const pendingDeliveriesQuery = usePendingSaleDeliveries(user?.id, farmId);
  const outstandingBalancesQuery = useOutstandingBalances(user?.id, farmId);
  const expensesQuery = useExpenseSummary(user?.id, farmId, {
    from_date: salesFromDate,
    to_date: salesToDate,
  });
  const monthlyProfitQuery = useProfitabilityReport(user?.id, farmId, {
    from_date: salesFromDate,
    to_date: salesToDate,
  });
  const notificationsQuery = useUnreadNotificationCount(user?.id, farmId);
  const remindersQuery = useReminders(user?.id, farmId);
  const activityQuery = useFarmActivities(
    user?.id,
    farmId,
    "",
    undefined,
    zonedDateTimeToUtc(salesFromDate, "00:00:00", timezone),
    zonedDateTimeToUtc(salesToDate, "23:59:59", timezone),
  );
  const isRefreshing =
    salesRangeQuery.isRefetching ||
    previousSalesQuery.isRefetching ||
    expensesQuery.isRefetching ||
    monthlyProfitQuery.isRefetching ||
    eggCollectionsQuery.isRefetching ||
    flockQuery.isRefetching ||
    chickenLossesQuery.isRefetching ||
    eggsQuery.isRefetching ||
    notificationsQuery.isRefetching ||
    remindersQuery.isRefetching ||
    activityQuery.isRefetching ||
    pendingDeliveriesQuery.isRefetching ||
    outstandingBalancesQuery.isRefetching;

  const flock = flockQuery.data;
  const liveBirds = (flock?.batches ?? []).reduce(
    (total, batch) =>
      total + batch.stocks.reduce((batchTotal, stock) => batchTotal + stock.quantity, 0),
    0,
  );
  const layingHens = (flock?.batches ?? [])
    .filter((batch) => batch.chicken_type === "layers")
    .reduce(
      (total, batch) =>
        total +
        batch.stocks.reduce(
          (batchTotal, stock) => batchTotal + stock.quantity,
          0,
        ),
      0,
    );
  const collectedInRange = (eggCollectionsQuery.data ?? [])
    .filter(
      (collection) =>
        collection.entry_type === "collection" &&
        dateInTimezone(new Date(collection.collected_at), timezone) >= salesFromDate &&
        dateInTimezone(new Date(collection.collected_at), timezone) <= salesToDate,
    )
    .reduce(
      (total, collection) => total + Number(collection.quantity_in_base_unit),
      0,
    );
  const availableEggs = (eggsQuery.data?.products ?? []).reduce(
    (total, product) => total + Number(product.available_quantity_in_base_unit),
    0,
  );
  const mortalityCount = (chickenLossesQuery.data ?? []).reduce(
    (total, loss) => total + loss.quantity,
    0,
  );
  const reminders = useMemo(
    () =>
      (remindersQuery.data ?? [])
        .filter((reminder) => reminder.status === "PENDING")
        .sort((left, right) => left.due_at.localeCompare(right.due_at)),
    [remindersQuery.data],
  );
  const recentActivity =
    activityQuery.data?.pages.flatMap((page) => page.items).slice(0, 3) ?? [];
  const salesRangeDays = daysBetween(salesFromDate, salesToDate) + 1;
  const layRate =
    layingHens > 0 && salesRangeDays > 0
      ? (collectedInRange / (layingHens * salesRangeDays)) * 100
      : null;
  const layRateOutsideRange = layRate !== null && layRate > 100;
  const salesTrend = buildSalesTrend(
    salesFromDate,
    salesToDate,
    salesRangeQuery.data?.daily ?? [],
    today,
  );
  const salesTrendMax = Math.max(1, ...salesTrend.map((item) => item.value));
  const salesTrendTotal = salesTrend.reduce((sum, item) => sum + item.value, 0);

  function selectDashboardRange(preset: DashboardRangePreset) {
    setDashboardRangePreset(preset);
    if (preset === "custom") return;
    const range = getDashboardRange(preset, today);
    setSalesFromDate(range.from);
    setSalesToDate(range.to);
  }

  async function refreshDashboard() {
    await Promise.all([
      salesRangeQuery.refetch(),
      previousSalesQuery.refetch(),
      expensesQuery.refetch(),
      monthlyProfitQuery.refetch(),
      eggCollectionsQuery.refetch(),
      flockQuery.refetch(),
      chickenLossesQuery.refetch(),
      eggsQuery.refetch(),
      notificationsQuery.refetch(),
      remindersQuery.refetch(),
      activityQuery.refetch(),
      pendingDeliveriesQuery.refetch(),
      outstandingBalancesQuery.refetch(),
    ]);
  }

  if (farm.status === "inactive") {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.background }}
        edges={["top"]}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <FarmPageHeader title="Farm overview" compact />
          <Card style={styles.sectionCard}>
            <AppText size="heading" weight="semibold">
              All farms are inactive
            </AppText>
            <AppText tone="secondary">
              Enable a farm to return to its records and daily operations.
            </AppText>
            <FarmSelector />
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (farm.status === "initializing") {
    return <LoadingState label="Loading your farm" />;
  }
  if (farm.status === "empty") {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.background }}
        edges={["top"]}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <FarmPageHeader title="Farm overview" />
          <Card style={styles.sectionCard}>
            <AppText size="heading" weight="semibold">
              Set up your farm to get started
            </AppText>
            <AppText size="small" tone="secondary">
              Add your farm and poultry records to see a useful daily summary.
            </AppText>
            <Button
              label="Set up farm"
              onPress={() => router.replace("/farm-setup")}
            />
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }
  if (farm.status === "error") {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.background }}
        edges={["top"]}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <FarmPageHeader title="Farm overview" />
          <Card style={styles.sectionCard}>
            <AppText size="heading" weight="semibold">
              Farm data is unavailable
            </AppText>
            <AppText size="small" tone="secondary">
              {farm.error?.message ?? "Check your connection and try again."}
            </AppText>
            <Button
              label="Try again"
              onPress={() => void farm.refreshFarms()}
            />
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const periodSales = salesRangeQuery.data?.summary;
  const periodExpenses = expensesQuery.data;
  const currentSalesTotal = Number(periodSales?.sales_total ?? 0);
  const previousSalesTotal = Number(
    previousSalesQuery.data?.summary.sales_total ?? 0,
  );
  const salesComparison =
    previousSalesTotal > 0
      ? ((currentSalesTotal - previousSalesTotal) / previousSalesTotal) * 100
      : null;
  const unallocatedAmount = Number(periodSales?.unallocated_amount ?? 0);
  const residualAmount = Math.abs(unallocatedAmount);
  const residualLabel =
    unallocatedAmount < 0
      ? "Customer credit"
      : unallocatedAmount > 0
        ? "Returns & adjustments"
        : "Credits & adjustments";
  const periodTitle = getDashboardRangeTitle(dashboardRangePreset);
  const queryErrors = [
    salesRangeQuery.isError && "Sales",
    monthlyProfitQuery.isError && "Profitability",
    expensesQuery.isError && "Expenses",
    eggCollectionsQuery.isError && "Egg collection",
    flockQuery.isError && "Flock",
    chickenLossesQuery.isError && "Poultry losses",
    eggsQuery.isError && "Egg stock",
  ].filter(Boolean);
  const pendingReminders = reminders.filter(
    (reminder) => new Date(reminder.due_at).getTime() >= now.getTime(),
  );
  const formattedMoney = (amount: number | string) =>
    `${currency} ${new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount))}`;
  const profitabilityIssue = getProfitabilityIssue(
    monthlyProfitQuery.data?.incompleteness_reasons ?? [],
  );
  const hasUncostedCurrentStock =
    Number(monthlyProfitQuery.data?.closing_stock_unvalued_quantity ?? 0) > 0 ||
    Number(monthlyProfitQuery.data?.untracked_chicken_quantity ?? 0) > 0;
  const pendingDeliveries = pendingDeliveriesQuery.data ?? [];
  const attentionIsLoading =
    notificationsQuery.isLoading ||
    remindersQuery.isLoading ||
    flockQuery.isLoading ||
    pendingDeliveriesQuery.isLoading ||
    outstandingBalancesQuery.isLoading;
  const showNeedsAttention =
    attentionIsLoading ||
    notificationsQuery.isError ||
    remindersQuery.isError ||
    flockQuery.isError ||
    pendingDeliveriesQuery.isError ||
    outstandingBalancesQuery.isError ||
    Number(notificationsQuery.data ?? 0) > 0 ||
    reminders.length > 0 ||
    pendingDeliveries.length > 0 ||
    (outstandingBalancesQuery.data?.items.length ?? 0) > 0;
  const pendingChickenDeliveries = pendingDeliveries.filter((sale) =>
    sale.items.some((item) => item.product_type === "chickens"),
  );
  const pendingChickenQuantity = pendingChickenDeliveries.reduce(
    (total, sale) =>
      total +
      sale.items.reduce(
        (saleTotal, item) =>
          saleTotal +
          (item.product_type === "chickens"
            ? Number(item.quantity_remaining_base)
            : 0),
        0,
      ),
    0,
  );
  const chickenShortfall = Math.max(0, pendingChickenQuantity - liveBirds);
  const outstandingBalances = outstandingBalancesQuery.data;
  const attentionActions: {
    key: string;
    order: number;
    amount: number;
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    detail: string;
    status: string;
    priority: "urgent" | "action" | "upcoming";
    onPress: () => void;
  }[] = [];

  if (chickenShortfall > 0 && pendingChickenDeliveries[0]) {
    const sale = pendingChickenDeliveries[0];
    attentionActions.push({
      key: `shortfall-${sale.id}`,
      order: 0,
      amount: chickenShortfall,
      icon: "warning-outline",
      title: "Not enough chickens for delivery",
      detail: `${formatCompactNumber(chickenShortfall)} more needed · ${sale.reference_number ?? "Sale"}`,
      status: "Urgent",
      priority: "urgent",
      onPress: () =>
        router.push({
          pathname: "/sales/[saleId]/deliver",
          params: { saleId: sale.id },
        }),
    });
  }

  for (const reminder of reminders.filter(
    (item) => new Date(item.due_at).getTime() < now.getTime(),
  )) {
    attentionActions.push({
      key: `overdue-${reminder.id}`,
      order: 1,
      amount: -new Date(reminder.due_at).getTime(),
      icon: "time-outline",
      title: "Overdue farm task",
      detail: reminder.title,
      status: "Urgent",
      priority: "urgent",
      onPress: () =>
        router.push({
          pathname: "/reminders/[reminderId]",
          params: { reminderId: reminder.id },
        }),
    });
  }

  for (const sale of [...pendingDeliveries].sort((left, right) =>
    left.transaction_date.localeCompare(right.transaction_date),
  ).filter(
    (sale) =>
      chickenShortfall <= 0 ||
      sale.id !== pendingChickenDeliveries[0]?.id,
  )) {
    const productSummary = sale.items
      .map(
        (item) =>
          `${formatCompactNumber(Number(item.quantity_remaining))} ${item.unit_name ?? item.product_name}`,
      )
      .join(", ");
    const eggOnly = sale.items.every((item) => item.product_type === "eggs");
    attentionActions.push({
      key: `delivery-${sale.id}`,
      order: 2,
      amount: -new Date(sale.transaction_date).getTime(),
      icon: "cube-outline",
      title: `Record delivery${sale.customer_name ? ` for ${sale.customer_name}` : ""}`,
      detail: `${sale.reference_number ?? "Sale"} · ${productSummary} remaining`,
      status: "Action",
      priority: "action",
      onPress: () =>
        router.push({
          pathname: eggOnly
            ? "/sales/[saleId]/deliver-eggs"
            : "/sales/[saleId]/deliver",
          params: { saleId: sale.id },
        }),
    });
  }

  for (const balance of outstandingBalances?.items ?? []) {
    const isSale = balance.transaction_type === "sale";
    const due = Number(balance.balance_due);
    const amount = due > 0 ? due : Number(balance.credit_balance);
    const person = balance.contact_name ?? (isSale ? "customer" : "supplier");
    const title =
      due > 0
        ? isSale
          ? `Collect from ${person}`
          : `Pay ${person}`
        : isSale
          ? `Settle credit with ${person}`
          : `Apply ${person}’s credit`;
    attentionActions.push({
      key: `balance-${balance.id}`,
      order: due > 0 ? 3 : 4,
      amount,
      icon: "wallet-outline",
      title,
      detail: `${formattedMoney(amount)} · ${balance.reference_number ?? "No reference"}`,
      status: due > 0 ? "Settle" : "Credit",
      priority: due > 0 ? "action" : "upcoming",
      onPress: () =>
        router.push({
          pathname: "/transactions/[transactionId]/settlements",
          params: {
            transactionId: balance.id,
            transactionType: balance.transaction_type,
            balanceDue: String(balance.balance_due),
            creditBalance: String(balance.credit_balance),
            accountBalanceTotal: String(balance.account_balance_due),
            accountCreditTotal: String(balance.account_credit_balance),
            contactName: person,
            referenceNumber: balance.reference_number ?? "",
          },
        }),
    });
  }

  for (const reminder of pendingReminders) {
    attentionActions.push({
      key: `reminder-${reminder.id}`,
      order: 5,
      amount: -new Date(reminder.due_at).getTime(),
      icon: "calendar-outline",
      title: "Upcoming farm task",
      detail: `${reminder.title} · ${formatReminderDate(reminder.due_at, timezone)}`,
      status: "Soon",
      priority: "upcoming",
      onPress: () =>
        router.push({
          pathname: "/reminders/[reminderId]",
          params: { reminderId: reminder.id },
        }),
    });
  }

  if (Number(notificationsQuery.data ?? 0) > 0) {
    attentionActions.push({
      key: "unread-notifications",
      order: 6,
      amount: Number(notificationsQuery.data),
      icon: "notifications-outline",
      title: "Unread farm updates",
      detail: `${notificationsQuery.data} ${Number(notificationsQuery.data) === 1 ? "update" : "updates"} to review`,
      status: "Review",
      priority: "upcoming",
      onPress: () => router.push("/notifications"),
    });
  }
  const topAttentionActions = attentionActions
    .sort(
      (left, right) =>
        left.order - right.order || right.amount - left.amount,
    )
    .slice(0, 3);
  const displayedAttentionActions = showAllAttention
    ? attentionActions
    : topAttentionActions;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={["top"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void refreshDashboard()}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <FarmPageHeader title="Farm overview" compact />

        {farm.farms.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.farmPicker}
          >
            {farm.farms.map((item) => (
              <Button
                key={item.id}
                label={item.name}
                variant={
                  item.id === farm.selectedFarm?.id ? "primary" : "secondary"
                }
                onPress={() => void farm.selectFarm(item.id)}
              />
            ))}
          </ScrollView>
        ) : null}

        <Animated.View
          entering={FadeInDown.delay(35).duration(280)}
          layout={LinearTransition.springify().damping(18)}
        >
        <View
          style={[
            styles.periodSelector,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.periodHeading}>
            <View style={styles.periodTitleGroup}>
              <View
                style={[
                  styles.periodIcon,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <Ionicons name="calendar-clear-outline" size={17} color={theme.primary} />
              </View>
              <View style={styles.periodHeadingCopy}>
                <AppText size="small" weight="semibold">
                  Reporting period
                </AppText>
                <AppText size="small" tone="secondary">
                  {formatRangeLabel(salesFromDate, salesToDate)}
                </AppText>
              </View>
            </View>
          </View>
          <View style={styles.periodOptions}>
            <RangeOption
              label="Today"
              selected={dashboardRangePreset === "today"}
              onPress={() => selectDashboardRange("today")}
            />
            <RangeOption
              label="Week"
              selected={dashboardRangePreset === "week"}
              onPress={() => selectDashboardRange("week")}
            />
            <RangeOption
              label="Month"
              selected={dashboardRangePreset === "month"}
              onPress={() => selectDashboardRange("month")}
            />
            <RangeOption
              label="Custom"
              selected={dashboardRangePreset === "custom"}
              onPress={() => selectDashboardRange("custom")}
            />
          </View>
          {dashboardRangePreset === "custom" ? (
            <Animated.View
              entering={FadeInDown.duration(180)}
              exiting={FadeOutUp.duration(130)}
              style={styles.periodDateFilters}
            >
              <DatePickerField
                label="From"
                value={salesFromDate}
                maximumDate={new Date(`${salesToDate}T12:00:00`)}
                onChange={setSalesFromDate}
                style={styles.dateField}
              />
              <DatePickerField
                label="To"
                value={salesToDate}
                minimumDate={new Date(`${salesFromDate}T12:00:00`)}
                maximumDate={new Date(`${today}T12:00:00`)}
                onChange={setSalesToDate}
                style={styles.dateField}
              />
            </Animated.View>
          ) : null}
          {dashboardRangePreset === "week" ? (
            <AppText size="small" tone="secondary">
              Monday through today · the current week so far
            </AppText>
          ) : null}
          {!salesRangeValid ? (
            <AppText size="small" style={{ color: theme.danger }}>
              Choose a valid date range ending today or earlier.
            </AppText>
          ) : null}
        </View>
        </Animated.View>

        {queryErrors.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(240)}>
          <Card style={styles.errorCard}>
            <AppText size="small" weight="semibold">
              Some dashboard figures couldn’t be updated.
            </AppText>
            <AppText size="small" tone="secondary">
              {queryErrors.join(", ")} data is unavailable.
            </AppText>
            <Button
              label="Retry"
              variant="quiet"
              onPress={() => void refreshDashboard()}
            />
          </Card>
          </Animated.View>
        ) : null}

        <Animated.View
          key={`sales-${salesFromDate}-${salesToDate}`}
          entering={FadeInDown.duration(320)}
          layout={LinearTransition.springify().damping(18)}
        >
        <View
          style={[
            styles.todayPanel,
            {
              backgroundColor: theme.backgroundElement,
              borderLeftColor: theme.primary,
              borderColor: theme.border,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open sales report for ${periodTitle}, ${formattedMoney(periodSales?.sales_total ?? 0)} total`}
            onPress={() =>
              router.push({
                pathname: "/(tabs)/sales",
                params: { from_date: salesFromDate, to_date: salesToDate },
              })
            }
            style={({ pressed }) => [
              styles.todaySales,
              {
                backgroundColor: pressed
                  ? theme.backgroundSelected
                  : "transparent",
              },
            ]}
          >
            <View style={styles.todaySalesHeading}>
              <View style={styles.todaySalesLabel}>
                <View style={[styles.accentDot, { backgroundColor: theme.primary }]} />
                <AppText size="small" weight="semibold" tone="secondary">
                  SALES {periodTitle.toUpperCase()}
                </AppText>
              </View>
              <View
                style={[
                  styles.comparisonBadge,
                  {
                    backgroundColor:
                      salesComparison === null
                        ? theme.background
                        : salesComparison >= 0
                          ? `${theme.success}18`
                          : `${theme.danger}18`,
                  },
                ]}
              >
                {previousSalesQuery.isLoading ? (
                  <AppText size="small" tone="secondary">
                    Comparing…
                  </AppText>
                ) : salesComparison === null ? (
                  <AppText size="small" tone="secondary">
                    {previousSalesQuery.isError
                      ? "Comparison unavailable"
                      : previousSalesQuery.data && currentSalesTotal > 0
                        ? "New sales"
                        : previousSalesQuery.data
                          ? "No sales either period"
                          : "No prior data"}
                  </AppText>
                ) : (
                  <>
                    <Ionicons
                      name={
                        salesComparison >= 0
                          ? "trending-up-outline"
                          : "trending-down-outline"
                      }
                      size={14}
                      color={
                        salesComparison >= 0 ? theme.success : theme.danger
                      }
                    />
                    <AppText
                      size="small"
                      weight="semibold"
                      style={{
                        color:
                          salesComparison >= 0 ? theme.success : theme.danger,
                      }}
                    >
                      {salesComparison > 0 ? "+" : ""}
                      {salesComparison.toFixed(1)}%
                    </AppText>
                  </>
                )}
              </View>
              <Ionicons name="arrow-forward" size={17} color={theme.primary} />
            </View>
            <AppText
              size="title"
              weight="semibold"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={styles.salesTotal}
            >
              {salesRangeQuery.isLoading
                ? "…"
                : salesRangeQuery.isError
                  ? "Unavailable"
                  : formattedMoney(periodSales?.sales_total ?? 0)}
            </AppText>
            <AppText size="small" tone="secondary">
              {salesRangeQuery.isLoading || salesRangeQuery.isError
                ? "Sales count unavailable"
                : `${(periodSales?.transaction_count ?? 0).toLocaleString()} recorded ${(periodSales?.transaction_count ?? 0) === 1 ? "sale" : "sales"}`}
            </AppText>
            <View style={styles.salesBreakdown}>
              <View style={styles.salesBreakdownItem}>
                <View style={styles.salesLegendLabel}>
                  <View style={[styles.salesLegendDot, { backgroundColor: theme.success }]} />
                  <AppText size="small" tone="secondary">Net received</AppText>
                </View>
                <AppText size="small" weight="semibold" numberOfLines={1} adjustsFontSizeToFit>
                  {salesRangeQuery.isLoading || salesRangeQuery.isError
                    ? "—"
                    : formattedMoney(periodSales?.amount_received ?? 0)}
                </AppText>
              </View>
              <View style={[styles.salesDivider, { backgroundColor: theme.border }]} />
              <View style={styles.salesBreakdownItem}>
                <View style={styles.salesLegendLabel}>
                  <View style={[styles.salesLegendDot, { backgroundColor: theme.danger }]} />
                  <AppText size="small" tone="secondary">Still owed</AppText>
                </View>
                <AppText size="small" weight="semibold" numberOfLines={1} adjustsFontSizeToFit>
                  {salesRangeQuery.isLoading || salesRangeQuery.isError
                    ? "—"
                    : formattedMoney(periodSales?.balance_due ?? 0)}
                </AppText>
              </View>
              <View style={[styles.salesDivider, { backgroundColor: theme.border }]} />
              <View style={styles.salesBreakdownItem}>
                <View style={styles.salesLegendLabel}>
                  <View style={[styles.salesLegendDot, { backgroundColor: theme.secondary }]} />
                  <AppText size="small" tone="secondary">{residualLabel}</AppText>
                </View>
                <AppText size="small" weight="semibold" numberOfLines={1} adjustsFontSizeToFit>
                  {salesRangeQuery.isLoading || salesRangeQuery.isError
                    ? "—"
                    : formattedMoney(residualAmount)}
                </AppText>
              </View>
            </View>
            <AppText size="small" tone="secondary" style={styles.salesDefinition}>
              Compared with the previous {salesRangeDays === 1 ? "day" : `${salesRangeDays}-day period`}. Net received includes payments and cash settlements, less refunds.
            </AppText>
          </Pressable>
        </View>
        </Animated.View>

        {showNeedsAttention ? (
          <Animated.View
            entering={FadeInDown.delay(140).duration(280)}
            layout={LinearTransition.springify().damping(18)}
            style={styles.attentionSection}
          >
            <View style={styles.attentionHeading}>
              <View style={styles.attentionHeadingCopy}>
                <SectionHeading title="Needs attention" />
                <AppText size="small" tone="secondary">
                  {attentionActions.length}{" "}
                  {attentionActions.length === 1 ? "action" : "actions"}
                </AppText>
              </View>
              {attentionActions.length > 3 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowAllAttention((showing) => !showing)}
                  style={styles.seeAllAttention}
                >
                  <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                    {showAllAttention ? "Show top 3" : "See all"}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.attentionList}>
              {displayedAttentionActions.map((action, index) => (
                <Animated.View
                  key={action.key}
                  entering={FadeInDown.delay(Math.min(index * 45, 180)).duration(240)}
                >
                  <DashboardLink
                    icon={action.icon}
                    title={action.title}
                    detail={action.detail}
                    status={action.status}
                    priority={action.priority}
                    onPress={action.onPress}
                  />
                </Animated.View>
              ))}
              {topAttentionActions.length === 0 && !attentionIsLoading ? (
                <AppText size="small" tone="secondary">
                  No urgent farm tasks.
                </AppText>
              ) : null}
              {[
                notificationsQuery.isError,
                remindersQuery.isError,
                flockQuery.isError,
                pendingDeliveriesQuery.isError,
                outstandingBalancesQuery.isError,
              ].some(Boolean) ? (
                <AppText size="small" style={{ color: theme.danger }}>
                  Some farm tasks couldn’t be checked.
                </AppText>
              ) : null}
              {attentionIsLoading ? (
                <AppText size="small" tone="secondary">
                  Checking for farm tasks…
                </AppText>
              ) : null}
            </View>
          </Animated.View>
        ) : null}
        {!showNeedsAttention ? (
          <Animated.View entering={FadeInDown.delay(140).duration(280)}>
            <View
              style={[
                styles.allCaughtUp,
                {
                  backgroundColor: `${theme.success}12`,
                  borderColor: `${theme.success}35`,
                },
              ]}
            >
              <View
                style={[
                  styles.attentionIcon,
                  { backgroundColor: `${theme.success}1B` },
                ]}
              >
                <Ionicons
                  name="checkmark-done-outline"
                  size={20}
                  color={theme.success}
                />
              </View>
              <View style={styles.linkCopy}>
                <AppText size="small" weight="semibold">
                  You’re all caught up
                </AppText>
                <AppText size="small" tone="secondary">
                  No overdue tasks, pending deliveries or balances need action.
                </AppText>
              </View>
            </View>
          </Animated.View>
        ) : null}

        <SectionHeading title="Quick actions" />
        <Animated.View
          entering={FadeInDown.delay(200).duration(280)}
          style={styles.actionGrid}
        >
          <QuickAction
            icon="cash-outline"
            label="Record sale"
            detail="Sell eggs or chickens"
            onPress={() => router.push("/sales/new")}
          />
          <QuickAction
            icon="egg-outline"
            label="Collect eggs"
            detail="Log a collection"
            onPress={() => router.push("/egg-collection")}
          />
          <QuickAction
            icon="add-circle-outline"
            label="Add expense"
            detail="Track farm spending"
            onPress={() => router.push({ pathname: "/expenses", params: { new: "1" } })}
          />
          <QuickAction
            icon="alert-circle-outline"
            label="Log loss"
            detail="Record flock losses"
            onPress={() => router.push("/chicken-loss")}
          />
        </Animated.View>

        <SectionHeading title="Poultry" />
        <Animated.View
          entering={FadeInDown.delay(250).duration(280)}
          style={[
            styles.poultrySummary,
            { borderColor: theme.border },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(tabs)/flock")}
            style={({ pressed }) => [
              styles.poultryMetric,
              { opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="leaf-outline" size={19} color={theme.primary} />
            <View style={styles.poultryCopy}>
              <AppText size="small" tone="secondary">LIVE FLOCK</AppText>
              <AppText size="body" weight="semibold">
                {flockQuery.isLoading || flockQuery.isError ? "—" : liveBirds.toLocaleString()}
              </AppText>
              <AppText size="small" tone="secondary">
                {flockQuery.isLoading || flockQuery.isError
                  ? "Flock counts unavailable"
                  : `${flock?.batches.length ?? 0} batches · ${flock?.blocks.length ?? 0} blocks`}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={15} color={theme.textSecondary} />
          </Pressable>
          <View style={[styles.poultryDivider, { backgroundColor: theme.border }]} />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(tabs)/eggs")}
            style={({ pressed }) => [
              styles.poultryMetric,
              { opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="egg-outline" size={19} color={theme.success} />
            <View style={styles.poultryCopy}>
              <AppText size="small" tone="secondary">EGGS AVAILABLE</AppText>
              <AppText size="body" weight="semibold">
                {eggsQuery.isLoading || eggsQuery.isError ? "—" : availableEggs.toLocaleString()}
              </AppText>
              <AppText size="small" tone="secondary">
                {eggsQuery.isLoading || eggsQuery.isError
                  ? "Product count unavailable"
                  : `Across ${(eggsQuery.data?.products ?? []).length} products`}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={15} color={theme.textSecondary} />
          </Pressable>
          <View style={[styles.poultryDivider, { backgroundColor: theme.border }]} />
          <View style={styles.poultryMetric}>
            <Ionicons name="trending-up-outline" size={19} color={theme.primary} />
            <View style={styles.poultryCopy}>
              <AppText size="small" tone="secondary">
                LAY RATE · {periodTitle.toUpperCase()}
              </AppText>
              <AppText size="body" weight="semibold">
                {flockQuery.isLoading ||
                flockQuery.isError ||
                eggCollectionsQuery.isLoading ||
                eggCollectionsQuery.isError ||
                layRate === null
                  ? "—"
                  : `${layRate.toFixed(1)}%${layRateOutsideRange ? " · check counts" : ""}`}
              </AppText>
              <AppText
                size="small"
                tone={layRateOutsideRange ? undefined : "secondary"}
                style={layRateOutsideRange ? { color: theme.danger } : undefined}
              >
                {layRateOutsideRange
                  ? `${collectedInRange.toLocaleString()} eggs recorded vs ${layingHens.toLocaleString()} current layers. Counts may differ across this period.`
                  : "Eggs per layer per day"}
              </AppText>
              {layRateOutsideRange ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Review egg collection records"
                  onPress={() => router.push("/(tabs)/eggs")}
                  style={styles.reviewEggsAction}
                >
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{ color: theme.primary }}
                  >
                    Review egg records
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          </View>
          <View style={[styles.poultryDivider, { backgroundColor: theme.border }]} />
          <View style={styles.poultryMetric}>
            <Ionicons name="heart-dislike-outline" size={19} color={theme.danger} />
            <View style={styles.poultryCopy}>
              <AppText size="small" tone="secondary">
                MORTALITY · {periodTitle.toUpperCase()}
              </AppText>
              <AppText size="body" weight="semibold">
                {chickenLossesQuery.isLoading || chickenLossesQuery.isError
                  ? "—"
                  : mortalityCount.toLocaleString()}
              </AppText>
              <AppText size="small" tone="secondary">
                Birds lost during this period
              </AppText>
            </View>
          </View>
        </Animated.View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/inventory")}
          style={({ pressed }) => [
            styles.inventoryLink,
            { opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <Ionicons name="cube-outline" size={17} color={theme.primary} />
          <AppText size="small" weight="semibold" style={styles.linkCopy}>
            Feed, equipment & other stock
          </AppText>
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        </Pressable>

        <Animated.View
          key={`totals-${salesFromDate}-${salesToDate}`}
          entering={FadeInDown.delay(300).duration(280)}
          layout={LinearTransition.springify().damping(18)}
          style={styles.periodTotalsSection}
        >
          <SectionHeading title="Period totals" detail={periodTitle} />
          <View style={styles.operationsStrip}>
            <MiniMetric
              icon="receipt-outline"
              label="Expenses"
              value={expensesQuery.isError ? null : periodExpenses?.total_amount}
              currency={currency}
              loading={expensesQuery.isLoading}
              accent={theme.secondary}
            />
            <MiniMetric
              icon="egg-outline"
              label="Eggs collected"
              value={eggCollectionsQuery.isError ? null : collectedInRange}
              unit="eggs"
              loading={eggCollectionsQuery.isLoading}
              accent={theme.success}
            />
          </View>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(320).duration(260)}
          layout={LinearTransition.springify().damping(18)}
        >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showSalesTrend }}
          onPress={() => setShowSalesTrend((visible) => !visible)}
          style={[
            styles.chartHeading,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={[styles.chartIcon, { backgroundColor: theme.backgroundSelected }]}>
            <Ionicons name="stats-chart-outline" size={18} color={theme.primary} />
          </View>
          <View style={styles.chartTitle}>
            <AppText size="body" weight="semibold">
              Sales trend
            </AppText>
            <AppText size="small" tone="secondary">
              {salesRangeQuery.data
                ? `${formatCompactMoney(salesTrendTotal, currency)} · ${periodTitle.toLowerCase()}`
                : `Completed sales · ${periodTitle.toLowerCase()}`}
            </AppText>
          </View>
          <Ionicons
            name={showSalesTrend ? "chevron-up" : "chevron-down"}
            size={18}
            color={theme.primary}
          />
        </Pressable>
        {showSalesTrend ? (
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOutUp.duration(150)}
          style={styles.chartContent}
        >
        {!salesRangeValid ? (
          <AppText size="small" style={{ color: theme.danger }}>
            Choose a valid date range ending today or earlier.
          </AppText>
        ) : salesRangeQuery.isLoading ? (
          <LoadingState label="Loading sales trend" />
        ) : salesRangeQuery.isError ? (
          <View style={styles.chartState}>
            <AppText size="small" tone="secondary">
              The sales trend couldn’t be loaded.
            </AppText>
            <Button
              label="Retry"
              variant="quiet"
              onPress={() => void salesRangeQuery.refetch()}
            />
          </View>
        ) : salesTrend.length === 0 ? (
          <View style={styles.chartState}>
            <AppText size="small" tone="secondary">
              No sales were recorded in this date range.
            </AppText>
          </View>
        ) : (
          <View
            style={[
              styles.chartCard,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
          >
            <View style={styles.chartMeta}>
              <AppText size="small" tone="secondary">
                {formatRangeLabel(salesFromDate, salesToDate)}
              </AppText>
              <AppText size="small" tone="secondary">
                Peak {formatCompactMoney(salesTrendMax, currency)}
              </AppText>
            </View>
            <View style={styles.comparisonChart}>
              <ComparisonBar
                label="This period"
                amount={currentSalesTotal}
                max={Math.max(currentSalesTotal, previousSalesTotal, 1)}
                currency={currency}
                color={theme.primary}
              />
              <ComparisonBar
                label="Previous"
                amount={previousSalesTotal}
                max={Math.max(currentSalesTotal, previousSalesTotal, 1)}
                currency={currency}
                color={theme.secondary}
              />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={salesTrend.length > 10}
            >
            <View
              style={[
                styles.chartBars,
                { width: Math.max(salesTrend.length * 56, 280) },
              ]}
            >
              {salesTrend.map((item, index) => (
                <View key={item.day} style={styles.chartDay}>
                  <View style={styles.chartValue}>
                    <AppText
                      size="small"
                      tone="secondary"
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {salesRangeDays > 14 && index % 3 !== 0
                        ? ""
                        : formatCompactNumber(item.value)}
                    </AppText>
                  </View>
                  <View style={styles.chartTrack}>
                    <Animated.View
                      entering={FadeInUp.delay(Math.min(index * 25, 250)).duration(320)}
                      style={[
                        styles.chartBar,
                        {
                          height: `${Math.max(4, (item.value / salesTrendMax) * 100)}%`,
                          backgroundColor:
                            item.isToday ? theme.primary : theme.secondary,
                        },
                      ]}
                    />
                  </View>
                  <AppText size="small" tone="secondary" numberOfLines={1}>
                    {item.label}
                  </AppText>
                </View>
              ))}
            </View>
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/sales",
                  params: {
                    from_date: salesFromDate,
                    to_date: salesToDate,
                  },
                })
              }
              style={styles.chartLink}
            >
              <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                Open sales report
              </AppText>
              <Ionicons name="arrow-forward" size={16} color={theme.primary} />
            </Pressable>
          </View>
        )}
        </Animated.View>
        ) : null}
        </Animated.View>

        <View style={styles.activityHeading}>
          <SectionHeading title="Recent activity" />
          <View style={styles.activityActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open notifications${Number(notificationsQuery.data ?? 0) > 0 ? `, ${notificationsQuery.data} unread` : ""}`}
              onPress={() => router.push("/notifications")}
              hitSlop={8}
              style={styles.activityAction}
            >
              <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                {Number(notificationsQuery.data ?? 0) > 0
                  ? `Notifications · ${notificationsQuery.data}`
                  : "Notifications"}
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showActivity ? "Hide recent activity" : "Show recent activity"}
              accessibilityState={{ expanded: showActivity }}
              onPress={() => setShowActivity((visible) => !visible)}
              hitSlop={8}
              style={styles.activityAction}
            >
              <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                {showActivity ? "Hide" : "Show recent"}
              </AppText>
              <Ionicons
                name={showActivity ? "chevron-up" : "chevron-down"}
                size={15}
                color={theme.primary}
              />
            </Pressable>
          </View>
        </View>
        {showActivity ? (
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOutUp.duration(150)}
          style={styles.activityList}
        >
          {activityQuery.isLoading ? (
            <AppText size="small" tone="secondary">
              Loading recent activity…
            </AppText>
          ) : activityQuery.isError ? (
            <AppText size="small" style={{ color: theme.danger }}>
              Recent activity couldn’t be loaded.
            </AppText>
          ) : recentActivity.length > 0 ? (
            recentActivity.map((activity, index) => (
              <Animated.View
                key={activity.id}
                entering={FadeInDown.delay(index * 45).duration(230)}
              >
                <DashboardLink
                  icon="time-outline"
                  title={getActivityLabel(activity.type)}
                  detail={getActivityDetail(activity.details) || "Farm record updated"}
                  priority="upcoming"
                  onPress={() =>
                    router.push({
                      pathname: "/activities/[activityId]",
                      params: { activityId: activity.id },
                    })
                  }
                />
              </Animated.View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <AppText size="small" weight="semibold">
                Start your farm records
              </AppText>
              <AppText size="small" tone="secondary">
                Record a sale or egg collection to see daily activity here.
              </AppText>
            </View>
          )}
          {recentActivity.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/activities")}
              style={styles.chartLink}
            >
              <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                View all activity
              </AppText>
              <Ionicons name="arrow-forward" size={16} color={theme.primary} />
            </Pressable>
          ) : null}
        </Animated.View>
        ) : null}

        <Animated.View
          key={`profit-${salesFromDate}-${salesToDate}`}
          entering={FadeInDown.delay(440).duration(280)}
        >
        <View
          style={[
            styles.monthlyProfitCard,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.profitHeading}>
            <View
              style={[
                styles.profitIcon,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <Ionicons
                name={
                  monthlyProfitQuery.data?.complete
                    ? "analytics-outline"
                    : "information-circle-outline"
                }
                size={20}
                color={
                  monthlyProfitQuery.data?.complete
                    ? theme.primary
                    : theme.secondary
                }
              />
            </View>
            <View style={styles.monthlyProfitCopy}>
              <AppText size="small" weight="semibold">
                ESTIMATED PROFIT
              </AppText>
              <AppText size="small" tone="secondary">
                {formatRangeLabel(salesFromDate, salesToDate)}
              </AppText>
            </View>
            <View
              style={[
                styles.profitStatus,
                {
                  backgroundColor:
                    monthlyProfitQuery.isError
                      ? `${theme.danger}18`
                      : monthlyProfitQuery.data?.complete
                        ? `${theme.success}18`
                        : `${theme.secondary}18`,
                },
              ]}
            >
              <AppText
                size="small"
                weight="semibold"
                style={{
                  color: monthlyProfitQuery.isError
                    ? theme.danger
                    : monthlyProfitQuery.data?.complete
                      ? theme.success
                      : theme.secondary,
                }}
              >
                {monthlyProfitQuery.isLoading
                  ? "Calculating"
                  : monthlyProfitQuery.isError
                    ? "Unavailable"
                    : monthlyProfitQuery.data?.complete
                      ? "Estimated"
                      : "Needs records"}
              </AppText>
            </View>
          </View>
          <View style={styles.profitValueBlock}>
            {monthlyProfitQuery.isLoading ? (
              <AppText size="title" weight="semibold">
                Calculating…
              </AppText>
            ) : monthlyProfitQuery.isError ? (
              <AppText size="body" weight="semibold" style={{ color: theme.danger }}>
                Couldn’t calculate profit
              </AppText>
            ) : monthlyProfitQuery.data?.complete &&
              monthlyProfitQuery.data.net_profit !== null ? (
              <AppText
                size="title"
                weight="semibold"
                style={{
                  color:
                    Number(monthlyProfitQuery.data.net_profit) < 0
                      ? theme.danger
                      : theme.success,
                }}
              >
                {formattedMoney(monthlyProfitQuery.data.net_profit)}
              </AppText>
            ) : (
              <AppText size="body" weight="semibold">
                Profit not yet verified
              </AppText>
            )}
            {monthlyProfitQuery.data?.complete &&
            monthlyProfitQuery.data.net_profit !== null ? (
              <AppText size="small" tone="secondary">
                Estimate for this period; actual results may differ.
              </AppText>
            ) : !monthlyProfitQuery.isLoading && !monthlyProfitQuery.isError ? (
              <AppText size="small" tone="secondary">
                {profitabilityIssue}
              </AppText>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              monthlyProfitQuery.data?.complete
                ? "Open profitability report"
                : hasUncostedCurrentStock
                  ? "Add missing stock costs"
                  : "Review profitability records"
            }
            onPress={() =>
              router.push(
                monthlyProfitQuery.data?.complete
                  ? "/reports"
                  : hasUncostedCurrentStock
                    ? "/reports/stock-costing"
                    : "/reports",
              )
            }
            style={({ pressed }) => [
              styles.profitAction,
              {
                backgroundColor: theme.primary,
                opacity: pressed ? 0.88 : 1,
                transform: [{ scale: pressed ? 0.99 : 1 }],
              },
            ]}
          >
            <AppText size="small" weight="semibold" style={{ color: theme.onPrimary }}>
              {monthlyProfitQuery.data?.complete
                ? "Open profitability report"
                : hasUncostedCurrentStock
                  ? "Add missing stock costs"
                  : "Review missing records"}
            </AppText>
            <Ionicons name="arrow-forward" size={17} color={theme.onPrimary} />
          </Pressable>
        </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(500).duration(280)} style={styles.footerLinks}>
          <DashboardShortcut
            icon="bar-chart-outline"
            label="Financial reports"
            detail="Sales, expenses and profitability"
            onPress={() => router.push("/reports")}
          />
          <DashboardShortcut
            icon="alarm-outline"
            label="View reminders"
            detail="Review upcoming and overdue tasks"
            onPress={() => router.push("/reminders" as Href)}
          />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MiniMetric({
  icon,
  label,
  value,
  currency,
  unit,
  loading,
  accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number | string | null | undefined;
  currency?: string;
  unit?: string;
  loading: boolean;
  accent: string;
}) {
  const { theme } = useTheme();
  const numericValue =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : Number.NaN;
  const displayValue =
    Number.isFinite(numericValue)
      ? currency
        ? `${currency} ${new Intl.NumberFormat(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          }).format(numericValue)}`
        : `${new Intl.NumberFormat(undefined, {
            maximumFractionDigits: 0,
          }).format(numericValue)}${unit ? ` ${unit}` : ""}`
      : "—";

  return (
    <View
      style={[
        styles.operationMetric,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
        },
      ]}
    >
      <View style={styles.operationMetricHeading}>
        <View style={[styles.operationMetricIcon, { backgroundColor: `${accent}14` }]}>
          <Ionicons name={icon} size={17} color={accent} />
        </View>
        <AppText
          size="small"
          weight="semibold"
          numberOfLines={2}
          style={styles.operationMetricLabel}
        >
          {label}
        </AppText>
      </View>
      <AppText size="title" weight="semibold" numberOfLines={1} adjustsFontSizeToFit style={styles.operationValue}>
        {loading ? "…" : displayValue}
      </AppText>
    </View>
  );
}

function RangeOption({
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
      style={({ pressed }) => [
        styles.rangeOption,
        {
          backgroundColor: selected ? theme.primary : "transparent",
          borderColor: selected ? theme.primary : theme.border,
          opacity: pressed ? 0.82 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
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

function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.sectionHeading}>
      <AppText size="body" weight="semibold" style={styles.sectionTitle}>
        {title}
      </AppText>
      {detail ? (
        <AppText size="small" tone="secondary">
          {detail}
        </AppText>
      ) : null}
    </View>
  );
}

function QuickAction({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        {
          backgroundColor: theme.primary,
          opacity: pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.975 : 1 }],
        },
      ]}
    >
      <View style={[styles.quickActionIcon, { backgroundColor: `${theme.onPrimary}24` }]}>
        <Ionicons name={icon} size={17} color={theme.onPrimary} />
      </View>
      <View style={styles.quickActionCopy}>
        <AppText
          size="small"
          weight="semibold"
          numberOfLines={1}
          style={[styles.quickActionLabel, { color: theme.onPrimary }]}
        >
          {label}
        </AppText>
        <AppText
          size="small"
          numberOfLines={1}
          style={[styles.quickActionDetail, { color: `${theme.onPrimary}CC` }]}
        >
          {detail}
        </AppText>
      </View>
    </Pressable>
  );
}

function ComparisonBar({
  label,
  amount,
  max,
  currency,
  color,
}: {
  label: string;
  amount: number;
  max: number;
  currency: string;
  color: string;
}) {
  return (
    <View style={styles.comparisonRow}>
      <AppText size="small" tone="secondary" style={styles.comparisonLabel}>
        {label}
      </AppText>
      <View style={styles.comparisonTrack}>
        <View
          style={[
            styles.comparisonFill,
            { width: toPercent((amount / max) * 100), backgroundColor: color },
          ]}
        />
      </View>
      <AppText size="small" weight="semibold" style={styles.comparisonValue}>
        {formatCompactMoney(amount, currency)}
      </AppText>
    </View>
  );
}

function DashboardLink({
  icon,
  title,
  detail,
  status,
  priority,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  status?: string;
  priority: "urgent" | "action" | "upcoming";
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const accent =
    priority === "urgent"
      ? theme.danger
      : priority === "action"
        ? theme.secondary
        : theme.primary;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.dashboardLink,
        {
          borderColor: `${accent}55`,
          backgroundColor: `${accent}0D`,
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}
    >
      <View
        style={[
          styles.attentionIcon,
          { backgroundColor: `${accent}1A` },
        ]}
      >
        <Ionicons name={icon} size={19} color={accent} />
      </View>
      <View style={styles.linkCopy}>
        <AppText size="small" weight="semibold">
          {title}
        </AppText>
        <AppText
          size="small"
          tone="secondary"
          numberOfLines={priority === "urgent" ? 4 : 3}
        >
          {detail}
        </AppText>
      </View>
      {status ? (
        <View
          style={[
            styles.attentionStatus,
            { backgroundColor: `${accent}1A` },
          ]}
        >
          <AppText size="small" weight="semibold" style={{ color: accent }}>
            {status}
          </AppText>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={accent} />
    </Pressable>
  );
}

function DashboardShortcut({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.dashboardShortcut,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}
    >
      <View
        style={[
          styles.shortcutIcon,
          { backgroundColor: theme.backgroundSelected },
        ]}
      >
        <Ionicons name={icon} size={20} color={theme.primary} />
      </View>
      <View style={styles.shortcutCopy}>
        <AppText size="body" weight="semibold">
          {label}
        </AppText>
        <AppText size="small" tone="secondary">
          {detail}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={19} color={theme.textSecondary} />
    </Pressable>
  );
}

function dateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function getDashboardRange(
  preset: Exclude<DashboardRangePreset, "custom">,
  today: string,
): { from: string; to: string } {
  if (preset === "today") return { from: today, to: today };
  if (preset === "month") return { from: monthStart(today), to: today };
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  return { from: addDays(today, -daysSinceMonday), to: today };
}

function getDashboardRangeTitle(preset: DashboardRangePreset): string {
  switch (preset) {
    case "today":
      return "Today";
    case "week":
      return "Week";
    case "month":
      return "Month";
    case "custom":
      return "Selected period";
  }
}

function getPreviousDateRange(
  fromDate: string,
  toDate: string,
): { from: string; to: string } {
  const start = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) {
    return { from: fromDate, to: toDate };
  }
  const duration = Math.max(
    0,
    Math.floor((end.valueOf() - start.valueOf()) / 86_400_000),
  );
  const previousEnd = new Date(start.valueOf() - 86_400_000);
  const previousStart = new Date(
    previousEnd.valueOf() - duration * 86_400_000,
  );
  return {
    from: previousStart.toISOString().slice(0, 10),
    to: previousEnd.toISOString().slice(0, 10),
  };
}

function daysBetween(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T12:00:00Z`).getTime();
  const to = new Date(`${toDate}T12:00:00Z`).getTime();
  return Math.floor((to - from) / 86_400_000);
}

function buildSalesTrend(
  fromDate: string,
  toDate: string,
  daily: { day: string; sales_total: number | string }[],
  today: string,
): { day: string; label: string; value: number; isToday: boolean }[] {
  const dailySales = new Map(
    daily.map((item) => [item.day, Number(item.sales_total)]),
  );
  const rangeLength = daysBetween(fromDate, toDate) + 1;
  const dailyView = rangeLength <= 90;
  const bucketCount = dailyView ? rangeLength : Math.ceil(rangeLength / 7);

  return Array.from({ length: bucketCount }, (_, index) => {
    const day = addDays(fromDate, dailyView ? index : index * 7);
    const bucketLength = dailyView
      ? 1
      : Math.min(7, rangeLength - index * 7);
    const value = Array.from({ length: bucketLength }, (_unused, offset) =>
      Number(dailySales.get(addDays(day, offset)) ?? 0),
    ).reduce((total, amount) => total + amount, 0);
    const label = dailyView
      ? rangeLength > 14
        ? String(Number(day.slice(-2)))
        : formatDayLabel(day)
      : new Intl.DateTimeFormat(undefined, {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${day}T12:00:00Z`));
    return {
      day,
      label,
      value,
      isToday: dailyView && day === today,
    };
  });
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function formatReminderDate(value: string, timezone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

function formatDayLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatRangeLabel(fromDate: string, toDate: string): string {
  const date = (value: string) => new Date(`${value}T12:00:00Z`);
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(date(value));
  if (fromDate === toDate) {
    const weekday = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      timeZone: "UTC",
    }).format(date(fromDate));
    return `${weekday}, ${formatDate(fromDate)}`;
  }
  return `${formatDate(fromDate)} – ${formatDate(toDate)}`;
}

function formatCompactMoney(value: number, currency: string): string {
  const compact = new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
  return `${currency} ${compact}`;
}

function toPercent(value: number): `${number}%` {
  return `${Math.min(100, Math.max(0, value))}%`;
}

function getProfitabilityIssue(reasons: string[]): string {
  const reason = reasons[0]?.toLowerCase() ?? "";
  if (reason.includes("products still on hand")) {
    return "Some stock you still have needs a purchase or production cost.";
  }
  if (reason.includes("sale, consumption, or loss")) {
    return "A sale, product use, or loss is missing its inventory record or cost.";
  }
  if (reason.includes("egg production")) {
    return "Feed or other costs for egg production are missing.";
  }
  if (reason.includes("egg inventory ledger")) {
    return "Egg stock records do not match recorded collections, sales and losses.";
  }
  if (reason.includes("current chicken batch stock")) {
    return "Some live chickens are missing from the stock cost records.";
  }
  return "Some stock or production costs are missing from your records.";
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 16,
    paddingBottom: 160,
  },
  farmPicker: { gap: 8 },
  periodSelector: {
    gap: 14,
    padding: 15,
    borderWidth: 1,
    borderRadius: 18,
  },
  periodHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  periodTitleGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  periodIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  periodHeadingCopy: { flex: 1, gap: 2 },
  periodOptions: { flexDirection: "row", gap: 7 },
  periodDateFilters: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 2,
  },
  sectionHeading: {
    gap: 2,
    paddingHorizontal: 0,
    marginTop: 7,
    marginBottom: -3,
  },
  sectionTitle: { fontSize: 16, lineHeight: 22 },
  sectionCard: { gap: 8, borderRadius: 14 },
  periodTotalsSection: { gap: 10 },
  monthlyProfitCard: {
    gap: 14,
    padding: 15,
    borderWidth: 1,
    borderRadius: 17,
  },
  profitIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  profitHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  monthlyProfitCopy: { flex: 1, gap: 3, minWidth: 0 },
  profitStatus: {
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  profitValueBlock: { gap: 5, paddingLeft: 2 },
  profitAction: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  errorCard: { gap: 7, borderRadius: 14 },
  allCaughtUp: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderRadius: 15,
  },
  todayPanel: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 17,
    overflow: "hidden",
  },
  todaySales: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  todaySalesHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  todaySalesLabel: { flexDirection: "row", alignItems: "center", gap: 7 },
  accentDot: { width: 8, height: 8, borderRadius: 4 },
  comparisonBadge: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 15,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  salesTotal: { fontSize: 34, lineHeight: 41, letterSpacing: -0.7 },
  salesBreakdown: {
    gap: 0,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#80808040",
  },
  salesBreakdownItem: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  salesLegendLabel: { flexDirection: "row", alignItems: "center", gap: 5 },
  salesLegendDot: { width: 8, height: 8, borderRadius: 4 },
  salesDivider: { height: StyleSheet.hairlineWidth },
  salesDefinition: { fontSize: 12, lineHeight: 17 },
  operationsStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  operationMetric: {
    flexGrow: 1,
    flexBasis: "45%",
    minWidth: 145,
    minHeight: 112,
    justifyContent: "space-between",
    gap: 12,
    padding: 13,
    borderWidth: 1,
    borderRadius: 15,
  },
  operationMetricHeading: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  operationMetricIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  operationMetricLabel: { flex: 1, minWidth: 0 },
  operationValue: { fontSize: 19, fontVariant: ["tabular-nums"] },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  quickAction: {
    flexGrow: 1,
    flexBasis: "46%",
    minWidth: 145,
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 11,
    borderRadius: 15,
  },
  quickActionIcon: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
  },
  quickActionCopy: { flex: 1, minWidth: 0, gap: 3 },
  quickActionLabel: { minWidth: 0 },
  quickActionDetail: { fontSize: 11, opacity: 0.9 },
  dashboardLink: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderRadius: 14,
  },
  attentionIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  linkCopy: { flex: 1, minWidth: 0, gap: 3 },
  attentionStatus: {
    maxWidth: 90,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  attentionList: { gap: 9 },
  attentionSection: { gap: 8 },
  attentionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  attentionHeadingCopy: { flex: 1, gap: 0 },
  seeAllAttention: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  chartHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chartIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  chartTitle: { flex: 1, gap: 3 },
  chartContent: { gap: 10 },
  rangeOption: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    borderWidth: 1,
    alignItems: "center",
    borderRadius: 9,
    paddingHorizontal: 5,
  },
  dateField: { flex: 1 },
  chartCard: {
    gap: 10,
    borderWidth: 1,
    borderRadius: 15,
    padding: 14,
    overflow: "hidden",
  },
  chartMeta: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  comparisonChart: { gap: 7, paddingVertical: 2 },
  comparisonRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  comparisonLabel: { width: 82 },
  comparisonTrack: {
    height: 7,
    flex: 1,
    overflow: "hidden",
    borderRadius: 4,
    backgroundColor: "#80808020",
  },
  comparisonFill: { height: "100%", borderRadius: 4 },
  comparisonValue: { width: 76, textAlign: "right" },
  chartState: { minHeight: 48, justifyContent: "center", paddingHorizontal: 3 },
  chartBars: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    height: 124,
  },
  chartDay: { width: 48, alignItems: "center", justifyContent: "flex-end", gap: 5 },
  chartValue: { height: 18, justifyContent: "center" },
  chartTrack: {
    width: 20,
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "hidden",
    borderRadius: 5,
    backgroundColor: "#80808018",
  },
  chartBar: { width: "100%", minHeight: 3, borderRadius: 5 },
  chartLink: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  poultrySummary: {
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  poultryMetric: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  poultryCopy: { flex: 1, gap: 1 },
  reviewEggsAction: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  poultryDivider: { height: StyleSheet.hairlineWidth, marginLeft: 28 },
  inventoryLink: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 5,
  },
  activityHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  activityActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  activityAction: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 10,
    paddingHorizontal: 7,
  },
  activityList: { gap: 8 },
  emptyState: {
    gap: 4,
    padding: 14,
    borderRadius: 13,
    backgroundColor: "#80808010",
  },
  footerLinks: { gap: 10, paddingTop: 4 },
  dashboardShortcut: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 15,
  },
  shortcutIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  shortcutCopy: { flex: 1, gap: 3 },
});
