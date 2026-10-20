import { useQuery } from "@tanstack/react-query";

import {
  getSalesReport,
  type SalesReportFilters,
} from "@/features/sales/api";

export function useSalesReport(
  userId: string | undefined,
  farmId: string | undefined,
  filters: SalesReportFilters,
  enabled = true,
) {
  return useQuery({
    queryKey: ["sales-report", userId, farmId, filters],
    queryFn: () => getSalesReport(farmId!, filters),
    enabled: Boolean(userId && farmId && enabled),
  });
}
