import { apiClient } from "@/lib/api/client";
import type {
  Block,
  BlockDetails,
  CreateBlockPayload,
  UpdateBlockPayload,
} from "@/features/blocks/types";

export async function getBlocks(
  farmId: string,
  search?: string,
  offset?: number,
  limit?: number,
): Promise<Block[]> {
  const { data } = await apiClient.get<Block[]>(`/farms/${farmId}/blocks`, {
    params: {
      search: search?.trim() || undefined,
      offset,
      limit,
    },
  });
  return data;
}

export async function createBlock(
  farmId: string,
  payload: CreateBlockPayload,
): Promise<Block> {
  const { data } = await apiClient.post<Block>(
    `/farms/${farmId}/blocks`,
    payload,
  );
  return data;
}

export async function getBlock(
  farmId: string,
  blockId: string,
): Promise<BlockDetails> {
  const { data } = await apiClient.get<BlockDetails>(
    `/farms/${farmId}/blocks/${blockId}`,
  );
  return data;
}

export async function updateBlock(
  farmId: string,
  blockId: string,
  payload: UpdateBlockPayload,
): Promise<Block> {
  const { data } = await apiClient.patch<Block>(
    `/farms/${farmId}/blocks/${blockId}`,
    payload,
  );
  return data;
}

export async function deleteBlock(
  farmId: string,
  blockId: string,
): Promise<void> {
  await apiClient.delete(`/farms/${farmId}/blocks/${blockId}`);
}
