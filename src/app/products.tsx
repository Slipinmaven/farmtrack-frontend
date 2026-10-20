import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { SessionGate } from "@/components/layout/session-gate";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import type { Product } from "@/features/management/api";
import { getProductTypeLabel } from "@/features/management/product-options";
import { useProducts } from "@/features/management/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

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
  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (products.data ?? []).filter((product) =>
      `${product.name} ${product.description ?? ""} ${product.product_type}`
        .toLowerCase()
        .includes(query),
    );
  }, [products.data, search]);

  if (products.isLoading) return <LoadingState label="Loading products" />;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <View style={styles.content}>
        <FarmPageHeader
          title="Product management"
          showBack
          backHref="/(tabs)/account"
        />
        <View style={styles.toolbar}>
          <Button
            label="Add product"
            onPress={() => router.push("/products/new")}
          />
        </View>
        {products.isError ? (
          <Card style={styles.state}>
            <AppText weight="semibold">Could not load products</AppText>
            <AppText tone="secondary">
              {normalizeApiError(products.error).message}
            </AppText>
            <Button
              label="Retry"
              variant="secondary"
              onPress={() => void products.refetch()}
            />
          </Card>
        ) : null}
        <TextField
          label="Search products"
          placeholder="Search by name, description, or type"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        <FlatList
          data={products.isError ? [] : visibleProducts}
          keyExtractor={(product) => product.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            !products.isError ? (
              <Card style={styles.state}>
                <AppText weight="semibold">
                  {search ? "No matching products" : "No products yet"}
                </AppText>
                <AppText tone="secondary">
                  {search
                    ? "Try another name, description, or product type."
                    : "Create products to organize what your farm produces, uses, and sells."}
                </AppText>
                {!search ? (
                  <Button
                    label="Add first product"
                    onPress={() => router.push("/products/new")}
                  />
                ) : null}
              </Card>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${getProductTypeLabel(item.product_type)}, ${item.is_active ? "active" : "inactive"}`}
              onPress={() => router.push(`/products/${item.id}` as Href)}
            >
              <ProductListItem product={item} />
            </Pressable>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

function ProductListItem({ product }: { product: Product }) {
  const { theme } = useTheme();
  const baseUnit = product.product_units.find((unit) => unit.is_base_unit);
  return (
    <Card style={styles.productCard}>
      <View style={styles.productHeader}>
        <View style={styles.productCopy}>
          <AppText weight="semibold">{product.name}</AppText>
          <AppText size="small" tone="secondary" numberOfLines={2}>
            {getProductTypeLabel(product.product_type)}
            {product.description ? ` · ${product.description}` : ""}
          </AppText>
          <AppText size="small" tone="secondary">
            {product.is_sellable ? "Available for sale" : "Not for sale"}
          </AppText>
          <AppText size="small" tone="secondary">
            {baseUnit
              ? `${baseUnit.unit_name} (${baseUnit.unit_abbreviation})${product.product_units.length > 1 ? ` · ${product.product_units.length - 1} conversion${product.product_units.length === 2 ? "" : "s"}` : ""}`
              : "No measurement units"}
          </AppText>
        </View>
        <View
          style={[
            styles.status,
            {
              backgroundColor: product.is_active
                ? `${theme.success}1A`
                : theme.backgroundSelected,
            },
          ]}
        >
          <AppText
            size="small"
            style={{
              color: product.is_active ? theme.success : theme.textSecondary,
            }}
          >
            {product.is_active ? "Active" : "Inactive"}
          </AppText>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={theme.textSecondary}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 20,
    gap: 14,
  },
  toolbar: { alignItems: "flex-end" },
  list: { gap: 10, paddingBottom: 28 },
  state: { gap: 10 },
  productCard: { gap: 12 },
  productHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  productCopy: { flex: 1, gap: 4 },
  status: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 5 },
});
