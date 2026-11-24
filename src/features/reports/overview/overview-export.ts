import { getFarmLogoUri } from "@/features/farms/logo";
import {
  getExpenseDisplayName,
  getExpenses,
  type ExpensePage,
  type ExpenseSummary,
  type InventoryOverview,
  type ProfitabilityReport,
} from "@/features/management/api";
import type { ChickenSaleOptions } from "@/features/chickens/api";
import type { ReportExportData } from "@/features/reports/export";
import { formatQuantity, profitabilityExportRows } from "@/features/reports/overview/overview-utils";
import { getSalesReport, type SalesReport } from "@/features/sales/api";

type OverviewExportInput = {
  currency: string;
  customerBalance: number;
  eggStock: { id: string; name: string; quantity: number; unit: string }[];
  expenseBalance: number;
  expenseSummary?: ExpenseSummary;
  farmLogoPath?: string | null;
  farmName?: string;
  flockCount: number;
  flock?: ChickenSaleOptions;
  fromDate: string;
  inventory?: InventoryOverview;
  profitability?: ProfitabilityReport;
  sales?: SalesReport;
  salesTotal: number;
  toDate: string;
};

export function buildOverviewExportData(input: OverviewExportInput): ReportExportData {
  const {
    currency,
    customerBalance,
    eggStock,
    expenseBalance,
    flockCount,
    fromDate,
    salesTotal,
    toDate,
  } = input;
  const inventory = input.inventory;
  const batches = input.flock?.batches ?? [];
  const blocks = input.flock?.blocks ?? [];
  return {
    title: "Farm overview report",
    farmName: input.farmName ?? "FarmTrack",
    currencyCode: currency,
    farmLogoUri: getFarmLogoUri(input.farmLogoPath),
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    summary: [
      { label: "Completed transaction value", value: salesTotal, kind: "currency" },
      {
        label: "Operating expenses",
        value: input.profitability?.operating_expenses ?? null,
        kind: "currency",
      },
      {
        label: "Accrual net profit",
        value: input.profitability?.complete &&
          input.profitability.net_profit !== null
          ? Number(input.profitability.net_profit ?? 0)
          : null,
        kind: "currency",
      },
      {
        label: "Profitability status",
        value: input.profitability?.complete &&
          input.profitability.net_profit !== null
          ? Number(input.profitability.net_profit ?? 0) < 0
            ? "Loss"
            : Number(input.profitability.net_profit ?? 0) > 0
              ? "Profit"
              : "Break-even"
          : "Incomplete",
      },
      { label: "Customer balances", value: customerBalance, kind: "currency" },
      { label: "Unpaid expenses", value: expenseBalance, kind: "currency" },
      { label: "Sales transactions", value: input.sales?.summary.transaction_count ?? 0, kind: "number" },
      { label: "Expense records", value: input.expenseSummary?.expense_count ?? 0, kind: "number" },
      { label: "Current flock", value: flockCount, kind: "number" },
    ],
    sheets: [
      {
        name: "Overview metrics",
        columns: [
          { key: "area", label: "Area" },
          { key: "metric", label: "Metric" },
          { key: "value", label: "Value", kind: "number" },
          { key: "unit", label: "Unit" },
        ],
        rows: [
          { area: "Financial", metric: "Completed transaction value", value: salesTotal, unit: currency },
              {
                area: "Financial",
                metric: "Operating expenses",
                value: input.profitability?.operating_expenses ?? null,
                unit: currency,
              },
          {
            area: "Financial",
            metric: "Accrual net profit",
            value: input.profitability?.complete &&
              input.profitability.net_profit !== null
              ? Number(input.profitability.net_profit ?? 0)
              : null,
            unit: currency,
          },
          {
            area: "Financial",
            metric: "Profitability status",
            value: input.profitability?.complete &&
              input.profitability.net_profit !== null
              ? Number(input.profitability.net_profit ?? 0) < 0
                ? "Loss"
                : Number(input.profitability.net_profit ?? 0) > 0
                  ? "Profit"
                  : "Break-even"
              : "Incomplete",
            unit: "",
          },
          { area: "Financial", metric: "Customer balances", value: customerBalance, unit: currency },
          { area: "Financial", metric: "Unpaid expenses", value: expenseBalance, unit: currency },
          { area: "Operations", metric: "Sales transactions", value: input.sales?.summary.transaction_count ?? 0, unit: "transactions" },
          { area: "Operations", metric: "Expense records", value: input.expenseSummary?.expense_count ?? 0, unit: "records" },
          { area: "Stock snapshot", metric: "Current flock", value: flockCount, unit: "birds" },
        ],
      },
      {
        name: "Expense records summary",
        columns: [
          { key: "category", label: "Category" },
          { key: "records", label: "Records", kind: "number" },
          { key: "total", label: `Total (${currency})`, kind: "currency" },
          { key: "paid", label: `Paid (${currency})`, kind: "currency" },
          { key: "balance", label: `Balance (${currency})`, kind: "currency" },
        ],
        rows: (input.expenseSummary?.categories ?? []).map((category) => ({
          category: category.name,
          records: category.expense_count,
          total: Number(category.total_amount),
          paid: Number(category.amount_paid),
          balance: Number(category.balance_due),
        })),
        totals: true,
      },
      {
        name: "Profitability bridge",
        columns: [
          { key: "line", label: "Profit and loss line" },
          { key: "amount", label: `Amount (${currency})`, kind: "currency" },
          { key: "treatment", label: "Accounting treatment" },
        ],
        rows: input.profitability
          ? profitabilityExportRows(input.profitability)
          : [],
      },
      {
        name: "Closing stock valuation",
        columns: [
          { key: "product", label: "Product" },
          { key: "type", label: "Product type" },
          { key: "quantity", label: "Closing quantity", kind: "number" },
          { key: "valuedQuantity", label: "Valued quantity", kind: "number" },
          { key: "valuedCost", label: `Carrying cost (${currency})`, kind: "currency" },
          { key: "unvaluedQuantity", label: "Unvalued quantity", kind: "number" },
        ],
        rows: (input.profitability?.closing_stock ?? []).map((item) => ({
          product: item.product_name,
          type: item.product_type,
          quantity: Number(item.quantity),
          valuedQuantity: Number(item.valued_quantity),
          valuedCost: Number(item.valued_cost),
          unvaluedQuantity: Number(item.unvalued_quantity),
        })),
        totals: true,
      },
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
      {
        name: "Egg stock",
        columns: [
          { key: "product", label: "Product" },
          { key: "quantity", label: "Available quantity", kind: "number" },
          { key: "unit", label: "Unit" },
        ],
        rows: eggStock.map((product) => ({
          product: product.name,
          quantity: product.quantity,
          unit: product.unit,
        })),
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
        rows: (input.profitability?.product_performance ?? []).map((item) => ({
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
          costStatus:
            Number(item.uncosted_quantity) > 0
              ? `Unverified: ${formatQuantity(item.uncosted_quantity)} ${item.unit_abbreviation || item.unit_name} sold without a recorded cost`
              : "Verified from recorded stock costs",
        })),
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
              "Uses the same moving weighted-average inventory ledger as the profit-and-loss calculation. Recorded purchase costs, opening-stock valuations, and allocated egg-production costs flow into this value as stock is sold.",
          },
          {
            topic: "Gross profit",
            explanation:
              "Net sales less the recorded cost of stock sold. It is before operating expenses, unallocated consumption, and inventory losses.",
          },
          {
            topic: "Unverified costs",
            explanation:
              "If stock sold has no verifiable ledger cost, its product gross profit is left blank rather than guessed. Resolve the stock-cost gap before treating that margin as final.",
          },
        ],
      },
      {
        name: "Inventory stock",
        columns: [
          { key: "product", label: "Product" },
          { key: "type", label: "Product type" },
          { key: "quantity", label: "Quantity on hand", kind: "number" },
          { key: "unit", label: "Unit" },
        ],
        rows: (inventory?.items ?? []).map((item) => ({
          product: item.product_name,
          type: item.product_type,
          quantity: Number(item.quantity),
          unit: item.unit_name,
        })),
      },
      {
        name: "Recent stock movements",
        columns: [
          { key: "date", label: "Date", kind: "date" },
          { key: "product", label: "Product" },
          { key: "type", label: "Movement type" },
          { key: "change", label: "Quantity change", kind: "number" },
          { key: "unit", label: "Unit" },
          { key: "notes", label: "Notes" },
        ],
        rows: (inventory?.movements ?? []).map((movement) => ({
          date: movement.occurred_on,
          product: movement.product_name,
          type: movement.movement_type.replaceAll("_", " "),
          change: Number(movement.quantity_delta),
          unit: movement.unit_abbreviation || movement.unit_name,
          notes: movement.notes,
        })),
      },
    ],
  };
}

export async function resolveOverviewExportData({
  farmId,
  fromDate,
  toDate,
  currency,
  overviewExportData,
}: {
  farmId?: string;
  fromDate: string;
  toDate: string;
  currency: string;
  overviewExportData: ReportExportData;
}): Promise<ReportExportData> {
  if (!farmId) throw new Error("Select a farm before exporting this report.");
  const records: SalesReport["items"] = [];
  let offset = 0;
  let report: SalesReport | undefined;
  do {
    report = await getSalesReport(farmId, {
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
      status: "completed",
      offset,
      limit: 100,
    });
    records.push(...report.items);
    offset += report.items.length;
  } while (report.items.length > 0 && offset < report.total_count);
  const expenseRecords: ExpensePage["items"] = [];
  offset = 0;
  let expensePage: ExpensePage | undefined;
  do {
    expensePage = await getExpenses(farmId, {
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
      offset,
      limit: 100,
    });
    expenseRecords.push(...expensePage.items);
    offset += expensePage.items.length;
  } while (
    expensePage.items.length > 0 &&
    offset < expensePage.total_count
  );
  return {
    ...overviewExportData,
    sheets: [
      ...overviewExportData.sheets,
      {
        name: "Sales transactions",
        columns: [
          { key: "date", label: "Date", kind: "date" },
          { key: "reference", label: "Reference" },
          { key: "customer", label: "Customer" },
          { key: "products", label: "Products sold" },
          { key: "total", label: `Sale total (${currency})`, kind: "currency" },
          { key: "paid", label: `Paid (${currency})`, kind: "currency" },
          { key: "balance", label: `Balance due (${currency})`, kind: "currency" },
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
          total: Number(item.transaction_total),
          paid: Number(item.amount_paid),
          balance: Number(item.balance_due),
        })),
        totals: true,
      },
      {
        name: "Expense records",
        columns: [
          { key: "date", label: "Date", kind: "date" },
          { key: "expense", label: "Expense" },
          { key: "category", label: "Category" },
          { key: "payee", label: "Payee" },
          { key: "total", label: `Total (${currency})`, kind: "currency" },
          { key: "paid", label: `Paid (${currency})`, kind: "currency" },
          { key: "remaining", label: `Remaining (${currency})`, kind: "currency" },
          { key: "status", label: "Payment status" },
          { key: "block", label: "Block" },
        ],
        rows: expenseRecords.map((item) => ({
          date: item.expense_date,
          expense: getExpenseDisplayName(item),
          category: item.category_name,
          payee: item.contact_name,
          total: Number(item.amount),
          paid: Number(item.amount_paid),
          remaining: Number(item.balance_due),
          status: item.payment_status,
          block: item.block_name,
        })),
        totals: true,
      },
    ],
  };
}
