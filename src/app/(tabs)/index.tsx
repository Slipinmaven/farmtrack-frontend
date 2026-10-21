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
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { FarmSelector } from "@/features/farms/components/farm-selector";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { useEggCollectionOptions, useEggCollections } from "@/features/eggs/hooks";
import { useChickenSaleOptions } from "@/features/chickens/hooks";
import {
  useExpenseSummary,
  useFarmActivities,
  useProfitabilityReport,
  useUnreadNotificationCount,
} from "@/features/management/hooks";
import { useReminders } from "@/features/reminders/hooks";
import { useSalesReport } from "@/features/sales/hooks";
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
  const [showActivity, setShowActivity] = React.useState(false);
  const salesRangeValid =
    salesFromDate <= salesToDate && salesToDate <= today;
  const flockQuery = useChickenSaleOptions(user?.id, farmId);
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
  const expensesQuery = useExpenseSummary(user?.id, farmId, {
    from_date: salesFromDate,
    to_date: salesToDate,
  });
  const monthlyProfitQuery = useProfitabilityReport(user?.id, farmId, {
    from_date: monthStart(today),
    to_date: today,
  });
  const notificationsQuery = useUnreadNotificationCount(user?.id, farmId);
  const remindersQuery = useReminders(user?.id, farmId);
  const activityQuery = useFarmActivities(
    user?.id,
    farmId,
    "",
    undefined,
    undefined,
    undefined,
  );
  const isRefreshing =
    salesRangeQuery.isRefetching ||
    expensesQuery.isRefetching ||
    monthlyProfitQuery.isRefetching ||
    eggCollectionsQuery.isRefetching ||
    flockQuery.isRefetching ||
    eggsQuery.isRefetching ||
    notificationsQuery.isRefetching ||
    remindersQuery.isRefetching ||
    activityQuery.isRefetching;

  const flock = flockQuery.data;
  const liveBirds = (flock?.batches ?? []).reduce(
    (total, batch) =>
      total + batch.stocks.reduce((batchTotal, stock) => batchTotal + stock.quantity, 0),
    0,
  );
  const nearCapacityBlocks = (flock?.blocks ?? []).filter(
    (block) =>
      block.maximum_chickens > 0 &&
      block.current_chickens >= block.maximum_chickens,
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
      expensesQuery.refetch(),
      monthlyProfitQuery.refetch(),
      eggCollectionsQuery.refetch(),
      flockQuery.refetch(),
      eggsQuery.refetch(),
      notificationsQuery.refetch(),
      remindersQuery.refetch(),
      activityQuery.refetch(),
    ]);
  }

  if (farm.status === "inactive") {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.background }}
        edges={["top"]}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <FarmPageHeader title="Farm overview" />
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

  const greeting = greetingInTimezone(now, timezone);
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: timezone,
  }).format(now);
  const periodSales = salesRangeQuery.data?.summary;
  const periodExpenses = expensesQuery.data;
  const periodTitle = getDashboardRangeTitle(dashboardRangePreset);
  const queryErrors = [
    salesRangeQuery.isError && "Sales",
    expensesQuery.isError && "Expenses",
    eggCollectionsQuery.isError && "Egg collection",
    flockQuery.isError && "Flock",
    eggsQuery.isError && "Egg stock",
  ].filter(Boolean);
  const pendingReminders = reminders.filter(
    (reminder) => new Date(reminder.due_at).getTime() >= now.getTime(),
  );
  const overdueReminders = reminders.length - pendingReminders.length;
  const firstOverdueReminder = reminders.find(
    (reminder) => new Date(reminder.due_at).getTime() < now.getTime(),
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
        <FarmPageHeader title="Farm overview" />

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

        <View style={styles.greeting}>
          <View style={styles.greetingCopy}>
            <AppText size="heading" weight="semibold">
              {greeting}
            </AppText>
            <AppText size="small" tone="secondary">
              {dateLabel}
            </AppText>
          </View>
        </View>

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
            <Ionicons name="options-outline" size={18} color={theme.textSecondary} />
          </View>
          <View style={styles.periodOptions}>
            <RangeOption
              label="Today"
              selected={dashboardRangePreset === "today"}
              onPress={() => selectDashboardRange("today")}
            />
            <RangeOption
              label="Week to date"
              selected={dashboardRangePreset === "week"}
              onPress={() => selectDashboardRange("week")}
            />
            <RangeOption
              label="This month"
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
            <View style={styles.periodDateFilters}>
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
            </View>
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

        {queryErrors.length > 0 ? (
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
              onPress={() => {
                void salesRangeQuery.refetch();
                void expensesQuery.refetch();
                void monthlyProfitQuery.refetch();
                void eggCollectionsQuery.refetch();
                void flockQuery.refetch();
                void eggsQuery.refetch();
              }}
            />
          </Card>
        ) : null}

        <View
          style={[
            styles.todayPanel,
            {
              backgroundColor: theme.backgroundElement,
              borderLeftColor: theme.primary,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/(tabs)/sales",
                params: { from_date: salesFromDate, to_date: salesToDate },
              })
            }
            style={styles.todaySales}
          >
            <View style={styles.todaySalesHeading}>
              <View style={styles.todaySalesLabel}>
                <View style={[styles.accentDot, { backgroundColor: theme.primary }]} />
                <AppText size="small" weight="semibold" tone="secondary">
                  SALES {periodTitle.toUpperCase()}
                </AppText>
              </View>
              <Ionicons name="arrow-forward" size={18} color={theme.primary} />
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
            <View style={styles.salesBreakdown}>
              <View style={styles.salesBreakdownItem}>
                <AppText size="small" tone="secondary">Received</AppText>
                <AppText size="small" weight="semibold">
                  {salesRangeQuery.isLoading || salesRangeQuery.isError
                    ? "—"
                    : formattedMoney(periodSales?.amount_received ?? 0)}
                </AppText>
              </View>
              <View style={[styles.salesDivider, { backgroundColor: theme.border }]} />
              <View style={styles.salesBreakdownItem}>
                <AppText size="small" tone="secondary">Still owed</AppText>
                <AppText size="small" weight="semibold">
                  {salesRangeQuery.isLoading || salesRangeQuery.isError
                    ? "—"
                    : formattedMoney(periodSales?.balance_due ?? 0)}
                </AppText>
              </View>
              <AppText size="small" tone="secondary" style={styles.salesDefinition}>
                Sales are not the same as cash collected.
              </AppText>
            </View>
          </Pressable>
        </View>

        <SectionHeading title={`Activity · ${periodTitle}`} />
        <View style={styles.operationsStrip}>
          <MiniMetric
            icon="receipt-outline"
            label="Expenses"
            value={expensesQuery.isError ? null : periodExpenses?.total_amount}
            currency={currency}
            loading={expensesQuery.isLoading}
            accent={theme.secondary}
          />
          <View style={[styles.operationDivider, { backgroundColor: theme.border }]} />
          <MiniMetric
            icon="egg-outline"
            label="Eggs collected"
            value={eggCollectionsQuery.isError ? null : collectedInRange}
            unit="eggs"
            loading={eggCollectionsQuery.isLoading}
            accent={theme.success}
          />
        </View>

        <SectionHeading title="Month-to-date profitability" />
        <View
          style={[
            styles.monthlyProfitCard,
            {
              backgroundColor: theme.backgroundElement,
              borderLeftColor: theme.secondary,
            },
          ]}
        >
          <View style={[styles.profitIcon, { backgroundColor: theme.backgroundElement }]}>
            <Ionicons
              name={monthlyProfitQuery.data?.complete ? "analytics-outline" : "information-circle-outline"}
              size={20}
              color={monthlyProfitQuery.data?.complete ? theme.primary : theme.secondary}
            />
          </View>
          <View style={styles.monthlyProfitCopy}>
            {monthlyProfitQuery.isLoading ? (
              <AppText size="body" weight="semibold">
                Calculating profit or loss…
              </AppText>
            ) : monthlyProfitQuery.isError ? (
              <AppText size="body" weight="semibold" style={{ color: theme.danger }}>
                Profitability could not be loaded
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
              <>
                <AppText size="body" weight="semibold">
                  Profit is not verified
                </AppText>
                <AppText size="small" tone="secondary">
                  {profitabilityIssue}
                </AppText>
              </>
            )}
            {monthlyProfitQuery.data?.complete &&
            monthlyProfitQuery.data.net_profit !== null ? (
              <AppText size="small" tone="secondary">
                Net profit after sales credits, stock costs, expenses and recorded losses.
              </AppText>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push(
                monthlyProfitQuery.data?.complete
                  ? "/reports"
                  : hasUncostedCurrentStock
                    ? "/reports/stock-costing"
                    : "/reports",
              )
            }
            style={styles.profitAction}
          >
            <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
              {monthlyProfitQuery.data?.complete
                ? "Report"
                : hasUncostedCurrentStock
                  ? "Add costs"
                  : "View report"}
            </AppText>
            <Ionicons name="chevron-forward" size={16} color={theme.primary} />
          </Pressable>
        </View>

        <SectionHeading title="Quick actions" />
        <View style={styles.actionGrid}>
          <QuickAction
            icon="cart-outline"
            label="Egg sale"
            onPress={() => router.push("/egg-sale")}
            accent={theme.primary}
          />
          <QuickAction
            icon="egg-outline"
            label="Collect"
            onPress={() => router.push("/egg-collection")}
            accent={theme.success}
          />
          <QuickAction
            icon="add-circle-outline"
            label="Expense"
            onPress={() => router.push({ pathname: "/expenses", params: { new: "1" } })}
            accent={theme.secondary}
          />
          <QuickAction
            icon="alert-circle-outline"
            label="Loss"
            onPress={() => router.push("/chicken-loss")}
            accent={theme.danger}
          />
        </View>

        <SectionHeading title="Needs attention" />
        <View style={[styles.attentionList, { borderTopColor: theme.border }]}>
          {notificationsQuery.isError ? (
            <AppText size="small" style={{ color: theme.danger }}>
              Notifications couldn’t be checked.
            </AppText>
          ) : Number(notificationsQuery.data ?? 0) > 0 ? (
            <DashboardLink
              icon="notifications-outline"
              title="Unread farm updates"
              detail={`${notificationsQuery.data} ${Number(notificationsQuery.data) === 1 ? "update" : "updates"} to review`}
              status="Review"
              onPress={() => router.push("/notifications")}
            />
          ) : null}
          {nearCapacityBlocks.length > 0 ? (
            <DashboardLink
              icon="warning-outline"
              title="Blocks at capacity"
              detail={nearCapacityBlocks.map((block) => block.name).join(", ")}
              status="At limit"
              onPress={() => router.push("/(tabs)/blocks")}
              critical
            />
          ) : null}
          {remindersQuery.isError ? (
            <AppText size="small" style={{ color: theme.danger }}>
              Reminders couldn’t be checked.
            </AppText>
          ) : overdueReminders > 0 ? (
            <DashboardLink
              icon="time-outline"
              title="Overdue reminders"
              detail={`${overdueReminders} ${overdueReminders === 1 ? "task is" : "tasks are"} overdue`}
              status="Overdue"
              onPress={() =>
                firstOverdueReminder
                  ? router.push({
                      pathname: "/reminders/[reminderId]",
                      params: { reminderId: firstOverdueReminder.id },
                    })
                  : router.push("/notifications")
              }
              critical
            />
          ) : pendingReminders.length > 0 ? (
            <DashboardLink
              icon="calendar-outline"
              title="Upcoming reminder"
              detail={`${pendingReminders[0].title} · ${formatReminderDate(pendingReminders[0].due_at, timezone)}`}
              status="Upcoming"
              onPress={() =>
                router.push({
                  pathname: "/reminders/[reminderId]",
                  params: { reminderId: pendingReminders[0].id },
                })
              }
            />
          ) : null}
          {flockQuery.isError ? (
            <AppText size="small" style={{ color: theme.danger }}>
              Block capacity alerts couldn’t be checked.
            </AppText>
          ) : null}
          {notificationsQuery.isLoading ||
          remindersQuery.isLoading ||
          flockQuery.isLoading ? (
            <AppText size="small" tone="secondary">
              Checking farm tasks…
            </AppText>
          ) : null}
          {!notificationsQuery.isLoading &&
          !remindersQuery.isLoading &&
          !flockQuery.isLoading &&
          !flockQuery.isError &&
          !notificationsQuery.isError &&
          !remindersQuery.isError &&
          Number(notificationsQuery.data ?? 0) === 0 &&
          nearCapacityBlocks.length === 0 &&
          reminders.length === 0 ? (
            <View style={styles.clearState}>
              <Ionicons name="checkmark-circle-outline" size={18} color={theme.success} />
              <AppText size="small" tone="secondary">
                All clear
              </AppText>
            </View>
          ) : null}
        </View>

        <View style={styles.chartHeading}>
          <View style={styles.chartTitle}>
            <AppText size="heading" weight="semibold">
              Sales trend
            </AppText>
            <AppText size="small" tone="secondary">
              Completed sales · {periodTitle.toLowerCase()}
            </AppText>
          </View>
          {salesRangeQuery.data ? (
            <AppText size="small" weight="semibold">
              {formatCompactMoney(salesTrendTotal, currency)}
            </AppText>
          ) : null}
        </View>
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={salesTrend.length > 10}
            >
            <View
              style={[
                styles.chartBars,
                { width: Math.max(salesTrend.length * 42, 280) },
              ]}
            >
              {salesTrend.map((item, index) => (
                <View key={item.day} style={styles.chartDay}>
                  <View style={styles.chartValue}>
                    <AppText size="small" tone="secondary" numberOfLines={1}>
                      {salesRangeDays > 14 && index % 3 !== 0
                        ? ""
                        : formatCompactNumber(item.value)}
                    </AppText>
                  </View>
                  <View style={styles.chartTrack}>
                    <View
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

        <SectionHeading title="Poultry" />
        <View
          style={[
            styles.poultrySummary,
            { borderColor: theme.border },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(tabs)/flock")}
            style={styles.poultryMetric}
          >
            <Ionicons name="leaf-outline" size={19} color={theme.primary} />
            <View style={styles.poultryCopy}>
              <AppText size="small" tone="secondary">LIVE FLOCK</AppText>
              <AppText size="body" weight="semibold">
                {flockQuery.isLoading || flockQuery.isError ? "—" : liveBirds.toLocaleString()}
              </AppText>
              <AppText size="small" tone="secondary">
                {flock?.batches.length ?? 0} batches · {flock?.blocks.length ?? 0} blocks
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={15} color={theme.textSecondary} />
          </Pressable>
          <View style={[styles.poultryDivider, { backgroundColor: theme.border }]} />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(tabs)/eggs")}
            style={styles.poultryMetric}
          >
            <Ionicons name="egg-outline" size={19} color={theme.success} />
            <View style={styles.poultryCopy}>
              <AppText size="small" tone="secondary">EGGS AVAILABLE</AppText>
              <AppText size="body" weight="semibold">
                {eggsQuery.isLoading || eggsQuery.isError ? "—" : availableEggs.toLocaleString()}
              </AppText>
              <AppText size="small" tone="secondary">
                Across {(eggsQuery.data?.products ?? []).length} products
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={15} color={theme.textSecondary} />
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/inventory")}
          style={styles.inventoryLink}
        >
          <Ionicons name="cube-outline" size={17} color={theme.primary} />
          <AppText size="small" weight="semibold" style={styles.linkCopy}>
            Feed, equipment & other stock
          </AppText>
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        </Pressable>

        <View style={styles.activityHeading}>
          <SectionHeading title="Recent activity" />
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowActivity((visible) => !visible)}
          >
            <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
              {showActivity ? "Hide" : "View"}
            </AppText>
          </Pressable>
        </View>
        {showActivity ? (
        <View style={styles.activityList}>
          {activityQuery.isLoading ? (
            <AppText size="small" tone="secondary">
              Loading recent activity…
            </AppText>
          ) : activityQuery.isError ? (
            <AppText size="small" style={{ color: theme.danger }}>
              Recent activity couldn’t be loaded.
            </AppText>
          ) : recentActivity.length > 0 ? (
            recentActivity.map((activity) => (
              <DashboardLink
                key={activity.id}
                icon="time-outline"
                title={getActivityLabel(activity.type)}
                detail={getActivityDetail(activity.details) || "Farm record updated"}
                onPress={() =>
                  router.push({
                    pathname: "/activities/[activityId]",
                    params: { activityId: activity.id },
                  })
                }
              />
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
        </View>
        ) : null}

        <View style={styles.footerLinks}>
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
        </View>
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
  const displayValue =
    typeof value === "number" || typeof value === "string"
      ? currency
        ? `${currency} ${new Intl.NumberFormat(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          }).format(Number(value))}`
        : `${new Intl.NumberFormat(undefined, {
            maximumFractionDigits: 0,
          }).format(Number(value))}${unit ? ` ${unit}` : ""}`
      : "—";

  return (
    <View style={styles.operationMetric}>
      <View style={styles.operationMetricHeading}>
        <View style={[styles.operationMetricIcon, { backgroundColor: `${accent}14` }]}>
          <Ionicons name={icon} size={17} color={accent} />
        </View>
        <AppText size="body" weight="semibold" numberOfLines={1}>
          {label}
        </AppText>
      </View>
      <AppText
        size="body"
        weight="semibold"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={styles.operationValue}
      >
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
      style={[
        styles.rangeOption,
        {
          backgroundColor: selected ? theme.primary : "transparent",
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
  accent,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  accent: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        { borderBottomColor: theme.border, opacity: pressed ? 0.65 : 1 },
      ]}
    >
      <View style={[styles.quickActionIcon, { backgroundColor: `${accent}1A` }]}>
        <Ionicons name={icon} size={17} color={accent} />
      </View>
      <AppText
        size="small"
        weight="semibold"
        numberOfLines={1}
        style={styles.quickActionLabel}
      >
        {label}
      </AppText>
      <Ionicons name="chevron-forward" size={15} color={theme.textSecondary} />
    </Pressable>
  );
}

function DashboardLink({
  icon,
  title,
  detail,
  status,
  onPress,
  critical = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  status?: string;
  onPress: () => void;
  critical?: boolean;
}) {
  const { theme } = useTheme();
  const accent = critical ? theme.danger : theme.primary;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.dashboardLink,
        {
          borderColor: `${accent}55`,
          backgroundColor: `${accent}0D`,
          opacity: pressed ? 0.72 : 1,
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
        <AppText size="small" tone="secondary" numberOfLines={2}>
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
          opacity: pressed ? 0.75 : 1,
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
      return "Week to date";
    case "month":
      return "This month";
    case "custom":
      return "Selected period";
  }
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

function zonedDateTimeToUtc(
  date: string,
  time: string,
  timezone: string,
): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second] = time.split(":").map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const zonedParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(desiredUtc));
  const value = (type: string) =>
    Number(zonedParts.find((part) => part.type === type)?.value ?? 0);
  const representedUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  return new Date(desiredUtc - (representedUtc - desiredUtc)).toISOString();
}

function greetingInTimezone(date: Date, timezone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .find((part) => part.type === "hour")?.value ?? 12,
  );
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
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
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00Z`));
  return `${formatDate(fromDate)} – ${formatDate(toDate)}`;
}

function formatCompactMoney(value: number, currency: string): string {
  const compact = new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
  return `${currency} ${compact}`;
}

function getProfitabilityIssue(reasons: string[]): string {
  const reason = reasons[0]?.toLowerCase() ?? "";
  if (reason.includes("products still on hand")) {
    return "Some stock you still have needs a purchase or production cost.";
  }
  if (reason.includes("sale, consumption, or loss")) {
    return "Some past sales, stock use or losses have no recorded cost.";
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
    paddingBottom: 32,
  },
  farmPicker: { gap: 8 },
  greeting: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 2,
  },
  greetingCopy: { gap: 0 },
  periodSelector: {
    gap: 14,
    padding: 14,
    borderWidth: 1,
    borderRadius: 16,
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
  periodOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
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
  sectionCard: { gap: 8, borderRadius: 6 },
  monthlyProfitCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 80,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 4,
    borderLeftWidth: 3,
  },
  profitIcon: {
    width: 28,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  monthlyProfitCopy: { flex: 1, gap: 2, minWidth: 0 },
  profitAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    paddingLeft: 2,
  },
  errorCard: { gap: 7, borderRadius: 6 },
  todayPanel: {
    borderLeftWidth: 3,
    borderRadius: 4,
    overflow: "hidden",
  },
  todaySales: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 15,
  },
  todaySalesHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  todaySalesLabel: { flexDirection: "row", alignItems: "center", gap: 7 },
  accentDot: { width: 7, height: 7, borderRadius: 4 },
  salesTotal: { fontSize: 29, lineHeight: 35, letterSpacing: -0.5 },
  salesBreakdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingTop: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#80808040",
  },
  salesBreakdownItem: { flex: 1, gap: 1, minWidth: 0 },
  salesDivider: { width: StyleSheet.hairlineWidth, height: 28 },
  salesDefinition: { flex: 1, fontSize: 11, lineHeight: 15, textAlign: "right" },
  operationsStrip: {
    flexDirection: "column",
    paddingVertical: 1,
  },
  operationMetric: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  operationMetricHeading: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  operationMetricIcon: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
  },
  operationValue: {
    maxWidth: "52%",
    textAlign: "right",
  },
  operationDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 40,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  quickAction: {
    width: "50%",
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 2,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#80808040",
  },
  quickActionIcon: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
  },
  quickActionLabel: { flex: 1, minWidth: 0 },
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
  clearState: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  chartHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 2,
  },
  chartTitle: { flex: 1, gap: 1 },
  rangeOption: {
    minHeight: 36,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  dateField: { flex: 1 },
  chartCard: {
    gap: 10,
    borderWidth: 1,
    borderRadius: 6,
    padding: 14,
    overflow: "hidden",
  },
  chartMeta: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  chartState: { minHeight: 48, justifyContent: "center", paddingHorizontal: 3 },
  chartBars: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    height: 124,
  },
  chartDay: { width: 34, alignItems: "center", justifyContent: "flex-end", gap: 5 },
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
  activityList: { gap: 3, paddingHorizontal: 4 },
  emptyState: { gap: 4, paddingVertical: 10 },
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
