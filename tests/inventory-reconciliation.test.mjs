import assert from "node:assert/strict";
import test from "node:test";

import { buildInventoryReconciliation } from "../src/features/reports/inventory-reconciliation.ts";

const productId = "feed-1";

function movement(id, occurredOn, movementType, quantityDelta) {
  return {
    id,
    product_id: productId,
    product_name: "Layer Mash",
    product_type: "feed",
    quantity_delta: String(quantityDelta),
    unit_name: "kg",
    unit_abbreviation: "kg",
    movement_type: movementType,
    source_type: null,
    source_id: null,
    source_item_id: null,
    occurred_on: occurredOn,
    notes: null,
    created_at: `${occurredOn}T12:00:00Z`,
  };
}

const history = [
  movement("opening", "2026-10-31", "opening_balance", 500),
  movement("receipt", "2026-11-01", "receipt", 700),
  movement("sale", "2026-11-04", "sale", -200),
  movement("valuation", "2026-11-03", "valuation", 0),
  movement("later-adjustment", "2026-11-06", "adjustment", 15),
];

test("reconciles an inclusive date range and adjusts current stock for later movements", () => {
  const [product] = buildInventoryReconciliation(
    [{
      product_id: productId,
      product_name: "Layer Mash",
      product_type: "feed",
      unit_name: "kg",
      unit_abbreviation: "kg",
      quantity: "1015",
    }],
    history,
    "2026-11-01",
    "2026-11-04",
  );

  assert.equal(product.opening, 500);
  assert.equal(product.unit_abbreviation, "kg");
  assert.equal(product.received, 700);
  assert.equal(product.out, 200);
  assert.equal(product.expectedClosing, 1000);
  assert.equal(product.closing, 1000);
  assert.deepEqual(
    product.periodMovements.map((item) => item.id),
    ["sale", "receipt"],
  );
});

test("surfaces a closing-stock discrepancy rather than hiding it in the ledger", () => {
  const [product] = buildInventoryReconciliation(
    [{
      product_id: productId,
      product_name: "Layer Mash",
      product_type: "feed",
      unit_name: "kg",
      unit_abbreviation: "kg",
      quantity: "1300",
    }],
    history.filter((item) => item.id !== "later-adjustment"),
    "2026-11-01",
    "2026-11-04",
  );

  assert.equal(product.expectedClosing, 1000);
  assert.equal(product.closing, 1300);
  assert.equal(product.closing - product.expectedClosing, 300);
});

test("reconciles all dates when both range limits are unset", () => {
  const [product] = buildInventoryReconciliation(
    [{
      product_id: productId,
      product_name: "Layer Mash",
      product_type: "feed",
      unit_name: "kg",
      unit_abbreviation: "kg",
      quantity: "1015",
    }],
    history,
    "",
    "",
  );

  assert.equal(product.opening, 0);
  assert.equal(product.received, 1215);
  assert.equal(product.out, 200);
  assert.equal(product.expectedClosing, 1015);
  assert.equal(product.closing, 1015);
  assert.equal(product.unit_abbreviation, "kg");
  assert.deepEqual(
    product.periodMovements.map((item) => item.id),
    ["later-adjustment", "sale", "receipt", "opening"],
  );
});
