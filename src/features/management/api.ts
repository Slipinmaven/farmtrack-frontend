import { apiClient } from "@/lib/api/client";

export type ProductType =
  | "eggs"
  | "chickens"
  | "feed"
  | "medication"
  | "equipment"
  | "other";
export type ContactRole = "customer" | "supplier";

export type Unit = {
  id: string;
  name: string;
  abbreviation: string;
  created_at: string;
  updated_at: string;
};

export type ProductUnit = {
  id: string;
  unit_id: string;
  unit_name: string;
  unit_abbreviation: string;
  conversion_factor: number;
  is_base_unit: boolean;
};

export type Product = {
  id: string;
  farm_id: string;
  name: string;
  product_type: ProductType;
  description: string | null;
  is_active: boolean;
  is_sellable: boolean;
  product_units: ProductUnit[];
  created_at: string;
  updated_at: string;
};

export type InventoryMovement = {
  id: string;
  product_id: string;
  product_name: string;
  product_type: ProductType;
  quantity_delta: string;
  unit_name: string;
  unit_abbreviation: string;
  movement_type:
    | "opening_balance"
    | "receipt"
    | "sale"
    | "consumption"
    | "loss"
    | "customer_return"
    | "supplier_return"
    | "settlement_received"
    | "settlement_issued"
    | "adjustment"
    | "valuation";
  source_type: string | null;
  source_id: string | null;
  source_item_id: string | null;
  occurred_on: string;
  notes: string | null;
  created_at: string;
};

export type InventoryProductBalance = {
  product_id: string;
  product_name: string;
  product_type: ProductType;
  unit_name: string;
  unit_abbreviation: string;
  quantity: string;
};

export type InventoryOverview = {
  items: InventoryProductBalance[];
  movements: InventoryMovement[];
};

export type ProductConsumption = {
  id: string;
  farm_id: string;
  product_id: string;
  unit_id: string;
  quantity: string;
  conversion_factor: string;
  quantity_in_base_unit: string;
  block_id: string | null;
  batch_id: string | null;
  consumption_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductConsumptionInput = {
  product_id: string;
  unit_id: string;
  allocations: {
    quantity: string;
    block_id?: string;
    batch_id?: string;
  }[];
  consumption_date: string;
  notes?: string;
};

export type ExpenseCategory = {
  id: string;
  key: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
};

export type ExpensePayment = {
  id: string;
  kind: "payment" | "refund";
  amount: string;
  payment_date: string;
  payment_method: SettlementPaymentMethod;
  reference_number: string | null;
  reason: string | null;
  created_at: string;
};

export type ExpenseRecord = {
  id: string;
  farm_id: string;
  name: string;
  category: string;
  category_name: string;
  amount: string;
  amount_paid: string;
  balance_due: string;
  payment_status: "paid" | "partial" | "unpaid" | "cancelled";
  expense_date: string;
  contact_id: string | null;
  contact_name: string | null;
  block_id: string | null;
  block_name: string | null;
  purchase_transaction_id: string | null;
  purchase_reference: string | null;
  receipt_reference: string | null;
  notes: string | null;
  payments: ExpensePayment[];
  canceled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpensePage = {
  items: ExpenseRecord[];
  total_count: number;
  offset: number;
  limit: number;
};

export type ExpenseSummary = {
  expense_count: number;
  total_amount: string;
  amount_paid: string;
  balance_due: string;
  categories: {
    key: string;
    name: string;
    expense_count: number;
    total_amount: string;
    amount_paid: string;
    balance_due: string;
  }[];
};

export type ExpenseInput = {
  name: string;
  category: string;
  amount: string;
  expense_date: string;
  contact_id?: string;
  block_id?: string;
  receipt_reference?: string;
  initial_payment?: {
    amount: string;
    payment_date: string;
    payment_method: SettlementPaymentMethod;
    reference_number?: string;
  };
  notes?: string;
};

export type ExpenseUpdateInput = Partial<
  Omit<ExpenseInput, "contact_id" | "block_id" | "receipt_reference" | "notes">
> & {
  contact_id?: string | null;
  block_id?: string | null;
  receipt_reference?: string | null;
  notes?: string | null;
};
export type ExpensePaymentInput = {
  amount: string;
  payment_date: string;
  payment_method: SettlementPaymentMethod;
  reference_number?: string;
};
export type ExpenseRefundInput = ExpensePaymentInput & { reason: string };
export type ExpenseCategoryInput = { name: string };
export type ExpenseCategoryUpdateInput = {
  name?: string;
  is_active?: boolean;
};

export type InventoryOpeningSetupStatus = {
  chickens: { eligible: boolean; completed_at: string | null };
  eggs: { eligible: boolean; completed_at: string | null };
};

export type InventoryOpeningSetupInput =
  | {
      species: "chickens";
      setup_date: string;
      chicken_batches: {
        name: string;
        chicken_type: "layers" | "broiler" | "kienyeji" | "breeder" | "other";
        breed?: string;
        hatch_date?: string;
        unit_cost?: string;
        allocations: { block_id: string; quantity: number }[];
      }[];
      egg_stock: [];
    }
  | {
      species: "eggs";
      setup_date: string;
      chicken_batches: [];
      egg_stock: {
        product_id: string;
        block_id: string;
        unit_id: string;
        quantity: string;
        unit_cost?: string;
      }[];
    };

export type InventoryOpeningSetupResult = {
  species: "chickens" | "eggs";
  setup_date: string;
  record_count: number;
};

export type InventoryPurchaseInput = {
  transaction_date: string;
  supplier_id?: string;
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
    payment_method: SettlementPaymentMethod;
    reference_number?: string;
  }[];
};

export type ProfitabilityStock = {
  product_id: string;
  product_name: string;
  product_type: ProductType;
  unit_name: string;
  unit_abbreviation: string;
  quantity: string;
  valued_quantity: string;
  valued_cost: string;
  unvalued_quantity: string;
};

export type ProfitabilityReport = {
  farm_id: string;
  from_date: string;
  to_date: string;
  accounting_basis: string;
  inventory_cost_method: string;
  complete: boolean;
  incompleteness_reasons: string[];
  gross_sales: string;
  sales_credits: string;
  net_revenue: string;
  cost_of_goods_sold: string;
  product_consumption_cost: string;
  egg_production_cost_allocated: string;
  unallocated_consumption_expense: string;
  operating_expenses: string;
  inventory_losses: string;
  net_profit: string | null;
  closing_stock_as_of: string;
  closing_stock: ProfitabilityStock[];
  closing_stock_valued_cost: string;
  closing_stock_unvalued_quantity: string;
  untracked_chicken_quantity: string;
  untracked_egg_quantity: string;
  overrepresented_egg_quantity: string;
  customer_cash_refunds_excluded: string;
  supplier_cash_refunds_excluded: string;
  supplier_return_credits_excluded: string;
};

export type ProfitabilityStockValuationInput = {
  product_id: string;
  unit_cost: string;
};

export type ProfitabilityStockValuationResult = {
  product_id: string;
  product_name: string;
  unit_name: string;
  unit_abbreviation: string;
  valuation_date: string;
  quantity_valued: string;
  unit_cost: string;
  inventory_movement_id: string;
};

export type InventoryPurchaseResult = {
  id: string;
  reference_number: string | null;
  transaction_total: string;
  amount_paid: string;
  balance_due: string;
  credit_balance: string;
};

export type SettlementDirection = "contact_to_farm" | "farm_to_contact";
export type SettlementPaymentMethod =
  | "cash"
  | "mpesa"
  | "bank_transfer"
  | "card"
  | "other";

export type SettlementLineInput =
  | {
      kind: "cash";
      amount: string;
      payment_method: SettlementPaymentMethod;
      reference_number?: string;
    }
  | {
      kind: "goods";
      product_id: string;
      unit_id: string;
      quantity: string;
      agreed_unit_value: string;
      discount_type?: "fixed" | "percentage";
      discount_value?: string;
      discount_reason?: string;
      chicken_placement?: {
        mode: "receive_existing" | "receive_new" | "issue";
        batch_id?: string;
        new_batch?: {
          name?: string;
          chicken_type: "layers" | "broiler" | "kienyeji" | "breeder" | "other";
          age: number;
          age_unit: "days" | "weeks" | "months" | "years";
        };
        allocations: {
          batch_id?: string;
          block_id: string;
          quantity: number;
        }[];
      };
    }
  | { kind: "service"; description: string; value: string };

export type SettlementLineSnapshot = {
  id: string;
  kind: "cash" | "goods" | "service";
  amount?: string;
  value: string;
  payment_method?: SettlementPaymentMethod;
  reference_number?: string | null;
  description?: string;
  product_id?: string;
  product_name?: string;
  unit_name?: string;
  unit_abbreviation?: string;
  quantity?: string;
  quantity_in_base_unit?: string;
  base_unit_name?: string;
  base_unit_abbreviation?: string;
  agreed_unit_value?: string;
  gross_value?: string;
  discount_type?: "fixed" | "percentage" | null;
  discount_value?: string;
  discount_amount?: string;
  discount_reason?: string | null;
  chicken_placement?: {
    mode: "receive" | "issue";
    new_batch?: {
      chicken_type: "layers" | "broiler" | "kienyeji" | "breeder" | "other";
      hatch_date: string | null;
    };
    allocations: {
      batch_id: string;
      batch_name: string;
      chicken_type: "layers" | "broiler" | "kienyeji" | "breeder" | "other";
      block_id: string;
      block_name: string;
      quantity: number;
    }[];
  };
};

export type TransactionSettlement = {
  id: string;
  transaction_id: string;
  direction: SettlementDirection;
  settlement_date: string;
  total_value: string;
  lines: SettlementLineSnapshot[];
  reason: string;
  notes: string | null;
  created_at: string;
};

export type TransactionSettlementCreatePayload = {
  direction: SettlementDirection;
  settlement_date: string;
  reason: string;
  notes?: string;
  lines: SettlementLineInput[];
};

export type TransactionSettlementResult = {
  settlement: TransactionSettlement;
  amount_paid: string;
  balance_due: string;
  credit_balance: string;
};

export type SaleReturnInput = {
  return_type: "delivered_return" | "undelivered_cancelled";
  return_date: string;
  reason: string;
  notes?: string;
  items: {
    transaction_item_id: string;
    quantity: string;
    batch_allocations?: {
      batch_id: string;
      block_id: string;
      quantity: number;
    }[];
  }[];
};

export type PurchaseReturnInput = {
  return_date: string;
  reason: string;
  notes?: string;
  items: {
    transaction_item_id: string;
    quantity_returned: string;
    block_allocations?: { block_id: string; quantity: number }[];
  }[];
};

export type RecordedReturnItem = {
  id: string;
  transaction_item_id: string;
  product_id?: string | null;
  product_name?: string | null;
  quantity?: string;
  quantity_returned?: string;
  credit_amount: string;
  batch_allocations?: { batch_id: string; block_id: string; quantity: number }[];
  block_allocations?: { block_id: string; quantity: number }[];
};

export type RecordedReturn = {
  id: string;
  transaction_id: string;
  return_type?: "delivered_return" | "undelivered_cancelled";
  return_date: string;
  reason: string;
  notes: string | null;
  credit_total: string;
  items: RecordedReturnItem[];
};

export type CashRefundInput = {
  amount: string;
  refund_date: string;
  payment_method: SettlementPaymentMethod;
  reference_number?: string;
  reason: string;
  notes?: string;
};

export type SupplierCashRefundInput = CashRefundInput & {
  purchase_return_item_id: string;
};

export type CashRefundRecord = CashRefundInput & {
  id: string;
  transaction_id: string;
  created_at: string;
  purchase_return_item_id?: string;
};

export type InventoryAdjustmentPayload = {
  product_id: string;
  unit_id: string;
  quantity: string;
  direction: "in" | "out";
  occurred_on: string;
  reason: string;
};

export type Contact = {
  id: string;
  farm_id: string;
  name: string;
  roles: ContactRole[];
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ContactTransactionHistoryItem = {
  id: string;
  transaction_type: "sale" | "purchase";
  status: string;
  transaction_date: string;
  reference_number: string | null;
  item_count: number;
  transaction_total: number | string;
  amount_paid: number | string;
  balance_due: number | string;
  credit_balance: number | string;
};

export type ContactTransactionHistory = {
  items: ContactTransactionHistoryItem[];
  total_count: number;
  limit: number;
  offset: number;
};

export type ContactRoleRecord = {
  id: string;
  contact_id: string;
  role: ContactRole;
  created_at: string;
  updated_at: string;
};

export type SecuritySettings = {
  id: string;
  user_id: string;
  biometric_unlock_enable: boolean;
  passcode_enabled: boolean;
  auto_lock_enabled: boolean;
  auto_lock_minutes: number;
  created_at: string;
  updated_at: string;
};

export type FarmNotification = {
  id: string;
  farm_id: string;
  recipient_user_id: string;
  source_event_id: string;
  type: string;
  category: string;
  priority: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
  archived_at: string | null;
  expires_at: string | null;
};

export type NotificationList = {
  items: FarmNotification[];
  next_cursor: string | null;
};

export type ActivityCategory =
  | "farm"
  | "housing"
  | "contacts"
  | "sales"
  | "purchases"
  | "flock"
  | "eggs"
  | "inventory"
  | "expenses"
  | "updates";

export type FarmActivity = {
  id: string;
  farm_id: string;
  user_id: string | null;
  session_id: string | null;
  type: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

export type FarmActivityFeed = {
  items: FarmActivity[];
  next_cursor: string | null;
  has_more: boolean;
};

export type FarmActivitySummary = {
  last_7_days_count: number;
  previous_7_days_count: number;
  losses_and_returns_count: number;
  category_counts: Record<ActivityCategory, number>;
};

export type CreateProductPayload = {
  name: string;
  product_type: ProductType;
  description?: string | null;
  is_active?: boolean;
  is_sellable: boolean;
  product_units: {
    unit_id: string;
    conversion_factor: number;
    is_base_unit: boolean;
  }[];
};
export type UpdateProductPayload = Partial<
  Pick<
    CreateProductPayload,
    | "name"
    | "product_type"
    | "description"
    | "is_active"
    | "is_sellable"
    | "product_units"
  >
>;

export type CreateUnitPayload = Pick<Unit, "name" | "abbreviation">;
export type UpdateUnitPayload = Partial<CreateUnitPayload>;
export type ContactFieldsPayload = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
};
export type CreateContactPayload = ContactFieldsPayload & {
  roles: ContactRole[];
};
export type UpdateContactPayload = Partial<ContactFieldsPayload> & {
  roles: ContactRole[];
};
export type UpdateSecurityPayload = Partial<
  Pick<
    SecuritySettings,
    | "biometric_unlock_enable"
    | "passcode_enabled"
    | "auto_lock_enabled"
    | "auto_lock_minutes"
  >
>;

export async function getProducts(farmId: string): Promise<Product[]> {
  const { data } = await apiClient.get<Product[]>(`/farms/${farmId}/products`);
  return data;
}

export async function getProduct(
  farmId: string,
  productId: string,
): Promise<Product> {
  const { data } = await apiClient.get<Product>(
    `/farms/${farmId}/products/${productId}`,
  );
  return data;
}

export async function createProduct(
  farmId: string,
  payload: CreateProductPayload,
): Promise<Product> {
  const { data } = await apiClient.post<Product>(
    `/farms/${farmId}/products`,
    payload,
  );
  return data;
}

export async function updateProduct(
  farmId: string,
  productId: string,
  payload: UpdateProductPayload,
): Promise<Product> {
  const { data } = await apiClient.patch<Product>(
    `/farms/${farmId}/products/${productId}`,
    payload,
  );
  return data;
}

export async function deleteProduct(
  farmId: string,
  productId: string,
): Promise<void> {
  await apiClient.delete(`/farms/${farmId}/products/${productId}`);
}

export async function getInventory(
  farmId: string,
  productId?: string,
  limit = 100,
  offset = 0,
): Promise<InventoryOverview> {
  const { data } = await apiClient.get<InventoryOverview>(
    `/farms/${farmId}/inventory`,
    { params: { product_id: productId, limit, offset } },
  );
  return data;
}

export async function getProductConsumptions(
  farmId: string,
): Promise<ProductConsumption[]> {
  const { data } = await apiClient.get<ProductConsumption[]>(
    `/farms/${farmId}/product-consumptions`,
  );
  return data;
}

export async function createProductConsumption(
  farmId: string,
  payload: ProductConsumptionInput,
): Promise<ProductConsumption[]> {
  const { data } = await apiClient.post<ProductConsumption[]>(
    `/farms/${farmId}/product-consumptions/batch`,
    payload,
  );
  return data;
}

export async function getExpenses(
  farmId: string,
  filters?: {
    search?: string;
    category?: string;
    block_id?: string;
    payment_status?: string;
    from_date?: string;
    to_date?: string;
    offset?: number;
    limit?: number;
  },
): Promise<ExpensePage> {
  const { data } = await apiClient.get<ExpensePage>(
    `/farms/${farmId}/expenses`,
    { params: filters },
  );
  return data;
}

export async function getExpenseSummary(
  farmId: string,
  filters?: { from_date?: string; to_date?: string },
): Promise<ExpenseSummary> {
  const { data } = await apiClient.get<ExpenseSummary>(
    `/farms/${farmId}/expenses/summary`,
    { params: filters },
  );
  return data;
}

export async function getProfitabilityReport(
  farmId: string,
  filters: { from_date: string; to_date: string },
): Promise<ProfitabilityReport> {
  const { data } = await apiClient.get<ProfitabilityReport>(
    `/farms/${farmId}/reports/profitability`,
    { params: filters },
  );
  return data;
}

export async function recordProfitabilityStockValuation(
  farmId: string,
  payload: ProfitabilityStockValuationInput,
): Promise<ProfitabilityStockValuationResult> {
  const { data } = await apiClient.post<ProfitabilityStockValuationResult>(
    `/farms/${farmId}/reports/profitability/stock-valuation`,
    payload,
  );
  return data;
}

export async function createExpense(
  farmId: string,
  payload: ExpenseInput,
): Promise<ExpenseRecord> {
  const { data } = await apiClient.post<ExpenseRecord>(
    `/farms/${farmId}/expenses`,
    payload,
  );
  return data;
}

export async function getExpenseCategories(
  farmId: string,
  includeInactive = false,
): Promise<ExpenseCategory[]> {
  const { data } = await apiClient.get<ExpenseCategory[]>(
    `/farms/${farmId}/expenses/categories`,
    { params: { include_inactive: includeInactive } },
  );
  return data;
}

export async function createExpenseCategory(
  farmId: string,
  payload: ExpenseCategoryInput,
): Promise<ExpenseCategory> {
  const { data } = await apiClient.post<ExpenseCategory>(
    `/farms/${farmId}/expenses/categories`,
    payload,
  );
  return data;
}

export async function updateExpenseCategory(
  farmId: string,
  categoryId: string,
  payload: ExpenseCategoryUpdateInput,
): Promise<ExpenseCategory> {
  const { data } = await apiClient.patch<ExpenseCategory>(
    `/farms/${farmId}/expenses/categories/${categoryId}`,
    payload,
  );
  return data;
}

export async function getExpense(
  farmId: string,
  expenseId: string,
): Promise<ExpenseRecord> {
  const { data } = await apiClient.get<ExpenseRecord>(
    `/farms/${farmId}/expenses/${expenseId}`,
  );
  return data;
}

export async function updateExpense(
  farmId: string,
  expenseId: string,
  payload: ExpenseUpdateInput,
): Promise<ExpenseRecord> {
  const { data } = await apiClient.patch<ExpenseRecord>(
    `/farms/${farmId}/expenses/${expenseId}`,
    payload,
  );
  return data;
}

export async function recordExpensePayment(
  farmId: string,
  expenseId: string,
  payload: ExpensePaymentInput,
): Promise<ExpenseRecord> {
  const { data } = await apiClient.post<ExpenseRecord>(
    `/farms/${farmId}/expenses/${expenseId}/payments`,
    payload,
  );
  return data;
}

export async function recordExpenseRefund(
  farmId: string,
  expenseId: string,
  payload: ExpenseRefundInput,
): Promise<ExpenseRecord> {
  const { data } = await apiClient.post<ExpenseRecord>(
    `/farms/${farmId}/expenses/${expenseId}/refunds`,
    payload,
  );
  return data;
}

export async function cancelExpense(
  farmId: string,
  expenseId: string,
  reason: string,
): Promise<ExpenseRecord> {
  const { data } = await apiClient.post<ExpenseRecord>(
    `/farms/${farmId}/expenses/${expenseId}/cancel`,
    { reason },
  );
  return data;
}

export async function getInventoryOpeningSetupStatus(
  farmId: string,
): Promise<InventoryOpeningSetupStatus> {
  const { data } = await apiClient.get<InventoryOpeningSetupStatus>(
    `/farms/${farmId}/inventory/opening-stock`,
  );
  return data;
}

export async function createInventoryOpeningSetup(
  farmId: string,
  payload: InventoryOpeningSetupInput,
): Promise<InventoryOpeningSetupResult> {
  const { data } = await apiClient.post<InventoryOpeningSetupResult>(
    `/farms/${farmId}/inventory/opening-stock`,
    payload,
  );
  return data;
}

export async function createInventoryPurchase(
  farmId: string,
  payload: InventoryPurchaseInput,
): Promise<InventoryPurchaseResult> {
  const { data } = await apiClient.post<InventoryPurchaseResult>(
    `/farms/${farmId}/inventory/purchases`,
    payload,
  );
  return data;
}

export async function recordInventoryMovement(
  farmId: string,
  kind: "opening-balances" | "adjustments",
  payload: InventoryAdjustmentPayload,
): Promise<InventoryMovement> {
  const { data } = await apiClient.post<InventoryMovement>(
    `/farms/${farmId}/inventory/${kind}`,
    payload,
  );
  return data;
}

export async function getTransactionSettlements(
  farmId: string,
  transactionId: string,
): Promise<TransactionSettlement[]> {
  const { data } = await apiClient.get<TransactionSettlement[]>(
    `/farms/${farmId}/transactions/${transactionId}/settlements`,
  );
  return data;
}

export async function createTransactionSettlement(
  farmId: string,
  transactionId: string,
  payload: TransactionSettlementCreatePayload,
): Promise<TransactionSettlementResult> {
  const { data } = await apiClient.post<TransactionSettlementResult>(
    `/farms/${farmId}/transactions/${transactionId}/settlements`,
    payload,
  );
  return data;
}

export async function getSaleReturns(
  farmId: string,
  transactionId: string,
): Promise<RecordedReturn[]> {
  const { data } = await apiClient.get<RecordedReturn[]>(
    `/farms/${farmId}/sales/${transactionId}/returns`,
  );
  return data;
}

export async function createSaleReturn(
  farmId: string,
  transactionId: string,
  payload: SaleReturnInput,
): Promise<RecordedReturn> {
  const { data } = await apiClient.post<RecordedReturn>(
    `/farms/${farmId}/sales/${transactionId}/returns`,
    payload,
  );
  return data;
}

export async function getPurchaseReturns(
  farmId: string,
  transactionId: string,
): Promise<RecordedReturn[]> {
  const { data } = await apiClient.get<RecordedReturn[]>(
    `/farms/${farmId}/purchases/${transactionId}/returns`,
  );
  return data;
}

export async function createPurchaseReturn(
  farmId: string,
  transactionId: string,
  payload: PurchaseReturnInput,
): Promise<RecordedReturn> {
  const { data } = await apiClient.post<RecordedReturn>(
    `/farms/${farmId}/purchases/${transactionId}/returns`,
    payload,
  );
  return data;
}

export async function getTransactionRefunds(
  farmId: string,
  transactionId: string,
): Promise<CashRefundRecord[]> {
  const { data } = await apiClient.get<CashRefundRecord[]>(
    `/farms/${farmId}/transactions/${transactionId}/refunds`,
  );
  return data;
}

export async function createTransactionRefund(
  farmId: string,
  transactionId: string,
  payload: CashRefundInput,
) {
  const { data } = await apiClient.post(
    `/farms/${farmId}/transactions/${transactionId}/refunds`,
    payload,
  );
  return data;
}

export async function getSupplierRefunds(
  farmId: string,
  transactionId: string,
): Promise<CashRefundRecord[]> {
  const { data } = await apiClient.get<CashRefundRecord[]>(
    `/farms/${farmId}/transactions/${transactionId}/supplier-refunds`,
  );
  return data;
}

export async function createSupplierRefund(
  farmId: string,
  transactionId: string,
  payload: SupplierCashRefundInput,
) {
  const { data } = await apiClient.post(
    `/farms/${farmId}/transactions/${transactionId}/supplier-refunds`,
    payload,
  );
  return data;
}

export async function getUnits(): Promise<Unit[]> {
  const { data } = await apiClient.get<Unit[]>("/units");
  return data;
}

export async function createUnit(payload: CreateUnitPayload): Promise<Unit> {
  const { data } = await apiClient.post<Unit>("/units", payload);
  return data;
}

export async function updateUnit(
  unitId: string,
  payload: UpdateUnitPayload,
): Promise<Unit> {
  const { data } = await apiClient.patch<Unit>(`/units/${unitId}`, payload);
  return data;
}

export async function getContacts(
  farmId: string,
  options?: {
    search?: string;
    role?: ContactRole;
    limit?: number;
    offset?: number;
  },
): Promise<Contact[]> {
  const { data } = await apiClient.get<Contact[]>(`/farms/${farmId}/contacts`, {
    params: options,
  });
  return data;
}

export async function getContactTransactionHistory(
  farmId: string,
  contactId: string,
  options: { limit: number; offset: number },
): Promise<ContactTransactionHistory> {
  const { data } = await apiClient.get<ContactTransactionHistory>(
    `/farms/${farmId}/contacts/${contactId}/transactions`,
    { params: options },
  );
  return data;
}

export async function getContact(
  farmId: string,
  contactId: string,
): Promise<Contact> {
  const { data } = await apiClient.get<Contact>(
    `/farms/${farmId}/contacts/${contactId}`,
  );
  return data;
}

export async function createContact(
  farmId: string,
  payload: CreateContactPayload,
): Promise<Contact> {
  const { roles, ...contactFields } = payload;
  const uniqueRoles = [...new Set(roles)];
  if (!uniqueRoles.length) throw new Error("Select at least one contact role.");
  const { data } = await apiClient.post<Contact>(`/farms/${farmId}/contacts`, {
    ...contactFields,
    role: uniqueRoles[0],
  });
  for (const role of uniqueRoles.slice(1)) {
    await createContactRole(farmId, data.id, role);
  }
  return { ...data, roles: uniqueRoles };
}

export async function updateContact(
  farmId: string,
  contactId: string,
  payload: UpdateContactPayload,
): Promise<Contact> {
  const { roles, ...contactFields } = payload;
  const { data } = await apiClient.patch<Contact>(
    `/farms/${farmId}/contacts/${contactId}`,
    contactFields,
  );
  const existingRoles = await getContactRoles(farmId, contactId);
  const desiredRoles = [...new Set(roles)];
  if (!desiredRoles.length)
    throw new Error("Select at least one contact role.");

  for (const role of desiredRoles) {
    if (!existingRoles.some((item) => item.role === role)) {
      await createContactRole(farmId, contactId, role);
    }
  }
  for (const role of existingRoles) {
    if (!desiredRoles.includes(role.role)) {
      await deleteContactRole(farmId, contactId, role.id);
    }
  }
  return { ...data, roles: desiredRoles };
}

export async function deleteContact(
  farmId: string,
  contactId: string,
): Promise<void> {
  await apiClient.delete(`/farms/${farmId}/contacts/${contactId}`);
}

export async function getContactRoles(
  farmId: string,
  contactId: string,
): Promise<ContactRoleRecord[]> {
  const { data } = await apiClient.get<ContactRoleRecord[]>(
    `/farms/${farmId}/contacts/${contactId}/roles`,
  );
  return data;
}

export async function createContactRole(
  farmId: string,
  contactId: string,
  role: ContactRole,
): Promise<ContactRoleRecord> {
  const { data } = await apiClient.post<ContactRoleRecord>(
    `/farms/${farmId}/contacts/${contactId}/roles`,
    { role },
  );
  return data;
}

export async function deleteContactRole(
  farmId: string,
  contactId: string,
  roleId: string,
): Promise<void> {
  await apiClient.delete(
    `/farms/${farmId}/contacts/${contactId}/roles/${roleId}`,
  );
}

export async function getSecuritySettings(): Promise<SecuritySettings> {
  const { data } = await apiClient.get<SecuritySettings>("/security-settings");
  return data;
}

export async function updateSecuritySettings(
  payload: UpdateSecurityPayload,
): Promise<SecuritySettings> {
  const { data } = await apiClient.patch<SecuritySettings>(
    "/security-settings",
    payload,
  );
  return data;
}

export async function getNotifications(
  farmId: string,
  params: { limit: number; cursor?: string },
): Promise<NotificationList> {
  const { data } = await apiClient.get<NotificationList>(
    `/farms/${farmId}/notifications`,
    { params },
  );
  return data;
}

export async function getFarmActivities(
  farmId: string,
  filters: {
    limit: number;
    before?: string;
    search?: string;
    category?: ActivityCategory;
    from_datetime?: string;
    to_datetime?: string;
  },
): Promise<FarmActivityFeed> {
  const { data } = await apiClient.get<FarmActivityFeed>(
    `/farms/${farmId}/activities`,
    { params: filters },
  );
  return data;
}

export async function getFarmActivity(
  farmId: string,
  activityId: string,
): Promise<FarmActivity> {
  const { data } = await apiClient.get<FarmActivity>(
    `/farms/${farmId}/activities/${activityId}`,
  );
  return data;
}

export async function getFarmActivitySummary(
  farmId: string,
): Promise<FarmActivitySummary> {
  const { data } = await apiClient.get<FarmActivitySummary>(
    `/farms/${farmId}/activities/summary`,
  );
  return data;
}

export async function getUnreadNotificationCount(
  farmId: string,
): Promise<number> {
  const { data } = await apiClient.get<{ unread_count: number }>(
    `/farms/${farmId}/notifications/unread-count`,
  );
  return data.unread_count;
}

export async function markAllNotificationsRead(farmId: string): Promise<void> {
  await apiClient.patch(`/farms/${farmId}/notifications/read-all`);
}

export async function markNotificationRead(
  farmId: string,
  notificationId: string,
): Promise<void> {
  await apiClient.patch(
    `/farms/${farmId}/notifications/${notificationId}/read`,
  );
}
