import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  findNodeHandle,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewInstance,
  type TextInputInstance,
  type ViewInstance,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TextField } from "@/components/ui/text-field";
import type {
  ChickenPurchaseBlock,
  ChickenSaleBatch,
} from "@/features/chickens/api";
import {
  useChickenSaleOptions,
  useCreateChickenBatchMovement,
} from "@/features/chickens/hooks";
import { formatChickenCount } from "@/features/chickens/format";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type SelectedBatch = {
  batch: ChickenSaleBatch;
  available: number;
  quantity: string;
};

type MovementError = {
  message: string;
  target: "source" | "batch" | "destination" | "date" | "quantity";
  batchId?: string;
};

export default function ChickenMovementScreen() {
  return (
    <SessionGate>
      <ChickenMovementContent />
    </SessionGate>
  );
}

function ChickenMovementContent() {
  const { sourceBlockId: initialSourceBlockId } = useLocalSearchParams<{
    sourceBlockId?: string;
  }>();
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const farmId = farm.selectedFarm?.id;
  const options = useChickenSaleOptions(user?.id, farmId);
  const createMovement = useCreateChickenBatchMovement(
    user?.id ?? "",
    farmId ?? "",
  );
  const [stage, setStage] = useState<"select" | "review">("select");
  const [movementDate, setMovementDate] = useState(localToday());
  const [search, setSearch] = useState("");
  const [sourceBlockId, setSourceBlockId] = useState(
    initialSourceBlockId ?? "",
  );
  const [destinationBlockId, setDestinationBlockId] = useState("");
  const [selectedBatches, setSelectedBatches] = useState<SelectedBatch[]>([]);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<MovementError | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const areaRefs = useRef<Record<string, ViewInstance | null>>({});
  const quantityInputs = useRef<Record<string, TextInputInstance | null>>({});
  const batchSearchInput = useRef<TextInputInstance>(null);

  const inventory = options.data;
  const sourceBlock = inventory?.blocks.find(
    (block) => block.id === sourceBlockId,
  );
  const destinationBlock = inventory?.blocks.find(
    (block) => block.id === destinationBlockId,
  );
  const totalQuantity = selectedBatches.reduce(
    (sum, selected) => sum + (Number(selected.quantity) || 0),
    0,
  );
  const getBlockLimit = (block: ChickenPurchaseBlock) =>
    block.maximum_chickens;
  const getAvailableBlockCapacity = (block: ChickenPurchaseBlock) =>
    Math.max(getBlockLimit(block) - block.current_chickens, 0);
  const sourceBatches = useMemo(() => {
    if (!inventory || !sourceBlockId) return [];
    const query = search.trim().toLowerCase();
    return inventory.batches.flatMap((batch) => {
      const stock = batch.stocks.find(
        (candidate) => candidate.block_id === sourceBlockId,
      );
      if (!stock || stock.quantity <= 0) return [];
      const matchesSearch =
        !query ||
        batch.name.toLowerCase().includes(query) ||
        formatChickenType(batch.chicken_type).toLowerCase().includes(query);
      return matchesSearch ? [{ batch, available: stock.quantity }] : [];
    });
  }, [inventory, search, sourceBlockId]);
  const destinations = useMemo(
    () =>
      inventory?.blocks.filter((block) => block.id !== sourceBlockId) ?? [],
    [inventory, sourceBlockId],
  );
  const destinationCapacity = destinationBlock
    ? getAvailableBlockCapacity(destinationBlock)
    : 0;
  const totalAvailable = sourceBatches.reduce(
    (sum, item) => sum + item.available,
    0,
  );
  const hasStock = Boolean(
    inventory?.batches.some((batch) =>
      batch.stocks.some((stock) => stock.quantity > 0),
    ),
  );

  function focusArea(key: string, batchId?: string) {
    requestAnimationFrame(() => {
      const scrollHandle = findNodeHandle(scrollRef.current);
      const target = areaRefs.current[batchId ? `batch-${batchId}` : key];
      if (target && scrollHandle != null) {
        target.measureLayout(
          scrollHandle,
          (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(y - 20, 0), animated: true }),
          () => undefined,
        );
      }
      if (key === "batch" && batchId) {
        setTimeout(() => quantityInputs.current[batchId]?.focus(), 350);
      } else if (key === "batch") {
        setTimeout(() => batchSearchInput.current?.focus(), 350);
      }
    });
  }

  function showError(
    message: string,
    target: MovementError["target"],
    batchId?: string,
  ) {
    setError({ message, target, batchId });
    if (stage === "review") setStage("select");
    focusArea(target, batchId);
  }

  function chooseSourceBlock(blockId: string) {
    if (blockId === sourceBlockId) return;
    setSourceBlockId(blockId);
    setSelectedBatches([]);
    setDestinationBlockId("");
    setError(null);
  }

  function toggleBatch(batch: ChickenSaleBatch, available: number) {
    setSelectedBatches((current) =>
      current.some((item) => item.batch.id === batch.id)
        ? current.filter((item) => item.batch.id !== batch.id)
        : [...current, { batch, available, quantity: "1" }],
    );
    setError(null);
  }

  function updateQuantity(batchId: string, value: string) {
    const sanitized = value.replace(/[^\d]/g, "");
    const matching = selectedBatches.find(
      (item) => item.batch.id === batchId,
    );
    const numericValue = sanitized ? Number(sanitized) : 0;
    setSelectedBatches((current) =>
      current.map((item) =>
        item.batch.id === batchId
          ? {
              ...item,
              quantity:
                numericValue > item.available
                  ? String(item.available)
                  : sanitized,
            }
          : item,
      ),
    );
    if (matching && numericValue > matching.available) {
      setError({
        target: "batch",
        batchId,
        message: `There are ${matching.available} ${matching.available === 1 ? "chicken" : "chickens"} available in ${matching.batch.name}. The quantity has been adjusted to fit.`,
      });
      return;
    }
    setError(null);
  }

  function continueToReview() {
    if (!sourceBlockId || !sourceBlock) {
      showError("Choose the block the chickens are moving from.", "source");
      return;
    }
    if (!selectedBatches.length) {
      showError("Select at least one batch from this block.", "batch");
      return;
    }
    const invalidBatch = selectedBatches.find((item) => {
      const quantity = Number(item.quantity);
      return (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > item.available
      );
    });
    if (invalidBatch) {
      showError(
        `Enter a whole number from 1 to ${invalidBatch.available} for ${invalidBatch.batch.name}.`,
        "batch",
        invalidBatch.batch.id,
      );
      return;
    }
    if (!destinationBlockId || !destinationBlock) {
      showError("Choose one destination block for these batches.", "destination");
      return;
    }
    if (movementDate > localToday()) {
      showError("Choose today or an earlier date for this movement.", "date");
      return;
    }
    const preHatchBatch = selectedBatches.find(
      (item) =>
        item.batch.hatch_date && movementDate < item.batch.hatch_date,
    );
    if (preHatchBatch) {
      showError(
        `${preHatchBatch.batch.name} had not hatched on that date. Choose a later movement date.`,
        "date",
      );
      return;
    }
    if (totalQuantity > destinationCapacity) {
      showError(
        `${destinationBlock.name} has space for ${formatChickenCount(destinationCapacity)}, but ${formatChickenCount(totalQuantity)} ${totalQuantity === 1 ? "is" : "are"} selected. Reduce one or more batch quantities.`,
        "destination",
      );
      return;
    }
    setError(null);
    setStage("review");
  }

  async function confirmAndMove() {
    if (!sourceBlock || !destinationBlock || !farmId) return;
    try {
      const refreshed = await options.refetch();
      if (refreshed.isError || !refreshed.data) {
        showError(
          "Could not refresh the flock. Check your connection and try again.",
          "source",
        );
        return;
      }

      const latestSourceBlock = refreshed.data.blocks.find(
        (block) => block.id === sourceBlockId,
      );
      if (!latestSourceBlock) {
        showError(
          "The source block is no longer available. Choose another source block.",
          "source",
        );
        return;
      }

      const staleBatch = selectedBatches.find((selected) => {
        const latest = refreshed.data.batches
          .find((batch) => batch.id === selected.batch.id)
          ?.stocks.find((stock) => stock.block_id === sourceBlockId)?.quantity;
        return latest === undefined || latest < Number(selected.quantity);
      });
      if (staleBatch) {
        const latest =
          refreshed.data.batches
            .find((batch) => batch.id === staleBatch.batch.id)
            ?.stocks.find((stock) => stock.block_id === sourceBlockId)
            ?.quantity ?? 0;
        setSelectedBatches((current) =>
          current.map((item) =>
            item.batch.id === staleBatch.batch.id
              ? {
                  ...item,
                  available: latest,
                  quantity: latest > 0 ? String(Math.min(Number(item.quantity), latest)) : "",
                }
              : item,
          ),
        );
        showError(
          `${staleBatch.batch.name} now has ${formatChickenCount(latest)} available. Update its quantity before continuing.`,
          "batch",
          staleBatch.batch.id,
        );
        return;
      }

      const latestDestination = refreshed.data.blocks.find(
        (block) => block.id === destinationBlockId,
      );
      const latestCapacity = latestDestination
        ? getAvailableBlockCapacity(latestDestination)
        : 0;
      if (!latestDestination) {
        showError(
          "The destination block is no longer available. Choose another block.",
          "destination",
        );
        return;
      }
      if (totalQuantity > latestCapacity) {
        showError(
          `${latestDestination.name} now has space for ${formatChickenCount(latestCapacity)}. Reduce the selected quantities or choose another destination.`,
          "destination",
        );
        return;
      }

      const confirmed = await dialog.confirmDialog({
        title: "Confirm chicken movement",
        message: `Move ${formatChickenCount(totalQuantity)} from ${sourceBlock.name} to ${latestDestination.name} across ${selectedBatches.length} ${selectedBatches.length === 1 ? "batch" : "batches"}?`,
        confirmLabel: "Move chickens",
      });
      if (!confirmed) return;

      await createMovement.mutateAsync({
        from_block_id: sourceBlockId,
        to_block_id: destinationBlockId,
        movement_date: movementDate,
        reason: reason.trim() || undefined,
        notes: notes.trim() || undefined,
        items: selectedBatches.map((item) => ({
          batch_id: item.batch.id,
          quantity: Number(item.quantity),
        })),
      });
      await dialog.showDialog({
        title: "Chickens moved",
        message: `${formatChickenCount(totalQuantity)} ${totalQuantity === 1 ? "has" : "have"} been moved from ${sourceBlock.name} to ${latestDestination.name}.`,
        tone: "success",
      });
      router.back();
    } catch (submitError: unknown) {
      const rawMessage = normalizeApiError(submitError).message;
      const batch = selectedBatches.find((item) =>
        rawMessage.includes(item.batch.name),
      );
      const message = friendlyMovementError(rawMessage);
      const lowerMessage = rawMessage.toLowerCase();
      const target: MovementError["target"] = batch
        ? "batch"
        : lowerMessage.includes("source block")
          ? "source"
          : lowerMessage.includes("selected chicken batches")
            ? "batch"
            : "destination";
      showError(
        message,
        target,
        batch?.batch.id,
      );
    }
  }

  if (options.isLoading) {
    return <LoadingState label="Loading flock inventory" />;
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
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <FarmPageHeader
            title={stage === "select" ? "Move chickens" : "Review movement"}
            showBack
            backHref="/(tabs)/flock"
          />
          {!options.isError && hasStock ? (
            <View
              style={[
                styles.introCard,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            >
              <View
                style={[
                  styles.introIcon,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <Ionicons
                  name={stage === "select" ? "git-compare-outline" : "checkmark-done-outline"}
                  size={21}
                  color={theme.primary}
                />
              </View>
              <View style={styles.introCopy}>
                <AppText weight="semibold">
                  {stage === "select" ? "Move flock between blocks" : "Review your movement"}
                </AppText>
                <AppText size="small" tone="secondary">
                  {stage === "select"
                    ? "Choose a source, select batches, then choose where they’re going."
                    : "Check the source, destination, and quantity before confirming."}
                </AppText>
              </View>
              <View
                style={[
                  styles.stepPill,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                  {stage === "select" ? "STEP 1 OF 2" : "STEP 2 OF 2"}
                </AppText>
              </View>
            </View>
          ) : null}
          {options.isError ? (
            <Card style={styles.section}>
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
              <Ionicons
                name="swap-horizontal-outline"
                size={28}
                color={theme.textSecondary}
              />
              <AppText weight="semibold">No chickens available to move</AppText>
              <AppText size="small" tone="secondary">
                Active batches with chickens assigned to a block will appear
                here.
              </AppText>
            </Card>
          ) : null}

          {inventory && hasStock && stage === "select" ? (
            <>
              <Card style={styles.section}>
                <View
                  ref={(view) => {
                    areaRefs.current.source = view;
                  }}
                >
                  <SectionHeading
                    number="1"
                    title="Source block"
                    subtitle="Choose where the chickens are now."
                  />
                  <View style={styles.blockChoices}>
                    {inventory.blocks
                      .filter((block) =>
                        inventory.batches.some((batch) =>
                          batch.stocks.some(
                            (stock) =>
                              stock.block_id === block.id &&
                              stock.quantity > 0,
                          ),
                        ),
                      )
                      .map((block) => {
                        const selected = sourceBlockId === block.id;
                        const batchCount = inventory.batches.filter((batch) =>
                          batch.stocks.some(
                            (stock) =>
                              stock.block_id === block.id &&
                              stock.quantity > 0,
                          ),
                        ).length;
                        const totalBirds = inventory.batches.reduce(
                          (sum, batch) =>
                            sum +
                            (batch.stocks.find(
                              (stock) => stock.block_id === block.id,
                            )?.quantity ?? 0),
                          0,
                        );
                        return (
                          <Pressable
                            key={block.id}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: selected }}
                            onPress={() => chooseSourceBlock(block.id)}
                            style={[
                              styles.blockChoice,
                              {
                                borderColor: selected
                                  ? theme.primary
                                  : theme.border,
                                backgroundColor: selected
                                  ? `${theme.primary}0A`
                                  : theme.background,
                              },
                            ]}
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
                              <AppText size="small" tone="secondary" numberOfLines={1}>
                                {formatChickenCount(totalBirds, "bird")} · {batchCount}{" "}
                                {batchCount === 1 ? "batch" : "batches"}
                              </AppText>
                            </View>
                            <Ionicons
                              name={
                                selected
                                  ? "radio-button-on"
                                  : "radio-button-off"
                              }
                              size={20}
                              color={
                                selected
                                  ? theme.primary
                                  : theme.textSecondary
                              }
                            />
                          </Pressable>
                        );
                      })}
                  </View>
                  {error?.target === "source" ? (
                    <InlineError message={error.message} />
                  ) : null}
                </View>

                {sourceBlock ? (
                  <View
                    ref={(view) => {
                      areaRefs.current.batch = view;
                    }}
                  >
                    <SectionHeading
                      number="2"
                      title={`Batches in ${sourceBlock.name}`}
                      subtitle="Select batches and enter how many to move."
                    />
                    <TextField
                      ref={batchSearchInput}
                      label="Search batches"
                      placeholder="Search by batch name or chicken type"
                      value={search}
                      onChangeText={setSearch}
                      returnKeyType="search"
                    />
                    {sourceBatches.length === 0 ? (
                      <AppText size="small" tone="secondary">
                        No batches in this block match that search.
                      </AppText>
                    ) : null}
                    <View style={styles.batchList}>
                      {sourceBatches.map(({ batch, available }) => {
                        const selected = selectedBatches.find(
                          (item) => item.batch.id === batch.id,
                        );
                        const hasQuantityError =
                          error?.target === "batch" &&
                          error.batchId === batch.id;
                        return (
                          <View
                            key={batch.id}
                            ref={(view) => {
                              areaRefs.current[`batch-${batch.id}`] = view;
                            }}
                            style={[
                              styles.batchCard,
                              {
                                borderColor: hasQuantityError
                                  ? theme.danger
                                  : selected
                                    ? theme.primary
                                    : theme.border,
                                backgroundColor: selected
                                  ? `${theme.primary}08`
                                  : theme.background,
                              },
                            ]}
                          >
                            <Pressable
                              accessibilityRole="checkbox"
                              accessibilityState={{
                                checked: Boolean(selected),
                              }}
                              onPress={() => toggleBatch(batch, available)}
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
                                  {formatChickenType(batch.chicken_type)} · Age{" "}
                                  {formatBatchAge(
                                    batch.hatch_date,
                                    movementDate,
                                  )}
                                </AppText>
                              </View>
                              <View style={styles.stockCount}>
                                <AppText
                                  size="small"
                                  weight="semibold"
                                  style={{ color: theme.primary }}
                                >
                                  {available}
                                </AppText>
                                <AppText size="small" tone="secondary">
                                  available
                                </AppText>
                              </View>
                            </Pressable>
                            {selected ? (
                              <View
                                style={[
                                  styles.quantityRow,
                                  { borderTopColor: theme.border },
                                ]}
                              >
                                <TextField
                                  ref={(input) => {
                                    quantityInputs.current[batch.id] = input;
                                  }}
                                  label={`Quantity to move (up to ${selected.available})`}
                                  placeholder="Enter whole number"
                                  value={selected.quantity}
                                  onChangeText={(value) =>
                                    updateQuantity(batch.id, value)
                                  }
                                  keyboardType="number-pad"
                                  returnKeyType="done"
                                  error={
                                    hasQuantityError ? error.message : undefined
                                  }
                                />
                                <AppText size="small" tone="secondary">
                                  of {formatChickenCount(selected.available, "bird")}
                                </AppText>
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                    {error?.target === "batch" && !error.batchId ? (
                      <InlineError message={error.message} />
                    ) : null}
                    {selectedBatches.length > 0 ? (
                      <View
                        style={[
                          styles.selectionSummary,
                          { backgroundColor: theme.backgroundSelected },
                        ]}
                      >
                        <Ionicons name="checkmark-circle-outline" size={19} color={theme.primary} />
                        <View style={styles.selectionSummaryCopy}>
                          <AppText size="small" weight="semibold">
                            {selectedBatches.length} {selectedBatches.length === 1 ? "batch" : "batches"} selected
                          </AppText>
                          <AppText size="small" tone="secondary">
                            Moving {formatChickenCount(totalQuantity, "bird")} of {formatChickenCount(totalAvailable, "bird")} available
                          </AppText>
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </Card>

              {selectedBatches.length > 0 ? (
                <>
                  <Card style={styles.section}>
                    <View
                      ref={(view) => {
                        areaRefs.current.destination = view;
                      }}
                    >
                      <SectionHeading
                        number="3"
                        title="Choose one destination block"
                        subtitle="Capacity is checked against the combined quantity of all selected batches."
                      />
                      <View style={styles.destinationList}>
                        {destinations.map((block) => {
                          const capacity = getAvailableBlockCapacity(block);
                          const capacityLimit = getBlockLimit(block);
                          const fits =
                            totalQuantity > 0 && capacity >= totalQuantity;
                          const selected = destinationBlockId === block.id;
                          return (
                            <Pressable
                              key={block.id}
                              accessibilityRole="radio"
                              accessibilityState={{
                                checked: selected,
                                disabled: !fits,
                              }}
                              disabled={!fits && !selected}
                              onPress={() => {
                                setDestinationBlockId(
                                  selected ? "" : block.id,
                                );
                                setError(null);
                              }}
                              style={[
                                styles.destinationChoice,
                                {
                                  borderColor: selected
                                    ? theme.primary
                                    : theme.border,
                                  backgroundColor: selected
                                    ? `${theme.primary}0A`
                                    : theme.background,
                                  opacity: fits ? 1 : 0.58,
                                },
                              ]}
                            >
                              <View style={styles.destinationCopy}>
                                <AppText weight="semibold">{block.name}</AppText>
                                <AppText size="small" tone="secondary">
                                  {block.current_chickens} / {capacityLimit}{" "}
                                  birds · {capacity}{" "}
                                  {capacity === 1 ? "space" : "spaces"} available
                                </AppText>
                                {!fits ? (
                                  <AppText size="small" tone="secondary">
                                    {totalQuantity > 0
                                      ? `Needs room for ${formatChickenCount(totalQuantity, "bird")}`
                                      : "Enter batch quantities first"}
                                  </AppText>
                                ) : null}
                              </View>
                              <Ionicons
                                name={
                                  selected
                                    ? "radio-button-on"
                                    : "radio-button-off"
                                }
                                size={20}
                                color={
                                  selected
                                    ? theme.primary
                                    : theme.textSecondary
                                }
                              />
                            </Pressable>
                          );
                        })}
                      </View>
                      {error?.target === "destination" ? (
                        <InlineError message={error.message} />
                      ) : null}
                    </View>
                    <View
                      ref={(view) => {
                        areaRefs.current.date = view;
                      }}
                    >
                      <DatePickerField
                        label="Movement date"
                        value={movementDate}
                        maximumDate={new Date()}
                        onChange={(value) => {
                          setMovementDate(value);
                          setError(null);
                        }}
                        style={styles.dateField}
                      />
                    </View>
                    {error?.target === "date" ? (
                      <InlineError message={error.message} />
                    ) : null}
                  </Card>

                  <Card style={styles.section}>
                    <SectionHeading
                      number="4"
                      title="Add notes (optional)"
                      subtitle="Include a reason or other useful detail for your records."
                    />
                    <TextField
                      label="Reason"
                      placeholder="For example, separating age groups"
                      value={reason}
                      onChangeText={setReason}
                      maxLength={100}
                    />
                    <TextField
                      label="Additional notes"
                      placeholder="Add context for this movement"
                      value={notes}
                      onChangeText={setNotes}
                      multiline
                      textAlignVertical="top"
                      style={styles.notesInput}
                    />
                  </Card>
                </>
              ) : null}
            </>
          ) : null}

          {stage === "review" && sourceBlock && destinationBlock ? (
            <Card style={styles.section}>
              <SectionHeading
                number="✓"
                title="Review movement"
                subtitle="All selected batches move together from one block to one block."
              />
              <MovementSummary
                label="From"
                blockName={sourceBlock.name}
                batches={selectedBatches}
                totalQuantity={totalQuantity}
                date={movementDate}
              />
              <View style={styles.arrow}>
                <Ionicons
                  name="arrow-down-outline"
                  size={20}
                  color={theme.textSecondary}
                />
              </View>
              <MovementSummary
                label="To"
                blockName={destinationBlock.name}
                batches={selectedBatches}
                totalQuantity={totalQuantity}
                date={movementDate}
              />
              <AppText size="small" tone="secondary">
                {selectedBatches.length}{" "}
                {selectedBatches.length === 1 ? "batch" : "batches"} ·{" "}
                {formatChickenCount(totalQuantity)} · {formatDate(movementDate)}
              </AppText>
              {reason.trim() ? (
                <SummaryRow label="Reason" value={reason.trim()} />
              ) : null}
              {notes.trim() ? (
                <SummaryRow label="Notes" value={notes.trim()} />
              ) : null}
            </Card>
          ) : null}

          {error?.target === "quantity" ? (
            <InlineError message={error.message} />
          ) : null}
        </ScrollView>
        {inventory && hasStock ? (
          <View
            style={[
              styles.bottomBar,
              {
                backgroundColor: theme.background,
                borderTopColor: theme.border,
              },
            ]}
          >
            <View style={styles.bottomCopy}>
              <AppText size="small" weight="semibold" numberOfLines={1}>
                {selectedBatches.length
                  ? `${selectedBatches.length} ${selectedBatches.length === 1 ? "batch" : "batches"} · ${formatChickenCount(totalQuantity, "bird")}`
                  : "Select batches"}
              </AppText>
              <AppText size="small" tone="secondary" numberOfLines={1}>
                {sourceBlock
                  ? `${sourceBlock.name}${destinationBlock ? ` → ${destinationBlock.name}` : ""}`
                  : "Choose one source block"}
              </AppText>
            </View>
            {stage === "select" ? (
              <Button
                label="Review movement"
                onPress={continueToReview}
                style={styles.primaryAction}
                disabled={
                  selectedBatches.length === 0 ||
                  !destinationBlockId ||
                  !totalQuantity
                }
              />
            ) : (
              <View style={styles.reviewActions}>
                <Button
                  label="Edit"
                  variant="secondary"
                  onPress={() => setStage("select")}
                  disabled={createMovement.isPending || options.isFetching}
                  style={styles.secondaryAction}
                />
                <Button
                  label="Confirm move"
                  onPress={() => void confirmAndMove()}
                  loading={createMovement.isPending || options.isFetching}
                  disabled={createMovement.isPending || options.isFetching}
                  style={styles.reviewPrimaryAction}
                />
              </View>
            )}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SectionHeading({
  number,
  title,
  subtitle,
}: {
  number: string;
  title: string;
  subtitle: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.sectionHeading}>
      <View
        style={[
          styles.stepNumber,
          { backgroundColor: `${theme.primary}18` },
        ]}
      >
        <AppText
          size="small"
          weight="semibold"
          style={{ color: theme.primary }}
        >
          {number}
        </AppText>
      </View>
      <View style={styles.headingCopy}>
        <AppText weight="semibold">{title}</AppText>
        <AppText size="small" tone="secondary">
          {subtitle}
        </AppText>
      </View>
    </View>
  );
}

function InlineError({ message }: { message: string }) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.inlineError,
        { backgroundColor: `${theme.danger}10` },
      ]}
      accessibilityRole="alert"
    >
      <Ionicons name="alert-circle-outline" size={17} color={theme.danger} />
      <AppText size="small" style={styles.inlineErrorText}>
        {message}
      </AppText>
    </View>
  );
}

function MovementSummary({
  label,
  blockName,
  batches,
  totalQuantity,
  date,
}: {
  label: string;
  blockName: string;
  batches: SelectedBatch[];
  totalQuantity: number;
  date: string;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.movementSummary,
        { borderColor: theme.border, backgroundColor: theme.background },
      ]}
    >
      <Ionicons name="home-outline" size={19} color={theme.primary} />
      <View style={styles.movementSummaryCopy}>
        <AppText size="small" tone="secondary">
          {label}
        </AppText>
        <AppText weight="semibold">{blockName}</AppText>
        {batches.map((item) => (
          <AppText key={item.batch.id} size="small" tone="secondary">
            {item.quantity} × {item.batch.name} ·{" "}
            {formatChickenType(item.batch.chicken_type)} · Age{" "}
            {formatBatchAge(item.batch.hatch_date, date)}
          </AppText>
        ))}
        <AppText size="small" weight="semibold">
          Total: {formatChickenCount(totalQuantity)}
        </AppText>
      </View>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.summaryRow, { borderBottomColor: theme.border }]}>
      <AppText size="small" tone="secondary">
        {label}
      </AppText>
      <AppText size="small" weight="semibold" style={styles.summaryValue}>
        {value}
      </AppText>
    </View>
  );
}

function localToday(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(today.getDate()).padStart(2, "0")}`;
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function formatBatchAge(
  hatchDate: string | null,
  onDate: string,
): string {
  if (!hatchDate) return "unknown age";
  const hatch = new Date(`${hatchDate}T00:00:00`);
  const referenceDate = new Date(`${onDate}T00:00:00`);
  if (
    Number.isNaN(hatch.getTime()) ||
    Number.isNaN(referenceDate.getTime())
  ) {
    return "unknown age";
  }
  if (referenceDate.getTime() < hatch.getTime()) return "not hatched yet";
  const days = Math.floor(
    (referenceDate.getTime() - hatch.getTime()) / 86_400_000,
  );
  const weeks = Math.floor(days / 7);
  const remainingDays = days % 7;
  if (!weeks) return `${days} ${days === 1 ? "day" : "days"} old`;
  return `${weeks} ${weeks === 1 ? "week" : "weeks"}${
    remainingDays
      ? ` ${remainingDays} ${remainingDays === 1 ? "day" : "days"}`
      : ""
  } old`;
}

function formatChickenType(type: ChickenSaleBatch["chicken_type"]): string {
  return type === "kienyeji"
    ? "Kienyeji"
    : type.charAt(0).toUpperCase() + type.slice(1);
}

function friendlyMovementError(message: string): string {
  if (message.toLowerCase().includes("room for")) {
    return "The destination block no longer has enough space for all selected chickens. Reduce quantities or choose another block.";
  }
  if (
    message.toLowerCase().includes("chickens left") ||
    message.toLowerCase().includes("assigned to the selected batch")
  ) {
    return "The source stock changed while you were working. Update the affected batch quantity and try again.";
  }
  if (message.toLowerCase().includes("active batch")) {
    return "One of the selected batches is no longer active. Refresh and choose an active batch.";
  }
  if (message.toLowerCase().includes("active block")) {
    return "A selected block is no longer active. Choose a different block.";
  }
  return message;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 14,
  },
  introCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 14,
    borderWidth: 1,
    borderRadius: 16,
  },
  introIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  introCopy: { flex: 1, minWidth: 0, gap: 3 },
  stepPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  section: { gap: 17, padding: 17, borderRadius: 16 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  headingCopy: { flex: 1, minWidth: 0, gap: 2 },
  stepNumber: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  blockChoices: {
    gap: 9,
  },
  blockChoice: {
    width: "100%",
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  blockIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  blockCopy: { flex: 1, minWidth: 0, gap: 2 },
  batchList: { gap: 9 },
  batchCard: { borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  batchSelect: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  checkbox: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderRadius: 7,
  },
  batchCopy: { flex: 1, minWidth: 0, gap: 2 },
  stockCount: {
    minWidth: 54,
    alignItems: "flex-end",
    gap: 1,
    paddingLeft: 7,
  },
  quantityRow: {
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  selectionSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 13,
    borderRadius: 13,
  },
  selectionSummaryCopy: { flex: 1, gap: 2 },
  destinationList: { gap: 9, marginTop: 4 },
  destinationChoice: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  destinationCopy: { flex: 1, minWidth: 0, gap: 2 },
  dateField: { marginTop: 0 },
  notesInput: { minHeight: 96 },
  emptyState: { alignItems: "center", gap: 10, paddingVertical: 28, borderRadius: 16 },
  inlineError: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 8,
    padding: 10,
    marginTop: 7,
  },
  inlineErrorText: { flex: 1 },
  movementSummary: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: 13,
    padding: 14,
  },
  movementSummaryCopy: { flex: 1, minWidth: 0, gap: 4 },
  arrow: { alignItems: "center" },
  summaryRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryValue: { flexShrink: 1, textAlign: "right" },
  bottomBar: {
    alignItems: "stretch",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
  },
  bottomCopy: { gap: 3 },
  primaryAction: { width: "100%", minHeight: 50, borderRadius: 13 },
  reviewActions: { flexDirection: "row", gap: 9 },
  secondaryAction: { flex: 1, minHeight: 50, borderRadius: 13 },
  reviewPrimaryAction: { flex: 1, minHeight: 50, borderRadius: 13 },
});
