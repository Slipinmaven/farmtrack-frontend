import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMovementTypes,
  formatQuantityWithUnit,
  profitabilityExportRows,
  reportHref,
} from "../src/features/reports/overview/overview-utils.ts";

test("formats quantities with the preferred abbreviation and readable plural labels", () => {
  assert.equal(formatQuantityWithUnit("2", "kg", "kilograms"), "2 kg");
  assert.equal(formatQuantityWithUnit(1, null, "bird"), "1 bird");
  assert.equal(formatQuantityWithUnit(2, null, "bird"), "2 birds");
});

test("formats inventory movement types for one or multiple categories", () => {
  assert.equal(formatMovementTypes(["sale"]), "sold");
  assert.equal(formatMovementTypes(["sale", "consumption", "loss"]), "sold, used or lost");
  assert.equal(formatMovementTypes([]), "moved");
});

test("exports an unverified profitability result and an explicit zero-cost confirmation", () => {
  const report = {
    egg_production_zero_cost_confirmed: true,
    complete: false,
    net_profit: null,
    incompleteness_reasons: ["Uncosted stock remains."],
    gross_sales: "100",
    sales_credits: "5",
    net_revenue: "95",
    cost_of_goods_sold: "20",
    unallocated_consumption_expense: "3",
    egg_production_cost_allocated: "2",
    operating_expenses: "10",
    inventory_losses: "1",
    customer_cash_refunds_excluded: "4",
    supplier_cash_refunds_excluded: "6",
    supplier_return_credits_excluded: "7",
  };

  const rows = profitabilityExportRows(report);

  assert.equal(rows[0].line, "Egg production cost confirmation");
  assert.equal(rows[1].line, "Profitability status");
  assert.equal(rows[1].amount, null);
  assert.equal(rows[1].treatment, "Uncosted stock remains.");
  assert.equal(rows.find((row) => row.line === "Delivered return credits").amount, -5);
});

test("builds report navigation with the selected inclusive date filters", () => {
  assert.equal(
    reportHref("sales", "2026-04-01", "2026-04-30"),
    "/reports/sales?from_date=2026-04-01&to_date=2026-04-30",
  );
});
