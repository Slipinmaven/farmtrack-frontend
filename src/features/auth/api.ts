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
