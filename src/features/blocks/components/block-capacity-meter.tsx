import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/app-text";
import type { Block } from "@/features/blocks/types";
import { useTheme } from "@/providers/theme-provider";

type BlockCapacityMeterProps = {
  block: Pick<
    Block,
    "capacity" | "over_capacity_limit" | "occupied_chickens"
  >;
  compact?: boolean;
};

export function BlockCapacityMeter({
  block,
  compact = false,
}: BlockCapacityMeterProps) {
  const { theme } = useTheme();
  const maximum = block.capacity + block.over_capacity_limit;
  const occupied = block.occupied_chickens;
  const available = Math.max(maximum - occupied, 0);
  const ratio = maximum > 0 ? Math.min(occupied / maximum, 1) : 0;
  const baseRatio = maximum > 0 ? Math.min(block.capacity / maximum, 1) : 0;
  const isOverCapacity = occupied > maximum;
  const isAtMaximum = maximum > 0 && occupied >= maximum;
  const isUsingExtra = occupied > block.capacity && !isAtMaximum;
  const isNearlyFull =
    block.capacity > 0 && occupied >= block.capacity * 0.85 && !isUsingExtra;
  const isDanger = isOverCapacity || isAtMaximum;
  const isWarning = isUsingExtra || isNearlyFull;
  const statusColor = isDanger
    ? theme.danger
    : isWarning
      ? theme.mode === "dark"
        ? "#E7B34C"
        : "#A46000"
      : theme.success;
  const statusLabel = isOverCapacity
    ? `Over capacity by ${(occupied - maximum).toLocaleString()}`
    : isAtMaximum
      ? "At maximum capacity"
      : isUsingExtra
        ? "Using extra allowance"
        : isNearlyFull
          ? "Nearly full"
          : maximum === 0
            ? "No capacity set"
            : "Capacity available";
  const barColor = isDanger
    ? theme.danger
    : isWarning
      ? theme.mode === "dark"
        ? "#E7B34C"
        : "#A46000"
      : theme.success;

  return (
    <View style={[styles.container, compact && styles.compact]}>
      <View style={styles.heading}>
        <AppText size="small" tone="secondary">
          Occupancy
        </AppText>
        <AppText weight="semibold">
          {occupied.toLocaleString()} / {maximum.toLocaleString()}
        </AppText>
      </View>
      <View
        accessibilityLabel={`${occupied} chickens, ${statusLabel}`}
        style={[styles.track, { backgroundColor: theme.backgroundSelected }]}
      >
        <View
          style={[
            styles.fill,
            { width: `${ratio * 100}%`, backgroundColor: barColor },
          ]}
        />
        {block.capacity > 0 && maximum > block.capacity ? (
          <View
            style={[
              styles.baseMarker,
              { left: `${baseRatio * 100}%`, backgroundColor: theme.text },
            ]}
          />
        ) : null}
      </View>
      <View style={styles.footer}>
        <AppText size="small" style={{ color: statusColor }}>
          {statusLabel}
        </AppText>
        <AppText size="small" tone="secondary">
          {available.toLocaleString()} available
        </AppText>
      </View>
      <View style={styles.footer}>
        <AppText size="small" tone="secondary">
          {block.capacity.toLocaleString()} base
          {block.over_capacity_limit > 0
            ? ` · ${block.over_capacity_limit.toLocaleString()} extra allowance`
            : ""}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  compact: { gap: 6 },
  heading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  track: {
    height: 9,
    borderRadius: 5,
    overflow: "hidden",
    position: "relative",
  },
  fill: { height: "100%", borderRadius: 5 },
  baseMarker: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    opacity: 0.75,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
});
