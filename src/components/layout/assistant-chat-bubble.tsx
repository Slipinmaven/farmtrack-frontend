import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated as RNAnimated,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/app-text";
import { useAssistantBubblePreference } from "@/providers/assistant-bubble-preference";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

const AnimatedRect = RNAnimated.createAnimatedComponent(Rect);
const AnimatedView = RNAnimated.View;
const buttonWidth = 184;
const buttonHeight = 62;

export function AssistantChatBubble() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  const { status: farmStatus } = useFarm();
  const { theme } = useTheme();
  const preference = useAssistantBubblePreference();
  const [expanded, setExpanded] = useState(false);
  const [borderActive, setBorderActive] = useState(false);
  const [pillBorderVisible, setPillBorderVisible] = useState(false);
  const [widthProgress] = useState(() => new RNAnimated.Value(0));
  const [dashOffset] = useState(() => new RNAnimated.Value(0));
  const previousPath = useRef(pathname);
  const isVisible =
    status === "authenticated" &&
    farmStatus === "ready" &&
    preference.loaded &&
    preference.enabled &&
    !pathname.startsWith("/assistant");

  useEffect(() => {
    if (!expanded || !borderActive) return;
    const animation = RNAnimated.loop(
      RNAnimated.timing(dashOffset, {
        toValue: -456,
        duration: 1800,
        useNativeDriver: false,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [borderActive, dashOffset, expanded]);

  const collapse = useCallback(() => {
    setBorderActive(false);
    setPillBorderVisible(false);
    RNAnimated.spring(widthProgress, {
      toValue: 0,
      useNativeDriver: false,
      damping: 20,
      stiffness: 230,
    }).start(() => setExpanded(false));
  }, [widthProgress]);

  useEffect(() => {
    const previous = previousPath.current;
    previousPath.current = pathname;
    const returnedFromAssistant =
      previous.startsWith("/assistant") && !pathname.startsWith("/assistant");
    if (returnedFromAssistant) collapse();
  }, [collapse, pathname]);

  if (!isVisible) return null;

  function handlePress() {
    if (expanded) {
      const sourceRoute =
        pathname.startsWith("/products/") && pathname.endsWith("/inventory")
          ? "/products/[productId]/inventory"
          : pathname;
      router.push({
        pathname: "/assistant",
        params: { source_route: sourceRoute },
      });
      return;
    }

    setExpanded(true);
    RNAnimated.spring(widthProgress, {
      toValue: 1,
      useNativeDriver: false,
      damping: 19,
      stiffness: 230,
    }).start(({ finished }) => {
      if (!finished) return;
      setPillBorderVisible(true);
      setBorderActive(true);
    });
  }

  const width = widthProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [buttonHeight, buttonWidth],
  });
  const labelOpacity = widthProgress;

  return (
    <View
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
    >
      {expanded ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close FarmMate launcher"
          onPress={collapse}
          style={styles.dismissArea}
        />
      ) : null}
      <View
        pointerEvents="box-none"
        style={[styles.position, { bottom: Math.max(insets.bottom, 12) + 82 }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open FarmMate assistant"
          accessibilityHint={
            expanded
              ? "Opens the assistant"
              : "Expands the assistant button. Tap again to open."
          }
          onPress={handlePress}
          style={styles.pressable}
        >
          <AnimatedView
            style={[
              styles.bubble,
              {
                width,
                backgroundColor: expanded
                  ? theme.backgroundElement
                  : theme.primary,
              },
            ]}
          >
            <AnimatedView
              style={[
                styles.labelWrap,
                {
                  opacity: labelOpacity,
                  transform: [
                    {
                      translateX: widthProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-6, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <AppText
                numberOfLines={1}
                size="small"
                weight="semibold"
                style={{ color: theme.text }}
              >
                Ask FarmMate
              </AppText>
            </AnimatedView>
            <View style={styles.iconSlot}>
              <Ionicons
                name="sparkles"
                size={22}
                color={expanded ? theme.primary : theme.onPrimary}
              />
            </View>
          </AnimatedView>
          <View pointerEvents="none" style={styles.borderOverlay}>
            <Svg width={buttonWidth} height={buttonHeight} viewBox="0 0 184 62">
              <Defs>
                <LinearGradient id="farmMateBorder" x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor="#52D6C8" />
                  <Stop offset="35%" stopColor="#6C9BFF" />
                  <Stop offset="68%" stopColor="#BB72F3" />
                  <Stop offset="100%" stopColor="#F4B85D" />
                </LinearGradient>
              </Defs>
              {pillBorderVisible ? (
                <AnimatedRect
                  x="2"
                  y="2"
                  width="180"
                  height="58"
                  rx="29"
                  fill="none"
                  stroke="url(#farmMateBorder)"
                  strokeWidth="2.5"
                  strokeDasharray="92 364"
                  strokeDashoffset={dashOffset}
                />
              ) : (
                <Circle
                  cx="153"
                  cy="31"
                  r="29"
                  fill="none"
                  stroke="url(#farmMateBorder)"
                  strokeWidth="2.5"
                />
              )}
            </Svg>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dismissArea: {
    ...StyleSheet.absoluteFill,
    zIndex: 99,
    elevation: 9,
  },
  position: {
    position: "absolute",
    right: 18,
    zIndex: 100,
    elevation: 10,
  },
  pressable: {
    width: buttonWidth,
    height: buttonHeight,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  bubble: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    borderRadius: 31,
    paddingHorizontal: 15,
    gap: 10,
    shadowColor: "#061B2A",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 7,
  },
  iconSlot: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  labelWrap: {
    flex: 1,
    overflow: "hidden",
  },
  borderOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
});
