import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  Platform,
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
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TextField } from "@/components/ui/text-field";
import {
  useChickenPurchaseDetails,
  useChickenSaleDetails,
  useChickenSaleOptions,
} from "@/features/chickens/hooks";
import {
  useCreatePurchaseReturn,
  useCreateSaleReturn,
  useCreateSupplierRefund,
  useCreateTransactionRefund,
  useProducts,
  usePurchaseReturns,
  useSaleReturns,
  useSupplierRefunds,
  useTransactionRefunds,
} from "@/features/management/hooks";
import type {
  Product,
  RecordedReturn,
  RecordedReturnItem,
  SettlementPaymentMethod,
} from "@/features/management/api";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type TransactionKind = "sale" | "purchase";
type ReturnMode = "delivered_return" | "undelivered_cancelled";
type ReturnsSection = "return" | "refund" | "history";
type ReturnRow = {
  id: string;
  productId: string;
  productName: string;
  productType: Product["product_type"] | null;
  chickenType: string | null;
  orderedQuantity: number;
  receivedQuantity: number;
  totalAmount: number;
  unitLabel: string;
  batchId: string | null;
};
type AllocationChoice = { batchId: string; blockId: string };
type ChickenSourceBlock = { id: string; name: string; quantity: number };
type ChickenReturnBatch = {
  id: string;
  name: string;
  chickenType: string | null;
  hatchDate: string | null;
  quantity: number;
  sourceBlocks: ChickenSourceBlock[];
};

const paymentMethods: SettlementPaymentMethod[] = [
  "cash",
  "mpesa",
  "bank_transfer",
  "card",
  "other",
];

export default function TransactionReturnsRoute() {
  return (
    <SessionGate>
      <ReturnsContent />
    </SessionGate>
  );
}

function ReturnsContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{
    transactionId: string;
    transactionType: TransactionKind;
  }>();
  const farmId = farm.selectedFarm?.id;
  const transactionId = params.transactionId;
  const kind = params.transactionType;
  const isSale = kind === "sale";
  const sale = useChickenSaleDetails(
    user?.id,
    farmId,
    isSale ? transactionId : undefined,
  );
  const purchase = useChickenPurchaseDetails(
    user?.id,
    farmId,
    isSale ? undefined : transactionId,
  );
  const chickenOptions = useChickenSaleOptions(
    user?.id,
    farmId,
  );
  const products = useProducts(user?.id, farmId);
  const saleReturns = useSaleReturns(
    user?.id,
    farmId,
    isSale ? transactionId : undefined,
  );
  const purchaseReturns = usePurchaseReturns(
    user?.id,
    farmId,
    isSale ? undefined : transactionId,
  );
  const saleRefunds = useTransactionRefunds(
    user?.id,
    farmId,
    isSale ? transactionId : undefined,
  );
  const supplierRefunds = useSupplierRefunds(
    user?.id,
    farmId,
    isSale ? undefined : transactionId,
  );
  const createSaleReturn = useCreateSaleReturn(
    user?.id ?? "",
    farmId ?? "",
    transactionId ?? "",
  );
  const createPurchaseReturn = useCreatePurchaseReturn(
    user?.id ?? "",
    farmId ?? "",
    transactionId ?? "",
  );
  const createSaleRefund = useCreateTransactionRefund(
    user?.id ?? "",
    farmId ?? "",
    transactionId ?? "",
  );
  const createSupplierRefund = useCreateSupplierRefund(
    user?.id ?? "",
    farmId ?? "",
    transactionId ?? "",
  );
  const returns = isSale ? saleReturns.data ?? [] : purchaseReturns.data ?? [];
  const refundHistory = isSale ? saleRefunds.data ?? [] : supplierRefunds.data ?? [];
  const transaction = isSale ? sale.data?.transaction : purchase.data?.transaction;
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [allocations, setAllocations] = useState<Record<string, AllocationChoice>>({});
  const [mode, setMode] = useState<ReturnMode>("delivered_return");
  const [activeSection, setActiveSection] =
    useState<ReturnsSection>("return");
  const [returnDate, setReturnDate] = useState(today());
  const [reason, setReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundDate, setRefundDate] = useState(today());
  const [refundMethod, setRefundMethod] = useState<SettlementPaymentMethod>("cash");
  const [refundReference, setRefundReference] = useState("");
  const [selectedReturnItemId, setSelectedReturnItemId] = useState("");
  const [returnError, setReturnError] = useState("");
  const [refundError, setRefundError] = useState("");
  const [returnSuccess, setReturnSuccess] = useState("");
  const [refundSuccess, setRefundSuccess] = useState("");
  const contactName = isSale
    ? sale.data?.customer_name || "Customer"
    : purchase.data?.supplier_name || "Supplier";
  const directionColor = isSale ? theme.success : theme.danger;

  const rows = useMemo<ReturnRow[]>(() => {
    if (sale.data) {
      return sale.data.transaction.items.map((item) => {
        const product = products.data?.find((candidate) => candidate.id === item.product_id);
        return {
          id: item.id,
          productId: item.product_id,
          productName: item.product_name ?? product?.name ?? "Product",
          productType: item.product_type ?? product?.product_type ?? null,
          chickenType: item.chicken_type,
          orderedQuantity: Number(item.ordered_base_quantity),
          receivedQuantity: Number(item.ordered_base_quantity),
          totalAmount: Number(item.total_amount),
          unitLabel:
            product?.product_units.find((unit) => unit.is_base_unit)?.unit_abbreviation ??
            item.unit_name ??
            "base units",
          batchId: null,
        };
      });
    }
    if (purchase.data) {
      return purchase.data.transaction.items.map((item) => {
        const product = products.data?.find((candidate) => candidate.id === item.product_id);
        const orderedQuantity = Number(item.ordered_base_quantity ?? item.quantity);
        return {
          id: item.id,
          productId: item.product_id,
          productName: item.product_name ?? product?.name ?? "Product",
          productType: product?.product_type ?? null,
          chickenType: item.chicken_type,
          orderedQuantity,
          receivedQuantity:
            product?.product_type === "chickens"
              ? Number(item.quantity_received)
              : orderedQuantity,
          totalAmount: Number(item.total_amount),
          unitLabel:
            product?.product_units.find((unit) => unit.is_base_unit)?.unit_abbreviation ??
            item.unit_name ??
            "base units",
          batchId: item.batch_id ?? null,
        };
      });
    }
    return [];
  }, [sale.data, purchase.data, products.data]);

  function maxReturnable(row: ReturnRow) {
    const previouslyReturned = returns.reduce((sum, record) => {
      if (record.return_type === "undelivered_cancelled" && mode !== "undelivered_cancelled") {
        return sum;
      }
      if (mode === "undelivered_cancelled" && record.return_type !== "undelivered_cancelled") {
        return sum;
      }
      return (
        sum +
        record.items
          .filter((item) => item.transaction_item_id === row.id)
          .reduce(
            (itemTotal, item) =>
              itemTotal + Number(item.quantity_returned ?? item.quantity ?? 0),
            0,
          )
      );
    }, 0);
    if (!isSale) {
      const unreturnedQuantity = Math.max(
        Math.min(row.orderedQuantity, row.receivedQuantity) - previouslyReturned,
        0,
      );
      if (row.productType !== "chickens") return unreturnedQuantity;
      const currentStock = purchaseChickenLocations(row).reduce(
        (sum, location) => sum + location.quantity,
        0,
      );
      return Math.min(unreturnedQuantity, currentStock);
    }
    if (mode === "undelivered_cancelled") {
      return maxUndeliveredCancelable(row);
    }
    const delivered =
      row.productType === "chickens"
        ? sale.data?.deliveries
            .flatMap((delivery) => delivery.items)
            .filter((item) => item.transaction_item_id === row.id)
            .reduce((sum, item) => sum + Number(item.quantity), 0) ?? 0
        : row.orderedQuantity;
    return Math.max(delivered - previouslyReturned, 0);
  }

  function maxUndeliveredCancelable(row: ReturnRow) {
    if (!isSale || row.productType !== "chickens") return 0;
    const delivered = sale.data?.deliveries
      .flatMap((delivery) => delivery.items)
      .filter((item) => item.transaction_item_id === row.id)
      .reduce((sum, item) => sum + Number(item.quantity), 0) ?? 0;
    const previouslyCancelled = returns
      .filter((record) => record.return_type === "undelivered_cancelled")
      .flatMap((record) => record.items)
      .filter((item) => item.transaction_item_id === row.id)
      .reduce(
        (sum, item) => sum + Number(item.quantity_returned ?? item.quantity ?? 0),
        0,
      );
    return Math.max(row.orderedQuantity - delivered - previouslyCancelled, 0);
  }

  function availableFromBatch(row: ReturnRow, batchId: string) {
    const delivered = sale.data?.deliveries
      .flatMap((delivery) => delivery.items)
      .filter((item) => item.transaction_item_id === row.id)
      .flatMap((item) => item.batch_allocations)
      .filter((allocation) => allocation.batch_id === batchId)
      .reduce((sum, allocation) => sum + allocation.quantity, 0) ?? 0;
    const returned = returns
      .flatMap((record) => record.items)
      .filter((item) => item.transaction_item_id === row.id)
      .flatMap((item) => item.batch_allocations ?? [])
      .filter((allocation) => allocation.batch_id === batchId)
      .reduce((sum, allocation) => sum + allocation.quantity, 0);
    return Math.max(delivered - returned, 0);
  }

  function eligibleChickenBatches(row: ReturnRow): ChickenReturnBatch[] {
    const batches = new Map<
      string,
      ChickenReturnBatch & { sourceBlocksById: Map<string, ChickenSourceBlock> }
    >();
    sale.data?.deliveries
      .flatMap((delivery) => delivery.items)
      .filter((item) => item.transaction_item_id === row.id)
      .flatMap((item) => item.batch_allocations)
      .forEach((allocation) => {
        if (availableFromBatch(row, allocation.batch_id) > 0) {
          const existing = batches.get(allocation.batch_id);
          const sourceBlock = existing?.sourceBlocksById.get(allocation.block_id);
          if (sourceBlock) {
            sourceBlock.quantity += allocation.quantity;
          } else {
            const sourceBlocksById = existing?.sourceBlocksById ??
              new Map<string, ChickenSourceBlock>();
            sourceBlocksById.set(allocation.block_id, {
              id: allocation.block_id,
              name: allocation.block_name,
              quantity: allocation.quantity,
            });
            batches.set(allocation.batch_id, {
              id: allocation.batch_id,
              name: allocation.batch_name,
              chickenType: row.chickenType,
              hatchDate:
                chickenOptions.data?.batches.find(
                  (batch) => batch.id === allocation.batch_id,
                )?.hatch_date ?? null,
              quantity: availableFromBatch(row, allocation.batch_id),
              sourceBlocksById,
              sourceBlocks: [],
            });
          }
        }
      });
    return [...batches.values()].map(({ sourceBlocksById, ...batch }) => ({
      ...batch,
      sourceBlocks: [...sourceBlocksById.values()],
    }));
  }

  function returnAllocation(row: ReturnRow): AllocationChoice | undefined {
    const batches = eligibleChickenBatches(row);
    const blocks = (chickenOptions.data?.blocks ?? []).filter(
      (block) => block.available_capacity > 0,
    );
    const selected = allocations[row.id];
    const batch =
      batches.find((candidate) => candidate.id === selected?.batchId) ?? batches[0];
    const originalBlockId = batch?.sourceBlocks.find((source) =>
      blocks.some((candidate) => candidate.id === source.id),
    )?.id;
    const block =
      blocks.find((candidate) => candidate.id === selected?.blockId) ??
      blocks.find((candidate) => candidate.id === originalBlockId) ??
      blocks[0];
    if (!batch || !block) return undefined;
    return { batchId: batch.id, blockId: block.id };
  }

  function purchaseChickenLocations(row: ReturnRow): ChickenSourceBlock[] {
    const batch = purchaseChickenBatch(row);
    return (batch?.stocks ?? [])
      .filter((stock) => stock.quantity > 0)
      .map((stock) => ({
        id: stock.block_id,
        name:
          chickenOptions.data?.blocks.find((block) => block.id === stock.block_id)?.name ??
          stock.block_name,
        quantity: stock.quantity,
      }))
      .sort((left, right) => right.quantity - left.quantity);
  }

  function purchaseChickenBatch(row: ReturnRow) {
    const batchId =
      row.batchId ??
      purchase.data?.receipts
        .flatMap((receipt) => receipt.items)
        .find((item) => item.transaction_item_id === row.id)?.batch_id ??
      null;
    return chickenOptions.data?.batches.find(
      (candidate) => candidate.id === batchId,
    );
  }

  function purchaseChickenAllocations(row: ReturnRow, quantity: number) {
    const batchId =
      row.batchId ??
      purchase.data?.receipts
        .flatMap((receipt) => receipt.items)
        .find((item) => item.transaction_item_id === row.id)?.batch_id ??
      null;
    if (!batchId) return [];
    let remaining = quantity;
    const stock = chickenOptions.data?.batches
      .find((batch) => batch.id === batchId)
      ?.stocks.toSorted((left, right) => right.quantity - left.quantity);
    if (!stock) return [];
    const result: { block_id: string; quantity: number }[] = [];
    for (const block of stock) {
      if (remaining <= 0) break;
      const assigned = Math.min(remaining, block.quantity);
      if (assigned > 0) {
        result.push({ block_id: block.block_id, quantity: assigned });
        remaining -= assigned;
      }
    }
    return remaining === 0 ? result : [];
  }

  function supplierCreditRemaining(item: RecordedReturnItem) {
    const alreadyRefunded = (supplierRefunds.data ?? [])
      .filter((refund) => refund.purchase_return_item_id === item.id)
      .reduce((sum, refund) => sum + Number(refund.amount), 0);
    return Math.max(Number(item.credit_amount) - alreadyRefunded, 0);
  }

  async function submitReturn() {
    setReturnError("");
    setReturnSuccess("");
    if (!transactionId || !farmId) {
      setReturnError("Transaction or farm details are missing. Reload the page and try again.");
      return;
    }
    if (!reason.trim()) {
      setReturnError("Enter a reason for this product return.");
      return;
    }
    if (!isValidDate(returnDate)) {
      setReturnError("Enter a valid return date in YYYY-MM-DD format.");
      return;
    }
    const returnedRows = rows
      .map((row) => ({ row, quantity: Number(quantities[row.id] ?? 0) }))
      .filter((entry) => Number.isFinite(entry.quantity) && entry.quantity > 0);
    if (!returnedRows.length) {
      setReturnError("Enter a positive quantity for at least one available item.");
      return;
    }
    for (const { row, quantity } of returnedRows) {
      if (quantity > maxReturnable(row)) {
        setReturnError(
          `${row.productName}: only ${maxReturnable(row)} ${row.unitLabel} can be returned based on received quantities and current stock.`,
        );
        return;
      }
      if (row.productType === "chickens" && !Number.isInteger(quantity)) {
        setReturnError("Chicken return quantities must be whole numbers.");
        return;
      }
      if (isSale && mode === "delivered_return" && row.productType === "chickens") {
        const allocation = returnAllocation(row);
        if (!allocation) {
          setReturnError("Choose an active delivered batch and a block with available capacity.");
          return;
        }
        const batchQuantity = availableFromBatch(row, allocation.batchId);
        if (quantity > batchQuantity) {
          setReturnError(
            `Only ${batchQuantity} ${row.unitLabel} remain from the selected batch. Choose a batch with enough stock.`,
          );
          return;
        }
        const block = chickenOptions.data?.blocks.find(
          (candidate) => candidate.id === allocation.blockId,
        );
        if (!block || quantity > block.available_capacity) {
          setReturnError("Choose a destination block with enough available capacity.");
          return;
        }
      }
    }
    try {
      let savedReturn: RecordedReturn;
      if (isSale) {
        const items = returnedRows.map(({ row, quantity }) => {
          const batchBlock =
            mode === "delivered_return" && row.productType === "chickens"
              ? returnAllocation(row)
              : undefined;
          const chicken = row.productType === "chickens";
          if (mode === "delivered_return" && chicken && !batchBlock) {
            throw new Error(`Choose a return batch and block for ${row.productName}.`);
          }
          return {
            transaction_item_id: row.id,
            quantity: String(quantity),
            batch_allocations:
              mode === "delivered_return" && chicken && batchBlock
                ? [
                    {
                      batch_id: batchBlock.batchId,
                      block_id: batchBlock.blockId,
                      quantity,
                    },
                  ]
                : [],
          };
        });
        savedReturn = await createSaleReturn.mutateAsync({
          return_type: mode,
          return_date: returnDate,
          reason: reason.trim(),
          items,
        });
      } else {
        const items = returnedRows.map(({ row, quantity }) => {
          const blockAllocations =
            row.productType === "chickens"
              ? purchaseChickenAllocations(row, quantity)
              : [];
          if (
            row.productType === "chickens" &&
            blockAllocations.reduce((sum, allocation) => sum + allocation.quantity, 0) !==
              quantity
          ) {
            throw new Error(
              `There is not enough current stock in this batch to return ${quantity} ${row.productName}.`,
            );
          }
          return {
            transaction_item_id: row.id,
            quantity_returned: String(quantity),
            block_allocations: blockAllocations,
          };
        });
        savedReturn = await createPurchaseReturn.mutateAsync({
          return_date: returnDate,
          reason: reason.trim(),
          items,
        });
      }
      setQuantities({});
      setReason("");
      const issuedReturnValue = Number(savedReturn.credit_total);
      if (isSale && issuedReturnValue > 0) {
        setActiveSection("refund");
        const refundAvailableAfterReturn = Math.min(
          issuedReturnValue,
          Math.max(Number(savedReturn.credit_balance ?? 0), 0),
        );
        setRefundAmount(
          refundAvailableAfterReturn > 0
            ? refundAvailableAfterReturn.toFixed(2)
            : "",
        );
        setRefundReason("Refund for returned goods");
        setRefundSuccess(
          `${formatMoney(issuedReturnValue, theme.currency)} return value applied. Sale balance due: ${formatMoney(savedReturn.balance_due ?? 0, theme.currency)}. Cash refundable now: ${formatMoney(refundAvailableAfterReturn, theme.currency)}.`,
        );
      } else if (!isSale) {
        const firstCreditItem = savedReturn.items.find(
          (item) => Number(item.credit_amount) > 0,
        );
        if (firstCreditItem) {
          setActiveSection("refund");
          setSelectedReturnItemId(firstCreditItem.id);
          setRefundAmount(Number(firstCreditItem.credit_amount).toFixed(2));
          setRefundReason("Refund for returned goods");
          setRefundSuccess(
            `${formatMoney(firstCreditItem.credit_amount, theme.currency)} is the value of this supplier return. The refund amount below is filled in and linked to this return.`,
          );
        } else {
          setReturnSuccess(
            "Return recorded. No refundable value was created for this return.",
          );
        }
      } else {
        setReturnSuccess("Return recorded. No refundable value was created.");
      }
    } catch (error: unknown) {
      setReturnError(normalizeApiError(error).message);
    }
  }

  async function submitCashRefund() {
    setRefundError("");
    setRefundSuccess("");
    if (!farmId || !transactionId) {
      setRefundError("Transaction or farm details are missing. Reload the page and try again.");
      return;
    }
    const parsedRefundAmount = Number(refundAmount);
    if (!Number.isFinite(parsedRefundAmount) || parsedRefundAmount <= 0) {
      setRefundError("Enter a refund amount greater than zero.");
      return;
    }
    if (!refundReason.trim()) {
      setRefundError("Enter a reason for this refund.");
      return;
    }
    if (isSale && parsedRefundAmount > availableRefundAmount) {
      setRefundError(
        `The refund cannot exceed the unrefunded return value or the amount currently refundable after the sale balance is recalculated: ${formatMoney(availableRefundAmount, theme.currency)}.`,
      );
      return;
    }
    if (!isValidDate(refundDate)) {
      setRefundError("Enter a valid refund date in YYYY-MM-DD format.");
      return;
    }
    try {
      if (isSale) {
        await createSaleRefund.mutateAsync({
          amount: refundAmount,
          refund_date: refundDate,
          payment_method: refundMethod,
          reference_number:
            refundMethod === "cash" ? undefined : refundReference.trim() || undefined,
          reason: refundReason.trim(),
        });
      } else {
        const returnItem = returns
          .flatMap((record) => record.items)
          .find((item) => item.id === selectedReturnItemId);
        if (!returnItem) {
          setRefundError("Select a purchase return credit before recording a supplier refund.");
          return;
        }
        const remainingCredit = supplierCreditRemaining(returnItem);
        if (parsedRefundAmount > remainingCredit) {
          setRefundError(
            `This refund cannot exceed the remaining supplier credit of ${formatMoney(remainingCredit, theme.currency)}.`,
          );
          return;
        }
        await createSupplierRefund.mutateAsync({
          purchase_return_item_id: returnItem.id,
          amount: refundAmount,
          refund_date: refundDate,
          payment_method: refundMethod,
          reference_number:
            refundMethod === "cash" ? undefined : refundReference.trim() || undefined,
          reason: refundReason.trim(),
        });
      }
      setRefundAmount("");
      setRefundReason("");
      setRefundReference("");
      setRefundSuccess(
        `${formatMoney(parsedRefundAmount, theme.currency)} refund recorded and added to the transaction history.`,
      );
    } catch (error: unknown) {
      setRefundError(normalizeApiError(error).message);
    }
  }

  const isLoading =
    (isSale ? sale.isLoading : purchase.isLoading) ||
    products.isLoading ||
    (isSale ? saleReturns.isLoading : purchaseReturns.isLoading) ||
    (isSale ? saleRefunds.isLoading : supplierRefunds.isLoading) ||
    chickenOptions.isLoading;
  const queryError =
    (isSale ? sale.error : purchase.error) ??
    products.error ??
    (isSale ? saleReturns.error : purchaseReturns.error) ??
    (isSale ? saleRefunds.error : supplierRefunds.error) ??
    chickenOptions.error;
  const saleRefundValueRemaining = Math.max(
    (saleReturns.data ?? []).reduce(
      (sum, record) => sum + Number(record.credit_total),
      0,
    ) -
      (saleRefunds.data ?? []).reduce(
        (sum, refund) => sum + Number(refund.amount),
        0,
      ),
    0,
  );
  const saleRefundableBalance = Math.max(
    Number(sale.data?.transaction.credit_balance ?? 0),
    0,
  );
  const selectedSupplierReturnItem = returns
    .flatMap((record) => record.items)
    .find((item) => item.id === selectedReturnItemId);
  const supplierRefundableItems = returns
    .flatMap((record) => record.items)
    .filter((item) => supplierCreditRemaining(item) > 0);
  const selectedSupplierRemainingCredit = selectedSupplierReturnItem
    ? supplierCreditRemaining(selectedSupplierReturnItem)
    : 0;
  const availableRefundAmount = isSale
    ? Math.min(saleRefundValueRemaining, saleRefundableBalance)
    : selectedSupplierRemainingCredit;
  const refundDataReady = isSale
    ? sale.isSuccess &&
      saleReturns.isSuccess &&
      saleRefunds.isSuccess &&
      !sale.isFetching &&
      !saleReturns.isFetching &&
      !saleRefunds.isFetching
    : purchase.isSuccess &&
      purchaseReturns.isSuccess &&
      supplierRefunds.isSuccess &&
      !purchase.isFetching &&
      !purchaseReturns.isFetching &&
      !supplierRefunds.isFetching;
  const refundAmountExceedsAvailable =
    Number.isFinite(Number(refundAmount)) &&
    Number(refundAmount) > availableRefundAmount;
  const returnableRows = rows.filter((row) => maxReturnable(row) > 0);
  const hasUndeliveredToCancel = rows.some(
    (row) => maxUndeliveredCancelable(row) > 0,
  );
  const unavailablePurchaseChickenRows =
    !isSale && mode !== "undelivered_cancelled"
      ? rows.filter(
          (row) =>
            row.productType === "chickens" &&
            purchaseChickenLocations(row).reduce(
              (sum, location) => sum + location.quantity,
              0,
            ) === 0,
        )
      : [];

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
        <FarmPageHeader title="Returns and refunds" showBack />
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={theme.primary} />
            <AppText tone="secondary">Loading transaction items…</AppText>
          </View>
        ) : null}
        {queryError ? (
          <Card style={styles.section}>
            <AppText weight="semibold">Couldn’t load returns</AppText>
            <AppText size="small" style={{ color: theme.danger }}>
              {normalizeApiError(queryError).message}
            </AppText>
            <Button
              label="Retry loading"
              variant="secondary"
              onPress={() =>
                void Promise.all(
                  isSale
                    ? [
                        sale.refetch(),
                        saleReturns.refetch(),
                        saleRefunds.refetch(),
                        products.refetch(),
                        chickenOptions.refetch(),
                      ]
                    : [
                        purchase.refetch(),
                        purchaseReturns.refetch(),
                        supplierRefunds.refetch(),
                        products.refetch(),
                        chickenOptions.refetch(),
                      ],
                )
              }
            />
          </Card>
        ) : null}
        {transaction ? (
          <>
            <Card
              style={[
                styles.directionCard,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.transactionHeading}>
                <View
                  style={[
                    styles.transactionIcon,
                    { backgroundColor: `${directionColor}16` },
                  ]}
                >
                  <Ionicons
                    name="return-down-back-outline"
                    size={22}
                    color={directionColor}
                  />
                </View>
                <View style={styles.grow}>
                  <AppText size="small" weight="semibold" style={{ color: directionColor }}>
                    {isSale ? "CUSTOMER RETURN" : "SUPPLIER RETURN"}
                  </AppText>
                  <AppText size="heading" weight="semibold">
                    {transaction.reference_number ??
                      `${isSale ? "Sale" : "Purchase"} transaction`}
                  </AppText>
                </View>
              </View>
              <View
                style={[
                  styles.directionFlow,
                  { backgroundColor: theme.background },
                ]}
              >
                <View style={styles.directionParty}>
                  <AppText size="small" tone="secondary">FROM</AppText>
                  <AppText weight="semibold">{isSale ? contactName : "Farm Track"}</AppText>
                </View>
                <Ionicons name="arrow-forward" size={20} color={directionColor} />
                <View style={styles.directionParty}>
                  <AppText size="small" tone="secondary">TO</AppText>
                  <AppText weight="semibold">{isSale ? "Farm Track" : contactName}</AppText>
                </View>
              </View>
              <View style={[styles.transactionSummary, { borderTopColor: theme.border }]}>
                  <View style={styles.transactionSummaryMetric}>
                    <AppText size="small" tone="secondary">Transaction total</AppText>
                    <AppText weight="semibold">
                      {formatMoney(transaction.transaction_total, theme.currency)}
                    </AppText>
                  </View>
                  <View style={[styles.metricDivider, { backgroundColor: theme.border }]} />
                  <View style={styles.transactionSummaryMetric}>
                    <AppText size="small" tone="secondary">
                      {isSale
                        ? "Returned-goods value (after discount)"
                        : "Supplier credit"}
                    </AppText>
                    <AppText weight="semibold" style={{ color: directionColor }}>
                      {formatMoney(
                        isSale
                          ? saleRefundValueRemaining
                          : Number(transaction.credit_balance),
                        theme.currency,
                      )}
                    </AppText>
                  </View>
              </View>
              {isSale ? (
                <View
                  style={[
                    styles.returnBalanceNote,
                    { borderTopColor: theme.border },
                  ]}
                >
                  <AppText size="small" tone="secondary">
                    Current sale balance due
                  </AppText>
                  <AppText weight="semibold" style={{ color: theme.danger }}>
                    {formatMoney(Number(transaction.balance_due), theme.currency)}
                  </AppText>
                  <AppText size="small" tone="secondary">
                    Return value reduces the amount owed first. A cash refund is
                    only due if the return leaves a customer credit.
                  </AppText>
                </View>
              ) : null}
            </Card>
            <View
              style={[
                styles.sectionTabs,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            >
              <WorkflowTab
                label="Return"
                icon="return-down-back-outline"
                selected={activeSection === "return"}
                onPress={() => setActiveSection("return")}
              />
              <WorkflowTab
                label="Refund"
                icon="cash-outline"
                selected={activeSection === "refund"}
                onPress={() => setActiveSection("refund")}
              />
              <WorkflowTab
                label="History"
                icon="time-outline"
                selected={activeSection === "history"}
                onPress={() => setActiveSection("history")}
              />
            </View>
            {activeSection === "return" ? (
              <>
            {isSale ? (
              <Card style={styles.section}>
                <AppText weight="semibold">What is being returned?</AppText>
                <View style={styles.pills}>
                  <Choice
                    label="Goods returned"
                    selected={mode === "delivered_return"}
                    onPress={() => {
                      setMode("delivered_return");
                      setQuantities({});
                      setReturnError("");
                      setReturnSuccess("");
                    }}
                  />
                  {hasUndeliveredToCancel || mode === "undelivered_cancelled" ? (
                    <Choice
                      label="Cancel undelivered chickens"
                      selected={mode === "undelivered_cancelled"}
                      onPress={() => {
                        setMode("undelivered_cancelled");
                        setQuantities({});
                        setReturnError("");
                        setReturnSuccess("");
                      }}
                    />
                  ) : null}
                </View>
                <AppText size="small" tone="secondary">
                  {mode === "delivered_return"
                    ? "These goods came back from the customer and will be added to farm stock."
                    : "These chickens were never delivered. The sale is cancelled for this quantity; farm stock does not move."}
                </AppText>
              </Card>
            ) : null}

            <Card style={styles.section}>
              <View style={styles.sectionHeading}>
                <View
                  style={[
                    styles.sectionIcon,
                    { backgroundColor: `${theme.primary}14` },
                  ]}
                >
                  <Ionicons name="list-outline" size={19} color={theme.primary} />
                </View>
                <View style={styles.grow}>
                  <AppText weight="semibold">
                    {mode === "undelivered_cancelled"
                      ? "Undelivered chickens"
                      : isSale
                        ? "Choose items to return"
                        : "Choose items to return"}
                  </AppText>
                  <AppText size="small" tone="secondary">
                    Enter quantities only for the items included in this return.
                  </AppText>
                </View>
              </View>
              {!returnableRows.length ? (
                <AppText size="small" tone="secondary">
                  {isLoading
                    ? "Checking stock and return eligibility…"
                    : mode === "undelivered_cancelled"
                      ? "There are no undelivered chickens available to cancel."
                      : "There are no items currently available to return."}
                </AppText>
              ) : null}
              {!isLoading ? unavailablePurchaseChickenRows.map((row) => {
                const batch = purchaseChickenBatch(row);
                return (
                  <AppText key={row.id} size="small" tone="secondary">
                    {row.productName}: no eligible stock is available in{" "}
                    {batch?.name ?? "the purchase batch"}. Supplier returns require current
                    stock in that batch.
                  </AppText>
                );
              }) : null}
              {returnableRows.map((row, index) => {
                const maxQuantity = maxReturnable(row);
                const quantity = Number(quantities[row.id] ?? 0);
                const chicken = row.productType === "chickens";
                const chickenBatches =
                  isSale && mode === "delivered_return" && chicken
                    ? eligibleChickenBatches(row)
                    : [];
                const choice = allocations[row.id];
                const selectedBatch =
                  chickenBatches.find((batch) => batch.id === choice?.batchId) ??
                  chickenBatches[0];
                const blockChoices = (chickenOptions.data?.blocks ?? []).filter(
                  (block) => block.available_capacity > 0,
                );
                const defaultAllocation =
                  isSale && mode === "delivered_return" && chicken
                    ? returnAllocation(row)
                    : undefined;
                const selectedBlock =
                  blockChoices.find(
                    (block) => block.id === defaultAllocation?.blockId,
                  );
                const sourceSummary = selectedBatch?.sourceBlocks
                  .map((block) => `${block.name} (${formatNumber(block.quantity)})`)
                  .join(", ");
                const currentLocations = !isSale && chicken
                  ? purchaseChickenLocations(row)
                  : [];
                const purchasedBatch = !isSale && chicken
                  ? purchaseChickenBatch(row)
                  : undefined;
                if (mode === "undelivered_cancelled" && !chicken) return null;
                return (
                  <View
                    key={row.id}
                    style={[
                      styles.itemCard,
                      { borderTopColor: theme.border },
                      index > 0 && styles.itemDivider,
                    ]}
                  >
                    <View style={styles.itemHeader}>
                      <View style={styles.grow}>
                        <AppText weight="semibold">{row.productName}</AppText>
                        <AppText size="small" tone="secondary">
                          {row.productType === "chickens" && row.chickenType
                            ? `${titleCase(row.chickenType)} · `
                            : ""}
                          {formatNumber(row.orderedQuantity)} {row.unitLabel} originally ·{" "}
                          {formatMoney(row.totalAmount, theme.currency)}
                        </AppText>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Use maximum return quantity, ${formatNumber(maxQuantity)} ${row.unitLabel}`}
                        onPress={() => {
                          setReturnError("");
                          setReturnSuccess("");
                          setQuantities((current) => ({
                            ...current,
                            [row.id]: String(maxQuantity),
                          }));
                        }}
                        style={[
                          styles.maxQuantityButton,
                          {
                            backgroundColor: `${theme.primary}10`,
                            borderColor: `${theme.primary}35`,
                          },
                        ]}
                      >
                        <AppText
                          size="small"
                          weight="semibold"
                          style={{ color: theme.primary }}
                        >
                          Use max · {formatNumber(maxQuantity)}
                        </AppText>
                      </Pressable>
                    </View>
                    {isSale &&
                    mode === "delivered_return" &&
                    chicken &&
                    sourceSummary ? (
                      <LocationSummary
                        label="Originally delivered from"
                        value={sourceSummary}
                      />
                    ) : null}
                    {!isSale && chicken ? (
                      <LocationSummary
                        label={`Current stock · ${purchasedBatch?.name ?? "batch"} · ${
                          titleCase(purchasedBatch?.chicken_type ?? row.chickenType ?? "other")
                        }${
                          purchasedBatch?.hatch_date
                            ? ` · ${formatBatchAge(purchasedBatch.hatch_date, today())} old`
                            : ""
                        }`}
                        value={
                          currentLocations.length
                            ? currentLocations
                                .map((location) =>
                                  `${location.name} · ${formatNumber(location.quantity)} chickens`,
                                )
                                .join("  |  ")
                            : "No chickens remain in this batch to return."
                        }
                      />
                    ) : null}
                    <TextField
                      label={`Quantity to ${mode === "undelivered_cancelled" ? "cancel" : "return"} (${row.unitLabel})`}
                      value={quantities[row.id] ?? ""}
                      onChangeText={(value) => {
                        setReturnError("");
                        setReturnSuccess("");
                        setQuantities((current) => ({ ...current, [row.id]: value }));
                      }}
                      keyboardType={chicken ? "number-pad" : "decimal-pad"}
                      placeholder="0"
                    />
                    {isSale && mode === "delivered_return" && chicken && quantity > 0 ? (
                      <>
                        <ReturnPicker
                          label="Chicken batch"
                          value={selectedBatch?.name ?? "Select a delivered batch"}
                          detail={
                            selectedBatch
                              ? `${titleCase(selectedBatch.chickenType ?? row.chickenType ?? "other")} · ${formatNumber(availableFromBatch(row, selectedBatch.id))} still returnable`
                              : "No delivered batch is available."
                          }
                          options={chickenBatches.map((batch) => ({
                            id: batch.id,
                            label: batch.name,
                            detail: [
                              `${titleCase(batch.chickenType ?? row.chickenType ?? "other")}${
                                batch.hatchDate
                                  ? ` · ${formatBatchAge(batch.hatchDate, today())} old`
                                  : ""
                              }`,
                              `Delivered from ${batch.sourceBlocks
                                .map((source) => `${source.name} (${source.quantity})`)
                                .join(", ")}`,
                              `${formatNumber(availableFromBatch(row, batch.id))} chickens still returnable`,
                            ].join(" · "),
                          }))}
                          selectedId={selectedBatch?.id ?? ""}
                          onSelect={(batchId) => {
                            const nextBatch = chickenBatches.find(
                              (candidate) => candidate.id === batchId,
                            );
                            const sameBlock = nextBatch?.sourceBlocks.find((source) =>
                              blockChoices.some((block) => block.id === source.id),
                            );
                            setAllocations((current) => ({
                              ...current,
                              [row.id]: {
                                batchId,
                                blockId: sameBlock?.id ?? blockChoices[0]?.id ?? "",
                              },
                            }));
                          }}
                        />
                        <ReturnPicker
                          label="Return destination"
                          value={
                            selectedBlock?.name ?? "Select a block with enough capacity"
                          }
                          detail={
                            selectedBlock
                              ? selectedBlock.id ===
                                selectedBatch?.sourceBlocks.find(
                                  (source) => source.id === selectedBlock.id,
                                )?.id
                                ? "Same block used for the original delivery"
                                : "Different block from the original delivery"
                              : "No active block has available capacity."
                          }
                          options={blockChoices.map((block) => ({
                            id: block.id,
                            label: block.name,
                            detail: [
                              selectedBatch?.sourceBlocks.some(
                                (source) => source.id === block.id,
                              )
                                ? "Original delivery block"
                                : "Another block",
                              `${formatNumber(block.available_capacity)} spaces available`,
                            ].join(" · "),
                          }))}
                          selectedId={selectedBlock?.id ?? ""}
                          onSelect={(blockId) =>
                            setAllocations((current) => ({
                              ...current,
                              [row.id]: {
                                batchId: selectedBatch?.id ?? "",
                                blockId,
                              },
                            }))
                          }
                        />
                        {!chickenBatches.length ? (
                          <AppText size="small" style={{ color: theme.danger }}>
                            No delivered chicken batch is available for this return.
                          </AppText>
                        ) : null}
                      </>
                    ) : null}
                    {!isSale && chicken && quantity > 0 ? (
                      <LocationSummary
                        label="This return will remove stock from"
                        value={
                          purchaseChickenAllocations(row, quantity)
                            .map((allocation) => {
                              const block = chickenOptions.data?.blocks.find(
                                (candidate) => candidate.id === allocation.block_id,
                              );
                              return `${allocation.quantity} from ${block?.name ?? "a block"}`;
                            })
                            .join(", ") || "No available batch stock"
                        }
                      />
                    ) : null}
                    {quantity > 0 ? (
                      <AppText size="small" tone="secondary">
                        Estimated transaction credit:{" "}
                        {formatMoney(
                          row.totalAmount * (quantity / row.orderedQuantity),
                          theme.currency,
                        )}
                      </AppText>
                    ) : null}
                  </View>
                );
              })}
              {returnableRows.length ? (
                <>
                  {returnError ? (
                    <FeedbackNotice tone="error" message={returnError} />
                  ) : null}
                  <DatePickerField
                    label="Return date"
                    value={returnDate}
                    maximumDate={new Date()}
                    onChange={(value) => {
                      setReturnError("");
                      setReturnSuccess("");
                      setReturnDate(value);
                    }}
                  />
                  <TextField
                    label="Reason"
                    value={reason}
                    onChangeText={(value) => {
                      setReturnError("");
                      setReturnSuccess("");
                      setReason(value);
                    }}
                    placeholder="Describe why these goods are returned"
                  />
                  <Button
                    label={
                      mode === "undelivered_cancelled"
                        ? "Confirm chicken cancellation"
                        : "Record product return"
                    }
                    loading={createSaleReturn.isPending || createPurchaseReturn.isPending}
                    onPress={() => void submitReturn()}
                  />
                </>
              ) : null}
            </Card>
            {returnSuccess ? (
              <FeedbackNotice tone="success" message={returnSuccess} />
            ) : null}
              </>
            ) : null}

            {activeSection === "refund" ? (
            <Card style={styles.refundCard}>
              <View style={styles.refundHeading}>
                <View
                  style={[
                    styles.sectionIcon,
                    { backgroundColor: `${theme.success}14` },
                  ]}
                >
                  <Ionicons name="cash-outline" size={19} color={theme.success} />
                </View>
                <View style={styles.grow}>
                  <AppText weight="semibold">Refund money</AppText>
                  <AppText size="small" tone="secondary">
                    {isSale
                      ? "Record cash only when the customer has a refundable overpayment after returns are applied."
                      : "Record cash paid out against the selected purchase return."}
                  </AppText>
                </View>
              </View>
              <View
                style={[
                  styles.creditSummary,
                  {
                    backgroundColor: `${availableRefundAmount > 0 ? theme.success : theme.secondary}10`,
                    borderColor: `${availableRefundAmount > 0 ? theme.success : theme.secondary}35`,
                  },
                ]}
              >
                <View style={styles.creditSummaryCopy}>
                  <AppText size="small" tone="secondary">
                    {isSale
                      ? "Unrefunded return value"
                      : selectedSupplierReturnItem
                        ? "Value remaining on selected return"
                        : "Select a purchase return"}
                  </AppText>
                  <AppText
                    size="heading"
                    weight="semibold"
                    style={{
                      color:
                        availableRefundAmount > 0
                          ? theme.success
                          : theme.textSecondary,
                    }}
                  >
                    {formatMoney(
                      isSale
                        ? saleRefundValueRemaining
                        : selectedSupplierRemainingCredit,
                      theme.currency,
                    )}
                  </AppText>
                </View>
                {availableRefundAmount > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setRefundError("");
                      setRefundSuccess("");
                      setRefundAmount(availableRefundAmount.toFixed(2));
                    }}
                    style={[
                      styles.fillCreditButton,
                      { backgroundColor: theme.backgroundElement },
                    ]}
                  >
                    <AppText
                      size="small"
                      weight="semibold"
                      style={{ color: theme.primary }}
                    >
                      Fill amount
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
              {isSale ? (
                refundDataReady && saleRefundValueRemaining <= 0 ? (
                  <FeedbackNotice
                    tone="info"
                    message="No unrefunded sale-return value is available. Record a return before recording a refund."
                  />
                ) : null
              ) : (
                <>
                  <AppText size="small" weight="semibold">
                    Choose a purchase return
                  </AppText>
                  {supplierRefundableItems.length ? (
                    <View style={styles.returnCreditList}>
                      {supplierRefundableItems.map((item) => {
                        const remaining = supplierCreditRemaining(item);
                        const selected = selectedReturnItemId === item.id;
                        return (
                          <Pressable
                            key={item.id}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            onPress={() => {
                              setRefundError("");
                              setRefundSuccess("");
                              setSelectedReturnItemId(item.id);
                              setRefundAmount(remaining.toFixed(2));
                            }}
                            style={[
                              styles.returnCreditOption,
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
                            <View style={styles.grow}>
                              <AppText weight="semibold">
                                {item.product_name ?? "Returned item"}
                              </AppText>
                              <AppText size="small" tone="secondary">
                                {formatNumber(
                                  Number(item.quantity_returned ?? item.quantity ?? 0),
                                )}{" "}
                                returned
                              </AppText>
                            </View>
                            <View style={styles.returnCreditAmount}>
                              <AppText
                                size="small"
                                weight="semibold"
                                style={{ color: theme.success }}
                              >
                                {formatMoney(remaining, theme.currency)}
                              </AppText>
                              <Ionicons
                                name={
                                  selected
                                    ? "checkmark-circle"
                                    : "chevron-forward"
                                }
                                size={19}
                                color={
                                  selected ? theme.primary : theme.textSecondary
                                }
                              />
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : refundDataReady ? (
                    <FeedbackNotice
                      tone="info"
                      message="No unrefunded purchase-return value is available. Record a supplier return before recording a refund."
                    />
                  ) : null}
                  {!refundDataReady ? (
                    <FeedbackNotice
                      tone="info"
                      message="Checking the latest return and refund balances before enabling payouts."
                    />
                  ) : null}
                </>
              )}
              {isSale && saleRefundValueRemaining > 0 ? (
                <AppText size="small" tone="secondary">
                  Refundable now = the lower of unrefunded return value (
                  {formatMoney(saleRefundValueRemaining, theme.currency)}) and
                  customer credit after returns (
                  {formatMoney(saleRefundableBalance, theme.currency)}). Current
                  sale balance due:{" "}
                  {formatMoney(
                    Number(sale.data?.transaction.balance_due ?? 0),
                    theme.currency,
                  )}.
                </AppText>
              ) : null}
              {isSale &&
              refundDataReady &&
              saleRefundValueRemaining > 0 &&
              availableRefundAmount <= 0 ? (
                <FeedbackNotice
                  tone="info"
                  message={
                    Number(sale.data?.transaction.balance_due ?? 0) > 0
                      ? "There is no cash refund to fill: the customer still owes this sale balance. The returned-goods value has already reduced what they owe."
                      : "There is no customer overpayment available to refund against this return."
                  }
                />
              ) : null}
              {refundSuccess ? (
                <FeedbackNotice tone="success" message={refundSuccess} />
              ) : null}
              <TextField
                label="Refund amount"
                value={refundAmount}
                onChangeText={(value) => {
                  setRefundError("");
                  setRefundSuccess("");
                  setRefundAmount(value);
                }}
                keyboardType="decimal-pad"
                placeholder="0.00"
                editable={
                  refundDataReady &&
                  (isSale ? availableRefundAmount > 0 : selectedSupplierRemainingCredit > 0)
                }
              />
              <AppText size="small" tone="secondary">
                Maximum cash refund now:{" "}
                {formatMoney(availableRefundAmount, theme.currency)}
              </AppText>
              {refundAmountExceedsAvailable ? (
                <FeedbackNotice
                  tone="error"
                  message={
                    availableRefundAmount > 0
                      ? "The entered amount is higher than the refundable amount. Use Fill amount or enter a smaller amount."
                      : "No cash refund is currently available. The returned value has reduced the sale balance first."
                  }
                />
              ) : null}
              <DatePickerField
                label="Refund date"
                value={refundDate}
                maximumDate={new Date()}
                onChange={(value) => {
                  setRefundError("");
                  setRefundDate(value);
                }}
              />
              <View style={styles.formSectionHeading}>
                <AppText size="small" weight="semibold">
                  Payment method
                </AppText>
                <AppText size="small" tone="secondary">
                  {refundMethod === "cash"
                    ? "No reference needed for cash."
                    : "Add a reference if available."}
                </AppText>
              </View>
              <View style={styles.pills}>
                {paymentMethods.map((method) => (
                  <Choice
                    key={method}
                    label={titleCase(method.replace("_", " "))}
                    selected={refundMethod === method}
                    onPress={() => {
                      setRefundError("");
                      setRefundMethod(method);
                      if (method === "cash") setRefundReference("");
                    }}
                  />
                ))}
              </View>
              {refundMethod !== "cash" ? (
                <TextField
                  label="Payment reference (optional)"
                  value={refundReference}
                  onChangeText={(value) => {
                    setRefundError("");
                    setRefundReference(value);
                  }}
                  placeholder="Receipt, M-Pesa code, etc."
                />
              ) : null}
              <TextField
                label="Refund reason"
                value={refundReason}
                onChangeText={(value) => {
                  setRefundError("");
                  setRefundReason(value);
                }}
                placeholder="Why was money refunded?"
              />
              {refundError ? (
                <FeedbackNotice tone="error" message={refundError} />
              ) : null}
              <Button
                label={
                  refundDataReady
                    ? "Record refund"
                    : "Checking available credit…"
                }
                loading={createSaleRefund.isPending || createSupplierRefund.isPending}
                disabled={
                  createSaleRefund.isPending ||
                  createSupplierRefund.isPending ||
                  !refundDataReady ||
                  refundAmountExceedsAvailable ||
                  (isSale
                    ? availableRefundAmount <= 0
                    : !selectedSupplierReturnItem ||
                      selectedSupplierRemainingCredit <= 0)
                }
                onPress={() => void submitCashRefund()}
              />
            </Card>
            ) : null}

            {activeSection === "history" ? (
              <>
            <Card style={styles.section}>
              <View style={styles.sectionHeading}>
                <View
                  style={[
                    styles.sectionIcon,
                    { backgroundColor: `${theme.primary}14` },
                  ]}
                >
                  <Ionicons name="return-down-back-outline" size={19} color={theme.primary} />
                </View>
                <View style={styles.grow}>
                  <AppText weight="semibold">Return history</AppText>
                  <AppText size="small" tone="secondary">
                    Recorded goods returns, cancellations, and issued credits.
                  </AppText>
                </View>
              </View>
              {returns.length ? (
                returns.map((record) => (
                  <View key={record.id} style={[styles.history, { borderColor: theme.border }]}>
                    <View style={styles.historyTop}>
                      <AppText weight="semibold">
                        {formatMoney(record.credit_total, theme.currency)}
                      </AppText>
                      <AppText size="small" tone="secondary">{record.return_date}</AppText>
                    </View>
                    <View style={styles.historyReason}>
                      <View
                        style={[
                          styles.historyTypeBadge,
                          {
                            backgroundColor: `${record.return_type === "undelivered_cancelled" ? theme.secondary : theme.primary}14`,
                          },
                        ]}
                      >
                        <AppText
                          size="small"
                          weight="semibold"
                          style={{
                            color:
                              record.return_type === "undelivered_cancelled"
                                ? theme.secondary
                                : theme.primary,
                          }}
                        >
                          {record.return_type === "undelivered_cancelled"
                            ? "Undelivered cancelled"
                            : "Goods returned"}
                        </AppText>
                      </View>
                      <AppText size="small" tone="secondary">
                        {record.reason}
                      </AppText>
                    </View>
                    {record.items.map((item) => (
                      <AppText key={item.id} size="small" tone="secondary">
                        {item.product_name ?? "Product"} ·{" "}
                        {item.quantity_returned ?? item.quantity ?? "0"}{" "}
                        {record.return_type === "undelivered_cancelled"
                          ? "cancelled"
                          : "returned"}{" "}
                        · credit{" "}
                        {formatMoney(item.credit_amount, theme.currency)}
                      </AppText>
                    ))}
                  </View>
                ))
              ) : (
                <AppText size="small" tone="secondary">
                  No product returns have been recorded yet.
                </AppText>
              )}
            </Card>
            <Card style={styles.section}>
              <View style={styles.sectionHeading}>
                <View
                  style={[
                    styles.sectionIcon,
                    { backgroundColor: `${theme.danger}14` },
                  ]}
                >
                  <Ionicons name="cash-outline" size={19} color={theme.danger} />
                </View>
                <View style={styles.grow}>
                  <AppText weight="semibold">Refund history</AppText>
                  <AppText size="small" tone="secondary">
                    Cash paid out against transaction or return credit.
                  </AppText>
                </View>
              </View>
              {refundHistory.length ? (
                refundHistory.map((refund) => (
                  <View
                    key={refund.id}
                    style={[styles.history, { borderColor: theme.border }]}
                  >
                    <View style={styles.historyTop}>
                      <AppText weight="semibold">
                        {formatMoney(refund.amount, theme.currency)}
                      </AppText>
                      <AppText size="small" tone="secondary">
                        {refund.refund_date}
                      </AppText>
                    </View>
                    <AppText size="small" tone="secondary">
                      {titleCase(refund.payment_method.replace("_", " "))} ·{" "}
                      {refund.reason}
                    </AppText>
                  </View>
                ))
              ) : (
                <AppText size="small" tone="secondary">
                  No cash refunds have been recorded yet.
                </AppText>
              )}
            </Card>
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.choice,
        {
          backgroundColor: selected ? theme.primary : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}
    >
      <AppText
        size="small"
        weight="semibold"
        style={{ color: selected ? theme.onPrimary : theme.text }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function WorkflowTab({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const color = selected ? theme.onPrimary : theme.textSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.sectionTab,
        { backgroundColor: selected ? theme.primary : "transparent" },
      ]}
    >
      <Ionicons name={icon} size={17} color={color} />
      <AppText
        size="small"
        weight="semibold"
        numberOfLines={1}
        style={{ color, flexShrink: 1 }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function FeedbackNotice({
  tone,
  message,
}: {
  tone: "error" | "info" | "success";
  message: string;
}) {
  const { theme } = useTheme();
  const color =
    tone === "error"
      ? theme.danger
      : tone === "success"
        ? theme.success
        : theme.primary;
  const icon =
    tone === "error"
      ? "alert-circle-outline"
      : tone === "success"
        ? "checkmark-circle-outline"
        : "information-circle-outline";
  return (
    <View
      accessibilityRole={tone === "error" ? "alert" : "summary"}
      style={[
        styles.feedbackNotice,
        {
          borderColor: `${color}40`,
          backgroundColor: `${color}0B`,
        },
      ]}
    >
      <Ionicons name={icon} size={19} color={color} />
      <AppText size="small" style={{ color, flex: 1 }}>
        {message}
      </AppText>
    </View>
  );
}

function LocationSummary({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.locationSummary, { borderLeftColor: theme.primary }]}>
      <Ionicons name="location-outline" size={17} color={theme.primary} />
      <View style={styles.grow}>
        <AppText size="small" weight="semibold">{label}</AppText>
        <AppText size="small" tone="secondary">{value}</AppText>
      </View>
    </View>
  );
}

function ReturnPicker({
  label,
  value,
  detail,
  options,
  selectedId,
  onSelect,
}: {
  label: string;
  value: string;
  detail: string;
  options: { id: string; label: string; detail: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.returnPicker}>
      <AppText size="small" weight="semibold">{label}</AppText>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={[
          styles.returnPickerTrigger,
          { borderColor: theme.border, backgroundColor: theme.backgroundElement },
        ]}
      >
        <View style={styles.grow}>
          <AppText weight="semibold">{value}</AppText>
          <AppText size="small" tone="secondary">{detail}</AppText>
        </View>
        <Ionicons name="chevron-down" size={19} color={theme.textSecondary} />
      </Pressable>
      <Modal
        transparent
        animationType="slide"
        visible={open}
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.pickerBackdrop} onPress={() => setOpen(false)}>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={[styles.pickerSheet, { backgroundColor: theme.backgroundElement }]}
          >
            <View style={styles.pickerHeading}>
              <View style={styles.grow}>
                <AppText weight="semibold">{label}</AppText>
                <AppText size="small" tone="secondary">Choose where these chickens belong.</AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Close ${label.toLowerCase()} picker`}
                onPress={() => setOpen(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={24} color={theme.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.pickerOptions} keyboardShouldPersistTaps="handled">
              {options.length ? options.map((option) => {
                const selected = option.id === selectedId;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      onSelect(option.id);
                      setOpen(false);
                    }}
                    style={[
                      styles.pickerOption,
                      {
                        backgroundColor: selected ? theme.backgroundSelected : "transparent",
                        borderBottomColor: theme.border,
                      },
                    ]}
                  >
                    <View style={styles.grow}>
                      <AppText weight="semibold">{option.label}</AppText>
                      <AppText size="small" tone="secondary">{option.detail}</AppText>
                    </View>
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                    ) : null}
                  </Pressable>
                );
              }) : (
                <AppText size="small" tone="secondary" style={styles.emptyOptions}>
                  No eligible choices are available.
                </AppText>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function formatMoney(value: number | string, currency: string) {
  return `${currency} ${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatNumber(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function formatBatchAge(hatchDate: string, referenceDate: string) {
  const hatch = new Date(`${hatchDate}T00:00:00`);
  const reference = new Date(`${referenceDate}T00:00:00`);
  if (Number.isNaN(hatch.getTime()) || Number.isNaN(reference.getTime())) {
    return "age unknown";
  }
  const days = Math.max(
    0,
    Math.floor((reference.getTime() - hatch.getTime()) / 86_400_000),
  );
  if (days < 14) return `${days} ${days === 1 ? "day" : "days"}`;
  if (days < 56) {
    const weeks = Math.floor(days / 7);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  }
  const months =
    (reference.getFullYear() - hatch.getFullYear()) * 12 +
    reference.getMonth() -
    hatch.getMonth() -
    (reference.getDate() < hatch.getDate() ? 1 : 0);
  if (months < 12) {
    const count = Math.max(months, 1);
    return `${count} ${count === 1 ? "month" : "months"}`;
  }
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? "year" : "years"}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 18, gap: 14, paddingBottom: 40 },
  loading: { alignItems: "center", gap: 10, padding: 20 },
  directionCard: {
    padding: 16,
    gap: 14,
    borderRadius: 15,
    borderWidth: 1,
  },
  transactionHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  transactionIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  directionFlow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(127, 127, 127, 0.06)",
  },
  directionParty: { flex: 1, minWidth: 0, gap: 3 },
  grow: { flex: 1, gap: 6 },
  transactionSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  transactionSummaryMetric: { flex: 1, minWidth: 0, gap: 3 },
  metricDivider: { width: StyleSheet.hairlineWidth, height: 34 },
  returnBalanceNote: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 3,
  },
  sectionTabs: {
    flexDirection: "row",
    gap: 5,
    padding: 5,
    borderWidth: 1,
    borderRadius: 14,
  },
  sectionTab: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  section: { padding: 16, gap: 14, borderRadius: 15 },
  refundCard: { padding: 16, gap: 14, borderRadius: 15 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 11 },
  sectionIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  itemCard: { paddingVertical: 14, gap: 13 },
  itemDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  itemHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  maxQuantityButton: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  locationSummary: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderLeftWidth: 2,
  },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  refundHeading: { flexDirection: "row", alignItems: "center", gap: 11 },
  creditSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 13,
    borderWidth: 1,
    borderRadius: 12,
  },
  creditSummaryCopy: { flex: 1, minWidth: 0, gap: 3 },
  fillCreditButton: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  returnCreditList: { gap: 8 },
  returnCreditOption: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 11,
    borderWidth: 1,
    borderRadius: 12,
  },
  returnCreditAmount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  formSectionHeading: { gap: 2 },
  feedbackNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 11,
    borderWidth: 1,
    borderRadius: 11,
  },
  returnPicker: { gap: 7 },
  returnPickerTrigger: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pickerBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.56)",
  },
  pickerSheet: {
    width: "100%",
    maxWidth: 640,
    maxHeight: "78%",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: 12,
  },
  pickerHeading: { flexDirection: "row", alignItems: "center", gap: 16 },
  pickerOptions: { minHeight: 90 },
  pickerOption: {
    minHeight: 64,
    paddingVertical: 11,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emptyOptions: { paddingVertical: 24, paddingHorizontal: 8 },
  history: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12, gap: 6 },
  historyTop: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  historyReason: { alignItems: "flex-start", gap: 7 },
  historyTypeBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
});
