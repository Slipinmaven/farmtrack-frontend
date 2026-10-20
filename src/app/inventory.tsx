import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useChickenSaleOptions } from "@/features/chickens/hooks";
import type { ChickenType } from "@/features/chickens/api";
import { useEggCollectionOptions } from "@/features/eggs/hooks";
import type { Product, ProductType } from "@/features/management/api";
import {
  useInventory,
  useInventoryOpeningSetupStatus,
  useProducts,
} from "@/features/management/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

const productGroups: {
  type: ProductType;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { type: "feed", title: "Feed", icon: "leaf-outline" },
  { type: "medication", title: "Medication", icon: "medkit-outline" },
  { type: "equipment", title: "Tools & equipment", icon: "construct-outline" },
  { type: "other", title: "Other supplies", icon: "cube-outline" },
];

type InventoryFilter = ProductType | "all";

const inventoryFilters: { value: InventoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "chickens", label: "Chickens" },
  { value: "eggs", label: "Eggs" },
  { value: "feed", label: "Feed" },
  { value: "medication", label: "Medication" },
  { value: "equipment", label: "Equipment" },
  { value: "other", label: "Other" },
];

const chickenTypeLabels: Record<ChickenType, string> = {
  layers: "Layers",
  broiler: "Broilers",
  kienyeji: "Kienyeji",
  breeder: "Breeders",
  other: "Other",
};

export default function InventoryRoute() {
  return (
    <SessionGate>
      <InventoryContent />
    </SessionGate>
  );
}

function InventoryContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const farmId = farm.selectedFarm?.id;
  const inventory = useInventory(user?.id, farmId);
  const productsQuery = useProducts(user?.id, farmId);
  const openingStatus = useInventoryOpeningSetupStatus(user?.id, farmId);
  const chickenOptions = useChickenSaleOptions(user?.id, farmId);
  const eggOptions = useEggCollectionOptions(user?.id, farmId);
  const [categoryFilter, setCategoryFilter] = useState<InventoryFilter>("all");
  const [chickenTypeFilter, setChickenTypeFilter] =
    useState<ChickenType | "all">("all");

  const products = productsQuery.data ?? [];
  const balanceByProduct = useMemo(
    () => new Map((inventory.data?.items ?? []).map((item) => [item.product_id, item])),
    [inventory.data?.items],
  );
  const chickenBatches = chickenOptions.data?.batches ?? [];
  const chickenTypes = Array.from(
    new Set(
      chickenBatches
        .filter((batch) => batch.stocks.some((stock) => stock.quantity > 0))
        .map((batch) => batch.chicken_type),
    ),
  );
  const filteredChickenBatches =
    chickenTypeFilter === "all"
      ? chickenBatches
      : chickenBatches.filter(
          (batch) => batch.chicken_type === chickenTypeFilter,
        );
  const chickenByBlock = new Map<string, number>();
  for (const batch of filteredChickenBatches) {
    for (const stock of batch.stocks) {
      chickenByBlock.set(
        stock.block_id,
        (chickenByBlock.get(stock.block_id) ?? 0) + stock.quantity,
      );
    }
  }
  const chickenBlocks = (chickenOptions.data?.blocks ?? [])
    .map((block) => ({
      ...block,
      displayed_chickens: chickenByBlock.get(block.id) ?? 0,
    }))
    .filter((block) => block.displayed_chickens > 0);
  const chickenCount = chickenBlocks.reduce(
    (sum, block) => sum + block.displayed_chickens,
    0,
  );
  const chickenTotalCount = (chickenOptions.data?.blocks ?? []).reduce(
    (sum, block) => sum + block.current_chickens,
    0,
  );
  const eggs = eggOptions.data?.products ?? [];
  const eggCount = eggs.reduce(
    (sum, product) => sum + Number(product.available_quantity_in_base_unit),
    0,
  );
  const eggBaseUnits = Array.from(
    new Set(
      eggs
        .map((product) =>
          product.units.find((unit) => unit.is_base_unit)?.abbreviation,
        )
        .filter((unit): unit is string => Boolean(unit)),
    ),
  );
  const eggCountsShareUnit = eggBaseUnits.length <= 1;
  const supplyProducts = products.filter(
    (product) =>
      product.product_type !== "chickens" &&
      product.product_type !== "eggs" &&
      (product.is_active ||
        Number(balanceByProduct.get(product.id)?.quantity ?? 0) > 0),
  );
  const stockedSupplyCount = supplyProducts.filter(
    (product) => Number(balanceByProduct.get(product.id)?.quantity ?? 0) > 0,
  ).length;
  const visibleSupplyProducts = supplyProducts.filter(
    (product) =>
      categoryFilter === "all" || product.product_type === categoryFilter,
  );
  const visibleProductGroups =
    categoryFilter === "all"
      ? productGroups
      : productGroups.filter((group) => group.type === categoryFilter);
  const selectedProductGroup = productGroups.find(
    (group) => group.type === categoryFilter,
  );
  const supplyHeading = selectedProductGroup?.title ?? "Farm supplies";
  const showChickens =
    categoryFilter === "all" || categoryFilter === "chickens";
  const showEggs = categoryFilter === "all" || categoryFilter === "eggs";
  const showSupplies =
    categoryFilter === "all" ||
    !["chickens", "eggs"].includes(categoryFilter);
  const refreshing =
    inventory.isRefetching ||
    productsQuery.isRefetching ||
    chickenOptions.isRefetching ||
    eggOptions.isRefetching ||
    openingStatus.isRefetching;

  async function refresh() {
    await Promise.all([
      inventory.refetch(),
      productsQuery.refetch(),
      chickenOptions.refetch(),
      eggOptions.refetch(),
      openingStatus.refetch(),
    ]);
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <FarmPageHeader title="Inventory" showBack fallbackHref="/(tabs)" />

        <View style={styles.intro}>
          <View style={styles.grow}>
            <AppText size="heading" weight="semibold">Farm inventory</AppText>
            <AppText size="small" tone="secondary">
              A clear view of livestock, harvest, and supplies on hand.
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh inventory"
            onPress={() => void refresh()}
            style={[
              styles.refreshButton,
              { borderColor: theme.border, backgroundColor: theme.backgroundElement },
            ]}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Ionicons name="refresh-outline" size={20} color={theme.primary} />
            )}
          </Pressable>
        </View>

        <View style={styles.summaryStrip}>
          <SummaryMetric
            chickenIcon
            label="Flock"
            value={chickenOptions.isLoading || chickenOptions.isError ? "—" : formatCount(chickenTotalCount)}
            unit="birds"
          />
          <SummaryMetric
            icon="egg-outline"
            label={eggCountsShareUnit ? "Eggs" : "Egg products"}
            value={
              eggOptions.isLoading || eggOptions.isError
                ? "—"
                : eggCountsShareUnit
                  ? formatCount(eggCount)
                  : String(eggs.length)
            }
            unit={eggCountsShareUnit ? eggBaseUnits[0] ?? "available" : "tracked"}
          />
          <SummaryMetric
            icon="file-tray-stacked-outline"
            label="Supplies"
            value={productsQuery.isLoading || productsQuery.isError || inventory.isLoading || inventory.isError
              ? "—"
              : String(stockedSupplyCount)}
            unit="in stock"
          />
        </View>

        {[
          { key: "products", label: "Supplies", error: productsQuery.error },
          { key: "inventory", label: "Stock balances", error: inventory.error },
          { key: "chickens", label: "Chicken stock", error: chickenOptions.error },
          { key: "eggs", label: "Egg stock", error: eggOptions.error },
          { key: "opening", label: "Opening stock setup", error: openingStatus.error },
        ]
          .filter(({ key }) => {
            if (key === "products") return productsQuery.isError;
            if (key === "inventory") return inventory.isError;
            if (key === "chickens") return chickenOptions.isError;
            if (key === "eggs") return eggOptions.isError;
            return openingStatus.isError;
          })
          .map(({ key, label, error }) => (
            <Card key={key} style={styles.errorCard}>
              <View style={styles.errorIcon}>
                <Ionicons name="alert-circle-outline" size={20} color={theme.danger} />
              </View>
              <View style={styles.grow}>
                <AppText weight="semibold">Couldn’t load {label.toLowerCase()}</AppText>
                <AppText size="small" tone="secondary">
                  {normalizeApiError(error).message}
                </AppText>
              </View>
            </Card>
          ))}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
        >
          {inventoryFilters.map((filter) => (
            <InventoryFilterChip
              key={filter.value}
              label={filter.label}
              selected={categoryFilter === filter.value}
              onPress={() => {
                setCategoryFilter(filter.value);
                if (filter.value !== "chickens") setChickenTypeFilter("all");
              }}
            />
          ))}
        </ScrollView>

        {showChickens && chickenTypes.length > 0 ? (
          <View style={styles.subFilterSection}>
            <AppText size="small" weight="semibold" tone="secondary">
              FLOCK TYPE
            </AppText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterList}
            >
              <InventoryFilterChip
                label="All types"
                selected={chickenTypeFilter === "all"}
                onPress={() => setChickenTypeFilter("all")}
              />
              {chickenTypes.map((type) => (
                <InventoryFilterChip
                  key={type}
                  label={chickenTypeLabels[type]}
                  selected={chickenTypeFilter === type}
                  onPress={() => setChickenTypeFilter(type)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {showChickens ? (
        <StockOverviewCard
          chickenIcon
          title="Chickens"
          subtitle={chickenBlocks.length ? `Housed across ${chickenBlocks.length} blocks` : "Birds by housing block"}
          quantity={
            chickenOptions.isLoading || chickenOptions.isError
              ? "—"
              : formatCount(chickenCount)
          }
          unit="birds"
          action="View flock"
          onPress={() => router.push("/(tabs)/flock" as Href)}
        >
          {chickenBlocks.length ? (
            chickenBlocks.map((block) => (
              <View
                key={block.id}
                style={[
                  styles.chickenBlockRow,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <View
                  style={[
                    styles.blockChickenIcon,
                    { backgroundColor: theme.backgroundElement },
                  ]}
                >
                  <Ionicons
                    name="home-outline"
                    size={17}
                    color={theme.primary}
                  />
                </View>
                <View style={styles.grow}>
                  <AppText size="small" weight="semibold">{block.name}</AppText>
                </View>
                <AppText size="small" weight="semibold">
                  {formatCount(block.displayed_chickens)} birds
                </AppText>
              </View>
            ))
          ) : chickenOptions.isLoading || chickenOptions.isError ? null : (
            <View style={styles.emptyCardMessage}>
              {openingStatus.data?.chickens.eligible ? (
                <>
                  <AppText size="small" tone="secondary">
                    Set the farm’s opening flock and assign every batch to housing blocks.
                  </AppText>
                  <Button
                    label="Set opening flock"
                    variant="secondary"
                    onPress={() =>
                      router.push({
                        pathname: "/inventory/opening-stock",
                        params: { species: "chickens" },
                      })
                    }
                  />
                </>
              ) : (
                <AppText size="small" tone="secondary">
                  No birds are assigned to blocks yet. Record a flock purchase or manage existing housing.
                </AppText>
              )}
            </View>
          )}
        </StockOverviewCard>
        ) : null}

        {showEggs ? (
        <StockOverviewCard
          icon="egg-outline"
          title="Eggs"
          subtitle={eggs.length ? `${eggs.length} egg products` : "Collected and unsold"}
          quantity={
            eggOptions.isLoading || eggOptions.isError ? "—" : formatCount(eggCount)
          }
          unit="eggs"
          action="View eggs"
          onPress={() => router.push("/(tabs)/eggs" as Href)}
        >
          {eggs.length ? (
            eggs.map((product) => (
              <View key={product.id} style={styles.detailRow}>
                <View style={styles.grow}>
                  <AppText size="small" weight="semibold">{product.name}</AppText>
                  <AppText size="small" tone="secondary">
                    {product.is_sellable ? "Available for sale" : "Not marked for sale"}
                  </AppText>
                  <AppText size="small" tone="secondary">
                    {eggConversionSummary(product.units)}
                  </AppText>
                </View>
                <AppText size="small" weight="semibold">
                  {formatCount(Number(product.available_quantity_in_base_unit))}{" "}
                  {product.units.find((unit) => unit.is_base_unit)?.abbreviation ?? "eggs"}
                </AppText>
              </View>
            ))
          ) : eggOptions.isLoading || eggOptions.isError ? null : (
            openingStatus.data?.eggs.eligible ? (
              <View style={styles.emptyCardMessage}>
                <AppText size="small" tone="secondary">
                  Record eggs already on hand once, tied to an egg product and housing block.
                </AppText>
                <Button
                  label="Set opening egg stock"
                  variant="secondary"
                  onPress={() =>
                    router.push({
                      pathname: "/inventory/opening-stock",
                      params: { species: "eggs" },
                    })
                  }
                />
              </View>
            ) : (
              <AppText size="small" tone="secondary">No unsold eggs currently available.</AppText>
            )
          )}
        </StockOverviewCard>
        ) : null}

        {showSupplies ? (
        <Card style={styles.suppliesCard}>
          <View style={styles.sectionHeading}>
            <View
              style={[
                styles.sectionIcon,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <Ionicons name="file-tray-stacked-outline" size={19} color={theme.primary} />
            </View>
            <View style={styles.grow}>
              <AppText size="heading" weight="semibold">{supplyHeading}</AppText>
              <AppText size="small" tone="secondary">
                Products currently on hand
              </AppText>
            </View>
          </View>

          {productsQuery.isLoading || inventory.isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={theme.primary} />
              <AppText size="small" tone="secondary">Loading supplies…</AppText>
            </View>
          ) : productsQuery.isError || inventory.isError ? (
            <AppText size="small" tone="secondary">
              Supply quantities are unavailable until inventory loads successfully.
            </AppText>
          ) : visibleSupplyProducts.length ? (
            visibleProductGroups.map((group) => {
              const groupedProducts = visibleSupplyProducts.filter(
                (product) => product.product_type === group.type,
              );
              if (!groupedProducts.length) return null;
              return (
                <View key={group.type} style={styles.productGroup}>
                  <View style={styles.groupHeading}>
                    <Ionicons name={group.icon} size={16} color={theme.primary} />
                    <AppText size="small" weight="semibold" tone="secondary">
                      {group.title.toUpperCase()}
                    </AppText>
                  </View>
                  {groupedProducts.map((product) => (
                    <SupplyRow
                      key={product.id}
                      product={product}
                      quantity={Number(
                        balanceByProduct.get(product.id)?.quantity ?? 0,
                      )}
                      unit={
                        balanceByProduct.get(product.id)?.unit_abbreviation ??
                        product.product_units.find((unit) => unit.is_base_unit)
                          ?.unit_abbreviation ??
                        ""
                      }
                    />
                  ))}
                </View>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <AppText weight="semibold">
                No {supplyHeading.toLowerCase()} tracked yet
              </AppText>
              <AppText size="small" tone="secondary">
                Add products like feed, medicine, or equipment to see their stock here.
              </AppText>
              <Button
                label="Add products"
                variant="secondary"
                onPress={() => router.push("/products")}
              />
            </View>
          )}

          <View style={[styles.purchaseAction, { borderTopColor: theme.border }]}>
            <Ionicons name="bag-handle-outline" size={18} color={theme.primary} />
            <View style={styles.grow}>
              <AppText weight="semibold">Need more supplies?</AppText>
              <AppText size="small" tone="secondary">
                Record a purchase and update stock with its supplier and payment.
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/inventory/purchase" as Href)}
              style={[
                styles.purchaseButton,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <Ionicons name="arrow-forward" size={18} color={theme.primary} />
            </Pressable>
          </View>
          <View style={[styles.purchaseAction, { borderTopColor: theme.border }]}>
            <Ionicons name="nutrition-outline" size={18} color={theme.primary} />
            <View style={styles.grow}>
            <AppText weight="semibold">Used some stock?</AppText>
            <AppText size="small" tone="secondary">
              Record feed, medication, or supply use and update the balance.
            </AppText>
            </View>
            <Pressable
            accessibilityRole="button"
            accessibilityLabel="Record product consumption"
            onPress={() => router.push("/inventory/consumption" as Href)}
            style={[
              styles.purchaseButton,
              { backgroundColor: theme.backgroundSelected },
            ]}
            >
            <Ionicons name="arrow-forward" size={18} color={theme.primary} />
            </Pressable>
          </View>
        </Card>
        ) : null}

        <View style={styles.footerNote}>
          <Ionicons name="information-circle-outline" size={17} color={theme.textSecondary} />
          <AppText size="small" tone="secondary" style={styles.footer}>
            Livestock and egg counts follow their flock and collection records. Farm supplies update from purchases and stock counts.
          </AppText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StockOverviewCard({
  icon,
  chickenIcon,
  title,
  subtitle,
  quantity,
  unit,
  action,
  onPress,
  children,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  chickenIcon?: boolean;
  title: string;
  subtitle: string;
  quantity: string;
  unit: string;
  action: string;
  onPress: () => void;
  children?: ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <Card
      style={[
        styles.stockCard,
        {
          borderColor: theme.border,
          backgroundColor: theme.backgroundElement,
        },
      ]}
    >
      {icon || chickenIcon ? (
        <View
          style={[
            styles.stockIcon,
            { backgroundColor: theme.backgroundSelected },
          ]}
        >
          {chickenIcon ? (
            <MaterialCommunityIcons
              name="bird"
              size={21}
              color={theme.primary}
            />
          ) : icon ? (
            <Ionicons name={icon} size={21} color={theme.primary} />
          ) : null}
        </View>
      ) : null}
      <View style={styles.stockDetails}>
        <AppText size="heading" weight="semibold">{title}</AppText>
        <AppText size="small" tone="secondary">{subtitle}</AppText>
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={styles.viewLink}
        >
          <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
            {action}
          </AppText>
          <Ionicons name="arrow-forward" size={15} color={theme.primary} />
        </Pressable>
      </View>
      <View style={styles.quantityBox}>
        <AppText size="title" weight="semibold">{quantity}</AppText>
        <AppText size="small" tone="secondary">{unit}</AppText>
      </View>
      {children ? (
        <View style={[styles.stockBreakdown, { borderTopColor: theme.border }]}>
          {children}
        </View>
      ) : null}
    </Card>
  );
}

function SupplyRow({
  product,
  quantity,
  unit,
}: {
  product: Product;
  quantity: number;
  unit: string;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push(`/products/${product.id}/inventory` as Href)
      }
      style={[
        styles.supplyRow,
        { borderBottomColor: theme.border },
      ]}
    >
      <View
        style={[
          styles.supplyIcon,
          { backgroundColor: theme.backgroundSelected },
        ]}
      >
        <Ionicons
          name={supplyIcon(product.product_type)}
          size={17}
          color={theme.primary}
        />
      </View>
      <View style={styles.supplyName}>
        <AppText size="small" weight="semibold" numberOfLines={1}>{product.name}</AppText>
        <AppText size="small" style={{ color: quantity > 0 ? theme.success : theme.textSecondary }}>
          {quantity > 0 ? "ON HAND" : "OUT OF STOCK"}
        </AppText>
        <AppText size="small" tone="secondary" numberOfLines={2}>
          {conversionSummary(product)}
        </AppText>
      </View>
      <View style={styles.quantityBox}>
        <AppText weight="semibold">{formatCount(quantity)}</AppText>
        <AppText size="small" tone="secondary">{unit}</AppText>
      </View>
      <Ionicons name="chevron-forward" size={17} color={theme.textSecondary} />
    </Pressable>
  );
}

function SummaryMetric({
  icon,
  chickenIcon,
  label,
  value,
  unit,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  chickenIcon?: boolean;
  label: string;
  value: string;
  unit: string;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.summaryMetric,
        {
          borderColor: theme.border,
          backgroundColor: theme.backgroundElement,
        },
      ]}
    >
      <View style={styles.summaryLabel}>
        {chickenIcon ? (
          <MaterialCommunityIcons
            name="bird"
            size={14}
            color={theme.textSecondary}
          />
        ) : icon ? (
          <Ionicons name={icon} size={14} color={theme.textSecondary} />
        ) : null}
        <AppText size="small" weight="semibold">{label}</AppText>
      </View>
      <AppText size="heading" weight="semibold">{value}</AppText>
      <AppText size="small" tone="secondary">{unit}</AppText>
    </View>
  );
}

function InventoryFilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.filterChip,
        {
          backgroundColor: selected
            ? theme.backgroundSelected
            : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}
    >
      <AppText
        size="small"
        weight={selected ? "semibold" : "regular"}
        style={selected ? { color: theme.primary } : undefined}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function conversionSummary(product: Product) {
  return unitConversionSummary(
    product.product_units.map((unit) => ({
      abbreviation: unit.unit_abbreviation,
      conversion_factor: unit.conversion_factor,
      is_base_unit: unit.is_base_unit,
    })),
  );
}

function eggConversionSummary(
  units: {
    abbreviation: string;
    conversion_factor: number | string;
    is_base_unit: boolean;
  }[],
) {
  return unitConversionSummary(units);
}

function unitConversionSummary(
  units: {
    abbreviation: string;
    conversion_factor: number | string;
    is_base_unit: boolean;
  }[],
) {
  const baseUnit = units.find((unit) => unit.is_base_unit);
  if (!baseUnit) return "Unit conversion not configured";
  const convertedUnits = units.filter((unit) => !unit.is_base_unit);
  if (convertedUnits.length === 0) {
    return `Base unit: ${baseUnit.abbreviation}`;
  }
  return convertedUnits
    .map(
      (unit) =>
        `1 ${unit.abbreviation} = ${formatCount(Number(unit.conversion_factor))} ${baseUnit.abbreviation}`,
    )
    .join("  ·  ");
}

function supplyIcon(type: ProductType): keyof typeof Ionicons.glyphMap {
  if (type === "feed") return "leaf-outline";
  if (type === "medication") return "medkit-outline";
  if (type === "equipment") return "construct-outline";
  return "cube-outline";
}

function formatCount(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 12,
    paddingBottom: 36,
    gap: 9,
  },
  intro: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 2 },
  summaryStrip: { flexDirection: "row", gap: 8 },
  summaryMetric: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    gap: 3,
  },
  summaryLabel: { flexDirection: "row", alignItems: "center", gap: 5 },
  grow: { flex: 1, minWidth: 0, gap: 4 },
  refreshButton: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  stockCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderRadius: 16,
  },
  stockIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  stockDetails: { flex: 1, minWidth: 0, gap: 3 },
  viewLink: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  quantityBox: { alignItems: "flex-end", gap: 1 },
  stockBreakdown: { flexBasis: "100%", gap: 7, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 2 },
  chickenBlockRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
  },
  blockChickenIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  filterList: { gap: 7, paddingVertical: 2, paddingRight: 4 },
  filterChip: {
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  subFilterSection: { gap: 4, paddingTop: 1 },
  suppliesCard: { gap: 10, padding: 12 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 9 },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  productGroup: { gap: 5 },
  groupHeading: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 3 },
  supplyRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 5,
    paddingHorizontal: 7,
    borderRadius: 11,
  },
  supplyIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  supplyName: { flex: 1, minWidth: 0, gap: 2 },
  purchaseAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  purchaseButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCardMessage: {
    borderRadius: 10,
    padding: 10,
  },
  emptyState: { gap: 8, alignItems: "flex-start", paddingVertical: 8 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 14 },
  errorCard: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  errorIcon: { paddingTop: 2 },
  footerNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    paddingHorizontal: 4,
    paddingTop: 3,
  },
  footer: { flex: 1 },
});
