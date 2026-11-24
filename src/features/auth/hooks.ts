import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  blockLoginSession,
  cancelAccountDeletion,
  changePassword,
  getAccountDeletionStatus,
  getLoginSessions,
  getSessionActivities,
  revokeLoginSession,
  scheduleAccountDeletion,
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

export function useScheduleAccountDeletion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (currentPassword: string) =>
      scheduleAccountDeletion(currentPassword),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["account-deletion-status"] }),
  });
}

export function useAccountDeletionStatus(userId: string | undefined) {
  return useQuery({
    queryKey: ["account-deletion-status", userId],
    queryFn: getAccountDeletionStatus,
    enabled: Boolean(userId),
  });
}

export function useCancelAccountDeletion(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      cancelAccountDeletion(email, password),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["account-deletion-status"] }),
        ...(userId
          ? [client.invalidateQueries({ queryKey: ["farms", userId] })]
          : []),
      ]);
    },
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
