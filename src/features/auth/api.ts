import { apiClient } from "@/lib/api/client";
import type {
  AuthenticationResponse,
  LoginPayload,
  User,
} from "@/features/auth/types";
import { getLoginDeviceMetadata } from "@/lib/storage/device";

export type LoginSession = {
  id: string;
  device_name: string;
  platform: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  revocation_reason: string | null;
  is_current: boolean;
  is_current_device: boolean;
  device_is_blocked: boolean;
  device_blocked_until: string | null;
  device_blocked_permanently: boolean;
};

export type BlockedDevice = {
  id: string;
  device_name: string;
  is_permanent: boolean;
  is_active: boolean;
  blocked_until: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionHistory = {
  sessions: LoginSession[];
  blocked_devices: BlockedDevice[];
  total: number;
  offset: number;
  limit: number;
};

export type SessionStatusFilter = "all" | "active" | "ended";
export type SessionHistoryFilters = {
  limit: number;
  offset: number;
  status: SessionStatusFilter;
  search: string;
};

export type SessionActivity = {
  id: string;
  farm_id: string;
  user_id: string | null;
  session_id: string | null;
  type: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

export type SessionActivityFeed = {
  items: SessionActivity[];
  next_cursor: string | null;
  has_more: boolean;
};

export type ChangePasswordPayload = {
  current_password: string;
  new_password: string;
};

export type AccountDeletion = {
  status: "scheduled";
  scheduled_for: string | null;
  notification_sent: boolean;
};

export type AccountDeletionStatus = {
  status: "none" | "confirmation_pending" | "scheduled";
  confirmation_expires_at: string | null;
  scheduled_for: string | null;
};

export async function scheduleAccountDeletion(
  currentPassword: string,
): Promise<AccountDeletion> {
  const { data } = await apiClient.delete<AccountDeletion>("/auth/account", {
    data: { current_password: currentPassword },
  });
  return data;
}

export async function getAccountDeletionStatus(): Promise<AccountDeletionStatus> {
  const { data } =
    await apiClient.get<AccountDeletionStatus>("/auth/account/deletion");
  return data;
}

export async function cancelAccountDeletion(
  email: string,
  currentPassword: string,
): Promise<void> {
  await apiClient.post("/auth/account-deletion/cancel", {
    email,
    password: currentPassword,
  });
}

export async function restoreAccountDeletion(
  email: string,
  password: string,
): Promise<void> {
  await apiClient.post("/auth/account-deletion/restore", { email, password });
}

export async function login(
  payload: LoginPayload,
): Promise<AuthenticationResponse> {
  const { data } = await apiClient.post<AuthenticationResponse>(
    "/auth/login",
    payload,
  );
  return data;
}

export async function getCurrentUser(): Promise<User> {
  const { data } = await apiClient.get<User>("/auth/me");
  return data;
}

export async function refreshAuthentication(
  refreshToken: string,
): Promise<AuthenticationResponse> {
  const { data } = await apiClient.post<AuthenticationResponse>(
    "/auth/refresh",
    {
      refresh_token: refreshToken,
      ...(await getLoginDeviceMetadata()),
    },
  );
  return data;
}

export async function logout(refreshToken: string): Promise<void> {
  await apiClient.post("/auth/logout", { refresh_token: refreshToken });
}

export async function changePassword(
  payload: ChangePasswordPayload,
): Promise<void> {
  await apiClient.post("/auth/change-password", payload);
}

export async function getLoginSessions(
  filters: SessionHistoryFilters,
): Promise<SessionHistory> {
  const { data } = await apiClient.get<SessionHistory>("/auth/sessions", {
    params: {
      limit: filters.limit,
      offset: filters.offset,
      status: filters.status,
      search: filters.search || undefined,
    },
  });
  return data;
}

export async function getSessionActivities(
  sessionId: string,
  limit: number,
  before?: string,
): Promise<SessionActivityFeed> {
  const { data } = await apiClient.get<SessionActivityFeed>(
    `/auth/sessions/${sessionId}/activities`,
    { params: { limit, before } },
  );
  return data;
}

export async function revokeLoginSession(sessionId: string): Promise<void> {
  await apiClient.post(`/auth/sessions/${sessionId}/revoke`);
}

export async function blockLoginSession(
  sessionId: string,
  payload: { permanent: boolean; duration_days?: number },
): Promise<BlockedDevice> {
  const { data } = await apiClient.post<BlockedDevice>(
    `/auth/sessions/${sessionId}/block`,
    payload,
  );
  return data;
}

export async function unblockDevice(blockId: string): Promise<void> {
  await apiClient.delete(`/auth/blocked-devices/${blockId}`);
}
