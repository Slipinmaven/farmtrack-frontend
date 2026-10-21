import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TextField } from "@/components/ui/text-field";
import type { ChickenSaleBatch } from "@/features/chickens/api";
import { useChickenSaleOptions } from "@/features/chickens/hooks";
import {
  setChickenLossDraft,
  type ChickenLossDraftItem,
} from "@/features/chickens/loss-draft";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

export default function ChickenLossScreen() {
  return (
    <SessionGate>
      <ChickenLossContent />
    </SessionGate>
  );
}

function ChickenLossContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const farmId = farm.selectedFarm?.id;
  const options = useChickenSaleOptions(user?.id, farmId);
  const [lossDate, setLossDate] = useState(localToday());
  const [inventorySearch, setInventorySearch] = useState("");
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string, boolean>>(
    {},
  );
  const [selectedItems, setSelectedItems] = useState<ChickenLossDraftItem[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);

  const inventory = options.data;
  const filteredBlocks = useMemo(() => {
    if (!inventory) return [];
    const query = inventorySearch.trim().toLowerCase();
    return inventory.blocks.flatMap((block) => {
      const availableBatches = inventory.batches.flatMap((batch) => {
        const stock = batch.stocks.find((entry) => entry.block_id === block.id);
        return stock && stock.quantity > 0 ? [{ batch, stock }] : [];
      });
      const blockMatches = !query || block.name.toLowerCase().includes(query);
      const batches = blockMatches
        ? availableBatches
        : availableBatches.filter(
            ({ batch }) =>
              batch.name.toLowerCase().includes(query) ||
              formatChickenType(batch.chicken_type)
                .toLowerCase()
                .includes(query),
          );
      return batches.length ? [{ block, batches }] : [];
    });
  }, [inventory, inventorySearch]);
  const totalQuantity = selectedItems.reduce(
    (total, item) => total + item.quantity,
    0,
  );
  const hasStock = Boolean(
    inventory?.batches.some((batch) =>
      batch.stocks.some((stock) => stock.quantity > 0),
    ),
  );

  function toggleBatch(
    batch: ChickenSaleBatch,
    blockId: string,
    blockName: string,
    stockQuantity: number,
  ) {
    const itemId = `${batch.id}:${blockId}`;
    setSelectedItems((current) =>
      current.some((item) => item.id === itemId)
        ? current.filter((item) => item.id !== itemId)
        : [
            ...current,
            {
              id: itemId,
              batch_id: batch.id,
              block_id: blockId,
              batch_name: batch.name,
              block_name: blockName,
              hatch_date: batch.hatch_date,
              chicken_type: batch.chicken_type,
              available: stockQuantity,
              quantity: 1,
              reason: "natural_death",
              notes: "",
            },
          ],
    );
    setError(null);
  }

  function adjustQuantity(itemId: string, change: number) {
    setSelectedItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              quantity: Math.max(
                1,
                Math.min(item.quantity + change, item.available),
              ),
            }
          : item,
      ),
    );
    setError(null);
  }

  function continueToReview() {
    if (!selectedItems.length) {
      setError("Select at least one batch in a block to continue.");
      return;
    }
    const invalidItem = selectedItems.find(
      (item) =>
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > item.available,
    );
    if (invalidItem) {
      setError(
        `Enter a quantity from 1 to ${invalidItem.available} for ${invalidItem.batch_name} in ${invalidItem.block_name}.`,
      );
      return;
    }
    setChickenLossDraft({ loss_date: lossDate, items: selectedItems });
    router.push("/chicken-loss/review");
  }

  if (options.isLoading) {
    return <LoadingState label="Loading chicken inventory" />;
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <FarmPageHeader title="Record chicken loss" showBack />
          <AppText tone="secondary">
            Select every batch and block affected, then set the number lost in
            each. You can select multiple locations before reviewing.
          </AppText>

          {options.isError ? (
            <Card style={styles.stateCard}>
              <AppText weight="semibold">Could not load flock inventory</AppText>
              <AppText size="small" tone="secondary">
                {normalizeApiError(options.error).message}
              </AppText>
              <Button
                label="Retry"
                variant="secondary"
                onPress={() => void options.refetch()}
              />
            </Card>
          ) : null}

          {!options.isError && !hasStock ? (
            <Card style={styles.emptyState}>
              <View
                style={[
                  styles.emptyIcon,
                  { backgroundColor: `${theme.primary}18` },
                ]}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={24}
                  color={theme.primary}
                />
              </View>
              <AppText weight="semibold">No chickens available to record</AppText>
              <AppText size="small" tone="secondary">
                Active batches with assigned block stock will appear here.
              </AppText>
              <Button
                label="Record a purchase"
                variant="secondary"
                onPress={() => router.push("/chicken-purchase")}
              />
            </Card>
          ) : null}

          {inventory && hasStock ? (
            <>
              <Card style={styles.section}>
                <View style={styles.sectionHeading}>
                  <View style={styles.stepNumber}>
                    <AppText
                      size="small"
                      weight="semibold"
                      style={{ color: theme.primary }}
                    >
                      1
                    </AppText>
                  </View>
                  <View style={styles.headingCopy}>
                    <AppText weight="semibold">Loss date</AppText>
                    <AppText size="small" tone="secondary">
                      Defaults to today.
                    </AppText>
                  </View>
                </View>
                <DatePickerField
                  label="When did the loss happen?"
                  value={lossDate}
                  onChange={setLossDate}
                />
              </Card>

              <Card style={styles.section}>
                <View style={styles.sectionHeading}>
                  <View style={styles.stepNumber}>
                    <AppText
                      size="small"
                      weight="semibold"
                      style={{ color: theme.primary }}
                    >
                      2
                    </AppText>
                  </View>
                  <View style={styles.headingCopy}>
                    <AppText weight="semibold">Select affected stock</AppText>
                    <AppText size="small" tone="secondary">
                      Select multiple batches across any blocks. Set quantity
                      for each selected batch.
                    </AppText>
                  </View>
                </View>
                <TextField
                  label="Find block or batch"
                  placeholder="Search block name, batch name, or type"
                  value={inventorySearch}
                  onChangeText={setInventorySearch}
                  returnKeyType="search"
                />
                {filteredBlocks.length === 0 ? (
                  <AppText size="small" tone="secondary">
                    No blocks or batches match that search.
                  </AppText>
                ) : null}

                {filteredBlocks.map(({ block, batches }) => {
                  const expanded = Boolean(expandedBlocks[block.id]);
                  const selectedInBlock = selectedItems.filter(
                    (item) => item.block_id === block.id,
                  );
                  return (
                    <View
                      key={block.id}
                      style={[
                        styles.blockCard,
                        {
                          borderColor: expanded
                            ? theme.primary
                            : theme.border,
                          backgroundColor: theme.background,
                        },
                      ]}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded }}
                        onPress={() =>
                          setExpandedBlocks((current) => ({
                            ...current,
                            [block.id]: !current[block.id],
                          }))
                        }
                        style={styles.blockHeader}
                      >
                        <View
                          style={[
                            styles.blockIcon,
                            { backgroundColor: `${theme.primary}18` },
                          ]}
                        >
                          <Ionicons
                            name="home-outline"
                            size={18}
                            color={theme.primary}
                          />
                        </View>
                        <View style={styles.blockCopy}>
                          <AppText weight="semibold">{block.name}</AppText>
                          <AppText size="small" tone="secondary">
                            {batches.reduce(
                              (sum, entry) => sum + entry.stock.quantity,
                              0,
                            )}{" "}
                            birds · {batches.length}{" "}
                            {batches.length === 1 ? "batch" : "batches"}
                          </AppText>
                        </View>
                        {selectedInBlock.length > 0 ? (
                          <View
                            style={[
                              styles.selectionCount,
                              { backgroundColor: `${theme.success}18` },
                            ]}
                          >
                            <AppText
                              size="small"
                              weight="semibold"
                              style={{ color: theme.success }}
                            >
                              {selectedInBlock.length} selected
                            </AppText>
                          </View>
                        ) : null}
                        <Ionicons
                          name={expanded ? "chevron-up" : "chevron-down"}
                          size={18}
                          color={theme.textSecondary}
                        />
                      </Pressable>
                      {expanded ? (
                        <View style={styles.batchList}>
                          {batches.map(({ batch, stock }) => {
                            const itemId = `${batch.id}:${block.id}`;
                            const selectedItem = selectedItems.find(
                              (item) => item.id === itemId,
                            );
                            const selected = Boolean(selectedItem);
                            return (
                              <View
                                key={itemId}
                                style={[
                                  styles.batchCard,
                                  {
                                    borderColor: selected
                                      ? theme.primary
                                      : theme.border,
                                    backgroundColor: selected
                                      ? `${theme.primary}0A`
                                      : theme.backgroundElement,
                                  },
                                ]}
                              >
                                <Pressable
                                  accessibilityRole="checkbox"
                                  accessibilityState={{ checked: selected }}
                                  accessibilityLabel={`${batch.name}, ${formatChickenType(batch.chicken_type)}, age ${formatBatchAge(batch.hatch_date, lossDate)}, ${stock.quantity} available in ${block.name}`}
                                  onPress={() =>
                                    toggleBatch(
                                      batch,
                                      block.id,
                                      block.name,
                                      stock.quantity,
                                    )
                                  }
                                  style={styles.batchSelect}
                                >
                                  <View
                                    style={[
                                      styles.checkbox,
                                      {
                                        borderColor: selected
                                          ? theme.primary
                                          : theme.border,
                                        backgroundColor: selected
                                          ? theme.primary
                                          : "transparent",
                                      },
                                    ]}
                                  >
                                    {selected ? (
                                      <Ionicons
                                        name="checkmark"
                                        size={14}
                                        color={theme.onPrimary}
                                      />
                                    ) : null}
                                  </View>
                                  <View style={styles.batchCopy}>
                                    <AppText weight="semibold">
                                      {batch.name}
                                    </AppText>
                                    <AppText size="small" tone="secondary">
                                      {formatChickenType(batch.chicken_type)} ·
                                      {" "}Age on {formatDate(lossDate)}:{" "}
                                      {formatBatchAge(batch.hatch_date, lossDate)}
                                    </AppText>
                                  </View>
                                  <AppText
                                    size="small"
                                    weight="semibold"
                                    style={{ color: theme.primary }}
                                  >
                                    {stock.quantity} available
                                  </AppText>
                                </Pressable>
                                {selectedItem ? (
                                  <View
                                    style={[
                                      styles.quantityRow,
                                      { borderTopColor: theme.border },
                                    ]}
                                  >
                                    <AppText
                                      size="small"
                                      tone="secondary"
                                      style={styles.quantityLabel}
                                    >
                                      Lost
                                    </AppText>
                                    <View style={styles.stepper}>
                                      <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={`Decrease loss quantity for ${batch.name}`}
                                        accessibilityState={{
                                          disabled: selectedItem.quantity <= 1,
                                        }}
                                        disabled={selectedItem.quantity <= 1}
                                        onPress={() =>
                                          adjustQuantity(itemId, -1)
                                        }
                                        style={[
                                          styles.stepperButton,
                                          {
                                            borderColor: theme.border,
                                            opacity:
                                              selectedItem.quantity <= 1
                                                ? 0.45
                                                : 1,
                                          },
                                        ]}
                                      >
                                        <Ionicons
                                          name="remove"
                                          size={18}
                                          color={theme.text}
                                        />
                                      </Pressable>
                                      <AppText
                                        weight="semibold"
                                        style={styles.stepperValue}
                                      >
                                        {selectedItem.quantity}
                                      </AppText>
                                      <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={`Increase loss quantity for ${batch.name}`}
                                        accessibilityState={{
                                          disabled:
                                            selectedItem.quantity >= stock.quantity,
                                        }}
                                        disabled={
                                          selectedItem.quantity >= stock.quantity
                                        }
                                        onPress={() =>
                                          adjustQuantity(itemId, 1)
                                        }
                                        style={[
                                          styles.stepperButton,
                                          {
                                            borderColor: theme.border,
                                            opacity:
                                              selectedItem.quantity >=
                                              stock.quantity
                                                ? 0.45
                                                : 1,
                                          },
                                        ]}
                                      >
                                        <Ionicons
                                          name="add"
                                          size={18}
                                          color={theme.text}
                                        />
                                      </Pressable>
                                      <AppText
                                        size="small"
                                        tone="secondary"
                                      >
                                        of {stock.quantity}
                                      </AppText>
                                    </View>
                                  </View>
                                ) : null}
                              </View>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </Card>
            </>
          ) : null}

          {error ? (
            <Card
              style={[
                styles.errorCard,
                { borderColor: theme.danger, backgroundColor: theme.background },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={theme.danger}
              />
              <AppText size="small" style={styles.errorText}>
                {error}
              </AppText>
            </Card>
          ) : null}
        </ScrollView>
        {selectedItems.length > 0 ? (
          <View
            style={[
              styles.bottomBar,
              {
                backgroundColor: theme.background,
                borderTopColor: theme.border,
              },
            ]}
          >
            <View style={styles.bottomSummary}>
              <AppText size="small" weight="semibold">
                {selectedItems.length}{" "}
                {selectedItems.length === 1 ? "batch" : "batches"} selected
              </AppText>
              <AppText size="small" tone="secondary">
                {totalQuantity} chickens across{" "}
                {new Set(selectedItems.map((item) => item.block_id)).size}{" "}
                {new Set(selectedItems.map((item) => item.block_id)).size === 1
                  ? "block"
                  : "blocks"}
              </AppText>
            </View>
            <Button
              label="Review losses"
              onPress={continueToReview}
              style={styles.reviewButton}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatBatchAge(hatchDate: string | null, onDate: string): string {
  if (!hatchDate) return "unknown";
  const hatch = new Date(`${hatchDate}T00:00:00`);
  const referenceDate = new Date(`${onDate}T00:00:00`);
  if (
    Number.isNaN(hatch.getTime()) ||
    Number.isNaN(referenceDate.getTime())
  ) {
    return "unknown";
  }
  const days = Math.max(
    0,
    Math.floor((referenceDate.getTime() - hatch.getTime()) / 86_400_000),
  );
  const weeks = Math.floor(days / 7);
  const remainingDays = days % 7;
  if (weeks === 0) return `${days} ${days === 1 ? "day" : "days"}`;
  return `${weeks} ${weeks === 1 ? "week" : "weeks"}${
    remainingDays
      ? ` ${remainingDays} ${remainingDays === 1 ? "day" : "days"}`
      : ""
  }`;
}

function formatChickenType(type: ChickenSaleBatch["chicken_type"]): string {
  return type === "kienyeji"
    ? "Kienyeji"
    : type.charAt(0).toUpperCase() + type.slice(1);
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 28,
    gap: 14,
  },
  section: { gap: 14 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  headingCopy: { flex: 1, minWidth: 0, gap: 2 },
  stepNumber: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#0000000A",
  },
  stateCard: { gap: 10 },
  emptyState: { alignItems: "center", gap: 10, paddingVertical: 24 },
  emptyIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
  },
  blockCard: { borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  blockHeader: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  blockIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  blockCopy: { flex: 1, minWidth: 0, gap: 2 },
  selectionCount: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  batchList: { paddingHorizontal: 10, paddingBottom: 10, gap: 8 },
  batchCard: { borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  batchSelect: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 10,
  },
  checkbox: {
    width: 21,
    height: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderRadius: 5,
  },
  batchCopy: { flex: 1, minWidth: 0, gap: 2 },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  quantityLabel: { flex: 1 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 7 },
  stepperButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 7,
  },
  stepperValue: { minWidth: 26, textAlign: "center" },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  bottomSummary: { flex: 1, minWidth: 0, gap: 2 },
  reviewButton: { minWidth: 132 },
  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
  },
  errorText: { flex: 1 },
});
