import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { AppText } from "@/components/ui/app-text";
import { LoadingState } from "@/components/feedback/loading-state";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ProfitabilityReport } from "@/features/management/api";
import { useConfirmZeroEggProductionCost } from "@/features/management/hooks";
import { ProfitabilityValueRow } from "@/features/reports/overview/overview-components";
import {
  formatCurrencyAmount,
  formatDateLabel,
  formatMovementTypes,
  formatQuantity,
  formatQuantityWithUnit,
  reportHref,
} from "@/features/reports/overview/overview-utils";
import { normalizeApiError } from "@/lib/api/errors";
import { useTheme } from "@/providers/theme-provider";
import { styles } from "@/features/reports/overview/styles";

export function ProfitabilityCard({
  report,
  loading,
  error,
  currency,
  transactionSalesTotal,
  userId,
  farmId,
  onRetry,
}: {
  report: ProfitabilityReport | undefined;
  loading: boolean;
  error: unknown;
  currency: string;
  transactionSalesTotal: number;
  userId: string;
  farmId: string;
  onRetry: () => void;
}) {
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const zeroCostConfirmation = useConfirmZeroEggProductionCost(userId, farmId);
  const [showCalculationDetails, setShowCalculationDetails] = useState(false);
  const formatAmount = (value: string | number) =>
    formatCurrencyAmount(Number(value), currency);

  if (loading) {
    return (
      <Card style={styles.profitabilityCard}>
        <AppText size="heading" weight="semibold">Net profit & loss</AppText>
        <LoadingState label="Calculating farm profitability" />
      </Card>
    );
  }
  if (error) {
    return (
      <Card style={styles.profitabilityCard}>
        <View style={styles.errorHeading}>
          <Ionicons name="alert-circle-outline" size={20} color={theme.danger} />
          <AppText size="heading" weight="semibold">
            Profitability report unavailable
          </AppText>
        </View>
        <AppText size="small" tone="secondary">
          {normalizeApiError(error).message}
        </AppText>
        <Button label="Retry profitability report" variant="secondary" onPress={onRetry} />
      </Card>
    );
  }
  if (!report) return null;

  const isVerified = report.complete && report.net_profit !== null;
  const result = isVerified ? Number(report.net_profit) : null;
  const resultColor = !isVerified
    ? theme.secondary
    : result !== null && result < 0
      ? theme.danger
      : result !== null && result > 0
        ? theme.success
        : theme.text;
  const resultLabel = !isVerified
    ? "NOT VERIFIED"
    : result !== null && result < 0
      ? "LOSS"
      : result !== null && result > 0
        ? "PROFIT"
        : "BREAK-EVEN";
  const rows = [
    { label: "Gross sales", value: report.gross_sales },
    { label: "Return credits", value: report.sales_credits, deduct: true },
    { label: "Net revenue", value: report.net_revenue, strong: true },
    { label: "Stock cost sold", value: report.cost_of_goods_sold, deduct: true },
    {
      label: "Feed & product use",
      value: report.unallocated_consumption_expense,
      deduct: true,
    },
    {
      label: "Operating expenses",
      value: report.operating_expenses,
      deduct: true,
    },
    { label: "Stock losses", value: report.inventory_losses, deduct: true },
  ];
  const productsWithUnvaluedStock = report.closing_stock.filter(
    (item) => Number(item.unvalued_quantity) > 0,
  );
  const costMissingProducts = report.product_performance.filter(
    (item) => Number(item.uncosted_movement_quantity) > 0,
  );
  const hasUncostedConsumption = costMissingProducts.some((item) =>
    item.uncosted_movement_types.includes("consumption"),
  );
  const needsZeroCostConfirmation =
    !hasUncostedConsumption &&
    report.egg_production_zero_cost_confirmation_available &&
    !report.egg_production_zero_cost_confirmed &&
    report.incompleteness_reasons.some((reason) =>
      reason.toLowerCase().includes("egg production"),
    );
  const profitabilityGaps = report.incompleteness_reasons
    .filter((reason) => {
      const normalized = reason.toLowerCase();
      if (
        normalized.includes("not represented in the inventory ledger") ||
        normalized.includes("ledger exceeds the quantity")
      ) {
        return false;
      }
      if (normalized.includes("products still on hand")) {
        return false;
      }
      if (
        normalized.includes("sale, consumption, or loss") &&
        report.missing_inventory_record_count === 0 &&
        costMissingProducts.length > 0
      ) {
        return false;
      }
      if (
        normalized.includes("egg production") &&
        (hasUncostedConsumption || needsZeroCostConfirmation)
      ) {
        return false;
      }
      return true;
    })
    .map((reason) => {
      const normalized = reason.toLowerCase();
      if (normalized.includes("products still on hand")) {
        return "Some stock on hand has no recorded value.";
      }
      if (normalized.includes("egg production")) {
        return "No costed feed use is linked to egg production in this period.";
      }
      if (normalized.includes("sale, consumption, or loss")) {
        return report.missing_inventory_record_count > 0
          ? `${report.missing_inventory_record_count} sale, use, or loss records have no matching inventory movement.`
          : `${report.unvalued_period_movement_count} stock checks could not be matched to a costed inventory movement.`;
      }
      if (normalized.includes("current chicken batch stock")) {
        return "Chicken stock isn’t linked to a product.";
      }
      return reason;
    });
  const issueCount =
    profitabilityGaps.length +
    report.egg_stock_reconciliation.length +
    costMissingProducts.length +
    productsWithUnvaluedStock.length +
    (needsZeroCostConfirmation ? 1 : 0) +
    (Number(report.untracked_chicken_quantity) > 0 ? 1 : 0);

  return (
    <Card style={styles.profitabilityCard}>
      <View style={styles.profitabilityHeader}>
        <View style={[styles.profitabilityIcon, { backgroundColor: `${resultColor}18` }]}>
          <Ionicons name="analytics-outline" size={21} color={resultColor} />
        </View>
        <View style={styles.grow}>
          <AppText size="heading" weight="semibold">Net profit & loss</AppText>
          <AppText size="small" tone="secondary">
            Profit after stock costs, expenses, returns and losses
          </AppText>
        </View>
        <View style={[styles.profitabilityBadge, { backgroundColor: `${resultColor}18` }]}>
          <AppText size="small" weight="semibold" style={{ color: resultColor }}>
            {resultLabel}
          </AppText>
        </View>
      </View>
      <View style={[styles.profitabilityResult, { borderColor: `${resultColor}55` }]}>
        <View style={styles.resultTopline}>
          <View style={styles.grow}>
            <AppText size="small" tone="secondary">
              {formatDateLabel(report.from_date)} – {formatDateLabel(report.to_date)}
            </AppText>
            <AppText
              size={result === null ? "body" : "title"}
              weight="semibold"
              style={{ color: resultColor }}
            >
              {result === null ? "Not verified" : formatAmount(result)}
            </AppText>
          </View>
          {!isVerified ? (
            <View style={[styles.resultStatus, { backgroundColor: `${resultColor}18` }]}>
              <Ionicons name="alert-circle-outline" size={15} color={resultColor} />
              <AppText size="small" weight="semibold" style={{ color: resultColor }}>
                Review
              </AppText>
            </View>
          ) : null}
        </View>
        <View style={styles.resultMiniGrid}>
          <View style={[styles.resultMini, { backgroundColor: theme.backgroundSelected }]}>
            <AppText size="small" tone="secondary">Net revenue</AppText>
            <AppText size="small" weight="semibold">{formatAmount(report.net_revenue)}</AppText>
          </View>
          <View style={[styles.resultMini, { backgroundColor: theme.backgroundSelected }]}>
            <AppText size="small" tone="secondary">Cost of goods sold</AppText>
            <AppText size="small" weight="semibold">{formatAmount(report.cost_of_goods_sold)}</AppText>
          </View>
        </View>
        {Number(report.gross_sales) !== transactionSalesTotal ? (
          <View style={styles.reconciliationNote}>
            <Ionicons name="information-circle-outline" size={16} color={theme.primary} />
            <AppText size="small" tone="secondary" style={styles.grow}>
              Sales totals use different dates: chicken by delivery; other products by transaction.
            </AppText>
          </View>
        ) : null}
      </View>
      {report.reserved_egg_sales.length > 0 ? (
        <View
          style={[
            styles.reservedEggPanel,
            {
              backgroundColor: `${theme.secondary}0A`,
              borderColor: `${theme.secondary}35`,
            },
          ]}
        >
          <View style={styles.reservedEggHeading}>
            <View
              style={[
                styles.reservedEggIcon,
                { backgroundColor: `${theme.secondary}18` },
              ]}
            >
              <Ionicons
                name="time-outline"
                size={18}
                color={theme.secondary}
              />
            </View>
            <View style={styles.incompleteReasonCopy}>
              <AppText size="small" weight="semibold">
                Reserved for delivery
              </AppText>
              <AppText size="small" tone="secondary">
                Eggs set aside for existing sales
              </AppText>
            </View>
          </View>
          {report.reserved_egg_sales.map((item) => (
            <Pressable
              key={`${item.transaction_id}:${item.product_id}`}
              accessibilityRole="button"
              accessibilityLabel={`Open sale ${item.reference_number ?? ""} to record delivery for ${item.product_name}`}
              onPress={() =>
                router.push({
                  pathname: "/sales/[saleId]",
                  params: { saleId: item.transaction_id },
                })
              }
              style={[
                styles.reservedEggSale,
                {
                  backgroundColor: theme.background,
                  borderColor: `${theme.secondary}30`,
                },
              ]}
            >
              <View style={styles.reservedEggSaleTop}>
                <View style={styles.incompleteReasonCopy}>
                  <AppText size="small" weight="semibold">
                    {item.product_name}
                  </AppText>
                  <AppText size="small" tone="secondary">
                    {item.reference_number
                      ? `Sale ${item.reference_number}`
                      : "Egg sale"}{" "}
                    · {formatDateLabel(item.transaction_date)}
                  </AppText>
                </View>
                <View
                  style={[
                    styles.reservedQuantityBadge,
                    { backgroundColor: `${theme.secondary}18` },
                  ]}
                >
                  <Ionicons
                    name="egg-outline"
                    size={15}
                    color={theme.secondary}
                  />
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{ color: theme.secondary }}
                  >
                    {formatQuantity(item.reserved_quantity)}{" "}
                    {item.unit_abbreviation}
                  </AppText>
                </View>
              </View>
              <View
                style={[
                  styles.reservedDeliveryAction,
                  { borderTopColor: theme.border },
                ]}
              >
                <AppText
                  size="small"
                  weight="semibold"
                  style={{ color: theme.primary }}
                >
                  Record delivery
                </AppText>
                <Ionicons
                  name="arrow-forward"
                  size={17}
                  color={theme.primary}
                />
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
      {!isVerified ? (
        <View
          style={[
            styles.incompletePanel,
            { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
          ]}
        >
          <View style={styles.attentionHeading}>
            <View style={styles.grow}>
              <AppText size="small" weight="semibold">Needs attention</AppText>
              <AppText size="small" tone="secondary">
                Resolve these items to verify profit.
              </AppText>
            </View>
            <View style={[styles.issueCount, { backgroundColor: `${theme.secondary}18` }]}>
              <AppText size="small" weight="semibold" style={{ color: theme.secondary }}>
                {issueCount}
              </AppText>
            </View>
          </View>
          {costMissingProducts.map((item) => (
            <View
              key={item.product_id}
              style={[
                styles.costIssue,
                { borderColor: theme.border, backgroundColor: theme.backgroundElement },
              ]}
            >
              <View style={styles.incompleteReasonCopy}>
                <AppText size="small" weight="semibold">
                  Missing estimated cost · {item.product_name}
                </AppText>
                <AppText size="small" tone="secondary">
                  {formatQuantityWithUnit(
                    item.uncosted_movement_quantity,
                    item.unit_abbreviation,
                    item.unit_name,
                  )}{" "}
                  {formatMovementTypes(item.uncosted_movement_types)} without cost
                </AppText>
              </View>
              <Button
                label="Enter estimated cost"
                style={styles.inlineAction}
                onPress={() =>
                  router.push({
                    pathname: "/reports/stock-costing",
                    params: {
                      productId: item.product_id,
                      from_date: report.from_date,
                      to_date: report.to_date,
                    },
                  })
                }
              />
            </View>
          ))}
          {report.egg_stock_reconciliation.map((item) => {
            const supported = Number(item.supported_quantity);
            const ledger = Number(item.ledger_quantity);
            const difference = Number(item.difference);
            return (
              <View
                key={item.product_id}
                style={[
                  styles.costIssue,
                  { borderColor: theme.border, backgroundColor: theme.backgroundElement },
                ]}
              >
                <View style={styles.incompleteReasonCopy}>
                  <AppText size="small" weight="semibold">
                    Egg stock mismatch · {item.product_name}
                  </AppText>
                  <AppText size="small" tone="secondary">
                    Collections, sales, returns and losses support {formatQuantityWithUnit(
                      supported,
                      item.unit_abbreviation,
                      item.unit_name,
                    )}; inventory ledger shows {formatQuantityWithUnit(
                      ledger,
                      item.unit_abbreviation,
                      item.unit_name,
                    )}. The ledger is {difference > 0 ? "short by" : "over by"} {formatQuantityWithUnit(
                      Math.abs(difference),
                      item.unit_abbreviation,
                      item.unit_name,
                    )}.
                  </AppText>
                </View>
                <Button
                  label="Inspect product stock"
                  variant="secondary"
                  style={styles.inlineAction}
                  onPress={() =>
                    router.push({
                      pathname: "/products/[productId]/inventory",
                      params: {
                        productId: item.product_id,
                        reportSupportedQuantity: item.supported_quantity,
                        reportLedgerQuantity: item.ledger_quantity,
                        reportAsOf: report.to_date,
                        reportFromDate: report.from_date,
                      },
                    } as Href)
                  }
                />
              </View>
            );
          })}
          {profitabilityGaps.map((gap) => (
            <View
              key={gap}
              style={[
                styles.incompleteReason,
                { borderColor: theme.border, backgroundColor: theme.backgroundElement },
              ]}
            >
              <Ionicons name="alert-circle-outline" size={16} color={theme.secondary} />
              <View style={styles.incompleteReasonCopy}>
                <AppText size="small" weight="semibold">
                  {gap}
                </AppText>
                <Button
                  label={
                    gap.toLowerCase().includes("egg production")
                      ? "Review expenses"
                      : gap.toLowerCase().includes("sale, use, or loss")
                        ? "Compare stock movements"
                        : "Review inventory"
                  }
                  variant="secondary"
                  style={styles.inlineAction}
                  onPress={() => {
                    if (gap.toLowerCase().includes("sale, use, or loss")) {
                      router.push({
                        pathname: "/reports/[report]",
                        params: {
                          report: "inventory",
                          from_date: report.from_date,
                          to_date: report.to_date,
                          issue_count: String(report.unvalued_period_movement_count),
                          missing_record_count: String(report.missing_inventory_record_count),
                        },
                      } as Href);
                    } else {
                      router.push(
                        reportHref(
                          gap.toLowerCase().includes("egg production")
                            ? "expenses"
                            : "inventory",
                          report.from_date,
                          report.to_date,
                        ),
                      );
                    }
                  }}
                />
              </View>
            </View>
          ))}
          {needsZeroCostConfirmation ? (
            <View style={styles.zeroCostAction}>
              <AppText size="small" tone="secondary">
                No feed use is recorded for this period. Confirm only if no production cost was incurred.
              </AppText>
              <Button
                label="Confirm zero production cost"
                loading={zeroCostConfirmation.isPending}
                style={styles.inlineAction}
                onPress={async () => {
                  const confirmed = await dialog.confirmDialog({
                    title: "Confirm no production cost",
                    message: `Confirm that no feed or other production cost was incurred from ${report.from_date} to ${report.to_date}.`,
                    note: "This records your confirmation for this report period. It does not create a stock-use record or change inventory.",
                    confirmLabel: "Confirm zero cost",
                    cancelLabel: "Go back",
                    tone: "warning",
                  });
                  if (!confirmed) return;
                  try {
                    await zeroCostConfirmation.mutateAsync({
                      from_date: report.from_date,
                      to_date: report.to_date,
                    });
                    await dialog.showDialog({
                      title: "Zero production cost confirmed",
                      message: "The report is being recalculated. Inventory quantities were not changed.",
                      tone: "success",
                    });
                  } catch (confirmationError: unknown) {
                    await dialog.showDialog({
                      title: "Couldn’t confirm zero cost",
                      message: normalizeApiError(confirmationError).message,
                      tone: "error",
                    });
                  }
                }}
              />
            </View>
          ) : null}
          {productsWithUnvaluedStock.map((item) => (
            <View
              key={item.product_id}
              style={[
                styles.costIssue,
                { borderColor: theme.border, backgroundColor: theme.backgroundElement },
              ]}
            >
              <View style={styles.incompleteReasonCopy}>
                <AppText size="small" weight="semibold">
                  Missing cost · {item.product_name}
                </AppText>
                <AppText size="small" tone="secondary">
                  {formatQuantityWithUnit(
                    item.unvalued_quantity,
                    item.unit_abbreviation,
                    item.unit_name,
                  )} on hand
                </AppText>
              </View>
              <Button
                label="Value current stock"
                variant="primary"
                style={styles.inlineAction}
                onPress={() =>
                  router.push({
                    pathname: "/reports/stock-costing",
                    params: {
                      productId: item.product_id,
                    },
                  })
                }
              />
            </View>
          ))}
          {Number(report.untracked_chicken_quantity) > 0 ? (
            <View style={styles.costIssue}>
              <AppText size="small" weight="semibold" style={styles.incompleteReasonCopy}>
                {formatQuantity(report.untracked_chicken_quantity)} chickens aren’t linked to an inventory product.
              </AppText>
              <Button
                label="Review flock"
                variant="secondary"
                style={styles.inlineAction}
                onPress={() => router.push(reportHref("flock", report.from_date, report.to_date))}
              />
            </View>
          ) : null}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showCalculationDetails }}
        onPress={() => setShowCalculationDetails((visible) => !visible)}
        style={[styles.calculationToggle, { borderTopColor: theme.border }]}
      >
        <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
          {showCalculationDetails
            ? "Hide calculation and product details"
            : "View calculation, product margins & stock value"}
        </AppText>
        <Ionicons
          name={showCalculationDetails ? "chevron-up" : "chevron-down"}
          size={17}
          color={theme.primary}
        />
      </Pressable>
      {showCalculationDetails ? (
        <View style={styles.calculationDetails}>
          {!isVerified ? (
            <View
              style={[
                styles.detailStatus,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <Ionicons name="information-circle-outline" size={16} color={theme.secondary} />
              <AppText size="small" tone="secondary" style={styles.grow}>
                Recorded costs only · result is not final
              </AppText>
            </View>
          ) : null}
          <View style={styles.detailSection}>
            <View style={styles.detailSectionHeading}>
              <AppText size="small" weight="semibold">PROFIT & LOSS</AppText>
              <AppText size="small" tone="secondary">
                {formatDateLabel(report.from_date)} – {formatDateLabel(report.to_date)}
              </AppText>
            </View>
            <View
              style={[
                styles.profitabilityBreakdown,
                { borderColor: theme.border },
              ]}
            >
              {rows.map((row, index) => (
                <ProfitabilityValueRow
                  key={row.label}
                  {...row}
                  showBorder={index > 0}
                  borderColor={theme.border}
                  formatAmount={formatAmount}
                />
              ))}
              {isVerified ? (
                <ProfitabilityValueRow
                  label="Net profit / (loss)"
                  value={report.net_profit ?? "0"}
                  strong
                  showBorder
                  borderColor={theme.border}
                  highlight={resultColor}
                  formatAmount={formatAmount}
                />
              ) : null}
            </View>
          </View>
          <View style={[styles.stockValuation, { borderTopColor: theme.border }]}>
            <View style={styles.detailSectionHeading}>
              <AppText size="small" weight="semibold">STOCK VALUE</AppText>
              <AppText size="small" tone="secondary">
                {formatDateLabel(report.closing_stock_as_of)}
              </AppText>
            </View>
            <View style={styles.stockTotalRow}>
              <AppText size="small" tone="secondary">Valued stock total</AppText>
              <AppText size="body" weight="semibold">
                {formatAmount(report.closing_stock_valued_cost)}
              </AppText>
            </View>
            <View style={styles.stockStatusRow}>
              <View
                style={[
                  styles.stockStatusBadge,
                  {
                    backgroundColor: `${productsWithUnvaluedStock.length ? theme.secondary : theme.success}18`,
                  },
                ]}
              >
                <Ionicons
                  name={productsWithUnvaluedStock.length ? "alert-circle-outline" : "checkmark-circle-outline"}
                  size={14}
                  color={productsWithUnvaluedStock.length ? theme.secondary : theme.success}
                />
                <AppText
                  size="small"
                  weight="semibold"
                  style={{ color: productsWithUnvaluedStock.length ? theme.secondary : theme.success }}
                >
                  {productsWithUnvaluedStock.length
                    ? `${productsWithUnvaluedStock.length} product${productsWithUnvaluedStock.length === 1 ? "" : "s"} not fully valued`
                    : "On-hand stock valued"}
                </AppText>
              </View>
            </View>
            {report.closing_stock.map((item) => (
              <View key={item.product_id} style={styles.stockValueRow}>
                <View style={styles.grow}>
                  <AppText size="small">{item.product_name}</AppText>
                  <AppText size="small" tone="secondary">
                    {formatQuantityWithUnit(item.quantity, item.unit_abbreviation, item.unit_name)} on hand
                    {Number(item.unvalued_quantity) > 0
                      ? ` · ${formatQuantityWithUnit(item.unvalued_quantity, item.unit_abbreviation, item.unit_name)} unvalued`
                      : ""}
                  </AppText>
                </View>
                <AppText size="small" weight="semibold">
                  {formatAmount(item.valued_cost)}
                </AppText>
              </View>
            ))}
            {Number(report.untracked_chicken_quantity) > 0 ? (
              <View style={styles.detailStatus}>
                <Ionicons name="alert-circle-outline" size={15} color={theme.secondary} />
                <AppText size="small" tone="secondary" style={styles.grow}>
                  {formatQuantityWithUnit(
                    report.untracked_chicken_quantity,
                    "pcs",
                    "chicken",
                  )} not linked to inventory
                </AppText>
                <Button
                  label="Review flock"
                  variant="secondary"
                  style={styles.inlineAction}
                  onPress={() => router.push(reportHref("flock", report.from_date, report.to_date))}
                />
              </View>
            ) : null}
          </View>
          <View style={[styles.methodNote, { backgroundColor: theme.backgroundSelected }]}>
            <Ionicons name="information-circle-outline" size={16} color={theme.primary} />
            <AppText size="small" tone="secondary" style={styles.grow}>
              Stock cost is recognized when items are sold, used or lost. Customer credits reduce sales.
            </AppText>
          </View>
        </View>
      ) : null}
    </Card>
  );
}
