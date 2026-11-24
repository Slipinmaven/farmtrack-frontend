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
import Animated, { FadeInDown } from "react-native-reanimated";

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
import { formatChickenCount } from "@/features/chickens/format";
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

type ValidatedDeliveryItem = {
  transaction_item_id: string;
  quantity_delivered: number;
  batch_allocations: {
    batch_id: string;
    block_id: string;
    quantity: number;
  }[];
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
  if (!hatchDate) return "Age not recorded";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hatchDate);
  if (!match) return "Age not recorded";
  const hatch = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (
    hatch.getUTCFullYear() !== Number(match[1]) ||
    hatch.getUTCMonth() !== Number(match[2]) - 1 ||
    hatch.getUTCDate() !== Number(match[3])
  ) {
    return "Age not recorded";
  }

  const today = new Date();
  const current = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );
  if (hatch > current) return "Age unavailable";

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
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewItems, setReviewItems] = useState<ValidatedDeliveryItem[]>([]);
  const [changingBlockAllocation, setChangingBlockAllocation] = useState<
    string | null
  >(null);
  const [changingBatchAllocation, setChangingBatchAllocation] = useState<
    string | null
  >(null);
  const [expandedAllocationId, setExpandedAllocationId] = useState<
    string | null
  >(null);
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

  const reviewBlockReason = (() => {
    if (!isValidCalendarDate(deliveredDate) || deliveredDate > localDateString()) {
      return "Choose a valid handover date";
    }
    if (!drafts.some((draft) => draft.quantity.trim())) {
      return "Enter the quantity handed over";
    }
    const stockTotals = new Map<string, number>();
    let hasValidQuantity = false;
    for (const draft of drafts) {
      const sourceHasInput = draft.allocations.some(
        (allocation) =>
          allocation.blockId ||
          allocation.batchId ||
          allocation.quantity.trim(),
      );
      if (!draft.quantity.trim()) {
        if (sourceHasInput) return "Complete or remove the unfinished source";
        continue;
      }
      const quantity = Number(draft.quantity);
      const outstanding = Number(
        fulfillment.data?.items.find(
          (item) => item.transaction_item_id === draft.transactionItemId,
        )?.outstanding_quantity ?? 0,
      );
      if (
        !/^\d+$/.test(draft.quantity.trim()) ||
        !Number.isInteger(quantity) ||
        quantity <= 0 ||
        quantity > outstanding
      ) {
        return "Enter a valid delivery quantity";
      }
      const allocations = draft.allocations;
      if (
        allocations.length === 0 ||
        allocations.some(
          (allocation) =>
            !allocation.blockId ||
            !allocation.batchId ||
            !/^\d+$/.test(allocation.quantity.trim()) ||
            Number(allocation.quantity) <= 0,
        )
      ) {
        return "Choose a block and batch for each source";
      }
      const allocated = allocations.reduce(
        (sum, allocation) => sum + Number(allocation.quantity),
        0,
      );
      if (allocated !== quantity) return "Assign all birds to their sources";
      hasValidQuantity = true;
      const sourceKeys = new Set<string>();
      for (const allocation of allocations) {
        const key = `${allocation.batchId}:${allocation.blockId}`;
        if (sourceKeys.has(key)) return "Choose a different source for each split";
        sourceKeys.add(key);
        const pair = availablePairs.find(
          (candidate) =>
            candidate.batchId === allocation.batchId &&
            candidate.blockId === allocation.blockId,
        );
        if (!pair) return "Refresh stock and choose an available batch";
        const nextTotal =
          (stockTotals.get(key) ?? 0) + Number(allocation.quantity);
        stockTotals.set(key, nextTotal);
        if (nextTotal > pair.quantity) {
          return "A source has more birds assigned than are available";
        }
      }
    }
    if (!hasValidQuantity) return "Enter a delivery quantity";
    return null;
  })();
  const canReviewDelivery = reviewBlockReason === null;
  const orderCustomer = saleDetails.data?.customer_name ?? "Customer";
  const orderReference = saleDetails.data?.transaction.reference_number;

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
    setIsReviewing(false);
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
        [transactionItemId]: `This order has ${formatChickenCount(outstanding)} left to deliver. The quantity was limited to ${outstanding.toLocaleString()}.`,
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

  async function confirmDelivery() {
    if (createDelivery.isPending || reviewItems.length === 0) return;
    try {
      const delivery = await createDelivery.mutateAsync({
        transactionId: saleId,
        payload: {
          delivered_date: deliveredDate,
          notes: notes.trim() || undefined,
          items: reviewItems,
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
      setIsReviewing(false);
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
          `This is more than the ${formatChickenCount(outstanding)} still outstanding.`;
        continue;
      }

      const allocations = [];
      let itemHasAllocationError = false;
      for (const allocation of draft.allocations) {
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
              `Only ${formatChickenCount(pair.quantity, "bird")} ${pair.quantity === 1 ? "is" : "are"} available in this batch and block across this delivery.`;
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
    setReviewItems(items);
    setIsReviewing(true);
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
  const showStickyFooter = Boolean(
    fulfillment.data &&
      options.data &&
      !fulfillment.data.fully_resolved &&
      !isLoading &&
      !loadError &&
      !isReviewing,
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: showStickyFooter ? 112 : 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets
      >
        <FarmPageHeader
          title="Record delivery"
          showBack
          compact
          showNotifications={false}
        />
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
                <Card style={styles.orderCard}>
                  <View style={styles.orderIdentity}>
                    <View style={styles.copy}>
                      <AppText weight="semibold">{orderCustomer}</AppText>
                      <AppText size="small" tone="secondary">
                        {orderReference
                          ? `Sale ${orderReference}`
                          : "Chicken sale"}
                      </AppText>
                    </View>
                    <Ionicons
                      name="receipt-outline"
                      size={19}
                      color={theme.textSecondary}
                    />
                  </View>
                  <View
                    style={[
                      styles.orderSummary,
                      { backgroundColor: theme.background },
                    ]}
                  >
                    <View style={styles.orderMetric}>
                      <AppText size="small" tone="secondary">
                        Still owed
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
                        Handed over now
                      </AppText>
                      <AppText size="title" weight="semibold">
                        {plannedDeliveryCount.toLocaleString()}
                      </AppText>
                    </View>
                  </View>
                </Card>
                <Card style={[styles.formCard, isReviewing && styles.hidden]}>
                  <View style={styles.formHeading}>
                    <View style={styles.copy}>
                      <AppText weight="semibold">Record this handover</AppText>
                      <AppText size="small" tone="secondary">
                        Enter today’s quantity, then assign its stock source.
                      </AppText>
                    </View>
                  </View>
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
                    const allocatedQuantity = draft.allocations.reduce(
                      (sum, allocation) =>
                        sum + (Number(allocation.quantity) || 0),
                      0,
                    );
                    const deliveryQuantity = Number(draft.quantity) || 0;
                    const excessSourceQuantity = draft.allocations.reduce(
                      (sum, allocation) => {
                        const pair = availablePairs.find(
                          (candidate) =>
                            candidate.batchId === allocation.batchId &&
                            candidate.blockId === allocation.blockId,
                        );
                        if (!pair) return sum;
                        const allocationQuantity =
                          Number(allocation.quantity) || 0;
                        return (
                          sum +
                          Math.max(
                            0,
                            allocationQuantity -
                              remainingStock(pair, allocation),
                          )
                        );
                      },
                      0,
                    );
                    const allSourcesComplete = draft.allocations.every(
                      (allocation) =>
                        Boolean(allocation.blockId && allocation.batchId) &&
                        /^\d+$/.test(allocation.quantity.trim()) &&
                        Number(allocation.quantity) > 0 &&
                        (() => {
                          const pair = availablePairs.find(
                            (candidate) =>
                              candidate.blockId === allocation.blockId &&
                              candidate.batchId === allocation.batchId,
                          );
                          return (
                            pair !== undefined &&
                            Number(allocation.quantity) <=
                              remainingStock(pair, allocation)
                          );
                        })(),
                    );
                    const allocationTone =
                      excessSourceQuantity > 0
                        ? theme.danger
                        : allocatedQuantity === deliveryQuantity &&
                            deliveryQuantity > 0 &&
                            allSourcesComplete
                          ? theme.success
                          : allocatedQuantity > deliveryQuantity
                            ? theme.danger
                            : theme.textSecondary;
                    return (
                      <Animated.View
                        entering={FadeInDown.duration(240)}
                        key={item.transaction_item_id}
                        style={styles.item}
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
                        </View>
                        <View
                          style={[
                            styles.itemDivider,
                            { backgroundColor: theme.border },
                          ]}
                        />
                        <AppText size="small" weight="semibold">
                          How many birds were handed over?
                        </AppText>
                        <AppText size="small" tone="secondary">
                          Up to {Number(item.outstanding_quantity).toLocaleString()}{" "}
                          still owed
                        </AppText>
                        <TextInput
                          accessibilityLabel="Quantity delivered now"
                          keyboardType="number-pad"
                          editable
                          value={draft.quantity}
                          onChangeText={(value) =>
                            updateDeliveryQuantity(
                              item.transaction_item_id,
                              value,
                            )
                          }
                          placeholder="Enter number of birds"
                          placeholderTextColor={theme.textSecondary}
                          style={[
                            styles.input,
                            styles.quantityInput,
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
                        {deliveryQuantity > 0 ? (
                          <>
                        <View
                          style={[
                            styles.assignmentSummary,
                            { backgroundColor: theme.backgroundElement },
                          ]}
                        >
                          <View style={styles.assignmentHeading}>
                            <AppText size="small" weight="semibold">
                              Stock assignment
                            </AppText>
                            <AppText
                              size="small"
                              weight="semibold"
                              style={{ color: allocationTone }}
                            >
                              {deliveryQuantity === 0
                                ? "Not started"
                                : `${allocatedQuantity.toLocaleString()} / ${deliveryQuantity.toLocaleString()}`}
                            </AppText>
                          </View>
                          <View
                            style={[
                              styles.assignmentTrack,
                              { backgroundColor: theme.border },
                            ]}
                          >
                            <View
                              style={[
                                styles.assignmentFill,
                                {
                                  width: `${
                                    deliveryQuantity > 0
                                      ? Math.min(
                                          100,
                                          (allocatedQuantity / deliveryQuantity) *
                                            100,
                                        )
                                      : 0
                                  }%`,
                                  backgroundColor: allocationTone,
                                },
                              ]}
                            />
                          </View>
                          <AppText size="small" tone="secondary">
                            {excessSourceQuantity > 0
                              ? `${formatChickenCount(excessSourceQuantity, "bird")} exceeds stock available in the selected source${excessSourceQuantity === 1 ? "" : "s"}.`
                              : deliveryQuantity === 0
                              ? "Enter the handover quantity, then assign it to a batch."
                              : allocatedQuantity === deliveryQuantity &&
                                  !allSourcesComplete
                                ? "Finish each source’s block, batch, and quantity."
                                : allocatedQuantity === deliveryQuantity
                                ? "All birds assigned."
                                : allocatedQuantity > deliveryQuantity
                                  ? `${(allocatedQuantity - deliveryQuantity).toLocaleString()} too many assigned.`
                                  : `${(deliveryQuantity - allocatedQuantity).toLocaleString()} ${deliveryQuantity - allocatedQuantity === 1 ? "bird" : "birds"} left to assign.`}
                          </AppText>
                        </View>
                        {draft.allocations.map((allocation, index) => {
                          const selectedBlock = itemBlocks.find(
                            (block) => block.id === allocation.blockId,
                          );
                          const blockBatches = itemPairs.filter(
                            (pair) => pair.blockId === allocation.blockId,
                          );
                          const selectedBatch = blockBatches.find(
                            (pair) => pair.batchId === allocation.batchId,
                          );
                          const sourceIsComplete = Boolean(
                            selectedBlock &&
                              selectedBatch &&
                              /^\d+$/.test(allocation.quantity.trim()) &&
                              Number(allocation.quantity) > 0,
                          );
                          const isExpanded =
                            expandedAllocationId === allocation.id;
                          const showBlockChoices =
                            !selectedBlock ||
                            changingBlockAllocation === allocation.id;
                          const showBatchChoices =
                            !selectedBatch ||
                            changingBatchAllocation === allocation.id;
                          return (
                          <Animated.View
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
                                Source {index + 1}
                              </AppText>
                              <View style={styles.sourceActions}>
                                {sourceIsComplete ? (
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`${isExpanded ? "Finish editing" : "Edit"} source ${index + 1}`}
                                    onPress={() => {
                                      setExpandedAllocationId(
                                        isExpanded ? null : allocation.id,
                                      );
                                      if (isExpanded) {
                                        setChangingBlockAllocation(null);
                                        setChangingBatchAllocation(null);
                                      }
                                    }}
                                    hitSlop={8}
                                  >
                                    <AppText
                                      size="small"
                                      weight="semibold"
                                      style={{ color: theme.primary }}
                                    >
                                      {isExpanded ? "Done" : "Edit"}
                                    </AppText>
                                  </Pressable>
                                ) : null}
                                {draft.allocations.length > 1 ? (
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`Remove source ${index + 1}`}
                                    onPress={() => {
                                      updateDraft(item.transaction_item_id, (current) => ({
                                        ...current,
                                        allocations: current.allocations.filter(
                                          (candidate) => candidate.id !== allocation.id,
                                        ),
                                      }));
                                      if (expandedAllocationId === allocation.id) {
                                        setExpandedAllocationId(null);
                                        setChangingBlockAllocation(null);
                                        setChangingBatchAllocation(null);
                                      }
                                    }}
                                    style={styles.removeSourceButton}
                                  >
                                    <Ionicons
                                      name="trash-outline"
                                      size={16}
                                      color={theme.danger}
                                    />
                                    <AppText
                                      size="small"
                                      weight="semibold"
                                      style={{ color: theme.danger }}
                                    >
                                      Remove
                                    </AppText>
                                  </Pressable>
                                ) : null}
                              </View>
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
                            ) : sourceIsComplete && !isExpanded ? (
                              <View
                                style={[
                                  styles.compactSource,
                                  { backgroundColor: theme.backgroundElement },
                                ]}
                              >
                                <Ionicons
                                  name="layers-outline"
                                  size={18}
                                  color={theme.primary}
                                />
                                <View style={styles.copy}>
                                  <AppText size="small" weight="semibold">
                                    {selectedBlock?.name} · {selectedBatch?.batchName}
                                  </AppText>
                                  <AppText size="small" tone="secondary">
                                    {formatChickenCount(
                                      Number(allocation.quantity),
                                      "bird",
                                    )}{" "}
                                    assigned · {formatBatchAge(selectedBatch?.hatchDate ?? null)} ·{" "}
                                    {formatChickenCount(selectedBatch?.quantity ?? 0, "bird")}{" "}
                                    total in batch
                                  </AppText>
                                </View>
                              </View>
                            ) : (
                              <>
                                <View style={styles.selectionSection}>
                                  <View style={styles.selectionHeading}>
                                    <AppText size="small" weight="semibold">
                                      Choose a block
                                    </AppText>
                                    <AppText size="small" tone="secondary">
                                      {itemBlocks.length}{" "}
                                      {itemBlocks.length === 1 ? "block" : "blocks"}
                                    </AppText>
                                  </View>
                                  {selectedBlock && !showBlockChoices ? (
                                    <View
                                      style={[
                                        styles.selectedBlock,
                                        {
                                          borderColor: `${theme.primary}70`,
                                          backgroundColor: `${theme.primary}0D`,
                                        },
                                      ]}
                                    >
                                      <Ionicons
                                        name="home-outline"
                                        size={18}
                                        color={theme.primary}
                                      />
                                      <View style={styles.copy}>
                                        <AppText size="small" weight="semibold">
                                          {selectedBlock.name}
                                        </AppText>
                                        <AppText size="small" tone="secondary">
                                          {formatChickenCount(
                                            selectedBlock.quantity,
                                            "bird",
                                          )}{" "}
                                          total across matching batches
                                        </AppText>
                                      </View>
                                      <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={`Change block for source ${index + 1}`}
                                        onPress={() =>
                                          setChangingBlockAllocation(allocation.id)
                                        }
                                        hitSlop={8}
                                      >
                                        <AppText
                                          size="small"
                                          weight="semibold"
                                          style={{ color: theme.primary }}
                                        >
                                          Change
                                        </AppText>
                                      </Pressable>
                                    </View>
                                  ) : null}
                                  {showBlockChoices ? (
                                  <Animated.View
                                    entering={FadeInDown.duration(180)}
                                    style={styles.blockChoices}
                                  >
                                    {itemBlocks.map((block) => {
                                      const selected =
                                        allocation.blockId === block.id;
                                      return (
                                        <Pressable
                                          key={block.id}
                                          accessibilityRole="button"
                                          accessibilityState={{ selected }}
                                          onPress={() => {
                                            updateAllocation(
                                              item.transaction_item_id,
                                              allocation.id,
                                              {
                                                blockId: block.id,
                                                batchId: "",
                                              },
                                            );
                                            setChangingBlockAllocation(null);
                                          }}
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
                                            >
                                              {block.name}
                                            </AppText>
                                            <AppText size="small" tone="secondary">
                                              {formatChickenCount(
                                                block.quantity,
                                                "bird",
                                              )}{" "}
                                              across matching batches in this block
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
                                  </Animated.View>
                                  ) : null}
                                </View>

                                {allocation.blockId ? (
                                  <View style={styles.selectionSection}>
                                    <View style={styles.selectionHeading}>
                                      <AppText size="small" weight="semibold">
                                        Choose a batch
                                      </AppText>
                                      <AppText size="small" tone="secondary">
                                        {blockBatches.length}{" "}
                                        {blockBatches.length === 1 ? "batch" : "batches"}
                                      </AppText>
                                    </View>
                                    {selectedBatch && !showBatchChoices ? (
                                      <View
                                        style={[
                                          styles.selectedBlock,
                                          {
                                            borderColor: `${theme.primary}70`,
                                            backgroundColor: `${theme.primary}0D`,
                                          },
                                        ]}
                                      >
                                        <Ionicons
                                          name="layers-outline"
                                          size={18}
                                          color={theme.primary}
                                        />
                                        <View style={styles.copy}>
                                          <AppText size="small" weight="semibold">
                                            {selectedBatch.batchName}
                                          </AppText>
                                          <AppText size="small" tone="secondary">
                                            {formatBatchAge(selectedBatch.hatchDate)} ·{" "}
                                            {formatChickenCount(
                                              remainingStock(selectedBatch, allocation),
                                              "bird",
                                            )}{" "}
                                            assignable from this source
                                          </AppText>
                                        </View>
                                        <Pressable
                                          accessibilityRole="button"
                                          accessibilityLabel={`Change batch for source ${index + 1}`}
                                          onPress={() =>
                                            setChangingBatchAllocation(allocation.id)
                                          }
                                          hitSlop={8}
                                        >
                                          <AppText
                                            size="small"
                                            weight="semibold"
                                            style={{ color: theme.primary }}
                                          >
                                            Change
                                          </AppText>
                                        </Pressable>
                                      </View>
                                    ) : null}
                                    {showBatchChoices ? (
                                    <Animated.View
                                      entering={FadeInDown.duration(180)}
                                      style={styles.batchChoices}
                                    >
                                      {blockBatches.map((pair) => {
                                          const stockAvailable = remainingStock(
                                            pair,
                                            allocation,
                                          );
                                          const assignedToOtherSources =
                                            draft.allocations.reduce(
                                              (sum, candidate) =>
                                                candidate.id !== allocation.id
                                                  ? sum +
                                                    (Number(candidate.quantity) ||
                                                      0)
                                                  : sum,
                                              0,
                                            );
                                          const unassignedDeliveryQuantity =
                                            Math.max(
                                              0,
                                              deliveryQuantity -
                                                assignedToOtherSources,
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
                                              onPress={() => {
                                                updateAllocation(
                                                  item.transaction_item_id,
                                                  allocation.id,
                                                  {
                                                    batchId: pair.batchId,
                                                    quantity:
                                                      deliveryQuantity > 0
                                                        ? String(
                                                            Math.min(
                                                              unassignedDeliveryQuantity,
                                                                Math.max(
                                                                  0,
                                                                  stockAvailable,
                                                                ),
                                                              ),
                                                            )
                                                        : "",
                                                  },
                                                );
                                                setChangingBatchAllocation(null);
                                              }}
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
                                                  {formatChickenCount(
                                                    stockAvailable,
                                                    "bird",
                                                  )}{" "}
                                                  available to assign
                                                </AppText>
                                              </View>
                                            </Pressable>
                                          );
                                        })}
                                    </Animated.View>
                                    ) : null}
                                  </View>
                                ) : null}
                              </>
                            )}
                            {formErrors.allocations[allocation.id] ? (
                              <FieldError
                                message={
                                  formErrors.allocations[allocation.id]
                                }
                              />
                            ) : null}
                            {allocation.batchId &&
                            (!sourceIsComplete || isExpanded) ? (
                            <View style={styles.quantityField}>
                              <AppText size="small" weight="semibold">
                                How many from this batch?
                              </AppText>
                              <TextInput
                                accessibilityLabel={`Source ${index + 1} quantity`}
                                keyboardType="number-pad"
                                value={allocation.quantity}
                                onChangeText={(value) =>
                                  updateAllocation(
                                    item.transaction_item_id,
                                    allocation.id,
                                    { quantity: value },
                                  )
                                }
                                placeholder="Number of birds"
                                placeholderTextColor={theme.textSecondary}
                                style={[
                                  styles.input,
                                  styles.sourceQuantityInput,
                                  {
                                    backgroundColor: theme.background,
                                    color: theme.text,
                                    borderColor: theme.border,
                                  },
                                ]}
                              />
                            </View>
                            ) : null}
                          </Animated.View>
                        );
                        })}
                        {deliveryQuantity > 0 &&
                        draft.allocations.every(
                          (allocation) =>
                            allocation.blockId &&
                            allocation.batchId &&
                            Number(allocation.quantity) > 0,
                        ) ? (
                          <>
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
                                Split across another source
                              </AppText>
                            </Pressable>
                            <AppText
                              size="small"
                              tone="secondary"
                              style={styles.splitHint}
                            >
                              Use this if today’s birds came from another block or batch.
                            </AppText>
                          </>
                        ) : null}
                          </>
                        ) : null}
                      </Animated.View>
                    );
                  })}
                  <DatePickerField
                    label="Date handed over"
                    value={deliveredDate}
                    maximumDate={new Date()}
                    onChange={(date) => {
                      setDeliveredDate(date);
                      setIsReviewing(false);
                      setFormErrors((current) => ({
                        ...current,
                        date: undefined,
                        general: undefined,
                      }));
                      setSubmitError(null);
                    }}
                  />
                  <TextInput
                    accessibilityLabel="Delivery notes"
                    value={notes}
                    onChangeText={(value) => {
                      setNotes(value);
                      setIsReviewing(false);
                    }}
                    placeholder="Notes (optional)"
                    placeholderTextColor={theme.textSecondary}
                    multiline
                    style={[styles.input, styles.notes, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                  />
                </Card>
                {isReviewing ? (
                  <Animated.View entering={FadeInDown.duration(220)}>
                    <Card style={styles.reviewCard}>
                      <View style={styles.reviewHeading}>
                        <View
                          style={[
                            styles.reviewIcon,
                            { backgroundColor: `${theme.success}18` },
                          ]}
                        >
                          <Ionicons
                            name="checkmark"
                            size={20}
                            color={theme.success}
                          />
                        </View>
                        <View style={styles.copy}>
                          <AppText weight="semibold">Review this delivery</AppText>
                          <AppText size="small" tone="secondary">
                            Check the quantities and stock sources before recording.
                          </AppText>
                        </View>
                      </View>
                      <View
                        style={[
                          styles.reviewTotal,
                          { backgroundColor: theme.background },
                        ]}
                      >
                        <AppText size="small" tone="secondary">
                          Handed over on {deliveredDate}
                        </AppText>
                        <AppText
                          size="title"
                          weight="semibold"
                          style={{ color: theme.primary }}
                        >
                          {plannedDeliveryCount.toLocaleString()}{" "}
                          {plannedDeliveryCount === 1 ? "bird" : "birds"}
                        </AppText>
                      </View>
                      {reviewItems.map((reviewItem) => {
                        const fulfillmentItem = fulfillment.data?.items.find(
                          (candidate) =>
                            candidate.transaction_item_id ===
                            reviewItem.transaction_item_id,
                        );
                        const productName = saleDetails.data?.transaction.items.find(
                          (candidate) =>
                            candidate.id === reviewItem.transaction_item_id,
                        )?.product_name;
                        return (
                          <View
                            key={reviewItem.transaction_item_id}
                            style={[
                              styles.reviewItem,
                              { borderColor: theme.border },
                            ]}
                          >
                            <View style={styles.reviewItemHeading}>
                              <AppText weight="semibold">
                                {productName ??
                                  (fulfillmentItem?.chicken_type
                                    ? labelize(fulfillmentItem.chicken_type)
                                    : "Chickens")}
                              </AppText>
                              <AppText weight="semibold">
                                {reviewItem.quantity_delivered.toLocaleString()}
                              </AppText>
                            </View>
                            {reviewItem.batch_allocations.map((allocation) => {
                              const pair = availablePairs.find(
                                (candidate) =>
                                  candidate.batchId === allocation.batch_id &&
                                  candidate.blockId === allocation.block_id,
                              );
                              return (
                                <View
                                  key={`${allocation.batch_id}:${allocation.block_id}`}
                                  style={styles.reviewSource}
                                >
                                  <Ionicons
                                    name="home-outline"
                                    size={15}
                                    color={theme.textSecondary}
                                  />
                                  <AppText
                                    size="small"
                                    tone="secondary"
                                    style={styles.reviewSourceText}
                                  >
                                    {pair
                                      ? `${pair.blockName} · ${pair.batchName}`
                                      : "Selected stock source"}
                                  </AppText>
                                  <AppText size="small" weight="semibold">
                                    {allocation.quantity.toLocaleString()}
                                  </AppText>
                                </View>
                              );
                            })}
                          </View>
                        );
                      })}
                      {notes.trim() ? (
                        <View style={styles.reviewNotes}>
                          <AppText size="small" weight="semibold">
                            Note
                          </AppText>
                          <AppText size="small" tone="secondary">
                            {notes.trim()}
                          </AppText>
                        </View>
                      ) : null}
                      <Button
                        label="Confirm and record delivery"
                        loading={createDelivery.isPending}
                        disabled={createDelivery.isPending}
                        onPress={() => void confirmDelivery()}
                      />
                      <Button
                        label="Edit delivery"
                        variant="secondary"
                        disabled={createDelivery.isPending}
                        onPress={() => setIsReviewing(false)}
                      />
                    </Card>
                  </Animated.View>
                ) : null}
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
              </>
            )}
          </>
        ) : null}
      </ScrollView>
      {showStickyFooter ? (
        <View
          style={[
            styles.stickyFooter,
            {
              backgroundColor: theme.background,
              borderTopColor: theme.border,
            },
          ]}
        >
          {!canReviewDelivery ? (
            <AppText
              size="small"
              tone="secondary"
              style={styles.footerHint}
            >
              {reviewBlockReason}
            </AppText>
          ) : null}
          <Button
            label="Review delivery"
            disabled={createDelivery.isPending || !canReviewDelivery}
            onPress={() => void submit()}
          />
        </View>
      ) : null}
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
    paddingBottom: 24,
    gap: 14,
  },
  state: { gap: 10, alignItems: "flex-start" },
  stickyFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 6,
  },
  footerHint: { paddingBottom: 6, textAlign: "center" },
  stateIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  centered: { textAlign: "center" },
  orderCard: { gap: 12, paddingVertical: 12 },
  orderIdentity: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 9,
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
  hidden: { display: "none" },
  inlineNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderWidth: 1,
    borderRadius: 11,
    padding: 11,
  },
  formHeading: { flexDirection: "row", alignItems: "center" },
  item: { gap: 11, paddingVertical: 6 },
  itemHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
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
  quantityInput: {
    minHeight: 58,
    fontSize: 20,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  assignmentSummary: { gap: 8, borderRadius: 10, padding: 11 },
  assignmentHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  assignmentTrack: { height: 6, borderRadius: 4, overflow: "hidden" },
  assignmentFill: { height: "100%", borderRadius: 4 },
  quantityField: { gap: 7 },
  sourceQuantityInput: {
    minHeight: 52,
    fontSize: 18,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  notes: { minHeight: 80, textAlignVertical: "top" },
  allocation: {
    gap: 12,
    paddingVertical: 5,
  },
  compactSource: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  rowHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sourceActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  removeSourceButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 5,
    paddingVertical: 4,
  },
  selectedBlock: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
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
  splitHint: { marginTop: -7, textAlign: "center" },
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
    borderWidth: 0,
    borderLeftWidth: 3,
    borderRadius: 8,
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
  batchChoice: {
    gap: 9,
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 0,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  batchChoiceTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  batchMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  batchMetaItem: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 },
  reviewCard: { gap: 13 },
  reviewHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  reviewIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  reviewTotal: { gap: 3, borderRadius: 10, padding: 12 },
  reviewItem: { gap: 9, borderWidth: 1, borderRadius: 10, padding: 11 },
  reviewItemHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  reviewSource: { flexDirection: "row", alignItems: "center", gap: 7 },
  reviewSourceText: { flex: 1 },
  reviewNotes: { gap: 4 },
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
