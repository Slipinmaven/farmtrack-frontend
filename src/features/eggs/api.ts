import { apiClient } from "@/lib/api/client";

export type EggCollectionUnit = {
  id: string;
  name: string;
  abbreviation: string;
  conversion_factor: number | string;
  is_base_unit: boolean;
};

export type EggCollectionProduct = {
  id: string;
  name: string;
  product_type: "eggs";
  is_sellable: boolean;
  units: EggCollectionUnit[];
  collected_quantity_in_base_unit: number | string;
  lost_quantity_in_base_unit: number | string;
  sold_quantity_in_base_unit: number | string;
  available_quantity_in_base_unit: number | string;
};

export type EggCollectionBlock = {
  id: string;
  name: string;
  is_active: boolean;
};

export type EggCollectionOptions = {
  products: EggCollectionProduct[];
  blocks: EggCollectionBlock[];
};

export type EggCollectionInput = {
  collected_at: string;
  items: {
    product_id: string;
    block_id: string;
    quantity: string;
    unit_id: string;
    notes?: string;
  }[];
};

export type EggCollectionResult = {
  id: string;
  farm_id: string;
  product_id: string;
  block_id: string;
  quantity: number | string;
  unit_id: string;
  conversion_factor: number | string;
  quantity_in_base_unit: number | string;
  collected_at: string;
  entry_type: "collection" | "opening_stock";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EggLossReason =
  | "broken"
  | "spoiled"
  | "contaminated"
  | "damaged"
  | "discarded"
  | "other";

export type EggLossInput = {
  product_id: string;
  quantity: string;
  unit_id: string;
  loss_date: string;
  reason: EggLossReason;
  notes?: string;
};

export type EggLossBatchInput = {
  product_id: string;
  items: {
    quantity: string;
    unit_id: string;
  }[];
  loss_date: string;
  reason: EggLossReason;
  notes?: string;
};

export type EggLossResult = {
  id: string;
  farm_id: string;
  product_id: string;
  quantity: number | string;
  unit_id: string;
  conversion_factor: number | string;
  quantity_in_base_unit: number | string;
  loss_date: string;
  reason: EggLossReason;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EggSaleInput = {
  transaction_date: string;
  contact_id?: string;
  notes?: string;
  items: {
    product_id: string;
    unit_id: string;
    quantity: string;
    unit_price: string;
  }[];
  payments?: {
    amount: string;
    payment_date: string;
    payment_method: "cash" | "mpesa" | "bank_transfer" | "card" | "other";
    reference_number?: string;
    notes?: string;
  }[];
};

export type EggSaleResult = {
  id: string;
  farm_id: string;
  contact_id: string | null;
  transaction_type: "sale";
  transaction_date: string;
  reference_number: string | null;
  transaction_total: number | string;
  amount_paid: number | string;
  balance_due: number | string;
  credit_balance: number | string;
};

export async function getEggCollectionOptions(
  farmId: string,
): Promise<EggCollectionOptions> {
  const { data } = await apiClient.get<EggCollectionOptions>(
    `/farms/${farmId}/egg-collections/options`,
  );
  return data;
}

export async function getEggCollections(
  farmId: string,
  filters: { from_datetime?: string; to_datetime?: string } = {},
): Promise<EggCollectionResult[]> {
  const { data } = await apiClient.get<EggCollectionResult[]>(
    `/farms/${farmId}/egg-collections`,
    { params: filters },
  );
  return data;
}

export async function createEggCollection(
  farmId: string,
  payload: EggCollectionInput,
): Promise<EggCollectionResult[]> {
  const { data } = await apiClient.post<EggCollectionResult[]>(
    `/farms/${farmId}/egg-collections`,
    payload,
  );
  return data;
}

export async function createEggLoss(
  farmId: string,
  payload: EggLossInput,
): Promise<EggLossResult> {
  const { data } = await apiClient.post<EggLossResult>(
    `/farms/${farmId}/egg-losses`,
    payload,
  );
  return data;
}

export async function createEggLossBatch(
  farmId: string,
  payload: EggLossBatchInput,
): Promise<EggLossResult[]> {
  const { data } = await apiClient.post<EggLossResult[]>(
    `/farms/${farmId}/egg-losses/batch`,
    payload,
  );
  return data;
}

export async function createEggSale(
  farmId: string,
  payload: EggSaleInput,
): Promise<EggSaleResult> {
  const { data } = await apiClient.post<EggSaleResult>(
    `/farms/${farmId}/egg-sales`,
    payload,
  );
  return data;
}
