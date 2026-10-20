import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
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
import { useReminder } from "@/features/reminders/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

export default function ReminderDetailsRoute() {
  return (
    <SessionGate>
      <ReminderDetailsContent />
    </SessionGate>
  );
}

function ReminderDetailsContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const { reminderId } = useLocalSearchParams<{ reminderId: string }>();
  const reminderQuery = useReminder(
    user?.id,
    farm.selectedFarm?.id,
    reminderId,
  );
  const reminder = reminderQuery.data;
  const reminderTone =
    reminder?.status === "COMPLETED"
      ? theme.success
      : reminder?.status === "CANCELLED"
        ? theme.textSecondary
        : theme.secondary;
  const isSaleReminder =
    reminder?.related_entity_type === "sale_transaction" ||
    reminder?.title.toLowerCase().includes("chicken sale balance");
  const relatedTransactionId =
    reminder?.related_entity_type === "transaction" ||
    reminder?.related_entity_type === "sale_transaction"
      ? reminder.related_entity_id
      : null;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={reminderQuery.isRefetching}
            onRefresh={() => void reminderQuery.refetch()}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <FarmPageHeader title="Reminder details" showBack />
        {reminderQuery.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={theme.primary} />
            <AppText tone="secondary">Loading reminder…</AppText>
          </View>
        ) : null}
        {reminderQuery.isError ? (
          <Card style={styles.stateCard}>
            <Ionicons
              name="cloud-offline-outline"
              size={28}
              color={theme.danger}
            />
            <AppText weight="semibold">Couldn’t load this reminder</AppText>
            <AppText tone="secondary" style={styles.centered}>
              {normalizeApiError(reminderQuery.error).message}
            </AppText>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => void reminderQuery.refetch()}
            />
          </Card>
        ) : null}
        {reminder ? (
          <>
            <Card
              style={[
                styles.hero,
                {
                  borderLeftColor: reminderTone,
                  backgroundColor: `${reminderTone}08`,
                },
              ]}
            >
              <View style={styles.heroHeading}>
                <View
                  style={[
                    styles.heroIcon,
                    { backgroundColor: `${reminderTone}18` },
                  ]}
                >
                  <Ionicons
                    name="alarm-outline"
                    size={25}
                    color={reminderTone}
                  />
                </View>
                <View style={styles.heroCopy}>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: `${reminderTone}18` },
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: reminderTone },
                      ]}
                    />
                    <AppText
                      size="small"
                      weight="semibold"
                      style={{ color: reminderTone }}
                    >
                      {labelize(reminder.status)}
                    </AppText>
                  </View>
                  <AppText size="heading" weight="semibold" numberOfLines={3}>
                    {reminder.title}
                  </AppText>
                </View>
              </View>
              <View
                style={[
                  styles.dueCallout,
                  { backgroundColor: `${reminderTone}12` },
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={20}
                  color={reminderTone}
                />
                <View style={styles.dueCopy}>
                  <AppText size="small" tone="secondary">
                    Scheduled for
                  </AppText>
                  <AppText
                    size="title"
                    weight="semibold"
                    style={{ color: reminderTone }}
                  >
                    {formatDateTime(reminder.due_at)}
                  </AppText>
                </View>
              </View>
              {reminder.description ? (
                <AppText style={styles.description}>
                  {reminder.description}
                </AppText>
              ) : null}
            </Card>

            <Card style={styles.detailsCard}>
              <View style={styles.detailsHeading}>
                <View
                  style={[
                    styles.detailsIcon,
                    { backgroundColor: `${theme.primary}14` },
                  ]}
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={19}
                    color={theme.primary}
                  />
                </View>
                <AppText size="heading" weight="semibold">
                  Reminder information
                </AppText>
              </View>
              <View style={[styles.detailList, { borderTopColor: theme.border }]}>
                <DetailLine
                  label="Status"
                  value={labelize(reminder.status)}
                />
                <DetailLine
                  label="Delivery"
                  value={
                    reminder.delivery_channel === "push"
                      ? "Push notification"
                      : "In-app notification"
                  }
                />
                <DetailLine
                  label="Created"
                  value={formatDateTime(reminder.created_at)}
                />
                {reminder.completed_at ? (
                  <DetailLine
                    label="Completed"
                    value={formatDateTime(reminder.completed_at)}
                  />
                ) : null}
                {reminder.notification_enqueued_at ? (
                  <DetailLine
                    label="Notification sent"
                    value={formatDateTime(reminder.notification_enqueued_at)}
                  />
                ) : null}
                {reminder.related_entity_type ? (
                  <DetailLine
                    label="Linked record"
                    value={
                      isSaleReminder
                        ? "Chicken sale"
                        : labelize(reminder.related_entity_type)
                    }
                  />
                ) : null}
              </View>
              {relatedTransactionId ? (
                <Button
                  label={isSaleReminder ? "View linked sale" : "View linked purchase"}
                  variant="secondary"
                  onPress={() => {
                    if (isSaleReminder) {
                      router.push({
                        pathname: "/sales/[saleId]",
                        params: { saleId: relatedTransactionId },
                      });
                    } else {
                      router.push({
                        pathname: "/purchases/[purchaseId]",
                        params: { purchaseId: relatedTransactionId },
                      });
                    }
                  }}
                />
              ) : null}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.detailLine}>
      <AppText size="small" tone="secondary" style={styles.detailLabel}>
        {label}
      </AppText>
      <AppText
        size="small"
        weight="semibold"
        style={[styles.detailValue, { color: theme.text }]}
      >
        {value}
      </AppText>
    </View>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function labelize(value: string): string {
  return value
    .split(/[_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
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
    paddingBottom: 40,
  },
  loading: { alignItems: "center", gap: 12, padding: 36 },
  stateCard: { alignItems: "center", gap: 12, padding: 24 },
  centered: { textAlign: "center" },
  hero: { gap: 14, padding: 18, borderRadius: 12, borderLeftWidth: 4 },
  heroHeading: { flexDirection: "row", alignItems: "center", gap: 13 },
  heroIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  heroCopy: { flex: 1, minWidth: 0, gap: 2 },
  statusBadge: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 16,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  dueCallout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
  },
  dueCopy: { flex: 1, minWidth: 0, gap: 1 },
  description: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#D8DED5",
  },
  detailsCard: { gap: 13, padding: 17, borderRadius: 12 },
  detailsHeading: { flexDirection: "row", alignItems: "center", gap: 9 },
  detailsIcon: {
    width: 33,
    height: 33,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  detailList: { gap: 12, paddingTop: 12, borderTopWidth: 1 },
  detailLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  detailLabel: { flexShrink: 0 },
  detailValue: { flex: 1, minWidth: 0, textAlign: "right" },
});
