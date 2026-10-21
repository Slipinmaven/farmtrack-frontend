import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/errors";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        if (
          error instanceof ApiError &&
          error.code === "SERVER_WAKE_TIMEOUT"
        ) {
          return false;
        }
        if (
          error instanceof ApiError &&
          error.status !== undefined &&
          error.status < 500
        ) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});
