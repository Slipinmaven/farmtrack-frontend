import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { useChickenSaleOptions } from "@/features/chickens/hooks";
import { getEggCollections } from "@/features/eggs/api";
import { useEggCollectionOptions } from "@/features/eggs/hooks";
import { getFarmLogoUri } from "@/features/farms/logo";
import {
  getInventory,
  getContactTransactionHistory,
  getExpenseSummary,
  getExpenses,
  getExpenseDisplayName,
  type ExpenseRecord,
  type ContactTransactionHistoryItem,
  type InventoryMovement,
} from "@/features/management/api";
import {
  useContactTransactionHistory,
  useContacts,
  useExpenseSummary,
  useInfiniteExpenses,
  useInventory,
} from "@/features/management/hooks";
import { ReportExportActions } from "@/features/reports/report-export-actions";
import type { ReportExportData } from "@/features/reports/export";
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
  inventory: "Inventory report",
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
    <ReportShell title={titles[report]} report={report}>
      {report === "sales" ? <SalesReportDetail /> : null}
      {report === "expenses" ? <ExpensesReportDetail /> : null}
      {report === "production" ? <ProductionReportDetail /> : null}
      {report === "flock" ? <FlockReportDetail /> : null}
      {report === "inventory" ? <InventoryReportDetail /> : null}
      {report === "accounts" ? <AccountsReportDetail /> : null}
      <AppText size="small" tone="secondary" style={{ color: theme.textSecondary }}>
        Figures reflect the records available for this farm.
      </AppText>
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
        {report ? <ReportIntro report={report} /> : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function DateRange({
  fromDate,
  toDate,
  setFromDate,
  setToDate,
}: {
  fromDate: string;
  toDate: string;
  setFromDate: (date: string) => void;
  setToDate: (date: string) => void;
}) {
  const { theme } = useTheme();
  return (
    <Card style={styles.card}>
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
            Choose the dates included in this report
          </AppText>
        </View>
      </View>
      <View style={styles.dateRow}>
        <DatePickerField label="From" value={fromDate} onChange={setFromDate} style={styles.dateField} />
        <DatePickerField label="To" value={toDate} onChange={setToDate} style={styles.dateField} />
      </View>
      {fromDate || toDate ? (
        <Button
          label="Clear date filters"
          variant="quiet"
          onPress={() => {
            setFromDate("");
            setToDate("");
          }}
        />
      ) : null}
    </Card>
  );
}

function useDateRange() {
  const params = useLocalSearchParams<{
    from_date?: string;
    to_date?: string;
  }>();
  const routeFromDate =
    params.from_date === undefined ? monthStart() : params.from_date;
  const routeToDate =
    params.to_date === undefined ? today() : params.to_date;
  return {
    fromDate: routeFromDate,
    toDate: routeToDate,
    setFromDate: (date: string) => router.setParams({ from_date: date }),
    setToDate: (date: string) => router.setParams({ to_date: date }),
  };
}

function SalesReportDetail() {
  const { user } = useAuth();
  const selectedFarm = useFarm().selectedFarm;
  const farmId = selectedFarm?.id;
  const currency = selectedFarm?.settings?.currency ?? "KES";
  const range = useDateRange();
  const summary = useSalesReport(user?.id, farmId, {
    from_date: range.fromDate || undefined,
    to_date: range.toDate || undefined,
    status: "completed",
    offset: 0,
    limit: 1,
  });
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
              name: "Received",
              values: report.summary.monthly.map((month) => Number(month.amount_received)),
              color: "#d39735",
            },
          ],
        }]
      : [],
    summary: [
      { label: "Sales recorded", value: Number(report.summary.sales_total), kind: "currency" },
      { label: "Payments received", value: Number(report.summary.amount_received), kind: "currency" },
      { label: "Balance due", value: Number(report.summary.balance_due), kind: "currency" },
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
          { key: "paid", label: `Paid (${currency})`, kind: "currency" },
          { key: "balance", label: `Balance due (${currency})`, kind: "currency" },
          { key: "credit", label: `Credit balance (${currency})`, kind: "currency" },
        ],
        rows: records.map((item) => ({
          date: item.transaction_date,
          reference: item.reference_number,
          customer: item.customer_name || "Walk-in customer",
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
        })),
        totals: true,
      },
      {
        name: "Monthly trend",
        columns: [
          { key: "month", label: "Month" },
          { key: "transactions", label: "Transactions", kind: "number" },
          { key: "sales", label: `Sales (${currency})`, kind: "currency" },
          { key: "received", label: `Received (${currency})`, kind: "currency" },
        ],
        rows: report.summary.monthly.map((month) => ({
          month: month.month,
          transactions: month.transaction_count,
          sales: Number(month.sales_total),
          received: Number(month.amount_received),
        })),
        totals: true,
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
      {summary.data ? (
        <View style={styles.exportToolbar}>
          <ReportExportActions
            data={createExportData(items, summary.data)}
            resolveData={resolveAllSales}
          />
        </View>
      ) : null}
      <DateRange {...range} />
      {summary.isLoading ? <LoadingState label="Loading sales summary" /> : null}
      {summary.isError ? <QueryError error={summary.error} retry={() => void summary.refetch()} /> : null}
      {summary.data ? (
        <SummaryCard
          rows={[
            ["Sales recorded", money(summary.data.summary.sales_total, currency)],
            ["Payments received", money(summary.data.summary.amount_received, currency)],
            ["Balance due", money(summary.data.summary.balance_due, currency)],
            ["Transactions", String(summary.data.summary.transaction_count)],
          ]}
        />
      ) : null}
      <SectionTitle title="Completed sales" detail={`${sales.data?.pages[0]?.total_count ?? 0} records`} />
      {sales.isLoading ? <LoadingState label="Loading sales" /> : null}
      {sales.isError ? <QueryError error={sales.error} retry={() => void sales.refetch()} /> : null}
      {items.map((item) => (
        <RecordCard
          key={item.id}
          title={item.customer_name || "Walk-in customer"}
          subtitle={`${formatDateLabel(item.transaction_date)}${item.reference_number ? ` · ${item.reference_number}` : ""}`}
          rows={[
            ["Items", item.product_names.join(", ") || "No item details"],
            ["Total", money(item.transaction_total, currency)],
            ["Paid", money(item.amount_paid, currency)],
            ["Balance due", money(item.balance_due, currency)],
          ]}
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
  const summary = useExpenseSummary(user?.id, farmId, {
    from_date: range.fromDate || undefined,
    to_date: range.toDate || undefined,
  });
  const expenses = useInfiniteExpenses(user?.id, farmId, {
    from_date: range.fromDate || undefined,
    to_date: range.toDate || undefined,
  });
  const items = expenses.data?.pages.flatMap((page) => page.items) ?? [];
  const createExportData = (
    records: ExpenseRecord[],
    reportSummary: NonNullable<typeof summary.data>,
  ): ReportExportData => ({
    title: "Expenses report",
    farmName: selectedFarm?.name ?? "FarmTrack",
    farmLogoUri: getFarmLogoUri(selectedFarm?.settings?.logo_path),
    currencyCode: currency,
    fromDate: range.fromDate,
    toDate: range.toDate,
    summary: [
      { label: "Recorded expenses", value: Number(reportSummary.total_amount), kind: "currency" },
      { label: "Amount paid", value: Number(reportSummary.amount_paid), kind: "currency" },
      { label: "Outstanding balance", value: Number(reportSummary.balance_due), kind: "currency" },
      { label: "Expense records", value: reportSummary.expense_count, kind: "number" },
    ],
    sheets: [
      {
        name: "Expense records",
        columns: [
          { key: "date", label: "Date", kind: "date" },
          { key: "expense", label: "Expense" },
          { key: "category", label: "Category" },
          { key: "payee", label: "Payee" },
          { key: "block", label: "Block" },
          { key: "total", label: `Total (${currency})`, kind: "currency" },
          { key: "paid", label: `Paid (${currency})`, kind: "currency" },
          { key: "balance", label: `Balance (${currency})`, kind: "currency" },
          { key: "status", label: "Payment status" },
          { key: "receipt", label: "Receipt reference" },
          { key: "purchase", label: "Purchase reference" },
          { key: "notes", label: "Notes" },
        ],
        rows: records.map((item) => ({
          date: item.expense_date,
          expense: getExpenseDisplayName(item),
          category: item.category_name,
          payee: item.contact_name,
          block: item.block_name,
          total: Number(item.amount),
          paid: Number(item.amount_paid),
          balance: Number(item.balance_due),
          status: item.payment_status,
          receipt: item.receipt_reference,
          purchase: item.purchase_reference,
          notes: item.notes,
        })),
        totals: true,
      },
      {
        name: "By category",
        columns: [
          { key: "category", label: "Category" },
          { key: "records", label: "Records", kind: "number" },
          { key: "total", label: `Total (${currency})`, kind: "currency" },
          { key: "paid", label: `Paid (${currency})`, kind: "currency" },
          { key: "balance", label: `Outstanding (${currency})`, kind: "currency" },
        ],
        rows: reportSummary.categories.map((category) => ({
          category: category.name,
          records: category.expense_count,
          total: Number(category.total_amount),
          paid: Number(category.amount_paid),
          balance: Number(category.balance_due),
        })),
        totals: true,
      },
      {
        name: "Payment history",
        columns: [
          { key: "expense", label: "Expense" },
          { key: "date", label: "Payment date", kind: "date" },
          { key: "kind", label: "Entry type" },
          { key: "amount", label: `Amount (${currency})`, kind: "currency" },
          { key: "method", label: "Method" },
          { key: "reference", label: "Reference" },
          { key: "reason", label: "Notes" },
        ],
        rows: records.flatMap((item) =>
          item.payments.map((payment) => ({
            expense: item.name,
            date: payment.payment_date,
            kind: payment.kind,
            amount: Number(payment.amount),
            method: payment.payment_method.replaceAll("_", " "),
            reference: payment.reference_number,
            reason: payment.reason,
          })),
        ),
      },
    ],
  });

  async function resolveAllExpenses(): Promise<ReportExportData> {
    if (!farmId) throw new Error("Select a farm before exporting this report.");
    const [reportSummary, firstPage] = await Promise.all([
      getExpenseSummary(farmId, {
        from_date: range.fromDate || undefined,
        to_date: range.toDate || undefined,
      }),
      getExpenses(farmId, {
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
      {summary.data ? (
        <View style={styles.exportToolbar}>
          <ReportExportActions
            data={createExportData(items, summary.data)}
            resolveData={resolveAllExpenses}
          />
        </View>
      ) : null}
      <DateRange {...range} />
      {summary.isLoading ? <LoadingState label="Loading expense summary" /> : null}
      {summary.isError ? <QueryError error={summary.error} retry={() => void summary.refetch()} /> : null}
      {summary.data ? (
        <>
          <SummaryCard title="Period summary" rows={[
            ["Recorded expenses", money(summary.data.total_amount, currency)],
            ["Paid", money(summary.data.amount_paid, currency)],
            ["Outstanding", money(summary.data.balance_due, currency)],
            ["Records", String(summary.data.expense_count)],
          ]} />
          <SectionTitle title="By category" detail="Expense totals for the selected period" />
          {summary.data.categories.map((category) => (
            <SummaryCard key={category.key} title={category.name} rows={[
              ["Total", money(category.total_amount, currency)],
              ["Paid", money(category.amount_paid, currency)],
              ["Outstanding", money(category.balance_due, currency)],
              ["Records", String(category.expense_count)],
            ]} />
          ))}
        </>
      ) : null}
      <SectionTitle title="Expense records" detail={`${expenses.data?.pages[0]?.total_count ?? 0} records`} />
      {expenses.isLoading ? <LoadingState label="Loading expenses" /> : null}
      {expenses.isError ? <QueryError error={expenses.error} retry={() => void expenses.refetch()} /> : null}
      {items.map((item) => (
        <RecordCard
          key={item.id}
          title={getExpenseDisplayName(item)}
          subtitle={`${item.category_name} · ${formatDateLabel(item.expense_date)}`}
          icon="receipt-outline"
          badgeLabel={{
            paid: "Paid",
            partial: "Part paid",
            unpaid: "Payment due",
            cancelled: "Cancelled",
          }[item.payment_status]}
          badgeColor={{
            paid: theme.success,
            partial: theme.secondary,
            unpaid: theme.danger,
            cancelled: theme.textSecondary,
          }[item.payment_status]}
          rows={[
            ["Total", money(item.amount, currency)],
            ["Paid", money(item.amount_paid, currency)],
            ["Remaining", money(item.balance_due, currency)],
            ["Payment status", item.payment_status],
            ...(item.contact_name ? [["Payee", item.contact_name] as [string, string]] : []),
            ...(item.block_name ? [["Block", item.block_name] as [string, string]] : []),
          ]}
          onPress={() => router.push(`/expenses/${item.id}` as Href)}
        />
      ))}
      {expenses.hasNextPage ? (
        <Button label={expenses.isFetchingNextPage ? "Loading…" : "Load more expenses"} variant="secondary" onPress={() => void expenses.fetchNextPage()} />
      ) : null}
      {!expenses.isLoading && items.length === 0 ? <EmptyState message="No expenses in this period." /> : null}
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
  const selectedFarm = useFarm().selectedFarm;
  const farmId = selectedFarm?.id;
  const timezone = selectedFarm?.settings?.timezone ?? "Africa/Nairobi";
  const range = useDateRange();
  const options = useEggCollectionOptions(user?.id, farmId);
  const collections = useQuery({
    queryKey: ["report-egg-collections", user?.id, farmId, range.fromDate, range.toDate],
    queryFn: () => getEggCollections(farmId!, {
      from_datetime: range.fromDate
        ? farmLocalDateTime(range.fromDate, "00:00:00", timezone)
        : undefined,
      to_datetime: range.toDate
        ? farmLocalDateTime(range.toDate, "23:59:59", timezone)
        : undefined,
    }),
    enabled: Boolean(user?.id && farmId),
  });
  const productNames = useMemo(
    () => new Map((options.data?.products ?? []).map((product) => [product.id, product.name])),
    [options.data?.products],
  );
  const blockNames = useMemo(
    () => new Map((options.data?.blocks ?? []).map((block) => [block.id, block.name])),
    [options.data?.blocks],
  );
  const unitNames = useMemo(
    () =>
      new Map(
        (options.data?.products ?? []).flatMap((product) =>
          product.units.map((unit) => [
            unit.id,
            unit.abbreviation || unit.name,
          ] as const),
        ),
      ),
    [options.data?.products],
  );
  const rows = collections.data ?? [];
  const collectionRows = rows.filter((row) => row.entry_type === "collection");
  const openingRows = rows.filter((row) => row.entry_type === "opening_stock");
  const total = collectionRows.reduce(
    (sum, row) => sum + Number(row.quantity_in_base_unit),
    0,
  );
  const openingTotal = openingRows.reduce(
    (sum, row) => sum + Number(row.quantity_in_base_unit),
    0,
  );
  const exportData: ReportExportData = {
    title: "Egg production report",
    farmName: selectedFarm?.name ?? "FarmTrack",
    farmLogoUri: getFarmLogoUri(selectedFarm?.settings?.logo_path),
    fromDate: range.fromDate,
    toDate: range.toDate,
    summary: [
      { label: "Eggs collected (base units)", value: total, kind: "number" },
      { label: "Opening stock (base units)", value: openingTotal, kind: "number" },
      { label: "Collection and opening-stock records", value: rows.length, kind: "number" },
    ],
    sheets: [{
      name: "Egg collections",
      columns: [
        { key: "date", label: "Date", kind: "date" },
        { key: "type", label: "Entry type" },
        { key: "product", label: "Product" },
        { key: "quantity", label: "Recorded quantity", kind: "number" },
        { key: "unit", label: "Unit" },
        { key: "baseQuantity", label: "Quantity in base units", kind: "number" },
        { key: "block", label: "Block" },
        { key: "notes", label: "Notes" },
      ],
      rows: rows.map((row) => ({
        date: row.collected_at,
        type: row.entry_type === "opening_stock" ? "Opening stock" : "Collection",
        product: productNames.get(row.product_id) ?? "Egg product",
        quantity: Number(row.quantity),
        unit: unitNames.get(row.unit_id) ?? "Unit",
        baseQuantity: Number(row.quantity_in_base_unit),
        block: row.block_id
          ? blockNames.get(row.block_id) ?? "Block not available"
          : "Not assigned",
        notes: row.notes,
      })),
      totalColumns: ["baseQuantity"],
    }],
  };

  return (
    <>
      {collections.data ? (
        <View style={styles.exportToolbar}>
          <ReportExportActions label="Export" data={exportData} />
        </View>
      ) : null}
      <DateRange {...range} />
      {options.isError ? <QueryError error={options.error} retry={() => void options.refetch()} /> : null}
      {collections.isLoading ? <LoadingState label="Loading egg collections" /> : null}
      {collections.isError ? <QueryError error={collections.error} retry={() => void collections.refetch()} /> : null}
      {collections.data ? (
        <>
          <SummaryCard rows={[
            ["Eggs collected", `${formatQuantity(total)} base units`],
            ["Opening stock", `${formatQuantity(openingTotal)} base units`],
            ["Collection records", String(rows.length)],
          ]} />
          <SectionTitle title="Collection history" detail="Product, quantity, date and block when assigned" />
          {rows.map((row) => (
            <RecordCard
              key={row.id}
              title={productNames.get(row.product_id) ?? "Egg product"}
              subtitle={`${formatDateLabel(row.collected_at)} · ${row.entry_type === "opening_stock" ? "Opening stock" : "Collection"}`}
              rows={[
                ["Quantity", `${formatQuantity(row.quantity)} recorded`],
                ["Base quantity", `${formatQuantity(row.quantity_in_base_unit)} base units`],
                [
                  "Block",
                  row.block_id
                    ? blockNames.get(row.block_id) ?? "Block not available"
                    : "Not assigned",
                ],
                ...(row.notes ? [["Notes", row.notes] as [string, string]] : []),
              ]}
            />
          ))}
          {!rows.length ? <EmptyState message="No egg collections in this period." /> : null}
        </>
      ) : null}
    </>
  );
}

function FlockReportDetail() {
  const { user } = useAuth();
  const selectedFarm = useFarm().selectedFarm;
  const farmId = selectedFarm?.id;
  const query = useChickenSaleOptions(user?.id, farmId);
  const batches = query.data?.batches ?? [];
  const blocks = query.data?.blocks ?? [];
  const flockCount = batches.reduce(
    (total, batch) => total + batch.stocks.reduce((sum, stock) => sum + stock.quantity, 0),
    0,
  );

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
                { label: "Active batches", value: batches.length, kind: "number" },
                { label: "Housing blocks", value: blocks.length, kind: "number" },
              ],
              sheets: [
                {
                  name: "Flock by batch",
                  columns: [
                    { key: "batch", label: "Batch" },
                    { key: "type", label: "Chicken type" },
                    { key: "hatchDate", label: "Hatch date", kind: "date" },
                    { key: "block", label: "Block" },
                    { key: "birds", label: "Birds", kind: "number" },
                  ],
                  rows: batches.flatMap((batch) =>
                    batch.stocks.length
                      ? batch.stocks.map((stock) => ({
                          batch: batch.name,
                          type: batch.chicken_type,
                          hatchDate: batch.hatch_date,
                          block: stock.block_name,
                          birds: stock.quantity,
                        }))
                      : [{
                          batch: batch.name,
                          type: batch.chicken_type,
                          hatchDate: batch.hatch_date,
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
          <SummaryCard rows={[
            ["Current flock", `${formatQuantity(flockCount)} birds`],
            ["Active batches", String(batches.length)],
            ["Housing blocks", String(blocks.length)],
          ]} />
          <SectionTitle title="Current flock by batch" detail="Birds shown by batch and current block allocation" />
          {batches.map((batch) => {
            const count = batch.stocks.reduce((sum, stock) => sum + stock.quantity, 0);
            return (
              <RecordCard
                key={batch.id}
                title={batch.name}
                subtitle={`${batch.chicken_type} · ${formatQuantity(count)} birds`}
                rows={[
                  ["Hatch date", batch.hatch_date ? formatDateLabel(batch.hatch_date) : "Not recorded"],
                  ...batch.stocks.map((stock) => [stock.block_name, `${formatQuantity(stock.quantity)} birds`] as [string, string]),
                ]}
              />
            );
          })}
          <SectionTitle title="Housing capacity" detail="Current occupancy compared with each block's maximum" />
          {blocks.map((block) => (
            <RecordCard
              key={block.id}
              title={block.name}
              subtitle={`${formatQuantity(block.current_chickens)} / ${formatQuantity(block.maximum_chickens)} birds`}
              rows={[
                ["Available capacity", `${formatQuantity(block.available_capacity)} birds`],
                ["Capacity used", block.maximum_chickens > 0 ? `${Math.round((block.current_chickens / block.maximum_chickens) * 100)}%` : "Not set"],
              ]}
            />
          ))}
          {!batches.length && !blocks.length ? <EmptyState message="No flock batches or housing blocks are recorded." /> : null}
        </>
      ) : null}
    </>
  );
}

function InventoryReportDetail() {
  const { user } = useAuth();
  const selectedFarm = useFarm().selectedFarm;
  const farmId = selectedFarm?.id;
  const query = useInventory(user?.id, farmId);
  const inventory = query.data;
  const balances = inventory?.items ?? [];
  const movements = inventory?.movements ?? [];
  const makeMovementRows = (records: InventoryMovement[]) =>
    records.map((movement) => ({
      date: movement.occurred_on,
      product: movement.product_name,
      productType: movement.product_type,
      movement: movement.movement_type.replaceAll("_", " "),
      change: Number(movement.quantity_delta),
      unit: movement.unit_abbreviation || movement.unit_name,
      source: movement.source_type?.replaceAll("_", " ") ?? "Inventory movement",
      notes: movement.notes,
    }));
  const movementExportData: ReportExportData = {
    title: "Stock movements report",
    farmName: selectedFarm?.name ?? "FarmTrack",
    farmLogoUri: getFarmLogoUri(selectedFarm?.settings?.logo_path),
    summary: [
      { label: "Stock movements", value: movements.length, kind: "number" },
      { label: "Date range", value: "All recorded inventory movements" },
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
        { key: "source", label: "Source" },
        { key: "notes", label: "Notes" },
      ],
      rows: makeMovementRows(movements),
    }],
  };

  async function resolveAllInventoryMovements(): Promise<ReportExportData> {
    if (!farmId) throw new Error("Select a farm before exporting this report.");
    const records: InventoryMovement[] = [];
    const limit = 200;
    let offset = 0;
    while (true) {
      const page = await getInventory(farmId, undefined, limit, offset);
      records.push(...page.movements);
      if (page.movements.length < limit) break;
      offset += page.movements.length;
    }
    return {
      ...movementExportData,
      summary: [
        { label: "Stock movements", value: records.length, kind: "number" },
        { label: "Date range", value: "All recorded inventory movements" },
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
      {inventory ? (
        <>
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
            />
            <ReportExportActions
              label="Movements"
              data={movementExportData}
              resolveData={resolveAllInventoryMovements}
            />
          </View>
          <SummaryCard rows={[
            ["Tracked products", String(balances.length)],
            ["Stock movements shown", String(movements.length)],
          ]} />
          <SectionTitle title="Current stock" detail="Available quantity for each tracked product" />
          {balances.map((item) => (
            <RecordCard
              key={item.product_id}
              title={item.product_name}
              subtitle={`${item.product_type} · ${formatQuantity(item.quantity)} ${item.unit_name}`}
              rows={[
                ["On hand", `${formatQuantity(item.quantity)} ${item.unit_name}`],
                ["Product type", item.product_type],
              ]}
              onPress={() => router.push(`/products/${item.product_id}/inventory` as Href)}
            />
          ))}
          {!balances.length ? <EmptyState message="No tracked product stock is available." /> : null}
          <SectionTitle title="Recent stock movements" detail="Latest movements recorded in inventory" />
          {movements.map((movement) => (
            <RecordCard
              key={movement.id}
              title={movement.product_name}
              subtitle={`${movement.movement_type.replaceAll("_", " ")} · ${formatDateLabel(movement.occurred_on)}`}
              rows={[
                ["Change", `${movement.quantity_delta} ${movement.unit_abbreviation || movement.unit_name}`],
                ["Recorded as", movement.source_type?.replaceAll("_", " ") ?? "Inventory movement"],
                ...(movement.notes ? [["Notes", movement.notes] as [string, string]] : []),
              ]}
            />
          ))}
          {!movements.length ? <EmptyState message="No stock movements have been recorded." /> : null}
        </>
      ) : null}
    </>
  );
}

function AccountsReportDetail() {
  const { user } = useAuth();
  const selectedFarm = useFarm().selectedFarm;
  const farmId = selectedFarm?.id;
  const currency = selectedFarm?.settings?.currency ?? "KES";
  const range = useDateRange();
  const [selectedContactId, setSelectedContactId] = useState<string>();
  const contactsQuery = useContacts(user?.id, farmId, "", undefined);
  const contacts = contactsQuery.data?.pages.flatMap((page) => page) ?? [];
  const selectedContact = contacts.find((contact) => contact.id === selectedContactId);
  const historyQuery = useContactTransactionHistory(user?.id, farmId, selectedContactId);
  const loadedHistory = historyQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const history = loadedHistory.filter((transaction) => {
    const date = transaction.transaction_date.slice(0, 10);
    return (
      (!range.fromDate || date >= range.fromDate) &&
      (!range.toDate || date <= range.toDate)
    );
  });

  return (
    <>
      <SectionTitle title="Choose an account" detail="Select a customer or supplier to view their transaction ledger" />
      {contactsQuery.isLoading ? <LoadingState label="Loading accounts" /> : null}
      {contactsQuery.isError ? <QueryError error={contactsQuery.error} retry={() => void contactsQuery.refetch()} /> : null}
      {contacts.map((contact) => {
        const selected = contact.id === selectedContactId;
        return (
          <ContactOption
            key={contact.id}
            name={contact.name}
            roles={contact.roles.join(", ")}
            selected={selected}
            onPress={() => setSelectedContactId(selected ? undefined : contact.id)}
          />
        );
      })}
      {contactsQuery.hasNextPage ? (
        <Button label={contactsQuery.isFetchingNextPage ? "Loading…" : "Load more accounts"} variant="secondary" onPress={() => void contactsQuery.fetchNextPage()} />
      ) : null}
      {!contactsQuery.isLoading && !contacts.length ? <EmptyState message="No customer or supplier accounts are recorded." /> : null}
      {selectedContact ? (
        <>
          <View style={styles.exportToolbar}>
            <ReportExportActions
              label="Export ledger"
              data={createAccountExportData(
                history,
                selectedContact.name,
                currency,
                selectedFarm?.name ?? "FarmTrack",
                selectedFarm?.settings?.logo_path,
                range.fromDate,
                range.toDate,
              )}
              resolveData={() =>
                resolveAccountExportData(
                  farmId,
                  selectedContact.id,
                  selectedContact.name,
                  currency,
                  selectedFarm?.name ?? "FarmTrack",
                  selectedFarm?.settings?.logo_path,
                  range.fromDate,
                  range.toDate,
                )
              }
            />
          </View>
          <DateRange {...range} />
          <SectionTitle title={`${selectedContact.name} ledger`} detail="Transactions and balances for this account" />
          {historyQuery.isLoading ? <LoadingState label="Loading account history" /> : null}
          {historyQuery.isError ? <QueryError error={historyQuery.error} retry={() => void historyQuery.refetch()} /> : null}
          {history.map((transaction) => (
            <RecordCard
              key={transaction.id}
              title={`${transaction.transaction_type === "sale" ? "Sale" : "Purchase"}${transaction.reference_number ? ` · ${transaction.reference_number}` : ""}`}
              subtitle={`${formatDateLabel(transaction.transaction_date)} · ${transaction.status}`}
              rows={[
                ["Items", String(transaction.item_count)],
                ["Total", money(transaction.transaction_total, currency)],
                ["Paid", money(transaction.amount_paid, currency)],
                ["Balance due", money(transaction.balance_due, currency)],
                ...(Number(transaction.credit_balance) > 0 ? [["Credit balance", money(transaction.credit_balance, currency)] as [string, string]] : []),
              ]}
              onPress={() => router.push(
                transaction.transaction_type === "sale"
                  ? `/sales/${transaction.id}`
                  : `/purchases/${transaction.id}` as Href,
              )}
            />
          ))}
          {!historyQuery.isLoading && !history.length ? <EmptyState message="No loaded transactions match this reporting period." /> : null}
          {historyQuery.hasNextPage ? (
            <Button label={historyQuery.isFetchingNextPage ? "Loading…" : "Load more transactions"} variant="secondary" onPress={() => void historyQuery.fetchNextPage()} />
          ) : null}
        </>
      ) : null}
    </>
  );
}

function createAccountExportData(
  records: ContactTransactionHistoryItem[],
  contactName: string,
  currency: string,
  farmName: string,
  logoPath: string | null | undefined,
  fromDate: string,
  toDate: string,
): ReportExportData {
  const filteredRecords = filterAccountTransactions(records, fromDate, toDate);
  return {
    title: `${contactName} account report`,
    farmName,
    farmLogoUri: getFarmLogoUri(logoPath),
    currencyCode: currency,
    fromDate,
    toDate,
    summary: [
      {
        label: "Transactions",
        value: filteredRecords.length,
        kind: "number",
      },
      {
        label: "Transaction total",
        value: filteredRecords.reduce(
          (total, item) => total + Number(item.transaction_total),
          0,
        ),
        kind: "currency",
      },
      {
        label: "Amount paid",
        value: filteredRecords.reduce((total, item) => total + Number(item.amount_paid), 0),
        kind: "currency",
      },
      {
        label: "Balance due",
        value: filteredRecords.reduce((total, item) => total + Number(item.balance_due), 0),
        kind: "currency",
      },
    ],
    sheets: [{
      name: "Account ledger",
      columns: [
        { key: "date", label: "Date", kind: "date" },
        { key: "type", label: "Transaction type" },
        { key: "reference", label: "Reference" },
        { key: "status", label: "Status" },
        { key: "items", label: "Items", kind: "number" },
        { key: "total", label: `Total (${currency})`, kind: "currency" },
        { key: "paid", label: `Paid (${currency})`, kind: "currency" },
        { key: "balance", label: `Balance due (${currency})`, kind: "currency" },
        { key: "credit", label: `Credit balance (${currency})`, kind: "currency" },
      ],
      rows: filteredRecords.map((transaction) => ({
        date: transaction.transaction_date,
        type: transaction.transaction_type,
        reference: transaction.reference_number,
        status: transaction.status,
        items: transaction.item_count,
        total: Number(transaction.transaction_total),
        paid: Number(transaction.amount_paid),
        balance: Number(transaction.balance_due),
        credit: Number(transaction.credit_balance),
      })),
      totals: true,
    }],
  };
}

async function resolveAccountExportData(
  farmId: string | undefined,
  contactId: string,
  contactName: string,
  currency: string,
  farmName: string,
  logoPath: string | null | undefined,
  fromDate: string,
  toDate: string,
): Promise<ReportExportData> {
  if (!farmId) throw new Error("Select a farm before exporting this report.");
  const records: ContactTransactionHistoryItem[] = [];
  let offset = 0;
  let totalCount = Number.POSITIVE_INFINITY;
  while (offset < totalCount) {
    const page = await getContactTransactionHistory(farmId, contactId, {
      limit: 50,
      offset,
    });
    records.push(...page.items);
    totalCount = page.total_count;
    if (page.items.length === 0) break;
    offset += page.items.length;
  }
  return createAccountExportData(
    records,
    contactName,
    currency,
    farmName,
    logoPath,
    fromDate,
    toDate,
  );
}

function filterAccountTransactions(
  records: ContactTransactionHistoryItem[],
  fromDate: string,
  toDate: string,
): ContactTransactionHistoryItem[] {
  return records.filter((transaction) => {
    const date = transaction.transaction_date.slice(0, 10);
    return (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
  });
}

function SummaryCard({
  title,
  rows,
}: {
  title?: string;
  rows: [string, string][];
}) {
  const { theme } = useTheme();
  const [primary, ...supporting] = rows;
  return (
    <Card style={styles.summaryCard}>
      {title ? (
        <View style={styles.summaryHeading}>
          <View
            style={[
              styles.summaryIcon,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <Ionicons
              name="stats-chart-outline"
              size={16}
              color={theme.primary}
            />
          </View>
          <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
            {title}
          </AppText>
        </View>
      ) : null}
      {primary ? (
        <View
          style={[
            styles.summaryPrimary,
            { backgroundColor: theme.backgroundSelected },
          ]}
        >
          <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
            {primary[0]}
          </AppText>
          <AppText
            size="title"
            weight="semibold"
            style={{ color: theme.primary }}
            numberOfLines={2}
          >
            {primary[1]}
          </AppText>
        </View>
      ) : null}
      {supporting.length ? (
        <View style={[styles.summaryDetails, { borderTopColor: theme.border }]}>
          {supporting.map(([label, value], index) => {
            const tone = getFinancialRowTone(label, value, theme);
            return (
              <View
                key={label}
                style={[
                  styles.summaryDetailRow,
                  index < supporting.length - 1
                    ? { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }
                    : null,
                ]}
              >
                {tone ? <Ionicons name={tone.icon} size={15} color={tone.color} /> : null}
                <AppText
                  size="small"
                  tone="secondary"
                  style={[styles.summaryLabel, tone ? { color: tone.color } : null]}
                  numberOfLines={2}
                >
                  {label}
                </AppText>
                <AppText
                  size="small"
                  weight="semibold"
                  style={[styles.summaryValue, tone ? { color: tone.color } : null]}
                  numberOfLines={2}
                >
                  {value}
                </AppText>
              </View>
            );
          })}
        </View>
      ) : null}
    </Card>
  );
}

function RecordCard({
  title,
  subtitle,
  rows,
  icon = "document-text-outline",
  badgeLabel,
  badgeColor,
  onPress,
}: {
  title: string;
  subtitle: string;
  rows: [string, string][];
  icon?: keyof typeof Ionicons.glyphMap;
  badgeLabel?: string;
  badgeColor?: string;
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
          <View style={[styles.recordBadge, { backgroundColor: `${badgeColor}18` }]}>
            <AppText
              size="small"
              weight="semibold"
              numberOfLines={1}
              style={{ color: badgeColor }}
            >
              {badgeLabel}
            </AppText>
          </View>
        ) : null}
        {onPress ? <Ionicons name="chevron-forward" size={18} color={theme.primary} /> : null}
      </View>
      {rows.map(([label, value]) => {
        const tone = getFinancialRowTone(label, value, theme);
        return (
          <View key={label} style={styles.recordRow}>
            {tone ? <Ionicons name={tone.icon} size={15} color={tone.color} /> : null}
            <AppText
              size="small"
              tone="secondary"
              style={[styles.recordLabel, tone ? { color: tone.color } : null]}
              numberOfLines={2}
            >
              {label}
            </AppText>
            <AppText
              size="small"
              weight={tone ? "semibold" : undefined}
              style={[styles.recordValue, tone ? { color: tone.color } : null]}
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

function ContactOption({
  name,
  roles,
  selected,
  onPress,
}: {
  name: string;
  roles: string;
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
      <View style={styles.recordTitleGroup}>
        <AppText weight="semibold">{name}</AppText>
        <AppText size="small" tone="secondary">{roles || "Contact"}</AppText>
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
  return `${currency} ${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value))}`;
}

function formatQuantity(value: number | string): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(value));
}

function formatDateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
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

function monthStart(): string {
  const date = new Date();
  date.setDate(1);
  return formatDate(date);
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
  periodCopy: { flex: 1, gap: 2 },
  dateRow: { flexDirection: "row", gap: 9 },
  dateField: { flex: 1 },
  sectionTitle: { gap: 3, marginTop: 3, paddingHorizontal: 1 },
  summaryCard: { gap: 11, borderRadius: 14, padding: 14 },
  summaryHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  summaryIcon: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  summaryPrimary: { gap: 3, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 },
  summaryDetails: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 3 },
  summaryDetailRow: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 6,
  },
  summaryLabel: { flex: 1, minWidth: 0 },
  summaryValue: { flexShrink: 1, minWidth: 0, textAlign: "right" },
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
  recordTitleGroup: { flex: 1, minWidth: 0, gap: 3 },
  recordRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  recordLabel: { flex: 1, minWidth: 0 },
  recordValue: { flex: 1, minWidth: 0, textAlign: "right" },
  contactOption: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
