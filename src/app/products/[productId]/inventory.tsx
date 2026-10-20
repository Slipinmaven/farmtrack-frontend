import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TextField } from "@/components/ui/text-field";
import {
  useProduct,
  useProductInventory,
  useRecordInventoryMovement,
} from "@/features/management/hooks";
import { useChickenSaleOptions } from "@/features/chickens/hooks";
import { useEggCollectionOptions } from "@/features/eggs/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

export default function ProductInventoryRoute() {
  return (
    <SessionGate allowIncompleteSetup>
      <ProductInventoryContent />
    </SessionGate>
  );
}

function ProductInventoryContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const { productId, fromSetup, setupStep } = useLocalSearchParams<{
    productId: string;
    fromSetup?: string;
    setupStep?: string;
  }>();
  const farmId = farm.selectedFarm?.id;
  const productQuery = useProduct(user?.id, farmId, productId);
  const inventoryQuery = useProductInventory(user?.id, farmId, productId);
  const chickenOptions = useChickenSaleOptions(user?.id, farmId);
  const eggOptions = useEggCollectionOptions(user?.id, farmId);
  const recordMovement = useRecordInventoryMovement(
    user?.id ?? "",
    farmId ?? "",
    productId,
  );
  const product = productQuery.data;
  const balance = inventoryQuery.data?.items.find(
    (item) => item.product_id === productId,
  );
  const movements = inventoryQuery.data?.movements ?? [];
  const chickenBlocks = (chickenOptions.data?.blocks ?? []).filter(
    (block) => block.current_chickens > 0,
  );
  const chickenCount = chickenBlocks.reduce(
    (sum, block) => sum + block.current_chickens,
    0,
  );
  const eggProduct = eggOptions.data?.products.find(
    (item) => item.id === productId,
  );
  const isPoultryProduct =
    product?.product_type === "chickens" || product?.product_type === "eggs";
  const currentQuantity = Number(balance?.quantity ?? 0);
  const canSetOpeningStock =
    inventoryQuery.data !== undefined &&
    !inventoryQuery.isError &&
    movements.length === 0;
  const [unitId, setUnitId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [occurredOn, setOccurredOn] = useState(today());
  const [reason, setReason] = useState("");
  const effectiveDirection =
    direction === "out" && currentQuantity > 0 ? "out" : "in";

  async function submit() {
    if (!product || !farmId) return;
    const selectedUnit =
      product.product_units.find((item) => item.unit_id === unitId) ??
      product.product_units.find((item) => item.is_base_unit);
    const parsedQuantity = Number(quantity);
    if (
      !selectedUnit ||
      !Number.isFinite(parsedQuantity) ||
      parsedQuantity <= 0
    ) {
      await dialog.showDialog({
        title: "Check the quantity",
        message: "Choose a unit and enter a quantity greater than zero.",
        tone: "error",
      });
      return;
    }
    if (!canSetOpeningStock && !reason.trim()) {
      await dialog.showDialog({
        title: "Add a reason",
        message: "A short reason is required for stock changes.",
        tone: "error",
      });
      return;
    }
    if (
      !canSetOpeningStock &&
      effectiveDirection === "out" &&
      parsedQuantity * selectedUnit.conversion_factor > currentQuantity
    ) {
      await dialog.showDialog({
        title: "Not enough stock",
        message: "The amount removed cannot exceed the current stock balance.",
        tone: "error",
      });
      return;
    }
    try {
      await recordMovement.mutateAsync({
        kind: canSetOpeningStock ? "opening-balances" : "adjustments",
        payload: {
          product_id: product.id,
          unit_id: selectedUnit.unit_id,
          quantity,
          direction: canSetOpeningStock ? "in" : effectiveDirection,
          occurred_on: occurredOn,
          reason: reason.trim() || "Opening stock count",
        },
      });
      setQuantity("");
      setReason("");
      await dialog.showDialog({
        title: "Stock recorded",
        message: `${quantity} ${selectedUnit.unit_abbreviation} recorded for ${product.name}.`,
        tone: "success",
      });
      if (fromSetup === "true") {
        router.replace({
          pathname: "/farm-setup",
          params: { step: setupStep ?? "5" },
        });
      }
    } catch (error: unknown) {
      await dialog.showDialog({
        title: "Couldn’t record stock",
        message: normalizeApiError(error).message,
        tone: "error",
      });
    }
  }

  if (productQuery.isLoading || inventoryQuery.isLoading) {
    return <LoadingState label="Loading stock" />;
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <FarmPageHeader
          title="Product stock"
          showBack
          fallbackHref={
            fromSetup === "true"
              ? {
                  pathname: "/farm-setup",
                  params: { step: setupStep ?? "5" },
                }
              : (`/products/${productId}` as Href)
          }
        />
        {productQuery.isError || (inventoryQuery.isError && !isPoultryProduct) ? (
          <Card style={styles.section}>
            <AppText weight="semibold">Could not load product stock</AppText>
            <AppText size="small" tone="secondary">
              {normalizeApiError(
                productQuery.error ?? inventoryQuery.error,
              ).message}
            </AppText>
            <Button
              label="Retry"
              variant="secondary"
              onPress={() => {
                void productQuery.refetch();
                void inventoryQuery.refetch();
              }}
            />
          </Card>
        ) : null}
        {product ? (
          <>
            {isPoultryProduct ? (
              <Card
                style={[
                  styles.poultryCard,
                  {
                    borderColor:
                      product.product_type === "chickens"
                        ? "#D69C3C"
                        : "#6F8FC5",
                    backgroundColor:
                      product.product_type === "chickens"
                        ? "#D69C3C12"
                        : "#6F8FC512",
                  },
                ]}
              >
                <View style={styles.poultryHeading}>
                  <View
                    style={[
                      styles.poultryIcon,
                      {
                        backgroundColor:
                          product.product_type === "chickens"
                            ? "#D69C3C24"
                            : "#6F8FC524",
                      },
                    ]}
                  >
                    <Ionicons
                      name={product.product_type === "chickens" ? "home-outline" : "egg-outline"}
                      size={21}
                      color={product.product_type === "chickens" ? "#D69C3C" : "#6F8FC5"}
                    />
                  </View>
                  <View style={styles.poultryCopy}>
                    <AppText size="small" weight="semibold">
                      {product.product_type === "chickens"
                        ? "FLOCK INVENTORY"
                        : "EGG INVENTORY"}
                    </AppText>
                    <AppText size="small" tone="secondary">
                      {product.product_type === "chickens"
                        ? "Bird counts belong to batches and housing blocks."
                        : "Egg stock is recorded by product, block, and collection."}
                    </AppText>
                  </View>
                </View>
                <AppText size="title" weight="semibold">
                  {product.product_type === "chickens"
                    ? `${chickenOptions.isLoading ? "…" : chickenCount.toLocaleString()} birds`
                    : `${eggOptions.isLoading ? "…" : Number(eggProduct?.available_quantity_in_base_unit ?? 0).toLocaleString()} eggs`}
                </AppText>
                {product.product_type === "chickens" ? (
                  chickenBlocks.length ? (
                    chickenBlocks.map((block) => (
                      <View key={block.id} style={styles.poultryBlockRow}>
                        <AppText size="small" weight="semibold">{block.name}</AppText>
                        <AppText size="small" tone="secondary">
                          {block.current_chickens.toLocaleString()} birds
                        </AppText>
                      </View>
                    ))
                  ) : chickenOptions.isError ? (
                    <AppText size="small" style={{ color: theme.danger }}>
                      {normalizeApiError(chickenOptions.error).message}
                    </AppText>
                  ) : (
                    <AppText size="small" tone="secondary">
                      No birds are currently assigned to housing blocks.
                    </AppText>
                  )
                ) : eggOptions.isError ? (
                  <AppText size="small" style={{ color: theme.danger }}>
                    {normalizeApiError(eggOptions.error).message}
                  </AppText>
                ) : (
                  <AppText size="small" tone="secondary">
                    {eggProduct
                      ? `${eggProduct.name} · collected and not yet sold or lost`
                      : "No collected egg stock is available for this product."}
                  </AppText>
                )}
                <View style={styles.poultryActions}>
                  {product.product_type === "chickens" ? (
                    <>
                      <Button
                        label="Manage flock & housing"
                        variant="secondary"
                        onPress={() => router.push("/(tabs)/flock")}
                      />
                      <Button
                        label="Record chicken purchase"
                        onPress={() => router.push("/chicken-purchase")}
                      />
                    </>
                  ) : (
                    <>
                      <Button
                        label="Record egg collection"
                        variant="secondary"
                        onPress={() => router.push("/egg-collection")}
                      />
                      <Button
                        label="View egg sales"
                        onPress={() => router.push("/(tabs)/eggs")}
                      />
                    </>
                  )}
                </View>
              </Card>
            ) : inventoryQuery.isError || !inventoryQuery.data ? (
              <Card style={styles.section}>
                <AppText weight="semibold">Stock balance unavailable</AppText>
                <AppText size="small" tone="secondary">
                  Reload the stock record before making changes. No adjustment
                  controls are available until the current balance is verified.
                </AppText>
                <Button
                  label="Retry stock"
                  variant="secondary"
                  onPress={() => void inventoryQuery.refetch()}
                />
              </Card>
            ) : (
              <>
            <Card style={styles.balanceCard}>
              <AppText size="small" tone="secondary">
                {product.name} · current balance
              </AppText>
              <AppText size="title" weight="semibold">
                {Number(balance?.quantity ?? 0).toLocaleString(undefined, {
                  maximumFractionDigits: 3,
                })}{" "}
                {balance?.unit_abbreviation ??
                  product.product_units.find((unit) => unit.is_base_unit)
                    ?.unit_abbreviation}
              </AppText>
              <AppText size="small" tone="secondary">
                {canSetOpeningStock
                  ? "No stock movements are recorded yet. Enter the amount physically on hand as the opening count below."
                  : "This is the current recorded balance. Supplier purchases are recorded separately so they include payment details."}
              </AppText>
            </Card>
            <Card style={styles.purchaseCard}>
              <View style={styles.purchaseCopy}>
                <AppText weight="semibold">Bought more of this product?</AppText>
                <AppText size="small" tone="secondary">
                  Record the supplier and payment method with the purchase.
                  Stock in/out below is for counts and stock corrections.
                </AppText>
              </View>
              <Button
                label="Record a purchase"
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: "/inventory/purchase",
                    params: { productId },
                  })
                }
              />
            </Card>
            <Card style={styles.section}>
              <AppText size="heading" weight="semibold">
                {canSetOpeningStock ? "Set opening stock" : "Record a stock change"}
              </AppText>
              {canSetOpeningStock ? (
                <AppText size="small" tone="secondary">
                  Enter the amount physically counted right now. This starting
                  count can only be recorded once.
                </AppText>
              ) : (
                <AppText size="small" tone="secondary">
                  Use these controls to correct or record stock changes that
                  are not supplier purchases.
                </AppText>
              )}
              {!canSetOpeningStock && currentQuantity > 0 ? (
                <View style={styles.choiceRow}>
                {(["in", "out"] as const).map((item) => {
                  const selected = item === direction;
                  return (
                    <Pressable
                      key={item}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setDirection(item)}
                      style={[
                        styles.choice,
                        {
                          backgroundColor: selected
                            ? theme.backgroundSelected
                            : theme.backgroundElement,
                          borderColor: selected ? theme.primary : theme.border,
                        },
                      ]}
                    >
                      <AppText size="small" weight="semibold">
                        {item === "in" ? "Add stock" : "Remove stock"}
                      </AppText>
                    </Pressable>
                  );
                })}
                </View>
              ) : null}
              {!canSetOpeningStock && currentQuantity <= 0 ? (
                <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                  Add stock
                </AppText>
              ) : null}
              <View style={styles.unitChoices}>
                {product.product_units.map((unit) => {
                  const selected =
                    unit.unit_id ===
                    (unitId ||
                      product.product_units.find((item) => item.is_base_unit)
                        ?.unit_id);
                  return (
                    <Pressable
                      key={unit.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setUnitId(unit.unit_id)}
                      style={[
                        styles.unitChoice,
                        {
                          borderColor: selected ? theme.primary : theme.border,
                          backgroundColor: selected
                            ? theme.backgroundSelected
                            : theme.backgroundElement,
                        },
                      ]}
                    >
                      <AppText size="small">
                        {unit.unit_name} ({unit.unit_abbreviation})
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              <TextField
                label="Quantity"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                placeholder="0"
              />
              <DatePickerField
                label="Stock date"
                value={occurredOn}
                onChange={setOccurredOn}
              />
              <TextField
                label={
                  canSetOpeningStock
                    ? "Opening count note"
                    : effectiveDirection === "out"
                      ? "Reason for removing stock"
                      : "Reason for adding stock"
                }
                value={reason}
                onChangeText={setReason}
                placeholder={
                  canSetOpeningStock
                    ? "Optional note about this starting count"
                    : effectiveDirection === "out"
                      ? "For example, used, damaged, or missing"
                      : "For example, stock found or correction"
                }
                maxLength={500}
                multiline
              />
              <Button
                label={
                  canSetOpeningStock
                    ? "Save opening count"
                    : effectiveDirection === "out"
                      ? "Record stock removed"
                      : "Record stock added"
                }
                loading={recordMovement.isPending}
                onPress={() => void submit()}
              />
            </Card>
            <Card style={styles.section}>
              <AppText size="heading" weight="semibold">
                Stock history
              </AppText>
              {inventoryQuery.data?.movements.length ? (
                inventoryQuery.data.movements.map((movement) => (
                  <View
                    key={movement.id}
                    style={[
                      styles.historyRow,
                      { borderBottomColor: theme.border },
                    ]}
                  >
                    <View style={styles.historyIcon}>
                      <Ionicons
                        name={
                          Number(movement.quantity_delta) < 0
                            ? "arrow-down-outline"
                            : "arrow-up-outline"
                        }
                        size={18}
                        color={
                          Number(movement.quantity_delta) < 0
                            ? theme.danger
                            : theme.success
                        }
                      />
                    </View>
                    <View style={styles.historyCopy}>
                      <AppText weight="semibold">
                        {movement.movement_type === "opening_balance"
                          ? "Opening count"
                          : Number(movement.quantity_delta) < 0
                            ? "Stock removed"
                            : "Stock added"}
                      </AppText>
                      <AppText size="small" tone="secondary">
                        {movement.occurred_on} · {movement.notes}
                      </AppText>
                    </View>
                    <AppText weight="semibold">
                      {Number(movement.quantity_delta) > 0 ? "+" : ""}
                      {Number(movement.quantity_delta).toLocaleString(
                        undefined,
                        { maximumFractionDigits: 3 },
                      )}{" "}
                      {movement.unit_abbreviation}
                    </AppText>
                  </View>
                ))
              ) : (
                <AppText size="small" tone="secondary">
                  No stock movements have been recorded for this product.
                </AppText>
              )}
            </Card>
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
  section: { gap: 14 },
  balanceCard: { gap: 8 },
  poultryCard: { gap: 12, padding: 14, borderWidth: 1 },
  poultryHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  poultryIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  poultryCopy: { flex: 1, gap: 3 },
  poultryBlockRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#FFFFFF24",
  },
  poultryActions: { gap: 8, marginTop: 2 },
  purchaseCard: { gap: 11, padding: 12 },
  purchaseCopy: { gap: 4 },
  choiceRow: { flexDirection: "row", gap: 8 },
  choice: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  unitChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  unitChoice: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 7,
  },
  historyRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
  },
  historyIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#315F5018",
  },
  historyCopy: { flex: 1, gap: 3 },
});
