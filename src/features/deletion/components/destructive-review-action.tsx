import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/app-text";
import { useTheme } from "@/providers/theme-provider";

type DestructiveReviewActionProps = {
  label: string;
  description: string;
  onPress: () => void;
  disabled?: boolean;
};

export function DestructiveReviewAction({
  label,
  description,
  onPress,
  disabled = false,
}: DestructiveReviewActionProps) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${description}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: `${theme.danger}12`,
          borderColor: `${theme.danger}66`,
          opacity: disabled ? 0.48 : pressed ? 0.88 : 1,
          transform: [{ scale: pressed && !disabled ? 0.99 : 1 }],
        },
      ]}
    >
      <View
        style={[
          styles.icon,
          { backgroundColor: theme.danger },
        ]}
      >
        <Ionicons name="warning-outline" size={19} color="#FFFFFF" />
      </View>
      <View style={styles.copy}>
        <AppText weight="semibold">{label}</AppText>
        <AppText size="small" tone="secondary">
          {description}
        </AppText>
      </View>
      <View style={[styles.arrow, { backgroundColor: theme.danger }]}>
        <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  icon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  copy: { flex: 1, gap: 3 },
  arrow: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
});
