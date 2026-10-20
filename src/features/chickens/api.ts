import { apiClient } from "@/lib/api/client";
import type { Contact, Product } from "@/features/management/api";

export type ChickenType =
  | "layers"
  | "broiler"
  | "kienyeji"
  | "breeder"
  | "other";
export type ChickenAgeUnit = "days" | "weeks" | "months" | "years";
export type ChickenPaymentMethod =
  | "cash"
  | "mpesa"
  | "bank_transfer"
  | "card"
  | "other";

export type ChickenPurchaseBlock = {
  id: string;
  name: string;
  capacity: number;
  over_capacity_limit: number;
  maximum_chickens: number;
  current_chickens: number;
  available_capacity: number;
};

export type ChickenPurchaseBatch = {
  id: string;
  name: string;
  chicken_type: ChickenType;
  hatch_date: string | null;
};

export type ChickenPurchaseOptions = {
  products: Product[];
  suppliers: Contact[];
  blocks: ChickenPurchaseBlock[];
  batches: ChickenPurchaseBatch[];
};

export type ChickenSaleBatchStock = {
  block_id: string;
  block_name: string;
  quantity: number;
};

export type ChickenSaleBatch = {
  id: string;
  name: string;
  chicken_type: ChickenType;
  hatch_date: string | null;
  estimated_unit_cost: number | string | null;
  stocks: ChickenSaleBatchStock[];
};

export type ChickenSaleOptions = {
  products: Product[];
  blocks: ChickenPurchaseBlock[];
  batches: ChickenSaleBatch[];
};

export type ChickenSettlementSelection =
  | "receive_batch"
  | "issue_batch"
  | "receive_block"
  | "issue_block";

export type ChickenSettlementOptions = {
  batches: {
    id: string;
    name: string;
    chicken_type: ChickenType;
    hatch_date: string | null;
    total_quantity: number;
  }[];
  blocks: {
    id: string;
    name: string;
    current_chickens: number;
    available_capacity: number;
    batch_quantity: number | null;
  }[];
  has_more: boolean;
};

export type ChickenLossReason =
  | "disease"
  | "natural_death"
  | "predator"
  | "injury"
  | "accident"
  | "culling"
  | "missing"
  | "other";

export type ChickenLossInput = {
  loss_date: string;
  items: {
    batch_id: string;
    block_id: string;
    quantity: number;
    reason: ChickenLossReason;
    notes?: string;
  }[];
};

export type ChickenLossResult = {
  id: string;
  farm_id: string;
  batch_id: string;
  block_id: string;
  quantity: number;
  loss_date: string;
  reason: ChickenLossReason;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ChickenMovementInput = {
  batch_id: string;
  from_block_id: string;
  to_block_id: string;
  quantity: number;
  movement_date: string;
  reason?: string;
  notes?: string;
};

export type ChickenBatchMovementInput = {
  from_block_id: string;
  to_block_id: string;
  movement_date: string;
  items: { batch_id: string; quantity: number }[];
  reason?: string;
  notes?: string;
};

export type ChickenMovementResult = {
  id: string;
  farm_id: string;
  batch_id: string;
  from_block_id: string;
  to_block_id: string;
  quantity: number;
  movement_date: string;
  reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ChickenMovementDirection = "all" | "incoming" | "outgoing";

export type ChickenMovementHistoryFilters = {
  blockId: string;
  direction: ChickenMovementDirection;
  search: string;
  from_date?: string;
  to_date?: string;
  limit: number;
  offset: number;
};

export type ChickenMovementHistory = {
  items: {
    id: string;
    batch_id: string;
    batch_name: string;
    from_block_id: string;
    from_block_name: string;
    to_block_id: string;
    to_block_name: string;
    quantity: number;
    movement_date: string;
    reason: string | null;
    notes: string | null;
  }[];
  total_count: number;
  limit: number;
  offset: number;
};

export type ChickenSaleAllocationInput = {
  batch_id: string;
  block_id: string;
  quantity: number;
};

export type ChickenSaleItemInput = {
  product_id: string;
  chicken_type: ChickenType;
  quantity: number;
  unit_id: string;
  unit_price: number | string;
  batch_allocations: ChickenSaleAllocationInput[];
};

export type ChickenSaleInput = {
  transaction_date: string;
  transaction_time?: string | null;
  customer_id?: string | null;
  notes?: string;
  items: ChickenSaleItemInput[];
  payments: ChickenPurchasePaymentInput[];
  discount_type?: "fixed" | "percentage";
  discount_value?: number | string;
  discount_reason?: string;
};

export type ChickenSaleResult = {
  id: string;
  transaction_date: string;
  reference_number: string | null;
  transaction_total: number | string;
  amount_paid: number | string;
  balance_due: number | string;
  credit_balance: number | string;
  items: {
    id: string;
    quantity: number | string;
    conversion_factor: number | string;
  }[];
};

export type ChickenSaleDetails = {
  transaction: Omit<ChickenSaleResult, "items"> & {
    farm_id: string;
    contact_id: string | null;
    transaction_type: "sale";
    status: string;
    transaction_time: string | null;
    notes: string | null;
    discount_type: "fixed" | "percentage" | null;
    discount_value: number | string;
    discount_amount: number | string;
    discount_reason: string | null;
    created_at: string;
    updated_at: string;
    items: {
      id: string;
      quantity: number | string;
      conversion_factor: number | string;
      product_id: string;
      unit_id: string;
      chicken_type: ChickenType | null;
      ordered_base_quantity: number | string;
      unit_price: number | string;
      subtotal_amount: number | string;
      discount_amount: number | string;
      total_amount: number | string;
      notes: string | null;
      quantity_received: number | string;
      quantity_remaining: number | string;
      product_name: string | null;
      product_type:
        | "eggs"
        | "chickens"
        | "feed"
        | "medication"
        | "equipment"
        | "other"
        | null;
      unit_name: string | null;
    }[];
    payments: {
      id: string;
      amount: number | string;
      payment_date: string;
      payment_time: string | null;
      payment_method: ChickenPaymentMethod;
      reference_number: string | null;
      notes: string | null;
    }[];
  };
  customer_name: string | null;
  deliveries: {
    id: string;
    delivered_date: string;
    delivered_time: string | null;
    notes: string | null;
    items: {
      id: string;
      transaction_item_id: string;
      quantity: number | string;
      batch_allocations: {
        batch_id: string;
        batch_name: string;
        block_id: string;
        block_name: string;
        quantity: number;
      }[];
    }[];
  }[];
  outstanding_customer_balances: {
    id: string;
    reference_number: string | null;
    transaction_date: string;
    transaction_total: number | string;
    amount_paid: number | string;
    balance_due: number | string;
    credit_balance: number | string;
  }[];
  customer_balance_total: number | string;
  customer_credit_total: number | string;
};

export type ChickenSaleFulfillment = {
  transaction_id: string;
  fully_delivered: boolean;
  fully_resolved: boolean;
  items: {
    transaction_item_id: string;
    chicken_type: ChickenType | null;
    ordered_quantity: number | string;
    delivered_quantity: number | string;
    returned_quantity: number | string;
    net_delivered_quantity: number | string;
    cancelled_quantity: number | string;
    outstanding_quantity: number | string;
  }[];
};

export type ChickenSaleDeliveryInput = {
  delivered_date: string;
  delivered_time?: string | null;
  notes?: string;
  items: {
    transaction_item_id: string;
    quantity_delivered: number;
    batch_allocations: { batch_id: string; block_id: string; quantity: number }[];
  }[];
};

export type ChickenSaleDeliveryResult = {
  id: string;
  transaction_id: string;
  delivered_date: string;
  delivered_time: string | null;
  notes: string | null;
  items: {
    id: string;
    transaction_item_id: string;
    quantity_delivered: number | string;
    remaining_quantity: number | string;
    batch_allocations: {
      batch_id: string;
      block_id: string;
      quantity: number;
    }[];
  }[];
};

export type ChickenPurchaseItemInput = {
  product_id: string;
  chicken_type: ChickenType;
  quantity: number;
  unit_id: string;
  unit_price: number | string;
  notes?: string;
};

export type ChickenPurchasePaymentInput = {
  amount: number | string;
  payment_date: string;
  payment_method: ChickenPaymentMethod;
  reference_number?: string;
};

export type ChickenPurchaseInput = {
  transaction_date: string;
  notes?: string;
  supplier_id?: string;
  discount_type?: "fixed" | "percentage";
  discount_value?: number | string;
  discount_reason?: string;
  overpayment_confirmed?: boolean;
  items: ChickenPurchaseItemInput[];
  payments: ChickenPurchasePaymentInput[];
};

export type ChickenPurchaseResult = {
  id: string;
  transaction_date: string;
  status: string;
  notes: string | null;
  reference_number: string | null;
  discount_type: "fixed" | "percentage" | null;
  discount_value: number | string;
  discount_amount: number | string;
  discount_reason: string | null;
  transaction_total: number | string;
  amount_paid: number | string;
  balance_due: number | string;
  items: {
    id: string;
    product_id: string;
    unit_id: string;
    batch_id?: string | null;
    hatch_date?: string | null;
    quantity: number;
    chicken_type: ChickenType | null;
    product_name?: string | null;
    unit_name?: string | null;
    unit_price: number | string;
    subtotal_amount: number | string;
    discount_amount: number | string;
    total_amount: number | string;
    notes: string | null;
    quantity_received: number;
    quantity_remaining: number;
    ordered_base_quantity?: number | string;
  }[];
  contact_id: string | null;
  credit_balance: number | string;
  payments: {
    id?: string;
    amount: number | string;
    payment_date?: string;
    payment_time?: string | null;
    payment_method: ChickenPaymentMethod;
    reference_number: string | null;
    notes?: string | null;
  }[];
};

export type ChickenPurchaseDetails = {
  transaction: ChickenPurchaseResult;
  supplier_name: string | null;
  receipts: {
    id: string;
    transaction_id: string;
    received_date: string;
    received_time: string | null;
    notes: string | null;
    created_at: string;
    items: {
      id: string;
      transaction_item_id: string;
      quantity_received: number | string;
      batch_id: string | null;
      batch_name: string | null;
      hatch_date: string | null;
      remaining_quantity: number | string;
      block_allocations: {
        block_id: string;
        quantity: number;
        block_name: string | null;
      }[];
    }[];
  }[];
  outstanding_supplier_balances: {
    id: string;
    reference_number: string | null;
    transaction_date: string;
    transaction_total: number | string;
    amount_paid: number | string;
    balance_due: number | string;
    credit_balance: number | string;
  }[];
  supplier_balance_total: number | string;
  supplier_credit_total: number | string;
};

export type ChickenPurchaseReceiptInput = {
  transaction_id: string;
  received_date: string;
  notes?: string;
  items: {
    transaction_item_id: string;
    quantity_received: number;
    batch_assignment:
      | {
          action: "CREATE";
          new_batch: {
            name?: string;
            chicken_type: ChickenType;
            age?: number;
            age_unit?: ChickenAgeUnit;
            notes?: string;
          };
        }
      | { action: "USE_EXISTING"; batch_id: string };
    block_allocations: { block_id: string; quantity: number }[];
  }[];
};

export type ChickenPurchaseReceiptResult = {
  id: string;
  transaction_id: string;
  received_date: string;
  received_time: string | null;
  notes: string | null;
  items: {
    id: string;
    transaction_item_id: string;
    quantity_received: number;
    batch_id: string | null;
    batch_name: string | null;
    hatch_date: string | null;
    remaining_quantity: number;
    block_allocations: { block_id: string; quantity: number }[];
  }[];
};

export async function getChickenPurchaseOptions(
  farmId: string,
): Promise<ChickenPurchaseOptions> {
  const { data } = await apiClient.get<ChickenPurchaseOptions>(
    `/farms/${farmId}/chicken-purchases/options`,
  );
  return data;
}

export async function getChickenSaleOptions(
  farmId: string,
): Promise<ChickenSaleOptions> {
  const { data } = await apiClient.get<ChickenSaleOptions>(
    `/farms/${farmId}/chicken-sales/options`,
  );
  return data;
}

export async function getChickenSettlementOptions(
  farmId: string,
  selection: ChickenSettlementSelection,
  search: string,
  batchId?: string,
  blockId?: string,
  offset = 0,
): Promise<ChickenSettlementOptions> {
  const { data } = await apiClient.get<ChickenSettlementOptions>(
    `/farms/${farmId}/chicken-sales/settlement-options`,
    {
      params: {
        selection,
        search: search || undefined,
        batch_id: batchId,
        block_id: blockId,
        offset,
      },
    },
  );
  return data;
}

export async function createChickenLoss(
  farmId: string,
  payload: ChickenLossInput,
): Promise<ChickenLossResult[]> {
  const { data } = await apiClient.post<ChickenLossResult[]>(
    `/farms/${farmId}/chicken-losses`,
    payload,
  );
  return data;
}

export async function createChickenMovement(
  farmId: string,
  payload: ChickenMovementInput,
): Promise<ChickenMovementResult> {
  const { data } = await apiClient.post<ChickenMovementResult>(
    `/farms/${farmId}/chicken-movements`,
    payload,
  );
  return data;
}

export async function createChickenBatchMovement(
  farmId: string,
  payload: ChickenBatchMovementInput,
): Promise<ChickenMovementResult[]> {
  const { data } = await apiClient.post<ChickenMovementResult[]>(
    `/farms/${farmId}/chicken-movements/batch`,
    payload,
  );
  return data;
}

export async function getChickenMovementHistory(
  farmId: string,
  filters: ChickenMovementHistoryFilters,
): Promise<ChickenMovementHistory> {
  const { blockId, ...params } = filters;
  const { data } = await apiClient.get<ChickenMovementHistory>(
    `/farms/${farmId}/chicken-movements/blocks/${blockId}`,
    { params },
  );
  return data;
}

export async function createChickenSale(
  farmId: string,
  payload: ChickenSaleInput,
): Promise<ChickenSaleResult> {
  const { data } = await apiClient.post<ChickenSaleResult>(
    `/farms/${farmId}/chicken-sales`,
    payload,
  );
  return data;
}

export async function getChickenPurchaseDetails(
  farmId: string,
  transactionId: string,
): Promise<ChickenPurchaseDetails> {
  const { data } = await apiClient.get<ChickenPurchaseDetails>(
    `/farms/${farmId}/chicken-purchases/${transactionId}`,
  );
  return data;
}

export async function getChickenSaleDetails(
  farmId: string,
  transactionId: string,
): Promise<ChickenSaleDetails> {
  const { data } = await apiClient.get<ChickenSaleDetails>(
    `/farms/${farmId}/chicken-sales/${transactionId}`,
  );
  return data;
}

export async function getChickenSaleFulfillment(
  farmId: string,
  transactionId: string,
): Promise<ChickenSaleFulfillment> {
  const { data } = await apiClient.get<ChickenSaleFulfillment>(
    `/farms/${farmId}/sales/${transactionId}/fulfillment`,
  );
  return data;
}

export async function createChickenSaleDelivery(
  farmId: string,
  transactionId: string,
  payload: ChickenSaleDeliveryInput,
): Promise<ChickenSaleDeliveryResult> {
  const { data } = await apiClient.post<ChickenSaleDeliveryResult>(
    `/farms/${farmId}/sales/${transactionId}/deliveries`,
    payload,
  );
  return data;
}

export async function createChickenPurchase(
  farmId: string,
  payload: ChickenPurchaseInput,
): Promise<ChickenPurchaseResult> {
  const { data } = await apiClient.post<ChickenPurchaseResult>(
    `/farms/${farmId}/chicken-purchases`,
    payload,
  );
  return data;
}

export async function createChickenPurchaseReceipt(
  farmId: string,
  payload: ChickenPurchaseReceiptInput,
): Promise<ChickenPurchaseReceiptResult> {
  const { data } = await apiClient.post<ChickenPurchaseReceiptResult>(
    `/farms/${farmId}/purchase-receipts`,
    payload,
  );
  return data;
}
