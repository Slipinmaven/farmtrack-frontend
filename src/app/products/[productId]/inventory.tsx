import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
  const {
    productId,
    fromSetup,
    setupStep,
    reportSupportedQuantity,
    reportLedgerQuantity,
    reportAsOf,
    reportFromDate,
  } = useLocalSearchParams<{
    productId: string;
    fromSetup?: string;
    setupStep?: string;
    reportSupportedQuantity?: string;
    reportLedgerQuantity?: string;
    reportAsOf?: string;
    reportFromDate?: string;
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
  const eggUnit =
    eggProduct?.units.find((unit) => unit.is_base_unit)?.abbreviation ?? "eggs";
  const isPoultryProduct =
    product?.product_type === "chickens" || product?.product_type === "eggs";
  const currentQuantity = Number(balance?.quantity ?? 0);
  const hasEggReportReconciliation =
    product?.product_type === "eggs" &&
    reportSupportedQuantity !== undefined &&
    reportLedgerQuantity !== undefined &&
    reportAsOf !== undefined;
  const canSetOpeningStock =
    inventoryQuery.data !== undefined &&
    !inventoryQuery.isError &&
    movements.length === 0;
  const [unitId, setUnitId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [occurredOn, setOccurredOn] = useState(today());
  const [reason, setReason] = useState("");
  const [correctionOpen, setCorrectionOpen] = useState(fromSetup === "true");
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
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets
      >
        <FarmPageHeader
          title="Product stock"
          compact
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
                    borderColor: theme.border,
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
              >
                <View style={styles.poultryHeading}>
                  <View
                    style={[
                      styles.poultryIcon,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <Ionicons
                      name={product.product_type === "chickens" ? "home-outline" : "egg-outline"}
                      size={21}
                      color={theme.primary}
                    />
                  </View>
                  <View style={styles.poultryCopy}>
                    {product.product_type === "chickens" ? (
                      <>
                        <AppText size="small" weight="semibold">
                          FLOCK INVENTORY
                        </AppText>
                        <AppText size="small" tone="secondary">
                          Bird counts belong to batches and housing blocks.
                        </AppText>
                      </>
                    ) : (
                      <>
                        <AppText size="heading" weight="semibold">
                          {product.name}
                        </AppText>
                        <AppText size="small" tone="secondary">
                          Egg product · {product.is_sellable ? "For sale" : "Not for sale"}
                        </AppText>
                      </>
                    )}
                  </View>
                </View>
                <View
                  style={[
                    styles.poultryBalance,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <AppText size="small" weight="semibold" tone="secondary">
                    {product.product_type === "chickens"
                      ? "BIRDS ON HAND"
                      : product.is_sellable
                        ? "AVAILABLE TO SELL"
                        : "EGGS ON HAND"}
                  </AppText>
                  <AppText size="title" weight="semibold" style={{ color: theme.text }}>
                    {product.product_type === "chickens"
                      ? `${chickenOptions.isLoading ? "…" : chickenCount.toLocaleString()} birds`
                      : eggOptions.isLoading
                        ? "…"
                        : eggProduct
                          ? `${formatStockQuantity(
                              product.is_sellable
                                ? eggProduct.available_quantity_in_base_unit
                                : eggProduct.on_hand_quantity_in_base_unit,
                            )} ${eggProduct.units.find((unit) => unit.is_base_unit)?.abbreviation ?? "eggs"}`
                          : "—"}
                  </AppText>
                  {product.product_type === "eggs" && eggProduct ? (
                    <AppText size="small" tone="secondary">
                      {product.is_sellable
                        ? "After recorded sales, losses, and stock adjustments."
                        : "Recorded opening stock and collections, less sales, losses, and adjustments."}
                    </AppText>
                  ) : null}
                </View>
                {product.product_type === "chickens" ? (
                  chickenBlocks.length ? (
                    chickenBlocks.map((block) => (
                      <View
                        key={block.id}
                        style={[
                          styles.poultryBlockRow,
                          { borderTopColor: theme.border },
                        ]}
                      >
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
                ) : eggProduct ? (
                  <>
                    <View style={[styles.eggBreakdown, { borderTopColor: theme.border }]}>
                      <View style={styles.eggBreakdownHeading}>
                        <AppText weight="semibold">How this stock adds up</AppText>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Review ${product.name} production records`}
                          onPress={() =>
                            router.push({
                              pathname: "/reports/[report]",
                              params: {
                                report: "production",
                                product_id: product.id,
                              },
                            } as Href)
                          }
                          hitSlop={8}
                        >
                          <AppText
                            size="small"
                            weight="semibold"
                            style={{ color: theme.primary }}
                          >
                            Production records
                          </AppText>
                        </Pressable>
                      </View>
                      <EggStockBreakdownRow
                        label="Opening stock"
                        value={eggProduct.opening_stock_quantity_in_base_unit}
                        unit={eggUnit}
                        color={theme.success}
                        prefix="+"
                      />
                      <EggStockBreakdownRow
                        label="Eggs collected"
                        value={eggProduct.collected_quantity_in_base_unit}
                        unit={eggUnit}
                        color={theme.success}
                        prefix="+"
                      />
                      <EggStockBreakdownRow
                        label="Sales and orders"
                        value={eggProduct.sold_quantity_in_base_unit}
                        unit={eggUnit}
                        color={theme.danger}
                        prefix="−"
                      />
                      <EggStockBreakdownRow
                        label="Egg losses"
                        value={eggProduct.lost_quantity_in_base_unit}
                        unit={eggUnit}
                        color={theme.danger}
                        prefix="−"
                      />
                      {Number(eggProduct.stock_adjustment_quantity_in_base_unit) !== 0 ? (
                        <EggStockBreakdownRow
                          label="Stock adjustments"
                          value={eggProduct.stock_adjustment_quantity_in_base_unit}
                          unit={eggUnit}
                          color={theme.text}
                          signed
                        />
                      ) : null}
                      {Number(eggProduct.reserved_quantity_in_base_unit) > 0 ? (
                        <View
                          style={[
                            styles.eggReserved,
                            {
                              backgroundColor: theme.background,
                              borderColor: theme.border,
                            },
                          ]}
                        >
                          <View style={styles.eggReservedCopy}>
                            <AppText size="small" weight="semibold">
                              Reserved for orders
                            </AppText>
                            <AppText size="small" tone="secondary">
                              Not yet delivered
                            </AppText>
                          </View>
                          <AppText size="small" weight="semibold">
                            {formatStockQuantity(eggProduct.reserved_quantity_in_base_unit)}{" "}
                            {eggUnit}
                          </AppText>
                        </View>
                      ) : null}
                      <AppText size="small" tone="secondary">
                        Sales and orders include quantities reserved for delivery.
                      </AppText>
                    </View>
                  </>
                ) : (
                  <AppText size="small" tone="secondary">
                    No egg stock records are available for this product.
                  </AppText>
                )}
                {hasEggReportReconciliation ? (
                  <View
                      style={[
                        styles.reportReconciliation,
                        {
                          backgroundColor: theme.background,
                          borderColor: theme.border,
                        },
                      ]}
                  >
                      <AppText size="small" weight="semibold">
                        Profitability check · {reportAsOf}
                      </AppText>
                      <AppText size="small" tone="secondary">
                        Egg stock records support {Number(reportSupportedQuantity).toLocaleString()} eggs; the inventory ledger recorded {Number(reportLedgerQuantity).toLocaleString()} eggs on that date.
                        {" "}Review the dated records before changing current stock.
                      </AppText>
                      <Button
                        label="Review egg collection records"
                        variant="secondary"
                        onPress={() =>
                          router.push({
                            pathname: "/reports/[report]",
                            params: {
                              report: "production",
                              product_id: product.id,
                              from_date: reportFromDate ?? reportAsOf,
                              to_date: reportAsOf,
                            },
                          } as Href)
                        }
                      />
                  </View>
                ) : null}
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
                        onPress={() => router.push("/egg-collection")}
                      />
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => router.push("/(tabs)/eggs")}
                        style={({ pressed }) => [
                          styles.eggSalesAction,
                          {
                            borderColor: theme.border,
                            backgroundColor: pressed
                              ? theme.backgroundSelected
                              : "transparent",
                          },
                        ]}
                      >
                        <Ionicons
                          name="cart-outline"
                          size={18}
                          color={theme.textSecondary}
                        />
                        <AppText size="small" weight="semibold">
                          View egg sales
                        </AppText>
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color={theme.textSecondary}
                        />
                      </Pressable>
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
            <Card
              style={[
                styles.balanceCard,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}
            >
              <View style={styles.balanceHeading}>
                <View style={styles.balanceLabel}>
                  <View
                    style={[
                      styles.balanceIcon,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <Ionicons name="cube-outline" size={18} color={theme.primary} />
                  </View>
                  <View style={styles.balanceCopy}>
                    <AppText size="small" weight="semibold" tone="secondary">
                      CURRENT BALANCE
                    </AppText>
                    <AppText size="body" weight="semibold" numberOfLines={1}>
                      {product.name}
                    </AppText>
                  </View>
                </View>
                <View
                  style={[
                    styles.balanceStatus,
                    {
                      backgroundColor: withOpacity(
                        currentQuantity > 0 ? theme.success : theme.danger,
                        0.1,
                      ),
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.balanceStatusDot,
                      {
                        backgroundColor:
                          currentQuantity > 0 ? theme.success : theme.danger,
                      },
                    ]}
                  />
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{
                      color: currentQuantity > 0 ? theme.success : theme.danger,
                    }}
                  >
                    {currentQuantity > 0 ? "In stock" : "No stock"}
                  </AppText>
                </View>
              </View>
              <View style={styles.balanceValueRow}>
                <AppText size="title" weight="semibold" style={{ color: theme.primary }}>
                  {currentQuantity.toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}
                </AppText>
                <AppText
                  size="heading"
                  weight="semibold"
                  style={{ color: theme.textSecondary }}
                >
                  {balance?.unit_abbreviation ??
                    product.product_units.find((unit) => unit.is_base_unit)
                      ?.unit_abbreviation}
                </AppText>
              </View>
              <View style={[styles.purchaseAction, { borderTopColor: theme.border }]}>
                <AppText size="small" tone="secondary">
                  Add stock from a supplier purchase
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: "/inventory/purchase",
                      params: { productId },
                    })
                  }
                  style={({ pressed }) => [
                    styles.purchaseButton,
                    {
                      backgroundColor: theme.primary,
                      opacity: pressed ? 0.78 : 1,
                    },
                  ]}
                >
                  <Ionicons name="add" size={17} color={theme.onPrimary} />
                  <AppText
                    size="body"
                    weight="semibold"
                    style={{ color: theme.onPrimary }}
                  >
                    Record purchase
                  </AppText>
                </Pressable>
              </View>
            </Card>
            <Card
              style={[
                styles.section,
                styles.correctionSection,
                correctionOpen && styles.correctionSectionOpen,
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: correctionOpen }}
                onPress={() => setCorrectionOpen((open) => !open)}
                style={styles.correctionTrigger}
              >
                <View
                  style={[
                    styles.correctionIcon,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Ionicons name="options-outline" size={18} color={theme.textSecondary} />
                </View>
                <View style={styles.correctionTriggerCopy}>
                  <AppText size="body" weight="semibold">
                    {canSetOpeningStock ? "Set starting stock" : "Correct inventory count"}
                  </AppText>
                  <AppText size="small" tone="secondary">
                    {canSetOpeningStock
                      ? "Enter the amount currently on hand."
                      : "For damaged, missing, or found stock."}
                  </AppText>
                </View>
                <Ionicons
                  name={correctionOpen ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={theme.textSecondary}
                />
              </Pressable>
              {correctionOpen ? (
                <View
                  style={[
                    styles.correctionForm,
                    { borderTopColor: theme.border },
                  ]}
                >
                  {canSetOpeningStock ? (
                    <AppText size="small" tone="secondary">
                      Set the actual quantity on hand. This starting count can
                      only be recorded once.
                    </AppText>
                  ) : (
                    <View style={styles.correctionHint}>
                      <Ionicons
                        name="information-circle-outline"
                        size={16}
                        color={theme.textSecondary}
                      />
                      <AppText
                        size="small"
                        tone="secondary"
                        style={styles.correctionHintText}
                      >
                        Supplier purchases belong in Record purchase above.
                      </AppText>
                    </View>
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
                                borderColor: selected
                                  ? theme.primary
                                  : theme.border,
                              },
                            ]}
                          >
                            <AppText size="small" weight="semibold">
                              {item === "in"
                                ? "Increase recorded count"
                                : "Decrease recorded count"}
                            </AppText>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                  {!canSetOpeningStock && currentQuantity <= 0 ? (
                    <AppText
                      size="small"
                      weight="semibold"
                      style={{ color: theme.primary }}
                    >
                      Increase recorded count
                    </AppText>
                  ) : null}
                  <View style={styles.unitChoices}>
                    {product.product_units.map((unit) => {
                      const selected =
                        unit.unit_id ===
                        (unitId ||
                          product.product_units.find(
                            (item) => item.is_base_unit,
                          )?.unit_id);
                      return (
                        <Pressable
                          key={unit.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => setUnitId(unit.unit_id)}
                          style={[
                            styles.unitChoice,
                            {
                              borderColor: selected
                                ? theme.primary
                                : theme.border,
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
                    returnKeyType="done"
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
                        : "Reason for correction"
                    }
                    value={reason}
                    onChangeText={setReason}
                    placeholder={
                      canSetOpeningStock
                        ? "Optional note about this starting count"
                        : "For example, damaged, missing, or stock found"
                    }
                    maxLength={500}
                    multiline
                    returnKeyType="done"
                    blurOnSubmit
                  />
                  <Button
                    label={
                      canSetOpeningStock
                        ? "Save starting count"
                        : "Save inventory correction"
                    }
                    loading={recordMovement.isPending}
                    onPress={() => void submit()}
                  />
                </View>
              ) : null}
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
                    <View
                      style={[
                        styles.historyIcon,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatStockQuantity(value: number | string): string {
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 3,
  });
}

function EggStockBreakdownRow({
  label,
  value,
  unit,
  color,
  prefix,
  signed = false,
}: {
  label: string;
  value: number | string;
  unit: string;
  color: string;
  prefix?: string;
  signed?: boolean;
}) {
  const quantity = Number(value);
  const displayValue = signed && quantity > 0
    ? `+${formatStockQuantity(quantity)}`
    : signed && quantity < 0
      ? `−${formatStockQuantity(Math.abs(quantity))}`
      : `${prefix ?? ""}${formatStockQuantity(quantity)}`;

  return (
    <View style={styles.eggBreakdownRow}>
      <AppText size="small" tone="secondary" style={styles.eggBreakdownLabel}>
        {label}
      </AppText>
      <AppText size="small" weight="semibold" style={{ color }}>
        {displayValue} {unit}
      </AppText>
    </View>
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  keyboardContainer: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 48,
    gap: 12,
  },
  section: { gap: 12, borderRadius: 15, padding: 14 },
  correctionSection: { gap: 0, paddingVertical: 8, paddingHorizontal: 13 },
  correctionSectionOpen: { gap: 0 },
  correctionTrigger: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  correctionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  correctionTriggerCopy: { flex: 1, gap: 3 },
  correctionForm: {
    gap: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
    paddingBottom: 5,
  },
  correctionHint: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  correctionHintText: { flex: 1 },
  balanceCard: {
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  balanceHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  balanceLabel: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  balanceIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  balanceCopy: { flex: 1, gap: 2, minWidth: 0 },
  balanceStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  balanceStatusDot: { width: 6, height: 6, borderRadius: 3 },
  balanceValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    minHeight: 48,
  },
  purchaseAction: {
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  purchaseButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  poultryCard: { gap: 14, padding: 16, borderWidth: 1, borderRadius: 16 },
  poultryHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  poultryIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  poultryCopy: { flex: 1, gap: 3 },
  poultryBalance: { gap: 4, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 },
  poultryBlockRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  poultryActions: { gap: 8, marginTop: 2 },
  eggBreakdown: {
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 13,
  },
  eggBreakdownHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 1,
  },
  eggBreakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 24,
  },
  eggBreakdownLabel: { flex: 1 },
  eggReserved: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  eggReservedCopy: { flex: 1, gap: 2 },
  eggSalesAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  reportReconciliation: {
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
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
  },
  historyCopy: { flex: 1, gap: 3 },
});
