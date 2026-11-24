import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/app-text";
import { useFarmLogo } from "@/features/farms/use-farm-logo";
import { useTheme } from "@/providers/theme-provider";

type FarmLogoPickerProps = {
  logoPath: string | null | undefined;
  asset: ImagePicker.ImagePickerAsset | null;
  removalRequested: boolean;
  onAssetChange: (asset: ImagePicker.ImagePickerAsset | null) => void;
  onRemovalChange: (requested: boolean) => void;
};

export function FarmLogoPicker({
  logoPath,
  asset,
  removalRequested,
  onAssetChange,
  onRemovalChange,
}: FarmLogoPickerProps) {
  const { theme } = useTheme();
  const [permissionMessage, setPermissionMessage] = useState<string | null>(
    null,
  );
  const { uri: currentLogoUri, error: logoLoadFailed } = useFarmLogo(logoPath);
  const previewUri = asset?.uri ?? (removalRequested ? null : currentLogoUri);

  async function chooseLogo() {
    setPermissionMessage(null);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setPermissionMessage(
          "Allow photo library access in system settings to choose a logo.",
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]) {
        const selectedAsset = result.assets[0];
        if (
          selectedAsset.fileSize &&
          selectedAsset.fileSize > 5 * 1024 * 1024
        ) {
          setPermissionMessage("Choose an image that is 5 MB or smaller.");
          return;
        }
        const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
        if (
          selectedAsset.mimeType &&
          !allowedTypes.includes(selectedAsset.mimeType)
        ) {
          setPermissionMessage("Choose a PNG, JPEG, or WebP image.");
          return;
        }
        onAssetChange(selectedAsset);
        onRemovalChange(false);
      }
    } catch {
      setPermissionMessage("Could not open the photo library. Try again.");
    }
  }

  function toggleRemoval() {
    if (asset) {
      onAssetChange(null);
      return;
    }
    onRemovalChange(!removalRequested);
  }

  const canRemove = Boolean(asset || currentLogoUri || removalRequested);
  const removalLabel = removalRequested
    ? "Undo removal"
    : asset
      ? "Clear selection"
      : "Remove logo";

  return (
    <View style={styles.container}>
      <View style={styles.previewRow}>
        <View
          style={[
            styles.preview,
            { backgroundColor: theme.backgroundSelected },
          ]}
        >
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              contentFit="cover"
              style={styles.previewImage}
              accessibilityLabel="Farm logo preview"
            />
          ) : (
            <Ionicons name="business-outline" size={27} color={theme.primary} />
          )}
        </View>
        <View style={styles.copy}>
          <AppText weight="semibold">Farm logo</AppText>
          {asset ? (
            <AppText size="small" style={{ color: theme.primary }}>
              Ready to save
            </AppText>
          ) : removalRequested ? (
            <AppText size="small" style={{ color: theme.danger }}>
              Will be removed
            </AppText>
          ) : (
            <AppText size="small" tone="secondary">
              {logoLoadFailed
                ? "Saved logo could not be loaded."
                : "Square image · 5 MB max"}
            </AppText>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={previewUri ? "Change farm logo" : "Add farm logo"}
          onPress={() => void chooseLogo()}
          style={({ pressed }) => [
            styles.changeButton,
            {
              backgroundColor: theme.backgroundSelected,
              borderColor: theme.border,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <Ionicons
            name={previewUri ? "camera-outline" : "add"}
            size={17}
            color={theme.primary}
          />
          <AppText
            size="small"
            weight="semibold"
            style={{ color: theme.primary }}
          >
            {previewUri ? "Change" : "Add"}
          </AppText>
        </Pressable>
      </View>
      {canRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={removalLabel}
          onPress={toggleRemoval}
          style={styles.removeButton}
        >
          <Ionicons
            name={removalRequested ? "refresh-outline" : "trash-outline"}
            size={16}
            color={theme.textSecondary}
          />
          <AppText size="small" tone="secondary">
            {removalRequested
              ? "Undo"
              : asset
                ? "Clear selection"
                : "Remove logo"}
          </AppText>
        </Pressable>
      ) : null}
      {permissionMessage ? (
        <AppText size="small" style={{ color: theme.danger }}>
          {permissionMessage}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  previewRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  preview: {
    width: 54,
    height: 54,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: { width: "100%", height: "100%" },
  copy: { flex: 1, gap: 4 },
  changeButton: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 11,
  },
  removeButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
  },
});
