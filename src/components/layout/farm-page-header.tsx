import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/app-text";
import { FarmTrackMark } from "@/components/branding/farmtrack-mark";
import { useUnreadNotificationCount } from "@/features/management/hooks";
import { getFarmLogoUri } from "@/features/farms/logo";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type FarmPageHeaderProps = {
  title: string;
  showBack?: boolean;
  backHref?: Href;
  fallbackHref?: Href;
  showNotifications?: boolean;
};

export function FarmPageHeader({
  title,
  showBack = false,
  backHref,
  fallbackHref,
  showNotifications = true,
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
  const logoUri = getFarmLogoUri(logoPath);
  const showLogo = Boolean(logoUri && failedLogoUri !== logoUri);

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(backHref ?? fallbackHref ?? "/(tabs)");
    }
  }

  return (
    <View style={styles.container}>
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          onPress={goBack}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
      ) : null}
      <View
        style={[
          styles.logo,
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
          <FarmTrackMark size={34} />
        )}
      </View>
      <View style={styles.titleGroup}>
        <AppText size="heading" weight="semibold" numberOfLines={1}>
          {title}
        </AppText>
        <AppText size="small" tone="secondary" numberOfLines={1}>
          {farm.selectedFarm?.name ?? "FarmTrack"}
        </AppText>
      </View>
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
          style={styles.notificationButton}
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
  backButton: {
    width: 32,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 11,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  titleGroup: {
    flex: 1,
    gap: 1,
  },
  notificationButton: {
    width: 36,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
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
