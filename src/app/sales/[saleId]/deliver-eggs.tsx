import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TextField } from "@/components/ui/text-field";
import { useEggCollectionOptions } from "@/features/eggs/hooks";
import type { EggCollectionUnit } from "@/features/eggs/api";
import {
  useChickenSaleDetails,
  useChickenSaleFulfillment,
  useCreateChickenSaleDelivery,
} from "@/features/chickens/hooks";
import type { ChickenSaleDeliveryInput } from "@/features/chickens/api";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

function localDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatQuantity(value: number | string): string {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return (
    date.getFullYear() === Number(match[1]) &&
    date.getMonth() === Number(match[2]) - 1 &&
    date.getDate() === Number(match[3])
  );
}

export default function EggSaleDeliveryRoute() {
  return (
    <SessionGate>
      <EggSaleDeliveryContent />
    </SessionGate>
  );
}

function EggSaleDeliveryContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const { saleId } = useLocalSearchParams<{ saleId: string }>();
  const farmId = farm.selectedFarm?.id ?? "";
  const details = useChickenSaleDetails(user?.id, farmId, saleId);
  const fulfillment = useChickenSaleFulfillment(user?.id, farmId, saleId);
  const eggOptions = useEggCollectionOptions(user?.id, farmId);
  const createDelivery = useCreateChickenSaleDelivery(user?.id ?? "", farmId);
  const [quantities, setQuantities] = useState<
    Record<string, Record<string, string>>
  >({});
  const [deliveredDate, setDeliveredDate] = useState(localDateString);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [dateError, setDateError] = useState("");

  const fulfillmentItems = fulfillment.data?.items ?? [];
  const outstandingItems = fulfillmentItems.filter(
    (item) => Number(item.outstanding_quantity) > 0,
  );
  const remaining = outstandingItems.reduce(
    (sum, item) => sum + Number(item.outstanding_quantity),
    0,
  );
  const delivered = fulfillmentItems.reduce(
    (sum, item) => sum + Number(item.delivered_quantity),
    0,
  );
  function unitsFor(itemId: string): EggCollectionUnit[] {
    const saleItem = details.data?.transaction.items.find(
      (candidate) => candidate.id === itemId,
    );
    return (
      eggOptions.data?.products.find(
        (product) => product.id === saleItem?.product_id,
      )?.units ?? []
    ).slice().sort((left, right) => Number(right.is_base_unit) - Number(left.is_base_unit));
  }

  function plannedForItem(itemId: string): number {
    return Object.entries(quantities[itemId] ?? {}).reduce(
      (total, [unitId, rawQuantity]) => {
        const unit = unitsFor(itemId).find((candidate) => candidate.id === unitId);
        const quantity = Number(rawQuantity);
        return (
          total +
          (Number.isFinite(quantity) ? quantity : 0) *
            Number(unit?.conversion_factor ?? 0)
        );
      },
      0,
    );
  }

  const planned = outstandingItems.reduce(
    (sum, item) => sum + plannedForItem(item.transaction_item_id),
    0,
  );

  function updateQuantity(itemId: string, unitId: string, value: string) {
    setError("");
    if (
      value &&
      !/^(?:\d{0,9}(?:\.\d{0,3})?|\.\d{1,3})$/.test(value)
    ) {
      return;
    }
    const item = fulfillmentItems.find(
      (candidate) => candidate.transaction_item_id === itemId,
    );
    const unit = unitsFor(itemId).find((candidate) => candidate.id === unitId);
    const outstanding = Number(
      item?.outstanding_quantity ?? 0,
    );
    const conversionFactor = Number(unit?.conversion_factor ?? 0);
    const otherUnitsBase = Object.entries(quantities[itemId] ?? {}).reduce(
      (total, [otherUnitId, rawQuantity]) => {
        if (otherUnitId === unitId) return total;
        const otherUnit = unitsFor(itemId).find(
          (candidate) => candidate.id === otherUnitId,
        );
        const quantity = Number(rawQuantity);
        return (
          total +
          (Number.isFinite(quantity) ? quantity : 0) *
            Number(otherUnit?.conversion_factor ?? 0)
        );
      },
      0,
    );
    const maxInUnit =
      conversionFactor > 0
        ? Math.floor(
            (Math.max(0, outstanding - otherUnitsBase) / conversionFactor) *
              1000 +
              0.000001,
          ) / 1000
        : 0;
    const requested = Number(value);
    const accepted =
      value && Number.isFinite(requested) && requested > maxInUnit
        ? String(maxInUnit)
        : value;
    setQuantities((current) => ({
      ...current,
      [itemId]: { ...current[itemId], [unitId]: accepted },
    }));
  }

  async function submit() {
    setError("");
    setDateError("");
    if (!isValidDate(deliveredDate)) {
      setDateError("Choose a valid date for this delivery.");
      return;
    }
    if (deliveredDate > localDateString()) {
      setDateError("A delivery date cannot be in the future.");
      return;
    }

    const items: ChickenSaleDeliveryInput["items"] = [];
    for (const item of outstandingItems) {
      const itemQuantities = Object.values(
        quantities[item.transaction_item_id] ?? {},
      );
      if (
        itemQuantities.some(
          (value) =>
            value.trim() !== "" &&
            !/^(?:\d{1,9}(?:\.\d{0,3})?|\.\d{1,3})$/.test(value),
        )
      ) {
        setError("Use a valid quantity with no more than 3 decimal places.");
        return;
      }
      const quantity = plannedForItem(item.transaction_item_id);
      if (!Number.isFinite(quantity) || quantity < 0) {
        setError("Check the egg quantities and configured unit conversions.");
        return;
      }
      if (quantity > Number(item.outstanding_quantity) + 0.000001) {
        setError(
          `Delivery cannot exceed the ${formatQuantity(item.outstanding_quantity)} eggs still outstanding.`,
        );
        return;
      }
      if (quantity <= 0) continue;
      items.push({
        transaction_item_id: item.transaction_item_id,
        quantity_delivered: Number(quantity.toFixed(3)),
        batch_allocations: [],
      });
    }
    if (items.length === 0) {
      setError("Enter a delivery quantity for at least one egg product.");
      return;
    }

    try {
      const result = await createDelivery.mutateAsync({
        transactionId: saleId,
        payload: {
          delivered_date: deliveredDate,
          notes: notes.trim() || undefined,
          items,
        },
      });
      const deliveredCount = result.items.reduce(
        (sum, item) => sum + Number(item.quantity_delivered),
        0,
      );
      router.replace({
        pathname: "/sales/[saleId]",
        params: {
          saleId,
          deliveryRecorded: "true",
          deliveredCount: String(deliveredCount),
        },
      });
    } catch (deliveryError: unknown) {
      setError(
        `Could not record this delivery. ${normalizeApiError(deliveryError).message}`,
      );
    }
  }

  const loadError = details.error ?? fulfillment.error ?? eggOptions.error;
  const isLoading =
    details.isLoading || fulfillment.isLoading || eggOptions.isLoading;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          automaticallyAdjustKeyboardInsets
        >
          <FarmPageHeader title="Record egg delivery" showBack />
          {isLoading ? (
            <Card style={styles.stateCard}>
              <ActivityIndicator color={theme.primary} />
              <AppText size="small" tone="secondary">
                Loading this order’s delivery progress…
              </AppText>
            </Card>
          ) : loadError ? (
            <Card style={styles.stateCard}>
              <View
                style={[
                  styles.stateIcon,
                  { backgroundColor: `${theme.danger}12` },
                ]}
              >
                <Ionicons
                  name="cloud-offline-outline"
                  size={22}
                  color={theme.danger}
                />
              </View>
              <AppText weight="semibold">Delivery details couldn’t load</AppText>
              <AppText size="small" tone="secondary" style={styles.centered}>
                {normalizeApiError(loadError).message}
              </AppText>
              <Button
                label="Retry loading"
                variant="secondary"
                onPress={() => {
                  void details.refetch();
                  void fulfillment.refetch();
                  void eggOptions.refetch();
                }}
              />
            </Card>
          ) : fulfillment.data?.fully_resolved ? (
            <Card style={styles.stateCard}>
              <View
                style={[
                  styles.stateIcon,
                  { backgroundColor: `${theme.success}14` },
                ]}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={24}
                  color={theme.success}
                />
              </View>
              <AppText weight="semibold">This egg order is fully delivered</AppText>
              <AppText size="small" tone="secondary" style={styles.centered}>
                All ordered quantities have already been handed over or resolved.
              </AppText>
              <Button
                label="Back to sale"
                variant="secondary"
                onPress={() => router.back()}
              />
            </Card>
          ) : fulfillment.data && details.data ? (
            <>
              <Card style={styles.heroCard}>
                <View style={styles.heroHeading}>
                  <View
                    style={[
                      styles.heroIcon,
                      { backgroundColor: `${theme.primary}16` },
                    ]}
                  >
                    <Ionicons
                      name="cube-outline"
                      size={22}
                      color={theme.primary}
                    />
                  </View>
                  <View style={styles.heroCopy}>
                    <AppText size="heading" weight="semibold">
                      Fulfil this order in parts
                    </AppText>
                    <AppText size="small" tone="secondary">
                      Record only the eggs handed over now. Come back to this sale
                      for later deliveries.
                    </AppText>
                  </View>
                </View>
                <View style={styles.metrics}>
                  <View style={styles.metric}>
                    <AppText size="small" tone="secondary">
                      Eggs still outstanding
                    </AppText>
                    <AppText
                      size="heading"
                      weight="semibold"
                      style={{ color: theme.primary }}
                    >
                      {formatQuantity(remaining)}
                    </AppText>
                  </View>
                  <View
                    style={[styles.metricDivider, { backgroundColor: theme.border }]}
                  />
                  <View style={styles.metric}>
                    <AppText size="small" tone="secondary">
                      Eggs delivered so far
                    </AppText>
                    <AppText size="heading" weight="semibold">
                      {formatQuantity(delivered)}
                    </AppText>
                  </View>
                </View>
              </Card>

              <Card style={styles.productsCard}>
                <View style={styles.sectionHeading}>
                  <AppText weight="semibold">Prepare this delivery</AppText>
                  <AppText size="small" tone="secondary">
                    Use any configured units. Their total is checked against the remaining order.
                  </AppText>
                </View>
                {outstandingItems.map((item) => {
                  const saleItem = details.data.transaction.items.find(
                    (candidate) => candidate.id === item.transaction_item_id,
                  );
                  const productName = saleItem?.product_name ?? "Egg product";
                  const units = unitsFor(item.transaction_item_id);
                  const baseUnit =
                    units.find((unit) => unit.is_base_unit) ?? units[0];
                  return (
                    <View
                      key={item.transaction_item_id}
                      style={[
                        styles.productRow,
                        { borderTopColor: theme.border },
                      ]}
                    >
                      <View style={styles.productHeader}>
                        <View style={styles.productCopy}>
                          <AppText weight="semibold" numberOfLines={1}>
                            {productName}
                          </AppText>
                          <AppText size="small" tone="secondary">
                            {formatQuantity(item.outstanding_quantity)}{" "}
                            {baseUnit?.abbreviation || baseUnit?.name || "base units"} left
                          </AppText>
                        </View>
                        <View
                          style={[
                            styles.remainingBadge,
                            { backgroundColor: theme.backgroundSelected },
                          ]}
                        >
                          <AppText
                            size="small"
                            weight="semibold"
                            style={{ color: theme.primary }}
                          >
                            {formatQuantity(item.outstanding_quantity)}
                          </AppText>
                        </View>
                      </View>
                      {units.length > 0 ? (
                        <View style={styles.unitList}>
                          {units.map((unit) => {
                            const factor = Number(unit.conversion_factor);
                            const unitLabel = unit.abbreviation || unit.name;
                            const baseLabel =
                              baseUnit?.abbreviation || baseUnit?.name || "base units";
                            return (
                              <View
                                key={unit.id}
                                style={[
                                  styles.unitRow,
                                  { borderTopColor: theme.border },
                                ]}
                              >
                                <View style={styles.unitCopy}>
                                  <AppText size="small" weight="semibold">
                                    {unitLabel}
                                  </AppText>
                                  <AppText size="small" tone="secondary">
                                    1 {unitLabel} = {formatQuantity(factor)} {baseLabel}
                                  </AppText>
                                </View>
                                <TextInput
                                  accessibilityLabel={`${unit.name} to deliver for ${productName}`}
                                  value={
                                    quantities[item.transaction_item_id]?.[unit.id] ??
                                    ""
                                  }
                                  onChangeText={(value) =>
                                    updateQuantity(
                                      item.transaction_item_id,
                                      unit.id,
                                      value,
                                    )
                                  }
                                  keyboardType="decimal-pad"
                                  placeholder="0"
                                  placeholderTextColor={theme.textSecondary}
                                  style={[
                                    styles.quantityInput,
                                    {
                                      color: theme.text,
                                      borderColor: theme.border,
                                      backgroundColor: theme.background,
                                    },
                                  ]}
                                  returnKeyType="done"
                                />
                              </View>
                            );
                          })}
                        </View>
                      ) : (
                        <AppText size="small" style={{ color: theme.danger }}>
                          No delivery units are configured for this product.
                        </AppText>
                      )}
                      <AppText size="small" tone="secondary">
                        Delivered in this trip:{" "}
                        {formatQuantity(plannedForItem(item.transaction_item_id))}{" "}
                        {baseUnit?.abbreviation || baseUnit?.name || "base units"}
                      </AppText>
                    </View>
                  );
                })}
                <View style={styles.planRow}>
                  <AppText size="small" tone="secondary">
                    Planned for this delivery
                  </AppText>
                  <AppText weight="semibold">
                    {formatQuantity(planned)} eggs
                  </AppText>
                </View>
                <Button
                  label="Deliver all remaining eggs"
                  variant="secondary"
                  onPress={() =>
                    setQuantities((current) => {
                      const next = { ...current };
                      for (const item of outstandingItems) {
                        const units = unitsFor(item.transaction_item_id);
                        const baseUnit =
                          units.find((unit) => unit.is_base_unit) ?? units[0];
                        const factor = Number(baseUnit?.conversion_factor ?? 1);
                        if (!baseUnit || factor <= 0) continue;
                        next[item.transaction_item_id] = {
                          [baseUnit.id]: (
                            Number(item.outstanding_quantity) / factor
                          ).toFixed(3).replace(/\.?0+$/, ""),
                        };
                      }
                      return next;
                    })
                  }
                />
              </Card>

              <Card style={styles.formCard}>
                <DatePickerField
                  label="Delivery date"
                  value={deliveredDate}
                  maximumDate={new Date()}
                  onChange={(value) => {
                    setDeliveredDate(value);
                    setDateError("");
                    setError("");
                  }}
                />
                {dateError ? (
                  <AppText size="small" style={{ color: theme.danger }}>
                    {dateError}
                  </AppText>
                ) : null}
                <TextField
                  label="Delivery note (optional)"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Driver, destination, or handover details"
                  multiline
                />
              </Card>

              {error ? (
                <View
                  accessibilityRole="alert"
                  style={[
                    styles.errorCard,
                    {
                      borderColor: `${theme.danger}55`,
                      backgroundColor: `${theme.danger}10`,
                    },
                  ]}
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={20}
                    color={theme.danger}
                  />
                  <AppText size="small" style={styles.errorCopy}>
                    {error}
                  </AppText>
                </View>
              ) : null}

              <View style={styles.actions}>
                <Button
                  label={createDelivery.isPending ? "Saving delivery…" : "Record delivery"}
                  loading={createDelivery.isPending}
                  disabled={createDelivery.isPending || planned <= 0}
                  onPress={() => void submit()}
                />
                <Button
                  label="Cancel"
                  variant="secondary"
                  disabled={createDelivery.isPending}
                  onPress={() => router.back()}
                />
              </View>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  stateCard: { alignItems: "center", gap: 11, paddingVertical: 24 },
  stateIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  centered: { textAlign: "center" },
  heroCard: { gap: 12, padding: 14 },
  heroHeading: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  heroIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCopy: { flex: 1, gap: 5 },
  metrics: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 11,
    gap: 12,
  },
  metric: { flex: 1, gap: 3 },
  metricDivider: { width: 1, height: 42 },
  productsCard: { gap: 10, padding: 14 },
  sectionHeading: { gap: 4 },
  productRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
    gap: 10,
  },
  productCopy: { gap: 4 },
  productHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  remainingBadge: {
    minWidth: 42,
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  unitList: { gap: 0 },
  unitRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 7,
  },
  unitCopy: { flex: 1, gap: 2 },
  quantityInput: {
    width: 92,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "right",
  },
  planRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    paddingTop: 4,
  },
  formCard: { gap: 14, padding: 17 },
  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
    gap: 10,
  },
  errorCopy: { flex: 1 },
  actions: { gap: 9 },
});
