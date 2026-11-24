import { API_BASE_URL } from "@/lib/config";
import { apiClient } from "@/lib/api/client";

const PRIVATE_LOGO_PATH = /^\/api\/v1\/farms\/([0-9a-f-]{36})\/logo$/i;
const LEGACY_LOGO_PATH =
  /^\/media\/farm-logos\/([0-9a-f-]{36})\/[0-9a-f]{32}\.(?:jpg|png|webp)$/i;
const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const MAX_FARM_LOGO_BYTES = 5 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function getFarmLogoUri(
  logoPath: string | null | undefined,
): string | null {
  const path = logoPath?.trim();
  if (!path) return null;

  const farmId =
    path.match(PRIVATE_LOGO_PATH)?.[1] ??
    path.match(LEGACY_LOGO_PATH)?.[1];
  if (!farmId) return null;

  return `${API_BASE_URL.replace(/\/+$/, "")}/farms/${farmId}/logo`;
}

export async function fetchFarmLogoDataUri(
  logoPath: string | null | undefined,
): Promise<string | null> {
  const uri = getFarmLogoUri(logoPath);
  if (!uri) return null;

  const response = await apiClient.get<ArrayBuffer>(uri, {
    responseType: "arraybuffer",
  });
  const contentType = String(response.headers["content-type"] ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error("The farm logo response was not a supported image.");
  }

  const bytes = new Uint8Array(response.data);
  if (bytes.length === 0 || bytes.length > MAX_FARM_LOGO_BYTES) {
    throw new Error("The farm logo response has an invalid size.");
  }

  return `data:${contentType};base64,${encodeBase64(bytes)}`;
}

function encodeBase64(bytes: Uint8Array): string {
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    encoded += BASE64_ALPHABET[first >> 2];
    encoded += BASE64_ALPHABET[((first & 0x03) << 4) | (second >> 4)];
    encoded +=
      index + 1 < bytes.length
        ? BASE64_ALPHABET[((second & 0x0f) << 2) | (third >> 6)]
        : "=";
    encoded +=
      index + 2 < bytes.length ? BASE64_ALPHABET[third & 0x3f] : "=";
  }
  return encoded;
}
