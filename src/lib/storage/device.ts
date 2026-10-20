import { Platform } from "react-native";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";

const DEVICE_ID_KEY = "farmtrack.device-id";

function createDeviceId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (cryptoApi?.getRandomValues) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("");
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

async function getOrCreateDeviceId(): Promise<string> {
  if (Platform.OS === "web") {
    if (typeof localStorage === "undefined") return createDeviceId();
    const storedId = localStorage.getItem(DEVICE_ID_KEY);
    if (storedId) return storedId;
    const deviceId = createDeviceId();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    return deviceId;
  }

  const storedId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (storedId) return storedId;
  const deviceId = createDeviceId();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

export async function getLoginDeviceMetadata(): Promise<{
  device_id: string;
  device_name: string;
  platform: string;
}> {
  const deviceId = await getOrCreateDeviceId();
  const deviceName =
    Device.deviceName ??
    Device.modelName ??
    (Platform.OS === "web" ? "Web browser" : "Mobile device");
  const platform =
    `${Device.osName ?? Platform.OS} ${Device.osVersion ?? ""}`.trim();

  return {
    device_id: deviceId,
    device_name: deviceName.slice(0, 160),
    platform: platform.slice(0, 80),
  };
}
