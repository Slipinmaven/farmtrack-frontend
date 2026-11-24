import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { SessionGate } from "@/components/layout/session-gate";
import { useTheme } from "@/providers/theme-provider";

const getTabIcon = (routeName: string, focused: boolean) => {
  switch (routeName) {
    case "index":
      return focused ? "home" : "home-outline";
    case "flock":
      return focused ? "leaf" : "leaf-outline";
    case "eggs":
      return focused ? "egg" : "egg-outline";
    case "sales":
      return focused ? "cash" : "cash-outline";
    case "account":
      return focused ? "ellipsis-horizontal" : "ellipsis-horizontal-outline";
    default:
      return "ellipse-outline";
  }
};

export default function TabLayout() {
  const { theme } = useTheme();

  return (
    <SessionGate>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          sceneStyle: { backgroundColor: theme.background },
          tabBarActiveTintColor: theme.onPrimary,
          tabBarInactiveTintColor: `${theme.onPrimary}B3`,
          tabBarShowLabel: true,
          tabBarStyle: {
            backgroundColor: theme.primary,
            borderTopColor: theme.secondary,
            borderTopWidth: 1,
            minHeight: 74,
            paddingTop: 6,
            paddingBottom: 10,
            height: 74,
            elevation: 0,
            shadowOpacity: 0,
            shadowRadius: 0,
          },
          tabBarItemStyle: {
            paddingVertical: 0,
            marginHorizontal: 0,
            justifyContent: "center",
            borderRadius: 0,
            backgroundColor: "transparent",
          },
          tabBarLabelStyle: {
            fontFamily: theme.fontFamilySemibold,
            fontSize: 10,
            marginTop: 1,
          },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={getTabIcon(route.name, focused)}
              size={focused ? 21 : 20}
              color={typeof color === "number" ? theme.text : color ?? theme.text}
            />
          ),
        })}
      >
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="flock" options={{ title: "Chickens" }} />
        <Tabs.Screen name="eggs" options={{ title: "Eggs" }} />
        <Tabs.Screen name="sales" options={{ title: "Sales" }} />
        <Tabs.Screen name="account" options={{ title: "More" }} />
        <Tabs.Screen name="blocks" options={{ href: null }} />
      </Tabs>
    </SessionGate>
  );
}
