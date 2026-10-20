import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
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
};

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
  const farmId = farm.selectedFarm?.id;
  const userId = user?.id;
  const today = localDateString();
  const report = useProfitabilityReport(userId, farmId, {
    from_date: today,
    to_date: today,
  });
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

  if (!farm.selectedFarm) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
        <ScrollView contentContainerStyle={styles.content}>
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
      <ScrollView contentContainerStyle={styles.content}>
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
              Value current uncosted stock
            </AppText>
            <AppText size="small" tone="secondary">
              Set the verified cost per base unit for stock currently on hand.
              This creates a dated costing baseline without changing physical
              stock. Untracked flock counts are synchronized into the cost ledger.
            </AppText>
          </View>
        </View>
        <Card style={styles.notice}>
          <Ionicons name="information-circle-outline" size={19} color={theme.primary} />
          <AppText size="small" tone="secondary" style={styles.grow}>
            Enter a source-backed acquisition or production cost, not the selling
            price. The baseline begins today; periods before today may remain
            incomplete where earlier sales, consumption, or losses lacked cost
            records. Future stock movements use the weighted-average cost.
          </AppText>
        </Card>

        {report.isLoading || products.isLoading ? (
          <LoadingState label="Loading current stock valuation" />
        ) : report.isError || products.isError ? (
          <Card style={styles.errorCard}>
            <AppText weight="semibold">Current stock valuation could not load</AppText>
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
                <AppText weight="semibold">Chicken stock needs reconciliation</AppText>
                <AppText size="small" tone="secondary">
                  There are untracked chickens, but this farm does not have
                  exactly one active chicken product to link them to. Other stock
                  can still be valued; the flock will remain unvalued until its
                  product links are reconciled.
                </AppText>
              </Card>
            ) : null}
            {items.length ? (
              items.map((item) => (
                <StockCostCard
                  key={item.product_id}
                  item={item}
                  currency={farm.selectedFarm?.settings?.currency ?? "KES"}
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
                  onSave={() => {
                    const value = unitCosts[item.product_id]?.trim() ?? "";
                    if (!value || !Number.isFinite(Number(value)) || Number(value) < 0) {
                      setFormError("Enter a valid non-negative cost per unit.");
                      return;
                    }
                    setFormError(null);
                    setSuccessMessage(null);
                    mutation.mutate(
                      { product_id: item.product_id, unit_cost: value },
                      {
                        onSuccess: (result) => {
                          setSuccessMessage(
                            `${result.product_name}: cost recorded for ${result.quantity_valued} ${result.unit_abbreviation || result.unit_name} as of ${result.valuation_date}.`,
                          );
                        },
                      },
                    );
                  }}
                />
              ))
            ) : (
              <Card
                style={
                  report.data?.complete
                    ? undefined
                    : [
                        styles.incompleteCard,
                        {
                          backgroundColor: theme.backgroundSelected,
                          borderColor: theme.border,
                        },
                      ]
                }
              >
                <View style={styles.emptyHeading}>
                  <Ionicons
                    name={
                      report.data?.complete
                        ? "checkmark-circle-outline"
                        : "information-circle-outline"
                    }
                    size={22}
                    color={report.data?.complete ? theme.success : theme.secondary}
                  />
                  <AppText weight="semibold">
                    {report.data?.complete
                      ? "Current stock is costed"
                      : "No current stock needs a cost"}
                  </AppText>
                </View>
                <AppText size="small" tone="secondary">
                  {report.data?.complete
                    ? "Keep recording actual purchase prices and production costs for new stock."
                    : "This page values only stock still on hand. It cannot fill in missing costs for sales, stock use, losses or egg production. Missing amounts are never guessed."}
                </AppText>
              </Card>
            )}
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
}

function StockCostCard({
  item,
  currency,
  value,
  saving,
  error,
  onChange,
  onSave,
}: {
  item: CostingItem;
  currency: string;
  value: string;
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
            {formatQuantity(item.quantity)} {item.unit_abbreviation || item.unit_name} uncosted
          </AppText>
        </View>
        <AppText size="small" tone="secondary">{item.product_type}</AppText>
      </View>
      <AppText size="small" tone="secondary">
        Verified cost per {item.unit_abbreviation || item.unit_name} ({currency})
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
        label="Record cost baseline"
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
  incompleteCard: { gap: 9, borderWidth: 1 },
  successCard: { borderColor: "#548D73" },
  emptyHeading: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  stockCard: { gap: 10 },
  stockHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, fontSize: 16 },
});
