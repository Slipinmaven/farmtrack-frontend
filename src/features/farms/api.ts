import { apiClient } from "@/lib/api/client";
import type {
  CreateFarmPayload,
  Farm,
  FarmLogoUpload,
  FarmSettings,
  UpdateFarmPayload,
} from "@/features/farms/types";

export async function getFarms(): Promise<Farm[]> {
  const { data } = await apiClient.get<Farm[]>("/farms");
  return data;
}

export async function createFarm(payload: CreateFarmPayload): Promise<Farm> {
  const { data } = await apiClient.post<Farm>("/farms/create", payload);
  return data;
}

export async function completeFarmSetup(farmId: string): Promise<Farm> {
  const { data } = await apiClient.post<Farm>(
    `/farms/${farmId}/setup/complete`,
  );
  return data;
}

export async function updateFarm(
  farmId: string,
  payload: UpdateFarmPayload,
): Promise<Farm> {
  const { data } = await apiClient.patch<Farm>(`/farms/${farmId}`, payload);
  return data;
}

export async function updateFarmSettings(
  farmId: string,
  payload: Partial<
    Pick<
      FarmSettings,
      | "primary_color"
      | "secondary_color"
      | "font_family"
      | "font_scale"
      | "theme_mode"
      | "logo_path"
      | "currency"
      | "timezone"
    >
  >,
): Promise<FarmSettings> {
  const { data } = await apiClient.patch<FarmSettings>(
    `/farms/${farmId}/settings`,
    payload,
  );
  return data;
}

export async function uploadFarmLogo(
  farmId: string,
  image: FarmLogoUpload,
): Promise<FarmSettings> {
  const fileExtension = image.fileName?.split(".").pop()?.toLowerCase();
  const mimeByExtension: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  const mimeType =
    image.mimeType ?? mimeByExtension[fileExtension ?? ""] ?? "image/jpeg";
  const extension = mimeByExtension[fileExtension ?? ""]
    ? fileExtension === "jpeg"
      ? "jpg"
      : fileExtension
    : mimeType.split("/")[1];
  const body = new FormData();
  body.append("file", {
    uri: image.uri,
    name: image.fileName ?? `farm-logo.${extension}`,
    type: mimeType,
  } as unknown as Blob);
  const { data } = await apiClient.post<FarmSettings>(
    `/farms/${farmId}/logo`,
    body,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}

export async function deleteFarmLogo(farmId: string): Promise<FarmSettings> {
  const { data } = await apiClient.delete<FarmSettings>(
    `/farms/${farmId}/logo`,
  );
  return data;
}
