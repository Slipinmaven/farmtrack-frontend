import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/app-text";
import { useTheme } from "@/providers/theme-provider";

const scaleOptions = [
  { value: "0.75", label: "Compact" },
  { value: "0.90", label: "Comfort" },
  { value: "1.00", label: "Default" },
  { value: "1.15", label: "Relaxed" },
  { value: "1.30", label: "Large" },
  { value: "1.50", label: "Largest" },
] as const;

type FontScaleSelectorProps = {
  value: string;
  onChange: (value: string) => void;
};

export function FontScaleSelector({ value, onChange }: FontScaleSelectorProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <AppText size="small" weight="semibold">
        Text size
      </AppText>
      <View style={styles.options}>
        {scaleOptions.map((option) => {
          const selected = value === option.value;
          const scale = Number(option.value);
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={`${option.label} text size, scale ${option.value}`}
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.value)}
              style={[
                styles.option,
                {
                  backgroundColor: selected
                    ? theme.backgroundSelected
                    : theme.backgroundElement,
                  borderColor: selected ? theme.primary : theme.border,
                },
              ]}
            >
              <View style={styles.sampleRow}>
                <AppText
                  weight="semibold"
                  style={{ fontSize: 23 * scale, lineHeight: 30 * scale }}
                >
                  Aa
                </AppText>
                {selected ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={theme.primary}
                  />
                ) : null}
              </View>
              <AppText size="small" tone="secondary" numberOfLines={1}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 9 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: {
    width: "30%",
    minWidth: 76,
    minHeight: 68,
    flexGrow: 1,
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 8,
  },
  sampleRow: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
