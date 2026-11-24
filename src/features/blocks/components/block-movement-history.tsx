import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  FadeOutUp,
  Layout,
} from "react-native-reanimated";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { LoadingState } from "@/components/feedback/loading-state";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import type {
  ChickenMovementDirection,
  ChickenMovementHistoryFilters,
} from "@/features/chickens/api";
import { useChickenMovementHistory } from "@/features/chickens/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useTheme } from "@/providers/theme-provider";

const pageSize = 10;
const directionFilters: {
  value: ChickenMovementDirection;
  label: string;
}[] = [
  { value: "all", label: "All moves" },
  { value: "incoming", label: "Moved in" },
  { value: "outgoing", label: "Moved out" },
];
const timeFilters = [
  { value: "all", label: "Any time" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
] as const;

type TimeFilter = (typeof timeFilters)[number]["value"];

export function BlockMovementHistory({
  userId,
  farmId,
  blockId,
}: {
  userId: string | undefined;
  farmId: string | undefined;
  blockId: string;
}) {
  const { theme } = useTheme();
  const [direction, setDirection] = useState<ChickenMovementDirection>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const fromDate =
    timeFilter === "all" ? undefined : daysAgo(Number(timeFilter));
  const toDate = timeFilter === "all" ? undefined : localToday();
  const filters: ChickenMovementHistoryFilters = {
    blockId,
    direction,
    search: debouncedSearch,
    from_date: fromDate,
    to_date: toDate,
    limit: pageSize,
    offset,
  };
  const history = useChickenMovementHistory(userId, farmId, filters);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const result = history.data;
  const pageStart = result && result.total_count ? offset + 1 : 0;
  const pageEnd = result
    ? Math.min(offset + result.items.length, result.total_count)
    : 0;
  const hasFilters =
    direction !== "all" || timeFilter !== "all" || search.trim().length > 0;

  return (
    <View
      style={[
        styles.container,
        { borderTopColor: theme.border },
      ]}
    >
      <View style={styles.heading}>
        <View
          style={[
            styles.headingIcon,
            { backgroundColor: `${theme.primary}14` },
          ]}
        >
          <Ionicons
            name="swap-horizontal-outline"
            size={19}
            color={theme.primary}
          />
        </View>
        <View style={styles.headingCopy}>
          <AppText size="heading" weight="semibold" numberOfLines={1}>
            Movement history
          </AppText>
          <AppText size="small" tone="secondary" numberOfLines={1}>
            Transfers to and from this block
          </AppText>
        </View>
        {result ? (
          <View
            style={[
              styles.countBadge,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <AppText size="small" weight="semibold">
              {result.total_count.toLocaleString()}
            </AppText>
          </View>
        ) : null}
      </View>

      <TextField
        label="Search movements"
        placeholder="Batch, block, reason, or notes"
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          setOffset(0);
        }}
        returnKeyType="search"
      />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: filtersExpanded }}
        onPress={() => setFiltersExpanded((expanded) => !expanded)}
        style={[
          styles.filtersToggle,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
          },
        ]}
      >
        <View style={styles.filtersToggleCopy}>
          <AppText size="small" weight="semibold">
            Filters
          </AppText>
          <AppText size="small" tone="secondary">
            {directionFilters.find((filter) => filter.value === direction)?.label}
            {" · "}
            {timeFilters.find((filter) => filter.value === timeFilter)?.label}
          </AppText>
        </View>
        <Ionicons
          name={filtersExpanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={theme.textSecondary}
        />
      </Pressable>
      {filtersExpanded ? (
        <Animated.View
          entering={FadeInDown.duration(180)}
          exiting={FadeOutUp.duration(130)}
          layout={Layout.springify().damping(22)}
          style={styles.expandedFilters}
        >
          <View style={styles.filterGroup}>
            <AppText size="small" weight="semibold">
              Direction
            </AppText>
            <View style={styles.directionRow}>
              {directionFilters.map((filter) => (
                <FilterButton
                  key={filter.value}
                  selected={direction === filter.value}
                  label={filter.label}
                  compact
                  onPress={() => {
                    setDirection(filter.value);
                    setOffset(0);
                  }}
                />
              ))}
            </View>
          </View>
          <View style={styles.filterGroup}>
            <AppText size="small" weight="semibold">
              Date range
            </AppText>
            <View style={styles.filterRow}>
              {timeFilters.map((filter) => (
                <FilterButton
                  key={filter.value}
                  selected={timeFilter === filter.value}
                  label={filter.label}
                  onPress={() => {
                    setTimeFilter(filter.value);
                    setOffset(0);
                  }}
                />
              ))}
            </View>
          </View>
        </Animated.View>
      ) : null}

      {history.isLoading ? (
        <LoadingState label="Loading movement history" />
      ) : null}
      {history.isError ? (
        <View
          style={[
            styles.messageState,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        >
          <AppText weight="semibold">
            Couldn’t load movement history
          </AppText>
          <AppText size="small" tone="secondary">
            {normalizeApiError(history.error).message}
          </AppText>
          <Button
            label="Try again"
            variant="secondary"
            onPress={() => void history.refetch()}
          />
        </View>
      ) : null}

      {!history.isLoading &&
      !history.isError &&
      result?.items.length === 0 ? (
        <View
          style={[
            styles.messageState,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        >
          <Ionicons
            name="file-tray-outline"
            size={23}
            color={theme.textSecondary}
          />
          <AppText weight="semibold">
            {hasFilters ? "No matching movements" : "No movements yet"}
          </AppText>
          <AppText size="small" tone="secondary">
            {hasFilters
              ? "Try another search or adjust the filters."
              : "Transfers involving this block will appear here."}
          </AppText>
          {hasFilters ? (
            <Button
              label="Clear filters"
              variant="secondary"
              onPress={() => {
                setSearch("");
                setDebouncedSearch("");
                setDirection("all");
                setTimeFilter("all");
                setOffset(0);
              }}
            />
          ) : null}
        </View>
      ) : null}

      {result?.items.map((item, index) => {
        const incoming = item.to_block_id === blockId;
        return (
          <Animated.View
            key={item.id}
            entering={FadeInDown.delay(Math.min(index * 45, 225)).duration(240)}
            layout={Layout.springify().damping(22)}
            style={[
              styles.movementCard,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.movementTop}>
              <View
                style={[
                  styles.directionIcon,
                  {
                    backgroundColor: incoming
                      ? `${theme.success}1A`
                      : `${theme.primary}1A`,
                  },
                ]}
              >
                <Ionicons
                  name={incoming ? "arrow-down-outline" : "arrow-up-outline"}
                  size={17}
                  color={incoming ? theme.success : theme.primary}
                />
              </View>
              <View style={styles.movementTitle}>
                <AppText weight="semibold" numberOfLines={2}>
                  {item.batch_name}
                </AppText>
                <AppText size="small" tone="secondary">
                  {incoming ? "Moved into this block" : "Moved out of this block"}
                </AppText>
              </View>
              <View style={styles.quantity}>
                <AppText
                  size="small"
                  weight="semibold"
                  style={{ color: incoming ? theme.success : theme.text }}
                >
                  {item.quantity.toLocaleString()}
                </AppText>
                <AppText size="small" tone="secondary">
                  {item.quantity === 1 ? "bird" : "birds"}
                </AppText>
              </View>
            </View>

            <View
              style={[
                styles.route,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <AppText size="small" numberOfLines={2} style={styles.routeName}>
                {item.from_block_name}
              </AppText>
              <Ionicons
                name="arrow-forward"
                size={15}
                color={theme.textSecondary}
              />
              <AppText size="small" numberOfLines={2} style={styles.routeName}>
                {item.to_block_name}
              </AppText>
            </View>

            <View style={styles.movementMeta}>
              <View style={styles.dateLine}>
                <Ionicons
                  name="calendar-outline"
                  size={15}
                  color={theme.textSecondary}
                />
                <AppText size="small" tone="secondary">
                  {formatMovementDate(item.movement_date)}
                </AppText>
              </View>
              {item.reason || item.notes ? (
                <View style={styles.noteLine}>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={15}
                    color={theme.textSecondary}
                  />
                  <AppText
                    size="small"
                    tone="secondary"
                    numberOfLines={2}
                    style={styles.noteText}
                  >
                    {[item.reason, item.notes].filter(Boolean).join(" · ")}
                  </AppText>
                </View>
              ) : null}
            </View>
          </Animated.View>
        );
      })}

      {result && result.total_count > pageSize ? (
        <View style={styles.pagination}>
          <AppText size="small" tone="secondary">
            Showing {pageStart}–{pageEnd} of {result.total_count.toLocaleString()}
          </AppText>
          <View style={styles.pageButtons}>
            <Button
              label="Previous"
              variant="secondary"
              disabled={offset === 0 || history.isFetching}
              onPress={() => setOffset(Math.max(0, offset - pageSize))}
            />
            <Button
              label="Next"
              variant="secondary"
              disabled={
                offset + pageSize >= result.total_count || history.isFetching
              }
              onPress={() => setOffset(offset + pageSize)}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function FilterButton({
  selected,
  label,
  icon,
  compact = false,
  onPress,
}: {
  selected: boolean;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  compact?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.filter,
        compact && styles.directionFilter,
        {
          backgroundColor: selected ? theme.primary : theme.background,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={14}
          color={selected ? theme.onPrimary : theme.textSecondary}
        />
      ) : null}
      <AppText
        size="small"
        weight="semibold"
        style={{ color: selected ? theme.onPrimary : theme.text }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localToday(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatMovementDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

const styles = StyleSheet.create({
  container: { gap: 11, paddingTop: 13, borderTopWidth: StyleSheet.hairlineWidth },
  heading: { flexDirection: "row", alignItems: "center", gap: 10 },
  headingIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  headingCopy: { flex: 1, minWidth: 0, gap: 2 },
  countBadge: {
    minWidth: 30,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    paddingHorizontal: 8,
  },
  filterGroup: { gap: 6 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  directionRow: { flexDirection: "row", gap: 6 },
  directionFilter: { flex: 1, paddingHorizontal: 5 },
  filtersToggle: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filtersToggleCopy: { gap: 2 },
  expandedFilters: { gap: 10, paddingHorizontal: 4, paddingBottom: 2 },
  filter: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 8,
  },
  movementCard: {
    gap: 9,
    padding: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 11,
  },
  movementTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  directionIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  movementTitle: { flex: 1, minWidth: 0, gap: 2 },
  quantity: { alignItems: "flex-end", flexShrink: 0 },
  route: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  routeName: { flex: 1, minWidth: 0 },
  movementMeta: { gap: 6 },
  dateLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  noteLine: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  noteText: { flex: 1 },
  messageState: {
    alignItems: "flex-start",
    gap: 8,
    padding: 14,
    borderWidth: 1,
    borderRadius: 10,
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  pageButtons: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
});
