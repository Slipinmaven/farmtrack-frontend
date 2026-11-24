import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createEggCollection,
  createEggLossBatch,
  createEggSale,
  getEggCollectionOptions,
  getEggCollections,
  type EggSaleInput,
  type EggLossBatchInput,
  type EggCollectionInput,
} from "@/features/eggs/api";

export function useEggCollectionOptions(
  userId: string | undefined,
  farmId: string | undefined,
) {
  return useQuery({
    queryKey: ["egg-collection-options", userId, farmId],
    queryFn: () => getEggCollectionOptions(farmId!),
    enabled: Boolean(userId && farmId),
  });
}

export function useEggCollections(
  userId: string | undefined,
  farmId: string | undefined,
  filters: { from_datetime?: string; to_datetime?: string },
) {
  return useQuery({
    queryKey: ["egg-collections", userId, farmId, filters],
    queryFn: () => getEggCollections(farmId!, filters),
    enabled: Boolean(userId && farmId),
  });
}

export function useCreateEggSale(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: EggSaleInput) => createEggSale(farmId, payload),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["egg-collection-options", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["egg-collections", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["farm-activities", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["notifications", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["notification-unread-count", userId, farmId],
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

export function useCreateEggCollection(
  userId: string,
  farmId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: EggCollectionInput) =>
      createEggCollection(farmId, payload),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["egg-collections", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["egg-collection-options", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["farm-activities", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["notifications", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["notification-unread-count", userId, farmId],
        }),
      ]);
    },
  });
}

export function useCreateEggLoss(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: EggLossBatchInput) =>
      createEggLossBatch(farmId, payload),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["egg-collection-options", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["farm-activities", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["notifications", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["notification-unread-count", userId, farmId],
        }),
      ]);
    },
  });
}
