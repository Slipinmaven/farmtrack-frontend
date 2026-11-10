import { Ionicons } from "@expo/vector-icons";
import * as Application from "expo-application";
import { File, Paths } from "expo-file-system";
import * as IntentLauncher from "expo-intent-launcher";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Modal,
  Platform,
  StyleSheet,
  View,
} from "react-native";

import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import {
  checkForAppUpdate,
  getAppUpdateDownloadUrl,
  type AvailableAppUpdate,
} from "@/features/app-updates/api";
import { normalizeApiError } from "@/lib/api/errors";
import { readSession } from "@/lib/storage/session";
import { useAppLockBlocksUpdates } from "@/providers/app-lock-guard";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";

const APK_MIME_TYPE = "application/vnd.android.package-archive";
const INSTALL_PACKAGE_ACTION = "android.intent.action.INSTALL_PACKAGE";
const GRANT_READ_URI_PERMISSION = 1;

function formatFileSize(fileSize: number | null): string | null {
  if (fileSize === null || fileSize <= 0) return null;
  const megabytes = fileSize / (1024 * 1024);
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}

export function AndroidAppUpdateChecker() {
  const { status, user } = useAuth();
  const updatesBlocked = useAppLockBlocksUpdates();
  const dialog = useAppDialog();
  const { theme } = useTheme();
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const checkedUserId = useRef<string | null>(null);
  const lastCheckedAt = useRef(0);

  const downloadAndInstall = useCallback(
    async (
      update: AvailableAppUpdate,
      isActive: () => boolean,
    ): Promise<void> => {
      setDownloading(true);
      setDownloadProgress(0);
      try {
        const session = await readSession();
        if (!session) {
          throw new Error("Please sign in again before downloading the update.");
        }

        const destination = new File(
          Paths.cache,
          `farmtrack-update-${update.version_code}.apk`,
        );
        const downloadedFile = await File.downloadFileAsync(
          getAppUpdateDownloadUrl(update.id),
          destination,
          {
            headers: {
              Authorization: ["Bearer", session.accessToken].join(" "),
            },
            idempotent: true,
            onProgress: ({ bytesWritten, totalBytes }) => {
              if (totalBytes > 0) {
                setDownloadProgress(Math.min(1, bytesWritten / totalBytes));
              }
            },
          },
        );
        if (downloadedFile.size <= 0) {
          throw new Error("The downloaded APK is empty. Please try again.");
        }
        if (
          update.file_size !== null &&
          downloadedFile.size !== update.file_size
        ) {
          throw new Error("The APK download was incomplete. Please try again.");
        }
        if (!isActive()) return;

        setDownloading(false);
        await IntentLauncher.startActivityAsync(INSTALL_PACKAGE_ACTION, {
          data: downloadedFile.contentUri,
          type: APK_MIME_TYPE,
          flags: GRANT_READ_URI_PERMISSION,
        });
      } catch (error) {
        if (isActive()) {
          await dialog.showDialog({
            title: "Update could not be installed",
            message: `${normalizeApiError(error).message} If Android asks, allow FarmTrack to install unknown apps, then try again.`,
            tone: "error",
          });
        }
      } finally {
        setDownloading(false);
        setDownloadProgress(null);
      }
    },
    [dialog],
  );

  const checkAndOfferUpdate = useCallback(
    async (isActive: () => boolean): Promise<void> => {
      const installedBuild = Number(Application.nativeBuildVersion);
      if (!Number.isSafeInteger(installedBuild) || installedBuild <= 0) return;

      try {
        const update = await checkForAppUpdate(installedBuild);
        if (!isActive() || !update) return;
        const size = formatFileSize(update.file_size);
        const shouldDownload = await dialog.confirmDialog({
          title: `FarmTrack ${update.version} is available`,
          message: [
            `Installed build: ${installedBuild}. New build: ${update.version_code}.`,
            size ? `Download size: ${size}.` : "",
            update.release_notes?.trim()
              ? `What's new:\n${update.release_notes.trim()}`
              : "",
            "If you continue, Android will open its installer. You must approve the installation there.",
          ]
            .filter(Boolean)
            .join("\n\n"),
          confirmLabel: "Download update",
          cancelLabel: "Not now",
          tone: "info",
        });
        if (!shouldDownload || !isActive()) return;
        await downloadAndInstall(update, isActive);
      } catch (error) {
        if (!isActive()) return;
        await dialog.showDialog({
          title: "Couldn’t check for updates",
          message: `${normalizeApiError(error).message} You can continue using FarmTrack and check again the next time you open it.`,
          tone: "warning",
        });
      }
    },
    [dialog, downloadAndInstall],
  );

  useEffect(() => {
    if (
      Platform.OS !== "android" ||
      status !== "authenticated" ||
      !user ||
      updatesBlocked
    ) {
      return;
    }
    if (checkedUserId.current !== user.id) {
      checkedUserId.current = user.id;
      lastCheckedAt.current = 0;
    }

    let active = true;
    let previousAppState = AppState.currentState;
    const checkIfDue = () => {
      if (Date.now() - lastCheckedAt.current < 60_000) return;
      lastCheckedAt.current = Date.now();
      void checkAndOfferUpdate(() => active);
    };
    const timer = setTimeout(checkIfDue, 2500);
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (previousAppState !== "active" && nextAppState === "active") {
        checkIfDue();
      }
      previousAppState = nextAppState;
    });

    return () => {
      active = false;
      clearTimeout(timer);
      subscription.remove();
    };
  }, [checkAndOfferUpdate, status, updatesBlocked, user]);

  return (
    <Modal
      animationType="fade"
      transparent
      visible={downloading}
      onRequestClose={() => undefined}
    >
      <View style={styles.backdrop}>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Downloading FarmTrack update"
          style={[
            styles.progressCard,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}
        >
          <View
            style={[
              styles.progressIcon,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <Ionicons
              name="cloud-download-outline"
              size={26}
              color={theme.primary}
            />
          </View>
          <AppText size="heading" weight="semibold">
            Downloading update
          </AppText>
          <AppText size="small" tone="secondary" style={styles.progressCopy}>
            Keep FarmTrack open. Android will ask you to confirm installation
            when the download finishes.
          </AppText>
          <ActivityIndicator size="small" color={theme.primary} />
          <AppText
            size="small"
            weight="semibold"
            style={{ color: theme.primary }}
          >
            {downloadProgress === null
              ? "Preparing download…"
              : `${Math.round(downloadProgress * 100)}%`}
          </AppText>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#00000080",
  },
  progressCard: {
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    gap: 14,
    padding: 24,
    borderWidth: 1,
    borderRadius: 20,
  },
  progressIcon: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  progressCopy: { textAlign: "center" },
});
