import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { EggCollectionProduct } from "@/features/eggs/api";
import { useEggCollectionOptions } from "@/features/eggs/hooks";
import type { FarmActivity } from "@/features/management/api";
import { useFarmActivities } from "@/features/management/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { formatRelativeDate } from "@/lib/date/format-relative-date";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

const emptyProducts: EggCollectionProduct[] = [];
const activityLabels: Record<string, string> = {
  egg_collection_recorded: "Eggs collected",
  egg_loss_recorded: "Egg loss recorded",
};

export default function EggsScreen() {
  return (
    <SessionGate>
      <EggsContent />
    </SessionGate>
  );
}

function EggsContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const farmId = farm.selectedFarm?.id;
  const options = useEggCollectionOptions(user?.id, farmId);
  const activities = useFarmActivities(
    user?.id,
    farmId,
    "",
    "eggs",
    undefined,
    undefined,
  );
  const [showAllActivities, setShowAllActivities] = useState(false);
  const products = options.data?.products ?? emptyProducts;
  const inStockCount = products.filter(
    (product) => Number(product.available_quantity_in_base_unit) > 0,
  ).length;
  const sellableCount = products.filter((product) => product.is_sellable).length;
  const sellableInStockCount = products.filter(
    (product) =>
      product.is_sellable &&
      Number(product.available_quantity_in_base_unit) > 0,
  ).length;
  const outOfStockCount = products.filter(
    (product) =>
      product.is_sellable &&
      Number(product.available_quantity_in_base_unit) <= 0,
  ).length;
  const readinessStatusColor =
    sellableCount === 0
      ? theme.textSecondary
      : theme.mode === "dark"
        ? outOfStockCount > 0
          ? "#FF9B91"
          : "#8FD0A5"
        : outOfStockCount > 0
          ? theme.danger
          : theme.success;
  const readinessStatusBackground =
    sellableCount === 0
      ? theme.backgroundSelected
      : theme.mode === "dark"
        ? outOfStockCount > 0
          ? "rgba(255, 155, 145, 0.16)"
          : "rgba(143, 208, 165, 0.16)"
        : outOfStockCount > 0
          ? `${theme.danger}18`
          : `${theme.success}18`;
  const recentActivities =
    activities.data?.pages.flatMap((page) => page.items) ?? [];
  const productById = new Map(products.map((product) => [product.id, product]));
  const recentItems = showAllActivities
    ? recentActivities
    : recentActivities.slice(0, 6);

  async function refresh() {
    await Promise.all([options.refetch(), activities.refetch()]);
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={options.isRefetching || activities.isRefetching}
            onRefresh={() => void refresh()}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <FarmPageHeader title="Eggs" />

        <View style={styles.pageHeading}>
          <View style={styles.headingCopy}>
            <AppText size="heading" weight="semibold">
              Egg operations
            </AppText>
            <AppText size="small" tone="secondary">
              Available stock, product readiness and recent records
            </AppText>
          </View>
          {options.isFetching || activities.isFetching ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : null}
        </View>

        {options.isLoading ? <LoadingState label="Loading egg inventory" /> : null}
        {options.isError ? (
          <Card style={styles.stateCard}>
            <Ionicons
              name="cloud-offline-outline"
              size={24}
              color={theme.danger}
            />
            <AppText weight="semibold">Couldn’t load egg inventory</AppText>
            <AppText size="small" tone="secondary">
              {normalizeApiError(options.error).message}
            </AppText>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => void options.refetch()}
            />
          </Card>
        ) : null}

        {options.data ? (
          <>
            <Card style={styles.summaryCard}>
              <View style={styles.readinessHeader}>
                <View
                  style={[
                    styles.readinessIcon,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Ionicons
                    name="egg-outline"
                    size={22}
                    color={
                      theme.mode === "dark" ? theme.onPrimary : theme.primary
                    }
                  />
                </View>
                <View style={styles.readinessCopy}>
                  <AppText size="small" weight="semibold" tone="secondary">
                    SELLABLE STOCK
                  </AppText>
                </View>
                <View
                  style={[
                    styles.readinessBadge,
                    { backgroundColor: readinessStatusBackground },
                  ]}
                >
                  <AppText
                    size="small"
                    weight="semibold"
                    numberOfLines={1}
                    style={{ color: readinessStatusColor }}
                  >
                    {sellableCount === 0
                      ? "No sellable items"
                      : outOfStockCount > 0
                        ? "Restock needed"
                        : "Ready to sell"}
                  </AppText>
                </View>
              </View>
              <View style={styles.readinessValueRow}>
                <AppText
                  style={[styles.readinessValue, { color: theme.text }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {sellableInStockCount}/{sellableCount}
                </AppText>
                <View style={styles.readinessValueCopy}>
                  <AppText weight="semibold">products stocked</AppText>
                  <AppText size="small" tone="secondary">
                    {sellableCount === 0
                      ? "Mark an egg product sellable to enable sales"
                      : outOfStockCount > 0
                      ? `${outOfStockCount} sellable ${outOfStockCount === 1 ? "product needs" : "products need"} stock`
                        : "All sellable products have stock"}
                  </AppText>
                </View>
              </View>
              {sellableCount > 0 ? (
                <View
                  style={[
                    styles.readinessTrack,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <View
                    style={[
                      styles.readinessFill,
                      {
                        width: `${Math.min(100, (sellableInStockCount / sellableCount) * 100)}%`,
                        backgroundColor:
                          theme.mode === "dark" ? "#8FD0A5" : theme.success,
                      },
                    ]}
                  />
                </View>
              ) : null}
              <View style={[styles.statGrid, { borderTopColor: theme.border }]}>
                <EggStat
                  label="Products with stock"
                  value={inStockCount.toLocaleString()}
                  icon="cube-outline"
                  color={
                    theme.mode === "dark" ? theme.onPrimary : theme.primary
                  }
                  theme={theme}
                />
                <EggStat
                  label="Sellable products"
                  value={sellableCount.toLocaleString()}
                  icon="cart-outline"
                  color={theme.success}
                  theme={theme}
                />
              </View>
            </Card>

            <View style={styles.actionGroup}>
              <OperationAction
                label="Collect eggs"
                icon="egg-outline"
                color={theme.onPrimary}
                background={theme.primary}
                accessibilityLabel="Record egg collection"
                onPress={() => router.push("/egg-collection" as Href)}
                theme={theme}
                prominent
              />
              <View style={styles.secondaryActionRow}>
                <OperationAction
                  label="Sell eggs"
                  icon="cart-outline"
                  color={theme.mode === "dark" ? theme.text : theme.primary}
                  background={theme.backgroundElement}
                  accessibilityLabel="Record egg sale"
                  onPress={() => router.push("/egg-sale" as Href)}
                  theme={theme}
                />
                <OperationAction
                  label="Record loss"
                  icon="alert-circle-outline"
                  color={theme.mode === "dark" ? "#FF9B91" : theme.danger}
                  background={theme.backgroundElement}
                  accessibilityLabel="Record egg loss"
                  onPress={() => router.push("/egg-loss" as Href)}
                  theme={theme}
                />
              </View>
            </View>

            <Card style={styles.inventoryCard}>
              <View style={styles.sectionHeading}>
                <View style={styles.headingCopy}>
                  <AppText weight="semibold">Egg inventory</AppText>
                  <AppText size="small" tone="secondary">
                    Current quantity and all-time movement by product
                  </AppText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Manage egg products"
                  onPress={() => router.push("/products" as Href)}
                  style={styles.textAction}
                >
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{
                      color: theme.mode === "dark" ? theme.onPrimary : theme.primary,
                    }}
                  >
                    Products
                  </AppText>
                  <Ionicons
                    name="chevron-forward"
                    size={15}
                    color={
                      theme.mode === "dark" ? theme.onPrimary : theme.primary
                    }
                  />
                </Pressable>
              </View>

              {products.length ? (
                <View style={styles.productList}>
                  {products.map((product) => (
                    <EggProductCard key={product.id} product={product} />
                  ))}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons
                    name="egg-outline"
                    size={25}
                    color={theme.textSecondary}
                  />
                  <AppText weight="semibold">No egg products yet</AppText>
                  <AppText size="small" tone="secondary" style={styles.emptyCopy}>
                    Add an active egg product to start tracking collection,
                    sales and losses.
                  </AppText>
                  <Button
                    label="Add egg product"
                    variant="secondary"
                    onPress={() => router.push("/products/new" as Href)}
                  />
                </View>
              )}
            </Card>
          </>
        ) : null}

        <Card style={styles.activityCard}>
          <View style={styles.sectionHeading}>
            <View style={styles.headingCopy}>
              <AppText weight="semibold">Recent egg activity</AppText>
              <AppText size="small" tone="secondary">
                Collection and loss records
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View all egg activity"
              onPress={() => openEggActivity()}
              style={[
                styles.historyAction,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <AppText
                size="small"
                weight="semibold"
                style={{
                  color: theme.mode === "dark" ? theme.onPrimary : theme.primary,
                }}
              >
                View all
              </AppText>
              <Ionicons
                name="chevron-forward"
                size={15}
                color={theme.mode === "dark" ? theme.onPrimary : theme.primary}
              />
            </Pressable>
          </View>

          {activities.isLoading ? (
            <View style={styles.loadingInline}>
              <ActivityIndicator size="small" color={theme.primary} />
              <AppText size="small" tone="secondary">
                Loading egg activity…
              </AppText>
            </View>
          ) : null}
          {activities.isError ? (
            <View style={styles.stateInline}>
              <AppText weight="semibold">Couldn’t load egg activity</AppText>
              <AppText size="small" tone="secondary">
                {normalizeApiError(activities.error).message}
              </AppText>
              <Button
                label="Retry activity"
                variant="secondary"
                onPress={() => void activities.refetch()}
              />
            </View>
          ) : null}
          {!activities.isLoading &&
          !activities.isError &&
          recentItems.length ? (
            <View style={styles.activityList}>
              {recentItems.map((entry) => (
                <EggActivityRow
                  key={entry.id}
                  entry={entry}
                  productById={productById}
                />
              ))}
            </View>
          ) : null}
          {!activities.isLoading &&
          !activities.isError &&
          recentActivities.length === 0 ? (
            <View style={styles.emptyActivity}>
              <Ionicons
                name="time-outline"
                size={22}
                color={theme.textSecondary}
              />
              <AppText
                size="small"
                tone="secondary"
                style={styles.emptyActivityCopy}
              >
                Egg collections and losses will appear here once recorded.
              </AppText>
            </View>
          ) : null}
          {!showAllActivities && recentActivities.length > recentItems.length ? (
            <Button
              label={`Show all ${recentActivities.length} loaded records`}
              variant="secondary"
              onPress={() => setShowAllActivities(true)}
            />
          ) : null}
          {showAllActivities && activities.hasNextPage ? (
            <Button
              label="Load older egg activity"
              variant="secondary"
              loading={activities.isFetchingNextPage}
              disabled={activities.isFetchingNextPage}
              onPress={() => void activities.fetchNextPage()}
            />
          ) : null}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function EggStat({
  label,
  value,
  icon,
  color,
  theme,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  theme: ReturnType<typeof useTheme>["theme"];
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons
          name={icon}
          size={15}
          color={theme.mode === "dark" ? theme.onPrimary : color}
        />
      </View>
      <AppText size="small" tone="secondary" numberOfLines={1} style={styles.statLabel}>
        {label}
      </AppText>
      <AppText
        size="small"
        weight="semibold"
        style={[styles.statValue, { color: theme.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </AppText>
    </View>
  );
}

function OperationAction({
  label,
  icon,
  color,
  background,
  accessibilityLabel,
  onPress,
  theme,
  prominent = false,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  background: string;
  accessibilityLabel: string;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>["theme"];
  prominent?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.operationAction,
        prominent && styles.prominentAction,
        {
          opacity: pressed ? 0.86 : 1,
          backgroundColor:
            prominent || !pressed ? background : theme.backgroundSelected,
          borderColor: prominent ? theme.primary : theme.border,
        },
      ]}
    >
      <Ionicons name={icon} size={19} color={color} />
      <AppText
        size="small"
        weight="semibold"
        style={{ color: prominent ? theme.onPrimary : color }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function EggProductCard({ product }: { product: EggCollectionProduct }) {
  const { theme } = useTheme();
  const primaryAccent =
    theme.mode === "dark" ? theme.onPrimary : theme.primary;
  const successAccent =
    theme.mode === "dark" ? "#8FD0A5" : theme.success;
  const dangerAccent = theme.mode === "dark" ? "#FF9B91" : theme.danger;
  const baseUnit =
    product.units.find((unit) => unit.is_base_unit) ?? product.units[0];
  const available = formatQuantity(product.available_quantity_in_base_unit);
  const collected = formatQuantity(product.collected_quantity_in_base_unit);
  const sold = formatQuantity(product.sold_quantity_in_base_unit);
  const lost = formatQuantity(product.lost_quantity_in_base_unit);
  const hasStock = Number(product.available_quantity_in_base_unit) > 0;

  return (
    <View
      style={[
        styles.productCard,
        { borderColor: theme.border, backgroundColor: theme.backgroundElement },
      ]}
    >
      <View style={styles.productHeading}>
        <View
          style={[
            styles.productIcon,
            { backgroundColor: theme.backgroundSelected },
          ]}
        >
          <Ionicons name="egg-outline" size={18} color={primaryAccent} />
        </View>
        <View style={styles.productCopy}>
          <AppText weight="semibold" numberOfLines={1}>
            {product.name}
          </AppText>
          <View style={styles.productBadges}>
            <View
              style={[
                styles.productBadge,
                {
                  backgroundColor: hasStock
                    ? theme.mode === "dark"
                      ? "rgba(143, 208, 165, 0.16)"
                      : `${theme.success}18`
                    : theme.mode === "dark"
                      ? "rgba(255, 155, 145, 0.16)"
                      : `${theme.danger}18`,
                },
              ]}
            >
              <AppText
                size="small"
                weight="semibold"
                style={{ color: hasStock ? successAccent : dangerAccent }}
              >
                {hasStock ? "In stock" : "Out of stock"}
              </AppText>
            </View>
            {product.is_sellable ? (
              <AppText size="small" tone="secondary">
                Sellable
              </AppText>
            ) : null}
          </View>
        </View>
        <View style={styles.productAvailable}>
          <AppText
            weight="semibold"
            style={[
              styles.productQuantity,
              { color: hasStock ? theme.text : theme.textSecondary },
            ]}
          >
            {available}
          </AppText>
          <AppText size="small" tone="secondary">
            {baseUnit?.abbreviation ?? "units"} available
          </AppText>
        </View>
      </View>
      <View style={[styles.movementDivider, { borderTopColor: theme.border }]} />
      <View style={styles.movementHeading}>
        <AppText size="small" weight="semibold">
          All-time movement
        </AppText>
        {baseUnit?.abbreviation ? (
          <AppText size="small" tone="secondary">
            {baseUnit.abbreviation}
          </AppText>
        ) : null}
      </View>
      <View style={styles.movementStats}>
        <MovementStat
          label="Collected"
          value={collected}
          color={primaryAccent}
          theme={theme}
        />
        <MovementStat
          label="Sold"
          value={sold}
          color={successAccent}
          theme={theme}
        />
        <MovementStat
          label="Lost"
          value={lost}
          color={dangerAccent}
          theme={theme}
        />
      </View>
    </View>
  );
}

function MovementStat({
  label,
  value,
  color,
  theme,
}: {
  label: string;
  value: string;
  color: string;
  theme: ReturnType<typeof useTheme>["theme"];
}) {
  return (
    <View
      style={[
        styles.movementStat,
        { backgroundColor: theme.backgroundSelected },
      ]}
    >
      <AppText size="small" tone="secondary">
        {label}
      </AppText>
      <AppText
        size="body"
        weight="semibold"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ color }}
      >
        {value}
      </AppText>
    </View>
  );
}

function EggActivityRow({
  entry,
  productById,
}: {
  entry: FarmActivity;
  productById: Map<string, EggCollectionProduct>;
}) {
  const { theme } = useTheme();
  const isLoss = entry.type === "egg_loss_recorded";
  const details = entry.details ?? {};
  const successAccent =
    theme.mode === "dark" ? "#8FD0A5" : theme.primary;
  const dangerAccent = theme.mode === "dark" ? "#FF9B91" : theme.danger;
  const productId = details.product_id;
  const product =
    typeof productId === "string" ? productById.get(productId) : undefined;
  const quantity = isLoss
    ? details.quantity_in_base_unit
    : undefined;
  const summary = isLoss
    ? [
        typeof quantity === "string" || typeof quantity === "number"
          ? `${formatQuantity(quantity)} ${product?.units.find((unit) => unit.is_base_unit)?.abbreviation ?? "units"}`
          : undefined,
        typeof details.reason === "string" ? labelize(details.reason) : undefined,
      ]
        .filter(Boolean)
        .join(" · ")
    : `${Number(details.entry_count ?? 0)} collection ${Number(details.entry_count ?? 0) === 1 ? "entry" : "entries"}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${activityLabels[entry.type] ?? "Egg activity"}; view activity details`}
      onPress={() => openEggActivity(entry)}
      style={({ pressed }) => [
        styles.activityRow,
        {
          borderTopColor: theme.border,
          backgroundColor: pressed ? theme.backgroundSelected : "transparent",
        },
      ]}
    >
      <View
        style={[
          styles.activityRowIcon,
          {
            backgroundColor: isLoss
              ? theme.mode === "dark"
                ? "rgba(255, 155, 145, 0.16)"
                : `${theme.danger}18`
              : theme.backgroundSelected,
          },
        ]}
      >
        <Ionicons
          name={isLoss ? "alert-circle-outline" : "egg-outline"}
          size={17}
          color={isLoss ? dangerAccent : successAccent}
        />
      </View>
      <View style={styles.activityCopy}>
        <AppText size="small" weight="semibold" numberOfLines={1}>
          {activityLabels[entry.type] ?? "Egg activity"}
          {product ? ` · ${product.name}` : ""}
        </AppText>
        <AppText size="small" tone="secondary" numberOfLines={1}>
          {summary}
        </AppText>
        <AppText size="small" tone="secondary" numberOfLines={1}>
          {formatRelativeDate(entry.created_at)}
        </AppText>
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={theme.textSecondary}
      />
    </Pressable>
  );
}

function openEggActivity(entry?: FarmActivity) {
  if (entry) {
    router.push({
      pathname: "/activities/[activityId]",
      params: { activityId: entry.id },
    });
    return;
  }
  router.push(
    {
      pathname: "/activities",
      params: {
        category: "eggs",
      },
    } as Href,
  );
}

function formatQuantity(value: number | string): string {
  const quantity = Number(value);
  return Number.isFinite(quantity)
    ? quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })
    : "—";
}

function labelize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 13,
  },
  pageHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headingCopy: { flex: 1, gap: 3 },
  actionGroup: { gap: 7 },
  secondaryActionRow: { flexDirection: "row", gap: 7 },
  operationAction: {
    minHeight: 46,
    flexDirection: "row",
    flexGrow: 1,
    flexBasis: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  prominentAction: { minHeight: 50 },
  stateCard: { alignItems: "center", gap: 9, paddingVertical: 20 },
  summaryCard: { gap: 12, borderRadius: 8, padding: 14 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  readinessHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  readinessIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  readinessCopy: { flex: 1, gap: 2 },
  readinessBadge: {
    maxWidth: "42%",
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  readinessValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 0,
  },
  readinessValue: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  readinessValueCopy: { flex: 1, gap: 2 },
  readinessTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  readinessFill: { height: "100%", borderRadius: 4 },
  statGrid: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statCard: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 3,
  },
  statIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  statLabel: { flex: 1, minWidth: 0 },
  statValue: {
    fontVariant: ["tabular-nums"],
  },
  inventoryCard: { gap: 11, borderRadius: 8 },
  textAction: { flexDirection: "row", alignItems: "center", gap: 2 },
  productList: { gap: 10 },
  productCard: {
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 11,
  },
  productHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  productIcon: {
    width: 31,
    height: 31,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  productCopy: { flex: 1, minWidth: 0, gap: 4 },
  productBadges: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  productBadge: {
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  productAvailable: { alignItems: "flex-end", gap: 1 },
  productQuantity: {
    fontSize: 18,
    lineHeight: 24,
    fontVariant: ["tabular-nums"],
  },
  movementDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  movementHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  movementStats: {
    flexDirection: "row",
    gap: 7,
  },
  movementStat: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 3,
  },
  emptyState: { alignItems: "center", gap: 8, paddingVertical: 20 },
  emptyCopy: { maxWidth: 370, textAlign: "center" },
  activityCard: { gap: 10, borderRadius: 8 },
  historyAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  loadingInline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
  },
  stateInline: { alignItems: "flex-start", gap: 8, paddingVertical: 8 },
  activityList: { gap: 0 },
  activityRow: {
    width: "100%",
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  activityRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  activityCopy: { flex: 1, minWidth: 0, gap: 3 },
  emptyActivity: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingVertical: 8,
  },
  emptyActivityCopy: { flex: 1, minWidth: 0, flexShrink: 1 },
});
