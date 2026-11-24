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
  const [showFilters, setShowFilters] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<InventoryFilter>("all");
  const [chickenTypeFilter, setChickenTypeFilter] =
    useState<ChickenType | "all">("all");

  const products = productsQuery.data ?? [];
  const hasActiveChickenProduct = products.some(
    (product) => product.is_active && product.product_type === "chickens",
  );
  const hasActiveEggProduct = products.some(
    (product) => product.is_active && product.product_type === "eggs",
  );
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
      <View
        style={[
          styles.fixedHeader,
          {
            borderBottomColor: theme.border,
            backgroundColor: theme.background,
          },
        ]}
      >
        <FarmPageHeader title="Inventory" showBack fallbackHref="/(tabs)" />
        <View style={styles.supplyActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Purchase supplies"
            onPress={() => router.push("/inventory/purchase" as Href)}
            style={({ pressed }) => [
              styles.supplyActionButton,
              {
                backgroundColor: theme.primary,
                opacity: pressed ? 0.78 : 1,
              },
            ]}
          >
            <Ionicons name="add" size={18} color={theme.onPrimary} />
            <AppText
              size="small"
              weight="semibold"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ color: theme.onPrimary }}
            >
              Purchase supplies
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Record supply use"
            onPress={() => router.push("/inventory/consumption" as Href)}
            style={({ pressed }) => [
              styles.supplyActionButton,
              styles.supplyActionSecondary,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <Ionicons name="remove" size={18} color={theme.primary} />
            <AppText
              size="small"
              weight="semibold"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ color: theme.primary }}
            >
              Record use
            </AppText>
          </Pressable>
        </View>
      </View>
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

        <View
          style={[styles.snapshotCard, { backgroundColor: theme.primary }]}
        >
          <View style={styles.snapshotHeading}>
            <View
              style={[
                styles.snapshotIcon,
                { backgroundColor: withOpacity(theme.onPrimary, 0.14) },
              ]}
            >
              <Ionicons
                name="layers-outline"
                size={17}
                color={theme.onPrimary}
              />
            </View>
            <View style={styles.grow}>
              <AppText
                size="small"
                weight="semibold"
                style={{ color: theme.onPrimary }}
              >
                Stock snapshot
              </AppText>
              <AppText
                size="small"
                style={{ color: withOpacity(theme.onPrimary, 0.78) }}
              >
                Current holdings across your farm
              </AppText>
            </View>
          </View>
          <View
            style={[
              styles.summaryStrip,
              { borderTopColor: withOpacity(theme.onPrimary, 0.26) },
            ]}
          >
            <SummaryMetric
              chickenIcon
              label="Flock"
              value={chickenOptions.isLoading || chickenOptions.isError ? "—" : formatCount(chickenTotalCount)}
              unit="birds"
              color={theme.onPrimary}
            />
            <View
              style={[
                styles.summaryDivider,
                { backgroundColor: withOpacity(theme.onPrimary, 0.26) },
              ]}
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
              color={theme.onPrimary}
            />
            <View
              style={[
                styles.summaryDivider,
                { backgroundColor: withOpacity(theme.onPrimary, 0.26) },
              ]}
            />
            <SummaryMetric
              icon="file-tray-stacked-outline"
              label="Supplies"
              value={productsQuery.isLoading || productsQuery.isError || inventory.isLoading || inventory.isError
                ? "—"
                : String(stockedSupplyCount)}
              unit="in stock"
              color={theme.onPrimary}
            />
          </View>
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

        <View style={styles.filterSection}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showFilters }}
            onPress={() => setShowFilters((expanded) => !expanded)}
            style={({ pressed }) => [
              styles.filterToggle,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
                opacity: pressed ? 0.78 : 1,
              },
            ]}
          >
            <View
              style={[
                styles.filterToggleIcon,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <Ionicons name="filter-outline" size={17} color={theme.primary} />
            </View>
            <View style={styles.grow}>
              <AppText size="small" weight="semibold">Filter inventory</AppText>
              <AppText size="small" tone="secondary">
                {categoryFilter === "all"
                  ? "Showing all stock categories"
                  : `${inventoryFilters.find((filter) => filter.value === categoryFilter)?.label ?? "All"}${categoryFilter === "chickens" && chickenTypeFilter !== "all" ? ` · ${chickenTypeLabels[chickenTypeFilter]}` : ""}`}
              </AppText>
            </View>
            <Ionicons
              name={showFilters ? "chevron-up" : "chevron-down"}
              size={18}
              color={theme.textSecondary}
            />
          </Pressable>
          {showFilters ? (
            <View
              style={[
                styles.filterPanel,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.categoryHeading}>
                <AppText size="small" weight="semibold" tone="secondary">
                  STOCK TYPE
                </AppText>
                {categoryFilter !== "all" ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setCategoryFilter("all");
                      setChickenTypeFilter("all");
                    }}
                  >
                    <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                      Clear
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.filterGrid}>
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
              </View>
              {showChickens && chickenTypes.length > 0 ? (
                <View style={[styles.chickenFilterGroup, { borderTopColor: theme.border }]}>
                  <AppText size="small" weight="semibold" tone="secondary">
                    FLOCK TYPE
                  </AppText>
                  <View style={styles.filterGrid}>
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
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

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
                  <AppText size="small" tone="secondary">No stock recorded</AppText>
                  <View style={styles.emptyActionRow}>
                    {hasActiveChickenProduct ? (
                      <CompactAction
                        label="Opening flock"
                        onPress={() =>
                          router.push({
                            pathname: "/inventory/opening-stock",
                            params: { species: "chickens" },
                          })
                        }
                      />
                    ) : productsQuery.isSuccess ? (
                      <CompactAction
                        label="Add chicken product"
                        primary
                        onPress={() =>
                          router.push({
                            pathname: "/products/new",
                            params: {
                              setupType: "chickens",
                              returnToInventory: "true",
                            },
                          })
                        }
                      />
                    ) : null}
                    <CompactAction
                      label="Purchase"
                      primary={hasActiveChickenProduct}
                      onPress={() => router.push("/chicken-purchase" as Href)}
                    />
                  </View>
                </>
              ) : (
                <>
                  <AppText size="small" tone="secondary">No birds assigned to housing</AppText>
                  <CompactAction
                    label="Record purchase"
                    primary
                    onPress={() =>
                      router.push("/chicken-purchase" as Href)
                    }
                  />
                </>
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
            <>
              {eggCount <= 0 ? (
                <View style={styles.emptyCardMessage}>
                  <AppText size="small" tone="secondary">No stock recorded</AppText>
                  <View style={styles.emptyActionRow}>
                    {openingStatus.data?.eggs.eligible && hasActiveEggProduct ? (
                      <CompactAction
                        label="Opening stock"
                        onPress={() =>
                          router.push({
                            pathname: "/inventory/opening-stock",
                            params: { species: "eggs" },
                          })
                        }
                      />
                    ) : null}
                      {!hasActiveEggProduct && productsQuery.isSuccess ? (
                        <CompactAction
                          label="Add egg product"
                          primary
                          onPress={() =>
                            router.push({
                              pathname: "/products/new",
                              params: {
                                setupType: "eggs",
                                returnToInventory: "true",
                              },
                            })
                          }
                        />
                      ) : null}
                      <CompactAction
                        label="Collect eggs"
                        primary={hasActiveEggProduct}
                        onPress={() => router.push("/egg-collection" as Href)}
                      />
                  </View>
                </View>
              ) : null}
              {eggs.map((product) => (
                <View
                  key={product.id}
                  style={[styles.detailRow, { borderBottomColor: theme.border }]}
                >
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
              ))}
            </>
          ) : eggOptions.isLoading || eggOptions.isError ? null : (
            openingStatus.data?.eggs.eligible && hasActiveEggProduct ? (
              <View style={styles.emptyCardMessage}>
                <AppText size="small" tone="secondary">No unsold eggs currently available.</AppText>
                <CompactAction
                  label="Set up egg stock"
                  primary
                  onPress={() =>
                    router.push({
                      pathname: "/inventory/opening-stock",
                      params: { species: "eggs" },
                    })
                  }
                />
              </View>
            ) : openingStatus.data?.eggs.eligible &&
              !hasActiveEggProduct &&
              productsQuery.isSuccess ? (
              <View style={styles.emptyCardMessage}>
                <AppText size="small" tone="secondary">
                  Add an active egg product before recording opening stock.
                </AppText>
                <CompactAction
                  label="Add egg product"
                  primary
                  onPress={() =>
                    router.push({
                      pathname: "/products/new",
                      params: {
                        setupType: "eggs",
                        returnToInventory: "true",
                      },
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
          <View style={styles.suppliesHeader}>
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
              </View>
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
                <View
                  key={group.type}
                  style={[
                    styles.productGroup,
                    { borderColor: theme.border, backgroundColor: theme.backgroundElement },
                  ]}
                >
                  <View
                    style={[
                      styles.groupHeading,
                      {
                        backgroundColor: theme.backgroundSelected,
                        borderBottomColor: theme.border,
                      },
                    ]}
                  >
                    <View style={styles.groupTitleRow}>
                      <Ionicons
                        name={group.icon}
                        size={17}
                        color={theme.primary}
                      />
                      <AppText size="small" weight="semibold" style={styles.grow}>
                        {group.title}
                      </AppText>
                    </View>
                    <View style={styles.groupCount}>
                      <AppText size="small" tone="secondary">
                        {groupedProducts.length}{" "}
                        {groupedProducts.length === 1 ? "product" : "products"}
                      </AppText>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.productRows,
                      { backgroundColor: theme.background },
                    ]}
                  >
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
                    {groupedProducts.every(
                      (product) =>
                        Number(balanceByProduct.get(product.id)?.quantity ?? 0) <= 0,
                    ) ? (
                      <View style={styles.emptySupplyActions}>
                        <AppText size="small" tone="secondary">No stock</AppText>
                        <View style={styles.emptyActionRow}>
                          <CompactAction
                            label="Opening count"
                            onPress={() =>
                              groupedProducts.length === 1
                                ? router.push(
                                    `/products/${groupedProducts[0].id}/inventory` as Href,
                                  )
                                : router.push("/products")
                            }
                          />
                          <CompactAction
                            label="Purchase"
                            primary
                            onPress={() =>
                              groupedProducts.length === 1
                                ? router.push({
                                    pathname: "/inventory/purchase",
                                    params: { productId: groupedProducts[0].id },
                                  })
                                : router.push("/inventory/purchase" as Href)
                            }
                          />
                        </View>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <AppText weight="semibold">
                No {supplyHeading.toLowerCase()} yet
              </AppText>
              <View style={styles.emptyActionRow}>
                <CompactAction
                  label={categoryFilter === "feed" ? "Opening stock" : "Add supply"}
                  onPress={() => {
                    if (categoryFilter === "feed") {
                      router.push({
                        pathname: "/products/new",
                        params: {
                          setupType: "feed",
                          returnToInventory: "true",
                        },
                      });
                    } else {
                      router.push("/products");
                    }
                  }}
                />
                <CompactAction
                  label={categoryFilter === "feed" ? "Buy feed" : "Purchase"}
                  primary
                  onPress={() => router.push("/inventory/purchase" as Href)}
                />
              </View>
            </View>
          )}

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
        <AppText size="body" weight="semibold">{title}</AppText>
        <AppText size="small" tone="secondary">{subtitle}</AppText>
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={[
            styles.viewLink,
            { backgroundColor: theme.backgroundSelected },
          ]}
        >
          <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
            {action}
          </AppText>
          <Ionicons name="arrow-forward" size={15} color={theme.primary} />
        </Pressable>
      </View>
      <View
        style={[
          styles.quantityBox,
          { backgroundColor: theme.backgroundSelected },
        ]}
      >
        <AppText
          size="heading"
          weight="semibold"
          style={{ color: theme.primary }}
        >
          {quantity}
        </AppText>
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

function CompactAction({
  label,
  primary = false,
  onPress,
}: {
  label: string;
  primary?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.compactAction,
        {
          backgroundColor: primary ? theme.primary : theme.backgroundSelected,
          borderColor: primary ? theme.primary : theme.border,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      <AppText
        size="small"
        weight="semibold"
        numberOfLines={1}
        style={{ color: primary ? theme.onPrimary : theme.text }}
      >
        {label}
      </AppText>
    </Pressable>
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
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
        },
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
        <View
          style={[
            styles.stockStatus,
            {
              backgroundColor: withOpacity(
                quantity > 0 ? theme.success : theme.danger,
                0.1,
              ),
            },
          ]}
        >
          <View
            style={[
              styles.stockStatusDot,
              { backgroundColor: quantity > 0 ? theme.success : theme.danger },
            ]}
          />
          <AppText
            size="small"
            weight="semibold"
            style={{ color: quantity > 0 ? theme.success : theme.danger }}
          >
            {quantity > 0 ? "In stock" : "Out of stock"}
          </AppText>
        </View>
      </View>
      <View
        style={[
          styles.supplyQuantity,
          { backgroundColor: theme.backgroundSelected },
        ]}
      >
        <AppText size="small" weight="semibold" style={{ color: theme.text }}>
          {formatCount(quantity)}
        </AppText>
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
  color,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  chickenIcon?: boolean;
  label: string;
  value: string;
  unit: string;
  color: string;
}) {
  return (
    <View style={styles.summaryMetric}>
      <View style={styles.summaryLabel}>
        {chickenIcon ? (
          <MaterialCommunityIcons
            name="bird"
            size={14}
            color={color}
          />
        ) : icon ? (
          <Ionicons name={icon} size={14} color={color} />
        ) : null}
        <AppText
          size="small"
          weight="semibold"
          numberOfLines={1}
          style={{ color }}
        >
          {label}
        </AppText>
      </View>
      <AppText
        size="heading"
        weight="semibold"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ color }}
      >
        {value}
      </AppText>
      <AppText size="small" style={{ color: withOpacity(color, 0.78) }}>
        {unit}
      </AppText>
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

function withOpacity(color: string, opacity: number): string {
  const hex = color.replace("#", "");
  const expanded =
    hex.length === 3
      ? hex
          .split("")
          .map((channel) => `${channel}${channel}`)
          .join("")
      : hex;
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
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
  fixedHeader: {
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 7,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 12,
  },
  intro: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 2 },
  snapshotCard: {
    gap: 17,
    borderRadius: 20,
    padding: 17,
    marginBottom: 2,
  },
  snapshotHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  snapshotIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  summaryStrip: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  summaryMetric: {
    flex: 1,
    minWidth: 0,
    justifyContent: "flex-start",
    gap: 4,
  },
  summaryLabel: { flexDirection: "row", alignItems: "center", gap: 5 },
  summaryDivider: { width: StyleSheet.hairlineWidth, marginVertical: 2 },
  grow: { flex: 1, minWidth: 0, gap: 4 },
  refreshButton: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  stockCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    padding: 13,
    borderWidth: 1,
    borderRadius: 16,
  },
  stockIcon: {
    width: 37,
    height: 37,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  stockDetails: { flex: 1, minWidth: 0, gap: 1 },
  viewLink: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 4,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  quantityBox: {
    minWidth: 58,
    alignItems: "flex-end",
    gap: 1,
    borderRadius: 13,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  stockBreakdown: {
    flexBasis: "100%",
    gap: 8,
    paddingTop: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(93, 119, 116, 0.18)",
  },
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
  filterSection: { gap: 8, marginTop: 1 },
  filterToggle: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  filterToggleIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  filterPanel: {
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
  },
  categoryHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  filterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  chickenFilterGroup: {
    gap: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 11,
  },
  filterChip: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  suppliesCard: { gap: 16, padding: 17, borderRadius: 19 },
  suppliesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 11, flex: 1 },
  sectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  productGroup: {
    overflow: "hidden",
    borderWidth: 1,
    borderRadius: 14,
  },
  groupHeading: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  groupTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 9, minWidth: 0 },
  groupCount: { alignItems: "flex-end", gap: 1 },
  productRows: {
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  emptySupplyActions: { gap: 6, paddingHorizontal: 10, paddingBottom: 8 },
  emptyActionRow: { flexDirection: "row", alignSelf: "stretch", gap: 8 },
  compactAction: {
    minHeight: 38,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  supplyActions: { flexDirection: "row", gap: 9 },
  supplyActionButton: {
    minHeight: 42,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 11,
    paddingHorizontal: 8,
  },
  supplyActionSecondary: { borderWidth: 1 },
  supplyRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  supplyIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  supplyName: { flex: 1, minWidth: 0, gap: 3 },
  supplyQuantity: {
    minWidth: 62,
    alignItems: "flex-end",
    gap: 1,
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  stockStatus: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  stockStatusDot: { width: 6, height: 6, borderRadius: 3 },
  emptyCardMessage: { flexBasis: "100%", gap: 7, paddingTop: 4 },
  emptyState: { gap: 8, alignItems: "stretch", paddingVertical: 8 },
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
