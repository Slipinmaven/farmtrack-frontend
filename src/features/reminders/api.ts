import { apiClient } from "@/lib/api/client";

export type ReminderCreateInput = {
  title: string;
  description?: string;
  due_at: string;
  delivery_channel?: "in_app" | "push";
  expo_push_token?: string;
  related_entity_type?: string;
  related_entity_id?: string;
};

export type Reminder = {
  id: string;
  farm_id: string;
  title: string;
  description: string | null;
  due_at: string;
  delivery_channel: "in_app" | "push";
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  recurrence_rule: Record<string, unknown> | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
  completed_at: string | null;
  notification_enqueued_at: string | null;
};

export async function getReminders(farmId: string): Promise<Reminder[]> {
  const { data } = await apiClient.get<Reminder[]>(`/farms/${farmId}/reminders`);
  return data;
}

export async function createReminder(
  farmId: string,
  payload: ReminderCreateInput,
): Promise<Reminder> {
  const { data } = await apiClient.post<Reminder>(
    `/farms/${farmId}/reminders`,
    payload,
  );
  return data;
}

export async function getReminder(
  farmId: string,
  reminderId: string,
): Promise<Reminder> {
  const { data } = await apiClient.get<Reminder>(
    `/farms/${farmId}/reminders/${reminderId}`,
  );
  return data;
}
