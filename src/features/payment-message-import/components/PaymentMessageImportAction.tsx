import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/app-text";
import { useTheme } from "@/providers/theme-provider";

export function PaymentMessageImportAction({
  label = "Import M-Pesa confirmation",
  onPress,
}: {
  label?: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      android_ripple={{ color: `${theme.primary}18` }}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: pressed
            ? theme.backgroundSelected
            : theme.backgroundElement,
          borderColor: `${theme.primary}55`,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: `${theme.primary}18` }]}>
        <Ionicons
          name="chatbox-ellipses-outline"
          size={19}
          color={theme.primary}
        />
      </View>
      <View style={styles.copy}>
        <AppText size="small" weight="semibold">
          {label}
        </AppText>
        <AppText size="small" tone="secondary">
          Share from Messages or copy and paste
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={19} color={theme.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 3 },
});
