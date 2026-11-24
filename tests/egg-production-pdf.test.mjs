import assert from "node:assert/strict";
import test from "node:test";

import {
  createEggProductionPdfHtml,
  formatEggsAndPacks,
  getEggProductionPdfFilename,
} from "../src/features/reports/egg-production-pdf.ts";
import { getComparisonRange } from "../src/features/reports/egg-production-comparison.ts";

const collectionRows = [
  {
    collectedAt: "2026-11-05T06:38:00Z",
    entryType: "collection",
    productId: "kienyeji",
    productName: "Kienyeji eggs",
    blockName: "Block A",
    quantity: 2,
    unitName: "Tray",
    eggs: 60,
    conversionFactor: 30,
    isBaseUnit: false,
  },
  {
    collectedAt: "2026-11-05T06:38:00Z",
    entryType: "collection",
    productId: "kienyeji",
    productName: "Kienyeji eggs",
    blockName: "Block B",
    quantity: 3,
    unitName: "Piece",
    eggs: 3,
    conversionFactor: 1,
    isBaseUnit: true,
  },
];

const openingRows = [
  {
    collectedAt: "2026-11-05T06:38:00Z",
    entryType: "opening_stock",
    productId: "grade",
    productName: "Grade eggs",
    blockName: null,
    quantity: 30,
    unitName: "Tray",
    eggs: 900,
    conversionFactor: 30,
    isBaseUnit: false,
  },
  {
    collectedAt: "2026-11-05T06:38:00Z",
    entryType: "opening_stock",
    productId: "grade",
    productName: "Grade eggs",
    blockName: null,
    quantity: 20,
    unitName: "Piece",
    eggs: 20,
    conversionFactor: 1,
    isBaseUnit: true,
  },
];

test("formats recorded collection quantities with units", () => {
  assert.equal(formatEggsAndPacks(collectionRows), "2 trays and 3 eggs");
});

test("shows the configured pack equivalent when eggs were recorded individually", () => {
  const individuallyRecordedEggs = [{
    ...collectionRows[1],
    quantity: 63,
    eggs: 63,
    availableUnits: [
      { name: "Egg", conversionFactor: 1, isBaseUnit: true },
      { name: "Tray", conversionFactor: 30, isBaseUnit: false },
    ],
  }];

  assert.equal(formatEggsAndPacks(individuallyRecordedEggs), "2 trays and 3 eggs");
});

test("uses requested date-based PDF names", () => {
  assert.equal(
    getEggProductionPdfFilename("2026-11-05", "2026-11-05", "2026-11-05"),
    "egg-production-2026-11-05",
  );
  assert.equal(
    getEggProductionPdfFilename("2026-11-01", "2026-11-05", "2026-11-05"),
    "egg-production-2026-11-01_to_2026-11-05",
  );
});

test("PDF reports collection and opening stock totals separately", () => {
  const comparison = getComparisonRange({
    period: "today",
    from: "2026-11-05",
    to: "2026-11-05",
    today: "2026-11-05",
    weekStart: 1,
  });
  const html = createEggProductionPdfHtml({
    farmName: "Green Valley Farm",
    timezone: "Africa/Nairobi",
    generatedAt: new Date("2026-11-05T09:42:00Z"),
    from: "2026-11-05",
    to: "2026-11-05",
    today: "2026-11-05",
    collections: collectionRows,
    openingStock: openingRows,
    previousCollections: [],
    comparison,
  });

  assert.match(html, /63<\/div><div class="figure-note">2 trays and 3 eggs/);
  assert.match(html, /Total collected<\/th><th class="number">63<\/th>/);
  assert.match(html, /Opening stock total<\/th><th class="number">920<\/th>/);
  assert.match(html, /Opening stock entries:<\/strong> 2 · 920 eggs · Not counted as production/);
  assert.match(html, /New: no collections in the previous period/);
  assert.match(html, /1 tray = 30 eggs/);
  assert.match(html, /Nov 5, 2026/);
  assert.doesNotMatch(html, /base units|Opening stock<\/td>.*Collections/i);
});

test("all dates omits the comparison figure", () => {
  const html = createEggProductionPdfHtml({
    farmName: "Farm",
    timezone: "Africa/Nairobi",
    generatedAt: new Date("2026-11-05T09:42:00Z"),
    from: "",
    to: "",
    today: "2026-11-05",
    collections: collectionRows,
    openingStock: openingRows,
    previousCollections: [],
    comparison: null,
  });
  assert.doesNotMatch(html, /class="figure-label">Comparison/);
});

test("product comparison includes products with no current collections", () => {
  const comparison = getComparisonRange({
    period: "today",
    from: "2026-11-05",
    to: "2026-11-05",
    today: "2026-11-05",
    weekStart: 1,
  });
  const html = createEggProductionPdfHtml({
    farmName: "Farm",
    timezone: "Africa/Nairobi",
    generatedAt: new Date("2026-11-05T09:42:00Z"),
    from: "2026-11-05",
    to: "2026-11-05",
    today: "2026-11-05",
    collections: [],
    openingStock: [],
    previousCollections: [{ ...collectionRows[1], productId: "past", productName: "Past eggs" }],
    comparison,
  });

  assert.match(html, /Past eggs/);
  assert.match(html, /▼ −3/);
});
