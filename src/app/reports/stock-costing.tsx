import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  useProducts,
  useProfitabilityReport,
  useRecordProfitabilityStockValuation,
} from "@/features/management/hooks";
import type { ProfitabilityStock } from "@/features/management/api";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type CostingItem = {
  product_id: string;
  product_name: string;
  product_type: string;
  quantity: string;
  unit_name: string;
  unit_abbreviation: string;
  movement_types?: ("sale" | "consumption" | "loss")[];
};

type CostEntryMode = "current" | "historical";

export default function StockCostingRoute() {
  return (
    <SessionGate>
      <StockCostingContent />
    </SessionGate>
  );
}

function StockCostingContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{
    productId?: string | string[];
    from_date?: string | string[];
    to_date?: string | string[];
  }>();
  const productId = firstParam(params.productId);
  const fromDate = firstParam(params.from_date);
  const toDate = firstParam(params.to_date);
  const isHistoricalRequest = Boolean(productId && fromDate && toDate);
  const reportFilters = {
    from_date: fromDate ?? localDateString(),
    to_date: toDate ?? localDateString(),
  };
  const farmId = farm.selectedFarm?.id;
  const userId = user?.id;
  const report = useProfitabilityReport(userId, farmId, reportFilters);
  const products = useProducts(userId, farmId);
  const mutation = useRecordProfitabilityStockValuation(
    userId ?? "",
    farmId ?? "",
  );
  const [unitCosts, setUnitCosts] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const chickenProducts = useMemo(
    () =>
      (products.data ?? []).filter(
        (product) => product.product_type === "chickens" && product.is_active,
      ),
    [products.data],
  );
  const items = useMemo(() => {
    const existing = (report.data?.closing_stock ?? [])
      .filter((item) => Number(item.unvalued_quantity) > 0)
      .map(stockItem);
    if (
      Number(report.data?.untracked_chicken_quantity ?? 0) > 0 &&
      chickenProducts.length === 1 &&
      !existing.some((item) => item.product_id === chickenProducts[0].id)
    ) {
      const product = chickenProducts[0];
      const unit = product.product_units.find((item) => item.is_base_unit);
      existing.push({
        product_id: product.id,
        product_name: product.name,
        product_type: product.product_type,
        quantity: report.data?.untracked_chicken_quantity ?? "0",
        unit_name: unit?.unit_name ?? "base unit",
        unit_abbreviation: unit?.unit_abbreviation ?? "",
      });
    }
    return existing;
  }, [chickenProducts, report.data]);
  const historicalIssues = (report.data?.product_performance ?? [])
    .filter(
      (item) =>
        Number(item.uncosted_movement_quantity) > 0 &&
        (!productId || item.product_id === productId),
    )
    .map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      product_type: item.product_type,
      quantity: item.uncosted_movement_quantity,
      unit_name: item.unit_name,
      unit_abbreviation: item.unit_abbreviation,
      movement_types: item.uncosted_movement_types,
    }));
  const currentStockItems = isHistoricalRequest
    ? []
    : productId
      ? items.filter((item) => item.product_id === productId)
      : items;
  const requestedProduct = productId
    ? (products.data ?? []).find((product) => product.id === productId)
    : undefined;

  if (!farm.selectedFarm) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <FarmPageHeader title="Stock costing" showBack />
          <Card>
            <AppText weight="semibold">Choose a farm to continue.</AppText>
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <FarmPageHeader
          title="Stock costing"
          showBack
          fallbackHref="/reports"
        />
        <View style={styles.intro}>
          <View style={[styles.introIcon, { backgroundColor: `${theme.primary}18` }]}>
            <Ionicons name="calculator-outline" size={21} color={theme.primary} />
          </View>
          <View style={styles.grow}>
            <AppText size="heading" weight="semibold">
              {isHistoricalRequest
                ? "Estimate missing stock cost"
                : "Value current uncosted stock"}
            </AppText>
            <AppText size="small" tone="secondary">
              {isHistoricalRequest
                ? "Enter the estimated unit cost for this product."
                : "Enter the verified cost per base unit for stock on hand."}
            </AppText>
          </View>
        </View>
        {productId && fromDate && toDate ? (
          <Card style={styles.notice}>
            <Ionicons name="information-circle-outline" size={18} color={theme.primary} />
            <AppText size="small" tone="secondary" style={styles.grow}>
              This estimate will be applied to uncosted stock movements in the
              selected report period.
            </AppText>
          </Card>
        ) : null}

        {report.isLoading || products.isLoading ? (
          <LoadingState
            label={
              isHistoricalRequest
                ? "Loading report cost details"
                : "Loading current stock valuation"
            }
          />
        ) : report.isError || products.isError ? (
          <Card style={styles.errorCard}>
            <AppText weight="semibold">
              {isHistoricalRequest
                ? "Report cost details could not load"
                : "Current stock valuation could not load"}
            </AppText>
            {report.isError ? (
              <AppText size="small" tone="secondary">
                {normalizeApiError(report.error).message}
              </AppText>
            ) : null}
            {products.isError ? (
              <AppText size="small" tone="secondary">
                {normalizeApiError(products.error).message}
              </AppText>
            ) : null}
            <Button
              label="Retry"
              variant="secondary"
              onPress={() => {
                void report.refetch();
                void products.refetch();
              }}
            />
          </Card>
        ) : (
          <>
            {Number(report.data?.untracked_chicken_quantity ?? 0) > 0 &&
            chickenProducts.length !== 1 ? (
              <Card style={styles.errorCard}>
                <AppText weight="semibold">Chicken product link missing</AppText>
                <AppText size="small" tone="secondary">
                  Add or activate one chicken product before valuing this flock.
                </AppText>
              </Card>
            ) : null}
            {historicalIssues.map((item) => (
              <StockCostCard
                key={`historical-${item.product_id}`}
                item={item}
                currency={farm.selectedFarm?.settings?.currency ?? "KES"}
                mode="historical"
                value={unitCosts[item.product_id] ?? ""}
                saving={
                  mutation.isPending &&
                  mutation.variables?.product_id === item.product_id
                }
                error={
                  mutation.isError &&
                  mutation.variables?.product_id === item.product_id
                    ? normalizeApiError(mutation.error).message
                    : null
                }
                onChange={(value) =>
                  setUnitCosts((current) => ({
                    ...current,
                    [item.product_id]: value,
                  }))
                }
                onSave={() => saveCost(item, "historical")}
              />
            ))}
            {currentStockItems.length ? (
              currentStockItems.map((item) => (
                <StockCostCard
                  key={item.product_id}
                  item={item}
                  currency={farm.selectedFarm?.settings?.currency ?? "KES"}
                  mode="current"
                  value={unitCosts[item.product_id] ?? ""}
                  saving={
                    mutation.isPending &&
                    mutation.variables?.product_id === item.product_id
                  }
                  error={
                    mutation.isError &&
                    mutation.variables?.product_id === item.product_id
                      ? normalizeApiError(mutation.error).message
                      : null
                  }
                  onChange={(value) =>
                    setUnitCosts((current) => ({
                      ...current,
                      [item.product_id]: value,
                    }))
                  }
                  onSave={() => saveCost(item, "current")}
                />
              ))
            ) : null}
            {historicalIssues.length === 0 && currentStockItems.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Ionicons
                  name={productId ? "checkmark-circle-outline" : "cube-outline"}
                  size={20}
                  color={productId ? theme.success : theme.textSecondary}
                />
                <AppText size="small" weight="semibold">
                  {productId
                    ? `No missing cost for ${requestedProduct?.name ?? "this product"} in this report.`
                    : "No current stock needs a cost."}
                </AppText>
              </Card>
            ) : null}
            {successMessage ? (
              <Card style={styles.successCard}>
                <AppText size="small" weight="semibold">
                  {successMessage}
                </AppText>
              </Card>
            ) : null}
            {formError ? (
              <Card style={styles.errorCard}>
                <AppText size="small" style={{ color: theme.danger }}>
                  {formError}
                </AppText>
              </Card>
            ) : null}
          </>
        )}

        <Button
          label="Back to reports"
          variant="secondary"
          onPress={() => router.replace("/reports")}
        />
      </ScrollView>
    </SafeAreaView>
  );

  function saveCost(item: CostingItem, mode: CostEntryMode) {
    const value = unitCosts[item.product_id]?.trim() ?? "";
    if (!value || !Number.isFinite(Number(value)) || Number(value) < 0) {
      setFormError("Enter a valid non-negative cost per unit.");
      return;
    }
    setFormError(null);
    setSuccessMessage(null);
    mutation.mutate(
      {
        product_id: item.product_id,
        unit_cost: value,
        ...(mode === "historical"
          ? {
              from_date: reportFilters.from_date,
              to_date: reportFilters.to_date,
            }
          : {}),
      },
      {
        onSuccess: (result) => {
          setSuccessMessage(
            mode === "historical"
              ? `Estimated cost applied to ${result.product_name}. Report updated.`
              : `Cost recorded for ${result.product_name}.`,
          );
        },
      },
    );
  }
}

function StockCostCard({
  item,
  currency,
  value,
  mode,
  saving,
  error,
  onChange,
  onSave,
}: {
  item: CostingItem;
  currency: string;
  value: string;
  mode: CostEntryMode;
  saving: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Card style={styles.stockCard}>
      <View style={styles.stockHeading}>
        <View style={styles.grow}>
          <AppText weight="semibold">{item.product_name}</AppText>
          <AppText size="small" tone="secondary">
            {mode === "historical"
              ? `${formatQuantity(item.quantity)} ${item.unit_abbreviation || item.unit_name} ${formatMovementTypes(item.movement_types ?? [])} without cost`
              : `${formatQuantity(item.quantity)} ${item.unit_abbreviation || item.unit_name} on hand`}
          </AppText>
        </View>
        <AppText size="small" tone="secondary">{item.product_type}</AppText>
      </View>
      <AppText size="small" tone="secondary">
        {mode === "historical" ? "Estimated" : "Verified"} cost per{" "}
        {item.unit_abbreviation || item.unit_name} ({currency})
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="0.00"
        keyboardType="decimal-pad"
        style={[
          styles.input,
          {
            backgroundColor: theme.background,
            borderColor: theme.border,
            color: theme.text,
          },
        ]}
        placeholderTextColor={theme.textSecondary}
      />
      {error ? (
        <AppText size="small" style={{ color: theme.danger }}>{error}</AppText>
      ) : null}
      <Button
        label={mode === "historical" ? "Apply estimate to report" : "Record stock cost"}
        loading={saving}
        disabled={saving}
        onPress={onSave}
      />
    </Card>
  );
}

function stockItem(item: ProfitabilityStock): CostingItem {
  return {
    product_id: item.product_id,
    product_name: item.product_name,
    product_type: item.product_type,
    quantity: item.unvalued_quantity,
    unit_name: item.unit_name,
    unit_abbreviation: item.unit_abbreviation,
  };
}

function localDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatQuantity(value: string): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(
    Number(value),
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  intro: { flexDirection: "row", alignItems: "center", gap: 11 },
  introIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  grow: { flex: 1, gap: 3 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  errorCard: { gap: 9 },
  emptyCard: { flexDirection: "row", alignItems: "center", gap: 9 },
  successCard: { borderColor: "#548D73" },
  stockCard: { gap: 10 },
  stockHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, fontSize: 16 },
});

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatMovementTypes(types: ("sale" | "consumption" | "loss")[]): string {
  const labels = types.map((type) =>
    type === "sale" ? "sold" : type === "consumption" ? "used" : "lost",
  );
  if (labels.length < 2) return labels[0] ?? "moved";
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}
