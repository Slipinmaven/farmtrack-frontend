import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/app-text";
import { useTheme } from "@/providers/theme-provider";

export type FarmRegionPreset = {
  name: string;
  currency: string;
  timezone: string;
};

const regions: FarmRegionPreset[] = [
  { name: "Kenya", currency: "KES", timezone: "Africa/Nairobi" },
  { name: "Uganda", currency: "UGX", timezone: "Africa/Kampala" },
  { name: "Tanzania", currency: "TZS", timezone: "Africa/Dar_es_Salaam" },
  { name: "Rwanda", currency: "RWF", timezone: "Africa/Kigali" },
  { name: "Ethiopia", currency: "ETB", timezone: "Africa/Addis_Ababa" },
  { name: "Nigeria", currency: "NGN", timezone: "Africa/Lagos" },
  { name: "South Africa", currency: "ZAR", timezone: "Africa/Johannesburg" },
  { name: "United Kingdom", currency: "GBP", timezone: "Europe/London" },
  { name: "United States", currency: "USD", timezone: "America/New_York" },
];

type FarmRegionSelectorProps = {
  currency: string;
  timezone: string;
  onSelect: (region: FarmRegionPreset) => void;
};

export function FarmRegionSelector({
  currency,
  timezone,
  onSelect,
}: FarmRegionSelectorProps) {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const selected = regions.find(
    (region) => region.currency === currency && region.timezone === timezone,
  );

  function chooseRegion(region: FarmRegionPreset) {
    onSelect(region);
    setVisible(false);
  }

  return (
    <View style={styles.container}>
      <AppText size="small" weight="semibold">
        Farm region
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Farm region: ${selected?.name ?? "Other region"}. Choose a region.`}
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
        <View style={[styles.icon, { backgroundColor: theme.primary }]}>
          <Ionicons name="globe-outline" size={19} color={theme.onPrimary} />
        </View>
        <View style={styles.triggerCopy}>
          <AppText weight="semibold" numberOfLines={1}>
            {selected?.name ?? "Other region"}
          </AppText>
          <AppText size="small" tone="secondary" numberOfLines={1}>
            {currency} · {timezone}
          </AppText>
        </View>
        <Ionicons name="chevron-down" size={19} color={theme.textSecondary} />
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
            accessibilityLabel="Close region selector"
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
                  Choose a region
                </AppText>
                <AppText size="small" tone="secondary">
                  Currency and timezone are set together.
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close region selector"
                hitSlop={8}
                onPress={() => setVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={22} color={theme.text} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.list}>
              {regions.map((region) => {
                const isSelected = selected?.name === region.name;
                return (
                  <Pressable
                    key={region.name}
                    accessibilityRole="radio"
                    accessibilityLabel={`${region.name}, ${region.currency}, ${region.timezone}`}
                    accessibilityState={{ checked: isSelected }}
                    onPress={() => chooseRegion(region)}
                    style={({ pressed }) => [
                      styles.option,
                      {
                        backgroundColor:
                          pressed || isSelected
                            ? theme.backgroundSelected
                            : theme.backgroundElement,
                        borderColor: isSelected ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <View style={styles.optionCopy}>
                      <AppText weight="semibold">{region.name}</AppText>
                      <AppText size="small" tone="secondary">
                        {region.currency} · {region.timezone}
                      </AppText>
                    </View>
                    {isSelected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={21}
                        color={theme.primary}
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

const styles = StyleSheet.create({
  container: { gap: 8 },
  trigger: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  icon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  triggerCopy: { flex: 1, gap: 2 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  sheet: {
    maxHeight: "82%",
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
  modalTitle: { flex: 1, gap: 3 },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { gap: 8, paddingBottom: 18 },
  option: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderRadius: 9,
  },
  optionCopy: { flex: 1, gap: 3 },
});
