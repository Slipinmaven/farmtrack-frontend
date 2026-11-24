import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
} from "react-native";

import { AppText } from "@/components/ui/app-text";
import { useTheme } from "@/providers/theme-provider";

type ButtonProps = Omit<PressableProps, "children"> & {
  label: string;
  loading?: boolean;
  loadingLabel?: string;
  variant?: "primary" | "secondary" | "quiet";
};

export function Button({
  label,
  loading = false,
  loadingLabel,
  disabled,
  variant = "primary",
  style,
  ...props
}: ButtonProps) {
  const { theme } = useTheme();
  const backgroundColor =
    variant === "primary"
      ? theme.primary
      : variant === "secondary"
        ? theme.backgroundSelected
        : "transparent";
  const color = variant === "primary" ? theme.onPrimary : theme.text;
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityState={{
        disabled: Boolean(disabled || loading),
        busy: loading,
      }}
      disabled={disabled || loading}
      style={(state) => [
        styles.button,
        {
          backgroundColor,
          borderColor: theme.border,
          opacity: disabled && !loading ? 0.48 : state.pressed ? 0.82 : 1,
        },
        variant === "quiet" && styles.quiet,
        typeof style === "function" ? style(state) : style,
      ]}
    >
      {loading && loadingLabel ? (
        <View style={styles.loadingContent}>
          <ActivityIndicator color={color} />
          <AppText weight="semibold" style={{ color }}>
            {loadingLabel}
          </AppText>
        </View>
      ) : loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <AppText weight="semibold" style={{ color, textAlign: "center" }}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  quiet: { borderColor: "transparent" },
});
