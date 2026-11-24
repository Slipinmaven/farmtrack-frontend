import assert from "node:assert/strict";
import test from "node:test";

import { assistantHref } from "../src/features/assistant/assistant-links.ts";

const id = "550e8400-e29b-41d4-a716-446655440000";

test("assistantHref accepts every ID-based app route", () => {
  const routes = [
    `/blocks/${id}`,
    `/blocks/${id}/edit`,
    `/(tabs)/blocks/${id}`,
    `/(tabs)/blocks/${id}/edit`,
    `/activities/${id}`,
    `/contacts/${id}`,
    `/contacts/${id}/edit`,
    `/expenses/${id}`,
    `/products/${id}`,
    `/products/${id}/edit`,
    `/products/${id}/inventory`,
    `/purchases/${id}`,
    `/purchases/${id}/receive`,
    `/reminders/${id}`,
    `/sales/${id}`,
    `/sales/${id}/deliver`,
    `/sales/${id}/deliver-eggs`,
    `/sessions/${id}/activity`,
    `/transactions/${id}/receipt`,
    `/transactions/${id}/returns`,
    `/transactions/${id}/settlements`,
  ];

  for (const route of routes) {
    assert.equal(assistantHref(route), route, route);
  }
});

test("assistantHref accepts report routes with query filters", () => {
  const route = "/reports/sales?from_date=2026-11-01&to_date=2026-11-12";
  assert.equal(assistantHref(route), route);
});

test("assistantHref rejects malformed IDs and unknown or external routes", () => {
  assert.equal(assistantHref("/expenses/not-a-uuid"), null);
  assert.equal(assistantHref(`/products/${id}/unknown`), null);
  assert.equal(assistantHref("/unknown/path"), null);
  assert.equal(assistantHref("https://example.com"), null);
});
