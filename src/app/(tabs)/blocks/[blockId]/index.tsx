import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { FadeInDown, Layout } from "react-native-reanimated";
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
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BlockCapacityMeter } from "@/features/blocks/components/block-capacity-meter";
import { BlockMovementHistory } from "@/features/blocks/components/block-movement-history";
import { useBlock, useDeleteBlock } from "@/features/blocks/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { formatRelativeDate } from "@/lib/date/format-relative-date";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

export default function BlockDetailsRoute() {
  const { user } = useAuth();
  const dialog = useAppDialog();
  const farm = useFarm();
  const { theme } = useTheme();
  const { blockId } = useLocalSearchParams<{ blockId: string }>();
  const blockQuery = useBlock(user?.id, farm.selectedFarm?.id, blockId);
  const deleteMutation = useDeleteBlock(
    user?.id ?? "",
    farm.selectedFarm?.id ?? "",
  );
  const block = blockQuery.data;
  const canDelete = Boolean(block && block.occupied_chickens === 0);

  async function confirmDelete() {
    if (!block || !canDelete) return;
    const confirmed = await dialog.confirmDialog({
      title: "Delete block?",
      message: `“${block.name}” will be permanently removed.`,
      confirmLabel: "Delete block",
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await deleteMutation.mutateAsync(block.id);
      router.replace("/(tabs)/blocks");
    } catch (error: unknown) {
      const message = normalizeApiError(error).message;
      await dialog.showDialog({
        title: "Couldn’t delete block",
        message,
        tone: "error",
      });
    }
  }

  if (blockQuery.isLoading) return <LoadingState label="Loading block" />;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={blockQuery.isRefetching}
            onRefresh={() => void blockQuery.refetch()}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <FarmPageHeader
          title="Block details"
          showBack
          compact
          showNotifications={false}
          backHref="/(tabs)/blocks"
        />
        {blockQuery.isError ? (
          <Card style={styles.state}>
            <AppText weight="semibold">Could not load this block</AppText>
            <AppText size="small" tone="secondary">
              {normalizeApiError(blockQuery.error).message}
            </AppText>
            <Button
              label="Retry"
              variant="secondary"
              onPress={() => void blockQuery.refetch()}
            />
          </Card>
        ) : null}
        {block ? (
          <>
            <Animated.View
              entering={FadeInDown.duration(260)}
              style={styles.identitySection}
            >
            <View style={styles.titleRow}>
              <View style={styles.titleCopy}>
                <AppText size="heading" weight="semibold">
                  {block.name}
                </AppText>
              </View>
              <View
                style={[
                  styles.status,
                  {
                    backgroundColor: block.is_active
                      ? `${theme.success}1A`
                      : theme.backgroundSelected,
                  },
                ]}
              >
                <AppText
                  size="small"
                  style={{
                    color: block.is_active
                      ? theme.success
                      : theme.textSecondary,
                  }}
                >
                  {block.is_active ? "Active" : "Inactive"}
                </AppText>
              </View>
            </View>
            {block.description ? (
              <AppText size="small" tone="secondary">
                {block.description}
              </AppText>
            ) : null}
            </Animated.View>

            <Animated.View
              entering={FadeInDown.delay(45).duration(280)}
              layout={Layout.springify().damping(22)}
            >
              <Card style={styles.capacityCard}>
                <View style={styles.sectionHeading}>
                  <View style={styles.sectionHeadingCopy}>
                    <AppText size="body" weight="semibold">
                      Capacity
                    </AppText>
                    <AppText size="small" tone="secondary">
                      Current flock and room remaining
                    </AppText>
                  </View>
                  <View
                    style={[
                      styles.sectionIcon,
                      { backgroundColor: `${theme.primary}14` },
                    ]}
                  >
                    <Ionicons
                      name="speedometer-outline"
                      size={18}
                      color={theme.primary}
                    />
                  </View>
                </View>
                <BlockCapacityMeter block={block} />
                {block.over_capacity_limit > 0 ? (
                  <AppText size="small" tone="secondary">
                    Base {block.capacity.toLocaleString()} · Extra allowance{" "}
                    {block.over_capacity_limit.toLocaleString()}
                  </AppText>
                ) : null}
              </Card>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.delay(90).duration(280)}
              layout={Layout.springify().damping(22)}
            >
            <Card style={styles.detailsCard}>
              <View style={styles.sectionHeading}>
                <View style={styles.sectionHeadingCopy}>
                  <AppText size="body" weight="semibold">
                    Current flock
                  </AppText>
                  <AppText size="small" tone="secondary">
                    {block.batches.length}{" "}
                    {block.batches.length === 1 ? "batch" : "batches"}
                  </AppText>
                </View>
                <View
                  style={[
                    styles.flockTotal,
                    { backgroundColor: `${theme.primary}14` },
                  ]}
                >
                  <AppText
                    size="body"
                    weight="semibold"
                    style={{ color: theme.primary }}
                  >
                    {block.occupied_chickens.toLocaleString()}
                  </AppText>
                </View>
              </View>
              {block.batches.length ? (
                block.batches.map((batch, batchIndex) => (
                  <Animated.View
                    key={batch.batch_id}
                    entering={FadeInDown.delay(
                      Math.min(130 + batchIndex * 45, 320),
                    ).duration(240)}
                    layout={Layout.springify().damping(22)}
                    style={[
                      styles.batchCard,
                      {
                        borderBottomColor: theme.border,
                        borderBottomWidth:
                          batchIndex < block.batches.length - 1
                            ? StyleSheet.hairlineWidth
                            : 0,
                      },
                    ]}
                  >
                    <View style={styles.batchHeading}>
                      <View style={styles.batchCopy}>
                        <AppText weight="semibold">{batch.batch_name}</AppText>
                        <AppText size="small" tone="secondary">
                          {batch.chicken_type}
                          {batch.breed ? ` · ${batch.breed}` : ""}
                        </AppText>
                      </View>
                      <View
                        style={[
                          styles.batchQuantity,
                          { backgroundColor: `${theme.primary}1A` },
                        ]}
                      >
                        <AppText
                          size="small"
                          weight="semibold"
                          style={{ color: theme.primary }}
                        >
                          {batch.quantity.toLocaleString()} birds
                        </AppText>
                      </View>
                    </View>
                    <View style={styles.batchFacts}>
                      <BatchFact
                        label="Current age"
                        value={
                          batch.age_days === null
                            ? "Age not recorded"
                            : formatAge(batch.age_days)
                        }
                      />
                      <BatchFact label="Status" value={batch.status} />
                    </View>
                    {batch.notes ? (
                      <AppText
                        size="small"
                        tone="secondary"
                        numberOfLines={2}
                      >
                        {batch.notes}
                      </AppText>
                    ) : null}
                  </Animated.View>
                ))
              ) : (
                <AppText size="small" tone="secondary">
                  No chickens are currently assigned to this block.
                </AppText>
              )}
            </Card>
            </Animated.View>

            <BlockMovementHistory
              userId={user?.id}
              farmId={farm.selectedFarm?.id}
              blockId={block.id}
            />

            <Animated.View
              entering={FadeInDown.delay(150).duration(260)}
              style={[
                styles.blockMetadata,
                { borderTopColor: theme.border },
              ]}
            >
              <AppText size="small" weight="semibold" tone="secondary">
                Block information
              </AppText>
              <DetailRow
                label="Created"
                value={formatRelativeDate(block.created_at)}
              />
              <DetailRow
                label="Last updated"
                value={formatRelativeDate(block.updated_at)}
              />
            </Animated.View>

            <Animated.View
              entering={FadeInDown.delay(190).duration(260)}
              style={styles.actions}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/blocks/[blockId]/edit",
                    params: { blockId: block.id },
                  })
                }
                style={({ pressed }) => [
                  styles.editAction,
                  {
                    backgroundColor: theme.primary,
                    opacity: pressed ? 0.86 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.actionIcon,
                    { backgroundColor: `${theme.onPrimary}20` },
                  ]}
                >
                  <Ionicons
                    name="create-outline"
                    size={20}
                    color={theme.onPrimary}
                  />
                </View>
                <View style={styles.actionCopy}>
                  <AppText
                    weight="semibold"
                    style={{ color: theme.onPrimary }}
                  >
                    Edit block
                  </AppText>
                  <AppText
                    size="small"
                    style={{ color: `${theme.onPrimary}CC` }}
                  >
                    Update name, capacity or status
                  </AppText>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={19}
                  color={theme.onPrimary}
                />
              </Pressable>
              {canDelete ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: deleteMutation.isPending,
                  }}
                  disabled={deleteMutation.isPending}
                  onPress={confirmDelete}
                  style={({ pressed }) => [
                    styles.deleteAction,
                    {
                      borderColor: theme.border,
                      backgroundColor: `${theme.danger}08`,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  {deleteMutation.isPending ? (
                    <AppText size="small" style={{ color: theme.danger }}>
                      Deleting…
                    </AppText>
                  ) : (
                    <>
                      <View
                        style={[
                          styles.deleteIcon,
                          { backgroundColor: `${theme.danger}14` },
                        ]}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={17}
                          color={theme.danger}
                        />
                      </View>
                      <AppText
                        size="small"
                        weight="semibold"
                        style={{ color: theme.danger }}
                      >
                        Delete block
                      </AppText>
                    </>
                  )}
                </Pressable>
              ) : null}
            </Animated.View>
            {!canDelete ? (
              <Animated.View
                entering={FadeInDown.delay(230).duration(260)}
                style={[
                  styles.deleteGuidance,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.moveIcon,
                    { backgroundColor: `${theme.primary}18` },
                  ]}
                >
                  <Ionicons
                    name="swap-horizontal-outline"
                    size={20}
                    color={theme.primary}
                  />
                </View>
                <View style={styles.deleteCopy}>
                  <AppText weight="semibold">
                    Move chickens before deleting
                  </AppText>
                  <AppText size="small" tone="secondary">
                    {block.occupied_chickens.toLocaleString()} birds are still
                    assigned to this block.
                  </AppText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: "/chicken-movement",
                      params: { sourceBlockId: block.id },
                    })
                  }
                  style={({ pressed }) => [
                    styles.moveAction,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                      opacity: pressed ? 0.78 : 1,
                    },
                  ]}
                >
                  <Ionicons
                    name="arrow-forward-circle-outline"
                    size={19}
                    color={theme.primary}
                  />
                  <AppText
                    weight="semibold"
                    style={{ color: theme.primary }}
                  >
                    Move chickens
                  </AppText>
                  <Ionicons
                    name="chevron-forward"
                    size={17}
                    color={theme.textSecondary}
                  />
                </Pressable>
              </Animated.View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function BatchFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.batchFact}>
      <AppText size="small" tone="secondary">
        {label}
      </AppText>
      <AppText size="small" weight="semibold">
        {value}
      </AppText>
    </View>
  );
}

function formatAge(days: number): string {
  const weeks = Math.floor(days / 7);
  const remainingDays = days % 7;
  if (weeks === 0) return `${days} ${days === 1 ? "day" : "days"}`;
  return `${weeks} ${weeks === 1 ? "week" : "weeks"}${
    remainingDays
      ? ` ${remainingDays} ${remainingDays === 1 ? "day" : "days"}`
      : ""
  }`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <AppText size="small" tone="secondary">
        {label}
      </AppText>
      <AppText size="small">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 16,
    paddingBottom: 36,
    gap: 12,
  },
  state: { gap: 12 },
  identitySection: { gap: 4, paddingHorizontal: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  titleCopy: { flex: 1, gap: 3 },
  status: {
    minWidth: 70,
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 11,
    borderRadius: 16,
  },
  capacityCard: { gap: 12, paddingVertical: 14, borderRadius: 13 },
  detailsCard: { gap: 11, paddingVertical: 14, borderRadius: 13 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionHeadingCopy: { flex: 1, minWidth: 0, gap: 1 },
  sectionIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  flockTotal: {
    minWidth: 44,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  batchCard: {
    gap: 8,
    paddingVertical: 11,
  },
  batchHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  batchCopy: { flex: 1, gap: 3 },
  batchQuantity: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
  },
  batchFacts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  batchFact: { minWidth: 100, flex: 1, gap: 2 },
  detailRow: {
    minHeight: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  blockMetadata: {
    gap: 3,
    paddingHorizontal: 2,
    paddingTop: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actions: { gap: 9 },
  editAction: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  actionIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  actionCopy: { flex: 1, minWidth: 0, gap: 1 },
  deleteGuidance: {
    gap: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
  },
  moveIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  deleteCopy: { gap: 2 },
  moveAction: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  deleteAction: {
    minHeight: 50,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 10,
  },
  deleteIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
});
