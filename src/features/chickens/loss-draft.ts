import type { ChickenLossReason, ChickenType } from "@/features/chickens/api";

export type ChickenLossDraftItem = {
  id: string;
  batch_id: string;
  block_id: string;
  batch_name: string;
  block_name: string;
  hatch_date: string | null;
  chicken_type: ChickenType;
  available: number;
  quantity: number;
  reason: ChickenLossReason;
  notes: string;
};

export type ChickenLossDraft = {
  loss_date: string;
  items: ChickenLossDraftItem[];
};

let currentDraft: ChickenLossDraft | null = null;

export function setChickenLossDraft(draft: ChickenLossDraft): void {
  currentDraft = draft;
}

export function getChickenLossDraft(): ChickenLossDraft | null {
  return currentDraft;
}

export function clearChickenLossDraft(): void {
  currentDraft = null;
}
