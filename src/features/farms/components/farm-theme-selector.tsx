import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/app-text";
import {
  farmThemePresets,
  getFarmThemePreset,
  type FarmThemePreset,
} from "@/providers/farm-theme-presets";
import { useTheme } from "@/providers/theme-provider";

type FarmThemeSelectorProps = {
  value: string;
  onSelect: (preset: FarmThemePreset) => void;
};

export function FarmThemeSelector({ value, onSelect }: FarmThemeSelectorProps) {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const selectedPreset = getFarmThemePreset(value);

  function selectPreset(preset: FarmThemePreset) {
    onSelect(preset);
    setVisible(false);
  }

  return (
    <View style={styles.container}>
      <AppText size="small" weight="semibold">
        Farm color theme
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Current farm theme: ${selectedPreset.name}. Select a different theme.`}
        onPress={() => setVisible(true)}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: pressed
              ? theme.backgroundSelected
              : theme.backgroundElement,
            borderColor: theme.border,
          },
        ]}
      >
        <PresetPreview preset={selectedPreset} compact />
        <View style={styles.triggerCopy}>
          <AppText weight="semibold">{selectedPreset.name}</AppText>
          <AppText size="small" tone="secondary" numberOfLines={1}>
            {selectedPreset.description}
          </AppText>
        </View>
        <View style={styles.changeAction}>
          <AppText
            size="small"
            weight="semibold"
            style={{ color: theme.primary }}
          >
            Change
          </AppText>
          <Ionicons name="chevron-forward" size={16} color={theme.primary} />
        </View>
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close theme selector"
            onPress={() => setVisible(false)}
            style={styles.scrim}
          />
          <SafeAreaView
            edges={["bottom"]}
            style={[
              styles.sheet,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalTitle}>
                <AppText size="heading" weight="semibold">
                  Choose a farm theme
                </AppText>
                <AppText size="small" tone="secondary">
                  Preview both modes. Your choice updates the app immediately;
                  save the profile to keep it.
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close theme selector"
                hitSlop={8}
                onPress={() => setVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={22} color={theme.text} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.themeList}
              showsVerticalScrollIndicator
            >
              {farmThemePresets.map((preset) => {
                const selected = preset.primary === selectedPreset.primary;
                return (
                  <Pressable
                    key={preset.name}
                    accessibilityRole="radio"
                    accessibilityLabel={`${preset.name} theme`}
                    accessibilityState={{ checked: selected }}
                    onPress={() => selectPreset(preset)}
                    style={({ pressed }) => [
                      styles.themeOption,
                      {
                        backgroundColor: pressed
                          ? theme.backgroundSelected
                          : theme.backgroundElement,
                        borderColor: selected ? preset.primary : theme.border,
                      },
                    ]}
                  >
                    <PresetPreview preset={preset} />
                    <View style={styles.themeCopy}>
                      <AppText weight="semibold">{preset.name}</AppText>
                      <AppText size="small" tone="secondary">
                        {preset.description}
                      </AppText>
                    </View>
                    {selected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={21}
                        color={preset.primary}
                        accessibilityLabel="Selected"
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

function PresetPreview({
  preset,
  compact = false,
}: {
  preset: FarmThemePreset;
  compact?: boolean;
}) {
  return (
    <View style={[styles.previewPair, compact && styles.compactPreviewPair]}>
      {(["light", "dark"] as const).map((mode) => {
        const surfaces = preset[mode];
        return (
          <View
            key={mode}
            style={[
              styles.modePreview,
              compact && styles.compactModePreview,
              { backgroundColor: surfaces.background },
            ]}
          >
            {!compact ? (
              <AppText
                size="small"
                style={[styles.modeLabel, { color: surfaces.textSecondary }]}
              >
                {mode === "light" ? "Light" : "Dark"}
              </AppText>
            ) : null}
            <View
              style={[
                styles.previewSurface,
                compact && styles.compactPreviewSurface,
                { backgroundColor: surfaces.backgroundElement },
              ]}
            >
              <View style={styles.previewTop}>
                <View
                  style={[
                    styles.previewLogo,
                    compact && styles.compactPreviewLogo,
                    { backgroundColor: preset.primary },
                  ]}
                />
                <View style={styles.previewLines}>
                  <View
                    style={[
                      styles.previewLine,
                      { backgroundColor: surfaces.text },
                    ]}
                  />
                  <View
                    style={[
                      styles.previewSubline,
                      { backgroundColor: surfaces.textSecondary },
                    ]}
                  />
                </View>
              </View>
              <View style={styles.previewBottom}>
                <View
                  style={[
                    styles.previewPill,
                    { backgroundColor: preset.primary },
                  ]}
                />
                <View
                  style={[
                    styles.previewPillSecondary,
                    { backgroundColor: preset.secondary },
                  ]}
                />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  trigger: {
    minHeight: 80,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderWidth: 1,
    borderRadius: 10,
  },
  triggerCopy: { flex: 1, gap: 3 },
  changeAction: { flexDirection: "row", alignItems: "center", gap: 2 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  sheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingBottom: 14,
  },
  modalTitle: { flex: 1, gap: 4 },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  themeList: { gap: 10, paddingBottom: 18 },
  themeOption: {
    minHeight: 112,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 8,
    borderWidth: 2,
    borderRadius: 10,
  },
  themeCopy: { flex: 1, gap: 4 },
  previewPair: { width: 132, height: 94, flexDirection: "row", gap: 5 },
  compactPreviewPair: { width: 72, height: 56, gap: 3 },
  modePreview: {
    flex: 1,
    minWidth: 0,
    justifyContent: "space-between",
    padding: 5,
    borderRadius: 7,
  },
  compactModePreview: { padding: 3, borderRadius: 5 },
  modeLabel: { fontSize: 9, lineHeight: 12 },
  previewSurface: {
    flex: 1,
    marginTop: 4,
    padding: 6,
    borderRadius: 6,
    justifyContent: "space-between",
  },
  compactPreviewSurface: { marginTop: 0, padding: 4, borderRadius: 4 },
  previewTop: { flexDirection: "row", alignItems: "center", gap: 5 },
  previewLogo: { width: 16, height: 16, borderRadius: 5 },
  compactPreviewLogo: { width: 10, height: 10, borderRadius: 3 },
  previewLines: { flex: 1, gap: 4 },
  previewLine: { width: "72%", height: 4, borderRadius: 3 },
  previewSubline: { width: "48%", height: 3, borderRadius: 3 },
  previewBottom: { flexDirection: "row", gap: 5 },
  previewPill: { width: 25, height: 6, borderRadius: 3 },
  previewPillSecondary: { width: 17, height: 6, borderRadius: 3 },
});
