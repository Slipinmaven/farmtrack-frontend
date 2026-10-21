import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  actionTextTones,
  categoryIcons,
  entityColors,
  getActivityChangeIntro,
  getActivityChanges,
  getActivityEntries,
  getActivityDetailFields,
  getActivityEntriesTitle,
  getActivityFactsTitle,
  getActivityLabel,
  getActivityNarrative,
  getActivityProductTotals,
  getActivityRelatedDestination,
  getActivityRelatedDestinationLabel,
  getEntityLabel,
} from "@/features/management/activity-presentation";
import { useFarmActivity } from "@/features/management/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

export default function ActivityDetailsScreen() {
  const auth = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ activityId?: string }>();
  const activityId =
    typeof params.activityId === "string" ? params.activityId : undefined;
  const activityQuery = useFarmActivity(
    auth.user?.id,
    farm.selectedFarm?.id,
    activityId,
  );
  const activity = activityQuery.data;

  const actionTone = activity ? actionTextTones[activity.type] : undefined;
  const actionColor =
    actionTone === "danger"
      ? theme.mode === "dark"
        ? "#FF9B91"
        : theme.danger
      : actionTone === "success"
        ? theme.mode === "dark"
          ? "#8FD0A5"
          : theme.success
        : actionTone === "updated"
          ? theme.mode === "dark"
            ? "#83C8ED"
            : "#286B91"
          : theme.text;
  const isEggCollection = activity?.type === "egg_collection_recorded";
  const detailFields = activity ? getActivityDetailFields(activity) : [];
  const changes = getActivityChanges(activity?.details ?? null);
  const changeIntro = activity ? getActivityChangeIntro(activity) : "";
  const activitySummary = activity ? getActivityNarrative(activity) : "";
  const activityEntries = activity ? getActivityEntries(activity) : [];
  const productTotals = isEggCollection
    ? getActivityProductTotals(activity?.details ?? null)
    : [];
  const relatedDestination = activity
    ? getActivityRelatedDestination(activity)
    : null;
  const recordedAt = activity ? new Date(activity.created_at) : null;
  const formattedDate =
    recordedAt && !Number.isNaN(recordedAt.getTime())
      ? new Intl.DateTimeFormat(undefined, {
          dateStyle: "full",
          timeStyle: "short",
        }).format(recordedAt)
      : "Time unavailable";

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={activityQuery.isRefetching}
            onRefresh={() => void activityQuery.refetch()}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <FarmPageHeader title="Activity details" showBack />

        {!farm.selectedFarm ? (
          <Card style={styles.state}>
            <AppText weight="semibold">Choose a farm</AppText>
            <AppText size="small" tone="secondary">
              Select a farm to view this activity.
            </AppText>
          </Card>
        ) : activityQuery.isLoading ? (
          <LoadingState label="Loading activity details" />
        ) : activityQuery.isError || !activity ? (
          <Card style={styles.state}>
            <AppText weight="semibold">Couldn’t load this activity</AppText>
            <AppText size="small" tone="secondary">
              {activityQuery.error
                ? normalizeApiError(activityQuery.error).message
                : "This activity may no longer be available for the selected farm."}
            </AppText>
            <View style={styles.actions}>
              <Button
                label="Try again"
                variant="secondary"
                onPress={() => void activityQuery.refetch()}
              />
              <Button
                label="Activity history"
                onPress={() => router.replace("/activities")}
              />
            </View>
          </Card>
        ) : (
          <>
            <Card style={styles.hero}>
              <View style={styles.heroTopline}>
                <View
                  style={[
                    styles.heroIcon,
                    {
                      backgroundColor:
                        entityColors[activity.entity_type] ?? "#526477",
                    },
                  ]}
                >
                  <Ionicons
                    name={categoryIcons[activity.entity_type] ?? "time-outline"}
                    size={23}
                    color="#FFFFFF"
                  />
                </View>
                <View style={styles.heroCopy}>
                  <AppText size="small" weight="semibold" tone="secondary">
                    {getEntityLabel(activity.entity_type).toUpperCase()}
                  </AppText>
                  <AppText
                    size="heading"
                    weight="semibold"
                    style={[styles.title, { color: actionColor }]}
                  >
                    {getActivityLabel(activity.type)}
                  </AppText>
                </View>
              </View>
              {activitySummary ? (
                <AppText style={styles.heroSummary}>{activitySummary}</AppText>
              ) : null}
              <View
                style={[
                  styles.timestamp,
                  { borderTopColor: theme.border },
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={16}
                  color={theme.textSecondary}
                />
                <AppText size="small" tone="secondary">
                  {formattedDate}
                </AppText>
              </View>
            </Card>

            {changes.length ? (
              <Card style={styles.detailsCard}>
                <View style={styles.sectionHeader}>
                  <View
                    style={[
                      styles.sectionIcon,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <Ionicons
                      name="git-compare-outline"
                      size={18}
                      color={theme.primary}
                    />
                  </View>
                  <View style={styles.sectionTitleCopy}>
                    <AppText weight="semibold">What changed</AppText>
                    <AppText size="small" tone="secondary">
                      {changeIntro}
                    </AppText>
                  </View>
                </View>
                <View style={styles.changeList}>
                  {changes.map((change, index) => (
                    <View key={`${change.field}-${index}`} style={styles.changeItem}>
                      <AppText size="small" weight="semibold" tone="secondary">
                        {change.field}
                      </AppText>
                      <View style={styles.changeValues}>
                        <View
                          style={[
                            styles.changeValueBlock,
                            { backgroundColor: theme.backgroundSelected },
                          ]}
                        >
                          <AppText size="small" tone="secondary">
                            Before
                          </AppText>
                          <AppText style={styles.changeValue} numberOfLines={3}>
                            {change.from}
                          </AppText>
                        </View>
                        <View
                          style={[
                            styles.changeArrow,
                            { backgroundColor: theme.backgroundSelected },
                          ]}
                        >
                          <Ionicons
                            name="arrow-forward"
                            size={15}
                            color={theme.primary}
                          />
                        </View>
                        <View
                          style={[
                            styles.changeValueBlock,
                            styles.afterValue,
                            { backgroundColor: theme.backgroundSelected },
                          ]}
                        >
                          <AppText size="small" tone="secondary">
                            After
                          </AppText>
                          <AppText
                            style={[styles.changeValue, styles.afterText]}
                            numberOfLines={3}
                          >
                            {change.to}
                          </AppText>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}

            {isEggCollection && productTotals.length ? (
              <Card style={styles.detailsCard}>
                <View style={styles.sectionHeader}>
                  <View
                    style={[
                      styles.sectionIcon,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <Ionicons
                      name="stats-chart-outline"
                      size={18}
                      color={theme.primary}
                    />
                  </View>
                  <View style={styles.sectionTitleCopy}>
                    <AppText weight="semibold">Collection totals</AppText>
                    <AppText size="small" tone="secondary">
                      Combined quantity by product
                    </AppText>
                  </View>
                </View>
                <View style={styles.productTotals}>
                  {productTotals.map((total) => (
                    <View
                      key={total.product}
                      style={[
                        styles.productTotal,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <AppText size="small" tone="secondary">
                        {total.product}
                      </AppText>
                      <AppText weight="semibold" style={styles.totalQuantity}>
                        {total.quantity}
                      </AppText>
                      <AppText size="small" tone="secondary">
                        {total.unit || "Collected"}
                      </AppText>
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}

            {activityEntries.length ? (
              <Card style={styles.detailsCard}>
                <View style={styles.sectionHeader}>
                  <View
                    style={[
                      styles.sectionIcon,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <Ionicons
                      name={categoryIcons[activity.entity_type] ?? "list-outline"}
                      size={18}
                      color={theme.primary}
                    />
                  </View>
                  <View style={styles.sectionTitleCopy}>
                    <AppText weight="semibold">
                      {getActivityEntriesTitle(activity)}
                    </AppText>
                    <AppText size="small" tone="secondary">
                      {activityEntries.length}{" "}
                      {activityEntries.length === 1 ? "entry" : "entries"}
                    </AppText>
                  </View>
                </View>
                <View style={styles.collectionEntries}>
                  {activityEntries.map((entry) => (
                    <View
                      key={entry.number}
                      style={[
                        styles.collectionEntry,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <View style={styles.collectionEntryHeading}>
                        <View style={styles.collectionEntryTitle}>
                          <AppText weight="semibold">{entry.title}</AppText>
                          {entry.subtitle ? (
                            <AppText size="small" tone="secondary">
                              {entry.subtitle}
                            </AppText>
                          ) : null}
                        </View>
                      </View>
                      {entry.fields.length ? (
                        <View
                          style={[
                            styles.entryFields,
                            { borderTopColor: theme.border },
                          ]}
                        >
                          {entry.fields.map((field) => (
                            <View
                              key={`${entry.number}-${field.label}`}
                              style={styles.entryField}
                            >
                              <AppText size="small" tone="secondary">
                                {field.label}
                              </AppText>
                              <AppText
                                weight="semibold"
                                style={styles.entryFieldValue}
                              >
                                {field.value}
                              </AppText>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      {entry.note ? (
                        <View style={styles.collectionNote}>
                          <Ionicons
                            name="chatbubble-ellipses-outline"
                            size={15}
                            color={theme.textSecondary}
                          />
                          <AppText size="small" tone="secondary" style={styles.noteText}>
                            {entry.note}
                          </AppText>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}

            {detailFields.length ? (
              <Card style={styles.detailsCard}>
                <View style={styles.sectionHeader}>
                  <View
                    style={[
                      styles.sectionIcon,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <Ionicons
                      name="reader-outline"
                      size={18}
                      color={theme.primary}
                    />
                  </View>
                  <View style={styles.sectionTitleCopy}>
                    <AppText weight="semibold">
                      {getActivityFactsTitle(activity)}
                    </AppText>
                    <AppText size="small" tone="secondary">
                      The key information recorded for this event
                    </AppText>
                  </View>
                </View>
                <View style={styles.detailRows}>
                  {detailFields.map((field, index) => (
                    <View
                      key={`${field.label}-${index}`}
                      style={[
                        styles.detailRow,
                        index > 0 && { borderTopColor: theme.border },
                      ]}
                    >
                      <AppText
                        size="small"
                        tone="secondary"
                        style={styles.detailLabel}
                      >
                        {field.label}
                      </AppText>
                      <AppText
                        weight="semibold"
                        style={styles.detailValue}
                      >
                        {field.value}
                      </AppText>
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}

            {!changes.length &&
            !detailFields.length &&
            !activityEntries.length &&
            !productTotals.length ? (
              <Card style={styles.detailsCard}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="reader-outline" size={19} color={theme.primary} />
                  <AppText weight="semibold">
                    {getActivityFactsTitle(activity)}
                  </AppText>
                </View>
                <AppText size="small" tone="secondary">
                  No additional details were captured for this activity.
                </AppText>
              </Card>
            ) : null}

            {relatedDestination ? (
              <Button
                label={getActivityRelatedDestinationLabel(activity)}
                onPress={() => router.push(relatedDestination)}
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
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
  state: { gap: 9 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  hero: { gap: 16, borderRadius: 16, padding: 18 },
  heroTopline: { flexDirection: "row", alignItems: "center", gap: 13 },
  heroCopy: { flex: 1, gap: 3 },
  heroIcon: {
    width: 50,
    height: 50,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { lineHeight: 30 },
  heroSummary: { fontSize: 16, lineHeight: 23 },
  timestamp: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  detailsCard: { gap: 16, borderRadius: 16, padding: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitleCopy: { flex: 1, gap: 1 },
  changeList: { gap: 10 },
  changeItem: { gap: 7 },
  changeValues: { flexDirection: "row", alignItems: "stretch", gap: 7 },
  changeValueBlock: {
    flex: 1,
    minWidth: 0,
    minHeight: 68,
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 11,
  },
  changeArrow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  afterValue: { borderWidth: 1, borderColor: "#71A88A" },
  changeValue: { flexShrink: 1, fontSize: 14, lineHeight: 19 },
  afterText: { fontWeight: "600" },
  productTotals: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  productTotal: {
    flexGrow: 1,
    flexBasis: "44%",
    minWidth: 130,
    gap: 4,
    padding: 12,
    borderRadius: 12,
  },
  totalQuantity: { fontSize: 20, lineHeight: 26 },
  collectionEntries: { gap: 10 },
  collectionEntry: { gap: 11, padding: 13, borderRadius: 13 },
  collectionEntryHeading: { flexDirection: "row", alignItems: "center" },
  collectionEntryTitle: { flex: 1, gap: 3 },
  entryFields: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    gap: 8,
  },
  entryField: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  entryFieldValue: { flex: 1, textAlign: "right" },
  collectionNote: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  noteText: { flex: 1 },
  detailRows: { gap: 0 },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  detailLabel: { width: "38%" },
  detailValue: { flex: 1, textAlign: "right", fontSize: 14, lineHeight: 19 },
});
