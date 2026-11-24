import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateChickenPurchasePricing,
  centsToDecimal,
  formatCents,
  formatMoneyValue,
  parseMoneyToCents,
  requiresPurchaseDiscountConfirmation,
} from "../src/features/chickens/purchase-pricing.ts";

const oneChickenPerUnit = [
  {
    quantity: "400",
    unitPrice: "300.00",
    conversionFactor: 1,
  },
];

test("calculates an undiscounted purchase and effective per-chicken cost", () => {
  const pricing = calculateChickenPurchasePricing(oneChickenPerUnit, null, "");

  assert.equal(pricing.subtotalCents, 12000000n);
  assert.equal(pricing.discountCents, 0n);
  assert.equal(pricing.totalCents, 12000000n);
  assert.equal(pricing.effectiveCostPerChickenCents, 30000n);
});

test("combines quantities entered in multiple units of the same product", () => {
  const pricing = calculateChickenPurchasePricing(
    [
      { quantity: "3", unitPrice: "1200.00", conversionFactor: 12 },
      { quantity: "1", unitPrice: "100.00", conversionFactor: 1 },
    ],
    null,
    "",
  );

  assert.equal(pricing.chickenCount, 37n);
  assert.equal(pricing.subtotalCents, 370000n);
  assert.equal(pricing.effectiveCostPerChickenCents, 10000n);
});

test("applies a fixed discount and calculates the effective cost", () => {
  const pricing = calculateChickenPurchasePricing(
    oneChickenPerUnit,
    "fixed",
    "20000.00",
  );

  assert.equal(pricing.discountCents, 2000000n);
  assert.equal(pricing.totalCents, 10000000n);
  assert.equal(pricing.effectiveCostPerChickenCents, 25000n);
});

test("applies percentage discounts and rounds half up to cents", () => {
  const percentage = calculateChickenPurchasePricing(
    oneChickenPerUnit,
    "percentage",
    "5",
  );
  const halfCent = calculateChickenPurchasePricing(
    [{ quantity: "1", unitPrice: "0.05", conversionFactor: 1 }],
    "percentage",
    "10",
  );

  assert.equal(percentage.discountCents, 600000n);
  assert.equal(percentage.totalCents, 11400000n);
  assert.equal(halfCent.discountCents, 1n);
});

test("allows zero and full discounts but rejects discounts above subtotal", () => {
  const noDiscount = calculateChickenPurchasePricing(
    oneChickenPerUnit,
    "fixed",
    "0.00",
  );
  const fullDiscount = calculateChickenPurchasePricing(
    [{ quantity: "2", unitPrice: "12.34", conversionFactor: 1 }],
    "percentage",
    "100",
  );
  const excessiveDiscount = calculateChickenPurchasePricing(
    oneChickenPerUnit,
    "fixed",
    "120000.01",
  );

  assert.equal(noDiscount.totalCents, 12000000n);
  assert.equal(fullDiscount.discountCents, 2468n);
  assert.equal(fullDiscount.totalCents, 0n);
  assert.match(excessiveDiscount.error ?? "", /cannot exceed/i);
});

test("only requests negotiated discount confirmation above the 80% threshold", () => {
  assert.equal(requiresPurchaseDiscountConfirmation(10000n, 8000n), false);
  assert.equal(requiresPurchaseDiscountConfirmation(10000n, 8001n), true);
  assert.equal(requiresPurchaseDiscountConfirmation(0n, 0n), false);
});

test("rejects malformed or negative inputs and non-whole chicken conversions", () => {
  assert.equal(parseMoneyToCents("-1.00"), null);
  assert.equal(parseMoneyToCents("1.001"), null);
  assert.match(
    calculateChickenPurchasePricing(
      [{ quantity: "-1", unitPrice: "1.00", conversionFactor: 1 }],
      null,
      "",
    ).error ?? "",
    /whole numbers/i,
  );
  assert.match(
    calculateChickenPurchasePricing(
      [{ quantity: "1", unitPrice: "1.00", conversionFactor: 0.5 }],
      null,
      "",
    ).error ?? "",
    /whole chickens/i,
  );
});

test("preserves exact decimal serialization and large cent totals", () => {
  const large = calculateChickenPurchasePricing(
    [
      {
        quantity: "1000000000",
        unitPrice: "999999999.99",
        conversionFactor: 1,
      },
    ],
    null,
    "",
  );

  assert.equal(centsToDecimal(large.totalCents), "999999999990000000.00");
  assert.equal(centsToDecimal(-1234n), "-12.34");
  assert.match(formatCents(large.totalCents, "USD"), /999,999,999,990,000,000/);
});

test("formats API decimal strings without string concatenation or NaN", () => {
  assert.match(formatMoneyValue("120000.00", "USD"), /120,000\.00/);
  assert.match(formatMoneyValue("-20000.00", "USD"), /20,000\.00/);
  assert.equal(formatMoneyValue("not-a-number", "USD"), "—");
});
