import type { ChickenPaymentMethod } from "@/features/chickens/api";
import type { TransactionSettlement } from "@/features/management/api";

export type ReceiptTransaction = {
  id: string;
  reference_number: string | null;
  transaction_date: string;
  transaction_time?: string | null;
  status: string;
  updated_at?: string;
  transaction_total: number | string;
  amount_paid: number | string;
  balance_due: number | string;
  credit_balance: number | string;
  discount_amount?: number | string;
  discount_reason?: string | null;
  notes?: string | null;
  items: {
    id: string;
    product_name?: string | null;
    quantity: number | string;
    unit_name?: string | null;
    unit_price: number | string;
    total_amount: number | string;
    notes?: string | null;
  }[];
  payments: ReceiptPayment[];
};

export type ReceiptPayment = {
  id?: string;
  amount: number | string;
  payment_date?: string;
  payment_time?: string | null;
  payment_method: ChickenPaymentMethod;
  reference_number: string | null;
  notes?: string | null;
};

export type ReceiptContext = {
  transactionType: "sale" | "purchase";
  transaction: ReceiptTransaction;
  settlements: TransactionSettlement[];
  farmName: string;
  farmLocation?: string | null;
  farmPhone?: string | null;
  farmEmail?: string | null;
  counterpartyName: string | null;
  currency: string;
};

export type ReceiptDocument =
  | (ReceiptContext & { kind: "transaction" })
  | (ReceiptContext & {
      kind: "payment";
      payment: ReceiptPayment;
      paymentNumber: number;
    });

export function createReceiptHtml(document: ReceiptDocument): string {
  const isSale = document.transactionType === "sale";
  const transaction = document.transaction;
  const reference = transaction.reference_number || transaction.id;
  const isPayment = document.kind === "payment";
  const isCancelled = transaction.status.toLowerCase() === "cancelled";
  const balanceDue = Number(transaction.balance_due);
  const creditBalance = Number(transaction.credit_balance);
  const isCredit = creditBalance > 0;
  const hasSettlements = document.settlements.length > 0;
  const status = isCancelled
    ? "CANCELLED"
    : isCredit
      ? "CREDIT"
      : balanceDue > 0
        ? Number(transaction.amount_paid) > 0
          ? hasSettlements
            ? "PART SETTLED"
            : "PART PAID"
          : "UNPAID"
        : hasSettlements
          ? "SETTLED"
          : "PAID";
  const balanceLabel = isCredit
    ? isSale
      ? "CUSTOMER CREDIT"
      : "SUPPLIER CREDIT"
    : isSale
      ? "CUSTOMER OWES"
      : "OWED TO SUPPLIER";
  const itemRows = transaction.items
    .map((item) => {
      const quantity = `${formatQuantity(item.quantity)}${item.unit_name ? ` ${item.unit_name}` : ""}`;
      return `<div class="item">
        <div class="item-heading"><strong>${escapeHtml(item.product_name || "Item")}</strong><strong>${escapeHtml(formatMoney(item.total_amount, document.currency))}</strong></div>
        <div class="item-meta">${escapeHtml(quantity)} × ${escapeHtml(formatMoney(item.unit_price, document.currency))}</div>
        ${item.notes ? `<div class="item-note">${escapeHtml(item.notes)}</div>` : ""}
      </div>`;
    })
    .join("");
  const paymentRows = [...transaction.payments]
    .sort(
      (first, second) =>
        (first.payment_date ?? transaction.transaction_date).localeCompare(
          second.payment_date ?? transaction.transaction_date,
        ) ||
        (first.payment_time ?? "").localeCompare(second.payment_time ?? "") ||
        (first.id ?? "").localeCompare(second.id ?? ""),
    )
    .map(
      (entry) => `<div class="payment-row">
        <span>${escapeHtml(formatDate(entry.payment_date ?? transaction.transaction_date))}${entry.payment_time ? ` ${escapeHtml(entry.payment_time.slice(0, 5))}` : ""} · ${escapeHtml(labelize(entry.payment_method))}${entry.reference_number ? ` · ${escapeHtml(entry.reference_number)}` : ""}</span>
        <strong>${escapeHtml(formatMoney(entry.amount, document.currency))}</strong>
      </div>`,
    )
    .join("");
  const settlementRows = [...document.settlements]
    .sort(
      (first, second) =>
        first.settlement_date.localeCompare(second.settlement_date) ||
        first.created_at.localeCompare(second.created_at) ||
        first.id.localeCompare(second.id),
    )
    .map((settlement) => {
      const directionLabel =
        document.transactionType === "sale"
          ? settlement.direction === "contact_to_farm"
            ? "Received from customer"
            : "Returned to customer"
          : settlement.direction === "farm_to_contact"
            ? "Paid to supplier"
            : "Received from supplier";
      const lineRows = settlement.lines
        .map((line) => {
          const amount = formatMoney(line.value, document.currency);
          if (line.kind === "cash") {
            const method = line.payment_method
              ? `Cash · ${labelize(line.payment_method)}`
              : "Cash";
            return `<div class="settlement-detail"><span>${escapeHtml(method)}${line.reference_number ? ` · Ref ${escapeHtml(line.reference_number)}` : ""}</span><strong>${escapeHtml(amount)}</strong></div>`;
          }
          if (line.kind === "goods") {
            const quantityValue = Number(line.quantity ?? 0);
            const quantity = line.quantity
              ? `${formatQuantity(line.quantity)} ${pluralizeUnit(
                  line.unit_name ?? line.base_unit_name ?? "unit",
                  quantityValue,
                )} of `
              : "";
            const description = `${quantity}${line.product_name ?? "goods"}`;
            return `<div class="settlement-detail"><span>${escapeHtml(description)}</span><strong>${escapeHtml(amount)}</strong></div>`;
          }
          return `<div class="settlement-detail"><span>${escapeHtml(line.description ?? "Service")}</span><strong>${escapeHtml(amount)}</strong></div>`;
        })
        .join("");
      return `<div class="settlement-row">
        <div class="settlement-heading"><strong>${escapeHtml(directionLabel)}</strong><strong>${escapeHtml(formatMoney(settlement.total_value, document.currency))}</strong></div>
        <div class="settlement-date">${escapeHtml(formatDate(settlement.settlement_date))}</div>
        ${lineRows || `<div class="item-note">${escapeHtml(settlement.reason || "Settlement details were not recorded.")}</div>`}
        ${settlement.notes ? `<div class="item-note">${escapeHtml(settlement.notes)}</div>` : ""}
      </div>`;
    })
    .join("");
  const docNumber =
    isPayment
      ? document.payment.reference_number ||
        document.payment.id ||
        `${reference}-PAY-${document.paymentNumber}`
      : reference;
  const documentTitle = isPayment
    ? isSale
      ? "PAYMENT RECEIPT"
      : "PAYMENT RECORD"
    : isSale
      ? "SALE RECEIPT"
      : "PURCHASE RECORD";
  const storeDetails = [
    document.farmLocation,
    document.farmPhone,
    document.farmEmail,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => `<div>${escapeHtml(value)}</div>`)
    .join("");
  const metaRows = `
    <div class="meta-row"><span>Receipt no.</span><strong>${escapeHtml(docNumber)}</strong></div>
    <div class="meta-row"><span>Date</span><strong>${escapeHtml(formatDate(isPayment ? document.payment.payment_date : transaction.transaction_date))}${isPayment && document.payment.payment_time ? ` ${escapeHtml(document.payment.payment_time.slice(0, 5))}` : ""}</strong></div>
    <div class="meta-row"><span>${isSale ? "Customer" : "Supplier"}</span><strong>${escapeHtml(document.counterpartyName || "Walk-in")}</strong></div>`;
  const amountSection = isPayment
    ? createPaymentDetails(document, balanceLabel)
    : `<section class="amounts">
        <div class="section-label">ITEMS</div>
        ${itemRows || `<div class="empty">No items recorded</div>`}
        ${Number(transaction.discount_amount ?? 0) > 0 ? `<div class="total-row"><span>Discount${transaction.discount_reason ? ` · ${escapeHtml(transaction.discount_reason)}` : ""}</span><strong>− ${escapeHtml(formatMoney(transaction.discount_amount ?? 0, document.currency))}</strong></div>` : ""}
        <div class="total-row grand-total"><span>TOTAL</span><strong>${escapeHtml(formatMoney(transaction.transaction_total, document.currency))}</strong></div>
        ${transaction.payments.length ? `<div class="section-label payment-label">PAYMENTS RECORDED</div>${paymentRows}` : ""}
        ${transaction.payments.length ? "" : `<div class="empty">${hasSettlements ? "No separate payment recorded" : "No payments recorded"}</div>`}
        ${hasSettlements ? `<div class="section-label payment-label">SETTLEMENTS</div>${settlementRows}` : ""}
        <div class="total-row"><span>${hasSettlements ? "NET SETTLED TO DATE" : "PAID TO DATE"}</span><strong>${escapeHtml(formatMoney(transaction.amount_paid, document.currency))}</strong></div>
        ${balanceDue > 0 ? `<div class="balance-box due"><span>${escapeHtml(balanceLabel)}</span><strong>${escapeHtml(formatMoney(transaction.balance_due, document.currency))}</strong></div>` : ""}
        ${isCredit ? `<div class="balance-box credit"><span>${escapeHtml(balanceLabel)}</span><strong>${escapeHtml(formatMoney(transaction.credit_balance, document.currency))}</strong></div>` : ""}
      </section>`;
  const footer = isPayment
    ? isSale
      ? "Payment received by the farm. Thank you."
      : "Farm-generated payment record · Not supplier-issued"
    : isSale
      ? "Thank you for your business!"
      : "FarmTrack purchase record · Keep for your records";

  return `<!doctype html>
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(documentTitle)} ${escapeHtml(docNumber)}</title>
    <style>
      @page { size: 80mm auto; margin: 3mm; }
      * { box-sizing: border-box; }
      html { width: 80mm; background: #fff; }
      body { width: 74mm; margin: 0 auto; padding: 5mm 1mm; color: #171717; background: #fff; font: 11px "Courier New", monospace; line-height: 1.45; }
      .receipt-export-root { width: 74mm; margin: 0 auto; padding: 5mm 1mm; color: #171717; background: #fff; font: 11px "Courier New", monospace; line-height: 1.45; }
      .receipt { width: 100%; }
      .brand { margin: 0; text-align: center; font: 700 19px Arial, sans-serif; letter-spacing: .3px; }
      .store-details { margin-top: 4px; color: #444; text-align: center; font-size: 10px; line-height: 1.5; }
      .document-title { margin: 13px 0 4px; text-align: center; font: 700 13px Arial, sans-serif; letter-spacing: 1.4px; }
      .status { display: table; margin: 6px auto 10px; padding: 3px 9px; border: 1px solid #222; border-radius: 20px; font: 700 9px Arial, sans-serif; letter-spacing: 1px; }
      .rule { margin: 10px 0; border-top: 1px dashed #555; }
      .meta-row, .item-heading, .total-row, .payment-row, .balance-box { display: flex; justify-content: space-between; gap: 8px; }
      .meta-row { padding: 2px 0; }
      .meta-row span, .item-meta, .item-note { color: #555; }
      .meta-row strong { text-align: right; }
      .section-label { margin: 12px 0 5px; font: 700 9px Arial, sans-serif; letter-spacing: 1.3px; }
      .item { padding: 6px 0; border-bottom: 1px dotted #999; }
      .item-heading strong:first-child { flex: 1; }
      .item-heading strong:last-child { white-space: nowrap; }
      .item-meta, .item-note { margin-top: 2px; font-size: 10px; }
      .total-row { padding: 4px 0; }
      .total-row strong, .payment-row strong { text-align: right; white-space: nowrap; }
      .grand-total { margin-top: 4px; padding: 8px 0; border-top: 1px solid #222; border-bottom: 1px solid #222; font: 700 14px Arial, sans-serif; }
      .payment-label { padding-top: 3px; border-top: 1px dashed #555; }
      .payment-row { padding: 3px 0; font-size: 10px; }
      .payment-row span { flex: 1; }
      .settlement-row { padding: 5px 0; border-bottom: 1px dotted #999; }
      .settlement-heading, .settlement-detail { display: flex; justify-content: space-between; gap: 8px; }
      .settlement-heading strong:first-child, .settlement-detail span { flex: 1; }
      .settlement-heading strong:last-child, .settlement-detail strong { text-align: right; white-space: nowrap; }
      .settlement-detail span { overflow-wrap: anywhere; }
      .settlement-date { margin-top: 2px; color: #555; font-size: 10px; }
      .settlement-detail { padding-top: 3px; font-size: 10px; }
      .amount-due { margin: 9px 0; padding: 9px 7px; background: #f0f0f0; text-align: center; }
      .amount-due span { display: block; font-size: 9px; letter-spacing: 1px; }
      .amount-due strong { display: block; margin-top: 3px; font: 700 20px Arial, sans-serif; }
      .balance-box { margin-top: 5px; padding: 5px 0; border-top: 1px dotted #777; font-weight: 700; }
      .notes { margin-top: 9px; padding-top: 7px; border-top: 1px dashed #555; font-size: 10px; }
      .footer { margin-top: 13px; text-align: center; font-size: 10px; line-height: 1.5; }
      .footer small { display: block; margin-top: 5px; color: #555; font-size: 9px; }
      .empty { padding: 6px 0; color: #555; }
      @media screen { body { box-shadow: 0 3px 18px #0002; } }
      @media print { html, body, .receipt-export-root { width: 74mm; } body, .receipt-export-root { padding: 0; } }
    </style></head>
    <body>
      <main class="receipt">
        <header>
          <h1 class="brand">${escapeHtml(document.farmName || "FarmTrack")}</h1>
          ${storeDetails ? `<div class="store-details">${storeDetails}</div>` : ""}
          <div class="document-title">${escapeHtml(documentTitle)}</div>
          ${!isPayment ? `<div class="status">${escapeHtml(status)}</div>` : ""}
        </header>
        <div class="rule"></div>
        ${metaRows}
        <div class="rule"></div>
        ${amountSection}
        ${transaction.notes ? `<div class="notes"><strong>NOTE</strong><br>${escapeHtml(transaction.notes)}</div>` : ""}
        <footer class="footer">
          <strong>${escapeHtml(footer)}</strong>
          <small>${isPayment && !isSale ? "This record does not replace a receipt from the supplier." : `Generated ${escapeHtml(new Date().toLocaleString())}`}</small>
        </footer>
      </main>
    </body></html>`;
}

function createPaymentDetails(
  document: Extract<ReceiptDocument, { kind: "payment" }>,
  balanceLabel: string,
): string {
  const { payment, transaction, currency, transactionType } = document;
  const hasBalance =
    Number(transaction.balance_due) > 0 ||
    Number(transaction.credit_balance) > 0;
  const currentBalance = Number(transaction.balance_due) > 0
    ? transaction.balance_due
    : transaction.credit_balance;
  return `<section class="amounts">
    <div class="section-label">${transactionType === "sale" ? "AMOUNT RECEIVED" : "AMOUNT PAID"}</div>
    <div class="amount-due"><span>${transactionType === "sale" ? "PAID" : "PAYMENT RECORDED"}</span><strong>${escapeHtml(formatMoney(payment.amount, currency))}</strong></div>
    <div class="total-row"><span>Method</span><strong>${escapeHtml(labelize(payment.payment_method))}</strong></div>
    ${payment.reference_number ? `<div class="total-row"><span>Payment ref.</span><strong>${escapeHtml(payment.reference_number)}</strong></div>` : ""}
    ${hasBalance ? `<div class="balance-box"><span>${escapeHtml(balanceLabel)}</span><strong>${escapeHtml(formatMoney(currentBalance, currency))}</strong></div>` : ""}
    ${payment.notes ? `<div class="notes">${escapeHtml(payment.notes)}</div>` : ""}
    ${transactionType === "sale" ? "" : `<div class="notes">Farm-generated record; not supplier-issued.</div>`}
    <div class="notes"><span>Transaction</span><br><strong>${escapeHtml(transaction.reference_number || transaction.id)}</strong></div>
  </section>`;
}

function formatMoney(value: number | string, currency: string): string {
  return `${currency} ${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)}`;
}

function formatQuantity(value: number | string): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(
    Number(value) || 0,
  );
}

function formatDate(value?: string): string {
  if (!value) return "Date not recorded";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function labelize(value: string): string {
  return value
    .split(/[_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function pluralizeUnit(unit: string, quantity: number): string {
  const normalized = unit.trim();
  const lowerCaseUnit = normalized.toLocaleLowerCase();
  if (
    Math.abs(quantity) === 1 ||
    /^(kg|g|mg|l|ml|cm|m|mm)$/.test(lowerCaseUnit) ||
    lowerCaseUnit.endsWith("s")
  ) {
    return normalized;
  }
  if (/[sxz]$|(?:ch|sh)$/.test(lowerCaseUnit)) return `${normalized}es`;
  if (/[^aeiou]y$/.test(lowerCaseUnit)) {
    return `${normalized.slice(0, -1)}ies`;
  }
  return `${normalized}s`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}
