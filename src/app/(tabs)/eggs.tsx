import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
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
  egg_loss_recorded: "Eggs lost",
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
  const refetchOptions = options.refetch;
  const refetchActivities = activities.refetch;
  const hasFocused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (hasFocused.current) {
        void Promise.all([refetchOptions(), refetchActivities()]);
      }
      hasFocused.current = true;
    }, [refetchActivities, refetchOptions]),
  );
  const products = options.data?.products ?? emptyProducts;
  const sellableProducts = products.filter((product) => product.is_sellable);
  const totalSellable = sellableProducts.reduce(
    (total, product) =>
      total + Number(product.available_quantity_in_base_unit),
    0,
  );
  const totalReserved = products.reduce(
    (total, product) =>
      total + Number(product.reserved_quantity_in_base_unit),
    0,
  );
  const sellableUnit = getSharedBaseUnit(sellableProducts);
  const reservedProducts = products.filter(
    (product) => Number(product.reserved_quantity_in_base_unit) > 0,
  );
  const reservedUnit = getSharedBaseUnit(reservedProducts);
  const hasSellableStock = sellableProducts.some(
    (product) => Number(product.available_quantity_in_base_unit) > 0,
  );
  const recentActivities =
    activities.data?.pages.flatMap((page) => page.items) ?? [];
  const productById = new Map(products.map((product) => [product.id, product]));
  const recentItems = recentActivities.slice(0, 4);

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
              Egg stock
            </AppText>
            <AppText size="small" tone="secondary">
              Eggs ready to sell and recent activity
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
            <Animated.View entering={FadeInDown.duration(260)}>
              <Card style={styles.stockSummary}>
                <View style={styles.stockSummaryHeading}>
                  <View style={styles.stockSummaryCopy}>
                    <AppText size="small" weight="semibold" tone="secondary">
                      READY TO SELL
                    </AppText>
                    <AppText
                      size="title"
                      weight="semibold"
                      style={{ color: theme.success }}
                    >
                      {sellableProducts.length === 0
                        ? "No sellable products"
                        : sellableUnit
                          ? `${formatQuantity(totalSellable)} ${sellableUnit.abbreviation}`
                          : "See quantities by product"}
                    </AppText>
                    {!sellableUnit && sellableProducts.length > 0 ? (
                      <AppText size="small" tone="secondary">
                        Units vary by product
                      </AppText>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.stockSummaryIcon,
                      { backgroundColor: `${theme.success}16` },
                    ]}
                  >
                    <Ionicons
                      name="cart-outline"
                      size={22}
                      color={theme.success}
                    />
                  </View>
                </View>
                {totalReserved > 0 ? (
                  <View
                    style={[
                      styles.reservedSummary,
                      {
                        backgroundColor: `${theme.secondary}12`,
                        borderColor: `${theme.secondary}35`,
                      },
                    ]}
                  >
                    <View style={styles.reservedSummaryCopy}>
                      <AppText
                        size="small"
                        weight="semibold"
                        style={{ color: theme.secondary }}
                      >
                        Reserved for orders
                      </AppText>
                      <AppText size="small" tone="secondary">
                        Not yet delivered
                      </AppText>
                    </View>
                    <AppText size="body" weight="semibold">
                      {reservedUnit
                        ? `${formatQuantity(totalReserved)} ${reservedUnit.abbreviation}`
                        : "See each product"}
                    </AppText>
                  </View>
                ) : null}
              </Card>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.duration(260).delay(60)}
              style={styles.actionGroup}
            >
              {products.length === 0 ? (
                <OperationAction
                  label="Add egg product"
                  icon="add-outline"
                  color={theme.onPrimary}
                  background={theme.primary}
                  accessibilityLabel="Add an egg product"
                  onPress={() => router.push("/products/new" as Href)}
                  theme={theme}
                  prominent
                />
              ) : hasSellableStock ? (
                <OperationAction
                  label="Sell eggs"
                  icon="cart-outline"
                  color={theme.onPrimary}
                  background={theme.primary}
                  accessibilityLabel="Start an egg sale"
                  onPress={() => router.push("/egg-sale" as Href)}
                  theme={theme}
                  prominent
                />
              ) : (
                <OperationAction
                  label="Collect eggs"
                  icon="egg-outline"
                  color={theme.onPrimary}
                  background={theme.primary}
                  accessibilityLabel="Record an egg collection"
                  onPress={() => router.push("/egg-collection" as Href)}
                  theme={theme}
                  prominent
                />
              )}
              {products.length > 0 ? (
                <View style={styles.secondaryActionRow}>
                  <OperationAction
                    label={hasSellableStock ? "Collect eggs" : "View products"}
                    icon={hasSellableStock ? "egg-outline" : "cube-outline"}
                    color={theme.mode === "dark" ? theme.text : theme.primary}
                    background={theme.backgroundElement}
                    accessibilityLabel={
                      hasSellableStock
                        ? "Record an egg collection"
                        : "View egg products"
                    }
                    onPress={() =>
                      router.push(
                        hasSellableStock
                          ? ("/egg-collection" as Href)
                          : ("/products" as Href),
                      )
                    }
                    theme={theme}
                  />
                  {products.some(
                    (product) =>
                      Number(product.on_hand_quantity_in_base_unit) > 0,
                  ) ? (
                    <OperationAction
                      label="Record loss"
                      icon="alert-circle-outline"
                      color={theme.mode === "dark" ? "#FF9B91" : theme.danger}
                      background={theme.backgroundElement}
                      accessibilityLabel="Record an egg loss"
                      onPress={() => router.push("/egg-loss" as Href)}
                      theme={theme}
                    />
                  ) : null}
                </View>
              ) : null}
            </Animated.View>

            <Animated.View
              entering={FadeInDown.duration(260).delay(120)}
              style={styles.inventorySection}
            >
              <View style={styles.sectionHeading}>
                <View style={styles.headingCopy}>
                  <AppText weight="semibold">By product</AppText>
                  <AppText size="small" tone="secondary">
                    Sellable stock and pending orders
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
                    Manage
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
                  {products.map((product, index) => (
                    <EggProductCard
                      key={product.id}
                      product={product}
                      index={index}
                    />
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
            </Animated.View>
          </>
        ) : null}

        <Animated.View
          entering={FadeInDown.duration(260).delay(180)}
        >
          <Card style={styles.activityCard}>
            <View style={styles.sectionHeading}>
              <View style={styles.headingCopy}>
                <AppText weight="semibold">Recent activity</AppText>
                <AppText size="small" tone="secondary">
                  Collections and losses
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
                    color:
                      theme.mode === "dark" ? theme.onPrimary : theme.primary,
                  }}
                >
                  See all
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
                  Loading egg activity
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
                  No egg records yet
                </AppText>
              </View>
            ) : null}
          </Card>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
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

function EggProductCard({
  product,
  index,
}: {
  product: EggCollectionProduct;
  index: number;
}) {
  const { theme } = useTheme();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const baseUnit =
    product.units.find((unit) => unit.is_base_unit) ?? product.units[0];
  const unit = baseUnit?.abbreviation ?? "eggs";
  const available = product.is_sellable
    ? product.available_quantity_in_base_unit
    : product.on_hand_quantity_in_base_unit;
  const reserved = Number(product.reserved_quantity_in_base_unit);
  const adjustment = Number(product.stock_adjustment_quantity_in_base_unit);
  const successColor =
    theme.mode === "dark" ? "#8FD0A5" : theme.success;
  const warningColor =
    theme.mode === "dark" ? "#F0B27A" : theme.secondary;

  return (
    <Animated.View
      entering={FadeInDown.duration(240).delay(Math.min(index, 4) * 45)}
    >
      <View
        style={[
          styles.productCard,
          {
            borderColor: theme.border,
            backgroundColor: theme.backgroundElement,
          },
        ]}
      >
        <View style={styles.productHeading}>
          <View style={styles.productCopy}>
            <AppText weight="semibold">{product.name}</AppText>
            <AppText size="small" tone="secondary">
              {product.is_sellable ? "Sellable product" : "Not for sale"}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View ${product.name} stock details`}
            onPress={() =>
              router.push(`/products/${product.id}/inventory` as Href)
            }
            style={({ pressed }) => [
              styles.productDetailsAction,
              {
                backgroundColor: pressed
                  ? theme.backgroundSelected
                  : "transparent",
              },
            ]}
          >
            <AppText
              size="small"
              weight="semibold"
              style={{ color: theme.primary }}
            >
              Stock details
            </AppText>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={theme.primary}
            />
          </Pressable>
        </View>

        <View
          style={[
            styles.productSellable,
            {
              backgroundColor: `${successColor}12`,
              borderColor: `${successColor}35`,
            },
          ]}
        >
          <View style={styles.sellableLabelRow}>
            <View
              style={[
                styles.sellableDot,
                { backgroundColor: successColor },
              ]}
            />
            <AppText
              size="small"
              weight="semibold"
              style={{ color: successColor }}
            >
              {product.is_sellable ? "SELLABLE NOW" : "STOCK ON HAND"}
            </AppText>
          </View>
          <AppText
            size="title"
            weight="semibold"
            style={{ color: successColor }}
          >
            {formatQuantity(available)} {unit}
          </AppText>
        </View>

        <View style={styles.stockFacts}>
          {product.is_sellable ? (
            <View style={styles.stockFactRow}>
              <AppText size="small" tone="secondary">
                Total on hand
              </AppText>
              <AppText size="small" weight="semibold">
                {formatQuantity(product.on_hand_quantity_in_base_unit)} {unit}
              </AppText>
            </View>
          ) : null}
          {reserved > 0 ? (
            <View
              style={[
                styles.stockFactRow,
                styles.reservedFact,
                {
                  backgroundColor: `${warningColor}12`,
                  borderColor: `${warningColor}40`,
                },
              ]}
            >
              <View style={styles.reservedFactLabel}>
                <Ionicons
                  name="time-outline"
                  size={15}
                  color={warningColor}
                />
                <AppText
                  size="small"
                  weight="semibold"
                  style={{ color: warningColor }}
                >
                  Reserved for orders
                </AppText>
              </View>
              <AppText size="small" weight="semibold">
                {formatQuantity(reserved)} {unit}
              </AppText>
            </View>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showBreakdown }}
          accessibilityLabel={`${showBreakdown ? "Hide" : "Show"} ${product.name} stock breakdown`}
          onPress={() => setShowBreakdown((shown) => !shown)}
          style={[
            styles.breakdownToggle,
            { borderTopColor: theme.border },
          ]}
        >
          <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
            Stock breakdown
          </AppText>
          <Ionicons
            name={showBreakdown ? "chevron-up" : "chevron-down"}
            size={18}
            color={theme.primary}
          />
        </Pressable>
        {showBreakdown ? (
          <Animated.View
            entering={FadeInDown.duration(180)}
            style={styles.breakdownRows}
          >
            <StockBreakdownRow
              label="Opening stock"
              value={product.opening_stock_quantity_in_base_unit}
              unit={unit}
            />
            <StockBreakdownRow
              label="Collected"
              value={product.collected_quantity_in_base_unit}
              unit={unit}
            />
            <StockBreakdownRow
              label="Sales and orders"
              value={product.sold_quantity_in_base_unit}
              unit={unit}
            />
            {reserved > 0 ? (
              <AppText size="small" tone="secondary">
                Sales include the reserved orders above.
              </AppText>
            ) : null}
            <StockBreakdownRow
              label="Losses"
              value={product.lost_quantity_in_base_unit}
              unit={unit}
            />
            {adjustment !== 0 ? (
              <StockBreakdownRow
                label="Stock adjustments"
                value={adjustment}
                unit={unit}
              />
            ) : null}
          </Animated.View>
        ) : null}
      </View>
    </Animated.View>
  );
}

function StockBreakdownRow({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | string;
  unit: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.breakdownRow, { borderBottomColor: theme.border }]}>
      <AppText size="small" tone="secondary">
        {label}
      </AppText>
      <AppText size="small" weight="semibold">
        {formatQuantity(value)} {unit}
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
        <AppText size="small" weight="semibold">
          {activityLabels[entry.type] ?? "Egg activity"}
          {product ? ` · ${product.name}` : ""}
        </AppText>
        <AppText size="small" tone="secondary">
          {summary}
        </AppText>
        <AppText size="small" tone="secondary">
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

function getSharedBaseUnit(
  products: EggCollectionProduct[],
): EggCollectionProduct["units"][number] | undefined {
  if (!products.length) return undefined;
  const units = products.map((product) =>
    product.units.find((unit) => unit.is_base_unit),
  );
  const sharedUnit = units[0];
  if (!sharedUnit || units.some((unit) => unit?.id !== sharedUnit.id)) {
    return undefined;
  }
  return sharedUnit;
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
    paddingBottom: 42,
    gap: 13,
  },
  pageHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headingCopy: { flex: 1, gap: 3 },
  actionGroup: { gap: 7 },
  secondaryActionRow: { flexDirection: "row", gap: 8 },
  operationAction: {
    minHeight: 48,
    flexDirection: "row",
    flexGrow: 1,
    flexBasis: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  prominentAction: { minHeight: 54 },
  stateCard: { alignItems: "center", gap: 9, paddingVertical: 20 },
  stockSummary: { gap: 12, borderRadius: 15, padding: 15 },
  stockSummaryHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  stockSummaryCopy: { flex: 1, minWidth: 0, gap: 4 },
  stockSummaryIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  reservedSummary: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  reservedSummaryCopy: { flex: 1, minWidth: 0, gap: 2 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  inventorySection: { gap: 11 },
  textAction: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
  },
  productList: { gap: 10 },
  productCard: {
    gap: 11,
    borderWidth: 1,
    borderRadius: 15,
    padding: 13,
  },
  productHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  productCopy: { flex: 1, minWidth: 0, gap: 3 },
  productDetailsAction: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    borderRadius: 9,
    paddingHorizontal: 6,
  },
  productSellable: {
    gap: 3,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sellableLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  sellableDot: { width: 7, height: 7, borderRadius: 4 },
  stockFacts: { gap: 5 },
  stockFactRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reservedFact: { borderWidth: 1, borderRadius: 9 },
  reservedFactLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  breakdownToggle: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 7,
  },
  breakdownRows: { gap: 2, paddingTop: 1 },
  breakdownRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
  },
  emptyState: { alignItems: "center", gap: 8, paddingVertical: 20 },
  emptyCopy: { maxWidth: 370, textAlign: "center" },
  activityCard: { gap: 10, borderRadius: 15 },
  historyAction: {
    minHeight: 40,
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
