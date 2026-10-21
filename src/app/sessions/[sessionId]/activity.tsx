import { useLocalSearchParams } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSessionActivities } from "@/features/auth/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { formatRelativeDate } from "@/lib/date/format-relative-date";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";

export default function SessionActivityScreen() {
  return (
    <SessionGate>
      <SessionActivityContent />
    </SessionGate>
  );
}

function SessionActivityContent() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const activity = useSessionActivities(user?.id, sessionId);
  const items = activity.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={activity.isRefetching}
            onRefresh={() => void activity.refetch()}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <FarmPageHeader
          title="Session activity"
          showBack
          backHref="/account-details"
        />
        <AppText size="small" tone="secondary">
          Events recorded during this sign-in.
        </AppText>
        {activity.isLoading ? <LoadingState label="Loading activity" /> : null}
        {activity.isError ? (
          <Card style={styles.state}>
            <AppText weight="semibold">Couldn’t load session activity</AppText>
            <AppText size="small" tone="secondary">
              {normalizeApiError(activity.error).message}
            </AppText>
            <Button
              label="Retry"
              variant="secondary"
              onPress={() => void activity.refetch()}
            />
          </Card>
        ) : null}
        {!activity.isLoading && !activity.isError && items.length === 0 ? (
          <Card style={styles.state}>
            <AppText weight="semibold">No activity for this sign-in</AppText>
            <AppText size="small" tone="secondary">
              Actions taken during this session will appear here.
            </AppText>
          </Card>
        ) : null}
        {items.map((item) => (
          <Card key={item.id} style={styles.eventCard}>
            <View
              style={[styles.timelineMark, { backgroundColor: theme.primary }]}
            />
            <View style={styles.eventCopy}>
              <AppText weight="semibold">{humanize(item.type)}</AppText>
              <AppText size="small" tone="secondary">
                {humanize(item.entity_type)}
                {typeof item.details?.name === "string"
                  ? ` · ${item.details.name}`
                  : ""}
              </AppText>
              <AppText size="small" tone="secondary">
                {formatRelativeDate(item.created_at)} ·{" "}
                {formatDateTime(item.created_at)}
              </AppText>
            </View>
          </Card>
        ))}
        {activity.hasNextPage ? (
          <Button
            label={
              activity.isFetchingNextPage ? "Loading…" : "Load more activity"
            }
            variant="secondary"
            loading={activity.isFetchingNextPage}
            onPress={() => void activity.fetchNextPage()}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function humanize(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 36,
    gap: 12,
  },
  state: { gap: 10 },
  eventCard: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
  timelineMark: { width: 8, height: 8, borderRadius: 4, marginTop: 8 },
  eventCopy: { flex: 1, gap: 2 },
});
