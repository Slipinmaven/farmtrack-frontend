import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
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
import type { Reminder } from "@/features/reminders/api";
import { useReminders } from "@/features/reminders/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type ReminderFilter = "all" | Reminder["status"];

const filters: { label: string; value: ReminderFilter }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "PENDING" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Cancelled", value: "CANCELLED" },
];

export default function RemindersRoute() {
  return (
    <SessionGate>
      <RemindersContent />
    </SessionGate>
  );
}

function RemindersContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const [filter, setFilter] = useState<ReminderFilter>("all");
  const remindersQuery = useReminders(user?.id, farm.selectedFarm?.id);
  const nowTimestamp = new Date().getTime();
  const reminders = useMemo(() => {
    const items = remindersQuery.data ?? [];
    return items
      .filter((reminder) => filter === "all" || reminder.status === filter)
      .sort((left, right) => left.due_at.localeCompare(right.due_at));
  }, [filter, remindersQuery.data]);
  const pendingCount = (remindersQuery.data ?? []).filter(
    (reminder) => reminder.status === "PENDING",
  ).length;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={remindersQuery.isRefetching}
            onRefresh={() => void remindersQuery.refetch()}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <FarmPageHeader title="Reminders" showBack />

        <Card
          style={[
            styles.overview,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}
        >
          <View
            style={[
              styles.overviewIcon,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <Ionicons name="alarm-outline" size={23} color={theme.primary} />
          </View>
          <View style={styles.overviewCopy}>
            <AppText size="heading" weight="semibold">
              Your reminders
            </AppText>
            <AppText size="small" tone="secondary">
              {pendingCount
                ? `${pendingCount} pending ${pendingCount === 1 ? "reminder" : "reminders"}`
                : "No pending reminders"}
            </AppText>
          </View>
        </Card>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {filters.map((option) => {
            const selected = filter === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setFilter(option.value)}
                style={[
                  styles.filter,
                  {
                    backgroundColor: selected
                      ? theme.primary
                      : theme.backgroundElement,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}
              >
                <AppText
                  size="small"
                  weight="semibold"
                  style={{ color: selected ? theme.onPrimary : theme.textSecondary }}
                >
                  {option.label}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {remindersQuery.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={theme.primary} />
            <AppText size="small" tone="secondary">
              Loading reminders…
            </AppText>
          </View>
        ) : null}

        {remindersQuery.isError ? (
          <Card style={[styles.state, { borderColor: theme.border }]}>
            <Ionicons
              name="cloud-offline-outline"
              size={25}
              color={theme.danger}
            />
            <AppText weight="semibold">Couldn’t load reminders</AppText>
            <AppText size="small" tone="secondary" style={styles.centered}>
              {normalizeApiError(remindersQuery.error).message}
            </AppText>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => void remindersQuery.refetch()}
            />
          </Card>
        ) : null}

        {!remindersQuery.isLoading &&
        !remindersQuery.isError &&
        reminders.length === 0 ? (
          <Card
            style={[
              styles.state,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <View
              style={[
                styles.emptyIcon,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <Ionicons
                name={filter === "PENDING" ? "checkmark-circle-outline" : "calendar-outline"}
                size={24}
                color={theme.primary}
              />
            </View>
            <AppText weight="semibold">
              {filter === "PENDING" ? "You’re all caught up" : "No reminders here"}
            </AppText>
            <AppText size="small" tone="secondary" style={styles.centered}>
              {filter === "PENDING"
                ? "New follow-up reminders will appear here."
                : "Try another filter to see more reminders."}
            </AppText>
          </Card>
        ) : null}

        {reminders.map((reminder) => (
          <ReminderCard
            key={reminder.id}
            reminder={reminder}
            nowTimestamp={nowTimestamp}
            onPress={() =>
              router.push({
                pathname: "/reminders/[reminderId]",
                params: { reminderId: reminder.id },
              })
            }
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function ReminderCard({
  reminder,
  nowTimestamp,
  onPress,
}: {
  reminder: Reminder;
  nowTimestamp: number;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const dueAt = new Date(reminder.due_at);
  const overdue =
    reminder.status === "PENDING" &&
    !Number.isNaN(dueAt.getTime()) &&
    dueAt.getTime() < nowTimestamp;
  const accent =
    overdue
      ? theme.danger
      : reminder.status === "COMPLETED"
        ? theme.success
        : reminder.status === "CANCELLED"
          ? theme.textSecondary
          : theme.primary;
  const statusLabel = overdue
    ? "Overdue"
    : labelize(reminder.status);
  const dueLabel = Number.isNaN(dueAt.getTime())
    ? reminder.due_at
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(dueAt);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.reminderCard,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.reminderIcon,
          { backgroundColor: `${accent}18` },
        ]}
      >
        <Ionicons name="alarm-outline" size={20} color={accent} />
      </View>
      <View style={styles.reminderCopy}>
        <View style={styles.reminderHeading}>
          <AppText size="body" weight="semibold" numberOfLines={2} style={styles.title}>
            {reminder.title}
          </AppText>
          <View style={[styles.status, { backgroundColor: `${accent}18` }]}>
            <AppText size="small" weight="semibold" style={{ color: accent }}>
              {statusLabel}
            </AppText>
          </View>
        </View>
        <View style={styles.dueRow}>
          <Ionicons name="time-outline" size={15} color={theme.textSecondary} />
          <AppText size="small" tone="secondary" numberOfLines={1}>
            {dueLabel}
          </AppText>
        </View>
        {reminder.description ? (
          <AppText size="small" tone="secondary" numberOfLines={2}>
            {reminder.description}
          </AppText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

function labelize(value: string): string {
  return value
    .split(/[_\s]+/)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    gap: 14,
    padding: 20,
    paddingBottom: 36,
  },
  overview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderWidth: 1,
    borderRadius: 15,
    padding: 15,
  },
  overviewIcon: {
    width: 45,
    height: 45,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  overviewCopy: { flex: 1, gap: 3 },
  filters: { gap: 8, paddingVertical: 2 },
  filter: {
    minHeight: 38,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
  },
  loading: { alignItems: "center", gap: 10, paddingVertical: 32 },
  state: {
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 15,
    padding: 20,
  },
  centered: { textAlign: "center" },
  emptyIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  reminderCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  reminderIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  reminderCopy: { flex: 1, minWidth: 0, gap: 7 },
  reminderHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  title: { flex: 1, minWidth: 0 },
  status: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
});
