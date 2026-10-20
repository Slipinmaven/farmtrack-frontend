import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
      <ScrollView contentContainerStyle={styles.content}>
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
            <View style={styles.titleRow}>
              <View style={styles.titleCopy}>
                <AppText size="small" tone="secondary">
                  {farm.selectedFarm?.name ?? "Farm"}
                </AppText>
                <AppText size="title" weight="semibold">
                  {product.name}
                </AppText>
                <AppText tone="secondary">
                  {getProductTypeLabel(product.product_type)}
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
                    color: product.is_active
                      ? theme.success
                      : theme.textSecondary,
                  }}
                >
                  {product.is_active ? "Active" : "Inactive"}
                </AppText>
              </View>
            </View>
            {product.description ? (
              <AppText tone="secondary">{product.description}</AppText>
            ) : null}

            <Card style={styles.section}>
              <AppText size="heading" weight="semibold">
                Measurements
              </AppText>
              {product.product_units.map((unit) => (
                <View
                  key={unit.id}
                  style={[
                    styles.measureRow,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <View style={styles.measureCopy}>
                    <AppText weight="semibold">
                      {unit.unit_name} ({unit.unit_abbreviation})
                    </AppText>
                    <AppText size="small" tone="secondary">
                      {unit.is_base_unit
                        ? "Main counting unit"
                        : baseUnit
                          ? `One ${unit.unit_name} contains ${Number(unit.conversion_factor).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${baseUnit.unit_name}`
                          : "Additional measurement"}
                    </AppText>
                  </View>
                  {unit.is_base_unit ? (
                    <Ionicons
                      name="radio-button-on"
                      size={19}
                      color={theme.primary}
                    />
                  ) : null}
                </View>
              ))}
            </Card>

            <Card style={styles.stockCard}>
              <View style={styles.stockCopy}>
                <AppText size="heading" weight="semibold">
                  Stock ledger
                </AppText>
                <AppText size="small" tone="secondary">
                  Record opening stock and track later stock corrections.
                </AppText>
              </View>
              <Button
                label="View stock and history"
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: "/products/[productId]/inventory",
                    params: { productId: product.id },
                  })
                }
              />
            </Card>

            <Card style={styles.section}>
              <AppText size="heading" weight="semibold">
                Product details
              </AppText>
              <DetailRow
                label="Type"
                value={getProductTypeLabel(product.product_type)}
              />
              <DetailRow
                label="Sales status"
                value={
                  product.is_sellable
                    ? "Available for sale"
                    : "Not for sale"
                }
              />
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
              <Button
                label="Edit product"
                onPress={() =>
                  router.push({
                    pathname: "/products/[productId]/edit",
                    params: { productId: product.id },
                  })
                }
              />
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 36,
    gap: 16,
  },
  state: { gap: 10 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  titleCopy: { flex: 1, gap: 2 },
  status: {
    minWidth: 68,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 5,
    alignItems: "center",
  },
  section: { gap: 12 },
  stockCard: { gap: 12 },
  stockCopy: { gap: 4 },
  measureRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  measureCopy: { flex: 1, gap: 2 },
  detailRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actions: { gap: 10 },
  deleteAction: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 6,
  },
});
