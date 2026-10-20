import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

import type { FarmSettings } from "@/features/farms/types";

const memoryValues = new Map<string, string>();
const selectedFarmKey = (userId: string) => `farmtrack.selected-farm.${userId}`;
const settingsKey = (farmId: string) => `farmtrack.theme.${farmId}`;

async function readValue(key: string): Promise<string | null> {
  return Platform.OS === "web"
    ? (memoryValues.get(key) ?? null)
    : SecureStore.getItemAsync(key);
}

async function writeValue(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") memoryValues.set(key, value);
  else await SecureStore.setItemAsync(key, value);
}

export async function readSelectedFarm(userId: string): Promise<string | null> {
  return readValue(selectedFarmKey(userId));
}

export async function saveSelectedFarm(
  userId: string,
  farmId: string,
): Promise<void> {
  await writeValue(selectedFarmKey(userId), farmId);
}

export async function readCachedSettings(
  farmId: string,
): Promise<FarmSettings | null> {
  const value = await readValue(settingsKey(farmId));
  if (!value) return null;
  try {
    return JSON.parse(value) as FarmSettings;
  } catch {
    return null;
  }
}

export async function cacheSettings(settings: FarmSettings): Promise<void> {
  await writeValue(settingsKey(settings.farm_id), JSON.stringify(settings));
}
