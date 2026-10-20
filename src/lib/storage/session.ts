import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export type SessionCredentials = {
  accessToken: string;
  refreshToken: string;
};

const ACCESS_TOKEN_KEY = "farmtrack.access-token";
const REFRESH_TOKEN_KEY = "farmtrack.refresh-token";
let webSession: SessionCredentials | null = null;
let sessionExpiredHandler: ((error?: unknown) => void) | undefined;

export async function readSession(): Promise<SessionCredentials | null> {
  if (Platform.OS === "web") return webSession;

  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ]);
  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}

export async function saveSession(
  credentials: SessionCredentials,
): Promise<void> {
  if (Platform.OS === "web") {
    webSession = credentials;
    return;
  }

  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, credentials.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, credentials.refreshToken),
  ]);
}

export async function clearSession(): Promise<void> {
  if (Platform.OS === "web") {
    webSession = null;
    return;
  }

  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

export function setSessionExpiredHandler(
  handler: ((error?: unknown) => void) | undefined,
): void {
  sessionExpiredHandler = handler;
}

export function notifySessionExpired(error?: unknown): void {
  sessionExpiredHandler?.(error);
}
