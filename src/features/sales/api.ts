import { apiClient } from "@/lib/api/client";

export type SaleCategory =
  | "eggs"
  | "chickens"
  | "feed"
  | "medication"
  | "equipment"
  | "other";
export type SaleStatus = "all" | "completed" | "cancelled";

export type SalesReportItem = {
  id: string;
  reference_number: string | null;
  transaction_date: string;
  status: "completed" | "cancelled";
  customer_name: string | null;
  product_names: string[];
  products_sold: {
    name: string;
    quantity: number | string;
    unit_name: string | null;
  }[];
  categories: SaleCategory[];
  transaction_total: number | string;
  amount_paid: number | string;
  balance_due: number | string;
  credit_balance: number | string;
};

export type SalesReport = {
  items: SalesReportItem[];
  sellable_categories: SaleCategory[];
  total_count: number;
  offset: number;
  limit: number;
  daily: {
    day: string;
    transaction_count: number;
    sales_total: number | string;
  }[];
  summary: {
    transaction_count: number;
    sales_total: number | string;
    amount_received: number | string;
    balance_due: number | string;
    monthly: {
      month: string;
      transaction_count: number;
      sales_total: number | string;
      amount_received: number | string;
    }[];
  };
};

export type SalesReportFilters = {
  from_date?: string;
  to_date?: string;
  category?: SaleCategory;
  status: SaleStatus;
  search?: string;
  offset: number;
  limit: number;
  include_daily?: boolean;
};

export async function getSalesReport(
  farmId: string,
  filters: SalesReportFilters,
): Promise<SalesReport> {
  const { data } = await apiClient.get<SalesReport>(
    `/farms/${farmId}/sales`,
    {
      params: {
        ...filters,
        from_date: filters.from_date || undefined,
        to_date: filters.to_date || undefined,
        category: filters.category || undefined,
        include_daily: filters.include_daily || undefined,
        search: filters.search?.trim() || undefined,
      },
    },
  );
  return data;
}
