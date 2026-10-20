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
  useChickenSaleDetails,
  useChickenSaleFulfillment,
  useChickenSaleOptions,
  useCreateChickenSaleDelivery,
} from "@/features/chickens/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type DraftAllocation = {
  id: string;
  batchId: string;
  blockId: string;
  quantity: string;
  search: string;
};

type DeliveryDraft = {
  transactionItemId: string;
  quantity: string;
  allocations: DraftAllocation[];
};

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function allocationId() {
  return `${Date.now()}-${Math.random()}`;
}

export default function SaleDeliveryRoute() {
  return (
    <SessionGate>
      <SaleDeliveryContent />
    </SessionGate>
  );
}

function SaleDeliveryContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const { saleId } = useLocalSearchParams<{ saleId: string }>();
  const farmId = farm.selectedFarm?.id ?? "";
  const saleDetails = useChickenSaleDetails(user?.id, farmId, saleId);
  const fulfillment = useChickenSaleFulfillment(user?.id, farmId, saleId);
  const options = useChickenSaleOptions(user?.id, farmId);
  const createDelivery = useCreateChickenSaleDelivery(user?.id ?? "", farmId);
  const [draftOverride, setDraftOverride] = useState<DeliveryDraft[] | null>(null);
  const [deliveredDate, setDeliveredDate] = useState(localDateString);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const initialDrafts = useMemo(
    () =>
      fulfillment.data
        ? fulfillment.data.items
        .filter((item) => Number(item.outstanding_quantity) > 0)
        .map((item) => ({
          transactionItemId: item.transaction_item_id,
          quantity: "",
          allocations: [
            {
              id: allocationId(),
              batchId: "",
              blockId: "",
              quantity: "",
              search: "",
            },
          ],
        }))
        : [],
    [fulfillment.data],
  );
  const drafts = draftOverride ?? initialDrafts;

  const availablePairs = useMemo(() => {
    const pairs: {
      batchId: string;
      batchName: string;
      blockId: string;
      blockName: string;
      quantity: number;
      chickenType: string;
    }[] = [];
    for (const batch of options.data?.batches ?? []) {
      const matchingItems =
        fulfillment.data?.items.filter(
          (item) =>
            item.chicken_type == null || item.chicken_type === batch.chicken_type,
        ) ?? [];
      if (matchingItems.length === 0) continue;
      for (const stock of batch.stocks) {
        if (stock.quantity > 0) {
          pairs.push({
            batchId: batch.id,
            batchName: batch.name,
            blockId: stock.block_id,
            blockName: stock.block_name,
            quantity: stock.quantity,
            chickenType: batch.chicken_type,
          });
        }
      }
    }
    return pairs;
  }, [fulfillment.data, options.data]);

  function outstandingFor(transactionItemId: string) {
    return Number(
      fulfillment.data?.items.find(
        (item) => item.transaction_item_id === transactionItemId,
      )?.outstanding_quantity ?? 0,
    );
  }

  function updateDraft(
    transactionItemId: string,
    update: (draft: DeliveryDraft) => DeliveryDraft,
  ) {
    setDraftOverride((current) =>
      (current ?? drafts).map((draft) =>
        draft.transactionItemId === transactionItemId ? update(draft) : draft,
      ),
    );
  }

  function updateDeliveryQuantity(transactionItemId: string, quantity: string) {
    updateDraft(transactionItemId, (draft) => {
      const parsed = Number(quantity);
      const allocationTotal = draft.allocations
        .slice(0, -1)
        .reduce((sum, allocation) => sum + (Number(allocation.quantity) || 0), 0);
      return {
        ...draft,
        quantity,
        allocations: draft.allocations.map((allocation, index) =>
          index === draft.allocations.length - 1
            ? {
                ...allocation,
                quantity: String(Math.max(0, (Number.isInteger(parsed) ? parsed : 0) - allocationTotal)),
              }
            : allocation,
        ),
      };
    });
  }

  function updateAllocation(
    transactionItemId: string,
    rowId: string,
    changes: Partial<DraftAllocation>,
  ) {
    updateDraft(transactionItemId, (draft) => ({
      ...draft,
      allocations: draft.allocations.map((allocation) =>
        allocation.id === rowId ? { ...allocation, ...changes } : allocation,
      ),
    }));
  }

  function addAllocation(transactionItemId: string) {
    updateDraft(transactionItemId, (draft) => ({
      ...draft,
      allocations: [
        ...draft.allocations,
        {
          id: allocationId(),
          batchId: "",
          blockId: "",
          quantity: "",
          search: "",
        },
      ],
    }));
  }

  function remainingStock(pair: (typeof availablePairs)[number], row: DraftAllocation) {
    const alreadyAllocated = drafts.reduce(
      (sum, draft) =>
        sum +
        draft.allocations.reduce(
          (lineSum, allocation) =>
            allocation.id !== row.id &&
            allocation.batchId === pair.batchId &&
            allocation.blockId === pair.blockId
              ? lineSum + (Number(allocation.quantity) || 0)
              : lineSum,
          0,
        ),
      0,
    );
    return pair.quantity - alreadyAllocated;
  }

  async function submit() {
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveredDate)) {
      setError("Choose a valid delivery date.");
      return;
    }
    const items = [];
    const stockTotals = new Map<string, number>();
    for (const draft of drafts) {
      const quantity = Number(draft.quantity);
      if (!draft.quantity.trim()) continue;
      const outstanding = outstandingFor(draft.transactionItemId);
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > outstanding) {
        setError(`Enter a whole quantity from 1 to ${outstanding.toLocaleString()} for each delivery.`);
        return;
      }
      const allocations = draft.allocations.map((allocation) => ({
        batch_id: allocation.batchId,
        block_id: allocation.blockId,
        quantity: Number(allocation.quantity),
      }));
      if (
        allocations.length === 0 ||
        allocations.some(
          (allocation) =>
            !allocation.batch_id ||
            !allocation.block_id ||
            !Number.isInteger(allocation.quantity) ||
            allocation.quantity <= 0,
        ) ||
        allocations.reduce((sum, allocation) => sum + allocation.quantity, 0) !== quantity
      ) {
        setError("For each delivery, complete batch and block allocations so their quantities equal the delivered amount.");
        return;
      }
      const pairs = new Set(allocations.map((allocation) => `${allocation.batch_id}:${allocation.block_id}`));
      if (pairs.size !== allocations.length) {
        setError("Each batch and block can only appear once per item in a delivery.");
        return;
      }
      for (const allocation of allocations) {
        const pair = availablePairs.find(
          (candidate) =>
            candidate.batchId === allocation.batch_id &&
            candidate.blockId === allocation.block_id,
        );
        if (!pair) {
          setError("A selected batch and block no longer has available chicken stock. Refresh and review the delivery.");
          return;
        }
        const key = `${allocation.batch_id}:${allocation.block_id}`;
        const next = (stockTotals.get(key) ?? 0) + allocation.quantity;
        if (next > pair.quantity) {
          setError(`Only ${pair.quantity.toLocaleString()} chickens are currently available from ${pair.batchName} in ${pair.blockName}.`);
          return;
        }
        stockTotals.set(key, next);
      }
      items.push({
        transaction_item_id: draft.transactionItemId,
        quantity_delivered: quantity,
        batch_allocations: allocations,
      });
    }
    if (items.length === 0) {
      setError("Enter a quantity for at least one item being delivered.");
      return;
    }
    try {
      const delivery = await createDelivery.mutateAsync({
        transactionId: saleId,
        payload: {
          delivered_date: deliveredDate,
          notes: notes.trim() || undefined,
          items,
        },
      });
      await dialog.showDialog({
        title: "Delivery recorded",
        message: `${delivery.items.reduce((sum, item) => sum + Number(item.quantity_delivered), 0).toLocaleString()} chickens were deducted from stock and recorded against this sale.`,
        tone: "success",
      });
      router.replace({ pathname: "/sales/[saleId]", params: { saleId } });
    } catch (submitError: unknown) {
      setError(normalizeApiError(submitError).message);
    }
  }

  const isLoading = fulfillment.isLoading || options.isLoading;
  const loadError = fulfillment.error ?? options.error;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <FarmPageHeader title="Record chicken delivery" showBack />
        {isLoading ? (
          <Card style={styles.state}>
            <ActivityIndicator color={theme.primary} />
            <AppText tone="secondary">Loading outstanding quantities and available stock…</AppText>
          </Card>
        ) : loadError ? (
          <Card style={styles.state}>
            <AppText weight="semibold">Could not load delivery details</AppText>
            <AppText size="small" tone="secondary">{normalizeApiError(loadError).message}</AppText>
            <Button label="Retry" variant="secondary" onPress={() => { void fulfillment.refetch(); void options.refetch(); }} />
          </Card>
        ) : fulfillment.data && options.data ? (
          <>
            {fulfillment.data.fully_resolved ? (
              <Card style={styles.state}>
                <AppText weight="semibold">This sale has no outstanding chickens to deliver.</AppText>
                <Button label="Back to sale" variant="secondary" onPress={() => router.back()} />
              </Card>
            ) : (
              <>
                <Card style={styles.intro}>
                  <AppText weight="semibold">Record a delivery, not a new sale</AppText>
                  <AppText size="small" tone="secondary">
                    Enter only the chickens handed over now. You can come back and record another delivery later; each delivery reduces stock when saved.
                  </AppText>
                </Card>
                <Card style={styles.formCard}>
                  <DatePickerField label="Delivery date" value={deliveredDate} onChange={setDeliveredDate} />
                  {fulfillment.data.items.filter((item) => Number(item.outstanding_quantity) > 0).map((item) => {
                    const draft = drafts.find((candidate) => candidate.transactionItemId === item.transaction_item_id);
                    if (!draft) return null;
                    const productName = saleDetails.data?.transaction.items.find(
                      (candidate) => candidate.id === item.transaction_item_id,
                    )?.product_name;
                    const itemPairs = availablePairs.filter(
                      (pair) =>
                        item.chicken_type == null ||
                        pair.chickenType === item.chicken_type,
                    );
                    return (
                      <View key={item.transaction_item_id} style={[styles.item, { borderTopColor: theme.border }]}>
                        <AppText weight="semibold">{productName ?? (item.chicken_type ? labelize(item.chicken_type) : "Chicken item")}</AppText>
                        <AppText size="small" tone="secondary">
                          {Number(item.delivered_quantity).toLocaleString()} delivered · {Number(item.outstanding_quantity).toLocaleString()} still to deliver
                        </AppText>
                        <TextInput
                          accessibilityLabel="Quantity delivered now"
                          keyboardType="number-pad"
                          value={draft.quantity}
                          onChangeText={(value) => updateDeliveryQuantity(item.transaction_item_id, value)}
                          placeholder={`Deliver now (up to ${item.outstanding_quantity})`}
                          placeholderTextColor={theme.textSecondary}
                          style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                        />
                        {draft.allocations.map((allocation, index) => (
                          <View key={allocation.id} style={[styles.allocation, { borderColor: theme.border }]}>
                            <View style={styles.rowHeading}>
                              <AppText size="small" weight="semibold">Stock allocation {index + 1}</AppText>
                              {draft.allocations.length > 1 ? (
                                <Pressable accessibilityRole="button" accessibilityLabel={`Remove allocation ${index + 1}`} onPress={() => updateDraft(item.transaction_item_id, (current) => ({ ...current, allocations: current.allocations.filter((candidate) => candidate.id !== allocation.id) }))}>
                                  <Ionicons name="trash-outline" size={18} color={theme.danger} />
                                </Pressable>
                              ) : null}
                            </View>
                            <View style={styles.pairList}>
                              <TextInput
                                accessibilityLabel={`Search available batches and blocks for allocation ${index + 1}`}
                                value={allocation.search}
                                onChangeText={(search) =>
                                  updateAllocation(item.transaction_item_id, allocation.id, {
                                    search,
                                    batchId: "",
                                    blockId: "",
                                  })
                                }
                                placeholder="Search batch or block"
                                placeholderTextColor={theme.textSecondary}
                                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                              />
                              {itemPairs.length === 0 ? (
                                <AppText size="small" style={{ color: theme.danger }}>
                                  No current batch stock matches this item. You can’t record this delivery until matching chickens are available.
                                </AppText>
                              ) : allocation.search.trim().length === 0 ? (
                                <AppText size="small" tone="secondary">
                                  Search by batch or block to choose available stock.
                                </AppText>
                              ) : itemPairs
                                .filter((pair) =>
                                  `${pair.batchName} ${pair.blockName}`
                                    .toLowerCase()
                                    .includes(allocation.search.trim().toLowerCase()),
                                ).length === 0 ? (
                                  <AppText size="small" tone="secondary">
                                    No available batch or block matches that search.
                                  </AppText>
                                ) : itemPairs
                                .filter((pair) =>
                                  `${pair.batchName} ${pair.blockName}`
                                    .toLowerCase()
                                    .includes(allocation.search.trim().toLowerCase()),
                                )
                                .slice(0, 8)
                                .map((pair) => {
                                  const stockAvailable = remainingStock(pair, allocation);
                                  const selected = allocation.batchId === pair.batchId && allocation.blockId === pair.blockId;
                                  return (
                                    <Pressable
                                      key={`${pair.batchId}:${pair.blockId}`}
                                      accessibilityRole="button"
                                      accessibilityState={{ selected }}
                                      disabled={!selected && stockAvailable <= 0}
                                      onPress={() => updateAllocation(item.transaction_item_id, allocation.id, { batchId: pair.batchId, blockId: pair.blockId, search: `${pair.batchName} ${pair.blockName}`, quantity: draft.allocations.length === 1 ? draft.quantity : allocation.quantity })}
                                      style={[styles.stockChoice, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? `${theme.primary}12` : theme.backgroundElement, opacity: !selected && stockAvailable <= 0 ? 0.45 : 1 }]}
                                    >
                                      <AppText size="small" weight="semibold" style={selected ? { color: theme.primary } : undefined}>{pair.batchName}</AppText>
                                      <AppText size="small" tone="secondary">{pair.blockName} · {stockAvailable} available</AppText>
                                    </Pressable>
                                  );
                                })}
                            </View>
                            <TextInput
                              accessibilityLabel={`Allocation ${index + 1} quantity`}
                              keyboardType="number-pad"
                              value={allocation.quantity}
                              onChangeText={(value) => updateAllocation(item.transaction_item_id, allocation.id, { quantity: value })}
                              placeholder="Quantity from this batch and block"
                              placeholderTextColor={theme.textSecondary}
                              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                            />
                          </View>
                        ))}
                        <Button label="Split across another batch or block" variant="secondary" onPress={() => addAllocation(item.transaction_item_id)} />
                      </View>
                    );
                  })}
                  <TextInput
                    accessibilityLabel="Delivery notes"
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Notes (optional)"
                    placeholderTextColor={theme.textSecondary}
                    multiline
                    style={[styles.input, styles.notes, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                  />
                </Card>
                {error ? <Card style={[styles.errorCard, { borderColor: theme.danger }]}><AppText size="small" style={{ color: theme.danger }}>{error}</AppText></Card> : null}
                <Button label="Save delivery and update stock" loading={createDelivery.isPending} disabled={createDelivery.isPending} onPress={() => void submit()} />
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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
  allocation: { gap: 9, borderWidth: 1, borderRadius: 10, padding: 10 },
  rowHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pairList: { gap: 7 },
  stockChoice: { gap: 3, borderWidth: 1, borderRadius: 8, padding: 9 },
  errorCard: { borderWidth: 1, gap: 5 },
});
