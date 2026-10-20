import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createBlock,
  deleteBlock,
  getBlock,
  getBlocks,
  updateBlock,
} from "@/features/blocks/api";
import type {
  CreateBlockPayload,
  UpdateBlockPayload,
} from "@/features/blocks/types";
import { queryKeys } from "@/lib/query/keys";

export function useBlocks(
  userId: string | undefined,
  farmId: string | undefined,
) {
  return useQuery({
    queryKey:
      userId && farmId
        ? queryKeys.blocks(userId, farmId)
        : ["blocks", "unselected"],
    queryFn: () => getBlocks(farmId!),
    enabled: Boolean(userId && farmId),
  });
}

export function useBlockSearch(
  userId: string | undefined,
  farmId: string | undefined,
  search: string,
  enabled: boolean,
) {
  const pageSize = 30;
  return useInfiniteQuery({
    queryKey: ["block-search", userId, farmId, search],
    queryFn: ({ pageParam }) => getBlocks(farmId!, search, pageParam, pageSize),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.length === pageSize ? lastPageParam + pageSize : undefined,
    enabled: Boolean(userId && farmId && enabled && search.trim()),
  });
}

export function useCreateBlock(userId: string, farmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateBlockPayload) => createBlock(farmId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.blocks(userId, farmId),
      });
    },
  });
}

export function useBlock(
  userId: string | undefined,
  farmId: string | undefined,
  blockId: string | undefined,
) {
  return useQuery({
    queryKey: ["block", userId, farmId, blockId],
    queryFn: () => getBlock(farmId!, blockId!),
    enabled: Boolean(userId && farmId && blockId),
  });
}

export function useUpdateBlock(userId: string, farmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      blockId,
      payload,
    }: {
      blockId: string;
      payload: UpdateBlockPayload;
    }) => updateBlock(farmId, blockId, payload),
    onSuccess: async (block) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.blocks(userId, farmId),
        }),
        queryClient.invalidateQueries({
          queryKey: ["block", userId, farmId, block.id],
        }),
      ]);
    },
  });
}

export function useDeleteBlock(userId: string, farmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (blockId: string) => deleteBlock(farmId, blockId),
    onSuccess: async (_data, blockId) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.blocks(userId, farmId),
        }),
        queryClient.removeQueries({
          queryKey: ["block", userId, farmId, blockId],
        }),
      ]);
    },
  });
}
