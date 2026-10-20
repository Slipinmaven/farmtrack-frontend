import { Stack } from "expo-router";

import { useTheme } from "@/providers/theme-provider";

export default function BlocksLayout() {
  const { theme } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
      }}
    />
  );
}
