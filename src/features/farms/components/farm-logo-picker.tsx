import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { getFarmLogoUri } from "@/features/farms/logo";
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
  const currentLogoUri = getFarmLogoUri(logoPath);
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
          <AppText size="small" tone="secondary">
            Square PNG, JPEG, or WebP. Maximum size 5 MB.
          </AppText>
          {asset ? (
            <AppText size="small" style={{ color: theme.primary }}>
              New logo selected; save to upload.
            </AppText>
          ) : removalRequested ? (
            <AppText size="small" style={{ color: theme.danger }}>
              Logo will be removed when you save.
            </AppText>
          ) : null}
        </View>
      </View>
      <View style={styles.actions}>
        <Button
          label="Choose image"
          variant="secondary"
          onPress={() => void chooseLogo()}
        />
        {canRemove ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={removalLabel}
            onPress={toggleRemoval}
            style={styles.removeButton}
          >
            <Ionicons
              name={removalRequested ? "refresh-outline" : "trash-outline"}
              size={17}
              color={theme.textSecondary}
            />
            <AppText size="small" tone="secondary">
              {removalLabel}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {permissionMessage ? (
        <AppText size="small" style={{ color: theme.danger }}>
          {permissionMessage}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  preview: {
    width: 72,
    height: 72,
    borderRadius: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: { width: "100%", height: "100%" },
  copy: { flex: 1, gap: 4 },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  removeButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
  },
});
