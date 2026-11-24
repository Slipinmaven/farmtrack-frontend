import assert from "node:assert/strict";
import test from "node:test";

import { parseAssistantMarkdownTable } from "../src/features/assistant/assistant-markdown.ts";

test("parses a Markdown table into mobile-friendly record rows", () => {
  const lines = [
    "Recorded expenses:",
    "",
    "| Name | Category | Date | Amount | Paid | Balance Due |",
    "|---|---|---|---:|---:|---:|",
    "| Layer Mash | Feed and nutrition | 2026-11-09 | 6000.00 | 4000.00 | 2000.00 |",
    "| Delivery | Transport | 2026-11-09 | 300.00 | 300.00 | 0.00 |",
    "",
    "The total is 6300.00.",
  ];

  assert.deepEqual(parseAssistantMarkdownTable(lines, 2), {
    headers: ["Name", "Category", "Date", "Amount", "Paid", "Balance Due"],
    rows: [
      ["Layer Mash", "Feed and nutrition", "2026-11-09", "6000.00", "4000.00", "2000.00"],
      ["Delivery", "Transport", "2026-11-09", "300.00", "300.00", "0.00"],
    ],
    nextIndex: 6,
  });
});

test("leaves non-table text and separator-like prose untouched", () => {
  assert.equal(
    parseAssistantMarkdownTable(["Name | amount", "This is not a table"], 0),
    null,
  );
  assert.equal(
    parseAssistantMarkdownTable(["| Name | Amount |", "| --- | --- |"], 0),
    null,
  );
});
