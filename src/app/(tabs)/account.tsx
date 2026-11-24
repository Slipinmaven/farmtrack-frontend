import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { AppText } from "@/components/ui/app-text";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type Tool = {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: Href;
  group: string;
  keywords: string;
  nestedTitle?: string;
};

type ToolGroup = {
  title: string;
  description?: string;
  tools: Tool[];
};

const toolGroups: ToolGroup[] = [
  {
    title: "Farm operations",
    description: "Record and manage day-to-day farm work.",
    tools: [
      {
        title: "Sales",
        description: "Record a sale",
        icon: "cash-outline",
        href: "/sales/new",
        group: "Farm operations",
        keywords: "sell selling customer income money eggs chicken produce",
      },
      {
        title: "Purchases",
        description: "Buy chickens, feed or supplies",
        icon: "bag-handle-outline",
        href: "/purchases",
        group: "Farm operations",
        keywords:
          "buy purchase supplier stock feed medicine supplies spend cost",
      },
      {
        title: "Expenses",
        description: "Record and review farm costs",
        icon: "wallet-outline",
        href: "/expenses",
        group: "Farm operations",
        keywords: "spending cost costs money paid bill labor feed utilities",
      },
      {
        title: "Inventory",
        description: "Check stock and stock movements",
        icon: "file-tray-stacked-outline",
        href: "/inventory",
        group: "Farm operations",
        keywords: "stock quantity on hand supplies products balance",
      },
      {
        title: "Product consumption",
        description: "Record feed, medicine and supply use",
        icon: "nutrition-outline",
        href: "/inventory/consumption",
        group: "Farm operations",
        keywords:
          "use used consume consumption feed medication medicine vaccines inputs",
      },
      {
        title: "Opening stock",
        description: "Set up starting inventory quantities",
        icon: "archive-outline",
        href: "/inventory/opening-stock",
        group: "Farm operations",
        keywords:
          "initial opening beginning starting stock balance setup inventory",
      },
      {
        title: "Egg collection",
        description: "Record eggs collected or lost",
        icon: "egg-outline",
        href: "/egg-collection",
        group: "Farm operations",
        keywords: "eggs lay laying collect collection production gathered",
      },
      {
        title: "Chicken movement",
        description: "Move birds between farm blocks",
        icon: "git-compare-outline",
        href: "/chicken-movement",
        group: "Farm operations",
        keywords: "move transfer relocate birds flock block",
      },
      {
        title: "Chicken losses",
        description: "Record and review bird losses",
        icon: "alert-circle-outline",
        href: "/chicken-loss",
        group: "Farm operations",
        keywords: "dead mortality death loss losses missing chickens hens",
      },
      {
        title: "Receipts",
        description: "Find sales, purchase and payment receipts",
        icon: "receipt-outline",
        href: "/receipts",
        group: "Farm operations",
        keywords:
          "proof payment invoice transaction history document sale purchase",
      },
    ],
  },
  {
    title: "Farm setup",
    description: "Configure the farm and the people and records it uses.",
    tools: [
      {
        title: "Farm profile",
        description: "Name, logo and contact details",
        icon: "business-outline",
        href: "/settings",
        group: "Farm setup",
        nestedTitle: "Identity & contact",
        keywords:
          "farm name description logo address phone email details profile",
      },
      {
        title: "Theme & appearance",
        description: "Colors, light or dark mode and text size",
        icon: "color-palette-outline",
        href: { pathname: "/settings", params: { section: "appearance" } },
        group: "Farm setup",
        nestedTitle: "Farm profile › Brand & appearance",
        keywords:
          "theme themes color colours colors dark light system mode font text size accessibility appearance",
      },
      {
        title: "Currency & time zone",
        description: "Set local money and time defaults",
        icon: "globe-outline",
        href: { pathname: "/settings", params: { section: "region" } },
        group: "Farm setup",
        nestedTitle: "Farm profile › Regional defaults",
        keywords: "currency money kes timezone time region country date",
      },
      {
        title: "Farm capacity & status",
        description: "Set bird capacity or pause a farm",
        icon: "speedometer-outline",
        href: { pathname: "/settings", params: { section: "capacity" } },
        group: "Farm setup",
        nestedTitle: "Farm profile › Capacity",
        keywords:
          "maximum birds chickens limit farm active inactive pause status",
      },
      {
        title: "Team & invitations",
        description: "Manage farm access and invitations",
        icon: "people-circle-outline",
        href: "/farm-team",
        group: "Farm setup",
        keywords:
          "staff workers employees manager owner permissions roles access invite membership",
      },
      {
        title: "Blocks",
        description: "Manage housing areas and bird capacity",
        icon: "grid-outline",
        href: "/(tabs)/blocks",
        group: "Farm setup",
        keywords: "houses coops pens sheds housing flock location",
      },
      {
        title: "Products",
        description: "Manage farm products and units",
        icon: "cube-outline",
        href: "/products",
        group: "Farm setup",
        keywords: "items feed medicine eggs chickens catalog goods",
      },
      {
        title: "Units",
        description: "Configure measures and conversions",
        icon: "scale-outline",
        href: "/units",
        group: "Farm setup",
        keywords:
          "measurement kilo kilogram kg litre liter bag tray conversion",
      },
      {
        title: "Contacts",
        description: "Manage customers and suppliers",
        icon: "people-outline",
        href: "/contacts",
        group: "Farm setup",
        keywords: "people customer buyer vendor supplier phone address",
      },
      {
        title: "Expense categories",
        description: "Organize farm spending",
        icon: "pricetags-outline",
        href: "/settings/expense-categories",
        group: "Farm setup",
        keywords:
          "cost labels classification feed labor utilities category spending",
      },
    ],
  },
  {
    title: "Insights & records",
    description: "Review what happened and how the farm is doing.",
    tools: [
      {
        title: "Reports",
        description: "Review sales, production and costs",
        icon: "bar-chart-outline",
        href: "/reports",
        group: "Insights & records",
        keywords:
          "analytics profit performance summary finances egg production",
      },
      {
        title: "FarmMate",
        description: "Ask FarmMate about farm profitability",
        icon: "sparkles-outline",
        href: {
          pathname: "/assistant",
          params: { source_route: "/(tabs)/account" },
        },
        group: "Insights & records",
        keywords: "FarmMate AI assistant chat bubble profitability report farm questions",
      },
      {
        title: "Activities",
        description: "Search the farm’s recorded changes",
        icon: "pulse-outline",
        href: "/activities",
        group: "Insights & records",
        keywords: "audit log history who changed actions events",
      },
      {
        title: "Notifications",
        description: "See updates and reminders",
        icon: "notifications-outline",
        href: "/notifications",
        group: "Insights & records",
        keywords: "alerts messages updates reminders due",
      },
    ],
  },
  {
    title: "Account",
    tools: [
      {
        title: "Account & security",
        description: "Password, app lock and sign-in activity",
        icon: "shield-checkmark-outline",
        href: "/account-details",
        group: "Account",
        keywords:
          "email password pin biometric lock login sign in security device",
      },
    ],
  },
];

const quickToolTitles = ["Sales", "Egg collection", "Purchases", "Expenses"];

const synonyms: Record<string, string[]> = {
  who: ["team", "worker", "employee"],
  works: ["team", "worker", "employee"],
  work: ["team", "worker", "employee", "activity"],
  selling: ["sales", "purchase"],
  appearance: ["theme", "color", "font", "text"],
  setting: ["theme", "appearance", "profile"],
  settings: ["theme", "appearance", "profile"],
  look: ["theme", "appearance", "color"],
  styling: ["theme", "appearance", "color"],
  dark: ["theme", "appearance", "mode"],
  night: ["theme", "dark", "mode"],
  brightness: ["theme", "light", "dark"],
  staff: ["team", "worker", "manager"],
  employee: ["team", "worker"],
  employees: ["team", "worker"],
  hen: ["chicken", "bird"],
  hens: ["chicken", "bird"],
  poultry: ["chicken", "bird", "egg"],
  medicine: ["medication", "product", "consumption"],
  drugs: ["medication", "medicine", "consumption"],
  feed: ["product", "consumption", "purchase"],
  food: ["feed", "consumption", "purchase"],
  money: ["expense", "purchase", "currency", "sales"],
  cost: ["expense", "purchase", "spending"],
  costs: ["expense", "purchase", "spending"],
  spending: ["expense", "purchase"],
  spend: ["expense", "purchase"],
  spent: ["expense", "purchase", "spending"],
  paid: ["expense", "purchase", "receipt"],
  bought: ["purchase"],
  buy: ["purchase"],
  eggs: ["egg", "collection", "sales"],
  collect: ["egg", "collection"],
  collected: ["egg", "collection"],
  gather: ["egg", "collection"],
  gathered: ["egg", "collection"],
  coop: ["block", "housing"],
  house: ["block", "housing"],
  houses: ["block", "housing"],
  currency: ["region", "money"],
  time: ["timezone", "region"],
  zone: ["timezone", "region"],
  operation: ["farm", "setup", "tools"],
  operations: ["farm", "setup", "tools"],
  login: ["security", "account"],
  sign: ["security", "account", "activity"],
  receipt: ["receipts", "purchase", "sales"],
};
const conversationalWords = new Set([
  "a",
  "about",
  "are",
  "can",
  "do",
  "does",
  "find",
  "for",
  "get",
  "has",
  "have",
  "here",
  "how",
  "i",
  "in",
  "inside",
  "is",
  "me",
  "my",
  "on",
  "of",
  "open",
  "please",
  "what",
  "where",
  "why",
  "show",
  "that",
  "the",
  "there",
  "this",
  "to",
  "tool",
  "want",
  "we",
  "which",
]);

function normalize(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshteinWithinOne(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) return false;
  let row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const next = [i];
    let rowMinimum = i;
    for (let j = 1; j <= right.length; j += 1) {
      const value = Math.min(
        next[j - 1] + 1,
        row[j] + 1,
        row[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      next.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > 1) return false;
    row = next;
  }
  return row[right.length] <= 1;
}

function searchScore(tool: Tool, query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 0;
  const title = normalize(tool.title);
  const nested = normalize(tool.nestedTitle ?? "");
  const group = normalize(tool.group);
  const description = normalize(tool.description);
  const keywords = normalize(tool.keywords);
  const searchable = `${title} ${nested} ${group} ${description} ${keywords}`;
  const words = searchable.split(" ");
  const queryTokens = normalizedQuery
    .split(" ")
    .filter((token) => token.length > 1 && !conversationalWords.has(token));
  if (queryTokens.length === 0) return 0;
  let score =
    normalizedQuery.length > 1 && searchable.includes(normalizedQuery) ? 5 : 0;

  for (const token of queryTokens) {
    const candidates = [token, ...(synonyms[token] ?? [])];
    let tokenScore = 0;
    for (const candidate of candidates) {
      if (title.includes(candidate)) tokenScore = Math.max(tokenScore, 8);
      else if (nested.includes(candidate)) tokenScore = Math.max(tokenScore, 7);
      else if (keywords.includes(candidate))
        tokenScore = Math.max(tokenScore, 6);
      else if (description.includes(candidate))
        tokenScore = Math.max(tokenScore, 4);
      else if (group.includes(candidate)) tokenScore = Math.max(tokenScore, 3);
      else if (
        candidate.length >= 4 &&
        words.some((word) => levenshteinWithinOne(candidate, word))
      ) {
        tokenScore = Math.max(tokenScore, 1);
      }
    }
    if (tokenScore === 0) return 0;
    score += tokenScore;
  }
  return score;
}

export default function AccountScreen() {
  const auth = useAuth();
  const { selectedFarm } = useFarm();
  const { theme } = useTheme();
  const isFarmOwner = selectedFarm?.owner_id === auth.user?.id;
  const [search, setSearch] = useState("");
  const normalizedSearch = normalize(search);
  const visibleToolGroups = useMemo(() => {
    if (isFarmOwner) return toolGroups;
    return toolGroups.map((group) => {
      if (group.title !== "Farm setup") return group;
      return {
        ...group,
        tools: group.tools
          .filter((tool) =>
            ["Farm profile", "Team & invitations"].includes(tool.title),
          )
          .map((tool) =>
            tool.title === "Farm profile"
              ? {
                  ...tool,
                  description: "View shared details or leave this farm",
                  keywords: `${tool.keywords} leave membership read only`,
                }
              : tool,
          ),
      };
    });
  }, [isFarmOwner]);
  const visibleTools = useMemo(
    () => visibleToolGroups.flatMap((group) => group.tools),
    [visibleToolGroups],
  );
  const quickTools = useMemo(
    () =>
      quickToolTitles
        .map((title) => visibleTools.find((tool) => tool.title === title))
        .filter((tool): tool is Tool => Boolean(tool)),
    [visibleTools],
  );
  const results = useMemo(() => {
    if (!normalizedSearch) return [];
    return visibleTools
      .map((tool) => ({ tool, score: searchScore(tool, normalizedSearch) }))
      .filter((result) => result.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.tool.title.localeCompare(right.tool.title),
      )
      .map(({ tool }) => tool);
  }, [normalizedSearch, visibleTools]);

  function openTool(tool: Tool) {
    router.push(tool.href);
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <FarmPageHeader title="More" />

        <View
          style={[
            styles.searchField,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}
        >
          <Ionicons
            name="search-outline"
            size={20}
            color={theme.textSecondary}
          />
          <TextInput
            accessibilityLabel="Search all farm tools and settings"
            value={search}
            onChangeText={setSearch}
            placeholder="Search tools, settings or tasks"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={[styles.searchInput, { color: theme.text }]}
          />
          {search ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear tool search"
              hitSlop={8}
              onPress={() => setSearch("")}
            >
              <Ionicons
                name="close-circle"
                size={20}
                color={theme.textSecondary}
              />
            </Pressable>
          ) : null}
        </View>
        <AppText size="small" tone="secondary" style={styles.searchHint}>
          Try “dark mode”, “feed”, “money spent” or “staff”.
        </AppText>

        {normalizedSearch ? (
          <View style={styles.searchResults}>
            <View style={styles.resultHeading} accessibilityLiveRegion="polite">
              <AppText size="body" weight="semibold">
                Search results
              </AppText>
              <AppText size="small" tone="secondary">
                {results.length} {results.length === 1 ? "match" : "matches"}
              </AppText>
            </View>
            {results.length ? (
              <View
                style={[
                  styles.panel,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}
              >
                {results.map((tool, index) => (
                  <ToolRow
                    key={`${tool.group}:${tool.title}`}
                    tool={tool}
                    showGroup
                    last={index === results.length - 1}
                    onPress={() => openTool(tool)}
                  />
                ))}
              </View>
            ) : (
              <View
                style={[
                  styles.emptySearch,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.emptyIcon,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Ionicons
                    name="search-outline"
                    size={21}
                    color={theme.primary}
                  />
                </View>
                <View style={styles.emptyCopy}>
                  <AppText weight="semibold">No matching tools</AppText>
                  <AppText size="small" tone="secondary">
                    Try a task or another name, like “appearance” or “supplier”.
                  </AppText>
                </View>
              </View>
            )}
          </View>
        ) : (
          <>
            <View style={styles.quickSection}>
              <View style={styles.sectionHeading}>
                <View>
                  <AppText size="body" weight="semibold">
                    Quick actions
                  </AppText>
                  <AppText size="small" tone="secondary">
                    Start common farm tasks
                  </AppText>
                </View>
              </View>
              <View style={styles.quickGrid}>
                {quickTools.map((tool, index) => (
                  <QuickAction
                    key={tool.title}
                    tool={tool}
                    accent={index}
                    onPress={() => openTool(tool)}
                  />
                ))}
              </View>
            </View>

            {visibleToolGroups.map((group) => (
              <View key={group.title} style={styles.sectionWrap}>
                <View style={styles.sectionHeading}>
                  <View>
                    <AppText size="body" weight="semibold">
                      {group.title}
                    </AppText>
                    {group.description ? (
                      <AppText size="small" tone="secondary">
                        {group.description}
                      </AppText>
                    ) : null}
                  </View>
                </View>
                <View
                  style={[
                    styles.panel,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  {group.tools.map((tool, index) => (
                    <ToolRow
                      key={tool.title}
                      tool={tool}
                      last={index === group.tools.length - 1}
                      onPress={() => openTool(tool)}
                    />
                  ))}
                </View>
              </View>
            ))}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out of FarmTrack"
              style={({ pressed }) => [
                styles.signOut,
                {
                  backgroundColor: pressed
                    ? `${theme.danger}18`
                    : theme.backgroundElement,
                  borderColor: `${theme.danger}60`,
                },
              ]}
              onPress={() => void auth.signOut()}
            >
              <View
                style={[
                  styles.signOutIcon,
                  { backgroundColor: `${theme.danger}18` },
                ]}
              >
                <Ionicons
                  name="log-out-outline"
                  size={19}
                  color={theme.danger}
                />
              </View>
              <View style={styles.signOutCopy}>
                <AppText weight="semibold" style={{ color: theme.danger }}>
                  Sign out
                </AppText>
                <AppText size="small" tone="secondary">
                  Sign out of this account on this device
                </AppText>
              </View>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ToolRow({
  tool,
  showGroup = false,
  last,
  onPress,
}: {
  tool: Tool;
  showGroup?: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${tool.title}, ${tool.nestedTitle ? `${tool.nestedTitle}, ` : ""}${tool.group}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.toolRow,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
        },
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}
    >
      <View
        style={[styles.toolIcon, { backgroundColor: theme.backgroundSelected }]}
      >
        <Ionicons name={tool.icon} size={19} color={theme.primary} />
      </View>
      <View style={styles.toolCopy}>
        <AppText weight="semibold" style={styles.toolTitle}>
          {tool.title}
        </AppText>
        {showGroup || tool.nestedTitle ? (
          <AppText
            size="small"
            style={{ color: theme.primary }}
            numberOfLines={1}
          >
            {tool.nestedTitle ?? tool.group}
          </AppText>
        ) : null}
        <AppText
          size="small"
          tone="secondary"
          numberOfLines={showGroup ? 2 : 1}
        >
          {tool.description}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

function QuickAction({
  tool,
  accent,
  onPress,
}: {
  tool: Tool;
  accent: number;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const actionColors = [
    theme.primary,
    theme.secondary,
    theme.primary,
    theme.secondary,
  ];
  const color = actionColors[accent % actionColors.length];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        {
          backgroundColor: pressed
            ? theme.backgroundSelected
            : theme.backgroundElement,
          borderColor: theme.border,
        },
      ]}
    >
      <View style={[styles.quickIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={tool.icon} size={20} color={color} />
      </View>
      <View style={styles.quickCopy}>
        <AppText weight="semibold" numberOfLines={1}>
          {tool.title}
        </AppText>
        <AppText size="small" tone="secondary" numberOfLines={1}>
          {tool.description}
        </AppText>
      </View>
      <Ionicons name="arrow-forward" size={16} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 34,
    gap: 18,
  },
  searchField: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 13,
  },
  searchInput: { flex: 1, minWidth: 0, minHeight: 48, fontSize: 16 },
  searchHint: { marginTop: -13, paddingHorizontal: 3 },
  quickSection: { gap: 10 },
  sectionHeading: { gap: 2 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  quickAction: {
    width: "48%",
    minHeight: 88,
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingVertical: 11,
  },
  quickIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  quickCopy: { flex: 1, minWidth: 0, gap: 2 },
  sectionWrap: { gap: 9 },
  panel: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  toolRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  toolIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  toolCopy: { flex: 1, minWidth: 0, gap: 1 },
  toolTitle: { fontSize: 15, lineHeight: 20 },
  searchResults: { gap: 10 },
  resultHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  emptySearch: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  emptyIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  emptyCopy: { flex: 1, gap: 3 },
  signOut: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  signOutIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  signOutCopy: { flex: 1, gap: 2 },
});
