import { apiClient } from "@/lib/api/client";
import { API_BASE_URL } from "@/lib/config";

export type AvailableAppUpdate = {
  id: string;
  version: string;
  version_code: number;
  file_name: string;
  file_size: number | null;
  release_notes: string | null;
};

type AppUpdateCheckResponse = {
  update_available: boolean;
  release: AvailableAppUpdate | null;
};

export async function checkForAppUpdate(
  currentVersionCode: number,
): Promise<AvailableAppUpdate | null> {
  const { data } = await apiClient.get<AppUpdateCheckResponse>(
    "/app-releases/updates/latest",
    { params: { current_version_code: currentVersionCode } },
  );
  return data.update_available ? data.release : null;
}

export function getAppUpdateDownloadUrl(releaseId: string): string {
  return `${API_BASE_URL}/app-releases/updates/${encodeURIComponent(releaseId)}/download`;
}
