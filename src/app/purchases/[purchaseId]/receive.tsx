import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
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
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type DraftAllocation = { id: string; blockId: string; quantity: string };
type ReceiptDraft = {
  transactionItemId: string;
  quantity: string;
  batchId: string;
  batchSearch: string;
  createBatch: boolean;
  age: string;
  ageUnit: ChickenAgeUnit;
  allocations: DraftAllocation[];
};

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function rowId() {
  return `${Date.now()}-${Math.random()}`;
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

  const initialDrafts = useMemo(() => {
    const purchase = detail.data;
    if (!purchase) return [];
    return purchase.transaction.items
      .filter((item) => Number(item.quantity_remaining) > 0)
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
          age: "",
          ageUnit: "weeks" as ChickenAgeUnit,
          allocations: [{ id: rowId(), blockId: "", quantity: "" }],
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
    updateDraft(transactionItemId, (draft) => {
      const parsed = Number(value);
      const fixedTotal = draft.allocations
        .slice(0, -1)
        .reduce((sum, allocation) => sum + (Number(allocation.quantity) || 0), 0);
      return {
        ...draft,
        quantity: value,
        allocations: draft.allocations.map((allocation, index) =>
          index === draft.allocations.length - 1
            ? {
                ...allocation,
                quantity: String(
                  Math.max(0, (Number.isInteger(parsed) ? parsed : 0) - fixedTotal),
                ),
              }
            : allocation,
        ),
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

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
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
          detail.data.transaction.items.every((item) => Number(item.quantity_remaining) <= 0) ? (
            <Card style={styles.state}>
              <AppText weight="semibold">All chickens on this purchase have been received.</AppText>
              <Button label="Back to purchase" variant="secondary" onPress={() => router.back()} />
            </Card>
          ) : (
            <>
              <Card style={styles.intro}>
                <AppText weight="semibold">Record only what arrived now</AppText>
                <AppText size="small" tone="secondary">
                  You can save a partial receipt and record the remaining chickens when they arrive. Inventory updates only for the quantities received here.
                </AppText>
              </Card>
              <Card style={styles.formCard}>
                <DatePickerField label="Receipt date" value={receivedDate} onChange={setReceivedDate} />
                {detail.data.transaction.items.filter((item) => Number(item.quantity_remaining) > 0).map((item) => {
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
                    <View key={item.id} style={[styles.item, { borderTopColor: theme.border }]}>
                      <AppText weight="semibold">{item.product_name ?? "Chicken item"}</AppText>
                      <AppText size="small" tone="secondary">
                        {Number(item.quantity_received).toLocaleString()} received · {Number(item.quantity_remaining).toLocaleString()} outstanding
                      </AppText>
                      <TextInput
                        accessibilityLabel={`Quantity received now for ${item.product_name ?? "chicken item"}`}
                        keyboardType="number-pad"
                        value={draft.quantity}
                        onChangeText={(value) => updateQuantity(item.id, value)}
                        placeholder={`Receive now (up to ${item.quantity_remaining})`}
                        placeholderTextColor={theme.textSecondary}
                        style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                      />
                      {linkedBatchId ? (
                        <View style={[styles.linkedBatch, { backgroundColor: theme.backgroundSelected }]}>
                          <Ionicons name="layers-outline" size={17} color={theme.primary} />
                          <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                            Continue in {matchingBatches.find((batch) => batch.id === linkedBatchId)?.name ?? "the batch already linked to this purchase"}
                          </AppText>
                        </View>
                      ) : (
                        <>
                          <AppText size="small" weight="semibold">Chicken batch</AppText>
                          <View style={styles.choiceList}>
                            <Choice
                              label="Create a new batch"
                              selected={draft.createBatch}
                              onPress={() => updateDraft(item.id, (current) => ({ ...current, createBatch: true, batchId: "" }))}
                            />
                            <Choice
                              label="Use an existing batch"
                              selected={!draft.createBatch}
                              onPress={() => updateDraft(item.id, (current) => ({ ...current, createBatch: false, batchId: "", batchSearch: "" }))}
                            />
                          </View>
                          {draft.createBatch ? (
                            <View style={styles.ageRow}>
                              <TextInput
                                accessibilityLabel="Chicken age when received"
                                keyboardType="number-pad"
                                value={draft.age}
                                onChangeText={(age) => updateDraft(item.id, (current) => ({ ...current, age }))}
                                placeholder="Age (optional)"
                                placeholderTextColor={theme.textSecondary}
                                style={[styles.input, styles.ageInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                              />
                              {(["days", "weeks", "months", "years"] as ChickenAgeUnit[]).map((unit) => (
                                <Choice key={unit} label={unit} selected={draft.ageUnit === unit} onPress={() => updateDraft(item.id, (current) => ({ ...current, ageUnit: unit }))} />
                              ))}
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
                      {draft.allocations.map((allocation, index) => (
                        <View key={allocation.id} style={[styles.allocation, { borderColor: theme.border }]}>
                          <View style={styles.rowHeading}>
                            <AppText size="small" weight="semibold">Housing allocation {index + 1}</AppText>
                            {draft.allocations.length > 1 ? (
                              <Pressable accessibilityRole="button" accessibilityLabel={`Remove housing allocation ${index + 1}`} onPress={() => updateDraft(item.id, (current) => ({ ...current, allocations: current.allocations.filter((candidate) => candidate.id !== allocation.id) }))}>
                                <Ionicons name="trash-outline" size={18} color={theme.danger} />
                              </Pressable>
                            ) : null}
                          </View>
                          <View style={styles.choiceList}>
                            {options.data.blocks.map((block) => (
                              <Choice
                                key={block.id}
                                label={`${block.name} · ${block.available_capacity} spaces`}
                                selected={allocation.blockId === block.id}
                                disabled={
                                  block.available_capacity <= 0 &&
                                  allocation.blockId !== block.id
                                }
                                onPress={() => updateDraft(item.id, (current) => ({
                                  ...current,
                                  allocations: current.allocations.map((candidate) =>
                                    candidate.id === allocation.id
                                      ? { ...candidate, blockId: block.id }
                                      : candidate,
                                  ),
                                }))}
                              />
                            ))}
                          </View>
                          <TextInput
                            accessibilityLabel={`Housing allocation ${index + 1} quantity`}
                            keyboardType="number-pad"
                            value={allocation.quantity}
                            onChangeText={(quantity) => updateDraft(item.id, (current) => ({
                              ...current,
                              allocations: current.allocations.map((candidate) =>
                                candidate.id === allocation.id
                                  ? { ...candidate, quantity }
                                  : candidate,
                              ),
                            }))}
                            placeholder="Quantity in this block"
                            placeholderTextColor={theme.textSecondary}
                            style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                          />
                        </View>
                      ))}
                      <Button
                        label="Split across another housing block"
                        variant="secondary"
                        onPress={() => updateDraft(item.id, (current) => ({
                          ...current,
                          allocations: [...current.allocations, { id: rowId(), blockId: "", quantity: "" }],
                        }))}
                      />
                    </View>
                  );
                })}
                <TextInput
                  accessibilityLabel="Receipt notes"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Notes (optional)"
                  placeholderTextColor={theme.textSecondary}
                  multiline
                  style={[styles.input, styles.notes, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                />
              </Card>
              {error ? <Card style={[styles.errorCard, { borderColor: theme.danger }]}><AppText size="small" style={{ color: theme.danger }}>{error}</AppText></Card> : null}
              <Button label="Save receipt and update flock" loading={createReceipt.isPending} disabled={createReceipt.isPending} onPress={() => void submit()} />
            </>
          )
        ) : null}
      </ScrollView>
    </SafeAreaView>
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
      <AppText size="small" style={selected ? { color: theme.primary } : undefined}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 18, paddingBottom: 36, gap: 14 },
  state: { gap: 10, alignItems: "flex-start" },
  intro: { gap: 5 },
  formCard: { gap: 14 },
  item: { gap: 9, borderTopWidth: 1, paddingTop: 14 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10 },
  notes: { minHeight: 80, textAlignVertical: "top" },
  linkedBatch: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 8, padding: 10 },
  choiceList: { gap: 7 },
  choice: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  ageRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  ageInput: { minWidth: 120, flex: 1 },
  allocation: { gap: 9, borderWidth: 1, borderRadius: 10, padding: 10 },
  rowHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  errorCard: { borderWidth: 1, gap: 5 },
});
