import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
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
import type { FarmNotification } from "@/features/management/api";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from "@/features/management/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { formatRelativeDateTime } from "@/lib/date/format-relative-date";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type CategoryFilter =
  | "all"
  | "transaction"
  | "reminder"
  | "farm"
  | "alerts";
type NotificationFilter = "all" | "unread";

const notificationCategoryDetails: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  alert: { label: "Alert", icon: "alert-circle-outline" },
  transaction: { label: "Transaction", icon: "swap-horizontal-outline" },
  reminder: { label: "Reminder", icon: "alarm-outline" },
  farm: { label: "Farm update", icon: "leaf-outline" },
  security: { label: "Security", icon: "shield-checkmark-outline" },
};

export default function NotificationsScreen() {
  return (
    <SessionGate>
      <NotificationsContent />
    </SessionGate>
  );
}

function NotificationsContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const farmId = farm.selectedFarm?.id ?? "";
  const notifications = useNotifications(user?.id, farm.selectedFarm?.id);
  const unreadCountQuery = useUnreadNotificationCount(
    user?.id,
    farm.selectedFarm?.id,
  );
  const markAll = useMarkAllNotificationsRead(user?.id ?? "", farmId);
  const markRead = useMarkNotificationRead(user?.id ?? "", farmId);
  const items = notifications.data?.pages.flatMap((page) => page.items) ?? [];
  const unreadCount =
    unreadCountQuery.data ?? items.filter((item) => !item.read_at).length;
  const visibleItems = items.filter((item) => {
    if (filter === "unread" && item.read_at) return false;
    if (categoryFilter === "all") return true;
    if (categoryFilter === "alerts") {
      return item.category === "alert" || item.category === "security";
    }
    return item.category === categoryFilter;
  });
  const actionError = markAll.error ?? markRead.error;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={notifications.isRefetching}
            onRefresh={() => void notifications.refetch()}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <FarmPageHeader
          title="Notifications"
          showBack
          showNotifications={false}
        />

        <Card style={styles.overview}>
          <View
            style={[
              styles.overviewIcon,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <Ionicons
              name={unreadCount > 0 ? "notifications" : "checkmark-done"}
              size={24}
              color={theme.primary}
            />
          </View>
          <View style={styles.overviewCopy}>
            <AppText size="heading" weight="semibold">
              {unreadCount > 0
                ? `${unreadCount} unread ${unreadCount === 1 ? "update" : "updates"}`
                : "You’re all caught up"}
            </AppText>
            <AppText size="small" tone="secondary">
              Farm activity, reminders, and important updates all in one place.
            </AppText>
          </View>
          {unreadCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mark all notifications as read"
              accessibilityState={{ disabled: markAll.isPending }}
              disabled={markAll.isPending}
              onPress={() => markAll.mutate()}
              style={({ pressed }) => [
                styles.markAllButton,
                {
                  backgroundColor: pressed
                    ? theme.backgroundSelected
                    : theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            >
              {markAll.isPending ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Ionicons
                  name="checkmark-done-outline"
                  size={19}
                  color={theme.primary}
                />
              )}
            </Pressable>
          ) : null}
        </Card>

        <View
          accessibilityRole="tablist"
          style={[
            styles.filterBar,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}
        >
          <FilterButton
            label="All"
            count={items.length}
            selected={filter === "all"}
            onPress={() => setFilter("all")}
          />
          <FilterButton
            label="Unread"
            count={unreadCount}
            selected={filter === "unread"}
            onPress={() => setFilter("unread")}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryFilters}
          accessibilityLabel="Filter notifications by category"
        >
          {(
            [
              ["all", "All categories"],
              ["transaction", "Transactions"],
              ["reminder", "Reminders"],
              ["farm", "Farm"],
              ["alerts", "Alerts & security"],
            ] as const
          ).map(([value, label]) => {
            const selected = categoryFilter === value;
            const count = items.filter((item) => {
              if (value === "all") return true;
              if (value === "alerts") {
                return item.category === "alert" || item.category === "security";
              }
              return item.category === value;
            }).length;
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setCategoryFilter(value)}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: selected
                      ? theme.backgroundSelected
                      : theme.backgroundElement,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}
              >
                <AppText
                  size="small"
                  weight={selected ? "semibold" : "regular"}
                  style={{ color: selected ? theme.primary : theme.textSecondary }}
                >
                  {label}
                </AppText>
                <AppText
                  size="small"
                  style={{ color: selected ? theme.primary : theme.textSecondary }}
                >
                  {count}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {actionError ? (
          <Card
            style={[
              styles.actionError,
              { borderColor: theme.danger, backgroundColor: theme.backgroundElement },
            ]}
          >
            <Ionicons
              name="alert-circle-outline"
              size={20}
              color={theme.danger}
            />
            <AppText style={{ color: theme.danger }}>
              {normalizeApiError(actionError).message}
            </AppText>
          </Card>
        ) : null}

        {notifications.isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={theme.primary} />
            <AppText tone="secondary">Loading your updates…</AppText>
          </View>
        ) : null}

        {notifications.isError ? (
          <Card style={styles.stateCard}>
            <View
              style={[
                styles.stateIcon,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <Ionicons
                name="cloud-offline-outline"
                size={24}
                color={theme.primary}
              />
            </View>
            <AppText weight="semibold">Couldn’t load notifications</AppText>
            <AppText tone="secondary">
              {normalizeApiError(notifications.error).message}
            </AppText>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => void notifications.refetch()}
            />
          </Card>
        ) : null}

        {!notifications.isLoading &&
        !notifications.isError &&
        visibleItems.length === 0 ? (
          <Card style={styles.emptyState}>
            <View
              style={[
                styles.stateIcon,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <Ionicons
                name={filter === "unread" ? "mail-open-outline" : "leaf-outline"}
                size={25}
                color={theme.primary}
              />
            </View>
            <AppText weight="semibold">
              {filter === "unread"
                ? "No unread notifications match these filters"
                : "No notifications match this category"}
            </AppText>
            <AppText tone="secondary" style={styles.centeredText}>
              {filter === "unread"
                ? "Try another category or switch to All to see your notification history."
                : "Choose a different category to see more updates."}
            </AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setFilter("all");
                setCategoryFilter("all");
              }}
              style={[
                styles.emptyAction,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <AppText weight="semibold" style={{ color: theme.primary }}>
                Clear filters
              </AppText>
            </Pressable>
          </Card>
        ) : null}

        {visibleItems.map((item) => (
          <NotificationCard
            key={item.id}
            item={item}
            onMarkRead={() => markRead.mutate(item.id)}
            onOpenDetails={() => {
              if (!item.entity_id) return;
              if (!item.read_at) markRead.mutate(item.id);
              if (item.type === "purchase.recorded") {
                router.push({
                  pathname: "/purchases/[purchaseId]",
                  params: { purchaseId: item.entity_id },
                });
              } else if (item.type === "sale.recorded") {
                router.push({
                  pathname: "/sales/[saleId]",
                  params: { saleId: item.entity_id },
                });
              } else if (item.type === "reminder.due") {
                router.push({
                  pathname: "/reminders/[reminderId]",
                  params: { reminderId: item.entity_id },
                });
              }
            }}
            markingRead={markRead.isPending}
          />
        ))}
        {notifications.hasNextPage ? (
          <Button
            label={
              notifications.isFetchingNextPage
                ? "Loading more…"
                : "Load older notifications"
            }
            variant="secondary"
            loading={notifications.isFetchingNextPage}
            disabled={notifications.isFetchingNextPage}
            onPress={() => void notifications.fetchNextPage()}
          />
        ) : items.length > 0 ? (
          <AppText size="small" tone="secondary" style={styles.listEnd}>
            You’re viewing all notifications.
          </AppText>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function FilterButton({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.filterButton,
        selected && { backgroundColor: theme.primary },
      ]}
    >
      <AppText
        size="small"
        weight="semibold"
        style={{ color: selected ? theme.onPrimary : theme.textSecondary }}
      >
        {label}
      </AppText>
      <View
        style={[
          styles.filterCount,
          {
            backgroundColor: selected
              ? theme.onPrimary
              : theme.backgroundSelected,
          },
        ]}
      >
        <AppText
          size="small"
          weight="semibold"
          style={{
            color: selected ? theme.primary : theme.textSecondary,
            fontSize: 11,
            lineHeight: 15,
          }}
        >
          {count}
        </AppText>
      </View>
    </Pressable>
  );
}

function NotificationCard({
  item,
  onMarkRead,
  onOpenDetails,
  markingRead,
}: {
  item: FarmNotification;
  onMarkRead: () => void;
  onOpenDetails: () => void;
  markingRead: boolean;
}) {
  const { theme } = useTheme();
  const unread = !item.read_at;
  const categoryColor =
    item.category === "alert" || item.category === "security"
      ? theme.danger
      : item.category === "reminder"
        ? theme.secondary
        : item.category === "farm"
          ? theme.success
          : theme.primary;
  const details = notificationCategoryDetails[item.category] ?? {
    label: "Update",
    icon: "notifications-outline" as const,
  };
  const opensPurchase =
    item.type === "purchase.recorded" &&
    item.entity_type === "transaction" &&
    Boolean(item.entity_id);
  const opensSale =
    item.type === "sale.recorded" &&
    item.entity_type === "transaction" &&
    Boolean(item.entity_id);
  const opensReminder =
    item.type === "reminder.due" &&
    item.entity_type === "reminder" &&
    Boolean(item.entity_id);
  const opensDetails = opensPurchase || opensSale || opensReminder;

  const card = (
    <Card
      style={[
        styles.notificationCard,
        {
          borderLeftColor: unread ? categoryColor : theme.border,
          backgroundColor: unread
            ? `${categoryColor}0C`
            : theme.backgroundElement,
        },
      ]}
    >
      <View
        style={[
          styles.notificationIcon,
          { backgroundColor: `${categoryColor}16` },
        ]}
      >
        <Ionicons name={details.icon} size={21} color={categoryColor} />
      </View>
      <View style={styles.notificationBody}>
        <View style={styles.notificationMeta}>
          <AppText
            size="small"
            weight="semibold"
            style={{ color: categoryColor }}
          >
            {details.label}
          </AppText>
          <AppText size="small" tone="secondary">
            {formatRelativeDateTime(item.created_at)}
          </AppText>
          {unread ? (
            <View
              accessibilityLabel="Unread"
              style={[styles.unreadDot, { backgroundColor: theme.primary }]}
            />
          ) : null}
        </View>
        {item.priority === "high" || item.priority === "critical" ? (
          <View
            style={[
              styles.priorityBadge,
              { backgroundColor: `${theme.danger}14` },
            ]}
          >
            <Ionicons
              name={
                item.priority === "critical"
                  ? "alert-circle"
                  : "alert-circle-outline"
              }
              size={14}
              color={theme.danger}
            />
            <AppText
              size="small"
              weight="semibold"
              style={{ color: theme.danger }}
            >
              {item.priority === "critical" ? "Urgent" : "Important"}
            </AppText>
          </View>
        ) : null}
        <AppText weight="semibold" numberOfLines={2} style={styles.notificationText}>
          {item.title}
        </AppText>
        <AppText
          size="small"
          tone="secondary"
          numberOfLines={4}
          style={styles.message}
        >
          {item.message}
        </AppText>
        {opensDetails ? (
          <View style={styles.openPurchaseHint}>
            <AppText
              size="small"
              weight="semibold"
              style={{ color: theme.primary }}
            >
              {opensPurchase
                ? "View purchase details"
                : opensSale
                  ? "View sale details"
                  : "View reminder details"}
            </AppText>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={theme.primary}
            />
          </View>
        ) : null}
        {unread && !opensDetails ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mark ${item.title} as read`}
            accessibilityState={{ disabled: markingRead }}
            disabled={markingRead}
            onPress={onMarkRead}
            style={({ pressed }) => [
              styles.markReadButton,
              {
                backgroundColor: pressed
                  ? theme.backgroundSelected
                  : theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            {markingRead ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={17}
                  color={theme.primary}
                />
                <AppText
                  size="small"
                  weight="semibold"
                  style={{ color: theme.primary }}
                >
                  Mark as read
                </AppText>
              </>
            )}
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
  return opensDetails ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. Open ${opensPurchase ? "purchase" : opensSale ? "sale" : "reminder"} details.`}
      onPress={onOpenDetails}
    >
      {card}
    </Pressable>
  ) : (
    card
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 36,
    gap: 14,
  },
  categoryFilters: { gap: 8, paddingVertical: 2 },
  categoryChip: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 18,
  },
  overview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 18,
    borderRadius: 12,
  },
  overviewIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  overviewCopy: { flex: 1, gap: 3 },
  markAllButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 12,
  },
  filterBar: {
    flexDirection: "row",
    gap: 6,
    padding: 4,
    borderWidth: 1,
    borderRadius: 12,
  },
  filterButton: {
    flex: 1,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 9,
  },
  filterCount: {
    minWidth: 21,
    height: 21,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    borderRadius: 11,
  },
  actionError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 13,
    borderWidth: 1,
    borderRadius: 11,
  },
  loadingState: { alignItems: "center", gap: 12, padding: 34 },
  stateCard: { alignItems: "center", gap: 10, paddingVertical: 26 },
  emptyState: {
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  stateIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
    borderRadius: 18,
  },
  centeredText: { textAlign: "center" },
  emptyAction: {
    minHeight: 42,
    justifyContent: "center",
    marginTop: 6,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  listEnd: { textAlign: "center", paddingVertical: 8 },
  notificationCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 13,
    padding: 15,
    borderRadius: 12,
    borderLeftWidth: 4,
  },
  notificationIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  notificationBody: { flex: 1, minWidth: 0, gap: 5 },
  notificationText: { flexShrink: 1 },
  notificationMeta: {
    minHeight: 21,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  priorityBadge: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  unreadDot: { width: 8, height: 8, marginLeft: "auto", borderRadius: 4 },
  message: { flexShrink: 1, lineHeight: 19 },
  markReadButton: {
    minHeight: 34,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 9,
  },
  openPurchaseHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 6,
  },
});
