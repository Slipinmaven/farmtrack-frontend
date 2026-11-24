import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import {
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
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ProductType } from "@/features/management/api";
import { getProductTypeLabel } from "@/features/management/product-options";
import { useDeleteProduct, useProduct } from "@/features/management/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { formatRelativeDate } from "@/lib/date/format-relative-date";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

export default function ProductDetailsRoute() {
  return (
    <SessionGate>
      <ProductDetailsContent />
    </SessionGate>
  );
}

function ProductDetailsContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const productQuery = useProduct(user?.id, farm.selectedFarm?.id, productId);
  const remove = useDeleteProduct(user?.id ?? "", farm.selectedFarm?.id ?? "");
  const product = productQuery.data;
  const baseUnit = product?.product_units.find((unit) => unit.is_base_unit);

  async function confirmDelete() {
    if (!product) return;
    const confirmed = await dialog.confirmDialog({
      title: "Delete product?",
      message: `“${product.name}” will be permanently removed.`,
      confirmLabel: "Delete product",
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await remove.mutateAsync(product.id);
      await dialog.showDialog({
        title: "Product deleted",
        message: `${product.name} has been removed.`,
        tone: "success",
      });
      router.replace("/products");
    } catch (error: unknown) {
      await dialog.showDialog({
        title: "Couldn’t delete product",
        message: normalizeApiError(error).message,
        tone: "error",
      });
    }
  }

  if (productQuery.isLoading) return <LoadingState label="Loading product" />;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={productQuery.isRefetching}
            onRefresh={() => void productQuery.refetch()}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <FarmPageHeader title="Product details" showBack backHref="/products" />
        {productQuery.isError ? (
          <Card style={styles.state}>
            <AppText weight="semibold">Could not load this product</AppText>
            <AppText size="small" tone="secondary">
              {normalizeApiError(productQuery.error).message}
            </AppText>
            <Button
              label="Retry"
              variant="secondary"
              onPress={() => void productQuery.refetch()}
            />
          </Card>
        ) : null}
        {product ? (
          <>
            <Card style={styles.hero}>
              <View style={styles.heroMain}>
                <View
                  style={[
                    styles.heroIcon,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Ionicons
                    name={productTypeIcon(product.product_type)}
                    size={21}
                    color={theme.primary}
                  />
                </View>
                <View style={styles.heroCopy}>
                  <AppText size="small" tone="secondary" numberOfLines={1}>
                    {farm.selectedFarm?.name ?? "Farm"} · {getProductTypeLabel(product.product_type)}
                  </AppText>
                  <AppText size="heading" weight="semibold" style={styles.productName}>
                    {product.name}
                  </AppText>
                  {product.description ? (
                    <AppText size="small" tone="secondary">
                      {product.description}
                    </AppText>
                  ) : null}
                </View>
              </View>
              <View style={styles.badges}>
                <StatusBadge
                  label={product.is_active ? "Active" : "Inactive"}
                  active={product.is_active}
                  kind="active"
                />
                <StatusBadge
                  label={product.is_sellable ? "For sale" : "Not for sale"}
                  active={product.is_sellable}
                  kind="sale"
                />
              </View>
            </Card>

            <Card style={styles.section}>
              <View style={styles.sectionHeading}>
                <View
                  style={[
                    styles.sectionIcon,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Ionicons name="resize-outline" size={18} color={theme.primary} />
                </View>
                <View style={styles.sectionHeadingCopy}>
                  <AppText size="body" weight="semibold">
                    Stock units
                  </AppText>
                </View>
              </View>
              {product.product_units.map((unit) => (
                <View
                  key={unit.id}
                  style={[
                    styles.measureRow,
                    { borderBottomColor: theme.border },
                    unit.is_base_unit && {
                      backgroundColor: theme.backgroundSelected,
                      borderBottomColor: "transparent",
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.unitAbbreviation,
                      {
                        backgroundColor: unit.is_base_unit
                          ? theme.primary
                          : theme.backgroundElement,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <AppText
                      size="small"
                      weight="semibold"
                      style={{
                        color: unit.is_base_unit ? theme.onPrimary : theme.text,
                      }}
                    >
                      {unit.unit_abbreviation}
                    </AppText>
                  </View>
                  <View style={styles.measureCopy}>
                    <AppText size="small" weight="semibold">
                      {unit.unit_name}
                    </AppText>
                    <AppText size="small" tone="secondary">
                      {unit.is_base_unit
                        ? "Main stock unit"
                        : baseUnit
                          ? `One ${unit.unit_name} contains ${Number(unit.conversion_factor).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${baseUnit.unit_name}`
                          : "Additional measurement"}
                    </AppText>
                  </View>
                  {unit.is_base_unit ? (
                    <View style={[styles.baseBadge, { backgroundColor: theme.primary }]}>
                      <AppText size="small" weight="semibold" style={{ color: theme.onPrimary }}>
                        BASE
                      </AppText>
                    </View>
                  ) : null}
                </View>
              ))}
            </Card>

            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/products/[productId]/inventory",
                  params: { productId: product.id },
                })
              }
              style={({ pressed }) => [
                styles.stockCard,
                {
                  backgroundColor: theme.primary,
                  opacity: pressed ? 0.86 : 1,
                },
              ]}
            >
              <View style={styles.stockIcon}>
                <Ionicons name="layers-outline" size={18} color={theme.onPrimary} />
              </View>
              <View style={styles.stockCopy}>
                <AppText size="small" weight="semibold" style={{ color: theme.onPrimary }}>
                  Stock & movement history
                </AppText>
              </View>
              <Ionicons name="arrow-forward" size={19} color={theme.onPrimary} />
            </Pressable>

            <Card style={styles.section}>
              <View style={styles.sectionHeading}>
                <View
                  style={[
                    styles.sectionIcon,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Ionicons name="information-circle-outline" size={18} color={theme.primary} />
                </View>
                <AppText size="body" weight="semibold">
                  Product information
                </AppText>
              </View>
              <DetailRow
                label="Created"
                value={formatRelativeDate(product.created_at)}
              />
              <DetailRow
                label="Last updated"
                value={formatRelativeDate(product.updated_at)}
              />
            </Card>

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: "/products/[productId]/edit",
                    params: { productId: product.id },
                  })
                }
                style={({ pressed }) => [
                  styles.editAction,
                  {
                    backgroundColor: theme.primary,
                    opacity: pressed ? 0.82 : 1,
                  },
                ]}
              >
                <Ionicons name="create-outline" size={18} color={theme.onPrimary} />
                <AppText weight="semibold" style={{ color: theme.onPrimary }}>
                  Edit product
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: remove.isPending }}
                disabled={remove.isPending}
                onPress={() => void confirmDelete()}
                style={({ pressed }) => [
                  styles.deleteAction,
                  { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                {remove.isPending ? (
                  <AppText size="small" style={{ color: theme.danger }}>
                    Deleting…
                  </AppText>
                ) : (
                  <>
                    <Ionicons
                      name="trash-outline"
                      size={17}
                      color={theme.danger}
                    />
                    <AppText
                      size="small"
                      weight="semibold"
                      style={{ color: theme.danger }}
                    >
                      Delete product
                    </AppText>
                  </>
                )}
              </Pressable>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.detailRow, { borderBottomColor: theme.border }]}>
      <AppText size="small" tone="secondary">
        {label}
      </AppText>
      <AppText size="small">{value}</AppText>
    </View>
  );
}

function StatusBadge({
  label,
  active,
  kind,
}: {
  label: string;
  active: boolean;
  kind: "active" | "sale";
}) {
  const { theme } = useTheme();
  const color = active
    ? kind === "active"
      ? theme.success
      : theme.primary
    : theme.textSecondary;
  const icon = kind === "active"
    ? active ? "checkmark-circle" : "pause-circle-outline"
    : active ? "pricetag" : "pricetag-outline";
  return (
    <View
      style={[
        styles.status,
        {
          backgroundColor: active
            ? kind === "active"
              ? `${theme.success}18`
              : theme.backgroundSelected
            : theme.backgroundSelected,
        },
      ]}
    >
      <Ionicons name={icon} size={13} color={color} />
      <AppText size="small" weight="semibold" style={{ color }}>
        {label}
      </AppText>
    </View>
  );
}

function productTypeIcon(
  type: ProductType,
): keyof typeof Ionicons.glyphMap {
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
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 10,
  },
  state: { gap: 8, borderRadius: 10 },
  hero: {
    gap: 8,
    borderRadius: 11,
    padding: 12,
  },
  heroMain: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  heroIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  heroCopy: { flex: 1, minWidth: 0, gap: 1 },
  productName: { fontSize: 21, lineHeight: 27 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginLeft: 47 },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  section: { gap: 7, borderRadius: 11, padding: 12 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 1 },
  sectionIcon: {
    width: 29,
    height: 29,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  sectionHeadingCopy: { flex: 1, gap: 0 },
  stockCard: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  stockIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  stockCopy: { flex: 1, gap: 1 },
  measureRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  measureCopy: { flex: 1, gap: 1 },
  unitAbbreviation: {
    minWidth: 34,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 6,
  },
  baseBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  detailRow: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actions: { gap: 7 },
  editAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 8,
  },
  deleteAction: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
  },
});
