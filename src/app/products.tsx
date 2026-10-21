import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { SessionGate } from "@/components/layout/session-gate";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Product, ProductType } from "@/features/management/api";
import { getProductTypeLabel } from "@/features/management/product-options";
import { useProducts } from "@/features/management/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type ProductFilter = ProductType | "all";
const productTypeOrder: ProductType[] = [
  "chickens",
  "eggs",
  "feed",
  "medication",
  "equipment",
  "other",
];
const emptyProducts: Product[] = [];

export default function ProductsScreen() {
  return (
    <SessionGate>
      <ProductsContent />
    </SessionGate>
  );
}

function ProductsContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const products = useProducts(user?.id, farm.selectedFarm?.id);
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<ProductFilter>("all");
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({});
  const productItems = products.data ?? emptyProducts;
  const activeCount = productItems.filter((product) => product.is_active).length;
  const sellableCount = productItems.filter((product) => product.is_sellable).length;
  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return productItems
      .filter((product) => selectedType === "all" || product.product_type === selectedType)
      .filter((product) =>
        `${product.name} ${product.description ?? ""} ${product.product_type}`
          .toLowerCase()
          .includes(query),
      );
  }, [productItems, search, selectedType]);
  if (products.isLoading) return <LoadingState label="Loading products" />;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <View style={styles.pageHeader}>
        <FarmPageHeader
          title="Product management"
          showBack
          backHref="/(tabs)/account"
        />
      </View>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={products.isRefetching}
            onRefresh={() => void products.refetch()}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <View style={styles.headerContent}>
            <View style={styles.intro}>
              <View style={styles.introCopy}>
                <AppText size="heading" weight="semibold" style={styles.pageTitle}>
                  Product catalogue
                </AppText>
                <AppText size="small" tone="secondary">
                  Keep farm products organized by type.
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/products/new")}
                style={({ pressed }) => [
                  styles.addButton,
                  { backgroundColor: theme.primary, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Ionicons name="add" size={20} color={theme.onPrimary} />
                <AppText size="small" weight="semibold" style={{ color: theme.onPrimary }}>
                  Add product
                </AppText>
              </Pressable>
            </View>
            <View style={styles.summaryRow}>
              <SummaryStat label="Products" value={productItems.length} color={theme.primary} />
              <SummaryStat label="Active" value={activeCount} color={theme.success} />
              <SummaryStat label="For sale" value={sellableCount} color={theme.secondary} />
            </View>
            {products.isError ? (
              <Card style={styles.errorCard}>
                <View style={styles.errorHeading}>
                  <Ionicons name="cloud-offline-outline" size={18} color={theme.danger} />
                  <AppText weight="semibold">Could not load products</AppText>
                </View>
                <AppText size="small" tone="secondary">
                  {normalizeApiError(products.error).message}
                </AppText>
                <Button
                  label="Retry"
                  variant="secondary"
                  onPress={() => void products.refetch()}
                />
              </Card>
            ) : null}
            <View
              style={[
                styles.searchField,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}
            >
              <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
              <TextInput
                accessibilityLabel="Search products"
                placeholder="Search products"
                placeholderTextColor={theme.textSecondary}
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
                style={[
                  styles.searchInput,
                  { color: theme.text, fontFamily: theme.fontFamily },
                ]}
              />
              {search ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear product search"
                  hitSlop={8}
                  onPress={() => setSearch("")}
                >
                  <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
                </Pressable>
              ) : null}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filters}
            >
              <TypeFilter
                label="All"
                count={productItems.length}
                selected={selectedType === "all"}
                onPress={() => setSelectedType("all")}
              />
              {productTypeOrder.map((type) => {
                const count = productItems.filter((item) => item.product_type === type).length;
                return (
                  <TypeFilter
                    key={type}
                    type={type}
                    label={getProductTypeLabel(type)}
                    count={count}
                    selected={selectedType === type}
                    onPress={() => setSelectedType(type)}
                  />
                );
              })}
            </ScrollView>
            {!products.isError && productItems.length > 0 ? (
              <View style={styles.resultHeading}>
                <AppText size="small" weight="semibold">
                  {selectedType === "all" ? "PRODUCT CATEGORIES" : getProductTypeLabel(selectedType).toUpperCase()}
                </AppText>
                <AppText size="small" tone="secondary">
                  {visibleProducts.length} {visibleProducts.length === 1 ? "item" : "items"}
                </AppText>
              </View>
            ) : null}
        </View>
        {!products.isError && productItems.length > 0 && visibleProducts.length === 0 ? (
          <Card style={styles.emptyState}>
            <AppText size="body" weight="semibold">No matching products</AppText>
            <AppText size="small" tone="secondary">
              Try another search or product category.
            </AppText>
          </Card>
        ) : null}
        {visibleProducts.length > 0 ? (
          <View style={styles.categoryList}>
            {productTypeOrder.map((type) => {
              const categoryProducts = visibleProducts
                .filter((product) => product.product_type === type)
                .sort((first, second) => first.name.localeCompare(second.name));
              if (!categoryProducts.length) return null;

              const expanded = expandedTypes[type] ?? true;
              return (
                <View
                  key={type}
                  style={[
                    styles.category,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    onPress={() =>
                      setExpandedTypes((current) => ({
                        ...current,
                        [type]: !expanded,
                      }))
                    }
                    style={({ pressed }) => [
                      styles.categoryHeader,
                      {
                        backgroundColor: theme.backgroundSelected,
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.categoryIcon,
                        { backgroundColor: theme.primary },
                      ]}
                    >
                      <Ionicons
                        name={productTypeIcon(type)}
                        size={17}
                        color={theme.onPrimary}
                      />
                    </View>
                    <AppText size="body" weight="semibold" style={styles.categoryTitle}>
                      {getProductTypeLabel(type)}
                    </AppText>
                    <View style={[styles.categoryCount, { backgroundColor: theme.background }]}>
                      <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                        {categoryProducts.length}
                      </AppText>
                    </View>
                    <Ionicons
                      name={expanded ? "chevron-up" : "chevron-down"}
                      size={17}
                      color={theme.textSecondary}
                    />
                  </Pressable>
                  {expanded ? (
                    <View style={[styles.productItems, { borderLeftColor: theme.primary }]}>
                      {categoryProducts.map((product) => (
                        <Pressable
                          key={product.id}
                          accessibilityRole="button"
                          accessibilityLabel={`${product.name}, ${getProductTypeLabel(product.product_type)}, ${product.is_active ? "active" : "inactive"}`}
                          onPress={() => router.push(`/products/${product.id}` as Href)}
                          style={({ pressed }) => [
                            styles.productRow,
                            {
                              backgroundColor: theme.background,
                              borderBottomColor: theme.border,
                              opacity: pressed ? 0.78 : 1,
                            },
                          ]}
                        >
                          <ProductListItem product={product} />
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
        {!products.isError && productItems.length === 0 ? (
          <Card style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundSelected }]}>
              <Ionicons name="cube-outline" size={22} color={theme.primary} />
            </View>
            <AppText size="body" weight="semibold">No products yet</AppText>
            <AppText size="small" tone="secondary">
              Create products to organize what your farm produces, uses, and sells.
            </AppText>
            <Button label="Add first product" onPress={() => router.push("/products/new")} />
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.summaryStat, { borderColor: theme.border }]}>
      <View style={[styles.statAccent, { backgroundColor: color }]} />
      <View style={styles.statCopy}>
        <AppText size="title" weight="semibold" style={styles.statValue}>
          {value}
        </AppText>
        <AppText size="small" tone="secondary" numberOfLines={1}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

function TypeFilter({
  type,
  label,
  count,
  selected,
  onPress,
}: {
  type?: ProductType;
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const color = theme.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        {
          backgroundColor: selected ? color : theme.backgroundElement,
          borderColor: selected ? color : theme.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      {type ? (
        <Ionicons
          name={productTypeIcon(type)}
          size={14}
          color={selected ? theme.onPrimary : color}
        />
      ) : null}
      <AppText
        size="small"
        weight="semibold"
        style={{ color: selected ? theme.onPrimary : theme.text }}
      >
        {label}
      </AppText>
      <AppText
        size="small"
        style={{ color: selected ? theme.onPrimary : theme.textSecondary }}
      >
        {count}
      </AppText>
    </Pressable>
  );
}

function ProductListItem({ product }: { product: Product }) {
  const { theme } = useTheme();
  const baseUnit = product.product_units.find((unit) => unit.is_base_unit);
  return (
    <>
      <View
        style={[
          styles.productIcon,
          { backgroundColor: theme.backgroundSelected },
        ]}
      >
        <Ionicons
          name={productTypeIcon(product.product_type)}
          size={18}
          color={theme.primary}
        />
      </View>
      <View style={styles.productCopy}>
        <View style={styles.productNameLine}>
          <AppText weight="semibold" numberOfLines={1} style={styles.productName}>
            {product.name}
          </AppText>
          <View
            style={[
              styles.status,
              {
                backgroundColor: theme.backgroundSelected,
              },
            ]}
          >
            <Ionicons
              name={product.is_active ? "checkmark-circle-outline" : "pause-circle-outline"}
              size={12}
              color={product.is_active ? theme.text : theme.textSecondary}
            />
            <AppText
              size="small"
              weight="semibold"
              style={{ color: product.is_active ? theme.text : theme.textSecondary }}
            >
              {product.is_active ? "Active" : "Inactive"}
            </AppText>
          </View>
        </View>
        <AppText size="small" tone="secondary" numberOfLines={1}>
          {baseUnit
            ? `${baseUnit.unit_name} (${baseUnit.unit_abbreviation})`
            : "No measurement unit"}
          {product.description ? ` · ${product.description}` : ""}
        </AppText>
        <View
          style={[
            styles.saleStatus,
            {
              backgroundColor: product.is_sellable
                ? `${theme.success}16`
                : theme.backgroundSelected,
            },
          ]}
        >
          <Ionicons
            name={product.is_sellable ? "pricetag-outline" : "ban-outline"}
            size={13}
            color={product.is_sellable ? theme.success : theme.textSecondary}
          />
          <AppText
            size="small"
            weight="semibold"
            numberOfLines={1}
            style={{ color: product.is_sellable ? theme.success : theme.textSecondary }}
          >
            {product.is_sellable ? "For sale" : "Not for sale"}
          </AppText>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={17} color={theme.textSecondary} />
    </>
  );
}

function productTypeIcon(type: ProductType): keyof typeof Ionicons.glyphMap {
  const icons: Record<ProductType, keyof typeof Ionicons.glyphMap> = {
    chickens: "home-outline",
    eggs: "egg-outline",
    feed: "leaf-outline",
    medication: "medkit-outline",
    equipment: "construct-outline",
    other: "cube-outline",
  };
  return icons[type];
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  pageHeader: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  list: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 32,
  },
  headerContent: { gap: 16, paddingBottom: 20 },
  intro: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  introCopy: { flex: 1, gap: 3 },
  pageTitle: { fontSize: 23, lineHeight: 29 },
  addButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 7,
    paddingHorizontal: 12,
  },
  summaryRow: { flexDirection: "row", gap: 9 },
  summaryStat: {
    flex: 1,
    minWidth: 0,
    minHeight: 64,
    flexDirection: "row",
    alignItems: "stretch",
    overflow: "hidden",
    borderWidth: 1,
    borderRadius: 8,
  },
  statAccent: { width: 3 },
  statCopy: { justifyContent: "center", gap: 0, paddingHorizontal: 9, paddingVertical: 7 },
  statValue: { fontSize: 20, lineHeight: 24 },
  errorCard: { gap: 9, borderRadius: 9 },
  errorHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchField: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 8, fontSize: 14 },
  filters: { gap: 7, paddingRight: 18 },
  filterChip: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 17,
    paddingHorizontal: 11,
  },
  resultHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 3,
  },
  categoryList: { gap: 8 },
  category: {
    overflow: "hidden",
    borderWidth: 1,
    borderRadius: 9,
  },
  categoryHeader: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 11,
  },
  categoryIcon: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  categoryCount: {
    minWidth: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    paddingHorizontal: 6,
  },
  categoryTitle: { flex: 1 },
  productItems: {
    borderLeftWidth: 2,
    marginLeft: 18,
    marginVertical: 8,
    marginRight: 10,
    paddingLeft: 9,
  },
  productRow: {
    minHeight: 65,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 7,
    marginBottom: 4,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  productIcon: {
    width: 33,
    height: 33,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  productCopy: { flex: 1, minWidth: 0, gap: 2 },
  productNameLine: { flexDirection: "row", alignItems: "center", gap: 7 },
  productName: { flex: 1 },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  saleStatus: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 25,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 3,
  },
  emptyState: { gap: 9, borderRadius: 10 },
  emptyIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
});
