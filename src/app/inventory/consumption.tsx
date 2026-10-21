import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  Platform,
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
import { useChickenSaleOptions } from "@/features/chickens/hooks";
import type { Product } from "@/features/management/api";
import type { ChickenSaleBatch } from "@/features/chickens/api";
import {
  useCreateProductConsumption,
  useInventory,
  useProductConsumptions,
  useProducts,
} from "@/features/management/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type ConsumptionAllocation = {
  id: string;
  blockId: string;
  batchId: string;
  quantity: string;
};

type LocationPickerTarget = {
  allocationId: string;
  kind: "block" | "batch";
};

export default function ProductConsumptionRoute() {
  return (
    <SessionGate>
      <ProductConsumptionContent />
    </SessionGate>
  );
}

function ProductConsumptionContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const farmId = farm.selectedFarm?.id;
  const productsQuery = useProducts(user?.id, farmId);
  const inventoryQuery = useInventory(user?.id, farmId);
  const consumptionsQuery = useProductConsumptions(user?.id, farmId);
  const chickenOptionsQuery = useChickenSaleOptions(user?.id, farmId);
  const createConsumption = useCreateProductConsumption(
    user?.id ?? "",
    farmId ?? "",
  );
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [locationPicker, setLocationPicker] = useState<LocationPickerTarget | null>(null);
  const [locationSearch, setLocationSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [allocations, setAllocations] = useState<ConsumptionAllocation[]>([
    newAllocation(),
  ]);
  const [consumptionDate, setConsumptionDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const balances = useMemo(
    () => new Map((inventoryQuery.data?.items ?? []).map((item) => [item.product_id, item])),
    [inventoryQuery.data?.items],
  );
  const products = useMemo(
    () =>
      (productsQuery.data ?? []).filter(
        (product) =>
          product.is_active &&
          product.product_type !== "chickens" &&
          product.product_type !== "eggs" &&
          product.product_units.length > 0 &&
          Number(balances.get(product.id)?.quantity ?? 0) > 0,
      ),
    [productsQuery.data, balances],
  );
  const selectedProduct = products.find((product) => product.id === productId);
  const selectedUnit = selectedProduct?.product_units.find(
    (unit) => unit.unit_id === unitId,
  );
  const baseUnit = selectedProduct?.product_units.find(
    (unit) => unit.is_base_unit,
  );
  const currentBalance = Number(balances.get(productId)?.quantity ?? 0);
  const conversionFactor = Number(selectedUnit?.conversion_factor ?? 1);
  const availableInSelectedUnit =
    conversionFactor > 0 ? currentBalance / conversionFactor : 0;
  const totalQuantity = allocations.reduce((sum, allocation) => {
    const amount = Number(allocation.quantity);
    return Number.isFinite(amount) && amount > 0 ? sum + amount : sum;
  }, 0);
  const totalBaseQuantity = totalQuantity * conversionFactor;
  const chickenOptions = chickenOptionsQuery.data;
  const availableBlocks = chickenOptions?.blocks ?? [];
  const matchingProducts = products.filter((product) =>
    product.name.toLocaleLowerCase().includes(productSearch.trim().toLocaleLowerCase()),
  );
  const latestConsumptions = (consumptionsQuery.data ?? []).slice(0, 5);
  const isLoading = productsQuery.isLoading || inventoryQuery.isLoading;
  const locationOptions = locationPicker?.kind === "block"
    ? availableBlocks
        .filter((block) =>
          block.name.toLocaleLowerCase().includes(locationSearch.trim().toLocaleLowerCase()),
        )
        .map((block) => ({ id: block.id, name: block.name, detail: "Housing block" }))
    : locationPicker
      ? getAvailableBatches(
          chickenOptions?.batches ?? [],
          allocations.find((item) => item.id === locationPicker.allocationId),
        )
          .filter((batch) =>
            batch.name.toLocaleLowerCase().includes(locationSearch.trim().toLocaleLowerCase()),
          )
          .map((batch) => ({
            id: batch.id,
            name: batch.name,
            detail: `${batch.chicken_type} · ${formatQuantity(
              batch.stocks.reduce((sum, stock) => sum + stock.quantity, 0),
            )} birds`,
          }))
      : [];

  function selectProduct(product: Product) {
    const unit =
      product.product_units.find((item) => item.is_base_unit) ??
      product.product_units[0];
    setProductId(product.id);
    setUnitId(unit?.unit_id ?? "");
    setAllocations([newAllocation()]);
    setProductPickerOpen(false);
    setError("");
  }

  function updateAllocation(
    allocationId: string,
    update: Partial<ConsumptionAllocation>,
  ) {
    setAllocations((current) =>
      current.map((allocation) =>
        allocation.id === allocationId ? { ...allocation, ...update } : allocation,
      ),
    );
    setError("");
  }

  function selectAllocationBlock(allocation: ConsumptionAllocation, nextBlockId: string) {
    const batch = chickenOptions?.batches.find((item) => item.id === allocation.batchId);
    const batchHasBlock = batch?.stocks.some(
      (stock) => stock.block_id === nextBlockId && stock.quantity > 0,
    );
    updateAllocation(allocation.id, {
      blockId: nextBlockId,
      ...(nextBlockId && allocation.batchId && !batchHasBlock ? { batchId: "" } : {}),
    });
  }

  function openLocationPicker(allocationId: string, kind: LocationPickerTarget["kind"]) {
    setLocationSearch("");
    setLocationPicker({ allocationId, kind });
  }

  function selectLocation(locationId: string) {
    if (!locationPicker) return;
    const allocation = allocations.find((item) => item.id === locationPicker.allocationId);
    if (!allocation) return;
    if (locationPicker.kind === "block") {
      selectAllocationBlock(allocation, locationId);
    } else {
      const batch = chickenOptions?.batches.find((item) => item.id === locationId);
      const batchMatchesBlock =
        !allocation.blockId ||
        batch?.stocks.some((stock) => stock.block_id === allocation.blockId);
      updateAllocation(allocation.id, {
        batchId: locationId,
        ...(!batchMatchesBlock ? { blockId: "" } : {}),
      });
    }
    setLocationPicker(null);
  }

  async function submit() {
    if (!farmId || !selectedProduct || !selectedUnit || !baseUnit) {
      setError("Choose a product that has stock available.");
      return;
    }
    if (
      allocations.some(
        (allocation) =>
          !Number.isFinite(Number(allocation.quantity)) ||
          Number(allocation.quantity) <= 0,
      )
    ) {
      setError("Enter a quantity greater than zero for each allocation.");
      return;
    }
    if (allocations.some(
      (allocation) => (allocation.quantity.trim().split(".")[1]?.length ?? 0) > 3,
    )) {
      setError("Enter no more than three decimal places.");
      return;
    }
    if (totalBaseQuantity - currentBalance > 1e-9) {
      setError(
        `Only ${formatQuantity(availableInSelectedUnit)} ${selectedUnit.unit_abbreviation} is available across all allocations.`,
      );
      return;
    }
    if (!Number.isFinite(totalBaseQuantity) || totalBaseQuantity <= 0) {
      setError("The entered quantity is too small for this product’s base unit.");
      return;
    }

    setError("");
    try {
      await createConsumption.mutateAsync({
        product_id: selectedProduct.id,
        unit_id: selectedUnit.unit_id,
        allocations: allocations.map((allocation) => ({
          quantity: allocation.quantity,
          ...(allocation.blockId ? { block_id: allocation.blockId } : {}),
          ...(allocation.batchId ? { batch_id: allocation.batchId } : {}),
        })),
        consumption_date: consumptionDate,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      setAllocations([newAllocation()]);
      setNotes("");
      await dialog.showDialog({
        title: "Consumption recorded",
        message: `${formatQuantity(totalQuantity)} ${selectedUnit.unit_abbreviation} of ${selectedProduct.name} used across ${allocations.length} allocation${allocations.length === 1 ? "" : "s"}. Inventory has been updated.`,
        tone: "success",
      });
    } catch (submitError: unknown) {
      const message = normalizeApiError(submitError).message;
      setError(message);
      await dialog.showDialog({
        title: "Couldn’t record consumption",
        message,
        tone: "error",
      });
    }
  }

  if (isLoading) return <LoadingState label="Loading inventory" />;

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
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <FarmPageHeader
          title="Product consumption"
          showBack
          fallbackHref={"/inventory" as Href}
        />

        {(productsQuery.isError || inventoryQuery.isError) ? (
          <Card style={styles.section}>
            <View style={styles.errorHeading}>
              <Ionicons name="alert-circle-outline" size={20} color={theme.danger} />
              <AppText weight="semibold">Couldn’t load inventory</AppText>
            </View>
            <AppText size="small" tone="secondary">
              {normalizeApiError(productsQuery.error ?? inventoryQuery.error).message}
            </AppText>
            <Button
              label="Retry"
              variant="secondary"
              onPress={() => {
                void productsQuery.refetch();
                void inventoryQuery.refetch();
              }}
            />
          </Card>
        ) : null}

        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <View
              style={[
                styles.sectionIcon,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <Ionicons name="nutrition-outline" size={20} color={theme.primary} />
            </View>
            <View style={styles.grow}>
              <AppText size="heading" weight="semibold">Record product use</AppText>
              <AppText size="small" tone="secondary">
                Stock is deducted when this record is saved.
              </AppText>
            </View>
          </View>

          {products.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="file-tray-outline" size={27} color={theme.textSecondary} />
              <AppText weight="semibold">No supply stock available</AppText>
              <AppText size="small" tone="secondary" style={styles.centerText}>
                Purchase or set the stock count for feed, medication, or other supplies before recording use.
              </AppText>
              <Button
                label="Go to inventory"
                variant="secondary"
                onPress={() => router.push("/inventory" as Href)}
              />
            </View>
          ) : (
            <>
              <AppText size="small" weight="semibold">Product</AppText>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setProductSearch("");
                  setProductPickerOpen(true);
                }}
                style={[
                  styles.selector,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
              >
                <View style={styles.grow}>
                  <AppText size="small" weight="semibold">
                    {selectedProduct?.name ?? "Choose a product"}
                  </AppText>
                  <AppText size="small" tone="secondary">
                    {selectedProduct
                      ? "Tap to change product"
                      : "Only products with stock are shown"}
                  </AppText>
                </View>
                <Ionicons name="search-outline" size={19} color={theme.primary} />
              </Pressable>

              {selectedProduct ? (
                <>
                  <View
                    style={[
                      styles.stockSummary,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <View
                      style={[
                        styles.stockSummaryIcon,
                        { backgroundColor: theme.backgroundElement },
                      ]}
                    >
                      <Ionicons name="layers-outline" size={18} color={theme.primary} />
                    </View>
                    <View style={styles.grow}>
                      <AppText size="small" tone="secondary">CURRENT STOCK</AppText>
                      <AppText weight="semibold">
                        {formatQuantity(currentBalance)} {baseUnit?.unit_abbreviation}
                      </AppText>
                    </View>
                    {selectedUnit && baseUnit && conversionFactor !== 1 ? (
                      <AppText size="small" tone="secondary" style={styles.conversion}>
                        1 {selectedUnit.unit_abbreviation} ={" "}
                        {formatQuantity(conversionFactor)} {baseUnit.unit_abbreviation}
                      </AppText>
                    ) : null}
                  </View>

                  <AppText size="small" weight="semibold">Use measured in</AppText>
                  <View style={styles.choiceWrap}>
                    {selectedProduct.product_units.map((unit) => (
                      <Choice
                        key={unit.id}
                        label={`${unit.unit_name} (${unit.unit_abbreviation})`}
                        selected={unitId === unit.unit_id}
                        onPress={() => {
                          setUnitId(unit.unit_id);
                          setError("");
                        }}
                      />
                    ))}
                  </View>
                  <View style={styles.allocationHeading}>
                    <View style={styles.grow}>
                      <AppText size="small" weight="semibold">Usage allocations</AppText>
                      <AppText size="small" tone="secondary">
                        Split the quantity by block and flock, or leave either unassigned.
                      </AppText>
                    </View>
                    <AppText size="small" weight="semibold">
                      Total {formatQuantity(totalQuantity)} {selectedUnit?.unit_abbreviation}
                    </AppText>
                  </View>
                  {allocations.map((allocation, index) => {
                    const blockName = availableBlocks.find(
                      (block) => block.id === allocation.blockId,
                    )?.name;
                    const batchName = chickenOptions?.batches.find(
                      (batch) => batch.id === allocation.batchId,
                    )?.name;
                    return (
                      <View
                        key={allocation.id}
                        style={[
                          styles.allocationCard,
                          { borderColor: theme.border, backgroundColor: theme.backgroundElement },
                        ]}
                      >
                        <View style={styles.allocationHeader}>
                          <AppText size="small" weight="semibold">
                            Allocation {index + 1}
                          </AppText>
                          {allocations.length > 1 ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Remove allocation ${index + 1}`}
                              onPress={() =>
                                setAllocations((current) =>
                                  current.filter((item) => item.id !== allocation.id),
                                )
                              }
                              hitSlop={8}
                            >
                              <Ionicons name="trash-outline" size={18} color={theme.danger} />
                            </Pressable>
                          ) : null}
                        </View>
                        <TextField
                          label={`Quantity used (${selectedUnit?.unit_abbreviation ?? ""})`}
                          value={allocation.quantity}
                          onChangeText={(value) =>
                            updateAllocation(allocation.id, { quantity: value })
                          }
                          keyboardType="decimal-pad"
                          placeholder="0"
                        />
                        <View style={styles.locationField}>
                          <AppText size="small" weight="semibold">Block</AppText>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() =>
                              openLocationPicker(allocation.id, "block")
                            }
                            style={[
                              styles.selector,
                              {
                                borderColor: theme.border,
                                backgroundColor: theme.background,
                              },
                            ]}
                          >
                            <View style={styles.grow}>
                              <AppText size="small" weight="semibold">
                                {blockName ?? "No block"}
                              </AppText>
                              <AppText size="small" tone="secondary">
                                Optional · choose a housing block
                              </AppText>
                            </View>
                            <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
                          </Pressable>
                        </View>
                        <View style={styles.locationField}>
                          <AppText size="small" weight="semibold">Flock / batch</AppText>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() =>
                              openLocationPicker(allocation.id, "batch")
                            }
                            style={[
                              styles.selector,
                              {
                                borderColor: theme.border,
                                backgroundColor: theme.background,
                              },
                            ]}
                          >
                            <View style={styles.grow}>
                              <AppText size="small" weight="semibold">
                                {batchName ?? "No specific flock"}
                              </AppText>
                              <AppText size="small" tone="secondary">
                                Optional · batch choices match the block when selected
                              </AppText>
                            </View>
                            <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                  <Button
                    label="Add another allocation"
                    variant="secondary"
                    disabled={allocations.length >= 100}
                    onPress={() =>
                      setAllocations((current) => [...current, newAllocation()])
                    }
                  />
                  {totalQuantity > 0 ? (
                    <AppText size="small" tone="secondary">
                      {formatQuantity(totalBaseQuantity)} {baseUnit?.unit_abbreviation} total will be deducted.
                      {" "}
                      {formatQuantity(availableInSelectedUnit)} {selectedUnit?.unit_abbreviation} available.
                    </AppText>
                  ) : null}

                  <DatePickerField
                    label="Use date"
                    value={consumptionDate}
                    maximumDate={new Date()}
                    onChange={setConsumptionDate}
                  />
                  <TextField
                    label="Notes (optional)"
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="For example, morning feed"
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                  {error ? (
                    <View style={styles.inlineError}>
                      <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
                      <AppText size="small" style={{ color: theme.danger, flex: 1 }}>
                        {error}
                      </AppText>
                    </View>
                  ) : null}
                  <Button
                    label="Record consumption"
                    onPress={() => void submit()}
                    loading={createConsumption.isPending}
                    disabled={createConsumption.isPending || !selectedProduct}
                  />
                </>
              ) : null}
            </>
          )}
        </Card>

        <Card style={styles.section}>
          <View style={styles.historyHeader}>
            <View>
              <AppText size="heading" weight="semibold">Recent use</AppText>
              <AppText size="small" tone="secondary">Latest product consumption records</AppText>
            </View>
            {consumptionsQuery.isRefetching ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : null}
          </View>
          {consumptionsQuery.isError ? (
            <View>
              <AppText size="small" style={{ color: theme.danger }}>
                Couldn’t load consumption history:{" "}
                {normalizeApiError(consumptionsQuery.error).message}
              </AppText>
              <Button
                label="Retry history"
                variant="quiet"
                onPress={() => void consumptionsQuery.refetch()}
              />
            </View>
          ) : latestConsumptions.length ? (
            <View style={styles.historyList}>
              {latestConsumptions.map((entry) => {
                const product = productsQuery.data?.find(
                  (item) => item.id === entry.product_id,
                );
                const unit = product?.product_units.find(
                  (item) => item.unit_id === entry.unit_id,
                );
                const block = availableBlocks.find(
                  (item) => item.id === entry.block_id,
                );
                const batch = chickenOptions?.batches.find(
                  (item) => item.id === entry.batch_id,
                );
                return (
                  <View
                    key={entry.id}
                    style={[styles.historyRow, { borderTopColor: theme.border }]}
                  >
                    <View style={styles.historyIcon}>
                      <Ionicons name="remove-circle-outline" size={18} color={theme.textSecondary} />
                    </View>
                    <View style={styles.grow}>
                      <AppText size="small" weight="semibold">
                        {product?.name ?? "Product"}
                      </AppText>
                      <AppText size="small" tone="secondary">
                        {entry.consumption_date}
                        {block ? ` · ${block.name}` : ""}
                        {batch ? ` · ${batch.name}` : ""}
                      </AppText>
                    </View>
                    <AppText size="small" weight="semibold">
                      −{formatQuantity(Number(entry.quantity))} {unit?.unit_abbreviation ?? ""}
                    </AppText>
                  </View>
                );
              })}
            </View>
          ) : consumptionsQuery.isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={theme.primary} />
              <AppText size="small" tone="secondary">Loading history…</AppText>
            </View>
          ) : (
            <AppText size="small" tone="secondary">
              No product use has been recorded yet.
            </AppText>
          )}
        </Card>
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={productPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setProductPickerOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close product picker"
            onPress={() => setProductPickerOpen(false)}
            style={styles.scrim}
          />
          <SafeAreaView
            edges={["bottom"]}
            style={[
              styles.modalSheet,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={styles.grow}>
                <AppText size="heading" weight="semibold">Choose product</AppText>
                <AppText size="small" tone="secondary">
                  Products with stock available
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close product picker"
                onPress={() => setProductPickerOpen(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={23} color={theme.textSecondary} />
              </Pressable>
            </View>
            <TextField
              label="Search products"
              value={productSearch}
              onChangeText={setProductSearch}
              placeholder="Type a product name"
              autoCapitalize="none"
            />
            <ScrollView
              contentContainerStyle={styles.productList}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              automaticallyAdjustKeyboardInsets
            >
              {matchingProducts.length ? (
                matchingProducts.map((product) => {
                  const balance = balances.get(product.id);
                  return (
                    <Pressable
                      key={product.id}
                      accessibilityRole="button"
                      onPress={() => selectProduct(product)}
                      style={[
                        styles.productOption,
                        { borderBottomColor: theme.border },
                      ]}
                    >
                      <View
                        style={[
                          styles.productOptionIcon,
                          { backgroundColor: theme.backgroundSelected },
                        ]}
                      >
                        <Ionicons name={productIcon(product)} size={18} color={theme.primary} />
                      </View>
                      <View style={styles.grow}>
                        <AppText size="small" weight="semibold">{product.name}</AppText>
                        <AppText size="small" tone="secondary">
                          {productTypeLabel(product)}
                        </AppText>
                      </View>
                      <AppText size="small" weight="semibold">
                        {formatQuantity(Number(balance?.quantity ?? 0))}{" "}
                        {balance?.unit_abbreviation ?? ""}
                      </AppText>
                    </Pressable>
                  );
                })
              ) : (
                <AppText size="small" tone="secondary" style={styles.noResults}>
                  No matching stocked products.
                </AppText>
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal
        visible={locationPicker !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setLocationPicker(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close location picker"
            onPress={() => setLocationPicker(null)}
            style={styles.scrim}
          />
          <SafeAreaView
            edges={["bottom"]}
            style={[
              styles.modalSheet,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={styles.grow}>
                <AppText size="heading" weight="semibold">
                  {locationPicker?.kind === "block" ? "Choose block" : "Choose flock"}
                </AppText>
                <AppText size="small" tone="secondary">
                  Select one option for this allocation
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close location picker"
                onPress={() => setLocationPicker(null)}
                hitSlop={10}
              >
                <Ionicons name="close" size={23} color={theme.textSecondary} />
              </Pressable>
            </View>
            <TextField
              label={locationPicker?.kind === "block" ? "Search blocks" : "Search flocks"}
              value={locationSearch}
              onChangeText={setLocationSearch}
              placeholder="Type to find an option"
              autoCapitalize="none"
            />
            <ScrollView
              contentContainerStyle={styles.productList}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              automaticallyAdjustKeyboardInsets
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => selectLocation("")}
                style={[styles.productOption, { borderBottomColor: theme.border }]}
              >
                <View
                  style={[
                    styles.productOptionIcon,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Ionicons
                    name={locationPicker?.kind === "block" ? "remove-outline" : "people-outline"}
                    size={18}
                    color={theme.primary}
                  />
                </View>
                <View style={styles.grow}>
                  <AppText size="small" weight="semibold">
                    {locationPicker?.kind === "block" ? "No block" : "No specific flock"}
                  </AppText>
                  <AppText size="small" tone="secondary">
                    Leave this allocation unassigned
                  </AppText>
                </View>
              </Pressable>
              {locationOptions.length ? (
                locationOptions.map((option) => (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    onPress={() => selectLocation(option.id)}
                    style={[styles.productOption, { borderBottomColor: theme.border }]}
                  >
                    <View
                      style={[
                        styles.productOptionIcon,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <Ionicons
                        name={locationPicker?.kind === "block" ? "home-outline" : "git-branch-outline"}
                        size={18}
                        color={theme.primary}
                      />
                    </View>
                    <View style={styles.grow}>
                      <AppText size="small" weight="semibold">{option.name}</AppText>
                      <AppText size="small" tone="secondary">{option.detail}</AppText>
                    </View>
                  </Pressable>
                ))
              ) : (
                <AppText size="small" tone="secondary" style={styles.noResults}>
                  {locationPicker?.kind === "block"
                    ? "No matching blocks."
                    : "No flocks with current block occupancy match this selection."}
                </AppText>
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function newAllocation(): ConsumptionAllocation {
  return {
    id: `${Date.now()}-${Math.random()}`,
    blockId: "",
    batchId: "",
    quantity: "",
  };
}

function getAvailableBatches(
  batches: ChickenSaleBatch[],
  allocation: ConsumptionAllocation | undefined,
): ChickenSaleBatch[] {
  return batches.filter((batch) =>
    batch.stocks.some(
      (stock) =>
        stock.quantity > 0 &&
        (!allocation?.blockId || stock.block_id === allocation.blockId),
    ),
  );
}

function Choice({
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
        styles.choice,
        {
          backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}
    >
      <AppText
        size="small"
        weight={selected ? "semibold" : "regular"}
        style={{ color: selected ? theme.primary : theme.text }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function productIcon(product: Product): keyof typeof Ionicons.glyphMap {
  switch (product.product_type) {
    case "feed":
      return "leaf-outline";
    case "medication":
      return "medkit-outline";
    case "equipment":
      return "construct-outline";
    default:
      return "cube-outline";
  }
}

function productTypeLabel(product: Product): string {
  switch (product.product_type) {
    case "feed":
      return "Feed";
    case "medication":
      return "Medication";
    case "equipment":
      return "Tools & equipment";
    default:
      return "Other supplies";
  }
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 3,
  }).format(value);
}

function today(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  keyboardContainer: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 28 },
  section: { gap: 16 },
  grow: { flex: 1, gap: 3 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  sectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  selector: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 10,
    gap: 12,
  },
  stockSummary: {
    minHeight: 62,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stockSummaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  conversion: { textAlign: "right", flexShrink: 1 },
  choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 11, paddingVertical: 8 },
  allocationHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  allocationCard: { borderWidth: 1, borderRadius: 9, padding: 12, gap: 12 },
  allocationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  locationField: { gap: 7 },
  inlineError: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  emptyState: { alignItems: "center", gap: 10, paddingVertical: 18 },
  centerText: { textAlign: "center", maxWidth: 330 },
  errorHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  historyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  historyList: { marginTop: -8 },
  historyRow: {
    minHeight: 56,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
  },
  historyIcon: { width: 30, alignItems: "center" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  modalRoot: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  scrim: { ...StyleSheet.absoluteFill },
  modalSheet: {
    maxHeight: "82%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  productList: { paddingBottom: 12 },
  productOption: {
    minHeight: 60,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  productOptionIcon: {
    width: 34,
    height: 34,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  noResults: { textAlign: "center", paddingVertical: 22 },
});
