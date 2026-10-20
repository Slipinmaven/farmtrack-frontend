import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createContact,
  cancelExpense,
  createExpense,
  createExpenseCategory,
  createInventoryPurchase,
  createInventoryOpeningSetup,
  createProductConsumption,
  createPurchaseReturn,
  createSaleReturn,
  createSupplierRefund,
  createTransactionRefund,
  deleteContact,
  deleteProduct,
  createProduct,
  createUnit,
  createTransactionSettlement,
  getContacts,
  getExpenses,
  getExpenseSummary,
  getProfitabilityReport,
  recordProfitabilityStockValuation,
  getExpense,
  getExpenseCategories,
  getContact,
  getPurchaseReturns,
  getSaleReturns,
  getContactTransactionHistory,
  getFarmActivities,
  getFarmActivity,
  getFarmActivitySummary,
  getInventory,
  getInventoryOpeningSetupStatus,
  getProductConsumptions,
  getNotifications,
  getProduct,
  getProducts,
  getSecuritySettings,
  getUnits,
  getTransactionSettlements,
  getSupplierRefunds,
  getTransactionRefunds,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  updateSecuritySettings,
  updateContact,
  recordExpensePayment,
  recordExpenseRefund,
  updateExpense,
  updateExpenseCategory,
  updateProduct,
  updateUnit,
  recordInventoryMovement,
  type CreateContactPayload,
  type UpdateContactPayload,
  type CreateProductPayload,
  type UpdateProductPayload,
  type CreateUnitPayload,
  type UpdateSecurityPayload,
  type UpdateUnitPayload,
  type ActivityCategory,
  type ContactRole,
  type InventoryAdjustmentPayload,
  type InventoryPurchaseInput,
  type InventoryOpeningSetupInput,
  type ProductConsumptionInput,
  type ExpenseInput,
  type ExpensePaymentInput,
  type ExpenseRefundInput,
  type ExpenseCategoryInput,
  type ExpenseCategoryUpdateInput,
  type ExpenseUpdateInput,
  type PurchaseReturnInput,
  type SaleReturnInput,
  type SupplierCashRefundInput,
  type CashRefundInput,
  type TransactionSettlementCreatePayload,
  type ProfitabilityReport,
  type ProfitabilityStockValuationInput,
} from "@/features/management/api";

export function useProducts(
  userId: string | undefined,
  farmId: string | undefined,
) {
  return useQuery({
    queryKey: ["products", userId, farmId],
    queryFn: () => getProducts(farmId!),
    enabled: Boolean(userId && farmId),
  });
}

export function useProduct(
  userId: string | undefined,
  farmId: string | undefined,
  productId: string | undefined,
) {
  return useQuery({
    queryKey: ["product", userId, farmId, productId],
    queryFn: () => getProduct(farmId!, productId!),
    enabled: Boolean(userId && farmId && productId),
  });
}

export function useProductInventory(
  userId: string | undefined,
  farmId: string | undefined,
  productId: string | undefined,
) {
  return useQuery({
    queryKey: ["inventory", userId, farmId, productId],
    queryFn: () => getInventory(farmId!, productId!),
    enabled: Boolean(userId && farmId && productId),
  });
}

export function useInventory(
  userId: string | undefined,
  farmId: string | undefined,
) {
  return useQuery({
    queryKey: ["inventory", userId, farmId],
    queryFn: () => getInventory(farmId!),
    enabled: Boolean(userId && farmId),
  });
}

export function useProductConsumptions(
  userId: string | undefined,
  farmId: string | undefined,
) {
  return useQuery({
    queryKey: ["product-consumptions", userId, farmId],
    queryFn: () => getProductConsumptions(farmId!),
    enabled: Boolean(userId && farmId),
  });
}

export function useCreateProductConsumption(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProductConsumptionInput) =>
      createProductConsumption(farmId, payload),
    onSuccess: async () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["inventory", userId, farmId] }),
        client.invalidateQueries({
          queryKey: ["product-consumptions", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["farm-activities", userId, farmId],
        }),
      ]),
  });
}

export function useExpenses(
  userId: string | undefined,
  farmId: string | undefined,
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
) {
  return useQuery({
    queryKey: ["expenses", userId, farmId, filters],
    queryFn: () => getExpenses(farmId!, filters),
    enabled: Boolean(userId && farmId),
  });
}

export function useInfiniteExpenses(
  userId: string | undefined,
  farmId: string | undefined,
  filters: {
    search?: string;
    category?: string;
    block_id?: string;
    payment_status?: string;
    from_date?: string;
    to_date?: string;
  },
  pageSize = 30,
) {
  return useInfiniteQuery({
    queryKey: ["expenses", userId, farmId, filters, "infinite", pageSize],
    queryFn: ({ pageParam }) =>
      getExpenses(farmId!, { ...filters, offset: pageParam, limit: pageSize }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.items.length;
      return nextOffset < lastPage.total_count ? nextOffset : undefined;
    },
    enabled: Boolean(userId && farmId),
  });
}

export function useExpenseSummary(
  userId: string | undefined,
  farmId: string | undefined,
  filters?: { from_date?: string; to_date?: string },
) {
  return useQuery({
    queryKey: ["expense-summary", userId, farmId, filters],
    queryFn: () => getExpenseSummary(farmId!, filters),
    enabled: Boolean(userId && farmId),
  });
}

export function useProfitabilityReport(
  userId: string | undefined,
  farmId: string | undefined,
  filters: { from_date: string; to_date: string },
) {
  return useQuery<ProfitabilityReport>({
    queryKey: ["profitability-report", userId, farmId, filters],
    queryFn: () => getProfitabilityReport(farmId!, filters),
    enabled: Boolean(userId && farmId && filters.from_date && filters.to_date),
  });
}

export function useRecordProfitabilityStockValuation(
  userId: string,
  farmId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProfitabilityStockValuationInput) =>
      recordProfitabilityStockValuation(farmId, payload),
    onSuccess: async () =>
      Promise.all([
        client.invalidateQueries({
          queryKey: ["profitability-report", userId, farmId],
        }),
        client.invalidateQueries({ queryKey: ["inventory", userId, farmId] }),
        client.invalidateQueries({
          queryKey: ["farm-activities", userId, farmId],
        }),
      ]),
  });
}

export function useCreateExpense(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: ExpenseInput) => createExpense(farmId, payload),
    onSuccess: async () =>
      Promise.all([
        client.resetQueries({ queryKey: ["expenses", userId, farmId] }),
        client.invalidateQueries({ queryKey: ["expense-summary", userId, farmId] }),
        client.invalidateQueries({
          queryKey: ["farm-activities", userId, farmId],
        }),
      ]),
  });
}

export function useExpense(
  userId: string | undefined,
  farmId: string | undefined,
  expenseId: string | undefined,
) {
  return useQuery({
    queryKey: ["expense", userId, farmId, expenseId],
    queryFn: () => getExpense(farmId!, expenseId!),
    enabled: Boolean(userId && farmId && expenseId),
  });
}

export function useExpenseCategories(
  userId: string | undefined,
  farmId: string | undefined,
  includeInactive = false,
) {
  return useQuery({
    queryKey: ["expense-categories", userId, farmId, includeInactive],
    queryFn: () => getExpenseCategories(farmId!, includeInactive),
    enabled: Boolean(userId && farmId),
  });
}

export function useCreateExpenseCategory(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: ExpenseCategoryInput) =>
      createExpenseCategory(farmId, payload),
    onSuccess: async () =>
      client.invalidateQueries({ queryKey: ["expense-categories", userId, farmId] }),
  });
}

export function useUpdateExpenseCategory(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      categoryId,
      payload,
    }: {
      categoryId: string;
      payload: ExpenseCategoryUpdateInput;
    }) => updateExpenseCategory(farmId, categoryId, payload),
    onSuccess: async () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["expense-categories", userId, farmId] }),
        client.resetQueries({ queryKey: ["expenses", userId, farmId] }),
        client.invalidateQueries({ queryKey: ["expense-summary", userId, farmId] }),
      ]),
  });
}

export function useUpdateExpense(userId: string, farmId: string, expenseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: ExpenseUpdateInput) =>
      updateExpense(farmId, expenseId, payload),
    onSuccess: async () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["expense", userId, farmId, expenseId] }),
        client.resetQueries({ queryKey: ["expenses", userId, farmId] }),
        client.invalidateQueries({ queryKey: ["expense-summary", userId, farmId] }),
        client.invalidateQueries({ queryKey: ["farm-activities", userId, farmId] }),
      ]),
  });
}

export function useRecordExpensePayment(userId: string, farmId: string, expenseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: ExpensePaymentInput) =>
      recordExpensePayment(farmId, expenseId, payload),
    onSuccess: async () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["expense", userId, farmId, expenseId] }),
        client.resetQueries({ queryKey: ["expenses", userId, farmId] }),
        client.invalidateQueries({ queryKey: ["expense-summary", userId, farmId] }),
        client.invalidateQueries({ queryKey: ["farm-activities", userId, farmId] }),
      ]),
  });
}

export function useRecordExpenseRefund(userId: string, farmId: string, expenseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: ExpenseRefundInput) =>
      recordExpenseRefund(farmId, expenseId, payload),
    onSuccess: async () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["expense", userId, farmId, expenseId] }),
        client.resetQueries({ queryKey: ["expenses", userId, farmId] }),
        client.invalidateQueries({ queryKey: ["expense-summary", userId, farmId] }),
        client.invalidateQueries({ queryKey: ["farm-activities", userId, farmId] }),
      ]),
  });
}

export function useCancelExpense(userId: string, farmId: string, expenseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => cancelExpense(farmId, expenseId, reason),
    onSuccess: async () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["expense", userId, farmId, expenseId] }),
        client.resetQueries({ queryKey: ["expenses", userId, farmId] }),
        client.invalidateQueries({ queryKey: ["expense-summary", userId, farmId] }),
        client.invalidateQueries({ queryKey: ["farm-activities", userId, farmId] }),
      ]),
  });
}

export function useInventoryOpeningSetupStatus(
  userId: string | undefined,
  farmId: string | undefined,
) {
  return useQuery({
    queryKey: ["inventory-opening-stock", userId, farmId],
    queryFn: () => getInventoryOpeningSetupStatus(farmId!),
    enabled: Boolean(userId && farmId),
  });
}

export function useCreateInventoryOpeningSetup(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: InventoryOpeningSetupInput) =>
      createInventoryOpeningSetup(farmId, payload),
    onSuccess: async () =>
      Promise.all([
        client.invalidateQueries({
          queryKey: ["inventory-opening-stock", userId, farmId],
        }),
        client.invalidateQueries({ queryKey: ["inventory", userId, farmId] }),
        client.invalidateQueries({ queryKey: ["products", userId, farmId] }),
        client.invalidateQueries({
          queryKey: ["chicken-sale-options", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["egg-collection-options", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["farm-activities", userId, farmId],
        }),
      ]),
  });
}

export function useCreateInventoryPurchase(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: InventoryPurchaseInput) =>
      createInventoryPurchase(farmId, payload),
    onSuccess: async () =>
      Promise.all([
        client.invalidateQueries({
          queryKey: ["inventory", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["products", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["farm-activities", userId, farmId],
        }),
      ]),
  });
}

export function useTransactionSettlements(
  userId: string | undefined,
  farmId: string | undefined,
  transactionId: string | undefined,
) {
  return useQuery({
    queryKey: ["transaction-settlements", userId, farmId, transactionId],
    queryFn: () => getTransactionSettlements(farmId!, transactionId!),
    enabled: Boolean(userId && farmId && transactionId),
  });
}

export function useCreateTransactionSettlement(
  userId: string,
  farmId: string,
  transactionId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: TransactionSettlementCreatePayload) =>
      createTransactionSettlement(farmId, transactionId, payload),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["transaction-settlements", userId, farmId, transactionId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-sale-details", userId, farmId, transactionId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-purchase-details", userId, farmId, transactionId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-sale-options", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-purchase-options", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["blocks", userId, farmId],
        }),
        client.invalidateQueries({ queryKey: ["sales-report", userId, farmId] }),
        client.invalidateQueries({
          queryKey: ["farm-activities", userId, farmId],
        }),
        client.invalidateQueries({ queryKey: ["inventory", userId, farmId] }),
      ]);
    },
  });
}

export function useSaleReturns(
  userId: string | undefined,
  farmId: string | undefined,
  transactionId: string | undefined,
) {
  return useQuery({
    queryKey: ["sale-returns", userId, farmId, transactionId],
    queryFn: () => getSaleReturns(farmId!, transactionId!),
    enabled: Boolean(userId && farmId && transactionId),
  });
}

export function useCreateSaleReturn(
  userId: string,
  farmId: string,
  transactionId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaleReturnInput) =>
      createSaleReturn(farmId, transactionId, payload),
    onSuccess: async () =>
      Promise.all([
        client.invalidateQueries({
          queryKey: ["sale-returns", userId, farmId, transactionId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-sale-details", userId, farmId, transactionId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-sale-fulfillment", userId, farmId, transactionId],
        }),
        client.invalidateQueries({ queryKey: ["inventory", userId, farmId] }),
        client.invalidateQueries({ queryKey: ["sales-report", userId, farmId] }),
        client.invalidateQueries({
          queryKey: ["farm-activities", userId, farmId],
        }),
      ]),
  });
}

export function usePurchaseReturns(
  userId: string | undefined,
  farmId: string | undefined,
  transactionId: string | undefined,
) {
  return useQuery({
    queryKey: ["purchase-returns", userId, farmId, transactionId],
    queryFn: () => getPurchaseReturns(farmId!, transactionId!),
    enabled: Boolean(userId && farmId && transactionId),
  });
}

export function useCreatePurchaseReturn(
  userId: string,
  farmId: string,
  transactionId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: PurchaseReturnInput) =>
      createPurchaseReturn(farmId, transactionId, payload),
    onSuccess: async () =>
      Promise.all([
        client.invalidateQueries({
          queryKey: ["purchase-returns", userId, farmId, transactionId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-purchase-details", userId, farmId, transactionId],
        }),
        client.invalidateQueries({ queryKey: ["inventory", userId, farmId] }),
        client.invalidateQueries({
          queryKey: ["farm-activities", userId, farmId],
        }),
      ]),
  });
}

export function useTransactionRefunds(
  userId: string | undefined,
  farmId: string | undefined,
  transactionId: string | undefined,
) {
  return useQuery({
    queryKey: ["transaction-refunds", userId, farmId, transactionId],
    queryFn: () => getTransactionRefunds(farmId!, transactionId!),
    enabled: Boolean(userId && farmId && transactionId),
  });
}

export function useCreateTransactionRefund(
  userId: string,
  farmId: string,
  transactionId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: CashRefundInput) =>
      createTransactionRefund(farmId, transactionId, payload),
    onSuccess: async () =>
      Promise.all([
        client.invalidateQueries({
          queryKey: ["transaction-refunds", userId, farmId, transactionId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-sale-details", userId, farmId, transactionId],
        }),
        client.invalidateQueries({
          queryKey: ["sales-report", userId, farmId],
        }),
        client.invalidateQueries({
          queryKey: ["farm-activities", userId, farmId],
        }),
      ]),
  });
}

export function useSupplierRefunds(
  userId: string | undefined,
  farmId: string | undefined,
  transactionId: string | undefined,
) {
  return useQuery({
    queryKey: ["supplier-refunds", userId, farmId, transactionId],
    queryFn: () => getSupplierRefunds(farmId!, transactionId!),
    enabled: Boolean(userId && farmId && transactionId),
  });
}

export function useCreateSupplierRefund(
  userId: string,
  farmId: string,
  transactionId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: SupplierCashRefundInput) =>
      createSupplierRefund(farmId, transactionId, payload),
    onSuccess: async () =>
      Promise.all([
        client.invalidateQueries({
          queryKey: ["supplier-refunds", userId, farmId, transactionId],
        }),
        client.invalidateQueries({
          queryKey: ["chicken-purchase-details", userId, farmId, transactionId],
        }),
        client.invalidateQueries({
          queryKey: ["purchase-returns", userId, farmId, transactionId],
        }),
        client.invalidateQueries({
          queryKey: ["farm-activities", userId, farmId],
        }),
      ]),
  });
}

export function useRecordInventoryMovement(
  userId: string,
  farmId: string,
  productId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      kind,
      payload,
    }: {
      kind: "opening-balances" | "adjustments";
      payload: InventoryAdjustmentPayload;
    }) => recordInventoryMovement(farmId, kind, payload),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ["inventory", userId, farmId, productId],
      });
    },
  });
}

export function useCreateProduct(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateProductPayload) =>
      createProduct(farmId, payload),
    onSuccess: async (product) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["products", userId, farmId] }),
        client.invalidateQueries({
          queryKey: ["product", userId, farmId, product.id],
        }),
      ]);
    },
  });
}

export function useUpdateProduct(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      productId,
      payload,
    }: {
      productId: string;
      payload: UpdateProductPayload;
    }) => updateProduct(farmId, productId, payload),
    onSuccess: async (_data, productId) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["products", userId, farmId] }),
        client.removeQueries({
          queryKey: ["product", userId, farmId, productId],
        }),
      ]);
    },
  });
}

export function useDeleteProduct(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) => deleteProduct(farmId, productId),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["products", userId, farmId] }),
  });
}

export function useUnits(userId: string | undefined) {
  return useQuery({
    queryKey: ["units", userId],
    queryFn: getUnits,
    enabled: Boolean(userId),
  });
}

export function useCreateUnit(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateUnitPayload) => createUnit(payload),
    onSuccess: () => client.invalidateQueries({ queryKey: ["units", userId] }),
  });
}

export function useUpdateUnit(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      unitId,
      payload,
    }: {
      unitId: string;
      payload: UpdateUnitPayload;
    }) => updateUnit(unitId, payload),
    onSuccess: () => client.invalidateQueries({ queryKey: ["units", userId] }),
  });
}

export function useContacts(
  userId: string | undefined,
  farmId: string | undefined,
  search: string,
  role: ContactRole | undefined,
) {
  const query = search.trim();
  return useInfiniteQuery({
    queryKey: ["contacts", userId, farmId, query, role],
    queryFn: ({ pageParam }) =>
      getContacts(farmId!, {
        search: query || undefined,
        role,
        limit: 50,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === 50 ? pages.length * 50 : undefined,
    enabled: Boolean(userId && farmId),
  });
}

export function useContactTransactionHistory(
  userId: string | undefined,
  farmId: string | undefined,
  contactId: string | undefined,
) {
  return useInfiniteQuery({
    queryKey: ["contact-transactions", userId, farmId, contactId],
    queryFn: ({ pageParam }) =>
      getContactTransactionHistory(farmId!, contactId!, {
        limit: 25,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.offset + lastPage.items.length < lastPage.total_count
        ? lastPage.offset + lastPage.limit
        : undefined,
    enabled: Boolean(userId && farmId && contactId),
  });
}

export function useSearchCustomers(
  userId: string | undefined,
  farmId: string | undefined,
  search: string,
) {
  const query = search.trim();
  return useQuery({
    queryKey: ["customer-search", userId, farmId, query],
    queryFn: () =>
      getContacts(farmId!, { search: query, role: "customer", limit: 25 }),
    enabled: Boolean(userId && farmId && query.length >= 2),
  });
}

export function useContact(
  userId: string | undefined,
  farmId: string | undefined,
  contactId: string | undefined,
) {
  return useQuery({
    queryKey: ["contact", userId, farmId, contactId],
    queryFn: () => getContact(farmId!, contactId!),
    enabled: Boolean(userId && farmId && contactId),
  });
}

export function useCreateContact(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateContactPayload) =>
      createContact(farmId, payload),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["contacts", userId, farmId] }),
  });
}

export function useUpdateContact(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      contactId,
      payload,
    }: {
      contactId: string;
      payload: UpdateContactPayload;
    }) => updateContact(farmId, contactId, payload),
    onSuccess: async (contact) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["contacts", userId, farmId] }),
        client.invalidateQueries({
          queryKey: ["contact", userId, farmId, contact.id],
        }),
      ]);
    },
  });
}

export function useDeleteContact(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) => deleteContact(farmId, contactId),
    onSuccess: async (_data, contactId) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["contacts", userId, farmId] }),
        client.removeQueries({
          queryKey: ["contact", userId, farmId, contactId],
        }),
      ]);
    },
  });
}

export function useFarmActivities(
  userId: string | undefined,
  farmId: string | undefined,
  search: string,
  category: ActivityCategory | undefined,
  fromDatetime: string | undefined,
  toDatetime: string | undefined,
) {
  return useInfiniteQuery({
    queryKey: [
      "farm-activities",
      userId,
      farmId,
      search,
      category,
      fromDatetime,
      toDatetime,
    ],
    queryFn: ({ pageParam }) =>
      getFarmActivities(farmId!, {
        limit: 20,
        before: pageParam,
        search: search || undefined,
        category,
        from_datetime: fromDatetime,
        to_datetime: toDatetime,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? (lastPage.next_cursor ?? undefined) : undefined,
    enabled: Boolean(userId && farmId),
  });
}

export function useFarmActivity(
  userId: string | undefined,
  farmId: string | undefined,
  activityId: string | undefined,
) {
  return useQuery({
    queryKey: ["farm-activity", userId, farmId, activityId],
    queryFn: () => getFarmActivity(farmId!, activityId!),
    enabled: Boolean(userId && farmId && activityId),
  });
}

export function useFarmActivitySummary(
  userId: string | undefined,
  farmId: string | undefined,
) {
  return useQuery({
    queryKey: ["farm-activity-summary", userId, farmId],
    queryFn: () => getFarmActivitySummary(farmId!),
    enabled: Boolean(userId && farmId),
    refetchInterval: 60_000,
  });
}

export function useSecuritySettings(userId: string | undefined) {
  return useQuery({
    queryKey: ["security-settings", userId],
    queryFn: getSecuritySettings,
    enabled: Boolean(userId),
  });
}

export function useUpdateSecuritySettings(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateSecurityPayload) =>
      updateSecuritySettings(payload),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["security-settings", userId] }),
  });
}

export function useNotifications(
  userId: string | undefined,
  farmId: string | undefined,
) {
  return useInfiniteQuery({
    queryKey: ["notifications", userId, farmId],
    queryFn: ({ pageParam }) =>
      getNotifications(farmId!, {
        limit: 20,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: Boolean(userId && farmId),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

export function useUnreadNotificationCount(
  userId: string | undefined,
  farmId: string | undefined,
) {
  return useQuery({
    queryKey: ["notification-unread-count", userId, farmId],
    queryFn: () => getUnreadNotificationCount(farmId!),
    enabled: Boolean(userId && farmId),
    refetchInterval: 60_000,
  });
}

export function useMarkAllNotificationsRead(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(farmId),
    onSuccess: async () => {
      await Promise.all([
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

export function useMarkNotificationRead(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) =>
      markNotificationRead(farmId, notificationId),
    onSuccess: async () => {
      await Promise.all([
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
