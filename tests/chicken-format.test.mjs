import assert from "node:assert/strict";
import test from "node:test";

import { formatChickenCount } from "../src/features/chickens/format.ts";

test("formats chicken counts with singular and plural units", () => {
  assert.equal(formatChickenCount(1), "1 chicken");
  assert.equal(formatChickenCount(0), "0 chickens");
  assert.equal(formatChickenCount(1200), "1,200 chickens");
});

test("formats bird counts with singular and plural units", () => {
  assert.equal(formatChickenCount(1, "bird"), "1 bird");
  assert.equal(formatChickenCount(2, "bird"), "2 birds");
});
