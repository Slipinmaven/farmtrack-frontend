import { create, isAxiosError, type InternalAxiosRequestConfig } from "axios";

import type { AuthenticationResponse } from "@/features/auth/types";
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from "@/lib/config";
import { normalizeApiError } from "@/lib/api/errors";
import { beginApiRequest, endApiRequest } from "@/lib/api/request-status";
import { getLoginDeviceMetadata } from "@/lib/storage/device";
import {
  clearSession,
  notifySessionExpired,
  readSession,
  saveSession,
  type SessionCredentials,
} from "@/lib/storage/session";

type RetriableRequest = InternalAxiosRequestConfig & {
  farmTrackRetried?: boolean;
  farmTrackStatusTracked?: boolean;
};

export const apiClient = create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { Accept: "application/json", "Content-Type": "application/json" },
});
const refreshClient = create({ timeout: REQUEST_TIMEOUT_MS });

let refreshPromise: Promise<SessionCredentials> | null = null;

apiClient.interceptors.request.use(async (config) => {
  const session = await readSession();
  if (session) config.headers.Authorization = `Bearer ${session.accessToken}`;
  const trackedConfig = config as RetriableRequest;
  trackedConfig.farmTrackStatusTracked = true;
  beginApiRequest();
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    const config = response.config as RetriableRequest;
    if (config.farmTrackStatusTracked) {
      config.farmTrackStatusTracked = false;
      endApiRequest();
    }
    return response;
  },
  async (error: unknown) => {
    if (isAxiosError(error) && error.config) {
      const failedConfig = error.config as RetriableRequest;
      if (failedConfig.farmTrackStatusTracked) {
        failedConfig.farmTrackStatusTracked = false;
        endApiRequest();
      }
    }
    if (!isAxiosError(error)) throw normalizeApiError(error);
    const config = error.config as RetriableRequest | undefined;
    const isAuthRequest = ["/auth/login", "/auth/refresh", "/auth/logout"].some(
      (path) => config?.url?.startsWith(path) ?? false,
    );
    if (
      error.response?.status !== 401 ||
      !config ||
      config.farmTrackRetried ||
      isAuthRequest
    ) {
      throw normalizeApiError(error);
    }

    config.farmTrackRetried = true;
    try {
      if (!refreshPromise) {
        refreshPromise = (async () => {
          const session = await readSession();
          if (!session) throw new Error("No refresh token is available.");
          const { data } = await refreshClient.post<AuthenticationResponse>(
            `${API_BASE_URL}/auth/refresh`,
            {
              refresh_token: session.refreshToken,
              ...(await getLoginDeviceMetadata()),
            },
            { timeout: REQUEST_TIMEOUT_MS },
          );
          const nextSession = {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
          };
          await saveSession(nextSession);
          return nextSession;
        })();
      }
      const nextSession = await refreshPromise;
      config.headers.Authorization = `Bearer ${nextSession.accessToken}`;
      return apiClient.request(config);
    } catch (refreshError) {
      const refreshApiError = normalizeApiError(refreshError);
      if (
        (isAxiosError(refreshError) && refreshError.response?.status === 401) ||
        refreshApiError.code === "DEVICE_BLOCKED"
      ) {
        await clearSession();
        notifySessionExpired(refreshApiError);
      }
      throw refreshApiError;
    } finally {
      refreshPromise = null;
    }
  },
);
