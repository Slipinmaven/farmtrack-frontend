import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { AppText } from "@/components/ui/app-text";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { useChickenSaleOptions } from "@/features/chickens/hooks";
import { getEggCollections } from "@/features/eggs/api";
import { useEggCollectionOptions } from "@/features/eggs/hooks";
import { getFarmLogoUri } from "@/features/farms/logo";
import {
  getInventory,
  getAccountLedger,
  getExpenseSummary,
  getExpenses,
  getExpenseDisplayName,
  type Contact,
  type ContactRole,
  type ExpenseRecord,
  type AccountLedgerAccount,
  type AccountLedgerEvent,
  type InventoryMovement,
  type ProfitabilityProduct,
} from "@/features/management/api";
import {
  useAccountLedger,
  useContacts,
  useConfirmZeroEggProductionCost,
  useExpenseSummary,
  useInfiniteExpenses,
  useInventory,
  useProfitabilityReport,
} from "@/features/management/hooks";
import { ReportExportActions } from "@/features/reports/report-export-actions";
import type { ReportExportData } from "@/features/reports/export";
import {
  getComparisonRange,
  getEggProductionComparisonResult,
} from "@/features/reports/egg-production-comparison";
import {
  createEggProductionPdfHtml,
  formatEggsAndPacks,
  getEggProductionPdfFilename,
  type EggProductionPdfRecord,
} from "@/features/reports/egg-production-pdf";
import { buildInventoryReconciliation } from "@/features/reports/inventory-reconciliation";
import {
  getSalesReport,
  type SalesReport,
} from "@/features/sales/api";
import { useSalesReport } from "@/features/sales/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type ReportName = "sales" | "expenses" | "production" | "flock" | "inventory" | "accounts";

const titles: Record<ReportName, string> = {
  sales: "Sales report",
  expenses: "Expenses report",
  production: "Egg production report",
  flock: "Flock report",
  inventory: "Stock reconciliation",
  accounts: "Accounts report",
};

export default function ReportDetailRoute() {
  return (
    <SessionGate>
      <ReportDetailContent />
    </SessionGate>
  );
}

function ReportDetailContent() {
  const { report: reportParam } = useLocalSearchParams<{ report: string }>();
  const report = isReportName(reportParam) ? reportParam : null;
  const { theme } = useTheme();

  if (!report) {
    return (
      <ReportShell title="Report not found">
        <Card style={styles.card}>
          <AppText weight="semibold">This report is not available.</AppText>
          <Button label="Back to reports" onPress={() => router.replace("/reports")} />
        </Card>
      </ReportShell>
    );
  }

  return (
    <ReportShell
      title={report === "production" ? "Egg production" : titles[report]}
      report={report}
    >
      {report === "sales" ? <SalesReportDetail /> : null}
      {report === "expenses" ? <ExpensesReportDetail /> : null}
      {report === "production" ? <ProductionReportDetail /> : null}
      {report === "flock" ? <FlockReportDetail /> : null}
      {report === "inventory" ? <InventoryReportDetail /> : null}
      {report === "accounts" ? <AccountsReportDetail /> : null}
      {report !== "production" && report !== "accounts" ? (
        <AppText size="small" tone="secondary" style={{ color: theme.textSecondary }}>
          Figures reflect the records available for this farm.
        </AppText>
      ) : null}
    </ReportShell>
  );
}

function ReportShell({
  title,
  report,
  children,
}: {
  title: string;
  report?: ReportName;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function refreshReport() {
    setIsRefreshing(true);
    try {
      await queryClient.refetchQueries({ type: "active" });
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void refreshReport()}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <FarmPageHeader title={title} showBack backHref="/reports" />
        {report && !["inventory", "production", "expenses", "accounts"].includes(report) ? (
          <ReportIntro report={report} />
        ) : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function DateRange({
  fromDate,
  toDate,
  setRange,
  compact = false,
}: {
  fromDate: string;
  toDate: string;
  setRange: (fromDate: string, toDate: string) => void;
  compact?: boolean;
}) {
  const { theme } = useTheme();
  const [filtersOpen, setFiltersOpen] = useState(!compact);
  const [customRangeKey, setCustomRangeKey] = useState<string | null>(null);
  const rangeKey = `${fromDate}|${toDate}`;
  const activePreset = customRangeKey === rangeKey
    ? "custom"
    : identifyDatePreset(fromDate, toDate);
  const presets = [
    { key: "today", label: "Today" },
    { key: "week", label: "This week" },
    { key: "month", label: "This month" },
  ] as const;

  function choosePreset(preset: "today" | "week" | "month" | "all") {
    setCustomRangeKey(null);
    setRange(...getDateRangePreset(preset));
    if (compact) setFiltersOpen(false);
  }

  function chooseCustom() {
    setCustomRangeKey(rangeKey);
  }

  function setCustomFromDate(date: string) {
    setCustomRangeKey(`${date}|${toDate}`);
    setRange(date, toDate);
  }

  function setCustomToDate(date: string) {
    setCustomRangeKey(`${fromDate}|${date}`);
    setRange(fromDate, date);
  }

  return (
    <Card style={compact ? styles.compactPeriodCard : styles.periodCard}>
      {compact ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: filtersOpen }}
          onPress={() => setFiltersOpen((open) => !open)}
          style={styles.compactPeriodTrigger}
        >
          <View
            style={[
              styles.periodIcon,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <Ionicons name="calendar-outline" size={17} color={theme.primary} />
          </View>
          <View style={styles.periodCopy}>
            <AppText size="small" weight="semibold">
              {datePresetLabel(activePreset)}
            </AppText>
            <AppText size="small" tone="secondary">
              {formatDateRangeLabel(fromDate, toDate)}
            </AppText>
          </View>
          <Ionicons
            name={filtersOpen ? "chevron-up" : "chevron-down"}
            size={18}
            color={theme.textSecondary}
          />
        </Pressable>
      ) : (
        <View style={styles.periodHeading}>
          <View
            style={[
              styles.periodIcon,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <Ionicons name="calendar-outline" size={17} color={theme.primary} />
          </View>
          <View style={styles.periodCopy}>
            <AppText size="small" weight="semibold">Reporting period</AppText>
            <AppText size="small" tone="secondary">
              {formatDateRangeLabel(fromDate, toDate)}
            </AppText>
          </View>
        </View>
      )}
      {filtersOpen ? (
        <View style={styles.periodOptions}>
          <View style={styles.presetRow}>
            {presets.map((preset) => (
              <Pressable
                key={preset.key}
                accessibilityRole="button"
                accessibilityState={{ selected: activePreset === preset.key }}
                onPress={() => choosePreset(preset.key)}
                style={[
                  styles.presetButton,
                  {
                    backgroundColor: activePreset === preset.key
                      ? theme.primary
                      : theme.backgroundElement,
                    borderColor: activePreset === preset.key
                      ? theme.primary
                      : theme.border,
                  },
                ]}
              >
                <AppText
                  size="small"
                  weight="semibold"
                  numberOfLines={1}
                  style={{
                    color: activePreset === preset.key ? theme.onPrimary : theme.text,
                  }}
                >
                  {preset.label}
                </AppText>
              </Pressable>
            ))}
          </View>
          <View style={styles.presetRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: activePreset === "custom" }}
              onPress={chooseCustom}
              style={[
                styles.presetButton,
                {
                  backgroundColor: activePreset === "custom"
                    ? theme.primary
                    : theme.backgroundElement,
                  borderColor: activePreset === "custom" ? theme.primary : theme.border,
                },
              ]}
            >
              <AppText
                size="small"
                weight="semibold"
                style={{
                  color: activePreset === "custom" ? theme.onPrimary : theme.text,
                }}
              >
                Custom dates
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: activePreset === "all" }}
              onPress={() => choosePreset("all")}
              style={[
                styles.presetButton,
                {
                  backgroundColor: activePreset === "all"
                    ? theme.primary
                    : theme.backgroundElement,
                  borderColor: activePreset === "all" ? theme.primary : theme.border,
                },
              ]}
            >
              <AppText
                size="small"
                weight="semibold"
                style={{
                  color: activePreset === "all" ? theme.onPrimary : theme.text,
                }}
              >
                All dates
              </AppText>
            </Pressable>
          </View>
          {activePreset === "custom" ? (
            <View style={styles.dateRow}>
              <DatePickerField
                label="From"
                value={fromDate}
                onChange={setCustomFromDate}
                style={styles.dateField}
              />
              <DatePickerField
                label="To"
                value={toDate}
                onChange={setCustomToDate}
                style={styles.dateField}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function datePresetLabel(preset: DatePreset): string {
  switch (preset) {
    case "today": return "Today";
    case "week": return "This week";
    case "month": return "This month";
    case "all": return "All dates";
    case "custom": return "Custom dates";
  }
}

function useDateRange(todayValue = today()) {
  const params = useLocalSearchParams<{
    from_date?: string;
    to_date?: string;
  }>();
  const routeFromDate =
    params.from_date === undefined
      ? getDateRangeForDate("month", todayValue)[0]
      : params.from_date;
  const routeToDate =
    params.to_date === undefined ? todayValue : params.to_date;
  return {
    fromDate: routeFromDate,
    toDate: routeToDate,
    setRange: (fromDate: string, toDate: string) =>
      router.setParams({ from_date: fromDate, to_date: toDate }),
  };
}

type DatePreset = "today" | "week" | "month" | "custom" | "all";

function getDateRangePreset(preset: "today" | "week" | "month" | "all"): [string, string] {
  if (preset === "all") return ["", ""];
  return getDateRangeForDate(preset, today());
}

function getDateRangeForDate(
  preset: "today" | "week" | "month",
  end: string,
  weekStart = 1,
): [string, string] {
  if (preset === "today") return [end, end];
  if (preset === "month") return [`${end.slice(0, 7)}-01`, end];
  if (!Number.isInteger(weekStart) || weekStart < 0 || weekStart > 6) {
    return [end, end];
  }
  const start = new Date(`${end}T00:00:00Z`);
  const offset = (start.getUTCDay() - weekStart + 7) % 7;
  start.setUTCDate(start.getUTCDate() - offset);
  return [formatDate(start), end];
}

function identifyDatePreset(
  fromDate: string,
  toDate: string,
  todayValue = today(),
): DatePreset {
  if (!fromDate && !toDate) return "all";
  for (const preset of ["today", "week", "month"] as const) {
    const [presetFrom, presetTo] = getDateRangeForDate(preset, todayValue);
    if (fromDate === presetFrom && toDate === presetTo) return preset;
  }
  return "custom";
}

function SalesSummaryCard({
  summary,
  currency,
}: {
  summary: SalesReport["summary"];
  currency: string;
}) {
  const { theme } = useTheme();
  const difference = salesReconciliationDifference(summary);
  const reconciles = difference === 0;
  const reconciliationColor = reconciles ? theme.success : theme.danger;
  return (
    <Card style={styles.salesSummaryCard}>
      <View style={[styles.salesSummaryHero, { backgroundColor: theme.backgroundSelected }]}>
        <AppText size="small" weight="semibold" style={{ color: theme.text }}>
          Sales recorded
        </AppText>
        <AppText size="title" weight="semibold" style={{ color: theme.text }}>
          {money(summary.sales_total, currency)}
        </AppText>
        <AppText size="small" tone="secondary">
          Value of completed sales in this period, before receipts and adjustments.
        </AppText>
      </View>
      <View style={[styles.salesSummaryRows, { borderTopColor: theme.border }]}>
        <SalesSummaryRow
          label="Receipts received"
          value={money(summary.amount_received, currency)}
          theme={theme}
        />
        <SalesSummaryRow
          label="Balance due"
          value={money(summary.balance_due, currency)}
          theme={theme}
        />
        {Number(summary.return_credits) !== 0 ? (
          <SalesSummaryRow
            label="Sale return credits"
            value={money(summary.return_credits, currency)}
            theme={theme}
          />
        ) : null}
        {Number(summary.goods_settlements) !== 0 ? (
          <SalesSummaryRow
            label="Net goods: received (+) / provided (−)"
            value={money(summary.goods_settlements, currency)}
            theme={theme}
          />
        ) : null}
        {Number(summary.service_settlements) !== 0 ? (
          <SalesSummaryRow
            label="Net services: received (+) / provided (−)"
            value={money(summary.service_settlements, currency)}
            theme={theme}
          />
        ) : null}
        {Number(summary.customer_credit) !== 0 ? (
          <SalesSummaryRow
            label="Customer credit balances"
            value={money(summary.customer_credit, currency)}
            theme={theme}
          />
        ) : null}
        <SalesSummaryRow
          label="Completed transactions"
          value={String(summary.transaction_count)}
          theme={theme}
          last
        />
      </View>
      <View
        style={[
          styles.salesReconciliation,
          { borderColor: theme.border, backgroundColor: theme.background },
        ]}
      >
        <Ionicons
          name={reconciles ? "checkmark-circle-outline" : "alert-circle-outline"}
          size={19}
          color={reconciliationColor}
        />
        <View style={styles.salesReconciliationCopy}>
          <AppText size="small" weight="semibold">
            {difference === null
              ? "Reconciliation could not be verified"
              : reconciles
                ? "Totals reconcile"
                : "Reconciliation needs review"}
          </AppText>
          <AppText size="small" tone="secondary">
            Sales = receipts + due + returns + goods + services − credits
          </AppText>
          {difference !== null && !reconciles ? (
            <AppText size="small">
              Unmatched amount: {money(difference, currency)}
            </AppText>
          ) : null}
        </View>
      </View>
      <View style={styles.salesReconciliationLegend}>
        <AppText size="small" tone="secondary">
          Goods/services: + received by farm · − provided to customer.
        </AppText>
        <AppText size="small" tone="secondary">
          Receipts include net payments and cash settlements. Returns reduce sales; credits are overpayments.
        </AppText>
      </View>
    </Card>
  );
}

function SalesSummaryRow({
  label,
  value,
  theme,
  last = false,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>["theme"];
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.salesSummaryRow,
        !last ? { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth } : null,
      ]}
    >
      <AppText size="small" tone="secondary" style={styles.salesSummaryLabel}>
        {label}
      </AppText>
      <AppText
        size="small"
        weight="semibold"
        style={styles.salesSummaryValue}
      >
        {value}
      </AppText>
    </View>
  );
}

function SalesTransactionCard({
  item,
  currency,
  onPress,
}: {
  item: SalesReport["items"][number];
  currency: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const balanceDue = Number(item.balance_due);
  const creditBalance = Number(item.credit_balance);
  const customerName = formatCustomerDisplayName(item.customer_name);
  const statusAmount =
    balanceDue > 0
      ? ["Balance due", money(balanceDue, currency)] as [string, string]
      : creditBalance > 0
        ? ["Customer credit", money(creditBalance, currency)] as [string, string]
        : null;
  const accessibilityLabel = [
    `Sale for ${customerName}`,
    formatDateLabel(item.transaction_date),
    item.reference_number ? `reference ${item.reference_number}` : null,
    `total ${money(item.transaction_total, currency)}`,
    `net paid or settled ${money(item.amount_paid, currency)}`,
    statusAmount ? `${statusAmount[0]} ${statusAmount[1]}` : "settled",
    Number(item.return_credits) > 0
      ? `return credits ${money(item.return_credits, currency)}`
      : null,
    Number(item.goods_settlement) !== 0
      ? `net goods settlement ${money(item.goods_settlement, currency)}`
      : null,
    Number(item.service_settlement) !== 0
      ? `net service settlement ${money(item.service_settlement, currency)}`
      : null,
  ].filter(Boolean).join(". ");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens sale details"
      onPress={onPress}
      style={({ pressed }) => [
        styles.salesTransactionCard,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <View style={styles.recordHeading}>
        <View style={[styles.recordIcon, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name="document-text-outline" size={17} color={theme.primary} />
        </View>
        <View style={styles.recordTitleGroup}>
          <AppText weight="semibold" numberOfLines={2}>
            {customerName}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.primary} />
      </View>
      <AppText size="small" tone="secondary" style={styles.salesTransactionReference}>
        {formatDateLabel(item.transaction_date)}
        {item.reference_number ? ` · ${item.reference_number}` : ""}
      </AppText>
      <AppText size="small" tone="secondary" numberOfLines={2}>
        {item.product_names.join(", ") || "No item details"}
      </AppText>
      <View style={[styles.salesTransactionMetrics, { borderTopColor: theme.border }]}>
        <View style={styles.salesTransactionMetric}>
          <AppText size="small" tone="secondary">Sale total</AppText>
          <AppText size="small" weight="semibold" numberOfLines={2}>
            {money(item.transaction_total, currency)}
          </AppText>
        </View>
        <View style={styles.salesTransactionMetric}>
          <AppText size="small" tone="secondary">Net paid / settled</AppText>
          <AppText size="small" weight="semibold" numberOfLines={2}>
            {money(item.amount_paid, currency)}
          </AppText>
        </View>
      </View>
      {statusAmount ? (
        <View style={[styles.salesTransactionStatus, { borderTopColor: theme.border }]}>
          <Ionicons
            name={balanceDue > 0 ? "alert-circle-outline" : "wallet-outline"}
            size={16}
            color={balanceDue > 0 ? theme.danger : theme.secondary}
          />
          <AppText size="small" weight="semibold" style={styles.salesTransactionStatusLabel}>
            {statusAmount[0]}
          </AppText>
          <AppText size="small" weight="semibold">
            {statusAmount[1]}
          </AppText>
        </View>
      ) : (
        <View style={[styles.salesTransactionStatus, { borderTopColor: theme.border }]}>
          <Ionicons name="checkmark-circle-outline" size={16} color={theme.success} />
          <AppText size="small" weight="semibold" style={styles.salesTransactionStatusLabel}>
            Settled
          </AppText>
          <AppText size="small" tone="secondary">No amount due</AppText>
        </View>
      )}
      {Number(item.return_credits) > 0 ||
      Number(item.goods_settlement) !== 0 ||
      Number(item.service_settlement) !== 0 ? (
        <View style={[styles.salesTransactionAdjustments, { borderTopColor: theme.border }]}>
          {Number(item.return_credits) > 0 ? (
            <SalesSummaryRow
              label="Return credits"
              value={money(item.return_credits, currency)}
              theme={theme}
            />
          ) : null}
          {Number(item.goods_settlement) !== 0 ? (
            <SalesSummaryRow
              label="Net goods: received (+) / provided (−)"
              value={money(item.goods_settlement, currency)}
              theme={theme}
            />
          ) : null}
          {Number(item.service_settlement) !== 0 ? (
            <SalesSummaryRow
              label="Net services: received (+) / provided (−)"
              value={money(item.service_settlement, currency)}
              theme={theme}
              last
            />
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function salesReconciliationDifference(summary: SalesReport["summary"]): number | null {
  const sales = toCents(summary.sales_total);
  const receipts = toCents(summary.amount_received);
  const balance = toCents(summary.balance_due);
  const returnCredits = toCents(summary.return_credits);
  const goodsSettlements = toCents(summary.goods_settlements);
  const serviceSettlements = toCents(summary.service_settlements);
  const customerCredit = toCents(summary.customer_credit);
  if (
    sales === null ||
    receipts === null ||
    balance === null ||
    returnCredits === null ||
    goodsSettlements === null ||
    serviceSettlements === null ||
    customerCredit === null
  ) {
    return null;
  }
  return (
    sales -
    receipts -
    balance -
    returnCredits -
    goodsSettlements -
    serviceSettlements +
    customerCredit
  ) / 100;
}

function toCents(value: number | string): number | null {
  if (typeof value === "string" && !value.trim()) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

function GrossProfitSummary({
  products,
  currency,
  zeroEggCostConfirmed,
  zeroCostConfirmationAvailable,
}: {
  products: ProfitabilityProduct[];
  currency: string;
  zeroEggCostConfirmed: boolean;
  zeroCostConfirmationAvailable: boolean;
}) {
  const { theme } = useTheme();
  const statuses = products.map((item) =>
    getProductCostStatus(item, zeroEggCostConfirmed, zeroCostConfirmationAvailable),
  );
  const isComplete = products.every((item) => item.gross_profit !== null) && statuses.every(
    (status) =>
      status !== "incomplete" &&
      status !== "unverified" &&
      status !== "zero-unconfirmed",
  );
  const hasEstimate = statuses.includes("estimated");
  const total = isComplete
    ? products.reduce((sum, item) => sum + Number(item.gross_profit ?? 0), 0)
    : null;

  return (
    <Card
      style={[
        styles.grossProfitSummary,
        { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
      ]}
    >
      <View style={styles.grossProfitCopy}>
        <AppText size="small" weight="semibold">
          Gross profit before farm expenses
        </AppText>
        <AppText size="small" tone="secondary">
          {total === null
            ? "Unavailable until product costs are verified."
            : hasEstimate
              ? "Includes estimated stock costs."
              : "Sales less the cost of stock sold."}
        </AppText>
      </View>
      <AppText
        size="title"
        weight="semibold"
        style={[styles.grossProfitValue, { color: total === null ? theme.textSecondary : theme.text }]}
      >
        {total === null ? "Not verified" : money(total, currency)}
      </AppText>
    </Card>
  );
}

type ProductCostStatus =
  | "incomplete"
  | "unverified"
  | "estimated"
  | "zero-confirmed"
  | "zero-unconfirmed"
  | "complete";

function getProductCostStatus(
  item: ProfitabilityProduct,
  zeroEggCostConfirmed: boolean,
  zeroCostConfirmationAvailable = true,
): ProductCostStatus {
  if (Number(item.uncosted_quantity) > 0) return "incomplete";
  const zeroCostEgg =
    item.product_type === "eggs" &&
    Number(item.cost_of_goods_sold) === 0;
  if (zeroCostEgg && !zeroEggCostConfirmed) {
    return zeroCostConfirmationAvailable ? "zero-unconfirmed" : "unverified";
  }
  if (zeroCostEgg && zeroEggCostConfirmed) return "zero-confirmed";
  if (item.gross_profit === null) return "unverified";
  if (item.estimated_cost_used) return "estimated";
  return "complete";
}

function getProductCostBadge(status: ProductCostStatus): string {
  switch (status) {
    case "incomplete": return "Cost missing";
    case "unverified": return "Not verified";
    case "estimated": return "Estimate used";
    case "zero-confirmed": return "Zero cost confirmed";
    case "zero-unconfirmed": return "Cost not confirmed";
    case "complete": return "Recorded cost";
  }
}

function getProductCostStatusDescription(
  item: ProfitabilityProduct,
  status: ProductCostStatus,
): string {
  switch (status) {
    case "incomplete":
      return `Incomplete: ${formatQuantity(item.uncosted_quantity)} ${item.unit_abbreviation || item.unit_name} sold without a recorded cost`;
    case "unverified":
      return "Not verified; gross profit is unavailable";
    case "estimated":
      return "Includes estimated stock valuation";
    case "zero-confirmed":
      return "Zero egg-production cost explicitly confirmed";
    case "zero-unconfirmed":
      return "No production cost recorded for this period";
    case "complete":
      return "Complete from recorded stock costs";
  }
}

function getProductReportRows(
  item: ProfitabilityProduct,
  currency: string,
  expanded: boolean,
  zeroEggCostConfirmed: boolean,
  zeroCostConfirmationAvailable: boolean,
): [string, string][] {
  const unit = item.unit_abbreviation || item.unit_name;
  const costStatus = getProductCostStatus(
    item,
    zeroEggCostConfirmed,
    zeroCostConfirmationAvailable,
  );
  const verifiedProfit =
    costStatus === "incomplete" ||
    costStatus === "unverified" ||
    costStatus === "zero-unconfirmed"
      ? null
      : item.gross_profit;
  const summaryRows: [string, string][] = [
    ["Sales value", money(item.sales_value, currency)],
    [
      "Gross profit",
      verifiedProfit !== null
        ? money(verifiedProfit, currency)
        : costStatus === "zero-unconfirmed"
          ? "Cost not confirmed"
          : "Not verified",
    ],
  ];
  if (!expanded) return summaryRows;
  return [
    ...summaryRows,
    ["Net sales", money(item.net_sales, currency)],
    [
      "Cost status",
      costStatus === "incomplete"
        ? `${formatQuantity(item.uncosted_quantity)} ${unit} without a recorded cost`
        : costStatus === "zero-unconfirmed"
          ? "No cost recorded"
        : costStatus === "estimated"
          ? "Complete · estimated valuation used"
          : costStatus === "zero-confirmed"
            ? "Zero egg-production cost confirmed"
          : verifiedProfit !== null
            ? "Complete"
            : "Not verified",
    ],
    ...(Number(item.sales_credits) !== 0
      ? [["Return credits", money(item.sales_credits, currency)] as [string, string]]
      : []),
    ["Cost of sold stock", money(item.cost_of_goods_sold, currency)],
    ...(item.average_selling_price !== null
      ? [[
          "Average selling price / unit",
          money(item.average_selling_price, currency),
        ] as [string, string]]
      : []),
    ...(item.average_unit_cost !== null
      ? [[
          "Average recorded cost / unit",
          money(item.average_unit_cost, currency),
        ] as [string, string]]
      : []),
    ...(costStatus === "estimated"
      ? [["Cost basis", "Includes estimated stock valuation"] as [string, string]]
      : costStatus === "zero-confirmed"
        ? [["Egg production cost", "Zero cost confirmed for this period"] as [string, string]]
        : []),
  ];
}

function formatCustomerDisplayName(value: string | null): string {
  const name = value?.trim().replace(/\s+/g, " ");
  if (!name) return "Walk-in customer";
  if (name !== name.toLocaleUpperCase() && name !== name.toLocaleLowerCase()) {
    return name;
  }
  return name.toLocaleLowerCase().replace(/(^|[\s'-])([a-z])/g, (_match, separator: string, letter: string) =>
    `${separator}${letter.toLocaleUpperCase()}`,
  );
}

function SalesReportDetail() {
  const { user } = useAuth();
  const dialog = useAppDialog();
  const selectedFarm = useFarm().selectedFarm;
  const { theme } = useTheme();
  const farmId = selectedFarm?.id;
  const currency = selectedFarm?.settings?.currency ?? "KES";
  const range = useDateRange();
  const zeroCostConfirmation = useConfirmZeroEggProductionCost(
    user?.id ?? "",
    farmId ?? "",
  );
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(
    () => new Set(),
  );
  const summary = useSalesReport(user?.id, farmId, {
    from_date: range.fromDate || undefined,
    to_date: range.toDate || undefined,
    status: "completed",
    offset: 0,
    limit: 1,
  });
  const profitability = useProfitabilityReport(user?.id, farmId, {
    from_date: range.fromDate,
    to_date: range.toDate,
  });
  async function confirmZeroProductionCost() {
    const report = profitability.data;
    if (!report || !farmId) {
      await dialog.showDialog({
        title: "Could not confirm production cost",
        message: "The farm report is not ready. Refresh the report and try again.",
        tone: "error",
      });
      return;
    }
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
        title: "Could not confirm zero production cost",
        message: normalizeApiError(confirmationError).message,
        tone: "error",
      });
    }
  }
  const sales = useInfiniteQuery({
    queryKey: ["report-sales-list", user?.id, farmId, range.fromDate, range.toDate],
    queryFn: ({ pageParam }) => getSalesReport(farmId!, {
      from_date: range.fromDate || undefined,
      to_date: range.toDate || undefined,
      status: "completed",
      offset: pageParam,
      limit: 30,
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: SalesReport) =>
      lastPage.offset + lastPage.items.length < lastPage.total_count
        ? lastPage.offset + lastPage.limit
        : undefined,
    enabled: Boolean(user?.id && farmId),
  });
  const items = sales.data?.pages.flatMap((page) => page.items) ?? [];
  const createExportData = (
    records: SalesReport["items"],
    report: SalesReport,
  ): ReportExportData => ({
    title: "Sales report",
    farmName: selectedFarm?.name ?? "FarmTrack",
    farmLogoUri: getFarmLogoUri(selectedFarm?.settings?.logo_path),
    currencyCode: currency,
    fromDate: range.fromDate,
    toDate: range.toDate,
    charts: report.summary.monthly.length
      ? [{
          title: "Monthly sales trend",
          categories: report.summary.monthly.map((month) => month.month),
          series: [
            {
              name: "Sales",
              values: report.summary.monthly.map((month) => Number(month.sales_total)),
              color: "#20745b",
            },
            {
              name: "Receipts",
              values: report.summary.monthly.map((month) => Number(month.amount_received)),
              color: "#d39735",
            },
          ],
        }]
      : [],
    summary: [
      { label: "Sales recorded", value: Number(report.summary.sales_total), kind: "currency" },
      { label: "Receipts received", value: Number(report.summary.amount_received), kind: "currency" },
      { label: "Balance due", value: Number(report.summary.balance_due), kind: "currency" },
      { label: "Sale return credits", value: Number(report.summary.return_credits), kind: "currency" },
      { label: "Net goods: received (+) / provided (-)", value: Number(report.summary.goods_settlements), kind: "currency" },
      { label: "Net services: received (+) / provided (-)", value: Number(report.summary.service_settlements), kind: "currency" },
      { label: "Customer credit balances", value: Number(report.summary.customer_credit), kind: "currency" },
      { label: "Completed transactions", value: report.summary.transaction_count, kind: "number" },
    ],
    sheets: [
      {
        name: "Sales records",
        columns: [
          { key: "date", label: "Date", kind: "date" },
          { key: "reference", label: "Reference" },
          { key: "customer", label: "Customer" },
          { key: "products", label: "Products" },
          { key: "categories", label: "Categories" },
          { key: "total", label: `Total (${currency})`, kind: "currency" },
          { key: "paid", label: `Net paid / settled (${currency})`, kind: "currency" },
          { key: "balance", label: `Balance due (${currency})`, kind: "currency" },
          { key: "credit", label: `Credit balance (${currency})`, kind: "currency" },
          { key: "returnCredits", label: `Return credits (${currency})`, kind: "currency" },
          { key: "goodsSettlement", label: `Net goods: received (+) / provided (-) (${currency})`, kind: "currency" },
          { key: "serviceSettlement", label: `Net services: received (+) / provided (-) (${currency})`, kind: "currency" },
        ],
        rows: records.map((item) => ({
          date: item.transaction_date,
          reference: item.reference_number,
          customer: formatCustomerDisplayName(item.customer_name),
          products: item.products_sold
            .map((product) =>
              `${product.name} (${formatQuantity(product.quantity)}${product.unit_name ? ` ${product.unit_name}` : ""})`,
            )
            .join("; "),
          categories: item.categories.join(", "),
          total: Number(item.transaction_total),
          paid: Number(item.amount_paid),
          balance: Number(item.balance_due),
          credit: Number(item.credit_balance),
          returnCredits: Number(item.return_credits),
          goodsSettlement: Number(item.goods_settlement),
          serviceSettlement: Number(item.service_settlement),
        })),
        totals: true,
      },
      {
        name: "Monthly trend",
        columns: [
          { key: "month", label: "Month" },
          { key: "transactions", label: "Transactions", kind: "number" },
          { key: "sales", label: `Sales (${currency})`, kind: "currency" },
          { key: "received", label: `Receipts (${currency})`, kind: "currency" },
          { key: "balanceDue", label: `Balance due (${currency})`, kind: "currency" },
          { key: "returnCredits", label: `Return credits (${currency})`, kind: "currency" },
          { key: "goodsSettlements", label: `Net goods: received (+) / provided (-) (${currency})`, kind: "currency" },
          { key: "serviceSettlements", label: `Net services: received (+) / provided (-) (${currency})`, kind: "currency" },
          { key: "customerCredit", label: `Customer credit balances (${currency})`, kind: "currency" },
        ],
        rows: report.summary.monthly.map((month) => ({
          month: month.month,
          transactions: month.transaction_count,
          sales: Number(month.sales_total),
          received: Number(month.amount_received),
          balanceDue: Number(month.balance_due),
          returnCredits: Number(month.return_credits),
          goodsSettlements: Number(month.goods_settlements),
          serviceSettlements: Number(month.service_settlements),
          customerCredit: Number(month.customer_credit),
        })),
        totals: true,
      },
      {
        name: "Product sales margin",
        columns: [
          { key: "product", label: "Product" },
          { key: "quantity", label: "Quantity sold", kind: "number" },
          { key: "unit", label: "Base unit" },
          { key: "sales", label: `Sales value (${currency})`, kind: "currency" },
          { key: "averageSelling", label: `Average selling price (${currency}/unit)`, kind: "currency" },
          { key: "credits", label: `Return credits (${currency})`, kind: "currency" },
          { key: "netSales", label: `Net sales (${currency})`, kind: "currency" },
          { key: "cost", label: `Cost of sold stock (${currency})`, kind: "currency" },
          { key: "averageCost", label: `Average recorded unit cost (${currency}/unit)`, kind: "currency" },
          { key: "profit", label: `Gross profit before farm expenses (${currency})`, kind: "currency" },
          { key: "costStatus", label: "Cost check" },
        ],
        rows: (profitability.data?.product_performance ?? []).map((item) => {
          const costStatus = getProductCostStatus(
            item,
            profitability.data?.egg_production_zero_cost_confirmed ?? false,
            profitability.data?.egg_production_zero_cost_confirmation_available ?? false,
          );
          return {
            product: item.product_name,
            quantity: Number(item.quantity_sold),
            unit: item.unit_abbreviation || item.unit_name,
            sales: Number(item.sales_value),
            averageSelling:
              item.average_selling_price === null
                ? null
                : Number(item.average_selling_price),
            credits: Number(item.sales_credits),
            netSales: Number(item.net_sales),
            cost: Number(item.cost_of_goods_sold),
            averageCost:
              item.average_unit_cost === null
                ? null
                : Number(item.average_unit_cost),
            profit: item.gross_profit === null ? null : Number(item.gross_profit),
            costStatus: getProductCostStatusDescription(item, costStatus),
          };
        }),
        totals: true,
        totalColumns: ["quantity", "sales", "credits", "netSales", "cost"],
      },
      {
        name: "How product costs are valued",
        columns: [
          { key: "topic", label: "Topic" },
          { key: "explanation", label: "Explanation" },
        ],
        rows: [
          {
            topic: "Cost of sold stock",
            explanation:
              "Uses the same moving weighted-average inventory ledger as the profit-and-loss calculation. Recorded purchase costs, opening-stock valuations (including estimates flagged in the cost check), and allocated egg-production costs flow into this value as stock is sold.",
          },
          {
            topic: "Gross profit",
            explanation:
              "Net sales less the recorded cost of stock sold. It is before operating expenses, unallocated consumption, and inventory losses.",
          },
          {
            topic: "Unverified costs",
            explanation:
              "If any quantity sold has no recorded ledger cost, product gross profit is unavailable rather than guessed. Resolve the stock-cost gap before treating that margin as final.",
          },
          {
            topic: "Estimated stock valuations",
            explanation:
              "A product is flagged when its cost includes an estimated stock valuation. Its gross profit is calculated from that valuation and should be treated as an estimate, not a fully recorded cost.",
          },
          {
            topic: "Confirmed zero egg cost",
            explanation:
              "Egg products show zero stock cost only when no production cost was recorded and the user explicitly confirmed zero cost for this report period. The confirmation is identified on the product.",
          },
        ],
      },
    ],
  });

  async function resolveAllSales(): Promise<ReportExportData> {
    if (!farmId) throw new Error("Select a farm before exporting this report.");
    const records: SalesReport["items"] = [];
    let offset = 0;
    let report: SalesReport | undefined;
    do {
      report = await getSalesReport(farmId, {
        from_date: range.fromDate || undefined,
        to_date: range.toDate || undefined,
        status: "completed",
        offset,
        limit: 100,
      });
      records.push(...report.items);
      offset += report.items.length;
    } while (report.items.length > 0 && offset < report.total_count);
    return createExportData(records, report!);
  }

  return (
    <>
      {summary.data && profitability.data ? (
        <View style={styles.exportToolbar}>
          <ReportExportActions
            data={createExportData(items, summary.data)}
            resolveData={resolveAllSales}
            label="Export"
          />
        </View>
      ) : null}
      {summary.data && profitability.isLoading ? (
        <AppText size="small" tone="secondary">
          Preparing product cost and margin details…
        </AppText>
      ) : null}
      {profitability.isError ? (
        <QueryError
          error={profitability.error}
          retry={() => void profitability.refetch()}
        />
      ) : null}
      <DateRange {...range} />
      {summary.isLoading ? <LoadingState label="Loading sales summary" /> : null}
      {summary.isError ? <QueryError error={summary.error} retry={() => void summary.refetch()} /> : null}
      {summary.data ? (
        <SalesSummaryCard summary={summary.data.summary} currency={currency} />
      ) : null}
      {profitability.data?.product_performance.length ? (
        <>
          <GrossProfitSummary
            products={profitability.data.product_performance}
            currency={currency}
            zeroEggCostConfirmed={profitability.data.egg_production_zero_cost_confirmed}
            zeroCostConfirmationAvailable={
              profitability.data.egg_production_zero_cost_confirmation_available
            }
          />
          <SectionTitle
            title="Product sales and gross profit"
            detail="Per-product cost and margin details."
          />
          {profitability.data.product_performance.map((item) => {
            const zeroEggCostConfirmed =
              profitability.data.egg_production_zero_cost_confirmed;
            const zeroCostConfirmationAvailable =
              profitability.data.egg_production_zero_cost_confirmation_available;
            const costStatus = getProductCostStatus(
              item,
              zeroEggCostConfirmed,
              zeroCostConfirmationAvailable,
            );
            return (
              <RecordCard
                key={item.product_id}
                title={item.product_name}
                subtitle={`${formatQuantity(item.quantity_sold)} ${item.unit_abbreviation || item.unit_name} sold`}
                badgeLabel={getProductCostBadge(costStatus)}
                badgeColor={
                  costStatus === "incomplete" || costStatus === "zero-unconfirmed"
                    ? theme.danger
                    : costStatus === "complete" || costStatus === "zero-confirmed"
                      ? theme.success
                      : theme.textSecondary
                }
                expanded={expandedProducts.has(item.product_id)}
                onPress={() => {
                  setExpandedProducts((current) => {
                    const next = new Set(current);
                    if (next.has(item.product_id)) next.delete(item.product_id);
                    else next.add(item.product_id);
                    return next;
                  });
                }}
                rows={getProductReportRows(
                  item,
                  currency,
                  expandedProducts.has(item.product_id),
                  zeroEggCostConfirmed,
                  zeroCostConfirmationAvailable,
                )}
              />
            );
          })}
          {profitability.data.egg_production_zero_cost_confirmation_available &&
          !profitability.data.egg_production_zero_cost_confirmed ? (
            <Card style={styles.zeroCostConfirmationCard}>
              <View style={styles.zeroCostConfirmationCopy}>
                <AppText size="small" weight="semibold">
                  Egg production cost is not confirmed
                </AppText>
                <AppText size="small" tone="secondary">
                  Confirm only if no feed or other production cost was incurred in this period.
                </AppText>
              </View>
              <Button
                label={
                  zeroCostConfirmation.isPending
                    ? "Confirming…"
                    : "Review and confirm zero cost"
                }
                loading={zeroCostConfirmation.isPending}
                onPress={() => void confirmZeroProductionCost()}
              />
            </Card>
          ) : null}
          <AppText size="small" tone="secondary">
            Gross profit is before farm expenses. Estimates are labeled; unverified costs are withheld.
          </AppText>
        </>
      ) : null}
      <SectionTitle title="Completed sales" detail={`${sales.data?.pages[0]?.total_count ?? 0} records`} />
      {sales.isLoading ? <LoadingState label="Loading sales" /> : null}
      {sales.isError ? <QueryError error={sales.error} retry={() => void sales.refetch()} /> : null}
      {items.map((item) => (
        <SalesTransactionCard
          key={item.id}
          item={item}
          currency={currency}
          onPress={() => router.push(`/sales/${item.id}` as Href)}
        />
      ))}
      {sales.hasNextPage ? (
        <Button label={sales.isFetchingNextPage ? "Loading…" : "Load more sales"} variant="secondary" onPress={() => void sales.fetchNextPage()} />
      ) : null}
      {!sales.isLoading && items.length === 0 ? <EmptyState message="No completed sales in this period." /> : null}
    </>
  );
}

function ExpensesReportDetail() {
  const { user } = useAuth();
  const selectedFarm = useFarm().selectedFarm;
  const { theme } = useTheme();
  const farmId = selectedFarm?.id;
  const currency = selectedFarm?.settings?.currency ?? "KES";
  const range = useDateRange();
  const [expenseSearch, setExpenseSearch] = useState("");
  const [debouncedExpenseSearch, setDebouncedExpenseSearch] = useState("");
  const [expenseStatus, setExpenseStatus] = useState<
    "all" | "unpaid" | "partial" | "paid" | "cancelled"
  >("all");
  const [expenseCategory, setExpenseCategory] = useState("");
  useEffect(() => {
    const timeout = setTimeout(
      () => setDebouncedExpenseSearch(expenseSearch.trim()),
      250,
    );
    return () => clearTimeout(timeout);
  }, [expenseSearch]);
  const summary = useExpenseSummary(user?.id, farmId, {
    from_date: range.fromDate || undefined,
    to_date: range.toDate || undefined,
  });
  const expenses = useInfiniteExpenses(user?.id, farmId, {
    search: debouncedExpenseSearch || undefined,
    category: expenseCategory || undefined,
    payment_status: expenseStatus,
    from_date: range.fromDate || undefined,
    to_date: range.toDate || undefined,
  });
  const items = expenses.data?.pages.flatMap((page) => page.items) ?? [];
  const selectedExpenseCategory = summary.data?.categories.find(
    (category) => category.key === expenseCategory,
  );
  const createExportData = (
    records: ExpenseRecord[],
    reportSummary: NonNullable<typeof summary.data>,
  ): ReportExportData => {
    const activeRecords = records.filter((item) => item.payment_status !== "cancelled");
    const filteredTotal = activeRecords.reduce((sum, item) => sum + Number(item.amount), 0);
    const filteredPaid = activeRecords.reduce((sum, item) => sum + Number(item.amount_paid), 0);
    const filteredDue = activeRecords.reduce((sum, item) => sum + Number(item.balance_due), 0);
    const statusLabels = {
      all: "All statuses",
      unpaid: "Unpaid",
      partial: "Part paid",
      paid: "Paid",
      cancelled: "Cancelled",
    } as const;
    const categories = [...reportSummary.categories]
      .sort((a, b) => Number(b.total_amount) - Number(a.total_amount));
    const totalAmount = Number(reportSummary.total_amount);

    return {
      title: "Expenses report",
      farmName: selectedFarm?.name ?? "FarmTrack",
      farmLogoUri: getFarmLogoUri(selectedFarm?.settings?.logo_path),
      currencyCode: currency,
      fromDate: range.fromDate,
      toDate: range.toDate,
      periodLabel: "All recorded expenses (all dates)",
      summary: [
        {
          label: "Scope",
          value: "Period totals and category breakdown cover all expenses in the selected dates. Expense and payment detail sheets use the selected status, category, and search filters.",
        },
        { label: "Period spending", value: totalAmount, kind: "currency" },
        { label: "Paid in period", value: Number(reportSummary.amount_paid), kind: "currency" },
        { label: "Still to pay in period", value: Number(reportSummary.balance_due), kind: "currency" },
        { label: "Expenses in period", value: reportSummary.expense_count, kind: "number" },
        { label: "Expense status filter", value: statusLabels[expenseStatus] },
        { label: "Category filter", value: selectedExpenseCategory?.name ?? "All categories" },
        { label: "Search filter", value: debouncedExpenseSearch || "None" },
        { label: "Records matching filters", value: records.length, kind: "number" },
        { label: "Filtered active expense total", value: filteredTotal, kind: "currency" },
        { label: "Filtered active amount paid", value: filteredPaid, kind: "currency" },
        { label: "Filtered active balance due", value: filteredDue, kind: "currency" },
      ],
      sheets: [
        {
          name: "Filtered expenses",
          columns: [
            { key: "date", label: "Date", kind: "date" },
            { key: "expense", label: "Expense" },
            { key: "category", label: "Category" },
            { key: "payee", label: "Payee" },
            { key: "total", label: `Total (${currency})`, kind: "currency" },
            { key: "paid", label: `Paid (${currency})`, kind: "currency" },
            { key: "due", label: `Still due (${currency})`, kind: "currency" },
            { key: "status", label: "Status" },
          ],
          rows: records.map((item) => ({
            date: item.expense_date,
            expense: getExpenseDisplayName(item),
            category: item.category_name,
            payee: item.contact_name ?? "Not specified",
            total: Number(item.amount),
            paid: Number(item.amount_paid),
            due: Number(item.balance_due),
            status: item.payment_status === "partial"
              ? "Part paid"
              : item.payment_status === "unpaid"
                ? "Unpaid"
                : item.payment_status === "cancelled"
                  ? "Cancelled"
                  : "Paid",
          })),
        },
        {
          name: "Category breakdown",
          columns: [
            { key: "category", label: "Category" },
            { key: "records", label: "Expenses", kind: "number" },
            { key: "share", label: "Share of period (%)", kind: "number" },
            { key: "total", label: `Total (${currency})`, kind: "currency" },
            { key: "paid", label: `Paid (${currency})`, kind: "currency" },
            { key: "due", label: `Still due (${currency})`, kind: "currency" },
          ],
          rows: categories.map((category) => ({
            category: category.name,
            records: category.expense_count,
            share: totalAmount > 0
              ? Number(((Number(category.total_amount) / totalAmount) * 100).toFixed(1))
              : 0,
            total: Number(category.total_amount),
            paid: Number(category.amount_paid),
            due: Number(category.balance_due),
          })),
          totalColumns: ["records", "total", "paid", "due"],
        },
        {
          name: "References and notes",
          columns: [
            { key: "date", label: "Date", kind: "date" },
            { key: "expense", label: "Expense" },
            { key: "block", label: "Block" },
            { key: "receipt", label: "Receipt reference" },
            { key: "purchase", label: "Purchase reference" },
            { key: "notes", label: "Notes" },
          ],
          rows: records.map((item) => ({
            date: item.expense_date,
            expense: getExpenseDisplayName(item),
            block: item.block_name,
            receipt: item.receipt_reference,
            purchase: item.purchase_reference,
            notes: item.notes,
          })),
        },
        {
          name: "Payments and refunds",
          columns: [
            { key: "expense", label: "Expense" },
            { key: "date", label: "Payment date", kind: "date" },
            { key: "type", label: "Entry type" },
            { key: "impact", label: `Cash impact (${currency})`, kind: "currency" },
            { key: "method", label: "Payment method" },
            { key: "reference", label: "Reference" },
            { key: "notes", label: "Notes" },
          ],
          rows: records.flatMap((item) =>
            item.payments.map((payment) => ({
              expense: getExpenseDisplayName(item),
              date: payment.payment_date,
              type: payment.kind === "refund" ? "Refund" : "Payment",
              impact: (payment.kind === "refund" ? -1 : 1) * Number(payment.amount),
              method: formatPaymentMethod(payment.payment_method),
              reference: payment.reference_number,
              notes: payment.reason,
            })),
          ),
        },
      ],
    };
  };

  async function resolveAllExpenses(): Promise<ReportExportData> {
    if (!farmId) throw new Error("Select a farm before exporting this report.");
    const [reportSummary, firstPage] = await Promise.all([
      getExpenseSummary(farmId, {
        from_date: range.fromDate || undefined,
        to_date: range.toDate || undefined,
      }),
      getExpenses(farmId, {
        search: debouncedExpenseSearch || undefined,
        category: expenseCategory || undefined,
        payment_status: expenseStatus,
        from_date: range.fromDate || undefined,
        to_date: range.toDate || undefined,
        offset: 0,
        limit: 100,
      }),
    ]);
    const records = [...firstPage.items];
    let offset = firstPage.items.length;
    let page = firstPage;
    while (page.items.length > 0 && offset < page.total_count) {
      page = await getExpenses(farmId, {
        search: debouncedExpenseSearch || undefined,
        category: expenseCategory || undefined,
        payment_status: expenseStatus,
        from_date: range.fromDate || undefined,
        to_date: range.toDate || undefined,
        offset,
        limit: 100,
      });
      records.push(...page.items);
      offset += page.items.length;
    }
    return createExportData(records, reportSummary);
  }

  return (
    <>
      <DateRange {...range} />
      {summary.data ? (
        <View style={styles.expenseExportToolbar}>
          <ReportExportActions
            data={createExportData(items, summary.data)}
            resolveData={resolveAllExpenses}
            label="Export report"
          />
        </View>
      ) : null}
      {summary.isLoading ? <LoadingState label="Loading expense summary" /> : null}
      {summary.isError ? <QueryError error={summary.error} retry={() => void summary.refetch()} /> : null}
      {summary.data ? (
        <>
          <View style={[styles.expenseSummary, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.expenseSummaryHeading}>
              <View style={styles.expenseSummaryCopy}>
                <AppText size="small" weight="semibold" tone="secondary">
                  SPENT IN THIS PERIOD
                </AppText>
                <AppText size="title" weight="semibold" style={[styles.expenseSummaryTotal, { color: theme.text }]}>
                  {money(summary.data.total_amount, currency)}
                </AppText>
              </View>
              <View style={[styles.expenseRecordCount, { backgroundColor: theme.backgroundSelected }]}>
                <AppText size="small" weight="semibold">
                  {summary.data.expense_count} {summary.data.expense_count === 1 ? "record" : "records"}
                </AppText>
              </View>
            </View>
            <View style={[styles.expensePaymentSummary, { borderTopColor: theme.border }]}>
              <View style={styles.expensePaymentMetric}>
                <View style={styles.expensePaymentLabel}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={theme.success} />
                  <AppText size="small" tone="secondary">Paid</AppText>
                </View>
                <AppText size="body" weight="semibold" style={{ color: theme.success }}>
                  {money(summary.data.amount_paid, currency)}
                </AppText>
              </View>
              <View style={[styles.expensePaymentMetric, styles.expenseOutstandingMetric, { borderLeftColor: theme.border }]}>
                <View style={styles.expensePaymentLabel}>
                  <Ionicons
                    name={Number(summary.data.balance_due) > 0 ? "alert-circle-outline" : "checkmark-circle-outline"}
                    size={16}
                    color={Number(summary.data.balance_due) > 0 ? theme.danger : theme.success}
                  />
                  <AppText size="small" tone="secondary">Still to pay</AppText>
                </View>
                <AppText
                  size="body"
                  weight="semibold"
                  style={{ color: Number(summary.data.balance_due) > 0 ? theme.danger : theme.success }}
                >
                  {money(summary.data.balance_due, currency)}
                </AppText>
              </View>
            </View>
          </View>

          <View style={styles.expenseSectionHeading}>
            <View style={styles.expenseSectionCopy}>
              <AppText size="body" weight="semibold">Where the money went</AppText>
              <AppText size="small" tone="secondary">Categories ranked by total spending. Tap one to filter records.</AppText>
            </View>
            {expenseCategory ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setExpenseCategory("")}
                style={styles.expenseClearCategory}
              >
                <AppText size="small" weight="semibold" style={{ color: theme.primary }}>Clear</AppText>
              </Pressable>
            ) : null}
          </View>
          <View style={[styles.expenseCategoryList, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            {[...summary.data.categories]
              .sort((a, b) => Number(b.total_amount) - Number(a.total_amount))
              .map((category, index) => {
                const totalAmount = Number(category.total_amount);
                const paidAmount = Number(category.amount_paid);
                const dueAmount = Number(category.balance_due);
                const share = summary.data.total_amount
                  ? (totalAmount / Number(summary.data.total_amount)) * 100
                  : 0;
                const selected = expenseCategory === category.key;
                return (
                  <Pressable
                    key={category.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setExpenseCategory(selected ? "" : category.key)}
                    style={[
                      styles.expenseCategoryRow,
                      index < summary.data.categories.length - 1
                        ? { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }
                        : null,
                      selected ? { backgroundColor: theme.backgroundSelected } : null,
                    ]}
                  >
                    <View style={styles.expenseCategoryHeading}>
                      <View style={styles.expenseCategoryName}>
                        <AppText size="small" weight="semibold">{category.name}</AppText>
                        <AppText size="small" tone="secondary">
                          {category.expense_count} {category.expense_count === 1 ? "expense" : "expenses"} · {formatQuantity(share)}% of total
                        </AppText>
                      </View>
                      <AppText size="small" weight="semibold" style={styles.expenseCategoryTotal}>
                        {money(category.total_amount, currency)}
                      </AppText>
                    </View>
                    <View style={[styles.expenseCategoryTrack, { backgroundColor: theme.backgroundSelected }]}>
                      <View
                        style={[
                          styles.expenseCategoryFill,
                          {
                            width: `${Math.min(share, 100)}%`,
                            backgroundColor: theme.primary,
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.expenseCategoryPaymentLine}>
                      <AppText size="small" tone="secondary">Paid {money(paidAmount, currency)}</AppText>
                      <AppText
                        size="small"
                        weight={dueAmount > 0 ? "semibold" : undefined}
                        style={{ color: dueAmount > 0 ? theme.danger : theme.textSecondary }}
                      >
                        Due {money(dueAmount, currency)}
                      </AppText>
                    </View>
                  </Pressable>
                );
              })}
            {summary.data.categories.length === 0 ? (
              <AppText size="small" tone="secondary" style={styles.expenseCategoryEmpty}>
                No expenses were recorded in this period.
              </AppText>
            ) : null}
          </View>
        </>
      ) : null}
      <View style={styles.expenseRecordsHeading}>
        <View style={styles.expenseSectionCopy}>
          <AppText size="body" weight="semibold">Expense records</AppText>
          <AppText size="small" tone="secondary">
            {expenses.data?.pages[0]?.total_count ?? 0} matching records
            {expenseCategory
              ? ` · ${summary.data?.categories.find((item) => item.key === expenseCategory)?.name ?? "Selected category"}`
              : ""}
          </AppText>
        </View>
      </View>
      <View style={[styles.expenseSearch, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
        <TextInput
          accessibilityLabel="Search expenses"
          placeholder="Search expense, payee, category or reference"
          placeholderTextColor={theme.textSecondary}
          value={expenseSearch}
          onChangeText={setExpenseSearch}
          style={[styles.expenseSearchInput, { color: theme.text }]}
          returnKeyType="search"
        />
        {expenseSearch ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear expense search"
            onPress={() => setExpenseSearch("")}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={19} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.expenseStatusFilters}
      >
        {([
          ["all", "All"],
          ["unpaid", "Unpaid"],
          ["partial", "Part paid"],
          ["paid", "Paid"],
          ["cancelled", "Cancelled"],
        ] as const).map(([status, label]) => {
          const selected = expenseStatus === status;
          const color = status === "unpaid"
            ? theme.danger
            : status === "partial"
              ? theme.secondary
              : status === "paid"
                ? theme.success
                : theme.primary;
          return (
            <Pressable
              key={status}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setExpenseStatus(status)}
              style={[
                styles.expenseStatusChip,
                {
                  backgroundColor: selected ? (status === "all" ? theme.primary : `${color}18`) : theme.backgroundElement,
                  borderColor: selected ? color : theme.border,
                },
              ]}
            >
              <AppText
                size="small"
                weight="semibold"
                style={{ color: selected ? (status === "all" ? theme.onPrimary : color) : theme.textSecondary }}
              >
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
      {expenses.isLoading ? <LoadingState label="Loading expenses" /> : null}
      {expenses.isError ? <QueryError error={expenses.error} retry={() => void expenses.refetch()} /> : null}
      {items.map((item) => (
        <ExpenseReportRecord
          key={item.id}
          expense={item}
          currency={currency}
        />
      ))}
      {expenses.hasNextPage ? (
        <Button
          label={expenses.isFetchingNextPage ? "Loading expenses…" : "Load more expenses"}
          variant="secondary"
          loading={expenses.isFetchingNextPage}
          onPress={() => void expenses.fetchNextPage()}
        />
      ) : null}
      {!expenses.isLoading && !expenses.isError && items.length === 0 ? (
        <EmptyState message={expenseSearch || expenseCategory || expenseStatus !== "all"
          ? "No expenses match these filters. Try changing your search or filters."
          : "No expenses recorded in this period."} />
      ) : null}
    </>
  );
}

function ReportIntro({ report }: { report: ReportName }) {
  const { theme } = useTheme();
  const descriptions: Record<ReportName, string> = {
    sales: "Completed sales, payments received and customer balances.",
    expenses: "Spending by category, payment status and individual expense.",
    production: "Egg collections and opening stock recorded for this period.",
    flock: "Current bird counts by batch and housing capacity.",
    inventory: "Product balances on hand and the movements behind them.",
    accounts: "Supplier and customer transactions with balances due.",
  };
  const icons: Record<ReportName, keyof typeof Ionicons.glyphMap> = {
    sales: "trending-up-outline",
    expenses: "receipt-outline",
    production: "egg-outline",
    flock: "leaf-outline",
    inventory: "cube-outline",
    accounts: "people-outline",
  };

  return (
    <View
      style={[
        styles.reportIntro,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}
    >
      <View
        style={[
          styles.reportIntroIcon,
          { backgroundColor: theme.backgroundSelected },
        ]}
      >
        <Ionicons name={icons[report]} size={19} color={theme.primary} />
      </View>
      <View style={styles.reportIntroCopy}>
        <AppText size="small" weight="semibold">
          {titles[report]}
        </AppText>
        <AppText size="small" tone="secondary">
          {descriptions[report]}
        </AppText>
      </View>
    </View>
  );
}

function ProductionReportDetail() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    product_id?: string | string[];
    block_id?: string | string[];
  }>();
  const selectedFarm = useFarm().selectedFarm;
  const { theme } = useTheme();
  const farmId = selectedFarm?.id;
  const timezone = selectedFarm?.settings?.timezone ?? "Africa/Nairobi";
  const reportToday = dateInTimezone(new Date(), timezone);
  const range = useDateRange(reportToday);
  const productId = firstParam(params.product_id);
  const blockId = firstParam(params.block_id);
  const period = identifyDatePreset(range.fromDate, range.toDate, reportToday);
  const [selectedProductId, setSelectedProductId] = useState(productId ?? "");
  const [selectedBlockId, setSelectedBlockId] = useState(blockId ?? "");
  const [collectionSearch, setCollectionSearch] = useState("");
  const [filterModal, setFilterModal] = useState<"product" | "block" | null>(null);
  const comparison = getComparisonRange({
    period,
    from: range.fromDate,
    to: range.toDate,
    today: reportToday,
    weekStart: 1,
  });
  const currentFrom = comparison?.current.from ?? range.fromDate;
  const currentTo = comparison?.current.to ?? range.toDate;
  const options = useEggCollectionOptions(user?.id, farmId);
  const collections = useQuery({
    queryKey: [
      "report-egg-collections",
      user?.id,
      farmId,
      selectedProductId,
      selectedBlockId,
      currentFrom,
      currentTo,
    ],
    queryFn: () => getEggCollections(farmId!, {
      product_id: selectedProductId || undefined,
      block_id: selectedBlockId || undefined,
      from_datetime: currentFrom
        ? farmLocalDateTime(currentFrom, "00:00:00", timezone)
        : undefined,
      to_datetime: currentTo
        ? farmLocalDateTime(currentTo, "23:59:59", timezone)
        : undefined,
    }),
    enabled: Boolean(user?.id && farmId),
  });
  const previousCollections = useQuery({
    queryKey: [
      "report-egg-collections",
      user?.id,
      farmId,
      "comparison",
      selectedProductId,
      selectedBlockId,
      comparison?.previous.from,
      comparison?.previous.to,
    ],
    queryFn: () => getEggCollections(farmId!, {
      product_id: selectedProductId || undefined,
      block_id: selectedBlockId || undefined,
      from_datetime: farmLocalDateTime(comparison!.previous.from, "00:00:00", timezone),
      to_datetime: farmLocalDateTime(comparison!.previous.to, "23:59:59", timezone),
    }),
    enabled: Boolean(user?.id && farmId && comparison),
  });
  const [breakdownBy, setBreakdownBy] = useState<"product" | "block">("product");
  const productNames = useMemo(
    () => new Map((options.data?.products ?? []).map((product) => [product.id, product.name])),
    [options.data?.products],
  );
  const blockNames = useMemo(
    () => new Map((options.data?.blocks ?? []).map((block) => [block.id, block.name])),
    [options.data?.blocks],
  );
  const rows = collections.data ?? [];
  const collectionRows = rows.filter((row) => row.entry_type === "collection");
  const openingRows = rows.filter((row) => row.entry_type === "opening_stock");
  const total = collectionRows.reduce(
    (sum, row) => sum + eggCountFromRecord(row),
    0,
  );
  const openingTotal = openingRows.reduce(
    (sum, row) => sum + eggCountFromRecord(row),
    0,
  );
  const previousTotal = (previousCollections.data ?? [])
    .filter((row) => row.entry_type === "collection")
    .reduce((sum, row) => sum + eggCountFromRecord(row), 0);
  const comparisonResult = comparison
    ? getEggProductionComparisonResult(total, previousTotal)
    : null;
  const recordedMeasures = (records: typeof collectionRows) =>
    getRecordedMeasureSummary(records, options.data?.products ?? []);
  const baseUnitNames = new Map(
    (options.data?.products ?? []).map((product) => [
      product.id,
      product.units.find((unit) => unit.is_base_unit)?.name ?? "egg",
    ]),
  );
  const grouped = new Map<string, {
    label: string;
    eggs: number;
    records: typeof collectionRows;
  }>();
  for (const row of collectionRows) {
    const key = breakdownBy === "product"
      ? `product:${row.product_id}`
      : row.block_id
        ? `block:${row.block_id}`
        : "block:unassigned";
    const label = breakdownBy === "product"
      ? productNames.get(row.product_id) ?? "Egg product"
      : row.block_id
        ? blockNames.get(row.block_id) ?? "Block unavailable"
        : "Not assigned";
    const group = grouped.get(key) ?? { label, eggs: 0, records: [] };
    group.eggs += eggCountFromRecord(row);
    group.records.push(row);
    grouped.set(key, group);
  }
  const breakdown = [...grouped.entries()]
    .map(([key, item]) => ({ key, ...item }))
    .sort((a, b) => b.eggs - a.eggs);
  const maxBreakdown = Math.max(1, ...breakdown.map((item) => item.eggs));
  const searchTerm = collectionSearch.trim().toLocaleLowerCase();
  const matchesSearch = (row: (typeof rows)[number]) => {
    if (!searchTerm) return true;
    const unit = getCollectionUnit(row, options.data?.products ?? []);
    const searchable = [
      productNames.get(row.product_id),
      row.block_id ? blockNames.get(row.block_id) : "",
      row.notes,
      formatEggReportDate(row.collected_at, timezone),
      row.quantity,
      unit.name,
      eggCountFromRecord(row),
    ].join(" ").toLocaleLowerCase();
    return searchable.includes(searchTerm);
  };
  const visibleCollectionRows = collectionRows.filter(matchesSearch);
  const visibleOpeningRows = openingRows.filter(matchesSearch);
  const visibleOpeningTotal = visibleOpeningRows.reduce(
    (sum, row) => sum + eggCountFromRecord(row),
    0,
  );
  const visibleCollectionsByDate = groupCollectionsByDate(visibleCollectionRows, timezone);
  const hasActiveCollectionFilters =
    Boolean(collectionSearch.trim() || selectedProductId || selectedBlockId);
  const toPdfRecord = (
    row: (typeof rows)[number],
  ): EggProductionPdfRecord => {
    const unit = getCollectionUnit(row, options.data?.products ?? []);
    const productUnits = options.data?.products.find(
      (product) => product.id === row.product_id,
    )?.units;
    return {
      collectedAt: row.collected_at,
      entryType: row.entry_type,
      productId: row.product_id,
      productName: productNames.get(row.product_id) ?? "Egg product",
      blockName: row.block_id
        ? blockNames.get(row.block_id) ?? "Block unavailable"
        : null,
      quantity: Number(row.quantity),
      unitName: unit.name,
      eggs: eggCountFromRecord(row),
      conversionFactor: Number(row.conversion_factor),
      isBaseUnit: unit.isBaseUnit,
      availableUnits: productUnits?.map((productUnit) => ({
        name: productUnit.name,
        conversionFactor: Number(productUnit.conversion_factor),
        isBaseUnit: productUnit.is_base_unit,
      })),
    };
  };
  const pdfCollections = collectionRows.map(toPdfRecord);
  const pdfOpeningStock = openingRows.map(toPdfRecord);
  const pdfPreviousCollections = (previousCollections.data ?? [])
    .filter((row) => row.entry_type === "collection")
    .map(toPdfRecord);
  const reportFrom = comparison?.current.from ?? range.fromDate;
  const reportTo = comparison?.current.to ?? range.toDate;
  const exportData: ReportExportData = {
    title: "Egg production",
    farmName: selectedFarm?.name ?? "FarmTrack",
    farmLogoUri: getFarmLogoUri(selectedFarm?.settings?.logo_path),
    fromDate: reportFrom,
    toDate: reportTo,
    summary: [
      { label: "Eggs collected", value: total, kind: "number" },
      { label: "Opening stock entered (eggs)", value: openingTotal, kind: "number" },
      { label: "Collection records", value: collectionRows.length, kind: "number" },
    ],
    sheets: [
      {
        name: "Collections",
        columns: [
          { key: "date", label: "Date", kind: "date" },
          { key: "product", label: "Product" },
          { key: "quantity", label: "Recorded quantity", kind: "number" },
          { key: "unit", label: "Unit" },
          { key: "eggs", label: "Eggs collected", kind: "number" },
          { key: "block", label: "Block" },
          { key: "notes", label: "Notes" },
        ],
        rows: collectionRows.map((row) => ({
          date: row.collected_at,
          product: productNames.get(row.product_id) ?? "Egg product",
          quantity: Number(row.quantity),
          unit: getCollectionUnit(row, options.data?.products ?? []).name,
          eggs: eggCountFromRecord(row),
          block: row.block_id ? blockNames.get(row.block_id) ?? "Block unavailable" : "",
          notes: row.notes,
        })),
        totalColumns: ["eggs"],
      },
      {
        name: "Opening stock",
        columns: [
          { key: "date", label: "Date", kind: "date" },
          { key: "product", label: "Product" },
          { key: "quantity", label: "Recorded quantity", kind: "number" },
          { key: "unit", label: "Unit" },
          { key: "eggs", label: "Eggs entered", kind: "number" },
          { key: "notes", label: "Notes" },
        ],
        rows: openingRows.map((row) => ({
        date: row.collected_at,
        product: productNames.get(row.product_id) ?? "Egg product",
        quantity: Number(row.quantity),
        unit: getCollectionUnit(row, options.data?.products ?? []).name,
        eggs: eggCountFromRecord(row),
        notes: row.notes,
      })),
        totalColumns: ["eggs"],
      },
    ],
    customPdfHtml: (logoUri) => createEggProductionPdfHtml({
      farmName: selectedFarm?.name ?? "FarmTrack",
      logoUri,
      timezone,
      generatedAt: new Date(),
      from: reportFrom,
      to: reportTo,
      today: reportToday,
      collections: pdfCollections,
      openingStock: pdfOpeningStock,
      previousCollections: pdfPreviousCollections,
      comparison,
    }),
    customPdfFilename: getEggProductionPdfFilename(reportFrom, reportTo, reportToday),
    customPdfFooter: `${selectedFarm?.name ?? "FarmTrack"} · Egg production report`,
  };

  return (
    <>
      <View style={styles.productionToolbar}>
        <ProductionPeriodControl {...range} timezone={timezone} />
        {collections.data && (!comparison || previousCollections.isSuccess) ? (
          <View style={styles.productionExportAction}>
            <ReportExportActions data={exportData} compact />
          </View>
        ) : null}
      </View>
      {options.isError ? <QueryError error={options.error} retry={() => void options.refetch()} /> : null}
      {collections.isLoading ? <LoadingState label="Loading egg collections" /> : null}
      {collections.isError ? <QueryError error={collections.error} retry={() => void collections.refetch()} /> : null}
      {previousCollections.isError ? <QueryError error={previousCollections.error} retry={() => void previousCollections.refetch()} /> : null}
      {collections.data ? (
        <>
          <View style={[styles.productionHero, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <AppText size="small" weight="semibold" tone="secondary">COLLECTED THIS PERIOD</AppText>
            <AppText size="title" weight="semibold" style={[styles.productionTotal, { color: theme.primary }]}>
              {formatQuantity(total)} eggs
            </AppText>
            {pdfCollections.length > 0 && formatEggsAndPacks(pdfCollections) !== `${formatQuantity(total)} eggs` ? (
              <AppText size="small" tone="secondary">
                Recorded as {formatEggsAndPacks(pdfCollections)}
              </AppText>
            ) : null}
            <View style={[styles.productionHeroDivider, { borderTopColor: theme.border }]} />
            {comparison && previousCollections.isSuccess && comparisonResult ? (
              <View style={styles.productionComparison}>
                <View style={styles.productionComparisonCopy}>
                  <AppText size="small" weight="semibold">{comparison.label}</AppText>
                  <AppText size="small" tone="secondary">
                    {formatQuantity(previousTotal)} eggs collected in that period
                  </AppText>
                </View>
                <View
                  style={[
                    styles.productionDelta,
                    {
                      backgroundColor: `${comparisonResult.kind === "up" ? theme.success : comparisonResult.kind === "down" ? theme.danger : theme.textSecondary}18`,
                    },
                  ]}
                >
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{ color: comparisonResult.kind === "up" ? theme.success : comparisonResult.kind === "down" ? theme.danger : theme.textSecondary }}
                  >
                    {comparisonResult.kind === "equal"
                      ? "No change"
                      : comparisonResult.kind === "new"
                        ? `+${formatQuantity(total)} eggs`
                        : comparisonResult.kind === "empty"
                          ? "No production"
                          : `${comparisonResult.kind === "up" ? "+" : "−"}${formatQuantity(Math.abs(comparisonResult.change))} eggs${comparisonResult.percentage === null ? "" : ` · ${comparisonResult.kind === "up" ? "+" : "−"}${formatQuantity(Math.abs(comparisonResult.percentage))}%`}`}
                  </AppText>
                </View>
              </View>
            ) : null}
          </View>
          <View style={styles.productionSectionHeading}>
            <View style={styles.productionSectionCopy}>
              <AppText size="body" weight="semibold">Production sources</AppText>
              <AppText size="small" tone="secondary">See which products or blocks contributed the eggs.</AppText>
            </View>
            <View style={[styles.productionSegment, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              {(["product", "block"] as const).map((group) => (
                <Pressable
                  key={group}
                  accessibilityRole="button"
                  accessibilityState={{ selected: breakdownBy === group }}
                  onPress={() => setBreakdownBy(group)}
                  style={[
                    styles.productionSegmentButton,
                    breakdownBy === group && { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{ color: breakdownBy === group ? theme.text : theme.textSecondary }}
                  >
                    {group === "product" ? "Products" : "Blocks"}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </View>
          {breakdown.length ? breakdown.map((item) => (
            <View key={item.key} style={[styles.productionBarRow, { borderBottomColor: theme.border }]}>
              <View style={styles.productionBarLabels}>
                <View style={styles.productionBarCopy}>
                  <AppText size="small" weight="semibold">{item.label}</AppText>
                  <AppText size="small" tone="secondary">
                    {item.records.length} {item.records.length === 1 ? "collection" : "collections"}
                    {recordedMeasures(item.records) ? ` · ${recordedMeasures(item.records)}` : ""}
                  </AppText>
                </View>
                <View style={styles.productionBreakdownValue}>
                  <AppText size="small" weight="semibold">{formatQuantity(item.eggs)} eggs</AppText>
                  {breakdown.length > 1 ? (
                    <AppText size="small" tone="secondary">
                      {formatQuantity((item.eggs / Math.max(total, 1)) * 100)}%
                    </AppText>
                  ) : null}
                </View>
              </View>
              {breakdown.length > 1 ? (
                <View style={[styles.productionBarTrack, { backgroundColor: theme.backgroundSelected }]}>
                  <View style={[styles.productionBarFill, { width: `${(item.eggs / maxBreakdown) * 100}%`, backgroundColor: theme.primary }]} />
                </View>
              ) : null}
            </View>
          )) : null}

          <View style={styles.productionListHeading}>
            <View style={styles.productionSectionCopy}>
              <AppText size="body" weight="semibold">Collection records</AppText>
              <AppText size="small" tone="secondary">
                {visibleCollectionRows.length} of {collectionRows.length} {collectionRows.length === 1 ? "record" : "records"}
              </AppText>
            </View>
          </View>
          <View style={[styles.productionSearch, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
            <TextInput
              accessibilityLabel="Search collection records"
              placeholder="Search product, block, date or note"
              placeholderTextColor={theme.textSecondary}
              value={collectionSearch}
              onChangeText={setCollectionSearch}
              style={[styles.productionSearchInput, { color: theme.text }]}
              returnKeyType="search"
            />
            {collectionSearch ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear collection search"
                onPress={() => setCollectionSearch("")}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={19} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>
          <View style={styles.productionFilters}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Filter by product"
              onPress={() => setFilterModal("product")}
              style={[
                styles.productionFilterButton,
                {
                  backgroundColor: selectedProductId ? theme.backgroundSelected : theme.backgroundElement,
                  borderColor: selectedProductId ? theme.primary : theme.border,
                },
              ]}
            >
              <Ionicons name="egg-outline" size={15} color={selectedProductId ? theme.primary : theme.textSecondary} />
              <AppText size="small" weight="semibold" style={styles.productionFilterText}>
                {options.data?.products.find((item) => item.id === selectedProductId)?.name ?? "All products"}
              </AppText>
              <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Filter by block"
              onPress={() => setFilterModal("block")}
              style={[
                styles.productionFilterButton,
                {
                  backgroundColor: selectedBlockId ? theme.backgroundSelected : theme.backgroundElement,
                  borderColor: selectedBlockId ? theme.primary : theme.border,
                },
              ]}
            >
              <Ionicons name="grid-outline" size={15} color={selectedBlockId ? theme.primary : theme.textSecondary} />
              <AppText size="small" weight="semibold" style={styles.productionFilterText}>
                {options.data?.blocks.find((item) => item.id === selectedBlockId)?.name ?? "All blocks"}
              </AppText>
              <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
            </Pressable>
            {hasActiveCollectionFilters ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setCollectionSearch("");
                  setSelectedProductId("");
                  setSelectedBlockId("");
                }}
                style={styles.productionClearFilters}
              >
                <AppText size="small" weight="semibold" style={{ color: theme.primary }}>Clear</AppText>
              </Pressable>
            ) : null}
          </View>
          {collectionRows.length === 0 ? (
            <EmptyState message="No collections recorded for these dates." />
          ) : visibleCollectionsByDate.length === 0 ? (
            <EmptyState message="No collection records match these filters." />
          ) : (
            visibleCollectionsByDate.map(([date, dateRows]) => (
              <View key={date}>
                <AppText size="small" weight="semibold" tone="secondary" style={styles.productionDay}>
                    {formatEggReportDate(date)}
                </AppText>
                {dateRows.map((row) => {
                  const unit = getCollectionUnit(row, options.data?.products ?? []);
                  const baseName = baseUnitNames.get(row.product_id) ?? "egg";
                  const time = formatEggReportTime(row.collected_at, timezone);
                  return (
                    <View key={row.id} style={[styles.productionRecord, { borderBottomColor: theme.border }]}>
                      <View style={styles.productionRecordCopy}>
                        <AppText size="small" weight="semibold">
                          {productNames.get(row.product_id) ?? "Egg product"}
                        </AppText>
                        <AppText size="small" tone="secondary">
                          {row.block_id ? blockNames.get(row.block_id) ?? "Block unavailable" : "Block not assigned"}
                          {time ? ` · ${time}` : ""}
                        </AppText>
                        {row.notes ? <AppText size="small" tone="secondary">{row.notes}</AppText> : null}
                      </View>
                      <View style={styles.productionRecordAmount}>
                        <AppText size="small" weight="semibold">
                          {formatQuantity(eggCountFromRecord(row))} {eggUnitLabel(baseName, eggCountFromRecord(row))}
                        </AppText>
                        <AppText size="small" tone="secondary">
                          {formatQuantity(Number(row.quantity))} {pluralUnitLabel(unit.name, Number(row.quantity))}
                        </AppText>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))
          )}

          {openingRows.length ? (
            <View style={[styles.openingStockSection, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={styles.openingStockHeading}>
                <View style={[styles.openingStockIcon, { backgroundColor: theme.backgroundSelected }]}>
                  <Ionicons name="archive-outline" size={18} color={theme.textSecondary} />
                </View>
                <View style={styles.productionRecordCopy}>
                  <AppText size="body" weight="semibold">Opening stock</AppText>
                  <AppText size="small" tone="secondary">Existing inventory, not production in this period</AppText>
                </View>
                <AppText size="small" weight="semibold" style={styles.openingStockTotal}>
                  {formatQuantity(visibleOpeningTotal)} eggs
                </AppText>
              </View>
              {visibleOpeningRows.length ? visibleOpeningRows.map((row) => {
                const unit = getCollectionUnit(row, options.data?.products ?? []);
                const baseName = baseUnitNames.get(row.product_id) ?? "egg";
                const time = formatEggReportTime(row.collected_at, timezone);
                return (
                  <View key={row.id} style={[styles.productionRecord, { borderBottomColor: theme.border }]}>
                    <View style={styles.productionRecordCopy}>
                      <AppText size="small" weight="semibold" numberOfLines={1}>
                        {productNames.get(row.product_id) ?? "Egg product"}
                      </AppText>
                      <AppText size="small" tone="secondary">
                        {formatEggReportDate(row.collected_at, timezone)} · {row.block_id ? blockNames.get(row.block_id) ?? "Block unavailable" : "Block not assigned"}
                        {time ? ` · ${time}` : ""}
                      </AppText>
                      {row.notes ? <AppText size="small" tone="secondary">{row.notes}</AppText> : null}
                    </View>
                    <View style={styles.productionRecordAmount}>
                      <AppText size="small" weight="semibold">
                        {formatQuantity(eggCountFromRecord(row))} {eggUnitLabel(baseName, eggCountFromRecord(row))}
                      </AppText>
                      <AppText size="small" tone="secondary">
                        {formatQuantity(Number(row.quantity))} {pluralUnitLabel(unit.name, Number(row.quantity))}
                      </AppText>
                    </View>
                  </View>
                );
              }) : (
                <AppText size="small" tone="secondary" style={styles.openingStockEmpty}>
                  {hasActiveCollectionFilters ? "No opening stock entries match these filters." : `${openingRows.length} ${openingRows.length === 1 ? "entry" : "entries"} recorded.`}
                </AppText>
              )}
            </View>
          ) : null}
        </>
      ) : null}
      <Modal
        visible={filterModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterModal(null)}
      >
        <View style={styles.productionFilterModalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close filters"
            onPress={() => setFilterModal(null)}
            style={styles.productionFilterScrim}
          />
          <View style={[styles.productionFilterSheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={styles.productionFilterModalHeading}>
              <View style={styles.productionRecordCopy}>
                <AppText size="heading" weight="semibold">
                  {filterModal === "product" ? "Filter by product" : "Filter by block"}
                </AppText>
                <AppText size="small" tone="secondary">Choose which collection records to show.</AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close filters"
                onPress={() => setFilterModal(null)}
                style={styles.productionFilterClose}
              >
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.productionFilterList}
              contentContainerStyle={styles.productionFilterOptions}
            >
              <ProductionFilterOption
                label={filterModal === "product" ? "All products" : "All blocks"}
                selected={filterModal === "product" ? !selectedProductId : !selectedBlockId}
                onPress={() => {
                  if (filterModal === "product") setSelectedProductId("");
                  else setSelectedBlockId("");
                  setFilterModal(null);
                }}
              />
              {(filterModal === "product" ? options.data?.products ?? [] : options.data?.blocks ?? []).map((option) => (
                <ProductionFilterOption
                  key={option.id}
                  label={option.name}
                  selected={filterModal === "product" ? selectedProductId === option.id : selectedBlockId === option.id}
                  onPress={() => {
                    if (filterModal === "product") setSelectedProductId(option.id);
                    else setSelectedBlockId(option.id);
                    setFilterModal(null);
                  }}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function ProductionFilterOption({
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
        styles.productionFilterOption,
        {
          backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}
    >
      <AppText size="body" weight={selected ? "semibold" : "regular"} style={styles.productionFilterOptionLabel}>
        {label}
      </AppText>
      {selected ? <Ionicons name="checkmark-circle" size={20} color={theme.primary} /> : null}
    </Pressable>
  );
}

function ProductionPeriodControl({
  fromDate,
  toDate,
  setRange,
  timezone,
}: {
  fromDate: string;
  toDate: string;
  setRange: (fromDate: string, toDate: string) => void;
  timezone: string;
}) {
  const { theme } = useTheme();
  const farmToday = dateInTimezone(new Date(), timezone);
  const activePreset = identifyDatePreset(fromDate, toDate, farmToday);
  const presets = [
    { key: "today", label: "Today" },
    { key: "week", label: "Week" },
    { key: "month", label: "Month" },
    { key: "custom", label: "Custom" },
    { key: "all", label: "All" },
  ] as const;
  return (
    <View style={[styles.productionPeriod, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.productionPeriodSegments}>
        {presets.map((preset) => (
          <Pressable
            key={preset.key}
            accessibilityRole="button"
            accessibilityState={{ selected: activePreset === preset.key }}
            onPress={() => {
              if (preset.key === "custom") {
                if (activePreset !== "custom") {
                  const todayDate = farmToday;
                  const from = new Date(`${todayDate}T00:00:00Z`);
                  from.setUTCDate(from.getUTCDate() - 6);
                  setRange(formatDate(from), todayDate);
                }
              } else if (preset.key === "all") {
                setRange("", "");
              } else {
                setRange(...getDateRangeForDate(preset.key, farmToday));
              }
            }}
            style={[
              styles.productionPeriodButton,
              activePreset === preset.key && { backgroundColor: theme.primary },
            ]}
          >
            <AppText
              size="small"
              weight="semibold"
              style={{ color: activePreset === preset.key ? theme.onPrimary : theme.textSecondary }}
            >
              {preset.label}
            </AppText>
          </Pressable>
        ))}
      </View>
      <View style={styles.productionRangeLine}>
        <AppText size="small" tone="secondary" style={styles.productionRangeText}>
          {!fromDate && !toDate
            ? "All dates"
            : !fromDate
              ? `Through ${formatEggReportDate(toDate)}`
              : !toDate
                ? `From ${formatEggReportDate(fromDate)} onward`
                : fromDate === toDate
              ? formatEggReportDate(fromDate)
              : `${formatEggReportDate(fromDate)} – ${formatEggReportDate(toDate)}`}
        </AppText>
      </View>
      {activePreset === "custom" ? (
        <View style={styles.dateRow}>
          <DatePickerField
            label="From"
            value={fromDate}
            onChange={(date) => setRange(date, toDate)}
            style={styles.dateField}
          />
          <DatePickerField
            label="To"
            value={toDate}
            onChange={(date) => setRange(fromDate, date)}
            style={styles.dateField}
          />
        </View>
      ) : null}
    </View>
  );
}

function getCollectionUnit(
  row: { product_id: string; unit_id: string; conversion_factor: number | string },
  products: NonNullable<ReturnType<typeof useEggCollectionOptions>["data"]>["products"],
) {
  const product = products.find((item) => item.id === row.product_id);
  const unit = product?.units.find((item) => item.id === row.unit_id);
  return {
    name: unit?.name ?? "egg",
    abbreviation: unit?.abbreviation ?? "",
    isBaseUnit: unit?.is_base_unit ?? false,
  };
}

function getRecordedMeasureSummary(
  rows: { product_id: string; unit_id: string; quantity: number | string; conversion_factor: number | string }[],
  products: NonNullable<ReturnType<typeof useEggCollectionOptions>["data"]>["products"],
): string {
  const quantities = new Map<string, { name: string; quantity: number; isBaseUnit: boolean }>();
  for (const row of rows) {
    const unit = getCollectionUnit(row, products);
    const key = `${row.unit_id}:${unit.isBaseUnit}`;
    const quantity = quantities.get(key) ?? {
      name: unit.name,
      quantity: 0,
      isBaseUnit: unit.isBaseUnit,
    };
    quantity.quantity += Number(row.quantity);
    quantities.set(key, quantity);
  }
  return [...quantities.values()]
    .sort((a, b) => Number(a.isBaseUnit) - Number(b.isBaseUnit) || a.name.localeCompare(b.name))
    .map(({ name, quantity, isBaseUnit }) =>
      `${formatQuantity(quantity)} ${isBaseUnit ? eggUnitLabel(name, quantity) : pluralUnitLabel(name, quantity)}`,
    )
    .join(" · ");
}

function eggCountFromRecord(row: {
  quantity: number | string;
  conversion_factor: number | string;
}): number {
  return Number(row.quantity) * Number(row.conversion_factor);
}

function formatEggReportDate(value: string, timezone = "UTC"): string {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isDateOnly ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: isDateOnly ? "UTC" : timezone,
  }).format(date);
}

function formatEggReportTime(value: string, timezone: string): string {
  if (!value.includes("T")) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(date);
}

function dateInTimezone(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function eggUnitLabel(unitName: string, quantity: number): string {
  const normalized = unitName.trim().toLowerCase();
  if (/^(piece|pieces|pc|pcs|each|egg|eggs)$/.test(normalized)) {
    return quantity === 1 ? "egg" : "eggs";
  }
  return pluralUnitLabel(unitName, quantity);
}

function pluralUnitLabel(unitName: string, quantity: number): string {
  const trimmed = unitName.trim().toLocaleLowerCase();
  if (quantity === 1) return trimmed.toLowerCase().endsWith("s") ? trimmed.slice(0, -1) : trimmed;
  return trimmed.toLowerCase().endsWith("s") ? trimmed : `${trimmed}s`;
}

function groupCollectionsByDate<T extends { collected_at: string }>(
  rows: T[],
  timezone: string,
): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const date = row.collected_at.includes("T")
      ? dateInTimezone(new Date(row.collected_at), timezone)
      : row.collected_at.slice(0, 10);
    const group = groups.get(date) ?? [];
    group.push(row);
    groups.set(date, group);
  }
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
}

function FlockReportDetail() {
  const { user } = useAuth();
  const selectedFarm = useFarm().selectedFarm;
  const { theme } = useTheme();
  const farmId = selectedFarm?.id;
  const query = useChickenSaleOptions(user?.id, farmId);
  const batches = query.data?.batches ?? [];
  const blocks = query.data?.blocks ?? [];
  const farmToday = dateInTimezone(
    new Date(),
    selectedFarm?.settings?.timezone ?? theme.timezone,
  );
  const batchCount = (batch: (typeof batches)[number]) =>
    batch.stocks.reduce((sum, stock) => sum + stock.quantity, 0);
  const stockedBatches = batches
    .map((batch) => ({ ...batch, birdCount: batchCount(batch) }))
    .filter((batch) => batch.birdCount > 0)
    .sort((a, b) => b.birdCount - a.birdCount);
  const flockCount = stockedBatches.reduce(
    (total, batch) => total + batch.birdCount,
    0,
  );
  const housedBirds = blocks.reduce(
    (total, block) => total + block.current_chickens,
    0,
  );
  const totalCapacity = blocks.reduce(
    (total, block) => total + block.maximum_chickens,
    0,
  );
  const capacityUsed = totalCapacity > 0
    ? Math.min((housedBirds / totalCapacity) * 100, 100)
    : 0;
  const blockBreakdowns = blocks
    .map((block) => {
      const ageGroups = new Map<string, {
        ageLabel: string;
        ageDays: number | null;
        chickenType: string;
        count: number;
        batches: { id: string; name: string; count: number }[];
      }>();
      for (const batch of stockedBatches) {
        const stock = batch.stocks.find((item) => item.block_id === block.id);
        if (!stock || stock.quantity <= 0) continue;
        const age = getChickenAge(batch.hatch_date, farmToday);
        const ageLabel = age?.label ?? "Age not recorded";
        const key = `${age?.days ?? "unknown"}:${batch.chicken_type}`;
        const group = ageGroups.get(key) ?? {
          ageLabel,
          ageDays: age?.days ?? null,
          chickenType: formatChickenTypeLabel(batch.chicken_type),
          count: 0,
          batches: [],
        };
        group.count += stock.quantity;
        group.batches.push({ id: batch.id, name: batch.name, count: stock.quantity });
        ageGroups.set(key, group);
      }
      return {
        ...block,
        ageGroups: [...ageGroups.values()].sort((a, b) =>
          (b.ageDays ?? -1) - (a.ageDays ?? -1) ||
          a.chickenType.localeCompare(b.chickenType),
        ),
      };
    })
    .filter((block) => block.current_chickens > 0)
    .sort((a, b) => b.current_chickens - a.current_chickens);

  return (
    <>
      {query.isLoading ? <LoadingState label="Loading flock report" /> : null}
      {query.isError ? <QueryError error={query.error} retry={() => void query.refetch()} /> : null}
      {query.data ? (
        <>
          <View style={styles.exportToolbar}>
            <ReportExportActions
              label="Export"
            data={{
              title: "Flock report",
              farmName: selectedFarm?.name ?? "FarmTrack",
              farmLogoUri: getFarmLogoUri(selectedFarm?.settings?.logo_path),
              summary: [
                { label: "Current flock", value: flockCount, kind: "number" },
                { label: "Active batches", value: stockedBatches.length, kind: "number" },
                { label: "Housing blocks", value: blocks.length, kind: "number" },
              ],
              sheets: [
                {
                  name: "Flock by batch",
                  columns: [
                    { key: "batch", label: "Batch" },
                    { key: "type", label: "Chicken type" },
                    { key: "hatchDate", label: "Hatch date", kind: "date" },
                    { key: "age", label: "Age today" },
                    { key: "block", label: "Block" },
                    { key: "birds", label: "Birds", kind: "number" },
                  ],
                  rows: batches.flatMap((batch) =>
                    batch.stocks.length
                      ? batch.stocks.map((stock) => ({
                          batch: batch.name,
                          type: batch.chicken_type,
                          hatchDate: batch.hatch_date,
                          age: getChickenAge(batch.hatch_date, farmToday)?.label ?? "Not recorded",
                          block: stock.block_name,
                          birds: stock.quantity,
                        }))
                      : [{
                          batch: batch.name,
                          type: batch.chicken_type,
                          hatchDate: batch.hatch_date,
                          age: getChickenAge(batch.hatch_date, farmToday)?.label ?? "Not recorded",
                          block: "Unallocated",
                          birds: 0,
                        }],
                  ),
                  totals: true,
                },
                {
                  name: "Housing capacity",
                  columns: [
                    { key: "block", label: "Block" },
                    { key: "current", label: "Current birds", kind: "number" },
                    { key: "maximum", label: "Maximum capacity", kind: "number" },
                    { key: "available", label: "Available capacity", kind: "number" },
                  ],
                  rows: blocks.map((block) => ({
                    block: block.name,
                    current: block.current_chickens,
                    maximum: block.maximum_chickens,
                    available: block.available_capacity,
                  })),
                  totals: true,
                },
              ],
            }}
            />
          </View>
          <View style={[styles.flockHero, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <AppText size="small" tone="secondary">CURRENT FLOCK</AppText>
            <AppText size="title" weight="semibold" style={styles.productionTotal}>
              {formatQuantity(flockCount)} <AppText size="body" weight="semibold">birds</AppText>
            </AppText>
            <AppText size="small" tone="secondary">
              Across {stockedBatches.length} {stockedBatches.length === 1 ? "active batch" : "active batches"}
            </AppText>
            <View style={[styles.flockCapacity, { borderTopColor: theme.border }]}>
              <View style={styles.flockCapacityLabels}>
                <AppText size="small" weight="semibold">Housing capacity</AppText>
                <AppText size="small" tone="secondary">
                  {totalCapacity > 0
                    ? `${formatQuantity(housedBirds)} / ${formatQuantity(totalCapacity)} birds · ${Math.round(capacityUsed)}%`
                    : `${formatQuantity(housedBirds)} birds · Capacity not set`}
                </AppText>
              </View>
              {totalCapacity > 0 ? (
                <View style={[styles.productionBarTrack, { backgroundColor: theme.backgroundSelected }]}>
                  <View style={[styles.productionBarFill, { width: `${capacityUsed}%`, backgroundColor: theme.primary }]} />
                </View>
              ) : null}
            </View>
          </View>
          <View style={[styles.flockFacts, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.flockFact}>
              <AppText size="small" tone="secondary">Active batches</AppText>
              <AppText weight="semibold">{stockedBatches.length}</AppText>
            </View>
            <View style={[styles.flockFact, styles.flockFactDivider, { borderLeftColor: theme.border }]}>
              <AppText size="small" tone="secondary">Housing blocks</AppText>
              <AppText weight="semibold">{blocks.length}</AppText>
            </View>
            <View style={[styles.flockFact, styles.flockFactDivider, { borderLeftColor: theme.border }]}>
              <AppText size="small" tone="secondary">Space available</AppText>
              <AppText weight="semibold">
                {totalCapacity > 0 ? `${formatQuantity(Math.max(totalCapacity - housedBirds, 0))} birds` : "—"}
              </AppText>
            </View>
          </View>
          <View style={styles.productionSectionHeading}>
            <View style={styles.flockSectionTitle}>
              <AppText size="body" weight="semibold">Birds by block</AppText>
              <AppText size="small" tone="secondary">
                Age and batch placement
              </AppText>
            </View>
          </View>
          {blockBreakdowns.length ? blockBreakdowns.map((block) => (
            <View
              key={block.id}
              style={[
                styles.flockBlockCard,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}
            >
              <View style={styles.flockBlockHeading}>
                <View style={styles.flockBreakCopy}>
                  <AppText size="body" weight="semibold">{block.name}</AppText>
                  <AppText size="small" tone="secondary">
                    {block.maximum_chickens > 0
                      ? `${formatQuantity(block.current_chickens)} of ${formatQuantity(block.maximum_chickens)} capacity`
                      : "Capacity not set"}
                  </AppText>
                </View>
                <AppText size="body" weight="semibold">
                  {formatQuantity(block.current_chickens)} birds
                </AppText>
              </View>
              {block.ageGroups.length ? (
                <View style={[styles.flockAgeList, { borderTopColor: theme.border }]}>
                  {block.ageGroups.map((group) => (
                    <View key={`${block.id}:${group.ageDays ?? "unknown"}:${group.chickenType}`} style={styles.flockAgeGroup}>
                      <View style={styles.flockAgeHeading}>
                        <View style={styles.flockAgeLabels}>
                          <AppText size="small" weight="semibold">
                            {group.ageLabel} · {group.chickenType}
                          </AppText>
                          <AppText size="small" tone="secondary">
                            {group.batches.length} {group.batches.length === 1 ? "batch" : "batches"}
                          </AppText>
                        </View>
                        <AppText size="small" weight="semibold">
                          {formatQuantity(group.count)} birds
                        </AppText>
                      </View>
                      {group.batches.map((batch) => (
                        <View key={batch.id} style={styles.flockBatchRow}>
                          <View style={styles.flockBatchName}>
                            <Ionicons name="git-branch-outline" size={14} color={theme.textSecondary} />
                            <AppText size="small" tone="secondary" numberOfLines={1}>
                              {batch.name}
                            </AppText>
                          </View>
                          <AppText size="small" weight="semibold">
                            {formatQuantity(batch.count)} birds
                          </AppText>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              ) : (
                <AppText size="small" tone="secondary">
                  No batch or age details are available for this block.
                </AppText>
              )}
            </View>
          )) : (
            <EmptyState message="No birds are currently housed in blocks." />
          )}
        </>
      ) : null}
    </>
  );
}

function InventoryReportDetail() {
  const params = useLocalSearchParams<{
    issue_count?: string;
    missing_record_count?: string;
  }>();
  const { user } = useAuth();
  const selectedFarm = useFarm().selectedFarm;
  const { theme } = useTheme();
  const farmId = selectedFarm?.id;
  const query = useInventory(user?.id, farmId);
  const range = useDateRange();
  const movementHistoryQuery = useQuery({
    queryKey: ["inventory-report-movements", user?.id, farmId],
    queryFn: () => fetchAllInventoryMovements(farmId!),
    enabled: Boolean(user?.id && farmId),
  });
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
  const [allMovementsVisible, setAllMovementsVisible] = useState<Record<string, boolean>>({});
  const [productSearch, setProductSearch] = useState("");
  const [movementFilter, setMovementFilter] = useState<"all" | "in" | "out">("all");
  const [exportFeedback, setExportFeedback] = useState<{
    message: string;
    isError: boolean;
  } | null>(null);
  const inventory = query.data;
  const issueCount = Number(firstParam(params.issue_count) ?? 0);
  const missingRecordCount = Number(firstParam(params.missing_record_count) ?? 0);
  const balances = useMemo(() => inventory?.items ?? [], [inventory?.items]);
  const movements = (movementHistoryQuery.data ?? []).filter((movement) => {
    const date = movement.occurred_on.slice(0, 10);
    return (!range.fromDate || date >= range.fromDate) &&
      (!range.toDate || date <= range.toDate);
  });
  const reconciliation = useMemo(
    () => buildInventoryReconciliation(
      balances,
      movementHistoryQuery.data ?? [],
      range.fromDate,
      range.toDate,
    ),
    [balances, movementHistoryQuery.data, range.fromDate, range.toDate],
  );
  const visibleMovements = movements.filter(
    (movement) =>
      movement.movement_type !== "valuation" &&
      Number(movement.quantity_delta) !== 0,
  );
  const movementTotals = useMemo(() => {
    const totals = new Map<
      string,
      { unitName: string; unitAbbreviation: string; received: number; out: number }
    >();
    for (const movement of visibleMovements) {
      const key = `${movement.unit_name}\u0000${movement.unit_abbreviation}`;
      const total = totals.get(key) ?? {
        unitName: movement.unit_name,
        unitAbbreviation: movement.unit_abbreviation,
        received: 0,
        out: 0,
      };
      const quantity = Number(movement.quantity_delta);
      if (quantity > 0) total.received += quantity;
      else total.out += Math.abs(quantity);
      totals.set(key, total);
    }
    return [...totals.values()].sort((left, right) =>
      left.unitName.localeCompare(right.unitName),
    );
  }, [visibleMovements]);
  const filteredReconciliation = reconciliation.filter((product) =>
    product.product_name.toLowerCase().includes(productSearch.trim().toLowerCase()),
  );
  const makeMovementRows = (records: InventoryMovement[]) =>
    records.map((movement) => ({
      date: movement.occurred_on,
      product: movement.product_name,
      productType: movement.product_type,
      movement: inventoryMovementLabel(movement.movement_type),
      change: Number(movement.quantity_delta),
      unit: movement.unit_abbreviation || movement.unit_name,
    }));
  const movementExportData: ReportExportData = {
    title: "Stock movements report",
    farmName: selectedFarm?.name ?? "FarmTrack",
    farmLogoUri: getFarmLogoUri(selectedFarm?.settings?.logo_path),
    summary: [
      { label: "Stock movements", value: visibleMovements.length, kind: "number" },
      { label: "Date range", value: formatDateRangeLabel(range.fromDate, range.toDate) },
    ],
    sheets: [{
      name: "Stock movements",
      columns: [
        { key: "date", label: "Date", kind: "date" },
        { key: "product", label: "Product" },
        { key: "productType", label: "Product type" },
        { key: "movement", label: "Movement type" },
        { key: "change", label: "Quantity change", kind: "number" },
        { key: "unit", label: "Unit" },
      ],
      rows: makeMovementRows(visibleMovements),
    }],
  };

  async function resolveAllInventoryMovements(): Promise<ReportExportData> {
    if (!farmId) throw new Error("Select a farm before exporting this report.");
    const records = (await fetchAllInventoryMovements(farmId)).filter((movement) => {
      const date = movement.occurred_on.slice(0, 10);
      return (!range.fromDate || date >= range.fromDate) &&
        (!range.toDate || date <= range.toDate) &&
        movement.movement_type !== "valuation" &&
        Number(movement.quantity_delta) !== 0;
    });
    return {
      ...movementExportData,
      summary: [
        { label: "Stock movements", value: records.length, kind: "number" },
        { label: "Date range", value: formatDateRangeLabel(range.fromDate, range.toDate) },
      ],
      sheets: [{
        ...movementExportData.sheets[0],
        rows: makeMovementRows(records),
      }],
    };
  }

  return (
    <>
      {query.isLoading ? <LoadingState label="Loading inventory report" /> : null}
      {query.isError ? <QueryError error={query.error} retry={() => void query.refetch()} /> : null}
      {movementHistoryQuery.isError ? (
        <QueryError
          error={movementHistoryQuery.error}
          retry={() => void movementHistoryQuery.refetch()}
        />
      ) : null}
      {inventory ? (
        <>
          <DateRange {...range} compact />
          {Number.isFinite(issueCount) && issueCount > 0 ? (
            <View
              style={[
                styles.inventoryIssueCallout,
                { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
              ]}
            >
              <Ionicons name="git-compare-outline" size={19} color={theme.secondary} />
              <View style={styles.inventoryIssueCopy}>
                <AppText size="small" weight="semibold">
                  {missingRecordCount > 0
                    ? `${missingRecordCount} source record${missingRecordCount === 1 ? "" : "s"} need a stock movement`
                    : `${issueCount} stock valuation check${issueCount === 1 ? "" : "s"} need review`}
                </AppText>
                <AppText size="small" tone="secondary">
                  {missingRecordCount > 0
                    ? "These sale, use, or loss records have no matching inventory movement. Compare the dated product balances with the source records; missing entries will not appear in the movement list."
                    : "These sale, use, or loss entries could not be costed from recorded inventory. Review the dated movements and product balances below."}
                </AppText>
              </View>
            </View>
          ) : null}
          <View style={styles.exportToolbar}>
            <ReportExportActions
              label="Stock"
              data={{
                title: "Inventory stock report",
                farmName: selectedFarm?.name ?? "FarmTrack",
                farmLogoUri: getFarmLogoUri(selectedFarm?.settings?.logo_path),
                summary: [
                  { label: "Tracked products", value: balances.length, kind: "number" },
                  { label: "Products with stock", value: balances.filter((item) => Number(item.quantity) > 0).length, kind: "number" },
                ],
                sheets: [{
                  name: "Current stock",
                  columns: [
                    { key: "product", label: "Product" },
                    { key: "type", label: "Product type" },
                    { key: "quantity", label: "Quantity on hand", kind: "number" },
                    { key: "unit", label: "Unit" },
                  ],
                  rows: balances.map((item) => ({
                    product: item.product_name,
                    type: item.product_type,
                    quantity: Number(item.quantity),
                    unit: item.unit_name,
                  })),
                }],
              }}
              onFeedback={(message, isError) =>
                setExportFeedback(
                  message ? { message, isError: Boolean(isError) } : null,
                )
              }
            />
            <ReportExportActions
              label="Movements"
              data={movementExportData}
              resolveData={resolveAllInventoryMovements}
              onFeedback={(message, isError) =>
                setExportFeedback(
                  message ? { message, isError: Boolean(isError) } : null,
                )
              }
            />
          </View>
          {exportFeedback ? (
            <AppText
              size="small"
              style={{ color: exportFeedback.isError ? theme.danger : theme.success }}
            >
              {exportFeedback.message}
            </AppText>
          ) : null}
          {movementHistoryQuery.isLoading ? (
            <LoadingState label="Loading stock movements" />
          ) : movementHistoryQuery.isError ? null : (
            <>
              <View style={styles.inventoryTools}>
                <View
                  style={[
                    styles.inventorySearch,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  ]}
                >
                  <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
                  <TextInput
                    accessibilityLabel="Search products"
                    placeholder="Search products"
                    placeholderTextColor={theme.textSecondary}
                    value={productSearch}
                    onChangeText={setProductSearch}
                    returnKeyType="search"
                    style={[styles.inventorySearchInput, { color: theme.text }]}
                  />
                  {productSearch ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear product search"
                      onPress={() => setProductSearch("")}
                      hitSlop={8}
                    >
                      <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
                    </Pressable>
                  ) : null}
                </View>
                <View
                  style={[
                    styles.movementFilter,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  ]}
                >
                  {([
                    ["all", "All"],
                    ["in", "Received"],
                    ["out", "Out"],
                  ] as const).map(([key, label]) => {
                    const selected = movementFilter === key;
                    return (
                      <Pressable
                        key={key}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => setMovementFilter(key)}
                        style={[
                          styles.movementFilterOption,
                          selected && { backgroundColor: theme.primary },
                        ]}
                      >
                        <AppText
                          size="small"
                          weight="semibold"
                          style={{ color: selected ? theme.onPrimary : theme.textSecondary }}
                        >
                          {label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View
                style={[
                  styles.inventorySummary,
                  { backgroundColor: "transparent", borderColor: "transparent" },
                ]}
              >
                <View style={styles.inventorySummaryStats}>
                  <View
                    style={[
                      styles.inventorySummaryMetric,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <AppText size="small" tone="secondary">Products</AppText>
                    <AppText size="heading" weight="semibold">{balances.length}</AppText>
                  </View>
                  <View
                    style={[
                      styles.inventorySummaryMetric,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <AppText size="small" tone="secondary">With activity</AppText>
                    <AppText size="heading" weight="semibold">
                      {reconciliation.filter((product) => product.periodMovements.length > 0).length}
                    </AppText>
                  </View>
                  <View
                    style={[
                      styles.inventorySummaryMetric,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <AppText size="small" tone="secondary">Movements</AppText>
                    <AppText size="heading" weight="semibold">{visibleMovements.length}</AppText>
                  </View>
                </View>
              </View>
              <View
                style={[
                  styles.movementTotalsCard,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}
              >
                <AppText size="small" weight="semibold">Movement totals</AppText>
                <View style={styles.movementTotalsHeading}>
                  <AppText size="small" tone="secondary" style={styles.movementTotalsUnit}>
                    Unit
                  </AppText>
                  <AppText size="small" tone="secondary" style={styles.movementTotalsValue}>
                    Received
                  </AppText>
                  <AppText size="small" tone="secondary" style={styles.movementTotalsValue}>
                    Out
                  </AppText>
                  <AppText size="small" tone="secondary" style={styles.movementTotalsValue}>
                    Net
                  </AppText>
                </View>
                {movementTotals.length ? movementTotals.map((total) => {
                  const net = total.received - total.out;
                  return (
                    <View
                      key={`${total.unitName}-${total.unitAbbreviation}`}
                      style={[styles.movementTotalsRow, { borderTopColor: theme.border }]}
                    >
                      <AppText size="small" weight="semibold" style={styles.movementTotalsUnit} numberOfLines={1}>
                        {total.unitAbbreviation
                          ? `${total.unitName} (${total.unitAbbreviation})`
                          : total.unitName}
                      </AppText>
                      <AppText size="small" style={[styles.movementTotalsValue, { color: receivedColorForTheme(theme.mode) }]}>
                        {formatInventoryAmount(total.received)}
                      </AppText>
                      <AppText size="small" style={[styles.movementTotalsValue, { color: issuedColorForTheme(theme.mode) }]}>
                        {formatInventoryAmount(total.out)}
                      </AppText>
                      <AppText size="small" weight="semibold" style={styles.movementTotalsValue}>
                        {net > 0 ? "+" : net < 0 ? "−" : ""}
                        {formatInventoryAmount(net)}
                      </AppText>
                    </View>
                  );
                }) : (
                  <AppText size="small" tone="secondary" style={styles.movementTotalsEmpty}>
                    No stock movements in this period.
                  </AppText>
                )}
                <AppText size="small" tone="secondary" style={styles.movementTotalsNote}>
                  Totals stay separate by unit; different measurements are not combined.
                </AppText>
              </View>
              <View style={styles.productSectionHeading}>
                <View style={styles.productSectionTitle}>
                  <AppText size="heading" weight="semibold">Stock by product</AppText>
                  <AppText size="small" tone="secondary">
                    Expand a product to review its movements
                  </AppText>
                </View>
                <View
                  style={[
                    styles.productCountBadge,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                    {filteredReconciliation.length}
                  </AppText>
                </View>
              </View>
              {filteredReconciliation.map((product) => {
                const expanded = Boolean(expandedProducts[product.product_id]);
                const showAllMovements = Boolean(allMovementsVisible[product.product_id]);
                const receivedColor = receivedColorForTheme(theme.mode);
                const issuedColor = issuedColorForTheme(theme.mode);
                const matchingMovements = product.periodMovements.filter((movement) =>
                  movementFilter === "all" ||
                  (movementFilter === "in"
                    ? Number(movement.quantity_delta) > 0
                    : Number(movement.quantity_delta) < 0),
                );
                const shownMovements = expanded
                  ? matchingMovements.slice(0, showAllMovements ? undefined : 4)
                  : matchingMovements.slice(0, 4);
                const difference = product.closing - product.expectedClosing;
                const hasDifference = Math.abs(difference) > 0.001;
                const barTotal = Math.max(
                  product.out + Math.max(product.closing, 0),
                  product.opening + product.received,
                  1,
                );
                const outWidth = Math.min((product.out / barTotal) * 100, 100);
                const closingWidth = Math.min(
                  (Math.max(product.closing, 0) / barTotal) * 100,
                  100 - outWidth,
                );
                return (
                  <View
                    key={product.product_id}
                    style={[
                      styles.inventoryProduct,
                      { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                    ]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      onPress={() => setExpandedProducts((current) => ({
                        ...current,
                        [product.product_id]: !expanded,
                      }))}
                      style={styles.inventoryProductHeading}
                    >
                      <View style={styles.inventoryProductTitle}>
                        <AppText size="body" weight="semibold">{product.product_name}</AppText>
                        <AppText size="small" tone="secondary">
                          {product.product_type.charAt(0).toUpperCase() + product.product_type.slice(1)} · {product.periodMovements.length} movements
                        </AppText>
                      </View>
                      <View style={styles.onHandValue}>
                        <View style={styles.onHandAmount}>
                          <AppText size="body" weight="semibold" style={styles.onHandNumber}>
                            {formatInventoryAmount(product.currentQuantity)}
                          </AppText>
                          <AppText size="small" weight="semibold" style={{ color: theme.text }}>
                            {product.unit_abbreviation}
                          </AppText>
                        </View>
                        <AppText size="small" tone="secondary">on hand</AppText>
                      </View>
                      <Ionicons
                        name={expanded ? "chevron-up" : "chevron-down"}
                        size={18}
                        color={theme.textSecondary}
                      />
                    </Pressable>
                    <View style={[styles.reconciliationGrid, { borderColor: theme.border }]}>
                      <View style={styles.reconciliationItem}>
                        <AppText size="small" tone="secondary">Opening</AppText>
                        <InventoryQuantityCell value={product.opening} unit={product.unit_abbreviation} compact />
                      </View>
                      <View style={styles.reconciliationItem}>
                        <AppText size="small" tone="secondary">+ Received</AppText>
                        <InventoryQuantityCell value={product.received} unit={product.unit_abbreviation} color={receivedColor} compact />
                      </View>
                      <View style={styles.reconciliationItem}>
                        <AppText size="small" tone="secondary">− Out</AppText>
                        <InventoryQuantityCell value={product.out} unit={product.unit_abbreviation} color={issuedColor} compact />
                      </View>
                      <View style={styles.reconciliationItem}>
                        <AppText size="small" tone="secondary">= Closing</AppText>
                        <InventoryQuantityCell value={product.closing} unit={product.unit_abbreviation} strong compact />
                      </View>
                    </View>
                    <View
                      accessibilityLabel={`Stock movement balance: ${formatInventoryAmount(product.out)} out and ${formatInventoryAmount(product.closing)} closing`}
                      style={[styles.stockBalanceBar, { backgroundColor: theme.backgroundSelected }]}
                    >
                      <View
                        style={[
                          styles.stockBalanceSegment,
                          { width: `${outWidth}%`, backgroundColor: issuedColor },
                        ]}
                      />
                      <View
                        style={[
                          styles.stockBalanceSegment,
                          { width: `${closingWidth}%`, backgroundColor: theme.primary },
                        ]}
                      />
                    </View>
                    <View style={styles.productCardFooter}>
                      <View
                        style={[
                          styles.stockStatus,
                          { backgroundColor: theme.backgroundSelected },
                        ]}
                      >
                        <Ionicons
                          name={hasDifference ? "alert-circle-outline" : "checkmark-circle"}
                          size={15}
                          color={hasDifference ? issuedColor : receivedColor}
                        />
                        <AppText
                          size="small"
                          weight="semibold"
                          style={{ color: hasDifference ? issuedColor : receivedColor }}
                        >
                          {hasDifference
                            ? `Difference ${formatSignedInventoryQuantity(difference, product.unit_abbreviation)}`
                            : "Balanced"}
                        </AppText>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => router.push(`/products/${product.product_id}/inventory` as Href)}
                        style={styles.productStockLink}
                      >
                        <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                          Stock details
                        </AppText>
                        <Ionicons name="arrow-forward" size={14} color={theme.primary} />
                      </Pressable>
                    </View>
                    {expanded ? (
                      <View style={[styles.productMovementList, { borderTopColor: theme.border }]}>
                        <AppText size="small" weight="semibold">
                          Movement history
                        </AppText>
                        {shownMovements.map((movement) => (
                          <InventoryMovementRow
                            key={movement.id}
                            movement={movement}
                          />
                        ))}
                        {matchingMovements.length > 4 ? (
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => setAllMovementsVisible((current) => ({
                              ...current,
                              [product.product_id]: !showAllMovements,
                            }))}
                            style={styles.showMovementsAction}
                          >
                            <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                              {showAllMovements
                                ? "Show fewer movements"
                                : `Show all ${matchingMovements.length} movements`}
                            </AppText>
                            <Ionicons
                              name={showAllMovements ? "chevron-up" : "chevron-down"}
                              size={15}
                              color={theme.primary}
                            />
                          </Pressable>
                        ) : null}
                        {!shownMovements.length ? (
                          <AppText size="small" tone="secondary">
                            {movementFilter === "all"
                              ? "No movements in this period."
                              : `No ${movementFilter === "in" ? "received" : "outgoing"} movements in this period.`}
                          </AppText>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
              {!filteredReconciliation.length ? (
                <EmptyState
                  message={productSearch
                    ? `No products match “${productSearch.trim()}”.`
                    : "No tracked inventory is available for this report."}
                />
              ) : null}
              {!visibleMovements.length ? (
                <AppText size="small" tone="secondary">
                  No stock movements were recorded during this date range.
                </AppText>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </>
  );
}

async function fetchAllInventoryMovements(
  farmId: string,
): Promise<InventoryMovement[]> {
  const records: InventoryMovement[] = [];
  const limit = 200;
  let offset = 0;
  while (true) {
    const page = await getInventory(farmId, undefined, limit, offset);
    records.push(...page.movements);
    if (page.movements.length < limit) return records;
    offset += page.movements.length;
  }
}

function inventoryMovementLabel(
  movementType: InventoryMovement["movement_type"],
): string {
  const labels: Record<InventoryMovement["movement_type"], string> = {
    opening_balance: "Opening stock",
    receipt: "Received",
    sale: "Sold",
    consumption: "Used",
    loss: "Loss",
    customer_return: "Customer return",
    supplier_return: "Supplier return",
    settlement_received: "Stock received",
    settlement_issued: "Stock issued",
    adjustment: "Adjustment",
    valuation: "Valuation",
  };
  return labels[movementType];
}

function InventoryQuantityCell({
  value,
  unit,
  color,
  strong = false,
  compact = false,
}: {
  value: number;
  unit: string;
  color?: string;
  strong?: boolean;
  compact?: boolean;
}) {
  return (
    <AppText
      size="small"
      weight={strong ? "semibold" : "regular"}
      style={[styles.reconciliationCell, color ? { color } : null]}
    >
      {compact ? formatInventoryAmount(value) : formatInventoryQuantity(value, unit)}
    </AppText>
  );
}

function InventoryMovementRow({ movement }: { movement: InventoryMovement }) {
  const { theme } = useTheme();
  const quantity = Number(movement.quantity_delta);
  const incoming = quantity > 0;
  const movementColor = incoming
    ? receivedColorForTheme(theme.mode)
    : issuedColorForTheme(theme.mode);
  return (
    <View
      style={[
        styles.inventoryMovementRow,
        { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
      ]}
    >
      <View style={[styles.movementIcon, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons
          name={incoming ? "arrow-down-outline" : "arrow-up-outline"}
          size={17}
          color={movementColor}
        />
      </View>
      <View style={styles.inventoryMovementDescription}>
        <AppText size="small" weight="semibold">
          {inventoryMovementLabel(movement.movement_type)}
        </AppText>
        <AppText size="small" tone="secondary">
          {formatDateLabel(movement.occurred_on)}
        </AppText>
        {movement.notes ? (
          <AppText size="small" style={{ color: theme.text }}>
            {movement.notes}
          </AppText>
        ) : null}
      </View>
      <View style={[styles.movementAmount, { backgroundColor: theme.backgroundElement }]}>
        <AppText size="small" weight="semibold" style={{ color: movementColor }}>
          {formatSignedInventoryQuantity(quantity, movement.unit_abbreviation || movement.unit_name)}
        </AppText>
      </View>
    </View>
  );
}

function AccountsReportDetail() {
  const { user } = useAuth();
  const selectedFarm = useFarm().selectedFarm;
  const { theme } = useTheme();
  const farmId = selectedFarm?.id;
  const currency = selectedFarm?.settings?.currency ?? "KES";
  const range = useDateRange();
  const [selectedContactId, setSelectedContactId] = useState<string>();
  const [accountSearch, setAccountSearch] = useState("");
  const [accountRole, setAccountRole] = useState<"all" | ContactRole>("all");
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [activitySearch, setActivitySearch] = useState("");
  const [activityFilter, setActivityFilter] = useState<"all" | "sales" | "purchases" | "open">("all");
  const contactsQuery = useContacts(
    user?.id,
    farmId,
    accountSearch,
    accountRole === "all" ? undefined : accountRole,
  );
  const contacts = contactsQuery.data?.pages.flatMap((page) => page) ?? [];
  const selectedContact = contacts.find((contact) => contact.id === selectedContactId);
  const ledgerQuery = useAccountLedger(
    user?.id,
    farmId,
    selectedContactId,
    range.fromDate,
    range.toDate,
  );
  const completeLedgerQuery = useAccountLedger(
    user?.id,
    farmId,
    selectedContactId,
    "",
    "",
  );
  const ledger = ledgerQuery.data;
  const completeLedger = completeLedgerQuery.data;
  const currentAccounts = completeLedger?.accounts ?? [];
  const balanceByContact = new Map(
    currentAccounts.map((account) => [
      account.contact_id ?? "unassigned",
      Number(account.balance),
    ]),
  );
  const sortedContacts = [...contacts].sort((a, b) => {
    const balanceA = Math.abs(balanceByContact.get(a.id) ?? 0);
    const balanceB = Math.abs(balanceByContact.get(b.id) ?? 0);
    return balanceB - balanceA || a.name.localeCompare(b.name);
  });
  const customerOwed = currentAccounts
    .filter((account) => account.roles.includes("customer") && Number(account.balance) > 0)
    .reduce((sum, account) => sum + Number(account.balance), 0);
  const supplierOwed = currentAccounts
    .filter((account) => account.roles.includes("supplier") && Number(account.balance) < 0)
    .reduce((sum, account) => sum + Math.abs(Number(account.balance)), 0);
  const contactAccountCount = currentAccounts.filter(
    (account) => account.contact_id !== null,
  ).length;
  const selectedAccount = currentAccounts.find(
    (account) => account.contact_id === selectedContactId,
  );
  const events = ledger?.events ?? [];
  const salesInPeriod = events
    .filter((event) => event.event_type === "transaction" && event.transaction_type === "sale")
    .reduce((sum, event) => sum + Number(event.amount), 0);
  const purchasesInPeriod = events
    .filter((event) => event.event_type === "transaction" && event.transaction_type === "purchase")
    .reduce((sum, event) => sum + Math.abs(Number(event.amount)), 0);
  const cashTotals = getAccountCashTotals(events);
  const periodTransactionIds = new Set(events.map((event) => event.transaction_id));
  const threadEvents = (completeLedger?.events ?? []).filter((event) =>
    periodTransactionIds.has(event.transaction_id),
  );
  const transactionGroups = groupLedgerEventsByTransaction(
    threadEvents,
    range.fromDate,
    range.toDate,
  );
  const normalizedActivitySearch = activitySearch.trim().toLocaleLowerCase();
  const visibleTransactionGroups = transactionGroups.filter((group) => {
    const balance = group.events.reduce((sum, event) => sum + Number(event.amount), 0);
    if (activityFilter === "sales" && group.transactionType !== "sale") return false;
    if (activityFilter === "purchases" && group.transactionType !== "purchase") return false;
    if (activityFilter === "open" && Math.abs(balance) < 0.005) return false;
    if (!normalizedActivitySearch) return true;
    const searchableText = group.events.flatMap((event) => [
      event.contact_name ?? "",
      event.description,
      event.reference_number ?? "",
      event.payment_reference ?? "",
      ...event.components.flatMap((component) => [
        component.label,
        component.reference_number ?? "",
      ]),
    ]).join(" ").toLocaleLowerCase();
    return searchableText.includes(normalizedActivitySearch);
  });
  const transactionCounts = {
    all: transactionGroups.length,
    sales: transactionGroups.filter((group) => group.transactionType === "sale").length,
    purchases: transactionGroups.filter((group) => group.transactionType === "purchase").length,
    open: transactionGroups.filter(
      (group) => Math.abs(group.events.reduce((sum, event) => sum + Number(event.amount), 0)) >= 0.005,
    ).length,
  };
  return (
    <>
      {ledgerQuery.isLoading || completeLedgerQuery.isLoading ? (
        <LoadingState label="Loading account activity" />
      ) : null}
      {!selectedContactId && completeLedger ? (
        <View style={[styles.accountSummary, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <View style={styles.accountSummaryHeading}>
            <View>
              <AppText size="body" weight="semibold">Current balances</AppText>
              <AppText size="small" tone="secondary">Across customer and supplier accounts</AppText>
            </View>
            <View style={[styles.accountBalancePill, { backgroundColor: theme.backgroundSelected }]}>
              <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                {formatQuantity(contactAccountCount)} accounts
              </AppText>
            </View>
          </View>
          <View style={[styles.accountSummaryTotals, { borderTopColor: theme.border }]}>
            <View style={styles.accountSummaryTotal}>
              <AppText size="small" tone="secondary">Customers owe you</AppText>
              <AppText weight="semibold" style={{ color: theme.success }}>{money(customerOwed, currency)}</AppText>
            </View>
            <View style={[styles.accountSummaryTotal, styles.accountSummaryDivider, { borderLeftColor: theme.border }]}>
              <AppText size="small" tone="secondary">You owe suppliers</AppText>
              <AppText weight="semibold" style={{ color: getAccountStatusPalette(theme, "warning").text }}>
                {money(supplierOwed, currency)}
              </AppText>
            </View>
          </View>
        </View>
      ) : null}
      <AccountPeriodControl {...range} />
      <View style={styles.accountDirectoryHeading}>
        <View style={styles.flockSectionTitle}>
          <AppText size="body" weight="semibold">Account</AppText>
          <AppText size="small" tone="secondary">Review everyone or focus on one customer or supplier</AppText>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          selectedContact
            ? `Change account, currently ${formatCustomerDisplayName(selectedContact.name)}`
            : "Choose account, currently all accounts"
        }
        onPress={() => setAccountPickerOpen(true)}
        style={({ pressed }) => [
          styles.accountPickerTrigger,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: selectedContact ? theme.primary : theme.border,
            opacity: pressed ? 0.78 : 1,
          },
        ]}
      >
        <View style={[styles.accountPickerIcon, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name={selectedContact ? "person-outline" : "people-outline"} size={19} color={theme.primary} />
        </View>
        <View style={styles.accountPickerCopy}>
          <AppText weight="semibold">
            {selectedContact ? formatCustomerDisplayName(selectedContact.name) : "All accounts"}
          </AppText>
          <AppText size="small" tone="secondary">
            {selectedContact
              ? selectedContact.roles.map(formatContactRole).join(" · ")
              : "Customers, suppliers and unassigned activity"}
          </AppText>
        </View>
        <Ionicons name="chevron-down" size={20} color={theme.textSecondary} />
      </Pressable>
      <Modal
        visible={accountPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAccountPickerOpen(false)}
      >
        <View style={styles.accountPickerModalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close account picker"
            onPress={() => setAccountPickerOpen(false)}
            style={styles.accountPickerScrim}
          />
          <SafeAreaView
            edges={["bottom"]}
            style={[
              styles.accountPickerSheet,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
          >
            <View style={styles.accountPickerHeader}>
              <View style={styles.flockSectionTitle}>
                <AppText size="heading" weight="semibold">Choose account</AppText>
                <AppText size="small" tone="secondary">Balances and recent activity</AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close account picker"
                onPress={() => setAccountPickerOpen(false)}
                style={styles.accountPickerClose}
              >
                <Ionicons name="close" size={22} color={theme.text} />
              </Pressable>
            </View>
            <View style={[styles.accountSearch, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
              <TextInput
                value={accountSearch}
                onChangeText={setAccountSearch}
                placeholder="Search accounts"
                placeholderTextColor={theme.textSecondary}
                style={[styles.accountSearchInput, { color: theme.text }]}
                returnKeyType="search"
              />
              {accountSearch ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Clear account search" onPress={() => setAccountSearch("")}>
                  <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
                </Pressable>
              ) : null}
            </View>
            <View style={[styles.accountRoleTabs, { backgroundColor: theme.background, borderColor: theme.border }]}>
              {(["all", "customer", "supplier"] as const).map((role) => (
                <Pressable
                  key={role}
                  accessibilityRole="button"
                  accessibilityState={{ selected: accountRole === role }}
                  onPress={() => setAccountRole(role)}
                  style={[styles.accountRoleTab, accountRole === role && { backgroundColor: theme.primary }]}
                >
                  <AppText size="small" weight="semibold" style={{ color: accountRole === role ? theme.onPrimary : theme.textSecondary }}>
                    {role === "all" ? "All" : role === "customer" ? "Customers" : "Suppliers"}
                  </AppText>
                </Pressable>
              ))}
            </View>
            <ScrollView
              style={styles.accountPickerList}
              contentContainerStyle={styles.accountPickerListContent}
              keyboardShouldPersistTaps="handled"
            >
              <ContactOption
                name="All transactions"
                roles="All contacts and unassigned transactions"
                currency={currency}
                balance={0}
                balanceLabel="All accounts"
                lastActivity=""
                selected={!selectedContactId}
                onPress={() => {
                  setSelectedContactId(undefined);
                  setAccountPickerOpen(false);
                }}
              />
      {contactsQuery.isLoading ? <LoadingState label="Loading accounts" /> : null}
      {contactsQuery.isError ? <QueryError error={contactsQuery.error} retry={() => void contactsQuery.refetch()} /> : null}
      {sortedContacts.map((contact) => {
        const selected = contact.id === selectedContactId;
        const account = currentAccounts.find((item) => item.contact_id === contact.id);
        const accountBalance = Number(account?.balance ?? 0);
        return (
          <ContactOption
            key={contact.id}
            name={formatCustomerDisplayName(contact.name)}
            roles={contact.roles.map(formatContactRole).join(" · ")}
            currency={currency}
            balance={accountBalance}
            balanceLabel={getAccountBalanceLabel(accountBalance, contact.roles)}
            lastActivity={account?.last_activity ? formatAccountDate(account.last_activity) : "No activity"}
            selected={selected}
            onPress={() => {
              setSelectedContactId(contact.id);
              setAccountPickerOpen(false);
            }}
          />
        );
      })}
      {contactsQuery.hasNextPage ? (
        <Button label={contactsQuery.isFetchingNextPage ? "Loading accounts" : "Load more accounts"} variant="secondary" onPress={() => void contactsQuery.fetchNextPage()} />
      ) : null}
      {!contactsQuery.isLoading && !contacts.length ? <EmptyState message="No customer or supplier accounts are recorded." /> : null}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
      {selectedContact && completeLedger ? (
        <View
          style={[
            styles.accountSelectedBalance,
            { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
          ]}
        >
          <View style={styles.accountSelectedBalanceCopy}>
            <AppText size="small" weight="semibold">Current account position</AppText>
            <AppText size="small" tone="secondary">
              {getAccountBalanceLabel(Number(selectedAccount?.balance ?? 0), selectedContact.roles)}
            </AppText>
          </View>
          <AppText size="body" weight="semibold" style={styles.accountSelectedBalanceValue}>
            {money(Math.abs(Number(selectedAccount?.balance ?? 0)), currency)}
          </AppText>
        </View>
      ) : null}
      {selectedContact ? (
        <View style={[styles.accountContactCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <View style={styles.accountContactInfo}>
            {selectedContact.phone ? (
              <AppText size="small" tone="secondary">{formatContactPhone(selectedContact.phone)}</AppText>
            ) : null}
            {selectedContact.email ? (
              <AppText size="small" tone="secondary" style={styles.accountMetadataText}>
                {formatLedgerReference(selectedContact.email)}
              </AppText>
            ) : null}
            {!selectedContact.phone && !selectedContact.email ? (
              <AppText size="small" tone="secondary">No contact details recorded</AppText>
            ) : null}
          </View>
          <View style={styles.accountContactActions}>
            {selectedContact.phone ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void openContactLink(`tel:${selectedContact.phone}`, "call")}
                  style={[styles.accountContactAction, { backgroundColor: theme.backgroundSelected }]}
                >
                  <Ionicons name="call-outline" size={16} color={theme.primary} />
                  <AppText size="small" weight="semibold" style={{ color: theme.primary }}>Call</AppText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void openContactLink(`https://wa.me/${formatWhatsAppPhone(selectedContact.phone ?? "")}`, "WhatsApp")}
                  style={[styles.accountContactAction, { backgroundColor: theme.backgroundSelected }]}
                >
                  <Ionicons name="logo-whatsapp" size={16} color={theme.primary} />
                  <AppText size="small" weight="semibold" style={{ color: theme.primary }}>WhatsApp</AppText>
                </Pressable>
              </>
            ) : null}
            {selectedContact.email ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void openContactLink(`mailto:${selectedContact.email}`, "email")}
                style={[styles.accountContactAction, { backgroundColor: theme.backgroundSelected }]}
              >
                <Ionicons name="mail-outline" size={16} color={theme.primary} />
                <AppText size="small" weight="semibold" style={{ color: theme.primary }}>Email</AppText>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
      {selectedContact && ledger ? (
        <View style={[styles.accountStatement, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <AppText size="small" weight="semibold">Balance movement</AppText>
          <AccountStatementRow
            label={`Opening · before ${range.fromDate ? formatAccountDate(range.fromDate) : "all recorded activity"}`}
            value={formatAccountBalance(Number(ledger.opening_balance ?? 0), currency, selectedContact.roles)}
            theme={theme}
          />
          <AccountStatementRow
            label="Net change in selected period"
            value={formatAccountMovement(
              Number(ledger.closing_balance ?? 0) - Number(ledger.opening_balance ?? 0),
              currency,
              selectedContact.roles,
            )}
            theme={theme}
          />
          <AccountStatementRow
            label={range.toDate ? `Closing · ${formatAccountDate(range.toDate)}` : "Closing · current"}
            value={formatAccountBalance(Number(ledger.closing_balance ?? 0), currency, selectedContact.roles)}
            theme={theme}
            last
          />
        </View>
      ) : null}
      <View style={styles.accountPeriodSummaryHeading}>
        <AppText size="body" weight="semibold">Period totals</AppText>
        <AppText size="small" tone="secondary">Cash movement is separate from transaction totals.</AppText>
      </View>
      <View style={[styles.accountFlowCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <View style={styles.accountFlowMetrics}>
          <View style={styles.accountFlowMetric}>
            <View style={styles.accountFlowLabel}>
              <Ionicons name="arrow-down-circle-outline" size={17} color={theme.success} />
              <AppText size="small" tone="secondary">Cash received</AppText>
            </View>
            <AppText size="body" weight="semibold" style={{ color: theme.success }}>
              {money(cashTotals.received, currency)}
            </AppText>
          </View>
          <View style={[styles.accountFlowMetric, styles.accountFlowDivider, { borderLeftColor: theme.border }]}>
            <View style={styles.accountFlowLabel}>
              <Ionicons name="arrow-up-circle-outline" size={17} color={theme.textSecondary} />
              <AppText size="small" tone="secondary">Cash paid</AppText>
            </View>
            <AppText size="body" weight="semibold">
              {money(cashTotals.paid, currency)}
            </AppText>
          </View>
        </View>
        <View style={[styles.accountFlowBreakdown, { borderTopColor: theme.border }]}>
          <View style={styles.accountFlowGross}>
            <AppText size="small" tone="secondary">Sales total</AppText>
            <AppText size="small" weight="semibold">{money(salesInPeriod, currency)}</AppText>
          </View>
          <View style={[styles.accountFlowGross, styles.accountFlowGrossDivider, { borderLeftColor: theme.border }]}>
            <AppText size="small" tone="secondary">Purchases total</AppText>
            <AppText size="small" weight="semibold">{money(purchasesInPeriod, currency)}</AppText>
          </View>
          <AppText size="small" tone="secondary" style={styles.accountFlowTransactionCount}>
            {formatQuantity(transactionGroups.length)} {transactionGroups.length === 1 ? "transaction" : "transactions"}
          </AppText>
        </View>
      </View>
      {ledgerQuery.isError ? <QueryError error={ledgerQuery.error} retry={() => void ledgerQuery.refetch()} /> : null}
      {!ledgerQuery.isError && completeLedgerQuery.isError ? (
        <QueryError error={completeLedgerQuery.error} retry={() => void completeLedgerQuery.refetch()} />
      ) : null}
      <View style={styles.accountLedgerHeading}>
        <View style={styles.accountActivityTitle}>
          <AppText size="body" weight="semibold">
            {selectedContact ? "Account activity" : "All transactions"}
          </AppText>
          <AppText size="small" tone="secondary">
            Find a transaction or focus on balances that still need attention.
          </AppText>
        </View>
        {ledger ? (
          <View style={styles.accountExportAction}>
            <ReportExportActions
              label="Export"
              compact
              data={createAccountExportData(
                events,
                selectedContact,
                currency,
                selectedFarm?.name ?? "FarmTrack",
                selectedFarm?.settings?.logo_path,
                range.fromDate,
                range.toDate,
                ledger.opening_balance,
                ledger.closing_balance,
                currentAccounts,
              )}
              resolveData={async () => {
                if (!farmId) throw new Error("Select a farm before exporting this report.");
                const [latest, latestCurrent] = await Promise.all([
                  getAccountLedger(farmId, {
                    contactId: selectedContactId,
                    fromDate: range.fromDate,
                    toDate: range.toDate,
                  }),
                  getAccountLedger(farmId, {
                    contactId: selectedContactId,
                    fromDate: "",
                    toDate: "",
                  }),
                ]);
                return createAccountExportData(
                  latest.events,
                  selectedContact,
                  currency,
                  selectedFarm?.name ?? "FarmTrack",
                  selectedFarm?.settings?.logo_path,
                  range.fromDate,
                  range.toDate,
                  latest.opening_balance,
                  latest.closing_balance,
                  latestCurrent.accounts,
                );
              }}
            />
          </View>
        ) : null}
      </View>
      <View style={[styles.accountActivitySearch, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
        <TextInput
          value={activitySearch}
          onChangeText={setActivitySearch}
          placeholder="Search name, item or receipt"
          placeholderTextColor={theme.textSecondary}
          style={[styles.accountActivitySearchInput, { color: theme.text }]}
          returnKeyType="search"
          accessibilityLabel="Search transactions by contact, item, or receipt"
        />
        {activitySearch ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear transaction search"
            onPress={() => setActivitySearch("")}
            style={styles.accountActivitySearchClear}
          >
            <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.accountActivityFilters}>
        {([
          ["all", "All", transactionCounts.all],
          ["sales", "Sales", transactionCounts.sales],
          ["purchases", "Purchases", transactionCounts.purchases],
          ["open", "Unsettled", transactionCounts.open],
        ] as const).map(([key, label, count]) => {
          const selected = activityFilter === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setActivityFilter(key)}
              style={[
                styles.accountActivityFilter,
                {
                  backgroundColor: selected ? theme.primary : theme.backgroundElement,
                  borderColor: selected ? theme.primary : theme.border,
                },
              ]}
            >
              <AppText
                size="small"
                weight="semibold"
                style={{ color: selected ? theme.onPrimary : theme.textSecondary }}
              >
                {label}
              </AppText>
              <AppText
                size="small"
                weight="semibold"
                style={{ color: selected ? theme.onPrimary : theme.textSecondary }}
              >
                {count}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.accountResultsHeading}>
        <AppText size="small" weight="semibold">
          {formatQuantity(visibleTransactionGroups.length)} {visibleTransactionGroups.length === 1 ? "record" : "records"}
        </AppText>
        <AppText size="small" tone="secondary">Tap a record to review payments and adjustments</AppText>
      </View>
      <View style={[styles.accountTransactionList, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {visibleTransactionGroups.map((group, index) => (
          <AccountTransactionRow
            key={group.transactionId}
            group={group}
            currency={currency}
            fromDate={range.fromDate}
            toDate={range.toDate}
            last={index === visibleTransactionGroups.length - 1}
            onPress={() => router.push(
              group.transactionType === "sale"
                ? `/sales/${group.transactionId}`
                : `/purchases/${group.transactionId}` as Href,
            )}
          />
        ))}
        {ledger && completeLedger && visibleTransactionGroups.length === 0 ? (
          <View style={styles.accountEmpty}>
            <Ionicons name={transactionGroups.length ? "search-outline" : "receipt-outline"} size={24} color={theme.textSecondary} />
            <AppText weight="semibold">
              {transactionGroups.length ? "No matching transactions" : "No activity in this period"}
            </AppText>
            <AppText size="small" tone="secondary" style={{ textAlign: "center" }}>
              {transactionGroups.length
                ? "Try another search or choose a different filter."
                : "Choose another date range to see recorded transactions."}
            </AppText>
            {transactionGroups.length ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setActivitySearch("");
                  setActivityFilter("all");
                }}
              >
                <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                  Clear search and filters
                </AppText>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => range.setRange("", "")}>
                <AppText size="small" weight="semibold" style={{ color: theme.primary }}>Show all dates</AppText>
              </Pressable>
            )}
          </View>
        ) : null}
      </View>
    </>
  );
}

function createAccountExportData(
  events: AccountLedgerEvent[],
  contact: Contact | undefined,
  currency: string,
  farmName: string,
  logoPath: string | null | undefined,
  fromDate: string,
  toDate: string,
  openingBalance: number | string | null,
  closingBalance: number | string | null,
  currentAccounts: AccountLedgerAccount[],
): ReportExportData {
  const transactionEvents = events.filter((event) => event.event_type === "transaction");
  const cashTotals = getAccountCashTotals(events);
  const selectedCurrentAccount = contact
    ? currentAccounts.find((account) => account.contact_id === contact.id)
    : undefined;
  const receivables = currentAccounts
    .filter((account) => account.roles.includes("customer") && Number(account.balance) > 0)
    .reduce((sum, account) => sum + Number(account.balance), 0);
  const payables = currentAccounts
    .filter((account) => account.roles.includes("supplier") && Number(account.balance) < 0)
    .reduce((sum, account) => sum + Math.abs(Number(account.balance)), 0);
  const summary: ReportExportData["summary"] = [
    { label: "Transactions", value: transactionEvents.length, kind: "number" },
    {
      label: "Sales",
      value: transactionEvents.reduce(
        (sum, event) => sum + (event.transaction_type === "sale" ? Number(event.amount) : 0),
        0,
      ),
      kind: "currency",
    },
    {
      label: "Purchases",
      value: transactionEvents.reduce(
        (sum, event) => sum + (event.transaction_type === "purchase" ? Math.abs(Number(event.amount)) : 0),
        0,
      ),
      kind: "currency",
    },
    { label: "Cash received", value: cashTotals.received, kind: "currency" },
    { label: "Cash paid", value: cashTotals.paid, kind: "currency" },
    ...(contact
      ? [{
          label: `Current position · ${getAccountBalanceLabel(Number(selectedCurrentAccount?.balance ?? 0), contact.roles)}`,
          value: Math.abs(Number(selectedCurrentAccount?.balance ?? 0)),
          kind: "currency" as const,
        }]
      : [
          { label: "Current customer receivables", value: receivables, kind: "currency" as const },
          { label: "Current supplier payables", value: payables, kind: "currency" as const },
          { label: "Accounts", value: currentAccounts.filter((account) => account.contact_id !== null).length, kind: "number" as const },
        ]),
    ...(contact
      ? [
          { label: "Opening balance", value: Number(openingBalance ?? 0), kind: "currency" as const },
          { label: "Period closing balance", value: Number(closingBalance ?? 0), kind: "currency" as const },
        ]
      : []),
  ];
  return {
    title: `${contact?.name ?? "All transactions"} account report`,
    farmName,
    farmLogoUri: getFarmLogoUri(logoPath),
    currencyCode: currency,
    fromDate,
    toDate,
    periodLabel: "All recorded activity (all dates)",
    summary,
    sheets: [
      {
        name: "Current balances",
        columns: [
          { key: "account", label: "Account" },
          { key: "roles", label: "Roles" },
          { key: "position", label: "Balance position" },
          { key: "balance", label: `Signed balance (${currency})`, kind: "currency" },
          { key: "lastActivity", label: "Last activity", kind: "date" },
        ],
        rows: currentAccounts.map((account) => ({
          account: account.contact_name || "Unassigned activity",
          roles: account.roles.map(formatContactRole).join(", ") || "Unassigned",
          position: formatAccountBalance(Number(account.balance), currency, account.roles),
          balance: Number(account.balance),
          lastActivity: account.last_activity?.slice(0, 10) ?? null,
        })),
      },
      ...(contact ? [{
        name: "Contact details",
        columns: [
          { key: "field", label: "Contact information" },
          { key: "value", label: "Details" },
        ],
        rows: [
          { field: "Name", value: contact.name },
          { field: "Role", value: contact.roles.map(formatContactRole).join(", ") },
          { field: "Phone", value: contact.phone },
          { field: "Email", value: contact.email },
          { field: "Address", value: contact.address },
        ],
      }] : []),
      {
        name: "Account activity",
        columns: [
          { key: "date", label: "Date", kind: "date" as const },
          { key: "time", label: "Time" },
          { key: "type", label: "Activity" },
          { key: "account", label: "Contact" },
          { key: "transaction", label: "Transaction" },
          { key: "description", label: "Description" },
          { key: "amount", label: `Account balance change (${currency})`, kind: "currency" as const },
          { key: "balance", label: `Account balance after event (${currency})`, kind: "currency" as const },
        ],
        rows: events.map((event) => ({
          date: event.event_date,
          time: event.event_time ?? "",
          type: getLedgerEventTitle(event, event.transaction_type),
          account: event.contact_name ?? "No contact assigned",
          transaction: event.reference_number ?? event.transaction_id,
          description: formatLedgerEventDescription(event),
          amount: Number(event.amount),
          balance: Number(event.running_balance),
        })),
      },
      {
        name: "Payments and settlement detail",
        columns: [
          { key: "date", label: "Date", kind: "date" as const },
          { key: "time", label: "Time" },
          { key: "activity", label: "Activity" },
          { key: "transaction", label: "Transaction" },
          { key: "component", label: "Component" },
          { key: "detail", label: "Details" },
          { key: "method", label: "Payment method" },
          { key: "reference", label: "Reference" },
          { key: "amount", label: `Component or cash amount (${currency})`, kind: "currency" as const },
        ],
        rows: events.flatMap((event) => {
          if (event.event_type === "payment" || event.event_type === "refund") {
            return [{
              date: event.event_date,
              time: event.event_time ?? "",
              activity: getLedgerEventTitle(event, event.transaction_type),
              transaction: event.reference_number ?? event.transaction_id,
              component: event.event_type === "refund" ? "Refund" : "Cash payment",
              detail: formatLedgerEventDescription(event),
              method: formatPaymentMethod(event.payment_method ?? "Payment"),
              reference: event.payment_reference ?? "",
              amount: Math.abs(Number(event.amount)),
            }];
          }
          if (event.event_type !== "settlement") return [];
          if (!event.components.length) {
            return [{
              date: event.event_date,
              time: event.event_time ?? "",
              activity: getLedgerEventTitle(event, event.transaction_type),
              transaction: event.reference_number ?? event.transaction_id,
              component: "Breakdown unavailable",
              detail: "No breakdown was saved for this settlement",
              method: event.payment_method ? formatPaymentMethod(event.payment_method) : "",
              reference: event.payment_reference ?? "",
              amount: event.cash_amount === null ? null : Number(event.cash_amount),
            }];
          }
          return event.components.map((component) => ({
            date: event.event_date,
            time: event.event_time ?? "",
            activity: getLedgerEventTitle(event, event.transaction_type),
            transaction: event.reference_number ?? event.transaction_id,
            component: component.kind === "cash"
              ? "Cash"
              : component.kind === "goods"
                ? "Goods"
                : "Service",
            detail: component.label,
            method: component.payment_method
              ? formatPaymentMethod(component.payment_method)
              : "",
            reference: component.reference_number ?? "",
            amount: Number(component.amount),
          }));
        }),
      },
    ],
  };
}

function formatContactRole(role: ContactRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function formatContactPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 12 && digits.startsWith("254")) {
    return `+254 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return phone;
}

function formatWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) {
    return `254${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith("254")) {
    return digits;
  }
  return digits;
}

async function openContactLink(url: string, action: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Unable to open link", `No app was available to ${action}.`);
  }
}

function getAccountBalanceLabel(balance: number, roles: ContactRole[] = []): string {
  if (Math.abs(balance) < 0.005) return "Settled";
  const isCustomer = roles.includes("customer");
  const isSupplier = roles.includes("supplier");
  if (isSupplier && !isCustomer) {
    return balance > 0 ? "Supplier credit" : "You owe supplier";
  }
  if (isCustomer && !isSupplier) {
    return balance > 0 ? "Owes you" : "Customer credit";
  }
  if (isCustomer && isSupplier) {
    return balance > 0 ? "Net receivable" : "Net payable";
  }
  return balance > 0 ? "Owes you" : "You owe";
}

function formatAccountBalance(
  balance: number,
  currency: string,
  roles: ContactRole[] = [],
): string {
  if (Math.abs(balance) < 0.005) return "Settled";
  return `${getAccountBalanceLabel(balance, roles)} ${money(Math.abs(balance), currency)}`;
}

function formatAccountMovement(
  amount: number,
  currency: string,
  roles: ContactRole[],
): string {
  if (Math.abs(amount) < 0.005) return "No balance change";
  return formatAccountBalance(amount, currency, roles);
}

function formatAccountDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
}

function isAccountEventInDateRange(
  event: AccountLedgerEvent,
  fromDate: string,
  toDate: string,
): boolean {
  const eventDate = event.event_date.slice(0, 10);
  return (!fromDate || eventDate >= fromDate) && (!toDate || eventDate <= toDate);
}

function formatLedgerReference(value: string): string {
  return value.replace(/(.{8})/g, "$1\u200B");
}

type LedgerTransactionThread = {
  transactionId: string;
  transactionType: AccountLedgerEvent["transaction_type"];
  contactName: string | null;
  events: AccountLedgerEvent[];
};

function groupLedgerEventsByTransaction(
  events: AccountLedgerEvent[],
  fromDate = "",
  toDate = "",
): LedgerTransactionThread[] {
  const groups = new Map<string, LedgerTransactionThread>();
  for (const event of events) {
    let group = groups.get(event.transaction_id);
    if (!group) {
      group = {
        transactionId: event.transaction_id,
        transactionType: event.transaction_type,
        contactName: event.contact_name,
        events: [],
      };
      groups.set(event.transaction_id, group);
    }
    group.events.push(event);
  }
  return [...groups.values()]
    .map((group) => ({
      group,
      latestActivity: group.events.reduce((latest, event) => {
        if (!isAccountEventInDateRange(event, fromDate, toDate)) return latest;
        const occurredAt = `${event.event_date}T${event.event_time ?? "00:00:00"}`;
        return occurredAt > latest ? occurredAt : latest;
      }, ""),
    }))
    .sort((left, right) => right.latestActivity.localeCompare(left.latestActivity))
    .map(({ group }) => group);
}

function getAccountCashTotals(events: AccountLedgerEvent[]): {
  received: number;
  paid: number;
} {
  return events.reduce(
    (totals, event) => {
      if (event.event_type === "payment" || event.event_type === "refund") {
        const cashIn =
          (event.event_type === "payment" && event.transaction_type === "sale") ||
          (event.event_type === "refund" && event.transaction_type === "purchase");
        totals[cashIn ? "received" : "paid"] += Math.abs(Number(event.amount));
      } else if (event.event_type === "settlement" && event.cash_amount !== null) {
        totals[Number(event.amount) < 0 ? "received" : "paid"] += Number(event.cash_amount);
      }
      return totals;
    },
    { received: 0, paid: 0 },
  );
}

function AccountPeriodControl({
  fromDate,
  toDate,
  setRange,
}: {
  fromDate: string;
  toDate: string;
  setRange: (fromDate: string, toDate: string) => void;
}) {
  const { theme } = useTheme();
  const presets = [
    { key: "today", label: "Today" },
    { key: "week", label: "This week" },
    { key: "month", label: "This month" },
    { key: "all", label: "All time" },
    { key: "custom", label: "Custom" },
  ] as const;
  const active = identifyDatePreset(fromDate, toDate);

  return (
    <View style={styles.accountPeriodSection}>
      <View style={styles.accountPeriodHeading}>
        <View style={styles.flockSectionTitle}>
          <AppText size="body" weight="semibold">Activity period</AppText>
          <AppText size="small" tone="secondary">Choose which dates to review</AppText>
        </View>
      </View>
      <View style={styles.accountPeriodGrid}>
        {presets.map((preset) => (
          <Pressable
            key={preset.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active === preset.key }}
            onPress={() => {
              if (preset.key === "custom") {
                if (active !== "custom") {
                  const end = today();
                  const start = new Date(`${end}T00:00:00Z`);
                  start.setUTCDate(start.getUTCDate() - 6);
                  setRange(formatDate(start), end);
                }
              } else {
                setRange(...getDateRangePreset(preset.key));
              }
            }}
            style={[
              styles.accountPeriodButton,
              {
                backgroundColor: active === preset.key ? theme.backgroundSelected : theme.backgroundElement,
                borderColor: active === preset.key ? theme.primary : theme.border,
              },
            ]}
          >
            <AppText
              size="small"
              weight="semibold"
              style={{ color: active === preset.key ? theme.primary : theme.textSecondary }}
            >
              {preset.label}
            </AppText>
          </Pressable>
        ))}
      </View>
      <View style={[styles.accountPeriodRange, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
        <AppText size="small" weight="semibold" style={styles.accountPeriodDates}>
          {formatDateRangeLabel(fromDate, toDate)}
        </AppText>
      </View>
      {active === "custom" ? (
        <View style={styles.dateRow}>
          <DatePickerField label="From" value={fromDate} onChange={(value) => setRange(value, toDate)} style={styles.dateField} />
          <DatePickerField label="To" value={toDate} onChange={(value) => setRange(fromDate, value)} style={styles.dateField} />
        </View>
      ) : null}
    </View>
  );
}

function AccountStatementRow({
  label,
  value,
  theme,
  last = false,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>["theme"];
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.accountStatementRow,
        !last && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <AppText size="small" tone="secondary" style={styles.accountStatementLabel}>
        {label}
      </AppText>
      <AppText size="small" weight="semibold" style={styles.accountStatementValue}>
        {value}
      </AppText>
    </View>
  );
}

function AccountTransactionRow({
  group,
  currency,
  fromDate,
  toDate,
  last,
  onPress,
}: {
  group: LedgerTransactionThread;
  currency: string;
  fromDate: string;
  toDate: string;
  last: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const transactionEvent = group.events.find((event) => event.event_type === "transaction");
  const balance = group.events.reduce((sum, event) => sum + Number(event.amount), 0);
  const isCancelled = Boolean(transactionEvent?.description.startsWith("Cancelled · "));
  const balanceDisplay = getTransactionBalanceDisplay(group.transactionType, balance, currency);
  const balancePalette = getAccountStatusPalette(
    theme,
    isCancelled ? "neutral" : getTransactionStatusTone(group.transactionType, balance),
  );
  const transactionTotal = Math.abs(Number(transactionEvent?.amount ?? 0));
  const transactionDate = transactionEvent
    ? formatAccountDate(transactionEvent.event_date)
    : null;
  const latestPeriodEvent = group.events
    .filter((event) => isAccountEventInDateRange(event, fromDate, toDate))
    .reduce<AccountLedgerEvent | null>((latest, event) => {
      if (!latest) return event;
      const eventTime = `${event.event_date}T${event.event_time ?? "00:00:00"}`;
      const latestTime = `${latest.event_date}T${latest.event_time ?? "00:00:00"}`;
      return eventTime > latestTime ? event : latest;
    }, null);
  const additionalEventCount = group.events.filter((event) => event.event_type !== "transaction").length;
  const description = transactionEvent
    ? formatLedgerEventDescription(transactionEvent)
    : "Transaction details unavailable";
  const transactionTitle = group.transactionType === "sale" ? "Sale" : "Purchase";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${isCancelled ? "Cancelled " : ""}${transactionTitle} for ${group.contactName ?? "unassigned account"}, ${isCancelled ? "cancelled" : balanceDisplay.settled ? "settled" : `${balanceDisplay.detail}, ${balanceDisplay.value}`}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.accountTransactionRow,
        !last && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}
    >
      <View style={styles.accountTransactionMain}>
        <View style={[styles.accountTransactionIcon, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons
            name={group.transactionType === "sale" ? "cart-outline" : "bag-handle-outline"}
            size={18}
            color={theme.primary}
          />
        </View>
        <View style={styles.accountTransactionCopy}>
          <View style={styles.accountTransactionHeading}>
            <AppText size="body" weight="semibold" style={styles.accountTransactionContact}>
              {group.contactName ? formatCustomerDisplayName(group.contactName) : "No contact assigned"}
            </AppText>
            <View style={[styles.accountTransactionType, { backgroundColor: theme.backgroundSelected }]}>
              <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                {isCancelled ? `Cancelled ${transactionTitle.toLowerCase()}` : transactionTitle}
              </AppText>
            </View>
          </View>
          <AppText size="small" tone="secondary">
            {description}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
      </View>
      <View style={styles.accountTransactionFooter}>
        <View style={styles.accountTransactionMeta}>
          <AppText size="small" tone="secondary">
            {isCancelled ? "Original value" : `${transactionTitle} total`} · {money(transactionTotal, currency)}
          </AppText>
          {transactionDate ? (
            <AppText size="small" tone="secondary">{transactionDate}</AppText>
          ) : null}
          {additionalEventCount > 0 ? (
            <AppText size="small" tone="secondary">
              {additionalEventCount} {additionalEventCount === 1 ? "account update" : "account updates"}
            </AppText>
          ) : null}
          {latestPeriodEvent && transactionDate &&
            latestPeriodEvent.event_date.slice(0, 10) !== transactionEvent?.event_date.slice(0, 10) ? (
              <AppText size="small" tone="secondary">
                Latest activity {formatAccountDate(latestPeriodEvent.event_date)}
              </AppText>
            ) : null}
        </View>
        <View style={styles.accountTransactionAmounts}>
          <AppText size="small" tone="secondary">
            {isCancelled ? "Status" : balanceDisplay.settled ? "Status" : "Amount remaining"}
          </AppText>
          <AppText
            size={balanceDisplay.settled ? "small" : "body"}
            weight="semibold"
            style={{ color: balancePalette.text, textAlign: "right" }}
          >
            {isCancelled ? "Cancelled" : balanceDisplay.settled ? "Settled" : balanceDisplay.value}
          </AppText>
          {!isCancelled && !balanceDisplay.settled ? (
            <AppText size="small" tone="secondary" style={styles.accountTransactionStatus}>
              {balanceDisplay.detail}
            </AppText>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function getTransactionBalanceDisplay(
  transactionType: AccountLedgerEvent["transaction_type"],
  balance: number,
  currency: string,
): { value: string; detail: string; settled: boolean } {
  if (Math.abs(balance) < 0.005) {
    return { value: "Settled", detail: "No amount remains", settled: true };
  }
  const amount = money(Math.abs(balance), currency);
  if (transactionType === "purchase") {
    return balance < 0
      ? {
          value: amount,
          detail: "Farm owes supplier",
          settled: false,
        }
      : {
          value: amount,
          detail: "Supplier owes farm",
          settled: false,
        };
  }
  return balance > 0
    ? {
        value: amount,
        detail: "Customer owes farm",
        settled: false,
      }
    : {
        value: amount,
        detail: "Farm owes customer",
        settled: false,
      };
}

type AccountVisualTone = "positive" | "warning" | "neutral";

function getAccountStatusPalette(
  theme: ReturnType<typeof useTheme>["theme"],
  tone: AccountVisualTone,
): { background: string; border: string; text: string } {
  if (tone === "positive") {
    return theme.mode === "dark"
      ? { background: "#193A2D", border: "#2D6249", text: "#A7E2BF" }
      : { background: "#E5F3EA", border: "#B8DCC5", text: "#206341" };
  }
  if (tone === "warning") {
    return theme.mode === "dark"
      ? { background: "#49351C", border: "#785B2D", text: "#F0C77C" }
      : { background: "#FFF1D6", border: "#E9D19E", text: "#80510B" };
  }
  return theme.mode === "dark"
    ? { background: "#29353A", border: "#45545B", text: "#C2D0D5" }
    : { background: "#EEF2F3", border: "#D4DEE1", text: "#4D6269" };
}

function getTransactionStatusTone(
  transactionType: AccountLedgerEvent["transaction_type"],
  balance: number,
): AccountVisualTone {
  if (Math.abs(balance) < 0.005) return "positive";
  if (transactionType === "purchase" && balance > 0) return "positive";
  if (transactionType === "sale" && balance < 0) return "warning";
  return "warning";
}

function getLedgerEventTitle(
  event: AccountLedgerEvent,
  transactionType: AccountLedgerEvent["transaction_type"],
): string {
  const contactName = event.contact_name
    ? formatCustomerDisplayName(event.contact_name)
    : null;
  if (event.event_type === "transaction") {
    return event.description.startsWith("Cancelled · ")
      ? "Transaction cancelled"
      : `${transactionType === "sale" ? "Sale" : "Purchase"} recorded`;
  }
  if (event.event_type === "payment") {
    const method = formatPaymentMethod(event.payment_method ?? "Payment");
    return transactionType === "sale"
      ? `${contactName ?? "Customer"} paid the farm · ${method}`
      : `Farm paid ${contactName ?? "supplier"} · ${method}`;
  }
  if (event.event_type === "settlement") {
    if (transactionType === "purchase") {
      return Number(event.amount) >= 0
        ? `Farm settled with ${contactName ?? "supplier"}`
        : `${contactName ?? "Supplier"} settled with the farm`;
    }
    return Number(event.amount) <= 0
      ? `${contactName ?? "Customer"} settled with the farm`
      : `Farm settled with ${contactName ?? "customer"}`;
  }
  if (event.event_type === "return") {
    return transactionType === "sale" ? "Goods returned by customer" : "Goods returned to supplier";
  }
  if (event.event_type === "refund") {
    return transactionType === "sale"
      ? `Refund paid to ${contactName ?? "customer"}`
      : `Refund received from ${contactName ?? "supplier"}`;
  }
  return "Supplier replacement";
}

function formatLedgerEventDescription(event: AccountLedgerEvent): string {
  const prefix = event.event_type === "transaction"
    ? event.description.startsWith("Cancelled · ")
      ? `Cancelled · ${event.transaction_type === "sale" ? "Sale" : "Purchase"} · `
      : `${event.transaction_type === "sale" ? "Sale" : "Purchase"} · `
    : event.description.match(/^[^·]+ · /)?.[0] ?? "";
  const detail = event.description.slice(prefix.length);
  if (event.description.startsWith("Cancelled · ")) {
    return `Cancelled · ${humanizeItemSummary(detail)}`;
  }
  if (event.event_type === "transaction") return humanizeItemSummary(detail);
  if (event.event_type === "payment") {
    return `Paid via ${formatPaymentMethod(event.payment_method ?? detail)}`;
  }
  return humanizePaymentMethods(detail);
}

function humanizeItemSummary(value: string): string {
  return value
    .split(", ")
    .map((item) => {
      const separator = item.indexOf(": ");
      if (separator < 0) return item;
      const product = item.slice(0, separator);
      const quantity = item.slice(separator + 2);
      return `${product} — ${quantity}`;
    })
    .join(" · ");
}

function humanizePaymentMethods(value: string): string {
  return value.replace(/\bmpesa\b/gi, "M-Pesa").replace(/\bbank_transfer\b/gi, "bank transfer");
}

function formatPaymentMethod(value: string): string {
  const normalized = value.toLocaleLowerCase();
  if (normalized === "mpesa") return "M-Pesa";
  if (normalized === "bank_transfer") return "bank transfer";
  return normalized.charAt(0).toLocaleUpperCase() + normalized.slice(1);
}

function RecordCard({
  title,
  subtitle,
  rows,
  icon = "document-text-outline",
  badgeLabel,
  badgeColor,
  expanded,
  onPress,
}: {
  title: string;
  subtitle: string;
  rows: [string, string][];
  icon?: keyof typeof Ionicons.glyphMap;
  badgeLabel?: string;
  badgeColor?: string;
  expanded?: boolean;
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const content = (
    <>
      <View style={styles.recordHeading}>
        <View
          style={[
            styles.recordIcon,
            { backgroundColor: theme.backgroundSelected },
          ]}
        >
          <Ionicons name={icon} size={17} color={theme.primary} />
        </View>
        <View style={styles.recordTitleGroup}>
          <AppText weight="semibold" numberOfLines={2} ellipsizeMode="tail">
            {title}
          </AppText>
          <AppText size="small" tone="secondary" numberOfLines={2} ellipsizeMode="tail">
            {subtitle}
          </AppText>
        </View>
        {badgeLabel && badgeColor ? (
          <View
            style={[
              styles.recordBadge,
              expanded !== undefined ? styles.productCostBadge : null,
              { backgroundColor: `${badgeColor}18` },
            ]}
          >
            <AppText
              size="small"
              weight="semibold"
              numberOfLines={expanded === undefined ? 1 : 2}
              style={{ color: badgeColor }}
            >
              {badgeLabel}
            </AppText>
          </View>
        ) : null}
        {onPress ? (
          <Ionicons
            name={
              expanded === undefined
                ? "chevron-forward"
                : expanded
                  ? "chevron-up"
                  : "chevron-down"
            }
            size={18}
            color={theme.primary}
          />
        ) : null}
      </View>
      {rows.map(([label, value]) => {
        const tone = getFinancialRowTone(label, value, theme);
        return (
          <View key={label} style={styles.recordRow}>
            {tone ? <Ionicons name={tone.icon} size={15} color={tone.color} /> : null}
            <AppText
              size="small"
              tone="secondary"
              style={styles.recordLabel}
              numberOfLines={2}
            >
              {label}
            </AppText>
            <AppText
              size="small"
              weight={tone ? "semibold" : undefined}
              style={styles.recordValue}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {value}
            </AppText>
          </View>
        );
      })}
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.recordCard,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      {content}
    </Pressable>
  ) : (
    <Card style={styles.recordCard}>{content}</Card>
  );
}

function ExpenseReportRecord({
  expense,
  currency,
}: {
  expense: ExpenseRecord;
  currency: string;
}) {
  const { theme } = useTheme();
  const status = {
    paid: { label: "Paid", color: theme.success, icon: "checkmark-circle-outline" as const },
    partial: { label: "Part paid", color: theme.secondary, icon: "time-outline" as const },
    unpaid: { label: "Unpaid", color: theme.danger, icon: "alert-circle-outline" as const },
    cancelled: { label: "Cancelled", color: theme.textSecondary, icon: "close-circle-outline" as const },
  }[expense.payment_status];
  const amount = Number(expense.amount);
  const paid = Number(expense.amount_paid);
  const due = Number(expense.balance_due);
  const paidRatio = amount > 0 ? Math.max(0, Math.min(1, paid / amount)) : 0;
  const isCancelled = expense.payment_status === "cancelled";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${status.label.toLocaleLowerCase()} expense ${getExpenseDisplayName(expense)}`}
      onPress={() => router.push(`/expenses/${expense.id}` as Href)}
      style={({ pressed }) => [
        styles.expenseRecord,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <View style={styles.expenseRecordHeading}>
        <View style={styles.expenseRecordCopy}>
          <AppText size="body" weight="semibold">{getExpenseDisplayName(expense)}</AppText>
          <AppText size="small" tone="secondary">
            {expense.category_name} · {formatDateLabel(expense.expense_date)}
          </AppText>
        </View>
        <View style={styles.expenseRecordAmount}>
          <AppText size="body" weight="semibold">{money(expense.amount, currency)}</AppText>
          <View style={[styles.expenseRecordStatus, { backgroundColor: `${status.color}18` }]}>
            <Ionicons name={status.icon} size={13} color={status.color} />
            <AppText size="small" weight="semibold" style={{ color: status.color }}>
              {status.label}
            </AppText>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
      </View>
      {!isCancelled ? (
        <View style={styles.expenseRecordPayment}>
          <View style={[styles.expensePaidTrack, { backgroundColor: theme.backgroundSelected }]}>
            <View
              style={[
                styles.expensePaidFill,
                { width: `${paidRatio * 100}%`, backgroundColor: theme.success },
              ]}
            />
          </View>
          <View style={styles.expenseRecordPaymentLabels}>
            <AppText size="small" tone="secondary">Paid {money(paid, currency)}</AppText>
            <AppText
              size="small"
              weight={due > 0 ? "semibold" : undefined}
              style={{ color: due > 0 ? theme.danger : theme.textSecondary }}
            >
              {due > 0 ? `Due ${money(due, currency)}` : "Settled"}
            </AppText>
          </View>
        </View>
      ) : null}
      {(expense.contact_name || expense.block_name || expense.receipt_reference) ? (
        <View style={styles.expenseRecordMeta}>
          {expense.contact_name ? (
            <AppText size="small" tone="secondary" style={styles.expenseRecordMetaText}>
              {expense.contact_name}
            </AppText>
          ) : null}
          {expense.block_name ? (
            <AppText size="small" tone="secondary" style={styles.expenseRecordMetaText}>
              {expense.block_name}
            </AppText>
          ) : null}
          {expense.receipt_reference ? (
            <AppText size="small" tone="secondary" style={styles.expenseRecordMetaText}>
              Receipt {expense.receipt_reference}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function ContactOption({
  name,
  roles,
  currency,
  balance,
  balanceLabel,
  lastActivity,
  selected,
  onPress,
}: {
  name: string;
  roles: string;
  currency: string;
  balance: number;
  balanceLabel: string;
  lastActivity: string;
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
        styles.contactOption,
        {
          backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}
    >
      <View style={styles.contactOptionCopy}>
        <AppText weight="semibold" style={styles.contactOptionName}>{name}</AppText>
        <AppText size="small" tone="secondary">
          {lastActivity ? `${roles || "Contact"} · ${lastActivity}` : roles || "Contact"}
        </AppText>
        <View style={styles.contactOptionBalance}>
          <AppText
            size="small"
            weight="semibold"
            style={{
              color: Math.abs(balance) < 0.005
                ? theme.textSecondary
                : balance > 0
                  ? theme.success
                  : getAccountStatusPalette(theme, "warning").text,
            }}
          >
            {balanceLabel}
          </AppText>
          {Math.abs(balance) >= 0.005 ? (
            <AppText size="small" weight="semibold" style={styles.contactOptionAmount}>
              {money(Math.abs(balance), currency)}
            </AppText>
          ) : null}
        </View>
      </View>
      <Ionicons name={selected ? "chevron-up" : "chevron-forward"} size={18} color={theme.primary} />
    </Pressable>
  );
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.sectionTitle}>
      <AppText size="body" weight="semibold">{title}</AppText>
      <AppText size="small" tone="secondary">{detail}</AppText>
    </View>
  );
}

function getFinancialRowTone(
  label: string,
  value: string,
  theme: ReturnType<typeof useTheme>["theme"],
): { color: string; icon: keyof typeof Ionicons.glyphMap } | null {
  const normalizedLabel = label.trim().toLocaleLowerCase();
  if (
    normalizedLabel === "balance due" ||
    normalizedLabel === "outstanding" ||
    normalizedLabel === "remaining" ||
    normalizedLabel === "outstanding balance"
  ) {
    const amount = Number(value.replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(amount)) return null;
    return amount > 0
      ? { color: theme.danger, icon: "alert-circle-outline" }
      : { color: theme.success, icon: "checkmark-circle-outline" };
  }
  if (
    normalizedLabel === "paid" ||
    normalizedLabel === "amount paid" ||
    normalizedLabel === "payments received"
  ) {
    return { color: theme.success, icon: "checkmark-circle-outline" };
  }
  if (normalizedLabel === "payment status") {
    const status = value.trim().toLocaleLowerCase();
    if (status === "paid") {
      return { color: theme.success, icon: "checkmark-circle-outline" };
    }
    if (status === "partial") {
      return { color: theme.secondary, icon: "time-outline" };
    }
    if (status === "unpaid") {
      return { color: theme.danger, icon: "alert-circle-outline" };
    }
    if (status === "cancelled") {
      return { color: theme.textSecondary, icon: "close-circle-outline" };
    }
  }
  return null;
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card style={styles.card}>
      <AppText size="small" tone="secondary">{message}</AppText>
    </Card>
  );
}

function QueryError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <Card style={styles.errorCard}>
      <AppText weight="semibold">Could not load this report section</AppText>
      <AppText size="small" tone="secondary">{normalizeApiError(error).message}</AppText>
      <Button label="Retry" variant="secondary" onPress={retry} />
    </Card>
  );
}

function isReportName(name: string | undefined): name is ReportName {
  return Boolean(name && Object.hasOwn(titles, name));
}

function money(value: number | string, currency: string): string {
  const amount = Number(value);
  return `${currency} ${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

function formatQuantity(value: number | string): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(value));
}

function formatInventoryQuantity(value: number, unit: string): string {
  const formatted = formatInventoryAmount(value);
  const normalizedUnit = unit.trim().toLowerCase();
  const displayUnit =
    ["piece", "pieces"].includes(normalizedUnit) && Math.abs(value) !== 1
      ? "pieces"
      : unit;
  return `${formatted} ${displayUnit}`;
}

function formatInventoryAmount(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 3,
  }).format(Math.abs(value));
}

function receivedColorForTheme(mode: "light" | "dark"): string {
  return mode === "dark" ? "#5FE0A0" : "#0B7A4B";
}

function issuedColorForTheme(mode: "light" | "dark"): string {
  return mode === "dark" ? "#FF8A80" : "#B3261E";
}

function formatSignedInventoryQuantity(value: number, unit: string): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatInventoryQuantity(value, unit)}`;
}

function formatDateLabel(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatPeriodDate(value);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function formatChickenTypeLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getChickenAge(
  hatchDate: string | null,
  today: string,
): { days: number; label: string } | null {
  if (!hatchDate) return null;
  const hatchParts = hatchDate.slice(0, 10).split("-").map(Number);
  const todayParts = today.split("-").map(Number);
  if (
    hatchParts.length !== 3 ||
    todayParts.length !== 3 ||
    [...hatchParts, ...todayParts].some((part) => !Number.isInteger(part))
  ) {
    return null;
  }
  const hatch = Date.UTC(hatchParts[0], hatchParts[1] - 1, hatchParts[2]);
  const current = Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2]);
  if (!Number.isFinite(hatch) || !Number.isFinite(current)) return null;
  const days = Math.floor((current - hatch) / 86_400_000);
  if (days < 0) return { days: 0, label: "Hatch date is in the future" };
  if (days < 14) return { days, label: `${days} ${days === 1 ? "day" : "days"} old` };
  if (days < 84) {
    const weeks = Math.floor(days / 7);
    return { days, label: `${weeks} ${weeks === 1 ? "week" : "weeks"} old` };
  }

  let months =
    (todayParts[0] - hatchParts[0]) * 12 + todayParts[1] - hatchParts[1];
  if (todayParts[2] < hatchParts[2]) months -= 1;
  if (months >= 12) {
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    return {
      days,
      label: remainingMonths
        ? `${years} ${years === 1 ? "year" : "years"}, ${remainingMonths} months old`
        : `${years} ${years === 1 ? "year" : "years"} old`,
    };
  }
  return { days, label: `${months} ${months === 1 ? "month" : "months"} old` };
}

function formatDateRangeLabel(fromDate: string, toDate: string): string {
  if (!fromDate && !toDate) return "All dates";
  if (!fromDate) return `Through ${formatPeriodDate(toDate)}`;
  if (!toDate) return `From ${formatPeriodDate(fromDate)} onward`;
  return `${formatPeriodDate(fromDate)} – ${formatPeriodDate(toDate)}`;
}

function formatPeriodDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function farmLocalDateTime(
  value: string,
  time: string,
  timezone: string,
): string {
  const [year, month, day] = value.split("-").map(Number);
  const [hour, minute, second] = time.split(":").map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = targetUtc;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const representedUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    instant = targetUtc - (representedUtc - instant);
  }

  return new Date(instant).toISOString();
}

function today(): string {
  return formatDate(new Date());
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 14, gap: 12, paddingBottom: 30 },
  card: { gap: 10, borderRadius: 12, padding: 14 },
  reportIntro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
  },
  reportIntroIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  reportIntroCopy: { flex: 1, gap: 3 },
  errorCard: { gap: 9, borderRadius: 12 },
  exportToolbar: {
    minHeight: 38,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
  },
  periodHeading: { flexDirection: "row", alignItems: "center", gap: 9 },
  periodIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  periodCard: { gap: 11, borderRadius: 14, padding: 14 },
  compactPeriodCard: { gap: 10, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  compactPeriodTrigger: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 9 },
  productionToolbar: { gap: 8 },
  productionExportAction: { alignSelf: "flex-end" },
  productionPeriod: { alignSelf: "stretch", gap: 8, borderWidth: 1, borderRadius: 13, padding: 7 },
  productionPeriodSegments: { flexDirection: "row", gap: 3 },
  productionPeriodButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    paddingHorizontal: 2,
  },
  productionRangeLine: { flexDirection: "row", alignItems: "center", paddingHorizontal: 3 },
  productionRangeText: { flex: 1 },
  productionHero: { gap: 7, borderWidth: 1, borderRadius: 16, padding: 17 },
  productionTotal: { fontSize: 36, lineHeight: 42, fontVariant: ["tabular-nums"] },
  productionHeroDivider: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  productionComparison: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingTop: 3 },
  productionComparisonCopy: { flex: 1, minWidth: 0, gap: 3 },
  flockHero: { gap: 5, borderWidth: 1, borderRadius: 15, padding: 16 },
  flockCapacity: { gap: 7, marginTop: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  flockCapacityLabels: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  flockFacts: { flexDirection: "row", borderWidth: 1, borderRadius: 13 },
  flockFact: { flex: 1, gap: 4, paddingHorizontal: 10, paddingVertical: 11 },
  flockFactDivider: { borderLeftWidth: StyleSheet.hairlineWidth },
  flockBreakRow: { gap: 7, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  flockBreakHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  flockBreakCopy: { flex: 1, gap: 2, minWidth: 0 },
  flockSectionTitle: { gap: 2 },
  flockBlockCard: { gap: 12, borderWidth: 1, borderRadius: 13, padding: 14 },
  flockBlockHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  flockAgeList: { gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  flockAgeGroup: { gap: 5 },
  flockAgeHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  flockAgeLabels: { flex: 1, gap: 1 },
  flockBatchRow: { minHeight: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingLeft: 8 },
  flockBatchName: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 },
  productionDelta: { alignSelf: "flex-start", borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, marginTop: 2 },
  productionSectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 14 },
  productionSectionCopy: { flex: 1, minWidth: 0, gap: 2 },
  productionSegment: { flexDirection: "row", gap: 2, borderWidth: 1, borderRadius: 10, padding: 3 },
  productionSegmentButton: { minHeight: 34, justifyContent: "center", borderRadius: 7, paddingHorizontal: 9 },
  productionBarRow: { gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  productionBarLabels: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  productionBarCopy: { flex: 1, minWidth: 0, gap: 2 },
  productionBreakdownValue: { alignItems: "flex-end", flexShrink: 0, gap: 1 },
  productionBarTrack: { height: 6, overflow: "hidden", borderRadius: 4 },
  productionBarFill: { height: "100%", borderRadius: 4 },
  productionListHeading: { marginTop: 23, paddingBottom: 3 },
  productionSearch: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11 },
  productionSearchInput: { flex: 1, minWidth: 0, height: 44, paddingVertical: 0, fontSize: 15 },
  productionFilters: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 8, marginBottom: 3 },
  productionFilterButton: { flex: 1, minWidth: 0, minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  productionFilterText: { flex: 1, minWidth: 0 },
  productionClearFilters: { minHeight: 36, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  productionDay: { paddingTop: 14, paddingBottom: 3 },
  productionRecord: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 9, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 9 },
  productionRecordCopy: { flex: 1, gap: 2, minWidth: 0 },
  productionRecordAmount: { maxWidth: "48%", flexShrink: 1, alignItems: "flex-end", gap: 2 },
  openingStockSection: { gap: 3, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginTop: 19 },
  openingStockHeading: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 9, paddingBottom: 7 },
  openingStockIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  openingStockTotal: { flexShrink: 0, textAlign: "right" },
  openingStockEmpty: { paddingVertical: 8 },
  productionFilterModalRoot: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.48)" },
  productionFilterScrim: { ...StyleSheet.absoluteFill },
  productionFilterSheet: { maxHeight: "78%", borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 20 },
  productionFilterModalHeading: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 14 },
  productionFilterClose: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  productionFilterList: { flexShrink: 1 },
  productionFilterOptions: { gap: 8, paddingBottom: 12 },
  productionFilterOption: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 9 },
  productionFilterOptionLabel: { flex: 1, minWidth: 0 },
  accountSummary: { gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
  accountSummaryHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  accountBalancePill: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5 },
  accountSummaryTotals: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  accountSummaryTotal: { flex: 1, gap: 4, minWidth: 0 },
  accountSummaryDivider: { borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: 12 },
  accountSelectedBalance: { minHeight: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  accountSelectedBalanceCopy: { flex: 1, minWidth: 0, gap: 2 },
  accountSelectedBalanceValue: { maxWidth: "48%", textAlign: "right", fontVariant: ["tabular-nums"] },
  accountDirectoryHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 4 },
  accountPickerTrigger: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderRadius: 12, padding: 11 },
  accountPickerIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  accountPickerCopy: { flex: 1, minWidth: 0, gap: 3 },
  accountPickerModalRoot: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.48)" },
  accountPickerScrim: { ...StyleSheet.absoluteFill },
  accountPickerSheet: { height: "82%", maxHeight: "88%", borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, paddingHorizontal: 16, paddingTop: 18 },
  accountPickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 },
  accountPickerClose: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 19 },
  accountPickerList: { flex: 1, minHeight: 140 },
  accountPickerListContent: { gap: 8, paddingTop: 12, paddingBottom: 16 },
  accountSearch: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11 },
  accountSearchInput: { flex: 1, minWidth: 0, height: 42, paddingVertical: 0 },
  accountRoleTabs: { flexDirection: "row", gap: 4, borderWidth: 1, borderRadius: 10, padding: 3 },
  accountRoleTab: { flex: 1, minHeight: 33, alignItems: "center", justifyContent: "center", borderRadius: 7 },
  accountPeriodSection: { gap: 9, marginTop: 4 },
  accountPeriodHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  accountPeriodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  accountPeriodButton: { flexGrow: 1, flexBasis: "30%", minWidth: 90, minHeight: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 9, paddingHorizontal: 7 },
  accountPeriodRange: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10 },
  accountPeriodDates: { flex: 1, minWidth: 0 },
  accountContactCard: { flexDirection: "column", alignItems: "stretch", gap: 9, borderWidth: 1, borderRadius: 12, padding: 12 },
  accountContactInfo: { flex: 1, minWidth: 0, gap: 3 },
  accountContactActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", gap: 7 },
  accountContactAction: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8 },
  accountPeriodSummaryHeading: { gap: 2, marginTop: 4 },
  accountFlowCard: { gap: 10, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingTop: 11, paddingBottom: 8 },
  accountFlowMetrics: { flexDirection: "row" },
  accountFlowMetric: { flex: 1, minWidth: 0, gap: 3, paddingVertical: 4, paddingRight: 9 },
  accountFlowDivider: { borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: 12, paddingRight: 0 },
  accountFlowLabel: { flexDirection: "row", alignItems: "center", gap: 5 },
  accountFlowBreakdown: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  accountFlowGross: { flex: 1, minWidth: 0, gap: 1 },
  accountFlowGrossDivider: { borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: 9 },
  accountFlowTransactionCount: { maxWidth: "28%", textAlign: "right" },
  accountLedgerHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 4 },
  accountActivityTitle: { flex: 1, minWidth: 0, gap: 2 },
  accountExportAction: { alignSelf: "flex-start" },
  accountActivitySearch: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11 },
  accountActivitySearchInput: { flex: 1, minWidth: 0, height: 44, paddingVertical: 0 },
  accountActivitySearchClear: { width: 30, height: 34, alignItems: "center", justifyContent: "center" },
  accountActivityFilters: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  accountActivityFilter: { flexGrow: 1, flexBasis: "48%", minWidth: 130, minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10 },
  accountResultsHeading: { gap: 1, marginTop: 1 },
  accountTransactionList: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  accountTransactionRow: { gap: 8, paddingHorizontal: 11, paddingVertical: 11 },
  accountTransactionMain: { flexDirection: "row", alignItems: "center", gap: 9 },
  accountTransactionIcon: { width: 34, height: 34, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  accountTransactionCopy: { flex: 1, minWidth: 0, gap: 2 },
  accountTransactionHeading: { flexDirection: "row", alignItems: "center", gap: 7 },
  accountTransactionContact: { flex: 1, minWidth: 0 },
  accountTransactionType: { flexShrink: 0, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  accountTransactionFooter: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10, paddingLeft: 43 },
  accountTransactionMeta: { flex: 1, minWidth: 0, gap: 2 },
  accountTransactionAmounts: { maxWidth: "48%", flexShrink: 1, alignItems: "flex-end", gap: 1 },
  accountTransactionStatus: { maxWidth: "100%", textAlign: "right" },
  accountMetadataText: { flex: 1, minWidth: 0, flexShrink: 1 },
  accountStatement: { gap: 2, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  accountStatementRow: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingVertical: 6 },
  accountStatementLabel: { flex: 1, minWidth: 0 },
  accountStatementValue: { flexShrink: 1, minWidth: 0, maxWidth: "55%", textAlign: "right", fontVariant: ["tabular-nums"] },
  accountEmpty: { alignItems: "center", gap: 8, padding: 20 },
  periodOptions: { gap: 8 },
  periodCopy: { flex: 1, gap: 2 },
  presetRow: { flexDirection: "row", gap: 7 },
  presetButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 7,
  },
  dateRow: {
    flexDirection: "row",
    gap: 9,
  },
  dateField: { flex: 1 },
  sectionTitle: { gap: 3, marginTop: 3, paddingHorizontal: 1 },
  expenseExportToolbar: { minHeight: 38, flexDirection: "row", justifyContent: "flex-end", alignItems: "center" },
  expenseSummary: { gap: 12, borderWidth: 1, borderRadius: 15, padding: 14 },
  expenseSummaryHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  expenseSummaryCopy: { flex: 1, minWidth: 0, gap: 3 },
  expenseSummaryTotal: { fontSize: 30, lineHeight: 36, fontVariant: ["tabular-nums"] },
  expenseRecordCount: { flexShrink: 0, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 6 },
  expensePaymentSummary: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 11 },
  expensePaymentMetric: { flex: 1, minWidth: 0, gap: 4, paddingRight: 8 },
  expenseOutstandingMetric: { borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: 12, paddingRight: 0 },
  expensePaymentLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  expenseSectionHeading: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 7 },
  expenseSectionCopy: { flex: 1, minWidth: 0, gap: 3 },
  expenseClearCategory: { minHeight: 36, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  expenseCategoryList: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12 },
  expenseCategoryRow: { gap: 7, paddingVertical: 11 },
  expenseCategoryHeading: { flexDirection: "row", alignItems: "center", gap: 9 },
  expenseCategoryName: { flex: 1, minWidth: 0, gap: 2 },
  expenseCategoryTotal: { flexShrink: 0, textAlign: "right", fontVariant: ["tabular-nums"] },
  expenseCategoryTrack: { height: 5, overflow: "hidden", borderRadius: 4 },
  expenseCategoryFill: { height: "100%", borderRadius: 4 },
  expenseCategoryPaymentLine: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  expenseCategoryEmpty: { paddingVertical: 14 },
  expenseRecordsHeading: { marginTop: 8 },
  expenseSearch: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11 },
  expenseSearchInput: { flex: 1, minWidth: 0, height: 44, paddingVertical: 0, fontSize: 15 },
  expenseStatusFilters: { flexDirection: "row", gap: 7, paddingVertical: 2 },
  expenseStatusChip: { minHeight: 36, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 99, paddingHorizontal: 12 },
  expenseRecord: { gap: 10, borderWidth: 1, borderRadius: 13, padding: 12 },
  expenseRecordHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  expenseRecordCopy: { flex: 1, minWidth: 0, gap: 3 },
  expenseRecordAmount: { flexShrink: 0, alignItems: "flex-end", gap: 5 },
  expenseRecordStatus: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 3 },
  expenseRecordPayment: { gap: 5 },
  expensePaidTrack: { height: 4, overflow: "hidden", borderRadius: 4 },
  expensePaidFill: { height: "100%", borderRadius: 4 },
  expenseRecordPaymentLabels: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  expenseRecordMeta: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  expenseRecordMetaText: { maxWidth: "100%" },
  salesSummaryCard: { gap: 12, borderRadius: 14, padding: 14 },
  salesSummaryHero: { gap: 3, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 },
  grossProfitSummary: {
    gap: 9,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  grossProfitCopy: { gap: 2 },
  grossProfitValue: { fontVariant: ["tabular-nums"] },
  zeroCostConfirmationCard: { gap: 10, borderWidth: 1, borderRadius: 13, padding: 12 },
  zeroCostConfirmationCopy: { gap: 3 },
  salesSummaryRows: { borderTopWidth: StyleSheet.hairlineWidth },
  salesSummaryRow: {
    minHeight: 39,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 7,
  },
  salesSummaryLabel: { flex: 1, minWidth: 0 },
  salesSummaryValue: { flexShrink: 1, minWidth: 0, textAlign: "right" },
  salesReconciliation: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderWidth: 1,
    borderRadius: 11,
    padding: 10,
  },
  salesReconciliationCopy: { flex: 1, minWidth: 0, gap: 2 },
  salesReconciliationLegend: { gap: 2 },
  salesTransactionCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 7 },
  salesTransactionReference: { paddingHorizontal: 1 },
  salesTransactionMetrics: {
    flexDirection: "row",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 7,
  },
  salesTransactionMetric: { flex: 1, minWidth: 0, gap: 1 },
  salesTransactionStatus: {
    minHeight: 31,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
  },
  salesTransactionStatusLabel: { flex: 1, minWidth: 0 },
  salesTransactionAdjustments: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 1,
  },
  inventoryTools: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  inventoryIssueCallout: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  inventoryIssueCopy: { flex: 1, gap: 4 },
  inventorySearch: {
    flexGrow: 1,
    flexBasis: 165,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 12,
  },
  inventorySearchInput: { flex: 1, minWidth: 0, paddingVertical: 8, fontSize: 15 },
  movementFilter: {
    flexGrow: 1,
    flexBasis: 175,
    flexDirection: "row",
    gap: 3,
    borderWidth: 1,
    borderRadius: 11,
    padding: 3,
  },
  movementFilterOption: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 6,
  },
  inventorySummary: {
    gap: 0,
    borderWidth: 0,
    borderRadius: 0,
    padding: 0,
  },
  inventorySummaryStats: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 7,
  },
  inventorySummaryMetric: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: 10,
    paddingHorizontal: 3,
    paddingVertical: 8,
  },
  productSectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 7,
  },
  productSectionTitle: { flex: 1, gap: 1 },
  productCountBadge: {
    minWidth: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  movementTotalsCard: {
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  movementTotalsHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingBottom: 3,
  },
  movementTotalsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 7,
  },
  movementTotalsUnit: { flex: 1.15, minWidth: 0 },
  movementTotalsValue: {
    flex: 1,
    minWidth: 0,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  movementTotalsEmpty: { paddingVertical: 5 },
  movementTotalsNote: { lineHeight: 17, paddingTop: 2 },
  inventoryProduct: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 9,
  },
  inventoryProductHeading: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  inventoryProductTitle: { flex: 1, minWidth: 0, gap: 2 },
  onHandValue: { maxWidth: "42%", minWidth: 76, flexShrink: 0, alignItems: "flex-end", gap: 0 },
  onHandAmount: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  onHandNumber: { fontVariant: ["tabular-nums"] },
  reconciliationGrid: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
    paddingVertical: 9,
  },
  stockBalanceBar: {
    height: 6,
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: 99,
  },
  stockBalanceSegment: { height: "100%" },
  reconciliationItem: { flex: 1, minWidth: 0, gap: 2, alignItems: "center" },
  reconciliationCell: {
    fontVariant: ["tabular-nums"],
  },
  productCardFooter: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  stockStatus: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4 },
  productStockLink: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6 },
  productMovementList: {
    gap: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  inventoryMovementRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderWidth: 1,
    borderRadius: 11,
    padding: 9,
  },
  movementIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  inventoryMovementDescription: { flex: 1, minWidth: 0, gap: 1 },
  movementAmount: {
    maxWidth: "42%",
    alignItems: "flex-end",
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  showMovementsAction: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  recordCard: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 9 },
  recordHeading: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  recordIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  recordBadge: {
    flexShrink: 1,
    maxWidth: "32%",
    alignSelf: "flex-start",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  productCostBadge: { maxWidth: "45%" },
  recordTitleGroup: { flex: 1, minWidth: 0, gap: 3 },
  recordRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  recordLabel: { flex: 1.15, minWidth: 0 },
  recordValue: { flex: 1, minWidth: 0, textAlign: "right", fontVariant: ["tabular-nums"] },
  contactOption: {
    minHeight: 66,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  contactOptionCopy: { flex: 1, minWidth: 0, gap: 3 },
  contactOptionName: { minWidth: 0 },
  contactOptionBalance: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7 },
  contactOptionAmount: { fontVariant: ["tabular-nums"] },
});
