import type { Href } from "expo-router";
import type { ProfitabilityReport } from "@/features/management/api";

export type ReportName = "sales" | "expenses" | "production" | "flock" | "inventory" | "accounts";
export type Period = "today" | "week" | "month" | "custom";

export function formatCurrencyAmount(value: number, currency: string): string {
  const sign = value < 0 ? "− " : "";
  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  return `${sign}${currency} ${formatted}`;
}

export function formatDateLabel(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

export function formatQuantity(value: string | number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(
    Number(value),
  );
}

export function formatQuantityWithUnit(
  quantity: string | number,
  abbreviation: string | null | undefined,
  unitName: string,
): string {
  const unit =
    abbreviation && abbreviation.length <= 4 && !/\s/.test(abbreviation)
      ? abbreviation
      : unitName;
  const label =
    unit !== unitName || Number(quantity) === 1 || /s$/i.test(unit)
      ? unit
      : `${unit}s`;
  return `${formatQuantity(quantity)} ${label}`;
}

export function formatMovementTypes(types: ("sale" | "consumption" | "loss")[]): string {
  const labels = types.map((type) =>
    type === "sale" ? "sold" : type === "consumption" ? "used" : "lost",
  );
  if (labels.length < 2) return labels[0] ?? "moved";
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

export function profitabilityExportRows(report: ProfitabilityReport) {
  return [
    ...(report.egg_production_zero_cost_confirmed
      ? [{
          line: "Egg production cost confirmation",
          amount: 0,
          treatment: "User confirmed no feed or other production cost for this report period.",
        }]
      : []),
    {
      line: "Profitability status",
      amount:
        !report.complete || report.net_profit === null
          ? null
          : Number(report.net_profit),
      treatment: report.complete && report.net_profit !== null
        ? Number(report.net_profit) < 0
          ? "Loss"
          : Number(report.net_profit) > 0
            ? "Profit"
            : "Break-even"
        : report.incompleteness_reasons.join(" "),
    },
    {
      line: "Recognized gross sales",
      amount: Number(report.gross_sales),
      treatment: "Product sales recognized in the reporting period; chicken sales follow delivery date and other product sales use transaction date.",
    },
    { line: "Delivered return credits", amount: -Number(report.sales_credits), treatment: "Deducted from sales revenue." },
    { line: "Net revenue", amount: Number(report.net_revenue), treatment: "Gross sales less delivered return credits." },
    { line: "Cost of goods sold", amount: -Number(report.cost_of_goods_sold), treatment: "Weighted-average carrying cost of sold stock." },
    { line: "Unallocated consumption", amount: -Number(report.unallocated_consumption_expense), treatment: "Consumption not allocated to egg production." },
    { line: "Consumption cost allocated to egg stock", amount: Number(report.egg_production_cost_allocated), treatment: "Informational only; included in stock cost and COGS when those eggs are sold." },
    { line: "Operating expenses", amount: -Number(report.operating_expenses), treatment: "Excludes expenses linked to inventory purchases." },
    { line: "Inventory losses", amount: -Number(report.inventory_losses), treatment: "Recorded stock losses valued at cost." },
    { line: "Customer cash refunds", amount: Number(report.customer_cash_refunds_excluded), treatment: "Cash-flow/balance item; not a second revenue deduction." },
    { line: "Supplier cash refunds", amount: Number(report.supplier_cash_refunds_excluded), treatment: "Cash-flow item; not recognized as income." },
    { line: "Supplier return credits", amount: Number(report.supplier_return_credits_excluded), treatment: "Reverses stock cost, not operating income." },
  ];
}

export function today(): string {
  const date = new Date();
  return formatDate(date);
}

export function monthStart(): string {
  const date = new Date();
  date.setDate(1);
  return formatDate(date);
}

export function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatDate(date);
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function reportHref(report: ReportName, fromDate: string, toDate: string): Href {
  const query = new URLSearchParams({
    from_date: fromDate,
    to_date: toDate,
  });
  return `/reports/${report}?${query.toString()}` as Href;
}
