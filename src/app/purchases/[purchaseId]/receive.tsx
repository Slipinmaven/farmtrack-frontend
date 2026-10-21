import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import {
  useChickenPurchaseDetails,
  useChickenPurchaseOptions,
  useCreateChickenPurchaseReceipt,
} from "@/features/chickens/hooks";
import type {
  ChickenAgeUnit,
  ChickenPurchaseReceiptInput,
} from "@/features/chickens/api";
import { isChickenPurchaseItem } from "@/features/chickens/api";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type DraftAllocation = { blockId: string; quantity: string };
type ReceiptDraft = {
  transactionItemId: string;
  quantity: string;
  batchId: string;
  batchSearch: string;
  createBatch: boolean;
  batchName: string;
  age: string;
  ageUnit: ChickenAgeUnit;
  allocations: DraftAllocation[];
};

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatChickenType(value: string | null): string {
  if (!value) return "Chicken";
  const labels: Record<string, string> = {
    layers: "Layers",
    broiler: "Broilers",
    kienyeji: "Kienyeji",
    breeder: "Breeders",
  };
  return labels[value] ?? value[0].toUpperCase() + value.slice(1);
}

export default function PurchaseReceiptRoute() {
  return (
    <SessionGate>
      <PurchaseReceiptContent />
    </SessionGate>
  );
}

function PurchaseReceiptContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const { purchaseId } = useLocalSearchParams<{ purchaseId: string }>();
  const farmId = farm.selectedFarm?.id ?? "";
  const detail = useChickenPurchaseDetails(user?.id, farmId, purchaseId);
  const options = useChickenPurchaseOptions(user?.id, farmId);
  const createReceipt = useCreateChickenPurchaseReceipt(user?.id ?? "", farmId);
  const [draftOverride, setDraftOverride] = useState<ReceiptDraft[] | null>(null);
  const [receivedDate, setReceivedDate] = useState(localDateString);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ageUnitItemId, setAgeUnitItemId] = useState<string | null>(null);

  const initialDrafts = useMemo(() => {
    const purchase = detail.data;
    if (!purchase) return [];
    return purchase.transaction.items
      .filter(
        (item) =>
          isChickenPurchaseItem(item) && Number(item.quantity_remaining) > 0,
      )
      .map((item) => {
        const previousReceipt = purchase.receipts
          .flatMap((receipt) => receipt.items)
          .find((receiptItem) => receiptItem.transaction_item_id === item.id);
        const linkedBatchId = previousReceipt?.batch_id ?? item.batch_id ?? "";
        return {
          transactionItemId: item.id,
          quantity: "",
          batchId: linkedBatchId,
          batchSearch: "",
          createBatch: !linkedBatchId,
          batchName: "",
          age: "",
          ageUnit: "weeks" as ChickenAgeUnit,
          allocations: [],
        };
      });
  }, [detail.data]);
  const drafts = draftOverride ?? initialDrafts;

  function updateDraft(
    transactionItemId: string,
    update: (draft: ReceiptDraft) => ReceiptDraft,
  ) {
    setDraftOverride((current) =>
      (current ?? drafts).map((draft) =>
        draft.transactionItemId === transactionItemId ? update(draft) : draft,
      ),
    );
  }

  function updateQuantity(transactionItemId: string, value: string) {
    updateDraft(transactionItemId, (draft) => ({ ...draft, quantity: value }));
  }

  function toggleBlock(transactionItemId: string, blockId: string) {
    updateDraft(transactionItemId, (draft) => {
      const selected = draft.allocations.some(
        (allocation) => allocation.blockId === blockId,
      );
      return {
        ...draft,
        allocations: selected
          ? draft.allocations.filter((allocation) => allocation.blockId !== blockId)
          : [...draft.allocations, { blockId, quantity: "" }],
      };
    });
  }

  async function submit() {
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)) {
      setError("Choose a valid receipt date.");
      return;
    }
    const purchase = detail.data;
    const purchaseOptions = options.data;
    if (!purchase || !purchaseOptions) {
      setError("Purchase or receipt options are unavailable. Refresh and try again.");
      return;
    }
    const receiptItems: ChickenPurchaseReceiptInput["items"] = [];
    const plannedBlockTotals = new Map<string, number>();
    for (const draft of drafts) {
      if (!draft.quantity.trim()) continue;
      const item = purchase.transaction.items.find(
        (candidate) => candidate.id === draft.transactionItemId,
      );
      if (!item) {
        setError("A purchase item is no longer available. Refresh and try again.");
        return;
      }
      const quantity = Number(draft.quantity);
      const outstanding = Number(item.quantity_remaining);
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > outstanding) {
        setError(`Enter a whole received quantity from 1 to ${outstanding.toLocaleString()} for each item.`);
        return;
      }
      const allocations = draft.allocations.map((allocation) => ({
        block_id: allocation.blockId,
        quantity: Number(allocation.quantity),
      }));
      if (
        allocations.length === 0 ||
        allocations.some(
          (allocation) =>
            !allocation.block_id ||
            !Number.isInteger(allocation.quantity) ||
            allocation.quantity <= 0,
        ) ||
        allocations.reduce((sum, allocation) => sum + allocation.quantity, 0) !== quantity
      ) {
        setError("Allocate the received chickens to housing blocks; allocation quantities must add up to the amount received.");
        return;
      }
      if (new Set(allocations.map((allocation) => allocation.block_id)).size !== allocations.length) {
        setError("Use each housing block only once per receipt item.");
        return;
      }
      for (const allocation of allocations) {
        const block = purchaseOptions.blocks.find(
          (candidate) => candidate.id === allocation.block_id,
        );
        if (!block) {
          setError("A selected block is no longer available. Refresh and review the receipt.");
          return;
        }
        const total = (plannedBlockTotals.get(block.id) ?? 0) + allocation.quantity;
        if (total > block.available_capacity) {
          setError(`${block.name} has room for only ${block.available_capacity.toLocaleString()} more chickens.`);
          return;
        }
        plannedBlockTotals.set(block.id, total);
      }
      let batchAssignment: ChickenPurchaseReceiptInput["items"][number]["batch_assignment"];
      if (draft.createBatch) {
        const age = draft.age.trim() ? Number(draft.age) : null;
        if (age !== null && (!Number.isInteger(age) || age < 0)) {
          setError("Enter a valid whole-number chicken age, or leave it blank.");
          return;
        }
        batchAssignment = {
          action: "CREATE",
          new_batch: {
            ...(draft.batchName.trim()
              ? { name: draft.batchName.trim() }
              : {}),
            chicken_type: item.chicken_type ?? "other",
            ...(age !== null ? { age, age_unit: draft.ageUnit } : {}),
          },
        };
      } else {
        const batch = purchaseOptions.batches.find(
          (candidate) => candidate.id === draft.batchId,
        );
        if (!batch || (item.chicken_type && batch.chicken_type !== item.chicken_type)) {
          setError("Choose an active batch with the same chicken type as this purchase item.");
          return;
        }
        batchAssignment = { action: "USE_EXISTING", batch_id: batch.id };
      }
      receiptItems.push({
        transaction_item_id: item.id,
        quantity_received: quantity,
        batch_assignment: batchAssignment,
        block_allocations: allocations,
      });
    }
    if (receiptItems.length === 0) {
      setError("Enter a quantity for at least one item received.");
      return;
    }
    try {
      const receipt = await createReceipt.mutateAsync({
        transaction_id: purchaseId,
        received_date: receivedDate,
        notes: notes.trim() || undefined,
        items: receiptItems,
      });
      await dialog.showDialog({
        title: "Receipt recorded",
        message: `${receipt.items.reduce((sum, item) => sum + Number(item.quantity_received), 0).toLocaleString()} chickens were added to inventory and linked to this purchase.`,
        tone: "success",
      });
      router.replace({ pathname: "/purchases/[purchaseId]", params: { purchaseId } });
    } catch (submitError: unknown) {
      setError(normalizeApiError(submitError).message);
    }
  }

  const isLoading = detail.isLoading || options.isLoading;
  const loadError = detail.error ?? options.error;
  const chickenItems =
    detail.data?.transaction.items.filter(isChickenPurchaseItem) ?? [];
  const outstandingItems = chickenItems.filter(
    (item) => Number(item.quantity_remaining) > 0,
  );
  const totalPurchased = chickenItems.reduce(
    (sum, item) => sum + Number(item.quantity),
    0,
  );
  const totalReceived = chickenItems.reduce(
    (sum, item) => sum + Number(item.quantity_received),
    0,
  );
  const totalOutstanding = outstandingItems.reduce(
    (sum, item) => sum + Number(item.quantity_remaining),
    0,
  );
  const totalReceivingNow = drafts.reduce(
    (sum, draft) => sum + (Number(draft.quantity) || 0),
    0,
  );
  const receivedProgress =
    totalPurchased > 0 ? Math.min(1, totalReceived / totalPurchased) : 0;
  const activeAgeDraft = drafts.find(
    (draft) => draft.transactionItemId === ageUnitItemId,
  );

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        >
        <FarmPageHeader title="Record chicken receipt" showBack />
        {isLoading ? (
          <Card style={styles.state}>
            <ActivityIndicator color={theme.primary} />
            <AppText tone="secondary">Loading outstanding quantities and housing capacity…</AppText>
          </Card>
        ) : loadError ? (
          <Card style={styles.state}>
            <AppText weight="semibold">Could not load receipt details</AppText>
            <AppText size="small" tone="secondary">{normalizeApiError(loadError).message}</AppText>
            <Button label="Retry" variant="secondary" onPress={() => { void detail.refetch(); void options.refetch(); }} />
          </Card>
        ) : detail.data && options.data ? (
          chickenItems.length === 0 ||
          chickenItems.every((item) => Number(item.quantity_remaining) <= 0) ? (
            <Card style={styles.state}>
              <AppText weight="semibold">
                {chickenItems.length === 0
                  ? "This purchase has no chicken items to receive."
                  : "All chickens on this purchase have been received."}
              </AppText>
              <Button label="Back to purchase" variant="secondary" onPress={() => router.back()} />
            </Card>
          ) : (
            <>
              <Card style={styles.purchaseOverview}>
                <View style={styles.overviewHeading}>
                  <View style={[styles.overviewIcon, { backgroundColor: `${theme.primary}16` }]}>
                    <Ionicons name="receipt-outline" size={21} color={theme.primary} />
                  </View>
                  <View style={styles.overviewCopy}>
                    <AppText size="small" tone="secondary">
                      {detail.data.transaction.reference_number ?? "Chicken purchase"}
                    </AppText>
                    <AppText weight="semibold">
                      {detail.data.supplier_name ?? "Purchase"}
                    </AppText>
                    <AppText size="small" tone="secondary">
                      Purchased {detail.data.transaction.transaction_date}
                    </AppText>
                  </View>
                  <View style={[styles.outstandingBadge, { backgroundColor: `${theme.secondary}18` }]}>
                    <AppText size="small" weight="semibold" style={{ color: theme.secondary }}>
                      {totalOutstanding.toLocaleString()} due
                    </AppText>
                  </View>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${receivedProgress * 100}%`,
                        backgroundColor: theme.success,
                      },
                    ]}
                  />
                </View>
                <View style={styles.overviewStats}>
                  <OverviewStat label="Purchased" value={totalPurchased} color={theme.text} />
                  <OverviewStat label="Received" value={totalReceived} color={theme.success} />
                  <OverviewStat label="Outstanding" value={totalOutstanding} color={theme.secondary} />
                </View>
                <View style={[styles.receiptInstruction, { backgroundColor: theme.background }]}>
                  <Ionicons name="information-circle-outline" size={18} color={theme.primary} />
                  <AppText size="small" tone="secondary" style={styles.instructionCopy}>
                    Record only what arrived today. Any balance stays outstanding for the next delivery.
                  </AppText>
                </View>
              </Card>
              <Card style={styles.dateCard}>
                <View style={styles.sectionHeading}>
                  <View>
                    <AppText weight="semibold">Receipt details</AppText>
                    <AppText size="small" tone="secondary">When did this delivery arrive?</AppText>
                  </View>
                  <Ionicons name="calendar-outline" size={20} color={theme.primary} />
                </View>
                <DatePickerField label="Receipt date" value={receivedDate} onChange={setReceivedDate} />
              </Card>
                <View style={styles.itemsHeading}>
                  <View>
                    <AppText size="heading" weight="semibold">Items arriving</AppText>
                    <AppText size="small" tone="secondary">Enter a quantity for each item delivered.</AppText>
                  </View>
                  <View style={[styles.nowBadge, { backgroundColor: `${theme.primary}14` }]}>
                    <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                      {totalReceivingNow.toLocaleString()} now
                    </AppText>
                  </View>
                </View>
                {outstandingItems.map((item, itemIndex) => {
                  const draft = drafts.find((candidate) => candidate.transactionItemId === item.id);
                  if (!draft) return null;
                  const matchingBatches = options.data.batches.filter(
                    (batch) => !item.chicken_type || batch.chicken_type === item.chicken_type,
                  );
                  const filteredBatches = matchingBatches
                    .filter((batch) =>
                      batch.name
                        .toLowerCase()
                        .includes(draft.batchSearch.trim().toLowerCase()),
                    )
                    .slice(0, 8);
                  const linkedBatchId =
                    detail.data.receipts.flatMap((receipt) => receipt.items)
                      .find((receiptItem) => receiptItem.transaction_item_id === item.id)?.batch_id ??
                    item.batch_id ??
                    "";
                  return (
                    <Card key={item.id} style={styles.itemCard}>
                      <View style={styles.itemTitleRow}>
                        <View style={[styles.itemNumber, { backgroundColor: `${theme.primary}14` }]}>
                          <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                            {String(itemIndex + 1).padStart(2, "0")}
                          </AppText>
                        </View>
                        <View style={styles.itemTitleCopy}>
                          <AppText weight="semibold">{item.product_name ?? "Chicken item"}</AppText>
                          <AppText size="small" tone="secondary">
                            {formatChickenType(item.chicken_type)} · {item.unit_name ?? "chickens"}
                          </AppText>
                        </View>
                      </View>
                      <View style={[styles.quantitySummary, { backgroundColor: `${theme.primary}08` }]}>
                        <QuantityStat label="Bought" value={Number(item.quantity)} />
                        <QuantityStat label="Received" value={Number(item.quantity_received)} color={theme.success} />
                        <QuantityStat label="Still due" value={Number(item.quantity_remaining)} color={theme.secondary} />
                      </View>
                      <View style={[styles.receiveNowPanel, { backgroundColor: theme.backgroundSelected }]}>
                        <View style={styles.receiveNowHeading}>
                          <View>
                            <AppText weight="semibold">Received in this delivery</AppText>
                            <AppText size="small" tone="secondary">
                              Up to {Number(item.quantity_remaining).toLocaleString()} remaining
                            </AppText>
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Receive all ${item.quantity_remaining} remaining chickens`}
                            onPress={() => updateQuantity(item.id, String(item.quantity_remaining))}
                            style={[styles.fillRemainingButton, { backgroundColor: `${theme.primary}14` }]}
                          >
                            <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                              Receive all
                            </AppText>
                          </Pressable>
                        </View>
                        <TextInput
                          accessibilityLabel={`Quantity received now for ${item.product_name ?? "chicken item"}`}
                          keyboardType="number-pad"
                          value={draft.quantity}
                          onChangeText={(value) => updateQuantity(item.id, value)}
                          placeholder="Enter quantity received"
                          placeholderTextColor={theme.textSecondary}
                          style={[styles.quantityInput, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.border }]}
                        />
                      </View>
                      {linkedBatchId ? (
                        <View style={[styles.linkedBatch, { backgroundColor: theme.backgroundSelected }]}>
                          <Ionicons name="layers-outline" size={17} color={theme.primary} />
                          <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                            Continue in {matchingBatches.find((batch) => batch.id === linkedBatchId)?.name ?? "the batch already linked to this purchase"}
                          </AppText>
                        </View>
                      ) : (
                        <>
                          <View style={styles.subsectionHeading}>
                            <AppText weight="semibold">Batch assignment</AppText>
                            <AppText size="small" tone="secondary">Where should these birds be grouped?</AppText>
                          </View>
                          <View style={styles.batchModeRow}>
                            <BatchModeOption
                              title="New batch"
                              description="Auto-named by default"
                              icon="add-circle-outline"
                              selected={draft.createBatch}
                              onPress={() => updateDraft(item.id, (current) => ({ ...current, createBatch: true, batchId: "" }))}
                            />
                            <BatchModeOption
                              title="Existing batch"
                              description={matchingBatches.length ? "Continue a group" : "No matching batches"}
                              icon="layers-outline"
                              selected={!draft.createBatch}
                              disabled={matchingBatches.length === 0}
                              onPress={() => updateDraft(item.id, (current) => ({ ...current, createBatch: false, batchId: "", batchSearch: "" }))}
                            />
                          </View>
                          {draft.createBatch ? (
                            <View style={styles.batchDetails}>
                              <View style={styles.fieldLabel}>
                                <AppText size="small" weight="semibold">Batch name</AppText>
                                <AppText size="small" tone="secondary">Optional</AppText>
                              </View>
                              <TextInput
                                accessibilityLabel="New chicken batch name"
                                value={draft.batchName}
                                onChangeText={(batchName) => updateDraft(item.id, (current) => ({ ...current, batchName }))}
                                placeholder="Auto-generated if left blank"
                                placeholderTextColor={theme.textSecondary}
                                maxLength={100}
                                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                              />
                              <View style={styles.fieldLabel}>
                                <AppText size="small" weight="semibold">Age on arrival</AppText>
                                <AppText size="small" tone="secondary">Optional · estimates hatch date</AppText>
                              </View>
                              <View style={styles.ageRow}>
                                <TextInput
                                  accessibilityLabel="Chicken age when received"
                                  keyboardType="number-pad"
                                  value={draft.age}
                                  onChangeText={(age) => updateDraft(item.id, (current) => ({ ...current, age }))}
                                  placeholder="Age"
                                  placeholderTextColor={theme.textSecondary}
                                  style={[styles.input, styles.ageInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                                />
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`Age unit, currently ${draft.ageUnit}`}
                                  accessibilityState={{ expanded: ageUnitItemId === item.id }}
                                  onPress={() => {
                                    Keyboard.dismiss();
                                    setAgeUnitItemId(item.id);
                                  }}
                                  style={[styles.unitPicker, { backgroundColor: theme.background, borderColor: theme.border }]}
                                >
                                  <AppText weight="semibold">
                                    {draft.ageUnit[0].toUpperCase() + draft.ageUnit.slice(1)}
                                  </AppText>
                                  <Ionicons name="chevron-down" size={17} color={theme.textSecondary} />
                                </Pressable>
                              </View>
                            </View>
                          ) : matchingBatches.length ? (
                            <>
                              <TextInput
                                accessibilityLabel="Search existing chicken batches"
                                value={draft.batchSearch}
                                onChangeText={(batchSearch) => updateDraft(item.id, (current) => ({ ...current, batchId: "", batchSearch }))}
                                placeholder="Search batches by name"
                                placeholderTextColor={theme.textSecondary}
                                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                              />
                              {draft.batchId ? (
                                <AppText size="small" tone="secondary">
                                  Selected batch: {matchingBatches.find((batch) => batch.id === draft.batchId)?.name}
                                </AppText>
                              ) : null}
                              <View style={styles.choiceList}>
                              {filteredBatches.map((batch) => (
                                <Choice key={batch.id} label={`${batch.name}${batch.hatch_date ? ` · hatched ${batch.hatch_date}` : ""}`} selected={draft.batchId === batch.id} onPress={() => updateDraft(item.id, (current) => ({ ...current, batchId: batch.id }))} />
                              ))}
                              </View>
                              {draft.batchSearch.trim().length === 0 ? (
                                <AppText size="small" tone="secondary">Type to search the active batches.</AppText>
                              ) : filteredBatches.length === 0 ? (
                                <AppText size="small" tone="secondary">No matching active batch.</AppText>
                              ) : null}
                            </>
                          ) : (
                            <AppText size="small" style={{ color: theme.danger }}>No active batch matches this chicken type. Create a new batch to record the receipt.</AppText>
                          )}
                        </>
                      )}
                      <View style={styles.subsectionHeading}>
                        <AppText weight="semibold">Choose housing blocks</AppText>
                        <AppText size="small" tone="secondary">
                          Select one or more blocks, then enter the number going into each.
                        </AppText>
                      </View>
                      {options.data.blocks.length === 0 ? (
                        <View style={[styles.allocationNotice, { backgroundColor: `${theme.danger}0D` }]}>
                          <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
                          <AppText size="small" style={[styles.instructionCopy, { color: theme.danger }]}>
                            Add an active housing block before recording this receipt.
                          </AppText>
                        </View>
                      ) : (
                        <View style={styles.blockList}>
                          {options.data.blocks.map((block) => {
                            const allocation = draft.allocations.find(
                              (candidate) => candidate.blockId === block.id,
                            );
                            const blockQuantity = Number(allocation?.quantity) || 0;
                            const plannedAcrossReceipt = drafts.reduce(
                              (total, currentDraft) =>
                                total +
                                (Number(
                                  currentDraft.allocations.find(
                                    (candidate) => candidate.blockId === block.id,
                                  )?.quantity,
                                ) || 0),
                              0,
                            );
                            const overCapacity =
                              plannedAcrossReceipt > block.available_capacity;
                            return (
                              <View
                                key={block.id}
                                style={[
                                  styles.blockChoice,
                                  {
                                    borderColor: allocation ? theme.primary : theme.border,
                                    backgroundColor: allocation
                                      ? `${theme.primary}08`
                                      : theme.background,
                                  },
                                ]}
                              >
                                <Pressable
                                  accessibilityRole="checkbox"
                                  accessibilityState={{ checked: Boolean(allocation), disabled: block.available_capacity <= 0 && !allocation }}
                                  disabled={block.available_capacity <= 0 && !allocation}
                                  onPress={() => toggleBlock(item.id, block.id)}
                                  style={styles.blockChoiceHeader}
                                >
                                  <View
                                    style={[
                                      styles.blockCheckbox,
                                      {
                                        backgroundColor: allocation ? theme.primary : "transparent",
                                        borderColor: allocation ? theme.primary : theme.border,
                                      },
                                    ]}
                                  >
                                    {allocation ? (
                                      <Ionicons name="checkmark" size={15} color="#FFFFFF" />
                                    ) : null}
                                  </View>
                                  <View style={styles.blockCopy}>
                                    <AppText weight="semibold">{block.name}</AppText>
                                    <AppText size="small" tone="secondary">
                                      {block.available_capacity.toLocaleString()} spaces available
                                    </AppText>
                                  </View>
                                  {block.available_capacity <= 0 && !allocation ? (
                                    <AppText size="small" tone="secondary">Full</AppText>
                                  ) : null}
                                </Pressable>
                                {allocation ? (
                                  <View style={[styles.blockQuantityRow, { borderTopColor: theme.border }]}>
                                    <AppText size="small" tone="secondary">Chickens in this block</AppText>
                                    <TextInput
                                      accessibilityLabel={`Quantity for ${block.name}`}
                                      keyboardType="number-pad"
                                      value={allocation.quantity}
                                      onChangeText={(quantity) => updateDraft(item.id, (current) => ({
                                        ...current,
                                        allocations: current.allocations.map((candidate) =>
                                          candidate.blockId === block.id
                                            ? { ...candidate, quantity }
                                            : candidate,
                                        ),
                                      }))}
                                      placeholder="0"
                                      placeholderTextColor={theme.textSecondary}
                                      style={[styles.blockQuantityInput, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.border }]}
                                    />
                                  </View>
                                ) : null}
                                {allocation && overCapacity ? (
                                  <AppText size="small" style={{ color: theme.danger }}>
                                    This allocation exceeds the {block.available_capacity.toLocaleString()} available spaces.
                                  </AppText>
                                ) : null}
                                {allocation && blockQuantity > 0 && !overCapacity ? (
                                  <AppText size="small" style={{ color: theme.success }}>
                                    {Math.max(0, block.available_capacity - plannedAcrossReceipt).toLocaleString()} spaces remain after this receipt.
                                  </AppText>
                                ) : null}
                              </View>
                            );
                          })}
                        </View>
                      )}
                      {(() => {
                        const allocated = draft.allocations.reduce(
                          (sum, allocation) => sum + (Number(allocation.quantity) || 0),
                          0,
                        );
                        const received = Number(draft.quantity) || 0;
                        const capacityExceeded = draft.allocations.some((allocation) => {
                          const block = options.data.blocks.find(
                            (candidate) => candidate.id === allocation.blockId,
                          );
                          if (!block) return true;
                          const totalForBlock = drafts.reduce(
                            (total, currentDraft) =>
                              total +
                              (Number(
                                currentDraft.allocations.find(
                                  (candidate) => candidate.blockId === block.id,
                                )?.quantity,
                              ) || 0),
                            0,
                          );
                          return totalForBlock > block.available_capacity;
                        });
                        const exceeded = allocated > received || capacityExceeded;
                        const complete =
                          received > 0 && allocated === received && !capacityExceeded;
                        const statusColor = complete
                          ? theme.success
                          : exceeded
                            ? theme.danger
                            : theme.textSecondary;
                        return (
                          <View style={[
                            styles.allocationProgress,
                            {
                              backgroundColor: complete
                                ? `${theme.success}12`
                                : exceeded
                                  ? `${theme.danger}0D`
                                  : theme.background,
                            },
                          ]}>
                            <View style={styles.allocationProgressCopy}>
                              <AppText size="small" weight="semibold" style={{ color: statusColor }}>
                                {complete
                                  ? "Allocation complete"
                                  : capacityExceeded
                                    ? "Review block capacity"
                                    : exceeded
                                      ? "Reduce allocation"
                                      : "Still to assign"}
                              </AppText>
                              <AppText size="small" tone="secondary">
                                {allocated.toLocaleString()} of {received.toLocaleString()} received chickens
                              </AppText>
                            </View>
                            <Ionicons
                              name={complete ? "checkmark-circle" : exceeded ? "alert-circle" : "ellipse-outline"}
                              size={20}
                              color={statusColor}
                            />
                          </View>
                        );
                      })()}
                    </Card>
                  );
                })}
              <Card style={styles.notesCard}>
                <AppText weight="semibold">Delivery notes <AppText tone="secondary">(optional)</AppText></AppText>
                <TextInput
                  accessibilityLabel="Receipt notes"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Condition, transport, or other useful details"
                  placeholderTextColor={theme.textSecondary}
                  multiline
                  style={[styles.quantityInput, styles.notes, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                />
              </Card>
              {error ? (
                <Card style={[styles.errorCard, { borderColor: `${theme.danger}66`, backgroundColor: `${theme.danger}0D` }]}>
                  <Ionicons name="alert-circle" size={20} color={theme.danger} />
                  <AppText size="small" style={[styles.instructionCopy, { color: theme.danger }]}>{error}</AppText>
                </Card>
              ) : null}
              <View style={styles.submitSection}>
                <AppText size="small" tone="secondary">
                  Only the quantity entered above is added to flock stock.
                </AppText>
                <Button
                  label={`Record ${totalReceivingNow ? totalReceivingNow.toLocaleString() : ""} chickens received`}
                  loading={createReceipt.isPending}
                  disabled={createReceipt.isPending}
                  onPress={() => void submit()}
                />
              </View>
            </>
          )
        ) : null}
        </ScrollView>
        <Modal
          visible={ageUnitItemId !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setAgeUnitItemId(null)}
        >
          <View style={styles.modalBackdrop}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close age unit options"
              onPress={() => setAgeUnitItemId(null)}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.unitModal, { backgroundColor: theme.backgroundElement }]}>
              <AppText size="heading" weight="semibold">Age unit</AppText>
              <AppText size="small" tone="secondary">
                Choose how the age on arrival is measured.
              </AppText>
              {(["days", "weeks", "months", "years"] as ChickenAgeUnit[]).map((unit) => (
                  <Pressable
                    key={unit}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: activeAgeDraft?.ageUnit === unit }}
                    onPress={() => {
                      if (ageUnitItemId) {
                        updateDraft(ageUnitItemId, (draft) => ({ ...draft, ageUnit: unit }));
                      }
                      setAgeUnitItemId(null);
                    }}
                    style={[
                      styles.unitOption,
                      {
                        backgroundColor: activeAgeDraft?.ageUnit === unit
                          ? `${theme.primary}12`
                          : theme.background,
                        borderColor: activeAgeDraft?.ageUnit === unit
                          ? theme.primary
                          : theme.border,
                      },
                    ]}
                  >
                    <AppText
                      weight={activeAgeDraft?.ageUnit === unit ? "semibold" : undefined}
                      style={activeAgeDraft?.ageUnit === unit ? { color: theme.primary } : undefined}
                    >
                      {unit[0].toUpperCase() + unit.slice(1)}
                    </AppText>
                    {activeAgeDraft?.ageUnit === unit ? (
                      <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                    ) : null}
                  </Pressable>
              ))}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function BatchModeOption({
  title,
  description,
  icon,
  selected,
  disabled = false,
  onPress,
}: {
  title: string;
  description: string;
  icon: "add-circle-outline" | "layers-outline";
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.batchModeOption,
        {
          borderColor: selected ? theme.primary : theme.border,
          backgroundColor: selected ? `${theme.primary}0D` : theme.backgroundElement,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={19}
        color={selected ? theme.primary : theme.textSecondary}
      />
      <View style={styles.batchModeCopy}>
        <AppText size="small" weight="semibold" style={selected ? { color: theme.primary } : undefined}>
          {title}
        </AppText>
        <AppText size="small" tone="secondary" numberOfLines={1}>
          {description}
        </AppText>
      </View>
    </Pressable>
  );
}

function Choice({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.choice,
        {
          borderColor: selected ? theme.primary : theme.border,
          backgroundColor: selected ? `${theme.primary}12` : theme.backgroundElement,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <AppText
        size="small"
        style={[styles.choiceLabel, selected ? { color: theme.primary } : undefined]}
      >
        {label}
      </AppText>
      <Ionicons
        name={selected ? "checkmark-circle" : "ellipse-outline"}
        size={19}
        color={selected ? theme.primary : theme.textSecondary}
      />
    </Pressable>
  );
}

function OverviewStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.overviewStat}>
      <AppText size="small" tone="secondary" numberOfLines={1}>
        {label}
      </AppText>
      <AppText weight="semibold" style={{ color }}>
        {value.toLocaleString()}
      </AppText>
    </View>
  );
}

function QuantityStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <View style={styles.quantityStat}>
      <AppText size="small" tone="secondary" numberOfLines={1}>
        {label}
      </AppText>
      <AppText size="small" weight="semibold" style={color ? { color } : undefined}>
        {value.toLocaleString()}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 56,
    gap: 16,
  },
  state: { gap: 12, alignItems: "flex-start", borderRadius: 16 },
  purchaseOverview: { gap: 16, borderRadius: 18, padding: 18 },
  overviewHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  overviewIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  overviewCopy: { flex: 1, minWidth: 0, gap: 3 },
  outstandingBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  progressTrack: { height: 7, overflow: "hidden", borderRadius: 999 },
  progressFill: { height: "100%", borderRadius: 999 },
  overviewStats: { flexDirection: "row", gap: 10 },
  overviewStat: { flex: 1, minWidth: 0, gap: 4 },
  receiptInstruction: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderRadius: 12,
    padding: 11,
  },
  instructionCopy: { flex: 1, lineHeight: 19 },
  dateCard: { gap: 14, borderRadius: 16, padding: 17 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  itemsHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingTop: 4,
  },
  nowBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  itemCard: { gap: 16, borderRadius: 18, padding: 17 },
  itemTitleRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  itemNumber: {
    width: 37,
    height: 37,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  itemTitleCopy: { flex: 1, minWidth: 0, gap: 3 },
  quantitySummary: { flexDirection: "row", gap: 8, borderRadius: 13, padding: 12 },
  quantityStat: { flex: 1, minWidth: 0, gap: 4 },
  receiveNowPanel: { gap: 12, borderRadius: 14, padding: 14 },
  receiveNowHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  fillRemainingButton: { borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 },
  quantityInput: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 16,
  },
  linkedBatch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: 12,
    padding: 12,
  },
  subsectionHeading: { gap: 3, paddingTop: 2 },
  choiceList: { gap: 8 },
  choice: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  choiceLabel: { flex: 1 },
  batchModeRow: { flexDirection: "row", gap: 9 },
  batchModeOption: {
    flex: 1,
    minWidth: 0,
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  batchModeCopy: { flex: 1, minWidth: 0, gap: 3 },
  batchDetails: { gap: 9 },
  fieldLabel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 3,
  },
  ageRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  ageInput: { minWidth: 120, flex: 1 },
  unitPicker: {
    minWidth: 112,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 13,
  },
  blockList: { gap: 9 },
  blockChoice: { gap: 10, borderWidth: 1, borderRadius: 14, padding: 12 },
  blockChoiceHeader: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  blockCheckbox: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderRadius: 7,
  },
  blockCopy: { flex: 1, minWidth: 0, gap: 2 },
  blockQuantityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  blockQuantityInput: {
    width: 92,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    textAlign: "center",
    fontSize: 16,
  },
  allocationNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderRadius: 12,
    padding: 12,
  },
  allocationProgress: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderRadius: 12,
    padding: 12,
  },
  allocationProgressCopy: { flex: 1, gap: 3 },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#00000066",
  },
  unitModal: { width: "100%", maxWidth: 380, gap: 10, borderRadius: 20, padding: 20 },
  unitOption: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 13,
  },
  notesCard: { gap: 12, borderRadius: 16, padding: 17 },
  notes: { minHeight: 92, textAlignVertical: "top", fontSize: 16 },
  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderWidth: 1,
    borderRadius: 13,
    padding: 13,
  },
  submitSection: { gap: 10, paddingTop: 3 },
});
