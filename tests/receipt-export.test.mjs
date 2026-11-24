import assert from "node:assert/strict";
import test from "node:test";

import { createReceiptHtml } from "../src/features/receipts/receipt-export.ts";

function createTransaction(overrides = {}) {
  const { settlements = [], ...transactionOverrides } = overrides;
  const transaction = {
    id: "transaction-1",
    reference_number: "SALE-001",
    transaction_date: "2026-11-04",
    transaction_time: "09:30:00",
    status: "completed",
    transaction_total: "200.00",
    amount_paid: "50.00",
    balance_due: "150.00",
    credit_balance: "0.00",
    discount_amount: "0.00",
    notes: null,
    items: [
      {
        id: "item-1",
        product_name: "Eggs",
        quantity: "10",
        unit_name: "tray",
        unit_price: "20.00",
        total_amount: "200.00",
        notes: null,
      },
    ],
    payments: [
      {
        id: "payment-1",
        amount: "50.00",
        payment_date: "2026-11-04",
        payment_time: "09:31:00",
        payment_method: "cash",
        reference_number: null,
      },
    ],
    ...transactionOverrides,
  };
  return {
    transactionType: "sale",
    transaction,
    settlements,
    farmName: "Farm & Co",
    counterpartyName: "Customer",
    currency: "KES",
  };
}

test("sale transaction document clearly shows a partial payment and balance", () => {
  const html = createReceiptHtml({
    ...createTransaction(),
    kind: "transaction",
  });

  assert.match(html, /SALE RECEIPT/);
  assert.match(html, /PART PAID/);
  assert.match(html, /CUSTOMER OWES/);
  assert.match(html, /KES 150\.00/);
  assert.match(html, /Thank you for your business/);
  assert.match(html, /Eggs/);
  assert.match(html, /@page \{ size: 80mm auto/);
  assert.match(html, /class="receipt"/);
  assert.match(html, /class="total-row grand-total"/);
  assert.doesNotMatch(html, /size: A4/);
  assert.doesNotMatch(html, /<table/);
});

test("sale transaction receipt records later settlement instead of implying it was paid upfront", () => {
  const context = createTransaction({
    amount_paid: "200.00",
    balance_due: "0.00",
    settlements: [
      {
        id: "settlement-1",
        transaction_id: "transaction-1",
        direction: "contact_to_farm",
        settlement_date: "2026-11-05",
        total_value: "150.00",
        reason: "Customer settled balance",
        notes: null,
        created_at: "2026-11-05T10:00:00",
        lines: [
          {
            id: "settlement-line-1",
            kind: "cash",
            value: "100.00",
            payment_method: "mpesa",
            reference_number: "MPESA-123",
          },
          {
            id: "settlement-line-2",
            kind: "goods",
            value: "50.00",
            quantity: "5",
            unit_name: "tray",
            product_name: "Eggs",
          },
        ],
      },
    ],
  });
  const html = createReceiptHtml({
    ...context,
    kind: "transaction",
  });

  assert.match(html, /SETTLED/);
  assert.match(html, /PAYMENTS RECORDED/);
  assert.match(html, /SETTLEMENTS/);
  assert.match(html, /Received from customer/);
  assert.match(html, /Nov 5, 2026/);
  assert.match(html, /Mpesa · Ref MPESA-123/);
  assert.match(html, /5 trays of Eggs/);
  assert.match(html, /NET SETTLED TO DATE/);
  assert.match(html, /KES 200\.00/);
  assert.match(html, /KES 150\.00/);
});

test("unpaid sale documents are not presented as paid receipts", () => {
  const context = createTransaction({
    amount_paid: "0.00",
    balance_due: "200.00",
    payments: [],
  });
  const html = createReceiptHtml({
    ...context,
    kind: "transaction",
  });

  assert.match(html, /UNPAID/);
  assert.match(html, /No payments recorded/);
  assert.match(html, /KES 200\.00/);
});

test("transaction documents label purchase credits separately", () => {
  const context = createTransaction({
    status: "completed",
    amount_paid: "250.00",
    balance_due: "0.00",
    credit_balance: "50.00",
  });
  const html = createReceiptHtml({
    ...context,
    transactionType: "purchase",
    counterpartyName: "Supplier",
    kind: "transaction",
  });

  assert.match(html, /PURCHASE RECORD/);
  assert.match(html, /SUPPLIER CREDIT/);
  assert.match(html, /KES 50\.00/);
});

test("payment receipts confirm a sale payment and identify the current balance", () => {
  const context = createTransaction();
  const html = createReceiptHtml({
    ...context,
    kind: "payment",
    paymentNumber: 1,
    payment: context.transaction.payments[0],
  });

  assert.match(html, /PAYMENT RECEIPT/);
  assert.match(html, /AMOUNT RECEIVED/);
  assert.match(html, /KES 50\.00/);
  assert.match(html, /CUSTOMER OWES/);
});

test("purchase payment records are clearly identified as farm-generated", () => {
  const context = createTransaction();
  const html = createReceiptHtml({
    ...context,
    transactionType: "purchase",
    kind: "payment",
    paymentNumber: 1,
    payment: context.transaction.payments[0],
  });

  assert.match(html, /PAYMENT RECORD/);
  assert.match(html, /AMOUNT PAID/);
  assert.match(html, /Farm-generated record; not supplier-issued/);
  assert.match(html, /does not replace a receipt from the supplier/);
});

test("receipt content is HTML escaped before rendering", () => {
  const context = createTransaction();
  context.farmName = "Farm <script>alert(1)</script>";
  context.transaction.items[0].product_name = "<img src=x>";
  const html = createReceiptHtml({
    ...context,
    kind: "transaction",
  });

  assert.match(html, /Farm &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.doesNotMatch(html, /<img src=x>/);
});
