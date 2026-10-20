import { Text, type TextProps } from "react-native";

import { useTheme } from "@/providers/theme-provider";

type AppTextProps = TextProps & {
  tone?: "primary" | "secondary" | "muted";
  weight?: "regular" | "semibold";
  size?: "body" | "small" | "title" | "heading";
};

export function AppText({
  tone = "primary",
  weight = "regular",
  size = "body",
  style,
  ...props
}: AppTextProps) {
  const { theme } = useTheme();
  const color =
    tone === "secondary"
      ? theme.textSecondary
      : tone === "muted"
        ? theme.primary
        : theme.text;
  const fontSize =
    { small: 13, body: 16, heading: 23, title: 31 }[size] * theme.fontScale;
  return (
    <Text
      {...props}
      style={[
        {
          color,
          fontFamily:
            weight === "semibold" ? theme.fontFamilySemibold : theme.fontFamily,
          fontSize,
          lineHeight: fontSize * 1.4,
        },
        style,
      ]}
    />
  );
}
