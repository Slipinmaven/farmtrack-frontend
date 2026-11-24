import assert from "node:assert/strict";
import test from "node:test";

import { zonedDateTimeToUtc } from "../src/features/dashboard/date-range.ts";

test("maps Nairobi calendar-day boundaries to UTC without shifting the sale date", () => {
  assert.equal(
    zonedDateTimeToUtc("2026-11-04", "00:00:00", "Africa/Nairobi"),
    "2026-11-03T21:00:00.000Z",
  );
  assert.equal(
    zonedDateTimeToUtc("2026-11-04", "23:59:59", "Africa/Nairobi"),
    "2026-11-04T20:59:59.000Z",
  );
});

test("uses the correct offset on both sides of a daylight-saving transition", () => {
  assert.equal(
    zonedDateTimeToUtc("2026-03-08", "00:00:00", "America/New_York"),
    "2026-03-08T05:00:00.000Z",
  );
  assert.equal(
    zonedDateTimeToUtc("2026-03-08", "23:59:59", "America/New_York"),
    "2026-03-09T03:59:59.000Z",
  );
});
