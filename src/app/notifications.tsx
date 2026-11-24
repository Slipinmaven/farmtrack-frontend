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
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { FarmNotification } from "@/features/management/api";
import {
  useMarkAllNotificationsRead,
  useArchiveNotification,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from "@/features/management/hooks";
import { normalizeApiError } from "@/lib/api/errors";
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
  { icon: keyof typeof Ionicons.glyphMap }
> = {
  alert: { icon: "alert-circle-outline" },
  transaction: { icon: "swap-horizontal-outline" },
  reminder: { icon: "alarm-outline" },
  farm: { icon: "leaf-outline" },
  security: { icon: "shield-checkmark-outline" },
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
  const archive = useArchiveNotification(user?.id ?? "", farmId);
  const items = notifications.data?.pages.flatMap((page) => page.items) ?? [];
  const deduplicatedItems = deduplicateInitialPayments(items);
  const hiddenUnreadCount = items.filter(
    (item) => !item.read_at && !deduplicatedItems.includes(item),
  ).length;
  const unreadCount = Math.max(
    0,
    (unreadCountQuery.data ??
      items.filter((item) => !item.read_at).length) - hiddenUnreadCount,
  );
  const visibleItems = deduplicatedItems.filter((item) => {
    if (filter === "unread" && item.read_at) return false;
    if (categoryFilter === "all") return true;
    if (categoryFilter === "alerts") {
      return item.category === "alert" || item.category === "security";
    }
    return item.category === categoryFilter;
  });
  const actionError = markAll.error ?? markRead.error ?? archive.error;
  const categoryOptions = [
    ["transaction", "Transactions"],
    ["reminder", "Reminders"],
    ["farm", "Farm"],
    ["alerts", "Alerts & security"],
  ] as const;
  const populatedCategoryCounts = categoryOptions
    .map(([value]) => notificationCategoryCount(deduplicatedItems, value))
    .filter((count) => count > 0);
  const showCategoryFilters =
    (populatedCategoryCounts.length >= 3 &&
      new Set(populatedCategoryCounts).size > 1) ||
    categoryFilter !== "all";
  const groupedItems = groupNotificationsByDate(visibleItems);
  const hasEmptyState =
    !notifications.isLoading && !notifications.isError && visibleItems.length === 0;
  const stickyHeaderIndices: number[] = [];
  let childIndex =
    2 +
    Number(unreadCount > 0) +
    Number(showCategoryFilters) +
    Number(Boolean(actionError)) +
    Number(notifications.isLoading) +
    Number(notifications.isError) +
    Number(hasEmptyState);
  for (const group of groupedItems) {
    stickyHeaderIndices.push(childIndex);
    childIndex += group.items.length + 1;
  }

  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        stickyHeaderIndices={stickyHeaderIndices}
        scrollEventThrottle={400}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (
            contentSize.height - layoutMeasurement.height - contentOffset.y < 240 &&
            notifications.hasNextPage &&
            !notifications.isFetchingNextPage
          ) {
            void notifications.fetchNextPage();
          }
        }}
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
            count={deduplicatedItems.length}
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

        {unreadCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
            accessibilityState={{ disabled: markAll.isPending }}
            disabled={markAll.isPending}
            onPress={() => markAll.mutate()}
            style={({ pressed }) => [
              styles.markAllAction,
              { backgroundColor: pressed ? theme.backgroundSelected : "transparent" },
            ]}
          >
            {markAll.isPending ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Ionicons name="checkmark-done-outline" size={18} color={theme.primary} />
            )}
            <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
              Mark all as read
            </AppText>
          </Pressable>
        ) : null}

        {showCategoryFilters ? (
        <View style={styles.categoryFilterWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryFilters}
          accessibilityLabel="Filter notifications by category"
        >
          {categoryOptions.map(([value, label]) => {
            const selected = categoryFilter === value;
            const count = notificationCategoryCount(deduplicatedItems, value);
            if (count === 0) return null;
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
                      ? theme.primary
                      : theme.backgroundElement,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}
              >
                <AppText
                  size="small"
                  weight={selected ? "semibold" : "regular"}
                  style={{
                    color: selected ? theme.onPrimary : theme.text,
                  }}
                >
                  {label}
                </AppText>
                <View
                  style={[
                    styles.categoryCount,
                    {
                      backgroundColor: selected
                        ? `${theme.onPrimary}24`
                        : theme.backgroundSelected,
                    },
                  ]}
                >
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{
                      color: selected ? theme.onPrimary                       : theme.text,
                      fontSize: 11,
                      lineHeight: 15,
                    }}
                  >
                    {count}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        <Ionicons
          name="chevron-forward"
          size={16}
          color={theme.textSecondary}
          style={[styles.categoryScrollCue, { backgroundColor: theme.background }]}
        />
        </View>
        ) : null}

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
          <View style={styles.skeletonList}>
            {[0, 1, 2].map((key) => (
              <View
                key={key}
                style={[
                  styles.skeletonCard,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}
              >
                <View style={[styles.skeletonIcon, { backgroundColor: theme.backgroundSelected }]} />
                <View style={styles.skeletonCopy}>
                  <View style={[styles.skeletonLineShort, { backgroundColor: theme.backgroundSelected }]} />
                  <View style={[styles.skeletonLineTitle, { backgroundColor: theme.backgroundSelected }]} />
                  <View style={[styles.skeletonLine, { backgroundColor: theme.backgroundSelected }]} />
                </View>
              </View>
            ))}
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
                color={theme.text}
              />
            </View>
            <AppText weight="semibold">Couldn’t load notifications</AppText>
            <AppText style={{ color: theme.text }}>
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
                color={theme.text}
              />
            </View>
            <AppText weight="semibold">
              {filter === "unread" && unreadCount === 0
                ? "You’re all caught up"
                : filter === "unread"
                  ? "No unread notifications match these filters"
                : "No notifications match this category"}
            </AppText>
            <AppText style={[styles.centeredText, { color: theme.text }]}>
              {filter === "unread" && unreadCount === 0
                ? "New farm updates will appear here."
                : filter === "unread"
                ? "Try another category or switch to All to see your notification history."
                : "Choose a different category to see more updates."}
            </AppText>
            {categoryFilter !== "all" ? <Pressable
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
            </Pressable> : null}
          </Card>
        ) : null}

        {groupedItems.flatMap((group) => [
          <View
            key={`date-${group.label}`}
            style={[styles.dateHeading, { backgroundColor: theme.background }]}
          >
            <AppText size="small" weight="semibold" style={{ color: theme.text }}>
              {group.label}
            </AppText>
          </View>,
          ...group.items.map((item) => (
            <NotificationCard
              key={item.id}
              item={item}
              onMarkRead={() => markRead.mutate(item.id)}
              onArchive={() => archive.mutate(item.id)}
              onOpenDetails={() => {
                if (!item.read_at) markRead.mutate(item.id);
                const transactionType =
                  item.type === "purchase.recorded"
                    ? "purchase"
                    : item.type === "sale.recorded"
                      ? "sale"
                      : item.type === "payment.recorded"
                        ? String(item.payload?.transaction_type ?? "")
                        : null;
                if (!item.entity_id) return;
                if (transactionType === "purchase") {
                  router.push({
                    pathname: "/purchases/[purchaseId]",
                    params: { purchaseId: item.entity_id },
                  });
                } else if (transactionType === "sale") {
                  router.push({
                    pathname: "/sales/[saleId]",
                    params: { saleId: item.entity_id },
                  });
                } else if (item.type === "reminder.due") {
                  router.push({
                    pathname: "/reminders/[reminderId]",
                    params: { reminderId: item.entity_id },
                  });
                } else if (
                  item.type === "chicken_return.recorded" &&
                  typeof item.payload?.transaction_id === "string"
                ) {
                  router.push({
                    pathname: "/transactions/[transactionId]/returns",
                    params: { transactionId: item.payload.transaction_id },
                  });
                } else if (item.type === "chicken_movement.recorded") {
                  router.push("/flock");
                }
              }}
              markingRead={markRead.isPending}
            />
          )),
        ])}
        {notifications.isFetchingNextPage ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="small" color={theme.primary} />
            <AppText size="small" style={{ color: theme.text }}>Loading older notifications…</AppText>
          </View>
        ) : null}
        {!notifications.hasNextPage && items.length > 0 ? (
          <AppText size="small" style={[styles.listEnd, { color: theme.text }]}>
            You’re viewing all notifications.
          </AppText>
        ) : null}
      </ScrollView>
    </SafeAreaView>
    </GestureHandlerRootView>
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
        style={{ color: selected ? theme.onPrimary : theme.text }}
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
            color: selected ? theme.primary : theme.text,
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
  onArchive,
  onOpenDetails,
  markingRead,
}: {
  item: FarmNotification;
  onMarkRead: () => void;
  onArchive: () => void;
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
  const transactionType =
    item.type === "purchase.recorded"
      ? "purchase"
      : item.type === "sale.recorded"
        ? "sale"
        : item.type === "payment.recorded"
          ? String(item.payload?.transaction_type ?? "")
          : "";
  const opensPurchase =
    transactionType === "purchase" &&
    item.entity_type === "transaction" &&
    Boolean(item.entity_id);
  const opensSale =
    transactionType === "sale" &&
    item.entity_type === "transaction" &&
    Boolean(item.entity_id);
  const opensReminder =
    item.type === "reminder.due" &&
    item.entity_type === "reminder" &&
    Boolean(item.entity_id);
  const opensReturn =
    item.type === "chicken_return.recorded" &&
    typeof item.payload?.transaction_id === "string";
  const opensMovement =
    item.type === "chicken_movement.recorded" && Boolean(item.entity_id);
  const opensDetails =
    opensPurchase || opensSale || opensReminder || opensReturn || opensMovement;
  const amount = notificationAmount(item);
  const supportingText = notificationSupportingText(item);

  const card = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}${amount ? `, ${amount.label}` : ""}${unread ? ", unread" : ""}`}
      accessibilityHint={opensDetails ? "Open the related record" : "Mark this notification as read"}
      onPress={opensDetails ? onOpenDetails : onMarkRead}
      style={[
        styles.notificationCard,
        {
          borderColor: unread ? `${theme.primary}55` : theme.border,
          borderLeftColor: unread ? categoryColor : theme.border,
          backgroundColor: unread ? theme.backgroundSelected : theme.backgroundElement,
        },
      ]}
    >
      <View style={[styles.notificationIcon, { backgroundColor: `${categoryColor}20` }]}>
        <Ionicons name={details.icon} size={20} color={categoryColor} />
      </View>
      <View style={styles.notificationBody}>
        <View style={styles.notificationMeta}>
          <AppText size="small" style={{ color: theme.text }}>
            {formatNotificationTime(item.created_at)}
          </AppText>
          {unread ? (
            <View
              accessibilityLabel="Unread"
              style={[styles.unreadDot, { backgroundColor: theme.primary }]}
            />
          ) : null}
          <View style={styles.metaSpacer} />
          {opensDetails ? (
            <Ionicons name="chevron-forward" size={17} color={theme.textSecondary} />
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
        <View style={styles.titleAmountRow}>
          <AppText
            weight="semibold"
            numberOfLines={2}
            style={[
              styles.notificationText,
              styles.titleFlex,
              { color: unread ? theme.primary : theme.text },
            ]}
          >
            {item.title}
          </AppText>
          {amount ? (
            <AppText
              weight="semibold"
              numberOfLines={1}
              style={[
                styles.amount,
                { color: amount.incoming ? theme.success : theme.danger },
              ]}
            >
              {amount.label}
            </AppText>
          ) : null}
        </View>
        <AppText
          size="small"
          numberOfLines={2}
          style={[styles.message, { color: theme.text }]}
        >
          {supportingText}
        </AppText>
        {unread && !opensDetails ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mark ${item.title} as read`}
            accessibilityState={{ disabled: markingRead }}
            disabled={markingRead}
            onPress={(event) => {
              event.stopPropagation();
              onMarkRead();
            }}
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
                <Ionicons name="checkmark-circle-outline" size={17} color={theme.primary} />
                <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                  Mark as read
                </AppText>
              </>
            )}
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
  return (
    <Swipeable
      renderLeftActions={() =>
        unread ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mark ${item.title} as read`}
            onPress={onMarkRead}
            style={[styles.swipeAction, { backgroundColor: theme.primary }]}
          >
            <Ionicons name="checkmark-done-outline" size={21} color={theme.onPrimary} />
            <AppText size="small" weight="semibold" style={{ color: theme.onPrimary }}>
              Read
            </AppText>
          </Pressable>
        ) : null
      }
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Archive ${item.title}`}
          onPress={onArchive}
          style={[styles.swipeAction, { backgroundColor: theme.danger }]}
        >
          <Ionicons name="archive-outline" size={21} color="#FFFFFF" />
          <AppText size="small" weight="semibold" style={{ color: "#FFFFFF" }}>
            Archive
          </AppText>
        </Pressable>
      )}
      overshootLeft={false}
      overshootRight={false}
    >
      {card}
    </Swipeable>
  );
}

function deduplicateInitialPayments(items: FarmNotification[]): FarmNotification[] {
  const transactions = new Map(
    items
      .filter(
        (item) =>
          (item.type === "purchase.recorded" || item.type === "sale.recorded") &&
          item.entity_id,
      )
      .map((item) => [item.entity_id!, item]),
  );
  return items.filter((item) => {
    if (item.type !== "payment.recorded" || !item.entity_id) return true;
    const transaction = transactions.get(item.entity_id);
    if (!transaction) return true;
    const timeDifference = Math.abs(
      new Date(item.created_at).getTime() -
        new Date(transaction.created_at).getTime(),
    );
    return timeDifference > 30 * 1000;
  });
}

function notificationCategoryCount(
  items: FarmNotification[],
  category: Exclude<CategoryFilter, "all">,
): number {
  return items.filter((item) =>
    category === "alerts"
      ? item.category === "alert" || item.category === "security"
      : item.category === category,
  ).length;
}

function groupNotificationsByDate(items: FarmNotification[]) {
  const groups = new Map<string, FarmNotification[]>();
  for (const item of items) {
    const label = notificationDateGroup(item.created_at);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return Array.from(groups, ([label, groupedItems]) => ({
    label,
    items: groupedItems,
  }));
}

function notificationDateGroup(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round(
    (today.getTime() - dateDay.getTime()) / 86_400_000,
  );
  if (dayDifference === 0) return "Today";
  if (dayDifference === 1) return "Yesterday";
  return "Earlier";
}

function formatNotificationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function notificationAmount(
  item: FarmNotification,
): { label: string; incoming: boolean } | null {
  const amountValue =
    item.type === "payment.recorded"
      ? item.payload?.payment_amount
      : item.payload?.transaction_total;
  const amount = Number(amountValue);
  if (!Number.isFinite(amount)) return null;
  const currency =
    typeof item.payload?.currency === "string" ? item.payload.currency : "";
  const label = `${currency ? `${currency} ` : ""}${new Intl.NumberFormat(
    undefined,
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  ).format(amount)}`;
  const incoming =
    item.type === "sale.recorded" ||
    (item.type === "payment.recorded" &&
      item.payload?.transaction_type === "sale");
  return { label, incoming };
}

function notificationSupportingText(item: FarmNotification): string {
  const reference =
    typeof item.payload?.reference_number === "string"
      ? item.payload.reference_number
      : "";
  const contact =
    typeof item.payload?.contact_name === "string"
      ? item.payload.contact_name
      : "";
  if (contact || reference) return [contact, reference].filter(Boolean).join(" · ");
  return item.message;
}

const styles = StyleSheet.create({
  gestureRoot: { flex: 1 },
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 16,
    paddingBottom: 28,
    gap: 11,
  },
  categoryFilters: { gap: 7, paddingVertical: 2, paddingRight: 28 },
  categoryFilterWrap: { position: "relative", justifyContent: "center" },
  categoryScrollCue: { position: "absolute", right: 0 },
  categoryChip: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 9,
  },
  categoryCount: {
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderRadius: 7,
  },
  markAllAction: {
    minHeight: 44,
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    borderRadius: 9,
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
    minHeight: 44,
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
  loadingState: { alignItems: "center", gap: 10, padding: 26 },
  skeletonList: { gap: 9 },
  skeletonCard: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: 12,
  },
  skeletonIcon: { width: 36, height: 36, borderRadius: 11 },
  skeletonCopy: { flex: 1, gap: 8, paddingTop: 3 },
  skeletonLineShort: { width: "28%", height: 10, borderRadius: 5 },
  skeletonLineTitle: { width: "64%", height: 13, borderRadius: 6 },
  skeletonLine: { width: "84%", height: 10, borderRadius: 5 },
  stateCard: { alignItems: "center", gap: 8, paddingVertical: 20 },
  emptyState: {
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  stateIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
    borderRadius: 14,
  },
  centeredText: { textAlign: "center" },
  emptyAction: {
    minHeight: 38,
    justifyContent: "center",
    marginTop: 6,
    paddingHorizontal: 13,
    borderRadius: 9,
  },
  listEnd: { textAlign: "center", paddingVertical: 8 },
  notificationCard: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderWidth: 1,
  },
  notificationIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  notificationBody: { flex: 1, minWidth: 0, gap: 5, paddingRight: 2 },
  notificationText: { flexShrink: 1, fontSize: 15 },
  titleAmountRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  titleFlex: { flex: 1 },
  amount: { maxWidth: "48%", fontSize: 14, textAlign: "right" },
  notificationMeta: {
    minHeight: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  metaSpacer: { flex: 1 },
  priorityBadge: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  unreadDot: { width: 9, height: 9, borderRadius: 5 },
  message: { flexShrink: 1, lineHeight: 19, fontSize: 13 },
  markReadButton: {
    minHeight: 40,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
  swipeAction: {
    width: 82,
    minHeight: 92,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 12,
    marginBottom: 1,
  },
  dateHeading: { paddingVertical: 5, zIndex: 1 },
});
