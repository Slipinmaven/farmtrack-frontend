import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
};

type DeliveryDraft = {
  transactionItemId: string;
  quantity: string;
  allocations: DraftAllocation[];
};

type AvailableStockPair = {
  batchId: string;
  batchName: string;
  hatchDate: string | null;
  blockId: string;
  blockName: string;
  quantity: number;
  chickenType: string;
};

type DeliveryFormErrors = {
  general?: string;
  date?: string;
  items: Record<string, string>;
  allocations: Record<string, string>;
};

const emptyErrors: DeliveryFormErrors = {
  items: {},
  allocations: {},
};

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month &&
    parsed.getDate() === day
  );
}

function allocationId() {
  return `${Date.now()}-${Math.random()}`;
}

function formatBatchAge(hatchDate: string | null): string {
  if (!hatchDate) return "Age unknown";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hatchDate);
  if (!match) return "Age unknown";
  const hatch = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (
    hatch.getUTCFullYear() !== Number(match[1]) ||
    hatch.getUTCMonth() !== Number(match[2]) - 1 ||
    hatch.getUTCDate() !== Number(match[3])
  ) {
    return "Age unknown";
  }

  const today = new Date();
  const current = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );
  if (hatch > current) return "Hatch date is in the future";

  let years = current.getUTCFullYear() - hatch.getUTCFullYear();
  let months = current.getUTCMonth() - hatch.getUTCMonth();
  let days = current.getUTCDate() - hatch.getUTCDate();
  if (days < 0) {
    months -= 1;
    days += new Date(
      Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 0),
    ).getUTCDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years > 0) {
    return `${years} ${years === 1 ? "year" : "years"}${
      months ? `, ${months} ${months === 1 ? "month" : "months"}` : ""
    } old`;
  }
  if (months > 0) {
    const weeks = Math.floor(days / 7);
    return `${months} ${months === 1 ? "month" : "months"}${
      weeks ? `, ${weeks} ${weeks === 1 ? "week" : "weeks"}` : ""
    } old`;
  }
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} old`;
  const weeks = Math.floor(days / 7);
  const remainingDays = days % 7;
  return `${weeks} ${weeks === 1 ? "week" : "weeks"}${
    remainingDays
      ? `, ${remainingDays} ${remainingDays === 1 ? "day" : "days"}`
      : ""
  } old`;
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
  const { saleId } = useLocalSearchParams<{ saleId: string }>();
  const farmId = farm.selectedFarm?.id ?? "";
  const saleDetails = useChickenSaleDetails(user?.id, farmId, saleId);
  const fulfillment = useChickenSaleFulfillment(user?.id, farmId, saleId);
  const options = useChickenSaleOptions(user?.id, farmId);
  const createDelivery = useCreateChickenSaleDelivery(user?.id ?? "", farmId);
  const [draftOverride, setDraftOverride] = useState<DeliveryDraft[] | null>(null);
  const [deliveredDate, setDeliveredDate] = useState(localDateString);
  const [notes, setNotes] = useState("");
  const [formErrors, setFormErrors] =
    useState<DeliveryFormErrors>(emptyErrors);
  const [quantityLimitNotices, setQuantityLimitNotices] = useState<
    Record<string, string>
  >({});
  const [submitError, setSubmitError] = useState<{
    title: string;
    message: string;
    requestId?: string;
    canRefresh: boolean;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);

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
            },
          ],
        }))
        : [],
    [fulfillment.data],
  );
  const drafts = draftOverride ?? initialDrafts;
  const plannedDeliveryCount = drafts.reduce(
    (sum, draft) => sum + (Number(draft.quantity) || 0),
    0,
  );

  const availablePairs = useMemo(() => {
    const pairs: AvailableStockPair[] = [];
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
            hatchDate: batch.hatch_date,
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
    setFormErrors((current) => ({
      ...current,
      general: undefined,
      items: Object.fromEntries(
        Object.entries(current.items).filter(
          ([itemId]) => itemId !== transactionItemId,
        ),
      ),
      allocations: Object.fromEntries(
        Object.entries(current.allocations).filter(
          ([allocationId]) =>
            !drafts
              .find((draft) => draft.transactionItemId === transactionItemId)
              ?.allocations.some(
                (allocation) => allocation.id === allocationId,
              ),
        ),
      ),
    }));
    setSubmitError(null);
    setRefreshNotice(null);
    setQuantityLimitNotices((current) => {
      if (!(transactionItemId in current)) return current;
      const next = { ...current };
      delete next[transactionItemId];
      return next;
    });
  }

  function updateDeliveryQuantity(transactionItemId: string, quantity: string) {
    const outstanding = outstandingFor(transactionItemId);
    const parsedQuantity = Number(quantity);
    const exceedsOutstanding =
      /^\d+$/.test(quantity.trim()) &&
      Number.isFinite(parsedQuantity) &&
      parsedQuantity > outstanding;
    const acceptedQuantity = exceedsOutstanding
      ? String(outstanding)
      : quantity;
    updateDraft(transactionItemId, (draft) => {
      const parsed = Number(acceptedQuantity);
      const selectedAllocationIndexes = draft.allocations.flatMap(
        (allocation, index) =>
          allocation.batchId && allocation.blockId ? [index] : [],
      );
      const lastSelectedIndex =
        selectedAllocationIndexes[selectedAllocationIndexes.length - 1];
      let remainingToAllocate =
        Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
      const selectedAllocationQuantities = new Map<number, number>();
      for (const index of selectedAllocationIndexes) {
        const currentQuantity = Number(draft.allocations[index].quantity) || 0;
        const retainedQuantity = Math.min(currentQuantity, remainingToAllocate);
        selectedAllocationQuantities.set(index, retainedQuantity);
        remainingToAllocate -= retainedQuantity;
      }
      if (lastSelectedIndex !== undefined) {
        selectedAllocationQuantities.set(
          lastSelectedIndex,
          (selectedAllocationQuantities.get(lastSelectedIndex) ?? 0) +
            remainingToAllocate,
        );
      }
      return {
        ...draft,
        quantity: acceptedQuantity,
        allocations: draft.allocations.map((allocation, index) => {
          if (!selectedAllocationQuantities.has(index)) return allocation;
          return {
            ...allocation,
            quantity: String(selectedAllocationQuantities.get(index) ?? 0),
          };
        }),
      };
    });
    if (exceedsOutstanding) {
      setQuantityLimitNotices((current) => ({
        ...current,
        [transactionItemId]: `This order has ${outstanding.toLocaleString()} chickens left to deliver. The quantity was limited to ${outstanding.toLocaleString()}.`,
      }));
    }
  }

  function updateAllocation(
    transactionItemId: string,
    rowId: string,
    changes: Partial<DraftAllocation>,
  ) {
    updateDraft(transactionItemId, (draft) => {
      const allocation = draft.allocations.find((row) => row.id === rowId);
      if (!allocation) return draft;
      const changingBlock =
        changes.blockId !== undefined && changes.blockId !== allocation.blockId;
      return {
        ...draft,
        allocations: draft.allocations.map((row) =>
          row.id === rowId
            ? {
                ...row,
                ...changes,
                ...(changingBlock
                  ? { batchId: "", quantity: "" }
                  : {}),
              }
            : row,
        ),
      };
    });
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
    if (createDelivery.isPending) return;
    setFormErrors(emptyErrors);
    setSubmitError(null);
    const nextErrors: DeliveryFormErrors = {
      items: {},
      allocations: {},
    };
    if (!isValidCalendarDate(deliveredDate)) {
      nextErrors.date = "Choose a real calendar date for this delivery.";
    } else if (deliveredDate > localDateString()) {
      nextErrors.date =
        "A delivery date can’t be in the future. Choose the date the chickens were handed over.";
    }
    const items = [];
    const stockTotals = new Map<string, number>();
    for (const draft of drafts) {
      const hasAllocationInput = draft.allocations.some(
        (allocation) =>
          allocation.batchId ||
          allocation.blockId ||
          allocation.quantity.trim(),
      );
      if (!draft.quantity.trim()) {
        if (hasAllocationInput) {
          nextErrors.items[draft.transactionItemId] =
            "Enter the number of chickens being delivered for this item.";
          for (const allocation of draft.allocations) {
            if (
              allocation.batchId ||
              allocation.blockId ||
              allocation.quantity.trim()
            ) {
              nextErrors.allocations[allocation.id] =
                "Add the quantity from this stock source.";
            }
          }
        }
        continue;
      }
      const quantity = Number(draft.quantity);
      const outstanding = outstandingFor(draft.transactionItemId);
      if (!/^\d+$/.test(draft.quantity.trim()) || !Number.isInteger(quantity) || quantity <= 0) {
        nextErrors.items[draft.transactionItemId] =
          "Enter a whole number greater than zero.";
        continue;
      }
      if (quantity > outstanding) {
        nextErrors.items[draft.transactionItemId] =
          `This is more than the ${outstanding.toLocaleString()} chickens still outstanding.`;
        continue;
      }

      const allocations = [];
      let itemHasAllocationError = false;
      for (const allocation of draft.allocations) {
        if (
          !allocation.batchId &&
          !allocation.blockId &&
          !allocation.quantity.trim()
        ) {
          continue;
        }
        const allocationQuantity = Number(allocation.quantity);
        if (
          !allocation.batchId ||
          !allocation.blockId ||
          !/^\d+$/.test(allocation.quantity.trim()) ||
          !Number.isInteger(allocationQuantity) ||
          allocationQuantity <= 0
        ) {
          nextErrors.allocations[allocation.id] =
            !allocation.blockId
              ? "Choose a block for this stock source."
              : !allocation.batchId
                ? "Choose a batch from this block."
                : "Enter a whole number of birds greater than zero.";
          itemHasAllocationError = true;
          continue;
        }
        allocations.push({
          batch_id: allocation.batchId,
          block_id: allocation.blockId,
          quantity: allocationQuantity,
        });
      }
      if (itemHasAllocationError) {
        nextErrors.items[draft.transactionItemId] =
          "Complete each stock source before saving this item.";
        continue;
      }
      if (allocations.length === 0) {
        nextErrors.items[draft.transactionItemId] =
          "Choose at least one block and batch for this delivery.";
        continue;
      }
      const totalAllocated = allocations.reduce(
        (sum, allocation) => sum + allocation.quantity,
        0,
      );
      if (totalAllocated !== quantity) {
        nextErrors.items[draft.transactionItemId] =
          `${totalAllocated.toLocaleString()} allocated, but ${quantity.toLocaleString()} entered as delivered. Make the totals match.`;
        continue;
      }
      const pairs = new Set(
        allocations.map(
          (allocation) => `${allocation.batch_id}:${allocation.block_id}`,
        ),
      );
      if (pairs.size !== allocations.length) {
        nextErrors.items[draft.transactionItemId] =
          "A batch and block can only be selected once per item. Remove the duplicate stock source.";
        continue;
      }
      let stockError = false;
      for (const allocation of allocations) {
        const pair = availablePairs.find(
          (candidate) =>
            candidate.batchId === allocation.batch_id &&
            candidate.blockId === allocation.block_id,
        );
        if (!pair) {
          const row = draft.allocations.find(
            (candidate) =>
              candidate.batchId === allocation.batch_id &&
              candidate.blockId === allocation.block_id,
          );
          if (row) {
            nextErrors.allocations[row.id] =
              "This stock source is no longer available. Refresh stock and choose again.";
          }
          stockError = true;
          continue;
        }
        const key = `${allocation.batch_id}:${allocation.block_id}`;
        const next = (stockTotals.get(key) ?? 0) + allocation.quantity;
        if (next > pair.quantity) {
          const row = draft.allocations.find(
            (candidate) =>
              candidate.batchId === allocation.batch_id &&
              candidate.blockId === allocation.block_id,
          );
          if (row) {
            nextErrors.allocations[row.id] =
              `Only ${pair.quantity.toLocaleString()} birds are available in this batch and block across this delivery.`;
          }
          stockError = true;
          continue;
        }
        stockTotals.set(key, next);
      }
      if (stockError) {
        nextErrors.items[draft.transactionItemId] =
          "Review the highlighted stock source before saving.";
        continue;
      }
      items.push({
        transaction_item_id: draft.transactionItemId,
        quantity_delivered: quantity,
        batch_allocations: allocations,
      });
    }
    if (items.length === 0 && !Object.keys(nextErrors.items).length) {
      nextErrors.general =
        "Enter a delivery quantity for at least one item before saving.";
    }
    if (
      nextErrors.date ||
      nextErrors.general ||
      Object.keys(nextErrors.items).length > 0 ||
      Object.keys(nextErrors.allocations).length > 0
    ) {
      setFormErrors(nextErrors);
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
      router.replace({
        pathname: "/sales/[saleId]",
        params: {
          saleId,
          deliveryRecorded: "true",
          deliveredCount: String(
            delivery.items.reduce(
              (sum, item) => sum + Number(item.quantity_delivered),
              0,
            ),
          ),
        },
      });
    } catch (submitError: unknown) {
      const normalized = normalizeApiError(submitError);
      setSubmitError({
        title:
          normalized.status === 409
            ? "Stock or order changed"
            : normalized.status === 422
              ? "Delivery details need attention"
              : normalized.code === "NETWORK_ERROR" ||
                  normalized.code === "SERVER_WAKE_TIMEOUT"
                ? "Couldn’t reach the server"
                : "Delivery wasn’t saved",
        message:
          normalized.status === 409
            ? "The stock or remaining order quantity changed while you were entering this delivery. Refresh the latest details, then review your selections."
            : normalized.details.length > 0
              ? normalized.details
                  .map((detail) => detail.message)
                  .join(" ")
              : normalized.message,
        requestId: normalized.requestId,
        canRefresh: true,
      });
    }
  }

  async function refreshLatestDeliveryData() {
    setIsRefreshing(true);
    setSubmitError(null);
    setRefreshNotice(null);
    try {
      const results = await Promise.all([
        fulfillment.refetch(),
        options.refetch(),
        saleDetails.refetch(),
      ]);
      const failedQuery = results.find((result) => result.isError);
      if (failedQuery?.isError) throw failedQuery.error;
      const latestOptions = results[1].data;
      const currentDrafts = draftOverride ?? drafts;
      const requestedBySource = new Map<string, number>();
      for (const draft of currentDrafts) {
        for (const allocation of draft.allocations) {
          if (!allocation.batchId || !allocation.blockId) continue;
          const key = `${allocation.batchId}:${allocation.blockId}`;
          requestedBySource.set(
            key,
            (requestedBySource.get(key) ?? 0) +
              (Number(allocation.quantity) || 0),
          );
        }
      }
      const invalidSources = new Set<string>();
      for (const [key, requested] of requestedBySource) {
        const separator = key.indexOf(":");
        const batchId = key.slice(0, separator);
        const blockId = key.slice(separator + 1);
        const batch = latestOptions?.batches.find(
          (candidate) => candidate.id === batchId,
        );
        const stock = batch?.stocks.find(
          (candidate) => candidate.block_id === blockId,
        );
        if (!stock || stock.quantity < requested) invalidSources.add(key);
      }
      setDraftOverride(
        currentDrafts.map((draft) => ({
          ...draft,
          allocations: draft.allocations.map((allocation) => {
            if (!allocation.batchId || !allocation.blockId) return allocation;
            if (
              invalidSources.has(
                `${allocation.batchId}:${allocation.blockId}`,
              )
            ) {
              return {
                ...allocation,
                batchId: "",
                blockId: "",
                quantity: "",
              };
            }
            return allocation;
          }),
        })),
      );
      setFormErrors(emptyErrors);
      setRefreshNotice(
        invalidSources.size > 0
          ? "Latest order and stock loaded. Some stock sources no longer have enough birds; choose replacements and review each delivery quantity."
          : "Latest order and stock loaded. Review the delivery quantities and selected sources before saving.",
      );
    } catch (refreshError: unknown) {
      const normalized = normalizeApiError(refreshError);
      setSubmitError({
        title: "Couldn’t refresh delivery details",
        message: normalized.message,
        requestId: normalized.requestId,
        canRefresh: true,
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  const isLoading =
    fulfillment.isLoading || options.isLoading || saleDetails.isLoading;
  const loadError =
    fulfillment.error ?? options.error ?? saleDetails.error;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets
      >
        <FarmPageHeader title="Record chicken delivery" showBack />
        {isLoading ? (
          <Card style={styles.state}>
            <ActivityIndicator color={theme.primary} />
            <AppText tone="secondary">Loading outstanding quantities and available stock…</AppText>
          </Card>
        ) : loadError ? (
          <Card style={styles.state}>
            <View
              style={[
                styles.stateIcon,
                { backgroundColor: `${theme.danger}12` },
              ]}
            >
              <Ionicons
                name="cloud-offline-outline"
                size={22}
                color={theme.danger}
              />
            </View>
            <AppText weight="semibold">Delivery details couldn’t load</AppText>
            <AppText size="small" tone="secondary" style={styles.centered}>
              {normalizeApiError(loadError).message}
            </AppText>
            <Button
              label="Retry loading"
              variant="secondary"
              onPress={() => {
                void fulfillment.refetch();
                void options.refetch();
                void saleDetails.refetch();
              }}
            />
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
                  <View style={styles.introHeading}>
                    <View
                      style={[
                        styles.introIcon,
                        { backgroundColor: `${theme.primary}16` },
                      ]}
                    >
                      <Ionicons
                        name="cube-outline"
                        size={22}
                        color={theme.primary}
                      />
                    </View>
                    <View style={styles.copy}>
                      <AppText weight="semibold">Fulfil this order in parts</AppText>
                      <AppText size="small" tone="secondary">
                        Choose where today’s birds are coming from. You can
                        return later to record another delivery.
                      </AppText>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.orderSummary,
                      { backgroundColor: theme.background },
                    ]}
                  >
                    <View style={styles.orderMetric}>
                      <AppText size="small" tone="secondary">
                        Remaining to deliver
                      </AppText>
                      <AppText
                        size="title"
                        weight="semibold"
                        style={{ color: theme.primary }}
                      >
                        {Number(
                          fulfillment.data.items.reduce(
                            (sum, item) => sum + Number(item.outstanding_quantity),
                            0,
                          ),
                        ).toLocaleString()}
                      </AppText>
                    </View>
                    <View
                      style={[
                        styles.orderMetricDivider,
                        { backgroundColor: theme.border },
                      ]}
                    />
                    <View style={styles.orderMetric}>
                      <AppText size="small" tone="secondary">
                        Already delivered
                      </AppText>
                      <AppText size="title" weight="semibold">
                        {Number(
                          fulfillment.data.items.reduce(
                            (sum, item) => sum + Number(item.delivered_quantity),
                            0,
                          ),
                        ).toLocaleString()}
                      </AppText>
                    </View>
                  </View>
                </Card>
                <Card style={styles.formCard}>
                  <View style={styles.formHeading}>
                    <View style={styles.copy}>
                      <AppText weight="semibold">Delivery details</AppText>
                      <AppText size="small" tone="secondary">
                        Select a block, then choose its batch.
                      </AppText>
                    </View>
                  </View>
                  <DatePickerField
                    label="Date handed over"
                    value={deliveredDate}
                    maximumDate={new Date()}
                    onChange={(date) => {
                      setDeliveredDate(date);
                      setFormErrors((current) => ({
                        ...current,
                        date: undefined,
                        general: undefined,
                      }));
                      setSubmitError(null);
                    }}
                  />
                  {formErrors.general ? (
                    <InlineNotice
                      icon="alert-circle-outline"
                      tone="error"
                      message={formErrors.general}
                    />
                  ) : null}
                  {formErrors.date ? (
                    <FieldError message={formErrors.date} />
                  ) : null}
                  {refreshNotice ? (
                    <InlineNotice
                      icon="refresh-outline"
                      tone="info"
                      message={refreshNotice}
                    />
                  ) : null}
                  {plannedDeliveryCount > 0 ? (
                    <InlineNotice
                      icon="cube-outline"
                      tone="info"
                      message={`${plannedDeliveryCount.toLocaleString()} ${
                        plannedDeliveryCount === 1 ? "chicken" : "chickens"
                      } planned for this delivery. Stock changes only after you save.`}
                    />
                  ) : null}
                  {fulfillment.data.items
                    .filter((item) => Number(item.outstanding_quantity) > 0)
                    .map((item) => {
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
                    const itemBlocks = Array.from(
                      itemPairs.reduce((blocks, pair) => {
                        const existing = blocks.get(pair.blockId);
                        if (existing) {
                          existing.quantity += pair.quantity;
                        } else {
                          blocks.set(pair.blockId, {
                            id: pair.blockId,
                            name: pair.blockName,
                            quantity: pair.quantity,
                          });
                        }
                        return blocks;
                      }, new Map<string, { id: string; name: string; quantity: number }>()),
                    ).map(([, block]) => block);
                    const orderedQuantity = Number(item.ordered_quantity);
                    const allocatedQuantity = draft.allocations.reduce(
                      (sum, allocation) =>
                        sum + (Number(allocation.quantity) || 0),
                      0,
                    );
                    const deliveryQuantity = Number(draft.quantity) || 0;
                    const allocationTone =
                      allocatedQuantity === deliveryQuantity &&
                      deliveryQuantity > 0
                        ? theme.success
                        : allocatedQuantity > deliveryQuantity
                          ? theme.danger
                          : theme.textSecondary;
                    const deliveredProgress =
                      orderedQuantity > 0
                        ? Math.min(
                            100,
                            (Number(item.delivered_quantity) / orderedQuantity) *
                              100,
                          )
                        : 0;
                    return (
                      <View
                        key={item.transaction_item_id}
                        style={[
                          styles.item,
                          {
                            borderColor: theme.border,
                            backgroundColor: theme.background,
                          },
                        ]}
                      >
                        <View style={styles.itemHeading}>
                          <View style={styles.copy}>
                            <AppText weight="semibold">
                              {productName ??
                                (item.chicken_type
                                  ? labelize(item.chicken_type)
                                  : "Chicken item")}
                            </AppText>
                            <AppText size="small" tone="secondary">
                              {item.chicken_type
                                ? labelize(item.chicken_type)
                                : "Chicken"}
                            </AppText>
                          </View>
                          <View
                            style={[
                              styles.remainingBadge,
                              { backgroundColor: `${theme.secondary}14` },
                            ]}
                          >
                            <AppText
                              size="small"
                              weight="semibold"
                              style={{ color: theme.secondary }}
                            >
                              {Number(item.outstanding_quantity).toLocaleString()}{" "}
                              left
                            </AppText>
                          </View>
                        </View>
                        <View
                          style={[
                            styles.itemProgressTrack,
                            { backgroundColor: theme.border },
                          ]}
                        >
                          <View
                            style={[
                              styles.itemProgressFill,
                              {
                                width: `${deliveredProgress}%`,
                                backgroundColor: theme.success,
                              },
                            ]}
                          />
                        </View>
                        <View style={styles.itemMetrics}>
                          <View style={styles.itemMetric}>
                            <AppText size="small" tone="secondary">
                              Ordered
                            </AppText>
                            <AppText size="small" weight="semibold">
                              {Number(item.ordered_quantity).toLocaleString()}
                            </AppText>
                          </View>
                          <View style={styles.itemMetric}>
                            <AppText size="small" tone="secondary">
                              Delivered
                            </AppText>
                            <AppText
                              size="small"
                              weight="semibold"
                              style={{ color: theme.success }}
                            >
                              {Number(item.delivered_quantity).toLocaleString()}
                            </AppText>
                          </View>
                          <View style={styles.itemMetric}>
                            <AppText size="small" tone="secondary">
                              Remaining
                            </AppText>
                            <AppText
                              size="small"
                              weight="semibold"
                              style={{ color: theme.secondary }}
                            >
                              {Number(item.outstanding_quantity).toLocaleString()}
                            </AppText>
                          </View>
                        </View>
                        <View
                          style={[
                            styles.itemDivider,
                            { backgroundColor: theme.border },
                          ]}
                        />
                        <AppText size="small" weight="semibold">
                          Handed over in this delivery
                        </AppText>
                        <AppText size="small" tone="secondary">
                          Enter up to{" "}
                          {Number(item.outstanding_quantity).toLocaleString()}{" "}
                          birds, then split that amount across the selected stock
                          sources below.
                        </AppText>
                        <TextInput
                          accessibilityLabel="Quantity delivered now"
                          keyboardType="number-pad"
                          editable={itemPairs.length > 0}
                          value={draft.quantity}
                          onChangeText={(value) =>
                            updateDeliveryQuantity(
                              item.transaction_item_id,
                              value,
                            )
                          }
                          placeholder="Chickens handed over"
                          placeholderTextColor={theme.textSecondary}
                          style={[
                            styles.input,
                            {
                              backgroundColor: theme.backgroundElement,
                              color: theme.text,
                              borderColor: formErrors.items[
                                item.transaction_item_id
                              ]
                                ? theme.danger
                                : theme.border,
                            },
                          ]}
                        />
                        <AppText size="small" tone="secondary">
                          Maximum for this item:{" "}
                          {Number(item.outstanding_quantity).toLocaleString()}
                        </AppText>
                        {quantityLimitNotices[item.transaction_item_id] ? (
                          <InlineNotice
                            icon="information-circle-outline"
                            tone="info"
                            message={
                              quantityLimitNotices[item.transaction_item_id]
                            }
                          />
                        ) : null}
                        {formErrors.items[item.transaction_item_id] ? (
                          <FieldError
                            message={
                              formErrors.items[item.transaction_item_id]
                            }
                          />
                        ) : null}
                        <AppText
                          size="small"
                          style={{ color: allocationTone }}
                        >
                          {allocatedQuantity.toLocaleString()} of{" "}
                          {deliveryQuantity.toLocaleString()} chickens assigned
                          to stock sources
                        </AppText>
                        {draft.allocations.map((allocation, index) => (
                          <View
                            key={allocation.id}
                            style={[
                              styles.allocation,
                              {
                                borderColor: formErrors.allocations[
                                  allocation.id
                                ]
                                  ? theme.danger
                                  : theme.border,
                              },
                            ]}
                          >
                            <View style={styles.rowHeading}>
                              <AppText size="small" weight="semibold">
                                Stock source {index + 1}
                              </AppText>
                              {draft.allocations.length > 1 ? (
                                <Pressable accessibilityRole="button" accessibilityLabel={`Remove allocation ${index + 1}`} onPress={() => updateDraft(item.transaction_item_id, (current) => ({ ...current, allocations: current.allocations.filter((candidate) => candidate.id !== allocation.id) }))}>
                                  <Ionicons name="trash-outline" size={18} color={theme.danger} />
                                </Pressable>
                              ) : null}
                            </View>
                            {itemPairs.length === 0 ? (
                              <View
                                style={[
                                  styles.stockUnavailable,
                                  {
                                    borderColor: `${theme.secondary}55`,
                                    backgroundColor: `${theme.secondary}10`,
                                  },
                                ]}
                              >
                                <Ionicons
                                  name="alert-circle-outline"
                                  size={19}
                                  color={theme.secondary}
                                />
                                <View style={styles.copy}>
                                  <AppText size="small" weight="semibold">
                                    No matching stock available yet
                                  </AppText>
                                  <AppText size="small" tone="secondary">
                                    This order stays open. You can deliver other
                                    items now and return when matching chickens
                                    are in stock.
                                  </AppText>
                                </View>
                              </View>
                            ) : (
                              <>
                                <View style={styles.selectionSection}>
                                  <View style={styles.selectionHeading}>
                                    <AppText size="small" weight="semibold">
                                      1. Choose a block
                                    </AppText>
                                    <AppText size="small" tone="secondary">
                                      {itemBlocks.length} available
                                    </AppText>
                                  </View>
                                  <View style={styles.blockChoices}>
                                    {itemBlocks.map((block) => {
                                      const selected =
                                        allocation.blockId === block.id;
                                      return (
                                        <Pressable
                                          key={block.id}
                                          accessibilityRole="button"
                                          accessibilityState={{ selected }}
                                          onPress={() =>
                                            updateAllocation(
                                              item.transaction_item_id,
                                              allocation.id,
                                              {
                                                blockId: block.id,
                                                batchId: "",
                                              },
                                            )
                                          }
                                          style={({ pressed }) => [
                                            styles.blockChoice,
                                            {
                                              borderColor: selected
                                                ? theme.primary
                                                : theme.border,
                                              backgroundColor: selected
                                                ? `${theme.primary}0D`
                                                : theme.background,
                                              opacity: pressed ? 0.8 : 1,
                                            },
                                          ]}
                                        >
                                          <View
                                            style={[
                                              styles.blockChoiceIcon,
                                              {
                                                backgroundColor: selected
                                                  ? `${theme.primary}18`
                                                  : theme.backgroundElement,
                                              },
                                            ]}
                                          >
                                            <Ionicons
                                              name="home-outline"
                                              size={18}
                                              color={
                                                selected
                                                  ? theme.primary
                                                  : theme.textSecondary
                                              }
                                            />
                                          </View>
                                          <View style={styles.copy}>
                                            <AppText
                                              size="small"
                                              weight="semibold"
                                              numberOfLines={1}
                                            >
                                              {block.name}
                                            </AppText>
                                            <AppText size="small" tone="secondary">
                                              {block.quantity.toLocaleString()}{" "}
                                              birds available
                                            </AppText>
                                          </View>
                                          {selected ? (
                                            <Ionicons
                                              name="checkmark-circle"
                                              size={19}
                                              color={theme.primary}
                                            />
                                          ) : null}
                                        </Pressable>
                                      );
                                    })}
                                  </View>
                                </View>

                                {allocation.blockId ? (
                                  <View style={styles.selectionSection}>
                                    <View style={styles.selectionHeading}>
                                      <AppText size="small" weight="semibold">
                                        2. Choose a batch
                                      </AppText>
                                      <AppText size="small" tone="secondary">
                                        Current age
                                      </AppText>
                                    </View>
                                    <View style={styles.batchChoices}>
                                      {itemPairs
                                        .filter(
                                          (pair) =>
                                            pair.blockId === allocation.blockId,
                                        )
                                        .map((pair) => {
                                          const stockAvailable = remainingStock(
                                            pair,
                                            allocation,
                                          );
                                          const selected =
                                            allocation.batchId === pair.batchId;
                                          return (
                                            <Pressable
                                              key={pair.batchId}
                                              accessibilityRole="button"
                                              accessibilityState={{ selected }}
                                              disabled={
                                                !selected && stockAvailable <= 0
                                              }
                                              onPress={() =>
                                                updateAllocation(
                                                  item.transaction_item_id,
                                                  allocation.id,
                                                  {
                                                    batchId: pair.batchId,
                                                    quantity:
                                                      draft.allocations.length === 1
                                                        ? draft.quantity
                                                        : allocation.quantity,
                                                  },
                                                )
                                              }
                                              style={({ pressed }) => [
                                                styles.batchChoice,
                                                {
                                                  borderColor: selected
                                                    ? theme.primary
                                                    : theme.border,
                                                  backgroundColor: selected
                                                    ? `${theme.primary}0D`
                                                    : theme.background,
                                                  opacity:
                                                    !selected && stockAvailable <= 0
                                                      ? 0.45
                                                      : pressed
                                                        ? 0.8
                                                        : 1,
                                                },
                                              ]}
                                            >
                                              <View style={styles.batchChoiceTop}>
                                                <View style={styles.copy}>
                                                  <AppText
                                                    size="small"
                                                    weight="semibold"
                                                    numberOfLines={1}
                                                  >
                                                    {pair.batchName}
                                                  </AppText>
                                                  <AppText size="small" tone="secondary">
                                                    {labelize(pair.chickenType)}
                                                  </AppText>
                                                </View>
                                                {selected ? (
                                                  <Ionicons
                                                    name="checkmark-circle"
                                                    size={20}
                                                    color={theme.primary}
                                                  />
                                                ) : (
                                                  <Ionicons
                                                    name="ellipse-outline"
                                                    size={20}
                                                    color={theme.border}
                                                  />
                                                )}
                                              </View>
                                              <View
                                                style={[
                                                  styles.batchMeta,
                                                  { borderTopColor: theme.border },
                                                ]}
                                              >
                                                <View style={styles.batchMetaItem}>
                                                  <Ionicons
                                                    name="time-outline"
                                                    size={15}
                                                    color={theme.secondary}
                                                  />
                                                  <AppText
                                                    size="small"
                                                    weight="semibold"
                                                    style={{ color: theme.secondary }}
                                                  >
                                                    {formatBatchAge(pair.hatchDate)}
                                                  </AppText>
                                                </View>
                                                <AppText
                                                  size="small"
                                                  tone="secondary"
                                                >
                                                  {stockAvailable.toLocaleString()}{" "}
                                                  available
                                                </AppText>
                                              </View>
                                            </Pressable>
                                          );
                                        })}
                                    </View>
                                  </View>
                                ) : (
                                  <AppText size="small" tone="secondary">
                                    Select a block to see its available batches
                                    and their current age.
                                  </AppText>
                                )}
                              </>
                            )}
                            {formErrors.allocations[allocation.id] ? (
                              <FieldError
                                message={
                                  formErrors.allocations[allocation.id]
                                }
                              />
                            ) : null}
                            <View style={styles.quantityField}>
                              <AppText size="small" weight="semibold">
                                Birds from this batch
                              </AppText>
                              <TextInput
                                accessibilityLabel={`Allocation ${index + 1} quantity`}
                                keyboardType="number-pad"
                                editable={
                                  itemPairs.length > 0 &&
                                  Boolean(allocation.batchId)
                                }
                                value={allocation.quantity}
                                onChangeText={(value) =>
                                  updateAllocation(
                                    item.transaction_item_id,
                                    allocation.id,
                                    { quantity: value },
                                  )
                                }
                                placeholder={
                                  allocation.batchId
                                    ? "Quantity from selected batch"
                                    : "Select a batch first"
                                }
                                placeholderTextColor={theme.textSecondary}
                                style={[
                                  styles.input,
                                  {
                                    backgroundColor: theme.background,
                                    color: theme.text,
                                    borderColor: theme.border,
                                    opacity: allocation.batchId ? 1 : 0.65,
                                  },
                                ]}
                              />
                            </View>
                          </View>
                        ))}
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            addAllocation(item.transaction_item_id)
                          }
                          style={({ pressed }) => [
                            styles.addSourceButton,
                            {
                              borderColor: theme.border,
                              backgroundColor: theme.backgroundElement,
                              opacity: pressed ? 0.75 : 1,
                            },
                          ]}
                        >
                          <Ionicons
                            name="add-circle-outline"
                            size={19}
                            color={theme.primary}
                          />
                          <AppText
                            size="small"
                            weight="semibold"
                            style={{ color: theme.primary }}
                          >
                            Add another stock source
                          </AppText>
                        </Pressable>
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
                {submitError ? (
                  <Card
                    accessibilityRole="alert"
                    style={[
                      styles.submitError,
                      {
                        borderColor: `${theme.danger}55`,
                        backgroundColor: `${theme.danger}08`,
                      },
                    ]}
                  >
                    <View style={styles.errorHeading}>
                      <View
                        style={[
                          styles.errorIcon,
                          { backgroundColor: `${theme.danger}14` },
                        ]}
                      >
                        <Ionicons
                          name="alert-circle-outline"
                          size={20}
                          color={theme.danger}
                        />
                      </View>
                      <View style={styles.copy}>
                        <AppText
                          weight="semibold"
                          style={{ color: theme.danger }}
                        >
                          {submitError.title}
                        </AppText>
                        <AppText size="small" tone="secondary">
                          {submitError.message}
                        </AppText>
                        {submitError.requestId ? (
                          <AppText size="small" tone="secondary">
                            Support reference: {submitError.requestId}
                          </AppText>
                        ) : null}
                      </View>
                    </View>
                    {submitError.canRefresh ? (
                      <Button
                        label={
                          isRefreshing
                            ? "Refreshing stock…"
                            : "Refresh order and stock"
                        }
                        variant="secondary"
                        loading={isRefreshing}
                        disabled={isRefreshing}
                        onPress={() => void refreshLatestDeliveryData()}
                      />
                    ) : null}
                  </Card>
                ) : null}
                <Button
                  label={
                    plannedDeliveryCount > 0
                      ? `Save delivery · ${plannedDeliveryCount.toLocaleString()} ${
                          plannedDeliveryCount === 1 ? "chicken" : "chickens"
                        }`
                      : "Review delivery details"
                  }
                  loading={createDelivery.isPending}
                  disabled={createDelivery.isPending}
                  onPress={() => void submit()}
                />
              </>
            )}
          </>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function FieldError({ message }: { message: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.fieldError} accessibilityRole="alert">
      <Ionicons
        name="alert-circle-outline"
        size={15}
        color={theme.danger}
      />
      <AppText
        size="small"
        style={[styles.fieldErrorText, { color: theme.danger }]}
      >
        {message}
      </AppText>
    </View>
  );
}

function InlineNotice({
  icon,
  tone,
  message,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  tone: "error" | "info";
  message: string;
}) {
  const { theme } = useTheme();
  const color = tone === "error" ? theme.danger : theme.primary;
  return (
    <View
      accessibilityRole={tone === "error" ? "alert" : "summary"}
      style={[
        styles.inlineNotice,
        {
          borderColor: `${color}40`,
          backgroundColor: `${color}0B`,
        },
      ]}
    >
      <Ionicons name={icon} size={18} color={color} />
      <AppText
        size="small"
        style={{ color, flex: 1 }}
      >
        {message}
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
    padding: 18,
    paddingBottom: 36,
    gap: 14,
  },
  state: { gap: 10, alignItems: "flex-start" },
  stateIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  centered: { textAlign: "center" },
  intro: { gap: 14, padding: 16 },
  introHeading: { flexDirection: "row", alignItems: "center", gap: 11 },
  introIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  orderSummary: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  orderMetric: { flex: 1, gap: 3 },
  orderMetricDivider: { width: StyleSheet.hairlineWidth, height: 42, marginHorizontal: 13 },
  formCard: { gap: 14 },
  inlineNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderWidth: 1,
    borderRadius: 11,
    padding: 11,
  },
  formHeading: { flexDirection: "row", alignItems: "center" },
  item: { gap: 11, borderWidth: 1, borderRadius: 14, padding: 13 },
  itemHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  remainingBadge: { maxWidth: "40%", borderRadius: 14, paddingHorizontal: 9, paddingVertical: 6 },
  itemProgressTrack: { height: 5, borderRadius: 3, overflow: "hidden" },
  itemProgressFill: { height: "100%", borderRadius: 3 },
  itemMetrics: { flexDirection: "row", gap: 8 },
  itemMetric: { flex: 1, gap: 3 },
  itemDivider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  fieldError: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: -3,
  },
  fieldErrorText: { flex: 1 },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10 },
  quantityField: { gap: 7 },
  notes: { minHeight: 80, textAlignVertical: "top" },
  allocation: { gap: 12, borderWidth: 1, borderRadius: 12, padding: 12 },
  rowHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addSourceButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  selectionSection: { gap: 9 },
  selectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  blockChoices: { gap: 7 },
  blockChoice: {
    minHeight: 59,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 11,
    padding: 10,
  },
  blockChoiceIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  batchChoices: { gap: 8 },
  batchChoice: { gap: 9, borderWidth: 1, borderRadius: 11, padding: 11 },
  batchChoiceTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  batchMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  batchMetaItem: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 },
  stockUnavailable: { flexDirection: "row", alignItems: "flex-start", gap: 9, borderWidth: 1, borderRadius: 10, padding: 11 },
  submitError: { gap: 12, borderWidth: 1 },
  errorHeading: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  errorIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
});
