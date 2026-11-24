import { useInfiniteQuery } from "@tanstack/react-query";

import {
  getReceiptHistory,
  type ReceiptHistoryFilters,
} from "@/features/receipts/api";

const pageSize = 25;

export function useReceiptHistory(
  userId: string | undefined,
  farmId: string | undefined,
  filters: Omit<ReceiptHistoryFilters, "offset" | "limit">,
) {
  return useInfiniteQuery({
    queryKey: [
      "receipt-history",
      userId,
      farmId,
      filters.search,
      filters.transactionType,
      filters.receiptKind,
      filters.status,
      filters.fromDate,
      filters.toDate,
    ],
    queryFn: ({ pageParam }) =>
      getReceiptHistory(farmId!, {
        ...filters,
        offset: pageParam,
        limit: pageSize,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.offset + lastPage.items.length < lastPage.total_count
        ? lastPage.offset + lastPage.limit
        : undefined,
    enabled: Boolean(userId && farmId),
  });
}
