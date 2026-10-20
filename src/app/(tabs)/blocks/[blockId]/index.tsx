import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
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
  const maximum = block ? block.capacity + block.over_capacity_limit : 0;
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
      <ScrollView contentContainerStyle={styles.content}>
        <FarmPageHeader
          title="Block details"
          showBack
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
            <View style={styles.titleRow}>
              <View style={styles.titleCopy}>
                <AppText size="small" tone="secondary">
                  {farm.selectedFarm?.name ?? "Farm"}
                </AppText>
                <AppText size="title" weight="semibold">
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
              <AppText tone="secondary">{block.description}</AppText>
            ) : null}

            <Card style={styles.capacityCard}>
              <AppText size="heading" weight="semibold">
                Occupancy
              </AppText>
              <BlockCapacityMeter block={block} />
              <View
                style={[
                  styles.capacityDivider,
                  { borderTopColor: theme.border },
                ]}
              />
              <View style={styles.statRow}>
                <Stat
                  label="Base capacity"
                  value={block.capacity.toLocaleString()}
                />
                <Stat
                  label="Extra allowance"
                  value={block.over_capacity_limit.toLocaleString()}
                />
                <Stat
                  label="Maximum occupancy"
                  value={maximum.toLocaleString()}
                />
              </View>
            </Card>

            <Card style={styles.detailsCard}>
              <AppText size="heading" weight="semibold">
                Chickens in this block
              </AppText>
              <View style={styles.batchSummary}>
                <AppText size="heading" weight="semibold">
                  {block.occupied_chickens.toLocaleString()}
                </AppText>
                <AppText size="small" tone="secondary">
                  chickens across {block.batches.length}{" "}
                  {block.batches.length === 1 ? "batch" : "batches"}
                </AppText>
              </View>
              {block.batches.length ? (
                block.batches.map((batch) => (
                  <View
                    key={batch.batch_id}
                    style={[
                      styles.batchCard,
                      {
                        backgroundColor: theme.background,
                        borderColor: theme.border,
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
                            ? "Unknown"
                            : formatAge(batch.age_days)
                        }
                      />
                      <BatchFact
                        label="Hatch date"
                        value={
                          batch.hatch_date
                            ? new Date(
                                `${batch.hatch_date}T00:00:00`,
                              ).toLocaleDateString()
                            : "Not recorded"
                        }
                      />
                      <BatchFact label="Status" value={batch.status} />
                    </View>
                    {batch.notes ? (
                      <AppText size="small" tone="secondary">
                        {batch.notes}
                      </AppText>
                    ) : null}
                  </View>
                ))
              ) : (
                <AppText size="small" tone="secondary">
                  No chickens are currently assigned to this block.
                </AppText>
              )}
            </Card>

            <BlockMovementHistory
              userId={user?.id}
              farmId={farm.selectedFarm?.id}
              blockId={block.id}
            />

            <Card style={styles.detailsCard}>
              <AppText size="heading" weight="semibold">
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
            </Card>

            <View style={styles.actions}>
              <Button
                label="Edit block"
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/blocks/[blockId]/edit",
                    params: { blockId: block.id },
                  })
                }
              />
              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  disabled: !canDelete || deleteMutation.isPending,
                }}
                disabled={!canDelete || deleteMutation.isPending}
                onPress={confirmDelete}
                style={({ pressed }) => [
                  styles.deleteAction,
                  {
                    borderColor: theme.border,
                    opacity: !canDelete ? 0.5 : pressed ? 0.7 : 1,
                  },
                ]}
              >
                {deleteMutation.isPending ? (
                  <AppText size="small" style={{ color: theme.danger }}>
                    Deleting…
                  </AppText>
                ) : (
                  <>
                    <Ionicons
                      name="trash-outline"
                      size={17}
                      color={theme.danger}
                    />
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
            </View>
            {!canDelete ? (
              <AppText size="small" tone="secondary">
                Move the {block.occupied_chickens} assigned chickens before
                deleting this block.
              </AppText>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <AppText size="small" tone="secondary">
        {label}
      </AppText>
      <AppText weight="semibold">{value}</AppText>
    </View>
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
  const { theme } = useTheme();
  return (
    <View style={[styles.detailRow, { borderBottomColor: theme.border }]}>
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
    padding: 18,
    paddingBottom: 36,
    gap: 14,
  },
  state: { gap: 12 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  titleCopy: { flex: 1, gap: 3 },
  status: { minWidth: 68, alignItems: "center", padding: 6, borderRadius: 6 },
  capacityCard: { gap: 16 },
  capacityDivider: { borderTopWidth: 1 },
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  stat: { minWidth: 88, flex: 1, gap: 3 },
  detailsCard: { gap: 12 },
  batchSummary: { gap: 2 },
  batchCard: {
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  batchHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  batchCopy: { flex: 1, gap: 3 },
  batchQuantity: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20 },
  batchFacts: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  batchFact: { minWidth: 100, flex: 1, gap: 2 },
  detailRow: {
    minHeight: 34,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  actions: { gap: 10 },
  deleteAction: {
    minHeight: 46,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 7,
  },
});
