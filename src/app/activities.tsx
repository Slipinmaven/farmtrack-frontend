import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TextField } from "@/components/ui/text-field";
import type {
  ActivityCategory,
  FarmActivity,
  FarmActivitySummary,
} from "@/features/management/api";
import {
  actionTextTones,
  categoryIcons,
  entityColors,
  getActivityDetail,
  getActivityLabel,
  getEntityLabel,
} from "@/features/management/activity-presentation";
import {
  useFarmActivities,
  useFarmActivitySummary,
} from "@/features/management/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { formatRelativeDate } from "@/lib/date/format-relative-date";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

const categories: {
  label: string;
  value: ActivityCategory | undefined;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { label: "All activities", value: undefined, icon: "list-outline" },
  { label: "Farm", value: "farm", icon: "business-outline" },
  { label: "Housing", value: "housing", icon: "grid-outline" },
  { label: "Contacts", value: "contacts", icon: "people-outline" },
  { label: "Sales", value: "sales", icon: "cart-outline" },
  { label: "Purchases", value: "purchases", icon: "bag-handle-outline" },
  { label: "Flock", value: "flock", icon: "swap-horizontal-outline" },
  { label: "Eggs", value: "eggs", icon: "egg-outline" },
  {
    label: "Inventory",
    value: "inventory",
    icon: "file-tray-stacked-outline",
  },
  { label: "Expenses", value: "expenses", icon: "wallet-outline" },
  { label: "Updates", value: "updates", icon: "notifications-outline" },
];

type ActivityDateRange = {
  from_datetime?: string;
  to_datetime?: string;
};

export default function ActivitiesScreen() {
  const auth = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ category?: string; date?: string }>();
  const initialDate =
    typeof params.date === "string" ? parseLocalDate(params.date) : null;
  const initialDateRange = initialDate ? activityDateRange(initialDate) : {};
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState<ActivityCategory | undefined>(() =>
    isActivityCategory(params.category) ? params.category : undefined,
  );
  const [fromDate, setFromDate] = useState(
    initialDate ? formatLocalDate(initialDate) : "",
  );
  const [toDate, setToDate] = useState(
    initialDate ? formatLocalDate(initialDate) : "",
  );
  const [dateError, setDateError] = useState<string | null>(null);
  const [showDateFilters, setShowDateFilters] = useState(
    () => Boolean(initialDate),
  );
  const [appliedDateRange, setAppliedDateRange] =
    useState<ActivityDateRange>(initialDateRange);
  const activities = useFarmActivities(
    auth.user?.id,
    farm.selectedFarm?.id,
    debouncedSearch,
    category,
    appliedDateRange.from_datetime,
    appliedDateRange.to_datetime,
  );
  const summary = useFarmActivitySummary(
    auth.user?.id,
    farm.selectedFarm?.id,
  );
  const items = activities.data?.pages.flatMap((page) => page.items) ?? [];
  const hasDateFilter = Boolean(
    fromDate || toDate || appliedDateRange.from_datetime || appliedDateRange.to_datetime,
  );

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timeout);
  }, [search]);

  function applyDateRange() {
    const from = fromDate ? parseLocalDate(fromDate) : null;
    const to = toDate ? parseLocalDate(toDate) : null;
    if ((fromDate && !from) || (toDate && !to)) {
      setDateError("Enter dates in YYYY-MM-DD format.");
      return;
    }
    const todayStart = localDayStart(new Date());
    if (
      (from && from.getTime() > todayStart.getTime()) ||
      (to && to.getTime() > todayStart.getTime())
    ) {
      setDateError("Future dates aren’t available.");
      return;
    }
    if (from && to && from.getTime() > to.getTime()) {
      setDateError("From date must be on or before the To date.");
      return;
    }

    setDateError(null);
    setAppliedDateRange({
      from_datetime: from ? localDayStart(from).toISOString() : undefined,
      to_datetime: to ? nextLocalDayStart(to).toISOString() : undefined,
    });
  }

  function clearDateRange() {
    setFromDate("");
    setToDate("");
    setDateError(null);
    setAppliedDateRange({});
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <FarmPageHeader title="Activities" showBack />

        {farm.selectedFarm ? (
          <ActivitySnapshot
            summary={summary.data}
            loading={summary.isLoading}
            error={
              summary.isError
                ? normalizeApiError(summary.error).message
                : null
            }
            onRetry={() => void summary.refetch()}
          />
        ) : null}

        <Card style={styles.filterCard}>
          <View style={styles.filterCardHeading}>
            <View
              style={[
                styles.filterHeadingIcon,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <Ionicons name="search-outline" size={18} color={theme.primary} />
            </View>
            <View style={styles.filterHeadingCopy}>
              <AppText weight="semibold">Find an activity</AppText>
              <AppText size="small" tone="secondary">
                Search or browse by area
              </AppText>
            </View>
          </View>
          <TextField
            label="Search activities"
            placeholder="Name, action, or details"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          <View style={styles.filterSubheading}>
            <AppText size="small" weight="semibold" tone="secondary">
              Browse by area
            </AppText>
            {category ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setCategory(undefined)}
                hitSlop={8}
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
            contentContainerStyle={styles.filters}
          >
            {categories.map((item) => {
              const selected = category === item.value;
              return (
                <Pressable
                  key={item.label}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setCategory(item.value)}
                  style={[
                    styles.filter,
                    {
                      backgroundColor: selected
                        ? theme.primary
                        : theme.backgroundSelected,
                      borderColor: selected ? theme.primary : "transparent",
                    },
                  ]}
                >
                  <View style={styles.filterContent}>
                    <Ionicons
                      name={item.icon}
                      size={15}
                      color={selected ? theme.onPrimary : theme.textSecondary}
                    />
                    <AppText
                      size="small"
                      weight="semibold"
                      style={{ color: selected ? theme.onPrimary : theme.text }}
                    >
                      {item.label}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={[styles.dateFilter, { borderTopColor: theme.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showDateFilters }}
              onPress={() => setShowDateFilters((visible) => !visible)}
              style={styles.dateFilterToggle}
            >
              <View style={styles.dateFilterTitle}>
                <Ionicons
                  name="calendar-outline"
                  size={17}
                  color={hasDateFilter ? theme.primary : theme.textSecondary}
                />
                <AppText size="small" weight="semibold">
                  Date range
                </AppText>
                {hasDateFilter ? (
                  <View
                    style={[
                      styles.activeDateBadge,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                      Active
                    </AppText>
                  </View>
                ) : null}
              </View>
              <Ionicons
                name={showDateFilters ? "chevron-up" : "chevron-down"}
                size={18}
                color={theme.textSecondary}
              />
            </Pressable>
            {showDateFilters ? (
              <View style={styles.dateFilterSection}>
                <View style={styles.dateFields}>
                  <DatePickerField
                    label="From"
                    value={fromDate}
                    onChange={setFromDate}
                    maximumDate={new Date()}
                    style={styles.dateField}
                  />
                  <DatePickerField
                    label="To"
                    value={toDate}
                    onChange={setToDate}
                    maximumDate={new Date()}
                    style={styles.dateField}
                  />
                </View>
                {dateError ? (
                  <AppText size="small" style={{ color: theme.danger }}>
                    {dateError}
                  </AppText>
                ) : null}
                <View style={styles.dateActions}>
                  <Button label="Apply dates" onPress={applyDateRange} />
                  {hasDateFilter ? (
                    <Button
                      label="Clear"
                      variant="secondary"
                      onPress={clearDateRange}
                    />
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        </Card>

        {!farm.selectedFarm ? (
          <Card style={styles.state}>
            <AppText weight="semibold">Choose a farm</AppText>
            <AppText size="small" tone="secondary">
              Select a farm to view its activity history.
            </AppText>
          </Card>
        ) : null}
        {activities.isLoading ? (
          <LoadingState label="Loading activities" />
        ) : null}
        {activities.isError ? (
          <Card style={styles.state}>
            <AppText weight="semibold">Couldn’t load activities</AppText>
            <AppText size="small" tone="secondary">
              {normalizeApiError(activities.error).message}
            </AppText>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => void activities.refetch()}
            />
          </Card>
        ) : null}

        {!activities.isLoading &&
        !activities.isError &&
        farm.selectedFarm &&
        items.length === 0 ? (
          <Card style={styles.state}>
            <AppText weight="semibold">
              {debouncedSearch || category
                ? "No matching activities"
                : "No activities yet"}
            </AppText>
            <AppText size="small" tone="secondary">
              {debouncedSearch || category
                ? "Try a different search or activity type."
                : "Actions recorded for this farm will appear here."}
            </AppText>
          </Card>
        ) : null}

        {items.length > 0 ? (
          <View style={styles.resultsHeading}>
            <View style={styles.resultsTitleCopy}>
              <AppText size="title" weight="semibold">
                Recent activity
              </AppText>
              <AppText size="small" tone="secondary">
                Your farm’s latest recorded actions
              </AppText>
            </View>
            <View
              style={[
                styles.resultsCount,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                {items.length}
              </AppText>
            </View>
          </View>
        ) : null}
        {items.map((activity) => (
          <ActivityCard key={activity.id} activity={activity} />
        ))}

        {activities.hasNextPage ? (
          <Button
            label="Load 20 more"
            variant="secondary"
            loading={activities.isFetchingNextPage}
            disabled={activities.isFetchingNextPage}
            onPress={() => void activities.fetchNextPage()}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (
    year < 1000 ||
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function localDayStart(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function nextLocalDayStart(date: Date): Date {
  const start = localDayStart(date);
  start.setDate(start.getDate() + 1);
  return start;
}

function activityDateRange(date: Date): ActivityDateRange {
  return {
    from_datetime: localDayStart(date).toISOString(),
    to_datetime: nextLocalDayStart(date).toISOString(),
  };
}

function ActivitySnapshot({
  summary,
  loading,
  error,
  onRetry,
}: {
  summary: FarmActivitySummary | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const { theme } = useTheme();
  const breakdown = categories
    .filter(
      (category): category is typeof category & { value: ActivityCategory } =>
        category.value !== undefined,
    )
    .map((category) => ({
      ...category,
      count: summary?.category_counts[category.value] ?? 0,
    }))
    .filter((category) => category.count > 0)
    .sort((left, right) => right.count - left.count);
  const maximumCategoryCount = Math.max(
    1,
    ...breakdown.map((category) => category.count),
  );
  const comparisonMaximum = Math.max(
    1,
    summary?.last_7_days_count ?? 0,
    summary?.previous_7_days_count ?? 0,
  );
  const weekChange = summary
    ? summary.last_7_days_count - summary.previous_7_days_count
    : 0;
  const weekChangeText =
    summary?.previous_7_days_count === 0
      ? summary.last_7_days_count > 0
        ? "New activity in this period"
        : "No activity in either 7-day period"
      : weekChange > 0
        ? `${weekChange} more than the previous 7 days`
        : weekChange < 0
          ? `${Math.abs(weekChange)} fewer than the previous 7 days`
          : "Same as the previous 7 days";

  if (loading) return <LoadingState label="Loading activity snapshot" />;
  if (error || !summary) {
    return (
      <Card style={styles.snapshotError}>
        <AppText weight="semibold">Activity snapshot unavailable</AppText>
        <AppText size="small" tone="secondary">
          {error ?? "The activity summary could not be loaded."}
        </AppText>
        <Button label="Retry snapshot" variant="secondary" onPress={onRetry} />
      </Card>
    );
  }

  const lossesColor =
    summary.losses_and_returns_count > 0
      ? theme.mode === "dark"
        ? "#FF9B91"
        : theme.danger
      : theme.mode === "dark"
        ? "#8FD0A5"
        : theme.success;

  return (
    <Card style={styles.snapshot}>
      <View style={styles.snapshotHeading}>
        <View
          style={[
            styles.snapshotHeadingIcon,
            { backgroundColor: theme.primary },
          ]}
        >
          <Ionicons name="pulse-outline" size={20} color={theme.onPrimary} />
        </View>
        <View style={styles.snapshotHeadingCopy}>
          <AppText weight="semibold">Activity snapshot</AppText>
          <AppText size="small" tone="secondary">
            A quick look at your farm this week
          </AppText>
        </View>
        <View
          style={[
            styles.snapshotPeriodBadge,
            { backgroundColor: theme.backgroundSelected },
          ]}
        >
          <AppText
            size="small"
            weight="semibold"
            style={{ color: theme.primary }}
          >
            7 DAYS
          </AppText>
        </View>
      </View>

      <View style={styles.snapshotStats}>
        <View
          style={[
            styles.snapshotMainMetric,
            { backgroundColor: theme.backgroundSelected },
          ]}
        >
          <AppText size="small" weight="semibold" tone="secondary">
            TOTAL ACTIVITY
          </AppText>
          <AppText style={styles.snapshotValue}>
            {new Intl.NumberFormat().format(summary.last_7_days_count)}
          </AppText>
          <AppText size="small" tone="secondary">
            records this week
          </AppText>
        </View>
        <View
          style={[
            styles.snapshotAttention,
            { backgroundColor: theme.backgroundSelected },
          ]}
        >
          <View
            style={[
              styles.attentionIcon,
              { backgroundColor: `${lossesColor}20` },
            ]}
          >
            <Ionicons
              name="alert-circle-outline"
              size={18}
              color={lossesColor}
            />
          </View>
          <AppText
            weight="semibold"
            style={[styles.snapshotAttentionValue, { color: lossesColor }]}
          >
            {summary.losses_and_returns_count}
          </AppText>
          <AppText size="small" tone="secondary" style={styles.snapshotAttentionLabel}>
            losses, returns & refunds
          </AppText>
        </View>
      </View>

      <View
        style={[
          styles.weekComparison,
          { borderTopColor: theme.border, borderBottomColor: theme.border },
        ]}
      >
        <View style={styles.comparisonHeading}>
          <View style={styles.comparisonTitle}>
            <Ionicons
              name={weekChange > 0 ? "trending-up-outline" : weekChange < 0 ? "trending-down-outline" : "remove-outline"}
              size={17}
              color={theme.primary}
            />
            <AppText size="small" weight="semibold">
              Week over week
            </AppText>
          </View>
        </View>
        {[
          {
            label: "This week",
            count: summary.last_7_days_count,
            color: theme.primary,
          },
          {
            label: "Previous week",
            count: summary.previous_7_days_count,
            color: theme.textSecondary,
          },
        ].map((period) => (
          <View key={period.label} style={styles.comparisonBarRow}>
            <AppText size="small" tone="secondary" style={styles.comparisonLabel}>
              {period.label}
            </AppText>
            <View
              style={[
                styles.comparisonTrack,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <View
                style={[
                  styles.comparisonFill,
                  {
                    width: `${Math.max(
                      period.count > 0 ? 4 : 0,
                      Math.round((period.count / comparisonMaximum) * 100),
                    )}%`,
                    backgroundColor: period.color,
                  },
                ]}
              />
            </View>
            <AppText size="small" weight="semibold" style={styles.comparisonCount}>
              {period.count}
            </AppText>
          </View>
        ))}
        <AppText size="small" weight="semibold" tone="secondary">
          {weekChangeText}
        </AppText>
      </View>

      <View style={styles.snapshotBreakdown}>
        <View style={styles.breakdownHeading}>
          <View>
            <AppText weight="semibold">Activity by area</AppText>
            <AppText size="small" tone="secondary">
              Where this week’s activity happened
            </AppText>
          </View>
          {breakdown.length ? (
            <Ionicons
              name="pie-chart-outline"
              size={18}
              color={theme.textSecondary}
            />
          ) : null}
        </View>
        {breakdown.length ? (
          breakdown.map((item) => (
            <View
              key={item.value}
              style={[
                styles.breakdownRow,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <View
                style={[
                  styles.breakdownIcon,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <Ionicons
                  name={item.icon}
                  size={16}
                  color={theme.primary}
                />
              </View>
              <View style={styles.breakdownInfo}>
                <View style={styles.breakdownLabel}>
                  <AppText size="small" weight="semibold" style={styles.breakdownName}>
                    {item.label}
                  </AppText>
                  <AppText size="small" weight="semibold">
                    {item.count}
                  </AppText>
                </View>
                <View
                  style={[
                    styles.breakdownTrack,
                    { backgroundColor: theme.backgroundElement },
                  ]}
                >
                  <View
                    style={[
                      styles.breakdownFill,
                      {
                        width: `${Math.round(
                          (item.count / maximumCategoryCount) * 100,
                        )}%`,
                        backgroundColor: theme.primary,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          ))
        ) : (
          <View
            style={[
              styles.noBreakdown,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <Ionicons
              name="leaf-outline"
              size={18}
              color={theme.textSecondary}
            />
            <AppText size="small" tone="secondary">
              No activity has been recorded in the last 7 days.
            </AppText>
          </View>
        )}
      </View>
    </Card>
  );
}

function ActivityCard({ activity }: { activity: FarmActivity }) {
  const { theme } = useTheme();
  const icon = categoryIcons[activity.entity_type] ?? "time-outline";
  const iconBackground = entityColors[activity.entity_type] ?? "#526477";
  const actionTone = actionTextTones[activity.type];
  const actionTextColor = actionTone
    ? actionTone === "danger"
      ? theme.mode === "dark"
        ? "#F07B72"
        : theme.danger
      : actionTone === "success"
        ? theme.mode === "dark"
          ? "#72C99B"
          : theme.success
        : theme.mode === "dark"
          ? "#83C8ED"
          : "#286B91"
    : theme.text;
  const detail = getActivityDetail(activity.details);
  const timestamp = new Date(activity.created_at);
  const fullDate = Number.isNaN(timestamp.getTime())
    ? "Time unavailable"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(timestamp);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${getActivityLabel(activity.type)}; view activity details`}
      onPress={() =>
        router.push({
          pathname: "/activities/[activityId]",
          params: { activityId: activity.id },
        })
      }
      style={({ pressed }) => [
        styles.activityPressable,
        { opacity: pressed ? 0.86 : 1 },
      ]}
    >
      <Card style={[styles.activityCard, { borderLeftColor: iconBackground }]}>
        <View style={styles.activityCardTop}>
          <View
            style={[
              styles.activityIcon,
              { backgroundColor: `${iconBackground}20` },
            ]}
          >
            <Ionicons name={icon} size={20} color={iconBackground} />
          </View>
          <View style={styles.activityCopy}>
            <AppText
              size="small"
              weight="semibold"
              style={{ color: actionTextColor }}
            >
              {getEntityLabel(activity.entity_type)}
            </AppText>
            <AppText size="heading" weight="semibold" style={styles.activityTitle}>
              {getActivityLabel(activity.type)}
            </AppText>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={theme.textSecondary}
          />
        </View>
        {detail ? (
          <View
            style={[
              styles.activitySummary,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <AppText size="small" numberOfLines={2}>
              {detail}
            </AppText>
          </View>
        ) : null}
        <View style={[styles.activityTimestamp, { borderTopColor: theme.border }]}>
          <Ionicons name="time-outline" size={15} color={theme.textSecondary} />
          <AppText size="small" tone="secondary">
            {formatRelativeDate(activity.created_at)}
          </AppText>
          <View style={[styles.timestampDot, { backgroundColor: theme.border }]} />
          <AppText size="small" tone="secondary" numberOfLines={1}>
            {fullDate}
          </AppText>
        </View>
      </Card>
    </Pressable>
  );
}

function isActivityCategory(value: string | undefined): value is ActivityCategory {
  return categories.some((item) => item.value === value && value !== undefined);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 36,
    gap: 16,
  },
  snapshot: { gap: 14, borderRadius: 17, padding: 15 },
  snapshotError: { gap: 8 },
  snapshotHeading: { flexDirection: "row", alignItems: "center", gap: 11 },
  snapshotHeadingIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  snapshotHeadingCopy: { flex: 1, gap: 1 },
  snapshotPeriodBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },
  snapshotStats: { flexDirection: "row", gap: 9 },
  snapshotMainMetric: {
    flex: 1,
    minWidth: 0,
    minHeight: 120,
    justifyContent: "center",
    gap: 1,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  snapshotValue: {
    fontSize: 44,
    lineHeight: 50,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  snapshotAttention: {
    flex: 1,
    minWidth: 0,
    minHeight: 120,
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 5,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  attentionIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  snapshotAttentionValue: {
    fontSize: 28,
    lineHeight: 32,
    fontVariant: ["tabular-nums"],
  },
  snapshotAttentionLabel: { flex: 1, lineHeight: 17 },
  weekComparison: {
    gap: 9,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  comparisonHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  comparisonTitle: { flexDirection: "row", alignItems: "center", gap: 6 },
  comparisonBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  comparisonLabel: { width: 88 },
  comparisonTrack: { height: 8, borderRadius: 5, overflow: "hidden" },
  comparisonFill: { height: "100%", borderRadius: 5 },
  comparisonCount: { width: 28, textAlign: "right" },
  comparisonFooter: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  snapshotBreakdown: { gap: 9 },
  breakdownHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  breakdownIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  breakdownInfo: { flex: 1, gap: 5 },
  breakdownLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  breakdownName: { flex: 1 },
  breakdownTrack: { height: 5, borderRadius: 3, overflow: "hidden" },
  breakdownFill: { height: "100%", borderRadius: 3 },
  noBreakdown: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  filterCard: { gap: 15, borderRadius: 16, padding: 15 },
  filterCardHeading: { flexDirection: "row", alignItems: "center", gap: 11 },
  filterHeadingIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  filterHeadingCopy: { flex: 1, gap: 1 },
  filterSubheading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: -7,
  },
  dateFilter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    gap: 12,
  },
  dateFilterToggle: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateFilterTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  activeDateBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  dateFilterSection: { gap: 10 },
  dateFields: { flexDirection: "row", gap: 10 },
  dateField: { flex: 1, minWidth: 0 },
  dateActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filters: { flexDirection: "row", gap: 8, paddingBottom: 1 },
  filterContent: { flexDirection: "row", alignItems: "center", gap: 6 },
  filter: {
    minHeight: 36,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
  },
  state: { gap: 8 },
  resultsHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 2,
  },
  resultsTitleCopy: { flex: 1, gap: 1 },
  resultsCount: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  activityPressable: { borderRadius: 15 },
  activityCard: {
    gap: 12,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
  },
  activityCardTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  activityIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  activityCopy: { flex: 1, gap: 1 },
  activityTitle: { fontSize: 17, lineHeight: 23 },
  activitySummary: { alignSelf: "flex-start", maxWidth: "100%", borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7 },
  activityTimestamp: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  timestampDot: { width: 3, height: 3, borderRadius: 2, marginHorizontal: 1 },
});
