import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
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
import type {
  ChickenSaleBatch,
  ChickenSaleOptions,
} from "@/features/chickens/api";
import { useChickenSaleOptions } from "@/features/chickens/hooks";
import type { FarmActivity } from "@/features/management/api";
import { useFarmActivities } from "@/features/management/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { formatRelativeDate } from "@/lib/date/format-relative-date";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type InventoryView = "blocks" | "batches";
const emptyBlocks: ChickenSaleOptions["blocks"] = [];
const emptyBatches: ChickenSaleOptions["batches"] = [];

const activityLabels: Record<string, string> = {
  chicken_movement_created: "Chickens moved",
  chicken_loss_recorded: "Chicken loss recorded",
};

export default function FlockScreen() {
  return (
    <SessionGate>
      <FlockContent />
    </SessionGate>
  );
}

function FlockContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const [inventoryView, setInventoryView] = useState<InventoryView>("blocks");
  const options = useChickenSaleOptions(user?.id, farm.selectedFarm?.id);
  const activity = useFarmActivities(
    user?.id,
    farm.selectedFarm?.id,
    "",
    "flock",
    undefined,
    undefined,
  );
  const blocks = options.data?.blocks ?? emptyBlocks;
  const batches = options.data?.batches ?? emptyBatches;
  const totalBirds = blocks.reduce(
    (total, block) => total + block.current_chickens,
    0,
  );
  const ratedCapacity = blocks.reduce(
    (total, block) => total + block.capacity,
    0,
  );
  const maximumCapacity = blocks.reduce(
    (total, block) => total + block.maximum_chickens,
    0,
  );
  const birdsOverRatedCapacity = blocks.reduce(
    (total, block) =>
      total +
      (block.capacity > 0
        ? Math.max(0, block.current_chickens - block.capacity)
        : 0),
    0,
  );
  const blocksOverRatedCapacity = blocks.filter(
    (block) => block.capacity > 0 && block.current_chickens > block.capacity,
  ).length;
  const blocksOverMaximum = blocks.filter(
    (block) => block.current_chickens > block.maximum_chickens,
  ).length;
  const birdsOverMaximum = blocks.reduce(
    (total, block) =>
      total + Math.max(0, block.current_chickens - block.maximum_chickens),
    0,
  );
  const maximumCapacityUsed =
    maximumCapacity > 0
      ? Math.min(100, (totalBirds / maximumCapacity) * 100)
      : 0;
  const standardCapacityUsed =
    ratedCapacity > 0
      ? Math.min(100, (totalBirds / ratedCapacity) * 100)
      : maximumCapacityUsed;
  const birdsToRatedLimit = Math.max(0, ratedCapacity - totalBirds);
  const activeBlockCount = blocks.filter(
    (block) => block.current_chickens > 0,
  ).length;
  const recentActivities = activity.data?.pages.flatMap((page) => page.items) ?? [];
  const recentMovements = recentActivities.filter(
    (entry) => entry.type === "chicken_movement_created",
  ).length;
  const recentLosses = recentActivities.filter(
    (entry) => entry.type === "chicken_loss_recorded",
  );
  const recentLossBirds = recentLosses.reduce((total, entry) => {
    const quantity = Number(entry.details?.total_quantity ?? 0);
    return total + (Number.isFinite(quantity) ? quantity : 0);
  }, 0);
  const blockNames = new Map(blocks.map((block) => [block.id, block.name]));
  const batchNames = new Map(batches.map((batch) => [batch.id, batch.name]));

  async function refresh() {
    await Promise.all([options.refetch(), activity.refetch()]);
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={options.isRefetching || activity.isRefetching}
            onRefresh={() => void refresh()}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <FarmPageHeader title="Chickens" />

        <View style={styles.pageHeading}>
          <View style={styles.headingCopy}>
            <AppText size="heading" weight="semibold">
              Flock overview
            </AppText>
            <AppText size="small" tone="secondary">
              Live inventory, housing, batches and recent activity
            </AppText>
          </View>
          {options.isFetching || activity.isFetching ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : null}
        </View>

        {options.isError ? (
          <Card style={styles.stateCard}>
            <Ionicons
              name="cloud-offline-outline"
              size={24}
              color={theme.danger}
            />
            <AppText weight="semibold">Couldn’t load chicken inventory</AppText>
            <AppText size="small" tone="secondary">
              {normalizeApiError(options.error).message}
            </AppText>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => void options.refetch()}
            />
          </Card>
        ) : null}

        {options.isLoading ? (
          <Card style={styles.stateCard}>
            <ActivityIndicator color={theme.primary} />
            <AppText size="small" tone="secondary">
              Loading flock inventory…
            </AppText>
          </Card>
        ) : null}

        {options.data ? (
          <>
            <Card style={styles.flockSummary}>
              <View style={styles.flockHero}>
                <View
                  style={[
                    styles.totalBirdIcon,
                    { backgroundColor: theme.primary },
                  ]}
                >
                  <Ionicons name="leaf-outline" size={22} color={theme.onPrimary} />
                </View>
                <View style={styles.totalBirdCopy}>
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{ color: theme.textSecondary }}
                  >
                    CURRENT FLOCK
                  </AppText>
                  <View style={styles.flockTotalLine}>
                    <AppText
                      style={[styles.totalBirdValue, { color: theme.text }]}
                    >
                      {totalBirds.toLocaleString()}
                    </AppText>
                    <AppText size="small" tone="secondary">
                      birds housed
                    </AppText>
                  </View>
                </View>
              </View>

              <View style={styles.capacityInsight}>
                <View style={styles.capacityInsightHeading}>
                  <View style={styles.capacityInsightTitle}>
                    <Ionicons
                      name="speedometer-outline"
                      size={17}
                      color={theme.primary}
                    />
                    <AppText size="small" weight="semibold" numberOfLines={1}>
                      Housing capacity
                    </AppText>
                  </View>
                  <View
                    style={[
                      styles.capacityStatusBadge,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <View
                      style={[
                        styles.capacityStatusDot,
                        {
                          backgroundColor:
                            blocksOverMaximum > 0
                              ? theme.danger
                              : blocksOverRatedCapacity > 0
                                ? theme.secondary
                                : ratedCapacity > 0
                                  ? theme.success
                                  : theme.textSecondary,
                        },
                      ]}
                    />
                    <AppText size="small" weight="semibold" numberOfLines={1}>
                      {blocksOverMaximum > 0
                        ? "Over maximum"
                        : blocksOverRatedCapacity > 0
                          ? "Extra allowance"
                          : ratedCapacity > 0
                            ? "Within standard"
                            : "Capacity not set"}
                    </AppText>
                  </View>
                </View>
                <View style={styles.capacityDataRow}>
                  <AppText size="small" tone="secondary">
                    {ratedCapacity > 0
                      ? "Used"
                      : maximumCapacity > 0
                        ? "Maximum used"
                        : "Not configured"}
                  </AppText>
                  <AppText weight="semibold">
                    {maximumCapacity > 0
                      ? `${standardCapacityUsed.toFixed(0)}%`
                      : "—"}
                  </AppText>
                </View>
                {maximumCapacity > 0 ? (
                  <View
                    style={[
                      styles.summaryCapacityTrack,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <View
                      style={[
                        styles.capacityFill,
                        {
                          width: `${standardCapacityUsed}%`,
                          backgroundColor:
                            blocksOverMaximum > 0
                              ? theme.danger
                              : blocksOverRatedCapacity > 0
                                ? theme.secondary
                                : theme.mode === "dark"
                                  ? "#FFFFFF"
                                  : theme.primary,
                        },
                      ]}
                    />
                  </View>
                ) : null}
                <AppText size="small" tone="secondary" numberOfLines={2}>
                  {maximumCapacity <= 0
                    ? "Set block capacity to track space."
                    : blocksOverMaximum > 0
                      ? `${birdsOverMaximum.toLocaleString()} above max · ${blocksOverMaximum} ${blocksOverMaximum === 1 ? "block" : "blocks"}`
                      : birdsOverRatedCapacity > 0
                        ? `${birdsOverRatedCapacity.toLocaleString()} above standard · ${blocksOverRatedCapacity} ${blocksOverRatedCapacity === 1 ? "block" : "blocks"}`
                        : ratedCapacity > 0
                          ? `${birdsToRatedLimit.toLocaleString()} standard spaces left`
                          : `Maximum ${maximumCapacity.toLocaleString()} birds`}
                </AppText>
              </View>

              <View style={styles.summaryStats}>
                <SummaryStat
                  label="Active batches"
                  value={batches.length.toLocaleString()}
                  icon="layers-outline"
                  accent={theme.secondary}
                  theme={theme}
                />
                <SummaryStat
                  label="Blocks occupied"
                  value={`${activeBlockCount} / ${blocks.length}`}
                  icon="grid-outline"
                  accent={theme.primary}
                  theme={theme}
                />
              </View>
            </Card>

            <View style={styles.actionGrid}>
              <ActionButton
                label="Purchase"
                icon="cart-outline"
                color={theme.primary}
                onPress={() => router.push("/chicken-purchase" as Href)}
                theme={theme}
              />
              <ActionButton
                label="Sale"
                icon="cash-outline"
                color={theme.success}
                onPress={() => router.push("/chicken-sale" as Href)}
                theme={theme}
              />
              <ActionButton
                label="Record loss"
                icon="alert-circle-outline"
                color={theme.danger}
                onPress={() => router.push("/chicken-loss" as Href)}
                theme={theme}
              />
              <ActionButton
                label="Move flock"
                icon="swap-horizontal-outline"
                color={theme.secondary}
                onPress={() => router.push("/chicken-movement" as Href)}
                theme={theme}
              />
            </View>

            <Card style={styles.inventoryCard}>
              <View style={styles.sectionHeading}>
                <View style={styles.headingCopy}>
                  <AppText weight="semibold">Chicken inventory</AppText>
                  <AppText size="small" tone="secondary">
                    Review flock by housing block or batch
                  </AppText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Manage blocks"
                  onPress={() => router.push("/(tabs)/blocks" as Href)}
                  style={styles.textAction}
                >
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{ color: theme.primary }}
                  >
                    Blocks
                  </AppText>
                  <Ionicons
                    name="chevron-forward"
                    size={15}
                    color={theme.primary}
                  />
                </Pressable>
              </View>

              <View
                style={[
                  styles.segmented,
                  { backgroundColor: theme.background, borderColor: theme.border },
                ]}
              >
                <SegmentButton
                  label="By block"
                  icon="grid-outline"
                  selected={inventoryView === "blocks"}
                  onPress={() => setInventoryView("blocks")}
                  theme={theme}
                />
                <SegmentButton
                  label="By batch"
                  icon="layers-outline"
                  selected={inventoryView === "batches"}
                  onPress={() => setInventoryView("batches")}
                  theme={theme}
                />
              </View>

              {inventoryView === "blocks" ? (
                blocks.length ? (
                  <View style={styles.inventoryList}>
                    {blocks.map((block) => {
                      const blockBatches = batches.flatMap((batch) =>
                        batch.stocks
                          .filter((stock) => stock.block_id === block.id)
                          .map((stock) => ({ batch, quantity: stock.quantity })),
                      );
                      const maximum = block.maximum_chickens;
                      const occupancy = maximum
                        ? Math.min(100, (block.current_chickens / maximum) * 100)
                        : 0;
                      const birdsAboveRated = Math.max(
                        0,
                        block.capacity > 0
                          ? block.current_chickens - block.capacity
                          : 0,
                      );
                      const birdsAboveMaximum = Math.max(
                        0,
                        block.current_chickens - maximum,
                      );
                      const blockStatusColor =
                        birdsAboveMaximum > 0
                          ? theme.danger
                          : birdsAboveRated > 0
                            ? theme.secondary
                            : block.capacity > 0
                              ? theme.success
                              : theme.textSecondary;
                      const blockCapacityMessage =
                        birdsAboveMaximum > 0
                          ? `${birdsAboveMaximum.toLocaleString()} birds above maximum`
                          : block.capacity <= 0
                            ? "Capacity not set"
                          : birdsAboveRated > 0
                            ? `Using extra allowance · ${birdsAboveRated.toLocaleString()} birds above standard`
                            : `${Math.max(0, block.capacity - block.current_chickens).toLocaleString()} standard spaces available`;
                      return (
                        <Pressable
                          key={block.id}
                          accessibilityRole="button"
                          accessibilityLabel={`${block.name}, ${block.current_chickens} chickens, view block details`}
                          onPress={() =>
                            router.push(`/(tabs)/blocks/${block.id}` as Href)
                          }
                          style={[
                            styles.inventoryItem,
                            {
                              borderColor: theme.border,
                              backgroundColor: theme.backgroundElement,
                            },
                          ]}
                        >
                          <View style={styles.inventoryItemHeading}>
                            <View style={styles.inventoryItemIcon}>
                              <Ionicons
                                name="grid-outline"
                                size={18}
                                color={theme.primary}
                              />
                            </View>
                            <View style={styles.inventoryItemCopy}>
                              <AppText weight="semibold" numberOfLines={1}>
                                {block.name}
                              </AppText>
                              <AppText size="small" tone="secondary" numberOfLines={1}>
                                {maximum
                                  ? `${Math.round(occupancy)}% of maximum`
                                  : "Maximum not set"}
                              </AppText>
                            </View>
                            <AppText
                              weight="semibold"
                              style={[styles.inventoryNumber, { color: theme.text }]}
                            >
                              {block.current_chickens.toLocaleString()}
                            </AppText>
                            <Ionicons
                              name="chevron-forward"
                              size={16}
                              color={theme.textSecondary}
                            />
                          </View>
                          <View
                            style={[
                              styles.capacityTrack,
                              { backgroundColor: theme.backgroundSelected },
                            ]}
                          >
                            <View
                              style={[
                                styles.capacityFill,
                                {
                                  width: `${occupancy}%`,
                                  backgroundColor: blockStatusColor,
                                },
                              ]}
                            />
                            {maximum > 0 ? (
                              <View
                                style={[
                                  styles.ratedCapacityMarker,
                                  {
                                    left: `${Math.min(100, (block.capacity / maximum) * 100)}%`,
                                    backgroundColor: theme.text,
                                  },
                                ]}
                              />
                            ) : null}
                          </View>
                          <View style={styles.blockCapacityMessage}>
                            <View
                              style={[
                                styles.capacityStatusDot,
                                { backgroundColor: blockStatusColor },
                              ]}
                            />
                            <AppText
                              size="small"
                              tone="secondary"
                              style={styles.blockCapacityText}
                            >
                              {blockCapacityMessage}
                            </AppText>
                          </View>
                          <View style={styles.batchPreview}>
                            {blockBatches.length ? (
                              blockBatches.slice(0, 3).map(({ batch, quantity }) => (
                                <View
                                  key={batch.id}
                                  style={[
                                    styles.batchChip,
                                    { backgroundColor: theme.backgroundSelected },
                                  ]}
                                >
                                  <AppText size="small" numberOfLines={1}>
                                    {batch.name}
                                  </AppText>
                                  <AppText
                                    size="small"
                                    weight="semibold"
                                    style={{ color: theme.primary }}
                                  >
                                    {quantity.toLocaleString()}
                                  </AppText>
                                </View>
                              ))
                            ) : (
                              <AppText size="small" tone="secondary" numberOfLines={1}>
                                No active batches in this block
                              </AppText>
                            )}
                            {blockBatches.length > 3 ? (
                              <AppText size="small" tone="secondary">
                                +{blockBatches.length - 3} more
                              </AppText>
                            ) : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <EmptyInventory
                    title="No blocks available"
                    description="Create a block to start organizing your flock by housing area."
                    action="Add a block"
                    onPress={() => router.push("/(tabs)/blocks/new" as Href)}
                  />
                )
              ) : batches.length ? (
                <View style={styles.inventoryList}>
                  {batches.map((batch) => {
                    const total = batch.stocks.reduce(
                      (sum, stock) => sum + stock.quantity,
                      0,
                    );
                    return (
                      <BatchInventoryCard
                        key={batch.id}
                        batch={batch}
                        total={total}
                        flockTotal={totalBirds}
                        theme={theme}
                      />
                    );
                  })}
                </View>
              ) : (
                <EmptyInventory
                  title="No active chicken batches"
                  description="Record a chicken purchase to add a batch to the flock."
                  action="Record purchase"
                  onPress={() => router.push("/chicken-purchase" as Href)}
                />
              )}
            </Card>
          </>
        ) : null}

        <Card style={styles.activityCard}>
          <View style={styles.sectionHeading}>
            <View style={styles.headingCopy}>
              <AppText weight="semibold">Recent flock activity</AppText>
              <AppText size="small" tone="secondary">
                Moves and losses
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View all flock activity"
              onPress={() => openActivityHistory("flock")}
              style={[
                styles.activityHistoryAction,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                View all
              </AppText>
              <Ionicons name="chevron-forward" size={15} color={theme.primary} />
            </Pressable>
          </View>

          {!activity.isLoading && !activity.isError && recentActivities.length ? (
            <View
              style={[
                styles.activityInsight,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.activityInsightStats}>
                <View
                  style={[
                    styles.activityMetric,
                    { backgroundColor: theme.backgroundElement },
                  ]}
                >
                  <AppText
                    weight="semibold"
                    style={[styles.activityMetricValue, { color: theme.text }]}
                  >
                    {recentMovements.toLocaleString()}
                  </AppText>
                  <AppText size="small" tone="secondary">
                    Move records
                  </AppText>
                </View>
                <View
                  style={[
                    styles.activityMetric,
                    { backgroundColor: theme.backgroundElement },
                  ]}
                >
                  <AppText
                    weight="semibold"
                    style={[
                      styles.activityMetricValue,
                      { color: recentLossBirds > 0 ? theme.danger : theme.text },
                    ]}
                  >
                    {recentLossBirds.toLocaleString()}
                  </AppText>
                  <AppText size="small" tone="secondary">
                    Birds lost
                  </AppText>
                </View>
              </View>
              <AppText size="small" tone="secondary">
                Across {recentActivities.length} loaded flock records; this is
                not a date-range total.
              </AppText>
            </View>
          ) : null}

          {activity.isLoading ? (
            <View style={styles.activityLoading}>
              <ActivityIndicator size="small" color={theme.primary} />
              <AppText size="small" tone="secondary">
                Loading flock activity…
              </AppText>
            </View>
          ) : null}
          {activity.isError ? (
            <View style={styles.stateInline}>
              <AppText size="small" weight="semibold">
                Couldn’t load flock activity
              </AppText>
              <AppText size="small" tone="secondary">
                {normalizeApiError(activity.error).message}
              </AppText>
              <Button
                label="Retry activity"
                variant="secondary"
                onPress={() => void activity.refetch()}
              />
            </View>
          ) : null}
          {!activity.isLoading && !activity.isError && recentActivities.length ? (
            <View style={styles.activityList}>
              {recentActivities.slice(0, 8).map((entry) => (
                <ActivityRow
                  key={entry.id}
                  entry={entry}
                  batchName={activityBatchName(entry, batchNames)}
                  fromBlockName={activityBlockName(
                    entry,
                    "from_block_id",
                    blockNames,
                  )}
                  toBlockName={activityBlockName(
                    entry,
                    "to_block_id",
                    blockNames,
                  )}
                  onPress={() => openActivityHistory("flock", entry)}
                  theme={theme}
                />
              ))}
            </View>
          ) : null}
          {!activity.isLoading &&
          !activity.isError &&
          recentActivities.length === 0 ? (
            <View style={styles.emptyActivity}>
              <Ionicons
                name="file-tray-outline"
                size={22}
                color={theme.textSecondary}
              />
              <AppText
                size="small"
                tone="secondary"
                style={styles.emptyActivityCopy}
              >
                Chicken movements and losses will appear here as they’re recorded.
              </AppText>
            </View>
          ) : null}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryStat({
  label,
  value,
  icon,
  accent,
  theme,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  theme: ReturnType<typeof useTheme>["theme"];
}) {
  return (
    <View style={styles.summaryStat}>
      <View style={[styles.summaryStatIcon, { backgroundColor: `${accent}18` }]}>
        <Ionicons
          name={icon}
          size={15}
          color={theme.mode === "dark" ? theme.onPrimary : accent}
        />
      </View>
      <AppText size="small" tone="secondary" numberOfLines={1} style={styles.summaryStatLabel}>
        {label}
      </AppText>
      <AppText
        size="small"
        weight="semibold"
        numberOfLines={1}
        style={[styles.summaryStatValue, { color: theme.text }]}
      >
        {value}
      </AppText>
    </View>
  );
}

function ActionButton({
  label,
  icon,
  color,
  onPress,
  theme,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>["theme"];
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        {
          borderColor: theme.border,
          backgroundColor: pressed
            ? theme.backgroundSelected
            : theme.backgroundElement,
        },
      ]}
    >
      <View style={[styles.actionIcon, { backgroundColor: `${color}1A` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <AppText size="small" weight="semibold" numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

function SegmentButton({
  label,
  icon,
  selected,
  onPress,
  theme,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>["theme"];
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.segmentButton,
        selected
          ? { backgroundColor: theme.backgroundElement, borderColor: theme.border }
          : { borderColor: "transparent" },
      ]}
    >
      <Ionicons
        name={icon}
        size={16}
        color={selected ? theme.primary : theme.textSecondary}
      />
      <AppText
        size="small"
        weight={selected ? "semibold" : "regular"}
        style={selected ? { color: theme.primary } : undefined}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function BatchInventoryCard({
  batch,
  total,
  flockTotal,
  theme,
}: {
  batch: ChickenSaleBatch;
  total: number;
  flockTotal: number;
  theme: ReturnType<typeof useTheme>["theme"];
}) {
  const flockShare =
    flockTotal > 0 ? Math.min(100, (total / flockTotal) * 100) : 0;
  return (
    <View
      style={[
        styles.batchCard,
        { borderColor: theme.border, backgroundColor: theme.backgroundElement },
      ]}
    >
      <View style={styles.batchHeader}>
        <View style={[styles.batchIcon, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name="layers-outline" size={18} color={theme.primary} />
        </View>
        <View style={styles.batchHeaderCopy}>
          <AppText weight="semibold" numberOfLines={1}>
            {batch.name}
          </AppText>
          <AppText size="small" tone="secondary">
            {labelize(batch.chicken_type)}
            {batch.hatch_date ? ` · ${formatAge(batch.hatch_date)}` : " · Age unknown"}
          </AppText>
        </View>
        <View style={styles.batchTotal}>
          <AppText weight="semibold" style={{ color: theme.text }}>
            {total.toLocaleString()}
          </AppText>
          <AppText size="small" tone="secondary">
            birds
          </AppText>
        </View>
      </View>
      <View style={styles.batchShare}>
        <View
          style={[
            styles.batchShareTrack,
            styles.capacityTrack,
            { backgroundColor: theme.backgroundSelected },
          ]}
        >
          <View
            style={[
              styles.capacityFill,
              {
                width: `${flockShare}%`,
                backgroundColor:
                  theme.mode === "dark" ? "#FFFFFF" : theme.primary,
              },
            ]}
          />
        </View>
        <AppText size="small" tone="secondary" numberOfLines={1}>
          {flockShare.toFixed(0)}% of current flock
        </AppText>
      </View>
      <View style={[styles.batchAllocationDivider, { borderTopColor: theme.border }]} />
      <AppText size="small" weight="semibold" numberOfLines={1}>
        Housing allocation · {batch.stocks.length}{" "}
        {batch.stocks.length === 1 ? "block" : "blocks"}
      </AppText>
      {batch.stocks.map((stock) => (
        <View key={stock.block_id} style={styles.stockRow}>
          <View style={styles.stockBlock}>
            <Ionicons
              name="grid-outline"
              size={14}
              color={theme.textSecondary}
            />
            <AppText size="small" tone="secondary" numberOfLines={1}>
              {stock.block_name}
            </AppText>
          </View>
          <AppText size="small" weight="semibold" style={{ color: theme.text }}>
            {stock.quantity.toLocaleString()} birds
          </AppText>
        </View>
      ))}
    </View>
  );
}

function EmptyInventory({
  title,
  description,
  action,
  onPress,
}: {
  title: string;
  description: string;
  action: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.emptyInventory}>
      <Ionicons name="leaf-outline" size={24} color={theme.textSecondary} />
      <AppText weight="semibold">{title}</AppText>
      <AppText size="small" tone="secondary" style={styles.emptyCopy}>
        {description}
      </AppText>
      <Button label={action} variant="secondary" onPress={onPress} />
    </View>
  );
}

function ActivityRow({
  entry,
  batchName,
  fromBlockName,
  toBlockName,
  onPress,
  theme,
}: {
  entry: FarmActivity;
  batchName: string | undefined;
  fromBlockName: string | undefined;
  toBlockName: string | undefined;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>["theme"];
}) {
  const isLoss = entry.type === "chicken_loss_recorded";
  const details = entry.details ?? {};
  const quantity = isLoss
    ? details.total_quantity
    : details.quantity;
  const subtitle = isLoss
    ? lossSubtitle(details)
    : [
        batchName,
        fromBlockName && toBlockName
          ? `${fromBlockName} → ${toBlockName}`
          : undefined,
      ]
        .filter(Boolean)
        .join(" · ");
  const accent = isLoss ? theme.danger : theme.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${activityLabels[entry.type] ?? "Flock activity"}; view activity details`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.activityRow,
        {
          borderTopColor: theme.border,
          backgroundColor: pressed ? theme.backgroundSelected : "transparent",
        },
      ]}
    >
      <View
        style={[
          styles.activityRowIcon,
          { backgroundColor: `${accent}1A` },
        ]}
      >
        <Ionicons
          name={isLoss ? "alert-circle-outline" : "swap-horizontal-outline"}
          size={17}
          color={accent}
        />
      </View>
      <View style={styles.activityCopy}>
        <AppText size="small" weight="semibold">
          {activityLabels[entry.type] ?? "Flock activity"}
          {typeof quantity === "number"
            ? ` · ${quantity.toLocaleString()} birds`
            : ""}
        </AppText>
        {subtitle ? (
          <AppText size="small" tone="secondary" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
        <AppText size="small" tone="secondary" numberOfLines={1}>
          {formatRelativeDate(entry.created_at)}
        </AppText>
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={theme.textSecondary}
        style={styles.activityChevron}
      />
    </Pressable>
  );
}

function openActivityHistory(category: "flock", entry?: FarmActivity) {
  if (entry) {
    router.push({
      pathname: "/activities/[activityId]",
      params: { activityId: entry.id },
    });
    return;
  }
  router.push(
    {
      pathname: "/activities",
      params: {
        category,
      },
    } as Href,
  );
}

function activityBatchName(
  entry: FarmActivity,
  batchNames: Map<string, string>,
): string | undefined {
  const batchId = entry.details?.batch_id;
  return typeof batchId === "string" ? batchNames.get(batchId) : undefined;
}

function activityBlockName(
  entry: FarmActivity,
  key: "from_block_id" | "to_block_id",
  blockNames: Map<string, string>,
): string | undefined {
  const blockId = entry.details?.[key];
  return typeof blockId === "string" ? blockNames.get(blockId) : undefined;
}

function lossSubtitle(details: Record<string, unknown>): string {
  const reasons = details.quantities_by_reason;
  if (
    reasons &&
    typeof reasons === "object" &&
    !Array.isArray(reasons)
  ) {
    return Object.entries(reasons as Record<string, unknown>)
      .map(([reason, quantity]) =>
        `${labelize(reason)} ${typeof quantity === "number" ? quantity : ""}`.trim(),
      )
      .join(" · ");
  }
  return "Recorded flock loss";
}

function formatAge(hatchDate: string): string {
  const parsed = new Date(`${hatchDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Age unknown";
  const days = Math.max(
    0,
    Math.floor((Date.now() - parsed.getTime()) / (24 * 60 * 60 * 1000)),
  );
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} old`;
  if (days < 60) {
    const weeks = Math.floor(days / 7);
    const remainingDays = days % 7;
    return `${weeks}w${remainingDays ? ` ${remainingDays}d` : ""} old`;
  }
  const months = Math.floor(days / 30.4375);
  const remainingWeeks = Math.floor((days % 30.4375) / 7);
  return `${months}mo${remainingWeeks ? ` ${remainingWeeks}w` : ""} old`;
}

function labelize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 30,
    gap: 14,
  },
  pageHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  headingCopy: { flex: 1, gap: 3 },
  stateCard: { alignItems: "center", gap: 9, paddingVertical: 20 },
  stateInline: {
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 8,
  },
  flockSummary: {
    gap: 13,
    padding: 14,
    borderRadius: 8,
  },
  flockHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  totalBirdIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  totalBirdCopy: { flex: 1, gap: 2 },
  flockTotalLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 8,
  },
  totalBirdValue: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  capacityInsight: {
    gap: 8,
    paddingTop: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#80808040",
  },
  capacityInsightHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  capacityInsightTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  capacityStatusBadge: {
    maxWidth: "58%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  capacityStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  capacityDataRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  summaryCapacityTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  summaryStats: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#80808040",
  },
  summaryStat: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 4,
  },
  summaryStatIcon: {
    width: 27,
    height: 27,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryStatLabel: { flex: 1, minWidth: 0 },
  summaryStatValue: {
    fontVariant: ["tabular-nums"],
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  actionButton: {
    flexGrow: 1,
    flexBasis: "22%",
    minWidth: 145,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  actionIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  inventoryCard: { gap: 13, borderRadius: 14 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  textAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  segmented: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  segmentButton: {
    flex: 1,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 8,
  },
  inventoryList: { gap: 9 },
  inventoryItem: {
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  inventoryItemHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  inventoryItemIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(127, 127, 127, 0.08)",
  },
  inventoryItemCopy: { flex: 1, gap: 2 },
  inventoryNumber: {
    fontSize: 20,
    lineHeight: 26,
    fontVariant: ["tabular-nums"],
  },
  blockCapacityMessage: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
  },
  blockCapacityText: { flex: 1 },
  capacityTrack: {
    position: "relative",
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
  },
  capacityFill: { height: "100%", borderRadius: 3 },
  ratedCapacityMarker: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
  },
  batchPreview: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  batchChip: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  batchCard: {
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  batchHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  batchIcon: {
    width: 35,
    height: 35,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  batchHeaderCopy: { flex: 1, gap: 2 },
  batchTotal: { alignItems: "flex-end", gap: 1 },
  batchShare: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  batchShareTrack: { flex: 1 },
  batchAllocationDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginVertical: 1,
  },
  stockRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  stockBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  emptyInventory: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 20,
  },
  emptyCopy: { maxWidth: 380, textAlign: "center" },
  activityCard: { gap: 12, borderRadius: 14 },
  activityInsight: {
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 10,
  },
  activityInsightStats: {
    flexDirection: "row",
    gap: 8,
  },
  activityMetric: {
    flex: 1,
    minHeight: 74,
    justifyContent: "center",
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  activityMetricValue: {
    fontSize: 23,
    lineHeight: 29,
    fontVariant: ["tabular-nums"],
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  activityLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
  },
  activityList: { gap: 0 },
  activityRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  activityRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  activityCopy: { flex: 1, minWidth: 0, gap: 3 },
  activityChevron: { alignSelf: "center" },
  activityHistoryAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  emptyActivity: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingVertical: 8,
  },
  emptyActivityCopy: { flex: 1, minWidth: 0, flexShrink: 1 },
});
