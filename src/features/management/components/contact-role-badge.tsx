import { GlassView } from "expo-glass-effect";
import { StyleSheet } from "react-native";

import { AppText } from "@/components/ui/app-text";
import type { ContactRole } from "@/features/management/api";
import { useTheme } from "@/providers/theme-provider";

export function ContactRoleBadge({ role }: { role: ContactRole }) {
  const { theme } = useTheme();
  return (
    <GlassView
      glassEffectStyle="regular"
      tintColor={theme.primary}
      colorScheme={theme.mode}
      style={[
        styles.badge,
        {
          backgroundColor: withOpacity(theme.primary, 0.14),
          borderColor: withOpacity(theme.onPrimary, 0.35),
        },
      ]}
    >
      <AppText size="small" weight="semibold" style={{ color: theme.text }}>
        {role === "customer" ? "Customer" : "Supplier"}
      </AppText>
    </GlassView>
  );
}

function withOpacity(color: string, opacity: number): string {
  const hex = color.slice(1);
  const expanded =
    hex.length === 3
      ? hex
          .split("")
          .map((channel) => `${channel}${channel}`)
          .join("")
      : hex;
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 25,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 1,
  },
});
