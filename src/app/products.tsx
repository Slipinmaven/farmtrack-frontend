import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
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
  const [filterOpen, setFilterOpen] = useState(false);
  const productItems = products.data ?? emptyProducts;
  const availableTypes = productTypeOrder.filter((type) =>
    productItems.some((product) => product.product_type === type),
  );
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
          title="Products"
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
                Your products
              </AppText>
              <AppText size="small" tone="secondary">
                Manage product details, units, and sale status.
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a product"
              onPress={() => router.push("/products/new")}
              style={({ pressed }) => [
                styles.addButton,
                {
                  backgroundColor: theme.primary,
                  opacity: pressed ? 0.84 : 1,
                },
              ]}
            >
              <Ionicons name="add" size={20} color={theme.onPrimary} />
              <AppText
                size="small"
                weight="semibold"
                style={{ color: theme.onPrimary }}
              >
                Add product
              </AppText>
            </Pressable>
          </View>
          {products.isError ? (
            <Card style={styles.errorCard}>
              <View style={styles.errorHeading}>
                <Ionicons
                  name="cloud-offline-outline"
                  size={18}
                  color={theme.danger}
                />
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
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <Ionicons
              name="search-outline"
              size={18}
              color={theme.textSecondary}
            />
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
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={theme.textSecondary}
                />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Filter products, currently ${selectedType === "all" ? "all types" : getProductTypeLabel(selectedType)}`}
            accessibilityState={{ expanded: filterOpen }}
            onPress={() => setFilterOpen(true)}
            style={({ pressed }) => [
              styles.filterButton,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <View style={styles.filterButtonLabel}>
              <Ionicons name="filter-outline" size={18} color={theme.primary} />
              <AppText size="small" weight="semibold">
                {selectedType === "all"
                  ? "All product types"
                  : getProductTypeLabel(selectedType)}
              </AppText>
            </View>
            <View style={styles.filterButtonValue}>
              <Ionicons
                name="chevron-down"
                size={17}
                color={theme.textSecondary}
              />
            </View>
          </Pressable>
          {!products.isError && productItems.length > 0 ? (
            <View style={styles.resultHeading}>
              <AppText size="small" weight="semibold">
                {selectedType === "all"
                  ? "Products"
                  : getProductTypeLabel(selectedType)}
              </AppText>
              <AppText size="small" tone="secondary">
                {visibleProducts.length}{" "}
                {visibleProducts.length === 1 ? "item" : "items"}
              </AppText>
            </View>
          ) : null}
        </View>
        {!products.isError &&
        productItems.length > 0 &&
        visibleProducts.length === 0 ? (
          <Card style={styles.emptyState}>
            <AppText size="body" weight="semibold">
              No matching products
            </AppText>
            <AppText size="small" tone="secondary">
              Try another search or product category.
            </AppText>
            <Button
              label="Clear search and filters"
              variant="secondary"
              onPress={() => {
                setSearch("");
                setSelectedType("all");
              }}
            />
          </Card>
        ) : null}
        {visibleProducts.length > 0 ? (
          <View style={styles.categoryList}>
            {productTypeOrder.map((type, categoryIndex) => {
              const categoryProducts = visibleProducts
                .filter((product) => product.product_type === type)
                .sort((first, second) => first.name.localeCompare(second.name));
              if (!categoryProducts.length) return null;

              return (
                <Animated.View
                  key={type}
                  entering={FadeInDown.duration(240).delay(
                    Math.min(categoryIndex, 4) * 45,
                  )}
                  style={[
                    styles.category,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.categoryHeader,
                      { borderBottomColor: theme.border },
                    ]}
                  >
                    <View
                      style={[
                        styles.categoryIcon,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <Ionicons
                        name={productTypeIcon(type)}
                        size={17}
                        color={theme.primary}
                      />
                    </View>
                    <AppText size="body" weight="semibold" style={styles.categoryTitle}>
                      {getProductTypeLabel(type)}
                    </AppText>
                    <View
                      style={[
                        styles.categoryCount,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <AppText size="small" weight="semibold" tone="secondary">
                      {categoryProducts.length}
                      </AppText>
                    </View>
                  </View>
                  <View style={styles.productItems}>
                    {categoryProducts.map((product, index) => (
                      <Animated.View
                        key={product.id}
                        entering={FadeInDown.duration(200).delay(
                          Math.min(index, 4) * 35,
                        )}
                      >
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${product.name}, ${getProductTypeLabel(product.product_type)}, ${product.is_active ? "active" : "inactive"}, ${product.is_sellable ? "for sale" : "not for sale"}`}
                          onPress={() =>
                            router.push(`/products/${product.id}` as Href)
                          }
                          style={({ pressed }) => [
                            styles.productRow,
                            {
                              borderBottomColor:
                                index === categoryProducts.length - 1
                                  ? "transparent"
                                  : theme.border,
                              backgroundColor: pressed
                                ? theme.backgroundSelected
                                : "transparent",
                            },
                          ]}
                        >
                          <ProductListItem product={product} />
                        </Pressable>
                      </Animated.View>
                    ))}
                  </View>
                </Animated.View>
              );
            })}
          </View>
        ) : null}
        {!products.isError && productItems.length === 0 ? (
          <Card style={styles.emptyState}>
            <View
              style={[
                styles.emptyIcon,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <Ionicons name="cube-outline" size={22} color={theme.primary} />
            </View>
            <AppText size="body" weight="semibold">
              No products yet
            </AppText>
            <AppText size="small" tone="secondary">
              Create products to organize what your farm produces, uses, and sells.
            </AppText>
          </Card>
        ) : null}
      </ScrollView>
      <Modal
        visible={filterOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterOpen(false)}
      >
        <View style={styles.filterModalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close product filters"
            onPress={() => setFilterOpen(false)}
            style={styles.filterScrim}
          />
          <View
            style={[
              styles.filterSheet,
              {
                backgroundColor: theme.background,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.filterSheetHeading}>
              <View style={styles.filterSheetCopy}>
                <AppText size="heading" weight="semibold">
                  Filter products
                </AppText>
                <AppText size="small" tone="secondary">
                  Choose a product type to narrow the list.
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close product filters"
                onPress={() => setFilterOpen(false)}
                hitSlop={8}
                style={styles.filterClose}
              >
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.filterOptionsScroll}
              contentContainerStyle={styles.filterOptions}
            >
              <ProductTypeOption
                label="All products"
                count={productItems.length}
                selected={selectedType === "all"}
                onPress={() => {
                  setSelectedType("all");
                  setFilterOpen(false);
                }}
              />
              {availableTypes.map((type) => (
                <ProductTypeOption
                  key={type}
                  type={type}
                  label={getProductTypeLabel(type)}
                  count={
                    productItems.filter((item) => item.product_type === type)
                      .length
                  }
                  selected={selectedType === type}
                  onPress={() => {
                    setSelectedType(type);
                    setFilterOpen(false);
                  }}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ProductTypeOption({
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterOption,
        {
          backgroundColor: pressed ? theme.backgroundSelected : "transparent",
          borderBottomColor: theme.border,
        },
      ]}
    >
      <View style={styles.filterOptionMain}>
        {type ? (
          <View
            style={[
              styles.filterOptionIcon,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <Ionicons
              name={productTypeIcon(type)}
              size={17}
              color={theme.primary}
            />
          </View>
        ) : (
          <View
            style={[
              styles.filterOptionIcon,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <Ionicons name="grid-outline" size={17} color={theme.primary} />
          </View>
        )}
        <AppText size="body" weight={selected ? "semibold" : "regular"}>
          {label}
        </AppText>
      </View>
      <View style={styles.filterOptionTrailing}>
        <AppText size="small" tone="secondary">
          {count}
        </AppText>
        {selected ? (
          <Ionicons name="checkmark-circle" size={19} color={theme.primary} />
        ) : (
          <View style={styles.filterOptionCheckPlaceholder} />
        )}
      </View>
    </Pressable>
  );
}

function ProductListItem({ product }: { product: Product }) {
  const { theme } = useTheme();
  const baseUnit = product.product_units.find((unit) => unit.is_base_unit);
  const activeColor =
    product.is_active
      ? theme.mode === "dark"
        ? "#8FD0A5"
        : theme.success
      : theme.textSecondary;
  const saleColor =
    product.is_sellable
      ? theme.mode === "dark"
        ? "#8FD0A5"
        : theme.success
      : theme.textSecondary;
  return (
    <>
      <View style={styles.productCopy}>
        <AppText weight="semibold" style={styles.productName}>
          {product.name}
        </AppText>
        <AppText size="small" tone="secondary">
          {baseUnit
            ? `${baseUnit.unit_name} (${baseUnit.unit_abbreviation})`
            : "No measurement unit"}
        </AppText>
        {product.description &&
        product.product_type !== "chickens" &&
        product.product_type !== "eggs" ? (
          <AppText size="small" tone="secondary">
            {product.description}
          </AppText>
        ) : null}
        <View style={styles.productStatuses}>
          <ProductStatus
            icon={product.is_active ? "checkmark-circle" : "pause-circle-outline"}
            label={product.is_active ? "Active" : "Inactive"}
            color={activeColor}
          />
          <ProductStatus
            icon={product.is_sellable ? "pricetag-outline" : "remove-circle-outline"}
            label={product.is_sellable ? "For sale" : "Not for sale"}
            color={saleColor}
          />
        </View>
      </View>
      <Ionicons name="chevron-forward" size={17} color={theme.textSecondary} />
    </>
  );
}

function ProductStatus({
  icon,
  label,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.productStatus,
        {
          backgroundColor: withOpacity(
            color,
            theme.mode === "dark" ? 0.16 : 0.09,
          ),
        },
      ]}
    >
      <Ionicons name={icon} size={14} color={color} />
      <AppText size="small" weight="semibold" style={{ color }}>
        {label}
      </AppText>
    </View>
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
    paddingTop: 14,
    paddingBottom: 44,
  },
  headerContent: { gap: 14, paddingBottom: 8 },
  intro: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  introCopy: { flex: 1, minWidth: 0, gap: 3 },
  pageTitle: { fontSize: 22, lineHeight: 28 },
  addButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 11,
    paddingHorizontal: 13,
  },
  errorCard: { gap: 9, borderRadius: 9 },
  errorHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchField: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 8, fontSize: 14 },
  filterButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 13,
  },
  filterButtonLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  filterButtonValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  resultHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    minHeight: 28,
  },
  categoryList: { gap: 12 },
  category: {
    borderWidth: 1,
    borderRadius: 15,
  },
  categoryHeader: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 13,
  },
  categoryIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  categoryCount: {
    minWidth: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingHorizontal: 7,
  },
  categoryTitle: { flex: 1 },
  productItems: {
    paddingHorizontal: 13,
  },
  productRow: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 2,
    paddingVertical: 13,
  },
  productCopy: { flex: 1, minWidth: 0, gap: 4 },
  productName: { flexShrink: 1 },
  productStatuses: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 7,
  },
  productStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  filterModalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  filterScrim: { ...StyleSheet.absoluteFill },
  filterSheet: {
    maxHeight: "78%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 24,
  },
  filterSheetHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 14,
  },
  filterSheetCopy: { flex: 1, gap: 3 },
  filterClose: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
  },
  filterOptionsScroll: { flexGrow: 0 },
  filterOptions: { paddingBottom: 4 },
  filterOption: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterOptionMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  filterOptionIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  filterOptionTrailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  filterOptionCheckPlaceholder: { width: 19, height: 19 },
  emptyState: { gap: 9, borderRadius: 14 },
  emptyIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
});
