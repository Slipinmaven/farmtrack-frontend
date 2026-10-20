import { API_BASE_URL } from "@/lib/config";

export function getFarmLogoUri(
  logoPath: string | null | undefined,
): string | null {
  const path = logoPath?.trim();
  if (!path) return null;
  if (/^(https?:\/\/|data:)/i.test(path)) return path;

  const apiOrigin = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
  return `${apiOrigin}/${path.replace(/^\/+/, "")}`;
}
