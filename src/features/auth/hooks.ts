import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  blockLoginSession,
  changePassword,
  getLoginSessions,
  getSessionActivities,
  revokeLoginSession,
  unblockDevice,
  type ChangePasswordPayload,
  type SessionHistoryFilters,
} from "@/features/auth/api";

export function useLoginSessions(
  userId: string | undefined,
  filters: SessionHistoryFilters,
) {
  return useQuery({
    queryKey: ["login-sessions", userId, filters],
    queryFn: () => getLoginSessions(filters),
    enabled: Boolean(userId),
  });
}

export function useSessionActivities(
  userId: string | undefined,
  sessionId: string | undefined,
) {
  return useInfiniteQuery({
    queryKey: ["session-activities", userId, sessionId],
    queryFn: ({ pageParam }) => getSessionActivities(sessionId!, 20, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: Boolean(userId && sessionId),
  });
}

export function useChangePassword(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChangePasswordPayload) => changePassword(payload),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["login-sessions", userId] }),
  });
}

export function useRevokeLoginSession(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => revokeLoginSession(sessionId),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["login-sessions", userId] }),
  });
}

export function useBlockLoginSession(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      permanent,
      durationDays,
    }: {
      sessionId: string;
      permanent: boolean;
      durationDays?: number;
    }) =>
      blockLoginSession(sessionId, {
        permanent,
        ...(durationDays ? { duration_days: durationDays } : {}),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["login-sessions", userId] }),
  });
}

export function useUnblockDevice(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (blockId: string) => unblockDevice(blockId),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["login-sessions", userId] }),
  });
}
