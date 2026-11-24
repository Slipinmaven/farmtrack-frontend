import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/app-text";
import { FarmTrackMark } from "@/components/branding/farmtrack-mark";
import { useUnreadNotificationCount } from "@/features/management/hooks";
import { useFarmLogo } from "@/features/farms/use-farm-logo";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type FarmPageHeaderProps = {
  title: string;
  showBack?: boolean;
  backHref?: Href;
  fallbackHref?: Href;
  showNotifications?: boolean;
  compact?: boolean;
  rightAction?: ReactNode;
};

export function FarmPageHeader({
  title,
  showBack = false,
  backHref,
  fallbackHref,
  showNotifications = true,
  compact = false,
  rightAction,
}: FarmPageHeaderProps) {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const unreadCount = useUnreadNotificationCount(
    user?.id,
    farm.selectedFarm?.id,
  );
  const [failedLogoUri, setFailedLogoUri] = useState<string | null>(null);
  const logoPath = farm.selectedFarm?.settings?.logo_path?.trim();
  const { uri: logoUri } = useFarmLogo(logoPath);
  const showLogo = Boolean(logoUri && failedLogoUri !== logoUri);

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(backHref ?? fallbackHref ?? "/(tabs)");
    }
  }

  return (
    <View style={[styles.container, compact && styles.compactContainer]}>
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          onPress={goBack}
          style={[styles.backButton, compact && styles.compactBackButton]}
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
      ) : null}
      <View
        style={[
          styles.logo,
          compact && styles.compactLogo,
          { backgroundColor: showLogo ? theme.primary : theme.backgroundSelected },
        ]}
      >
        {showLogo ? (
          <Image
            source={{ uri: logoUri! }}
            contentFit="cover"
            onError={() => setFailedLogoUri(logoUri)}
            style={styles.logoImage}
            accessibilityLabel={`${farm.selectedFarm?.name ?? "Farm"} logo`}
          />
        ) : (
          <FarmTrackMark size={compact ? 27 : 34} />
        )}
      </View>
      <View style={styles.titleGroup}>
        <AppText
          size={compact ? "body" : "heading"}
          weight="semibold"
          numberOfLines={1}
        >
          {title}
        </AppText>
        <AppText size="small" tone="secondary" numberOfLines={1}>
          {farm.selectedFarm?.name ?? "FarmTrack"}
        </AppText>
      </View>
      {rightAction ? <View style={styles.rightAction}>{rightAction}</View> : null}
      {showNotifications ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            unreadCount.data
              ? `Notifications, ${unreadCount.data} unread`
              : "Notifications"
          }
          hitSlop={8}
          onPress={() => router.push("/notifications")}
          style={[
            styles.notificationButton,
            compact && styles.compactNotificationButton,
          ]}
        >
          <Ionicons name="notifications-outline" size={22} color={theme.text} />
          {unreadCount.data ? (
            <View style={[styles.badge, { backgroundColor: theme.danger }]}>
              <AppText style={styles.badgeText}>
                {unreadCount.data > 99 ? "99+" : unreadCount.data}
              </AppText>
            </View>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 2,
  },
  compactContainer: { minHeight: 38, gap: 7, marginBottom: 0 },
  backButton: {
    width: 32,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  compactBackButton: { width: 28, height: 32 },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 11,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  compactLogo: { width: 30, height: 30, borderRadius: 9 },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  titleGroup: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rightAction: { flexShrink: 0 },
  notificationButton: {
    width: 36,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  compactNotificationButton: { width: 32, height: 34 },
  badge: {
    position: "absolute",
    top: 1,
    right: 0,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
  },
});
