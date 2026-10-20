import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/app-text";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";

type SettingRow = {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  href?: Href;
};

const settingsSections = [
  {
    title: "Farm management",
    rows: [
      {
        title: "Farm profile & configuration",
        description:
          "Manage your farm name, description, logo, theme, currency, and time zone.",
        icon: "business-outline",
        href: "/settings",
      },
      {
        title: "Block management",
        description:
          "Organize housing areas, descriptions, capacity limits, and active status.",
        icon: "grid-outline",
        href: "/(tabs)/blocks",
      },
      {
        title: "Product management",
        description:
          "Maintain product types and descriptions, plus the units and conversions used for each.",
        icon: "cube-outline",
        href: "/products",
      },
      {
        title: "Unit configurations",
        description:
          "Create and edit measurement units by name and abbreviation for use across products.",
        icon: "scale-outline",
        href: "/units",
      },
      {
        title: "Contact management",
        description:
          "Keep customer and supplier details, roles, and related products organized.",
        icon: "people-outline",
        href: "/contacts",
      },
    ] as SettingRow[],
  },
  {
    title: "Daily operations",
    rows: [
      {
        title: "Inventory",
        description:
          "Review product stock, incoming supplies, and changes to on-hand quantities.",
        icon: "file-tray-stacked-outline",
        href: "/inventory",
      },
      {
        title: "Product consumption",
        description:
          "Track feed, medication, and other products used in farm operations.",
        icon: "nutrition-outline",
        href: "/inventory/consumption",
      },
      {
        title: "Expenses",
        description: "Record farm costs and organize spending by category.",
        icon: "wallet-outline",
        href: "/expenses",
      },
      {
        title: "Expense categories",
        description:
          "Add, rename, and deactivate the categories used to organize farm expenses.",
        icon: "pricetags-outline",
        href: "/settings/expense-categories",
      },
    ] as SettingRow[],
  },
  {
    title: "Updates & insights",
    rows: [
      {
        title: "Notifications",
        description:
          "See important updates about activity across your selected farm.",
        icon: "notifications-outline",
        href: "/notifications",
      },
      {
        title: "Activities",
        description:
          "Search and filter the changes and actions recorded across your farm.",
        icon: "pulse-outline",
        href: "/activities",
      },
      {
        title: "Reports",
        description:
          "Explore summaries for production, inventory, expenses, and sales.",
        icon: "bar-chart-outline",
        href: "/reports",
      },
    ] as SettingRow[],
  },
  {
    title: "Account",
    rows: [
      {
        title: "Account & access",
        description:
          "View your email, set an app lock, change your password, and review sign-in activity.",
        icon: "person-circle-outline",
        href: "/account-details",
      },
    ] as SettingRow[],
  },
];

export default function AccountScreen() {
  const auth = useAuth();
  const { theme } = useTheme();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={["top", "bottom"]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <FarmPageHeader title="Farm management" />

        {settingsSections.map((section) => (
          <View key={section.title} style={styles.sectionWrap}>
            <AppText size="small" tone="secondary" style={styles.sectionTitle}>
              {section.title.toUpperCase()}
            </AppText>

            <View
              style={[
                styles.panel,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            >
              {section.rows.map((row, index) => {
                const rowContent = (
                  <>
                    <View style={styles.rowLeft}>
                      <View
                        style={[
                          styles.iconWrap,
                          { backgroundColor: theme.primary },
                        ]}
                      >
                        <Ionicons
                          name={row.icon}
                          size={17}
                          color={theme.onPrimary}
                        />
                      </View>
                      <View style={styles.rowCopy}>
                        <AppText weight="semibold" style={styles.rowText}>
                          {row.title}
                        </AppText>
                        <AppText
                          size="small"
                          tone="secondary"
                          style={styles.description}
                          numberOfLines={2}
                        >
                          {row.description}
                        </AppText>
                      </View>
                    </View>
                    {row.href ? (
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={theme.textSecondary}
                        style={styles.chevron}
                      />
                    ) : (
                      <AppText
                        size="small"
                        tone="secondary"
                        style={styles.planned}
                      >
                        Planned
                      </AppText>
                    )}
                  </>
                );
                const rowStyle = [
                  styles.row,
                  index !== section.rows.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border,
                  },
                ];

                return row.href ? (
                  <Pressable
                    key={row.title}
                    accessibilityRole="button"
                    accessibilityLabel={`${row.title}. ${row.description}`}
                    onPress={() => router.push(row.href!)}
                    style={({ pressed }) => [
                      rowStyle,
                      pressed && { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    {rowContent}
                  </Pressable>
                ) : (
                  <View key={row.title} style={rowStyle}>
                    {rowContent}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        <Pressable
          style={({ pressed }) => [
            styles.footerRow,
            {
              backgroundColor: pressed
                ? theme.backgroundSelected
                : theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}
          onPress={() => void auth.signOut()}
        >
          <View style={styles.rowLeft}>
            <View style={[styles.iconWrap, { backgroundColor: theme.primary }]}>
              <Ionicons
                name="log-out-outline"
                size={17}
                color={theme.onPrimary}
              />
            </View>
            <AppText style={styles.rowText}>Sign out</AppText>
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingBottom: 34,
  },
  sectionWrap: {
    marginBottom: 20,
  },
  sectionTitle: {
    marginBottom: 9,
    paddingLeft: 4,
  },
  panel: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    minHeight: 72,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 0,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    flex: 1,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  rowCopy: {
    flex: 1,
    gap: 3,
  },
  chevron: {
    marginLeft: 8,
  },
  planned: {
    marginLeft: 8,
  },
  rowText: {
    fontSize: 15,
    lineHeight: 20,
  },
  description: {
    fontSize: 12,
    lineHeight: 17,
  },
});
