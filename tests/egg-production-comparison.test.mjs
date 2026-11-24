import assert from "node:assert/strict";
import test from "node:test";

import {
  getComparisonRange,
  getEggProductionComparisonResult,
} from "../src/features/reports/egg-production-comparison.ts";

test("today compares with yesterday", () => {
  assert.deepEqual(
    getComparisonRange({
      period: "today",
      from: "2026-11-05",
      to: "2026-11-05",
      today: "2026-11-05",
      weekStart: 1,
    }),
    {
      current: { from: "2026-11-05", to: "2026-11-05" },
      previous: { from: "2026-11-04", to: "2026-11-04" },
      label: "vs yesterday (Nov 4)",
    },
  );
});

test("week compares the same elapsed weekdays in the previous week", () => {
  assert.deepEqual(
    getComparisonRange({
      period: "week",
      from: "",
      to: "",
      today: "2026-11-05",
      weekStart: 1,
    }),
    {
      current: { from: "2026-11-02", to: "2026-11-05" },
      previous: { from: "2026-10-26", to: "2026-10-29" },
      label: "vs last week (Oct 26 – Oct 29)",
    },
  );
});

test("week start can be sunday and still map the comparable range", () => {
  assert.deepEqual(
    getComparisonRange({
      period: "week",
      from: "",
      to: "",
      today: "2026-11-05",
      weekStart: 0,
    }),
    {
      current: { from: "2026-11-01", to: "2026-11-05" },
      previous: { from: "2026-10-25", to: "2026-10-29" },
      label: "vs last week (Oct 25 – Oct 29)",
    },
  );
});

test("invalid week starts are rejected", () => {
  assert.equal(
    getComparisonRange({
      period: "week",
      from: "",
      to: "",
      today: "2026-11-05",
      weekStart: 7,
    }),
    null,
  );
});

test("month comparison clamps to the previous month's final day", () => {
  assert.deepEqual(
    getComparisonRange({
      period: "month",
      from: "",
      to: "",
      today: "2026-03-31",
      weekStart: 1,
    }),
    {
      current: { from: "2026-03-01", to: "2026-03-31" },
      previous: { from: "2026-02-01", to: "2026-02-28" },
      label: "vs last month (Feb 1 – Feb 28)",
    },
  );
});

test("month comparison supports leap-year February", () => {
  const result = getComparisonRange({
    period: "month",
    from: "",
    to: "",
    today: "2024-03-31",
    weekStart: 1,
  });
  assert.deepEqual(result?.previous, { from: "2024-02-01", to: "2024-02-29" });
});

test("custom range compares with the preceding range of equal length", () => {
  assert.deepEqual(
    getComparisonRange({
      period: "custom",
      from: "2026-11-01",
      to: "2026-11-05",
      today: "2026-11-05",
      weekStart: 1,
    }),
    {
      current: { from: "2026-11-01", to: "2026-11-05" },
      previous: { from: "2026-10-27", to: "2026-10-31" },
      label: "vs previous period (Oct 27 – Oct 31)",
    },
  );
});

test("all dates has no comparison", () => {
  assert.equal(
    getComparisonRange({
      period: "all",
      from: "",
      to: "",
      today: "2026-11-05",
      weekStart: 1,
    }),
    null,
  );
});

test("zero previous collections is reported as new without a percentage", () => {
  assert.deepEqual(getEggProductionComparisonResult(63, 0), {
    kind: "new",
    change: 63,
    percentage: null,
  });
});

test("opening stock is excluded when calculating collection comparison", () => {
  const currentRecords = [
    { entry_type: "collection", eggs: 63 },
    { entry_type: "opening_stock", eggs: 920 },
  ];
  const previousRecords = [
    { entry_type: "collection", eggs: 0 },
    { entry_type: "opening_stock", eggs: 500 },
  ];
  const collectedEggs = (records) =>
    records
      .filter((record) => record.entry_type === "collection")
      .reduce((sum, record) => sum + record.eggs, 0);

  assert.deepEqual(
    getEggProductionComparisonResult(
      collectedEggs(currentRecords),
      collectedEggs(previousRecords),
    ),
    { kind: "new", change: 63, percentage: null },
  );
});
