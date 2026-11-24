import { useQuery } from "@tanstack/react-query";

import {
  getOutstandingBalances,
  getPendingSaleDeliveries,
  getSalesReport,
  type SalesReportFilters,
} from "@/features/sales/api";

export function usePendingSaleDeliveries(
  userId: string | undefined,
  farmId: string | undefined,
) {
  return useQuery({
    queryKey: ["pending-sale-deliveries", userId, farmId],
    queryFn: () => getPendingSaleDeliveries(farmId!),
    enabled: Boolean(userId && farmId),
  });
}

export function useOutstandingBalances(
  userId: string | undefined,
  farmId: string | undefined,
) {
  return useQuery({
    queryKey: ["outstanding-balances", userId, farmId],
    queryFn: () => getOutstandingBalances(farmId!),
    enabled: Boolean(userId && farmId),
  });
}

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
