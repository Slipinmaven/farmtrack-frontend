import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { AppText } from "@/components/ui/app-text";
import { useTheme } from "@/providers/theme-provider";

const saleOptions = [
  {
    title: "Sell eggs",
    detail: "Record an egg sale and any payment received.",
    icon: "egg-outline",
    route: "/egg-sale",
  },
  {
    title: "Sell chickens",
    detail: "Record a chicken sale and delivery details.",
    icon: "leaf-outline",
    route: "/chicken-sale",
  },
] as const;

export default function NewSaleScreen() {
  return (
    <SessionGate>
      <NewSaleContent />
    </SessionGate>
  );
}

function NewSaleContent() {
  const { theme } = useTheme();
  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <FarmPageHeader title="Record sale" showBack />
        <AppText size="small" tone="secondary">
          Choose what you sold.
        </AppText>
        {saleOptions.map((option) => (
          <Pressable
            key={option.route}
            accessibilityRole="button"
            onPress={() => router.push(option.route)}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: pressed
                  ? theme.backgroundSelected
                  : theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <View
              style={[
                styles.icon,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <Ionicons
                name={option.icon}
                size={21}
                color={theme.primary}
              />
            </View>
            <View style={styles.copy}>
              <AppText weight="semibold">{option.title}</AppText>
              <AppText size="small" tone="secondary">
                {option.detail}
              </AppText>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.textSecondary}
            />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 12 },
  option: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 3 },
});
