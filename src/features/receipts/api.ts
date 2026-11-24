import { apiClient } from "@/lib/api/client";

export type ReceiptTransactionType = "sale" | "purchase";
export type ReceiptKind = "transaction" | "payment";
export type ReceiptHistoryPaymentMethod =
  "cash" | "mpesa" | "bank_transfer" | "card" | "other";

export type ReceiptHistoryPayment = {
  id: string;
  payment_number: number;
  payment_date: string;
  reference_number: string | null;
  amount: number | string;
  payment_method: ReceiptHistoryPaymentMethod;
};

export type ReceiptHistoryTransaction = {
  id: string;
  transaction_type: ReceiptTransactionType;
  status: "completed" | "cancelled";
  transaction_date: string;
  reference_number: string | null;
  contact_name: string | null;
  product_names: string[];
  transaction_total: number | string;
  payments: ReceiptHistoryPayment[];
};

export type ReceiptHistoryPage = {
  items: ReceiptHistoryTransaction[];
  total_count: number;
  completed_total: number | string;
  offset: number;
  limit: number;
};

export type ReceiptHistoryFilters = {
  search?: string;
  transactionType: "all" | ReceiptTransactionType;
  receiptKind: "all" | ReceiptKind;
  status?: "all" | "completed" | "cancelled";
  fromDate?: string;
  toDate?: string;
  offset: number;
  limit: number;
};

export async function getReceiptHistory(
  farmId: string,
  filters: ReceiptHistoryFilters,
): Promise<ReceiptHistoryPage> {
  const { data } = await apiClient.get<ReceiptHistoryPage>(
    `/farms/${farmId}/receipts`,
    {
      params: {
        search: filters.search?.trim() || undefined,
        transaction_type: filters.transactionType,
        receipt_kind: filters.receiptKind,
        status: filters.status ?? "all",
        from_date: filters.fromDate,
        to_date: filters.toDate,
        offset: filters.offset,
        limit: filters.limit,
      },
    },
  );
  return data;
}
