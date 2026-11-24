import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createReminder,
  cancelReminder,
  completeReminder,
  getReminders,
  getReminder,
  rescheduleReminder,
  reopenReminder,
  type ReminderCreateInput,
} from "@/features/reminders/api";

export function useReminders(
  userId: string | undefined,
  farmId: string | undefined,
) {
  return useQuery({
    queryKey: ["reminders", userId, farmId],
    queryFn: () => getReminders(farmId!),
    enabled: Boolean(userId && farmId),
  });
}

export function useReminder(
  userId: string | undefined,
  farmId: string | undefined,
  reminderId: string | undefined,
) {
  return useQuery({
    queryKey: ["reminder", userId, farmId, reminderId],
    queryFn: () => getReminder(farmId!, reminderId!),
    enabled: Boolean(userId && farmId && reminderId),
  });
}

export function useCreateReminder(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReminderCreateInput) =>
      createReminder(farmId, payload),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["reminders", userId, farmId] }),
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

export function useRescheduleReminder(
  userId: string,
  farmId: string,
  reminderId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (dueAt: string) =>
      rescheduleReminder(farmId, reminderId, dueAt),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["reminders", userId, farmId] }),
        client.invalidateQueries({
          queryKey: ["reminder", userId, farmId, reminderId],
        }),
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

export function useCancelReminder(
  userId: string,
  farmId: string,
  reminderId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => cancelReminder(farmId, reminderId),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["reminders", userId, farmId] }),
        client.invalidateQueries({
          queryKey: ["reminder", userId, farmId, reminderId],
        }),
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

export function useCompleteReminder(
  userId: string,
  farmId: string,
  reminderId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => completeReminder(farmId, reminderId),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["reminders", userId, farmId] }),
        client.invalidateQueries({
          queryKey: ["reminder", userId, farmId, reminderId],
        }),
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

export function useReopenReminder(
  userId: string,
  farmId: string,
  reminderId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => reopenReminder(farmId, reminderId),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["reminders", userId, farmId] }),
        client.invalidateQueries({
          queryKey: ["reminder", userId, farmId, reminderId],
        }),
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
