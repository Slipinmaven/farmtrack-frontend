import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createChickenPurchase,
  recordChickenPurchasePayment,
  createChickenLoss,
  createChickenMovement,
  createChickenBatchMovement,
  createChickenPurchaseReceipt,
  createChickenSaleDelivery,
  createChickenSale,
  getChickenPurchaseDetails,
  getChickenLosses,
  getChickenPurchaseOptions,
  getChickenSaleDetails,
  getChickenSaleFulfillment,
  getChickenSaleOptions,
  getChickenSettlementOptions,
  getChickenMovementHistory,
  type ChickenPurchaseInput,
  type ChickenPurchasePaymentInput,
  type ChickenLossInput,
  type ChickenMovementInput,
  type ChickenBatchMovementInput,
  type ChickenPurchaseReceiptInput,
  type ChickenSaleDeliveryInput,
  type ChickenSaleInput,
  type ChickenSettlementSelection,
  type ChickenMovementHistoryFilters,
} from "@/features/chickens/api";
import { queryKeys } from "@/lib/query/keys";

export function useChickenPurchaseOptions(
  userId: string | undefined,
  farmId: string | undefined,
) {
  return useQuery({
    queryKey: ["chicken-purchase-options", userId, farmId],
    queryFn: () => getChickenPurchaseOptions(farmId!),
    enabled: Boolean(userId && farmId),
  });
}

export function useChickenSaleOptions(
  userId: string | undefined,
  farmId: string | undefined,
) {
  return useQuery({
    queryKey: ["chicken-sale-options", userId, farmId],
    queryFn: () => getChickenSaleOptions(farmId!),
    enabled: Boolean(userId && farmId),
  });
}

export function useChickenLosses(
  userId: string | undefined,
  farmId: string | undefined,
  filters: { from_date?: string; to_date?: string },
) {
  return useQuery({
    queryKey: ["chicken-losses", userId, farmId, filters],
    queryFn: () => getChickenLosses(farmId!, filters),
    enabled: Boolean(userId && farmId),
  });
}

export function useChickenSettlementOptions(
  userId: string | undefined,
  farmId: string | undefined,
  selection: ChickenSettlementSelection | undefined,
  search: string,
  batchId?: string,
  blockId?: string,
  offset = 0,
) {
  return useQuery({
    queryKey: [
      "chicken-settlement-options",
      userId,
      farmId,
      selection,
      search,
      batchId,
      blockId,
      offset,
    ],
    queryFn: () =>
      getChickenSettlementOptions(
        farmId!,
        selection!,
        search,
        batchId,
        blockId,
        offset,
      ),
    enabled: Boolean(userId && farmId && selection),
  });
}

export function useChickenMovementHistory(
  userId: string | undefined,
  farmId: string | undefined,
  filters: ChickenMovementHistoryFilters,
) {
  return useQuery({
    queryKey: [
      "chicken-movement-history",
      userId,
      farmId,
      filters,
    ],
    queryFn: () => getChickenMovementHistory(farmId!, filters),
    enabled: Boolean(userId && farmId && filters.blockId),
  });
}

export function useChickenPurchaseDetails(
  userId: string | undefined,
  farmId: string | undefined,
  transactionId: string | undefined,
) {
  return useQuery({
    queryKey: ["chicken-purchase-details", userId, farmId, transactionId],
    queryFn: () => getChickenPurchaseDetails(farmId!, transactionId!),
    enabled: Boolean(userId && farmId && transactionId),
  });
}

export function useChickenSaleDetails(
  userId: string | undefined,
  farmId: string | undefined,
  transactionId: string | undefined,
) {
  return useQuery({
    queryKey: ["chicken-sale-details", userId, farmId, transactionId],
    queryFn: () => getChickenSaleDetails(farmId!, transactionId!),
    enabled: Boolean(userId && farmId && transactionId),
  });
}

export function useChickenSaleFulfillment(
  userId: string | undefined,
  farmId: string | undefined,
  transactionId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ["chicken-sale-fulfillment", userId, farmId, transactionId],
    queryFn: () => getChickenSaleFulfillment(farmId!, transactionId!),
    enabled: Boolean(userId && farmId && transactionId && enabled),
  });
}

export function useCreateChickenPurchase(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChickenPurchaseInput) =>
      createChickenPurchase(farmId, payload),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["chicken-sale-options", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-purchase-options", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: queryKeys.blocks(userId, farmId),
        }),
        client.invalidateQueries({
          queryKey: ["farm-activities", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["receipt-history", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["outstanding-balances", userId, farmId],
        }),
      ]);
    },
  });
}

export function useRecordChickenPurchasePayment(
  userId: string,
  farmId: string,
  transactionId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChickenPurchasePaymentInput) =>
      recordChickenPurchasePayment(farmId, transactionId, payload),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["chicken-purchase-details", userId, farmId, transactionId],
        }),
        client.invalidateQueries({
          queryKey: ["farm-activities", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["receipt-history", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["outstanding-balances", userId, farmId],
        }),
      ]);
    },
  });
}

export function useCreateChickenPurchaseReceipt(
  userId: string,
  farmId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChickenPurchaseReceiptInput) =>
      createChickenPurchaseReceipt(farmId, payload),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["farm-activities", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-purchase-options", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-sale-options", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-purchase-details", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: queryKeys.blocks(userId, farmId),
        }),
        client.invalidateQueries({
          queryKey: ["block", userId, farmId],
        }),
      ]);
    },
  });
}

export function useCreateChickenSale(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChickenSaleInput) =>
      createChickenSale(farmId, payload),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["farm-activities", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-losses", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-sale-options", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-purchase-options", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: queryKeys.blocks(userId, farmId),
        }),
        client.invalidateQueries({ queryKey: ["block", userId, farmId] }),
        client.invalidateQueries({
          queryKey: ["notifications", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["notification-unread-count", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["receipt-history", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["pending-sale-deliveries", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["outstanding-balances", userId, farmId],
        }),
      ]);
    },
  });
}

export function useCreateChickenLoss(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChickenLossInput) =>
      createChickenLoss(farmId, payload),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["farm-activities", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-sale-options", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-purchase-options", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: queryKeys.blocks(userId, farmId),
        }),
        client.invalidateQueries({ queryKey: ["block", userId, farmId] }),
        client.invalidateQueries({
          queryKey: ["pending-sale-deliveries", userId, farmId],
        }),
      ]);
    },
  });
}

export function useCreateChickenMovement(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChickenMovementInput) =>
      createChickenMovement(farmId, payload),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["farm-activities", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-sale-options", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-purchase-options", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: queryKeys.blocks(userId, farmId),
        }),
        client.invalidateQueries({ queryKey: ["block", userId, farmId] }),
        client.invalidateQueries({
          queryKey: ["chicken-movement-history", userId, farmId],
        }),
      ]);
    },
  });
}

export function useCreateChickenBatchMovement(
  userId: string,
  farmId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChickenBatchMovementInput) =>
      createChickenBatchMovement(farmId, payload),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["farm-activities", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-sale-options", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-purchase-options", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: queryKeys.blocks(userId, farmId),
        }),
        client.invalidateQueries({ queryKey: ["block", userId, farmId] }),
        client.invalidateQueries({
          queryKey: ["chicken-movement-history", userId, farmId],
        }),
      ]);
    },
  });
}

export function useCreateChickenSaleDelivery(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      transactionId,
      payload,
    }: {
      transactionId: string;
      payload: ChickenSaleDeliveryInput;
    }) => createChickenSaleDelivery(farmId, transactionId, payload),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["farm-activities", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-sale-details", userId, farmId, variables.transactionId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-sale-fulfillment", userId, farmId, variables.transactionId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-sale-options", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: queryKeys.blocks(userId, farmId),
        }),
        client.invalidateQueries({ queryKey: ["block", userId, farmId] }),
        client.invalidateQueries({
          queryKey: ["pending-sale-deliveries", userId, farmId],
        }),
      ]);
    },
  });
}
