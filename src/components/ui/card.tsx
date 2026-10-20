import { View, type ViewProps } from "react-native";

import { useTheme } from "@/providers/theme-provider";

export function Card({ style, ...props }: ViewProps) {
  const { theme } = useTheme();
  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          borderWidth: 1,
          borderRadius: 6,
          padding: 16,
        },
        style,
      ]}
    />
  );
}
