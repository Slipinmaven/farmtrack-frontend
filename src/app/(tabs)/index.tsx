import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as React from "react";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
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

type SalesRangePreset = "7days" | "30days" | "custom";

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
  const [salesRangePreset, setSalesRangePreset] =
    React.useState<SalesRangePreset>("7days");
  const [salesFromDate, setSalesFromDate] = React.useState(() => addDays(today, -6));
  const [salesToDate, setSalesToDate] = React.useState(today);
  const [showSalesDates, setShowSalesDates] = React.useState(false);
  const [showActivity, setShowActivity] = React.useState(false);
  const yesterday = addDays(today, -1);
  const salesRangeValid = salesFromDate <= salesToDate;
  const flockQuery = useChickenSaleOptions(user?.id, farmId);
  const eggsQuery = useEggCollectionOptions(user?.id, farmId);
  const eggCollectionsQuery = useEggCollections(user?.id, farmId, {
    from_datetime: zonedDateTimeToUtc(yesterday, "00:00:00", timezone),
    to_datetime: zonedDateTimeToUtc(today, "23:59:59", timezone),
  });
  const salesTodayQuery = useSalesReport(user?.id, farmId, {
    from_date: today,
    to_date: today,
    status: "completed",
    offset: 0,
    limit: 1,
  });
  const weeklySalesQuery = useSalesReport(user?.id, farmId, {
    from_date: salesFromDate,
    to_date: salesToDate,
    status: "completed",
    include_daily: true,
    offset: 0,
    limit: 1,
  }, salesRangeValid);
  const expensesQuery = useExpenseSummary(user?.id, farmId, {
    from_date: today,
    to_date: today,
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
  const collectedToday = (eggCollectionsQuery.data ?? [])
    .filter(
      (collection) =>
        collection.entry_type === "collection" &&
        dateInTimezone(new Date(collection.collected_at), timezone) === today,
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
    weeklySalesQuery.data?.daily ?? [],
    today,
  );
  const salesTrendMax = Math.max(1, ...salesTrend.map((item) => item.value));
  const salesTrendTotal = salesTrend.reduce((sum, item) => sum + item.value, 0);

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
  const todaySales = salesTodayQuery.data?.summary;
  const todayExpenses = expensesQuery.data;
  const queryErrors = [
    salesTodayQuery.isError && "Sales",
    expensesQuery.isError && "Expenses",
    eggCollectionsQuery.isError && "Egg collection",
    flockQuery.isError && "Flock",
    weeklySalesQuery.isError && "Sales trend",
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
      <ScrollView contentContainerStyle={styles.content}>
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
          <View style={[styles.dateBadge, { backgroundColor: theme.backgroundElement }]}>
            <Ionicons name="calendar-clear-outline" size={15} color={theme.primary} />
            <AppText size="small" weight="semibold">
              Today
            </AppText>
          </View>
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
                void salesTodayQuery.refetch();
                void weeklySalesQuery.refetch();
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
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/(tabs)/sales",
                params: { from_date: today, to_date: today },
              })
            }
            style={styles.todaySales}
          >
            <View style={styles.todaySalesHeading}>
              <View style={styles.todaySalesLabel}>
                <View style={[styles.accentDot, { backgroundColor: theme.primary }]} />
                <AppText size="small" weight="semibold" tone="secondary">
                  SALES TODAY
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
              {salesTodayQuery.isLoading
                ? "…"
                : salesTodayQuery.isError
                  ? "Unavailable"
                  : formattedMoney(todaySales?.sales_total ?? 0)}
            </AppText>
            <View style={styles.salesBreakdown}>
              <View style={styles.salesBreakdownItem}>
                <AppText size="small" tone="secondary">Received</AppText>
                <AppText size="small" weight="semibold">
                  {salesTodayQuery.isLoading || salesTodayQuery.isError
                    ? "—"
                    : formattedMoney(todaySales?.amount_received ?? 0)}
                </AppText>
              </View>
              <View style={[styles.salesDivider, { backgroundColor: theme.border }]} />
              <View style={styles.salesBreakdownItem}>
                <AppText size="small" tone="secondary">Still owed</AppText>
                <AppText size="small" weight="semibold">
                  {salesTodayQuery.isLoading || salesTodayQuery.isError
                    ? "—"
                    : formattedMoney(todaySales?.balance_due ?? 0)}
                </AppText>
              </View>
              <AppText size="small" tone="secondary" style={styles.salesDefinition}>
                Sales are not the same as cash collected.
              </AppText>
            </View>
          </Pressable>
        </View>

        <SectionHeading title="Today's operations" />
        <View
          style={[
            styles.operationsStrip,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}
        >
          <MiniMetric
            icon="receipt-outline"
            label="Expenses"
            value={expensesQuery.isError ? null : todayExpenses?.total_amount}
            currency={currency}
            loading={expensesQuery.isLoading}
            accent={theme.secondary}
          />
          <View style={[styles.operationDivider, { backgroundColor: theme.border }]} />
          <MiniMetric
            icon="egg-outline"
            label="Eggs collected"
            value={eggCollectionsQuery.isError ? null : collectedToday}
            unit="eggs"
            loading={eggCollectionsQuery.isLoading}
            accent={theme.success}
          />
          <View style={[styles.operationDivider, { backgroundColor: theme.border }]} />
          <MiniMetric
            icon="leaf-outline"
            label="Live flock"
            value={flockQuery.isError ? null : liveBirds}
            unit="birds"
            loading={flockQuery.isLoading}
            accent={theme.primary}
          />
        </View>

        <SectionHeading title="Month-to-date profitability" />
        <View
          style={[
            styles.monthlyProfitCard,
            { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
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
        <View
          style={[
            styles.actionGrid,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}
        >
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
        <View style={styles.attentionList}>
          {notificationsQuery.isError ? (
            <AppText size="small" style={{ color: theme.danger }}>
              Notifications couldn’t be checked.
            </AppText>
          ) : Number(notificationsQuery.data ?? 0) > 0 ? (
            <DashboardLink
              icon="notifications-outline"
              title="Unread farm updates"
              detail={`${notificationsQuery.data} ${Number(notificationsQuery.data) === 1 ? "update" : "updates"} to review`}
              onPress={() => router.push("/notifications")}
            />
          ) : null}
          {nearCapacityBlocks.length > 0 ? (
            <DashboardLink
              icon="warning-outline"
              title="Blocks at capacity"
              detail={nearCapacityBlocks.map((block) => block.name).join(", ")}
              onPress={() => router.push("/(tabs)/blocks")}
              warning
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
              onPress={() =>
                firstOverdueReminder
                  ? router.push({
                      pathname: "/reminders/[reminderId]",
                      params: { reminderId: firstOverdueReminder.id },
                    })
                  : router.push("/notifications")
              }
              warning
            />
          ) : pendingReminders.length > 0 ? (
            <DashboardLink
              icon="calendar-outline"
              title="Upcoming reminder"
              detail={`${pendingReminders[0].title} · ${formatReminderDate(pendingReminders[0].due_at, timezone)}`}
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
              Completed sales
            </AppText>
          </View>
          {weeklySalesQuery.data ? (
            <AppText size="small" weight="semibold">
              {formatCompactMoney(salesTrendTotal, currency)}
            </AppText>
          ) : null}
        </View>
        <View style={styles.rangeControls}>
          <RangeOption
            label="7 days"
            selected={salesRangePreset === "7days"}
            onPress={() => {
              setSalesRangePreset("7days");
              setSalesFromDate(addDays(today, -6));
              setSalesToDate(today);
              setShowSalesDates(false);
            }}
          />
          <RangeOption
            label="30 days"
            selected={salesRangePreset === "30days"}
            onPress={() => {
              setSalesRangePreset("30days");
              setSalesFromDate(addDays(today, -29));
              setSalesToDate(today);
              setShowSalesDates(false);
            }}
          />
          <RangeOption
            label="Custom"
            selected={salesRangePreset === "custom"}
            onPress={() => {
              setSalesRangePreset("custom");
              setShowSalesDates(true);
            }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showSalesDates }}
          onPress={() => {
            setSalesRangePreset("custom");
            setShowSalesDates((visible) => !visible);
          }}
          style={styles.rangeDateToggle}
        >
          <Ionicons name="calendar-outline" size={15} color={theme.primary} />
          <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
            {formatRangeLabel(salesFromDate, salesToDate)}
          </AppText>
          <Ionicons
            name={showSalesDates ? "chevron-up" : "chevron-down"}
            size={15}
            color={theme.primary}
          />
        </Pressable>
        {showSalesDates ? (
          <View style={styles.dateFilters}>
            <DatePickerField
              label="From"
              value={salesFromDate}
              maximumDate={salesToDate ? new Date(`${salesToDate}T12:00:00`) : new Date(`${today}T12:00:00`)}
              onChange={setSalesFromDate}
              style={styles.dateField}
            />
            <DatePickerField
              label="To"
              value={salesToDate}
              minimumDate={salesFromDate ? new Date(`${salesFromDate}T12:00:00`) : undefined}
              maximumDate={new Date(`${today}T12:00:00`)}
              onChange={setSalesToDate}
              style={styles.dateField}
            />
          </View>
        ) : null}
        {!salesRangeValid ? (
          <AppText size="small" style={{ color: theme.danger }}>
            Choose a start date on or before the end date.
          </AppText>
        ) : weeklySalesQuery.isLoading ? (
          <LoadingState label="Loading sales trend" />
        ) : weeklySalesQuery.isError ? (
          <View style={styles.chartState}>
            <AppText size="small" tone="secondary">
              The sales trend couldn’t be loaded.
            </AppText>
            <Button
              label="Retry"
              variant="quiet"
              onPress={() => void weeklySalesQuery.refetch()}
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
            { backgroundColor: theme.backgroundSelected },
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
          <Button
            label="Financial reports"
            variant="secondary"
            onPress={() => router.push("/reports")}
          />
          <Button
            label="View reminders"
            variant="quiet"
            onPress={() => router.push("/notifications")}
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
        <Ionicons name={icon} size={16} color={accent} />
        <AppText size="small" tone="secondary" numberOfLines={1}>
          {label}
        </AppText>
      </View>
      <AppText
        size="body"
        weight="semibold"
        numberOfLines={1}
        adjustsFontSizeToFit
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
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.quickAction,
        { backgroundColor: "transparent" },
      ]}
    >
      <View style={[styles.quickActionIcon, { backgroundColor: `${accent}1A` }]}>
        <Ionicons name={icon} size={19} color={accent} />
      </View>
      <AppText size="small" weight="semibold" numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

function DashboardLink({
  icon,
  title,
  detail,
  onPress,
  warning = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  onPress: () => void;
  warning?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.dashboardLink, { borderBottomColor: theme.border }]}
    >
      <Ionicons
        name={icon}
        size={19}
        color={warning ? theme.secondary : theme.primary}
      />
      <View style={styles.linkCopy}>
        <AppText size="small" weight="semibold">
          {title}
        </AppText>
        <AppText size="small" tone="secondary" numberOfLines={2}>
          {detail}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
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
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 13,
    paddingBottom: 32,
  },
  farmPicker: { gap: 8 },
  greeting: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 2,
  },
  greetingCopy: { gap: 0 },
  dateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 18,
  },
  sectionHeading: {
    gap: 2,
    paddingHorizontal: 2,
    marginTop: 7,
    marginBottom: -4,
  },
  sectionTitle: { fontSize: 17, lineHeight: 23 },
  sectionCard: { gap: 4, borderRadius: 14 },
  monthlyProfitCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    minHeight: 84,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  profitIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  monthlyProfitCopy: { flex: 1, gap: 2, minWidth: 0 },
  profitAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    paddingLeft: 2,
  },
  errorCard: { gap: 7, borderRadius: 14 },
  todayPanel: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: "hidden",
  },
  todaySales: {
    gap: 7,
    paddingHorizontal: 15,
    paddingTop: 12,
    paddingBottom: 13,
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
    gap: 12,
    paddingTop: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#80808040",
  },
  salesBreakdownItem: { flex: 1, gap: 1, minWidth: 0 },
  salesDivider: { width: StyleSheet.hairlineWidth, height: 28 },
  salesDefinition: { flex: 1, fontSize: 11, lineHeight: 15, textAlign: "right" },
  operationsStrip: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: 1,
    borderRadius: 15,
    paddingVertical: 11,
    paddingHorizontal: 8,
  },
  operationMetric: { flex: 1, minWidth: 0, justifyContent: "center", gap: 4, paddingHorizontal: 5 },
  operationMetricHeading: { flexDirection: "row", alignItems: "center", gap: 5 },
  operationDivider: { width: StyleSheet.hairlineWidth, marginVertical: 2 },
  actionGrid: {
    flexDirection: "row",
    gap: 7,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 5,
    paddingVertical: 5,
  },
  quickAction: {
    flex: 1,
    minHeight: 70,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 2,
    borderRadius: 13,
  },
  quickActionIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  dashboardLink: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  linkCopy: { flex: 1, gap: 2 },
  attentionList: { paddingHorizontal: 4 },
  clearState: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  chartHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 2,
  },
  chartTitle: { flex: 1, gap: 1 },
  rangeControls: { flexDirection: "row", gap: 7, marginTop: -5 },
  rangeOption: {
    minHeight: 31,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 11,
  },
  rangeDateToggle: {
    minHeight: 32,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: -8,
  },
  dateFilters: { flexDirection: "row", gap: 10, marginTop: -3 },
  dateField: { flex: 1 },
  chartCard: {
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
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
  poultrySummary: { borderRadius: 14, paddingHorizontal: 12 },
  poultryMetric: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  poultryCopy: { flex: 1, gap: 1 },
  poultryDivider: { height: StyleSheet.hairlineWidth, marginLeft: 28 },
  inventoryLink: {
    minHeight: 38,
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
  footerLinks: { gap: 8, paddingTop: 4 },
});
